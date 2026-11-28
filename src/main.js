// Wabash Flight: game loop, cameras, menus, touch UI.
/* global Cesium */
import { DEG, KT, FT, clamp, smooth, wrap360, wrap180, qrot, qToMat3, qmul, qaxis, destPoint, distM, bearingDeg, atmosphere } from './math.js';
import { AIRCRAFT } from './aircraft.js';
import { FlightModel, stallSpeed } from './physics.js';
import { World } from './world.js';
import { HUD } from './hud.js';
import { Controls } from './controls.js';
import { AXIS_FNS, BUTTON_FNS, devKey, defaultBindings } from './hardware.js';
import { Autopilot, FlightAssist } from './autopilot.js';
import { Sound } from './audio.js';
import { loadAirports, searchAirports, runwayEnds, findAirport, bestRunwayEnd } from './airports.js';
import { loadGeoid, geoidHeight } from './geoid.js';
import { Lights } from './lights.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ------------------------------------------------------------------ settings
const DEFAULTS = {
  aircraft: 'trainer', airport: 'KLAF', runway: 0, startMode: 'runway', dest: null,
  quality: 1, assist: 1, invert: 0, touchMode: 'auto', volume: 0.7, units: 'ft', ionToken: '', photoreal: 1,
  hour: 13, realTime: false, clouds: 1, cloudBase: 1500, windDir: 270, windKt: 6, turb: 1, haze: 3,
};
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
let S;
try { S = { ...DEFAULTS, quality: isTouch ? 1 : 2, photoreal: isTouch ? 0 : 1, ...JSON.parse(localStorage.getItem('wabashFlight') || '{}') }; } catch { S = { ...DEFAULTS }; }
const save = () => { try { localStorage.setItem('wabashFlight', JSON.stringify(S)); } catch { /* private mode */ } };

// ------------------------------------------------------------------ globals
let world, viewer, hud, controls, sound, ap, assist, lights;
let fm = null, plane = null, planeKey = null, models = {};
let paused = true, started = false, camMode = 0; // 0 chase 1 cockpit 2 flyby 3 orbit
let groundFilt = 0, spawnInfo = null, dest = null, lastT = performance.now();
let flyby = null, camHeading = 0, camRange = 1, showHUD = true, showND = true;
let crashFx = [], contrail = null, toastTimer = 0, landingTimer = 0, lastTouch = null, prevOnGround = true;
let simTime = 0, autobrake = false, lastApMsg = '';
const CAMS = ['Chase', 'Cockpit', 'Fly-by', 'Orbit'];

const tip = (keys, touch) => (touchUI ? touch : keys); // control hints for keyboard vs touch players
function toast(msg, ms = 2500) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
function loading(on, txt) { $('#loading').classList.toggle('hidden', !on); if (txt) $('#loadingTxt').textContent = txt; }

// ------------------------------------------------------------------ boot
async function boot() {
  if (!window.Cesium) { document.body.innerHTML = '<p style="padding:30px;font:16px sans-serif;color:#fff">Could not load the 3D globe engine (CesiumJS). Check your internet connection and reload.</p>'; return; }
  scratchM3 = new Cesium.Matrix3(); scratchM4 = new Cesium.Matrix4(); scratchPos = new Cesium.Cartesian3();
  loading(true, 'Loading the planet…');
  world = new World('globe', S);
  viewer = world.viewer;
  await world.init();
  if (world.ionError) toast(world.ionError, 5000);
  await Promise.all([loadAirports(), loadGeoid()]);
  hud = new HUD($('#hud')); hud.resize();
  window.addEventListener('resize', () => hud.resize());
  sound = new Sound(); sound.setVolume(S.volume);
  ap = new Autopilot(); assist = new FlightAssist();
  lights = new Lights(viewer.scene); world.excludeFromPick.push(lights.plane, lights.airport);
  S.hw = S.hw && typeof S.hw === 'object' ? S.hw : {};
  controls = new Controls(viewer.canvas, { onAction, hwStore: S.hw });
  applyWeather();
  buildMenu();
  setupTouch(); updateTouchVisibility();
  setupAPPanel();
  viewer.scene.preUpdate.addEventListener(tick);
  // pretty idle view of the start airport behind the menu
  const ap0 = findAirport(S.airport) || findAirport('KLAF');
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(ap0.lon, ap0.lat - 0.06, 2500), orientation: { heading: 0, pitch: -0.35, roll: 0 } });
  loading(false);
  showMenu(true);
}

// ------------------------------------------------------------------ models
async function getModel(key) {
  if (models[key]) return models[key];
  const m = await Cesium.Model.fromGltfAsync({
    url: AIRCRAFT[key].model, forwardAxis: Cesium.Axis.X, shadows: Cesium.ShadowMode.ENABLED,
    minimumPixelSize: 24, maximumScale: 400, backFaceCulling: false,
  });
  m.show = false;
  // hinged control surfaces (made by tools/build_models.py): node -> hinge axis, direction, travel and input
  try { const r = await fetch(AIRCRAFT[key].model.replace('.glb', '.anim.json')); m.anim = r.ok ? (await r.json()).nodes : {}; } catch { m.anim = {}; }
  viewer.scene.primitives.add(m);
  world.excludeFromPick.push(m);
  models[key] = m;
  await new Promise((res) => { if (m.ready) res(); else m.readyEvent.addEventListener(res); });
  return m;
}

