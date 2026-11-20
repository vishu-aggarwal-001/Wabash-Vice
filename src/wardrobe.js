// Wardrobe: build your character piece by piece. Wabash Threads sells tops, trousers, shoes,
// gloves, hats and glasses; Levee Barbers does faces & haircuts, skin tone and gender. Change
// into anything you own from the phone. Looks are composited from Rocketbox avatars (outfit.js).
import * as THREE from 'three';
import { textTexture } from './textures.js';

import { DEFAULT_LOOK, DEFAULT_LOOK_F, GLOVES, SKIN, HATS, GLASSES, normalizeLook, thumb } from './outfit.js';
export { DEFAULT_LOOK };

const PRICE_TOP = { civ: 140, biz: 480, worker: 110 };
const SHOPS = [
  { id: 'threads', name: 'Wabash Threads', sub: 'Clothes · shoes · gloves · hats · glasses', at: [40.4196, -86.8907], slots: ['top', 'legs', 'feet', 'gloves', 'hat', 'glasses'], color: 0x8b5cf6 },
  { id: 'threads2', name: 'Wabash Threads', sub: 'Clothes · shoes · gloves · hats · glasses', at: [40.4234, -86.9085], slots: ['top', 'legs', 'feet', 'gloves', 'hat', 'glasses'], color: 0x8b5cf6 },
  { id: 'barber', name: 'Levee Barbers', sub: 'Face & hair · skin tone', at: [40.4185, -86.8936], slots: ['head', 'skin', 'gender'], color: 0x14b8a6 },
];
const SLOT_NAMES = { head: 'Face & hair', top: 'Tops', legs: 'Trousers', feet: 'Shoes', gloves: 'Gloves', skin: 'Skin tone', hat: 'Hats', glasses: 'Glasses', gender: 'Man / woman' };
const ALL_SLOTS = ['top', 'legs', 'feet', 'gloves', 'hat', 'glasses', 'head', 'skin', 'gender'];

// every item for the current gender: { slot, id, name, price, img, key }
export function catalogue(people, g) {
  const out = [], donors = (people.index || []).filter(m => m.g === g && ['civ', 'biz', 'worker'].includes(m.role));
  donors.forEach((m, n) => {
    if (!m.nohead) out.push({ slot: 'head', id: m.id, name: `Face & hair ${n + 1}`, price: 60, img: 'face' });
    out.push({ slot: 'top', id: m.id, name: m.name, price: PRICE_TOP[m.role] || 140, img: 'top' });
    if (m.legs === 'pants') out.push({ slot: 'legs', id: m.id, name: `Trousers ${n + 1}`, price: m.role === 'biz' ? 160 : 85, img: 'legs' });
    out.push({ slot: 'feet', id: m.id, name: `Shoes ${n + 1}`, price: m.role === 'biz' ? 140 : 75, img: 'feet' });
  });
  out.push({ slot: 'gloves', id: null, name: 'Bare hands', price: 0 });
  for (const [id, [c, name]] of Object.entries(GLOVES)) out.push({ slot: 'gloves', id, name, price: 45, color: c });
  for (const [v, name] of SKIN) out.push({ slot: 'skin', id: v, name, price: v === 0 ? 0 : 30 });
  out.push({ slot: 'hat', id: null, name: 'No hat', price: 0 });
  for (const [id, [, c, name]] of Object.entries(HATS)) out.push({ slot: 'hat', id, name, price: id === 'ushanka' ? 90 : 40, color: c });
  out.push({ slot: 'glasses', id: null, name: 'No glasses', price: 0 });
  for (const [id, [f, , , name]] of Object.entries(GLASSES)) out.push({ slot: 'glasses', id, name, price: 70, color: f });
  out.push({ slot: 'gender', id: 'm', name: 'Man', price: 0 }, { slot: 'gender', id: 'f', name: 'Woman', price: 0 });
  for (const it of out) it.key = it.slot + ':' + it.id;
  return out;
}
const LOOK_SLOT = { head: 'head', top: 'base', legs: 'legs', feet: 'feet', gloves: 'gloves', skin: 'skin', hat: 'hat', glasses: 'glasses', gender: 'g' };
const startOwned = (L) => ['head:' + L.head, 'top:' + L.base, 'legs:null', 'feet:null', 'gloves:null', 'skin:0', 'hat:null', 'glasses:null', 'gender:m', 'gender:f'];

