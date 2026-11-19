// Activities: job markers around the real city, checkpoint missions, and
// 30 hidden Golden Gears to collect.
import * as THREE from 'three';
import { textTexture } from './textures.js';

function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

export class Missions {
  constructor(game) {
    this.g = game; this.w = game.world;
    this.markers = []; this.active = null; this.cpMesh = null; this.ringMesh = null;
    this.gears = [];
    this.group = new THREE.Group(); game.scene.add(this.group);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
    this.beamMat = beamMat;
    const W = (lat, lon) => this.w.toWorld(lat, lon);
    const rw = game.runwaySpawn;
    const defs = [
      { id: 'delivery', name: 'Boiler Express', desc: 'Deliver 3 packages across West Lafayette & Lafayette before time runs out.', at: W(40.42455, -86.9116), need: 'ground', veh: 'hatch' },
      { id: 'race', name: 'Ross-Ade Street Race', desc: 'Checkpoint race through the real streets. Beat the clock.', at: W(40.4322, -86.9185), need: 'ground', veh: 'gt' },
      { id: 'flight', name: 'Purdue Flight School', desc: 'Fly through 10 rings around Purdue Airport.', at: [rw.x + Math.sin(rw.yaw + Math.PI / 2) * 60, rw.z + Math.cos(rw.yaw + Math.PI / 2) * 60], need: 'plane', veh: 'cessna' },
      { id: 'rooftop', name: 'Rooftop Hopper', desc: 'Land the helicopter on 4 rooftops downtown and on campus.', at: W(40.4183, -86.8932), need: 'heli', veh: 'heli' },
      { id: 'river', name: 'Wabash River Run', desc: 'Race up the Wabash under every bridge.', at: game.boatLaunch, need: 'boat', veh: 'speedboat' },
    ];
    for (const d of defs) this.addMarker(d);
    this.makeGears();
  }

