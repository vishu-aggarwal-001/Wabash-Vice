// Story mode — Chapter 1: "Wabash Vice". Twelve missions. Your big brother Danny ran a
// garage in downtown Lafayette until a crooked cop framed him for car theft. You arrive broke,
// work for his partner Dee and then for Uncle Vic, the town's godfather, until you can bring
// down Lieutenant Kessler and get Danny out. Start missions from the phone (Tab → Story).
import { Script } from './script.js';

const L = {
  garage: [40.4204, -86.8893], rossade: [40.4347, -86.9184], chauncey: [40.4238, -86.9078],
  landing: [40.4203, -86.8987], columbian: [40.4072, -86.8690], courthouse: [40.4194, -86.8920], union: [40.4245, -86.9110],
  railyard: [40.4135, -86.8862], warehouse: [40.4352, -86.8822], vic: [40.4085, -86.8728], bridge: [40.4199, -86.8962],
  levee: [40.4250, -86.9012], depot: [40.3990, -86.8790], jail: [40.4187, -86.8886], corner: [40.4126, -86.8760],
};

export const CHAPTER = [
  { id: 'm1', title: 'New Life', who: 'Dee', blurb: "Danny's in jail. Meet his partner Dee at the garage and prove you can drive.", pay: 1500, fn: m1 },
  { id: 'c2', title: 'Valuable Cargo', who: 'Dee', blurb: 'A van full of TVs at the rail yard. Get it north of town without breaking them.', pay: 1800, fn: cargo },
  { id: 'c3', title: 'The Godfather', who: 'Uncle Vic', blurb: 'Uncle Vic wants to meet Danny\'s little brother. Do not keep him waiting.', pay: 2000, fn: godfather },
  { id: 'm3', title: 'Hot Wheels', who: 'Dee', blurb: 'A buyer wants the Riverside Muscle parked at Wabash Landing.', pay: 3500, fn: m3 },
  { id: 'c5', title: 'Police Control', who: 'Uncle Vic', blurb: "Kessler's men set up a checkpoint on the Main Street bridge. Get Vic's car across.", pay: 2500, fn: checkpoint },
  { id: 'm2', title: 'Debt', who: 'Uncle Vic', blurb: 'Marco owes Vic two grand. He hangs out in Chauncey Village.', pay: 2000, fn: m2 },
  { id: 'm5', title: 'Fastest Car', who: 'Dee', blurb: 'Win the big Homecoming street race from Ross-Ade to Columbian Park.', pay: 5000, fn: m5 },
  { id: 'm4', title: 'River Run', who: 'Dee', blurb: 'A package is floating down the Wabash. Get it before the river police.', pay: 3000, fn: m4 },
  { id: 'c9', title: 'Traitor', who: 'Uncle Vic', blurb: "Somebody has been talking to Kessler. Vic knows who. Don't let him get away.", pay: 4000, fn: traitor },
  { id: 'c10', title: 'The Party', who: 'Uncle Vic', blurb: "Vic's birthday party. The Northside Crew wasn't invited. They're coming anyway.", pay: 4500, fn: party },
  { id: 'c11', title: 'Escape', who: 'Dee', blurb: 'Kessler is raiding the garage. Get out and lose every cop in Tippecanoe County.', pay: 5000, fn: escape },
  { id: 'c12', title: 'Fuel Deal', who: 'Uncle Vic', blurb: "Steal Kessler's fuel tanker and deliver it to Purdue Airport. This ends tonight.", pay: 10000, fn: fuelDeal },
];

