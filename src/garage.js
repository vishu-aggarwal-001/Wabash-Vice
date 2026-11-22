// Dee's Tune Shop: drive any car in, buy paint, window tint, rims (gold included),
// spoilers, ride height and ECU chip stages, repair it, and keep it as your own car.
// Your car (model + every mod) is saved and can be called up from the phone.
import * as THREE from 'three';
import { textTexture } from './textures.js';
import { byId } from './vehicles.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
export const PAINTS = [
  ['Midnight black', 0x0b0c0e], ['Arctic white', 0xeeeeea], ['Silver', 0xa9adb3], ['Gunmetal', 0x3d4249],
  ['Boilermaker gold', 0xcfb991], ['Cherry red', 0xb0121b], ['Wine', 0x5a0f1c], ['Sunset orange', 0xe2580f],
  ['Taxi yellow', 0xf2c014], ['Lime', 0x7ccf1d], ['Racing green', 0x123d26], ['Teal', 0x0f7c80],
  ['Wabash blue', 0x1e5aa8], ['Navy', 0x101c38], ['Royal purple', 0x4b1e78], ['Hot pink', 0xd6337a],
];
const OPTIONS = {
  paint: PAINTS.map(([name, c]) => ({ name, price: 250, set: { color: c }, swatch: c })),
  tint: [['Clear', 0, 100], ['Factory', 1, 0], ['Dark', 2, 200], ['Limo black', 3, 350]].map(([name, v, price]) => ({ name, price, set: { tint: v } })),
  rims: [['Five-spoke', 5, 0], ['Six-spoke', 6, 300], ['Eight-spoke', 8, 350], ['Mesh', 12, 450], ['Three-blade', 3, 400]].map(([name, v, price]) => ({ name, price, set: { spokes: v } })),
  rimcolor: [['Chrome', 'chrome', 0], ['Gloss black', 'black', 250], ['White', 'white', 250], ['Bronze', 'bronze', 450], ['24k Gold', 'gold', 1500]].map(([name, v, price]) => ({ name, price, set: { rim: v } })),
  spoiler: [['None', 0, 0], ['Lip', 1, 300], ['Sport wing', 2, 650], ['GT wing', 3, 1200]].map(([name, v, price]) => ({ name, price, set: { spoiler: v } })),
  height: [['Lifted', 2, 250], ['Stock', 0, 0], ['Lowered', -1, 300], ['Slammed', -2, 550]].map(([name, v, price]) => ({ name, price, set: { height: v } })),
  ecu: [['Stock map', 0, 0, 1], ['Stage 1 chip', 1, 1500, 2], ['Stage 2 chip', 2, 3500, 4], ['Stage 3 chip', 3, 7000, 7]].map(([name, v, price, lvl]) => ({ name, price, lvl, set: { ecu: v } })),
};
const TABS = [['paint', 'Paint'], ['tint', 'Tint'], ['rims', 'Rims'], ['rimcolor', 'Rim colour'], ['spoiler', 'Spoiler'], ['height', 'Suspension'], ['ecu', 'ECU chip'], ['service', 'Service']];
const DEFAULTS = { tint: 1, spokes: 5, rim: 'chrome', spoiler: 0, height: 0, ecu: 0 };
const SHOP = { name: "Dee's Tune Shop", at: [40.4199, -86.8899], color: 0xff8a1a };

