// Procedural Web Audio API sound synthesizer

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isBgmEnabled = true;
    this.isSfxEnabled = true;
    this.masterGain = null;

    this.menuMusic = null;
    this.menuMusicTargetVolume = 0.40;
    this._fadeRaf = null;

    this._initAudio();
    this._initMenuMusic();
  }

  _initMenuMusic() {
    try {
      this.menuMusic = new Audio('./DavidKBD_The_Last_Pack_Orchestra_01.mp3');
      this.menuMusic.loop = true;
      this.menuMusic.preload = 'auto';
      this.menuMusic.volume = this.menuMusicTargetVolume;
    } catch (e) {
      console.warn('Failed to initialize menu music audio element:', e);
    }
  }

  _fadeVolume(targetVolume, durationMs, onComplete) {
    if (!this.menuMusic) return;
    if (this._fadeRaf) {
      cancelAnimationFrame(this._fadeRaf);
      this._fadeRaf = null;
    }
    if (durationMs <= 0) {
      this.menuMusic.volume = Math.max(0, Math.min(1, targetVolume));
      if (onComplete) onComplete();
      return;
    }
    const startVol = this.menuMusic.volume;
    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      this.menuMusic.volume = Math.max(0, Math.min(1, startVol + (targetVolume - startVol) * progress));
      if (progress < 1) {
        this._fadeRaf = requestAnimationFrame(tick);
      } else {
        this._fadeRaf = null;
        if (onComplete) onComplete();
      }
    };
    this._fadeRaf = requestAnimationFrame(tick);
  }

  startMenuMusic() {
    if (!this.isBgmEnabled) return Promise.reject(new Error('BGM disabled'));
    if (!this.menuMusic) return Promise.reject(new Error('No menu music'));
    if (this._fadeRaf) {
      cancelAnimationFrame(this._fadeRaf);
      this._fadeRaf = null;
    }
    this.menuMusic.volume = this.menuMusicTargetVolume;
    return this.menuMusic.play();
  }

  resumeMenuMusic(fadeDurationMs = 300) {
    if (!this.isBgmEnabled) return;
    if (!this.menuMusic) return;
    if (this._fadeRaf) {
      cancelAnimationFrame(this._fadeRaf);
      this._fadeRaf = null;
    }
    if (this.menuMusic.paused) {
      this.menuMusic.volume = 0.0;
      const p = this.menuMusic.play();
      if (p !== undefined) {
        p.catch(() => {});
      }
    }
    this._fadeVolume(this.menuMusicTargetVolume, fadeDurationMs);
  }

  fadeMenuMusicOut(fadeDurationMs = 220) {
    if (!this.menuMusic) return;
    if (this._fadeRaf) {
      cancelAnimationFrame(this._fadeRaf);
      this._fadeRaf = null;
    }
    if (this.menuMusic.paused) return;
    this._fadeVolume(0.0, fadeDurationMs, () => {
      this.menuMusic.pause();
    });
  }

  setBgmEnabled(enabled) {
    this.isBgmEnabled = !!enabled;
    if (!this.isBgmEnabled) {
      this.fadeMenuMusicOut(180);
    } else {
      this.resumeMenuMusic(250);
    }
  }

  setSfxEnabled(enabled) {
    this.isSfxEnabled = !!enabled;
    this.isMuted = !this.isSfxEnabled;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isSfxEnabled ? 0.75 : 0.0, this.ctx.currentTime);
    }
  }

  _initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Auto-resume audio on first user gesture
    const resumeOnGesture = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      window.removeEventListener('click', resumeOnGesture);
      window.removeEventListener('keydown', resumeOnGesture);
    };
    window.addEventListener('click', resumeOnGesture);
    window.addEventListener('keydown', resumeOnGesture);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Generates a tiny buffer of white noise.
   */
  _createNoiseBuffer(duration = 0.25) {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Heavy .50 Action Express Hand-Cannon Gunshot.
   * Multi-layered synth:
   * 1. Low-End Sub Punch: 150Hz -> 28Hz over 0.12s with high gain for chest-thumping bass.
   * 2. Explosive Crack & Roar: White-noise lowpass swept 3200Hz -> 350Hz over 0.38s with resonant tail.
   * 3. Mechanical Slide Clack: 1800Hz bandpass metallic click delayed by 90ms as heavy steel slide slams forward.
   */
  playGunshot() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // 1. LAYER 1: Low-End Sub Punch (150Hz -> 28Hz over 0.12s, high gain)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(150, t);
    subOsc.frequency.exponentialRampToValueAtTime(28, t + 0.12);

    subGain.gain.setValueAtTime(1.15, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);

    subOsc.start(t);
    subOsc.stop(t + 0.14);

    // 2. LAYER 2: Explosive Crack & Roar (White noise sweeping 3200Hz -> 350Hz over 0.38s)
    const noiseBuffer = this._createNoiseBuffer(0.40);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, t);
      filter.frequency.exponentialRampToValueAtTime(350, t + 0.38);
      filter.Q.setValueAtTime(2.2, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.95, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.39);
    }

    // 3. LAYER 3: Mechanical Slide Clack (1800Hz bandpass burst delayed by 90ms)
    const clackDelay = 0.090; // 90ms
    const clackTime = t + clackDelay;
    const clackBuffer = this._createNoiseBuffer(0.05);
    if (clackBuffer) {
      const clack = this.ctx.createBufferSource();
      clack.buffer = clackBuffer;

      const clackFilter = this.ctx.createBiquadFilter();
      clackFilter.type = 'bandpass';
      clackFilter.frequency.setValueAtTime(1800, clackTime);
      clackFilter.Q.setValueAtTime(4.5, clackTime);

      const clackGain = this.ctx.createGain();
      clackGain.gain.setValueAtTime(0.0, t);
      clackGain.gain.setValueAtTime(0.60, clackTime);
      clackGain.gain.exponentialRampToValueAtTime(0.001, clackTime + 0.045);

      clack.connect(clackFilter);
      clackFilter.connect(clackGain);
      clackGain.connect(this.masterGain);

      clack.start(clackTime);
      clack.stop(clackTime + 0.05);
    }
  }

  /**
   * Cardboard / Wood Box Destruction Crunch.
   */
  playBoxCrunch(isDeadCenter = false) {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // 1. Heavy Box Impact Thud
    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(isDeadCenter ? 120 : 90, t);
    thud.frequency.exponentialRampToValueAtTime(30, t + 0.12);

    thudGain.gain.setValueAtTime(0.7, t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    thud.connect(thudGain);
    thudGain.connect(this.masterGain);

    thud.start(t);
    thud.stop(t + 0.14);

    // 2. Cardboard / Splinter Crackle (Bandpass Noise)
    const noiseBuffer = this._createNoiseBuffer(0.18);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isDeadCenter ? 1400 : 950, t);
      filter.Q.setValueAtTime(2.2, t);

      const crunchGain = this.ctx.createGain();
      crunchGain.gain.setValueAtTime(0.65, t);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

      noise.connect(filter);
      filter.connect(crunchGain);
      crunchGain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.16);
    }
  }

  /**
   * Retro Arcade Combo Chime.
   * Ascending bell harmonics for satisfying feedback streaks.
   */
  playComboDing(comboStreak = 1) {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Base pitch increases with streak (pentatonic steps)
    const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50]; // C5, D5, E5, G5, A5, C6
    const noteIdx = Math.min(comboStreak - 1, scale.length - 1);
    const freq = scale[Math.max(0, noteIdx)];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // Harmonic sparkle
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  /**
   * Aim Down Sights (ADS) handling whoosh.
   */
  playADSWhoosh(isEntering = true) {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    const noiseBuffer = this._createNoiseBuffer(0.12);
    if (!noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    if (isEntering) {
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(1100, t + 0.08);
    } else {
      filter.frequency.setValueAtTime(900, t);
      filter.frequency.exponentialRampToValueAtTime(350, t + 0.08);
    }
    filter.Q.setValueAtTime(1.5, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + 0.1);
  }

  /**
   * 1. Crisp 25ms high-pass filtered impulse at 2400Hz paired with short 650Hz metallic pin tick.
   * Instantly recognizable as an empty chamber click.
   */
  playDryFireClick() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // High-pass filtered impulse (25ms)
    const noiseBuffer = this._createNoiseBuffer(0.025);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const hpFilter = this.ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.setValueAtTime(2400, t);
      hpFilter.Q.setValueAtTime(3.0, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.45, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

      noise.connect(hpFilter);
      hpFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.026);
    }

    // Metallic pin tick (650Hz)
    const pinOsc = this.ctx.createOscillator();
    const pinGain = this.ctx.createGain();
    pinOsc.type = 'triangle';
    pinOsc.frequency.setValueAtTime(650, t);
    pinOsc.frequency.exponentialRampToValueAtTime(280, t + 0.025);

    pinGain.gain.setValueAtTime(0.40, t);
    pinGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    pinOsc.connect(pinGain);
    pinGain.connect(this.masterGain);

    pinOsc.start(t);
    pinOsc.stop(t + 0.026);
  }


  /**
   * 2. 1700Hz metallic mag-catch click followed by 110ms bandpass friction slide (900Hz -> 400Hz).
   */
  playMagOut() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Catch click (1700Hz)
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1700, t);
    clickOsc.frequency.exponentialRampToValueAtTime(800, t + 0.02);

    clickGain.gain.setValueAtTime(0.40, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);

    clickOsc.start(t);
    clickOsc.stop(t + 0.026);

    // Friction slide: 110ms bandpass sweeping 900Hz -> 400Hz
    const slideBuffer = this._createNoiseBuffer(0.12);
    if (slideBuffer) {
      const slide = this.ctx.createBufferSource();
      slide.buffer = slideBuffer;

      const bpFilter = this.ctx.createBiquadFilter();
      bpFilter.type = 'bandpass';
      bpFilter.frequency.setValueAtTime(900, t);
      bpFilter.frequency.exponentialRampToValueAtTime(400, t + 0.11);
      bpFilter.Q.setValueAtTime(2.8, t);

      const slideGain = this.ctx.createGain();
      slideGain.gain.setValueAtTime(0.35, t);
      slideGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

      slide.connect(bpFilter);
      bpFilter.connect(slideGain);
      slideGain.connect(this.masterGain);

      slide.start(t);
      slide.stop(t + 0.12);
    }
  }

  /**
   * 3. Friction slide up (400Hz to 800Hz) ending in heavy 160Hz low-end palm slap and sharp 2200Hz steel latch click.
   */
  playMagIn() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Friction slide up (400Hz to 800Hz) over 80ms
    const slideBuffer = this._createNoiseBuffer(0.10);
    if (slideBuffer) {
      const slide = this.ctx.createBufferSource();
      slide.buffer = slideBuffer;

      const bpFilter = this.ctx.createBiquadFilter();
      bpFilter.type = 'bandpass';
      bpFilter.frequency.setValueAtTime(400, t);
      bpFilter.frequency.exponentialRampToValueAtTime(800, t + 0.08);
      bpFilter.Q.setValueAtTime(2.2, t);

      const slideGain = this.ctx.createGain();
      slideGain.gain.setValueAtTime(0.28, t);
      slideGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      slide.connect(bpFilter);
      bpFilter.connect(slideGain);
      slideGain.connect(this.masterGain);

      slide.start(t);
      slide.stop(t + 0.085);
    }

    // Heavy 160Hz low-end palm slap
    const slapTime = t + 0.075;
    const slapOsc = this.ctx.createOscillator();
    const slapGain = this.ctx.createGain();
    slapOsc.type = 'triangle';
    slapOsc.frequency.setValueAtTime(160, slapTime);
    slapOsc.frequency.exponentialRampToValueAtTime(35, slapTime + 0.10);

    slapGain.gain.setValueAtTime(0.70, slapTime);
    slapGain.gain.exponentialRampToValueAtTime(0.001, slapTime + 0.11);

    slapOsc.connect(slapGain);
    slapGain.connect(this.masterGain);

    slapOsc.start(slapTime);
    slapOsc.stop(slapTime + 0.12);

    // Sharp 2200Hz steel latch click
    const latchOsc = this.ctx.createOscillator();
    const latchGain = this.ctx.createGain();
    latchOsc.type = 'sine';
    latchOsc.frequency.setValueAtTime(2200, slapTime);
    latchOsc.frequency.exponentialRampToValueAtTime(900, slapTime + 0.03);

    latchGain.gain.setValueAtTime(0.45, slapTime);
    latchGain.gain.exponentialRampToValueAtTime(0.001, slapTime + 0.035);

    latchOsc.connect(latchGain);
    latchGain.connect(this.masterGain);

    latchOsc.start(slapTime);
    latchOsc.stop(slapTime + 0.04);
  }

  /**
   * 4. Signature two-step heavy steel rack/slam:
   * brief 1200Hz metallic release click followed 45ms later by a thunderous 180Hz steel frame thud
   * and 2800Hz high-metallic chamber lock snap.
   */
  playSlideRelease() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Step 1: Brief 1200Hz metallic release click
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1200, t);
    clickOsc.frequency.exponentialRampToValueAtTime(500, t + 0.025);

    clickGain.gain.setValueAtTime(0.35, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.028);

    clickOsc.connect(clickGain);
    clickGain.connect(this.masterGain);

    clickOsc.start(t);
    clickOsc.stop(t + 0.03);

    // Step 2: 45ms later - thunderous 180Hz steel frame thud + 2800Hz chamber lock snap
    const slamTime = t + 0.045;

    // 180Hz frame thud
    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(180, slamTime);
    thudOsc.frequency.exponentialRampToValueAtTime(30, slamTime + 0.12);

    thudGain.gain.setValueAtTime(0.85, slamTime);
    thudGain.gain.exponentialRampToValueAtTime(0.001, slamTime + 0.13);

    thudOsc.connect(thudGain);
    thudGain.connect(this.masterGain);

    thudOsc.start(slamTime);
    thudOsc.stop(slamTime + 0.14);

    // 2800Hz high-metallic chamber lock snap
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'sine';
    snapOsc.frequency.setValueAtTime(2800, slamTime);
    snapOsc.frequency.exponentialRampToValueAtTime(1200, slamTime + 0.04);

    snapGain.gain.setValueAtTime(0.55, slamTime);
    snapGain.gain.exponentialRampToValueAtTime(0.001, slamTime + 0.045);

    snapOsc.connect(snapGain);
    snapGain.connect(this.masterGain);

    snapOsc.start(slamTime);
    snapOsc.stop(slamTime + 0.05);
  }

  /**
   * Subtle metallic slide-catch ring layered at the tail end of the 7th gunshot.
   */
  playSlideCatchRing() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime + 0.08; // Layered at tail of 7th gunshot

    const ringOsc = this.ctx.createOscillator();
    const ringGain = this.ctx.createGain();
    ringOsc.type = 'sine';
    ringOsc.frequency.setValueAtTime(3200, t);
    ringOsc.frequency.exponentialRampToValueAtTime(3050, t + 0.35);

    ringGain.gain.setValueAtTime(0.20, t);
    ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    ringOsc.connect(ringGain);
    ringGain.connect(this.masterGain);

    ringOsc.start(t);
    ringOsc.stop(t + 0.36);
  }

  /**
   * Tactical Button Hover Sound.
   * Ultra-fast, dry, precision metallic micro-tick (~18ms duration).
   * - Sine/triangle chirp: 1800 Hz -> 750 Hz over 16ms, peak gain 0.08
   * - Noise micro burst: 12ms, bandpass center 3400 Hz, Q 4.5, peak gain 0.06
   */
  playButtonHover() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Layer 1: High-frequency sine/triangle chirp
    const chirpOsc = this.ctx.createOscillator();
    const chirpGain = this.ctx.createGain();
    chirpOsc.type = 'triangle';
    chirpOsc.frequency.setValueAtTime(1800, t);
    chirpOsc.frequency.exponentialRampToValueAtTime(750, t + 0.016);

    chirpGain.gain.setValueAtTime(0.08, t);
    chirpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.018);

    chirpOsc.connect(chirpGain);
    chirpGain.connect(this.masterGain);

    chirpOsc.start(t);
    chirpOsc.stop(t + 0.018);

    // Layer 2: Micro burst of bandpass-filtered white noise
    const noiseBuffer = this._createNoiseBuffer(0.02);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const bpFilter = this.ctx.createBiquadFilter();
      bpFilter.type = 'bandpass';
      bpFilter.frequency.setValueAtTime(3400, t);
      bpFilter.Q.setValueAtTime(4.5, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.06, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.012);

      noise.connect(bpFilter);
      bpFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.013);
    }
  }

  /**
   * Primary Action Click Sound (#start-btn — START / RESUME).
   * Crisp, authoritative firearm-inspired mechanical latch / chamber-lock engage (~90ms duration).
   * - Layer 1: Metallic Sear Snap (2400 Hz -> 680 Hz over 22ms, gain 0.18) + HP noise (2500 Hz, 20ms, gain 0.15)
   * - Layer 2: Heavy Tactical Lock Body (165 Hz -> 52 Hz over 85ms, gain 0.28)
   */
  playStartClick() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Layer 1A: Metallic Sear Snap Oscillator
    const searOsc = this.ctx.createOscillator();
    const searGain = this.ctx.createGain();
    searOsc.type = 'triangle';
    searOsc.frequency.setValueAtTime(2400, t);
    searOsc.frequency.exponentialRampToValueAtTime(680, t + 0.022);

    searGain.gain.setValueAtTime(0.18, t);
    searGain.gain.exponentialRampToValueAtTime(0.001, t + 0.024);

    searOsc.connect(searGain);
    searGain.connect(this.masterGain);

    searOsc.start(t);
    searOsc.stop(t + 0.025);

    // Layer 1B: High-passed noise snap
    const noiseBuffer = this._createNoiseBuffer(0.03);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const hpFilter = this.ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.setValueAtTime(2500, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.15, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.020);

      noise.connect(hpFilter);
      hpFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.022);
    }

    // Layer 2: Heavy Tactical Lock Body punch
    const punchOsc = this.ctx.createOscillator();
    const punchGain = this.ctx.createGain();
    punchOsc.type = 'triangle';
    punchOsc.frequency.setValueAtTime(165, t);
    punchOsc.frequency.exponentialRampToValueAtTime(52, t + 0.085);

    punchGain.gain.setValueAtTime(0.28, t);
    punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.090);

    punchOsc.connect(punchGain);
    punchGain.connect(this.masterGain);

    punchOsc.start(t);
    punchOsc.stop(t + 0.092);
  }

  /**
   * Secondary Exit Click Sound (#exit-btn — EXIT).
   * Distinct two-stage tactical decock / disengage latch (~110ms duration).
   * - Stage 1 (t = 0ms): Metallic unlatch tick (1400 Hz -> 520 Hz over 20ms, gain 0.16)
   * - Stage 2 (t = 32ms): Lower mechanical release thud (130 Hz -> 45 Hz over 75ms, gain 0.24 + noise click at 1100 Hz)
   */
  playExitClick() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Stage 1 (t = 0ms): Crisp metallic unlatch tick
    const tickOsc = this.ctx.createOscillator();
    const tickGain = this.ctx.createGain();
    tickOsc.type = 'triangle';
    tickOsc.frequency.setValueAtTime(1400, t);
    tickOsc.frequency.exponentialRampToValueAtTime(520, t + 0.020);

    tickGain.gain.setValueAtTime(0.16, t);
    tickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.022);

    tickOsc.connect(tickGain);
    tickGain.connect(this.masterGain);

    tickOsc.start(t);
    tickOsc.stop(t + 0.024);

    // Stage 2 (t = 32ms): Lower mechanical release thud
    const t2 = t + 0.032;
    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(130, t2);
    thudOsc.frequency.exponentialRampToValueAtTime(45, t2 + 0.075);

    thudGain.gain.setValueAtTime(0.001, t);
    thudGain.gain.setValueAtTime(0.24, t2);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.078);

    thudOsc.connect(thudGain);
    thudGain.connect(this.masterGain);

    thudOsc.start(t2);
    thudOsc.stop(t2 + 0.080);

    // Stage 2 Noise Click: subtle filtered noise click at 1100 Hz
    const noiseBuffer = this._createNoiseBuffer(0.04);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const bpFilter = this.ctx.createBiquadFilter();
      bpFilter.type = 'bandpass';
      bpFilter.frequency.setValueAtTime(1100, t2);
      bpFilter.Q.setValueAtTime(3.0, t2);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, t);
      noiseGain.gain.setValueAtTime(0.08, t2);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.025);

      noise.connect(bpFilter);
      bpFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(t2);
      noise.stop(t2 + 0.028);
    }
  }

  /**
   * Tactical Mechanical Toggle Switch Click (#bgm-toggle-btn & #sfx-toggle-btn).
   * Snappy mechanical switch engagement (~25ms duration).
   */
  playToggleClick() {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Layer 1: Crisp tactile rocker snap
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'triangle';
    snapOsc.frequency.setValueAtTime(1750, t);
    snapOsc.frequency.exponentialRampToValueAtTime(720, t + 0.022);

    snapGain.gain.setValueAtTime(0.18, t);
    snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.024);

    snapOsc.connect(snapGain);
    snapGain.connect(this.masterGain);

    snapOsc.start(t);
    snapOsc.stop(t + 0.025);

    // Layer 2: Filtered micro noise click
    const noiseBuffer = this._createNoiseBuffer(0.025);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const bpFilter = this.ctx.createBiquadFilter();
      bpFilter.type = 'bandpass';
      bpFilter.frequency.setValueAtTime(2600, t);
      bpFilter.Q.setValueAtTime(3.8, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.10, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.018);

      noise.connect(bpFilter);
      bpFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.020);
    }
  }

  /**
   * Destructible LCD Monitor Screen Shatter + Electrical Short Pop SFX.
   * Layer 1: High-Frequency Glass Crunch (90ms high-passed noise at 2800 Hz + 4 micro-pings at 3200, 4700, 5800, 2400 Hz)
   * Layer 2: LCD Capacitive Pop (180 Hz -> 48 Hz snap over 65ms + 120 Hz buzz tail over 80ms)
   */
  playMonitorShatter() {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // 1. High-Frequency Glass Crunch (90ms high-passed white noise at 2800 Hz)
    const noiseBuffer = this._createNoiseBuffer(0.10);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const hpFilter = this.ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.setValueAtTime(2800, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.55, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.090);

      noise.connect(hpFilter);
      hpFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.092);
    }

    // 2. Four rapid metallic/glassy micro-pings (3200 Hz, 4700 Hz, 5800 Hz, 2400 Hz decaying over 45ms–110ms)
    const pings = [
      { freq: 3200, dur: 0.075, gain: 0.18, type: 'sine' },
      { freq: 4700, dur: 0.055, gain: 0.16, type: 'triangle' },
      { freq: 5800, dur: 0.045, gain: 0.14, type: 'sine' },
      { freq: 2400, dur: 0.110, gain: 0.20, type: 'triangle' },
    ];
    for (const p of pings) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = p.type;
      osc.frequency.setValueAtTime(p.freq, t);
      osc.frequency.exponentialRampToValueAtTime(p.freq * 0.85, t + p.dur);

      g.gain.setValueAtTime(p.gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + p.dur);

      osc.connect(g);
      g.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + p.dur + 0.005);
    }

    // 3. LCD Capacitive Pop: low-mid electrical snap (180 Hz -> 48 Hz over 65ms)
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'sawtooth';
    snapOsc.frequency.setValueAtTime(180, t);
    snapOsc.frequency.exponentialRampToValueAtTime(48, t + 0.065);

    snapGain.gain.setValueAtTime(0.35, t);
    snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

    snapOsc.connect(snapGain);
    snapGain.connect(this.masterGain);

    snapOsc.start(t);
    snapOsc.stop(t + 0.068);

    // 4. Electrical buzz tail (120 Hz over 80ms)
    const buzzOsc = this.ctx.createOscillator();
    const buzzGain = this.ctx.createGain();
    buzzOsc.type = 'sawtooth';
    buzzOsc.frequency.setValueAtTime(120, t + 0.015);

    buzzGain.gain.setValueAtTime(0.0, t);
    buzzGain.gain.setValueAtTime(0.18, t + 0.015);
    buzzGain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);

    buzzOsc.connect(buzzGain);
    buzzGain.connect(this.masterGain);

    buzzOsc.start(t + 0.015);
    buzzOsc.stop(t + 0.098);
  }

  /**
   * Light glass-tick sound for shooting an already-broken monitor screen.
   */
  playGlassTick() {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4200 + Math.random() * 800, t);
    osc.frequency.exponentialRampToValueAtTime(2600, t + 0.035);

    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    osc.connect(g);
    g.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.038);
  }

  /**
   * Procedural Tactical Boot Footstep SFX (Walk vs. Sprint).
   * Multi-layered synthesis:
   * - Layer 1: Low-end rubber heel strike thud on solid Data Center tile floor.
   * - Layer 2: Heel-to-toe sole tread scuff (bandpass filtered noise delayed by 6–10ms).
   * - Layer 3: Subtle high-mid tactical gear / cloth rustle (emphasized when sprinting with Shift).
   * Alternates slight pitch/timbre between left and right feet for organic human cadence.
   */
  playFootstep(isSprinting = false, isRightFoot = false) {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Subtle left/right foot alternation + organic micro-variation
    const footPitch = (isRightFoot ? 1.04 : 0.96) * (0.97 + Math.random() * 0.06);

    // 1. Heel Strike Sub-Thud (Rubber heel impact on anti-static floor tile)
    const heelOsc = this.ctx.createOscillator();
    const heelGain = this.ctx.createGain();
    const heelDur = isSprinting ? 0.065 : 0.055;
    heelOsc.type = 'triangle';
    heelOsc.frequency.setValueAtTime((isSprinting ? 118 : 92) * footPitch, t);
    heelOsc.frequency.exponentialRampToValueAtTime((isSprinting ? 36 : 30) * footPitch, t + heelDur);

    heelGain.gain.setValueAtTime(isSprinting ? 0.48 : 0.30, t);
    heelGain.gain.exponentialRampToValueAtTime(0.001, t + heelDur + 0.005);

    heelOsc.connect(heelGain);
    heelGain.connect(this.masterGain);

    heelOsc.start(t);
    heelOsc.stop(t + heelDur + 0.008);

    // 2. Sole Tread Contact & Scuff (Heel-to-toe roll delayed by 6–10ms)
    const soleTime = t + (isSprinting ? 0.006 : 0.010);
    const soleDur = isSprinting ? 0.065 : 0.052;
    const noiseBuffer = this._createNoiseBuffer(soleDur + 0.015);
    if (noiseBuffer) {
      const soleNoise = this.ctx.createBufferSource();
      soleNoise.buffer = noiseBuffer;

      const bpFilter = this.ctx.createBiquadFilter();
      bpFilter.type = 'bandpass';
      bpFilter.frequency.setValueAtTime((isSprinting ? 1050 : 780) * footPitch, soleTime);
      bpFilter.frequency.exponentialRampToValueAtTime((isSprinting ? 520 : 420) * footPitch, soleTime + soleDur);
      bpFilter.Q.setValueAtTime(1.8, soleTime);

      const soleGain = this.ctx.createGain();
      soleGain.gain.setValueAtTime(0.001, t);
      soleGain.gain.setValueAtTime(isSprinting ? 0.36 : 0.20, soleTime);
      soleGain.gain.exponentialRampToValueAtTime(0.001, soleTime + soleDur);

      soleNoise.connect(bpFilter);
      bpFilter.connect(soleGain);
      soleGain.connect(this.masterGain);

      soleNoise.start(soleTime);
      soleNoise.stop(soleTime + soleDur + 0.005);

      // 3. Tactical Cloth & Rig Micro-Rustle (Crisp upper-mid transient on sprint/walk)
      const gearNoise = this.ctx.createBufferSource();
      gearNoise.buffer = noiseBuffer;

      const gearFilter = this.ctx.createBiquadFilter();
      gearFilter.type = 'bandpass';
      gearFilter.frequency.setValueAtTime((isSprinting ? 2350 : 1950) * footPitch, soleTime);
      gearFilter.Q.setValueAtTime(2.6, soleTime);

      const gearGain = this.ctx.createGain();
      gearGain.gain.setValueAtTime(0.001, t);
      gearGain.gain.setValueAtTime(isSprinting ? 0.16 : 0.075, soleTime);
      gearGain.gain.exponentialRampToValueAtTime(0.001, soleTime + 0.042);

      gearNoise.connect(gearFilter);
      gearFilter.connect(gearGain);
      gearGain.connect(this.masterGain);

      gearNoise.start(soleTime);
      gearNoise.stop(soleTime + 0.045);
    }
  }

  /**
   * Procedural Jump Takeoff SFX.
   * Combines an upward muscular boot push-off impulse with a crisp sole scuff and cloth rush.
   */
  playJump() {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // 1. Boot Push-Off Floor Impulse (75 Hz -> 135 Hz upward spring -> 38 Hz)
    const pushOsc = this.ctx.createOscillator();
    const pushGain = this.ctx.createGain();
    pushOsc.type = 'triangle';
    pushOsc.frequency.setValueAtTime(75, t);
    pushOsc.frequency.exponentialRampToValueAtTime(135, t + 0.022);
    pushOsc.frequency.exponentialRampToValueAtTime(38, t + 0.075);

    pushGain.gain.setValueAtTime(0.45, t);
    pushGain.gain.exponentialRampToValueAtTime(0.001, t + 0.078);

    pushOsc.connect(pushGain);
    pushGain.connect(this.masterGain);

    pushOsc.start(t);
    pushOsc.stop(t + 0.080);

    // 2. Sole Push Scuff & Upward Tactical Cloth Whoosh
    const noiseBuffer = this._createNoiseBuffer(0.11);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(420, t);
      filter.frequency.exponentialRampToValueAtTime(1450, t + 0.095);
      filter.Q.setValueAtTime(1.6, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.32, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.105);
    }
  }

  /**
   * Procedural Jump / Fall Landing Impact SFX.
   * Features a heavy primary boot thud, a natural 26ms-staggered second boot touchdown,
   * and rubber sole compression scuff scaled by impact intensity.
   */
  playLand(impactIntensity = 1.0) {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const scale = Math.max(0.45, Math.min(1.35, impactIntensity));

    // 1. Primary Boot Touchdown Thud (t = 0ms)
    const thud1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    thud1.type = 'triangle';
    thud1.frequency.setValueAtTime(128, t);
    thud1.frequency.exponentialRampToValueAtTime(28, t + 0.095);

    gain1.gain.setValueAtTime(0.58 * scale, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.10);

    thud1.connect(gain1);
    gain1.connect(this.masterGain);

    thud1.start(t);
    thud1.stop(t + 0.105);

    // 2. Staggered Second Boot Touchdown (t + 26ms for realistic dual-foot landing)
    const t2 = t + 0.026;
    const thud2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    thud2.type = 'triangle';
    thud2.frequency.setValueAtTime(108, t2);
    thud2.frequency.exponentialRampToValueAtTime(32, t2 + 0.080);

    gain2.gain.setValueAtTime(0.001, t);
    gain2.gain.setValueAtTime(0.42 * scale, t2);
    gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.085);

    thud2.connect(gain2);
    gain2.connect(this.masterGain);

    thud2.start(t2);
    thud2.stop(t2 + 0.090);

    // 3. Rubber Sole Compression Scuff & Tactical Gear Settle
    const scuffBuffer = this._createNoiseBuffer(0.11);
    if (scuffBuffer) {
      const scuff = this.ctx.createBufferSource();
      scuff.buffer = scuffBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(980, t);
      filter.frequency.exponentialRampToValueAtTime(360, t + 0.090);
      filter.Q.setValueAtTime(1.8, t);

      const scuffGain = this.ctx.createGain();
      scuffGain.gain.setValueAtTime(0.38 * scale, t);
      scuffGain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);

      scuff.connect(filter);
      filter.connect(scuffGain);
      scuffGain.connect(this.masterGain);

      scuff.start(t);
      scuff.stop(t + 0.10);
    }
  }

  /**
   * Winchester Model 1912 12-Gauge Shotgun Blast.
   * Multi-layered procedural synthesis:
   * 1. Massive 12-Gauge Sub-Bass Concussion (118Hz -> 22Hz over 0.18s)
   * 2. Room-Filling Buckshot Propellant Roar (Lowpass noise 2600Hz -> 210Hz over 0.48s)
   * 3. High-Energy Muzzle Pressure Crack (Bandpass transient burst at 2100Hz)
   */
  playShotgunBlast() {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // 1. Deep 12-Gauge Sub-Bass Concussion Boom
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(118, t);
    subOsc.frequency.exponentialRampToValueAtTime(22, t + 0.18);

    subGain.gain.setValueAtTime(1.30, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(t);
    subOsc.stop(t + 0.21);

    // 2. Room-Filling Propellant Blast Roar
    const roarBuffer = this._createNoiseBuffer(0.52);
    if (roarBuffer) {
      const roar = this.ctx.createBufferSource();
      roar.buffer = roarBuffer;

      const lpFilter = this.ctx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      lpFilter.frequency.setValueAtTime(2650, t);
      lpFilter.frequency.exponentialRampToValueAtTime(195, t + 0.48);
      lpFilter.Q.setValueAtTime(1.9, t);

      const roarGain = this.ctx.createGain();
      roarGain.gain.setValueAtTime(1.12, t);
      roarGain.gain.exponentialRampToValueAtTime(0.001, t + 0.49);

      roar.connect(lpFilter);
      lpFilter.connect(roarGain);
      roarGain.connect(this.masterGain);
      roar.start(t);
      roar.stop(t + 0.50);

      // 3. Crisp Muzzle Pressure Crack
      const crack = this.ctx.createBufferSource();
      crack.buffer = roarBuffer;

      const bpFilter = this.ctx.createBiquadFilter();
      bpFilter.type = 'bandpass';
      bpFilter.frequency.setValueAtTime(2150, t);
      bpFilter.Q.setValueAtTime(1.6, t);

      const crackGain = this.ctx.createGain();
      crackGain.gain.setValueAtTime(0.68, t);
      crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

      crack.connect(bpFilter);
      bpFilter.connect(crackGain);
      crackGain.connect(this.masterGain);
      crack.start(t);
      crack.stop(t + 0.070);
    }
  }

  /**
   * Iconic Winchester Model 1912 Two-Stroke Pump-Action Rack ("CHK-CHK").
   * - Stroke 1 (t = 0ms): Breech unlock clack + steel action slide rearward scrape.
   * - Stroke 2 (t = 120ms): Forward slide stroke + solid steel breechbolt lock slam.
   */
  playShotgunPump() {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const noiseBuffer = this._createNoiseBuffer(0.28);
    if (!noiseBuffer) return;

    // STROKE 1: Rearward Pump Pull (Unlock + Slide)
    const pullNoise = this.ctx.createBufferSource();
    pullNoise.buffer = noiseBuffer;

    const pullFilter = this.ctx.createBiquadFilter();
    pullFilter.type = 'bandpass';
    pullFilter.frequency.setValueAtTime(1450, t);
    pullFilter.frequency.exponentialRampToValueAtTime(2200, t + 0.085);
    pullFilter.Q.setValueAtTime(3.2, t);

    const pullGain = this.ctx.createGain();
    pullGain.gain.setValueAtTime(0.52, t);
    pullGain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);

    pullNoise.connect(pullFilter);
    pullFilter.connect(pullGain);
    pullGain.connect(this.masterGain);
    pullNoise.start(t);
    pullNoise.stop(t + 0.10);

    // Metallic unlock transient ping
    const unlockOsc = this.ctx.createOscillator();
    const unlockGain = this.ctx.createGain();
    unlockOsc.type = 'triangle';
    unlockOsc.frequency.setValueAtTime(680, t);
    unlockOsc.frequency.exponentialRampToValueAtTime(240, t + 0.035);
    unlockGain.gain.setValueAtTime(0.32, t);
    unlockGain.gain.exponentialRampToValueAtTime(0.001, t + 0.040);
    unlockOsc.connect(unlockGain);
    unlockGain.connect(this.masterGain);
    unlockOsc.start(t);
    unlockOsc.stop(t + 0.042);

    // STROKE 2: Forward Pump Slam into Battery (t + 120ms)
    const t2 = t + 0.120;
    const pushNoise = this.ctx.createBufferSource();
    pushNoise.buffer = noiseBuffer;

    const pushFilter = this.ctx.createBiquadFilter();
    pushFilter.type = 'bandpass';
    pushFilter.frequency.setValueAtTime(2400, t2);
    pushFilter.frequency.exponentialRampToValueAtTime(1250, t2 + 0.080);
    pushFilter.Q.setValueAtTime(3.5, t2);

    const pushGain = this.ctx.createGain();
    pushGain.gain.setValueAtTime(0.001, t);
    pushGain.gain.setValueAtTime(0.62, t2);
    pushGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.085);

    pushNoise.connect(pushFilter);
    pushFilter.connect(pushGain);
    pushGain.connect(this.masterGain);
    pushNoise.start(t2);
    pushNoise.stop(t2 + 0.090);

    // Heavy breechbolt lock lug thud at end of forward stroke
    const lockOsc = this.ctx.createOscillator();
    const lockGain = this.ctx.createGain();
    lockOsc.type = 'triangle';
    lockOsc.frequency.setValueAtTime(195, t2 + 0.015);
    lockOsc.frequency.exponentialRampToValueAtTime(52, t2 + 0.065);
    lockGain.gain.setValueAtTime(0.001, t);
    lockGain.gain.setValueAtTime(0.46, t2 + 0.015);
    lockGain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.070);
    lockOsc.connect(lockGain);
    lockGain.connect(this.masterGain);
    lockOsc.start(t2 + 0.015);
    lockOsc.stop(t2 + 0.075);
  }

  /**
   * 12-Gauge Shotshell Insertion into Tubular Magazine Loading Gate.
   * Combines plastic hull slide with crisp spring-loaded carrier latch click.
   */
  playShotgunShellInsert() {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const noiseBuffer = this._createNoiseBuffer(0.08);
    if (noiseBuffer) {
      const slide = this.ctx.createBufferSource();
      slide.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1150, t);
      filter.frequency.exponentialRampToValueAtTime(2600, t + 0.055);
      filter.Q.setValueAtTime(2.8, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.38, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.062);

      slide.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      slide.start(t);
      slide.stop(t + 0.065);
    }

    // Brass rim & magazine tube latch snap (t + 28ms)
    const snapTime = t + 0.028;
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'sine';
    snapOsc.frequency.setValueAtTime(2150, snapTime);
    snapOsc.frequency.exponentialRampToValueAtTime(780, snapTime + 0.028);

    snapGain.gain.setValueAtTime(0.001, t);
    snapGain.gain.setValueAtTime(0.34, snapTime);
    snapGain.gain.exponentialRampToValueAtTime(0.001, snapTime + 0.032);

    snapOsc.connect(snapGain);
    snapGain.connect(this.masterGain);
    snapOsc.start(snapTime);
    snapOsc.stop(snapTime + 0.035);
  }

  /**
   * Tactical Weapon Equip / Switch SFX (Keys 1 & 2).
   */
  playWeaponSwitch(toShotgun = false) {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const noiseBuffer = this._createNoiseBuffer(0.14);
    if (noiseBuffer) {
      const swoosh = this.ctx.createBufferSource();
      swoosh.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(toShotgun ? 480 : 650, t);
      filter.frequency.exponentialRampToValueAtTime(toShotgun ? 1150 : 1550, t + 0.11);
      filter.Q.setValueAtTime(1.8, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      swoosh.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      swoosh.start(t);
      swoosh.stop(t + 0.13);
    }

    // Subtle mechanical steel settle click
    const clinkTime = t + 0.055;
    const clinkOsc = this.ctx.createOscillator();
    const clinkGain = this.ctx.createGain();
    clinkOsc.type = 'triangle';
    clinkOsc.frequency.setValueAtTime(toShotgun ? 920 : 1380, clinkTime);
    clinkOsc.frequency.exponentialRampToValueAtTime(toShotgun ? 310 : 520, clinkTime + 0.035);

    clinkGain.gain.setValueAtTime(0.001, t);
    clinkGain.gain.setValueAtTime(0.24, clinkTime);
    clinkGain.gain.exponentialRampToValueAtTime(0.001, clinkTime + 0.040);

    clinkOsc.connect(clinkGain);
    clinkGain.connect(this.masterGain);
    clinkOsc.start(clinkTime);
    clinkOsc.stop(clinkTime + 0.045);
  }
}
