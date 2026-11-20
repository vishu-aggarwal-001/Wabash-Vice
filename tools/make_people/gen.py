# Blender (background) script: builds Wabash Vice's people with MPFB2 / MakeHuman CC0 assets
# and exports each as a GLB with a Mixamo-named skeleton.
#   blender -b --factory-startup --python gen.py -- <outdir> [name ...]
import bpy, sys, os, importlib

bpy.ops.preferences.addon_enable(module='bl_ext.user_default.mpfb')
M = lambda mod, k: getattr(importlib.import_module('bl_ext.user_default.mpfb.services.' + mod), k)
HumanService = M('humanservice', 'HumanService')
AssetService = M('assetservice', 'AssetService')
ExportService = M('exportservice', 'ExportService')
ObjectService = M('objectservice', 'ObjectService')
TargetService = M('targetservice', 'TargetService')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/mhout'
ONLY = set(argv[1:])
os.makedirs(OUT, exist_ok=True)

# Each person: sex, skin, hair (or None = bald), brows, clothes, body macros, optional
# recolours, and a random seed that sculpts a unique face (head shape, jaw, chin, nose,
# cheeks, brow, ears, mouth, neck).
S = lambda **k: k
PEOPLE = {
    # --- men
    'player':       S(sex='m', skin='young_caucasian_male', hair='short02', brows='eyebrow001', clothes=['male_casualsuit05', 'toigo_ankle_boots_male'], age=0.55, weight=0.55, muscle=0.65, height=0.62, seed=11),
    'm_leather':    S(sex='m', skin='jartur69_middleage_slavic_male_with_genitals_and_beard', hair=None, brows='eyebrow003', clothes=['male_casualsuit05', 'toigo_ankle_boots_male'], recolor={'male_casualsuit05': 'leather'}, age=0.7, weight=0.7, muscle=0.7, height=0.58, seed=21),
    'm_tracksuit':  S(sex='m', skin='young_caucasian_male2', hair=None, brows='eyebrow002', clothes=['elvs_hooded_sweat_jacket1', 'cortu_cargo_pants', 'culturalibre_sneakers'], recolor={'elvs_hooded_sweat_jacket1': 'royal', 'cortu_cargo_pants': 'royal'}, age=0.5, weight=0.6, muscle=0.6, height=0.55, seed=31),
    'm_hoodie':     S(sex='m', skin='young_caucasian_male', hair='short04', brows='eyebrow002', clothes=['elvs_hooded_sweat_jacket1', 'cortu_cargo_pants', 'culturalibre_sneakers', 'elvs_male_flat_cap1'], age=0.42, weight=0.45, muscle=0.5, height=0.5, seed=41),
    'm_sweater':    S(sex='m', skin='middleage_caucasian_male', hair='short01', brows='eyebrow003', clothes=['mindfront_knitted_sweater_01', 'toigo_wool_pants', 'toigo_ankle_boots_male'], age=0.72, weight=0.68, muscle=0.5, height=0.5, seed=51),
    'm_denim':      S(sex='m', skin='young_african_male', hair='short04', brows='eyebrow004', clothes=['male_casualsuit01', 'punkduck_comfortable_sneakers'], age=0.5, weight=0.5, muscle=0.62, height=0.62, seed=61),
    'm_old':        S(sex='m', skin='old_caucasian_male', hair='short03', brows='eyebrow005', clothes=['toigo_fisherman_sweater', 'toigo_wool_pants', 'toigo_ankle_boots_male', 'rehmanpolanski_moustache_viking'], age=0.97, weight=0.6, muscle=0.4, height=0.45, seed=71),
    'm_asian':      S(sex='m', skin='young_asian_male', hair='short02', brows='eyebrow006', clothes=['male_casualsuit03', 'culturalibre_sneakers'], age=0.45, weight=0.45, muscle=0.5, height=0.45, seed=81),
    'm_worker':     S(sex='m', skin='mindfront_skin_male_african_middleage', hair=None, brows='eyebrow007', clothes=['male_worksuit01', 'toigo_ankle_boots_male', 'mindfront_knitted_hat_01'], age=0.68, weight=0.65, muscle=0.7, height=0.6, seed=91),
    'm_viking':     S(sex='m', skin='middleage_caucasian_male', hair='short03', brows='eyebrow001', clothes=['mindfront_knitted_sweater_02', 'cortu_cargo_pants', 'toigo_ankle_boots_male', 'wdg_scruffy_beard'], age=0.62, weight=0.62, muscle=0.62, height=0.66, seed=101),
    'm_ginger':     S(sex='m', skin='toigo_light_skin_male_freckles', hair='short04', brows='eyebrow002', clothes=['namuhekam_male_polo_shirt', 'cortu_cargo_pants', 'punkduck_comfortable_sneakers'], age=0.4, weight=0.42, muscle=0.45, height=0.55, seed=111),
    'm_tattoo':     S(sex='m', skin='ken1138_caucasian_male_tattooed_skin', hair=None, brows='eyebrow004', clothes=['male_casualsuit06', 'toigo_ankle_boots_male'], age=0.55, weight=0.6, muscle=0.8, height=0.6, seed=121),
    'm_business':   S(sex='m', skin='middleage_asian_male', hair='short01', brows='eyebrow006', clothes=['toigo_male_suit_tie_and_jacket', 'mindfront_shoes_oxford_male'], age=0.66, weight=0.55, muscle=0.45, height=0.5, seed=131),
    # --- police (light blue shirt + tie; the cap is added in-game)
    'cop':          S(sex='m', skin='middleage_caucasian_male', hair='short01', brows='eyebrow002', clothes=['elvs_male_shirt_tie_tucked1', 'toigo_wool_pants', 'toigo_ankle_boots_male'], age=0.6, weight=0.62, muscle=0.65, height=0.6, seed=141),
    'cop2':         S(sex='m', skin='young_african_male', hair='short04', brows='eyebrow004', clothes=['elvs_male_shirt_tie_tucked1', 'toigo_wool_pants', 'toigo_ankle_boots_male'], age=0.48, weight=0.55, muscle=0.7, height=0.66, seed=151),
    'cop3':         S(sex='m', skin='jartur69_middleage_slavic_male_with_genitals_and_beard', hair='short01', brows='eyebrow003', clothes=['elvs_male_shirt_tie_tucked1', 'toigo_wool_pants', 'toigo_ankle_boots_male'], age=0.7, weight=0.75, muscle=0.55, height=0.55, seed=161),
    # --- women
    'f_casual':     S(sex='f', skin='young_caucasian_female', hair='ponytail01', brows='eyebrow009', clothes=['female_casualsuit01', 'punkduck_comfortable_sneakers'], age=0.45, weight=0.5, muscle=0.5, height=0.5, seed=171),
    'f_sweater':    S(sex='f', skin='middleage_african_female', hair='afro01', brows='eyebrow008', clothes=['mindfront_knitted_sweater_02', 'toigo_wool_pants', 'toigo_ankle_boots_female'], age=0.6, weight=0.55, muscle=0.45, height=0.45, seed=181),
    'f_asian':      S(sex='f', skin='young_asian_female', hair='bob01', brows='eyebrow009', clothes=['toigo_fisherman_sweater', 'cortu_cargo_pants', 'culturalibre_sneakers'], age=0.45, weight=0.45, muscle=0.45, height=0.4, seed=191),
    'f_cardigan':   S(sex='f', skin='middleage_caucasian_female', hair='long01', brows='eyebrow008', clothes=['mindfront_cardigan_long_open_front', 'toigo_wool_pants', 'toigo_ankle_boots_female', 'punkduck_handbag01'], age=0.7, weight=0.58, muscle=0.45, height=0.5, seed=201),
    'f_sport':      S(sex='f', skin='toigo_light_skin_female_freckles', hair='ponytail01', brows='eyebrow009', clothes=['female_sportsuit01', 'punkduck_comfortable_sneakers'], age=0.42, weight=0.42, muscle=0.6, height=0.55, seed=211),
    'f_old':        S(sex='f', skin='old_caucasian_female', hair='bob02', brows='eyebrow008', clothes=['janexx_old_female_sweater', 'toigo_wool_pants', 'toigo_ankle_boots_female'], age=0.95, weight=0.62, muscle=0.35, height=0.4, seed=221),
}

