# 🚗✈️🚤 Wabash Vice

### ▶ [Play it in your browser](https://vishu-aggarwal-001.github.io/Wabash-Vice/)

**An open-world driving, flying and boating game set in the *real* West Lafayette & Lafayette, Indiana.**

Every street, all 13,500 buildings, the Wabash River, the bridges, Purdue's campus, downtown Lafayette and Purdue Airport come from real OpenStreetMap data, at real 1:1 scale (about 6.8 km × 5.5 km). It runs in any modern browser. There's no install and no build step.

> **Status: v0.7: steal any car on the street, start with a gun, sunny by default.** It isn't GTA 6. That took a studio of thousands of people about a decade. What it is: a real, working open-world game of your actual hometown that you can keep improving. See the [Roadmap](#roadmap).

---

## ▶️ Play it

### Option 1: run it on your computer (30 seconds)
You need [Node.js](https://nodejs.org) (any version from 16 up).

```bash
cd wabash-vice
npm start
```
Then open **http://localhost:3000** and press **Play**. (The game itself is `play.html`; `index.html` is the website.) You don't need `npm install`, because everything is already in the folder.

No Node? Any static web server works, for example `python3 -m http.server 3000`.
(Opening `index.html` by double-clicking **won't** work, because browsers block loading the map files from `file://`.)

### Option 2: play the online version
It's hosted free on GitHub Pages: **https://vishu-aggarwal-001.github.io/Wabash-Vice/**

To turn hosting on for a copy of this repo: **Settings → Pages → Build and deployment → Source: “Deploy from a branch” → Branch: `main`, folder `/ (root)` → Save**. It goes live about a minute later at `https://<username>.github.io/<repo-name>/`, and updates every time you push.

---

## 🎮 Controls

| | Keyboard / mouse | Gamepad |
|---|---|---|
| Move / drive | **W A S D** (Shift sprint, Alt walk) | Left stick, RT/LT |
| Talk to someone | **G**, then **1–4** or click an answer | 💬 button |
| Look | **Mouse** (click the game to capture it) or right-drag | Right stick |
| Steal / enter / exit a car | **F**: break into any parked car, carjack traffic, steal cop cars | Y |
| Run / nitro / afterburner | **Shift** | LS click / X |
| Jump / handbrake / climb | **Space** | A |
| Spawn any vehicle | **V** | D-pad left |
| Map + GPS waypoint | **M**, then click the map | Back |
| Start mission (yellow marker) | **J** | |
| Camera (chase / far / cockpit) | **C**, scroll to zoom | R-stick click |
| Horn / siren / radio | **H** / **K** / **R** | D-pad up / – / right |
| Fast-forward time | hold **T** | |
| Menu, settings, fast travel | **Esc** | Start |
| Punch or swing / kick | **Click** or **Q** / **E** | X / B |
| Pick a weapon | **1** fists / melee · **2** pistol · **3** SMG · **4** shotgun · **5** rifle · **Z** cycles | |
| Shoot (with a gun out) | **Click** or **Q**, aim with the mouse (hold for the SMG) | X |
| Answer a choice (pay the bribe?) | **Y** / **N** | |
| Use a medkit (on foot) | **H** | |
| Phone: jobs, story, shop, stats | **Tab** | Back/View |
| End your job shift | **X** | |
| Help overlay | **F1** | |

**Planes:** W/S throttle · A/D roll · **↓ nose up / ↑ nose down** (flight-sim style; you can invert it in Settings) · Q/E rudder · Space wheel brakes.
*To take off:* hold W until you're past about 60 mph, tap ↓ to lift the nose, then let go and climb. Exit above 12 m and you'll parachute.

**Helicopter:** Space climb · Shift/Z descend · W/S tilt forward/back · A/D turn · Q/E strafe. You can land on any rooftop.

**Phones and tablets:** on-screen joystick and buttons appear automatically (quality defaults to Low).

---

## 🆕 What's new in v0.7: grand theft auto

- **Every street has parked cars, and you can steal all of them.** Walk up to any car and press **F**. With fists you elbow the window, with a bat or pipe you smash it, a crowbar pries the door fastest, and with a gun out you shoot the lock. Some cars have alarms (most of the expensive ones): the lights flash, the horn blares and people call the cops.
- **Carjacking actually works.** Press **F** next to a traffic car that's stopped or crawling: you drag the driver out onto the road and drive off. Cop cars can be stolen too (2 stars).
- **You start with a 9mm pistol** and 60 rounds. Number keys pick weapons, Criminal Russia style: **1** fists / melee, **2** pistol, **3** SMG, **4** shotgun, **5** rifle, with a weapon bar on screen. Pressing a number for a gun you don't own sets your GPS to Levee Pawn & Loan. No more level locks on guns, and the Purdue gun-free zone is gone.
- **Always sunny by default.** No more random snow or night. Pick *Always night* or *Day & night cycle* (and snow) in Settings.
- **Fixed the white-out at night:** the police helicopter's searchlight was about 1,000× too bright and turned the whole screen white with rings on the ground.

## What was new in v0.6: home, solid cars, talking, and a lot faster

- **You have a home.** You start at your house in West Lafayette with your own car in the driveway (the one you tuned at Dee's, otherwise the Boilermaker GT). Walk up to the 🏠 front door to save and heal. You respawn there, your car comes back if it got wrecked, and **Esc → Fast travel → 🏠 Home** takes you there.
- **Talk to anyone** (Criminal Russia style). Walk up to a person, press **G**, and pick a line: chat, ask their name, ask for work (sets your GPS), ask the way, compliment, insult, or rob them. Everyone has a name, a job and a mood, and they remember you. Insult or rob the wrong guy and he'll fight you. If you're wanted, you can try to bribe a cop.
- **Street contacts with missions.** Four people around town hand out work when you talk to them, two jobs each (💬 on the map, phone → **Contacts**):
  - **T-Bone** (levee): a time trial, then a pink-slip race where you win the other guy's GT-R.
  - **Mrs. Kowalski** (Chauncey): steal her husband's '79 Monon back from thugs, then deliver six pies without breaking them.
  - **Professor Lin** (Memorial Union): chase down a laptop thief, then get him to Purdue Airport for his flight.
  - **Rico** (downtown): carry a hot package and shake the cops, then take on the Northside Crew.
  - Ordinary people sometimes ask for a favour when you ask about work: a ride across town, or catching the guy who stole their bag.
- **Cars are solid.** Box-shaped collisions with real impulses and spin: you can't walk or drive through parked, traffic or police cars any more. Hit a parked car and it skids away. Traffic brakes for cars stopped in its lane, and traffic no longer spawns on top of other cars.
- **You can jump onto cars** and stand on their roofs. Pedestrians stop instead of walking through you.
- **Snappier on foot.** You jog by default, Shift sprints, Alt walks, and you turn and accelerate faster.
- **Much faster.** About 13× fewer triangles per frame: smaller render chunks, distance culling, a low-detail far terrain, lighter tree trunks, and cheaper shadows on Low. Below 20 fps the game no longer runs in slow motion.

## What was new in v0.5: real people and a full character creator

**65 realistic townspeople** from the Microsoft Rocketbox library: proper faces, natural proportions, real clothes. Students in hoodies and denim jackets, businessmen in suits, construction workers, footballers, women in blazers, leather jackets and dresses, cops in peaked caps and police vests, SWAT, paramedics and firefighters.

**Build your own character, piece by piece.** Every part is separate and saved:
- **Face & hair** (about 30 faces per gender), **skin tone** (5 shades) and **man or woman** at Levee Barbers
- **Top**, **trousers** and **shoes** from any outfit, mixed freely; **gloves** (black, brown, white, red driving gloves, fingerless); **hats** (beanies, caps, flat caps, ushanka); **glasses** (sunglasses, gold aviators, frames) at Wabash Threads
- Change into anything you own from the phone (**Tab → Wardrobe**).

## What was new in v0.4: the Criminal Russia update

**Story mode, Chapter 1: twelve missions.** Your big brother Danny ran a garage in downtown Lafayette until Lieutenant Kessler framed him for car theft. You arrive broke and work for Danny's partner Dee and then for **Uncle Vic**, the godfather of Lafayette, until you can bring Kessler down:
1. New Life · 2. Valuable Cargo (a van of TVs that break on every bump) · 3. The Godfather · 4. Hot Wheels · 5. Police Control (bribe the checkpoint or run it) · 6. Debt · 7. Fastest Car (Homecoming race) · 8. River Run · 9. Traitor · 10. The Party (protect Vic from the Northside Crew) · 11. Escape (4 stars and roadblocks) · 12. Fuel Deal (steal Kessler's tanker and get it to Purdue Airport).

**Levels and talents.** Missions, jobs and stunts give XP. Each level gives a talent point (phone → **Skills**): **Endurance** (more health, faster stamina), **Driving** (acceleration, grip, nitro) and **Criminal Enterprise** (pay, and the cops lose you faster).

**Dee's Tune Shop** (orange 🔧 on the map, next to the garage). Drive any car in and press **J**:
- 16 paint colours, window tint (clear to limo black), 5 rim styles in chrome, black, white, bronze or **24k gold**
- Lip, sport or GT wings, lifted / lowered / slammed suspension (lower = more grip), **ECU chip stages 1–3** (more acceleration and top speed; stages 2 and 3 unlock at levels 4 and 7)
- Repairs and nitro refills
- **Keep it as your own car**: every mod is saved, and you can call it from the phone (**🚗 Vehicles → Your car**).

**16 more cars** (36 vehicles in total), all in traffic: wagon, 1979 classic, luxury sedan, limo, compact, rally hatch, roadster, GT-R, supercar, drag muscle, pony car, 4x4, crossover, heavy-duty pickup, van and a fuel tanker.

**Three new jobs**: **CityBus Driver** (stop at each stop, people get on and off, keep to the timetable), **Firefighter** (house, car and dumpster fires with real flames and smoke; park the engine and the water cannon locks on) and **Vic's Chop Shop** (find the car on order, steal it, deliver it clean).

**Weapons** at **Levee Pawn & Loan** (red marker downtown):
- Melee: brass knuckles, baseball bat, lead pipe, hockey stick, crowbar, golf club, sledgehammer (gripped and swung over the shoulder).
- **Guns**: 9mm pistol, submachine gun (full auto), pump shotgun, hunting rifle, plus ammo. The camera goes over your shoulder with a crosshair; bullets hit people and cars and are stopped by walls.
- **The police respond**: every shot gives you a star, hitting people gives more, shooting a cop gives three. Once you've fired, cops draw their pistols and shoot back, and at 3+ stars they shoot from their cruisers too.
- **Z** switches weapons. Purdue's campus is a gun-free zone: guns stay holstered there.

**Police roadblocks**: at 3 stars and above, two cruisers block the road ahead of you.

**Sharper clothes**: every outfit texture doubled to 1024 px.

## What was new in v0.3

**Skinned, animated people** driven by motion-captured idle, walk and run animations, with procedural layers for driving, bike riding, sitting, punching, kicking, cowering, hands-up and getting knocked flat. (In v0.5 the MakeHuman people were replaced by Rocketbox avatars.)

**Wardrobe, shops and barbers**
- Buy clothes, hats and glasses at **Wabash Threads** (purple markers: downtown and Chauncey) and haircuts and beards at **Levee Barbers** (teal marker). Walk into the marker and press **J**.
- 50+ items that mix and match: leather jacket, tracksuit, hoodies, knit sweaters, suit, overalls, cargo and tracksuit pants, boots and sneakers, ushanka, flat cap, fedora, bowler, beanies, sunglasses and frames, 8 haircuts, beards.
- Change into anything you own any time from the phone (**Tab → Wardrobe**). Your look is saved.

**22 different townspeople**: bald guys in leather jackets and tracksuits, hoodies and flat caps, workers in overalls, a businessman, older folks, three different cops in peaked caps, shirts and ties, and six women. Each has their own sculpted face.

**Criminal Russia-style gameplay**
- **Jobs** from the phone (**Tab**): **Police Work** (road accidents, speeders to pull over, purse snatchers to chase and cuff, street fights, stolen cars to ram), **Taxi Driver**, **Paramedic** and **Boiler Express** deliveries. Every job has a work vehicle, a uniform, endless calls from the dispatcher, cash and XP, and ranks (Rookie → Chief of Police) that pay more.
- **Story mode: Chapter 1**, five missions for Dee, who runs a garage behind the courthouse downtown: a test drive, a debt collection in Chauncey Village, stealing a muscle car from Wabash Landing, a river run up the Wabash, and the Homecoming street race against AI rivals.
- **Fist fights**: punch, kick, knock people down. Thugs fight back.
- **Cops on foot**: with a wanted level they jump out of their cruisers and chase you.
- **Health, armor, stamina and a karma meter** (bad ↔ good), medkits, and a phone shop for armor, medkits, healing and a lawyer.

**Looks**
- **Weather**: clear, overcast, **snow & sunshine**, or **snowfall**, which settles on roofs, lawns, trees and parked cars, with flakes falling around you. It changes every visit, or pick one in Settings.
- **Working traffic lights** (mast-arm signals) at ~400 real junctions, and AI traffic stops on red.
- New HUD: health/armor/stamina bars, karma meter, job panel, dialogue subtitles.

**Graphics pass 2**
- **Rooms behind every window** (interior mapping): real depth that shifts as you move, curtains and blinds, shelves in shops, and rooms that light up at night
- **Storefronts** with shop signs, display windows, doors and awnings on commercial streets and downtown; stone or brick bases with entrances on big buildings
- **3D cornices and ledges**, and AC units, vents and stair huts on the roofs
- **Curbs and slab sidewalks** along every street
- **Street lamps that actually light the street** near you, and warmer city nights
- **Better cars**: dark tinted glass, real headlight and tail-light clusters, grille bars, door handles, a reflection probe with a dark ground so cars stop looking washed out

**Fixes**
- **Camera no longer clips into walls or your own head** (that was the "black screen"): a thick camera probe, swinging up over obstacles, re-checking after the camera lags, and hiding the player when the lens is too close.
- **Runs much better on laptops**: Auto quality picks a preset from your GPU, and dynamic resolution lowers the render scale when the frame rate drops (and switches off ambient occlusion if it has to).

## ✨ What's in v0.1

**The real city**
- 13,529 buildings from OpenStreetMap footprints, with real heights where they're mapped. Red brick on Purdue's campus, storefronts downtown, pitched-roof houses in the neighbourhoods
- 10,380 real roads, paths and rail lines with lane markings, sidewalks and real street names on the HUD (“Mitch Daniels Boulevard · Purdue University”)
- The Wabash River in its real course, with valley terrain (the West Lafayette bluff and Lafayette's gentle rise) and real bridges with railings and piers
- Purdue Airport's real runways 10/28 and 5/23
- 27,000 trees (5,500 of them at their real mapped positions), in autumn colours
- Hand-built landmarks: **Purdue Bell Tower**, **Tippecanoe County Courthouse** dome, a Purdue water tower
- 8 districts: Purdue University, Downtown Lafayette, Chauncey Village, Wabash Landing, Tapawingo Park, Ross-Ade Stadium, Purdue Airport, Columbian Park

**22 vehicles**: Boilermaker GT, Golden Train Hypercar, sedan, hatchback, muscle car, SUV, pickup, Lafayette PD cruiser, taxi, ambulance, fire engine, CityBus, delivery truck, street bike, dirt bike, bicycle, Skyhawk trainer plane, Boiler Jet, helicopter, speedboat, jet ski and pontoon boat. They have separate physics for cars (drifting, nitro, jumps), bikes (leaning), planes (lift, stall, banked turns), helicopters and boats.

**Living city**: AI traffic driving the real street network on the right-hand side, pedestrians, carjacking, and a **wanted system** (1–5 stars). Cops chase you using GPS routing, a helicopter with a searchlight joins at 3+ stars, and you can get **BUSTED** or lose them.

**Things to do**
- 5 missions: Boiler Express deliveries, the Ross-Ade Street Race, Purdue Flight School rings, Rooftop Hopper (helicopter), and the Wabash River Run
- 30 hidden **Golden Gears** ($500 each), some of them on rooftops
- Stunt-jump cash bonuses, a money counter, GPS routing to any point you click on the map
- Fast travel, and an auto-save of your money, gears and settings

**Looks and sound** (v0.2 graphics overhaul)
- **Photo-scanned materials** from Poly Haven: real brick, asphalt with cracks, concrete sidewalks, plaster, metal siding, roofing and grass, all with surface relief (normal maps) and roughness
- **Reflective glass** windows that mirror the sky, recessed window frames, limestone trim on Purdue's red brick, arched windows downtown
- **Real leaf canopies** built from photographed leaves, in November colours (green, gold, orange), on bark-textured trunks with branches
- **Smooth, curved car bodies** with arched wheel wells, 5-spoke alloy rims, clear-coat paint and sky reflections
- **Ambient occlusion** (soft contact shadows), 4K sun shadows, bloom, a filmic colour grade, atmospheric haze
- Day/night cycle using Lafayette's real November sun path, sky with clouds, stars and moon
- Reflective water, lit windows and street lamps at night, headlights
- Procedural engine, wind, siren, crash and splash sounds, plus **Boiler FM 88.8**, a generative synthwave radio station (press R)
- 4 graphics presets (Low → Ultra) in Settings

---

## 🗂 Project layout

```
index.html          the website (landing page)
play.html           the game page: HUD, menus
site/img/           website screenshots
src/main.js         game loop, camera, controls, enter/exit, wasted/busted, saving
src/world.js        loads the map data and builds terrain, river, roads, bridges, buildings, trees, lamps, landmarks + all collision queries
src/vehicles.js     vehicle catalogue, procedural 3D models, physics for every vehicle type
src/player.js       on-foot character (walk/run/jump/swim/ragdoll) and the shared person model
src/npc.js          traffic, pedestrians, police and the wanted level
src/missions.js     activity markers (J), checkpoints, Golden Gears
src/people.js       realistic skinned characters, clip retargeting, poses, hair & hats
src/actors.js       scripted NPCs (suspects, thugs, passengers, patients) and AI drivers
src/script.js       tiny async mission-scripting runtime (say, goto, timer, failIf…)
src/jobs.js         Police / Taxi / Paramedic / Delivery jobs, calls, ranks
src/story.js        Story mode, Chapter 1
src/weather.js      clear / overcast / snow, snow-cover shader patch, snowfall
data/chars/rb/      the townspeople (Microsoft Rocketbox, see tools/rocketbox/), data/chars/anims.json mocap clips
tools/charlab.html  dev page to preview characters/poses and re-extract the clips
src/env.js          sky, sun, moon, stars, clouds, fog, day/night
src/hud.js          speedometer, minimap, full map, menus
src/audio.js        all sound (Web Audio, no files) and the radio
src/input.js        keyboard, mouse, gamepad, touch
src/textures.js     procedural textures (facades, roads, water…)
src/fx.js           particles: smoke, tyre smoke, splashes, explosions
data/               map.json, terrain.bin, ground.jpg (built from OpenStreetMap)
data/tex/           texture atlases built from Poly Haven photo scans
tools/              fetch_osm.sh + build_map.py rebuild the map; fetch_textures.sh + build_textures.py rebuild the textures
vendor/three/       Three.js r180 (bundled so it works offline)
server.js           zero-dependency local web server
```

### Rebuild or extend the map
```bash
./tools/fetch_osm.sh                    # downloads fresh OpenStreetMap data into osm/
python3 tools/build_map.py osm data     # needs: pip install numpy scipy pillow
```
To make the world bigger (for example out to I-65, or to include Wildcat Creek), widen the bounding box in **both** `tools/fetch_osm.sh` and the `S, W, N, E` line at the top of `tools/build_map.py`. Bigger areas mean longer load times.

---

## 🛣 Roadmap

This is the honest path from v0.1 toward the “better than GTA *at Lafayette*” goal. Each step is a self-contained chunk you (or an AI helper) can do one at a time.

1. **Feel**: suspension bounce, gear sounds, damage deformation, better tyre smoke and skid marks
1. **Hero assets**: ~~people~~ (done in v0.3); next, replace the procedural cars with real 3D models (e.g. made in Blender, or bought/CC-licensed glTF models). This is the single biggest step toward a GTA look
2. **Real elevation**: swap the stylized terrain for USGS 3DEP elevation data (free, public domain)
3. **Building detail**: real roof shapes from OSM `roof:shape`, more facade styles, storefront signs, Purdue limestone trims
4. **Real landmarks**: detailed models of the Purdue Memorial Union, Ross-Ade Stadium, Mackey Arena, the Engineering Fountain and the bridges' real shapes
5. **Smarter city**: ~~traffic lights~~ (done in v0.3), lane changes, buses on real CityBus routes, Purdue students between classes
6. **Story mode**: ~~Chapter 1, 12 missions~~ (done in v0.4); more chapters, cutscenes
7. ~~Melee weapons, tuning garage~~ (done in v0.4); next, buying property and Chapter 2
8. **Graphics ceiling**: SSAO, screen-space reflections, volumetric fog over the Wabash, rain (~~snow~~ done in v0.3), WebGPU renderer
9. **Bigger map**: all of Tippecanoe County, then I-65 to Indianapolis
10. **Multiplayer**: drive around Lafayette with friends (WebSockets)

---

## ⚠️ Notes

- Textures are CC0 (public domain) photo scans from [Poly Haven](https://polyhaven.com). Thank you, Poly Haven!
- People are [Microsoft Rocketbox avatars](https://github.com/microsoft/Microsoft-Rocketbox) (MIT licence, © Microsoft), converted with Blender for the web by `tools/rocketbox/` (Mixamo bone names, one mesh per part, texture-region masks for mixing outfits).
- Mocap clips come from Mixamo's X Bot in the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf).
- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Building heights that aren't in OSM are estimated, terrain is stylized, and the river valley shape is approximate.
- This is a fan project. It is **not** affiliated with or endorsed by Purdue University, the City of Lafayette or West Lafayette, Rockstar Games, or any vehicle maker. All vehicle names are made up.
- Code is MIT licensed (see `LICENSE`). Three.js is MIT licensed.
