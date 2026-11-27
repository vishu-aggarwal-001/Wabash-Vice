// Autopilot (HDG / ALT / VS / SPD / NAV direct-to / APP approach) and the "assisted" flight laws
// (auto-trim, auto-rudder, bank + g protection) that make the planes easy to fly with keyboard or touch.
import { DEG, KT, FT, clamp, wrap180, bearingDeg, distM } from './math.js';

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
    this.on = true; this.hdg = Math.round(o.heading); this.alt = Math.round(fm.h / FT / 100) * 100 * FT;
    this.spd = Math.max(fm.out.V || fm.def.cruise, fm.def.vref * 1.3); this.vMode = 'ALT'; this.hdgMode = 'HDG';
    this.pI = fm.ctrl.trim / gainSched(fm);
    this.tI = fm.ctrl.throttle; this.landed = false; this.xI = 0;
  }
  disengage(msg) { this.on = false; this.msg = msg || ''; }

  // returns {elev, ail, throttle|null} the AP wants this frame (or null when it hands back control)
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
        if (fm.onGround) { this.disengage('Autoland complete: braking'); this.landed = true; return null; }
        // localizer: xtk > 0 means we are left of the extended centre line
        const off = wrap180(brg - t.hdg);
        const xtk = dist * Math.sin(off * DEG), along = dist * Math.cos(off * DEG);
        if (Math.abs(xtk) < 120) this.xI = clamp((this.xI || 0) + xtk * dt * 0.002, -4, 4); else this.xI = 0;
        wantHdg = t.hdg + clamp(xtk * 0.06 + this.xI, -35, 35); useTrack = true;
        if (along < 0) wantHdg = t.hdg;
        // glideslope: 3 degrees to a point 300 m past the threshold
        const gsAlt = t.elevM + 15 + Math.tan(3 * DEG) * Math.max(along + 300, 0);
        info = { d: dist, xtk, gsErr: fm.h - gsAlt };
        const fa = d.flareAlt || 14;
        if (agl < fa) flare = true;
        if (agl < fa * 0.6) retard = true;
      }
    }
    // ---- lateral: heading/track -> bank -> roll rate -> aileron (model based so it suits every plane)
    const hdgErr = wrap180(wantHdg - (useTrack ? track : o.heading));
    const bankLimit = flare ? 5 : this.hdgMode === 'APP' ? 22 : 27;
    const wantBank = clamp(hdgErr * 1.8, -bankLimit, bankLimit);
    const pRatePerAil = Math.max(0.05, (-d.Clda * 2 * V) / (d.Clp * d.b));
    const pCmd = clamp((wantBank - o.roll) * DEG * 0.9, -0.3, 0.3);
    const ail = clamp((pCmd + 0.8 * (pCmd - fm.w[0])) / pRatePerAil, -1, 1);
    // ---- vertical: altitude / vertical speed / glideslope -> flight-path angle -> elevator
    // slower (heavier) aircraft get gentler outer-loop gains: scale by short-period frequency
    const wsp = Math.sqrt(((fm.out.qbar || 1) * d.S * d.c * Math.abs(d.Cma)) / d.inertia[1]);
    const k = clamp(wsp / 2.5, 0.25, 1);
    this.gk = Math.sqrt(k);
    if (this.vMode === 'ALT') wantVs = clamp((this.alt - fm.h) * 0.1 * this.gk, -15, 15);
    else if (this.vMode === 'VS') {
      wantVs = this.vs;
      if (Math.abs(this.alt - fm.h) < Math.abs(this.vs) * 6 + 20) this.vMode = 'ALT';
      else if (Math.sign(this.alt - fm.h) !== Math.sign(this.vs || 1)) wantVs = 0;
    }
    // speed protection: never climb the aircraft into a stall
    const vmin = d.vref * 1.05;
    if (V < vmin * 1.15 && !info) wantVs = Math.min(wantVs, (V - vmin) * 0.6);
    if (info) {
      wantVs = -Math.tan(3 * DEG) * fm.groundSpeed - clamp(info.gsErr * 0.1 * this.gk, -5, 5);
      if (flare) wantVs = -clamp(agl * (1.4 / (d.flareAlt || 14)) * 1.3, 0.5, 3.2);
    }
    const gammaCmd = Math.asin(clamp(wantVs / V, -0.35, 0.35));
    const gamma = Math.asin(clamp(fm.vs / V, -1, 1));
    const gs = gainSched(fm);
    const err = gammaCmd - gamma;
    this.pI = clamp((this.pI || 0) + err * dt * 0.8 * k, -1.5, 1.5);
    const turnComp = (1 / Math.max(Math.cos(o.roll * DEG), 0.5) - 1) * 0.15;
    let elev = gs * (1.6 * Math.sqrt(k) * err + this.pI + 0.6 * fm.w[1] / Math.sqrt(k)) + turnComp;
    if (o.pitch > 20) elev -= (o.pitch - 20) * 0.05;
    if (flare && o.pitch > (d.rotatePitch || 10) - 1) elev -= (o.pitch - (d.rotatePitch || 10) + 1) * 0.15;
    if (o.pitch < -15) elev += (-15 - o.pitch) * 0.05;
    // ---- autothrottle
    let thr = null;
    if (this.athr) {
      const spd = info ? d.vref + 5 * KT : this.spd;
      this.tI = clamp((this.tI ?? 0.5) + ((spd - V) / spd) * dt * 0.6, 0, 1);
      thr = clamp(this.tI + ((spd - V) / spd) * 3 - fm.vs * 0.004, 0, 1);
      if (retard) { thr = 0; this.tI = 0; }
    }
    this.info = info; this.dbg = { wantHdg, hdgErr, wantBank, ail, track };
    return { elev: clamp(elev, -1, 1), ail, throttle: thr };
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
      if (Math.abs(rud) < 0.05) rud = clamp(ail * 1.2, -1, 1);
      ail *= 0.25; // on the runway the roll keys mostly steer
      this.liftoffT = 0;
      // tail-strike protection while rotating
      const maxP = d.rotatePitch || 10;
      if (elev > 0) elev = Math.min(elev, clamp((maxP - o.pitch) * 0.12, 0, 1));
      this.holdGamma = null; this.holdBank = null; this.i = 0;
      return { elev, ail, rud, trim: 0 };
    }
    // auto-rudder: kill sideslip
    if (Math.abs(rud) < 0.05) rud = clamp(fm.out.beta * 6, -1, 1);
    // bank hold: let go of the stick and the wings stay where you left them (small banks level out)
    if (Math.abs(stick.x) < 0.04) {
      if (this.holdBank === null) this.holdBank = Math.abs(o.roll) < 6 ? 0 : clamp(o.roll, -33, 33);
      const pRate = Math.max(0.05, (-d.Clda * 2 * Math.max(V, 1)) / (d.Clp * d.b));
      const pCmd = clamp((this.holdBank - o.roll) * DEG * 0.8, -0.25, 0.25);
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
        this.holdGamma = clamp(gamma, -10 * DEG, 12 * DEG); this.i = fm.ctrl.trim / gs;
        // just took off? keep climbing away instead of settling back onto the runway
        if (fm.h - fm.groundH < 150 && o.pitch > 4 && fm.ctrl.throttle > 0.5) this.holdGamma = Math.max(this.holdGamma, (d.engine === 'prop' ? 5 : 7) * DEG);
      }
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
    // stall protection for the airliner
    if (d.engine === 'jet' && d.gLimit < 6 && fm.out.alpha > (d.alphaStall - 2 * DEG) && elev > 0) elev *= 0.2;
    return { elev, ail: clamp(ail, -1, 1), rud, trim: this.trim };
  }
}
