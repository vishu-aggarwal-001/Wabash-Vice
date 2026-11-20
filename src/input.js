// Keyboard + mouse + gamepad + touch, merged into one input snapshot per frame.
const ACTIONS = {
  KeyF: 'enter', Enter: 'enter', KeyM: 'map', KeyV: 'vehicles', Escape: 'pause', KeyP: 'pause',
  KeyC: 'camera', KeyR: 'radio', KeyH: 'horn', KeyK: 'siren', KeyL: 'lights', KeyG: 'gps', F1: 'help', KeyJ: 'mission',
  KeyQ: 'punch', KeyE: 'kick', Tab: 'phone', KeyY: 'yes', KeyN: 'no', KeyX: 'endjob', KeyZ: 'weapon',
};

export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, locked: false, drag: false };
    this.touch = { x: 0, y: 0, active: false, buttons: new Set() };
    this.canvas = canvas; this.enabled = true;
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code) && ACTIONS[e.code]) this.pressed.add(ACTIONS[e.code]);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => { if (this.enabled && !matchMedia('(pointer: coarse)').matches) canvas.requestPointerLock?.(); });
    document.addEventListener('pointerlockchange', () => { this.mouse.locked = document.pointerLockElement === canvas; });
    addEventListener('mousemove', (e) => {
      if (this.mouse.locked || this.mouse.drag) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 2) this.mouse.drag = true; if (e.button === 0 && this.mouse.locked) { this.pressed.add('punch'); this.mouse.down = true; } });
    addEventListener('mouseup', () => { this.mouse.drag = false; this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    this.setupTouch();
  }

  setupTouch() {
    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const ui = document.getElementById('touch');
    if (!isTouch || !ui) return;
    ui.hidden = false;
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    let sid = null, cx = 0, cy = 0;
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; sid = t.identifier;
      const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      this.touch.active = true; e.preventDefault();
    }, { passive: false });
    const move = (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) {
        const dx = (t.clientX - cx) / 50, dy = (t.clientY - cy) / 50, l = Math.max(1, Math.hypot(dx, dy));
        this.touch.x = dx / l; this.touch.y = -dy / l;
        knob.style.transform = `translate(${this.touch.x * 40}px, ${-this.touch.y * 40}px)`;
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; this.touch.x = this.touch.y = 0; this.touch.active = false; knob.style.transform = ''; }
    };
    stick.addEventListener('touchmove', move, { passive: true });
    stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
    for (const b of ui.querySelectorAll('[data-btn]')) {
      const name = b.dataset.btn;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.touch.buttons.add(name); if (name.startsWith('!')) this.pressed.add(name.slice(1)); }, { passive: false });
      b.addEventListener('touchend', () => this.touch.buttons.delete(name));
    }
    // look by dragging on the canvas
    let lid = null, lx = 0, ly = 0;
    this.canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; lid = t.identifier; lx = t.clientX; ly = t.clientY; }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === lid) { this.mouse.dx += (t.clientX - lx) * 1.5; this.mouse.dy += (t.clientY - ly) * 1.5; lx = t.clientX; ly = t.clientY; }
    }, { passive: true });
  }

  // snapshot for this frame
  read() {
    const k = (c) => this.keys.has(c);
    const tb = this.touch.buttons;
    const s = {
      moveX: (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0),
      moveY: (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0),
      arrowX: (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0),
      arrowY: (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0),
      q: k('KeyQ'), e: k('KeyE'),
      jump: k('Space') || tb.has('jump'),
      shift: k('ShiftLeft') || k('ShiftRight') || tb.has('boost'),
      down: k('KeyZ') || k('ControlLeft') || tb.has('down'),
      up: k('Space') || tb.has('up') || tb.has('jump'),
      timeFast: k('KeyT'),
      lookX: 0, lookY: 0,
      touch: this.touch.active || tb.size > 0,
      pressed: this.pressed,
    };
    if (this.touch.active) { s.moveX = this.touch.x; s.moveY = this.touch.y; }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const dz = (v) => Math.abs(v) < 0.15 ? 0 : v;
      const b = (i) => p.buttons[i]?.pressed;
      const lx = dz(p.axes[0]), ly = dz(p.axes[1]), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      if (lx) s.moveX = lx;
      const rt = p.buttons[7]?.value || 0, lt = p.buttons[6]?.value || 0;
      if (rt || lt) s.moveY = rt - lt; else if (ly) s.moveY = -ly;
      if (ry) s.arrowY = -ry;
      s.lookX += rx * 14; s.lookY += 0;
      if (b(0)) { s.jump = true; s.up = true; }
      if (b(1)) s.down = true;
      if (b(4)) s.q = true; if (b(5)) s.e = true;
      if (b(10) || b(2)) s.shift = true;
      const edge = (i, a) => { const was = this['pad' + i]; const now = !!b(i); if (now && !was) this.pressed.add(a); this['pad' + i] = now; };
      edge(2, 'punch'); edge(1, 'kick'); edge(13, 'phone');
      edge(3, 'enter'); edge(9, 'pause'); edge(8, 'map'); edge(11, 'camera'); edge(12, 'horn'); edge(14, 'vehicles'); edge(15, 'radio');
    }
    s.lookX += this.mouse.dx; s.lookY += this.mouse.dy; s.wheel = this.mouse.wheel;
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
    return s;
  }
  endFrame() { this.pressed = new Set(); }
}
