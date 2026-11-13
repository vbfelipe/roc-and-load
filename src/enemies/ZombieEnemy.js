import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const ZOMBIE_STATES = ['Idle', 'Walk', 'Run', 'Attack', 'Death'];

const ZOMBIE_ASSETS = [
  { key: 'Idle', type: 'fbx', url: './models/zombieWoman/Zombie_Idle.fbx', bytes: 1497200 },
  { key: 'Walk', type: 'fbx', url: './models/zombieWoman/Zombie_Walk.fbx', bytes: 588720 },
  { key: 'Run', type: 'fbx', url: './models/zombieWoman/Zombie_Run.fbx', bytes: 326832 },
  { key: 'Attack', type: 'fbx', url: './models/zombieWoman/Zombie_Attack.fbx', bytes: 552112 },
  { key: 'Death', type: 'fbx', url: './models/zombieWoman/Zombie_Dying.fbx', bytes: 640032 },
  { key: 'PBR', type: 'glb', url: './models/zombieWoman/zombie_woman.glb', bytes: 20084800 },
];

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'];
const MAX_TEXTURE_SIZE = 1024;

const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpVecC = new THREE.Vector3();
const _tmpScale = new THREE.Vector3();
const _tmpQuatA = new THREE.Quaternion();
const _tmpQuatB = new THREE.Quaternion();
const _tmpMat4 = new THREE.Matrix4();
const _unitY = new THREE.Vector3(0, 1, 0);
const _hitboxMeta = new WeakMap();

/**
 * Live Walk locomotion calibration shared across test & Wave-1 zombies and tuned via F9.
 */
export const WALK_CALIBRATION = {
  footLockPinning: true,
  walkTimeScale: 1.18,
  pinMultiplier: 1.00,
};

/**
 * Returns non-serializable zombie/bone metadata for a hitbox mesh without polluting Object3D.userData.
 */
export function getZombieHitboxMeta(hitboxMesh) {
  return hitboxMesh ? _hitboxMeta.get(hitboxMesh) || null : null;
}

/**
 * Downscales oversized textures (> 1024px) onto an offscreen 1024x1024 canvas
 * at load time and releases the original decoded ImageBitmap/image memory.
 */
function downscaleTextureIfNeeded(tex, maxSize = MAX_TEXTURE_SIZE) {
  if (!tex || !tex.isTexture || !tex.image) return;

  const origImage = tex.image;
  const width = origImage.width || origImage.naturalWidth || 0;
  const height = origImage.height || origImage.naturalHeight || 0;
  if (width <= maxSize && height <= maxSize) return;

  const canvas = document.createElement('canvas');
  canvas.width = maxSize;
  canvas.height = maxSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(origImage, 0, 0, maxSize, maxSize);

  tex.image = canvas;
  tex.mipmaps = [];
  tex.needsUpdate = true;

  if (typeof origImage.close === 'function') {
    origImage.close();
  } else if (
    typeof HTMLImageElement !== 'undefined' &&
    origImage instanceof HTMLImageElement &&
    origImage.src?.startsWith('blob:')
  ) {
    URL.revokeObjectURL(origImage.src);
  }
}

/**
 * Strips Blender-style numeric suffixes (e.g. ".001") and normalizes for case-insensitive matching.
 */
function normalizeName(name) {
  return (name || '').trim().replace(/\.\d+$/, '').toLowerCase();
}

function normalizeBoneKey(name) {
  return (name || '').replace(/[:.\s_-]/g, '').toLowerCase();
}

function findBone(rootObj, candidates) {
  if (!rootObj) return null;
  const wanted = candidates.map(normalizeBoneKey);
  const byExact = new Map();
  rootObj.traverse((node) => {
    const key = normalizeBoneKey(node.name);
    if (key && !byExact.has(key)) {
      byExact.set(key, node);
    }
  });
  for (const w of wanted) {
    if (byExact.has(w)) return byExact.get(w);
  }
  for (const [k, node] of byExact.entries()) {
    for (const w of wanted) {
      if (k.endsWith(w) || k.includes(w)) return node;
    }
  }
  return null;
}

/**
 * Computes the [uMin, uMax, vMin, vMax] UV bounds of a BufferGeometry.
 */
function computeUvBounds(geometry) {
  const uv = geometry?.attributes?.uv;
  if (!uv || uv.count === 0) return null;
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  const area = Math.max(0, uMax - uMin) * Math.max(0, vMax - vMin);
  return { uMin, uMax, vMin, vMax, area };
}

/**
 * Registers KHR_materials_pbrSpecularGlossiness translation on GLTFLoader so Three.js r186+
 * preserves diffuse/normal maps from Sketchfab specular-glossiness GLBs as MeshStandardMaterial.
 */
function createZombieGLTFLoader() {
  const loader = new GLTFLoader();
  loader.register((parser) => ({
    name: 'KHR_materials_pbrSpecularGlossiness',
    getMaterialType(materialIndex) {
      const matDef = parser.json.materials?.[materialIndex];
      return matDef?.extensions?.KHR_materials_pbrSpecularGlossiness
        ? THREE.MeshStandardMaterial
        : null;
    },
    extendMaterialParams(materialIndex, materialParams) {
      const matDef = parser.json.materials?.[materialIndex];
      const ext = matDef?.extensions?.KHR_materials_pbrSpecularGlossiness;
      if (!ext) return Promise.resolve();

      const pending = [];
      if (Array.isArray(ext.diffuseFactor)) {
        materialParams.color = new THREE.Color().setRGB(
          ext.diffuseFactor[0],
          ext.diffuseFactor[1],
          ext.diffuseFactor[2],
          THREE.LinearSRGBColorSpace
        );
        materialParams.opacity = ext.diffuseFactor[3] ?? 1.0;
      }

      if (ext.diffuseTexture !== undefined) {
        pending.push(
          parser.assignTexture(materialParams, 'map', ext.diffuseTexture, THREE.SRGBColorSpace)
        );
      }

      materialParams.metalness = 0.0;
      const useFactor = ext.glossinessFactor !== undefined && !(ext.glossinessFactor === 0 && ext.specularGlossinessTexture);
      materialParams.roughness = useFactor
        ? Math.max(1.0 - ext.glossinessFactor, 0.55)
        : 0.7;

      return Promise.all(pending);
    },
  }));
  return loader;
}

/**
 * Locks horizontal X/Z translation on hips position tracks at frame 0 so locomotion loops in-place.
 */
function lockHipsRootMotionXZ(clip) {
  if (!clip?.tracks) return;
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const nodeName = track.name.slice(0, -'.position'.length).toLowerCase();
    if (!nodeName.includes('hips')) continue;

    const values = track.values;
    if (!values || values.length < 3) continue;
    const originX = values[0];
    const originZ = values[2];
    for (let i = 0; i < values.length; i += 3) {
      values[i] = originX;
      values[i + 2] = originZ;
    }
  }
}

/**
 * Disposes geometries, skeletons, and materials on a temporary or retired hierarchy.
 */
function disposeTemporaryHierarchy(rootObj, preservedTextures = null) {
  if (!rootObj) return;
  rootObj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.skeleton && typeof child.skeleton.dispose === 'function') {
      child.skeleton.dispose();
    }
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!m) continue;
        if (preservedTextures) {
          for (const slot of TEXTURE_SLOTS) {
            const tex = m[slot];
            if (tex && tex.isTexture && !preservedTextures.has(tex)) {
              tex.dispose();
            }
          }
        }
        if (typeof m.dispose === 'function') m.dispose();
      }
    }
  });
  if (typeof rootObj.clear === 'function') {
    rootObj.clear();
  }
  if (Array.isArray(rootObj.animations)) {
    rootObj.animations.length = 0;
  }
}

