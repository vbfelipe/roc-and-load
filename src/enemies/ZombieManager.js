import * as THREE from 'three';
import { ZombieEnemy, getZombieHitboxMeta } from './ZombieEnemy.js';

// Interleaved Wave 1 schedule: 4 ZombieWoman (100% HP, pitch 1.51-1.61) + 2 ZombieMan (100% HP, untouched 0.82-0.84)
const WAVE_1_SPAWN_SPECS = [
  { archetype: 'woman', delay: 0.0, laneX: -0.32, maxHp: 100, pitchBase: 1.51, walkVocalDelay: 0.45, rootName: 'Wave1_ZombieWoman_1', logTag: 'Wave1_ZW_1' },
  { archetype: 'woman', delay: 1.8, laneX: 0.32, maxHp: 100, pitchBase: 1.54, walkVocalDelay: 1.65, rootName: 'Wave1_ZombieWoman_2', logTag: 'Wave1_ZW_2' },
  { archetype: 'man', delay: 3.6, laneX: 0.00, maxHp: 100, pitchBase: 0.84, walkVocalDelay: 2.35, rootName: 'Wave1_ZombieMan_1', logTag: 'Wave1_ZM_1' },
  { archetype: 'woman', delay: 5.4, laneX: -0.35, maxHp: 100, pitchBase: 1.58, walkVocalDelay: 3.15, rootName: 'Wave1_ZombieWoman_3', logTag: 'Wave1_ZW_3' },
  { archetype: 'man', delay: 7.2, laneX: 0.35, maxHp: 100, pitchBase: 0.82, walkVocalDelay: 3.95, rootName: 'Wave1_ZombieMan_2', logTag: 'Wave1_ZM_2' },
  { archetype: 'woman', delay: 9.0, laneX: 0.00, maxHp: 100, pitchBase: 1.61, walkVocalDelay: 4.75, rootName: 'Wave1_ZombieWoman_4', logTag: 'Wave1_ZW_4' },
];

/**
 * Normalizes weapon identifiers ('hk_usp'/'usp', 'pistol'/'deagle'/'desert_eagle',
 * 'shotgun'/'remington_870', 'hk_mp5'/'mp5', 'colt_peacemaker', 'glock_flamengo', 'akms_gold')
 * to canonical damage matrix keys.
 */
export function normalizeWeaponId(weaponId = 'hk_usp') {
  const id = String(weaponId || 'hk_usp').toLowerCase();
  if (id === 'colt_peacemaker' || id === 'colt' || id === 'peacemaker') return 'colt_peacemaker';
  if (id === 'glock_flamengo' || id === 'glock') return 'glock_flamengo';
  if (id === 'akms_gold' || id === 'akms' || id === 'ak47') return 'akms_gold';
  if (id === 'pistol' || id === 'deagle' || id === 'desert_eagle') return 'deagle';
  if (id === 'shotgun' || id === 'remington_870') return 'shotgun';
  if (id === 'hk_mp5' || id === 'mp5') return 'hk_mp5';
  return 'hk_usp';
}

/**
 * Calculates percentage damage (0..100 scale) from Weapon ID, Target Archetype ('woman' | 'man'),
 * Hit Zone ('head' | 'body'), and Shot Distance (meters).
 */
export function getWeaponZombieDamage(weaponId = 'hk_usp', archetype = 'woman', zone = 'body', distance = 5.0) {
  const weapon = normalizeWeaponId(weaponId);
  const archStr = String(archetype || 'woman').toLowerCase();
  const isMan = archStr === 'man' || archStr === 'zombieman';
  const isHead = zone === 'head' || zone === true;
  const dist = typeof distance === 'number' && Number.isFinite(distance) ? distance : 5.0;

  if (weapon === 'colt_peacemaker') {
    if (isMan) return isHead ? 100 : 55;
    return isHead ? 100 : 85;
  }

  if (weapon === 'glock_flamengo') {
    if (isMan) return isHead ? 36 : 15;
    return isHead ? 60 : 28;
  }

  if (weapon === 'akms_gold') {
    if (isMan) return isHead ? 80 : 35;
    return isHead ? 100 : 55;
  }

  if (weapon === 'hk_usp') {
    if (isMan) return isHead ? 45 : 18;
    return isHead ? 75 : 35;
  }

  if (weapon === 'deagle') {
    if (isHead) return 100;
    if (isMan) return dist <= 7.0 ? 45 : 38;
    return dist <= 7.0 ? 70 : 60;
  }

  if (weapon === 'shotgun') {
    if (isMan) {
      if (isHead) {
        if (dist <= 4.5) return 100;
        return dist <= 8.5 ? 65 : 40;
      }
      if (dist <= 4.0) return 55;
      return dist <= 8.5 ? 35 : 18;
    }
    if (isHead) {
      return dist <= 8.5 ? 100 : 65;
    }
    if (dist <= 4.0) return 80;
    return dist <= 8.5 ? 55 : 30;
  }

  if (weapon === 'hk_mp5') {
    if (isMan) {
      if (isHead) return 32;
      return dist <= 8.0 ? 14 : 11;
    }
    if (isHead) return 50;
    return dist <= 8.0 ? 24 : 20;
  }

  return isMan ? (isHead ? 45 : 18) : (isHead ? 75 : 35);
}

// Strict position-gated vestibule exit portal chain (never skipped on a timer)
const VESTIBULE_PORTALS = [
  { x: -11.60, z: 9.20 },  // PORTAL_0_STAIR_LANDING
  { x: -10.60, z: 10.30 }, // PORTAL_1_DOOR_APPROACH
  { x: -8.10, z: 10.30 },  // PORTAL_2_OFFICE_ENTRY
];

// Navigable main-room aisle waypoints matching WarehouseBuilder.js desk/room layout (all X >= -7.8)
const OFFICE_AISLE_WAYPOINTS = [
  { x: -7.0, z: 8.2 },
  { x: -4.6, z: 7.4 },
  { x: 0.0, z: 7.6 },
  { x: 4.8, z: 7.5 },
  { x: 7.0, z: 5.8 },
  { x: -6.8, z: 4.7 },
  { x: 0.0, z: 4.7 },
  { x: 6.4, z: 4.7 },
  { x: -6.8, z: 1.0 },
  { x: 0.0, z: 1.0 },
  { x: 6.4, z: 1.0 },
  { x: -6.8, z: -2.7 },
  { x: 0.0, z: -2.7 },
  { x: 6.4, z: -2.7 },
  { x: -5.8, z: -5.2 },
  { x: 0.0, z: -5.2 },
  { x: 5.8, z: -5.2 },
];

// Exact floor-level AABBs from WarehouseBuilder.js so zombies cleanly slide around desks, walls & stairwell
const FLOOR_OBSTACLES = [
  // Partition wall separating Main Office & Vestibule (open doorway Z = 9.752..10.848)
  { minX: -10.24, maxX: -9.97, minZ: -9.60, maxZ: 9.752, isDesk: false, isDoorJamb: true },
  { minX: -10.24, maxX: -9.97, minZ: 10.848, maxZ: 13.10, isDesk: false, isDoorJamb: true },
  // Open vestibule glass door leaf swung into main room
  { minX: -10.02, maxX: -9.04, minZ: 10.82, maxZ: 11.12, isDesk: false, isDoorJamb: true },
  // Server Containment Pod (Z = -9.50..-6.50, X = -7.00..7.00)
  { minX: -7.08, maxX: 7.08, minZ: -9.55, maxZ: -6.45, isDesk: false },
  // Floor fire extinguisher stands flanking the containment pod (X = ±8.50, Z = -9.18)
  { minX: -8.70, maxX: -8.30, minZ: -9.38, maxZ: -8.98, isDesk: false },
  { minX: 8.30, maxX: 8.70, minZ: -9.38, maxZ: -8.98, isDesk: false },
  // Coffee Station & Palm (left wall)
  { minX: -10.00, maxX: -9.08, minZ: -0.95, maxZ: 1.45, isDesk: false },
  // Decorative office stanchion cluster outside partition window (shifted -0.8m south for clear exit)
  { minX: -9.82, maxX: -8.78, minZ: 6.32, maxZ: 8.30, isDesk: false },
  // East wall enterprise printer & trash bin
  { minX: 9.05, maxX: 10.00, minZ: 0.35, maxZ: 2.35, isDesk: false },
  // Vestibule janitor cart & corner plant
  { minX: -14.20, maxX: -13.10, minZ: 9.05, maxZ: 11.30, isDesk: false },
  // Row 1 ('close') Desks (Z = -2.70)
  { minX: -4.15, maxX: -0.85, minZ: -3.32, maxZ: -2.08, isDesk: true },
  { minX: 0.85, maxX: 4.15, minZ: -3.32, maxZ: -2.08, isDesk: true },
  // Row 2 ('mid') Desks (Z = 1.00)
  { minX: -4.55, maxX: -1.25, minZ: 0.38, maxZ: 1.62, isDesk: true },
  { minX: 1.25, maxX: 4.55, minZ: 0.38, maxZ: 1.62, isDesk: true },
  // Row 3 ('far') Desks (Z = 4.70)
  { minX: -4.15, maxX: -0.85, minZ: 4.08, maxZ: 5.32, isDesk: true },
  { minX: 0.85, maxX: 4.15, minZ: 4.08, maxZ: 5.32, isDesk: true },
];

