// Street contacts, Criminal Russia style: people around town who hand you work when you talk to
// them. Each contact stands somewhere in the world (💬 on the map), has two missions, and
// remembers how far you've got. Ordinary pedestrians sometimes ask for a favour too: a ride
// across town, or help getting a stolen bag back.
import { Script } from './script.js';
import { Actor } from './actors.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- shared mission helpers
function nearestLabel(g, p) {
  let best = null, bd = 1e9;
  for (const l of g.world.map.labels) { const d = Math.hypot(l[1] - p.x, l[2] - p.z); if (d < bd) { bd = d; best = l[0]; } }
  return bd < 160 ? best : g.world.roadNameAt(p.x, p.z) || g.world.districtAt(p.x, p.z);
}
function travelTime(S, p, extra = 25, speed = 14) { const d = Math.hypot(p.x - S.here().x, p.z - S.here().z); return Math.round(d * 1.35 / speed + extra); }
// checkpoints every ~`gap` metres along the street route from a to b
function routeCps(g, a, b, gap = 230) {
  const w = g.world, path = w.route(w.nearestNode(a.x, a.z), w.nearestNode(b.x, b.z)) || [];
  const cps = []; let acc = 0, last = null;
  for (const n of path) { const q = w.gNodes[n]; if (last) acc += Math.hypot(q[0] - last[0], q[2] - last[2]); last = q; if (acc > gap) { acc = 0; cps.push({ x: q[0], z: q[2] }); } }
  cps.push({ x: b.x, z: b.z });
  return cps;
}
async function holdNear(S, getPos, r, secs, label, idle) {
  let t = 0;
  await S.until(() => {
    const P = getPos(), g = S.g, near = !g.vehicle && Math.hypot(g.player.pos.x - P.x, g.player.pos.z - P.z) < r;
    t = near ? t + (g.lastDt || 1 / 60) : Math.max(0, t - 0.03);
    S.objective(near ? `${label}  ${Math.min(100, Math.round(t / secs * 100))}%` : idle);
    return t >= secs;
  });
}
// you need wheels: use the car you're in, or go and get one
async function needCar(S, text = 'Get a car (F to enter one, V to spawn one)') {
  if (S.g.vehicle && (S.g.vehicle.type === 'car' || S.g.vehicle.type === 'bike')) return S.g.vehicle;
  S.objective(text);
  await S.until(() => S.g.vehicle && (S.g.vehicle.type === 'car' || S.g.vehicle.type === 'bike'));
  return S.g.vehicle;
}
// a passenger walks over and gets in
async function boardPassenger(S, pax, car) {
  pax.setLabel(null); pax.mode = 'goto'; pax.target = car.pos; pax.run = false;
  S.objective('Wait for them to get in (stay stopped)');
  await S.until(() => pax.pos.distanceTo(car.pos) < 2.8 && car.speed < 2);
  pax.remove();
}
async function loseCops(S, text = 'Lose the cops') {
  if (!S.g.police.wanted) return;
  S.objective(text);
  await S.until(() => S.g.police.wanted === 0);
}
// race against AI rivals through checkpoints; resolves with your finishing place
async function race(S, cps, rivals, text) {
  const done = [];
  S.cp = 0;
  S.every(() => {
    for (const d of rivals) {
      const cp = cps[d.idx];
      if (!cp) { if (!done.includes(d)) done.push(d); d.stopped = true; continue; }
      if (Math.hypot(d.v.pos.x - cp.x, d.v.pos.z - cp.z) < 22) { d.idx++; d.goal = cps[d.idx] || cps[cps.length - 1]; }
      const lead = d.idx - S.cp;
      d.cap = lead > 0 ? 0.72 : lead < -1 ? 1 : 0.88;   // rubber band, so it stays close
    }
  });
  for (let i = 0; i < cps.length; i++) {
    S.cp = i;
    await S.goto(cps[i].x, cps[i].z, { r: 16, need: 'car', text: `${text}: checkpoint ${i + 1}/${cps.length}, position ${1 + rivals.filter(d => d.idx > i).length}` });
  }
  return 1 + done.length;
}

