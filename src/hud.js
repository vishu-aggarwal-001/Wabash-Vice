// Glass-cockpit instruments drawn on a 2D canvas: primary flight display (attitude, speed, altitude,
// heading, vertical speed), navigation display (moving map with airports) and status readouts.
import { DEG, KT, FT, clamp, wrap360, wrap180, bearingDeg, distM, destPoint } from './math.js';
import { nearestAirports } from './airports.js';

const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const C = { sky: '#2f7fd6', sky2: '#1b4f96', gnd: '#8a5a2b', gnd2: '#5c3a1a', w: '#ffffff', grn: '#3cf07a', mag: '#ff4fd8', cy: '#3fe6ff', amb: '#ffb02e', red: '#ff3b3b', panel: 'rgba(6,10,18,0.72)' };

export class HUD {
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.ndRange = 20; this.nearCache = { t: -99, list: [] }; }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(s) {
    const g = this.g, W = this.W, H = this.H;
    g.clearRect(0, 0, W, H);
    if (!s || !s.show) return;
    const mobile = Math.min(W, H) < 560;
    const big = s.cockpit;
    if (s.touch) {
      // phone / tablet layout: PFD bottom-centre between the stick and the buttons, map top-right
      const size = Math.min(H * (big ? 0.5 : 0.42), W * 0.32, 420);
      this.pfd(W / 2 - size / 2, H - size - 10, size, s);
      if (s.showND) { const nd = Math.min(H * 0.3, W * 0.2, 280); this.nd(W - nd - 14, 66, nd, s); }
      return;
    }
    let size = big ? Math.min(W * 0.5, H * 0.52, 520) : Math.min(W * 0.36, H * 0.4, 360);
    if (mobile) size = Math.min(H * (big ? 0.58 : 0.46), W * 0.38);
    const pfdX = big ? W / 2 - size / 2 - (s.showND ? size * 0.45 : 0) : 14 + (mobile ? 6 : 0);
    const pfdY = H - size - (mobile ? 8 : 34);
    this.pfd(pfdX, pfdY, size, s);
    if (s.showND) {
      const nd = size * 0.85;
      const ndX = big ? pfdX + size + 18 : W - nd - 14;
      this.nd(ndX, H - nd - (mobile ? 8 : 34), nd, s);
    }
    if (big) this.hudSymbology(s);
  }

  // -------------------------------------------------------------- primary flight display
  pfd(x, y, S, s) {
    const g = this.g;
    g.save();
    g.fillStyle = C.panel; this.rr(x - 6, y - 6, S + 12, S + 12, 14); g.fill();
    const ax = x + S * 0.2, aw = S * 0.6, ay = y + S * 0.12, ah = S * 0.66;
    const cx = ax + aw / 2, cy = ay + ah / 2, ppd = ah / 50; // pixels per degree of pitch
    // attitude
    g.save(); this.rr(ax, ay, aw, ah, 10); g.clip();
    g.translate(cx, cy); g.rotate(-s.roll * DEG); g.translate(0, s.pitch * ppd);
    let gr = g.createLinearGradient(0, -ah * 2, 0, 0); gr.addColorStop(0, C.sky2); gr.addColorStop(1, C.sky);
    g.fillStyle = gr; g.fillRect(-aw * 2, -ah * 6, aw * 4, ah * 6);
    gr = g.createLinearGradient(0, 0, 0, ah * 2); gr.addColorStop(0, C.gnd); gr.addColorStop(1, C.gnd2);
    g.fillStyle = gr; g.fillRect(-aw * 2, 0, aw * 4, ah * 6);
    g.strokeStyle = C.w; g.lineWidth = 2; g.beginPath(); g.moveTo(-aw * 2, 0); g.lineTo(aw * 2, 0); g.stroke();
    g.font = `600 ${Math.round(S * 0.032)}px ${FONT}`; g.fillStyle = C.w; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let p = -90; p <= 90; p += 2.5) {
      if (p === 0) continue;
      const yy = -p * ppd; if (Math.abs(yy + s.pitch * ppd) > ah * 0.7) continue;
      const w2 = p % 10 === 0 ? aw * 0.22 : p % 5 === 0 ? aw * 0.12 : aw * 0.05;
      g.lineWidth = 1.5; g.beginPath(); g.moveTo(-w2, yy); g.lineTo(w2, yy); g.stroke();
      if (p % 10 === 0) { g.fillText(Math.abs(p), -w2 - 14, yy); g.fillText(Math.abs(p), w2 + 14, yy); }
    }
    g.restore();
    // flight path vector
    const fpvY = cy + (s.pitch - s.gamma) * ppd, fpvX = cx + clamp(s.drift, -12, 12) * ppd;
    if (s.airborne) {
      g.strokeStyle = C.grn; g.lineWidth = 2; g.beginPath(); g.arc(fpvX, fpvY, S * 0.018, 0, 7);
      g.moveTo(fpvX - S * 0.045, fpvY); g.lineTo(fpvX - S * 0.018, fpvY); g.moveTo(fpvX + S * 0.018, fpvY); g.lineTo(fpvX + S * 0.045, fpvY);
      g.moveTo(fpvX, fpvY - S * 0.018); g.lineTo(fpvX, fpvY - S * 0.035); g.stroke();
    }
    // aircraft symbol
    g.fillStyle = '#111'; g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - aw * 0.32, cy); g.lineTo(cx - aw * 0.12, cy); g.lineTo(cx - aw * 0.12, cy + 8);
    g.moveTo(cx + aw * 0.32, cy); g.lineTo(cx + aw * 0.12, cy); g.lineTo(cx + aw * 0.12, cy + 8); g.stroke();
    g.fillStyle = '#ffd23f'; g.fillRect(cx - 3, cy - 3, 6, 6);
    // bank scale
    g.save(); g.translate(cx, cy); g.strokeStyle = C.w; g.lineWidth = 2;
    const R = ah * 0.46;
    g.beginPath(); g.arc(0, 0, R, (-90 - 60) * DEG, (-90 + 60) * DEG); g.stroke();
    for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = (b - 90) * DEG, l = b % 30 === 0 ? 10 : 6;
      g.beginPath(); g.moveTo(Math.cos(a) * R, Math.sin(a) * R); g.lineTo(Math.cos(a) * (R - l), Math.sin(a) * (R - l)); g.stroke();
    }
    g.rotate(-s.roll * DEG); g.fillStyle = Math.abs(s.roll) > 35 ? C.amb : C.w;
    g.beginPath(); g.moveTo(0, -R + 2); g.lineTo(-7, -R + 14); g.lineTo(7, -R + 14); g.fill();
    g.restore();
    // approach deviation (localizer / glideslope)
    if (s.app) {
      g.fillStyle = C.mag; g.strokeStyle = C.w; g.lineWidth = 1.5;
      const lx = clamp(-s.app.xtk / 150, -1, 1) * aw * 0.4, gy = clamp(s.app.gsErr / 60, -1, 1) * ah * 0.4;
      for (const k of [-2, -1, 1, 2]) { g.beginPath(); g.arc(cx + k * aw * 0.2, ay + ah - 10, 3, 0, 7); g.stroke(); g.beginPath(); g.arc(ax + aw - 10, cy + k * ah * 0.2, 3, 0, 7); g.stroke(); }
      this.diamond(cx + lx, ay + ah - 10, 7); this.diamond(ax + aw - 10, cy + gy, 7);
    }
    // speed tape
    this.tape(x, ay, S * 0.17, ah, s.ias, 10, 1, (v) => Math.round(v), s, 'spd');
    // altitude tape
    this.tape(ax + aw + S * 0.02, ay, S * 0.19, ah, s.altFt, 100, 5, (v) => Math.round(v), s, 'alt');
    // vertical speed
    const vx = x + S - 4, vsP = clamp(s.vsFpm / 4000, -1, 1);
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(vx, ay + 10); g.lineTo(vx, ay + ah - 10); g.stroke();
    g.strokeStyle = s.vsFpm < -2000 && s.agl < 600 ? C.red : C.grn; g.lineWidth = 3;
    g.beginPath(); g.moveTo(vx - 10, cy); g.lineTo(vx, cy - Math.sign(vsP) * Math.sqrt(Math.abs(vsP)) * ah * 0.45); g.stroke();
    g.font = `700 ${Math.round(S * 0.034)}px ${MONO}`; g.textAlign = 'right'; g.fillStyle = C.grn;
    if (Math.abs(s.vsFpm) > 50) g.fillText((s.vsFpm > 0 ? '+' : '') + Math.round(s.vsFpm / 10) * 10, vx - 4, s.vsFpm > 0 ? ay + 4 : ay + ah - 4);
    // heading
    this.headingStrip(ax, ay + ah + S * 0.025, aw, S * 0.11, s);
    // mode annunciators
    g.font = `700 ${Math.round(S * 0.037)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'top';
    const modes = [s.apOn ? 'AP' : '', s.athr ? 'A/THR' : '', s.apOn ? s.apLat : '', s.apOn ? s.apVert : ''].filter(Boolean);
    let mx = ax + aw / 2 - (modes.length - 1) * S * 0.08;
    for (const m of modes) { g.fillStyle = C.grn; g.fillText(m, mx, y + 2); mx += S * 0.16; }
    if (!modes.length) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillText(s.assist ? 'ASSIST' : 'MANUAL', ax + aw / 2, y + 2); }
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `600 ${Math.round(S * 0.033)}px ${FONT}`;
    g.fillStyle = s.machShow ? C.grn : 'transparent'; g.fillText('M ' + s.mach.toFixed(2), x + 2, y + S * 0.06);
    g.fillStyle = C.w; g.textAlign = 'right'; g.fillText(`${s.g.toFixed(1)} G`, x + S - 2, y + S * 0.06);
    g.restore();
  }

  tape(x, y, w, h, val, step, labelEvery, fmt, s, kind) {
    const g = this.g, ppu = h / (kind === 'spd' ? 80 : 900), cy = y + h / 2;
    g.save(); g.fillStyle = 'rgba(40,46,60,0.85)'; this.rr(x, y, w, h, 6); g.fill(); g.clip();
    g.strokeStyle = C.w; g.fillStyle = C.w; g.lineWidth = 1.5; g.font = `600 ${Math.round(w * 0.22)}px ${MONO}`; g.textBaseline = 'middle';
    const range = (h / 2) / ppu, start = Math.floor((val - range) / step) * step;
    // colour bands on the speed tape
    if (kind === 'spd') {
      const band = (from, to, col) => { const y0 = cy - (to - val) * ppu, y1 = cy - (from - val) * ppu; g.fillStyle = col; g.fillRect(x + w - 6, y0, 6, y1 - y0); };
      band(0, s.vs1, C.red); band(s.vs0, s.vfe, '#ffffff'); band(s.vne, 2000, C.red);
      g.fillStyle = C.w;
    }
    for (let v = start; v <= val + range; v += step) {
      if (kind === 'spd' && v < 0) continue;
      const yy = cy - (v - val) * ppu;
      const major = Math.round(v / step) % labelEvery === 0 || kind === 'spd';
      g.beginPath();
      if (kind === 'spd') { g.moveTo(x + w - 12, yy); g.lineTo(x + w - 2, yy); } else { g.moveTo(x, yy); g.lineTo(x + (major ? 12 : 6), yy); }
      g.stroke();
      if (major && (kind === 'spd' ? v % 20 === 0 : true)) { g.textAlign = kind === 'spd' ? 'right' : 'left'; g.fillText(fmt(v), kind === 'spd' ? x + w - 15 : x + 15, yy); }
    }
    // bug
    const bug = kind === 'spd' ? s.spdBug : s.altBug;
    if (bug != null) {
      const yy = clamp(cy - (bug - val) * ppu, y + 4, y + h - 4); g.fillStyle = C.cy;
      if (kind === 'spd') { g.beginPath(); g.moveTo(x + w, yy); g.lineTo(x + w - 9, yy - 6); g.lineTo(x + w - 9, yy + 6); g.fill(); }
      else { g.fillRect(x, yy - 6, 6, 12); }
    }
    if (kind === 'spd' && s.trend) { g.strokeStyle = C.grn; g.lineWidth = 2; g.beginPath(); g.moveTo(x + w - 4, cy); g.lineTo(x + w - 4, cy - clamp(s.trend, -40, 40) * ppu); g.stroke(); }
    g.restore();
    // readout box
    g.save(); g.fillStyle = '#000'; g.strokeStyle = C.w; g.lineWidth = 1.5;
    const bh = w * 0.42; this.rr(x - 2, cy - bh / 2, w + 4, bh, 5); g.fill(); g.stroke();
    g.fillStyle = kind === 'spd' && s.ias < s.vs1 * 1.05 && s.airborne ? C.red : C.w;
    g.font = `700 ${Math.round(w * 0.27)}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(fmt(val), x + w / 2, cy + 1);
    g.restore();
  }

  headingStrip(x, y, w, h, s) {
    const g = this.g; g.save(); g.fillStyle = 'rgba(40,46,60,0.85)'; this.rr(x, y, w, h, 6); g.fill(); g.clip();
    const ppd = w / 60, cx = x + w / 2;
    g.strokeStyle = C.w; g.fillStyle = C.w; g.lineWidth = 1.5; g.font = `600 ${Math.round(h * 0.36)}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let d = Math.floor((s.heading - 32) / 5) * 5; d <= s.heading + 32; d += 5) {
      const xx = cx + wrap180(d - s.heading) * ppd, dd = wrap360(d);
      g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y + (dd % 10 === 0 ? 10 : 5)); g.stroke();
      if (dd % 10 === 0) g.fillText(dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd / 10).padStart(2, '0'), xx, y + 12);
    }
    if (s.hdgBug != null) { const xx = cx + clamp(wrap180(s.hdgBug - s.heading), -30, 30) * ppd; g.fillStyle = C.cy; g.fillRect(xx - 6, y, 12, 6); }
    const tx = cx + clamp(wrap180(s.track - s.heading), -30, 30) * ppd; g.fillStyle = C.grn; g.beginPath(); g.arc(tx, y + h - 6, 3.5, 0, 7); g.fill();
    g.restore();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(cx, y + 9); g.lineTo(cx - 6, y - 1); g.lineTo(cx + 6, y - 1); g.fill();
    g.fillStyle = '#000'; g.strokeStyle = C.w; this.rr(cx - 26, y + h - 2, 52, h * 0.55, 4); g.fill(); g.stroke();
    g.fillStyle = C.w; g.font = `700 ${Math.round(h * 0.38)}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(Math.round(s.heading) % 360).padStart(3, '0') + '°', cx, y + h - 2 + h * 0.28);
  }

  // -------------------------------------------------------------- navigation display (heading-up moving map)
  nd(x, y, S, s) {
    const g = this.g, cx = x + S / 2, cy = y + S * 0.58, R = S * 0.44, range = this.ndRange * 1852;
    g.save(); g.fillStyle = C.panel; this.rr(x - 6, y - 6, S + 12, S + 12, 14); g.fill();
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
    const toXY = (lat, lon) => {
      const d = distM(s.lat, s.lon, lat, lon), b = (bearingDeg(s.lat, s.lon, lat, lon) - s.heading) * DEG;
      return [cx + Math.sin(b) * (d / range) * R, cy - Math.cos(b) * (d / range) * R, d];
    };
    // range rings
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R / 2, 0, 7); g.stroke();
    // airports
    if (s.t - this.nearCache.t > 1.5 || this.nearCache.range !== this.ndRange) {
      this.nearCache = { t: s.t, range: this.ndRange, list: nearestAirports(s.lat, s.lon, 40, range * 1.5) };
    }
    g.font = `600 ${Math.round(S * 0.036)}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    for (const { a } of this.nearCache.list) {
      const [px, py] = toXY(a.lat, a.lon);
      const rw = a.runways[0];
      if (rw && this.ndRange <= 40) {
        const [x1, y1] = toXY(rw.ends[0].lat, rw.ends[0].lon), [x2, y2] = toXY(rw.ends[1].lat, rw.ends[1].lon);
        g.strokeStyle = C.w; g.lineWidth = 3; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
      g.strokeStyle = a.size === 3 ? C.cy : a.size === 2 ? '#9fd8ff' : '#7a8ea8'; g.lineWidth = 2;
      g.beginPath(); g.arc(px, py, a.size === 3 ? 6 : 4, 0, 7); g.stroke();
      if (a.size >= 2 || this.ndRange <= 20) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(a.icao, px + 8, py); }
    }
    // destination / route
    if (s.dest) {
      const [px, py, d] = toXY(s.dest.lat, s.dest.lon);
      g.strokeStyle = C.mag; g.lineWidth = 2.5; g.setLineDash([8, 6]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(px, py); g.stroke(); g.setLineDash([]);
      // extended centreline
      const far = destPoint(s.dest.lat, s.dest.lon, s.dest.hdg + 180, 18000), [fx, fy] = toXY(far[0], far[1]);
      g.strokeStyle = 'rgba(255,79,216,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, py); g.lineTo(fx, fy); g.stroke();
      this.diamond(px, py, 7, C.mag);
    }
    g.restore();
    // compass rose
    g.strokeStyle = C.w; g.lineWidth = 1.5; g.font = `700 ${Math.round(S * 0.04)}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = C.w;
    for (let d = 0; d < 360; d += 10) {
      const a = (d - s.heading - 90) * DEG, l = d % 30 === 0 ? 10 : 5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l)); g.stroke();
      if (d % 30 === 0) g.fillText(d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : d / 10, cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
    }
    // own aircraft
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx - 9, cy + 8); g.lineTo(cx, cy + 4); g.lineTo(cx + 9, cy + 8); g.fill();
    // track line
    const ta = (s.track - s.heading - 90) * DEG; g.strokeStyle = C.grn; g.lineWidth = 1.5; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ta) * R, cy + Math.sin(ta) * R); g.stroke(); g.setLineDash([]);
    // texts
    g.textAlign = 'left'; g.textBaseline = 'top'; g.font = `700 ${Math.round(S * 0.042)}px ${MONO}`; g.fillStyle = C.w;
    g.fillText(`GS ${Math.round(s.gsKt)}  TAS ${Math.round(s.tasKt)}`, x + 4, y + 2);
    g.textAlign = 'right'; g.fillStyle = C.cy; g.fillText(`${this.ndRange} NM`, x + S - 4, y + 2);
    if (s.windKt > 0.5) {
      g.save(); g.translate(x + 22, y + S * 0.18); g.rotate((s.windFrom + 180 - s.heading) * DEG);
      g.strokeStyle = C.w; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -12); g.lineTo(0, 12); g.moveTo(-5, 6); g.lineTo(0, 12); g.lineTo(5, 6); g.stroke(); g.restore();
      g.textAlign = 'left'; g.fillStyle = C.w; g.font = `600 ${Math.round(S * 0.036)}px ${MONO}`;
      g.fillText(`${String(Math.round(s.windFrom)).padStart(3, '0')}/${Math.round(s.windKt)}`, x + 38, y + S * 0.16);
    }
    if (s.dest) {
      g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillStyle = C.mag; g.font = `700 ${Math.round(S * 0.042)}px ${MONO}`;
      const dNm = distM(s.lat, s.lon, s.dest.lat, s.dest.lon) / 1852, eta = s.gsKt > 30 ? (dNm / s.gsKt) * 60 : null;
      g.fillText(`${s.dest.icao} ${s.dest.ident}`, x + S - 4, y + S - 22);
      g.fillStyle = C.w; g.fillText(`${dNm.toFixed(dNm < 10 ? 1 : 0)} NM${eta ? '  ' + Math.round(eta) + ' min' : ''}`, x + S - 4, y + S - 4);
    }
    g.restore();
  }

  hudSymbology(s) { /* cockpit view uses the big PFD */ }

  diamond(x, y, r, col = C.mag) { const g = this.g; g.fillStyle = col; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.7, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.7, y); g.fill(); }
  rr(x, y, w, h, r) { const g = this.g; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
}
