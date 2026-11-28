// 6-degree-of-freedom flight model. Position is geodetic (lat, lon in radians, h = metres above the
// ellipsoid); velocity and orientation are kept relative to the local East-North-Up frame, which is
// carried along as the aircraft moves, so you can fly around the whole planet.
import {
  DEG, clamp, add, sub, scale, cross, dot, len, qmul, qnorm, qrot, qinvrot, qaxis, qFromHPR, hprFromQ,
  radii, atmosphere, noise1, lerp,
} from './math.js';

const G = 9.80665;

// control-surface effectiveness falls off at very high dynamic pressure (stick forces / blowback)
export const ctrlAuth = (qbar) => clamp(Math.sqrt(9000 / Math.max(qbar, 1)), 0.3, 1);
// propeller slipstream over the tail keeps the elevator and rudder working at low airspeed
export const propWash = (d, N, qbar) => 1 + (d.engine === 'prop' ? Math.min((d.propwash * N) / Math.max(qbar, 50), 20) : 0);
// Lift coefficient: linear up to 3 deg before the stall, then the curve rounds over to CLmax at the
// stall angle, then blends into post-stall (flat-plate) lift over the next 4 degrees.
export function liftModel(d, alpha, flap = 0, spoiler = 0) {
  const aStall = d.alphaStall + d.flapStall * flap;
  const aAbs = Math.abs(alpha), sgn = alpha < 0 ? -1 : 1;
  const ROUND = 6 * DEG, over0 = aAbs - (aStall - ROUND / 2);
  let CLlin = d.CL0 + d.CLa * alpha + d.flapCL * flap - (d.spoilerCL || 0) * spoiler;
  if (over0 > 0) { const o = Math.min(over0, ROUND); CLlin -= sgn * d.CLa * (o * o / (2 * ROUND) + Math.max(0, over0 - ROUND)); }
  const CLpost = 1.8 * Math.sin(alpha) * Math.cos(alpha) + d.flapCL * flap * 0.5;
  const sx = clamp((aAbs - aStall) / (4 * DEG), 0, 1);
  const stallMix = sx * sx * (3 - 2 * sx);
  const stallWarn = clamp((aAbs - aStall + 2.5 * DEG) / (2.5 * DEG), 0, 1);
  return { CL: lerp(CLlin, CLpost, stallMix), CLlin, stallMix, stallWarn, aStall };
}
// highest lift coefficient the wing can make (for stall speeds on the speed tape)
export function clMax(d, flap = 0) {
  let m = 0; for (let a = 0; a < 40 * DEG; a += 0.1 * DEG) m = Math.max(m, liftModel(d, a, flap).CL); return m;
}
// 1-g stall speed (equivalent airspeed, m/s)
export const stallSpeed = (d, flap = 0, mass = d.mass) => Math.sqrt((2 * mass * G) / (1.225 * d.S * clMax(d, flap)));
// transonic wave drag: Korn-style rise from the critical Mach number to a peak just past Mach 1, then easing off
export function waveDrag(d, M) {
  if (M <= d.mcrit) return 0;
  const peak = d.waveMax ?? 0.03, mPk = 1.1;
  if (M < mPk) return Math.min(peak, 20 * (M - d.mcrit) ** 4 + peak * ((M - d.mcrit) / (mPk - d.mcrit)) ** 3);
  return peak * Math.sqrt(mPk / M);
}
// jet thrust with altitude and speed. High-bypass airliner engines lose thrust with speed;
// low-bypass afterburning fighter engines gain thrust from ram pressure.
export function jetThrust(d, N, sigma, M, burner) {
  if (d.afterburner) {
    const ab = burner ? 1 : 0, Mc = Math.min(M, 2.2);
    const max = ab ? d.afterburner * (1 + 0.25 * Mc) : d.thrust * (1 - 0.1 * Math.min(Mc, 0.6) + 0.12 * Math.max(0, Mc - 0.6));
    return max * N * Math.pow(sigma, 0.8);
  }
  const m = Math.min(M, 1.2);
  return d.thrust * N * Math.pow(sigma, 0.9) * (1 - 0.5 * m + 0.2 * m * m);
}