// ---------------------------------------------------------------- the contacts
export const CONTACTS = [
  {
    id: 'tbone', name: 'T-Bone', role: 'street racer', at: [40.4250, -86.9012], side: -1, kind: 'man', look: { head: 'cap' },
    intro: "They call me T-Bone. I run the night races on the levee. You got a car and a little nerve?",
    missions: [
      { title: 'Prove It', pay: 900, pitch: "Before I let you race my crew, show me you can drive. Levee to Ross-Ade, every checkpoint, against the clock.", fn: tbone1 },
      { title: 'Pink Slip', pay: 2500, pitch: "Kid from Northside thinks his GT-R can't be beat. Race him to Columbian Park. Winner keeps his car.", fn: tbone2 },
    ],
    done: "You're the fastest thing on the levee now. Come by any night.",
  },
  {
    id: 'kowalski', name: 'Mrs. Kowalski', role: 'retired teacher', at: [40.4226, -86.9058], side: 1, kind: 'woman',
    intro: "Oh, a young person who stops to talk! I'm Mrs. Kowalski. I taught at Jeff High for thirty-one years.",
    missions: [
      { title: "Grandma's Wheels", pay: 1200, pitch: "Some hoodlums stole my late husband's '79 Monon right off the street. Someone saw it by the rail yard. Could you bring it home? Without scratches, dear.", fn: kow1 },
      { title: 'Pie Run', pay: 800, pitch: "I baked six pies for the church sale and my ride cancelled. They're delicate, so drive gently, and the sale starts soon!", fn: kow2 },
    ],
    done: "You're a good kid, whatever they say about you. Come by for pie.",
  },
  {
    id: 'lin', name: 'Professor Lin', role: 'Purdue engineering professor', at: [40.4248, -86.9102], side: -1, kind: 'man', look: { template: 'm_business' },
    intro: "Lin, aerospace engineering. Forgive me, I'm having a terrible week.",
    missions: [
      { title: 'Stolen Laptop', pay: 1000, pitch: "Someone grabbed my laptop off the table at the Union. Five years of research! A student says he ran towards the Bell Tower.", fn: lin1 },
      { title: 'Flight to Catch', pay: 1500, pitch: "I'm presenting in Washington tonight and my flight leaves Purdue Airport very soon. Could you drive me? Quickly. But not TOO quickly.", fn: lin2 },
    ],
    done: "My grant came through, and I told the committee about you. Not the speeding part.",
  },
  {
    id: 'rico', name: 'Rico', role: 'businessman (don\'t ask)', at: [40.4158, -86.8842], side: 1, kind: 'man', look: { template: 'm_leather' },
    intro: "Rico. I move things around Lafayette. Things people want moved quietly. You look like you know how to keep quiet.",
    missions: [
      { title: 'Hot Package', pay: 1800, pitch: "Package waiting near the river. Cops are watching it. Grab it, shake the heat, drop it at my guy's place. Easy money.", fn: rico1 },
      { title: 'Northside Problem', pay: 2200, pitch: "Northside Crew's been leaning on my corner boys. Three of them hang out on the south side. Send a message.", fn: rico2 },
    ],
    done: "You're a professional. When I need something special, I'll find you.",
  },
];

export class Contacts {
  constructor(g) {
    this.g = g; this.active = null; this.actors = [];
    g.save.contacts ||= {};
    const fake = { g };   // borrow the script's street helpers
    for (const C of CONTACTS) {
      const [x0, z0] = g.world.toWorld(...C.at);
      const p = Script.prototype.node.call(fake, x0, z0), c = Script.prototype.curb.call(fake, p, C.side);
      const a = new Actor(g, C.kind, c.x, c.z, { mode: 'idle', hittable: false, name: C.name, look: C.look || {} });
      a.contact = C;
      a.persona = { name: C.name, job: C.role, female: C.kind === 'woman', mood: 'friendly', met: !!g.save.contacts[C.id + ':met'], respect: 0 };
      this.actors.push(a);
      g.blips.push({ get: () => (this.stage(C) < C.missions.length && !this.active ? { x: a.pos.x, z: a.pos.z } : null), color: '#4fc3f7', size: 5 });
    }
    this.refreshLabels();
  }
  stage(C) { return this.g.save.contacts[C.id] || 0; }
  refreshLabels() {
    for (const a of this.actors) {
      const C = a.contact, left = this.stage(C) < C.missions.length;
      a.setLabel(left ? `💬 ${a.persona.met ? C.name : '?'}` : null, '#4fc3f7');
    }
  }
  busy() { const g = this.g; return !!(g.story?.active || g.jobs?.active || g.missions?.active || this.active); }

