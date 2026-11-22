// Stealing cars, Criminal Russia style.
//  • Streets are lined with parked cars, all over town. Every one of them can be stolen.
//  • Walk up and press F: you smash the window (fists), pry the door (crowbar / any melee
//    weapon) or shoot the lock (gun out) and climb in. Some cars have alarms.
//  • Traffic: press F next to a car that's stopped or crawling and you yank the driver out.
//  • Anyone who sees it calls the cops (police seeing it = instant star).
import * as THREE from 'three';
import { Vehicle, byId } from './vehicles.js';
import { makeHuman } from './player.js';
import { isGun } from './guns.js';

// what people leave on the street (common cars a lot, fast cars now and then)
const PARK_TYPES = ['sedan', 'sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'hatch', 'compact', 'compact', 'suv', 'suv', 'suv', 'crossover', 'crossover', 'pickup', 'pickup', 'wagon', 'classic', 'classic', 'van', 'jeep', 'muscle', 'muscle', 'pony', 'luxury', 'luxury', 'taxi', 'rally', 'roadster', 'gt', 'gtr', 'dragster', 'supercar', 'sportbike', 'sportbike', 'dirtbike'];
const PRICEY = new Set(['luxury', 'gt', 'gtr', 'supercar', 'hyper', 'dragster', 'roadster']);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class CarTheft {
  constructor(g) {
    this.g = g; this.w = g.world;
    this.cars = [];                       // street-parked cars (locked until you break in)
    this.max = Math.min(36, Math.round(g.quality.traffic * 0.8) + 8);   // low 19 · medium 27 · high/ultra 35-36
    this.timer = 0;
    this.job = null;                      // the break-in / carjack in progress
    this.alarms = [];
    // how many streets meet at each node (no parking right at an intersection)
    const nbrs = this.w.gNodes.map(() => new Set());
    this.w.gAdj.forEach((nb, i) => { for (const j of nb) { nbrs[i].add(j); nbrs[j].add(i); } });
    this.deg = Uint8Array.from(nbrs, (s) => Math.min(255, s.size));
    // progress bar for the break-in
    const bar = this.bar = document.createElement('div');
    bar.id = 'stealbar'; bar.hidden = true;
    bar.innerHTML = '<span></span><div><i></i></div>';
    (document.getElementById('hud') || document.body).appendChild(bar);
    const css = document.createElement('style');
    css.textContent = `#stealbar { position: fixed; left: 50%; bottom: 22%; transform: translateX(-50%); z-index: 6; pointer-events: none; text-align: center; font: 800 16px system-ui; color: #fff; text-shadow: 0 1px 3px #000; }
#stealbar div { width: 240px; height: 10px; margin-top: 6px; background: rgba(0,0,0,.55); border: 1px solid rgba(255,255,255,.5); border-radius: 6px; overflow: hidden; }
#stealbar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #ffb340, #ff4d3a); }`;
    document.head.appendChild(css);
  }

  // ------------------------------------------------------------ street parking
  update(dt, focus) {
    const g = this.g;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.3;
      // most random spots are no good (intersections, driveways, walls): try a few each tick
      const few = this.cars.length < this.max * 0.5;
      for (let k = 0; k < 8 && this.cars.length < this.max; k++) if (this.spawn(focus, few ? 30 : 70, few ? 120 : 160)) break;
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      if (v === g.vehicle) continue;
      const d = Math.hypot(v.pos.x - focus.x, v.pos.z - focus.z);
      if (d > 210 || (v.dead && d > 120)) { g.scene.remove(v.mesh); this.cars.splice(i, 1); continue; }
      // shoved, shot or burning: let physics run until it comes to rest
      if (!v.kinematic && (v.speed > 0.05 || !v.onGround || v.burn > 0)) v.update(dt, null, g.fx);
      if (v.events.includes('explode')) g.handleExplosion(v);
    }
    this.updateAlarms(dt);
    this.updateJob(dt);
    if (!g.vehicle && !this.job) this.promptNearest();
  }

  spawn(focus, rMin, rMax, any = false) {
    const w = this.w, g = this.g;
    const a = g.traffic.randomNodeNear(focus, rMin, rMax);
    if (a < 0) return;
    const nb = w.gAdj[a]; if (!nb.length) return;
    const b = nb[Math.floor(Math.random() * nb.length)];
    const A = w.gNodes[a], B = w.gNodes[b];
    const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
    if (len < 12 || Math.abs(B[1] - A[1]) / len > 0.08) return;          // short or steep (ramps, bridges)
    const dx = (B[0] - A[0]) / len, dz = (B[2] - A[2]) / len;
    const rx = -dz, rz = dx;                                              // right of the heading
    const twoWay = w.gAdj[b].includes(a);
    const id = PARK_TYPES[Math.floor(Math.random() * PARK_TYPES.length)];
    const L = byId[id].L, W = byId[id].W;
    // where along the edge (away from intersections)
    const lo = this.deg[a] > 2 ? 13 : 1, hi = len - (this.deg[b] > 2 ? 13 : 1);
    if (hi - lo < L) return;
    const t = lo + L / 2 + Math.random() * (hi - lo - L);
    const cx = A[0] + dx * t, cz = A[2] + dz * t, cy = A[1] + (B[1] - A[1]) * (t / len);
    // measure the asphalt to the right, park at the kerb: inside a wide road, half on the verge on a narrow one
    let hw = 0; while (hw < 9 && w.isRoad(cx + rx * (hw + 0.5), cz + rz * (hw + 0.5))) hw += 0.5;
    const lane = twoWay ? 1.9 : 0, laneEdge = lane + 1.3;
    let off = hw - W / 2 - 0.15;                       // fully on the road, against the kerb
    if (off - W / 2 < laneEdge + 0.4) off = laneEdge + 0.45 + W / 2;   // no parking lane: half up on the kerb
    if (off + W / 2 > 5.8) return;                     // would block the pavement where people walk
    const x = cx + rx * off, z = cz + rz * off;
    if (w.isWater(x, z)) return;
    const gy = w.groundAt(x, z, cy + 2).y;
    if (Math.abs(gy - cy) > 0.8) return;
    // nothing in the way: walls, trees, other cars
    for (const k of [-0.5, 0, 0.5]) if (w.collide(x + dx * L * k, z + dz * L * k, W / 2, gy + 0.3, gy + 1.6).hit) return;
    for (const o of g.allCars()) if (Math.hypot(o.pos.x - x, o.pos.z - z) < (o.spec.L + L) / 2 + 1.2) return;
    if (!any && Math.hypot(g.player.pos.x - x, g.player.pos.z - z) < 25) return;
    if (Math.hypot(g.player.pos.x - x, g.player.pos.z - z) < 4) return;
    const probe = new Vehicle(id, w).place(x, z, Math.atan2(dx, dz), gy);
    probe.street = true; probe.locked = true;
    probe.alarm = Math.random() < (PRICEY.has(id) ? 0.85 : 0.4);
    g.scene.add(probe.mesh);
    this.cars.push(probe);
    return true;
  }
  // fill the streets around you right away (behind the loading screen / after a teleport)
  fill(focus) {
    for (let i = this.cars.length - 1; i >= 0; i--) { const v = this.cars[i]; if (v !== this.g.vehicle && v.pos.distanceTo(focus) > 210) { this.g.scene.remove(v.mesh); this.cars.splice(i, 1); } }
    for (let k = 0; k < 400 && this.cars.length < this.max; k++) this.spawn(focus, 8, 140, true);
  }

  // ------------------------------------------------------------ getting in
  // the car you'd get into with F right now, and how
  nearest() {
    const g = this.g, p = g.player.pos;
    let best = null, bd = 3.2;
    const near = (v) => {
      if (v.dead || v === g.vehicle || v.driver === 'ai' && !v.copCar) return Infinity;
      if (Math.abs(v.pos.y - p.y) > 2.5) return Infinity;
      // distance from the player to the car's box
      const f = [Math.sin(v.yaw), Math.cos(v.yaw)], dx = p.x - v.pos.x, dz = p.z - v.pos.z;
      const lf = Math.max(0, Math.abs(dx * f[0] + dz * f[1]) - v.spec.L / 2), lr = Math.max(0, Math.abs(dx * f[1] - dz * f[0]) - v.spec.W / 2);
      return Math.hypot(lf, lr);
    };
    const consider = (v, kind, extra) => { const d = near(v); if (d < bd) { bd = d; best = { v, kind, ...extra }; } };
    for (const v of this.cars) consider(v, v.locked ? 'locked' : 'open');
    for (const v of g.parked) consider(v, v.locked ? 'locked' : 'open');
    for (const c of g.traffic.cars) consider(c.v, c.ai ? 'jack' : 'open', { car: c });
    for (const u of g.police.units) if (!u.v.dead) { u.v.copCar = true; consider(u.v, 'cop', { unit: u }); }
    return best;
  }

  promptNearest() {
    const n = this.nearest(); if (!n) return;
    const name = n.v.spec.name;
    const how = n.kind === 'locked' ? (isGun(this.g.guns.id) ? 'shoot the lock' : this.tool().name) : '';
    const msg = n.kind === 'locked' ? `F  Steal the ${name}  (${how})` : n.kind === 'jack' ? (n.car.speed > 9 ? `${name} — too fast to jack` : `F  Carjack the ${name}`) : n.kind === 'cop' ? `F  Steal the police car` : `F  Get in the ${name}`;
    this.g.hud.prompt(msg);
  }

  tool() {
    const w = this.g.save.weapon;
    if (w === 'crowbar') return { name: 'crowbar the door', time: 0.7 };
    if (w && w !== 'fists' && !isGun(w)) return { name: 'smash the window', time: 0.9 };
    return { name: 'elbow the window', time: 1.5 };
  }

  // F pressed on foot. Returns true if something happened.
  tryEnter() {
    const g = this.g;
    if (this.job) return true;
    const n = this.nearest(); if (!n) return false;
    const v = n.v;
    if (n.kind === 'open') { this.claim(v); g.enterVehicle(v); return true; }
    if (n.kind === 'locked') {
      const gun = isGun(g.guns.id) && g.guns.magOf(g.guns.id) > 0;
      this.job = { kind: 'break', v, t: 0, need: gun ? 0.45 : this.tool().time, gun, hitT: 0 };
      this.bar.hidden = false;
      this.bar.querySelector('span').textContent = gun ? 'Shooting the lock…' : this.tool().name[0].toUpperCase() + this.tool().name.slice(1) + '…';
      return true;
    }
    if (n.kind === 'jack') {
      const c = n.car;
      if (c.speed > 9) { g.hud.toast('Too fast — get in front of it so it stops', 'warn'); return true; }
      g.traffic.wreck(c, null); v.vel.set(0, 0, 0); v.yawRate = 0; c.speed = 0;
      g.traffic.cars.splice(g.traffic.cars.indexOf(c), 1);
      this.job = { kind: 'jack', v, t: 0, need: 0.55 };
      this.g.player.char.punch?.();
      g.audio.punch?.(30);
      this.ejectDriver(v);
      return true;
    }
    if (n.kind === 'cop') {
      g.police.units = g.police.units.filter(u => u.v !== v);
      v.sirenOn = false; v.driver = null;
      for (const c of g.police.foot || []) if (c.car === v) c.car = null;
      g.police.crime(2, 'Stole a police car');
      this.claim(v); g.enterVehicle(v);
      return true;
    }
    return false;
  }

  updateJob(dt) {
    const j = this.job; if (!j) return;
    const g = this.g, pl = g.player, v = j.v;
    // keep facing the driver's door
    const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));   // the car's left
    const door = v.pos.clone().addScaledVector(side, v.spec.W / 2 + 0.55).addScaledVector(new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw)), v.spec.L * 0.08);
    const dist = Math.hypot(door.x - pl.pos.x, door.z - pl.pos.z);
    if (v.dead || pl.down > 0 || g.vehicle || dist > 6) { this.cancel(); return; }
    j.t += dt;
    if (j.kind === 'break') {
      pl.yaw += wrap(Math.atan2(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z) - pl.yaw) * Math.min(1, dt * 10);
      j.hitT -= dt;
      if (j.hitT <= 0) {
        j.hitT = j.gun ? 1 : 0.45;
        if (j.gun) { g.guns.fireAt(v.pos.clone().setY(v.pos.y + 0.9)); }
        else { pl.char.punch?.(); g.audio.punch?.(15); }
      }
      this.bar.querySelector('i').style.width = Math.min(100, j.t / j.need * 100) + '%';
      if (j.t >= j.need) this.finishBreak(v);
    } else if (j.kind === 'jack' && j.t >= j.need) {
      this.job = null;
      this.claim(v);
      g.police.crime(1, 'Carjacking');
      g.hud.toast(`Jacked a ${v.spec.name}`);
      g.enterVehicle(v);
    }
  }
  // movement cancels a break-in
  interrupt(inp) { if (this.job?.kind === 'break' && (Math.abs(inp.moveX) + Math.abs(inp.moveY) > 0.5 || inp.jump)) this.cancel(); }
  get busy() { return !!this.job; }
  cancel() { this.job = null; this.bar.hidden = true; }

  finishBreak(v) {
    const g = this.g;
    this.job = null; this.bar.hidden = true;
    v.locked = false;
    g.audio.oneShot?.('highpass', 0.55, 0.35, 3800); g.audio.oneShot?.('bandpass', 0.3, 0.25, 1800);   // glass
    g.fx.emit('spark', v.pos.clone().setY(v.pos.y + 1.1), null, 4);
    if (v.alarm) { this.alarms.push({ v, t: 12, k: 0 }); g.hud.toast('🚨 Car alarm! Get moving', 'warn'); }
    // witnesses
    const p = v.pos, cop = g.police.copSees?.(p, 45);
    const peds = g.traffic.peds.filter(o => !o.fly && !(o.down > 0) && o.pos.distanceTo(p) < (v.alarm ? 45 : 22));
    for (const o of peds) { if (Math.random() < 0.4) o.cower = 3 + Math.random() * 3; else o.flee = 8; }
    if (cop || (peds.length && Math.random() < (v.alarm ? 0.9 : 0.5))) g.police.crime(1, 'Grand theft auto');
    g.karma(-2);
    this.claim(v);
    g.enterVehicle(v);
    g.prog?.add?.(5);
  }

  // a stolen car stays where you leave it (it joins the regular parked cars)
  claim(v) {
    const g = this.g, i = this.cars.indexOf(v);
    if (i >= 0) this.cars.splice(i, 1);
    v.street = false; v.locked = false;
    if (!g.parked.includes(v)) g.parked.push(v);
  }

  updateAlarms(dt) {
    const g = this.g;
    for (let i = this.alarms.length - 1; i >= 0; i--) {
      const a = this.alarms[i];
      a.t -= dt; a.k -= dt;
      if (a.k <= 0) {
        a.k = 0.5;
        a.v.headlights = !a.v.headlights;
        const d = a.v.pos.distanceTo(g.focus);
        if (d < 120) g.audio.horn?.(a.v.pos, Math.max(0.05, 0.3 - d / 400));
      }
      if (a.v !== g.vehicle) a.v.sync(dt);
      if (a.t <= 0 || a.v.dead) { a.v.headlights = g.env.night > 0.35 && a.v === g.vehicle; this.alarms.splice(i, 1); }
    }
  }

  // the driver lands on the road next to the car, then runs off (or fights back)
  ejectDriver(v) {
    const g = this.g, T = g.traffic;
    const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    const r = Math.random(), female = r < 0.3;
    const char = makeHuman(g.people, female ? 'woman' : 'man');
    g.scene.add(char.mesh);
    const n = g.world.nearestNode(v.pos.x, v.pos.z, 200); if (n < 0) { g.scene.remove(char.mesh); return; }
    const nb = g.world.gAdj[n][0] ?? n, A = g.world.gNodes[n], B = g.world.gNodes[nb];
    // start where the car is along the street, so they don't pop somewhere else when they get up
    const ex = B[0] - A[0], ez = B[2] - A[2], el = Math.hypot(ex, ez) || 1;
    const along = Math.max(0, Math.min(el, ((v.pos.x - A[0]) * ex + (v.pos.z - A[2]) * ez) / el));
    const across = ((v.pos.x - A[0]) * ez - (v.pos.z - A[2]) * ex) / el;
    const p = { char, mesh: char.mesh, female, hp: 100, a: n, b: nb, t: along, side: across >= 0 ? 1 : -1, speed: 1.3, phase: 0, pos: v.pos.clone().addScaledVector(side, v.spec.W / 2 + 0.4), vel: side.clone().multiplyScalar(3.2).setY(2.2), yaw: v.yaw - Math.PI / 2, down: 1.6, flee: 10, fly: true };
    p.len = Math.max(0.1, Math.hypot(B[0] - A[0], B[2] - A[2]));
    p.pos.y += 0.6;
    char.mesh.position.copy(p.pos);
    T.peds.push(p);
  }
}
