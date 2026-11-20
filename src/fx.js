// Lightweight particle effects: smoke, tyre smoke, splashes, explosions.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.tex = glowTexture();
    this.flameTex = flameTexture();
    this.pool = []; this.live = [];
    this.flash = new THREE.PointLight(0xffa040, 0, 120, 1.6);
    scene.add(this.flash);
    this.flashT = 0;
  }
  // one pool per texture, so a sprite never swaps its map (which would force a shader re-check)
  sprite(map = this.tex) {
    const pool = map === this.tex ? this.pool : (this.pool2 ||= []);
    let s = pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: true }));
      this.scene.add(s);
    }
    s.visible = true;
    return s;
  }
  emit(kind, p, v = null, n = 1) {
    if (this.live.length > 900) return;
    for (let i = 0; i < n; i++) {
      const s = this.sprite(kind === 'flame' ? this.flameTex : this.tex);
      const r = () => Math.random() - 0.5;
      const o = { s, kind, life: 1, age: 0, vel: new THREE.Vector3(), size: 1, grow: 1, fade: 1 };
      s.position.copy(p);
      const m = s.material;
      m.blending = THREE.NormalBlending;
      o.aspect = kind === 'flame' ? 1.7 : 1;
      if (kind === 'smoke') {
        m.color.setHSL(0, 0, 0.25 + Math.random() * 0.15); o.life = 2.5; o.size = 1.5; o.grow = 3; o.fade = 0.55;
        o.vel.set(r() * 1.5, 2 + Math.random() * 2, r() * 1.5);
      } else if (kind === 'tyre') {
        m.color.setHSL(0, 0, 0.82); o.life = 1.6; o.size = 0.8; o.grow = 2.5; o.fade = 0.45;
        o.vel.set(r() * 1.2, 0.6 + Math.random(), r() * 1.2);
      } else if (kind === 'dust') {
        m.color.setRGB(0.55, 0.48, 0.36); o.life = 1.2; o.size = 0.8; o.grow = 2; o.fade = 0.4;
        o.vel.set(r() * 2, 0.5 + Math.random(), r() * 2);
      } else if (kind === 'splash') {
        m.color.setRGB(0.85, 0.92, 1); o.life = 0.9; o.size = 0.6; o.grow = 1.5; o.fade = 0.8;
        o.vel.set(r() * 4, 3 + Math.random() * 4, r() * 4); o.gravity = true;
      } else if (kind === 'fire') {
        m.color.setRGB(1, 0.55 + Math.random() * 0.3, 0.15); m.blending = THREE.AdditiveBlending;
        o.life = 0.7 + Math.random() * 0.5; o.size = 2 + Math.random() * 2; o.grow = 3; o.fade = 1;
        o.vel.set(r() * 10, 2 + Math.random() * 8, r() * 10);
      } else if (kind === 'spark') {
        m.color.setRGB(1, 0.8, 0.4); m.blending = THREE.AdditiveBlending;
        o.life = 0.4; o.size = 0.25; o.grow = 0; o.fade = 1; o.gravity = true;
        o.vel.set(r() * 8, 2 + Math.random() * 4, r() * 8);
      } else if (kind === 'flame') {   // steady burning flame (fires)
        m.color.setRGB(1, 0.45 + Math.random() * 0.35, 0.1); m.blending = THREE.AdditiveBlending;
        o.life = 0.7 + Math.random() * 0.6; o.size = 1.5 + Math.random() * 1.3; o.grow = -0.55; o.fade = 0.95;
        o.vel.set(r() * 1.2, 2.8 + Math.random() * 2.6, r() * 1.2);
      } else if (kind === 'water') {   // hose / cannon jet: velocity comes from v
        m.color.setRGB(0.75, 0.86, 1); o.life = 1.1; o.size = 0.32 + Math.random() * 0.22; o.grow = 0.9; o.fade = 0.5; o.gravity = true; o.noDrag = true;
        o.vel.set(r() * 0.6, r() * 0.6, r() * 0.6);
      } else if (kind === 'blood') {   // small dark-red puff where a bullet hits a person
        m.color.setRGB(0.42, 0.02, 0.03); o.life = 0.45; o.size = 0.18; o.grow = 1.4; o.fade = 0.85; o.gravity = true;
        o.vel.set(r() * 2, 0.6 + Math.random() * 1.2, r() * 2);
      } else if (kind === 'blacksmoke') {   // thick smoke column over a fire
        m.color.setHSL(0, 0, 0.06 + Math.random() * 0.1); o.life = 4 + Math.random() * 2; o.size = 2.2; o.grow = 4; o.fade = 0.6;
        o.vel.set(r() * 1.2 + 0.6, 3 + Math.random() * 2, r() * 1.2);
      } else if (kind === 'wake') {
        m.color.setRGB(0.9, 0.95, 1); o.life = 1.8; o.size = 1.2; o.grow = 3; o.fade = 0.5;
        o.vel.set(r() * 0.6, 0.1, r() * 0.6);
      }
      if (v) o.vel.addScaledVector(v, kind === 'water' ? 1 : kind === 'fire' ? 0.3 : 0.15);
      s.scale.set(o.size, o.size * o.aspect, 1);
      m.opacity = o.fade;
      this.live.push(o);
    }
  }
  explode(p) {
    this.emit('fire', p, null, 40);
    this.emit('smoke', p, null, 25);
    this.emit('spark', p, null, 30);
    this.flash.position.copy(p).y += 3;
    this.flashT = 0.6;
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const o = this.live[i];
      o.age += dt;
      const t = o.age / o.life;
      if (t >= 1) { o.s.visible = false; (o.s.material.map === this.tex ? this.pool : this.pool2).push(o.s); this.live.splice(i, 1); continue; }
      if (o.gravity) o.vel.y -= 9.8 * dt;
      if (!o.noDrag) o.vel.multiplyScalar(Math.exp(-dt * 0.8));
      o.s.position.addScaledVector(o.vel, dt);
      const sc = o.size * (1 + o.grow * t); o.s.scale.set(sc, sc * o.aspect, 1);
      o.s.material.opacity = o.fade * (1 - t) * (o.kind === 'fire' || o.kind === 'flame' || o.kind === 'water' ? 1 : Math.min(1, t * 6));
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.intensity = this.flashT * 4000;
  }
}

// tongue-of-flame sprite: hot white-yellow core fading to orange and transparent, taller than wide
function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 92, 2, 32, 80, 60);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,200,80,0.95)'); g.addColorStop(0.55, 'rgba(255,110,20,0.55)'); g.addColorStop(1, 'rgba(160,30,0,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(32, 2); x.bezierCurveTo(52, 40, 62, 70, 58, 96); x.bezierCurveTo(54, 122, 10, 122, 6, 96); x.bezierCurveTo(2, 70, 12, 40, 32, 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
