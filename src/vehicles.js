// Vehicle catalogue, procedural models, and physics for cars, motorcycles,
// planes, helicopters and boats.
//
// Conventions: models face +Z. Heading `yaw` gives forward = (sin yaw, 0, cos yaw);
// right = (-cos yaw, 0, sin yaw). Steering right decreases yaw.
import * as THREE from 'three';

const G = 9.81;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ catalogue
// speeds in m/s (x3.6 = km/h, x2.237 = mph)
// Road cars and bikes: the catalog numbers were drag-strip figures (a family sedan doing 120 mph,
// 0-60 in 3 s). On real Lafayette streets that's undriveable, so everything on wheels runs at
// ROAD_TOP of its listed top speed and ROAD_ACCEL of its listed acceleration.
export const ROAD_TOP = 0.72, ROAD_ACCEL = 0.9;
export const topSpeed = (s) => (s.type === 'car' || s.type === 'bike') ? s.max * ROAD_TOP : s.max;

export const CATALOG = [
  // cars
  { id: 'gt', name: 'Boilermaker GT', cat: 'Cars', type: 'car', style: 'coupe', L: 4.5, W: 1.96, color: 0xcfb991, stripe: 0x111111, max: 76, accel: 13, grip: 10, wheel: 0.36, mass: 1350 },
  { id: 'hyper', name: 'Golden Train Hypercar', cat: 'Cars', type: 'car', style: 'hyper', L: 4.65, W: 2.04, color: 0x101010, stripe: 0xcfb991, max: 97, accel: 18, grip: 11, wheel: 0.36, mass: 1250 },
  { id: 'sedan', name: 'Wabash Sedan', cat: 'Cars', type: 'car', style: 'sedan', L: 4.8, W: 1.86, color: 'random', max: 54, accel: 8, grip: 8.5, wheel: 0.34, mass: 1450 },
  { id: 'hatch', name: 'Chauncey Hatch', cat: 'Cars', type: 'car', style: 'hatch', L: 4.0, W: 1.78, color: 'random', max: 50, accel: 8.5, grip: 9, wheel: 0.32, mass: 1150 },
  { id: 'muscle', name: 'Riverside Muscle', cat: 'Cars', type: 'car', style: 'muscle', L: 5.0, W: 1.98, color: 0x8a1d1d, stripe: 0xf2f2f2, max: 72, accel: 12, grip: 7.5, wheel: 0.37, mass: 1600 },
  { id: 'suv', name: 'Tippecanoe SUV', cat: 'Cars', type: 'car', style: 'suv', L: 4.9, W: 2.0, color: 'random', max: 52, accel: 7.5, grip: 8, wheel: 0.4, mass: 2100 },
  { id: 'pickup', name: 'Prairie Pickup', cat: 'Cars', type: 'car', style: 'pickup', L: 5.7, W: 2.05, color: 'random', max: 50, accel: 7.5, grip: 8, wheel: 0.42, mass: 2300 },
  { id: 'wagon', name: 'Klondike Wagon', cat: 'Cars', type: 'car', style: 'hatch', L: 4.9, W: 1.84, color: 'random', max: 49, accel: 7.5, grip: 8.5, wheel: 0.34, mass: 1550 },
  { id: 'classic', name: '1979 Monon Classic', cat: 'Cars', type: 'car', style: 'sedan', L: 5.3, W: 1.96, color: 'random', max: 48, accel: 7, grip: 7, wheel: 0.36, mass: 1750 },
  { id: 'luxury', name: 'Prophetstown Luxury', cat: 'Cars', type: 'car', style: 'sedan', L: 5.15, W: 1.94, color: 0x0b0c0e, max: 70, accel: 10.5, grip: 9.5, wheel: 0.37, mass: 1950 },
  { id: 'limo', name: 'Executive Limo', cat: 'Cars', type: 'car', style: 'sedan', L: 6.6, W: 2.0, color: 0x0b0c0e, max: 55, accel: 7, grip: 8, wheel: 0.37, mass: 2600 },
  { id: 'compact', name: 'Ivy Compact', cat: 'Cars', type: 'car', style: 'hatch', L: 3.6, W: 1.68, color: 'random', max: 44, accel: 8, grip: 9, wheel: 0.3, mass: 950 },
  { id: 'rally', name: 'Tippecanoe Rally', cat: 'Cars', type: 'car', style: 'hatch', L: 4.2, W: 1.86, color: 0x1e5aa8, stripe: 0xf2c014, max: 64, accel: 12.5, grip: 10.5, wheel: 0.34, mass: 1250 },
  { id: 'roadster', name: 'Harrison Roadster', cat: 'Cars', type: 'car', style: 'coupe', L: 4.1, W: 1.82, color: 0xb0121b, max: 68, accel: 11.5, grip: 10, wheel: 0.34, mass: 1100 },
  { id: 'gtr', name: 'Tecumseh GT-R', cat: 'Cars', type: 'car', style: 'coupe', L: 4.7, W: 1.94, color: 0x3d4249, max: 85, accel: 15, grip: 11, wheel: 0.36, mass: 1650 },
  { id: 'supercar', name: 'Ross-Ade Supercar', cat: 'Cars', type: 'car', style: 'hyper', L: 4.5, W: 2.0, color: 0xe2580f, max: 90, accel: 16.5, grip: 11, wheel: 0.36, mass: 1400 },
  { id: 'dragster', name: 'Levee Drag Muscle', cat: 'Cars', type: 'car', style: 'muscle', L: 5.1, W: 2.0, color: 0x0b0c0e, stripe: 0xcfb991, max: 80, accel: 15, grip: 7.5, wheel: 0.38, mass: 1700 },
  { id: 'pony', name: 'Columbian Pony Car', cat: 'Cars', type: 'car', style: 'muscle', L: 4.8, W: 1.92, color: 0xf2c014, stripe: 0x111111, max: 70, accel: 11.5, grip: 8, wheel: 0.36, mass: 1500 },
  { id: 'jeep', name: 'Battle Ground 4x4', cat: 'Cars', type: 'car', style: 'suv', L: 4.3, W: 1.9, color: 0x123d26, max: 46, accel: 7.5, grip: 9, wheel: 0.44, mass: 1800, offroad: true },
  { id: 'crossover', name: 'Lindberg Crossover', cat: 'Cars', type: 'car', style: 'suv', L: 4.6, W: 1.88, color: 'random', max: 54, accel: 8.5, grip: 8.5, wheel: 0.38, mass: 1700 },
  { id: 'hauler', name: 'Ag Hauler HD', cat: 'Cars', type: 'car', style: 'pickup', L: 6.1, W: 2.15, color: 'random', max: 52, accel: 8.5, grip: 8, wheel: 0.45, mass: 2900 },
  { id: 'van', name: 'Wabash Van', cat: 'Big rigs', type: 'car', style: 'box', L: 5.4, W: 2.1, color: 'random', boxH: 2.5, max: 44, accel: 6.5, grip: 8, wheel: 0.38, mass: 2600 },
  { id: 'tanker', name: 'Fuel Tanker', cat: 'Big rigs', type: 'car', style: 'box', L: 10, W: 2.5, color: 0xf0f0f0, extra: 'tanker', boxH: 3.2, max: 34, accel: 3.8, grip: 7, wheel: 0.52, mass: 16000 },
  { id: 'police', name: 'Lafayette PD Cruiser', cat: 'Emergency', type: 'car', style: 'sedan', L: 5.0, W: 1.95, color: 0x111317, extra: 'police', max: 66, accel: 11, grip: 9.5, wheel: 0.36, mass: 1800 },
  { id: 'taxi', name: 'Boiler Cab', cat: 'Cars', type: 'car', style: 'sedan', L: 4.9, W: 1.86, color: 0xf2c014, extra: 'taxi', max: 52, accel: 8, grip: 8.5, wheel: 0.34, mass: 1500 },
  { id: 'ambulance', name: 'Ambulance', cat: 'Emergency', type: 'car', style: 'box', L: 6.4, W: 2.3, color: 0xf4f4f2, extra: 'ambulance', boxH: 2.9, max: 46, accel: 6, grip: 7.5, wheel: 0.42, mass: 4200 },
  { id: 'fire', name: 'Fire Engine', cat: 'Emergency', type: 'car', style: 'box', L: 9.5, W: 2.5, color: 0xb3121a, extra: 'fire', boxH: 3.0, max: 40, accel: 4.5, grip: 7, wheel: 0.5, mass: 14000 },
  { id: 'bus', name: 'CityBus', cat: 'Big rigs', type: 'car', style: 'bus', L: 12, W: 2.6, color: 0x1e5aa8, max: 30, accel: 3.4, grip: 7, wheel: 0.52, mass: 12000 },
  { id: 'truck', name: 'Delivery Truck', cat: 'Big rigs', type: 'car', style: 'box', L: 7.8, W: 2.45, color: 0xf0f0f0, extra: 'truck', boxH: 3.3, max: 38, accel: 4.5, grip: 7, wheel: 0.5, mass: 8000 },
  // two wheels
  { id: 'sportbike', name: 'Street Bike', cat: 'Bikes', type: 'bike', L: 2.1, W: 0.8, color: 0xcfb991, max: 78, accel: 15, grip: 9, wheel: 0.33, mass: 220 },
  { id: 'dirtbike', name: 'Dirt Bike', cat: 'Bikes', type: 'bike', L: 2.1, W: 0.8, color: 0xe85d1a, max: 46, accel: 12, grip: 10, wheel: 0.36, mass: 120, offroad: true },
  { id: 'bicycle', name: 'Campus Bicycle', cat: 'Bikes', type: 'bike', L: 1.8, W: 0.6, color: 0x2a7de1, max: 13, accel: 3.2, grip: 9, wheel: 0.34, mass: 80, pedal: true },
  // air
  { id: 'cessna', name: 'Skyhawk Trainer', cat: 'Aircraft', type: 'plane', L: 8.3, W: 11, color: 0xf5f5f5, stripe: 0xcfb991, stall: 24, max: 65, thrust: 7, roll: 1.5, pitch: 0.7, mass: 1000 },
  { id: 'jet', name: 'Boiler Jet', cat: 'Aircraft', type: 'plane', L: 15, W: 10, color: 0x5d6670, stall: 55, max: 240, thrust: 35, roll: 3.2, pitch: 1.4, mass: 9000, jet: true },
  { id: 'heli', name: 'News Chopper', cat: 'Aircraft', type: 'heli', L: 10, W: 2.0, color: 0x1f2a44, stripe: 0xcfb991, max: 70, mass: 2500 },
  // water
  { id: 'speedboat', name: 'Wabash Speedboat', cat: 'Boats', type: 'boat', L: 7, W: 2.4, color: 0xffffff, stripe: 0xc0392b, max: 32, accel: 7, grip: 2.2, mass: 1400 },
  { id: 'jetski', name: 'Jet Ski', cat: 'Boats', type: 'boat', L: 3.2, W: 1.2, color: 0x16a085, max: 26, accel: 9, grip: 2.8, mass: 350, rider: true },
  { id: 'pontoon', name: 'Pontoon Party Boat', cat: 'Boats', type: 'boat', L: 7.5, W: 2.6, color: 0xdcdcdc, max: 12, accel: 2.5, grip: 1.6, mass: 1800, pontoon: true },
];
export const byId = Object.fromEntries(CATALOG.map(s => [s.id, s]));
const RANDOM_COLORS = [0xf4f4f4, 0x1b1b1b, 0x8e9aa6, 0xb22222, 0x1f4e9c, 0x2e6b3a, 0x6d6d6d, 0xd8cfc0, 0x5a2a82, 0xe0e0e0, 0x30343a, 0x9b6b2f];

