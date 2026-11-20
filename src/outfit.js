// The player's look, built from Microsoft Rocketbox avatars (MIT licence). Every avatar of a
// gender shares one texture layout, so a look can mix: the body + shirt of one avatar, the face
// and hair of another, the trousers of a third and the shoes of a fourth. The body texture is
// composited at runtime from per-avatar region masks (tools/rocketbox/masks.py), gloves and
// skin tone are painted onto the hands, and hats and glasses are built in code.
import * as THREE from 'three';

export const DEFAULT_LOOK = { g: 'm', base: 'Male_Adult_04', head: 'Male_Adult_04', legs: null, feet: null, gloves: null, skin: 0, hat: null, glasses: null };
export const DEFAULT_LOOK_F = { g: 'f', base: 'Female_Adult_04', head: 'Female_Adult_04', legs: null, feet: null, gloves: null, skin: 0, hat: null, glasses: null };

export const GLOVES = { black: [0x1a1a1c, 'Black leather gloves'], brown: [0x5a3820, 'Brown leather gloves'], white: [0xe8e8e2, 'White gloves'], red: [0x8a1a1a, 'Red driving gloves'], fingerless: [0x1a1a1c, 'Fingerless gloves'] };
export const SKIN = [[-2, 'Much darker'], [-1, 'Darker'], [0, 'Natural'], [1, 'Lighter'], [2, 'Much lighter']];
export const HATS = {
  beanie_black: ['beanie', 0x151515, 'Black beanie'], beanie_red: ['beanie', 0x8c1d1d, 'Red beanie'], beanie_navy: ['beanie', 0x1f2c45, 'Navy beanie'],
  cap_black: ['cap', 0x111111, 'Black cap'], cap_gold: ['cap', 0xcfb991, 'Boilermaker gold cap'], cap_white: ['cap', 0xeeeeee, 'White cap'],
  flat_grey: ['flat', 0x55585c, 'Grey flat cap'], flat_brown: ['flat', 0x5a4030, 'Tweed flat cap'], ushanka: ['ushanka', 0x2a2420, 'Fur ushanka'],
};
export const GLASSES = { sun: [0x111111, 0x0a0a0a, 0.9, 'Black sunglasses'], aviator: [0xc9a64a, 0x4a3018, 0.75, 'Gold aviators'], frames: [0x151515, 0xffffff, 0.08, 'Black frames'], round: [0x888c90, 0xffffff, 0.08, 'Round wire frames'] };

const S = 1024;
export function normalizeLook(look) {
  const L = Object.assign({}, look || {});
  if (!L.base || !L.head || !L.g) return { ...DEFAULT_LOOK };
  return Object.assign({ legs: null, feet: null, gloves: null, skin: 0, hat: null, glasses: null }, L);
}

// ---------------------------------------------------------------- texture compositing
const part = (T, name) => { let m = null; T.scene.traverse(o => { if (!m && o.isMesh && o.name === name) m = o; }); return m; };
const keep = (m) => { m.defines = { ...(m.defines || {}), NO_SNOW: '' }; m.needsUpdate = true; return m; };
const imgOf = (T, name) => part(T, name)?.material?.map?.image;
function canvas(w = S, h = S) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// draw `src` into ctx only where the mask has class k
function layer(ctx, src, mask, k, tmp) {
  if (!src || !mask) return;
  const t = tmp.getContext('2d');
  t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, S, S);
  t.drawImage(src, 0, 0, S, S);
  t.globalCompositeOperation = 'destination-in';
  t.drawImage(mask.alpha[k], 0, 0, S, S);
  ctx.drawImage(tmp, 0, 0);
}
const shadeK = (s) => [0.6, 0.8, 1, 1.13, 1.25][s + 2] ?? 1;

