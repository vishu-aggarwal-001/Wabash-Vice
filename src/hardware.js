// Flight-sim hardware: joysticks, yokes, HOTAS throttles, rudder pedals and gamepads, through the Gamepad API.
//
// How browsers report this hardware (see AUDIT.md for sources):
//  - Xbox/PlayStation pads usually come with mapping 'standard' (fixed layout). Flight hardware comes with
//    mapping '' and the browser's own axis order. Chrome on Windows puts HID usages in fixed slots:
//    X=0, Y=1, Z=2, Rx=3, Ry=4, Rz=5, Slider=6, Dial=7, hat switch=9 (a hat is ONE axis: eight directions
//    from -1 to +1 in steps of 2/7, and about +1.29 when centred). Other browsers/OSes differ, so every
//    axis can be re-bound with "Detect".
//  - Devices only appear after a button is pressed (or an axis moved) on the page. Safari on macOS does not
//    see most joysticks at all; Chrome or Edge do. Device slots are not stable: bindings are saved by name.
//  - Some axes read 0 until they are first moved, so throttles and toe brakes are calibrated as they move.
import { clamp } from './math.js';

export const AXIS_FNS = [
  { k: 'roll', label: 'Roll (ailerons)', centred: true, how: 'tilt the stick / turn the yoke to the RIGHT' },
  { k: 'pitch', label: 'Pitch (elevator)', centred: true, how: 'PULL the stick / yoke back' },
  { k: 'rudder', label: 'Rudder / nose wheel', centred: true, how: 'twist right or push the RIGHT pedal' },
  { k: 'throttle', label: 'Throttle', centred: false, how: 'push the throttle lever all the way FORWARD' },
  { k: 'brakeL', label: 'Left toe brake', centred: false, how: 'press the LEFT toe brake' },
  { k: 'brakeR', label: 'Right toe brake', centred: false, how: 'press the RIGHT toe brake' },
];
export const BUTTON_FNS = [
  ['brakes', 'Brakes (hold)'], ['autopilot', 'Autopilot on/off'], ['gear', 'Landing gear'], ['flapsDown', 'Flaps down'],
  ['flapsUp', 'Flaps up'], ['spoilers', 'Spoilers'], ['camera', 'Change camera'], ['trimUp', 'Trim nose up'],
  ['trimDown', 'Trim nose down'], ['burner', 'Afterburner'], ['reverse', 'Reverse thrust'], ['parking', 'Parking brake'],
  ['pause', 'Pause'], ['menu', 'Menu'],
];

// stable name for a device (Chrome adds "(Vendor: 046d Product: c215)", Firefox "046d-c215-...")
export const devKey = (pad) => pad.id.replace(/\s+/g, ' ').trim().slice(0, 120);
const isPedals = (id) => /rudder|pedal|tfrp|t-rudder|mfg crosswind/i.test(id);
const isThrottleUnit = (id) => /quadrant|throttle|twcs|bravo|tca q|x56 throttle|warthog throttle/i.test(id);

// best guess for a device nobody has set up yet
export function defaultBindings(pad) {
  const n = pad.axes.length, has = (i) => i < n, b = { axes: {}, buttons: {} };
  if (pad.mapping === 'standard') {
    Object.assign(b.axes, { roll: { a: 0 }, pitch: { a: 1 } });
    b.standard = true; // triggers = throttle, bumpers = rudder, right stick = look (handled in code)
    Object.assign(b.buttons, { brakes: 0, camera: 1, flapsDown: 2, gear: 3, autopilot: 8, menu: 9, burner: 10, trimDown: 12, trimUp: 13 });
    return b;
  }
  const id = pad.id;
  if (isPedals(id)) {
    // Saitek/Logitech pedals: brakes on X/Y, rudder on Rz (5). Thrustmaster T-Rudder: rudder on Z (2), brakes swapped.
    const tm = /t-rudder|tfrp|thrustmaster|044f/i.test(id);
    b.axes.rudder = { a: !tm && has(5) ? 5 : has(2) ? 2 : has(5) ? 5 : 0 };
    if (has(1)) { b.axes.brakeL = { a: tm ? 1 : 0 }; b.axes.brakeR = { a: tm ? 0 : 1 }; }
    return b;
  }
  if (/quadrant/i.test(id)) { b.axes.throttle = { a: 0, inv: true }; return b; } // first lever = throttle
  if (isThrottleUnit(pad.id)) {
    b.axes.throttle = { a: has(2) ? 2 : 0, inv: true };
    return b;
  }
  // stick or yoke
  b.axes.roll = { a: 0 }; b.axes.pitch = { a: 1 };
  if (has(5) && !/yoke/i.test(id)) b.axes.rudder = { a: 5 };
  // known throttles: Extreme 3D Pro and T.16000M use the Slider (6); X52, T.Flight HOTAS and yokes use Z (2)
  const known = /extreme 3d|c215|t\.?16000|b10a/i.test(id) ? 6 : /x52|x-52|hotas|yoke/i.test(id) ? 2 : null;
  if (known !== null && has(known)) { b.axes.throttle = { a: known, inv: true }; Object.assign(b.buttons, { brakes: 0, autopilot: 1, gear: 2, flapsDown: 3, flapsUp: 4, camera: 5 }); return b; }
  // throttle: a slider/Z axis that rests at one end (never the hat, which reads > 1 when centred)
  const cand = [6, 2, 3, 4, 7].filter((i) => has(i) && Math.abs(pad.axes[i]) <= 1.01);
  const t = cand.find((i) => Math.abs(pad.axes[i]) > 0.9) ?? cand[0];
  if (t !== undefined) b.axes.throttle = { a: t, inv: true };
  Object.assign(b.buttons, { brakes: 0, autopilot: 1, gear: 2, flapsDown: 3, flapsUp: 4, camera: 5 });
  return b;
}

