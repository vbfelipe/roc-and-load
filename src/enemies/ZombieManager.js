import * as THREE from 'three';
import { ZombieEnemy, HAZMAT_RADIATION_CONFIG, getZombieHitboxMeta } from './ZombieEnemy.js';

// Tutorial Wave schedule (triggered after 1st phone call & explosion): 2 ZombieWoman + 1 ZombieMan
const TUTORIAL_WAVE_SPAWN_SPECS = [
  { archetype: 'woman', delay: 0.0, laneX: -0.32, maxHp: 100, pitchBase: 1.51, walkVocalDelay: 0.45, rootName: 'Tutorial_ZombieWoman_1', logTag: 'Tutorial_ZW_1' },
  { archetype: 'woman', delay: 1.8, laneX: 0.32, maxHp: 100, pitchBase: 1.54, walkVocalDelay: 1.65, rootName: 'Tutorial_ZombieWoman_2', logTag: 'Tutorial_ZW_2' },
  { archetype: 'man', delay: 3.6, laneX: 0.00, maxHp: 100, pitchBase: 0.84, walkVocalDelay: 2.35, rootName: 'Tutorial_ZombieMan_1', logTag: 'Tutorial_ZM_1' },
];

const HORDE_COUNTDOWN_SECONDS = 10;

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

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
  // ZombieHazmat has 3x ZombieMan HP (300 vs 100), so using ZombieMan's per-shot damage gives 3x tank TTK
  const isMan =
    archStr === 'man' ||
    archStr === 'zombieman' ||
    archStr === 'hazmat' ||
    archStr === 'zombiehazmat';
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

// Main Room Red Circle Entry Zone (2.0m-3.2m past doorway threshold, clear of stanchions & in front of fire-hose cabinet)
const RED_CIRCLE_ENTRY_CENTER = { x: -7.35, z: 9.35 };
const RED_CIRCLE_FAN_SPREAD = [
  { x: -0.50, z: -0.35 },
  { x: 0.45, z: 0.35 },
  { x: 0.05, z: -0.10 },
];