// ------------------------------------------------------------------ materials
const matCache = new Map();
function paint(color) {
  const k = 'p' + color;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshPhysicalMaterial({ color, metalness: 0.35, roughness: 0.45, clearcoat: 0.55, clearcoatRoughness: 0.12, envMapIntensity: 0.75 }));
  return matCache.get(k);
}
function flat(color, rough = 0.7, metal = 0) {
  const k = `f${color}|${rough}|${metal}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return matCache.get(k);
}
const GLASS = new THREE.MeshPhysicalMaterial({ color: 0x030405, metalness: 0.0, roughness: 0.06, clearcoat: 0.6, clearcoatRoughness: 0.05, envMapIntensity: 0.6 });
const CHROME = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.12 });
const RUBBER = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.6 });
const LENS = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 0, clearcoat: 1, emissive: 0xfff4dc, emissiveIntensity: 0.35 });
const TIRE = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.82 });
const RIM = new THREE.MeshStandardMaterial({ color: 0xc4c8ce, metalness: 1.0, roughness: 0.22 });
const HEAD = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 0.4 });
const TAIL = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.5 });

// computeVertexNormals leaves (0,0,0) on a vertex whose triangles all have zero area (for example
// the centre of an end cap whose ring has pinched to a line). The GPU then normalizes a zero
// vector, gets NaN, and bloom spreads that one pixel over the whole screen (a black frame).
// Point any such normal straight out from the middle of the part instead.
export function repairNormals(g) {
  const n = g.attributes.normal, p = g.attributes.position;
  if (!n) return 0;
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  let fixed = 0;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i), l = Math.hypot(x, y, z);
    if (l > 1e-6) continue;   // also false for NaN, so NaN gets repaired too
    let dx = p.getX(i) - c.x, dy = p.getY(i) - c.y, dz = p.getZ(i) - c.z;
    let d = Math.hypot(dx, dy, dz);
    if (!(d > 1e-6)) { dx = 0; dy = 1; dz = 0; d = 1; }
    n.setXYZ(i, dx / d, dy / d, dz / d); fixed++;
  }
  if (fixed) n.needsUpdate = true;
  return fixed;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; return m;
}
function cyl(rt, rb, h, mat, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.castShadow = true; return m;
}

// side profile (x = along length, +x front; y = up) extruded across the width
// taper: [yFrom, yTo, scaleAtTop] narrows the shape toward the top (tumblehome)
function extrudeProfile(pts, width, mat, bevel = 0.08, taper = null) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  if (taper) {
    const [y0, y1, k] = taper, pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const t = Math.min(1, Math.max(0, (pa.getY(i) - y0) / (y1 - y0)));
      pa.setX(i, pa.getX(i) * (1 - (1 - k) * t));
    }
  }
  g.computeVertexNormals(); repairNormals(g);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}

const BRAKE = new THREE.MeshStandardMaterial({ color: 0x5a5c60, metalness: 0.8, roughness: 0.45 });
const wheelCache = new Map();
function wheelGeo(r, w, spokes = 5) {
  const k = r.toFixed(2) + w.toFixed(2) + ':' + spokes;
  if (wheelCache.has(k)) return wheelCache.get(k);
  // tyre: lathe of a rounded profile (sidewall bulge), axis along X
  const prof = [];
  const rim = r * 0.64;
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + i / 12 * Math.PI; prof.push(new THREE.Vector2(r - 0.05 + Math.cos(a) * 0.05, (w / 2) * Math.sin(a) * 1.0)); }
  prof.unshift(new THREE.Vector2(rim, -w / 2 * 0.9)); prof.push(new THREE.Vector2(rim, w / 2 * 0.9));
  const tyre = new THREE.LatheGeometry(prof, 28); tyre.rotateZ(Math.PI / 2);
  const parts = [];
  const disc = new THREE.CylinderGeometry(rim, rim, w * 0.5, 24); disc.rotateZ(Math.PI / 2); disc.translate(-w * 0.05, 0, 0);
  const hub = new THREE.CylinderGeometry(rim * 0.22, rim * 0.22, w * 0.62, 12); hub.rotateZ(Math.PI / 2);
  const thin = spokes > 6 ? 0.55 : 1;
  for (let i = 0; i < spokes; i++) { const sp = new THREE.BoxGeometry(w * 0.2, rim * 0.95, rim * 0.16 * thin); sp.translate(w * 0.18, rim * 0.45, 0); sp.rotateX(i / spokes * Math.PI * 2); parts.push(sp); }
  const lip = new THREE.TorusGeometry(rim * 0.97, 0.018, 6, 28); lip.rotateY(Math.PI / 2); lip.translate(w * 0.28, 0, 0);
  const out = { tyre, disc, hub, spokes: parts, lip };
  wheelCache.set(k, out);
  return out;
}
function wheel(r, w, side = 1, spokes = 5, rimMat = RIM) {
  const G = wheelGeo(r, w, spokes);
  const g = new THREE.Group();
  const t = new THREE.Mesh(G.tyre, TIRE); t.castShadow = true; g.add(t);
  const d = new THREE.Mesh(G.disc, BRAKE); g.add(d);
  const h = new THREE.Mesh(G.hub, rimMat); g.add(h);
  for (const sp of G.spokes) g.add(new THREE.Mesh(sp, rimMat));
  g.add(new THREE.Mesh(G.lip, rimMat));
  g.scale.x = side;   // mirror so spokes face outwards on both sides
  const spin = new THREE.Group(); spin.add(g);
  const steer = new THREE.Group(); steer.add(spin);
  steer.userData.spin = spin;
  return steer;
}

// ------------------------------------------------------------------ smooth lofted bodies
// The body is a series of rounded-rectangle (superellipse) cross-sections along the car,
// so it has real curvature, rounded ends and wheel arches, and reflects the sky smoothly.
const ssf = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function loft(N, M, zFrom, zTo, section, groupOf) {
  const pos = [], groups = [[], [], []];
  for (let i = 0; i <= N; i++) {
    const z = zFrom + (zTo - zFrom) * i / N;
    const { hw, yb, yt, n = 4, tumble = 0.08 } = section(z);
    const yc = (yb + yt) / 2, hh = Math.max(0.001, (yt - yb) / 2);
    for (let j = 0; j < M; j++) {
      const th = j / M * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const x = hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * (1 - tumble * Math.max(0, sn));
      const y = yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + (j + 1) % M, c = (i + 1) * M + j, d = (i + 1) * M + (j + 1) % M;
    const ay = (pos[a * 3 + 1] + pos[d * 3 + 1]) / 2, az = (pos[a * 3 + 2] + pos[d * 3 + 2]) / 2, ax = pos[a * 3];
    const gi = groupOf ? groupOf(ax, ay, az) : 0;
    groups[gi].push(a, c, b, b, c, d);
  }
  // end caps
  for (const [ring, flip] of [[0, true], [N, false]]) {
    const ctr = pos.length / 3; let cx = 0, cy = 0;
    for (let j = 0; j < M; j++) { cx += pos[(ring * M + j) * 3]; cy += pos[(ring * M + j) * 3 + 1]; }
    pos.push(cx / M, cy / M, pos[ring * M * 3 + 2]);
    for (let j = 0; j < M; j++) { const a = ring * M + j, b = ring * M + (j + 1) % M; flip ? groups[0].push(ctr, a, b) : groups[0].push(ctr, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const idx = []; let start = 0;
  groups.forEach((gr, k) => { if (gr.length) { g.addGroup(start, gr.length, k); idx.push(...gr); start += gr.length; } });
  g.setIndex(idx);
  g.computeVertexNormals(); repairNormals(g);
  return g;
}

function smoothCar(g, spec, st, body, parts) {
  const { L, W } = spec, r = spec.wheel;
  const wb0 = Math.min(L * 0.62, L - 2 * r - 0.7) / 2;
  const cabFront = L / 2 - st.hood, cabBack = st.cab ? cabFront - st.cab : -L / 2 + st.deck;
  const deckZ = -L / 2 + Math.max(st.deck, 0.35);
  const topY = (z) => {
    if (z > cabFront) return st.belt + (st.nose - st.belt) * Math.pow(ssf(cabFront, L / 2, z), 1.4);
    if (z < deckZ) return st.belt + (st.tail - st.belt) * ssf(deckZ, -L / 2, z);
    return st.belt;
  };
  const archR = r + 0.1;
  const botY = (z) => {
    let y = st.cl;
    for (const az of [wb0, -wb0]) { const d = Math.abs(z - az); if (d < archR) y = Math.max(y, r + Math.sqrt(archR * archR - d * d) * 0.92); }
    return Math.min(y, topY(z) - 0.12);
  };
  const halfW = (z) => (W / 2) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(z) / (L / 2), 3.5)), 0.3);
  const trim = flat(0x141516, 0.65), accent = spec.extra === 'police' ? flat(0xf4f4f4, 0.3, 0.1) : body;
  const bodyGeo = loft(56, 24, -L / 2, L / 2, (z) => ({ hw: halfW(z), yb: botY(z), yt: topY(z), n: 5, tumble: 0.07 }),
    (x, y, z) => y < st.cl + 0.2 ? 1 : (spec.extra === 'police' && Math.abs(z) < 1.05 && y < st.belt - 0.08 && y > st.cl + 0.25 ? 2 : 0));
  const bm = new THREE.Mesh(bodyGeo, [body, trim, accent]); bm.castShadow = true; bm.receiveShadow = true; g.add(bm);
  // greenhouse (glass) — narrower towards the top
  const roofZ0 = cabBack + st.rs, roofZ1 = cabFront - st.ws;
  const ghTop = (z) => z > roofZ1 ? st.belt + (st.roof - st.belt) * ssf(cabFront, roofZ1, z) : z < roofZ0 ? st.belt + (st.roof - st.belt) * ssf(cabBack, roofZ0, z) : st.roof;
  const ghGeo = loft(32, 20, cabBack, cabFront, (z) => ({ hw: halfW(z) * 0.8, yb: st.belt - 0.1, yt: ghTop(z), n: 6, tumble: 0.3 }));
  const gm = new THREE.Mesh(ghGeo, GLASS); gm.castShadow = true; g.add(gm);
  // painted roof panel
  const rf = loft(20, 16, roofZ0 + 0.05, roofZ1 - 0.05, (z) => ({ hw: halfW(z) * 0.8 * 0.76, yb: st.roof - 0.06, yt: st.roof + 0.025, n: 6, tumble: 0 }));
  const rm = new THREE.Mesh(rf, body); rm.castShadow = true; g.add(rm);
  // lights, grille, mirrors, plates
  const noseY = (st.cl + st.nose) / 2 + 0.08, tailY = topY(-L / 2 + 0.05) - 0.11;
  for (const s of [1, -1]) {
    const hz = L / 2 - 0.2;
    // headlight cluster: dark housing, chrome reflector, lens
    const hw0 = Math.min(0.5, W * 0.24);
    const house = new THREE.Mesh(new THREE.BoxGeometry(hw0, 0.17, 0.2), flat(0x0d0d0e, 0.3, 0.6));
    house.position.set(s * (halfW(hz) - hw0 / 2 - 0.1), noseY, hz - 0.02); house.rotation.y = s * 0.12; g.add(house);
    for (const k of [0.27, -0.27]) {
      const refl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), CHROME); refl.rotation.x = Math.PI / 2;
      refl.position.set(s * (halfW(hz) - hw0 / 2 - 0.1) + k * hw0 * s, noseY, hz + 0.09); g.add(refl);
    }
    const hl = new THREE.Mesh(new THREE.BoxGeometry(hw0 * 0.95, 0.13, 0.03), HEAD);
    hl.position.set(s * (halfW(hz) - hw0 / 2 - 0.1), noseY, hz + 0.1); hl.rotation.y = s * 0.12; g.add(hl); parts.lights.push(hl);
    hl.material = LENS;
    // tail lights sit flush on the curved tail
    const tz = -L / 2 + 0.2, tw0 = Math.min(0.42, halfW(tz) * 0.5);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(tw0, 0.12, 0.08), TAIL.clone());
    tl.position.set(s * (halfW(tz) - tw0 / 2 - 0.04), tailY, tz - 0.1); tl.rotation.y = s * -0.25; g.add(tl); parts.brake.push(tl);
    // mirrors on little stalks
    const mir = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), body); mir.scale.set(0.2, 0.12, 0.1);
    mir.position.set(s * (halfW(cabFront - 0.2) * 0.86 + 0.06), st.belt + 0.1, cabFront - 0.25); mir.castShadow = true; g.add(mir);
    // door handles and door seams
    const doors = st.cab ? [cabFront - 0.6] : [cabFront - 0.55, (cabFront + cabBack) / 2 - 0.25];
    for (const dz of doors) {
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.18), CHROME);
      hd.position.set(s * halfW(dz) * 0.875, st.belt - 0.17, dz - 0.35); g.add(hd);
    }
  }
  const gh = (st.nose - st.cl) * 0.3;
  const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.4, gh, 0.05), flat(0x0b0b0c, 0.4, 0.5));
  grille.position.set(0, st.cl + (st.nose - st.cl) * 0.42, L / 2 - 0.01); g.add(grille);
  for (let i = 1; i < 4; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.39, 0.012, 0.02), CHROME); bar.position.set(0, grille.position.y - gh / 2 + gh * i / 4, L / 2 + 0.02); g.add(bar); }
  const intake = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.09, 0.05), flat(0x080808, 0.5, 0.2)); intake.position.set(0, st.cl + 0.1, L / 2 - 0.03); g.add(intake);
  const plateMat = flat(0xe8e6de, 0.5);
  const pf = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.11, 0.02), plateMat); pf.position.set(0, st.cl + 0.22, L / 2 + 0.01); g.add(pf);
  const pr = pf.clone(); pr.position.set(0, (st.tail + st.cl) / 2 - 0.02, -L / 2 - 0.01); g.add(pr);
  return { cabFront, cabBack, roofMid: (roofZ0 + roofZ1) / 2 };
}

// ------------------------------------------------------------------ models
const STYLES = {
  sedan: { cl: 0.3, belt: 0.95, roof: 1.46, nose: 0.74, tail: 0.92, hood: 1.25, deck: 0.95, ws: 0.75, rs: 0.6 },
  coupe: { cl: 0.26, belt: 0.86, roof: 1.25, nose: 0.6, tail: 0.85, hood: 1.5, deck: 0.75, ws: 0.95, rs: 0.95 },
  hyper: { cl: 0.2, belt: 0.78, roof: 1.12, nose: 0.42, tail: 0.86, hood: 1.6, deck: 0.95, ws: 1.05, rs: 1.25 },
  hatch: { cl: 0.3, belt: 0.95, roof: 1.52, nose: 0.76, tail: 0.98, hood: 1.0, deck: 0.18, ws: 0.75, rs: 0.25 },
  muscle: { cl: 0.3, belt: 0.92, roof: 1.32, nose: 0.82, tail: 0.88, hood: 1.95, deck: 0.95, ws: 0.8, rs: 0.75 },
  suv: { cl: 0.42, belt: 1.18, roof: 1.86, nose: 1.02, tail: 1.12, hood: 1.15, deck: 0.22, ws: 0.6, rs: 0.18 },
  pickup: { cl: 0.45, belt: 1.2, roof: 1.92, nose: 1.08, tail: 1.18, hood: 1.35, deck: 0, ws: 0.55, rs: 0.1, cab: 1.9 },
};

// tuning catalogue (materials are cached so many cars share them)
export const RIM_COLORS = { chrome: 0xc4c8ce, black: 0x1a1a1c, white: 0xeeeeee, bronze: 0x8c6a3a, gold: 0xd4a537 };
const rimMats = {};
const rimMat = (c) => rimMats[c] ||= (c === 'chrome' ? RIM : new THREE.MeshStandardMaterial({ color: RIM_COLORS[c], metalness: c === 'black' || c === 'white' ? 0.4 : 1, roughness: c === 'black' ? 0.35 : 0.2 }));
const tintMats = {};
const tintMat = (t) => tintMats[t] ||= (t === 1 ? GLASS : new THREE.MeshPhysicalMaterial({ color: [0x22323c, 0x030405, 0x010203, 0x000000][t], metalness: 0, roughness: [0.06, 0.06, 0.1, 0.14][t], clearcoat: [0.6, 0.6, 0.35, 0.25][t], clearcoatRoughness: 0.08, envMapIntensity: [0.7, 0.6, 0.4, 0.28][t] }));

function carModel(spec, color, tune = {}) {
  const g = new THREE.Group();
  const { L, W } = spec;
  const body = paint(color);
  const parts = { wheels: [], front: [], lights: [], brake: [], beacons: [] };
  const r = spec.wheel;
  if (spec.style === 'bus' || spec.style === 'box') {
    const cabL = spec.style === 'bus' ? 0 : 2.1;
    const H = spec.boxH || 3.2;
    if (spec.style === 'bus') {
      g.add(extrudeProfile([[-L / 2, 0.35], [L / 2, 0.35], [L / 2, H - 0.3], [L / 2 - 0.3, H], [-L / 2 + 0.2, H], [-L / 2, H - 0.2]], W, body, 0.06));
      g.add(box(W + 0.02, 1.05, L - 2.6, GLASS, 0, 2.05, -0.6));
      g.add(box(W - 0.3, 1.5, 0.05, GLASS, 0, 2.0, L / 2 + 0.01));
      g.add(box(W + 0.03, 0.18, L - 0.5, flat(0xcfb991, 0.5), 0, 1.25, 0));
    } else {
      g.add(extrudeProfile([[L / 2 - cabL, 0.4], [L / 2, 0.4], [L / 2, 1.15], [L / 2 - 0.55, 1.35], [L / 2 - 0.9, 2.3], [L / 2 - cabL, 2.35]], W - 0.1, body));
      g.add(box(W - 0.4, 0.75, 0.05, GLASS, 0, 1.85, L / 2 - 0.72).rotateX(-0.45));
      const boxMat = spec.extra === 'truck' ? flat(0xf0f0f0, 0.6) : body;
      g.add(box(W, H - 0.45, L - cabL - 0.1, boxMat, 0, (H + 0.45) / 2, -cabL / 2 - 0.05));
      if (spec.extra === 'ambulance') {
        g.add(box(W + 0.02, 0.28, L - cabL - 0.2, flat(0xd0121b, 0.5), 0, 1.4, -cabL / 2));
      }
      if (spec.extra === 'fire') {
        g.add(box(0.5, 0.2, L - 1.5, flat(0xd8d8d8, 0.4, 0.8), 0, H + 0.3, -0.5));
        for (let i = 0; i < 10; i++) g.add(box(0.6, 0.06, 0.06, flat(0xd8d8d8, 0.4, 0.8), 0, H + 0.42, -L / 2 + 1.5 + i * 0.75));
        g.add(box(W + 0.02, 0.18, L - 0.4, flat(0xf0d000, 0.5), 0, 1.0, 0));
      }
      if (spec.extra === 'tanker') {   // swap the box for a fuel tank
        g.children.pop();
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, L - cabL - 0.6, 24), flat(0xd8dadc, 0.25, 0.9));
        tank.rotation.x = Math.PI / 2; tank.position.set(0, 1.85, -cabL / 2 - 0.1); g.add(tank);
        g.add(box(W - 0.5, 0.25, L - cabL - 0.4, flat(0x222222, 0.6), 0, 0.75, -cabL / 2));
        for (const sx of [-1.105, 1.105]) g.add(box(0.02, 0.32, L - cabL - 1.4, flat(0xb0121b, 0.5), sx, 1.85, -cabL / 2 - 0.1));
      }
      if (spec.extra === 'truck') {
        g.add(box(W + 0.02, 0.6, L - cabL - 1, flat(0x7a1d2b, 0.5), 0, 2.0, -cabL / 2 - 0.05));
      }
    }
    if (spec.extra === 'ambulance' || spec.extra === 'fire') {
      for (const [x, c] of [[-0.5, 0xff1111], [0.5, spec.extra === 'fire' ? 0xff1111 : 0xffffff]]) {
        const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 0 });
        const b = box(0.5, 0.18, 0.3, m, x, (spec.boxH || 3) + 0.05, L / 2 - (spec.style === 'bus' ? 0.3 : 2.2));
        g.add(b); parts.beacons.push(b);
      }
    }
  } else {
    const st = STYLES[spec.style];
    const { cabFront, cabBack, roofMid } = smoothCar(g, spec, st, body, parts);
    if (st.cab) { // pickup bed liner
      g.add(box(W - 0.32, 0.04, cabBack + L / 2 - 0.25, flat(0x161616), 0, st.belt - 0.12, (cabBack - L / 2) / 2));
    }
    if (spec.extra === 'police') {
      const bar = box(1.3, 0.12, 0.3, flat(0x111111), 0, st.roof + 0.1, roofMid);
      g.add(bar);
      for (const [x, c] of [[-0.38, 0xff1020], [0.38, 0x1040ff]]) {
        const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 0 });
        const b = box(0.5, 0.14, 0.28, m, x, st.roof + 0.2, bar.position.z);
        g.add(b); parts.beacons.push(b);
      }
      g.add(box(W * 0.95, 0.25, 0.15, flat(0x111111, 0.5, 0.4), 0, st.cl + 0.2, L / 2 + 0.06)); // push bar
    }
    if (spec.extra === 'taxi') {
      const sign = box(0.8, 0.28, 0.25, new THREE.MeshStandardMaterial({ color: 0xfff7cc, emissive: 0xffe680, emissiveIntensity: 0.6 }), 0, st.roof + 0.15, roofMid);
      g.add(sign);
    }
    if (spec.style === 'hyper') {
      g.add(box(W * 0.78, 0.035, 0.28, flat(0x111111, 0.35, 0.3), 0, st.tail + 0.14, -L / 2 + 0.26)); // wing
      for (const sx of [-0.55, 0.55]) g.add(box(0.04, 0.14, 0.1, flat(0x111111, 0.4), sx, st.tail + 0.07, -L / 2 + 0.28));
    } else if (spec.style === 'coupe') {
      g.add(box(W * 0.7, 0.03, 0.12, body, 0, st.tail + 0.03, -L / 2 + 0.12)); // ducktail lip
    }
  }
  // lights (box-bodied vehicles; smooth cars add their own)
  const st = STYLES[spec.style] || { nose: 1.0, tail: 1.0 };
  const boxy = spec.style === 'bus' || spec.style === 'box';
  const lightY = spec.style === 'bus' ? 0.9 : spec.style === 'box' ? 1.0 : st.nose - 0.12;
  const tailY = spec.style === 'bus' || spec.style === 'box' ? 1.0 : st.tail - 0.12;
  if (boxy) for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) {
    const h = box(0.42, 0.14, 0.05, HEAD, x, lightY, L / 2 + 0.04); g.add(h); parts.lights.push(h);
    const t = box(0.38, 0.14, 0.05, TAIL.clone(), x, tailY, -L / 2 - 0.04); g.add(t); parts.brake.push(t);
  }
  // wheels
  const wb = Math.min(L * 0.62, L - 2 * r - 0.7), tw = W / 2 - 0.2;
  const axles = spec.style === 'bus' ? [L / 2 - 2.4, -L / 2 + 3.0] : [wb / 2, -wb / 2];
  for (const z of axles) for (const x of [tw, -tw]) {
    const w = wheel(r, 0.26 + (spec.mass > 3000 ? 0.12 : 0), Math.sign(x), tune.spokes || 5, rimMat(tune.rim || 'chrome'));
    w.position.set(x, r, z);
    g.add(w); parts.wheels.push(w);
    if (z > 0) parts.front.push(w);
  }
  // tuning: window tint, spoiler, ride height (body moves, wheels stay on the ground)
  if (tune.tint !== undefined && tune.tint !== 1) g.traverse(o => { if (o.isMesh && o.material === GLASS) o.material = tintMat(tune.tint); });
  if (tune.spoiler && !boxy && spec.style !== 'hyper') {
    const st2 = STYLES[spec.style];
    const wingMat = tune.spoiler === 1 ? body : flat(0x111111, 0.35, 0.3);
    const [wy, wd, wwid, legs] = [[0, 0, 0, 0], [0.04, 0.12, 0.7, 0], [0.16, 0.26, 0.76, 0.13], [0.3, 0.32, 0.86, 0.27]][tune.spoiler];
    const wing = box(W * wwid, 0.035, wd, wingMat, 0, st2.tail + wy, -L / 2 + 0.25); wing.rotation.x = -0.08; g.add(wing);
    if (legs) for (const sx of [-0.45, 0.45]) g.add(box(0.04, legs, 0.08, flat(0x111111, 0.4), sx * W * wwid, st2.tail + wy - legs / 2, -L / 2 + 0.27));
  }
  if (tune.height) for (const o of g.children) if (!parts.wheels.includes(o)) o.position.y += tune.height * 0.05;
  g.userData.parts = parts;
  return { g, wb: axles[0] - axles[1], track: tw * 2 };
}

function bikeModel(spec, color) {
  const g = new THREE.Group();
  const parts = { wheels: [], front: [], lights: [], brake: [], beacons: [] };
  const r = spec.wheel, L = spec.L;
  const body = paint(color);
  const frame = flat(0x222222, 0.5, 0.6);
  if (spec.pedal) {
    const tube = (a, b) => {
      const d = new THREE.Vector3().subVectors(b, a), m = cyl(0.025, 0.025, d.length(), frame, 6);
      m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); g.add(m);
    };
    const bb = new THREE.Vector3(0, 0.32, 0.05), seat = new THREE.Vector3(0, 0.95, -0.2), head = new THREE.Vector3(0, 1.0, 0.45);
    const fa = new THREE.Vector3(0, r, L / 2 - r), ra = new THREE.Vector3(0, r, -L / 2 + r);
    tube(bb, seat); tube(seat, head); tube(bb, head); tube(bb, ra); tube(seat, ra); tube(head, fa);
    const pmat = paint(color); g.children.forEach(c => c.material = pmat);
    g.add(box(0.2, 0.05, 0.28, flat(0x111111), 0, 1.0, -0.22));
    g.add(box(0.55, 0.03, 0.03, frame, 0, 1.12, 0.45));
  } else {
    // side-profile pieces (x = forward, y = up), extruded across the bike
    const F = L / 2, dirt = !!spec.offroad;
    const prof = (pts, w, mat, bev = 0.025) => { const m = extrudeProfile(pts.map(([z, y]) => [z, y]), w, mat, bev); g.add(m); return m; };
    const dark = flat(0x18181a, 0.55, 0.3), metal = flat(0x9a9ea4, 0.3, 0.9), rubber = flat(0x111111, 0.85);
    if (!dirt) {
      prof([[F - 0.14, 0.86], [F - 0.1, 0.97], [F - 0.3, 1.15], [F - 0.5, 1.17], [F - 0.62, 1.0], [F - 0.62, 0.74], [F - 0.4, 0.7]], 0.34, body, 0.05);   // front fairing
      prof([[0.3, 0.98], [0.2, 1.1], [-0.12, 1.08], [-0.3, 0.98], [-0.25, 0.88], [0.25, 0.88]], 0.32, body, 0.06);                                       // tank
      prof([[-0.3, 0.98], [-0.62, 0.99], [-0.66, 0.94], [-0.3, 0.93]], 0.27, rubber, 0.02);                                                              // seat
      prof([[-0.6, 0.92], [-0.66, 0.99], [-F + 0.06, 1.06], [-F + 0.03, 1.0], [-0.82, 0.86]], 0.22, body, 0.04);                                               // tail
      prof([[0.36, 0.74], [0.3, 0.5], [0.12, 0.4], [-0.2, 0.42], [0.0, 0.62]], 0.36, body, 0.04);                                            // belly fairing
      const scr = prof([[F - 0.28, 1.18], [F - 0.42, 1.34], [F - 0.5, 1.21]], 0.3, GLASS, 0.01);
    } else {
      prof([[0.28, 0.95], [0.18, 1.08], [-0.15, 1.06], [-0.25, 0.92], [0.25, 0.86]], 0.3, body);                                                         // tank
      prof([[-0.1, 1.04], [-0.75, 1.02], [-0.8, 0.98], [-0.1, 0.98]], 0.24, rubber, 0.02);                                                              // long seat
      prof([[-0.7, 0.98], [-F + 0.05, 1.08], [-F + 0.1, 1.02], [-0.7, 0.94]], 0.18, body);                                                             // rear fender
      prof([[F - 0.25, 1.0], [F + 0.08, 0.98], [F + 0.06, 0.94], [F - 0.25, 0.95]], 0.16, body);                                                       // front fender
      prof([[F - 0.42, 1.0], [F - 0.36, 1.24], [F - 0.5, 1.22], [F - 0.55, 1.02]], 0.26, body);                                                       // number plate
    }
    // engine block, cylinders, frame, swingarm, forks, discs, exhaust, bars, mirrors
    g.add(box(0.3, 0.32, 0.46, dark, 0, 0.55, 0.02));
    for (const zz of [-0.06, 0.1]) { const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12), metal); c2.position.set(0, 0.74, zz); c2.rotation.x = 0.35; g.add(c2); }
    const tube = (a, b, rad, mat) => { const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, d.length(), 10), mat); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); m.castShadow = true; g.add(m); return m; };
    const head = new THREE.Vector3(0, 1.05, F - 0.45), fa = new THREE.Vector3(0, r, F - r), ra = new THREE.Vector3(0, r, -F + r), piv = new THREE.Vector3(0, 0.52, -0.25);
    for (const sx of [-0.1, 0.1]) {
      tube(new THREE.Vector3(sx, head.y, head.z), new THREE.Vector3(sx, fa.y, fa.z), 0.028, dirt ? metal : flat(0xc9a64a, 0.3, 0.9));                    // forks
      tube(new THREE.Vector3(sx, piv.y, piv.z), new THREE.Vector3(sx * 1.2, ra.y, ra.z), 0.03, dark);                                                     // swingarm
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.012, 24), metal); disc.rotation.z = Math.PI / 2; disc.position.set(sx * 0.9, fa.y, fa.z); g.add(disc);
    }
    tube(head, new THREE.Vector3(0, 0.9, -0.35), 0.035, dark); tube(new THREE.Vector3(0, 0.9, -0.35), piv, 0.035, dark);
    const shock = tube(new THREE.Vector3(0, 0.95, -0.3), new THREE.Vector3(0, 0.45, -0.55), 0.03, flat(0xd8b04a, 0.35, 0.8));
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.55, 14), flat(0x8a8a8a, 0.25, 1));
    if (dirt) { ex.rotation.x = Math.PI / 2 - 0.35; ex.position.set(0.17, 0.82, -0.55); } else { ex.rotation.x = Math.PI / 2 + 0.3; ex.position.set(0.18, 0.62, -0.72); }
    g.add(ex);
    tube(new THREE.Vector3(-0.36, dirt ? 1.22 : 1.1, F - 0.5), new THREE.Vector3(0.36, dirt ? 1.22 : 1.1, F - 0.5), 0.016, dark);                         // bars
    for (const sx of [-0.33, 0.33]) g.add(box(0.05, 0.035, 0.12, rubber, sx, dirt ? 1.22 : 1.1, F - 0.5));                                               // grips
    if (!dirt) for (const sx of [-0.26, 0.26]) { tube(new THREE.Vector3(sx * 0.8, 1.16, F - 0.42), new THREE.Vector3(sx, 1.26, F - 0.36), 0.008, dark); g.add(box(0.08, 0.05, 0.015, GLASS, sx, 1.27, F - 0.35)); }
  }
  const h = box(0.14, 0.1, 0.05, HEAD, 0, spec.pedal ? 0.95 : 1.05, L / 2 - 0.35); g.add(h); parts.lights.push(h);
  const t = box(0.14, 0.06, 0.05, TAIL.clone(), 0, 0.85, -L / 2 + 0.1); g.add(t); parts.brake.push(t);
  for (const z of [L / 2 - r, -L / 2 + r]) {
    const w = wheel(r, spec.pedal ? 0.05 : 0.14);
    w.position.set(0, r, z); g.add(w); parts.wheels.push(w);
    if (z > 0) parts.front.push(w);
  }
  g.userData.parts = parts;
  g.userData.seat = new THREE.Vector3(0, spec.pedal ? 0.95 : 0.9, -0.3);
  return { g, wb: L - 2 * r, track: 0.1 };
}

function planeModel(spec) {
  const g = new THREE.Group();
  const parts = { wheels: [], front: [], lights: [], brake: [], beacons: [], props: [] };
  const body = paint(spec.color);
  if (spec.jet) {
    const fus = cyl(0.25, 0.85, spec.L * 0.62, body, 16); fus.rotation.x = Math.PI / 2; fus.position.set(0, 1.9, 1.2); g.add(fus);
    const nose = cyl(0.01, 0.25, 3.2, body, 16); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.9, 1.2 + spec.L * 0.31 + 1.6); g.add(nose);
    const tail = cyl(0.85, 0.75, 4, body, 16); tail.rotation.x = Math.PI / 2; tail.position.set(0, 1.9, -4.6); g.add(tail);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), GLASS);
    canopy.scale.set(1, 0.9, 3); canopy.position.set(0, 2.45, 3.4); g.add(canopy);
    const wingS = new THREE.Shape([new THREE.Vector2(0, 2.8), new THREE.Vector2(5, -1.6), new THREE.Vector2(5, -2.6), new THREE.Vector2(0, -3.4)]);
    for (const s of [1, -1]) {
      const wg = new THREE.ExtrudeGeometry(wingS, { depth: 0.14, bevelEnabled: false });
      wg.rotateX(Math.PI / 2);
      const w = new THREE.Mesh(wg, body); w.scale.x = s; w.position.set(0, 1.9, 0); w.castShadow = true; g.add(w);
      const fin = box(0.12, 2.4, 2.0, body, s * 1.0, 3.2, -5.3); fin.rotation.z = s * 0.35; fin.rotation.x = -0.3; g.add(fin);
      const st = box(2.6, 0.1, 1.5, body, s * 1.9, 1.9, -5.6); g.add(st);
    }
    const ab = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.3, 1.6, 16), new THREE.MeshBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0, depthWrite: false }));
    ab.rotation.x = Math.PI / 2; ab.position.set(0, 1.9, -7.2); g.add(ab); parts.afterburner = ab;
    for (const [x, z] of [[0, 4.5], [1.4, -0.5], [-1.4, -0.5]]) { const w = wheel(0.35, 0.2); w.position.set(x, 0.35, z); g.add(w); parts.wheels.push(w); g.add(box(0.1, 1.2, 0.1, flat(0x333333), x, 1.0, z)); }
    g.userData.gear = 0;
  } else {
    // high-wing trainer
    g.add(extrudeProfile([[-4.4, 1.25], [-1.0, 0.8], [1.6, 0.75], [2.6, 1.0], [2.6, 1.85], [1.4, 2.35], [-0.6, 2.35], [-4.4, 1.6]], 1.2, body));
    g.add(extrudeProfile([[1.3, 1.75], [-0.4, 1.75], [-0.6, 2.3], [1.1, 2.3]], 1.24, GLASS, 0.03));
    g.add(box(spec.W, 0.14, 1.5, body, 0, 2.42, 0.4));
    g.add(box(spec.W * 0.3, 0.02, 1.0, flat(spec.stripe, 0.5), 0, 2.5, 0.5));
    g.add(box(3.4, 0.1, 1.0, body, 0, 1.55, -4.0));
    g.add(box(0.1, 1.5, 1.2, body, 0, 2.35, -4.1));
    g.add(box(0.12, 0.6, 0.5, flat(spec.stripe, 0.5), 0, 2.8, -4.2));
    for (const s of [1, -1]) { const strut = box(0.06, 1.3, 0.06, flat(0x999999), s * 1.4, 1.75, 0.6); strut.rotation.z = s * 0.7; g.add(strut); }
    const spinner = cyl(0.01, 0.18, 0.4, flat(0xcfb991, 0.4, 0.6)); spinner.rotation.x = Math.PI / 2; spinner.position.set(0, 1.42, 2.82); g.add(spinner);
    const prop = new THREE.Group(); prop.position.set(0, 1.42, 2.7);
    prop.add(box(0.14, 1.9, 0.04, flat(0x222222)));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.0, depthWrite: false }));
    prop.add(disc); prop.userData.disc = disc;
    g.add(prop); parts.props.push(prop);
    for (const [x, z, rr] of [[0, 2.0, 0.22], [1.1, -0.2, 0.28], [-1.1, -0.2, 0.28]]) {
      const w = wheel(rr, 0.12); w.position.set(x, rr, z); g.add(w); parts.wheels.push(w);
      g.add(box(0.06, 0.7, 0.06, flat(0x777777), x * 0.8, 0.55, z));
    }
  }
  const nav = (x, c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, spec.jet ? 1.9 : 2.45, spec.jet ? -1.7 : 0.4); g.add(m); parts.beacons.push(m); };
  nav(spec.jet ? 5 : spec.W / 2, 0x00ff44); nav(spec.jet ? -5 : -spec.W / 2, 0xff1111);
  g.userData.parts = parts;
  return { g, wb: 2, track: 2 };
}

function heliModel(spec) {
  const g = new THREE.Group();
  const parts = { wheels: [], front: [], lights: [], brake: [], beacons: [], rotor: null, tail: null };
  const body = paint(spec.color);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), body); cab.scale.set(1, 0.95, 1.7); cab.position.set(0, 1.75, 0.6); cab.castShadow = true; g.add(cab);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 14, -Math.PI / 2, Math.PI, 0, Math.PI / 1.7), GLASS); glass.scale.set(1.02, 0.95, 1.72); glass.position.set(0, 1.8, 0.65); g.add(glass);
  const boom = cyl(0.18, 0.4, 5.6, body); boom.rotation.x = Math.PI / 2; boom.position.set(0, 2.0, -3.6); g.add(boom);
  g.add(box(0.1, 1.3, 0.8, body, 0, 2.6, -6.3));
  g.add(box(1.8, 0.08, 0.5, body, 0, 2.0, -5.6));
  g.add(box(2.6, 0.02, 0.25, flat(spec.stripe || 0xcfb991, 0.5), 0, 1.6, 2.0).rotateZ(0));
  for (const s of [1, -1]) {
    g.add(box(0.1, 0.08, 3.4, flat(0x333333, 0.4, 0.7), s * 0.95, 0.05, 0.4));
    for (const z of [-0.5, 1.3]) g.add(box(0.07, 0.7, 0.07, flat(0x333333, 0.4, 0.7), s * 0.85, 0.4, z));
  }
  g.add(cyl(0.15, 0.25, 0.6, flat(0x333333)).translateY(3.05).translateZ(0.3));
  const rotor = new THREE.Group(); rotor.position.set(0, 3.35, 0.3);
  for (let i = 0; i < 4; i++) { const b = box(0.28, 0.04, 5.2, flat(0x222222)); b.position.z = 2.6; const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2; arm.add(b); rotor.add(arm); }
  g.add(rotor); parts.rotor = rotor;
  const tail = new THREE.Group(); tail.position.set(0.12, 2.7, -6.4);
  for (let i = 0; i < 2; i++) { const b = box(0.03, 1.2, 0.12, flat(0x222222)); b.rotation.x = i * Math.PI / 2; tail.add(b); }
  g.add(tail); parts.tail = tail;
  const bcn = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  bcn.position.set(0, 2.9, -6.6); g.add(bcn); parts.beacons.push(bcn);
  g.userData.parts = parts;
  return { g, wb: 2, track: 2 };
}

function boatModel(spec) {
  const g = new THREE.Group();
  const parts = { wheels: [], front: [], lights: [], brake: [], beacons: [], seatVisible: !!spec.rider };
  const { L, W } = spec;
  const hullMat = paint(spec.color);
  if (spec.pontoon) {
    for (const s of [1, -1]) { const p = cyl(0.35, 0.35, L - 0.6, flat(0xc8c8c8, 0.3, 0.8), 16); p.rotation.x = Math.PI / 2; p.position.set(s * 0.95, 0.15, 0); g.add(p); const c = cyl(0.01, 0.35, 0.6, flat(0xc8c8c8, 0.3, 0.8), 16); c.rotation.x = Math.PI / 2; c.position.set(s * 0.95, 0.15, L / 2 - 0.0); g.add(c); }
    g.add(box(W, 0.12, L - 0.4, flat(0x8a6a48, 0.9), 0, 0.62, 0));
    for (const s of [1, -1]) g.add(box(0.05, 0.75, L - 1.2, flat(0xeeeeee, 0.4), s * (W / 2 - 0.05), 1.05, -0.2));
    for (const [x, z] of [[1, 1.5], [-1, 1.5], [1, -2.5], [-1, -2.5]]) g.add(box(0.06, 2.0, 0.06, flat(0xbbbbbb, 0.4, 0.8), x * (W / 2 - 0.1), 1.6, z));
    g.add(box(W, 0.06, 4.4, flat(spec.stripe || 0x2266aa, 0.7), 0, 2.6, -0.5));
    for (const z of [-2.5, 0.5]) g.add(box(W - 0.6, 0.5, 0.8, flat(0x24477a, 0.8), 0, 0.95, z));
    g.add(box(0.6, 0.9, 0.5, flat(0x333333), 0, 0.5, -L / 2 + 0.2));
  } else {
    // hull: tapered bow from a top-down outline, extruded downward
    const s = new THREE.Shape();
    s.moveTo(-W / 2, -L / 2); s.lineTo(W / 2, -L / 2); s.lineTo(W / 2, L * 0.15);
    s.quadraticCurveTo(W / 2, L * 0.42, 0, L / 2); s.quadraticCurveTo(-W / 2, L * 0.42, -W / 2, L * 0.15); s.closePath();
    const hg = new THREE.ExtrudeGeometry(s, { depth: spec.rider ? 0.55 : 0.95, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 2 });
    hg.rotateX(Math.PI / 2); hg.translate(0, spec.rider ? 0.55 : 1.0, 0);
    const hull = new THREE.Mesh(hg, hullMat); hull.castShadow = true; g.add(hull);
    if (spec.stripe) g.add(box(W + 0.02, 0.16, L * 0.6, flat(spec.stripe, 0.5), 0, 0.6, -L * 0.15));
    if (spec.rider) {
      g.add(box(0.5, 0.25, 1.2, flat(0x111111, 0.8), 0, 0.75, -0.3));
      g.add(box(0.7, 0.05, 0.05, flat(0x333333), 0, 1.05, 0.5));
    } else {
      g.add(box(W - 0.3, 0.06, L * 0.7, flat(0xf2efe6, 0.8), 0, 1.03, -L * 0.1));
      g.add(box(W - 0.4, 0.5, 0.06, GLASS, 0, 1.35, L * 0.12).rotateX(-0.6));
      for (const z of [-L * 0.32, -L * 0.12]) g.add(box(W - 0.7, 0.45, 0.6, flat(0xb03030, 0.7), 0, 1.25, z));
      g.add(box(0.5, 1.0, 0.45, flat(0x222222, 0.5, 0.4), 0, 0.9, -L / 2 - 0.15));
    }
  }
  g.userData.parts = parts;
  g.userData.seat = new THREE.Vector3(0, spec.rider ? 0.85 : 1.1, spec.rider ? -0.3 : -1.0);
  return { g, wb: L * 0.6, track: W };
}

export function buildModel(spec, color, tune = null) {
  if (spec.type === 'car') return carModel(spec, color, tune || {});
  if (spec.type === 'bike') return bikeModel(spec, color);
  if (spec.type === 'plane') return planeModel(spec);
  if (spec.type === 'heli') return heliModel(spec);
  return boatModel(spec);
}

// ------------------------------------------------------------------ vehicle
let uid = 1;
export class Vehicle {
  constructor(spec, world, opts = {}) {
    this.id = uid++;
    this.spec = typeof spec === 'string' ? byId[spec] : spec;
    this.world = world;
    const color = opts.color ?? (this.spec.color === 'random' ? RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)] : this.spec.color);
    this.color = color; this.tune = opts.tune || null;
    const { g, wb, track } = buildModel(this.spec, color, this.tune);
    this.mesh = g; this.parts = g.userData.parts; this.wb = wb; this.track = track;
    g.userData.own = new Set(g.children);
    this.tunePerf = perfOf(this.tune);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.yawRate = 0; this.steerAng = 0;
    this.q = new THREE.Quaternion();
    this.onGround = true; this.hp = 100; this.dead = false; this.burn = 0;
    this.throttle = 0; this.rpm = 0; this.spin = 0; this.nitro = 1; this.boosting = false;
    this.driver = null; this.kinematic = false; this.sirenOn = false; this.drifting = 0;
    this.rotorSpeed = 0; this.inWater = 0; this.lean = 0; this.headlights = false;
    this.radius = Math.min(this.spec.W, this.spec.L) / 2;
    const ROOF = { coupe: 1.28, hyper: 1.18, sedan: 1.47, hatch: 1.5, muscle: 1.36, suv: 1.82, pickup: 1.85, bus: 3.1 };
    this.height = this.spec.type === 'car' ? (this.spec.boxH || ROOF[this.spec.style] || 1.5) : this.spec.type === 'bike' ? 1.1 : 1.5;
    this.events = [];
  }
  get type() { return this.spec.type; }
  get speed() { return Math.hypot(this.vel.x, this.vel.z, this.type === 'plane' || this.type === 'heli' ? this.vel.y : 0); }
  get forward() { return tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get airborne() { return (this.type === 'plane' || this.type === 'heli') && !this.onGround; }

  place(x, z, yaw = 0, y = null) {
    this.yaw = yaw;
    const gnd = this.world.groundAt(x, z, y);
    let gy = gnd.y;
    if (this.type === 'boat') gy = gnd.water ?? gy;
    this.pos.set(x, y ?? gy, z);
    this.vel.set(0, 0, 0); this.yawRate = 0; this.pitch = 0; this.roll = 0;
    this.q.setFromAxisAngle(UP, yaw);
    this.onGround = true; this.throttle = 0;
    this.sync();
    return this;
  }

  // garage: rebuild the model with new paint / tint / rims / spoiler / height, keep everything else
  retune(tune) {
    this.tune = { ...tune };
    if (tune.color !== undefined) this.color = tune.color;
    const old = this.mesh, parent = old.parent;
    const { g } = buildModel(this.spec, this.color, this.tune);
    const own = old.userData.own;   // children the model builder made; anything else (rider, headlight) moves over
    g.userData.own = new Set(g.children);
    for (const c of [...old.children]) if (!own || !own.has(c)) g.add(c);
    g.position.copy(old.position); g.quaternion.copy(old.quaternion); g.scale.copy(old.scale);
    this.mesh = g; this.parts = g.userData.parts;
    if (parent) { parent.remove(old); parent.add(g); }
    this.tunePerf = perfOf(this.tune);
    this.sync();
  }

  damage(n) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) { this.hp = 0; this.burn = this.burn || 4; }
  }

  update(dt, ctl, fx) {
    if (!(dt > 0)) return;
    if (this.dead) { this.sync(); return; }
    this.events.length = 0;
    if (this.burn > 0) {
      this.burn -= dt;
      if (Math.random() < 0.5) fx?.emit('fire', tmp2.copy(this.pos).setY(this.pos.y + 1.2), null, 1);
      if (this.burn <= 0) { this.dead = true; this.events.push('explode'); }
    } else if (this.hp < 40 && Math.random() < dt * (60 - this.hp)) fx?.emit('smoke', tmp2.copy(this.pos).setY(this.pos.y + 1.2), this.vel);
    const c = ctl || NO_INPUT;
    if (this.kinematic) { this.sync(dt, c); return; }
    switch (this.type) {
      case 'car': case 'bike': this.updateGround(dt, c, fx); break;
      case 'boat': this.updateBoat(dt, c, fx); break;
      case 'plane': this.updatePlane(dt, c, fx); break;
      case 'heli': this.updateHeli(dt, c, fx); break;
    }
    this.sync(dt, c);
  }

  // ---------------------------------------------------------------- cars & bikes
  updateGround(dt, c, fx) {
    const s = this.spec, w = this.world;
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    let vf = this.vel.x * f.x + this.vel.z * f.z;
    let vr = this.vel.x * r.x + this.vel.z * r.z;
    const gnd = w.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const onGround = this.pos.y <= gnd.y + 0.08 && this.inWater < 0.5;
    const surf = gnd.kind;
    const off = surf === 'ground' && !s.offroad ? 1 : 0; // rough
    const drowned = this.inWater > 0.5;
    this.boosting = false;
    if (onGround && !drowned) {
      let thr = c.throttle;
      if (this.hp <= 0) thr = 0;
      const pm = this.perf || { accel: 1, max: 1, grip: 1, nitro: 1 };
      let accel = s.accel * ROAD_ACCEL * pm.accel * (1 - off * 0.15);
      let maxV = s.max * ROAD_TOP * pm.max * (1 - off * 0.3);
      if (c.boost && this.nitro > 0 && thr > 0 && s.type === 'car') {
        this.nitro = Math.max(0, this.nitro - dt * 0.22); accel *= 1.8; maxV *= 1.25; this.boosting = true;
      } else this.nitro = Math.min(1, this.nitro + dt * 0.05 * pm.nitro);
      const k = accel / (maxV * maxV);
      if (thr > 0) {
        if (vf < -0.5) vf += 14 * dt * thr;             // braking while reversing
        else vf += accel * thr * dt;
      } else if (thr < 0) {
        if (vf > 0.5) vf -= 15 * dt * -thr;              // brake
        else vf -= accel * 0.55 * -thr * dt;             // reverse
      }
      vf -= k * vf * Math.abs(vf) * dt + Math.sign(vf) * Math.min(Math.abs(vf), (0.35 + off * 0.5) * dt);
      vf = Math.max(vf, -12);
      if (c.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 6 * dt);
      // gravity along slope
      const n = w.normalAt(this.pos.x, this.pos.z);
      vf += (n.x * f.x + n.z * f.z) * G * dt * 0.9;
      // steering
      // keyboard steering is all-or-nothing: ease the wheel in (and snap it back faster when you let go)
      const sIn = this.steerIn || 0, back = Math.abs(c.steer) < Math.abs(sIn) || c.steer * sIn < 0;
      this.steerIn = sIn + (c.steer - sIn) * Math.min(1, dt * (back ? 10 : 6));
      const target = this.steerIn * (s.type === 'bike' ? 0.5 : 0.62) / (1 + Math.abs(vf) / (s.type === 'bike' ? 26 : 20));
      this.steerAng += (target - this.steerAng) * Math.min(1, dt * 8);
      let yr = -vf * Math.tan(this.steerAng) / Math.max(1.5, this.wb);
      const grip = c.handbrake ? 1.4 : (s.grip * (this.perf?.grip || 1)) * (1 - off * 0.3);
      // the tyres only have so much sideways grip: at speed the turn rate is capped (about 1.6 g),
      // so a tap of A/D at 60 mph is a lane change, not a spin into a wall
      const aLat = 16 * (s.grip * (this.perf?.grip || 1) / 9) * (1 - off * 0.3);
      const yrMax = aLat / Math.max(3, Math.abs(vf)) * (c.handbrake ? 1.7 : 1);
      if (c.handbrake && Math.abs(vf) > 6) yr *= 1.45;
      yr = Math.max(-yrMax, Math.min(yrMax, yr));
      this.yawRate += (yr - this.yawRate) * Math.min(1, dt * (c.handbrake ? 4 : 7));
      this.yaw += this.yawRate * dt;
      // lateral grip with slip: centripetal force keeps velocity aligned
      const slip = Math.abs(vr);
      // tyres pull the sideways slide back in line; a car nobody is driving (shoved, crashed) slides
      // on with ~1g of friction instead of stopping dead, so hits actually send cars skidding
      if (c !== NO_INPUT) vr *= Math.exp(-grip * dt);
      else vr -= Math.sign(vr) * Math.min(Math.abs(vr), Math.min(grip * Math.abs(vr), 9.5) * dt);
      this.drifting = slip > 3 ? Math.min(1, slip / 10) : 0;
      if (this.drifting && fx && Math.random() < 0.6) fx.emit(off ? 'dust' : 'tyre', this.rearPos(), null);
      if (off && Math.abs(vf) > 10 && fx && Math.random() < 0.15) fx.emit('dust', this.rearPos(), null);
      // reconstruct with the new heading
      f.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); r.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      this.vel.x = f.x * vf + r.x * vr; this.vel.z = f.z * vf + r.z * vr;
    } else {
      // airborne or sinking
      this.yaw += this.yawRate * dt;
      this.yawRate *= Math.exp(-dt * 0.5);
      if (drowned) { this.vel.multiplyScalar(Math.exp(-dt * 2.5)); }
    }
    this.vel.y -= G * 1.35 * dt;
    if (drowned) this.vel.y = Math.max(this.vel.y, -1.2);
    const oldY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);
    // collisions with buildings / trees (two circles front & back)
    this.collideWorld(dt, fx);
    // ground follow
    const g2 = w.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= g2.y) {
      if (this.vel.y < -12) { this.damage(-this.vel.y * 2); this.events.push('land'); }
      this.pos.y = g2.y;
      if (onGround) this.vel.y = Math.max(-20, Math.min(20, (this.pos.y - oldY) / dt));
      else this.vel.y = 0;
    } else if (onGround && this.pos.y - g2.y < 0.45 && this.vel.y <= 0.5) {
      this.pos.y = g2.y; // stick to gentle downhill
      this.vel.y = (this.pos.y - oldY) / dt;
    }
    this.onGround = this.pos.y <= g2.y + 0.08;
    // water
    if (g2.water !== null && this.pos.y < g2.water - 0.3) {
      if (this.inWater === 0) { this.events.push('splash'); fx?.emit('splash', this.pos, this.vel, 20); }
      this.inWater += dt;
    }
    // ground visuals: pitch & roll from terrain under the wheels
    if (this.onGround) {
      const hf = w.groundAt(this.pos.x + f.x * this.wb / 2, this.pos.z + f.z * this.wb / 2, this.pos.y + 1).y;
      const hb = w.groundAt(this.pos.x - f.x * this.wb / 2, this.pos.z - f.z * this.wb / 2, this.pos.y + 1).y;
      const tw = Math.max(this.track, 1.2);
      const hl = w.groundAt(this.pos.x - r.x * tw / 2, this.pos.z - r.z * tw / 2, this.pos.y + 1).y;
      const hr = w.groundAt(this.pos.x + r.x * tw / 2, this.pos.z + r.z * tw / 2, this.pos.y + 1).y;
      this.pitch += (-Math.atan2(hf - hb, this.wb) - this.pitch) * Math.min(1, dt * 10);
      this.roll += (Math.atan2(hl - hr, tw) - this.roll) * Math.min(1, dt * 10);
    } else {
      this.pitch += (0.15 - this.pitch) * dt * 0.6;
    }
    if (s.type === 'bike') {
      const lean = this.onGround ? Math.max(-0.75, Math.min(0.75, -this.yawRate * Math.abs(vf) * 0.09)) : this.lean;
      this.lean += (lean - this.lean) * Math.min(1, dt * 6);
    }
    this.rpm = Math.min(1, Math.abs(vf) / topSpeed(s) * 1.2 + Math.max(0, c.throttle) * 0.25);
  }

  rearPos() {
    return tmp2.set(this.pos.x - Math.sin(this.yaw) * this.spec.L * 0.4, this.pos.y + 0.3, this.pos.z - Math.cos(this.yaw) * this.spec.L * 0.4);
  }

  collideWorld(dt, fx) {
    const s = this.spec, w = this.world;
    const rad = this.type === 'plane' ? 2.5 : Math.max(0.5, s.W / 2);
    const half = Math.max(0, s.L / 2 - rad);
    const f = tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const yb = this.pos.y + 0.35, yt = this.pos.y + this.height;
    let hit = null;
    for (const k of half > 0.1 ? [half, -half] : [0]) {
      const cx = this.pos.x + f.x * k, cz = this.pos.z + f.z * k;
      const res = w.collide(cx, cz, rad, yb, yt);
      if (res.hit) {
        this.pos.x += res.x - cx; this.pos.z += res.z - cz;
        hit = res;
        const vn = this.vel.x * res.nx + this.vel.z * res.nz;
        if (vn < 0) {
          const impact = -vn;
          this.vel.x -= res.nx * vn * 1.3; this.vel.z -= res.nz * vn * 1.3;
          this.vel.multiplyScalar(0.85);
          if (impact > 4) {
            this.damage(impact * (res.what === 'tree' ? 0.6 : 1.0) * (this.spec.mass > 3000 ? 0.4 : 1));
            this.events.push({ crash: impact });
            fx?.emit('spark', this.pos.clone().setY(this.pos.y + 0.6), null, Math.min(20, impact | 0));
          }
        }
      }
    }
    return hit;
  }

  // ---------------------------------------------------------------- boats
  updateBoat(dt, c, fx) {
    const s = this.spec, w = this.world;
    const gnd = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
    const inWater = gnd.water !== null;
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    let vf = this.vel.x * f.x + this.vel.z * f.z, vr = this.vel.x * r.x + this.vel.z * r.z;
    if (inWater && this.hp > 0) {
      const k = s.accel / (s.max * s.max);
      if (c.throttle > 0) vf += s.accel * c.throttle * dt;
      else if (c.throttle < 0) vf -= s.accel * 0.5 * -c.throttle * dt;
      vf -= k * vf * Math.abs(vf) * dt + vf * 0.15 * dt;
      vf = Math.max(vf, -6);
      const yr = -c.steer * (0.9 + Math.abs(vf) * 0.03) * Math.min(1, Math.abs(vf) / 4 + 0.15) * Math.sign(vf || 1);
      this.yawRate += (yr - this.yawRate) * Math.min(1, dt * 2.5);
      vr *= Math.exp(-(s.grip * (this.perf?.grip || 1)) * dt);
      if (Math.abs(vf) > 4 && fx && Math.random() < 0.7) fx.emit('wake', this.rearPos().setY(0.2), null);
      if (Math.abs(vf) > 12 && fx && Math.random() < 0.3) fx.emit('splash', tmp2.copy(this.pos).addScaledVector(f, s.L * 0.3).setY(0.3), null);
    } else {
      vf *= Math.exp(-dt * 3); vr *= Math.exp(-dt * 3); this.yawRate *= Math.exp(-dt * 3);
      if (c.throttle) vf += c.throttle * 1.5 * dt; // shove off the bank
    }
    this.yaw += this.yawRate * dt;
    f.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); r.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.vel.x = f.x * vf + r.x * vr; this.vel.z = f.z * vf + r.z * vr;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.collideWorld(dt, fx);
    const g2 = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
    const t = performance.now() / 1000;
    const bob = Math.sin(t * 1.7 + this.id) * 0.06;
    const ty = g2.water !== null ? g2.water + bob - 0.05 + Math.min(0.25, Math.abs(vf) * 0.012) : g2.y;
    this.pos.y += (ty - this.pos.y) * Math.min(1, dt * 6);
    this.pitch += ((g2.water !== null ? -Math.min(0.14, Math.abs(vf) * 0.007) : 0) + Math.sin(t * 1.3 + this.id) * 0.02 - this.pitch) * Math.min(1, dt * 3);
    this.roll += (this.yawRate * Math.abs(vf) * 0.03 + Math.sin(t * 1.1) * 0.02 - this.roll) * Math.min(1, dt * 3);
    this.onGround = true;
    this.rpm = Math.min(1, Math.abs(vf) / s.max + Math.max(0, c.throttle) * 0.3);
  }

  // ---------------------------------------------------------------- planes
  updatePlane(dt, c, fx) {
    const s = this.spec, w = this.world;
    this.throttle = Math.max(0, Math.min(1, this.throttle + c.throttle * dt * 0.6));
    if (this.hp <= 0) this.throttle = 0;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q);
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(this.q);
    let spd = this.vel.dot(fwd);
    const thrust = s.thrust * this.throttle * (c.boost && s.jet ? 1.6 : 1);
    const dragK = s.thrust / (s.max * s.max);
    spd += (thrust - dragK * spd * Math.abs(spd) - G * fwd.y * 0.7) * dt;
    const gnd = w.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const gearH = 0;
    const lift = THREE.MathUtils.clamp((spd - s.stall * 0.55) / (s.stall * 0.45), 0, 1.15);
    const auth = THREE.MathUtils.clamp(spd / s.stall, 0.12, 1.3);
    if (this.onGround) {
      spd -= (c.handbrake ? 9 : 0.6) * Math.sign(spd) * dt;
      if (spd < 0 && thrust === 0) spd = Math.max(spd, 0);
      // nose wheel steering
      const yr = -c.steer * 0.7 * Math.min(1, Math.abs(spd) / 6 + 0.25) / (1 + Math.abs(spd) / 25) - c.yaw * 0.3;
      tmpQ.setFromAxisAngle(UP, yr * dt); this.q.premultiply(tmpQ);
      // level the wings; allow rotation (nose up) above takeoff speed
      const e = tmpE.setFromQuaternion(this.q, 'YXZ');
      let pitch = e.x;
      const wantUp = c.pitch > 0 && spd > s.stall * 0.85;
      pitch = wantUp ? pitch - c.pitch * s.pitch * 0.6 * dt : pitch + (0 - pitch) * Math.min(1, dt * 3);
      pitch = Math.min(0, Math.max(-0.35, pitch));
      this.q.setFromEuler(tmpE.set(pitch, e.y, 0, 'YXZ'));
      const nf = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
      this.vel.copy(nf).multiplyScalar(spd);
      if (lift > 0.85 && pitch < -0.08) { this.vel.y += 2.5; this.onGround = false; this.events.push('takeoff'); }
      else this.vel.y = 0;
      if (gnd.water !== null) { this.crash(fx); return; }
    } else {
      // rates in local frame: pitch about X (negative = nose up), yaw about Y, roll about Z
      const pr = -c.pitch * s.pitch * auth, rr = c.roll * s.roll * auth, yr = -c.yaw * 0.45 * auth;
      tmpE.set(pr * dt, yr * dt, rr * dt, 'XYZ');
      this.q.multiply(tmpQ.setFromEuler(tmpE));
      // bank-to-turn + gentle auto-level
      const bank = Math.asin(THREE.MathUtils.clamp(left.y, -1, 1));
      tmpQ.setFromAxisAngle(UP, -Math.sin(bank) * 0.9 * Math.min(1, auth) * dt * (s.jet ? 1.3 : 1));
      this.q.premultiply(tmpQ);
      if (!c.roll) this.q.multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -bank * 0.9 * dt));
      // stall: nose drops
      if (lift < 0.6) this.q.multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (0.6 - lift) * 0.8 * dt));
      this.q.normalize();
      const nf = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
      const fall = this.vel.y - nf.y * spd;
      let sink = fall - G * (1 - Math.min(1, lift)) * dt;
      sink *= Math.exp(-dt * 1.5 * Math.min(1, lift));
      this.vel.copy(nf).multiplyScalar(spd); this.vel.y += sink;
    }
    this.pos.addScaledVector(this.vel, dt);
    // collisions
    const res = w.collide(this.pos.x, this.pos.z, 2.2, this.pos.y + 0.5, this.pos.y + 2.5);
    if (res.hit && res.what !== 'edge') {
      if (this.speed > 9) { this.crash(fx); return; }
      this.pos.x = res.x; this.pos.z = res.z; this.vel.multiplyScalar(0.3);
    } else if (res.hit) { this.pos.x = res.x; this.pos.z = res.z; this.q.premultiply(tmpQ.setFromAxisAngle(UP, Math.PI * dt)); }
    const g2 = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
    if (this.pos.y <= g2.y + gearH) {
      const e = tmpE.setFromQuaternion(this.q, 'YXZ');
      const hardV = -this.vel.y, badAttitude = e.x > 0.25 || Math.abs(e.z) > 0.45;
      if (!this.onGround && (g2.water !== null || hardV > 7 || badAttitude || g2.kind === 'roof' && this.speed > 15)) { this.crash(fx); return; }
      this.pos.y = g2.y + gearH;
      if (!this.onGround) this.events.push('touchdown');
      this.onGround = true; this.vel.y = 0;
    }
    if (this.pos.y > 2500) { this.pos.y = 2500; this.vel.y = Math.min(0, this.vel.y); }
    this.rpm = 0.25 + this.throttle * 0.75;
    this.airspeed = spd;
    this.stalling = !this.onGround && lift < 0.55;
  }

  crash(fx) {
    if (this.dead) return;
    this.hp = 0; this.burn = 0.01; this.vel.multiplyScalar(0.1);
    const g = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 2);
    this.pos.y = Math.max(g.water ?? g.y, Math.min(this.pos.y, g.y + 1));
    this.events.push('crash');
  }

  // ---------------------------------------------------------------- helicopters
  updateHeli(dt, c, fx) {
    const w = this.world;
    const on = this.hp > 0;
    this.rotorSpeed = Math.max(0, Math.min(1, this.rotorSpeed + (on && this.driver ? dt * 0.55 : -dt * 0.25)));
    const power = this.rotorSpeed;
    // tilt follows input
    const tp = c.throttle * 0.32, tr = (c.roll || 0) * 0.28;
    this.pitch += (tp - this.pitch) * Math.min(1, dt * 2.5);
    this.roll += (tr - this.roll) * Math.min(1, dt * 2.5);
    this.yawRate += (-c.steer * 1.4 * power - this.yawRate) * Math.min(1, dt * 3);
    this.yaw += this.yawRate * dt;
    const f = tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const r = tmp2.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const acc = 22 * power;
    this.vel.x += (f.x * this.pitch + r.x * this.roll) * acc * dt;
    this.vel.z += (f.z * this.pitch + r.z * this.roll) * acc * dt;
    const climb = (c.up ? 9 : 0) - (c.down ? 9 : 0);
    const hoverLift = power > 0.85 ? 1 : power;
    this.vel.y += (climb * power + G * hoverLift - G) * dt;
    this.vel.y *= Math.exp(-dt * 1.2);
    const hdamp = Math.exp(-dt * 0.45);
    this.vel.x *= hdamp; this.vel.z *= hdamp;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > this.spec.max) { this.vel.x *= this.spec.max / sp; this.vel.z *= this.spec.max / sp; }
    this.pos.addScaledVector(this.vel, dt);
    const res = w.collide(this.pos.x, this.pos.z, 2.6, this.pos.y + 0.6, this.pos.y + 3.4);
    if (res.hit) {
      const vn = this.vel.x * res.nx + this.vel.z * res.nz;
      this.pos.x = res.x; this.pos.z = res.z;
      if (vn < 0) { this.vel.x -= res.nx * vn * 1.6; this.vel.z -= res.nz * vn * 1.6; if (-vn > 6 && res.what !== 'edge') { this.damage(-vn * 3); this.events.push({ crash: -vn }); } }
    }
    const g2 = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
    if (this.pos.y <= g2.y) {
      if (this.vel.y < -9) this.damage(-this.vel.y * 4);
      if (g2.water !== null && this.pos.y < g2.water - 0.5) { this.crash(fx); return; }
      this.pos.y = g2.y; this.vel.y = Math.max(0, this.vel.y);
      this.vel.x *= Math.exp(-dt * 4); this.vel.z *= Math.exp(-dt * 4);
      this.onGround = true;
    } else this.onGround = this.pos.y <= g2.y + 0.05;
    if (this.pos.y > 1500) { this.pos.y = 1500; this.vel.y = Math.min(0, this.vel.y); }
    if (power > 0.5 && this.pos.y - g2.y < 12 && fx && Math.random() < 0.4) fx.emit(g2.water !== null ? 'splash' : 'dust', new THREE.Vector3(this.pos.x + (Math.random() - 0.5) * 10, g2.y + 0.2, this.pos.z + (Math.random() - 0.5) * 10), null);
    this.rpm = power;
  }

  // ---------------------------------------------------------------- visuals
  sync(dt = 0, c = NO_INPUT) {
    const m = this.mesh;
    m.position.copy(this.pos);
    if (this.type === 'plane') m.quaternion.copy(this.q);
    else {
      m.quaternion.setFromEuler(tmpE.set(this.pitch, this.yaw, this.roll + (this.type === 'bike' ? this.lean : 0), 'YXZ'));
      this.q.copy(m.quaternion);
    }
    const p = this.parts;
    const vf = this.type === 'plane' ? this.vel.length() : this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
    this.spin += vf * dt / (this.spec.wheel || 0.35);
    for (const w of p.wheels) w.userData.spin.rotation.x = this.spin;
    for (const w of p.front) w.rotation.y = this.steerAng;
    const braking = c.throttle < 0 && vf > 1 || c.handbrake;
    for (const b of p.brake) b.material.emissiveIntensity = braking ? 3 : (this.headlights ? 1.2 : 0.4);
    for (const l of p.lights) l.material.emissiveIntensity = this.headlights ? 4 : 0.4;
    if (p.beacons.length) {
      const t = performance.now() / 1000;
      p.beacons.forEach((b, i) => {
        if (b.material.isMeshBasicMaterial) b.visible = ((t * 1.2 + i * 0.5) % 1) < 0.15 || this.type !== 'heli' && i < 2;
        else b.material.emissiveIntensity = this.sirenOn ? (((t * 4 + i * 0.5) % 1) < 0.5 ? 9 : 0.2) : 0.2;
      });
    }
    if (p.props) for (const pr of p.props) { pr.rotation.z += this.rpm * dt * 80; pr.userData.disc.material.opacity = this.rpm * 0.25; }
    if (p.rotor) { p.rotor.rotation.y += this.rotorSpeed * dt * 28; p.tail.rotation.x += this.rotorSpeed * dt * 40; }
    if (p.afterburner) p.afterburner.material.opacity = Math.max(0, this.throttle - 0.6) * 1.8 + (c.boost ? 0.4 : 0);
    if (this.dead && !this.charred) {
      this.charred = true;
      m.traverse(o => { if (o.isMesh) { o.material = flat(0x1c1a19, 1); } });
    }
  }
}

// ECU chip stages
export function perfOf(t) { const e = t?.ecu || 0; return { accel: 1 + [0, 0.1, 0.2, 0.32][e], max: 1 + [0, 0.04, 0.08, 0.12][e], grip: 1 + (t?.height < 0 ? 0.04 * -t.height : 0) }; }

export const NO_INPUT = { throttle: 0, steer: 0, handbrake: false, up: false, down: false, yaw: 0, pitch: 0, roll: 0, boost: false };
