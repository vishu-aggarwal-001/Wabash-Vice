// Ground floors: a generated atlas of storefronts (signs, display windows, doors,
// awnings) and stone/brick bases with entrances. Alpha = 0 marks glass, which the
// building shader turns into see-through windows with rooms behind them.
import * as THREE from 'three';

const W = 1024, H = 512;          // one cell = 12.8 m wide x 4.2 m tall
const PX = W / 12.8, PY = H / 4.2;
const SHOPS = [
  { wall: '#8a4b38', brick: true, frame: '#1b1b1b', sign: '#14213d', ink: '#ffd166', names: ['WABASH DINER', 'BOILER BAGELS'], awning: ['#b22222', '#f4f1ea'] },
  { wall: '#6f6a62', brick: false, frame: '#2b2b2b', sign: '#7a1e1e', ink: '#ffffff', names: ['LAFAYETTE HARDWARE', 'PAWN & LOAN'], awning: null },
  { wall: '#9b5a41', brick: true, frame: '#2f3b2a', sign: '#1f3d2b', ink: '#f2e6c9', names: ['TIPPECANOE BOOKS', 'CAFÉ LEVEE'], awning: ['#1f3d2b', '#e8dcc0'] },
  { wall: '#c9b79a', brick: false, frame: '#222', sign: '#111111', ink: '#ff5a36', names: ['MAIN ST PIZZA', 'FERRY ST BARBER'], awning: ['#c0392b', '#ffffff'] },
  { wall: '#5b5f66', brick: false, frame: '#111', sign: '#000000', ink: '#cfb991', names: ['GOLD & BLACK SPORTS', 'RIVERSIDE LIQUOR'], awning: null },
  { wall: '#a0663f', brick: true, frame: '#3a2a1a', sign: '#e9b82c', ink: '#1a1a1a', names: ['CHAUNCEY TACOS', 'LEVEE LAUNDROMAT'], awning: ['#e67e22', '#2c3e50'] },
];

function noiseFill(g, x, y, w, h, base, amt, n) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * amt})`;
    g.fillRect(x + Math.random() * w, y + Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}
function bricks(g, x, y, w, h, base) {
  noiseFill(g, x, y, w, h, base, 0.08, 2500);
  const bh = 0.075 * PY, bw = 0.22 * PX;
  g.strokeStyle = 'rgba(220,210,195,0.35)'; g.lineWidth = 1.2;
  for (let r = 0, yy = y + h; yy > y; r++, yy -= bh) {
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke();
    for (let xx = x + (r % 2 ? bw / 2 : 0); xx < x + w; xx += bw) { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy - bh); g.stroke(); }
    for (let xx = x; xx < x + w; xx += bw) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},0,0,${Math.random() * 0.07})`; g.fillRect(xx + (r % 2 ? bw / 2 : 0), yy - bh, bw, bh); }
  }
}
const M = (x, y0, x1, y1) => [x * PX, H - y1 * PY, (x1 - x) * PX, (y1 - y0) * PY];   // metres -> px rect (y up)

function glass(g, x0, y0, x1, y1, frame, mullions = 1) {
  g.fillStyle = frame; g.fillRect(...M(x0 - 0.08, y0 - 0.08, x1 + 0.08, y1 + 0.08));
  const step = (x1 - x0) / mullions;
  for (let i = 0; i < mullions; i++) {
    g.clearRect(...M(x0 + i * step + 0.04, y0, x0 + (i + 1) * step - 0.04, y1));
  }
}
function door(g, x0, frame, wide = 1.1, h = 2.4) {
  g.fillStyle = frame; g.fillRect(...M(x0 - 0.08, 0, x0 + wide + 0.08, h + 0.1));
  g.clearRect(...M(x0 + 0.08, 0.15, x0 + wide / 2 - 0.04, h - 0.08));
  g.clearRect(...M(x0 + wide / 2 + 0.04, 0.15, x0 + wide - 0.08, h - 0.08));
  g.fillStyle = '#c9c9c9'; g.fillRect(...M(x0 + wide / 2 - 0.12, 1.0, x0 + wide / 2 - 0.06, 1.25)); g.fillRect(...M(x0 + wide / 2 + 0.06, 1.0, x0 + wide / 2 + 0.12, 1.25));
}
function sign(g, x0, x1, bg, ink, text) {
  g.fillStyle = bg; g.fillRect(...M(x0, 3.25, x1, 3.95));
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(...M(x0, 3.88, x1, 3.95));
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(...M(x0, 3.25, x1, 3.3));
  g.save();
  g.font = `900 ${Math.round(0.42 * PY)}px Impact, 'Arial Black', system-ui, sans-serif`;
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  const cx = (x0 + x1) / 2 * PX, cy = H - 3.6 * PY;
  const tw = g.measureText(text).width, max = (x1 - x0 - 0.4) * PX;
  g.translate(cx, cy); if (tw > max) g.scale(max / tw, 1);
  g.shadowColor = ink; g.shadowBlur = 6;
  g.fillText(text, 0, 0);
  g.restore();
}
function awning(g, x0, x1, [a, b]) {
  const n = Math.round((x1 - x0) / 0.35);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? a : b;
    const xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n;
    g.beginPath(); g.moveTo(xa * PX, H - 3.2 * PY); g.lineTo(xb * PX, H - 3.2 * PY); g.lineTo(xb * PX, H - 2.75 * PY); g.lineTo(xa * PX, H - 2.75 * PY); g.fill();
    g.beginPath(); g.arc((xa + xb) / 2 * PX, H - 2.75 * PY, (xb - xa) / 2 * PX, 0, Math.PI); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(...M(x0, 3.12, x1, 3.2));
}

