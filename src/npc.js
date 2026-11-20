// The living city: road traffic on the real street graph, pedestrians,
// and the Lafayette PD (wanted level, chases, helicopter, busted).
import * as THREE from 'three';
import { Vehicle, CATALOG } from './vehicles.js';
import { makeHuman } from './player.js';
import { Actor } from './actors.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'suv', 'suv', 'pickup', 'pickup', 'taxi', 'bus', 'truck', 'muscle', 'gt', 'sportbike', 'police', 'wagon', 'classic', 'classic', 'luxury', 'compact', 'compact', 'crossover', 'crossover', 'jeep', 'hauler', 'van', 'van', 'pony', 'rally', 'roadster', 'limo', 'gtr', 'dragster'];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Traffic {
  constructor(game) {
    this.g = game; this.w = game.world;
    this.cars = []; this.peds = [];
    this.maxCars = game.quality.traffic; this.maxPeds = game.quality.peds;
    this.timer = 0;
  }

  randomNodeNear(focus, rMin, rMax) {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const n = this.w.nearestNode(focus.x + Math.sin(a) * r, focus.z + Math.cos(a) * r, 120);
      if (n >= 0 && this.w.gAdj[n].length) {
        const p = this.w.gNodes[n];
        const d = Math.hypot(p[0] - focus.x, p[2] - focus.z);
        if (d > rMin * 0.8) return n;
      }
    }
    return -1;
  }

  spawnCar(focus, near = false) {
    const a = this.randomNodeNear(focus, near ? 40 : 160, near ? 260 : 380);
    if (a < 0) return;
    const nb = this.w.gAdj[a];
    const b = nb[Math.floor(Math.random() * nb.length)];
    const id = TRAFFIC_TYPES[Math.floor(Math.random() * TRAFFIC_TYPES.length)];
    const v = new Vehicle(id, this.w);
    v.kinematic = true;
    v.headlights = this.g.env.night > 0.4;
    this.g.scene.add(v.mesh);
    const car = { v, a, b, t: 0, speed: 8, cruise: (v.spec.id === 'bus' || v.spec.id === 'truck' ? 9 : 11) + Math.random() * 5, ai: true, honk: 0, wrecked: 0 };
    this.edge(car);
    this.place(car, 0.001);
    this.cars.push(car);
  }

  edge(car) {
    const A = this.w.gNodes[car.a], B = this.w.gNodes[car.b];
    car.len = Math.max(0.1, Math.hypot(B[0] - A[0], B[2] - A[2]));
    car.twoWay = this.w.gAdj[car.b].includes(car.a);
  }

  place(car, dt) {
    const A = this.w.gNodes[car.a], B = this.w.gNodes[car.b];
    const u = Math.min(1, car.t / car.len);
    const dx = (B[0] - A[0]) / car.len, dz = (B[2] - A[2]) / car.len;
    const off = car.twoWay ? (car.v.spec.type === 'bike' ? 1.4 : 1.9) : 0;
    // right-hand traffic: the right of heading (dx,dz) is (-dz, dx)
    const x = A[0] + (B[0] - A[0]) * u - dz * off, z = A[2] + (B[2] - A[2]) * u + dx * off;
    const yl = A[1] + (B[1] - A[1]) * u;
    const v = car.v;
    const gy = this.w.groundAt(x, z, yl + 2).y;
    const yaw = Math.atan2(dx, dz);
    const d = wrap(yaw - v.yaw);
    v.yaw = dt > 0.0011 ? v.yaw + d * Math.min(1, dt * 6) : yaw;
    v.pos.set(x, gy, z);
    v.vel.set(Math.sin(v.yaw) * car.speed, 0, Math.cos(v.yaw) * car.speed);
    const n = this.w.normalAt(x, z);
    v.pitch = Math.atan2(n.x * Math.sin(v.yaw) + n.z * Math.cos(v.yaw), n.y);
  }

  nextEdge(car) {
    const nb = this.w.gAdj[car.b];
    const A = this.w.gNodes[car.a], B = this.w.gNodes[car.b];
    const hx = B[0] - A[0], hz = B[2] - A[2], hl = Math.hypot(hx, hz) || 1;
    let opts = nb.filter(n => n !== car.a);
    if (!opts.length) opts = nb;
    if (!opts.length) return false;
    // prefer going straight-ish
    let best = opts[0], bs = -Infinity;
    for (const n of opts) {
      const C = this.w.gNodes[n], cx = C[0] - B[0], cz = C[2] - B[2], cl = Math.hypot(cx, cz) || 1;
      const s = (hx * cx + hz * cz) / (hl * cl) + Math.random() * 1.2;
      if (s > bs) { bs = s; best = n; }
    }
    car.a = car.b; car.b = best; car.t = 0;
    this.edge(car);
    return true;
  }

  // disturbed cars become physics objects
  wreck(car, vel) {
    if (!car.ai) return;
    car.ai = false; car.v.kinematic = false; car.wrecked = 0;
    if (vel) car.v.vel.add(vel);
  }

  update(dt, focus, playerVeh, player) {
    const w = this.w;
    // spawn / recycle
    this.timer -= dt;
    const fast = playerVeh && playerVeh.speed > 30;
    if (this.timer <= 0) {
      this.timer = 0.25;
      if (this.cars.length < this.maxCars && !(playerVeh && playerVeh.airborne && focus.y - w.heightAt(focus.x, focus.z) > 120)) this.spawnCar(focus, this.cars.length < this.maxCars * 0.4);
      if (this.peds.length < this.maxPeds) this.spawnPed(focus);
    }
    const lim = fast ? 520 : 440;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      const d = Math.hypot(c.v.pos.x - focus.x, c.v.pos.z - focus.z);
      if ((d > lim || c.v.dead && d > 120) && c.v !== playerVeh && !c.v.driver) {
        this.g.scene.remove(c.v.mesh); this.cars.splice(i, 1);
      }
    }
    // AI driving
    for (const c of this.cars) {
      const v = c.v;
      if (v === playerVeh) continue;
      if (!c.ai) { v.update(dt, null, this.g.fx); continue; }
      let target = c.cruise;
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      const check = (px, pz, sp) => {
        const dx = px - v.pos.x, dz = pz - v.pos.z;
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && ahead < 22 && side < 2.6) target = Math.min(target, Math.max(0, (ahead - 7) * 0.9), sp + (ahead - 9) * 0.4);
      };
      // traffic lights: stop at the line on red (and on yellow if there's room)
      const sig = w.lights?.has(c.b) ? w.signal(c.b, c.a) : 0;
      if (sig) {
        const toLine = c.len - c.t - 11;
        if (toLine > -1 && (sig === 2 || toLine > c.speed * 1.2)) target = Math.min(target, Math.max(0, toLine * 0.7));
      }
      for (const o of this.cars) if (o !== c) check(o.v.pos.x, o.v.pos.z, o.ai ? o.speed : 0);
      if (playerVeh) check(playerVeh.pos.x, playerVeh.pos.z, playerVeh.speed * 0.5);
      else if (player) check(player.pos.x, player.pos.z, 0);
      for (const p of this.g.police?.units || []) check(p.v.pos.x, p.v.pos.z, p.v.speed);
      target = Math.max(0, target);
      c.speed += (target - c.speed) * Math.min(1, dt * (target < c.speed ? 4 : 1.2));
      if (c.speed < 0.3 && target < 0.5) { c.honk += dt; if (c.honk > 6 && Math.random() < 0.01) { this.g.audio?.horn(v.pos, 0.4); c.honk = 0; } }
      c.t += c.speed * dt;
      let guard = 0;
      while (c.t >= c.len && guard++ < 4) { const rest = c.t - c.len; if (!this.nextEdge(c)) break; c.t = rest; }
      this.place(c, dt);
      v.headlights = this.g.env.night > 0.4;
      v.sync(dt);
    }
    // vehicle-vs-vehicle contacts with the player's vehicle and between dynamic cars
    if (playerVeh && playerVeh.type !== 'plane' && playerVeh.type !== 'heli' || playerVeh && playerVeh.onGround) {
      for (const c of this.cars) {
        if (c.v === playerVeh) continue;
        this.contact(playerVeh, c);
      }
      for (const u of this.g.police?.units || []) this.contact(playerVeh, { v: u.v, ai: false, cop: true });
    }
    this.updatePeds(dt, focus, playerVeh);
  }

  contact(pv, c) {
    const v = c.v;
    const dx = v.pos.x - pv.pos.x, dz = v.pos.z - pv.pos.z, dy = Math.abs(v.pos.y - pv.pos.y);
    const R = pv.radius + v.radius + Math.min(pv.spec.L, v.spec.L) * 0.25;
    const d = Math.hypot(dx, dz);
    if (d > R || d < 1e-3 || dy > 2.5) return;
    const nx = dx / d, nz = dz / d;
    const rel = (pv.vel.x - v.vel.x) * nx + (pv.vel.z - v.vel.z) * nz;
    if (c.ai) this.wreck(c, null);
    const m1 = pv.spec.mass, m2 = v.spec.mass;
    const push = (R - d);
    pv.pos.x -= nx * push * m2 / (m1 + m2); pv.pos.z -= nz * push * m2 / (m1 + m2);
    v.pos.x += nx * push * m1 / (m1 + m2); v.pos.z += nz * push * m1 / (m1 + m2);
    if (rel > 0) {
      const j = rel * 1.3 / (1 / m1 + 1 / m2);
      pv.vel.x -= nx * j / m1; pv.vel.z -= nz * j / m1;
      v.vel.x += nx * j / m2; v.vel.z += nz * j / m2;
      if (!v.kinematic) v.yawRate += (Math.random() - 0.5) * rel * 0.15;
      if (rel > 3) {
        pv.damage(rel * 0.7 * Math.min(1, m2 / m1)); v.damage(rel * 1.2);
        this.g.onCrash(rel, pv.pos);
        if (c.cop || v.spec.id === 'police') this.g.police.crime(1, 'Hit a police car');
      }
    }
  }

  // ---------------------------------------------------------------- pedestrians
  spawnPed(focus) {
    const a = this.randomNodeNear(focus, 25, 160);
    if (a < 0) return;
    const nb = this.w.gAdj[a];
    const b = nb[Math.floor(Math.random() * nb.length)];
    const r = Math.random();
    const char = makeHuman(this.g.people, r < 0.3 ? 'woman' : 'man');
    const mesh = char.mesh;
    this.g.scene.add(mesh);
    const p = { char, mesh, hp: 100, a, b, t: Math.random() * 10, side: Math.random() < 0.5 ? 1 : -1, speed: 1.1 + Math.random() * 0.6, phase: Math.random() * 6, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, down: 0, flee: 0, fly: false };
    const A = this.w.gNodes[a], B = this.w.gNodes[b];
    p.len = Math.max(0.1, Math.hypot(B[0] - A[0], B[2] - A[2]));
    this.peds.push(p);
  }

  updatePeds(dt, focus, pv) {
    const w = this.w;
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (Math.hypot(p.pos.x - focus.x, p.pos.z - focus.z) > 230 && p.pos.lengthSq() > 0) { this.g.scene.remove(p.mesh); this.peds.splice(i, 1); continue; }
      const pd = Math.hypot(p.pos.x - focus.x, p.pos.z - focus.z);
      p.mesh.visible = pd < 140;
      // animation level-of-detail: far people animate at a lower rate
      p.animAcc = (p.animAcc || 0) + dt;
      const animNow = pd < 45 || (p.animAcc > (pd < 90 ? 0.05 : 0.12));
      const anim = (mode, speed) => { if (animNow && p.mesh.visible) { p.char.update(p.animAcc, mode, speed); p.animAcc = 0; } };
      if (p.fly || p.down > 0) {
        if (p.fly) {
          p.vel.y -= 9.81 * dt; p.pos.addScaledVector(p.vel, dt);
          const gy = w.groundAt(p.pos.x, p.pos.z, p.pos.y).y;
          if (p.pos.y <= gy) { p.pos.y = gy; p.fly = false; p.vel.set(0, 0, 0); }
        } else p.down -= dt;
        if (p.down <= 0 && !p.fly) { p.flee = 8; p.mesh.rotation.x = 0; p.dead = false; p.hp = Math.max(p.hp, 40); }
        anim(p.dead ? 'down' : 'down', 0);
        p.mesh.position.copy(p.pos);
        continue;
      }
      const A = w.gNodes[p.a], B = w.gNodes[p.b];
      p.cower = Math.max(0, (p.cower || 0) - dt);
      const sp = p.cower > 0 ? 0 : p.flee > 0 ? 5.5 : p.speed;
      p.flee = Math.max(0, p.flee - dt);
      p.t += sp * dt;
      if (p.t >= p.len) {
        const nb = w.gAdj[p.b].filter(n => n !== p.a);
        const nxt = nb.length ? nb[Math.floor(Math.random() * nb.length)] : p.a;
        p.a = p.b; p.b = nxt; p.t = 0;
        const A2 = w.gNodes[p.a], B2 = w.gNodes[p.b];
        p.len = Math.max(0.1, Math.hypot(B2[0] - A2[0], B2[2] - A2[2]));
        continue;
      }
      const u = p.t / p.len, dx = (B[0] - A[0]) / p.len, dz = (B[2] - A[2]) / p.len;
      const off = 6.2 * p.side;
      const x = A[0] + (B[0] - A[0]) * u + dz * off, z = A[2] + (B[2] - A[2]) * u - dx * off;
      const yl = A[1] + (B[1] - A[1]) * u;
      const res = w.collide(x, z, 0.3, yl + 0.4, yl + 1.7);
      p.pos.set(res.x, w.groundAt(res.x, res.z, yl + 2).y, res.z);
      const wy = Math.atan2(dx, dz);
      p.yaw += wrap(wy - p.yaw) * Math.min(1, dt * 5);
      p.phase += dt * sp * 2.4;
      anim(p.cower > 0 ? 'cower' : p.flee > 0 ? 'run' : 'walk', p.cower > 0 ? 0 : sp);
      p.mesh.position.copy(p.pos); p.mesh.rotation.y = p.yaw;
      // hit by the player's vehicle
      if (pv && !pv.airborne) {
        const ddx = p.pos.x - pv.pos.x, ddz = p.pos.z - pv.pos.z, d = Math.hypot(ddx, ddz);
        if (d < pv.radius + 0.9 + pv.spec.L * 0.2 && Math.abs(p.pos.y - pv.pos.y) < 2) {
          const s = pv.speed;
          if (s > 3) {
            p.fly = true; p.down = s > 14 ? 30 : 4; p.dead = s > 14;
            p.vel.copy(pv.vel).multiplyScalar(0.7); p.vel.y = 3 + s * 0.25;
            this.g.onPedHit(p, s);
          } else { p.pos.x += ddx / d * 0.5; p.pos.z += ddz / d * 0.5; p.flee = 6; }
        }
      }
    }
  }

  // a punched / kicked pedestrian staggers, falls if hurt enough, and everyone nearby panics
  hitPed(p, dx, dz, dmg) {
    p.pos.x += dx * 0.4; p.pos.z += dz * 0.4;
    if (p.hp <= 0 || dmg > 30 || Math.random() < 0.35) {
      p.fly = true; p.down = p.hp <= 0 ? 30 : 3; p.dead = p.hp <= 0;
      p.vel.set(dx * 3, 2.2, dz * 3);
      if (p.dead) this.g.hud.toast('Knocked out cold', 'warn');
    } else { p.flee = 8; }
    for (const o of this.peds) if (o !== p && o.pos.distanceTo(p.pos) < 25) { if (Math.random() < 0.3) o.cower = 3 + Math.random() * 3; else o.flee = 8; }
  }

  nearestCar(pos, r = 5) {
    let best = null, bd = r;
    for (const c of this.cars) {
      const d = c.v.pos.distanceTo(pos) - c.v.spec.L * 0.25;
      if (d < bd && !c.v.dead) { bd = d; best = c; }
    }
    return best;
  }
}

