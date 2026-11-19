#!/usr/bin/env python3
"""
Wabash Vice — map builder.

Turns raw OpenStreetMap extracts (downloaded by tools/fetch_osm.sh) into the
game's data files:

  data/map.json     roads, bridges, buildings, trees, labels, traffic graph
  data/terrain.bin  Int16 height grid (decimetres), 8 m cells
  data/ground.jpg   baked land-cover texture (grass, parks, parking, sidewalks...)

Usage:
  python3 tools/build_map.py <dir with roads*.json build.json misc.json> data/

Requires: numpy, scipy, Pillow.
Map data (c) OpenStreetMap contributors, ODbL.
"""
import json, math, sys, os, glob, hashlib, struct
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else "osm"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data"
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- projection
S, W, N, E = 40.395, -86.945, 40.445, -86.865
LAT0, LON0 = (S + N) / 2, (W + E) / 2
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110540.0

def proj(lat, lon):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)

MINX, MAXX = (W - LON0) * KX, (E - LON0) * KX
MINZ, MAXZ = -(N - LAT0) * KZ, -(S - LAT0) * KZ
WID, HGT = MAXX - MINX, MAXZ - MINZ
CELL = 8.0
NX, NZ = int(math.ceil(WID / CELL)) + 1, int(math.ceil(HGT / CELL)) + 1
TEXW = 4096
TEXH = int(round(TEXW * HGT / WID))
print(f"world {WID:.0f} x {HGT:.0f} m, grid {NX}x{NZ}, texture {TEXW}x{TEXH}")

