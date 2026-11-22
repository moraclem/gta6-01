// Costa Alba — all sound is synthesized with WebAudio. No audio files.
// One clear job: engine hum, sirens, gunshots, UI blips and radio music.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.radioOn = true;
    this.station = 0;
    this.musicTimer = null;
    this.step = 0;
    this.muted = false;
    // Three invented radio stations, each a tiny step sequencer pattern.
    this.stations = [
      { name: 'RADIO SOL — funk', bpm: 104, bass: [0, 0, 7, 0, 3, 0, 5, 7], lead: [12, -1, 15, 12, 10, -1, 12, 15] },
      { name: 'WAVE 88 — synthwave', bpm: 96, bass: [0, 0, 0, 3, 0, 0, 5, 3], lead: [12, 15, 19, 15, 12, 10, 7, 10] },
      { name: 'CALOR FM — latin', bpm: 120, bass: [0, 5, 0, 7, 0, 5, 3, 7], lead: [12, 12, 14, 15, 14, 12, 10, 7] },
    ];
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngineLoop();
    this.startSirenLoop();
    this.startRadio();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // --- continuous loops -------------------------------------------------
  startEngineLoop() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speedNorm, driving) {
    if (!this.engineOsc) return;
    const target = driving ? 0.05 + speedNorm * 0.11 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(46 + speedNorm * 130, this.ctx.currentTime, 0.1);
  }

  startSirenLoop() {
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    // Two-tone wail.
    setInterval(() => {
      if (!this.sirenOsc) return;
      const f = this.sirenOsc.frequency.value > 800 ? 660 : 920;
      this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    }, 450);
  }

  setSiren(on) {
    if (!this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  // --- one-shots ---------------------------------------------------------
  blip(freq = 660, dur = 0.08, type = 'square', vol = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.12;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.35;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.3;
    src.connect(g);
    g.connect(this.master);
    src.start(t);
    this.blip(70, 0.25, 'sawtooth', 0.2);
  }

  cashSound() { this.blip(880, 0.07); setTimeout(() => this.blip(1320, 0.1), 70); }
  missionSound() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.14), i * 110)); }
  failSound() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'sawtooth', 0.1), i * 130)); }

  // --- radio: tiny step sequencer, three stations ------------------------
  startRadio() {
    const tick = () => {
      if (!this.ctx) return;
      const st = this.stations[this.station];
      const stepDur = 60 / st.bpm / 2;
      if (this.radioOn && !this.muted) {
        const bassNote = st.bass[this.step % st.bass.length];
        const leadNote = st.lead[this.step % st.lead.length];
        this.note(55 * Math.pow(2, bassNote / 12), stepDur * 0.9, 'triangle', 0.16);
        if (leadNote >= 0 && this.step % 2 === 0) {
          this.note(220 * Math.pow(2, leadNote / 12), stepDur * 0.8, 'square', 0.045);
        }
        if (this.step % 4 === 2) this.hat();
      }
      this.step++;
      this.musicTimer = setTimeout(tick, stepDur * 1000);
    };
    tick();
  }

  note(freq, dur, type, vol) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hat() {
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.03;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  nextStation() {
    this.station = (this.station + 1) % this.stations.length;
    return this.stations[this.station].name;
  }

  stationName() { return this.stations[this.station].name; }
}
