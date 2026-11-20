// Procedural audio with the Web Audio API — no sound files needed.
// Engines, wind, sirens, crashes, splashes, horn, and "Boiler FM 88.8",
// a generative radio station.
export class Audio {
  constructor() {
    this.ctx = null; this.volume = 0.8; this.radioOn = false;
  }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = this.volume;
    const comp = C.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(C.destination);
    // noise buffer
    const nb = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // engine voice
    this.eng = this.voice();
    // wind / road noise
    this.wind = this.noiseVoice('lowpass', 400);
    // jet/heli noise
    this.roar = this.noiseVoice('bandpass', 900);
    this.chop = C.createGain(); this.chop.gain.value = 0;
    this.roar.out.disconnect(); this.roar.out.connect(this.chop); this.chop.connect(this.master);
    this.chopLfo = C.createOscillator(); this.chopLfo.frequency.value = 18;
    this.chopDepth = C.createGain(); this.chopDepth.gain.value = 0;
    this.chopLfo.connect(this.chopDepth); this.chopDepth.connect(this.chop.gain); this.chopLfo.start();
    // siren
    this.siren = C.createOscillator(); this.siren.type = 'square';
    const sf = C.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2200;
    this.sirenGain = C.createGain(); this.sirenGain.gain.value = 0;
    this.siren.connect(sf); sf.connect(this.sirenGain); this.sirenGain.connect(this.master); this.siren.start();
    this.sirenT = 0;
    // radio bus
    this.radioBus = C.createGain(); this.radioBus.gain.value = 0;
    const rf = C.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 5200;
    this.radioBus.connect(rf); rf.connect(this.master);
    this.step = 0; this.nextNote = 0;
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  voice() {
    const C = this.ctx;
    const o1 = C.createOscillator(), o2 = C.createOscillator(), f = C.createBiquadFilter(), g = C.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 4;
    const g2 = C.createGain(); g2.gain.value = 0.4;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.gain.value = 0; g.connect(this.master);
    o1.start(); o2.start();
    return { o1, o2, f, g };
  }
  noiseVoice(type, freq) {
    const C = this.ctx;
    const s = C.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = C.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    return { s, f, g, out: g };
  }