  // a conversation with a contact (called by Talk when you press G next to one)
  dialog(T, a) {
    const g = this.g, C = a.contact, P = a.persona, st = this.stage(C);
    const first = !P.met;
    if (first) { P.met = true; g.save.contacts[C.id + ':met'] = true; this.refreshLabels(); }
    if (st >= C.missions.length) return T.say(C.done, [['"Take care."', () => T.close()]]);
    const M = C.missions[st];
    const offer = () => T.say(M.pitch, [
      [`"I'm in." (start "${M.title}")`, () => { T.close(); this.start(C, st); }],
      ['"What does it pay?"', () => T.say(`$${M.pay.toLocaleString()}. Cash.${M.title === 'Pink Slip' ? ' Plus his car.' : ''}`, [[`"Deal." (start "${M.title}")`, () => { T.close(); this.start(C, st); }], ['"Let me think about it."', () => T.close()]])],
      ['"Not right now."', () => T.say(pick(['Your loss. I\'ll be here.', 'Come back when you\'re ready.', 'Fine. Don\'t wait too long.']), [['(leave)', () => T.close()]])],
    ]);
    if (first) T.say(C.intro, [['"Maybe. What do you need?"', offer], ['"Not interested."', () => T.close()]]);
    else T.say(st > 0 ? pick(['Look who\'s back. I\'ve got another one for you.', 'There you are! I need your help again.']) : pick(['Changed your mind?', 'Back again?']), [['"What\'s the job?"', offer], ['"Just passing by."', () => T.close()]]);
  }

  start(C, st) {
    const g = this.g;
    if (this.busy()) { g.hud.toast('Finish what you\'re doing first', 'warn'); return; }
    const M = C.missions[st];
    g.hud.big(M.title.toUpperCase(), `${C.name} · job ${st + 1}/${C.missions.length}`);
    this.active = new Script(g, M.title, (S) => M.fn(S, this, C), {
      color: '#4fc3f7',
      onEnd: (ok, msg) => {
        this.active = null;
        if (ok) {
          const pay = Math.round(M.pay * (g.prog?.payMult || 1));
          g.addMoney(pay); g.prog?.add(100 + st * 50);
          g.save.contacts[C.id] = Math.max(this.stage(C), st + 1);
          g.hud.big('MISSION PASSED', `${M.title}  •  +$${pay.toLocaleString()}`, 'pass'); g.audio.chime(true);
          g.persist(); this.refreshLabels();
        } else { g.hud.big('MISSION FAILED', msg || '', 'fail'); g.audio.chime(false); }
      },
    }).start();
  }
  actorOf(C) { return this.actors.find(a => a.contact === C); }
  update() {
    const f = this.g.focus;
    for (const a of this.actors) if (!a.hiddenForRide) a.mesh.visible = Math.hypot(a.pos.x - f.x, a.pos.z - f.z) < 220;
  }

