// Jobs, Criminal-Russia style: start a shift from the phone, get a work vehicle and
// uniform, then answer an endless stream of calls. Every call earns cash and XP;
// XP raises your rank, and higher ranks pay more.
import * as THREE from 'three';
import { Script } from './script.js';

export const JOBS = {
  police: {
    name: 'Police Work', sub: 'Calls from Dispatcher', veh: 'police', outfit: 'cop', icon: '🚓', color: '#2f6fd6', karma: 2,
    desc: 'Answer dispatcher calls: road accidents, speeders, fleeing thieves and street fights.',
    ranks: [['Rookie', 0], ['Officer', 4], ['Detective', 10], ['Sergeant', 20], ['Lieutenant', 35], ['Captain', 55], ['Chief of Police', 85]],
  },
  taxi: {
    name: 'Taxi Driver', sub: 'Fares', veh: 'taxi', outfit: null, icon: '🚕', color: '#e0a800', karma: 1,
    desc: 'Pick up passengers all over West Lafayette & Lafayette and get them there fast.',
    ranks: [['New Driver', 0], ['Cabbie', 5], ['Pro Cabbie', 14], ['Night Owl', 28], ['Road Legend', 50]],
  },
  medic: {
    name: 'Paramedic', sub: 'Emergency calls', veh: 'ambulance', outfit: 'medic', icon: '🚑', color: '#d0302a', karma: 3,
    desc: 'Race to injured people, load them up and rush them to hospital.',
    ranks: [['Trainee', 0], ['EMT', 4], ['Paramedic', 12], ['Senior Medic', 25], ['Chief Medic', 45]],
  },
  delivery: {
    name: 'Boiler Express', sub: 'Parcels', veh: 'truck', outfit: null, icon: '📦', color: '#c47a1a', karma: 1,
    desc: 'Drive the delivery truck to drop-offs across town before the clock runs out.',
    ranks: [['Courier', 0], ['Driver', 5], ['Senior Driver', 14], ['Route Boss', 30], ['Logistics King', 55]],
  },
  bus: {
    name: 'CityBus Driver', sub: 'Route stops', veh: 'bus', outfit: null, icon: '🚌', color: '#1e5aa8', karma: 1,
    desc: 'Drive the CityBus route: stop at each bus stop, let people on and off, keep to the timetable.',
    ranks: [['Trainee', 0], ['Driver', 4], ['Route Driver', 12], ['Senior Driver', 25], ['Depot Legend', 45]],
  },
  fire: {
    name: 'Firefighter', sub: 'Fire calls', veh: 'fire', outfit: null, icon: '🚒', color: '#e2330f', karma: 3,
    desc: 'Race the engine to fires, park up and the water cannon locks onto the flames. Put every fire out.',
    ranks: [['Probie', 0], ['Firefighter', 4], ['Engineer', 12], ['Captain', 25], ['Fire Chief', 45]],
  },
  chop: {
    name: "Vic's Chop Shop", sub: 'Car orders', veh: null, outfit: null, icon: '🔧', color: '#8a8f98', karma: -2, crime: true,
    desc: 'Uncle Vic wants particular cars. Find the one on order, steal it and get it to the chop shop in one piece.',
    ranks: [['Joyrider', 0], ['Car Thief', 4], ['Booster', 12], ['Ghost', 25], ['Gone in 60', 45]],
  },
};
const HOSPITALS = [['Franciscan Health Lafayette Central', 40.4146, -86.8787], ['Purdue Student Health Center', 40.4279, -86.9178]];

export class Jobs {
  constructor(g) {
    this.g = g; this.active = null; this.call = null; this.wait = 0; this.earned = 0; this.calls = 0;
    g.save.jobs ||= {};
  }
  stats(id) { return (this.g.save.jobs[id] ||= { xp: 0, earned: 0 }); }
  rank(id) {
    const r = JOBS[id].ranks, xp = this.stats(id).xp;
    let i = 0; while (i + 1 < r.length && xp >= r[i + 1][1]) i++;
    return { i, name: r[i][0], next: r[i + 1]?.[1] ?? null, xp };
  }
  mult(id) { return 1 + this.rank(id).i * 0.15; }

