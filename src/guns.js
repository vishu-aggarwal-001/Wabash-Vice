// Firearms: bought at the pawn shop's gun counter. Aim with the camera (crosshair in the
// middle of the screen), fire with click / Q (hold for the SMG). Every shot is a crime:
// gunfire brings the police, hitting people brings more, and once you have fired a gun the
// cops draw theirs and shoot back. Purdue's campus is a gun-free zone.
import * as THREE from 'three';

export const GUNS = {
  pistol: { name: '9mm pistol', price: 900, lvl: 1, dmg: 34, rate: 0.3, mag: 15, spread: 0.012, range: 90, pellets: 1, ammo: 45, ammoPrice: 60, auto: false, twoHand: false, loud: 1 },
  smg: { name: 'Submachine gun', price: 2600, lvl: 3, dmg: 21, rate: 0.085, mag: 30, spread: 0.035, range: 70, pellets: 1, ammo: 90, ammoPrice: 120, auto: true, twoHand: true, loud: 1 },
  shotgun: { name: 'Pump shotgun', price: 3400, lvl: 4, dmg: 17, rate: 0.95, mag: 6, spread: 0.075, range: 38, pellets: 8, ammo: 24, ammoPrice: 90, auto: false, twoHand: true, loud: 1.4 },
  rifle: { name: 'Hunting rifle', price: 5800, lvl: 6, dmg: 95, rate: 1.2, mag: 5, spread: 0.002, range: 220, pellets: 1, ammo: 20, ammoPrice: 110, auto: false, twoHand: true, loud: 1.6 },
};
export const isGun = (id) => !!GUNS[id];

