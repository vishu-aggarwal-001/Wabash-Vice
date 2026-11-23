// Photo studio for vehicles: renders the real in-game models (not icons) on a glossy showroom
// floor under softbox lighting. Used for the picture on every car card (garage + dealership)
// and for the live, draggable turntable in the Lafayette Motors showroom.
//
// One small WebGL renderer of its own, so the game's renderer and post-processing are untouched.
// Models share materials with the game; nothing here ever disposes a material.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildModel } from './vehicles.js';

const BG = 0x0b0c0f;
const THUMB_W = 480, THUMB_H = 270;
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _up = new THREE.Vector3(), _p = new THREE.Vector3();

// a softbox-lit room, prefiltered into an environment map so paint, chrome and glass have
// something to reflect (same idea as three's RoomEnvironment)
function studioEnvironment(renderer) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 16, 40), new THREE.MeshBasicMaterial({ color: 0x15171b, side: THREE.BackSide }));
  room.position.y = 6; s.add(room);
  const panel = (w, h, k, color, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); s.add(m);
  };
  panel(16, 5, 6, 0xffffff, [0, 13.5, 0], [Math.PI / 2, 0, 0]);          // big overhead softbox
  panel(1.4, 9, 9, 0xffffff, [-12, 5, 2], [0, Math.PI / 2, 0]);          // strip lights: the long
  panel(1.4, 9, 9, 0xffffff, [12, 5, -2], [0, -Math.PI / 2, 0]);         // highlights down the flanks
  panel(10, 3, 3.5, 0xffe2b8, [0, 4, -16], [0, 0, 0]);                   // warm back wall
  panel(10, 3, 2.5, 0xcfe0ff, [0, 4, 16], [0, Math.PI, 0]);              // cool front fill
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x08090b }));
  floor.rotation.x = -Math.PI / 2; s.add(floor);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.035).texture;
  pm.dispose();
  return tex;
}