// ------------------------------------------------------------------ police
export class Police {
  constructor(game) {
    this.g = game; this.w = game.world;
    this.wanted = 0; this.units = []; this.heli = null;
    this.unseen = 0; this.seenTime = 0; this.bustTimer = 0; this.cool = 0; this.spawnT = 0; this.blockT = 12;
  }
  crime(n, why) {
    if (this.cool > 0 && n <= 1) return;
    this.cool = 3;
    const before = this.wanted;
    this.wanted = Math.min(5, this.wanted + n);
    this.unseen = 0;
    if (this.wanted > before) this.g.hud.toast(`★ ${why}`, 'warn');
  }
  clear() {
    this.wanted = 0;
    for (const c of this.foot || []) { c.mode = 'goto'; c.target = c.car ? c.car.pos : c.pos.clone(); c.hostile = false; c.leaving = true; }
    for (const u of this.units) { u.v.sirenOn = false; u.leaving = true; }
    if (this.heli) { this.g.scene.remove(this.heli.v.mesh); this.heli = null; }
  }

  spawnUnit(target) {
    const n = this.g.traffic.randomNodeNear(target, 180, 300);
    if (n < 0) return;
    const p = this.w.gNodes[n];
    const v = new Vehicle('police', this.w);
    v.place(p[0], p[2], Math.atan2(target.x - p[0], target.z - p[2]), this.w.groundAt(p[0], p[2], p[1] + 2).y);
    v.sirenOn = true; v.driver = 'ai'; v.headlights = this.g.env.night > 0.4;
    this.g.scene.add(v.mesh);
    this.units.push({ v, path: null, pathT: 0, wp: 0, stuck: 0, reverse: 0, leaving: false });
  }