  start(id) {
    const g = this.g, J = JOBS[id];
    if (this.active) this.end(true);
    if (g.story.active) { g.hud.toast('Finish your story mission first', 'warn'); return; }
    if (g.police.wanted > 0) { g.hud.toast('Lose the cops before you start work', 'warn'); return; }
    this.active = id; this.earned = 0; this.calls = 0; this.wait = 3;
    // work vehicle at the curb next to you
    if (!J.veh) this.vehicle = null;
    else if (!g.vehicle || g.vehicle.spec.id !== J.veh) {
      if (g.vehicle) g.exitVehicle(true);
      const S = new Script(g, 'tmp', () => {});
      const n = S.node(g.player.pos.x, g.player.pos.z);
      const yaw = S.roadYaw(n);
      const res = g.world.collide(n.x + Math.cos(yaw) * 2, n.z - Math.sin(yaw) * 2, 1.2, n.y + 0.3, n.y + 2);
      const v = g.spawnVehicle(J.veh, res.x, res.z, yaw, false);
      v.workVehicle = id;
      this.vehicle = v;
    } else this.vehicle = g.vehicle;
    if (J.outfit) g.player.setOutfit(g.people, J.outfit);
    g.hud.big(J.name, `${this.rank(id).name} · ${this.vehicle ? `your ${this.vehicle.spec.name} is waiting` : 'wait for the phone to ring'}. Press X to end your shift.`);
    g.audio.chime(true);
  }

  end(quiet = false) {
    const g = this.g, id = this.active;
    if (!id) return;
    if (this.call) { const c = this.call; this.call = null; c.fail('Shift ended'); }
    this.active = null;
    g.player.setOutfit(g.people, 'player');
    if (!quiet) g.hud.big('SHIFT OVER', `${JOBS[id].name}: ${this.calls} call${this.calls === 1 ? '' : 's'} · earned $${this.earned.toLocaleString()}`, 'pass');
    g.persist();
  }

  update(dt) {
    if (!this.active) return;
    const g = this.g;
    if (g.input && g.lastPressed?.has('endjob')) { this.end(); return; }
    if (!this.call) {
      this.wait -= dt;
      g.hud.job(this.active, this.rank(this.active), this.earned, 'Waiting for a call…', '');
      if (this.wait <= 0 && g.deathT <= 0) this.newCall();
    }
  }

  newCall() {
    const g = this.g, id = this.active;
    const pool = {
      police: [['ROAD ACCIDENT', policeAccident], ['SPEEDING CAR', policeSpeeder], ['THIEF ON THE RUN', policeThief], ['STREET FIGHT', policeBrawl], ['STOLEN CAR', policeStolen]],
      taxi: [['FARE', taxiFare]], medic: [['INJURED PERSON', medicCall]], delivery: [['PARCEL RUN', deliveryRun]],
      bus: [['BUS ROUTE', busRoute]], fire: [['HOUSE FIRE', fireCall], ['CAR FIRE', fireCall], ['DUMPSTER FIRE', fireCall]], chop: [['CAR ORDER', chopOrder]],
    }[id];
    const r = this.rank(id).i;
    // early ranks don't get the hardest police calls
    const avail = id === 'police' && r < 1 ? pool.slice(0, 3) : pool;
    const [title, fn] = avail[Math.floor(Math.random() * avail.length)];
    g.audio.ring(); g.audio.radioChirp();
    const J = JOBS[id];
    const S = new Script(g, title, (S) => fn(S, this, id), {
      onEnd: (ok, msg) => {
        if (this.call !== S) return;
        this.call = null; this.wait = 5 + Math.random() * 6;
        if (ok) {
          const pay = Math.round((S.payout || 200) * this.mult(id) * g.prog.payMult);
          g.prog.add(30);
          const before = this.rank(id).i;
          g.addMoney(pay); this.earned += pay; this.calls++;
          const st = this.stats(id); st.xp += 1; st.earned += pay;
          g.karma(J.karma);
          g.hud.big('CALL COMPLETE', `${S.result || title}  •  +$${pay.toLocaleString()}`, 'pass');
          g.audio.chime(true);
          const after = this.rank(id);
          if (after.i > before) setTimeout(() => { g.hud.big('PROMOTED!', `You're now ${after.name}. Calls pay ${Math.round((this.mult(id) - 1) * 100)}% more.`, 'pass'); g.audio.chime(true); }, 3400);
          g.persist();
        } else {
          g.hud.big('CALL FAILED', msg || '', 'fail'); g.audio.chime(false);
        }
      },
    });
    S.jobTitle = title; S.state = '';
    this.call = S;
    S.start();
  }
}

