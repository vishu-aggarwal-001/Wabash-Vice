// Realistic skinned people: Microsoft Rocketbox avatars (MIT licence, data/chars/rb), driven by
// motion-captured idle / walk / run clips (data/chars/anims.json), plus procedural
// layers for sitting, driving, riding, punching, getting knocked down and swimming.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { dress, normalizeLook, npcHat } from './outfit.js';

const D = Math.PI / 180;
// native ground speed of each clip (m/s) so feet don't slide
const NATIVE = { walk: 1.45, run: 4.6 };

// Procedural poses, in the CHARACTER's frame (X = the character's left, Y = up, Z = forward), degrees.
// Negative X swings a hanging limb forward; +Z swings it out to the character's left. Children
// inherit their parent's swing, so a knee of +X folds the shin back down under a raised thigh.
const POSES = {
  sit: { LeftUpLeg: [-88, 0, 4], RightUpLeg: [-88, 0, -4], LeftLeg: [88, 0, 0], RightLeg: [88, 0, 0], LeftArm: [-20, 0, -8], RightArm: [-20, 0, 8], LeftForeArm: [-45, 0, 0], RightForeArm: [-45, 0, 0] },
  drive: { LeftUpLeg: [-80, 0, 6], RightUpLeg: [-80, 0, -6], LeftLeg: [65, 0, 0], RightLeg: [65, 0, 0], LeftArm: [-55, 0, -10], RightArm: [-55, 0, 10], LeftForeArm: [-25, 0, -20], RightForeArm: [-25, 0, 20], Spine: [-8, 0, 0] },
  ride: { Spine: [22, 0, 0], LeftUpLeg: [-70, 0, 20], RightUpLeg: [-70, 0, -20], LeftLeg: [85, 0, 0], RightLeg: [85, 0, 0], LeftArm: [-60, 0, -12], RightArm: [-60, 0, 12], LeftForeArm: [-10, 0, -10], RightForeArm: [-10, 0, 10], Neck: [-20, 0, 0] },
  down: { LeftArm: [0, 0, 70], RightArm: [0, 0, -70], LeftForeArm: [0, 0, 20], RightForeArm: [0, 0, -30], LeftUpLeg: [-6, 0, 12], RightUpLeg: [4, 0, -8], LeftLeg: [14, 0, 0], Head: [0, 35, 0] },
  jump: { LeftUpLeg: [-55, 0, 0], RightUpLeg: [12, 0, 0], LeftLeg: [75, 0, 0], RightLeg: [45, 0, 0], LeftArm: [-25, 0, 35], RightArm: [-25, 0, -35] },
  swim: { Neck: [-50, 0, 0], LeftArm: [-150, 0, 20], RightArm: [-150, 0, -20] },
  hands_up: { LeftArm: [0, 0, 160], RightArm: [0, 0, -160], LeftForeArm: [0, 0, 10], RightForeArm: [0, 0, -10] },
  wave: { RightArm: [0, 0, -150], RightForeArm: [0, 0, -25] },
  cower: { Spine: [28, 0, 0], LeftUpLeg: [-50, 0, 8], RightUpLeg: [-50, 0, -8], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0], LeftArm: [-80, 0, -30], RightArm: [-80, 0, 30], LeftForeArm: [-80, 0, -50], RightForeArm: [-80, 0, 50] },
};
const PUNCH_GUARD = { LeftArm: [-45, 0, -12], RightArm: [-45, 0, 12], LeftForeArm: [-110, 0, -25], RightForeArm: [-110, 0, 25], Spine: [0, 12, 0] };
const PUNCH_HIT = { RightArm: [-88, 0, 4], RightForeArm: [-4, 0, 0], LeftArm: [-45, 0, -12], LeftForeArm: [-110, 0, -25], Spine: [6, -28, 0] };
export const SWING_UP = { Spine: [0, -30, 0], RightArm: [0, 0, -60], RightForeArm: [0, 0, -110], RightHand: [-75, 0, 0], LeftArm: [-70, -40, 0], LeftForeArm: [-60, 0, 0] };
export const SWING_HIT = { Spine: [6, 35, 0], RightArm: [-80, 40, 0], RightForeArm: [-10, 0, 0], RightHand: [70, 0, 0], LeftArm: [-60, 30, 0], LeftForeArm: [-30, 0, 0] };
export const AIM_1H = { RightArm: [-86, 6, 0], RightForeArm: [-6, 0, 0], RightHand: [0, 0, 0], Spine: [0, -8, 0] };
export const AIM_2H = { RightArm: [-80, 18, 0], RightForeArm: [-25, 0, 0], LeftArm: [-82, -38, 0], LeftForeArm: [-30, 0, 0], Spine: [0, -14, 0] };
const KICK = { RightUpLeg: [-100, 0, 0], RightLeg: [10, 0, 0], LeftArm: [-20, 0, 30], RightArm: [-20, 0, -30], Spine: [-18, 0, 0] };

