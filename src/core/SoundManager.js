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
}
