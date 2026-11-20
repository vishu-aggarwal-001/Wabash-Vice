// Scripted people and drivers used by jobs and story missions:
// suspects who run, thugs who fight, injured people, passengers, and AI drivers
// that follow the real street graph (speeders, getaway cars, race rivals).
import * as THREE from 'three';
import { makeHuman } from './player.js';
import { Vehicle } from './vehicles.js';
import { textTexture } from './textures.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Actor {
  // modes: idle | wave | lying | cower | hands_up | flee | fight | goto | follow | wander
  constructor(g, kind, x, z, opts = {}) {
    this.g = g; this.w = g.world; this.kind = kind;
    this.char = makeHuman(g.people, kind, opts.look || {});
    this.mesh = this.char.mesh; g.scene.add(this.mesh);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? Math.random() * 6.28;
    this.hp = opts.hp ?? 100; this.down = 0; this.fly = false;
    this.mode = opts.mode || 'idle';
    this.hostile = !!opts.hostile; this.hittable = opts.hittable ?? true;
    this.runSpeed = opts.runSpeed ?? 5.8; this.dmg = opts.dmg ?? 7;
    this.atkT = 0.6; this.pending = null; this.target = null; this.name = opts.name;
    this.place(x, z);
    if (opts.label) this.setLabel(opts.label, opts.labelColor);
    g.actors.push(this);
  }
  place(x, z) { const gy = this.w.groundAt(x, z).y; this.pos.set(x, gy, z); this.mesh.position.copy(this.pos); }
  setLabel(text, color = '#ff4a4a') {
    if (this.label) this.mesh.remove(this.label);
    if (!text) { this.label = null; return; }
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(text, { size: 44, bg: 'rgba(0,0,0,0.55)', color }), depthTest: false, fog: false }));
    this.label.scale.set(3.2, 0.8, 1); this.label.position.y = 2.35; this.label.renderOrder = 10;
    this.mesh.add(this.label);
  }
  remove() {
    this.g.scene.remove(this.mesh);
    const i = this.g.actors.indexOf(this); if (i >= 0) this.g.actors.splice(i, 1);
    this.removed = true;
  }
  get isDown() { return this.fly || this.down > 0; }
  // hit by fists or a car: (dx,dz) = direction away from the attacker
  hit(dx, dz, dmg, force = 3) {
    this.pos.x += dx * 0.35; this.pos.z += dz * 0.35;
    this.onHit?.(dmg);
    if (this.hp <= 0 || dmg >= 30 || Math.random() < 0.3) {
      this.fly = true; this.down = this.hp <= 0 ? 1e9 : 2.6;
      this.vel.set(dx * force, 2 + force * 0.2, dz * force);
      if (this.hp <= 0) this.onDown?.();
    } else if (this.mode !== 'fight' && this.mode !== 'flee') {
      this.mode = this.hostile ? 'fight' : 'flee';
    }
  }

  update(dt) {
    const g = this.g, w = this.w, pl = g.player;
    const P = g.vehicle ? g.vehicle.pos : pl.pos;
    // run over by the player's vehicle
    const pv = g.vehicle;
    if (pv && !pv.airborne && !this.isDown && this.hittable) {
      const dx = this.pos.x - pv.pos.x, dz = this.pos.z - pv.pos.z, d = Math.hypot(dx, dz);
      if (d < pv.radius + 0.6 + pv.spec.L * 0.2 && Math.abs(this.pos.y - pv.pos.y) < 2 && pv.speed > 2.5) {
        const dmg = pv.speed * 4;
        this.hp -= dmg;
        this.hit(dx / (d || 1), dz / (d || 1), dmg, 2 + pv.speed * 0.5);
        g.onPedHit(this, pv.speed, true);
      }
    }
    if (this.isDown) {
      if (this.fly) {
        this.vel.y -= 9.81 * dt; this.pos.addScaledVector(this.vel, dt);
        const r = w.collide(this.pos.x, this.pos.z, 0.3, this.pos.y + 0.3, this.pos.y + 1.6); this.pos.x = r.x; this.pos.z = r.z;
        const gy = w.groundAt(this.pos.x, this.pos.z, this.pos.y).y;
        if (this.pos.y <= gy) { this.pos.y = gy; this.fly = false; this.vel.set(0, 0, 0); }
      } else this.down -= dt;
      if (!this.isDown) { this.hp = Math.max(this.hp, 25); this.onGetUp?.(); }
      this.char.update(dt, 'down', 0);
      this.mesh.position.copy(this.pos);
      return;
    }
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z, d = Math.hypot(dx, dz);
    let mx = 0, mz = 0, sp = 0, anim = null, face = null;
    switch (this.mode) {
      case 'idle': if (d < 10) face = Math.atan2(dx, dz); break;
      case 'wave': anim = 'wave'; face = Math.atan2(dx, dz); break;
      case 'aim': face = Math.atan2(dx, dz); break;   // stands and points a gun (police)
      case 'hands_up': anim = 'hands_up'; face = Math.atan2(dx, dz); break;
      case 'cower': anim = 'cower'; break;
      case 'lying': anim = 'down'; this.hittable = false; break;
      case 'sit': anim = 'sit'; break;
      case 'flee': {
        // run away from the player, steering around walls by trying a few headings
        if (!this.fleeDir || Math.random() < dt * 0.7) {
          let best = Math.atan2(-dx, -dz), bs = -Infinity;
          for (let k = 0; k < 7; k++) {
            const a = Math.atan2(-dx, -dz) + (k - 3) * 0.45 + (Math.random() - 0.5) * 0.3;
            const t = w.lineBlocked(this.pos.x, this.pos.y + 1, this.pos.z, this.pos.x + Math.sin(a) * 14, this.pos.y + 1, this.pos.z + Math.cos(a) * 14);
            const s = t * 10 - Math.abs(k - 3) * 0.8;
            if (s > bs) { bs = s; best = a; }
          }
          this.fleeDir = best;
        }
        mx = Math.sin(this.fleeDir); mz = Math.cos(this.fleeDir);
        sp = this.runSpeed * (d < 6 ? 1.05 : 1);
        if (this.tired) sp *= 0.75;
        break;
      }
      case 'fight': {
        if (d > 1.25) { mx = dx / d; mz = dz / d; sp = d > 4 ? 5.4 : 2.2; }
        face = Math.atan2(dx, dz);
        this.atkT -= dt;
        if (d < 1.6 && this.atkT <= 0 && !g.vehicle && pl.hp > 0) {
          this.atkT = 0.9 + Math.random() * 0.6;
          if (Math.random() < 0.75 ? this.char.punch() : this.char.kick()) this.pending = 0.2;
        }
        break;
      }
      case 'goto': case 'follow': case 'wander': {
        let tx, tz, stop;
        if (this.mode === 'follow') { tx = P.x; tz = P.z; stop = 2.2; }
        else { tx = this.target.x; tz = this.target.z; stop = 1.2; }
        const ex = tx - this.pos.x, ez = tz - this.pos.z, ed = Math.hypot(ex, ez);
        if (ed > stop) { mx = ex / ed; mz = ez / ed; sp = this.run ? this.runSpeed : 1.5; }
        else if (this.mode === 'goto') { this.mode = this.after || 'idle'; this.onArrive?.(); }
        break;
      }
    }
    if (this.pending !== null) {
      this.pending -= dt;
      if (this.pending <= 0) {
        this.pending = null;
        if (Math.hypot(P.x - this.pos.x, P.z - this.pos.z) < 1.8 && !g.vehicle) { pl.hurt(this.dmg); g.audio.punch(this.dmg); g.shake = Math.min(1, g.shake + 0.3); if (Math.random() < 0.12) pl.knock(new THREE.Vector3(dx / d, 0, dz / d).multiplyScalar(5)); }
      }
    }
    const k = Math.min(1, dt * 8);
    this.vel.x += (mx * sp - this.vel.x) * k; this.vel.z += (mz * sp - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const r = w.collide(this.pos.x, this.pos.z, 0.32, this.pos.y + 0.35, this.pos.y + 1.7);
    if (r.hit && this.mode === 'flee') this.fleeDir = null;
    this.pos.x = r.x; this.pos.z = r.z;
    const gy = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5).y;
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 15);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (face === null && hs > 0.3) face = Math.atan2(this.vel.x, this.vel.z);
    if (face !== null) this.yaw += wrap(face - this.yaw) * Math.min(1, dt * 10);
    this.char.aiming = this.mode === 'aim';
    this.char.update(dt, anim || (hs > 3.6 ? 'run' : hs > 0.3 ? 'walk' : 'idle'), hs);
    this.mesh.position.copy(this.pos); this.mesh.rotation.y = this.yaw;
  }
}

