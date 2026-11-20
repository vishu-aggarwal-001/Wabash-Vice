// Wabash Vice — open-world sandbox set in the real West Lafayette & Lafayette, Indiana.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Final colour grade: filmic contrast, a touch of warmth, vignette and fine grain.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, night: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, night; varying vec2 vUv;
    float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.14 - night * 0.25);                      // saturation
      c = (c - 0.5) * (1.12) + 0.5;                                  // contrast
      c *= mix(vec3(1.03, 1.0, 0.95), vec3(0.9, 0.97, 1.1), night);    // warm day / cool night
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);                     // soft S-curve
      vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 0.55;               // vignette
      c += (rand(vUv * 731.0) - 0.5) * 0.018;                        // grain
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
import { World } from './world.js';
import { Environment } from './env.js';
import { FX } from './fx.js';
import { Player, animate } from './player.js';
import { Vehicle, byId } from './vehicles.js';
import { Traffic, Police } from './npc.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { People } from './people.js';
import { Jobs } from './jobs.js';
import { Story } from './story.js';
import { pickWeather, installSnowShader, Snowfall, snowy } from './weather.js';

const QUALITY = {
  low: { pixelRatio: 1, shadows: 1024, shadowRange: 80, drawDistance: 1400, bloom: false, msaa: 0, ao: false, grade: false, textures: 'lo', treeCards: 14, traffic: 14, peds: 10, lamps: 1500, treeShadows: false },
  medium: { pixelRatio: 1.25, shadows: 2048, shadowRange: 130, drawDistance: 2400, bloom: true, msaa: 4, ao: false, grade: true, textures: 'lo', treeCards: 24, traffic: 24, peds: 16, lamps: 4000, treeShadows: false },
  high: { pixelRatio: 1.5, shadows: 4096, shadowRange: 160, drawDistance: 3400, bloom: true, msaa: 4, ao: true, grade: true, textures: 'hi', treeCards: 34, traffic: 34, peds: 24, lamps: 8000, treeShadows: true },
  ultra: { pixelRatio: 2, shadows: 4096, shadowRange: 200, drawDistance: 4800, bloom: true, msaa: 4, ao: true, grade: true, textures: 'hi', treeCards: 44, traffic: 48, peds: 34, lamps: 14000, treeShadows: true },
};
const SAVE_KEY = 'wabash-vice-save-v1';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

