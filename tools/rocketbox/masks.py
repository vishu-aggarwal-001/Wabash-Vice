# rasterise the per-avatar UV region JSON into a small greyscale mask (value = class * 50)
import json, glob, os
from PIL import Image, ImageDraw, ImageFilter
os.makedirs('/home/claude/rbx/web/masks', exist_ok=True)
S = 256
for f in glob.glob('/home/claude/rbx/out/*_uv.json'):
    tris = json.load(open(f))
    im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
    # pelvis faces are trousers only on the side panels (the middle column is the shirt's hem)
    tris['1'] = tris.get('1', []) + [t for t in tris.get('5', []) if all(u < 0.3 or u > 0.7 for u, v in t)]
    for c in ['1', '2', '3', '4']:
        for t in tris.get(c, []):
            d.polygon([(u * S, (1 - v) * S) for u, v in t], fill=int(c) * 50)
    # grow regions a little into the empty gutters so seams don't show
    grown = im.filter(ImageFilter.MaxFilter(5))
    im = Image.composite(im, grown, im.point(lambda x: 255 if x else 0))
    im.save('/home/claude/rbx/web/masks/' + os.path.basename(f).replace('_uv.json', '.png'), optimize=True)
print('ok')
