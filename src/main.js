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
  const statusVal = document.getElementById('status-val');
  const uiLayer = document.getElementById('ui-layer');
  const posEl = document.getElementById('stat-pos');
  let lastPosTime = 0;

  const engine = new Engine(canvas);

  const input = new InputManager(canvas);
  const sound = new SoundManager();

  const hud = new HUD();
  const warehouse = new WarehouseBuilder(engine.scene);
  const colliderMesh = warehouse.build();

  const player = new PlayerController(engine.camera, input);
  player.setCollider(warehouse.playerColliderMesh || colliderMesh);
  player.teleport(0, 0.1, -7.0);

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
  weaponSystem.setPlayer(player);
  weaponSystem.setHUD(hud);

  let gameState = 'MENU';
  let hasStartedOnce = false;
  const initialBtnText = startBtnText ? startBtnText.textContent.trim() : 'START';
  const initialStatusText = statusVal ? statusVal.textContent.trim() : 'READY';

  function setGameState(state) {
    gameState = state;
    player.setGameState(state);
    weaponSystem.setGameState(state);

    if (state === 'PLAYING') {
      hasStartedOnce = true;
      startModal.classList.add('hidden');
      if (uiLayer) uiLayer.classList.remove('menu-hidden');
      viewmodel.root.visible = true;
      player.updateBobAndCamera(0);
    } else {
      startModal.classList.remove('hidden');
      if (uiLayer) uiLayer.classList.add('menu-hidden');
      viewmodel.root.visible = false;
      input.clearInputs();

      if (startBtnText) {
        startBtnText.textContent = hasStartedOnce
          ? 'RESUME'
          : initialBtnText;
      }
      if (statusVal) {
        if (hasStartedOnce) {
          statusVal.textContent = 'PAUSED';
          statusVal.classList.add('paused');
          statusVal.style.color = '#f59e0b';
        } else {
          statusVal.textContent = initialStatusText;
          statusVal.classList.remove('paused');
          statusVal.style.color = '';
        }
      }
    }
  }

  // Initial menu state: hide HUD and gun viewmodel
  setGameState('MENU');

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
      if (gameState === 'MENU') {
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

  startBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  startBtn.addEventListener('mouseup', (e) => e.stopPropagation());
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sound.resume();
    setGameState('PLAYING');
    input.requestLock();
  });

  input.onLock(() => {
    sound.resume();
    setGameState('PLAYING');
  });

  input.onUnlock(() => {
    setGameState('MENU');
  });

  // Direct fail-safe KeyR reload binding (strictly blocked when not playing)
  window.addEventListener('keydown', (e) => {
    if (gameState !== 'PLAYING' || !input.isLocked || document.pointerLockElement === null) return;
    if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
      if (weaponSystem.currentAmmo < weaponSystem.maxAmmo && !weaponSystem.isReloading) {
        weaponSystem.startReload();
      }
    }
  });

  // Expose for testing & debug
  window.weaponSystem = weaponSystem;
  window.viewmodel = viewmodel;
  window.hud = hud;
  window.setGameState = setGameState;

  engine.start();
});
