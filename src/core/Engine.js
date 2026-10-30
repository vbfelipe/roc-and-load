import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect
} from 'postprocessing';

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
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.015, 100);
    this.scene.add(this.camera);

    // 3. Renderer with high performance settings - strictly 1.0 pixel ratio to eliminate fullscreen fill-rate bottleneck
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      powerPreference: 'high-performance',
      antialias: false,
      depth: true,
      stencil: false,
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(1.0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.shadowMap.enabled = false; // Zero shadow map overhead - scene uses PBR RoomEnvironment IBL

    // 4. Offline PBR Environment via RoomEnvironment + PMREMGenerator
    this._initEnvironment();

    // 5. Lighting Setup (Strictly 1 HemisphereLight + 1 DirectionalLight + RoomEnvironment IBL)
    this._initLighting();

    // 6. Post-Processing Pipeline (Zero-AO, half-res bloom)
    this._initPostProcessing();

    // 7. Loop & Physics Timing
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

    const roomEnv = new RoomEnvironment();
    const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;

    this.scene.environment = envTexture;

    pmremGenerator.dispose();
    roomEnv.dispose();
  }

  _initLighting() {
    // Hemisphere ambient light (Warm overhead warehouse glow + cool concrete floor bounce)
    const hemiLight = new THREE.HemisphereLight(0xfff5ea, 0x1e293b, 0.60);
    hemiLight.position.set(0, 10, 0);
    this.scene.add(hemiLight);

    // Main key light angling down from overhead (calibrated to avoid metal burnout)
    const keyLight = new THREE.DirectionalLight(0xffeedd, 1.25);
    keyLight.position.set(6, 16, 5);
    keyLight.target.position.set(0, 0, 8);
    this.scene.add(keyLight);
    this.scene.add(keyLight.target);
  }

  _initPostProcessing() {
    // WebGL2 hardware MSAA 2x anti-aliasing directly in EffectComposer
    this.composer = new EffectComposer(this.renderer, {
      multisampling: 2,
      frameBufferType: THREE.HalfFloatType
    });

    // Pass 1: Base scene render
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Pass 2: Lightweight Half-Resolution Bloom (4x faster fill-rate with identical visuals)
    this.bloomEffect = new BloomEffect({
      luminanceThreshold: 1.1,
      intensity: 0.5,
      mipmapBlur: true,
      resolutionScale: 0.5
    });

    this.toneMappingEffect = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC
    });

    this.vignetteEffect = new VignetteEffect({
      eskil: false,
      offset: 0.18,
      darkness: 0.65
    });

    const combinedEffectPass = new EffectPass(
      this.camera,
      this.bloomEffect,
      this.toneMappingEffect,
      this.vignetteEffect
    );
    this.composer.addPass(combinedEffectPass);
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

    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(1.0);
    this.composer.setSize(this.width, this.height);
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

    // 1. Decoupled sub-stepped fixed physics tick (STEPS_PER_FRAME = 5)
    const STEPS_PER_FRAME = 5;
    const subDelta = delta / STEPS_PER_FRAME;
    for (let s = 0; s < STEPS_PER_FRAME; s++) {
      for (let i = 0; i < this.physicsUpdatables.length; i++) {
        this.physicsUpdatables[i].fixedUpdate(subDelta);
      }
    }

    // 2. Visual frame updates (camera transforms, head bob, springs, viewmodels)
    for (let i = 0; i < this.visualUpdatables.length; i++) {
      this.visualUpdatables[i].update(delta);
    }

    // 3. Render Post-Processing Pipeline
    this.composer.render();

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
