// Costa Alba — sound: everything is synthesized with WebAudio. Three radio
// stations (funk, synthwave, latin) run on a tiny step sequencer, plus an
// engine hum, police sirens and gunshots. No audio files ship with the game.
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 16 steps per bar. null = rest.
const STATIONS = {
  funk: {
    name: 'ALBA FUNK 87', bpm: 104,
    bass: [40, null, 40, null, 43, null, 40, 45, 40, null, 40, null, 47, 45, 43, 38],
    keys: [64, null, 67, null, 69, null, 67, null, 64, null, 67, null, 71, null, 69, 67],
    hat: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0],
  },
  synth: {
    name: 'NEON DRIVE 92', bpm: 96,
    bass: [33, null, null, 33, null, null, 33, null, 36, null, null, 36, null, 31, null, null],
    keys: [69, 72, 76, 79, 81, 79, 76, 72, 69, 72, 76, 79, 76, 72, 69, 67],
    hat: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
  },
  latin: {
    name: 'CORAL LATINA 101', bpm: 116,
    bass: [48, null, null, 48, null, 55, null, 48, null, null, 48, null, 53, null, 55, null],
    keys: [60, 64, 67, 64, 60, 64, 67, 71, 67, 64, 60, 64, 67, 64, 60, 59],
    hat: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0], // clave-ish
  },
};

export class SoundEngine {
  constructor(bus) {
    this.bus = bus;
    this.ctx = null;
    this.master = null;
    this.stationKey = null;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenHigh = false; this.sirenT = 0;
    this.noiseBuf = null;
    bus.on('sound', (name) => this.play(name));
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // shared noise buffer for hats, gunshots and static
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // engine hum
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    // siren
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
  }

  stationName() {
    return this.stationKey ? STATIONS[this.stationKey].name : 'OFF';
  }

  setStation(key) {
    if (!this.ctx) return;
    if (key && !STATIONS[key]) return;
    this.stationKey = key;
    if (key) {
      this.step = 0;
      this.nextStepTime = this.ctx.currentTime + 0.06;
      if (!this.timer) this.timer = setInterval(() => this.schedule(), 30);
    } else if (this.timer) {
      clearInterval(this.timer); this.timer = null;
    }
    this.bus.emit('message', key ? `Radio: ${STATIONS[key].name}` : 'Radio off.');
  }

  schedule() {
    if (!this.ctx || !this.stationKey) return;
    const st = STATIONS[this.stationKey];
    const stepDur = 60 / st.bpm / 4;
    while (this.nextStepTime < this.ctx.currentTime + 0.18) {
      const s = this.step % 16;
      const t = this.nextStepTime;
      if (st.bass[s] != null) this.tone(midi(st.bass[s]), t, stepDur * 0.9, 'sawtooth', 0.16, 300);
      if (st.keys[s] != null) this.tone(midi(st.keys[s]), t, stepDur * 1.4, 'square', 0.05, 1800);
      if (st.hat[s]) this.noise(t, 0.03, 0.05, 6000);
      if (s % 4 === 0) this.tone(55, t, 0.12, 'sine', 0.22, 200); // kick
      this.step++;
      this.nextStepTime += stepDur;
    }
  }

  tone(freq, when, dur, type, vol, cutoff) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff || 3000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(f).connect(g).connect(this.master);
    o.start(when); o.stop(when + dur + 0.05);
  }

  noise(when, dur, vol, cutoff) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = cutoff || 1000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(when); src.stop(when + dur + 0.02);
  }

  play(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (name === 'shot') {
      this.noise(t, 0.14, 0.5, 900);
      this.tone(160, t, 0.1, 'square', 0.2, 900);
    } else if (name === 'dryfire') {
      this.tone(1200, t, 0.03, 'square', 0.08, 4000);
    } else if (name === 'hit') {
      this.tone(880, t, 0.06, 'sine', 0.12, 3000);
    } else if (name === 'reload') {
      this.tone(900, t, 0.04, 'square', 0.1, 3000);
      this.tone(600, t + 0.12, 0.04, 'square', 0.1, 3000);
    } else if (name === 'mission') {
      [72, 76, 79].forEach((m, i) => this.tone(midi(m), t + i * 0.12, 0.22, 'triangle', 0.16, 3000));
    } else if (name === 'complete') {
      [72, 76, 79, 84].forEach((m, i) => this.tone(midi(m), t + i * 0.1, 0.3, 'triangle', 0.16, 3000));
    } else if (name === 'fail') {
      [64, 60, 55].forEach((m, i) => this.tone(midi(m), t + i * 0.16, 0.3, 'sawtooth', 0.1, 1200));
    } else if (name === 'crash') {
      this.noise(t, 0.25, 0.35, 500);
    } else if (name === 'pickup') {
      this.tone(1046, t, 0.08, 'sine', 0.14, 4000);
      this.tone(1318, t + 0.08, 0.12, 'sine', 0.14, 4000);
    }
  }

  update(dt, { speedKmh, inCar, wanted }) {
    if (!this.ctx) return;
    const targetEngine = inCar ? 0.05 + Math.min(0.16, speedKmh / 900) : 0;
    this.engineGain.gain.value += (targetEngine - this.engineGain.gain.value) * dt * 4;
    this.engineOsc.frequency.value = 50 + speedKmh * 1.1;
    this.sirenT += dt;
    if (wanted > 0 && this.sirenT > 0.45) {
      this.sirenT = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.value = this.sirenHigh ? 950 : 700;
    }
    const targetSiren = wanted > 0 ? 0.045 : 0;
    this.sirenGain.gain.value += (targetSiren - this.sirenGain.gain.value) * dt * 3;
  }
}
