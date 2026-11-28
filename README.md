# ✈️ Wabash Flight

### ▶ [Fly it in your browser](https://vishu-aggarwal-001.github.io/Wabash-Vice/)

**A free flight simulator for the whole planet.** Take off from any of 9,800 real airports and fly anywhere on Earth, with real satellite imagery and real terrain, right in a web browser. It works on computers, tablets and phones, with keyboard, touch or a gamepad.

> This repo used to hold *Wabash Vice*, the GTA-style Lafayette game. That version is saved on the [`gta-archive`](https://github.com/vishu-aggarwal-001/Wabash-Vice/tree/gta-archive) branch.

---

## Features

- 🌍 **The whole Earth**: Cesium World Terrain, Bing satellite imagery and Google photorealistic 3D cities, streamed as you fly. If any of those can't be reached it falls back to Esri imagery and open terrain tiles, so it always works.
- 🛫 **9,800 real airports** with their real runways (from OurAirports). Start on a runway, on final approach, cruising in the air, or above any place you search for.
- 🧠 **6-degree-of-freedom flight physics**: lift curves that round off into a real stall, ground effect, prop wash, transonic wave drag, jet thrust that changes with altitude and speed, wind and turbulence, and spring-damper landing gear with brakes, grippy tyres and nose-wheel steering. Tested against real numbers (see *Tested* below).
- ✈️ **Three original aircraft**: the *Wabash Trainer* (single prop), the *Hoosier 320* (twin-jet airliner) and the *Boiler F-1* (supersonic fighter with afterburner).
- 🤖 **Autopilot**: HDG, ALT, V/S, speed hold (indicated airspeed), NAV direct-to, and **APP** that flies the approach, de-crabs in a crosswind, **autolands** and steers the rollout with brakes, spoilers and reversers.
- 🛟 **Assisted mode** (default): auto-trim, auto-rudder, bank hold, crosswind de-crab, hands-off straight takeoff rolls, and tail-strike, stall, pitch and G protection. Switch to *Realistic* in Settings.
- 📏 **Real altimeter**: altitudes are above sea level (EGM96 geoid), so field elevations and the autopilot match real charts.
- 🧭 **Glass cockpit**: PFD with flight-path marker, speed/altitude tapes, approach diamonds, and a moving map with nearby airports.
- ⛅ **Weather & time**: clouds, wind, turbulence, haze and any time of day.
- 🎥 **Cameras**: chase, cockpit, cinematic fly-by and free orbit.
- 🧈 **Landing scores**: every touchdown is graded (S = "Butter!").
- 🔊 Synthesised engine, wind, stall-horn and touchdown sounds (no audio files).
- 🏙️ **Your own Cesium ion token** (optional): paste a free [Cesium ion](https://ion.cesium.com/signup) token in *Settings* to use your own quota instead of the built-in one.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Pitch / roll | **W S** / **A D** (or arrow keys) | Left stick |
| Rudder, steer on the ground | **Q E** | LB / RB |
| Throttle | **R F** or **+ −**, Home = full, End = idle | RT / LT |
| Brakes / parking brake | **Space** / **B** | A |
| Gear · flaps down / up | **G** · **V** / **Shift+V** | Y · X |
| Spoilers · reverse thrust · afterburner | **/** · **X** · **N** | |
| Trim nose up / down (Assisted: raises / lowers the held climb angle) | **K** / **I** | D-pad |
| Autopilot on/off | **Z** (or the AP button) | Back |
| Cameras | **C** cycles, **1-4** pick | B |
| Look around / zoom | drag the mouse · scroll wheel | Right stick |
| Map · HUD · pause · menu · restart | **M** · **U** · **P** · **Esc** · **Backspace** | Start |

On a phone or tablet you get an on-screen joystick, a throttle slider and buttons.

## Run it locally

```bash
npm start          # tiny zero-dependency server
# then open http://localhost:3000
```
Any static server works (for example `python3 -m http.server 3000`). Opening the file directly won't work because browsers block loading the data files from `file://`.

## Tested

`npm test` flies all three planes headless through 62 checks: stall speeds, takeoff roll, climb rate, top speed,
hands-off trim, stall and recovery, autolands in calm air, a 15 kt crosswind and turbulence, crosswind takeoffs,
braking distance, taxi turns, autopilot heading/altitude changes and the geoid. The pass bands come from the
real aircraft each plane is based on (Cessna 172S POH, Airbus A320 and F-16 public data).

| | Wabash Trainer (≈ C172S) | Hoosier 320 (≈ A320) | Boiler F-1 (≈ F-16) |
|---|---|---|---|
| Stall, clean / full flaps | 51 / 45 kt (real 48–53 / 40–48) | 150 / 108 kt | 126 / 115 kt |
| Takeoff roll to Vr | ≈ 220 m (real 293 m at max weight) | ≈ 930 m at 62 t | ≈ 550 m, dry thrust |
| Initial climb | ≈ 720 ft/min (real 730) | ≈ 2,750 ft/min (real ≈ 2,500) | 4,000+ ft/min (assist holds 7°) |
| Top speed | 126 kt (real 126) | Mach 0.88 at FL345 | Mach ≈ 2.0 at 40,000 ft (real 2.05) |

## How it's built

| File | What it does |
|---|---|
| `play.html` | The game page (loads CesiumJS from the jsDelivr CDN) |
| `src/physics.js` | Flight model: aerodynamics, engines, landing gear, geodesy |
| `src/geoid.js`, `data/egm96-1deg.bin` | Sea-level (EGM96) heights for the altimeter |
| `test/` | Headless flight tests (`npm test`) |
| `src/aircraft.js` | The three aircraft: mass, inertia, aero coefficients, gear points |
| `src/autopilot.js` | Autopilot / autoland and the assisted-flying laws |
| `src/world.js` | Globe, imagery, terrain, clouds and time of day |
| `src/hud.js` | Glass-cockpit instruments drawn on a canvas |
| `src/controls.js`, `src/audio.js`, `src/main.js` | Input, sound, cameras, menus and the game loop |
| `data/airports.json` | Airports and runways, built by `tools/build_airports.py` |
| `models/*.glb` | Aircraft models, generated from code by `tools/build_models.py` |

Rebuild the data: `python3 tools/build_airports.py airports.csv runways.csv data/airports.json` (CSV files from [OurAirports](https://ourairports.com/data/)) and `python3 tools/build_models.py models`.

## Credits

Globe engine [CesiumJS](https://cesium.com/platform/cesiumjs/) (Apache-2.0) · Geoid: EGM96 (NGA, public domain) · Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community · Terrain: [AWS Open Data Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (SRTM, GMTED, ETOPO1 and others) · Airports: [OurAirports](https://ourairports.com/) (public domain) · Place search: OpenStreetMap Nominatim.

Wabash Flight is an independent fan project. It is not affiliated with, or endorsed by, any flight-simulator company.

MIT licence, made by [Vishu Aggarwal](https://vishu-aggarwal-001.github.io/).