// ---------------------------------------------------------------- shared helpers
function panel(S, jobs, id, state) { S.state = state; jobs.g.hud.job(id, jobs.rank(id), jobs.earned, S.jobTitle, state); }
function travelTime(S, p, extra = 25) { const d = Math.hypot(p.x - S.here().x, p.z - S.here().z); return Math.round(d * 1.35 / 14 + extra); }
// wait until the player has stood (on foot) within r of a point for `secs`
async function holdNear(S, getPos, r, secs, label) {
  let t = 0;
  await S.until(() => {
    const P = getPos(), g = S.g;
    const near = !g.vehicle && Math.hypot(g.player.pos.x - P.x, g.player.pos.z - P.z) < r;
    t = near ? t + (g.lastDt || 1 / 60) : Math.max(0, t - 0.03);
    S.objective(near ? `${label}  ${Math.min(100, Math.round(t / secs * 100))}%` : S.obj0);
    return t >= secs;
  });
}
function keepPanel(S, jobs, id) {
  const tick = () => { if (!S.dead) { jobs.g.hud.job(id, jobs.rank(id), jobs.earned, S.jobTitle, S.state); requestAnimationFrame(tick); } };
  tick();
}
function nearestLabel(g, p) {
  let best = null, bd = 1e9;
  for (const l of g.world.map.labels) { const d = Math.hypot(l[1] - p.x, l[2] - p.z); if (d < bd) { bd = d; best = l[0]; } }
  return bd < 160 ? best : g.world.roadNameAt(p.x, p.z) || g.world.districtAt(p.x, p.z);
}

// ---------------------------------------------------------------- police calls
async function policeAccident(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, p = S.somewhere(250, 700), yaw = S.roadYaw(p);
  const where = nearestLabel(g, p);
  await S.say('Dispatch', `All units, 10-50 at ${where}. Two vehicles involved, one person hurt.`);
  const a = S.car(['sedan', 'hatch', 'suv'][Math.floor(Math.random() * 3)], p.x + Math.sin(yaw) * 3, p.z + Math.cos(yaw) * 3, yaw + 0.6);
  const b = S.car(['pickup', 'sedan', 'taxi'][Math.floor(Math.random() * 3)], p.x - Math.sin(yaw) * 2.5 + Math.cos(yaw) * 1.5, p.z - Math.cos(yaw) * 2.5 - Math.sin(yaw) * 1.5, yaw - 2.1);
  a.hp = 28; b.hp = 35; a.noExplode = b.noExplode = true;
  const c = S.curb(p, 1);
  const hurt = S.actor('man', c.x, c.z, { mode: 'lying', label: 'INJURED', labelColor: '#ffd23f' });
  const w = S.curb(p, -1); S.actor('woman', w.x, w.z, { mode: 'wave' });
  S.timer(travelTime(S, p), 'You took too long to respond');
  panel(S, jobs, id, 'Respond — lights & siren (K)');
  await S.goto(p, { r: 20, text: `Respond to the accident at ${where}` });
  S.clearTimer();
  panel(S, jobs, id, 'Secure the scene');
  await S.say('You', 'Dispatch, on scene. Securing it now.', 2);
  S.obj0 = 'Get out and check on the injured person';
  S.objective(S.obj0);
  await holdNear(S, () => hurt.pos, 3, 3, 'Securing the scene');
  hurt.setLabel(null);
  await S.say('Dispatch', 'Copy that. Paramedics en route. Good work, officer.');
  S.payout = 260; S.result = 'Accident scene secured';
}

