# Making the townspeople

The people in `data/chars/mh/` are built from MakeHuman community assets with
[MPFB2](https://github.com/makehumancommunity/mpfb2) running inside Blender (no GUI needed):

1. Download Blender 4.2 and MPFB2, copy `mpfb2/src/mpfb` into Blender's `extensions/user_default/`.
2. Download the asset packs from https://static.makehumancommunity.org/assets/assetpacks.html
   (MakeHuman system assets, Skins 01/02, Shirts 01/02, Pants 01, Shoes 01/02) and unzip them into
   MPFB's `data` folder.
3. The police shirt is `elvs_male_shirt_tie_tucked1` with its texture recoloured light blue-grey (tie kept navy).
4. `blender -b --factory-startup --python gen.py -- out/` builds every person (edit `PEOPLE` to add more).
   Each gets a Mixamo-named skeleton, so the mocap clips in `data/chars/anims.json` drive them.
5. `node opt.mjs out/ ../../data/chars/mh/` fixes alpha modes and compresses textures (WebP) and geometry (meshopt).
