// Wardrobe: buy clothes, hats, glasses at Wabash Threads, haircuts and beards at the
// barber, and change into anything you own from the phone. Every item is a separate
// skinned mesh fitted to the player's body (tools/make_people/gen_wardrobe.py), bound to
// the player's own skeleton at runtime, so items mix and match freely.
import * as THREE from 'three';
import { textTexture } from './textures.js';

// slot, name, price; outfit = covers legs too
export const ITEMS = [
  // barber
  ['hair', null, 'Shaved head', 15], ['hair', 'hair_short01', 'Buzz cut', 20], ['hair', 'hair_short02', 'Side part', 30], ['hair', 'hair_short03', 'Short back & sides', 30],
  ['hair', 'hair_short04', 'Spiky crop', 35], ['hair', 'hair_afro', 'Afro', 55], ['hair', 'hair_long', 'Long hair', 50], ['hair', 'hair_ponytail', 'Ponytail', 45],
  ['beard', null, 'Clean shaven', 10], ['beard', 'beard_stubble', 'Full stubble', 25], ['beard', 'beard_moustache', 'Moustache', 20], ['beard', 'beard_goatee', 'Goatee', 30], ['beard', 'beard_viking', 'Viking beard', 45],
  // clothing store
  ['hat', null, 'No hat', 0], ['hat', 'hat_knit', 'Knit beanie', 35], ['hat', 'hat_slouchy', 'Slouchy beanie', 40], ['hat', 'hat_flatcap', 'Flat cap', 60], ['hat', 'hat_newsboy', 'White newsboy cap', 55],
  ['hat', 'hat_patrol', 'Camo patrol cap', 70], ['hat', 'hat_ushanka', 'Ushanka', 85], ['hat', 'hat_fishing', 'Fishing hat', 45], ['hat', 'hat_fedora', 'Fedora', 90], ['hat', 'hat_trilby', 'Trilby', 95], ['hat', 'hat_bowler', 'Bowler hat', 120],
  ['glasses', null, 'No glasses', 0], ['glasses', 'glasses_sun', 'Sunglasses', 80], ['glasses', 'glasses_black', 'Black frames', 60], ['glasses', 'glasses_silver', 'Silver frames', 60], ['glasses', 'glasses_rimless', 'Rimless', 70], ['glasses', 'glasses_round', 'Round tinted', 75],
  ['top', 'outfit_field', 'Field jacket & jeans', 250, true], ['top', 'outfit_leather', 'Black leather jacket & jeans', 450, true], ['top', 'outfit_denim', 'Denim shirt & jeans', 180, true],
  ['top', 'outfit_stripes', 'Striped shirt & jeans', 160, true], ['top', 'outfit_whitetee', 'White tee & jeans', 120, true], ['top', 'outfit_bluetee', 'Blue tee & jeans', 120, true],
  ['top', 'outfit_suit', 'Business suit', 650, true], ['top', 'outfit_overalls', 'Work overalls', 150, true],
  ['top', 'top_hoodie', 'Black hoodie', 90], ['top', 'top_tracksuit', 'Tracksuit top', 110], ['top', 'top_knit_cream', 'Cream knit sweater', 95], ['top', 'top_knit_red', 'Red knit sweater', 95],
  ['top', 'top_fisherman', 'Fisherman sweater', 85], ['top', 'top_polo', 'Polo shirt', 60], ['top', 'top_blackshirt', 'Black shirt', 70],
  ['legs', 'legs_cargo', 'Grey cargo pants', 70], ['legs', 'legs_denim', 'Blue cargo pants', 75], ['legs', 'legs_khaki', 'Khaki cargo pants', 75], ['legs', 'legs_tracksuit', 'Tracksuit pants', 80], ['legs', 'legs_wool', 'Wool trousers', 90],
  ['shoes', 'shoes_boots', 'Ankle boots', 110], ['shoes', 'shoes_red', 'Red high-tops', 95], ['shoes', 'shoes_slipons', 'Slip-ons', 60], ['shoes', 'shoes_workboots', 'Work boots', 120], ['shoes', 'shoes_oxford', 'Oxford shoes', 150],
].map(([slot, id, name, price, outfit]) => ({ slot, id, name, price, outfit: !!outfit, key: slot + ':' + (id || 'none') }));
export const byKey = Object.fromEntries(ITEMS.map(i => [i.key, i]));
export const DEFAULT_LOOK = { hair: 'hair_short02', beard: null, hat: null, glasses: null, top: 'outfit_field', legs: 'legs_cargo', shoes: 'shoes_boots' };
const DEFAULT_OWNED = ['hair:hair_short02', 'beard:none', 'hat:none', 'glasses:none', 'top:outfit_field', 'legs:legs_cargo', 'shoes:shoes_boots'];
const SHOPS = [
  { id: 'threads', name: 'Wabash Threads', sub: 'Clothes · hats · glasses', at: [40.4196, -86.8907], slots: ['top', 'legs', 'shoes', 'hat', 'glasses'], color: 0x8b5cf6 },
  { id: 'threads2', name: 'Wabash Threads (Chauncey)', sub: 'Clothes · hats · glasses', at: [40.4234, -86.9085], slots: ['top', 'legs', 'shoes', 'hat', 'glasses'], color: 0x8b5cf6 },
  { id: 'barber', name: "Levee Barbers", sub: 'Haircuts · beards', at: [40.4185, -86.8936], slots: ['hair', 'beard'], color: 0x14b8a6 },
];
const SLOT_NAMES = { top: 'Tops & outfits', legs: 'Pants', shoes: 'Shoes', hat: 'Hats', glasses: 'Glasses', hair: 'Haircut', beard: 'Beard' };

