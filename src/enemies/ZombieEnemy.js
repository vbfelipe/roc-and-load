import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

      // Skip binding raw RGBA specularGlossinessTexture directly onto roughnessMap/metalnessMap
      // because glossiness lives in alpha rather than glTF's G=roughness / B=metalness channels.
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
 * When `preservedTextures` is provided, textures in that set are kept alive.
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

  // 1. Direct normalized mesh name or material name match
  for (const rec of glbRecords) {
    if (fbxMeshKey && rec.normMeshName === fbxMeshKey) return rec.material;
    if (fbxMeshKey && rec.normMatName === fbxMeshKey) return rec.material;
    if (fbxMatKey && rec.normMeshName === fbxMatKey) return rec.material;
    if (fbxMatKey && fbxMatKey !== '__default' && rec.normMatName === fbxMatKey) return rec.material;
  }

  // 2. Tightest UV-atlas containment match (handles merged-material GLBs like Body+Eyes vs Tops+Bottoms)
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

  // 3. Semantic part hint fallback (if a GLB provides Body/Outfit split without UVs)
  if (glbRecords.length >= 2 && (fbxMeshKey.includes('bottom') || fbxMeshKey.includes('top'))) {
    return glbRecords[1].material;
  }

  // 4. Deterministic index fallback
  return glbRecords[meshIndex % glbRecords.length].material;
}

/**
 * Zombie Woman NPC controller managing FBX skeletal assembly, GLB PBR material transfer,
 * in-place root motion locking, and smooth cross-faded AnimationMixer playback.
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

    this._onKeyDown = (e) => this._handleKeyDown(e);
    window.addEventListener('keydown', this._onKeyDown);
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

    // 1. Collect PBR material records from zombie_woman.glb
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

    // 2. Scale once at load time to 2.00m un-hunched base height (~1.75m hunched) & align feet to Y = 0.00m.
    //    Never call Box3.setFromObject() on a SkinnedMesh after initialization or inside update(delta).
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
    });

    console.info(
      `[${this.logTag}] ${this.idleAssetLabel} loaded: ${meshIndex} SkinnedMeshes, ${totalVertices} vertices, ${totalTriangles} triangles`
    );

    // Dispose temporary GLB geometries & uncloned source materials without freeing transferred textures
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
    if (this.scene) {
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

    // Start in Idle and evaluate initial bone transforms
    if (this.actions.Idle) {
      this.actions.Idle.play();
      this.currentState = 'Idle';
      this.mixer.update(0);
    }
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
   * Smoothly transitions to the named animation clip ('Idle', 'Walk', 'Run', 'Attack', 'Death').
   */
  playAnimation(stateName, fadeDuration = 0.25) {
    if (!this.isLoaded) return;
    const nextAction = this.actions[stateName];
    if (!nextAction) return;

    const prevAction = this.actions[this.currentState];
    if (prevAction === nextAction && stateName !== 'Death') return;

    nextAction.enabled = true;
    nextAction.reset();
    nextAction.setEffectiveTimeScale(1);
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
    this.playAnimation(nextState, 0.25);
    console.info(`[${this.logTag}] Animation -> ${nextState}`);
    return nextState;
  }

  reset() {
    if (!this.isLoaded) return;
    this.root.position.copy(this.spawnPosition);
    this.root.lookAt(this.lookAtPosition);
    this.playAnimation('Idle', 0);
    if (this.mixer) this.mixer.update(0);
  }

  _handleKeyDown(e) {
    if (e.repeat) return;
    if (e.code !== 'KeyZ' && e.key !== 'z' && e.key !== 'Z') return;

    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (typeof window !== 'undefined' && typeof window.getGameState === 'function') {
      if (window.getGameState() !== 'PLAYING') return;
    }

    this.cycleAnimation();
  }

  setActive(active) {
    this.isActive = !!active;
    if (this.root) {
      this.root.visible = this.isActive;
    }
  }

  update(delta) {
    if (!this.isActive || !this.isLoaded || !this.mixer) return;
    this.mixer.update(delta);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
      this.mixer = null;
    }
    if (this.model) {
      disposeTemporaryHierarchy(this.model);
      this.model = null;
    }
    this.actions = {};
    this.clips = {};
    for (const tex of this._textures) {
      if (tex && typeof tex.dispose === 'function') tex.dispose();
    }
    this._textures.length = 0;
    this._materials.length = 0;
    if (this.root.parent) {
      this.root.parent.remove(this.root);
    }
  }
}