// eight-way hat on one axis -> {x, y} in -1..1, or null when centred
export function hatDir(v) {
  if (!(v >= -1.05 && v <= 1.05)) return null;
  const i = Math.round(((v + 1) * 7) / 2) % 8; // 0 = up, clockwise
  const ang = (i * Math.PI) / 4;
  return { x: Math.round(Math.sin(ang)), y: -Math.round(Math.cos(ang)) };
}

export class Hardware {
  constructor(store, onAction) {
    this.store = store;            // { bindings: {devKey: {...}}, deadzone, curve }, persisted by the caller
    this.onAction = onAction;
    this.prevBtn = new Map();      // `${key}#${i}` -> pressed
    this.cal = new Map();          // `${key}#${axis}` -> {first, min, max, moved}
    this.learn = null;             // { kind: 'axis'|'button', fn, base: Map, t0, cb }
    this.last = { pads: [] };
    this.store.bindings ??= {};
    this.store.deadzone ??= 0.05;
    this.store.curve ??= 0.3;
    this.store.hatLook ??= true;
  }

  pads() {
    const list = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const out = [], seen = new Set();
    for (const p of list) {
      if (!p || p.connected === false) continue;
      // virtual duplicates (e.g. the same pad through Steam Input) show up twice with the same name and the same input
      const sig = devKey(p) + '|' + p.axes.length + '|' + p.buttons.length;
      if (seen.has(sig) && out.some((q) => devKey(q) === devKey(p) && q.axes.every((v, i) => Math.abs(v - p.axes[i]) < 1e-3))) continue;
      seen.add(sig); out.push(p);
    }
    return out;
  }

  bindingsFor(pad) {
    const key = devKey(pad);
    if (!this.store.bindings[key]) this.store.bindings[key] = defaultBindings(pad);
    return this.store.bindings[key];
  }

  // calibrated value of one axis: tracks the travel seen so far, ignores an axis until it has really moved
  axis(pad, i) {
    const key = devKey(pad) + '#' + i, v = pad.axes[i];
    if (!Number.isFinite(v)) return { v: 0, moved: false };
    let c = this.cal.get(key);
    if (!c) { c = { first: v, min: v, max: v, moved: false }; this.cal.set(key, c); }
    if (Math.abs(v) <= 1.01) { c.min = Math.min(c.min, v); c.max = Math.max(c.max, v); }
    if (!c.moved && Math.abs(v - c.first) > 0.03) c.moved = true;
    return { v, moved: c.moved, c };
  }

  shape(v) { // centred axis: deadzone + adjustable curve
    const dz = this.store.deadzone, k = this.store.curve;
    const a = Math.abs(v);
    if (a < dz) return 0;
    const x = Math.min(1, (a - dz) / (1 - dz));
    return Math.sign(v) * ((1 - k) * x + k * x * x * x);
  }

