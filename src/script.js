// A tiny mission-scripting runtime. Missions and job calls are plain async functions:
//
//   async (S) => {
//     await S.say('Dee', 'Get over here.');
//     await S.goto(x, z, { text: "Go to Dee's Garage" });
//     S.timer(90, 'Too slow');
//     ...
//   }
//
// Everything a script spawns is cleaned up when it ends, passes or fails, and waits are
// tied to game time, so pausing the game pauses the script.
import * as THREE from 'three';
import { Actor, Driver, spawnCar } from './actors.js';

export const CANCEL = Symbol('cancel');
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
const mats = {};
function beamMat(color) {
  return mats[color] ||= new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
}

export class Script {
  constructor(g, name, fn, opts = {}) {
    this.g = g; this.name = name; this.fn = fn; this.opts = opts;
    this.time = 0; this.waiters = []; this.checks = []; this.cleanups = []; this.drivers = []; this.ticks = [];
    this.dead = false; this.obj = null; this.deadline = null;
  }
  start() {
    this.g.scripts.push(this);
    this.promise = Promise.resolve().then(() => this.fn(this)).then(
      (res) => { if (!this.dead) this.end(true, res); },
      (e) => { if (e !== CANCEL) { console.error(e); if (!this.dead) this.end(false, 'Something went wrong'); } },
    );
    return this;
  }
  update(dt) {
    if (this.dead) return;
    this.time += dt;
    for (const d of this.drivers) d.update(dt);
    for (const f of this.ticks) f(dt);
    for (const c of this.checks) if (c.fn()) { this.fail(typeof c.msg === 'function' ? c.msg() : c.msg); return; }
    if (this.deadline !== null && this.time > this.deadline) { this.fail(this.deadlineMsg || 'Out of time'); return; }
    for (const w of this.waiters.slice()) if (w.fn()) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(); }
    if (this.obj) this.g.hud.objective(typeof this.obj === 'function' ? this.obj() : this.obj, this.deadline !== null ? this.deadline - this.time : null);
  }

  // ---- flow
  until(fn) { if (this.dead) return Promise.reject(CANCEL); return new Promise((res, rej) => this.waiters.push({ fn, res, rej })); }
  wait(s) { const t = this.time + s; return this.until(() => this.time >= t); }
  failIf(fn, msg) { const c = { fn, msg }; this.checks.push(c); return () => { const i = this.checks.indexOf(c); if (i >= 0) this.checks.splice(i, 1); }; }
  every(fn) { this.ticks.push(fn); }
  timer(secs, msg = 'Out of time') { this.deadline = this.time + secs; this.deadlineMsg = msg; }
  clearTimer() { this.deadline = null; }
  objective(text) { this.obj = text; }
  fail(msg) { if (!this.dead) this.end(false, msg); }

  end(ok, msg) {
    this.dead = true;
    for (const w of this.waiters) w.rej(CANCEL);
    this.waiters = [];
    for (const c of this.cleanups.reverse()) { try { c(); } catch (e) { console.warn(e); } }
    this.cleanups = [];
    const i = this.g.scripts.indexOf(this); if (i >= 0) this.g.scripts.splice(i, 1);
    this.g.setGPS(null);
    this.g.hud.say(null);
    this.opts.onEnd?.(ok, msg);
  }
  onCleanup(fn) { this.cleanups.push(fn); }

  // ---- presentation
  async say(name, text, secs) {
    secs ??= Math.min(6, 1.6 + text.length * 0.045);
    this.g.hud.say(name, text, secs + 0.3, this.opts.color);
    this.g.audio.radioChirp?.();
    await this.wait(secs);
  }
  async dialog(lines) { for (const [n, t, s] of lines) await this.say(n, t, s); }
  big(title, sub, kind) { this.g.hud.big(title, sub, kind); }
  toast(msg, kind) { this.g.hud.toast(msg, kind); }

  // ---- world helpers
  here() { return this.g.focus; }
  node(x, z) { const n = this.g.world.nearestNode(x, z, 400); const p = n >= 0 ? this.g.world.gNodes[n] : [x, 0, z]; return { x: p[0], z: p[2], y: this.g.world.groundAt(p[0], p[2], p[1] + 2).y }; }
  ll(lat, lon) { const [x, z] = this.g.world.toWorld(lat, lon); return this.node(x, z); }
  // a road point between rMin and rMax metres away
  somewhere(rMin, rMax, from = this.g.focus) {
    for (let k = 0; k < 40; k++) {
      const n = this.g.traffic.randomNodeNear(from, rMin, rMax);
      if (n >= 0) { const p = this.g.world.gNodes[n]; return { x: p[0], z: p[2], y: this.g.world.groundAt(p[0], p[2], p[1] + 2).y, node: n }; }
    }
    return this.node(from.x + rMin, from.z);
  }
  // a spot on the sidewalk next to a road point
  curb(p, side = 1) {
    const w = this.g.world, nb = w.gAdj[w.nearestNode(p.x, p.z)]?.[0];
    let ox = 6, oz = 0;
    if (nb !== undefined) { const q = w.gNodes[nb], dx = q[0] - p.x, dz = q[2] - p.z, l = Math.hypot(dx, dz) || 1; ox = dz / l * 6.2 * side; oz = -dx / l * 6.2 * side; }
    const r = w.collide(p.x + ox, p.z + oz, 0.5, p.y + 0.3, p.y + 1.8);
    return { x: r.x, z: r.z, y: w.groundAt(r.x, r.z, p.y + 2).y };
  }
  beam(x, z, { r = 4, color = 0xffd23f, h = 40, y } = {}) {
    const gy = y ?? this.g.world.groundAt(x, z).y;
    const grp = new THREE.Group(); grp.position.set(x, gy, z);
    const b = new THREE.Mesh(beamGeo, beamMat(color)); b.scale.set(r, h, r); b.position.y = h / 2; grp.add(b);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 8, 48), new THREE.MeshBasicMaterial({ color, fog: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; grp.add(ring);
    this.g.scene.add(grp);
    const rm = () => this.g.scene.remove(grp);
    this.onCleanup(rm);
    return { remove: rm, grp };
  }
  blip(get, color = '#ffd23f', size = 5) {
    const b = { get, color, size };
    this.g.blips.push(b);
    const rm = () => { const i = this.g.blips.indexOf(b); if (i >= 0) this.g.blips.splice(i, 1); };
    this.onCleanup(rm);
    return rm;
  }
  // go to a point. opts.need: 'foot' | 'car' | a vehicle | null ; opts.stop: must be (nearly) stopped
  async goto(x, z, opts = {}) {
    const r = opts.r ?? 6, g = this.g;
    if (x && typeof x === 'object') { opts = z || {}; z = x.z; x = x.x; }
    const mark = opts.noBeam ? null : this.beam(x, z, { r: Math.max(2, (opts.r ?? 6) * 0.6), color: opts.color ?? 0xffd23f, y: opts.y });
    const unb = this.blip(() => ({ x, z }), opts.blipColor || '#ffd23f', 6);
    g.setGPS(x, z, opts.route !== false);
    if (opts.text) this.objective(opts.text);
    const ok = () => {
      const P = g.focus;
      if (Math.hypot(P.x - x, P.z - z) > (opts.r ?? 6)) return false;
      if (opts.y !== undefined && Math.abs(P.y - opts.y) > 4) return false;
      if (opts.need === 'foot' && g.vehicle) return false;
      if (opts.need === 'car' && !g.vehicle) return false;
      if (opts.need && typeof opts.need === 'object' && g.vehicle !== opts.need) return false;
      if (opts.stop && g.vehicle && g.vehicle.speed > 3) return false;
      return true;
    };
    await this.until(ok);
    mark?.remove(); unb(); g.setGPS(null);
    g.audio.chime(true);
  }
  actor(kind, x, z, opts = {}) {
    const a = new Actor(this.g, kind, x, z, opts);
    if (!opts.keep) this.onCleanup(() => { if (!a.removed) a.remove(); });
    return a;
  }
  car(id, x, z, yaw = 0, opts = {}) {
    const v = spawnCar(this.g, id, x, z, yaw, opts);
    this.g.parked.push(v);
    if (!opts.keep) this.onCleanup(() => { if (this.g.vehicle !== v) { this.g.scene.remove(v.mesh); const i = this.g.parked.indexOf(v); if (i >= 0) this.g.parked.splice(i, 1); } });
    return v;
  }
  // a car with an AI at the wheel
  aiCar(id, x, z, yaw, opts = {}) {
    const v = this.car(id, x, z, yaw, opts);
    const i = this.g.parked.indexOf(v); if (i >= 0) this.g.parked.splice(i, 1);   // not enterable while driven
    const d = new Driver(this.g, v, opts);
    this.drivers.push(d);
    this.onCleanup(() => { if (this.g.vehicle !== v) this.g.scene.remove(v.mesh); });
    return d;
  }
  release(d) { const i = this.drivers.indexOf(d); if (i >= 0) this.drivers.splice(i, 1); d.v.driver = null; if (!this.g.parked.includes(d.v)) this.g.parked.push(d.v); }
  // the yaw of the road at a point
  roadYaw(p) {
    const w = this.g.world, n = w.nearestNode(p.x, p.z), nb = w.gAdj[n]?.[0];
    if (nb === undefined) return 0;
    const a = w.gNodes[n], b = w.gNodes[nb]; return Math.atan2(b[0] - a[0], b[2] - a[2]);
  }
  pay(n, why) { this.g.addMoney(n); if (why) this.toast(`${why}  +$${n.toLocaleString()}`, 'good'); }
}
