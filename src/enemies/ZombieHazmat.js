import * as THREE from 'three';
import { ZombieEnemy } from './ZombieEnemy.js';

const ZOMBIE_HAZMAT_ASSETS = [
  { key: 'GLB', type: 'glb', url: './models/zombie_hazmat.glb', bytes: 24111188 },
];

/**
 * Radioactive Hazmat Boss Tank NPC controller built on ZombieEnemy:
 * - Single GLB rig (/models/zombie_hazmat.glb) with 1024px capped textures & stripped Walk_Root XZ motion
 * - Binds strictly Zombie_Idle, Zombie_Walk_Root (1.0x Patrol / 1.55x Chase), and Zombie_Skill
 *   while ignoring Zombie_EnemySpotted
 * - 3x ZombieMan HP (300 HP), procedural floor death collapse, and 3.6m yellow-green radiation aura
 */
export class ZombieHazmat extends ZombieEnemy {
  constructor(scene, options = {}) {
    super(scene, {
      ...options,
      singleGlb: true,
      assets: options.assets ?? ZOMBIE_HAZMAT_ASSETS,
      rootName: options.rootName ?? 'NPC_ZombieHazmat',
      logTag: options.logTag ?? 'ZombieHazmat',
      idleAssetLabel: options.idleAssetLabel ?? 'zombie_hazmat.glb',
      spawnPosition: options.spawnPosition ?? new THREE.Vector3(3.4, 0.0, 2.5),
      lookAtPosition: options.lookAtPosition ?? new THREE.Vector3(0.0, 0.0, -3.0),
      targetHeight: options.targetHeight ?? 2.28,
      archetype: options.archetype ?? 'hazmat',
      maxHp: options.maxHp ?? 300,
      walkSpeed: options.walkSpeed ?? 0.85,
      runSpeed: options.runSpeed ?? 1.50,
      vocalPitchBase: options.vocalPitchBase ?? 0.68,
      collisionRadius: options.collisionRadius ?? 0.48,
    });
  }
}