export async function composeBody(people, look) {
  const base = people.templates[look.base], head = people.templates[look.head];
  const mask = await people.mask(look.base);
  const cv = canvas(), ctx = cv.getContext('2d'), tmp = canvas();
  ctx.drawImage(imgOf(base, 'body'), 0, 0, S, S);
  const legsT = look.legs && people.templates[look.legs], feetT = look.feet && people.templates[look.feet];
  if (legsT && legsT.meta.legs === 'pants' && base.meta.legs === 'pants') layer(ctx, imgOf(legsT, 'body'), mask, 1, tmp);
  if (feetT) layer(ctx, imgOf(feetT, 'body'), mask, 2, tmp);
  // hands carry the face's skin tone
  if (head && head !== base) { layer(ctx, imgOf(head, 'body'), mask, 3, tmp); layer(ctx, imgOf(head, 'body'), mask, 4, tmp); }
  const glove = look.gloves && GLOVES[look.gloves], k = shadeK(look.skin || 0);
  if (glove || k !== 1) {
    const d = ctx.getImageData(0, 0, S, S), px = d.data, cls = mask.cls;
    const gc = glove ? new THREE.Color(glove[0]) : null, fingerless = look.gloves === 'fingerless';
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const c = cls[(y >> 2) * 256 + (x >> 2)];
      if (c !== 3 && c !== 4) continue;
      const i = (y * S + x) * 4;
      if (gc && !(fingerless && c === 4)) {
        const l = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 150;
        px[i] = Math.min(255, gc.r * 255 * l * 1.1 + 6 * l); px[i + 1] = Math.min(255, gc.g * 255 * l * 1.1 + 6 * l); px[i + 2] = Math.min(255, gc.b * 255 * l * 1.1 + 6 * l);
      } else if (k !== 1) { px[i] = Math.min(255, px[i] * k); px[i + 1] = Math.min(255, px[i + 1] * k); px[i + 2] = Math.min(255, px[i + 2] * k); }
    }
    ctx.putImageData(d, 0, 0);
  }
  return tex(cv);
}
function tex(cv) { const t = new THREE.CanvasTexture(cv); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function shadedHead(T, s) {
  const src = imgOf(T, 'head'); if (!src) return null;
  const cv = canvas(src.width, src.height), ctx = cv.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const k = shadeK(s), d = ctx.getImageData(0, 0, cv.width, cv.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) { px[i] = Math.min(255, px[i] * k); px[i + 1] = Math.min(255, px[i + 1] * k); px[i + 2] = Math.min(255, px[i + 2] * k); }
  ctx.putImageData(d, 0, 0);
  return tex(cv);
}

// ---------------------------------------------------------------- dressing a character
export async function dress(people, ch, look) {
  look = normalizeLook(look);
  const token = (ch.dressToken = (ch.dressToken || 0) + 1);
  await Promise.all([look.base, look.head, look.legs, look.feet].filter(Boolean).map(id => people.ensure(id)));
  const body = await composeBody(people, look);
  if (token !== ch.dressToken) return;
  const headT = people.templates[look.head] || people.templates[look.base];
  // face & hair from the head donor, re-bound to this skeleton
  for (const m of ch.extra || []) m.parent?.remove(m);
  ch.extra = [];
  const own = (name) => { let m = null; ch.model.traverse(o => { if (!m && o.isMesh && o.name === name && !o.userData.donor) m = o; }); return m; };
  const swap = look.head !== look.base;
  for (const name of ['head', 'hair']) {
    const mine = own(name); if (mine) mine.visible = !swap;
    if (!swap) continue;
    const src = part(headT, name); if (!src) continue;
    const bones = src.skeleton.bones.map(b => ch.bones[b.name]);
    if (bones.some(b => !b)) { if (mine) mine.visible = true; continue; }
    const m = new THREE.SkinnedMesh(src.geometry, keep(src.material.clone()));
    m.name = name; m.userData.donor = true; m.castShadow = true; m.frustumCulled = false;
    m.position.copy(src.position); m.quaternion.copy(src.quaternion); m.scale.copy(src.scale);
    (ch.model.getObjectByName(src.parent?.name) || ch.model).add(m);
    m.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix);
    ch.extra.push(m);
  }
  const headMesh = swap ? ch.extra.find(m => m.name === 'head') : own('head');
  if (headMesh) {
    headMesh.material = headMesh.userData.donor ? headMesh.material : keep(headMesh.material.clone());
    const ht = (look.skin || 0) ? shadedHead(headT, look.skin) : null;
    if (ht) headMesh.material.map = ht; else headMesh.material.map = part(headT, 'head').material.map;
    headMesh.material.needsUpdate = true;
  }
  const bm = own('body');
  if (bm) { bm.material = keep(bm.material.clone()); bm.material.map = body; bm.material.needsUpdate = true; }
  // accessories
  for (const a of ch.accessories || []) a.parent?.remove(a);
  ch.accessories = [];
  if (look.hat && HATS[look.hat]) ch.accessories.push(hat(ch, ...HATS[look.hat]));
  if (look.glasses && GLASSES[look.glasses]) ch.accessories.push(glasses(ch, ...GLASSES[look.glasses]));
  ch.look = look;
}

