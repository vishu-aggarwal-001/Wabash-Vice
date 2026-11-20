// Melee weapons: bought at Levee Pawn & Loan, held in the right hand (fitted to the
// hand bone from the bind pose), swung with the punch button. Z cycles what you own.
import * as THREE from 'three';
import { textTexture } from './textures.js';

export const WEAPONS = [
  { id: 'fists', name: 'Fists', price: 0, dmg: 1, reach: 0, icon: '✊' },
  { id: 'knuckles', name: 'Brass knuckles', price: 150, dmg: 1.45, reach: 0, icon: '🥊' },
  { id: 'bat', name: 'Baseball bat', price: 250, dmg: 2.0, reach: 0.7, icon: '🏏', swing: true },
  { id: 'pipe', name: 'Lead pipe', price: 320, dmg: 2.2, reach: 0.55, icon: '🔩', swing: true },
  { id: 'hockey', name: 'Hockey stick', price: 380, dmg: 1.9, reach: 0.95, icon: '🏒', swing: true },
  { id: 'crowbar', name: 'Crowbar', price: 450, dmg: 2.4, reach: 0.5, icon: '🪛', swing: true },
  { id: 'golf', name: 'Golf club', price: 600, dmg: 2.2, reach: 0.9, icon: '⛳', swing: true },
  { id: 'sledge', name: 'Sledgehammer', price: 950, dmg: 3.1, reach: 0.65, icon: '🔨', swing: true, slow: true },
];
export const byWeapon = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
const PAWN = { name: 'Levee Pawn & Loan', at: [40.4176, -86.8903], color: 0xe23b3b };

const M = {
  wood: new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.55 }),
  tape: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8b9097, metalness: 0.9, roughness: 0.35 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x5c4436, metalness: 0.6, roughness: 0.7 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa3141c, metalness: 0.4, roughness: 0.4 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 1, roughness: 0.25 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }),
};
const cyl = (r1, r2, h, mat, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 10), mat); m.position.y = y; m.castShadow = true; return m; };
const bx = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };

// every model: long axis +Y, the grip at the origin
export function weaponMesh(id) {
  const g = new THREE.Group();
  if (id === 'bat') { g.add(cyl(0.018, 0.016, 0.22, M.tape, 0.02)); g.add(cyl(0.035, 0.017, 0.62, M.wood, 0.44)); g.add(cyl(0.036, 0.035, 0.08, M.wood, 0.79)); g.add(cyl(0.022, 0.022, 0.02, M.wood, -0.1)); }
  else if (id === 'pipe') { g.add(cyl(0.02, 0.02, 0.72, M.rust, 0.26)); g.add(cyl(0.027, 0.027, 0.06, M.rust, 0.6)); }
  else if (id === 'crowbar') { g.add(cyl(0.013, 0.013, 0.66, M.red, 0.24)); const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 6, 12, Math.PI), M.red); hook.position.set(0.05, 0.57, 0); g.add(hook); g.add(bx(0.04, 0.012, 0.03, M.red, 0.02, -0.12, 0)); }
  else if (id === 'hockey') { g.add(cyl(0.016, 0.016, 1.0, M.black, 0.36)); g.add(bx(0.3, 0.06, 0.02, M.black, 0.13, 0.88, 0)); }
  else if (id === 'golf') { g.add(cyl(0.013, 0.008, 0.95, M.steel, 0.38)); g.add(cyl(0.016, 0.014, 0.24, M.tape, 0.02)); g.add(bx(0.09, 0.05, 0.03, M.steel, 0.035, 0.87, 0)); }
  else if (id === 'sledge') { g.add(cyl(0.018, 0.016, 0.8, M.wood, 0.3)); g.add(bx(0.18, 0.08, 0.08, M.steel, 0, 0.72, 0)); }
  else if (id === 'knuckles') { for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.005, 6, 10), M.brass); r.position.set(0, 0, (i - 1.5) * 0.024); g.add(r); } g.add(bx(0.012, 0.03, 0.1, M.brass, -0.018, 0, 0)); }
  return g;
}