def hsh(s):
    return int(hashlib.md5(str(s).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF

# ---------------------------------------------------------------- load
def load(pattern):
    out, seen = [], set()
    for f in sorted(glob.glob(os.path.join(SRC, pattern))):
        for e in json.load(open(f))["elements"]:
            k = (e["type"], e["id"])
            if k in seen:
                continue
            seen.add(k)
            out.append(e)
    return out

roads_raw = load("roads*.json")
build_raw = load("build.json")
misc_raw = load("misc.json")
print(len(roads_raw), "roads", len(build_raw), "buildings", len(misc_raw), "misc")

def way_pts(e):
    return [proj(g["lat"], g["lon"]) for g in e.get("geometry", []) if g]

def assemble_rings(members, role="outer"):
    """Join relation member ways into closed rings."""
    segs = [[proj(g["lat"], g["lon"]) for g in m.get("geometry", []) if g]
            for m in members if m.get("type") == "way" and m.get("role", "outer") in (role, "")]
    segs = [s for s in segs if len(s) >= 2]
    rings = []
    key = lambda p: (round(p[0], 2), round(p[1], 2))
    while segs:
        ring = segs.pop(0)
        changed = True
        while key(ring[0]) != key(ring[-1]) and changed:
            changed = False
            for i, s in enumerate(segs):
                if key(s[0]) == key(ring[-1]):
                    ring += s[1:]
                elif key(s[-1]) == key(ring[-1]):
                    ring += s[::-1][1:]
                elif key(s[-1]) == key(ring[0]):
                    ring = s + ring[1:]
                elif key(s[0]) == key(ring[0]):
                    ring = s[::-1] + ring[1:]
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if len(ring) >= 4:
            rings.append(ring)
    return rings

def dp(pts, eps):
    """Douglas-Peucker simplification."""
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a
    L = np.hypot(*ab)
    best, idx = -1, 0
    for i in range(1, len(pts) - 1):
        p = np.array(pts[i])
        d = abs(ab[0] * (a[1] - p[1]) - ab[1] * (a[0] - p[0])) / L if L > 1e-9 else np.hypot(*(p - a))
        if d > best:
            best, idx = d, i
    if best > eps:
        return dp(pts[: idx + 1], eps)[:-1] + dp(pts[idx:], eps)
    return [pts[0], pts[-1]]

def area(r):
    s = 0
    for i in range(len(r)):
        x1, z1 = r[i]; x2, z2 = r[(i + 1) % len(r)]
        s += x1 * z2 - x2 * z1
    return s / 2

# raster helpers --------------------------------------------------------------
def to_grid(p):  # world -> terrain grid coords
    return ((p[0] - MINX) / CELL, (p[1] - MINZ) / CELL)

def to_tex(p):
    return ((p[0] - MINX) / WID * TEXW, (p[1] - MINZ) / HGT * TEXH)

# ---------------------------------------------------------------- water + terrain
wabash_rings, pond_rings = [], []
for e in misc_raw:
    t = e.get("tags", {})
    if t.get("natural") == "water":
        if e["type"] == "relation":
            rings = assemble_rings(e.get("members", []))
            if t.get("name") == "Wabash River" or t.get("water") == "river":
                wabash_rings += rings
            else:
                pond_rings += rings
        else:
            r = way_pts(e)
            if len(r) >= 4:
                (wabash_rings if t.get("water") == "river" else pond_rings).append(r)
print("water rings", len(wabash_rings), len(pond_rings))

def raster(rings, w, h, fn, width=None, lines=False):
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    for r in rings:
        pts = [fn(p) for p in r]
        if lines:
            d.line(pts, fill=255, width=max(1, int(width)))
        else:
            d.polygon(pts, fill=255)
    return np.array(img) > 0

wab = raster(wabash_rings, NX, NZ, to_grid)
ponds = np.zeros_like(wab)          # ponds are painted, not carved (they sit on hills)
water = wab
print("water cells", water.sum())

d_out_w = ndimage.distance_transform_edt(~wab) * CELL
d_in = ndimage.distance_transform_edt(water) * CELL
d_out_any = ndimage.distance_transform_edt(~water) * CELL

# which side of the river (west = West Lafayette bluff, steeper)
cols = np.arange(NX)
river_cx = np.full(NZ, np.nan)
for zrow in range(NZ):
    xs = np.nonzero(wab[zrow])[0]
    if len(xs):
        river_cx[zrow] = xs.mean()
valid = ~np.isnan(river_cx)
river_cx = np.interp(np.arange(NZ), np.nonzero(valid)[0], river_cx[valid])
west = cols[None, :] < river_cx[:, None]

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

gx, gz = np.meshgrid(np.arange(NX) * CELL + MINX, np.arange(NZ) * CELL + MINZ)
rng = np.random.default_rng(7)
noise = ndimage.gaussian_filter(rng.standard_normal((NZ, NX)), 28)
noise = noise / (np.abs(noise).max() + 1e-9) * 2.2

h = 1.2 + 2.6 * sstep(0, 45, d_out_any)                   # river banks
h += 1.6 * sstep(45, 350, d_out_w)                          # floodplain
bluff_w = 24.0 * sstep(260, 820, d_out_w)                   # West Lafayette / Purdue hill
bluff_e = 17.0 * sstep(380, 1500, d_out_w)                  # Lafayette rises gently east
h += np.where(west, bluff_w, bluff_e)
h += noise * sstep(150, 600, d_out_any)
h = np.where(water, -0.6 - 4.2 * sstep(0, 40, d_in) * np.where(wab, 1, 0.4), h)
h = ndimage.gaussian_filter(h, 1.0)
h = np.where(water & (h > -0.6), -0.6, h)

# flatten the airport so runways are level
airport_c = proj(40.4123, -86.9369)
ad = np.hypot(gx - airport_c[0], gz - airport_c[1])
air_h = float(h[np.unravel_index(np.argmin(ad), ad.shape)])
h = np.where(ad < 1100, air_h, np.where(ad < 1600, air_h + (h - air_h) * sstep(1100, 1600, ad), h))

def H(x, z):
    """bilinear terrain height (matches the game)."""
    fx = min(max((x - MINX) / CELL, 0), NX - 1.001)
    fz = min(max((z - MINZ) / CELL, 0), NZ - 1.001)
    ix, iz = int(fx), int(fz)
    tx, tz = fx - ix, fz - iz
    a = h[iz, ix] * (1 - tx) + h[iz, ix + 1] * tx
    b = h[iz + 1, ix] * (1 - tx) + h[iz + 1, ix + 1] * tx
    return a * (1 - tz) + b * tz

def is_water(x, z):
    gxi = int(round((x - MINX) / CELL)); gzi = int(round((z - MINZ) / CELL))
    if 0 <= gxi < NX and 0 <= gzi < NZ:
        return bool(water[gzi, gxi])
    return False

# ---------------------------------------------------------------- roads
RTYPES = ["motorway", "trunk", "primary", "secondary", "tertiary", "residential",
          "unclassified", "service", "link", "pedestrian", "footway", "track", "rail"]
WIDTH = {"motorway": 14, "trunk": 12.5, "primary": 11, "secondary": 10, "tertiary": 8.5,
         "residential": 7, "unclassified": 7, "service": 4.5, "link": 6.5, "pedestrian": 6,
         "footway": 2.4, "track": 3.5, "rail": 3.2}
DRIVE = {"motorway", "trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "link"}
names, name_idx = [], {}
def nidx(n):
    if not n:
        return -1
    if n not in name_idx:
        name_idx[n] = len(names); names.append(n)
    return name_idx[n]

def rtype(t):
    hw = t.get("highway")
    if t.get("railway") == "rail":
        return "rail"
    if hw is None:
        return None
    if hw.endswith("_link"):
        return "link"
    if hw in ("footway", "path", "cycleway", "bridleway"):
        return "footway"
    if hw in ("steps", "corridor", "elevator", "proposed", "construction", "platform", "bus_stop", "raceway"):
        return None
    if hw == "living_street":
        return "residential"
    return hw if hw in WIDTH else None

roads, graph_ways = [], []
node_y = {}
ways = roads_raw + [e for e in misc_raw if e.get("tags", {}).get("railway") == "rail"]
for e in ways:
    if e["type"] != "way":
        continue
    t = e.get("tags", {})
    rt = rtype(t)
    if rt is None or t.get("tunnel") in ("yes", "building_passage", "culvert") or t.get("indoor") == "yes":
        continue
    if t.get("area") == "yes":
        continue
    pts = way_pts(e)
    ids = e.get("nodes", [])
    if len(pts) < 2 or len(ids) != len(pts):
        continue
    bridge = t.get("bridge") not in (None, "no")
    layer = int(t.get("layer", "1" if bridge else "0") or 0) if str(t.get("layer", "0")).lstrip("-").isdigit() else 0
    # resample into <= 8 m pieces, remember original vertex positions
    dense, orig_at = [pts[0]], [0]
    for i in range(1, len(pts)):
        (x0, z0), (x1, z1) = pts[i - 1], pts[i]
        L = math.hypot(x1 - x0, z1 - z0)
        n = max(1, int(math.ceil(L / 8.0)))
        for k in range(1, n + 1):
            dense.append((x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n))
        orig_at.append(len(dense) - 1)
    ys = [H(x, z) for x, z in dense]
    if bridge:
        cum = [0.0]
        for i in range(1, len(dense)):
            cum.append(cum[-1] + math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]))
        Ltot = max(cum[-1], 1e-6)
        h0, h1 = ys[0], ys[-1]
        need = 0.0
        over_water = False
        for i, (x, z) in enumerate(dense):
            base = h0 + (h1 - h0) * cum[i] / Ltot
            if is_water(x, z):
                over_water = True
                need = max(need, 7.5 - base)
            else:
                clear = 5.6 * max(layer, 1) if (0.15 < cum[i] / Ltot < 0.85) else 0
                need = max(need, H(x, z) + clear - base)
        for i in range(len(dense)):
            u = cum[i] / Ltot
            base = h0 + (h1 - h0) * u
            arch = 1 - (2 * u - 1) ** 6 if over_water else math.sin(math.pi * u) ** 0.7
            ys[i] = base + max(0.0, need) * arch
    for k, oi in enumerate(orig_at):
        node_y[ids[k]] = ys[oi] if bridge else node_y.get(ids[k], ys[oi])
    flags = (1 if bridge else 0) | (2 if t.get("oneway") in ("yes", "1", "true") or t.get("junction") == "roundabout" else 0)
    flat = []
    for (x, z), y in zip(dense, ys):
        flat += [round(x, 1), round(y, 2), round(z, 1)]
    roads.append([RTYPES.index(rt), nidx(t.get("name") or t.get("bridge:name")), flags, flat])
    if rt in DRIVE and t.get("access") not in ("no", "private"):
        graph_ways.append((ids, pts, flags & 2, rt))
print("roads", len(roads), "drivable ways", len(graph_ways))

# traffic graph ---------------------------------------------------------------
gnodes, gindex, adj = [], {}, []
def gid(nid, p):
    if nid not in gindex:
        gindex[nid] = len(gnodes)
        gnodes.append([round(p[0], 1), round(node_y.get(nid, H(*p)), 2), round(p[1], 1)])
        adj.append([])
    return gindex[nid]
for ids, pts, oneway, rt in graph_ways:
    for i in range(1, len(ids)):
        a, b = gid(ids[i - 1], pts[i - 1]), gid(ids[i], pts[i])
        if b not in adj[a]:
            adj[a].append(b)
        if not oneway and a not in adj[b]:
            adj[b].append(a)

# ---------------------------------------------------------------- buildings
BKINDS = ["house", "apartments", "commercial", "university", "church", "industrial", "garage", "other", "parking", "stadium", "hangar"]
def bkind(t):
    b = t.get("building", "yes")
    if b in ("house", "detached", "semidetached_house", "terrace", "residential", "bungalow", "duplex"): return "house"
    if b in ("apartments", "dormitory", "hotel"): return "apartments"
    if b in ("commercial", "retail", "office", "supermarket", "civic", "government", "public", "bank"): return "commercial"
    if b in ("university", "college", "school", "hospital"): return "university"
    if b in ("church", "chapel", "cathedral", "temple", "mosque"): return "church"
    if b in ("industrial", "warehouse", "manufacture", "service"): return "industrial"
    if b in ("garage", "garages", "shed", "carport", "roof", "hut"): return "garage"
    if b in ("parking",): return "parking"
    if b in ("grandstand", "stadium"): return "stadium"
    if b in ("hangar",): return "hangar"
    return "other"

def bheight(t, kind, A, rid, cx, cz):
    for k in ("height", "building:height"):
        v = t.get(k)
        if v:
            try:
                return float(v.replace("m", "").strip())
            except ValueError:
                pass
    lv = t.get("building:levels")
    if lv:
        try:
            return float(lv) * 3.4 + 1.2
        except ValueError:
            pass
    r = hsh(rid)
    downtown = math.hypot(cx - DT[0], cz - DT[1]) < 380
    if kind == "house": return 5.5 + r * 3.0
    if kind == "garage": return 3.0 + r
    if kind == "apartments": return 10 + r * (14 if A > 600 else 6)
    if kind == "church": return 13 + r * 6
    if kind == "parking": return 10 + r * 6
    if kind == "stadium": return 22
    if kind == "hangar": return 9
    if kind == "industrial": return 7 + r * 5
    if kind == "university": return 12 + r * 14 if A > 1500 else 9 + r * 6
    if kind == "commercial":
        return (8 + r * 9) if downtown else (6 + r * 6)
    if downtown: return 8 + r * 8
    if A > 2500: return 11 + r * 8
    if A < 90: return 3.5 + r
    return 6 + r * 4

DT = proj(40.4194, -86.8922)
buildings = []
for e in build_raw:
    t = e.get("tags", {})
    if e["type"] == "way":
        rings = [way_pts(e)]
    else:
        rings = assemble_rings(e.get("members", []))
    for ring in rings:
        if len(ring) < 4:
            continue
        ring = dp(ring[:-1] if ring[0] == ring[-1] else ring, 0.35)
        if len(ring) < 3:
            continue
        A = area(ring)
        if abs(A) < 10:
            continue
        if A > 0:  # make clockwise in x/z (consistent winding: negative area)
            ring = ring[::-1]
        kind = bkind(t)
        cx = sum(p[0] for p in ring) / len(ring); cz = sum(p[1] for p in ring) / len(ring)
        ht = bheight(t, kind, abs(A), e["id"], cx, cz)
        if t.get("building") == "roof":
            ht = 4.5
        base = min(H(x, z) for x, z in ring) - 0.6
        top = max(H(x, z) for x, z in ring) + ht
        flat = []
        for x, z in ring:
            flat += [round(x, 1), round(z, 1)]
        buildings.append([round(base, 2), round(top, 2), nidx(t.get("name")), BKINDS.index(kind), flat])
print("buildings", len(buildings))

# ---------------------------------------------------------------- ground texture
ACLASS = {}
def aclass(t):
    if t.get("aeroway") == "runway": return "runway"
    if t.get("aeroway") in ("taxiway", "apron"): return "apron"
    if t.get("amenity") == "parking": return "parking"
    if t.get("leisure") == "pitch": return "pitch"
    if t.get("leisure") == "track": return "track"
    if t.get("leisure") == "stadium": return "pitch"
    if t.get("leisure") == "golf_course": return "golf"
    if t.get("leisure") in ("park", "dog_park", "playground", "water_park"): return "park"
    if t.get("landuse") in ("forest",) or t.get("natural") == "wood": return "wood"
    if t.get("natural") == "scrub": return "scrub"
    if t.get("landuse") in ("farmland", "meadow"): return "field"
    if t.get("landuse") == "cemetery": return "park"
    if t.get("landuse") in ("grass", "recreation_ground"): return "grass"
    return None

areas = {}
runways = []
for e in misc_raw:
    t = e.get("tags", {})
    if e["type"] == "way" and t.get("aeroway") == "runway":
        r = way_pts(e)
        if len(r) >= 2 and r[0] != r[-1]:
            (x0, z0), (x1, z1) = r[0], r[-1]
            runways.append([t.get("ref", ""), round(x0, 1), round(z0, 1), round(x1, 1), round(z1, 1), float(t.get("width", "30") or 30), round(H(x0, z0), 2)])
for e in misc_raw:
    t = e.get("tags", {})
    c = aclass(t)
    if not c:
        continue
    if e["type"] == "way":
        r = way_pts(e)
        if t.get("aeroway") in ("runway", "taxiway") and (len(r) < 3 or r[0] != r[-1]):
            areas.setdefault(c + "_line", []).append((r, 45 if c == "runway" else 18))
            continue
        if len(r) >= 4:
            if c == "track" and abs(area(r)) > 20000:
                c = "grass"
            areas.setdefault(c, []).append(r)

COL = {"base": (104, 128, 66), "grass": (92, 138, 60), "park": (84, 136, 58), "pitch": (66, 140, 58),
       "track": (168, 82, 64), "golf": (94, 150, 62), "wood": (52, 86, 42), "scrub": (100, 112, 62),
       "field": (150, 146, 92), "parking": (78, 79, 82), "apron": (122, 121, 118), "runway": (96, 96, 98),
       "sidewalk": (172, 168, 158), "bed": (86, 78, 58), "bank": (120, 108, 78), "under": (150, 146, 138)}

img = np.zeros((TEXH, TEXW, 3), np.float32)
img[:] = COL["base"]
tn = ndimage.gaussian_filter(rng.standard_normal((TEXH, TEXW)), 6)
tn2 = ndimage.gaussian_filter(rng.standard_normal((TEXH, TEXW)), 1.2)
tn = tn / np.abs(tn).max()
tn2 = tn2 / np.abs(tn2).max()

def paint(mask, col, var=14):
    for c in range(3):
        img[..., c] = np.where(mask, col[c] + tn * var + tn2 * var * 0.35, img[..., c])

for c in ["field", "scrub", "grass", "park", "golf", "wood", "pitch", "track", "parking", "apron"]:
    if c in areas:
        m = raster(areas[c], TEXW, TEXH, to_tex)
        paint(m, COL[c], 6 if c in ("parking", "apron") else 14)
for c in ["apron_line", "runway_line"]:
    for r, w in areas.get(c, []):
        m = raster([r], TEXW, TEXH, to_tex, width=w / (WID / TEXW), lines=True)
        paint(m, COL["runway"] if c.startswith("runway") else COL["apron"], 5)

# sidewalks: concrete halo around drivable urban roads
px = WID / TEXW
sw = Image.new("L", (TEXW, TEXH), 0)
dsw = ImageDraw.Draw(sw)
for rt_i, _, flags, flat in roads:
    rt = RTYPES[rt_i]
    if rt in ("footway", "pedestrian"):
        pts = [to_tex((flat[i], flat[i + 2])) for i in range(0, len(flat), 3)]
        dsw.line(pts, fill=255, width=max(2, int(WIDTH[rt] / px + 1)))
    elif rt in DRIVE and not (flags & 1):
        pts = [to_tex((flat[i], flat[i + 2])) for i in range(0, len(flat), 3)]
        dsw.line(pts, fill=200, width=int((WIDTH[rt] + 5.5) / px))
    elif rt in ("service", "track"):
        pts = [to_tex((flat[i], flat[i + 2])) for i in range(0, len(flat), 3)]
        dsw.line(pts, fill=120, width=int((WIDTH[rt] + 1.5) / px))
swm = np.array(sw)
paint(swm == 200, COL["sidewalk"], 6)
paint(swm == 255, (182, 176, 162), 6)
paint(swm == 120, (110, 106, 96), 6)

# building footprints + soft ambient occlusion around them
bm = raster([[(flat[i], flat[i + 1]) for i in range(0, len(flat), 2)] for *_, flat in buildings], TEXW, TEXH, to_tex)
ao = ndimage.gaussian_filter(bm.astype(np.float32), 3.0)
img *= (1 - 0.45 * np.clip(ao, 0, 1))[..., None]
paint(bm, COL["under"], 4)

# water bed / banks from terrain
th = np.array(Image.fromarray(h.astype(np.float32)).resize((TEXW, TEXH), Image.BILINEAR))
bank = (th < 2.2) & (th > -0.6)
paint(bank & (swm == 0), COL["bank"], 12)
paint(th <= -0.6, COL["bed"], 10)
paint(raster(pond_rings, TEXW, TEXH, to_tex), (58, 92, 104), 4)
# slope darkening for relief
gy, gxx = np.gradient(th)
shade = np.clip(1 + (gxx * -0.9 + gy * -0.6) * 1.6, 0.75, 1.15)
img *= shade[..., None]

Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(OUT, "ground.jpg"), quality=86, optimize=True)

