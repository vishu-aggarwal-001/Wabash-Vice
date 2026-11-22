// Lafayette Auto Mall: your garage and the dealership. Every vehicle gets a studio photo
// rendered from its real 3D model, and "View 3D" puts it on a turntable you can spin.
// Photos are rendered with the game's own renderer right after a normal frame (the shop
// covers the screen, so nobody sees it happen) and copied out of the canvas.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CATALOG, byId, buildModel } from './vehicles.js';

const SHOW_COLORS = [0xb3121a, 0x1f4e9c, 0x0d0f12, 0xe8e8e8, 0x2e6b3a, 0x8e9aa6, 0xd99a1e, 0x5a2a82];
const CATS = ['All', 'Cars', 'Bikes', 'Boats', 'Aircraft'];
const catOf = (s) => s.cat === 'Big rigs' || s.cat === 'Emergency' ? 'Cars' : s.cat;
const money = (n) => '$' + n.toLocaleString();
const mph = (s) => Math.round(s.max * 2.237);

export class Dealer {
  constructor(g) {
    this.g = g; this.open = false; this.tab = 'garage'; this.cat = 'All';
    this.thumbs = new Map(); this.queue = []; this.viewer = null;
    this.buildStudio();
    this.buildUI();
  }

  // ------------------------------------------------------------------ studio
  buildStudio() {
    const sc = this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.g.renderer);
    sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.environmentIntensity = 0.85;
    // backdrop: a dark showroom gradient with a soft spotlight glow
    const c = document.createElement('canvas'); c.width = 16; c.height = 256;
    const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#2a2d33'); gr.addColorStop(0.55, '#15171b'); gr.addColorStop(1, '#070809');
    x.fillStyle = gr; x.fillRect(0, 0, 16, 256);
    const bg = new THREE.CanvasTexture(c); bg.colorSpace = THREE.SRGBColorSpace;
    sc.background = bg;
    sc.fog = new THREE.Fog(0x15171b, 20, 80);   // the floor fades into the backdrop instead of ending in a hard line
    // glossy dark floor + contact shadow
    const floor = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.32, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
    const sh = document.createElement('canvas'); sh.width = sh.height = 128;
    const sx = sh.getContext('2d'), rg = sx.createRadialGradient(64, 64, 4, 64, 64, 64);
    rg.addColorStop(0, 'rgba(0,0,0,0.85)'); rg.addColorStop(0.6, 'rgba(0,0,0,0.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = rg; sx.fillRect(0, 0, 128, 128);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.position.y = 0.01; sc.add(this.blob);
    // a key light from the front-left, a cool rim from behind
    const key = this.key = new THREE.DirectionalLight(0xfff4e6, 2.6); key.position.set(-6, 9, 7);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 40 });
    sc.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xbcd2ff, 1.4); rim.position.set(5, 4, -8); sc.add(rim);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.35));
    this.cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 400);
    this.stand = new THREE.Group(); sc.add(this.stand);
  }

  colorFor(s) {
    const own = this.g.save.cars.find(c => c.id === s.id);
    if (own?.tune?.color !== undefined) return own.tune.color;
    if (typeof s.color === 'number') return s.color;
    return SHOW_COLORS[CATALOG.indexOf(s) % SHOW_COLORS.length];
  }
  // put a vehicle on the stand and frame it
  pose(id, yaw = 0.72, pitch = 0.16, zoom = 1) {
    const s = byId[id];
    if (this.posedId !== id) {
      this.stand.clear();
      const own = this.g.save.cars.find(c => c.id === id);
      const { g } = buildModel(s, this.colorFor(s), own?.tune || null);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.stand.add(g);
      const box = new THREE.Box3().setFromObject(g);
      g.position.y -= box.min.y;
      this.size = box.getSize(new THREE.Vector3());
      this.center = new THREE.Vector3(0, this.size.y * 0.42, (box.min.z + box.max.z) / 2);
      this.blob.scale.set(this.size.x * 1.5, this.size.z * 1.25, 1);
      this.posedId = id;
    }
    const sz = this.size, R = Math.max(sz.x, sz.z, sz.y * 1.6);
    const d = (R * 0.5) / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * zoom;
    this.scene.fog.near = d * 1.1; this.scene.fog.far = d * 3.2;
    const cp = Math.cos(pitch);
    this.cam.position.set(Math.sin(yaw) * cp * d, this.center.y + Math.sin(pitch) * d, Math.cos(yaw) * cp * d);
    this.cam.lookAt(this.center);
  }
  // draw the studio into the game canvas; keeps and restores the renderer's own settings
  draw(w, h, x = 0, y = 0) {
    const r = this.g.renderer, exp = r.toneMappingExposure, size = r.getSize(new THREE.Vector2());
    r.setRenderTarget(null);
    r.toneMappingExposure = 1.05;
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    r.setScissorTest(true); r.setViewport(x, y, w, h); r.setScissor(x, y, w, h);
    r.render(this.scene, this.cam);
    r.setScissorTest(false); r.setViewport(0, 0, size.x, size.y);
    r.toneMappingExposure = exp;
  }

  // called by the game after every rendered frame
  afterRender() {
    if (this.viewer) return;
    if (!this.open || !this.queue.length) return;
    const r = this.g.renderer, canvas = r.domElement, pr = r.getPixelRatio();
    // thumbnail size in CSS pixels that fits the canvas
    const tw = Math.min(480, Math.floor(canvas.width / pr)), th = Math.round(tw * 0.5625);
    for (let n = 0; n < 2 && this.queue.length; n++) {
      const id = this.queue.shift();
      this.pose(id);
      this.draw(tw, th);
      const out = document.createElement('canvas'); out.width = Math.round(tw * pr); out.height = Math.round(th * pr);
      // the viewport's bottom-left corner is the canvas's bottom-left
      out.getContext('2d').drawImage(canvas, 0, canvas.height - out.height, out.width, out.height, 0, 0, out.width, out.height);
      const url = out.toDataURL('image/jpeg', 0.86);
      this.thumbs.set(this.thumbKey(id), url);
      for (const img of this.el.querySelectorAll(`img[data-id="${id}"]`)) { img.src = url; img.classList.add('ok'); }
    }
  }
  thumbKey(id) { const c = this.g.save.cars.find(c => c.id === id); return id + ':' + (c?.tune?.color ?? '') + ':' + (c?.tune?.rim ?? '') + ':' + (c?.tune?.spoiler ?? ''); }

  // ------------------------------------------------------------------ UI
  buildUI() {
    const el = this.el = document.createElement('div');
    el.id = 'dealer'; el.hidden = true;
    el.innerHTML = `
      <header class="dl-top">
        <div class="dl-brand"><span>LAFAYETTE</span> AUTO MALL</div>
        <div class="dl-seg"><button data-tab="garage">My garage</button><button data-tab="shop">Dealership</button></div>
        <div class="dl-cash"></div>
        <button class="dl-x" aria-label="Close">✕</button>
      </header>
      <nav class="dl-chips"></nav>
      <div class="dl-grid"></div>`;
    document.body.appendChild(el);
    el.querySelector('.dl-x').onclick = () => this.hide();
    for (const b of el.querySelectorAll('[data-tab]')) b.onclick = () => { this.tab = b.dataset.tab; this.render(); };
    const v = this.vel = document.createElement('div');
    v.id = 'viewer3d'; v.hidden = true;
    v.innerHTML = `
      <div class="v3-top"><div><div class="v3-cat"></div><h2 class="v3-name"></h2></div><button class="dl-x" aria-label="Close">✕</button></div>
      <div class="v3-side"><div class="v3-stats"></div><div class="v3-act"></div></div>
      <div class="v3-hint">Drag to spin · scroll or pinch to zoom</div>`;
    document.body.appendChild(v);
    v.querySelector('.dl-x').onclick = () => this.closeViewer();
    // spin / zoom
    let drag = null, pinch = null;
    v.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; drag = { x: e.clientX, y: e.clientY }; this.viewer && (this.viewer.idle = 0); });
    addEventListener('pointermove', (e) => {
      if (!drag || !this.viewer) return;
      this.viewer.yaw -= (e.clientX - drag.x) * 0.008; this.viewer.pitch = THREE.MathUtils.clamp(this.viewer.pitch + (e.clientY - drag.y) * 0.005, 0.02, 1.2);
      drag = { x: e.clientX, y: e.clientY }; this.viewer.idle = 0;
    });
    addEventListener('pointerup', () => { drag = null; });
    v.addEventListener('wheel', (e) => { if (this.viewer) this.viewer.zoom = THREE.MathUtils.clamp(this.viewer.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.55, 2.2); }, { passive: true });
    v.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2 || !this.viewer) { pinch = null; return; }
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch) this.viewer.zoom = THREE.MathUtils.clamp(this.viewer.zoom * pinch / d, 0.55, 2.2);
      pinch = d; drag = null;
    }, { passive: true });
    v.addEventListener('touchend', () => { pinch = null; });
  }

  show(tab) {
    const g = this.g;
    if (tab) this.tab = tab;
    this.open = true; this.el.hidden = false;
    document.exitPointerLock?.(); document.body.classList.add('shopping');
    g.paused = true;
    this.render();
  }
  hide() {
    this.closeViewer();
    this.open = false; this.el.hidden = true; document.body.classList.remove('shopping');
    this.g.paused = this.g.hud.menuOpen || this.g.hud.mapOpen || this.g.hud.phoneOpen;
  }

  list() {
    const g = this.g;
    if (this.tab === 'garage') return g.save.cars.map(c => byId[c.id]).filter(Boolean);
    return CATALOG.filter(s => s.price);
  }
  render() {
    const g = this.g, el = this.el;
    for (const b of el.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
    el.querySelector('[data-tab="garage"]').textContent = `My garage · ${g.save.cars.length}`;
    el.querySelector('.dl-cash').textContent = money(g.money);
    const chips = el.querySelector('.dl-chips'); chips.innerHTML = '';
    const all = this.list();
    for (const c of CATS) {
      const n = c === 'All' ? all.length : all.filter(s => catOf(s) === c).length;
      if (!n && c !== 'All') continue;
      const b = document.createElement('button'); b.textContent = `${c} ${n}`; b.className = c === this.cat ? 'on' : '';
      b.onclick = () => { this.cat = c; this.render(); }; chips.appendChild(b);
    }
    if (!all.some(s => this.cat === 'All' || catOf(s) === this.cat)) this.cat = 'All';
    const grid = el.querySelector('.dl-grid'); grid.innerHTML = '';
    this.queue = [];
    const items = all.filter(s => this.cat === 'All' || catOf(s) === this.cat).sort((a, b) => this.tab === 'shop' ? a.price - b.price : 0);
    if (!items.length) grid.innerHTML = `<p class="dl-empty">Nothing here yet. Buy something at the dealership.</p>`;
    for (const s of items) grid.appendChild(this.card(s));
  }
  stats(s) {
    if (s.type === 'plane' || s.type === 'heli') return [['Top speed', mph(s) + ' mph', s.max / 240]];
    return [['Top speed', mph(s) + ' mph', s.max / 97], ['Acceleration', (s.accel || 0).toFixed(1), (s.accel || 0) / 18], ['Handling', (s.grip || 0).toFixed(1), (s.grip || 0) / 11]];
  }
  card(s) {
    const g = this.g, own = g.owns(s.id), home = g.save.myCar?.id === s.id;
    const c = document.createElement('article'); c.className = 'vcard' + (own ? ' owned' : '') + (home ? ' home' : '');
    const key = this.thumbKey(s.id), url = this.thumbs.get(key);
    if (!url) this.queue.push(s.id);
    const bars = this.stats(s).map(([n, v, k]) => `<div class="vbar"><span>${n}</span><i><b style="width:${Math.round(Math.min(1, k) * 100)}%"></b></i><em>${v}</em></div>`).join('');
    const type = { car: s.style === 'box' || s.style === 'bus' ? 'Utility' : (s.style || 'car').replace(/^\w/, ch => ch.toUpperCase()), bike: 'Motorcycle', plane: 'Aircraft', heli: 'Helicopter', boat: 'Boat' }[s.type] || s.cat;
    c.innerHTML = `
      <div class="vshot"><img data-id="${s.id}" alt="${s.name}" ${url ? `src="${url}" class="ok"` : ''}/>${own ? `<span class="vtag">${home ? '★ HOME CAR' : 'OWNED'}</span>` : ''}
        <button class="v3d" title="View the 3D model">⟳ 3D</button></div>
      <div class="vbody">
        <div class="vname">${s.name}</div><div class="vsub">${type}${s.offroad ? ' · off-road' : ''}</div>
        <div class="vbars">${bars}</div>
        <div class="vfoot"><span class="vprice">${own ? 'Yours' : s.price ? money(s.price) : 'Job only'}</span><span class="vbtns"></span></div>
      </div>`;
    c.querySelector('.v3d').onclick = () => this.openViewer(s.id);
    c.querySelector('.vshot img').onclick = () => this.openViewer(s.id);
    const btns = c.querySelector('.vbtns');
    for (const [label, cls, fn] of this.actions(s)) { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = fn; btns.appendChild(b); }
    return c;
  }
  actions(s) {
    const g = this.g, own = g.owns(s.id), out = [];
    if (own) {
      out.push(['Drive it', 'go', () => { this.hide(); g.callVehicle(s.id); }]);
      if (s.type === 'car' && g.save.myCar?.id !== s.id) out.push(['★ Home car', 'ghost', () => {
        const c = g.save.cars.find(c => c.id === s.id); g.save.myCar = { id: s.id, tune: c.tune }; g.persist(); g.home.spawnCar();
        g.hud.toast(`${s.name} now waits in your driveway`, 'good'); this.render(); this.viewer && this.openViewer(s.id);
      }]);
    } else if (s.price) {
      const short = g.money < s.price;
      out.push([short ? `Need ${money(s.price - g.money)} more` : 'Buy', short ? 'ghost dis' : 'go', () => {
        if (!g.buyVehicle(s.id)) return;
        this.thumbs.delete(this.thumbKey(s.id)); this.render(); if (this.viewer) this.openViewer(s.id);
      }]);
    }
    return out;
  }

  // ------------------------------------------------------------------ 3D viewer
  openViewer(id) {
    const s = byId[id], v = this.vel;
    this.viewer = { id, yaw: this.viewer?.id === id ? this.viewer.yaw : 0.72, pitch: 0.2, zoom: 1, idle: 3 };
    this.posedId = null;
    v.hidden = false; this.el.classList.add('behind');
    v.querySelector('.v3-name').textContent = s.name;
    v.querySelector('.v3-cat').textContent = `${s.cat} · ${s.price ? (this.g.owns(id) ? 'in your garage' : money(s.price)) : 'job vehicle'}`;
    v.querySelector('.v3-stats').innerHTML = this.stats(s).map(([n, val, k]) => `<div class="vbar"><span>${n}</span><i><b style="width:${Math.round(Math.min(1, k) * 100)}%"></b></i><em>${val}</em></div>`).join('')
      + `<div class="v3-spec"><span>Length <b>${s.L.toFixed(1)} m</b></span><span>Weight <b>${s.mass.toLocaleString()} kg</b></span></div>`;
    const act = v.querySelector('.v3-act'); act.innerHTML = '';
    for (const [label, cls, fn] of this.actions(s)) { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = fn; act.appendChild(b); }
  }
  closeViewer() { if (!this.viewer) return; this.viewer = null; this.posedId = null; this.vel.hidden = true; this.el.classList.remove('behind'); }
  // the game calls this instead of drawing the city while the viewer is open
  renderViewer(dt) {
    const V = this.viewer;
    V.idle += dt; if (V.idle > 2) V.yaw += dt * 0.35;
    this.pose(V.id, V.yaw, V.pitch, V.zoom * (innerHeight < 450 ? 1.7 : 1.4));
    const r = this.g.renderer, sz = r.getSize(new THREE.Vector2());
    this.draw(sz.x, sz.y);
  }
}