  // 3+ stars: two cruisers parked across the road ahead of a fleeing driver
  roadblock(target, pv) {
    const f = pv.vel.clone().setY(0); if (f.lengthSq() < 1) return; f.normalize();
    const n = this.w.nearestNode(target.x + f.x * 170, target.z + f.z * 170, 90); if (n < 0) return;
    const p = this.w.gNodes[n], nb = this.w.gAdj[n]?.[0]; if (nb === undefined) return;
    const q = this.w.gNodes[nb], ry = Math.atan2(q[0] - p[0], q[2] - p[2]);
    if (Math.hypot(p[0] - target.x, p[2] - target.z) < 90) return;
    const gy = this.w.groundAt(p[0], p[2], p[1] + 2).y;
    for (const s of [-1, 1]) {
      const v = new Vehicle('police', this.w);
      v.place(p[0] - Math.cos(ry) * s * 2.7, p[2] + Math.sin(ry) * s * 2.7, ry + Math.PI / 2 + s * 0.3, gy);
      v.sirenOn = true; v.driver = 'ai'; v.headlights = this.g.env.night > 0.4;
      this.g.scene.add(v.mesh);
      this.units.push({ v, block: true, path: null, pathT: 0, wp: 0, stuck: 0, reverse: 0, leaving: false });
    }
    this.g.hud.toast('🚧 Police roadblock ahead!', 'warn');
  }

