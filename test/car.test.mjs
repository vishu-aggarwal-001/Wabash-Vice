// Car handling checks: acceleration, top speed, brakes, cornering, handbrake turns, hills, jumps, walls, reverse
import { CARS, Car } from '../src/car.js';
let fails = 0, n = 0;
const ok = (c, msg) => { n++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
const ONLY = process.env.ONLY;
const KMH = 1 / 3.6;
// ground: height as a function of metres north of the start (x) on a flat-east world
const mk = (key, groundN = () => 0, heading = 0) => {
  const car = new Car(CARS[key], 0, 0, groundN(0), heading);
  const R = 6371000;
  const ground = (la) => groundN((la * Math.PI / 180) * R);
  return { car, ground, north: () => (car.lat * R) };
};
const run = (s, inp, secs, stop) => { for (let t = 0; t < secs; t += 1 / 60) { s.car.step(1 / 60, typeof inp === 'function' ? inp(s.car, t) : inp, s.ground); if (!isFinite(s.car.vx) || !isFinite(s.car.h)) return 'nan'; if (stop && stop(s.car, t)) return t; } return null; };

for (const key of Object.keys(CARS)) {
  if (ONLY && ONLY !== key) continue;
  const d = CARS[key];
  console.log(`${d.name} (${key})`);
  // 0-100 km/h
  let s = mk(key);
  const t100 = run(s, { throttle: 1, brake: 0, steer: 0 }, 30, (c) => c.vx >= 100 * KMH);
  ok(t100 !== null && t100 !== 'nan' && t100 > 2.4 && t100 < 13, `0-100 km/h in ${t100 && t100.toFixed(1)} s`);
  // top speed
  run(s, { throttle: 1, brake: 0, steer: 0 }, 150);
  ok(Math.abs(s.car.vx - d.vmax) / d.vmax < 0.06, `top speed ${(s.car.vx * 3.6).toFixed(0)} km/h (want ~${(d.vmax * 3.6).toFixed(0)})`);
  ok(Math.abs(s.car.headingDeg - 0) < 0.5 || Math.abs(s.car.headingDeg - 360) < 0.5, `runs straight at top speed (heading ${s.car.headingDeg.toFixed(2)})`);
  // braking from 100 km/h
  s = mk(key); s.car.vx = 100 * KMH; const n0 = s.north();
  run(s, { throttle: 0, brake: 1, steer: 0 }, 10, (c) => c.vx < 0.2);
  const dist = s.north() - n0;
  ok(dist > 28 && dist < 48, `stops from 100 km/h in ${dist.toFixed(1)} m`);
  // steady full-lock corner at 60 km/h holding speed: no spin, sensible lateral g
  s = mk(key); s.car.vx = 60 * KMH; let maxAy = 0, spun = false;
  run(s, (c) => ({ throttle: c.vx < 60 * KMH ? 0.6 : 0.15, brake: 0, steer: 1 }), 8, (c) => { maxAy = Math.max(maxAy, Math.abs(c.ay)); if (Math.abs(Math.atan2(c.vy, c.vx)) > 0.6) spun = true; return false; });
  ok(!spun, 'full lock at 60 km/h does not spin');
  ok(maxAy / 9.81 < d.mu + 0.15 && maxAy / 9.81 > 0.5, `cornering grip ${(maxAy / 9.81).toFixed(2)} g`);
  ok(s.car.headingDeg > 90, `turns right with right steering (heading ${s.car.headingDeg.toFixed(0)})`);
  // handbrake turn at 70 km/h
  s = mk(key); s.car.vx = 70 * KMH;
  run(s, (c, t) => ({ throttle: 0, brake: 0, steer: -1, handbrake: t < 1.4 }), 3);
  const turned = (360 - s.car.headingDeg) % 360;
  ok(turned > 70, `handbrake turn left swings ${turned.toFixed(0)} degrees`);
  // parked on a 12% hill with the brake: stays put; climbs it under power
  s = mk(key, (x) => x * 0.12);
  const p0 = s.north(); run(s, { throttle: 0, brake: 0, steer: 0, handbrake: true }, 5);
  ok(Math.abs(s.north() - p0) < 0.3, `holds on a 12% hill with the handbrake (moved ${(s.north() - p0).toFixed(2)} m)`);
  run(s, { throttle: 1, brake: 0, steer: 0 }, 6);
  ok(s.car.vx > 12, `climbs a 12% hill (${(s.car.vx * 3.6).toFixed(0)} km/h after 6 s)`);
  // crest jump: flat, then a ramp up 1.5 m over 10 m and a drop
  s = mk(key, (x) => (x < 100 ? 0 : x < 110 ? (x - 100) * 0.15 : -2));
  s.car.vx = 90 * KMH; let air = false, landed = false;
  const r = run(s, { throttle: 0.5, brake: 0, steer: 0 }, 6, (c) => { if (c.airborne) air = true; if (air && !c.airborne) landed = true; return false; });
  ok(r !== 'nan' && air && landed, `jumps off a ramp at 90 km/h and lands (${air ? 'flew' : 'no air'})`);
  ok(Math.abs(s.car.bodyRoll) < 0.2, 'lands upright');
  // wall: a 4 m step 40 m ahead
  s = mk(key, (x) => (x < 40 ? 0 : 4));
  run(s, { throttle: 1, brake: 0, steer: 0 }, 8);
  ok(s.north() < 40.5 && s.car.h < 0.5 && s.car.damage > 0, `stops at a wall (at ${s.north().toFixed(1)} m, damage ${(s.car.damage * 100).toFixed(0)}%)`);
  // reverse: hold the brake at a standstill
  s = mk(key); run(s, { throttle: 0, brake: 1, steer: 0 }, 6);
  ok(s.car.vx < -8 && s.car.vx > -14, `reverses (${(s.car.vx * 3.6).toFixed(0)} km/h)`);
  // slalom at speed stays sane
  s = mk(key); s.car.vx = 80 * KMH;
  const rs = run(s, (c, t) => ({ throttle: 0.5, brake: 0, steer: Math.sin(t * 2.2) }), 10);
  ok(rs !== 'nan' && Math.abs(s.car.vy) < 8 && s.car.speed > 40 * KMH, `slalom at 80 km/h (slide ${s.car.vy.toFixed(1)} m/s)`);
}
console.log(`\n${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
