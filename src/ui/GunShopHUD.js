import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const GUN_SHOP_CATALOG = Object.freeze([
  {
    id: 'hk_usp',
    name: 'HK USP',
    caliber: '9×19MM PARABELLUM',
    price: 0,
    isLegendary: false,
    infiniteAmmo: true,
    ammoPackSize: 0,
    ammoPackPrice: 0,
    stats: {
      headDamage: '75 / 45',
      headPct: 68,
      bodyDamage: '35 / 18',
      bodyPct: 45,
      fireRate: 'Semi-Auto (0.16s)',
      ratePct: 58,
      capacity: '12 / ∞',
      capPct: 55,
    },
  },
  {
    id: 'shotgun',
    name: 'REMINGTON 870',
    caliber: '12 GAUGE BUCKSHOT',
    price: 3500,
    isLegendary: false,
    infiniteAmmo: false,
    ammoPackSize: 16,
    ammoPackPrice: 250,
    stats: {
      headDamage: '100',
      headPct: 100,
      bodyDamage: '80 / 55',
      bodyPct: 92,
      fireRate: 'Pump (0.78s)',
      ratePct: 24,
      capacity: '6 + 18',
      capPct: 34,
    },
  },
  {
    id: 'desert_eagle',
    name: 'DESERT EAGLE',
    caliber: '.50 ACTION EXPRESS',
    price: 5500,
    isLegendary: false,
    infiniteAmmo: false,
    ammoPackSize: 21,
    ammoPackPrice: 350,
    stats: {
      headDamage: '100',
      headPct: 100,
      bodyDamage: '70 / 45',
      bodyPct: 82,
      fireRate: 'Semi-Auto (0.28s)',
      ratePct: 44,
      capacity: '7 + 28',
      capPct: 42,
    },
  },
  {
    id: 'colt_peacemaker',
    name: 'COLT PEACEMAKER',
    caliber: '.45 LONG COLT',
    price: 8000,
    isLegendary: false,
    infiniteAmmo: false,
    ammoPackSize: 18,
    ammoPackPrice: 450,
    stats: {
      headDamage: '100',
      headPct: 100,
      bodyDamage: '85 / 55',
      bodyPct: 95,
      fireRate: 'Single-Action (0.42s)',
      ratePct: 36,
      capacity: '6 + 36',
      capPct: 46,
    },
  },
  {
    id: 'hk_mp5',
    name: 'HK MP5',
    caliber: '9×19MM SUBMACHINE',
    price: 12000,
    isLegendary: false,
    infiniteAmmo: false,
    ammoPackSize: 60,
    ammoPackPrice: 550,
    stats: {
      headDamage: '50 / 32',
      headPct: 56,
      bodyDamage: '24 / 14',
      bodyPct: 36,
      fireRate: 'Full-Auto (800 RPM)',
      ratePct: 88,
      capacity: '30 + 120',
      capPct: 88,
    },
  },
  {
    id: 'glock_flamengo',
    name: 'GLOCK 18 CUSTOM',
    caliber: '9×19MM TAMBOR 30RD',
    price: 35000,
    isLegendary: true,
    infiniteAmmo: false,
    ammoPackSize: 60,
    ammoPackPrice: 900,
    stats: {
      headDamage: '60 / 36',
      headPct: 66,
      bodyDamage: '28 / 15',
      bodyPct: 42,
      fireRate: 'Full-Auto (950 RPM)',
      ratePct: 100,
      capacity: '30 + 150',
      capPct: 96,
    },
  },
  {
    id: 'akms_gold',
    name: 'AKMS GOLD',
    caliber: '7.62×39MM SOVIET',
    price: 60000,
    isLegendary: true,
    infiniteAmmo: false,
    ammoPackSize: 60,
    ammoPackPrice: 1400,
    stats: {
      headDamage: '100 / 80',
      headPct: 100,
      bodyDamage: '55 / 35',
      bodyPct: 76,
      fireRate: 'Full-Auto (600 RPM)',
      ratePct: 78,
      capacity: '30 + 120',
      capPct: 88,
    },
  },
]);

function formatMoney(n) {
  return `$ ${Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('en-US')}`;
}

/**
 * 3D Interactive Military Crate Gun Shop HUD (#hud-gun-shop).
 * Clones already-loaded weapon .glb templates in memory (0 network loads, 0 frame drops).
 */