  update(dt, target, playerVeh, player) {
    this.cool = Math.max(0, this.cool - dt);
    if (this.wanted >= 3 && playerVeh && playerVeh.type !== 'plane' && playerVeh.type !== 'heli' && playerVeh.type !== 'boat' && playerVeh.speed > 12) {
      this.blockT -= dt;
      if (this.blockT <= 0) { this.blockT = 26; this.roadblock(target, playerVeh); }
    }
    const want = [0, 1, 2, 3, 4, 6][this.wanted];
    this.spawnT -= dt;
    if (this.wanted > 0 && this.units.filter(u => !u.leaving && !u.block).length < want && this.spawnT <= 0) { this.spawnT = 2.5; this.spawnUnit(target); }
    // helicopter at 3+ stars
    if (this.wanted >= 3 && !this.heli) {
      const v = new Vehicle('heli', this.w, { color: 0x111317 });
      v.kinematic = true; v.rotorSpeed = 1; v.driver = 'ai';
      v.place(target.x + 300, target.z + 300, 0, target.y + 120);
      const spot = new THREE.SpotLight(0xffffff, 0, 260, 0.22, 0.5, 1.2);
      spot.position.set(0, 0.8, 1.5); v.mesh.add(spot); v.mesh.add(spot.target);
      this.g.scene.add(v.mesh);
      this.heli = { v, spot, t: 0 };
    }
    if (this.heli) {
      const h = this.heli, v = h.v;
      h.t += dt;
      const gx = target.x + Math.sin(h.t * 0.25) * 70, gz = target.z + Math.cos(h.t * 0.25) * 70;
      const gy = Math.max(target.y, this.w.heightAt(gx, gz)) + 65;
      v.pos.x += (gx - v.pos.x) * dt * 0.6; v.pos.z += (gz - v.pos.z) * dt * 0.6; v.pos.y += (gy - v.pos.y) * dt * 0.6;
      v.yaw = Math.atan2(target.x - v.pos.x, target.z - v.pos.z); v.pitch = 0.12; v.roll = 0;
      h.spot.intensity = this.g.env.night * 900000;
      h.spot.target.position.set(0, -60, 25);
      const local = v.mesh.worldToLocal(target.clone());
      h.spot.target.position.copy(local);
      v.update(dt, null, this.g.fx);
    }
    // ground units
    let seen = false;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i], v = u.v;
      const dx = target.x - v.pos.x, dz = target.z - v.pos.z, dist = Math.hypot(dx, dz);
      if (u.footed) { seen = seen || dist < 150; continue; }
      if (u.block && !u.leaving) {
        if (dist < 150) seen = true;
        if (dist > 500) { this.g.scene.remove(v.mesh); this.units.splice(i, 1); continue; }
        v.update(dt, { throttle: 0, steer: 0, handbrake: true }, this.g.fx);
        continue;
      }
      if (u.leaving || v.dead) {
        if (dist > 350 || v.dead && dist > 150) { this.g.scene.remove(v.mesh); this.units.splice(i, 1); continue; }
        v.update(dt, { throttle: 0, steer: 0, handbrake: true }, this.g.fx);
        continue;
      }
      if (dist < 150) seen = true;
      if (dist > 700) { this.g.scene.remove(v.mesh); this.units.splice(i, 1); continue; }
      // choose a goal: direct line when close and unobstructed, else follow the road graph
      let gx = target.x, gz = target.z;
      u.pathT -= dt;
      const direct = dist < 70 && this.w.lineBlocked(v.pos.x, v.pos.y + 1, v.pos.z, target.x, target.y + 1, target.z) >= 1;
      if (!direct) {
        if (u.pathT <= 0 || !u.path) {
          u.pathT = 2;
          const a = this.w.nearestNode(v.pos.x, v.pos.z, 200), b = this.w.nearestNode(target.x, target.z, 300);
          u.path = a >= 0 && b >= 0 ? this.w.route(a, b) : null; u.wp = 1;
        }
        if (u.path && u.wp < u.path.length) {
          const n = this.w.gNodes[u.path[u.wp]];
          gx = n[0]; gz = n[2];
          if (Math.hypot(gx - v.pos.x, gz - v.pos.z) < 14) u.wp++;
        }
      }
      const want = Math.atan2(gx - v.pos.x, gz - v.pos.z);
      const diff = wrap(want - v.yaw);
      let steer = THREE.MathUtils.clamp(-diff * 2.2, -1, 1);
      let thr = dist < 12 ? (playerVeh ? Math.min(1, playerVeh.speed / 10) : 0) : Math.abs(diff) > 1.6 ? 0.4 : 1;
      if (v.speed < 1 && thr > 0.3) u.stuck += dt; else u.stuck = Math.max(0, u.stuck - dt);
      if (u.stuck > 1.8) { u.reverse = 1.4; u.stuck = 0; }
      if (u.reverse > 0) { u.reverse -= dt; thr = -1; steer = -steer; }
      v.headlights = this.g.env.night > 0.4;
      v.update(dt, { throttle: thr, steer, handbrake: Math.abs(diff) > 1.2 && v.speed > 14, boost: false }, this.g.fx);
      // cop cars bump each other / traffic
      for (const c of this.g.traffic.cars) this.g.traffic.contact(v, c);
    }
    // officers get out and chase you on foot when you're on foot nearby
    this.foot ||= [];
    if (!playerVeh && this.wanted > 0) {
      for (const u of this.units) {
        if (u.leaving || u.footed || u.v.dead) continue;
        if (u.v.pos.distanceTo(target) < 26 && u.v.speed < 6) {
          u.footed = true; u.v.sirenOn = true;
          const side = new THREE.Vector3(Math.cos(u.v.yaw), 0, -Math.sin(u.v.yaw)).multiplyScalar(1.6);
          const c = new Actor(this.g, 'cop', u.v.pos.x + side.x, u.v.pos.z + side.z, { mode: 'fight', hostile: true, hp: 120, dmg: 5, runSpeed: 6.2 });
          c.cop = true; c.car = u.v; c.unit = u;
          this.foot.push(c);
          u.parkedFor = 0;
        }
      }
    }
    for (let i = this.foot.length - 1; i >= 0; i--) {
      const c = this.foot[i];
      if (c.removed) { this.foot.splice(i, 1); continue; }
      const far = c.pos.distanceTo(target) > 160;
      if ((c.leaving && c.car && c.pos.distanceTo(c.car.pos) < 2.5) || far || (c.isDown && c.down > 50)) { c.remove(); this.foot.splice(i, 1); if (c.unit) c.unit.footed = false; continue; }
      if (playerVeh && !c.leaving && c.car && !c.car.dead) { c.mode = 'goto'; c.target = c.car.pos; c.after = 'idle'; c.onArrive = () => { c.remove(); if (c.unit) c.unit.footed = false; }; }
      else if (!playerVeh && this.wanted > 0 && c.mode !== 'fight' && !c.leaving) { c.mode = 'fight'; c.onArrive = null; }
    }
    // a unit whose officer is out on foot stays parked
    for (const u of this.units) if (u.footed) { u.v.update(dt, { throttle: 0, steer: 0, handbrake: true }, this.g.fx); }
    // busted?
    const nearCop = this.units.some(u => !u.leaving && !u.footed && u.v.pos.distanceTo(target) < (playerVeh ? 8 : 6)) || this.foot.some(c => !c.isDown && !c.leaving && c.pos.distanceTo(target) < 1.8);
    const slow = playerVeh ? playerVeh.speed < 1.5 : (player && player.down <= 0 && Math.hypot(player.vel.x, player.vel.z) < 3);
    if (this.wanted > 0 && nearCop && slow) { this.bustTimer += dt; if (this.bustTimer > (playerVeh ? 2.5 : 1.5)) { this.bustTimer = 0; this.g.busted(); } }
    else this.bustTimer = Math.max(0, this.bustTimer - dt);
    // evasion and escalation
    if (this.wanted > 0) {
      if (seen || this.heli && this.heli.v.pos.distanceTo(target) < 160) { this.unseen = 0; this.seenTime += dt; }
      else this.unseen += dt;
      if (this.seenTime > 50 && this.wanted < 5) { this.seenTime = 0; this.crime(1, 'The chase escalates'); }
      if (this.unseen > (10 + this.wanted * 4) * (1 - 0.08 * (this.g.prog?.t('crime') || 0))) { this.g.hud.toast('You lost the cops', 'good'); this.clear(); }
    }
    if (this.heli && this.wanted < 3) { this.g.scene.remove(this.heli.v.mesh); this.heli = null; }
  }

  copSees(p, r) { return this.units.some(u => u.v.pos.distanceTo(p) < r) || (this.foot || []).some(c => c.pos.distanceTo(p) < r); }
  get evading() { return this.wanted > 0 && this.unseen > 1.5; }
}
