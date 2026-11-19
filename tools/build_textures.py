#!/usr/bin/env python3
"""
Wabash Vice — texture builder.

Combines CC0 photo-scanned materials from Poly Haven (https://polyhaven.com)
into the game's texture atlases:

  data/tex/facade_{d,n,r,e}.jpg      building atlas: colour, normal, roughness/metal, night windows
  data/tex/facade_lo_*.jpg           half-resolution versions for low/medium quality
  data/tex/road_{major,minor,plain,foot,rail}.jpg + asphalt/concrete normals
  data/tex/grass_{d,n}.jpg, ground_concrete_d.jpg, bark_{d,n}.jpg
  data/tex/foliage.png               leaf-cluster cards (RGBA) for trees

Usage: python3 tools/build_textures.py <dir with Poly Haven 1k jpgs> data/tex
(tools/fetch_textures.sh downloads the exact source files.)
"""
import sys, os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

SRC = sys.argv[1] if len(sys.argv) > 1 else "ph"
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/tex"
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(42)

def load(name, mode="RGB"):
    return Image.open(os.path.join(SRC, name + ".jpg")).convert(mode)

def tiled(img, size, scale):
    """Fill `size` (w,h) with img scaled to `scale` px per repeat."""
    w, h = size
    sw, sh = scale if isinstance(scale, tuple) else (scale, scale)
    t = img.resize((max(1, int(sw)), max(1, int(sh))), Image.LANCZOS)
    out = Image.new(img.mode, (w, h))
    for y in range(0, h, t.height):
        for x in range(0, w, t.width):
            out.paste(t, (x, y))
    return out

def tint(img, rgb, amount=1.0):
    a = np.asarray(img).astype(np.float32)
    a = a * np.array(rgb, np.float32)[None, None, :] ** amount
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def to_gray(img):
    return img.convert("L")

# ------------------------------------------------------------------ facade atlas
T = 1024                      # tile size (px) = 4 bays x 4 floors = 12.8 m x 13.6 m
COLS, ROWS = 4, 3
PXM = T / 12.8                # px per metre horizontally
D = Image.new("RGB", (T * COLS, T * ROWS), (128, 128, 128))
N = Image.new("RGB", (T * COLS, T * ROWS), (128, 128, 255))
R = Image.new("RGB", (T * COLS, T * ROWS), (0, 220, 0))   # G = roughness, B = metalness
E = Image.new("RGB", (T * COLS, T * ROWS), (0, 0, 0))
dD, dN, dR, dE = (ImageDraw.Draw(i) for i in (D, N, R, E))

