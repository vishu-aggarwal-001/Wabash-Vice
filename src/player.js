// People: the player on foot, and the same model reused for pedestrians.
import * as THREE from 'three';
import { dress, normalizeLook } from './outfit.js';

const G = 9.81;
const mats = new Map();
function m(color, rough = 0.8) {
  if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  return mats.get(color);
}
function part(geo, mat, x, y, z) { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; return o; }

const SKIN_ = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4226];
const SHIRT = [0xcfb991, 0x111111, 0xc0392b, 0x2980b9, 0x27ae60, 0xf5f5f5, 0x8e44ad, 0xe67e22, 0x7f8c8d, 0x34495e];
const PANTS = [0x2c3e50, 0x1f2a44, 0x3b3b3b, 0x6d5a45, 0x111111, 0x4a6fa5];
const HAIR = [0x2b1d0e, 0x4a3015, 0x0d0d0d, 0x9b7a3c, 0x6d4c2f, 0xb5651d];

const SKIN = SKIN_;
export function makePerson(opts = {}) {
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  const skin = m(opts.skin ?? r(SKIN)), shirt = m(opts.shirt ?? r(SHIRT)), pants = m(opts.pants ?? r(PANTS)), hair = m(opts.hair ?? r(HAIR));
  const shoes = m(0x1a1a1a);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
  const torso = part(new THREE.CapsuleGeometry(0.17, 0.32, 6, 12), shirt, 0, 0.34, 0); torso.scale.set(1.18, 1, 0.72); hips.add(torso);
  const pelvis = part(new THREE.CapsuleGeometry(0.15, 0.08, 4, 10), pants, 0, 0.04, 0); pelvis.scale.set(1.15, 1, 0.75); hips.add(pelvis);
  hips.add(part(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), skin, 0, 0.66, 0));
  const head = new THREE.Group(); head.position.y = 0.78; hips.add(head);
  const skull = part(new THREE.SphereGeometry(0.12, 16, 12), skin, 0, 0.07, 0); skull.scale.set(0.92, 1.08, 1); head.add(skull);
  head.add(part(new THREE.SphereGeometry(0.02, 6, 4), m(0x222222), 0.04, 0.09, 0.105), part(new THREE.SphereGeometry(0.02, 6, 4), m(0x222222), -0.04, 0.09, 0.105));
  head.add(part(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 0.08, -0.01));
  if (opts.cap) head.add(part(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14), m(opts.cap), 0, 0.17, 0.0));
  const limb = (len, w, mat) => { const g = new THREE.Group(); const p = part(new THREE.CapsuleGeometry(w / 2, Math.max(0.01, len - w), 4, 8), mat, 0, -len / 2, 0); g.add(p); return g; };
  const arm = (s) => {
    const sh = limb(0.3, 0.11, shirt); sh.position.set(s * 0.27, 0.56, 0);
    const fo = limb(0.28, 0.085, opts.sleeves === false ? skin : shirt); fo.position.y = -0.3; sh.add(fo);
    fo.add(part(new THREE.SphereGeometry(0.05, 8, 6), skin, 0, -0.3, 0));
    hips.add(sh); return [sh, fo];
  };
  const leg = (s) => {
    const th = limb(0.45, 0.15, pants); th.position.set(s * 0.11, 0, 0);
    const sh = limb(0.45, 0.13, pants); sh.position.y = -0.45; th.add(sh);
    sh.add(part(new THREE.BoxGeometry(0.13, 0.08, 0.26), shoes, 0, -0.47, 0.05));
    hips.add(th); return [th, sh];
  };
  const [la, lf] = arm(1), [ra, rf] = arm(-1), [ll, ls] = leg(1), [rl, rs] = leg(-1);
  root.userData.rig = { body, hips, torso, head, la, lf, ra, rf, ll, ls, rl, rs };
  return root;
}

