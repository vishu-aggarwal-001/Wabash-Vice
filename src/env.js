// Sky, sun, moon, stars, clouds, fog and the day/night cycle.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import * as TX from './textures.js';

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.renderer = renderer; this.quality = quality;
    this.hours = 16.5;            // start in the late afternoon (golden hour soon)
    this.daySeconds = 24 * 60;    // one in-game day = 24 real minutes
    this.night = 0;

    this.sky = new Sky();
    this.sky.scale.setScalar(8000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.0035; u.mieDirectionalG.value = 0.88;
    this.sky.userData.noAO = true;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality.shadows > 0;
    const S = quality.shadowRange;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 1500 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.mapSize.setScalar(quality.shadows || 512);
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.4; this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4d5a3a, 0.9);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xb8c8d8, 1.25 / quality.drawDistance);
    this.fogBase = 1.25 / quality.drawDistance;

    // stars
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 2500; i++) {
      const v = new THREE.Vector3(TX.rnd() - 0.5, TX.rnd() * 0.9 + 0.05, TX.rnd() - 0.5).normalize().multiplyScalar(7000);
      sp.push(v.x, v.y, v.z);
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.userData.noAO = true;
    scene.add(this.stars);

    // moon
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 16), new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false }));
    this.moon.userData.noAO = true;
    scene.add(this.moon);

    // clouds
    const ct = TX.cloudTexture(); ct.repeat.set(5, 5);
    this.cloudMat = new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.7, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), this.cloudMat);
    this.clouds.rotation.x = Math.PI / 2; this.clouds.position.y = 1400;
    this.clouds.renderOrder = -1;
    this.clouds.userData.noAO = true;
    scene.add(this.clouds);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.lastEnvHour = -99;
    this.sunDir = new THREE.Vector3();
    this.update(0, new THREE.Vector3());
  }

  get clock() {
    const h = Math.floor(this.hours), m = Math.floor((this.hours - h) * 60);
    const ap = h >= 12 ? 'PM' : 'AM', hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
  }

  update(dt, focus, fast = false) {
    this.hours = (this.hours + dt * 24 / this.daySeconds * (fast ? 60 : 1)) % 24;
    // sun path for Lafayette in November: low southern arc
    const t = (this.hours - 7.65) / (17.35 - 7.65);          // 0 at sunrise, 1 at sunset
    const elev = Math.sin(Math.PI * t) * 31 * Math.PI / 180;
    const az = (-80 + 160 * t) * Math.PI / 180;            // east -> south -> west
    const dir = this.sunDir.set(-Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev));
    if (t < 0 || t > 1) {                                  // night: sun below horizon
      const nt = t < 0 ? (t + 1.28) / 1.28 : (t - 1) / 1.28;
      dir.set(-Math.sin(az), -Math.sin(Math.PI * Math.min(Math.max(nt, 0), 1)) * 0.6 - 0.02, Math.cos(az)).normalize();
    }
    const sunUp = dir.y;
    this.night = 1 - THREE.MathUtils.smoothstep(sunUp, -0.12, 0.06);
    const golden = (1 - THREE.MathUtils.smoothstep(sunUp, 0.02, 0.3)) * (1 - this.night);

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(dir);
    u.rayleigh.value = 1.6 + golden * 1.6;
    u.turbidity.value = 2.6 + golden * 4;

    // the sun light: follows the focus point so shadows stay crisp near the player
    const lightDir = sunUp > 0 ? dir : this.moonDir(dir);
    this.sun.position.copy(focus).addScaledVector(lightDir, 700);
    this.sun.target.position.copy(focus);
    const sunCol = new THREE.Color().setHSL(0.09 + 0.03 * (1 - golden), 0.25 + golden * 0.65, 0.62 + 0.38 * (1 - golden));
    if (sunUp > 0) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = 4.2 * THREE.MathUtils.smoothstep(sunUp, -0.02, 0.15);
    } else {
      this.sun.color.set(0x8fa6d8);
      this.sun.intensity = 0.35 * this.night;
    }
    this.hemi.intensity = 0.2 + 0.35 * (1 - this.night);
    this.hemi.color.setHSL(0.58, 0.5, 0.35 + 0.4 * (1 - this.night));
    this.hemi.groundColor.setHSL(0.22, 0.3, 0.12 + 0.18 * (1 - this.night));

    const day = new THREE.Color(0xa9c0d8), dusk = new THREE.Color(0xd9a27a), nightC = new THREE.Color(0x0b1220);
    const fog = day.clone().lerp(dusk, golden).lerp(nightC, this.night);
    this.scene.fog.color.copy(fog);
    this.scene.fog.density = this.fogBase * (1 + golden * 0.25 + this.night * 0.4);
    this.renderer.setClearColor(fog);
    this.renderer.toneMappingExposure = 0.55 + 0.25 * (1 - this.night) + this.night * 0.35;

    this.starMat.opacity = this.night;
    this.stars.position.copy(focus);
    this.moon.position.copy(focus).addScaledVector(this.moonDir(dir), 6500);
    this.moon.visible = this.night > 0.05;
    this.cloudMat.color.copy(new THREE.Color(1, 1, 1).lerp(new THREE.Color(1, 0.75, 0.6), golden).multiplyScalar(1 - 0.85 * this.night));
    this.cloudMat.map.offset.x += dt * 0.0008;
    this.clouds.position.x = focus.x; this.clouds.position.z = focus.z;
    this.sky.position.copy(focus);

    // regenerate reflections occasionally
    if (Math.abs(this.hours - this.lastEnvHour) > 0.25 || !this.envMap) {
      this.lastEnvHour = this.hours;
      const eu = this.envSky.material.uniforms;
      for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) eu[k].value = u[k].value;
      eu.sunPosition.value.copy(dir);
      if (this.envMap) this.envMap.dispose();
      this.envMap = this.pmrem.fromScene(this.envScene).texture;
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = 0.12 + 0.6 * (1 - this.night);
    }
  }

  moonDir(sunDir) { return new THREE.Vector3(-sunDir.x, Math.max(0.35, -sunDir.y), -sunDir.z).normalize(); }
}