def tile_origin(i):
    return (i % COLS) * T, (i // COLS) * T

def put_wall(i, diff, nor, rough, scale_m=2.0, rotate=False, color=None, rough_bias=0, gray=False):
    ox, oy = tile_origin(i)
    px = int(scale_m * PXM)
    d, n, r = load(diff), load(nor), load(rough, "L")
    if rotate:
        d, n, r = d.rotate(90, expand=True), n.rotate(90, expand=True), r.rotate(90, expand=True)
        na = np.asarray(n).copy()                 # rotate the normal vectors too: (x, y) -> (-y, x)
        na = np.stack([255 - na[..., 1], na[..., 0], na[..., 2]], -1)
        n = Image.fromarray(na.astype(np.uint8))
    if gray:
        d = ImageEnhance.Contrast(d.convert('L')).enhance(1.3).convert('RGB')
    if color:
        d = tint(d, color)
    D.paste(tiled(d, (T, T), px), (ox, oy))
    N.paste(tiled(n, (T, T), px), (ox, oy))
    rr = np.asarray(tiled(r, (T, T), px)).astype(np.float32) + rough_bias
    rgb = np.stack([np.zeros_like(rr), np.clip(rr, 0, 255), np.zeros_like(rr)], -1).astype(np.uint8)
    R.paste(Image.fromarray(rgb), (ox, oy))

def glass_fill(x0, y0, x1, y1, style="res", lit_p=0.35):
    """Glass with interior hints + reflection gradient; also normal (flat), rough (low) and emissive."""
    w, h = x1 - x0, y1 - y0
    g = np.zeros((h, w, 3), np.float32)
    yy = np.linspace(0, 1, h)[:, None]
    xx = np.linspace(0, 1, w)[None, :]
    base = np.array([18, 24, 30] if style != "office" else [30, 44, 58], np.float32)
    sky = np.array([120, 140, 160], np.float32)
    refl = (1 - yy) * 0.22 + 0.1 * np.clip(1 - np.abs(xx - yy * 0.6 - 0.2) * 3, 0, 1)
    g[:] = base * (1 - refl[..., None]) + sky * refl[..., None]
    curtain = rnd.random()
    if style == "res" and curtain < 0.22:          # curtains / blinds
        cc = np.array(rnd.choice([[150, 140, 122], [128, 120, 104], [110, 116, 124], [160, 154, 140]]), np.float32)
        cw = int(w * rnd.uniform(0.2, 0.45))
        g[:, :cw] = g[:, :cw] * 0.3 + cc * 0.7
        g[:, w - cw:] = g[:, w - cw:] * 0.3 + cc * 0.7
    elif style == "res" and curtain < 0.32:
        for k in range(0, h, 6):
            g[k:k + 3] = g[k:k + 3] * 0.65 + np.array([150, 146, 138]) * 0.35
    D.paste(Image.fromarray(np.clip(g, 0, 255).astype(np.uint8)), (x0, y0))
    dN.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(128, 128, 255))
    dR.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(0, 12, 90 if style == "office" else 25))
    if rnd.random() < lit_p:
        warm = rnd.random() < 0.75
        c = (255, rnd.randint(190, 225), rnd.randint(120, 170)) if warm else (190, 214, 255)
        k = rnd.uniform(0.5, 1.0)
        if style == "res" and curtain < 0.22:
            k *= 0.8
        dE.rectangle([x0, y0, x1 - 1, y1 - 1], fill=tuple(int(v * k) for v in c))

def window(x0, y0, w, h, frame=(235, 232, 225), recess=7, style="res", mull=True, sill=None, lit=0.35, arch=False):
    x1, y1 = x0 + w, y0 + h
    # reveal (recess) shading + normals
    dD.rectangle([x0 - recess, y0 - recess, x1 + recess, y1 + recess], fill=(70, 66, 62))
    dN.rectangle([x0 - recess, y0 - recess, x1 + recess, y0], fill=(128, 50, 205))   # top reveal faces down
    dN.rectangle([x0 - recess, y1, x1 + recess, y1 + recess], fill=(128, 206, 205))  # bottom faces up
    dN.rectangle([x0 - recess, y0, x0, y1], fill=(206, 128, 205))
    dN.rectangle([x1, y0, x1 + recess, y1], fill=(50, 128, 205))
    glass_fill(x0, y0, x1, y1, style, lit)
    # frame
    fw = 5
    for (a, b, c, d) in ([x0, y0, x1, y0 + fw], [x0, y1 - fw, x1, y1], [x0, y0, x0 + fw, y1], [x1 - fw, y0, x1, y1]):
        dD.rectangle([a, b, c, d], fill=frame); dR.rectangle([a, b, c, d], fill=(0, 140, 0)); dN.rectangle([a, b, c, d], fill=(128, 128, 255)); dE.rectangle([a, b, c, d], fill=(0, 0, 0))
    if mull:
        mx = x0 + w // 2
        dD.rectangle([mx - 2, y0, mx + 2, y1], fill=frame); dE.rectangle([mx - 2, y0, mx + 2, y1], fill=(0, 0, 0))
        my = y0 + int(h * 0.4)
        dD.rectangle([x0, my - 2, x1, my + 2], fill=frame); dE.rectangle([x0, my - 2, x1, my + 2], fill=(0, 0, 0))
    if sill:
        dD.rectangle([x0 - recess - 6, y1 + recess, x1 + recess + 6, y1 + recess + 12], fill=sill)
        dN.rectangle([x0 - recess - 6, y1 + recess, x1 + recess + 6, y1 + recess + 4], fill=(128, 225, 190))
        dD.rectangle([x0 - recess - 6, y1 + recess + 12, x1 + recess + 6, y1 + recess + 18], fill=(60, 56, 52))
    if arch:
        r = w // 2
        dD.pieslice([x0, y0 - r, x1, y0 + r], 180, 360, fill=sill or (200, 195, 185))
        dD.pieslice([x0 + 10, y0 - r + 10, x1 - 10, y0 + r - 10], 180, 360, fill=(40, 48, 56))

