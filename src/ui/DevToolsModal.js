import * as THREE from 'three';
import { WALK_CALIBRATION, HAZMAT_RADIATION_CONFIG } from '../enemies/ZombieEnemy.js';

const WEAPON_SLOTS = [
  { id: 'unarmed', label: '0: Hands', legendary: false },
  { id: 'hk_usp', label: '1: USP', legendary: false },
  { id: 'desert_eagle', label: '2: .50 AE', legendary: false },
  { id: 'shotgun', label: '3: 12G', legendary: false },
  { id: 'hk_mp5', label: '4: MP5', legendary: false },
  { id: 'colt_peacemaker', label: '5: Colt', legendary: false },
  { id: 'mac_10', label: '6: MAC-10 ★', legendary: true },
  { id: 'akms_gold', label: '7: AK 47 ★', legendary: true },
  { id: 'm134_minigun', label: '8: Minigun ★', legendary: true },
];

const LIGHTING_SLIDERS = [
  { key: 'hemi', label: 'Ambient Fill (Hemi)', min: 0.1, max: 2.0, step: 0.05 },
  { key: 'key', label: 'Overhead Key Light', min: 0.0, max: 2.5, step: 0.05 },
  { key: 'ceiling', label: 'Ceiling Troffer Glow', min: 0.0, max: 3.0, step: 0.1 },
  { key: 'exposure', label: 'Tone Mapping Exposure', min: 0.3, max: 2.0, step: 0.05 },
];

/**
 * DevToolsModal.js
 *
 * Unified Master Dev Tools Modal (replaces separate F7 Lighting, F8 Viewmodel, and F9 Zombie overlays).
 * - F7 opens/toggles Tab 1 (Lighting)
 * - F8 opens/toggles Tab 2 (Viewmodel / Guns)
 * - F9 toggles Master Modal (or closes cleanly from any active tab)
 * - Preserves `window.lights` browser console API and Pointer Lock / Safe Zone guarantees.
 */
export class DevToolsModal {
  constructor({
    engine = null,
    warehouse = null,
    viewmodel = null,
    weaponSystem = null,
    zombieManager = null,
    player = null,
    hud = null,
    input = null,
    onCheatDeath = null,
  } = {}) {
    this.engine = engine;
    this.warehouse = warehouse;
    this.viewmodel = viewmodel;
    this.weaponSystem = weaponSystem;
    this.zombieManager = zombieManager;
    this.player = player;
    this.hud = hud;
    this.input = input;
    this.onCheatDeath = onCheatDeath;

    this.overlay = null;
    this.isOpen = false;
    this.isDocked = false;
    this.activeTab = 'zombies'; // 'lighting' | 'viewmodel' | 'zombies'

    this._currentTestAnim = 'Idle';
    this._activeLightingPreset = 'balanced';
    this._wavePollId = null;

    this.lightingPresets = {
      default: { label: 'Current Defaults', hemi: 0.90, key: 0.90, ceiling: 0.00, exposure: 0.90 },
      balanced: { label: 'Balanced Night', hemi: 0.90, key: 0.90, ceiling: 0.00, exposure: 0.90 },
      dim: { label: 'Dim & Moody', hemi: 0.65, key: 0.70, ceiling: 0.00, exposure: 0.85 },
      bright: { label: 'Bright Office', hemi: 1.10, key: 1.20, ceiling: 0.50, exposure: 1.00 },
    };

    if (this.viewmodel) {
      this.viewmodel.onTunerSync = () => {
        if (this.isOpen && this.activeTab === 'viewmodel') {
          this.refreshViewmodelTab();
        }
      };
    }

    this._createDOM();
    this._setupConsoleAPI();
    this._attachKeyListeners();
  }

  // =========================================================================
  // LIGHTING API & CONSOLE CONTROLS (Preserves `window.lights`)
  // =========================================================================

  get lightingValues() {
    return {
      hemi: this.engine?.hemiLight ? Number(this.engine.hemiLight.intensity.toFixed(2)) : 0.90,
      key: this.engine?.keyLight ? Number(this.engine.keyLight.intensity.toFixed(2)) : 0.90,
      ceiling: this.warehouse?.ceilingMaterial ? Number(this.warehouse.ceilingMaterial.emissiveIntensity.toFixed(2)) : 0.00,
      exposure: this.engine?.renderer ? Number(this.engine.renderer.toneMappingExposure.toFixed(2)) : 0.90,
    };
  }

  setHemi(val) {
    if (!this.engine?.hemiLight) return;
    this.engine.hemiLight.intensity = Math.max(0, Number(val) || 0);
    this._syncLightingSlider('hemi', this.engine.hemiLight.intensity);
  }

  setKey(val) {
    if (!this.engine?.keyLight) return;
    this.engine.keyLight.intensity = Math.max(0, Number(val) || 0);
    this._syncLightingSlider('key', this.engine.keyLight.intensity);
  }

  setCeiling(val) {
    if (!this.warehouse?.ceilingMaterial) return;
    const nextVal = Math.max(0, Number(val) || 0);
    const mat = this.warehouse.ceilingMaterial;
    const wantMap = nextVal > 0 ? (this.warehouse.ceilingEmissiveTexture || null) : null;
    if (mat.emissiveMap !== wantMap) {
      mat.emissiveMap = wantMap;
      mat.needsUpdate = true;
    }
    mat.emissiveIntensity = nextVal;
    this._syncLightingSlider('ceiling', mat.emissiveIntensity);
  }

  setExposure(val) {
    if (!this.engine?.renderer) return;
    this.engine.renderer.toneMappingExposure = Math.max(0.1, Number(val) || 0.9);
    this._syncLightingSlider('exposure', this.engine.renderer.toneMappingExposure);
  }

  applyLightingPreset(name) {
    const p = this.lightingPresets[name];
    if (!p) {
      console.warn(`[DevToolsModal] Unknown lighting preset "${name}". Valid: ${Object.keys(this.lightingPresets).join(', ')}`);
      return;
    }
    this._activeLightingPreset = name === 'default' ? 'balanced' : name;
    this.setHemi(p.hemi);
    this.setKey(p.key);
    this.setCeiling(p.ceiling);
    this.setExposure(p.exposure);
    this._refreshLightingPresetButtons();
    console.log(`[LightingTuner] Applied preset "${p.label}":`, this.lightingValues);
  }

  _setupConsoleAPI() {
    if (typeof window === 'undefined') return;
    const self = this;
    const api = {
      help() {
        console.log(
          `%c===========================================\n%c ROC & LOAD - LIGHTING TUNER CONSOLE API\n%c===========================================\n%c\nCommands:\n  lights.ambient(val)     // Set Ambient Fill (default: 0.9)\n  lights.key(val)         // Set Main Overhead Key (default: 0.9)\n  lights.ceiling(val)     // Set Ceiling Troffer Glow (default: 0.0)\n  lights.exposure(val)    // Set Tone Mapping Exposure (default: 0.9)\n  lights.preset('name')   // 'default' | 'balanced' | 'dim' | 'bright'\n  lights.open()           // Open Master Dev Tools (Lighting tab)\n  lights.close()          // Close Master Dev Tools\n  lights.status()         // Print current values table`,
          'color:#60a5fa; font-weight:bold;',
          'color:#38bdf8; font-weight:bold;',
          'color:#60a5fa; font-weight:bold;',
          'color:#e2e8f0; font-family:monospace;'
        );
        return self.lightingValues;
      },
      status() {
        console.table(self.lightingValues);
        return self.lightingValues;
      },
      ambient: (v) => self.setHemi(v),
      hemi: (v) => self.setHemi(v),
      key: (v) => self.setKey(v),
      ceiling: (v) => self.setCeiling(v),
      exposure: (v) => self.setExposure(v),
      preset: (name) => self.applyLightingPreset(name),
      open: () => self.open('lighting'),
      close: () => self.close(),
      toggle: () => self.toggle('lighting'),
      get values() {
        return self.lightingValues;
      },
    };

    window.lights = api;
    window.light = api;
    window.lighting = api;
    window.__rocLights = api;
    if (this.engine) this.engine.lights = api;

    setTimeout(() => {
      console.log(
        '%c[rocAndLoad] %cMaster Dev Tools Ready! Press %cF9%c in-game, or type %clights.help()%c in console.',
        'color:#38bdf8; font-weight:bold;',
        'color:#94a3b8;',
        'color:#f59e0b; font-weight:bold;',
        'color:#94a3b8;',
        'color:#38bdf8; font-weight:bold;',
        'color:#94a3b8;'
      );
    }, 1500);
  }

  // =========================================================================
  // MODAL LIFECYCLE & POINTER LOCK MANAGEMENT
  // =========================================================================

  _isSafeZoneEnforced() {
    const ws = this.weaponSystem || window.__rocWeaponSystem || window.weaponSystem;
    return Boolean(window.isPlayerInSafeZone || ws?.isSafeZoneLocked);
  }

  _canOpen() {
    if (typeof window === 'undefined') return false;
    const gs = typeof window.getGameState === 'function' ? window.getGameState() : 'PLAYING';
    if (gs === 'GAME_OVER') return false;
    if (window.isGunShopOpen || document.getElementById('hud-gun-shop')?.classList.contains('is-open')) return false;
    if (window.isWeaponWheelOpen) return false;
    return true;
  }

  toggle(requestedTab = null) {
    if (!this.isOpen) {
      this.open(requestedTab || this.activeTab);
      return;
    }
    if (requestedTab && requestedTab !== this.activeTab) {
      this.setTab(requestedTab);
    } else {
      this.close();
    }
  }

