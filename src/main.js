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

  const engine = new Engine(canvas);

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
        statusVal.textContent = 'READY';
        statusVal.classList.remove('paused');
        statusVal.style.color = '';
      }
      // If returning from PAUSED (via EXIT), keep playing seamlessly without restarting;
      // if music was paused or not yet playing, resume it
      if (sound.menuMusic && sound.menuMusic.paused) {
        sound.resumeMenuMusic(0);
      }
    }
  }

  // Initial menu state: hide HUD and gun viewmodel
  setGameState('MAIN_MENU');

  // Attempt autoplay immediately on initial load (MAIN_MENU)
  sound.startMenuMusic().catch(() => {
    // Autoplay blocked by browser policy: attach one-time gesture listeners on window
    const onFirstGesture = (e) => {
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
    sound.resume();
    sound.playStartClick();
    setGameState('PLAYING');
    input.requestLock();
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
      player.reset(0, 0.1, -7.0, Math.PI, 0);
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

  input.onUnlock(() => {
    if (gameState === 'PLAYING') {
      setGameState('PAUSED');
    }
  });

  // Handle ESC or KeyP to guarantee pause triggering even in headless/synthetic event environments
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.key === 'Escape' || e.code === 'KeyP') {
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
      weaponSystem.switchWeapon('pistol');
      return;
    }
    if (e.code === 'Digit2' || e.key === '2') {
      weaponSystem.switchWeapon('shotgun');
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
