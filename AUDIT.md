# Wabash Flight audit (Nov 27 2026)

Every part was tested on its own, smallest first, then the whole game was played in a real browser
(Chrome, real Cesium terrain, imagery and Google 3D tiles). Flaws found are listed with what was done.
`npm test` re-runs the headless checks (553 checks: 485 maths + 68 flight).

## 1. Maths (`src/math.js`)
No defects. 485 checks: quaternion/heading-pitch-roll round trips over the whole attitude range, rotation
matrix vs quaternion, great-circle distance/bearing/destination (incl. the date line), ISA atmosphere to 15 km.

## 2. Aircraft data (`src/aircraft.js`), checked against Cessna 172S POH, A320 and F-16 public data
| Flaw | Fix |
|---|---|
| Trainer stalled ~15% too fast | Lift data matched to the C172 (now 51 kt clean / 45 kt full flaps; POH 48–53 / 40–48) |
| Airliner flew approaches 2° nose-down (flaps made too much lift) and had only 10% stall margin at Vref | Flap lift / slat stall angle reworked: +2° nose-up approach, Vref = 1.25 × stall |
| Fighter sold as "Mach 1.6" but could not pass Mach 0.97 | Fixed in the physics (below): now Mach 2.07 at 40,000 ft (real F-16: 2.05) |
| Full rudder at cruise rolled the airliner over and over-sped it | Rudder travel limiter at high speed (like the real fly-by-wire) |

## 3. Flight physics (`src/physics.js`)
| Flaw | Fix |
|---|---|
| Stall model lost lift 3–4° before the stall angle (symmetric blend), so every plane stalled 10–25% too fast and the speed-tape stall bands were wrong | Lift curve now rounds over to CLmax at the stall angle, then blends to post-stall; stall speeds computed from the same model for the HUD |
| Transonic drag 18·(M−Mcrit)² grew without limit: supersonic flight impossible | Korn-style drag rise to a peak near Mach 1.1, easing off after |
| Airliner engines kept too much thrust up high: full power at cruise over-sped and crashed | Altitude/speed thrust lapse for high-bypass engines; ram thrust gain for the afterburning engine |
| Air-start trim ignored control effectiveness: the fighter lost 5,000 ft in a minute hands-off | Trim uses the same elevator power as the flight model (now ±200 ft) |
| Over-speed crash used true airspeed: at altitude the fighter "over-sped" at normal Mach | Uses indicated airspeed |
| First frame after any air start had zero air data, so assist/autopilot gains were 2× off and the plane ballooned | Air data valid from frame 1 |
| Tyres slid sideways like ice: planes crept and turned in the wind while parked | Near-static sideways tyre grip |
| Full-lock steering at 12 kt tipped the fighter to 40° bank | Steering limited to 0.3 g sideways |

## 4. Autopilot and Assisted mode (`src/autopilot.js`)
| Flaw | Fix |
|---|---|
| Glide path crossed the threshold at 100 ft (aimed 30 m high): touchdowns 900 m down the runway | Standard 50 ft / 3° to the 300 m aiming point: touchdowns 350–750 m |
| Flare too weak, measured from the centre of gravity: flat, firm touchdowns, then ballooning | Wheel-height flare law, stronger gains, frozen integrator: −100 to −250 ft/min |
| No de-crab in crosswinds: autolands touched down 16° sideways and tipped onto a wingtip; no rollout steering (A320 ended 25–67 m off the centre line, off the runway) | De-crab + wing-low in the flare; rollout mode steers, brakes, deploys spoilers and reversers: <6 m off centre in a 15 kt crosswind |
| Autothrottle used true airspeed: speed bugs were wrong up high; no Mach limit | Indicated airspeed, capped at MMO |
| Speed bug could be set below the speed protection: the autopilot descended forever | Minimum speed 1.25 × Vref |
| No stall protection in the autopilot: asked to climb at low speed it stalled the airliner | Angle-of-attack protection |
| Engaged in a climb, it shoved the nose down to 0 g | Engages in V/S, smooth elevator, g limits 0.5–1.5 |
| Could hold an altitude below the terrain and fly into the ground | Terrain floor 800 ft AGL outside approaches, engage minimum 1,000 ft AGL |
| Assisted mode had no stall/pitch protection for the trainer and fighter: full back stick zoomed to 54° and stalled | AoA, pitch and low-energy protection; held climb angle eases off when slow |
| Assisted crosswind landings touched down crabbed; take-off rolls drifted off the runway | Auto de-crab at touchdown, upwind aileron, hands-off heading hold on the runway |
| Trim keys did nothing in Assisted mode | They raise/lower the held climb angle |

