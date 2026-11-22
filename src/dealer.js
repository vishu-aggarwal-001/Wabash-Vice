// Lafayette Motors: cars are bought, not spawned. The vehicles menu (V) is a dealership:
// buy a car and it's delivered to you; cars you own can be called up again for free.
// Anything else you have to steal (F). A stolen car can be sold here for a fraction of its price.
import { CATALOG, byId, topSpeed } from './vehicles.js';

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

export class Dealer {
  constructor(g) {
    this.g = g;
    // you own the car in your driveway (and anything you tuned at Dee's)
    g.save.cars ||= [];
    for (const id of [DEFAULT_CAR, g.save.myCar?.id]) if (id && !g.save.cars.includes(id)) g.save.cars.push(id);
    this.armed = null;   // first click arms a purchase, the second buys (no accidental $160k)
  }
  owns(id) { return this.g.save.cars.includes(id); }
  price(id) { return PRICES[id]; }

  buy(id) {
    const g = this.g, p = PRICES[id], s = byId[id];
    if (!p) return;
    if (g.money < p) { g.hud.toast(`You need $${p.toLocaleString()} for the ${s.name} (you have $${g.money.toLocaleString()})`, 'warn'); return; }
    g.addMoney(-p); g.save.cars.push(id); g.persist();
    g.audio.chime?.(true);
    g.hud.toast(`🔑 Bought the ${s.name} for $${p.toLocaleString()}. It's yours: call it up any time from V.`, 'good');
    this.deliver(id);
  }
  deliver(id) {
    const g = this.g;
    g.hud.toggleMenu(false);
    if (g.save.myCar?.id === id) { g.spawnMyCar(); }
    else g.spawnFromMenu(id, { mine: true });
  }
  // the car you're driving, if it's stolen and sellable
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
    g.hud.toast(`💰 Sold the ${v.spec.name} for $${s.value.toLocaleString()}, no questions asked`, 'good');
  }

  render(el) {
    const g = this.g;
    el.innerHTML = '';
    const head = (t, sub) => { const h = document.createElement('h4'); h.innerHTML = t + (sub ? ` <small style="font-weight:400;color:#aaa">${sub}</small>` : ''); el.appendChild(h); };
    const row = () => { const r = document.createElement('div'); r.className = 'row'; el.appendChild(r); return r; };
    const top = (s) => s.max ? Math.round(topSpeed(s) * 2.237) + ' mph' : '';
    const intro = document.createElement('p'); intro.className = 'note';
    intro.innerHTML = `<b style="color:#ffd23f">Lafayette Motors</b>. You have <b style="color:#7ee36a">$${g.money.toLocaleString()}</b>. Buy a car and it's delivered to you. Can't afford it? Walk up to any car on the street and press <b>F</b> to steal it.`;
    el.appendChild(intro);
    // sell what you're driving
    const s = this.sellable();
    if (s) {
      head('Sell this car', 'stolen? we don\'t ask');
      const b = document.createElement('button');
      b.innerHTML = `<b>💰 Sell the ${s.v.spec.name}</b><small>$${s.value.toLocaleString()}${g.police.wanted ? ' · lose the cops first' : ''}</small>`;
      b.style.borderColor = '#7ee36a';
      b.onclick = () => this.sell();
      row().appendChild(b);
    }
    // your garage
    head('Your garage', 'free to call up');
    const gr = row();
    for (const id of g.save.cars) {
      const sp = byId[id]; if (!sp) continue;
      const tuned = g.save.myCar?.id === id;
      const b = document.createElement('button');
      b.innerHTML = `<b>${tuned ? '★ ' : '🔑 '}${sp.name}</b><small>${tuned ? 'tuned at Dee\'s · ' : ''}${top(sp)} · deliver</small>`;
      if (tuned) b.style.borderColor = '#ff8a1a';
      b.onclick = () => this.deliver(id);
      gr.appendChild(b);
    }
    // for sale
    const cats = [...new Set(CATALOG.map(c => c.cat))];
    for (const cat of cats) {
      const list = CATALOG.filter(c => c.cat === cat && !this.owns(c.id));
      if (!list.length) continue;
      head(cat === 'Emergency' ? 'Emergency' : cat, cat === 'Emergency' ? 'not for sale: steal one' : '');
      const r = row();
      for (const sp of list) {
        const p = PRICES[sp.id], b = document.createElement('button');
        if (!p) { b.innerHTML = `<b>${sp.name}</b><small>steal only</small>`; b.disabled = true; r.appendChild(b); continue; }
        const can = g.money >= p, armed = this.armed === sp.id;
        b.innerHTML = `<b>${sp.name}</b><small>${top(sp)} · <span style="color:${can ? '#7ee36a' : '#ff7a7a'}">$${p.toLocaleString()}</span>${armed ? ' · <b style="color:#ffd23f">click again to buy</b>' : ''}</small>`;
        if (!can) b.style.opacity = '0.55';
        if (armed) b.style.borderColor = '#ffd23f';
        b.onclick = () => {
          if (!can) { g.hud.toast(`You need $${p.toLocaleString()} for the ${sp.name}. Do jobs and missions, sell stolen cars, or just steal one.`, 'warn'); return; }
          if (this.armed !== sp.id) { this.armed = sp.id; this.render(el); return; }
          this.armed = null; this.buy(sp.id);
        };
        r.appendChild(b);
      }
    }
  }
}
