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
    this.healVignetteEl = null;
    this.radiationOverlayEl = null;
    this.radiationWarningEl = null;
    this.gameOverScreenEl = null;
    this._damageFlashAlpha = 0;
    this._damagePulsePhase = 0;
    this._lastVignetteOpacity = -1;
    this._healVignetteActive = false;
    this._healVignetteTimer = 0;
    this._lastHealVignetteOpacity = -1;

    // Radiation screen & top-center warning state
    this._radiationExposure = 0;
    this._radiationBurstAlpha = 0;
    this._radiationPulsePhase = 0;
    this._radiationHoldTimer = 0;
    this._lastRadiationOverlayOpacity = -1;
    this._lastRadiationWarningVisible = null;

    // Top-right status HUD state (0-100% HP, rolling Money, Kills) + Safe-zone indicator
    this._statusHp = 100;
    this._statusMaxHp = 100;
    this._displayMoney = 0;
    this._targetMoney = 0;
    this._lastRenderedMoneyText = '$ 0';
    this._killsCount = 0;
    this._statusHudVisible = false;
    this._lastStatusHudShown = null;
    this._safeZoneActive = false;
    this._lastSafeZoneVisible = null;

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
    this.healVignetteEl = document.getElementById('hud-heal-vignette');
    this.radiationOverlayEl = document.getElementById('hud-radiation-overlay');
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
      topSpeaker: null,
      showCallerRow: null,
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
          <span id="hud-caliber-text">HK USP</span>
        </div>
        <div id="hud-mode-tag" class="mode-tag">SEMI-AUTO</div>
      </div>

      <div class="panel-body">
        <div class="numeric-readout">
          <span id="hud-ammo-current" class="ammo-num">12</span>
          <span class="ammo-divider">/</span>
          <span id="hud-ammo-reserve" class="ammo-reserve">∞</span>
        </div>

        <div id="hud-bullet-pips" class="bullet-pips-row"></div>
      </div>
    `;
    uiLayer.appendChild(this.ammoPanelEl);

    this.ammoCountEl = this.ammoPanelEl.querySelector('#hud-ammo-current');
    this.ammoReserveEl = this.ammoPanelEl.querySelector('#hud-ammo-reserve');
    this.caliberTextEl = this.ammoPanelEl.querySelector('#hud-caliber-text');
    this.modeTagEl = this.ammoPanelEl.querySelector('#hud-mode-tag');
    this.pipsContainerEl = this.ammoPanelEl.querySelector('#hud-bullet-pips');

    // Build initial cartridge pips
    this._buildBulletPips();
    this._initStatusHudElements(uiLayer);
    this._initKillFeedbackElements(uiLayer);
  }

  _initKillFeedbackElements(uiLayer) {
    this.killMarkerEl = document.createElement('div');
    this.killMarkerEl.id = 'hud-kill-marker';
    this.killMarkerEl.innerHTML = `
      <span class="kill-marker-tick tl"></span>
      <span class="kill-marker-tick tr"></span>
      <span class="kill-marker-tick bl"></span>
      <span class="kill-marker-tick br"></span>
    `;
    uiLayer.appendChild(this.killMarkerEl);

    this.headshotBannerEl = document.createElement('div');
    this.headshotBannerEl.id = 'hud-headshot-banner';
    this.headshotBannerEl.innerHTML = `
      <span class="headshot-skull-icon" aria-hidden="true">
        <svg viewBox="0 0 38 28" width="32" height="24" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="hs-skull-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#fca5a5"/>
              <stop offset="48%" stop-color="#ef4444"/>
              <stop offset="100%" stop-color="#991b1b"/>
            </linearGradient>
            <linearGradient id="hs-bullet-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#d97706"/>
              <stop offset="55%" stop-color="#fde047"/>
              <stop offset="100%" stop-color="#ffffff"/>
            </linearGradient>
          </defs>
          <!-- Boxy-jawed crimson skull (eye sockets, nose, teeth, left-temple entry hole + cracks) -->
          <g transform="translate(3, 2)">
            <path d="M12 1.5C6.8 1.5 2.8 5.4 2.8 10.2c0 2.7 1.3 5.0 3.3 6.5V21.5h11.8v-4.8c2-1.5 3.3-3.8 3.3-6.5 0-4.8-4-8.7-9.2-8.7z" fill="url(#hs-skull-grad)" stroke="#1f0507" stroke-width="1.4" stroke-linejoin="round"/>
            <circle cx="8.6" cy="10.4" r="2.1" fill="#1a0406"/>
            <circle cx="15.4" cy="10.4" r="2.1" fill="#1a0406"/>
            <path d="M12 12.6 L10.7 15.2 L13.3 15.2 Z" fill="#1a0406"/>
            <line x1="9.2" y1="18.2" x2="9.2" y2="21.5" stroke="#1a0406" stroke-width="1.3"/>
            <line x1="12.0" y1="18.2" x2="12.0" y2="21.5" stroke="#1a0406" stroke-width="1.3"/>
            <line x1="14.8" y1="18.2" x2="14.8" y2="21.5" stroke="#1a0406" stroke-width="1.3"/>
            <circle cx="5.2" cy="7.2" r="1.45" fill="#1a0406" stroke="#fecaca" stroke-width="0.6"/>
            <path d="M5.2 7.2 L2.5 5.2 M5.2 7.2 L3.0 9.0 M5.2 7.2 L7.2 5.4" stroke="#1a0406" stroke-width="1.0" stroke-linecap="round"/>
          </g>
          <!-- Exit shatter sparks -->
          <path d="M22.8 7.0 L25.6 4.8 M23.4 9.5 L26.2 9.5 M22.6 11.8 L25.4 13.4" stroke="#fca5a5" stroke-width="1.3" stroke-linecap="round"/>
          <!-- Thick horizontal ballistic bullet bursting out right side -->
          <path d="M25.5 7.3 L31.2 7.3 C33.8 7.3 36.2 8.4 37.2 9.5 C36.2 10.6 33.8 11.7 31.2 11.7 L25.5 11.7 Z" fill="url(#hs-bullet-grad)" stroke="#1f0507" stroke-width="1.0" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="headshot-label-text">HEADSHOT!</span>
    `;
    uiLayer.appendChild(this.headshotBannerEl);

    this.killRewardLayerEl = document.createElement('div');
    this.killRewardLayerEl.id = 'hud-kill-reward-layer';
    uiLayer.appendChild(this.killRewardLayerEl);

    this._killCashPool = [];
    this._killCashPoolIdx = 0;
    this._lastKillPopTime = 0;
    this._killStreakStagger = 0;
    for (let i = 0; i < 6; i++) {
      const pop = document.createElement('div');
      pop.className = 'kill-cash-pop';
      this.killRewardLayerEl.appendChild(pop);
      this._killCashPool.push(pop);
    }
  }

  _initStatusHudElements(uiLayer) {
    this.topRightStatusEl = document.createElement('div');
    this.topRightStatusEl.id = 'hud-top-right-status';
    this.topRightStatusEl.innerHTML = `
      <div class="status-pill status-pill-wide" aria-label="Health">
        <div class="status-badge-icon"><span class="hp-cross-icon">+</span></div>
        <div class="hp-bar-track">
          <div id="hud-hp-bar-fill" class="hp-bar-fill" style="width: 100%;"></div>
          <div class="hp-bar-segments"><span></span><span></span><span></span></div>
        </div>
      </div>
      <div class="status-pill status-pill-wide" aria-label="Cash">
        <div class="status-badge-icon"><span class="money-dollar-icon">$</span></div>
        <span id="hud-money-value" class="money-value-text">$ 0</span>
      </div>
      <div class="status-pill status-pill-compact" aria-label="Kills">
        <div class="status-badge-icon">
          <span class="kills-skull-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C7.03 2 3 5.82 3 10.5c0 2.86 1.48 5.39 3.74 6.95V20c0 .55.45 1 1 1h8.52c.55 0 1-.45 1-1v-2.55C19.52 15.89 21 13.36 21 10.5 21 5.82 16.97 2 12 2zm-3.2 10.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm6.4 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm-2.2 6h-2v-2.2h2v2.2z"/>
            </svg>
          </span>
        </div>
        <span id="hud-kills-value" class="kills-value-text">0</span>
      </div>
    `;
    uiLayer.appendChild(this.topRightStatusEl);

    this.hpBarFillEl = this.topRightStatusEl.querySelector('#hud-hp-bar-fill');
    this.moneyValueEl = this.topRightStatusEl.querySelector('#hud-money-value');
    this.killsValueEl = this.topRightStatusEl.querySelector('#hud-kills-value');

    // Safe-zone badge shown while player is inside the Maintenance Closet
    this.safeZoneBannerEl = document.createElement('div');
    this.safeZoneBannerEl.id = 'hud-safe-zone-banner';
    this.safeZoneBannerEl.className = 'hud-safe-zone-banner hidden';
    this.safeZoneBannerEl.style.display = 'none';
    this.safeZoneBannerEl.innerHTML = `<span class="safe-dot"></span><span>ZONA SEGURA</span>`;
    uiLayer.appendChild(this.safeZoneBannerEl);

    // Top-center Radioactive Hazard Warning Banner + Trefoil SVG
    this.radiationWarningEl = document.createElement('div');
    this.radiationWarningEl.id = 'hud-radiation-warning';
    this.radiationWarningEl.className = 'hud-radiation-warning hidden';
    this.radiationWarningEl.style.display = 'none';
    this.radiationWarningEl.innerHTML = `
      <span class="hud-radiation-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <circle cx="12" cy="12" r="2.2"/>
          <path d="M12 2a10 10 0 0 0-8.66 5l4.33 2.5a5 5 0 0 1 8.66 0L20.66 7A10 10 0 0 0 12 2z" opacity="0.95"/>
          <path d="M12 22a10 10 0 0 0 8.66-5l-4.33-2.5a5 5 0 0 1-4.33 2.5V22z" opacity="0.95"/>
          <path d="M3.34 17A10 10 0 0 0 12 22v-5a5 5 0 0 1-4.33-2.5L3.34 17z" opacity="0.95"/>
          <circle cx="12" cy="12" r="10.4" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
        </svg>
      </span>
      <span>ALERTA DE RADIAÇÃO — AFASTE-SE!</span>
    `;
    uiLayer.appendChild(this.radiationWarningEl);

    this.hordeBannerEl = document.createElement('div');
    this.hordeBannerEl.id = 'hud-horde-countdown';
    this.hordeBannerEl.className = 'hud-horde-banner hidden';
    this.hordeBannerEl.innerHTML = `
      <span class="hud-horde-skull-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C7.03 2 3 5.82 3 10.5c0 2.86 1.48 5.39 3.74 6.95V20c0 .55.45 1 1 1h8.52c.55 0 1-.45 1-1v-2.55C19.52 15.89 21 13.36 21 10.5 21 5.82 16.97 2 12 2zm-3.2 10.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm6.4 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm-2.2 6h-2v-2.2h2v2.2z"/>
        </svg>
      </span>
      <span class="hud-horde-identity">
        <span class="hud-horde-title">HORDA</span>
        <span id="hud-horde-num" class="hud-horde-num">1</span>
      </span>
      <span class="hud-horde-timer-chip">
        <span id="hud-horde-sec" class="hud-horde-sec-val">10</span><span class="hud-horde-sec-unit">s</span>
      </span>
      <div class="hud-horde-progress-track">
        <div id="hud-horde-progress" class="hud-horde-progress-fill" style="width: 100%;"></div>
      </div>
    `;
    this.hordeNumEl = this.hordeBannerEl.querySelector('#hud-horde-num');
    this.hordeSecEl = this.hordeBannerEl.querySelector('#hud-horde-sec');
    this.hordeProgressEl = this.hordeBannerEl.querySelector('#hud-horde-progress');
    this._hordeHideTimeout = null;
    uiLayer.appendChild(this.hordeBannerEl);
  }

  /**
   * Shows and updates the red infinite horde countdown banner ("HORDA N | SSs").
   * Uses the same smooth fade/scale transition curve as the status HUD pills.
   */
  setHordeCountdown(hordeNum, secondsRemaining) {
    if (!this.hordeBannerEl || !this.hordeNumEl || !this.hordeSecEl) return;
    if (this._hordeHideTimeout) {
      clearTimeout(this._hordeHideTimeout);
      this._hordeHideTimeout = null;
    }

    const sec = Math.max(0, Math.ceil(Number(secondsRemaining) || 0));
    const num = Math.max(1, Math.floor(Number(hordeNum) || 1));
    this.hordeNumEl.textContent = String(num);
    this.hordeSecEl.textContent = String(sec);
    if (this.hordeProgressEl) {
      const pct = Math.max(0, Math.min(100, (sec / 10) * 100));
      this.hordeProgressEl.style.width = `${pct}%`;
    }
    this.hordeBannerEl.classList.toggle('is-urgent', sec <= 3);

    const wasHidden = this.hordeBannerEl.classList.contains('hidden');
    if (wasHidden) {
      this.hordeBannerEl.classList.remove('hidden');
      // Force layout before adding is-visible so CSS opacity/transform fade-in plays smoothly
      void this.hordeBannerEl.offsetWidth;
    }
    this.hordeBannerEl.classList.add('is-visible');
  }

  /**
   * Smoothly fades out the horde countdown HUD (or hides immediately on reset).
   */
  hideHordeCountdown(immediate = false) {
    if (!this.hordeBannerEl) return;
    if (this._hordeHideTimeout) {
      clearTimeout(this._hordeHideTimeout);
      this._hordeHideTimeout = null;
    }
    this.hordeBannerEl.classList.remove('is-urgent');
    if (immediate) {
      this.hordeBannerEl.classList.remove('is-visible');
      this.hordeBannerEl.classList.add('hidden');
      return;
    }
    this.hordeBannerEl.classList.remove('is-visible');
    this._hordeHideTimeout = setTimeout(() => {
      if (this.hordeBannerEl && !this.hordeBannerEl.classList.contains('is-visible')) {
        this.hordeBannerEl.classList.add('hidden');
      }
      this._hordeHideTimeout = null;
    }, 440);
  }

  /**
   * Switches the HUD between:
   * - Slot 1: 'hk_usp' (9MM - 12 compact cartridges)
   * - Slot 2: 'desert_eagle' (.50 AE - 7 heavy brass cartridges)
   * - Slot 3: 'shotgun' (12 GAUGE - 6 red shotshells)
   * - Slot 4: 'hk_mp5' (9MM - 30 submachine gun cartridges)
   */
  setWeapon(weaponType, currentAmmo, maxAmmo, reserveDisplay = null) {
    this.currentWeapon = weaponType;
    this.currentAmmo = currentAmmo;
    this.maxAmmo = maxAmmo;
    this._lastReportedAmmo = null;
    this._lastReportedMax = null;

    if (this.caliberTextEl) {
      if (weaponType === 'hk_usp') {
        this.caliberTextEl.textContent = 'HK USP';
      } else if (weaponType === 'hk_mp5') {
        this.caliberTextEl.textContent = 'HK MP5';
      } else if (weaponType === 'shotgun') {
        this.caliberTextEl.textContent = 'REMINGTON 870';
      } else if (weaponType === 'colt_peacemaker') {
        this.caliberTextEl.textContent = 'COLT PEACEMAKER';
      } else if (weaponType === 'mac_10') {
        this.caliberTextEl.textContent = 'INGRAM MAC-10';
      } else if (weaponType === 'akms_gold') {
        this.caliberTextEl.textContent = 'AK 47 GOLD';
      } else if (weaponType === 'm134_minigun') {
        this.caliberTextEl.textContent = 'M134 MINIGUN';
      } else {
        this.caliberTextEl.textContent = 'DESERT EAGLE';
      }
    }
    if (this.modeTagEl) {
      if (weaponType === 'm134_minigun') {
        this.modeTagEl.textContent = 'ROTARY';
      } else if (weaponType === 'hk_mp5' || weaponType === 'mac_10' || weaponType === 'akms_gold') {
        this.modeTagEl.textContent = 'FULL-AUTO';
      } else if (weaponType === 'shotgun') {
        this.modeTagEl.textContent = 'PUMP-ACTION';
      } else if (weaponType === 'colt_peacemaker') {
        this.modeTagEl.textContent = 'REVOLVER';
      } else {
        this.modeTagEl.textContent = 'SEMI-AUTO';
      }
    }

    this._buildBulletPips();
    this.updateAmmo(currentAmmo, maxAmmo, true, reserveDisplay);
  }

  _buildBulletPips() {
    this.bulletPips = [];
    this.pipsContainerEl.innerHTML = '';

    const isShotgun = this.currentWeapon === 'shotgun';
    const isMinigun = this.currentWeapon === 'm134_minigun';
    const is30Rd = this.currentWeapon === 'hk_mp5' || this.currentWeapon === 'mac_10' || this.currentWeapon === 'akms_gold';
    const is9mm = this.currentWeapon === 'hk_usp' || is30Rd;

    if (isMinigun) {
      this.pipsContainerEl.classList.remove('rack-mp5');
      this.pipsContainerEl.classList.add('rack-minigun');
    } else if (is30Rd) {
      this.pipsContainerEl.classList.remove('rack-minigun');
      this.pipsContainerEl.classList.add('rack-mp5');
    } else {
      this.pipsContainerEl.classList.remove('rack-mp5', 'rack-minigun');
    }

    const visualPipCount = isMinigun ? 40 : this.maxAmmo;
    for (let i = 0; i < visualPipCount; i++) {
      const pip = document.createElement('div');
      if (isShotgun) {
        pip.className = 'bullet-pip shotshell-pip';
        pip.innerHTML = `
          <div class="shell-crimp"></div>
          <div class="shell-hull"></div>
          <div class="shell-brass"></div>
          <div class="shell-rim"></div>
        `;
      } else if (is9mm || isMinigun) {
        pip.className = (is30Rd || isMinigun) ? 'bullet-pip pip-9mm pip-mp5' : 'bullet-pip pip-9mm';
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
  updateAmmo(current, max = 7, force = false, reserveDisplay = null) {
    if (this.ammoReserveEl) {
      if (reserveDisplay !== null && reserveDisplay !== undefined) {
        this.ammoReserveEl.textContent = String(reserveDisplay);
      } else if (this.currentWeapon === 'hk_usp') {
        this.ammoReserveEl.textContent = '∞';
      } else {
        const ws = typeof window !== 'undefined' ? (window.__rocWeaponSystem || window.weaponSystem) : null;
        const wData = ws && ws.weapons ? ws.weapons[this.currentWeapon] : null;
        this.ammoReserveEl.textContent = wData && wData.infiniteReserve ? '∞' : String(wData?.reserveAmmo ?? 0);
      }
    }

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

    // Update bullet pips state (delta-only when 1:1, proportional belt scaling for high-capacity weapons)
    const activePips = this.bulletPips.length === max
      ? current
      : (current <= 0 ? 0 : Math.ceil((current / Math.max(1, max)) * this.bulletPips.length));

    if (!force && this.bulletPips.length === max && prevAmmo !== null && current === prevAmmo - 1 && this.bulletPips[current]) {
      const pip = this.bulletPips[current];
      pip.classList.add('spent');
      pip.style.opacity = '';
      pip.style.transform = '';
    } else {
      for (let i = 0; i < this.bulletPips.length; i++) {
        const pip = this.bulletPips[i];
        if (i < activePips) {
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

    const isMinigun = this.currentWeapon === 'm134_minigun';
    const is30Rd = this.currentWeapon === 'hk_mp5' || this.currentWeapon === 'mac_10' || this.currentWeapon === 'akms_gold';
    const lowThreshold = isMinigun ? 30 : (is30Rd ? 6 : 2);

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
  onShotgunShellInserted(current, max = 6, reserveDisplay = null) {
    this.updateAmmo(current, max, true, reserveDisplay);
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
  onReloadComplete(previousAmmo = 0, loadedAmmo = null, reserveDisplay = null) {
    const finalAmmo = loadedAmmo !== null && loadedAmmo !== undefined ? loadedAmmo : this.maxAmmo;
    this.updateAmmo(finalAmmo, this.maxAmmo, true, reserveDisplay);

    const startIdx = Math.max(0, Math.min(this.bulletPips.length, previousAmmo));
    const endIdx = Math.max(startIdx, Math.min(this.bulletPips.length, finalAmmo));

    // Staggered cartridge refill pop animation via CSS only for newly loaded pips
    for (let i = startIdx; i < endIdx; i++) {
      const pip = this.bulletPips[i];
      pip.classList.remove('spent');
      pip.style.transform = '';
      pip.style.opacity = '';

      // Trigger crisp CSS animation
      pip.classList.remove('refilling');
      void pip.offsetWidth; // Force reflow
      const is30Rd = this.currentWeapon === 'hk_mp5' || this.currentWeapon === 'mac_10' || this.currentWeapon === 'akms_gold';
      const delayStep = is30Rd ? 18 : 35;
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
        <span class="tut-key">TAB</span>
        <span class="tut-label">escolher arma</span>
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

    this._dialogueStackEl = this.phoneDialogueEl.querySelector('.phone-dialogue-stack');
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

    const showSafeZone = this._safeZoneActive && this._gameplayActive;
    if (this._lastSafeZoneVisible !== showSafeZone) {
      this._lastSafeZoneVisible = showSafeZone;
      this._applyOverlayVisibility(this.safeZoneBannerEl, showSafeZone, { instant: true, centerX: true });
    }

    const showStatusHud = this._statusHudVisible && this._gameplayActive;
    if (this._lastStatusHudShown !== showStatusHud && this.topRightStatusEl) {
      this._lastStatusHudShown = showStatusHud;
      if (instant) {
        this.topRightStatusEl.classList.add('no-anim');
        this.topRightStatusEl.classList.toggle('is-revealed', showStatusHud);
        void this.topRightStatusEl.offsetWidth;
        this.topRightStatusEl.classList.remove('no-anim');
      } else {
        if (showStatusHud) {
          this.topRightStatusEl.classList.remove('no-anim');
          void this.topRightStatusEl.offsetWidth;
        }
        this.topRightStatusEl.classList.toggle('is-revealed', showStatusHud);
      }
    }
  }

  setStatusHudVisible(visible, instant = false) {
    this._statusHudVisible = !!visible;
    this._syncIntroOverlays(instant);
  }

  onResize() {
    // Re-clamp dynamic HUD overlays if viewport narrows dramatically
    if (this.topRightStatusEl) {
      const maxW = Math.max(120, window.innerWidth - 24);
      this.topRightStatusEl.style.maxWidth = `${maxW}px`;
    }
    if (this.safeZoneBannerEl) {
      this.safeZoneBannerEl.style.maxWidth = `${Math.max(160, window.innerWidth - 24)}px`;
    }
    if (this.radiationWarningEl) {
      this.radiationWarningEl.style.maxWidth = `${Math.max(180, window.innerWidth - 24)}px`;
    }
  }

  setSafeZoneVisible(visible) {
    this._safeZoneActive = !!visible;
    this._syncIntroOverlays();
  }

  setHealth(hp, maxHp = 100) {
    const safeMax = Math.max(1, Number(maxHp) || 100);
    const safeHp = Math.max(0, Math.min(safeMax, Number(hp) || 0));
    this._statusHp = safeHp;
    this._statusMaxHp = safeMax;

    if (!this.hpBarFillEl) return;
    const pct = (safeHp / safeMax) * 100;
    this.hpBarFillEl.style.width = `${pct.toFixed(2)}%`;
    this.hpBarFillEl.classList.toggle('is-critical', safeHp > 0 && pct <= 28.0);
  }

  setMoney(money, deltaAmount = 0) {
    const next = Math.max(0, Math.floor(Number(money) || 0));
    this._targetMoney = next;

    if (deltaAmount < 0 || next === 0) {
      // Snap down smoothly/quickly on spend or reset
      if (next === 0) {
        this._displayMoney = 0;
        this._renderMoneyText(0);
      }
    }
  }

  _renderMoneyText(value) {
    if (!this.moneyValueEl) return;
    const formatted = `$ ${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
    if (this._lastRenderedMoneyText !== formatted) {
      this._lastRenderedMoneyText = formatted;
      this.moneyValueEl.textContent = formatted;
    }
  }

  setKills(kills) {
    const k = Math.max(0, Math.floor(Number(kills) || 0));
    this._killsCount = k;
    if (this.killsValueEl) {
      this.killsValueEl.textContent = String(k);
    }
  }

  /**
   * Triggers center-screen kill confirmation: crosshair X snap, floating +$XXX cash pop,
   * and the bullet-pierced crimson skull HEADSHOT emblem on headshots.
   */
  triggerKillFeedback(rewardAmount = 0, isHeadshot = false) {
    const amount = Math.max(0, Math.floor(Number(rewardAmount) || 0));

    if (this.killMarkerEl) {
      this.killMarkerEl.classList.remove('is-active', 'is-headshot');
      void this.killMarkerEl.offsetWidth;
      if (isHeadshot) {
        this.killMarkerEl.classList.add('is-headshot');
      }
      this.killMarkerEl.classList.add('is-active');
    }

    if (amount > 0 && this._killCashPool && this._killCashPool.length > 0) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const rapid = now - this._lastKillPopTime < 460;
      this._lastKillPopTime = now;

      const staggerOffsets = [0, -28, 28, -16, 16];
      this._killStreakStagger = rapid ? (this._killStreakStagger + 1) % staggerOffsets.length : 0;
      const offsetX = staggerOffsets[this._killStreakStagger];

      const pop = this._killCashPool[this._killCashPoolIdx];
      this._killCashPoolIdx = (this._killCashPoolIdx + 1) % this._killCashPool.length;
      pop.textContent = `+$${amount.toLocaleString('en-US')}`;
      pop.style.setProperty('--pop-x', `${offsetX}px`);
      pop.classList.remove('is-animating', 'is-headshot');
      void pop.offsetWidth;
      if (isHeadshot) {
        pop.classList.add('is-headshot');
      }
      pop.classList.add('is-animating');
    }

    if (isHeadshot && this.headshotBannerEl) {
      this.headshotBannerEl.classList.remove('is-active');
      void this.headshotBannerEl.offsetWidth;
      this.headshotBannerEl.classList.add('is-active');
    }
  }

  updateStatusTicker(delta) {
    if (Math.abs(this._targetMoney - this._displayMoney) < 0.5) {
      if (this._displayMoney !== this._targetMoney) {
        this._displayMoney = this._targetMoney;
        this._renderMoneyText(this._displayMoney);
      }
      return;
    }
    const step = (this._targetMoney - this._displayMoney) * Math.min(1, delta * 14);
    this._displayMoney += Math.abs(step) < 1 ? Math.sign(this._targetMoney - this._displayMoney) : step;
    this._renderMoneyText(this._displayMoney);
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

  /**
   * Synchronously clears previous dialogue text, speaker rows, and transitions BEFORE
   * opening a new phone call so there is zero 1-frame flash of stale speaker state.
   */
  resetPhoneDialogueImmediate(topSpeaker = 'jorio') {
    if (!this.phoneDialogueEl) return;
    if (this.phoneDialogueEl._hideTimer) {
      clearTimeout(this.phoneDialogueEl._hideTimer);
      this.phoneDialogueEl._hideTimer = null;
    }

    if (this._dialogueStackEl) {
      this._dialogueStackEl.classList.add('no-transitions');
    }

    this._phoneDialogueActive = false;
    this._lastPhoneDialogueVisible = false;
    this.phoneDialogueEl.classList.add('hidden');
    this.phoneDialogueEl.style.display = 'none';
    this.phoneDialogueEl.style.visibility = 'hidden';
    this.phoneDialogueEl.style.opacity = '0';

    const rocTop = topSpeaker === 'roc';
    if (this._dialogueCallerRow) {
      this._dialogueCallerRow.style.order = rocTop ? '1' : '0';
      this._dialogueCallerRow.classList.add('row-hidden');
      this._dialogueCallerRow.classList.remove('is-active', 'is-inactive');
      this._dialogueCallerRow.classList.add(rocTop ? 'is-inactive' : 'is-active');
    }
    if (this._dialoguePlayerRow) {
      this._dialoguePlayerRow.style.order = rocTop ? '0' : '1';
      this._dialoguePlayerRow.classList.add('row-hidden');
      this._dialoguePlayerRow.classList.remove('is-active', 'is-inactive');
      this._dialoguePlayerRow.classList.add(rocTop ? 'is-active' : 'is-inactive');
    }
    if (this._dialogueCallerTextEl) this._dialogueCallerTextEl.textContent = '';
    if (this._dialoguePlayerTextEl) this._dialoguePlayerTextEl.textContent = '';

    this._lastDialogueSnapshot = {
      topSpeaker,
      showCallerRow: false,
      showPlayerRow: false,
      activeSpeaker: rocTop ? 'roc' : 'jorio',
      callerText: '',
      playerText: '',
      skipHintText: '[ESPAÇO] PULAR ▸',
    };

    if (this._dialogueStackEl) {
      void this._dialogueStackEl.offsetWidth;
      this._dialogueStackEl.classList.remove('no-transitions');
    }
  }

  setPhoneDialogueState({ topSpeaker = 'jorio', showCallerRow = true, showPlayerRow, activeSpeaker, callerText, playerText, skipHintText }) {
    const snap = this._lastDialogueSnapshot;
    const isJorioActive = activeSpeaker === 'jorio';

    if (snap.topSpeaker !== topSpeaker) {
      snap.topSpeaker = topSpeaker;
      const rocTop = topSpeaker === 'roc';
      if (this._dialogueCallerRow) {
        this._dialogueCallerRow.style.order = rocTop ? '1' : '0';
      }
      if (this._dialoguePlayerRow) {
        this._dialoguePlayerRow.style.order = rocTop ? '0' : '1';
      }
    }

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

    if (snap.showCallerRow !== !!showCallerRow) {
      snap.showCallerRow = !!showCallerRow;
      if (this._dialogueCallerRow) {
        this._dialogueCallerRow.classList.toggle('row-hidden', !snap.showCallerRow);
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

  triggerDamageFlash(currentHp, _maxHp = 100) {
    this._damageFlashAlpha = currentHp <= 0 ? 0.96 : 0.85;
  }

  triggerHealVignette() {
    this._healVignetteActive = true;
    this._healVignetteTimer = 0;
  }

  setRadiationExposure(proximity = 0) {
    const clamped = Math.max(0, Math.min(1, Number(proximity) || 0));
    this._radiationExposure = clamped;
    if (clamped > 0.001) {
      this._radiationHoldTimer = 0.60;
    }
  }

  triggerRadiationBurst() {
    this._radiationBurstAlpha = 0.92;
    this._radiationHoldTimer = Math.max(this._radiationHoldTimer, 1.25);
  }

  updateRadiationEffects(delta) {
    if (this._radiationBurstAlpha > 0) {
      this._radiationBurstAlpha = Math.max(0, this._radiationBurstAlpha - delta * 1.35);
    }

    const activeExposure = this._gameplayActive && this._radiationExposure > 0.001;
    if (activeExposure) {
      this._radiationHoldTimer = 0.60;
    } else if (this._radiationHoldTimer > 0) {
      this._radiationHoldTimer = Math.max(0, this._radiationHoldTimer - delta);
    }

    if (this.radiationOverlayEl) {
      let passivePulse = 0;
      if (activeExposure) {
        this._radiationPulsePhase += delta * (4.2 + this._radiationExposure * 4.5);
        passivePulse = 0.45 + 0.10 * Math.sin(this._radiationPulsePhase); // 0.35 <-> 0.55 pulse
      }
      const targetOverlayOpacity = this._gameplayActive
        ? Math.min(0.95, Math.max(passivePulse, this._radiationBurstAlpha))
        : 0;
      if (Math.abs(targetOverlayOpacity - this._lastRadiationOverlayOpacity) > 0.005) {
        this._lastRadiationOverlayOpacity = targetOverlayOpacity;
        this.radiationOverlayEl.style.opacity = targetOverlayOpacity.toFixed(3);
      }
    }

    if (this.radiationWarningEl) {
      const showWarning = this._gameplayActive && (activeExposure || this._radiationHoldTimer > 0);
      if (this._lastRadiationWarningVisible !== showWarning) {
        this._lastRadiationWarningVisible = showWarning;
        this._applyOverlayVisibility(this.radiationWarningEl, showWarning, { fadeMs: 250, centerX: true });
      }
    }
  }

  resetRadiationWarning() {
    this._radiationExposure = 0;
    this._radiationBurstAlpha = 0;
    this._radiationPulsePhase = 0;
    this._radiationHoldTimer = 0;
    this._lastRadiationOverlayOpacity = 0;
    if (this.radiationOverlayEl) {
      this.radiationOverlayEl.style.opacity = '0';
    }
    this._lastRadiationWarningVisible = false;
    if (this.radiationWarningEl) {
      this._applyOverlayVisibility(this.radiationWarningEl, false, { instant: true, centerX: true });
    }
  }

  updateDamageVignette(delta, currentHp = 100, maxHp = 100) {
    this.updateRadiationEffects(delta);

    if (this.healVignetteEl && this._healVignetteActive) {
      this._healVignetteTimer += delta;
      const pulseIn = 0.15;
      const fadeOut = 0.75;
      let hAlpha = 0;
      if (this._healVignetteTimer <= pulseIn) {
        hAlpha = this._healVignetteTimer / pulseIn;
      } else if (this._healVignetteTimer < pulseIn + fadeOut) {
        const t = (this._healVignetteTimer - pulseIn) / fadeOut;
        hAlpha = Math.max(0, 1.0 - t * t * (3 - 2 * t));
      } else {
        this._healVignetteActive = false;
        hAlpha = 0;
      }
      if (Math.abs(hAlpha - this._lastHealVignetteOpacity) > 0.005) {
        this._lastHealVignetteOpacity = hAlpha;
        this.healVignetteEl.style.opacity = hAlpha.toFixed(3);
      }
    }

    if (!this.damageVignetteEl) return;
    if (this._damageFlashAlpha > 0) {
      this._damageFlashAlpha = Math.max(0, this._damageFlashAlpha - delta * 2.1);
    }

    const safeMax = Math.max(1, Number(maxHp) || 100);
    const hpPct = (Math.max(0, Number(currentHp) || 0) / safeMax) * 100;
    let baseCritical = 0;
    if (currentHp > 0 && hpPct <= 34.0) {
      this._damagePulsePhase += delta * 5.2;
      baseCritical = 0.20 + 0.09 * Math.sin(this._damagePulsePhase);
    } else if (currentHp > 0 && hpPct <= 68.0) {
      baseCritical = 0.08;
    }

    const targetOpacity = Math.min(1.0, Math.max(this._damageFlashAlpha, baseCritical));
    if (Math.abs(targetOpacity - this._lastVignetteOpacity) > 0.005) {
      this._lastVignetteOpacity = targetOpacity;
      this.damageVignetteEl.style.opacity = targetOpacity.toFixed(3);
    }
  }

  resetDamageVignette() {
    this.resetRadiationWarning();
    this._damageFlashAlpha = 0;
    this._damagePulsePhase = 0;
    this._lastVignetteOpacity = 0;
    if (this.damageVignetteEl) {
      this.damageVignetteEl.style.opacity = '0';
    }
    this._healVignetteActive = false;
    this._healVignetteTimer = 0;
    this._lastHealVignetteOpacity = 0;
    if (this.healVignetteEl) {
      this.healVignetteEl.style.opacity = '0';
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
    this.setSafeZoneVisible(false);
    this.hideHordeCountdown(true);
    this.setStatusHudVisible(false, true);
    this.setHealth(100, 100);
    this._displayMoney = 0;
    this._targetMoney = 0;
    this._renderMoneyText(0);
    this.setKills(0);
    if (this.killMarkerEl) {
      this.killMarkerEl.classList.remove('is-active', 'is-headshot');
    }
    if (this.headshotBannerEl) {
      this.headshotBannerEl.classList.remove('is-active');
    }
    if (this._killCashPool) {
      for (let i = 0; i < this._killCashPool.length; i++) {
        this._killCashPool[i].classList.remove('is-animating', 'is-headshot');
      }
    }
    this.resetPhoneDialogueImmediate('jorio');

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