const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _r = new THREE.Quaternion(), _e = new THREE.Euler();

const OUTFITS = {
  // [top, bottom, shoes] colour multipliers for the man's suit textures
  man: [[0xffffff, 0xffffff, 0xffffff], [0x3a4c7a, 0x2b2b30, 0xffffff], [0x6b4a32, 0x2a2a2a, 0x5a3a24], [0x2a2a2a, 0x3c4f6e, 0xffffff], [0x7a2a2a, 0x22252b, 0xffffff], [0xb8a27a, 0x4a4036, 0x5a3a24], [0x355e3b, 0x2d2d2d, 0xffffff], [0x9aa3ad, 0x3a3f47, 0xffffff], [0xcfb991, 0x1b1b1b, 0xffffff]],
  cop: [[0x1d2a4a, 0x141a2c, 0x222222]],
  medic: [[0xe8eef5, 0x2c3d63, 0xffffff]],
  player: [[0x3b2a20, 0x1f2633, 0x4a3020]],
  woman: [[0xffffff], [0xffd6c9], [0xd2e4ff], [0xe9ffd8], [0xf0e0ff], [0xffe9b8]],
};

// Retarget the source (X Bot) clips onto another Mixamo-style skeleton whose bones may be
// oriented differently: carry each bone's world-space rotation *relative to the shared T-pose*.
function retarget(scene, anims, hips, restHips) {
  const Q = () => new THREE.Quaternion();
  const strip = (n) => n && n.replace(/^mixamorig:?/, '');
  const Rs = {}, RsInv = {}, srcLocalRest = {}, order = anims._rest.map(([n, p, q, pos]) => [strip(n), strip(p), q, pos]);
  for (const [n, , q] of order) { Rs[n] = Q().fromArray(q); RsInv[n] = Rs[n].clone().invert(); }
  for (const [n, p] of order) srcLocalRest[n] = p ? RsInv[p].clone().multiply(Rs[n]) : Rs[n].clone();
  const tBones = []; scene.traverse((o) => { if (o.isBone) tBones.push(o); });
  const Rt = {}, rootW = {};
  for (const b of tBones) { Rt[b.name] = b.getWorldQuaternion(Q()); if (!b.parent.isBone) rootW[b.name] = b.parent.getWorldQuaternion(Q()); }
  // Rest poses can differ (this source is a T-pose, Ready Player Me rests in an A-pose with arms
  // 60° down). For every bone with a single child, find the rotation C that turns the source's rest
  // bone direction into the target's; the retarget then maps "same direction" onto "same direction".
  const Cinv = {};
  const sPos = {}, sKids = {};
  for (const [n, par, , p] of order) { if (p) sPos[n] = new THREE.Vector3().fromArray(p); if (par) (sKids[par] ||= []).push(n); }
  const tByName = {}; for (const b of tBones) tByName[b.name] = b;
  for (const b of tBones) {
    let kids = sKids[b.name];
    // bones that branch: aim along the main chain (wrist -> middle finger, chest -> neck, hips -> spine)
    const prefer = { LeftHand: 'LeftHandMiddle1', RightHand: 'RightHandMiddle1', Spine2: 'Neck', Hips: 'Spine' }[b.name];
    if (prefer && kids?.includes(prefer)) kids = [prefer];
    if (!kids || kids.length !== 1 || !sPos[b.name] || !sPos[kids[0]] || !tByName[kids[0]]) continue;
    const ds = sPos[kids[0]].clone().sub(sPos[b.name]).normalize();
    const dt = tByName[kids[0]].getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
    if (ds.lengthSq() < 0.5 || dt.lengthSq() < 0.5) continue;
    Cinv[b.name] = Q().setFromUnitVectors(ds, dt).invert();
  }
  const hipsParentInv = hips.parent.matrixWorld.clone().invert();
  const o0 = new THREE.Vector3().applyMatrix4(hipsParentInv);
  const clips = {};
  for (const [key, c] of Object.entries(anims)) {
    if (key === '_rest') continue;
    const name = key.split(':')[1].toLowerCase();
    if (clips[name]) continue;
    const interp = {}; let times = null, bob = null;
    for (const t of c.tracks) {
      if (t.name === 'Hips.bob') { bob = new THREE.VectorKeyframeTrack('b', t.times, t.values).createInterpolant(); continue; }
      const tr = new THREE.QuaternionKeyframeTrack(t.name, t.times, t.values);
      interp[t.name.split('.')[0]] = tr.createInterpolant();
      if (!times || t.times.length > times.length) times = t.times;
    }
    const out = {}; for (const b of tBones) if (interp[b.name] && !/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(b.name)) out[b.name] = [];
    const pos = [];
    const Ws = {}, Wt = {}, tmp = Q();
    for (const t of times) {
      for (const [n, p] of order) {
        const L = interp[n] ? tmp.fromArray(interp[n].evaluate(t)) : srcLocalRest[n];
        Ws[n] = (p ? Ws[p].clone() : Q()).multiply(L);
      }
      for (const b of tBones) {
        const pw = b.parent.isBone ? Wt[b.parent.name] : rootW[b.name];
        if (out[b.name]) {
          Wt[b.name] = Ws[b.name].clone().multiply(RsInv[b.name]);
          if (Cinv[b.name]) Wt[b.name].multiply(Cinv[b.name]);
          Wt[b.name].multiply(Rt[b.name]);
          const local = pw.clone().invert().multiply(Wt[b.name]);
          out[b.name].push(local.x, local.y, local.z, local.w);
        } else Wt[b.name] = pw.clone().multiply(b.quaternion);
      }
      const dy = bob ? bob.evaluate(t)[1] : 0;
      const v = new THREE.Vector3(0, dy, 0).applyMatrix4(hipsParentInv).sub(o0);
      pos.push(restHips.x + v.x, restHips.y + v.y, restHips.z + v.z);
    }
    const tracks = Object.entries(out).map(([n, v]) => new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, v));
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, pos));
    clips[name] = new THREE.AnimationClip(name, c.duration, tracks);
  }
  return clips;
}

