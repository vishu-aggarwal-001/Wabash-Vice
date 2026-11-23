// Cars are bought, not spawned.
//
//  · Lafayette Motors is a real place on the map (🚘 blip, fast travel, GPS from the garage).
//    Walk or drive into the ring and press J: a full showroom with every vehicle on a live,
//    draggable turntable, real stats, paint choice and prices. Buy one and you drive it off the lot.
//  · V is MY GARAGE: only the vehicles you own, each with a picture of the actual car,
//    in your colour. Click one to have it brought to you.
//  · Anything else you steal (F). A stolen car can be sold from the garage for a fraction of its price.
import * as THREE from 'three';
import { CATALOG, byId, topSpeed } from './vehicles.js';
import { textTexture } from './textures.js';
import { PAINTS } from './garage.js';
import { Studio } from './studio.js';

export const PRICES = {
  bicycle: 120, compact: 2500, dirtbike: 3000, hatch: 3500, sedan: 4500, wagon: 5000, taxi: 6000,
  classic: 7000, crossover: 8500, van: 9000, sportbike: 9500, suv: 11000, pickup: 12000, jeep: 14000,
  pony: 16000, muscle: 18000, hauler: 20000, rally: 24000, roadster: 26000, gt: 30000, truck: 22000,
  luxury: 38000, dragster: 45000, limo: 55000, gtr: 65000, supercar: 110000, hyper: 160000,
  bus: 35000, tanker: 42000, jetski: 6000, speedboat: 28000, pontoon: 15000,
  cessna: 80000, heli: 180000, jet: 600000,
};
const SELL_RATE = 0.25;   // what a stolen car fetches
const DEFAULT_CAR = 'gt';
const LOT = { name: 'Lafayette Motors', at: [40.4215, -86.8868], color: 0x3fa9ff };
// showroom paint for models that come in "any colour"
const SHOW_COLORS = { sedan: 0x1e5aa8, hatch: 0xb0121b, suv: 0x3d4249, pickup: 0x7a1414, wagon: 0x2e6b3a, classic: 0x9b6b2f, compact: 0x0f7c80, crossover: 0xeeeeea, hauler: 0x101c38, van: 0xeeeeea };
const CATS = ['Cars', 'Big rigs', 'Bikes', 'Aircraft', 'Boats'];
const CAT_ICON = { Cars: '🚗', 'Big rigs': '🚛', Bikes: '🏍️', Aircraft: '✈️', Boats: '🚤', Emergency: '🚨' };
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const money = (n) => '$' + Math.round(n).toLocaleString();
const mph = (s) => Math.round(topSpeed(s) * 2.237);

export class Dealer {
  constructor(g) {
    this.g = g;
    g.save.cars ||= [];
    g.save.carColors ||= {};
    // you own the car in your driveway (and anything you tuned at Dee's)
    for (const id of [DEFAULT_CAR, g.save.myCar?.id]) if (id && !g.save.cars.includes(id)) g.save.cars.push(id);
    this.open = false; this.cat = 'Cars'; this.sel = null; this.paint = null; this.armed = null;
    this.placeLot();
    this.buildUI();
  }
  get studio() { return this._studio ||= new Studio(); }
  owns(id) { return this.g.save.cars.includes(id); }
  price(id) { return PRICES[id]; }
  // the colour (and tune) a vehicle wears: yours if you own it, otherwise its showroom paint
  colorOf(id) {
    const g = this.g, s = byId[id];
    if (g.save.myCar?.id === id && g.save.myCar.tune?.color !== undefined) return g.save.myCar.tune.color;
    if (g.save.carColors[id] !== undefined) return g.save.carColors[id];
    return s.color === 'random' ? (SHOW_COLORS[id] ?? 0xa9adb3) : s.color;
  }
  tuneOf(id) { const m = this.g.save.myCar; return m?.id === id ? m.tune : null; }
  paintable(s) { return !s.extra && (s.type === 'car' || s.type === 'bike' || s.type === 'boat'); }