## 5. World, airports, HUD (`src/world.js`, `src/airports.js`, `src/hud.js`, `src/geoid.js`)
| Flaw | Fix |
|---|---|
| Altimeter showed height above the WGS84 ellipsoid (−34 m at KLAF, up to 106 m elsewhere); autoland compared sea-level field elevations with ellipsoid heights | EGM96 geoid (1° grid, <1 m error for 95% of Earth): altimeter and autopilot are above sea level; glide path uses the measured runway height once loaded |
| If Bing tiles failed the globe stayed blank | Switches to Esri imagery after repeated tile failures |
| `sampleHeight` (a GPU depth pass) ran every frame; with 3D cities on there was no ground at all where tiles weren't loaded | Rate-limited; background terrain probe as a safety net |
| Spawning "in the air" or "anywhere" could start inside a mountain | Clears the highest terrain around and ahead by 1,000 ft |
| 7 runways had both ends at the same point (heading 0) | Far end rebuilt from published heading and length |
| No radio altimeter | RA readout below 2,500 ft |

## 6. Game loop, menus, touch (`src/main.js`, `play.html`, `src/style.css`)
| Flaw | Fix |
|---|---|
| "Try again"/restart: the old flight kept dragging the camera to 0°N 0°E, so the new scenery never loaded; every restart sat 25 s on "Loading scenery" and then guessed the ground height | Old flight stops before the new one loads: restart in ~3 s |
| Approach start altitude used the ground 12 km out, not the runway | Runway elevation; approach target is always the chosen runway |
| AP panel: HDG+/ALT+ with the autopilot off were silently thrown away; V/S buttons did nothing | Engage first, then apply; V/S moves the target 1,000 ft the right way |
| Autopilot dropped out with "stall!" while rolling out on the runway | Only airborne |
| Reverse thrust could stay armed into the next take-off | Stows in the air, ground only |
| Airliner contrails came out of its nose | Tail |
| No way to stay smooth on weaker hardware | Frame-rate governor lowers resolution, shadows, then detail |
| STALL kept flashing after a crash; "Not on the ground!" when raising the gear on the ground; keyboard hints shown to touch players; throttle % label overlapped the map on phones | Fixed |
| `server.js` path check allowed sibling folders | Fixed (and converted to ES modules) |

## Duel (adversarial review; the critic is simulated by Claude, no second model was called)

**Round 1 — Critic:** "Your 68 flight tests run in your own harness, not the game. Passing them proves nothing about the page he plays."
**Defense (Held):** the harness calls the game's own physics/assist/autopilot modules unchanged. On top, the real page was driven in Chrome with real terrain and imagery: autolands at KORD 10L (−230 ft/min, 1.7 m off centre), KLAF 10 (−179 ft/min) and KIND (−26 ft/min) with wind and turbulence; keyboard take-off at KLAF; crash → "Try again" (3 s); airliner at Heathrow; Grand Canyon "anywhere" start; phone-size touch UI. No console errors.

**Round 2 — Critic:** "Chrome here renders in software at ~3 fps. You have no idea how it runs on a Galaxy S22 or a laptop, and Google 3D cities plus shadows are heavy."
**Defense (Revised):** true. Mitigations added (governor, throttled ground sampling, 3D cities off by default on touch devices), but frame rate on his real devices is **not verified**. He should try it and say which device stutters.

**Round 3 — Critic:** "'Everything works' and 'better than Microsoft Flight Simulator' are not honest claims."
**Defense (Dropped):** agreed. It is not MSFS-class: three generic aircraft with code-built 3D models, no 3D cockpit, no ATC, no live weather, no airport buildings beyond what Google 3D tiles show, straight-in approaches only (at mountain airports the 3° glide path can meet terrain; the PULL UP warning fires). Gamepad mapping follows the standard layout but was not tested with a physical controller.

