// Autopilot (HDG / ALT / VS / SPD / NAV direct-to / APP approach) and the "assisted" flight laws
// (auto-trim, auto-rudder, bank + g protection) that make the planes easy to fly with keyboard or touch.
import { DEG, KT, FT, clamp, wrap180, bearingDeg, distM } from './math.js';
import { stallSpeed } from './physics.js';

// elevator gain schedule: normalise by elevator power and dynamic pressure
export function gainSched(fm) {
  const d = fm.def, qref = 0.5 * 1.225 * (d.vr * 1.3) ** 2;
  return (0.42 / d.Cmde) * clamp(qref / Math.max(fm.out.qbar || qref, 50), 0.06, 2.5);
}

export class Autopilot {
  constructor() {
    this.on = false; this.hdgMode = 'HDG'; this.vMode = 'ALT'; this.athr = true;
    this.hdg = 0; this.alt = 1000; this.vs = 0; this.spd = 120 * KT;
    this.target = null; // {lat, lon, hdg, elevM, ident} - runway threshold for NAV/APP
    this.msg = '';
  }
  engage(fm) {
    const o = fm.hpr;
    this.on = true; this.hdg = Math.round(o.heading); this.alt = Math.round((fm.h - (fm.geoidN || 0)) / FT / 100) * 100 * FT; // MSL
    this.spd = Math.max(fm.out.ias || fm.out.V || fm.def.cruise, fm.def.vref * 1.3); this.vMode = 'ALT'; this.hdgMode = 'HDG';
    // engaged while climbing or descending: keep that vertical speed and level off 1,000 ft further on
    const vsNow = fm.vs, aglNow = fm.h - fm.groundH;
    if (Math.abs(vsNow) > 300 * FT / 60 && (vsNow > 0 || aglNow > 2500 * FT)) {
      this.vMode = 'VS'; this.vs = Math.round(vsNow / FT * 60 / 100) * 100 * FT / 60;
      this.alt = Math.max(0, this.alt + Math.sign(vsNow) * 1000 * FT);
    }
    // never hold an altitude below 1,000 ft above the ground here
    this.alt = Math.max(this.alt, Math.ceil((fm.groundH - (fm.geoidN || 0) + 1000 * FT) / FT / 100) * 100 * FT);
    this.pI = fm.ctrl.trim / gainSched(fm);
    this.tI = fm.ctrl.throttle; this.landed = false; this.xI = 0; this.rollout = false; this.lastElev = undefined;
  }
  disengage(msg) { this.on = false; this.rollout = false; this.msg = msg || ''; }

