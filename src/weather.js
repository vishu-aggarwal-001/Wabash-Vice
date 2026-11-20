// Weather: clear, overcast or snow. Snow settles on every upward-facing surface
// (roofs, lawns, parked cars, tree tops) through a small patch to Three.js's standard
// material shader, and flakes fall in a box that follows the camera (all on the GPU).
import * as THREE from 'three';

export const WEATHERS = ['clear', 'overcast', 'snow', 'snowsun'];
export const snowy = (w) => w === 'snow' || w === 'snowsun';

export function pickWeather(setting) {
  if (WEATHERS.includes(setting)) return setting;
  const r = Math.random();
  return r < 0.3 ? 'clear' : r < 0.42 ? 'overcast' : r < 0.65 ? 'snow' : 'snowsun';
}

// Must run before any material compiles. Materials can opt out with defines.NO_SNOW,
// or take less snow with defines.SNOW_SCALE (roads keep their tyre tracks).
export function installSnowShader(amount) {
  if (amount <= 0) return;
  const inject = `
#if defined( STANDARD ) && !defined( NO_SNOW )
  #ifndef SNOW_SCALE
    #define SNOW_SCALE 1.0
  #endif
  {
    vec3 snowN = inverseTransformDirection( normal, viewMatrix );
    float snowF = smoothstep( 0.55, 0.86, snowN.y ) * ${amount.toFixed(3)} * SNOW_SCALE;
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.89, 0.93 ), snowF );
    roughnessFactor = mix( roughnessFactor, 0.72, snowF );
    metalnessFactor = mix( metalnessFactor, 0.0, snowF );
  }
#endif
`;
  THREE.ShaderChunk.emissivemap_fragment = THREE.ShaderChunk.emissivemap_fragment + inject;
}

export class Snowfall {
  constructor(scene, count = 9000) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(110, 50, 110) }, uWind: { value: new THREE.Vector2(0.8, 0.3) }, uOpacity: { value: 0.85 } },
      vertexShader: `
        uniform float uTime; uniform vec3 uCam, uBox; uniform vec2 uWind;
        varying float vA;
        void main() {
          vec3 r = position;
          float speed = 1.1 + r.x * 0.9;
          vec3 p;
          p.y = mod(r.y * uBox.y - uTime * speed, uBox.y) - uBox.y * 0.45;
          p.x = r.x * uBox.x + uWind.x * uTime + sin(uTime * 0.7 + r.z * 60.0) * 1.2;
          p.z = r.z * uBox.z + uWind.y * uTime + cos(uTime * 0.6 + r.x * 50.0) * 1.2;
          p.xz = mod(p.xz - uCam.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
          vec3 w = vec3(uCam.x + p.x, uCam.y + p.y, uCam.z + p.z);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = clamp((0.6 + r.z * 0.8) * 340.0 / d, 1.0, 9.0);
          vA = smoothstep(55.0, 20.0, d) * smoothstep(0.3, 1.5, d);
        }`,
      fragmentShader: `
        uniform float uOpacity; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vec3(0.97), smoothstep(0.5, 0.1, d) * vA * uOpacity);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 20;
    this.points.userData.noAO = true;
    scene.add(this.points);
  }
  update(dt, cam) {
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uCam.value.copy(cam.position);
  }
}
