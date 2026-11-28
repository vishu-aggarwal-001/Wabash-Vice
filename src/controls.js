// Keyboard, mouse, gamepad and touch input -> stick / throttle / switches.
import { clamp } from './math.js';
import { Hardware } from './hardware.js';

export class Controls {
  constructor(el, opts) {
    this.el = el; this.opts = opts;   // opts.onAction(name), opts.hwStore (saved controller setup)
    this.hw = new Hardware(opts.hwStore || {}, (a) => this.opts.onAction(a));
    this.hwIn = { devices: 0 };
    this.keys = new Set();
    this.stick = { x: 0, y: 0, rud: 0 };  // y > 0 = pull (nose up)
    this.throttle = 0; this.brake = 0;
    this.touch = { x: 0, y: 0, active: false };
    this.look = { yaw: 0, pitch: 0, dragging: false, zoom: 1 };
    this._bind();
  }

  _bind() {
    const actions = {
      KeyG: 'gear', KeyV: 'flapsDown', BracketRight: 'flapsDown', BracketLeft: 'flapsUp', Slash: 'spoilers',
      KeyB: 'parking', KeyC: 'camera', KeyZ: 'autopilot', KeyN: 'burner', KeyP: 'pause', Escape: 'menu', KeyH: 'help',
      KeyM: 'map', KeyU: 'hud', Digit1: 'cam1', Digit2: 'cam2', Digit3: 'cam3', Digit4: 'cam4', KeyX: 'reverse', Backspace: 'restart',
      End: 'idle', Home: 'full', Backquote: 'perf',
    };
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown', 'Slash', 'Backspace', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      let a = actions[e.code];
      if (e.code === 'KeyV' && e.shiftKey) a = 'flapsUp';
      if (a) this.opts.onAction(a);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    // mouse look / orbit
    const c = this.el;
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.look.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY; c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.look.dragging) return;
      this.look.yaw += (e.clientX - this.lastX) * 0.3; this.look.pitch = clamp(this.look.pitch - (e.clientY - this.lastY) * 0.3, -80, 80);
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    c.addEventListener('pointerup', () => { this.look.dragging = false; });
    c.addEventListener('dblclick', () => { this.look.yaw = 0; this.look.pitch = 0; });
    c.addEventListener('wheel', (e) => { this.look.zoom = clamp(this.look.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.3, 6); e.preventDefault(); }, { passive: false });
    window.addEventListener('gamepadconnected', (e) => { this.opts.onAction('gamepad', e.gamepad); });
    window.addEventListener('gamepaddisconnected', (e) => { this.opts.onAction('gamepadOff', e.gamepad); });
  }

  // touch joystick (from the on-screen UI)
  setTouchStick(x, y, active) { this.touch = { x, y, active }; }
  touchLook(dx, dy) { this.look.yaw += dx * 0.35; this.look.pitch = clamp(this.look.pitch - dy * 0.35, -80, 80); }

  update(dt, invert) {
    const k = this.keys;
    const kp = (a, b) => (k.has(a) || k.has(b) ? 1 : 0);
    let tx = kp('KeyD', 'ArrowRight') - kp('KeyA', 'ArrowLeft');
    let ty = kp('KeyS', 'ArrowDown') - kp('KeyW', 'ArrowUp');
    if (invert) ty = -ty;
    let tr = kp('KeyE', 'NumpadEnter') - kp('KeyQ', 'Numpad0');
    // keyboard: smooth ramp toward full deflection, spring back when released
    const ramp = (cur, t, up, down) => (t !== 0 ? cur + clamp(t - cur, -up * dt, up * dt) : cur + clamp(-cur, -down * dt, down * dt));
    const kb = { x: ramp(this.kbx || 0, tx, 2.2, 4), y: ramp(this.kby || 0, ty * 0.8, 1.6, 3), r: ramp(this.kbr || 0, tr, 2.5, 4) };
    this.kbx = kb.x; this.kby = kb.y; this.kbr = kb.r;
    let sx = kb.x, sy = kb.y, sr = kb.r;
    // throttle
    const thr = kp('KeyR', 'Equal') - kp('KeyF', 'Minus') + kp('NumpadAdd', 'PageUp') - kp('NumpadSubtract', 'PageDown');
    this.throttle = clamp(this.throttle + thr * dt * 0.6, 0, 1);
    this.brake = k.has('Space') || k.has('Period') ? 1 : 0;
    this.trim = kp('KeyK', 'Numpad2') - kp('KeyI', 'Numpad8');
    // touch
    if (this.touch.active) { sx = this.touch.x; sy = invert ? -this.touch.y : this.touch.y; }
    // joysticks, yokes, throttles, pedals, gamepads: a control that is being moved overrides the keyboard
    const h = this.hw.read(dt);
    this.hwIn = h;
    if (h.roll) sx = h.roll;
    if (h.pitch) sy = invert ? -h.pitch : h.pitch;
    if (h.rudder) sr = h.rudder;
    if (h.throttleMoved && h.throttle !== null) this.throttle = h.throttle;
    if (h.throttleDelta) this.throttle = clamp(this.throttle + h.throttleDelta, 0, 1);
    this.brakeL = h.brakeL || 0; this.brakeR = h.brakeR || 0;
    if (h.brakes) this.brake = 1;
    if (h.trim) this.trim = clamp(this.trim + h.trim, -1, 1);
    if (h.look) this.touchLook(h.look.x, h.look.y);
    this.stick = { x: clamp(sx, -1, 1), y: clamp(sy, -1, 1), rud: clamp(sr, -1, 1) };
    return this.stick;
  }
}