export class FlightModel {
  constructor(def) {
    this.def = def;
    this.ctrl = { elev: 0, ail: 0, rud: 0, throttle: 0, brake: 0, parking: false, flaps: 0, gearDown: true, spoilers: 0, burner: false, trim: 0, reverse: false };
    this.N = 0;                 // engine spool 0..1
    this.flapPos = 0;           // 0..1 actual flap position (moves slowly)
    this.gearPos = 1;           // 0..1 actual gear position
    this.spoilerPos = 0;
    this.crashed = false; this.crashReason = '';
    this.onGround = false; this.wasOnGround = false;
    this.touchdown = null;      // filled on touchdown for the landing rating
    this.groundH = 0;           // terrain height under the aircraft (set by the game each frame)
    this.wind = [0, 0, 0]; this.turbulence = 0; this.t = 0;
    this.out = {};
    this.reset(0, 0, 0, 0);
  }

  reset(latDeg, lonDeg, h, headingDeg, speed = 0, pitchDeg = 0) {
    this.lat = latDeg * DEG; this.lon = lonDeg * DEG; this.h = h;
    this.q = qFromHPR(headingDeg, pitchDeg, 0);
    this.vel = qrot(this.q, [speed, 0, 0]);
    this.w = [0, 0, 0];
    this.crashed = false; this.crashReason = ''; this.touchdown = null;
    this.onGround = speed === 0; this.wasOnGround = this.onGround;
    this.N = speed > 0 ? 0.7 : 0; this.t = 0; this.maxG = 1;
    // air data valid from the very first frame (the assist / autopilot gain schedules read qbar)
    const atm = atmosphere(h);
    this.out = { V: speed, alpha: 0, beta: 0, mach: speed / atm.a, qbar: 0.5 * atm.rho * speed * speed, T: 0, CL: 0, stallMix: 0, stallWarn: 0,
      nz: 1, rho: atm.rho, lift: 0, agl: h - this.groundH, ias: speed * Math.sqrt(atm.sigma) };
    this.flapPos = this.def.flaps.length > 1 ? this.ctrl.flaps / (this.def.flaps.length - 1) : 0;
    this.gearPos = this.ctrl.gearDown ? 1 : 0;
  }

  // ------------------------------------------------------------------ main integration
  step(dt) {
    if (this.crashed) return;
    const n = Math.max(4, Math.ceil(dt / 0.004)), h = dt / n;
    for (let i = 0; i < n; i++) this._step(h);
    this.t += dt;
  }

