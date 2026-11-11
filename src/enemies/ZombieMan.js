import * as THREE from 'three';
import { ZombieEnemy } from './ZombieEnemy.js';

const ZOMBIE_MAN_ASSETS = [
  { key: 'Idle', type: 'fbx', url: './models/zombieMan/zombieMan_Idle.fbx', bytes: 1499344 },
  { key: 'Walk', type: 'fbx', url: './models/zombieMan/zombieMan_Walking.fbx', bytes: 588720 },
  { key: 'Run', type: 'fbx', url: './models/zombieMan/zombieMan_Running.fbx', bytes: 331152 },
  { key: 'Attack', type: 'fbx', url: './models/zombieMan/zombieMan_Attack.fbx', bytes: 681104 },
  { key: 'Death', type: 'fbx', url: './models/zombieMan/zombieMan_Death.fbx', bytes: 598448 },
  { key: 'PBR', type: 'glb', url: './models/zombieMan/zombieMan.glb', bytes: 6079924 },
];

/**
 * Zombie Man NPC controller built on the shared ZombieEnemy pipeline:
 * 5 stitched Mixamo clips, GLB PBR material transfer, 1024px texture capping,
 * 2.22m hero scale, and in-place Walk/Run root motion locking.
 */
export class ZombieMan extends ZombieEnemy {
  constructor(scene, options = {}) {
    super(scene, {
      ...options,
      assets: options.assets ?? ZOMBIE_MAN_ASSETS,
      rootName: options.rootName ?? 'NPC_ZombieMan',
      logTag: options.logTag ?? 'ZombieMan',
      idleAssetLabel: options.idleAssetLabel ?? 'zombieMan_Idle.fbx',
      spawnPosition: options.spawnPosition ?? new THREE.Vector3(1.6, 0.0, 2.5),
      lookAtPosition: options.lookAtPosition ?? new THREE.Vector3(0.0, 0.0, -3.0),
      targetHeight: options.targetHeight ?? 2.22,
    });
  }
}

