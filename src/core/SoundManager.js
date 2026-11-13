// Procedural Web Audio API sound synthesizer + preloaded WAV/MP3 sample engine

const ZOMBIE_VOCAL_FILES = {
  attack: ['./sounds/zombie_sounds/zombie_attack_11_dry.wav', './sounds/zombie_sounds/zombie_attack_16_dry.wav'],
  chase:  ['./sounds/zombie_sounds/zombie_chase_01_dry.wav',  './sounds/zombie_sounds/zombie_chase_11_dry.wav'],
  dead:   ['./sounds/zombie_sounds/zombie_dead_05_dry.wav',   './sounds/zombie_sounds/zombie_dead_23_dry.wav'],
  hurt:   ['./sounds/zombie_sounds/zombie_hurt_04_dry.wav',   './sounds/zombie_sounds/zombie_hurt_20_dry.wav'],
  idle:   ['./sounds/zombie_sounds/zombie_idle_10_dry.wav',   './sounds/zombie_sounds/zombie_idle_23_dry.wav'],
  walk:   ['./sounds/zombie_sounds/zombie_walk_08_dry.wav',   './sounds/zombie_sounds/zombie_walk_26_dry.wav'],
};

const ZOMBIE_VOCAL_PRIORITY = {
  dead: 5,
  hurt: 4,
  attack: 3,
  chase: 2,
  idle: 1,
  walk: 1,
};

const ZOMBIE_VOCAL_GAIN = {
  dead: 0.96,
  hurt: 0.90,
  attack: 0.94,
  chase: 0.90,
  idle: 0.56,
  walk: 0.60,
};

