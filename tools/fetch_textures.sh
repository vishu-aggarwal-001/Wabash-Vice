#!/usr/bin/env bash
# Downloads the CC0 photo-scanned source materials from Poly Haven (polyhaven.com)
# into ./ph/, then run:  python3 tools/build_textures.py ph data/tex
set -e
B=https://dl.polyhaven.org/file/ph-assets
mkdir -p ph
get(){ curl -sS -A "Mozilla/5.0" -o "ph/$2" "$1" && echo "ok $2"; }
for t in asphalt_02 red_brick brick_wall_02 concrete_pavement grey_plaster beige_wall_001 brushed_concrete box_profile_metal_sheet bitumen leafy_grass bark_brown_02 concrete_floor_01; do
  for m in diff nor_gl rough; do get "$B/Textures/jpg/1k/$t/${t}_${m}_1k.jpg" "${t}_${m}.jpg"; done
done
for m in leaves_diff leaves_alpha leaves_nor_gl; do get "$B/Models/jpg/1k/island_tree_01/island_tree_01_${m}_1k.jpg" "tree_${m}.jpg"; done
echo "Done. Now run: python3 tools/build_textures.py ph data/tex"
