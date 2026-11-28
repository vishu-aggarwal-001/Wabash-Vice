// Aircraft definitions. Units: SI. Body frame x fwd, y left, z up, origin at centre of gravity
// (the .glb models in /models are built in the same frame, see tools/build_models.py).
// Control derivatives are "per unit of stick" (stick is -1..1), signs in pilot terms:
// +aileron rolls right, +elevator pitches up, +rudder yaws right.
import { DEG, KT } from './math.js';

export const AIRCRAFT = {
  trainer: {
    name: 'Wabash Trainer', type: 'Single-prop trainer · high wing',
    blurb: 'Gentle, forgiving and slow. The best plane to learn on.',
    model: 'models/trainer.glb', engine: 'prop', engines: 1,
    mass: 1050, inertia: [1285, 1825, 2667],
    S: 16.2, b: 11.0, c: 1.5,
    CL0: 0.31, CLa: 4.6, alphaStall: 16 * DEG, flapCL: 0.6, flapStall: -2 * DEG,
    CD0: 0.031, k: 0.057, flapCD: 0.06, gearCD: 0, spoilerCD: 0, mcrit: 0.6,
    Cm0: 0.01, Cma: -0.9, Cmq: -12, Cmde: 0.42, Cmflap: -0.03,
    Clb: -0.09, Clp: -0.47, Clr: 0.1, Clda: 0.045,
    Cnb: 0.065, Cnr: -0.1, Cndr: 0.028, Cnda: -0.004, CYb: 0.31,
    power: 119000, staticThrust: 2400, propEff: 0.8, spool: 4, propwash: 180,
    retractable: false, flaps: [0, 10, 20, 30], vfe: 85 * KT, vne: 163 * KT, mmo: 0.3,
    gear: [[2.6, 0, -1.11, 'nose'], [-0.35, 1.18, -1.14, 'main'], [-0.35, -1.18, -1.14, 'main']],
    gearK: 60000, gearC: 5500, brake: 0.5, steer: 30 * DEG,
    body: [[3.95, 0, 0.35], [3.62, 0, -0.6], [-4.6, 0, 0.8], [-4.4, 0, 0.6], [0.5, 5.5, 1.38], [0.5, -5.5, 1.38], [0, 0, -0.5], [-3.9, 0, 2.2]],
    eye: [1.0, 0.3, 0.85], cam: { dist: 16, height: 3 },
    vr: 55 * KT, vref: 65 * KT, cruise: 110 * KT, ceiling: 4200, gLimit: 4.4,
    spawnCruise: { alt: 1500, spd: 100 * KT }, approachFlaps: 3, rotatePitch: 12, flareAlt: 8,
  },
  airliner: {
    name: 'Hoosier 320', type: 'Twin-jet airliner · 150 seats',
    blurb: 'Fly-by-wire style handling, autopilot and approach mode. Long runways please!',
    model: 'models/airliner.glb', engine: 'jet', engines: 2,
    mass: 62000, inertia: [1.3e6, 3.9e6, 5.0e6],
    S: 122.6, b: 34.1, c: 4.2,
    CL0: 0.25, CLa: 5.0, alphaStall: 13.5 * DEG, flapCL: 0.9, flapStall: 4 * DEG,
    CD0: 0.0215, k: 0.042, flapCD: 0.07, gearCD: 0.02, spoilerCD: 0.09, spoilerCL: 0.45, mcrit: 0.74, waveMax: 0.035,
    Cm0: 0.02, Cma: -1.2, Cmq: -25, Cmde: 0.6, Cmflap: -0.05,
    Clb: -0.12, Clp: -0.4, Clr: 0.12, Clda: 0.035,
    Cnb: 0.12, Cnr: -0.25, Cndr: 0.045, Cnda: -0.003, CYb: 0.7,
    thrust: 240000, spool: 0.5, reverse: 0.35, rudderLimiter: true,
    retractable: true, flaps: [0, 5, 15, 20, 35], vfe: 177 * KT, vne: 350 * KT, mmo: 0.82, gearTime: 8,
    gear: [[14.0, 0, -3.86, 'nose'], [-1.2, 3.8, -3.87, 'main'], [-1.2, -3.8, -3.87, 'main']],
    gearK: 2.6e6, gearC: 3.5e5, brake: 0.45, steer: 55 * DEG,
    body: [[18.6, 0, 0.3], [16, 0, -1.5], [-14, 0, -0.65], [-17.5, 0, 0.85], [5.5, 5.75, -2.75], [5.5, -5.75, -2.75],
      [-6, 17, 0.6], [-6, -17, 0.6], [0, 0, -1.55], [-15.5, 0, 9.8]],
    eye: [16.9, 0.55, 1.15], cam: { dist: 62, height: 10 },
    vr: 145 * KT, vref: 135 * KT, cruise: 450 * KT, ceiling: 12000, gLimit: 2.5,
    spawnCruise: { alt: 10500, spd: 440 * KT }, approachFlaps: 4, takeoffFlaps: 2, rotatePitch: 10, flareAlt: 20,
  },
  fighter: {
    name: 'Boiler F-1', type: 'Supersonic fighter jet',
    blurb: 'Afterburner, 9 G turns and Mach 2 at high altitude. Press N for afterburner.',
    model: 'models/fighter.glb', engine: 'jet', engines: 1,
    mass: 12000, inertia: [12875, 75674, 85552],
    S: 27.9, b: 10.0, c: 3.45,
    CL0: 0.04, CLa: 3.6, alphaStall: 26 * DEG, flapCL: 0.35, flapStall: 0,
    CD0: 0.02, k: 0.12, flapCD: 0.04, gearCD: 0.015, spoilerCD: 0.08, spoilerCL: 0, mcrit: 0.9, waveMax: 0.026,
    Cm0: 0.0, Cma: -0.35, Cmq: -6, Cmde: 0.22, Cmflap: 0,
    Clb: -0.05, Clp: -0.35, Clr: 0.05, Clda: 0.05,
    Cnb: 0.11, Cnr: -0.35, Cndr: 0.03, Cnda: 0, CYb: 0.6,
    thrust: 76000, afterburner: 127000, spool: 0.9,
    retractable: true, flaps: [0, 20], vfe: 300 * KT, vne: 800 * KT, mmo: 1.8, gearTime: 3,
    gear: [[4.5, 0, -1.94, 'nose'], [-1.0, 1.25, -2.0, 'main'], [-1.0, -1.25, -2.0, 'main']],
    gearK: 4.5e5, gearC: 6.5e4, brake: 0.5, steer: 40 * DEG,
    body: [[8.6, 0, 0.1], [-7.0, 0, -0.36], [-6, 0, -0.5], [-3.2, 5.0, -0.05], [-3.2, -5.0, -0.05], [0, 0, -0.6], [-5.5, 0, 3.6]],
    eye: [4.0, 0, 0.95], cam: { dist: 22, height: 4 },
    vr: 150 * KT, vref: 160 * KT, cruise: 480 * KT, ceiling: 15000, gLimit: 9,
    spawnCruise: { alt: 6000, spd: 420 * KT }, approachFlaps: 1, rotatePitch: 12, flareAlt: 10,
  },
};