// Precomputed 7-angle whisker table [0°, +24°, -24°, +50°, -50°, +80°, -80°]
const WHISKER_ANGLES = [
  0,
  (24 * Math.PI) / 180,
  (-24 * Math.PI) / 180,
  (50 * Math.PI) / 180,
  (-50 * Math.PI) / 180,
  (80 * Math.PI) / 180,
  (-80 * Math.PI) / 180,
];
const WHISKER_COS = WHISKER_ANGLES.map((a) => Math.cos(a));
const WHISKER_SIN = WHISKER_ANGLES.map((a) => Math.sin(a));
const ZOMBIE_BODY_RADIUS = 0.38;
const WHISKER_PROBE_PAD = ZOMBIE_BODY_RADIUS + 0.14; // 0.52m
const DOOR_PROBE_PAD = ZOMBIE_BODY_RADIUS + 0.04;    // 0.42m around 1.1m aperture jambs
const CHASE_FLANK_ANGLES = [
  0,
  (24 * Math.PI) / 180,
  (-24 * Math.PI) / 180,
  (48 * Math.PI) / 180,
  (-48 * Math.PI) / 180,
  (14 * Math.PI) / 180,
];

// Keep grounded zombies on Y=0 out of the stairwell pit opening once they've climbed up
const STAIRWELL_PIT_AABB = { minX: -14.00, maxX: -11.30, minZ: 2.05, maxZ: 7.45, isDesk: false };

