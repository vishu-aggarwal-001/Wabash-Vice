// Small vector / quaternion helpers. Vectors are [x, y, z]; quaternions are [w, x, y, z].
// Body frame: x = forward, y = left, z = up.  World frame: local East-North-Up (ENU).
export const DEG = Math.PI / 180;
export const KT = 0.514444;      // m/s per knot
export const FT = 0.3048;        // m per foot
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrap360 = (d) => ((d % 360) + 360) % 360;
export const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
export const smooth = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
export const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];
export const qnorm = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
export const qaxis = (ax, ang) => { const s = Math.sin(ang / 2); return [Math.cos(ang / 2), ax[0] * s, ax[1] * s, ax[2] * s]; };
export function qrot(q, v) { // rotate vector v by q
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
export const qinvrot = (q, v) => qrot(qconj(q), v);

// heading (deg clockwise from north), pitch (deg nose up), roll (deg right wing down) -> body->ENU quaternion
export function qFromHPR(h, p, r) {
  let q = qaxis([0, 0, 1], Math.PI / 2 - h * DEG);
  q = qmul(q, qaxis([0, 1, 0], -p * DEG));
  return qnorm(qmul(q, qaxis([1, 0, 0], r * DEG)));
}
export function hprFromQ(q) {
  const f = qrot(q, [1, 0, 0]), l = qrot(q, [0, 1, 0]), u = qrot(q, [0, 0, 1]);
  return {
    heading: wrap360(Math.atan2(f[0], f[1]) / DEG),
    pitch: Math.asin(clamp(f[2], -1, 1)) / DEG,
    roll: Math.atan2(l[2], u[2]) / DEG,
  };
}
// 3x3 rotation matrix (column-major, as Cesium.Matrix3 wants) from quaternion
export function qToMat3(q) {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y),
    2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x),
    2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y),
  ];
}

// ---- geodesy (WGS84) ----
const A = 6378137, E2 = 6.69437999014e-3;
export function radii(lat) {
  const s = Math.sin(lat), d = 1 - E2 * s * s;
  return { N: A / Math.sqrt(d), M: (A * (1 - E2)) / Math.pow(d, 1.5) };
}
export function bearingDeg(lat1, lon1, lat2, lon2) { // inputs in degrees
  const a = lat1 * DEG, b = lat2 * DEG, dl = (lon2 - lon1) * DEG;
  return wrap360(Math.atan2(Math.sin(dl) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(dl)) / DEG);
}
export function distM(lat1, lon1, lat2, lon2) {
  const a = lat1 * DEG, b = lat2 * DEG, dl = (lon2 - lon1) * DEG, dp = b - a;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(dl / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function destPoint(lat, lon, brgDeg, d) { // degrees in/out, metres
  const R = 6371000, a = lat * DEG, o = lon * DEG, t = brgDeg * DEG, dr = d / R;
  const b = Math.asin(Math.sin(a) * Math.cos(dr) + Math.cos(a) * Math.sin(dr) * Math.cos(t));
  const l = o + Math.atan2(Math.sin(t) * Math.sin(dr) * Math.cos(a), Math.cos(dr) - Math.sin(a) * Math.sin(b));
  return [b / DEG, ((l / DEG + 540) % 360) - 180];
}

// ---- standard atmosphere ----
export function atmosphere(h) {
  const T0 = 288.15, P0 = 101325;
  let T, P;
  if (h < 11000) { T = T0 - 0.0065 * h; P = P0 * Math.pow(T / T0, 5.2559); }
  else { T = 216.65; P = 22632 * Math.exp(-(h - 11000) / 6341.6); }
  const rho = P / (287.05 * T);
  return { T, P, rho, sigma: rho / 1.225, a: Math.sqrt(1.4 * 287.05 * T) };
}

// cheap smooth noise for turbulence
export function noise1(t) {
  const i = Math.floor(t), f = t - i, h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}
