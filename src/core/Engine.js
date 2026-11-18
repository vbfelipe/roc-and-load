import * as THREE from 'three';
import { NightOfficeEnvironment } from './NightOfficeEnvironment.js';
import { ZombieEnemy } from '../enemies/ZombieEnemy.js';
import { ZombieMan } from '../enemies/ZombieMan.js';
import { ZombieHazmat } from '../enemies/ZombieHazmat.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function frontToBackOpaqueSort(a, b) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  // Sort coarse 4-meter depth zones front-to-back for inter-room Early-Z rejection,
  // while preserving material creation order (walls/backing plates before plaques/overlays) within each zone!
  const zoneA = Math.floor(a.z * 0.25);
  const zoneB = Math.floor(b.z * 0.25);
  if (zoneA !== zoneB) return zoneA - zoneB;
  if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  return a.id - b.id;
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c10);
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.006);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.03, 600);
    this.scene.add(this.camera);

    // 3. Single-pass hardware renderer with native RGBA8 hardware MSAA (antialias: true)
    // Fragment shaders still execute only ONCE per pixel while hardware MSAA smooths geometry edges!
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      powerPreference: 'high-performance',
      antialias: true,
      depth: true,
      stencil: false,
    });
    this.renderer.setPixelRatio(1.0);
    this.renderer.setSize(this.width, this.height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = false; // Zero shadow map overhead - scene uses PBR NightOfficeEnvironment IBL

    // Sort opaque geometry strictly Front-to-Back (a.z - b.z) so close walls/elevator/vestibule
    // populate the hardware depth buffer first and Early-Z rejects occluded rooms behind them!
    this.renderer.setOpaqueSort(frontToBackOpaqueSort);

    // 4. Offline PBR Environment via NightOfficeEnvironment + PMREMGenerator
    this._initEnvironment();

    // 5. Lighting Setup: Cool Night Office Atmosphere (Hemisphere + Overhead Key)
    this._initLighting();

    // 6. Post-Processing Pipeline (Zero-AO, half-res bloom)
    this._initPostProcessing();

    // 7. NPC Entities (hidden & paused at start so 3:00 AM office is eerie; toggled via F9 Zombie Tuner)
    this.testZombiesVisible = false;
    this.zombieManager = null;
    this.zombie = new ZombieEnemy(this.scene, {
      spawnPosition: new THREE.Vector3(-0.6, 0.0, 2.5),
      lookAtPosition: new THREE.Vector3(0.0, 0.0, -3.0),
      active: false,
    });
    this.zombieMan = new ZombieMan(this.scene, {
      spawnPosition: new THREE.Vector3(1.6, 0.0, 2.5),
      lookAtPosition: new THREE.Vector3(0.0, 0.0, -3.0),
      active: false,
    });
    this.zombieHazmat = new ZombieHazmat(this.scene, {
      spawnPosition: new THREE.Vector3(3.4, 0.0, 2.5),
      lookAtPosition: new THREE.Vector3(0.0, 0.0, -3.0),
      active: false,
    });
    this.enemies = [this.zombie, this.zombieMan, this.zombieHazmat];
    if (typeof window !== 'undefined') {
      window.__rocZombie = this.zombie;
      window.__rocZombieMan = this.zombieMan;
      window.__rocZombieHazmat = this.zombieHazmat;
    }

    // 8. Loop & Physics Timing
    this.clock = new THREE.Clock();
    this.physicsUpdatables = [];
    this.visualUpdatables = [];
    this.isRunning = false;

    // Frame stats
    this.fps = 60;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.fpsEl = document.getElementById('stat-fps');

    // Window resize handler
    window.addEventListener('resize', () => this.onResize());
  }

  _initEnvironment() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    // A. WORLD IBL: smooth night-office gradient (no hot boxes -> no phantom blobs on marble/chrome)
    const nightEnv = new NightOfficeEnvironment();
    this.scene.environment = pmremGenerator.fromScene(nightEnv, 0.04).texture;
    nightEnv.dispose();

    // B. VIEWMODEL IBL: RoomEnvironment, assigned per-material to weapons & hands only.
    // USP / Shotgun / MP5 have dark textures authored for this studio IBL; the Desert Eagle
    // is tamed individually in WeaponViewmodel (never darken all weapons globally!).
    const roomEnv = new RoomEnvironment();
    this.viewmodelEnvironment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();

    pmremGenerator.dispose();
  }

  _initLighting() {
    // Budget: 1 hemisphere + 1 directional (cheap, no shadows, optimal framerate).

    // 1. Ambient fill: cool lit-ceiling sky / charcoal floor bounce
    this.hemiLight = new THREE.HemisphereLight(0xa9bcd8, 0x161c26, 0.9);
    this.hemiLight.position.set(0, 10, 0);
    this.scene.add(this.hemiLight);

    // 2. Overhead "troffer" key: cool-white, near-vertical (slight tilt so desks/walls get form)
    this.keyLight = new THREE.DirectionalLight(0xdce8f7, 0.9);
    this.keyLight.position.set(2.5, 10, 1.5);
    this.keyLight.target.position.set(0, 0, 0);
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    // Live tuning from DevTools console: __rocEngine.hemiLight.intensity = 0.9, etc.
    if (typeof window !== 'undefined') window.__rocEngine = this;
  }

  _initPostProcessing() {
    // Direct single-pass hardware rendering (ACESFilmicToneMapping is compiled directly into materials).
    // Eliminates 1920x1080 HalfFloat 2x MSAA resolve + 11-pass mipmap bloom + EffectPass fill-rate overhead.
    this.bloomEffect = null;
    this.toneMappingEffect = null;
    this.vignetteEffect = null;
    this.composer = {
      render: () => {
        this.renderer.render(this.scene, this.camera);
      },
      setSize: () => {},
    };
  }

  loadEnemies(onProgress) {
    const enemies = this.enemies || [];
    if (!enemies.length) return Promise.resolve();

    const weights = enemies.map((enemy) =>
      typeof enemy.getTotalAssetBytes === 'function' ? enemy.getTotalAssetBytes() : 1
    );
    const totalWeight = weights.reduce((acc, b) => acc + b, 0) || enemies.length;
    const fractions = new Float64Array(enemies.length);

    const reportProgress = (label) => {
      if (!onProgress) return;
      let weightedSum = 0;
      for (let i = 0; i < enemies.length; i++) {
        weightedSum += fractions[i] * weights[i];
      }
      const overall = weightedSum / totalWeight;
      const safeLabel = label === 'complete' && overall < 1 ? 'LOADING' : label;
      onProgress(overall, safeLabel);
    };

    return Promise.all(
      enemies.map((enemy, idx) =>
        enemy.load((frac, label) => {
          fractions[idx] = frac;
          reportProgress(label);
        })
      )
    ).then((res) => {
      if (onProgress) onProgress(1.0, 'complete');
      return res;
    });
  }

  getEnemyPreloadTextures() {
    const textures = [];
    for (const enemy of this.enemies) {
      if (enemy && typeof enemy.getPreloadTextures === 'function') {
        textures.push(...enemy.getPreloadTextures());
      }
    }
    return textures;
  }

  setTestZombiesVisible(visible) {
    this.testZombiesVisible = !!visible;
    for (const enemy of this.enemies) {
      if (!enemy) continue;
      if (this.testZombiesVisible && enemy.isDead && typeof enemy.reset === 'function') {
        enemy.reset();
      }
      if (typeof enemy.setActive === 'function') {
        enemy.setActive(this.testZombiesVisible);
      } else if (enemy.root) {
        enemy.root.visible = this.testZombiesVisible;
      }
    }
    return this.testZombiesVisible;
  }

  toggleTestZombies() {
    return this.setTestZombiesVisible(!this.testZombiesVisible);
  }

  resetEnemies() {
    for (const enemy of this.enemies) {
      if (enemy && typeof enemy.reset === 'function') {
        enemy.reset();
      }
    }
  }

  setZombieManager(zombieManager) {
    this.zombieManager = zombieManager;
  }

  addPhysicsUpdatable(obj) {
    this.physicsUpdatables.push(obj);
  }

  addVisualUpdatable(obj) {
    this.visualUpdatables.push(obj);
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(1.0);
    this.renderer.setSize(this.width, this.height);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this.lastFpsUpdate = performance.now();

    const loop = (timestamp) => {
      if (!this.isRunning) return;
      requestAnimationFrame(loop);
      this._tick(timestamp);
    };

    requestAnimationFrame(loop);
  }

  _tick(timestamp) {
    const rawDelta = this.clock.getDelta();
    // Clamp delta to avoid physics explosions during tab switching
    const delta = Math.min(rawDelta, 0.05);

    // 1. Decoupled sub-stepped fixed physics tick (STEPS_PER_FRAME = 3 -> 180Hz at 60 FPS)
    const STEPS_PER_FRAME = 3;
    const subDelta = delta / STEPS_PER_FRAME;
    for (let s = 0; s < STEPS_PER_FRAME; s++) {
      for (let i = 0; i < this.physicsUpdatables.length; i++) {
        this.physicsUpdatables[i].fixedUpdate(subDelta);
      }
    }

    // 2. Visual frame updates (camera transforms, head bob, springs, viewmodels, NPCs)
    for (let i = 0; i < this.visualUpdatables.length; i++) {
      this.visualUpdatables[i].update(delta);
    }
    if (!this.zombieManager) {
      for (let i = 0; i < this.enemies.length; i++) {
        this.enemies[i].update(delta, this.camera);
      }
    }

    // 3. Direct single-pass render
    this.renderer.render(this.scene, this.camera);

    // 4. Update FPS diagnostics
    this.frameCount++;
    if (timestamp - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (timestamp - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = timestamp;

      if (!this.fpsEl) {
        this.fpsEl = document.getElementById('stat-fps');
      }
      if (this.fpsEl) {
        this.fpsEl.textContent = this.fps;
      }
    }
  }
}