  addMarker(d) {
    const [x, z] = d.at;
    const y = this.w.groundAt(x, z).y;
    const g = new THREE.Group(); g.position.set(x, y, z);
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat); beam.scale.set(3, 30, 3); beam.position.y = 15; g.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.18, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(d.name, { size: 52, bg: 'rgba(0,0,0,0.55)' }), depthTest: true, fog: false }));
    label.scale.set(12, 3, 1); label.position.y = 7; g.add(label);
    this.group.add(g);
    this.markers.push({ ...d, x, z, y, mesh: g });
  }

  makeGears() {
    const saved = new Set(this.g.save.gears || []);
    const r = rng(8888);
    const geo = new THREE.TorusGeometry(0.8, 0.28, 8, 16);
    const teeth = new THREE.BoxGeometry(0.3, 0.3, 0.45);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffcf40, metalness: 1, roughness: 0.25, emissive: 0x805a00, emissiveIntensity: 0.6 });
    const N = this.w.gNodes;
    const named = this.w.buildings.filter(b => b.name && b.top - b.base > 8);
    for (let i = 0; i < 30; i++) {
      let x, z, y;
      if (i % 3 === 2 && named.length) {           // every third gear sits on a rooftop
        const b = named[Math.floor(r() * named.length)];
        x = b.cx; z = b.cz; y = this.w.groundAt(x, z, 1e9).y;
      } else {
        let n, k = 0;
        do { n = Math.floor(r() * N.length); k++; } while ((!this.w.gAdj[n].length) && k < 50);
        x = N[n][0] + (r() - 0.5) * 6; z = N[n][2] + (r() - 0.5) * 6; y = this.w.groundAt(x, z).y;
      }
      if (saved.has(i)) continue;
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo, mat));
      for (let t = 0; t < 8; t++) { const m = new THREE.Mesh(teeth, mat); const a = t / 8 * Math.PI * 2; m.position.set(Math.cos(a) * 1.12, Math.sin(a) * 1.12, 0); m.rotation.z = a; g.add(m); }
      g.position.set(x, y + 1.6, z);
      this.group.add(g);
      this.gears.push({ i, g, x, y: y + 1.6, z });
    }
  }

  vehicleOk(need, v) {
    if (!v) return false;
    if (need === 'ground') return v.type === 'car' || v.type === 'bike';
    return v.type === need;
  }

  start(m) {
    const g = this.g;
    if (g.story?.active) { g.hud.toast('Finish your story mission first', 'warn'); return; }
    if (g.jobs?.active) g.jobs.end(true);
    if (!this.vehicleOk(m.need, g.vehicle)) {
      if (g.vehicle) g.exitVehicle(true);
      const yaw = m.id === 'flight' ? g.runwaySpawn.yaw : m.id === 'river' ? g.riverYaw(g.boatLaunch[1]) : g.camYaw;
      const at = m.id === 'flight' ? [g.runwaySpawn.x, g.runwaySpawn.z] : m.id === 'river' ? [g.boatLaunch[2] + 6, g.boatLaunch[1]] : [m.x + Math.sin(yaw) * 6, m.z + Math.cos(yaw) * 6];
      g.spawnVehicle(m.veh, at[0], at[1], yaw, true);
    }
    const A = { m, idx: 0, cps: [], time: 0, limit: 0, legs: 0, reward: 0 };
    const w = this.w, pos = g.vehicle.pos;
    if (m.id === 'delivery') {
      A.legs = 3; A.cps = [this.randomDrop(pos, 600, 1400)];
      A.limit = this.legTime(pos, A.cps[0], 10);
      A.text = () => `Deliver to ${A.cps[A.idx].name}  (${A.idx + 1}/${A.legs})`;
    } else if (m.id === 'race') {
      const dest = this.randomDrop(pos, 1400, 2600);
      const a = w.nearestNode(pos.x, pos.z), b = w.nearestNode(dest.x, dest.z);
      const path = w.route(a, b) || [];
      let acc = 0, last = null;
      for (const n of path) {
        const p = w.gNodes[n];
        if (last) acc += Math.hypot(p[0] - last[0], p[2] - last[2]);
        last = p;
        if (acc > 170) { acc = 0; A.cps.push({ x: p[0], y: w.groundAt(p[0], p[2], p[1] + 2).y, z: p[2], r: 12 }); }
      }
      A.cps.push({ ...dest, r: 14, name: dest.name });
      A.limit = A.cps.length * 9 + 15;
      A.text = () => `Checkpoint ${A.idx + 1}/${A.cps.length}`;
    } else if (m.id === 'flight') {
      const c = g.airportCenter;
      for (let i = 0; i < 10; i++) {
        const a = g.runwaySpawn.yaw + i / 10 * Math.PI * 2 + 0.6;
        const R = 900 + Math.sin(i * 1.7) * 250;
        const x = c[0] + Math.sin(a) * R, z = c[1] + Math.cos(a) * R;
        A.cps.push({ x, z, y: w.heightAt(x, z) + 90 + (i % 3) * 45, r: 22, air: true });
      }
      A.limit = 240;
      A.text = () => `Fly through ring ${A.idx + 1}/10`;
    } else if (m.id === 'rooftop') {
      const tall = w.buildings.filter(b => b.name && b.top - b.base > 14 && Math.hypot(b.cx - pos.x, b.cz - pos.z) < 2200);
      const r = rng(Date.now() % 100000);
      for (let i = 0; i < 4 && tall.length; i++) {
        const b = tall.splice(Math.floor(r() * tall.length), 1)[0];
        A.cps.push({ x: b.cx, z: b.cz, y: b.top, r: 16, roof: true, name: b.name });
      }
      A.limit = 300;
      A.text = () => `Land on the roof of ${A.cps[A.idx].name}  (${A.idx + 1}/${A.cps.length})`;
    } else if (m.id === 'river') {
      const iz0 = Math.round((pos.z - w.minZ) / w.cell);
      for (let k = 1; k <= 14; k++) {
        const iz = Math.max(2, iz0 - k * 26);
        const z = w.minZ + iz * w.cell, x = w.riverX[iz];
        if (!w.isWater(x, z)) continue;
        A.cps.push({ x, z, y: 0, r: 20 });
      }
      A.limit = A.cps.length * 14 + 20;
      A.text = () => `River checkpoint ${A.idx + 1}/${A.cps.length}`;
    }
    if (!A.cps.length) { g.hud.toast('Could not set up that mission here', 'warn'); return; }
    this.active = A;
    g.hud.big(m.name, m.desc);
    g.audio.chime(true);
    this.showCheckpoint();
  }

  randomDrop(pos, dmin, dmax) {
    const labels = this.w.map.labels;
    let best = labels[0];
    for (let k = 0; k < 60; k++) {
      const l = labels[Math.floor(Math.random() * labels.length)];
      const d = Math.hypot(l[1] - pos.x, l[2] - pos.z);
      if (d > dmin && d < dmax) { best = l; break; }
    }
    // drop point = nearest road node to the building
    const n = this.w.nearestNode(best[1], best[2], 300);
    const p = n >= 0 ? this.w.gNodes[n] : [best[1], 0, best[2]];
    return { x: p[0], z: p[2], y: this.w.groundAt(p[0], p[2], p[1] + 2).y, r: 10, name: best[0] };
  }
  legTime(pos, cp, extra) { return Math.round(Math.hypot(cp.x - pos.x, cp.z - pos.z) * 1.4 / 13 + extra + 20); }

  showCheckpoint() {
    const A = this.active;
    if (this.cpMesh) { this.group.remove(this.cpMesh); this.cpMesh = null; }
    if (!A) return;
    const cp = A.cps[A.idx];
    let mesh;
    if (cp.air) {
      mesh = new THREE.Mesh(new THREE.TorusGeometry(cp.r, 1.4, 10, 48), new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false }));
      const nxt = A.cps[(A.idx + 1) % A.cps.length];
      mesh.lookAt(nxt.x - cp.x, nxt.y - cp.y, nxt.z - cp.z);
      mesh.position.set(cp.x, cp.y, cp.z);
    } else {
      mesh = new THREE.Group();
      const beam = new THREE.Mesh(this.beamGeo, this.beamMat); beam.scale.set(cp.r * 0.5, 60, cp.r * 0.5); beam.position.y = 30; mesh.add(beam);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(cp.r * 0.5, 0.3, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd23f, fog: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; mesh.add(ring);
      mesh.position.set(cp.x, cp.y, cp.z);
    }
    this.cpMesh = mesh; this.group.add(mesh);
    this.g.setGPS(cp.x, cp.z, !cp.air && this.active.m.need !== 'boat');
    if (A.m.id === 'delivery' && A.idx > 0) A.limit = A.time + this.legTime(this.g.focus, cp, 10);
  }

  finish(ok, msg) {
    const A = this.active, g = this.g;
    this.active = null; this.showCheckpoint(); g.setGPS(null);
    if (ok) {
      const pay = Math.round(A.m.id === 'delivery' ? 900 : A.m.id === 'race' ? 1500 : A.m.id === 'flight' ? 2500 : A.m.id === 'rooftop' ? 2000 : 1200) + Math.max(0, Math.round((A.limit - A.time) * 20));
      g.addMoney(pay);
      g.hud.big('MISSION PASSED', `${A.m.name}  •  +$${pay.toLocaleString()}`, 'pass');
      g.audio.chime(true);
    } else {
      g.hud.big('MISSION FAILED', msg || 'Out of time', 'fail');
      g.audio.chime(false);
    }
  }

  update(dt, pos, veh, input) {
    const g = this.g, t = performance.now() / 1000;
    for (const m of this.markers) {
      m.mesh.visible = !this.active;
      m.mesh.children[1].rotation.z = t;
      if (!this.active && Math.hypot(pos.x - m.x, pos.z - m.z) < (veh ? 8 : 4) && Math.abs(pos.y - m.y) < 6) {
        g.hud.prompt(`Press J to start: ${m.name}`);
        if (input.pressed.has('mission')) this.start(m);
      }
    }
    for (let i = this.gears.length - 1; i >= 0; i--) {
      const s = this.gears[i];
      s.g.rotation.y = t * 2; s.g.position.y = s.y + Math.sin(t * 2 + i) * 0.25;
      if (Math.hypot(pos.x - s.x, pos.z - s.z) < 3 && Math.abs(pos.y + 1 - s.y) < 3.5) {
        this.group.remove(s.g); this.gears.splice(i, 1);
        g.save.gears = [...(g.save.gears || []), s.i];
        g.addMoney(500);
        g.hud.toast(`Golden Gear found! ${g.save.gears.length}/30  +$500`, 'good');
        g.audio.chime(true);
        g.persist();
      }
    }
    const A = this.active;
    if (!A) return;
    A.time += dt;
    if (A.m.need && !this.vehicleOk(A.m.need, veh)) {
      A.offFor = (A.offFor || 0) + dt;
      if (A.offFor > 10) return this.finish(false, 'You abandoned the vehicle');
      g.hud.objective(`Get back in a ${A.m.need === 'ground' ? 'car' : A.m.need}! ${Math.ceil(10 - A.offFor)}s`, A.limit - A.time);
    } else {
      A.offFor = 0;
      g.hud.objective(A.text(), A.limit - A.time);
    }
    if (A.time > A.limit) return this.finish(false, 'Out of time');
    if (veh?.dead) return this.finish(false, 'Vehicle destroyed');
    const cp = A.cps[A.idx];
    if (this.cpMesh && cp.air) this.cpMesh.rotation.z += dt;
    const d = Math.hypot(pos.x - cp.x, pos.z - cp.z), dy = Math.abs(pos.y - cp.y);
    let hit = cp.air ? d < cp.r && dy < cp.r : cp.roof ? d < cp.r && dy < 3 && veh?.onGround : d < cp.r && dy < 8;
    if (hit) {
      g.audio.chime(true);
      if (A.m.id === 'delivery') { g.addMoney(150); g.hud.toast(`Delivered to ${cp.name}  +$150`, 'good'); }
      A.idx++;
      if (A.m.id === 'delivery' && A.idx < A.legs) { A.cps.push(this.randomDrop(pos, 500, 1300)); }
      if (A.idx >= (A.m.id === 'delivery' ? A.legs : A.cps.length)) return this.finish(true);
      this.showCheckpoint();
    }
  }

  cancel() { if (this.active) this.finish(false, 'Mission cancelled'); }
}