const FEMALE_BASE_PITCH = 1.55;
const FEMALE_CHEST_CUT_HZ = 420;
const FEMALE_FORMANT_BOOST_DB = 10.0;

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

    this.audioBuffers = new Map();
    this.zombieBuffers = {
      attack: [],
      chase: [],
      dead: [],
      hurt: [],
      idle: [],
      walk: [],
    };
    this._zombieVocalChannels = new Set();
    this._zombieAmbienceInput = null;

    this._noiseBufferCache = new Map();
    this._fractureBufferCache = new Map();
    this._fractureVariantIdx = 0;
    this.activeActionSources = new Set();
    this.isSampleReloadActive = false;
    this.lastDryFireTime = 0;
    this.isPreloading = true;
    this._buildingExplosion = null;

    this._initAudio();
    this._initMenuMusic();
  }

  setPreloading(loading) {
    this.isPreloading = !!loading;
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
    if (this.isPreloading) return Promise.reject(new Error('Preloading active'));
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
    if (this.isPreloading) return;
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
        p.catch(() => { });
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

  /**
   * Tactical H&K MP5 Submachine Gun Gunshot (Slot 4 - Full Auto 9mm).
   * Fast, snappy 9mm burst, routed cleanly to 9mm sound buffers with procedural fallback.
   */
  playMP5Gunshot() {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();

    if (this.audioBuffers.has('9mm_fire')) {
      const playbackRate = 1.05 + (Math.random() - 0.5) * 0.08;
      this._playSoundBuffer('9mm_fire', { volume: 0.90, playbackRate });
      return;
    }

    this.play9mmGunshot();
  }

  /**
   * Preload and decode authentic weapon audio samples (9mm, .50 AE, 12-gauge).
   * Supports progress reporting and returns a Promise that resolves when all are decoded.
   */
  async preloadAllAudio(onProgress) {
    if (!this.ctx) return;
    const soundFiles = {
      '9mm_fire': './sounds/9mm_fire.mp3',
      '9mm_reload': './sounds/9mm_reload.mp3',
      '9mm_dryfire': './sounds/9mm_dryfire.mp3',
      'desert_eagle_fire': './sounds/desert_eagle_fire.mp3',
      'remington_870_fire': './sounds/remington_870_fire.mp3',
      'remington_870_pump': './sounds/remington_870_pump.mp3',
      'building_explosions': './sounds/building_explosions.mp3',
    };

    const entries = Object.entries(soundFiles);
    const zombieTasks = [];
    for (const [cat, urls] of Object.entries(ZOMBIE_VOCAL_FILES)) {
      this.zombieBuffers[cat] = new Array(urls.length).fill(null);
      urls.forEach((url, idx) => {
        zombieTasks.push({ cat, idx, url });
      });
    }

    let completed = 0;
    const total = entries.length + zombieTasks.length;

    const loadWeaponAudio = entries.map(async ([key, url]) => {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const arrayBuffer = await resp.arrayBuffer();
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          // Automatically detect & trim leading MP3 encoder/pre-attack silence on immediate weapon sounds
          // so gunshots fire at 0.0ms on click and never lag behind impact effects!
          if (key === '9mm_fire' || key === 'desert_eagle_fire' || key === 'remington_870_fire' || key === '9mm_dryfire') {
            const ch0 = audioBuffer.getChannelData(0);
            const threshold = 0.022;
            let firstSample = 0;
            const maxScan = Math.min(ch0.length, Math.floor(audioBuffer.sampleRate * 0.25));
            for (let i = 0; i < maxScan; i++) {
              if (Math.abs(ch0[i]) >= threshold) {
                firstSample = Math.max(0, i - 16);
                break;
              }
            }
            audioBuffer._attackOffset = firstSample / audioBuffer.sampleRate;
          } else {
            audioBuffer._attackOffset = 0;
          }
          this.audioBuffers.set(key, audioBuffer);
        }
      } catch (err) {
        console.warn(`[SoundManager] Could not load sample ${url}, using procedural synth fallback:`, err);
      }
      completed++;
      if (onProgress) onProgress(completed / total, key);
    });

    const loadZombieAudio = zombieTasks.map(async ({ cat, idx, url }) => {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const arrayBuffer = await resp.arrayBuffer();
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
          this.zombieBuffers[cat][idx] = audioBuffer;
        }
      } catch (err) {
        console.warn(`[SoundManager] Could not load zombie vocal ${url}:`, err);
      }
      completed++;
      if (onProgress) onProgress(completed / total, `zombie_${cat}_${idx}`);
    });

    await Promise.all([...loadWeaponAudio, ...loadZombieAudio]);
    for (const cat of Object.keys(this.zombieBuffers)) {
      this.zombieBuffers[cat] = this.zombieBuffers[cat].filter(Boolean);
    }

    // Pre-warm procedural noise and brittle-fracture buffers at startup so zero AudioBuffer
    // allocations or CPU synthesis loops ever run on the main thread when shooting!
    this._createNoiseBuffer(0.014);
    this._createNoiseBuffer(0.016);
    this._createNoiseBuffer(0.025);
    this._createNoiseBuffer(0.25);
    this._createFractureBurstBuffer(0.12, 34, 18.0);
    this._createFractureBurstBuffer(0.065, 16, 26.0);
    this._createFractureBurstBuffer(0.095, 28, 22.0);
  }

  async _preloadAudioBuffers() {
    return this.preloadAllAudio();
  }

  /**
   * Helper to play an AudioBuffer with pitch randomization and gain staging.
   * If isAction = true, tracked so it can be interrupted/cancelled on weapon switch.
   */
  _playSoundBuffer(bufferKey, options = {}) {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return null;
    this.resume();

    const buffer = this.audioBuffers.get(bufferKey);
    if (!buffer) return null;

    const {
      volume = 1.0,
      playbackRate = 1.0,
      isAction = false,
    } = options;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, this.ctx.currentTime);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(this.masterGain);

    if (isAction) {
      this.activeActionSources.add(source);
      source.onended = () => {
        this.activeActionSources.delete(source);
      };
    }

    const startOffset = !isAction && buffer._attackOffset ? buffer._attackOffset : 0;
    source.start(0, startOffset);
    return source;
  }

  /**
   * Cancel and immediately stop any active reload or pump action sounds.
   * Called on weapon switch or viewmodel reset to avoid audio ghosting.
   */
  stopActionSounds() {
    this.isSampleReloadActive = false;
    for (const source of this.activeActionSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) { }
    }
    this.activeActionSources.clear();
  }

  /**
   * Authentic Reload Audio Sequence (9mm_reload.mp3).
   * Synchronized for H&K USP (~0.75s cycle at 2.13x) or Desert Eagle (.50 AE at 0.90x).
   */
  playReloadSound(weaponType = 'hk_usp') {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return false;
    this.resume();

    if (this.audioBuffers.has('9mm_reload')) {
      const isPistol = weaponType === 'pistol';
      const isMP5 = weaponType === 'hk_mp5';
      const playbackRate = isPistol ? 0.90 : (isMP5 ? 1.65 : 2.13);
      const volume = isPistol ? 1.05 : 0.95;

      this.stopActionSounds();
      this.isSampleReloadActive = true;
      const src = this._playSoundBuffer('9mm_reload', { volume, playbackRate, isAction: true });
      if (src) {
        src.onended = () => {
          this.activeActionSources.delete(src);
          this.isSampleReloadActive = false;
        };
        return true;
      }
    }
    this.isSampleReloadActive = false;
    return false;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Generates or returns a cached tiny buffer of white noise (zero runtime allocation).
   */
  _createNoiseBuffer(duration = 0.25) {
    if (!this.ctx) return null;
    const key = Math.round(duration * 1000);
    let buffer = this._noiseBufferCache.get(key);
    if (buffer) return buffer;

    const sampleRate = this.ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this._noiseBufferCache.set(key, buffer);
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

    // Authentic sample playback (.50 AE Desert Eagle)
    if (this.audioBuffers.has('desert_eagle_fire')) {
      const playbackRate = 0.95 + Math.random() * 0.08; // 0.95 to 1.03
      this._playSoundBuffer('desert_eagle_fire', { volume: 1.18, playbackRate });
      return;
    }

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
   * Tactical 9mm Pistol Gunshot (H&K USP - Slot 1).
   * Snappy supersonic crack, lighter transient sub-thump, and crisp slide cycle.
   */
  play9mmGunshot() {
    if (!this.ctx || this.isMuted) return;
    this.resume();

    // Authentic sample playback (9mm H&K USP)
    if (this.audioBuffers.has('9mm_fire')) {
      const playbackRate = 0.96 + Math.random() * 0.08; // 0.96 to 1.04
      this._playSoundBuffer('9mm_fire', { volume: 0.95, playbackRate });
      return;
    }

    const t = this.ctx.currentTime;

    // 1. LAYER 1: Punchy Sub Thump (220Hz -> 45Hz over 0.08s)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(220, t);
    subOsc.frequency.exponentialRampToValueAtTime(45, t + 0.08);

    subGain.gain.setValueAtTime(0.85, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);

    subOsc.start(t);
    subOsc.stop(t + 0.095);

    // 2. LAYER 2: Crisp 9mm Supersonic Crack & Muzzle Bark (4800Hz -> 850Hz over 0.24s)
    const noiseBuffer = this._createNoiseBuffer(0.26);
    if (noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4800, t);
      filter.frequency.exponentialRampToValueAtTime(850, t + 0.22);
      filter.Q.setValueAtTime(2.8, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.80, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + 0.25);
    }

    // 3. LAYER 3: Snappy Mechanical Slide Reciprocation (2400Hz bandpass burst at 55ms)
    const clackDelay = 0.055;
    const clackTime = t + clackDelay;
    const clackBuffer = this._createNoiseBuffer(0.04);
    if (clackBuffer) {
      const clack = this.ctx.createBufferSource();
      clack.buffer = clackBuffer;

      const clackFilter = this.ctx.createBiquadFilter();
      clackFilter.type = 'bandpass';
      clackFilter.frequency.setValueAtTime(2400, clackTime);
      clackFilter.Q.setValueAtTime(5.0, clackTime);

      const clackGain = this.ctx.createGain();
      clackGain.gain.setValueAtTime(0.0, t);
      clackGain.gain.setValueAtTime(0.48, clackTime);
      clackGain.gain.exponentialRampToValueAtTime(0.001, clackTime + 0.038);

      clack.connect(clackFilter);
      clackFilter.connect(clackGain);
      clackGain.connect(this.masterGain);

      clack.start(clackTime);
      clack.stop(clackTime + 0.04);
    }
  }

  /**
   * Crisp 9mm Slide Rack / Battery Lock sound
   */
  play9mmSlideRack() {
    if (this.isSampleReloadActive) return;
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const t = this.ctx.currentTime;

    const noiseBuffer = this._createNoiseBuffer(0.08);
    if (noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2200, t);
      filter.Q.setValueAtTime(4.0, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.42, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      src.start(t);
      src.stop(t + 0.075);
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
   * 1. Authentic or Procedural Dry-Fire Empty Chamber Click.
   * Cooldown (~150ms) prevents distorted phasing on rapid spam.
   * Distinct pitch for 9mm (1.0), .50 AE (0.90), and 12-gauge (0.85).
   */
  playDryFireClick(weaponType = 'hk_usp') {
    if (!this.ctx || this.isMuted) return;
    this.resume();

    const now = performance.now();
    if (now - this.lastDryFireTime < 150) return;
    this.lastDryFireTime = now;

    // Authentic sample playback (9mm_dryfire.mp3)
    if (this.audioBuffers.has('9mm_dryfire')) {
      let playbackRate = 1.0;
      if (weaponType === 'shotgun') {
        playbackRate = 0.85;
      } else if (weaponType === 'pistol') {
        playbackRate = 0.90;
      } else if (weaponType === 'hk_mp5') {
        playbackRate = 1.05;
      }
      this._playSoundBuffer('9mm_dryfire', { volume: 0.85, playbackRate });
      return;
    }

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
    if (this.isSampleReloadActive) return;
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
    if (this.isSampleReloadActive) return;
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
    if (this.isSampleReloadActive) return;
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
   * Generates or returns a pre-cached realistic granular brittle-fracture AudioBuffer
   * (aperiodic crackle impulses + decaying pulverized grit + trailing micro-shard ticks,
   * zero main-thread synthesis during gameplay).
   */
  _createFractureBurstBuffer(duration = 0.14, impulseCount = 28, gritDecay = 22.0) {
    if (!this.ctx) return null;
    const key = `${Math.round(duration * 1000)}_${impulseCount}`;
    let variants = this._fractureBufferCache.get(key);
    if (!variants) {
      variants = [];
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * duration);

      for (let v = 0; v < 4; v++) {
        const buffer = this.ctx.createBuffer(1, len, sr);
        const data = buffer.getChannelData(0);

        // 1. Base pulverized crystalline grit bed with fast exponential decay
        for (let i = 0; i < len; i++) {
          const tNorm = i / len;
          const env = Math.exp(-tNorm * gritDecay);
          data[i] = (Math.random() * 2 - 1) * 0.32 * env;
        }

        // 2. Stochastic micro-fracture stress-release spikes (short damped bipolar crackles)
        for (let k = 0; k < impulseCount; k++) {
          const progress = Math.pow(Math.random(), 1.65);
          const startIdx = Math.floor(progress * (len - 64));
          const spikeLen = 14 + Math.floor(Math.random() * 38);
          const amp = (0.45 + Math.random() * 0.55) * (1.0 - progress * 0.55);
          const sign = Math.random() < 0.5 ? 1 : -1;
          const freqRad = 0.35 + Math.random() * 0.65;

          for (let j = 0; j < spikeLen && startIdx + j < len; j++) {
            const wEnv = Math.exp(-j / (spikeLen * 0.32));
            const jitter = (Math.random() * 2 - 1) * 0.45;
            const val = sign * amp * wEnv * (Math.cos(j * freqRad) * 0.65 + jitter);
            data[startIdx + j] = Math.max(-1.0, Math.min(1.0, data[startIdx + j] + val));
          }
        }

        variants.push(buffer);
      }
      this._fractureBufferCache.set(key, variants);
    }

    const idx = (this._fractureVariantIdx++) % variants.length;
    return variants[idx];
  }

  /**
   * Computes realistic ballistic travel + acoustic propagation delay and distance attenuation
   * so monitor/glass impacts ALWAYS occur AFTER the weapon gunshot transient and scale with distance.
   */
  _getImpactAcoustics(distance = 3.0) {
    const d = Number.isFinite(distance) ? Math.max(0.5, distance) : 3.0;
    // 55ms psychoacoustic lead so the gunshot muzzle blast always hits the ear first,
    // plus physical projectile flight + speed-of-sound return time (~7.5ms per meter)
    const delaySec = Math.min(0.24, 0.055 + d * 0.0075);
    const distAtten = 1.0 / (1.0 + Math.max(0, d - 1.4) * 0.15);
    const airLpFreq = Math.max(2600, 9800 - d * 310);
    return { delaySec, distAtten, airLpFreq };
  }

  /**
   * Destructible LCD Monitor Screen Shatter SFX (First Hit on Intact Screen).
   * - Scheduled AFTER the gunshot transient + ballistic travel time (never before the gun!).
   * - Zero cartoon sine/sawtooth laser sweeps: uses physical ABS plastic casing punch,
   *   stochastic LCD glass/polarizer fracture crackle, and staggered debris scatter.
   */
  playMonitorShatter(distance = 3.0) {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();

    const { delaySec, distAtten, airLpFreq } = this._getImpactAcoustics(distance);
    const t = this.ctx.currentTime + delaySec;

    // Distance air-absorption filter feeding masterGain
    const distFilter = this.ctx.createBiquadFilter();
    distFilter.type = 'lowpass';
    distFilter.frequency.setValueAtTime(airLpFreq, t);
    distFilter.connect(this.masterGain);

    // 1. ABS Plastic Bezel & Steel Backplate Ballistic Punch (Hollow casing thwack)
    const punchOsc = this.ctx.createOscillator();
    const punchGain = this.ctx.createGain();
    punchOsc.type = 'triangle';
    punchOsc.frequency.setValueAtTime(118, t);
    punchOsc.frequency.exponentialRampToValueAtTime(36, t + 0.032);

    punchGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    punchGain.gain.setValueAtTime(0.52 * distAtten, t);
    punchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.036);

    punchOsc.connect(punchGain);
    punchGain.connect(distFilter);
    punchOsc.start(t);
    punchOsc.stop(t + 0.038);

    // 2. Granular LCD Substrate Shatter & Polarizer Film Tear (0ms..115ms after impact)
    const fracBuf = this._createFractureBurstBuffer(0.12, 34, 18.0);
    if (fracBuf) {
      // Mid-band plastic/housing crack body (950 Hz bandpass)
      const bodySrc = this.ctx.createBufferSource();
      bodySrc.buffer = fracBuf;
      const bodyBp = this.ctx.createBiquadFilter();
      bodyBp.type = 'bandpass';
      bodyBp.frequency.setValueAtTime(920 + (Math.random() - 0.5) * 140, t);
      bodyBp.Q.setValueAtTime(1.35, t);

      const bodyGain = this.ctx.createGain();
      bodyGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      bodyGain.gain.setValueAtTime(0.62 * distAtten, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.068);

      bodySrc.connect(bodyBp);
      bodyBp.connect(bodyGain);
      bodyGain.connect(distFilter);
      bodySrc.start(t);
      bodySrc.stop(t + 0.072);

      // High-band thin LCD glass crunch & spiderweb snap (3400 Hz bandpass)
      const crunchSrc = this.ctx.createBufferSource();
      crunchSrc.buffer = fracBuf;
      const crunchBp = this.ctx.createBiquadFilter();
      crunchBp.type = 'bandpass';
      crunchBp.frequency.setValueAtTime(3400 + (Math.random() - 0.5) * 350, t);
      crunchBp.Q.setValueAtTime(1.15, t);

      const crunchGain = this.ctx.createGain();
      crunchGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      crunchGain.gain.setValueAtTime(0.58 * distAtten, t + 0.002);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.105);

      crunchSrc.connect(crunchBp);
      crunchBp.connect(crunchGain);
      crunchGain.connect(distFilter);
      crunchSrc.start(t + 0.002);
      crunchSrc.stop(t + 0.112);
    }
  }

  /**
   * Secondary Bullet Impact on an Already-Broken LCD Monitor Screen.
   * Dry punch into cracked plastic casing & crushed LCD glass (scheduled after gunshot + flight delay).
   */
  playMonitorHit(distance = 3.0) {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();

    const { delaySec, distAtten, airLpFreq } = this._getImpactAcoustics(distance);
    const t = this.ctx.currentTime + delaySec;

    const distFilter = this.ctx.createBiquadFilter();
    distFilter.type = 'lowpass';
    distFilter.frequency.setValueAtTime(airLpFreq, t);
    distFilter.connect(this.masterGain);

    const fracBuf = this._createFractureBurstBuffer(0.065, 16, 26.0);
    if (fracBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = fracBuf;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1650 + (Math.random() - 0.5) * 280, t);
      bp.Q.setValueAtTime(1.4, t);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.setValueAtTime(0.42 * distAtten, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.052);

      src.connect(bp);
      bp.connect(g);
      g.connect(distFilter);
      src.start(t);
      src.stop(t + 0.056);
    }
  }

  /**
   * Ballistic Impact on Thick Tempered / Laminated Architectural Glass
   * (Glass Partition Wall, Vestibule Door, and Server Containment Pod).
   * - Scheduled AFTER the gunshot transient + ballistic travel time.
   * - Synthesizes a heavy laminated glass thwack, dry crystalline spiderweb crunch,
   *   and fine falling glass grit — zero cartoon sine sweeps!
   */
  playGlassImpact(distance = 3.0) {
    if (!this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();

    const { delaySec, distAtten, airLpFreq } = this._getImpactAcoustics(distance);
    const t = this.ctx.currentTime + delaySec;

    const distFilter = this.ctx.createBiquadFilter();
    distFilter.type = 'lowpass';
    distFilter.frequency.setValueAtTime(airLpFreq, t);
    distFilter.connect(this.masterGain);

    // 1. Heavy Tempered Pane Kinetic Thwack (damped low-mid plate thump)
    const thumpOsc = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thumpOsc.type = 'triangle';
    thumpOsc.frequency.setValueAtTime(96, t);
    thumpOsc.frequency.exponentialRampToValueAtTime(40, t + 0.022);

    thumpGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    thumpGain.gain.setValueAtTime(0.44 * distAtten, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(distFilter);
    thumpOsc.start(t);
    thumpOsc.stop(t + 0.027);

    // 2. Pulverized Tempered Glass Fracture Crunch (Granular crackle burst)
    const fracBuf = this._createFractureBurstBuffer(0.095, 28, 22.0);
    if (fracBuf) {
      // Mid-high crystalline fracture crunch (2300 Hz)
      const crunchSrc = this.ctx.createBufferSource();
      crunchSrc.buffer = fracBuf;

      const crunchBp = this.ctx.createBiquadFilter();
      crunchBp.type = 'bandpass';
      crunchBp.frequency.setValueAtTime(2350 + (Math.random() - 0.5) * 320, t);
      crunchBp.Q.setValueAtTime(1.3, t);

      const crunchGain = this.ctx.createGain();
      crunchGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      crunchGain.gain.setValueAtTime(0.56 * distAtten, t);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

      crunchSrc.connect(crunchBp);
      crunchBp.connect(crunchGain);
      crunchGain.connect(distFilter);
      crunchSrc.start(t);
      crunchSrc.stop(t + 0.080);

      // High-frequency pulverized glass grit snap (5200 Hz highpass)
      const gritSrc = this.ctx.createBufferSource();
      gritSrc.buffer = fracBuf;

      const gritHp = this.ctx.createBiquadFilter();
      gritHp.type = 'highpass';
      gritHp.frequency.setValueAtTime(4800, t);

      const gritGain = this.ctx.createGain();
      gritGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gritGain.gain.setValueAtTime(0.38 * distAtten, t + 0.001);
      gritGain.gain.exponentialRampToValueAtTime(0.001, t + 0.062);

      gritSrc.connect(gritHp);
      gritHp.connect(gritGain);
      gritGain.connect(distFilter);
      gritSrc.start(t + 0.001);
      gritSrc.stop(t + 0.066);
    }
  }

  /**
   * Backwards-compatible alias for glass impact sound.
   */
  playGlassTick(distance = 3.0) {
    this.playGlassImpact(distance);
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

    // Authentic sample playback (Remington 870 12-gauge blast)
    if (this.audioBuffers.has('remington_870_fire')) {
      const playbackRate = 0.96 + Math.random() * 0.08; // 0.96 to 1.04
      this._playSoundBuffer('remington_870_fire', { volume: 1.10, playbackRate });
      return;
    }

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

    // Authentic sample playback (Remington 870 mechanical pump-action cycle)
    if (this.audioBuffers.has('remington_870_pump')) {
      this._playSoundBuffer('remington_870_pump', { volume: 1.05, playbackRate: 1.0, isAction: true });
      return;
    }

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
   * Tactical Weapon Equip / Switch SFX (Keys 1, 2, & 3).
   */
  playWeaponSwitch(weaponType = 'hk_usp') {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const isShotgun = weaponType === 'shotgun' || weaponType === true || weaponType === 3 || weaponType === '3';
    const isMP5 = weaponType === 'hk_mp5' || weaponType === 4 || weaponType === '4';
    const is9mm = weaponType === 'hk_usp' || weaponType === 1 || weaponType === '1' || isMP5;

    const noiseBuffer = this._createNoiseBuffer(0.14);
    if (noiseBuffer) {
      const swoosh = this.ctx.createBufferSource();
      swoosh.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      const startFreq = isShotgun ? 480 : (is9mm ? 820 : 650);
      const endFreq = isShotgun ? 1150 : (is9mm ? 1850 : 1550);
      filter.frequency.setValueAtTime(startFreq, t);
      filter.frequency.exponentialRampToValueAtTime(endFreq, t + 0.11);
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
    const clickStart = isShotgun ? 920 : (is9mm ? 1650 : 1380);
    const clickEnd = isShotgun ? 310 : (is9mm ? 650 : 520);
    clinkOsc.frequency.setValueAtTime(clickStart, clinkTime);
    clinkOsc.frequency.exponentialRampToValueAtTime(clickEnd, clinkTime + 0.035);

    clinkGain.gain.setValueAtTime(0.001, t);
    clinkGain.gain.setValueAtTime(0.24, clinkTime);
    clinkGain.gain.exponentialRampToValueAtTime(0.001, clinkTime + 0.040);

    clinkOsc.connect(clinkGain);
    clinkGain.connect(this.masterGain);
    clinkOsc.start(clinkTime);
    clinkOsc.stop(clinkTime + 0.045);
  }

  /**
   * Starts a looping executive IP-phone dual-tone warble ringtone
   * ("brrring-brrring ... 1.8s pause") with persistent lowpass & stereo pan nodes.
   */
  startPhoneRingtone() {
    if (!this.ctx) {
      this._initAudio();
    }
    if (!this.ctx || !this.masterGain) return;
    if (!this.isMuted && this.isSfxEnabled) {
      this.resume();
    }
    if (this._phoneRing && this._phoneRing.active) return;

    const now = this.ctx.currentTime;
    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    const oscHarm = this.ctx.createOscillator();
    const warbleLfo = this.ctx.createOscillator();

    oscA.type = 'sine';
    oscA.frequency.setValueAtTime(523.25, now); // C5 executive ring carrier
    oscB.type = 'triangle';
    oscB.frequency.setValueAtTime(659.25, now); // E5 executive ring carrier
    oscHarm.type = 'sine';
    oscHarm.frequency.setValueAtTime(1046.5, now); // Subtle upper harmonic

    warbleLfo.type = 'sine';
    warbleLfo.frequency.setValueAtTime(22.0, now); // 22Hz classic telephone ring trill

    const lfoFreqGainA = this.ctx.createGain();
    lfoFreqGainA.gain.setValueAtTime(32.0, now);
    const lfoFreqGainB = this.ctx.createGain();
    lfoFreqGainB.gain.setValueAtTime(38.0, now);
    const lfoFreqGainH = this.ctx.createGain();
    lfoFreqGainH.gain.setValueAtTime(64.0, now);

    warbleLfo.connect(lfoFreqGainA);
    warbleLfo.connect(lfoFreqGainB);
    warbleLfo.connect(lfoFreqGainH);
    lfoFreqGainA.connect(oscA.frequency);
    lfoFreqGainB.connect(oscB.frequency);
    lfoFreqGainH.connect(oscHarm.frequency);

    const mixGainA = this.ctx.createGain();
    mixGainA.gain.setValueAtTime(0.58, now);
    const mixGainB = this.ctx.createGain();
    mixGainB.gain.setValueAtTime(0.42, now);
    const mixGainH = this.ctx.createGain();
    mixGainH.gain.setValueAtTime(0.18, now);

    const cadenceGain = this.ctx.createGain();
    cadenceGain.gain.setValueAtTime(0.0, now);

    const lowpassFilter = this.ctx.createBiquadFilter();
    lowpassFilter.type = 'lowpass';
    lowpassFilter.frequency.setValueAtTime(1550, now);
    lowpassFilter.Q.setValueAtTime(0.9, now);

    const stereoPanner = typeof this.ctx.createStereoPanner === 'function'
      ? this.ctx.createStereoPanner()
      : null;

    const spatialGain = this.ctx.createGain();
    spatialGain.gain.setValueAtTime(0.36, now);

    oscA.connect(mixGainA);
    oscB.connect(mixGainB);
    oscHarm.connect(mixGainH);
    mixGainA.connect(cadenceGain);
    mixGainB.connect(cadenceGain);
    mixGainH.connect(cadenceGain);

    cadenceGain.connect(lowpassFilter);
    if (stereoPanner) {
      lowpassFilter.connect(stereoPanner);
      stereoPanner.connect(spatialGain);
    } else {
      lowpassFilter.connect(spatialGain);
    }
    spatialGain.connect(this.masterGain);

    oscA.start(now);
    oscB.start(now);
    oscHarm.start(now);
    warbleLfo.start(now);

    const ringState = {
      active: true,
      paused: false,
      startTime: now,
      cycleDuration: 2.84, // 0.42s ring + 0.20s gap + 0.42s ring + 1.80s pause
      oscA,
      oscB,
      oscHarm,
      warbleLfo,
      lfoFreqGainA,
      lfoFreqGainB,
      lfoFreqGainH,
      mixGainA,
      mixGainB,
      mixGainH,
      cadenceGain,
      lowpassFilter,
      stereoPanner,
      spatialGain,
      targetSpatialGain: 0.36,
      schedulerId: null,
    };
    this._phoneRing = ringState;

    const scheduleBurstCycle = (cycleStart) => {
      if (!ringState.active || !this.ctx) return;
      const g = ringState.cadenceGain.gain;

      // Double ring burst: [0..0.42s] ON, [0.42..0.62s] OFF, [0.62..1.04s] ON, [1.04..2.84s] PAUSE
      g.setValueAtTime(0.0, cycleStart);
      g.linearRampToValueAtTime(1.0, cycleStart + 0.015);
      g.setValueAtTime(1.0, cycleStart + 0.39);
      g.linearRampToValueAtTime(0.0, cycleStart + 0.42);

      g.setValueAtTime(0.0, cycleStart + 0.62);
      g.linearRampToValueAtTime(1.0, cycleStart + 0.635);
      g.setValueAtTime(1.0, cycleStart + 1.01);
      g.linearRampToValueAtTime(0.0, cycleStart + 1.04);

      const nextCycleStart = cycleStart + ringState.cycleDuration;
      const waitMs = Math.max(200, (nextCycleStart - this.ctx.currentTime - 0.15) * 1000);
      ringState.schedulerId = setTimeout(() => {
        if (ringState.active) {
          scheduleBurstCycle(nextCycleStart);
        }
      }, waitMs);
    };

    scheduleBurstCycle(now + 0.04);
  }

  /**
   * Returns current ring cadence active status (true during "brrring" bursts, false during gaps/pause)
   * so visual MWI LED & screen indicators pulse in exact lockstep with audio.
   */
  isPhoneRingBurstActive() {
    if (!this._phoneRing || !this._phoneRing.active || !this.ctx || this._phoneRing.paused) {
      return false;
    }
    const elapsed = Math.max(0, this.ctx.currentTime - (this._phoneRing.startTime + 0.04));
    const phase = elapsed % this._phoneRing.cycleDuration;
    return phase < 0.42 || (phase >= 0.62 && phase < 1.04);
  }

  /**
   * Pauses/mutes active phone ringtone output while in pause menu without tearing down state.
   */
  setPhoneRingtonePaused(paused) {
    if (!this._phoneRing || !this._phoneRing.active || !this.ctx) return;
    this._phoneRing.paused = !!paused;
    const now = this.ctx.currentTime;
    const target = this._phoneRing.paused ? 0.0 : this._phoneRing.targetSpatialGain;
    this._phoneRing.spatialGain.gain.setTargetAtTime(target, now, 0.03);
  }

  /**
   * Updates distance attenuation, lowpass air absorption (~1100Hz far -> ~6500Hz close),
   * and stereo pan of the active phone ringtone with zero per-frame allocations.
   */
  updatePhoneRingtoneSpatial(distance, pan = 0) {
    if (!this._phoneRing || !this._phoneRing.active || !this.ctx) return;
    const now = this.ctx.currentTime;
    const clampedDist = Math.max(0.4, distance);

    // Distance attenuation: strong & clear nearby (<2.5m), clearly audible across room (~12-18m)
    const gainVal = Math.min(0.92, Math.max(0.28, 0.90 / (1.0 + Math.max(0, clampedDist - 1.5) * 0.11)));
    this._phoneRing.targetSpatialGain = gainVal;
    const finalGain = this._phoneRing.paused ? 0.0 : gainVal;
    this._phoneRing.spatialGain.gain.setTargetAtTime(finalGain, now, 0.045);

    // Low-pass filter: ~6500 Hz within 2.5m -> ~1450 Hz around 12m (down toward 1250 Hz beyond)
    const tDist = Math.min(1.0, Math.max(0.0, (clampedDist - 2.5) / 9.5));
    let cutoff = 6500.0 * Math.pow(1450.0 / 6500.0, tDist);
    if (clampedDist > 12.0) {
      cutoff = Math.max(1250.0, 1450.0 - (clampedDist - 12.0) * 35.0);
    }
    this._phoneRing.lowpassFilter.frequency.setTargetAtTime(cutoff, now, 0.05);

    if (this._phoneRing.stereoPanner) {
      const clampedPan = Math.min(0.92, Math.max(-0.92, pan));
      this._phoneRing.stereoPanner.pan.setTargetAtTime(clampedPan, now, 0.04);
    }
  }

  /**
   * Immediately stops and cleans up the phone ringtone oscillators & scheduler.
   */
  stopPhoneRingtone() {
    const r = this._phoneRing;
    if (!r) return;
    r.active = false;
    if (r.schedulerId !== null) {
      clearTimeout(r.schedulerId);
      r.schedulerId = null;
    }

    if (this.ctx) {
      const now = this.ctx.currentTime;
      try {
        r.spatialGain.gain.cancelScheduledValues(now);
        r.spatialGain.gain.setTargetAtTime(0.0, now, 0.015);
      } catch (e) { }

      const cleanupNodes = () => {
        const nodes = [
          r.oscA, r.oscB, r.oscHarm, r.warbleLfo,
          r.lfoFreqGainA, r.lfoFreqGainB, r.lfoFreqGainH,
          r.mixGainA, r.mixGainB, r.mixGainH,
          r.cadenceGain, r.lowpassFilter, r.stereoPanner, r.spatialGain,
        ];
        for (const osc of [r.oscA, r.oscB, r.oscHarm, r.warbleLfo]) {
          try { osc.stop(); } catch (e) { }
        }
        for (const node of nodes) {
          if (node) {
            try { node.disconnect(); } catch (e) { }
          }
        }
      };
      setTimeout(cleanupNodes, 65);
    }

    this._phoneRing = null;
  }

  /**
   * Procedural physical handset lift & hookswitch click/clack SFX when answering phone.
   */
  playPhonePickupClick() {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // 1. ABS handset lift body thud
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(240, t);
    bodyOsc.frequency.exponentialRampToValueAtTime(72, t + 0.042);

    bodyGain.gain.setValueAtTime(0.42, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.048);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.masterGain);
    bodyOsc.start(t);
    bodyOsc.stop(t + 0.055);

    // 2. Crisp plastic cradle unseat scrape
    const noiseBuffer = this._createNoiseBuffer(0.08);
    if (noiseBuffer) {
      const brush = this.ctx.createBufferSource();
      brush.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1650, t);
      filter.frequency.exponentialRampToValueAtTime(2900, t + 0.035);
      filter.Q.setValueAtTime(2.6, t);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.32, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

      brush.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      brush.start(t);
      brush.stop(t + 0.06);
    }

    // 3. Spring-loaded plunger hookswitch snap (t + 26ms)
    const hookT = t + 0.026;
    const hookOsc = this.ctx.createOscillator();
    const hookGain = this.ctx.createGain();
    hookOsc.type = 'sine';
    hookOsc.frequency.setValueAtTime(2350, hookT);
    hookOsc.frequency.exponentialRampToValueAtTime(880, hookT + 0.024);

    hookGain.gain.setValueAtTime(0.001, t);
    hookGain.gain.setValueAtTime(0.36, hookT);
    hookGain.gain.exponentialRampToValueAtTime(0.001, hookT + 0.030);

    hookOsc.connect(hookGain);
    hookGain.connect(this.masterGain);
    hookOsc.start(hookT);
    hookOsc.stop(hookT + 0.035);
  }

  /**
   * Subtle non-fatiguing typewriter dialogue blip (telephone bandpass tone for Jório, deeper voice tone for Roc).
   */
  playDialogueBlip(speaker = 'jorio') {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const isJorio = speaker === 'jorio';

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    if (isJorio) {
      osc.type = 'triangle';
      const f = 520 + Math.random() * 80;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.92, t + 0.034);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(760, t);
      filter.Q.setValueAtTime(0.75, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.036);
    } else {
      osc.type = 'sine';
      const f = 160 + Math.random() * 28;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.90, t + 0.036);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, t);
      filter.Q.setValueAtTime(0.8, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.038);
    }

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.042);
  }

  /**
   * Telecom disconnect busy tone ("pi-pi-pi-pi": 4x 425Hz bandpass beeps 0.18s ON / 0.14s OFF)
   * followed immediately by mechanical handset hang-up cradle clack SFX.
   */
  playPhoneDisconnectTone() {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(425, t);

    const oscHarm = this.ctx.createOscillator();
    oscHarm.type = 'sine';
    oscHarm.frequency.setValueAtTime(850, t);

    const harmGain = this.ctx.createGain();
    harmGain.gain.setValueAtTime(0.08, t);

    // Telecom earpiece bandpass filter (~275-1670Hz band so 425Hz busy tone & harmonic pass cleanly)
    const bpFilter = this.ctx.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.setValueAtTime(680, t);
    bpFilter.Q.setValueAtTime(0.55, t);

    const gateGain = this.ctx.createGain();
    gateGain.gain.setValueAtTime(0.0, t);

    const beepOn = 0.18;
    const beepOff = 0.14;
    const step = beepOn + beepOff; // 0.32s per beep
    for (let i = 0; i < 4; i++) {
      const start = t + i * step;
      const end = start + beepOn;
      gateGain.gain.setValueAtTime(0.0, start);
      gateGain.gain.linearRampToValueAtTime(0.38, start + 0.008);
      gateGain.gain.setValueAtTime(0.38, end - 0.008);
      gateGain.gain.linearRampToValueAtTime(0.0, end);
    }

    const toneEnd = t + 4 * step - beepOff; // ~1.14s
    osc.connect(bpFilter);
    oscHarm.connect(harmGain);
    harmGain.connect(bpFilter);
    bpFilter.connect(gateGain);
    gateGain.connect(this.masterGain);

    osc.start(t);
    oscHarm.start(t);
    osc.stop(toneEnd + 0.04);
    oscHarm.stop(toneEnd + 0.04);

    // Mechanical handset hang-up cradle clack right after final beep (t + 1.18s)
    const clackT = toneEnd + 0.04;
    const clackOsc = this.ctx.createOscillator();
    const clackGain = this.ctx.createGain();
    clackOsc.type = 'triangle';
    clackOsc.frequency.setValueAtTime(210, clackT);
    clackOsc.frequency.exponentialRampToValueAtTime(58, clackT + 0.055);

    clackGain.gain.setValueAtTime(0.001, t);
    clackGain.gain.setValueAtTime(0.45, clackT);
    clackGain.gain.exponentialRampToValueAtTime(0.001, clackT + 0.062);

    clackOsc.connect(clackGain);
    clackGain.connect(this.masterGain);
    clackOsc.start(clackT);
    clackOsc.stop(clackT + 0.07);

    const noiseBuf = this._createNoiseBuffer(0.07);
    if (noiseBuf) {
      const nSrc = this.ctx.createBufferSource();
      nSrc.buffer = noiseBuf;
      const nFilter = this.ctx.createBiquadFilter();
      nFilter.type = 'bandpass';
      nFilter.frequency.setValueAtTime(1450, clackT);
      nFilter.Q.setValueAtTime(2.0, clackT);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.001, t);
      nGain.gain.setValueAtTime(0.34, clackT);
      nGain.gain.exponentialRampToValueAtTime(0.001, clackT + 0.048);
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(this.masterGain);
      nSrc.start(clackT);
      nSrc.stop(clackT + 0.055);
    }
  }

  /**
   * Procedural two-tone resonant elevator arrival chime ("pin-dun!").
   * G5 (~784 Hz, 0.5s decay) followed 0.38s later by D5 (~587 Hz, 0.85s decay).
   */
  playElevatorArrivalChime() {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const strikeNote = (startT, baseFreq, decaySec, peakGain) => {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4800, startT);
      lp.connect(this.masterGain);

      const partials = [
        { mult: 1.0, level: 1.0, dec: decaySec },
        { mult: 2.0, level: 0.32, dec: decaySec * 0.65 },
        { mult: 2.756, level: 0.14, dec: 0.095 },
      ];

      for (const p of partials) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * p.mult, startT);

        const targetGain = Math.max(0.002, peakGain * p.level);
        g.gain.setValueAtTime(0.0005, startT);
        g.gain.linearRampToValueAtTime(targetGain, startT + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0005, startT + p.dec);

        osc.connect(g);
        g.connect(lp);
        osc.start(startT);
        osc.stop(startT + p.dec + 0.02);
      }
    };

    strikeNote(t, 783.99, 0.50, 0.34);        // "Pin" (G5)
    strikeNote(t + 0.38, 587.33, 0.85, 0.36); // "Dun" (D5)
  }

  /**
   * Procedural electric elevator sliding-door motor glide, track roller hum & end latch (~1.5s).
   */
  playElevatorDoorSlide() {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const dur = 1.50;

    // 1. Subtle low-frequency electric door motor servo glide
    const motorOsc = this.ctx.createOscillator();
    const motorFilter = this.ctx.createBiquadFilter();
    const motorGain = this.ctx.createGain();
    motorOsc.type = 'triangle';
    motorOsc.frequency.setValueAtTime(68, t);
    motorOsc.frequency.linearRampToValueAtTime(94, t + 0.35);
    motorOsc.frequency.linearRampToValueAtTime(86, t + 1.15);
    motorOsc.frequency.linearRampToValueAtTime(52, t + dur);

    motorFilter.type = 'lowpass';
    motorFilter.frequency.setValueAtTime(220, t);

    motorGain.gain.setValueAtTime(0.001, t);
    motorGain.gain.linearRampToValueAtTime(0.20, t + 0.16);
    motorGain.gain.setValueAtTime(0.18, t + 1.22);
    motorGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    motorOsc.connect(motorFilter);
    motorFilter.connect(motorGain);
    motorGain.connect(this.masterGain);
    motorOsc.start(t);
    motorOsc.stop(t + dur + 0.03);

    // 2. Smooth steel-track ball-bearing roller hiss (the main sliding "vuuush")
    const noiseBuf = this._createNoiseBuffer(dur + 0.05);
    if (noiseBuf) {
      const nSrc = this.ctx.createBufferSource();
      nSrc.buffer = noiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(380, t);
      bp.frequency.linearRampToValueAtTime(640, t + 0.55);
      bp.frequency.linearRampToValueAtTime(320, t + dur);
      bp.Q.setValueAtTime(1.8, t);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.001, t);
      nGain.gain.linearRampToValueAtTime(0.25, t + 0.22);
      nGain.gain.setValueAtTime(0.21, t + 1.20);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      nSrc.connect(bp);
      bp.connect(nGain);
      nGain.connect(this.masterGain);
      nSrc.start(t);
      nSrc.stop(t + dur + 0.03);
    }

    // 3. Soft mechanical pocket-bumper / latch stop at ~1.44s
    const stopT = t + 1.44;
    const stopOsc = this.ctx.createOscillator();
    const stopGain = this.ctx.createGain();
    stopOsc.type = 'sine';
    stopOsc.frequency.setValueAtTime(115, stopT);
    stopOsc.frequency.exponentialRampToValueAtTime(44, stopT + 0.065);

    stopGain.gain.setValueAtTime(0.001, t);
    stopGain.gain.setValueAtTime(0.30, stopT);
    stopGain.gain.exponentialRampToValueAtTime(0.001, stopT + 0.075);

    stopOsc.connect(stopGain);
    stopGain.connect(this.masterGain);
    stopOsc.start(stopT);
    stopOsc.stop(stopT + 0.09);
  }

  /**
   * Plays /sounds/building_explosions.mp3 (18s) through a dual-path Web Audio graph:
   *  - Path A: Deep building-wide sub-bass structural rumble (lowpass 135Hz)
   *  - Path B: Wall-muffled -> crisp directional blast & debris anchored at the vestibule stairwell
   */
  playBuildingExplosion() {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    this.stopBuildingExplosion();

    const startFromBuffer = (buffer) => {
      if (!buffer || !this.ctx) return;
      const now = this.ctx.currentTime;

      const masterExpGain = this.ctx.createGain();
      masterExpGain.gain.setValueAtTime(1.85, now);

      // Soft headroom compressor lets us push heavy sub/mid punch loudly without harsh digital clipping
      const expLimiter = this.ctx.createDynamicsCompressor();
      expLimiter.threshold.setValueAtTime(-5.5, now);
      expLimiter.knee.setValueAtTime(10.0, now);
      expLimiter.ratio.setValueAtTime(4.5, now);
      expLimiter.attack.setValueAtTime(0.003, now);
      expLimiter.release.setValueAtTime(0.16, now);

      masterExpGain.connect(expLimiter);
      expLimiter.connect(this.masterGain);

      // Path A: Building-wide omnidirectional sub-bass floor rumble
      const subFilter = this.ctx.createBiquadFilter();
      subFilter.type = 'lowpass';
      subFilter.frequency.setValueAtTime(155, now);
      subFilter.Q.setValueAtTime(0.8, now);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(1.05, now);
      subFilter.connect(subGain);
      subGain.connect(masterExpGain);

      // Path B: Directional stairwell sound (wall-muffled in main office, loud & sharp in vestibule)
      const dirFilter = this.ctx.createBiquadFilter();
      dirFilter.type = 'lowpass';
      dirFilter.frequency.setValueAtTime(1450, now);
      dirFilter.Q.setValueAtTime(0.65, now);

      const stereoPanner = this.ctx.createStereoPanner
        ? this.ctx.createStereoPanner()
        : null;

      const dirGain = this.ctx.createGain();
      dirGain.gain.setValueAtTime(0.95, now);

      if (stereoPanner) {
        dirFilter.connect(stereoPanner);
        stereoPanner.connect(dirGain);
      } else {
        dirFilter.connect(dirGain);
      }
      dirGain.connect(masterExpGain);

      const state = {
        buffer,
        source: null,
        subFilter,
        subGain,
        dirFilter,
        stereoPanner,
        dirGain,
        masterExpGain,
        expLimiter,
        fadingOut: false,
        startTime: now,
        offset: 0,
        duration: buffer.duration || 18.0,
        paused: false,
        active: true,
      };
      this._buildingExplosion = state;
      this._startBuildingExplosionSource(state, 0);
    };

    const cached = this.audioBuffers.get('building_explosions');
    if (cached) {
      startFromBuffer(cached);
    } else {
      fetch('./sounds/building_explosions.mp3')
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => (ab && this.ctx ? this.ctx.decodeAudioData(ab) : null))
        .then((decoded) => {
          if (decoded) {
            decoded._attackOffset = 0;
            this.audioBuffers.set('building_explosions', decoded);
            if (!this._buildingExplosion) {
              startFromBuffer(decoded);
            }
          }
        })
        .catch(() => { });
    }
  }

  _startBuildingExplosionSource(state, offsetSec) {
    if (!state || !state.active || !this.ctx || offsetSec >= state.duration) return;
    if (state.source) {
      try {
        state.source.onended = null;
        state.source.stop();
        state.source.disconnect();
      } catch (e) { }
      state.source = null;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = state.buffer;
    src.connect(state.subFilter);
    src.connect(state.dirFilter);

    const now = this.ctx.currentTime;
    state.startTime = now;
    state.offset = offsetSec;
    src.onended = () => {
      if (state.source === src && !state.paused) {
        state.active = false;
      }
    };
    src.start(now, offsetSec);
    state.source = src;
  }

  /**
   * Updates directional pan, wall occlusion muffling, and distance attenuation for building_explosions.mp3.
   */
  updateBuildingExplosionSpatial(distance, pan = 0, inMainOffice = true) {
    const state = this._buildingExplosion;
    if (!state || !state.active || state.paused || !this.ctx) return;
    const now = this.ctx.currentTime;
    const d = Math.max(0.5, distance);

    // Sub-bass body hits hard across the floor, stronger inside vestibule
    const subLevel = inMainOffice
      ? Math.max(0.78, Math.min(1.18, 1.28 - d * 0.022))
      : Math.max(1.05, Math.min(1.38, 1.42 - d * 0.018));
    state.subGain.gain.setTargetAtTime(subLevel, now, 0.05);

    // Directional stairwell blast & debris attenuation
    const dirLevel = inMainOffice
      ? Math.max(0.68, Math.min(1.12, 1.32 / (1.0 + Math.max(0, d - 6.0) * 0.055)))
      : Math.max(1.10, Math.min(1.48, 1.50 / (1.0 + Math.max(0, d - 2.0) * 0.050)));
    state.dirGain.gain.setTargetAtTime(dirLevel, now, 0.05);

    // Partition walls muffle highs (~1100-2000Hz in main office vs ~4200-9800Hz near stairwell)
    const cutoff = inMainOffice
      ? Math.max(1100, Math.min(2050, 2300 - d * 55))
      : Math.max(4200, Math.min(9800, 9900 - d * 400));
    state.dirFilter.frequency.setTargetAtTime(cutoff, now, 0.05);

    if (state.stereoPanner) {
      const clampedPan = Math.max(-0.88, Math.min(0.88, pan));
      state.stereoPanner.pan.setTargetAtTime(clampedPan, now, 0.04);
    }
  }

  /**
   * Smoothly fades out the building explosion audio at the end of the compacted ~9s action beat.
   */
  fadeOutBuildingExplosion(fadeDurationSec = 1.1) {
    const state = this._buildingExplosion;
    if (!state || !state.active || state.fadingOut || !this.ctx) return;
    state.fadingOut = true;
    const now = this.ctx.currentTime;
    const dur = Math.max(0.15, fadeDurationSec);
    state.masterExpGain.gain.cancelScheduledValues(now);
    state.masterExpGain.gain.setValueAtTime(state.masterExpGain.gain.value, now);
    state.masterExpGain.gain.linearRampToValueAtTime(0.0005, now + dur);
  }

  /**
   * Pauses or resumes the active building explosion playback without losing timeline sync.
   */
  setBuildingExplosionPaused(paused) {
    const state = this._buildingExplosion;
    if (!state || !state.active || !this.ctx) return;
    const wantPause = !!paused;
    if (wantPause === state.paused) return;

    const now = this.ctx.currentTime;
    if (wantPause) {
      state.offset = Math.min(state.duration, state.offset + Math.max(0, now - state.startTime));
      state.paused = true;
      if (state.source) {
        try {
          state.source.onended = null;
          state.source.stop();
          state.source.disconnect();
        } catch (e) { }
        state.source = null;
      }
      state.masterExpGain.gain.setTargetAtTime(0.0, now, 0.015);
    } else {
      state.paused = false;
      state.masterExpGain.gain.setValueAtTime(state.fadingOut ? 0.0005 : 1.85, now);
      this._startBuildingExplosionSource(state, state.offset);
    }
  }

  /**
   * Immediately stops and disconnects any active building_explosions.mp3 playback.
   */
  stopBuildingExplosion() {
    const state = this._buildingExplosion;
    if (!state) return;
    state.active = false;
    state.paused = false;

    if (state.source) {
      try {
        state.source.onended = null;
        state.source.stop();
        state.source.disconnect();
      } catch (e) { }
      state.source = null;
    }

    const nodes = [
      state.subFilter,
      state.subGain,
      state.dirFilter,
      state.stereoPanner,
      state.dirGain,
      state.masterExpGain,
      state.expLimiter,
    ];
    for (const node of nodes) {
      if (node) {
        try { node.disconnect(); } catch (e) { }
      }
    }
    this._buildingExplosion = null;
  }

  /**
   * Metallic stanchion pole & cast-iron base clatter as barrier posts crash onto the marble floor.
   */
  playStanchionToppleClatter() {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;

    const hitImpulse = (offset, baseFreq, amp) => {
      const t = now + offset;
      // 1. Cast-iron base impact thud
      const thud = this.ctx.createOscillator();
      const thudG = this.ctx.createGain();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(145, t);
      thud.frequency.exponentialRampToValueAtTime(48, t + 0.09);
      thudG.gain.setValueAtTime(0.001, t);
      thudG.gain.linearRampToValueAtTime(0.28 * amp, t + 0.005);
      thudG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      thud.connect(thudG);
      thudG.connect(this.masterGain);
      thud.start(t);
      thud.stop(t + 0.15);

      // 2. Hollow brushed steel tube clang partials
      for (const mult of [1.0, 2.38]) {
        const clang = this.ctx.createOscillator();
        const clangG = this.ctx.createGain();
        clang.type = 'sine';
        clang.frequency.setValueAtTime(baseFreq * mult, t);
        clangG.gain.setValueAtTime(0.001, t);
        clangG.gain.linearRampToValueAtTime((mult === 1 ? 0.20 : 0.09) * amp, t + 0.003);
        clangG.gain.exponentialRampToValueAtTime(0.001, t + (mult === 1 ? 0.36 : 0.20));
        clang.connect(clangG);
        clangG.connect(this.masterGain);
        clang.start(t);
        clang.stop(t + 0.38);
      }
    };

    // Staggered left & right stanchion impacts + small floor bounce rattle
    hitImpulse(0.00, 415, 1.0);
    hitImpulse(0.07, 465, 0.85);
    hitImpulse(0.14, 520, 0.40);
    hitImpulse(0.22, 480, 0.22);
  }

  /**
   * Ensures the shared Office Room Ambience slapback/reverb send exists (~14% wet mix)
   * so _dry zombie vocal stems sit naturally inside the glass office and marble vestibule.
   */
  _ensureZombieAmbienceSend() {
    if (this._zombieAmbienceInput || !this.ctx || !this.masterGain) return this._zombieAmbienceInput;
    const ctx = this.ctx;

    const sendIn = ctx.createGain();
    sendIn.gain.value = 1.0;

    // Dual early-reflection room slapback (~0.18s damped decay tail across marble/glass walls)
    const tapA = ctx.createDelay(0.25);
    tapA.delayTime.value = 0.036;
    const lpA = ctx.createBiquadFilter();
    lpA.type = 'lowpass';
    lpA.frequency.value = 3200;

    const tapB = ctx.createDelay(0.25);
    tapB.delayTime.value = 0.074;
    const lpB = ctx.createBiquadFilter();
    lpB.type = 'lowpass';
    lpB.frequency.value = 2100;
    const fb = ctx.createGain();
    fb.gain.value = 0.24;

    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.14;

    sendIn.connect(tapA);
    tapA.connect(lpA);
    lpA.connect(wetGain);

    sendIn.connect(tapB);
    tapB.connect(lpB);
    lpB.connect(fb);
    fb.connect(tapB);
    lpB.connect(wetGain);

    wetGain.connect(this.masterGain);
    this._zombieAmbienceInput = sendIn;
    return sendIn;
  }

  /**
   * Initializes or updates the persistent per-zombie 3D "single-mouth" vocal channel.
   */
  initZombieVocalChannel(zombie, pitchBase = null) {
    if (!zombie || !this.ctx || !this.masterGain) return zombie?.vocalChannel || null;

    const isFemale =
      zombie.isFemale !== undefined
        ? !!zombie.isFemale
        : zombie.archetype !== 'man' && !(zombie.logTag || zombie.rootName || '').includes('Man');

    if (zombie.vocalChannel) {
      if (pitchBase !== null && pitchBase !== undefined) {
        zombie.vocalChannel.pitchBase = pitchBase;
      }
      return zombie.vocalChannel;
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const ambienceIn = this._ensureZombieAmbienceSend();

    const filterNode = ctx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(9000, now);
    filterNode.Q.setValueAtTime(0.65, now);

    // 3-Stage Female Vocal Formant Chain (ZombieWoman ONLY; ZombieMan bypasses directly to filterNode)
    let inputNode = filterNode;
    if (isFemale) {
      const highpassNode = ctx.createBiquadFilter();
      highpassNode.type = 'highpass';
      highpassNode.frequency.setValueAtTime(FEMALE_CHEST_CUT_HZ, now);
      highpassNode.Q.setValueAtTime(0.75, now);

      const formantNode = ctx.createBiquadFilter();
      formantNode.type = 'peaking';
      formantNode.frequency.setValueAtTime(1850, now);
      formantNode.Q.setValueAtTime(1.15, now);
      formantNode.gain.setValueAtTime(FEMALE_FORMANT_BOOST_DB, now);

      highpassNode.connect(formantNode);
      formantNode.connect(filterNode);
      inputNode = highpassNode;
    }

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(1.0, now);

    const pannerNode = ctx.createStereoPanner();
    pannerNode.pan.setValueAtTime(0, now);

    const wetSend = ctx.createGain();
    wetSend.gain.setValueAtTime(1.0, now);

    // [Optional Female EQ] -> Filter (wall occlusion) -> Gain (distance attenuation) -> StereoPanner -> masterGain + room send
    filterNode.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(this.masterGain);
    if (ambienceIn) {
      gainNode.connect(wetSend);
      wetSend.connect(ambienceIn);
    }

    const defaultPitch = pitchBase ?? zombie.vocalPitchBase ?? (isFemale ? FEMALE_BASE_PITCH : 0.84);
    const ch = {
      isFemale,
      pitchBase: defaultPitch,
      lastVariantIndex: {
        attack: -1,
        chase: -1,
        dead: -1,
        hurt: -1,
        idle: -1,
        walk: -1,
      },
      currentSource: null,
      currentSourceGain: null,
      currentCategory: null,
      currentPriority: 0,
      isPlaying: false,
      lastEndedAt: 0,
      inputNode,
      filterNode,
      gainNode,
      pannerNode,
      wetSend,
    };

    zombie.vocalChannel = ch;
    this._zombieVocalChannels.add(ch);
    return ch;
  }

  _fadeOutAndStopZombieChannel(ch, fadeSec = 0.025) {
    if (!ch || !ch.currentSource) return;
    const src = ch.currentSource;
    const srcGain = ch.currentSourceGain;
    src.onended = null;
    ch.currentSource = null;
    ch.currentSourceGain = null;
    ch.isPlaying = false;
    ch.currentCategory = null;
    ch.currentPriority = 0;

    const ctx = this.ctx;
    if (!ctx) {
      try { src.stop(); src.disconnect(); } catch (e) { }
      return;
    }

    const now = ctx.currentTime;
    const dur = Math.max(0.005, fadeSec);
    if (srcGain) {
      try {
        srcGain.gain.cancelScheduledValues(now);
        srcGain.gain.setValueAtTime(Math.max(0.0001, srcGain.gain.value), now);
        srcGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      } catch (e) { }
    }
    try {
      src.stop(now + dur + 0.008);
    } catch (e) {
      try { src.disconnect(); } catch (err) { }
    }
  }

  /**
   * Plays a spatial zombie vocal clip from the 12 preloaded .wav files on the zombie's
   * single-mouth vocalChannel with priority interruption and alternating variant selection.
   */
  playZombieVocal(zombie, category) {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled || !zombie) return false;
    this.resume();

    const buffers = this.zombieBuffers[category];
    if (!buffers || buffers.length === 0) return false;

    const ch = this.initZombieVocalChannel(zombie);
    if (!ch) return false;

    const nextPriority = ZOMBIE_VOCAL_PRIORITY[category] || 1;
    if (ch.isPlaying) {
      // Lower-priority requests never interrupt higher-priority active vocals
      if (nextPriority < ch.currentPriority) {
        return false;
      }
      // Interrupt >= priority active vocal cleanly with a 25ms crossfade-out
      this._fadeOutAndStopZombieChannel(ch, 0.025);
    }

    // Alternate between the 2 variants instead of repeating the same clip twice in a row
    const prevIdx = ch.lastVariantIndex[category] ?? -1;
    let idx = 0;
    if (buffers.length > 1) {
      idx = prevIdx === 0 ? 1 : prevIdx === 1 ? 0 : Math.floor(Math.random() * buffers.length);
      if (buffers.length > 2 && idx === prevIdx) {
        idx = (prevIdx + 1) % buffers.length;
      }
    }
    ch.lastVariantIndex[category] = idx;
    const buffer = buffers[idx];
    if (!buffer) return false;

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    // Distinct gender/individual pitch + female vocal inflection (attack/chase/hurt +0.05)
    let rate;
    if (ch.isFemale) {
      const baseFemale = ch.pitchBase ?? zombie.vocalPitchBase ?? FEMALE_BASE_PITCH;
      const inflection = (category === 'attack' || category === 'chase' || category === 'hurt') ? 0.05 : 0.0;
      rate = Math.max(0.85, Math.min(1.80, baseFemale + inflection + (Math.random() * 2 - 1) * 0.025));
    } else {
      const basePitch = ch.pitchBase ?? zombie.vocalPitchBase ?? 0.84;
      rate = Math.max(0.60, Math.min(1.45, basePitch + (Math.random() * 2 - 1) * 0.03));
    }
    src.playbackRate.setValueAtTime(rate, now);

    const srcGain = this.ctx.createGain();
    const targetGain = ZOMBIE_VOCAL_GAIN[category] ?? 0.85;
    srcGain.gain.setValueAtTime(0.0001, now);
    srcGain.gain.linearRampToValueAtTime(targetGain, now + 0.008);

    src.connect(srcGain);
    srcGain.connect(ch.inputNode || ch.filterNode);

    ch.currentSource = src;
    ch.currentSourceGain = srcGain;
    ch.currentCategory = category;
    ch.currentPriority = nextPriority;
    ch.isPlaying = true;

    src.onended = () => {
      if (ch.currentSource === src) {
        ch.currentSource = null;
        ch.currentSourceGain = null;
        ch.currentCategory = null;
        ch.currentPriority = 0;
        ch.isPlaying = false;
        ch.lastEndedAt = performance.now() * 0.001;
      }
      try {
        src.disconnect();
        srcGain.disconnect();
      } catch (e) { }
    };

    src.start(now);
    return true;
  }

  /**
   * Immediately fades out and stops a specific zombie's active vocal source.
   */
  stopZombieVocal(zombie, fadeSec = 0.02) {
    if (!zombie || !zombie.vocalChannel) return;
    this._fadeOutAndStopZombieChannel(zombie.vocalChannel, fadeSec);
  }

  /**
   * Immediately stops all active zombie vocal sources across the level (menu/reset/F9 off).
   */
  stopAllZombieVocals() {
    for (const ch of this._zombieVocalChannels) {
      this._fadeOutAndStopZombieChannel(ch, 0.015);
    }
  }

  /**
   * Updates per-zombie real-time stereo pan, inverse-distance attenuation, and stairwell/wall occlusion.
   */
  updateZombieSpatialAudio(zombie, camera, playerPos = null) {
    if (!zombie || !this.ctx || !camera) return;
    const ch = zombie.vocalChannel || this.initZombieVocalChannel(zombie);
    if (!ch || !ch.gainNode || !ch.filterNode || !ch.pannerNode) return;

    const zPos = zombie.root.position;
    const refPos = playerPos || camera.position;
    const dx = zPos.x - camera.position.x;
    const dy = (zPos.y + 1.45) - camera.position.y;
    const dz = zPos.z - camera.position.z;
    const dist = Math.hypot(dx, dy, dz);
    const hDist = Math.hypot(dx, dz);

    // Camera local +X right vector projected onto XZ floor
    const m = camera.matrixWorld.elements;
    let rx = m[0];
    let rz = m[2];
    const rLen = Math.hypot(rx, rz) || 1;
    rx /= rLen;
    rz /= rLen;

    const rightDot = hDist > 1e-4 ? (dx * rx + dz * rz) / hDist : 0;
    const pan = Math.max(-0.92, Math.min(0.92, rightDot * 0.88));

    // Inverse-distance rolloff: full volume <= 2.2m, ~12% at 18m
    let distGain = 1.0;
    if (dist > 2.2) {
      distGain = Math.max(0.05, 1.0 / (1.0 + (dist - 2.2) * 0.464));
    }

    // Stairwell & vestibule glass partition low-pass occlusion
    const playerX = refPos.x;
    const playerY = refPos.y;
    const inStairwell = zPos.y < -0.3;
    const separatedByVestibuleWall =
      (!zombie.hasExitedVestibule && playerX > -9.2) ||
      (zPos.x > -9.2 && playerX <= -10.05) ||
      (zPos.x <= -10.05 && playerX > -9.2);

    let cutoff = 9000;
    if (inStairwell && playerY >= -0.3) {
      cutoff = 1150;
    } else if (separatedByVestibuleWall) {
      cutoff = 1400;
    }

    const now = this.ctx.currentTime;
    ch.pannerNode.pan.setTargetAtTime(pan, now, 0.04);
    ch.gainNode.gain.setTargetAtTime(distGain, now, 0.05);
    ch.filterNode.frequency.setTargetAtTime(cutoff, now, 0.08);
  }

  /**
   * Triggers zombie aggro vocal using the real preloaded chase .wav stems.
   */
  playZombieAggro(distance = 5, zombie = null) {
    if (zombie) {
      this.playZombieVocal(zombie, 'chase');
    }
  }

  /**
   * Meaty bullet impact on zombie flesh (+ sharp wet crunch on headshot).
   */
  playZombieBodyHit(isHeadshot = false, distance = 5) {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();

    const now = this.ctx.currentTime;
    const att = Math.max(0.25, Math.min(1.0, 1.0 / (1.0 + Math.max(0, distance - 1.5) * 0.10)));

    // Low meaty impact punch
    const thud = this.ctx.createOscillator();
    const thudG = this.ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(isHeadshot ? 190 : 140, now);
    thud.frequency.exponentialRampToValueAtTime(48, now + 0.09);
    thudG.gain.setValueAtTime(0.001, now);
    thudG.gain.linearRampToValueAtTime((isHeadshot ? 0.34 : 0.26) * att, now + 0.004);
    thudG.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    thud.connect(thudG);
    thudG.connect(this.masterGain);
    thud.start(now);
    thud.stop(now + 0.12);

    // Wet splatter / skull crack burst
    const nBuf = this._noiseBufferCache.get(0.025) || this._createNoiseBuffer(0.025);
    if (nBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = nBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(isHeadshot ? 2100 : 1150, now);
      bp.Q.setValueAtTime(1.1, now);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime((isHeadshot ? 0.38 : 0.24) * att, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      src.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain);
      src.start(now);
    }
  }

  /**
   * Delayed floor collapse body thud accompanying the real zombie dead vocal clip.
   */
  playZombieDeath(isHeadshot = false, distance = 5) {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();

    const now = this.ctx.currentTime;
    const att = Math.max(0.25, Math.min(1.0, 1.0 / (1.0 + Math.max(0, distance - 2.0) * 0.12)));

    // Delayed body collapse thud onto floor
    const thudAt = now + (isHeadshot ? 0.36 : 0.52);
    const body = this.ctx.createOscillator();
    const bodyG = this.ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(92, thudAt);
    body.frequency.exponentialRampToValueAtTime(34, thudAt + 0.18);
    bodyG.gain.setValueAtTime(0.001, thudAt);
    bodyG.gain.linearRampToValueAtTime(0.28 * att, thudAt + 0.01);
    bodyG.gain.exponentialRampToValueAtTime(0.001, thudAt + 0.22);
    body.connect(bodyG);
    bodyG.connect(this.masterGain);
    body.start(thudAt);
    body.stop(thudAt + 0.24);
  }

  /**
   * Visceral flesh hit + Roc grunt when struck by a zombie claw swipe.
   */
  playPlayerHit(isFatal = false) {
    if (this.isPreloading || !this.ctx || this.isMuted || !this.isSfxEnabled) return;
    this.resume();

    const now = this.ctx.currentTime;

    // 1. Heavy impact chest thud
    const thud = this.ctx.createOscillator();
    const thudG = this.ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(128, now);
    thud.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    thudG.gain.setValueAtTime(0.001, now);
    thudG.gain.linearRampToValueAtTime(isFatal ? 0.52 : 0.40, now + 0.006);
    thudG.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    thud.connect(thudG);
    thudG.connect(this.masterGain);
    thud.start(now);
    thud.stop(now + 0.24);

    // 2. Sharp claw tear transient
    const nBuf = this._noiseBufferCache.get(0.025) || this._createNoiseBuffer(0.025);
    if (nBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = nBuf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(1700, now);
      hp.Q.setValueAtTime(0.9, now);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.36, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.masterGain);
      src.start(now);
    }

    // 3. Low male pained grunt
    const grunt = this.ctx.createOscillator();
    const gruntFilt = this.ctx.createBiquadFilter();
    const gruntG = this.ctx.createGain();
    grunt.type = 'sawtooth';
    grunt.frequency.setValueAtTime(isFatal ? 132 : 148, now + 0.02);
    grunt.frequency.exponentialRampToValueAtTime(isFatal ? 72 : 95, now + (isFatal ? 0.42 : 0.22));
    gruntFilt.type = 'lowpass';
    gruntFilt.frequency.setValueAtTime(520, now + 0.02);
    gruntG.gain.setValueAtTime(0.001, now + 0.02);
    gruntG.gain.linearRampToValueAtTime(0.22, now + 0.05);
    gruntG.gain.exponentialRampToValueAtTime(0.001, now + (isFatal ? 0.45 : 0.24));
    grunt.connect(gruntFilt);
    gruntFilt.connect(gruntG);
    gruntG.connect(this.masterGain);
    grunt.start(now + 0.02);
    grunt.stop(now + (isFatal ? 0.48 : 0.26));

    // Optional body collapse floor thud on 3rd (fatal) hit
    if (isFatal) {
      const dropAt = now + 0.62;
      const fall = this.ctx.createOscillator();
      const fallG = this.ctx.createGain();
      fall.type = 'sine';
      fall.frequency.setValueAtTime(84, dropAt);
      fall.frequency.exponentialRampToValueAtTime(30, dropAt + 0.24);
      fallG.gain.setValueAtTime(0.001, dropAt);
      fallG.gain.linearRampToValueAtTime(0.45, dropAt + 0.015);
      fallG.gain.exponentialRampToValueAtTime(0.001, dropAt + 0.28);
      fall.connect(fallG);
      fallG.connect(this.masterGain);
      fall.start(dropAt);
      fall.stop(dropAt + 0.30);
    }
  }
}
