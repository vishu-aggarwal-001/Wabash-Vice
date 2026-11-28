// Cars you can drive anywhere on Earth (GTA-style handling).
// A bicycle-model car: slip-angle tyres with a friction circle, load transfer, engine power with automatic
// gears, aero drag, brakes, a handbrake that lets the rear slide, ground slopes, jumps off crests and ramps,
// and walls. Pure physics: the ground and walls come from callbacks, so it runs the same in tests.
// Body frame: x forward, y left, z up. eye = the bonnet camera. Heading psi: compass degrees (clockwise from north) in radians.

const G = 9.81, RHO = 1.225, R_EARTH = 6371000;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export const CARS = {
  sports: { name: 'Vortex GT', type: 'Supercar · rear-wheel drive', blurb: '0–100 km/h in 3 seconds. Lift off mid-corner and the tail comes round.', model: 'models/car-sports.glb', length: 4.55, b: 1.98,
    mass: 1500, power: 470e3, vmax: 89, cda: 0.62, mu: 1.18, wb: 2.7, track: 1.7, cgH: 0.45, wr: 0.34, drive: 'rwd', steerMax: 0.6, gears: 7, redline: 8200, eye: [1.2, 0, 1.0] },
  muscle: { name: 'Stallion 440', type: 'Muscle car · rear-wheel drive', blurb: 'Big V8, skinny grip. Smoky burnouts and long slides.', model: 'models/car-muscle.glb', length: 4.85, b: 1.92,
    mass: 1650, power: 340e3, vmax: 76, cda: 0.78, mu: 1.0, wb: 2.78, track: 1.62, cgH: 0.5, wr: 0.35, drive: 'rwd', steerMax: 0.58, gears: 5, redline: 6200, eye: [0.95, 0, 1.18] },
  police: { name: 'Interceptor', type: 'Police cruiser · rear-wheel drive', blurb: 'Pursuit-tuned sedan with a light bar. Stable and quick.', model: 'models/car-police.glb', length: 4.95, b: 1.88,
    mass: 1800, power: 320e3, vmax: 72, cda: 0.72, mu: 1.08, wb: 2.85, track: 1.6, cgH: 0.52, wr: 0.34, drive: 'rwd', steerMax: 0.58, gears: 6, redline: 6500, eye: [1.2, 0, 1.24] },
  taxi: { name: 'Metro Cab', type: 'Taxi · front-wheel drive', blurb: 'Soft, safe and slow to slide. Perfect for city streets.', model: 'models/car-taxi.glb', length: 4.9, b: 1.86,
    mass: 1700, power: 190e3, vmax: 56, cda: 0.7, mu: 0.98, wb: 2.82, track: 1.58, cgH: 0.52, wr: 0.33, drive: 'fwd', steerMax: 0.6, gears: 6, redline: 6000, eye: [1.2, 0, 1.24] },
  suv: { name: 'Ranger XL', type: 'SUV · four-wheel drive', blurb: 'All-wheel grip for hills, dirt and snow. Sits up high.', model: 'models/car-suv.glb', length: 4.85, b: 1.98,
    mass: 2200, power: 300e3, vmax: 64, cda: 0.98, mu: 0.98, wb: 2.9, track: 1.68, cgH: 0.7, wr: 0.4, drive: 'awd', steerMax: 0.58, gears: 8, redline: 6000, eye: [1.2, 0, 1.45] },
  pickup: { name: 'Hauler 2500', type: 'Pickup truck · four-wheel drive', blurb: 'Heavy, tough and unstoppable off-road.', model: 'models/car-pickup.glb', length: 5.6, b: 2.0,
    mass: 2500, power: 300e3, vmax: 58, cda: 1.1, mu: 0.92, wb: 3.5, track: 1.72, cgH: 0.75, wr: 0.42, drive: 'awd', steerMax: 0.55, gears: 6, redline: 5600, eye: [1.45, 0, 1.5] },
};

