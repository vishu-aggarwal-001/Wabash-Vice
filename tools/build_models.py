"""Generates the three original aircraft models as .glb files (no external assets).
Built in a body frame x=forward, y=left, z=up (metres, origin = centre of gravity)
and converted to glTF's Y-up on export. Named nodes the game animates:
  prop    - propeller (spun around x)
  gear    - landing gear (hidden when retracted)
  burner  - afterburner flame (shown with afterburner)
Usage: python3 build_models.py OUTDIR
"""
import json, math, struct, sys, os
import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'

# ---------------------------------------------------------------- mesh helpers
class Mesh:
    def __init__(self):
        self.v = []; self.n = []; self.i = []
    def add(self, verts, norms, idx):
        base = len(self.v)
        self.v += list(map(tuple, verts)); self.n += list(map(tuple, norms))
        self.i += [base + k for k in idx]
        return self
    def extend(self, m):
        return self.add(m.v, m.n, m.i)

def smooth_normals(V, I):
    V = np.asarray(V, float); N = np.zeros_like(V)
    T = np.asarray(I).reshape(-1, 3)
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    for k in range(3): np.add.at(N, T[:, k], fn)
    L = np.linalg.norm(N, axis=1, keepdims=True); L[L == 0] = 1
    return N / L

def grid_mesh(P, closed_u=True, cap0=False, cap1=False):
    """P: array [rings][pts][3]. Triangulates between consecutive rings."""
    P = np.asarray(P, float); R, S = P.shape[:2]
    V = P.reshape(-1, 3); I = []
    segs = S if closed_u else S - 1
    for r in range(R - 1):
        for s in range(segs):
            a = r * S + s; b = r * S + (s + 1) % S; c = (r + 1) * S + s; d = (r + 1) * S + (s + 1) % S
            I += [a, c, b, b, c, d]
    m = Mesh().add(V, smooth_normals(V, I), I)
    for cap, ring, flip in ((cap0, P[0], True), (cap1, P[-1], False)):
        if not cap: continue
        ctr = ring.mean(0); vs = np.vstack([ctr, ring])
        idx = []
        for s in range(S):
            t = [0, 1 + s, 1 + (s + 1) % S]
            idx += [t[0], t[2], t[1]] if flip else t
        nrm = np.cross(vs[idx[1]] - vs[idx[0]], vs[idx[2]] - vs[idx[0]]); nrm /= (np.linalg.norm(nrm) or 1)
        m.add(vs, np.tile(nrm, (len(vs), 1)), idx)
    return m

def loft(sections, n=24):
    """sections: (x, cy, cz, half_width, half_height[, squareness])"""
    rings = []
    for sec in sections:
        x, cy, cz, ry, rz = sec[:5]; sq = sec[5] if len(sec) > 5 else 2.0
        ring = []
        for k in range(n):
            t = 2 * math.pi * k / n
            c, s = math.cos(t), math.sin(t)
            # superellipse for boxier cross-sections
            cy_ = math.copysign(abs(c) ** (2 / sq), c); sz = math.copysign(abs(s) ** (2 / sq), s)
            ring.append((x, cy + ry * cy_, cz + rz * sz))
        rings.append(ring)
    # ring order goes around +y -> +z ; reverse so normals face outward along +x direction of travel
    rings = [r[::-1] for r in rings]
    return grid_mesh(rings, True, True, True)

def airfoil(n=14, t=0.12, camber=0.02):
    """returns closed loop of (x along chord 0..1, z) points, LE->upper->TE->lower"""
    xs = [(1 - math.cos(math.pi * k / n)) / 2 for k in range(n + 1)]
    def yt(x): return 5 * t * (0.2969 * math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4)
    def yc(x): return camber * (1 - (2 * x - 1) ** 2)
    up = [(x, yc(x) + yt(x)) for x in xs]
    lo = [(x, yc(x) - yt(x)) for x in xs[::-1][1:-1]]
    return up + lo