async function policeSpeeder(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, p = S.somewhere(150, 380), yaw = S.roadYaw(p);
  const ids = ['gt', 'muscle', 'hyper', 'sportbike'];
  const vid = ids[Math.floor(Math.random() * ids.length)];
  const D = S.aiCar(vid, p.x, p.z, yaw, { mode: 'wander', cap: 0.9 });
  D.v.mesh.userData.label = 'SPEEDER';
  await S.say('Dispatch', `Speeding ${D.v.spec.name} reported nearby. Pull it over.`);
  S.blip(() => D.v.pos, '#ff3b3b', 6);
  panel(S, jobs, id, 'Chase it — get close with the siren on');
  let pressure = 0, lost = 0;
  S.failIf(() => { const d = D.v.pos.distanceTo(S.here()); lost = d > 420 ? lost + 1 / 60 : 0; return lost > 8; }, 'The speeder got away');
  S.timer(180, 'The speeder got away');
  S.objective(() => `Pull over the ${D.v.spec.name}  ${'▮'.repeat(Math.round(pressure))}${'▯'.repeat(6 - Math.round(pressure))}`);
  await S.until(() => {
    const v = g.vehicle, d = D.v.pos.distanceTo(S.here());
    if (v && d < 16) pressure += (v.sirenOn ? 1.2 : 0.6) / 60;
    else pressure = Math.max(0, pressure - 0.2 / 60);
    return pressure >= 6 || D.v.hp < 55;
  });
  D.stopped = true; D.v.vel.multiplyScalar(0.3);
  S.clearTimer();
  await S.say('You', 'Pull over! Hands where I can see them!', 2);
  panel(S, jobs, id, 'Write the ticket');
  await S.goto(D.v.pos.x, D.v.pos.z, { r: 4.5, need: 'foot', text: 'Get out and walk up to the driver', noBeam: true });
  S.payout = 220 + Math.round(Math.max(0, 180 - S.time)); S.result = 'Speeder ticketed';
}

async function policeThief(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, p = S.somewhere(220, 550), c = S.curb(p, Math.random() < 0.5 ? 1 : -1);
  const where = nearestLabel(g, p);
  await S.say('Dispatch', `Purse snatcher near ${where}. Male, dark clothes. Bring him in.`);
  const thief = S.actor('man', c.x, c.z, { mode: 'idle', label: 'SUSPECT', runSpeed: 5.2 + Math.random() * 0.6, hp: 70, look: { head: 'beanie' } });
  S.blip(() => thief.pos, '#ff3b3b', 5);
  S.timer(travelTime(S, p, 40), 'The suspect left the area');
  panel(S, jobs, id, 'Find the suspect');
  await S.goto(c.x, c.z, { r: 30, text: `Find the suspect near ${where}`, noBeam: true });
  S.clearTimer();
  thief.mode = 'flee';
  await S.say('Suspect', 'Oh no, cops!', 1.2);
  panel(S, jobs, id, 'Chase him down!');
  let lost = 0;
  S.failIf(() => { lost = thief.pos.distanceTo(g.player.pos) > 140 && !g.vehicle || thief.pos.distanceTo(S.here()) > 220 ? lost + 1 / 60 : 0; return lost > 10; }, 'The suspect got away');
  setTimeout(() => { thief.tired = true; }, 25000);
  S.objective('Catch the suspect: punch, kick or tackle him (Q / E)');
  await S.until(() => thief.isDown);
  thief.down = 1e9;
  panel(S, jobs, id, 'Cuff him');
  S.obj0 = 'Stand next to the suspect to cuff him';
  S.objective(S.obj0);
  await holdNear(S, () => thief.pos, 2.4, 1.2, 'Cuffing');
  thief.setLabel('ARRESTED', '#7ddc6a');
  S.payout = 330; S.result = 'Suspect arrested';
  await S.wait(1);
}

async function policeBrawl(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, p = S.somewhere(200, 600), c = S.curb(p, 1);
  const where = nearestLabel(g, p);
  await S.say('Dispatch', `Fight in progress at ${where}. Break it up.`);
  const thug = S.actor('man', c.x, c.z, { mode: 'idle', hostile: true, hp: 110, dmg: 8, label: 'AGGRESSOR', look: { head: 'cap' } });
  const vic = S.actor('man', c.x + 1.2, c.z + 0.6, { mode: 'cower' });
  S.blip(() => thug.pos, '#ff3b3b', 5);
  S.timer(travelTime(S, p, 35), 'You took too long to respond');
  panel(S, jobs, id, 'Respond');
  await S.goto(c.x, c.z, { r: 14, text: `Break up the fight at ${where}`, noBeam: true });
  S.clearTimer();
  thug.mode = 'fight';
  await S.say('Aggressor', 'Stay out of this, pig!', 1.5);
  panel(S, jobs, id, 'Subdue him');
  S.objective('Subdue the aggressor (Q punch, E kick)');
  S.failIf(() => g.player.hp <= 0, 'You were knocked out');
  await S.until(() => thug.isDown && thug.down > 1);
  thug.down = 1e9; thug.hostile = false;
  vic.mode = 'wave';
  S.obj0 = 'Cuff the aggressor';
  S.objective(S.obj0);
  await holdNear(S, () => thug.pos, 2.4, 1.2, 'Cuffing');
  thug.setLabel('ARRESTED', '#7ddc6a');
  await S.say('Victim', 'Thank you, officer!', 1.6);
  S.payout = 360; S.result = 'Fight broken up, aggressor arrested';
}

