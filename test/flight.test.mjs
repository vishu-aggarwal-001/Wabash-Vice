// Automated flight tests: the real flight model, assist and autopilot, flown headless on flat ground.
// Run with `npm test`. Every check has a pass band taken from the real aircraft the planes are based on
// (Cessna 172S POH, A320 and F-16 public data) or from what a player needs (lands on the runway, no crash).
import fs from 'node:fs';
import { makeSim, AIRCRAFT, KT, FT, DEG, destPoint, distM, bearingDeg } from './harness.mjs';
import { stallSpeed } from '../src/physics.js';
import { setGeoidGrid, geoidHeight } from '../src/geoid.js';

let pass = 0, fail = 0;
const check = (ok, name, detail) => { if (ok) pass++; else fail++; console.log(`${ok ? '  ok ' : '  FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const windOf = (fromDeg, kt) => [-Math.sin(fromDeg * DEG) * kt * KT, -Math.cos(fromDeg * DEG) * kt * KT, 0];
const RWY = { lat: 40, lon: -86, hdg: 90, elevM: 200, ident: '09' };
const xtOf = (fm) => { const b = bearingDeg(RWY.lat, RWY.lon, fm.latDeg, fm.lonDeg), d = distM(RWY.lat, RWY.lon, fm.latDeg, fm.lonDeg); return d * Math.sin((b - 90) * DEG); };
const alongOf = (fm) => { const b = bearingDeg(RWY.lat, RWY.lon, fm.latDeg, fm.lonDeg), d = distM(RWY.lat, RWY.lon, fm.latDeg, fm.lonDeg); return d * Math.cos((b - 90) * DEG); };

function airborne(key, altM, iasKt, opts = {}) {
  const s = makeSim(key, { assist: opts.assist ?? false, wind: opts.wind }), fm = s.fm;
  fm.ctrl.flaps = opts.flaps ?? 0; fm.ctrl.gearDown = !!opts.gear; fm.gearPos = opts.gear ? 1 : 0;
  fm.spawnAir(40, -86, 200 + altM, 90, iasKt * KT, 0); s.throttle = fm.throttleFor(iasKt * KT, 0); fm.N = s.throttle;
  return s;
}

const REF = {
  trainer: { vs1: [46, 56], vs0: [40, 50], roll: [180, 400], climb: [550, 850], vmax: [115, 135], brake: [130, 260] },
  airliner: { vs1: [135, 160], vs0: [100, 115], roll: [700, 1400], climb: [2000, 3500], vmaxM: [0.82, 0.92], brake: [550, 1000] },
  fighter: { vs1: [115, 140], vs0: [105, 130], roll: [350, 800], climb: [3000, 60000], vmaxM: [1.6, 2.2], brake: [700, 1300] },
};

for (const key of Object.keys(AIRCRAFT)) {
  const d = AIRCRAFT[key], ref = REF[key];
  console.log(`\n${d.name}`);
  // stall speeds
  const vs1 = stallSpeed(d, 0) / KT, vs0 = stallSpeed(d, 1) / KT;
  check(vs1 >= ref.vs1[0] && vs1 <= ref.vs1[1], 'clean stall speed', `${vs1.toFixed(0)} kt`);
  check(vs0 >= ref.vs0[0] && vs0 <= ref.vs0[1], 'full-flap stall speed', `${vs0.toFixed(0)} kt`);
  check(d.vref / KT >= vs0 * 1.2, 'Vref at least 1.2 x stall speed', `${(d.vref / KT).toFixed(0)} vs ${(vs0 * 1.2).toFixed(0)} kt`);

  // sits still on the runway
  let s = makeSim(key), fm = s.fm; s.groundStart(0); s.run(10);
  check(!fm.crashed && fm.onGround && fm.groundSpeed < 0.05 && Math.abs(fm.hpr.roll) < 0.5, 'sits still on its wheels', `gs ${fm.groundSpeed.toFixed(3)} m/s`);

  // takeoff roll + rotate + climb (assisted)
  s.throttle = 1; let vrDist = null, lift = null; const p0 = [fm.latDeg, fm.lonDeg];
  s.run(120, (s) => {
    if (vrDist === null && fm.out.ias >= d.vr) vrDist = distM(p0[0], p0[1], fm.latDeg, fm.lonDeg);
    if (vrDist !== null) s.stick.y = fm.hpr.pitch < d.rotatePitch ? 0.6 : 0;
    if (lift === null && !fm.onGround && vrDist !== null) lift = s.t;
    if (lift !== null && s.t > lift + 3) { s.stick.y = 0; if (d.retractable) fm.ctrl.gearDown = false; return false; }
  });
  check(lift !== null && !fm.crashed, 'takes off', vrDist ? `Vr after ${vrDist.toFixed(0)} m` : 'never reached Vr');
  check(vrDist !== null && vrDist >= ref.roll[0] && vrDist <= ref.roll[1], 'takeoff roll length', `${vrDist?.toFixed(0)} m`);
  const h0 = fm.h, t0 = s.t; s.run(40);
  const fpm = ((fm.h - h0) / (s.t - t0)) / FT * 60;
  check(fpm >= ref.climb[0] && fpm <= ref.climb[1] && !fm.crashed, 'initial climb rate', `${fpm.toFixed(0)} ft/min`);

  // clumsy keyboard takeoff (Assisted): hold full back stick from Vr until 5 m up, then let go
  s = makeSim(key); fm = s.fm; s.groundStart(0); s.run(1); s.throttle = 1; let up = false, minIas = 1e9;
  s.run(90, () => { if (fm.out.ias >= d.vr && !up) s.stick.y = 0.8; if (!fm.onGround && s.agl() > 5 + fm.restHeight) { up = true; s.stick.y = 0; if (d.retractable) fm.ctrl.gearDown = false; }
    if (up) minIas = Math.min(minIas, fm.out.ias); });
  check(up && !fm.crashed && fm.out.stallMix < 0.1 && minIas > stallSpeed(d, fm.flapPos) * 1.1 && fm.vs > 0, 'Assisted: over-rotated takeoff settles into a safe climb', `min ${(minIas / KT).toFixed(0)} kt, now ${(fm.vs / FT * 60).toFixed(0)} ft/min`);

  // trimmed hands-off flight, Realistic mode (no assist): must stay within 300 ft for a minute
  const sc = d.spawnCruise;
  s = airborne(key, sc.alt, sc.spd / KT); const hA = s.fm.h; s.run(60);
  check(Math.abs(s.fm.h - hA) < 300 * FT && Math.abs(s.fm.hpr.roll) < 5, 'trimmed hands-off for 60 s', `${((s.fm.h - hA) / FT).toFixed(0)} ft`);

  // top speed
  s = airborne(key, key === 'fighter' ? 12200 : sc.alt, sc.spd / KT, { assist: true }); s.throttle = 1; s.fm.ctrl.burner = !!d.afterburner; s.run(key === 'fighter' ? 420 : 240);
  if (ref.vmax) check(s.fm.out.V / KT >= ref.vmax[0] && s.fm.out.V / KT <= ref.vmax[1], 'top speed', `${(s.fm.out.V / KT).toFixed(0)} kt TAS`);
  else check(s.fm.out.mach >= ref.vmaxM[0] && s.fm.out.mach <= ref.vmaxM[1] && !s.fm.crashed, 'top speed', `Mach ${s.fm.out.mach.toFixed(2)} ${s.fm.crashReason}`);

  // full aft stick in Assisted mode never stalls the wing
  s = airborne(key, 1500, d.vref / KT + 30, { assist: true }); s.throttle = 0; s.stick.y = 1; let maxMix = 0;
  s.run(30, () => { maxMix = Math.max(maxMix, s.fm.out.stallMix); });
  check(maxMix < 0.25 && !s.fm.crashed, 'Assisted: full back stick at idle does not stall', `stall ${maxMix.toFixed(2)}`);

  // Realistic stall + recovery
  s = airborne(key, 2000, d.vref / KT + 20); s.throttle = 0; let stalled = false;
  s.run(60, () => { s.stick.y = 1; if (s.fm.out.stallMix > 0.5) { stalled = true; return false; } });
  s.stick.y = -0.3; s.throttle = 1; s.run(4); s.stick.y = 0; s.run(15);
  check(stalled && !s.fm.crashed && s.fm.out.stallMix < 0.1, 'Realistic: stalls and recovers', `alt ${((s.fm.h - 200) / FT).toFixed(0)} ft`);

  // autoland: calm, 15 kt crosswind, 20 kt headwind + moderate turbulence
  for (const [label, wind, turb] of [['calm', [0, 0, 0], 0], ['15 kt crosswind', windOf(180, 15), 0], ['headwind + turbulence', windOf(90, 20), 1.6]]) {
    s = makeSim(key, { wind }); fm = s.fm; fm.turbulence = turb;
    const dist = d.engine === 'prop' ? 5500 : 12000, [la, lo] = destPoint(RWY.lat, RWY.lon, 270, dist);
    fm.ctrl.flaps = d.approachFlaps; fm.ctrl.gearDown = true; fm.gearPos = 1;
    const spd = d.vref + 10 * KT;
    fm.spawnAir(la, lo, 200 + fm.restHeight + Math.tan(3 * DEG) * (dist + 300), 90, spd, -3);
    s.throttle = fm.throttleFor(spd, -3); fm.N = s.throttle;
    s.ap.target = RWY; s.ap.engage(fm); s.ap.hdgMode = 'APP';
    let td = null, tdAlong = null, maxXt = 0;
    s.run(400, () => { if (fm.touchdown && !td) { td = fm.touchdown; tdAlong = -alongOf(fm); } if (td) maxXt = Math.max(maxXt, Math.abs(xtOf(fm))); if (td && fm.groundSpeed < 1) return false; });
    const ok = td && !fm.crashed && td.fpm > -480 && -tdAlong > 150 && -tdAlong < 1000 && maxXt < 12 && fm.groundSpeed < 1;
    check(ok, `autoland, ${label}`, td ? `${td.fpm.toFixed(0)} fpm, ${(-tdAlong).toFixed(0)} m past threshold, max ${maxXt.toFixed(1)} m off centre ${fm.crashReason}` : `no touchdown ${fm.crashReason}`);
  }

  // crosswind takeoff hands-off stays on the runway
  s = makeSim(key, { wind: windOf(180, 15) }); fm = s.fm; s.groundStart(90); s.run(2); s.throttle = 1; let dev = 0;
  s.run(80, () => { if (fm.onGround) dev = Math.max(dev, Math.abs(xtOf(fm))); if (fm.out.ias >= d.vr) s.stick.y = fm.hpr.pitch < d.rotatePitch ? 0.6 : 0; if (!fm.onGround && s.agl() > 20) return false; });
  check(dev < 8 && !fm.crashed, 'crosswind takeoff tracks the centre line', `${dev.toFixed(1)} m`);

  // assisted crab touchdown in a crosswind: de-crabs, no tip-over
  s = makeSim(key, { wind: windOf(180, 15) }); fm = s.fm; fm.ctrl.flaps = d.approachFlaps; fm.ctrl.gearDown = true; fm.gearPos = 1;
  const crab = Math.asin(15 * KT / d.vref) / DEG;
  fm.spawnAir(40, -86, 200 + fm.restHeight + 4, 90 + crab, d.vref, -2); fm.vel[1] += 15 * KT; s.throttle = 0;
  s.run(60, () => { s.brake = fm.onGround ? 0.7 : 0; if (fm.onGround && fm.groundSpeed < 1) return false; });
  check(!fm.crashed && Math.abs(xtOf(fm)) < 15, 'Assisted crosswind landing (no flare, crabbed) stays upright', `${xtOf(fm).toFixed(1)} m off, ${fm.crashReason}`);

  // braking distance from Vref
  s = makeSim(key); fm = s.fm; s.groundStart(90); fm.vel = [d.vref, 0, 0]; fm.N = 0; s.brake = 1; const b0 = [fm.latDeg, fm.lonDeg];
  s.run(120, () => fm.groundSpeed > 0.5);
  const bd = distM(b0[0], b0[1], fm.latDeg, fm.lonDeg);
  check(bd >= ref.brake[0] && bd <= ref.brake[1] && Math.abs(fm.hpr.heading - 90) < 2, 'max braking from Vref', `${bd.toFixed(0)} m`);

  // taxi turn at full steering never tips over
  s = makeSim(key); fm = s.fm; s.groundStart(0); s.run(1); s.throttle = 0.3; let maxRoll = 0;
  s.run(60, () => { if (fm.groundSpeed > 6) { s.throttle = 0; s.brake = 0.2; } else s.brake = 0; s.stick.x = fm.groundSpeed > 2 ? 1 : 0; maxRoll = Math.max(maxRoll, Math.abs(fm.hpr.roll)); });
  check(maxRoll < 6 && !fm.crashed, 'full-lock taxi turn stays upright', `max roll ${maxRoll.toFixed(1)} deg`);

  // autopilot engaged while diving at the ground, and asked to fly below the terrain: must not hit it
  s = airborne(key, 120, d.vref / KT + 30, { assist: true }); s.fm.vel[2] = -6; s.ap.engage(s.fm); s.ap.alt = 0; let minAgl = 1e9;
  s.run(90, () => { minAgl = Math.min(minAgl, s.agl()); });
  check(!s.fm.crashed && s.agl() > 220, 'AP terrain floor: never flies into the ground', `lowest ${(minAgl / FT).toFixed(0)} ft, now ${(s.agl() / FT).toFixed(0)} ft AGL`);

  // autopilot: heading + altitude changes
  s = airborne(key, sc.alt, sc.spd / KT, { assist: true }); s.ap.engage(s.fm); s.ap.alt = s.fm.h; s.ap.spd = s.fm.out.ias; s.ap.hdg = 180;
  s.run(200); check(Math.abs(s.fm.hpr.heading - 180) < 2 && Math.abs(s.fm.h - s.ap.alt) < 30, 'AP turns to a new heading and holds altitude', `hdg ${s.fm.hpr.heading.toFixed(1)}, alt err ${((s.fm.h - s.ap.alt) / FT).toFixed(0)} ft`);
  s.ap.alt += 1000 * FT; s.ap.vMode = 'VS'; s.ap.vs = 1000 * FT / 60; s.run(150);
  check(Math.abs(s.fm.h - s.ap.alt) < 20 && s.ap.vMode === 'ALT', 'AP climbs 1,000 ft and levels off', `err ${((s.fm.h - s.ap.alt) / FT).toFixed(0)} ft`);
}

// geoid: altimeter shows height above sea level
const g = fs.readFileSync(new URL('../data/egm96-1deg.bin', import.meta.url));
setGeoidGrid(new Int16Array(g.buffer, g.byteOffset, g.length / 2));
console.log('\nGeoid');
check(Math.abs(geoidHeight(40.41, -86.94) + 34.3) < 1.5, 'EGM96 at Purdue Airport', geoidHeight(40.41, -86.94).toFixed(1) + ' m');
check(Math.abs(geoidHeight(5, 78) + 104.7) < 2, 'EGM96 Indian Ocean low', geoidHeight(5, 78).toFixed(1) + ' m');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
