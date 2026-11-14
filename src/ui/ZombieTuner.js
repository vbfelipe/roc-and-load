import { WALK_CALIBRATION } from '../enemies/ZombieEnemy.js';

/**
 * ZombieTuner.js
 *
 * In-Game F9 Zombie Test Tuner overlay (styled cleanly like F8 ViewmodelTuner):
 * - Toggle test zombies (ZombieWoman + ZombieMan) on/off
 * - Cycle / jump between Idle -> Walk -> Run -> Attack -> Death
 * - Live Walk Locomotion Calibration (Foot-Lock Pinning, Walk timeScale, Stride Pin Multiplier)
 * - Trigger or reset the 6-Zombie Stairwell Wave (4 ZombieWoman + 2 ZombieMan) immediately
 * - Toggle visible wireframe rendering on headHitbox & bodyHitbox colliders
 */
export class ZombieTuner {
  constructor(engine, zombieManager = null, weaponSystem = null) {
    this.engine = engine;
    this.zombieManager = zombieManager;
    this.weaponSystem = weaponSystem;
    this.overlay = null;
    this.isOpen = false;
    this._currentTestAnim = 'Idle';

    this._createDOM();
    this._attachKeyListeners();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (typeof window !== 'undefined' && typeof window.getGameState === 'function') {
      const gs = window.getGameState();
      if (gs === 'MAIN_MENU' || gs === 'GAME_OVER') return;
    }

    this.isOpen = true;
    window.isZombieTunerOpen = true;
    if (window.__rocTuner?.isOpen) {
      window.__rocTuner.close();
    }
    if (window.__rocViewmodelTuner?.isOpen) {
      window.__rocViewmodelTuner.close();
    }
    if (this.overlay) {
      this.overlay.style.display = 'block';
    }
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    const startModal = document.getElementById('start-modal');
    if (startModal) {
      startModal.classList.add('hidden');
    }
    this.refresh();
  }

  close() {
    this.isOpen = false;
    window.isZombieTunerOpen = false;
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    const canvas = document.getElementById('game-canvas');
    const gs = typeof window.getGameState === 'function' ? window.getGameState() : 'PLAYING';
    if (
      gs === 'PLAYING' &&
      canvas &&
      canvas.requestPointerLock &&
      !window.__rocTuner?.isOpen &&
      !window.__rocViewmodelTuner?.isOpen
    ) {
      canvas.requestPointerLock();
    }
  }

  _createDOM() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const stale = document.getElementById('zombie-tuner-overlay');
    if (stale) stale.remove();

