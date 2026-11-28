// EGM96 geoid (mean sea level) heights on a 1-degree grid, so the altimeter shows height above sea level
// instead of height above the WGS84 ellipsoid (they differ by up to 106 m around the world).
// data/egm96-1deg.bin: 181 rows (90N..90S) x 360 columns (0..359E), Int16 little-endian, decimetres.
// Source: EGM96 (NGA, public domain), sampled from the 15' grid; bilinear error is under 1 m for 95% of the planet.
const ROWS = 181, COLS = 360;
let grid = null;
export async function loadGeoid(url = 'data/egm96-1deg.bin') {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const buf = await r.arrayBuffer();
    if (buf.byteLength !== ROWS * COLS * 2) throw new Error('bad size');
    grid = new Int16Array(buf);
    return true;
  } catch (e) { console.warn('Geoid data unavailable, altitudes are above the ellipsoid', e); return false; }
}
export function setGeoidGrid(int16) { grid = int16; }
// geoid height N in metres (MSL = ellipsoid height - N)
export function geoidHeight(latDeg, lonDeg) {
  if (!grid) return 0;
  const r = Math.min(Math.max((90 - latDeg), 0), 180), c = ((lonDeg % 360) + 360) % 360;
  const r0 = Math.min(Math.floor(r), ROWS - 2), c0 = Math.floor(c) % COLS, c1 = (c0 + 1) % COLS;
  const fr = r - r0, fc = c - Math.floor(c);
  const g = (rr, cc) => grid[rr * COLS + cc] / 10;
  return (g(r0, c0) * (1 - fc) + g(r0, c1) * fc) * (1 - fr) + (g(r0 + 1, c0) * (1 - fc) + g(r0 + 1, c1) * fc) * fr;
}
