import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { ObjectPool } from '../core/ObjectPool.js';

// Pre-allocated scratch variables for zero-GC hitscan and transforms
const _rayOrigin = new THREE.Vector3();
const _rayDirection = new THREE.Vector3();
const _scratchVec1 = new THREE.Vector3();
const _scratchVec2 = new THREE.Vector3();
const _scratchVec3 = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _tracerDir = new THREE.Vector3();
const _tracerSpawn = new THREE.Vector3();
const _pelletForward = new THREE.Vector3();
const _pelletRight = new THREE.Vector3();
const _pelletUp = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
_raycaster.firstHitOnly = true;

// Procedural bullet impact spall decal texture
function createBulletDecalTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const cx = 64;
  const cy = 64;

  ctx.clearRect(0, 0, 128, 128);

  // 1. Faint outer microscopic powder soot (tight, zero blur outside 44px)
  const sootGrad = ctx.createRadialGradient(cx, cy, 14, cx, cy, 44);
  sootGrad.addColorStop(0.0, 'rgba(20, 24, 30, 0.65)');
  sootGrad.addColorStop(0.5, 'rgba(30, 35, 42, 0.28)');
  sootGrad.addColorStop(0.85, 'rgba(15, 18, 22, 0.06)');
  sootGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = sootGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 44, 0, Math.PI * 2);
  ctx.fill();

  // 2. 8 Sharp, jagged radial micro-cracks radiating from impact ring
  const numCracks = 8;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < numCracks; i++) {
    const angle = (i / numCracks) * Math.PI * 2 + (Math.sin(i * 3.7) * 0.25);
    const startR = 14 + (i % 3) * 2;
    const crackLen = 16 + ((i * 7) % 15); // reaches 32-42px
    
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(12, 14, 18, 0.85)' : 'rgba(25, 30, 38, 0.70)';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR);
    const midR = startR + crackLen * 0.5;
    const midAngle = angle + (i % 2 === 0 ? 0.08 : -0.08);
    ctx.lineTo(cx + Math.cos(midAngle) * midR, cy + Math.sin(midAngle) * midR);
    const tipR = startR + crackLen;
    const tipAngle = angle + (i % 2 === 0 ? -0.04 : 0.05);
    ctx.lineTo(cx + Math.cos(tipAngle) * tipR, cy + Math.sin(tipAngle) * tipR);
    ctx.stroke();
  }

  // 3. Jagged, dark-grey concrete/metal spall ring around crater (radius ~18-24px)
  ctx.fillStyle = '#22262c';
  ctx.beginPath();
  const spallPoints = 16;
  for (let i = 0; i < spallPoints; i++) {
    const a = (i / spallPoints) * Math.PI * 2;
    const r = 18 + ((i * 5 + 3) % 7); // 18 to 24px
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Inner chipped bevel ring
  ctx.fillStyle = '#15181c';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 12 + ((i * 3 + 1) % 4); // 12 to 15px
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // 4. Small, pitch-black punctured center core hole (#050505)
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
  ctx.fill();

  // Sharp dark shadow rim inside the puncture
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, 9.0, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Procedural hot-metal ember glow texture
function createEmberGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
  grad.addColorStop(0.0, 'rgba(255, 240, 180, 1.0)'); // white-hot center
  grad.addColorStop(0.35, 'rgba(255, 120, 20, 0.85)'); // incandescent orange
  grad.addColorStop(0.70, 'rgba(200, 40, 0, 0.40)');  // deep red-orange
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class WeaponSystem {
  constructor(scene, camera, viewmodel, inputManager, soundManager, player = null) {
    this.scene = scene;
    this.camera = camera;
    this.viewmodel = viewmodel;
    this.input = inputManager;
    this.sound = soundManager;
    this.player = player;

    this.currentWeapon = 'pistol';
    this.weapons = {
      pistol: {
        currentAmmo: 7,
        maxAmmo: 7,
        fireRate: 0.45,
        isSlideLocked: false,
      },
      shotgun: {
        currentAmmo: 6,
        maxAmmo: 6,
        fireRate: 0.72,
        isSlideLocked: false,
      },
    };

    this.fireRate = 0.45;
    this.fireTimer = 0;
    this.wasMouseDown0 = false;

    this.maxAmmo = 7;
    this.currentAmmo = 7;
    this.isReloading = false;
    this.isSlideLocked = false;
    this.hud = null;

    this.colliderMesh = null;
    this.boxManager = null;
    this.monitorScreens = [];
    this.crosshairEl = null;

    // Shared Textures & Base Materials (Instanced for independent mesh opacity)
    this.decalTexture = createBulletDecalTexture();
    this.emberTexture = createEmberGlowTexture();

    this.baseDecalMaterial = new THREE.MeshBasicMaterial({
      map: this.decalTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    this.baseEmberMaterial = new THREE.MeshBasicMaterial({
      map: this.emberTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 1.0,
    });

    // Warm Ballistic Tracer Material (Incandescent golden-yellow streak)
    this.tracerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd060,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Shiny .50 AE Brass Shell Casing Material
    this.casingMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.90,
      roughness: 0.20,
    });

    // Red 12-Gauge Shotgun Hull Material
    this.shotgunHullMaterial = new THREE.MeshStandardMaterial({
      color: 0xc81e1e,
      metalness: 0.08,
      roughness: 0.42,
    });

    // Impact Sparks Material (Hot metal orange-yellow)
    this.sparkMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    // Pre-allocated Zero-GC Object Pools
    this._initObjectPools();

    // Muzzle Flash PointLight (Warm fiery pulse 0xff6600, 6.0 intensity, 3.5m range)
    this.muzzleLight = new THREE.PointLight(0xff6600, 0, 3.5, 2.0);
    this.muzzleLight.visible = false; // Strictly hidden when not firing to bypass Three.js PBR shader loops!
    this.scene.add(this.muzzleLight);
    this.flashDuration = 0;
    this._lastCrosshairHidden = null;

    // Strict game state gating (MENU vs PLAYING) and arming cooldown
    this.gameState = 'MENU';
    this.armedAt = 0;
  }

  setGameState(state) {
    this.gameState = state;
    if (state === 'PLAYING') {
      this.wasMouseDown0 = true;
      this.armedAt = performance.now() + 150; // 150ms arming cooldown after pointer lock acquired
    } else {
      this.wasMouseDown0 = true;
      this.viewmodel.setADS(false);
    }
  }

  setHUD(hud) {
    this.hud = hud;
    if (this.hud) {
      if (typeof this.hud.setWeapon === 'function') {
        this.hud.setWeapon(this.currentWeapon, this.currentAmmo, this.maxAmmo);
      } else {
        this.hud.updateAmmo(this.currentAmmo, this.maxAmmo);
      }
      this.hud.setReloadCallback(() => this.startReload());
    }
  }

  /**
   * Switches between Slot 1 ('pistol' - .50 AE Desert Eagle)
   * and Slot 2 ('shotgun' - Winchester Model 1912 12-Gauge).
   */
  switchWeapon(weaponType) {
    if (this.gameState !== 'PLAYING' || !this.input.isLocked || document.pointerLockElement === null) return;
    if (weaponType !== 'pistol' && weaponType !== 'shotgun') return;
    if (this.currentWeapon === weaponType) return;

    // 1. Persist current weapon state
    const prevState = this.weapons[this.currentWeapon];
    if (prevState) {
      prevState.currentAmmo = this.currentAmmo;
      prevState.isSlideLocked = this.isSlideLocked;
    }

    // 2. Cancel any active reload and load target weapon state
    this.isReloading = false;
    this.currentWeapon = weaponType;
    const nextState = this.weapons[weaponType];
    this.currentAmmo = nextState.currentAmmo;
    this.maxAmmo = nextState.maxAmmo;
    this.fireRate = nextState.fireRate;
    this.isSlideLocked = nextState.isSlideLocked;
    this.fireTimer = 0.22; // Brief equip readiness delay

    // 3. Switch 3D viewmodel & ADS state
    if (this.viewmodel) {
      this.viewmodel.setADS(false);
      this.viewmodel.switchWeapon(weaponType);
      if (weaponType === 'pistol') {
        this.viewmodel.setSlideLocked(this.isSlideLocked);
      }
    }

    // 4. Update HUD to display active weapon caliber, mode, ammo count, and cartridge/shotshell pips
    if (this.hud) {
      if (typeof this.hud.setWeapon === 'function') {
        this.hud.setWeapon(weaponType, this.currentAmmo, this.maxAmmo);
      } else {
        this.hud.updateAmmo(this.currentAmmo, this.maxAmmo, true);
      }
    }
  }

  startReload() {
    if (this.gameState !== 'PLAYING' || !this.input.isLocked || document.pointerLockElement === null) return;
    if (this.currentAmmo >= this.maxAmmo || this.isReloading) return;

    this.isReloading = true;
    this.viewmodel.setADS(false);

    if (this.hud) {
      this.hud.onReloadStart();
    }

    const shellsNeeded = this.maxAmmo - this.currentAmmo;

    this.viewmodel.startReloadAnimation({
      shellsToLoad: shellsNeeded,
      onShellInserted: () => {
        if (this.currentWeapon === 'shotgun' && this.currentAmmo < this.maxAmmo) {
          this.currentAmmo++;
          this.weapons.shotgun.currentAmmo = this.currentAmmo;
          if (this.hud) {
            if (typeof this.hud.onShotgunShellInserted === 'function') {
              this.hud.onShotgunShellInserted(this.currentAmmo, this.maxAmmo);
            } else {
              this.hud.updateAmmo(this.currentAmmo, this.maxAmmo);
            }
          }
        }
      },
      onCameraNudge: (pitchImpulse) => {
        if (this.player && typeof this.player.applyCameraRecoil === 'function') {
          this.player.applyCameraRecoil(pitchImpulse);
        }
      },
      onComplete: () => {
        this.currentAmmo = this.maxAmmo;
        this.isSlideLocked = false;
        this.isReloading = false;
        this.weapons[this.currentWeapon].currentAmmo = this.maxAmmo;
        this.weapons[this.currentWeapon].isSlideLocked = false;
        if (this.currentWeapon === 'pistol') {
          this.viewmodel.setSlideLocked(false);
        }

        if (this.hud) {
          this.hud.updateAmmo(this.currentAmmo, this.maxAmmo);
          this.hud.setEmptyState(false);
          if (this.currentWeapon === 'pistol') {
            this.hud.onReloadComplete();
          }
        }
      }
    });
  }

  setCollider(colliderMesh) {
    this.colliderMesh = colliderMesh;
  }

  setMonitorScreens(screens) {
    this.monitorScreens = screens;
  }

  setBoxManager(boxManager) {
    this.boxManager = boxManager;
  }

  setPlayer(player) {
    this.player = player;
  }

  _initObjectPools() {
    // 1. Bullet & Buckshot Decals Pool (64 items to support 8-pellet 12-gauge buckshot clusters + .50 AE craters)
    // Each mesh clones the base material for independent opacity fading
    const decalGeo = new THREE.PlaneGeometry(0.24, 0.24);
    const emberGeo = new THREE.PlaneGeometry(0.11, 0.11);
    this.decalPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(decalGeo, this.baseDecalMaterial.clone());
      mesh.name = 'BulletDecal';
      mesh.userData.age = 0;

      // Hot-metal cooling ember child
      const emberMesh = new THREE.Mesh(emberGeo, this.baseEmberMaterial.clone());
      emberMesh.name = 'EmberGlow';
      emberMesh.position.set(0, 0, 0.001);
      emberMesh.visible = false;
      mesh.add(emberMesh);
      mesh.userData.ember = emberMesh;

      this.scene.add(mesh);
      return mesh;
    }, 64);

    // 2. Ballistic Tracers Pool (48 items, fast-moving 150u/s golden streak bolts)
    // Tapered cylinder along Z: length 0.85m, front tip facing +Z, tail at origin (0, 0, 0)
    const tracerLength = 0.85;
    const tracerGeo = new THREE.CylinderGeometry(0.0018, 0.0042, tracerLength, 8);
    tracerGeo.translate(0, tracerLength / 2, 0); // Shift so tail is at Y = 0, tip at Y = +tracerLength
    tracerGeo.rotateX(Math.PI / 2); // Rotates tip (+Y) to +Z so front tip faces target on lookAt, tail at (0, 0, 0)
    this.tracerPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(tracerGeo, this.tracerMaterial);
      mesh.name = 'BulletTracer';
      mesh.frustumCulled = false;
      mesh._dir = new THREE.Vector3();
      mesh._speed = 150;
      mesh._distTraveled = 0;
      mesh._maxDist = 0;
      this.scene.add(mesh);
      return mesh;
    }, 48);

    // 3. Pooled Shiny Brass .50 AE Shell Casings (15 items)
    const casingGeo = new THREE.CylinderGeometry(0.0068, 0.0068, 0.032, 10);
    this.casingPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(casingGeo, this.casingMaterial);
      mesh.name = 'ShellCasing';
      mesh._velocity = new THREE.Vector3();
      mesh._rotVelocity = new THREE.Vector3();
      mesh._life = 0;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    }, 15);

    // 3b. Pooled Red 12-Gauge Shotgun Shells with Brass Base (15 items)
    const shellHullGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.042, 12);
    const shellBrassGeo = new THREE.CylinderGeometry(0.0098, 0.0098, 0.015, 12);
    this.shotgunShellPool = new ObjectPool(() => {
      const group = new THREE.Group();
      group.name = 'ShotgunShellCasing';
      const hull = new THREE.Mesh(shellHullGeo, this.shotgunHullMaterial);
      hull.position.y = 0.007;
      const brass = new THREE.Mesh(shellBrassGeo, this.casingMaterial);
      brass.position.y = -0.020;
      group.add(hull);
      group.add(brass);
      group._velocity = new THREE.Vector3();
      group._rotVelocity = new THREE.Vector3();
      group._life = 0;
      group.visible = false;
      this.scene.add(group);
      return group;
    }, 15);

    // 4. Pooled Hot Metal Impact Sparks (64 items)
    const sparkGeo = new THREE.BoxGeometry(0.016, 0.016, 0.016);
    this.sparkPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(sparkGeo, this.sparkMaterial);
      mesh.name = 'ImpactSpark';
      mesh._velocity = new THREE.Vector3();
      mesh._life = 0;
      mesh._maxLife = 0;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    }, 64);

    // 5. Pooled Cyan/White/Amber Electric Sparks & Glass Shards (32 items)
    const glassGeo = new THREE.BoxGeometry(0.014, 0.014, 0.014);
    this.glassSparkPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(glassGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }));
      mesh.name = 'MonitorGlassSpark';
      mesh._velocity = new THREE.Vector3();
      mesh._life = 0;
      mesh._maxLife = 0;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    }, 32);
  }

  update(delta) {
    // 1. Always update in-flight visual effects (tracers, casings, sparks, decals, light fade)
    this._updateVisualEffects(delta);

    // 2. Strict Game State Gate: block weapon inputs while in MENU, unlocked, or during 150ms arming cooldown
    const isArmed = this.gameState === 'PLAYING' &&
                    this.input.isLocked &&
                    document.pointerLockElement !== null &&
                    performance.now() >= this.armedAt;

    if (!isArmed) {
      this.wasMouseDown0 = true; // Prevents click-bleed
      this.viewmodel.setADS(false);
      return;
    }

    // 3. Advance fire timer
    if (this.fireTimer > 0) {
      this.fireTimer -= delta;
    }

    // 3b. Weapon Slot Switching (Key 1 = .50 AE Pistol, Key 2 = Winchester Model 1912 Shotgun)
    if (this.input.consumeKeyJustPressed('Digit1') || this.input.consumeKeyJustPressed('1')) {
      this.switchWeapon('pistol');
      return;
    }
    if (this.input.consumeKeyJustPressed('Digit2') || this.input.consumeKeyJustPressed('2')) {
      this.switchWeapon('shotgun');
      return;
    }

    // 4. Manual KeyR Reload check
    if (this.input.consumeKeyJustPressed('KeyR') || this.input.consumeKeyJustPressed('r') || this.input.consumeKeyJustPressed('Keyr')) {
      if (this.currentAmmo < this.maxAmmo && !this.isReloading) {
        this.startReload();
      }
    }

    // 5. Handle ADS (Right Mouse Button) - Interrupted back to hip-fire during reload
    const isRightDown = this.input.isMouseDown(2) && !this.isReloading;
    this.viewmodel.setADS(isRightDown);

    // Fade crosshair during ADS for authentic iron sights alignment (dirty checked)
    if (!this.crosshairEl) {
      this.crosshairEl = document.getElementById('crosshair-container');
      if (this.crosshairEl) this.crosshairEl.style.transition = 'opacity 0.12s ease-out';
    }
    if (this.crosshairEl && this._lastCrosshairHidden !== isRightDown) {
      this._lastCrosshairHidden = isRightDown;
      this.crosshairEl.style.opacity = isRightDown ? '0' : '1';
    }

    // Smooth camera FOV zoom during ADS (only recalculate matrix when FOV changes)
    const targetFOV = isRightDown ? 60 : 75;
    if (Math.abs(targetFOV - this.camera.fov) > 0.05) {
      this.camera.fov += (targetFOV - this.camera.fov) * Math.min(delta * 14.0, 1.0);
      this.camera.updateProjectionMatrix();
    }

    // 6. Strict Semi-Auto Firing (Requires distinct click per heavy shot)
    const isLeftDown = this.input.isMouseDown(0);
    const justClicked = isLeftDown && !this.wasMouseDown0;
    this.wasMouseDown0 = isLeftDown;

    if (justClicked && this.fireTimer <= 0) {
      this.fire();
    }
  }

  _updateVisualEffects(delta) {
    // 1. Update Muzzle Flash Light (Warm firelight fadeout over 45ms, disable visible when off)
    if (this.flashDuration > 0) {
      this.flashDuration -= delta;
      if (this.flashDuration <= 0) {
        this.muzzleLight.intensity = 0;
        this.muzzleLight.visible = false;
      } else {
        this.muzzleLight.intensity = (this.flashDuration / 0.045) * 6.0;
      }
    }

    // 2. Update Active Tracers (140 units/sec ballistic bolt traveling from muzzle to hitPoint)
    this.tracerPool.forEachActive((tracer) => {
      const step = tracer._speed * delta;
      tracer._distTraveled += step;

      if (tracer._distTraveled >= tracer._maxDist) {
        tracer.visible = false;
        tracer.scale.set(1.0, 1.0, 1.0);
        this.tracerPool.release(tracer);
        return;
      }

      tracer.position.addScaledVector(tracer._dir, step);
    });

    // 3. Update Pooled Brass .50 AE Shell Casings (Gravity + tumbling + bounce)
    this.casingPool.forEachActive((casing) => {
      casing._life -= delta;
      if (casing._life <= 0) {
        casing.visible = false;
        this.casingPool.release(casing);
        return;
      }

      // Gravity acceleration
      casing._velocity.y -= 14.0 * delta;
      casing.position.addScaledVector(casing._velocity, delta);

      // Tumbling rotation
      casing.rotation.x += casing._rotVelocity.x * delta;
      casing.rotation.y += casing._rotVelocity.y * delta;
      casing.rotation.z += casing._rotVelocity.z * delta;

      // Floor bounce & friction
      if (casing.position.y < 0.015) {
        casing.position.y = 0.015;
        casing._velocity.y = -casing._velocity.y * 0.35;
        casing._velocity.x *= 0.65;
        casing._velocity.z *= 0.65;
        casing._rotVelocity.multiplyScalar(0.60);
      }
    });

    // 3b. Update Pooled Red 12-Gauge Shotgun Hulls (Gravity + tumbling + bounce)
    if (this.shotgunShellPool) {
      this.shotgunShellPool.forEachActive((shell) => {
        shell._life -= delta;
        if (shell._life <= 0) {
          shell.visible = false;
          this.shotgunShellPool.release(shell);
          return;
        }

        shell._velocity.y -= 14.0 * delta;
        shell.position.addScaledVector(shell._velocity, delta);

        shell.rotation.x += shell._rotVelocity.x * delta;
        shell.rotation.y += shell._rotVelocity.y * delta;
        shell.rotation.z += shell._rotVelocity.z * delta;

        if (shell.position.y < 0.018) {
          shell.position.y = 0.018;
          shell._velocity.y = -shell._velocity.y * 0.32;
          shell._velocity.x *= 0.65;
          shell._velocity.z *= 0.65;
          shell._rotVelocity.multiplyScalar(0.58);
        }
      });
    }

    // 4. Update Impact Sparks (Gravity-driven hot metal arcs)
    this.sparkPool.forEachActive((spark) => {
      spark._life -= delta;
      if (spark._life <= 0) {
        spark.visible = false;
        this.sparkPool.release(spark);
        return;
      }

      spark._velocity.y -= 16.0 * delta;
      spark.position.addScaledVector(spark._velocity, delta);

      const progress = Math.max(0, spark._life / spark._maxLife);
      spark.scale.set(progress, progress, progress);
    });

    // 5. Update Monitor Glass & Electric Sparks
    this.glassSparkPool.forEachActive((spark) => {
      spark._life -= delta;
      if (spark._life <= 0) {
        spark.visible = false;
        this.glassSparkPool.release(spark);
        return;
      }

      spark._velocity.y -= 15.0 * delta;
      spark.position.addScaledVector(spark._velocity, delta);

      const progress = Math.max(0, spark._life / spark._maxLife);
      spark.scale.set(progress, progress, progress);
    });

    // 6. Update Bullet Decals Lifecycle (2.5s hold + 1.0s smooth fade-out + 0.4s hot-metal cooling)
    this.decalPool.forEachActive((decal) => {
      decal.userData.age += delta;
      const age = decal.userData.age;

      // Hot-metal cooling: sizzles warm orange and cools down to neutral dark grey within 0.4s
      if (decal.userData.ember && decal.userData.ember.visible) {
        if (age < 0.4) {
          decal.userData.ember.material.opacity = 1.0 - (age / 0.4);
        } else {
          decal.userData.ember.visible = false;
        }
      }

      // 0.0s to 2.5s: Hold Phase (opacity 1.0)
      if (age < 2.5) {
        decal.material.opacity = 1.0;
      }
      // 2.5s to 3.5s: Fade Phase (linearly interpolate 1.0 down to 0.0)
      else if (age < 3.5) {
        decal.material.opacity = 1.0 - (age - 2.5) / 1.0;
      }
      // At 3.5s: Recycle back to pool (zero draw calls wasted on invisible planes)
      else {
        decal.visible = false;
        if (decal.userData.ember) decal.userData.ember.visible = false;
        this.decalPool.release(decal);
      }
    });
  }

  fire() {
    if (this.gameState !== 'PLAYING' || !this.input.isLocked || document.pointerLockElement === null || performance.now() < this.armedAt) return;
    if (this.isReloading) return;

    // Dry-Fire on Empty Click (currentAmmo === 0)
    if (this.currentAmmo === 0) {
      this.fireTimer = 0.22; // Cadence for dead trigger click
      if (this.sound) {
        this.sound.playDryFireClick();
      }
      if (this.viewmodel) {
        this.viewmodel.playDryFireTwitch();
      }
      if (this.hud) {
        this.hud.triggerDryFireWarning();
      }
      return;
    }

    this.currentAmmo--;
    this.weapons[this.currentWeapon].currentAmmo = this.currentAmmo;
    this.fireTimer = this.fireRate;

    const isShotgun = this.currentWeapon === 'shotgun';

    if (this.sound) {
      if (isShotgun && typeof this.sound.playShotgunBlast === 'function') {
        this.sound.playShotgunBlast();
      } else {
        this.sound.playGunshot();
      }
    }
    if (this.viewmodel) {
      this.viewmodel.applyRecoil();
    }
    if (this.player && typeof this.player.applyCameraRecoil === 'function') {
      const pitchKick = isShotgun
        ? (this.viewmodel && this.viewmodel.isADS ? 0.036 : 0.062)
        : (this.viewmodel && this.viewmodel.isADS ? 0.022 : 0.042);
      this.player.applyCameraRecoil(pitchKick);
    }

    this.viewmodel.getMuzzleWorldPosition(_muzzlePos);
    this.muzzleLight.position.copy(_muzzlePos);
    this.muzzleLight.intensity = isShotgun ? 8.5 : 6.0;
    this.muzzleLight.visible = true;
    this.flashDuration = 0.045;

    if (isShotgun) {
      // Multi-pellet 12-gauge buckshot spread hitscan
      this._performShotgunHitscan();

      // Automatic pump-action cycle after blast, ejecting the spent red 12-gauge hull on rearward stroke
      if (this.viewmodel && typeof this.viewmodel.startShotgunPumpAnimation === 'function') {
        this.viewmodel.startShotgunPumpAnimation({
          onEjectShell: () => this._ejectShellCasing('shotgun'),
        });
      }

      if (this.currentAmmo === 0 && this.hud) {
        this.hud.setEmptyState(true);
      }
    } else {
      this._ejectShellCasing('pistol');
      this._performHitscan();

      if (this.currentAmmo === 0) {
        this.isSlideLocked = true;
        this.weapons.pistol.isSlideLocked = true;
        if (this.viewmodel) {
          this.viewmodel.setSlideLocked(true);
        }
        if (this.sound) {
          this.sound.playSlideCatchRing();
        }
        if (this.hud) {
          this.hud.setEmptyState(true);
        }
      }
    }

    // Update HUD ammo readout & cartridge/shotshell pips
    if (this.hud) {
      this.hud.updateAmmo(this.currentAmmo, this.maxAmmo);
    }
  }

  _ejectShellCasing(weaponType = 'pistol') {
    let ejectPos = _scratchVec1;
    if (this.viewmodel && typeof this.viewmodel.getEjectionWorldPosition === 'function') {
      ejectPos = this.viewmodel.getEjectionWorldPosition(_scratchVec1);
    } else {
      ejectPos.copy(this.camera.position);
    }

    const pool = weaponType === 'shotgun' && this.shotgunShellPool ? this.shotgunShellPool : this.casingPool;
    const casing = pool.acquire();
    casing.visible = true;
    casing.position.copy(ejectPos);
    casing._life = 1.25; // 1.25s active life

    // Calculate camera space orientation vectors
    _camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    _camFwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);

    // Eject to top-right with realistic upward/rightward velocity & slight backward push
    casing._velocity.copy(_camRight).multiplyScalar(1.9 + Math.random() * 0.7)
      .addScaledVector(_camUp, 2.2 + Math.random() * 0.8)
      .addScaledVector(_camFwd, -0.3 + (Math.random() - 0.5) * 0.4);

    // Tumbling spin
    casing._rotVelocity.set(
      18 + Math.random() * 20,
      12 + Math.random() * 25,
      15 + Math.random() * 20
    );

    casing.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
  }

  /**
   * 12-Gauge 00-Buckshot Multi-Pellet Hitscan (8 Pellets in a Conical Choke Pattern).
   * Spawns individual pellet tracers, smaller buckshot pellet decals in a realistic cluster,
   * and preserves destructible monitor screen behavior without duplicate audio spam.
   */
  _performShotgunHitscan() {
    _rayOrigin.copy(this.camera.position);
    this.camera.getWorldDirection(_pelletForward);
    _pelletRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _pelletUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);

    this.viewmodel.getMuzzleWorldPosition(_muzzlePos);

    const numPellets = 8;
    // Tighter choked spread when aiming down the receiver groove & front bead sight
    const maxSpread = this.viewmodel.isADS ? 0.038 : 0.068;
    const baseAngleOffset = Math.random() * Math.PI * 2;
    let playedGlassTickThisBlast = false;

    for (let i = 0; i < numPellets; i++) {
      _rayDirection.copy(_pelletForward);

      if (i === 0) {
        // Center core pellet with tiny jitter
        const r = maxSpread * 0.18 * Math.random();
        const a = Math.random() * Math.PI * 2;
        _rayDirection.addScaledVector(_pelletRight, Math.cos(a) * r);
        _rayDirection.addScaledVector(_pelletUp, Math.sin(a) * r);
      } else {
        // 7 outer buckshot ring pellets distributed evenly around the cone with organic radial variance
        const ringIdx = i - 1;
        const angle = baseAngleOffset + (ringIdx / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const radius = maxSpread * (0.42 + Math.random() * 0.58);
        _rayDirection.addScaledVector(_pelletRight, Math.cos(angle) * radius);
        _rayDirection.addScaledVector(_pelletUp, Math.sin(angle) * radius);
      }
      _rayDirection.normalize();

      _raycaster.set(_rayOrigin, _rayDirection);
      _raycaster.far = 100;

      let closestHit = null;
      let hitObject = null;
      let hitScreenMesh = null;

      if (this.boxManager && typeof this.boxManager.raycast === 'function') {
        const boxHit = this.boxManager.raycast(_raycaster);
        if (boxHit) {
          closestHit = boxHit;
          hitObject = 'box';
        }
      }

      if (this.monitorScreens && this.monitorScreens.length > 0) {
        const screenHits = _raycaster.intersectObjects(this.monitorScreens, false);
        if (screenHits.length > 0) {
          if (!closestHit || screenHits[0].distance < closestHit.distance) {
            closestHit = screenHits[0];
            hitObject = 'monitorScreen';
            hitScreenMesh = screenHits[0].object;
          }
        }
      }

      if (this.colliderMesh) {
        const hits = _raycaster.intersectObject(this.colliderMesh, false);
        if (hits.length > 0) {
          if (!closestHit || hits[0].distance < closestHit.distance) {
            closestHit = hits[0];
            hitObject = 'arena';
            hitScreenMesh = null;
          }
        }
      }

      if (closestHit) {
        _hitPoint.copy(closestHit.point);
        const normal = closestHit.face ? closestHit.face.normal : (closestHit.normal || _scratchVec2.set(0, 0, -1));

        this._spawnTracer(_muzzlePos, _hitPoint, true);

        if (hitObject === 'monitorScreen' && hitScreenMesh) {
          const isBroken = !!hitScreenMesh.userData.isBroken;
          if (!isBroken) {
            hitScreenMesh.userData.isBroken = true;
            if (hitScreenMesh.userData.brokenMaterial) {
              hitScreenMesh.material = hitScreenMesh.userData.brokenMaterial;
            }
            if (hitScreenMesh.userData.brokenGeometry) {
              hitScreenMesh.geometry = hitScreenMesh.userData.brokenGeometry;
            }
            this._spawnMonitorSparks(_hitPoint, normal, true);
            if (this.sound && typeof this.sound.playMonitorShatter === 'function') {
              this.sound.playMonitorShatter();
            }
          } else {
            this._spawnMonitorSparks(_hitPoint, normal, false, 2);
            if (!playedGlassTickThisBlast && this.sound && typeof this.sound.playGlassTick === 'function') {
              playedGlassTickThisBlast = true;
              this.sound.playGlassTick();
            }
          }
        } else if (hitObject === 'arena') {
          this._spawnImpactSparks(_hitPoint, normal, 2);
          this._spawnDecal(_hitPoint, normal, true);
        } else if (hitObject === 'box' && this.boxManager) {
          this._spawnImpactSparks(_hitPoint, normal, 2);
          this.boxManager.onHit(closestHit);
        }
      } else {
        _hitPoint.copy(_rayOrigin).addScaledVector(_rayDirection, 100);
        this._spawnTracer(_muzzlePos, _hitPoint, true);
      }
    }
  }

  _performHitscan() {
    // Ray origin is the camera position
    _rayOrigin.copy(this.camera.position);

    // Ray direction: camera world forward + subtle spread if not in ADS
    this.camera.getWorldDirection(_rayDirection);
    if (!this.viewmodel.isADS) {
      const spread = 0.008;
      _rayDirection.x += (Math.random() - 0.5) * spread;
      _rayDirection.y += (Math.random() - 0.5) * spread;
      _rayDirection.z += (Math.random() - 0.5) * spread;
      _rayDirection.normalize();
    }

    _raycaster.set(_rayOrigin, _rayDirection);
    _raycaster.far = 100;

    let closestHit = null;
    let hitObject = null;
    let hitScreenMesh = null;

    if (this.boxManager && typeof this.boxManager.raycast === 'function') {
      const boxHit = this.boxManager.raycast(_raycaster);
      if (boxHit) {
        closestHit = boxHit;
        hitObject = 'box';
      }
    }

    // Raycast against individual destructible monitor screens
    if (this.monitorScreens && this.monitorScreens.length > 0) {
      const screenHits = _raycaster.intersectObjects(this.monitorScreens, false);
      if (screenHits.length > 0) {
        if (!closestHit || screenHits[0].distance < closestHit.distance) {
          closestHit = screenHits[0];
          hitObject = 'monitorScreen';
          hitScreenMesh = screenHits[0].object;
        }
      }
    }

    // Raycast against merged BVH warehouse geometry
    if (this.colliderMesh) {
      const hits = _raycaster.intersectObject(this.colliderMesh, false);
      if (hits.length > 0) {
        if (!closestHit || hits[0].distance < closestHit.distance) {
          closestHit = hits[0];
          hitObject = 'arena';
          hitScreenMesh = null;
        }
      }
    }

    // EXACT world-space muzzle position from the dedicated barrel socket
    this.viewmodel.getMuzzleWorldPosition(_muzzlePos);

    if (closestHit) {
      _hitPoint.copy(closestHit.point);
      const normal = closestHit.face ? closestHit.face.normal : (closestHit.normal || _scratchVec2.set(0, 0, -1));

      // Spawn ballistic bolt from muzzle socket to hit point
      this._spawnTracer(_muzzlePos, _hitPoint);

      if (hitObject === 'monitorScreen' && hitScreenMesh) {
        const isBroken = !!hitScreenMesh.userData.isBroken;
        if (!isBroken) {
          hitScreenMesh.userData.isBroken = true;
          if (hitScreenMesh.userData.brokenMaterial) {
            hitScreenMesh.material = hitScreenMesh.userData.brokenMaterial;
          }
          if (hitScreenMesh.userData.brokenGeometry) {
            hitScreenMesh.geometry = hitScreenMesh.userData.brokenGeometry;
          }
          this._spawnMonitorSparks(_hitPoint, normal, true);
          if (this.sound && typeof this.sound.playMonitorShatter === 'function') {
            this.sound.playMonitorShatter();
          }
        } else {
          this._spawnMonitorSparks(_hitPoint, normal, false);
          if (this.sound && typeof this.sound.playGlassTick === 'function') {
            this.sound.playGlassTick();
          }
        }
        // NOTE: Wall bullet decals are suppressed on monitor screens!
      } else if (hitObject === 'arena') {
        // Burst 6-8 hot metal impact sparks arcing with gravity
        this._spawnImpactSparks(_hitPoint, normal);
        this._spawnDecal(_hitPoint, normal);
      } else if (hitObject === 'box' && this.boxManager) {
        this._spawnImpactSparks(_hitPoint, normal);
        this.boxManager.onHit(closestHit);
      }
    } else {
      // Whiff into distance (100 units forward along camera ray)
      _hitPoint.copy(_rayOrigin).addScaledVector(_rayDirection, 100);
      this._spawnTracer(_muzzlePos, _hitPoint);
    }
  }

  _spawnMonitorSparks(hitPoint, normal, isFirstHit, overrideCount = null) {
    const count = overrideCount !== null ? overrideCount : (isFirstHit ? 14 : 6);
    const sparkColors = [0x00e5ff, 0xffffff, 0x38bdf8, 0xdbeafe];
    for (let i = 0; i < count; i++) {
      const spark = this.glassSparkPool.acquire();
      spark.visible = true;
      spark.position.copy(hitPoint);
      spark._life = 0.20 + Math.random() * 0.18;
      spark._maxLife = spark._life;
      spark.material.color.setHex(sparkColors[Math.floor(Math.random() * sparkColors.length)]);

      _scratchVec1.copy(normal).multiplyScalar(2.2 + Math.random() * 3.5);
      _scratchVec1.x += (Math.random() - 0.5) * 4.2;
      _scratchVec1.y += Math.random() * 3.0;
      _scratchVec1.z += (Math.random() - 0.5) * 4.2;
      spark._velocity.copy(_scratchVec1);
    }
  }

  _spawnImpactSparks(hitPoint, normal, overrideCount = null) {
    const count = overrideCount !== null ? overrideCount : (6 + Math.floor(Math.random() * 3));
    for (let i = 0; i < count; i++) {
      const spark = this.sparkPool.acquire();
      spark.visible = true;
      spark.position.copy(hitPoint);
      spark._life = 0.22 + Math.random() * 0.16;
      spark._maxLife = spark._life;

      // Arc outward along normal + hemisphere scatter
      _scratchVec1.copy(normal).multiplyScalar(2.0 + Math.random() * 3.0);
      _scratchVec1.x += (Math.random() - 0.5) * 4.0;
      _scratchVec1.y += Math.random() * 2.8;
      _scratchVec1.z += (Math.random() - 0.5) * 4.0;
      spark._velocity.copy(_scratchVec1);
    }
  }

  _spawnTracer(startPoint, endPoint, isPellet = false) {
    const tracer = this.tracerPool.acquire();

    // Direction vector from barrel muzzle socket to hit point
    _tracerDir.subVectors(endPoint, startPoint).normalize();
    const totalDist = startPoint.distanceTo(endPoint);

    // Spawn 0.04m forward along shot direction so tracer tail sits cleanly in front of the barrel crown
    _tracerSpawn.copy(startPoint).addScaledVector(_tracerDir, 0.04);

    tracer.position.copy(_tracerSpawn);
    tracer.lookAt(endPoint);

    const thickness = isPellet ? 0.65 : 1.0;
    const baseLength = 0.85;
    if (totalDist < baseLength) {
      tracer.scale.set(thickness, thickness, Math.max(0.1, totalDist / baseLength));
    } else {
      tracer.scale.set(thickness, thickness, isPellet ? 0.75 : 1.0);
    }

    tracer._dir.copy(_tracerDir);
    tracer._speed = 150; // 150 units/sec rapid ballistic speed
    tracer._distTraveled = 0.04;
    tracer._maxDist = totalDist;
    tracer.visible = true;
  }

  _spawnDecal(hitPoint, surfaceNormal, isPellet = false) {
    const decal = this.decalPool.acquire();

    // Reset age and visual state
    decal.userData.age = 0;
    decal.material.opacity = 1.0;

    // Sizzling hot-metal ember begins active
    if (decal.userData.ember) {
      decal.userData.ember.visible = true;
      decal.userData.ember.material.opacity = 1.0;
    }

    // Position decal slightly offset from surface to avoid z-fighting
    decal.position.copy(hitPoint).addScaledVector(surfaceNormal, 0.005);

    // Orient decal normal to match surface normal
    _scratchVec3.copy(hitPoint).add(surfaceNormal);
    decal.lookAt(_scratchVec3);

    // Random rotation around surface normal
    decal.rotateZ(Math.random() * Math.PI * 2);

    // Buckshot pellets leave smaller individual punctures (~0.44-0.58 scale) so all 8 holes form a distinct spread pattern
    const s = isPellet ? (0.44 + Math.random() * 0.14) : (0.85 + Math.random() * 0.30);
    decal.scale.set(s, s, 1.0);
  }

  reset() {
    TWEEN.removeAll();

    this.currentWeapon = 'pistol';
    this.weapons.pistol.currentAmmo = 7;
    this.weapons.pistol.isSlideLocked = false;
    this.weapons.shotgun.currentAmmo = 6;
    this.weapons.shotgun.isSlideLocked = false;

    this.maxAmmo = 7;
    this.currentAmmo = 7;
    this.fireRate = 0.45;
    this.isReloading = false;
    this.isSlideLocked = false;
    this.fireTimer = 0;
    this.wasMouseDown0 = true;
    this.flashDuration = 0;

    if (this.muzzleLight) {
      this.muzzleLight.intensity = 0;
      this.muzzleLight.visible = false;
    }

    if (this.camera && this.camera.fov !== 75) {
      this.camera.fov = 75;
      this.camera.updateProjectionMatrix();
    }

    if (this.crosshairEl) {
      this._lastCrosshairHidden = false;
      this.crosshairEl.style.opacity = '1';
    }

    // Clear and reset all active bullet impact decals
    this.decalPool.forEachActive((decal) => {
      decal.visible = false;
      decal.userData.age = 0;
      if (decal.userData.ember) {
        decal.userData.ember.visible = false;
        decal.userData.ember.material.opacity = 1.0;
      }
      decal.material.opacity = 1.0;
    });
    this.decalPool.releaseAll();

    // Clear and reset all active bullet tracers
    this.tracerPool.forEachActive((tracer) => {
      tracer.visible = false;
      tracer.scale.set(1.0, 1.0, 1.0);
    });
    this.tracerPool.releaseAll();

    // Clear and reset all ejected brass shell casings
    this.casingPool.forEachActive((casing) => {
      casing.visible = false;
    });
    this.casingPool.releaseAll();

    if (this.shotgunShellPool) {
      this.shotgunShellPool.forEachActive((shell) => {
        shell.visible = false;
      });
      this.shotgunShellPool.releaseAll();
    }

    // Clear and reset all impact sparks
    this.sparkPool.forEachActive((spark) => {
      spark.visible = false;
    });
    this.sparkPool.releaseAll();

    // Clear and reset all glass/electric sparks
    if (this.glassSparkPool) {
      this.glassSparkPool.forEachActive((spark) => {
        spark.visible = false;
      });
      this.glassSparkPool.releaseAll();
    }

    // Reset viewmodel
    if (this.viewmodel && typeof this.viewmodel.reset === 'function') {
      this.viewmodel.reset();
    }

    // Reset HUD
    if (this.hud && typeof this.hud.reset === 'function') {
      this.hud.reset();
    }
  }
}
