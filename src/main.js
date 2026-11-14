import * as TWEEN from '@tweenjs/tween.js';
import { Engine } from './core/Engine.js';
import { InputManager } from './core/InputManager.js';
import { SoundManager } from './core/SoundManager.js';
import { WarehouseBuilder } from './world/WarehouseBuilder.js';
import { PlayerController } from './player/PlayerController.js';
import { WeaponViewmodel } from './weapons/WeaponViewmodel.js';
import { WeaponSystem } from './weapons/WeaponSystem.js';
import { HUD } from './ui/HUD.js';
import { WeaponWheelHUD } from './ui/WeaponWheelHUD.js';
import { LightingTuner } from './ui/LightingTuner.js';
import { ViewmodelTuner } from './ui/ViewmodelTuner.js';
import { ZombieTuner } from './ui/ZombieTuner.js';
import { IntroSequence, ELEVATOR_SPAWN } from './game/IntroSequence.js';
import { DecalManager } from './world/DecalManager.js';
import { ZombieManager } from './enemies/ZombieManager.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const startModal = document.getElementById('start-modal');
  const startBtn = document.getElementById('start-btn');
  const startBtnText = document.getElementById('start-btn-text');
  const exitBtn = document.getElementById('exit-btn');
  const statusVal = document.getElementById('status-val');
  const bgmToggleBtn = document.getElementById('bgm-toggle-btn');
  const bgmStateText = document.getElementById('bgm-state-text');
  const sfxToggleBtn = document.getElementById('sfx-toggle-btn');
  const sfxStateText = document.getElementById('sfx-state-text');
  const uiLayer = document.getElementById('ui-layer');
  const posEl = document.getElementById('stat-pos');
  let lastPosTime = 0;

  // Preloader UI elements
  const loadingScreen = document.getElementById('loading-screen');
  const loadingBarFill = document.getElementById('loading-bar-fill');
  const loadingStatusText = document.getElementById('loading-status-text');
  const loadingPctText = document.getElementById('loading-pct-text');
  let isPreloading = true;

  let currentBootProgress = 0;
  function updateBootProgress(targetPct, statusMsg) {
    if (targetPct > currentBootProgress) currentBootProgress = targetPct;
    const clamped = Math.min(100, Math.max(0, currentBootProgress));
    if (loadingBarFill) loadingBarFill.style.width = `${clamped}%`;
    if (loadingPctText) loadingPctText.textContent = `${Math.round(clamped)}%`;
    if (statusMsg && loadingStatusText) loadingStatusText.textContent = statusMsg;
  }

  // Lock start button while preloading
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    startBtn.style.cursor = 'wait';
  }
  if (statusVal) {
    statusVal.textContent = 'LOADING';
  }

  const engine = new Engine(canvas);
  engine.camera.near = 0.015;
  engine.camera.updateProjectionMatrix();

  const input = new InputManager(canvas);
  const sound = new SoundManager();

  const hud = new HUD();
  const warehouse = new WarehouseBuilder(engine.scene);
  const colliderMesh = warehouse.build();

  const player = new PlayerController(engine.camera, input, sound);
  player.setCollider(warehouse.playerColliderMesh || colliderMesh);
  if (Array.isArray(warehouse.elevatorDoorBlockers) && warehouse.elevatorDoorBlockers.length > 0) {
    player.setDynamicBlockers(warehouse.elevatorDoorBlockers);
  } else if (warehouse.elevatorDoorBlocker) {
    player.setDynamicBlockers([warehouse.elevatorDoorBlocker]);
  }
  player.teleport(ELEVATOR_SPAWN.x, ELEVATOR_SPAWN.y, ELEVATOR_SPAWN.z);
  player.yaw = ELEVATOR_SPAWN.yaw;
  player.pitch = ELEVATOR_SPAWN.pitch;
  if (typeof player._updateCameraTransform === 'function') {
    player._updateCameraTransform();
  }
  window.__rocPlayer = player;

  const viewmodel = new WeaponViewmodel(engine.camera, sound, { autoLoad: false });
  viewmodel.setEnvironmentMap(engine.viewmodelEnvironment);

  const weaponSystem = new WeaponSystem(
    engine.scene,
    engine.camera,
    viewmodel,
    input,
    sound,
    player
  );
  weaponSystem.setCollider(warehouse.weaponColliderMesh || colliderMesh);
  weaponSystem.setMonitorScreens(warehouse.monitorScreens);
  weaponSystem.setPlayer(player);
  weaponSystem.setHUD(hud);
  weaponSystem.lockAllWeapons();
  weaponSystem.setUnarmed(true);

  const weaponWheel = new WeaponWheelHUD(weaponSystem, sound);
  window.__rocWeaponWheel = weaponWheel;

  const introSequence = new IntroSequence({
    scene: engine.scene,
    camera: engine.camera,
    player,
    weaponSystem,
    hud,
    sound,
    input,
    warehouse,
  });
  window.__rocIntro = introSequence;

  const lightingTuner = new LightingTuner(engine, warehouse);
  const viewmodelTuner = new ViewmodelTuner(viewmodel, weaponSystem);

  const decalManager = new DecalManager(engine.scene, warehouse.weaponColliderMesh || colliderMesh);
  const zombieManager = new ZombieManager(engine.scene, {
    womanTemplate: engine.zombie,
    manTemplate: engine.zombieMan,
    sound,
    decalManager,
  });
  zombieManager.setCollider(warehouse.weaponColliderMesh || colliderMesh);
  zombieManager.setPlayer(player);
  engine.setZombieManager(zombieManager);
  weaponSystem.setZombieManager(zombieManager);
  weaponSystem.setDecalManager(decalManager);
  introSequence.setZombieManager(zombieManager);
  player.setZombieColliders(() => zombieManager.getSolidColliders());

  const zombieTuner = new ZombieTuner(engine, zombieManager, weaponSystem);

  window.__rocWarehouse = warehouse;
  window.__rocTuner = lightingTuner;
  window.__rocViewmodelTuner = viewmodelTuner;
  window.__rocZombieManager = zombieManager;
  window.__rocDecalManager = decalManager;
  window.__rocZombieTuner = zombieTuner;

  let gameState = 'MAIN_MENU';
  let menuCameraElapsed = 0;
  let deathCollapseElapsed = 0;
  let gameOverShown = false;
  window.getGameState = () => gameState;

  zombieManager.onPlayerHit = () => {
    if (gameState !== 'PLAYING') return;
    const remainingHp = player.takeDamage(1);
    if (typeof sound.playPlayerHit === 'function') {
      sound.playPlayerHit(remainingHp <= 0);
    }
    if (typeof hud.triggerDamageFlash === 'function') {
      hud.triggerDamageFlash(remainingHp, player.maxHp);
    }
    if (remainingHp <= 0) {
      deathCollapseElapsed = 0;
      gameOverShown = false;
      player.startDeathCollapse();
      setGameState('GAME_OVER');
      if (document.pointerLockElement) {
        try { document.exitPointerLock(); } catch (e) {}
      }
    }
  };

  function setGameState(state) {
    gameState = state;
    player.setGameState(state);
    weaponSystem.setGameState(state);
    if (introSequence) {
      introSequence.onGameStateChanged(state);
    }
    if (hud && typeof hud.setGameplayHudActive === 'function') {
      hud.setGameplayHudActive(state === 'PLAYING');
    }
    if (state !== 'PLAYING' && weaponWheel && weaponWheel.isOpen) {
      weaponWheel.close(false);
    }

    if (state === 'PLAYING') {
      startModal.classList.add('hidden');
      if (uiLayer) uiLayer.classList.remove('menu-hidden');
      viewmodel.root.visible = true;
      engine.camera.rotation.order = 'YXZ';
      player.updateBobAndCamera(0);
      sound.fadeMenuMusicOut(220);
    } else if (state === 'GAME_OVER') {
      startModal.classList.add('hidden');
      if (uiLayer) uiLayer.classList.add('menu-hidden');
      viewmodel.root.visible = false;
      input.clearInputs();
      if (window.isZombieTunerOpen) zombieTuner.close();
      if (window.isViewmodelTunerOpen) viewmodelTuner.close();
      if (window.isLightingTunerOpen) lightingTuner.close();
    } else if (state === 'PAUSED') {
      startModal.classList.remove('hidden');
      if (uiLayer) uiLayer.classList.add('menu-hidden');
      viewmodel.root.visible = false;
      input.clearInputs();

      if (startBtnText) {
        startBtnText.textContent = 'RESUME';
      }
      if (exitBtn) {
        exitBtn.style.display = 'inline-flex';
      }
      if (statusVal) {
        statusVal.textContent = 'PAUSED';
        statusVal.classList.add('paused');
        statusVal.style.color = '#f59e0b';
      }
      sound.resumeMenuMusic(300);
    } else {
      // MAIN_MENU: restart showroom glide at the Monitors & Skyline showcase (s = 0)
      menuCameraElapsed = 0;
      startModal.classList.remove('hidden');
      if (uiLayer) uiLayer.classList.add('menu-hidden');
      viewmodel.root.visible = false;
      input.clearInputs();

      if (startBtnText) {
        startBtnText.textContent = 'START';
      }
      if (exitBtn) {
        exitBtn.style.display = 'none';
      }
      if (statusVal) {
        statusVal.textContent = (startBtn && startBtn.disabled) ? 'LOADING' : 'READY';
        statusVal.classList.remove('paused');
        statusVal.style.color = '';
      }
      // If returning from PAUSED (via EXIT), keep playing seamlessly without restarting;
      // if music was paused or not yet playing, resume it (only if preloading has completed)
      if (!isPreloading && sound.menuMusic && sound.menuMusic.paused) {
        sound.resumeMenuMusic(0);
      }
    }
  }

  // Initial menu state: hide HUD and gun viewmodel
  setGameState('MAIN_MENU');

  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

  async function runBootPipeline() {
    const bootStart = performance.now();
    updateBootProgress(8, 'INITIALIZING ENGINE & ENVIRONMENT...');
    await nextFrame();

    let audioFrac = 0;
    let modelFrac = 0;
    let zombieFrac = 0;
    let heroFrac = 0;
    const syncAssetProgress = (statusMsg) => {
      const weighted = 10 + (0.08 * audioFrac + 0.45 * modelFrac + 0.43 * zombieFrac + 0.04 * heroFrac) * 76;
      updateBootProgress(weighted, statusMsg);
    };

    // 1. Parallel loading: weapon SFX audio clips
    const audioPromise = sound.preloadAllAudio((fraction, key) => {
      audioFrac = fraction;
      syncAssetProgress(`DECODING AUDIO: ${key.toUpperCase()}...`);
    });

    // 2. Parallel loading: byte-weighted 3D weapon models & rigged FPS hands
    const modelsPromise = viewmodel.loadAllModels((fraction, key) => {
      modelFrac = fraction;
      const label = key === 'complete' ? 'ARSENAL ASSEMBLED' : `STREAMING ARSENAL: ${key.toUpperCase()}...`;
      syncAssetProgress(label);
    });

    // 3. Parallel loading: NPC Zombie Woman (FBX rig + 5 clips + GLB PBR maps)
    const zombiePromise = engine.loadEnemies((fraction, key) => {
      zombieFrac = fraction;
      const label = key === 'complete' ? 'ENTITIES READY' : `STREAMING NPC: ${key.toUpperCase()}...`;
      syncAssetProgress(label);
    });

    // 4. Parallel loading: WebP UI hero portraits
    const heroImagePromise = Promise.all(
      ['./roc_hero.webp', './jorio_hero.webp'].map((src) => new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        if (img.decode) {
          img.decode().then(resolve).catch(resolve);
        } else {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }
      }))
    ).then(() => {
      heroFrac = 1.0;
      syncAssetProgress();
    });

    await Promise.all([audioPromise, modelsPromise, zombiePromise, heroImagePromise]);
    const assetsMs = Math.round(performance.now() - bootStart);

    // 5. Unified WebGL2 & EffectComposer Warm-Up (textures, VBOs, Skeleton.boneTextures, MSAA HalfFloat PSOs)
    updateBootProgress(88, 'WARMING UP GPU SHADERS & TEXTURES...');
    await nextFrame();

    const warmupStart = performance.now();
    try {
      zombieManager.initWavePool();

      if (engine.renderer && typeof engine.renderer.initTexture === 'function') {
        const texturesToWarm = [
          ...(warehouse && typeof warehouse.getPreloadTextures === 'function' ? warehouse.getPreloadTextures() : []),
          ...(typeof engine.getEnemyPreloadTextures === 'function' ? engine.getEnemyPreloadTextures() : []),
          ...(typeof decalManager.getPreloadTextures === 'function' ? decalManager.getPreloadTextures() : []),
        ];
        for (const tex of texturesToWarm) {
          if (tex) {
            try { engine.renderer.initTexture(tex); } catch (e) { }
          }
        }
      }
      engine.setTestZombiesVisible(true);
      const zmWarmState = zombieManager.prepareWarmUp();
      const dmWarmState = decalManager.prepareWarmUp(engine.renderer);
      await viewmodel.warmUpGPU(engine.renderer, engine.scene, engine.camera, engine.composer, weaponSystem);
      decalManager.finishWarmUp(dmWarmState);
      zombieManager.finishWarmUp(zmWarmState);
      engine.setTestZombiesVisible(false);
    } catch (err) {
      console.warn('GPU warm-up warning:', err);
    }
    const warmupMs = Math.round(performance.now() - warmupStart);

    updateBootProgress(100, 'SYSTEMS NOMINAL - ARSENAL READY');
    console.info(
      `[rocAndLoad] Boot ready in ${Math.round(performance.now() - bootStart)}ms (assets: ${assetsMs}ms, GPU warmup: ${warmupMs}ms)`
    );

    // Preloader is 100% complete: reset showroom sweep to s = 0 (Monitors first), render clean menu frames
    // behind the opaque loading screen so the dirty GPU warmup buffer never flashes during fade-out
    menuCameraElapsed = 0;
    viewmodel.root.visible = false;
    engine.camera.position.set(-2.6, 1.98, -5.2);
    engine.camera.up.set(0, 1, 0);
    engine.camera.lookAt(2.1, 1.04, 3.2);
    isPreloading = false;
    sound.setPreloading(false);
    engine.start();

    // Flush at least two clean MAIN_MENU frames before revealing the canvas under #loading-screen
    await nextFrame();
    await nextFrame();

    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 450);
    }

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
    }
    if (statusVal) {
      statusVal.textContent = 'READY';
    }

    // Start menu music strictly after loading finishes
    playMenuMusicOnReady();
  }

  runBootPipeline();

  function playMenuMusicOnReady() {
    if (isPreloading || gameState === 'PLAYING') return;

    sound.startMenuMusic().catch(() => {
      // Autoplay blocked by browser policy: attach one-time gesture listeners on window
      const onFirstGesture = (e) => {
        if (isPreloading) return;
        sound.resume();
        // If the first user interaction was directly on the start button, skip starting menu music
        const isStartBtn = e.target && (e.target.id === 'start-btn' || (e.target.closest && e.target.closest('#start-btn')));
        if (!isStartBtn && (gameState === 'MAIN_MENU' || gameState === 'PAUSED')) {
          sound.resumeMenuMusic(300);
        }
        window.removeEventListener('pointerdown', onFirstGesture);
        window.removeEventListener('keydown', onFirstGesture);
      };
      window.addEventListener('pointerdown', onFirstGesture);
      window.addEventListener('keydown', onFirstGesture);
    });
  }

  // Engine physics tick
  engine.addPhysicsUpdatable({
    fixedUpdate: (subDelta) => {
      if (gameState === 'PLAYING') {
        player.fixedUpdate(subDelta);
      }
    }
  });

  // Visual frame tick
  engine.addVisualUpdatable({
    update: (delta) => {
      if (warehouse && typeof warehouse.updateSkylineBeacons === 'function') {
        warehouse.updateSkylineBeacons(performance.now() * 0.001);
      }

      if (gameState === 'MAIN_MENU') {
        // Decoupled Cinematic Showroom Camera: always starts at Monitors/Skyline (s = 0)
        // and sweeps smoothly across the room to showcase the Server Room Glass & Racks (s = 1)
        if (!isPreloading) {
          menuCameraElapsed += delta;
        }
        const s = 0.5 - 0.5 * Math.cos(menuCameraElapsed * 0.14);
        const inv = 1.0 - s;
        const w0 = inv * inv;
        const w1 = 2.0 * inv * s;
        const w2 = s * s;

        // Smooth walkway glide: North-West Monitors/Skyline view -> North-East corner -> East aisle Server Racks view
        const camX = w0 * -2.6 + w1 * 5.8 + w2 * 5.2;
        const camY = w0 * 1.98 + w1 * 2.02 + w2 * 1.90 + Math.sin(menuCameraElapsed * 0.45) * 0.03;
        const camZ = w0 * -5.2 + w1 * -4.8 + w2 * 1.8;

        const lookX = w0 * 2.1 + w1 * 1.1 + w2 * -0.8;
        const lookY = w0 * 1.04 + w1 * 1.06 + w2 * 1.24;
        const lookZ = w0 * 3.2 + w1 * -1.6 + w2 * -6.2;

        engine.camera.position.set(camX, camY, camZ);
        engine.camera.up.set(0, 1, 0);
        engine.camera.lookAt(lookX, lookY, lookZ);

        viewmodel.root.visible = false;

        // Keep updating visual effects (in-flight tracers, sparks, decal cooling)
        weaponSystem.update(delta);
        TWEEN.update();
        return;
      }

      if (gameState === 'PAUSED') {
        viewmodel.root.visible = false;
        // Keep camera stationary where the player paused
        weaponSystem.update(delta);
        TWEEN.update();
        return;
      }

      if (gameState === 'GAME_OVER') {
        viewmodel.root.visible = false;
        deathCollapseElapsed += delta;
        player.updateDeathCollapse(deathCollapseElapsed);
        if (!gameOverShown && deathCollapseElapsed >= 0.60) {
          gameOverShown = true;
          hud.setGameOverVisible(true);
        }
        zombieManager.update(delta, gameState);
        decalManager.update(delta);
        hud.updateDamageVignette(delta, player.hp);
        weaponSystem.update(delta);
        TWEEN.update();
        return;
      }

      // Playing state: ensure viewmodel is visible
      viewmodel.root.visible = true;

      // 1. Update camera look & get mouse delta for viewmodel sway
      const mouseDelta = player.updateLook();
      if (mouseDelta && (mouseDelta.x !== 0 || mouseDelta.y !== 0)) {
        viewmodel.applyMouseSway(mouseDelta.x, mouseDelta.y);
      }

      // 2. Camera subtle step bob
      player.updateBobAndCamera(delta);

      // 3. Viewmodel springs (recoil, sway, ADS, bob)
      viewmodel.update(delta, player.velocity, player.isGrounded);

      // 4. Weapon hitscan, firing logic, decals, tracers
      weaponSystem.update(delta);

      // 4b. Opening gameplay sequence state machine (tutorial fade-in, phone ringing, proximity pickup)
      introSequence.update(delta, gameState);

      // 4c. Wave-1 zombie AI, animations, blood decals/droplets & edge vignette pulse
      zombieManager.update(delta, gameState);
      decalManager.update(delta);
      hud.updateDamageVignette(delta, player.hp);

      // 5. Update position diagnostics (throttled to 4Hz to eliminate per-frame DOM updates)
      const now = performance.now();
      if (posEl && now - lastPosTime >= 250) {
        lastPosTime = now;
        const px = player.position.x.toFixed(1);
        const py = player.position.y.toFixed(1);
        const pz = player.position.z.toFixed(1);
        posEl.textContent = `${px}, ${py}, ${pz}`;
      }

      // 6. Update Tweens (HUD animations, reload choreography, dead-trigger twitches)
      TWEEN.update();
    }
  });

  // Menu click containment
  startModal.addEventListener('mousedown', (e) => e.stopPropagation());
  startModal.addEventListener('mouseup', (e) => e.stopPropagation());
  startModal.addEventListener('click', (e) => e.stopPropagation());

  startBtn.addEventListener('pointerenter', () => {
    if (startBtn.offsetParent !== null) {
      sound.playButtonHover();
    }
  });

  startBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  startBtn.addEventListener('mouseup', (e) => e.stopPropagation());
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isPreloading) return;

    const isInitialStart = (gameState === 'MAIN_MENU');
    if (isInitialStart) {
      introSequence.onGameStartPressed();
    }
    sound.resume();
    sound.playStartClick();
    setGameState('PLAYING');
    input.requestLock();

    // Trigger weapon draw/equip animation and sound when entering gameplay (skipped automatically while unarmed)
    if (isInitialStart) {
      weaponSystem.playInitialEquip();
    }
  });

  const gameOverExitBtn = document.getElementById('game-over-exit-btn');

  function returnToMainMenu() {
    sound.playExitClick();
    deathCollapseElapsed = 0;
    gameOverShown = false;
    player.resetHealth();
    hud.resetDamageVignette();
    hud.setGameOverVisible(false);
    if (weaponWheel && weaponWheel.isOpen) weaponWheel.close(false);
    weaponSystem.reset();
    if (weaponWheel) weaponWheel.refreshVisuals();
    warehouse.resetMonitors();
    decalManager.clearBloodDecals();
    zombieManager.resetAll();
    if (typeof engine.setTestZombiesVisible === 'function') engine.setTestZombiesVisible(false);
    introSequence.reset();
    setGameState('MAIN_MENU');
  }

  if (exitBtn) {
    exitBtn.addEventListener('pointerenter', () => {
      if (exitBtn.offsetParent !== null && exitBtn.style.display !== 'none') {
        sound.playButtonHover();
      }
    });

    exitBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    exitBtn.addEventListener('mouseup', (e) => e.stopPropagation());
    exitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      returnToMainMenu();
    });
  }

  if (gameOverExitBtn) {
    gameOverExitBtn.addEventListener('pointerenter', () => {
      if (gameOverExitBtn.offsetParent !== null) {
        sound.playButtonHover();
      }
    });

    gameOverExitBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    gameOverExitBtn.addEventListener('mouseup', (e) => e.stopPropagation());
    gameOverExitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      returnToMainMenu();
    });
  }

  function updateBgmUi(enabled) {
    if (bgmToggleBtn) {
      bgmToggleBtn.classList.toggle('is-on', enabled);
      bgmToggleBtn.classList.toggle('is-off', !enabled);
    }
    if (bgmStateText) {
      bgmStateText.textContent = enabled ? 'ON' : 'OFF';
    }
  }

  function updateSfxUi(enabled) {
    if (sfxToggleBtn) {
      sfxToggleBtn.classList.toggle('is-on', enabled);
      sfxToggleBtn.classList.toggle('is-off', !enabled);
    }
    if (sfxStateText) {
      sfxStateText.textContent = enabled ? 'ON' : 'OFF';
    }
  }

  if (bgmToggleBtn) {
    bgmToggleBtn.addEventListener('pointerenter', () => {
      if (sound.isSfxEnabled) {
        sound.playButtonHover();
      }
    });
    bgmToggleBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    bgmToggleBtn.addEventListener('mouseup', (e) => e.stopPropagation());
    bgmToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.resume();
      const newState = !sound.isBgmEnabled;
      sound.setBgmEnabled(newState);
      updateBgmUi(newState);
      if (sound.isSfxEnabled) {
        sound.playToggleClick();
      }
    });
  }

  if (sfxToggleBtn) {
    sfxToggleBtn.addEventListener('pointerenter', () => {
      if (sound.isSfxEnabled) {
        sound.playButtonHover();
      }
    });
    sfxToggleBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    sfxToggleBtn.addEventListener('mouseup', (e) => e.stopPropagation());
    sfxToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.resume();
      const newState = !sound.isSfxEnabled;
      if (newState) {
        sound.setSfxEnabled(true);
        updateSfxUi(true);
        sound.playToggleClick();
      } else {
        sound.setSfxEnabled(false);
        updateSfxUi(false);
      }
    });
  }

  input.onLock(() => {
    if (gameState === 'GAME_OVER') {
      if (document.pointerLockElement) {
        try { document.exitPointerLock(); } catch (e) {}
      }
      return;
    }
    sound.resume();
    setGameState('PLAYING');
  });

  // Global flags for F7 lighting, F8 viewmodel, and F9 zombie tuners to prevent pause menu interference
  window.isViewmodelTunerOpen = false;
  window.isLightingTunerOpen = false;
  window.isZombieTunerOpen = false;

  input.onUnlock(() => {
    if (
      window.isViewmodelTunerOpen ||
      window.isLightingTunerOpen ||
      window.isZombieTunerOpen ||
      gameState === 'GAME_OVER'
    ) {
      // Tuner open or Game Over collapse active: DO NOT open pause menu!
      return;
    }
    if (gameState === 'PLAYING') {
      setGameState('PAUSED');
    }
  });

  // Handle ESC to close open tuners or pause cleanly
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.key === 'Escape') {
      if (window.isZombieTunerOpen) {
        zombieTuner.close();
        return;
      }
      if (window.isViewmodelTunerOpen) {
        viewmodelTuner.close();
        return;
      }
      if (window.isLightingTunerOpen) {
        lightingTuner.close();
        return;
      }
      if (gameState === 'PLAYING') {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        } else {
          setGameState('PAUSED');
        }
      }
      return;
    }
  });

  // GTA V-style 8-Wedge Radial Weapon Wheel (TAB Hold & Release) + KeyR Reload
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.key === 'Tab') {
      e.preventDefault();
      if (e.repeat) return;
      if (
        gameState !== 'PLAYING' ||
        (introSequence && introSequence.state === 'PHONE_ANSWERED') ||
        window.isViewmodelTunerOpen ||
        window.isLightingTunerOpen ||
        window.isZombieTunerOpen
      ) {
        return;
      }
      weaponWheel.open();
      return;
    }

    if (gameState !== 'PLAYING' || !input.isLocked || document.pointerLockElement === null) return;
    if (window.isWeaponWheelOpen) return;

    if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
      if (!weaponSystem.isUnarmed && weaponSystem.currentAmmo < weaponSystem.maxAmmo && !weaponSystem.isReloading) {
        weaponSystem.startReload();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Tab' || e.key === 'Tab') {
      e.preventDefault();
      if (weaponWheel.isOpen) {
        weaponWheel.close(true);
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (weaponWheel.isOpen) {
      weaponWheel.handleMouseMove(e.movementX || 0, e.movementY || 0);
    }
  });

  window.addEventListener(
    'wheel',
    (e) => {
      if (
        gameState !== 'PLAYING' ||
        (introSequence && introSequence.state === 'PHONE_ANSWERED') ||
        window.isViewmodelTunerOpen ||
        window.isLightingTunerOpen ||
        window.isZombieTunerOpen
      ) {
        return;
      }
      if (!e.deltaY || e.deltaY === 0) return;
      weaponWheel.handleWheel(e.deltaY);
    },
    { passive: true }
  );

  window.addEventListener('blur', () => {
    if (weaponWheel.isOpen) {
      weaponWheel.close(false);
    }
  });

  // Expose for testing & debug
  window.sound = sound;
  window.player = player;
  window.weaponSystem = weaponSystem;
  window.weaponWheel = weaponWheel;
  window.viewmodel = viewmodel;
  window.hud = hud;
  window.bgmToggleBtn = bgmToggleBtn;
  window.sfxToggleBtn = sfxToggleBtn;
  window.updateBgmUi = updateBgmUi;
  window.updateSfxUi = updateSfxUi;
  window.getGameState = () => gameState;
  window.setGameState = setGameState;
  // Note: engine.start() is invoked at the end of runBootPipeline() after GPU warmup completes.
});
