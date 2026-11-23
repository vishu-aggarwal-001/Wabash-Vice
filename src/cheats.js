// Hidden extras. Nothing on screen points here.
import { PRICES } from './dealer.js';
import { WEAPONS } from './weapons.js';
import { GUNS } from './guns.js';
import { catalogue } from './wardrobe.js';
import { CHAPTER } from './story.js';
import { TALENTS } from './progression.js';

const SEQ = 'abcdefgh';
const KEY = '39d28512';
const hash = (s) => { let x = 0x811c9dc5; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16); };

export class Cheats {
  constructor(g) {
    this.g = g; this.buf = ''; this.open = false; this.ok = false;
    this.god = false; this.noCops = false;
    const el = this.el = document.createElement('div');
    el.id = 'xpanel'; el.hidden = true;
    document.body.appendChild(el);
    const css = document.createElement('style');
    css.textContent = `#xpanel { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(0,0,0,.55); font: 15px system-ui; color: #fff; }
#xpanel .box { background: #14161b; border: 1px solid #ffd23f; border-radius: 14px; padding: 20px 22px; width: min(440px, 92vw); box-shadow: 0 10px 40px #000; }
#xpanel h3 { margin: 0 0 12px; color: #ffd23f; letter-spacing: .08em; }
#xpanel input { width: 100%; box-sizing: border-box; padding: 10px; font-size: 18px; border-radius: 8px; border: 1px solid #555; background: #0b0c0f; color: #fff; }
#xpanel .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#xpanel button { padding: 10px; border-radius: 8px; border: 1px solid #444; background: #22252c; color: #fff; font: 600 14px system-ui; cursor: pointer; }
#xpanel button:hover { background: #ffd23f; color: #000; }
#xpanel button.big { grid-column: 1 / -1; background: #ffd23f; color: #000; font-size: 16px; }
#xpanel button.on { border-color: #7ee36a; color: #7ee36a; }
#xpanel .err { color: #ff6a6a; min-height: 20px; margin-top: 6px; }
#xpanel small { color: #888; display: block; margin-top: 10px; text-align: center; }`;
    document.head.appendChild(css);
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.repeat || e.key.length !== 1) return;
      this.buf = (this.buf + e.key.toLowerCase()).slice(-SEQ.length);
      if (this.buf === SEQ) { this.buf = ''; this.toggle(); }
    });
    // Esc closes the panel (and doesn't also open the pause menu)
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.open) { e.stopPropagation(); e.preventDefault(); this.toggle(false); } }, true);
  }

  toggle(open = !this.open) {
    const g = this.g;
    this.open = open; this.el.hidden = !open;
    if (open) { document.exitPointerLock?.(); g.paused = true; this.ok ? this.menu() : this.lock(); }
    else g.paused = g.hud.menuOpen || g.hud.mapOpen || g.hud.phoneOpen || !!g.pawn?.open || !!g.wardrobe?.open || !!g.garage?.open || !!g.dealer?.open;
  }

  lock() {
    this.el.innerHTML = `<div class="box"><h3>🔒</h3><input type="password" autocomplete="off" spellcheck="false"><div class="err"></div><small>Esc to close</small></div>`;
    const inp = this.el.querySelector('input'), err = this.el.querySelector('.err');
    setTimeout(() => inp.focus(), 30);
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (hash(inp.value.trim().toLowerCase()) === KEY) { this.ok = true; this.g.audio.chime?.(true); this.menu(); }
      else { err.textContent = 'Nope.'; inp.value = ''; }
    });
  }

  menu() {
    const b = (id, label, cls = '') => `<button data-x="${id}" class="${cls}">${label}</button>`;
    this.el.innerHTML = `<div class="box"><h3>🔓 RELEASE ANYTHING</h3><div class="grid">
      ${b('all', '⚡ Unlock everything', 'big')}
      ${b('cars', '🚗 Every vehicle')}${b('guns', '🔫 Every weapon + ammo')}
      ${b('money', '💰 +$1,000,000')}${b('clothes', '👕 Every outfit')}
      ${b('level', '⭐ Max level + skills')}${b('story', '📖 Every story mission')}
      ${b('god', '🛡 God mode', this.god ? 'on' : '')}${b('cops', '🚓 Cops ignore you', this.noCops ? 'on' : '')}
      ${b('heal', '❤ Heal + armor + medkits')}${b('close', 'Close')}
    </div><small>type the letters again to hide</small></div>`;
    for (const btn of this.el.querySelectorAll('[data-x]')) btn.onclick = () => this.run(btn.dataset.x);
  }

  run(x) {
    const g = this.g, s = g.save, say = (t) => g.hud.toast(t, 'good');
    const cars = () => { s.cars = [...new Set([...(s.cars || []), ...Object.keys(PRICES)])]; };
    const guns = () => { s.weapons = WEAPONS.map(w => w.id); for (const id in GUNS) s.ammo[id] = Math.max(s.ammo[id] || 0, 999); };
    const clothes = () => { const keys = ['m', 'f'].flatMap(gn => catalogue(g.people, gn).map(it => it.key)); s.owned2 = [...new Set([...(s.owned2 || []), ...keys])]; };
    const level = () => { s.xp = Math.max(s.xp || 0, 11000); for (const k in TALENTS) s.talents[k] = TALENTS[k].max; g.player.hp = g.prog.maxHP; };
    const story = () => { s.story ||= {}; s.story.done = Math.max(s.story.done || 0, CHAPTER.length); };
    switch (x) {
      case 'all': cars(); guns(); clothes(); level(); story(); g.addMoney(1000000); say('⚡ Everything unlocked'); break;
      case 'cars': cars(); say('🚗 Every vehicle is yours: press V'); break;
      case 'guns': guns(); say('🔫 Every weapon, 999 rounds each'); break;
      case 'money': g.addMoney(1000000); say('💰 +$1,000,000'); break;
      case 'clothes': clothes(); say('👕 Every outfit unlocked'); break;
      case 'level': level(); say('⭐ Max level, every skill maxed'); break;
      case 'story': story(); say('📖 Every story mission unlocked'); break;
      case 'god': this.god = !this.god; say(this.god ? '🛡 God mode ON' : 'God mode off'); break;
      case 'cops': this.noCops = !this.noCops; if (this.noCops) g.police.clear(); say(this.noCops ? '🚓 Cops ignore you' : 'Cops are back'); break;
      case 'heal': g.player.hp = g.prog.maxHP; g.player.armor = 100; g.player.medkits = Math.max(g.player.medkits, 9); if (g.vehicle) g.vehicle.hp = 100; say('❤ Healed'); break;
      case 'close': this.toggle(false); return;
    }
    g.persist();
    this.menu();
  }

  // every frame
  update() {
    const g = this.g;
    if (this.god) { g.player.hp = g.player.maxHP; if (g.vehicle && !g.vehicle.dead) { g.vehicle.hp = 100; g.vehicle.burn = 0; } }
    if (this.noCops && g.police.wanted > 0) g.police.clear();
  }
}