def band(i, y, h, color, nor_top=True):
    ox, oy = tile_origin(i)
    dD.rectangle([ox, oy + y, ox + T, oy + y + h], fill=color)
    dR.rectangle([ox, oy + y, ox + T, oy + y + h], fill=(0, 170, 0))
    dN.rectangle([ox, oy + y, ox + T, oy + y + 3], fill=(128, 215, 195) if nor_top else (128, 128, 255))
    dN.rectangle([ox, oy + y + 4, ox + T, oy + y + h], fill=(128, 128, 255))
    dD.rectangle([ox, oy + y + h, ox + T, oy + y + h + 6], fill=tuple(int(c * 0.55) for c in color))

def grime(i, strength=0.25):
    """Vertical streaks + darker ground level, baked ambient occlusion feel."""
    ox, oy = tile_origin(i)
    a = np.asarray(D.crop((ox, oy, ox + T, oy + T))).astype(np.float32)
    noise = np.random.default_rng(i).random((1, T // 8))
    streak = np.repeat(np.repeat(noise, 8, 1), T, 0)
    streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
    yy = np.linspace(0, 1, T)[:, None]
    shade = 1 - strength * (streak * 0.6 + 0.4) * (0.3 + 0.7 * yy ** 3) * 0.6
    a *= shade[..., None]
    D.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), (ox, oy))

FLOOR = T // 4   # 256 px per floor (3.4 m)
BAY = T // 4     # 256 px per bay (3.2 m)
rnd.seed(7)

# 0 — house: painted siding
put_wall(0, "beige_wall_001_diff", "beige_wall_001_nor_gl", "beige_wall_001_rough", 3.0, color=(1.28, 1.26, 1.22))
ox, oy = tile_origin(0)
for y in range(0, T, 14):                        # lap siding
    dD.line([ox, oy + y, ox + T, oy + y], fill=(150, 146, 138), width=2)
    dN.rectangle([ox, oy + y, ox + T, oy + y + 3], fill=(128, 70, 220))
for f in range(4):
    for b in range(4):
        if (b + f) % 3 == 2:
            continue
        x, y = ox + b * BAY + 70, oy + f * FLOOR + 60
        window(x, y, 116, 140, frame=(246, 245, 240), recess=4, sill=(240, 238, 232), lit=0.4)
        for sx in (x - 34, x + 116 + 10):             # shutters
            dD.rectangle([sx, y - 4, sx + 24, y + 144], fill=rnd.choice([(40, 52, 60), (30, 40, 34), (90, 30, 30), (34, 34, 36)]))
            for k in range(y, y + 140, 9): dD.line([sx + 2, k, sx + 22, k], fill=(20, 20, 20), width=1)
grime(0, 0.18)

