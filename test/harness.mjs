// Headless flight harness: runs the real flight model / assist / autopilot with flat ground.
import { FlightModel } from '../src/physics.js';
import { AIRCRAFT } from '../src/aircraft.js';
import { Autopilot, FlightAssist } from '../src/autopilot.js';
import { DEG, KT, FT, clamp, destPoint, bearingDeg, distM } from '../src/math.js';
export { AIRCRAFT, DEG, KT, FT, clamp, destPoint, bearingDeg, distM };
export const GROUND = 200;
export function makeSim(key, opts = {}) {
  const def = AIRCRAFT[key], fm = new FlightModel(def), ap = new Autopilot(), assist = new FlightAssist();
  fm.groundH = opts.ground ?? GROUND;
  const sim = { fm, ap, assist, def, t: 0, stick: { x: 0, y: 0, rud: 0 }, throttle: 0, brake: 0, assistOn: opts.assist ?? true, log: [] };
  sim.step = (dt = 1 / 60) => {
    const c = fm.ctrl;
    const a = assist.apply(fm, sim.stick, dt, sim.assistOn);
    let elev = a.elev, ail = a.ail, rud = a.rud;
    if (a.trim !== null && sim.assistOn) c.trim = a.trim;
    if (ap.on) {
      const o = ap.fly(fm, dt);
      if (o) {
        elev = o.elev; ail = o.ail; if (o.rud !== undefined) rud = o.rud; c.trim = 0; if (o.throttle !== null) sim.throttle = o.throttle;
        c.spoilers = o.spoilers ?? c.spoilers; c.reverse = !!o.reverse; sim.apBrake = o.brake || 0;
      } else if (ap.landed) { sim.throttle = 0; sim.apBrake = 0; sim.brake = 1; c.reverse = false; }
    }
    c.elev = clamp(elev, -1, 1); c.ail = clamp(ail, -1, 1); c.rud = clamp(rud, -1, 1);
    c.throttle = sim.throttle; c.brake = Math.max(sim.brake, sim.apBrake || 0);
    if (opts.wind) fm.wind = opts.wind;
    fm.step(dt); sim.t += dt;
  };
  sim.run = (secs, each) => { const n = Math.round(secs * 60); for (let i = 0; i < n; i++) { if (each && each(sim) === false) return; sim.step(); if (fm.crashed) return; } };
  sim.groundStart = (hdg = 0) => { const c = fm.ctrl; c.gearDown = true; c.flaps = def.takeoffFlaps ?? 1; fm.reset(40, -86, fm.groundH + fm.restHeight, hdg, 0, 0); };
  sim.agl = () => fm.h - fm.groundH;
  return sim;
}
export function report(name, rows) { console.log(`\n== ${name}`); for (const r of rows) console.log('  ' + r); }