  // ------------------------------------------------------------ favours from strangers
  // Called from Talk when you ask a pedestrian about work. Returns true if they offered one.
  offerFavour(T, p) {
    if (this.busy() || Math.random() > 0.45) return false;
    const g = this.g, P = p.persona;
    const type = g.vehicle || Math.random() < 0.5 ? 'ride' : 'snatch';
    if (type === 'ride') {
      T.say(pick([`Actually… could you give me a ride? I'll pay. My car's in the shop.`, `Funny you ask. I need a ride across town and the bus is late again. Twenty bucks plus a tip?`]), [
        ['"Sure, hop in." (give a ride)', () => { T.close(); this.favour(p, 'ride'); }],
        ['"Sorry, I\'m busy."', () => T.root('No worries.')],
      ]);
    } else {
      T.say(pick(['Oh my god, you have to help me. Some guy just grabbed my bag! He went that way!', 'A guy in a beanie just snatched my phone and ran! Please!']), [
        ['"I\'ll get it back." (chase the thief)', () => { T.close(); this.favour(p, 'snatch'); }],
        ['"Not my problem."', () => { P.respect -= 2; T.root('Wow. Thanks for nothing.'); }],
      ]);
    }
    return true;
  }
  favour(p, type) {
    const g = this.g, name = p.persona.name;
    const i = g.traffic.peds.indexOf(p); if (i >= 0) { g.traffic.peds.splice(i, 1); g.scene.remove(p.mesh); }
    const from = { x: p.pos.x, z: p.pos.z, y: p.pos.y }, female = p.female;
    this.active = new Script(g, type === 'ride' ? 'A ride' : 'Bag snatcher', async (S) => {
      const who = S.actor(female ? 'woman' : 'man', from.x, from.z, { mode: 'idle', hittable: false, label: name.toUpperCase(), labelColor: '#4fc3f7' });
      if (type === 'ride') {
        const car = await needCar(S, `Get a car to give ${name} a ride (F to enter, V to spawn)`);
        await S.goto(who.pos.x, who.pos.z, { r: 9, need: car, stop: true, text: `Pick up ${name}`, noBeam: true });
        await boardPassenger(S, who, car);
        const d = S.somewhere(500, 1400), place = nearestLabel(g, d);
        S.say(name, pick([`${place}, please.`, `Could you take me to ${place}?`, `${place}. Thanks so much!`]), 2.2);
        const hp0 = car.hp, limit = travelTime(S, d, 40);
        S.timer(limit, `${name} got out and walked`);
        S.failIf(() => g.vehicle !== car, `You left ${name} in the car`);
        await S.goto(d.x, d.z, { r: 11, need: car, stop: true, text: `Drive ${name} to ${place}` });
        const left = Math.max(0, S.deadline - S.time); S.clearTimer();
        const pay = Math.max(20, Math.round(30 + Math.hypot(d.x - from.x, d.z - from.z) * 0.08 + left * 1.5 - Math.max(0, hp0 - car.hp)));
        await S.say(name, car.hp < hp0 - 15 ? 'I\'m alive. Barely. Here.' : pick(['Thanks! You\'re a lifesaver.', 'That was fast! Keep the change.']), 1.8);
        S.pay(pay, 'Ride'); g.karma(2);
      } else {
        who.mode = 'wave';
        const ang = Math.random() * 6.28;
        const tx = S.curb(S.node(from.x + Math.sin(ang) * 60, from.z + Math.cos(ang) * 60), 1);
        const thief = S.actor('man', tx.x, tx.z, { mode: 'flee', label: 'THIEF', runSpeed: 5.0 + Math.random() * 0.5, hp: 60, look: { head: 'beanie' } });
        S.blip(() => thief.pos, '#ff3b3b', 5);
        let lost = 0;
        S.failIf(() => { lost = thief.pos.distanceTo(S.here()) > 160 ? lost + 1 / 60 : 0; return lost > 10; }, 'The thief got away');
        setTimeout(() => { thief.tired = true; }, 20000);
        S.objective('Catch the thief: knock him down (Q punch, E kick, or your bumper)');
        await S.until(() => thief.isDown);
        thief.down = 1e9; thief.setLabel('BAG', '#ffd23f');
        await holdNear(S, () => thief.pos, 2.4, 1, 'Grabbing the bag', 'Grab the bag from the thief');
        thief.setLabel(null);
        S.clearTimer();
        await S.goto(who.pos.x, who.pos.z, { r: 3, text: `Return the bag to ${name}`, noBeam: true });
        await S.say(name, pick(['You got it! Oh, thank you, thank you!', 'My hero! Here, take this.']), 1.8);
        S.pay(150 + Math.floor(Math.random() * 150), 'Reward'); g.karma(4);
      }
    }, {
      color: '#4fc3f7',
      onEnd: (ok, msg) => { this.active = null; if (ok) { g.prog?.add(40); g.audio.chime(true); } else { g.hud.big('FAVOUR FAILED', msg || '', 'fail'); } },
    }).start();
  }
}