export class People {
  constructor() { this.ok = false; this.matCache = new Map(); }

  // Rocketbox townspeople. A core set loads before the game starts; the rest stream in while you play.
  async load(base = '') {
    this.base = base;
    this.L = new GLTFLoader();
    this.L.setMeshoptDecoder(MeshoptDecoder);
    this.templates = {}; this.loading = {}; this.masks = {};
    [this.anims, this.index] = await Promise.all([fetch(base + 'data/chars/anims.json').then(r => r.json()), fetch(base + 'data/chars/rb/index.json').then(r => r.json())]);
    this.meta = Object.fromEntries(this.index.map(m => [m.id, m]));
    const look = normalizeLook(this.look);
    const core = new Set([look.base, look.head, look.legs, look.feet, ...CORE].filter(id => id && this.meta[id]));
    await Promise.all([...core].map(n => this.ensure(n)));
    this.ok = true;
  }
  ensure(id) {
    if (!this.meta[id]) return Promise.resolve(null);
    return (this.loading[id] ||= this.L.loadAsync(this.base + `data/chars/rb/${id}.glb`)
      .then(async (g) => { if (this.lite) await shrink(g.scene, 512); const T = this.prep(g, this.anims); T.meta = this.meta[id]; T.id = id; this.templates[id] = T; return T; })
      .catch((e) => { console.warn('could not load person', id, e); return null; }));
  }
  // region mask of an avatar's body texture (0 top, 1 legs, 2 feet, 3 palms, 4 fingers), 256 px
  mask(id) {
    return (this.masks[id] ||= new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
        x.drawImage(im, 0, 0, 256, 256);
        const d = x.getImageData(0, 0, 256, 256).data, cls = new Uint8Array(256 * 256);
        for (let i = 0; i < cls.length; i++) cls[i] = Math.round(d[i * 4] / 50);
        const alpha = {};
        for (const k of [1, 2, 3, 4]) {
          const a = document.createElement('canvas'); a.width = a.height = 256; const ax = a.getContext('2d'), id2 = ax.createImageData(256, 256);
          for (let i = 0; i < cls.length; i++) if (cls[i] === k) id2.data[i * 4 + 3] = 255;
          ax.putImageData(id2, 0, 0); alpha[k] = a;
        }
        res({ cls, alpha });
      };
      im.onerror = () => res(null);
      im.src = this.base + `data/chars/rb/masks/${id}.png`;
    }));
  }
  // the player: an avatar's body with a mixed-and-matched look (see outfit.js)
  makePlayer(look) {
    look = normalizeLook(look);
    const T = this.templates[look.base] || this.templates[DEFAULT_PLAYER];
    if (!T) return this.make('man');
    const model = skClone(T.scene);
    const root = new THREE.Group();
    const s = (look.g === 'f' ? 1.68 : 1.8) / T.height;
    model.scale.multiplyScalar(s); model.position.y = -T.minY * s;
    root.add(model);
    const c = new Character(root, model, T, 'player');
    dress(this, c, look);
    return c;
  }
  // everyone (the wardrobe), or on phones a varied crowd of 18 plus the uniforms
  loadRest(all = false) {
    if (all || !this.lite) return Promise.all(this.index.map(m => this.ensure(m.id)));
    const civ = this.index.filter(m => ['civ', 'biz', 'worker'].includes(m.role)).sort(() => Math.random() - 0.5).slice(0, 18);
    return Promise.all([...civ, ...this.index.filter(m => !['civ', 'biz', 'worker'].includes(m.role))].map(m => this.ensure(m.id)));
  }
  pool(role, g) { return Object.keys(this.templates).filter(id => { const m = this.meta[id]; return (Array.isArray(role) ? role.includes(m.role) : m.role === role) && (!g || m.g === g); }); }
  get men() { return this.pool(['civ', 'biz', 'worker'], 'm'); }
  get women() { return this.pool(['civ', 'biz'], 'f'); }
  get cops() { return this.pool('cop', 'm'); }

  prep(gltf, anims) {
    const scene = gltf.scene;
    scene.traverse((o) => {
      if (o.isBone) o.name = o.name.replace(/^mixamorig:?/, '');
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        if (/Teeth/.test(o.name)) o.visible = false;
        if (/hair/.test(o.name)) o.receiveShadow = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { m.defines = { ...(m.defines || {}), NO_SNOW: '' }; m.envMapIntensity = 0.6; if (m.map) m.map.anisotropy = 4; if (m.metalness > 0.5) m.metalness = 0.1; }
      }
    });
    // some rigs ship a TPose clip: put the skeleton into it so its rest pose matches the source rig
    const tpose = gltf.animations.find(a => /tpose/i.test(a.name));
    if (tpose) {
      const mx = new THREE.AnimationMixer(scene);
      const tr = tpose.tracks.filter(t => !/position|scale/.test(t.name)).map(t => { const c = t.clone(); c.name = c.name.replace(/^mixamorig:?/, ''); return c; });
      mx.clipAction(new THREE.AnimationClip('t', tpose.duration, tr)).play(); mx.update(0);
    }
    scene.updateMatrixWorld(true);
    const hips = scene.getObjectByName('Hips');
    const box = new THREE.Box3().setFromObject(scene, true);
    const height = box.max.y - box.min.y;
    const unit = 1 / hips.parent.getWorldScale(new THREE.Vector3()).y;   // metres -> the hips' local units
    const restHips = hips.position.clone();
    const clips = retarget(scene, anims, hips, restHips);
    return { scene, clips, height, minY: box.min.y };
  }

  material(src, color) {
    const k = src.uuid + ':' + color;
    if (!this.matCache.has(k)) { const m = src.clone(); m.color = new THREE.Color(color); this.matCache.set(k, m); }
    return this.matCache.get(k);
  }

  // kind: man | woman | cop | medic | player
  // kind: man | woman | cop | medic | player
  make(kind = 'man', opts = {}) {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const want = ALIAS[opts.template] || opts.template;
    const byKind = { cop: () => this.cops, swat: () => this.pool('swat'), medic: () => this.pool('medic', opts.female ? 'f' : null), fire: () => this.pool('fire'), woman: () => this.women, man: () => this.men };
    let list = (byKind[kind] || byKind.man)();
    if (kind === 'cop' && opts.female) list = this.pool('cop', 'f').concat(list).slice(0, 1);
    if (!list.length) list = this.men.length ? this.men : Object.keys(this.templates);
    const tplName = want && this.templates[want] ? want : pick(list);
    const T = this.templates[tplName];
    const model = skClone(T.scene);
    const female = T.meta?.g === 'f';
    const root = new THREE.Group();
    const s = (opts.height ?? (female ? 1.66 : 1.79) * (opts.vary === false || kind === 'player' ? 1 : 0.95 + Math.random() * 0.08)) / T.height;
    model.scale.multiplyScalar(s);
    model.position.y = -T.minY * s;
    root.add(model);
    const ch = new Character(root, model, T, kind);
    if (opts.head === 'beanie' || opts.head === 'cap') npcHat(ch, opts.head);
    return ch;
  }
}
const DEFAULT_PLAYER = 'Male_Adult_04';
// downscale an avatar's textures (phones): keeps GPU memory and upload time down
async function shrink(scene, size) {
  const jobs = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.material?.map?.image || typeof createImageBitmap !== 'function') return;
    const t = o.material.map, im = t.image;
    if ((im.width || 0) <= size) return;
    jobs.push(createImageBitmap(im, { resizeWidth: size, resizeHeight: size, resizeQuality: 'medium' }).then((b) => { t.image = b; t.needsUpdate = true; }).catch(() => {}));
  });
  await Promise.all(jobs);
}
const CORE = ['Male_Adult_02', 'Male_Adult_09', 'Male_Adult_17', 'Business_Male_02', 'Female_Adult_05', 'Female_Adult_13', 'Police_Male_03', 'Security_Male_01'];
// story characters by role
const ALIAS = { m_business: 'Business_Male_07', m_leather: 'Business_Male_04', m_tracksuit: 'Male_Adult_17', m_tattoo: 'Delivery_Male_01', m_hoodie: 'Male_Adult_18', m_viking: 'Construction_Male_01', m_worker: 'Construction_Male_02', m_denim: 'Male_Adult_12', m_old: 'Male_Adult_03', f_sport: 'Business_Female_01' };