# 1 — Purdue red brick with limestone
put_wall(1, "red_brick_diff", "red_brick_nor_gl", "red_brick_rough", 2.2)
for f in range(4):
    band(1, f * FLOOR + 228, 18, (214, 204, 182))
    for b in range(4):
        x, y = tile_origin(1)[0] + b * BAY + 58, tile_origin(1)[1] + f * FLOOR + 38
        window(x, y, 140, 172, frame=(226, 222, 210), recess=9, sill=(214, 204, 182), lit=0.33)
        dD.rectangle([x - 14, y - 22, x + 154, y - 9], fill=(214, 204, 182))            # lintel
grime(1, 0.22)

# 2 — glass office curtain wall
ox, oy = tile_origin(2)
for f in range(4):
    for k in range(8):
        x0, y0 = ox + k * 128, oy + f * FLOOR
        glass_fill(x0 + 6, y0 + 4, x0 + 124, y0 + 206, "office", 0.3)
        dD.rectangle([x0, y0, x0 + 6, y0 + FLOOR], fill=(150, 156, 162)); dR.rectangle([x0, y0, x0 + 6, y0 + FLOOR], fill=(0, 80, 200))
    dD.rectangle([ox, oy + f * FLOOR + 206, ox + T, oy + f * FLOOR + FLOOR], fill=(92, 100, 108))     # spandrel
    dR.rectangle([ox, oy + f * FLOOR + 206, ox + T, oy + f * FLOOR + FLOOR], fill=(0, 60, 160))
    dE.rectangle([ox, oy + f * FLOOR + 206, ox + T, oy + f * FLOOR + FLOOR], fill=(0, 0, 0))

# 3 — apartments / dorms: concrete + balconies
put_wall(3, "brushed_concrete_diff", "brushed_concrete_nor_gl", "brushed_concrete_rough", 3.0, color=(1.12, 1.06, 0.98))
for f in range(4):
    band(3, f * FLOOR + 200, 30, (176, 170, 160))
    for b in range(4):
        x, y = tile_origin(3)[0] + b * BAY + 34, tile_origin(3)[1] + f * FLOOR + 34
        window(x, y, 188, 150, frame=(60, 62, 64), recess=6, lit=0.42)
        dD.rectangle([x - 8, y + 118, x + 196, y + 124], fill=(40, 42, 44))       # railing
        for k in range(x - 8, x + 196, 12): dD.line([k, y + 124, k, y + 162], fill=(46, 48, 50), width=2)
grime(3, 0.2)

# 4 — industrial metal siding (vertical ribs)
put_wall(4, "box_profile_metal_sheet_diff", "box_profile_metal_sheet_nor_gl", "box_profile_metal_sheet_rough", 3.0, rotate=True, color=(1.05, 1.12, 1.2), gray=True)
ox, oy = tile_origin(4)
dR.rectangle([ox, oy, ox + T, oy + T], fill=(0, 120, 150))
for b in range(4):
    window(ox + b * BAY + 30, oy + 70, 196, 46, frame=(80, 82, 84), recess=3, mull=False, lit=0.2)
dD.rectangle([ox + 560, oy + 720, ox + 940, oy + T], fill=(120, 124, 128))                  # roller door
for k in range(oy + 720, oy + T, 14): dD.line([ox + 560, k, ox + 940, k], fill=(90, 92, 96), width=3)
grime(4, 0.25)

# 5 — stucco commercial
put_wall(5, "grey_plaster_diff", "grey_plaster_nor_gl", "grey_plaster_rough", 3.0, color=(1.25, 1.17, 1.02))
for f in range(4):
    for b in range(4):
        x, y = tile_origin(5)[0] + b * BAY + 40, tile_origin(5)[1] + f * FLOOR + 50
        window(x, y, 176, 150, frame=(40, 40, 42), recess=6, mull=False, lit=0.3)
    band(5, f * FLOOR + 236, 14, (200, 190, 170))
grime(5, 0.2)

