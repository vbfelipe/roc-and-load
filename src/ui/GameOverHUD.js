import { getSlotWeaponSilhouetteSVG } from './WeaponWheelHUD.js';

const ARSENAL_DISPLAY_ORDER = [
  { id: 'hk_usp', shortName: 'HK USP', isLegendary: false },
  { id: 'desert_eagle', shortName: 'DESERT EAGLE', isLegendary: false },
  { id: 'shotgun', shortName: 'REM. 870', isLegendary: false },
  { id: 'hk_mp5', shortName: 'HK MP5', isLegendary: false },
  { id: 'colt_peacemaker', shortName: 'PEACEMAKER', isLegendary: false },
  { id: 'mac_10', shortName: 'MAC-10', isLegendary: true },
  { id: 'akms_gold', shortName: 'AK 47 GOLD', isLegendary: true },
  { id: 'm134_minigun', shortName: 'MINIGUN', isLegendary: true },
];

function formatMoneyValue(value) {
  const safe = Math.max(0, Math.round(Number(value) || 0));
  return safe.toLocaleString('pt-BR');
}

function formatSurvivalTime(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Tactical After-Action Game Over Screen (#game-over-screen).
 * Renders visual KPI pillars, segmented kill-type distribution bar,
 * and an SVG silhouette shelf of unlocked weapons.
 */
export class GameOverHUD {
  constructor({ sound = null, onRetry = null, onMainMenu = null } = {}) {
    this.sound = sound;
    this.onRetry = onRetry;
    this.onMainMenu = onMainMenu;
    this.rootEl = document.getElementById('game-over-screen');
    this._animRaf = null;
    this.isVisible = false;

    if (this.rootEl) {
      this._buildDOM();
    }
  }

  _buildDOM() {
    this.rootEl.innerHTML = `
      <div class="go-backdrop-vignette" aria-hidden="true"></div>
      <div class="go-hero-art" aria-hidden="true"></div>

      <div class="go-right-panel" role="dialog" aria-modal="true" aria-labelledby="go-title">
        <div class="go-header">
          <h1 id="go-title" class="go-title">GAME OVER</h1>
          <p id="go-subtitle" class="go-subtitle">A horda tomou o escritório.</p>
        </div>

        <div class="go-hero-strip">
          <div class="go-kpi-card is-hordes">
            <div class="go-kpi-top">
              <span class="go-kpi-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4z"/>
                </svg>
              </span>
              <span class="go-kpi-label">HORDAS SOBREVIVIDAS</span>
            </div>
            <div id="go-val-hordes" class="go-kpi-value">0</div>
            <div id="go-sub-hordes" class="go-kpi-sub">Onda inicial</div>
          </div>

          <div class="go-kpi-card is-kills">
            <div class="go-kpi-top">
              <span class="go-kpi-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <line x1="12" y1="2" x2="12" y2="6"/>
                  <line x1="12" y1="18" x2="12" y2="22"/>
                  <line x1="2" y1="12" x2="6" y2="12"/>
                  <line x1="18" y1="12" x2="22" y2="12"/>
                </svg>
              </span>
              <span class="go-kpi-label">ABATES TOTAIS</span>
            </div>
            <div id="go-val-kills" class="go-kpi-value">0</div>
            <div id="go-sub-kills" class="go-kpi-sub">0 headshots (0%)</div>
          </div>

          <div class="go-kpi-card is-time">
            <div class="go-kpi-top">
              <span class="go-kpi-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9"/>
                  <polyline points="12 7 12 12 15.5 14"/>
                </svg>
              </span>
              <span class="go-kpi-label">TEMPO JOGADO</span>
            </div>
            <div id="go-val-time" class="go-kpi-value is-mono">00:00</div>
            <div class="go-kpi-sub">Em combate ativo</div>
          </div>

          <div class="go-kpi-card is-money">
            <div class="go-kpi-top">
              <span class="go-kpi-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="2" x2="12" y2="22"/>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </span>
              <span class="go-kpi-label">DINHEIRO OBTIDO</span>
            </div>
            <div id="go-val-money" class="go-kpi-value is-mono">0</div>
            <div id="go-sub-money" class="go-kpi-sub">Saldo final: 0</div>
          </div>
        </div>

        <div class="go-section-card go-breakdown-card">
          <div class="go-section-head">
            <span class="go-section-title">AMEAÇAS ELIMINADAS POR TIPO</span>
            <span id="go-hs-pill" class="go-hs-pill">0% HEADSHOTS</span>
          </div>

          <div class="go-seg-bar-track" aria-hidden="true">
            <div id="go-bar-woman" class="go-seg-bar is-woman" style="width: 0%;"></div>
            <div id="go-bar-man" class="go-seg-bar is-man" style="width: 0%;"></div>
            <div id="go-bar-hazmat" class="go-seg-bar is-hazmat" style="width: 0%;"></div>
          </div>

          <div class="go-archetype-row">
            <div class="go-arch-chip is-woman-chip">
              <span class="go-arch-name">INFECTADAS</span>
              <span id="go-val-woman" class="go-arch-count">0</span>
            </div>
            <div class="go-arch-chip is-man-chip">
              <span class="go-arch-name">INFECTADOS</span>
              <span id="go-val-man" class="go-arch-count">0</span>
            </div>
            <div class="go-arch-chip is-hazmat-chip">
              <span class="go-arch-name">HAZMAT</span>
              <span id="go-val-hazmat" class="go-arch-count">0</span>
            </div>
            <div class="go-arch-chip is-hs-chip">
              <span class="go-arch-name">HEADSHOTS</span>
              <span id="go-val-hs" class="go-arch-count">0</span>
            </div>
          </div>
        </div>

        <div class="go-section-card go-arsenal-card">
          <div class="go-section-head">
            <span class="go-section-title">ARSENAL DESBLOQUEADO</span>
            <span id="go-arsenal-count" class="go-arsenal-count">1 / 8</span>
          </div>
          <div id="go-arsenal-grid" class="go-arsenal-grid"></div>
        </div>

        <div class="go-actions">
          <button id="game-over-exit-btn" type="button" class="tactical-btn exit-btn go-tactical-btn">
            <span class="btn-content">
              <span>SAIR</span>
              <span class="btn-chevron" aria-hidden="true">▸</span>
            </span>
          </button>
          <button id="game-over-retry-btn" type="button" class="tactical-btn go-tactical-btn">
            <span class="btn-content">
              <span>JOGAR NOVAMENTE</span>
              <span class="btn-chevron" aria-hidden="true">▸</span>
            </span>
          </button>
        </div>
      </div>
    `;

    this.subtitleEl = this.rootEl.querySelector('#go-subtitle');
    this.valHordesEl = this.rootEl.querySelector('#go-val-hordes');
    this.subHordesEl = this.rootEl.querySelector('#go-sub-hordes');
    this.valKillsEl = this.rootEl.querySelector('#go-val-kills');
    this.subKillsEl = this.rootEl.querySelector('#go-sub-kills');
    this.valTimeEl = this.rootEl.querySelector('#go-val-time');
    this.valMoneyEl = this.rootEl.querySelector('#go-val-money');
    this.subMoneyEl = this.rootEl.querySelector('#go-sub-money');

    this.hsPillEl = this.rootEl.querySelector('#go-hs-pill');
    this.barWomanEl = this.rootEl.querySelector('#go-bar-woman');
    this.barManEl = this.rootEl.querySelector('#go-bar-man');
    this.barHazmatEl = this.rootEl.querySelector('#go-bar-hazmat');

    this.valWomanEl = this.rootEl.querySelector('#go-val-woman');
    this.valManEl = this.rootEl.querySelector('#go-val-man');
    this.valHazmatEl = this.rootEl.querySelector('#go-val-hazmat');
    this.valHsEl = this.rootEl.querySelector('#go-val-hs');

    this.arsenalCountEl = this.rootEl.querySelector('#go-arsenal-count');
    this.arsenalGridEl = this.rootEl.querySelector('#go-arsenal-grid');

    this.retryBtnEl = this.rootEl.querySelector('#game-over-retry-btn');
    this.exitBtnEl = this.rootEl.querySelector('#game-over-exit-btn');

    this._bindButton(this.retryBtnEl, () => {
      if (this.sound && typeof this.sound.playStartClick === 'function') {
        this.sound.playStartClick();
      }
      if (typeof this.onRetry === 'function') this.onRetry();
    });

    this._bindButton(this.exitBtnEl, () => {
      if (typeof this.onMainMenu === 'function') this.onMainMenu();
    });
  }

  _bindButton(btn, handler) {
    if (!btn) return;
    btn.addEventListener('pointerenter', () => {
      if (btn.offsetParent !== null && this.sound && typeof this.sound.playButtonHover === 'function') {
        this.sound.playButtonHover();
      }
    });
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('mouseup', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handler();
    });
  }

  _renderArsenal(unlockedSet) {
    if (!this.arsenalGridEl) return;
    let unlockedCount = 0;

    const cardsHtml = ARSENAL_DISPLAY_ORDER.map((gun, idx) => {
      const unlocked = unlockedSet.has(gun.id);
      if (unlocked) unlockedCount++;
      const gradId = `go-metal-grad-${idx}`;
      const legendClass = gun.isLegendary ? ' is-legendary' : '';
      const stateClass = unlocked ? 'is-unlocked' : 'is-locked';

      return `
        <div class="go-gun-card ${stateClass}${legendClass}" title="${gun.shortName}${unlocked ? '' : ' (Bloqueada)'}">
          ${gun.isLegendary ? '<span class="go-gun-star" aria-hidden="true">★</span>' : ''}
          <svg class="go-gun-svg" viewBox="-64 -38 128 76" aria-hidden="true">
            <defs>
              <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="${gun.isLegendary && unlocked ? '#fef08a' : '#e2e8f0'}" />
                <stop offset="55%" stop-color="${gun.isLegendary && unlocked ? '#f59e0b' : '#cbd5e1'}" />
                <stop offset="100%" stop-color="${gun.isLegendary && unlocked ? '#b45309' : '#64748b'}" />
              </linearGradient>
            </defs>
            ${getSlotWeaponSilhouetteSVG(gun.id, `url(#${gradId})`)}
          </svg>
          <span class="go-gun-name">${gun.shortName}</span>
        </div>
      `;
    }).join('');

    this.arsenalGridEl.innerHTML = cardsHtml;
    if (this.arsenalCountEl) {
      this.arsenalCountEl.textContent = `${unlockedCount} / ${ARSENAL_DISPLAY_ORDER.length}`;
    }
  }

  show(stats = {}) {
    if (!this.rootEl) return;
    if (this._animRaf) {
      cancelAnimationFrame(this._animRaf);
      this._animRaf = null;
    }

    const hordesSurvived = Math.max(0, Math.floor(Number(stats.hordesSurvived) || 0));
    const currentHorde = Math.max(0, Math.floor(Number(stats.currentHordeReached) || 0));
    const womanKills = Math.max(0, Math.floor(Number(stats.womanKills) || 0));
    const manKills = Math.max(0, Math.floor(Number(stats.manKills) || 0));
    const hazmatKills = Math.max(0, Math.floor(Number(stats.hazmatKills) || 0));
    const totalKills = Math.max(womanKills + manKills + hazmatKills, Math.floor(Number(stats.totalKills) || 0));
    const headshots = Math.min(totalKills, Math.max(0, Math.floor(Number(stats.headshots) || 0)));
    const hsPct = totalKills > 0 ? Math.round((headshots / totalKills) * 100) : 0;
    const totalMoney = Math.max(0, Math.round(Number(stats.totalMoneyEarned) || 0));
    const currentMoney = Math.max(0, Math.round(Number(stats.currentMoney) || 0));
    const survivalSeconds = Math.max(0, Number(stats.survivalSeconds) || 0);
    const unlockedSet = new Set(Array.isArray(stats.unlockedWeapons) ? stats.unlockedWeapons : ['hk_usp']);

    if (this.subtitleEl) {
      this.subtitleEl.textContent = 'A horda tomou o escritório.';
    }
    if (this.subHordesEl) {
      this.subHordesEl.textContent = currentHorde > 0
        ? `Chegou até a Horda ${currentHorde}`
        : 'Antes das hordas infinitas';
    }
    if (this.subKillsEl) {
      this.subKillsEl.textContent = `${headshots} headshots (${hsPct}%)`;
    }
    if (this.subMoneyEl) {
      this.subMoneyEl.textContent = `Saldo final: ${formatMoneyValue(currentMoney)}`;
    }
    if (this.hsPillEl) {
      this.hsPillEl.textContent = `${hsPct}% HEADSHOTS`;
    }
    if (this.valTimeEl) {
      this.valTimeEl.textContent = formatSurvivalTime(survivalSeconds);
    }

    this._renderArsenal(unlockedSet);

    // Prepare segmented bar transition from 0 -> actual proportions
    if (this.barWomanEl) this.barWomanEl.style.width = '0%';
    if (this.barManEl) this.barManEl.style.width = '0%';
    if (this.barHazmatEl) this.barHazmatEl.style.width = '0%';

    this.isVisible = true;
    this.rootEl.classList.add('active');
    this.rootEl.setAttribute('aria-hidden', 'false');

    const wPct = totalKills > 0 ? (womanKills / totalKills) * 100 : 0;
    const mPct = totalKills > 0 ? (manKills / totalKills) * 100 : 0;
    const hPct = totalKills > 0 ? (hazmatKills / totalKills) * 100 : 0;

    requestAnimationFrame(() => {
      if (this.barWomanEl) this.barWomanEl.style.width = `${wPct.toFixed(2)}%`;
      if (this.barManEl) this.barManEl.style.width = `${mPct.toFixed(2)}%`;
      if (this.barHazmatEl) this.barHazmatEl.style.width = `${hPct.toFixed(2)}%`;
    });

    const startTime = performance.now();
    const durationMs = 680;
    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const ease = 1 - Math.pow(1 - t, 3);

      if (this.valHordesEl) this.valHordesEl.textContent = String(Math.round(hordesSurvived * ease));
      if (this.valKillsEl) this.valKillsEl.textContent = String(Math.round(totalKills * ease));
      if (this.valMoneyEl) this.valMoneyEl.textContent = formatMoneyValue(totalMoney * ease);
      if (this.valWomanEl) this.valWomanEl.textContent = String(Math.round(womanKills * ease));
      if (this.valManEl) this.valManEl.textContent = String(Math.round(manKills * ease));
      if (this.valHazmatEl) this.valHazmatEl.textContent = String(Math.round(hazmatKills * ease));
      if (this.valHsEl) this.valHsEl.textContent = String(Math.round(headshots * ease));

      if (t < 1 && this.isVisible) {
        this._animRaf = requestAnimationFrame(tick);
      } else {
        this._animRaf = null;
      }
    };
    this._animRaf = requestAnimationFrame(tick);
  }

  hide() {
    if (this._animRaf) {
      cancelAnimationFrame(this._animRaf);
      this._animRaf = null;
    }
    this.isVisible = false;
    if (this.rootEl) {
      this.rootEl.classList.remove('active');
      this.rootEl.setAttribute('aria-hidden', 'true');
    }
  }
}