  // called every frame
  update(dt, veh, speed, sirenDist) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.08;
    const set = (p, v) => p.setTargetAtTime(v, t, k);
    let engGain = 0, chop = 0, roar = 0, roarF = 900;
    if (veh && !veh.dead) {
      const r = veh.rpm || 0, type = veh.type;
      let base = 38, range = 150, cut = 500 + r * 2200, vol = 0.12;
      if (type === 'bike') { base = veh.spec.pedal ? 0 : 60; range = 260; vol = veh.spec.pedal ? 0 : 0.1; }
      if (type === 'boat') { base = 32; range = 110; vol = 0.11; }
      if (type === 'plane') { base = veh.spec.jet ? 0 : 28; range = 70; vol = veh.spec.jet ? 0 : 0.12; roar = veh.spec.jet ? 0.08 + r * 0.25 : 0; roarF = 400 + r * 1800; }
      if (type === 'heli') { base = 0; vol = 0; chop = 0.32 * r; roarF = 500; }
      if (veh.spec.mass > 3000 && type === 'car') { base = 28; range = 80; }
      // fake gear shifts for cars
      let rr = r;
      if (type === 'car' || type === 'bike') { const gears = 5; const gpos = r * gears; rr = 0.25 + (gpos - Math.floor(gpos)) * 0.75 * (r < 0.98 ? 1 : 1) + (r > 0.99 ? 0.2 : 0); if (speed < 1) rr = 0.15 + r * 0.3; }
      set(this.eng.o1.frequency, base + rr * range);
      set(this.eng.o2.frequency, (base + rr * range) * 0.5);
      set(this.eng.f.frequency, cut);
      engGain = base ? vol * (0.5 + r * 0.6) : 0;
      if (veh.boosting) engGain *= 1.4;
    }
    set(this.eng.g.gain, engGain);
    set(this.chopDepth.gain, chop);
    set(this.chop.gain, chop ? chop * 0.5 : roar);
    set(this.roar.f.frequency, roarF);
    this.chopLfo.frequency.setTargetAtTime(veh?.type === 'heli' ? 14 + (veh.rpm || 0) * 6 : 18, t, 0.2);
    set(this.wind.g.gain, Math.min(0.25, speed * speed * 0.00004));
    set(this.wind.f.frequency, 300 + speed * 20);
    // siren wail
    this.sirenT += dt;
    const sv = sirenDist < 250 ? (1 - sirenDist / 250) * 0.07 : 0;
    set(this.sirenGain.gain, sv);
    this.siren.frequency.setTargetAtTime(700 + Math.sin(this.sirenT * 3.2) * 260, t, 0.02);
    // radio
    set(this.radioBus.gain, this.radioOn ? 0.28 : 0);
    if (this.radioOn) this.scheduleRadio();
  }

  oneShot(type, vol = 0.5, dur = 0.5, freq = 800) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const s = C.createBufferSource(); s.buffer = this.noiseBuf;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = C.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur);
  }
  crash(intensity) { this.oneShot('lowpass', Math.min(0.9, 0.15 + intensity * 0.03), 0.35 + Math.min(0.6, intensity * 0.02), 900); this.oneShot('highpass', Math.min(0.4, intensity * 0.015), 0.25, 3000); }
  splash() { this.oneShot('bandpass', 0.5, 0.9, 1200); }
  gunshot(vol = 1) { this.oneShot('lowpass', Math.min(1, 0.7 * vol), 0.3, 1400); this.oneShot('highpass', Math.min(0.6, 0.35 * vol), 0.09, 2600); this.oneShot('bandpass', 0.25 * vol, 0.5, 300); }
  whoosh() { this.oneShot('bandpass', 0.12, 0.18, 1800); }
  punch(dmg = 20) { this.oneShot('lowpass', 0.45 + dmg * 0.006, 0.14, 420); this.oneShot('bandpass', 0.18, 0.06, 2400); }
  // two-tone phone ring / radio chirp for dispatcher calls
  ring() {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    for (let i = 0; i < 4; i++) for (const f of [1320, 1660]) {
      const o = C.createOscillator(), g = C.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.12); g.gain.linearRampToValueAtTime(0.06, t + i * 0.12 + 0.01); g.gain.setTargetAtTime(0, t + i * 0.12 + 0.08, 0.02);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.2);
    }
  }
  radioChirp() {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime, o = C.createOscillator(), g = C.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(1900, t); o.frequency.setValueAtTime(1400, t + 0.07);
    g.gain.setValueAtTime(0.04, t); g.gain.setTargetAtTime(0, t + 0.14, 0.02);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3);
    this.oneShot('bandpass', 0.05, 0.25, 2600);
  }
  explosion() { this.oneShot('lowpass', 1, 2.2, 260); this.oneShot('lowpass', 0.6, 0.8, 1200); }
  horn(pos, vol = 0.25) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    for (const f of [392, 494]) {
      const o = C.createOscillator(), g = C.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(vol * 0.3, t); g.gain.setTargetAtTime(0, t + 0.35, 0.05);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.6);
    }
  }
  chime(good = true) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const notes = good ? [523, 659, 784, 1047] : [392, 330, 262];
    notes.forEach((f, i) => {
      const o = C.createOscillator(), g = C.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.09); g.gain.linearRampToValueAtTime(0.25, t + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.5);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.6);
    });
  }
  stinger() {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    [110, 82.4, 55].forEach((f, i) => {
      const o = C.createOscillator(), g = C.createGain(); o.type = 'sawtooth'; o.frequency.value = f;
      g.gain.setValueAtTime(0.3, t + i * 0.35); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.35 + 1.2);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.35); o.stop(t + i * 0.35 + 1.3);
    });
  }

  // ---------------------------------------------------------------- Boiler FM 88.8
  toggleRadio() { this.radioOn = !this.radioOn; if (this.radioOn && this.ctx) this.nextNote = this.ctx.currentTime + 0.05; return this.radioOn; }
  scheduleRadio() {
    const C = this.ctx, bpm = 104, sp = 60 / bpm / 4;
    // Am - F - C - G, synthwave style
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const bassline = [45, 45, 57, 45, 45, 57, 45, 52];
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    while (this.nextNote < C.currentTime + 0.2) {
      const t = this.nextNote, s = this.step % 16, bar = Math.floor(this.step / 16) % 4;
      const chord = prog[bar];
      if (s % 4 === 0) this.drum(t, 'kick');
      if (s === 4 || s === 12) this.drum(t, 'snare');
      if (s % 2 === 0) this.drum(t, 'hat');
      if (s % 2 === 0) this.note(t, hz(bassline[(s / 2) % 8] + (chord[0] - 57)), sp * 1.8, 'sawtooth', 0.16, 500);
      if (s === 0 || s === 8) for (const n of chord) this.note(t, hz(n), sp * 7, 'triangle', 0.06, 2400);
      if (this.step % 64 >= 32 && s % 3 === 0) this.note(t, hz(chord[(s / 3 | 0) % 3] + 12), sp * 1.5, 'square', 0.035, 3000);
      this.nextNote += sp; this.step++;
    }
  }
  note(t, f, d, type, v, cut) {
    const C = this.ctx, o = C.createOscillator(), fl = C.createBiquadFilter(), g = C.createGain();
    o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = cut;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(fl); fl.connect(g); g.connect(this.radioBus); o.start(t); o.stop(t + d + 0.05);
  }
  drum(t, kind) {
    const C = this.ctx;
    if (kind === 'kick') {
      const o = C.createOscillator(), g = C.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(this.radioBus); o.start(t); o.stop(t + 0.3);
    } else {
      const s = C.createBufferSource(); s.buffer = this.noiseBuf;
      const f = C.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
      const g = C.createGain(), d = kind === 'hat' ? 0.05 : 0.18;
      g.gain.setValueAtTime(kind === 'hat' ? 0.12 : 0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      s.connect(f); f.connect(g); g.connect(this.radioBus); s.start(t, Math.random()); s.stop(t + d);
    }
  }
}
