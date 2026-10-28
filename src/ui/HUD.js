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

    this.currentWeapon = 'pistol';
    this.currentAmmo = 7;
    this.maxAmmo = 7;
    this._lastReportedAmmo = null;
    this._lastReportedMax = null;
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

    // 2. Bottom-Right Tactical Weapon & Ammo Panel (.50 AE / 12 GAUGE)
    this.ammoPanelEl = document.createElement('div');
    this.ammoPanelEl.id = 'hud-ammo-panel';
    this.ammoPanelEl.className = 'hud-ammo-panel';
    this.ammoPanelEl.innerHTML = `
      <div class="panel-header">
        <div class="caliber-tag">
          <span class="status-led"></span>
          <span id="hud-caliber-text">.50 AE</span>
        </div>
        <div id="hud-mode-tag" class="mode-tag">SEMI-AUTO</div>
      </div>

      <div class="panel-body">
        <div class="numeric-readout">
          <span id="hud-ammo-current" class="ammo-num">7</span>
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
   * Switches the HUD between Weapon 1 ('pistol' - .50 AE, 7 brass cartridges)
   * and Weapon 2 ('shotgun' - 12 GAUGE, 6 red shotshells).
   */
  setWeapon(weaponType, currentAmmo, maxAmmo) {
    this.currentWeapon = weaponType;
    this.currentAmmo = currentAmmo;
    this.maxAmmo = maxAmmo;
    this._lastReportedAmmo = null;
    this._lastReportedMax = null;

    const isShotgun = weaponType === 'shotgun';
    if (this.caliberTextEl) {
      this.caliberTextEl.textContent = isShotgun ? '12 GAUGE' : '.50 AE';
    }
    if (this.modeTagEl) {
      this.modeTagEl.textContent = isShotgun ? 'PUMP-ACTION' : 'SEMI-AUTO';
    }

    this._buildBulletPips();
    this.updateAmmo(currentAmmo, maxAmmo, true);
  }

  _buildBulletPips() {
    this.bulletPips = [];
    this.pipsContainerEl.innerHTML = '';

    const isShotgun = this.currentWeapon === 'shotgun';

    for (let i = 0; i < this.maxAmmo; i++) {
      const pip = document.createElement('div');
      pip.className = isShotgun ? 'bullet-pip shotshell-pip' : 'bullet-pip';
      pip.dataset.index = i;
      pip.innerHTML = isShotgun
        ? `
          <div class="shell-crimp"></div>
          <div class="shell-hull"></div>
          <div class="shell-brass"></div>
          <div class="shell-rim"></div>
        `
        : `
          <div class="pip-ogive"></div>
          <div class="pip-casing"></div>
          <div class="pip-rim"></div>
        `;
      this.pipsContainerEl.appendChild(pip);
      this.bulletPips.push(pip);
    }
  }

  // Update readout and bullet pips
  updateAmmo(current, max = 7, force = false) {
    if (!force && this._lastReportedAmmo === current && this._lastReportedMax === max) return;
    this._lastReportedAmmo = current;
    this._lastReportedMax = max;

    this.currentAmmo = current;
    this.maxAmmo = max;

    if (this.ammoCountEl) {
      this.ammoCountEl.textContent = current;

      // Punchy scale animation on shot
      new TWEEN.Tween({ scale: 1.25 }, true)
        .to({ scale: 1.0 }, 140)
        .easing(TWEEN.Easing.Back.Out)
        .onUpdate((obj) => {
          this.ammoCountEl.style.transform = `scale(${obj.scale})`;
        })
        .start();
    }

    // Update bullet pips state
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

    // Update warnings
    this._updateWarningStates();
  }

  _updateWarningStates() {
    if (!this.ammoPanelEl) return;

    // Reset warning classes
    this.ammoPanelEl.classList.remove('warning-low', 'warning-empty');

    if (this.currentAmmo === 0) {
      this.ammoPanelEl.classList.add('warning-empty');
      this.setEmptyState(true);
    } else if (this.currentAmmo <= 2) {
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

  // Reload finish callback: sequential pip refill
  onReloadComplete() {
    this.updateAmmo(this.maxAmmo, this.maxAmmo);

    // Staggered cartridge refill pop animation via CSS
    for (let i = 0; i < this.bulletPips.length; i++) {
      const pip = this.bulletPips[i];
      pip.classList.remove('spent');
      pip.style.transform = '';
      pip.style.opacity = '';

      // Trigger crisp CSS animation
      pip.classList.remove('refilling');
      void pip.offsetWidth; // Force reflow
      pip.style.animationDelay = `${i * 35}ms`;
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
    this.setWeapon('pistol', 7, 7);

    if (this.reloadPromptEl) {
      this.reloadPromptEl.classList.add('hidden');
      this.reloadPromptEl.style.transform = '';
    }

    if (this.ammoPanelEl) {
      this.ammoPanelEl.classList.remove('warning-low', 'warning-empty');
      this.ammoPanelEl.style.setProperty('--hud-jolt-x', '0px');
    }

    if (this.ammoCountEl) {
      this.ammoCountEl.textContent = '7';
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