// An AI driver on the real street graph. Goal can be a point or a moving object.
export class Driver {
  constructor(g, v, opts = {}) {
    this.g = g; this.w = g.world; this.v = v;
    v.driver = 'ai'; v.kinematic = false;
    this.path = null; this.pathT = 0; this.wp = 1; this.stuck = 0; this.reverse = 0;
    this.cap = opts.cap ?? 1; this.goal = opts.goal || null; this.mode = opts.mode || 'goto';  // goto | flee | wander | follow
    this.arrive = opts.arrive ?? 14; this.stopped = false; this.brake = false;
    this.roam = null;
  }
  pickRoam() {
    const n = this.g.traffic.randomNodeNear(this.v.pos, 500, 900);
    const p = n >= 0 ? this.w.gNodes[n] : [this.v.pos.x + 300, 0, this.v.pos.z];
    this.roam = { x: p[0], z: p[2] }; this.path = null;
  }
  update(dt) {
    const v = this.v, w = this.w;
    if (v.dead) return;
    if (this.stopped || this.brake) { v.update(dt, { throttle: 0, steer: 0, handbrake: true, boost: false }, this.g.fx); return; }
    let goal = this.goal;
    if (this.mode === 'flee' || this.mode === 'wander') {
      if (!this.roam || Math.hypot(this.roam.x - v.pos.x, this.roam.z - v.pos.z) < 40) this.pickRoam();
      goal = this.roam;
    }
    const G = goal.pos || goal;
    const dist = Math.hypot(G.x - v.pos.x, G.z - v.pos.z);
    let gx = G.x, gz = G.z;
    this.pathT -= dt;
    if (this.pathT <= 0 || !this.path) {
      this.pathT = 2.5;
      const a = w.nearestNode(v.pos.x, v.pos.z, 200), b = w.nearestNode(G.x, G.z, 300);
      this.path = a >= 0 && b >= 0 ? w.route(a, b) : null; this.wp = 1;
    }
    if (this.path && this.wp < this.path.length && dist > 35) {
      const n = w.gNodes[this.path[this.wp]];
      gx = n[0]; gz = n[2];
      if (Math.hypot(gx - v.pos.x, gz - v.pos.z) < 12) this.wp++;
    }
    const want = Math.atan2(gx - v.pos.x, gz - v.pos.z);
    const diff = wrap(want - v.yaw);
    let steer = THREE.MathUtils.clamp(-diff * 2.2, -1, 1);
    let thr = (Math.abs(diff) > 1.6 ? 0.45 : 1) * this.cap;
    // slow for sharp corners at speed
    if (Math.abs(diff) > 0.6 && v.speed > 16) thr = -0.4;
    if (this.mode === 'goto' && dist < this.arrive) { thr = 0; this.arrived = true; }
    if (v.speed < 1 && thr > 0.3) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 1.6) { this.reverse = 1.3; this.stuck = 0; }
    if (this.reverse > 0) { this.reverse -= dt; thr = -1; steer = -steer; }
    v.headlights = this.g.env.night > 0.4;
    v.update(dt, { throttle: thr, steer, handbrake: Math.abs(diff) > 1.2 && v.speed > 14, boost: false }, this.g.fx);
    for (const c of this.g.traffic.cars) this.g.traffic.contact(v, c);
  }
}

export function spawnCar(g, id, x, z, yaw, opts) {
  const v = new Vehicle(id, g.world, opts).place(x, z, yaw);
  g.scene.add(v.mesh);
  return v;
}