def wing(stations, t=0.12, camber=0.02, mirror=True, vertical=False):
    """stations: list of (le_x, y, z, chord). Chord runs toward -x.
    vertical=True: the 'y' value is used as height (a fin)."""
    prof = airfoil(t=t, camber=camber)
    def build(sign):
        rings = []
        for (lx, y, z, ch) in stations:
            ring = []
            for (px, pz) in prof:
                X = lx - px * ch
                if vertical: ring.append((X, -pz * ch * sign, y))
                else: ring.append((X, y * sign, z + pz * ch))
            rings.append(ring if sign > 0 else ring[::-1])
        if vertical: rings = [r[::-1] for r in rings]
        return grid_mesh(rings, True, True, True)
    m = build(1)
    if mirror: m.extend(build(-1))
    return m

def cyl(p0, p1, r0, r1=None, n=16, caps=True):
    p0 = np.array(p0, float); p1 = np.array(p1, float); r1 = r0 if r1 is None else r1
    ax = p1 - p0; ax /= np.linalg.norm(ax)
    ref = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(ax, ref); u /= np.linalg.norm(u); w = np.cross(ax, u)
    rings = []
    for p, r in ((p0, r0), (p1, r1)):
        rings.append([p + r * (math.cos(2 * math.pi * k / n) * u + math.sin(2 * math.pi * k / n) * w) for k in range(n)])
    return grid_mesh(rings, True, caps, caps)

def box(c, s):
    c = np.array(c, float); s = np.array(s, float) / 2
    m = Mesh()
    for ax in range(3):
        for sg in (-1, 1):
            nrm = np.zeros(3); nrm[ax] = sg
            a, b = [k for k in range(3) if k != ax]
            q = []
            for (da, db) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                p = c.copy(); p[ax] += sg * s[ax]; p[a] += da * s[a]; p[b] += db * s[b]; q.append(p)
            idx = [0, 1, 2, 0, 2, 3]
            tri_n = np.cross(q[1] - q[0], q[2] - q[0])
            if np.dot(tri_n, nrm) < 0: idx = [0, 2, 1, 0, 3, 2]
            m.add(q, [nrm] * 4, idx)
    return m

def wheel(c, r, w):
    c = np.array(c, float)
    return cyl(c + [0, w / 2, 0], c - [0, w / 2, 0], r, n=18)


# ---------------------------------------------------------------- hinged control surfaces
ANIM = {}  # per model: node name -> {axis (glTF frame), sign, max (deg), input}

def _interp(stations, y):
    """linear interpolation of (le_x, y, z, chord) at span y (stations sorted by y)"""
    for a, b in zip(stations, stations[1:]):
        if a[1] <= y <= b[1] + 1e-9:
            t = 0 if b[1] == a[1] else (y - a[1]) / (b[1] - a[1])
            return tuple(a[k] + (b[k] - a[k]) * t for k in range(4))
    return stations[-1] if y > stations[-1][1] else stations[0]

def wing_split(stations, surfs, t=0.12, camber=0.02, vertical=False):
    """A wing (one side, +y; or a fin when vertical) with hinged trailing-edge surfaces cut out.
    surfs: list of (y0, y1, chord_fraction). Returns (fixed_mesh, [(surface_mesh, hinge0, hinge1)])."""
    cuts = sorted(set([s[1] for s in stations] + [y for (y0, y1, cf) in surfs for y in (y0, y1)]))
    fixed = Mesh(); parts = []
    for ya, yb in zip(cuts, cuts[1:]):
        cover = next((sf for sf in surfs if sf[0] <= ya + 1e-9 and yb <= sf[1] + 1e-9), None)
        sa, sb = _interp(stations, ya), _interp(stations, yb)
        k = 1 - cover[2] if cover else 1.0
        fixed.extend(wing([(sa[0], sa[1], sa[2], sa[3] * k), (sb[0], sb[1], sb[2], sb[3] * k)], t=t / max(k, 0.5), camber=camber, mirror=False, vertical=vertical))
    for (y0, y1, cf) in surfs:
        s0, s1 = _interp(stations, y0), _interp(stations, y1)
        h0 = (s0[0] - s0[3] * (1 - cf), s0[1], s0[2]); h1 = (s1[0] - s1[3] * (1 - cf), s1[1], s1[2])
        surf = wing([(h0[0] - 0.02 * s0[3], y0, s0[2], s0[3] * cf), (h1[0] - 0.02 * s1[3], y1, s1[2], s1[3] * cf)], t=t * 0.9, camber=0, mirror=False, vertical=vertical)
        if vertical: h0 = (h0[0], 0.0, y0); h1 = (h1[0], 0.0, y1)
        parts.append((surf, h0, h1))
    return fixed, parts

