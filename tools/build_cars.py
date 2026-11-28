#!/usr/bin/env python3
"""Car models for driving mode: python3 tools/build_cars.py models
Each car: body, cabin glass, lights, and four wheel nodes (wheelFL, wheelFR, wheelRL, wheelRR) placed at the
wheel centres so the game can spin and steer them. Origin: middle of the wheelbase, on the ground.
Body frame: x forward, y left, z up (metres)."""
import math, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import build_models as B
from build_models import Mesh, loft, box, cyl, write_glb

OUT = sys.argv[1] if len(sys.argv) > 1 else 'models'
B.OUT = OUT

TYRE = {'c': (0.035, 0.035, 0.04), 'm': 0.0, 'r': 0.92}
RIM = {'c': (0.75, 0.76, 0.78), 'm': 0.9, 'r': 0.25}
RIMDARK = {'c': (0.12, 0.12, 0.13), 'm': 0.8, 'r': 0.3}
GLASS = {'c': (0.05, 0.08, 0.11), 'm': 0.9, 'r': 0.05}
TRIM = {'c': (0.05, 0.05, 0.055), 'm': 0.2, 'r': 0.6}
CHROME = {'c': (0.85, 0.86, 0.88), 'm': 1.0, 'r': 0.15}
HEAD = {'c': (1, 0.97, 0.85), 'e': (1, 0.95, 0.8)}
TAIL = {'c': (0.9, 0.05, 0.05), 'e': (0.75, 0.02, 0.02)}
BLUEL = {'c': (0.1, 0.3, 1), 'e': (0.1, 0.3, 1)}
REDL = {'c': (1, 0.1, 0.1), 'e': (1, 0.1, 0.1)}
PLATE = {'c': (0.92, 0.92, 0.86), 'm': 0, 'r': 0.6}

def paint(rgb, metal=0.35, rough=0.28): return {'c': rgb, 'm': metal, 'r': rough}

def wheel_mesh(r, w, rim_mat_dark=False):
    """tyre + rim, centred on the origin, axle along y"""
    tyre = cyl((0, w / 2, 0), (0, -w / 2, 0), r, n=22)
    rim = Mesh()
    for sg in (1, -1):
        rim.extend(cyl((0, sg * (w / 2 + 0.006), 0), (0, sg * (w / 2 - 0.03), 0), r * 0.68, n=20))       # rim disc
        rim.extend(cyl((0, sg * (w / 2 + 0.02), 0), (0, sg * (w / 2 + 0.004), 0), r * 0.2, r * 0.16, n=12))  # hub
    return tyre, rim

def body_sections(L, W, clear, belt, nose_h, tail_h, n=14, sq=4.5):
    """lower body from the rear bumper to the front bumper; heights fall off toward the ends"""
    secs = []
    for k in range(n + 1):
        t = k / n                       # 0 rear .. 1 front
        x = -L / 2 + t * L
        top = belt
        if t > 0.62: top = belt - (belt - nose_h) * ((t - 0.62) / 0.38) ** 1.6        # bonnet slopes down
        if t < 0.12: top = tail_h + (belt - tail_h) * (t / 0.12) ** 0.6             # boot lip
        bot = clear + (0.08 if t < 0.04 or t > 0.96 else 0)
        end = min(t, 1 - t)
        hw = W / 2 * (0.9 + 0.1 * min(1, end / 0.08))                               # rounded corners in plan
        if end < 0.012: hw *= 0.94
        secs.append((x, 0, (top + bot) / 2, hw, max(0.05, (top - bot) / 2), sq))
    return secs

