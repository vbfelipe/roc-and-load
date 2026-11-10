/**
 * LightingTuner.js
 *
 * Real-time In-Game GUI + Browser Console Controller for ROC & LOAD illumination.
 * - Press F7 to toggle the in-game GUI panel with live sliders.
 * - Or type `lights.help()` in the browser developer console (F12).
 */
export class LightingTuner {
  constructor(engine, warehouse) {
    this.engine = engine;
    this.warehouse = warehouse;
    this.isOpen = false;

    // Presets
    this.presets = {
      default: {
        label: 'Current Defaults',
        hemi: 0.90,
        key: 0.90,
        ceiling: 0.00,
        exposure: 0.90,
      },
      balanced: {
        label: 'Balanced Night',
        hemi: 0.90,
        key: 0.90,
        ceiling: 0.00,
        exposure: 0.90,
      },
      dim: {
        label: 'Dim & Moody',
        hemi: 0.65,
        key: 0.70,
        ceiling: 0.00,
        exposure: 0.85,
      },
      bright: {
        label: 'Bright Office',
        hemi: 1.10,
        key: 1.20,
        ceiling: 0.50,
        exposure: 1.00,
      },
    };

    this._createDOM();
    this._setupConsoleAPI();
    this._attachKeyListeners();
  }

  // Current values
  get values() {
    return {
      hemi: this.engine?.hemiLight ? Number(this.engine.hemiLight.intensity.toFixed(2)) : 0.90,
      key: this.engine?.keyLight ? Number(this.engine.keyLight.intensity.toFixed(2)) : 0.90,
      ceiling: this.warehouse?.ceilingMaterial ? Number(this.warehouse.ceilingMaterial.emissiveIntensity.toFixed(2)) : 0.00,
      exposure: this.engine?.renderer ? Number(this.engine.renderer.toneMappingExposure.toFixed(2)) : 0.90,
    };
  }

  setHemi(val) {
    if (this.engine?.hemiLight) {
      this.engine.hemiLight.intensity = Math.max(0, val);
      this._syncUI('hemi', this.engine.hemiLight.intensity);
    }
  }

  setKey(val) {
    if (this.engine?.keyLight) {
      this.engine.keyLight.intensity = Math.max(0, val);
      this._syncUI('key', this.engine.keyLight.intensity);
    }
  }

  setCeiling(val) {
    if (this.warehouse?.ceilingMaterial) {
      this.warehouse.ceilingMaterial.emissiveIntensity = Math.max(0, val);
      this._syncUI('ceiling', this.warehouse.ceilingMaterial.emissiveIntensity);
    }
  }

  setExposure(val) {
    if (this.engine?.renderer) {
      this.engine.renderer.toneMappingExposure = Math.max(0.1, val);
      this._syncUI('exposure', this.engine.renderer.toneMappingExposure);
    }
  }

  applyPreset(name) {
    const p = this.presets[name];
    if (!p) {
      console.warn(`[LightingTuner] Unknown preset "${name}". Valid: ${Object.keys(this.presets).join(', ')}`);
      return;
    }
    this.setHemi(p.hemi);
    this.setKey(p.key);
    this.setCeiling(p.ceiling);
    this.setExposure(p.exposure);
    this._highlightPreset(name);
    console.log(`[LightingTuner] Applied preset "${p.label}":`, this.values);
  }

