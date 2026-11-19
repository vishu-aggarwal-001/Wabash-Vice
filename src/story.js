// Story mode — Chapter 1: "Wabash Vice". Five missions for Dee, who runs a chop shop
// behind a tire place in downtown Lafayette. Start them from the phone (Tab → Story).
import { Script } from './script.js';

const L = {
  garage: [40.4204, -86.8893], rossade: [40.4347, -86.9184], chauncey: [40.4238, -86.9078],
  landing: [40.4203, -86.8987], columbian: [40.4072, -86.8690], courthouse: [40.4194, -86.8920], union: [40.4245, -86.9110],
};

export const CHAPTER = [
  { id: 'm1', title: 'Fresh off the Greyhound', who: 'Dee', blurb: 'Meet Dee at her garage downtown and prove you can drive.', pay: 1500, fn: m1 },
  { id: 'm2', title: 'Collections', who: 'Dee', blurb: 'Marco owes Dee two grand. He hangs out in Chauncey Village.', pay: 2000, fn: m2 },
  { id: 'm3', title: 'Hot Wheels', who: 'Dee', blurb: 'A buyer wants the Riverside Muscle parked at Wabash Landing.', pay: 3500, fn: m3 },
  { id: 'm4', title: 'River Run', who: 'Dee', blurb: 'A package is floating up the Wabash. Get it before anyone else.', pay: 3000, fn: m4 },
  { id: 'm5', title: 'Homecoming Race', who: 'Dee', blurb: 'Win the big street race from Ross-Ade to Columbian Park.', pay: 5000, fn: m5 },
];

export class Story {
  constructor(g) { this.g = g; this.active = null; g.save.story ||= { done: 0 }; }
  get done() { return this.g.save.story.done; }
  start(i) {
    const g = this.g, M = CHAPTER[i];
    if (this.active) return;
    if (g.jobs.active) g.jobs.end(true);
    if (i > this.done) { g.hud.toast('Finish the earlier missions first', 'warn'); return; }
    g.missions.cancel();
    g.hud.big(M.title.toUpperCase(), `Chapter 1 · Mission ${i + 1}/${CHAPTER.length}`);
    this.active = new Script(g, M.title, (S) => M.fn(S, this), {
      color: '#ffd23f',
      onEnd: (ok, msg) => {
        this.active = null;
        if (ok) {
          g.addMoney(M.pay); g.karma(-2);
          if (i >= this.done) g.save.story.done = i + 1;
          g.hud.big('MISSION PASSED', `${M.title}  •  +$${M.pay.toLocaleString()}`, 'pass');
          g.audio.chime(true);
          if (i + 1 === CHAPTER.length) setTimeout(() => g.hud.big('CHAPTER 1 COMPLETE', 'Thanks for playing! The Golden Train Hypercar is waiting at Ross-Ade. More chapters coming soon.', 'pass'), 4000);
          else setTimeout(() => { g.audio.ring(); g.hud.toast(`📱 New message from Dee: "${CHAPTER[i + 1].blurb}" (Tab → Story)`, 'good'); }, 5000);
          g.persist();
        } else {
          g.hud.big('MISSION FAILED', msg || '', 'fail'); g.audio.chime(false);
        }
      },
    }).start();
  }
  cancel() { this.active?.fail('Mission cancelled'); }
}

// Dee stands outside her garage
function dee(S) {
  const p = S.curb(S.ll(...L.garage), 1);
  return S.actor('woman', p.x, p.z, { mode: 'idle', label: 'DEE', labelColor: '#ffd23f', hittable: false, name: 'Dee' });
}
const garage = (S) => S.ll(...L.garage);

