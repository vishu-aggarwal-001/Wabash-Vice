#!/usr/bin/env bash
# Downloads the OpenStreetMap extracts for the play area into ./osm/
# then run:  python3 tools/build_map.py osm data
# Change BBOX (south,west,north,east) to build a different city —
# also update S, W, N, E at the top of tools/build_map.py to match.
set -e
BBOX_W="40.395,-86.945,40.445,-86.905"
BBOX_E="40.395,-86.905,40.445,-86.865"
BBOX="40.395,-86.945,40.445,-86.865"
API="${OVERPASS:-https://overpass-api.de/api/interpreter}"
mkdir -p osm
q() { # name, query
  for i in 1 2 3 4 5 6; do
    code=$(curl -sS -m 300 -o "osm/$1.json" -w "%{http_code}" --data-urlencode "data=[out:json][timeout:180];($2);out geom qt;" "$API" || true)
    echo "$1 try $i -> HTTP $code"; [ "$code" = 200 ] && return 0; sleep 10
  done
  echo "Failed to fetch $1 (Overpass may be busy — try again, or set OVERPASS to a mirror)"; exit 1
}
q roadsW "way[\"highway\"]($BBOX_W);"
q roadsE "way[\"highway\"]($BBOX_E);"
q build  "way[\"building\"]($BBOX);relation[\"building\"]($BBOX);"
q misc   "way[\"waterway\"~\"river|stream\"](40.38,-86.96,40.46,-86.85);way[\"natural\"=\"water\"]($BBOX);relation[\"natural\"=\"water\"]($BBOX);way[\"leisure\"~\"park|pitch|stadium|golf_course|track\"]($BBOX);way[\"landuse\"~\"grass|forest|meadow|recreation_ground|cemetery|farmland\"]($BBOX);way[\"natural\"~\"wood|scrub\"]($BBOX);way[\"aeroway\"~\"runway|taxiway|apron\"]($BBOX);way[\"railway\"=\"rail\"]($BBOX);way[\"amenity\"=\"parking\"]($BBOX);node[\"natural\"=\"tree\"]($BBOX);"
echo "Done. Now run: python3 tools/build_map.py osm data"