  // returns {elev, ail, rud, throttle|null, brake, spoilers, reverse} the AP wants this frame
  // (or null when it hands back control)
  fly(fm, dt) {
    const d = fm.def, o = fm.hpr, V = Math.max(fm.out.V || 0, 1);
    const lat = fm.latDeg, lon = fm.lonDeg, agl = fm.h - fm.groundH;
    const track = fm.groundSpeed > 5 ? fm.track : o.heading;
    let wantHdg = this.hdg, useTrack = false, wantVs = 0, info = null, flare = false, retard = false;
    if ((this.hdgMode === 'NAV' || this.hdgMode === 'APP') && this.target) {
      const t = this.target;
      const dist = distM(lat, lon, t.lat, t.lon), brg = bearingDeg(lat, lon, t.lat, t.lon);
      if (this.hdgMode === 'NAV') { wantHdg = brg; useTrack = true; if (dist < 15000) this.msg = 'Near destination: press APP to land'; }
      else {
        // localizer: xtk > 0 means we are left of the extended centre line
        const off = wrap180(brg - t.hdg);
        const xtk = dist * Math.sin(off * DEG), along = dist * Math.cos(off * DEG);
        if (fm.onGround || this.rollout) return this._rollout(fm, t, xtk, dt);
        if (Math.abs(xtk) < 120) this.xI = clamp((this.xI || 0) + xtk * dt * 0.002, -4, 4); else this.xI = 0;
        wantHdg = t.hdg + clamp(xtk * 0.06 + this.xI, -35, 35); useTrack = true;
        if (along < 0) wantHdg = t.hdg;
        // glideslope: 3 degrees to the aiming point 300 m past the threshold (crosses the threshold at 50 ft)
        // (referenced to the runway height at the aiming point, so sloped runways work)
        const gsAlt = (t.aimElevM ?? t.elevM) + Math.tan(3 * DEG) * Math.max(along + 300, 0);
        info = { d: dist, xtk, gsErr: fm.h - fm.restHeight - gsAlt };
        const fa = d.flareAlt || 14;
        const aglG = agl - fm.restHeight; // height of the wheels, not the centre of gravity
        info.aglG = aglG;
        // not stable on the approach (far too high, or diving) close to the ground: go around, never force a landing
        if (aglG < 250 && aglG > fa && (info.gsErr > 60 || fm.vs < -9.5 || Math.abs(xtk) > 90)) return this._goAround(fm, t);
        if (aglG < fa) flare = true;
        if (aglG < Math.min(fa * 0.6, 9)) retard = true;
      }
    }
    // ---- lateral: heading/track -> bank -> roll rate -> aileron (model based so it suits every plane)
    const hdgErr = wrap180(wantHdg - (useTrack ? track : o.heading));
    const bankLimit = flare ? 5 : this.hdgMode === 'APP' ? 22 : 27;
    const wantBank = clamp(hdgErr * 1.8, -bankLimit, bankLimit);
    const pRatePerAil = Math.max(0.05, (-d.Clda * 2 * V) / (d.Clp * d.b));
    const pCmd = clamp((wantBank - o.roll) * DEG * 0.9, -0.3, 0.3);
    let ail = clamp((pCmd + 0.8 * (pCmd - fm.w[0])) / pRatePerAil, -1, 1);
    // yaw damper / turn coordinator
    let rud = clamp(fm.out.beta * 6, -1, 1);
    if (flare && info) {
      // de-crab: rudder lines the nose up with the runway, a wing-low bank stops the sideways drift
      const t = this.target, gsp = Math.max(fm.groundSpeed, 1);
      const drift = gsp * Math.sin(wrap180(track - t.hdg) * DEG); // m/s, + = drifting right
      const crab = wrap180(t.hdg - o.heading);
      rud = clamp(crab * 0.12 + fm.w[2] * 2.5, -1, 1);
      const bank = clamp(info.xtk * 0.4 - drift * 3 + fm.out.beta / DEG * 0.4, -8, 8);
      const pc = clamp((bank - o.roll) * DEG * 1.2, -0.3, 0.3);
      ail = clamp((pc + 0.8 * (pc - fm.w[0])) / pRatePerAil, -1, 1);
    }
    // ---- vertical: altitude / vertical speed / glideslope -> flight-path angle -> elevator
    // slower (heavier) aircraft get gentler outer-loop gains: scale by short-period frequency
    const wsp = Math.sqrt(((fm.out.qbar || 1) * d.S * d.c * Math.abs(d.Cma)) / d.inertia[1]);
    const k = clamp(wsp / 2.5, 0.25, 1);
    this.gk = Math.sqrt(k);
    const hMsl = fm.h - (fm.geoidN || 0); // ALT and V/S targets are heights above sea level
    if (this.vMode === 'ALT') wantVs = clamp((this.alt - hMsl) * 0.1 * this.gk, -15, 15);
    else if (this.vMode === 'VS') {
      wantVs = this.vs;
      if (Math.abs(this.alt - hMsl) < Math.abs(this.vs) * 6 + 20) this.vMode = 'ALT';
      else if (Math.sign(this.alt - hMsl) !== Math.sign(this.vs || 1)) wantVs = 0;
    }
    // terrain floor: outside an approach the autopilot never descends below 800 ft above the ground
    this.terrain = false;
    if (!info && agl < 800 * FT) { const floorVs = (800 * FT - agl) * 0.08; if (wantVs < floorVs) { wantVs = floorVs; this.terrain = true; } }
    // speed protection: never climb the aircraft into a stall
    const Vi = fm.out.ias || V; // indicated airspeed: speed bugs, Vref and stall speeds are all IAS
    const vmin = d.vref * 1.05;
    // (a smooth limit: the slower you are, the less climb is allowed; no on/off switching that would porpoise)
    if (!info) wantVs = Math.min(wantVs, Math.max(-4, (Vi - vmin * 1.12) * 1.2));
    if (info) {
      wantVs = -Math.tan(3 * DEG) * fm.groundSpeed - clamp(info.gsErr * 0.1 * this.gk, -5, 5);
      // flare: exponential sink-rate law, continuous with the 3 degree glide at flare height,
      // aiming for about 80 ft/min at touchdown
      if (flare) {
        const fa = d.flareAlt || 14, tau = fa / Math.max(1, Math.tan(3 * DEG) * fm.groundSpeed);
        // relative to the ground: on an up-sloping runway the ground rises to meet you
        const trk = (useTrack ? track : o.heading) * DEG, g = fm.groundGrad || [0, 0];
        const rise = fm.groundSpeed * (g[0] * Math.sin(trk) + g[1] * Math.cos(trk));
        wantVs = rise - Math.max(0.4, info.aglG / tau);
      }
    }
    // on an approach the glide path is trusted only near the runway: further out, stay 500 ft above the ground,
    // and never dive at more than 7 degrees to catch the glide path
    if (info) {
      if (info.d > 3500 && agl < 500 * FT) { const floorVs = (500 * FT - agl) * 0.08; if (wantVs < floorVs) { wantVs = floorVs; this.terrain = true; } }
      wantVs = Math.max(wantVs, -Math.tan(7 * DEG) * Math.max(fm.groundSpeed, 1));
    }
    const gammaCmd = Math.asin(clamp(wantVs / V, -0.35, 0.35));
    const gamma = Math.asin(clamp(fm.vs / V, -1, 1));
    const gs = gainSched(fm);
    const err = gammaCmd - gamma;
    const kf = flare ? 2.2 : 1;
    if (!flare) this.pI = clamp((this.pI || 0) + err * dt * 1.6 * k, -1.5, 1.5); // frozen in the flare (stops ballooning)
    const turnComp = (1 / Math.max(Math.cos(o.roll * DEG), 0.5) - 1) * 0.15;
    let elev = gs * (4 * Math.sqrt(k) * kf * err + this.pI + 1.0 * fm.w[1] / Math.sqrt(k)) + turnComp;
    // angle-of-attack protection: the autopilot never pulls the wing into a stall
    const aProt = d.alphaStall + d.flapStall * fm.flapPos - 4 * DEG, aEx = fm.out.alpha - aProt;
    if (aEx > 0) { elev -= (aEx / DEG) * 0.12; this.pI = Math.max(-1.5, this.pI - aEx * dt * 3); }
    // comfortable g: the autopilot never pulls past +1.5 g or pushes below +0.5 g
    const nz = fm.out.nz || 1;
    if (nz > 1.5 && elev > 0) elev -= (nz - 1.5) * gs * 0.5;
    if (nz < 0.5) elev += (0.5 - nz) * gs * 0.5;
    if (o.pitch > 20) elev -= (o.pitch - 20) * 0.05;
    if (flare && o.pitch > (d.rotatePitch || 10) - 1) elev -= (o.pitch - (d.rotatePitch || 10) + 1) * 0.15;
    if (o.pitch < -15) elev += (-15 - o.pitch) * 0.05;
    // ---- autothrottle
    let thr = null;
    if (this.athr) {
      // target IAS, never above the maximum Mach number up high
      const sig = (fm.out.rho || 1.225) / 1.225, aSnd = V / Math.max(fm.out.mach || 1e-3, 1e-3);
      const spd = Math.min(info ? d.vref + 5 * KT : Math.max(this.spd, d.vref * 1.25), d.mmo * 0.97 * aSnd * Math.sqrt(sig));
      this.tI = clamp((this.tI ?? 0.5) + ((spd - Vi) / spd) * dt * 0.6, 0, 1);
      thr = clamp(this.tI + ((spd - Vi) / spd) * 3 - fm.vs * 0.004, 0, 1);
      if (retard) { thr = 0; this.tI = 0; }
    }
    // smooth hands: the elevator moves at most 1.5 full-travels per second
    const e0 = this.lastElev ?? clamp(fm.ctrl.elev + fm.ctrl.trim, -1, 1);
    elev = e0 + clamp(clamp(elev, -1, 1) - e0, -1.5 * dt, 1.5 * dt);
    this.lastElev = elev;
    this.info = info; this.dbg = { wantHdg, hdgErr, wantBank, ail, track };
    return { elev, ail, rud, throttle: thr };
  }

