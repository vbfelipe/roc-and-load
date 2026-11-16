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
import { GunShopHUD } from './ui/GunShopHUD.js';
import { DevToolsModal } from './ui/DevToolsModal.js';
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
  if (Array.isArray(warehouse.dynamicBlockers) && warehouse.dynamicBlockers.length > 0) {
    player.setDynamicBlockers(warehouse.dynamicBlockers);
  } else if (Array.isArray(warehouse.elevatorDoorBlockers) && warehouse.elevatorDoorBlockers.length > 0) {
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
  if (warehouse.maintenanceDoorHitMesh) {
    weaponSystem.setExtraColliderMeshes([warehouse.maintenanceDoorHitMesh]);
  }
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

  const decalManager = new DecalManager(engine.scene, warehouse.weaponColliderMesh || colliderMesh);
  const zombieManager = new ZombieManager(engine.scene, {
    womanTemplate: engine.zombie,
    manTemplate: engine.zombieMan,
    hazmatTemplate: engine.zombieHazmat,
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

  let playerMoney = 0;

  function addMoney(amount, { playSound = false } = {}) {
    const delta = Math.round(amount || 0);
    if (delta === 0) return playerMoney;
    playerMoney = Math.max(0, playerMoney + delta);
    if (typeof hud.setMoney === 'function') {
      hud.setMoney(playerMoney, delta);
    }
    if (playSound && typeof sound.playRewardTick === 'function') {
      sound.playRewardTick(false);
    }
    if (gunShop && gunShop.isOpen) {
      gunShop.refreshUI();
    }
    return playerMoney;
  }

  function spendMoney(cost) {
    const amount = Math.round(cost || 0);
    if (amount <= 0) return true;
    if (playerMoney < amount) return false;
    playerMoney -= amount;
    if (typeof hud.setMoney === 'function') {
      hud.setMoney(playerMoney, -amount);
    }
    return true;
  }

  window.__rocAddTestMoney = (amount = 50000) => addMoney(amount, { playSound: true });

  const gunShop = new GunShopHUD({
    weaponSystem,
    sound,
    getMoney: () => playerMoney,
    spendMoney,
    getHp: () => player.hp,
    getMaxHp: () => player.maxHp,
    onPurchaseMedkit: () => {
      player.healFull();
      if (typeof hud.setHealth === 'function') {
        hud.setHealth(player.hp, player.maxHp);
      }
      if (typeof hud.triggerHealVignette === 'function') {
        hud.triggerHealVignette();
      }
    },
    onWeaponUnlocked: () => {
      if (weaponWheel) weaponWheel.refreshVisuals();
    },
    onClose: () => {
      input.clearInputs();
      if (gameState === 'PLAYING') {
        input.requestLock();
      }
      sound.playCrateClose();
      warehouse.startMilitaryCrateClose();
    },
  });
  window.__rocGunShop = gunShop;

  window.addEventListener('resize', () => {
    if (typeof hud.onResize === 'function') {
      hud.onResize();
    }
    if (gunShop && gunShop.isOpen && typeof gunShop._syncCanvasSize === 'function') {
      gunShop._syncCanvasSize();
    }
  });

  if (typeof hud.setHealth === 'function') hud.setHealth(player.hp, player.maxHp);
  if (typeof hud.setMoney === 'function') hud.setMoney(0, 0);
  if (typeof hud.setKills === 'function') hud.setKills(0);

  introSequence.onOpenGunShop = () => {
    input.clearInputs();
    if (weaponWheel && weaponWheel.isOpen) weaponWheel.close(false);
    gunShop.open();
  };

  const devToolsModal = new DevToolsModal({
    engine,
    warehouse,
    viewmodel,
    weaponSystem,
    zombieManager,
    player,
    hud,
    input,
  });

  window.__rocWarehouse = warehouse;
  window.__rocDevTools = devToolsModal;
  window.__rocTuner = devToolsModal;
  window.__rocViewmodelTuner = devToolsModal;
  window.__rocZombieManager = zombieManager;
  window.__rocDecalManager = decalManager;
  window.__rocZombieTuner = devToolsModal;

  let gameState = 'MAIN_MENU';
  let menuCameraElapsed = 0;
  let deathCollapseElapsed = 0;
  let gameOverShown = false;
  let isPlayerInSafeZone = false;
  window.isPlayerInSafeZone = false;
  window.getGameState = () => gameState;

  function onEnterSafeZone() {
    if (isPlayerInSafeZone) return;
    isPlayerInSafeZone = true;
    window.isPlayerInSafeZone = true;

    if (weaponWheel && weaponWheel.isOpen) {
      weaponWheel.close(false);
    }
    if (weaponWheel && typeof weaponWheel.setSafeZoneLocked === 'function') {
      weaponWheel.setSafeZoneLocked(true);
    }
    if (weaponSystem && typeof weaponSystem.onEnterSafeZone === 'function') {
      weaponSystem.onEnterSafeZone();
    } else if (weaponSystem && typeof weaponSystem.setUnarmed === 'function') {
      weaponSystem.setUnarmed(true);
    }
    if (weaponWheel && typeof weaponWheel.refreshVisuals === 'function') {
      weaponWheel.refreshVisuals();
    }
    if (hud && typeof hud.setSafeZoneVisible === 'function') {
      hud.setSafeZoneVisible(true);
    }
    if (zombieManager && typeof zombieManager.setPlayerInSafeZone === 'function') {
      zombieManager.setPlayerInSafeZone(true);
    }
  }

  function onExitSafeZone() {
    if (!isPlayerInSafeZone) return;
    isPlayerInSafeZone = false;
    window.isPlayerInSafeZone = false;

    if (weaponWheel && typeof weaponWheel.setSafeZoneLocked === 'function') {
      weaponWheel.setSafeZoneLocked(false);
    }
    if (weaponSystem && typeof weaponSystem.onExitSafeZone === 'function') {
      weaponSystem.onExitSafeZone();
    }
    if (hud && typeof hud.setSafeZoneVisible === 'function') {
      hud.setSafeZoneVisible(false);
    }
    if (zombieManager && typeof zombieManager.setPlayerInSafeZone === 'function') {
      zombieManager.setPlayerInSafeZone(false);
    }
  }

  zombieManager.onZombieKilled = ({ kills, reward, isHeadshot }) => {
    if (typeof hud.setKills === 'function') {
      hud.setKills(kills);
    }
    addMoney(reward, { playSound: false });
    if (typeof sound.playRewardTick === 'function') {
      sound.playRewardTick(Boolean(isHeadshot));
    }
  };

  zombieManager.onWave1Cleared = () => {
    introSequence.triggerSecondPhoneCall();
  };

  function handlePlayerFatalDamage() {
    deathCollapseElapsed = 0;
    gameOverShown = false;
    hud.resetRadiationWarning?.();
    player.startDeathCollapse();
    setGameState('GAME_OVER');
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch (e) {}
    }
  }

  zombieManager.onPlayerHit = () => {
    if (gameState !== 'PLAYING') return;
    const remainingHp = player.takeDamage(33.34);
    if (typeof hud.setHealth === 'function') {
      hud.setHealth(remainingHp, player.maxHp);
    }
    if (typeof sound.playPlayerHit === 'function') {
      sound.playPlayerHit(remainingHp <= 0);
    }
    if (typeof hud.triggerDamageFlash === 'function') {
      hud.triggerDamageFlash(remainingHp, player.maxHp);
    }
    if (remainingHp <= 0) {
      handlePlayerFatalDamage();
    }
  };

  zombieManager.onPlayerRadiationDrain = (drainAmount = 0, proximity = 0) => {
    if (gameState !== 'PLAYING') return;
    if (typeof hud.setRadiationExposure === 'function') {
      hud.setRadiationExposure(proximity);
    }
    if (drainAmount > 0 && player.hp > 0) {
      const remainingHp = player.takeDamage(drainAmount, { punch: false });
      if (typeof hud.setHealth === 'function') {
        hud.setHealth(remainingHp, player.maxHp);
      }
      if (remainingHp <= 0) {
        sound.playPlayerHit?.(true);
        handlePlayerFatalDamage();
      }
    }
  };

  zombieManager.onPlayerRadiationBurst = (burstDamage = 28) => {
    if (gameState !== 'PLAYING' || player.hp <= 0) return;
    const remainingHp = player.takeDamage(burstDamage, {
      punch: true,
      punchPitch: 0.095,
      punchRoll: 0.16,
    });
    if (typeof hud.setHealth === 'function') {
      hud.setHealth(remainingHp, player.maxHp);
    }
    if (typeof hud.triggerRadiationBurst === 'function') {
      hud.triggerRadiationBurst();
    }
    if (typeof sound.playHazmatSkillBurst === 'function') {
      sound.playHazmatSkillBurst();
    }
    if (remainingHp <= 0) {
      sound.playPlayerHit?.(true);
      handlePlayerFatalDamage();
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
    if (state !== 'PLAYING' && gunShop && gunShop.isOpen) {
      gunShop.close(false);
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
      if (window.isGunShopOpen) gunShop.close(false);
      if (window.isDevToolsModalOpen) devToolsModal.close();
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
    let crateFrac = 0;
    let medkitFrac = 0;
    let heroFrac = 0;
    const syncAssetProgress = (statusMsg) => {
      const weighted = 10 + (0.08 * audioFrac + 0.41 * modelFrac + 0.40 * zombieFrac + 0.04 * crateFrac + 0.03 * medkitFrac + 0.04 * heroFrac) * 76;
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

    // 3b. Parallel loading: Animated Military Supply Crate GLB (downscales 4K maps -> 1024px)
    const cratePromise = warehouse.loadMilitaryCrate((fraction) => {
      crateFrac = fraction;
      syncAssetProgress('LOADING SUPPLY CRATE...');
    });

    // 3c. Parallel loading: First Aid Medkit GLB (downscales >1024px maps -> 1024px)
    const medkitPromise = gunShop && typeof gunShop.loadMedkitModel === 'function'
      ? gunShop.loadMedkitModel((fraction) => {
          medkitFrac = fraction;
          syncAssetProgress('LOADING MEDICAL SUPPLIES...');
        })
      : Promise.resolve(null);

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

    await Promise.all([audioPromise, modelsPromise, zombiePromise, cratePromise, medkitPromise, heroImagePromise]);
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
      if (gunShop && typeof gunShop.prewarm === 'function') {
        gunShop.prewarm();
      }
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
        hud.updateDamageVignette(delta, player.hp, player.maxHp);
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

      // 2b. Safe Zone detection (Maintenance Closet): real-time disarmament + zombie patrol de-aggro
      const inSafeCloset = Boolean(
        warehouse &&
        typeof warehouse.isPlayerInMaintenanceCloset === 'function' &&
        warehouse.isPlayerInMaintenanceCloset(player.position)
      );
      if (inSafeCloset) {
        onEnterSafeZone();
      } else {
        onExitSafeZone();
      }

      // 3. Viewmodel springs (recoil, sway, ADS, bob)
      viewmodel.update(delta, player.velocity, player.isGrounded);

      // 4. Weapon hitscan, firing logic, decals, tracers
      weaponSystem.update(delta);

      // 4b. Opening gameplay sequence state machine (tutorial fade-in, phone ringing, proximity pickup)
      introSequence.update(delta, gameState);

      // 4c. Wave zombie AI, radiation aura, blood decals/droplets & edge vignette pulse (always live at 60 FPS)
      zombieManager.update(delta, gameState, isPlayerInSafeZone);
      decalManager.update(delta);
      hud.updateDamageVignette(delta, player.hp, player.maxHp);
      if (typeof hud.updateStatusTicker === 'function') {
        hud.updateStatusTicker(delta);
      }
      if (gunShop && gunShop.isOpen) {
        gunShop.update(delta);
      }

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
    playerMoney = 0;
    player.resetHealth();
    hud.resetDamageVignette();
    hud.setGameOverVisible(false);
    if (gunShop && gunShop.isOpen) gunShop.close(false);
    if (gunShop && typeof gunShop.resetStock === 'function') gunShop.resetStock();
    if (weaponWheel && weaponWheel.isOpen) weaponWheel.close(false);
    onExitSafeZone();
    weaponSystem.reset();
    if (typeof hud.setHealth === 'function') hud.setHealth(player.hp, player.maxHp);
    if (typeof hud.setMoney === 'function') hud.setMoney(0, 0);
    if (typeof hud.setKills === 'function') hud.setKills(0);
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

  // Global flags for Unified Master Dev Tools (F7 Lighting, F8 Viewmodel, F9 Zombies) to prevent pause menu interference
  window.isDevToolsModalOpen = false;
  window.isViewmodelTunerOpen = false;
  window.isLightingTunerOpen = false;
  window.isZombieTunerOpen = false;

  input.onUnlock(() => {
    if (
      window.isGunShopOpen ||
      window.isDevToolsModalOpen ||
      window.isViewmodelTunerOpen ||
      window.isLightingTunerOpen ||
      window.isZombieTunerOpen ||
      gameState === 'GAME_OVER'
    ) {
      // Shop/Tuner open or Game Over collapse active: DO NOT open pause menu!
      return;
    }
    if (gameState === 'PLAYING') {
      setGameState('PAUSED');
    }
  });

  // Handle ESC (and F while shop open) to close open shop/tuners or pause cleanly
  window.addEventListener('keydown', (e) => {
    if (window.isGunShopOpen && !e.repeat) {
      if (e.code === 'Escape' || e.key === 'Escape' || e.code === 'KeyF' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        gunShop.close(true);
        return;
      }
    }
    if (e.code === 'Escape' || e.key === 'Escape') {
      if (window.isDevToolsModalOpen) {
        e.preventDefault();
        devToolsModal.close();
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

  // Suppress outside weapon switching (wheel, TAB & 1-8) whenever inside Safe Zone, pointer lock is inactive,
  // gun shop / military crate is open or animating, or a dialogue/tuner modal is active.
  const isOutsideWeaponSwitchBlocked = () =>
    gameState !== 'PLAYING' ||
    isPlayerInSafeZone ||
    Boolean(window.isPlayerInSafeZone) ||
    document.pointerLockElement === null ||
    (gunShop && gunShop.isOpen) ||
    Boolean(window.isGunShopOpen) ||
    Boolean(document.getElementById('hud-gun-shop')?.classList.contains('is-open')) ||
    Boolean(warehouse && warehouse.crateState && warehouse.crateState !== 'CLOSED') ||
    Boolean(
      introSequence &&
      (introSequence.state === 'PHONE_ANSWERED' || introSequence.state === 'SECOND_PHONE_ANSWERED')
    ) ||
    Boolean(window.isDevToolsModalOpen) ||
    Boolean(window.isViewmodelTunerOpen) ||
    Boolean(window.isLightingTunerOpen) ||
    Boolean(window.isZombieTunerOpen);

  // GTA V-style 8-Wedge Radial Weapon Wheel (TAB Hold & Release), 1-8 Quick-Select & KeyR Reload
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.key === 'Tab') {
      e.preventDefault();
      if (e.repeat) return;
      if (isOutsideWeaponSwitchBlocked()) {
        return;
      }
      weaponWheel.open();
      return;
    }

    // Number keys 1-8: completely locked inside Safe Zone / Shop; switches unlocked weapons outside
    const digitMatch = /^Digit([1-8])$/.exec(e.code) || /^Numpad([1-8])$/.exec(e.code);
    const numKey = digitMatch ? digitMatch[1] : (/^[1-8]$/.test(e.key) ? e.key : null);
    if (numKey && !e.repeat) {
      if (isOutsideWeaponSwitchBlocked() || window.isWeaponWheelOpen) {
        return;
      }
      const slotTarget = numKey === '8' ? 'unarmed' : numKey;
      if (weaponSystem.selectWheelSlot(slotTarget) && weaponWheel) {
        weaponWheel.refreshVisuals();
      }
      return;
    }

    if (gameState !== 'PLAYING' || !input.isLocked || document.pointerLockElement === null) return;
    if (isPlayerInSafeZone || window.isPlayerInSafeZone || window.isWeaponWheelOpen || window.isGunShopOpen) return;

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
      if (isOutsideWeaponSwitchBlocked()) {
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