function* meshes(o) { const st = [o]; while (st.length) { const x = st.pop(); if (x.isMesh) yield x; st.push(...x.children); } }

export class Character {
  constructor(root, model, T, kind) {
    this.mesh = root; this.model = model; this.kind = kind; this.T = T;
    this.bones = {};
    model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const n of ['idle', 'walk', 'run']) {
      const a = this.mixer.clipAction(T.clips[n]); a.play(); a.weight = n === 'idle' ? 1 : 0; a.time = Math.random() * T.clips[n].duration;
      this.actions[n] = a;
    }
    this.w = { idle: 1, walk: 0, run: 0 };
    this.pose = null; this.poseW = 0; this.punchT = 0; this.kickT = 0;
    this.lean = 0; this.tilt = 0; this.baseY = model.position.y;
    // standing hip height in metres, for sitting on seats of the right height
    model.updateMatrixWorld(true);
    const hb = this.bones.Hips; this.hipH = hb ? hb.getWorldPosition(new THREE.Vector3()).y - root.getWorldPosition(new THREE.Vector3()).y : 0.9;
  }

  // mode: idle|walk|run|jump|swim|sit|drive|ride|down|cower|hands_up ; speed in m/s
  update(dt, mode, speed = 0) {
    // locomotion blend weights
    const loco = mode === 'walk' || mode === 'run' || mode === 'swim' || mode === 'jump';
    const tw = { idle: 0, walk: 0, run: 0 };
    if (mode === 'run' || mode === 'jump') tw.run = 1;
    else if (mode === 'walk') { const k = THREE.MathUtils.clamp((speed - 2.2) / 1.6, 0, 1); tw.walk = 1 - k; tw.run = k; }
    else if (mode === 'swim') tw.walk = 1;
    else tw.idle = 1;
    const k = Math.min(1, dt * 8);
    let sum = 0;
    for (const n in tw) { this.w[n] += (tw[n] - this.w[n]) * k; sum += this.w[n]; }
    for (const n in tw) this.actions[n].setEffectiveWeight(this.w[n] / (sum || 1));
    if (loco && speed > 0.2) {
      this.actions.walk.timeScale = THREE.MathUtils.clamp(speed / NATIVE.walk, 0.6, 1.8);
      this.actions.run.timeScale = THREE.MathUtils.clamp(speed / NATIVE.run, 0.7, 1.5);
    }
    if (mode === 'jump') this.actions.run.timeScale = 0.15;
    if (mode === 'swim') this.actions.walk.timeScale = 0.7;
    this.mixer.update(dt);

    // procedural pose layer
    const want = POSES[mode] ? mode : null;
    if (want !== this.pose && this.poseW < 0.02) this.pose = want;
    const target = want && want === this.pose ? 1 : 0;
    this.poseW += (target - this.poseW) * Math.min(1, dt * (mode === 'down' ? 12 : 9));
    if (this.pose && this.poseW > 0.01) this.apply(POSES[this.pose], this.poseW);
    // punch / kick overlays
    if (this.punchT > 0) {
      this.punchT -= dt;
      const p = 1 - this.punchT / 0.42;                       // 0..1
      const guard = Math.min(1, p * 6) * Math.min(1, this.punchT * 8);
      const hit = p > 0.18 && p < 0.7 ? Math.sin((p - 0.18) / 0.52 * Math.PI) : 0;
      if (this.weapon?.swing) {   // wind up over the shoulder, then sweep across
        const ss = THREE.MathUtils.smoothstep;
        const up = p < 0.35 ? ss(p, 0, 0.3) : Math.max(0, 1 - (p - 0.35) / 0.15);
        const sw = p < 0.6 ? ss(p, 0.3, 0.6) : 1 - ss(p, 0.75, 1);
        this.apply(SWING_UP, up * (1 - sw));
        this.apply(SWING_HIT, sw);
      } else {
        this.apply(PUNCH_GUARD, guard * (1 - hit));
        this.apply(PUNCH_HIT, hit);
      }
    }
    this.aimW = (this.aimW || 0) + ((this.aiming ? 1 : 0) - (this.aimW || 0)) * Math.min(1, dt * 14 + (this.aiming ? 0.2 : 0));
    if (this.aimW > 0.01) this.apply(this.twoHand ? AIM_2H : AIM_1H, this.aimW);
    if (this.kickT > 0) { this.kickT -= dt; const p = 1 - this.kickT / 0.55; this.apply(KICK, Math.sin(Math.min(1, p) * Math.PI)); }
    // whole-body: lying down / swimming / leaning on a bike
    const lie = mode === 'down' ? -Math.PI / 2 : mode === 'swim' ? 1.25 : 0;
    this.tilt += (lie - this.tilt) * Math.min(1, dt * (mode === 'down' ? 10 : 5));
    this.model.rotation.x = this.tilt;
    if (this.grip) for (const [b, r, c] of this.grip) b.quaternion.copy(r).multiply(c);   // fist around a weapon
    const lift = mode === 'down' ? 0.18 : mode === 'swim' ? 0.9 : mode === 'ride' ? -(this.hipH - 0.1) : mode === 'sit' || mode === 'drive' ? -(this.hipH - 0.44) : 0;
    this.model.position.z = (mode === 'down' ? -0.85 : 0) * Math.abs(this.tilt) / (Math.PI / 2);
    this.liftY = (this.liftY ?? 0) + (lift - (this.liftY ?? 0)) * Math.min(1, dt * 8);
    this.model.position.y = this.baseY + this.liftY;
  }

  // rotate bones in the character's frame: local' = (P^-1 R P) local, P = parent's rotation in model space
  apply(pose, w) {
    const order = this.order(pose);
    for (const [b, chain, [x, y, z]] of order) {
      _p.identity();
      for (const a of chain) _p.multiply(a.quaternion);
      _q.setFromEuler(_e.set(x * D * w, y * D * w, z * D * w, 'YXZ'));
      _r.copy(_p).invert().multiply(_q).multiply(_p);
      b.quaternion.premultiply(_r);
    }
  }
  order(pose) {
    if (pose.__o?.get(this)) return pose.__o.get(this);
    const list = [];
    for (const [name, rot] of Object.entries(pose)) {
      const b = this.bones[name]; if (!b) continue;
      const chain = []; for (let a = b.parent; a && a !== this.model; a = a.parent) chain.unshift(a);
      list.push([b, chain, rot]);
    }
    list.sort((a, b) => a[1].length - b[1].length);
    (pose.__o ||= new WeakMap()).set(this, list);
    return list;
  }



  punch() { if (this.punchT <= 0) { this.punchT = 0.42; return true; } return false; }
  kick() { if (this.kickT <= 0) { this.kickT = 0.55; return true; } return false; }
  get attacking() { return this.punchT > 0 || this.kickT > 0; }
}
