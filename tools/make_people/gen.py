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

# name: (sex, skin, hair, eyebrows, clothes..., macro tweaks)
PEOPLE = {
    'player':  dict(sex='m', skin='young_caucasian_male', hair='short02', brows='eyebrow001', clothes=['male_casualsuit05', 'toigo_ankle_boots_male'], age=0.55, weight=0.55, muscle=0.62, height=0.6),
    'm_hoodie': dict(sex='m', skin='young_caucasian_male2', hair='short04', brows='eyebrow002', clothes=['elvs_hooded_sweat_jacket1', 'cortu_cargo_pants', 'culturalibre_sneakers'], age=0.45, weight=0.5, muscle=0.5, height=0.55),
    'm_sweater': dict(sex='m', skin='middleage_caucasian_male', hair='short01', brows='eyebrow003', clothes=['mindfront_knitted_sweater_01', 'toigo_wool_pants', 'toigo_ankle_boots_male'], age=0.75, weight=0.65, muscle=0.5, height=0.5),
    'm_denim': dict(sex='m', skin='young_african_male', hair='short04', brows='eyebrow004', clothes=['male_casualsuit01', 'punkduck_comfortable_sneakers'], age=0.5, weight=0.5, muscle=0.6, height=0.6),
    'm_old':   dict(sex='m', skin='old_caucasian_male', hair='short03', brows='eyebrow005', clothes=['toigo_fisherman_sweater', 'toigo_wool_pants', 'toigo_ankle_boots_male'], age=0.95, weight=0.6, muscle=0.4, height=0.45),
    'm_asian': dict(sex='m', skin='young_asian_male', hair='short02', brows='eyebrow006', clothes=['male_casualsuit03', 'culturalibre_sneakers'], age=0.45, weight=0.45, muscle=0.5, height=0.45),
    'cop':     dict(sex='m', skin='middleage_caucasian_male', hair='short01', brows='eyebrow002', clothes=['elvs_male_shirt_tie_tucked1', 'toigo_wool_pants', 'toigo_ankle_boots_male'], age=0.6, weight=0.6, muscle=0.65, height=0.6),
    'f_casual': dict(sex='f', skin='young_caucasian_female', hair='ponytail01', brows='eyebrow009', clothes=['female_casualsuit01', 'punkduck_comfortable_sneakers'], age=0.45, weight=0.5, muscle=0.5, height=0.5),
    'f_sweater': dict(sex='f', skin='middleage_african_female', hair='afro01', brows='eyebrow008', clothes=['mindfront_knitted_sweater_02', 'toigo_wool_pants', 'toigo_ankle_boots_female'], age=0.6, weight=0.55, muscle=0.45, height=0.45),
    'f_asian': dict(sex='f', skin='young_asian_female', hair='bob01', brows='eyebrow009', clothes=['toigo_fisherman_sweater', 'cortu_cargo_pants', 'culturalibre_sneakers'], age=0.45, weight=0.45, muscle=0.45, height=0.4),
}

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
    sp = find(P['skin'] + '.mhmat', 'skins')
    if sp: HumanService.set_character_skin(sp, basemesh, skin_type='GAMEENGINE')
    HumanService.add_builtin_rig(basemesh, 'mixamo')
    assets = [('eyes', 'low-poly.mhclo', 'Eyes'), ('eyebrows', P['brows'] + '.mhclo', 'Eyebrows'), ('eyelashes', 'eyelashes01.mhclo', 'Eyelashes'), ('hair', P['hair'] + '.mhclo', 'Hair')]
    assets += [('clothes', c + '.mhclo', 'Clothes') for c in P['clothes']]
    for sub, f, t in assets:
        p = find(f, sub)
        if p: HumanService.add_mhclo_asset(p, basemesh, asset_type=t, material_type='GAMEENGINE')
    root = ObjectService.find_object_of_type_amongst_nearest_relatives(basemesh, 'Skeleton') or basemesh.parent or basemesh
    ExportService.bake_modifiers_remove_helpers(basemesh, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=True)
    # bake every shape key (age, gender, muscle... and the clothes' fitting) into the meshes themselves
    for o in [root] + ObjectService.get_list_of_children(root):
        if o.type == 'MESH' and o.data.shape_keys:
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
            bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    # shrink textures: skins 1024, everything else 512
    for img in bpy.data.images:
        if img.size[0] == 0: continue
        big = 1024 if ('skin' in img.name.lower() or 'body' in img.name.lower() or 'litsphere' in img.name.lower()) else 512
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