def mirror_y(m):
    V = np.array(m.v) * [1, -1, 1]; N = np.array(m.n) * [1, -1, 1]
    I = np.array(m.i).reshape(-1, 3)[:, ::-1].ravel().tolist()
    return Mesh().add(V, N, I)

def hinge_node(model, name, mesh, mat, h0, h1, want, maxdeg, inp):
    """register a hinged surface: rotates about the h0->h1 hinge line; 'want' = body-frame direction the trailing
    edge moves for a positive command"""
    h0 = np.array(h0, float); h1 = np.array(h1, float)
    ax = (h1 - h0) / np.linalg.norm(h1 - h0)
    te = np.array([-1.0, 0, 0])  # trailing edge sits aft of the hinge
    moved = np.cross(ax, te)       # direction the TE moves for a small +rotation
    sign = 1 if np.dot(moved, np.array(want, float)) > 0 else -1
    g = to_gltf([ax])[0]
    ANIM.setdefault(model, {})[name] = {'axis': [round(float(v), 5) for v in g], 'sign': sign, 'max': maxdeg, 'input': inp}
    return (name, [(mesh, mat)], tuple(h0))

def surfaces(model, wparts, hparts, vparts, wmat, hmat, vmat, ail, elev, rud, flap, flaperon=False):
    """nodes for ailerons/flaps (wing parts: inner = flap, outer = aileron unless flaperon), elevators, rudder"""
    nodes = []
    mir = lambda h: (h[0], -h[1], h[2])
    for side in ('L', 'R'):
        for k, (m, h0, h1) in enumerate(wparts):
            mm = m if side == 'L' else mirror_y(m); a, b = (h0, h1) if side == 'L' else (mir(h0), mir(h1))
            if flaperon:   # one surface does both: + = trailing edge down on the left wing for right roll
                nodes.append(hinge_node(model, f'flaperon{side}', mm, wmat, a, b, (0, 0, -1), ail, 'flaperonL' if side == 'L' else 'flaperonR'))
                ANIM[model][f'flaperon{side}']['flapMax'] = flap
            elif k == 0 and len(wparts) > 1:
                nodes.append(hinge_node(model, f'flap{side}', mm, wmat, a, b, (0, 0, -1), flap, 'flap'))
            else:
                nodes.append(hinge_node(model, f'aileron{side}', mm, wmat, a, b, (0, 0, -1) if side == 'L' else (0, 0, 1), ail, 'ail'))
        for (m, h0, h1) in hparts:
            mm = m if side == 'L' else mirror_y(m); a, b = (h0, h1) if side == 'L' else (mir(h0), mir(h1))
            nodes.append(hinge_node(model, f'elevator{side}', mm, hmat, a, b, (0, 0, 1), elev, 'elev'))
    for (m, h0, h1) in vparts:
        nodes.append(hinge_node(model, 'rudder', m, vmat, h0, h1, (0, -1, 0), rud, 'rud'))
    return nodes

def write_anim(model):
    with open(os.path.join(OUT, model + '.anim.json'), 'w') as f: json.dump({'nodes': ANIM.get(model, {})}, f, indent=1)

# ---------------------------------------------------------------- GLB writer
def to_gltf(p):  # body FLU -> glTF Y-up (x fwd, y up, z right)
    p = np.asarray(p, float); return np.stack([p[:, 0], p[:, 2], -p[:, 1]], 1)

