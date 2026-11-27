"""Build data/airports.json from OurAirports (public domain) CSVs.
Keeps every large/medium airport and small airports with a hard runway,
only runways where both ends have coordinates. Usage: python3 build_airports.py airports.csv runways.csv out.json"""
import csv, json, math, sys
ap_csv, rw_csv, out = sys.argv[1:4]
HARD = ('ASP', 'CON', 'PEM', 'BIT', 'TAR', 'PAV', 'MAC', 'ASF')
def hard(s): s = (s or '').upper(); return any(h in s for h in HARD)
def brg(a, b, c, d):
    a, b, c, d = map(math.radians, (a, b, c, d))
    y = math.sin(d - b) * math.cos(c); x = math.cos(a) * math.sin(c) - math.sin(a) * math.cos(c) * math.cos(d - b)
    return (math.degrees(math.atan2(y, x)) + 360) % 360
aps = {}
for r in csv.DictReader(open(ap_csv, encoding='utf-8')):
    if r['type'] not in ('large_airport', 'medium_airport', 'small_airport'): continue
    aps[r['id']] = r
rws = {}
for r in csv.DictReader(open(rw_csv, encoding='utf-8')):
    if r['closed'] == '1' or r['airport_ref'] not in aps: continue
    try:
        la1, lo1, la2, lo2 = (float(r[k]) for k in ('le_latitude_deg', 'le_longitude_deg', 'he_latitude_deg', 'he_longitude_deg'))
    except ValueError: continue
    ap = aps[r['airport_ref']]
    if ap['type'] == 'small_airport' and not hard(r['surface']): continue
    L = int(float(r['length_ft'] or 0)); W = int(float(r['width_ft'] or 0))
    if L and L < 1500: continue
    h1 = brg(la1, lo1, la2, lo2)
    rws.setdefault(r['airport_ref'], []).append([r['le_ident'], round(la1, 6), round(lo1, 6), round(h1, 1),
        r['he_ident'], round(la2, 6), round(lo2, 6), round((h1 + 180) % 360, 1), L, W or 100, 1 if hard(r['surface']) else 0])
res = []
T = {'large_airport': 3, 'medium_airport': 2, 'small_airport': 1}
for k, rl in rws.items():
    a = aps[k]
    code = a['icao_code'] or a['gps_code'] or a['ident']
    try: el = int(float(a['elevation_ft'] or 0))
    except ValueError: el = 0
    res.append([code, a['iata_code'], a['name'], a['municipality'], a['iso_country'], round(float(a['latitude_deg']), 5),
                round(float(a['longitude_deg']), 5), el, T[a['type']], sorted(rl, key=lambda x: -x[8])])
res.sort(key=lambda x: (-x[8], x[0]))
json.dump(res, open(out, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
print(len(res), 'airports', sum(len(x[9]) for x in res), 'runways')