  // go-around: climb straight ahead to 2,000 ft above the runway and hand back to heading/altitude modes
  _goAround(fm, t) {
    this.hdgMode = 'HDG'; this.hdg = Math.round(t.hdg); this.vMode = 'VS'; this.vs = (fm.def.engine === 'prop' ? 700 : 1500) * FT / 60;
    this.alt = Math.round(((t.elevM - (fm.geoidN || 0)) / FT + 2000) / 100) * 100 * FT;
    this.athr = true; this.spd = Math.max(this.spd, fm.def.vref * 1.3);
    fm.ctrl.flaps = Math.min(fm.ctrl.flaps, fm.def.takeoffFlaps ?? 1); // go-around flaps
    this.msg = 'Go-around: approach not stable. Climbing to 2,000 ft above the runway';
    this.goAround = true;
    return { elev: this.lastElev ?? 0, ail: 0, rud: 0, throttle: 1, goAround: true };
  }

  // after an autoland: keep the wings level into the wind, steer down the centre line, brakes,
  // spoilers and reversers, then hand back control once slow
  _rollout(fm, t, xtk, dt) {
    const d = fm.def, o = fm.hpr, gs = fm.groundSpeed;
    if (!this.rollout) { this.rollout = true; this.msg = 'Touchdown: rolling out'; }
    if (gs < 4) { this.rollout = false; this.landed = true; this.disengage('Autoland complete: you have control'); return null; }
    const wantHdg = t.hdg + clamp(xtk * 0.25, -8, 8);
    const rud = clamp(wrap180(wantHdg - o.heading) * 0.15 + fm.w[2] * 1.5, -1, 1);
    const ail = clamp(fm.out.beta * 4 - o.roll * 0.15 + fm.w[0] * -0.3, -1, 1);
    const elev = o.pitch > 1 ? -0.15 : 0;
    const rev = !!d.reverse && gs > 60 * KT;
    return { elev, ail, rud, throttle: rev ? 0.7 : 0, reverse: rev, brake: gs > 3 ? 0.6 : 1, spoilers: d.spoilerCD ? 1 : 0, rollout: true };
  }
}