class Game {
  constructor() {
    let save = {};
    try { save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch { /* storage unavailable */ }
    const touch = matchMedia('(pointer: coarse)').matches;
    this.save = save;
    this.settings = Object.assign({ quality: 'auto', invertPitch: false, volume: 0.8, sensitivity: 1, units: 'mph', dayMinutes: 24, dynres: true, weather: 'auto' }, save.settings || {});
    this.weather = pickWeather(params.get('weather') || this.settings.weather);
    installSnowShader(snowy(this.weather) ? 1 : 0);
    if (!save.v3) { this.settings.quality = 'auto'; }   // v0.3: re-detect everyone's quality once
    this.autoQuality = this.settings.quality === 'auto' ? detectQuality(touch) : null;
    if (params.get('quality')) this.settings.quality = params.get('quality');
    this.quality = { ...(QUALITY[this.autoQuality && !params.get('quality') ? this.autoQuality : this.settings.quality] || QUALITY.medium) };
    this.money = save.money ?? 500;
    this.vehicle = null; this.parked = []; this.paused = true; this.started = false;
    this.camYaw = 0; this.camPitch = 0.18; this.camMode = 0; this.lookIdle = 9; this.shake = 0;
    this.focus = new THREE.Vector3(); this.gps = null; this.gpsPath = null; this.gpsT = 0;
    this.airTime = 0; this.deathT = 0;
    this.actors = []; this.scripts = []; this.blips = [];
  }

  async init() {
    const canvas = $('game');
    const q = this.quality;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !q.bloom && q.msaa > 0, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
    r.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = q.shadows > 0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.3, 12000);
    if (q.bloom) {
      const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: q.msaa });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.22, 0.45, 0.92);
      if (q.ao) {
        const ao = this.ao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
        ao.output = GTAOPass.OUTPUT.Default;
        ao.blendIntensity = 0.9;
        ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.6, thickness: 2.5, scale: 1.2, samples: 12, distanceFallOff: 1.0 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
        // leaf cards, sky, clouds, particles and water don't take part in AO
        const hide = ao._overrideVisibility.bind(ao);
        ao._overrideVisibility = () => {
          hide();
          this.scene.traverse((o) => { if ((o.userData.noAO || o.isSprite || (o.material && o.material.transparent)) && o.visible) { o.visible = false; ao._visibilityCache.push(o); } });
        };
        this.composer.addPass(ao);
      }
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      if (q.grade) { this.grade = new ShaderPass(GradeShader); this.composer.addPass(this.grade); }
      this.composer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    }
    addEventListener('resize', () => this.resize());

    const bar = $('loadbar'), msg = $('loadmsg');
    this.world = new World(this.scene, r, q);
    await this.world.load((p, m) => { bar.style.width = (p * 100).toFixed(0) + '%'; msg.textContent = m; });
    msg.textContent = 'Casting the people of Lafayette…';
    this.people = new People();
    await this.people.load().catch((e) => console.warn('Character models failed to load, using simple figures', e));
    this.env = new Environment(this.scene, r, q, this.weather);
    this.world.setupLampLights(q.textures === 'lo' ? 3 : 6);
    if (snowy(this.weather)) this.snow = new Snowfall(this.scene, this.weather === 'snowsun' ? 1800 : q.textures === 'lo' ? 5000 : 9000);
    this.env.daySeconds = this.settings.dayMinutes * 60;
    if (save_hours(this.save)) this.env.hours = this.save.hours;
    if (params.get('hour')) this.env.hours = +params.get('hour');
    this.fx = new FX(this.scene);
    this.audio = new Audio(); this.audio.setVolume(this.settings.volume);
    this.input = new Input(canvas);
    this.player = new Player(this.world, this.scene, this.people);
    this.computeSpots();
    this.traffic = new Traffic(this);
    this.police = new Police(this);
    this.missions = new Missions(this);
    this.jobs = new Jobs(this);
    this.story = new Story(this);
    if (this.save.player) { this.player.medkits = this.save.player.medkits ?? 2; this.player.armor = this.save.player.armor ?? 0; }
    this.hud = new HUD(this);
    this.headlight = new THREE.SpotLight(0xfff1d6, 0, 90, 0.55, 0.45, 1.2);
    this.headlight.position.set(0, 1, 1.5); this.headlight.target.position.set(0, 0, 30);
    this.spawnShowcase();
    const [sx, sz] = this.startSpot;
    this.player.place(sx, sz);
    this.player.yaw = this.camYaw = this.startYaw ?? Math.PI;
    this.focus.copy(this.player.pos);
    // warm-up render so the GPU compiles shaders behind the loading screen
    bar.style.width = '100%'; msg.textContent = 'Compiling shaders…';
    this.updateCamera(0.016, { lookX: 0, lookY: 0, wheel: 0 });
    this.env.update(0, this.focus);
    this.renderer.compile(this.scene, this.camera);
    this.render();
    $('loading').hidden = true;
    $('start').hidden = false;
    $('play').onclick = () => this.start();
    if (params.has('autostart')) this.start();
    this.clock = new THREE.Clock();
    this.frames = 0; this.fpsT = 0;
    this.renderer.setAnimationLoop(() => this.frame());
    window.game = this;
  }

  start() {
    $('start').hidden = true; $('hud').hidden = false;
    this.started = true; this.paused = false;
    this.audio.start();
    if (!this.save.seenHelp) { this.hud.big('WABASH VICE', 'West Lafayette & Lafayette, Indiana — press F1 for controls'); this.save.seenHelp = true; this.persist(); }
    else this.hud.big('WABASH VICE', 'Welcome back');
    if (!matchMedia('(pointer: coarse)').matches && !params.has('autostart')) $('game').requestPointerLock?.();
  }

  computeSpots() {
    const w = this.world;
    // start at the Purdue Memorial Union, on the nearest street
    const [ux, uz] = w.toWorld(40.42440, -86.91105);
    const n = w.nearestNode(ux, uz);
    const p = n >= 0 ? w.gNodes[n] : [ux, 0, uz];
    this.startNode = n;
    this.startSpot = [p[0], p[2]];
    // runway 10/28 at Purdue Airport (the real OSM runway, clipped to the map)
    const rw = (w.map.runways || []).find(r => r[0].startsWith('10')) || w.map.runways?.[0];
    if (rw) {
      let [, x0, z0, x1, z1] = rw;
      if (x0 > x1) [x0, z0, x1, z1] = [x1, z1, x0, z0];
      const sx = Math.max(x0, w.minX + 160), t = (sx - x0) / (x1 - x0);
      this.runwaySpawn = { x: sx, z: z0 + (z1 - z0) * t, yaw: Math.atan2(x1 - x0, z1 - z0) };
      this.airportCenter = [(sx + x1) / 2, (z0 + (z1 - z0) * t + z1) / 2];
    } else {
      const [x, z] = w.toWorld(40.4123, -86.9369);
      this.runwaySpawn = { x, z, yaw: Math.PI / 2 }; this.airportCenter = [x, z];
    }
    // boat launch near Tapawingo Park / Wabash Landing
    const [bx, bz] = w.toWorld(40.4185, -86.9012);
    this.boatLaunch = this.bankPoint(bz, -1) || [bx, bz, bx];
  }

  // a point in the Wabash on the same latitude (z) — nearest water to the river centre line
  riverPoint(z) {
    const w = this.world;
    for (let dz = 0; dz < 400; dz += 8) for (const sz of [z + dz, z - dz]) {
      const iz = Math.max(0, Math.min(w.nz - 1, Math.round((sz - w.minZ) / w.cell)));
      const cx = w.riverX[iz];
      for (let dx = 0; dx < 500; dx += 4) for (const x of [cx + dx, cx - dx]) {
        if (w.isWater(x, sz) && w.isWater(x + 6, sz) && w.isWater(x - 6, sz)) return [x, sz];
      }
    }
    return [w.riverX[0], z];
  }
  // heading pointing upstream (north) along the river at z
  riverYaw(z) {
    const [x0] = this.riverPoint(z + 80), [x1] = this.riverPoint(z - 80);
    return Math.atan2(x1 - x0, -160);
  }
  // a point on the river bank, `dir` = -1 west bank, +1 east bank. Returns [x, z, waterX]
  bankPoint(z, dir = -1) {
    const w = this.world;
    let [x, zz] = this.riverPoint(z);
    if (!w.isWater(x, zz)) return null;
    for (let i = 0; i < 300 && w.isWater(x, zz); i++) x += dir * 2;
    return [x + dir * 3, zz, x - dir * 10];
  }

  spawnShowcase() {
    const w = this.world, [sx, sz] = this.startSpot;
    const add = (id, x, z, yaw, opts) => { const v = new Vehicle(id, w, opts).place(x, z, yaw); this.scene.add(v.mesh); this.parked.push(v); v.showcase = true; return v; };
    const n = w.nearestNode(sx, sz), nb = w.gAdj[n]?.[0];
    let yaw = 0;
    if (nb !== undefined) { const a = w.gNodes[n], b = w.gNodes[nb]; yaw = Math.atan2(b[0] - a[0], b[2] - a[2]); }
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const base = w.gNodes[n] || [sx, 0, sz];
    add('gt', base[0] + rx * 2 + fx * 7, base[2] + rz * 2 + fz * 7, yaw);
    add('sportbike', base[0] + rx * 2.5 - fx * 1, base[2] + rz * 2.5 - fz * 1, yaw);
    // player stands on the opposite side of the street, looking at the car
    const ps = w.collide(base[0] - rx * 4 + fx * 2, base[2] - rz * 4 + fz * 2, 0.5, base[1] + 0.3, base[1] + 2);
    this.startSpot = [ps.x, ps.z];
    this.startYaw = Math.atan2((base[0] + rx * 2 + fx * 7) - ps.x, (base[2] + rz * 2 + fz * 7) - ps.z) + 0.5;
    const R = this.runwaySpawn;
    add('cessna', R.x + Math.sin(R.yaw) * 20, R.z + Math.cos(R.yaw) * 20, R.yaw);
    add('jet', R.x - Math.sin(R.yaw) * 30, R.z - Math.cos(R.yaw) * 30, R.yaw);
    add('heli', R.x + Math.sin(R.yaw + 1.57) * 80, R.z + Math.cos(R.yaw + 1.57) * 80, R.yaw);
    const [, bz, wx] = this.boatLaunch;
    const ry = this.riverYaw(bz);
    add('speedboat', wx + 6, bz, ry);
    add('jetski', wx + 8, bz + 14, ry);
    const [hx, hz] = w.toWorld(40.4318, -86.9180);
    add('hyper', hx, hz, 0);
    const [dx, dz] = w.toWorld(40.4189, -86.8929);
    add('taxi', dx, dz, Math.PI / 2);
    add('dirtbike', base[0] - rx * 5 - fx * 6, base[2] - rz * 5 - fz * 6, yaw + 1.2);
  }

  // dynamic resolution: drop the render scale when the GPU can't keep up, raise it again when it can
  adaptResolution(fps) {
    if (!this.started || this.paused || !this.settings.dynres) return;
    this.dynScale ??= 1;
    this.slowSecs = fps < 40 ? (this.slowSecs || 0) + 1 : 0;
    this.fastSecs = fps > 57 ? (this.fastSecs || 0) + 1 : 0;
    let s = this.dynScale;
    if (this.slowSecs >= 2) { s = Math.max(0.5, s - (fps < 25 ? 0.2 : 0.1)); this.slowSecs = 0; }
    else if (this.fastSecs >= 4) { s = Math.min(1, s + 0.1); this.fastSecs = 0; }
    // still slow at half resolution: switch off the most expensive effects
    if (s <= 0.5 && fps < 30 && this.ao?.enabled) { this.ao.enabled = false; this.hud?.toast('Turned off ambient occlusion to keep things smooth'); }
    if (s <= 0.5 && fps < 24 && this.renderer.shadowMap.enabled && !this.shadowsCut) { this.shadowsCut = true; this.env?.sun && (this.env.sun.shadow.mapSize.set(1024, 1024), this.env.sun.shadow.map?.dispose(), this.env.sun.shadow.map = null); }
    if (Math.abs(s - this.dynScale) > 0.01) {
      this.dynScale = s;
      const pr = Math.min(devicePixelRatio, this.quality.pixelRatio) * s;
      this.renderer.setPixelRatio(pr); this.composer?.setPixelRatio(pr);
      this.renderer.setSize(innerWidth, innerHeight); this.composer?.setSize(innerWidth, innerHeight);
    }
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer?.setSize(innerWidth, innerHeight);
    if (this.hud?.mapOpen) { $('bigmap').width = innerWidth; $('bigmap').height = innerHeight; }
  }

  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v3: true, money: this.money, gears: this.save.gears || [], settings: this.settings, hours: this.env?.hours, seenHelp: this.save.seenHelp, karma: this.save.karma || 0, jobs: this.save.jobs, story: this.save.story, player: { medkits: this.player?.medkits ?? 2, armor: Math.round(this.player?.armor || 0) } }));
    } catch { /* ignore */ }
  }
  addMoney(n) { this.money = Math.max(0, this.money + n); this.persist(); }

  // ---------------------------------------------------------------- vehicles
  spawnVehicle(id, x, z, yaw, enter = true) {
    const v = new Vehicle(id, this.world).place(x, z, yaw);
    this.scene.add(v.mesh);
    this.parked.push(v);
    this.trimParked();
    if (enter) this.enterVehicle(v);
    return v;
  }
  trimParked() {
    while (this.parked.length > 26) {
      let far = -1, fd = -1;
      this.parked.forEach((v, i) => { if (v !== this.vehicle && !v.showcase) { const d = v.pos.distanceTo(this.focus); if (d > fd) { fd = d; far = i; } } });
      if (far < 0) break;
      this.scene.remove(this.parked[far].mesh); this.parked.splice(far, 1);
    }
  }
  spawnFromMenu(id) {
    const s = byId[id], w = this.world, p = this.focus;
    if (this.vehicle) this.exitVehicle(true);
    if (s.type === 'plane' && Math.hypot(p.x - this.airportCenter[0], p.z - this.airportCenter[1]) > 900) {
      const R = this.runwaySpawn;
      this.hud.toast('Taking you to Purdue Airport, runway 10');
      this.spawnVehicle(id, R.x, R.z, R.yaw); return;
    }
    if (s.type === 'boat') {
      const [rx] = this.riverPoint(p.z);
      if (Math.abs(rx - p.x) > 140 || !w.isWater(rx, p.z)) {
        const [, bz, wx] = this.boatLaunch;
        this.hud.toast('Taking you to the Wabash River');
        this.spawnVehicle(id, wx + 8, bz, this.riverYaw(bz)); return;
      }
      let x = p.x; const dir = Math.sign(rx - p.x) || 1;
      for (let i = 0; i < 80 && !w.isWater(x, p.z); i++) x += dir * 2;
      this.spawnVehicle(id, x + dir * 4, p.z, this.riverYaw(p.z)); return;
    }
    // in front of the player, clear of buildings (and on dry land)
    const yaw = this.camYaw;
    let ox = p.x, oz = p.z;
    if (w.isWater(ox, oz) || w.isWater(ox + Math.sin(yaw) * 7, oz + Math.cos(yaw) * 7)) {
      const [rx] = this.riverPoint(oz);
      const bank = this.bankPoint(oz, Math.sign(ox - rx) || 1);
      if (bank) { ox = bank[0] + Math.sign(ox - rx) * 12; }
      this.hud.toast('Moved you to the river bank');
    }
    for (const d of [7, 4, 10, 0]) {
      const x = ox + Math.sin(yaw) * d, z = oz + Math.cos(yaw) * d;
      const res = w.collide(x, z, Math.max(1, s.W / 2), p.y + 0.3, p.y + 2);
      if (!res.hit || d === 0) { this.spawnVehicle(id, res.x, res.z, yaw); return; }
    }
  }
  teleport(x, z, name) {
    if (this.vehicle) {
      const v = this.vehicle;
      if (v.type === 'boat') { this.exitVehicle(true); }
      else { v.place(x, z, v.yaw); this.hud.toast(`Travelled to ${name}`); return; }
    }
    this.player.place(x, z);
    this.hud.toast(`Travelled to ${name}`);
  }

  enterVehicle(v) {
    if (v.dead) return;
    this.vehicle = v; v.driver = 'player'; this.player.vehicle = v;
    v.kinematic = false;
    const seat = v.mesh.userData.seat;
    if (seat && (v.type === 'bike' || v.spec.rider)) {
      v.mesh.add(this.player.mesh); this.player.mesh.position.copy(seat); this.player.mesh.rotation.set(0, 0, 0);
      this.player.char.update(0.5, 'ride', 0);
      this.player.mesh.visible = true;
    } else this.player.mesh.visible = false;
    v.mesh.add(this.headlight); v.mesh.add(this.headlight.target);
    this.headlight.position.set(0, 1.0, v.spec.L / 2); this.headlight.target.position.set(0, -2, v.spec.L / 2 + 30);
    if (v.type === 'plane') { v.throttle = v.onGround ? 0 : 0.7; this.hud.toast(v.onGround ? 'W = throttle up · ↓ (or S-pitch) to lift off at speed' : ''); }
    this.camYaw = v.yaw; this.lookIdle = 9;
  }

  exitVehicle(force = false) {
    const v = this.vehicle; if (!v) return;
    const pl = this.player, w = this.world;
    v.driver = null; this.vehicle = null; pl.vehicle = null;
    if (this.player.mesh.parent !== this.scene) { this.scene.add(pl.mesh); }
    pl.mesh.visible = true;
    this.headlight.intensity = 0;
    if (v.type === 'plane') v.throttle = 0;
    const left = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    const side = (v.spec.W || 2) / 2 + 0.9;
    let ex = v.pos.x + left.x * side, ez = v.pos.z + left.z * side;
    const blocked = w.collide(ex, ez, 0.4, v.pos.y + 0.3, v.pos.y + 1.8).hit;
    if (blocked) { ex = v.pos.x - left.x * side; ez = v.pos.z - left.z * side; }
    const gy = w.groundAt(ex, ez, v.pos.y + 1);
    const high = v.pos.y - gy.y > 12;
    pl.pos.set(ex, high ? v.pos.y - 2 : Math.max(gy.y, gy.water ?? -99) + (gy.water !== null ? -1.0 : 0), ez);
    pl.vel.copy(v.vel).multiplyScalar(high ? 0.6 : 0.4);
    pl.yaw = v.yaw;
    if (high) { pl.parachute = true; this.hud.toast('Parachute deployed — WASD to steer'); }
    else if (v.speed > 9 && !force) { pl.knock(v.vel.clone().multiplyScalar(0.5)); this.hud.toast('You bailed out!'); }
    if (!this.parked.includes(v)) this.parked.push(v);
    this.camYaw = v.yaw;
  }

  tryEnter() {
    const p = this.player.pos;
    let best = null, bd = 5, kind = null;
    for (const v of this.parked) { if (v.dead) continue; const d = v.pos.distanceTo(p) - v.spec.L * 0.3; if (d < bd) { bd = d; best = v; kind = 'parked'; } }
    const tc = this.traffic.nearestCar(p, bd);
    if (tc) { best = tc.v; kind = tc.ai ? 'jack' : 'parked'; this.traffic.cars.splice(this.traffic.cars.indexOf(tc), 1); }
    for (const u of this.police.units) { const d = u.v.pos.distanceTo(p) - u.v.spec.L * 0.3; if (d < bd && !u.v.dead) { bd = d; best = u.v; kind = 'cop'; } }
    if (!best) return false;
    if (kind === 'jack') { best.kinematic = false; this.police.crime(1, 'Carjacking'); this.hud.toast(`Jacked a ${best.spec.name}`); }
    if (kind === 'cop') { this.police.units = this.police.units.filter(u => u.v !== best); best.sirenOn = false; this.police.crime(2, 'Stole a police car'); }
    if (!this.parked.includes(best)) this.parked.push(best);
    this.enterVehicle(best);
    return true;
  }

  // ---------------------------------------------------------------- events
  onCrash(intensity, pos) { this.audio.crash(intensity); this.shake = Math.min(1, this.shake + intensity * 0.04); }
  onPedHit(p, speed, scripted = false) {
    this.audio.crash(speed * 0.4);
    if (scripted && p.hostile !== undefined && (p.label || p.hostile)) return;   // mission targets: running them over is fair game
    if (speed > 5 && !(this.jobs.active === 'police')) this.police.crime(1, 'Hit a pedestrian');
    this.karma(-4);
  }
  setGPS(x, z, route = true) {
    if (x == null) { this.gps = null; this.gpsPath = null; return; }
    this.gps = { x, z, route }; this.gpsT = 0; this.gpsPath = null;
  }
  updateGPS(dt) {
    if (!this.gps) return;
    if (Math.hypot(this.focus.x - this.gps.x, this.focus.z - this.gps.z) < 25 && !this.missions.active && !this.scripts.length) { this.hud.toast('You have arrived', 'good'); this.setGPS(null); return; }
    this.gpsT -= dt;
    const air = this.vehicle && (this.vehicle.type === 'plane' || this.vehicle.type === 'heli' || this.vehicle.type === 'boat');
    if (this.gpsT <= 0 && this.gps.route && !air) {
      this.gpsT = 1.5;
      const a = this.world.nearestNode(this.focus.x, this.focus.z), b = this.world.nearestNode(this.gps.x, this.gps.z);
      this.gpsPath = a >= 0 && b >= 0 ? this.world.route(a, b) : null;
    } else if (air) this.gpsPath = null;
  }
  wasted() {
    if (this.deathT > 0) return;
    this.deathT = 3.5; this.hud.big('WASTED', 'Respawning at the Purdue Memorial Union  •  -$100', 'wasted'); this.audio.stinger();
    this.missions.cancel(); this.story.active?.fail('You were wasted'); this.jobs.end(true);
  }
  busted() {
    if (this.deathT > 0) return;
    this.deathT = 3.5; this.bustedFlag = true;
    this.hud.big('BUSTED', 'Lafayette PD fined you $250', 'busted'); this.audio.stinger();
    this.missions.cancel(); this.story.active?.fail('You were busted'); this.jobs.end(true);
  }
  respawn() {
    if (this.vehicle) this.exitVehicle(true);
    const busted = this.bustedFlag; this.bustedFlag = false;
    this.police.clear();
    this.addMoney(busted ? -250 : -100);
    const [x, z] = busted ? this.world.toWorld(40.4186, -86.8930) : this.startSpot;
    this.player.place(x, z); this.player.hp = 100; this.player.down = 0; this.player.parachute = false; this.player.gone = false;
    this.player.mesh.visible = true;
  }

  // ---------------------------------------------------------------- controls
  vehicleControls(inp, v) {
    const c = { throttle: 0, steer: 0, handbrake: false, up: false, down: false, yaw: 0, pitch: 0, roll: 0, boost: inp.shift };
    const inv = this.settings.invertPitch ? -1 : 1;
    switch (v.type) {
      case 'car': case 'bike': case 'boat':
        c.throttle = inp.moveY; c.steer = inp.moveX; c.handbrake = inp.jump; break;
      case 'plane':
        c.throttle = inp.touch ? (inp.up ? 1 : 0) - (inp.down ? 1 : 0) : inp.moveY;
        c.roll = inp.moveX; c.steer = inp.moveX;
        c.pitch = (inp.touch ? -inp.moveY : -inp.arrowY) * inv;
        c.yaw = (inp.e ? 1 : 0) - (inp.q ? 1 : 0);
        c.handbrake = !inp.touch && inp.jump;
        break;
      case 'heli':
        c.throttle = inp.moveY; c.steer = inp.moveX; c.roll = (inp.e ? 1 : 0) - (inp.q ? 1 : 0);
        c.up = inp.up; c.down = inp.down || (!inp.touch && inp.shift); c.boost = false;
        break;
    }
    return c;
  }

  // ---------------------------------------------------------------- camera
  updateCamera(dt, inp) {
    const cam = this.camera, v = this.vehicle, w = this.world, sens = this.settings.sensitivity;
    if (inp.lookX || inp.lookY) this.lookIdle = 0; else this.lookIdle += dt;
    this.camYaw -= inp.lookX * 0.0028 * sens;
    this.camPitch = Math.max(-0.45, Math.min(1.25, this.camPitch + inp.lookY * 0.0022 * sens));
    if (inp.wheel) this.zoom = Math.max(0.6, Math.min(2.5, (this.zoom || 1) * (inp.wheel > 0 ? 1.12 : 0.9)));
    const zoom = this.zoom || 1;
    let target, dist, height, fov = 65;
    if (v) {
      const L = v.spec.L, big = v.spec.mass > 3000;
      let heading = v.yaw;
      if (v.type === 'plane') { const f = new THREE.Vector3(0, 0, 1).applyQuaternion(v.q); heading = Math.atan2(f.x, f.z); }
      const vf = v.vel.x * Math.sin(heading) + v.vel.z * Math.cos(heading);
      if (this.lookIdle > 1.2 && !(v.type === 'car' && vf < -3)) {
        this.camYaw += wrap(heading - this.camYaw) * Math.min(1, dt * (v.type === 'plane' ? 4 : 3));
        const wantPitch = v.type === 'plane' ? 0.12 - (new THREE.Vector3(0, 0, 1).applyQuaternion(v.q).y) * 0.7 : v.type === 'heli' ? 0.3 : 0.16;
        this.camPitch += (wantPitch - this.camPitch) * Math.min(1, dt * 2);
      }
      const modeDist = [1, 1.7, 0][this.camMode];
      dist = (v.type === 'plane' ? (v.spec.jet ? 26 : 17) : v.type === 'heli' ? 17 : Math.max(5.6, L * 1.25 + (big ? 4 : 0))) * modeDist * zoom;
      height = v.type === 'plane' ? 2.2 : v.type === 'heli' ? 2.8 : (big ? 3.2 : 1.4);
      target = new THREE.Vector3(v.pos.x, v.pos.y + height, v.pos.z);
      fov = 66 + Math.min(22, v.speed * 0.28) + (v.boosting ? 6 : 0);
      if (this.camMode === 2) {
        // cockpit / hood view
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(v.mesh.quaternion);
        const u = new THREE.Vector3(0, 1, 0).applyQuaternion(v.mesh.quaternion);
        const eye = v.pos.clone().addScaledVector(u, v.type === 'plane' ? 2.1 : v.type === 'heli' ? 1.9 : v.type === 'boat' ? 1.9 : (v.spec.boxH || 1.25) * 0.85 + (v.type === 'bike' ? 0.5 : 0)).addScaledVector(f, v.type === 'plane' ? 0.6 : v.type === 'heli' ? 1.6 : v.spec.L * 0.05);
        cam.position.copy(eye);
        const look = eye.clone().addScaledVector(f, 20);
        const yawOff = wrap(this.camYaw - heading);
        look.applyAxisAngle && cam.up.copy(v.type === 'plane' ? u : new THREE.Vector3(0, 1, 0));
        cam.lookAt(look);
        cam.rotateY(yawOff * (this.lookIdle < 1.2 ? 1 : 0));
        cam.fov = 75; cam.updateProjectionMatrix();
        return;
      }
    } else {
      const p = this.player;
      height = p.swimming ? 0.6 : 1.55;
      target = new THREE.Vector3(p.pos.x, p.pos.y + height, p.pos.z);
      dist = 4.4 * zoom * [1, 1.6, 0.35][this.camMode];
      if (p.parachute) dist = 9;
      fov = 62 + Math.min(8, Math.hypot(p.vel.x, p.vel.z) * 0.8);
    }
    cam.up.set(0, 1, 0);
    // where the camera wants to be for a given pitch (with an over-the-shoulder offset on foot)
    const shoulder = v ? 0 : 0.45 * Math.min(1, dist / 3);
    const camAt = (pitch) => {
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      return new THREE.Vector3(target.x - Math.sin(this.camYaw) * cp * dist + Math.cos(this.camYaw) * shoulder, target.y + sp * dist, target.z - Math.cos(this.camYaw) * cp * dist - Math.sin(this.camYaw) * shoulder);
    };
    let desired = camAt(this.camPitch);
    const lookAt = new THREE.Vector3(target.x, target.y + (v ? 0.4 : 0.15), target.z);
    let lookDir = lookAt.clone().sub(desired).normalize();
    const keep = 0.35;   // metres kept between the lens and any wall
    let t = w.cameraClear(target, desired);
    if (t < 1) {
      // blocked: like GTA, first try swinging up over the obstacle before pulling in tight
      let best = desired, bt = t;
      for (const lift of [0.3, 0.6, 0.95]) {
        const cand = camAt(Math.min(1.3, this.camPitch + lift)), ct = w.cameraClear(target, cand);
        if (ct > bt + 0.25) { best = cand; bt = ct; if (ct >= 1) break; }
      }
      lookDir = lookAt.clone().sub(best).normalize();
      desired = target.clone().lerp(best, Math.max(0, bt - keep / dist));
    }
    const gy = w.heightAt(desired.x, desired.z) + 0.6;
    if (desired.y < gy) desired.y = gy;
    const lag = v ? Math.min(1, dt * 12) : Math.min(1, dt * 20);
    if (cam.position.distanceToSquared(desired) > 400) cam.position.copy(desired);   // teleports / respawns
    else cam.position.lerp(desired, lag);
    // the lagging camera can swing through a corner: re-check where it actually ended up
    const t2 = w.cameraClear(target, cam.position);
    if (t2 < 1) { const d2 = cam.position.distanceTo(target) || 1; cam.position.copy(target.clone().lerp(cam.position, Math.max(0, t2 - keep / d2))); }
    // never look at the inside of your own head
    const camD = cam.position.distanceTo(target);
    if (!v || v.spec.rider || v.type === 'bike') this.player.mesh.visible = !this.player.gone && camD > 0.95 && !(v && this.camMode === 2);
    if (v) v.mesh.visible = camD > 0.8 || this.camMode === 2;
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.6; cam.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }
    // aim along the intended line (looking "at" the target from 30 cm away would spin the view)
    if (camD > 1.2) cam.lookAt(lookAt); else cam.lookAt(cam.position.clone().add(lookDir));
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- loop
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.fpsT += dt; this.frames++;
    if (this.fpsT > 1) { $('fps').textContent = `${this.frames} fps${this.dynScale < 0.99 ? ' · ' + Math.round(this.dynScale * 100) + '% res' : ''}`; this.adaptResolution(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; }
    const inp = this.input.read();
    const pr = inp.pressed;
    if (this.started) {
      if (pr.has('phone') && !this.hud.menuOpen && !this.hud.mapOpen) this.hud.togglePhone();
      if (pr.has('map') && !this.hud.phoneOpen) this.hud.toggleMap();
      if (pr.has('pause')) { if (this.hud.phoneOpen) this.hud.togglePhone(false); else if (this.hud.mapOpen) this.hud.toggleMap(false); else this.hud.toggleMenu(!this.hud.menuOpen, 'settings'); }
      if (pr.has('vehicles')) this.hud.toggleMenu(!this.hud.menuOpen, 'vehicles');
      if (pr.has('help')) $('help').hidden = !$('help').hidden;
    }
    if (!this.paused && this.started && dt > 1e-4) this.step(dt, inp);
    else if (this.started) this.updateCamera(0, { lookX: 0, lookY: 0, wheel: 0 });
    this.input.endFrame();
    this.render();
  }

  step(dt, inp) {
    const pr = inp.pressed, w = this.world;
    this.lastDt = dt; this.lastPressed = pr;
    if (this.deathT > 0) { this.deathT -= dt; if (this.deathT <= 0) this.respawn(); }
    if (pr.has('camera')) this.camMode = (this.camMode + 1) % 3;
    if (pr.has('radio')) this.hud.toast(this.audio.toggleRadio() ? '📻 Boiler FM 88.8 — Wabash synthwave' : 'Radio off');
    if (pr.has('horn') && this.vehicle) { this.audio.horn(); for (const p of this.traffic.peds) if (p.pos.distanceTo(this.focus) < 25) p.flee = 5; }
    if (pr.has('siren') && this.vehicle?.parts.beacons.length) { this.vehicle.sirenOn = !this.vehicle.sirenOn; }
    if (pr.has('enter') && this.deathT <= 0) {
      if (this.vehicle) { if (!this.vehicle.airborne || this.vehicle.pos.y - w.heightAt(this.vehicle.pos.x, this.vehicle.pos.z) > 12 || this.vehicle.speed < 3) this.exitVehicle(); }
      else if (!this.tryEnter()) this.hud.toast('No vehicle nearby — press V to spawn one');
    }
    const v = this.vehicle;
    // simulate
    if (v) {
      const ctl = this.vehicleControls(inp, v);
      v.headlights = this.env.night > 0.35;
      const sub = dt > 1 / 50 ? 2 : 1;
      for (let i = 0; i < sub; i++) v.update(dt / sub, this.deathT > 0 ? null : ctl, this.fx);
      this.headlight.intensity = v.headlights && v.type !== 'plane' ? 60 : 0;
      for (const e of v.events) {
        if (e.crash) this.onCrash(e.crash, v.pos);
        if (e === 'splash') this.audio.splash();
        if (e === 'crash') { this.shake = 1; }
      }
      // stunt jumps
      if ((v.type === 'car' || v.type === 'bike') && !v.onGround && v.inWater === 0) this.airTime += dt;
      else if (this.airTime > 0) {
        if (this.airTime > 1.3 && v.onGround) { const b = Math.round(this.airTime * 160); this.addMoney(b); this.hud.toast(`STUNT JUMP! ${this.airTime.toFixed(1)}s airtime  +$${b}`, 'good'); this.audio.chime(true); }
        this.airTime = 0;
      }
      if (this.player.mesh.parent !== this.scene) this.player.char.update(dt, 'ride', 0);
      if ((v.type === 'car' || v.type === 'bike') && v.inWater > 1.5) { this.exitVehicle(true); this.hud.toast('Your vehicle sank in the Wabash!'); }
      if (v.type === 'plane' && pr.has('enter') && v.airborne) { /* handled above */ }
    } else {
      const pl = this.player;
      if (pr.has('horn') && pl.useMedkit()) { this.hud.toast(`+50 health  (${pl.medkits} medkits left)`, 'good'); this.audio.chime(true); }
      pl.update(dt, { x: inp.moveX, y: inp.moveY, run: inp.shift, jump: inp.jump, punch: pr.has('punch'), kick: pr.has('kick') }, this.camYaw);
      for (const e of pl.events) if (e === 'punch' || e === 'kick') this.melee(e === 'kick' ? 34 : 22, e === 'kick' ? 1.8 : 1.5);
      if (pl.parachute) {
        if (!this.chute) {
          this.chute = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, 1.0), new THREE.MeshStandardMaterial({ color: 0xcfb991, side: THREE.DoubleSide }));
          this.scene.add(this.chute);
        }
        this.chute.visible = true;
        this.chute.position.copy(pl.pos).y += 5.5;
        pl.vel.y = Math.max(pl.vel.y, -5);
        if (pl.onGround || pl.swimming) { pl.parachute = false; }
      } else if (this.chute) this.chute.visible = false;
      for (const e of pl.events) if (e === 'hurt') this.shake = 0.5;
      // traffic hits the player on foot
      for (const c of [...this.traffic.cars, ...this.police.units]) {
        const cv = c.v;
        if (cv.speed > 4 && cv.pos.distanceTo(pl.pos) < cv.radius + 0.8 && Math.abs(cv.pos.y - pl.pos.y) < 2) { pl.knock(cv.vel.clone().multiplyScalar(0.8)); this.audio.crash(cv.speed * 0.4); }
      }
    }
    // explosions of any vehicle
    for (const pv of [...this.parked, ...this.traffic.cars.map(c => c.v), ...this.police.units.map(u => u.v)]) {
      if (pv !== v && pv !== undefined && pv.events.includes('explode')) this.handleExplosion(pv);
    }
    if (v?.events.includes('explode')) this.handleExplosion(v);
    for (const pv of this.parked) if (pv !== v && !pv.kinematic && (pv.speed > 0.05 || !pv.onGround || pv.burn > 0 || pv.type === 'boat' || pv.type === 'heli' && pv.rotorSpeed > 0.01)) pv.update(dt, null, this.fx);

    this.resolveMelee(dt);
    this.focus.copy(v ? v.pos : this.player.pos);
    if (this.player.hp <= 0 && this.deathT <= 0) this.wasted();
    this.traffic.update(dt, this.focus, v, v ? null : this.player);
    this.police.update(dt, this.focus, v, this.player);
    this.missions.update(dt, this.focus, v, inp);
    for (const a of this.actors.slice()) a.update(dt);
    for (const sc of this.scripts.slice()) sc.update(dt);
    this.jobs.update(dt);
    if (pr.has('endjob') && this.jobs.active) this.jobs.end();
    this.updateGPS(dt);
    // environment
    const snap = this.quality.shadowRange * 2 / (this.quality.shadows || 512);
    const sf = new THREE.Vector3(Math.round(this.focus.x / snap) * snap, this.focus.y, Math.round(this.focus.z / snap) * snap);
    this.env.update(dt, sf, inp.timeFast);
    this.world.update(dt, this.env.night, this.focus);
    this.fx.update(dt);
    this.updateCamera(dt, inp);
    this.snow?.update(dt, this.camera);
    // audio
    const sirenD = Math.min(...this.police.units.map(u => u.v.pos.distanceTo(this.focus)), v?.sirenOn ? 0 : Infinity, ...this.traffic.cars.filter(c => c.v.sirenOn).map(c => c.v.pos.distanceTo(this.focus)));
    this.audio.update(dt, v, v ? v.speed : Math.hypot(this.player.vel.x, this.player.vel.z), sirenD);
    this.hud.update(dt);
    this.saveT = (this.saveT || 0) + dt;
    if (this.saveT > 20) { this.saveT = 0; this.persist(); }
  }

  // fists and feet: hit whoever is in front of you
  melee(dmg, reach) {
    const pl = this.player, fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
    this.meleeQueue = { t: 0.16, dmg, reach, fx, fz };
  }
  resolveMelee(dt) {
    const q = this.meleeQueue; if (!q) return;
    q.t -= dt; if (q.t > 0) return;
    this.meleeQueue = null;
    const pl = this.player;
    let best = null, bd = q.reach;
    const consider = (o, kind) => {
      const dx = o.pos.x - pl.pos.x, dz = o.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * q.fx + dz * q.fz) / (d || 1) > 0.35 && Math.abs(o.pos.y - pl.pos.y) < 1.2) { bd = d; best = { o, kind, dx: dx / (d || 1), dz: dz / (d || 1) }; }
    };
    for (const p of this.traffic.peds) if (!p.fly && !(p.down > 0)) consider(p, 'ped');
    for (const a of this.actors) if (a.hittable && !a.isDown) consider(a, a.cop ? 'cop' : 'npc');
    if (!best) { this.audio.whoosh?.(); return; }
    this.audio.punch?.(q.dmg);
    this.shake = Math.min(1, this.shake + 0.15);
    const o = best.o;
    o.hp = (o.hp ?? 100) - q.dmg;
    if (best.kind === 'ped') {
      this.traffic.hitPed(o, best.dx, best.dz, q.dmg);
      this.karma(-3);
      if (this.police.copSees?.(pl.pos, 45) || Math.random() < 0.15) this.police.crime(1, 'Assault');
    } else {
      o.hit(best.dx, best.dz, q.dmg);
      if (best.kind === 'cop') { this.karma(-6); this.police.crime(2, 'Assaulted an officer'); }
      else if (!o.hostile && !o.label && this.jobs.active !== 'police') this.karma(-2);
    }
  }
  karma(n) { this.save.karma = Math.max(-100, Math.min(100, (this.save.karma || 0) + n)); }

  handleExplosion(pv) {
    if (pv.exploded) return;
    pv.exploded = true;
    this.fx.explode(pv.pos.clone().setY(pv.pos.y + 1));
    this.audio.explosion();
    this.shake = 1;
    const d = pv.pos.distanceTo(this.focus);
    if (pv === this.vehicle) { this.player.hp = 0; this.exitVehicle(true); this.player.gone = true; }
    else if (!this.vehicle && d < 9) { this.player.knock(this.player.pos.clone().sub(pv.pos).setY(0).normalize().multiplyScalar(14)); this.player.hp -= 50; }
    for (const c of this.traffic.cars) if (c.v.pos.distanceTo(pv.pos) < 10 && c.v !== pv) { this.traffic.wreck(c, c.v.pos.clone().sub(pv.pos).setY(0).normalize().multiplyScalar(8)); c.v.damage(50); }
  }

  render() {
    if (this.grade) { this.grade.uniforms.time.value = (performance.now() / 1000) % 100; this.grade.uniforms.night.value = this.env?.night || 0; }
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
}

// pick a sensible starting quality from the GPU name (integrated laptop GPUs get Medium/Low)
function detectQuality(touch) {
  if (touch) return 'low';
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) + '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/swiftshader|llvmpipe|software|mali|adreno|powervr/i.test(name)) return 'low';
    if (/intel/i.test(name)) return /iris\s*(xe|plus)|arc/i.test(name) ? 'medium' : 'low';
    if (/apple m\d|apple gpu/i.test(name)) return /m\d\s*(pro|max|ultra)/i.test(name) ? 'high' : 'medium';
    if (/rtx|radeon rx|geforce gtx 1[06-9]|rx\s*[5-7]\d{3}/i.test(name)) return 'high';
    return 'medium';
  } catch { return 'medium'; }
}

function save_hours(s) { return typeof s.hours === 'number' && !isNaN(s.hours); }

const game = new Game();
game.init().catch((e) => {
  console.error(e);
  $('loadmsg').textContent = 'Failed to load: ' + e.message + ' — make sure you started the local server (npm start).';
});