    const overlay = document.createElement('div');
    overlay.id = 'zombie-tuner-overlay';
    overlay.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 16px;
      width: 320px;
      background: rgba(15, 20, 28, 0.96);
      border: 1px solid #4a5568;
      border-radius: 8px;
      padding: 12px;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
      font-size: 11px;
      z-index: 99999;
      display: none;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.75);
      pointer-events: auto;
      user-select: none;
    `;

    overlay.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #2d3748; padding-bottom:6px;">
        <strong style="color:#63b3ed; font-size:12px;">Zombie Test Tuner (F9)</strong>
        <span id="zt-status-badge" style="color:#f6ad55; font-weight:bold; font-size:10px; text-transform:uppercase;">TEST: OFF</span>
      </div>

      <div style="margin-bottom:6px;">
        <button id="zt-unlock-all-btn" style="width:100%; padding:6px 4px; background:linear-gradient(90deg, #d69e2e, #b7791f); color:#fff; border:1px solid #f6e05e; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold; letter-spacing:0.4px;">[Unlock All 7 Weapons in TAB Wheel]</button>
      </div>

      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <button id="zt-toggle-test-btn" style="flex:1; padding:6px 4px; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Test Zombies: OFF</button>
        <button id="zt-hitbox-btn" style="flex:1; padding:6px 4px; background:#4a5568; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Hitboxes: OFF</button>
      </div>

      <div style="margin-bottom:4px; color:#f6ad55; font-size:10px; font-weight:bold; letter-spacing:0.5px;">TEST ANIMATIONS</div>
      <div style="display:flex; gap:4px; margin-bottom:6px;">
        <button id="zt-cycle-anim-btn" style="flex:1; padding:5px 4px; background:#805ad5; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Cycle Anim: Idle</button>
      </div>
      <div id="zt-anim-row" style="display:flex; gap:4px; margin-bottom:10px;">
        <button data-anim="Idle" style="flex:1; padding:4px 2px; background:#3182ce; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px;">Idle</button>
        <button data-anim="Walk" style="flex:1; padding:4px 2px; background:#2d3748; color:#cbd5e0; border:none; border-radius:4px; cursor:pointer; font-size:10px;">Walk</button>
        <button data-anim="Run" style="flex:1; padding:4px 2px; background:#2d3748; color:#cbd5e0; border:none; border-radius:4px; cursor:pointer; font-size:10px;">Run</button>
        <button data-anim="Attack" style="flex:1; padding:4px 2px; background:#2d3748; color:#cbd5e0; border:none; border-radius:4px; cursor:pointer; font-size:10px;">Attack</button>
        <button data-anim="Death" style="flex:1; padding:4px 2px; background:#2d3748; color:#cbd5e0; border:none; border-radius:4px; cursor:pointer; font-size:10px;">Death</button>
      </div>

      <div style="margin-bottom:4px; padding-top:6px; border-top:1px solid #2d3748; color:#f6ad55; font-size:10px; font-weight:bold; letter-spacing:0.5px;">WALK LOCOMOTION CALIBRATION</div>
      <div style="margin-bottom:6px;">
        <button id="zt-footpin-btn" style="width:100%; padding:5px 6px; background:#2f855a; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Foot-Lock Pinning: ON</button>
      </div>
      <div style="margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; color:#cbd5e0; font-size:10px; margin-bottom:2px;">
          <span>Walk Anim Speed (timeScale)</span>
          <span id="zt-walk-ts-val" style="color:#63b3ed; font-weight:bold;">1.18</span>
        </div>
        <input id="zt-walk-ts-slider" type="range" min="0.70" max="1.80" step="0.02" value="1.18" style="width:100%; accent-color:#63b3ed; cursor:pointer;" />
      </div>
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; color:#cbd5e0; font-size:10px; margin-bottom:2px;">
          <span>Stride Scale / Pin Multiplier</span>
          <span id="zt-pin-mult-val" style="color:#63b3ed; font-weight:bold;">1.00</span>
        </div>
        <input id="zt-pin-mult-slider" type="range" min="0.60" max="1.50" step="0.02" value="1.00" style="width:100%; accent-color:#63b3ed; cursor:pointer;" />
      </div>

      <div style="margin-bottom:4px; padding-top:6px; border-top:1px solid #2d3748; color:#f6ad55; font-size:10px; font-weight:bold; letter-spacing:0.5px;">WAVE 1 STAIRWELL HORDE</div>
      <div style="display:flex; gap:6px; margin-bottom:10px;">
        <button id="zt-wave-trigger-btn" style="flex:1; padding:6px 4px; background:#c53030; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Trigger Wave 1</button>
        <button id="zt-wave-reset-btn" style="flex:1; padding:6px 4px; background:#4a5568; color:#e2e8f0; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Reset Wave 1</button>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding-top:6px; border-top:1px solid #2d3748;">
        <span id="zt-wave-info" style="color:#a0aec0; font-size:10px;">Wave 1: Idle</span>
        <button id="zt-close-btn" style="padding:5px 12px; background:#4a5568; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Close</button>
      </div>
    `;

    // Prevent clicks inside panel from leaking to canvas pointerlock
    overlay.addEventListener('mousedown', (e) => e.stopPropagation());
    overlay.addEventListener('mouseup', (e) => e.stopPropagation());
    overlay.addEventListener('click', (e) => e.stopPropagation());

    document.body.appendChild(overlay);
    this.overlay = overlay;

    overlay.querySelector('#zt-close-btn').onclick = () => this.close();

    const unlockAllBtn = overlay.querySelector('#zt-unlock-all-btn');
    if (unlockAllBtn) {
      unlockAllBtn.onclick = () => {
        const ws = this.weaponSystem || window.__rocWeaponSystem || window.weaponSystem;
        if (ws && typeof ws.unlockAllWeapons === 'function') {
          ws.unlockAllWeapons();
        }
        if (window.__rocWeaponWheel && typeof window.__rocWeaponWheel.refreshVisuals === 'function') {
          window.__rocWeaponWheel.refreshVisuals();
        }
        unlockAllBtn.textContent = '✓ All 7 Weapons Unlocked in TAB!';
        unlockAllBtn.style.background = '#2f855a';
        setTimeout(() => {
          unlockAllBtn.textContent = '[Unlock All 7 Weapons in TAB Wheel]';
          unlockAllBtn.style.background = 'linear-gradient(90deg, #d69e2e, #b7791f)';
        }, 1600);
      };
    }

    overlay.querySelector('#zt-toggle-test-btn').onclick = () => {
      if (!this.engine) return;
      const next = !this.engine.testZombiesVisible;
      const sound = this.zombieManager?.sound || null;
      this.engine.setTestZombiesVisible(next);
      if (next && this.engine.enemies) {
        for (const e of this.engine.enemies) {
          if (e) e.playTestAnimation(this._currentTestAnim, sound);
        }
      } else if (!next && sound && typeof sound.stopZombieVocal === 'function') {
        for (const e of this.engine.enemies || []) {
          if (e) sound.stopZombieVocal(e, 0.02);
        }
      }
      this.refresh();
    };

    overlay.querySelector('#zt-hitbox-btn').onclick = () => {
      if (!this.zombieManager) return;
      this.zombieManager.setHitboxesVisible(!this.zombieManager.hitboxesVisible);
      this.refresh();
    };

    overlay.querySelector('#zt-cycle-anim-btn').onclick = () => {
      if (!this.engine) return;
      if (!this.engine.testZombiesVisible) {
        this.engine.setTestZombiesVisible(true);
      }
      const states = ['Idle', 'Walk', 'Run', 'Attack', 'Death'];
      const next = states[(states.indexOf(this._currentTestAnim) + 1) % states.length];
      this._currentTestAnim = next;
      const sound = this.zombieManager?.sound || null;
      for (const e of this.engine.enemies || []) {
        if (e) e.playTestAnimation(next, sound);
      }
      this.refresh();
    };

    overlay.querySelectorAll('#zt-anim-row button[data-anim]').forEach((btn) => {
      btn.onclick = () => {
        if (!this.engine) return;
        const anim = btn.getAttribute('data-anim');
        this._currentTestAnim = anim;
        if (!this.engine.testZombiesVisible) {
          this.engine.setTestZombiesVisible(true);
        }
        const sound = this.zombieManager?.sound || null;
        for (const e of this.engine.enemies || []) {
          if (e) e.playTestAnimation(anim, sound);
        }
        this.refresh();
      };
    });

    overlay.querySelector('#zt-footpin-btn').onclick = () => {
      WALK_CALIBRATION.footLockPinning = !WALK_CALIBRATION.footLockPinning;
      if (this.zombieManager && typeof this.zombieManager.applyWalkCalibration === 'function') {
        this.zombieManager.applyWalkCalibration();
      }
      this.refresh();
    };

    const walkTsSlider = overlay.querySelector('#zt-walk-ts-slider');
    walkTsSlider.addEventListener('input', (e) => {
      WALK_CALIBRATION.walkTimeScale = parseFloat(e.target.value) || 1.18;
      if (this.zombieManager && typeof this.zombieManager.applyWalkCalibration === 'function') {
        this.zombieManager.applyWalkCalibration();
      }
      this.refresh();
    });

    const pinMultSlider = overlay.querySelector('#zt-pin-mult-slider');
    pinMultSlider.addEventListener('input', (e) => {
      WALK_CALIBRATION.pinMultiplier = parseFloat(e.target.value) || 1.00;
      if (this.zombieManager && typeof this.zombieManager.applyWalkCalibration === 'function') {
        this.zombieManager.applyWalkCalibration();
      }
      this.refresh();
    });

    overlay.querySelector('#zt-wave-trigger-btn').onclick = () => {
      if (this.zombieManager) {
        this.zombieManager.triggerWave1();
      }
      this.refresh();
    };

    overlay.querySelector('#zt-wave-reset-btn').onclick = () => {
      if (this.zombieManager) {
        this.zombieManager.resetWave1();
      }
      this.refresh();
    };
  }

  _attachKeyListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F9' || e.key === 'F9') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  refresh() {
    if (!this.overlay) return;

    const testOn = !!(this.engine && this.engine.testZombiesVisible);
    const hbOn = !!(this.zombieManager && this.zombieManager.hitboxesVisible);

    const badge = this.overlay.querySelector('#zt-status-badge');
    if (badge) {
      badge.textContent = testOn ? 'TEST: ON' : 'TEST: OFF';
      badge.style.color = testOn ? '#68d391' : '#f6ad55';
    }

    const testBtn = this.overlay.querySelector('#zt-toggle-test-btn');
    if (testBtn) {
      testBtn.textContent = testOn ? 'Test Zombies: ON' : 'Test Zombies: OFF';
      testBtn.style.background = testOn ? '#2f855a' : '#2b6cb0';
    }

    const hbBtn = this.overlay.querySelector('#zt-hitbox-btn');
    if (hbBtn) {
      hbBtn.textContent = hbOn ? 'Hitboxes: ON' : 'Hitboxes: OFF';
      hbBtn.style.background = hbOn ? '#d69e2e' : '#4a5568';
    }

    const cycleBtn = this.overlay.querySelector('#zt-cycle-anim-btn');
    if (cycleBtn) {
      cycleBtn.textContent = `Cycle Anim: ${this._currentTestAnim}`;
    }

    this.overlay.querySelectorAll('#zt-anim-row button[data-anim]').forEach((btn) => {
      const anim = btn.getAttribute('data-anim');
      const active = anim === this._currentTestAnim;
      btn.style.background = active ? '#3182ce' : '#2d3748';
      btn.style.color = active ? '#ffffff' : '#cbd5e0';
    });

    const footPinBtn = this.overlay.querySelector('#zt-footpin-btn');
    if (footPinBtn) {
      const pinOn = !!WALK_CALIBRATION.footLockPinning;
      footPinBtn.textContent = pinOn ? 'Foot-Lock Pinning: ON' : 'Foot-Lock Pinning: OFF';
      footPinBtn.style.background = pinOn ? '#2f855a' : '#4a5568';
    }

    const walkTsVal = this.overlay.querySelector('#zt-walk-ts-val');
    const walkTsSlider = this.overlay.querySelector('#zt-walk-ts-slider');
    if (walkTsVal) walkTsVal.textContent = WALK_CALIBRATION.walkTimeScale.toFixed(2);
    if (walkTsSlider) walkTsSlider.value = WALK_CALIBRATION.walkTimeScale.toFixed(2);

    const pinMultVal = this.overlay.querySelector('#zt-pin-mult-val');
    const pinMultSlider = this.overlay.querySelector('#zt-pin-mult-slider');
    if (pinMultVal) pinMultVal.textContent = WALK_CALIBRATION.pinMultiplier.toFixed(2);
    if (pinMultSlider) pinMultSlider.value = WALK_CALIBRATION.pinMultiplier.toFixed(2);

    const info = this.overlay.querySelector('#zt-wave-info');
    if (info && this.zombieManager) {
      if (!this.zombieManager.waveActive) {
        info.textContent = 'Wave 1: Standby';
      } else {
        const total = this.zombieManager.waveZombies.length || 6;
        const alive = this.zombieManager.waveZombies.filter((z) => z && !z.isDead).length;
        info.textContent = `Wave 1 Active: ${alive}/${total} Alive`;
      }
    }
  }
}