function shopCell(g, ox, oy, s) {
  g.save(); g.translate(ox, oy);
  g.beginPath(); g.rect(0, 0, W, H); g.clip();
  if (s.brick) bricks(g, 0, 0, W, H, s.wall); else noiseFill(g, 0, 0, W, H, s.wall, 0.07, 3000);
  for (let u = 0; u < 2; u++) {
    const x = u * 6.4;
    // pilasters
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(...M(x, 0, x + 0.45, 4.2));
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(...M(x + 0.05, 0, x + 0.12, 4.2));
    sign(g, x + 0.6, x + 6.2, s.sign, s.ink, s.names[u]);
    // kick plate
    g.fillStyle = 'rgba(20,20,20,0.75)'; g.fillRect(...M(x + 0.5, 0, x + 6.35, 0.5));
    const doorLeft = u === 0;
    const dx = doorLeft ? x + 0.75 : x + 4.95;
    door(g, dx, s.frame);
    glass(g, doorLeft ? x + 2.15 : x + 0.75, 0.55, doorLeft ? x + 6.2 : x + 4.75, 2.85, s.frame, 3);
    glass(g, x + 0.75, 2.95, x + 6.2, 3.15, s.frame, 4);   // transom
    if (s.awning) awning(g, x + 0.6, x + 6.25, s.awning);
  }
  g.restore();
}
function baseCell(g, ox, oy, kind) {
  g.save(); g.translate(ox, oy);
  g.beginPath(); g.rect(0, 0, W, H); g.clip();
  const stone = kind === 0;
  if (stone) { noiseFill(g, 0, 0, W, H, '#b9ad97', 0.1, 4000); g.strokeStyle = 'rgba(60,50,40,0.35)'; g.lineWidth = 2; for (let y = 0.6; y < 4.2; y += 0.6) { g.beginPath(); g.moveTo(0, H - y * PY); g.lineTo(W, H - y * PY); g.stroke(); } for (let y = 0, r = 0; y < 4.2; y += 0.6, r++) for (let x = r % 2 ? 0.6 : 0; x < 12.8; x += 1.2) { g.beginPath(); g.moveTo(x * PX, H - y * PY); g.lineTo(x * PX, H - (y + 0.6) * PY); g.stroke(); } }
  else bricks(g, 0, 0, W, H, '#7b4535');
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(...M(0, 0, 12.8, 0.6));
  g.fillStyle = stone ? '#d8cfbd' : '#c4b8a2'; g.fillRect(...M(0, 3.9, 12.8, 4.2));
  // entrance in the middle with a canopy, windows either side
  door(g, 5.7, '#2a2a2a', 1.4, 2.6);
  g.fillStyle = '#3a3f45'; g.fillRect(...M(5.2, 2.75, 7.6, 2.95));
  for (const x of [0.9, 3.2, 8.3, 10.6]) glass(g, x, 1.1, x + 1.4, 3.3, stone ? '#e6dfd0' : '#efe6d6', 2);
  g.restore();
}

let cached = null;
export function storefrontAtlas(maxAniso = 8) {
  if (cached) return cached;
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 4;
  const g = c.getContext('2d');
  SHOPS.forEach((s, i) => shopCell(g, (i % 2) * W, Math.floor(i / 2) * H, s));
  baseCell(g, 0, 3 * H, 0); baseCell(g, W, 3 * H, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.flipY = false;
  return (cached = t);
}
export const SHOP_VARIANTS = SHOPS.length;   // variants 1..6 = shops, 7..8 = stone / brick bases

// concrete sidewalk slabs, 2.7 m x 2.6 m per repeat, with expansion joints and wear
export function sidewalkTexture(aniso = 8) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  noiseFill(g, 0, 0, 512, 512, '#a9a69f', 0.07, 9000);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 60 : 200},${Math.random() < 0.5 ? 60 : 200},60,0.04)`; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 60, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(40,38,35,0.55)';
  for (const y of [0, 256]) g.fillRect(0, y, 512, 3);
  for (const x of [0, 256]) g.fillRect(x, 0, 3, 512);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  for (const y of [3, 259]) g.fillRect(0, y, 512, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