# 6 — flat roof (bitumen + gravel)
put_wall(6, "bitumen_diff", "bitumen_nor_gl", "bitumen_rough", 4.0, color=(1.2, 1.18, 1.15))
ox, oy = tile_origin(6)
for _ in range(2):
    x, y = ox + rnd.randint(40, 860), oy + rnd.randint(40, 860)
    dD.rectangle([x, y, x + 90, y + 64], fill=(112, 114, 114)); dD.rectangle([x, y + 64, x + 90, y + 74], fill=(40, 40, 40))
    dN.rectangle([x, y, x + 110, y + 6], fill=(128, 215, 200))

# 7 — asphalt shingles
ox, oy = tile_origin(7)
base = tiled(load("bitumen_diff"), (T, T), 200)
D.paste(tint(base, (0.75, 0.72, 0.7)), (ox, oy))
for y in range(0, T, 22):
    off = (y // 22) % 2 * 24
    for x in range(-48 + off, T, 48):
        v = rnd.randint(-14, 14)
        dD.rectangle([ox + x + 1, oy + y + 1, ox + x + 46, oy + y + 20], outline=(30 + v, 29 + v, 28 + v))
    dN.rectangle([ox, oy + y + 19, ox + T, oy + y + 22], fill=(128, 60, 215))
dR.rectangle([ox, oy, ox + T, oy + T], fill=(0, 225, 0))

# 8 — historic tan brick (downtown Lafayette storefronts)
put_wall(8, "brick_wall_02_diff", "brick_wall_02_nor_gl", "brick_wall_02_rough", 2.4)
for f in range(4):
    band(8, f * FLOOR + 240, 14, (190, 176, 150))
    for b in range(4):
        x, y = tile_origin(8)[0] + b * BAY + 68, tile_origin(8)[1] + f * FLOOR + 70
        window(x, y, 120, 160, frame=(70, 40, 30), recess=8, sill=(190, 176, 150), lit=0.35, arch=True)
grime(8, 0.25)

# 9 — parking garage: open concrete decks
put_wall(9, "concrete_floor_01_diff", "concrete_floor_01_nor_gl", "concrete_floor_01_rough", 4.0, color=(1.15, 1.12, 1.08))
ox, oy = tile_origin(9)
for f in range(4):
    y0 = oy + f * FLOOR + 70
    dD.rectangle([ox, y0, ox + T, y0 + 130], fill=(26, 27, 28)); dE.rectangle([ox, y0, ox + T, y0 + 130], fill=(36, 34, 28))
    dN.rectangle([ox, y0 - 6, ox + T, y0], fill=(128, 50, 205))
    for b in range(4): dD.rectangle([ox + b * BAY, y0, ox + b * BAY + 22, y0 + 130], fill=(150, 148, 144))
grime(9, 0.3)

# 10 — modern concrete with ribbon windows
put_wall(10, "concrete_floor_01_diff", "concrete_floor_01_nor_gl", "concrete_floor_01_rough", 3.0, color=(1.3, 1.28, 1.25))
ox, oy = tile_origin(10)
for f in range(4):
    for k in range(4):
        glass_fill(ox + k * 256 + 8, oy + f * FLOOR + 60, ox + k * 256 + 248, oy + f * FLOOR + 190, "office", 0.3)
grime(10, 0.15)

# 11 — limestone (churches, civic): tall arched windows
put_wall(11, "grey_plaster_diff", "grey_plaster_nor_gl", "grey_plaster_rough", 2.0, color=(1.42, 1.36, 1.22))
ox, oy = tile_origin(11)
for y in range(0, T, 64): dD.line([ox, oy + y, ox + T, oy + y], fill=(170, 160, 140), width=2)
for b in range(4):
    window(ox + b * BAY + 80, oy + 260, 96, 560, frame=(90, 80, 70), recess=10, sill=(200, 190, 170), lit=0.25, arch=True)
grime(11, 0.18)

def save_atlas(prefix, scale):
    size = (int(T * COLS * scale), int(T * ROWS * scale))
    for img, k, q in ((D, "d", 88), (N, "n", 90), (R, "r", 88), (E, "e", 85)):
        img.resize(size, Image.LANCZOS).save(os.path.join(OUT, f"{prefix}_{k}.jpg"), quality=q, optimize=True)
save_atlas("facade", 1.0)
save_atlas("facade_lo", 0.5)

# ------------------------------------------------------------------ roads
asp = load("asphalt_02_diff")
asp = ImageEnhance.Brightness(asp).enhance(0.92)
def road(kind, width_m, out):
    W, H = 512, 1024                       # 12 m along the road
    pxm_v = H / 12.0
    pxm_u = W / width_m
    if kind == "foot":
        base = tiled(load("concrete_pavement_diff"), (W, H), (int(pxm_u * 2.4), int(pxm_v * 2.4)))
    elif kind == "rail":
        base = tiled(load("bitumen_diff"), (W, H), (int(pxm_u * 3), int(pxm_v * 3)))
        base = tint(base, (0.9, 0.85, 0.78))
    else:
        base = tiled(asp, (W, H), (int(pxm_u * 4), int(pxm_v * 4)))
    d = ImageDraw.Draw(base)
    if kind == "rail":
        for y in range(0, H, 52): d.rectangle([60, y, W - 60, y + 22], fill=(78, 60, 44))
        for x in (150, 350): d.rectangle([x, 0, x + 18, H], fill=(150, 152, 156)); d.rectangle([x + 4, 0, x + 14, H], fill=(196, 198, 202))
    elif kind != "foot":
        # tyre tracks & oil stains
        a = np.asarray(base).astype(np.float32)
        u = np.linspace(0, width_m, W)[None, :]
        lanes = [width_m * 0.25, width_m * 0.75] if kind != "plain" else [width_m * 0.5]
        darken = np.zeros_like(u)
        for c in lanes:
            for s in (-0.9, 0.9):
                darken += np.exp(-((u - c - s) ** 2) / 0.12) * 0.16
        a *= (1 - darken)[..., None]
        base = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(base)
        paint = (226, 222, 210)
        ew = max(4, int(0.12 * pxm_u))
        d.rectangle([int(0.25 * pxm_u), 0, int(0.25 * pxm_u) + ew, H], fill=paint)
        d.rectangle([W - int(0.25 * pxm_u) - ew, 0, W - int(0.25 * pxm_u), H], fill=paint)
        if kind == "major":
            yw = (226, 176, 40)
            d.rectangle([W // 2 - ew - 3, 0, W // 2 - 3, H], fill=yw)
            d.rectangle([W // 2 + 3, 0, W // 2 + 3 + ew, H], fill=yw)
            for x in (W // 4, 3 * W // 4):
                for y in range(0, H, int(pxm_v * 12)):
                    d.rectangle([x - ew // 2, y, x + ew // 2, y + int(pxm_v * 3)], fill=paint)
        elif kind == "minor":
            for y in range(0, H, int(pxm_v * 6)):
                d.rectangle([W // 2 - ew // 2, y, W // 2 + ew // 2, y + int(pxm_v * 3)], fill=(226, 176, 40))
        # worn paint
        a = np.asarray(base).astype(np.float32)
        wear = np.asarray(tiled(load("concrete_floor_01_diff", "L"), (W, H), 300)).astype(np.float32) / 255
        a = a * (0.85 + 0.15 * wear[..., None])
        base = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    base.save(os.path.join(OUT, out), quality=88, optimize=True)
road("major", 11, "road_major.jpg")
road("minor", 7.5, "road_minor.jpg")
road("plain", 4.5, "road_plain.jpg")
road("foot", 2.4, "road_foot.jpg")
road("rail", 3.2, "road_rail.jpg")
load("asphalt_02_nor_gl").resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "asphalt_n.jpg"), quality=90)
load("concrete_pavement_nor_gl").resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "concrete_n.jpg"), quality=90)

# ------------------------------------------------------------------ ground
g = load("leafy_grass_diff")
a = np.asarray(g).astype(np.float32)
a = a * np.array([0.82, 1.12, 0.7])          # greener, Indiana lawn
a = (a - a.mean(axis=(0, 1))) * 1.15 + a.mean(axis=(0, 1))
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(OUT, "grass_d.jpg"), quality=88)
load("leafy_grass_nor_gl").save(os.path.join(OUT, "grass_n.jpg"), quality=88)
load("concrete_floor_01_diff").resize((512, 512)).save(os.path.join(OUT, "ground_concrete_d.jpg"), quality=86)
load("bark_brown_02_diff").resize((512, 512)).save(os.path.join(OUT, "bark_d.jpg"), quality=86)
load("bark_brown_02_nor_gl").resize((512, 512)).save(os.path.join(OUT, "bark_n.jpg"), quality=88)

# ------------------------------------------------------------------ foliage cards
leaf_d = load("tree_leaves_diff")
leaf_a = Image.open(os.path.join(SRC, "tree_leaves_alpha.jpg")).convert("L")
# cut individual leaves out of the photo sheet
mask = np.asarray(leaf_a) > 128
from scipy import ndimage
lab, nlab = ndimage.label(mask)
leaves = []
for sl in ndimage.find_objects(lab):
    h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    if h * w < 4000:
        continue
    box = (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)
    rgba = leaf_d.crop(box).convert("RGBA")
    rgba.putalpha(leaf_a.crop(box))
    leaves.append(rgba)
print("leaves cut:", len(leaves))

def cluster(size, tint_rgb, seed, count=330):
    r = random.Random(seed)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # twigs
    dr = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2
    for _ in range(9):
        a = r.uniform(0, 6.28); L = r.uniform(0.15, 0.3) * size
        dr.line([cx, cy, cx + math.cos(a) * L, cy + math.sin(a) * L], fill=(70, 52, 36, 255), width=3)
    for _ in range(count):
        lf = r.choice(leaves)
        s = r.uniform(0.08, 0.13) * size / max(lf.size)
        lf2 = lf.resize((max(2, int(lf.width * s)), max(2, int(lf.height * s))), Image.LANCZOS).rotate(r.uniform(0, 360), expand=True, resample=Image.BICUBIC)
        a = r.uniform(0, 6.28); rr = (r.random() ** 0.75) * size * 0.4
        x = int(cx + math.cos(a) * rr - lf2.width / 2); y = int(cy + math.sin(a) * rr - lf2.height / 2)
        shade = r.uniform(0.6, 1.1) * (0.8 + 0.25 * (1 - rr / (size * 0.4)))
        arr = np.asarray(lf2).astype(np.float32)
        arr[..., :3] *= np.array(tint_rgb) * shade
        img.alpha_composite(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)), (max(0, x), max(0, y)))
    return img

F = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
F.paste(cluster(512, (0.95, 1.05, 0.8), 1), (0, 0))        # summer green
F.paste(cluster(512, (0.8, 0.95, 0.65), 2), (512, 0))      # deep green
F.paste(cluster(512, (1.45, 1.1, 0.35), 3), (0, 512))      # autumn gold
F.paste(cluster(512, (1.55, 0.72, 0.3), 4), (512, 512))    # autumn orange/red
# bleed colour into transparent pixels so mipmaps don't get dark halos
arr = np.asarray(F).astype(np.float32)
rgb, al = arr[..., :3], arr[..., 3:] / 255
blur_rgb = np.asarray(Image.fromarray(np.clip(rgb * al, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)
blur_a = np.asarray(Image.fromarray((al[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)[..., None] / 255
fill = blur_rgb / np.maximum(blur_a, 1e-3)
rgb = np.where(al > 0.5, rgb, fill)
Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), arr[..., 3:]], -1).astype(np.uint8)).save(os.path.join(OUT, "foliage.png"), optimize=True)

for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")
