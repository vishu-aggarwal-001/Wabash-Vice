// Talk to anyone on the street, Criminal Russia style: walk up, press G (or tap 💬), pick a line.
// People have a name, a mood and a job, and they remember how you treated them. You can chat,
// ask for work (sets your GPS), ask the way, compliment them, insult them, or shake them down.
// Rob or insult the wrong person and they fight back. Cops can be bribed when you're wanted.
import { Actor } from './actors.js';

const MEN = ['Jake', 'Tyler', 'Marcus', 'Dev', 'Luis', 'Brandon', 'Chris', 'Omar', 'Ethan', 'Hank', 'Raj', 'Dale', 'Kevin', 'Nate', 'Andre', 'Cody', 'Sam', 'Wes'];
const WOMEN = ['Emma', 'Priya', 'Kayla', 'Maria', 'Jess', 'Aaliyah', 'Megan', 'Sofia', 'Hannah', 'Tasha', 'Lauren', 'Mei', 'Brooke', 'Nina', 'Grace', 'Rosa'];
const JOBS = ['Purdue student', 'grad student', 'line cook', 'mechanic', 'nurse at IU Health Arnett', 'bartender on Main Street', 'Subaru plant worker', 'barista in Chauncey', 'delivery driver', 'professor', 'contractor', 'retired', 'security guard', 'barber'];
const MOODS = ['friendly', 'friendly', 'chill', 'grumpy', 'nervous', 'chatty'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const GREET = {
  friendly: ['Hey there! Need something?', 'Oh, hi! What\'s up?', 'Hey! You lost or something?'],
  chill: ['Sup.', 'Yo. What\'s good?', 'Hey man. What\'s up?'],
  grumpy: ['What do you want?', 'Make it quick.', 'Do I know you?'],
  nervous: ['Uh… h-hi? Can I help you?', 'Oh! You scared me. What is it?', 'Um, hello?'],
  chatty: ['Hey! Crazy day, right? What\'s going on?', 'Oh hi! I was just heading to Chauncey. What\'s up?'],
};
const SMALL = [
  'Traffic on State Street is a nightmare since they tore it up again.',
  'If you\'re hungry, the Triple XXX on State Street does burgers all night.',
  'They say the cops in Lafayette are crooked. Pay the right guy and your problems go away.',
  'Heard somebody\'s been street racing on the levee at night. Big money, if you\'ve got the car.',
  'Don\'t swim in the Wabash. Trust me.',
  'Boilers lost again. I can\'t even talk about it.',
  'There\'s a garage downtown that\'ll respray a car, no questions asked.',
  'My cousin says Uncle Vic runs half of Lafayette from the back of a restaurant.',
  'You can fly planes out of Purdue Airport if you know the right people. Or if you just take one.',
  'Cold out, huh? Indiana weather: four seasons in one week.',
  'The clothes at Wabash Threads aren\'t cheap, but you\'ll look like somebody.',
  'Somebody got their car jacked right outside the Union yesterday. Crazy.',
];
const NICE_BACK = ['Aw, thanks! You\'re sweet.', 'Ha, appreciate it. You too.', 'Wow, okay. Thanks!', 'That just made my day.'];
const RUDE_BACK = { friendly: ['Wow. Okay. Rude.', 'What is your problem?'], chill: ['Whatever, man.', 'Okay… bye.'], grumpy: ['Say that again. I dare you.', 'You want a problem? You got one.'], nervous: ['Please just leave me alone!', 'I\'m calling the cops!'], chatty: ['Excuse me?!', 'I can\'t believe you just said that.'] };

export class Talk {
  constructor(g) {
    this.g = g; this.open = false; this.who = null; this.spawned = [];
    const el = this.el = document.createElement('div');
    el.id = 'talk'; el.hidden = true;
    el.innerHTML = '<div class="talk-who"></div><div class="talk-line"></div><div class="talk-opts"></div>';
    (document.getElementById('hud') || document.body).appendChild(el);
    // touch: a talk button next to the fist / kick buttons
    const tb = document.querySelector('#touch [data-btn="!kick"]');
    if (tb) { const b = document.createElement('button'); b.dataset.btn = '!talk'; b.textContent = '💬'; tb.after(b); this.touchBtn = b; this.hookTouch(b); }
  }
  hookTouch(b) {
    b.addEventListener('touchstart', (e) => { e.preventDefault(); this.g.input.pressed.add('talk'); }, { passive: false });
  }

  // the person in front of you who can talk
  nearest() {
    const g = this.g, pl = g.player;
    if (g.vehicle || pl.down > 0 || pl.swimming) return null;
    let best = null, bd = 2.6;
    const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
    const consider = (o, kind) => {
      const dx = o.pos.x - pl.pos.x, dz = o.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      const facing = (dx * fx + dz * fz) / (d || 1);
      const score = d - facing * 0.6;
      if (d < 2.6 && Math.abs(o.pos.y - pl.pos.y) < 1.5 && score < bd) { bd = score; best = { o, kind }; }
    };
    for (const p of g.traffic.peds) if (!p.fly && !(p.down > 0) && p.mesh.visible) consider(p, 'ped');
    for (const c of g.police.foot || []) if (!c.isDown && !c.leaving) consider(c, 'cop');
    return best;
  }

  persona(o, kind) {
    if (o.persona) return o.persona;
    const female = kind === 'ped' ? !!o.female : false;
    return (o.persona = {
      female, name: kind === 'cop' ? 'Officer ' + pick(['Miller', 'Reyes', 'Kowalski', 'Hart', 'Nguyen', 'Brooks']) : pick(female ? WOMEN : MEN),
      job: pick(JOBS), mood: kind === 'cop' ? 'cop' : pick(MOODS), cash: 15 + Math.floor(Math.random() * 180),
      respect: 0, robbed: false, met: false,
    });
  }

  update(dt, pr) {
    const g = this.g;
    // tidy up people who fought you once they're far away or out cold
    for (let i = this.spawned.length - 1; i >= 0; i--) {
      const a = this.spawned[i];
      if (a.removed || a.pos.distanceTo(g.focus) > 140 || (a.isDown && a.down > 30)) { if (!a.removed) a.remove(); this.spawned.splice(i, 1); }
    }
    if (this.open) {
      const w = this.who;
      const far = !w || w.o.removed || w.o.fly || w.o.pos.distanceTo(g.player.pos) > 4.5 || g.vehicle;
      if (far || pr.has('pause') || pr.has('talk')) { this.close(); pr.delete('pause'); return; }
      for (let i = 1; i <= 4; i++) if (pr.has('opt' + i)) { this.choose(i - 1); break; }
      if (w.kind === 'ped') w.o.talking = 0.5;
      const pl = g.player; pl.yaw = Math.atan2(w.o.pos.x - pl.pos.x, w.o.pos.z - pl.pos.z); pl.mesh.rotation.y = pl.yaw;
      return;
    }
    if (g.hud.menuOpen || g.hud.phoneOpen || g.hud.mapOpen || g.wardrobe?.open || g.garage?.open) return;
    const n = this.nearest();
    if (this.touchBtn) this.touchBtn.style.opacity = n ? 1 : 0.35;
    if (!n) return;
    const P = this.persona(n.o, n.kind);
    g.hud.prompt(`Press G to talk to ${P.met ? P.name : n.kind === 'cop' ? 'the officer' : 'this ' + (P.female ? 'woman' : 'guy')}`);
    if (pr.has('talk')) this.start(n);
  }

  start(n) {
    this.who = n; this.open = true; this.el.hidden = false;
    if (document.pointerLockElement) { this.relock = true; document.exitPointerLock(); }   // so you can click a reply
    const P = this.persona(n.o, n.kind);
    if (n.kind === 'ped') n.o.talking = 0.5;
    if (n.kind === 'cop') return this.copRoot();
    let line;
    if (P.robbed) line = pick(['You again?! Get away from me!', 'Haven\'t you taken enough?']);
    else if (P.respect < -1) line = pick(['Oh great, it\'s you.', 'What now?']);
    else if (P.met) line = pick([`Oh hey, it's you again!`, `Back for more chit-chat?`, `Hey! Good to see you.`]);
    else line = pick(GREET[P.mood]);
    this.root(line);
  }

  // ------------------------------------------------------------ dialogue
  say(line, opts) {
    const w = this.who, P = w.o.persona;
    this.el.querySelector('.talk-who').textContent = (P.met || w.kind === 'cop' ? P.name : '???') + (P.met && w.kind === 'ped' ? ` · ${P.job}` : '');
    this.el.querySelector('.talk-line').textContent = line;
    const box = this.el.querySelector('.talk-opts'); box.innerHTML = '';
    this.opts = opts;
    opts.forEach(([label], i) => {
      const b = document.createElement('button');
      b.innerHTML = `<b>${i + 1}</b> ${label}`;
      b.onclick = (e) => { e.stopPropagation(); this.choose(i); };
      box.appendChild(b);
    });
    this.speak(line, P);
  }
  choose(i) { const o = this.opts?.[i]; if (o) o[1](); }
  close() {
    this.open = false; this.el.hidden = true;
    if (this.who?.kind === 'ped') this.who.o.talking = 0;
    this.who = null; this.opts = null;
    if (this.relock) { this.relock = false; this.g.renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); }
    try { speechSynthesis.cancel(); } catch { /* no speech */ }
  }

  root(line) {
    const w = this.who, P = w.o.persona;
    const opts = [];
    if (!P.met) opts.push(['"Hey, I\'m new around here. What\'s your name?"', () => { P.met = true; P.respect++; this.root(`${P.name}. I'm a ${P.job}. ${pick(['Welcome to Lafayette, I guess.', 'Nice to meet you.', 'Don\'t cause trouble.'])}`); }]);
    else opts.push(['"So what\'s new?"', () => this.root(pick(SMALL))]);
    opts.push(['"Know where I can make some money?"', () => this.work()]);
    opts.push(['More…', () => this.more()]);
    opts.push(['"See you around." (leave)', () => { this.say(pick(['Later!', 'Bye.', 'Take care.', 'Yeah, see ya.']), []); setTimeout(() => this.open && this.close(), 900); }]);
    this.say(line, opts);
  }
  more() {
    const P = this.who.o.persona;
    this.say(pick(['Hm?', 'Yeah?', 'What else?']), [
      ['"Can you tell me how to get somewhere?"', () => this.directions()],
      ['"Nice outfit, by the way."', () => { P.respect += 1; this.root(P.mood === 'grumpy' && Math.random() < 0.5 ? 'Uh… thanks, I guess.' : pick(NICE_BACK)); }],
      ['"Get out of my way, loser."', () => this.insult()],
      ['"Hand over your wallet. Now."', () => this.rob()],
    ]);
  }
  work() {
    const g = this.g, f = g.focus;
    const tips = [];
    for (const m of g.missions.markers || []) tips.push([Math.hypot(m.x - f.x, m.z - f.z), m.x, m.z, `${pick(['Some guy', 'A friend of mine', 'This dude'])} ${g.world.roadNameAt(m.x, m.z) ? 'over on ' + g.world.roadNameAt(m.x, m.z) : 'across town'} is looking for someone who can drive. Look for the yellow marker.`]);
    if (g.garage?.marker) tips.push([Math.hypot(g.garage.marker.x - f.x, g.garage.marker.z - f.z) + 400, g.garage.marker.x, g.garage.marker.z, 'Fix up a car at the garage downtown and you can win the street races.']);
    tips.sort((a, b) => a[0] - b[0]);
    const t = tips[0];
    if (t && Math.random() < 0.8) {
      g.setGPS(t[1], t[2], true);
      this.root(t[3] + '  (GPS set)');
    } else this.root(pick(['Open your phone (Tab) and check the jobs: taxi, police, paramedic, it all pays.', 'Uncle Vic always needs people. But you didn\'t hear that from me.', 'Nobody\'s hiring. Try the phone, Tab, Jobs.']));
  }
  directions() {
    const g = this.g, P = this.who.o.persona;
    const go = (x, z, what) => { g.setGPS(x, z, true); this.root(`${what}? Easy. ${pick(['Head that way.', 'Not far.', 'Follow the main road.'])}  (GPS set)`); };
    const near = (list) => list.reduce((b, m) => (!b || Math.hypot(m.x - g.focus.x, m.z - g.focus.z) < Math.hypot(b.x - g.focus.x, b.z - g.focus.z) ? m : b), null);
    const opts = [];
    const shop = near((g.wardrobe?.markers || []).filter(m => m.id !== 'barber')); if (shop) opts.push(['"Clothes shop?"', () => go(shop.x, shop.z, 'Wabash Threads')]);
    const barber = (g.wardrobe?.markers || []).find(m => m.id === 'barber'); if (barber) opts.push(['"Barber?"', () => go(barber.x, barber.z, 'Levee Barbers')]);
    if (g.pawn?.marker) opts.push(['"Somewhere to buy a weapon?"', () => { P.respect--; go(g.pawn.marker.x, g.pawn.marker.z, 'A weapon… the pawn shop, I guess'); }]);
    opts.push(['"Home?" (your place)', () => go(g.home.door[0], g.home.door[1], 'Your place')]);
    this.say('Where to?', opts.slice(0, 4));
  }
  insult() {
    const g = this.g, w = this.who, P = w.o.persona;
    P.respect -= 2; g.karma(-1);
    const line = pick(RUDE_BACK[P.mood]);
    if (P.mood === 'grumpy' && !P.female && Math.random() < 0.75) { this.say(line, []); setTimeout(() => this.fight(), 700); return; }
    if (P.mood === 'nervous') { this.say(line, []); setTimeout(() => { this.flee(); if (Math.random() < 0.4) g.police.crime(1, 'Harassment'); }, 700); return; }
    this.say(line, []); setTimeout(() => this.open && this.close(), 1200);
  }
  rob() {
    const g = this.g, w = this.who, P = w.o.persona;
    const armed = !!g.guns?.id;
    if (P.robbed) { this.say('I already gave you everything!', []); setTimeout(() => this.flee(), 700); return; }
    const comply = armed ? 0.92 : { nervous: 0.8, friendly: 0.45, chatty: 0.4, chill: 0.3, grumpy: 0.1 }[P.mood];
    g.karma(-5);
    if (Math.random() < comply) {
      P.robbed = true; P.respect -= 5;
      g.addMoney(P.cash); g.audio.chime?.(true);
      this.say(armed ? 'Okay! Okay! Don\'t shoot! Take it!' : pick(['Fine! Take it! Just leave me alone!', 'Here! It\'s all I have!']), []);
      g.hud.toast(`+$${P.cash}`, 'good');
      if (g.police.copSees(g.player.pos, 60) || Math.random() < 0.3) g.police.crime(1, 'Mugging');
      setTimeout(() => this.flee(), 900);
    } else if (!P.female && (P.mood === 'grumpy' || P.mood === 'chill')) {
      this.say(pick(['Ha! Try it.', 'You picked the wrong guy.', 'Nice try, punk.']), []);
      setTimeout(() => this.fight(), 700);
    } else {
      this.say(pick(['Help! HELP! Somebody call the police!', 'Are you crazy?! Get away from me!']), []);
      setTimeout(() => { this.flee(); g.police.crime(1, 'Attempted mugging'); }, 700);
    }
  }
  flee() {
    const w = this.who; this.close();
    if (w?.kind === 'ped') { w.o.flee = 9; w.o.talking = 0; }
  }
  // the pedestrian steps off their route and squares up: they become a fighter
  fight() {
    const g = this.g, w = this.who; this.close();
    if (!w || w.kind !== 'ped') return;
    const p = w.o, i = g.traffic.peds.indexOf(p);
    if (i < 0) return;
    g.traffic.peds.splice(i, 1); g.scene.remove(p.mesh);
    const a = new Actor(g, p.female ? 'woman' : 'man', p.pos.x, p.pos.z, { mode: 'fight', hostile: true, hp: 90, dmg: 6, runSpeed: 5.2, yaw: p.yaw });
    a.persona = p.persona;
    a.onDown = () => { g.hud.toast(`${p.persona.name} won't be talking back again`, 'good'); g.prog?.add?.(5); };
    this.spawned.push(a);
    g.hud.toast(`${p.persona.met ? p.persona.name : 'He'} wants to fight!`, 'warn');
  }

  // ------------------------------------------------------------ cops
  copRoot() {
    const g = this.g, P = this.who.o.persona, wanted = g.police.wanted;
    if (wanted > 0) {
      const price = 150 * wanted;
      this.say(pick(['Hands where I can see them!', 'Don\'t move! You\'re under arrest!', 'Freeze!']), [
        [`"Let's make this go away…" (bribe $${price})`, () => {
          if (g.money < price) return this.say('You think I can be bought with pocket change? Turn around!', [['(leave)', () => this.close()]]);
          if (Math.random() < (wanted >= 4 ? 0.25 : 0.7)) {
            g.addMoney(-price); g.police.wanted = Math.max(0, wanted - 1); g.police.cool = 0;
            this.say(pick(['I didn\'t see anything. Get out of here.', 'Smart. Now beat it before I change my mind.']), []);
            setTimeout(() => this.close(), 1200);
          } else { g.police.crime(1, 'Bribing an officer'); this.say('Bribing an officer? That\'s another charge!', []); setTimeout(() => this.close(), 1000); }
        }],
        ['"I give up." (surrender)', () => { this.close(); g.busted(); }],
        ['(run for it)', () => this.close()],
      ]);
      return;
    }
    this.say(pick(['Something I can help you with, citizen?', 'Move along… unless you need something.', 'Lafayette PD. What is it?']), [
      ['"Any trouble around here, officer?"', () => this.copRoot2()],
      ['"Nice night, huh?"', () => this.say(pick(['Quiet nights are the best nights.', 'It was, until now.']), [['(leave)', () => this.close()]])],
      ['"Pig." (insult)', () => { this.close(); g.police.crime(1, 'Insulting an officer'); }],
      ['(leave)', () => this.close()],
    ]);
  }
  copRoot2() {
    this.say(pick(['Somebody\'s been jacking cars near the Union. Keep your doors locked.', 'Street racers on the levee. If I catch them, they\'re done.', 'Word is Lieutenant Kessler\'s got friends in low places. You didn\'t hear that from me.']), [['"Thanks, officer."', () => this.close()]]);
  }

  // NPC voice through the browser's speech engine (quiet, and skipped if unsupported)
  speak(line, P) {
    try {
      if (!('speechSynthesis' in window) || this.g.settings.voices === false) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(line.replace(/\(.*?\)/g, ''));
      const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
      const want = P.female ? /female|samantha|victoria|karen|zira|jenny|aria|google us english/i : /male|daniel|alex|fred|david|guy|google uk english male/i;
      u.voice = vs.find(v => want.test(v.name)) || vs[0] || null;
      u.pitch = P.female ? 1.15 : P.mood === 'grumpy' ? 0.8 : 0.95;
      u.rate = P.mood === 'nervous' ? 1.2 : P.mood === 'chill' ? 0.95 : 1.05;
      u.volume = Math.min(1, (this.g.settings.volume ?? 0.8));
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }
}
