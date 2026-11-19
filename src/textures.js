// Procedural textures — everything is drawn on canvases at startup, so the
// game ships with no image assets except the baked ground map.
import * as THREE from 'three';

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

let seed = 1337;
export function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

function speckle(g, w, h, n, alpha, light = false) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${rnd() * alpha})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

export function toTex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// ---------------------------------------------------------------- roads
// u runs across the road (0 = left edge, 1 = right edge), v runs along it (1 unit = 12 m)
export function roadTexture(kind) {
  const [c, g] = canvas(256, 512);
  g.fillStyle = kind === 'foot' ? '#b9b3a6' : kind === 'rail' ? '#6b6258' : '#3a3b3e';
  g.fillRect(0, 0, 256, 512);
  speckle(g, 256, 512, 9000, 0.25);
  speckle(g, 256, 512, 5000, 0.12, true);
  if (kind === 'foot') {
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    for (let y = 0; y < 512; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  } else if (kind === 'rail') {
    g.fillStyle = '#4a3a2c';
    for (let y = 0; y < 512; y += 26) g.fillRect(20, y, 216, 12);
    g.fillStyle = '#9aa0a6';
    g.fillRect(70, 0, 10, 512); g.fillRect(176, 0, 10, 512);
  } else {
    // tyre wear
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (const x of [0.17, 0.33, 0.67, 0.83]) g.fillRect(x * 256 - 12, 0, 24, 512);
    // patches & cracks
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(20,20,22,${0.15 + rnd() * 0.2})`;
      g.fillRect(rnd() * 220, rnd() * 480, 20 + rnd() * 50, 20 + rnd() * 70);
    }
    g.fillStyle = '#e9e6dc';
    g.fillRect(6, 0, 5, 512); g.fillRect(245, 0, 5, 512);           // edge lines
    if (kind === 'major') {
      g.fillStyle = '#e8b52a';                                        // double yellow
      g.fillRect(121, 0, 4, 512); g.fillRect(131, 0, 4, 512);
      g.fillStyle = '#e9e6dc';                                        // dashed lane lines
      for (let y = 0; y < 512; y += 128) { g.fillRect(62, y, 4, 64); g.fillRect(190, y, 4, 64); }
    } else if (kind === 'minor') {
      g.fillStyle = 'rgba(232,181,42,0.9)';
      for (let y = 0; y < 512; y += 128) g.fillRect(126, y, 4, 60);
    }
  }
  return toTex(c);
}

export function concreteTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = '#a7a39b'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 6000, 0.2); speckle(g, 256, 256, 3000, 0.15, true);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.strokeRect(0, 0, 256, 256);
  return toTex(c);
}

// ---------------------------------------------------------------- buildings
// One 2048x1024 atlas, 4x2 tiles of 512px. Each tile = 4 window bays x 4 floors.
// Tiles: 0 house siding, 1 red brick (Purdue / downtown), 2 glass office, 3 apartments,
//        4 industrial metal, 5 plain garage/stucco, 6 gravel roof, 7 shingle roof.
export const ATLAS_TILES = 8;
export function buildingAtlas() {
  const [c, g] = canvas(2048, 1024);
  const [ce, ge] = canvas(2048, 1024);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 2048, 1024);
  const tile = (i) => [(i % 4) * 512, Math.floor(i / 4) * 512];
  const lit = (x, y, w, h, p = 0.32) => {
    if (rnd() < p) {
      const warm = rnd();
      ge.fillStyle = warm < 0.7 ? `rgb(255,${200 + rnd() * 40 | 0},${120 + rnd() * 60 | 0})` : 'rgb(190,215,255)';
      ge.globalAlpha = 0.55 + rnd() * 0.45;
      ge.fillRect(x, y, w, h);
      ge.globalAlpha = 1;
    }
  };
  const glass = (x, y, w, h) => {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, '#2d3b48'); gr.addColorStop(0.5, '#4f6576'); gr.addColorStop(1, '#22303b');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };
  // 0 house siding
  {
    const [ox, oy] = tile(0);
    g.fillStyle = '#e8e4da'; g.fillRect(ox, oy, 512, 512);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < 512; y += 8) { g.beginPath(); g.moveTo(ox, oy + y); g.lineTo(ox + 512, oy + y); g.stroke(); }
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      if ((bx + fy) % 3 === 2) continue;
      const x = ox + bx * 128 + 34, y = oy + fy * 128 + 30;
      g.fillStyle = '#fbfbf7'; g.fillRect(x - 6, y - 6, 72, 82);
      glass(x, y, 60, 70);
      g.fillStyle = '#fbfbf7'; g.fillRect(x + 28, y, 4, 70); g.fillRect(x, y + 33, 60, 4);
      g.fillStyle = '#35424a'; g.fillRect(x - 18, y - 6, 12, 82); g.fillRect(x + 66, y - 6, 12, 82);
      lit(x, y, 60, 70, 0.4);
    }
  }
  // 1 red brick with limestone trim
  {
    const [ox, oy] = tile(1);
    g.fillStyle = '#9c4a33'; g.fillRect(ox, oy, 512, 512);
    for (let y = 0; y < 512; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < 512; x += 16) {
      const v = 120 + rnd() * 50;
      g.fillStyle = `rgb(${v + 30 | 0},${v * 0.45 | 0},${v * 0.32 | 0})`;
      g.fillRect(ox + x, oy + y, 15, 7);
    }
    for (let fy = 0; fy < 4; fy++) {
      g.fillStyle = '#d8cfb8'; g.fillRect(ox, oy + fy * 128 + 116, 512, 8);   // limestone band
      for (let bx = 0; bx < 4; bx++) {
        const x = ox + bx * 128 + 30, y = oy + fy * 128 + 18;
        g.fillStyle = '#d8cfb8'; g.fillRect(x - 6, y - 8, 80, 8); g.fillRect(x - 4, y + 86, 76, 8);
        glass(x, y, 68, 86);
        g.fillStyle = '#e9e3d2'; g.fillRect(x + 32, y, 4, 86); g.fillRect(x, y + 40, 68, 4);
        lit(x, y, 68, 86, 0.3);
      }
    }
  }
  // 2 glass office
  {
    const [ox, oy] = tile(2);
    glass(ox, oy, 512, 512);
    for (let fy = 0; fy < 4; fy++) {
      g.fillStyle = '#c9cdd2'; g.fillRect(ox, oy + fy * 128 + 112, 512, 16);
      for (let bx = 0; bx < 8; bx++) {
        g.fillStyle = '#9aa3ab'; g.fillRect(ox + bx * 64, oy + fy * 128, 5, 112);
        lit(ox + bx * 64 + 5, oy + fy * 128, 59, 112, 0.28);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(ox + i * 120, oy); g.lineTo(ox + i * 120 + 60, oy); g.lineTo(ox + i * 120 - 140, oy + 512); g.lineTo(ox + i * 120 - 200, oy + 512); g.fill(); }
  }
  // 3 apartments / dorms
  {
    const [ox, oy] = tile(3);
    g.fillStyle = '#cdbfa6'; g.fillRect(ox, oy, 512, 512);
    speckle(g, 512, 512, 0, 0);
    for (let fy = 0; fy < 4; fy++) {
      g.fillStyle = '#a99a80'; g.fillRect(ox, oy + fy * 128 + 104, 512, 24);
      for (let bx = 0; bx < 4; bx++) {
        const x = ox + bx * 128 + 22, y = oy + fy * 128 + 22;
        glass(x, y, 84, 72);
        g.fillStyle = '#efe9dc'; g.fillRect(x + 40, y, 4, 72);
        g.fillStyle = 'rgba(60,60,60,0.8)'; g.fillRect(x - 6, y + 72, 96, 6);
        lit(x, y, 84, 72, 0.38);
      }
    }
  }
  // 4 industrial metal
  {
    const [ox, oy] = tile(4);
    g.fillStyle = '#8e969c'; g.fillRect(ox, oy, 512, 512);
    for (let x = 0; x < 512; x += 12) { g.fillStyle = x % 24 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)'; g.fillRect(ox + x, oy, 6, 512); }
    for (let bx = 0; bx < 4; bx++) { glass(ox + bx * 128 + 20, oy + 30, 88, 26); lit(ox + bx * 128 + 20, oy + 30, 88, 26, 0.2); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(ox + 300, oy + 400, 150, 112);
  }
  // 5 stucco / garage
  {
    const [ox, oy] = tile(5);
    g.fillStyle = '#d6d0c4'; g.fillRect(ox, oy, 512, 512);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; g.fillRect(ox + rnd() * 512, oy + rnd() * 512, 2, 2); }
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx += 2) {
      const x = ox + bx * 128 + 60, y = oy + fy * 128 + 36;
      glass(x, y, 54, 54); lit(x, y, 54, 54, 0.25);
    }
  }
  // 6 gravel roof
  {
    const [ox, oy] = tile(6);
    g.fillStyle = '#6f6c66'; g.fillRect(ox, oy, 512, 512);
    for (let i = 0; i < 26000; i++) { const v = 70 + rnd() * 90 | 0; g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(ox + rnd() * 512, oy + rnd() * 512, 2, 2); }
    g.fillStyle = '#9b9a95'; g.fillRect(ox + 200, oy + 220, 70, 50); g.fillRect(ox + 60, oy + 80, 40, 40);
  }
  // 7 shingles
  {
    const [ox, oy] = tile(7);
    g.fillStyle = '#4a4542'; g.fillRect(ox, oy, 512, 512);
    for (let y = 0; y < 512; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < 512; x += 32) {
      const v = 55 + rnd() * 40 | 0;
      g.fillStyle = `rgb(${v},${v - 4},${v - 6})`; g.fillRect(ox + x + 1, oy + y + 1, 30, 14);
    }
  }
  const map = toTex(c);
  const emissive = toTex(ce);
  map.wrapS = map.wrapT = emissive.wrapS = emissive.wrapT = THREE.ClampToEdgeWrapping;
  return { map, emissive };
}

// ---------------------------------------------------------------- nature / misc
export function detailTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 14000; i++) {
    const v = 90 + rnd() * 90 | 0;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 3);
  }
  return toTex(c, { srgb: false });
}

export function waterNormalTexture() {
  const N = 256;
  const hgt = new Float32Array(N * N);
  for (let k = 0; k < 40; k++) {
    const fx = (1 + Math.floor(rnd() * 8)), fy = (1 + Math.floor(rnd() * 8)), ph = rnd() * 6.283, a = 1 / (fx + fy);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
      hgt[y * N + x] += a * Math.sin((x * fx + y * fy) / N * 6.283 + ph);
  }
  const [c, g] = canvas(N);
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x + N - 1) % N];
    const dy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x];
    const nx = -dx * 3, ny = -dy * 3, nz = 1, l = Math.hypot(nx, ny, nz);
    const i = (y * N + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTex(c, { srgb: false });
}

export function cloudTexture() {
  const [c, g] = canvas(1024);
  g.clearRect(0, 0, 1024, 1024);
  for (let i = 0; i < 32; i++) {
    const x = rnd() * 1024, y = rnd() * 1024, r = 25 + rnd() * 70;
    for (let k = 0; k < 14; k++) {
      const px = x + (rnd() - 0.5) * r * 2.2, py = y + (rnd() - 0.5) * r, pr = r * (0.3 + rnd() * 0.5);
      const gr = g.createRadialGradient(px, py, 0, px, py, pr);
      gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      for (const ox of [-1024, 0, 1024]) for (const oy of [-1024, 0, 1024]) {
        g.save(); g.translate(ox, oy); g.beginPath(); g.arc(px, py, pr, 0, 6.283); g.fill(); g.restore();
      }
    }
  }
  return toTex(c);
}

export function glowTexture() {
  const [c, g] = canvas(64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return toTex(c, { repeat: false });
}

export function textTexture(text, { size = 64, color = '#fff', bg = null, font = 'bold', w = 512, h = 128 } = {}) {
  const [c, g] = canvas(w, h);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.font = `${font} ${size}px system-ui, sans-serif`;
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  return toTex(c, { repeat: false });
}