TARGET_DIR = os.path.join(os.path.dirname(importlib.import_module('bl_ext.user_default.mpfb').__file__), 'data', 'targets')
FACE_PAIRS = [
    ('head', 'head-fat-decr', 'head-fat-incr'), ('head', 'head-scale-horiz-decr', 'head-scale-horiz-incr'), ('head', 'head-scale-vert-decr', 'head-scale-vert-incr'),
    ('chin', 'chin-width-decr', 'chin-width-incr'), ('chin', 'chin-prominent-decr', 'chin-prominent-incr'), ('chin', 'chin-height-decr', 'chin-height-incr'), ('chin', 'chin-jaw-drop-decr', 'chin-jaw-drop-incr'),
    ('nose', 'nose-scale-horiz-decr', 'nose-scale-horiz-incr'), ('nose', 'nose-scale-vert-decr', 'nose-scale-vert-incr'), ('nose', 'nose-hump-decr', 'nose-hump-incr'), ('nose', 'nose-curve-concave', 'nose-curve-convex'), ('nose', 'nose-width1-decr', 'nose-width1-incr'),
    ('cheek', 'l-cheek-bones-decr', 'l-cheek-bones-incr'), ('mouth', 'mouth-scale-horiz-decr', 'mouth-scale-horiz-incr'), ('mouth', 'mouth-lowerlip-volume-decr', 'mouth-lowerlip-volume-incr'),
    ('eyebrows', 'eyebrows-trans-down', 'eyebrows-trans-up'), ('forehead', 'forehead-scale-vert-decr', 'forehead-scale-vert-incr'), ('ears', 'r-ear-scale-decr', 'r-ear-scale-incr'), ('neck', 'neck-scale-horiz-decr', 'neck-scale-horiz-incr'),
]
SHAPES = ['head-oval', 'head-round', 'head-square', 'head-rectangular', 'head-triangular', 'head-diamond', 'head-invertedtriangular']

