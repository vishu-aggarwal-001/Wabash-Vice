// Lights: the aircraft's navigation lights, strobes, beacon and landing light, and airport lighting
// (runway edge, threshold, centre line, approach lights and a working PAPI glide-slope indicator).
// PAPI: four units on the left of the runway about 300 m past the threshold; aimed at 3.50, 3.17, 2.83 and
// 2.50 degrees from the unit nearest the runway outwards. On a 3 degree path: two white, two red.
/* global Cesium */
import { DEG, FT, destPoint, distM, bearingDeg, clamp } from './math.js';
import { nearestAirports } from './airports.js';
import { geoidHeight } from './geoid.js';

function glow(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
}

// sun elevation (degrees) from date, latitude and local solar time: good to about a degree
export function sunElevation(date, latDeg, lonDeg) {
  const doy = Math.floor((date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5);
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (doy + 10)) * DEG;
  const solarH = date.getUTCHours() + date.getUTCMinutes() / 60 + lonDeg / 15;
  const ha = (solarH - 12) * 15 * DEG, la = latDeg * DEG;
  return Math.asin(Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha)) / DEG;
}

const C = (r, g, b) => new Cesium.Color(r, g, b, 1);

export class Lights {
  constructor(scene) {
    this.scene = scene;
    this.img = glow();
    this.plane = scene.primitives.add(new Cesium.BillboardCollection({ scene }));
    this.airport = scene.primitives.add(new Cesium.BillboardCollection({ scene }));
    this.papi = [];
    this.center = null; this.night = 0;
    this.planeLights = [];
  }

  // ------------------------------------------------------------------ aircraft lights
  setAircraft(def) {
    this.plane.removeAll(); this.planeLights = [];
    const b = def.body;
    const tipL = b.reduce((m, p) => (p[1] > m[1] ? p : m), b[0]), tipR = [tipL[0], -tipL[1], tipL[2]];
    const tail = b.reduce((m, p) => (p[0] < m[0] ? p : m), b[0]);
    const belly = [0, 0, Math.min(...def.gear.map((g) => g[2])) * 0.45];
    const nose = b.reduce((m, p) => (p[0] > m[0] ? p : m), b[0]);
    const add = (off, color, kind, size) => this.planeLights.push({ off, kind, size, base: color, bb: this.plane.add({ image: this.img, color, width: size, height: size, show: false }) });
    add([tipL[0] + 0.2, tipL[1] + 0.35, tipL[2] + 0.1], C(1, 0.15, 0.1), 'nav', 16);
    add([tipR[0] + 0.2, tipR[1] - 0.35, tipR[2] + 0.1], C(0.15, 1, 0.3), 'nav', 16);
    add([tail[0] - 0.4, 0, tail[2]], C(1, 1, 1), 'nav', 14);
    add([tipL[0] - 0.2, tipL[1] + 0.35, tipL[2] + 0.1], C(1, 1, 1), 'strobe', 34);
    add([tipR[0] - 0.2, tipR[1] - 0.35, tipR[2] + 0.1], C(1, 1, 1), 'strobe', 34);
    add(belly, C(1, 0.1, 0.05), 'beacon', 18);
    add([nose[0] - 0.3, 0, nose[2] - 0.4], C(1, 0.97, 0.88), 'landing', 34);
  }

  updateAircraft(fm, worldPos, enuMatrix, t, visible) {
    const night = this.night;
    for (const L of this.planeLights) {
      const o = L.off; // the model matrix already holds the attitude
      L.bb.position = Cesium.Matrix4.multiplyByPoint(enuMatrix, new Cesium.Cartesian3(o[0], o[1], o[2]), new Cesium.Cartesian3());
      let on = visible && !fm.crashed;
      if (L.kind === 'strobe') on &&= !fm.onGround && (t % 1.2 < 0.06 || (t % 1.2 > 0.12 && t % 1.2 < 0.17));
      if (L.kind === 'beacon') on &&= fm.N > 0.05 && t % 1.0 < 0.12;
      if (L.kind === 'landing') on &&= fm.ctrl.gearDown && fm.h - fm.groundH < 900;
      L.bb.show = on;
      const s = L.size * (0.35 + 0.65 * night);
      L.bb.width = L.bb.height = s;
      L.bb.color = Cesium.Color.fromAlpha(L.base, 0.45 + 0.55 * night);
    }
  }

  // ------------------------------------------------------------------ airport lights
  // rebuilt when the aircraft has moved a few km; only nearby airports with paved runways are lit
  updateAirports(lat, lon, now, hAircraft, fmLat, fmLon) {
    if (!this.center || distM(lat, lon, this.center[0], this.center[1]) > 6000) this._build(lat, lon);
    // PAPI colours from where the aircraft is
    for (const P of this.papi) {
      const d = distM(fmLat, fmLon, P.lat, P.lon);
      const ang = Math.atan2(hAircraft - P.h, Math.max(d, 1)) / DEG;
      const inFront = Math.abs(((bearingDeg(P.lat, P.lon, fmLat, fmLon) - (P.hdg + 180) + 540) % 360) - 180) < 30;
      P.units.forEach((u, i) => { u.color = ang > P.angles[i] ? this.white : this.red; u.show = inFront; });
    }
    const vis = 0.35 + 0.65 * this.night;
    if (Math.abs(vis - (this._vis ?? -1)) > 0.02) {
      this._vis = vis;
      for (let i = 0; i < this.airport.length; i++) {
        const b = this.airport.get(i);
        if (b._papi) continue;
        b.color = Cesium.Color.fromAlpha(b._base, vis);
        b.width = b.height = b._size * (0.5 + 0.5 * this.night);
      }
    }
  }

