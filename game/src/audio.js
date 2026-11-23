// audio.js — all sound is synthesized with WebAudio: per-weapon shots, engine,
// sirens, cash, hits, horn, UI. No audio files.
export const SFX = {
  ctx: null, master: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  env(gain, t, a, peak, d) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  },
  tone(freq, type, a, peak, d, slideTo) {
    if (!this.ctx) return;
    const t = this.now(), o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + a + d);
    this.env(g, t, a, peak, d);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + a + d + 0.05);
  },
  noise(dur, peak, freq, q) {
    if (!this.ctx) return;
    const t = this.now(), len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 0.7;
    const g = this.ctx.createGain(); g.gain.value = peak;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  shot(kind) {
    if (kind === 'pistol') { this.noise(0.14, 0.5, 900, 0.5); this.tone(160, 'square', 0.005, 0.25, 0.09, 60); }
    else if (kind === 'smg') { this.noise(0.09, 0.38, 1200, 0.5); this.tone(190, 'square', 0.004, 0.2, 0.06, 70); }
    else if (kind === 'shotgun') { this.noise(0.3, 0.7, 500, 0.4); this.tone(110, 'square', 0.006, 0.35, 0.2, 45); }
    else if (kind === 'rifle') { this.noise(0.2, 0.55, 750, 0.5); this.tone(130, 'sawtooth', 0.005, 0.28, 0.13, 55); }
    else { this.noise(0.06, 0.2, 2000, 1); } // fist / machete swing
  },
  hit() { this.noise(0.07, 0.3, 2400, 1.2); },
  hurt() { this.tone(220, 'sawtooth', 0.01, 0.2, 0.16, 110); },
  cash() { this.tone(880, 'sine', 0.01, 0.25, 0.09); setTimeout(() => this.tone(1318, 'sine', 0.01, 0.25, 0.16), 70); },
  buy() { this.tone(660, 'sine', 0.01, 0.2, 0.08); setTimeout(() => this.tone(990, 'sine', 0.01, 0.2, 0.12), 60); },
  horn() { this.tone(370, 'square', 0.01, 0.16, 0.28); this.tone(466, 'square', 0.01, 0.12, 0.28); },
  door() { this.noise(0.08, 0.18, 700, 1); },
  crash(big) { this.noise(big ? 0.4 : 0.18, big ? 0.6 : 0.3, 300, 0.4); this.tone(90, 'square', 0.005, 0.2, 0.15, 40); },
  boom() { this.noise(0.8, 0.85, 160, 0.3); this.tone(60, 'sine', 0.01, 0.6, 0.7, 30); },
  splash() { this.noise(0.35, 0.25, 900, 0.6); },
  step() { this.noise(0.045, 0.07, 500, 0.8); },
  ui() { this.tone(520, 'sine', 0.005, 0.12, 0.06); },
  engine(on, rpm) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0.0;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      const t = this.now();
      this.engineOsc.frequency.setTargetAtTime(55 + (rpm || 0) * 130, t, 0.08);
      this.engineGain.gain.setTargetAtTime(on ? 0.05 + (rpm || 0) * 0.05 : 0.0, t, 0.1);
    }
  },
  siren(on, dist) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      const wail = () => {
        if (!this.sirenOsc) return;
        const t = this.now();
        this.sirenOsc.frequency.setValueAtTime(660, t);
        this.sirenOsc.frequency.linearRampToValueAtTime(960, t + 0.45);
        this.sirenOsc.frequency.linearRampToValueAtTime(660, t + 0.9);
        this._sirenTimer = setTimeout(wail, 900);
      };
      wail();
    }
    if (this.sirenGain) {
      const v = on ? Math.max(0, 0.14 * (1 - (dist || 0) / 90)) : 0;
      this.sirenGain.gain.setTargetAtTime(v, this.now(), 0.2);
    }
    if (!on && this.sirenOsc) {
      clearTimeout(this._sirenTimer);
      const o = this.sirenOsc;
      setTimeout(() => { try { o.stop(); } catch (e) {} }, 300);
      this.sirenOsc = null; this.sirenGain = null;
    }
  },
};