const M = {
  black: new THREE.MeshStandardMaterial({ color: 0x18191b, metalness: 0.7, roughness: 0.38 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4527, roughness: 0.55 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.9, roughness: 0.3 }),
};
const bx = (g, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
const cy = (g, r, l, m, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 10), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
// models: barrel along +Z, the grip (held in the hand) at the origin
export function gunMesh(id) {
  const g = new THREE.Group();
  if (id === 'pistol') { bx(g, 0.032, 0.035, 0.19, M.black, 0, 0.045, 0.06); bx(g, 0.03, 0.1, 0.045, M.grip, 0, -0.01, -0.005).rotation.x = -0.25; g.userData.muzzle = 0.16; }
  else if (id === 'smg') { bx(g, 0.045, 0.07, 0.3, M.black, 0, 0.04, 0.08); cy(g, 0.012, 0.12, M.steel, 0, 0.055, 0.29); bx(g, 0.03, 0.12, 0.04, M.black, 0, -0.03, 0.12); bx(g, 0.03, 0.09, 0.04, M.grip, 0, -0.02, -0.02); bx(g, 0.03, 0.05, 0.18, M.black, 0, 0.05, -0.14); g.userData.muzzle = 0.35; }
  else if (id === 'shotgun') { cy(g, 0.016, 0.62, M.steel, 0, 0.06, 0.3); cy(g, 0.022, 0.18, M.wood, 0, 0.03, 0.34); bx(g, 0.045, 0.07, 0.2, M.black, 0, 0.05, 0.02); bx(g, 0.04, 0.09, 0.3, M.wood, 0, 0.01, -0.22).rotation.x = 0.12; g.userData.muzzle = 0.62; }
  else if (id === 'rifle') { cy(g, 0.011, 0.6, M.steel, 0, 0.065, 0.36); bx(g, 0.04, 0.06, 0.42, M.wood, 0, 0.03, 0.06); cy(g, 0.02, 0.2, M.black, 0, 0.12, 0.08); bx(g, 0.04, 0.1, 0.28, M.wood, 0, 0.0, -0.25).rotation.x = 0.15; g.userData.muzzle = 0.66; }
  return g;
}

const ray = new THREE.Ray(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpS = new THREE.Sphere();
const PURDUE = ['Purdue University', 'Ross-Ade Stadium'];

export class Guns {
  constructor(g) {
    this.g = g;
    g.save.ammo ||= {};
    this.mag = {}; this.cool = 0; this.reload = 0; this.aimT = 0; this.campusNote = 0;
    this.held = null;      // the gun mesh in the player's hand
    this.tracers = [];
    const tg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3));
    for (let i = 0; i < 16; i++) {
      const l = new THREE.Line(tg.clone(), new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, fog: false }));
      l.frustumCulled = false; l.visible = false; g.scene.add(l); this.tracers.push({ l, t: 0 });
    }
    this.flash = new THREE.PointLight(0xffc070, 0, 14, 2); g.scene.add(this.flash);
    this.flashT = 0;
    // HUD: crosshair + ammo
    this.xhair = document.createElement('div'); this.xhair.id = 'xhair'; this.xhair.hidden = true; document.body.appendChild(this.xhair);
    this.ammoEl = document.createElement('div'); this.ammoEl.id = 'ammo'; this.ammoEl.hidden = true; document.body.appendChild(this.ammoEl);
    const css = document.createElement('style');
    css.textContent = `#xhair { position: fixed; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; z-index: 5; pointer-events: none; }
#xhair::before, #xhair::after { content: ''; position: absolute; background: rgba(255,255,255,.9); box-shadow: 0 0 2px #000; }
#xhair::before { left: 10px; top: 0; width: 2px; height: 22px; } #xhair::after { top: 10px; left: 0; height: 2px; width: 22px; }
#xhair.hit::before, #xhair.hit::after { background: #ff4040; }
#xhair.off { opacity: .35; }
#ammo { position: fixed; right: 22px; bottom: 150px; z-index: 5; font: 800 22px system-ui; color: #fff; text-shadow: 0 1px 3px #000; pointer-events: none; }
#ammo small { font-size: 14px; color: #ccc; }`;
    document.head.appendChild(css);
  }

  get id() { const w = this.g.save.weapon; return isGun(w) ? w : null; }
  get spec() { return GUNS[this.id]; }
  reserve(id) { return this.g.save.ammo[id] || 0; }
  magOf(id) { if (this.mag[id] === undefined) { const take = Math.min(GUNS[id].mag, this.reserve(id)); this.mag[id] = take; this.g.save.ammo[id] = this.reserve(id) - take; } return this.mag[id]; }
  onCampus(p) { return PURDUE.includes(this.g.world.districtAt(p.x, p.z)); }
  give(id, rounds) { this.g.save.ammo[id] = this.reserve(id) + rounds; }

  // per frame, on foot or not. Returns true when the punch input was used as a trigger.
  update(dt, inp, pressed) {
    const g = this.g, pl = g.player, id = this.id;
    this.cool -= dt; this.aimT -= dt; this.flashT -= dt;
    this.flash.intensity = this.flashT > 0 ? 40 : 0;
    for (const t of this.tracers) if (t.t > 0) { t.t -= dt; t.l.material.opacity = Math.max(0, t.t / 0.07); if (t.t <= 0) t.l.visible = false; }
    const onFoot = !g.vehicle && pl.down <= 0 && !pl.swimming && !g.paused;
    const show = !!id && onFoot;
    this.xhair.hidden = !show; this.ammoEl.hidden = !id || !!g.vehicle;
    pl.char.aiming = show && this.aimT > 0 ? 1 : 0;
    pl.char.twoHand = !!this.spec?.twoHand;
    if (!id) return false;
    const S = this.spec, campus = onFoot && this.onCampus(pl.pos);
    this.xhair.classList.toggle('off', campus);
    if (this.reload > 0) { this.reload -= dt; if (this.reload <= 0) { const take = Math.min(S.mag - this.magOf(id), this.reserve(id)); this.mag[id] += take; g.save.ammo[id] -= take; } }
    this.ammoEl.innerHTML = `${this.reload > 0 ? 'RELOADING' : this.magOf(id)} <small>/ ${this.reserve(id)}</small>`;
    if (!show) return false;
    const trig = pressed.has('punch') || (S.auto && (inp.q || g.input.mouse.down || g.input.touch.buttons.has('!punch')));
    if (!trig) return false;
    if (campus) {
      if (this.campusNote <= 0) { g.hud.toast('Purdue campus is a gun-free zone. Your gun stays holstered here.', 'warn'); this.campusNote = 4; }
      this.campusNote -= dt; return true;
    }
    if (this.cool > 0 || this.reload > 0) return true;
    if (this.magOf(id) <= 0) {
      if (this.reserve(id) > 0) { this.reload = 1.4; g.audio.oneShot?.('highpass', 0.25, 0.08, 2500); }
      else if (pressed.has('punch')) g.hud.toast(`Out of ammo — buy more at Levee Pawn & Loan`, 'warn');
      return true;
    }
    this.fire(id);
    if (this.mag[id] <= 0 && this.reserve(id) > 0) this.reload = 1.6;
    return true;
  }

  late() { const g = this.g, id = this.id; this.placeHeld(id && !g.vehicle ? id : null, g.player.char, this.aimT > 0); }
  // the gun mesh follows the hand: aimed along the camera when firing, pointing down otherwise
  placeHeld(id, char, aiming) {
    const g = this.g;
    if (this.heldId !== id) {
      if (this.held) g.scene.remove(this.held);
      this.held = id ? gunMesh(id) : null; this.heldId = id;
      if (this.held) g.scene.add(this.held);
    }
    const h = this.held; if (!h) return;
    h.visible = char.mesh.visible && !(this.onCampus(g.player.pos));
    const hand = char.bones?.RightHand; if (!hand) return;
    hand.getWorldPosition(h.position);
    if (aiming) { const d = this.aimDir(); h.lookAt(tmpV.copy(h.position).add(d)); }
    else { h.rotation.set(1.15, char.mesh.rotation.y, 0, 'YXZ'); }
  }
  aimDir() { return this.g.camera.getWorldDirection(tmpV2).clone(); }
  muzzle() { const h = this.held; return h ? h.localToWorld(new THREE.Vector3(0, 0.05, h.userData.muzzle || 0.2)) : this.g.player.pos.clone().setY(this.g.player.pos.y + 1.4); }

  fire(id) {
    const g = this.g, S = GUNS[id], pl = g.player;
    this.mag[id]--; this.cool = S.rate; this.aimT = 1.6;
    pl.yaw = g.camYaw; pl.mesh.rotation.y = pl.yaw; pl.char.aiming = 1;
    pl.char.update(0.001, pl.mode, 0); pl.char.model.updateMatrixWorld(true);
    this.placeHeld(id, pl.char, true);
    const cam = g.camera, from = this.muzzle();
    const minT = cam.position.distanceTo(pl.pos) + 0.4;
    let hitAny = false;
    for (let k = 0; k < S.pellets; k++) {
      const dir = this.aimDir();
      dir.x += (Math.random() - 0.5) * S.spread * 2; dir.y += (Math.random() - 0.5) * S.spread * 2; dir.z += (Math.random() - 0.5) * S.spread * 2; dir.normalize();
      ray.set(cam.position, dir);
      const hit = this.cast(ray, minT, S.range + minT);
      const end = hit ? hit.point : cam.position.clone().addScaledVector(dir, S.range + minT);
      // walls between the gun and the target stop the bullet
      const wt = g.world.lineBlocked(from.x, from.y, from.z, end.x, end.y, end.z);
      const stop = wt < 0.99 ? from.clone().lerp(end, wt) : end;
      this.tracer(from, stop);
      if (wt < 0.99 || !hit) { if (wt < 0.99 || end.y <= g.world.heightAt(end.x, end.z) + 0.5) g.fx.emit('dust', stop, null, 2); continue; }
      hitAny = true;
      this.damage(hit, S.dmg, dir);
    }
    if (hitAny) { this.xhair.classList.add('hit'); setTimeout(() => this.xhair.classList.remove('hit'), 90); }
    // flash, sound, panic, cops
    this.flash.position.copy(from); this.flashT = 0.05;
    g.fx.emit('spark', from, null, 3);
    g.audio.gunshot?.(S.loud);
    g.shake = Math.min(1, g.shake + 0.08 * S.loud);
    for (const p of g.traffic.peds) if (p.pos.distanceTo(pl.pos) < 70 && !p.fly) { if (Math.random() < 0.35) p.cower = 3 + Math.random() * 4; else p.flee = 10; }
    for (const a of g.actors) if (!a.hostile && !a.cop && a.mode === 'idle' && a.pos.distanceTo(pl.pos) < 40 && a.hittable && !a.label) a.mode = Math.random() < 0.5 ? 'cower' : 'flee';
    g.police.armed = true;
    if (g.jobs.active !== 'police') g.police.crime(1, 'Shots fired');
  }

  // nearest person or vehicle along the camera ray
  cast(r, tMin, tMax) {
    const g = this.g;
    let best = null, bt = tMax;
    const test = (c, rad, obj, kind) => {
      tmpS.center.copy(c); tmpS.radius = rad;
      const p = r.intersectSphere(tmpS, tmpV);
      if (!p) return;
      const t = r.origin.distanceTo(p);
      if (t > tMin && t < bt) { bt = t; best = { obj, kind, point: p.clone() }; }
    };
    const human = (o, kind) => { for (const y of [0.45, 1.0, 1.5]) test(tmpV2.set(o.pos.x, o.pos.y + y, o.pos.z), 0.3, o, kind); };
    for (const p of g.traffic.peds) if (!p.fly && !(p.down > 0)) human(p, 'ped');
    for (const a of g.actors) if (a.hittable && !a.isDown && !a.removed) human(a, a.cop ? 'cop' : 'npc');
    const cars = [...g.traffic.cars.map(c => c.v), ...g.parked, ...g.police.units.map(u => u.v)];
    for (const v of cars) {
      if (v === g.vehicle || v.dead) continue;
      const f = tmpV.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
      const L = v.spec.L || 4, W = v.spec.W || 2;
      for (const s of [-0.32, 0, 0.32]) test(new THREE.Vector3(v.pos.x + f.x * L * s, v.pos.y + 0.8, v.pos.z + f.z * L * s), W * 0.5, v, 'car');
    }
    return best;
  }

  damage(hit, dmg, dir) {
    const g = this.g, o = hit.obj, d = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / d, dz = dir.z / d;
    if (hit.kind === 'car') {
      o.damage(dmg * 0.45); g.fx.emit('spark', hit.point, null, 3);
      const cop = g.police.units.some(u => u.v === o);
      if (cop) g.police.crime(2, 'Shot at a police car');
      return;
    }
    g.fx.emit('blood', hit.point, null, 4);
    o.hp = (o.hp ?? 100) - dmg;
    if (hit.kind === 'ped') {
      g.traffic.hitPed(o, dx, dz, dmg);
      g.karma(-6);
      if (g.jobs.active !== 'police') g.police.crime(2, 'Shot a civilian');
    } else {
      o.hit(dx, dz, dmg, 2.4);
      if (hit.kind === 'cop') { g.karma(-10); g.police.crime(3, 'Shot a police officer'); }
      else if (!o.hostile && !o.label) { g.karma(-5); if (g.jobs.active !== 'police') g.police.crime(2, 'Shot a civilian'); }
    }
  }

  tracer(a, b) {
    const t = this.tracers.find(t => t.t <= 0) || this.tracers[0];
    const pos = t.l.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true;
    t.l.geometry.computeBoundingSphere();
    t.l.visible = true; t.t = 0.07; t.l.material.opacity = 1;
  }

  // police (or anyone) shooting at the player. Returns true if it hit.
  enemyShot(from, chance, dmg) {
    const g = this.g, pl = g.player, v = g.vehicle;
    const target = v ? v.pos.clone().setY(v.pos.y + 1) : pl.pos.clone().setY(pl.pos.y + 1.2);
    if (g.world.lineBlocked(from.x, from.y, from.z, target.x, target.y, target.z) < 0.97) return false;
    const hit = Math.random() < chance;
    const end = hit ? target : target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 3));
    this.tracer(from, end);
    g.fx.emit('spark', from, null, 2);
    g.audio.gunshot?.(Math.max(0.25, 1 - from.distanceTo(target) / 80));
    if (!hit) { g.fx.emit('dust', end, null, 1); return false; }
    if (v) { v.damage(dmg * 0.4); g.fx.emit('spark', end, null, 3); if (Math.random() < 0.25) pl.hurt(dmg * 0.5); }
    else { pl.hurt(dmg); g.fx.emit('blood', end, null, 3); g.shake = Math.min(1, g.shake + 0.25); }
    return true;
  }
}
