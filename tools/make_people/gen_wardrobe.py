# Blender (background): build the player's body once, fit every wardrobe item to it,
# and export the body and each item as separate GLBs sharing one Mixamo skeleton, so the
# game can mix and match clothes, hats, glasses, beards and haircuts.
#   blender -b --factory-startup --python gen_wardrobe.py -- <outdir> <pass>
#   pass = base | variants
import bpy, sys, os, importlib
sys.path.insert(0, os.path.dirname(__file__))

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, PASS = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
# reuse helpers (person spec, sculpt, recolor) from gen.py without running its main loop
src = open(os.path.join(os.path.dirname(__file__), 'gen.py')).read().split('for name, P in PEOPLE.items():')[0]
G = {'__file__': os.path.join(os.path.dirname(__file__), 'gen.py')}
sys.argv = ['x', '--', OUT]
exec(compile(src, 'gen.py', 'exec'), G)
HumanService, AssetService, ObjectService, ExportService, TargetService = G['HumanService'], G['AssetService'], G['ObjectService'], G['ExportService'], G['TargetService']

# id: (asset, recolor)
BASE = {
    'hair_short01': 'short01', 'hair_short02': 'short02', 'hair_short03': 'short03', 'hair_short04': 'short04', 'hair_afro': 'afro01', 'hair_long': 'long01', 'hair_ponytail': 'ponytail01',
    'beard_stubble': 'wdg_scruffy_beard', 'beard_moustache': 'rehmanpolanski_moustache_viking', 'beard_viking': 'rehmanpolanski_beard_viking', 'beard_goatee': 'grinsegold_beard_sigmund_wip',
    'hat_flatcap': 'elvs_male_flat_cap1', 'hat_knit': 'mindfront_knitted_hat_01', 'hat_slouchy': 'elvs_slouchy_beanie1', 'hat_newsboy': 'jujube_newsboy_cap', 'hat_patrol': 'mindfront_patrol_cap',
    'hat_fedora': 'fedora01', 'hat_trilby': 'elvs_male_trilby_hat', 'hat_bowler': 'culturalibre_cl_bowler_hat', 'hat_ushanka': 'mindfront_sherpa_hat', 'hat_fishing': 'mindfront_fishing_hat_01',
    'glasses_sun': 'frankyaye_glasses_library_male', 'glasses_silver': 'kwnet_at_optical_glasses', 'glasses_black': 'spamrakuen_tbm_glasses_frames_01', 'glasses_round': 'toigo_round_glasses_leopard', 'glasses_rimless': 'spamrakuen_sagerfrogs_glasses_02',
    'outfit_field': 'male_casualsuit05', 'outfit_denim': 'male_casualsuit01', 'outfit_stripes': 'male_casualsuit03', 'outfit_whitetee': 'male_casualsuit06', 'outfit_bluetee': 'male_casualsuit02',
    'outfit_suit': 'toigo_male_suit_tie_and_jacket', 'outfit_overalls': 'male_worksuit01',
    'top_hoodie': 'elvs_hooded_sweat_jacket1', 'top_knit_cream': 'mindfront_knitted_sweater_01', 'top_knit_red': 'mindfront_knitted_sweater_02', 'top_fisherman': 'toigo_fisherman_sweater',
    'top_polo': 'namuhekam_male_polo_shirt', 'top_blackshirt': 'elvs_male_shirt_untucked_bd1',
    'legs_cargo': 'cortu_cargo_pants', 'legs_wool': 'toigo_wool_pants',
    'shoes_boots': 'toigo_ankle_boots_male', 'shoes_red': 'culturalibre_sneakers', 'shoes_slipons': 'punkduck_comfortable_sneakers', 'shoes_oxford': 'mindfront_shoes_oxford_male', 'shoes_workboots': 'culturalibre_male_boots',
}
VARIANTS = {   # recoloured copies (one Blender pass each, since a recolour changes the shared image)
    'outfit_leather': ('male_casualsuit05', 'leather'), 'top_tracksuit': ('elvs_hooded_sweat_jacket1', 'royal'),
    'legs_tracksuit': ('cortu_cargo_pants', 'royal'), 'legs_denim': ('cortu_cargo_pants', 'denim'), 'legs_khaki': ('cortu_cargo_pants', 'khaki'),
}
SUB = lambda a: 'hair' if a.startswith(('short0', 'afro', 'long0', 'ponytail')) else 'clothes'

