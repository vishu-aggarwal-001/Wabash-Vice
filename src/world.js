// World: loads the real OpenStreetMap-derived data and builds the 3D city,
// plus every spatial query gameplay needs (ground height, water, collisions,
// street names, districts).
import * as THREE from 'three';
import * as TX from './textures.js';

const CHUNK = 1000;      // render chunk size (m) for frustum culling
const GRID = 40;         // spatial hash cell (m) for gameplay queries
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

function mergeGeoms(list) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const g of list) {
    const base = pos.length / 3, gi = g.toNonIndexed ? g : g;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U.getX(i), U.getY(i)); }
    const I = g.index;
    if (I) for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(base + i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

// ------------------------------------------------------------------ geometry builder
class GB {
  constructor(withAtlas = false) {
    this.p = []; this.n = []; this.uv = []; this.c = []; this.a = withAtlas ? [] : null;
  }
  get count() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, u, w, r = 1, g = 1, b = 1, ax = 0, ay = 0) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, w); this.c.push(r, g, b);
    if (this.a) this.a.push(ax, ay);
  }
  // triangle with automatic winding so it faces `want` (a normal-ish vector)
  tri(A, B, C, want, col, atl) {
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nx * want[0] + ny * want[1] + nz * want[2] < 0) { [B, C] = [C, B]; nx = -nx; ny = -ny; nz = -nz; }
    const [r, g, b] = col || [1, 1, 1]; const [ax, ay] = atl || [0, 0];
    for (const P of [A, B, C]) this.v(P[0], P[1], P[2], nx, ny, nz, P[3], P[4], r, g, b, ax, ay);
  }
  quad(A, B, C, D, want, col, atl) { this.tri(A, B, C, want, col, atl); this.tri(A, C, D, want, col, atl); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.a) g.setAttribute('atl', new THREE.Float32BufferAttribute(this.a, 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// atlas sampling: repeating UVs inside one tile of the 4x3 building atlas
// (colour, normal, roughness/metalness and night-window maps all share the layout)
const TS = 'vec2(0.25, 0.33333)';
function atlasMaterial({ map, normalMap, roughMap, emissiveMap }) {
  const m = new THREE.MeshStandardMaterial({
    map, normalMap, roughnessMap: roughMap, metalnessMap: roughMap, emissiveMap,
    emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: 1.0,
  });
  const S = (tex, uv) => `textureGrad(${tex}, vAtl + (0.004 + fract(${uv}) * 0.992) * ${TS}, dFdx(${uv}) * ${TS}, dFdy(${uv}) * ${TS})`;
  const patch = (src, chunk, tex, uv) => src.replace(`#include <${chunk}>`, THREE.ShaderChunk[chunk].split(`texture2D( ${tex}, ${uv} )`).join(S(tex, uv)));
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 atl;\nvarying vec2 vAtl;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvAtl = atl;');
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vAtl;');
    f = patch(f, 'map_fragment', 'map', 'vMapUv');
    f = patch(f, 'emissivemap_fragment', 'emissiveMap', 'vEmissiveMapUv');
    f = patch(f, 'roughnessmap_fragment', 'roughnessMap', 'vRoughnessMapUv');
    f = patch(f, 'metalnessmap_fragment', 'metalnessMap', 'vMetalnessMapUv');
    f = patch(f, 'normal_fragment_maps', 'normalMap', 'vNormalMapUv');
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'wv-atlas';
  return m;
}

function pointInPoly(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const PAL = {
  house: [[1, 1, 1], [1.0, 0.96, 0.86], [0.82, 0.9, 0.98], [0.86, 0.86, 0.84], [1.0, 0.94, 0.75], [0.82, 0.9, 0.8], [0.95, 0.85, 0.78], [0.7, 0.72, 0.74]],
  brick: [[1, 1, 1], [0.94, 0.92, 0.9], [1.05, 1.0, 0.95], [0.86, 0.8, 0.76], [1.1, 1.04, 0.96]],
  glass: [[1, 1, 1], [0.92, 0.97, 1.02], [0.96, 1, 0.96]],
  apt: [[1, 1, 1], [0.95, 0.92, 0.86], [0.88, 0.88, 0.88], [1.04, 0.98, 0.9]],
  metal: [[1, 1, 1], [0.9, 0.95, 1.0], [1.0, 0.97, 0.9], [0.8, 0.85, 0.8]],
  stucco: [[1, 1, 1], [1.02, 0.96, 0.86], [0.9, 0.9, 0.88], [1.05, 1.0, 0.94]],
  stone: [[1, 1, 1], [0.95, 0.93, 0.9]],
  roof: [[1, 1, 1], [0.85, 0.85, 0.88], [1.05, 1.03, 1.0]],
  shingle: [[1, 1, 1], [0.8, 0.62, 0.55], [0.7, 0.75, 0.85], [0.85, 0.85, 0.8], [0.6, 0.6, 0.62]],
};
// 12 atlas tiles, see tools/build_textures.py
const TILE = Array.from({ length: 12 }, (_, i) => [(i % 4) * 0.25, (2 - Math.floor(i / 4)) / 3]);
const TILE_PAL = ['house', 'brick', 'glass', 'apt', 'metal', 'stucco', 'roof', 'shingle', 'brick', 'stucco', 'stucco', 'stone'];

function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
function pick(arr, r) { return arr[Math.floor(r * arr.length) % arr.length]; }

export class World {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.renderer = renderer; this.quality = quality;
    this.group = new THREE.Group(); scene.add(this.group);
    this.nightMats = []; this.time = 0;
  }

  // ---------------------------------------------------------------- loading
  async load(progress = () => {}) {
    progress(0.02, 'Downloading West Lafayette + Lafayette map data…');
    const [map, terr, ground] = await Promise.all([
      fetch('data/map.json').then(r => r.json()),
      fetch('data/terrain.bin').then(r => r.arrayBuffer()),
      new THREE.TextureLoader().loadAsync('data/ground.jpg'),
    ]);
    this.map = map;
    const i16 = new Int16Array(terr);
    this.h = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) this.h[i] = i16[i] / 10;
    Object.assign(this, { minX: map.minX, minZ: map.minZ, W: map.width, Hh: map.height, cell: map.cell, nx: map.nx, nz: map.nz });
    this.maxX = this.minX + this.W; this.maxZ = this.minZ + this.Hh;
    ground.colorSpace = THREE.SRGBColorSpace;
    ground.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    ground.flipY = false; ground.needsUpdate = true;
    this.groundTex = ground;
    progress(0.08, 'Loading photo-scanned materials…');
    await this.loadTextures();

    this.computeRiver();
    progress(0.12, 'Raising the Wabash valley…'); await nextFrame();
    this.buildTerrain();
    this.buildWater();
    progress(0.22, 'Paving State Street, Northwestern Ave, Main Street…'); await nextFrame();
    this.buildRoads();
    progress(0.42, `Constructing ${map.buildings.length.toLocaleString()} real buildings…`); await nextFrame();
    this.buildBuildings();
    progress(0.65, 'Building the Purdue Bell Tower and the Courthouse…'); await nextFrame();
    this.buildLandmarks();
    progress(0.75, `Planting ${map.trees.length.toLocaleString()} trees…`); await nextFrame();
    this.buildTrees();
    this.buildLamps();
    progress(0.9, 'Indexing streets…'); await nextFrame();
    this.indexRoadNames();
    this.buildGraph();
  }

  async loadTextures() {
    const L = new THREE.TextureLoader(), aniso = this.renderer.capabilities.getMaxAnisotropy();
    const lo = this.quality.textures === 'lo' ? 'facade_lo' : 'facade';
    const files = {
      facadeD: [`${lo}_d.jpg`, 1], facadeN: [`${lo}_n.jpg`, 0], facadeR: [`${lo}_r.jpg`, 0], facadeE: [`${lo}_e.jpg`, 1],
      roadMajor: ['road_major.jpg', 1], roadMinor: ['road_minor.jpg', 1], roadPlain: ['road_plain.jpg', 1], roadFoot: ['road_foot.jpg', 1], roadRail: ['road_rail.jpg', 1],
      asphaltN: ['asphalt_n.jpg', 0], concreteN: ['concrete_n.jpg', 0],
      grassD: ['grass_d.jpg', 1], grassN: ['grass_n.jpg', 0], concreteD: ['ground_concrete_d.jpg', 1],
      barkD: ['bark_d.jpg', 1], barkN: ['bark_n.jpg', 0], foliage: ['foliage.png', 1],
    };
    this.tex = {};
    await Promise.all(Object.entries(files).map(async ([k, [f, srgb]]) => {
      const t = await L.loadAsync('data/tex/' + f);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      if (!k.startsWith('facade')) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      this.tex[k] = t;
    }));
    // average colour of the detail photos, used to keep the baked land-cover hue
    const avg = (img) => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return new THREE.Color(d[0] / 255, d[1] / 255, d[2] / 255).convertSRGBToLinear(); };
    this.grassAvg = avg(this.tex.grassD.image); this.concreteAvg = avg(this.tex.concreteD.image);
  }

  toWorld(lat, lon) {
    return [(lon - this.map.origin[1]) * this.map.kx, -(lat - this.map.origin[0]) * this.map.kz];
  }

  // ---------------------------------------------------------------- terrain
  hRaw(ix, iz) {
    ix = ix < 0 ? 0 : ix >= this.nx ? this.nx - 1 : ix;
    iz = iz < 0 ? 0 : iz >= this.nz ? this.nz - 1 : iz;
    return this.h[iz * this.nx + ix];
  }
  heightAt(x, z) {
    let fx = (x - this.minX) / this.cell, fz = (z - this.minZ) / this.cell;
    fx = Math.min(Math.max(fx, 0), this.nx - 1.001); fz = Math.min(Math.max(fz, 0), this.nz - 1.001);
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
    const i = iz * this.nx + ix, h = this.h;
    // match the triangle split used by the render mesh
    if (tx + tz <= 1) return h[i] + (h[i + 1] - h[i]) * tx + (h[i + this.nx] - h[i]) * tz;
    const h11 = h[i + this.nx + 1];
    return h11 + (h[i + this.nx] - h11) * (1 - tx) + (h[i + 1] - h11) * (1 - tz);
  }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 2;
    return out.set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e)).normalize();
  }

  computeRiver() {
    this.riverX = new Float32Array(this.nz);
    let last = 0;
    for (let iz = 0; iz < this.nz; iz++) {
      let s = 0, n = 0;
      for (let ix = 0; ix < this.nx; ix++) if (this.h[iz * this.nx + ix] < -0.3) { s += ix; n++; }
      this.riverX[iz] = n ? this.minX + (s / n) * this.cell : NaN;
    }
    for (let iz = 0; iz < this.nz; iz++) if (!isNaN(this.riverX[iz])) { last = this.riverX[iz]; break; }
    for (let iz = 0; iz < this.nz; iz++) { if (isNaN(this.riverX[iz])) this.riverX[iz] = last; else last = this.riverX[iz]; }
  }

  buildTerrain() {
    const T = this.tex;
    const nrm = T.grassN.clone(); nrm.needsUpdate = true;
    nrm.repeat.set(this.W / 3.2, this.Hh / 3.2);
    const mat = new THREE.MeshStandardMaterial({ map: this.groundTex, normalMap: nrm, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.97, metalness: 0 });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, { grassMap: { value: T.grassD }, concMap: { value: T.concreteD }, grassAvg: { value: this.grassAvg }, concAvg: { value: this.concreteAvg } });
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D grassMap, concMap;\nuniform vec3 grassAvg, concAvg;\nvarying vec3 vWPos;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 base = diffuseColor.rgb;
          float green = clamp((base.g - max(base.r, base.b)) * 18.0, 0.0, 1.0);
          float dist = length(vWPos - cameraPosition);
          vec3 g1 = texture2D(grassMap, vWPos.xz / 3.2).rgb, g2 = texture2D(grassMap, vWPos.xz / 41.0 + 0.31).rgb;
          vec3 gd = mix(g1, g2, 0.3 + 0.5 * smoothstep(60.0, 400.0, dist)) / grassAvg;
          vec3 cd = texture2D(concMap, vWPos.xz / 4.0).rgb / concAvg;
          vec3 detail = mix(cd, gd, green);
          float k = 1.0 - 0.55 * smoothstep(150.0, 1200.0, dist);
          diffuseColor.rgb = base * mix(vec3(1.0), detail, k);`);
    };
    this.terrainMat = mat;
    const cellsPer = CHUNK / this.cell;
    const { nx, nz, cell, minX, minZ, W, Hh } = this;
    for (let cz = 0; cz * cellsPer < nz - 1; cz++) for (let cx = 0; cx * cellsPer < nx - 1; cx++) {
      const x0 = cx * cellsPer, z0 = cz * cellsPer;
      const x1 = Math.min(x0 + cellsPer, nx - 1), z1 = Math.min(z0 + cellsPer, nz - 1);
      const w = x1 - x0 + 1, d = z1 - z0 + 1;
      const pos = new Float32Array(w * d * 3), nor = new Float32Array(w * d * 3), uv = new Float32Array(w * d * 2);
      let k = 0;
      for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++, k++) {
        const x = minX + ix * cell, z = minZ + iz * cell;
        pos[k * 3] = x; pos[k * 3 + 1] = this.hRaw(ix, iz); pos[k * 3 + 2] = z;
        const n = new THREE.Vector3(this.hRaw(ix - 1, iz) - this.hRaw(ix + 1, iz), 2 * cell, this.hRaw(ix, iz - 1) - this.hRaw(ix, iz + 1)).normalize();
        nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z;
        uv[k * 2] = (x - minX) / W; uv[k * 2 + 1] = (z - minZ) / Hh;
      }
      const idx = [];
      for (let j = 0; j < d - 1; j++) for (let i = 0; i < w - 1; i++) {
        const a = j * w + i, b = a + 1, c = a + w, e = c + 1;
        idx.push(a, c, b, b, c, e);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.group.add(m);
    }
    // skirt to the horizon so the world doesn't end in a cliff
    const ring = [];
    for (let ix = 0; ix < nx; ix += 4) ring.push([ix, 0]);
    for (let iz = 0; iz < nz; iz += 4) ring.push([nx - 1, iz]);
    for (let ix = nx - 1; ix >= 0; ix -= 4) ring.push([ix, nz - 1]);
    for (let iz = nz - 1; iz >= 0; iz -= 4) ring.push([0, iz]);
    const gb = new GB();
    const cxm = minX + W / 2, czm = minZ + Hh / 2;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      const A = [minX + ax * cell, this.hRaw(ax, az), minZ + az * cell], B = [minX + bx * cell, this.hRaw(bx, bz), minZ + bz * cell];
      const out = (P) => { const dx = P[0] - cxm, dz = P[2] - czm, l = Math.hypot(dx, dz); return [P[0] + dx / l * 9000, P[1] - 2, P[2] + dz / l * 9000]; };
      const C = out(B), D = out(A);
      for (const P of [A, B, C, D]) { P[3] = 0; P[4] = 0; }
      gb.quad(A, B, C, D, [0, 1, 0]);
    }
    const skirt = new THREE.Mesh(gb.geometry(), new THREE.MeshStandardMaterial({ color: 0x5e7a3c, roughness: 1 }));
    skirt.receiveShadow = false;
    this.group.add(skirt);
  }

  buildWater() {
    const nmap = TX.waterNormalTexture();
    nmap.repeat.set(2200, 2200);
    this.waterNormal = nmap;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x24414a, roughness: 0.12, metalness: 0.05, normalMap: nmap, normalScale: new THREE.Vector2(0.22, 0.22),
      transparent: true, opacity: 0.92, envMapIntensity: 0.75,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), mat);
    water.rotation.x = -Math.PI / 2; water.position.y = this.map.waterLevel;
    water.receiveShadow = true;
    water.renderOrder = 1;
    this.water = water;
    water.userData.noAO = true;
    this.group.add(water);
  }

  // ---------------------------------------------------------------- roads + bridges
  buildRoads() {
    const types = this.map.roadTypes, widths = this.map.roadWidth;
    const cls = { motorway: 'major', trunk: 'major', primary: 'major', secondary: 'major', link: 'major', tertiary: 'minor', residential: 'minor', unclassified: 'minor', service: 'plain', track: 'plain', pedestrian: 'foot', footway: 'foot', rail: 'rail' };
    const yoff = { foot: 0.04, plain: 0.07, minor: 0.1, major: 0.13, rail: 0.08 };
    const T = this.tex;
    const tex = { major: T.roadMajor, minor: T.roadMinor, plain: T.roadPlain, foot: T.roadFoot, rail: T.roadRail };
    const nrep = { major: [11 / 4, 3], minor: [7.5 / 4, 3], plain: [4.5 / 4, 3], foot: [1, 5], rail: [1, 4] };
    const order = { foot: 1, plain: 2, rail: 2, minor: 3, major: 4 };
    const mats = {};
    for (const k in tex) {
      const n = (k === 'foot' ? T.concreteN : T.asphaltN).clone(); n.needsUpdate = true; n.repeat.set(...nrep[k]);
      mats[k] = new THREE.MeshStandardMaterial({ map: tex[k], normalMap: n, normalScale: new THREE.Vector2(0.8, 0.8), roughness: k === 'foot' ? 0.88 : 0.82, polygonOffset: true, polygonOffsetFactor: -1 - order[k], polygonOffsetUnits: -2 - order[k] * 2 });
    }
    const cmap = T.concreteD.clone(); cmap.needsUpdate = true; cmap.repeat.set(0.5, 0.5);
    const concrete = new THREE.MeshStandardMaterial({ map: cmap, color: 0xc8c4bc, roughness: 0.9 });
    const buckets = new Map();
    const bucket = (k, x, z) => {
      const key = `${k}|${Math.floor(x / CHUNK)}|${Math.floor(z / CHUNK)}`;
      if (!buckets.has(key)) buckets.set(key, { k, gb: new GB() });
      return buckets.get(key).gb;
    };
    this.bridgeSegs = [];
    this.brGrid = new Map();
    this.roadSegs = [];
    for (const [ti, ni, flags, P] of this.map.roads) {
      const tname = types[ti], c = cls[tname];
      const w = widths[tname], hw = w / 2;
      const isBridge = flags & 1;
      const n = P.length / 3;
      const gb = bucket(c, P[0], P[2]);
      const sb = isBridge ? bucket('concrete', P[0], P[2]) : null;
      let cum = 0;
      const L = [], R = [];
      for (let i = 0; i < n; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
        let tx = P[ib * 3] - P[ia * 3], tz = P[ib * 3 + 2] - P[ia * 3 + 2];
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        let mit = 1;
        if (i > 0 && i < n - 1) {
          let ax = x - P[ia * 3], az = z - P[ia * 3 + 2]; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
          mit = Math.min(2, 1 / Math.max(0.5, ax * tx + az * tz));
        }
        if (i > 0) cum += Math.hypot(x - P[i * 3 - 3], z - P[i * 3 - 1]);
        const nx = -tz * hw * mit, nz = tx * hw * mit, yy = y + (isBridge ? 0.05 : yoff[c]);
        const v = cum / 12;
        L.push([x + nx, yy, z + nz, 0, v]); R.push([x - nx, yy, z - nz, 1, v]);
        if (isBridge && i > 0) {
          this.addBridgeSeg(P[i * 3 - 3], P[i * 3 - 2], P[i * 3 - 1], x, y, z, hw);
        }
      }
      for (let i = 1; i < n; i++) gb.quad(L[i - 1], R[i - 1], R[i], L[i], [0, 1, 0]);
      if (isBridge && c !== 'rail') this.bridgeStructure(sb, P, L, R, c === 'foot');
      else if (isBridge) this.bridgeStructure(sb, P, L, R, true);
      if (ni >= 0 && c !== 'foot' && c !== 'rail') this.roadSegs.push([ni, P]);
    }
    for (const { k, gb } of buckets.values()) {
      const m = new THREE.Mesh(gb.geometry(), k === 'concrete' ? concrete : mats[k]);
      m.receiveShadow = true;
      m.castShadow = k === 'concrete';
      this.group.add(m);
    }
  }

  addBridgeSeg(x0, y0, z0, x1, y1, z1, hw) {
    const id = this.bridgeSegs.length;
    this.bridgeSegs.push([x0, y0, z0, x1, y1, z1, hw + 0.4]);
    const r = hw + 1;
    this.gridInsert(this.brGrid, Math.min(x0, x1) - r, Math.min(z0, z1) - r, Math.max(x0, x1) + r, Math.max(z0, z1) + r, id);
  }

  bridgeStructure(gb, P, L, R, light) {
    const n = P.length / 3;
    const rail = light ? 1.1 : 0.95, thick = light ? 0.6 : 1.4;
    for (let i = 1; i < n; i++) {
      for (const [S, sgn] of [[L, 1], [R, -1]]) {
        const a = S[i - 1], b = S[i];
        const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
        const ox = -dz / l * sgn, oz = dx / l * sgn; // outward-ish
        const t = (p, dy, u, v) => [p[0], p[1] + dy, p[2], u, v];
        // barrier
        gb.quad(t(a, 0, 0, 0), t(b, 0, l / 4, 0), t(b, rail, l / 4, 0.3), t(a, rail, 0, 0.3), [ox, 0, oz]);
        gb.quad(t(a, 0, 0, 0), t(b, 0, l / 4, 0), t(b, rail, l / 4, 0.3), t(a, rail, 0, 0.3), [-ox, 0, -oz]);
        // fascia
        gb.quad(t(a, -thick, 0, 0), t(b, -thick, l / 4, 0), t(b, 0, l / 4, 0.3), t(a, 0, 0, 0.3), [ox, 0, oz]);
      }
      // underside
      const t2 = (p) => [p[0], p[1] - thick, p[2], p[0] / 4, p[2] / 4];
      gb.quad(t2(L[i - 1]), t2(R[i - 1]), t2(R[i]), t2(L[i]), [0, -1, 0]);
    }
    // piers
    let acc = 0;
    for (let i = 1; i < n; i++) {
      acc += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 2] - P[i * 3 - 1]);
      if (acc < (light ? 18 : 28) || i === n - 1) continue;
      acc = 0;
      const x = P[i * 3], y = P[i * 3 + 1] - thick, z = P[i * 3 + 2];
      const gy = this.heightAt(x, z) - 1;
      if (y - gy < 2.5) continue;
      const tx = P[i * 3] - P[i * 3 - 3], tz = P[i * 3 + 2] - P[i * 3 - 1], tl = Math.hypot(tx, tz) || 1;
      const ax = tx / tl, az = tz / tl, bx = -az, bz = ax;
      const hwid = light ? 0.5 : Math.hypot(L[i][0] - R[i][0], L[i][2] - R[i][2]) * 0.38, hd = light ? 0.5 : 0.9;
      const corner = (s, t, yy) => [x + bx * hwid * s + ax * hd * t, yy, z + bz * hwid * s + az * hd * t, s * 0.5, yy / 4];
      const faces = [[[-1, -1], [1, -1], [-bx * 0 + ax * -1, az * -1]], [[1, -1], [1, 1], [bx, bz]], [[1, 1], [-1, 1], [ax, az]], [[-1, 1], [-1, -1], [-bx, -bz]]];
      faces[0][2] = [-ax, -az];
      for (const [[s0, t0], [s1, t1], [wx, wz]] of faces)
        gb.quad(corner(s0, t0, gy), corner(s1, t1, gy), corner(s1, t1, y), corner(s0, t0, y), [wx, 0, wz]);
    }
  }

  gridInsert(grid, x0, z0, x1, z1, id) {
    for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++)
      for (let gz = Math.floor(z0 / GRID); gz <= Math.floor(z1 / GRID); gz++) {
        const k = gx * 65536 + gz;
        let a = grid.get(k); if (!a) grid.set(k, a = []);
        a.push(id);
      }
  }
  gridGet(grid, x, z) { return grid.get(Math.floor(x / GRID) * 65536 + Math.floor(z / GRID)); }

  // ---------------------------------------------------------------- buildings
  buildBuildings() {
    const T = this.tex;
    const mat = atlasMaterial({ map: T.facadeD, normalMap: T.facadeN, roughMap: T.facadeR, emissiveMap: T.facadeE });
    this.buildingMat = mat;
    this.nightMats.push([mat, 1.25]);
    const kinds = this.map.buildingKinds;
    this.buildings = [];
    this.bGrid = new Map();
    const buckets = new Map();
    const chunk = (x, z) => {
      const key = Math.floor(x / CHUNK) * 1000 + Math.floor(z / CHUNK);
      if (!buckets.has(key)) buckets.set(key, new GB(true));
      return buckets.get(key);
    };
    const dt = this.toWorld(40.4194, -86.8922);
    this.map.buildings.forEach((b, bi) => this.addBuilding(b, bi, kinds, chunk, dt));
    for (const gb of buckets.values()) {
      const m = new THREE.Mesh(gb.geometry(), mat);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
  }

  addBuilding([base, top, ni, ki, ring], bi, kinds, chunk, dt, forcedTile = null) {
    const kind = kinds[ki];
    const n = ring.length / 2;
    let cx = 0, cz = 0, area = 0;
    for (let i = 0; i < n; i++) {
      const x1 = ring[i * 2], z1 = ring[i * 2 + 1], x2 = ring[((i + 1) % n) * 2], z2 = ring[((i + 1) % n) * 2 + 1];
      cx += x1; cz += z1; area += x1 * z2 - x2 * z1;
    }
    cx /= n; cz /= n; area /= 2;
    const r = hash(bi + 1), r2 = hash(bi * 7 + 3);
    const downtown = Math.hypot(cx - dt[0], cz - dt[1]) < 420;
    let tile;
    const big = Math.abs(area) > 700 || top - base > 14;
    if (forcedTile != null) tile = forcedTile;
    else if (kind === 'house') tile = 0;
    else if (kind === 'church') tile = 11;
    else if (kind === 'university') tile = r < 0.72 ? 1 : r < 0.88 ? 10 : 2;
    else if (kind === 'commercial') tile = downtown ? (r < 0.5 ? 8 : r < 0.75 ? 1 : 5) : (r < 0.35 ? 2 : r < 0.7 ? 5 : 10);
    else if (kind === 'apartments') tile = r < 0.6 ? 3 : 1;
    else if (kind === 'industrial' || kind === 'hangar') tile = 4;
    else if (kind === 'parking') tile = 9;
    else if (kind === 'garage') tile = 5;
    else if (kind === 'stadium') tile = 10;
    else if (downtown) tile = r < 0.5 ? 8 : r < 0.7 ? 1 : r < 0.85 ? 5 : 3;
    else tile = big ? (r < 0.5 ? 1 : r < 0.68 ? 10 : r < 0.84 ? 2 : 3) : (Math.abs(area) < 220 ? 0 : 5);
    const pal = PAL[TILE_PAL[tile]];
    const col = pick(pal, r2);
    const atl = TILE[tile];
    const gb = chunk(cx, cz);
    // pitched roof for small rectangular houses
    let wallTop = top, pitched = false;
    if ((kind === 'house' || (kind === 'other' && tile === 0)) && n === 4 && Math.abs(area) < 420) {
      const e1 = Math.hypot(ring[2] - ring[0], ring[3] - ring[1]), e2 = Math.hypot(ring[4] - ring[2], ring[5] - ring[3]);
      const roofH = Math.min(3.2, Math.min(e1, e2) * 0.36);
      wallTop = top - roofH; pitched = { roofH, longFirst: e1 >= e2 };
    }
    // walls
    let per = 0;
    for (let i = 0; i < n; i++) {
      const x1 = ring[i * 2], z1 = ring[i * 2 + 1], x2 = ring[((i + 1) % n) * 2], z2 = ring[((i + 1) % n) * 2 + 1];
      const l = Math.hypot(x2 - x1, z2 - z1);
      let ox = (z2 - z1) / l, oz = -(x2 - x1) / l;
      if (area < 0) { ox = -ox; oz = -oz; }
      const u0 = per / 12.8, u1 = (per + l) / 12.8;
      gb.quad([x1, base, z1, u0, 0], [x2, base, z2, u1, 0], [x2, wallTop, z2, u1, (wallTop - base) / 13.6], [x1, wallTop, z1, u0, (wallTop - base) / 13.6], [ox, 0, oz], col, atl);
      per += l;
    }
    // roof
    const rcol = pick(pitched ? PAL.shingle : PAL.roof, hash(bi * 3 + 1));
    if (pitched) {
      const p = (i) => [ring[(i % 4) * 2], wallTop, ring[(i % 4) * 2 + 1]];
      const s = pitched.longFirst ? 0 : 1; // long edges: (s,s+1) and (s+2,s+3)
      const A = p(s), B = p(s + 1), C = p(s + 2), D = p(s + 3);
      const mid = (P, Q) => [(P[0] + Q[0]) / 2, wallTop + pitched.roofH, (P[2] + Q[2]) / 2];
      const rBC = mid(B, C), rDA = mid(D, A);
      const uvp = (P) => [P[0], P[1], P[2], (P[0] + P[2]) / 6, P[1] / 6];
      const out = (P, Q) => { const mx = (P[0] + Q[0]) / 2 - cx, mz = (P[2] + Q[2]) / 2 - cz; return [mx, 1.5, mz]; };
      gb.quad(uvp(A), uvp(B), uvp(rBC), uvp(rDA), out(A, B), rcol, TILE[7]);
      gb.quad(uvp(C), uvp(D), uvp(rDA), uvp(rBC), out(C, D), rcol, TILE[7]);
      const gu = (P) => [P[0], P[1], P[2], (P[0] + P[2]) / 12.8, (P[1] - base) / 13.6];
      gb.tri(gu(B), gu(C), gu(rBC), out(B, C), col, atl);
      gb.tri(gu(D), gu(A), gu(rDA), out(D, A), col, atl);
    } else {
      const contour = [];
      for (let i = 0; i < n; i++) contour.push(new THREE.Vector2(ring[i * 2], ring[i * 2 + 1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [a, b, c] of tris) {
        const P = (i) => [ring[i * 2], top, ring[i * 2 + 1], ring[i * 2] / 12.8, ring[i * 2 + 1] / 12.8];
        gb.tri(P(a), P(b), P(c), [0, 1, 0], rcol, TILE[6]);
      }
      // parapet lip on bigger buildings
      if (top - base > 9) {
        for (let i = 0; i < n; i++) {
          const x1 = ring[i * 2], z1 = ring[i * 2 + 1], x2 = ring[((i + 1) % n) * 2], z2 = ring[((i + 1) % n) * 2 + 1];
          const l = Math.hypot(x2 - x1, z2 - z1);
          let ox = (z2 - z1) / l, oz = -(x2 - x1) / l; if (area < 0) { ox = -ox; oz = -oz; }
          gb.quad([x1, top, z1, 0, 0.92], [x2, top, z2, l / 12.8, 0.92], [x2, top + 0.9, z2, l / 12.8, 0.985], [x1, top + 0.9, z1, 0, 0.985], [ox, 0, oz], col, atl);
          gb.quad([x1, top, z1, 0, 0.92], [x2, top, z2, l / 12.8, 0.92], [x2, top + 0.9, z2, l / 12.8, 0.985], [x1, top + 0.9, z1, 0, 0.985], [-ox, 0, -oz], [0.7, 0.7, 0.7], TILE[10]);
        }
      }
    }
    // gameplay record
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, ring[i * 2]); x1 = Math.max(x1, ring[i * 2]); z0 = Math.min(z0, ring[i * 2 + 1]); z1 = Math.max(z1, ring[i * 2 + 1]); }
    const id = this.buildings.length;
    this.buildings.push({ ring, base, top: pitched ? wallTop + pitched.roofH * 0.5 : top, name: ni >= 0 ? this.map.names[ni] : null, cx, cz, x0, z0, x1, z1 });
    this.gridInsert(this.bGrid, x0, z0, x1, z1, id);
  }

  // ---------------------------------------------------------------- landmarks
  buildLandmarks() {
    this.landmarks = [];
    const brick = new THREE.MeshStandardMaterial({ map: this.brickTex(), roughness: 0.85 });
    const stone = new THREE.MeshStandardMaterial({ color: 0xd9d0bb, roughness: 0.7 });
    const copper = new THREE.MeshStandardMaterial({ color: 0x6f9c8a, roughness: 0.5, metalness: 0.35 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd7b55a, roughness: 0.3, metalness: 0.9 });
    const clockMat = new THREE.MeshStandardMaterial({ map: this.clockTex(), roughness: 0.4, emissive: 0xfff2d0, emissiveIntensity: 0 });
    this.nightMats.push([clockMat, 0.8]);
    const add = (geo, mat, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry;
      m.castShadow = m.receiveShadow = true; this.group.add(m); return m;
    };
    // Purdue Bell Tower (Purdue Mall)
    {
      const [x, z] = this.toWorld(40.42715, -86.91413);
      const g = this.heightAt(x, z) - 0.5, s = 5.6;
      add(new THREE.BoxGeometry(s + 1.2, 2.2, s + 1.2), stone, x, g + 1.1, z);
      add(new THREE.BoxGeometry(s, 34, s), brick, x, g + 17, z);
      add(new THREE.BoxGeometry(s + 0.6, 1.2, s + 0.6), stone, x, g + 34.6, z);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
        add(new THREE.BoxGeometry(1.3, 8, 1.3), brick, x + dx * (s / 2 - 0.65), g + 39.2, z + dz * (s / 2 - 0.65));
      add(new THREE.BoxGeometry(s + 0.8, 1.4, s + 0.8), stone, x, g + 43.9, z);
      const roof = add(new THREE.ConeGeometry(s * 0.78, 6.5, 4), copper, x, g + 47.8, z, Math.PI / 4);
      roof.castShadow = true;
      add(new THREE.SphereGeometry(0.35, 12, 8), gold, x, g + 51.3, z);
      const bell = add(new THREE.CylinderGeometry(0.6, 1.4, 2, 16, 1, true), gold, x, g + 39, z);
      bell.material = gold;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const c = add(new THREE.CircleGeometry(1.7, 32), clockMat, x + Math.sin(a) * (s / 2 + 0.03), g + 30, z + Math.cos(a) * (s / 2 + 0.03), a);
        c.castShadow = false;
      }
      this.addSolid(x, z, s / 2 + 0.6, g, g + 52, 'Purdue Bell Tower');
      this.landmarks.push(['Purdue Bell Tower', x, z]);
    }
    // Tippecanoe County Courthouse dome (on the real OSM footprint)
    const ch = this.buildings.find(b => b.name && /courthouse/i.test(b.name) && /tippecanoe/i.test(b.name))
      || this.buildings.find(b => b.name && /courthouse/i.test(b.name));
    {
      const [fx, fz] = this.toWorld(40.41944, -86.89225);
      const x = ch ? ch.cx : fx, z = ch ? ch.cz : fz, t = ch ? ch.top : this.heightAt(fx, fz) + 18;
      add(new THREE.CylinderGeometry(7, 7.5, 7, 24), stone, x, t + 3.5, z);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        add(new THREE.CylinderGeometry(0.35, 0.35, 6, 8), stone, x + Math.sin(a) * 7.6, t + 3.5, z + Math.cos(a) * 7.6);
      }
      add(new THREE.SphereGeometry(7.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), copper, x, t + 7, z);
      add(new THREE.CylinderGeometry(1.6, 1.8, 4, 12), stone, x, t + 15, z);
      add(new THREE.SphereGeometry(1.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), copper, x, t + 17, z);
      add(new THREE.CylinderGeometry(0.25, 0.4, 3, 8), gold, x, t + 19.5, z);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        add(new THREE.CircleGeometry(1.5, 32), clockMat, x + Math.sin(a) * 7.05, t + 4, z + Math.cos(a) * 7.05, a);
      }
      this.addSolid(x, z, 7.6, t, t + 21, 'Tippecanoe County Courthouse');
      this.landmarks.push(['Tippecanoe County Courthouse', x, z]);
    }
    // a big "PURDUE" water-tower style sign near Ross-Ade
    {
      const [x, z] = this.toWorld(40.4366, -86.9172);
      const g = this.heightAt(x, z);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.6, roughness: 0.4 });
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(new THREE.CylinderGeometry(0.35, 0.45, 30, 8), legMat, x + dx * 4, g + 15, z + dz * 4);
      const tankMat = new THREE.MeshStandardMaterial({ map: this.towerTex(), roughness: 0.45, metalness: 0.2 });
      add(new THREE.SphereGeometry(8, 32, 20), tankMat, x, g + 34, z);
      this.addSolid(x, z, 6, g, g + 42, 'Purdue water tower');
    }
  }

  addSolid(cx, cz, r, base, top, name) {
    const ring = [];
    for (let i = 0; i < 8; i++) { const a = -i / 8 * Math.PI * 2; ring.push(cx + Math.cos(a) * r, cz + Math.sin(a) * r); }
    const id = this.buildings.length;
    this.buildings.push({ ring, base, top, name, cx, cz, x0: cx - r, z0: cz - r, x1: cx + r, z1: cz + r });
    this.gridInsert(this.bGrid, cx - r, cz - r, cx + r, cz + r, id);
  }

  brickTex() {
    const [c, g] = TX.canvas(256);
    g.fillStyle = '#b7aa93'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < 256; x += 16) {
      const v = 120 + TX.rnd() * 50; g.fillStyle = `rgb(${v + 35 | 0},${v * 0.42 | 0},${v * 0.3 | 0})`; g.fillRect(x + 1, y + 1, 14, 6);
    }
    const t = TX.toTex(c); t.repeat.set(1.5, 8); return t;
  }
  clockTex() {
    const [c, g] = TX.canvas(256);
    g.fillStyle = '#f4efe0'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#222';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillRect(128 + Math.sin(a) * 100 - 4, 128 - Math.cos(a) * 100 - 10, 8, 20); }
    g.lineWidth = 9; g.beginPath(); g.moveTo(128, 128); g.lineTo(128, 50); g.moveTo(128, 128); g.lineTo(180, 150); g.stroke();
    return TX.toTex(c, { repeat: false });
  }
  towerTex() {
    const [c, g] = TX.canvas(1024, 512);
    g.fillStyle = '#e9e4d8'; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#000'; g.fillRect(0, 300, 1024, 40);
    g.fillStyle = '#c5a464'; g.fillRect(0, 290, 1024, 10); g.fillRect(0, 340, 1024, 10);
    g.font = 'bold 120px Georgia, serif'; g.fillStyle = '#1b1b1b'; g.textAlign = 'center';
    g.fillText('PURDUE', 256, 250); g.fillText('PURDUE', 768, 250);
    return TX.toTex(c, { repeat: false });
  }

  // ---------------------------------------------------------------- trees + lamps
  // Crown made of leaf-cluster cards scattered through an ellipsoid (or cone for conifers).
  // Normals point away from the crown centre, so the canopy shades like a soft volume.
  crownGeometry(cards, rx, ry, cy, conifer, seed) {
    let sd = seed;
    const R = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    const pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i < cards; i++) {
      let px, py, pz;
      if (conifer) {
        const h = R(); const rad = (1 - h) * rx * (0.5 + 0.5 * R()); const a = R() * 6.283;
        px = Math.cos(a) * rad; pz = Math.sin(a) * rad; py = cy - ry + h * ry * 2;
      } else {
        const u = R() * 2 - 1, a = R() * 6.283, rr = 0.25 + 0.75 * Math.sqrt(R());
        const q = Math.sqrt(1 - u * u);
        px = Math.cos(a) * q * rx * rr; pz = Math.sin(a) * q * rx * rr; py = cy + u * ry * rr;
      }
      const size = (conifer ? 1.9 : 3.1) * (0.75 + R() * 0.5);
      // random card orientation
      const n = new THREE.Vector3(R() - 0.5, (R() - 0.3) * 0.8, R() - 0.5).normalize();
      const t = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
      const b = new THREE.Vector3().crossVectors(n, t).normalize();
      const out = new THREE.Vector3(px, (py - cy) * 0.7 + (conifer ? 0 : ry * 0.25), pz).normalize();
      const base = pos.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(px + (t.x * su + b.x * sv) * size / 2, py + (t.y * su + b.y * sv) * size / 2, pz + (t.z * su + b.z * sv) * size / 2);
        nor.push(out.x, out.y, out.z);
        uv.push((su + 1) / 4, (sv + 1) / 4);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  buildTrees() {
    const trees = this.map.trees, T = this.tex;
    this.tGrid = new Map(); this.trees = trees;
    trees.forEach((t, i) => this.gridInsert(this.tGrid, t[0], t[1], t[0], t[1], i));
    const cards = this.quality.treeCards;
    // trunk + a few main branches, merged
    const parts = [];
    const tg = new THREE.CylinderGeometry(0.16, 0.3, 4.4, 7, 1); tg.translate(0, 2.2, 0); parts.push(tg);
    for (let i = 0; i < 3; i++) {
      const bg = new THREE.CylinderGeometry(0.05, 0.11, 2.4, 5); bg.translate(0, 1.2, 0);
      bg.rotateZ(0.7); bg.rotateY(i * 2.1); bg.translate(0, 3.4 + i * 0.4, 0); parts.push(bg);
    }
    const trunkG = mergeGeoms(parts);
    const leafyG = [0, 1, 2].map(v => this.crownGeometry(cards, 2.7, 2.3, 5.8, false, 11 + v * 97));
    const pineG = this.crownGeometry(Math.round(cards * 0.9), 2.3, 4.2, 6.2, true, 555);
    const bark = T.barkD.clone(); bark.needsUpdate = true; bark.repeat.set(1, 2);
    const barkN = T.barkN.clone(); barkN.needsUpdate = true; barkN.repeat.set(1, 2);
    const trunkM = new THREE.MeshStandardMaterial({ map: bark, normalMap: barkN, color: 0x9a8f82, roughness: 1 });
    const leafM = new THREE.MeshStandardMaterial({ map: T.foliage, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, alphaToCoverage: this.quality.msaa > 0 });
    leafM.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 leafCell;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv += leafCell;');
      // light passing through leaves: brighten back-lit cards a little
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.08;');
    };
    leafM.customProgramCacheKey = () => 'wv-leaf';
    // November in Lafayette: a mix of green and turning leaves
    const CELLS = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]];
    const cellFor = (i) => { const h = hash(i * 9.3); return h < 0.34 ? CELLS[0] : h < 0.55 ? CELLS[1] : h < 0.8 ? CELLS[2] : CELLS[3]; };
    const chunks = new Map();
    trees.forEach((t, i) => {
      const k = Math.floor(t[0] / CHUNK) * 1000 + Math.floor(t[1] / CHUNK);
      if (!chunks.has(k)) chunks.set(k, []);
      chunks.get(k).push(i);
    });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    for (const ids of chunks.values()) {
      const pines = ids.filter(i => hash(i * 1.7) < 0.2), leafy = ids.filter(i => hash(i * 1.7) >= 0.2);
      const trunk = new THREE.InstancedMesh(trunkG, trunkM, ids.length);
      ids.forEach((i, j) => {
        const [x, z, s] = trees[i];
        p.set(x, this.heightAt(x, z) - 0.2, z); q.setFromAxisAngle(up, hash(i) * 6.28); sc.setScalar(s);
        trunk.setMatrixAt(j, m4.compose(p, q, sc));
      });
      const crowns = [];
      for (let v = 0; v < 4; v++) {
        const list = v < 3 ? leafy.filter(i => Math.floor(hash(i * 3.3) * 3) === v) : pines;
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(v < 3 ? leafyG[v] : pineG, leafM, list.length);
        const cell = new Float32Array(list.length * 2);
        list.forEach((i, j) => {
          const [x, z, s] = trees[i];
          p.set(x, this.heightAt(x, z) - 0.2, z); q.setFromAxisAngle(up, hash(i) * 6.28);
          sc.set(s * (0.9 + hash(i * 5) * 0.25), s * (0.9 + hash(i * 7) * 0.3), s * (0.9 + hash(i * 5) * 0.25));
          im.setMatrixAt(j, m4.compose(p, q, sc));
          const cl = v < 3 ? cellFor(i) : CELLS[1];
          cell[j * 2] = cl[0]; cell[j * 2 + 1] = cl[1];
          const k = 0.85 + hash(i * 2.1) * 0.3;
          im.setColorAt(j, v < 3 ? c.setRGB(k, k, k * 0.95) : c.setRGB(0.55 * k, 0.75 * k, 0.6 * k));
        });
        im.geometry = im.geometry.clone();
        im.geometry.setAttribute('leafCell', new THREE.InstancedBufferAttribute(cell, 2));
        crowns.push(im);
      }
      for (const im of [trunk, ...crowns]) {
        im.castShadow = this.quality.treeShadows || im === trunk; im.receiveShadow = true;
        im.computeBoundingSphere();
        im.userData.noAO = im !== trunk;
        this.group.add(im);
      }
    }
  }

  buildLamps() {
    const types = this.map.roadTypes;
    const spots = [];
    for (const [ti, , flags, P] of this.map.roads) {
      const t = types[ti];
      if (!['primary', 'secondary', 'tertiary', 'trunk', 'residential'].includes(t)) continue;
      const hw = this.map.roadWidth[t] / 2 + 1.0;
      const step = t === 'residential' ? 60 : 36;
      let acc = step / 2, side = 1;
      for (let i = 3; i < P.length; i += 3) {
        const dx = P[i] - P[i - 3], dz = P[i + 2] - P[i - 1], l = Math.hypot(dx, dz);
        acc += l;
        if (acc < step || l < 0.01) continue;
        acc = 0; side = -side;
        const nx = -dz / l * side, nz = dx / l * side;
        const x = P[i] + nx * hw, z = P[i + 2] + nz * hw;
        const y = (flags & 1) ? P[i + 1] + 1 : this.heightAt(x, z);
        spots.push([x, y, z, Math.atan2(-nx, -nz)]);
      }
    }
    const max = Math.min(spots.length, this.quality.lamps);
    const pole = new THREE.CylinderGeometry(0.09, 0.13, 8, 6); pole.translate(0, 4, 0);
    const arm = new THREE.BoxGeometry(0.12, 0.12, 2.2); arm.translate(0, 7.9, 1.0);
    const head = new THREE.BoxGeometry(0.5, 0.18, 0.8); head.translate(0, 7.8, 2.0);
    const bulbG = new THREE.BoxGeometry(0.36, 0.06, 0.6); bulbG.translate(0, 7.68, 2.0);
    const metal = new THREE.MeshStandardMaterial({ color: 0x3b4046, metalness: 0.6, roughness: 0.5 });
    const bulb = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd28a, emissiveIntensity: 0 });
    this.nightMats.push([bulb, 6]);
    const ims = [pole, arm, head].map(g => new THREE.InstancedMesh(g, metal, max));
    const bm = new THREE.InstancedMesh(bulbG, bulb, max);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    this.lampSpots = spots;
    for (let i = 0; i < max; i++) {
      const [x, y, z, ry] = spots[Math.floor(i * spots.length / max)];
      p.set(x, y, z); q.setFromAxisAngle(up, ry); m4.compose(p, q, one);
      for (const im of ims) im.setMatrixAt(i, m4);
      bm.setMatrixAt(i, m4);
    }
    for (const im of [...ims, bm]) { im.computeBoundingSphere(); this.group.add(im); }
    ims[0].castShadow = true;
  }

  // ---------------------------------------------------------------- names / districts / graph
  indexRoadNames() {
    this.nGrid = new Map(); this.nSegs = [];
    for (const [ni, P] of this.roadSegs) {
      for (let i = 3; i < P.length; i += 3) {
        const id = this.nSegs.length;
        this.nSegs.push([P[i - 3], P[i - 1], P[i], P[i + 2], ni]);
        this.gridInsert(this.nGrid, Math.min(P[i - 3], P[i]), Math.min(P[i - 1], P[i + 2]), Math.max(P[i - 3], P[i]), Math.max(P[i - 1], P[i + 2]), id);
      }
    }
    const D = (name, lat, lon, r) => { const [x, z] = this.toWorld(lat, lon); return { name, x, z, r }; };
    this.districts = [
      D('Downtown Lafayette', 40.4192, -86.8912, 430),
      D('Wabash Landing', 40.4209, -86.9003, 190),
      D('Chauncey Village', 40.4238, -86.9075, 270),
      D('Ross-Ade Stadium', 40.4352, -86.9184, 230),
      D('Purdue Airport (LAF)', 40.4123, -86.9369, 950),
      D('Columbian Park', 40.4100, -86.8731, 300),
      D('Purdue University', 40.4262, -86.9200, 1000),
      D('Tapawingo Park', 40.4213, -86.9025, 150),
    ];
    this.fastTravel = [
      ['Purdue Memorial Union', 40.42465, -86.9109],
      ['Purdue Bell Tower', 40.42740, -86.91413],
      ['Ross-Ade Stadium', 40.4330, -86.9172],
      ['Purdue Airport runway', 40.41365, -86.9465],
      ['Downtown Lafayette courthouse', 40.4187, -86.8922],
      ['Wabash River (boat launch)', 40.4155, -86.9010],
      ['Columbian Park', 40.4108, -86.8752],
      ['Chauncey Village', 40.4238, -86.9078],
    ];
  }

  roadNameAt(x, z) {
    let best = null, bd = 28;
    for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
      const ids = this.gridGet(this.nGrid, x + gx * GRID, z + gz * GRID);
      if (!ids) continue;
      for (const id of ids) {
        const [x0, z0, x1, z1, ni] = this.nSegs[id];
        const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
        const d = Math.hypot(x - x0 - dx * t, z - z0 - dz * t);
        if (d < bd) { bd = d; best = this.map.names[ni]; }
      }
    }
    return best;
  }

  districtAt(x, z) {
    if (this.isWater(x, z)) return 'Wabash River';
    for (const d of this.districts) if (Math.hypot(x - d.x, z - d.z) < d.r) return d.name;
    const iz = Math.min(this.nz - 1, Math.max(0, Math.round((z - this.minZ) / this.cell)));
    return x < this.riverX[iz] ? 'West Lafayette' : 'Lafayette';
  }

  buildingNear(x, z, r = 25) {
    let best = null, bd = r;
    for (const id of this.gridGet(this.bGrid, x, z) || []) {
      const b = this.buildings[id];
      if (!b.name) continue;
      const d = pointInPoly(x, z, b.ring) ? 0 : Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
      if (d < bd) { bd = d; best = b.name; }
    }
    return best;
  }

  buildGraph() {
    const { nodes, adj } = this.map.graph;
    this.gNodes = nodes; this.gAdj = adj;
    this.gGrid = new Map();
    nodes.forEach((n, i) => { if (adj[i].length) this.gridInsert(this.gGrid, n[0], n[2], n[0], n[2], i); });
  }
  nearestNode(x, z, maxR = 400) {
    for (let r = 0; r * GRID < maxR; r++) {
      let best = -1, bd = Infinity;
      for (let gx = -r; gx <= r; gx++) for (let gz = -r; gz <= r; gz++) {
        if (Math.max(Math.abs(gx), Math.abs(gz)) !== r) continue;
        for (const i of this.gridGet(this.gGrid, x + gx * GRID, z + gz * GRID) || []) {
          const n = this.gNodes[i], d = Math.hypot(n[0] - x, n[2] - z);
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  // A* route for the GPS
  route(from, to) {
    const N = this.gNodes, open = new Map([[from, 0]]), g = new Map([[from, 0]]), came = new Map();
    const hf = (i) => Math.hypot(N[i][0] - N[to][0], N[i][2] - N[to][2]);
    const f = new Map([[from, hf(from)]]);
    let iter = 0;
    while (open.size && iter++ < 60000) {
      let cur = -1, bf = Infinity;
      for (const k of open.keys()) { const v = f.get(k); if (v < bf) { bf = v; cur = k; } }
      if (cur === to) {
        const path = [cur];
        while (came.has(cur)) { cur = came.get(cur); path.push(cur); }
        return path.reverse();
      }
      open.delete(cur);
      for (const nb of this.gAdj[cur]) {
        const t = g.get(cur) + Math.hypot(N[nb][0] - N[cur][0], N[nb][2] - N[cur][2]);
        if (t < (g.has(nb) ? g.get(nb) : Infinity)) {
          came.set(nb, cur); g.set(nb, t); f.set(nb, t + hf(nb)); open.set(nb, 1);
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- physics queries
  isWater(x, z) { return this.heightAt(x, z) < this.map.waterLevel - 0.25; }

  deckAt(x, z, maxY) {
    let best = null;
    for (const id of this.gridGet(this.brGrid, x, z) || []) {
      const [x0, y0, z0, x1, y1, z1, hw] = this.bridgeSegs[id];
      const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
      const t = ((x - x0) * dx + (z - z0) * dz) / l2;
      if (t < -0.02 || t > 1.02) continue;
      const tc = Math.max(0, Math.min(1, t));
      if (Math.hypot(x - x0 - dx * tc, z - z0 - dz * tc) > hw) continue;
      const y = y0 + (y1 - y0) * tc + 0.05;
      if (y <= maxY && (best === null || y > best)) best = y;
    }
    return best;
  }

  // Highest walkable surface under (x,z) that is not far above y.
  // returns {y, kind: 'ground'|'bridge'|'roof'|'water', water: waterY or null}
  groundAt(x, z, y = null, step = 1.6) {
    const t = this.heightAt(x, z);
    if (y === null) y = t + 3;   // default: street level (ignore rooftops)
    let gy = t + 0.03, kind = 'ground';
    const d = this.deckAt(x, z, y + step);
    if (d !== null && d > gy) { gy = d; kind = 'bridge'; }
    for (const id of this.gridGet(this.bGrid, x, z) || []) {
      const b = this.buildings[id];
      if (b.top > gy && b.top <= y + step && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && pointInPoly(x, z, b.ring)) { gy = b.top; kind = 'roof'; }
    }
    const wl = this.map.waterLevel;
    const water = kind === 'ground' && t < wl - 0.25 ? wl : null;
    return { y: gy, kind: water !== null ? 'water' : kind, water };
  }

  // Push a vertical capsule (circle in x/z between yb and yt) out of buildings and trees.
  // Returns {x, z, hit, nx, nz, depth}
  collide(x, z, r, yb, yt, out = {}) {
    out.hit = false; out.nx = 0; out.nz = 0; out.depth = 0; out.what = null;
    for (let pass = 0; pass < 2; pass++) {
      const ids = new Set();
      for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) for (const id of this.gridGet(this.bGrid, x + ox, z + oz) || []) ids.add(id);
      for (const id of ids) {
        const b = this.buildings[id];
        if (yb >= b.top - 0.05 || yt <= b.base) continue;
        if (x < b.x0 - r || x > b.x1 + r || z < b.z0 - r || z > b.z1 + r) continue;
        const ring = b.ring, inside = pointInPoly(x, z, ring);
        let bd = Infinity, bx = 0, bz = 0;
        for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
          const x0 = ring[j], z0 = ring[j + 1], x1 = ring[i], z1 = ring[i + 1];
          const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2));
          const px = x0 + dx * t, pz = z0 + dz * t, d = Math.hypot(x - px, z - pz);
          if (d < bd) { bd = d; bx = px; bz = pz; }
        }
        if (!inside && bd >= r) continue;
        let nx = x - bx, nz = z - bz; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        if (inside) { nx = -nx; nz = -nz; }
        const depth = inside ? bd + r : r - bd;
        x += nx * depth; z += nz * depth;
        out.hit = true; out.nx = nx; out.nz = nz; out.depth = Math.max(out.depth, depth); out.what = 'building';
      }
    }
    if (yb < this.heightAt(x, z) + 8) {
      for (const id of this.gridGet(this.tGrid, x, z) || []) {
        const t = this.trees[id], rr = r + 0.35 * t[2];
        const dx = x - t[0], dz = z - t[1], d = Math.hypot(dx, dz);
        if (d < rr && d > 1e-4) {
          x = t[0] + dx / d * rr; z = t[1] + dz / d * rr;
          out.hit = true; out.nx = dx / d; out.nz = dz / d; out.depth = Math.max(out.depth, rr - d); out.what = 'tree';
        }
      }
    }
    // world bounds
    const m = 40;
    if (x < this.minX + m) { x = this.minX + m; out.hit = true; out.nx = 1; out.nz = 0; out.what = 'edge'; }
    if (x > this.maxX - m) { x = this.maxX - m; out.hit = true; out.nx = -1; out.nz = 0; out.what = 'edge'; }
    if (z < this.minZ + m) { z = this.minZ + m; out.hit = true; out.nx = 0; out.nz = 1; out.what = 'edge'; }
    if (z > this.maxZ - m) { z = this.maxZ - m; out.hit = true; out.nx = 0; out.nz = -1; out.what = 'edge'; }
    out.x = x; out.z = z;
    return out;
  }

  // ray march for the camera so it doesn't clip into buildings
  lineBlocked(ax, ay, az, bx, by, bz) {
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (y < this.heightAt(x, z) + 0.3) return t;
      for (const id of this.gridGet(this.bGrid, x, z) || []) {
        const b = this.buildings[id];
        if (y < b.top && y > b.base && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && pointInPoly(x, z, b.ring)) return t;
      }
    }
    return 1;
  }

  update(dt, night) {
    this.time += dt;
    this.waterNormal.offset.set(this.time * 0.004, this.time * 0.0025);
    for (const [m, k] of this.nightMats) m.emissiveIntensity = night * k;
  }
}