async function policeStolen(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, p = S.somewhere(250, 500), yaw = S.roadYaw(p);
  const D = S.aiCar(['suv', 'pickup', 'muscle', 'sedan'][Math.floor(Math.random() * 4)], p.x, p.z, yaw, { mode: 'flee', cap: 1 });
  await S.say('Dispatch', `Stolen ${D.v.spec.name} spotted. Driver is armed with attitude. Stop that car.`);
  S.blip(() => D.v.pos, '#ff3b3b', 6);
  panel(S, jobs, id, 'Ram it until it stops');
  let lost = 0;
  S.failIf(() => { lost = D.v.pos.distanceTo(S.here()) > 450 ? lost + 1 / 60 : 0; return lost > 8; }, 'The stolen car got away');
  S.timer(200, 'The stolen car got away');
  S.objective(() => `Ram the stolen ${D.v.spec.name}  (car health ${Math.max(0, Math.round(D.v.hp))}%)`);
  await S.until(() => D.v.hp < 45 || D.v.dead);
  D.stopped = true; S.clearTimer();
  if (D.v.dead) { S.payout = 150; S.result = 'Stolen car stopped (destroyed)'; return; }
  const out = S.curb({ x: D.v.pos.x, z: D.v.pos.z, y: D.v.pos.y }, 1);
  const thief = S.actor('man', out.x, out.z, { mode: 'flee', hp: 60, label: 'CAR THIEF', look: { head: 'beanie' } });
  await S.say('Car thief', "You'll never take me alive!", 1.4);
  panel(S, jobs, id, 'Catch the driver');
  S.objective('The driver bailed! Knock him down');
  await S.until(() => thief.isDown);
  thief.down = 1e9;
  S.obj0 = 'Cuff the car thief'; S.objective(S.obj0);
  await holdNear(S, () => thief.pos, 2.4, 1.2, 'Cuffing');
  thief.setLabel('ARRESTED', '#7ddc6a');
  S.payout = 480; S.result = 'Car thief arrested, vehicle recovered';
}

// ---------------------------------------------------------------- taxi
async function taxiFare(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, cab = jobs.vehicle;
  let offCab = 0;
  S.failIf(() => { offCab = g.vehicle !== cab ? offCab + 1 / 60 : 0; return offCab > 25 || cab.dead; }, () => cab.dead ? 'Your cab was wrecked' : 'You left your cab');
  const p = S.somewhere(80, 380), c = S.curb(p, 1);
  const pax = S.actor(Math.random() < 0.4 ? 'woman' : 'man', c.x, c.z, { mode: 'wave', label: 'FARE', labelColor: '#ffd23f' });
  panel(S, jobs, id, 'Pick up the passenger');
  S.timer(travelTime(S, p, 45), 'The passenger got tired of waiting');
  await S.goto(p.x, p.z, { r: 9, need: cab, stop: true, text: 'Pick up the passenger waving on the curb' });
  S.clearTimer();
  pax.mode = 'goto'; pax.target = cab.pos; pax.setLabel(null);
  await S.until(() => pax.pos.distanceTo(cab.pos) < 2.6 || S.time > 9999);
  pax.remove();
  const d = S.somewhere(500, 1500, p), name = nearestLabel(g, d);
  const lines = [['Passenger', `${name}, please. And step on it!`], ['Passenger', `Take me to ${name}. I'm late for class!`], ['Passenger', `${name}. Don't take the scenic route.`], ['Passenger', `Hi! ${name}, if you can.`]];
  const [n, t] = lines[Math.floor(Math.random() * lines.length)];
  S.say(n, t, 2.5);
  const dist = Math.hypot(d.x - p.x, d.z - p.z), limit = travelTime(S, d, 30);
  const hp0 = cab.hp;
  panel(S, jobs, id, `Drive to ${name}`);
  S.timer(limit, 'The passenger jumped out — too slow!');
  await S.goto(d.x, d.z, { r: 11, need: cab, stop: true, text: `Take the passenger to ${name}` });
  const left = Math.max(0, S.deadline - S.time);
  S.clearTimer();
  const ex = S.curb(d, 1);
  const out = S.actor(Math.random() < 0.4 ? 'woman' : 'man', ex.x, ex.z, { mode: 'idle' });
  const fare = Math.round(25 + dist * 0.09), tip = Math.round(left * 2.2), dmg = Math.round(Math.max(0, hp0 - cab.hp) * 1.5);
  S.payout = Math.max(15, fare + tip - dmg);
  S.result = `Fare $${fare} · tip $${tip}${dmg ? ` · damage −$${dmg}` : ''}`;
  await S.say('Passenger', tip > 30 ? 'Wow, that was fast! Keep the change.' : dmg > 20 ? 'Did you learn to drive at a demolition derby?' : 'Thanks.', 1.6);
}