// ------------------------------------------------------------------------------------------------------------
// Real aircraft types. Each is built from one of the three hand-tuned aircraft above (same flight-model
// "family") and re-sized with its published numbers: mass, wing area/span, engines, speeds and limits.
// Geometry (gear, contact points, eye point) scales with fuselage length; inertia with mass x length^2.
// 'model' is a code-built stand-in until you add a real .glb (Settings -> Aircraft models, or models/real/).
const BASE_LEN = { trainer: 8.2, airliner: 37.6, fighter: 15.0 };
function derive(baseKey, s) {
  const b = AIRCRAFT[baseKey], k = s.length / BASE_LEN[baseKey], mr = s.mass / b.mass;
  const sc = (p) => p.map((v, i) => (i < 3 ? v * k : v));
  const d = {
    ...b, ...s.aero,
    name: s.name, type: s.type, blurb: s.blurb, maker: s.maker, family: s.family, real: true, base: baseKey,
    model: `models/${s.stand || baseKey}.glb`, modelScale: s.standScale ?? k, length: s.length,
    mass: s.mass, inertia: b.inertia.map((I) => I * mr * k * k),
    S: s.S, b: s.span, c: s.chord ?? s.S / s.span,
    gear: s.gear || b.gear.map(sc), body: (s.body || b.body.map(sc)).map((p) => p.slice(0, 3)), eye: s.eye || sc(b.eye),
    cam: { dist: b.cam.dist * k, height: b.cam.height * k },
    gearK: b.gearK * mr, gearC: b.gearC * mr,
    vr: s.vr * KT, vref: s.vref * KT, cruise: s.cruise * KT, vne: s.vne * KT, mmo: s.mmo ?? b.mmo, vfe: s.vfe ? s.vfe * KT : b.vfe,
    ceiling: s.ceiling, gLimit: s.gLimit ?? b.gLimit,
    flareAlt: s.flareAlt ?? b.flareAlt * Math.sqrt(k), rotatePitch: s.rotatePitch ?? b.rotatePitch,
    spawnCruise: { alt: s.cruiseAlt, spd: s.cruiseSpd * KT },
  };
  if (s.engine === 'prop') Object.assign(d, { engine: 'prop', engines: s.engines, power: s.power, staticThrust: s.staticThrust, propEff: 0.8, propwash: b.propwash ?? 180, spool: s.spool ?? 4 });
  else Object.assign(d, { engine: 'jet', engines: s.engines, thrust: s.thrust, afterburner: s.afterburner, spool: s.spool ?? b.spool, reverse: s.reverse ?? b.reverse });
  if (s.flaps) d.flaps = s.flaps;
  if (s.approachFlaps != null) d.approachFlaps = s.approachFlaps;
  if (s.takeoffFlaps != null) d.takeoffFlaps = s.takeoffFlaps;
  if (s.retractable != null) d.retractable = s.retractable;
  if (s.gearTime) d.gearTime = s.gearTime;
  if (s.steer) d.steer = s.steer * DEG;
  if (s.brakeMu) d.brake = s.brakeMu;
  if (s.powerLapse) d.powerLapse = s.powerLapse;
  d.xwind = s.xwind ?? 15; // demonstrated crosswind (kt)
  return d;
}
// taildragger gear: two mains just ahead of the CG, a steerable tail wheel; sits about 11 degrees nose-up
function tailGear(L, track, h) {
  const xm = 0.06 * L, xt = -0.42 * L, zt = -h + (xm - xt) * Math.tan(11 * DEG);
  return [[xt, 0, zt, 'nose'], [xm, track / 2, -h, 'main'], [xm, -track / 2, -h, 'main']];
}

