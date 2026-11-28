// Your own aircraft models: .glb files (for example downloaded from Sketchfab) for any aircraft type.
// They come from two places:
//   1. models/real/models.json in this folder (files shipped with the game, with their credits)
//   2. uploaded in the game (kept in this browser's IndexedDB, never sent anywhere)
// A model is fitted to the aircraft automatically (which way is forward, size, wheels on the ground) and the
// fit can be adjusted in flight. The fit is saved with the model.

const DB_NAME = 'wabashModels', STORE = 'models';
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbP;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), st = t.objectStore(STORE), r = fn(st);
    t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Storage full or blocked'));
  });
}

// ------------------------------------------------------------------ storage
export async function saveUpload(key, blob, meta) { await tx('readwrite', (s) => s.put({ blob, meta }, key)); }
export async function saveMeta(key, meta) {
  const cur = await tx('readonly', (s) => s.get(key)).catch(() => null);
  if (cur) await tx('readwrite', (s) => s.put({ blob: cur.blob, meta }, key));
  else { const o = JSON.parse(localStorage.getItem('wabashModelFit') || '{}'); o[key] = meta; localStorage.setItem('wabashModelFit', JSON.stringify(o)); }
}
export async function removeUpload(key) { await tx('readwrite', (s) => s.delete(key)); }
export async function uploadedKeys() {
  try { return (await tx('readonly', (s) => s.getAllKeys())) || []; } catch { return []; }
}

let repo = null;
export async function repoManifest() {
  if (repo) return repo;
  try { const r = await fetch('models/real/models.json', { cache: 'no-cache' }); repo = r.ok ? await r.json() : {}; } catch { repo = {}; }
  return repo;
}

// The model to use for an aircraft type, or null for the built-in one: { url, meta, source: 'upload'|'repo', revoke() }
export async function customModel(key) {
  try {
    const up = await tx('readonly', (s) => s.get(key));
    if (up && up.blob) {
      const url = URL.createObjectURL(up.blob);
      return { url, meta: up.meta || {}, source: 'upload', size: up.blob.size, revoke: () => URL.revokeObjectURL(url) };
    }
  } catch { /* no IndexedDB (private mode): fall through */ }
  const m = (await repoManifest())[key];
  if (m && m.file) {
    const fit = JSON.parse(localStorage.getItem('wabashModelFit') || '{}')[key];
    return { url: `models/real/${m.file}`, meta: { ...m, ...(fit || {}) }, source: 'repo', revoke() {} };
  }
  return null;
}

// ------------------------------------------------------------------ reading a .glb
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function m4mul(a, b) { // column-major 4x4
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
  }
  return o;
}
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const xf = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

// Parse a .glb: bounding box, sample points (glTF frame, Y up), node names, animation names, triangle count
export function glbInfo(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Not a .glb file (export or download the "glTF Binary (.glb)" version)');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buf, off + 8, len);
    off += 8 + len;
  }
  if (!json) throw new Error('The .glb has no glTF data');
  const used = [...(json.extensionsRequired || [])];
  const compressed = used.some((e) => /draco|meshopt/i.test(e));
  const scene = json.scenes?.[json.scene ?? 0] || { nodes: (json.nodes || []).map((_, i) => i) };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], pts = [];
  const nodes = [], meshTris = new Map();
  let tris = 0;
  const readAcc = (ai) => {
    const a = json.accessors[ai];
    if (a.bufferView === undefined || !bin) return null;
    const bv = json.bufferViews[a.bufferView], C = COMP[a.componentType], n = NCOMP[a.type];
    const stride = bv.byteStride ? bv.byteStride / C.BYTES_PER_ELEMENT : n;
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    if ((bin.byteOffset + base) % C.BYTES_PER_ELEMENT) return null;
    const arr = new C(bin.buffer, bin.byteOffset + base, Math.min(((a.count - 1) * stride + n), (bin.byteLength - base) / C.BYTES_PER_ELEMENT | 0));
    return { arr, stride, n, count: a.count, norm: a.normalized, C };
  };
  const visit = (ni, parent, depth, pIdx) => {
    const n = json.nodes[ni]; if (!n || depth > 64) return 0;
    const w = m4mul(parent, trs(n));
    let t = 0;
    const rec = { i: ni, parent: pIdx, name: n.name || '', world: w, parentWorld: parent, local: trs(n), min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], ownTris: 0 };
    nodes.push(rec);
    if (n.mesh !== undefined) {
      for (const p of json.meshes[n.mesh].primitives) {
        const pa = p.attributes?.POSITION; if (pa === undefined) continue;
        const acc = json.accessors[pa];
        const nt = p.indices !== undefined ? json.accessors[p.indices].count / 3 : acc.count / 3;
        t += nt; rec.ownTris += nt;
        if (acc.min && acc.max) {
          for (let c = 0; c < 8; c++) {
            const q = xf(w, [c & 1 ? acc.max[0] : acc.min[0], c & 2 ? acc.max[1] : acc.min[1], c & 4 ? acc.max[2] : acc.min[2]]);
            const ql = [c & 1 ? acc.max[0] : acc.min[0], c & 2 ? acc.max[1] : acc.min[1], c & 4 ? acc.max[2] : acc.min[2]];
            for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); rec.min[k] = Math.min(rec.min[k], ql[k]); rec.max[k] = Math.max(rec.max[k], ql[k]); }
          }
        }
        if (!compressed) {
          const r = readAcc(pa);
          if (r && r.C === Float32Array) {
            const step = Math.max(1, Math.floor(r.count / 4000));
            for (let v = 0; v < r.count; v += step) { const j = v * r.stride; pts.push(xf(w, [r.arr[j], r.arr[j + 1], r.arr[j + 2]])); }
          }
        }
      }
    }
    for (const c of n.children || []) t += visit(c, w, depth + 1, ni);
    rec.tris = t;
    return t;
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const ni of scene.nodes || []) tris += visit(ni, I, 0, -1);
  if (!isFinite(min[0])) throw new Error('The model has no geometry');
  return { min, max, pts, nodes, tris, anims: (json.animations || []).map((a, i) => a.name || `animation ${i}`), compressed, used, generator: json.asset?.generator || '' };
}

