// The planet: Cesium globe, satellite imagery, worldwide terrain, clouds, time of day.
// Works with no account at all (Esri satellite imagery + AWS open terrain tiles). If the player pastes a
// free Cesium ion token in Settings, it upgrades to Cesium World Terrain, Bing imagery, night city lights
// and Google photorealistic 3D cities.
/* global Cesium */
import { DEG } from './math.js';

// The game's own Cesium ion token (free plan), built in at the owner's request so everyone gets
// Cesium World Terrain, Bing imagery and Google photorealistic 3D cities. A token pasted in Settings
// is used instead. If it stops working or runs out for the month, the game uses the free world map.
export const BUILT_IN_ION_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IlljZ3VjbEl4YXJtTzNGVFYiLCJqdGkiOiI2MTc4NjFhNS04ZDMzLTRkMjctYTNiYi0yMTRlYmE1MjE1ZTciLCJpZCI6NTU4MzQzLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3OTU4MTA5MTV9.9pmAUDOCgFXZQCfGcucQR9rHvk3lRSDVfwgKSgrrlDs';

// ------------------------------------------------------------ keyless worldwide terrain (Terrarium PNG tiles)
class TerrariumTerrainProvider {
  constructor() {
    this._tilingScheme = new Cesium.WebMercatorTilingScheme();
    this._errorEvent = new Cesium.Event();
    this._credit = new Cesium.Credit('Terrain: Mapzen / AWS Open Data Terrain Tiles (SRTM, GMTED, ETOPO1 and others)');
    this._size = 65;
    this._maxLevel = 15;
    this._levelZeroError = Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
      this._tilingScheme.ellipsoid, this._size, this._tilingScheme.getNumberOfXTilesAtLevel(0)) * 2;
    this._canvas = document.createElement('canvas');
    this._canvas.width = this._canvas.height = 256;
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
    this.failures = 0;
  }
  get tilingScheme() { return this._tilingScheme; }
  get errorEvent() { return this._errorEvent; }
  get credit() { return this._credit; }
  get hasWaterMask() { return false; }
  get hasVertexNormals() { return false; }
  get availability() { return undefined; }
  get ready() { return true; }
  getLevelMaximumGeometricError(level) { return this._levelZeroError / (1 << level); }
  getTileDataAvailable(x, y, level) { return level <= this._maxLevel; }
  loadTileDataAvailability() { return undefined; }
  requestTileGeometry(x, y, level, request) {
    const res = new Cesium.Resource({ url: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${level}/${x}/${y}.png`, request });
    const p = res.fetchImage({ preferImageBitmap: true });
    if (!p) return undefined; // throttled, Cesium will ask again
    const n = this._size;
    const mask = level < this._maxLevel ? 15 : 0;
    return p.then((img) => {
      const ctx = this._ctx;
      ctx.clearRect(0, 0, 256, 256);
      ctx.drawImage(img, 0, 0, 256, 256);
      const px = ctx.getImageData(0, 0, 256, 256).data;
      const heights = new Float32Array(n * n);
      for (let j = 0; j < n; j++) {
        const v = (j / (n - 1)) * 255;
        const y0 = Math.floor(v), y1 = Math.min(255, y0 + 1), fy = v - y0;
        for (let i = 0; i < n; i++) {
          const u = (i / (n - 1)) * 255;
          const x0 = Math.floor(u), x1 = Math.min(255, x0 + 1), fx = u - x0;
          const hAt = (xx, yy) => { const k = (yy * 256 + xx) * 4; return px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768; };
          const h = (hAt(x0, y0) * (1 - fx) + hAt(x1, y0) * fx) * (1 - fy) + (hAt(x0, y1) * (1 - fx) + hAt(x1, y1) * fx) * fy;
          heights[j * n + i] = Math.max(h, -500);
        }
      }
      return new Cesium.HeightmapTerrainData({ buffer: heights, width: n, height: n, childTileMask: mask });
    }).catch(() => {
      this.failures++;
      return new Cesium.HeightmapTerrainData({ buffer: new Float32Array(n * n), width: n, height: n, childTileMask: mask });
    });
  }
}

export class World {
  constructor(container, settings) {
    this.settings = settings;
    const ion = ((settings.ionToken || '').trim() || BUILT_IN_ION_TOKEN).trim();
    if (ion) Cesium.Ion.defaultAccessToken = ion;
    this.hasIon = !!ion;
    this.viewer = new Cesium.Viewer(container, {
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
      baseLayer: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(), shouldAnimate: true,
      msaaSamples: settings.quality >= 2 ? 4 : 1, requestRenderMode: false, scene3DOnly: true,
      contextOptions: { webgl: { powerPreference: 'high-performance' } },
    });
    const v = this.viewer, scene = v.scene, globe = scene.globe;
    v.cesiumWidget.creditContainer.classList.add('credits');
    scene.screenSpaceCameraController.enableInputs = false;
    scene.camera.frustum.near = 0.2;
    globe.enableLighting = true;
    globe.dynamicAtmosphereLighting = true;
    globe.dynamicAtmosphereLightingFromSun = true;
    globe.showGroundAtmosphere = true;
    globe.depthTestAgainstTerrain = true;
    globe.tileCacheSize = 400;
    globe.preloadAncestors = true;
    globe.baseColor = Cesium.Color.fromCssColorString('#1d3550');
    scene.fog.enabled = true;
    scene.fog.density = 1.6e-4;
    scene.fog.minimumBrightness = 0.08;
    scene.highDynamicRange = settings.quality >= 2;
    scene.skyAtmosphere.show = true;
    scene.postProcessStages.fxaa.enabled = true;
    this.applyQuality(settings.quality);
    this.tileset = null; this.terrarium = null;
    this.clouds = null; this.cloudList = [];
    this.excludeFromPick = [];
  }

  async init() {
    const v = this.viewer, scene = v.scene, globe = scene.globe;
    // imagery
    let base = null;
    if (this.hasIon) {
      try { base = Cesium.ImageryLayer.fromProviderAsync(Cesium.IonImageryProvider.fromAssetId(2)); } catch (e) { console.warn(e); }
      if (base) {
        const b0 = base;
        // fall back to Esri if Bing can't be reached at all (ion quota used up) or its tiles keep failing
        b0.errorEvent.addEventListener(() => this._useEsri(b0));
        b0.readyEvent.addEventListener((prov) => {
          let fails = 0; const t0 = performance.now();
          prov.errorEvent.addEventListener(() => { if (++fails > 20 && performance.now() - t0 < 60000) this._useEsri(b0); });
        });
      }
    }
    if (!base) base = this._esri();
    v.imageryLayers.add(base, 0);
    // terrain
    let terrainOk = false;
    if (this.hasIon) {
      try {
        globe.terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1, { requestVertexNormals: true, requestWaterMask: true });
        terrainOk = true;
        // night-time city lights (NASA Black Marble)
        // only if the account has added NASA Black Marble (asset 3812) from the ion Asset Depot
        Cesium.IonImageryProvider.fromAssetId(3812).then((p) => {
          const night = v.imageryLayers.addImageryProvider(p);
          night.dayAlpha = 0.0; night.nightAlpha = 0.9; night.brightness = 2.2;
        }).catch(() => {});
        globe.showWaterEffect = true;
      } catch (e) { console.warn('ion terrain failed', e); this.ionError = 'Photorealistic mode is unavailable right now, using the free world map instead.'; this.hasIon = false; }
    }
    if (!terrainOk) { this.terrarium = new TerrariumTerrainProvider(); globe.terrainProvider = this.terrarium; }
    if (this.hasIon && this.settings.photoreal) await this.setPhotoreal(true);
    this.initClouds();
  }

  _useEsri(layer) {
    if (this._esriOn) return; this._esriOn = true;
    const L = this.viewer.imageryLayers; if (L.contains(layer)) L.remove(layer);
    L.add(this._esri(), 0);
  }

  _esri() {
    return new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      maximumLevel: 19, credit: new Cesium.Credit('Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'),
    }));
  }

  async setPhotoreal(on) {
    const scene = this.viewer.scene;
    if (on && !this.tileset && this.hasIon) {
      try {
        this.tileset = await Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
        this.tileset.maximumScreenSpaceError = this.settings.quality >= 3 ? 8 : 16;
        scene.primitives.add(this.tileset);
      } catch (e) { console.warn('3D tiles failed', e); this.tileset = null; return false; }
    }
    if (this.tileset) { this.tileset.show = on; scene.globe.show = !on; }
    return true;
  }

  applyQuality(q) {
    const v = this.viewer, scene = v.scene;
    const dpr = window.devicePixelRatio || 1;
    v.resolutionScale = [0.6, 0.85, 1, Math.min(dpr, 2)][q] ?? 1;
    v.useBrowserRecommendedResolution = q < 3;
    scene.globe.maximumScreenSpaceError = [4, 2.5, 1.75, 1.25][q] ?? 2;
    v.shadows = q >= 2;
    if (q >= 2) {
      v.shadowMap.softShadows = q >= 3;
      v.shadowMap.size = q >= 3 ? 4096 : 2048;
      v.shadowMap.maximumDistance = 1500;
      v.terrainShadows = Cesium.ShadowMode.RECEIVE_ONLY;
    }
    scene.globe.shadows = q >= 2 ? Cesium.ShadowMode.RECEIVE_ONLY : Cesium.ShadowMode.DISABLED;
    if (this.tileset) this.tileset.maximumScreenSpaceError = q >= 3 ? 8 : 16;
  }

  // ---------------------------------------------------------- time of day (hour = local solar time 0..24)
  setTime(hour, lonDeg) {
    const now = new Date();
    const utcHours = hour - lonDeg / 15;
    const d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + utcHours * 3600e3;
    this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date(d));
    this.viewer.clock.multiplier = 1;
  }
  setRealTime() { this.viewer.clock.currentTime = Cesium.JulianDate.now(); }
  localSolarHour(lonDeg) {
    const d = Cesium.JulianDate.toDate(this.viewer.clock.currentTime);
    return (((d.getUTCHours() + d.getUTCMinutes() / 60 + lonDeg / 15) % 24) + 24) % 24;
  }

  // ---------------------------------------------------------- ground height
  // Height of the ground (WGS84 ellipsoid metres). With the 3D cities on, scene.sampleHeight reads the
  // photorealistic tiles (buildings included); it renders a small depth pass, so it is rate-limited.
  // If nothing loaded is under that point, the last background terrain probe is used.
  groundHeight(latDeg, lonDeg, fallback) {
    const scene = this.viewer.scene;
    const carto = Cesium.Cartographic.fromDegrees(lonDeg, latDeg);
    if (this.tileset && this.tileset.show && scene.sampleHeightSupported) {
      const c = this._sh, now = performance.now();
      if (c && now - c.t < 90 && Math.abs(c.lat - latDeg) < 1e-4 && Math.abs(c.lon - lonDeg) < 1e-4) return c.h;
      let h;
      try { h = scene.sampleHeight(carto, this.excludeFromPick); } catch { h = undefined; }
      if (h !== undefined) { this._sh = { t: now, lat: latDeg, lon: lonDeg, h }; return h; }
    }
    const h = scene.globe.show ? scene.globe.getHeight(carto) : undefined;
    if (h !== undefined) return h;
    const p = this.probe;
    if (p && Math.abs(p.lat - latDeg) < 0.006 && Math.abs(p.lon - lonDeg) < 0.006 / Math.max(0.2, Math.cos(latDeg * DEG))) return p.h;
    return fallback;
  }
  // highest terrain (m, ellipsoid) at these [lat, lon] points, from coarse terrain tiles (resolves null if unknown)
  async terrainMax(points, timeoutMs = 6000) {
    const tp = this.viewer.scene.globe.terrainProvider;
    if (!tp || tp instanceof Cesium.EllipsoidTerrainProvider) return null;
    const pos = points.map(([la, lo]) => Cesium.Cartographic.fromDegrees(lo, la));
    const job = Cesium.sampleTerrain(tp, 10, pos).then((r) => r.reduce((m, c) => (Number.isFinite(c.height) ? Math.max(m, c.height) : m), -1e9)).catch(() => null);
    const res = await Promise.race([job, new Promise((ok) => setTimeout(() => ok(null), timeoutMs))]);
    return res === -1e9 ? null : res;
  }
  // background terrain probe (async, about once a second) so there is always real ground to hit,
  // even where nothing has been drawn yet or the globe is hidden behind the 3D cities
  probeTerrain(latDeg, lonDeg) {
    if (this._probing) return;
    const tp = this.viewer.scene.globe.terrainProvider;
    if (!tp || tp instanceof Cesium.EllipsoidTerrainProvider) return;
    this._probing = true;
    const pos = [Cesium.Cartographic.fromDegrees(lonDeg, latDeg)];
    const level = tp instanceof Cesium.CesiumTerrainProvider ? 12 : 11;
    Cesium.sampleTerrain(tp, level, pos).then((r) => {
      const h = r[0].height; if (Number.isFinite(h)) this.probe = { lat: latDeg, lon: lonDeg, h };
    }).catch(() => {}).finally(() => { this._probing = false; });
  }
  tilesReady() {
    const s = this.viewer.scene;
    return s.globe.tilesLoaded && (!this.tileset || !this.tileset.show || this.tileset.tilesLoaded);
  }

  // ---------------------------------------------------------- clouds that follow you around
  initClouds() {
    this.clouds = this.viewer.scene.primitives.add(new Cesium.CloudCollection({ noiseDetail: 16, noiseOffset: Cesium.Cartesian3.ZERO }));
    this.excludeFromPick.push(this.clouds);
    this.cloudSeed = 1;
  }
  _rand() { this.cloudSeed = (this.cloudSeed * 16807) % 2147483647; return (this.cloudSeed - 1) / 2147483646; }
  updateClouds(latDeg, lonDeg, groundH, cover, base, force) {
    if (!this.clouds) return;
    const want = Math.round([0, 70, 160, 280][cover] ?? 0);
    const radius = 22000;
    const mPerLat = 111320, mPerLon = 111320 * Math.cos(latDeg * DEG);
    const baseAlt = groundH + base;
    if (force || this.cloudList.length !== want) {
      this.clouds.removeAll(); this.cloudList = [];
      for (let i = 0; i < want; i++) this.cloudList.push(this._spawnCloud(latDeg, lonDeg, baseAlt, radius, mPerLat, mPerLon, true));
      return;
    }
    for (let i = 0; i < this.cloudList.length; i++) {
      const c = this.cloudList[i];
      const dx = (c.lon - lonDeg) * mPerLon, dy = (c.lat - latDeg) * mPerLat;
      if (dx * dx + dy * dy > radius * radius * 1.2) {
        this.clouds.remove(c.prim);
        this.cloudList[i] = this._spawnCloud(latDeg, lonDeg, baseAlt, radius, mPerLat, mPerLon, false);
      }
    }
  }
  _spawnCloud(lat, lon, alt, radius, mPerLat, mPerLon, anywhere) {
    const a = this._rand() * Math.PI * 2, r = anywhere ? Math.sqrt(this._rand()) * radius : radius * (0.85 + this._rand() * 0.15);
    const clat = lat + (Math.cos(a) * r) / mPerLat, clon = lon + (Math.sin(a) * r) / mPerLon;
    const sx = 900 + this._rand() * 2200, sy = sx * (0.6 + this._rand() * 0.4), sz = 350 + this._rand() * 600;
    const prim = this.clouds.add({
      position: Cesium.Cartesian3.fromDegrees(clon, clat, alt + this._rand() * 400 + sz * 0.5),
      scale: new Cesium.Cartesian2(sx, sz), maximumSize: new Cesium.Cartesian3(50, 22, 14 + this._rand() * 8),
      slice: 0.36 + this._rand() * 0.2, brightness: 1.0,
    });
    return { lat: clat, lon: clon, prim };
  }
}