// a frame on the head: x = the face's left, y = up, z = forward (from the eye bones)
function headFrame(ch) {
  const head = ch.bones.Head, L = ch.bones.face_LEye, R = ch.bones.face_REye, neck = ch.bones.Neck;
  if (!head || !L || !R) return null;
  ch.model.updateMatrixWorld(true);
  const toLocal = (b) => head.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
  const l = toLocal(L), r = toLocal(R), n = toLocal(neck || head.parent);
  const mid = l.clone().add(r).multiplyScalar(0.5);
  const x = l.clone().sub(r).normalize();
  let y = n.clone().negate().normalize(); y.sub(x.clone().multiplyScalar(y.dot(x))).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const s = 1 / head.getWorldScale(new THREE.Vector3()).x * ch.model.getWorldScale(new THREE.Vector3()).x;
  return { head, mid, q, s, eyeGap: l.distanceTo(r) };
}
const M = (color, rough = 0.6, metal = 0, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }); m.defines = { NO_SNOW: '' }; return m; };
function mount(ch, build) {
  const F = headFrame(ch); if (!F) return new THREE.Group();
  const g = new THREE.Group(); build(g, F.eyeGap);
  g.position.copy(F.mid); g.quaternion.copy(F.q); g.scale.setScalar(F.s);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  F.head.add(g);
  return g;
}
function glasses(ch, frame, lens, opacity) {
  return mount(ch, (g, gap) => {
    const fm = M(frame, 0.3, 0.6), lm = M(lens, 0.05, 0.2, { transparent: true, opacity, depthWrite: opacity > 0.5 });
    const r = gap * 0.42;
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0022, 6, 20), fm); ring.position.set(s * gap / 2, 0, 0.034); g.add(ring);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(r, 20), lm); glass.position.set(s * gap / 2, 0, 0.034); g.add(glass);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.1), fm); arm.position.set(s * (gap / 2 + r + 0.006), 0.004, -0.015); arm.rotation.y = s * 0.12; g.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(gap - 2 * r, 0.003, 0.003), fm); bridge.position.set(0, 0.006, 0.036); g.add(bridge);
  });
}
function hat(ch, style, color) {
  return mount(ch, (g) => {
    const m = M(color, 0.85);
    const crown = (sy, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(0.105, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), m); o.scale.set(0.95, sy, 1.08); o.position.set(0, y, z); o.rotation.x = -0.18; g.add(o); return o; };
    if (style === 'beanie') { crown(1.0, 0.06, -0.035); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.102, 0.035, 28, 1, true), m); b.position.set(0, 0.06, -0.035); b.rotation.x = -0.18; b.scale.set(0.97, 1, 1.1); g.add(b); }
    if (style === 'cap' || style === 'flat') {
      crown(style === 'flat' ? 0.55 : 0.85, 0.07, -0.03);
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 24, 1, false, -1.1, 2.2), m);
      visor.position.set(0, 0.07, 0.065); visor.rotation.x = style === 'flat' ? 0.12 : 0.05; visor.scale.set(1, 1, style === 'flat' ? 0.7 : 1.1); g.add(visor);
    }
    if (style === 'ushanka') {
      const fur = M(color, 1);
      crown(0.9, 0.06, -0.035);
      for (const s of [-1, 1]) { const flap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.08), fur); flap.position.set(s * 0.1, 0.0, -0.035); g.add(flap); }
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.045, 0.03), fur); front.position.set(0, 0.105, 0.06); g.add(front);
    }
  });
}

// thumbnail of one region of an avatar, for the wardrobe
const thumbCache = new Map();
export function thumb(people, id, what) {
  const k = id + what; if (thumbCache.has(k)) return thumbCache.get(k);
  const T = people.templates[id]; if (!T) return null;
  const src = imgOf(T, what === 'face' ? 'head' : 'body'); if (!src) return null;
  const W = src.width, H = src.height;
  const r = { face: [0.3, 0.06, 0.4, 0.5], top: [0.3, 0.02, 0.4, 0.5], legs: [0.0, 0.0, 0.27, 0.42], feet: [0.22, 0.72, 0.12, 0.27] }[what];
  const cv = canvas(72, 72), c = cv.getContext('2d');
  c.fillStyle = '#111'; c.fillRect(0, 0, 72, 72);
  const sw = r[2] * W, sh = r[3] * H, sc = Math.min(72 / sw, 72 / sh);
  c.drawImage(src, r[0] * W, r[1] * H, sw, sh, (72 - sw * sc) / 2, (72 - sh * sc) / 2, sw * sc, sh * sc);
  const url = cv.toDataURL('image/jpeg', 0.8);
  thumbCache.set(k, url);
  return url;
}