  // ---------------------------------------------------------------- the lot on the map
  placeLot() {
    const g = this.g, w = g.world;
    const [x0, z0] = w.toWorld(...LOT.at);
    const n = w.nearestNode(x0, z0, 300), p = n >= 0 ? w.gNodes[n] : [x0, 0, z0];
    const y = w.groundAt(p[0], p[2]).y;
    const grp = new THREE.Group(); grp.position.set(p[0], y, p[2]);
    const mat = new THREE.MeshBasicMaterial({ color: LOT.color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 1.2, 40, 1, true), mat); ring.position.y = 0.6; grp.add(ring);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('🚘 ' + LOT.name, { size: 46, bg: 'rgba(0,0,0,0.6)' }), fog: false }));
    label.scale.set(10, 2.5, 1); label.position.y = 4.8; grp.add(label);
    g.scene.add(grp);
    this.marker = { x: p[0], z: p[2], y, grp, ring };
    g.blips.push({ get: () => ({ x: p[0], z: p[2] }), color: '#3fa9ff', size: 6 });
    w.fastTravel?.unshift([LOT.name, ...LOT.at]);
  }
  goToLot() {
    const g = this.g;
    g.setGPS(this.marker.x, this.marker.z, true);
    g.hud.toggleMenu(false);
    g.hud.toast(`GPS set to ${LOT.name}: follow the line, then press J in the blue ring`, 'good');
  }
  update() {
    const g = this.g, m = this.marker;
    if (this.open) return;
    m.ring.material.opacity = 0.22 + Math.sin(performance.now() / 300) * 0.08;
    if (Math.hypot(g.focus.x - m.x, g.focus.z - m.z) > 6.5) return;
    if (g.police?.wanted > 0) { g.hud.prompt('Lafayette Motors won\'t serve you with the cops on your tail'); return; }
    if (g.vehicle && g.vehicle.speed > 3) { g.hud.prompt(`Slow down to visit ${LOT.name}`); return; }
    g.hud.prompt(`Press J to browse ${LOT.name}`);
    if (g.lastPressed?.has('mission')) this.show();
  }

  // ---------------------------------------------------------------- buying, delivering, selling
  buy(id) {
    const g = this.g, p = PRICES[id], s = byId[id];
    if (!p || this.owns(id)) return;
    if (g.money < p) { g.hud.toast(`You need ${money(p)} for the ${s.name} (you have ${money(g.money)})`, 'warn'); return; }
    g.addMoney(-p);
    g.save.cars.push(id);
    if (this.paintable(s)) g.save.carColors[id] = this.paint ?? this.colorOf(id);
    g.persist();
    g.audio.chime?.(true);
    this.justBought = id;
    this.renderShowroom();
    this.flash(`SOLD! The ${s.name} is yours`);
  }
  deliver(id) {
    const g = this.g;
    g.hud.toggleMenu(false);
    if (this.open) this.hide(true);
    if (g.save.myCar?.id === id) { g.spawnMyCar(); return; }
    g.spawnFromMenu(id, { mine: true, color: this.colorOf(id) });
  }
  sellable() {
    const v = this.g.vehicle;
    if (!v || v.mine || v.homeCar) return null;   // your own cars aren't for sale
    if (!PRICES[v.spec.id]) return null;
    return { v, value: Math.round(PRICES[v.spec.id] * SELL_RATE * (0.3 + 0.7 * v.hp / 100)) };
  }
  sell() {
    const g = this.g, s = this.sellable(); if (!s) return;
    if (g.police.wanted) { g.hud.toast('Nobody buys a car with the cops on your tail. Lose them first.', 'warn'); return; }
    g.hud.toggleMenu(false);
    const v = s.v;
    g.exitVehicle(true);
    const i = g.parked.indexOf(v); if (i >= 0) g.parked.splice(i, 1);
    g.scene.remove(v.mesh);
    g.addMoney(s.value); g.audio.chime?.(true);
    g.hud.toast(`💰 Sold the ${v.spec.name} for ${money(s.value)}, no questions asked`, 'good');
  }

  // a card with the real car's picture; the image fills in as soon as it's rendered
  card(spec, { color, tune, tags = '', sub = '', cls = '', onClick }) {
    const b = document.createElement('button');
    b.className = 'vcard ' + cls;
    b.innerHTML = `<div class="vpic"><div class="vload"></div>${tags}</div><div class="vtxt"><b>${spec.name}</b><small>${sub}</small></div>`;
    b.onclick = onClick;
    const pic = b.querySelector('.vpic');
    const put = (url) => { pic.style.backgroundImage = `url(${url})`; pic.classList.add('ok'); };
    const hit = this.studio.cached(spec, color, tune);
    if (hit) put(hit); else this.studio.thumb(spec, color, tune, put);
    return b;
  }

  // ---------------------------------------------------------------- V: my garage
  render(el) {
    const g = this.g;
    el.innerHTML = '';
    const owned = g.save.cars.filter(id => byId[id]);
    const head = document.createElement('div'); head.className = 'ghead';
    head.innerHTML = `<div><div class="gtitle">MY GARAGE</div><div class="gsub">${owned.length} of ${Object.keys(PRICES).length} vehicles · click one and it's brought to you</div></div><div class="gcash">${money(g.money)}</div>`;
    el.appendChild(head);
    const s = this.sellable();
    if (s) {
      const sb = document.createElement('div'); sb.className = 'gsell';
      sb.innerHTML = `<span>💰 This <b>${s.v.spec.name}</b> isn't yours. A buyer will take it for <b>${money(s.value)}</b>${g.police.wanted ? ' once you lose the cops' : ''}.</span>`;
      const btn = document.createElement('button'); btn.textContent = 'Sell it'; btn.onclick = () => this.sell();
      sb.appendChild(btn); el.appendChild(sb);
    }
    const grid = document.createElement('div'); grid.className = 'vgrid';
    for (const id of owned) {
      const sp = byId[id], tuned = g.save.myCar?.id === id;
      const tags = `${tuned ? '<i class="vtag gold">★ TUNED</i>' : ''}<i class="vtag">${CAT_ICON[sp.cat] || ''} ${sp.cat}</i>`;
      grid.appendChild(this.card(sp, { color: this.colorOf(id), tune: this.tuneOf(id), tags, sub: `${mph(sp)} mph · <span class="go">Bring it to me ›</span>`, onClick: () => this.deliver(id) }));
    }
    const more = document.createElement('button'); more.className = 'vcard more';
    more.innerHTML = `<div class="vpic"><span>🚘</span></div><div class="vtxt"><b>Buy more at ${LOT.name}</b><small>set GPS · or fast travel there</small></div>`;
    more.onclick = () => this.goToLot();
    grid.appendChild(more);
    el.appendChild(grid);
    const note = document.createElement('p'); note.className = 'note';
    note.innerHTML = `Can't afford it? Walk up to any car on the street and press <b>F</b> to steal it. Planes are brought to Purdue Airport, boats to the Wabash.`;
    el.appendChild(note);
  }

  // ---------------------------------------------------------------- the showroom
  buildUI() {
    const el = this.el = document.createElement('div');
    el.id = 'showroom'; el.hidden = true;
    el.innerHTML = `
      <div class="sr-top">
        <div class="sr-logo">LAFAYETTE <span>MOTORS</span></div>
        <div class="sr-cats"></div>
        <div class="sr-cash"></div>
        <button class="sr-x" title="Leave (Esc)">✕</button>
      </div>
      <div class="sr-stage"><div class="sr-view"></div><div class="sr-hint">drag to spin · ← → to browse</div><div class="sr-flash"></div></div>
      <div class="sr-info">
        <div class="sr-cat"></div>
        <div class="sr-name"></div>
        <div class="sr-price"></div>
        <div class="sr-stats"></div>
        <div class="sr-paint"></div>
        <div class="sr-act"></div>
      </div>
      <div class="sr-strip"></div>`;
    document.body.appendChild(el);
    el.querySelector('.sr-x').onclick = () => this.hide();
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { this.step(e.key === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
      else if (e.key === 'Enter') { el.querySelector('.sr-act button')?.click(); e.preventDefault(); }
    });
  }
  list() { return CATALOG.filter(s => s.cat === this.cat && PRICES[s.id]); }
  step(d) {
    const L = this.list(), i = L.findIndex(s => s.id === this.sel);
    this.select(L[(i + d + L.length) % L.length].id);
    this.el.querySelector('.sr-strip .vcard.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
  show() {
    const g = this.g;
    this.open = true; this.el.hidden = false; this.armed = null; this.justBought = null;
    this.marker.grp.visible = false;
    g.hud.promptT = 0; for (const id of ['big', 'prompt', 'toast']) document.getElementById(id)?.classList.remove('show');
    document.exitPointerLock?.(); document.body.classList.add('shopping', 'in-showroom');
    if (g.vehicle) { g.vehicle.vel.set(0, 0, 0); g.vehicle.throttle = 0; }
    g.paused = true;
    if (!this.sel || byId[this.sel].cat !== this.cat) this.sel = this.list()[0].id;
    this.studio.attach(this.el.querySelector('.sr-view'));
    this.select(this.sel);
  }
  hide(silent = false) {
    const g = this.g;
    this.open = false; this.el.hidden = true; this.marker.grp.visible = true;
    document.body.classList.remove('shopping', 'in-showroom');
    this.studio.detach();
    g.paused = g.hud.menuOpen || g.hud.mapOpen || g.hud.phoneOpen;
    // drive the new car off the lot
    const id = this.justBought; this.justBought = null;
    if (id && !silent) this.deliver(id);
  }
  select(id) {
    if (this.sel !== id) { this.armed = null; this.paint = null; }
    this.sel = id;
    const s = byId[id];
    this.studio.show(s, this.paint ?? this.colorOf(id), this.tuneOf(id));
    this.renderShowroom();
  }
  flash(text) {
    const f = this.el.querySelector('.sr-flash');
    f.textContent = text; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  stats(s) {
    // bars are relative to the best vehicle in the same category
    const peers = CATALOG.filter(c => c.cat === s.cat);
    const acc = (c) => c.accel ?? c.thrust / Math.sqrt(c.mass / 1000) ?? 1;
    const hand = (c) => c.grip ?? c.roll ?? 2;
    const rows = [
      ['Top speed', mph(s) + ' mph', mph(s) / Math.max(...peers.map(mph))],
      [s.type === 'plane' ? 'Thrust' : 'Acceleration', '', (acc(s) || 1) / Math.max(...peers.map(c => acc(c) || 1))],
      [s.type === 'plane' ? 'Agility' : 'Handling', '', hand(s) / Math.max(...peers.map(hand))],
      ['Weight', (s.mass >= 1000 ? (s.mass / 1000).toFixed(1) + ' t' : s.mass + ' kg'), Math.min(1, s.mass / Math.max(...peers.map(c => c.mass)))],
    ];
    return rows.map(([k, v, f]) => `<div class="st"><span>${k}</span><div class="sb"><i style="width:${Math.max(6, Math.round(f * 100))}%"></i></div><em>${v}</em></div>`).join('');
  }
  renderShowroom() {
    const g = this.g, el = this.el, s = byId[this.sel], p = PRICES[s.id], own = this.owns(s.id), can = g.money >= p;
    el.querySelector('.sr-cash').textContent = money(g.money);
    // categories
    const cats = el.querySelector('.sr-cats'); cats.innerHTML = '';
    for (const c of CATS) {
      const b = document.createElement('button'); b.className = c === this.cat ? 'on' : '';
      b.innerHTML = `${CAT_ICON[c]} <span>${c}</span>`;
      b.onclick = () => { if (this.cat === c) return; this.cat = c; this.select(this.list()[0].id); this.el.querySelector('.sr-strip').scrollLeft = 0; };
      cats.appendChild(b);
    }
    // details
    el.querySelector('.sr-cat').textContent = `${CAT_ICON[s.cat]} ${s.cat}${s.offroad ? ' · off-road' : ''}${s.pedal ? ' · pedal power' : ''}`;
    el.querySelector('.sr-name').textContent = s.name;
    el.querySelector('.sr-price').innerHTML = own ? '<b class="own">✓ IN YOUR GARAGE</b>' : `<b class="${can ? '' : 'short'}">${money(p)}</b>${can ? '' : `<small>you need ${money(p - g.money)} more</small>`}`;
    el.querySelector('.sr-stats').innerHTML = this.stats(s);
    // paint
    const pe = el.querySelector('.sr-paint'); pe.innerHTML = '';
    if (!own && this.paintable(s)) {
      const cur = this.paint ?? this.colorOf(s.id);
      pe.innerHTML = '<span>Paint <small>free</small></span>';
      const sw = document.createElement('div'); sw.className = 'sw';
      for (const [name, c] of PAINTS) {
        const b = document.createElement('button'); b.title = name; b.style.background = hex(c);
        if (c === cur) b.className = 'on';
        b.onclick = () => { this.paint = c; this.studio.show(s, c, null); this.renderShowroom(); };
        sw.appendChild(b);
      }
      pe.appendChild(sw);
    }
    // action
    const act = el.querySelector('.sr-act'); act.innerHTML = '';
    const btn = document.createElement('button');
    if (own) {
      btn.className = 'go';
      btn.innerHTML = this.justBought === s.id ? `Drive it off the lot ›` : `Take it out ›`;
      btn.onclick = () => { this.justBought = null; this.deliver(s.id); };
    } else if (!can) {
      btn.className = 'no'; btn.innerHTML = `Can't afford it yet`;
      btn.onclick = () => g.hud.toast(`Do jobs and missions, sell stolen cars, or just steal one (F).`, 'warn');
    } else if (this.armed === s.id) {
      btn.className = 'confirm'; btn.innerHTML = `Confirm: pay ${money(p)}`;
      btn.onclick = () => { this.armed = null; this.buy(s.id); };
    } else {
      btn.className = 'buy'; btn.innerHTML = `Buy for ${money(p)}`;
      btn.onclick = () => { this.armed = s.id; this.renderShowroom(); };
    }
    act.appendChild(btn);
    // the strip of every vehicle in this category, with pictures
    const strip = el.querySelector('.sr-strip'), keep = strip.scrollLeft;
    strip.innerHTML = '';
    for (const c of this.list()) {
      const o = this.owns(c.id), cp = PRICES[c.id];
      const tags = o ? '<i class="vtag own">OWNED</i>' : '';
      strip.appendChild(this.card(c, {
        color: this.colorOf(c.id), tune: this.tuneOf(c.id), tags,
        sub: o ? `${mph(c)} mph` : `<span style="color:${g.money >= cp ? '#7ee36a' : '#ff8080'}">${money(cp)}</span> · ${mph(c)} mph`,
        cls: c.id === s.id ? 'on' : '', onClick: () => this.select(c.id),
      }));
    }
    strip.scrollLeft = keep;
  }
}