## Claim ledger
| Claim | Evidence | Status |
|---|---|---|
| Flight model matches real C172/A320/F-16 numbers within the test bands | 68 headless checks with POH/public-data bands | Held |
| Autoland works in calm, 15 kt crosswind and turbulence for all three planes | Headless + 3 in-browser autolands | Held |
| Restart, crash/retry, aircraft switch, place search, touch controls work | In-browser runs, no console errors | Held |
| Runs smoothly on his devices | Not measurable here | Revised: mitigated, unverified |
| As good as / better than MSFS | — | Dropped |

---

# Second pass (Nov 27 2026, evening)

## 7. Flight-sim hardware (new `src/hardware.js`)
Research (three parallel research threads; report: "Flight controllers in Gamepad API") found that browsers report
joysticks, yokes, throttles and pedals with **no standard layout** (`mapping: ""`); Chrome/Edge/Firefox on
Windows number axes by HID usage (X=0, Y=1, Z=2, Rx=3, Ry=4, Rz=5, Slider=6, hat=9); hats are one axis that reads
about +1.29 when centred; axes read 0 until the device first reports; Safari misses most joysticks.

| Flaw in the old code | Fix |
|---|---|
| Only ONE controller was read, so stick + throttle + pedals was impossible | Every connected device is read; a control in use overrides the keyboard |
| Fixed Xbox layout applied to everything: on a joystick, axis 2 (often the throttle lever) became "look around" and the throttle was buttons 6/7 | Per-device bindings with known layouts (Extreme 3D Pro, T.16000M, X52, T.Flight HOTAS, Saitek yoke/quadrant/pedals, T-Rudder) and a guess for others |
| No way to re-bind anything | Settings → Joystick: live axis bars, **Detect** (move the control), Reverse, Clear for 6 axes and 14 button actions; dead zone and response curve; saved per device name |
| Throttle lever impossible (incremental only); an untouched lever would have jumped to 50% | Absolute throttle that takes over only once the lever moves; moving it hands the throttle back from the autothrottle |
| No toe brakes | Left/right toe brakes with differential braking on the wheels |
| Hat switch ignored (or read as an axis) | 8-way hat decoder, looks around; ignored until it reports |
| Device slot changes broke setups | Bindings keyed by device name, not slot |
| jsDelivr blocked (some school networks) = blank page | Falls back to the same Cesium build on unpkg |

Tested with simulated devices in the real page (Extreme 3D + Saitek pedals + Xbox pad at once): 21/21 checks,
plus `npm test` default-layout and hat-decoder checks.

## 8. Every key, button and menu setting, driven in the browser
52 keyboard/mouse checks (every key in the Controls list, Space after clicking a button, mouse look/zoom/reset,
restart) and 14 menu checks (wind, turbulence, clouds, time of day, real time, haze, units, invert, Realistic,
quality, volume, settings surviving a reload, inverted pitch actually inverting): all pass. Fixed: vertical-speed
needle and number were frozen in metric units.

## 9. Performance
Frame-time readout added (press the ` key). Measured in the page: the game's own code costs about 0.6 ms (physics)
+ 0.2 ms (camera) + 1.6 ms (instruments) per frame; the rest is drawing the 3D world, which depends on the GPU.
So on a real device the frame rate is set by graphics quality, which the governor already lowers automatically.

## Duel, round 4–6 (critic simulated by Claude)
**Critic:** "Your controller tests use fake devices you wrote yourself. Real hardware will disagree."
**Defense (Revised):** true. The fake devices copy the layouts the browser source code produces, but most per-device
numbers are inferred, not captured, and TCA, Honeycomb, TFRP and HOTAS 4 had no data at all. That is why every
binding can be re-detected in two clicks. Unverified on real hardware.

**Critic:** "Performance is still unmeasured on his devices."
**Defense (Held, narrowed):** the game's own code is now measured at ~2.5 ms a frame; the rest is the GPU drawing
Cesium's world, which the governor and quality settings control. The ` readout lets him see it on his own device.

**Critic:** "Nothing changes for him until the pull request is merged."
**Defense (Held):** correct, and stated plainly to him.