function radial(stops, size = 256, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, col] of stops) gr.addColorStop(t, col);
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Studio {
  constructor() {
    const canvas = this.canvas = document.createElement('canvas');
    canvas.className = 'studio-canvas';
    let r;
    try { r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' }); }
    catch (e) { console.warn('Studio: no WebGL', e); this.dead = true; return; }
    r.setPixelRatio(1);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(BG, 1);

    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(BG);
    s.environment = studioEnvironment(r);
    s.environmentIntensity = 1.15;
    
    const key = this.key = new THREE.DirectionalLight(0xfff6ea, 2.8);
    key.position.set(6, 14, 8); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 6;
    s.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.2); rim.position.set(-8, 6, -10); s.add(rim);
    s.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1712, 0.35));

    // glossy showroom floor: a mirror under a dark, mostly opaque coat that fades out at the edges
    this.mirror = new Reflector(new THREE.CircleGeometry(60, 64), { textureWidth: 1024, textureHeight: 1024, color: 0x6a6d72, clipBias: 0.003 });
    this.mirror.rotation.x = -Math.PI / 2; s.add(this.mirror);
    const coat = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshBasicMaterial({ color: BG, transparent: true, alphaMap: radial([[0, '#d0d0d0'], [0.05, '#d6d6d6'], [0.16, '#f4f4f4'], [0.3, '#ffffff'], [1, '#ffffff']], 256, false), depthWrite: false, fog: false, toneMapped: false }));
    coat.rotation.x = -Math.PI / 2; coat.position.y = 0.004; s.add(coat);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(255,236,200,0.22)'], [0.55, 'rgba(255,226,180,0.08)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.006; s.add(pool); this.pool = pool;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.55 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.008; shadow.receiveShadow = true; s.add(shadow); this.shadowPlane = shadow;
    // a soft dark blob right under the car, so it sits on the floor even where the shadow map is thin
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(0,0,0,0.75)'], [0.6, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, fog: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.01; s.add(blob); this.blob = blob;

    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 400);
    this.cache = new Map();   // key -> data URL
    this.queue = [];          // pending thumbnails
    this.live = null;         // { model, fit } on the turntable
    this.spin = 0.6; this.spinVel = 0; this.dragging = false; this.auto = true;
    this.liveW = 0; this.liveH = 0;
    this.bindDrag();
  }

  // ------------------------------------------------------------ models
  stage(spec, color, tune) {
    const { g } = buildModel(spec, color, tune);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    g.position.set(-c.x, -box.min.y, -c.z);   // centred, wheels on the floor
    const holder = new THREE.Group(); holder.add(g);
    return { model: holder, size, spec };
  }
  light(size) {
    const R = Math.max(size.x, size.z, size.y) * 0.5 + 1;
    const k = this.key, sc = k.shadow.camera;
    k.position.set(R * 0.9, R * 2.6 + 4, R * 1.1); k.target.position.set(0, 0, 0);
    sc.left = sc.bottom = -R * 1.3; sc.right = sc.top = R * 1.3; sc.near = 0.5; sc.far = R * 6 + 20; sc.updateProjectionMatrix();
    this.shadowPlane.scale.set(R * 3, R * 3, 1);
    this.pool.scale.setScalar(R * 2.2);
    this.blob.scale.set(size.x * 1.25, size.z * 1.12, 1);
  }
  // exact fit: put the camera so every corner of the vehicle's box lands inside the frame
  // (margin < 1 leaves room around it). With spins > 1 the fit holds at any turntable angle.
  frame(size, aspect, yaw, margin = 0.9, spins = 1) {
    const cam = this.camera;
    cam.aspect = aspect; cam.fov = 28; cam.updateProjectionMatrix();
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * margin, th = tv * aspect;
    const elev = 0.19;
    const dir = _d.set(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
    const target = _t.set(0, size.y * 0.32, 0);
    const right = _r.crossVectors(_up.set(0, 1, 0), dir).normalize(), up = _u.crossVectors(dir, right);
    let d = 0;
    for (let k = 0; k < spins; k++) {
      const a = k / spins * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) for (const y of [0, size.y]) {
        const x0 = sx * size.x, z0 = sz * size.z;
        _p.set(x0 * c + z0 * sn, y, -x0 * sn + z0 * c).sub(target);
        const z = _p.dot(dir);
        d = Math.max(d, z + Math.abs(_p.dot(right)) / th, z + Math.abs(_p.dot(up)) / tv);
      }
    }
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
  }

  // ------------------------------------------------------------ thumbnails
  key_(spec, color, tune) { return `${spec.id}|${color}|${tune ? JSON.stringify(tune) : ''}`; }
  cached(spec, color, tune) { return this.cache.get(this.key_(spec, color, tune)) || null; }
  // calls back with a data URL; rendered a few per frame so opening a menu never hitches
  thumb(spec, color, tune, cb) {
    if (this.dead) return;
    const k = this.key_(spec, color, tune), hit = this.cache.get(k);
    if (hit) { cb(hit); return; }
    const q = this.queue.find(e => e.k === k);
    if (q) { q.cbs.push(cb); return; }
    this.queue.push({ k, spec, color, tune, cbs: [cb] });
    this.kick();
  }
  kick() {
    if (this.pumping) return;
    this.pumping = true;
    requestAnimationFrame(() => this.tick());
  }
  renderThumb(job) {
    const r = this.renderer, st = this.stage(job.spec, job.color, job.tune);
    if (this.live) this.live.model.visible = false;
    this.scene.add(st.model);
    this.light(st.size);
    // front three-quarter view, the classic brochure angle (models face +Z)
    this.frame(st.size, THUMB_W / THUMB_H, -0.72, 0.86);
    this.size(THUMB_W, THUMB_H, 1);
    r.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/jpeg', 0.86);
    this.scene.remove(st.model);
    if (this.live) { this.live.model.visible = true; this.light(this.live.size); }
    this.cache.set(job.k, url);
    for (const cb of job.cbs) { try { cb(url); } catch (e) { console.warn(e); } }
  }

  // ------------------------------------------------------------ live turntable
  attach(el) {
    if (this.dead) return;
    el.appendChild(this.canvas);
    this.host = el;
    this.kick();
  }
  detach() {
    this.host = null; this.live && this.scene.remove(this.live.model); this.live = null;
    this.canvas.remove();
  }
  show(spec, color, tune) {
    if (this.dead) return;
    const keepSpin = this.live?.spec === spec;
    if (this.live) this.scene.remove(this.live.model);
    this.live = this.stage(spec, color, tune);
    this.scene.add(this.live.model);
    this.light(this.live.size);
    if (!keepSpin) { this.spin = 0; this.intro = 1; }
    this.kick();
  }
  bindDrag() {
    const c = this.canvas; let lastX = 0;
    c.addEventListener('pointerdown', (e) => { this.dragging = true; this.auto = false; lastX = e.clientX; c.setPointerCapture?.(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (!this.dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; this.spin += dx * 0.01; this.spinVel = dx * 0.01; });
    const up = () => { if (!this.dragging) return; this.dragging = false; clearTimeout(this.autoT); this.autoT = setTimeout(() => { this.auto = true; }, 2500); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }
  size(w, h, pr) {
    const c = this.canvas;
    if (c.width === Math.floor(w * pr) && c.height === Math.floor(h * pr)) return;
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
  }
  tick() {
    // thumbnails first (up to ~10 ms worth), then the live view
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 10) this.renderThumb(this.queue.shift());
    const r = this.renderer;
    if (this.host && this.live) {
      const w = Math.max(2, this.host.clientWidth), h = Math.max(2, this.host.clientHeight);
      this.size(w, h, Math.min(devicePixelRatio || 1, 2));
      if (this.auto) this.spin += 0.0035; else if (!this.dragging) { this.spin += this.spinVel; this.spinVel *= 0.94; }
      this.intro = Math.max(0, (this.intro || 0) - 0.04);
      this.live.model.rotation.y = this.spin;
      this.frame(this.live.size, w / h, -0.62, 0.8 / (1 + this.intro * this.intro * 0.3), 12);
      r.render(this.scene, this.camera);
    }
    if (this.queue.length || this.host) requestAnimationFrame(() => this.tick());
    else this.pumping = false;
  }
}
