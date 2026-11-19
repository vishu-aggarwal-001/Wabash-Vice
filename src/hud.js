// HUD, minimap, full-screen map and menus (plain DOM + 2D canvas).
import { CATALOG } from './vehicles.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.g = game; this.w = game.world;
    this.mini = $('minimap'); this.mctx = this.mini.getContext('2d');
    this.img = this.w.groundTex.image;
    this.ppm = this.img.width / this.w.W;
    this.toastT = 0; this.promptT = 0; this.objT = 0; this.bigT = 0;
    this.mapOpen = false; this.menuOpen = false;
    this.mapZoom = 1; this.mapPan = { x: 0, z: 0 };
    this.units = game.settings.units;
    this.buildMenus();
    this.setupMap();
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.g, v = g.vehicle;
    $('money').textContent = '$' + g.money.toLocaleString();
    $('clock').textContent = g.env.clock;
    const st = $('wanted');
    const wl = g.police.wanted;
    st.innerHTML = '★★★★★'.split('').map((s, i) => `<span class="${i < wl ? 'on' : ''}${i < wl && g.police.evading ? ' blink' : ''}">★</span>`).join('');
    st.style.opacity = wl ? 1 : 0.25;
    // location
    const p = g.focus;
    this.locT = (this.locT || 0) - dt;
    if (this.locT <= 0) {
      this.locT = 0.4;
      const street = this.w.roadNameAt(p.x, p.z), bld = this.w.buildingNear(p.x, p.z, 18), dist = this.w.districtAt(p.x, p.z);
      $('street').textContent = bld || street || (v?.airborne ? 'Airspace' : '');
      $('district').textContent = dist + (bld && street ? ` · ${street}` : '');
    }
    // speedo
    const sp = $('speedo');
    if (v) {
      sp.hidden = false;
      const s = v.type === 'plane' ? v.vel.length() : v.speed;
      const mph = this.units === 'mph';
      $('spd').textContent = Math.round(s * (mph ? 2.237 : 3.6));
      $('spdunit').textContent = v.type === 'plane' || v.type === 'heli' ? (mph ? 'mph' : 'km/h') + ' · alt ' + Math.round((v.pos.y - this.w.heightAt(v.pos.x, v.pos.z)) * (mph ? 3.281 : 1)) + (mph ? ' ft' : ' m') : (mph ? 'mph' : 'km/h');
      $('vname').textContent = v.spec.name;
      $('hpbar').style.width = v.hp + '%';
      $('hpbar').style.background = v.hp > 50 ? '#7ddc6a' : v.hp > 25 ? '#f0c23b' : '#e2453c';
      const aux = $('aux');
      if (v.type === 'plane') aux.textContent = `THROTTLE ${Math.round(v.throttle * 100)}%${v.stalling ? '  ⚠ STALL' : ''}${v.onGround ? '  · on ground' : ''}`;
      else if (v.type === 'car' && v.spec.type === 'car') aux.innerHTML = `NITRO <span class="bar"><i style="width:${v.nitro * 100}%"></i></span>`;
      else aux.textContent = '';
      const dial = $('dial');
      dial.style.setProperty('--p', Math.min(1, s / (v.spec.max || 60)));
    } else {
      sp.hidden = true;
    }
    $('phealth').style.width = Math.max(0, g.player.hp) + '%';
    $('pstam').style.width = g.player.stamina * 100 + '%';
    // timers
    for (const [id, key] of [['toast', 'toastT'], ['prompt', 'promptT'], ['objective', 'objT'], ['big', 'bigT']]) {
      this[key] -= dt;
      $(id).classList.toggle('show', this[key] > 0);
    }
    this.drawMinimap();
    if (this.mapOpen) this.drawMap();
  }

  toast(msg, kind = '') { const t = $('toast'); t.textContent = msg; t.className = 'show ' + kind; this.toastT = 3; }
  prompt(msg) { $('prompt').textContent = msg; this.promptT = 0.15; }
  objective(msg, timeLeft) {
    const m = Math.max(0, Math.floor(timeLeft / 60)), s = Math.max(0, Math.floor(timeLeft % 60));
    $('objtext').textContent = msg; $('objtime').textContent = `${m}:${String(s).padStart(2, '0')}`;
    $('objtime').classList.toggle('low', timeLeft < 15);
    this.objT = 0.2;
  }
  big(title, sub = '', kind = '') {
    const b = $('big'); b.className = 'show ' + kind;
    $('bigtitle').textContent = title; $('bigsub').textContent = sub;
    this.bigT = kind === 'wasted' || kind === 'busted' ? 3.5 : 3.2;
  }

  // ---------------------------------------------------------------- minimap
  drawMinimap() {
    const g = this.g, c = this.mctx, S = this.mini.width, R = S / 2;
    const p = g.focus, v = g.vehicle;
    const speed = v ? v.speed : 0;
    const air = v && (v.type === 'plane' || v.type === 'heli') && !v.onGround;
    const target = air ? 1100 : v ? 300 + speed * 6 : 180;
    this.mRange = (this.mRange || target) + (target - (this.mRange || target)) * 0.05;
    const r = this.mRange, k = R / r, ppm = this.ppm;
    const yaw = g.camYaw;
    const th = -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw));
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#4c6a36'; c.fillRect(0, 0, S, S);
    c.translate(R, R); c.rotate(th); c.scale(k / ppm, k / ppm);
    const px = (p.x - this.w.minX) * ppm, pz = (p.z - this.w.minZ) * ppm;
    c.drawImage(this.img, -px, -pz);
    // GPS route
    if (g.gpsPath) {
      c.strokeStyle = '#b84dff'; c.lineWidth = 5 * ppm / k; c.lineJoin = 'round'; c.globalAlpha = 0.9;
      c.beginPath();
      g.gpsPath.forEach((n, i) => { const q = this.w.gNodes[n]; const x = (q[0] - this.w.minX) * ppm - px, z = (q[2] - this.w.minZ) * ppm - pz; i ? c.lineTo(x, z) : c.moveTo(x, z); });
      c.stroke(); c.globalAlpha = 1;
    }
    c.restore();
    const blip = (x, z, col, size = 4, clampEdge = true, shape = 'dot') => {
      let dx = (x - p.x) * k, dz = (z - p.z) * k;
      let sx = dx * Math.cos(th) - dz * Math.sin(th), sy = dx * Math.sin(th) + dz * Math.cos(th);
      const l = Math.hypot(sx, sy);
      if (l > R - 8) { if (!clampEdge) return; sx *= (R - 8) / l; sy *= (R - 8) / l; }
      c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath();
      if (shape === 'square') c.rect(R + sx - size, R + sy - size, size * 2, size * 2);
      else c.arc(R + sx, R + sy, size, 0, Math.PI * 2);
      c.fill(); c.stroke();
    };
    for (const m of g.missions.markers) if (!g.missions.active) blip(m.x, m.z, '#ffd23f', 5, true, 'square');
    if (g.missions.active) { const cp = g.missions.active.cps[g.missions.active.idx]; blip(cp.x, cp.z, '#ffd23f', 6); }
    if (g.gps) blip(g.gps.x, g.gps.z, '#b84dff', 6);
    for (const u of g.police.units) blip(u.v.pos.x, u.v.pos.z, performance.now() % 500 < 250 ? '#ff3b3b' : '#3b6bff', 4, g.police.wanted > 0);
    if (g.police.heli) blip(g.police.heli.v.pos.x, g.police.heli.v.pos.z, '#ff3b3b', 5);
    for (const pv of g.parked) if (pv !== v && !pv.dead) blip(pv.pos.x, pv.pos.z, '#7fd1ff', 3, false);
    // north marker
    const nx = Math.sin(th + Math.PI) * 0, ny = 0;
    const na = th; // world north (-z) direction on screen
    const nsx = -Math.sin(-na) * (R - 12), nsy = -Math.cos(-na) * (R - 12);
    c.fillStyle = '#fff'; c.font = 'bold 13px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', R + nsx + nx, R + nsy + ny);
    // player arrow
    const heading = v ? v.yaw : g.player.yaw;
    const rel = th + Math.atan2(Math.cos(heading), Math.sin(heading));
    c.save(); c.translate(R, R); c.rotate(rel + Math.PI / 2);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3; c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.stroke();
  }

  // ---------------------------------------------------------------- full map
  setupMap() {
    const cv = $('bigmap');
    this.bctx = cv.getContext('2d');
    let drag = null;
    cv.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; });
    addEventListener('mousemove', (e) => {
      if (!drag) return;
      const s = this.mapScale();
      this.mapPan.x -= (e.clientX - drag.x) / s; this.mapPan.z -= (e.clientY - drag.y) / s;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
      drag.x = e.clientX; drag.y = e.clientY;
    });
    addEventListener('mouseup', (e) => {
      if (drag && !drag.moved && e.target === cv) {
        const [x, z] = this.screenToWorld(e.clientX, e.clientY);
        this.g.setGPS(x, z, true); this.toast('Waypoint set — follow the purple line', 'good');
      }
      drag = null;
    });
    cv.addEventListener('wheel', (e) => { this.mapZoom = Math.min(8, Math.max(0.6, this.mapZoom * (e.deltaY < 0 ? 1.15 : 0.87))); }, { passive: true });
    cv.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0]; const [x, z] = this.screenToWorld(t.clientX, t.clientY);
      this.g.setGPS(x, z, true); this.toast('Waypoint set', 'good');
    });
    $('mapclose').onclick = () => this.toggleMap(false);
    $('mapclear').onclick = () => { this.g.setGPS(null); };
    $('mapzin').onclick = () => { this.mapZoom = Math.min(8, this.mapZoom * 1.4); };
    $('mapzout').onclick = () => { this.mapZoom = Math.max(0.6, this.mapZoom / 1.4); };
  }
  mapScale() { const cv = $('bigmap'); return Math.min(cv.width / this.w.W, cv.height / this.w.Hh) * this.mapZoom; }
  screenToWorld(sx, sy) {
    const cv = $('bigmap'), r = cv.getBoundingClientRect(), s = this.mapScale();
    return [(sx - r.left - cv.width / 2) / s + this.mapCenter().x, (sy - r.top - cv.height / 2) / s + this.mapCenter().z];
  }
  mapCenter() { return { x: this.w.minX + this.w.W / 2 + this.mapPan.x, z: this.w.minZ + this.w.Hh / 2 + this.mapPan.z }; }
  toggleMap(open = !this.mapOpen) {
    this.mapOpen = open;
    $('mapwrap').hidden = !open;
    if (open) {
      const cv = $('bigmap'); cv.width = innerWidth; cv.height = innerHeight;
      this.mapPan.x = this.g.focus.x - (this.w.minX + this.w.W / 2); this.mapPan.z = this.g.focus.z - (this.w.minZ + this.w.Hh / 2);
      this.mapZoom = 2.2;
      document.exitPointerLock?.();
    }
    this.g.paused = open || this.menuOpen;
  }
  drawMap() {
    const cv = $('bigmap'), c = this.bctx, s = this.mapScale(), C = this.mapCenter();
    const W2 = (x, z) => [(x - C.x) * s + cv.width / 2, (z - C.z) * s + cv.height / 2];
    c.fillStyle = '#2d3a26'; c.fillRect(0, 0, cv.width, cv.height);
    const [ox, oy] = W2(this.w.minX, this.w.minZ);
    c.drawImage(this.img, ox, oy, this.w.W * s, this.w.Hh * s);
    if (this.g.gpsPath) {
      c.strokeStyle = '#b84dff'; c.lineWidth = 4; c.beginPath();
      this.g.gpsPath.forEach((n, i) => { const q = this.w.gNodes[n]; const [x, y] = W2(q[0], q[2]); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    // district names
    c.font = `bold ${Math.round(13 + this.mapZoom * 2)}px system-ui`;
    for (const d of this.w.districts) { const [x, y] = W2(d.x, d.z); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText(d.name.toUpperCase(), x + 1, y + 1); c.fillStyle = '#fff'; c.fillText(d.name.toUpperCase(), x, y); }
    if (this.mapZoom > 1.6) {
      c.font = '11px system-ui';
      for (const l of this.w.map.labels) {
        if (l[3] < (this.mapZoom > 4.5 ? 900 : this.mapZoom > 3 ? 3000 : 7000)) continue;
        const [x, y] = W2(l[1], l[2]); c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillText(l[0], x + 1, y + 1); c.fillStyle = '#ffe9b0'; c.fillText(l[0], x, y);
      }
    }
    for (const m of this.g.missions.markers) {
      const [x, y] = W2(m.x, m.z);
      c.fillStyle = '#ffd23f'; c.strokeStyle = '#000'; c.lineWidth = 2; c.fillRect(x - 7, y - 7, 14, 14); c.strokeRect(x - 7, y - 7, 14, 14);
      c.font = 'bold 12px system-ui'; c.fillStyle = '#fff'; c.fillText(m.name, x, y - 16);
    }
    for (const [name, x0, z0] of this.w.landmarks) { const [x, y] = W2(x0, z0); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); c.font = 'bold 12px system-ui'; c.fillText(name, x, y + 14); }
    if (this.g.gps) { const [x, y] = W2(this.g.gps.x, this.g.gps.z); c.fillStyle = '#b84dff'; c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill(); c.stroke(); }
    const [px, py] = W2(this.g.focus.x, this.g.focus.z);
    const h = this.g.vehicle ? this.g.vehicle.yaw : this.g.player.yaw;
    c.save(); c.translate(px, py); c.rotate(Math.atan2(Math.cos(h), Math.sin(h)) + Math.PI / 2);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -12); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.font = '11px system-ui'; c.textAlign = 'right';
    c.fillText(this.w.map.attribution, cv.width - 10, cv.height - 10);
  }

  // ---------------------------------------------------------------- menus
  buildMenus() {
    const g = this.g;
    const vg = $('vehgrid'); vg.innerHTML = '';
    const cats = [...new Set(CATALOG.map(c => c.cat))];
    for (const cat of cats) {
      const h = document.createElement('h4'); h.textContent = cat; vg.appendChild(h);
      const row = document.createElement('div'); row.className = 'row';
      for (const s of CATALOG.filter(c => c.cat === cat)) {
        const b = document.createElement('button');
        const top = s.max ? Math.round(s.max * 2.237) : '';
        b.innerHTML = `<b>${s.name}</b><small>${top ? 'top ' + top + ' mph' : ''}</small>`;
        b.onclick = () => { this.toggleMenu(false); g.spawnFromMenu(s.id); };
        row.appendChild(b);
      }
      vg.appendChild(row);
    }
    const ft = $('travel'); ft.innerHTML = '';
    for (const [name, lat, lon] of this.w.fastTravel) {
      const b = document.createElement('button'); b.textContent = name;
      b.onclick = () => { this.toggleMenu(false); g.teleport(...this.w.toWorld(lat, lon), name); };
      ft.appendChild(b);
    }
    for (const t of document.querySelectorAll('#menu [data-tab]')) t.onclick = () => this.tab(t.dataset.tab);
    $('resume').onclick = () => this.toggleMenu(false);
    const q = $('setq'); q.value = g.settings.quality;
    q.onchange = () => { g.settings.quality = q.value; g.persist(); this.toast('Quality saved — reloading…'); setTimeout(() => location.reload(), 600); };
    const inv = $('setinv'); inv.checked = g.settings.invertPitch; inv.onchange = () => { g.settings.invertPitch = inv.checked; g.persist(); };
    const vol = $('setvol'); vol.value = g.settings.volume; vol.oninput = () => { g.settings.volume = +vol.value; g.audio.setVolume(+vol.value); g.persist(); };
    const sens = $('setsens'); sens.value = g.settings.sensitivity; sens.oninput = () => { g.settings.sensitivity = +sens.value; g.persist(); };
    const un = $('setunits'); un.value = g.settings.units; un.onchange = () => { g.settings.units = this.units = un.value; g.persist(); };
    $('setday').value = g.settings.dayMinutes; $('setday').onchange = () => { g.settings.dayMinutes = +$('setday').value; g.env.daySeconds = g.settings.dayMinutes * 60; g.persist(); };
    $('cancelmission').onclick = () => { g.missions.cancel(); this.toggleMenu(false); };
    $('clearwanted').onclick = () => { if (g.money >= 1000 && g.police.wanted) { g.addMoney(-1000); g.police.clear(); this.toast('Paid off the cops: -$1,000'); } else this.toast(g.police.wanted ? 'Need $1,000' : 'You are not wanted'); this.toggleMenu(false); };
  }
  tab(name) {
    for (const t of document.querySelectorAll('#menu [data-tab]')) t.classList.toggle('on', t.dataset.tab === name);
    for (const p of document.querySelectorAll('#menu .pane')) p.hidden = p.id !== 'pane-' + name;
  }
  toggleMenu(open = !this.menuOpen, tab = 'vehicles') {
    this.menuOpen = open;
    $('menu').hidden = !open;
    if (open) { this.tab(tab); document.exitPointerLock?.(); $('gearcount').textContent = `${(this.g.save.gears || []).length}/30`; }
    this.g.paused = open || this.mapOpen;
  }
}