  _build(lat, lon) {
    this.center = [lat, lon];
    const A = this.airport; A.removeAll(); this.papi = [];
    this.white = C(1, 1, 1); this.red = C(1, 0.12, 0.08);
    const near = nearestAirports(lat, lon, 4, 22000).filter(({ a }) => a.runways.some((r) => r.paved));
    const add = (la, lo, color, size, hAbove = 0.5, isPapi = false) => {
      const b = A.add({ position: Cesium.Cartesian3.fromDegrees(lo, la, hAbove), heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        image: this.img, color, width: size, height: size, scaleByDistance: new Cesium.NearFarScalar(300, 1.0, 15000, 0.35),
        translucencyByDistance: isPapi ? undefined : new Cesium.NearFarScalar(500, 1.0, 25000, 0.15) });
      b._size = size; b._papi = isPapi; b._base = color; return b;
    };
    const EDGE = C(1, 0.95, 0.85), THR = C(0.2, 1, 0.35), END = C(1, 0.15, 0.1), CL = C(0.95, 0.95, 1), ALS = C(1, 0.98, 0.9);
    for (const { a } of near) {
      for (const r of a.runways) {
        if (!r.paved) continue;
        const [e0, e1] = r.ends, len = distM(e0.lat, e0.lon, e1.lat, e1.lon);
        if (len < 500) continue;
        const hdg = bearingDeg(e0.lat, e0.lon, e1.lat, e1.lon), halfW = Math.max(9, (r.widthFt || 100) * FT / 2) + 1.5;
        // edge lights every 60 m on both sides
        const n = Math.max(2, Math.round(len / 60));
        for (let i = 0; i <= n; i++) {
          const c = destPoint(e0.lat, e0.lon, hdg, (len * i) / n);
          for (const s of [-1, 1]) { const p = destPoint(c[0], c[1], hdg + 90 * s, halfW); add(p[0], p[1], EDGE, 11); }
        }
        // centre line (wide runways at big airports)
        if (a.size === 3 && (r.widthFt || 0) >= 140) for (let x = 30; x < len - 30; x += 60) { const p = destPoint(e0.lat, e0.lon, hdg, x); add(p[0], p[1], CL, 8, 0.2); }
        for (const [th, dir] of [[e0, hdg], [e1, hdg + 180]]) {
          // threshold bar (green) and runway-end bar (red) across the runway
          for (let k = -4; k <= 4; k++) {
            const p = destPoint(th.lat, th.lon, dir + 90, (halfW - 1.5) * k / 4);
            add(p[0], p[1], THR, 12);
            const q = destPoint(p[0], p[1], dir, 3); add(q[0], q[1], END, 9);
          }
          // approach lights on long runways at large airports: a 900 m line and a crossbar at 300 m
          if (a.size === 3 && len > 1800) {
            for (let x = 60; x <= 900; x += 60) { const p = destPoint(th.lat, th.lon, dir + 180, x); add(p[0], p[1], ALS, 13, 1.5); }
            for (let k = -3; k <= 3; k++) { const p = destPoint(th.lat, th.lon, dir + 180, 300); const q = destPoint(p[0], p[1], dir + 90, k * 5); add(q[0], q[1], ALS, 13, 1.5); }
          }
          // PAPI on the left, 300 m past the threshold, 15 m from the runway edge, 9 m apart
          if (len > 900) {
            const base = destPoint(th.lat, th.lon, dir, Math.min(300, len * 0.25));
            const units = [], angles = [3.5, 3.17, 2.83, 2.5]; // nearest the runway first
            for (let k = 0; k < 4; k++) { const p = destPoint(base[0], base[1], dir - 90, halfW + 15 + 9 * k); units.push(add(p[0], p[1], this.red, 22, 1, true)); }
            const hGround = a.elevFt * FT + geoidHeight(base[0], base[1]);
            this.papi.push({ lat: base[0], lon: base[1], h: hGround + 1, hdg: dir, units, angles });
          }
        }
      }
    }
  }

  // calls once a second: how dark is it (0 day .. 1 night) from the sun's elevation
  updateDaylight(date, lat, lon) {
    const el = sunElevation(date, lat, lon);
    this.night = clamp((2 - el) / 10, 0, 1);  // twilight from +2 to -8 degrees
    return el;
  }

  // the runway heights used for PAPI geometry can be refined from the real ground once loaded
  refinePapi(groundHeight) {
    for (const P of this.papi) { if (P.measured) continue; const h = groundHeight(P.lat, P.lon); if (h !== undefined && Math.abs(h + 1 - P.h) < 60) { P.h = h + 1; P.measured = true; } }
  }
}