def car(name, L, W, H, wb, track, wr, clear, belt, nose_h, tail_h, cab_rear, cab_front, roof_rear, roof_front, color,
        rim_dark=False, extras=None, sq=4.5, wheel_w=0.24):
    parts = []
    parts.append((loft(body_sections(L, W, clear, belt, nose_h, tail_h, sq=sq), n=28), color))
    # cabin: glass greenhouse plus a painted roof
    cw = W / 2 * 0.86
    cab = [(cab_rear, 0, belt + 0.02, cw, 0.03, 4),
           (roof_rear, 0, (belt + H) / 2, cw * 0.93, (H - belt) / 2, 5),
           (roof_front, 0, (belt + H) / 2, cw * 0.93, (H - belt) / 2, 5),
           (cab_front, 0, belt + 0.02, cw, 0.03, 4)]
    # make the cabin loft follow the windscreen/back-window rake: interpolate heights along x
    secs = []
    for k in range(9):
        t = k / 8
        x = cab_rear + t * (cab_front - cab_rear)
        if x < roof_rear: h = belt + (H - belt) * (x - cab_rear) / max(0.01, roof_rear - cab_rear)
        elif x > roof_front: h = belt + (H - belt) * (cab_front - x) / max(0.01, cab_front - roof_front)
        else: h = H
        h = max(belt + 0.04, h)
        secs.append((x, 0, (belt + h) / 2 - 0.01, cw * (0.92 + 0.08 * (h - belt) / (H - belt) if H > belt else 1) * (1 - 0.06 * (h - belt) / max(0.01, H - belt)), (h - belt) / 2 + 0.01, 6))
    parts.append((loft(secs, n=24), GLASS))
    rl = roof_front - roof_rear
    parts.append((loft([(roof_rear + 0.04, 0, H + 0.005, cw * 0.8, 0.025, 6), (roof_rear + rl * 0.1, 0, H + 0.015, cw * 0.82, 0.03, 6),
                        (roof_front - rl * 0.1, 0, H + 0.015, cw * 0.82, 0.03, 6), (roof_front - 0.04, 0, H + 0.005, cw * 0.8, 0.025, 6)], n=20), color))
    # pillars (B pillar each side)
    for sg in (1, -1):
        parts.append((box(((roof_rear + roof_front) / 2, sg * cw * 0.9, (belt + H) / 2), (0.09, 0.04, H - belt)), TRIM))
    # lights, grille, bumpers, mirrors, plates
    fx, rx = L / 2, -L / 2
    for sg in (1, -1):
        parts.append((box((fx - 0.05, sg * W * 0.34, nose_h - 0.09), (0.08, W * 0.2, 0.09)), HEAD))
        parts.append((box((rx + 0.04, sg * W * 0.36, tail_h - 0.08), (0.07, W * 0.18, 0.08)), TAIL))
        parts.append((box((cab_front - 0.05, sg * (W / 2 - 0.02), belt + 0.08), (0.14, 0.16, 0.09)), color))
    parts.append((box((fx - 0.03, 0, clear + 0.22), (0.08, W * 0.42, 0.14)), TRIM))
    parts.append((box((fx + 0.0, 0, clear + 0.08), (0.1, W * 0.92, 0.1)), TRIM))
    parts.append((box((rx - 0.0, 0, clear + 0.08), (0.1, W * 0.92, 0.1)), TRIM))
    parts.append((box((rx - 0.02, 0, clear + 0.25), (0.03, 0.52, 0.12)), PLATE))
    parts.append((box((fx + 0.03, 0, clear + 0.1), (0.03, 0.52, 0.12)), PLATE))
    # dark wheel arches (so the wheels read clearly)
    for x in (wb / 2, -wb / 2):
        for sg in (1, -1):
            parts.append((cyl((x, sg * (W / 2 - 0.02), wr), (x, sg * (W / 2 - 0.3), wr), wr * 1.12, n=18), TRIM))
    if extras: parts += extras(L, W, H, belt)
    nodes = [('body', parts, None)]
    tyre, rim = wheel_mesh(wr, wheel_w)
    for nm, x, sg in (('wheelFL', wb / 2, 1), ('wheelFR', wb / 2, -1), ('wheelRL', -wb / 2, 1), ('wheelRR', -wb / 2, -1)):
        c = (x, sg * track / 2, wr)
        tm = Mesh().add([(v[0] + c[0], v[1] + c[1], v[2] + c[2]) for v in tyre.v], tyre.n, tyre.i)
        rm = Mesh().add([(v[0] + c[0], v[1] + c[1], v[2] + c[2]) for v in rim.v], rim.n, rim.i)
        nodes.append((nm, [(tm, TYRE), (rm, RIMDARK if rim_dark else RIM)], c))
    write_glb(os.path.join(OUT, f'car-{name}.glb'), nodes)

