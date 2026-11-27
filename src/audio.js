// Synthesised sound (no audio files): engine, wind, rolling wheels, stall horn, warnings, touchdown.
export class Sound {
  constructor() { this.ctx = null; this.enabled = true; this.volume = 0.7; }
  start(engineType) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
      // white noise buffer
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const noise = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
      // engine: prop = buzzy sawtooth + harmonics, jet = filtered roar + whine
      this.engOsc = c.createOscillator(); this.engOsc.type = 'sawtooth';
      this.engOsc2 = c.createOscillator(); this.engOsc2.type = 'square';
      this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 2;
      this.engGain = c.createGain(); this.engGain.gain.value = 0;
      const g2 = c.createGain(); g2.gain.value = 0.35;
      this.engOsc.connect(this.engFilter); this.engOsc2.connect(g2).connect(this.engFilter);
      this.engFilter.connect(this.engGain).connect(this.master);
      this.engOsc.start(); this.engOsc2.start();
      this.roar = noise(); this.roarFilter = c.createBiquadFilter(); this.roarFilter.type = 'bandpass'; this.roarFilter.Q.value = 0.7;
      this.roarGain = c.createGain(); this.roarGain.gain.value = 0;
      this.roar.connect(this.roarFilter).connect(this.roarGain).connect(this.master);
      this.whine = c.createOscillator(); this.whine.type = 'sine'; this.whineGain = c.createGain(); this.whineGain.gain.value = 0;
      this.whine.connect(this.whineGain).connect(this.master); this.whine.start();
      // wind
      this.wind = noise(); this.windFilter = c.createBiquadFilter(); this.windFilter.type = 'lowpass';
      this.windGain = c.createGain(); this.windGain.gain.value = 0;
      this.wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
      // wheels rumble
      this.rumble = noise(); this.rumbleFilter = c.createBiquadFilter(); this.rumbleFilter.type = 'lowpass'; this.rumbleFilter.frequency.value = 120;
      this.rumbleGain = c.createGain(); this.rumbleGain.gain.value = 0;
      this.rumble.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.master);
      // warning tone
      this.warn = c.createOscillator(); this.warn.type = 'square'; this.warnGain = c.createGain(); this.warnGain.gain.value = 0;
      this.warn.connect(this.warnGain).connect(this.master); this.warn.start();
    }
    this.type = engineType;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  update(s) { // s: {N, V, onGround, groundSpeed, stall, warning, burner, inside, paused}
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.08;
    const set = (p, v) => p.setTargetAtTime(v, t, k);
    const mute = s.paused || !this.enabled ? 0 : 1;
    const inside = s.inside ? 0.55 : 1;
    if (this.type === 'prop') {
      const rpm = 700 + s.N * 1800;
      set(this.engOsc.frequency, (rpm / 60) * 2); set(this.engOsc2.frequency, (rpm / 60) * 1);
      set(this.engFilter.frequency, 300 + s.N * 1400);
      set(this.engGain.gain, (0.1 + s.N * 0.22) * mute * inside);
      set(this.roarGain.gain, 0.03 * s.N * mute); set(this.roarFilter.frequency, 800);
      set(this.whineGain.gain, 0);
    } else {
      set(this.engGain.gain, 0.03 * s.N * mute * inside); set(this.engOsc.frequency, 40 + s.N * 30); set(this.engOsc2.frequency, 60 + s.N * 40);
      set(this.engFilter.frequency, 200);
      set(this.roarFilter.frequency, 250 + s.N * 900 + (s.burner ? 300 : 0));
      set(this.roarGain.gain, (0.05 + s.N * 0.35 + (s.burner ? 0.25 : 0)) * mute * inside);
      set(this.whine.frequency, 1800 + s.N * 2600);
      set(this.whineGain.gain, (0.004 + s.N * 0.012) * mute * inside);
    }
    set(this.windFilter.frequency, 300 + s.V * 12);
    set(this.windGain.gain, Math.min(0.35, (s.V / 120) ** 2 * 0.25) * mute * (s.inside ? 0.6 : 1));
    set(this.rumbleGain.gain, s.onGround ? Math.min(0.5, s.groundSpeed / 40) * mute : 0);
    // warnings: stall = continuous horn, terrain/overspeed = beeping
    let w = 0, f = 440;
    if (s.stall) { w = 0.08; f = 520; }
    else if (s.warning) { w = Math.sin(t * 12) > 0 ? 0.06 : 0; f = 880; }
    set(this.warn.frequency, f); set(this.warnGain.gain, w * mute);
  }
  thump(strength) {
    if (!this.ctx) return;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g = c.createGain(); g.gain.setValueAtTime(Math.min(1, strength), c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    s.connect(f).connect(g).connect(this.master); s.start(); s.stop(c.currentTime + 0.6);
  }
  boom() { this.thump(1.5); setTimeout(() => this.thump(1), 120); }
}
