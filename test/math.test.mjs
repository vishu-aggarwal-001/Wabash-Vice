import * as M from '../src/math.js';
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b}`);
const vnear = (a, b, tol, msg) => a.forEach((x, i) => near(x, b[i], tol, `${msg}[${i}]`));

// HPR round trip, many attitudes
for (const h of [0, 45, 90, 179, 270, 359]) for (const p of [-60, -10, 0, 15, 80]) for (const r of [-150, -45, 0, 30, 120]) {
  const o = M.hprFromQ(M.qFromHPR(h, p, r));
  near(M.wrap180(o.heading - h), 0, 1e-6, `hdg h${h}p${p}r${r}`); near(o.pitch, p, 1e-6, `pitch h${h}p${p}r${r}`); near(M.wrap180(o.roll - r), 0, 1e-6, `roll h${h}p${p}r${r}`);
}
// Conventions: heading 90 nose points east, positive roll = right wing down
vnear(M.qrot(M.qFromHPR(90, 0, 0), [1, 0, 0]), [1, 0, 0], 1e-9, 'hdg90 nose east');
vnear(M.qrot(M.qFromHPR(0, 0, 0), [1, 0, 0]), [0, 1, 0], 1e-9, 'hdg0 nose north');
const rw = M.qrot(M.qFromHPR(0, 0, 30), [0, -1, 0]); ok(rw[2] < 0, 'roll+ right wing (-y) goes down');
ok(M.qrot(M.qFromHPR(0, 20, 0), [1, 0, 0])[2] > 0, 'pitch+ nose up');
// qToMat3 consistent with qrot (column-major)
const q = M.qFromHPR(33, 12, -40), m = M.qToMat3(q), v = [0.3, -1.2, 2.2];
const mv = [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
vnear(mv, M.qrot(q, v), 1e-9, 'qToMat3 vs qrot');
vnear(M.qinvrot(q, M.qrot(q, v)), v, 1e-9, 'inverse rotation');
// geodesy
near(M.distM(40.4123, -86.9368, 41.9786, -87.9048) / 1852, 103.7, 1, 'KLAF-KORD nm');
near(M.bearingDeg(0, 0, 1, 0), 0, 1e-9, 'bearing north'); near(M.bearingDeg(0, 0, 0, 1), 90, 1e-9, 'bearing east');
const dp = M.destPoint(40, -86, 123, 50000); near(M.distM(40, -86, dp[0], dp[1]), 50000, 1, 'destPoint dist'); near(M.bearingDeg(40, -86, dp[0], dp[1]), 123, 0.01, 'destPoint brg');
const dpw = M.destPoint(10, 179.9, 90, 50000); ok(dpw[1] < -179, 'destPoint dateline wrap ' + dpw[1]);
// ISA: sea level, 5000 m, 11000, 15000
const a0 = M.atmosphere(0); near(a0.rho, 1.225, 0.001, 'rho SL'); near(a0.a, 340.3, 0.3, 'a SL');
near(M.atmosphere(5000).rho, 0.7364, 0.002, 'rho 5km'); near(M.atmosphere(11000).rho, 0.3639, 0.002, 'rho 11km');
near(M.atmosphere(15000).rho, 0.1948, 0.002, 'rho 15km'); near(M.atmosphere(15000).P, 12044.6, 15, 'P 15km');
near(M.atmosphere(-300).rho, 1.261, 0.003, 'rho below SL');
const hi = M.atmosphere(30000); ok(Number.isFinite(hi.rho) && hi.rho > 0, 'rho 30km finite');
// radii
const r = M.radii(45 * M.DEG); near(r.N, 6388838, 5, 'N 45'); near(r.M, 6367382, 5, 'M 45');
// wraps
near(M.wrap180(190), -170, 1e-9, 'wrap180'); near(M.wrap360(-10), 350, 1e-9, 'wrap360'); near(M.wrap180(-180), -180, 1e-9, 'wrap180 -180');
// noise bounded & continuous
let mx = 0, jump = 0, prev = M.noise1(0); for (let t = 0; t < 200; t += 0.01) { const x = M.noise1(t); mx = Math.max(mx, Math.abs(x)); jump = Math.max(jump, Math.abs(x - prev)); prev = x; }
ok(mx <= 1, 'noise bounded'); ok(jump < 0.05, 'noise continuous ' + jump);
console.log(`math: ${n - fails}/${n} passed`); process.exit(fails ? 1 : 0);
