import * as TWEEN from '@tweenjs/tween.js';

// Tactical Ammo HUD (.50 AE counter, bullet pips, reload warnings)
export class HUD {
  constructor() {
    this.container = null;
    this.ammoCountEl = null;
    this.ammoPanelEl = null;
    this.caliberTextEl = null;
    this.modeTagEl = null;
    this.pipsContainerEl = null;
    this.reloadPromptEl = null;
    this.bulletPips = [];

    this.currentWeapon = 'hk_usp';
    this.currentAmmo = 12;
    this.maxAmmo = 12;
    this._lastReportedAmmo = null;
    this._lastReportedMax = null;
    this._ammoScaleObj = { scale: 1.0 };
    this._ammoScaleTween = null;
    this.isPulsing = false;
    this.onReloadClick = null;

    this._createDOM();
  }

  setReloadCallback(fn) {
    this.onReloadClick = fn;
  }

  _createDOM() {
    // Find ui-layer or fallback to body
    const uiLayer = document.getElementById('ui-layer') || document.body;

    // 1. Crosshair [R] RELOAD Prompt
    this.reloadPromptEl = document.createElement('div');
    this.reloadPromptEl.id = 'hud-reload-prompt';
    this.reloadPromptEl.className = 'hud-reload-prompt hidden';
    this.reloadPromptEl.innerHTML = `
      <span class="key-badge-prompt">R</span>
      <span class="prompt-text">RELOAD</span>
    `;
    this.reloadPromptEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof this.onReloadClick === 'function') {
        this.onReloadClick();
      }
    });
    uiLayer.appendChild(this.reloadPromptEl);

    // 2. Bottom-Right Tactical Weapon & Ammo Panel (9MM / .50 AE / 12 GAUGE)
    this.ammoPanelEl = document.createElement('div');
    this.ammoPanelEl.id = 'hud-ammo-panel';
    this.ammoPanelEl.className = 'hud-ammo-panel';
    this.ammoPanelEl.innerHTML = `
      <div class="panel-header">
        <div class="caliber-tag">
          <span class="status-led"></span>
          <span id="hud-caliber-text">9MM</span>
        </div>
        <div id="hud-mode-tag" class="mode-tag">SEMI-AUTO</div>
      </div>

      <div class="panel-body">
        <div class="numeric-readout">
          <span id="hud-ammo-current" class="ammo-num">12</span>
          <span class="ammo-divider">/</span>
          <span class="ammo-reserve">∞</span>
        </div>

        <div id="hud-bullet-pips" class="bullet-pips-row"></div>
      </div>
    `;
    uiLayer.appendChild(this.ammoPanelEl);

    this.ammoCountEl = this.ammoPanelEl.querySelector('#hud-ammo-current');
    this.caliberTextEl = this.ammoPanelEl.querySelector('#hud-caliber-text');
    this.modeTagEl = this.ammoPanelEl.querySelector('#hud-mode-tag');
    this.pipsContainerEl = this.ammoPanelEl.querySelector('#hud-bullet-pips');

    // Build initial cartridge pips
    this._buildBulletPips();
  }

  /**
   * Switches the HUD between:
   * - Slot 1: 'hk_usp' (9MM - 12 compact cartridges)
   * - Slot 2: 'pistol' (.50 AE - 7 heavy brass cartridges)
   * - Slot 3: 'shotgun' (12 GAUGE - 6 red shotshells)
   * - Slot 4: 'hk_mp5' (9MM - 30 submachine gun cartridges)
   */
  setWeapon(weaponType, currentAmmo, maxAmmo) {
    this.currentWeapon = weaponType;
    this.currentAmmo = currentAmmo;
    this.maxAmmo = maxAmmo;
    this._lastReportedAmmo = null;
    this._lastReportedMax = null;

    if (this.caliberTextEl) {
      if (weaponType === 'hk_usp' || weaponType === 'hk_mp5') {
        this.caliberTextEl.textContent = '9MM';
      } else if (weaponType === 'shotgun') {
        this.caliberTextEl.textContent = '12 GAUGE';
      } else {
        this.caliberTextEl.textContent = '.50 AE';
      }
    }
    if (this.modeTagEl) {
      if (weaponType === 'hk_mp5') {
        this.modeTagEl.textContent = 'FULL-AUTO';
      } else if (weaponType === 'shotgun') {
        this.modeTagEl.textContent = 'PUMP-ACTION';
      } else {
        this.modeTagEl.textContent = 'SEMI-AUTO';
      }
    }

    this._buildBulletPips();
    this.updateAmmo(currentAmmo, maxAmmo, true);
  }

  _buildBulletPips() {
    this.bulletPips = [];
    this.pipsContainerEl.innerHTML = '';

    const isShotgun = this.currentWeapon === 'shotgun';
    const isMP5 = this.currentWeapon === 'hk_mp5';
    const is9mm = this.currentWeapon === 'hk_usp' || isMP5;

    if (isMP5) {
      this.pipsContainerEl.classList.add('rack-mp5');
    } else {
      this.pipsContainerEl.classList.remove('rack-mp5');
    }

    for (let i = 0; i < this.maxAmmo; i++) {
      const pip = document.createElement('div');
      if (isShotgun) {
        pip.className = 'bullet-pip shotshell-pip';
        pip.innerHTML = `
          <div class="shell-crimp"></div>
          <div class="shell-hull"></div>
          <div class="shell-brass"></div>
          <div class="shell-rim"></div>
        `;
      } else if (is9mm) {
        pip.className = isMP5 ? 'bullet-pip pip-9mm pip-mp5' : 'bullet-pip pip-9mm';
        pip.innerHTML = `
          <div class="pip-9mm-ogive"></div>
          <div class="pip-9mm-casing"></div>
          <div class="pip-9mm-rim"></div>
        `;
      } else {
        pip.className = 'bullet-pip';
        pip.innerHTML = `
          <div class="pip-ogive"></div>
          <div class="pip-casing"></div>
          <div class="pip-rim"></div>
        `;
      }
      pip.dataset.index = i;
      this.pipsContainerEl.appendChild(pip);
      this.bulletPips.push(pip);
    }
  }

  // Update readout and bullet pips
  updateAmmo(current, max = 7, force = false) {
    if (!force && this._lastReportedAmmo === current && this._lastReportedMax === max) return;
    const prevAmmo = this._lastReportedAmmo;
    this._lastReportedAmmo = current;
    this._lastReportedMax = max;

    this.currentAmmo = current;
    this.maxAmmo = max;

    if (this.ammoCountEl) {
      this.ammoCountEl.textContent = current;

      // Stop any active scale tween so full-auto fire never stacks competing tweens
      if (this._ammoScaleTween) {
        this._ammoScaleTween.stop();
      }
      this._ammoScaleObj.scale = 1.25;
      this._ammoScaleTween = new TWEEN.Tween(this._ammoScaleObj, true)
        .to({ scale: 1.0 }, 140)
        .easing(TWEEN.Easing.Back.Out)
        .onUpdate((obj) => {
          this.ammoCountEl.style.transform = `scale(${obj.scale})`;
        })
        .start();
    }

    // Update bullet pips state (delta-only when possible to avoid 30-element DOM thrashing)
    if (!force && prevAmmo !== null && current === prevAmmo - 1 && this.bulletPips[current]) {
      const pip = this.bulletPips[current];
      pip.classList.add('spent');
      pip.style.opacity = '';
      pip.style.transform = '';
    } else {
      for (let i = 0; i < this.bulletPips.length; i++) {
        const pip = this.bulletPips[i];
        if (i < current) {
          pip.classList.remove('spent');
        } else {
          pip.classList.add('spent');
          pip.style.opacity = '';
          pip.style.transform = '';
        }
      }
    }

    // Update warnings
    this._updateWarningStates();
  }

  _updateWarningStates() {
    if (!this.ammoPanelEl) return;

    // Reset warning classes
    this.ammoPanelEl.classList.remove('warning-low', 'warning-empty');

    const lowThreshold = this.currentWeapon === 'hk_mp5' ? 6 : 2;

    if (this.currentAmmo === 0) {
      this.ammoPanelEl.classList.add('warning-empty');
      this.setEmptyState(true);
    } else if (this.currentAmmo <= lowThreshold) {
      this.ammoPanelEl.classList.add('warning-low');
      this.setEmptyState(false);
    } else {
      this.setEmptyState(false);
    }
  }

  // Toggle reload prompt visibility
  setEmptyState(isEmpty) {
    if (!this.reloadPromptEl) return;

    if (isEmpty) {
      this.reloadPromptEl.classList.remove('hidden');
    } else {
      this.reloadPromptEl.classList.add('hidden');
    }
  }

  // Dry-fire warning animation on empty trigger click
  triggerDryFireWarning() {
    if (this.reloadPromptEl) {
      // Shake [R] RELOAD prompt
      const shakeObj = { x: 0, scale: 1.35 };
      new TWEEN.Tween(shakeObj, true)
        .to({ x: 8, scale: 1.0 }, 40)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
          this.reloadPromptEl.style.transform = `translate(calc(-50% + ${shakeObj.x}px), 0) scale(${shakeObj.scale})`;
        })
        .onComplete(() => {
          new TWEEN.Tween({ x: 8 }, true)
            .to({ x: -6 }, 40)
            .onUpdate((o) => {
              this.reloadPromptEl.style.transform = `translate(calc(-50% + ${o.x}px), 0) scale(1.0)`;
            })
            .onComplete(() => {
              new TWEEN.Tween({ x: -6 }, true)
                .to({ x: 0 }, 40)
                .onUpdate((o) => {
                  this.reloadPromptEl.style.transform = `translate(calc(-50% + ${o.x}px), 0) scale(1.0)`;
                })
                .start();
            })
            .start();
        })
        .start();
    }

    if (this.ammoPanelEl) {
      // Jolt ammo panel horizontally using CSS custom property to preserve responsive scale
      new TWEEN.Tween({ x: 0 }, true)
        .to({ x: -8 }, 45)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate((o) => {
          this.ammoPanelEl.style.setProperty('--hud-jolt-x', `${o.x}px`);
        })
        .onComplete(() => {
          new TWEEN.Tween({ x: -8 }, true)
            .to({ x: 0 }, 60)
            .easing(TWEEN.Easing.Quadratic.In)
            .onUpdate((o) => {
              this.ammoPanelEl.style.setProperty('--hud-jolt-x', `${o.x}px`);
            })
            .start();
        })
        .start();
    }
  }

  /**
   * Called when reload starts: hides empty warning prompt.
   */
  onReloadStart() {
    if (this.reloadPromptEl) {
      this.reloadPromptEl.classList.add('hidden');
    }
  }

  /**
   * Called each time a 12-gauge shotshell is thumb-loaded into the Winchester Model 1912 magazine.
   * Pops the corresponding red shotshell pip in real time.
   */
  onShotgunShellInserted(current, max = 6) {
    this.updateAmmo(current, max, true);
    const pipIdx = current - 1;
    if (pipIdx >= 0 && pipIdx < this.bulletPips.length) {
      const pip = this.bulletPips[pipIdx];
      pip.classList.remove('spent', 'refilling');
      void pip.offsetWidth;
      pip.classList.add('refilling');
      pip.addEventListener(
        'animationend',
        () => {
          pip.classList.remove('refilling');
        },
        { once: true }
      );
    }
  }

  // Reload finish callback: animate only the spent pips refilling
  onReloadComplete(previousAmmo = 0) {
    this.updateAmmo(this.maxAmmo, this.maxAmmo);

    const startIdx = Math.max(0, Math.min(this.bulletPips.length, previousAmmo));

    // Staggered cartridge refill pop animation via CSS only for spent pips
    for (let i = startIdx; i < this.bulletPips.length; i++) {
      const pip = this.bulletPips[i];
      pip.classList.remove('spent');
      pip.style.transform = '';
      pip.style.opacity = '';

      // Trigger crisp CSS animation
      pip.classList.remove('refilling');
      void pip.offsetWidth; // Force reflow
      const isMP5 = this.currentWeapon === 'hk_mp5';
      const delayStep = isMP5 ? 18 : 35;
      pip.style.animationDelay = `${(i - startIdx) * delayStep}ms`;
      pip.classList.add('refilling');

      pip.addEventListener(
        'animationend',
        () => {
          pip.classList.remove('refilling');
          pip.style.animationDelay = '';
        },
        { once: true }
      );
    }
  }

  reset() {
    this.setWeapon('hk_usp', 12, 12);

    if (this.reloadPromptEl) {
      this.reloadPromptEl.classList.add('hidden');
      this.reloadPromptEl.style.transform = '';
    }

    if (this.ammoPanelEl) {
      this.ammoPanelEl.classList.remove('warning-low', 'warning-empty');
      this.ammoPanelEl.style.setProperty('--hud-jolt-x', '0px');
    }

    if (this.ammoCountEl) {
      this.ammoCountEl.textContent = '12';
      this.ammoCountEl.style.transform = '';
    }

    for (let i = 0; i < this.bulletPips.length; i++) {
      const pip = this.bulletPips[i];
      pip.classList.remove('spent', 'refilling');
      pip.style.transform = '';
      pip.style.opacity = '';
      pip.style.animationDelay = '';
    }
  }
}