// ---------------------------------------------------------------- paramedic
async function medicCall(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, amb = jobs.vehicle;
  const p = S.somewhere(220, 650), c = S.curb(p, 1), where = nearestLabel(g, p);
  const reasons = ['a cyclist was hit by a car', 'someone collapsed on the sidewalk', 'a student fell off a scooter', 'a jogger passed out'];
  await S.say('Dispatch', `Medic 1, ${reasons[Math.floor(Math.random() * reasons.length)]} at ${where}. Go!`);
  const pt = S.actor(Math.random() < 0.4 ? 'woman' : 'man', c.x, c.z, { mode: 'lying', label: 'PATIENT', labelColor: '#ffd23f' });
  const by = S.curb(p, -1); S.actor('man', by.x, by.z, { mode: 'wave' });
  S.timer(travelTime(S, p, 30), 'The patient didn\'t make it in time');
  panel(S, jobs, id, 'Lights & siren (K) — hurry');
  await S.goto(p.x, p.z, { r: 16, text: `Get to the patient at ${where}` });
  S.clearTimer();
  S.obj0 = 'Get out and stabilise the patient'; S.objective(S.obj0);
  panel(S, jobs, id, 'Stabilise the patient');
  await holdNear(S, () => pt.pos, 2.6, 2.5, 'Stabilising');
  pt.remove();
  S.toast('Patient loaded into the ambulance', 'good');
  const H = HOSPITALS.map(([n, la, lo]) => ({ n, ...S.ll(la, lo) })).sort((a, b) => Math.hypot(a.x - S.here().x, a.z - S.here().z) - Math.hypot(b.x - S.here().x, b.z - S.here().z))[0];
  panel(S, jobs, id, `Drive to ${H.n}`);
  S.timer(travelTime(S, H, 40), 'The patient didn\'t make it');
  let off = 0;
  S.failIf(() => { off = g.vehicle !== amb ? off + 1 / 60 : 0; return off > 15; }, 'You abandoned the patient');
  await S.goto(H.x, H.z, { r: 14, need: amb, stop: true, text: `Rush the patient to ${H.n}` });
  const left = Math.max(0, S.deadline - S.time);
  S.payout = 300 + Math.round(left * 4); S.result = 'Patient delivered to hospital';
}

// ---------------------------------------------------------------- delivery
async function deliveryRun(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, truck = jobs.vehicle;
  let total = 0;
  for (let i = 0; i < 3; i++) {
    const d = S.somewhere(450, 1200), name = nearestLabel(g, d);
    panel(S, jobs, id, `Drop ${i + 1}/3: ${name}`);
    S.timer(travelTime(S, d, 25), 'The parcel was late');
    await S.goto(d.x, d.z, { r: 12, need: truck, stop: true, text: `Deliver parcel ${i + 1}/3 to ${name}` });
    const left = Math.max(0, S.deadline - S.time);
    S.clearTimer();
    total += 90 + Math.round(left * 2.5);
    S.toast(`Parcel delivered to ${name}`, 'good');
    g.audio.chime(true);
  }
  S.payout = total; S.result = '3 parcels delivered';
}