// assisted flying: pilot keeps the stick, the computer helps
export class FlightAssist {
  constructor() { this.holdGamma = null; this.holdBank = null; this.trim = 0; this.i = 0; }
  apply(fm, stick, dt, enabled) {
    const d = fm.def, o = fm.hpr, V = fm.out.V || 0;
    let elev = stick.y, ail = stick.x, rud = stick.rud;
    if (!enabled) return { elev, ail, rud, trim: null };
    // ground: let the roll keys steer too (so keyboard/touch players can taxi)
    if (fm.onGround) {
      const gs = fm.groundSpeed;
      if (Math.abs(rud) < 0.05) {
        if (Math.abs(ail) > 0.05) { rud = clamp(ail * 1.2, -1, 1); this.gndHdg = null; }
        else if (gs > 5 && this.runway && this._onRunway(fm)) {
          // hands off on a runway: follow its centre line (take-off and landing roll)
          const R = this.runway, b = bearingDeg(R.lat, R.lon, fm.latDeg, fm.lonDeg), dd = distM(R.lat, R.lon, fm.latDeg, fm.lonDeg);
          const xtk = dd * Math.sin((b - R.hdg) * DEG); // + = right of the centre line
          const want = R.hdg - clamp(xtk * 0.4, -10, 10);
          const e = wrap180(want - o.heading);
          this.gI = clamp((this.gI || 0) + e * dt * 0.1, -0.5, 0.5); this.gndHdg = null;
          rud = clamp(e * 0.3 + this.gI + fm.w[2] * 2.5, -1, 1);
        } else if (gs > 0.5) {
          // hands off: keep rolling straight (holds the heading you had when you let go of the steering)
          // just landed after a de-crab: keep rolling the way we were tracking (the runway), not where the nose bounced
          if (this.gndHdg == null) { this.gndHdg = this.landTrack != null && fm.t - this.landTrackT < 4 ? this.landTrack : o.heading; this.gI = 0; }
          const e = wrap180(this.gndHdg - o.heading);
          this.gI = clamp(this.gI + e * dt * 0.15, -0.6, 0.6);
          rud = clamp(e * 0.35 + this.gI + fm.w[2] * 2.5, -1, 1);
        }
      } else this.gndHdg = null;
      // keep the upwind wing down in a crosswind
      ail = ail * 0.25 + (V > 10 ? clamp(fm.out.beta * 4 - o.roll * 0.15 - fm.w[0] * 0.3, -1, 1) : 0);
      this.liftoffT = 0;
      // tail-strike protection while rotating
      const maxP = d.rotatePitch || 10;
      if (elev > 0) elev = Math.min(elev, clamp((maxP - o.pitch) * 0.12, 0, 1));
      this.holdGamma = null; this.holdBank = null; this.i = 0;
      return { elev, ail: clamp(ail, -1, 1), rud, trim: 0 };
    }
    this.gndHdg = null;
    // about to land in a crosswind: auto-rudder lines the nose up with the direction of travel (de-crab)
    const aglG = fm.h - fm.groundH - fm.restHeight;
    // (starts about 1.5 s before touchdown, and banks the upwind wing down a little so you don't drift)
    if (Math.abs(rud) < 0.05 && fm.gearPos > 0.95 && fm.vs < 0 && aglG < Math.max(1.5, -fm.vs * 1.5) && fm.groundSpeed > 10) {
      // big jets keep some crab into the touchdown (as their pilots do); light aircraft line up fully
      const frac = d.b > 40 ? 0.5 : 1;
      rud = clamp(wrap180(fm.track - o.heading) * frac * 0.12 + fm.w[2] * 2.5, -1, 1);
      this.decrab = true; this.landTrack = fm.track; this.landTrackT = fm.t;
    } else this.decrab = false;
    if (!this.decrab && Math.abs(rud) < 0.05) rud = clamp(fm.out.beta * 6, -0.6, 0.6); // auto-rudder: kill sideslip
    return this._air(fm, stick, dt, elev, ail, rud);
  }