// ------------------------------------------------------------------ spawning
let starting = false;
async function startFlight() {
  if (starting) return;
  starting = true;
  try { await startFlightInner(); } catch (e) { console.error(e); toast('Could not start the flight: ' + e.message, 6000); loading(false); showMenu(true); }
  finally { starting = false; }
}
async function startFlightInner() {
  started = false; // stop the previous flight from moving the camera while the new scenery loads
  showMenu(false);
  sound.start(AIRCRAFT[S.aircraft].engine);
  loading(true, 'Loading scenery…');
  paused = true;
  const def = AIRCRAFT[S.aircraft];
  for (const k in models) models[k].show = false;
  plane = await getModel(S.aircraft);
  planeKey = S.aircraft;
  lights.setAircraft(def);
  fm = new FlightModel(def);
  ap.disengage(); ap.msg = ''; lastApMsg = ''; autobrake = false; ap.landed = false; assist = new FlightAssist();
  controls.throttle = 0; crashFx.forEach((p) => viewer.scene.primitives.remove(p)); crashFx = [];
  $('#landing').classList.add('hidden');
  setDestination(S.dest ? findAirport(S.dest) : null, true);

  // where?
  let lat, lon, hdg = 0, mode = S.startMode, elevGuess = 0, ap0 = null, rwy = null;
  if (mode === 'place') {
    if (!S.place) { mode = 'runway'; } else { lat = S.place.lat; lon = S.place.lon; hdg = 0; }
  }
  if (mode !== 'place') {
    ap0 = findAirport(S.airport) || findAirport('KLAF');
    const ends = runwayEnds(ap0);
    rwy = ends[clamp(S.runway, 0, ends.length - 1)] || ends[0];
    hdg = bearingDeg(rwy.lat, rwy.lon, rwy.far.lat, rwy.far.lon);
    elevGuess = ap0.elevFt * FT + geoidHeight(rwy.lat, rwy.lon); // field elevation is above sea level, the globe uses the ellipsoid
    if (mode === 'runway') {
      const len = distM(rwy.lat, rwy.lon, rwy.far.lat, rwy.far.lon);
      [lat, lon] = destPoint(rwy.lat, rwy.lon, hdg, Math.min(70, len * 0.05));
    } else if (mode === 'approach') {
      const dist = def.engine === 'prop' ? 5500 : 12000;
      [lat, lon] = destPoint(rwy.lat, rwy.lon, hdg + 180, dist);
      setDestination(ap0, true, rwy); // the approach is to this runway
    } else { // cruise: 20 km out from the airport, flying toward it
      [lat, lon] = destPoint(rwy.lat, rwy.lon, hdg + 180, 25000);
    }
  }
  spawnInfo = { mode, lat, lon, hdg, ap: ap0, rwy };
  // fly the camera there and wait for terrain to load
  plane.show = false;
  const camAlt = (mode === 'runway' ? 120 : mode === 'approach' ? 600 : 2500) + elevGuess;
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, camAlt), orientation: { heading: hdg * DEG, pitch: -0.6, roll: 0 } });
  const t0 = performance.now();
  let h;
  await new Promise((res) => {
    const poll = () => {
      h = world.groundHeight(lat, lon, undefined);
      const waited = performance.now() - t0;
      $('#loadingTxt').textContent = `Loading scenery… ${Math.round(waited / 1000)}s`;
      if ((h !== undefined && world.tilesReady() && waited > 1200) || waited > 25000) res(); else setTimeout(poll, 150);
    };
    poll();
  });
  if (h === undefined) h = elevGuess;
  // for runway starts, trust the terrain under the threshold but sanity check against the airport elevation
  if (mode !== 'place' && Math.abs(h - elevGuess) > 150 && !world.tileset) h = elevGuess;
  fm.groundH = groundFilt = h;
  const c = fm.ctrl;
  c.gearDown = true; c.parking = false; c.burner = false; c.spoilers = 0; c.trim = 0; c.reverse = false;
  if (mode === 'runway') {
    c.flaps = def.takeoffFlaps ?? 1; c.throttle = 0;
    fm.reset(lat, lon, h + fm.restHeight, hdg, 0, 0);
    toast(`${ap0.icao} runway ${rwy.ident}: ${tip('full throttle (hold R or press Home)', 'slide the throttle all the way up')}, then at ${Math.round(def.vr / KT)} kt ${tip('gently hold S', 'gently pull the stick down')} to lift off`, 6000);
  } else if (mode === 'approach') {
    const dist = distM(lat, lon, rwy.lat, rwy.lon);
    c.flaps = def.approachFlaps; c.gearDown = true;
    const spd = def.vref + 10 * KT;
    // on the 3 degree glide path to the runway (its elevation, not the ground under us)
    const rwyH = dest && dest.icao === ap0.icao ? dest.elevM : elevGuess;
    fm.spawnAir(lat, lon, Math.max(rwyH + fm.restHeight + Math.tan(3 * DEG) * (dist + 300), h + 150), hdg, spd, -3);
    c.throttle = fm.throttleFor(spd, -3); controls.throttle = c.throttle; fm.N = c.throttle;
    toast(`Final approach to ${ap0.icao} runway ${rwy.ident}. Follow the pink diamonds, or press APP on the autopilot.`, 6000);
  } else {
    const sc = def.spawnCruise;
    c.flaps = 0; c.gearDown = false;
    // never start inside a mountain: clear the highest terrain around us and along the way by 1,000 ft
    const pts = [[lat, lon]];
    for (let b = 0; b < 360; b += 45) for (const r of [3000, 8000]) pts.push(destPoint(lat, lon, b, r));
    for (let r = 2000; r <= 30000; r += 2000) pts.push(destPoint(lat, lon, hdg, r));
    const hiTerrain = await world.terrainMax(pts);
    let alt = Math.max(h + sc.alt * (mode === 'place' ? 0.6 : 1), h + 600, (hiTerrain ?? -1e9) + 300);
    fm.spawnAir(lat, lon, alt, hdg, sc.spd, 0);
    c.throttle = fm.throttleFor(sc.spd, 0); controls.throttle = c.throttle; fm.N = c.throttle;
    fm.geoidN = geoidHeight(lat, lon); ap.engage(fm); ap.alt = Math.round((alt - fm.geoidN) / FT / 100) * 100 * FT; ap.spd = sc.spd * Math.sqrt(atmosphere(alt).sigma); ap.vMode = 'ALT';
    toast(`Autopilot is holding altitude. ${tip('Press Z', 'Move the stick')} to take control.`, 5000);
  }
  if (mode === 'place') toast(`Flying over ${S.place.name.split(',')[0]}. Autopilot on: ${tip('press Z', 'move the stick')} to take over.`, 5000);
  fm.gearPos = c.gearDown ? 1 : 0;
  fm.flapPos = def.flaps.length > 1 ? c.flaps / (def.flaps.length - 1) : 0;
  controls.throttle = c.throttle;
  fm.wind = windVec(); fm.turbulence = [0, 0.6, 1.6, 3.2][S.turb];
  camHeading = hdg; flyby = null; prevOnGround = fm.onGround; lastTouch = null;
  plane.show = camMode !== 1;
  setupContrail();
  world.updateClouds(lat, lon, h, S.clouds, S.cloudBase, true);
  if (!S.realTime) world.setTime(S.hour, lon);
  started = true; paused = false; lastT = performance.now();
  loading(false);
  updateTouchVisibility();
}

function windVec() {
  const from = S.windDir * DEG, s = S.windKt * KT;
  return [-Math.sin(from) * s, -Math.cos(from) * s, 0];
}

function setDestination(airport, silent, rwyEnd) {
  dest = null;
  if (!airport) { S.dest = null; return; }
  const e = rwyEnd || bestRunwayEnd(airport, S.windKt > 3 ? S.windDir : null);
  if (!e) return;
  dest = { icao: airport.icao, ident: e.ident, lat: e.lat, lon: e.lon, hdg: bearingDeg(e.lat, e.lon, e.far.lat, e.far.lon), elevM: airport.elevFt * FT + geoidHeight(e.lat, e.lon), name: airport.name };
  ap.target = dest;
  if (!silent) toast(`Destination: ${airport.name} runway ${e.ident}`);
}

// ------------------------------------------------------------------ main loop
function tick() {
  const now = performance.now();
  let dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  if (!started || !fm) return;
  if (!paused) governor(dt);
  const t0 = performance.now();
  simUpdate(dt);
  const t1 = performance.now();
  updatePlane(dt);
  updateCamera(dt);
  const t2 = performance.now();
  updateHUD(dt);
  lights.updateAirports(fm.latDeg, fm.lonDeg, now, fm.h, fm.latDeg, fm.lonDeg);
  const t3 = performance.now();
  // frame-time readout (press the ` key): sim, model+camera, instruments, and the whole frame
  const P = perf; P.n++; P.sim += t1 - t0; P.cam += t2 - t1; P.hud += t3 - t2; P.frame += dt * 1000;
  if (P.n >= 30) { P.last = { fps: 1000 / (P.frame / P.n), sim: P.sim / P.n, cam: P.cam / P.n, hud: P.hud / P.n }; P.n = P.sim = P.cam = P.hud = P.frame = 0; if (P.show) $('#perf').textContent = `${P.last.fps.toFixed(0)} fps · sim ${P.last.sim.toFixed(2)} ms · camera ${P.last.cam.toFixed(2)} ms · instruments ${P.last.hud.toFixed(2)} ms`; }
  if (Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000)) {
    world.updateClouds(fm.latDeg, fm.lonDeg, groundFilt, S.clouds, S.cloudBase, false);
    world.probeTerrain(fm.latDeg, fm.lonDeg);
    lights.updateDaylight(Cesium.JulianDate.toDate(viewer.clock.currentTime), fm.latDeg, fm.lonDeg);
    world.setDaylight(1 - lights.night);
    lights.refinePapi((la, lo) => world.groundHeight(la, lo, undefined));
    // once the runway's scenery has loaded, use its real height for the glide path (field elevation is only a guess)
    if (dest && !dest.measured && distM(fm.latDeg, fm.lonDeg, dest.lat, dest.lon) < 9000) {
      const th = world.groundHeight(dest.lat, dest.lon, undefined);
      if (th !== undefined && Math.abs(th - dest.elevM) < 60) { dest.elevM = th; dest.measured = true; }
    }
  }
  sound.update({
    N: fm.N, V: fm.out.V || 0, onGround: fm.onGround, groundSpeed: fm.groundSpeed, burner: fm.ctrl.burner && fm.N > 0.5,
    stall: !fm.onGround && ((fm.out.stallMix || 0) > 0.25 || (fm.out.stallWarn || 0) > 0.6) && !fm.crashed, warning: !!warnText && !fm.crashed, inside: camMode === 1, paused: paused || fm.crashed,
  });
}

