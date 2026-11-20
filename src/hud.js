// HUD, minimap, full-screen map and menus (plain DOM + 2D canvas).
import { CATALOG } from './vehicles.js';
import { JOBS } from './jobs.js';
import { CHAPTER } from './story.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.g = game; this.w = game.world;
    this.mini = $('minimap'); this.mctx = this.mini.getContext('2d');
    this.img = this.w.groundTex.image;
    this.ppm = this.img.width / this.w.W;
    this.toastT = 0; this.promptT = 0; this.objT = 0; this.bigT = 0; this.subT = 0; this.jobT = 0;
    this.phoneOpen = false; this.phoneStack = [];
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
    $('parmor').style.width = Math.max(0, g.player.armor) + '%';
    $('karma').style.left = (50 + (g.save.karma || 0) / 2) + '%';
    $('medcount').textContent = g.player.medkits;
    this.jobT -= dt;
    $('jobpanel').hidden = !(g.jobs?.active) && this.jobT <= 0;
    // timers
    for (const [id, key] of [['toast', 'toastT'], ['prompt', 'promptT'], ['objective', 'objT'], ['big', 'bigT'], ['subs', 'subT']]) {
      this[key] -= dt;
      $(id).classList.toggle('show', this[key] > 0);
    }
    this.drawMinimap();
    if (this.mapOpen) this.drawMap();
  }

  toast(msg, kind = '') { const t = $('toast'); t.textContent = msg; t.className = 'show ' + kind; this.toastT = 3; }
  prompt(msg) { $('prompt').textContent = msg; this.promptT = 0.15; }
  objective(msg, timeLeft = null) {
    $('objtext').textContent = msg;
    if (timeLeft === null || timeLeft === undefined) { $('objtime').textContent = ''; }
    else {
      const m = Math.max(0, Math.floor(timeLeft / 60)), s = Math.max(0, Math.floor(timeLeft % 60));
      $('objtime').textContent = `${m}:${String(s).padStart(2, '0')}`;
      $('objtime').classList.toggle('low', timeLeft < 15);
    }
    this.objT = 0.2;
  }
  // subtitles for dialogue and dispatcher radio
  say(name, text, secs = 3) {
    if (!name && !text) { this.subT = 0; return; }
    $('subname').textContent = name ? name + ':' : ''; $('subtext').textContent = text;
    this.subT = secs;
  }
  job(id, rank, earned, call, state) {
    const J = JOBS[id];
    $('jobtitle').textContent = J.name; $('jobrank').textContent = rank.name;
    $('jobearned').textContent = '$' + earned.toLocaleString(); $('jobsub').textContent = J.sub;
    $('jobcall').textContent = call; $('jobstate').textContent = state || '';
    $('jobpanel').style.borderColor = J.color;
    this.jobT = 0.3;
  }

  // ---------------------------------------------------------------- phone
  togglePhone(open = !this.phoneOpen) {
    this.phoneOpen = open;
    $('phone').hidden = !open;
    if (open) { this.phoneStack = []; this.phoneScreen('home'); document.exitPointerLock?.(); }
    this.g.paused = open || this.menuOpen || this.mapOpen;
  }
  phoneScreen(name, push = true) {
    const g = this.g, body = $('phbody');
    if (push && this.phoneCur) this.phoneStack.push(this.phoneCur);
    this.phoneCur = name;
    $('phclock').textContent = g.env.clock;
    const item = (title, sub, fn, cls = '') => { const b = document.createElement('button'); b.className = 'item ' + cls; b.innerHTML = `<b>${title}</b><small>${sub}</small>`; if (fn) b.onclick = fn; body.appendChild(b); return b; };
    body.innerHTML = '';
    if (name === 'home') {
      body.innerHTML = `<h3>${g.env.clock} · $${g.money.toLocaleString()}</h3><div class="apps"></div>`;
      const apps = body.querySelector('.apps');
      const app = (icon, label, color, fn) => { const b = document.createElement('button'); b.className = 'app'; b.innerHTML = `<i style="background:${color}">${icon}</i>${label}`; b.onclick = fn; apps.appendChild(b); };
      app('💼', 'Jobs', '#2f6fd6', () => this.phoneScreen('jobs'));
      app('⭐', 'Story', '#c79a2b', () => this.phoneScreen('story'));
      app('🛒', 'Shop', '#2c9a4b', () => this.phoneScreen('shop'));
      app('🗺️', 'Map', '#6b4fd6', () => { this.togglePhone(false); this.toggleMap(true); });
      app('🚗', 'Vehicles', '#c0392b', () => { this.togglePhone(false); this.toggleMenu(true, 'vehicles'); });
      app('👕', 'Wardrobe', '#8b5cf6', () => { this.togglePhone(false); g.wardrobe.show(null); });
      app('📊', 'Stats', '#555', () => this.phoneScreen('stats'));
      if (g.jobs.active) item(`End ${JOBS[g.jobs.active].name} shift`, `Earned $${g.jobs.earned.toLocaleString()} so far`, () => { g.jobs.end(); this.togglePhone(false); }).style.marginTop = '18px';
      if (g.story.active) item('Quit story mission', g.story.active.name, () => { g.story.cancel(); this.togglePhone(false); }).style.marginTop = '18px';
    } else if (name === 'jobs') {
      body.innerHTML = '<h3>Jobs</h3>';
      for (const [id, J] of Object.entries(JOBS)) {
        const r = g.jobs.rank(id);
        const on = g.jobs.active === id;
        item(`${J.icon} ${J.name}${on ? ' — ON SHIFT' : ''}`, `${J.desc}<br>Rank: <b>${r.name}</b>${r.next !== null ? ` · ${r.next - r.xp} calls to next rank` : ' · max rank'}`, () => { if (on) g.jobs.end(); else g.jobs.start(id); this.togglePhone(false); });
      }
    } else if (name === 'story') {
      body.innerHTML = '<h3>Chapter 1 — Wabash Vice</h3>';
      CHAPTER.forEach((M, i) => {
        const done = i < g.story.done, locked = i > g.story.done;
        item(`${done ? '✔ ' : locked ? '🔒 ' : '▶ '}${i + 1}. ${M.title}`, `${M.who}: ${M.blurb}${done ? ' (replay)' : ''} · $${M.pay.toLocaleString()}`, locked ? null : () => { this.togglePhone(false); g.story.start(i); }, done ? 'done' : locked ? 'locked' : '');
      });
    } else if (name === 'shop') {
      body.innerHTML = '<h3>Shop — delivered by drone</h3>';
      const buy = (title, sub, cost, ok, fn) => item(`${title} — $${cost}`, sub, () => { if (g.money < cost) return this.toast('Not enough money', 'warn'); if (!ok()) return this.toast('You already have the maximum', 'warn'); g.addMoney(-cost); fn(); this.toast(`Bought ${title}`, 'good'); this.phoneScreen('shop', false); });
      buy('Medkit', `+50 health, press H to use. You have ${g.player.medkits}/5`, 150, () => g.player.medkits < 5, () => g.player.medkits++);
      buy('Body armor', `Soaks up damage. Armor ${Math.round(g.player.armor)}%`, 500, () => g.player.armor < 100, () => { g.player.armor = 100; });
      buy('Full heal', `Health ${Math.round(g.player.hp)}%`, 250, () => g.player.hp < 100, () => { g.player.hp = 100; });
      buy('Lawyer', `Clears your wanted level (${g.police.wanted}★)`, 1000, () => g.police.wanted > 0, () => g.police.clear());
    } else if (name === 'stats') {
      body.innerHTML = '<h3>Stats</h3>';
      const k = g.save.karma || 0;
      item('Money', '$' + g.money.toLocaleString());
      item('Karma', `${k > 20 ? 'Good citizen' : k < -20 ? 'Menace to society' : 'Neutral'} (${k > 0 ? '+' : ''}${k})`);
      item('Story', `${g.story.done}/${CHAPTER.length} missions`);
      for (const id of Object.keys(JOBS)) { const r = g.jobs.rank(id); item(JOBS[id].name, `${r.name} · ${r.xp} calls · $${g.jobs.stats(id).earned.toLocaleString()} earned`); }
      item('Golden Gears', `${(g.save.gears || []).length}/30 found`);
    }
  }
  phoneBack() { const p = this.phoneStack.pop(); if (p) this.phoneScreen(p, false); else this.togglePhone(false); }
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
    if (g.weather === 'snow' || g.weather === 'snowsun') c.filter = 'saturate(0.25) brightness(1.35)';
    c.drawImage(this.img, -px, -pz);
    c.filter = 'none';
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
    for (const b of g.blips) { const q = b.get(); if (q) blip(q.x, q.z, b.color, b.size || 5); }
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
    this.g.paused = open || this.menuOpen || this.phoneOpen;
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
    for (const b of this.g.blips) { const q = b.get(); if (!q) continue; const [x, y] = W2(q.x, q.z); c.fillStyle = b.color; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); c.stroke(); }
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
    const wx = $('setweather'); wx.value = g.settings.weather || 'auto';
    wx.onchange = () => { g.settings.weather = wx.value; g.persist(); this.toast('Weather saved — reloading…'); setTimeout(() => location.reload(), 600); };
    const inv = $('setinv'); inv.checked = g.settings.invertPitch; inv.onchange = () => { g.settings.invertPitch = inv.checked; g.persist(); };
    const vol = $('setvol'); vol.value = g.settings.volume; vol.oninput = () => { g.settings.volume = +vol.value; g.audio.setVolume(+vol.value); g.persist(); };
    const sens = $('setsens'); sens.value = g.settings.sensitivity; sens.oninput = () => { g.settings.sensitivity = +sens.value; g.persist(); };
    const un = $('setunits'); un.value = g.settings.units; un.onchange = () => { g.settings.units = this.units = un.value; g.persist(); };
    $('setday').value = g.settings.dayMinutes; $('setday').onchange = () => { g.settings.dayMinutes = +$('setday').value; g.env.daySeconds = g.settings.dayMinutes * 60; g.persist(); };
    $('cancelmission').onclick = () => { g.missions.cancel(); g.story.cancel(); g.jobs.end(); this.toggleMenu(false); };
    $('phback').onclick = () => this.phoneBack();
    $('phclose').onclick = () => this.togglePhone(false);
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
    this.g.paused = open || this.mapOpen || this.phoneOpen;
  }
}
