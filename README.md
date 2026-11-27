# ✈️ Wabash Flight

### ▶ [Fly it in your browser](https://vishu-aggarwal-001.github.io/Wabash-Vice/)

**A free flight simulator for the whole planet.** Take off from any of 9,800 real airports and fly anywhere on Earth, with real satellite imagery and real terrain, right in a web browser. It works on computers, tablets and phones, with keyboard, touch or a gamepad.

> This repo used to hold *Wabash Vice*, the GTA-style Lafayette game. That version is saved on the [`gta-archive`](https://github.com/vishu-aggarwal-001/Wabash-Vice/tree/gta-archive) branch.

---

## Features

- 🌍 **The whole Earth**: Esri satellite imagery and worldwide elevation data, streamed as you fly. No account needed.
- 🛫 **9,800 real airports** with their real runways (from OurAirports). Start on a runway, on final approach, cruising in the air, or above any place you search for.
- 🧠 **6-degree-of-freedom flight physics**: lift and drag curves, stalls and wing drop, ground effect, prop wash, Mach drag rise, wind and turbulence, and spring-damper landing gear with brakes and nose-wheel steering.
- ✈️ **Three original aircraft**: the *Wabash Trainer* (single prop), the *Hoosier 320* (twin-jet airliner) and the *Boiler F-1* (supersonic fighter with afterburner).
- 🤖 **Autopilot**: HDG, ALT, V/S, speed hold, NAV direct-to, and **APP** that flies the approach and **autolands**.
- 🛟 **Assisted mode** (default): auto-trim, auto-rudder, bank hold, and tail-strike, stall and G protection. Switch to *Realistic* in Settings.
- 🧭 **Glass cockpit**: PFD with flight-path marker, speed/altitude tapes, approach diamonds, and a moving map with nearby airports.
- ⛅ **Weather & time**: clouds, wind, turbulence, haze and any time of day.
- 🎥 **Cameras**: chase, cockpit, cinematic fly-by and free orbit.
- 🧈 **Landing scores**: every touchdown is graded (S = "Butter!").
- 🔊 Synthesised engine, wind, stall-horn and touchdown sounds (no audio files).
- 🏙️ **Optional photorealistic upgrade**: paste a free [Cesium ion](https://ion.cesium.com/signup) token in *Settings* for Cesium World Terrain, night-time city lights and Google photorealistic 3D cities.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Pitch / roll | **W S** / **A D** (or arrow keys) | Left stick |
| Rudder, steer on the ground | **Q E** | LB / RB |
| Throttle | **R F** or **+ −**, Home = full, End = idle | RT / LT |
| Brakes / parking brake | **Space** / **B** | A |
| Gear · flaps down / up | **G** · **V** / **Shift+V** | Y · X |
| Spoilers · reverse thrust · afterburner | **/** · **X** · **N** | |
| Trim nose up / down | **K** / **I** | D-pad |
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

## How it's built

| File | What it does |
|---|---|
| `play.html` | The game page (loads CesiumJS from the jsDelivr CDN) |
| `src/physics.js` | Flight model: aerodynamics, engines, landing gear, geodesy |
| `src/aircraft.js` | The three aircraft: mass, inertia, aero coefficients, gear points |
| `src/autopilot.js` | Autopilot / autoland and the assisted-flying laws |
| `src/world.js` | Globe, imagery, terrain, clouds and time of day |
| `src/hud.js` | Glass-cockpit instruments drawn on a canvas |
| `src/controls.js`, `src/audio.js`, `src/main.js` | Input, sound, cameras, menus and the game loop |
| `data/airports.json` | Airports and runways, built by `tools/build_airports.py` |
| `models/*.glb` | Aircraft models, generated from code by `tools/build_models.py` |

Rebuild the data: `python3 tools/build_airports.py airports.csv runways.csv data/airports.json` (CSV files from [OurAirports](https://ourairports.com/data/)) and `python3 tools/build_models.py models`.

## Credits

Globe engine [CesiumJS](https://cesium.com/platform/cesiumjs/) (Apache-2.0) · Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community · Terrain: [AWS Open Data Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (SRTM, GMTED, ETOPO1 and others) · Airports: [OurAirports](https://ourairports.com/) (public domain) · Place search: OpenStreetMap Nominatim.

Wabash Flight is an independent fan project. It is not affiliated with, or endorsed by, any flight-simulator company.

MIT licence, made by [Vishu Aggarwal](https://vishu-aggarwal-001.github.io/).