export class Car {
  constructor(def, latDeg, lonDeg, h, headingDeg) {
    this.def = def;
    this.lat = latDeg * Math.PI / 180; this.lon = lonDeg * Math.PI / 180; this.h = h;
    this.psi = headingDeg * Math.PI / 180;
    this.vx = 0; this.vy = 0; this.w = 0; this.vz = 0;       // forward, left (m/s), yaw rate (rad/s, + = left), climb
    this.delta = 0;                                          // steering angle (+ = left)
    this.pitch = 0; this.roll = 0; this.bodyPitch = 0; this.bodyRoll = 0;
    this.airborne = false; this.airT = 0;
    this.gear = 1; this.rpm = 900; this.shiftT = 0; this.reverse = false;
    this.spin = 0; this.slip = 0; this.ax = 0; this.ay = 0;
    this.groundH = h; this.wheelH = [h, h, h, h];
    this.impact = 0; this.impactT = 0; this.damage = 0; this.t = 0;
    const a = def.wb * 0.5;
    this.a = a; this.b = def.wb - a;
    this.Iz = def.mass * (def.wb * def.wb + def.track * def.track) * 0.28;
    this.gearTop = Array.from({ length: def.gears }, (_, i) => def.vmax * Math.pow((i + 1) / def.gears, 0.72));
  }
  get latDeg() { return this.lat * 180 / Math.PI; }
  get lonDeg() { return this.lon * 180 / Math.PI; }
  get headingDeg() { return ((this.psi * 180 / Math.PI) % 360 + 360) % 360; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  // world offset (metres east, north) of a body point
  offset(x, y) { const s = Math.sin(this.psi), c = Math.cos(this.psi); return [x * s - y * c, x * c + y * s]; }
  toLatLon(dE, dN, lat = this.lat, lon = this.lon) {
    return [(lat + dN / R_EARTH) * 180 / Math.PI, (lon + dE / (R_EARTH * Math.max(0.05, Math.cos(lat)))) * 180 / Math.PI];
  }
  // wheel contact points [FL, FR, RL, RR] as [latDeg, lonDeg]
  wheels(lat = this.lat, lon = this.lon, psi = this.psi) {
    const d = this.def, s = Math.sin(psi), c = Math.cos(psi), out = [];
    for (const [x, y] of [[this.a, d.track / 2], [this.a, -d.track / 2], [-this.b, d.track / 2], [-this.b, -d.track / 2]]) {
      const dE = x * s - y * c, dN = x * c + y * s;
      out.push(this.toLatLon(dE, dN, lat, lon));
    }
    return out;
  }

  // inp: { throttle 0..1, brake 0..1, steer -1..1 (+ = right), handbrake bool }
  // ground(latDeg, lonDeg, fromH, slot) -> ellipsoid height or undefined; wall(latDeg, lonDeg, h, bearingDeg, len) -> distance or null
  step(dt, inp, ground, wall) {
    const d = this.def;
    this.t += dt;
    // steering: speed-sensitive, rate-limited (+ steer input = right = negative delta)
    const v = this.speed;
    // steering lock shrinks with speed to about what the tyres can use (keeps it driveable on a keyboard)
    const maxD = Math.min(d.steerMax / (1 + (v / 30) ** 2), Math.atan((d.wb * d.mu * G) / Math.max(v * v, 1)) + 0.05);
    const want = -clamp(inp.steer, -1, 1) * maxD;
    const rate = Math.abs(want) > Math.abs(this.delta) && Math.sign(want) === Math.sign(this.delta || want) ? 2.6 : 5;
    this.delta += clamp(want - this.delta, -rate * dt, rate * dt);
    // ground under the wheels
    const W = this.wheels();
    for (let i = 0; i < 4; i++) { const g = ground(W[i][0], W[i][1], this.h + 2.5, i); if (g !== undefined && isFinite(g)) this.wheelH[i] = g; }
    const [hFL, hFR, hRL, hRR] = this.wheelH;
    const gH = (hFL + hFR + hRL + hRR) / 4;
    this.pitch = Math.atan2((hFL + hFR) / 2 - (hRL + hRR) / 2, d.wb);
    this.roll = Math.atan2((hFL + hRL) / 2 - (hFR + hRR) / 2, d.track);
    // gears (automatic) and reverse: brake at a standstill = reverse, throttle = forward again
    if (this.vx < 0.8 && inp.brake > 0.5 && inp.throttle < 0.1) this.reverse = true;
    if (inp.throttle > 0.1 && this.vx > -0.8) this.reverse = false;
    this.shiftT = Math.max(0, this.shiftT - dt);
    const gTop = this.gearTop[this.gear - 1];
    const vxa = Math.abs(this.vx);
    const idle = 900;
    this.rpm = this.reverse ? idle + (d.redline - idle) * clamp(vxa / 14, 0, 1) : idle + (d.redline - idle) * clamp(vxa / gTop, 0, 1.02);
    if (!this.reverse && this.shiftT <= 0) {
      if (this.rpm > d.redline * 0.94 && this.gear < d.gears) { this.gear++; this.shiftT = 0.16; }
      else if (this.gear > 1 && vxa < this.gearTop[this.gear - 2] * 0.62) { this.gear--; this.shiftT = 0.1; }
    }
    if (this.reverse) this.gear = 1;
    // a little free revving when the wheels spin or the clutch is in at a standstill
    if (vxa < 3 && inp.throttle > 0) this.rpm = Math.max(this.rpm, idle + (d.redline * 0.55 - idle) * inp.throttle);
    // physics substeps
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    let slipSum = 0;
    for (let k = 0; k < n; k++) slipSum += this._sub(h, inp, gH);
    this.slip = slipSum / n;
    // move
    const s = Math.sin(this.psi), c = Math.cos(this.psi);
    const vE = this.vx * s - this.vy * c, vN = this.vx * c + this.vy * s;
    const lat0 = this.lat, lon0 = this.lon, psi0 = this.psi;
    this.lat += (vN * dt) / R_EARTH;
    this.lon += (vE * dt) / (R_EARTH * Math.max(0.05, Math.cos(this.lat)));
    this.psi -= this.w * dt; // + yaw rate = left = heading decreasing
    // walls: a step up of more than ~0.6 m where the car is heading, or a hit from the wall ray
    this.impact = 0;
    const mv = Math.sign(this.vx) || 1;
    const nw = this.wheels();
    const frontIdx = mv > 0 ? [0, 1] : [2, 3];
    let hit = false;
    for (const i of frontIdx) {
      const g = ground(nw[i][0], nw[i][1], this.h + 2.5, 4 + i);
      if (g !== undefined && isFinite(g) && g - this.h > 0.65 + Math.max(0, this.airborne ? 0 : 0.15)) hit = true;
    }
    if (wall && v > 0.5) {
      const bearing = (Math.atan2(vE, vN) * 180) / Math.PI;
      const ahead = (mv > 0 ? this.a + 1.0 : this.b + 0.9);
      const dist = wall(this.latDeg, this.lonDeg, this.h + 0.9, bearing, ahead + v * dt * 3 + 0.5);
      if (dist !== null && dist !== undefined && dist < ahead + v * dt * 1.5) hit = true;
    }
    if (hit) {
      this.lat = lat0; this.lon = lon0; this.psi = psi0;
      this.impact = v; this.impactT = this.t;
      this.damage = Math.min(1, this.damage + Math.max(0, v - 4) / 60);
      this.vx = -0.25 * this.vx; this.vy *= 0.4; this.w = this.w * 0.4 + (Math.random() - 0.5) * Math.min(1.5, v / 15);
    }
    // vertical: follow the ground, or fly off crests and ramps (ballistic) and land again
    const gH2 = gH;
    if (!this.airborne) {
      const ballistic = this.h + this.vz * dt - 0.5 * G * dt * dt;
      if (gH2 < ballistic - 0.05 && v > 6) { this.airborne = true; this.airT = 0; }
      else { const vz = (gH2 - this.h) / Math.max(dt, 1e-3); this.vz = clamp(vz, -30, 30); this.h = gH2; }
    }
    if (this.airborne) {
      this.airT += dt;
      this.vz -= G * dt; this.h += this.vz * dt;
      if (this.h <= gH2) {
        this.impact = Math.max(this.impact, Math.abs(this.vz) * 0.6); this.impactT = this.t;
        if (this.vz < -9) this.damage = Math.min(1, this.damage + (-this.vz - 9) / 40);
        this.h = gH2; this.vz = 0; this.airborne = false;
      }
    }
    this.groundH = gH2;
    // body pitch and roll: the ground's slope plus lean from braking/accelerating and cornering
    const tp = this.airborne ? this.bodyPitch - dt * 0.15 : this.pitch - clamp(this.ax, -12, 12) * 0.0045;
    const tr = this.airborne ? this.bodyRoll : this.roll - clamp(this.ay, -12, 12) * 0.008;
    const k = 1 - Math.exp(-dt * (this.airborne ? 1.5 : 9));
    this.bodyPitch += (tp - this.bodyPitch) * k;
    this.bodyRoll += (tr - this.bodyRoll) * k;
    // wheels spin
    this.spin += (this.vx / d.wr) * dt;
  }

  _sub(h, inp, gH) {
    const d = this.def, m = d.mass, L = d.wb, a = this.a, b = this.b;
    const air = this.airborne;
    const vx = this.vx, vy = this.vy, w = this.w, del = this.delta;
    // loads with longitudinal transfer
    const gx = -G * Math.sin(this.pitch), gy = -G * Math.sin(this.roll);
    let Fzf = m * G * Math.cos(this.pitch) * (b / L) - m * this.ax * d.cgH / L;
    let Fzr = m * G * Math.cos(this.pitch) * (a / L) + m * this.ax * d.cgH / L;
    Fzf = Math.max(0.12 * m * G, Fzf); Fzr = Math.max(0.12 * m * G, Fzr);
    const mu = d.mu * (1 - this.damage * 0.2);
    const Df = mu * Fzf, Dr0 = mu * Fzr;
    // engine and drive force
    const shiftDip = this.shiftT > 0 ? 0.25 : 1;
    let Fdrive = 0;
    const v = Math.hypot(vx, vy);
    if (this.reverse) {
      const thr = inp.brake;
      if (vx > -13) Fdrive = -thr * Math.min(m * G * 0.45, (d.power * 0.35) / Math.max(Math.abs(vx), 3));
    } else if (inp.throttle > 0) {
      const top = 1 - clamp((vx - d.vmax * 0.92) / (d.vmax * 0.08), 0, 1);
      Fdrive = inp.throttle * Math.min(m * G * 1.2, (0.86 * d.power) / Math.max(Math.abs(vx), 7)) * shiftDip * top;
    }
    // brakes (ABS: up to the tyre limit) and handbrake (rear locks)
    let Bf = 0, Br = 0;
    const sgn = Math.abs(vx) > 0.15 ? Math.sign(vx) : 0;
    if (!this.reverse && inp.brake > 0) { const Fb = inp.brake * m * G * 1.05; Bf = Fb * 0.66; Br = Fb * 0.34; }
    const hb = !!inp.handbrake;
    // split the drive force between the axles
    const fr = d.drive === 'fwd' ? 1 : d.drive === 'awd' ? 0.42 : 0;
    // traction control: the driven wheels never get more than ~80% of their grip (some left for cornering)
    const keep = 0.97 - 0.25 * clamp(Math.abs(del) / 0.08, 0, 1); // straight: nearly all the grip; turning: leave some
    const tcs = Math.min(1, (fr > 0 ? (keep * Df) / Math.max(1, Fdrive * fr) : 1), (fr < 1 ? (keep * Dr0) / Math.max(1, Fdrive * (1 - fr)) : 1));
    if (Fdrive > 0 && Math.abs(vx) > 2) Fdrive *= tcs;
    let Fxf = Fdrive * fr - Bf * sgn, Fxr = Fdrive * (1 - fr) - Br * sgn;
    if (hb) Fxr = -sgn * Dr0 * 0.85;
    // at (almost) a standstill brakes hold the car instead of pushing it backwards
    if (sgn === 0 && !this.reverse && Fdrive === 0) { Fxf = 0; Fxr = 0; }
    Fxf = clamp(Fxf, -Df, Df); Fxr = clamp(Fxr, -Dr0, Dr0);
    // lateral tyre forces: front in the wheel frame, rear with what grip is left (friction circle)
    const tyre = (alpha, D) => -D * Math.sin(1.4 * Math.atan(18 * alpha));
    const vyf = vy + w * a, vyr = vy - w * b;
    const cd = Math.cos(del), sd = Math.sin(del);
    const vxw = vx * cd + vyf * sd, vyw = -vx * sd + vyf * cd;
    const vref = Math.max(Math.abs(vxw), 1.5), vrefR = Math.max(Math.abs(vx), 1.5);
    const alphaF = Math.atan(vyw / vref), alphaR = Math.atan(vyr / vrefR);
    const Dfl = Math.sqrt(Math.max(0, Df * Df - Fxf * Fxf));
    const Dr = (hb ? Dr0 * 0.42 : Dr0);
    const Drl = Math.sqrt(Math.max(0, Dr * Dr - Fxr * Fxr));
    let Fyw = tyre(alphaF, Dfl), Fyr = tyre(alphaR, Drl);
    if (air) { Fyw = 0; Fyr = 0; Fxf = 0; Fxr = 0; }
    // drag and rolling resistance
    const drag = 0.5 * RHO * d.cda * v * vx, roll = air ? 0 : 0.013 * m * G * Math.tanh(vx * 2);
    const FxB = Fxf * cd - Fyw * sd + Fxr - drag - roll;
    const FyB = Fxf * sd + Fyw * cd + Fyr - 0.5 * RHO * d.cda * 2.5 * v * vy;
    let ax = FxB / m + (air ? 0 : gx), ay = FyB / m + (air ? 0 : gy);
    let dw = (a * (Fxf * sd + Fyw * cd) - b * Fyr) / this.Iz;
    // arcade stability help (GTA-like): damps runaway spins unless you are on the handbrake
    if (!air && !hb && Math.abs(vx) > 3) {
      const wMax = (mu * G * 0.9) / Math.max(v, 1);
      const wKin = clamp((vx * Math.tan(del)) / L, -wMax, wMax);
      dw -= (w - wKin) * (Math.abs(Math.atan2(vy, Math.abs(vx))) > 0.1 ? 6.0 : 1.5);
    }
    this.vx += (ax + w * vy) * h;
    this.vy += (ay - w * vx) * h;
    this.w += dw * h;
    if (air) this.w *= 1 - 0.3 * h;
    // low speed: kinematic steering (no tyre slip below a walk)
    const kmix = clamp((Math.abs(this.vx) - 0.5) / 3, 0, 1);
    if (!air && kmix < 1) {
      const wKin = (this.vx * Math.tan(del)) / L;
      this.w = this.w * kmix + wKin * (1 - kmix);
      this.vy *= kmix + (1 - kmix) * 0.9;
    }
    // a parked car stays parked (no creeping on the brakes or from tiny forces)
    if (!air && Math.abs(this.vx) < 0.15 && Fdrive === 0 && (inp.brake > 0 || hb || inp.throttle === 0)) {
      const hold = (inp.brake > 0 || hb) ? 1 : 0.02;
      if (Math.abs(gx) < mu * G * 0.9 || hold === 1) this.vx *= 1 - Math.min(1, 40 * h * hold + 0.5 * h);
    }
    this.ax = ax; this.ay = ay; // accelerations felt in the car (for load transfer and body lean)
    return Math.max(Math.abs(alphaR) * (Math.abs(vx) > 4 ? 1 : 0), hb && Math.abs(vx) > 3 ? 0.3 : 0, Math.abs(Fdrive) > Dr0 * 0.98 && Math.abs(vx) < 15 && d.drive === 'rwd' ? 0.25 : 0);
  }
}