// fit a weapon into a character's right hand. Hand orientation comes from the bind pose
// (arms out, palms down): there a fist holds a stick pointing straight forward (+Z).
function bindQuat(skin, bone) {
  const sk = skin.skeleton, i = sk.bones.indexOf(bone);
  const m = new THREE.Matrix4().copy(skin.bindMatrix).multiply(new THREE.Matrix4().copy(sk.boneInverses[i]).invert());
  const q = new THREE.Quaternion(); m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  return q;
}
export function attachWeapon(char, id) {
  if (char.weaponObj) { char.weaponObj.parent?.remove(char.weaponObj); char.weaponObj = null; }
  if (char.grip) { for (const [b, r] of char.grip) b.quaternion.copy(r); char.grip = null; }
  char.weapon = byWeapon[id] || byWeapon.fists;
  if (!id || id === 'fists') return;
  const hand = char.bones?.RightHand; if (!hand) return;
  let skin = null; char.model.traverse(o => { if (!skin && o.isSkinnedMesh && o.skeleton.bones.includes(hand)) skin = o; });
  if (!skin) return;
  const sk = skin.skeleton, i = sk.bones.indexOf(hand);
  const bind = new THREE.Matrix4().copy(skin.bindMatrix).multiply(new THREE.Matrix4().copy(sk.boneInverses[i]).invert());
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  bind.decompose(p, q, s);
  const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(q.clone().invert()).normalize();
  // curl the fingers into a fist: about the model's forward axis in the bind pose
  char.grip = [];
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) for (let k = 1; k <= 3; k++) {
    const b = char.bones['RightHand' + f + k]; if (!b || !sk.bones.includes(b)) continue;
    const ax = new THREE.Vector3(0, 0, 1).applyQuaternion(bindQuat(skin, b).invert()).normalize();
    const ang = f === 'Thumb' ? (k === 1 ? 0.2 : 0.5) : [0, 1.35, 1.5, 1.0][k];
    char.grip.push([b, b.quaternion.clone(), new THREE.Quaternion().setFromAxisAngle(ax, ang)]);
  }
  const w = weaponMesh(id);
  w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  // grip: a bit toward the fingers, and scaled back to metres in bone space
  const tip = char.bones.RightHandMiddle1 || hand.children.find(c => c.isBone);
  if (tip) w.position.copy(tip.position).multiplyScalar(0.62);
  const ws = new THREE.Vector3(); char.model.updateMatrixWorld(true); hand.getWorldScale(ws);
  const ms = new THREE.Vector3(); char.mesh.getWorldScale(ms);
  w.scale.setScalar(ms.x / (ws.x || 1));
  if (id === 'knuckles') w.position.multiplyScalar(1.35);
  hand.add(w);
  char.weaponObj = w;
}