// ---------------------------------------------------------------- city bus
async function busRoute(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, bus = jobs.vehicle;
  let off = 0, riders = 0, total = 0, prev = S.here();
  S.failIf(() => { off = g.vehicle !== bus ? off + 1 / 60 : 0; return off > 25 || bus.dead; }, () => bus.dead ? 'The bus was wrecked' : 'You left the bus');
  const route = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < route; i++) {
    const p = S.somewhere(260, 520, prev), name = nearestLabel(g, p), c = S.curb(p, 1);
    const n = 1 + Math.floor(Math.random() * 3), wait = [];
    for (let k = 0; k < n; k++) wait.push(S.actor(Math.random() < 0.45 ? 'woman' : 'man', c.x + (k - 1) * 0.9, c.z + (k % 2) * 0.6, { mode: 'idle', label: k ? null : 'BUS STOP', labelColor: '#5aa9ff' }));
    panel(S, jobs, id, `Stop ${i + 1}/${route}: ${name} · ${riders} on board`);
    S.timer(travelTime(S, p, 35), 'You fell too far behind the timetable');
    await S.goto(p.x, p.z, { r: 12, need: bus, stop: true, text: `Next stop: ${name}` });
    const left = Math.max(0, S.deadline - S.time);
    S.clearTimer();
    // some get off, the waiting ones get on
    const off2 = Math.min(riders, Math.floor(Math.random() * (riders + 1)));
    for (let k = 0; k < off2; k++) { const e = S.curb(p, 1); S.actor(Math.random() < 0.45 ? 'woman' : 'man', e.x + k, e.z, { mode: 'idle' }); }
    riders -= off2;
    for (const w of wait) { w.setLabel(null); w.mode = 'goto'; w.target = bus.pos; }
    await S.until(() => wait.every(w => w.pos.distanceTo(bus.pos) < 3.2) || S.time > 9999);
    for (const w of wait) w.remove();
    riders += n;
    const fare = n * 18 + Math.round(left * 1.5);
    total += fare;
    S.toast(`${n} boarded${off2 ? `, ${off2} got off` : ''}  +$${fare}`, 'good');
    g.audio.chime(true);
    prev = p;
  }
  S.payout = total + 120; S.result = `Route complete · ${route} stops`;
}

// ---------------------------------------------------------------- firefighter
async function fireCall(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, eng = jobs.vehicle, kind = S.jobTitle;
  const p = S.somewhere(260, 700), yaw = S.roadYaw(p), where = nearestLabel(g, p);
  await S.say('Dispatch', `Engine 1, ${kind.toLowerCase()} reported at ${where}. Roll out!`);
  const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const count = kind === 'HOUSE FIRE' ? 4 : kind === 'CAR FIRE' ? 2 : 3;
  const fires = [];
  for (let i = 0; i < count; i++) {
    const along = (i - (count - 1) / 2) * 11, c = S.curb({ x: p.x + fwd.x * along, z: p.z + fwd.z * along, y: p.y }, i % 2 ? -1 : 1);
    fires.push({ x: c.x, z: c.z, y: g.world.groundAt(c.x, c.z).y, hp: 100 });
  }
  if (kind === 'CAR FIRE') { const v = S.car(['sedan', 'hatch', 'classic'][Math.floor(Math.random() * 3)], fires[0].x, fires[0].z, yaw + 0.3); v.hp = 12; v.noExplode = true; fires[0].y += 0.6; }
  const light = new THREE.PointLight(0xff7a2a, 0, 40, 1.6); light.position.set(p.x, p.y + 4, p.z); g.scene.add(light);
  S.onCleanup(() => g.scene.remove(light));
  const tmpV = new THREE.Vector3(), from = new THREE.Vector3(), vel = new THREE.Vector3();
  let spraying = null;
  S.every((dt) => {
    let live = 0;
    for (const f of fires) if (f.hp > 0) {
      live++;
      const k = f.hp / 100;
      const n = Math.random() < k * 0.6 ? 2 : 1;
      for (let q = 0; q < n; q++) g.fx.emit('flame', tmpV.set(f.x + (Math.random() - 0.5) * 2.4 * k, f.y + 0.3, f.z + (Math.random() - 0.5) * 2.4 * k), null, 1);
      if (Math.random() < 0.12) g.fx.emit('blacksmoke', tmpV.set(f.x, f.y + 3, f.z), null, 1);
    }
    light.intensity = live ? (8 + Math.random() * 6) * Math.min(1, live / 2) : 0;
    // water cannon: auto-locks on the nearest fire when the engine is parked close
    spraying = null;
    if (g.vehicle === eng && eng.speed < 2) {
      let bd = 26;
      for (const f of fires) if (f.hp > 0) { const d = Math.hypot(f.x - eng.pos.x, f.z - eng.pos.z); if (d < bd) { bd = d; spraying = f; } }
    }
    if (spraying) {
      const f = spraying;
      from.set(0, 3.6, 1.2).applyQuaternion(eng.q).add(eng.pos);
      const dx = f.x - from.x, dz = f.z - from.z, d = Math.hypot(dx, dz), t = Math.max(0.5, d / 18);
      vel.set(dx / t, (f.y + 0.5 - from.y + 4.9 * t * t) / t, dz / t);
      g.fx.emit('water', from, vel, 4);
      if (Math.random() < 0.4) g.fx.emit('splash', tmpV.set(f.x, f.y + 0.3, f.z), null, 1);
      f.hp -= (g.lastDt || 1 / 60) * 22;
      if (f.hp <= 0) { g.fx.emit('smoke', tmpV.set(f.x, f.y + 1, f.z), null, 8); S.toast('Fire out!', 'good'); }
    }
  });
  S.timer(travelTime(S, p, 35), 'The fire spread out of control before you arrived');
  panel(S, jobs, id, 'Lights & siren (K) — hurry');
  await S.goto(p.x, p.z, { r: 26, need: eng, text: `Get the engine to the ${kind.toLowerCase()} at ${where}` });
  S.clearTimer();
  panel(S, jobs, id, 'Park near the flames — the cannon aims itself');
  S.timer(100, 'The fire spread out of control');
  S.objective(() => `Put out the fires: ${fires.filter(f => f.hp <= 0).length}/${count}${spraying ? '  · spraying' : ' · park within 25 m of a fire'}`);
  await S.until(() => fires.every(f => f.hp <= 0));
  const left = Math.max(0, S.deadline - S.time);
  S.clearTimer();
  await S.say('Dispatch', 'Fire knocked down. Nice work, Engine 1.', 1.8);
  S.payout = 260 + count * 60 + Math.round(left * 2); S.result = `${kind[0] + kind.slice(1).toLowerCase()} put out`;
}