/**
 * Resolves the closest matching PBR material record from the GLB onto an FBX SkinnedMesh.
 */
function resolveGlbMaterial(fbxMesh, meshIndex, glbRecords) {
  if (!glbRecords.length) return null;

  const fbxMeshKey = normalizeName(fbxMesh.name);
  const fbxMat = Array.isArray(fbxMesh.material) ? fbxMesh.material[0] : fbxMesh.material;
  const fbxMatKey = normalizeName(fbxMat?.name);

  for (const rec of glbRecords) {
    if (fbxMeshKey && rec.normMeshName === fbxMeshKey) return rec.material;
    if (fbxMeshKey && rec.normMatName === fbxMeshKey) return rec.material;
    if (fbxMatKey && rec.normMeshName === fbxMatKey) return rec.material;
    if (fbxMatKey && fbxMatKey !== '__default' && rec.normMatName === fbxMatKey) return rec.material;
  }

  const fbxUv = computeUvBounds(fbxMesh.geometry);
  if (fbxUv) {
    const eps = 0.015;
    let bestRec = null;
    let bestArea = Infinity;
    for (const rec of glbRecords) {
      const guv = rec.uvBounds;
      if (!guv) continue;
      const contains =
        fbxUv.uMin >= guv.uMin - eps &&
        fbxUv.uMax <= guv.uMax + eps &&
        fbxUv.vMin >= guv.vMin - eps &&
        fbxUv.vMax <= guv.vMax + eps;
      if (contains && guv.area < bestArea) {
        bestArea = guv.area;
        bestRec = rec;
      }
    }
    if (bestRec) return bestRec.material;
  }

  if (glbRecords.length >= 2 && (fbxMeshKey.includes('bottom') || fbxMeshKey.includes('top'))) {
    return glbRecords[1].material;
  }

  return glbRecords[meshIndex % glbRecords.length].material;
}

/**
 * Zombie NPC controller managing FBX skeletal assembly (or zero-cost SkeletonUtils clones),
 * shared 1024x1024 GLB PBR textures, bone-mounted raycast hitboxes, combat damage/blood decals,
 * and smooth cross-faded AnimationMixer playback + corpse vanish.
 */
export class ZombieEnemy {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.assets = options.assets ?? ZOMBIE_ASSETS;
    this.logTag = options.logTag ?? 'ZombieEnemy';
    this.idleAssetLabel = options.idleAssetLabel ?? 'Zombie_Idle.fbx';
    this.spawnPosition = options.spawnPosition
      ? options.spawnPosition.clone()
      : new THREE.Vector3(0.0, 0.0, 2.5);
    this.lookAtPosition = options.lookAtPosition
      ? options.lookAtPosition.clone()
      : new THREE.Vector3(0.0, 0.0, -3.0);
    this.targetHeight = options.targetHeight ?? 2.00;
    this.isClone = !!options.cloneFrom;

    this.root = new THREE.Group();
    this.root.name = options.rootName ?? 'NPC_ZombieWoman';
    this.root.position.copy(this.spawnPosition);
    this.root.lookAt(this.lookAtPosition);

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.clips = {};
    this.states = ZOMBIE_STATES;
    this.currentState = 'Idle';
    this.isLoaded = false;
    this.isActive = options.active !== undefined ? !!options.active : true;
    this.root.visible = this.isActive;

    this._loadPromise = null;
    this._progressCallbacks = [];
    this._textures = [];
    this._materials = [];
    this._fadeMaterials = [];
    this._meshBindings = [];

    // Bones & Hitboxes
    this._headBone = null;
    this._headTopBone = null;
    this._spine2Bone = null;
    this._spineBone = null;
    this._hipsBone = null;
    this._leftFootPinBone = null;
    this._rightFootPinBone = null;
    this.headHitbox = null;
    this.bodyHitbox = null;
    this.hitboxes = [];
    this._hitboxesWireframeVisible = false;

    // Stance-foot ground pinning state for zero-slide Walk locomotion
    this._footPinInitialized = false;
    this._footPinPrevLeftZ = 0;
    this._footPinPrevRightZ = 0;
    this._smoothedWalkSpeed = 0.46 * WALK_CALIBRATION.walkTimeScale * WALK_CALIBRATION.pinMultiplier;

    // Combat / Health / Corpse & Audio lifecycle
    this.sound = options.sound ?? null;
    this.isWaveZombie = !!options.isWaveZombie;
    const defaultPitch = (options.logTag || options.rootName || '').includes('Man') ? 0.84 : 1.00;
    this.vocalPitchBase = options.vocalPitchBase ?? defaultPitch;
    this.vocalChannel = null;
    this._walkVocalTimer = options.initialWalkVocalDelay ?? (0.5 + Math.random() * 2.5);
    this._idleVocalTimer = 0.8 + Math.random() * 2.0;
    this._chaseVocalTimer = 0;
    this._prevTestAttackNorm = 0;

    this.maxHp = options.maxHp ?? 3;
    this.hp = this.maxHp;
    this.isDead = false;
    this.collisionRadius = options.collisionRadius ?? 0.42;
    this.tookDamageAggro = false;
    this.hasExitedVestibule = this.spawnPosition.x > -9.2;
    this._flinchTimer = 0;
    this._deathPhase = 'NONE'; // 'NONE' | 'PLAYING' | 'HOLDING' | 'FADING' | 'DONE'
    this._deathTimer = 0;
    this._deathClipDuration = 2.0;
    this._deathBaseY = 0;
    this._attachedWoundDecals = [];
    this._decalManager = null;