  // on (and lined up with) the runway we know about?
  _onRunway(fm) {
    const R = this.runway, o = fm.hpr;
    const b = bearingDeg(R.lat, R.lon, fm.latDeg, fm.lonDeg), dd = distM(R.lat, R.lon, fm.latDeg, fm.lonDeg);
    const along = dd * Math.cos((b - R.hdg) * DEG), xtk = dd * Math.sin((b - R.hdg) * DEG);
    return Math.abs(xtk) < (R.halfW || 25) + 15 && along > -100 && along < (R.len || 4000) + 100 && Math.abs(wrap180(o.heading - R.hdg)) < 25;
  }

  _air(fm, stick, dt, elev, ail, rud) {
    const d = fm.def, o = fm.hpr, V = fm.out.V || 0;
    // bank hold: let go of the stick and the wings stay where you left them (small banks level out);
    // while de-crabbing the hold banks a few degrees into the wind instead
    if (Math.abs(stick.x) < 0.04) {
      if (this.holdBank === null) this.holdBank = Math.abs(o.roll) < 6 ? 0 : clamp(o.roll, -33, 33);
      const want = this.decrab ? clamp(fm.out.beta / DEG * 0.5, -6, 6) : this.holdBank;
      const pRate = Math.max(0.05, (-d.Clda * 2 * Math.max(V, 1)) / (d.Clp * d.b));
      const pCmd = clamp((want - o.roll) * DEG * 0.8, -0.25, 0.25);
      ail = clamp((pCmd + 0.8 * (pCmd - fm.w[0])) / pRate, -0.6, 0.6);
    } else this.holdBank = null;

    // bank protection beyond 67 degrees (fighter: none)
    if (d.gLimit < 6) {
      if (Math.abs(o.roll) > 55 && Math.sign(ail) === Math.sign(o.roll)) ail *= clamp((70 - Math.abs(o.roll)) / 15, 0, 1);
      if (Math.abs(o.roll) > 67) ail += clamp(-(o.roll - Math.sign(o.roll) * 67) * 0.05, -1, 1);
    }
    // auto-trim: when the stick is released, hold the current flight-path angle (PI + pitch-rate damping,
    // gains scaled by elevator power and dynamic pressure so every aircraft behaves the same)
    const gamma = Math.atan2(fm.vs, Math.max(fm.groundSpeed, 1));
    const gs = gainSched(fm);
    if (Math.abs(stick.y) < 0.04 && V > d.vr * 0.8 && Math.abs(o.roll) < 60) {
      if (this.holdGamma === null) {
        const strong = d.engine !== 'prop' || (d.staticThrust * (d.engines || 1)) / (d.mass * 9.81) > 0.35;
        this.holdGamma = clamp(gamma, -10 * DEG, (strong ? 12 : 7) * DEG); this.i = fm.ctrl.trim / gs;
        // just took off? keep climbing away instead of settling back onto the runway
        if (fm.h - fm.groundH < 150 && o.pitch > 4 && fm.ctrl.throttle > 0.5) this.holdGamma = Math.max(this.holdGamma, (d.engine === 'prop' ? 5 : 7) * DEG);
      }
      // too slow for this climb? ease the held climb angle down until the speed is healthy again
      if (!d._vsA) d._vsA = [stallSpeed(d, 0), stallSpeed(d, 1)];
      const vsF = d._vsA[0] + (d._vsA[1] - d._vsA[0]) * fm.flapPos, iasNow = fm.out.ias || V;
      if (iasNow < vsF * 1.3 && this.holdGamma > -3 * DEG) this.holdGamma -= clamp((vsF * 1.3 - iasNow) / vsF, 0, 0.3) * dt * 6 * DEG;
      const err = this.holdGamma - gamma;
      this.i = clamp(this.i + err * dt * 0.5, -2, 2);
      this.trim = clamp(gs * (1.1 * err + this.i + 0.5 * fm.w[1]), -0.7, 0.7);
    } else if (Math.abs(stick.y) >= 0.04) {
      this.holdGamma = null;
    }
    // in a turn add a little back pressure automatically
    elev += clamp((1 / Math.max(Math.cos(o.roll * DEG), 0.3) - 1) * 0.12, 0, 0.3);
    // g limiter
    const n = fm.out.nz || 1;
    if (n > d.gLimit * 0.95 && elev > 0) elev *= clamp(1 - (n - d.gLimit * 0.95) / 1.5, 0, 1);
    if (n < -1.5 && elev < 0) elev *= 0.3;
    // stall protection (angle-of-attack limiter): pulling harder can't stall the wing in Assisted mode
    const aLim = d.alphaStall + d.flapStall * fm.flapPos - 2 * DEG;
    const aPred = fm.out.alpha - fm.w[1] * 0.25; // where alpha is heading in a quarter second (pitch rate)
    if (elev > 0 && aPred > aLim - 3 * DEG) elev *= clamp((aLim - aPred) / (3 * DEG), 0, 1);
    if (aPred > aLim) elev = Math.min(elev, -clamp((aPred - aLim) / DEG * 0.15, 0, 0.5));
    // pitch-attitude and low-energy protection (not on fighters): no zoom climbs that end in a stall
    if (d.engine !== 'jet' || d.gLimit < 6) {
      const pMax = 25 - 5 * fm.flapPos;
      if (elev > 0 && o.pitch > pMax - 5) elev *= clamp((pMax - o.pitch) / 5, 0, 1);
      if (o.pitch > pMax) elev -= (o.pitch - pMax) * 0.05;
      if (!d._vsA) d._vsA = [stallSpeed(d, 0), stallSpeed(d, 1)];
      const vsF = d._vsA[0] + (d._vsA[1] - d._vsA[0]) * fm.flapPos, ias = fm.out.ias || V;
      if (ias < vsF * 1.13 && o.pitch > -5) elev = Math.min(elev, -clamp((vsF * 1.13 - ias) / vsF * 4, 0, 0.6));
    }
    return { elev, ail: clamp(ail, -1, 1), rud, trim: this.trim };
  }
}