// animate a rig: mode = idle|walk|run|jump|swim|sit|down
export function animate(rig, mode, phase, blend = 1) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const R = rig;
  let la = 0, ra = 0, ll = 0, rl = 0, ls = 0, rs = 0, lf = 0, rf = 0, hipY = 0.95, lean = 0, bodyX = 0;
  if (mode === 'walk' || mode === 'run') {
    const amp = mode === 'run' ? 1.0 : 0.55;
    ll = s * amp; rl = -s * amp; ls = Math.max(0, -c) * amp * 1.2; rs = Math.max(0, c) * amp * 1.2;
    la = -s * amp * 0.9; ra = s * amp * 0.9; lf = rf = mode === 'run' ? -1.2 : -0.3;
    hipY = 0.95 + Math.abs(s) * (mode === 'run' ? 0.06 : 0.03); lean = mode === 'run' ? 0.18 : 0.03;
  } else if (mode === 'jump') {
    ll = -0.7; rl = 0.3; ls = 1.0; rs = 0.5; la = -2.4; ra = -2.4; lf = rf = -0.3;
  } else if (mode === 'swim') {
    bodyX = 1.3; la = -2.8 + s * 1.2; ra = -2.8 - s * 1.2; ll = s * 0.4; rl = -s * 0.4; hipY = 0.4;
  } else if (mode === 'sit') {
    ll = rl = -1.45; ls = rs = 1.4; la = ra = -1.0; lf = rf = -0.6; hipY = 0.55;
  } else if (mode === 'ride') {
    ll = rl = -1.1; ls = rs = 1.3; la = ra = -1.25; lf = rf = -0.2; hipY = 0.45; lean = 0.35;
  } else if (mode === 'down') {
    bodyX = -1.5; hipY = 0.18; la = -2.9; ra = -0.3; ll = 0.2; rl = -0.1;
  } else { // idle
    la = s * 0.04; ra = -s * 0.04; hipY = 0.95 + s * 0.005;
  }
  const k = Math.min(1, blend);
  const L = (o, prop, v) => { o.rotation[prop] += (v - o.rotation[prop]) * k; };
  L(R.la, 'x', la); L(R.ra, 'x', ra); L(R.ll, 'x', ll); L(R.rl, 'x', rl);
  L(R.ls, 'x', ls); L(R.rs, 'x', rs); L(R.lf, 'x', lf); L(R.rf, 'x', rf);
  L(R.hips, 'x', lean); L(R.body, 'x', bodyX);
  R.hips.position.y += (hipY - R.hips.position.y) * k;
}

// Fallback when the skinned models can't load: the old procedural figure behind the same interface.
export class LegacyHuman {
  constructor(opts = {}) { this.mesh = makePerson(opts); this.rig = this.mesh.userData.rig; this.phase = 0; this.punchT = 0; this.kickT = 0; }
  update(dt, mode, speed = 0) {
    this.phase += dt * (speed * 2.4 + 1);
    const m = mode === 'drive' ? 'sit' : mode === 'cower' || mode === 'hands_up' || mode === 'wave' ? 'idle' : mode;
    animate(this.rig, m, this.phase, dt * 12);
    if (this.punchT > 0) { this.punchT -= dt; this.rig.ra.rotation.x = -1.5 * Math.sin(Math.min(1, 1 - this.punchT / 0.42) * Math.PI); }
    if (this.kickT > 0) this.kickT -= dt;
  }
  punch() { if (this.punchT <= 0) { this.punchT = 0.42; return true; } return false; }
  kick() { if (this.kickT <= 0) { this.kickT = 0.55; return true; } return false; }
  get attacking() { return this.punchT > 0 || this.kickT > 0; }
}
export function makeHuman(people, kind = 'man', opts = {}) {
  if (people?.ok) {
    try { return kind === 'player' ? people.makePlayer(people.look) : people.make(kind, opts); }
    catch (e) { console.warn(e); }
  }
  const legacy = { player: { shirt: 0xcfb991, pants: 0x1b1b1b, skin: 0xd8a47f, hair: 0x1a1208 }, cop: { shirt: 0x1d2a4a, pants: 0x141a2c, cap: 0x141a2c }, medic: { shirt: 0xe8eef5, pants: 0x2c3d63 } }[kind] || {};
  return new LegacyHuman(legacy);
}