// ------------------------------------------------------------------ fitting a model to an aircraft
// Model frame used here = glTF frame (X right, Y up, Z toward the viewer). Cesium is told forwardAxis X, so the
// glTF frame reaches the game as (gx, -gz, gy) = body (forward, left, up) before our fit rotation.
// The fit: yaw (deg, about up), pitch and roll (deg), scale, and offset (metres, body frame: forward, left, up).
export function autoFit(info, def) {
  const ext = [0, 1, 2].map((k) => info.max[k] - info.min[k]);
  const ctr = [0, 1, 2].map((k) => (info.max[k] + info.min[k]) / 2);
  // Which horizontal glTF axis is the fuselage? The fin tip (highest points) sits at the back of the fuselage,
  // near the middle of the span. Fall back to "glTF front is +Z" (the glTF standard).
  let fusAxis = 2, noseSign = 1, how = 'glTF standard (+Z forward)';
  if (info.pts.length > 50) {
    const ys = info.pts.map((p) => p[1]).sort((a, b) => a - b);
    const yTop = ys[Math.floor(ys.length * 0.985)];
    const top = info.pts.filter((p) => p[1] >= yTop);
    const mean = (k) => top.reduce((s, p) => s + p[k], 0) / top.length;
    const offX = (mean(0) - ctr[0]) / (ext[0] || 1), offZ = (mean(2) - ctr[2]) / (ext[2] || 1);
    if (Math.max(Math.abs(offX), Math.abs(offZ)) > 0.18) {
      fusAxis = Math.abs(offX) > Math.abs(offZ) ? 0 : 2;
      noseSign = -Math.sign(fusAxis === 0 ? offX : offZ); // the nose is away from the fin
      how = 'found the tail fin';
    } else if (Math.abs(ext[0] - ext[2]) / Math.max(ext[0], ext[2]) > 0.12) {
      // no clear fin (flying wing, odd model): the longer horizontal side is the fuselage for most aircraft
      const span = def.b || 10, len = def.length || 10;
      const longerIsFus = len >= span;
      fusAxis = (ext[0] > ext[2]) === longerIsFus ? 0 : 2;
      how = 'from the proportions';
    }
  }
  // yaw that turns the nose direction (in body coordinates after the axis swap) to +X forward
  // glTF +X -> body (1,0,0); glTF +Z -> body (0,-1,0)
  const nose = fusAxis === 0 ? [noseSign, 0] : [0, -noseSign];
  const yaw = Math.round(-Math.atan2(nose[1], nose[0]) * 180 / Math.PI);
  const len = ext[fusAxis] || 1;
  const want = def.length || 10;
  const scale = want / len;
  // offsets after rotation and scaling, in body frame: centre the fuselage a little behind the CG, wheels on the ground
  const minGear = Math.min(...def.gear.map((g) => g[2]));
  const cAlong = noseSign * (fusAxis === 0 ? ctr[0] : ctr[2]); // the box centre measured along the nose direction
  const cSide = fusAxis === 0 ? ctr[2] : ctr[0];
  const fit = { yaw, pitch: 0, roll: 0, scale, offset: [0, 0, 0], how };
  fit.offset = [-(cAlong * scale) - 0.06 * want, 0, minGear - info.min[1] * scale];
  // sideways centring: after the yaw the side axis maps to body Y; work it out from the matrix
  const M = fitMatrix(fit), p = applyFit(M, [ctr[0], ctr[1], ctr[2]]);
  fit.offset[1] -= p[1];
  void cSide;
  return fit;
}

