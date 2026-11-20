// Realistic skinned people: a Ready Player Me man and a Mixamo woman, driven by
// motion-captured idle / walk / run clips (data/chars/anims.json), plus procedural
// layers for sitting, driving, riding, punching, getting knocked down and swimming.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

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
    const kids = sKids[b.name];
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
    const out = {}; for (const b of tBones) if (interp[b.name]) out[b.name] = [];
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

  async load(base = '') {
    const L = new GLTFLoader();
    const [man, woman, anims] = await Promise.all([
      L.loadAsync(base + 'data/chars/man.glb'), L.loadAsync(base + 'data/chars/woman.glb'),
      fetch(base + 'data/chars/anims.json').then(r => r.json()),
    ]);
    this.templates = { man: this.prep(man, anims), woman: this.prep(woman, anims) };
    this.ok = true;
  }

  prep(gltf, anims) {
    const scene = gltf.scene;
    scene.traverse((o) => {
      if (o.isBone) o.name = o.name.replace(/^mixamorig:?/, '');
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        if (/Teeth/.test(o.name)) o.visible = false;
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
  make(kind = 'man', opts = {}) {
    const tplName = kind === 'woman' ? 'woman' : 'man';
    const T = this.templates[tplName];
    const model = skClone(T.scene);
    const outfits = OUTFITS[kind] || OUTFITS.man;
    const outfit = opts.outfit ?? outfits[Math.floor(Math.random() * outfits.length)];
    model.traverse((o) => {
      if (!o.isMesh) return;
      const n = o.material.name || '';
      if (tplName === 'man') {
        if (/Headwear/.test(n)) o.visible = kind === 'man' && Math.random() < 0.15;
        else if (/Outfit_Top/.test(n)) o.material = this.material(o.material, outfit[0]);
        else if (/Outfit_Bottom/.test(n)) o.material = this.material(o.material, outfit[1]);
        else if (/Footwear/.test(n)) o.material = this.material(o.material, outfit[2]);
        else if (/Beard/.test(n)) o.visible = kind === 'player' || kind === 'man' && Math.random() < 0.5;
      } else if (outfit[0] !== 0xffffff) o.material = this.material(o.material, outfit[0]);
    });
    const root = new THREE.Group();
    const s = (opts.height ?? (tplName === 'woman' ? 1.66 : 1.8) * (opts.vary === false ? 1 : 0.95 + Math.random() * 0.08)) / T.height;
    model.scale.multiplyScalar(s);
    model.position.y = -T.minY * s;
    root.add(model);
    if (tplName === 'man') {
      const hasHat = model.getObjectByProperty('visible', true) && [...meshes(model)].some(m => /Headwear/.test(m.material.name) && m.visible);
      const r = Math.random();
      const style = opts.head ?? (kind === 'cop' ? 'police' : kind === 'medic' ? 'short' : kind === 'player' ? 'short' : hasHat ? 'none' : r < 0.45 ? 'short' : r < 0.7 ? 'beanie' : r < 0.85 ? 'cap' : 'none');
      if (style !== 'none') headwear(model, style, opts.hairColor);
    }
    return new Character(root, model, T, kind);
  }
}

function* meshes(o) { const st = [o]; while (st.length) { const x = st.pop(); if (x.isMesh) yield x; st.push(...x.children); } }

// ---------------------------------------------------------------- hair & hats
const HAIR = [0x1c140e, 0x2b1d12, 0x0e0b09, 0x4a3420, 0x6b4c2f, 0x8a6a45, 0x5a5a5a];
const KNIT = [0x1f2c45, 0x8c1d1d, 0x2f4a2f, 0x3a3a3a, 0xcfb991, 0x6b4a2a, 0xd9d4c7, 0x111111];
const texCache = {};
function strandTex(kind) {
  if (texCache[kind]) return texCache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
  if (kind === 'hair') {
    for (let i = 0; i < 900; i++) { const x = Math.random() * 128, y = Math.random() * 128, v = 150 + Math.random() * 105; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.6 + Math.random(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y + 6 + Math.random() * 10); g.stroke(); }
  } else {
    for (let x = 0; x < 128; x += 4) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 1.5, 128); }
    for (let y = 0; y < 128; y += 3) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y, 128, 1); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 104, 128, 3);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(kind === 'hair' ? 3 : 6, kind === 'hair' ? 1 : 1);
  return (texCache[kind] = t);
}
const matCache2 = new Map();
function mat(color, kind, rough = 0.9) {
  const k = color + kind;
  if (!matCache2.has(k)) { const m = new THREE.MeshStandardMaterial({ color, roughness: rough, map: kind ? strandTex(kind) : null }); m.defines = { NO_SNOW: '' }; matCache2.set(k, m); }
  return matCache2.get(k);
}
function headwear(model, style, hairColor) {
  model.updateMatrixWorld(true);
  const head = model.getObjectByName('Head'), top = model.getObjectByName('HeadTop_End');
  if (!head) return;
  const hp = head.getWorldPosition(new THREE.Vector3()), tp = top ? top.getWorldPosition(new THREE.Vector3()) : hp.clone().add(new THREE.Vector3(0, 0.2, 0));
  const R = hp.distanceTo(tp) * 0.5;                       // ~ skull radius
  const c = hp.clone().lerp(tp, 0.47);
  const g = new THREE.Group(); g.position.copy(c);
  const add = (geo, m, x, y, z, rx = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x * R, y * R, z * R); o.rotation.x = rx; o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
  const hc = hairColor ?? HAIR[Math.floor(Math.random() * HAIR.length)];
  if (style === 'short' || style === 'cap') {
    add(new THREE.SphereGeometry(R, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(hc, 'hair'), 0, 0.03, -0.05, -0.32, 0.86, 1.04, 1.04);
  }
  if (style === 'beanie') {
    const k = KNIT[Math.floor(Math.random() * KNIT.length)];
    add(new THREE.SphereGeometry(R * 1.06, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(k, 'knit'), 0, 0.12, -0.05, -0.3, 0.88, 1.12, 1.0);
    add(new THREE.CylinderGeometry(R * 1.06, R * 1.08, R * 0.34, 28, 1, true), mat(k, 'knit'), 0, 0.06, -0.05, -0.3, 0.88, 1, 1.0).material.side = THREE.DoubleSide;
  }
  if (style === 'cap' || style === 'police') {
    const col = style === 'police' ? 0x141a2c : [0x1f2c45, 0x111111, 0x8c1d1d, 0xcfb991, 0xeeeeee][Math.floor(Math.random() * 5)];
    const m = mat(col, null, 0.7);
    if (style === 'police') {
      add(new THREE.CylinderGeometry(R * 1.05, R * 0.92, R * 0.62, 24), m, 0, 0.62, -0.04, -0.12, 0.92, 1, 1);
      add(new THREE.CylinderGeometry(R * 0.98, R * 0.98, R * 0.06, 24, 1, false, -1.1, 2.2), mat(0x050505, null, 0.25), 0, 0.33, 0.2, -0.12, 0.92, 1, 1);
      add(new THREE.CircleGeometry(R * 0.14, 10), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.9, roughness: 0.3 }), 0, 0.7, 0.92, -0.12);
    } else {
      add(new THREE.SphereGeometry(R * 1.04, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), m, 0, 0.14, -0.03, -0.2, 0.88, 0.95, 1.0);
      add(new THREE.CylinderGeometry(R * 0.8, R * 0.8, R * 0.05, 24, 1, false, -1.0, 2.0), m, 0, 0.2, 0.62, -0.08, 0.95, 1, 1.0);
    }
  }
  g.updateMatrixWorld(true); head.attach(g);
}

export class Character {
  constructor(root, model, T, kind) {
    this.mesh = root; this.model = model; this.kind = kind;
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
      this.apply(PUNCH_GUARD, guard * (1 - hit));
      this.apply(PUNCH_HIT, hit);
    }
    if (this.kickT > 0) { this.kickT -= dt; const p = 1 - this.kickT / 0.55; this.apply(KICK, Math.sin(Math.min(1, p) * Math.PI)); }
    // whole-body: lying down / swimming / leaning on a bike
    const lie = mode === 'down' ? -Math.PI / 2 : mode === 'swim' ? 1.25 : 0;
    this.tilt += (lie - this.tilt) * Math.min(1, dt * (mode === 'down' ? 10 : 5));
    this.model.rotation.x = this.tilt;
    const lift = mode === 'down' ? 0.18 : mode === 'swim' ? 0.9 : mode === 'ride' ? -0.52 : mode === 'sit' || mode === 'drive' ? -0.46 : 0;
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