// ---------------------------------------------------------------- chop shop
const CHOP = { name: "Vic's Chop Shop", at: [40.4093, -86.8839] };
const ORDERS = ['sedan', 'hatch', 'suv', 'pickup', 'muscle', 'gt', 'luxury', 'classic', 'pony', 'crossover', 'jeep', 'roadster', 'gtr', 'rally', 'wagon'];
async function chopOrder(S, jobs, id) {
  keepPanel(S, jobs, id);
  const g = S.g, r = jobs.rank(id).i;
  const pool = ORDERS.slice(0, Math.min(ORDERS.length, 6 + r * 3));
  const want = pool[Math.floor(Math.random() * pool.length)];
  const p = S.somewhere(300, 800), yaw = S.roadYaw(p), c = S.curb(p, 1);
  const v = S.car(want, c.x, c.z, yaw);
  const where = nearestLabel(g, p);
  await S.say('Uncle Vic', `I got a buyer for a ${v.spec.name}. There's one parked near ${where}. Bring it to me clean.`);
  S.blip(() => v.pos, '#ff3b3b', 6);
  panel(S, jobs, id, `Steal the ${v.spec.name}`);
  S.timer(travelTime(S, p, 60), 'The owner drove it away');
  S.failIf(() => v.dead, 'The car was destroyed');
  await S.until(() => g.vehicle === v);
  S.clearTimer();
  if (Math.random() < 0.45 - r * 0.05) { g.police.crime(1, 'Car theft'); S.toast('Car alarm! Someone called the cops', 'warn'); }
  const shop = S.ll(...CHOP.at);
  panel(S, jobs, id, `Deliver it to ${CHOP.name}`);
  S.objective(() => `Take the ${v.spec.name} to ${CHOP.name}${g.police.wanted ? ' — lose the cops first' : ''}  (condition ${Math.round(v.hp)}%)`);
  for (;;) {
    await S.goto(shop.x, shop.z, { r: 10, need: v, stop: true, text: `Deliver the ${v.spec.name} to ${CHOP.name}` });
    if (!g.police.wanted) break;
    S.say('Uncle Vic', 'Are you crazy? Not with cops on your tail! Lose them and come back.', 2.2);
    await S.until(() => g.police.wanted === 0);
  }
  const value = Math.round(v.spec.max * 9 * (0.3 + 0.7 * v.hp / 100));
  g.exitVehicle(true);
  await S.say('Uncle Vic', v.hp > 80 ? 'Not a scratch. You have good hands, kid.' : 'You call this clean? I take it anyway.', 1.8);
  S.payout = value; S.result = `${v.spec.name} sold for parts`;
}