  open(tabName = null) {
    if (!this._canOpen()) return;

    this.isOpen = true;
    window.isDevToolsModalOpen = true;

    if (typeof document !== 'undefined' && document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch (e) {}
    }

    const startModal = typeof document !== 'undefined' ? document.getElementById('start-modal') : null;
    if (startModal) {
      startModal.classList.add('hidden');
    }

    if (this.overlay) {
      this.overlay.classList.add('is-open');
    }

    const p = this.player || this.zombieManager?.player || window.__rocPlayer || window.player;
    this._syncGodModeBtn?.(Boolean(p?.isGodMode));

    this.setTab(tabName || this.activeTab);

    if (this._wavePollId === null && typeof window !== 'undefined') {
      this._wavePollId = window.setInterval(() => {
        if (this.isOpen && this.activeTab === 'zombies') {
          this._refreshWaveStatusOnly();
        }
      }, 250);
    }
  }

  close() {
    if (!this.isOpen) return;

    this.isOpen = false;
    window.isDevToolsModalOpen = false;
    window.isLightingTunerOpen = false;
    window.isViewmodelTunerOpen = false;
    window.isZombieTunerOpen = false;

    if (this._wavePollId !== null) {
      clearInterval(this._wavePollId);
      this._wavePollId = null;
    }

    this._cleanupViewmodelPreviewState();

    if (this.overlay) {
      this.overlay.classList.remove('is-open', 'is-peeking');
    }

    this.input?.clearInputs?.();

    const gs = typeof window.getGameState === 'function' ? window.getGameState() : 'PLAYING';
    if (gs === 'MAIN_MENU' || gs === 'PAUSED') {
      const startModal = document.getElementById('start-modal');
      if (startModal) startModal.classList.remove('hidden');
      return;
    }

    if (gs === 'PLAYING') {
      if (this.input && typeof this.input.requestLock === 'function') {
        this.input.requestLock();
      } else {
        const canvas = document.getElementById('game-canvas');
        if (canvas?.requestPointerLock) {
          canvas.requestPointerLock();
        }
      }
    }
  }