const _losOrigin = new THREE.Vector3();
const _losTarget = new THREE.Vector3();
const _losDir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function segmentHitsAabb2D(x0, z0, x1, z1, box, pad = 0.28) {
  const minX = box.minX - pad;
  const maxX = box.maxX + pad;
  const minZ = box.minZ - pad;
  const maxZ = box.maxZ + pad;

  const dx = x1 - x0;
  const dz = z1 - z0;
  let t0 = 0;
  let t1 = 1;

  const clip = (p, q) => {
    if (Math.abs(p) < 1e-8) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  return (
    clip(-dx, x0 - minX) &&
    clip(dx, maxX - x0) &&
    clip(-dz, z0 - minZ) &&
    clip(dz, maxZ - z0)
  );
}

/**
 * Coordinates pre-warmed Wave-1 SkeletonUtils clones, F9 test zombies,
 * 4-state AI (CLIMB_STAIRS -> WANDER_IDLE -> RUN_CHASE -> ATTACK),
 * solid zombie/player/obstacle collisions, and active hitbox aggregation.
 */
export class ZombieManager {
  constructor(scene, { womanTemplate = null, manTemplate = null, sound = null, decalManager = null } = {}) {
    this.scene = scene;
    this.womanTemplate = womanTemplate;
    this.manTemplate = manTemplate;
    this.sound = sound;
    this.decalManager = decalManager;

    this.colliderMesh = null;
    this.player = null;
    this.onPlayerHit = null;

    this.waveZombies = [];
    this.waveEntries = [];
    this.waveActive = false;
    this._waveElapsed = 0;

    this._hitboxesCache = [];
    this._solidCollidersCache = [];
    this.hitboxesVisible = false;

    this._syncSoundToTemplates();
  }

  _syncSoundToTemplates() {
    if (this.womanTemplate) {
      this.womanTemplate.sound = this.sound;
      this.womanTemplate.vocalPitchBase = 1.55;
      this.sound?.initZombieVocalChannel?.(this.womanTemplate, 1.55);
    }
    if (this.manTemplate) {
      this.manTemplate.sound = this.sound;
      this.manTemplate.vocalPitchBase = 0.84;
      this.sound?.initZombieVocalChannel?.(this.manTemplate, 0.84);
    }
    for (let i = 0; i < this.waveZombies.length; i++) {
      const zom = this.waveZombies[i];
      if (!zom) continue;
      const spec = WAVE_1_SPAWN_SPECS[i % WAVE_1_SPAWN_SPECS.length];
      zom.sound = this.sound;
      zom.vocalPitchBase = spec.pitchBase;
      this.sound?.initZombieVocalChannel?.(zom, spec.pitchBase);
    }
  }

  setCollider(weaponColliderMesh) {
    this.colliderMesh = weaponColliderMesh;
  }

  setPlayer(player) {
    this.player = player;
  }

  setDecalManager(decalManager) {
    this.decalManager = decalManager;
  }

  setSoundManager(sound) {
    this.sound = sound;
    this._syncSoundToTemplates();
  }

  getWeaponZombieDamage(weaponKey, zombieType, isHead, distanceMeters = 0) {
    return getWeaponZombieDamage(weaponKey, zombieType, isHead, distanceMeters);
  }

  /**
   * Pre-allocates the 6 Wave-1 zombies (4 ZombieWoman + 2 ZombieMan) using SkeletonUtils.clone()
   * at load time (sharing the single set of 1024x1024 PBR textures & clips).
   */
  initWavePool() {
    this._syncSoundToTemplates();
    if (!this.womanTemplate || !this.womanTemplate.isLoaded || this.waveZombies.length > 0) {
      return;
    }

    const manReady = !!(this.manTemplate && this.manTemplate.isLoaded);

    for (let i = 0; i < WAVE_1_SPAWN_SPECS.length; i++) {
      const spec = WAVE_1_SPAWN_SPECS[i];
      const useMan = spec.archetype === 'man' && manReady;
      const template = useMan ? this.manTemplate : this.womanTemplate;
      const maxHp = spec.maxHp ?? 100;

      const zom = new ZombieEnemy(this.scene, {
        cloneFrom: template,
        archetype: spec.archetype,
        maxHp,
        rootName: spec.rootName,
        logTag: spec.logTag,
        spawnPosition: new THREE.Vector3(-12.60 + spec.laneX, -2.60, 2.75),
        lookAtPosition: new THREE.Vector3(-12.60 + spec.laneX, 0.0, 9.0),
        active: false,
        sound: this.sound,
        isWaveZombie: true,
        vocalPitchBase: spec.pitchBase,
        initialWalkVocalDelay: spec.walkVocalDelay,
      });
      this.sound?.initZombieVocalChannel?.(zom, spec.pitchBase);
      zom.setHitboxesVisible(this.hitboxesVisible);

      this.waveZombies.push(zom);
      this.waveEntries.push({
        zombie: zom,
        index: i,
        laneX: spec.laneX,
        spawnDelay: spec.delay,
        walkVocalDelay: spec.walkVocalDelay,
        spawned: false,
        aiState: 'WAITING', // 'WAITING' | 'CLIMB_STAIRS' | 'WANDER_IDLE' | 'RUN_CHASE' | 'ATTACK' | 'DEAD'
        subState: 'WALK',   // 'IDLE' | 'WALK'
        stateTimer: 0,
        portalIndex: 0,     // Mandatory position-gated vestibule exit portal 0..2
        targetX: -12.35 + spec.laneX * 0.45,
        targetZ: 8.25,
        yaw: 0,
        attackCooldown: 0,
        attackSwungThisCycle: false,
        prevAttackNorm: 0,
        hasPlayedAggroHiss: false,
        walkVocalTimer: spec.walkVocalDelay,
        idleVocalTimer: randRange(1.0, 3.2),
        chaseVocalTimer: randRange(2.8, 4.6),
        steerCommitTimer: 0,
        steerCommitSign: 0,
        watchdogTimer: 0,
        watchdogLastX: 0,
        watchdogLastZ: 0,
        sidestepTimer: 0,
        sidestepDirX: 0,
        sidestepDirZ: 0,
        queuePaused: false,
      });
    }
  }

  /**
   * Starts the staggered 6-zombie stairwell Wave 1 immediately (0.0s .. 9.0s, every 1.8s).
   */
  triggerWave1() {
    this.initWavePool();
    this.sound?.stopAllZombieVocals?.();
    this.waveActive = true;
    this._waveElapsed = 0;

    for (let i = 0; i < this.waveEntries.length; i++) {
      const entry = this.waveEntries[i];
      const zom = entry.zombie;
      zom.reset();
      zom.setActive(false);
      zom.setHitboxesVisible(this.hitboxesVisible);

      entry.spawned = false;
      entry.aiState = 'WAITING';
      entry.subState = 'WALK';
      entry.stateTimer = 0;
      entry.portalIndex = 0;
      entry.targetX = -12.35 + entry.laneX * 0.45;
      entry.targetZ = 8.25;
      entry.yaw = 0;
      entry.attackCooldown = 0;
      entry.attackSwungThisCycle = false;
      entry.prevAttackNorm = 0;
      entry.hasPlayedAggroHiss = false;
      entry.walkVocalTimer = entry.walkVocalDelay;
      entry.idleVocalTimer = randRange(1.0, 3.2);
      entry.chaseVocalTimer = randRange(2.8, 4.6);
      entry.steerCommitTimer = 0;
      entry.steerCommitSign = 0;
      entry.watchdogTimer = 0;
      entry.watchdogLastX = -12.60 + entry.laneX;
      entry.watchdogLastZ = 2.75;
      entry.sidestepTimer = 0;
      entry.sidestepDirX = 0;
      entry.sidestepDirZ = 0;
      entry.queuePaused = false;
    }

    // Immediately activate zombie #1 (delay = 0.0s)
    if (this.waveEntries[0]) {
      this._activateStairClimb(this.waveEntries[0]);
    }
  }

  _activateStairClimb(entry) {
    const zom = entry.zombie;
    entry.spawned = true;
    entry.aiState = 'CLIMB_STAIRS';
    entry.subState = 'WALK';
    entry.portalIndex = 0;
    entry.targetX = -12.35 + entry.laneX * 0.45;
    entry.targetZ = 8.25;
    entry.yaw = 0; // Facing +Z up the stairs
    entry.walkVocalTimer = entry.walkVocalDelay;
    entry.idleVocalTimer = randRange(1.0, 3.2);
    entry.chaseVocalTimer = randRange(2.8, 4.6);
    entry.steerCommitTimer = 0;
    entry.steerCommitSign = 0;
    entry.watchdogTimer = 0;
    entry.watchdogLastX = -12.60 + entry.laneX;
    entry.watchdogLastZ = 2.75;
    entry.sidestepTimer = 0;
    entry.sidestepDirX = 0;
    entry.sidestepDirZ = 0;
    entry.queuePaused = false;

    zom.reset();
    zom.root.position.set(-12.60 + entry.laneX, -2.60, 2.75);
    zom.root.rotation.set(0, 0, 0);
    zom.setActive(true);
    zom.setHitboxesVisible(this.hitboxesVisible);
    zom.playAnimation('Walk', 0);
    if (zom.mixer) zom.mixer.update(0);
  }

  /**
   * Resets & hides Wave-1 zombies cleanly (used on EXIT to menu or re-triggering Wave 1).
   */
  resetWave1() {
    this.waveActive = false;
    this._waveElapsed = 0;
    this.sound?.stopAllZombieVocals?.();
    for (const entry of this.waveEntries) {
      entry.spawned = false;
      entry.aiState = 'WAITING';
      entry.portalIndex = 0;
      entry.hasPlayedAggroHiss = false;
      entry.steerCommitTimer = 0;
      entry.steerCommitSign = 0;
      entry.watchdogTimer = 0;
      entry.sidestepTimer = 0;
      entry.queuePaused = false;
      if (entry.zombie) {
        entry.zombie.reset();
        entry.zombie.setActive(false);
      }
    }
  }

  /**
   * Resets all zombies (Wave 1 + test showcase zombies).
   */
  resetAll() {
    this.resetWave1();
    if (this.womanTemplate) this.womanTemplate.reset();
    if (this.manTemplate) this.manTemplate.reset();
    this.sound?.stopAllZombieVocals?.();
  }

  applyWalkCalibration() {
    if (this.womanTemplate) this.womanTemplate.applyWalkCalibration();
    if (this.manTemplate) this.manTemplate.applyWalkCalibration();
    for (let i = 0; i < this.waveZombies.length; i++) {
      if (this.waveZombies[i]) this.waveZombies[i].applyWalkCalibration();
    }
  }

  /**
   * Toggles visible wireframe hitboxes on all wave and test zombies.
   */
  setHitboxesVisible(visible) {
    this.hitboxesVisible = !!visible;
    if (this.womanTemplate) this.womanTemplate.setHitboxesVisible(this.hitboxesVisible);
    if (this.manTemplate) this.manTemplate.setHitboxesVisible(this.hitboxesVisible);
    for (const zom of this.waveZombies) {
      zom.setHitboxesVisible(this.hitboxesVisible);
    }
    return this.hitboxesVisible;
  }

  /**
   * Returns a flat array of enabled hitbox meshes from all living active zombies
   * for O(N_hitboxes) hitscan checks in WeaponSystem (zero SkinnedMesh raycasting!).
   */
  getActiveHitboxes() {
    const out = this._hitboxesCache;
    out.length = 0;

    const pushFrom = (zom) => {
      if (!zom || !zom.isActive || !zom.isLoaded || zom.isDead) return;
      for (const hb of zom.hitboxes) {
        if (hb && hb.visible && hb.userData?.enabled) {
          out.push(hb);
        }
      }
    };

    if (this.womanTemplate) pushFrom(this.womanTemplate);
    if (this.manTemplate) pushFrom(this.manTemplate);
    for (let i = 0; i < this.waveZombies.length; i++) {
      pushFrom(this.waveZombies[i]);
    }
    return out;
  }

  /**
   * Returns horizontal cylinder colliders ({ x, z, radius }) for living zombies so
   * PlayerController prevents walking through zombies.
   */
  getSolidColliders() {
    const out = this._solidCollidersCache;
    out.length = 0;

    const addIfSolid = (zom) => {
      if (!zom || !zom.isSolidForPlayer()) return;
      out.push({
        x: zom.root.position.x,
        z: zom.root.position.z,
        radius: zom.collisionRadius,
      });
    };

    if (this.womanTemplate) addIfSolid(this.womanTemplate);
    if (this.manTemplate) addIfSolid(this.manTemplate);
    for (let i = 0; i < this.waveZombies.length; i++) {
      addIfSolid(this.waveZombies[i]);
    }
    return out;
  }

  /**
   * Ensures pre-allocated Wave 1 clones & fade materials are GPU shader-warmed during boot.
   */
  prepareWarmUp() {
    const restored = [];
    for (let i = 0; i < this.waveZombies.length; i++) {
      const zom = this.waveZombies[i];
      if (!zom || !zom.isLoaded) continue;
      restored.push({ zom, wasActive: zom.isActive, pos: zom.root.position.clone() });
      zom.root.position.set(-1.5 + i * 1.5, 0, 0);
      zom.setActive(true);
      zom.setFadeMode(true, 1.0);
    }
    return restored;
  }

  finishWarmUp(restored) {
    if (!restored) return;
    for (const item of restored) {
      item.zom.setFadeMode(false, 1.0);
      item.zom.root.position.copy(item.pos);
      item.zom.setActive(item.wasActive);
    }
  }

  /**
   * Resolves hitbox mesh metadata ({ zombie, part, zone, bone }) for WeaponSystem pellet grouping.
   */
  resolveHitboxTarget(hitMesh) {
    return getZombieHitboxMeta(hitMesh);
  }

  /**
   * Spawns visual blood burst & floor/wall splatter for individual pellets without advancing damage.
   */
  spawnPelletBloodImpact(hitMesh, hitPoint, rayDirection) {
    if (!this.decalManager || !hitPoint) return;
    const meta = getZombieHitboxMeta(hitMesh);
    const zombie = meta?.zombie;
    const part = meta?.part || hitMesh?.userData?.part || 'body';
    const isHeadshot = part === 'head';
    if (!zombie) {
      this.decalManager.spawnBloodBurst(hitPoint, rayDirection, isHeadshot);
      this.decalManager.projectBloodSplatter(hitPoint, rayDirection, isHeadshot);
      return;
    }
    zombie._decalManager = this.decalManager;
    const refBone = meta?.bone || (isHeadshot ? zombie._headBone : (zombie._spine2Bone || zombie._spineBone)) || zombie.model;
    if (refBone) {
      refBone.getWorldPosition(_losOrigin);
      _losTarget.copy(_losOrigin).lerp(hitPoint, 0.55);
    } else {
      _losTarget.copy(hitPoint);
    }
    this.decalManager.spawnBloodBurst(_losTarget, rayDirection, isHeadshot);
    this.decalManager.projectBloodSplatter(_losTarget, rayDirection, isHeadshot);
  }

  /**
   * Handles bullet damage from WeaponSystem onto a hit zombie hitbox mesh using the 100% Weapon/Distance Damage Matrix.
   */
  onBulletHit(hitMesh, hitPoint, hitNormal, rayDirection, distance = 5, options = {}) {
    const meta = getZombieHitboxMeta(hitMesh);
    const zombie = options.zombie || meta?.zombie;
    const part = options.zoneOverride || meta?.part || hitMesh?.userData?.part || 'body';
    if (!zombie || typeof zombie.applyBulletHit !== 'function') return { killed: false };

    const weaponId = options.weaponId || 'hk_usp';
    const damage =
      typeof options.damageOverride === 'number' && Number.isFinite(options.damageOverride)
        ? options.damageOverride
        : getWeaponZombieDamage(weaponId, zombie.archetype, part, distance);

    return zombie.applyBulletHit({
      part,
      hitBone: meta?.bone || null,
      hitPoint,
      hitNormal,
      rayDirection,
      decalManager: options.skipDecals ? null : this.decalManager,
      sound: this.sound,
      distance,
      damage,
      playHitAudio: options.playHitAudio !== undefined ? options.playHitAudio : true,
      playHurtVocal: options.playHurtVocal !== undefined ? options.playHurtVocal : true,
    });
  }

  _hasLineOfSightToPlayer(zom, playerPos) {
    if (!this.colliderMesh || !playerPos) return true;
    const zx = zom.root.position.x;
    const zy = zom.root.position.y;
    const zz = zom.root.position.z;

    _losOrigin.set(zx, zy + 1.48, zz);
    _losTarget.set(playerPos.x, playerPos.y + 1.48, playerPos.z);
    _losDir.subVectors(_losTarget, _losOrigin);
    const dist = _losDir.length();
    if (dist < 0.25) return true;
    _losDir.multiplyScalar(1.0 / dist);

    _raycaster.set(_losOrigin, _losDir);
    _raycaster.far = dist - 0.25;
    const hits = _raycaster.intersectObject(this.colliderMesh, false);
    return hits.length === 0;
  }

  _canDetectPlayer(entry) {
    if (!this.player || this.player.hp <= 0) return false;
    const zom = entry.zombie;
    if (zom.tookDamageAggro) return true;

    const pPos = this.player.position;
    const zPos = zom.root.position;
    const dx = pPos.x - zPos.x;
    const dz = pPos.z - zPos.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= 2.8) return true;
    if (dist > 6.2) return false;

    const zombieInOffice = zPos.x > -10.05;
    const playerInOffice = pPos.x > -10.05;
    const inSameRoom = zombieInOffice === playerInOffice;

    if (inSameRoom) return true;
    return this._hasLineOfSightToPlayer(zom, pPos);
  }

  _enterChase(entry) {
    entry.aiState = 'RUN_CHASE';
    entry.queuePaused = false;
    entry.sidestepTimer = 0;
    entry.steerCommitTimer = 0;
    entry.watchdogTimer = 0;
    entry.chaseVocalTimer = randRange(2.8, 4.6);
    const zom = entry.zombie;
    entry.watchdogLastX = zom.root.position.x;
    entry.watchdogLastZ = zom.root.position.z;
    zom.playAnimation('Run', 0.18);
    entry.hasPlayedAggroHiss = true;
    if (this.sound && typeof this.sound.playZombieVocal === 'function') {
      this.sound.playZombieVocal(zom, 'chase');
    }
  }

  _enterAttack(entry) {
    entry.aiState = 'ATTACK';
    entry.queuePaused = false;
    entry.sidestepTimer = 0;
    entry.attackSwungThisCycle = false;
    entry.prevAttackNorm = 0;
    entry.zombie.playAnimation('Attack', 0.15);
    if (this.sound && typeof this.sound.playZombieVocal === 'function') {
      this.sound.playZombieVocal(entry.zombie, 'attack');
    }
  }

  _pickNextOfficeWaypoint(entry, minDist = 2.0) {
    const zPos = entry.zombie.root.position;
    const candidates = [];

    for (let i = 0; i < OFFICE_AISLE_WAYPOINTS.length; i++) {
      const wp = OFFICE_AISLE_WAYPOINTS[i];
      const dist = Math.hypot(wp.x - zPos.x, wp.z - zPos.z);
      if (dist < minDist || dist > 12.5) continue;

      let blocked = false;
      for (let k = 0; k < FLOOR_OBSTACLES.length; k++) {
        if (segmentHitsAabb2D(zPos.x, zPos.z, wp.x, wp.z, FLOOR_OBSTACLES[k], 0.34)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) candidates.push(wp);
    }

    const pool = candidates.length > 0 ? candidates : OFFICE_AISLE_WAYPOINTS;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    entry.targetX = Math.max(-7.8, chosen.x + randRange(-0.35, 0.35));
    entry.targetZ = chosen.z + randRange(-0.35, 0.35);
    entry.watchdogTimer = 0;
    entry.watchdogLastX = zPos.x;
    entry.watchdogLastZ = zPos.z;
  }

  /**
   * Strictly advances vestibule exit portals by XZ distance (<= 0.42m), NEVER on a timer.
   * Forbids main-office free roaming or direct room-wide chases until PORTAL_2 (-8.10, 10.30) is cleared.
   */
  _getActivePortalGoal(entry) {
    const zom = entry.zombie;
    if (zom.hasExitedVestibule) return null;

    const pos = zom.root.position;
    while (entry.portalIndex < VESTIBULE_PORTALS.length) {
      const portal = VESTIBULE_PORTALS[entry.portalIndex];
      const dist = Math.hypot(portal.x - pos.x, portal.z - pos.z);
      if (dist <= 0.42) {
        if (entry.portalIndex < VESTIBULE_PORTALS.length - 1) {
          entry.portalIndex++;
          entry.steerCommitTimer = 0;
          entry.steerCommitSign = 0;
          continue;
        }
        // Only unlock main office once PORTAL_2_OFFICE_ENTRY is reached AND past partition threshold
        if (pos.x > -9.2) {
          zom.hasExitedVestibule = true;
          return null;
        }
      }
      break;
    }

    const clamped = Math.min(entry.portalIndex, VESTIBULE_PORTALS.length - 1);
    return VESTIBULE_PORTALS[clamped];
  }

  /**
   * Checks whether another living zombie blocks the single-file bottleneck ahead of this zombie.
   * Returns a speed multiplier (1.0 = full speed, 0.30 = queue slow, 0.0 = brief yield pause).
   */
  _evaluateBottleneckQueue(entry, ux, uz) {
    const zom = entry.zombie;
    const pos = zom.root.position;
    if (zom.hasExitedVestibule && pos.x >= -8.0) return 1.0;

    let minAheadProj = Infinity;
    for (let i = 0; i < this.waveEntries.length; i++) {
      const other = this.waveEntries[i];
      if (other === entry || !other.spawned || other.aiState === 'DEAD') continue;
      if (!other.zombie.isSolidForPlayer()) continue;

      const oPos = other.zombie.root.position;
      if (Math.abs(oPos.y - pos.y) > 1.2) continue;

      const dx = oPos.x - pos.x;
      const dz = oPos.z - pos.z;
      const proj = dx * ux + dz * uz;
      if (proj <= 0.05 || proj > 0.95) continue;

      const perp = Math.abs(-uz * dx + ux * dz);
      if (perp <= 0.62 && proj < minAheadProj) {
        minAheadProj = proj;
      }
    }

    if (minAheadProj <= 0.72) return 0.0;
    if (minAheadProj <= 0.95) return 0.30;
    return 1.0;
  }

  _rotateYawToward(entry, targetYaw, rate, delta) {
    let diff = targetYaw - entry.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.min(1.0, rate * delta);
    entry.yaw += diff * step;
    entry.zombie.root.rotation.y = entry.yaw;
  }

  _isProbeBlocked(entry, px, pz, includeOtherZombies) {
    for (let i = 0; i < FLOOR_OBSTACLES.length; i++) {
      const b = FLOOR_OBSTACLES[i];
      const pad = b.isDoorJamb ? DOOR_PROBE_PAD : WHISKER_PROBE_PAD;
      if (px > b.minX - pad && px < b.maxX + pad && pz > b.minZ - pad && pz < b.maxZ + pad) {
        return true;
      }
    }

    const pit = STAIRWELL_PIT_AABB;
    if (
      px > pit.minX - WHISKER_PROBE_PAD &&
      px < pit.maxX + WHISKER_PROBE_PAD &&
      pz > pit.minZ - WHISKER_PROBE_PAD &&
      pz < pit.maxZ + WHISKER_PROBE_PAD
    ) {
      return true;
    }

    // Room & vestibule exterior walls
    if (px <= -10.05) {
      if (
        px < -14.20 + WHISKER_PROBE_PAD ||
        pz < 1.25 + WHISKER_PROBE_PAD ||
        pz > 11.25 - WHISKER_PROBE_PAD
      ) {
        return true;
      }
    } else {
      if (
        px > 9.95 - WHISKER_PROBE_PAD ||
        pz > 12.95 - WHISKER_PROBE_PAD ||
        pz < -9.50 + WHISKER_PROBE_PAD
      ) {
        return true;
      }
    }

    if (includeOtherZombies) {
      const minDistSq = 0.76 * 0.76;
      for (let i = 0; i < this.waveEntries.length; i++) {
        const other = this.waveEntries[i];
        if (other === entry || !other.spawned || other.aiState === 'DEAD') continue;
        if (!other.zombie.isSolidForPlayer()) continue;
        const oPos = other.zombie.root.position;
        if (Math.abs(oPos.y - entry.zombie.root.position.y) > 1.2) continue;
        const dx = px - oPos.x;
        const dz = pz - oPos.z;
        if (dx * dx + dz * dz < minDistSq) return true;
      }
    }

    return false;
  }

  _computeWhiskerDirection(entry, ux, uz, distToGoal, delta) {
    if (entry.steerCommitTimer > 0) {
      entry.steerCommitTimer = Math.max(0, entry.steerCommitTimer - delta);
      if (entry.steerCommitTimer <= 0) entry.steerCommitSign = 0;
    }

    const zPos = entry.zombie.root.position;
    const includeZombies = entry.zombie.hasExitedVestibule && zPos.x >= -8.0;
    const dNear = distToGoal > 0.30 ? Math.min(distToGoal, 0.65) : distToGoal;
    const dFar = distToGoal > 0.30 ? Math.min(distToGoal, 1.30) : distToGoal;

    const near0Blocked = this._isProbeBlocked(entry, zPos.x + ux * dNear, zPos.z + uz * dNear, includeZombies);
    const far0Blocked = this._isProbeBlocked(entry, zPos.x + ux * dFar, zPos.z + uz * dFar, includeZombies);

    // Straight line is clear (unless we are finishing a brief committed turn near a corner)
    if (!near0Blocked && !far0Blocked) {
      return { ux, uz };
    }

    let bestScore = -Infinity;
    let bestIdx = 0;
    let bestWx = ux;
    let bestWz = uz;

    for (let i = 0; i < WHISKER_ANGLES.length; i++) {
      const c = WHISKER_COS[i];
      const s = WHISKER_SIN[i];
      const wx = ux * c - uz * s;
      const wz = ux * s + uz * c;

      const nearBlocked = i === 0
        ? near0Blocked
        : this._isProbeBlocked(entry, zPos.x + wx * dNear, zPos.z + wz * dNear, includeZombies);
      const farBlocked = i === 0
        ? far0Blocked
        : this._isProbeBlocked(entry, zPos.x + wx * dFar, zPos.z + wz * dFar, includeZombies);

      let score;
      if (!nearBlocked && !farBlocked) {
        score = 100 - Math.abs(WHISKER_ANGLES[i]) * 18;
      } else if (!nearBlocked) {
        score = 35 - Math.abs(WHISKER_ANGLES[i]) * 10;
      } else {
        score = -50 - Math.abs(WHISKER_ANGLES[i]) * 10;
      }

      // Apply turn-side commitment hysteresis so zombies commit around a corner instead of dithering
      if (entry.steerCommitTimer > 0 && entry.steerCommitSign !== 0 && i > 0) {
        const angleSign = (i % 2 === 1) ? 1 : -1;
        if (angleSign === entry.steerCommitSign) {
          score += 22;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestWx = wx;
        bestWz = wz;
      }
    }

    if (bestIdx > 0 && (near0Blocked || far0Blocked)) {
      const chosenSign = (bestIdx % 2 === 1) ? 1 : -1;
      if (entry.steerCommitTimer <= 0 || entry.steerCommitSign === 0) {
        entry.steerCommitSign = chosenSign;
        entry.steerCommitTimer = 0.65;
      }
    }

    return { ux: bestWx, uz: bestWz };
  }

  _findClosestObstacleNormal(px, pz, maxDist = 0.60) {
    let bestDSq = maxDist * maxDist;
    let bestNx = 0;
    let bestNz = 0;
    let found = false;

    const testBox = (b) => {
      const cx = Math.max(b.minX, Math.min(px, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pz, b.maxZ));
      const dx = px - cx;
      const dz = pz - cz;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDSq && dSq > 1e-8) {
        const d = Math.sqrt(dSq);
        bestDSq = dSq;
        bestNx = dx / d;
        bestNz = dz / d;
        found = true;
      }
    };

    for (let i = 0; i < FLOOR_OBSTACLES.length; i++) {
      testBox(FLOOR_OBSTACLES[i]);
    }
    testBox(STAIRWELL_PIT_AABB);
    return found ? { nx: bestNx, nz: bestNz } : null;
  }

  _moveZombieWithObstacles(entry, goalX, goalZ, speed, delta, allowQueuePause = true) {
    const zom = entry.zombie;
    const pos = zom.root.position;
    const dx = goalX - pos.x;
    const dz = goalZ - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return 0;

    const toGoalX = dx / dist;
    const toGoalZ = dz / dist;

    // 1. Bottleneck Queueing in stairwell / vestibule / doorway (X < -8.0)
    const queueMul = this._evaluateBottleneckQueue(entry, toGoalX, toGoalZ);
    if (allowQueuePause && queueMul === 0.0) {
      if (!entry.queuePaused) {
        entry.queuePaused = true;
        zom.playAnimation('Idle', 0.18);
      }
      this._rotateYawToward(entry, Math.atan2(toGoalX, toGoalZ), 4.5, delta);
      return dist;
    }
    if (entry.queuePaused) {
      entry.queuePaused = false;
      const resumeAnim = entry.aiState === 'RUN_CHASE' ? 'Run' : 'Walk';
      zom.playAnimation(resumeAnim, 0.18);
    }

    // 2. Steer direction: anti-stuck perpendicular sidestep override OR 7-angle whisker feelers
    let steerX;
    let steerZ;
    if (entry.sidestepTimer > 0) {
      entry.sidestepTimer = Math.max(0, entry.sidestepTimer - delta);
      steerX = entry.sidestepDirX;
      steerZ = entry.sidestepDirZ;
    } else {
      const steered = this._computeWhiskerDirection(entry, toGoalX, toGoalZ, dist, delta);
      steerX = steered.ux;
      steerZ = steered.uz;
    }

    const unthrottledStep = Math.min(dist, speed * delta);
    const effectiveSpeed = speed * (queueMul > 0 ? queueMul : 0.30);
    const moveStep = Math.min(dist, effectiveSpeed * delta);

    const prevX = pos.x;
    const prevZ = pos.z;
    pos.x += steerX * moveStep;
    pos.z += steerZ * moveStep;

    this._resolveSingleZombieObstacles(pos, true, steerX, steerZ, goalX, goalZ, moveStep);

    const actualDist = Math.hypot(pos.x - prevX, pos.z - prevZ);
    if (zom.currentState === 'Walk') {
      const movedFrac = unthrottledStep > 1e-4 ? actualDist / unthrottledStep : 1.0;
      zom.syncWalkObstacleBlocking(movedFrac);
    } else if (zom.currentState === 'Run' && delta > 1e-4) {
      zom.syncRunTimeScale(actualDist / delta);
    }

    const turnRate = zom.currentState === 'Run' ? 6.8 : 4.5;
    const desiredYaw = Math.atan2(steerX, steerZ);
    this._rotateYawToward(entry, desiredYaw, turnRate, delta);

    // 3. Anti-stuck watchdog (0.55s moving window, minimum 0.12m XZ progress)
    if (entry.sidestepTimer <= 0) {
      entry.watchdogTimer += delta;
      if (entry.watchdogTimer >= 0.55) {
        const progressed = Math.hypot(pos.x - entry.watchdogLastX, pos.z - entry.watchdogLastZ);
        entry.watchdogTimer = 0;
        entry.watchdogLastX = pos.x;
        entry.watchdogLastZ = pos.z;

        if (progressed < 0.12) {
          if (entry.aiState === 'WANDER_IDLE' && zom.hasExitedVestibule) {
            this._pickNextOfficeWaypoint(entry, 2.5);
          } else {
            // Trigger 0.85s perpendicular sidestep toward the clearer +/-90 deg side
            const includeZombies = zom.hasExitedVestibule && pos.x >= -8.0;
            const leftX = -toGoalZ;
            const leftZ = toGoalX;
            const rightX = toGoalZ;
            const rightZ = -toGoalX;

            const leftClear =
              !this._isProbeBlocked(entry, pos.x + leftX * 0.75, pos.z + leftZ * 0.75, includeZombies) &&
              !this._isProbeBlocked(entry, pos.x + leftX * 1.30, pos.z + leftZ * 1.30, includeZombies);
            const rightClear =
              !this._isProbeBlocked(entry, pos.x + rightX * 0.75, pos.z + rightZ * 0.75, includeZombies) &&
              !this._isProbeBlocked(entry, pos.x + rightX * 1.30, pos.z + rightZ * 1.30, includeZombies);

            if (leftClear && !rightClear) {
              entry.sidestepDirX = leftX;
              entry.sidestepDirZ = leftZ;
            } else if (rightClear && !leftClear) {
              entry.sidestepDirX = rightX;
              entry.sidestepDirZ = rightZ;
            } else {
              const side = (entry.steerCommitSign !== 0 ? entry.steerCommitSign : (entry.index % 2 === 0 ? 1 : -1));
              entry.sidestepDirX = side > 0 ? leftX : rightX;
              entry.sidestepDirZ = side > 0 ? leftZ : rightZ;
            }
            entry.sidestepTimer = 0.85;

            const pushNormal = this._findClosestObstacleNormal(pos.x, pos.z, 0.60);
            if (pushNormal) {
              pos.x += pushNormal.nx * 0.08;
              pos.z += pushNormal.nz * 0.08;
              this._resolveSingleZombieObstacles(pos, true);
            }
          }
        }
      }
    }

    return Math.hypot(goalX - pos.x, goalZ - pos.z);
  }

  _resolveSingleZombieObstacles(
    pos,
    avoidStairPit = true,
    moveDirX = 0,
    moveDirZ = 0,
    goalX = pos.x,
    goalZ = pos.z,
    slideBudget = 0
  ) {
    const r = ZOMBIE_BODY_RADIUS;
    let sumNx = 0;
    let sumNz = 0;
    let hitCount = 0;

    const pushOutPass = (recordNormals) => {
      const pushOutOfAabb = (b) => {
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const dSq = dx * dx + dz * dz;
        if (dSq >= r * r) return;

        let nx = 0;
        let nz = 0;
        if (dSq > 1e-8) {
          const d = Math.sqrt(dSq);
          const push = r - d;
          nx = dx / d;
          nz = dz / d;
          pos.x += nx * push;
          pos.z += nz * push;
        } else {
          const toLeft = Math.abs(pos.x - b.minX);
          const toRight = Math.abs(b.maxX - pos.x);
          const toBot = Math.abs(pos.z - b.minZ);
          const toTop = Math.abs(b.maxZ - pos.z);
          const m = Math.min(toLeft, toRight, toBot, toTop);
          if (m === toLeft) {
            pos.x = b.minX - r;
            nx = -1;
          } else if (m === toRight) {
            pos.x = b.maxX + r;
            nx = 1;
          } else if (m === toBot) {
            pos.z = b.minZ - r;
            nz = -1;
          } else {
            pos.z = b.maxZ + r;
            nz = 1;
          }
        }
        if (recordNormals) {
          sumNx += nx;
          sumNz += nz;
          hitCount++;
        }
      };

      for (let i = 0; i < FLOOR_OBSTACLES.length; i++) {
        pushOutOfAabb(FLOOR_OBSTACLES[i]);
      }
      if (avoidStairPit) {
        pushOutOfAabb(STAIRWELL_PIT_AABB);
      }

      // Exterior room & vestibule boundary clamps
      if (pos.x <= -10.05) {
        if (pos.x < -14.20 + r) {
          pos.x = -14.20 + r;
          if (recordNormals) { sumNx += 1; hitCount++; }
        }
        if (pos.z < 1.25 + r) {
          pos.z = 1.25 + r;
          if (recordNormals) { sumNz += 1; hitCount++; }
        }
        if (pos.z > 11.25 - r) {
          pos.z = 11.25 - r;
          if (recordNormals) { sumNz -= 1; hitCount++; }
        }
      } else {
        if (pos.x > 9.95 - r) {
          pos.x = 9.95 - r;
          if (recordNormals) { sumNx -= 1; hitCount++; }
        }
        if (pos.z > 12.95 - r) {
          pos.z = 12.95 - r;
          if (recordNormals) { sumNz -= 1; hitCount++; }
        }
        if (pos.z < -9.50 + r) {
          pos.z = -9.50 + r;
          if (recordNormals) { sumNz += 1; hitCount++; }
        }
      }
    };

    pushOutPass(true);

    // Active AABB Tangent Corner-Sliding when colliding at a steep angle
    if (hitCount > 0 && slideBudget > 1e-4) {
      const nLen = Math.hypot(sumNx, sumNz);
      if (nLen > 1e-4) {
        const nx = sumNx / nLen;
        const nz = sumNz / nLen;
        const dot = moveDirX * nx + moveDirZ * nz;
        if (dot < -0.20) {
          const t1x = -nz;
          const t1z = nx;
          const t2x = nz;
          const t2z = -nx;
          const gx = goalX - pos.x;
          const gz = goalZ - pos.z;
          const refLen = Math.hypot(gx, gz);
          const rx = refLen > 1e-3 ? gx / refLen : moveDirX;
          const rz = refLen > 1e-3 ? gz / refLen : moveDirZ;
          const d1 = t1x * rx + t1z * rz;
          const d2 = t2x * rx + t2z * rz;
          const tx = d1 >= d2 ? t1x : t2x;
          const tz = d1 >= d2 ? t1z : t2z;
          const slideDist = slideBudget * 0.85;
          pos.x += tx * slideDist;
          pos.z += tz * slideDist;
          pushOutPass(false);
        }
      }
    }
  }

  /**
   * Soft separation between living Wave-1 zombies (minDist = 0.78m once inside main office;
   * disabled in vestibule/doorway bottlenecks so zombies don't shove each other into doorframes) +
   * hard player minimum center distance (0.88m).
   */
  _resolveDynamicSeparations() {
    const minZombieDist = 0.78;
    const minZombieDistSq = minZombieDist * minZombieDist;

    for (let i = 0; i < this.waveEntries.length; i++) {
      const eA = this.waveEntries[i];
      if (!eA.spawned || eA.aiState === 'DEAD' || !eA.zombie.isSolidForPlayer()) continue;
      if (eA.aiState === 'CLIMB_STAIRS') continue;

      for (let j = i + 1; j < this.waveEntries.length; j++) {
        const eB = this.waveEntries[j];
        if (!eB.spawned || eB.aiState === 'DEAD' || !eB.zombie.isSolidForPlayer()) continue;
        if (eB.aiState === 'CLIMB_STAIRS') continue;

        const pA = eA.zombie.root.position;
        const pB = eB.zombie.root.position;
        // Skip sideways separation in vestibule/doorway bottleneck (single-file queueing handles it)
        if (!eA.zombie.hasExitedVestibule || !eB.zombie.hasExitedVestibule || pA.x < -8.0 || pB.x < -8.0) {
          continue;
        }

        const dx = pB.x - pA.x;
        const dz = pB.z - pA.z;
        const dSq = dx * dx + dz * dz;

        if (dSq < minZombieDistSq) {
          const d = Math.sqrt(Math.max(1e-6, dSq));
          const halfPush = (minZombieDist - d) * 0.5;
          const nx = d > 1e-3 ? dx / d : 1;
          const nz = d > 1e-3 ? dz / d : 0;
          pA.x -= nx * halfPush;
          pA.z -= nz * halfPush;
          pB.x += nx * halfPush;
          pB.z += nz * halfPush;
          this._resolveSingleZombieObstacles(pA, true);
          this._resolveSingleZombieObstacles(pB, true);
        }
      }
    }

    // Clamp minimum distance against player capsule (~0.88m)
    if (this.player) {
      const pPos = this.player.position;
      const minPlayerDist = 0.88;
      const minPlayerDistSq = minPlayerDist * minPlayerDist;

      for (let i = 0; i < this.waveEntries.length; i++) {
        const entry = this.waveEntries[i];
        if (!entry.spawned || entry.aiState === 'DEAD' || !entry.zombie.isSolidForPlayer()) continue;
        if (entry.aiState === 'CLIMB_STAIRS' && entry.zombie.root.position.y < -0.5) continue;

        const zPos = entry.zombie.root.position;
        const dx = zPos.x - pPos.x;
        const dz = zPos.z - pPos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minPlayerDistSq && dSq > 1e-8) {
          const d = Math.sqrt(dSq);
          const push = minPlayerDist - d;
          zPos.x += (dx / d) * push;
          zPos.z += (dz / d) * push;
          if (entry.aiState !== 'CLIMB_STAIRS') {
            this._resolveSingleZombieObstacles(zPos, true);
          }
        }
      }
    }
  }

  _updateEntryAI(entry, delta) {
    const zom = entry.zombie;
    if (zom.isDead) {
      entry.aiState = 'DEAD';
      return;
    }

    if (entry.attackCooldown > 0) {
      entry.attackCooldown = Math.max(0, entry.attackCooldown - delta);
    }

    const pos = zom.root.position;
    const pPos = this.player ? this.player.position : null;

    // 1. Phase 1: CLIMB_STAIRS
    if (entry.aiState === 'CLIMB_STAIRS') {
      if (zom.tookDamageAggro && zom.currentState !== 'Run') {
        zom.playAnimation('Run', 0.15);
      }
      const climbSpeed = zom.tookDamageAggro
        ? 3.10
        : zom.getDesiredWalkSpeed();

      const tx = entry.targetX;
      const tz = entry.targetZ;
      const dx = tx - pos.x;
      const dz = tz - pos.z;
      const dist = Math.hypot(dx, dz);

      const prevX = pos.x;
      const prevZ = pos.z;
      let desiredStep = 0;
      if (dist > 0.08) {
        const ux = dx / dist;
        const uz = dz / dist;
        const qMul = this._evaluateBottleneckQueue(entry, ux, uz);
        if (qMul === 0.0) {
          if (!entry.queuePaused) {
            entry.queuePaused = true;
            zom.playAnimation('Idle', 0.18);
          }
          this._rotateYawToward(entry, Math.atan2(ux, uz), 4.5, delta);
        } else {
          if (entry.queuePaused) {
            entry.queuePaused = false;
            zom.playAnimation(zom.tookDamageAggro ? 'Run' : 'Walk', 0.18);
          }
          desiredStep = Math.min(dist, climbSpeed * delta);
          const actualStep = Math.min(dist, climbSpeed * qMul * delta);
          pos.x += ux * actualStep;
          pos.z += uz * actualStep;
          this._rotateYawToward(entry, Math.atan2(ux, uz), 6.5, delta);
        }
      }
      const actualDist = Math.hypot(pos.x - prevX, pos.z - prevZ);
      if (zom.currentState === 'Walk') {
        const movedFrac = desiredStep > 1e-4 ? actualDist / desiredStep : 1.0;
        zom.syncWalkObstacleBlocking(movedFrac);
      } else if (zom.currentState === 'Run' && delta > 1e-4) {
        zom.syncRunTimeScale(actualDist / delta);
      }

      // Stairwell walk vocalization on staggered 3.2s - 5.8s cycle
      if (!zom.tookDamageAggro && !entry.queuePaused && this.sound?.playZombieVocal) {
        entry.walkVocalTimer -= delta;
        if (entry.walkVocalTimer <= 0) {
          this.sound.playZombieVocal(zom, 'walk');
          entry.walkVocalTimer = randRange(3.2, 5.8);
        }
      }

      // Smooth stair elevation curve matching WarehouseBuilder 12 steps (Z=3.68 -> 7.40, Y=-2.22 -> 0.0)
      if (pos.z <= 3.68) {
        const t = Math.max(0, Math.min(1, (pos.z - 2.75) / (3.68 - 2.75)));
        pos.y = -2.60 + t * 0.38;
      } else if (pos.z < 7.40) {
        const t = (pos.z - 3.68) / (7.40 - 3.68);
        pos.y = -2.22 * (1.0 - t);
      } else {
        pos.y = 0.0;
      }

      // Finished stair climb onto vestibule top landing
      if (pos.z >= 7.95 && dist <= 0.45) {
        pos.y = 0.0;
        entry.portalIndex = 0;
        entry.queuePaused = false;
        entry.watchdogTimer = 0;
        entry.watchdogLastX = pos.x;
        entry.watchdogLastZ = pos.z;
        if (this._canDetectPlayer(entry)) {
          this._enterChase(entry);
        } else {
          entry.aiState = 'WANDER_IDLE';
          entry.subState = 'WALK';
          entry.targetX = VESTIBULE_PORTALS[0].x;
          entry.targetZ = VESTIBULE_PORTALS[0].z;
          entry.stateTimer = randRange(3.5, 5.5);
          zom.playAnimation('Walk', 0.22);
        }
      }
      return;
    }

    // Keep grounded after finishing climb
    pos.y = 0.0;

    // 2. Aggro check while wandering
    if (entry.aiState === 'WANDER_IDLE') {
      if (this._canDetectPlayer(entry)) {
        this._enterChase(entry);
        return;
      }

      const activePortal = this._getActivePortalGoal(entry);
      if (activePortal) {
        // Mandatory position-gated vestibule exit: never timer-skip and never pause mid-doorway
        entry.targetX = activePortal.x;
        entry.targetZ = activePortal.z;
        if (entry.subState !== 'WALK' && !entry.queuePaused) {
          entry.subState = 'WALK';
          zom.playAnimation('Walk', 0.22);
        }
        const walkSpeed = zom.getDesiredWalkSpeed();
        this._moveZombieWithObstacles(entry, activePortal.x, activePortal.z, walkSpeed, delta, true);
        if (this.sound?.playZombieVocal) {
          if (entry.queuePaused) {
            entry.idleVocalTimer -= delta;
            if (entry.idleVocalTimer <= 0) {
              this.sound.playZombieVocal(zom, 'idle');
              entry.idleVocalTimer = randRange(3.0, 5.2);
            }
          } else {
            entry.walkVocalTimer -= delta;
            if (entry.walkVocalTimer <= 0) {
              this.sound.playZombieVocal(zom, 'walk');
              entry.walkVocalTimer = randRange(3.2, 5.8);
            }
          }
        }
        // Re-check portal completion immediately after moving
        if (this._getActivePortalGoal(entry) === null && zom.hasExitedVestibule) {
          this._pickNextOfficeWaypoint(entry);
          entry.stateTimer = randRange(3.5, 5.5);
        }
        return;
      }

      // Free patrol inside Main Office (only after PORTAL_2_OFFICE_ENTRY is cleared!)
      if (entry.subState === 'IDLE') {
        entry.stateTimer -= delta;
        if (this.sound?.playZombieVocal) {
          entry.idleVocalTimer -= delta;
          if (entry.idleVocalTimer <= 0) {
            this.sound.playZombieVocal(zom, 'idle');
            entry.idleVocalTimer = randRange(3.0, 5.2);
          }
        }
        if (entry.stateTimer <= 0) {
          entry.subState = 'WALK';
          this._pickNextOfficeWaypoint(entry);
          entry.stateTimer = randRange(3.5, 6.0);
          zom.playAnimation('Walk', 0.22);
        }
      } else {
        entry.stateTimer -= delta;
        const walkSpeed = zom.getDesiredWalkSpeed();
        const remaining = this._moveZombieWithObstacles(entry, entry.targetX, entry.targetZ, walkSpeed, delta, false);
        if (this.sound?.playZombieVocal) {
          entry.walkVocalTimer -= delta;
          if (entry.walkVocalTimer <= 0) {
            this.sound.playZombieVocal(zom, 'walk');
            entry.walkVocalTimer = randRange(3.2, 5.8);
          }
        }
        if (remaining <= 0.45 || entry.stateTimer <= 0) {
          entry.subState = 'IDLE';
          entry.stateTimer = randRange(1.2, 2.5);
          entry.idleVocalTimer = randRange(0.5, 2.0);
          zom.playAnimation('Idle', 0.25);
        }
      }
      return;
    }

    // 3. Phase 3: RUN_CHASE
    if (entry.aiState === 'RUN_CHASE' && pPos) {
      if (this.player.hp <= 0) {
        entry.aiState = 'WANDER_IDLE';
        entry.subState = 'IDLE';
        entry.stateTimer = 2.0;
        zom.playAnimation('Idle', 0.25);
        return;
      }

      const distToPlayer = Math.hypot(pPos.x - pos.x, pPos.z - pos.z);
      const zombieInOffice = pos.x > -10.05;
      const playerInOffice = pPos.x > -10.05;

      if (distToPlayer <= 1.30 && zombieInOffice === playerInOffice && Math.abs(pPos.y - pos.y) < 1.2) {
        this._enterAttack(entry);
        return;
      }

      // Force position-gated portal exit if zombie is still in vestibule/doorway while Roc is in main office
      let goalX = pPos.x;
      let goalZ = pPos.z;
      const activePortal = this._getActivePortalGoal(entry);
      if (activePortal && (playerInOffice || distToPlayer > 1.65)) {
        goalX = activePortal.x;
        goalZ = activePortal.z;
      } else if (zom.hasExitedVestibule && pos.x >= -8.0 && distToPlayer > 2.2) {
        // Coordinated chase flank offset [0°, +30°, -30°] tapering smoothly to 0° near Roc
        const baseAngle = CHASE_FLANK_ANGLES[entry.index % CHASE_FLANK_ANGLES.length];
        if (baseAngle !== 0) {
          const taper = Math.min(1.0, (distToPlayer - 2.2) / 2.0);
          const angle = baseAngle * taper;
          const dx = pPos.x - pos.x;
          const dz = pPos.z - pos.z;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          const stepLen = Math.min(distToPlayer, 2.4);
          const ux = dx / distToPlayer;
          const uz = dz / distToPlayer;
          goalX = pos.x + (ux * c - uz * s) * stepLen;
          goalZ = pos.z + (ux * s + uz * c) * stepLen;
        }
      }

      this._moveZombieWithObstacles(entry, goalX, goalZ, 3.10, delta, true);

      // Sustained chase snarls: wait 2.8s - 4.6s AFTER the previous vocal clip finishes
      if (!zom.vocalChannel?.isPlaying && this.sound?.playZombieVocal) {
        entry.chaseVocalTimer -= delta;
        if (entry.chaseVocalTimer <= 0) {
          this.sound.playZombieVocal(zom, 'chase');
          entry.chaseVocalTimer = randRange(2.8, 4.6);
        }
      }
      return;
    }

    // 4. Phase 4: ATTACK
    if (entry.aiState === 'ATTACK' && pPos) {
      if (this.player.hp <= 0) {
        entry.aiState = 'WANDER_IDLE';
        entry.subState = 'IDLE';
        entry.stateTimer = 2.0;
        zom.playAnimation('Idle', 0.25);
        return;
      }

      const dx = pPos.x - pos.x;
      const dz = pPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      this._rotateYawToward(entry, Math.atan2(dx, dz), 11.0, delta);

      const attackAction = zom.actions.Attack;
      const attackClip = zom.clips.Attack;
      const clipDur = attackClip ? Math.max(0.4, attackClip.duration) : 1.4;
      const normTime = attackAction ? (attackAction.time % clipDur) / clipDur : 0.5;

      // Reset swing latch & trigger attack vocal whenever animation wraps into a new swing windup
      if (normTime < entry.prevAttackNorm) {
        entry.attackSwungThisCycle = false;
        if (this.sound && typeof this.sound.playZombieVocal === 'function') {
          this.sound.playZombieVocal(zom, 'attack');
        }
      }
      entry.prevAttackNorm = normTime;

      // Strike impact trigger at ~45% through Attack clip (once per swing cycle, ~1.2s cooldown)
      if (!entry.attackSwungThisCycle && normTime >= 0.45 && entry.attackCooldown <= 0) {
        entry.attackSwungThisCycle = true;
        entry.attackCooldown = 1.2;

        if (dist <= 1.65 && typeof this.onPlayerHit === 'function') {
          this.onPlayerHit(zom);
        }
      }

      // If Roc moved out of strike range (> 1.65m) after swing completes, resume chasing
      if (dist > 1.65 && (normTime >= 0.78 || entry.attackSwungThisCycle)) {
        this._enterChase(entry);
      }
    }
  }

  update(delta, gameState = 'PLAYING') {
    if (gameState !== 'PLAYING' && gameState !== 'GAME_OVER') return;

    const cam = this.player?.camera || null;
    const pPos = this.player?.position || null;

    // Update showcase/test zombies (e.g., toggled via F9) + real-time 3D spatial audio
    if (this.womanTemplate && this.womanTemplate.isActive) {
      this.womanTemplate.update(delta, cam);
      if (this.sound && cam) {
        this.sound.updateZombieSpatialAudio(this.womanTemplate, cam, pPos);
      }
    }
    if (this.manTemplate && this.manTemplate.isActive) {
      this.manTemplate.update(delta, cam);
      if (this.sound && cam) {
        this.sound.updateZombieSpatialAudio(this.manTemplate, cam, pPos);
      }
    }

    if (!this.waveActive) return;

    this._waveElapsed += delta;

    for (let i = 0; i < this.waveEntries.length; i++) {
      const entry = this.waveEntries[i];
      if (!entry.spawned) {
        if (this._waveElapsed >= entry.spawnDelay) {
          this._activateStairClimb(entry);
        } else {
          continue;
        }
      }

      if (gameState === 'PLAYING') {
        this._updateEntryAI(entry, delta);
      }
      entry.zombie.update(delta, cam);

      if (
        this.sound &&
        cam &&
        (entry.aiState !== 'DEAD' || entry.zombie.vocalChannel?.isPlaying)
      ) {
        this.sound.updateZombieSpatialAudio(entry.zombie, cam, pPos);
      }
    }

    if (gameState === 'PLAYING') {
      this._resolveDynamicSeparations();
    }
  }
}

