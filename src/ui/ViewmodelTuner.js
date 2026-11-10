import * as THREE from 'three';

/**
 * ViewmodelTuner.js
 *
 * In-Game Viewmodel & Rigged Hands Tuner overlay (toggled with F8).
 * Supports tuning [ HAND RIG ], [ GUN (HIP) ], and [ GUN (ADS) ] live across all 4 weapon slots.
 */
export class ViewmodelTuner {
  constructor(viewmodel, weaponSystem = null) {
    this.viewmodel = viewmodel;
    this.weaponSystem = weaponSystem;
    this.overlay = null;
    this.isOpen = false;

    if (this.viewmodel) {
      this.viewmodel.onTunerSync = () => this.refreshSliders();
    }

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
    this.isOpen = true;
    window.isViewmodelTunerOpen = true;
    if (window.__rocTuner?.isOpen) {
      window.__rocTuner.close();
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
    if (this.viewmodel) {
      this.viewmodel.root.visible = true;
    }
    this.refreshSliders();
  }

  close() {
    this.isOpen = false;
    window.isViewmodelTunerOpen = false;
    if (this.viewmodel) {
      this.viewmodel.tunerForceADS = null;
    }
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
    const canvas = document.getElementById('game-canvas');
    if (canvas && canvas.requestPointerLock && !window.__rocTuner?.isOpen) {
      canvas.requestPointerLock();
    }
  }

  _switchSlot(weaponType) {
    const ws = this.weaponSystem || window.__rocWeaponSystem || window.weaponSystem;
    if (ws) {
      ws.switchWeapon(weaponType, true);
    } else if (this.viewmodel) {
      this.viewmodel.switchWeapon(weaponType);
    }
    this.refreshSliders();
  }

  _createDOM() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let overlay = document.getElementById('hand-tuner-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'hand-tuner-overlay';
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
        <strong style="color:#63b3ed; font-size:12px;">Viewmodel Tuner (F8)</strong>
        <span id="ht-weapon-badge" style="color:#f6ad55; font-weight:bold; font-size:11px; text-transform:uppercase;">H&K USP (9MM)</span>
      </div>
      <div style="display:flex; gap:4px; margin-bottom:6px;">
        <button id="ht-slot1-btn" style="flex:1; padding:4px 2px; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">1: USP</button>
        <button id="ht-slot2-btn" style="flex:1; padding:4px 2px; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">2: .50 AE</button>
        <button id="ht-slot3-btn" style="flex:1; padding:4px 2px; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">3: 12G</button>
        <button id="ht-slot4-btn" style="flex:1; padding:4px 2px; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">4: MP5</button>
        <button id="ht-ads-btn" style="flex:1; padding:4px 2px; background:#4a5568; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Toggle ADS</button>
      </div>
      <div style="display:flex; gap:4px; margin-bottom:8px;">
        <button id="ht-fire-btn" style="flex:1; padding:4px 2px; background:#dd6b20; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Test Fire</button>
        <button id="ht-reload-btn" style="flex:1; padding:4px 2px; background:#319795; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Test Reload</button>
        <button id="ht-reset-pose-btn" style="flex:1; padding:4px 2px; background:#4a5568; color:#cbd5e0; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Reset Pose</button>
      </div>
      <div style="display:flex; gap:4px; margin-bottom:8px;">
        <button id="ht-mode-hand" style="flex:1; padding:4px 2px; background:#4a5568; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">HAND RIG</button>
        <button id="ht-mode-hip" style="flex:1; padding:4px 2px; background:#2d3748; color:#a0aec0; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">GUN (HIP)</button>
        <button id="ht-mode-ads" style="flex:1; padding:4px 2px; background:#2d3748; color:#a0aec0; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">GUN (ADS)</button>
      </div>
      <div id="ht-sliders-container" style="display:flex; flex-direction:column; gap:5px; max-height:280px; overflow-y:auto; padding-right:4px;"></div>
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button id="ht-copy-btn" style="flex:1; padding:6px; background:#3182ce; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Copy Transform</button>
        <button id="ht-close-btn" style="padding:6px 12px; background:#4a5568; color:#fff; border:none; border-radius:4px; cursor:pointer;">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);
    this.overlay = overlay;

    // Close & Slot buttons
    overlay.querySelector('#ht-close-btn').onclick = () => this.close();
    overlay.querySelector('#ht-slot1-btn').onclick = () => this._switchSlot('hk_usp');
    overlay.querySelector('#ht-slot2-btn').onclick = () => this._switchSlot('pistol');
    overlay.querySelector('#ht-slot3-btn').onclick = () => this._switchSlot('shotgun');
    overlay.querySelector('#ht-slot4-btn').onclick = () => this._switchSlot('hk_mp5');

    // ADS button
    const adsBtn = overlay.querySelector('#ht-ads-btn');
    adsBtn.onclick = () => {
      if (!this.viewmodel) return;
      this.viewmodel.tunerForceADS = !this.viewmodel.isADS;
      this.viewmodel.setADS(this.viewmodel.tunerForceADS);
      adsBtn.style.background = this.viewmodel.isADS ? '#805ad5' : '#4a5568';
      adsBtn.textContent = this.viewmodel.isADS ? 'ADS: ON' : 'Toggle ADS';
      this.refreshSliders();
    };

    // Fire / Reload / Reset actions
    overlay.querySelector('#ht-fire-btn').onclick = () => {
      const vm = this.viewmodel;
      if (!vm) return;
      vm.applyRecoil();
      if (vm.currentWeapon === 'shotgun') {
        vm.startShotgunPumpAnimation();
      }
      if (vm.sound) {
        if (vm.currentWeapon === 'hk_usp' && typeof vm.sound.play9mmGunshot === 'function') {
          vm.sound.play9mmGunshot();
        } else if (vm.currentWeapon === 'shotgun' && typeof vm.sound.playShotgunBlast === 'function') {
          vm.sound.playShotgunBlast();
        } else {
          vm.sound.playGunshot();
        }
      }
    };

    overlay.querySelector('#ht-reload-btn').onclick = () => {
      const ws = this.weaponSystem || window.__rocWeaponSystem || window.weaponSystem;
      if (ws) {
        ws.startReload(true);
      } else if (this.viewmodel) {
        this.viewmodel.startReloadAnimation();
      }
    };

    overlay.querySelector('#ht-reset-pose-btn').onclick = () => {
      if (this.viewmodel) this.viewmodel.resetHandPose();
    };

    // Mode tabs
    const modeHand = overlay.querySelector('#ht-mode-hand');
    const modeHip = overlay.querySelector('#ht-mode-hip');
    const modeAds = overlay.querySelector('#ht-mode-ads');
    const updateTabs = (mode) => {
      if (!this.viewmodel) return;
      this.viewmodel.tunerMode = mode;
      [modeHand, modeHip, modeAds].forEach((btn) => {
        btn.style.background = '#2d3748';
        btn.style.color = '#a0aec0';
      });
      if (mode === 'HAND RIG') {
        modeHand.style.background = '#4a5568';
        modeHand.style.color = '#fff';
      } else if (mode === 'GUN (HIP)') {
        modeHip.style.background = '#4a5568';
        modeHip.style.color = '#fff';
        this.viewmodel.tunerForceADS = false;
        this.viewmodel.setADS(false);
        adsBtn.style.background = '#4a5568';
        adsBtn.textContent = 'Toggle ADS';
      } else {
        modeAds.style.background = '#4a5568';
        modeAds.style.color = '#fff';
        this.viewmodel.tunerForceADS = true;
        this.viewmodel.setADS(true);
        adsBtn.style.background = '#805ad5';
        adsBtn.textContent = 'ADS: ON';
      }
      this.refreshSliders();
    };

    modeHand.onclick = () => updateTabs('HAND RIG');
    modeHip.onclick = () => updateTabs('GUN (HIP)');
    modeAds.onclick = () => updateTabs('GUN (ADS)');

    // Copy Transform button
    const copyBtn = overlay.querySelector('#ht-copy-btn');
    copyBtn.onclick = () => this._copyTransform(copyBtn);

    // Prevent clicks/keys inside overlay from affecting gameplay
    overlay.addEventListener('keydown', (e) => e.stopPropagation());
    overlay.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  _copyTransform(copyBtn) {
    const vm = this.viewmodel;
    if (!vm) return;

    const isUSP = vm.currentWeapon === 'hk_usp';
    const isShotgun = vm.currentWeapon === 'shotgun';
    const isMP5 = vm.currentWeapon === 'hk_mp5';
    const handPivot = isUSP ? vm.uspHandPivot : (isShotgun ? vm.shotgunHandPivot : (isMP5 ? vm.mp5HandPivot : vm.pistolHandPivot));
    const wrist = isUSP ? vm.uspWristBone : (isShotgun ? vm.shotgunWristBone : (isMP5 ? vm.mp5WristBone : vm.pistolWristBone));
    const elbow = isUSP ? vm.uspElbowBone : (isShotgun ? vm.shotgunElbowBone : (isMP5 ? vm.mp5ElbowBone : vm.pistolElbowBone));
    const hipPos = isUSP ? vm.uspHipPosition : (isShotgun ? vm.shotgunHipPosition : (isMP5 ? vm.mp5HipPosition : vm.pistolHipPosition));
    const hipRot = isUSP ? vm.uspHipRotation : (isShotgun ? vm.shotgunHipRotation : (isMP5 ? vm.mp5HipRotation : vm.pistolHipRotation));
    const adsPos = isUSP ? vm.uspAdsPosition : (isShotgun ? vm.shotgunAdsPosition : (isMP5 ? vm.mp5AdsPosition : vm.pistolAdsPosition));
    const adsRot = isUSP ? vm.uspAdsRotation : (isShotgun ? vm.shotgunAdsRotation : (isMP5 ? vm.mp5AdsRotation : vm.pistolAdsRotation));

    const config = {
      weapon: vm.currentWeapon,
      mode: vm.tunerMode,
      hand: handPivot
        ? {
            pos: [
              Number(handPivot.position.x.toFixed(4)),
              Number(handPivot.position.y.toFixed(4)),
              Number(handPivot.position.z.toFixed(4)),
            ],
            rot: [
              Number(handPivot.rotation.x.toFixed(4)),
              Number(handPivot.rotation.y.toFixed(4)),
              Number(handPivot.rotation.z.toFixed(4)),
            ],
            scale: Number(handPivot.scale.x.toFixed(4)),
            wristPitch: wrist && wrist.userData.pitch !== undefined ? Number(wrist.userData.pitch.toFixed(4)) : 0,
            wristRoll: wrist && wrist.userData.roll !== undefined ? Number(wrist.userData.roll.toFixed(4)) : 0,
            elbowBend: elbow && elbow.userData.bend !== undefined ? Number(elbow.userData.bend.toFixed(4)) : 0,
          }
        : null,
      hip: {
        pos: hipPos.toArray().map((v) => Number(v.toFixed(4))),
        rot: [
          Number(hipRot.x.toFixed(4)),
          Number(hipRot.y.toFixed(4)),
          Number(hipRot.z.toFixed(4)),
        ],
      },
      ads: {
        pos: adsPos.toArray().map((v) => Number(v.toFixed(4))),
        rot: [
          Number(adsRot.x.toFixed(4)),
          Number(adsRot.y.toFixed(4)),
          Number(adsRot.z.toFixed(4)),
        ],
      },
    };

    const text = JSON.stringify(config, null, 2);
    console.log('[VIEWMODEL TUNER CONFIG]:\n' + text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    if (copyBtn) {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy Transform'; }, 1200);
    }
  }

  _attachKeyListeners() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F8') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  refreshSliders() {
    if (!this.overlay || !this.viewmodel) return;

    const vm = this.viewmodel;
    const isUSP = vm.currentWeapon === 'hk_usp';
    const isShotgun = vm.currentWeapon === 'shotgun';
    const isMP5 = vm.currentWeapon === 'hk_mp5';

    const badge = this.overlay.querySelector('#ht-weapon-badge');
    if (badge) {
      if (isUSP) badge.textContent = 'H&K USP (9MM)';
      else if (isShotgun) badge.textContent = 'REMINGTON 870 (12G)';
      else if (isMP5) badge.textContent = 'H&K MP5 (9MM)';
      else badge.textContent = 'DESERT EAGLE (.50 AE)';
    }

    const adsBtn = this.overlay.querySelector('#ht-ads-btn');
    if (adsBtn) {
      adsBtn.textContent = vm.isADS ? 'ADS: ON' : 'Toggle ADS';
      adsBtn.style.background = vm.isADS ? '#805ad5' : '#4a5568';
    }

    const container = this.overlay.querySelector('#ht-sliders-container');
    if (!container) return;
    container.innerHTML = '';

    const createSliderRow = (f) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:6px;';
      const curVal = f.get();
      row.innerHTML = `
        <span style="width:72px; color:#cbd5e0; font-size:10px;">${f.label}:</span>
        <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${curVal}" style="flex:1; cursor:pointer;" />
        <span id="val-${f.id}" style="width:46px; text-align:right; color:#68d391; font-family:monospace; font-size:10px;">${curVal.toFixed(3)}</span>
      `;
      const slider = row.querySelector('input');
      const valDisplay = row.querySelector(`#val-${f.id}`);
      slider.oninput = (e) => {
        const num = parseFloat(e.target.value);
        f.set(num);
        valDisplay.textContent = num.toFixed(3);
      };
      container.appendChild(row);
    };

    if (vm.tunerMode === 'HAND RIG') {
      const target = isUSP ? vm.uspHandPivot : (isShotgun ? vm.shotgunHandPivot : (isMP5 ? vm.mp5HandPivot : vm.pistolHandPivot));
      const wrist = isUSP ? vm.uspWristBone : (isShotgun ? vm.shotgunWristBone : (isMP5 ? vm.mp5WristBone : vm.pistolWristBone));
      const elbow = isUSP ? vm.uspElbowBone : (isShotgun ? vm.shotgunElbowBone : (isMP5 ? vm.mp5ElbowBone : vm.pistolElbowBone));

      if (!target) {
        container.innerHTML = '<div style="color:#a0aec0; padding:10px 0;">Loading hands 3D model...</div>';
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

      if (wrist) {
        fields.push(
          {
            id: 'wristP',
            label: 'Wrist Pitch',
            min: -1.5,
            max: 1.5,
            step: 0.02,
            get: () => (wrist.userData && wrist.userData.pitch !== undefined ? wrist.userData.pitch : 0),
            set: (v) => {
              wrist.userData.pitch = v;
              wrist.quaternion.copy(wrist.userData.restQuat);
              const qDelta = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(wrist.userData.pitch || 0, 0, wrist.userData.roll || 0, 'XYZ')
              );
              wrist.quaternion.multiply(qDelta);
            },
          },
          {
            id: 'wristR',
            label: 'Wrist Roll',
            min: -1.5,
            max: 1.5,
            step: 0.02,
            get: () => (wrist.userData && wrist.userData.roll !== undefined ? wrist.userData.roll : 0),
            set: (v) => {
              wrist.userData.roll = v;
              wrist.quaternion.copy(wrist.userData.restQuat);
              const qDelta = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(wrist.userData.pitch || 0, 0, wrist.userData.roll || 0, 'XYZ')
              );
              wrist.quaternion.multiply(qDelta);
            },
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
          get: () => (elbow.userData && elbow.userData.bend !== undefined ? elbow.userData.bend : 0),
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

      fields.forEach(createSliderRow);
    } else if (vm.tunerMode === 'GUN (HIP)') {
      const posTarget = isUSP ? vm.uspHipPosition : (isShotgun ? vm.shotgunHipPosition : (isMP5 ? vm.mp5HipPosition : vm.pistolHipPosition));
      const rotTarget = isUSP ? vm.uspHipRotation : (isShotgun ? vm.shotgunHipRotation : (isMP5 ? vm.mp5HipRotation : vm.pistolHipRotation));

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
      fields.forEach(createSliderRow);
    } else {
      const posTarget = isUSP ? vm.uspAdsPosition : (isShotgun ? vm.shotgunAdsPosition : (isMP5 ? vm.mp5AdsPosition : vm.pistolAdsPosition));
      const rotTarget = isUSP ? vm.uspAdsRotation : (isShotgun ? vm.shotgunAdsRotation : (isMP5 ? vm.mp5AdsRotation : vm.pistolAdsRotation));

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
        { id: 'adsX', label: 'ADS Pos X', min: -0.2, max: 0.2, step: 0.001, get: () => posTarget.x, set: (v) => { posTarget.x = v; resetPos(); } },
        { id: 'adsY', label: 'ADS Pos Y', min: -0.2, max: 0.2, step: 0.001, get: () => posTarget.y, set: (v) => { posTarget.y = v; resetPos(); } },
        { id: 'adsZ', label: 'ADS Pos Z', min: -0.5, max: 0.1, step: 0.002, get: () => posTarget.z, set: (v) => { posTarget.z = v; resetPos(); } },
        { id: 'adsRotX', label: 'ADS Rot X', min: -0.5, max: 0.5, step: 0.001, get: () => rotTarget.x, set: (v) => { rotTarget.x = v; resetRot(); } },
        { id: 'adsRotY', label: 'ADS Rot Y', min: -0.5, max: 0.5, step: 0.001, get: () => rotTarget.y, set: (v) => { rotTarget.y = v; resetRot(); } },
        { id: 'adsRotZ', label: 'ADS Rot Z', min: -0.5, max: 0.5, step: 0.001, get: () => rotTarget.z, set: (v) => { rotTarget.z = v; resetRot(); } },
      ];
      fields.forEach(createSliderRow);
    }
  }
}