  _highlightPreset(activeName) {
    if (!this.overlay) return;
    const map = {
      balanced: '#lt-pre-balanced',
      default: '#lt-pre-balanced',
      dim: '#lt-pre-dim',
      bright: '#lt-pre-bright',
    };
    ['#lt-pre-balanced', '#lt-pre-dim', '#lt-pre-bright'].forEach((sel) => {
      const btn = this.overlay.querySelector(sel);
      if (btn) {
        btn.style.background = '#1e293b';
        btn.style.color = '#94a3b8';
        btn.style.fontWeight = 'normal';
      }
    });
    const activeSel = map[activeName];
    if (activeSel) {
      const btn = this.overlay.querySelector(activeSel);
      if (btn) {
        btn.style.background = '#1e3a8a';
        btn.style.color = '#fff';
        btn.style.fontWeight = 'bold';
      }
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    window.isLightingTunerOpen = true;
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
    if (window.__rocViewmodel && window.__rocViewmodel.root) {
      window.__rocViewmodel.root.visible = true;
    }
    this._refreshAllSliders();
  }

  close() {
    this.isOpen = false;
    window.isLightingTunerOpen = false;
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    if (!window.isViewmodelTunerOpen && typeof window.getGameState === 'function' && window.getGameState() === 'MAIN_MENU') {
      const startModal = document.getElementById('start-modal');
      if (startModal) startModal.classList.remove('hidden');
      return;
    }
    const canvas = document.getElementById('game-canvas');
    if (canvas && canvas.requestPointerLock && !window.isViewmodelTunerOpen) {
      canvas.requestPointerLock();
    }
  }

  _createDOM() {
    if (typeof document === 'undefined') return;

    let overlay = document.getElementById('lighting-tuner-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'lighting-tuner-overlay';
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
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.75);
      z-index: 99999;
      display: none;
      pointer-events: auto;
      user-select: none;
    `;

    overlay.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #283344; padding-bottom:6px;">
        <strong style="color:#60a5fa; font-size:12px; letter-spacing:0.5px;">LIGHTING TUNER (F7)</strong>
        <span style="color:#94a3b8; font-size:10px;">Esc to close</span>
      </div>

      <div style="display:flex; gap:5px; margin-bottom:12px;">
        <button id="lt-pre-balanced" style="flex:1; padding:5px 3px; background:#1e3a8a; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Default (Ref)</button>
        <button id="lt-pre-dim" style="flex:1; padding:5px 3px; background:#1e293b; color:#94a3b8; border:none; border-radius:4px; cursor:pointer; font-size:10px;">Dim Night</button>
        <button id="lt-pre-bright" style="flex:1; padding:5px 3px; background:#1e293b; color:#94a3b8; border:none; border-radius:4px; cursor:pointer; font-size:10px;">Bright</button>
      </div>

      <div id="lt-controls" style="display:flex; flex-direction:column; gap:8px;"></div>

      <div style="margin-top:14px; display:flex; gap:6px;">
        <button id="lt-copy-btn" style="flex:1; padding:6px; background:#2563eb; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Copy Values</button>
        <button id="lt-close-btn" style="padding:6px 14px; background:#334155; color:#fff; border:none; border-radius:4px; cursor:pointer;">Close</button>
      </div>
      <div id="lt-toast" style="margin-top:6px; color:#4ade80; font-size:10px; text-align:center; height:12px;"></div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;

    // Build sliders for active lights only
    const controlsContainer = overlay.querySelector('#lt-controls');
    const sliderDefs = [
      { key: 'hemi', label: 'Ambient Fill (Hemi)', min: 0.1, max: 2.0, step: 0.05 },
      { key: 'key', label: 'Overhead Key Light', min: 0.0, max: 2.5, step: 0.05 },
      { key: 'ceiling', label: 'Ceiling Troffer Glow', min: 0.0, max: 3.0, step: 0.1 },
      { key: 'exposure', label: 'Tone Mapping Exposure', min: 0.3, max: 2.0, step: 0.05 },
    ];

    this.sliders = {};
    for (const def of sliderDefs) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; flex-direction:column; gap:2px;';
      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; color:#cbd5e1; font-size:10px;">
          <span>${def.label}</span>
          <span id="lt-val-${def.key}" style="font-family:monospace; color:#60a5fa; font-weight:bold;">0.00</span>
        </div>
        <input id="lt-slider-${def.key}" type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="1.0"
          style="width:100%; accent-color:#3b82f6; cursor:pointer; height:4px; margin:2px 0;">
      `;
      controlsContainer.appendChild(row);

      const input = row.querySelector(`#lt-slider-${def.key}`);
      const valLabel = row.querySelector(`#lt-val-${def.key}`);
      this.sliders[def.key] = { input, valLabel };

      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        valLabel.textContent = val.toFixed(2);
        this._onSliderChange(def.key, val);
      });
    }

    // Attach button actions
    overlay.querySelector('#lt-close-btn').onclick = () => this.close();
    overlay.querySelector('#lt-copy-btn').onclick = () => this._copyValues();

    overlay.querySelector('#lt-pre-balanced').onclick = () => this.applyPreset('balanced');
    overlay.querySelector('#lt-pre-dim').onclick = () => this.applyPreset('dim');
    overlay.querySelector('#lt-pre-bright').onclick = () => this.applyPreset('bright');

    // Prevent keypresses inside overlay from moving player
    overlay.addEventListener('keydown', (e) => e.stopPropagation());
    overlay.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  _onSliderChange(key, val) {
    switch (key) {
      case 'hemi': this.setHemi(val); break;
      case 'key': this.setKey(val); break;
      case 'ceiling': this.setCeiling(val); break;
      case 'exposure': this.setExposure(val); break;
    }
  }

  _syncUI(key, val) {
    const s = this.sliders?.[key];
    if (s && s.input && s.valLabel) {
      s.input.value = val;
      s.valLabel.textContent = Number(val).toFixed(2);
    }
  }

  _refreshAllSliders() {
    const vals = this.values;
    for (const [k, v] of Object.entries(vals)) {
      this._syncUI(k, v);
    }
  }

  _copyValues() {
    const vals = this.values;
    const str = JSON.stringify(vals, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(str);
    }
    console.log('[LightingTuner] Current lighting values:', str);
    const toast = this.overlay.querySelector('#lt-toast');
    if (toast) {
      toast.textContent = 'Copied to clipboard & console!';
      setTimeout(() => { if (toast) toast.textContent = ''; }, 2500);
    }
  }

  _attachKeyListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F7') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  _setupConsoleAPI() {
    const self = this;
    const api = {
      help() {
        console.log(`
%c===========================================
%c ROC & LOAD - LIGHTING TUNER CONSOLE API
%c===========================================
%c
Commands:
  lights.ambient(val)     // Set Ambient Fill (default: 0.9)
  lights.key(val)         // Set Main Overhead Key (default: 0.9)
  lights.ceiling(val)     // Set Ceiling Troffer Glow (default: 0.0)
  lights.exposure(val)    // Set Tone Mapping Exposure (default: 0.9)
  lights.preset('name')   // 'default' | 'balanced' | 'dim' | 'bright'
  lights.open()           // Open In-Game UI Overlay (or press F7)
  lights.close()          // Close In-Game UI Overlay
  lights.status()         // Print current values table
`,
          'color:#60a5fa; font-weight:bold;',
          'color:#38bdf8; font-weight:bold;',
          'color:#60a5fa; font-weight:bold;',
          'color:#e2e8f0; font-family:monospace;'
        );
        return self.values;
      },
      status() {
        console.table(self.values);
        return self.values;
      },
      ambient: (v) => self.setHemi(v),
      hemi: (v) => self.setHemi(v),
      key: (v) => self.setKey(v),
      ceiling: (v) => self.setCeiling(v),
      exposure: (v) => self.setExposure(v),
      preset: (name) => self.applyPreset(name),
      open: () => self.open(),
      close: () => self.close(),
      toggle: () => self.toggle(),
      get values() { return self.values; }
    };

    window.lights = api;
    window.light = api;
    window.lighting = api;
    window.__rocLights = api;
    if (this.engine) this.engine.lights = api;

    // Log helpful invitation once to console
    setTimeout(() => {
      console.log(
        '%c[rocAndLoad] %cLighting Tuner Ready! Press %cF7%c in-game, or type %clights.help()%c here in the console.',
        'color:#38bdf8; font-weight:bold;',
        'color:#94a3b8;',
        'color:#f59e0b; font-weight:bold;',
        'color:#94a3b8;',
        'color:#38bdf8; font-weight:bold;',
        'color:#94a3b8;'
      );
    }, 1500);
  }
}