function simUpdate(dt) {
  const def = fm.def;
  // input
  const stick = controls.update(dt, S.invert === 1);
  // moving a real throttle lever takes the throttle back from the autothrottle
  if (controls.hwIn.throttleMoved && ap.on && ap.athr) { ap.athr = false; toast('Autothrottle off: you moved the throttle', 2500); }
  if (!paused && !fm.crashed) {
    simTime += dt;
    const c = fm.ctrl;
    const a = assist.apply(fm, stick, dt, S.assist === 1);
    let elev = a.elev, ail = a.ail, rud = a.rud;
    if (a.trim !== null && S.assist === 1) c.trim = a.trim;
    if (controls.trim) {
      // Assisted: the trim keys raise/lower the climb angle the auto-trim holds. Realistic: real elevator trim.
      if (S.assist === 1 && !fm.onGround && assist.holdGamma !== null) assist.holdGamma = clamp(assist.holdGamma + controls.trim * dt * 2 * DEG, -10 * DEG, 15 * DEG);
      else c.trim = clamp(c.trim + controls.trim * dt * 0.15, -0.6, 0.6);
    }
    if (ap.on) {
      if (Math.abs(stick.x) > 0.5 || Math.abs(stick.y) > 0.5) { ap.disengage('Autopilot disconnected'); toast('Autopilot disconnected'); }
      else {
        const o = ap.fly(fm, dt);
        if (o) {
          elev = o.elev + stick.y * 0.2; ail = o.ail; if (o.rud !== undefined) rud = o.rud; c.trim = 0;
          if (o.throttle !== null) controls.throttle = o.throttle;
          if (o.rollout) { c.spoilers = o.spoilers; c.reverse = !!o.reverse; autobrake = true; }
        } else { toast(ap.msg, 3500); if (ap.landed) { autobrake = true; controls.throttle = 0; c.reverse = false; } }
        if (ap.on && ap.terrain && !simUpdate.terr) toast('Autopilot: too close to the ground, climbing', 3000);
        simUpdate.terr = ap.on && ap.terrain;
        if (ap.on && ap.msg && ap.msg !== lastApMsg) { toast(ap.msg, 3500); }
        lastApMsg = ap.msg;
        if (ap.on && !fm.onGround && (fm.out.stallMix || 0) > 0.4) { ap.disengage('Autopilot off: stall!'); toast('Autopilot off: stall!'); }
      }
    }
    c.elev = clamp(elev, -1, 1); c.ail = clamp(ail, -1, 1); c.rud = clamp(rud, -1, 1);
    if (c.reverse && !fm.onGround) c.reverse = false; // reversers stow in the air
    c.throttle = controls.throttle;
    if (autobrake && !ap.rollout && (fm.groundSpeed < 2 || controls.throttle > 0.3 || !fm.onGround)) autobrake = false;
    if (!ap.rollout && ap.landed && c.spoilers && fm.groundSpeed < 2) c.spoilers = 0;
    c.brake = Math.max(controls.brake, touchBrake ? 1 : 0, autobrake ? 0.6 : 0);
    c.brakeL = controls.brakeL || 0; c.brakeR = controls.brakeR || 0;
    // terrain under us
    const raw = world.groundHeight(fm.latDeg, fm.lonDeg, groundFilt);
    groundFilt = fm.onGround ? smooth(groundFilt, raw, 1.5, dt) : (fm.h - raw < 60 ? smooth(groundFilt, raw, 8, dt) : raw);
    fm.groundH = groundFilt;
    fm.wind = windVec();
    fm.geoidN = geoidHeight(fm.latDeg, fm.lonDeg);
    fm.step(dt);
    events(dt);
  }
}

// keep it smooth on any hardware: if the frame rate stays under ~24 fps, step the graphics down
// (render resolution, then shadows, then terrain detail) until it recovers. Off when you pick a quality by hand.
const gov = { ema: 1 / 60, slowT: 0, step: 0 };
function governor(dt) {
  if (S.autoQuality === false || document.hidden || simTime < 8) return;
  gov.ema += (dt - gov.ema) * 0.05;
  gov.slowT = gov.ema > 1 / 24 ? gov.slowT + dt : 0;
  if (gov.slowT < 4 || gov.step >= 5) return;
  gov.slowT = 0; gov.step++;
  const v = viewer, sc = v.scene;
  if (gov.step <= 2) v.resolutionScale = Math.max(0.5, v.resolutionScale * 0.8);
  else if (gov.step === 3) { v.shadows = false; sc.globe.shadows = Cesium.ShadowMode.DISABLED; v.scene.highDynamicRange = false; }
  else { sc.globe.maximumScreenSpaceError *= 1.5; if (world.tileset) world.tileset.maximumScreenSpaceError *= 1.5; }
  toast('Lowered the graphics a little to keep it smooth', 2500);
}

const perf = { n: 0, sim: 0, cam: 0, hud: 0, frame: 0, show: false, last: null };
let warnText = '';
function events(dt) {
  const def = fm.def, o = fm.out;
  // touchdown rating
  if (fm.touchdown && fm.touchdown !== lastTouch) {
    lastTouch = fm.touchdown;
    const td = fm.touchdown;
    if (simTime > 3 && td.fpm < -20) {
      sound.thump(Math.min(1, -td.fpm / 700));
      showLanding(td);
    }
  }
  if (fm.crashed && !crashFx.length) { crashEffects(); const w0 = $('#warn'); w0.textContent = ''; w0.classList.remove('blink'); }
  // warnings
  const agl = fm.h - fm.groundH;
  const ias = (o.V || 0) * Math.sqrt((o.rho || 1.225) / 1.225);
  warnText = '';
  if (!fm.onGround) {
    if ((o.stallMix || 0) > 0.25 || (o.stallWarn || 0) > 0.6) warnText = 'STALL';
    else if (ias > def.vne || o.mach > def.mmo) warnText = 'OVERSPEED';
    else if (fm.flapPos > 0.05 && ias > def.vfe + 5 * KT) warnText = 'FLAPS OVERSPEED';
    else if (agl < 450 && fm.vs < -Math.max(8, agl / 9) && !(dest && distM(fm.latDeg, fm.lonDeg, dest.lat, dest.lon) < 3000 && fm.vs > -12)) warnText = 'PULL UP';
    else if (agl < 150 && !fm.ctrl.gearDown && def.retractable && fm.vs < -1) warnText = 'GEAR!';
    else if (Math.abs(fm.hpr.roll) > 70 && def.gLimit < 6) warnText = 'BANK ANGLE';
  }
  const w = $('#warn');
  if (w.textContent !== warnText) { w.textContent = warnText; w.classList.toggle('blink', !!warnText); }
  // gear sound on rollout
  prevOnGround = fm.onGround;
}

function showLanding(td) {
  const fpm = Math.abs(td.fpm);
  let grade, word;
  if (fpm < 120) { grade = 'S'; word = 'Butter!'; }
  else if (fpm < 240) { grade = 'A'; word = 'Smooth landing'; }
  else if (fpm < 420) { grade = 'B'; word = 'Good landing'; }
  else if (fpm < 650) { grade = 'C'; word = 'Firm landing'; }
  else { grade = 'D'; word = 'Hard landing!'; }
  let rwyTxt = '';
  const near = dest || (spawnInfo && spawnInfo.rwy ? { lat: spawnInfo.rwy.lat, lon: spawnInfo.rwy.lon, hdg: spawnInfo.hdg } : null);
  if (near) {
    const d = distM(near.lat, near.lon, fm.latDeg, fm.lonDeg), b = bearingDeg(near.lat, near.lon, fm.latDeg, fm.lonDeg);
    const along = d * Math.cos((b - near.hdg) * DEG), xt = d * Math.sin((b - near.hdg) * DEG);
    if (Math.abs(xt) < 200 && along > -200 && along < 5000) rwyTxt = `<tr><td>Centre line</td><td>${Math.abs(xt).toFixed(1)} m ${xt > 0 ? 'right' : 'left'}</td></tr><tr><td>From threshold</td><td>${Math.round(along)} m</td></tr>`;
  }
  const el = $('#landing');
  el.innerHTML = `<div class="grade">${grade}</div><h2>${word}</h2><table>
    <tr><td>Vertical speed</td><td>${Math.round(td.fpm)} ft/min</td></tr>
    <tr><td>Speed</td><td>${Math.round(td.speed / KT)} kt</td></tr>
    <tr><td>Pitch / bank</td><td>${td.pitch.toFixed(1)}° / ${td.roll.toFixed(1)}°</td></tr>${rwyTxt}</table>`;
  el.classList.remove('hidden');
  clearTimeout(landingTimer); landingTimer = setTimeout(() => el.classList.add('hidden'), 7000);
}