def lightbar(L, W, H, belt):
    return [(box((-0.1, 0.25, H + 0.09), (0.25, 0.42, 0.1)), REDL), (box((-0.1, -0.25, H + 0.09), (0.25, 0.42, 0.1)), BLUEL),
            (box((-0.1, 0, H + 0.04), (0.3, 1.1, 0.04)), TRIM)]
def taxisign(L, W, H, belt):
    return [(box((-0.1, 0, H + 0.1), (0.3, 0.7, 0.16)), {'c': (1, 0.95, 0.7), 'e': (0.9, 0.8, 0.4)})]
def stripes(L, W, H, belt):
    k = {'c': (0.03, 0.03, 0.03), 'm': 0.3, 'r': 0.3}
    return [(box((L * 0.2, sg * 0.16, belt + 0.005 - (belt - 0.78) * 0.5), (L * 0.55, 0.14, 0.02)), k) for sg in (1, -1)]
def doors_white(L, W, H, belt):
    wht = {'c': (0.95, 0.95, 0.95), 'm': 0.2, 'r': 0.3}
    return [(box((0.1, sg * (W / 2 - 0.005), (belt + 0.3) / 2 + 0.05), (2.1, 0.03, belt - 0.4)), wht) for sg in (1, -1)]
def pickup_bed(L, W, H, belt):
    p = paint((0.92, 0.92, 0.93))
    out = []
    for sg in (1, -1): out.append((box((-L / 2 + 0.95, sg * (W / 2 - 0.05), belt + 0.12), (1.8, 0.08, 0.26)), p))
    out.append((box((-L / 2 + 0.06, 0, belt + 0.12), (0.08, W - 0.05, 0.26)), p))
    out.append((box((-L / 2 + 0.95, 0, belt - 0.02), (1.85, W - 0.12, 0.04)), TRIM))
    return out

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    #   name       L     W     H     wb    track wr    clear belt  nose  tail  cab_r cab_f roof_r roof_f colour
    car('sports', 4.55, 1.98, 1.12, 2.70, 1.70, 0.34, 0.11, 0.70, 0.52, 0.66, -1.45, 0.85, -0.62, -0.05, paint((0.78, 0.04, 0.05), 0.5, 0.2), rim_dark=True, sq=5, wheel_w=0.28)
    car('muscle', 4.85, 1.92, 1.32, 2.78, 1.62, 0.35, 0.13, 0.86, 0.80, 0.84, -1.05, 0.55, -0.6, 0.0, paint((0.95, 0.68, 0.05)), extras=stripes, sq=6, wheel_w=0.27)
    car('suv', 4.85, 1.98, 1.78, 2.90, 1.68, 0.40, 0.22, 1.05, 0.95, 1.0, -2.1, 0.75, -1.95, 0.3, paint((0.07, 0.12, 0.26)), sq=7)
    car('pickup', 5.6, 2.0, 1.88, 3.50, 1.72, 0.42, 0.24, 1.08, 1.0, 1.06, -0.75, 1.0, -0.6, 0.55, paint((0.92, 0.92, 0.93), 0.2), extras=pickup_bed, sq=8)
    car('police', 4.95, 1.88, 1.46, 2.85, 1.6, 0.34, 0.15, 0.9, 0.78, 0.88, -1.15, 0.85, -0.65, 0.3, paint((0.04, 0.04, 0.05)), extras=lambda *a: doors_white(*a) + lightbar(*a), sq=5.5)
    car('taxi', 4.9, 1.86, 1.48, 2.82, 1.58, 0.33, 0.15, 0.9, 0.78, 0.86, -1.2, 0.85, -0.7, 0.3, paint((1.0, 0.78, 0.05), 0.2), extras=taxisign, sq=5.5)