def body():
    P = dict(G['PEOPLE']['player'])
    mi = TargetService.get_default_macro_info_dict()
    mi['gender'] = 1.0
    for k in ('age', 'weight', 'muscle', 'height'): mi[k] = P[k]
    mi['proportions'] = 0.6; mi['race'] = {'asian': 0.0, 'caucasian': 1.0, 'african': 0.0}
    bm = HumanService.create_human(macro_detail_dict=mi)
    G['sculpt'](bm, P['seed'])
    HumanService.set_character_skin(G['find'](P['skin'] + '.mhmat', 'skins'), bm, skin_type='GAMEENGINE')
    HumanService.add_builtin_rig(bm, 'mixamo')
    for sub, f, t in [('eyes', 'low-poly.mhclo', 'Eyes'), ('eyebrows', P['brows'] + '.mhclo', 'Eyebrows'), ('eyelashes', 'eyelashes01.mhclo', 'Eyelashes')]:
        HumanService.add_mhclo_asset(G['find'](f, sub), bm, asset_type=t, material_type='GAMEENGINE')
    return bm

def export(objs, rig, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs + [rig]: o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=False, export_image_format='JPEG',
                              export_jpeg_quality=82, export_apply=False, export_skins=True, export_morph=False, export_extras=False)
    print('WROTE', path, os.path.getsize(path))

G['clear']()
bm = body()
rig = bm.parent
before = set(bpy.data.objects)
items = {}
todo = BASE if PASS == 'base' else {k: v[0] for k, v in VARIANTS.items()}
if PASS != 'base':   # one variant per run: recolouring changes the shared texture
    only = argv[2]
    todo = {only: VARIANTS[only][0]}
for iid, asset in todo.items():
    p = G['find'](asset + '.mhclo', SUB(asset))
    if not p: continue
    prev = set(bpy.data.objects)
    HumanService.add_mhclo_asset(p, bm, asset_type='Hair' if SUB(asset) == 'hair' else 'Clothes', material_type='GAMEENGINE')
    new = [o for o in bpy.data.objects if o not in prev and o.type == 'MESH']
    items[iid] = new
# the body must not be cut away under any one item (they are mixed and matched later)
for m in list(bm.modifiers):
    if m.type == 'MASK' and 'helper' not in m.name.lower(): bm.modifiers.remove(m)
ExportService.bake_modifiers_remove_helpers(bm, bake_masks=True, bake_subdiv=False, remove_helpers=True, also_proxy=True)
for o in [bm] + [o for v in items.values() for o in v] + [c for c in rig.children]:
    if o.type == 'MESH' and o.data.shape_keys:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
if PASS != 'base':
    G['recolor'](VARIANTS[argv[2]][0], VARIANTS[argv[2]][1])
# textures: skin 2048, hair/beards 1024, the rest 512 (the web optimiser resizes again)
for img in bpy.data.images:
    if img.size[0] == 0: continue
    n = (img.name + (img.filepath or '')).lower()
    big = 2048 if 'skins' in n else 1024 if any(k in n for k in ('hair', 'short0', 'long0', 'afro', 'ponytail', 'beard', 'moustache')) else 1024
    if img.size[0] > big: img.scale(big, int(img.size[1] * big / img.size[0]))
tmp = os.path.join(OUT, '_tex'); os.makedirs(tmp, exist_ok=True)
for img in list(bpy.data.images):
    n = img.name.lower()
    if img.size[0] == 0 or any(k in n for k in ('eyebrow', 'eyelash', 'short0', 'long0', 'bob0', 'ponytail', 'afro', 'beard', 'moustache', 'glass', 'lens')): continue
    f = os.path.join(tmp, f'{PASS}_{abs(hash(img.name))}.jpg'); img.filepath_raw = f; img.file_format = 'JPEG'; img.save(); img.filepath = f; img.source = 'FILE'; img.reload()
item_objs = {o for v in items.values() for o in v}
if PASS == 'base':
    body_parts = [o for o in rig.children if o.type == 'MESH' and o not in item_objs]
    export(body_parts, rig, os.path.join(OUT, 'body.glb'))
for iid, objs in items.items():
    if objs: export(objs, rig, os.path.join(OUT, iid + '.glb'))