// 1 ------------------------------------------------------------------------------
async function m1(S) {
  const g = S.g;
  await S.dialog([
    ['Dee', "So you're the new guy my cousin told me about. Fresh off the bus from Indy?"],
    ['Dee', "I run a garage downtown, behind the courthouse. Come see me. Don't make me wait."],
  ]);
  const D = dee(S), G = garage(S);
  await S.goto(D.pos.x, D.pos.z, { r: 6, text: "Go to Dee's Garage in downtown Lafayette", y: undefined });
  D.mode = 'wave';
  const gtSpot = S.curb(G, -1);
  const gt = S.car('gt', gtSpot.x, gtSpot.z, S.roadYaw(G));
  await S.dialog([
    ['Dee', "Welcome to Lafayette. People here think it's a sleepy college town."],
    ['Dee', "It isn't. Now — see that Boilermaker GT? A customer wants it 'tested'."],
    ['Dee', "Take it to Ross-Ade Stadium and back. Three minutes. Not one scratch."],
  ]);
  D.mode = 'idle';
  S.blip(() => gt.pos, '#7fd1ff', 5);
  await S.goto(gt.pos.x, gt.pos.z, { r: 3.5, need: gt, text: 'Get in the Boilermaker GT (F)', noBeam: true });
  S.failIf(() => gt.hp < 45, 'You wrecked the customer\'s car');
  S.timer(180, 'Too slow — Dee is not impressed');
  const R = S.ll(...L.rossade);
  await S.goto(R.x, R.z, { r: 18, need: gt, text: 'Drive to Ross-Ade Stadium' });
  S.say('Dee', 'Nice. Now bring her home.', 2);
  await S.goto(G.x, G.z, { r: 12, need: gt, stop: true, text: "Bring the GT back to Dee's Garage" });
  S.clearTimer();
  await S.dialog([['Dee', `Not bad. ${Math.round(S.time)} seconds and still shiny. You've got a job.`], ['Dee', "Keep your phone on. I'll call."]]);
}

// 2 ------------------------------------------------------------------------------
async function m2(S) {
  const g = S.g;
  await S.dialog([['Dee', "Marco borrowed two grand for 'tuition'. Spent it on rims."], ['Dee', "He hangs around Chauncey Village with his buddies. Get my money."]]);
  const C = S.ll(...L.chauncey), c = S.curb(C, 1);
  const marco = S.actor('man', c.x, c.z, { mode: 'idle', label: 'MARCO', hp: 90, runSpeed: 5.4, look: { head: 'cap' } });
  const b1 = S.actor('man', c.x + 1.6, c.z + 0.8, { mode: 'idle', hostile: true, hp: 80, dmg: 6, look: { head: 'beanie' } });
  const b2 = S.actor('man', c.x - 1.2, c.z + 1.5, { mode: 'idle', hostile: true, hp: 80, dmg: 6 });
  S.blip(() => marco.pos, '#ff3b3b', 6);
  await S.goto(c.x, c.z, { r: 12, text: 'Find Marco in Chauncey Village', noBeam: true });
  await S.say('Marco', "Dee sent YOU? Get him, boys!", 1.6);
  b1.mode = b2.mode = 'fight'; marco.mode = 'flee';
  S.failIf(() => g.player.hp <= 0, 'You got beaten up');
  S.objective('Catch Marco — his friends are coming for you!');
  let lost = 0;
  S.failIf(() => { lost = marco.pos.distanceTo(S.here()) > 180 ? lost + 1 / 60 : 0; return lost > 12; }, 'Marco got away');
  await S.until(() => marco.isDown);
  marco.down = 1e9; marco.setLabel(null);
  await S.say('Marco', 'OK OK! Take it! Tell Dee I\'m sorry!', 2);
  b1.mode = b2.mode = 'flee';
  const cash = S.beam(marco.pos.x, marco.pos.z, { r: 1.2, color: 0x7ee36a, h: 6 });
  await S.goto(marco.pos.x, marco.pos.z, { r: 2.2, need: 'foot', text: 'Grab the cash', noBeam: true });
  cash.remove();
  S.toast('Picked up $2,000 for Dee', 'good');
  if (g.police.wanted) {
    S.objective('Lose the cops');
    await S.until(() => g.police.wanted === 0);
  }
  const G = garage(S);
  await S.goto(G.x, G.z, { r: 10, text: 'Bring the money to Dee' });
  await S.say('Dee', 'All of it? You might be useful after all. Keep a cut.');
}