// ---------------------------------------------------------------- T-Bone
async function tbone1(S, K, C) {
  const g = S.g, me = K.actorOf(C);
  const car = await needCar(S, 'Get a car for the time trial (F to enter, V to spawn)');
  const start = S.node(me.pos.x, me.pos.z);
  await S.goto(start.x, start.z, { r: 14, need: car, stop: true, text: 'Line up at the levee start' });
  const R = S.ll(40.4347, -86.9184), cps = routeCps(g, start, R, 320);
  for (const n of ['3', '2', '1']) { S.big(n, 'Time trial'); g.audio.chime(false); await S.wait(1); }
  S.big('GO!', 'Every checkpoint to Ross-Ade');
  const limit = Math.round(travelTime(S, R, 8, 19));
  S.timer(limit, 'Too slow. T-Bone is laughing at you');
  S.failIf(() => g.vehicle?.dead, 'You wrecked it');
  for (let i = 0; i < cps.length; i++) await S.goto(cps[i].x, cps[i].z, { r: 16, need: 'car', text: `Time trial: checkpoint ${i + 1}/${cps.length}` });
  const t = Math.round(S.time); S.clearTimer();
  await S.say('T-Bone', `${t} seconds? Okay, okay. You can drive. Come see me again.`);
}
async function tbone2(S, K, C) {
  const g = S.g, me = K.actorOf(C);
  await S.say('T-Bone', 'Line up next to him. And don\'t embarrass me.');
  const car = await needCar(S, 'Get the fastest car you can (F / V)');
  const start = S.node(me.pos.x, me.pos.z), yaw = S.roadYaw(start);
  const P = S.ll(40.4072, -86.8690), cps = routeCps(g, start, P, 250);
  const rival = S.aiCar('gtr', start.x - Math.sin(yaw) * 9 + Math.cos(yaw) * 2.4, start.z - Math.cos(yaw) * 9 - Math.sin(yaw) * 2.4, yaw, { mode: 'goto', cap: 0.88, arrive: 4, color: 0x2a2a2e });
  rival.idx = 0; rival.brake = true;
  S.blip(() => rival.v.pos, '#ff7b00', 5);
  await S.goto(start.x, start.z, { r: 12, need: car, stop: true, text: 'Pull up to the start line' });
  for (const n of ['3', '2', '1']) { S.big(n, 'Pink slips'); g.audio.chime(false); await S.wait(1); }
  S.big('GO!', 'Race to Columbian Park'); g.audio.chime(true);
  rival.brake = false; rival.goal = cps[0];
  S.failIf(() => g.vehicle?.dead, 'You wrecked it');
  const place = await race(S, cps, [rival], 'Pink slip race');
  if (place > 1) { S.fail('He beat you. Say goodbye to your pride'); return; }
  rival.stopped = true; S.release(rival);
  rival.v.mine = true; rival.v.showcase = true; rival.v.keep = true;
  if (!g.owns('gtr')) { g.save.cars.push({ id: 'gtr', tune: null }); g.persist(); }
  await S.dialog([['Northside kid', 'No way… no WAY. Fine. Take the keys.'], ['T-Bone', 'HA! That GT-R is yours now. It\'s parked right there.']]);
}