# ---------------------------------------------------------------- trees
trees = []
for e in misc_raw:
    if e["type"] == "node" and e.get("tags", {}).get("natural") == "tree":
        x, z = proj(e["lat"], e["lon"])
        trees.append([round(x, 1), round(z, 1), round(0.8 + hsh(e["id"]) * 0.6, 2)])
osm_tree_count = len(trees)
road_m = np.array(sw) > 0
block = road_m | bm
block = ndimage.binary_dilation(block, iterations=2)
dens = np.zeros((TEXH, TEXW), np.float32) + 0.0009          # lawns / residential
for c, dn in (("wood", 0.03), ("scrub", 0.008), ("park", 0.006), ("grass", 0.002), ("golf", 0.002)):
    if c in areas:
        dens = np.where(raster(areas[c], TEXW, TEXH, to_tex), dn, dens)
for c in ("pitch", "track", "parking", "apron", "field"):
    if c in areas:
        dens = np.where(raster(areas[c], TEXW, TEXH, to_tex), 0, dens)
dens = np.where(block | (th < 1.4), 0, dens)
ad_t = np.array(Image.fromarray(ad.astype(np.float32)).resize((TEXW, TEXH), Image.BILINEAR))
dens = np.where(ad_t < 1150, 0, dens)
ys_, xs_ = np.nonzero(rng.random((TEXH, TEXW)) < dens)
for y, x in zip(ys_, xs_):
    wx = MINX + (x + rng.random()) * px
    wz = MINZ + (y + rng.random()) * (HGT / TEXH)
    trees.append([round(wx, 1), round(wz, 1), round(0.7 + rng.random() * 0.8, 2)])