Object.assign(AIRCRAFT, {
  c172: derive('trainer', { name: 'Cessna 172S Skyhawk', maker: 'Cessna', family: 'Light aircraft', type: 'Single piston · high wing', blurb: 'The world\'s most-built aircraft. The classic trainer.',
    length: 8.28, mass: 1080, S: 16.2, span: 11.0, chord: 1.49, engine: 'prop', engines: 1, power: 134000, staticThrust: 2700,
    vr: 55, vref: 65, cruise: 122, vne: 163, vfe: 85, ceiling: 4267, cruiseAlt: 1500, cruiseSpd: 110, stand: 'trainer' }),
  cub: derive('trainer', { name: 'Piper J-3 Cub', maker: 'Piper', family: 'Light aircraft', type: 'Taildragger · 65 hp', blurb: 'Light, slow and pure stick-and-rudder flying. Lifts off at 35 kt.',
    length: 6.83, mass: 520, S: 16.6, span: 10.7, chord: 1.6, engine: 'prop', engines: 1, power: 48500, staticThrust: 1350,
    vr: 37, vref: 45, cruise: 65, vne: 106, vfe: 70, ceiling: 3500, cruiseAlt: 800, cruiseSpd: 65,
    flaps: [0], approachFlaps: 0, takeoffFlaps: 0, gear: tailGear(6.83, 1.83, 1.25), rotatePitch: 13, steer: 25, brakeMu: 0.3, xwind: 8, stand: 'cub' }),
  extra330: derive('trainer', { name: 'Extra 330', maker: 'Extra', family: 'Aerobatic', type: 'Aerobatic taildragger · 315 hp', blurb: '400 degrees a second of roll, ±10 g. Built for loops and rolls.',
    length: 6.94, mass: 830, S: 10.9, span: 8.0, chord: 1.36, engine: 'prop', engines: 1, power: 235000, staticThrust: 4200,
    vr: 60, vref: 75, cruise: 170, vne: 220, vfe: 220, ceiling: 4800, gLimit: 10, cruiseAlt: 1200, cruiseSpd: 160,
    aero: { CL0: 0.0, CLa: 4.8, Clda: 0.11, Clp: -0.42, Cmde: 0.55, Cma: -0.55, Cndr: 0.045, Cnb: 0.07, alphaStall: 17 * DEG, flapCL: 0 }, brakeMu: 0.3,
    flaps: [0], approachFlaps: 0, takeoffFlaps: 0, gear: tailGear(6.94, 1.8, 1.15), rotatePitch: 12, steer: 25, xwind: 10, stand: 'extra' }),
  kingair: derive('trainer', { name: 'Beechcraft King Air 350', maker: 'Beechcraft', family: 'Turboprop', type: 'Twin turboprop · 11 seats', blurb: 'Fast, tough twin turboprop that flies high and lands short.',
    length: 14.22, mass: 6400, S: 28.8, span: 17.65, chord: 1.63, engine: 'prop', engines: 2, power: 1560000, staticThrust: 25000, spool: 1.5,
    vr: 95, vref: 105, cruise: 300, vne: 263, vfe: 202, mmo: 0.58, ceiling: 10668, cruiseAlt: 7000, cruiseSpd: 300, powerLapse: 0.35,
    aero: { CD0: 0.026, k: 0.045, Clda: 0.04, mcrit: 0.6, waveMax: 0.03 },
    retractable: true, gearTime: 6, flaps: [0, 15, 35], approachFlaps: 2, takeoffFlaps: 1, stand: 'kingair' }),
  a320: derive('airliner', { name: 'Airbus A320neo', maker: 'Airbus', family: 'Airliner', type: 'Narrow-body twin jet · 180 seats', blurb: 'The best-selling Airbus. Fly-by-wire feel, autoland, long runways.',
    length: 37.57, mass: 64000, S: 122.6, span: 35.8, chord: 4.29, engine: 'jet', engines: 2, thrust: 2 * 120600,
    vr: 145, vref: 137, cruise: 450, vne: 350, vfe: 177, mmo: 0.82, ceiling: 12130, cruiseAlt: 10700, cruiseSpd: 450, stand: 'airliner' }),
  b738: derive('airliner', { name: 'Boeing 737-800', maker: 'Boeing', family: 'Airliner', type: 'Narrow-body twin jet · 189 seats', blurb: 'The workhorse of short-haul flying all over the world.',
    length: 39.5, mass: 66000, S: 124.6, span: 35.8, chord: 3.96, engine: 'jet', engines: 2, thrust: 2 * 121400,
    vr: 150, vref: 145, cruise: 455, vne: 340, vfe: 162, mmo: 0.82, ceiling: 12500, cruiseAlt: 10700, cruiseSpd: 455, stand: 'airliner' }),
  b744: derive('airliner', { name: 'Boeing 747-400', maker: 'Boeing', family: 'Airliner', type: 'Four-engine jumbo jet · 416 seats', blurb: 'The Queen of the Skies. Huge, heavy and surprisingly gentle.',
    length: 70.66, mass: 300000, S: 525, span: 64.4, chord: 8.32, engine: 'jet', engines: 4, thrust: 4 * 252000, spool: 0.4,
    vr: 160, vref: 150, cruise: 490, vne: 365, vfe: 170, mmo: 0.92, ceiling: 13700, cruiseAlt: 10700, cruiseSpd: 490,
    aero: { mcrit: 0.8, waveMax: 0.03 }, flareAlt: 24, stand: 'jumbo' }),
  b789: derive('airliner', { name: 'Boeing 787-9 Dreamliner', maker: 'Boeing', family: 'Airliner', type: 'Wide-body twin jet · 290 seats', blurb: 'Carbon-fibre long-hauler with flexing wings and quiet engines.',
    length: 62.8, mass: 200000, S: 377, span: 60.1, chord: 6.27, engine: 'jet', engines: 2, thrust: 2 * 320000, spool: 0.45,
    vr: 155, vref: 145, cruise: 488, vne: 360, vfe: 175, mmo: 0.9, ceiling: 13100, cruiseAlt: 11000, cruiseSpd: 488,
    aero: { mcrit: 0.79, waveMax: 0.03, k: 0.038 }, flareAlt: 22, stand: 'airliner' }),
  f16: derive('fighter', { name: 'F-16C Fighting Falcon', maker: 'General Dynamics', family: 'Military', type: 'Single-engine multirole fighter', blurb: 'The Viper: Mach 2, 9 g, fly-by-wire. Press N for afterburner.',
    length: 15.06, mass: 12000, S: 27.87, span: 9.96, chord: 3.45, engine: 'jet', engines: 1, thrust: 79000, afterburner: 129000,
    vr: 150, vref: 160, cruise: 480, vne: 800, vfe: 300, mmo: 2.05, ceiling: 15240, cruiseAlt: 6000, cruiseSpd: 420, stand: 'fighter' }),
  fa18: derive('fighter', { name: 'F/A-18C Hornet', maker: 'McDonnell Douglas', family: 'Military', type: 'Twin-engine carrier fighter', blurb: 'Twin tails, twin engines, great at high angles of attack.',
    length: 17.1, mass: 16000, S: 37.16, span: 12.3, chord: 3.51, engine: 'jet', engines: 2, thrust: 2 * 49000, afterburner: 2 * 79000,
    vr: 145, vref: 140, cruise: 470, vne: 750, vfe: 300, mmo: 1.8, gLimit: 7.5, ceiling: 15240, cruiseAlt: 6000, cruiseSpd: 420,
    aero: { alphaStall: 35 * DEG, CLa: 3.8, Cnb: 0.12 }, stand: 'hornet' }),
});
// the three originals keep their own models and labels
for (const k of ['trainer', 'airliner', 'fighter']) Object.assign(AIRCRAFT[k], { family: AIRCRAFT[k].family || 'Wabash originals', maker: 'Wabash', length: BASE_LEN[k] });