  // read everything; returns {roll, pitch, rudder, throttle, brakeL, brakeR, brakes, look, active}
  // (null = no hardware input for that function this frame)
  read(dt, silent = false) {
    const out = { roll: null, pitch: null, rudder: null, throttle: null, brakeL: null, brakeR: null, brakes: 0, trim: 0, look: null, throttleMoved: false, devices: 0 };
    const pads = this.pads();
    out.devices = pads.length;
    this.last.pads = pads;
    if (this.learn) { this._learn(pads); return out; }
    for (const p of pads) {
      const b = this.bindingsFor(p), key = devKey(p);
      for (const fn of AXIS_FNS) {
        const bind = b.axes[fn.k];
        if (!bind || bind.a == null || bind.a >= p.axes.length) continue;
        const { v, moved, c } = this.axis(p, bind.a);
        if (Math.abs(v) > 1.01) continue; // a hat or an unplugged axis
        let x = bind.inv ? -v : v;
        if (fn.centred) {
          const s = this.shape(x);
          if (s !== 0 || out[fn.k] === null) out[fn.k] = s; // twist grip and pedals can both steer: the one in use wins
        } else if (moved) {
          // throttle 0..1, brakes 0..1 from the travel seen so far (some axes rest at -1, some at 0)
          const lo = bind.inv ? -c.max : c.min, hi = bind.inv ? -c.min : c.max;
          const span = Math.max(hi - lo, fn.k === 'throttle' ? 1.2 : 0.5);
          let u = fn.k === 'throttle' ? (x + 1) / 2 : clamp((x - lo) / span, 0, 1);
          if (fn.k !== 'throttle' && u < 0.04) u = 0;
          out[fn.k] = clamp(u, 0, 1);
          // the throttle lever only takes over once it is actually moved (keyboard / autothrottle keep it otherwise)
          if (fn.k === 'throttle' && (this.lastThr === undefined || Math.abs(out.throttle - this.lastThr) > 0.015)) {
            if (this.lastThr !== undefined) out.throttleMoved = true;
            this.lastThr = out.throttle;
          }
        }
      }
      // standard pads: triggers move the throttle, bumpers are rudder, right stick looks around
      if (b.standard) {
        const bt = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
        const tr = bt(7) - bt(6);
        if (Math.abs(tr) > 0.05) { out.throttleDelta = (out.throttleDelta || 0) + tr * dt * 0.6; out.throttleMoved = true; }
        if (bt(4) > 0.5 || bt(5) > 0.5) out.rudder = bt(5) - bt(4);
        const rx = this.shape(p.axes[2] || 0), ry = this.shape(p.axes[3] || 0);
        if (rx || ry) out.look = { x: rx * 8, y: ry * 8 };
      }
      // hats: look around (or trim on standard pads' d-pad, handled as buttons above)
      if (!b.standard && this.store.hatLook && p.axes.length > 9 && this.axis(p, 9).moved) { // hats read 0 until the first report
        const h = hatDir(p.axes[9]);
        if (h) out.look = { x: h.x * 6, y: -h.y * 6 };
      }
      // buttons
      for (const [fn, idx] of Object.entries(b.buttons)) {
        const btn = p.buttons[idx];
        const down = !!btn && (btn.pressed || btn.value > 0.5);
        const pk = key + '#' + idx + fn, was = this.prevBtn.get(pk) || false;
        this.prevBtn.set(pk, down);
        if (fn === 'brakes') { if (down) out.brakes = 1; continue; }
        if (fn === 'trimUp' || fn === 'trimDown') { if (down) out.trim += fn === 'trimUp' ? 1 : -1; continue; }
        if (down && !was && !silent) this.onAction(fn);
      }
    }
    return out;
  }

  // "Detect": move the control (or press the button) you want for this function
  startLearn(kind, fn, cb) {
    const base = new Map();
    for (const p of this.pads()) base.set(devKey(p), { axes: [...p.axes], buttons: p.buttons.map((x) => x.pressed || x.value > 0.5) });
    this.learn = { kind, fn, base, t0: performance.now(), cb };
  }
  cancelLearn() { if (this.learn) { const l = this.learn; this.learn = null; l.cb && l.cb(null); } }
  _learn(pads) {
    const L = this.learn;
    if (performance.now() - L.t0 > 10000) { this.cancelLearn(); return; }
    let best = null;
    for (const p of pads) {
      const key = devKey(p), base = L.base.get(key);
      if (!base) { L.base.set(key, { axes: [...p.axes], buttons: p.buttons.map((x) => x.pressed || x.value > 0.5) }); continue; }
      if (L.kind === 'axis') {
        p.axes.forEach((v, i) => {
          if (Math.abs(v) > 1.01 || Math.abs(base.axes[i] ?? 0) > 1.01) return; // hats are not axes
          const d = Math.abs(v - (base.axes[i] ?? 0));
          if (d > 0.5 && (!best || d > best.d)) best = { key, a: i, d, dir: Math.sign(v - (base.axes[i] ?? 0)) };
        });
      } else {
        p.buttons.forEach((x, i) => { if ((x.pressed || x.value > 0.5) && !base.buttons[i]) best = best || { key, i }; });
      }
    }
    if (!best) return;
    // one function = one control: clear it from every device first
    for (const b of Object.values(this.store.bindings)) { if (L.kind === 'axis') delete b.axes[L.fn]; else delete b.buttons[L.fn]; }
    const b = this.store.bindings[best.key] || (this.store.bindings[best.key] = { axes: {}, buttons: {} });
    if (L.kind === 'axis') {
      // the way you moved it means "more": roll right, pull back (nose up), right rudder, more throttle, more brake
      b.axes[L.fn] = { a: best.a, inv: best.dir < 0 };
      this.cal.delete(best.key + '#' + best.a);
    } else b.buttons[L.fn] = best.i;
    const cb = L.cb; this.learn = null; cb && cb({ key: best.key, ...(L.kind === 'axis' ? { a: best.a } : { i: best.i }) });
  }
}