def write_glb(path, nodes):
    """nodes: list of (name, [(Mesh, material_dict)], translation_or_None)"""
    gl = {'asset': {'version': '2.0', 'generator': 'wabash-flight build_models.py'}, 'scene': 0,
          'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': []}
    blob = bytearray(); mats = {}
    def view(data, target):
        while len(blob) % 4: blob.append(0)
        off = len(blob); blob.extend(data)
        gl['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': target})
        return len(gl['bufferViews']) - 1
    def acc(arr, ctype, typ, target, minmax=False):
        a = {'bufferView': view(arr.tobytes(), target), 'componentType': ctype, 'count': len(arr), 'type': typ}
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        gl['accessors'].append(a); return len(gl['accessors']) - 1
    def mat(m):
        key = json.dumps(m, sort_keys=True)
        if key not in mats:
            d = {'pbrMetallicRoughness': {'baseColorFactor': list(m['c']) + [m.get('a', 1.0)],
                 'metallicFactor': m.get('m', 0.1), 'roughnessFactor': m.get('r', 0.5)}, 'doubleSided': True}
            if 'e' in m: d['emissiveFactor'] = list(m['e'])
            elif m.get('a', 1.0) >= 1: d['emissiveFactor'] = [round(0.11 * c, 4) for c in m['c']]
            if m.get('a', 1.0) < 1: d['alphaMode'] = 'BLEND'
            gl['materials'].append(d); mats[key] = len(gl['materials']) - 1
        return mats[key]
    for (name, parts, tr) in nodes:
        prims = []
        for (mesh, m) in parts:
            V = to_gltf(mesh.v).astype(np.float32); N = to_gltf(mesh.n).astype(np.float32)
            if tr is not None: V = V - to_gltf([tr]).astype(np.float32)[0]
            I = np.asarray(mesh.i, np.uint32)
            prims.append({'attributes': {'POSITION': acc(V, 5126, 'VEC3', 34962, True), 'NORMAL': acc(N, 5126, 'VEC3', 34962)},
                          'indices': acc(I, 5125, 'SCALAR', 34963), 'material': mat(m)})
        gl['meshes'].append({'name': name, 'primitives': prims})
        node = {'name': name, 'mesh': len(gl['meshes']) - 1}
        if tr is not None: node['translation'] = to_gltf([tr])[0].tolist()
        gl['nodes'].append(node); gl['scene'] and None
        gl['scenes'][0]['nodes'].append(len(gl['nodes']) - 1)
    while len(blob) % 4: blob.append(0)
    gl['buffers'].append({'byteLength': len(blob)})
    js = json.dumps(gl, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    open(path, 'wb').write(out)
    print(path, len(out) // 1024, 'KB')

# ---------------------------------------------------------------- materials
WHITE = {'c': (0.93, 0.93, 0.92), 'm': 0.0, 'r': 0.42}        # gloss paint
GOLD = {'c': (0.81, 0.66, 0.29), 'm': 0.2, 'r': 0.4}      # old-gold stripe
BLACK = {'c': (0.06, 0.06, 0.07), 'm': 0.3, 'r': 0.4}
GLASS = {'c': (0.08, 0.13, 0.2), 'm': 0.9, 'r': 0.05, 'a': 0.85}
GREY = {'c': (0.68, 0.69, 0.7), 'm': 0.55, 'r': 0.42}        # bare aluminium
DARK = {'c': (0.18, 0.18, 0.2), 'm': 0.6, 'r': 0.5}
TYRE = {'c': (0.04, 0.04, 0.04), 'm': 0.0, 'r': 0.9}
NAVY = {'c': (0.08, 0.14, 0.3), 'm': 0.0, 'r': 0.4}
CAMO = {'c': (0.47, 0.5, 0.53), 'm': 0.05, 'r': 0.6}         # air-superiority grey
CAMO2 = {'c': (0.33, 0.36, 0.4), 'm': 0.05, 'r': 0.6}
RADOME = {'c': (0.2, 0.21, 0.23), 'm': 0.0, 'r': 0.5}
FLAME = {'c': (1.0, 0.55, 0.15), 'e': (1.0, 0.5, 0.12), 'a': 0.7, 'r': 1.0}
REDL = {'c': (1, 0.1, 0.1), 'e': (1, 0.1, 0.1)}
GRNL = {'c': (0.1, 1, 0.2), 'e': (0.1, 1, 0.2)}

# ================================================================ TRAINER (single-prop, high wing)
def trainer():
    body = loft([(3.55, 0, 0.35, 0.05, 0.05), (3.35, 0, 0.35, 0.42, 0.42), (2.6, 0, 0.35, 0.55, 0.6, 3),
                 (1.6, 0, 0.45, 0.6, 0.75, 3), (0.2, 0, 0.5, 0.6, 0.8, 3), (-1.2, 0, 0.55, 0.5, 0.62, 3),
                 (-3.0, 0, 0.75, 0.25, 0.35, 3), (-4.6, 0, 0.95, 0.1, 0.18, 3)])
    stripe = loft([(2.0, 0, 0.18, 0.62, 0.12, 4), (-3.0, 0, 0.62, 0.27, 0.1, 4)], n=16)
    cabin_glass = loft([(1.75, 0, 1.05, 0.5, 0.22, 3), (1.1, 0, 1.18, 0.6, 0.15, 3), (-0.6, 0, 1.15, 0.55, 0.12, 3)])
    wst = [(1.05, 0.55, 1.3, 1.6), (1.05, 3.0, 1.32, 1.6), (0.95, 5.5, 1.38, 1.2)]
    winL, wparts = wing_split(wst, [(0.6, 3.0, 0.3), (3.1, 5.35, 0.27)], t=0.14, camber=0.03)
    win = Mesh().extend(winL).extend(mirror_y(winL))
    strut = cyl((0.6, 0.6, 0.15), (0.4, 2.6, 1.3), 0.045).extend(cyl((0.6, -0.6, 0.15), (0.4, -2.6, 1.3), 0.045))
    htL, hparts = wing_split([(-3.6, 0.1, 0.85, 1.05), (-3.8, 1.75, 0.85, 0.75)], [(0.1, 1.75, 0.42)], t=0.09, camber=0)
    htail = Mesh().extend(htL).extend(mirror_y(htL))
    vtail, vparts = wing_split([(-3.1, 0.9, 0, 1.6), (-4.2, 2.2, 0, 0.8)], [(0.95, 2.15, 0.42)], t=0.09, camber=0, vertical=True)
    cowl = loft([(3.55, 0, 0.35, 0.18, 0.18), (3.5, 0, 0.35, 0.26, 0.26)])
    spinner = loft([(3.95, 0, 0.35, 0.02, 0.02), (3.75, 0, 0.35, 0.13, 0.13), (3.56, 0, 0.35, 0.17, 0.17)])
    blade = Mesh()
    for k in range(2):
        a = math.pi * k
        c, s = math.cos(a), math.sin(a)
        b = box((0, 0, 0.48), (0.04, 0.15, 0.96))
        V = np.array(b.v); N = np.array(b.n)
        R = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
        blade.add(V @ R.T, N @ R.T, b.i)
    blade_v = np.array(blade.v) + [3.62, 0, 0.35]; blade = Mesh().add(blade_v, blade.n, blade.i)
    gear = Mesh()
    gear.extend(cyl((2.6, 0, 0.0), (2.6, 0, -0.75), 0.04)).extend(wheel((2.6, 0, -0.92), 0.19, 0.12))
    for sg in (1, -1):
        gear.extend(cyl((-0.2, 0.45 * sg, 0.05), (-0.35, 1.15 * sg, -0.75), 0.05)).extend(wheel((-0.35, 1.18 * sg, -0.92), 0.22, 0.14))
    lights_l = box((0.95, 5.55, 1.38), (0.12, 0.05, 0.05)); lights_r = box((0.95, -5.55, 1.38), (0.12, 0.05, 0.05))
    write_glb(os.path.join(OUT, 'trainer.glb'), [
        ('body', [(body, WHITE), (stripe, GOLD), (cabin_glass, GLASS), (win, WHITE), (strut, GREY), (htail, WHITE),
                  (vtail, GOLD), (cowl, BLACK), (spinner, GOLD), (lights_l, REDL), (lights_r, GRNL)], None),
        ('prop', [(blade, BLACK)], (3.62, 0, 0.35)),
        ('gear', [(gear, DARK)], None)] + surfaces('trainer', wparts, hparts, vparts, WHITE, WHITE, GOLD, ail=20, elev=25, rud=25, flap=30))
    write_anim('trainer')

# ================================================================ AIRLINER (twin-jet narrowbody)
def airliner():
    R = 1.98
    secs = [(18.6, 0, 0.3, 0.05, 0.05), (18.2, 0, 0.25, 0.75, 0.8), (17.0, 0, 0.3, 1.5, 1.6), (15.0, 0, 0.45, 1.95, 2.0),
            (12.0, 0, 0.5, R, 2.05), (-10.0, 0, 0.5, R, 2.05), (-14.0, 0, 0.95, 1.55, 1.6), (-17.5, 0, 1.6, 0.6, 0.75),
            (-19.0, 0, 1.9, 0.15, 0.25)]
    body = loft(secs, n=32)
    belly = loft([(15.2, 0, 0.2, 1.97, 1.95, 2.4), (-10.5, 0, 0.32, 1.99, 2.0, 2.4), (-14.2, 0, 0.8, 1.56, 1.5, 2.4)], n=32)
    # only keep belly (lower half) as cheatline colour band
    bv = np.array(belly.v); keep = bv[:, 2] < 0.0
    tri = np.array(belly.i).reshape(-1, 3); tri = tri[keep[tri].all(1)]
    belly = Mesh().add(bv, belly.n, tri.ravel().tolist())
    cheat = loft([(16.5, 0, 0.75, 1.92, 0.12, 4), (-12.5, 0, 0.9, 1.88, 0.12, 4)], n=32)
    windows = loft([(14.0, 0, 1.15, 1.985, 0.17, 6), (-9.5, 0, 1.15, 1.985, 0.17, 6)], n=32)
    wv = np.array(windows.v); keep = np.abs(wv[:, 1]) > 1.6
    tri = np.array(windows.i).reshape(-1, 3); tri = tri[keep[tri].all(1)]
    windows = Mesh().add(wv * [1, 1.005, 1], windows.n, tri.ravel().tolist())
    cockpit = loft([(17.3, 0, 1.0, 1.22, 0.38, 3), (16.4, 0, 1.35, 1.62, 0.34, 3)], n=24)
    cv = np.array(cockpit.v); keep = cv[:, 2] > 0.95
    tri = np.array(cockpit.i).reshape(-1, 3); tri = tri[keep[tri].all(1)]
    cockpit = Mesh().add(cv * [1, 1.01, 1.01], cockpit.n, tri.ravel().tolist())
    wst = [(4.5, 1.6, -0.9, 7.0), (0.5, 6.5, -0.45, 4.3), (-6.0, 17.0, 0.6, 1.5)]
    wL, wparts = wing_split(wst, [(2.0, 10.5, 0.25), (11.0, 15.8, 0.22)], t=0.12, camber=0.02)
    w = Mesh().extend(wL).extend(mirror_y(wL))
    # ground/flight spoilers: thin panels on top of the wing just ahead of the flaps, hinged at their front edge
    sp_parts = []
    for (y0, y1) in ((3.0, 6.0), (6.2, 10.2)):
        s0, s1 = _interp(wst, y0), _interp(wst, y1)
        h0 = (s0[0] - s0[3] * 0.6, y0, s0[2] + 0.05 * s0[3]); h1 = (s1[0] - s1[3] * 0.6, y1, s1[2] + 0.05 * s1[3])
        sp = wing([(h0[0], y0, h0[2], s0[3] * 0.15), (h1[0], y1, h1[2], s1[3] * 0.15)], t=0.08, camber=0, mirror=False)
        sp_parts.append((sp, h0, h1))
    lets = wing([(-5.8, 17.0, 0.6, 1.45), (-7.0, 17.3, 2.6, 0.7)], t=0.08, camber=0)
    htL, hparts = wing_split([(-14.0, 0.6, 1.9, 4.2), (-17.6, 6.2, 2.4, 1.6)], [(0.8, 6.0, 0.3)], t=0.1, camber=0)
    ht = Mesh().extend(htL).extend(mirror_y(htL))
    vt, vparts = wing_split([(-12.0, 2.3, 0, 5.8), (-17.8, 9.8, 0, 2.2)], [(2.6, 9.6, 0.3)], t=0.1, camber=0, vertical=True)
    eng = Mesh(); fan = Mesh(); pyl = Mesh()
    for sg in (1, -1):
        y = 5.75 * sg
        eng.extend(loft([(5.8, y, -1.65, 1.0, 1.0), (5.5, y, -1.65, 1.12, 1.12), (3.0, y, -1.7, 1.05, 1.05), (1.4, y, -1.75, 0.7, 0.7)], n=24))
        fan.extend(loft([(5.75, y, -1.65, 0.93, 0.93), (5.6, y, -1.65, 0.2, 0.2)], n=24))
        pyl.extend(wing([(4.6, y, 0, 3.6), (4.0, y, 0, 3.0)], t=0.25, camber=0, mirror=False, vertical=True) if False else box((3.2, y, -0.85), (3.6, 0.25, 0.9)))
    gear = Mesh()
    gear.extend(cyl((14.0, 0, -1.2), (14.0, 0, -3.25), 0.12)).extend(wheel((14.0, 0.2, -3.5), 0.36, 0.25)).extend(wheel((14.0, -0.2, -3.5), 0.36, 0.25))
    for sg in (1, -1):
        y = 3.8 * sg
        gear.extend(cyl((-1.2, y, -1.0), (-1.2, y, -3.0), 0.18))
        gear.extend(wheel((-1.2, y + 0.35, -3.3), 0.57, 0.38)).extend(wheel((-1.2, y - 0.35, -3.3), 0.57, 0.38))
    tailpaint, _ = wing_split([(-13.5, 4.5, 0, 5.0), (-17.8, 9.9, 0, 2.25)], [(4.5, 9.6, 0.3)], t=0.105, camber=0, vertical=True)
    write_glb(os.path.join(OUT, 'airliner.glb'), [
        ('body', [(body, WHITE), (belly, NAVY), (cheat, GOLD), (windows, BLACK), (cockpit, BLACK), (w, GREY), (lets, GOLD),
                  (ht, WHITE), (vt, NAVY), (tailpaint, GOLD), (eng, WHITE), (fan, DARK), (pyl, GREY),
                  (box((-6.1, 17.05, 0.65), (0.3, 0.1, 0.1)), REDL), (box((-6.1, -17.05, 0.65), (0.3, 0.1, 0.1)), GRNL)], None),
        ('gear', [(gear, DARK)], None)] + surfaces('airliner', wparts, hparts, vparts, GREY, WHITE, NAVY, ail=20, elev=25, rud=25, flap=35)
        + [hinge_node('airliner', f'spoiler{side}{k}', m if side == 'L' else mirror_y(m), GREY, h0 if side == 'L' else (h0[0], -h0[1], h0[2]),
                      h1 if side == 'L' else (h1[0], -h1[1], h1[2]), (0, 0, 1), 50, 'spoiler')
           for k, (m, h0, h1) in enumerate(sp_parts) for side in ('L', 'R')])
    write_anim('airliner')

# ================================================================ FIGHTER (single-engine multirole)
def fighter():
    body = loft([(8.6, 0, 0.1, 0.03, 0.03), (7.4, 0, 0.12, 0.32, 0.32), (5.5, 0, 0.18, 0.55, 0.55), (3.5, 0, 0.2, 0.75, 0.7, 2.6),
                 (0.0, 0, 0.15, 1.05, 0.68, 3), (-3.5, 0, 0.12, 0.95, 0.65, 3), (-5.8, 0, 0.12, 0.62, 0.6), (-6.4, 0, 0.12, 0.58, 0.58)], n=28)
    canopy = loft([(5.2, 0, 0.55, 0.05, 0.05), (4.6, 0, 0.6, 0.36, 0.3), (3.0, 0, 0.75, 0.48, 0.42), (1.0, 0, 0.62, 0.42, 0.3), (-0.4, 0, 0.45, 0.2, 0.15)], n=20)
    cv = np.array(canopy.v); keep = cv[:, 2] > 0.58
    tri = np.array(canopy.i).reshape(-1, 3); tri = tri[keep[tri].all(1)]
    canopy = Mesh().add(cv, canopy.n, tri.ravel().tolist())
    intake = Mesh()
    for sg in (1, -1):
        intake.extend(loft([(3.0, 0.95 * sg, -0.2, 0.28, 0.42, 3), (2.2, 0.95 * sg, -0.2, 0.33, 0.45, 3), (-1.5, 0.8 * sg, -0.1, 0.3, 0.4, 3)], n=16))
    wL, wparts = wing_split([(1.5, 0.9, 0.0, 6.2), (-3.2, 5.0, -0.05, 1.6)], [(1.0, 4.4, 0.24)], t=0.05, camber=0)
    w = Mesh().extend(wL).extend(mirror_y(wL))
    strake = wing([(4.5, 0.6, 0.15, 3.0), (1.6, 1.3, 0.05, 1.0)], t=0.04, camber=0)
    htL, hparts = wing_split([(-4.2, 0.6, 0.05, 2.6), (-6.4, 3.0, 0.05, 1.0)], [(0.6, 3.0, 0.62)], t=0.05, camber=0)
    ht = Mesh().extend(htL).extend(mirror_y(htL))
    vt, vparts = wing_split([(-2.6, 0.7, 0, 3.6), (-5.9, 3.6, 0, 1.3)], [(1.0, 3.4, 0.3)], t=0.05, camber=0, vertical=True)
    noz = loft([(-6.0, 0, 0.12, 0.56, 0.56), (-7.0, 0, 0.12, 0.48, 0.48)], n=24)
    burner = loft([(-6.95, 0, 0.12, 0.42, 0.42), (-8.5, 0, 0.12, 0.3, 0.3), (-10.0, 0, 0.12, 0.05, 0.05)], n=20)
    rails = cyl((0.2, 5.1, -0.05), (-3.2, 5.1, -0.05), 0.07).extend(cyl((0.2, -5.1, -0.05), (-3.2, -5.1, -0.05), 0.07))
    gear = Mesh()
    gear.extend(cyl((4.5, 0, -0.4), (4.5, 0, -1.55), 0.07)).extend(wheel((4.5, 0, -1.7), 0.24, 0.16))
    for sg in (1, -1):
        gear.extend(cyl((-1.0, 1.1 * sg, -0.4), (-1.0, 1.25 * sg, -1.5), 0.1)).extend(wheel((-1.0, 1.25 * sg, -1.66), 0.34, 0.22))
    write_glb(os.path.join(OUT, 'fighter.glb'), [
        ('body', [(body, CAMO), (canopy, {'c': (0.55, 0.45, 0.2), 'm': 0.95, 'r': 0.05, 'a': 0.8}), (intake, CAMO2),
                  (loft([(8.62, 0, 0.1, 0.03, 0.03), (7.4, 0, 0.12, 0.33, 0.33), (6.6, 0, 0.14, 0.45, 0.45)], n=28), RADOME),
                  (w, CAMO2), (strake, CAMO2), (ht, CAMO2), (vt, CAMO2), (noz, DARK), (rails, GREY),
                  (box((7.0, 0, 0.12), (1.2, 0.02, 0.02)), GOLD)], None),
        ('burner', [(burner, FLAME)], None),
        ('gear', [(gear, DARK)], None)] + surfaces('fighter', wparts, hparts, vparts, CAMO, CAMO, CAMO, ail=21, elev=20, rud=30, flap=20, flaperon=True))
    write_anim('fighter')

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    trainer(); airliner(); fighter()