// ------------------------------------------------------------------ effects
function particleImage(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
}
function crashEffects() {
  sound.boom();
  const pos = Cesium.Cartesian3.fromRadians(fm.lon, fm.lat, fm.h);
  const mm = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
  const fire = new Cesium.ParticleSystem({
    image: particleImage('rgba(255,230,120,1)', 'rgba(255,80,0,0)'), startColor: Cesium.Color.WHITE, endColor: Cesium.Color.ORANGE.withAlpha(0),
    startScale: 2, endScale: 6, minimumParticleLife: 0.6, maximumParticleLife: 1.6, minimumSpeed: 4, maximumSpeed: 12,
    imageSize: new Cesium.Cartesian2(6, 6), emissionRate: 60, emitter: new Cesium.ConeEmitter(40 * DEG), modelMatrix: mm, lifetime: 30,
  });
  const smoke = new Cesium.ParticleSystem({
    image: particleImage('rgba(60,60,60,0.9)', 'rgba(30,30,30,0)'), startColor: Cesium.Color.WHITE.withAlpha(0.8), endColor: Cesium.Color.WHITE.withAlpha(0),
    startScale: 3, endScale: 25, minimumParticleLife: 4, maximumParticleLife: 9, minimumSpeed: 6, maximumSpeed: 14,
    imageSize: new Cesium.Cartesian2(10, 10), emissionRate: 25, emitter: new Cesium.ConeEmitter(20 * DEG), modelMatrix: mm, lifetime: 60,
  });
  crashFx = [viewer.scene.primitives.add(fire), viewer.scene.primitives.add(smoke)];
  $('#landing').innerHTML = `<div class="grade" style="color:var(--bad)">CRASH</div><h2>${fm.crashReason}</h2>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:10px"><button class="big" id="retry">Try again</button><button class="ghost" id="crashMenu">Menu</button></div>`;
  $('#landing').classList.remove('hidden');
  clearTimeout(landingTimer);
  $('#retry').onclick = () => startFlight();
  $('#crashMenu').onclick = () => showMenu(true);
}
function setupContrail() {
  // thin trails from each engine (they appear behind the aircraft, like real condensation trails)
  for (const c of contrail || []) viewer.scene.primitives.remove(c);
  contrail = [];
  const d = fm.def;
  if (d.engine !== 'jet') return;
  const tailX = Math.min(...d.body.map((p) => p[0]));
  const spots = d.engines === 2 ? [[2.0, 5.75, -1.7], [2.0, -5.75, -1.7]] : [[tailX - 1, 0, 0.1]];
  for (const sp of spots) {
    contrail.push(viewer.scene.primitives.add(new Cesium.ParticleSystem({
      image: particleImage('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), startColor: Cesium.Color.WHITE.withAlpha(0.32), endColor: Cesium.Color.WHITE.withAlpha(0),
      startScale: 0.6, endScale: 5, minimumParticleLife: 10, maximumParticleLife: 16, speed: 0.2, imageSize: new Cesium.Cartesian2(2.5, 2.5),
      emissionRate: 0, emitter: new Cesium.CircleEmitter(0.2), sizeInMeters: true, modelMatrix: Cesium.Matrix4.IDENTITY.clone(),
      emitterModelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(sp[0] - 40, sp[1], sp[2])), // body frame (x fwd, y left, z up)
    })));
  }
}

// ------------------------------------------------------------------ aircraft model + camera
let scratchM3, scratchM4, scratchPos; // created in boot(), once Cesium has loaded
let propAngle = 0;
function planeMatrix() {
  const pos = Cesium.Cartesian3.fromRadians(fm.lon, fm.lat, fm.h, undefined, scratchPos);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos, undefined, scratchM4);
  const rot = Cesium.Matrix3.fromArray(qToMat3(fm.q), 0, scratchM3);
  return Cesium.Matrix4.multiplyByMatrix3(enu, rot, new Cesium.Matrix4());
}
function updatePlane(dt) {
  if (!plane) return;
  const m = planeMatrix();
  plane.modelMatrix = m;
  lights.updateAircraft(fm, null, m, simTime, true);
  plane.show = camMode !== 1 && !fm.crashed;
  // propeller
  const prop = plane.getNode && plane.getNode('prop');
  if (prop) {
    propAngle += (8 + fm.N * 40) * dt * (fm.crashed ? 0 : 1);
    prop.matrix = Cesium.Matrix4.multiply(prop.originalMatrix, Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromRotationX(propAngle)), new Cesium.Matrix4());
  }
  // control surfaces follow the controls: ailerons, elevators, rudder, flaps, spoilers
  if (plane.anim) {
    const c = fm.ctrl, ail = c.ail, elev = clamp(c.elev + c.trim, -1, 1), rud = c.rud, flap = fm.flapPos, spl = fm.spoilerPos;
    for (const [name, a] of Object.entries(plane.anim)) {
      const node = plane.getNode(name);
      if (!node) continue;
      const inp = { ail, elev, rud, flap, spoiler: spl, flaperonL: ail + flap * (a.flapMax || 0) / a.max, flaperonR: -ail + flap * (a.flapMax || 0) / a.max }[a.input] || 0;
      const ang = a.sign * a.max * DEG * clamp(inp, -1.5, 1.5);
      if (!a._ax) a._ax = new Cesium.Cartesian3(...a.axis);
      if (a._last !== undefined && Math.abs(a._last - ang) < 1e-4) continue;
      a._last = ang;
      const rot = Cesium.Matrix3.fromQuaternion(Cesium.Quaternion.fromAxisAngle(a._ax, ang));
      node.matrix = Cesium.Matrix4.multiply(node.originalMatrix, Cesium.Matrix4.fromRotationTranslation(rot), new Cesium.Matrix4());
    }
  }
  const gear = plane.getNode && plane.getNode('gear');
  if (gear) gear.show = fm.gearPos > 0.5;
  const burner = plane.getNode && plane.getNode('burner');
  if (burner) burner.show = fm.ctrl.burner && fm.N > 0.5 && !fm.crashed;
  for (const c of contrail || []) {
    c.modelMatrix = m;
    c.emissionRate = fm.h > 7800 && !fm.crashed && !paused && camMode !== 1 ? 90 : 0;
  }
}