  setTab(tabName) {
    const valid = tabName === 'lighting' || tabName === 'viewmodel' || tabName === 'zombies'
      ? tabName
      : 'zombies';

    const wasViewmodel = this.activeTab === 'viewmodel';
    this.activeTab = valid;

    window.isLightingTunerOpen = this.isOpen && valid === 'lighting';
    window.isViewmodelTunerOpen = this.isOpen && valid === 'viewmodel';
    window.isZombieTunerOpen = this.isOpen && valid === 'zombies';

    if (wasViewmodel && valid !== 'viewmodel') {
      this._cleanupViewmodelPreviewState();
    }

    if (this.overlay) {
      this.overlay.querySelectorAll('.devtools-tab-btn[data-tab]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-tab') === valid);
      });
      this.overlay.querySelectorAll('.devtools-tab-panel[data-panel]').forEach((panel) => {
        panel.classList.toggle('is-active', panel.getAttribute('data-panel') === valid);
      });
    }

    if (valid === 'lighting') {
      this.refreshLightingTab();
    } else if (valid === 'viewmodel') {
      if (this.viewmodel?.root && typeof window.getGameState === 'function' && window.getGameState() === 'PLAYING') {
        this.viewmodel.root.visible = true;
      }
      this.refreshViewmodelTab();
    } else {
      this.refreshZombiesTab();
    }
  }

  _cleanupViewmodelPreviewState() {
    if (this.viewmodel) {
      this.viewmodel.tunerForceADS = null;
      if (typeof this.viewmodel.setADS === 'function') {
        this.viewmodel.setADS(false);
      }
    }
    const ws = this.weaponSystem || window.__rocWeaponSystem || window.weaponSystem;
    if (ws && this.viewmodel) {
      if (this._isSafeZoneEnforced() || ws.isUnarmed) {
        this.viewmodel.setUnarmed(true);
      } else if (!ws.isWeaponUnlocked(ws.currentWeapon)) {
        const fallback = [...(ws.unlockedWeapons || [])][0];
        if (fallback) {
          ws.switchWeapon(fallback, true, { silent: true });
        } else {
          this.viewmodel.setUnarmed(true);
        }
      } else if (ws.currentWeapon && this.viewmodel.currentWeapon !== ws.currentWeapon) {
        this.viewmodel.switchWeapon(ws.currentWeapon, { silent: true, force: true });
      }
    }
  }

  refreshAll() {
    this.refreshLightingTab();
    this.refreshViewmodelTab();
    this.refreshZombiesTab();
  }

  // =========================================================================
  // DOM CONSTRUCTION
  // =========================================================================

  _createDOM() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const existing = document.getElementById('dev-tools-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'dev-tools-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Master Dev Tools');

    modal.innerHTML = `
      <div class="devtools-shell">
        <div class="devtools-header">
          <div class="devtools-header-top">
            <div class="devtools-title">DEV TOOLS <span class="devtools-title-key">[F9]</span></div>
            <button id="dt-close-btn" type="button" class="gunshop-close-btn devtools-close-pin" aria-label="Fechar">✕</button>
          </div>
          <div class="devtools-header-actions">
            <div class="devtools-dropdown">
              <button id="dt-cheats-btn" type="button" class="devtools-pill-btn" aria-haspopup="true">Cheats ▾</button>
              <div class="devtools-dropdown-menu" role="menu">
                <div class="devtools-dropdown-panel">
                  <button id="dt-unlock-all-btn" type="button" class="devtools-dropdown-item is-gold" role="menuitem">All guns</button>
                  <button id="dt-add-money-btn" type="button" class="devtools-dropdown-item is-emerald" role="menuitem">+ $100k</button>
                  <button id="dt-restore-hp-btn" type="button" class="devtools-dropdown-item is-hp" role="menuitem">Restore HP</button>
                  <button id="dt-death-btn" type="button" class="devtools-dropdown-item is-death" role="menuitem">Death</button>
                  <button id="dt-god-mode-btn" type="button" class="devtools-dropdown-item is-cyan" role="menuitem">God mode</button>
                </div>
              </div>
            </div>
            <button id="dt-dock-btn" type="button" class="devtools-pill-btn">◧ Side</button>
            <button id="dt-peek-btn" type="button" class="devtools-pill-btn">👁 Peek</button>
          </div>
        </div>

        <div class="devtools-tabs" role="tablist">
          <button type="button" class="devtools-tab-btn" data-tab="lighting" role="tab">1. LIGHTING</button>
          <button type="button" class="devtools-tab-btn" data-tab="viewmodel" role="tab">2. VIEWMODEL<span class="dt-tab-long"> / GUNS</span></button>
          <button type="button" class="devtools-tab-btn" data-tab="zombies" role="tab">3. ZOMBIES<span class="dt-tab-long"> &amp; WAVES</span></button>
        </div>

        <div class="devtools-body">
          ${this._buildLightingTabHTML()}
          ${this._buildViewmodelTabHTML()}
          ${this._buildZombiesTabHTML()}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.overlay = modal;

    this._bindHeaderEvents();
    this._bindTabEvents();
    this._bindLightingEvents();
    this._bindViewmodelEvents();
    this._bindZombiesEvents();
    this._bindInputContainment();
  }

  _buildLightingTabHTML() {
    return `
      <div class="devtools-tab-panel" data-panel="lighting">
        <div class="devtools-grid-2">
          <div class="devtools-card">
            <div class="devtools-card-title is-cyan">
              <span>ATMOSPHERE PRESETS</span>
              <span class="devtools-status-pill is-on">3:00 AM OFFICE</span>
            </div>
            <div class="devtools-btn-row" id="dt-lt-presets">
              <button type="button" id="dt-lt-pre-balanced" class="devtools-btn is-active" data-preset="balanced">Default (Ref)</button>
              <button type="button" id="dt-lt-pre-dim" class="devtools-btn" data-preset="dim">Dim Night</button>
              <button type="button" id="dt-lt-pre-bright" class="devtools-btn" data-preset="bright">Bright</button>
            </div>
            <div style="font-size:0.75rem; color:#94a3b8; line-height:1.5;">
              Console API: <code style="color:#7dd3fc;">lights.help()</code> · <code style="color:#7dd3fc;">lights.ambient(0.9)</code> · <code style="color:#7dd3fc;">lights.key(0.9)</code> · <code style="color:#7dd3fc;">lights.exposure(0.9)</code>
            </div>
          </div>

          <div class="devtools-card">
            <div class="devtools-card-title is-cyan"><span>LIVE ILLUMINATION SLIDERS</span></div>
            <div id="dt-lt-sliders" style="display:flex; flex-direction:column; gap:10px;"></div>
          </div>
        </div>

        <div class="devtools-footer">
          <div id="dt-lt-toast" class="devtools-toast"></div>
          <button type="button" id="dt-lt-copy-btn" class="devtools-btn is-primary" style="flex:0 0 auto; min-width:160px;">Copy Values</button>
        </div>
      </div>
    `;
  }

  _buildViewmodelTabHTML() {
    const slotButtons = WEAPON_SLOTS.map((slot) => {
      const cls = slot.legendary ? 'devtools-btn is-legendary' : 'devtools-btn';
      return `<button type="button" class="${cls}" data-vm-slot="${slot.id}" style="min-width:86px;">${slot.label}</button>`;
    }).join('');

    return `
      <div class="devtools-tab-panel" data-panel="viewmodel">
        <div class="devtools-vm-toolbar">
          <div class="devtools-card" style="padding:10px 12px; gap:8px;">
            <div class="devtools-card-title is-cyan">
              <span>ACTIVE ARSENAL RIG</span>
              <span id="dt-vm-weapon-badge" class="devtools-status-pill" style="color:#f59e0b;">H&amp;K USP (9MM)</span>
            </div>
            <div class="devtools-btn-row" id="dt-vm-slot-row">
              ${slotButtons}
              <button type="button" id="dt-vm-ads-btn" class="devtools-btn" style="min-width:96px;">Toggle ADS</button>
            </div>
            <div class="devtools-btn-row">
              <button type="button" id="dt-vm-fire-btn" class="devtools-btn is-amber" style="background:linear-gradient(90deg,#ea580c,#c2410c); border-color:#fb923c;">Test Fire</button>
              <button type="button" id="dt-vm-reload-btn" class="devtools-btn" style="background:#0f766e; border-color:#2dd4bf; color:#f0fdfa;">Test Reload</button>
              <button type="button" id="dt-vm-reset-pose-btn" class="devtools-btn">Reset Pose</button>
            </div>
            <div class="devtools-btn-row" id="dt-vm-mode-row">
              <button type="button" class="devtools-btn is-active" data-vm-mode="HAND RIG">HAND RIG</button>
              <button type="button" class="devtools-btn" data-vm-mode="GUN (HIP)">GUN (HIP)</button>
              <button type="button" class="devtools-btn" data-vm-mode="GUN (ADS)">GUN (ADS)</button>
            </div>
          </div>
        </div>

        <div id="dt-vm-sliders" class="devtools-slider-scroll"></div>

        <div class="devtools-footer">
          <div id="dt-vm-toast" class="devtools-toast"></div>
          <button type="button" id="dt-vm-copy-btn" class="devtools-btn is-primary" style="flex:0 0 auto; min-width:170px;">Copy Transform</button>
        </div>
      </div>
    `;
  }

  _buildZombiesTabHTML() {
    return `
      <div class="devtools-tab-panel" data-panel="zombies">
        <div class="devtools-grid-2">
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div class="devtools-card">
              <div class="devtools-card-title is-cyan">
                <span>TEST DUMMIES &amp; HITBOXES</span>
                <span id="dt-zt-status-badge" class="devtools-status-pill">0/3 ACTIVE</span>
              </div>
              <div class="devtools-btn-row" id="dt-zt-dummy-row">
                <button type="button" class="devtools-btn" data-dummy="woman" style="min-width:72px;">Woman</button>
                <button type="button" class="devtools-btn" data-dummy="man" style="min-width:68px;">Man</button>
                <button type="button" class="devtools-btn" data-dummy="hazmat" style="min-width:86px; color:#fde047; border-color:rgba(250,204,21,0.45);">Hazmat ☢</button>
              </div>
              <div class="devtools-btn-row">
                <button type="button" id="dt-zt-spawn-all-btn" class="devtools-btn is-primary">Spawn All</button>
                <button type="button" id="dt-zt-clear-all-btn" class="devtools-btn">Clear All</button>
                <button type="button" id="dt-zt-hitbox-btn" class="devtools-btn">Hitboxes: OFF</button>
              </div>
            </div>

            <div class="devtools-card">
              <div class="devtools-card-title"><span>ANIMATION STATE DEBUGGER</span></div>
              <button type="button" id="dt-zt-cycle-anim-btn" class="devtools-btn is-purple" style="flex:0 0 auto;">Cycle Anim: Idle</button>
              <div class="devtools-btn-row" id="dt-zt-anim-row">
                <button type="button" class="devtools-btn is-active" data-anim="Idle" style="min-width:54px;">Idle</button>
                <button type="button" class="devtools-btn" data-anim="Walk" style="min-width:54px;">Walk</button>
                <button type="button" class="devtools-btn" data-anim="Run" style="min-width:54px;">Run</button>
                <button type="button" class="devtools-btn" data-anim="Skill" style="min-width:54px; color:#fde047;">Skill</button>
                <button type="button" class="devtools-btn" data-anim="Attack" style="min-width:58px;">Attack</button>
                <button type="button" class="devtools-btn" data-anim="Death" style="min-width:54px;">Death</button>
              </div>
            </div>

            <div class="devtools-card">
              <div class="devtools-card-title">
                <span>STAIRWELL HORDE WAVES</span>
                <span id="dt-zt-wave-info" class="devtools-status-pill" style="color:#cbd5e1;">Standby</span>
              </div>
              <div class="devtools-btn-row">
                <button type="button" id="dt-zt-tutorial-wave-btn" class="devtools-btn is-danger">Tutorial Wave</button>
                <button type="button" id="dt-zt-horde1-btn" class="devtools-btn is-danger">Horda 1</button>
                <button type="button" id="dt-zt-hazmat-wave-btn" class="devtools-btn is-amber">Hazmat Alone</button>
                <button type="button" id="dt-zt-wave-reset-btn" class="devtools-btn">Reset</button>
              </div>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:12px;">
            <div class="devtools-card">
              <div class="devtools-card-title is-yellow">
                <span>HAZMAT RADIATION TUNING</span>
                <button type="button" id="dt-zt-aura-vis-btn" class="devtools-btn" style="flex:0 0 auto; min-width:auto; padding:3px 9px; font-size:0.68rem;">Aura Ring: OFF</button>
              </div>
              <div class="devtools-slider-group">
                <div class="devtools-slider-head">
                  <span>Radiation Aura Radius</span>
                  <span id="dt-zt-rad-radius-val" class="devtools-slider-val is-yellow">6.00 m</span>
                </div>
                <input id="dt-zt-rad-radius-slider" class="devtools-range is-yellow" type="range" min="2.0" max="8.0" step="0.1" value="6.0" />
              </div>
              <div class="devtools-slider-group">
                <div class="devtools-slider-head">
                  <span>Passive Drain (HP/s min)</span>
                  <span id="dt-zt-rad-drain-val" class="devtools-slider-val is-yellow">6.0 HP/s</span>
                </div>
                <input id="dt-zt-rad-drain-slider" class="devtools-range is-yellow" type="range" min="1.0" max="15.0" step="0.5" value="6.0" />
              </div>
              <div class="devtools-slider-group">
                <div class="devtools-slider-head">
                  <span>Skill Burst Damage (%)</span>
                  <span id="dt-zt-rad-burst-val" class="devtools-slider-val is-yellow">30%</span>
                </div>
                <input id="dt-zt-rad-burst-slider" class="devtools-range is-yellow" type="range" min="10" max="60" step="2" value="30" />
              </div>
            </div>

            <div class="devtools-card">
              <div class="devtools-card-title"><span>WALK LOCOMOTION CALIBRATION</span></div>
              <button type="button" id="dt-zt-footpin-btn" class="devtools-btn is-green" style="flex:0 0 auto;">Foot-Lock Pinning: ON</button>
              <div class="devtools-slider-group">
                <div class="devtools-slider-head">
                  <span>Walk Anim Speed (timeScale)</span>
                  <span id="dt-zt-walk-ts-val" class="devtools-slider-val">1.18</span>
                </div>
                <input id="dt-zt-walk-ts-slider" class="devtools-range" type="range" min="0.70" max="1.80" step="0.02" value="1.18" />
              </div>
              <div class="devtools-slider-group">
                <div class="devtools-slider-head">
                  <span>Stride Scale / Pin Multiplier</span>
                  <span id="dt-zt-pin-mult-val" class="devtools-slider-val">1.00</span>
                </div>
                <input id="dt-zt-pin-mult-slider" class="devtools-range" type="range" min="0.60" max="1.50" step="0.02" value="1.00" />
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // EVENT BINDINGS
  // =========================================================================

  _flashButtonSuccess(btn, originalText, successText, durationMs = 1500) {
    if (!btn) return;
    clearTimeout(btn._flashTimer);
    btn.textContent = successText;
    btn.classList.add('is-success');
    btn._flashTimer = setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('is-success');
    }, durationMs);
  }

  _bindHeaderEvents() {
    this.overlay.querySelector('#dt-close-btn').onclick = () => this.close();

    const godModeBtn = this.overlay.querySelector('#dt-god-mode-btn');
    if (godModeBtn) {
      const syncGodModeBtn = (active) => {
        godModeBtn.classList.toggle('is-active', Boolean(active));
        godModeBtn.textContent = active ? 'God mode: ON' : 'God mode';
      };
      this._syncGodModeBtn = syncGodModeBtn;

      godModeBtn.onclick = () => {
        const p = this.player || this.zombieManager?.player || window.__rocPlayer || window.player;
        if (!p) return;
        const next = !p.isGodMode;
        if (typeof p.setGodMode === 'function') {
          p.setGodMode(next);
        } else {
          p.isGodMode = next;
          window.isGodMode = next;
        }
        if (next && this.warehouse && typeof this.warehouse.updateZoneVisibility === 'function' && this.engine?.camera) {
          this.warehouse.updateZoneVisibility(this.engine.camera.position);
        }
        godModeBtn.classList.toggle('is-active', next);
        this._flashButtonSuccess(
          godModeBtn,
          next ? 'God mode: ON' : 'God mode',
          next ? '✓ God mode: ON' : '✓ God mode: OFF'
        );
      };
    }

    const unlockBtn = this.overlay.querySelector('#dt-unlock-all-btn');
    unlockBtn.onclick = () => {
      const ws = this.weaponSystem || window.__rocWeaponSystem || window.weaponSystem;
      if (ws && typeof ws.unlockAllWeapons === 'function') {
        ws.unlockAllWeapons();
      }
      window.__rocWeaponWheel?.refreshVisuals?.();
      if (window.__rocGunShop?.isOpen) {
        window.__rocGunShop.refreshUI();
      }
      this._flashButtonSuccess(unlockBtn, 'All guns', '✓ All guns unlocked!');
    };

    const moneyBtn = this.overlay.querySelector('#dt-add-money-btn');
    moneyBtn.onclick = () => {
      if (typeof window.__rocAddTestMoney === 'function') {
        window.__rocAddTestMoney(100000);
      }
      this._flashButtonSuccess(moneyBtn, '+ $100k', '✓ + $100k added!');
    };

    const restoreHpBtn = this.overlay.querySelector('#dt-restore-hp-btn');
    if (restoreHpBtn) {
      restoreHpBtn.onclick = () => {
        const p = this.player || this.zombieManager?.player || window.__rocPlayer || window.player;
        const h = this.hud || window.hud;
        if (p) {
          if (typeof p.resetHealth === 'function') {
            p.resetHealth();
          } else {
            p.hp = p.maxHp ?? 100;
          }
          h?.setHealth?.(p.hp, p.maxHp ?? 100);
        }
        h?.triggerHealVignette?.();
        this._flashButtonSuccess(restoreHpBtn, 'Restore HP', '✓ HP restored!');
      };
    }

    const deathBtn = this.overlay.querySelector('#dt-death-btn');
    if (deathBtn) {
      deathBtn.onclick = () => {
        if (typeof this.onCheatDeath === 'function') {
          this.onCheatDeath();
        } else if (typeof window.__rocTriggerDeath === 'function') {
          window.__rocTriggerDeath();
        }
      };
    }

    const peekBtn = this.overlay.querySelector('#dt-peek-btn');
    const setPeeking = (on) => this.overlay?.classList.toggle('is-peeking', Boolean(on));
    peekBtn.addEventListener('mouseenter', () => setPeeking(true));
    peekBtn.addEventListener('mouseleave', () => setPeeking(false));
    peekBtn.addEventListener('mousedown', () => setPeeking(true));
    peekBtn.addEventListener('mouseup', () => setPeeking(false));

    const dockBtn = this.overlay.querySelector('#dt-dock-btn');
    dockBtn.onclick = () => {
      this.isDocked = !this.isDocked;
      this.overlay.classList.toggle('is-docked', this.isDocked);
      dockBtn.textContent = this.isDocked ? '▣ Center' : '◧ Side';
    };
  }

  _bindTabEvents() {
    this.overlay.querySelectorAll('.devtools-tab-btn[data-tab]').forEach((btn) => {
      btn.onclick = () => this.setTab(btn.getAttribute('data-tab'));
    });
  }

  _bindLightingEvents() {
    const container = this.overlay.querySelector('#dt-lt-sliders');
    this.lightingSliders = {};

    for (const def of LIGHTING_SLIDERS) {
      const group = document.createElement('div');
      group.className = 'devtools-slider-group';
      group.innerHTML = `
        <div class="devtools-slider-head">
          <span>${def.label}</span>
          <span id="dt-lt-val-${def.key}" class="devtools-slider-val">0.00</span>
        </div>
        <input id="dt-lt-slider-${def.key}" class="devtools-range" type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="1.0" />
      `;
      container.appendChild(group);

      const input = group.querySelector(`#dt-lt-slider-${def.key}`);
      const valLabel = group.querySelector(`#dt-lt-val-${def.key}`);
      this.lightingSliders[def.key] = { input, valLabel };

      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        valLabel.textContent = val.toFixed(2);
        if (def.key === 'hemi') this.setHemi(val);
        else if (def.key === 'key') this.setKey(val);
        else if (def.key === 'ceiling') this.setCeiling(val);
        else if (def.key === 'exposure') this.setExposure(val);
      });
    }

    this.overlay.querySelectorAll('#dt-lt-presets button[data-preset]').forEach((btn) => {
      btn.onclick = () => this.applyLightingPreset(btn.getAttribute('data-preset'));
    });

    this.overlay.querySelector('#dt-lt-copy-btn').onclick = () => {
      const str = JSON.stringify(this.lightingValues, null, 2);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(str).catch(() => {});
      }
      console.log('[LightingTuner] Current lighting values:', str);
      const toast = this.overlay.querySelector('#dt-lt-toast');
      if (toast) {
        toast.textContent = '✓ Lighting JSON copied to clipboard & console!';
        clearTimeout(toast._t);
        toast._t = setTimeout(() => {
          toast.textContent = '';
        }, 2400);
      }
    };
  }

  _bindViewmodelEvents() {
    this.overlay.querySelectorAll('#dt-vm-slot-row button[data-vm-slot]').forEach((btn) => {
      btn.onclick = () => {
        const slot = btn.getAttribute('data-vm-slot');
        if (slot === 'unarmed') this._switchToUnarmed();
        else this._switchSlot(slot);
      };
    });

    const adsBtn = this.overlay.querySelector('#dt-vm-ads-btn');
    adsBtn.onclick = () => {
      if (!this.viewmodel || this.viewmodel.isUnarmed) return;
      this.viewmodel.tunerForceADS = !this.viewmodel.isADS;
      this.viewmodel.setADS(this.viewmodel.tunerForceADS);
      this.refreshViewmodelTab();
    };

    this.overlay.querySelector('#dt-vm-fire-btn').onclick = () => {
      const vm = this.viewmodel;
      if (!vm || vm.isUnarmed) return;
      vm.applyRecoil();
      if (vm.currentWeapon === 'shotgun') {
        vm.startShotgunPumpAnimation();
      }
      if (vm.sound) {
        if ((vm.currentWeapon === 'hk_usp' || vm.currentWeapon === 'hk_mp5') && vm.sound.play9mmGunshot) {
          vm.sound.play9mmGunshot();
        } else if (vm.currentWeapon === 'shotgun' && vm.sound.playShotgunBlast) {
          vm.sound.playShotgunBlast();
        } else if (vm.currentWeapon === 'colt_peacemaker' && vm.sound.playColtGunshot) {
          vm.sound.playColtGunshot();
        } else if (vm.currentWeapon === 'mac_10' && vm.sound.playMac10Gunshot) {
          vm.sound.playMac10Gunshot();
        } else if (vm.currentWeapon === 'akms_gold' && vm.sound.playAkmsGunshot) {
          vm.sound.playAkmsGunshot();
        } else {
          vm.sound.playGunshot?.();
        }
      }
    };

    this.overlay.querySelector('#dt-vm-reload-btn').onclick = () => {
      const vm = this.viewmodel;
      if (!vm || vm.isUnarmed || typeof vm.startReloadAnimation !== 'function') return;
      vm.startReloadAnimation({ shellsToLoad: 4 });
    };

    this.overlay.querySelector('#dt-vm-reset-pose-btn').onclick = () => {
      this.viewmodel?.resetHandPose?.();
      this.refreshViewmodelTab();
    };

    this.overlay.querySelectorAll('#dt-vm-mode-row button[data-vm-mode]').forEach((btn) => {
      btn.onclick = () => {
        if (!this.viewmodel) return;
        const mode = btn.getAttribute('data-vm-mode');
        this.viewmodel.tunerMode = mode;
        if (mode === 'GUN (HIP)') {
          this.viewmodel.tunerForceADS = false;
          this.viewmodel.setADS(false);
        } else if (mode === 'GUN (ADS)') {
          this.viewmodel.tunerForceADS = true;
          this.viewmodel.setADS(true);
        }
        this.refreshViewmodelTab();
      };
    });

    const copyBtn = this.overlay.querySelector('#dt-vm-copy-btn');
    copyBtn.onclick = () => this._copyViewmodelTransform(copyBtn);
  }

  _bindZombiesEvents() {
    const syncEngineFlag = () => {
      if (!this.engine) return;
      this.engine.testZombiesVisible = (this.engine.enemies || []).some((e) => Boolean(e?.isActive));
    };

    const activateDummy = (enemy) => {
      if (!enemy) return;
      const sound = this.zombieManager?.sound || null;
      if (enemy.isDead || enemy.hp <= 0) {
        enemy.reset?.();
      }
      enemy.setActive?.(true);
      enemy.setHitboxesVisible?.(Boolean(this.zombieManager?.hitboxesVisible));
      enemy.playTestAnimation?.(this._currentTestAnim, sound);
    };

    const deactivateDummy = (enemy) => {
      if (!enemy) return;
      this.zombieManager?.sound?.stopZombieVocal?.(enemy, 0.02);
      enemy.setActive?.(false);
    };

    this.overlay.querySelectorAll('#dt-zt-dummy-row button[data-dummy]').forEach((btn) => {
      btn.onclick = () => {
        const key = btn.getAttribute('data-dummy');
        const enemy = this._getDummyByKey(key);
        if (!enemy) return;
        const currentlyLive = Boolean(enemy.isActive && !enemy.isDead);
        if (currentlyLive) {
          deactivateDummy(enemy);
        } else {
          activateDummy(enemy);
        }
        syncEngineFlag();
        this.refreshZombiesTab();
      };
    });

    this.overlay.querySelector('#dt-zt-spawn-all-btn').onclick = () => {
      if (!this.engine) return;
      for (const enemy of this.engine.enemies || []) {
        activateDummy(enemy);
      }
      syncEngineFlag();
      this.refreshZombiesTab();
    };

    this.overlay.querySelector('#dt-zt-clear-all-btn').onclick = () => {
      if (!this.engine) return;
      for (const enemy of this.engine.enemies || []) {
        deactivateDummy(enemy);
      }
      syncEngineFlag();
      this.refreshZombiesTab();
    };

    this.overlay.querySelector('#dt-zt-hitbox-btn').onclick = () => {
      if (!this.zombieManager) return;
      this.zombieManager.setHitboxesVisible(!this.zombieManager.hitboxesVisible);
      this.refreshZombiesTab();
    };

    this.overlay.querySelector('#dt-zt-cycle-anim-btn').onclick = () => {
      if (!this.engine) return;
      const onlyHazmat = Boolean(this.engine.zombieHazmat?.isActive && !this.engine.zombie?.isActive && !this.engine.zombieMan?.isActive);
      const states = onlyHazmat
        ? ['Idle', 'Walk', 'Run', 'Skill', 'Death']
        : ['Idle', 'Walk', 'Run', 'Attack', 'Death'];
      const next = states[(states.indexOf(this._currentTestAnim) + 1) % states.length];
      this._playTestAnimOnTargets(next);
    };

    this.overlay.querySelectorAll('#dt-zt-anim-row button[data-anim]').forEach((btn) => {
      btn.onclick = () => this._playTestAnimOnTargets(btn.getAttribute('data-anim'));
    });

    this.overlay.querySelector('#dt-zt-aura-vis-btn').onclick = () => {
      HAZMAT_RADIATION_CONFIG.showVisualAura = !HAZMAT_RADIATION_CONFIG.showVisualAura;
      const syncRing = (z) => {
        if (z?._radiationRingMesh) {
          z._radiationRingMesh.visible = Boolean(HAZMAT_RADIATION_CONFIG.showVisualAura) && !z.isDead && z.isActive;
        }
      };
      syncRing(this.engine?.zombieHazmat);
      (this.zombieManager?.waveZombies || []).forEach(syncRing);
      this.refreshZombiesTab();
    };

    this.overlay.querySelector('#dt-zt-rad-radius-slider').addEventListener('input', (e) => {
      HAZMAT_RADIATION_CONFIG.auraRadius = parseFloat(e.target.value) || 6.0;
      this.refreshZombiesTab();
    });
    this.overlay.querySelector('#dt-zt-rad-drain-slider').addEventListener('input', (e) => {
      const minVal = parseFloat(e.target.value) || 6.0;
      HAZMAT_RADIATION_CONFIG.passiveDrainMin = minVal;
      HAZMAT_RADIATION_CONFIG.passiveDrainMax = minVal + 3.5;
      this.refreshZombiesTab();
    });
    this.overlay.querySelector('#dt-zt-rad-burst-slider').addEventListener('input', (e) => {
      HAZMAT_RADIATION_CONFIG.skillBurstDamage = parseFloat(e.target.value) || 30.0;
      this.refreshZombiesTab();
    });

    this.overlay.querySelector('#dt-zt-footpin-btn').onclick = () => {
      WALK_CALIBRATION.footLockPinning = !WALK_CALIBRATION.footLockPinning;
      this.zombieManager?.applyWalkCalibration?.();
      this.refreshZombiesTab();
    };
    this.overlay.querySelector('#dt-zt-walk-ts-slider').addEventListener('input', (e) => {
      WALK_CALIBRATION.walkTimeScale = parseFloat(e.target.value) || 1.18;
      this.zombieManager?.applyWalkCalibration?.();
      this.refreshZombiesTab();
    });
    this.overlay.querySelector('#dt-zt-pin-mult-slider').addEventListener('input', (e) => {
      WALK_CALIBRATION.pinMultiplier = parseFloat(e.target.value) || 1.00;
      this.zombieManager?.applyWalkCalibration?.();
      this.refreshZombiesTab();
    });

    this.overlay.querySelector('#dt-zt-tutorial-wave-btn').onclick = () => {
      this.zombieManager?.triggerTutorialWave?.();
      this.refreshZombiesTab();
    };
    this.overlay.querySelector('#dt-zt-horde1-btn').onclick = () => {
      this.zombieManager?.startInfiniteHordes?.();
      this.refreshZombiesTab();
    };
    this.overlay.querySelector('#dt-zt-hazmat-wave-btn').onclick = () => {
      this.zombieManager?.triggerHazmatAlone?.();
      this.refreshZombiesTab();
    };
    this.overlay.querySelector('#dt-zt-wave-reset-btn').onclick = () => {
      this.zombieManager?.resetWaves?.();
      this.refreshZombiesTab();
    };
  }

  _bindInputContainment() {
    const shell = this.overlay.querySelector('.devtools-shell');
    if (!shell) return;
    shell.addEventListener('mousedown', (e) => e.stopPropagation());
    shell.addEventListener('mouseup', (e) => e.stopPropagation());
    shell.addEventListener('click', (e) => e.stopPropagation());
    shell.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    shell.addEventListener('keydown', (e) => {
      // Allow Escape and F9 to close even when a slider/button is focused
      if (e.code === 'Escape' || e.key === 'Escape' || e.code === 'F9' || e.key === 'F9') {
        return;
      }
      e.stopPropagation();
    });
  }

  _attachKeyListeners() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'F9' || e.key === 'F9') {
        e.preventDefault();
        if (this.isOpen) {
          this.close();
        } else {
          this.open();
        }
      }
    });
  }

  // =========================================================================
  // LIGHTING TAB SYNC
  // =========================================================================

  _syncLightingSlider(key, val) {
    const s = this.lightingSliders?.[key];
    if (s?.input && s?.valLabel) {
      s.input.value = val;
      s.valLabel.textContent = Number(val).toFixed(2);
    }
  }

  _refreshLightingPresetButtons() {
    if (!this.overlay) return;
    this.overlay.querySelectorAll('#dt-lt-presets button[data-preset]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-preset') === this._activeLightingPreset);
    });
  }

  refreshLightingTab() {
    const vals = this.lightingValues;
    for (const [k, v] of Object.entries(vals)) {
      this._syncLightingSlider(k, v);
    }
    this._refreshLightingPresetButtons();
  }

  // =========================================================================
  // VIEWMODEL TAB LOGIC & SLIDERS
  // =========================================================================

  _switchToUnarmed() {
    const ws = this.weaponSystem || window.__rocWeaponSystem || window.weaponSystem;
    if (ws && typeof ws.setUnarmed === 'function' && !this._isSafeZoneEnforced()) {
      ws.setUnarmed(true);
    } else if (this.viewmodel && typeof this.viewmodel.setUnarmed === 'function') {
      this.viewmodel.setUnarmed(true);
    }
    this.refreshViewmodelTab();
  }

  _switchSlot(weaponType) {
    if (this.viewmodel && typeof this.viewmodel.setUnarmed === 'function') {
      this.viewmodel.setUnarmed(false);
    }
    const ws = this.weaponSystem || window.__rocWeaponSystem || window.weaponSystem;
    if (ws) {
      const canTrulyEquip = !this._isSafeZoneEnforced() && ws.unlockedWeapons?.has?.(weaponType);
      if (canTrulyEquip && ws.isUnarmed && typeof ws.equipUnlockedWeaponFromUnarmed === 'function') {
        ws.equipUnlockedWeaponFromUnarmed(weaponType);
      } else {
        ws.switchWeapon(weaponType, true);
      }
    } else if (this.viewmodel) {
      this.viewmodel.switchWeapon(weaponType, { force: true });
    }
    this.refreshViewmodelTab();
  }

  _getActiveViewmodelTargets(vm) {
    switch (vm.currentWeapon) {
      case 'hk_usp':
        return {
          label: 'H&K USP (9MM)',
          group: vm.uspGroup,
          handPivot: vm.uspHandPivot,
          wrist: vm.uspWristBone,
          elbow: vm.uspElbowBone,
          triggerFinger: vm.uspTriggerFinger,
          hipPos: vm.uspHipPosition,
          hipRot: vm.uspHipRotation,
          adsPos: vm.uspAdsPosition,
          adsRot: vm.uspAdsRotation,
        };
      case 'shotgun':
        return {
          label: 'REMINGTON 870 (12G)',
          group: vm.shotgunGroup,
          handPivot: vm.shotgunHandPivot,
          wrist: vm.shotgunWristBone,
          elbow: vm.shotgunElbowBone,
          triggerFinger: null,
          hipPos: vm.shotgunHipPosition,
          hipRot: vm.shotgunHipRotation,
          adsPos: vm.shotgunAdsPosition,
          adsRot: vm.shotgunAdsRotation,
        };
      case 'hk_mp5':
        return {
          label: 'H&K MP5 (9MM)',
          group: vm.mp5Group,
          handPivot: vm.mp5HandPivot,
          wrist: vm.mp5WristBone,
          elbow: vm.mp5ElbowBone,
          triggerFinger: null,
          hipPos: vm.mp5HipPosition,
          hipRot: vm.mp5HipRotation,
          adsPos: vm.mp5AdsPosition,
          adsRot: vm.mp5AdsRotation,
        };
      case 'colt_peacemaker':
        return {
          label: 'COLT PEACEMAKER (.45)',
          group: vm.coltGroup,
          handPivot: vm.coltHandPivot,
          wrist: vm.coltWristBone,
          elbow: vm.coltElbowBone,
          triggerFinger: vm.coltTriggerFinger,
          hipPos: vm.coltHipPosition,
          hipRot: vm.coltHipRotation,
          adsPos: vm.coltAdsPosition,
          adsRot: vm.coltAdsRotation,
        };
      case 'mac_10':
        return {
          label: 'INGRAM MAC-10 (.45) ★',
          group: vm.mac10Group,
          handPivot: vm.mac10HandPivot,
          wrist: vm.mac10WristBone,
          elbow: vm.mac10ElbowBone,
          triggerFinger: vm.mac10TriggerFinger,
          hipPos: vm.mac10HipPosition,
          hipRot: vm.mac10HipRotation,
          adsPos: vm.mac10AdsPosition,
          adsRot: vm.mac10AdsRotation,
        };
      case 'akms_gold':
        return {
          label: 'AK 47 GOLD (7.62) ★',
          group: vm.akmsGroup,
          handPivot: vm.akmsHandPivot,
          wrist: vm.akmsWristBone,
          elbow: vm.akmsElbowBone,
          triggerFinger: null,
          hipPos: vm.akmsHipPosition,
          hipRot: vm.akmsHipRotation,
          adsPos: vm.akmsAdsPosition,
          adsRot: vm.akmsAdsRotation,
        };
      case 'm134_minigun':
        return {
          label: 'M134 MINIGUN (7.62 ROTARY) ★',
          group: vm.minigunGroup,
          handPivot: vm.minigunHandPivot,
          wrist: vm.minigunWristBone,
          elbow: vm.minigunElbowBone,
          triggerFinger: null,
          hipPos: vm.minigunHipPosition,
          hipRot: vm.minigunHipRotation,
          adsPos: vm.minigunAdsPosition,
          adsRot: vm.minigunAdsRotation,
        };
      case 'desert_eagle':
      case 'pistol':
      default:
        return {
          label: 'DESERT EAGLE (.50 AE)',
          group: vm.pistolGroup,
          handPivot: vm.pistolHandPivot,
          wrist: vm.pistolWristBone,
          elbow: vm.pistolElbowBone,
          triggerFinger: vm.pistolTriggerFinger,
          hipPos: vm.pistolHipPosition,
          hipRot: vm.pistolHipRotation,
          adsPos: vm.pistolAdsPosition,
          adsRot: vm.pistolAdsRotation,
        };
    }
  }

  _copyViewmodelTransform(copyBtn) {
    const vm = this.viewmodel;
    if (!vm) return;

    const round4 = (n) => Number(n.toFixed(4));
    const serializeHand = (handPivot, wrist, elbow, triggerFinger) => {
      if (!handPivot) return null;
      const out = {
        pos: [round4(handPivot.position.x), round4(handPivot.position.y), round4(handPivot.position.z)],
        rot: [round4(handPivot.rotation.x), round4(handPivot.rotation.y), round4(handPivot.rotation.z)],
        scale: round4(handPivot.scale.x),
        wristPitch: wrist?.userData?.pitch !== undefined ? round4(wrist.userData.pitch) : 0,
        wristRoll: wrist?.userData?.roll !== undefined ? round4(wrist.userData.roll) : 0,
        elbowBend: elbow?.userData?.bend !== undefined ? round4(elbow.userData.bend) : 0,
      };
      if (triggerFinger) {
        out.triggerReach = round4(triggerFinger.pitch || 0);
        out.triggerCurl = round4(triggerFinger.curl || 0);
        out.triggerSide = round4(triggerFinger.yaw || 0);
      }
      return out;
    };

    const serializeUnarmedHand = (pivot, indexFinger) => {
      if (!pivot) return null;
      const out = {
        pos: [round4(pivot.position.x), round4(pivot.position.y), round4(pivot.position.z)],
        rot: [round4(pivot.rotation.x), round4(pivot.rotation.y), round4(pivot.rotation.z)],
      };
      if (indexFinger) {
        out.indexReach = round4(indexFinger.pitch || 0);
        out.indexCurl = round4(indexFinger.curl || 0);
        out.indexSide = round4(indexFinger.yaw || 0);
      }
      return out;
    };

    let config;
    if (vm.isUnarmed) {
      config = {
        weapon: 'unarmed',
        rig: {
          pos: [round4(vm.unarmedHipPosition.x), round4(vm.unarmedHipPosition.y), round4(vm.unarmedHipPosition.z)],
          rot: [round4(vm.unarmedHipRotation.x), round4(vm.unarmedHipRotation.y), round4(vm.unarmedHipRotation.z)],
          scale: vm.unarmedGroup ? round4(vm.unarmedGroup.scale.x) : 1,
        },
        leftHand: serializeUnarmedHand(vm.unarmedLeftPivot, vm.unarmedLeftFinger),
        rightHand: serializeUnarmedHand(vm.unarmedRightPivot, vm.unarmedRightFinger),
      };
    } else {
      const { group, handPivot, wrist, elbow, triggerFinger, hipPos, hipRot, adsPos, adsRot } = this._getActiveViewmodelTargets(vm);
      config = {
        weapon: vm.currentWeapon,
        mode: vm.tunerMode,
        gunScale: group ? round4(group.scale.x) : 1,
        hand: serializeHand(handPivot, wrist, elbow, triggerFinger),
        hip: {
          pos: hipPos.toArray().map(round4),
          rot: [round4(hipRot.x), round4(hipRot.y), round4(hipRot.z)],
        },
        ads: {
          pos: adsPos.toArray().map(round4),
          rot: [round4(adsRot.x), round4(adsRot.y), round4(adsRot.z)],
        },
      };
    }

    const text = JSON.stringify(config, null, 2);
    console.log('[VIEWMODEL TUNER CONFIG]:\n' + text);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    const toast = this.overlay.querySelector('#dt-vm-toast');
    if (toast) {
      toast.textContent = '✓ Transform JSON copied to clipboard & console!';
      clearTimeout(toast._t);
      toast._t = setTimeout(() => {
        toast.textContent = '';
      }, 2200);
    }
    this._flashButtonSuccess(copyBtn, 'Copy Transform', '✓ Copied!');
  }

  refreshViewmodelTab() {
    if (!this.overlay || !this.viewmodel) return;
    const vm = this.viewmodel;
    const targets = this._getActiveViewmodelTargets(vm);

    const activeSlotId = vm.isUnarmed ? 'unarmed' : vm.currentWeapon;
    this.overlay.querySelectorAll('#dt-vm-slot-row button[data-vm-slot]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-vm-slot') === activeSlotId);
    });

    const badge = this.overlay.querySelector('#dt-vm-weapon-badge');
    if (badge) {
      badge.textContent = vm.isUnarmed ? 'UNARMED / BARE HANDS' : targets.label;
    }

    const modeRow = this.overlay.querySelector('#dt-vm-mode-row');
    if (modeRow) {
      modeRow.style.display = vm.isUnarmed ? 'none' : 'flex';
      modeRow.querySelectorAll('button[data-vm-mode]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-vm-mode') === vm.tunerMode);
      });
    }

    const adsBtn = this.overlay.querySelector('#dt-vm-ads-btn');
    if (adsBtn) {
      adsBtn.textContent = vm.isADS ? 'ADS: ON' : 'Toggle ADS';
      adsBtn.classList.toggle('is-purple', Boolean(vm.isADS));
      adsBtn.disabled = Boolean(vm.isUnarmed);
    }

    const fireBtn = this.overlay.querySelector('#dt-vm-fire-btn');
    if (fireBtn) fireBtn.disabled = Boolean(vm.isUnarmed);

    const reloadBtn = this.overlay.querySelector('#dt-vm-reload-btn');
    if (reloadBtn) reloadBtn.disabled = Boolean(vm.isUnarmed);

    const container = this.overlay.querySelector('#dt-vm-sliders');
    if (!container) return;
    container.innerHTML = '';

    const appendSection = (title, fields) => {
      if (!fields || fields.length === 0) return;
      const hdr = document.createElement('div');
      hdr.className = 'devtools-vm-section-title';
      hdr.textContent = title;
      container.appendChild(hdr);

      const grid = document.createElement('div');
      grid.className = 'devtools-vm-grid';

      for (const f of fields) {
        const curVal = Number(f.get()) || 0;
        const row = document.createElement('div');
        row.className = 'devtools-vm-row';
        row.innerHTML = `
          <span class="devtools-vm-label">${f.label}</span>
          <input class="devtools-range" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${curVal}" />
          <span class="devtools-slider-val is-green" style="text-align:right;">${curVal.toFixed(3)}</span>
        `;
        const slider = row.querySelector('input');
        const valDisplay = row.querySelector('span:last-child');
        slider.oninput = (e) => {
          const num = parseFloat(e.target.value);
          f.set(num);
          valDisplay.textContent = num.toFixed(3);
        };
        grid.appendChild(row);
      }
      container.appendChild(grid);
    };

    const buildFingerFields = (fingerData, idPrefix, labelPrefix, min = -0.6, maxSide = 0.6, maxCurl = 0.8) => {
      if (!fingerData) return [];
      return [
        {
          id: `${idPrefix}Reach`,
          label: `${labelPrefix} Reach`,
          min,
          max: maxSide,
          step: 0.02,
          get: () => (fingerData.pitch !== undefined ? fingerData.pitch : 0),
          set: (v) => {
            fingerData.pitch = v;
            vm._applyTriggerFingerPose(fingerData);
          },
        },
        {
          id: `${idPrefix}Curl`,
          label: `${labelPrefix} Curl`,
          min,
          max: maxCurl,
          step: 0.02,
          get: () => (fingerData.curl !== undefined ? fingerData.curl : 0),
          set: (v) => {
            fingerData.curl = v;
            vm._applyTriggerFingerPose(fingerData);
          },
        },
        {
          id: `${idPrefix}Side`,
          label: `${labelPrefix} Side`,
          min,
          max: maxSide,
          step: 0.02,
          get: () => (fingerData.yaw !== undefined ? fingerData.yaw : 0),
          set: (v) => {
            fingerData.yaw = v;
            vm._applyTriggerFingerPose(fingerData);
          },
        },
      ];
    };

    if (vm.isUnarmed) {
      if (!vm.unarmedLeftPivot || !vm.unarmedRightPivot || !vm.unarmedGroup) {
        container.innerHTML = '<div style="color:#94a3b8; padding:12px 0;">Loading hands 3D model...</div>';
        return;
      }

      const snapRigSprings = () => {
        if (window.isViewmodelTunerOpen) {
          vm.posSpring.reset(vm.unarmedHipPosition.x, vm.unarmedHipPosition.y, vm.unarmedHipPosition.z);
          vm.rotSpring.reset(vm.unarmedHipRotation.x, vm.unarmedHipRotation.y, vm.unarmedHipRotation.z);
        }
      };

      appendSection('OVERALL RIG', [
        { id: 'rigPosX', label: 'Rig Pos X', min: -0.4, max: 0.4, step: 0.002, get: () => vm.unarmedHipPosition.x, set: (v) => { vm.unarmedHipPosition.x = v; snapRigSprings(); } },
        { id: 'rigPosY', label: 'Rig Pos Y', min: -0.4, max: 0.4, step: 0.002, get: () => vm.unarmedHipPosition.y, set: (v) => { vm.unarmedHipPosition.y = v; snapRigSprings(); } },
        { id: 'rigPosZ', label: 'Rig Pos Z', min: -0.5, max: 0.5, step: 0.002, get: () => vm.unarmedHipPosition.z, set: (v) => { vm.unarmedHipPosition.z = v; snapRigSprings(); } },
        { id: 'rigRotX', label: 'Rig Rot X', min: -1.5, max: 1.5, step: 0.01, get: () => vm.unarmedHipRotation.x, set: (v) => { vm.unarmedHipRotation.x = v; snapRigSprings(); } },
        { id: 'rigRotY', label: 'Rig Rot Y', min: -1.5, max: 1.5, step: 0.01, get: () => vm.unarmedHipRotation.y, set: (v) => { vm.unarmedHipRotation.y = v; snapRigSprings(); } },
        { id: 'rigRotZ', label: 'Rig Rot Z', min: -1.5, max: 1.5, step: 0.01, get: () => vm.unarmedHipRotation.z, set: (v) => { vm.unarmedHipRotation.z = v; snapRigSprings(); } },
        { id: 'rigScale', label: 'Rig Scale', min: 0.5, max: 1.6, step: 0.01, get: () => vm.unarmedGroup.scale.x, set: (v) => { vm.unarmedGroup.scale.setScalar(v); } },
      ]);

      const lp = vm.unarmedLeftPivot;
      appendSection('LEFT HAND OFFSET', [
        { id: 'lPosX', label: 'L Pos X', min: -0.45, max: 0.25, step: 0.002, get: () => lp.position.x, set: (v) => { lp.position.x = v; } },
        { id: 'lPosY', label: 'L Pos Y', min: -0.45, max: 0.25, step: 0.002, get: () => lp.position.y, set: (v) => { lp.position.y = v; } },
        { id: 'lPosZ', label: 'L Pos Z', min: -0.55, max: 0.25, step: 0.002, get: () => lp.position.z, set: (v) => { lp.position.z = v; } },
        { id: 'lRotX', label: 'L Rot X', min: -3.14, max: 3.14, step: 0.02, get: () => lp.rotation.x, set: (v) => { lp.rotation.x = v; } },
        { id: 'lRotY', label: 'L Rot Y', min: -3.14, max: 3.14, step: 0.02, get: () => lp.rotation.y, set: (v) => { lp.rotation.y = v; } },
        { id: 'lRotZ', label: 'L Rot Z', min: -3.14, max: 3.14, step: 0.02, get: () => lp.rotation.z, set: (v) => { lp.rotation.z = v; } },
      ]);
      appendSection('LEFT INDEX FINGER', buildFingerFields(vm.unarmedLeftFinger, 'lIdx', 'L Idx', -0.8, 0.8, 1.0));

      const rp = vm.unarmedRightPivot;
      appendSection('RIGHT HAND OFFSET', [
        { id: 'rPosX', label: 'R Pos X', min: -0.25, max: 0.45, step: 0.002, get: () => rp.position.x, set: (v) => { rp.position.x = v; } },
        { id: 'rPosY', label: 'R Pos Y', min: -0.45, max: 0.25, step: 0.002, get: () => rp.position.y, set: (v) => { rp.position.y = v; } },
        { id: 'rPosZ', label: 'R Pos Z', min: -0.55, max: 0.25, step: 0.002, get: () => rp.position.z, set: (v) => { rp.position.z = v; } },
        { id: 'rRotX', label: 'R Rot X', min: -3.14, max: 3.14, step: 0.02, get: () => rp.rotation.x, set: (v) => { rp.rotation.x = v; } },
        { id: 'rRotY', label: 'R Rot Y', min: -3.14, max: 3.14, step: 0.02, get: () => rp.rotation.y, set: (v) => { rp.rotation.y = v; } },
        { id: 'rRotZ', label: 'R Rot Z', min: -3.14, max: 3.14, step: 0.02, get: () => rp.rotation.z, set: (v) => { rp.rotation.z = v; } },
      ]);
      appendSection('RIGHT INDEX FINGER', buildFingerFields(vm.unarmedRightFinger, 'rIdx', 'R Idx', -0.8, 0.8, 1.0));
      return;
    }

    if (vm.tunerMode === 'HAND RIG') {
      const target = targets.handPivot;
      const wrist = targets.wrist;
      const elbow = targets.elbow;
      const triggerFinger = targets.triggerFinger;

      if (!target) {
        container.innerHTML = '<div style="color:#94a3b8; padding:12px 0;">Loading hands 3D model...</div>';
        return;
      }

      const fields = [
        { id: 'posX', label: 'Pos X', min: -0.4, max: 0.4, step: 0.002, get: () => target.position.x, set: (v) => { target.position.x = v; } },
        { id: 'posY', label: 'Pos Y', min: -0.4, max: 0.4, step: 0.002, get: () => target.position.y, set: (v) => { target.position.y = v; } },
        { id: 'posZ', label: 'Pos Z', min: -0.5, max: 0.5, step: 0.002, get: () => target.position.z, set: (v) => { target.position.z = v; } },
        { id: 'rotX', label: 'Rot X', min: -3.14, max: 3.14, step: 0.02, get: () => target.rotation.x, set: (v) => { target.rotation.x = v; } },
        { id: 'rotY', label: 'Rot Y', min: -3.14, max: 3.14, step: 0.02, get: () => target.rotation.y, set: (v) => { target.rotation.y = v; } },
        { id: 'rotZ', label: 'Rot Z', min: -3.14, max: 3.14, step: 0.02, get: () => target.rotation.z, set: (v) => { target.rotation.z = v; } },
        { id: 'scale', label: 'Scale', min: 0.5, max: 1.8, step: 0.01, get: () => target.scale.x, set: (v) => { target.scale.setScalar(v); } },
      ];

      const applyWristQuat = () => {
        wrist.quaternion.copy(wrist.userData.restQuat);
        const qDelta = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(wrist.userData.pitch || 0, 0, wrist.userData.roll || 0, 'XYZ')
        );
        wrist.quaternion.multiply(qDelta);
      };

      if (wrist) {
        fields.push(
          {
            id: 'wristP',
            label: 'Wrist Pitch',
            min: -1.5,
            max: 1.5,
            step: 0.02,
            get: () => (wrist.userData?.pitch !== undefined ? wrist.userData.pitch : 0),
            set: (v) => { wrist.userData.pitch = v; applyWristQuat(); },
          },
          {
            id: 'wristR',
            label: 'Wrist Roll',
            min: -1.5,
            max: 1.5,
            step: 0.02,
            get: () => (wrist.userData?.roll !== undefined ? wrist.userData.roll : 0),
            set: (v) => { wrist.userData.roll = v; applyWristQuat(); },
          }
        );
      }

      if (elbow) {
        fields.push({
          id: 'elbowB',
          label: 'Elbow Bend',
          min: -1.5,
          max: 1.5,
          step: 0.02,
          get: () => (elbow.userData?.bend !== undefined ? elbow.userData.bend : 0),
          set: (v) => {
            elbow.userData.bend = v;
            elbow.quaternion.copy(elbow.userData.restQuat);
            const qDelta = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(elbow.userData.bend || 0, 0, 0, 'XYZ')
            );
            elbow.quaternion.multiply(qDelta);
          },
        });
      }

      appendSection('HAND RIG POSE', fields);
      appendSection('TRIGGER FINGER (INDEX)', buildFingerFields(triggerFinger, 'trig', 'Trig'));
      return;
    }

    if (vm.tunerMode === 'GUN (HIP)') {
      const posTarget = targets.hipPos;
      const rotTarget = targets.hipRot;
      const groupTarget = targets.group;
      const resetPos = () => {
        if (window.isViewmodelTunerOpen) {
          vm.posSpring.reset(posTarget.x, posTarget.y + vm.reloadTilt.y, posTarget.z);
        }
      };
      const resetRot = () => {
        if (window.isViewmodelTunerOpen) {
          vm.rotSpring.reset(rotTarget.x + vm.reloadTilt.pitch, rotTarget.y + vm.reloadTilt.yaw, rotTarget.z + vm.reloadTilt.roll);
        }
      };
      const fields = [
        { id: 'hipX', label: 'Hip Pos X', min: -0.4, max: 0.4, step: 0.002, get: () => posTarget.x, set: (v) => { posTarget.x = v; resetPos(); } },
        { id: 'hipY', label: 'Hip Pos Y', min: -0.4, max: 0.4, step: 0.002, get: () => posTarget.y, set: (v) => { posTarget.y = v; resetPos(); } },
        { id: 'hipZ', label: 'Hip Pos Z', min: -0.6, max: 0.1, step: 0.002, get: () => posTarget.z, set: (v) => { posTarget.z = v; resetPos(); } },
        { id: 'hipRotX', label: 'Hip Rot X', min: -1.5, max: 1.5, step: 0.01, get: () => rotTarget.x, set: (v) => { rotTarget.x = v; resetRot(); } },
        { id: 'hipRotY', label: 'Hip Rot Y', min: -1.5, max: 1.5, step: 0.01, get: () => rotTarget.y, set: (v) => { rotTarget.y = v; resetRot(); } },
        { id: 'hipRotZ', label: 'Hip Rot Z', min: -1.5, max: 1.5, step: 0.01, get: () => rotTarget.z, set: (v) => { rotTarget.z = v; resetRot(); } },
      ];
      if (groupTarget) {
        fields.push({
          id: 'gunScale',
          label: 'Gun Scale',
          min: 0.3,
          max: 2.0,
          step: 0.01,
          get: () => groupTarget.scale.x,
          set: (v) => { groupTarget.scale.setScalar(v); },
        });
      }
      appendSection('GUN HIP ALIGNMENT', fields);
      return;
    }

    // GUN (ADS)
    const posTarget = targets.adsPos;
    const rotTarget = targets.adsRot;
    const resetPos = () => {
      if (window.isViewmodelTunerOpen) {
        vm.posSpring.reset(posTarget.x, posTarget.y + vm.reloadTilt.y, posTarget.z);
      }
    };
    const resetRot = () => {
      if (window.isViewmodelTunerOpen) {
        vm.rotSpring.reset(rotTarget.x + vm.reloadTilt.pitch, rotTarget.y + vm.reloadTilt.yaw, rotTarget.z + vm.reloadTilt.roll);
      }
    };
    appendSection('GUN ADS ALIGNMENT', [
      { id: 'adsX', label: 'ADS Pos X', min: -0.2, max: 0.2, step: 0.001, get: () => posTarget.x, set: (v) => { posTarget.x = v; resetPos(); } },
      { id: 'adsY', label: 'ADS Pos Y', min: -0.2, max: 0.2, step: 0.001, get: () => posTarget.y, set: (v) => { posTarget.y = v; resetPos(); } },
      { id: 'adsZ', label: 'ADS Pos Z', min: -0.5, max: 0.1, step: 0.002, get: () => posTarget.z, set: (v) => { posTarget.z = v; resetPos(); } },
      { id: 'adsRotX', label: 'ADS Rot X', min: -0.5, max: 0.5, step: 0.001, get: () => rotTarget.x, set: (v) => { rotTarget.x = v; resetRot(); } },
      { id: 'adsRotY', label: 'ADS Rot Y', min: -0.5, max: 0.5, step: 0.001, get: () => rotTarget.y, set: (v) => { rotTarget.y = v; resetRot(); } },
      { id: 'adsRotZ', label: 'ADS Rot Z', min: -0.5, max: 0.5, step: 0.001, get: () => rotTarget.z, set: (v) => { rotTarget.z = v; resetRot(); } },
    ]);
  }

  // =========================================================================
  // ZOMBIES & WAVES TAB LOGIC
  // =========================================================================

  _getDummyByKey(key) {
    if (!this.engine) return null;
    if (key === 'woman') return this.engine.zombie || null;
    if (key === 'man') return this.engine.zombieMan || null;
    if (key === 'hazmat') return this.engine.zombieHazmat || null;
    return null;
  }

  _playTestAnimOnTargets(anim) {
    if (!this.engine || !anim) return;
    this._currentTestAnim = anim;
    const sound = this.zombieManager?.sound || null;
    let targets = (this.engine.enemies || []).filter((e) => Boolean(e?.isActive));
    if (targets.length === 0) {
      // Auto-spawn matching test dummy(ies) so clicking an animation state is never a silent no-op
      targets = anim === 'Skill' && this.engine.zombieHazmat
        ? [this.engine.zombieHazmat]
        : (this.engine.enemies || []).filter(Boolean);
    }
    for (const e of targets) {
      e.setActive?.(true);
      e.playTestAnimation?.(anim, sound);
    }
    this.engine.testZombiesVisible = (this.engine.enemies || []).some((e) => Boolean(e?.isActive));
    this.refreshZombiesTab();
  }

  _refreshWaveStatusOnly() {
    if (!this.overlay || !this.zombieManager) return;
    const info = this.overlay.querySelector('#dt-zt-wave-info');
    if (!info) return;
    if (this.zombieManager.hordeCountdownActive) {
      const sec = Math.max(0, Math.ceil(this.zombieManager.hordeCountdownTimer || 0));
      info.textContent = `Horda ${this.zombieManager.currentHorde || 1}: ${sec}s`;
      return;
    }
    const label = this.zombieManager.waveMode === 'TUTORIAL'
      ? 'Tutorial'
      : this.zombieManager.waveMode === 'HORDE'
        ? `Horda ${this.zombieManager.currentHorde || 1}`
        : this.zombieManager.waveMode === 'SOLO_HAZMAT'
          ? 'Hazmat Solo'
          : 'Tutorial Wave';
    if (!this.zombieManager.waveActive) {
      info.textContent = `${label}: Standby`;
    } else {
      const total = this.zombieManager.waveZombies.length;
      const alive = this.zombieManager.waveZombies.filter((z) => z && !z.isDead).length;
      info.textContent = `${label}: ${alive}/${total} Alive`;
    }
  }

  refreshZombiesTab() {
    if (!this.overlay) return;

    const enemies = this.engine?.enemies || [];
    const activeCount = enemies.filter((e) => Boolean(e?.isActive && !e?.isDead)).length;
    const totalCount = enemies.length || 3;
    const hbOn = Boolean(this.zombieManager?.hitboxesVisible);

    const badge = this.overlay.querySelector('#dt-zt-status-badge');
    if (badge) {
      badge.textContent = `${activeCount}/${totalCount} ACTIVE`;
      badge.classList.toggle('is-on', activeCount > 0);
    }

    this.overlay.querySelectorAll('#dt-zt-dummy-row button[data-dummy]').forEach((btn) => {
      const key = btn.getAttribute('data-dummy');
      const dummy = this._getDummyByKey(key);
      const isOn = Boolean(dummy?.isActive && !dummy?.isDead);
      btn.classList.toggle('is-active', isOn && key !== 'hazmat');
      btn.classList.toggle('is-amber', isOn && key === 'hazmat');
    });

    const hbBtn = this.overlay.querySelector('#dt-zt-hitbox-btn');
    if (hbBtn) {
      hbBtn.textContent = hbOn ? 'Hitboxes: ON' : 'Hitboxes: OFF';
      hbBtn.classList.toggle('is-amber', hbOn);
    }

    const cycleBtn = this.overlay.querySelector('#dt-zt-cycle-anim-btn');
    if (cycleBtn) {
      cycleBtn.textContent = `Cycle Anim: ${this._currentTestAnim}`;
    }

    this.overlay.querySelectorAll('#dt-zt-anim-row button[data-anim]').forEach((btn) => {
      const anim = btn.getAttribute('data-anim');
      btn.classList.toggle('is-active', anim === this._currentTestAnim);
    });

    const auraVisBtn = this.overlay.querySelector('#dt-zt-aura-vis-btn');
    if (auraVisBtn) {
      const auraOn = Boolean(HAZMAT_RADIATION_CONFIG.showVisualAura);
      auraVisBtn.textContent = auraOn ? 'Aura Ring: ON' : 'Aura Ring: OFF';
      auraVisBtn.classList.toggle('is-amber', auraOn);
    }

    const radRVal = this.overlay.querySelector('#dt-zt-rad-radius-val');
    const radRSlider = this.overlay.querySelector('#dt-zt-rad-radius-slider');
    if (radRVal) radRVal.textContent = `${HAZMAT_RADIATION_CONFIG.auraRadius.toFixed(2)} m`;
    if (radRSlider) radRSlider.value = HAZMAT_RADIATION_CONFIG.auraRadius.toFixed(1);

    const radDVal = this.overlay.querySelector('#dt-zt-rad-drain-val');
    const radDSlider = this.overlay.querySelector('#dt-zt-rad-drain-slider');
    if (radDVal) radDVal.textContent = `${HAZMAT_RADIATION_CONFIG.passiveDrainMin.toFixed(1)} HP/s`;
    if (radDSlider) radDSlider.value = HAZMAT_RADIATION_CONFIG.passiveDrainMin.toFixed(1);

    const radBVal = this.overlay.querySelector('#dt-zt-rad-burst-val');
    const radBSlider = this.overlay.querySelector('#dt-zt-rad-burst-slider');
    if (radBVal) radBVal.textContent = `${Math.round(HAZMAT_RADIATION_CONFIG.skillBurstDamage)}%`;
    if (radBSlider) radBSlider.value = Math.round(HAZMAT_RADIATION_CONFIG.skillBurstDamage);

    const footPinBtn = this.overlay.querySelector('#dt-zt-footpin-btn');
    if (footPinBtn) {
      const pinOn = Boolean(WALK_CALIBRATION.footLockPinning);
      footPinBtn.textContent = pinOn ? 'Foot-Lock Pinning: ON' : 'Foot-Lock Pinning: OFF';
      footPinBtn.classList.toggle('is-green', pinOn);
    }

    const walkTsVal = this.overlay.querySelector('#dt-zt-walk-ts-val');
    const walkTsSlider = this.overlay.querySelector('#dt-zt-walk-ts-slider');
    if (walkTsVal) walkTsVal.textContent = WALK_CALIBRATION.walkTimeScale.toFixed(2);
    if (walkTsSlider) walkTsSlider.value = WALK_CALIBRATION.walkTimeScale.toFixed(2);

    const pinMultVal = this.overlay.querySelector('#dt-zt-pin-mult-val');
    const pinMultSlider = this.overlay.querySelector('#dt-zt-pin-mult-slider');
    if (pinMultVal) pinMultVal.textContent = WALK_CALIBRATION.pinMultiplier.toFixed(2);
    if (pinMultSlider) pinMultSlider.value = WALK_CALIBRATION.pinMultiplier.toFixed(2);

    this._refreshWaveStatusOnly();
  }
}