// ---------------------------------------------------------------- Mrs. Kowalski
async function kow1(S, K, C) {
  const g = S.g, me = K.actorOf(C);
  const Y = S.ll(40.4135, -86.8862), yaw = S.roadYaw(Y), sp = S.curb(Y, 1);
  const car = S.car('classic', sp.x, sp.z, yaw, { color: 0x2e5f8a });
  car.noExplode = true;
  const t1 = S.actor('man', sp.x + 2.5, sp.z + 1.2, { mode: 'idle', hostile: true, hp: 90, dmg: 6, look: { head: 'beanie' } });
  const t2 = S.actor('man', sp.x - 2.2, sp.z + 1.8, { mode: 'idle', hostile: true, hp: 90, dmg: 6 });
  S.blip(() => car.pos, '#7fd1ff', 6);
  await S.goto(car.pos.x, car.pos.z, { r: 25, text: "Find Mrs. Kowalski's Monon Classic at the rail yard", noBeam: true });
  t1.mode = t2.mode = 'fight';
  await S.say('Thug', 'That\'s our ride now, buddy. Walk away.', 1.6);
  S.failIf(() => g.player.hp <= 0, 'They beat you up');
  await S.goto(car.pos.x, car.pos.z, { r: 3.5, need: car, text: 'Take the car back (F), or deal with them first', noBeam: true });
  S.failIf(() => car.hp < 40, 'You wrecked her husband\'s car');
  await S.goto(me.pos.x, me.pos.z, { r: 10, need: car, stop: true, text: 'Bring the Monon back to Mrs. Kowalski in one piece' });
  g.exitVehicle(true);
  await S.say('Mrs. Kowalski', car.hp > 85 ? 'Not a scratch! Walter would have loved you.' : 'A few dents, but it\'s home. Thank you, dear.');
}
async function kow2(S, K, C) {
  const g = S.g, me = K.actorOf(C);
  const car = await needCar(S, 'Get a car for the pies (F / V)');
  await S.goto(me.pos.x, me.pos.z, { r: 8, need: car, stop: true, text: 'Pick up the pies from Mrs. Kowalski' });
  await S.say('Mrs. Kowalski', 'Gently now! Six pies. I counted.', 1.8);
  let pies = 6, hp = car.hp;
  S.every(() => { if (car.hp < hp - 2) { const lost = Math.min(pies, Math.ceil((hp - car.hp) / 6)); pies -= lost; hp = car.hp; if (lost) S.toast(`💥 Lost ${lost} pie${lost > 1 ? 's' : ''}!`, 'warn'); } });
  S.failIf(() => pies <= 2, 'The pies are ruined');
  const D = S.ll(40.4189, -86.8935), place = 'St. Mary\'s on Columbia Street';
  S.timer(travelTime(S, D, 45), 'The bake sale started without the pies');
  S.objective(() => `Deliver the pies to ${place} — ${'🥧'.repeat(pies)}`);
  await S.goto(D.x, D.z, { r: 12, need: car, stop: true, text: undefined });
  S.clearTimer();
  await S.say('Church lady', pies === 6 ? 'All six! Bless you.' : `Only ${pies}? Well… they'll sell.`);
  if (pies < 6) S.toast('Mrs. Kowalski will hear about those pies', 'warn');
}

// ---------------------------------------------------------------- Professor Lin
async function lin1(S, K, C) {
  const g = S.g, me = K.actorOf(C);
  const B = S.curb(S.ll(40.42715, -86.91413), 1);
  const thief = S.actor('man', B.x, B.z, { mode: 'idle', label: 'LAPTOP THIEF', runSpeed: 5.3, hp: 70, look: { head: 'cap' } });
  S.blip(() => thief.pos, '#ff3b3b', 6);
  await S.goto(B.x, B.z, { r: 26, text: 'Find the thief near the Purdue Bell Tower', noBeam: true });
  thief.mode = 'flee';
  await S.say('Thief', 'Not today!', 1);
  let lost = 0;
  S.failIf(() => { lost = thief.pos.distanceTo(S.here()) > 170 ? lost + 1 / 60 : 0; return lost > 10; }, 'He got away with five years of research');
  setTimeout(() => { thief.tired = true; }, 22000);
  S.objective('Catch the thief');
  await S.until(() => thief.isDown);
  thief.down = 1e9; thief.setLabel('LAPTOP', '#ffd23f');
  await holdNear(S, () => thief.pos, 2.4, 1, 'Taking the laptop', 'Grab the laptop');
  thief.setLabel(null);
  await S.goto(me.pos.x, me.pos.z, { r: 3, text: 'Bring the laptop back to Professor Lin at the Union', noBeam: true });
  await S.say('Professor Lin', 'My research! You have no idea… thank you. Truly.');
}
async function lin2(S, K, C) {
  const g = S.g, me = K.actorOf(C);
  const car = await needCar(S, 'Get a car to drive Professor Lin (F / V)');
  await S.goto(me.pos.x, me.pos.z, { r: 9, need: car, stop: true, text: 'Pick up Professor Lin at the Union' });
  const pax = S.actor('man', me.pos.x + 0.8, me.pos.z, { mode: 'idle', look: { template: 'm_business' } });
  me.hiddenForRide = true; me.mesh.visible = false; S.onCleanup(() => { me.hiddenForRide = false; });
  await boardPassenger(S, pax, car);
  S.say('Professor Lin', 'Purdue Airport, please. The terminal. Hurry!', 2);
  const A = S.ll(40.4152, -86.9310), hp0 = car.hp;
  S.timer(travelTime(S, A, 30, 16), 'Lin missed his flight');
  S.failIf(() => g.vehicle !== car, 'You left the professor in the car');
  S.failIf(() => car.hp < hp0 - 40, 'Lin is not getting in a car with you again');
  await S.goto(A.x, A.z, { r: 14, need: car, stop: true, text: 'Get Professor Lin to Purdue Airport' });
  S.clearTimer();
  await S.say('Professor Lin', car.hp > hp0 - 10 ? 'Perfect! Smooth AND fast. I may make it after all.' : 'I believe I left my stomach on State Street. But I made it!');
}