def sculpt(basemesh, seed):
    import random
    r = random.Random(seed)
    def load(cat, name, w):
        f = os.path.join(TARGET_DIR, cat, name + '.target.gz')
        if not os.path.exists(f): return
        try: TargetService.load_target(basemesh, f, weight=w)
        except Exception as e: print('target fail', name, e)
        # symmetric partner for left/right targets
        if name.startswith('l-'):
            f2 = os.path.join(TARGET_DIR, cat, 'r-' + name[2:] + '.target.gz')
            if os.path.exists(f2): TargetService.load_target(basemesh, f2, weight=w)
        if name.startswith('r-ear'):
            f2 = os.path.join(TARGET_DIR, cat, 'l-' + name[2:] + '.target.gz')
            if os.path.exists(f2): TargetService.load_target(basemesh, f2, weight=w)
    load('head', r.choice(SHAPES), 0.35 + r.random() * 0.5)
    for cat, a, b in FACE_PAIRS:
        if r.random() < 0.75: load(cat, a if r.random() < 0.5 else b, 0.15 + r.random() * 0.6)

def recolor(name, mode):
    import numpy as np
    for img in bpy.data.images:
        fp = (img.filepath or '').lower()
        if name.lower() not in fp or 'norm' in fp or '_ao' in fp or 'bump' in fp or img.size[0] == 0: continue
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(h, w, 4)
        r, g, b = px[..., 0], px[..., 1], px[..., 2]
        L = 0.3 * r + 0.59 * g + 0.11 * b
        Ln = np.clip(L / max(1e-3, float(np.percentile(L[L > 0.02], 95))), 0, 1)
        if mode == 'leather':
            # the jacket is the grey-green, low-saturation part (not the jeans, not the striped shirt)
            sat = px[..., :3].max(-1) - px[..., :3].min(-1)
            jacket = (sat < 0.12) & (L > 0.12) & (L < 0.6) & (b < r + 0.06)
            col = np.stack([0.035 + 0.22 * Ln, 0.032 + 0.2 * Ln, 0.03 + 0.18 * Ln], -1)
            px[..., :3] = np.where(jacket[..., None], col, px[..., :3])
        elif mode in ('denim', 'khaki'):
            cloth = L < 0.8
            Lc = np.clip(L / max(1e-4, float(np.percentile(L[cloth], 95))), 0, 1)
            base = (0.07, 0.13, 0.26) if mode == 'denim' else (0.32, 0.27, 0.17)
            col = np.stack([base[0] * (0.5 + 1.1 * Lc), base[1] * (0.5 + 1.1 * Lc), base[2] * (0.5 + 1.1 * Lc)], -1)
            px[..., :3] = np.where(cloth[..., None], col, px[..., :3])
        elif mode == 'royal':
            cloth = L < 0.8                      # everything except the white UV background
            Lc = np.clip(L / max(1e-4, float(np.percentile(L[cloth], 95))), 0, 1)
            col = np.stack([0.015 + 0.05 * Lc, 0.05 + 0.17 * Lc, 0.28 + 0.42 * Lc], -1)
            px[..., :3] = np.where(cloth[..., None], col, px[..., :3])
        img.pixels.foreach_set(px.ravel()); img.update()
        print('recoloured', img.name, mode)
    for m in bpy.data.materials:
        if name.lower() in m.name.lower() and mode == 'leather': m.name = m.name + '_leather'