  _step(dt) {
    const d = this.def, c = this.ctrl;
    for (const k of ['elev', 'ail', 'rud', 'throttle', 'trim']) if (!Number.isFinite(c[k])) c[k] = 0;
    // --- actuators
    const nFlap = d.flaps.length - 1;
    const flapTarget = nFlap > 0 ? c.flaps / nFlap : 0;
    this.flapPos += clamp(flapTarget - this.flapPos, -dt / 6, dt / 6);
    if (d.retractable) this.gearPos += clamp((c.gearDown ? 1 : 0) - this.gearPos, -dt / d.gearTime, dt / d.gearTime);
    this.spoilerPos += clamp(c.spoilers - this.spoilerPos, -dt * 2, dt * 2);
    const thrTarget = c.throttle;
    this.N += (thrTarget - this.N) * (1 - Math.exp(-d.spool * dt * (this.N < thrTarget ? 1 : 1.5)));

    // --- air data
    const atm = atmosphere(this.h);
    const turb = this.turbulence * clamp(1 - (this.h - this.groundH) / 3000, 0.3, 1);
    const gust = turb ? [noise1(this.t * 0.7) * turb, noise1(this.t * 0.6 + 50) * turb, noise1(this.t * 1.1 + 99) * turb * 0.5] : [0, 0, 0];
    const air = sub(this.vel, add(this.wind, gust));
    const vb = qinvrot(this.q, air);
    const V = Math.max(len(vb), 0.01);
    const alpha = Math.atan2(-vb[2], vb[0]);
    const beta = Math.asin(clamp(-vb[1] / V, -1, 1));
    const qbar = 0.5 * atm.rho * V * V;
    const mach = V / atm.a;
    const S = d.S, b = d.b, cc = d.c;

    // --- lift (see liftModel)
    const flap = this.flapPos;
    const { CL: CLaero, CLlin, stallMix, stallWarn: stallBuffet, aStall } = liftModel(d, alpha, flap, this.spoilerPos);
    let CL = CLaero;
    // ground effect: more lift, less induced drag within one wingspan of the ground
    const agl = this.h - this.groundH;
    const ge = clamp(agl / b, 0.05, 1);
    const geFactor = (16 * ge) ** 2 / (1 + (16 * ge) ** 2);
    CL *= 1 + 0.08 * (1 - geFactor);
    // --- drag (parasite + induced + flaps/gear/spoilers + post-stall + sideslip + transonic wave drag)
    let CD = d.CD0 + d.k * CLlin * CLlin * geFactor + d.flapCD * flap + d.gearCD * this.gearPos + d.spoilerCD * this.spoilerPos
      + stallMix * 1.1 * Math.sin(alpha) ** 2 + 0.5 * beta * beta + waveDrag(d, mach);
    const CY = d.CYb * beta;

    // force directions in body frame
    const vbn = scale(vb, 1 / V);
    const lxz = Math.hypot(vb[0], vb[2]) || 1;
    const liftDir = [-vb[2] / lxz, 0, vb[0] / lxz];
    const qS = qbar * S;
    let F = add(scale(liftDir, CL * qS), scale(vbn, -CD * qS));
    F = add(F, [0, CY * qS, 0]);

    // --- thrust
    let T = 0;
    const N = this.N;
    if (d.engine === 'prop') {
      const P = d.power * N * Math.pow(atm.sigma, 0.9);
      T = Math.min(d.staticThrust * N * atm.sigma, (P * d.propEff) / Math.max(V, 5));
    } else T = jetThrust(d, N, atm.sigma, mach, c.burner);
    if (d.engine === 'jet' && c.reverse && this.onGround && d.reverse) T = -d.thrust * d.reverse * N;
    F = add(F, [T, 0, 0]);

    // --- aerodynamic moments (pilot sign convention), then to body FLU torques
    const Vr = Math.max(V, 15);
    const p = this.w[0], qp = -this.w[1], r = -this.w[2];
    const ph = (p * b) / (2 * Vr), qh = (qp * cc) / (2 * Vr), rh = (r * b) / (2 * Vr);
    // control surfaces lose authority at very high dynamic pressure (stick forces / blowback)
    const auth = ctrlAuth(qbar) * (1 - 0.3 * stallMix);
    const wash = propWash(d, N, qbar);  // prop wash over the tail
    // rudder travel limiter on the airliner (fly-by-wire limits rudder at high speed, like the real thing)
    const rudLim = d.rudderLimiter ? clamp((d.vr * 1.4 / Math.max(V, 1)) ** 2, 0.12, 1) : 1;
    const elev = clamp(c.elev + c.trim, -1, 1);
    const Cl = d.Clb * beta + d.Clp * ph + d.Clr * rh + d.Clda * c.ail * auth * (1 - 0.5 * stallMix);
    const Cm = d.Cm0 + d.Cma * alpha + d.Cmq * qh + d.Cmde * elev * auth * Math.min(wash, 4) + d.Cmflap * flap
      + (Math.abs(alpha) > aStall ? -0.15 * Math.sign(alpha) * stallMix : 0);
    const Cn = d.Cnb * beta + d.Cnr * rh + d.Cndr * c.rud * rudLim * auth * Math.min(wash, 6) + d.Cnda * c.ail;
    let M = [qS * b * Cl, -qS * cc * Cm, -qS * b * Cn];
    // stall buffet / wing drop
    if (stallMix > 0.05 && !this.onGround) M = add(M, [qS * b * 0.02 * noise1(this.t * 7) * stallMix, qS * cc * 0.01 * noise1(this.t * 9 + 3) * stallMix, 0]);

    // --- forces into world frame + gravity
    let Fw = qrot(this.q, F);
    Fw[2] -= d.mass * G;

    // --- ground contact
    const contacts = this._contacts(dt);
    Fw = add(Fw, contacts.F);
    M = add(M, contacts.M);

    // --- integrate translation
    const acc = scale(Fw, 1 / d.mass);
    this.vel = add(this.vel, scale(acc, dt));
    const { N: Rn, M: Rm } = radii(this.lat);
    const dLat = this.vel[1] / (Rm + this.h), dLon = this.vel[0] / ((Rn + this.h) * Math.cos(this.lat));
    this.lat += dLat * dt; this.lon += dLon * dt; this.h += this.vel[2] * dt;
    if (this.lon > Math.PI) this.lon -= 2 * Math.PI; else if (this.lon < -Math.PI) this.lon += 2 * Math.PI;
    if (Math.abs(this.lat) > 89.5 * DEG) { this.lat = Math.sign(this.lat) * 89.5 * DEG; this.vel[1] *= -1; }
    // carry the ENU frame along with us (transport rate)
    const wt = [-dLat, dLon * Math.cos(this.lat), dLon * Math.sin(this.lat)];
    const wtl = len(wt);
    if (wtl > 1e-12) {
      const rq = qaxis(scale(wt, 1 / wtl), -wtl * dt);
      this.q = qnorm(qmul(rq, this.q));
      this.vel = qrot(rq, this.vel);
    }

    // --- integrate rotation (Euler's equations, diagonal inertia)
    const I = d.inertia, w = this.w;
    const wdot = [
      (M[0] - (I[2] - I[1]) * w[1] * w[2]) / I[0],
      (M[1] - (I[0] - I[2]) * w[2] * w[0]) / I[1],
      (M[2] - (I[1] - I[0]) * w[0] * w[1]) / I[2],
    ];
    this.w = add(w, scale(wdot, dt));
    const wl = len(this.w);
    if (wl > 1e-9) this.q = qnorm(qmul(this.q, qaxis(scale(this.w, 1 / wl), wl * dt)));

    // --- outputs
    const lift = CL * qS;
    const nz = dot(qinvrot(this.q, sub(acc, [0, 0, -G])), [0, 0, 1]) / G;
    this.out = { V, alpha, beta, mach, qbar, T, CL, stallMix, stallWarn: stallBuffet, nz, rho: atm.rho, lift, agl, ias: V * Math.sqrt(atm.sigma) };
    if (!this.onGround) this.maxG = Math.max(this.maxG, nz);
    if (nz > d.gLimit * 1.6 && !this.onGround) this._crash('Over-stressed the airframe');
    if (mach > d.mmo * 1.25 || V * Math.sqrt(atm.sigma) > d.vne * 1.35) this._crash('Exceeded maximum speed');
  }

