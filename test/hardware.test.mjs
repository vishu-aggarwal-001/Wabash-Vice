import { defaultBindings, hatDir } from '../src/hardware.js';
const mk = (id, n, mapping = '', axes = {}) => ({ id, mapping, axes: Object.assign(Array(n).fill(0), axes), buttons: [] });
const cases = [
  ['Logitech Extreme 3D (Vendor: 046d Product: c215)', 10, 'throttle', 6, 'rudder', 5],
  ['T.16000M (Vendor: 044f Product: b10a)', 10, 'throttle', 6, 'rudder', 5],
  ['Saitek X52 Flight Control System (Vendor: 06a3 Product: 075c)', 10, 'throttle', 2, 'rudder', 5],
  ['Thrustmaster T.Flight Hotas X (Vendor: 044f Product: b108)', 10, 'throttle', 2, 'rudder', 5],
  ['Saitek Pro Flight Yoke (Vendor: 06a3 Product: 0bac)', 5, 'throttle', 2, 'rudder', undefined],
  ['Saitek Pro Flight Rudder Pedals (Vendor: 06a3 Product: 0763)', 6, 'rudder', 5, 'brakeL', 0],
  ['T-Rudder (Vendor: 044f Product: b679)', 3, 'rudder', 2, 'brakeL', 1],
  ['Saitek Pro Flight Quadrant (Vendor: 06a3 Product: 0c2d)', 3, 'throttle', 0, 'roll', undefined],
  ['044f-b10a-T.16000M', 10, 'throttle', 6, 'roll', 0],
];
let bad = 0;
for (const [id, n, f1, v1, f2, v2] of cases) { const b = defaultBindings(mk(id, n)); const ok = b.axes[f1]?.a === v1 && b.axes[f2]?.a === v2; if (!ok) bad++; console.log(ok ? 'ok  ' : 'FAIL', id.slice(0, 40), JSON.stringify(b.axes)); }
const hats = [[-1, '0,-1'], [-0.714, '1,-1'], [-0.429, '1,0'], [0.143, '0,1'], [0.714, '-1,0'], [1, '-1,-1'], [1.2857, 'null'], [3.2857, 'null']];
for (const [v, w] of hats) { const h = hatDir(v); const got = h ? `${h.x},${h.y}` : 'null'; if (got !== w) bad++; console.log(got === w ? 'ok  ' : 'FAIL', 'hat', v, got); }
console.log(`hardware: ${bad ? bad + ' failed' : 'all passed'}`); process.exit(bad ? 1 : 0);