def find(fname, sub):
    p = AssetService.find_asset_absolute_path(fname, asset_subdir=sub)
    if p is None: print('MISSING', sub, fname)
    return p

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module='bl_ext.user_default.mpfb')

def build(name, P):
    mi = TargetService.get_default_macro_info_dict()
    mi['gender'] = 0.0 if P['sex'] == 'f' else 1.0
    for k in ('age', 'weight', 'muscle', 'height'): mi[k] = P[k]
    mi['proportions'] = 0.6
    race = 'african' if 'african' in P['skin'] else 'asian' if 'asian' in P['skin'] else 'caucasian'
    mi['race'] = {'asian': 0.0, 'caucasian': 0.0, 'african': 0.0}; mi['race'][race] = 1.0
    basemesh = HumanService.create_human(macro_detail_dict=mi)
    sculpt(basemesh, P['seed'])
    sp = find(P['skin'] + '.mhmat', 'skins')
    if sp: HumanService.set_character_skin(sp, basemesh, skin_type='GAMEENGINE')
    HumanService.add_builtin_rig(basemesh, 'mixamo')
    assets = [('eyes', 'low-poly.mhclo', 'Eyes'), ('eyebrows', P['brows'] + '.mhclo', 'Eyebrows'), ('eyelashes', 'eyelashes01.mhclo', 'Eyelashes')]
    if P['hair']: assets.append(('hair', P['hair'] + '.mhclo', 'Hair'))
    assets += [('clothes', c + '.mhclo', 'Clothes') for c in P['clothes']]
    for sub, f, t in assets:
        p = find(f, sub)
        if p: HumanService.add_mhclo_asset(p, basemesh, asset_type=t, material_type='GAMEENGINE')
    root = ObjectService.find_object_of_type_amongst_nearest_relatives(basemesh, 'Skeleton') or basemesh.parent or basemesh
    for k, mode in (P.get('recolor') or {}).items(): recolor(k, mode)
    ExportService.bake_modifiers_remove_helpers(basemesh, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=True)
    # bake every shape key (age, gender, muscle... and the clothes' fitting) into the meshes themselves
    for o in [root] + ObjectService.get_list_of_children(root):
        if o.type == 'MESH' and o.data.shape_keys:
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
            bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    # shrink textures: skins 1024, everything else 512
    for img in bpy.data.images:
        if img.size[0] == 0: continue
        n = (img.name + (img.filepath or '')).lower()
        big = 2048 if ('skins' in n or 'skin' in n) else 1024 if any(k in n for k in ('hair', 'short0', 'long0', 'bob0', 'ponytail', 'afro', 'beard', 'moustache')) else 1024
        if 'normal' in img.name.lower(): big = min(big, 512)
        if img.size[0] > big:
            h = int(img.size[1] * big / img.size[0]); img.scale(big, h)
    # opaque textures -> JPEG files (the exporter keeps PNG whenever an image has an alpha channel)
    tmp = os.path.join(OUT, '_tex'); os.makedirs(tmp, exist_ok=True)
    for img in list(bpy.data.images):
        if img.size[0] == 0: continue
        n = img.name.lower()
        if any(k in n for k in ('eyebrow', 'eyelash', 'short0', 'long0', 'bob0', 'ponytail', 'braid', 'afro')): continue
        f = os.path.join(tmp, f'{name}_{abs(hash(img.name))}.jpg')
        img.filepath_raw = f; img.file_format = 'JPEG'; img.save()
        img.filepath = f; img.source = 'FILE'; img.reload()
    bpy.ops.object.select_all(action='DESELECT')
    objs = [root] + ObjectService.get_list_of_children(root)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = root
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=False,
                              export_image_format='JPEG', export_jpeg_quality=82, export_apply=False, export_yup=True,
                              export_skins=True, export_morph=False, export_extras=False)
    print('WROTE', path, os.path.getsize(path))

for name, P in PEOPLE.items():
    if ONLY and name not in ONLY: continue
    clear()
    try: build(name, P)
    except Exception as e:
        import traceback; traceback.print_exc(); print('FAILED', name)
