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

    this.damageVignetteEl = null;
    this.gameOverScreenEl = null;
    this._damageFlashAlpha = 0;
    this._damagePulsePhase = 0;
    this._lastVignetteOpacity = -1;

    this._createDOM();
  }

  setReloadCallback(fn) {
    this.onReloadClick = fn;
  }

  _createDOM() {
    // Find ui-layer or fallback to body
    const uiLayer = document.getElementById('ui-layer') || document.body;
    this.uiLayer = uiLayer;
    this.damageVignetteEl = document.getElementById('hud-damage-vignette');
    this.gameOverScreenEl = document.getElementById('game-over-screen');

    // Track unarmed & opening sequence HUD state (dirty checked)
    this.isUnarmed = false;
    this._gameplayActive = false;
    this._tutorialActive = false;
    this._objectiveActive = false;
    this._interactActive = false;
    this._phoneDialogueActive = false;
    this._lastInteractVisible = null;
    this._lastTutorialVisible = null;
    this._lastObjectiveVisible = null;
    this._lastPhoneDialogueVisible = null;
    this._lastDialogueSnapshot = {
      showPlayerRow: null,
      activeSpeaker: null,
      callerText: null,
      playerText: null,
      skipHintText: null,
    };

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
    for (const id of ['hud-interact-prompt', 'hud-tutorial-bar', 'hud-objective-banner', 'hud-phone-dialogue']) {
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

    // Delayed Opening Tutorial Bar (stores both movement & combat templates for clean reset)
    this._movementTutorialHtml = `
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

    this._combatTutorialHtml = `
      <span class="tut-item">
        <span class="tut-key">1</span>
        <span class="tut-label">equipar arma</span>
      </span>
      <span class="tut-item">
        <span class="tut-mouse-badge" aria-hidden="true">
          <svg width="11" height="14" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 1.25 7.5 L 1.25 7 A 5.75 5.75 0 0 1 7 1.25 L 7 7.5 Z" fill="#ffffff"/>
            <path d="M 7 1.25 A 5.75 5.75 0 0 1 12.75 7 L 12.75 7.5 L 7 7.5 Z" fill="rgba(255,255,255,0.12)"/>
            <rect x="1.25" y="1.25" width="11.5" height="15.5" rx="5.75" stroke="currentColor" stroke-width="1.5"/>
            <line x1="7" y1="1.5" x2="7" y2="7.5" stroke="currentColor" stroke-width="1.3"/>
            <line x1="1.5" y1="7.5" x2="12.5" y2="7.5" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </span>
        <span class="tut-label">atirar</span>
      </span>
      <span class="tut-item">
        <span class="tut-mouse-badge" aria-hidden="true">
          <svg width="11" height="14" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 1.25 7.5 L 1.25 7 A 5.75 5.75 0 0 1 7 1.25 L 7 7.5 Z" fill="rgba(255,255,255,0.12)"/>
            <path d="M 7 1.25 A 5.75 5.75 0 0 1 12.75 7 L 12.75 7.5 L 7 7.5 Z" fill="#ffffff"/>
            <rect x="1.25" y="1.25" width="11.5" height="15.5" rx="5.75" stroke="currentColor" stroke-width="1.5"/>
            <line x1="7" y1="1.5" x2="7" y2="7.5" stroke="currentColor" stroke-width="1.3"/>
            <line x1="1.5" y1="7.5" x2="12.5" y2="7.5" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </span>
        <span class="tut-label">mirar</span>
      </span>
    `;

    this.tutorialBarEl = document.createElement('div');
    this.tutorialBarEl.id = 'hud-tutorial-bar';
    this.tutorialBarEl.className = 'hud-tutorial-bar hidden';
    this.tutorialBarEl.style.display = 'none';
    this.tutorialBarEl.innerHTML = this._movementTutorialHtml;
    introHost.appendChild(this.tutorialBarEl);

    // Top-Center Objective Banner
    this.objectiveBannerEl = document.createElement('div');
    this.objectiveBannerEl.id = 'hud-objective-banner';
    this.objectiveBannerEl.className = 'hud-objective-banner hidden';
    this.objectiveBannerEl.style.display = 'none';
    this.objectiveBannerEl.innerHTML = `
      <span class="obj-text">Atenda o telefone para continuar</span><span class="obj-pulse-bang" aria-hidden="true">!</span>
    `;
    this.objectiveTextEl = this.objectiveBannerEl.querySelector('.obj-text');
    introHost.appendChild(this.objectiveBannerEl);

    // Responsive Dual-Row Phone Call Dialogue HUD (Jório & Roc)
    this.phoneDialogueEl = document.createElement('div');
    this.phoneDialogueEl.id = 'hud-phone-dialogue';
    this.phoneDialogueEl.className = 'hud-phone-dialogue hidden';
    this.phoneDialogueEl.style.display = 'none';
    this.phoneDialogueEl.innerHTML = `
      <div class="phone-dialogue-stack">
        <div class="dialogue-row caller is-active" id="dialogue-row-caller">
          <div class="dialogue-portrait jorio">
            <img src="./jorio_hero.webp" alt="Jório" class="dialogue-portrait-img" />
          </div>
          <div class="dialogue-box jorio">
            <div class="dialogue-speaker jorio">JÓRIO (CHAMADA DE VOZ)</div>
            <div class="dialogue-text" id="dialogue-text-caller"></div>
            <div class="dialogue-skip-hint" id="dialogue-hint-caller">
              <span class="tut-key dialogue-skip-key">ESPAÇO</span>
              <span class="dialogue-skip-action">PULAR ▸</span>
            </div>
          </div>
        </div>
        <div class="dialogue-row player is-inactive row-hidden" id="dialogue-row-player">
          <div class="dialogue-portrait roc">
            <img src="./roc_hero.webp" alt="Roc" class="dialogue-portrait-img" />
          </div>
          <div class="dialogue-box roc">
            <div class="dialogue-speaker roc">ROC</div>
            <div class="dialogue-text" id="dialogue-text-player"></div>
            <div class="dialogue-skip-hint" id="dialogue-hint-player">
              <span class="tut-key dialogue-skip-key">ESPAÇO</span>
              <span class="dialogue-skip-action">PULAR ▸</span>
            </div>
          </div>
        </div>
      </div>
    `;
    introHost.appendChild(this.phoneDialogueEl);

    this._dialogueCallerRow = this.phoneDialogueEl.querySelector('#dialogue-row-caller');
    this._dialoguePlayerRow = this.phoneDialogueEl.querySelector('#dialogue-row-player');
    this._dialogueCallerTextEl = this.phoneDialogueEl.querySelector('#dialogue-text-caller');
    this._dialoguePlayerTextEl = this.phoneDialogueEl.querySelector('#dialogue-text-player');
    this._dialogueCallerHintActionEl = this.phoneDialogueEl.querySelector('#dialogue-hint-caller .dialogue-skip-action');
    this._dialoguePlayerHintActionEl = this.phoneDialogueEl.querySelector('#dialogue-hint-player .dialogue-skip-action');
  }

  _applyOverlayVisibility(el, visible, { instant = false, fadeMs = 0, hiddenOffsetY = 0, centerX = true } = {}) {
    if (!el) return;
    if (el._hideTimer) {
      clearTimeout(el._hideTimer);
      el._hideTimer = null;
    }

    const fmtTransform = (offsetY) => {
      if (centerX) return `translate(-50%, ${offsetY}px)`;
      return offsetY !== 0 ? `translateY(${offsetY}px)` : 'none';
    };

    if (instant || fadeMs <= 0) {
      el.classList.toggle('hidden', !visible);
      el.style.display = visible ? 'flex' : 'none';
      el.style.visibility = visible ? 'visible' : 'hidden';
      el.style.opacity = visible ? '1' : '0';
      if (hiddenOffsetY !== 0 || !centerX) {
        el.style.transform = fmtTransform(visible ? 0 : hiddenOffsetY);
      }
      return;
    }

    if (visible) {
      const wasHidden = el.style.display === 'none' || el.classList.contains('hidden');
      el.style.display = 'flex';
      el.style.visibility = 'visible';
      if (wasHidden) {
        el.style.opacity = '0';
        el.style.transform = fmtTransform(hiddenOffsetY);
        void el.offsetWidth;
      }
      el.classList.remove('hidden');
      el.style.opacity = '1';
      el.style.transform = fmtTransform(0);
    } else {
      if (el.style.display === 'none') return;
      el.classList.add('hidden');
      el.style.opacity = '0';
      el.style.transform = fmtTransform(hiddenOffsetY);
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
      this._applyOverlayVisibility(this.tutorialBarEl, showTut, { instant, fadeMs: 900, hiddenOffsetY: 8, centerX: true });
    }

    const showObj = this._objectiveActive && this._gameplayActive;
    if (this._lastObjectiveVisible !== showObj) {
      this._lastObjectiveVisible = showObj;
      this._applyOverlayVisibility(this.objectiveBannerEl, showObj, { instant, fadeMs: 650, hiddenOffsetY: -8, centerX: true });
    }

    const showInteract = this._interactActive && this._gameplayActive;
    if (this._lastInteractVisible !== showInteract) {
      this._lastInteractVisible = showInteract;
      this._applyOverlayVisibility(this.interactPromptEl, showInteract, { instant: true, centerX: true });
    }

    const showDialogue = this._phoneDialogueActive && this._gameplayActive;
    if (this._lastPhoneDialogueVisible !== showDialogue) {
      this._lastPhoneDialogueVisible = showDialogue;
      this._applyOverlayVisibility(this.phoneDialogueEl, showDialogue, { instant, fadeMs: 280, hiddenOffsetY: -6, centerX: false });
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

  setTutorialVisible(visible, instant = false) {
    this._tutorialActive = !!visible;
    this._syncIntroOverlays(instant);
  }

  /**
   * Swaps #hud-tutorial-bar content to the Combat Tutorial ([1] equipar arma / atirar / mirar)
   * and fades it in using the same pill container and transition.
   */
  showCombatTutorialBar(visible = true) {
    if (this.tutorialBarEl && this._combatTutorialHtml) {
      this.tutorialBarEl.innerHTML = this._combatTutorialHtml;
    }
    this.setTutorialVisible(!!visible);
  }

  /**
   * Restores #hud-tutorial-bar back to the initial movement tutorial template.
   */
  resetTutorialBar() {
    if (this.tutorialBarEl && this._movementTutorialHtml) {
      this.tutorialBarEl.innerHTML = this._movementTutorialHtml;
    }
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

  setPhoneDialogueVisible(visible, instant = false) {
    this._phoneDialogueActive = !!visible;
    this._syncIntroOverlays(instant);
  }

  setPhoneDialogueState({ showPlayerRow, activeSpeaker, callerText, playerText, skipHintText }) {
    const snap = this._lastDialogueSnapshot;
    const isJorioActive = activeSpeaker === 'jorio';

    if (snap.activeSpeaker !== activeSpeaker) {
      snap.activeSpeaker = activeSpeaker;
      if (this._dialogueCallerRow) {
        this._dialogueCallerRow.classList.toggle('is-active', isJorioActive);
        this._dialogueCallerRow.classList.toggle('is-inactive', !isJorioActive);
      }
      if (this._dialoguePlayerRow) {
        this._dialoguePlayerRow.classList.toggle('is-active', !isJorioActive);
        this._dialoguePlayerRow.classList.toggle('is-inactive', isJorioActive);
      }
    }

    if (snap.showPlayerRow !== !!showPlayerRow) {
      snap.showPlayerRow = !!showPlayerRow;
      if (this._dialoguePlayerRow) {
        this._dialoguePlayerRow.classList.toggle('row-hidden', !snap.showPlayerRow);
      }
    }

    if (callerText !== undefined && snap.callerText !== callerText) {
      snap.callerText = callerText;
      if (this._dialogueCallerTextEl) {
        this._dialogueCallerTextEl.textContent = callerText;
      }
    }

    if (playerText !== undefined && snap.playerText !== playerText) {
      snap.playerText = playerText;
      if (this._dialoguePlayerTextEl) {
        this._dialoguePlayerTextEl.textContent = playerText;
      }
    }

    if (skipHintText !== undefined && snap.skipHintText !== skipHintText) {
      snap.skipHintText = skipHintText;
      const actionLabel = String(skipHintText).replace(/^\[ESPAÇO\]\s*/i, '');
      if (this._dialogueCallerHintActionEl) {
        this._dialogueCallerHintActionEl.textContent = actionLabel;
      }
      if (this._dialoguePlayerHintActionEl) {
        this._dialoguePlayerHintActionEl.textContent = actionLabel;
      }
    }
  }

  triggerDamageFlash(currentHp, _maxHp = 3) {
    this._damageFlashAlpha = currentHp <= 0 ? 0.96 : 0.85;
  }

  updateDamageVignette(delta, currentHp = 3) {
    if (!this.damageVignetteEl) return;
    if (this._damageFlashAlpha > 0) {
      this._damageFlashAlpha = Math.max(0, this._damageFlashAlpha - delta * 2.1);
    }

    let baseCritical = 0;
    if (currentHp === 1) {
      this._damagePulsePhase += delta * 5.2;
      baseCritical = 0.20 + 0.09 * Math.sin(this._damagePulsePhase);
    } else if (currentHp === 2) {
      baseCritical = 0.08;
    }

    const targetOpacity = Math.min(1.0, Math.max(this._damageFlashAlpha, baseCritical));
    if (Math.abs(targetOpacity - this._lastVignetteOpacity) > 0.005) {
      this._lastVignetteOpacity = targetOpacity;
      this.damageVignetteEl.style.opacity = targetOpacity.toFixed(3);
    }
  }

  resetDamageVignette() {
    this._damageFlashAlpha = 0;
    this._damagePulsePhase = 0;
    this._lastVignetteOpacity = 0;
    if (this.damageVignetteEl) {
      this.damageVignetteEl.style.opacity = '0';
    }
  }

  setGameOverVisible(visible) {
    if (!this.gameOverScreenEl) return;
    const isVis = !!visible;
    this.gameOverScreenEl.classList.toggle('active', isVis);
    this.gameOverScreenEl.setAttribute('aria-hidden', isVis ? 'false' : 'true');
  }

  reset() {
    this.resetDamageVignette();
    this.setGameOverVisible(false);
    this.setWeapon('hk_usp', 12, 12);
    this.resetTutorialBar();
    this.setTutorialVisible(false, true);
    this.setObjectiveVisible(false);
    this.setInteractVisible(false);
    this.setPhoneDialogueVisible(false, true);
    this.setPhoneDialogueState({
      showPlayerRow: false,
      activeSpeaker: 'jorio',
      callerText: '',
      playerText: '',
      skipHintText: '[ESPAÇO] PULAR ▸',
    });

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