    if (options.cloneFrom) {
      this.initFromTemplate(options.cloneFrom);
    }
  }

  /**
   * Initializes a zero-GC cloned zombie instance from an already-loaded template ZombieEnemy
   * using SkeletonUtils.clone() while sharing all 1024x1024 PBR textures and clips.
   */
  initFromTemplate(template) {
    if (!template || !template.isLoaded || !template.model) return this;

    // Temporarily detach template's bone-parented hitboxes so SkeletonUtils.clone only copies rig meshes
    const prevState = template.currentState;
    const detachedHitboxes = [];
    for (const hb of template.hitboxes) {
      if (hb && hb.parent) {
        detachedHitboxes.push({ hb, parent: hb.parent });
        hb.parent.remove(hb);
      }
    }

    let clonedModel = null;
    try {
      clonedModel = SkeletonUtils.clone(template.model);
    } finally {
      for (const { hb, parent } of detachedHitboxes) {
        parent.add(hb);
      }
    }

    this._textures = template._textures; // Shared reference (0 extra texture memory)
    this._materials = [];
    this._fadeMaterials = [];
    this._meshBindings = [];

    const baseMatToFade = new Map();
    clonedModel.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;

      const baseMat = child.material;
      if (!baseMat || Array.isArray(baseMat)) return;

      if (!this._materials.includes(baseMat)) {
        this._materials.push(baseMat);
      }
      let fadeMat = baseMatToFade.get(baseMat);
      if (!fadeMat) {
        fadeMat = baseMat.clone();
        fadeMat.transparent = true;
        fadeMat.opacity = 1.0;
        fadeMat.depthWrite = true;
        fadeMat.needsUpdate = true;
        baseMatToFade.set(baseMat, fadeMat);
        this._fadeMaterials.push(fadeMat);
      }
      this._meshBindings.push({ mesh: child, baseMat, fadeMat });
    });

    this.model = clonedModel;
    this.root.add(this.model);
    if (this.scene && this.root.parent !== this.scene) {
      this.scene.add(this.root);
    }

    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = template.clips;
    for (const stateName of this.states) {
      const clip = this.clips[stateName];
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (stateName === 'Death') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      this.actions[stateName] = action;
    }

    if (this.actions.Idle) {
      this.actions.Idle.play();
      this.currentState = 'Idle';
      this.mixer.update(0);
    }

    this._setupHitboxes();
    this.isLoaded = true;
    this.currentState = this.actions.Idle ? 'Idle' : prevState;
    return this;
  }

  /**
   * Loads the base FBX rig, all 4 animation FBXs, and the PBR GLB in parallel.
   */
  load(onProgress) {
    if (onProgress) {
      this._progressCallbacks.push(onProgress);
    }

    if (this.isLoaded) {
      if (onProgress) onProgress(1.0, 'complete');
      return Promise.resolve(this);
    }

    if (this._loadPromise) {
      return this._loadPromise;
    }

    const fbxLoader = new FBXLoader();
    const gltfLoader = createZombieGLTFLoader();

    const assets = this.assets;
    const weights = assets.map((a) => a.bytes);
    const totalWeight = weights.reduce((acc, b) => acc + b, 0);
    const fractions = new Float64Array(assets.length);

    const notifyProgress = (label) => {
      let weightedSum = 0;
      for (let i = 0; i < assets.length; i++) {
        weightedSum += fractions[i] * weights[i];
      }
      const overall = totalWeight > 0 ? weightedSum / totalWeight : 0;
      for (const cb of this._progressCallbacks) {
        try {
          cb(overall, label);
        } catch (err) {
          console.error(err);
        }
      }
    };

    const loadSingleAsset = (def, index) => {
      const loader = def.type === 'glb' ? gltfLoader : fbxLoader;
      return new Promise((resolve, reject) => {
        loader.load(
          def.url,
          (result) => {
            fractions[index] = 1.0;
            notifyProgress(def.key);
            resolve({ def, result });
          },
          (xhr) => {
            if (xhr.lengthComputable && xhr.total > 0) {
              fractions[index] = Math.min(0.99, xhr.loaded / xhr.total);
              notifyProgress(def.key);
            }
          },
          (err) => {
            reject(new Error(`Failed to load ${def.url}: ${err?.message || err}`));
          }
        );
      });
    };

    this._loadPromise = Promise.all(
      assets.map((def, idx) => loadSingleAsset(def, idx))
    ).then((loadedItems) => {
      const byKey = new Map(loadedItems.map((item) => [item.def.key, item.result]));
      this._assembleCharacter(byKey);
      byKey.clear();
      loadedItems.length = 0;
      this.isLoaded = true;
      notifyProgress('complete');
      return this;
    });

    return this._loadPromise;
  }

  _assembleCharacter(assetsByKey) {
    const idleFbx = assetsByKey.get('Idle');
    const glb = assetsByKey.get('PBR');
    const glbRoot = glb?.scene || glb;

    // 1. Collect PBR material records from GLB
    const glbRecords = [];
    const glbSourceMaterials = new Set();
    if (glbRoot) {
      glbRoot.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const primaryMat = mats[0];
        if (!primaryMat) return;
        glbSourceMaterials.add(primaryMat);
        glbRecords.push({
          mesh: child,
          meshName: child.name,
          normMeshName: normalizeName(child.name),
          material: primaryMat,
          matName: primaryMat.name,
          normMatName: normalizeName(primaryMat.name),
          uvBounds: computeUvBounds(child.geometry),
        });
      });
    }

    // 2. Scale once at load time & align feet to Y = 0.00m
    idleFbx.position.set(0, 0, 0);
    idleFbx.scale.set(1, 1, 1);
    idleFbx.updateMatrixWorld(true);
    const unscaledBox = new THREE.Box3().setFromObject(idleFbx);
    const unscaledHeight = unscaledBox.max.y - unscaledBox.min.y;
    const uniformScale = unscaledHeight > 0.0001 ? this.targetHeight / unscaledHeight : 0.01;
    idleFbx.scale.setScalar(uniformScale);
    idleFbx.position.set(0, -unscaledBox.min.y * uniformScale, 0);
    idleFbx.updateMatrixWorld(true);

    // 3. Transfer & tune PBR materials onto FBX SkinnedMeshes (downscaling >1024px textures to 1024x1024)
    const uploadedTextures = new Set();
    const registerTexture = (tex) => {
      if (tex && tex.isTexture && !uploadedTextures.has(tex)) {
        uploadedTextures.add(tex);
        downscaleTextureIfNeeded(tex, MAX_TEXTURE_SIZE);
        if (tex.anisotropy !== undefined) tex.anisotropy = Math.max(tex.anisotropy || 1, 4);
        this._textures.push(tex);
      }
    };

    let meshIndex = 0;
    let totalVertices = 0;
    let totalTriangles = 0;
    idleFbx.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;

      const posAttr = child.geometry?.attributes?.position;
      const vertCount = posAttr ? posAttr.count : 0;
      const triCount = child.geometry?.index
        ? Math.floor(child.geometry.index.count / 3)
        : Math.floor(vertCount / 3);
      totalVertices += vertCount;
      totalTriangles += triCount;

      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;

      const sourceMat = resolveGlbMaterial(child, meshIndex, glbRecords);
      meshIndex++;
      if (!sourceMat) return;

      const mat = sourceMat.isMeshStandardMaterial
        ? sourceMat.clone()
        : new THREE.MeshStandardMaterial();

      for (const slot of TEXTURE_SLOTS) {
        const tex = sourceMat[slot];
        if (tex) {
          mat[slot] = tex;
          registerTexture(tex);
        }
      }

      if (mat.map) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
      }
      mat.roughness = Math.max(mat.roughness ?? 0.7, 0.55);
      mat.metalness = 0.0;
      mat.envMapIntensity = 0.35;

      const normMesh = normalizeName(child.name);
      if (normMesh.includes('eyelash')) {
        mat.transparent = true;
        mat.alphaTest = 0.3;
        mat.depthWrite = false;
        mat.side = THREE.DoubleSide;
      }

      mat.needsUpdate = true;
      const oldMats = child.material
        ? (Array.isArray(child.material) ? child.material : [child.material])
        : [];
      child.material = mat;
      for (const oldMat of oldMats) {
        if (oldMat && oldMat !== mat && typeof oldMat.dispose === 'function') {
          oldMat.dispose();
        }
      }
      this._materials.push(mat);

      const fadeMat = mat.clone();
      fadeMat.transparent = true;
      fadeMat.opacity = 1.0;
      fadeMat.depthWrite = true;
      fadeMat.needsUpdate = true;
      this._fadeMaterials.push(fadeMat);
      this._meshBindings.push({ mesh: child, baseMat: mat, fadeMat });
    });

    console.info(
      `[${this.logTag}] ${this.idleAssetLabel} loaded: ${meshIndex} SkinnedMeshes, ${totalVertices} vertices, ${totalTriangles} triangles`
    );

    if (glbRoot) {
      disposeTemporaryHierarchy(glbRoot, uploadedTextures);
    }
    for (const m of glbSourceMaterials) {
      if (m && typeof m.dispose === 'function') m.dispose();
    }
    glbSourceMaterials.clear();
    glbRecords.length = 0;

    // 4. Attach base character rig to scene root
    this.model = idleFbx;
    this.root.add(this.model);
    if (this.scene && this.root.parent !== this.scene) {
      this.scene.add(this.root);
    }

    // 5. Register all 5 Mixamo animations onto AnimationMixer + enforce in-place XZ on Walk/Run
    this.mixer = new THREE.AnimationMixer(this.model);

    for (const stateName of this.states) {
      const fbxObj = assetsByKey.get(stateName);
      const rawClip = fbxObj?.animations?.[0];
      if (rawClip) {
        const clip = rawClip.clone();
        clip.name = stateName;
        if (stateName === 'Walk' || stateName === 'Run') {
          lockHipsRootMotionXZ(clip);
        }

        this.clips[stateName] = clip;
        const action = this.mixer.clipAction(clip);
        if (stateName === 'Death') {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
        }
        this.actions[stateName] = action;
      }

      if (stateName !== 'Idle' && fbxObj) {
        disposeTemporaryHierarchy(fbxObj);
      }
    }

    if (this.actions.Idle) {
      this.actions.Idle.play();
      this.currentState = 'Idle';
      this.mixer.update(0);
    }

    this._setupHitboxes();
  }

  /**
   * Builds a tight, anatomically calibrated multi-bone hitbox rig directly attached to the
   * Mixamo skeleton (Head sphere + Chest/Shoulders box + Pelvis box + articulated Arm/Leg capsules).
   */
  _setupHitboxes() {
    return this._createHitboxes();
  }

  _createHitboxes() {
    if (!this.model) return;

    // Clean any previously attached hitboxes if rebuilt
    for (const hb of this.hitboxes) {
      if (hb) {
        if (hb.parent) hb.parent.remove(hb);
        if (hb.geometry) hb.geometry.dispose();
        if (hb.material) hb.material.dispose();
      }
    }
    this.hitboxes.length = 0;

    this._headBone = findBone(this.model, ['mixamorigHead', 'mixamorig:Head', 'Head']);
    this._headTopBone = findBone(this.model, ['mixamorigHeadTop_End', 'mixamorig:HeadTop_End', 'HeadTop_End']);
    this._neckBone = findBone(this.model, ['mixamorigNeck', 'mixamorig:Neck', 'Neck']);
    this._spine2Bone = findBone(this.model, ['mixamorigSpine2', 'mixamorig:Spine2', 'Spine2']);
    this._spine1Bone = findBone(this.model, ['mixamorigSpine1', 'mixamorig:Spine1', 'Spine1']);
    this._spineBone = findBone(this.model, ['mixamorigSpine', 'mixamorig:Spine', 'Spine']) || this._spine1Bone;
    this._hipsBone = findBone(this.model, ['mixamorigHips', 'mixamorig:Hips', 'Hips']);

    const leftArm = findBone(this.model, ['mixamorigLeftArm', 'mixamorig:LeftArm', 'LeftArm']);
    const leftForeArm = findBone(this.model, ['mixamorigLeftForeArm', 'mixamorig:LeftForeArm', 'LeftForeArm']);
    const leftHand = findBone(this.model, ['mixamorigLeftHand', 'mixamorig:LeftHand', 'LeftHand']);
    const rightArm = findBone(this.model, ['mixamorigRightArm', 'mixamorig:RightArm', 'RightArm']);
    const rightForeArm = findBone(this.model, ['mixamorigRightForeArm', 'mixamorig:RightForeArm', 'RightForeArm']);
    const rightHand = findBone(this.model, ['mixamorigRightHand', 'mixamorig:RightHand', 'RightHand']);

    const leftUpLeg = findBone(this.model, ['mixamorigLeftUpLeg', 'mixamorig:LeftUpLeg', 'LeftUpLeg']);
    const leftLeg = findBone(this.model, ['mixamorigLeftLeg', 'mixamorig:LeftLeg', 'LeftLeg']);
    const leftFoot = findBone(this.model, ['mixamorigLeftFoot', 'mixamorig:LeftFoot', 'LeftFoot']);
    const leftToe = findBone(this.model, ['mixamorigLeftToeBase', 'mixamorig:LeftToeBase', 'LeftToeBase']);
    const rightUpLeg = findBone(this.model, ['mixamorigRightUpLeg', 'mixamorig:RightUpLeg', 'RightUpLeg']);
    const rightLeg = findBone(this.model, ['mixamorigRightLeg', 'mixamorig:RightLeg', 'RightLeg']);
    const rightFoot = findBone(this.model, ['mixamorigRightFoot', 'mixamorig:RightFoot', 'RightFoot']);
    const rightToe = findBone(this.model, ['mixamorigRightToeBase', 'mixamorig:RightToeBase', 'RightToeBase']);

    this._leftFootPinBone = leftToe || leftFoot;
    this._rightFootPinBone = rightToe || rightFoot;

    this.root.updateMatrixWorld(true);

    const getInvScale = (bone) => {
      bone.getWorldScale(_tmpScale);
      return 1.0 / Math.max(0.0001, (_tmpScale.x + _tmpScale.y + _tmpScale.z) / 3);
    };

    const registerHitbox = (parentBone, geometry, name, part, color) => {
      const mat = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        visible: this._hitboxesWireframeVisible,
      });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.name = `${this.root.name}_${name}`;
      mesh.frustumCulled = false;
      mesh.userData = {
        isZombieHitbox: true,
        part,
        zone: part,
        enabled: true,
      };
      _hitboxMeta.set(mesh, {
        zombie: this,
        part,
        zone: part,
        bone: parentBone,
      });
      parentBone.add(mesh);
      this.hitboxes.push(mesh);
      return mesh;
    };

    // Compute world torso/head orientation basis helpers
    this.root.getWorldQuaternion(_tmpQuatA);
    const rootRightWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(_tmpQuatA).normalize();
    const rootForwardWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(_tmpQuatA).normalize();

    const makeAlignedQuat = (upDirWorld) => {
      const yAxis = upDirWorld.clone().normalize();
      const xAxis = rootRightWorld.clone().addScaledVector(yAxis, -rootRightWorld.dot(yAxis));
      if (xAxis.lengthSq() < 1e-5) xAxis.set(1, 0, 0);
      xAxis.normalize();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
      _tmpMat4.makeBasis(xAxis, yAxis, zAxis);
      return {
        quat: new THREE.Quaternion().setFromRotationMatrix(_tmpMat4),
        forward: zAxis,
      };
    };

    // 1. Tight Head Cranial Ellipsoid Hitbox (covers face, brow, crown & back of skull, red wireframe, 1-hit kill)
    const headParent = this._headBone || this.model;
    const headInvScale = getInvScale(headParent);
    const headSizeScale = Math.max(0.98, Math.min(1.12, this.targetHeight / 2.02));
    const headGeo = new THREE.SphereGeometry(1.0, 10, 8);
    this.headHitbox = registerHitbox(headParent, headGeo, 'HeadHitbox', 'head', 0xff3b30);
    this.headHitbox.scale.set(
      0.125 * headSizeScale * headInvScale,
      0.145 * headSizeScale * headInvScale,
      0.160 * headSizeScale * headInvScale
    );

    if (this._headBone) {
      const headPos = new THREE.Vector3();
      this._headBone.getWorldPosition(headPos);

      const headUp = new THREE.Vector3(0, 1, 0);
      const centerWorld = new THREE.Vector3();
      let hasHeadTop = false;

      if (this._headTopBone) {
        const headTopPos = new THREE.Vector3();
        this._headTopBone.getWorldPosition(headTopPos);
        const span = new THREE.Vector3().subVectors(headTopPos, headPos);
        if (span.length() > 0.04) {
          hasHeadTop = true;
          headUp.copy(span).normalize();
          centerWorld.copy(headPos).lerp(headTopPos, 0.52);
        }
      }

      if (!hasHeadTop) {
        if (this._neckBone) {
          const neckPos = new THREE.Vector3();
          this._neckBone.getWorldPosition(neckPos);
          const neckToHead = new THREE.Vector3().subVectors(headPos, neckPos);
          if (neckToHead.length() > 0.02) {
            headUp.copy(neckToHead).normalize();
          } else {
            this._headBone.getWorldQuaternion(_tmpQuatB);
            headUp.set(0, 1, 0).applyQuaternion(_tmpQuatB).normalize();
          }
        } else {
          this._headBone.getWorldQuaternion(_tmpQuatB);
          headUp.set(0, 1, 0).applyQuaternion(_tmpQuatB).normalize();
        }
        centerWorld.copy(headPos).addScaledVector(headUp, 0.135);
      }

      const faceForward = rootForwardWorld.clone().addScaledVector(headUp, -rootForwardWorld.dot(headUp));
      if (faceForward.lengthSq() < 1e-5) faceForward.copy(rootForwardWorld);
      faceForward.normalize();
      // Shift center slightly back toward skull core so front face & full occiput stay covered
      centerWorld.addScaledVector(faceForward, -0.015 * headSizeScale);

      const headBasis = makeAlignedQuat(headUp);
      headParent.getWorldQuaternion(_tmpQuatB).invert();
      this.headHitbox.quaternion.multiplyQuaternions(_tmpQuatB, headBasis.quat);

      headParent.worldToLocal(centerWorld);
      this.headHitbox.position.copy(centerWorld);
    } else {
      this.headHitbox.position.set(0, (this.targetHeight - 0.14) * headInvScale, 0);
    }

    // 2. Upper Torso / Chest & Shoulders (Spine1 -> Neck, -0.04m lower extension, width 0.35m, depth 0.24m)
    const chestParent = this._spine2Bone || this._spine1Bone || this._spineBone || this.model;
    const chestInvScale = getInvScale(chestParent);
    const chestBottomBone = this._spine1Bone || this._spineBone || this._spine2Bone || this._hipsBone || chestParent;
    const chestTopBone = this._neckBone || this._headBone || this._spine2Bone || chestParent;

    const pChestBot = new THREE.Vector3();
    const pChestTop = new THREE.Vector3();
    chestBottomBone.getWorldPosition(pChestBot);
    chestTopBone.getWorldPosition(pChestTop);

    const chestDir = new THREE.Vector3().subVectors(pChestTop, pChestBot);
    if (chestDir.lengthSq() < 1e-5) {
      chestDir.set(0, 1, 0).applyQuaternion(_tmpQuatA);
    }
    chestDir.normalize();
    pChestBot.addScaledVector(chestDir, -0.04);

    const chestHeight = Math.max(0.32, pChestBot.distanceTo(pChestTop));
    const chestGeo = new THREE.BoxGeometry(
      0.35 * chestInvScale,
      chestHeight * chestInvScale,
      0.24 * chestInvScale
    );
    const chestMesh = registerHitbox(chestParent, chestGeo, 'ChestHitbox', 'body', 0x22d3ee);
    this.bodyHitbox = chestMesh;

    const chestBasis = makeAlignedQuat(chestDir);
    chestParent.getWorldQuaternion(_tmpQuatB).invert();
    chestMesh.quaternion.multiplyQuaternions(_tmpQuatB, chestBasis.quat);

    const chestMid = pChestBot.clone().lerp(pChestTop, 0.5).addScaledVector(chestBasis.forward, 0.02);
    chestParent.worldToLocal(chestMid);
    chestMesh.position.copy(chestMid);

    // 3. Lower Torso / Abdomen & Pelvis (0.06m below hip-socket line -> Spine1/Spine2, width 0.33m, depth 0.23m)
    const pelvisParent = this._hipsBone || this._spineBone || this.model;
    const pelvisInvScale = getInvScale(pelvisParent);
    const pelvisTopBone = this._spine1Bone || this._spine2Bone || this._spineBone || pelvisParent;

    const pHipLine = new THREE.Vector3();
    if (leftUpLeg && rightUpLeg) {
      const pLU = new THREE.Vector3();
      const pRU = new THREE.Vector3();
      leftUpLeg.getWorldPosition(pLU);
      rightUpLeg.getWorldPosition(pRU);
      pHipLine.copy(pLU).lerp(pRU, 0.5);
    } else {
      pelvisParent.getWorldPosition(pHipLine);
    }

    const pPelvisTop = new THREE.Vector3();
    pelvisTopBone.getWorldPosition(pPelvisTop);

    const pelvisDir = new THREE.Vector3().subVectors(pPelvisTop, pHipLine);
    if (pelvisDir.lengthSq() < 1e-5) {
      pelvisDir.copy(chestDir);
    }
    pelvisDir.normalize();

    const pPelvisBot = pHipLine.clone().addScaledVector(pelvisDir, -0.06);
    pPelvisTop.addScaledVector(pelvisDir, 0.02);

    const pelvisHeight = Math.max(0.24, pPelvisBot.distanceTo(pPelvisTop));
    const pelvisGeo = new THREE.BoxGeometry(
      0.33 * pelvisInvScale,
      pelvisHeight * pelvisInvScale,
      0.23 * pelvisInvScale
    );
    const pelvisMesh = registerHitbox(pelvisParent, pelvisGeo, 'PelvisHitbox', 'body', 0x22d3ee);

    const pelvisBasis = makeAlignedQuat(pelvisDir);
    pelvisParent.getWorldQuaternion(_tmpQuatB).invert();
    pelvisMesh.quaternion.multiplyQuaternions(_tmpQuatB, pelvisBasis.quat);

    const pelvisMid = pPelvisBot.clone().lerp(pPelvisTop, 0.5).addScaledVector(pelvisBasis.forward, 0.015);
    pelvisParent.worldToLocal(pelvisMid);
    pelvisMesh.position.copy(pelvisMid);

    // 4 & 5. Articulated Limb Capsules (Upper Arm, Forearm, Thigh, Shin on Left & Right)
    const addLimbSegment = (startBone, endBone, name, worldRadius, extendPastEnd = 0) => {
      if (!startBone || !endBone) return null;
      const invScale = getInvScale(startBone);
      startBone.getWorldPosition(_tmpVecA);
      endBone.getWorldPosition(_tmpVecB);
      _tmpVecC.subVectors(_tmpVecB, _tmpVecA);
      const rawDist = _tmpVecC.length();
      if (rawDist < 0.04) return null;

      _tmpVecC.multiplyScalar(1.0 / rawDist);
      if (extendPastEnd > 0) {
        _tmpVecB.addScaledVector(_tmpVecC, extendPastEnd);
      }

      const spanLen = _tmpVecA.distanceTo(_tmpVecB);
      const capsuleBodyLen = Math.max(0.05, spanLen - worldRadius * 1.15);
      const limbGeo = new THREE.CapsuleGeometry(
        worldRadius * invScale,
        capsuleBodyLen * invScale,
        4,
        8
      );
      const limbMesh = registerHitbox(startBone, limbGeo, name, 'body', 0x22d3ee);

      // Midpoint in startBone local space
      _tmpVecA.lerp(_tmpVecB, 0.5);
      startBone.worldToLocal(_tmpVecA);
      limbMesh.position.copy(_tmpVecA);

      // Align capsule +Y along bone segment direction in startBone local space
      startBone.getWorldQuaternion(_tmpQuatB).invert();
      _tmpVecC.applyQuaternion(_tmpQuatB).normalize();
      limbMesh.quaternion.setFromUnitVectors(_unitY, _tmpVecC);
      return limbMesh;
    };

    // Left & Right Arms (~0.075m radius; +0.07m wrist extension to cover hands)
    addLimbSegment(leftArm, leftForeArm, 'LeftUpperArmHitbox', 0.075, 0);
    addLimbSegment(leftForeArm, leftHand, 'LeftForeArmHitbox', 0.068, 0.07);
    addLimbSegment(rightArm, rightForeArm, 'RightUpperArmHitbox', 0.075, 0);
    addLimbSegment(rightForeArm, rightHand, 'RightForeArmHitbox', 0.068, 0.07);

    // Left & Right Legs (~0.095m thigh, ~0.082m shin; +0.04m ankle/foot extension)
    addLimbSegment(leftUpLeg, leftLeg, 'LeftThighHitbox', 0.095, 0);
    addLimbSegment(leftLeg, leftFoot, 'LeftShinHitbox', 0.082, 0.04);
    addLimbSegment(rightUpLeg, rightLeg, 'RightThighHitbox', 0.095, 0);
    addLimbSegment(rightLeg, rightFoot, 'RightShinHitbox', 0.082, 0.04);
  }

  /**
   * Toggles visible wireframe debug display on headHitbox and bodyHitbox.
   */
  setHitboxesVisible(visible) {
    this._hitboxesWireframeVisible = !!visible;
    for (const hb of this.hitboxes) {
      if (hb && hb.material) {
        hb.material.visible = this._hitboxesWireframeVisible;
      }
    }
  }

  /**
   * Returns active enabled hitbox meshes for fast hitscan raycasting.
   */
  getActiveHitboxes() {
    if (!this.isActive || !this.isLoaded || this.isDead) return [];
    const active = [];
    for (const hb of this.hitboxes) {
      if (hb && hb.visible && hb.userData?.enabled) {
        active.push(hb);
      }
    }
    return active;
  }

  /**
   * Returns true while the zombie occupies solid cylinder collision against the player.
   */
  isSolidForPlayer() {
    return this.isActive && this.isLoaded && !this.isDead;
  }

  /**
   * Returns total byte size of all configured assets for weighted boot progress reporting.
   */
  getTotalAssetBytes() {
    return this.assets.reduce((acc, a) => acc + (a.bytes || 0), 0);
  }

  /**
   * Returns all unique PBR textures so GPU warmup can pre-upload them before gameplay starts.
   */
  getPreloadTextures() {
    return this._textures;
  }

  /**
   * Temporarily swaps all skinned meshes to their transparent fade materials (or restores opaque).
   * Pre-compiled during GPU warmUpGPU so runtime death fade-out triggers zero shader hitches.
   */
  setFadeMode(enabled, opacity = 1.0) {
    const useFade = !!enabled;
    for (const binding of this._meshBindings) {
      if (!binding || !binding.mesh) continue;
      if (useFade && binding.fadeMat) {
        binding.fadeMat.opacity = opacity;
        binding.mesh.material = binding.fadeMat;
      } else if (binding.baseMat) {
        binding.mesh.material = binding.baseMat;
      }
    }
    for (const decal of this._attachedWoundDecals) {
      if (decal && decal.material) {
        decal.material.opacity = 0.96 * opacity;
      }
    }
  }

  _getSound(overrideSound = null) {
    return overrideSound || this.sound || (typeof window !== 'undefined' ? window.sound : null);
  }

  /**
   * Applies a USP/weapon bullet hit to either 'head' (1-hit kill) or 'body' (3-hit kill),
   * spawning 3D dark-red blood droplets inward at the struck bone/mesh and floor/wall splatter,
   * and interrupting with hurt/dead real vocal stems + flesh thud.
   */
  applyBulletHit({
    part = 'body',
    hitBone = null,
    hitPoint,
    hitNormal,
    rayDirection,
    decalManager = null,
    sound = null,
    distance = 5,
  }) {
    if (this.isDead || !this.isActive || !this.isLoaded) {
      return { killed: false, ignored: true };
    }

    const activeSound = this._getSound(sound);
    const isHeadshot = part === 'head';
    if (decalManager && hitPoint) {
      this._decalManager = decalManager;
      const refBone = hitBone || (isHeadshot ? this._headBone : (this._spine2Bone || this._spineBone)) || this.model;
      if (refBone) {
        // Pull impact slightly inward toward struck bone core so droplets burst out of flesh, never air
        refBone.getWorldPosition(_tmpVecA);
        _tmpVecB.copy(_tmpVecA).lerp(hitPoint, 0.55);
      } else {
        _tmpVecB.copy(hitPoint);
      }
      decalManager.spawnBloodBurst(_tmpVecB, rayDirection, isHeadshot);
      decalManager.projectBloodSplatter(_tmpVecB, rayDirection, isHeadshot);
    }

    if (activeSound && typeof activeSound.playZombieBodyHit === 'function') {
      activeSound.playZombieBodyHit(isHeadshot, distance);
    }

    if (isHeadshot) {
      this.hp = 0;
      this.die({ isHeadshot: true, sound: activeSound, decalManager, distance });
      return { killed: true, headshot: true };
    }

    this.hp = Math.max(0, this.hp - 1);
    if (this.hp <= 0) {
      this.die({ isHeadshot: false, sound: activeSound, decalManager, distance });
      return { killed: true, headshot: false };
    }

    if (activeSound && typeof activeSound.playZombieVocal === 'function') {
      activeSound.playZombieVocal(this, 'hurt');
    }

    // Body hit 1 or 2: brief 0.12s upper-body hit flinch & immediate chase aggro
    this._flinchTimer = 0.12;
    this.tookDamageAggro = true;
    return { killed: false, headshot: false, hpRemaining: this.hp };
  }

  /**
   * Transitions zombie cleanly into death state: disables hitboxes & collision immediately,
   * plays Death clip + real dead vocal + body collapse thud, holds corpse 2.0s, then fades & sinks over 1.5s.
   */
  die({ isHeadshot = false, sound = null, decalManager = null, distance = 5 } = {}) {
    if (this.isDead) return;
    if (decalManager) this._decalManager = decalManager;

    const activeSound = this._getSound(sound);
    this.isDead = true;
    this.hp = 0;
    this._flinchTimer = 0;
    this._deathPhase = 'PLAYING';
    this._deathTimer = 0;
    this._deathBaseY = this.root.position.y;
    this._deathClipDuration = this.clips.Death ? Math.max(0.8, this.clips.Death.duration) : 2.0;

    for (const hb of this.hitboxes) {
      if (hb) {
        hb.visible = false;
        if (hb.userData) hb.userData.enabled = false;
      }
    }

    if (activeSound && typeof activeSound.playZombieVocal === 'function') {
      activeSound.playZombieVocal(this, 'dead');
    }
    if (activeSound && typeof activeSound.playZombieDeath === 'function') {
      activeSound.playZombieDeath(isHeadshot, distance);
    }

    this.playAnimation('Death', 0.15);
  }

  /**
   * Releases all blood wound decals attached to bones back to DecalManager.
   */
  clearWoundDecals() {
    if (this._decalManager && typeof this._decalManager.releaseWoundDecal === 'function') {
      for (const decal of this._attachedWoundDecals) {
        this._decalManager.releaseWoundDecal(decal);
      }
    } else {
      for (const decal of this._attachedWoundDecals) {
        if (decal) {
          decal.visible = false;
          if (decal.parent) decal.parent.remove(decal);
        }
      }
    }
    this._attachedWoundDecals.length = 0;
  }

  /**
   * Returns current desired Walk ground speed (m/s) computed from planted stance-foot motion
   * (or calibrated fallback speed when foot-lock pinning is disabled).
   */
  getDesiredWalkSpeed() {
    if (!WALK_CALIBRATION.footLockPinning) {
      return 0.46 * WALK_CALIBRATION.walkTimeScale * WALK_CALIBRATION.pinMultiplier;
    }
    return this._smoothedWalkSpeed;
  }

  /**
   * Keeps Walk animation timeScale steady at WALK_CALIBRATION.walkTimeScale (default 1.18)
   * during unobstructed movement, only scaling down if walls/desks block >15% of desired distance.
   */
  syncWalkObstacleBlocking(movedFraction = 1.0) {
    if (!this.isLoaded || this.currentState !== 'Walk' || !this.actions.Walk) return;
    const baseTs = WALK_CALIBRATION.walkTimeScale;
    const ts = movedFraction < 0.85
      ? baseTs * THREE.MathUtils.clamp(movedFraction / 0.85, 0.30, 1.0)
      : baseTs;
    this.actions.Walk.setEffectiveTimeScale(ts);
  }

  /**
   * Syncs Run playback speed to actual ground travel velocity so running feet stay grounded.
   */
  syncRunTimeScale(actualMovedSpeed = 0) {
    if (!this.isLoaded || this.currentState !== 'Run' || !this.actions.Run) return;
    const ts = THREE.MathUtils.clamp(actualMovedSpeed / 2.95, 0.85, 1.25);
    this.actions.Run.setEffectiveTimeScale(ts);
  }

  /**
   * Applies updated WALK_CALIBRATION parameters immediately (e.g., from F9 ZombieTuner sliders).
   */
  applyWalkCalibration() {
    if (this.actions.Walk) {
      this.actions.Walk.setEffectiveTimeScale(WALK_CALIBRATION.walkTimeScale);
    }
    if (!WALK_CALIBRATION.footLockPinning) {
      this._smoothedWalkSpeed = 0.46 * WALK_CALIBRATION.walkTimeScale * WALK_CALIBRATION.pinMultiplier;
    }
  }

  /**
   * Smoothly transitions to the named animation clip ('Idle', 'Walk', 'Run', 'Attack', 'Death').
   */
  playAnimation(stateName, fadeDuration = 0.25) {
    if (!this.isLoaded) return;
    const nextAction = this.actions[stateName];
    if (!nextAction) return;

    const prevAction = this.actions[this.currentState];
    if (prevAction === nextAction && stateName !== 'Death') return;

    const baseTimeScale =
      stateName === 'Walk' ? WALK_CALIBRATION.walkTimeScale :
      stateName === 'Run' ? THREE.MathUtils.clamp(3.10 / 2.95, 0.85, 1.25) : 1.0;

    if (stateName === 'Walk') {
      this._footPinInitialized = false;
      this._smoothedWalkSpeed = 0.46 * WALK_CALIBRATION.walkTimeScale * WALK_CALIBRATION.pinMultiplier;
    }

    nextAction.enabled = true;
    nextAction.reset();
    nextAction.setEffectiveTimeScale(baseTimeScale);
    nextAction.setEffectiveWeight(1);
    nextAction.play();

    if (prevAction && prevAction !== nextAction && fadeDuration > 0) {
      prevAction.crossFadeTo(nextAction, fadeDuration, false);
    } else if (prevAction && prevAction !== nextAction) {
      prevAction.stop();
    }

    this.currentState = stateName;
  }

  /**
   * Advances manually through Idle -> Walk -> Run -> Attack -> Death -> Idle.
   */
  cycleAnimation() {
    if (!this.isLoaded) return;
    const currentIdx = this.states.indexOf(this.currentState);
    const nextState = this.states[(currentIdx + 1) % this.states.length];
    return this.playTestAnimation(nextState);
  }

  /**
   * Jumps directly to a named animation state for the F9 Zombie Test Tuner,
   * reviving death/fade/hitbox state cleanly when switching away from Death
   * and triggering the corresponding real .wav vocal category.
   */
  playTestAnimation(stateName, sound = null) {
    if (!this.isLoaded) return null;
    const activeSound = this._getSound(sound);

    if (stateName === 'Death') {
      const wasDead = this.isDead;
      this.isDead = false;
      this._deathPhase = 'NONE';
      this.setActive(true);
      this.die({ isHeadshot: false, sound: activeSound });
      if (wasDead) {
        this.playAnimation('Death', 0.20);
      }
      return stateName;
    }

    const wasDead = this.isDead;
    this.isDead = false;
    this.hp = this.maxHp;
    this._deathPhase = 'NONE';
    this._deathTimer = 0;
    this.setFadeMode(false, 1.0);
    this.root.position.y = this.spawnPosition.y;
    for (const hb of this.hitboxes) {
      if (hb) {
        hb.visible = true;
        if (hb.userData) hb.userData.enabled = true;
      }
    }
    this.setActive(true);

    if (wasDead && activeSound && typeof activeSound.stopZombieVocal === 'function') {
      activeSound.stopZombieVocal(this, 0.025);
    }

    this.playAnimation(stateName, 0.25);

    const isMan = this.vocalPitchBase < 0.9;
    if (stateName === 'Run') {
      this._chaseVocalTimer = 2.8 + Math.random() * 1.8;
      if (activeSound && typeof activeSound.playZombieVocal === 'function') {
        activeSound.playZombieVocal(this, 'chase');
      }
    } else if (stateName === 'Attack') {
      this._prevTestAttackNorm = 0;
      if (activeSound && typeof activeSound.playZombieVocal === 'function') {
        activeSound.playZombieVocal(this, 'attack');
      }
    } else if (stateName === 'Walk') {
      this._walkVocalTimer = isMan ? 1.4 : 0.12;
    } else if (stateName === 'Idle') {
      this._idleVocalTimer = isMan ? 1.6 : 0.18;
    }

    return stateName;
  }

  reset() {
    this.hp = this.maxHp;
    this.isDead = false;
    this.tookDamageAggro = false;
    this.hasExitedVestibule = this.spawnPosition.x > -9.2;
    this._flinchTimer = 0;
    this._deathPhase = 'NONE';
    this._deathTimer = 0;
    this._footPinInitialized = false;
    this._prevTestAttackNorm = 0;
    this._smoothedWalkSpeed = 0.46 * WALK_CALIBRATION.walkTimeScale * WALK_CALIBRATION.pinMultiplier;
    const activeSound = this._getSound();
    if (activeSound && typeof activeSound.stopZombieVocal === 'function') {
      activeSound.stopZombieVocal(this, 0.015);
    }
    this.clearWoundDecals();
    this.setFadeMode(false, 1.0);

    for (const hb of this.hitboxes) {
      if (hb) {
        hb.visible = true;
        if (hb.userData) hb.userData.enabled = true;
      }
    }

    if (!this.isLoaded) return;
    this.root.position.copy(this.spawnPosition);
    this.root.lookAt(this.lookAtPosition);
    this.playAnimation('Idle', 0);
    if (this.mixer) this.mixer.update(0);
  }

  setActive(active) {
    this.isActive = !!active;
    if (this.root) {
      this.root.visible = this.isActive;
    }
    if (!this.isActive) {
      const activeSound = this._getSound();
      if (activeSound && typeof activeSound.stopZombieVocal === 'function') {
        activeSound.stopZombieVocal(this, 0.02);
      }
    }
  }

  update(delta) {
    if (!this.isActive || !this.isLoaded || !this.mixer) return;
    this.mixer.update(delta);

    // Measure stance-foot backward displacement after mixer.update to drive zero-slide Walk speed
    if (this.currentState === 'Walk' && !this.isDead && this.actions.Walk) {
      const walkAction = this.actions.Walk;
      const walkWeight = walkAction.getEffectiveWeight();
      const activeTs = walkAction.getEffectiveTimeScale();
      const fallbackSpeed = 0.46 * activeTs * WALK_CALIBRATION.pinMultiplier;

      if (
        WALK_CALIBRATION.footLockPinning &&
        this._leftFootPinBone &&
        this._rightFootPinBone &&
        delta > 1e-4
      ) {
        this.root.updateMatrixWorld(true);
        this._leftFootPinBone.getWorldPosition(_tmpVecA);
        this.root.worldToLocal(_tmpVecA);
        const leftY = _tmpVecA.y;
        const leftZ = _tmpVecA.z;

        this._rightFootPinBone.getWorldPosition(_tmpVecB);
        this.root.worldToLocal(_tmpVecB);
        const rightY = _tmpVecB.y;
        const rightZ = _tmpVecB.z;

        if (!this._footPinInitialized || walkWeight < 0.85) {
          this._footPinPrevLeftZ = leftZ;
          this._footPinPrevRightZ = rightZ;
          this._footPinInitialized = true;
          this._smoothedWalkSpeed += (fallbackSpeed - this._smoothedWalkSpeed) * 0.35;
        } else {
          // Smooth stance-foot blend using lowest floor elevation
          const minY = Math.min(leftY, rightY);
          const rawWL = Math.exp(-(leftY - minY) / 0.035);
          const rawWR = Math.exp(-(rightY - minY) / 0.035);
          const invSum = 1.0 / (rawWL + rawWR);
          const wL = rawWL * invSum;
          const wR = rawWR * invSum;

          const backL = this._footPinPrevLeftZ - leftZ;
          const backR = this._footPinPrevRightZ - rightZ;
          const plantedBackDelta = Math.max(0, wL * backL + wR * backR);

          this._footPinPrevLeftZ = leftZ;
          this._footPinPrevRightZ = rightZ;

          const rawSpeed = (plantedBackDelta / delta) * WALK_CALIBRATION.pinMultiplier;
          const targetSpeed = THREE.MathUtils.clamp(rawSpeed, 0.12, 0.95);
          this._smoothedWalkSpeed += (targetSpeed - this._smoothedWalkSpeed) * 0.35;
        }
      } else {
        this._smoothedWalkSpeed = fallbackSpeed;
      }
    } else {
      this._footPinInitialized = false;
    }

    // Brief 0.12s upper-body hit flinch layered cleanly after AnimationMixer
    if (this._flinchTimer > 0 && !this.isDead) {
      this._flinchTimer = Math.max(0, this._flinchTimer - delta);
      const flinchTarget = this._spine2Bone || this._spineBone;
      if (flinchTarget) {
        const k = Math.sin((this._flinchTimer / 0.12) * Math.PI);
        flinchTarget.rotation.x -= k * 0.26;
      }
    }

    // Autonomous state-driven vocal scheduler for F9 test showcase zombies
    if (!this.isWaveZombie && !this.isDead) {
      const activeSound = this._getSound();
      if (activeSound && typeof activeSound.playZombieVocal === 'function') {
        if (this.currentState === 'Walk') {
          this._walkVocalTimer -= delta;
          if (this._walkVocalTimer <= 0) {
            activeSound.playZombieVocal(this, 'walk');
            this._walkVocalTimer = 3.2 + Math.random() * 2.6;
          }
        } else if (this.currentState === 'Idle') {
          this._idleVocalTimer -= delta;
          if (this._idleVocalTimer <= 0) {
            activeSound.playZombieVocal(this, 'idle');
            this._idleVocalTimer = 3.0 + Math.random() * 2.2;
          }
        } else if (this.currentState === 'Run') {
          if (!this.vocalChannel?.isPlaying) {
            this._chaseVocalTimer -= delta;
            if (this._chaseVocalTimer <= 0) {
              activeSound.playZombieVocal(this, 'chase');
              this._chaseVocalTimer = 2.8 + Math.random() * 1.8;
            }
          }
        } else if (this.currentState === 'Attack') {
          const attackAction = this.actions.Attack;
          const attackClip = this.clips.Attack;
          const clipDur = attackClip ? Math.max(0.4, attackClip.duration) : 1.4;
          const normTime = attackAction ? (attackAction.time % clipDur) / clipDur : 0.5;
          if (normTime < this._prevTestAttackNorm) {
            activeSound.playZombieVocal(this, 'attack');
          }
          this._prevTestAttackNorm = normTime;
        }
      }
    }

    // Corpse hold (2.0s) -> fade opacity 1->0 & sink -0.18m over 1.5s -> vanish
    if (this.isDead && this._deathPhase !== 'DONE') {
      this._deathTimer += delta;
      if (this._deathPhase === 'PLAYING') {
        if (this._deathTimer >= this._deathClipDuration) {
          this._deathPhase = 'HOLDING';
          this._deathTimer = 0;
        }
      } else if (this._deathPhase === 'HOLDING') {
        if (this._deathTimer >= 2.0) {
          this._deathPhase = 'FADING';
          this._deathTimer = 0;
          this.setFadeMode(true, 1.0);
        }
      } else if (this._deathPhase === 'FADING') {
        const p = Math.min(1.0, this._deathTimer / 1.5);
        const opacity = 1.0 - p;
        this.setFadeMode(true, opacity);
        this.root.position.y = this._deathBaseY - 0.18 * p;
        if (p >= 1.0) {
          this._deathPhase = 'DONE';
          this.setActive(false);
          this.clearWoundDecals();
          this.setFadeMode(false, 1.0);
        }
      }
    }
  }

  dispose() {
    this.clearWoundDecals();
    for (const hb of this.hitboxes) {
      if (hb) {
        if (hb.geometry) hb.geometry.dispose();
        if (hb.material) hb.material.dispose();
        if (hb.parent) hb.parent.remove(hb);
      }
    }
    this.hitboxes.length = 0;

    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
      this.mixer = null;
    }
    if (this.model) {
      disposeTemporaryHierarchy(this.model, this.isClone ? new Set(this._textures) : null);
      this.model = null;
    }
    this.actions = {};
    if (!this.isClone) {
      this.clips = {};
      for (const tex of this._textures) {
        if (tex && typeof tex.dispose === 'function') tex.dispose();
      }
      this._textures.length = 0;
    }
    for (const fm of this._fadeMaterials) {
      if (fm && typeof fm.dispose === 'function') fm.dispose();
    }
    this._fadeMaterials.length = 0;
    this._materials.length = 0;
    this._meshBindings.length = 0;
    if (this.root.parent) {
      this.root.parent.remove(this.root);
    }
  }
}
