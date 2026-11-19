// Lightweight particle effects: smoke, tyre smoke, splashes, explosions.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.tex = glowTexture();
    this.pool = []; this.live = [];
    this.flash = new THREE.PointLight(0xffa040, 0, 120, 1.6);
    scene.add(this.flash);
    this.flashT = 0;
  }
  sprite() {
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: true }));
      this.scene.add(s);
    }
    s.visible = true;
    return s;
  }
  emit(kind, p, v = null, n = 1) {
    if (this.live.length > 600) return;
    for (let i = 0; i < n; i++) {
      const s = this.sprite();
      const r = () => Math.random() - 0.5;
      const o = { s, kind, life: 1, age: 0, vel: new THREE.Vector3(), size: 1, grow: 1, fade: 1 };
      s.position.copy(p);
      const m = s.material;
      m.blending = THREE.NormalBlending;
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
      } else if (kind === 'wake') {
        m.color.setRGB(0.9, 0.95, 1); o.life = 1.8; o.size = 1.2; o.grow = 3; o.fade = 0.5;
        o.vel.set(r() * 0.6, 0.1, r() * 0.6);
      }
      if (v) o.vel.addScaledVector(v, kind === 'fire' ? 0.3 : 0.15);
      s.scale.setScalar(o.size);
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
      if (t >= 1) { o.s.visible = false; this.pool.push(o.s); this.live.splice(i, 1); continue; }
      if (o.gravity) o.vel.y -= 9.8 * dt;
      o.vel.multiplyScalar(Math.exp(-dt * 0.8));
      o.s.position.addScaledVector(o.vel, dt);
      o.s.scale.setScalar(o.size * (1 + o.grow * t));
      o.s.material.opacity = o.fade * (1 - t) * (o.kind === 'fire' ? 1 : Math.min(1, t * 6));
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.intensity = this.flashT * 4000;
  }
}