  _contacts(dt) {
    const d = this.def, c = this.ctrl;
    let F = [0, 0, 0], M = [0, 0, 0];
    let anyGear = false;
    const points = [];
    if (this.gearPos > 0.95) for (const g of d.gear) points.push({ p: g, gear: true, kind: g[3] });
    for (const p of d.body) points.push({ p, gear: false });
    for (const pt of points) {
      const off = qrot(this.q, pt.p);
      const pen = this.groundH - (this.h + off[2]);
      if (pen <= 0) continue;
      const vp = add(this.vel, qrot(this.q, cross(this.w, pt.p)));
      if (!pt.gear) {
        const sp = len(vp);
        if (vp[2] < -4 || (sp > 12 && pen > 0.5)) {
          this._crash(Math.abs(pt.p[1]) > 2 ? (pt.p[2] < -1 ? 'Engine hit the ground' : 'Wingtip hit the ground') : pt.p[0] > 0 ? 'Nose hit the ground' : 'Tail hit the ground');
          return { F, M };
        }
        this.scrape = this.t;
      } else {
        anyGear = true;
        if (vp[2] < -5.2 && !this.wasOnGround) { this._crash('Landing gear collapsed (too hard)'); return { F, M }; }
      }
      const k = pt.gear ? d.gearK : d.gearK * 2, cdamp = pt.gear ? d.gearC : d.gearC * 2;
      let Nf = k * pen - cdamp * vp[2];
      if (Nf < 0) Nf = 0;
      // wheel rolling direction (horizontal projection of body x, nose wheel steered)
      let fwdB = [1, 0, 0];
      if (pt.kind === 'nose') {
        // nose-wheel steering, limited so a full-lock turn never pulls more than ~0.3 g sideways (no tip-overs)
        const V = Math.hypot(this.vel[0], this.vel[1]);
        const wb = this._wheelbase ??= Math.max(1, d.gear[0][0] - d.gear[1][0]);
        const maxSt = Math.min(d.steer, Math.atan((0.3 * G * wb) / Math.max(V * V, 1e-3)));
        const st = c.rud * maxSt;
        fwdB = [Math.cos(st), -Math.sin(st), 0];
      }
      let fw = qrot(this.q, fwdB); fw = [fw[0], fw[1], 0];
      const fl = Math.hypot(fw[0], fw[1]) || 1; fw = [fw[0] / fl, fw[1] / fl, 0];
      const side = [-fw[1], fw[0], 0];
      const vLong = vp[0] * fw[0] + vp[1] * fw[1];
      const vLat = vp[0] * side[0] + vp[1] * side[1];
      let muLong;
      if (pt.gear) {
        const brake = pt.kind === 'main' ? Math.max(c.brake, c.parking ? 1 : 0) : 0;
        muLong = 0.015 + brake * d.brake;
      } else muLong = 0.5;
      const fLong = -clamp(vLong * 8, -1, 1) * muLong * Nf;
      const fLat = -clamp(vLat * (pt.gear ? 15 : 3), -1, 1) * (pt.gear ? 0.75 : 0.5) * Nf; // tyres grip sideways (near-static friction)
      const f = [fw[0] * fLong + side[0] * fLat, fw[1] * fLong + side[1] * fLat, Nf];
      F = add(F, f);
      M = add(M, cross(pt.p, qinvrot(this.q, f)));
    }
    this.wasOnGround = this.onGround;
    this.onGround = anyGear;
    if (anyGear && !this.wasOnGround && !this.crashed) {
      const vs = this.vel[2];
      const o = hprFromQ(this.q);
      this.touchdown = { vs, fpm: vs / 0.3048 * 60, speed: len(this.vel), pitch: o.pitch, roll: o.roll, g: this.out.nz || 1, t: this.t };
    }
    // stop creeping when parked
    if (anyGear && len(this.vel) < 0.05 && (c.brake > 0.5 || c.parking) && this.N < 0.05) {
      this.vel = [0, 0, Math.min(this.vel[2], 0)];
    }
    return { F, M };
  }

