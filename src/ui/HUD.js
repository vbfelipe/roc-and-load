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
    this.uiLayer = uiLayer;

    // Track unarmed & opening sequence HUD state (dirty checked)
    this.isUnarmed = false;
    this._gameplayActive = false;
    this._tutorialActive = false;
    this._objectiveActive = false;
    this._interactActive = false;
    this._lastInteractVisible = null;
    this._lastTutorialVisible = null;
    this._lastObjectiveVisible = null;

    // 1. Crosshair [R] RELOAD Prompt
    this.reloadPromptEl = document.createElement('div');
    this.reloadPromptEl.id = 'hud-reload-prompt';
    this.reloadPromptEl.className = 'hud-reload-prompt hidden';
    this.reloadPromptEl.innerHTML = `
      <span class="key-badge-prompt">R</span>
      <span class="prompt-text">RELOAD</span>
    `;

    this._initIntroHudElements();
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

    if (isEmpty && !this.isUnarmed) {
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

  _initIntroHudElements() {
    const introHost = document.body || this.uiLayer;
    if (!introHost) return;

    // Clean up any stale duplicates across hot reloads
    for (const id of ['hud-interact-prompt', 'hud-tutorial-bar', 'hud-objective-banner']) {
      const existing = document.getElementById(id);
      if (existing) existing.remove();
    }

    // Crosshair [F] INTERAGIR Prompt (Yellow clone of [R] RELOAD, mounted directly under document.body)
    this.interactPromptEl = document.createElement('div');
    this.interactPromptEl.id = 'hud-interact-prompt';
    this.interactPromptEl.className = 'hud-reload-prompt hud-interact-prompt hidden';
    this.interactPromptEl.style.display = 'none';
    this.interactPromptEl.innerHTML = `
      <span class="key-badge-prompt">F</span>
      <span class="prompt-text">INTERAGIR</span>
    `;
    introHost.appendChild(this.interactPromptEl);

    // Delayed Opening Tutorial Bar
    this.tutorialBarEl = document.createElement('div');
    this.tutorialBarEl.id = 'hud-tutorial-bar';
    this.tutorialBarEl.className = 'hud-tutorial-bar hidden';
    this.tutorialBarEl.style.display = 'none';
    this.tutorialBarEl.innerHTML = `
      <span class="tut-item">
        <span class="tut-keys">
          <span class="tut-key">W</span><span class="tut-key">A</span><span class="tut-key">S</span><span class="tut-key">D</span>
        </span>
        <span class="tut-label">andar</span>
      </span>
      <span class="tut-item">
        <span class="tut-key">SHIFT</span>
        <span class="tut-label">correr</span>
      </span>
      <span class="tut-item">
        <span class="tut-key">ESPAÇO</span>
        <span class="tut-label">pular</span>
      </span>
      <span class="tut-item">
        <span class="tut-mouse-badge" aria-hidden="true">
          <svg width="11" height="14" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.25" y="1.25" width="11.5" height="15.5" rx="5.75" stroke="currentColor" stroke-width="1.5"/>
            <line x1="7" y1="1.5" x2="7" y2="7.5" stroke="currentColor" stroke-width="1.3"/>
            <line x1="1.5" y1="7.5" x2="12.5" y2="7.5" stroke="currentColor" stroke-width="1.2"/>
            <rect x="6.1" y="3.2" width="1.8" height="2.8" rx="0.9" fill="#facc15"/>
          </svg>
        </span>
        <span class="tut-label">câmera</span>
      </span>
    `;
    introHost.appendChild(this.tutorialBarEl);

    // Top-Center Objective Banner
    this.objectiveBannerEl = document.createElement('div');
    this.objectiveBannerEl.id = 'hud-objective-banner';
    this.objectiveBannerEl.className = 'hud-objective-banner hidden';
    this.objectiveBannerEl.style.display = 'none';
    this.objectiveBannerEl.innerHTML = `
      <span class="obj-pulse-dot" aria-hidden="true"></span>
      <span class="obj-text">Atenda o telefone para continuar</span>
    `;
    this.objectiveTextEl = this.objectiveBannerEl.querySelector('.obj-text');
    introHost.appendChild(this.objectiveBannerEl);
  }

  _applyOverlayVisibility(el, visible, { instant = false, fadeMs = 0, hiddenOffsetY = 0 } = {}) {
    if (!el) return;
    if (el._hideTimer) {
      clearTimeout(el._hideTimer);
      el._hideTimer = null;
    }

    if (instant || fadeMs <= 0) {
      el.classList.toggle('hidden', !visible);
      el.style.display = visible ? 'flex' : 'none';
      el.style.visibility = visible ? 'visible' : 'hidden';
      el.style.opacity = visible ? '1' : '0';
      if (hiddenOffsetY !== 0) {
        el.style.transform = visible ? 'translate(-50%, 0)' : `translate(-50%, ${hiddenOffsetY}px)`;
      }
      return;
    }

    if (visible) {
      const wasHidden = el.style.display === 'none' || el.classList.contains('hidden');
      el.style.display = 'flex';
      el.style.visibility = 'visible';
      if (wasHidden) {
        el.style.opacity = '0';
        el.style.transform = `translate(-50%, ${hiddenOffsetY}px)`;
        void el.offsetWidth;
      }
      el.classList.remove('hidden');
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%, 0)';
    } else {
      if (el.style.display === 'none') return;
      el.classList.add('hidden');
      el.style.opacity = '0';
      el.style.transform = `translate(-50%, ${hiddenOffsetY}px)`;
      el._hideTimer = setTimeout(() => {
        el._hideTimer = null;
        if (el.classList.contains('hidden')) {
          el.style.visibility = 'hidden';
          el.style.display = 'none';
        }
      }, fadeMs + 40);
    }
  }

  _syncIntroOverlays(instant = false) {
    const showTut = this._tutorialActive && this._gameplayActive;
    if (this._lastTutorialVisible !== showTut) {
      this._lastTutorialVisible = showTut;
      this._applyOverlayVisibility(this.tutorialBarEl, showTut, { instant, fadeMs: 900, hiddenOffsetY: 8 });
    }

    const showObj = this._objectiveActive && this._gameplayActive;
    if (this._lastObjectiveVisible !== showObj) {
      this._lastObjectiveVisible = showObj;
      this._applyOverlayVisibility(this.objectiveBannerEl, showObj, { instant, fadeMs: 650, hiddenOffsetY: -8 });
    }

    const showInteract = this._interactActive && this._gameplayActive;
    if (this._lastInteractVisible !== showInteract) {
      this._lastInteractVisible = showInteract;
      this._applyOverlayVisibility(this.interactPromptEl, showInteract, { instant: true });
    }
  }

  setGameplayHudActive(active) {
    const next = !!active;
    this._gameplayActive = next;
    this._syncIntroOverlays(!next);
  }

  /**
   * Hides bottom-right weapon/ammo HUD and reload warnings while unarmed.
   */
  setUnarmedMode(unarmed) {
    const next = !!unarmed;
    this.isUnarmed = next;
    if (this.ammoPanelEl) {
      this.ammoPanelEl.classList.toggle('unarmed-hidden', next);
    }
    if (next && this.reloadPromptEl) {
      this.reloadPromptEl.classList.add('hidden');
    } else if (!next) {
      this._updateWarningStates();
    }
  }

  setTutorialVisible(visible) {
    this._tutorialActive = !!visible;
    this._syncIntroOverlays();
  }

  setObjectiveText(text) {
    if (this.objectiveTextEl && text) {
      this.objectiveTextEl.textContent = text;
    }
  }

  setObjectiveVisible(visible) {
    this._objectiveActive = !!visible;
    this._syncIntroOverlays();
  }

  setInteractVisible(visible) {
    this._interactActive = !!visible;
    this._syncIntroOverlays();
  }

  reset() {
    this.setWeapon('hk_usp', 12, 12);
    this.setTutorialVisible(false);
    this.setObjectiveVisible(false);
    this.setInteractVisible(false);

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