function updateCamera(dt) {
  const cam = viewer.camera, def = fm.def, o = fm.hpr, look = controls.look;
  const pos = Cesium.Cartesian3.fromRadians(fm.lon, fm.lat, fm.h);
  if (camMode === 1) {
    // cockpit: eye point, looking along the nose (plus mouse look)
    const eyeEnu = qrot(fm.q, def.eye);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
    let q = qmul(fm.q, qaxis([0, 0, 1], -look.yaw * DEG));
    q = qmul(q, qaxis([0, 1, 0], -(look.pitch - 4) * DEG));
    const f = qrot(q, [1, 0, 0]), u = qrot(q, [0, 0, 1]);
    const toW = (v) => Cesium.Matrix4.multiplyByPointAsVector(enu, new Cesium.Cartesian3(v[0], v[1], v[2]), new Cesium.Cartesian3());
    const eye = Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(...eyeEnu), new Cesium.Cartesian3());
    cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
    cam.setView({ destination: eye, orientation: { direction: Cesium.Cartesian3.normalize(toW(f), new Cesium.Cartesian3()), up: Cesium.Cartesian3.normalize(toW(u), new Cesium.Cartesian3()) } });
    cam.frustum.fov = 70 * DEG / clamp(look.zoom, 0.5, 2);
    return;
  }
  cam.frustum.fov = 60 * DEG;
  if (camMode === 2) {
    // fly-by: stand beside the flight path and watch it go past
    const gs = Math.max(fm.groundSpeed, 20);
    const need = !flyby || distM(flyby.lat, flyby.lon, fm.latDeg, fm.lonDeg) > Math.max(600, gs * 9);
    if (need) {
      const ahead = destPoint(fm.latDeg, fm.lonDeg, fm.track, gs * 4.5);
      const side = destPoint(ahead[0], ahead[1], fm.track + 90, 25 + def.b * 2);
      const gh = world.groundHeight(side[0], side[1], groundFilt);
      flyby = { lat: side[0], lon: side[1], h: Math.max(gh + 2, fm.h - 15 - Math.random() * 20) };
    }
    const from = Cesium.Cartesian3.fromDegrees(flyby.lon, flyby.lat, flyby.h);
    const dir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(pos, from, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(from, new Cesium.Cartesian3());
    cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
    const right = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(dir, up, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    cam.setView({ destination: from, orientation: { direction: dir, up: Cesium.Cartesian3.cross(right, dir, new Cesium.Cartesian3()) } });
    cam.frustum.fov = clamp(2 * Math.atan((def.b * 2.2) / Math.max(10, Cesium.Cartesian3.distance(from, pos))), 4 * DEG, 60 * DEG);
    return;
  }
  // chase (follows heading smoothly) or orbit (free)
  if (camMode === 0) camHeading = wrap360(camHeading + wrap180(o.heading - camHeading) * (1 - Math.exp(-3 * dt)));
  const range = def.cam.dist * look.zoom * (camMode === 3 ? 1.6 : 1);
  let pitch = (camMode === 0 ? -8 - (def.cam.height / def.cam.dist) * 30 : -20) + look.pitch;
  // never put the camera underground
  const agl = fm.h - groundFilt;
  const maxUp = Math.asin(clamp((agl - 2) / range, -1, 1)) / DEG;
  pitch = Math.min(pitch, maxUp);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
  cam.lookAtTransform(enu, new Cesium.HeadingPitchRange((camHeading + look.yaw) * DEG, pitch * DEG, range));
}

// ------------------------------------------------------------------ HUD + status chips
let statusT = 0;
function updateHUD(dt) {
  const o = fm.out, hpr = fm.hpr, def = fm.def;
  const sigma = (o.rho || 1.225) / 1.225, V = o.V || 0, ias = V * Math.sqrt(sigma);
  const unitsM = S.units === 'm';
  const prevIas = updateHUD.prev ?? ias; updateHUD.prev = smooth(prevIas, ias, 4, dt);
  const gamma = Math.atan2(fm.vs, Math.max(fm.groundSpeed, 1)) / DEG;
  if (!def._vs) def._vs = [stallSpeed(def, 0) / KT, stallSpeed(def, 1) / KT];
  const [vs1, vs0] = def._vs;
  const windFrom = S.windDir, windKt = S.windKt;
  hud.draw({
    show: showHUD && !paused, cockpit: camMode === 1, showND, touch: touchUI,
    pitch: hpr.pitch, roll: hpr.roll, heading: hpr.heading, track: fm.groundSpeed > 3 ? fm.track : hpr.heading,
    gamma: fm.groundSpeed > 3 ? gamma : hpr.pitch, drift: fm.groundSpeed > 3 ? wrap180(fm.track - hpr.heading) : 0, airborne: !fm.onGround,
    ias: unitsM ? ias * 3.6 : ias / KT, altFt: unitsM ? fm.h - (fm.geoidN || 0) : (fm.h - (fm.geoidN || 0)) / FT, vsFpm: unitsM ? fm.vs : fm.vs / FT * 60, agl: (fm.h - fm.groundH - fm.restHeight) / FT,
    mach: o.mach || 0, machShow: (o.mach || 0) > 0.4, g: o.nz || 1, trend: ((ias - prevIas) / Math.max(dt, 1e-3)) * 10 / KT * (unitsM ? 1.852 : 1) * 0.1,
    vs1: unitsM ? vs1 * 1.852 : vs1, vs0: unitsM ? vs0 * 1.852 : vs0, vfe: (def.vfe / KT) * (unitsM ? 1.852 : 1), vne: (def.vne / KT) * (unitsM ? 1.852 : 1),
    apOn: ap.on, athr: ap.on && ap.athr, apLat: ap.hdgMode, apVert: ap.hdgMode === 'APP' ? 'G/S' : ap.vMode,
    spdBug: ap.on ? (ap.spd / KT) * (unitsM ? 1.852 : 1) : null, altBug: ap.on ? (unitsM ? ap.alt : ap.alt / FT) : null, hdgBug: ap.on && ap.hdgMode === 'HDG' ? ap.hdg : null,
    app: dest && (ap.hdgMode === 'APP' || distM(fm.latDeg, fm.lonDeg, dest.lat, dest.lon) < 25000) ? approachInfo() : null,
    unitsM, assist: S.assist === 1, lat: fm.latDeg, lon: fm.lonDeg, t: simTime, dest,
    gsKt: fm.groundSpeed / KT, tasKt: V / KT, windFrom, windKt,
  });
  statusT -= dt;
  if (statusT > 0) return;
  statusT = 0.15;
  const c = fm.ctrl, flapsDeg = def.flaps[c.flaps];
  const thrPct = Math.round(c.throttle * 100);
  const chips = [
    `<span class="chip"><b>${def.name}</b></span>`,
    `<span class="chip">THR ${thrPct}%<span class="thrbar"><i style="width:${thrPct}%"></i></span>${c.burner ? ' <b>A/B</b>' : ''}${c.reverse ? ' <b>REV</b>' : ''}</span>`,
    `<span class="chip ${c.flaps ? 'warn' : ''}">FLAPS ${flapsDeg}°</span>`,
    def.retractable ? `<span class="chip ${fm.gearPos > 0.99 ? 'on' : fm.gearPos > 0.01 ? 'warn' : ''}">GEAR ${fm.gearPos > 0.99 ? 'DOWN' : fm.gearPos > 0.01 ? 'MOVING' : 'UP'}</span>` : '',
    c.parking ? '<span class="chip bad">PARK BRAKE</span>' : c.brake ? '<span class="chip warn">BRAKES</span>' : '',
    c.spoilers ? '<span class="chip warn">SPOILERS</span>' : '',
    Math.abs(c.trim) > 0.02 ? `<span class="chip">TRIM ${c.trim > 0 ? '▲' : '▼'}${Math.round(Math.abs(c.trim) * 100)}</span>` : '',
    `<span class="chip">${CAMS[camMode]}</span>`,
    paused ? '<span class="chip bad">PAUSED</span>' : '',
  ];
  $('#status').innerHTML = chips.join('');
  $('#btnAP').classList.toggle('on', ap.on);
  if (!$('#ap').classList.contains('hidden')) refreshAP();
  if (touchUI) { $('#thr i').style.height = `calc(${thrPct}% - 8px)`; $('#thr span').textContent = thrPct + '%'; }
}
function approachInfo() {
  if (!dest) return null;
  const d = distM(fm.latDeg, fm.lonDeg, dest.lat, dest.lon), b = bearingDeg(fm.latDeg, fm.lonDeg, dest.lat, dest.lon);
  const off = wrap180(b - dest.hdg);
  if (Math.abs(off) > 60) return null;
  const along = d * Math.cos(off * DEG) + 300;
  return { xtk: d * Math.sin(off * DEG), gsErr: fm.h - fm.restHeight - (dest.elevM + Math.tan(3 * DEG) * along) };
}

// ------------------------------------------------------------------ actions
function onAction(a, pad) {
  if (a === 'gamepad' || a === 'gamepadOff') {
    const name = pad ? pad.id.replace(/\(.*?\)/g, '').replace(/[0-9a-f]{4}-[0-9a-f]{4}-/i, '').trim().slice(0, 40) : 'Controller';
    toast(a === 'gamepad' ? `${name || 'Controller'} connected (set it up in Settings)` : `${name || 'Controller'} disconnected`, 3000);
    hwUI.dirty = true; return;
  }
  if (!fm || !started) { if (a === 'menu') showMenu(true); return; }
  const c = fm.ctrl, def = fm.def, nF = def.flaps.length - 1;
  switch (a) {
    case 'gear':
      if (!def.retractable) { toast('This plane has fixed landing gear'); break; }
      if (fm.onGround && c.gearDown) { toast("Can't raise the gear on the ground"); break; }
      c.gearDown = !c.gearDown; toast(c.gearDown ? 'Gear down' : 'Gear up', 1200); break;
    case 'flapsDown': c.flaps = Math.min(nF, c.flaps + 1); toast(`Flaps ${def.flaps[c.flaps]}°`, 1000); break;
    case 'flapsUp': c.flaps = Math.max(0, c.flaps - 1); toast(`Flaps ${def.flaps[c.flaps]}°`, 1000); break;
    case 'flapsCycle': c.flaps = c.flaps >= nF ? 0 : c.flaps + 1; toast(`Flaps ${def.flaps[c.flaps]}°`, 1000); break;
    case 'spoilers': if (!def.spoilerCD) { toast('No spoilers on this plane'); break; } c.spoilers = c.spoilers ? 0 : 1; break;
    case 'parking': c.parking = !c.parking; toast(c.parking ? 'Parking brake set' : 'Parking brake released', 1200); break;
    case 'burner': if (!def.afterburner) { toast('Only the fighter has an afterburner'); break; } c.burner = !c.burner; toast(c.burner ? 'Afterburner ON' : 'Afterburner off', 1200); break;
    case 'reverse':
      if (!def.reverse) { toast('No reverse thrust on this plane'); break; }
      if (!fm.onGround && !c.reverse) { toast('Reverse thrust works on the ground only'); break; }
      c.reverse = !c.reverse; toast(c.reverse ? 'Reverse thrust: throttle up to slow down' : 'Reversers stowed', 1500); break;
    case 'camera': setCam((camMode + 1) % 4); break;
    case 'cam1': setCam(0); break; case 'cam2': setCam(1); break; case 'cam3': setCam(2); break; case 'cam4': setCam(3); break;
    case 'autopilot': toggleAP(); break;
    case 'pause': paused = !paused; toast(paused ? 'Paused (P)' : 'Resumed', 1000); break;
    case 'menu': showMenu($('#menu').classList.contains('hidden')); break;
    case 'help': showMenu(true, 'help'); break;
    case 'map': showND = !showND; break;
    case 'hud': showHUD = !showHUD; break;
    case 'idle': controls.throttle = 0; break;
    case 'full': controls.throttle = 1; break;
    case 'restart': startFlight(); break;
    case 'trimUp': c.trim = clamp(c.trim + 0.03, -0.6, 0.6); break;
    case 'trimDown': c.trim = clamp(c.trim - 0.03, -0.6, 0.6); break;
    case 'gamepad': break;
    case 'perf': perf.show = !perf.show; $('#perf').classList.toggle('hidden', !perf.show); break;
  }
}
function setCam(m) { camMode = m; controls.look.yaw = 0; controls.look.pitch = 0; controls.look.zoom = 1; flyby = null; toast(`Camera: ${CAMS[m]}`, 900); }
function toggleAP() {
  if (ap.on) { ap.disengage(); toast('Autopilot off'); }
  else if (fm.onGround) toast('Take off first, then engage the autopilot');
  else { ap.engage(fm); toast('Autopilot on: holding heading and altitude'); }
}

// ------------------------------------------------------------------ autopilot panel
function setupAPPanel() {
  $('#btnAP').onclick = () => $('#ap').classList.toggle('hidden');
  $('#btnCam').onclick = () => onAction('camera');
  $('#btnMenu').onclick = () => onAction('menu');
  $('#apMaster').onclick = () => toggleAP();
  for (const b of $$('#ap [data-ap]')) {
    const act = b.dataset.ap;
    const fire = () => {
      if (!fm || !started) return;
      const step = 1;
      if (!ap.on && act !== 'ATHR') {
        if (fm.onGround) { toast('Take off first, then use the autopilot'); return; }
        ap.engage(fm);
      }
      switch (act) {
        case 'hdg-': ap.hdg = wrap360(ap.hdg - 5); ap.hdgMode = 'HDG'; break;
        case 'hdg+': ap.hdg = wrap360(ap.hdg + 5); ap.hdgMode = 'HDG'; break;
        case 'alt-': ap.alt = Math.max(0, ap.alt - 500 * FT * step); ap.vMode = 'VS'; ap.vs = -Math.abs(ap.vs || 1000 * FT / 60); break;
        case 'alt+': ap.alt += 500 * FT * step; ap.vMode = 'VS'; ap.vs = Math.abs(ap.vs || 1500 * FT / 60); break;
        case 'vs-': case 'vs+': {
          if (ap.vMode !== 'VS') ap.vs = 0;
          ap.vMode = 'VS'; ap.vs += (act === 'vs+' ? 500 : -500) * FT / 60;
          // the selected altitude must lie in the direction we are climbing/descending, else move it 1,000 ft that way
          const hMsl = fm.h - (fm.geoidN || 0), dir = Math.sign(ap.vs);
          if (dir && Math.sign(ap.alt - hMsl) !== dir) ap.alt = Math.max(0, (Math.round(hMsl / FT / 100) * 100 + dir * 1000) * FT);
          if (!dir) ap.vMode = 'ALT';
          break;
        }
        case 'spd-': ap.spd = Math.max(fm.def.vref * 1.25, ap.spd - 5 * KT); break;
        case 'spd+': ap.spd = Math.min(fm.def.vne * 0.95, ap.spd + 5 * KT); break;
        case 'HDG': ap.hdgMode = 'HDG'; ap.hdg = Math.round(fm.hpr.heading); if (ap.vMode === 'APP') ap.vMode = 'ALT'; break;
        case 'NAV': if (!dest) { toast('Set a destination in the menu first'); break; } ap.hdgMode = 'NAV'; break;
        case 'APP': if (!dest) { toast('Set a destination in the menu first'); break; } ap.hdgMode = 'APP'; if (!fm.ctrl.gearDown) toast('Approach armed: put the gear down and flaps out!'); break;
        case 'ATHR': ap.athr = !ap.athr; break;
      }
      refreshAP();
    };
    b.addEventListener('click', fire);
  }
}
function refreshAP() {
  const m = S.units === 'm';
  $('#apMaster').textContent = ap.on ? 'AUTOPILOT ON' : 'AUTOPILOT OFF';
  $('#apMaster').classList.toggle('on', ap.on);
  $('#apHdg').textContent = String(Math.round(ap.hdg)).padStart(3, '0');
  $('#apAlt').textContent = m ? Math.round(ap.alt) + 'm' : Math.round(ap.alt / FT / 10) * 10;
  $('#apVs').textContent = ap.vMode === 'VS' ? (m ? (ap.vs).toFixed(1) : Math.round(ap.vs / FT * 60 / 50) * 50) : '—';
  $('#apSpd').textContent = m ? Math.round(ap.spd * 3.6) : Math.round(ap.spd / KT);
  for (const b of $$('#ap [data-ap]')) {
    const v = b.dataset.ap;
    if (['HDG', 'NAV', 'APP'].includes(v)) b.classList.toggle('on', ap.on && ap.hdgMode === v);
    if (v === 'ATHR') b.classList.toggle('on', ap.athr);
  }
}

// ------------------------------------------------------------------ touch controls
let touchUI = false, touchBrake = false;
function updateTouchVisibility() {
  touchUI = S.touchMode === 'on' || (S.touchMode === 'auto' && isTouch);
  $('#touch').classList.toggle('hidden', !touchUI || !started);
  document.body.classList.toggle('touchui', touchUI);
  $('#tBurner').classList.toggle('hidden', !(fm && fm.def.afterburner));
}
function setupTouch() {
  const stick = $('#stick'), knob = $('#stick i');
  let sid = null;
  const move = (e) => {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    knob.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
    controls.setTouchStick(Math.sign(x) * x * x, Math.sign(y) * y * y * 0.9, true);
  };
  stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); move(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) move(e); });
  const up = (e) => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; controls.setTouchStick(0, 0, false); };
  stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up);
  const thr = $('#thr');
  const setT = (e) => { const r = thr.getBoundingClientRect(); controls.throttle = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); };
  let tid = null;
  thr.addEventListener('pointerdown', (e) => { tid = e.pointerId; thr.setPointerCapture(tid); setT(e); });
  thr.addEventListener('pointermove', (e) => { if (e.pointerId === tid) setT(e); });
  thr.addEventListener('pointerup', () => { tid = null; });
  for (const b of $$('#tbtns [data-act]')) b.addEventListener('click', () => onAction(b.dataset.act));
  const brake = $('#tbtns [data-hold=brake]');
  brake.addEventListener('pointerdown', () => { touchBrake = true; brake.classList.add('on'); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) brake.addEventListener(ev, () => { touchBrake = false; brake.classList.remove('on'); });
  for (const b of $$('#rud [data-rud]')) {
    const v = +b.dataset.rud;
    b.addEventListener('pointerdown', () => controls.keys.add(v > 0 ? 'KeyE' : 'KeyQ'));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => controls.keys.delete(v > 0 ? 'KeyE' : 'KeyQ'));
  }
  // one-finger drag on the sky looks around
  let lid = null, lx = 0, ly = 0;
  viewer.canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; });
  viewer.canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; controls.touchLook(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; });
  viewer.canvas.addEventListener('pointerup', () => { lid = null; });
}