// 3 ------------------------------------------------------------------------------
async function m3(S) {
  const g = S.g;
  await S.dialog([['Dee', "Got a buyer in Indy for a Riverside Muscle. Red, white stripes."], ['Dee', "There's one parked at Wabash Landing. Its owner has friends. Big ones."]]);
  const W = S.ll(...L.landing), yaw = S.roadYaw(W), spot = S.curb(W, 1);
  const car = S.car('muscle', spot.x, spot.z, yaw);
  const g1 = S.actor('man', spot.x + 3, spot.z + 1, { mode: 'idle', hostile: true, hp: 120, dmg: 9, look: { head: 'cap' } });
  const g2 = S.actor('man', spot.x - 2.5, spot.z + 2, { mode: 'idle', hostile: true, hp: 120, dmg: 9 });
  S.blip(() => car.pos, '#7fd1ff', 6);
  S.failIf(() => car.dead || car.hp < 15, 'The Riverside Muscle got wrecked');
  await S.goto(car.pos.x, car.pos.z, { r: 18, text: 'Head to Wabash Landing', noBeam: true });
  g1.mode = g2.mode = 'fight';
  await S.say('Guard', 'Hey! Get away from that car!', 1.4);
  await S.goto(car.pos.x, car.pos.z, { r: 3, need: car, text: 'Steal the Riverside Muscle (F)', noBeam: true });
  g.police.crime(2, 'Grand theft auto');
  await S.say('Dee', "Cops are on you. Don't bring them to my door — lose them first.", 2.5);
  S.objective('Lose the cops');
  await S.until(() => g.police.wanted === 0);
  const G = garage(S);
  await S.goto(G.x, G.z, { r: 12, need: car, stop: true, text: "Deliver the car to Dee's Garage" });
  await S.say('Dee', 'Beautiful. The buyer will cry when he sees her. Here\'s your share.');
}

// 4 ------------------------------------------------------------------------------
async function m4(S) {
  const g = S.g, w = g.world;
  await S.dialog([['Dee', "A friend dropped a waterproof bag in the Wabash up north. Very valuable."], ['Dee', "Grab a boat at Tapawingo Park and get it before the river police do."]]);
  const [, bz, wx] = g.boatLaunch;
  const boat = S.car('speedboat', wx + 6, bz, g.riverYaw(bz));
  await S.goto(boat.pos.x, boat.pos.z, { r: 5, need: boat, text: 'Get in the speedboat at Tapawingo Park' });
  const iz0 = Math.round((bz - w.minZ) / w.cell);
  const cps = [];
  for (let k = 1; k <= 10; k++) {
    const iz = Math.max(2, iz0 - k * 24), z = w.minZ + iz * w.cell, x = w.riverX[iz];
    if (w.isWater(x, z)) cps.push({ x, z });
  }
  S.timer(cps.length * 13 + 30, 'Someone else got the package');
  S.failIf(() => boat.dead, 'Your boat was destroyed');
  for (let i = 0; i < cps.length; i++) await S.goto(cps[i].x, cps[i].z, { r: 22, need: boat, route: false, text: `Race up the Wabash (${i + 1}/${cps.length})` });
  S.clearTimer();
  S.toast('Got the package!', 'good');
  await S.say('Dee', 'River police heard about it. Get back to Wabash Landing, fast!', 2.4);
  g.police.crime(1, 'Suspicious boating');
  const back = cps[0];
  S.timer(90, 'The river police caught up');
  await S.goto(back.x, back.z, { r: 24, need: boat, route: false, text: 'Bring the package back down the river' });
  S.clearTimer();
  await S.say('Dee', "Don't ask what's in it. Seriously. Don't.");
}