export class Story {
  constructor(g) { this.g = g; this.active = null; g.save.story ||= { done: 0 }; }
  get done() { return this.g.save.story.done; }
  start(i) {
    const g = this.g, M = CHAPTER[i];
    if (this.active) return;
    if (g.contacts?.active) { g.hud.toast('Finish your current job first', 'warn'); return; }
    if (g.jobs.active) g.jobs.end(true);
    if (i > this.done) { g.hud.toast('Finish the earlier missions first', 'warn'); return; }
    g.missions.cancel();
    g.hud.big(M.title.toUpperCase(), `Chapter 1 · Mission ${i + 1}/${CHAPTER.length}`);
    this.active = new Script(g, M.title, (S) => M.fn(S, this), {
      color: '#ffd23f',
      onEnd: (ok, msg) => {
        this.active = null;
        if (ok) {
          const pay = Math.round(M.pay * g.prog.payMult);
          g.addMoney(pay); g.karma(-2); g.prog.add(150 + i * 25);
          if (i >= this.done) g.save.story.done = i + 1;
          g.hud.big('MISSION PASSED', `${M.title}  •  +$${pay.toLocaleString()}  •  +${150 + i * 25} XP`, 'pass');
          g.audio.chime(true);
          if (i + 1 === CHAPTER.length) setTimeout(() => g.hud.big('CHAPTER 1 COMPLETE', 'Danny is free. The Golden Train Hypercar is waiting at Ross-Ade. Jobs, races and the tune shop are all still open.', 'pass'), 4000);
          else setTimeout(() => { g.audio.ring(); g.hud.toast(`📱 ${CHAPTER[i + 1].who}: "${CHAPTER[i + 1].blurb}" (Tab → Story)`, 'good'); }, 5000);
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

// Uncle Vic holds court outside his supper club by Columbian Park, his enforcer Bogdan beside him
function vic(S) {
  const p = S.curb(S.ll(...L.vic), 1);
  const v = S.actor('man', p.x, p.z, { mode: 'idle', label: 'UNCLE VIC', labelColor: '#ffd23f', hittable: false, name: 'Vic', look: { template: 'm_business', vary: false } });
  S.actor('man', p.x + 1.4, p.z + 0.6, { mode: 'idle', hittable: false, look: { template: 'm_leather', vary: false } });
  return v;
}
const thug = (S, x, z, o = {}) => S.actor('man', x, z, { mode: 'idle', hostile: true, hp: 100, dmg: 8, look: { template: ['m_tracksuit', 'm_tattoo', 'm_hoodie'][Math.floor(Math.random() * 3)] }, ...o });
async function loseCops(S, text = 'Lose the cops') {
  if (!S.g.police.wanted) return;
  S.objective(text);
  await S.until(() => S.g.police.wanted === 0);
}

// 1 ------------------------------------------------------------------------------
async function m1(S) {
  const g = S.g;
  await S.dialog([
    ['Dee', "You're Danny's little brother? You look like him. Same stupid haircut."],
    ['Dee', "They arrested Danny last week. Stolen cars, they say. Danny never stole a thing in his life."],
    ['Dee', "Bail is fifty grand and you're broke. Come to the garage behind the courthouse. We'll find you work."],
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
  await S.dialog([['Dee', `Not bad. ${Math.round(S.time)} seconds and still shiny. You drive like Danny.`], ['Dee', "The cop who arrested him is a lieutenant called Kessler. Remember that name."], ['Dee', "Keep your phone on. I'll call."]]);
}

// 2 ------------------------------------------------------------------------------
async function m2(S) {
  const g = S.g;
  await S.dialog([['Uncle Vic', "Marco borrowed two thousand from me for 'tuition'. He spent it on rims."], ['Uncle Vic', "He hangs around Chauncey Village with his friends. Bring me my money."]]);
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
  await S.goto(G.x, G.z, { r: 10, text: 'Drop the money at Dee\'s Garage for Vic' });
  await S.say('Dee', 'All of it? Vic will like that. Keep a cut.');
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
  // the launch already has a speedboat moored: use it rather than stacking a second one on top
  const boat = g.parked.find(v => v.type === 'boat' && !v.dead && Math.hypot(v.pos.x - (wx + 6), v.pos.z - bz) < 8) || S.car('speedboat', wx + 6, bz, g.riverYaw(bz));
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
  const rivals = [['muscle', -1], ['pony', 1]].map(([id, side], k) => {
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
      d.cap = lead > 0 ? 0.7 : lead < -1 ? 1 : 0.86;
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
  await S.dialog([['Dee', "FIRST PLACE! I knew it! The whole town's going to know your name."], ['Dee', "That's five grand closer to Danny's bail. Go cool off."]]);
}

// 2 ------------------------------------------------------------------------------ Valuable Cargo
async function cargo(S) {
  const g = S.g;
  await S.dialog([['Dee', "Danny's old friends have a van at the rail yard. Forty TVs, no paperwork."], ['Dee', "Drive it to the warehouse north of town. Every bump breaks a TV, and every broken TV comes out of your pay."]]);
  const Y = S.ll(...L.railyard), spot = S.curb(Y, 1);
  const van = S.car('van', spot.x, spot.z, S.roadYaw(Y), { color: 0xeeeeea });
  S.blip(() => van.pos, '#7fd1ff', 6);
  await S.goto(van.pos.x, van.pos.z, { r: 3.5, need: van, text: 'Get in the van at the rail yard', noBeam: true });
  const hp0 = van.hp;
  let cargo = 100;
  S.every(() => { cargo = Math.max(0, Math.min(cargo, 100 - (hp0 - van.hp) * 2.2)); });
  S.failIf(() => cargo < 35, 'Too many TVs broke — the buyer walked');
  S.failIf(() => van.dead, 'The van was wrecked');
  const W = S.ll(...L.warehouse);
  S.timer(240, 'The buyer got tired of waiting');
  await S.goto(W.x, W.z, { r: 12, need: van, stop: true, text: () => `Deliver the TVs to the warehouse — cargo ${Math.round(cargo)}%` });
  S.objective(`Delivered — ${Math.round(cargo)}% of the TVs survived`);
  S.clearTimer();
  await loseCops(S);
  S.payBonus = Math.round(cargo * 6);
  g.addMoney(S.payBonus);
  await S.say('Dee', cargo > 85 ? 'Not one cracked screen. Danny would be proud.' : 'Some of them still work. Good enough.', 2.2);
  await S.say('Dee', "Somebody important heard about you. Uncle Vic. He'll call.", 2.4);
}

// 3 ------------------------------------------------------------------------------ The Godfather
async function godfather(S) {
  const g = S.g;
  await S.dialog([['Uncle Vic', "So. Danny's little brother. Come to my club by Columbian Park. We talk face to face."]]);
  const V = vic(S);
  await S.goto(V.pos.x, V.pos.z, { r: 5, need: 'foot', text: "Meet Uncle Vic at his supper club (on foot)" });
  await S.dialog([
    ['Uncle Vic', "Your brother fixed my cars for ten years. Honest man. Too honest for this town."],
    ['Uncle Vic', "Two punks from the Northside Crew are selling on my corner on Ferry Street. Teach them manners."],
    ['Uncle Vic', "Here. Take Bogdan's bat. Bring it back clean."],
  ]);
  if (!g.save.weapons.includes('bat')) g.save.weapons.push('bat');
  g.pawn.equip('bat'); S.toast('🏏 You got a baseball bat (Z switches weapons)', 'good');
  const C = S.ll(...L.corner), c = S.curb(C, 1);
  const a = thug(S, c.x, c.z, { label: 'NORTHSIDE' }), b = thug(S, c.x + 1.5, c.z + 0.8);
  S.blip(() => a.pos, '#ff3b3b', 5); S.blip(() => b.pos, '#ff3b3b', 5);
  await S.goto(c.x, c.z, { r: 14, text: 'Find the Northside dealers on the corner', noBeam: true });
  a.mode = b.mode = 'fight';
  await S.say('Dealer', "This is Northside now, grandpa's errand boy!", 1.6);
  S.failIf(() => g.player.hp <= 0, 'You got beaten up');
  S.objective('Beat up both dealers');
  await S.until(() => a.isDown && b.isDown);
  a.down = b.down = 1e9;
  await loseCops(S);
  await S.goto(V.pos.x, V.pos.z, { r: 5, need: 'foot', text: 'Go back to Uncle Vic' });
  await S.dialog([
    ['Uncle Vic', "Good. Quiet, quick. I like you."],
    ['Uncle Vic', "Now listen. The cop who put Danny away — Kessler — he takes stolen cars himself. Danny saw too much."],
    ['Uncle Vic', "You work for me, I help you get your brother out. Deal?"],
  ]);
}

// 5 ------------------------------------------------------------------------------ Police Control
async function checkpoint(S) {
  const g = S.g;
  await S.dialog([['Uncle Vic', "Kessler's boys put a 'checkpoint' on the Main Street bridge. Checkpoint for my money, I think."], ['Uncle Vic', "My Luxury is at the courthouse, trunk full. Drive it across to my club. Pay them or don't. Your choice."]]);
  const H = S.ll(...L.courthouse), sp = S.curb(H, 1);
  const car = S.car('luxury', sp.x, sp.z, S.roadYaw(H));
  S.blip(() => car.pos, '#7fd1ff', 6);
  S.failIf(() => car.dead, "Vic's car was destroyed");
  await S.goto(car.pos.x, car.pos.z, { r: 3.5, need: car, text: "Get in Vic's Prophetstown Luxury", noBeam: true });
  const B = S.ll(...L.bridge), yaw = S.roadYaw(B);
  const cr = S.car('police', B.x + Math.cos(yaw) * 2.4, B.z - Math.sin(yaw) * 2.4, yaw + Math.PI / 2); cr.sirenOn = true;
  const c1 = S.actor('cop', B.x - Math.cos(yaw) * 3.5, B.z + Math.sin(yaw) * 3.5, { mode: 'wave', hittable: false });
  S.actor('cop', B.x + Math.cos(yaw) * 5, B.z - Math.sin(yaw) * 5, { mode: 'idle', hittable: false });
  await S.goto(B.x, B.z, { r: 14, need: car, stop: true, text: 'Drive to the police checkpoint on the bridge' });
  await S.say('Officer', "Evening. Lieutenant Kessler says this car pays a 'bridge fee'. Five hundred. Or we search the trunk.", 3.2);
  const pick = await S.choose('Pay the $500 bribe?', 'Pay them', 'Floor it');
  if (pick === 0 && g.money >= 500) {
    g.addMoney(-500); S.toast('Paid the bribe  −$500', 'warn');
    await S.say('Officer', 'Pleasure doing business. Drive safe.', 1.8);
  } else {
    if (pick === 0) await S.say('You', "...I don't have it. Hold on to your hats.", 1.6);
    else await S.say('You', 'Search this!', 1.2);
    c1.mode = 'flee';
    g.police.crime(3, 'Ran a police checkpoint');
    await loseCops(S, 'Lose the cops — roadblocks are going up!');
  }
  const V = S.ll(...L.vic);
  await S.goto(V.x, V.z, { r: 12, need: car, stop: true, text: "Deliver Vic's car to his club" });
  await S.say('Uncle Vic', pick === 0 ? 'Five hundred to Kessler. I remember every dollar he takes from me.' : 'You ran his checkpoint? Ha! Kessler will be furious. Good.', 2.6);
}

// 9 ------------------------------------------------------------------------------ Traitor
async function traitor(S) {
  const g = S.g;
  await S.dialog([['Uncle Vic', "Kessler knows things only my people know. Somebody talks."], ['Uncle Vic', "It's Marco. He meets Kessler at the Levee. He's there now, in a yellow pony car. Bring him to me."]]);
  const Lv = S.ll(...L.levee), yaw = S.roadYaw(Lv);
  const D = S.aiCar('pony', Lv.x, Lv.z, yaw, { mode: 'wander', cap: 0.7, color: 0xf2c014 });
  S.blip(() => D.v.pos, '#ff3b3b', 6);
  await S.goto(D.v.pos.x, D.v.pos.z, { r: 45, text: 'Find Marco at the Levee', noBeam: true, route: true });
  D.mode = 'flee'; D.cap = 0.85;
  await S.say('Marco', "Oh no. No no no!", 1.2);
  let lost = 0;
  S.failIf(() => { lost = D.v.pos.distanceTo(S.here()) > 420 ? lost + 1 / 60 : 0; return lost > 9; }, 'Marco got away');
  S.timer(240, 'Marco got away');
  S.objective(() => `Ram Marco's car until it stops (${Math.max(0, Math.round(D.v.hp))}%)`);
  await S.until(() => D.v.hp < 45 || D.v.dead);
  D.stopped = true; S.clearTimer();
  const out = S.curb({ x: D.v.pos.x, z: D.v.pos.z, y: D.v.pos.y }, 1);
  const marco = S.actor('man', out.x, out.z, { mode: 'flee', hp: 70, label: 'MARCO', runSpeed: 5.3, look: { head: 'cap' } });
  S.objective('Marco bailed! Knock him down');
  S.failIf(() => marco.pos.distanceTo(g.player.pos) > 160 && !g.vehicle, 'Marco got away');
  await S.until(() => marco.isDown);
  marco.down = 1e9;
  await S.dialog([
    ['Marco', "OK! OK! Kessler made me! He steals the cars himself and sells them in Chicago."],
    ['Marco', "Danny found his garage full of them. So Kessler put Danny in jail. He keeps a ledger, everything is in it!"],
    ['You', "Where's the ledger?"],
    ['Marco', "In his tanker! He runs stolen jet fuel to the airport. The ledger rides with the money. I swear!"],
  ]);
  marco.setLabel(null);
  await loseCops(S);
}

// 10 ----------------------------------------------------------------------------- The Party
async function party(S) {
  const g = S.g;
  await S.dialog([['Uncle Vic', "Sixty-five years old tonight. Come to the club. Eat, drink, wear something nice."]]);
  const V = vic(S); V.hittable = true; V.hp = 100;
  const guests = [];
  for (let k = 0; k < 4; k++) { const c = S.curb(S.ll(...L.vic), k % 2 ? -1 : 1); guests.push(S.actor(k % 2 ? 'woman' : 'man', c.x + k * 1.3 - 2, c.z + 1.5, { mode: 'idle' })); }
  await S.goto(V.pos.x, V.pos.z, { r: 7, need: 'foot', text: "Go to Vic's birthday party at his club" });
  await S.say('Uncle Vic', 'There he is! The boy who drives like a devil!', 1.8);
  await S.say('Guest', 'Vic! Car coming — those are Northside guys!', 1.8);
  for (const q of guests) q.mode = 'flee';
  S.failIf(() => V.hp <= 0, 'Uncle Vic was beaten down');
  S.failIf(() => g.player.hp <= 0, 'You got knocked out');
  const spawnWave = (n, boss) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const c = S.curb(S.ll(...L.vic), -1);
      const t = thug(S, c.x + k * 1.6, c.z + 6 + k, boss && k === 0 ? { label: 'ROCCO', hp: 220, dmg: 12, look: { template: 'm_viking' } } : {});
      t.mode = 'goto'; t.target = V.pos; out.push(t);
    }
    return out;
  };
  const fight = (crew) => S.every((dt) => {
    for (const t of crew) {
      if (t.isDown) continue;
      const dP = t.pos.distanceTo(g.player.pos), dV = t.pos.distanceTo(V.pos);
      if (dP < 4.5) t.mode = 'fight';
      else if (t.mode !== 'fight') { t.mode = 'goto'; t.target = V.pos; }
      if (dV < 1.9 && t.mode !== 'fight') V.hp -= 7 * dt;
    }
  });
  const w1 = spawnWave(3); fight(w1);
  S.objective(() => `Protect Uncle Vic (${Math.max(0, Math.round(V.hp))}%) — beat the Northside Crew`);
  await S.until(() => w1.every(t => t.isDown));
  w1.forEach(t => { t.down = 1e9; });
  await S.say('Uncle Vic', 'More of them! And that is Rocco himself!', 1.8);
  const w2 = spawnWave(3, true); fight(w2);
  await S.until(() => w2.every(t => t.isDown));
  w2.forEach(t => { t.down = 1e9; });
  await loseCops(S);
  await S.goto(V.pos.x, V.pos.z, { r: 5, need: 'foot', text: 'Check on Uncle Vic' });
  await S.dialog([['Uncle Vic', "Best birthday present in years. Rocco won't walk straight till spring."], ['Uncle Vic', "Now we finish Kessler. Wait for my call."]]);
}

// 11 ----------------------------------------------------------------------------- Escape
async function escape(S) {
  const g = S.g;
  await S.dialog([['Dee', "Get to the garage, now! Kessler knows about Marco. He's coming with everything!"]]);
  const D = dee(S), G = garage(S);
  await S.goto(D.pos.x, D.pos.z, { r: 7, text: "Get to Dee's Garage" });
  const sp = S.curb(G, -1);
  const car = S.car(g.save.myCar?.id || 'gt', sp.x, sp.z, S.roadYaw(G), g.save.myCar ? { color: g.save.myCar.tune?.color, tune: g.save.myCar.tune } : {});
  await S.say('Dee', "Sirens! Take the car and run. I'll hide in the back. GO!", 2);
  D.mode = 'flee';
  g.police.crime(4, 'Wanted by Lt. Kessler');
  S.blip(() => car.pos, '#7fd1ff', 6);
  S.timer(300, 'Kessler caught you');
  S.failIf(() => g.player.hp <= 0, 'Kessler caught you');
  await S.goto(car.pos.x, car.pos.z, { r: 3.5, need: car, text: 'Get in the car', noBeam: true });
  await loseCops(S, 'Lose the cops — watch out for roadblocks!');
  S.clearTimer();
  const C = S.ll(40.4093, -86.8839);
  await S.goto(C.x, C.z, { r: 10, need: 'car', stop: true, text: "Hide at Vic's chop shop" });
  await S.dialog([['Dee', "We made it. My garage is gone, but we're alive."], ['Dee', "Vic called. The tanker moves tonight. This is it."]]);
}

// 12 ----------------------------------------------------------------------------- Fuel Deal
async function fuelDeal(S) {
  const g = S.g;
  await S.dialog([
    ['Uncle Vic', "Kessler's tanker sits at the fuel depot south of town. The ledger is in the cab."],
    ['Uncle Vic', "Take the whole tanker to Purdue Airport. A federal agent waits there — my old friend. She takes the ledger, Kessler goes away."],
    ['Uncle Vic', "Tankers explode, by the way. Drive like your grandmother is in the back."],
  ]);
  const P = S.ll(...L.depot), yaw = S.roadYaw(P), sp = S.curb(P, 1);
  const tk = S.car('tanker', sp.x, sp.z, yaw);
  const gs = [thug(S, sp.x + 3, sp.z + 2, { label: 'GUARD', look: { template: 'm_leather' } }), thug(S, sp.x - 3, sp.z + 3, { look: { template: 'm_worker' } })];
  S.blip(() => tk.pos, '#7fd1ff', 7);
  S.failIf(() => tk.dead || tk.hp <= 22, 'The tanker blew up');
  await S.goto(tk.pos.x, tk.pos.z, { r: 22, text: 'Go to the fuel depot', noBeam: true });
  gs.forEach(t => { t.mode = 'fight'; });
  await S.say('Guard', "Nobody touches the lieutenant's truck!", 1.4);
  await S.goto(tk.pos.x, tk.pos.z, { r: 4, need: tk, text: 'Steal the Fuel Tanker (F)', noBeam: true });
  g.police.crime(2, 'Stole a fuel tanker');
  S.say('Uncle Vic', 'Kessler knows. Every cop in town is after that truck. Go!', 2.2);
  const A = { x: g.airportCenter[0], z: g.airportCenter[1] };
  const a = S.node(A.x, A.z);
  S.timer(360, 'Kessler got the ledger back');
  await S.goto(a.x, a.z, { r: 30, need: tk, stop: true, text: () => `Deliver the tanker to Purdue Airport (tank ${Math.round(tk.hp)}%)` });
  S.clearTimer();
  g.police.clear();
  const ag = S.curb(a, 1);
  S.actor('woman', ag.x, ag.z, { mode: 'wave', label: 'AGENT HOLLIS', labelColor: '#7fd1ff', hittable: false, look: { template: 'f_sport' } });
  await S.dialog([
    ['Agent Hollis', "Federal agent. Vic said you'd be here. Is that the ledger? ...It's all here. Cars, fuel, the frame-up."],
    ['Agent Hollis', "Lieutenant Kessler is being arrested as we speak. And your brother's charges are dropped."],
  ]);
  await S.wait(0.5);
  const J = S.ll(...L.jail), jp = S.curb(J, 1);
  const danny = S.actor('man', jp.x, jp.z, { mode: 'wave', label: 'DANNY', labelColor: '#7ddc6a', hittable: false, look: { template: 'm_denim' } });
  S.blip(() => danny.pos, '#7ddc6a', 6);
  // "pick up" means drive up: stopping beside him in any vehicle counts, and so does walking up
  await S.goto(danny.pos.x, danny.pos.z, { r: 8, stop: true, text: 'Pick Danny up outside the county jail' });
  await S.dialog([
    ['Danny', "Little brother! Look at you. They told me what you did."],
    ['Danny', "Kessler in a cell, Vic owing you favours, half the town knowing your name... Lafayette, huh?"],
    ['Danny', "Come on. Dee's rebuilding the garage. We've got work to do."],
  ]);
  const [hx, hz] = g.world.toWorld(40.4318, -86.9180);
  if (!g.parked.some(v => v.spec.id === 'hyper' && Math.hypot(v.pos.x - hx, v.pos.z - hz) < 10)) g.spawnVehicle('hyper', hx, hz, 0, false);
}
