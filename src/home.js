// Your home: a house in a quiet West Lafayette neighbourhood with your own car on the driveway.
// You start here, you respawn here, and walking up to the front door saves the game and heals you.
import * as THREE from 'three';
import { textTexture } from './textures.js';

const TARGET = [40.4318, -86.9086];   // residential streets just north of campus
const DEFAULT_CAR = 'compact';

export class Home {
  constructor(g) {
    this.g = g;
    const spot = this.find() || this.fallback();
    Object.assign(this, spot);
    this.buildMarker();
    g.blips.push({ get: () => ({ x: this.door[0], z: this.door[1] }), color: '#3ddc84', size: 6 });
    this.inside = false;
    this.spawnCar();
  }

  // pick a house with room for a car between its front wall and the street
  find() {
    const g = this.g, w = g.world, map = w.map, kinds = map.buildingKinds;
    const [tx, tz] = w.toWorld(...TARGET);
    const cand = [];
    for (let i = 0; i < w.buildings.length && i < map.buildings.length; i++) {
      const b = w.buildings[i];
      if (kinds[map.buildings[i][3]] !== 'house') continue;
      const d = Math.hypot(b.cx - tx, b.cz - tz);
      if (d < 900) cand.push([d, b]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const spec = { L: 4.7, W: 2.0 };
    for (const [, b] of cand.slice(0, 400)) {
      const n = w.nearestNode(b.cx, b.cz, 70); if (n < 0) continue;
      // closest point on the streets leaving that node
      const A = w.gNodes[n]; let P = null, pd = Infinity;
      for (const m of w.gAdj[n] || []) {
        const B = w.gNodes[m], dx = B[0] - A[0], dz = B[2] - A[2], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((b.cx - A[0]) * dx + (b.cz - A[2]) * dz) / l2));
        const px = A[0] + dx * t, pz = A[2] + dz * t, d = Math.hypot(b.cx - px, b.cz - pz);
        if (d < pd) { pd = d; P = [px, pz]; }
      }
      if (!P || pd < 9 || pd > 40) continue;
      const nx = (P[0] - b.cx) / pd, nz = (P[1] - b.cz) / pd;
      const y = w.heightAt(b.cx, b.cz);
      // walk out of the house to its front wall
      let t = 0;
      while (t < pd && w.collide(b.cx + nx * t, b.cz + nz * t, 0.3, y + 0.4, y + 2).hit) t += 0.4;
      const fx = b.cx + nx * t, fz = b.cz + nz * t;
      const carD = 1.2 + spec.L / 2;
      const cx = fx + nx * carD, cz = fz + nz * carD;
      if (Math.hypot(P[0] - cx, P[1] - cz) < spec.L / 2 + 4.3) continue;   // car would stick into the street
      // the car's footprint must be clear: no walls, trees, water or road
      const half = spec.L / 2 - spec.W / 2;
      let ok = true;
      for (const k of [-half, 0, half]) {
        const x = cx + nx * k, z = cz + nz * k;
        if (w.collide(x, z, spec.W / 2 + 0.35, y + 0.3, y + 2).hit || w.isWater(x, z) || w.isRoad(x, z)) { ok = false; break; }
      }
      if (!ok) continue;
      // the front door is beside the car; you start just past the car's nose, looking back at
      // the house, so the camera has the open street behind it
      const sx = -nz, sz = nx;
      let res = null;
      for (const side of [1, -1]) {
        const dx = fx + nx * 0.9 + sx * side * (spec.W / 2 + 1.4), dz = fz + nz * 0.9 + sz * side * (spec.W / 2 + 1.4);
        const px = cx + nx * (spec.L / 2 + 1.3) + sx * side * (spec.W / 2 + 0.6), pz = cz + nz * (spec.L / 2 + 1.3) + sz * side * (spec.W / 2 + 0.6);
        if (w.collide(dx, dz, 0.5, y + 0.3, y + 2).hit || w.collide(px, pz, 0.45, y + 0.3, y + 2).hit) continue;
        res = { door: [dx, dz], spawn: [px, pz] }; break;
      }
      if (!res) continue;
      return {
        door: res.door, car: [cx, cz], carYaw: Math.atan2(nx, nz),
        spawn: res.spawn, yaw: Math.atan2(-nx, -nz) - 0.25 * Math.sign((res.door[0] - cx) * sx + (res.door[1] - cz) * sz), street: P,
        name: b.name || 'Home',
      };
    }
    return null;
  }
  fallback() {
    const g = this.g, [x, z] = g.startSpot;
    return { door: [x, z], car: [x + 4, z], carYaw: 0, spawn: [x, z], yaw: 0, street: [x, z], name: 'Home' };
  }