  _crash(reason) { if (!this.crashed) { this.crashed = true; this.crashReason = reason; this.vel = [0, 0, 0]; this.w = [0, 0, 0]; } }

  // angle of attack + elevator for level flight at speed V (used to start in the air nicely trimmed)
  trimFor(V, flaps = 0) {
    const d = this.def, atm = atmosphere(this.h), q = 0.5 * atm.rho * V * V;
    const alpha = clamp(((d.mass * G) / (q * d.S) - d.CL0 - d.flapCL * flaps) / d.CLa, -0.1, d.alphaStall * 0.8);
    const N = this.throttleFor(V, 0);
    const elev = clamp(-(d.Cm0 + d.Cma * alpha + d.Cmflap * flaps) / (d.Cmde * ctrlAuth(q) * Math.min(propWash(d, N, q), 4)), -0.8, 0.8);
    return { alpha, elev };
  }

  // throttle setting needed for steady flight at speed V on flight path gammaDeg
  throttleFor(V, gammaDeg = 0) {
    const d = this.def, atm = atmosphere(this.h), q = 0.5 * atm.rho * V * V;
    const nF = d.flaps.length - 1, fl = nF > 0 ? this.ctrl.flaps / nF : 0;
    const CL = (d.mass * G * Math.cos(gammaDeg * DEG)) / (q * d.S);
    const D = q * d.S * (d.CD0 + d.k * CL * CL + d.flapCD * fl + d.gearCD * (this.ctrl.gearDown ? 1 : 0) + waveDrag(d, V / atm.a));
    const T = D + d.mass * G * Math.sin(gammaDeg * DEG);
    let N;
    if (d.engine === 'prop') N = Math.max(T / (d.staticThrust * atm.sigma), (T * V) / (d.power * Math.pow(atm.sigma, 0.9) * d.propEff));
    else N = T / jetThrust(d, 1, atm.sigma, V / atm.a, false);
    return clamp(N, 0.05, 1);
  }

  // start flying: trimmed for speed V on a flight path of gammaDeg
  spawnAir(latDeg, lonDeg, h, hdg, V, gammaDeg = 0) {
    this.reset(latDeg, lonDeg, h, hdg, V, 0);
    const nF = this.def.flaps.length - 1, fl = nF > 0 ? this.ctrl.flaps / nF : 0;
    this.flapPos = fl;
    const t = this.trimFor(V, fl);
    this.q = qFromHPR(hdg, t.alpha / DEG + gammaDeg, 0);
    this.vel = qrot(qFromHPR(hdg, gammaDeg, 0), [V, 0, 0]);
    this.ctrl.trim = t.elev;
    this.onGround = false; this.wasOnGround = false;
    return t;
  }

  // height of the centre of gravity above the ground when sitting on the wheels
  get restHeight() { return -Math.min(...this.def.gear.map((g) => g[2])) - 0.02; }

  get hpr() { return hprFromQ(this.q); }
  get latDeg() { return this.lat / DEG; }
  get lonDeg() { return this.lon / DEG; }
  get vs() { return this.vel[2]; }
  get groundSpeed() { return Math.hypot(this.vel[0], this.vel[1]); }
  get track() { return ((Math.atan2(this.vel[0], this.vel[1]) / DEG) + 360) % 360; }
}