export class Player {
  constructor(world, scene, people) {
    this.world = world;
    this.char = makeHuman(people, 'player');
    this.mesh = this.char.mesh;
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.onGround = true; this.swimming = false; this.hp = 100; this.maxHP = 100; this.staminaRegen = 1; this.armor = 0; this.stamina = 1; this.medkits = 2;
    this.phase = 0; this.mode = 'idle'; this.vehicle = null; this.down = 0; this.jumpHeld = false;
    this.events = [];
  }
  // wardrobe: re-dress the player (ignored while in a work uniform)
  async applyLook(people, look) {
    if (this.outfit && this.outfit !== 'player') return;
    look = normalizeLook(look);
    await Promise.all([look.base, look.head, look.legs, look.feet].filter(Boolean).map(id => people.ensure(id)));
    if (this.outfit && this.outfit !== 'player') return;
    if (this.char.look?.base === look.base && this.char.T?.id === look.base) { dress(people, this.char, look); return; }
    // a different body: rebuild the character, keep everything else
    const old = this.mesh, parent = old.parent;
    this.char = people.makePlayer(look);
    this.mesh = this.char.mesh;
    this.mesh.position.copy(old.position); this.mesh.rotation.copy(old.rotation); this.mesh.visible = old.visible;
    if (parent) { parent.add(this.mesh); parent.remove(old); }
  }
  // swap the whole character (uniform for jobs) while keeping position and state
  setOutfit(people, kind) {
    if (this.outfit === kind || (!this.outfit && kind === 'player')) return;
    this.outfit = kind;
    const old = this.mesh, parent = old.parent;
    this.char = makeHuman(people, kind, { female: people.look?.g === 'f', vary: false });
    this.mesh = this.char.mesh;
    this.mesh.position.copy(old.position); this.mesh.rotation.copy(old.rotation); this.mesh.visible = old.visible;
    if (parent) { parent.add(this.mesh); parent.remove(old); }
  }
  place(x, z, y = null) {
    const g = this.world.groundAt(x, z, y);
    this.pos.set(x, y ?? (g.water ?? g.y), z); this.vel.set(0, 0, 0);
    this.mesh.position.copy(this.pos);
  }
  knock(v) {
    if (this.down > 0) return;
    this.vel.copy(v).setY(Math.max(4, v.length() * 0.35));
    this.down = 2.5; this.hurt(Math.min(60, v.length() * 2.5));
  }
  // armour soaks up damage first
  hurt(n) {
    const a = Math.min(this.armor, n * 0.7);
    this.armor -= a; this.hp -= n - a;
    this.events.push('hurt');
  }
  useMedkit() {
    if (this.medkits <= 0 || this.hp >= this.maxHP) return false;
    this.medkits--; this.hp = Math.min(this.maxHP, this.hp + 50); return true;
  }
  update(dt, input, camYaw) {
    this.events.length = 0;
    const w = this.world;
    if (this.vehicle) return;
    const gnd = w.groundAt(this.pos.x, this.pos.z, this.pos.y, 0.7);
    const waterY = gnd.water;
    this.swimming = waterY !== null && this.pos.y < waterY - 0.9;
    let mx = 0, mz = 0;
    if (this.down <= 0) {
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
      mx = fx * input.y + rx * input.x; mz = fz * input.y + rz * input.x;
    }
    const ml = Math.hypot(mx, mz);
    const running = input.run && ml > 0.1 && this.stamina > 0.05;
    this.stamina = Math.max(0, Math.min(1, this.stamina + (running ? -0.12 : 0.2 * this.staminaRegen) * dt));
    const speed = this.swimming ? (running ? 2.8 : 1.6) : running ? 7.0 : 2.4;
    if (ml > 0.01) {
      mx /= Math.max(1, ml); mz /= Math.max(1, ml);
      const targetYaw = Math.atan2(mx, mz);
      let d = targetYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }
    const grounded = this.onGround || this.swimming;
    const accel = grounded ? 14 : 2;
    if (this.down <= 0) {
      this.vel.x += (mx * speed - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (mz * speed - this.vel.z) * Math.min(1, accel * dt);
    } else {
      this.down -= dt;
      if (this.onGround) { this.vel.x *= Math.exp(-dt * 5); this.vel.z *= Math.exp(-dt * 5); }
    }
    if (this.swimming) {
      this.vel.y += ((waterY - 1.15) - this.pos.y) * dt * 6 - this.vel.y * dt * 4;
      if (input.jump && !this.jumpHeld) this.vel.y = 2.5;
    } else {
      this.vel.y -= G * dt;
      if (input.jump && !this.jumpHeld && this.onGround && this.down <= 0) { this.vel.y = 5.4; this.onGround = false; this.events.push('jump'); }
    }
    this.jumpHeld = input.jump;
    this.pos.addScaledVector(this.vel, dt);
    const res = w.collide(this.pos.x, this.pos.z, 0.35, this.pos.y + 0.35, this.pos.y + 1.8);
    this.pos.x = res.x; this.pos.z = res.z;
    const g2 = w.groundAt(this.pos.x, this.pos.z, this.pos.y, 0.7);
    if (this.pos.y <= g2.y) {
      if (this.vel.y < -15) { this.hurt((-this.vel.y - 15) * 9); }
      this.pos.y = g2.y; this.vel.y = Math.max(0, this.vel.y); this.onGround = true;
    } else if (this.onGround && this.pos.y - g2.y < 0.5 && this.vel.y <= 0) {
      this.pos.y = g2.y; this.vel.y = 0;
    } else this.onGround = false;
    // animation
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.phase += dt * (hs * 2.4 + 1);
    this.mode = this.down > 0 ? 'down' : this.swimming ? 'swim' : !this.onGround && this.airT > 0.12 ? 'jump' : hs > 4.2 ? 'run' : hs > 0.4 ? 'walk' : 'idle';
    this.airT = this.onGround ? 0 : (this.airT || 0) + dt;
    // fists: punch (click / Q), kick (E)
    if (this.down <= 0 && !this.swimming) {
      if (input.punch && this.char.punch()) this.events.push('punch');
      if (input.kick && this.char.kick()) this.events.push('kick');
    }
    if (this.char.attacking) { this.vel.x *= 0.85; this.vel.z *= 0.85; }
    this.char.update(dt, this.mode, hs);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
  }
}