export class Garage {
  constructor(g) {
    this.g = g; this.open = false; this.tab = 'paint'; this.orbit = 0;
    this.buildUI();
    const [x0, z0] = g.world.toWorld(...SHOP.at);
    const n = g.world.nearestNode(x0, z0, 300), p = n >= 0 ? g.world.gNodes[n] : [x0, 0, z0];
    const y = g.world.groundAt(p[0], p[2]).y;
    const grp = new THREE.Group(); grp.position.set(p[0], y, p[2]);
    const mat = new THREE.MeshBasicMaterial({ color: SHOP.color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 1.2, 40, 1, true), mat); ring.position.y = 0.6; grp.add(ring);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('🔧 ' + SHOP.name, { size: 46, bg: 'rgba(0,0,0,0.6)' }), fog: false }));
    label.scale.set(10, 2.5, 1); label.position.y = 4.5; grp.add(label);
    g.scene.add(grp);
    this.marker = { x: p[0], z: p[2], y, grp };
    g.blips.push({ get: () => ({ x: p[0], z: p[2] }), color: '#ff8a1a', size: 5 });
  }

  get myCar() { return this.g.save.myCar || null; }
  canTune(v) { return v && v.type === 'car' && !v.spec.extra && v.spec.style !== 'bus' && v.spec.style !== 'box'; }

  update() {
    const g = this.g, m = this.marker;
    if (this.open) return;
    m.grp.children[0].material.opacity = 0.22 + Math.sin(performance.now() / 300) * 0.08;
    const v = g.vehicle;
    if (Math.hypot(g.focus.x - m.x, g.focus.z - m.z) > 6) return;
    if (!v) { g.hud.prompt(`${SHOP.name} — drive a car in to tune it`); return; }
    if (!this.canTune(v)) { g.hud.prompt('Dee only works on regular cars'); return; }
    if (g.police?.wanted > 0) { g.hud.prompt('Lose the cops first'); return; }
    g.hud.prompt(`Press J to tune your ${v.spec.name}`);
    if (g.lastPressed?.has('mission') && v.speed < 3) this.show(v);
  }

  // ---------------------------------------------------------------- UI
  buildUI() {
    const el = this.el = document.createElement('div');
    el.id = 'garage'; el.className = 'shopui'; el.hidden = true;
    el.innerHTML = `<div class="wpanel"><div class="whead"><b>${SHOP.name}</b><span id="gsub"></span></div>
      <div class="wtabs" id="gtabs"></div><div class="wlist" id="glist"></div>
      <div class="wfoot"><button id="gleft">⟲</button><button id="gright">⟳</button><span id="gmoney"></span><button id="gclose">Drive out (Esc)</button></div></div>`;
    document.body.appendChild(el);
    el.querySelector('#gclose').onclick = () => this.hide();
    el.querySelector('#gleft').onclick = () => { this.orbit += 0.7; };
    el.querySelector('#gright').onclick = () => { this.orbit -= 0.7; };
    const css = document.createElement('style');
    css.textContent = `
.shopui { position: fixed; inset: 0; z-index: 11; pointer-events: none; }
.shopui .wpanel { pointer-events: auto; position: absolute; left: 24px; top: 50%; transform: translateY(-50%); width: min(380px, 90vw); max-height: 86vh; display: flex; flex-direction: column; background: rgba(12,14,18,.9); border: 1px solid #333; border-radius: 12px; overflow: hidden; }
.shopui .whead { padding: 14px 16px 8px; } .shopui .whead b { display: block; font-size: 22px; font-style: italic; color: #ff9a3a; } .shopui .whead span { display: block; } .shopui .whead span { color: #aaa; font-size: 13px; }
.shopui .wtabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 8px; }
.shopui .wtabs button, .shopui .wfoot button { background: #23262c; color: #fff; border: 1px solid #3a3f47; border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; font-size: 13px; }
.shopui .wtabs button.on { background: #ff8a1a; color: #000; font-weight: 700; }
.shopui .wlist { overflow: auto; padding: 0 12px 10px; flex: 1; }
.shopui .witem { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); color: #fff; padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; cursor: pointer; font: inherit; }
.shopui .witem span { flex: 1; } .shopui .witem i { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff3; }
.shopui .witem:hover { background: rgba(255,138,26,.18); } .shopui .witem.eq { border-color: #7ddc6a; background: rgba(125,220,106,.12); }
.shopui .witem small { color: #ffd23f; font-weight: 700; } .shopui .witem.eq small { color: #9fe38a; } .shopui .witem small.lock { color: #888; font-weight: 400; }
.shopui .wfoot { display: flex; gap: 6px; align-items: center; padding: 10px 12px; border-top: 1px solid #333; } .shopui #gmoney { flex: 1; text-align: center; color: #7ee36a; font-weight: 800; }`;
    document.head.appendChild(css);
  }
  show(v) {
    const g = this.g;
    this.v = v; this.open = true; this.el.hidden = false; this.orbit = 0.6;
    v.vel.set(0, 0, 0); v.throttle = 0;
    this.marker.grp.visible = false;
    g.hud.bigT = 0; g.hud.promptT = 0; for (const id of ['big', 'prompt', 'toast']) document.getElementById(id)?.classList.remove('show');
    document.exitPointerLock?.(); document.body.classList.add('shopping');
    g.paused = true;
    this.render();
  }
  hide() {
    this.open = false; this.el.hidden = true; document.body.classList.remove('shopping'); this.marker.grp.visible = true;
    this.g.paused = this.g.hud.menuOpen || this.g.hud.mapOpen || this.g.hud.phoneOpen;
  }
  tuneOf(v) { return { ...DEFAULTS, ...(v.tune || {}), color: v.color }; }
  isMine(v) { const m = this.myCar; return !!(m && v.mine); }
  apply(set, price, name) {
    const g = this.g, v = this.v;
    if (price > 0) {
      if (g.money < price) { g.hud.toast('Not enough money', 'warn'); return; }
      g.addMoney(-price); g.audio.chime(true); g.hud.toast(`${name}  −$${price}`, 'good');
    }
    v.retune({ ...this.tuneOf(v), ...set });
    if (this.isMine(v)) this.saveMine(v);
    this.render();
  }
  saveMine(v) {
    v.mine = true;
    const tune = this.tuneOf(v), g = this.g;
    g.save.myCar = { id: v.spec.id, tune };
    const c = g.save.cars.find(c => c.id === v.spec.id);
    if (c) c.tune = tune; else g.save.cars.push({ id: v.spec.id, tune });
    g.persist();
  }
  render() {
    const g = this.g, v = this.v, t = this.tuneOf(v);
    this.el.querySelector('#gsub').textContent = `${v.spec.name}${this.isMine(v) ? ' · your car' : ''} · ${Math.round(v.hp)}% condition`;
    const tabs = this.el.querySelector('#gtabs'); tabs.innerHTML = '';
    for (const [id, name] of TABS) { const b = document.createElement('button'); b.textContent = name; b.className = id === this.tab ? 'on' : ''; b.onclick = () => { this.tab = id; this.render(); }; tabs.appendChild(b); }
    const list = this.el.querySelector('#glist'); list.innerHTML = '';
    const row = (html, cls, fn) => { const b = document.createElement('button'); b.className = 'witem' + (cls ? ' ' + cls : ''); b.innerHTML = html; b.onclick = fn; list.appendChild(b); return b; };
    if (this.tab === 'service') {
      const cost = Math.ceil((100 - v.hp) * 6);
      row(`<span>Repair body & engine</span><small>${cost ? '$' + cost : 'OK'}</small>`, cost ? '' : 'eq', () => {
        if (!cost) return;
        if (g.money < cost) { g.hud.toast('Not enough money', 'warn'); return; }
        g.addMoney(-cost); v.hp = 100; v.burn = 0; g.hud.toast(`Repaired  −$${cost}`, 'good'); this.render();
      });
      const mine = this.isMine(v), owned = g.owns(v.spec.id), price = v.spec.price;
      if (mine || owned) row(`<span>${mine ? 'Your car ★ (mods are saved)' : 'You own this model: save these mods to it'}</span><small>${mine ? 'SAVED' : 'SAVE'}</small>`, mine ? 'eq' : '', () => {
        if (mine) return;
        this.saveMine(v); g.audio.chime(true); g.hud.toast(`${v.spec.name} saved to your garage`, 'good'); this.render();
      });
      else if (price) row(`<span>Buy the papers for this ${v.spec.name}</span><small>$${price.toLocaleString()}</small>`, '', () => {
        if (!g.buyVehicle(v.spec.id)) return;
        this.saveMine(v); this.render();
      });
      else row(`<span>Work vehicle: can't be bought</span><small>—</small>`, 'eq', () => {});
      row(`<span>Nitro refill</span><small>${v.nitro >= 0.99 ? 'FULL' : '$60'}</small>`, v.nitro >= 0.99 ? 'eq' : '', () => {
        if (v.nitro >= 0.99) return;
        if (g.money < 60) { g.hud.toast('Not enough money', 'warn'); return; }
        g.addMoney(-60); v.nitro = 1; this.render();
      });
    } else {
      const key = Object.keys(OPTIONS[this.tab][0].set)[0];
      for (const o of OPTIONS[this.tab]) {
        const on = t[key] === o.set[key];
        const locked = o.lvl && g.prog.level < o.lvl;
        const tag = on ? 'FITTED' : locked ? `<small class="lock">level ${o.lvl}</small>` : o.price ? '$' + o.price.toLocaleString() : 'FREE';
        const sw = o.swatch !== undefined ? `<i style="background:${hex(o.swatch)}"></i>` : '';
        row(`${sw}<span>${o.name}</span>${tag.startsWith('<small') ? tag : `<small>${tag}</small>`}`, on ? 'eq' : '', () => {
          if (on) return;
          if (locked) { g.hud.toast(`Reach level ${o.lvl} to unlock ${o.name}`, 'warn'); return; }
          this.apply(o.set, o.price, o.name);
        });
      }
      if (this.tab === 'ecu') { const d = document.createElement('p'); d.style.cssText = 'color:#999;font-size:12px;margin:6px 2px'; d.textContent = 'Chip stages add acceleration and top speed. Lowered suspension adds grip.'; list.appendChild(d); }
    }
    this.el.querySelector('#gmoney').textContent = '$' + g.money.toLocaleString();
  }
}