export class GunShopHUD {
  constructor({ weaponSystem, sound, getMoney, spendMoney, onClose, onWeaponUnlocked } = {}) {
    this.weaponSystem = weaponSystem;
    this.sound = sound;
    this.getMoney = getMoney || (() => 0);
    this.spendMoney = spendMoney || (() => false);
    this.onClose = onClose || null;
    this.onWeaponUnlocked = onWeaponUnlocked || null;

    this.isOpen = false;
    this.selectedId = 'shotgun';
    this._isViewportHovered = false;
    this._isCardHovered = false;
    this._thumbnailsGenerated = false;
    this._thumbnailDataUrls = new Map();
    this._showcaseModels = new Map();
    this._activeShowcaseModel = null;

    this._renderer = null;
    this._scene = null;
    this._camera = null;
    this._envRT = null;
    this._camZ = 2.15;

    window.isGunShopOpen = false;
    this._createDOM();
  }

  _createDOM() {
    this.rootEl = document.createElement('div');
    this.rootEl.id = 'hud-gun-shop';
    this.rootEl.innerHTML = `
      <div class="gunshop-shell" role="dialog" aria-label="Caixa de Suprimentos">
        <div class="gunshop-header">
          <div class="gunshop-header-title">CAIXA DE SUPRIMENTOS</div>
          <div class="gunshop-header-right">
            <div class="gunshop-balance-pill">
              <span>SALDO:</span>
              <span id="gunshop-balance-val">$ 0</span>
            </div>
            <button id="gunshop-close-btn" type="button" class="gunshop-close-btn" title="Fechar [ESC]" aria-label="Fechar">✕</button>
          </div>
        </div>
        <div class="gunshop-body">
          <div id="gunshop-catalog" class="gunshop-catalog"></div>
          <div class="gunshop-showcase">
            <div id="gunshop-viewport-box" class="gunshop-viewport-box">
              <canvas id="gunshop-3d-canvas"></canvas>
              <div class="gunshop-viewport-overlay">
                <div class="gunshop-detail-head">
                  <div id="gunshop-detail-title" class="gunshop-detail-title">REMINGTON 870</div>
                  <div id="gunshop-detail-caliber" class="gunshop-detail-subtitle">12 GAUGE BUCKSHOT</div>
                </div>
              </div>
              <div id="gunshop-detail-legendary" class="gunshop-legendary-badge gunshop-detail-legendary" style="display: none;">★ LENDÁRIA</div>
            </div>
            <div class="gunshop-stats-grid">
              <div class="gunshop-stat-row">
                <div class="gunshop-stat-top"><span>DANO CABEÇA</span><span id="gs-stat-head" class="gunshop-stat-val">100</span></div>
                <div class="gunshop-stat-bar"><div id="gs-bar-head" class="gunshop-stat-bar-fill" style="width: 100%;"></div></div>
              </div>
              <div class="gunshop-stat-row">
                <div class="gunshop-stat-top"><span>DANO CORPO</span><span id="gs-stat-body" class="gunshop-stat-val">80 / 55</span></div>
                <div class="gunshop-stat-bar"><div id="gs-bar-body" class="gunshop-stat-bar-fill" style="width: 90%;"></div></div>
              </div>
              <div class="gunshop-stat-row">
                <div class="gunshop-stat-top"><span>CADÊNCIA</span><span id="gs-stat-rate" class="gunshop-stat-val">Pump</span></div>
                <div class="gunshop-stat-bar"><div id="gs-bar-rate" class="gunshop-stat-bar-fill" style="width: 40%;"></div></div>
              </div>
              <div class="gunshop-stat-row">
                <div class="gunshop-stat-top"><span>CAPACIDADE</span><span id="gs-stat-cap" class="gunshop-stat-val">6 + 18</span></div>
                <div class="gunshop-stat-bar"><div id="gs-bar-cap" class="gunshop-stat-bar-fill" style="width: 40%;"></div></div>
              </div>
            </div>
            <div class="gunshop-actions">
              <button id="gunshop-buy-btn" type="button" class="gunshop-buy-btn">COMPRAR ARMA</button>
              <button id="gunshop-ammo-btn" type="button" class="gunshop-ammo-btn">+MUNIÇÃO</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.rootEl);

    this.balanceEl = this.rootEl.querySelector('#gunshop-balance-val');
    this.catalogEl = this.rootEl.querySelector('#gunshop-catalog');
    this.viewportBoxEl = this.rootEl.querySelector('#gunshop-viewport-box');
    this.canvasEl = this.rootEl.querySelector('#gunshop-3d-canvas');
    this.detailTitleEl = this.rootEl.querySelector('#gunshop-detail-title');
    this.detailCaliberEl = this.rootEl.querySelector('#gunshop-detail-caliber');
    this.detailLegendaryEl = this.rootEl.querySelector('#gunshop-detail-legendary');
    this.statHeadEl = this.rootEl.querySelector('#gs-stat-head');
    this.statBodyEl = this.rootEl.querySelector('#gs-stat-body');
    this.statRateEl = this.rootEl.querySelector('#gs-stat-rate');
    this.statCapEl = this.rootEl.querySelector('#gs-stat-cap');
    this.barHeadEl = this.rootEl.querySelector('#gs-bar-head');
    this.barBodyEl = this.rootEl.querySelector('#gs-bar-body');
    this.barRateEl = this.rootEl.querySelector('#gs-bar-rate');
    this.barCapEl = this.rootEl.querySelector('#gs-bar-cap');
    this.buyBtnEl = this.rootEl.querySelector('#gunshop-buy-btn');
    this.ammoBtnEl = this.rootEl.querySelector('#gunshop-ammo-btn');
    this.closeBtnEl = this.rootEl.querySelector('#gunshop-close-btn');

    this._cardEls = new Map();
    for (const item of GUN_SHOP_CATALOG) {
      const card = document.createElement('div');
      card.className = `gunshop-card${item.isLegendary ? ' is-legendary' : ''}`;
      card.dataset.weaponId = item.id;
      card.innerHTML = `
        <div class="gunshop-card-thumb"><img alt="${item.name}" /></div>
        <div class="gunshop-card-info">
          ${item.isLegendary ? '<div class="gunshop-legendary-badge">★ LENDÁRIA</div>' : ''}
          <div class="gunshop-card-name">${item.name}</div>
          <div class="gunshop-card-caliber">${item.caliber}</div>
        </div>
        <div class="gunshop-card-price-col">
          <span class="gunshop-card-price">${item.price === 0 ? '' : formatMoney(item.price)}</span>
          <span class="gunshop-card-status">DISPONÍVEL</span>
        </div>
      `;
      card.addEventListener('click', () => this.selectWeapon(item.id, true));
      card.addEventListener('mouseenter', () => {
        this._isCardHovered = true;
        if (this.selectedId !== item.id) {
          this.selectWeapon(item.id, false);
        }
      });
      card.addEventListener('mouseleave', () => {
        this._isCardHovered = false;
      });
      this.catalogEl.appendChild(card);
      this._cardEls.set(item.id, {
        card,
        img: card.querySelector('img'),
        priceEl: card.querySelector('.gunshop-card-price'),
        statusEl: card.querySelector('.gunshop-card-status'),
      });
    }

    this.closeBtnEl.addEventListener('click', () => {
      this.sound?.playUiClick?.(false);
      this.close();
    });

    this.buyBtnEl.addEventListener('click', () => this._handlePrimaryAction());
    this.ammoBtnEl.addEventListener('click', () => this._handleAmmoAction());

    // Keep wheel scrolling strictly inside #hud-gun-shop so it never cycles outside weapons
    this.rootEl.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });

    this.viewportBoxEl.addEventListener('mouseenter', () => {
      this._isViewportHovered = true;
    });
    this.viewportBoxEl.addEventListener('mouseleave', () => {
      this._isViewportHovered = false;
    });

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        if (this.isOpen) {
          this._syncCanvasSize();
          if (this._renderer && this._scene && this._camera) {
            this._renderer.render(this._scene, this._camera);
          }
        }
      });
      this._resizeObserver.observe(this.viewportBoxEl);
    }
  }

  /**
   * Boot-time pre-warm: creates the shared WebGLRenderer, RoomEnvironment studio cubemap,
   * 7 centered/normalized weapon clones, pre-renders all 7 cached card thumbnails, and
   * compiles showcase shaders so opening the crate in-game takes 0ms with locked 60 FPS.
   */
  prewarm() {
    this._ensureShowcaseScene();
  }

  _computeFitDistance(bounds, aspect, fillRatio = 0.75, isSpinning = false) {
    const b = bounds || { width: 1.0, height: 0.45, depth: 0.15 };
    const fovRad = THREE.MathUtils.degToRad(this._camera?.fov || 34);
    const tanHalf = Math.tan(fovRad * 0.5);
    const safeAspect = Math.max(0.25, aspect || 1.6);
    const horizSpan = isSpinning
      ? Math.max(b.width, Math.hypot(b.width, b.depth) * 0.88)
      : b.width;
    const distV = (b.height * 0.5) / (fillRatio * tanHalf);
    const distH = (horizSpan * 0.5) / (fillRatio * tanHalf * safeAspect);
    return Math.max(0.45, Math.max(distV, distH) + b.depth * 0.5);
  }

  _ensureShowcaseScene() {
    if (this._renderer) return;
    this._renderer = new THREE.WebGLRenderer({
      canvas: this.canvasEl,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 0.92;

    this._scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this._renderer);
    this._envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this._scene.environment = this._envRT.texture;
    pmrem.dispose();

    // Balanced High-Contrast 3-Point Studio Rig
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this._scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xe2e8f0, 0x0f172a, 0.55);
    this._scene.add(hemi);

    const frontKey = new THREE.DirectionalLight(0xffffff, 1.15);
    frontKey.position.set(2.5, 2.0, 3.5);
    this._scene.add(frontKey);

    const leftFill = new THREE.DirectionalLight(0xcbd5e1, 0.45);
    leftFill.position.set(-3.0, 0.8, 2.0);
    this._scene.add(leftFill);

    const backRim = new THREE.DirectionalLight(0xfffbeb, 0.85);
    backRim.position.set(0.0, 3.2, -2.5);
    this._scene.add(backRim);

    this._camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 30);
    this._camera.position.set(0, 0, 1.6);
    this._camera.lookAt(0, 0, 0);

    const viewmodel = this.weaponSystem?.viewmodel;
    if (viewmodel && typeof viewmodel.getShowcaseModelClone === 'function') {
      for (const item of GUN_SHOP_CATALOG) {
        const model = viewmodel.getShowcaseModelClone(item.id);
        if (model) {
          model.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) {
              if (mat && mat.isMeshStandardMaterial) {
                mat.envMapIntensity = 0.45;
                mat.needsUpdate = true;
              }
            }
          });
          model.visible = false;
          this._scene.add(model);
          this._showcaseModels.set(item.id, model);
        }
      }
    }

    this._generateStaticCardThumbnails();

    // Compile all showcase PBR shader programs once at boot
    for (const m of this._showcaseModels.values()) {
      m.visible = true;
    }
    try {
      this._renderer.compile(this._scene, this._camera);
    } catch (e) { }
    for (const m of this._showcaseModels.values()) {
      m.visible = false;
    }
    this._syncCanvasSize();
  }

  _generateStaticCardThumbnails() {
    if (this._thumbnailsGenerated || !this._renderer || !this._camera) return;
    this._thumbnailsGenerated = true;

    const thumbW = 224;
    const thumbH = 108;
    const thumbAspect = thumbW / thumbH;
    this._renderer.setSize(thumbW, thumbH, false);
    this._camera.aspect = thumbAspect;
    this._camera.updateProjectionMatrix();

    for (const item of GUN_SHOP_CATALOG) {
      const m = this._showcaseModels.get(item.id);
      if (!m) continue;
      for (const other of this._showcaseModels.values()) {
        other.visible = false;
      }
      m.visible = true;
      m.rotation.set(0, 0, 0);
      const dist = this._computeFitDistance(m.userData?.showcaseSize, thumbAspect, 0.82, false);
      this._camera.position.set(0, 0, dist);
      this._camera.lookAt(0, 0, 0);
      this._renderer.render(this._scene, this._camera);
      const dataUrl = this.canvasEl.toDataURL('image/png');
      this._thumbnailDataUrls.set(item.id, dataUrl);
      const cardRef = this._cardEls.get(item.id);
      if (cardRef?.img) {
        cardRef.img.src = dataUrl;
      }
      m.visible = false;
    }

    this._syncCanvasSize();
  }

  _syncCanvasSize() {
    if (!this._renderer || !this._camera || !this.viewportBoxEl) return;
    const w = Math.max(240, this.viewportBoxEl.clientWidth || 560);
    const h = Math.max(160, this.viewportBoxEl.clientHeight || 320);
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    window.isGunShopOpen = true;

    if (document.pointerLockElement && document.exitPointerLock) {
      try {
        document.exitPointerLock();
      } catch (e) { }
    }

    this._ensureShowcaseScene();
    this.rootEl.classList.add('is-open');
    this._syncCanvasSize();

    const active = this.weaponSystem?.currentWeapon || 'hk_usp';
    if (!this.selectedId) {
      this.selectedId = GUN_SHOP_CATALOG.some((x) => x.id === active) ? active : 'shotgun';
    }
    this.selectWeapon(this.selectedId, false);
    this.refreshUI();
  }

  close(triggerCallback = true) {
    if (!this.isOpen) return;
    this.isOpen = false;
    window.isGunShopOpen = false;
    this._isViewportHovered = false;
    this._isCardHovered = false;
    this.rootEl.classList.remove('is-open');
    if (triggerCallback && typeof this.onClose === 'function') {
      this.onClose();
    }
  }

  selectWeapon(weaponId, playClick = false) {
    const item = GUN_SHOP_CATALOG.find((x) => x.id === weaponId) || GUN_SHOP_CATALOG[0];
    this.selectedId = item.id;
    if (playClick) {
      this.sound?.playUiClick?.(item.isLegendary);
    }

    for (const [id, m] of this._showcaseModels.entries()) {
      const isMatch = id === item.id;
      m.visible = isMatch;
      if (isMatch) {
        m.rotation.set(0, 0, 0);
        this._activeShowcaseModel = m;
      }
    }

    if (this._activeShowcaseModel && this._camera) {
      const isSpinning = this._isViewportHovered || this._isCardHovered;
      const aspect = this._camera.aspect || 16 / 9;
      this._camZ = this._computeFitDistance(
        this._activeShowcaseModel.userData?.showcaseSize,
        aspect,
        isSpinning ? 0.86 : 0.75,
        isSpinning
      );
      this._camera.position.set(0, 0, this._camZ);
      this._camera.lookAt(0, 0, 0);
    }

    this.refreshUI();
  }

  refreshUI() {
    const balance = this.getMoney();
    if (this.balanceEl) {
      this.balanceEl.textContent = formatMoney(balance);
    }

    for (const item of GUN_SHOP_CATALOG) {
      const ref = this._cardEls.get(item.id);
      if (!ref) continue;

      const owned = this.weaponSystem?.isWeaponUnlocked?.(item.id) || false;
      const canAfford = balance >= item.price;

      ref.card.classList.toggle('is-selected', this.selectedId === item.id);
      ref.priceEl.classList.toggle('is-locked-cost', !owned && !canAfford);

      if (owned) {
        ref.priceEl.style.display = 'none';
        ref.priceEl.textContent = '';
        ref.statusEl.textContent = 'ADQUIRIDA';
        ref.statusEl.classList.add('is-owned');
        ref.statusEl.classList.remove('is-locked');
      } else {
        ref.priceEl.style.display = '';
        ref.priceEl.textContent = formatMoney(item.price);
        ref.statusEl.textContent = 'BLOQUEADA';
        ref.statusEl.classList.remove('is-owned');
        ref.statusEl.classList.add('is-locked');
      }
    }

    const sel = GUN_SHOP_CATALOG.find((x) => x.id === this.selectedId) || GUN_SHOP_CATALOG[0];
    const owned = this.weaponSystem?.isWeaponUnlocked?.(sel.id) || false;
    const canAffordWeapon = balance >= sel.price;
    const canAffordAmmo = balance >= sel.ammoPackPrice;

    if (this.detailTitleEl) {
      this.detailTitleEl.textContent = sel.name;
    }
    if (this.detailLegendaryEl) {
      this.detailLegendaryEl.style.display = sel.isLegendary ? 'inline-flex' : 'none';
    }
    if (this.detailCaliberEl) {
      if (owned && !sel.infiniteAmmo) {
        const wState = this.weaponSystem?.weapons?.[sel.id];
        const mag = wState?.currentAmmo ?? 0;
        const res = wState?.reserveAmmo ?? 0;
        this.detailCaliberEl.textContent = `${sel.caliber} • MUNIÇÃO ATUAL: ${mag} / ${res}`;
      } else {
        this.detailCaliberEl.textContent = sel.caliber;
      }
    }

    this.statHeadEl.textContent = sel.stats.headDamage;
    this.statBodyEl.textContent = sel.stats.bodyDamage;
    this.statRateEl.textContent = sel.stats.fireRate;
    this.statCapEl.textContent = sel.stats.capacity;

    this.barHeadEl.style.width = `${sel.stats.headPct}%`;
    this.barBodyEl.style.width = `${sel.stats.bodyPct}%`;
    this.barRateEl.style.width = `${sel.stats.ratePct}%`;
    this.barCapEl.style.width = `${sel.stats.capPct}%`;
    for (const bar of [this.barHeadEl, this.barBodyEl, this.barRateEl, this.barCapEl]) {
      bar.classList.toggle('is-gold', sel.isLegendary);
    }

    // Buy / Owned primary status bar (unlocks only; TAB weapon wheel equips weapons in-game)
    this.buyBtnEl.classList.remove('is-owned', 'is-insufficient');
    if (owned) {
      this.buyBtnEl.classList.add('is-owned');
      this.buyBtnEl.textContent = 'ARMA ADQUIRIDA';
      this.buyBtnEl.disabled = true;
    } else if (canAffordWeapon) {
      this.buyBtnEl.textContent = `COMPRAR ARMA • ${formatMoney(sel.price)}`;
      this.buyBtnEl.disabled = false;
    } else {
      this.buyBtnEl.classList.add('is-insufficient');
      this.buyBtnEl.textContent = `SALDO INSUFICIENTE • ${formatMoney(sel.price)}`;
      this.buyBtnEl.disabled = true;
    }

    // Secondary Ammo Pack Purchase button for owned finite-reserve weapons
    if (owned && !sel.infiniteAmmo && sel.ammoPackSize > 0) {
      this.ammoBtnEl.style.display = 'inline-block';
      this.ammoBtnEl.textContent = `MUNIÇÃO +${sel.ammoPackSize} • ${formatMoney(sel.ammoPackPrice)}`;
      this.ammoBtnEl.disabled = !canAffordAmmo;
    } else {
      this.ammoBtnEl.style.display = 'none';
    }
  }

  _handlePrimaryAction() {
    const sel = GUN_SHOP_CATALOG.find((x) => x.id === this.selectedId);
    if (!sel || !this.weaponSystem) return;

    if (this.weaponSystem.isWeaponUnlocked(sel.id)) {
      return;
    }

    if (!this.spendMoney(sel.price)) {
      this.refreshUI();
      return;
    }

    this.weaponSystem.unlockWeapon(sel.id);
    this.sound?.playPurchaseSuccessSound?.();
    if (typeof this.onWeaponUnlocked === 'function') {
      this.onWeaponUnlocked(sel.id);
    }
    this.refreshUI();
  }

  _handleAmmoAction() {
    const sel = GUN_SHOP_CATALOG.find((x) => x.id === this.selectedId);
    if (!sel || !this.weaponSystem) return;
    if (!this.weaponSystem.isWeaponUnlocked(sel.id) || sel.infiniteAmmo) return;

    if (!this.spendMoney(sel.ammoPackPrice)) {
      this.refreshUI();
      return;
    }

    this.weaponSystem.addAmmo(sel.id, sel.ammoPackSize);
    this.sound?.playPurchaseSuccessSound?.();
    this.refreshUI();
  }

  update(delta) {
    if (!this.isOpen || !this._renderer || !this._scene || !this._camera) return;

    const isSpinning = this._isViewportHovered || this._isCardHovered;
    const aspect = this._camera.aspect || 16 / 9;
    const targetZ = this._activeShowcaseModel
      ? this._computeFitDistance(
          this._activeShowcaseModel.userData?.showcaseSize,
          aspect,
          isSpinning ? 0.86 : 0.75,
          isSpinning
        )
      : 1.6;
    this._camZ += (targetZ - this._camZ) * Math.min(1, delta * 9.0);
    this._camera.position.set(0, 0, this._camZ);
    this._camera.lookAt(0, 0, 0);

    if (this._activeShowcaseModel) {
      if (isSpinning) {
        this._activeShowcaseModel.rotation.y += delta * 1.15;
      } else {
        // Gently ease toward clean static side profile when cursor leaves viewport
        const twoPi = Math.PI * 2;
        let ry = this._activeShowcaseModel.rotation.y % twoPi;
        if (ry > Math.PI) ry -= twoPi;
        if (ry < -Math.PI) ry += twoPi;
        this._activeShowcaseModel.rotation.y = ry * Math.exp(-delta * 6.5);
      }
    }

    this._renderer.render(this._scene, this._camera);
  }
}
