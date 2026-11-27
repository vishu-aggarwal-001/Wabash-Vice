// Keyboard, mouse, gamepad and touch input -> stick / throttle / switches.
import { clamp } from './math.js';

export class Controls {
  constructor(el, opts) {
    this.el = el; this.opts = opts;   // opts.invertPitch, opts.onAction(name)
    this.keys = new Set();
    this.stick = { x: 0, y: 0, rud: 0 };  // y > 0 = pull (nose up)
    this.throttle = 0; this.brake = 0;
    this.touch = { x: 0, y: 0, active: false };
    this.look = { yaw: 0, pitch: 0, dragging: false, zoom: 1 };
    this.pad = null; this.padPrev = {};
    this._bind();
  }

  _bind() {
    const actions = {
      KeyG: 'gear', KeyV: 'flapsDown', BracketRight: 'flapsDown', BracketLeft: 'flapsUp', Slash: 'spoilers',
      KeyB: 'parking', KeyC: 'camera', KeyZ: 'autopilot', KeyN: 'burner', KeyP: 'pause', Escape: 'menu', KeyH: 'help',
      KeyM: 'map', KeyU: 'hud', Digit1: 'cam1', Digit2: 'cam2', Digit3: 'cam3', Digit4: 'cam4', KeyX: 'reverse', Backspace: 'restart',
      End: 'idle', Home: 'full',
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
    window.addEventListener('gamepadconnected', (e) => { this.pad = e.gamepad.index; this.opts.onAction('gamepad'); });
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
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && (pads[this.pad ?? 0] || [...pads].find((x) => x));
    if (p) {
      const dz = (v) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);
      const ax = dz(p.axes[0] || 0), ay = dz(p.axes[1] || 0);
      if (ax || ay) { sx = ax * Math.abs(ax) ** 0.5; sy = (invert ? -ay : ay) * Math.abs(ay) ** 0.5; }
      const bt = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      if (rx || ry) this.touchLook(rx * 8, ry * 8);
      this.throttle = clamp(this.throttle + (bt(7) - bt(6)) * dt * 0.6, 0, 1);
      if (bt(4) || bt(5)) sr = bt(5) - bt(4);
      if (bt(0) > 0.5) this.brake = 1;
      const edge = (i, name) => { const v = bt(i) > 0.5; if (v && !this.padPrev[i]) this.opts.onAction(name); this.padPrev[i] = v; };
      edge(3, 'gear'); edge(2, 'flapsCycle'); edge(1, 'camera'); edge(9, 'menu'); edge(8, 'autopilot'); edge(12, 'trimDown'); edge(13, 'trimUp'); edge(10, 'burner');
    }
    this.stick = { x: clamp(sx, -1, 1), y: clamp(sy, -1, 1), rud: clamp(sr, -1, 1) };
    return this.stick;
  }
}
