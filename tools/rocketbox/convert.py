# Blender (background): Microsoft Rocketbox avatar (FBX, 3ds Max Biped rig, MIT licence) ->
# glTF with Mixamo bone names and one mesh per part (body / head / hair / equip), ready for
# the game's retargeted animations and the runtime outfit compositor.
#   blender -b --python convert.py -- <avatar dir> <out.glb>
import bpy, sys, os, glob
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
name = os.path.basename(src.rstrip('/'))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(src, 'Export', name + '.fbx'))
for o in list(bpy.data.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
for o in bpy.data.objects: o.animation_data_clear()
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for pb in arm.pose.bones: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
SIDE = {'L': 'Left', 'R': 'Right'}
FING = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
def rename(n):
    n0 = n.replace('Bip01 ', '').replace('Bip01', 'Root')
    simple = {'Pelvis': 'Hips', 'Spine': 'Spine', 'Spine1': 'Spine1', 'Spine2': 'Spine2', 'Neck': 'Neck', 'Head': 'Head'}
    if n0 in simple: return simple[n0]
    p = n0.split(' ')
    if len(p) == 2 and p[0] in SIDE:
        s, part = SIDE[p[0]], p[1]
        m = {'Clavicle': 'Shoulder', 'UpperArm': 'Arm', 'Forearm': 'ForeArm', 'Hand': 'Hand', 'Thigh': 'UpLeg', 'Calf': 'Leg', 'Foot': 'Foot', 'Toe0': 'ToeBase'}
        if part in m: return s + m[part]
        if part.startswith('Finger'):
            d = part[6:]; f = int(d[0]); k = int(d[1]) + 1 if len(d) > 1 else 1
            return f'{s}Hand{FING[f]}{k}'
    return 'face_' + n0.replace(' ', '_')
for b in arm.data.bones: b.name = rename(b.name)
# materials: colour (+ alpha for hair/eyelashes) from the Textures folder
tex = os.path.join(src, 'Textures')
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
for m in mesh.data.materials:
    part = m.name.split('_', 1)[1] if '_' in m.name else m.name
    f = glob.glob(os.path.join(tex, f'*_{part}_color.tga')) or glob.glob(os.path.join(tex, f'*{part}*color*.tga'))
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(p.outputs[0], o.inputs[0])
    p.inputs['Roughness'].default_value = 0.8
    if f:
        img = bpy.data.images.load(f[0]); t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
        nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
        if part == 'opacity': nt.links.new(t.outputs['Alpha'], p.inputs['Alpha'])
    m.name = {'body': 'rb_body', 'head': 'rb_head', 'opacity': 'rb_hair'}.get(part, 'rb_' + part)
# one object per material, named by part
bpy.context.view_layer.objects.active = mesh
for o in bpy.data.objects: o.select_set(o == mesh)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.data.objects:
    if o.type == 'MESH':
        mn = o.data.materials[0].name if o.data.materials else 'x'
        if 'pistol' in mn: bpy.data.objects.remove(o); continue
        o.name = o.data.name = mn.replace('rb_', '')
# UV regions of the body texture by which bone drives each face (legs / feet / palm / fingers / top),
# so the game can mix the trousers of one outfit with the shirt of another
import json
body = bpy.data.objects.get('body')
if body:
    me = body.data; uv = me.uv_layers.active.data
    gname = {g.index: g.name for g in body.vertex_groups}
    def cls(bn):
        if 'Hand' in bn and any(f in bn for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')): return 4
        if bn.endswith('Hand'): return 3
        if 'Foot' in bn or 'ToeBase' in bn: return 2
        if 'UpLeg' in bn or bn.endswith('Leg'): return 1
        if bn == 'Hips': return 5
        return 0
    tris = {1: [], 2: [], 3: [], 4: [], 5: []}
    for poly in me.polygons:
        acc = {}
        for vi in poly.vertices:
            for ge in me.vertices[vi].groups: acc[ge.group] = acc.get(ge.group, 0) + ge.weight
        c = 0
        if acc:
            score = {}
            for gi, w in acc.items(): k = cls(gname.get(gi, '')); score[k] = score.get(k, 0) + w
            c = max(score, key=score.get)
        if c:
            pts = [tuple(uv[li].uv) for li in poly.loop_indices]
            for i in range(1, len(pts) - 1): tris[c].append([pts[0], pts[i], pts[i + 1]])
    json.dump(tris, open(out.replace('.glb', '_uv.json'), 'w'))
# bake the 0.01 scale and the Z rotation into the rig and meshes: unparent the meshes (keeping
# them where they are), apply everything, then parent them back to the rig
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in bpy.data.objects: o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
for o in bpy.data.objects: o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in meshes: o.parent = arm
print('ARM', [round(x,3) for x in arm.matrix_world.to_scale()], [round(x,3) for x in arm.rotation_euler], [(o.name, [round(x,3) for x in o.dimensions], [round(x,3) for x in o.matrix_world.to_scale()]) for o in meshes])
for o in meshes:
    for m in o.modifiers:
        if m.type == 'ARMATURE': m.object = arm
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_animations=False, export_yup=True, export_apply=False, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='AUTO', export_morph=False)
print('DONE', name)