  buildMarker() {
    const g = this.g, w = g.world, [x, z] = this.door, y = w.heightAt(x, z);
    const grp = new THREE.Group(); grp.position.set(x, y, z);
    const mat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), mat); beam.scale.set(0.9, 3.2, 0.9); beam.position.y = 1.6; grp.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: 0x3ddc84, fog: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.08; grp.add(ring);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('🏠 Home', { size: 46, bg: 'rgba(0,0,0,0.6)' }), fog: false }));
    label.scale.set(5, 1.25, 1); label.position.y = 4.1; grp.add(label);
    // a mailbox at the end of the driveway
    const [mx, mz] = this.car, sx = -Math.cos(this.carYaw), sz = Math.sin(this.carYaw);
    const box = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }));
    post.position.y = 0.55; box.add(post);
    const bx = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 10, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, metalness: 0.4, roughness: 0.5 }));
    bx.rotation.z = Math.PI / 2; bx.rotation.y = Math.PI / 2; bx.position.y = 1.1; box.add(bx);
    const fwd = 4.7 / 2 + 1.6, sd = -(Math.sign((this.door[0] - mx) * sx + (this.door[1] - mz) * sz) || 1) * 1.9;   // opposite side from the door
    box.position.set(mx + Math.sin(this.carYaw) * fwd + sx * sd, w.heightAt(mx, mz), mz + Math.cos(this.carYaw) * fwd + sz * sd);
    box.rotation.y = this.carYaw;
    g.scene.add(grp, box);
    this.grp = grp;
  }

  // your car: the one you tuned at the garage if you have one, otherwise the Boilermaker GT
  spawnCar() {
    const g = this.g, m = g.save.myCar;
    if (this.v) { const i = g.parked.indexOf(this.v); if (i >= 0) g.parked.splice(i, 1); g.scene.remove(this.v.mesh); }
    const id = m && m.id ? m.id : DEFAULT_CAR;
    const v = g.spawnVehicle(id, this.car[0], this.car[1], this.carYaw, false, { color: m?.tune?.color, tune: m?.tune, mine: true });
    v.showcase = true; v.homeCar = true;
    this.v = v;
  }
  // after you die or get busted: if your car is wrecked or far away, a fresh one is waiting at home
  restoreCar() {
    const v = this.v;
    if (!v || v.dead || v.hp < 40 || (v !== this.g.vehicle && Math.hypot(v.pos.x - this.car[0], v.pos.z - this.car[1]) > 60)) this.spawnCar();
  }

  update(dt) {
    const g = this.g;
    this.grp.children[0].material.opacity = 0.22 + Math.sin(performance.now() / 300) * 0.08;
    const near = !g.vehicle && Math.hypot(g.player.pos.x - this.door[0], g.player.pos.z - this.door[1]) < 1.6;
    if (near && !this.inside) {
      g.player.hp = g.player.maxHP;
      g.persist();
      g.hud.toast('🏠 Home sweet home: game saved, health restored', 'good');
      g.audio.chime?.(true);
    }
    this.inside = near;
  }
}
