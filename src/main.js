import * as TWEEN from '@tweenjs/tween.js';
import { Engine } from './core/Engine.js';
import { InputManager } from './core/InputManager.js';
import { SoundManager } from './core/SoundManager.js';
import { WarehouseBuilder } from './world/WarehouseBuilder.js';
import { PlayerController } from './player/PlayerController.js';
import { WeaponViewmodel } from './weapons/WeaponViewmodel.js';
import { WeaponSystem } from './weapons/WeaponSystem.js';
import { HUD } from './ui/HUD.js';

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
  player.teleport(0, 0.0, -3.0);
  player.yaw = Math.PI;
  player.pitch = 0.0;
  window.__rocPlayer = player;

  const viewmodel = new WeaponViewmodel(engine.camera, sound);

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

  let gameState = 'MAIN_MENU';

  function setGameState(state) {
    gameState = state;
    player.setGameState(state);
    weaponSystem.setGameState(state);

    if (state === 'PLAYING') {
      startModal.classList.add('hidden');
      if (uiLayer) uiLayer.classList.remove('menu-hidden');
      viewmodel.root.visible = true;
      player.updateBobAndCamera(0);
      sound.fadeMenuMusicOut(220);
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
      // MAIN_MENU
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

  const yieldToBrowser = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  async function runBootPipeline() {
    updateBootProgress(5, 'INITIALIZING GAME SUBSYSTEMS...');
    await yieldToBrowser();

    // 1. Parallel loading of authentic weapon audio samples (0% -> 25%)
    const audioPromise = sound.preloadAllAudio(async (fraction, key) => {
      const pct = 5 + fraction * 20;
      updateBootProgress(pct, `DECODING AUDIO: ${key.toUpperCase()}...`);
      await yieldToBrowser();
    });

    // 2. Parallel loading of 3D weapon models & rigged FPS hands (25% -> 75%)
    const modelsPromise = viewmodel.loadAllModels(async (fraction, key) => {
      const pct = 25 + fraction * 50;
      updateBootProgress(pct, `STREAMING ARSENAL: ${key.toUpperCase()}...`);
      await yieldToBrowser();
    });

    // 3. Preload UI hero art (75% -> 85%)
    const heroImagePromise = new Promise((resolve) => {
      const img = new Image();
      img.src = './roc_hero.png';
      if (img.decode) {
        img.decode().then(resolve).catch(resolve);
      } else {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      }
    }).then(async () => {
      updateBootProgress(85, 'INTERFACE ARTWORK LOADED');
      await yieldToBrowser();
    });

    // Await all parallel asset pipelines
    await Promise.all([audioPromise, modelsPromise, heroImagePromise]);
    await yieldToBrowser();

    // 4. WebGL GPU Texture & Shader Compilation Warm-Up (85% -> 100%)
    updateBootProgress(88, 'COMPILING GPU SHADERS & TEXTURES...');
    await yieldToBrowser();

    try {
      await viewmodel.warmUpGPU(engine.renderer, engine.scene, engine.camera);
      weaponSystem.warmUpGPU(engine.renderer, engine.camera);
      if (warehouse && engine.renderer && typeof engine.renderer.initTexture === 'function') {
        const texturesToWarm = [
          warehouse.noEntrySignTexture,
          warehouse.extinguisherSignTexture,
          warehouse.extinguisherStickerTexture,
          warehouse.extinguisherGaugeTexture,
          warehouse.runningManExitSignTexture,
          warehouse.printerBadgeTexture,
          warehouse.printerScreenTexture,
          warehouse.printerBadgeTexture,
          warehouse.printerScreenTexture,
          warehouse.moonTexture,
          warehouse.balconyTileTexture,
          warehouse.balconyFlakeBumpMap,
          warehouse.skylineTowerATexture,
          warehouse.skylineTowerBTexture,
          warehouse.skylineTowerCTexture,
          warehouse.skylineTowerDTexture,
        ];
        for (const tex of texturesToWarm) {
          if (tex) {
            try { engine.renderer.initTexture(tex); } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.warn('GPU warm-up warning:', err);
    }

    await yieldToBrowser();
    updateBootProgress(100, 'SYSTEMS NOMINAL - ARSENAL READY');

    // Smooth transition from loading screen to main menu
    await new Promise((r) => setTimeout(r, 260));

    // Preloader is 100% complete: unblock audio playback
    isPreloading = false;
    sound.setPreloading(false);

    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
    }
    if (statusVal) {
      statusVal.textContent = 'READY';
    }

    // Start menu music strictly after the loading screen completes and fades out
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
        // Slow cinematic idle camera drift overlooking the Data Center
        const time = performance.now() * 0.001;
        engine.camera.position.x = player.position.x + Math.sin(time * 0.35) * 0.22;
        engine.camera.position.y = player.position.y + player.eyeHeight + Math.sin(time * 0.5) * 0.04;
        engine.camera.position.z = player.position.z + Math.cos(time * 0.35) * 0.08;
        engine.camera.rotation.order = 'YXZ';
        engine.camera.rotation.y = player.yaw + Math.sin(time * 0.25) * 0.05;
        engine.camera.rotation.x = Math.sin(time * 0.3) * 0.012;
        engine.camera.rotation.z = 0;

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
    sound.resume();
    sound.playStartClick();
    setGameState('PLAYING');
    input.requestLock();

    // Trigger weapon draw/equip animation and sound when entering gameplay
    if (isInitialStart) {
      weaponSystem.playInitialEquip();
    }
  });

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
      sound.playExitClick();
      player.reset(0, 0.1, -3.0, Math.PI, 0);
      weaponSystem.reset();
      warehouse.resetMonitors();
      setGameState('MAIN_MENU');
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
    sound.resume();
    setGameState('PLAYING');
  });

  // Global flag for F8 viewmodel tuner to prevent pause menu interference
  window.isViewmodelTunerOpen = false;

  input.onUnlock(() => {
    if (window.isViewmodelTunerOpen) {
      // Tuner is open: DO NOT pause the game, keep playing state and live viewmodel rendering!
      return;
    }
    if (gameState === 'PLAYING') {
      setGameState('PAUSED');
    }
  });

  // Handle ESC or KeyP to guarantee pause triggering even in headless/synthetic event environments
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.key === 'Escape' || e.code === 'KeyP') {
      if (window.isViewmodelTunerOpen) {
        const overlay = document.getElementById('hand-tuner-overlay');
        if (overlay) overlay.style.display = 'none';
        window.isViewmodelTunerOpen = false;
        if (viewmodel) viewmodel.tunerForceADS = null;
        input.requestLock();
        return;
      }
      if (gameState === 'PLAYING') {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        } else {
          setGameState('PAUSED');
        }
      }
    }
  });

  // Direct fail-safe KeyR reload and Digit1/Digit2 weapon slot bindings (strictly blocked when not playing)
  window.addEventListener('keydown', (e) => {
    if (gameState !== 'PLAYING' || !input.isLocked || document.pointerLockElement === null) return;
    if (e.code === 'Digit1' || e.key === '1') {
      weaponSystem.switchWeapon('hk_usp');
      return;
    }
    if (e.code === 'Digit2' || e.key === '2') {
      weaponSystem.switchWeapon('pistol');
      return;
    }
    if (e.code === 'Digit3' || e.key === '3') {
      weaponSystem.switchWeapon('shotgun');
      return;
    }
    if (e.code === 'Digit4' || e.key === '4') {
      weaponSystem.switchWeapon('hk_mp5');
      return;
    }
    if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
      if (weaponSystem.currentAmmo < weaponSystem.maxAmmo && !weaponSystem.isReloading) {
        weaponSystem.startReload();
      }
    }
  });

  // Expose for testing & debug
  window.sound = sound;
  window.player = player;
  window.weaponSystem = weaponSystem;
  window.viewmodel = viewmodel;
  window.hud = hud;
  window.bgmToggleBtn = bgmToggleBtn;
  window.sfxToggleBtn = sfxToggleBtn;
  window.updateBgmUi = updateBgmUi;
  window.updateSfxUi = updateSfxUi;
  window.getGameState = () => gameState;
  window.setGameState = setGameState;

  engine.start();
});