export class Wardrobe {
  constructor(g) {
    this.g = g;
    g.save.look = normalizeLook(g.save.look);
    if (!g.save.owned2) { g.save.owned2 = startOwned(g.save.look); }
    g.save.owned2 = [...new Set([...g.save.owned2, ...startOwned(g.save.look)])];
    this.open = false; this.shop = null; this.slot = 'top';
    this.buildUI();
    this.markers = [];
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    for (const S of SHOPS) {
      const [x0, z0] = g.world.toWorld(...S.at);
      const n = g.world.nearestNode(x0, z0, 300), p = n >= 0 ? g.world.gNodes[n] : [x0, 0, z0];
      // stand on the sidewalk next to the road
      const nb = g.world.gAdj[n]?.[0], q = nb !== undefined ? g.world.gNodes[nb] : [p[0] + 1, 0, p[2]];
      const dx = q[0] - p[0], dz = q[2] - p[2], l = Math.hypot(dx, dz) || 1;
      const r = g.world.collide(p[0] + dz / l * 9, p[2] - dx / l * 9, 0.6, p[1] + 0.3, p[1] + 2);
      const y = g.world.groundAt(r.x, r.z).y;
      const grp = new THREE.Group(); grp.position.set(r.x, y, r.z);
      const mat = new THREE.MeshBasicMaterial({ color: S.color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
      const beam = new THREE.Mesh(beamGeo, mat); beam.scale.set(1.4, 6, 1.4); beam.position.y = 3; grp.add(beam);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture((S.id === 'barber' ? '✂ ' : '👕 ') + S.name, { size: 46, bg: 'rgba(0,0,0,0.6)' }), depthTest: true, fog: false }));
      label.scale.set(9, 2.25, 1); label.position.y = 6.8; grp.add(label);
      g.scene.add(grp);
      this.markers.push({ ...S, x: r.x, z: r.z, y, grp });
      g.blips.push({ get: () => ({ x: r.x, z: r.z }), color: S.id === 'barber' ? '#14b8a6' : '#8b5cf6', size: 5 });
    }
  }

  get owned() { return new Set(this.g.save.owned2); }
  equip(item) {
    const g = this.g;
    let look = g.save.look;
    if (item.slot === 'gender') {
      if (look.g === item.id) return;
      look = g.save.look = { ...(item.id === 'f' ? DEFAULT_LOOK_F : DEFAULT_LOOK), skin: look.skin, hat: look.hat, glasses: look.glasses, gloves: look.gloves };
      g.save.owned2 = [...new Set([...g.save.owned2, ...startOwned(look)])];
    } else {
      look[LOOK_SLOT[item.slot]] = item.id;
      // a top that isn't trousers-friendly keeps its own legs
      if (item.slot === 'top' && g.people.meta[item.id]?.legs !== 'pants') look.legs = null;
    }
    g.people.look = look;
    g.player.applyLook(g.people, look);
    g.persist();
  }

  update(dt) {
    const g = this.g;
    if (this.open) return;
    for (const m of this.markers) {
      m.grp.children[0].material.opacity = 0.25 + Math.sin(performance.now() / 300) * 0.1;
      if (!g.vehicle && Math.hypot(g.player.pos.x - m.x, g.player.pos.z - m.z) < 2.5) {
        g.hud.prompt(`Press J to enter ${m.name} — ${m.sub}`);
        if (g.lastPressed?.has('mission')) this.show(m);
      }
    }
  }

  // ---------------------------------------------------------------- UI
  buildUI() {
    const el = this.el = document.createElement('div');
    el.id = 'wardrobe'; el.hidden = true;
    el.innerHTML = `<div class="wpanel"><div class="whead"><b id="wtitle"></b><span id="wsub"></span></div>
      <div class="wtabs" id="wtabs"></div><div class="wlist" id="wlist"></div>
      <div class="wfoot"><button id="wleft">⟲</button><button id="wright">⟳</button><span id="wmoney"></span><button id="wclose">Done (Esc)</button></div></div>`;
    document.body.appendChild(el);
    el.querySelector('#wclose').onclick = () => this.hide();
    el.querySelector('#wleft').onclick = () => { this.g.player.yaw += 0.6; };
    el.querySelector('#wright').onclick = () => { this.g.player.yaw -= 0.6; };
    const css = document.createElement('style');
    css.textContent = `
#wardrobe { position: fixed; inset: 0; z-index: 11; pointer-events: none; }
#wardrobe .wpanel { pointer-events: auto; position: absolute; left: 24px; top: 50%; transform: translateY(-50%); width: min(380px, 90vw); max-height: 86vh; display: flex; flex-direction: column; background: rgba(12,14,18,.9); border: 1px solid #333; border-radius: 12px; overflow: hidden; }
#wardrobe .whead { padding: 14px 16px 8px; } #wardrobe .whead b { display: block; font-size: 22px; font-style: italic; } #wardrobe .whead span { color: #aaa; font-size: 13px; }
#wardrobe .wtabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 12px 8px; }
#wardrobe .wtabs button, #wardrobe .wfoot button { background: #23262c; color: #fff; border: 1px solid #3a3f47; border-radius: 6px; padding: 6px 10px; cursor: pointer; font: inherit; font-size: 13px; }
#wardrobe .wtabs button.on { background: #cfb991; color: #000; font-weight: 700; }
#wardrobe .wlist { overflow: auto; padding: 0 12px 10px; flex: 1; }
#wardrobe .witem { display: flex; justify-content: space-between; align-items: center; width: 100%; text-align: left; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); color: #fff; padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; cursor: pointer; font: inherit; }
#wardrobe .witem:hover { background: rgba(207,185,145,.2); } #wardrobe .witem.eq { border-color: #7ddc6a; background: rgba(125,220,106,.12); }
#wardrobe .witem small { color: #9fe38a; font-weight: 700; } #wardrobe .witem small.buy { color: #ffd23f; } #wardrobe .witem small.lock { color: #888; font-weight: 400; }
#wardrobe .wgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; align-content: start; }
#wardrobe .wtile { flex-direction: column; justify-content: flex-start; gap: 4px; margin: 0; padding: 6px; text-align: center; font-size: 12px; }
#wardrobe .wtile img { width: 72px; height: 72px; border-radius: 6px; object-fit: cover; }
#wardrobe .wtile i { width: 40px; height: 40px; border-radius: 50%; border: 2px solid #fff3; margin: 8px 0; }
#wardrobe .wfoot { display: flex; gap: 6px; align-items: center; padding: 10px 12px; border-top: 1px solid #333; } #wardrobe #wmoney { flex: 1; text-align: center; color: #7ee36a; font-weight: 800; }`;
    document.head.appendChild(css);
  }
  show(shop = null) {
    const g = this.g;
    if (g.jobs.active) { g.hud.toast('Finish your shift first — you are in uniform', 'warn'); return; }
    this.shop = shop; this.open = true; this.el.hidden = false;
    for (const m of this.markers) m.grp.visible = false;
    g.hud.bigT = 0; g.hud.promptT = 0; for (const id of ['big', 'prompt', 'toast']) document.getElementById(id)?.classList.remove('show');
    this.slots = shop ? shop.slots : ALL_SLOTS;
    if (!this.slots.includes(this.slot)) this.slot = this.slots[0];
    this.el.querySelector('#wtitle').textContent = shop ? shop.name : 'Wardrobe';
    this.el.querySelector('#wsub').textContent = shop ? 'Click to buy and wear · things you own are free to change' : 'Change into anything you own · buy more at Wabash Threads and Levee Barbers (purple and teal markers on the map)';
    this.prevYaw = g.player.yaw;
    g.player.yaw = g.camYaw + Math.PI;
    document.exitPointerLock?.(); document.body.classList.add('shopping');
    g.paused = true;
    this.render();
  }
  hide() {
    this.open = false; this.el.hidden = true; document.body.classList.remove('shopping');
    for (const m of this.markers) m.grp.visible = true;
    this.g.paused = this.g.hud.menuOpen || this.g.hud.mapOpen || this.g.hud.phoneOpen;
  }
  render() {
    const g = this.g, owned = this.owned, look = g.save.look;
    const items = catalogue(g.people, look.g);
    const tabs = this.el.querySelector('#wtabs'); tabs.innerHTML = '';
    for (const s of this.slots) { const b = document.createElement('button'); b.textContent = SLOT_NAMES[s]; b.className = s === this.slot ? 'on' : ''; b.onclick = () => { this.slot = s; this.render(); }; tabs.appendChild(b); }
    const list = this.el.querySelector('#wlist'); list.innerHTML = ''; list.className = 'wlist wgrid';
    const cur = (it) => { const v = look[LOOK_SLOT[it.slot]]; return (v ?? null) === it.id || (it.slot === 'skin' && (v || 0) === it.id); };
    for (const it of items.filter(i => i.slot === this.slot)) {
      const has = owned.has(it.key) || it.price === 0, eq = cur(it);
      const blocked = it.slot === 'legs' && g.people.meta[look.base]?.legs !== 'pants';
      const b = document.createElement('button'); b.className = 'witem wtile' + (eq ? ' eq' : '');
      const pic = it.img ? thumb(g.people, it.id, it.img) : null;
      const sw = pic ? `<img src="${pic}" alt="">` : it.color !== undefined ? `<i style="background:#${it.color.toString(16).padStart(6, '0')}"></i>` : '';
      const tag = eq ? '<small>WEARING</small>' : has ? '<small>OWNED</small>' : this.shop ? `<small class="buy">$${it.price}</small>` : '<small class="lock">in store</small>';
      b.innerHTML = `${sw}<span>${it.name}</span>${tag}`;
      if (blocked) b.style.opacity = 0.45;
      b.onclick = () => {
        if (blocked) { g.hud.toast('This top comes with its own skirt or shorts — pick a top with trousers first', 'warn'); return; }
        if (!has) {
          if (!this.shop) { g.hud.toast(`Buy this at ${['head', 'skin', 'gender'].includes(it.slot) ? 'Levee Barbers' : 'Wabash Threads'}`, 'warn'); return; }
          if (g.money < it.price) { g.hud.toast('Not enough money', 'warn'); return; }
          g.addMoney(-it.price); g.save.owned2.push(it.key); g.audio.chime(true);
          g.hud.toast(`Bought: ${it.name}  −$${it.price}`, 'good');
        }
        this.equip(it); setTimeout(() => this.render(), 30);
      };
      list.appendChild(b);
    }
    if (!this.fetched && items.some(i => i.img && !thumb(g.people, i.id, i.img))) { this.fetched = true; g.people.loadRest().then(() => { if (this.open) this.render(); }); }
    this.el.querySelector('#wmoney').textContent = '$' + g.money.toLocaleString();
  }
}
