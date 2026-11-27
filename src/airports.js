// World airport + runway database (OurAirports, public domain), ~9,800 airports.
// Row: [icao, iata, name, city, country, lat, lon, elevFt, size(3 large, 2 medium, 1 small), runways]
// Runway: [leIdent, leLat, leLon, leHdgTrue, heIdent, heLat, heLon, heHdgTrue, lengthFt, widthFt, paved]
import { distM, bearingDeg } from './math.js';

let DB = [];
export async function loadAirports() {
  const r = await fetch('data/airports.json');
  DB = (await r.json()).map((a) => ({
    icao: a[0], iata: a[1], name: a[2], city: a[3], country: a[4], lat: a[5], lon: a[6], elevFt: a[7], size: a[8],
    runways: a[9].map((w) => ({
      ends: [
        { ident: w[0], lat: w[1], lon: w[2], hdg: w[3] },
        { ident: w[4], lat: w[5], lon: w[6], hdg: w[7] },
      ], lengthFt: w[8], widthFt: w[9], paved: !!w[10],
    })),
    key: `${a[0]} ${a[1]} ${a[2]} ${a[3]}`.toLowerCase(),
  }));
  return DB;
}
export const airports = () => DB;
export const findAirport = (code) => DB.find((a) => a.icao === code.toUpperCase() || (a.iata && a.iata === code.toUpperCase()));

export function searchAirports(q, limit = 12) {
  q = q.trim().toLowerCase();
  if (!q) return DB.filter((a) => a.size === 3).slice(0, limit);
  const up = q.toUpperCase();
  const exact = DB.filter((a) => a.icao === up || a.iata === up);
  const words = q.split(/\s+/);
  const rest = DB.filter((a) => !exact.includes(a) && words.every((w) => a.key.includes(w)));
  rest.sort((a, b) => b.size - a.size);
  return exact.concat(rest).slice(0, limit);
}

// all runway ends, longest first, as spawn options
export function runwayEnds(ap) {
  const out = [];
  for (const r of ap.runways) for (let i = 0; i < 2; i++) {
    const e = r.ends[i], o = r.ends[1 - i];
    out.push({ ...e, far: o, lengthFt: r.lengthFt, widthFt: r.widthFt, paved: r.paved, label: `${e.ident} (${Math.round(r.lengthFt).toLocaleString()} ft)` });
  }
  return out;
}

export function nearestAirports(lat, lon, n = 12, maxM = 150000) {
  const res = [];
  const dLat = maxM / 111000;
  for (const a of DB) {
    if (Math.abs(a.lat - lat) > dLat) continue;
    const d = distM(lat, lon, a.lat, a.lon);
    if (d < maxM) res.push({ a, d, brg: bearingDeg(lat, lon, a.lat, a.lon) });
  }
  res.sort((x, y) => x.d - y.d);
  return res.slice(0, n);
}

// pick the runway end best aligned with the wind (or the longest one)
export function bestRunwayEnd(ap, windFromDeg = null) {
  const ends = runwayEnds(ap).filter((e) => e.paved || ap.runways.every((r) => !r.paved));
  if (windFromDeg === null) return ends.sort((a, b) => b.lengthFt - a.lengthFt)[0];
  const score = (e) => Math.cos(((e.hdg - windFromDeg) * Math.PI) / 180) * 3 + e.lengthFt / 5000;
  return ends.sort((a, b) => score(b) - score(a))[0];
}