// 5 ------------------------------------------------------------------------------
async function m5(S) {
  const g = S.g, w = g.world;
  await S.dialog([['Dee', "Homecoming weekend. Every street racer in Tippecanoe County is out."], ['Dee', "I put five grand on you. Meet them at Ross-Ade. Don't embarrass me."]]);
  const R = S.ll(...L.rossade), yaw = S.roadYaw(R);
  const myCar = S.car('gt', R.x + Math.cos(yaw) * 2.2, R.z - Math.sin(yaw) * 2.2, yaw);
  await S.goto(myCar.pos.x, myCar.pos.z, { r: 3.5, need: myCar, text: 'Get in your race car at Ross-Ade Stadium' });
  // route: Ross-Ade -> Courthouse -> Columbian Park along the street graph
  const P = S.ll(...L.columbian);
  const path = w.route(w.nearestNode(R.x, R.z), w.nearestNode(P.x, P.z)) || [];
  const cps = []; let acc = 0, last = null;
  for (const n of path) { const q = w.gNodes[n]; if (last) acc += Math.hypot(q[0] - last[0], q[2] - last[2]); last = q; if (acc > 240) { acc = 0; cps.push({ x: q[0], z: q[2] }); } }
  cps.push({ x: P.x, z: P.z });
  const rivals = [['muscle', -1], ['hyper', 1]].map(([id, side], k) => {
    const d = S.aiCar(id, R.x - Math.sin(yaw) * (6 + k * 6) + Math.cos(yaw) * 2.2 * side, R.z - Math.cos(yaw) * (6 + k * 6) - Math.sin(yaw) * 2.2 * side, yaw, { mode: 'goto', cap: 0.86, arrive: 4 });
    d.idx = 0; d.brake = true; return d;
  });
  rivals.forEach((d) => S.blip(() => d.v.pos, '#ff7b00', 5));
  myCar.vel.set(0, 0, 0);
  for (const n of ['3', '2', '1']) { S.big(n, 'Get ready…'); g.audio.chime(false); await S.wait(1); }
  S.big('GO!', 'Race to Columbian Park'); g.audio.chime(true);
  rivals.forEach((d) => { d.brake = false; d.goal = cps[0]; });
  let place = 1;
  const rivalDone = [];
  const steer = () => {
    for (const d of rivals) {
      const cp = cps[d.idx];
      if (!cp) { if (!rivalDone.includes(d)) rivalDone.push(d); d.stopped = true; continue; }
      if (Math.hypot(d.v.pos.x - cp.x, d.v.pos.z - cp.z) < 22) { d.idx++; d.goal = cps[d.idx] || cps[cps.length - 1]; }
      // rubber band: rivals ease off if far ahead, push if behind
      const lead = d.idx - S.cp;
      d.cap = lead > 1 ? 0.72 : lead < -1 ? 1 : 0.88;
      if (d.v.dead) { if (!rivalDone.includes(d)) d.idx = -99; }
    }
  };
  S.cp = 0;
  S.every(steer);
  S.failIf(() => myCar.dead, 'Your race car was destroyed');
  S.failIf(() => rivalDone.length >= 2, 'Both rivals beat you to the finish');
  for (let i = 0; i < cps.length; i++) {
    S.cp = i;
    await S.goto(cps[i].x, cps[i].z, { r: 16, need: myCar, text: `Checkpoint ${i + 1}/${cps.length} — position ${1 + rivals.filter(d => d.idx > i).length}`, });
  }
  place = 1 + rivalDone.length;
  if (place > 1) { S.fail('You finished 2nd — Dee lost her bet'); return; }
  await S.dialog([['Dee', "FIRST PLACE! I knew it! The whole town's going to know your name."], ['Dee', "Go cool off. There's a little gift for you at Ross-Ade."]]);
  const [hx, hz] = g.world.toWorld(40.4318, -86.9180);
  g.spawnVehicle('hyper', hx, hz, 0, false);
}