// Continuous vestibule -> doorway -> main room red circle entry chain (CLIMB_STAIRS runs at full speed through this path)
const VESTIBULE_PORTALS = [
  { x: -11.35, z: 9.75 },  // PORTAL_0_VESTIBULE_APPROACH (across vestibule toward door)
  { x: -10.30, z: 10.22 }, // PORTAL_1_DOORWAY_CENTER (center of open glass doorway gap)
  { x: -9.00, z: 9.95 },   // PORTAL_2_PAST_DOOR_AND_STANCHIONS (clear of door leaf & stanchions)
  { x: -7.35, z: 9.35 },   // PORTAL_3_RED_CIRCLE_MAIN_ROOM (final entry zone before WANDER_IDLE)
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

// Maintenance Closet doorway threshold center (used to keep patrol waypoints >= 2.5m away)
const MAINTENANCE_DOORWAY_POS = { x: -10.05, z: -4.00 };
const MAINTENANCE_DOORWAY_PATROL_CLEARANCE = 2.5;

// Exact floor-level AABBs from WarehouseBuilder.js so zombies cleanly slide around desks, walls & stairwell
const FLOOR_OBSTACLES = [
  // Partition wall separating Main Office & Vestibule (open doorway Z = 9.752..10.848)
  { minX: -10.24, maxX: -9.97, minZ: -9.60, maxZ: 9.752, isDesk: false, isDoorJamb: true },
  { minX: -10.24, maxX: -9.97, minZ: 10.848, maxZ: 13.10, isDesk: false, isDoorJamb: true },
  // Permanent zombie-only threshold blocker across Maintenance Doorway & expanded Safe-Zone Closet
  { minX: -14.90, maxX: -9.85, minZ: -5.60, maxZ: -2.40, isDesk: false, isDoorJamb: true },
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
  // Vestibule north wall flanking the Elevator Doorway (open doorway X = -13.14..-11.76, Z = 11.30..11.55)
  { minX: -14.20, maxX: -13.14, minZ: 11.25, maxZ: 11.55, isDesk: false, isDoorJamb: true },
  { minX: -11.76, maxX: -10.05, minZ: 11.25, maxZ: 11.55, isDesk: false, isDoorJamb: true },
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

// Precomputed 9-angle whisker table [0°, +18°, -18°, +38°, -38°, +60°, -60°, +82°, -82°]
const WHISKER_ANGLES = [
  0,
  (18 * Math.PI) / 180,
  (-18 * Math.PI) / 180,
  (38 * Math.PI) / 180,
  (-38 * Math.PI) / 180,
  (60 * Math.PI) / 180,
  (-60 * Math.PI) / 180,
  (82 * Math.PI) / 180,
  (-82 * Math.PI) / 180,
];
const WHISKER_COS = WHISKER_ANGLES.map((a) => Math.cos(a));
const WHISKER_SIN = WHISKER_ANGLES.map((a) => Math.sin(a));
const ZOMBIE_BODY_RADIUS = 0.38;
const WHISKER_PROBE_PAD = ZOMBIE_BODY_RADIUS + 0.14; // 0.52m
const DOOR_PROBE_PAD = ZOMBIE_BODY_RADIUS + 0.04;    // 0.42m around 1.1m aperture jambs

// Keep grounded zombies on Y=0 out of the stairwell pit opening & chrome guardrails once they've climbed up
const STAIRWELL_PIT_AABB = { minX: -14.00, maxX: -11.36, minZ: 2.12, maxZ: 7.42, isDesk: false, isDoorJamb: true };

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
  constructor(scene, { womanTemplate = null, manTemplate = null, hazmatTemplate = null, sound = null, decalManager = null } = {}) {
    this.scene = scene;
    this.womanTemplate = womanTemplate;
    this.manTemplate = manTemplate;
    this.hazmatTemplate = hazmatTemplate;
    this.sound = sound;
    this.decalManager = decalManager;

    this.colliderMesh = null;
    this.player = null;
    this.onPlayerHit = null;
    this.onPlayerRadiationDrain = null;
    this.onPlayerRadiationBurst = null;
    this.onZombieKilled = null;
    this.onWave1Cleared = null;
    this.onTutorialWaveCleared = null;
    this.onHordeCountdownChange = null;
    this.onHordeStarted = null;
    this.onHordeCleared = null;

    this.waveZombies = [];
    this.waveEntries = [];
    this._poolByArchetype = { woman: [], man: [], hazmat: [] };
    this._allPoolZombies = [];
    this._poolInitialized = false;
    this.waveMode = 'IDLE'; // 'IDLE' | 'TUTORIAL' | 'HORDE' | 'SOLO_HAZMAT'
    this.isTutorialWave = false;
    this.currentWave = 1;
    this.currentHorde = 0;
    this.infiniteHordesEnabled = false;
    this.hordeCountdownActive = false;
    this.hordeCountdownTimer = 0;
    this._lastHordeCountdownSec = -1;
    this._hordeClearedScheduled = false;
    this._lastHordeCounts = { woman: 0, man: 0, hazmat: 0, total: 0 };
    this.waveActive = false;
    this._waveElapsed = 0;
    this.playerKills = 0;
    this.wave1Cleared = false;
    this._wave1ClearedTimer = 0;
    this._wave1ClearedNotified = false;
    this.isWorldPaused = false;
    this.isPlayerInSafeZone = false;
    this._wasRadiationExposed = false;
    this._testHazmatSkillState = {
      cooldown: 0,
      casting: false,
      timer: 0,
      burstFired: false,
    };

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
    if (this.hazmatTemplate) {
      this.hazmatTemplate.sound = this.sound;
      this.hazmatTemplate.vocalPitchBase = 0.68;
      this.sound?.initZombieVocalChannel?.(this.hazmatTemplate, 0.68);
    }
    for (let i = 0; i < this._allPoolZombies.length; i++) {
      const zom = this._allPoolZombies[i];
      if (!zom) continue;
      zom.sound = this.sound;
      this.sound?.initZombieVocalChannel?.(zom, zom.vocalPitchBase);
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
   * Pre-allocates SkeletonUtils clones for Wave 1 (woman x2, man x1) + Wave 2+ (woman x3, man x2, hazmat x2)
   * at load time (zero runtime GC or texture overhead).
   */
  initWavePool() {
    this._syncSoundToTemplates();
    if (!this.womanTemplate || !this.womanTemplate.isLoaded || this._poolInitialized) {
      return;
    }
    this._poolInitialized = true;

    const manReady = !!(this.manTemplate && this.manTemplate.isLoaded);
    const hazmatReady = !!(this.hazmatTemplate && this.hazmatTemplate.isLoaded);

    const allocatePool = (archetype, count, template, maxHp, defaultPitch) => {
      const list = this._poolByArchetype[archetype];
      for (let i = 0; i < count; i++) {
        const zom = new ZombieEnemy(this.scene, {
          cloneFrom: template,
          archetype,
          maxHp,
          rootName: `Pool_${archetype}_${i + 1}`,
          logTag: `Pool_${archetype}_${i + 1}`,
          spawnPosition: new THREE.Vector3(-12.60, -2.60, 2.75),
          lookAtPosition: new THREE.Vector3(-12.60, 0.0, 9.0),
          active: false,
          sound: this.sound,
          isWaveZombie: true,
          vocalPitchBase: defaultPitch,
        });
        this.sound?.initZombieVocalChannel?.(zom, defaultPitch);
        zom.setHitboxesVisible(this.hitboxesVisible);
        list.push(zom);
        this._allPoolZombies.push(zom);
      }
    };

    allocatePool('woman', 3, this.womanTemplate, 100, 1.55);
    allocatePool('man', 2, manReady ? this.manTemplate : this.womanTemplate, 100, 0.84);
    if (hazmatReady) {
      allocatePool('hazmat', 2, this.hazmatTemplate, 300, 0.68);
    }

    // Bind Tutorial Wave slots immediately for warm-up and initial queries
    this._bindWaveSpecs(TUTORIAL_WAVE_SPAWN_SPECS);
  }

  _bindWaveSpecs(specs) {
    this.waveZombies.length = 0;
    this.waveEntries.length = 0;

    for (const zom of this._allPoolZombies) {
      if (zom) {
        zom.reset();
        zom.setActive(false);
      }
    }

    const usedCounts = { woman: 0, man: 0, hazmat: 0 };
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      let arch = spec.archetype;
      const poolList = this._poolByArchetype[arch];
      let zom = poolList && poolList[usedCounts[arch]];
      if (!zom && poolList) {
        const cloneTemplate =
          arch === 'hazmat'
            ? (this.hazmatTemplate?.isLoaded ? this.hazmatTemplate : null)
            : arch === 'man'
              ? (this.manTemplate?.isLoaded ? this.manTemplate : this.womanTemplate)
              : (this.womanTemplate?.isLoaded ? this.womanTemplate : null);
        if (cloneTemplate && cloneTemplate.isLoaded) {
          const cloneArch = arch === 'man' && cloneTemplate === this.womanTemplate ? 'woman' : arch;
          zom = new ZombieEnemy(this.scene, {
            cloneFrom: cloneTemplate,
            archetype: cloneArch,
            maxHp: spec.maxHp ?? (cloneArch === 'hazmat' ? 300 : 100),
            rootName: spec.rootName || `Pool_${arch}_${usedCounts[arch] + 1}`,
            logTag: spec.logTag || `Pool_${arch}_${usedCounts[arch] + 1}`,
            spawnPosition: new THREE.Vector3(-12.60, -2.60, 2.75),
            lookAtPosition: new THREE.Vector3(-12.60, 0.0, 9.0),
            active: false,
            sound: this.sound,
            isWaveZombie: true,
            vocalPitchBase: spec.pitchBase,
          });
          poolList.push(zom);
          this._allPoolZombies.push(zom);
        }
      }
      if (!zom) {
        arch = 'woman';
        zom = this._poolByArchetype.woman[usedCounts.woman % Math.max(1, this._poolByArchetype.woman.length)];
      }
      if (!zom) continue;
      usedCounts[spec.archetype] = (usedCounts[spec.archetype] || 0) + 1;

      zom.maxHp = spec.maxHp ?? (spec.archetype === 'hazmat' ? 300 : 100);
      zom.hp = zom.maxHp;
      zom.vocalPitchBase = spec.pitchBase;
      this.sound?.initZombieVocalChannel?.(zom, spec.pitchBase);
      zom.reset();
      zom.setActive(false);
      zom.setHitboxesVisible(this.hitboxesVisible);

      this.waveZombies.push(zom);
      const fanBase = RED_CIRCLE_FAN_SPREAD[i % RED_CIRCLE_FAN_SPREAD.length];
      this.waveEntries.push({
        zombie: zom,
        index: i,
        laneX: spec.laneX,
        spawnDelay: spec.delay,
        walkVocalDelay: spec.walkVocalDelay,
        spawned: false,
        aiState: 'WAITING', // 'WAITING' | 'CLIMB_STAIRS' | 'WANDER_IDLE' | 'RUN_CHASE' | 'ATTACK' | 'SKILL_CAST' | 'DEAD'
        subState: 'WALK',   // 'IDLE' | 'WALK'
        stateTimer: 0,
        climbStage: 0,
        portalIndex: 0,
        entryEndX: RED_CIRCLE_ENTRY_CENTER.x + fanBase.x,
        entryEndZ: RED_CIRCLE_ENTRY_CENTER.z + fanBase.z,
        targetX: -12.35 + spec.laneX * 0.45,
        targetZ: 8.25,
        yaw: 0,
        attackCooldown: 0,
        skillCooldown: 0,
        skillTimer: 0,
        skillBurstTriggered: false,
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
   * Builds Tutorial Wave specs cleanly.
   */
  getWaveSpecs(waveNumber = 1) {
    if (waveNumber <= 1) return TUTORIAL_WAVE_SPAWN_SPECS;
    return this.generateHordeSpecs(waveNumber - 1, false);
  }

  /**
   * Generates randomized, strictly escalating Horde specs ("HORDA 1, 2, 3, ...").
   * Horde 1: 2-3 Woman + 1-2 Man (0 Hazmat)
   * Horde 2: grows vs Horde 1 (e.g. 4-5 Woman + 2-3 Man, 0 Hazmat)
   * Horde 3+: introduces ZombieHazmat (1+) alongside more Woman & Man zombies.
   */
  generateHordeSpecs(hordeNumber = 1, commitCounts = true) {
    const num = Math.max(1, Math.floor(hordeNumber));
    const prev = this._lastHordeCounts && this._lastHordeCounts.total > 0
      ? this._lastHordeCounts
      : {
          woman: Math.max(0, num + 1),
          man: Math.max(0, Math.floor((num + 1) / 2)),
          hazmat: num >= 4 ? Math.max(1, Math.floor((num - 2) / 2)) : 0,
          total: num >= 2 ? num * 2 + 1 : 0,
        };

    let woman = 0;
    let man = 0;
    let hazmat = 0;

    if (num === 1) {
      woman = randInt(2, 3);
      man = randInt(1, 2);
      hazmat = 0;
    } else if (num === 2) {
      woman = Math.min(12, prev.woman + randInt(1, 2));
      man = Math.min(8, prev.man + 1);
      hazmat = 0;
    } else if (num === 3) {
      woman = Math.min(12, Math.max(5, prev.woman + randInt(1, 2)));
      man = Math.min(8, Math.max(2, prev.man + randInt(0, 1)));
      hazmat = 1;
    } else {
      woman = Math.min(12, Math.max(num + 2, prev.woman + randInt(1, 2)));
      man = Math.min(8, Math.max(Math.floor(num * 0.75), prev.man + randInt(0, 1)));
      const hazmatFloor = Math.min(4, Math.max(1, Math.floor((num - 1) / 2)));
      hazmat = Math.min(4, Math.max(prev.hazmat, hazmatFloor + (Math.random() < 0.35 ? 1 : 0)));
    }

    let total = woman + man + hazmat;
    if (prev.total > 0 && total <= prev.total && total < 24) {
      if (man < 8 && Math.random() < 0.4) {
        man += 1;
      } else if (woman < 12) {
        woman += 1;
      } else if (hazmat < 4 && num >= 3) {
        hazmat += 1;
      }
      total = woman + man + hazmat;
    }

    if (commitCounts) {
      this._lastHordeCounts = { woman, man, hazmat, total };
    }

    // Build an interleaved order so different archetypes mix naturally on the stairs
    const order = [];
    const remaining = { woman, man, hazmat };
    while (order.length < total) {
      if (remaining.woman > 0) {
        order.push('woman');
        remaining.woman--;
      }
      if (remaining.man > 0 && order.length % 2 === 1) {
        order.push('man');
        remaining.man--;
      }
      if (remaining.hazmat > 0 && order.length >= Math.floor(total / 3) && remaining.woman + remaining.man <= remaining.hazmat * 2) {
        order.push('hazmat');
        remaining.hazmat--;
      } else if (remaining.man > 0 && remaining.woman === 0) {
        order.push('man');
        remaining.man--;
      } else if (remaining.hazmat > 0 && remaining.woman === 0 && remaining.man === 0) {
        order.push('hazmat');
        remaining.hazmat--;
      }
    }

    const delayStep = Math.max(0.95, 1.65 - Math.min(num - 1, 10) * 0.05);
    const lanes = [-0.34, 0.34, 0.0, -0.18, 0.18];
    let womanIdx = 0;
    let manIdx = 0;
    let hazmatIdx = 0;

    return order.map((arch, idx) => {
      const laneX = lanes[idx % lanes.length];
      if (arch === 'hazmat') {
        hazmatIdx++;
        return {
          archetype: 'hazmat',
          delay: idx * delayStep,
          laneX,
          maxHp: 300,
          pitchBase: 0.68 - Math.min(0.05, (hazmatIdx - 1) * 0.02),
          walkVocalDelay: 1.6 + idx * 0.65,
          rootName: `Horde${num}_ZombieHazmat_${hazmatIdx}`,
          logTag: `H${num}_ZH_${hazmatIdx}`,
        };
      }
      if (arch === 'man') {
        manIdx++;
        return {
          archetype: 'man',
          delay: idx * delayStep,
          laneX,
          maxHp: 100,
          pitchBase: 0.84 + ((manIdx - 1) % 3) * 0.03,
          walkVocalDelay: 1.4 + idx * 0.6,
          rootName: `Horde${num}_ZombieMan_${manIdx}`,
          logTag: `H${num}_ZM_${manIdx}`,
        };
      }
      womanIdx++;
      return {
        archetype: 'woman',
        delay: idx * delayStep,
        laneX,
        maxHp: 100,
        pitchBase: 1.50 + ((womanIdx - 1) % 4) * 0.025,
        walkVocalDelay: 0.45 + idx * 0.55,
        rootName: `Horde${num}_ZombieWoman_${womanIdx}`,
        logTag: `H${num}_ZW_${womanIdx}`,
      };
    });
  }

  /**
   * Starts the Tutorial Wave (after 1st phone call & explosion): 2 ZombieWoman + 1 ZombieMan.
   */
  triggerTutorialWave() {
    this.initWavePool();
    this.sound?.stopAllZombieVocals?.();
    this.hordeCountdownActive = false;
    this.hordeCountdownTimer = 0;
    this._lastHordeCountdownSec = -1;
    this._hordeClearedScheduled = false;
    this.infiniteHordesEnabled = false;
    this.currentHorde = 0;
    this.onHordeCountdownChange?.({ active: false, hordeNumber: 0, secondsRemaining: 0, immediate: true });

    this.waveMode = 'TUTORIAL';
    this.isTutorialWave = true;
    this.currentWave = 1;
    this._bindWaveSpecs(TUTORIAL_WAVE_SPAWN_SPECS);

    this.waveActive = true;
    this._waveElapsed = 0;
    this.wave1Cleared = false;
    this._wave1ClearedTimer = 0;
    this._wave1ClearedNotified = false;

    if (this.waveEntries[0]) {
      this._activateStairClimb(this.waveEntries[0]);
    }
  }

  /**
   * Triggers a specific Wave number (Wave 1 triggers Tutorial Wave; 2+ triggers Horde N-1).
   */
  triggerWave(waveNumber = 1) {
    if (waveNumber <= 1) {
      this.triggerTutorialWave();
      return;
    }
    this.triggerHorde(waveNumber - 1);
  }

  /**
   * Backward-compatible alias for triggering the Tutorial Wave.
   */
  triggerWave1() {
    this.triggerTutorialWave();
  }

  /**
   * Begins the infinite Horde survival loop starting at HORDA 1 (10s countdown).
   */
  startInfiniteHordes() {
    this.initWavePool();
    this.infiniteHordesEnabled = true;
    this.isTutorialWave = false;
    this._lastHordeCounts = { woman: 0, man: 0, hazmat: 0, total: 0 };
    this.currentHorde = 0;
    this._hordeClearedScheduled = false;
    this.scheduleNextHorde(1);
  }

  /**
   * Cancels infinite horde progression and hides the countdown banner.
   */
  stopInfiniteHordes(immediate = true) {
    this.infiniteHordesEnabled = false;
    this.hordeCountdownActive = false;
    this.hordeCountdownTimer = 0;
    this._lastHordeCountdownSec = -1;
    this._hordeClearedScheduled = false;
    this.onHordeCountdownChange?.({ active: false, hordeNumber: this.currentHorde, secondsRemaining: 0, immediate });
  }

  /**
   * Starts the 10-second red HUD countdown for Horde `hordeNumber`.
   */
  scheduleNextHorde(hordeNumber = 1) {
    const num = Math.max(1, Math.floor(hordeNumber));
    this.currentHorde = num;
    this.hordeCountdownActive = true;
    this.hordeCountdownTimer = HORDE_COUNTDOWN_SECONDS;
    this._lastHordeCountdownSec = HORDE_COUNTDOWN_SECONDS;
    this._hordeClearedScheduled = false;
    this.onHordeCountdownChange?.({
      active: true,
      hordeNumber: num,
      secondsRemaining: HORDE_COUNTDOWN_SECONDS,
    });
  }

  /**
   * Spawns Horde `hordeNumber` immediately up the stairwell.
   */
  triggerHorde(hordeNumber = 1, { keepInfinite = true } = {}) {
    this.initWavePool();
    this.sound?.stopAllZombieVocals?.();
    const num = Math.max(1, Math.floor(hordeNumber));
    this.waveMode = 'HORDE';
    this.isTutorialWave = false;
    this.currentHorde = num;
    this.currentWave = num + 1;
    this.infiniteHordesEnabled = keepInfinite;
    this.hordeCountdownActive = false;
    this.hordeCountdownTimer = 0;
    this._lastHordeCountdownSec = -1;
    this._hordeClearedScheduled = false;
    this.onHordeCountdownChange?.({ active: false, hordeNumber: num, secondsRemaining: 0, immediate: false });

    const specs = this.generateHordeSpecs(num, true);
    this._bindWaveSpecs(specs);

    this.waveActive = true;
    this._waveElapsed = 0;
    this.wave1Cleared = false;
    this._wave1ClearedTimer = 0;
    this._wave1ClearedNotified = false;

    if (this.waveEntries[0]) {
      this._activateStairClimb(this.waveEntries[0]);
    }
    this.onHordeStarted?.({
      hordeNumber: num,
      counts: { ...this._lastHordeCounts },
    });
  }

  /**
   * Spawns a single solo ZombieHazmat wave from the stairwell for isolated boss testing.
   */
  triggerHazmatAlone() {
    this.initWavePool();
    this.sound?.stopAllZombieVocals?.();
    this.stopInfiniteHordes(true);
    this.waveMode = 'SOLO_HAZMAT';
    this.isTutorialWave = false;
    this.currentWave = 2;
    this._bindWaveSpecs([
      {
        archetype: 'hazmat',
        delay: 0.0,
        laneX: 0.0,
        maxHp: 300,
        pitchBase: 0.68,
        walkVocalDelay: 1.8,
        rootName: 'Solo_ZombieHazmat',
        logTag: 'SOLO_ZH',
      },
    ]);

    this.waveActive = true;
    this._waveElapsed = 0;
    this.wave1Cleared = false;
    this._wave1ClearedTimer = 0;
    this._wave1ClearedNotified = false;

    if (this.waveEntries[0]) {
      this._activateStairClimb(this.waveEntries[0]);
    }
  }

  /**
   * Activates and positions the standalone F9 Dev Tuner ZombieHazmat showcase/combat instance on demand.
   */
  spawnTestHazmat(x = 3.4, z = 2.5) {
    if (!this.hazmatTemplate || !this.hazmatTemplate.isLoaded) return null;
    const h = this.hazmatTemplate;
    h.spawnPosition.set(x, 0.0, z);
    h.reset();
    h.root.position.set(x, 0.0, z);
    h.setActive(true);
    h.setHitboxesVisible(this.hitboxesVisible);
    h.playTestAnimation('Idle', this.sound);
    this._testHazmatSkillState.cooldown = 0;
    this._testHazmatSkillState.casting = false;
    this._testHazmatSkillState.timer = 0;
    this._testHazmatSkillState.burstFired = false;
    return h;
  }

  _activateStairClimb(entry) {
    const zom = entry.zombie;
    const fanBase = RED_CIRCLE_FAN_SPREAD[entry.index % RED_CIRCLE_FAN_SPREAD.length];
    const fanOffX = THREE.MathUtils.clamp(fanBase.x + randRange(-0.22, 0.22), -0.75, 0.75);
    const fanOffZ = THREE.MathUtils.clamp(fanBase.z + randRange(-0.22, 0.22), -0.65, 0.65);

    entry.spawned = true;
    entry.aiState = 'CLIMB_STAIRS';
    entry.subState = 'RUN';
    entry.climbStage = 0;
    entry.portalIndex = 0;
    entry.entryEndX = RED_CIRCLE_ENTRY_CENTER.x + fanOffX;
    entry.entryEndZ = RED_CIRCLE_ENTRY_CENTER.z + fanOffZ;
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
    entry.attackCooldown = 0;
    entry.skillCooldown = 0;
    entry.skillTimer = 0;
    entry.skillBurstTriggered = false;
    entry.attackSwungThisCycle = false;

    zom.reset();
    zom.root.position.set(-12.60 + entry.laneX, -2.60, 2.75);
    zom.root.rotation.set(0, 0, 0);
    zom.setActive(true);
    zom.setHitboxesVisible(this.hitboxesVisible);
    zom.playAnimation('Run', 0);
    if (zom.mixer) zom.mixer.update(0);
  }

  /**
   * Resets & hides Tutorial/Horde stairwell zombies cleanly (used on EXIT to menu or re-triggering waves).
   */
  resetWaves() {
    this.waveActive = false;
    this.waveMode = 'IDLE';
    this.isTutorialWave = false;
    this._waveElapsed = 0;
    this.wave1Cleared = false;
    this._wave1ClearedTimer = 0;
    this._wave1ClearedNotified = false;
    this.stopInfiniteHordes(true);
    this.currentHorde = 0;
    this._lastHordeCounts = { woman: 0, man: 0, hazmat: 0, total: 0 };
    this.isWorldPaused = false;
    this.isPlayerInSafeZone = false;
    this._wasRadiationExposed = false;
    this._testHazmatSkillState.cooldown = 0;
    this._testHazmatSkillState.casting = false;
    this._testHazmatSkillState.timer = 0;
    this._testHazmatSkillState.burstFired = false;
    this.sound?.stopAllZombieVocals?.();
    for (const entry of this.waveEntries) {
      entry.spawned = false;
      entry.aiState = 'WAITING';
      entry.climbStage = 0;
      entry.portalIndex = 0;
      entry.hasPlayedAggroHiss = false;
      entry.steerCommitTimer = 0;
      entry.steerCommitSign = 0;
      entry.watchdogTimer = 0;
      entry.sidestepTimer = 0;
      entry.queuePaused = false;
    }
    for (const zom of this._allPoolZombies) {
      if (zom) {
        zom.reset();
        zom.setActive(false);
      }
    }
  }

  /**
   * Backward-compatible alias for resetting active stairwell waves.
   */
  resetWave1() {
    this.resetWaves();
  }

  /**
   * Resets all zombies (Tutorial Wave + Infinite Hordes + test showcase zombies).
   */
  resetAll() {
    this.resetWaves();
    this.playerKills = 0;
    if (this.womanTemplate) this.womanTemplate.reset();
    if (this.manTemplate) this.manTemplate.reset();
    if (this.hazmatTemplate) this.hazmatTemplate.reset();
    this.sound?.stopAllZombieVocals?.();
  }

  /**
   * Deprecated world-pause hook retained as no-op so Safe Zone entry never freezes outside zombies.
   */
  setWorldPaused(_paused) {
    this.isWorldPaused = false;
  }

  /**
   * Updates Safe Zone state in real time:
   * - While true, all chasing/attacking zombies immediately drop aggro and patrol via WANDER_IDLE (Walk).
   * - While true, player sight/proximity aggro is disabled; re-enables immediately on exit.
   */
  setPlayerInSafeZone(inSafeZone) {
    const next = !!inSafeZone;
    if (this.isPlayerInSafeZone === next) return;
    this.isPlayerInSafeZone = next;

    if (next) {
      for (let i = 0; i < this.waveEntries.length; i++) {
        const entry = this.waveEntries[i];
        if (!entry || !entry.zombie) continue;
        entry.zombie.tookDamageAggro = false;
        if (
          entry.spawned &&
          !entry.zombie.isDead &&
          (entry.aiState === 'RUN_CHASE' || entry.aiState === 'ATTACK' || entry.aiState === 'SKILL_CAST')
        ) {
          this._enterPatrolFromDeAggro(entry);
        }
      }
    }
  }

  /**
   * Transitions a zombie cleanly from RUN_CHASE / ATTACK back to ground-synced Walk patrol (WANDER_IDLE).
   */
  _enterPatrolFromDeAggro(entry) {
    const zom = entry.zombie;
    if (!zom || zom.isDead) return;

    zom.tookDamageAggro = false;
    entry.aiState = 'WANDER_IDLE';
    entry.subState = 'WALK';
    entry.queuePaused = false;
    entry.sidestepTimer = 0;
    entry.steerCommitTimer = 0;
    entry.attackSwungThisCycle = false;
    entry.stateTimer = randRange(3.5, 6.0);
    entry.walkVocalTimer = randRange(1.0, 3.2);

    if (zom.root.position.x <= -9.55) {
      zom.hasExitedVestibule = false;
      entry.portalIndex = 0;
    }

    const activePortal = this._getActivePortalGoal(entry);
    if (activePortal) {
      entry.targetX = activePortal.x;
      entry.targetZ = activePortal.z;
    } else {
      this._pickNextOfficeWaypoint(entry, 2.0);
    }

    zom.playAnimation('Walk', 0.25);
  }

  applyWalkCalibration() {
    if (this.womanTemplate) this.womanTemplate.applyWalkCalibration();
    if (this.manTemplate) this.manTemplate.applyWalkCalibration();
    if (this.hazmatTemplate) this.hazmatTemplate.applyWalkCalibration();
    for (let i = 0; i < this._allPoolZombies.length; i++) {
      if (this._allPoolZombies[i]) this._allPoolZombies[i].applyWalkCalibration();
    }
  }

  /**
   * Toggles visible wireframe hitboxes on all wave and test zombies.
   */
  setHitboxesVisible(visible) {
    this.hitboxesVisible = !!visible;
    if (this.womanTemplate) this.womanTemplate.setHitboxesVisible(this.hitboxesVisible);
    if (this.manTemplate) this.manTemplate.setHitboxesVisible(this.hitboxesVisible);
    if (this.hazmatTemplate) this.hazmatTemplate.setHitboxesVisible(this.hitboxesVisible);
    for (const zom of this._allPoolZombies) {
      if (zom) zom.setHitboxesVisible(this.hitboxesVisible);
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
    if (this.hazmatTemplate) pushFrom(this.hazmatTemplate);
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
    if (this.hazmatTemplate) addIfSolid(this.hazmatTemplate);
    for (let i = 0; i < this.waveZombies.length; i++) {
      addIfSolid(this.waveZombies[i]);
    }
    return out;
  }

  /**
   * Ensures pre-allocated Wave 1 & Wave 2+ clones (including ZombieHazmat) & fade materials are GPU shader-warmed during boot.
   */
  prepareWarmUp() {
    const restored = [];
    const pool = this._allPoolZombies.length > 0 ? this._allPoolZombies : this.waveZombies;
    for (let i = 0; i < pool.length; i++) {
      const zom = pool[i];
      if (!zom || !zom.isLoaded) continue;
      restored.push({ zom, wasActive: zom.isActive, pos: zom.root.position.clone() });
      zom.root.position.set(-1.5 + i * 1.3, 0, 0);
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

    const wasDead = !!zombie.isDead;
    const result = zombie.applyBulletHit({
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

    if (!wasDead && (result?.killed || zombie.isDead)) {
      this.playerKills += 1;
      const isHazmat = zombie.archetype === 'hazmat' || !!zombie.isHazmat;
      const isMan = zombie.archetype === 'man';
      const isHead = !!result?.headshot || part === 'head';
      // Grind-focused economy: makes saving for Medkit ($1k) and higher-tier guns ($3.5k-$60k) reward multiple hordes & headshots
      const baseReward = isHazmat ? 220 : (isMan ? 70 : 35);
      const bonusReward = isHead ? (isHazmat ? 80 : (isMan ? 25 : 15)) : 0;
      const reward = baseReward + bonusReward;
      this.sound?.playRewardTick?.(isHead);
      if (typeof this.onZombieKilled === 'function') {
        this.onZombieKilled({
          zombie,
          isHeadshot: isHead,
          reward,
          kills: this.playerKills,
        });
      }
    }

    return result;
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
    if (this.isPlayerInSafeZone) return false;
    if (!this.player || this.player.hp <= 0) return false;
    const zom = entry.zombie;
    if (zom.tookDamageAggro) return true;
    // Active Horde waves always hunt the player anywhere outside the Safe Zone (prevents elevator/corner camping)
    if (this.waveMode === 'HORDE') return true;

    const pPos = this.player.position;
    const zPos = zom.root.position;
    const dx = pPos.x - zPos.x;
    const dz = pPos.z - zPos.z;
    const dist = Math.hypot(dx, dz);

    const zombieInOffice = zPos.x > -10.05;
    const playerInOffice = pPos.x > -10.05;
    const inSameRoom = zombieInOffice === playerInOffice;

    if (dist <= 2.8) return true;
    const maxDetectDist = (!zombieInOffice && !playerInOffice) ? 10.5 : 6.2;
    if (dist > maxDetectDist) return false;

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
    if (entry.zombie?.isHazmat) {
      return this._enterSkillCast(entry);
    }
    entry.aiState = 'ATTACK';
    entry.queuePaused = false;
    entry.sidestepTimer = 0;
    entry.attackSwungThisCycle = false;
    entry.prevAttackNorm = 0;
    entry.zombie.playAnimation('Attack', 0.08);
    if (this.sound && typeof this.sound.playZombieVocal === 'function') {
      this.sound.playZombieVocal(entry.zombie, 'attack');
    }
  }

  _enterSkillCast(entry) {
    entry.aiState = 'SKILL_CAST';
    entry.queuePaused = false;
    entry.sidestepTimer = 0;
    entry.skillTimer = 0;
    entry.skillBurstTriggered = false;
    entry.zombie.playAnimation('Skill', 0.14);
    if (this.sound && typeof this.sound.playZombieVocal === 'function') {
      this.sound.playZombieVocal(entry.zombie, 'attack');
    }
  }

  _pickNextOfficeWaypoint(entry, minDist = 2.0) {
    const zPos = entry.zombie.root.position;
    const candidates = [];

    for (let i = 0; i < OFFICE_AISLE_WAYPOINTS.length; i++) {
      const wp = OFFICE_AISLE_WAYPOINTS[i];
      const distFromMaintDoor = Math.hypot(
        wp.x - MAINTENANCE_DOORWAY_POS.x,
        wp.z - MAINTENANCE_DOORWAY_POS.z
      );
      if (distFromMaintDoor < MAINTENANCE_DOORWAY_PATROL_CLEARANCE) continue;

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
    let tx = Math.max(-7.8, chosen.x + randRange(-0.35, 0.35));
    let tz = chosen.z + randRange(-0.35, 0.35);
    if (
      Math.hypot(tx - MAINTENANCE_DOORWAY_POS.x, tz - MAINTENANCE_DOORWAY_POS.z) <
      MAINTENANCE_DOORWAY_PATROL_CLEARANCE
    ) {
      tx = chosen.x;
      tz = chosen.z;
    }
    entry.targetX = tx;
    entry.targetZ = tz;
    entry.watchdogTimer = 0;
    entry.watchdogLastX = zPos.x;
    entry.watchdogLastZ = zPos.z;
  }

  /**
   * Strictly advances vestibule -> doorway -> red-circle portals by XZ distance, NEVER on a timer.
   * Forbids main-office free roaming until the zombie is cleanly past the doorway & stanchions.
   */
  _getActivePortalGoal(entry) {
    const zom = entry.zombie;
    if (zom.hasExitedVestibule) return null;

    const pos = zom.root.position;
    const lastIdx = VESTIBULE_PORTALS.length - 1;
    while (entry.portalIndex <= lastIdx) {
      const portal =
        entry.portalIndex === lastIdx && entry.entryEndX !== undefined
          ? { x: entry.entryEndX, z: entry.entryEndZ }
          : VESTIBULE_PORTALS[entry.portalIndex];
      const dist = Math.hypot(portal.x - pos.x, portal.z - pos.z);
      if (dist <= 0.52) {
        if (entry.portalIndex >= 2 && pos.x > -9.2) {
          if (entry.portalIndex === lastIdx) {
            zom.hasExitedVestibule = true;
            return null;
          }
        }
        if (entry.portalIndex < lastIdx) {
          entry.portalIndex++;
          entry.steerCommitTimer = 0;
          entry.steerCommitSign = 0;
          continue;
        }
      }
      break;
    }

    const clamped = Math.min(entry.portalIndex, lastIdx);
    if (clamped === lastIdx && entry.entryEndX !== undefined) {
      return { x: entry.entryEndX, z: entry.entryEndZ };
    }
    return VESTIBULE_PORTALS[clamped];
  }

  /**
   * Checks whether another living zombie blocks the single-file bottleneck ahead of this zombie.
   * Returns a speed multiplier (1.0 = full speed; softened slow during sprint stages so runners flow through the doorway).
   */
  _evaluateBottleneckQueue(entry, ux, uz) {
    const zom = entry.zombie;
    const pos = zom.root.position;
    if (zom.hasExitedVestibule && pos.x >= -7.8) return 1.0;

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
      if (perp <= 0.56 && proj < minAheadProj) {
        minAheadProj = proj;
      }
    }

    // In post-stair sprint stages (1..4), slow down smoothly instead of hard-pausing to Idle
    if (entry.aiState === 'CLIMB_STAIRS' && entry.climbStage >= 1) {
      if (minAheadProj <= 0.58) return 0.45;
      if (minAheadProj <= 0.90) return 0.72;
      return 1.0;
    }

    if (minAheadProj <= 0.68) return 0.0;
    if (minAheadProj <= 0.95) return 0.35;
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

  _isStaticProbeBlocked(entry, px, pz) {
    for (let i = 0; i < FLOOR_OBSTACLES.length; i++) {
      const b = FLOOR_OBSTACLES[i];
      const pad = b.isDoorJamb ? DOOR_PROBE_PAD : WHISKER_PROBE_PAD;
      if (px > b.minX - pad && px < b.maxX + pad && pz > b.minZ - pad && pz < b.maxZ + pad) {
        return true;
      }
    }

    const pit = STAIRWELL_PIT_AABB;
    const pitPad = pit.isDoorJamb ? DOOR_PROBE_PAD : WHISKER_PROBE_PAD;
    if (
      px > pit.minX - pitPad &&
      px < pit.maxX + pitPad &&
      pz > pit.minZ - pitPad &&
      pz < pit.maxZ + pitPad
    ) {
      return true;
    }

    // Room & vestibule exterior walls (with open elevator doorway & cab interior at X = -13.425..-11.475, Z = 11.30..13.30)
    if (px <= -10.05) {
      if (
        px < -14.20 + WHISKER_PROBE_PAD ||
        pz < 1.22 + DOOR_PROBE_PAD
      ) {
        return true;
      }
      if (pz > 11.25) {
        if (
          px < -13.425 + DOOR_PROBE_PAD ||
          px > -11.475 - DOOR_PROBE_PAD ||
          pz > 13.300 - DOOR_PROBE_PAD
        ) {
          return true;
        }
      }
    } else {
      if (
        px > 9.95 - WHISKER_PROBE_PAD ||
        pz > 12.95 - WHISKER_PROBE_PAD ||
        pz < -9.50 + WHISKER_PROBE_PAD
      ) {
        return true;
      }
      // Keep WANDER_IDLE patrol inside the main office room (never wander back into the vestibule)
      if (
        entry.aiState === 'WANDER_IDLE' &&
        entry.zombie.hasExitedVestibule &&
        px < -9.55
      ) {
        return true;
      }
    }

    return false;
  }

  _isZombieProbeBlocked(entry, px, pz, minDistSq = 0.60 * 0.60) {
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
    return false;
  }

  _isProbeBlocked(entry, px, pz, includeOtherZombies) {
    if (this._isStaticProbeBlocked(entry, px, pz)) return true;
    if (includeOtherZombies && this._isZombieProbeBlocked(entry, px, pz, 0.62 * 0.62)) {
      return true;
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
    // Cap far probe short of the goal center so obstacles behind/beside the player don't trigger false turns
    const probeMax = distToGoal > 0.35 ? Math.min(1.25, Math.max(0.35, distToGoal - 0.30)) : distToGoal;
    const dNear = Math.min(probeMax, 0.58);
    const dFar = probeMax;

    const near0Static = this._isStaticProbeBlocked(entry, zPos.x + ux * dNear, zPos.z + uz * dNear);
    const far0Static = this._isStaticProbeBlocked(entry, zPos.x + ux * dFar, zPos.z + uz * dFar);
    const near0Zombie = includeZombies && this._isZombieProbeBlocked(entry, zPos.x + ux * dNear, zPos.z + uz * dNear);
    const far0Zombie = includeZombies && this._isZombieProbeBlocked(entry, zPos.x + ux * dFar, zPos.z + uz * dFar);

    if (!near0Static && !far0Static && !near0Zombie && !far0Zombie) {
      entry.steerCommitTimer = 0;
      entry.steerCommitSign = 0;
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
      const absAngle = Math.abs(WHISKER_ANGLES[i]);

      const nearPx = zPos.x + wx * dNear;
      const nearPz = zPos.z + wz * dNear;
      const farPx = zPos.x + wx * dFar;
      const farPz = zPos.z + wz * dFar;

      const nearStatic = i === 0 ? near0Static : this._isStaticProbeBlocked(entry, nearPx, nearPz);
      const farStatic = i === 0 ? far0Static : this._isStaticProbeBlocked(entry, farPx, farPz);
      const nearZombie = i === 0
        ? near0Zombie
        : (includeZombies && !nearStatic && this._isZombieProbeBlocked(entry, nearPx, nearPz));
      const farZombie = i === 0
        ? far0Zombie
        : (includeZombies && !farStatic && this._isZombieProbeBlocked(entry, farPx, farPz));

      let score;
      if (!nearStatic && !farStatic) {
        score = 100 - absAngle * 18;
      } else if (!nearStatic) {
        score = i === 0 ? 35 : (28 - absAngle * 10);
      } else {
        score = -50 - absAngle * 10;
      }

      // Treat other zombies as a soft crowd penalty so packs peel smoothly (±18°/±38°) instead of circling at ±82°
      if (nearZombie) {
        score -= 18;
      } else if (farZombie) {
        score -= 12;
      }

      // Small tie-breaker around static corners without overriding clear smaller angles or straight far-clear paths
      if (entry.steerCommitTimer > 0 && entry.steerCommitSign !== 0 && i > 0) {
        const angleSign = (i % 2 === 1) ? 1 : -1;
        if (angleSign === entry.steerCommitSign) {
          if (!nearStatic && !farStatic) {
            score += 8;
          } else if (!nearStatic && near0Static) {
            score += 4;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestWx = wx;
        bestWz = wz;
      }
    }

    if (bestIdx > 0 && (near0Static || far0Static)) {
      const chosenSign = (bestIdx % 2 === 1) ? 1 : -1;
      if (entry.steerCommitTimer <= 0 || entry.steerCommitSign === 0) {
        entry.steerCommitSign = chosenSign;
        entry.steerCommitTimer = 0.40;
      }
    } else if (!near0Static && !far0Static) {
      entry.steerCommitTimer = 0;
      entry.steerCommitSign = 0;
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
      const resumeAnim =
        entry.aiState === 'RUN_CHASE' || entry.aiState === 'CLIMB_STAIRS' ? 'Run' : 'Walk';
      zom.playAnimation(resumeAnim, 0.18);
    }

    // 2. Steer direction: anti-stuck perpendicular sidestep override OR 9-angle whisker feelers
    let steerX;
    let steerZ;
    if (entry.sidestepTimer > 0) {
      const probeMax = dist > 0.35 ? Math.min(1.15, Math.max(0.35, dist - 0.30)) : dist;
      const straightClear =
        !this._isStaticProbeBlocked(entry, pos.x + toGoalX * Math.min(probeMax, 0.58), pos.z + toGoalZ * Math.min(probeMax, 0.58)) &&
        !this._isStaticProbeBlocked(entry, pos.x + toGoalX * probeMax, pos.z + toGoalZ * probeMax) &&
        !this._findClosestObstacleNormal(pos.x, pos.z, 0.48);
      if (straightClear) {
        entry.sidestepTimer = 0;
        const steered = this._computeWhiskerDirection(entry, toGoalX, toGoalZ, dist, delta);
        steerX = steered.ux;
        steerZ = steered.uz;
      } else {
        entry.sidestepTimer = Math.max(0, entry.sidestepTimer - delta);
        steerX = entry.sidestepDirX;
        steerZ = entry.sidestepDirZ;
      }
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

    // Keep main-office patrolling zombies from drifting back west through the vestibule doorway
    if (entry.aiState === 'WANDER_IDLE' && zom.hasExitedVestibule && pos.x < -9.55) {
      pos.x = -9.55;
    }

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

    // 3. Anti-stuck watchdog (0.55s moving window, minimum 0.12m XZ progress when not intentionally queued/close)
    if (entry.sidestepTimer <= 0 && dist > 1.65 && effectiveSpeed >= 0.40) {
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
            // Trigger brief 0.38s perpendicular sidestep toward the clearer +/-90 deg side
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
            entry.sidestepTimer = 0.38;

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

      // Exterior room, vestibule & elevator cab boundary clamps
      if (pos.x <= -10.05) {
        if (pos.x < -14.20 + r) {
          pos.x = -14.20 + r;
          if (recordNormals) { sumNx += 1; hitCount++; }
        }
        if (pos.z < 1.22 + r) {
          pos.z = 1.22 + r;
          if (recordNormals) { sumNz += 1; hitCount++; }
        }
        if (pos.z > 11.25) {
          if (pos.x < -13.425 + r) {
            pos.x = -13.425 + r;
            if (recordNormals) { sumNx += 1; hitCount++; }
          }
          if (pos.x > -11.475 - r) {
            pos.x = -11.475 - r;
            if (recordNormals) { sumNx -= 1; hitCount++; }
          }
          if (pos.z > 13.300 - r) {
            pos.z = 13.300 - r;
            if (recordNormals) { sumNz -= 1; hitCount++; }
          }
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
   * Soft separation between living Wave-1 zombies:
   * - Disabled in stairwell / vestibule approach (X < -9.5) so runners don't jam against door jambs.
   * - Softened (0.28x push at 0.62m) through the doorway bottleneck (-9.5 <= X < -7.8) and entry sprint.
   * - Full 0.78m separation once inside the open main office floor, plus 0.88m player capsule clearance.
   */
  _resolveDynamicSeparations() {
    for (let i = 0; i < this.waveEntries.length; i++) {
      const eA = this.waveEntries[i];
      if (!eA.spawned || eA.aiState === 'DEAD' || !eA.zombie.isSolidForPlayer()) continue;
      const pA = eA.zombie.root.position;
      if (eA.aiState === 'CLIMB_STAIRS' && (pA.y < -0.1 || pA.x < -9.5)) continue;

      for (let j = i + 1; j < this.waveEntries.length; j++) {
        const eB = this.waveEntries[j];
        if (!eB.spawned || eB.aiState === 'DEAD' || !eB.zombie.isSolidForPlayer()) continue;
        const pB = eB.zombie.root.position;
        if (eB.aiState === 'CLIMB_STAIRS' && (pB.y < -0.1 || pB.x < -9.5)) continue;

        // Skip sideways separation in stairwell/vestibule bottleneck (single-file queueing handles it)
        if (pA.x < -9.5 || pB.x < -9.5) {
          continue;
        }

        const inEntryBottleneck =
          pA.x < -7.8 ||
          pB.x < -7.8 ||
          eA.aiState === 'CLIMB_STAIRS' ||
          eB.aiState === 'CLIMB_STAIRS';
        const minZombieDist = inEntryBottleneck ? 0.62 : 0.78;
        const pushStrength = inEntryBottleneck ? 0.28 : 0.50;
        const minZombieDistSq = minZombieDist * minZombieDist;

        const dx = pB.x - pA.x;
        const dz = pB.z - pA.z;
        const dSq = dx * dx + dz * dz;

        if (dSq < minZombieDistSq) {
          const d = Math.sqrt(Math.max(1e-6, dSq));
          const push = (minZombieDist - d) * pushStrength;
          const nx = d > 1e-3 ? dx / d : 1;
          const nz = d > 1e-3 ? dz / d : 0;
          pA.x -= nx * push;
          pA.z -= nz * push;
          pB.x += nx * push;
          pB.z += nz * push;
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
    if (entry.skillCooldown > 0) {
      entry.skillCooldown = Math.max(0, entry.skillCooldown - delta);
    }

    const pos = zom.root.position;
    const pPos = this.player ? this.player.position : null;

    // 1. Phase 1: CLIMB_STAIRS (continuous Run sprint up the stairs -> vestibule -> doorway -> Main Room Red Circle)
    if (entry.aiState === 'CLIMB_STAIRS') {
      if (!entry.queuePaused && zom.currentState !== 'Run') {
        zom.playAnimation('Run', 0.15);
      }
      const climbSpeed = zom.tookDamageAggro
        ? 3.10
        : (typeof zom.getDesiredRunSpeed === 'function' ? zom.getDesiredRunSpeed() : 2.65);

      const stage = entry.climbStage ?? 0;
      const tx = entry.targetX;
      const tz = entry.targetZ;
      let remaining = Math.hypot(tx - pos.x, tz - pos.z);

      if (stage === 0) {
        const dx = tx - pos.x;
        const dz = tz - pos.z;
        const prevX = pos.x;
        const prevZ = pos.z;
        if (remaining > 0.08) {
          const ux = dx / remaining;
          const uz = dz / remaining;
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
              zom.playAnimation('Run', 0.18);
            }
            const actualStep = Math.min(remaining, climbSpeed * qMul * delta);
            pos.x += ux * actualStep;
            pos.z += uz * actualStep;
            this._rotateYawToward(entry, Math.atan2(ux, uz), 6.5, delta);
          }
        }
        const actualDist = Math.hypot(pos.x - prevX, pos.z - prevZ);
        if (zom.currentState === 'Run' && delta > 1e-4) {
          zom.syncRunTimeScale(actualDist / delta);
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
        remaining = Math.hypot(tx - pos.x, tz - pos.z);
      } else {
        // Stages 1..4: Sprint on ground (Y = 0.0) across vestibule, through doorway & stanchions into red circle
        pos.y = 0.0;
        remaining = this._moveZombieWithObstacles(entry, tx, tz, climbSpeed, delta, false);
        if (pos.x > -9.2 && stage >= 3) {
          zom.hasExitedVestibule = true;
        }
      }

      // Entry vocalization on staggered 3.2s - 5.8s cycle
      if (!zom.tookDamageAggro && !entry.queuePaused && this.sound?.playZombieVocal) {
        entry.walkVocalTimer -= delta;
        if (entry.walkVocalTimer <= 0) {
          this.sound.playZombieVocal(zom, 'walk');
          entry.walkVocalTimer = randRange(3.2, 5.8);
        }
      }

      // Interrupt sprint if player is right in front, anywhere in the vestibule/elevator once off the stairs, or already aggroed
      if (!this.isPlayerInSafeZone && pos.y >= -0.15 && pPos) {
        const distToPlayer = Math.hypot(pPos.x - pos.x, pPos.z - pos.z);
        const playerInOffice = pPos.x > -10.05;
        const directFrontAggro =
          distToPlayer <= 2.4 && this._hasLineOfSightToPlayer(zom, pPos);
        const vestibuleAggro =
          stage >= 1 && !playerInOffice && this._canDetectPlayer(entry);
        const postDoorAggro = zom.hasExitedVestibule && this._canDetectPlayer(entry);
        if (directFrontAggro || vestibuleAggro || postDoorAggro || (stage >= 1 && zom.tookDamageAggro)) {
          this._enterChase(entry);
          return;
        }
      }

      // Advance along continuous sprint waypoint chain: stairs (0) -> vestibule (1) -> doorway (2) -> threshold (3) -> red circle (4)
      if (stage === 0 && pos.z >= 7.95 && remaining <= 0.52) {
        pos.y = 0.0;
        entry.climbStage = 1;
        entry.portalIndex = 0;
        entry.targetX = VESTIBULE_PORTALS[0].x;
        entry.targetZ = VESTIBULE_PORTALS[0].z;
        entry.queuePaused = false;
        entry.watchdogTimer = 0;
        entry.watchdogLastX = pos.x;
        entry.watchdogLastZ = pos.z;
      } else if (stage >= 1 && stage <= 3 && remaining <= 0.55) {
        const nextStage = stage + 1;
        entry.climbStage = nextStage;
        entry.portalIndex = Math.min(nextStage - 1, VESTIBULE_PORTALS.length - 1);
        if (nextStage === 4) {
          entry.targetX = entry.entryEndX ?? RED_CIRCLE_ENTRY_CENTER.x;
          entry.targetZ = entry.entryEndZ ?? RED_CIRCLE_ENTRY_CENTER.z;
        } else {
          const nextPortal = VESTIBULE_PORTALS[entry.portalIndex];
          entry.targetX = nextPortal.x;
          entry.targetZ = nextPortal.z;
        }
        entry.watchdogTimer = 0;
        entry.watchdogLastX = pos.x;
        entry.watchdogLastZ = pos.z;
      } else if (stage >= 4 && remaining <= 0.55) {
        // Reached Main Room Red Circle Zone: transition into RUN_CHASE or WANDER_IDLE patrol
        pos.y = 0.0;
        zom.hasExitedVestibule = true;
        entry.portalIndex = VESTIBULE_PORTALS.length - 1;
        entry.queuePaused = false;
        entry.watchdogTimer = 0;
        entry.watchdogLastX = pos.x;
        entry.watchdogLastZ = pos.z;
        if (this._canDetectPlayer(entry)) {
          this._enterChase(entry);
        } else {
          entry.aiState = 'WANDER_IDLE';
          entry.subState = 'WALK';
          this._pickNextOfficeWaypoint(entry, 2.2);
          entry.stateTimer = randRange(3.5, 5.5);
          zom.playAnimation('Walk', 0.25);
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
      if (this.isPlayerInSafeZone) {
        this._enterPatrolFromDeAggro(entry);
        return;
      }
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

      if (zom.isHazmat) {
        if (
          distToPlayer <= HAZMAT_RADIATION_CONFIG.skillTriggerRadius &&
          zombieInOffice === playerInOffice &&
          Math.abs(pPos.y - pos.y) < 1.2 &&
          entry.skillCooldown <= 0
        ) {
          this._enterSkillCast(entry);
          return;
        }
      } else if (
        distToPlayer <= 1.55 &&
        (zombieInOffice === playerInOffice || (distToPlayer <= 1.35 && this._hasLineOfSightToPlayer(zom, pPos))) &&
        Math.abs(pPos.y - pos.y) < 1.25
      ) {
        this._enterAttack(entry);
        return;
      }

      // Route cleanly across the vestibule/office glass doorway, around the stairwell pit, and into/out of the elevator cab
      let goalX = pPos.x;
      let goalZ = pPos.z;
      const activePortal = playerInOffice ? this._getActivePortalGoal(entry) : null;
      if (activePortal) {
        goalX = activePortal.x;
        goalZ = activePortal.z;
      } else if (!zombieInOffice && playerInOffice) {
        if (pos.z < 7.45) {
          if (pos.z <= 2.15 && pos.x < -11.00) {
            goalX = -10.80;
            goalZ = 1.67;
          } else {
            goalX = -10.80;
            goalZ = 7.85;
          }
        } else if (pos.z > 11.25) {
          goalX = -12.45;
          goalZ = 10.75;
        } else {
          goalX = -9.55;
          goalZ = 10.22;
        }
      } else if (zombieInOffice && !playerInOffice) {
        goalX = -10.55;
        goalZ = 10.22;
      } else if (!zombieInOffice && !playerInOffice) {
        const playerInSouth = pPos.z <= 2.25;
        const playerInEastWalkway = pPos.x >= -11.36 && pPos.z > 2.12 && pPos.z < 7.42;
        const zombieNorthOfPit = pos.z >= 7.35;
        const zombieSouthOfPit = pos.z <= 2.15;
        const zombieInEastWalkway = pos.x >= -11.36 && pos.z > 2.15 && pos.z < 7.35;

        if (playerInSouth && (zombieNorthOfPit || zombieInEastWalkway)) {
          // Route from north vestibule -> NE walkway corner (-10.80, 7.65) -> SE corner (-10.80, 1.67) -> player
          if (pos.x < -11.00 && pos.z >= 7.35) {
            goalX = -10.80;
            goalZ = 7.65;
          } else if (pos.z > 1.82) {
            goalX = -10.80;
            goalZ = 1.67;
          }
        } else if (playerInEastWalkway && (zombieNorthOfPit || zombieSouthOfPit)) {
          if (zombieNorthOfPit && pos.x < -11.00) {
            goalX = -10.80;
            goalZ = 7.65;
          } else if (zombieSouthOfPit && pos.x < -11.00) {
            goalX = -10.80;
            goalZ = 1.67;
          }
        } else if (!playerInSouth && !playerInEastWalkway && (zombieSouthOfPit || zombieInEastWalkway)) {
          // Player ran back north/elevator while zombie is south of pit or on East Walkway
          if (pos.z <= 2.15 && pos.x < -11.00) {
            goalX = -10.80;
            goalZ = 1.67;
          } else if (pos.z < 7.80) {
            goalX = -10.80;
            goalZ = 7.85;
          }
        } else if (pPos.z > 11.28 && pos.z < 11.20) {
          if (pos.x < -12.82 || pos.x > -12.08 || pos.z < 10.45) {
            goalX = -12.45;
            goalZ = 11.45;
          }
        }
      }

      const chaseSpeed = zom.isHazmat
        ? (typeof zom.getDesiredRunSpeed === 'function' ? zom.getDesiredRunSpeed() : 2.45)
        : (zom.archetype === 'woman' ? 4.35 : 4.05);
      if (zom.isHazmat && distToPlayer <= 1.45) {
        this._rotateYawToward(entry, Math.atan2(pPos.x - pos.x, pPos.z - pos.z), 6.0, delta);
      } else {
        this._moveZombieWithObstacles(entry, goalX, goalZ, chaseSpeed, delta, true);
      }

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

    // 4b. Phase 4b: SKILL_CAST (ZombieHazmat close-range Zombie_Skill radiation burst)
    if (entry.aiState === 'SKILL_CAST' && pPos) {
      if (this.isPlayerInSafeZone) {
        this._enterPatrolFromDeAggro(entry);
        return;
      }
      const dx = pPos.x - pos.x;
      const dz = pPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      this._rotateYawToward(entry, Math.atan2(dx, dz), 9.0, delta);

      entry.skillTimer += delta;
      const skillClip = zom.clips?.Skill || zom.clips?.Attack;
      const clipDur = skillClip ? Math.max(1.2, skillClip.duration) : 3.5;

      if (!entry.skillBurstTriggered && entry.skillTimer >= 0.45) {
        entry.skillBurstTriggered = true;
        entry.skillCooldown = HAZMAT_RADIATION_CONFIG.skillCooldown;
        if (
          dist <= HAZMAT_RADIATION_CONFIG.skillBurstRadius &&
          Math.abs(pPos.y - pos.y) < 1.5 &&
          typeof this.onPlayerRadiationBurst === 'function'
        ) {
          this.onPlayerRadiationBurst(HAZMAT_RADIATION_CONFIG.skillBurstDamage, zom);
        }
      }

      if (entry.skillTimer >= clipDur) {
        if (this.player.hp <= 0) {
          this._enterPatrolFromDeAggro(entry);
        } else {
          this._enterChase(entry);
        }
      }
      return;
    }

    // 4. Phase 4: ATTACK
    if (entry.aiState === 'ATTACK' && pPos) {
      if (this.isPlayerInSafeZone) {
        this._enterPatrolFromDeAggro(entry);
        return;
      }
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

      // Lunge/step forward during the windup instead of freezing on concrete, so moving players still get swiped
      if (!entry.attackSwungThisCycle && normTime < 0.44 && dist > 0.90) {
        const lungeSpeed = zom.archetype === 'woman' ? 3.55 : 3.25;
        this._moveZombieWithObstacles(entry, pPos.x, pPos.z, lungeSpeed, delta, false);
      }
      this._rotateYawToward(entry, Math.atan2(dx, dz), 14.0, delta);

      const postDx = pPos.x - pos.x;
      const postDz = pPos.z - pos.z;
      const postDist = Math.hypot(postDx, postDz);

      // Fast strike impact trigger at ~24% through sped-up (1.65x) Attack clip (~0.50s cadence)
      if (!entry.attackSwungThisCycle && normTime >= 0.24 && entry.attackCooldown <= 0) {
        entry.attackSwungThisCycle = true;
        entry.attackCooldown = 0.50;

        if (postDist <= 1.90 && Math.abs(pPos.y - pos.y) < 1.35 && typeof this.onPlayerHit === 'function') {
          this.onPlayerHit(zom);
        }
      }

      // Immediately resume chasing if the player sprints out of reach before impact or during follow-through
      if (
        (!entry.attackSwungThisCycle && postDist > 2.15) ||
        (postDist > 1.85 && (normTime >= 0.52 || entry.attackSwungThisCycle))
      ) {
        this._enterChase(entry);
      }
    }
  }

  update(delta, gameStateOrPos = 'PLAYING', isPlayerInSafeZoneArg = undefined) {
    const gameState = typeof gameStateOrPos === 'string' ? gameStateOrPos : 'PLAYING';
    if (gameState !== 'PLAYING' && gameState !== 'GAME_OVER') return;

    if (typeof isPlayerInSafeZoneArg === 'boolean') {
      this.setPlayerInSafeZone(isPlayerInSafeZoneArg);
    }

    const cam = this.player?.camera || null;
    const pPos = this.player?.position || (gameStateOrPos && typeof gameStateOrPos === 'object' ? gameStateOrPos : null);
    const inSafeZone = this.isPlayerInSafeZone;

    // Update showcase/test zombies (e.g., toggled via F9) + real-time 3D spatial audio
    if (this.womanTemplate && this.womanTemplate.isActive) {
      this.womanTemplate.update(delta, cam, inSafeZone);
      if (this.sound && cam) {
        this.sound.updateZombieSpatialAudio(this.womanTemplate, cam, pPos);
      }
    }
    if (this.manTemplate && this.manTemplate.isActive) {
      this.manTemplate.update(delta, cam, inSafeZone);
      if (this.sound && cam) {
        this.sound.updateZombieSpatialAudio(this.manTemplate, cam, pPos);
      }
    }
    if (this.hazmatTemplate && this.hazmatTemplate.isActive) {
      this.hazmatTemplate.update(delta, cam, inSafeZone);
      if (this.sound && cam) {
        this.sound.updateZombieSpatialAudio(this.hazmatTemplate, cam, pPos);
      }
      // Allow testing Zombie_Skill 1.85m burst on the standalone F9 Hazmat showcase zombie
      if (
        gameState === 'PLAYING' &&
        !this.hazmatTemplate.isDead &&
        !inSafeZone &&
        pPos &&
        this.player?.hp > 0
      ) {
        const hzPos = this.hazmatTemplate.root.position;
        const hzDist = Math.hypot(pPos.x - hzPos.x, pPos.z - hzPos.z);
        const st = this._testHazmatSkillState;
        if (st.cooldown > 0) st.cooldown = Math.max(0, st.cooldown - delta);
        if (!st.casting && hzDist <= HAZMAT_RADIATION_CONFIG.skillTriggerRadius && Math.abs(pPos.y - hzPos.y) < 1.2 && st.cooldown <= 0) {
          st.casting = true;
          st.timer = 0;
          st.burstFired = false;
          this.hazmatTemplate.playAnimation('Skill', 0.14);
          this.sound?.playZombieVocal?.(this.hazmatTemplate, 'attack');
        }
        if (st.casting) {
          st.timer += delta;
          if (!st.burstFired && st.timer >= 0.45) {
            st.burstFired = true;
            st.cooldown = HAZMAT_RADIATION_CONFIG.skillCooldown;
            if (hzDist <= HAZMAT_RADIATION_CONFIG.skillBurstRadius && Math.abs(pPos.y - hzPos.y) < 1.5) {
              this.onPlayerRadiationBurst?.(HAZMAT_RADIATION_CONFIG.skillBurstDamage, this.hazmatTemplate);
            }
          }
          const clipDur = this.hazmatTemplate.clips?.Skill ? Math.max(1.2, this.hazmatTemplate.clips.Skill.duration) : 3.5;
          if (st.timer >= clipDur) {
            st.casting = false;
            this.hazmatTemplate.playAnimation('Idle', 0.25);
          }
        }
      }
    }

    // Tick active Infinite Horde countdown ("HORDA N: 10..0") while actively playing
    if (gameState === 'PLAYING' && this.hordeCountdownActive) {
      this.hordeCountdownTimer = Math.max(0, this.hordeCountdownTimer - delta);
      const displaySec = Math.ceil(this.hordeCountdownTimer);
      if (this.hordeCountdownTimer <= 0) {
        const hordeToLaunch = this.currentHorde || 1;
        this.hordeCountdownActive = false;
        this._lastHordeCountdownSec = 0;
        this.onHordeCountdownChange?.({
          active: false,
          hordeNumber: hordeToLaunch,
          secondsRemaining: 0,
          immediate: false,
        });
        this.triggerHorde(hordeToLaunch, { keepInfinite: true });
      } else if (displaySec !== this._lastHordeCountdownSec) {
        this._lastHordeCountdownSec = displaySec;
        this.onHordeCountdownChange?.({
          active: true,
          hordeNumber: this.currentHorde || 1,
          secondsRemaining: displaySec,
        });
      }
    }

    if (this.waveActive) {
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
        entry.zombie.update(delta, cam, inSafeZone);

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

        let allSpawned = this.waveEntries.length > 0;
        let allDead = this.waveEntries.length > 0;
        for (let i = 0; i < this.waveEntries.length; i++) {
          const e = this.waveEntries[i];
          if (!e.spawned) {
            allSpawned = false;
            break;
          }
          if (!e.zombie || !e.zombie.isDead) {
            allDead = false;
            break;
          }
        }

        // Track Tutorial Wave cleared (all tutorial zombies spawned and dead) -> trigger Jório's 2nd phone call after 3.0s
        if (
          this.waveMode === 'TUTORIAL' &&
          !this._wave1ClearedNotified &&
          this.waveEntries.length >= TUTORIAL_WAVE_SPAWN_SPECS.length
        ) {
          if (allSpawned && allDead) {
            this.wave1Cleared = true;
            this._wave1ClearedTimer += delta;
            if (this._wave1ClearedTimer >= 3.0) {
              this._wave1ClearedNotified = true;
              if (typeof this.onTutorialWaveCleared === 'function') {
                this.onTutorialWaveCleared();
              } else if (typeof this.onWave1Cleared === 'function') {
                this.onWave1Cleared();
              }
            }
          }
        }

        // Track Infinite Horde cleared -> immediately schedule HORDA N+1: 10 countdown
        if (
          this.waveMode === 'HORDE' &&
          this.infiniteHordesEnabled &&
          !this.hordeCountdownActive &&
          !this._hordeClearedScheduled &&
          allSpawned &&
          allDead
        ) {
          this._hordeClearedScheduled = true;
          this.onHordeCleared?.({ hordeNumber: this.currentHorde });
          this.scheduleNextHorde((this.currentHorde || 1) + 1);
        }
      }
    }

    // Zone 1 Passive Radiation Poisoning Aura (3.6m) across ALL living active ZombieHazmat instances
    if (gameState === 'PLAYING' && !inSafeZone && pPos && this.player && this.player.hp > 0) {
      const auraRadius = HAZMAT_RADIATION_CONFIG.auraRadius;
      let closestDist = Infinity;

      const checkHazmat = (zom) => {
        if (!zom || !zom.isHazmat || !zom.isActive || !zom.isLoaded || zom.isDead) return;
        const zp = zom.root.position;
        if (Math.abs(pPos.y - zp.y) >= 2.2) return;
        const d = Math.hypot(pPos.x - zp.x, pPos.z - zp.z);
        if (d < closestDist) closestDist = d;
      };

      checkHazmat(this.hazmatTemplate);
      for (let i = 0; i < this.waveZombies.length; i++) {
        checkHazmat(this.waveZombies[i]);
      }

      if (closestDist <= auraRadius) {
        const closeness = THREE.MathUtils.clamp(
          (auraRadius - closestDist) / Math.max(0.5, auraRadius - 1.0),
          0,
          1
        );
        const drainRate = THREE.MathUtils.lerp(
          HAZMAT_RADIATION_CONFIG.passiveDrainMin,
          HAZMAT_RADIATION_CONFIG.passiveDrainMax,
          closeness
        );
        this._wasRadiationExposed = true;
        this.sound?.updateRadiationGeiger?.(delta, closeness);
        this.onPlayerRadiationDrain?.(drainRate * delta, Math.max(0.15, closeness), closestDist);
      } else if (this._wasRadiationExposed) {
        this._wasRadiationExposed = false;
        this.sound?.updateRadiationGeiger?.(delta, 0);
        this.onPlayerRadiationDrain?.(0, 0, Infinity);
      }
    } else if (this._wasRadiationExposed) {
      this._wasRadiationExposed = false;
      this.sound?.updateRadiationGeiger?.(delta, 0);
      this.onPlayerRadiationDrain?.(0, 0, Infinity);
    }
  }
}

