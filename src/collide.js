// Solid bodies. Vehicles are oriented boxes (their real length × width), people are circles.
// Used for: you on foot vs every car, your car vs parked / traffic / police cars,
// loose (crashed or pushed) cars vs each other, and people vs people.
//
// Heading convention (see vehicles.js): forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw).

const out = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };

// Circle (px, pz, r) against a vehicle's box. Returns null, or the push {nx, nz, depth}
// that moves the circle out of the box.
export function circleBox(px, pz, r, v, pad = 0) {
  const s = v.spec, hl = s.L / 2 + pad, hw = (s.type === 'plane' ? s.W * 0.3 : s.W / 2) + pad;
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), rx = -fz, rz = fx;
  const dx = px - v.pos.x, dz = pz - v.pos.z;
  if (dx * dx + dz * dz > (hl + hw + r) * (hl + hw + r)) return null;
  const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
  const cf = Math.max(-hl, Math.min(hl, lf)), cr = Math.max(-hw, Math.min(hw, lr));
  if (cf === lf && cr === lr) {
    // centre inside the box: leave by the nearest side
    const pf = hl - Math.abs(lf), pr = hw - Math.abs(lr);
    if (pr < pf) { const sg = Math.sign(lr) || 1; out.nx = rx * sg; out.nz = rz * sg; out.depth = pr + r; }
    else { const sg = Math.sign(lf) || 1; out.nx = fx * sg; out.nz = fz * sg; out.depth = pf + r; }
    return out;
  }
  const ef = lf - cf, er = lr - cr, d = Math.hypot(ef, er);
  if (d >= r) return null;
  out.nx = (fx * ef + rx * er) / d; out.nz = (fz * ef + rz * er) / d; out.depth = r - d;
  return out;
}

// Is (x, z) over the vehicle's roof footprint?
export function overBox(x, z, v, shrink = 0.1) {
  const s = v.spec, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const dx = x - v.pos.x, dz = z - v.pos.z;
  return Math.abs(dx * fx + dz * fz) < s.L / 2 - shrink && Math.abs(-dx * fz + dz * fx) < s.W / 2 - shrink;
}

// Box vs box (separating axis test). Returns null or {nx, nz, depth, px, pz}: the normal points
// from a to b, depth is the overlap, (px, pz) an approximate contact point.
export function boxBox(a, b) {
  const A = a.spec, B = b.spec;
  const dx0 = b.pos.x - a.pos.x, dz0 = b.pos.z - a.pos.z;
  const ra0 = Math.hypot(A.L, A.W) / 2, rb0 = Math.hypot(B.L, B.W) / 2;
  if (dx0 * dx0 + dz0 * dz0 > (ra0 + rb0) * (ra0 + rb0)) return null;
  const af = [Math.sin(a.yaw), Math.cos(a.yaw)], ar = [-af[1], af[0]];
  const bf = [Math.sin(b.yaw), Math.cos(b.yaw)], br = [-bf[1], bf[0]];
  const ahl = A.L / 2, ahw = A.W / 2, bhl = B.L / 2, bhw = B.W / 2;
  let best = Infinity, nx = 0, nz = 0;
  for (const [x, z] of [af, ar, bf, br]) {
    const pa = ahl * Math.abs(af[0] * x + af[1] * z) + ahw * Math.abs(ar[0] * x + ar[1] * z);
    const pb = bhl * Math.abs(bf[0] * x + bf[1] * z) + bhw * Math.abs(br[0] * x + br[1] * z);
    const dist = dx0 * x + dz0 * z;
    const ov = pa + pb - Math.abs(dist);
    if (ov <= 0) return null;
    if (ov < best) { best = ov; const sg = dist < 0 ? -1 : 1; nx = x * sg; nz = z * sg; }
  }
  // contact point: b's corner furthest into a (along -n), averaged with a's corner furthest into b
  const corner = (p, f, r, hl, hw, sx, sz) => {
    const kf = Math.sign(f[0] * sx + f[1] * sz) || 1, kr = Math.sign(r[0] * sx + r[1] * sz) || 1;
    return [p.x + f[0] * hl * kf + r[0] * hw * kr, p.z + f[1] * hl * kf + r[1] * hw * kr];
  };
  const cb = corner(b.pos, bf, br, bhl, bhw, -nx, -nz), ca = corner(a.pos, af, ar, ahl, ahw, nx, nz);
  out.nx = nx; out.nz = nz; out.depth = best; out.px = (ca[0] + cb[0]) / 2; out.pz = (ca[1] + cb[1]) / 2;
  return out;
}

// Resolve a vehicle–vehicle contact with an impulse that also spins both cars about the contact.
// Returns the closing speed (for crash sounds / damage) or 0.
export function resolveCars(a, b, c, restitution = 0.25) {
  const ma = a.spec.mass, mb = b.spec.mass;
  const ia = ma * (a.spec.L ** 2 + a.spec.W ** 2) / 12, ib = mb * (b.spec.L ** 2 + b.spec.W ** 2) / 12;
  const { nx, nz, depth, px, pz } = c;
  // separate (by inverse mass)
  const wa = (1 / ma) / (1 / ma + 1 / mb), wb = 1 - wa;
  a.pos.x -= nx * depth * wa; a.pos.z -= nz * depth * wa;
  b.pos.x += nx * depth * wb; b.pos.z += nz * depth * wb;
  // velocity of the contact point on each body (yawRate spins a point (rx, rz) at ω·(rz, −rx))
  const rax = px - a.pos.x, raz = pz - a.pos.z, rbx = px - b.pos.x, rbz = pz - b.pos.z;
  const wA = a.yawRate || 0, wB = b.yawRate || 0;
  const vax = a.vel.x + wA * raz, vaz = a.vel.z - wA * rax;
  const vbx = b.vel.x + wB * rbz, vbz = b.vel.z - wB * rbx;
  const rel = (vax - vbx) * nx + (vaz - vbz) * nz;   // > 0: closing
  if (rel <= 0) return 0;
  const ta = raz * nx - rax * nz, tb = rbz * nx - rbx * nz;
  const k = 1 / ma + 1 / mb + ta * ta / ia + tb * tb / ib;
  const j = (1 + restitution) * rel / k;
  a.vel.x -= nx * j / ma; a.vel.z -= nz * j / ma;
  b.vel.x += nx * j / mb; b.vel.z += nz * j / mb;
  a.yawRate = wA - Math.max(-3, Math.min(3, ta * j / ia));
  b.yawRate = wB + Math.max(-3, Math.min(3, tb * j / ib));
  return rel;
}
