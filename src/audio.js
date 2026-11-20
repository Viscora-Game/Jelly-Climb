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

  // Cozy-Upbeat Retro Arcade Chiptune Progression: Fmaj7 -> G6 -> Em7 -> Am7
  const CHORDS_COZY = [
    [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4],
    [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.E4],
    [NOTE.E3, NOTE.G3, NOTE.B3, NOTE.D4],
    [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.B4]
  ];
  const BASS_COZY = [NOTE.F2, NOTE.G2, NOTE.E2, NOTE.A2];

  // 64-step (4-bar) energetic Chiptune Arcade lead for Classic mode (0 = rest)
  const MELODY_COZY = [
    // Bar 1 (Fmaj7)
    NOTE.A4, 0, NOTE.C5, NOTE.E5, 0, NOTE.C5, NOTE.A4, 0,
    NOTE.E5, 0, NOTE.D5, NOTE.C5, NOTE.A4, 0, NOTE.G4, 0,
    // Bar 2 (G6)
    NOTE.B4, 0, NOTE.D5, NOTE.G5, 0, NOTE.E5, NOTE.D5, 0,
    NOTE.G5, 0, NOTE.E5, NOTE.D5, NOTE.B4, 0, NOTE.A4, 0,
    // Bar 3 (Em7)
    NOTE.G4, 0, NOTE.B4, NOTE.E5, 0, NOTE.D5, NOTE.B4, 0,
    NOTE.E5, 0, NOTE.D5, NOTE.B4, NOTE.G4, 0, NOTE.E4, 0,
    // Bar 4 (Am7)
    NOTE.A4, 0, NOTE.C5, NOTE.E5, 0, NOTE.G5, NOTE.E5, 0,
    NOTE.A5, 0, NOTE.G5, NOTE.E5, NOTE.C5, 0, NOTE.B4, 0
  ];

  // Fast Arcade Synth Progression for Rising Floor: Am -> F -> Dm -> E
  const CHORDS_RISING = [
    [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.G4],
    [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.E4],
    [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.C4],
    [NOTE.E3, NOTE.G3, NOTE.B3, NOTE.D4]
  ];
  const BASS_RISING = [NOTE.A2, NOTE.F2, NOTE.D3, NOTE.E2];

  // 64-step driving retro arcade chiptune melody for Rising Floor
  const MELODY_RISING = [
    // Bar 1 (Am)
    NOTE.A4, NOTE.C5, NOTE.E5, 0, NOTE.A5, 0, NOTE.E5, NOTE.C5,
    NOTE.E5, 0, NOTE.G5, NOTE.E5, NOTE.C5, 0, NOTE.A4, 0,
    // Bar 2 (F)
    NOTE.A4, NOTE.C5, NOTE.F5, 0, NOTE.A5, 0, NOTE.F5, NOTE.C5,
    NOTE.E5, 0, NOTE.C5, NOTE.A4, NOTE.G4, 0, NOTE.A4, 0,
    // Bar 3 (Dm)
    NOTE.D5, NOTE.F5, NOTE.A5, 0, NOTE.F5, 0, NOTE.D5, NOTE.A4,
    NOTE.C5, 0, NOTE.D5, NOTE.F5, NOTE.E5, 0, NOTE.D5, 0,
    // Bar 4 (Em)
    NOTE.E5, NOTE.G5, NOTE.B4, 0, NOTE.E5, 0, NOTE.G5, NOTE.E5,
    NOTE.D5, 0, NOTE.B4, NOTE.G4, NOTE.A4, 0, NOTE.B4, 0
  ];

  /**
   * Web Audio SFX & BGM engine (supports drop-in MP3 via assets/bgm/track.json + chiptune synth fallback).
   */
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.lastStretchStep = 0;
      this.enabled = true;
      this.musicEnabled = true;
      this.musicVolume = 0.7;

      // Procedural + external BGM state
      this.musicBus = null;
      this.masterMusicGain = null;
      this.externalMusicBuffer = null;
      this.externalSource = null;
      this.externalGain = null;
      this.trackConfigChecked = false;
      this.noiseBuffer = null;
      this.musicStep = 0;
      this.nextNoteTime = 0;
      this.musicTimerId = null;
      this.musicState = 'menu'; // 'menu' | 'playing' | 'dead'
      this.musicMode = 'classic'; // 'tutorial' | 'classic' | 'rising'
      this.musicTempoTier = 1;
      this.currentBpm = 104;
      this.targetBpm = 104;
      this.isBackgrounded = false;
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
    }

    setMusicEnabled(enabled) {
      this.musicEnabled = Boolean(enabled);
      this._applyMusicVolume();
      if (!this.musicEnabled) {
        this._stopMusicLoop();
        this._stopExternalTrack();
      } else if (!this.isBackgrounded) {
        this._syncMusicPlayback();
      }
    }

    setMusicVolume(vol) {
      const clamped = Math.max(0, Math.min(1, Number(vol)));
      this.musicVolume = Number.isFinite(clamped) ? clamped : 0.7;
      if (this.musicVolume <= 0.01) {
        this.musicEnabled = false;
        this._stopMusicLoop();
        this._stopExternalTrack();
      } else if (!this.musicEnabled && vol > 0.01) {
        this.musicEnabled = true;
      }
      this._applyMusicVolume();
      if (!this.isBackgrounded) {
        this._syncMusicPlayback();
      }
    }

    _getEffectiveBusGain() {
      if (!this.musicEnabled || this.musicVolume <= 0.01) return 0;
      return 0.31 * this.musicVolume;
    }

    _getEffectiveExternalGain() {
      if (!this.musicEnabled || this.musicVolume <= 0.01) return 0;
      const stateScale = this.musicState === 'dead' ? 0.14 : this.musicState === 'playing' ? 0.34 : 0.25;
      return stateScale * this.musicVolume;
    }

    _applyMusicVolume() {
      if (!this.ctx) return;
      try {
        if (this.masterMusicGain) {
          this.masterMusicGain.gain.setTargetAtTime(
            this._getEffectiveBusGain(),
            this.ctx.currentTime,
            0.05
          );
        }
        if (this.externalGain) {
          this.externalGain.gain.setTargetAtTime(
            this._getEffectiveExternalGain(),
            this.ctx.currentTime,
            0.08
          );
        }
      } catch (_) {}
    }

    setMusicContext(state, gameMode, tempoTier = 1) {
      this.musicState = state || 'menu';
      this.musicMode = gameMode || 'classic';
      this.musicTempoTier = tempoTier || 1;
      this.targetBpm = this._computeTargetBpm();

      if (this.externalGain && this.ctx) {
        try {
          this.externalGain.gain.setTargetAtTime(
            this._getEffectiveExternalGain(),
            this.ctx.currentTime,
            0.2
          );
        } catch (_) {}
      }
      if (this.externalSource && this.ctx) {
        try {
          this.externalSource.playbackRate.setTargetAtTime(1.0, this.ctx.currentTime, 0.25);
        } catch (_) {}
      }
    }

    _computeTargetBpm() {
      if (this.musicState === 'dead') return 96;
      if (this.musicState !== 'playing') return 104;
      return this.musicMode === 'rising' ? 110 : this.musicMode === 'tutorial' ? 104 : 106;
    }

    _syncMusicPlayback() {
      if (
        this.isBackgrounded ||
        !this.musicEnabled ||
        this.musicVolume <= 0.01 ||
        !this.ctx ||
        this.ctx.state !== 'running'
      ) {
        return;
      }
      if (this.externalMusicBuffer) {
        this._startExternalTrack();
      } else if (!this.musicTimerId) {
        this._startMusicLoop();
      }
    }

    /**
     * Suspends Web Audio output and background music scheduler immediately when app hides.
     */
    suspendForBackground() {
      this.isBackgrounded = true;
      this.resetStretchTick();
      this._stopMusicLoop();
      if (!this.ctx) return;
      try {
        if (this.ctx.state === 'running') {
          const p = this.ctx.suspend();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch (_) {}
    }

    /**
     * Resumes Web Audio context when app returns to foreground (gesture fallback handled by unlock()).
     */
    resumeFromBackground() {
      if (global.document && global.document.hidden) return;
      this.isBackgrounded = false;
      if (!this.ctx) return;
      try {
        if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
          const p = this.ctx.resume();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              if (!this.isBackgrounded) this._syncMusicPlayback();
            }).catch(() => {});
          }
        } else {
          this._syncMusicPlayback();
        }
      } catch (_) {}
    }

    unlock() {
      try {
        if (this.isBackgrounded || (global.document && global.document.hidden)) {
          return;
        }
        if (!this.ctx) {
          const AudioCtx = global.AudioContext || global.webkitAudioContext;
          if (!AudioCtx) return;
          this.ctx = new AudioCtx();
          this._setupMusicBus();
        }
        if (!this.trackConfigChecked) {
          this.trackConfigChecked = true;
          this._checkExternalTrackConfig();
        }
        if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
          const p = this.ctx.resume();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              if (!this.isBackgrounded) this._syncMusicPlayback();
            }).catch(() => {});
          }
        }
        this._syncMusicPlayback();
      } catch (_) {
        // Ignore audio errors on restricted environments
      }
    }

    async _checkExternalTrackConfig() {
      if (typeof global.fetch !== 'function' || !this.ctx) return;
      try {
        const res = await global.fetch('assets/bgm/track.json', { cache: 'no-cache' });
        if (!res || !res.ok) return;
        const cfg = await res.json();
        if (cfg && typeof cfg.url === 'string' && cfg.url.trim()) {
          await this.loadExternalTrack(cfg.url.trim());
        }
      } catch (_) {
        // Fallback smoothly to built-in chiptune synth
      }
    }

    async loadExternalTrack(url) {
      if (typeof global.fetch !== 'function' || !this.ctx || !url) return false;
      try {
        const res = await global.fetch(url);
        if (!res || !res.ok) return false;
        const arrBuf = await res.arrayBuffer();
        const decoded = await this.ctx.decodeAudioData(arrBuf);
        this.externalMusicBuffer = decoded;
        if (!this.isBackgrounded && this.musicEnabled && this.ctx.state === 'running') {
          this._stopMusicLoop();
          this._startExternalTrack();
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    _startExternalTrack() {
      if (!this.ctx || !this.externalMusicBuffer || this.externalSource) return;
      try {
        if (!this.externalGain) {
          this.externalGain = this.ctx.createGain();
          this.externalGain.connect(this.ctx.destination);
        }
        const vol = this._getEffectiveExternalGain();
        this.externalGain.gain.setValueAtTime(vol, this.ctx.currentTime);
        const src = this.ctx.createBufferSource();
        src.buffer = this.externalMusicBuffer;
        src.loop = true;
        src.connect(this.externalGain);
        src.start(0);
        this.externalSource = src;
      } catch (_) {}
    }

    _stopExternalTrack() {
      if (this.externalSource) {
        try {
          this.externalSource.stop();
          this.externalSource.disconnect();
        } catch (_) {}
        this.externalSource = null;
      }
    }

    _setupMusicBus() {
      if (!this.ctx || this.musicBus) return;
      try {
        const master = this.ctx.createGain();
        master.gain.value = this._getEffectiveBusGain();

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
      if (this.isBackgrounded || !this.ctx || !this.musicEnabled || this.musicTimerId) return;
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
      this.targetBpm = this._computeTargetBpm();
      // Gradually glide BPM up when building Tempo and gently ease down when slowing down
      const glideRate = this.targetBpm > this.currentBpm ? 0.18 : 0.08;
      this.currentBpm += (this.targetBpm - this.currentBpm) * glideRate;
      // 16th-note step duration in seconds
      return 60 / this.currentBpm / 4;
    }

    _scheduleMusic() {
      if (
        this.isBackgrounded ||
        !this.musicEnabled ||
        !this.ctx ||
        this.ctx.state !== 'running' ||
        !this.musicBus
      ) {
        return;
      }
      if (this.ctx.currentTime - this.nextNoteTime > 0.25) {
        this.nextNoteTime = this.ctx.currentTime + 0.03;
      }
      const lookahead = 0.12;

      while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
        const stepDur = this._getStepDuration();
        this._triggerMusicStep(this.musicStep, this.nextNoteTime, stepDur);
        this.nextNoteTime += stepDur;
        this.musicStep = (this.musicStep + 1) % 64;
      }
    }

    _triggerMusicStep(step, time, stepDur) {
      const isRising = this.musicState === 'playing' && this.musicMode === 'rising';
      const isPlaying = this.musicState === 'playing';
      const isDead = this.musicState === 'dead';
      const tempo = isPlaying ? Math.max(1, this.musicTempoTier) : 1;

      const chords = isRising ? CHORDS_RISING : CHORDS_COZY;
      const bassNotes = isRising ? BASS_RISING : BASS_COZY;
      const melody = isRising ? MELODY_RISING : MELODY_COZY;

      const barIdx = Math.floor(step / 16) % 4;
      const stepInBar = step % 16;

      // 1. Calm quarter-note pads at slow pace -> brisk 8th-note arcade arpeggios as Tempo rises
      const arpInterval = tempo >= 2 ? 2 : 4;
      if (stepInBar % arpInterval === 0 && !isDead) {
        const chord = chords[barIdx];
        const arpNote = chord[Math.floor(stepInBar / arpInterval) % chord.length];
        this._playMusicPadNote(arpNote, time, stepDur * (arpInterval * 0.85), isPlaying ? 0.032 : 0.022);
      }

      // 2. Clean bass groove (syncopated octave pulse unlocks cleanly at Tempo x2+)
      const bassRoot = bassNotes[barIdx];
      if (stepInBar % 4 === 0 || (isPlaying && tempo >= 2 && stepInBar % 4 === 2)) {
        const isOffbeat = stepInBar % 4 === 2;
        this._playMusicBassNote(
          isOffbeat ? bassRoot * 2 : bassRoot,
          time,
          stepDur * (isOffbeat ? 1.5 : 2.8),
          isDead ? 0.055 : isOffbeat ? 0.062 : 0.095
        );
      }

      // 3. Chiptune lead melody (sparser on idle/menu, brisk at Tempo x2+)
      const melFreq = melody[step];
      if (melFreq && !isDead && (tempo >= 2 || step % 2 === 0)) {
        const melVol = isPlaying ? 0.068 : 0.048;
        this._playKalimbaPluck(melFreq, time, stepDur * 1.9, melVol);
      } else if (melFreq && isDead && step % 4 === 0) {
        this._playKalimbaPluck(melFreq * 0.5, time, stepDur * 2.6, 0.032);
      }

      // 4. Adaptive percussion: calm beat at x1, snappy hi-hats scale in only at Tempo x2+
      if (isPlaying) {
        if (stepInBar === 0 || stepInBar === 8 || (isRising && tempo >= 3 && stepInBar === 10)) {
          this._playSoftKick(time, isRising ? 0.11 : 0.088);
        }
        if (stepInBar === 4 || stepInBar === 12) {
          this._playSoftShaker(time, tempo >= 2 ? 0.056 : 0.038, 2200, 0.07);
        } else if (tempo >= 2 && stepInBar % 2 === 1 && (tempo >= 3 || stepInBar % 4 === 3)) {
          this._playSoftShaker(time, tempo >= 3 ? 0.022 : 0.014, 6200, 0.032);
        }
      }
    }

    _playKalimbaPluck(freq, time, duration, volume) {
      try {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'square';
        osc1.frequency.setValueAtTime(freq, time);

        // Chiptune octave thickness with triangle wave
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 0.5, time);

        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0.32, time);
        g2.gain.exponentialRampToValueAtTime(0.01, time + duration * 0.75);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(volume, time + 0.006);
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
        gain.gain.linearRampToValueAtTime(volume, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(gain);
        gain.connect(this.musicBus);

        osc.start(time);
        osc.stop(time + duration + 0.02);
      } catch (_) {}
    }

    _playMusicBassNote(freq, time, duration, volume) {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(volume, time + 0.008);
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
        osc.frequency.setValueAtTime(125, time);
        osc.frequency.exponentialRampToValueAtTime(42, time + 0.085);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(volume, time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);

        osc.connect(gain);
        gain.connect(this.musicBus);

        osc.start(time);
        osc.stop(time + 0.12);
      } catch (_) {}
    }

    _playSoftShaker(time, volume, centerHz = 5200, dur = 0.045) {
      if (!this.noiseBuffer) return;
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = centerHz;
        filter.Q.value = 1.6;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicBus);

        src.start(time);
      } catch (_) {}
    }

    _playTone(freqStart, freqEnd, duration, type, volume, delay = 0) {
      if (this.isBackgrounded || !this.enabled || !this.ctx || this.ctx.state !== 'running') return;
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
      const intensity = Math.min(1, Math.max(0.22, impactSpeed / 1000));
      const base = 165 + intensity * 105;
      // Weighty sub-thud on hard wall impacts + soft elastic squish chirp
      this._playTone(base * 1.45, base * 0.68, 0.105, 'sine', 0.125 * intensity);
      this._playTone(base * 0.85, base * 1.25, 0.085, 'triangle', 0.06 * intensity, 0.02);
      if (intensity > 0.65) {
        this._playTone(105, 44, 0.09, 'sine', 0.075 * intensity, 0);
      }
    }

    playLaunch(strength, tempo = 1) {
      const s = Math.min(1, Math.max(0.2, strength));
      const tempoBoost = Math.min(1.16, 1 + Math.max(0, tempo - 1) * 0.035);
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

    playBossWarning() {
      this._playTone(220, 180, 0.16, 'sawtooth', 0.075, 0);
      this._playTone(293.66, 220, 0.18, 'triangle', 0.09, 0.18);
      this._playTone(220, 165, 0.22, 'sawtooth', 0.08, 0.36);
    }

    playBossHit(isCrit = false) {
      const f = isCrit ? 480 : 320;
      this._playTone(f, 110, 0.12, 'sawtooth', isCrit ? 0.11 : 0.085);
      this._playTone(f * 1.5, f * 2.1, 0.1, 'triangle', isCrit ? 0.09 : 0.06, 0.02);
    }

    playBossPhaseShift() {
      this._playTone(140, 420, 0.22, 'sawtooth', 0.095, 0);
      this._playTone(280, 620, 0.26, 'triangle', 0.09, 0.1);
    }

    playBossDefeat() {
      this._playTone(261.63, 130, 0.18, 'sawtooth', 0.1, 0);
      this._playTone(523.25, 659.25, 0.1, 'triangle', 0.09, 0.08);
      this._playTone(659.25, 783.99, 0.11, 'triangle', 0.1, 0.16);
      this._playTone(783.99, 1046.5, 0.16, 'sine', 0.11, 0.24);
      this._playTone(1046.5, 1318.5, 0.28, 'sine', 0.11, 0.34);
    }

    playPop() {
      this._playTone(320, 75, 0.18, 'sawtooth', 0.09);
      this._playTone(190, 55, 0.22, 'sine', 0.11, 0.02);
    }

    playAirDash() {
      this._playTone(280, 680, 0.14, 'sine', 0.09, 0);
      this._playTone(540, 960, 0.12, 'triangle', 0.07, 0.04);
    }

    playChronoRewind() {
      this._playTone(760, 290, 0.24, 'sine', 0.085, 0);
      this._playTone(290, 740, 0.3, 'triangle', 0.09, 0.22);
      this._playTone(1046.5, 1567.98, 0.26, 'sine', 0.08, 0.5);
    }

    playAngelRevive() {
      this._playTone(523.25, 659.25, 0.22, 'sine', 0.09, 0);
      this._playTone(659.25, 783.99, 0.24, 'triangle', 0.085, 0.14);
      this._playTone(783.99, 1046.5, 0.3, 'sine', 0.1, 0.3);
      this._playTone(1046.5, 1318.5, 0.36, 'triangle', 0.09, 0.5);
    }

    playRelicUpgrade() {
      this._playTone(440, 554.37, 0.08, 'triangle', 0.09, 0);
      this._playTone(554.37, 659.25, 0.09, 'triangle', 0.095, 0.07);
      this._playTone(659.25, 880, 0.18, 'sine', 0.1, 0.14);
    }

    playLaserBeam() {
      this._playTone(480, 170, 0.16, 'sawtooth', 0.07, 0);
      this._playTone(880, 420, 0.14, 'triangle', 0.055, 0.02);
    }

    playWindBoost() {
      this._playTone(320, 740, 0.18, 'sine', 0.085, 0);
      this._playTone(480, 920, 0.14, 'triangle', 0.06, 0.04);
    }
  }

  JellyGame.SoundFX = SoundFX;
})(window);