// ---------------------------------------------------------------- Rico
async function rico1(S, K, C) {
  const g = S.g;
  const P = S.curb(S.ll(40.4213, -86.9025), 1);
  const bag = S.beam(P.x, P.z, { r: 1.2, color: 0x4fc3f7, h: 6 });
  await S.goto(P.x, P.z, { r: 2.5, need: 'foot', text: 'Pick up the package by Tapawingo Park (on foot)', noBeam: true });
  bag.remove();
  g.police.crime(2, 'Possession of stolen goods');
  await S.say('Rico', 'Cops saw you. Lose them, then bring it to my guy.', 2);
  await loseCops(S, 'Lose the cops');
  const D = S.curb(S.ll(40.4070, -86.8775), -1);
  const guy = S.actor('man', D.x, D.z, { mode: 'idle', hittable: false, label: "RICO'S GUY", labelColor: '#4fc3f7' });
  S.failIf(() => g.police.wanted >= 3, 'Too much heat. Rico won\'t touch it now');
  await S.goto(guy.pos.x, guy.pos.z, { r: 3, need: 'foot', text: "Deliver the package to Rico's guy (on foot, no cops)", noBeam: true });
  if (g.police.wanted) { S.objective('You brought cops! Lose them'); await loseCops(S); }
  await S.say("Rico's guy", 'Clean. Rico will be happy.');
}
async function rico2(S, K, C) {
  const g = S.g;
  const Cn = S.curb(S.ll(40.4126, -86.8760), 1);
  const crew = [0, 1, 2].map(k => S.actor('man', Cn.x + Math.cos(k * 2.1) * 2, Cn.z + Math.sin(k * 2.1) * 2, { mode: 'idle', hostile: true, hp: 100, dmg: 7, label: 'NORTHSIDE', look: { head: ['cap', 'beanie', null][k] } }));
  crew.forEach(c => S.blip(() => (c.isDown ? null : c.pos), '#ff3b3b', 5));
  await S.goto(Cn.x, Cn.z, { r: 16, text: 'Find the Northside Crew on the south side', noBeam: true });
  await S.say('Northside', "Rico sent you? He should've come himself.", 1.6);
  crew.forEach(c => { c.mode = 'fight'; });
  S.failIf(() => g.player.hp <= 0, 'The Northside Crew beat you down');
  S.objective(() => `Beat the Northside Crew: ${crew.filter(c => !c.isDown).length} left`);
  await S.until(() => crew.every(c => c.isDown));
  crew.forEach(c => { c.down = 1e9; c.setLabel(null); });
  await S.say('Rico', 'Word travels fast. Nobody touches my corner now.', 2.2);
}