print("trees", osm_tree_count, "osm +", len(trees) - osm_tree_count, "scattered")

# ---------------------------------------------------------------- labels
labels = []
for b in buildings:
    if b[2] >= 0:
        flat = b[4]
        ring = [(flat[i], flat[i + 1]) for i in range(0, len(flat), 2)]
        A = abs(area(ring))
        if A > 900:
            cx = sum(p[0] for p in ring) / len(ring); cz = sum(p[1] for p in ring) / len(ring)
            labels.append([names[b[2]], round(cx), round(cz), round(A)])

# ---------------------------------------------------------------- write
with open(os.path.join(OUT, "terrain.bin"), "wb") as f:
    f.write(np.round(h * 10).astype("<i2").tobytes())

meta = {
    "attribution": "Map data © OpenStreetMap contributors (ODbL)",
    "bbox": [S, W, N, E], "origin": [LAT0, LON0], "kx": KX, "kz": KZ,
    "minX": MINX, "minZ": MINZ, "width": WID, "height": HGT,
    "cell": CELL, "nx": NX, "nz": NZ, "waterLevel": 0.0,
    "roadTypes": RTYPES, "roadWidth": WIDTH, "buildingKinds": BKINDS,
    "names": names, "roads": roads, "buildings": buildings, "trees": trees,
    "labels": labels, "runways": runways,
    "graph": {"nodes": gnodes, "adj": adj},
}
with open(os.path.join(OUT, "map.json"), "w") as f:
    json.dump(meta, f, separators=(",", ":"))
for fn in ("map.json", "terrain.bin", "ground.jpg"):
    print(fn, os.path.getsize(os.path.join(OUT, fn)) // 1024, "KB")
