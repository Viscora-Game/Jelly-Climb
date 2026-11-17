(function (global) {
  'use strict';

  const JellyGame = (global.JellyGame = global.JellyGame || {});

  // Royalty-free original procedural soundtrack note frequencies (Hz)
  const NOTE = Object.freeze({
    E2: 82.41,
    F2: 87.31,
    G2: 98.0,
    A2: 110.0,
    B2: 123.47,
    C3: 130.81,
    D3: 146.83,
    E3: 164.81,
    F3: 174.61,
    G3: 196.0,
    A3: 220.0,
    B3: 246.94,
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392.0,
    A4: 440.0,
    B4: 493.88,
    C5: 523.25,
    D5: 587.33,
    E5: 659.25,
    G5: 783.99,
    A5: 880.0
  });

  // Cozy Bioluminescent Cavern Progression: Fmaj7 -> G6 -> Em7 -> Am9
  const CHORDS_COZY = [
    [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4],
    [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.E4],
    [NOTE.E3, NOTE.G3, NOTE.B3, NOTE.D4],
    [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.B4]
  ];
  const BASS_COZY = [NOTE.F2, NOTE.G2, NOTE.E2, NOTE.A2];

  // 64-step (4-bar) Kalimba/Marimba melody for Cozy/Classic mode (0 = rest)
  const MELODY_COZY = [
    // Bar 1 (Fmaj7)
    NOTE.A4, 0, NOTE.C5, 0, NOTE.E5, 0, NOTE.C5, 0,
    NOTE.A4, 0, NOTE.G4, 0, NOTE.E4, 0, 0, 0,
    // Bar 2 (G6)
    NOTE.B4, 0, NOTE.D5, 0, NOTE.G5, 0, NOTE.E5, 0,
    NOTE.D5, 0, NOTE.B4, 0, NOTE.G4, 0, NOTE.A4, 0,
    // Bar 3 (Em7)
    NOTE.G4, 0, NOTE.B4, 0, NOTE.E5, 0, NOTE.D5, 0,
    NOTE.B4, 0, NOTE.G4, 0, NOTE.E4, 0, 0, 0,
    // Bar 4 (Am9)
    NOTE.A4, 0, NOTE.C5, 0, NOTE.E5, 0, NOTE.G5, 0,
    NOTE.E5, 0, NOTE.C5, 0, NOTE.B4, 0, NOTE.G4, 0
  ];

  // Energetic Rising Magma Progression: Am7 -> Fmaj7 -> Dm7 -> Em7
  const CHORDS_RISING = [
    [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.G4],
    [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4],
    [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.C4],
    [NOTE.E3, NOTE.G3, NOTE.B3, NOTE.D4]
  ];
  const BASS_RISING = [NOTE.A2, NOTE.F2, NOTE.D3, NOTE.E2];

  // 64-step driving synth-marimba melody for Rising Floor mode
  const MELODY_RISING = [
    // Bar 1 (Am)
    NOTE.A4, 0, NOTE.E5, 0, NOTE.C5, 0, NOTE.A4, NOTE.C5,
    NOTE.E5, 0, NOTE.G5, 0, NOTE.E5, 0, NOTE.C5, 0,
    // Bar 2 (Fmaj7)
    NOTE.A4, 0, NOTE.F5, 0, NOTE.C5, 0, NOTE.A4, NOTE.C5,
    NOTE.E5, 0, NOTE.C5, 0, NOTE.A4, 0, NOTE.G4, 0,
    // Bar 3 (Dm7)
    NOTE.A4, 0, NOTE.D5, 0, NOTE.F5, 0, NOTE.D5, 0,
    NOTE.C5, 0, NOTE.A4, 0, NOTE.F4, 0, NOTE.A4, 0,
    // Bar 4 (Em7)
    NOTE.B4, 0, NOTE.E5, 0, NOTE.G5, 0, NOTE.E5, 0,
    NOTE.D5, 0, NOTE.B4, 0, NOTE.G4, 0, NOTE.E4, 0
  ];

  /**
   * Procedural Web Audio synthesizer for tactile jelly SFX & royalty-free original soundtrack.
   */
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.lastStretchStep = 0;
      this.enabled = true;
      this.musicEnabled = true;

      // Music engine state
      this.musicBus = null;
      this.echoNode = null;
      this.noiseBuffer = null;
      this.musicStep = 0;
      this.nextNoteTime = 0;
      this.musicTimerId = null;
      this.musicState = 'menu'; // 'menu' | 'playing' | 'dead'
      this.musicMode = 'classic'; // 'tutorial' | 'classic' | 'rising'
      this.musicTempoTier = 1;
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
    }

    setMusicEnabled(enabled) {
      this.musicEnabled = Boolean(enabled);
      if (!this.musicEnabled) {
        this._stopMusicLoop();
      } else if (this.ctx && this.ctx.state === 'running') {
        this._startMusicLoop();
      }
    }

    setMusicContext(state, gameMode, tempoTier = 1) {
      this.musicState = state || 'menu';
      this.musicMode = gameMode || 'classic';
      this.musicTempoTier = tempoTier || 1;
    }

    unlock() {
      try {
        if (!this.ctx) {
          const AudioCtx = global.AudioContext || global.webkitAudioContext;
          if (!AudioCtx) return;
          this.ctx = new AudioCtx();
          this._setupMusicBus();
        }
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        if (this.musicEnabled && !this.musicTimerId) {
          this._startMusicLoop();
        }
      } catch (_) {
        // Ignore audio errors on restricted environments
      }
    }

    _setupMusicBus() {
      if (!this.ctx || this.musicBus) return;
      try {
        const master = this.ctx.createGain();
        master.gain.value = 0.22;

        // Warm lowpass filter so music stays soft and never harsh
        const warmthFilter = this.ctx.createBiquadFilter();
        warmthFilter.type = 'lowpass';
        warmthFilter.frequency.value = 2600;
        warmthFilter.Q.value = 0.7;

        // Cavern delay / echo bus for dreamy atmosphere
        const delay = this.ctx.createDelay(1.0);
        delay.delayTime.value = 0.27;
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.25;
        const echoFilter = this.ctx.createBiquadFilter();
        echoFilter.type = 'lowpass';
        echoFilter.frequency.value = 1450;
        const wetGain = this.ctx.createGain();
        wetGain.gain.value = 0.28;

        delay.connect(echoFilter);
        echoFilter.connect(feedback);
        feedback.connect(delay);
        echoFilter.connect(wetGain);

        warmthFilter.connect(master);
        warmthFilter.connect(delay);
        wetGain.connect(master);
        master.connect(this.ctx.destination);

        this.musicBus = warmthFilter;
        this.masterMusicGain = master;

        // Create short white-noise buffer for soft shaker percussion
        const sr = this.ctx.sampleRate || 44100;
        const len = Math.floor(sr * 0.05);
        const buf = this.ctx.createBuffer(1, len, sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
        }
        this.noiseBuffer = buf;
      } catch (_) {}
    }

    _startMusicLoop() {
      if (!this.ctx || !this.musicEnabled || this.musicTimerId) return;
      this._setupMusicBus();
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      this.musicTimerId = global.setInterval(() => this._scheduleMusic(), 45);
    }

    _stopMusicLoop() {
      if (this.musicTimerId) {
        global.clearInterval(this.musicTimerId);
        this.musicTimerId = null;
      }
    }

    _getStepDuration() {
      let bpm = 110;
      if (this.musicState === 'playing') {
        if (this.musicMode === 'rising') {
          bpm = 124 + Math.min(12, (this.musicTempoTier - 1) * 3);
        } else if (this.musicMode === 'tutorial') {
          bpm = 112;
        } else {
          bpm = 116 + Math.min(12, (this.musicTempoTier - 1) * 3);
        }
      } else if (this.musicState === 'dead') {
        bpm = 96;
      }
      // 16th-note step duration in seconds
      return 60 / bpm / 4;
    }

    _scheduleMusic() {
      if (!this.musicEnabled || !this.ctx || this.ctx.state !== 'running' || !this.musicBus) {
        return;
      }
      const stepDur = this._getStepDuration();
      const lookahead = 0.12;

      while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
        this._triggerMusicStep(this.musicStep, this.nextNoteTime, stepDur);
        this.nextNoteTime += stepDur;
        this.musicStep = (this.musicStep + 1) % 64;
      }
    }

    _triggerMusicStep(step, time, stepDur) {
      const isRising = this.musicState === 'playing' && this.musicMode === 'rising';
      const isPlaying = this.musicState === 'playing';
      const isDead = this.musicState === 'dead';

      const chords = isRising ? CHORDS_RISING : CHORDS_COZY;
      const bassNotes = isRising ? BASS_RISING : BASS_COZY;
      const melody = isRising ? MELODY_RISING : MELODY_COZY;

      const barIdx = Math.floor(step / 16) % 4;
      const stepInBar = step % 16;

      // 1. Lush Warm Pad Chord at the start of every 16-step bar
      if (stepInBar === 0) {
        const chord = chords[barIdx];
        const padDur = stepDur * 15.5;
        const padVol = isDead ? 0.032 : 0.048;
        for (let i = 0; i < chord.length; i++) {
          this._playMusicPadNote(chord[i], time, padDur, padVol);
        }
      }

      // 2. Warm Sub-Bass Groove
      const bassRoot = bassNotes[barIdx];
      if (stepInBar === 0 || (isPlaying && stepInBar === 8)) {
        this._playMusicBassNote(bassRoot, time, stepDur * 5.5, isDead ? 0.07 : 0.11);
      } else if (isRising && (stepInBar === 4 || stepInBar === 12)) {
        this._playMusicBassNote(bassRoot * 2, time, stepDur * 2.8, 0.075);
      } else if (isPlaying && stepInBar === 12) {
        this._playMusicBassNote(bassRoot * 1.5, time, stepDur * 3.0, 0.065);
      }

      // 3. Plucky Kalimba / Marimba Lead Melody
      const melFreq = melody[step];
      if (melFreq && !isDead) {
        const melVol = isPlaying ? 0.085 : 0.068;
        this._playKalimbaPluck(melFreq, time, stepDur * 2.6, melVol);
      } else if (melFreq && isDead && step % 4 === 0) {
        // Softer, sparser melody on Game Over screen
        this._playKalimbaPluck(melFreq * 0.5, time, stepDur * 3.5, 0.04);
      }

      // 4. Subtle Arcade Groove Percussion (Kick & Soft Shaker)
      if (isPlaying) {
        if (stepInBar === 0 || stepInBar === 8) {
          this._playSoftKick(time, isRising ? 0.11 : 0.08);
        }
        if (stepInBar === 4 || stepInBar === 12 || (isRising && stepInBar % 2 === 1)) {
          const shakerVol = stepInBar % 4 === 0 ? 0.032 : 0.016;
          this._playSoftShaker(time, shakerVol);
        }
      }
    }

    _playKalimbaPluck(freq, time, duration, volume) {
      try {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, time);

        // Soft 2nd harmonic chime overtone
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 2, time);

        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0.18, time);
        g2.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.45);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(volume, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc1.connect(gain);
        osc2.connect(g2);
        g2.connect(gain);
        gain.connect(this.musicBus);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration + 0.02);
        osc2.stop(time + duration + 0.02);
      } catch (_) {}
    }

    _playMusicPadNote(freq, time, duration, volume) {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(volume, time + duration * 0.25);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(gain);
        gain.connect(this.musicBus);

        osc.start(time);
        osc.stop(time + duration + 0.04);
      } catch (_) {}
    }

    _playMusicBassNote(freq, time, duration, volume) {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(volume, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(gain);
        gain.connect(this.musicBus);

        osc.start(time);
        osc.stop(time + duration + 0.02);
      } catch (_) {}
    }

    _playSoftKick(time, volume) {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(115, time);
        osc.frequency.exponentialRampToValueAtTime(38, time + 0.09);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(volume, time + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);

        osc.connect(gain);
        gain.connect(this.musicBus);

        osc.start(time);
        osc.stop(time + 0.12);
      } catch (_) {}
    }

    _playSoftShaker(time, volume) {
      if (!this.noiseBuffer) return;
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 5200;
        filter.Q.value = 1.8;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicBus);

        src.start(time);
      } catch (_) {}
    }

    _playTone(freqStart, freqEnd, duration, type, volume, delay = 0) {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
      try {
        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.01);
      } catch (_) {
        // Ignore playback errors
      }
    }

    playStick(impactSpeed) {
      const intensity = Math.min(1, Math.max(0.25, impactSpeed / 1000));
      const base = 180 + intensity * 90;
      this._playTone(base * 1.45, base * 0.72, 0.095, 'sine', 0.11 * intensity);
      this._playTone(base * 0.85, base * 1.15, 0.08, 'triangle', 0.05 * intensity, 0.025);
    }

    playLaunch(strength, tempo = 1) {
      const s = Math.min(1, Math.max(0.2, strength));
      const tempoBoost = Math.pow(1.09, Math.max(0, tempo - 1));
      this._playTone((175 + s * 105) * tempoBoost, (440 + s * 270) * tempoBoost, 0.13, 'sine', 0.1);
      this._playTone((265 + s * 135) * tempoBoost, (530 + s * 210) * tempoBoost, 0.08, 'triangle', 0.045, 0.015);
    }

    playStretchTick(strength) {
      const step = Math.floor(strength * 6);
      if (step === this.lastStretchStep || step <= 0) return;
      this.lastStretchStep = step;
      this._playTone(220 + step * 45, 250 + step * 50, 0.035, 'sine', 0.028);
    }

    resetStretchTick() {
      this.lastStretchStep = 0;
    }

    playCollect(isBonus = false) {
      const base = isBonus ? 660 : 540;
      this._playTone(base, base * 1.42, 0.09, 'sine', 0.09);
      this._playTone(base * 1.25, base * 1.75, 0.11, 'triangle', 0.06, 0.04);
    }

    playUnlock() {
      this._playTone(440, 554, 0.08, 'sine', 0.08, 0);
      this._playTone(554, 659, 0.08, 'sine', 0.08, 0.06);
      this._playTone(659, 880, 0.14, 'triangle', 0.09, 0.12);
    }

    playArrowFire() {
      this._playTone(620, 210, 0.09, 'triangle', 0.055);
    }

    playUiTap() {
      this._playTone(380, 480, 0.045, 'sine', 0.055);
    }

    playBouncePad() {
      this._playTone(210, 620, 0.15, 'sine', 0.11);
      this._playTone(320, 840, 0.12, 'triangle', 0.07, 0.02);
    }

    playCrack() {
      this._playTone(150, 52, 0.12, 'sawtooth', 0.075);
    }

    playShieldGain() {
      this._playTone(523, 659, 0.08, 'sine', 0.075, 0);
      this._playTone(659, 987, 0.13, 'triangle', 0.08, 0.05);
    }

    playShieldBreak() {
      this._playTone(740, 220, 0.16, 'sine', 0.1);
      this._playTone(420, 680, 0.12, 'triangle', 0.07, 0.04);
    }

    playCloseCall() {
      this._playTone(580, 980, 0.08, 'sine', 0.075);
      this._playTone(880, 1240, 0.09, 'triangle', 0.06, 0.035);
    }

    playRecordBreak() {
      this._playTone(523, 659, 0.08, 'triangle', 0.08, 0);
      this._playTone(659, 784, 0.08, 'triangle', 0.08, 0.06);
      this._playTone(784, 1046, 0.16, 'sine', 0.095, 0.12);
    }

    playTutorialStep() {
      this._playTone(523, 659, 0.09, 'sine', 0.085, 0);
      this._playTone(659, 880, 0.12, 'triangle', 0.08, 0.055);
    }

    playTutorialComplete() {
      this._playTone(523.25, 659.25, 0.09, 'triangle', 0.09, 0);
      this._playTone(659.25, 783.99, 0.09, 'triangle', 0.09, 0.07);
      this._playTone(783.99, 1046.5, 0.12, 'triangle', 0.1, 0.14);
      this._playTone(1046.5, 1318.5, 0.22, 'sine', 0.11, 0.22);
    }

    playSafetyRebound() {
      this._playTone(340, 520, 0.12, 'sine', 0.09, 0);
      this._playTone(520, 440, 0.1, 'triangle', 0.07, 0.06);
    }

    playLavaSizzle() {
      this._playTone(180, 45, 0.26, 'sawtooth', 0.11);
      this._playTone(420, 90, 0.2, 'triangle', 0.08, 0.03);
    }

    playPop() {
      this._playTone(320, 75, 0.18, 'sawtooth', 0.09);
      this._playTone(190, 55, 0.22, 'sine', 0.11, 0.02);
    }
  }

  JellyGame.SoundFX = SoundFX;
})(window);