// a look -> which item ids to show (an outfit replaces the pants)
export function lookItems(look) {
  const top = byKey['top:' + look.top];
  return ['hair', 'beard', 'hat', 'glasses', 'top', 'legs', 'shoes'].map(s => (s === 'legs' && top?.outfit) ? null : look[s]).filter(Boolean);
}

export class Wardrobe {
  constructor(g) {
    this.g = g;
    g.save.look ||= { ...DEFAULT_LOOK };
    g.save.owned = [...new Set([...(g.save.owned || []), ...DEFAULT_OWNED])];
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

  get owned() { return new Set(this.g.save.owned); }
  equip(item) {
    const look = this.g.save.look;
    look[item.slot] = item.id;
    if (item.slot === 'top' && !item.outfit && !look.legs) look.legs = 'legs_cargo';
    this.g.player.applyLook(this.g.people, look);
    this.g.persist();
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
#wardrobe .wfoot { display: flex; gap: 6px; align-items: center; padding: 10px 12px; border-top: 1px solid #333; } #wardrobe #wmoney { flex: 1; text-align: center; color: #7ee36a; font-weight: 800; }`;
    document.head.appendChild(css);
  }
  show(shop = null) {
    const g = this.g;
    if (g.jobs.active) { g.hud.toast('Finish your shift first — you are in uniform', 'warn'); return; }
    this.shop = shop; this.open = true; this.el.hidden = false;
    for (const m of this.markers) m.grp.visible = false;
    g.hud.bigT = 0; g.hud.promptT = 0; for (const id of ['big', 'prompt', 'toast']) document.getElementById(id)?.classList.remove('show');
    this.slots = shop ? shop.slots : ['top', 'legs', 'shoes', 'hat', 'glasses', 'hair', 'beard'];
    if (!this.slots.includes(this.slot)) this.slot = this.slots[0];
    this.el.querySelector('#wtitle').textContent = shop ? shop.name : 'Wardrobe';
    this.el.querySelector('#wsub').textContent = shop ? 'Click to buy and wear · things you own are free to change' : 'Change into anything you own · buy more at Wabash Threads and Levee Barbers (purple and teal markers on the map)';
    this.prevYaw = g.player.yaw;
    g.player.yaw = g.camYaw + Math.PI;
    document.exitPointerLock?.();
    g.paused = true;
    this.render();
  }
  hide() {
    this.open = false; this.el.hidden = true;
    for (const m of this.markers) m.grp.visible = true;
    this.g.paused = this.g.hud.menuOpen || this.g.hud.mapOpen || this.g.hud.phoneOpen;
  }
  render() {
    const g = this.g, owned = this.owned, look = g.save.look;
    const tabs = this.el.querySelector('#wtabs'); tabs.innerHTML = '';
    for (const s of this.slots) { const b = document.createElement('button'); b.textContent = SLOT_NAMES[s]; b.className = s === this.slot ? 'on' : ''; b.onclick = () => { this.slot = s; this.render(); }; tabs.appendChild(b); }
    const list = this.el.querySelector('#wlist'); list.innerHTML = '';
    for (const it of ITEMS.filter(i => i.slot === this.slot)) {
      const has = owned.has(it.key) || it.price === 0, eq = (look[it.slot] || null) === it.id;
      const b = document.createElement('button'); b.className = 'witem' + (eq ? ' eq' : '');
      const tag = eq ? '<small>WEARING</small>' : has ? '<small>OWNED</small>' : this.shop ? `<small class="buy">$${it.price}</small>` : '<small class="lock">in store</small>';
      b.innerHTML = `<span>${it.name}</span>${tag}`;
      b.onclick = () => {
        if (!has) {
          if (!this.shop) { g.hud.toast(`Buy the ${it.name} at ${it.slot === 'hair' || it.slot === 'beard' ? 'Levee Barbers' : 'Wabash Threads'}`, 'warn'); return; }
          if (g.money < it.price) { g.hud.toast('Not enough money', 'warn'); return; }
          g.addMoney(-it.price); g.save.owned.push(it.key); g.audio.chime(true);
          g.hud.toast(`Bought: ${it.name}  −$${it.price}`, 'good');
        }
        this.equip(it); this.render();
      };
      list.appendChild(b);
    }
    this.el.querySelector('#wmoney').textContent = '$' + g.money.toLocaleString();
  }
}