// ------------------------------------------------------------------ menu
function showMenu(on, tab) {
  $('#menu').classList.toggle('hidden', !on);
  $('#menu').classList.toggle('see', started);
  $('#resume').classList.toggle('hidden', !started);
  if (on) { paused = true; if (tab) selectTab(tab); requestAnimationFrame(hardwareUILoop); }
  else if (started) { paused = false; lastT = performance.now(); }
  $('#touch').classList.toggle('hidden', on || !touchUI || !started);
}
function selectTab(t) {
  for (const b of $$('#tabs button')) b.classList.toggle('active', b.dataset.tab === t);
  for (const p of $$('[data-page]')) p.classList.toggle('hidden', p.dataset.page !== t);
}
function seg(id, key, cb, num = true) {
  const el = $(id);
  const paint = () => { for (const b of el.querySelectorAll('button')) b.classList.toggle('active', String(S[key]) === b.dataset.v); };
  for (const b of el.querySelectorAll('button')) b.onclick = () => { S[key] = num && !isNaN(+b.dataset.v) ? +b.dataset.v : b.dataset.v; save(); paint(); cb && cb(); };
  paint();
}
function slider(id, key, fmt, cb) {
  const el = $(id), txt = $(id + 'Txt');
  el.value = S[key];
  const show = () => { if (txt) txt.textContent = fmt(+el.value); };
  el.oninput = () => { S[key] = +el.value; show(); save(); cb && cb(); };
  show();
}
function applyWeather() {
  const scene = viewer.scene;
  scene.fog.density = 0.6e-4 + S.haze * 0.35e-4;
  if (fm) { fm.turbulence = [0, 0.6, 1.6, 3.2][S.turb]; fm.wind = windVec(); world.updateClouds(fm.latDeg, fm.lonDeg, groundFilt, S.clouds, S.cloudBase, true); }
  if (S.realTime) world.setRealTime(); else world.setTime(S.hour, fm ? fm.lonDeg : (findAirport(S.airport) || { lon: 0 }).lon);
}
function buildMenu() {
  for (const b of $$('#tabs button')) b.onclick = () => selectTab(b.dataset.tab);
  // planes
  const pl = $('#planes');
  const paintPlanes = () => { for (const c of pl.children) c.classList.toggle('sel', c.dataset.k === S.aircraft); summary(); };
  for (const [k, d] of Object.entries(AIRCRAFT)) {
    const b = document.createElement('button'); b.className = 'card'; b.dataset.k = k;
    b.innerHTML = `<img src="assets/plane-${k}.jpg" alt="" loading="lazy"><span class="tag">${d.type}</span><h3>${d.name}</h3><p>${d.blurb}</p><p class="spec">Cruise ${Math.round(d.cruise / KT)} kt · rotate ${Math.round(d.vr / KT)} kt · stall ${Math.round(stallSpeed(d, 0) / KT)} kt</p>`;
    b.onclick = () => { S.aircraft = k; save(); paintPlanes(); };
    pl.appendChild(b);
  }
  paintPlanes();
  seg('#startMode', 'startMode', () => { $('#airportPick').classList.toggle('hidden', S.startMode === 'place'); $('#placePick').classList.toggle('hidden', S.startMode !== 'place'); summary(); }, false);
  $('#airportPick').classList.toggle('hidden', S.startMode === 'place'); $('#placePick').classList.toggle('hidden', S.startMode !== 'place');
  // airport search
  const results = $('#apResults'), q = $('#apSearch');
  const renderAp = () => {
    results.innerHTML = '';
    const POPULAR = ['KLAF', 'KIND', 'KORD', 'KJFK', 'KSFO', 'KLAX', 'EGLL', 'LFPG', 'RJTT', 'OMDB', 'VIDP', 'VABB', 'YSSY', 'LOWI', 'VNLK', 'KLAS', 'TNCM', 'LXGB'];
    let list = q.value.trim() ? searchAirports(q.value, 8) : [S.airport, ...POPULAR.filter((x) => x !== S.airport)].map(findAirport).filter(Boolean);
    for (const a of list) {
      const b = document.createElement('button'); b.classList.toggle('sel', a.icao === S.airport);
      b.innerHTML = `<code>${a.icao}</code><b>${a.name}</b><span>${a.city || ''} ${a.country}${a.iata ? ' · ' + a.iata : ''}</span>`;
      b.onclick = () => { S.airport = a.icao; S.runway = 0; save(); q.value = ''; renderAp(); fillRunways(); summary(); };
      results.appendChild(b);
    }
  };
  q.oninput = renderAp;
  const fillRunways = () => {
    const a = findAirport(S.airport) || findAirport('KLAF'); S.airport = a.icao;
    const sel = $('#rwySel'); sel.innerHTML = '';
    runwayEnds(a).forEach((e, i) => { const o = document.createElement('option'); o.value = i; o.textContent = `Runway ${e.label}${e.paved ? '' : ' · grass/dirt'}`; sel.appendChild(o); });
    sel.value = clamp(S.runway, 0, sel.options.length - 1); S.runway = +sel.value;
    sel.onchange = () => { S.runway = +sel.value; save(); summary(); };
  };
  renderAp(); fillRunways();
  // destination
  const dq = $('#destSearch'), dr = $('#destResults');
  dq.oninput = () => {
    dr.innerHTML = '';
    if (!dq.value.trim()) return;
    for (const a of searchAirports(dq.value, 6)) {
      const b = document.createElement('button');
      b.innerHTML = `<code>${a.icao}</code><b>${a.name}</b><span>${a.city || ''} ${a.country}</span>`;
      b.onclick = () => { S.dest = a.icao; save(); dq.value = ''; dr.innerHTML = ''; if (fm) setDestination(a); summary(); };
      dr.appendChild(b);
    }
  };
  $('#destClear').onclick = () => { S.dest = null; dest = null; ap.target = null; save(); summary(); };
  // place search (OpenStreetMap Nominatim)
  const doPlace = async () => {
    const pq = $('#placeSearch').value.trim(), pr = $('#placeResults');
    if (!pq) return;
    pr.innerHTML = '<span class="note">Searching…</span>';
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(pq)}`, { headers: { 'Accept-Language': 'en' } });
      const list = await r.json();
      pr.innerHTML = list.length ? '' : '<span class="note">Nothing found.</span>';
      for (const p of list) {
        const b = document.createElement('button');
        b.innerHTML = `<code>PLACE</code><b>${p.display_name.split(',').slice(0, 2).join(',')}</b><span>${p.type}</span>`;
        b.onclick = () => { S.place = { name: p.display_name, lat: +p.lat, lon: +p.lon }; save(); for (const x of pr.children) x.classList.remove('sel'); b.classList.add('sel'); summary(); };
        pr.appendChild(b);
      }
    } catch { pr.innerHTML = '<span class="note">Place search is unavailable right now.</span>'; }
  };
  $('#placeGo').onclick = doPlace; $('#placeSearch').onkeydown = (e) => { if (e.key === 'Enter') doPlace(); };
  $('#fly').onclick = () => { sound.start(AIRCRAFT[S.aircraft].engine); startFlight(); };
  $('#resume').onclick = () => showMenu(false);
  // weather
  slider('#hour', 'hour', (v) => `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')} local`, () => { S.realTime = false; applyWeather(); });
  $('#realTime').onclick = () => { S.realTime = true; save(); applyWeather(); toast('Using the real time of day'); };
  seg('#clouds', 'clouds', applyWeather);
  slider('#cloudBase', 'cloudBase', (v) => `${Math.round(v / FT / 100) * 100} ft above ground`, applyWeather);
  slider('#windDir', 'windDir', (v) => `${String(v).padStart(3, '0')}°`, applyWeather);
  slider('#windKt', 'windKt', (v) => `${v} kt`, applyWeather);
  seg('#turb', 'turb', applyWeather);
  slider('#haze', 'haze', () => '', applyWeather);
  // settings
  setupHardwareUI();
  seg('#quality', 'quality', () => { S.autoQuality = false; save(); gov.step = 0; world.applyQuality(S.quality); });
  seg('#assist', 'assist'); seg('#invert', 'invert'); seg('#units', 'units');
  seg('#touchMode', 'touchMode', updateTouchVisibility, false);
  slider('#volume', 'volume', () => '', () => sound.setVolume(S.volume));
  $('#ionToken').value = S.ionToken || '';
  $('#ionSave').onclick = () => { S.ionToken = $('#ionToken').value.trim(); save(); location.reload(); };
  seg('#photoreal', 'photoreal', async () => {
    if (!world.hasIon) { toast('Photorealistic mode is unavailable right now'); return; }
    await world.setPhotoreal(S.photoreal === 1);
  });
  summary();
}
// ------------------------------------------------------------------ controller setup (Settings tab)
const hwUI = { dirty: true, learning: null };
function hwLabel(id) { return id.replace(/\(.*?\)/g, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').trim().slice(0, 48) || 'Controller'; }
function buildHardwareUI() {
  const hw = controls.hw, st = hw.store, pads = hw.pads();
  const devs = $('#hwDevices'), ax = $('#hwAxes'), bt = $('#hwButtons');
  const where = (fn, kind) => {
    for (const p of pads) { const b = hw.bindingsFor(p), x = kind === 'axis' ? b.axes[fn] : b.buttons[fn]; if (x != null) return { p, x }; }
    return null;
  };
  devs.innerHTML = pads.length ? pads.map((p, n) => `<div class="hwdev"><b>${hwLabel(p.id)}</b> <span class="note">${p.mapping === 'standard' ? 'gamepad' : 'flight controller'} · ${p.axes.length} axes · ${p.buttons.length} buttons</span>
    <div class="hwraw">${p.axes.map((v, i) => `<span title="axis ${i}"><i data-dev="${n}" data-ax="${i}"></i><em>${i}</em></span>`).join('')}</div></div>`).join('')
    : '<p class="note">No controller found yet. Plug it in and <b>press any button on it</b> (browsers only show controllers after a button press). Safari on Mac does not see most joysticks: use Chrome or Edge.</p>';
  ax.innerHTML = AXIS_FNS.map((f) => {
    const w = where(f.k, 'axis');
    const txt = w ? `${hwLabel(w.p.id)} · axis ${w.x.a}${w.x.inv ? ' (reversed)' : ''}` : 'not set';
    return `<div class="hwrow"><span class="lbl">${f.label}</span><span class="bind">${txt}</span><span class="bar"><i data-fn="${f.k}"></i></span>
      <button class="ghost sm" data-learn="${f.k}">Detect</button><button class="ghost sm" data-inv="${f.k}" ${w ? '' : 'disabled'}>Reverse</button><button class="ghost sm" data-clear="${f.k}" ${w ? '' : 'disabled'}>Clear</button></div>`;
  }).join('');
  bt.innerHTML = BUTTON_FNS.map(([k, label]) => {
    const w = where(k, 'button');
    return `<div class="hwrow"><span class="lbl">${label}</span><span class="bind">${w ? `${hwLabel(w.p.id)} · button ${w.x}` : 'not set'}</span><span></span>
      <button class="ghost sm" data-learnb="${k}">Detect</button><span></span><button class="ghost sm" data-clearb="${k}" ${w ? '' : 'disabled'}>Clear</button></div>`;
  }).join('');
  const stopLearn = () => { hwUI.learning = null; $('#hwPrompt').textContent = ''; };
  for (const b of ax.querySelectorAll('[data-learn]')) b.onclick = () => {
    const f = AXIS_FNS.find((x) => x.k === b.dataset.learn);
    hwUI.learning = f.k; $('#hwPrompt').textContent = `Now ${f.how}… (10 s)`;
    hw.startLearn('axis', f.k, (r) => { stopLearn(); $('#hwPrompt').textContent = r ? `${f.label}: axis ${r.a} ✓` : 'Nothing moved. Try again.'; save(); hwUI.dirty = true; });
  };
  for (const b of bt.querySelectorAll('[data-learnb]')) b.onclick = () => {
    const k = b.dataset.learnb, label = BUTTON_FNS.find((x) => x[0] === k)[1];
    hwUI.learning = k; $('#hwPrompt').textContent = `Now press the button for “${label}”… (10 s)`;
    hw.startLearn('button', k, (r) => { stopLearn(); $('#hwPrompt').textContent = r ? `${label}: button ${r.i} ✓` : 'No button pressed. Try again.'; save(); hwUI.dirty = true; });
  };
  for (const b of ax.querySelectorAll('[data-inv]')) b.onclick = () => { const w = where(b.dataset.inv, 'axis'); if (w) { w.x.inv = !w.x.inv; save(); hwUI.dirty = true; } };
  for (const b of ax.querySelectorAll('[data-clear]')) b.onclick = () => { for (const v of Object.values(st.bindings)) delete v.axes[b.dataset.clear]; save(); hwUI.dirty = true; };
  for (const b of bt.querySelectorAll('[data-clearb]')) b.onclick = () => { for (const v of Object.values(st.bindings)) delete v.buttons[b.dataset.clearb]; save(); hwUI.dirty = true; };
  hwUI.count = pads.length; hwUI.dirty = false;
}
function hardwareUILoop() {
  if ($('#menu').classList.contains('hidden') || $('[data-page="settings"]').classList.contains('hidden')) return;
  requestAnimationFrame(hardwareUILoop);
  const hw = controls.hw;
  const live = hw.read(0, true); // read without firing buttons while you are in the menu
  const pads = hw.last.pads;
  if (hwUI.dirty || pads.length !== hwUI.count) buildHardwareUI();
  for (const i of document.querySelectorAll('.hwraw i')) {
    const p = pads[+i.dataset.dev], v = p ? p.axes[+i.dataset.ax] : 0;
    i.style.height = `${Math.round((Math.abs(v) > 1.01 ? 0 : (v + 1) / 2) * 100)}%`;
  }
  for (const i of document.querySelectorAll('.hwrow i[data-fn]')) {
    const f = i.dataset.fn, v = live[f];
    const c = AXIS_FNS.find((x) => x.k === f).centred;
    i.style.left = c ? `${50 + Math.min(0, (v || 0)) * 50}%` : '0';
    i.style.width = c ? `${Math.abs(v || 0) * 50}%` : `${(v || 0) * 100}%`;
  }
}
function setupHardwareUI() {
  const st = controls.hw.store;
  const dz = $('#hwDz'), cv = $('#hwCurve');
  dz.value = st.deadzone; cv.value = st.curve;
  const show = () => { $('#hwDzTxt').textContent = `${Math.round(st.deadzone * 100)}%`; $('#hwCurveTxt').textContent = st.curve < 0.05 ? 'linear' : `${Math.round(st.curve * 100)}%`; };
  dz.oninput = () => { st.deadzone = +dz.value; show(); save(); };
  cv.oninput = () => { st.curve = +cv.value; show(); save(); };
  show();
  $('#hwHat').onclick = () => { st.hatLook = !st.hatLook; $('#hwHat').textContent = st.hatLook ? 'Hat switch looks around: ON' : 'Hat switch looks around: OFF'; save(); };
  $('#hwHat').textContent = st.hatLook ? 'Hat switch looks around: ON' : 'Hat switch looks around: OFF';
  $('#hwReset').onclick = () => { st.bindings = {}; save(); hwUI.dirty = true; toast('Controller setup reset to defaults'); };
  const tabBtn = $('#tabs [data-tab="settings"]'), prev = tabBtn.onclick;
  tabBtn.onclick = () => { prev && prev(); hwUI.dirty = true; requestAnimationFrame(hardwareUILoop); };
}

function summary() {
  const d = AIRCRAFT[S.aircraft], a = findAirport(S.airport);
  let where = '';
  if (S.startMode === 'place') where = S.place ? `over ${S.place.name.split(',')[0]}` : 'pick a place';
  else if (a) { const e = runwayEnds(a)[S.runway]; where = `${S.startMode === 'approach' ? 'landing at' : S.startMode === 'cruise' ? 'flying near' : 'from'} ${a.icao} ${e ? 'runway ' + e.ident : ''}`; }
  $('#flySummary').textContent = `${d.name}, ${where}${S.dest ? ` → ${S.dest}` : ''}`;
}

boot().catch((e) => { console.error(e); loading(true, 'Something went wrong: ' + e.message); });
window.__sim = { simUpdate: (dt) => simUpdate(dt), get fm() { return fm; }, get lights() { return lights; }, get paused() { return paused; }, get perf() { return perf.last; }, get started() { return started; }, get ap() { return ap; }, get world() { return world; }, get controls() { return controls; }, onAction, startFlight, S, setCam };