export class Pawn {
  constructor(g) {
    this.g = g; this.open = false;
    g.save.weapons ||= ['fists'];
    g.save.weapon ||= 'fists';
    this.buildUI();
    const [x0, z0] = g.world.toWorld(...PAWN.at);
    const n = g.world.nearestNode(x0, z0, 300), p = n >= 0 ? g.world.gNodes[n] : [x0, 0, z0];
    const nb = g.world.gAdj[n]?.[0], qn = nb !== undefined ? g.world.gNodes[nb] : [p[0] + 1, 0, p[2]];
    const dx = qn[0] - p[0], dz = qn[2] - p[2], l = Math.hypot(dx, dz) || 1;
    const r = g.world.collide(p[0] - dz / l * 9, p[2] + dx / l * 9, 0.6, p[1] + 0.3, p[1] + 2);
    const y = g.world.groundAt(r.x, r.z).y;
    const grp = new THREE.Group(); grp.position.set(r.x, y, r.z);
    const mat = new THREE.MeshBasicMaterial({ color: PAWN.color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), mat); beam.scale.set(1.4, 6, 1.4); beam.position.y = 3; grp.add(beam);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('🏏 ' + PAWN.name, { size: 46, bg: 'rgba(0,0,0,0.6)' }), fog: false }));
    label.scale.set(9, 2.25, 1); label.position.y = 6.8; grp.add(label);
    g.scene.add(grp);
    this.marker = { x: r.x, z: r.z, grp };
    g.blips.push({ get: () => ({ x: r.x, z: r.z }), color: '#e23b3b', size: 5 });
  }
  get current() { return byWeapon[this.g.save.weapon] || byWeapon.fists; }
  equip(id) {
    const g = this.g; g.save.weapon = id;
    attachWeapon(g.player.char, id);
    document.querySelector('[data-btn="!punch"]')?.replaceChildren(document.createTextNode(byWeapon[id].icon));
    g.persist();
  }
  cycle() {
    const own = WEAPONS.filter(w => this.g.save.weapons.includes(w.id));
    const i = own.findIndex(w => w.id === this.g.save.weapon);
    const nx = own[(i + 1) % own.length];
    this.equip(nx.id);
    this.g.hud.toast(`${nx.icon} ${nx.name}`);
  }
  update() {
    const g = this.g, m = this.marker;
    if (g.player.char.weapon?.id !== g.save.weapon) attachWeapon(g.player.char, g.save.weapon);   // outfit swaps rebuild the body
    if (this.open) return;
    m.grp.children[0].material.opacity = 0.25 + Math.sin(performance.now() / 300) * 0.1;
    if (!g.vehicle && Math.hypot(g.player.pos.x - m.x, g.player.pos.z - m.z) < 2.5) {
      g.hud.prompt(`Press J to enter ${PAWN.name}`);
      if (g.lastPressed?.has('mission')) this.show();
    }
  }
  buildUI() {
    const el = this.el = document.createElement('div');
    el.className = 'shopui'; el.hidden = true;
    el.innerHTML = `<div class="wpanel"><div class="whead"><b style="color:#ff6a6a">${PAWN.name}</b><span>Blunt instruments only — no questions asked. Press Z to switch weapons.</span></div>
      <div class="wlist"></div><div class="wfoot"><span class="money" style="flex:1;text-align:center;color:#7ee36a;font-weight:800"></span><button class="close">Done (Esc)</button></div></div>`;
    document.body.appendChild(el);
    el.querySelector('.close').onclick = () => this.hide();
  }
  show() {
    const g = this.g; this.open = true; this.el.hidden = false; this.marker.grp.visible = false;
    document.exitPointerLock?.(); document.body.classList.add('shopping');
    g.paused = true; this.render();
  }
  hide() {
    this.open = false; this.el.hidden = true; document.body.classList.remove('shopping'); this.marker.grp.visible = true;
    this.g.paused = this.g.hud.menuOpen || this.g.hud.mapOpen || this.g.hud.phoneOpen;
  }
  render() {
    const g = this.g, list = this.el.querySelector('.wlist'); list.innerHTML = '';
    for (const w of WEAPONS) {
      const has = g.save.weapons.includes(w.id), eq = g.save.weapon === w.id;
      const b = document.createElement('button'); b.className = 'witem' + (eq ? ' eq' : '');
      b.innerHTML = `<span>${w.icon} ${w.name} <em style="color:#999;font-style:normal;font-size:12px">· damage ×${w.dmg}${w.reach ? ' · reach +' + w.reach + 'm' : ''}</em></span><small>${eq ? 'HOLDING' : has ? 'OWNED' : '$' + w.price}</small>`;
      b.onclick = () => {
        if (!has) {
          if (g.money < w.price) { g.hud.toast('Not enough money', 'warn'); return; }
          g.addMoney(-w.price); g.save.weapons.push(w.id); g.audio.chime(true);
        }
        this.equip(w.id); this.render();
      };
      list.appendChild(b);
    }
    this.el.querySelector('.money').textContent = '$' + g.money.toLocaleString();
  }
}