const R = Math.PI / 180;
// 4x4 column-major matrix from the glTF->Cesium model frame (gx, -gz, gy) to the aircraft body frame
export function fitMatrix(fit) {
  const s = fit.scale || 1, y = (fit.yaw || 0) * R, p = (fit.pitch || 0) * R, r = (fit.roll || 0) * R;
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p), cr = Math.cos(r), sr = Math.sin(r);
  // body = T * Rz(yaw) * Ry(-pitch) * Rx(roll) * S   (pitch positive = nose up)
  const Rz = [cy, sy, 0, -sy, cy, 0, 0, 0, 1], Ry = [cp, 0, sp, 0, 1, 0, -sp, 0, cp], Rx = [1, 0, 0, 0, cr, sr, 0, -sr, cr];
  const mul3 = (a, b) => { const o = []; for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) o[c * 3 + rr] = a[rr] * b[c * 3] + a[3 + rr] * b[c * 3 + 1] + a[6 + rr] * b[c * 3 + 2]; return o; };
  const m = mul3(mul3(Rz, Ry), Rx);
  const o = fit.offset || [0, 0, 0];
  return [m[0] * s, m[1] * s, m[2] * s, 0, m[3] * s, m[4] * s, m[5] * s, 0, m[6] * s, m[7] * s, m[8] * s, 0, o[0], o[1], o[2], 1];
}
// a glTF-frame point -> body frame
export function applyFit(M, g) { return xf(M, [g[0], -g[2], g[1]]); }

// Nodes worth animating: propellers/rotors spin, landing gear hides when it is up
export function animNodes(info) {
  const total = info.tris || 1;
  const pick = (re) => info.nodes.filter((n) => n.name && re.test(n.name) && n.tris < total * 0.3);
  const props = pick(/prop(eller)?|rotor|spinner|airscrew/i).filter((n, _, a) => !a.some((m) => m !== n && isAncestor(info, m, n)));
  const gear = pick(/(^|[^a-z])(gear|wheel|tyre|tire|strut|oleo|bogie)/i).filter((n) => !/door|bay|well/i.test(n.name)).filter((n, _, a) => !a.some((m) => m !== n && isAncestor(info, m, n)));
  return { props, gear };
}
function isAncestor(info, a, b) { // is node a an ancestor of node b?
  const byIdx = info._byIdx || (info._byIdx = new Map(info.nodes.map((n) => [n.i, n])));
  for (let p = b.parent, k = 0; p >= 0 && k < 64; k++) { if (p === a.i) return true; p = byIdx.get(p)?.parent ?? -1; }
  return false;
}

// For a spinning node: its spin axis (the aircraft's forward direction, in the node's own frame) and the point to spin about
export function spinSetup(node, fusAxisGltf) {
  // node.world maps node-local -> glTF root. Invert the 3x3 to bring the root forward direction into local axes.
  const w = node.world, a = [w[0], w[1], w[2], w[4], w[5], w[6], w[8], w[9], w[10]];
  const det = a[0] * (a[4] * a[8] - a[7] * a[5]) - a[3] * (a[1] * a[8] - a[7] * a[2]) + a[6] * (a[1] * a[5] - a[4] * a[2]);
  if (Math.abs(det) < 1e-12) return null;
  const inv = [
    (a[4] * a[8] - a[5] * a[7]) / det, (a[2] * a[7] - a[1] * a[8]) / det, (a[1] * a[5] - a[2] * a[4]) / det,
    (a[5] * a[6] - a[3] * a[8]) / det, (a[0] * a[8] - a[2] * a[6]) / det, (a[2] * a[3] - a[0] * a[5]) / det,
    (a[3] * a[7] - a[4] * a[6]) / det, (a[1] * a[6] - a[0] * a[7]) / det, (a[0] * a[4] - a[1] * a[3]) / det,
  ];
  const f = fusAxisGltf;
  const ax = [inv[0] * f[0] + inv[3] * f[1] + inv[6] * f[2], inv[1] * f[0] + inv[4] * f[1] + inv[7] * f[2], inv[2] * f[0] + inv[5] * f[1] + inv[8] * f[2]];
  const L = Math.hypot(...ax) || 1;
  const ctr = isFinite(node.min[0]) ? [0, 1, 2].map((k) => (node.min[k] + node.max[k]) / 2) : [0, 0, 0];
  return { axis: ax.map((v) => v / L), center: ctr };
}

// the glTF-frame direction of the nose for a fit (inverse of the yaw for level models)
export function noseDirGltf(fit) {
  const y = (fit.yaw || 0) * R;
  // body forward (1,0,0) came from model (cos(-y), sin(-y)) in (gx, -gz) -> glTF (cos y, 0, sin y)... solve directly:
  // body = Rz(yaw) * m, m = (gx, -gz); m = Rz(-yaw) * (1,0) = (cos y, -sin y) -> gx = cos y, gz = sin y
  return [Math.cos(y), 0, Math.sin(y)];
}
