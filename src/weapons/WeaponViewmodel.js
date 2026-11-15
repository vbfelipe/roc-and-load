import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Spring3D, Spring1D } from '../player/Spring.js';

// Pre-allocated scratch vector for zero-GC calculations
const WEAPON_TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
const MAX_WEAPON_TEXTURE_SIZE = 1024;

function downscaleWeaponTextureIfNeeded(tex, maxSize = MAX_WEAPON_TEXTURE_SIZE) {
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

function downscaleModelTextures(root, maxSize = MAX_WEAPON_TEXTURE_SIZE) {
  if (!root) return;
  const seen = new Set();
  root.traverse((child) => {
    if (!child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const slot of WEAPON_TEXTURE_SLOTS) {
        const tex = mat[slot];
        if (tex && tex.isTexture && !seen.has(tex)) {
          seen.add(tex);
          downscaleWeaponTextureIfNeeded(tex, maxSize);
        }
      }
    }
  });
}
const _scratchVec = new THREE.Vector3();

// Baseline 12-gauge left support hand/arm rig pose and heavy-weapon overrides (single left arm only).
const DEFAULT_LEFT_SUPPORT_POSE = {
  pos: [-0.088, -0.134, 0.194],
  rot: [2.88, 1.14, 2.1],
  scale: 0.92,
  wristPitch: -0.08,
  wristRoll: -0.1,
  elbowBend: -0.22,
  armPitch: 0.45,
};

const MP5_LEFT_HAND_POSE = {
  ...DEFAULT_LEFT_SUPPORT_POSE,
  pos: [-0.094, -0.128, 0.264],
  rot: [2.92, 1.14, 2.1],
  scale: 0.91,
  wristPitch: 0.04,
  wristRoll: 0.04,
};

const AKMS_LEFT_HAND_POSE = {
  ...DEFAULT_LEFT_SUPPORT_POSE,
  pos: [-0.072, -0.15, 0.22],
  rot: [3.06, 1.12, 2],
  scale: 0.92,
  wristPitch: -0.06,
  wristRoll: 0.02,
};

// Cached singleton procedural flame starburst texture
let _cachedFlashTexture = null;

/**
 * Procedural flame starburst canvas texture (256x256) for realistic GPU additive muzzle flash.
 */
function createMuzzleFlashTexture() {
  if (_cachedFlashTexture) return _cachedFlashTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const cx = 128;
  const cy = 128;

  ctx.clearRect(0, 0, 256, 256);

  // 1. Soft radial flame glow
  const baseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 96);
  baseGrad.addColorStop(0.0, 'rgba(255, 255, 230, 1.0)');
  baseGrad.addColorStop(0.20, 'rgba(255, 205, 75, 0.95)');
  baseGrad.addColorStop(0.48, 'rgba(255, 110, 15, 0.85)');
  baseGrad.addColorStop(0.72, 'rgba(210, 45, 0, 0.35)');
  baseGrad.addColorStop(0.85, 'rgba(120, 15, 0, 0.06)');
  baseGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = baseGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 96, 0, Math.PI * 2);
  ctx.fill();

  // 2. 8 Jagged flame spikes radiating outward
  const numSpikes = 8;
  for (let i = 0; i < numSpikes; i++) {
    const angle = (i / numSpikes) * Math.PI * 2 + (i % 2 === 0 ? 0.06 : -0.06);
    const spikeLength = 68 + (i % 3) * 11;
    const baseWidth = 0.22;

    const tipX = cx + Math.cos(angle) * spikeLength;
    const tipY = cy + Math.sin(angle) * spikeLength;
    const p1X = cx + Math.cos(angle - baseWidth) * 18;
    const p1Y = cy + Math.sin(angle - baseWidth) * 18;
    const p2X = cx + Math.cos(angle + baseWidth) * 18;
    const p2Y = cy + Math.sin(angle + baseWidth) * 18;

    const spikeGrad = ctx.createLinearGradient(cx, cy, tipX, tipY);
    spikeGrad.addColorStop(0.0, 'rgba(255, 255, 240, 1.0)');
    spikeGrad.addColorStop(0.30, 'rgba(255, 185, 45, 0.90)');
    spikeGrad.addColorStop(0.65, 'rgba(255, 95, 12, 0.75)');
    spikeGrad.addColorStop(0.85, 'rgba(180, 30, 0, 0.25)');
    spikeGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

    ctx.fillStyle = spikeGrad;
    ctx.beginPath();
    ctx.moveTo(p1X, p1Y);
    const midAngle = angle + (i % 2 === 0 ? 0.04 : -0.04);
    const midDist = spikeLength * 0.55;
    ctx.lineTo(cx + Math.cos(midAngle) * midDist, cy + Math.sin(midAngle) * midDist);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(p2X, p2Y);
    ctx.closePath();
    ctx.fill();
  }

  // 3. Incandescent white-hot center core
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
  coreGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  coreGrad.addColorStop(0.45, 'rgba(255, 255, 220, 1.0)');
  coreGrad.addColorStop(0.75, 'rgba(255, 180, 40, 0.55)');
  coreGrad.addColorStop(1.0, 'rgba(255, 110, 15, 0.0)');

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fill();

  _cachedFlashTexture = new THREE.CanvasTexture(canvas);
  _cachedFlashTexture.colorSpace = THREE.SRGBColorSpace;
  _cachedFlashTexture.needsUpdate = true;
  return _cachedFlashTexture;
}

/**
 * Union-Find data structure for connected-components graph clustering.
 */
class UnionFind {
  constructor(size) {
    this.parent = new Int32Array(size);
    for (let i = 0; i < size; i++) this.parent[i] = i;
  }
  find(i) {
    let root = i;
    while (root !== this.parent[root]) root = this.parent[root];
    let curr = i;
    while (curr !== root) {
      const next = this.parent[curr];
      this.parent[curr] = root;
      curr = next;
    }
    return root;
  }
  union(i, j) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) this.parent[rootI] = rootJ;
  }
}

/**
 * Decomposes an indexed Three.js BufferGeometry into topological connected components (islands).
 * Triangles that share vertex indices OR coincident 3D vertex positions (tolerance 1e-4 for UV seams)
 * are grouped together into whole, watertight islands.
 */
function decomposeMeshIslands(geometry) {
  const posAttr = geometry.attributes.position;
  const index = geometry.index;
  const triCount = index ? index.count / 3 : posAttr.count / 3;
  const uf = new UnionFind(triCount);

  // Quantize position to 0.0001 precision to connect coincident vertices across UV seams
  const scale = 10000;
  const posKeyToTris = new Map();

  for (let t = 0; t < triCount; t++) {
    for (let v = 0; v < 3; v++) {
      const idx = index ? index.getX(t * 3 + v) : t * 3 + v;
      const px = posAttr.getX(idx);
      const py = posAttr.getY(idx);
      const pz = posAttr.getZ(idx);

      const qx = Math.round(px * scale);
      const qy = Math.round(py * scale);
      const qz = Math.round(pz * scale);
      const key = `${qx}_${qy}_${qz}`;

      if (!posKeyToTris.has(key)) {
        posKeyToTris.set(key, [t]);
      } else {
        const list = posKeyToTris.get(key);
        for (const otherT of list) {
          uf.union(t, otherT);
        }
        list.push(t);
      }
    }
  }

  const islandMap = new Map();
  for (let t = 0; t < triCount; t++) {
    const root = uf.find(t);
    if (!islandMap.has(root)) islandMap.set(root, []);
    islandMap.get(root).push(t);
  }

  const islands = [];
  const v = new THREE.Vector3();
  for (const triList of islandMap.values()) {
    const box = new THREE.Box3();
    for (const t of triList) {
      for (let j = 0; j < 3; j++) {
        const idx = index ? index.getX(t * 3 + j) : t * 3 + j;
        v.set(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
        box.expandByPoint(v);
      }
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    islands.push({ triList, box, center, size });
  }

  return islands;
}

/**
 * Builds a new sub-BufferGeometry from a list of triangle indices, preserving 100% of the
 * original geometry's position, normal, uv, and tangent vertex attributes.
 * Never recomputes or alters normals/tangents.
 */
function buildSubGeometryFromTriangles(origGeo, triangleIndices) {
  const posAttr = origGeo.attributes.position;
  const normAttr = origGeo.attributes.normal;
  const uvAttr = origGeo.attributes.uv;
  const tangAttr = origGeo.attributes.tangent;
  const origIndex = origGeo.index;

  const newPositions = [];
  const newNormals = [];
  const newUvs = [];
  const newTangents = [];
  const newIndices = [];
  const oldToNew = new Map();

  for (const tri of triangleIndices) {
    for (let j = 0; j < 3; j++) {
      const oldIdx = origIndex ? origIndex.getX(tri * 3 + j) : tri * 3 + j;
      let newIdx;
      if (oldToNew.has(oldIdx)) {
        newIdx = oldToNew.get(oldIdx);
      } else {
        newIdx = newPositions.length / 3;
        oldToNew.set(oldIdx, newIdx);

        newPositions.push(posAttr.getX(oldIdx), posAttr.getY(oldIdx), posAttr.getZ(oldIdx));
        if (normAttr) {
          newNormals.push(normAttr.getX(oldIdx), normAttr.getY(oldIdx), normAttr.getZ(oldIdx));
        }
        if (uvAttr) {
          newUvs.push(uvAttr.getX(oldIdx), uvAttr.getY(oldIdx));
        }
        if (tangAttr) {
          newTangents.push(
            tangAttr.getX(oldIdx),
            tangAttr.getY(oldIdx),
            tangAttr.getZ(oldIdx),
            tangAttr.getW(oldIdx)
          );
        }
      }
      newIndices.push(newIdx);
    }
  }

  const subGeo = new THREE.BufferGeometry();
  subGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  if (normAttr) {
    subGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
  }
  if (uvAttr) {
    subGeo.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
  }
  if (tangAttr) {
    subGeo.setAttribute('tangent', new THREE.Float32BufferAttribute(newTangents, 4));
  }
  const IndexConstructor = newPositions.length / 3 > 65535 ? Uint32Array : Uint16Array;
  subGeo.setIndex(new THREE.BufferAttribute(new IndexConstructor(newIndices), 1));
  subGeo.computeBoundingBox();
  subGeo.computeBoundingSphere();
  return subGeo;
}

/**
 * 100% 3D GLTF Asset Pipeline Viewmodel for Slot 1 (H&K USP 9mm Pistol),
 * Slot 2 (.50 AE Desert Eagle), Slot 3 (Remington 870 12-Gauge Shotgun),
 * Slot 4 (H&K MP5 Submachine Gun), and Rigged First-Person Hands.
 */
export class WeaponViewmodel {
  constructor(camera, soundManager, options = {}) {
    this.camera = camera;
    this.sound = soundManager;
    this._autoLoad = options.autoLoad !== undefined ? !!options.autoLoad : true;

    this.root = new THREE.Group();
    this.root.name = 'WeaponViewmodel';
    this.camera.add(this.root);
    if (typeof window !== 'undefined') window.__rocViewmodel = this;

    // Dedicated viewmodel IBL (RoomEnvironment PMREM, injected by Engine via setEnvironmentMap).
    // Weapons & hands keep the studio reflections their PBR textures were authored for,
    // while the world uses the dark NightOfficeEnvironment. Zero extra lights = zero per-pixel cost.
    this.viewmodelEnvMap = null;

    // Active weapon type ('hk_usp' = Slot 1 9mm Pistol, 'desert_eagle' = Slot 2 Desert Eagle .50 AE, 'shotgun' = Slot 3 Remington 870, 'hk_mp5' = Slot 4)
    this.currentWeapon = 'hk_usp';
    this.isUnarmed = false;
    this.unarmedIdlePhase = 0;

    // Unarmed relaxed bare-hands transforms (user-tuned baseline)
    this.unarmedHipPosition = new THREE.Vector3(0, -0.022, 0);
    this.unarmedAdsPosition = this.unarmedHipPosition;
    this.unarmedHipRotation = new THREE.Euler(-0.04, 0, 0);
    this.unarmedAdsRotation = this.unarmedHipRotation;

    // ADS interpolation flag
    this.isADS = false;
    this.tunerForceADS = null;
    this.tunerMode = 'HAND RIG';

    // Slot 1 (H&K USP 9mm Pistol) Hip & ADS Transforms
    this.uspHipPosition = new THREE.Vector3(0.1, -0.1, -0.22);
    this.uspAdsPosition = new THREE.Vector3(0, -0.077, -0.16);
    this.uspHipRotation = new THREE.Euler(0.1, 0, 0.1);
    this.uspAdsRotation = new THREE.Euler(0, 0, 0);

    // Slot 2 (.50 AE Desert Eagle) Hip & ADS Transforms
    this.pistolHipPosition = new THREE.Vector3(0.1, -0.1, -0.4);
    this.pistolAdsPosition = new THREE.Vector3(0.000, -0.104, -0.345);
    this.pistolHipRotation = new THREE.Euler(0.1, 0, 0.1);
    this.pistolAdsRotation = new THREE.Euler(-0.017, 0, 0);

    // Slot 3 (Remington 870 12-Gauge Shotgun) Hip & ADS Transforms
    this.shotgunHipPosition = new THREE.Vector3(0.1, -0.13, -0.042);
    this.shotgunAdsPosition = new THREE.Vector3(0, -0.075, -0.09);
    this.shotgunHipRotation = new THREE.Euler(0.1, 0, 0);
    this.shotgunAdsRotation = new THREE.Euler(0, 0, 0);

    // Slot 4 (H&K MP5 9mm Submachine Gun) Hip & ADS Transforms
    this.mp5HipPosition = new THREE.Vector3(0.1, -0.13, -0.13);
    this.mp5AdsPosition = new THREE.Vector3(0, -0.085, -0.08);
    this.mp5HipRotation = new THREE.Euler(0.08, 0, 0.05);
    this.mp5AdsRotation = new THREE.Euler(0, 0, 0);

    // Slot 5 (Colt Peacemaker .45 Revolver - RARE) Hip & ADS Transforms
    this.coltHipPosition = new THREE.Vector3(0.1, -0.1, -0.22);
    this.coltAdsPosition = new THREE.Vector3(0, -0.0793, -0.16);
    this.coltHipRotation = new THREE.Euler(0.03, 0, 0.1);
    this.coltAdsRotation = new THREE.Euler(-0.004, 0, 0);

    // Slot 6 (Glock Auto 30rd Flamengo - RARE) Hip & ADS Transforms
    this.glockHipPosition = new THREE.Vector3(0.1, -0.08, -0.22);
    this.glockAdsPosition = new THREE.Vector3(-0.0014, -0.0596, -0.14);
    this.glockHipRotation = new THREE.Euler(0.1, 0.1, 0.1);
    this.glockAdsRotation = new THREE.Euler(0.0025, 0.0784, 0.0204);

    // Slot 7 (AKMS Gold 7.62 Rifle - RARE) Hip & ADS Transforms
    this.akmsHipPosition = new THREE.Vector3(0.1, -0.13, -0.1);
    this.akmsAdsPosition = new THREE.Vector3(0.008, -0.083, -0.094);
    this.akmsHipRotation = new THREE.Euler(0.1, 0, 0);
    this.akmsAdsRotation = new THREE.Euler(0, 0, 0);

    // Dynamic targets pointing to current active weapon transforms
    this.hipPosition = this.uspHipPosition;
    this.adsPosition = this.uspAdsPosition;
    this.hipRotation = this.uspHipRotation;
    this.adsRotation = this.uspAdsRotation;

    // Second-order harmonic springs for natural weight, inertia and snappy recovery
    this.posSpring = new Spring3D({ stiffness: 220, damping: 20, initial: this.uspHipPosition });
    this.rotSpring = new Spring3D({ stiffness: 210, damping: 19, initial: this.uspHipRotation });

    // Procedural weapon sway and bobbing
    this.bobSpring = new Spring3D({ stiffness: 120, damping: 14 });
    this.bobCycle = 0;

    // Sockets & anchors
    this.uspMuzzleSocket = new THREE.Object3D();
    this.uspMuzzleSocket.name = 'USPMuzzleSocket';
    this.muzzleSocket = new THREE.Object3D();
    this.muzzleSocket.name = 'PistolMuzzleSocket';
    this.shotgunMuzzleSocket = new THREE.Object3D();
    this.shotgunMuzzleSocket.name = 'ShotgunMuzzleSocket';
    this.mp5MuzzleSocket = new THREE.Object3D();
    this.mp5MuzzleSocket.name = 'MP5MuzzleSocket';
    this.coltMuzzleSocket = new THREE.Object3D();
    this.coltMuzzleSocket.name = 'ColtMuzzleSocket';
    this.glockMuzzleSocket = new THREE.Object3D();
    this.glockMuzzleSocket.name = 'GlockMuzzleSocket';
    this.akmsMuzzleSocket = new THREE.Object3D();
    this.akmsMuzzleSocket.name = 'AKMSMuzzleSocket';
    this.muzzleAnchor = this.uspMuzzleSocket;

    this.uspEjectionAnchor = new THREE.Group();
    this.uspEjectionAnchor.name = 'USPEjectionAnchor';
    this.ejectionAnchor = new THREE.Group();
    this.ejectionAnchor.name = 'PistolEjectionAnchor';
    this.shotgunEjectionAnchor = new THREE.Group();
    this.shotgunEjectionAnchor.name = 'ShotgunEjectionAnchor';
    this.mp5EjectionAnchor = new THREE.Group();
    this.mp5EjectionAnchor.name = 'MP5EjectionAnchor';
    this.coltEjectionAnchor = new THREE.Group();
    this.coltEjectionAnchor.name = 'ColtEjectionAnchor';
    this.glockEjectionAnchor = new THREE.Group();
    this.glockEjectionAnchor.name = 'GlockEjectionAnchor';
    this.akmsEjectionAnchor = new THREE.Group();
    this.akmsEjectionAnchor.name = 'AKMSEjectionAnchor';

    this.muzzleWorldPos = new THREE.Vector3();
    this.ejectionWorldPos = new THREE.Vector3();

    // Slide Blowback, Hammer Action, Pump Action & Reload state
    this.uspSlideBlowback = 0;
    this.uspHammerRecoil = 0;
    this.slideBlowback = 0;
    this.hammerRecoil = 0;
    this.hammerRestAngle = 0;
    this.coltHammerRecoil = 0;
    this.coltCylinderSpin = 0;
    this.glockSlideBlowback = 0;
    this.akmsBoltBlowback = 0;
    this.akmsBoltHold = 0;
    this.isSlideLocked = false;
    this.isReloading = false;
    this.isPumping = false;
    this.shotgunPumpOffset = 0;
    this.reloadTilt = { roll: 0, pitch: 0, yaw: 0, y: 0, x: 0, z: 0 };

    // Sub-assemblies & references
    this.uspGroup = null;
    this.uspModelGroup = null;
    this.uspSlideGroup = null;
    this.uspHammerGroup = null;
    this.uspTriggerGroup = null;
    this.uspMagGroup = null;
    this.uspHandGroup = null;
    this.uspHandsClone = null;
    this.uspHandPivot = null;
    this.uspWristBone = null;
    this.uspElbowBone = null;
    this.uspTriggerFinger = null;
    this._trigFingerQuatTmp = new THREE.Quaternion();
    this._trigFingerEulerTmp = new THREE.Euler();

    this.gunGroup = null;
    this.pistolGroup = null;
    this.pistolModelGroup = null;
    this.pistolSlideMesh = null;
    this.deSlideRestZ = 0;
    this.magGroup = null;
    this.deMagMeshes = [];
    this.deMagRestY = [];
    this.hammerGroup = null;
    this.triggerMesh = null;

    this.shotgunGroup = null;
    this.shotgunModelGroup = null;
    this.shotgunPumpGroup = null;
    this.shotgunBoltGroup = null;
    this.shotgunCarrierGroup = null;
    this.shotgunReloadShell = null;
    this.shotgunTriggerMesh = null;

    // MP5 Sub-assemblies & references (single left support arm, matching 12-gauge)
    this.mp5LeftHandGroup = null;
    this.mp5HandsClone = null;
    this.mp5HandPivot = null;
    this.mp5WristBone = null;
    this.mp5ElbowBone = null;
    this.mp5BoltBlowback = 0;
    this.mp5BoltMesh = null;
    this.mp5BoltRestZ = 0;
    this.mp5MagMesh = null;
    this.mp5MagRestY = 0;
    this.mp5MagRestZ = 0;
    this.mp5TriggerMesh = null;
    this.mp5SelectorMesh = null;

    // Colt Peacemaker Sub-assemblies & references
    this.coltGroup = null;
    this.coltModelGroup = null;
    this.coltHandGroup = null;
    this.coltHandsClone = null;
    this.coltHandPivot = null;
    this.coltWristBone = null;
    this.coltElbowBone = null;
    this.coltTriggerFinger = null;
    this.coltCylinderMesh = null;
    this.coltHammerMesh = null;
    this.coltTriggerMesh = null;

    // Glock Flamengo Sub-assemblies & references
    this.glockGroup = null;
    this.glockModelGroup = null;
    this.glockHandGroup = null;
    this.glockHandsClone = null;
    this.glockHandPivot = null;
    this.glockWristBone = null;
    this.glockElbowBone = null;
    this.glockTriggerFinger = null;
    this.glockSlideMesh = null;
    this.glockSlideRestY = 0;
    this.glockSlideRestZ = 0;
    this.glockSlideCycle = 0;
    this.glockSlideCycleDuration = 0.050;
    this.glockSlideMaxStroke = 0.088;
    this._glockShotJustTriggered = false;
    this.glockSelectorMesh = null;
    this.glockSelectorRestY = 0;
    this.glockSelectorRestZ = 0;
    this.glockTriggerMesh = null;
    this.glockTriggerRestZ = 0;
    this.glockMagMesh = null;
    this.glockMagRestY = 0;
    this.glockMagRestZ = 0;
    this.isTriggerHeld = false;

    // AKMS Gold Sub-assemblies & references (single left support arm, matching 12-gauge)
    this.akmsGroup = null;
    this.akmsModelGroup = null;
    this.akmsLeftHandGroup = null;
    this.akmsHandsClone = null;
    this.akmsHandPivot = null;
    this.akmsWristBone = null;
    this.akmsElbowBone = null;
    this.akmsMagMesh = null;
    this.akmsMagRestX = 0;
    this.akmsMagRestY = 0;
    this.akmsMagRestZ = 0;
    this.akmsBoltMesh = null;
    this.akmsBoltRestX = 0;

    this.shotgunPumpMesh = null;
    this.shotgunPumpRodsMesh = null;
    this.shotgunSlideLRodsMesh = null;
    this.shotgunBoltMesh = null;
    this.shotgunPumpRestX = 0;
    this.shotgunPumpRodsRestX = 0;
    this.shotgunSlideLRodsRestX = 0;
    this.shotgunBoltRestX = 0;

    // Hand references
    this.rawHandsScene = null;
    this.pistolHandGroup = null;
    this.pistolHandsClone = null;
    this.pistolHandPivot = null;
    this.pistolWristBone = null;
    this.pistolElbowBone = null;
    this.pistolTriggerFinger = null;

    this.shotgunLeftHandGroup = null;
    this.shotgunHandsClone = null;
    this.shotgunHandPivot = null;
    this.shotgunWristBone = null;
    this.shotgunElbowBone = null;

    // Unarmed bare hands assembly
    this.unarmedGroup = null;
    this.unarmedRightPivot = null;
    this.unarmedLeftPivot = null;
    this.unarmedRightFinger = null;
    this.unarmedLeftFinger = null;

    this.reloadTweens = [];
    this.reloadTimers = [];

    // Muzzle flash rig
    this.muzzleFlashGroup = null;
    this.flashTimer = 0;

    // Tuner state (managed externally by ViewmodelTuner in src/ui/ViewmodelTuner.js)
    this.onTunerSync = null;
    this.tunerMode = 'HAND RIG'; // 'HAND RIG' | 'GUN (HIP)' | 'GUN (ADS)'

    this._buildMaterials();
    this._buildUSPMesh();
    this._buildGunMesh();
    this._buildShotgunMesh();
    this._buildMP5Mesh();
    this._buildColtMesh();
    this._buildGlockMesh();
    this._buildAkmsMesh();
    this._buildUnarmedMesh();
    this._buildMuzzleFlashRig();

    // Load 3D GLTF models asynchronously (deferred when orchestrated by boot pipeline)
    this._loadModelsPromise = null;
    this._isLoaded = false;
    this._filteredHandGeoCache = { R: null, L: null };
    if (this._autoLoad) {
      this.loadAllModels();
    }
  }

  _syncTuner() {
    if (window.isViewmodelTunerOpen && typeof this.onTunerSync === 'function') {
      this.onTunerSync();
    }
  }

  _buildMaterials() {
    this.flameTexture = createMuzzleFlashTexture();
    this.muzzleFlashMaterial = new THREE.MeshBasicMaterial({
      map: this.flameTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      opacity: 1.0,
    });

    this.brassMaterial = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.92,
      roughness: 0.20,
    });

    this.shellHullMaterial = new THREE.MeshStandardMaterial({
      color: 0xc81e1e,
      metalness: 0.08,
      roughness: 0.42,
    });

    this.skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xdca282,
      roughness: 0.65,
      metalness: 0.0,
    });
  }

  _buildUSPMesh() {
    this.uspGroup = new THREE.Group();
    this.uspGroup.name = 'HK_USP';
    this.uspGroup.visible = true;
    this.root.add(this.uspGroup);

    this.uspModelGroup = new THREE.Group();
    this.uspModelGroup.name = 'USPModelContainer';
    this.uspGroup.add(this.uspModelGroup);

    this.uspSlideGroup = new THREE.Group();
    this.uspSlideGroup.name = 'USPSlideGroup';
    this.uspModelGroup.add(this.uspSlideGroup);

    this.uspHammerGroup = new THREE.Group();
    this.uspHammerGroup.name = 'USPHammerGroup';
    this.uspModelGroup.add(this.uspHammerGroup);

    this.uspTriggerGroup = new THREE.Group();
    this.uspTriggerGroup.name = 'USPTriggerGroup';
    this.uspModelGroup.add(this.uspTriggerGroup);

    this.uspMagGroup = new THREE.Group();
    this.uspMagGroup.name = 'USPMagGroup';
    this.uspModelGroup.add(this.uspMagGroup);

    this.uspHandGroup = new THREE.Group();
    this.uspHandGroup.name = 'USPHandContainer';
    this.uspGroup.add(this.uspHandGroup);

    this.uspMuzzleSocket.position.set(0, 0.0594, -0.095);
    this.uspGroup.add(this.uspMuzzleSocket);

    this.uspEjectionAnchor.position.set(0.016, 0.066, -0.002);
    this.uspGroup.add(this.uspEjectionAnchor);
  }

  _buildGunMesh() {
    this.gunGroup = new THREE.Group();
    this.gunGroup.name = 'DesertEagle50';
    this.gunGroup.visible = false;
    this.pistolGroup = this.gunGroup;
    this.root.add(this.gunGroup);

    this.pistolModelGroup = new THREE.Group();
    this.pistolModelGroup.name = 'PistolModelContainer';
    this.gunGroup.add(this.pistolModelGroup);

    this.slideGroup = new THREE.Group();
    this.slideGroup.name = 'PistolSlideGroup';
    this.gunGroup.add(this.slideGroup);

    this.magGroup = new THREE.Group();
    this.magGroup.name = 'PistolMagGroup';
    this.gunGroup.add(this.magGroup);

    this.pistolHandGroup = new THREE.Group();
    this.pistolHandGroup.name = 'PistolHandContainer';
    this.gunGroup.add(this.pistolHandGroup);

    this.muzzleSocket.position.set(0, 0.024, -0.160);
    this.gunGroup.add(this.muzzleSocket);

    this.ejectionAnchor.position.set(0.016, 0.080, 0.138);
    this.gunGroup.add(this.ejectionAnchor);
  }

  _buildShotgunMesh() {
    this.shotgunGroup = new THREE.Group();
    this.shotgunGroup.name = 'Remington870';
    this.shotgunGroup.visible = false;
    this.root.add(this.shotgunGroup);

    this.shotgunModelGroup = new THREE.Group();
    this.shotgunModelGroup.name = 'ShotgunModelContainer';
    this.shotgunGroup.add(this.shotgunModelGroup);

    this.shotgunPumpGroup = new THREE.Group();
    this.shotgunPumpGroup.name = 'ShotgunPumpGroup';
    this.shotgunGroup.add(this.shotgunPumpGroup);

    this.shotgunBoltGroup = new THREE.Group();
    this.shotgunBoltGroup.name = 'ShotgunBoltGroup';
    this.shotgunGroup.add(this.shotgunBoltGroup);

    this.shotgunCarrierGroup = new THREE.Group();
    this.shotgunCarrierGroup.name = 'ShotgunCarrierGroup';
    this.shotgunGroup.add(this.shotgunCarrierGroup);

    this.shotgunLeftHandGroup = new THREE.Group();
    this.shotgunLeftHandGroup.name = 'ShotgunLeftHandContainer';
    this.shotgunPumpGroup.add(this.shotgunLeftHandGroup);

    this.shotgunMuzzleSocket.position.set(0, 0.020, -0.520);
    this.shotgunGroup.add(this.shotgunMuzzleSocket);

    this.shotgunEjectionAnchor.position.set(0.014, 0.040, -0.097);
    this.shotgunGroup.add(this.shotgunEjectionAnchor);

    // Tactical reload shell cylinder (visible when inserting shells into loading gate)
    this.shotgunReloadShell = new THREE.Group();
    this.shotgunReloadShell.name = 'ShotgunReloadShell';
    this.shotgunReloadShell.visible = false;

    const shellHullGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.056, 16);
    shellHullGeo.rotateX(Math.PI / 2);
    const shellHullMesh = new THREE.Mesh(shellHullGeo, this.shellHullMaterial);
    shellHullMesh.frustumCulled = false;
    this.shotgunReloadShell.add(shellHullMesh);

    const brassRimGeo = new THREE.CylinderGeometry(0.0106, 0.0106, 0.018, 16);
    brassRimGeo.rotateX(Math.PI / 2);
    const brassRimMesh = new THREE.Mesh(brassRimGeo, this.brassMaterial);
    brassRimMesh.position.set(0, 0, 0.022);
    brassRimMesh.frustumCulled = false;
    this.shotgunReloadShell.add(brassRimMesh);

    this.shotgunGroup.add(this.shotgunReloadShell);
  }
  _buildMP5Mesh() {
    this.mp5Group = new THREE.Group();
    this.mp5Group.name = 'HK_MP5';
    this.mp5Group.visible = false;
    this.root.add(this.mp5Group);

    this.mp5ModelGroup = new THREE.Group();
    this.mp5ModelGroup.name = 'MP5ModelContainer';
    this.mp5Group.add(this.mp5ModelGroup);

    this.mp5LeftHandGroup = new THREE.Group();
    this.mp5LeftHandGroup.name = 'MP5LeftHandContainer';
    this.mp5Group.add(this.mp5LeftHandGroup);

    this.mp5MuzzleSocket.position.set(0, 0.036, -0.292);
    this.mp5Group.add(this.mp5MuzzleSocket);

    this.mp5EjectionAnchor.position.set(0.017, 0.050, -0.044);
    this.mp5Group.add(this.mp5EjectionAnchor);
  }

  _buildColtMesh() {
    this.coltGroup = new THREE.Group();
    this.coltGroup.name = 'Colt_Peacemaker';
    this.coltGroup.visible = false;
    this.root.add(this.coltGroup);

    this.coltModelGroup = new THREE.Group();
    this.coltModelGroup.name = 'ColtModelContainer';
    this.coltGroup.add(this.coltModelGroup);

    this.coltHandGroup = new THREE.Group();
    this.coltHandGroup.name = 'ColtHandContainer';
    this.coltGroup.add(this.coltHandGroup);

    this.coltMuzzleSocket.position.set(0, 0.064, -0.235);
    this.coltGroup.add(this.coltMuzzleSocket);

    this.coltEjectionAnchor.position.set(0.018, 0.050, -0.012);
    this.coltGroup.add(this.coltEjectionAnchor);
  }

  _buildGlockMesh() {
    this.glockGroup = new THREE.Group();
    this.glockGroup.name = 'Glock_Flamengo';
    this.glockGroup.visible = false;
    this.root.add(this.glockGroup);

    this.glockModelGroup = new THREE.Group();
    this.glockModelGroup.name = 'GlockModelContainer';
    this.glockGroup.add(this.glockModelGroup);

    this.glockHandGroup = new THREE.Group();
    this.glockHandGroup.name = 'GlockHandContainer';
    this.glockGroup.add(this.glockHandGroup);

    this.glockMuzzleSocket.position.set(0.0089, 0.041, -0.089);
    this.glockMuzzleSocket.rotation.set(-0.0025, -0.0784, -0.0204);
    this.glockGroup.add(this.glockMuzzleSocket);

    this.glockEjectionAnchor.position.set(0.021, 0.050, 0.018);
    this.glockGroup.add(this.glockEjectionAnchor);
  }

  _buildAkmsMesh() {
    this.akmsGroup = new THREE.Group();
    this.akmsGroup.name = 'AKMS_Gold';
    this.akmsGroup.visible = false;
    this.root.add(this.akmsGroup);

    this.akmsModelGroup = new THREE.Group();
    this.akmsModelGroup.name = 'AKMSModelContainer';
    this.akmsGroup.add(this.akmsModelGroup);

    this.akmsLeftHandGroup = new THREE.Group();
    this.akmsLeftHandGroup.name = 'AKMSLeftHandContainer';
    this.akmsGroup.add(this.akmsLeftHandGroup);

    this.akmsMuzzleSocket.position.set(0, 0.048, -0.415);
    this.akmsGroup.add(this.akmsMuzzleSocket);

    this.akmsEjectionAnchor.position.set(0.010, 0.060, -0.050);
    this.akmsGroup.add(this.akmsEjectionAnchor);
  }

  // ===========================================================================
  // 3D GLTF ASSET PIPELINE LOADER
  // ===========================================================================

  loadAllModels(onProgress) {
    if (onProgress) {
      this._progressCallbacks = this._progressCallbacks || [];
      this._progressCallbacks.push(onProgress);
    }

    if (this._isLoaded) {
      if (onProgress) onProgress(1.0, 'complete');
      return Promise.resolve();
    }

    if (this._loadModelsPromise) {
      return this._loadModelsPromise;
    }

    const loader = new GLTFLoader();
    const modelDefs = [
      { key: 'hk_usp', url: './models/hk_usp.glb', bytes: 1983076, setup: (gltf) => this._setupUSPModel(gltf) },
      { key: 'desert_eagle', url: './models/desert_eagle.glb', bytes: 4298716, setup: (gltf) => this._setupPistolModel(gltf) },
      { key: 'remington_870', url: './models/remington_870.glb', bytes: 2620892, setup: (gltf) => this._setupShotgunModel(gltf) },
      { key: 'hk_mp5', url: './models/hk_mp5.glb', bytes: 3069496, setup: (gltf) => this._setupMP5Model(gltf) },
      { key: 'colt_peacemaker', url: './models/colt_peacemaker.glb', bytes: 937652, setup: (gltf) => this._setupColtModel(gltf) },
      { key: 'glock_flamengo', url: './models/glock_flamengo.glb', bytes: 828512, setup: (gltf) => this._setupGlockModel(gltf) },
      { key: 'akms_gold', url: './models/akms_gold.glb', bytes: 667536, setup: (gltf) => this._setupAkmsModel(gltf) },
      { key: 'fps_hands', url: './models/fps_hands.glb', bytes: 827564, setup: (gltf) => this._setupHandsModel(gltf) },
    ];

    const weights = modelDefs.map((d) => d.bytes);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const modelFractions = new Float64Array(modelDefs.length);

    const notifyProgress = (key) => {
      let weightedSum = 0;
      for (let i = 0; i < modelDefs.length; i++) {
        weightedSum += modelFractions[i] * weights[i];
      }
      const fraction = totalWeight > 0 ? weightedSum / totalWeight : 0;
      if (this._progressCallbacks) {
        for (const cb of this._progressCallbacks) {
          try { cb(fraction, key); } catch (e) { console.error(e); }
        }
      }
    };

    const loadSingle = (def, index) => {
      return new Promise((resolve) => {
        loader.load(
          def.url,
          (gltf) => {
            try {
              def.setup(gltf);
              downscaleModelTextures(gltf.scene, MAX_WEAPON_TEXTURE_SIZE);
            } catch (err) {
              console.error(`Error configuring model ${def.key}:`, err);
            }
            modelFractions[index] = 1.0;
            notifyProgress(def.key);
            resolve(gltf);
          },
          (xhr) => {
            const total = xhr.lengthComputable && xhr.total > 0 ? xhr.total : def.bytes;
            const dlFrac = Math.min(0.92, (xhr.loaded / total) * 0.92);
            if (dlFrac > modelFractions[index]) {
              modelFractions[index] = dlFrac;
              notifyProgress(def.key);
            }
          },
          (err) => {
            console.error(`Failed to load ${def.url}:`, err);
            modelFractions[index] = 1.0;
            notifyProgress(def.key);
            resolve(null);
          }
        );
      });
    };

    this._loadModelsPromise = Promise.all(modelDefs.map((def, idx) => loadSingle(def, idx))).then(() => {
      this._isLoaded = true;
      this._applyViewmodelEnvironment();
      this.selectWeapon('hk_usp', { silent: true });
      notifyProgress('complete');
    });

    return this._loadModelsPromise;
  }

  /**
   * Assigns the dedicated viewmodel IBL texture (overrides scene.environment for weapons & hands only).
   */
  setEnvironmentMap(envTexture) {
    this.viewmodelEnvMap = envTexture || null;
    this._applyViewmodelEnvironment();
  }

  _applyViewmodelEnvironment() {
    if (!this.viewmodelEnvMap) return;
    this.root.traverse((child) => {
      if (!(child.isMesh || child.isSkinnedMesh) || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        // Only PBR materials: MeshBasicMaterial (muzzle flash) would turn envMap into a mirror reflection
        if (!m.isMeshStandardMaterial) continue;
        if (m.envMap !== this.viewmodelEnvMap) {
          m.envMap = this.viewmodelEnvMap;
          m.needsUpdate = true;
        }
        m.envMapIntensity = m.userData.vmEnvIntensity !== undefined ? m.userData.vmEnvIntensity : 1.0;
      }
    });
  }

  _loadWeaponModels() {
    return this.loadAllModels();
  }

  _setupUSPModel(gltf) {
    const uspScene = gltf.scene;
    uspScene.name = 'HK_USP_GLTF';

    uspScene.traverse((child) => {
      const nameLower = (child.name || '').toLowerCase();
      if (
        nameLower.includes('bullet') ||
        nameLower.includes('casing') ||
        nameLower.includes('shell') ||
        nameLower.includes('showcase') ||
        nameLower.includes('stand') ||
        nameLower.includes('floor') ||
        nameLower.includes('studio')
      ) {
        child.visible = false;
      }
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = true;
        if (child.material && child.material.map) {
          child.material.map.colorSpace = THREE.SRGBColorSpace;
        }
      }
    });

    // Helper to locate nodes across hierarchy
    const findNode = (name) => {
      let found = uspScene.getObjectByName(name);
      if (!found) {
        uspScene.traverse((c) => {
          if (!found && (c.name === name || (c.name || '').toLowerCase().includes(name.toLowerCase()))) {
            found = c;
          }
        });
      }
      return found;
    };

    const nodeSlide = findNode('slide_lowpoly');
    const nodeSights = findNode('sights_lowpoly');
    const nodeSlideInsert = findNode('slide_insert_lowpoly');
    const nodeFrame = findNode('lower_frame_lowpoly');
    const nodeBarrel = findNode('barrel_lowpoly');
    const nodeStabilizer = findNode('slide_stabilizer_lowpoly');
    const nodeMag = findNode('magazine_lowpoly');
    const nodeMechanics = findNode('mechanics_lowpoly');

    // USP Model scale & vertical centering:
    // Length in RootNode = 67.067 units. 0.194 / 67.067 = 0.00289263 (~19.4cm).
    // Sightline top is at Y = 0.1455 m. Setting yOffset = -0.0686 puts sightline
    // at Y = +0.0769 m, aligning with uspAdsPosition (0, -0.0769, -0.150).
    const uspScale = 0.0028926297583014003;
    const uspYOffset = -0.0686;

    // Helper to create an oriented/scaled RootNode wrapper for a sub-assembly
    const createAssemblyInner = (name) => {
      const inner = new THREE.Group();
      inner.name = `${name}_Orient`;
      inner.rotation.y = -Math.PI / 2;
      inner.scale.setScalar(uspScale);
      inner.position.y = uspYOffset;
      return inner;
    };

    // 1. Slide Group (Slide + Sights + Extractor Slide Insert)
    const slideInner = createAssemblyInner('USPSlide');
    if (nodeSlide) slideInner.add(nodeSlide);
    if (nodeSights) slideInner.add(nodeSights);
    if (nodeSlideInsert) slideInner.add(nodeSlideInsert);
    this.uspSlideGroup.add(slideInner);

    // 2. Fixed Frame Group (Polymer Lower Frame + Barrel + Guide Rod + Frame Controls)
    const uspFrameGroup = new THREE.Group();
    uspFrameGroup.name = 'USPFrameGroup';
    this.uspModelGroup.add(uspFrameGroup);

    const frameInner = createAssemblyInner('USPFrame');
    if (nodeFrame) frameInner.add(nodeFrame);
    if (nodeBarrel) frameInner.add(nodeBarrel);
    if (nodeStabilizer) frameInner.add(nodeStabilizer);
    uspFrameGroup.add(frameInner);

    // 3. Detachable Magazine Group
    const magInner = createAssemblyInner('USPMag');
    if (nodeMag) magInner.add(nodeMag);
    this.uspMagGroup.add(magInner);

    // 4. Mechanics separation (Hammer, Trigger, and Frame Controls)
    if (nodeMechanics) {
      let mechMesh = null;
      nodeMechanics.traverse((c) => {
        if (!mechMesh && c.isMesh) mechMesh = c;
      });

      if (mechMesh) {
        const mechGeo = mechMesh.geometry;
        const mechMat = mechMesh.material;
        const islands = decomposeMeshIslands(mechGeo);

        const hammerTris = [];
        const triggerTris = [];
        const frameCtrlTris = [];

        for (const isl of islands) {
          if (isl.center.y < 5.0) {
            hammerTris.push(...isl.triList);
          } else if (isl.center.y > 20.0 && isl.center.x < -18.0) {
            triggerTris.push(...isl.triList);
          } else {
            frameCtrlTris.push(...isl.triList);
          }
        }

        // Compute matrix from mesh up to RootNode (node 10 matrix * node 11 matrix)
        nodeMechanics.updateMatrix();
        if (mechMesh.parent) mechMesh.parent.updateMatrix();
        mechMesh.updateMatrix();

        const mMechToRoot = new THREE.Matrix4();
        if (mechMesh.parent && mechMesh.parent !== nodeMechanics) {
          mMechToRoot.multiplyMatrices(nodeMechanics.matrix, mechMesh.parent.matrix).multiply(mechMesh.matrix);
        } else {
          mMechToRoot.multiplyMatrices(nodeMechanics.matrix, mechMesh.matrix);
        }

        // Frame Controls (Safety, slide release, pin, mag release paddle)
        if (frameCtrlTris.length > 0) {
          const frameCtrlGeo = buildSubGeometryFromTriangles(mechGeo, frameCtrlTris);
          frameCtrlGeo.applyMatrix4(mMechToRoot);
          const frameCtrlMesh = new THREE.Mesh(frameCtrlGeo, mechMat);
          frameCtrlMesh.frustumCulled = false;
          frameCtrlMesh.receiveShadow = true;
          frameInner.add(frameCtrlMesh);
        }

        // Hammer Group (cock & drop around hinge pin at [27.5, 38.0, 0.0] in RootNode)
        if (hammerTris.length > 0) {
          const hammerGeo = buildSubGeometryFromTriangles(mechGeo, hammerTris);
          hammerGeo.applyMatrix4(mMechToRoot);

          const hx = 27.5, hy = 38.0, hz = 0.0;
          const hGame = new THREE.Vector3(0, hy * uspScale + uspYOffset, hx * uspScale);
          this.uspHammerGroup.position.copy(hGame);
          this.uspHammerGroup.rotation.set(0, 0, 0);

          const hammerInner = new THREE.Group();
          hammerInner.rotation.y = -Math.PI / 2;
          hammerInner.scale.setScalar(uspScale);
          hammerInner.position.set(0, 0, 0);

          const hammerMesh = new THREE.Mesh(hammerGeo, mechMat);
          hammerMesh.position.set(-hx, -hy, -hz);
          hammerMesh.rotation.set(0, 0, 0);
          hammerMesh.frustumCulled = false;
          hammerMesh.receiveShadow = true;

          hammerInner.add(hammerMesh);
          this.uspHammerGroup.add(hammerInner);
        }

        // Trigger Group (pull & return around hinge pin at [2.0, 34.5, 0.0] in RootNode)
        if (triggerTris.length > 0) {
          const triggerGeo = buildSubGeometryFromTriangles(mechGeo, triggerTris);
          triggerGeo.applyMatrix4(mMechToRoot);

          const tx = 2.0, ty = 34.5, tz = 0.0;
          const tGame = new THREE.Vector3(0, ty * uspScale + uspYOffset, tx * uspScale);
          this.uspTriggerGroup.position.copy(tGame);
          this.uspTriggerGroup.rotation.set(0, 0, 0);

          const triggerInner = new THREE.Group();
          triggerInner.rotation.y = -Math.PI / 2;
          triggerInner.scale.setScalar(uspScale);
          triggerInner.position.set(0, 0, 0);

          const triggerMesh = new THREE.Mesh(triggerGeo, mechMat);
          triggerMesh.position.set(-tx, -ty, -tz);
          triggerMesh.rotation.set(0, 0, 0);
          triggerMesh.frustumCulled = false;
          triggerMesh.receiveShadow = true;

          triggerInner.add(triggerMesh);
          this.uspTriggerGroup.add(triggerInner);
        }
      }
    }
  }

  _setupPistolModel(gltf) {
    const deScene = gltf.scene;
    deScene.name = 'DesertEagleGLTF';

    deScene.traverse((child) => {
      if (child.name.toLowerCase().includes('bullet') && !child.name.includes('BulletThrow')) {
        child.visible = false;
      }
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = true;
        if (child.material) {
          if (child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
          }
          // Desert Eagle ONLY: its bright silver base texture blows out under RoomEnvironment.
          // Tame just its reflection strength (never touch the dark USP/Shotgun/MP5 materials!).
          child.material.userData.vmEnvIntensity = 0.55;
        }
      }
    });

    // Normalize scale & orientation: Length ~27cm along Z in GLTF.
    deScene.scale.setScalar(0.01);
    deScene.rotation.y = Math.PI;
    deScene.position.set(0, -0.165, 0.10);

    this.pistolSlideMesh = deScene.getObjectByName('Group001');
    if (this.pistolSlideMesh) {
      this.deSlideRestZ = this.pistolSlideMesh.position.z;
    }

    this.hammerGroup = deScene.getObjectByName('Hammer_low') || new THREE.Group();
    this.hammerRestAngle = this.hammerGroup.rotation.x;
    this.triggerMesh = deScene.getObjectByName('Trigger_low');

    this.deMagMeshes = [
      deScene.getObjectByName('Magazine_low'),
      deScene.getObjectByName('MagazineBase_low'),
      deScene.getObjectByName('BaseInside_low'),
    ].filter(Boolean);
    this.deMagRestY = this.deMagMeshes.map((m) => m.position.y);

    this.pistolModelGroup.add(deScene);
  }

  _setupShotgunModel(gltf) {
    const remScene = gltf.scene;
    remScene.name = 'Remington870GLTF';

    remScene.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = true;
        if (child.material && child.material.map) {
          child.material.map.colorSpace = THREE.SRGBColorSpace;
        }
      }
    });

    remScene.scale.setScalar(0.89);
    remScene.rotation.y = Math.PI / 2;
    remScene.position.set(0, 0.045, -0.178);

    this.shotgunPumpMesh = remScene.getObjectByName('Pump_low');
    this.shotgunPumpRodsMesh = remScene.getObjectByName('PumpRods_low');
    this.shotgunSlideLRodsMesh = remScene.getObjectByName('SlideLRods_low');
    this.shotgunBoltMesh = remScene.getObjectByName('Slide_low');

    if (this.shotgunPumpMesh) this.shotgunPumpRestX = this.shotgunPumpMesh.position.x;
    if (this.shotgunPumpRodsMesh) this.shotgunPumpRodsRestX = this.shotgunPumpRodsMesh.position.x;
    if (this.shotgunSlideLRodsMesh) this.shotgunSlideLRodsRestX = this.shotgunSlideLRodsMesh.position.x;
    if (this.shotgunBoltMesh) this.shotgunBoltRestX = this.shotgunBoltMesh.position.x;

    const carrierPlate = remScene.getObjectByName('LoadingPlate_low');
    if (carrierPlate) this.shotgunCarrierGroup = carrierPlate;

    this.shotgunTriggerMesh = remScene.getObjectByName('Trigger_low');

    this.shotgunModelGroup.add(remScene);
  }

  _setupMP5Model(gltf) {
    const mp5Scene = gltf.scene;
    mp5Scene.name = 'HKMP5GLTF';

    mp5Scene.traverse((child) => {
      const nameLower = (child.name || '').toLowerCase();
      if (
        nameLower.includes('bullet') ||
        nameLower.includes('casing') ||
        nameLower.includes('shell') ||
        nameLower.includes('showcase') ||
        nameLower.includes('stand') ||
        nameLower.includes('floor') ||
        nameLower.includes('studio')
      ) {
        child.visible = false;
      }
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = true;
        if (child.material && child.material.map) {
          child.material.map.colorSpace = THREE.SRGBColorSpace;
        }
      }
    });

    // 1 unit in hk_mp5.glb = 1mm. 0.001 scale converts to real-world meters (~58.4cm length)
    mp5Scene.scale.setScalar(0.001);
    mp5Scene.rotation.set(0, 0, 0);
    mp5Scene.position.set(0, 0, 0);

    this.mp5BoltMesh =
      mp5Scene.getObjectByName('MP5005') ||
      mp5Scene.getObjectByName('MP5.005') ||
      mp5Scene.getObjectByName('MP5005_Case_0') ||
      mp5Scene.getObjectByName('MP5.005_Case_0');
    if (this.mp5BoltMesh) {
      this.mp5BoltRestZ = this.mp5BoltMesh.position.z;
    }

    this.mp5MagMesh =
      mp5Scene.getObjectByName('MP5003') ||
      mp5Scene.getObjectByName('MP5.003') ||
      mp5Scene.getObjectByName('MP5003_Case_0') ||
      mp5Scene.getObjectByName('MP5.003_Case_0');
    if (this.mp5MagMesh) {
      this.mp5MagRestY = this.mp5MagMesh.position.y;
      this.mp5MagRestZ = this.mp5MagMesh.position.z;
    }

    this.mp5TriggerMesh =
      mp5Scene.getObjectByName('MP5001') ||
      mp5Scene.getObjectByName('MP5.001') ||
      mp5Scene.getObjectByName('MP5001_Case_0') ||
      mp5Scene.getObjectByName('MP5.001_Case_0');

    this.mp5SelectorMesh =
      mp5Scene.getObjectByName('MP5010') ||
      mp5Scene.getObjectByName('MP5.010') ||
      mp5Scene.getObjectByName('MP5010_Case_0') ||
      mp5Scene.getObjectByName('MP5.010_Case_0');

    this.mp5ModelGroup.add(mp5Scene);
  }

  /**
   * Filters disconnected triangle islands on a mesh, disposing the superseded geometry.
   * No-ops when the mesh is absent, has a single island, or all islands would be stripped.
   */
  _stripMeshIslands(mesh, keepPredicate) {
    if (!mesh || !mesh.isMesh || !mesh.geometry) return;
    const islands = decomposeMeshIslands(mesh.geometry);
    if (islands.length <= 1) return;
    const keepTris = [];
    let totalTris = 0;
    for (const isl of islands) {
      totalTris += isl.triList.length;
      if (keepPredicate(isl)) {
        keepTris.push(...isl.triList);
      }
    }
    if (keepTris.length > 0 && keepTris.length < totalTris) {
      const oldGeo = mesh.geometry;
      mesh.geometry = buildSubGeometryFromTriangles(oldGeo, keepTris);
      oldGeo.dispose();
    }
  }

  /**
   * Builds the authentic Colt SAA half-moon front sight blade in `barrel_Material_0` local space.
   * Normalizes UVs onto brushed barrel metal texels so shading matches the surrounding barrel.
   */
  _createColtFrontSightMesh(material) {
    const bladeWidth = 0.025;
    const shape = new THREE.Shape();
    shape.moveTo(-0.90, 0.108);
    shape.quadraticCurveTo(-1.03, 0.140, -1.10, 0.228);
    shape.quadraticCurveTo(-1.16, 0.268, -1.210, 0.238);
    shape.quadraticCurveTo(-1.225, 0.195, -1.220, 0.108);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: bladeWidth, bevelEnabled: false, curveSegments: 12 });
    geo.translate(0, 0, -bladeWidth * 0.5);
    geo.rotateY(-Math.PI / 2);

    const uvAttr = geo.attributes.uv;
    const posAttr = geo.attributes.position;
    if (uvAttr && posAttr) {
      for (let i = 0; i < posAttr.count; i++) {
        const zNorm = THREE.MathUtils.clamp((posAttr.getZ(i) + 1.225) / 0.325, 0, 1);
        const yNorm = THREE.MathUtils.clamp((posAttr.getY(i) - 0.108) / 0.160, 0, 1);
        uvAttr.setXY(i, 0.234 + zNorm * 0.006, 0.745 + yNorm * 0.070);
      }
      uvAttr.needsUpdate = true;
    }

    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'colt_front_sight_blade';
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  /**
   * Builds a clean curved 30-round stamped-steel AKMS magazine in `akms_magazine` local space
   * with continuous side ribs and a solid floorplate cuff to replace the corrupted GLB geometry.
   */
  _createAkmsMagazineGeometry(invMagMatrix) {
    const centerX = -0.0077;
    const pivotZ = -0.265;
    const pivotY = 0.075;
    const midRadius = 0.235;
    const posArr = [];
    const uvArr = [];
    const idxArr = [];
    const pt = new THREE.Vector3();

    const pushCappedEnd = (startIdx, count, reverseWinding) => {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let r = 0; r < count; r++) {
        const off = (startIdx + r) * 3;
        cx += posArr[off];
        cy += posArr[off + 1];
        cz += posArr[off + 2];
      }
      const centerIdx = posArr.length / 3;
      posArr.push(cx / count, cy / count, cz / count);
      uvArr.push(0.30, 0.30);
      for (let r = 0; r < count; r++) {
        const nextR = (r + 1) % count;
        if (reverseWinding) {
          idxArr.push(centerIdx, startIdx + nextR, startIdx + r);
        } else {
          idxArr.push(centerIdx, startIdx + r, startIdx + nextR);
        }
      }
    };

    const sweepSection = (ring, thetaStart, thetaEnd, segments) => {
      const ringLen = ring.length;
      const base = posArr.length / 3;
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const th = thetaStart + (thetaEnd - thetaStart) * t;
        const sinTh = Math.sin(th);
        const cosTh = Math.cos(th);
        for (let r = 0; r < ringLen; r++) {
          const [ds, dx] = ring[r];
          const rad = midRadius + ds;
          pt.set(centerX + dx, pivotY - rad * sinTh, pivotZ + rad * cosTh).applyMatrix4(invMagMatrix);
          posArr.push(pt.x, pt.y, pt.z);
          const u = THREE.MathUtils.clamp(0.10 + ((ds + 0.026) / 0.052) * 0.42, 0.10, 0.52);
          uvArr.push(u, 0.92 - t * 0.62);
        }
      }
      for (let s = 0; s < segments; s++) {
        for (let r = 0; r < ringLen; r++) {
          const nr = (r + 1) % ringLen;
          const a = base + s * ringLen + r;
          const b = base + s * ringLen + nr;
          const c = base + (s + 1) * ringLen + nr;
          const d = base + (s + 1) * ringLen + r;
          idxArr.push(a, b, c, a, c, d);
        }
      }
      pushCappedEnd(base, ringLen, false);
      pushCappedEnd(base + segments * ringLen, ringLen, true);
    };

    const mirrorRing = (halfProfile) => [
      ...halfProfile,
      ...halfProfile.slice(1, -1).reverse().map(([s, x]) => [s, -x]),
    ];

    const halfX = 0.0085;
    const ribIn = 0.0070;
    const spineW = 0.0046;
    const rearW = 0.0058;
    const bodyRing = mirrorRing([
      [-0.0255, 0.0000], [-0.0245, spineW], [-0.0175, spineW], [-0.0145, halfX],
      [-0.0080, halfX], [-0.0055, ribIn], [-0.0010, ribIn], [0.0015, halfX],
      [0.0045, halfX], [0.0070, ribIn], [0.0125, ribIn], [0.0150, halfX],
      [0.0200, halfX], [0.0225, rearW], [0.0255, rearW * 0.65], [0.0260, 0.0000],
    ]);
    const plateRing = mirrorRing([
      [-0.0268, 0.0000], [-0.0260, spineW * 1.15], [-0.0210, halfX * 1.08],
      [0.0000, halfX * 1.08], [0.0210, halfX * 1.08], [0.0260, rearW * 1.12], [0.0270, 0.0000],
    ]);

    sweepSection(bodyRing, 0.16, 0.74, 20);
    sweepSection(plateRing, 0.73, 0.79, 2);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    geo.setIndex(idxArr);
    geo.computeVertexNormals();
    return geo;
  }

  _setupColtModel(gltf) {
    const coltScene = gltf.scene;
    coltScene.name = 'ColtPeacemakerGLTF';

    coltScene.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = false;
        if (child.material && child.material.map) {
          child.material.map.colorSpace = THREE.SRGBColorSpace;
        }
      }
    });

    coltScene.scale.setScalar(0.85);
    coltScene.rotation.set(0, 0, 0);
    coltScene.position.set(0, 0.01, -0.068);

    // Strip the stray bottom muzzle fin on spring_Material_0 and stubby top nub on barrel_Material_0,
    // then mount an authentic tall half-moon Colt SAA front sight blade atop the muzzle crown.
    const springMesh = coltScene.getObjectByName('spring_Material_0');
    this._stripMeshIslands(springMesh, (isl) => !(isl.box.min.y < -0.10 && isl.box.max.z < 0));

    const barrelMesh = coltScene.getObjectByName('barrel_Material_0');
    if (barrelMesh) {
      this._stripMeshIslands(barrelMesh, (isl) => isl.box.max.y <= 0.14);
      barrelMesh.add(this._createColtFrontSightMesh(barrelMesh.material));
    }

    this.coltCylinderMesh = coltScene.getObjectByName('Cylinder') || coltScene.getObjectByName('Cylinder_Material_0');
    this.coltHammerMesh = coltScene.getObjectByName('hammer') || coltScene.getObjectByName('hammer_Material_0');
    this.coltTriggerMesh = coltScene.getObjectByName('trigger') || coltScene.getObjectByName('trigger_Material_0');

    this.coltModelGroup.add(coltScene);
  }

  _setupGlockModel(gltf) {
    const glockScene = gltf.scene;
    glockScene.name = 'GlockFlamengoGLTF';

    glockScene.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = false;
        const mats = Array.isArray(child.material) ? child.material : (child.material ? [child.material] : []);
        for (const m of mats) {
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          // Fix GLTF roughnessFactor=0 so RoomEnvironment IBL doesn't create a blinding mirror glare over Flamengo colors
          if (m.isMeshStandardMaterial) {
            m.roughness = 0.38;
            m.metalness = 0.18;
            m.userData.vmEnvIntensity = 0.80;
            m.needsUpdate = true;
          }
        }
      }
    });

    const s = 0.118;
    glockScene.scale.setScalar(s);
    glockScene.rotation.set(0, 0, 0);
    glockScene.position.set(-0.2810 * s, -3.3924 * s + 0.077, 0.015);

    this.glockSlideMesh = glockScene.getObjectByName('cima_glock_5') || glockScene.getObjectByName('Object_8');
    if (this.glockSlideMesh) {
      this.glockSlideRestY = this.glockSlideMesh.position.y;
      this.glockSlideRestZ = this.glockSlideMesh.position.z;
    }
    this.glockSelectorMesh = glockScene.getObjectByName('seletor_3') || glockScene.getObjectByName('Object_12');
    if (this.glockSelectorMesh) {
      this.glockSelectorRestY = this.glockSelectorMesh.position.y;
      this.glockSelectorRestZ = this.glockSelectorMesh.position.z;
    }
    this.glockMagMesh = glockScene.getObjectByName('tambor_2') || glockScene.getObjectByName('Object_14');
    if (this.glockMagMesh) {
      this.glockMagRestY = this.glockMagMesh.position.y;
      this.glockMagRestZ = this.glockMagMesh.position.z;
    }

    // Separate slide-mounted black components (front sight post, rear sight U-notch, rear slide cover plate,
    // selector insert, and extractor claw) plus the 3D trigger from corpo_4 (Object_10) so the sights and
    // backplate reciprocate 1:1 with cima_glock_5 instead of staying frozen in mid-air during blowback.
    const corpoNode = glockScene.getObjectByName('corpo_4');
    const corpoMesh = glockScene.getObjectByName('Object_10') || (corpoNode && corpoNode.children && corpoNode.children[0]);
    if (corpoMesh && corpoMesh.isMesh && corpoMesh.geometry && corpoMesh.geometry.index) {
      const geo = corpoMesh.geometry;
      const posAttr = geo.attributes.position;
      const idxAttr = geo.index;
      const posArr = posAttr.array;
      const idxArr = idxAttr.array;
      const nVerts = posAttr.count;

      const parent = new Int32Array(nVerts);
      for (let i = 0; i < nVerts; i++) parent[i] = i;
      const find = (x) => {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      };
      const union = (a, b) => {
        a = find(a);
        b = find(b);
        if (a !== b) parent[a] = b;
      };

      const vMap = new Map();
      for (let i = 0; i < nVerts; i++) {
        const k = `${posArr[i * 3].toFixed(5)},${posArr[i * 3 + 1].toFixed(5)},${posArr[i * 3 + 2].toFixed(5)}`;
        if (vMap.has(k)) union(i, vMap.get(k));
        else vMap.set(k, i);
      }
      for (let i = 0; i < idxArr.length; i += 3) {
        union(idxArr[i], idxArr[i + 1]);
        union(idxArr[i], idxArr[i + 2]);
      }

      const comps = new Map();
      for (let i = 0; i < nVerts; i++) {
        const r = find(i);
        let c = comps.get(r);
        if (!c) {
          c = { count: 0, minY: 1e9, maxY: -1e9, minZ: 1e9, maxZ: -1e9, role: 0 };
          comps.set(r, c);
        }
        c.count++;
        const y = posArr[i * 3 + 1];
        const z = posArr[i * 3 + 2];
        if (y < c.minY) c.minY = y;
        if (y > c.maxY) c.maxY = y;
        if (z < c.minZ) c.minZ = z;
        if (z > c.maxZ) c.maxZ = z;
      }

      for (const c of comps.values()) {
        if (
          c.count < 1000 &&
          ((c.maxY < -0.50 && c.minZ > 0.15) ||
            (c.maxY < -0.10 && c.minZ < -0.92) ||
            (c.maxY < -0.17 && c.minZ > -0.42 && c.maxZ < -0.36))
        ) {
          c.role = 1; // Slide-mounted part (front sight, rear sight, backplate, extractor)
        } else if (c.count < 1000 && c.minY > -0.165 && c.maxY < 0.11 && c.minZ > -0.64 && c.maxZ < -0.38) {
          c.role = 2; // Trigger & trigger safety blade
        }
      }

      const frameTris = [];
      const slideTris = [];
      const triggerTris = [];
      for (let i = 0; i < idxArr.length; i += 3) {
        const triIdx = (i / 3) | 0;
        const a = idxArr[i];
        const role = comps.get(find(a)).role;
        if (role === 1) slideTris.push(triIdx);
        else if (role === 2) triggerTris.push(triIdx);
        else frameTris.push(triIdx);
      }

      if (frameTris.length > 0) {
        corpoMesh.geometry = buildSubGeometryFromTriangles(geo, frameTris);
      }

      if (slideTris.length > 0 && this.glockSlideMesh) {
        const slideBlackMesh = new THREE.Mesh(
          buildSubGeometryFromTriangles(geo, slideTris),
          corpoMesh.material
        );
        slideBlackMesh.name = 'GlockSlideBlackParts';
        slideBlackMesh.frustumCulled = false;
        slideBlackMesh.castShadow = false;
        slideBlackMesh.receiveShadow = false;
        this.glockSlideMesh.add(slideBlackMesh);
      }

      if (triggerTris.length > 0 && corpoNode) {
        this.glockTriggerMesh = new THREE.Mesh(
          buildSubGeometryFromTriangles(geo, triggerTris),
          corpoMesh.material
        );
        this.glockTriggerMesh.name = 'GlockTriggerMesh';
        this.glockTriggerMesh.frustumCulled = false;
        this.glockTriggerMesh.castShadow = false;
        this.glockTriggerMesh.receiveShadow = false;
        this.glockTriggerRestZ = 0;
        corpoNode.add(this.glockTriggerMesh);
      }

      if (corpoMesh.geometry !== geo) {
        geo.dispose();
      }
    }

    this.glockModelGroup.add(glockScene);
  }

  _setupAkmsModel(gltf) {
    const akmsScene = gltf.scene;
    akmsScene.name = 'AKMSGoldGLTF';

    akmsScene.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = false;
        const mats = Array.isArray(child.material) ? child.material : (child.material ? [child.material] : []);
        for (const m of mats) {
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          // Restore metallicFactor=1.0 where metallicRoughnessTexture is present so 24K Gold PBR reflections shine
          if (m.isMeshStandardMaterial) {
            if (m.metalnessMap) m.metalness = 1.0;
            if (m.roughness === 0 || m.roughness === 1) m.roughness = 0.72;
            m.userData.vmEnvIntensity = 1.15;
            m.needsUpdate = true;
          }
        }
      }
    });

    akmsScene.scale.setScalar(0.76);
    akmsScene.rotation.set(0, Math.PI / 2, 0);
    akmsScene.position.set(-0.006, -0.022, 0.072);

    this.akmsMagMesh = akmsScene.getObjectByName('akms_magazine') || akmsScene.getObjectByName('Object_2');
    if (this.akmsMagMesh) {
      // Replace the corrupted lower-half GLB magazine mesh with a clean swept ribbed steel curve
      // sharing the golden PBR material, mapped cleanly from akmsGroup space into magMesh local space.
      const magMesh = this.akmsMagMesh;
      if (magMesh.isMesh && magMesh.geometry) {
        akmsScene.updateMatrix();
        const magToGroup = new THREE.Matrix4().copy(akmsScene.matrix);
        const parentChain = [];
        for (let node = magMesh; node && node !== akmsScene; node = node.parent) {
          node.updateMatrix();
          parentChain.push(node.matrix);
        }
        for (let i = parentChain.length - 1; i >= 0; i--) {
          magToGroup.multiply(parentChain[i]);
        }
        const oldMagGeo = magMesh.geometry;
        magMesh.geometry = this._createAkmsMagazineGeometry(magToGroup.invert());
        oldMagGeo.dispose();
      }
      this.akmsMagRestX = this.akmsMagMesh.position.x;
      this.akmsMagRestY = this.akmsMagMesh.position.y;
      this.akmsMagRestZ = this.akmsMagMesh.position.z;
    }

    // Separate the AKMS bolt carrier & right-side charging handle from the static receiver
    // (Object_3) so it cycles backward/forward on every shot and during reload.
    const akmsBodyMesh = akmsScene.getObjectByName('Object_3');
    if (akmsBodyMesh && akmsBodyMesh.isMesh && akmsBodyMesh.geometry) {
      const origGeo = akmsBodyMesh.geometry;
      const bodyIslands = decomposeMeshIslands(origGeo);
      const staticTris = [];
      const boltTris = [];
      for (const isl of bodyIslands) {
        const b = isl.box;
        // Charging handle (x: 0.200..0.209) + bolt carrier body (x: 0.113..0.209);
        // excludes front trunnion rivet (x: 0.212..0.220) cleanly via max.x <= 0.211.
        const isBoltPart =
          isl.triList.length < 150 &&
          b.min.x >= 0.10 && b.max.x <= 0.211 &&
          b.min.z >= 0.088 && b.max.z <= 0.122 &&
          b.max.y <= 0.012 && b.min.y < -0.01;
        if (isBoltPart) {
          boltTris.push(...isl.triList);
        } else {
          staticTris.push(...isl.triList);
        }
      }

      if (boltTris.length > 0 && staticTris.length > 0) {
        akmsBodyMesh.geometry = buildSubGeometryFromTriangles(origGeo, staticTris);
        const boltGeo = buildSubGeometryFromTriangles(origGeo, boltTris);
        origGeo.dispose();

        const boltMesh = new THREE.Mesh(boltGeo, akmsBodyMesh.material);
        boltMesh.name = 'akms_bolt_carrier';
        boltMesh.position.copy(akmsBodyMesh.position);
        boltMesh.rotation.copy(akmsBodyMesh.rotation);
        boltMesh.scale.copy(akmsBodyMesh.scale);
        boltMesh.frustumCulled = false;
        boltMesh.castShadow = false;
        boltMesh.receiveShadow = false;
        akmsBodyMesh.parent.add(boltMesh);

        this.akmsBoltMesh = boltMesh;
        this.akmsBoltRestX = boltMesh.position.x;

        // Matte dark receiver interior baffle behind ejection port so sliding the bolt back reveals a dark breech
        const chamberBaffle = new THREE.Mesh(
          new THREE.BoxGeometry(0.085, 0.008, 0.022),
          new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.92, metalness: 0.1 })
        );
        chamberBaffle.name = 'akms_chamber_baffle';
        chamberBaffle.position.set(0.168, 0.003, 0.103);
        chamberBaffle.frustumCulled = false;
        akmsBodyMesh.parent.add(chamberBaffle);
      }
    }

    this.akmsModelGroup.add(akmsScene);
  }

  _setupHandsModel(gltf) {
    gltf.scene.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = false;
        if (child.material) {
          if (child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
          }
          child.material.roughness = 0.65;
          child.material.metalness = 0.0;
        }
      }
    });

    const cam = gltf.scene.getObjectByName('Camera');
    if (cam && cam.parent) cam.parent.remove(cam);

    this.rawHandsScene = gltf.scene;

    this._buildUSPHand();
    this._buildPistolHand();
    this._buildShotgunHands();
    this._buildMP5Hand();
    this._buildColtHand();
    this._buildGlockHand();
    this._buildAkmsHand();
    this._buildUnarmedHands();

    this._syncTuner();
  }

  /**
   * Performs an ahead-of-time WebGL GPU Texture, VBO, Skeleton BoneTexture, and EffectComposer PSO warmup pass.
   * Executes real rendered frames through EffectComposer for every weapon & rigged hand while hidden behind
   * the loading screen, eliminating the first-equip FPS drop when switching weapons in-game.
   */
  async warmUpGPU(renderer, scene, camera, composer = null, weaponSystem = null) {
    if (!renderer) return;
    this._applyViewmodelEnvironment();

    // 1. Pre-upload all unique viewmodel texture maps to the GPU
    const uploadedTextures = new Set();
    const initTex = (tex) => {
      if (tex && tex.isTexture && !uploadedTextures.has(tex)) {
        uploadedTextures.add(tex);
        try {
          renderer.initTexture(tex);
        } catch (e) {}
      }
    };

    if (this.flameTexture) initTex(this.flameTexture);

    this.root.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        const mat = child.material;
        if (mat) {
          const mats = Array.isArray(mat) ? mat : [mat];
          for (const m of mats) {
            if (m.map) initTex(m.map);
            if (m.normalMap) initTex(m.normalMap);
            if (m.roughnessMap) initTex(m.roughnessMap);
            if (m.metalnessMap) initTex(m.metalnessMap);
            if (m.aoMap) initTex(m.aoMap);
            if (m.emissiveMap) initTex(m.emissiveMap);
          }
        }
      }
    });

    // 2. Temporarily make ALL 7 weapons, unarmed hands, rigged hands, shell & FX visible for real GPU draw warmup
    const prevUspVis = this.uspGroup ? this.uspGroup.visible : false;
    const prevGunVis = this.gunGroup ? this.gunGroup.visible : false;
    const prevShotgunVis = this.shotgunGroup ? this.shotgunGroup.visible : false;
    const prevMp5Vis = this.mp5Group ? this.mp5Group.visible : false;
    const prevColtVis = this.coltGroup ? this.coltGroup.visible : false;
    const prevGlockVis = this.glockGroup ? this.glockGroup.visible : false;
    const prevAkmsVis = this.akmsGroup ? this.akmsGroup.visible : false;
    const prevUnarmedVis = this.unarmedGroup ? this.unarmedGroup.visible : false;
    const prevMuzzleVis = this.muzzleFlashGroup ? this.muzzleFlashGroup.visible : false;
    const prevShellVis = this.shotgunReloadShell ? this.shotgunReloadShell.visible : false;
    const prevRootVis = this.root.visible;
    const prevRootPos = this.root.position.clone();

    const wsState = weaponSystem && typeof weaponSystem.prepareWarmUp === 'function'
      ? weaponSystem.prepareWarmUp(renderer)
      : null;

    this.root.position.set(0.05, -0.1, -0.35);
    this.root.visible = true;
    if (this.uspGroup) this.uspGroup.visible = true;
    if (this.gunGroup) this.gunGroup.visible = true;
    if (this.shotgunGroup) this.shotgunGroup.visible = true;
    if (this.mp5Group) this.mp5Group.visible = true;
    if (this.coltGroup) this.coltGroup.visible = true;
    if (this.glockGroup) this.glockGroup.visible = true;
    if (this.akmsGroup) this.akmsGroup.visible = true;
    if (this.unarmedGroup) this.unarmedGroup.visible = true;
    if (this.muzzleFlashGroup) this.muzzleFlashGroup.visible = true;
    if (this.shotgunReloadShell) this.shotgunReloadShell.visible = true;

    if (scene && camera) {
      try {
        scene.updateMatrixWorld(true);
        renderer.compile(scene, camera);

        // Pass A: Render actual HalfFloat MSAA frame with ALL weapons, Skeleton.boneTextures & muzzle FX active
        if (composer) {
          composer.render();
        } else {
          renderer.render(scene, camera);
        }

        // Wait 1 display frame so parallel GPU shader/PSO compilation completes cleanly, then render idle state
        await new Promise((r) => requestAnimationFrame(r));

        if (this.muzzleFlashGroup) this.muzzleFlashGroup.visible = false;
        if (weaponSystem && weaponSystem.muzzleLight) {
          weaponSystem.muzzleLight.intensity = 0;
        }
        if (composer) {
          composer.render();
        } else {
          renderer.render(scene, camera);
        }
      } catch (err) {
        console.warn('[WeaponViewmodel] warmUpGPU compile warning:', err);
      }
    }

    // 3. Restore visibility states to their designated defaults
    if (weaponSystem && typeof weaponSystem.finishWarmUp === 'function') {
      weaponSystem.finishWarmUp(wsState);
    }
    if (this.uspGroup) this.uspGroup.visible = this.isUnarmed ? false : prevUspVis;
    if (this.gunGroup) this.gunGroup.visible = this.isUnarmed ? false : prevGunVis;
    if (this.shotgunGroup) this.shotgunGroup.visible = this.isUnarmed ? false : prevShotgunVis;
    if (this.mp5Group) this.mp5Group.visible = this.isUnarmed ? false : prevMp5Vis;
    if (this.coltGroup) this.coltGroup.visible = this.isUnarmed ? false : prevColtVis;
    if (this.glockGroup) this.glockGroup.visible = this.isUnarmed ? false : prevGlockVis;
    if (this.akmsGroup) this.akmsGroup.visible = this.isUnarmed ? false : prevAkmsVis;
    if (this.unarmedGroup) this.unarmedGroup.visible = this.isUnarmed ? true : prevUnarmedVis;
    if (this.muzzleFlashGroup) this.muzzleFlashGroup.visible = prevMuzzleVis;
    if (this.shotgunReloadShell) this.shotgunReloadShell.visible = prevShellVis;
    this.root.position.copy(prevRootPos);
    this.root.visible = prevRootVis;
  }

  selectWeapon(weaponType, options = {}) {
    this.currentWeapon = null;
    const isSilent = typeof options === 'boolean' ? options : !!(options && options.silent);
    this.switchWeapon(weaponType, { silent: isSilent, force: true });
  }

  /**
   * Safe no-op stub: Palm bone offset is mathematically locked ONCE at clone initialization
   * into a 3-level hierarchy so dragging bone rotation sliders NEVER teleports the arm mesh out of the camera frustum.
   */
  _recenterPalmPivot(pivotGroup, side) {
    // Intentionally no-op to preserve rigClone.position stability
  }

  /**
   * Clones the rigged hand model and re-centers its origin directly at the palm bone
   * so rotations and scaling spin in place on the grip.
   */
  _createPalmCenteredHandClone(side, { applyTriggerFinger = true } = {}) {
    if (!this.rawHandsScene) return null;

    const clone = SkeletonUtils.clone(this.rawHandsScene);
    clone.name = side === 'R' ? 'PistolRiggedHands' : 'ShotgunRiggedHands';

    const targetSideTag = side === 'R' ? '_R' : '_L';
    const oppositeSideTag = side === 'R' ? '_L' : '_R';

    // Share cached filtered geometry per hand side ('R' used by USP/Pistol/MP5, 'L' by Shotgun)
    // Preserves static GPU VBOs & artist GLTF normals across all clones without recomputing normals 4x.
    clone.traverse((child) => {
      if (child.isSkinnedMesh) {
        if (this._filteredHandGeoCache && this._filteredHandGeoCache[side]) {
          child.geometry = this._filteredHandGeoCache[side];
        } else {
          const origGeo = child.geometry;
          const skinIndex = origGeo.attributes.skinIndex;
          const skinWeight = origGeo.attributes.skinWeight;
          const oldIndex = origGeo.index;

          if (skinIndex && skinWeight && oldIndex) {
            const targetJointIndices = new Set();
            child.skeleton.bones.forEach((bone, bIdx) => {
              if (bone.name.includes(targetSideTag)) {
                targetJointIndices.add(bIdx);
              }
            });

            const newIndices = [];
            for (let i = 0; i < oldIndex.count; i += 3) {
              const a = oldIndex.getX(i);
              const b = oldIndex.getX(i + 1);
              const c = oldIndex.getX(i + 2);

              const isTargetVert = (v) => {
                for (let j = 0; j < 4; j++) {
                  const jIdx = skinIndex.getComponent(v, j);
                  const w = skinWeight.getComponent(v, j);
                  if (w > 0.01 && targetJointIndices.has(jIdx)) return true;
                }
                return false;
              };

              if (isTargetVert(a) || isTargetVert(b) || isTargetVert(c)) {
                newIndices.push(a, b, c);
              }
            }

            const filteredGeo = new THREE.BufferGeometry();
            for (const attrName of Object.keys(origGeo.attributes)) {
              filteredGeo.setAttribute(attrName, origGeo.getAttribute(attrName));
            }
            const IndexArrayType = origGeo.attributes.position.count > 65535 ? Uint32Array : Uint16Array;
            filteredGeo.setIndex(new THREE.BufferAttribute(new IndexArrayType(newIndices), 1));
            filteredGeo.boundingBox = origGeo.boundingBox ? origGeo.boundingBox.clone() : null;
            filteredGeo.boundingSphere = origGeo.boundingSphere ? origGeo.boundingSphere.clone() : null;

            if (this._filteredHandGeoCache) {
              this._filteredHandGeoCache[side] = filteredGeo;
            }
            child.geometry = filteredGeo;
          }
        }
      }

      // Completely collapse all bones belonging to the opposite arm
      if (child.isBone && child.name.includes(oppositeSideTag)) {
        child.scale.set(0, 0, 0);
      }
    });

    // Identify palm / knuckle bone
    const palmBoneName = side === 'R' ? 'middle0_R_040' : 'middle0_L_013';
    const palmBone =
      clone.getObjectByName(palmBoneName) ||
      clone.getObjectByName(side === 'R' ? 'hand_R_030' : 'hand_L_03');

    const wristBone = clone.getObjectByName(side === 'R' ? 'hand_R_030' : 'hand_L_03');
    const elbowBone = clone.getObjectByName(side === 'R' ? 'forearm_R_029' : 'forearm_L_02');

    if (wristBone) {
      wristBone.userData.restQuat = wristBone.quaternion.clone();
      wristBone.userData.pitch = 0;
      wristBone.userData.roll = 0;
    }
    if (elbowBone) {
      elbowBone.userData.restQuat = elbowBone.quaternion.clone();
      elbowBone.userData.bend = 0;
    }

    const triggerFinger = side === 'R' && applyTriggerFinger
      ? this._createIndexFingerController(clone, 'R')
      : null;

    const pivotGroup = new THREE.Group();
    pivotGroup.name = side === 'R' ? 'RightHandPivot' : 'LeftHandPivot';

    // Offset clone inside pivotGroup ONCE so palm bone aligns with pivotGroup origin (0, 0, 0)
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.set(1, 1, 1);
    clone.updateMatrixWorld(true);

    if (palmBone) {
      const palmLocalPos = new THREE.Vector3();
      palmBone.getWorldPosition(palmLocalPos);
      clone.position.copy(palmLocalPos).multiplyScalar(-1);
      clone.updateMatrixWorld(true);
    }

    pivotGroup.add(clone);
    return { pivotGroup, clone, palmBone, wristBone, elbowBone, triggerFinger };
  }

  /**
   * Binds an index-finger bone controller (4 phalanges) to a cloned hand rig, snapshotting
   * each bone's current quaternion as its rest reference before applying base offsets.
   */
  _createIndexFingerController(
    clone,
    side = 'R',
    {
      basePitch = 0.28,
      baseCurl = -0.62,
      baseYaw = -0.06,
      defaultPitch = 0,
      defaultCurl = 0,
      defaultYaw = 0,
    } = {}
  ) {
    if (!clone) return null;
    const boneNames = side === 'R'
      ? ['index0_R_035', 'index1_R_036', 'index2_R_037', 'index3_R_038']
      : ['index0_L_08', 'index1_L_09', 'index2_L_010', 'index3_L_011'];
    const [index0, index1, index2, index3] = boneNames.map((name) => clone.getObjectByName(name));
    for (const bone of [index0, index1, index2, index3]) {
      if (bone) bone.userData.restQuat = bone.quaternion.clone();
    }
    if (!index0 && !index1) return null;

    const fingerData = {
      side,
      index0,
      index1,
      index2,
      index3,
      basePitch,
      baseCurl,
      baseYaw,
      pitch: defaultPitch,
      curl: defaultCurl,
      yaw: defaultYaw,
      defaultPitch,
      defaultCurl,
      defaultYaw,
      squeeze: 0,
    };
    this._applyTriggerFingerPose(fingerData);
    return fingerData;
  }

  /**
   * Uncurls and poses the 4 index finger phalanges (left or right) relative to their rest rotations
   * so the finger pad rests naturally on/around a trigger or relaxed bare-hand pose.
   */
  _applyTriggerFingerPose(fingerData) {
    if (!fingerData) return;
    const { index0, index1, index2, index3 } = fingerData;
    const zSign = fingerData.side === 'L' ? -1 : 1;
    const effPitch = (fingerData.basePitch ?? 0.28) + (fingerData.pitch || 0);
    const effCurl = (fingerData.baseCurl ?? -0.62) + (fingerData.curl || 0) + (fingerData.squeeze || 0) * 0.20;
    const effYaw = (fingerData.baseYaw ?? -0.06) + (fingerData.yaw || 0);
    const qTmp = this._trigFingerQuatTmp || (this._trigFingerQuatTmp = new THREE.Quaternion());
    const eTmp = this._trigFingerEulerTmp || (this._trigFingerEulerTmp = new THREE.Euler());

    if (index0 && index0.userData.restQuat) {
      index0.quaternion.copy(index0.userData.restQuat).multiply(
        qTmp.setFromEuler(eTmp.set(effYaw * 0.8 - effPitch * 0.20, 0, -zSign * effPitch, 'XYZ'))
      );
    }
    if (index1 && index1.userData.restQuat) {
      index1.quaternion.copy(index1.userData.restQuat).multiply(
        qTmp.setFromEuler(eTmp.set(0, 0, zSign * effCurl * 0.28, 'XYZ'))
      );
    }
    if (index2 && index2.userData.restQuat) {
      index2.quaternion.copy(index2.userData.restQuat).multiply(
        qTmp.setFromEuler(eTmp.set(0, 0, zSign * effCurl * 0.72, 'XYZ'))
      );
    }
    if (index3 && index3.userData.restQuat) {
      index3.quaternion.copy(index3.userData.restQuat).multiply(
        qTmp.setFromEuler(eTmp.set(0, 0, zSign * effCurl * 0.65, 'XYZ'))
      );
    }
  }

  _resetIndexFingerPose(fingerData) {
    if (!fingerData) return;
    fingerData.pitch = fingerData.defaultPitch ?? 0;
    fingerData.curl = fingerData.defaultCurl ?? 0;
    fingerData.yaw = fingerData.defaultYaw ?? 0;
    fingerData.squeeze = 0;
    this._applyTriggerFingerPose(fingerData);
  }

  _initTriggerFingerDefaults(fingerData, defaultPitch = 0, defaultCurl = 0, defaultYaw = 0) {
    if (!fingerData) return null;
    fingerData.defaultPitch = defaultPitch;
    fingerData.defaultCurl = defaultCurl;
    fingerData.defaultYaw = defaultYaw;
    fingerData.pitch = defaultPitch;
    fingerData.curl = defaultCurl;
    fingerData.yaw = defaultYaw;
    fingerData.squeeze = 0;
    this._applyTriggerFingerPose(fingerData);
    return fingerData;
  }

  _resetAllTriggerFingers() {
    for (const tf of [
      this.uspTriggerFinger,
      this.pistolTriggerFinger,
      this.coltTriggerFinger,
      this.glockTriggerFinger,
    ]) {
      if (tf && tf.squeeze !== 0) {
        tf.squeeze = 0;
        this._applyTriggerFingerPose(tf);
      }
    }
  }

  setTriggerFingerPose(weaponType, { pitch, curl, yaw } = {}) {
    const map = {
      hk_usp: this.uspTriggerFinger,
      desert_eagle: this.pistolTriggerFinger,
      colt_peacemaker: this.coltTriggerFinger,
      glock_flamengo: this.glockTriggerFinger,
    };
    const tf = map[weaponType];
    if (!tf) return;
    if (pitch !== undefined) tf.pitch = pitch;
    if (curl !== undefined) tf.curl = curl;
    if (yaw !== undefined) tf.yaw = yaw;
    this._applyTriggerFingerPose(tf);
  }

  /**
   * Builds Slot 1 (H&K USP 9mm) Single Right Rigged Hand
   * Centered on pistol grip under beavertail/trigger guard with forearm exiting bottom-right.
   */
  _buildUSPHand() {
    if (!this.uspHandGroup) return;
    while (this.uspHandGroup.children.length > 0) {
      this.uspHandGroup.remove(this.uspHandGroup.children[0]);
    }

    const handData = this._createPalmCenteredHandClone('R');
    if (!handData) return;

    this.uspHandPivot = handData.pivotGroup;
    this.uspHandsClone = handData.clone;
    this.uspWristBone = handData.wristBone;
    this.uspElbowBone = handData.elbowBone;

    // Baseline tuned H&K USP grip anchor and orientation
    this.uspHandPivot.position.set(0.02, -0.014, 0.11);
    this.uspHandPivot.rotation.set(0.52, -3, 0.22);
    this.uspHandPivot.scale.setScalar(1.0);

    // Initial bone delta rotations (wristPitch: 0.24, wristRoll: 0.02, elbowBend: 0)
    if (this.uspWristBone) {
      this.uspWristBone.userData.pitch = 0.24;
      this.uspWristBone.userData.roll = 0.02;
      this.uspWristBone.quaternion.copy(this.uspWristBone.userData.restQuat);
      const qDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.24, 0, 0.02, 'XYZ')
      );
      this.uspWristBone.quaternion.multiply(qDelta);
    }
    if (this.uspElbowBone) {
      this.uspElbowBone.userData.bend = 0;
      this.uspElbowBone.quaternion.copy(this.uspElbowBone.userData.restQuat);
    }

    // Cache default transforms for Reset Hand Pose
    this.uspHandPivot.userData.defaultPos = this.uspHandPivot.position.clone();
    this.uspHandPivot.userData.defaultRot = this.uspHandPivot.rotation.clone();
    this.uspHandPivot.userData.defaultScale = this.uspHandPivot.scale.clone();

    // Link trigger finger and pose naturally inside trigger guard
    this.uspTriggerFinger = this._initTriggerFingerDefaults(handData.triggerFinger, -0.06, -0.06, 0);

    this.uspHandGroup.add(this.uspHandPivot);
  }

  /**
   * Builds Slot 2 (.50 AE Desert Eagle) Single Right Rigged Hand
   * Centered on grip under beavertail/trigger guard with forearm exiting bottom-right.
   */
  _buildPistolHand() {
    if (!this.pistolHandGroup) return;
    while (this.pistolHandGroup.children.length > 0) {
      this.pistolHandGroup.remove(this.pistolHandGroup.children[0]);
    }

    const handData = this._createPalmCenteredHandClone('R');
    if (!handData) return;

    this.pistolHandPivot = handData.pivotGroup;
    this.pistolHandsClone = handData.clone;
    this.pistolWristBone = handData.wristBone;
    this.pistolElbowBone = handData.elbowBone;

    // User-tuned Desert Eagle grip anchor and orientation
    this.pistolHandPivot.position.set(0.008, 0.008, 0.256);
    this.pistolHandPivot.rotation.set(0.66, -3.14, 0.14);
    this.pistolHandPivot.scale.setScalar(0.85);

    // Initial bone delta rotations (pitch: -0.02, roll: -0.02, elbow: -0.02)
    if (this.pistolWristBone) {
      this.pistolWristBone.userData.pitch = -0.02;
      this.pistolWristBone.userData.roll = -0.02;
      this.pistolWristBone.quaternion.copy(this.pistolWristBone.userData.restQuat);
      const qDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-0.02, 0, -0.02, 'XYZ')
      );
      this.pistolWristBone.quaternion.multiply(qDelta);
    }
    if (this.pistolElbowBone) {
      this.pistolElbowBone.userData.bend = -0.02;
      this.pistolElbowBone.quaternion.copy(this.pistolElbowBone.userData.restQuat);
      const qDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-0.02, 0, 0, 'XYZ')
      );
      this.pistolElbowBone.quaternion.multiply(qDelta);
    }

    // Cache default transforms for Reset Hand Pose
    this.pistolHandPivot.userData.defaultPos = this.pistolHandPivot.position.clone();
    this.pistolHandPivot.userData.defaultRot = this.pistolHandPivot.rotation.clone();
    this.pistolHandPivot.userData.defaultScale = this.pistolHandPivot.scale.clone();

    // Link trigger finger and pose naturally inside trigger guard
    this.pistolTriggerFinger = this._initTriggerFingerDefaults(handData.triggerFinger, 0, -0.06, 0);

    this.pistolHandGroup.add(this.pistolHandPivot);
  }

  /**
   * Applies wrist (pitch, roll) and elbow (bend) Euler deltas atop each bone's rest quaternion.
   */
  _applyHandBoneOffsets(wristBone, elbowBone, pitch, roll, bend) {
    if (wristBone && wristBone.userData.restQuat) {
      wristBone.userData.pitch = pitch;
      wristBone.userData.roll = roll;
      wristBone.quaternion.copy(wristBone.userData.restQuat);
      if (pitch !== 0 || roll !== 0) {
        wristBone.quaternion.multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, roll, 'XYZ'))
        );
      }
    }
    if (elbowBone && elbowBone.userData.restQuat) {
      elbowBone.userData.bend = bend;
      elbowBone.quaternion.copy(elbowBone.userData.restQuat);
      if (bend !== 0) {
        elbowBone.quaternion.multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(bend, 0, 0, 'XYZ'))
        );
      }
    }
  }

  /**
   * Mounts a left support arm/hand rig into `containerGroup` with the 12-gauge default pose
   * so heavy two-handed weapons start from one consistent support-arm baseline.
   */
  _buildLeftSupportHandRig(containerGroup, pose = DEFAULT_LEFT_SUPPORT_POSE) {
    if (!containerGroup) return null;
    while (containerGroup.children.length > 0) {
      containerGroup.remove(containerGroup.children[0]);
    }

    const handData = this._createPalmCenteredHandClone('L');
    if (!handData) return null;

    const { pivotGroup, clone, wristBone, elbowBone } = handData;
    pivotGroup.position.set(...pose.pos);
    pivotGroup.rotation.set(...pose.rot);
    pivotGroup.scale.setScalar(pose.scale);

    if (wristBone) {
      wristBone.userData.defaultPitch = pose.wristPitch;
      wristBone.userData.defaultRoll = pose.wristRoll;
    }
    if (elbowBone) {
      elbowBone.userData.defaultBend = pose.elbowBend;
    }
    this._applyHandBoneOffsets(wristBone, elbowBone, pose.wristPitch, pose.wristRoll, pose.elbowBend);

    // Bend left upper-arm bone downward behind camera frustum so upper arm & shoulder stay 100% off-screen
    const armL = clone.getObjectByName('arm_L_01');
    if (armL) {
      armL.rotation.x = pose.armPitch;
    }

    pivotGroup.userData.defaultPos = pivotGroup.position.clone();
    pivotGroup.userData.defaultRot = pivotGroup.rotation.clone();
    pivotGroup.userData.defaultScale = pivotGroup.scale.clone();

    containerGroup.add(pivotGroup);
    return { pivotGroup, clone, wristBone, elbowBone };
  }

  /**
   * Builds Slot 2 (Remington 870 Shotgun) Single Left Rigged Hand
   * Mounted directly onto this.shotgunPumpGroup so it translates 1:1 with pump action.
   */
  _buildShotgunHands() {
    const rig = this._buildLeftSupportHandRig(this.shotgunLeftHandGroup);
    if (!rig) return;

    this.shotgunHandPivot = rig.pivotGroup;
    this.shotgunHandsClone = rig.clone;
    this.shotgunWristBone = rig.wristBone;
    this.shotgunElbowBone = rig.elbowBone;
  }
  /**
   * Builds Slot 4 (H&K MP5 9mm) Single Left Support Arm (matching 12-gauge layout; right arm omitted).
   */
  _buildMP5Hand() {
    const rig = this._buildLeftSupportHandRig(this.mp5LeftHandGroup, MP5_LEFT_HAND_POSE);
    if (!rig) return;

    this.mp5HandPivot = rig.pivotGroup;
    this.mp5HandsClone = rig.clone;
    this.mp5WristBone = rig.wristBone;
    this.mp5ElbowBone = rig.elbowBone;
  }

  _buildColtHand() {
    if (!this.coltHandGroup) return;
    while (this.coltHandGroup.children.length > 0) {
      this.coltHandGroup.remove(this.coltHandGroup.children[0]);
    }

    const handData = this._createPalmCenteredHandClone('R');
    if (!handData) return;

    this.coltHandPivot = handData.pivotGroup;
    this.coltHandsClone = handData.clone;
    this.coltWristBone = handData.wristBone;
    this.coltElbowBone = handData.elbowBone;

    this.coltHandPivot.position.set(0.012, -0.038, 0.112);
    this.coltHandPivot.rotation.set(0.52, -3.0, 0.22);
    this.coltHandPivot.scale.setScalar(1.0);

    if (this.coltWristBone) {
      this.coltWristBone.userData.pitch = 0.3;
      this.coltWristBone.userData.roll = 0.02;
      this.coltWristBone.quaternion.copy(this.coltWristBone.userData.restQuat);
      const qDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0.02, 'XYZ'));
      this.coltWristBone.quaternion.multiply(qDelta);
    }
    if (this.coltElbowBone) {
      this.coltElbowBone.userData.bend = 0;
      this.coltElbowBone.quaternion.copy(this.coltElbowBone.userData.restQuat);
    }

    this.coltHandPivot.userData.defaultPos = this.coltHandPivot.position.clone();
    this.coltHandPivot.userData.defaultRot = this.coltHandPivot.rotation.clone();
    this.coltHandPivot.userData.defaultScale = this.coltHandPivot.scale.clone();

    this.coltTriggerFinger = this._initTriggerFingerDefaults(handData.triggerFinger, -0.14, 0, -0.1);

    this.coltHandGroup.add(this.coltHandPivot);
  }

  _buildGlockHand() {
    if (!this.glockHandGroup) return;
    while (this.glockHandGroup.children.length > 0) {
      this.glockHandGroup.remove(this.glockHandGroup.children[0]);
    }

    const handData = this._createPalmCenteredHandClone('R');
    if (!handData) return;

    this.glockHandPivot = handData.pivotGroup;
    this.glockHandsClone = handData.clone;
    this.glockWristBone = handData.wristBone;
    this.glockElbowBone = handData.elbowBone;

    this.glockHandPivot.position.set(0.024, -0.034, 0.114);
    this.glockHandPivot.rotation.set(0.28, -3.0, 0.28);
    this.glockHandPivot.scale.setScalar(1.0);

    if (this.glockWristBone) {
      this.glockWristBone.userData.pitch = 0.4;
      this.glockWristBone.userData.roll = 0.34;
      this.glockWristBone.quaternion.copy(this.glockWristBone.userData.restQuat);
      const qDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0.34, 'XYZ'));
      this.glockWristBone.quaternion.multiply(qDelta);
    }
    if (this.glockElbowBone) {
      this.glockElbowBone.userData.bend = 0;
      this.glockElbowBone.quaternion.copy(this.glockElbowBone.userData.restQuat);
      const qDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0, 'XYZ'));
      this.glockElbowBone.quaternion.multiply(qDelta);
    }

    this.glockHandPivot.userData.defaultPos = this.glockHandPivot.position.clone();
    this.glockHandPivot.userData.defaultRot = this.glockHandPivot.rotation.clone();
    this.glockHandPivot.userData.defaultScale = this.glockHandPivot.scale.clone();

    this.glockTriggerFinger = this._initTriggerFingerDefaults(handData.triggerFinger, 0.14, 0.12, 0);

    this.glockHandGroup.add(this.glockHandPivot);
  }

  /**
   * Builds Slot 7 (AKMS Gold 7.62) Single Left Support Arm (matching 12-gauge layout; right arm omitted).
   */
  _buildAkmsHand() {
    const rig = this._buildLeftSupportHandRig(this.akmsLeftHandGroup, AKMS_LEFT_HAND_POSE);
    if (!rig) return;

    this.akmsHandPivot = rig.pivotGroup;
    this.akmsHandsClone = rig.clone;
    this.akmsWristBone = rig.wristBone;
    this.akmsElbowBone = rig.elbowBone;
  }

  _buildUnarmedMesh() {
    this.unarmedGroup = new THREE.Group();
    this.unarmedGroup.name = 'UnarmedHands';
    this.unarmedGroup.visible = this.isUnarmed;
    this.root.add(this.unarmedGroup);
  }

  _relaxUnarmedHandFingers(clone, side) {
    if (!clone) return;
    const uncurlSign = side === 'R' ? -1 : 1;
    const qRelaxBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, uncurlSign * 0.42, 'XYZ'));
    const qRelaxMid = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, uncurlSign * 0.40, 'XYZ'));
    const qRelaxTip = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, uncurlSign * 0.28, 'XYZ'));
    const qRelaxThumb = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, uncurlSign * 0.22, 'XYZ'));
    const fingerPrefixes = ['index', 'middle', 'ring', 'pinky'];

    clone.traverse((child) => {
      if (!child.isBone) return;
      if (child.name.startsWith(`thumb2_${side}`)) {
        child.quaternion.multiply(qRelaxThumb);
        return;
      }
      for (const prefix of fingerPrefixes) {
        if (child.name.startsWith(`${prefix}1_${side}`)) {
          child.quaternion.multiply(qRelaxBase);
          break;
        }
        if (child.name.startsWith(`${prefix}2_${side}`)) {
          child.quaternion.multiply(qRelaxMid);
          break;
        }
        if (child.name.startsWith(`${prefix}3_${side}`)) {
          child.quaternion.multiply(qRelaxTip);
          break;
        }
      }
    });
  }

  _buildUnarmedHands() {
    if (!this.unarmedGroup) return;
    while (this.unarmedGroup.children.length > 0) {
      this.unarmedGroup.remove(this.unarmedGroup.children[0]);
    }

    this.unarmedRightPivot = null;
    this.unarmedLeftPivot = null;
    this.unarmedRightFinger = null;
    this.unarmedLeftFinger = null;

    this.unarmedGroup.position.set(0, 0, 0);
    this.unarmedGroup.rotation.set(0, 0, 0);
    this.unarmedGroup.scale.setScalar(1.0);
    this.unarmedGroup.userData.defaultHipPos = new THREE.Vector3(0, -0.022, 0);
    this.unarmedGroup.userData.defaultHipRot = new THREE.Euler(-0.04, 0, 0);
    this.unarmedGroup.userData.defaultScale = 1.0;

    // Skip gun trigger-finger offsets before relaxing bare hands so the right index finger doesn't double-uncurl into a claw
    const rightData = this._createPalmCenteredHandClone('R', { applyTriggerFinger: false });
    if (rightData) {
      this.unarmedRightPivot = rightData.pivotGroup;
      this.unarmedRightPivot.position.set(0.162, -0.178, -0.208);
      this.unarmedRightPivot.rotation.set(-1.88, -1.38, -3.14);
      this.unarmedRightPivot.scale.setScalar(0.96);
      this._relaxUnarmedHandFingers(rightData.clone, 'R');
      this.unarmedRightFinger = this._createIndexFingerController(rightData.clone, 'R', {
        basePitch: 0,
        baseCurl: 0,
        baseYaw: 0,
      });
      this.unarmedRightPivot.userData.defaultPos = this.unarmedRightPivot.position.clone();
      this.unarmedRightPivot.userData.defaultRot = this.unarmedRightPivot.rotation.clone();
      this.unarmedGroup.add(this.unarmedRightPivot);
    }

    const leftData = this._createPalmCenteredHandClone('L', { applyTriggerFinger: false });
    if (leftData) {
      this.unarmedLeftPivot = leftData.pivotGroup;
      this.unarmedLeftPivot.position.set(-0.13, -0.148, -0.178);
      this.unarmedLeftPivot.rotation.set(-0.18, 2.36, 1.38);
      this.unarmedLeftPivot.scale.setScalar(0.96);
      this._relaxUnarmedHandFingers(leftData.clone, 'L');
      this.unarmedLeftFinger = this._createIndexFingerController(leftData.clone, 'L', {
        basePitch: 0,
        baseCurl: 0,
        baseYaw: 0,
      });
      this.unarmedLeftPivot.userData.defaultPos = this.unarmedLeftPivot.position.clone();
      this.unarmedLeftPivot.userData.defaultRot = this.unarmedLeftPivot.rotation.clone();
      this.unarmedGroup.add(this.unarmedLeftPivot);
    }
  }

  /**
   * Switches between armed weapon viewmodels and lowered relaxed bare hands.
   */
  setUnarmed(enabled) {
    const next = !!enabled;
    this.isUnarmed = next;
    this.isADS = false;
    this.isReloading = false;
    this.isPumping = false;

    if (next) {
      this._clearReloadTimersAndTweens();
      this._resetColtMechState();
      this._resetAkmsMechState();
      this.reloadTilt.x = 0;
      this.reloadTilt.y = 0;
      this.reloadTilt.z = 0;
      this.reloadTilt.pitch = 0;
      this.reloadTilt.yaw = 0;
      this.reloadTilt.roll = 0;
      if (this.uspGroup) this.uspGroup.visible = false;
      if (this.gunGroup) this.gunGroup.visible = false;
      if (this.shotgunGroup) this.shotgunGroup.visible = false;
      if (this.mp5Group) this.mp5Group.visible = false;
      if (this.coltGroup) this.coltGroup.visible = false;
      if (this.glockGroup) this.glockGroup.visible = false;
      if (this.akmsGroup) this.akmsGroup.visible = false;
      if (this.muzzleFlashGroup) this.muzzleFlashGroup.visible = false;
      if (this.unarmedGroup) this.unarmedGroup.visible = true;

      this.hipPosition = this.unarmedHipPosition;
      this.adsPosition = this.unarmedAdsPosition;
      this.hipRotation = this.unarmedHipRotation;
      this.adsRotation = this.unarmedAdsRotation;
      this.posSpring.reset(this.hipPosition.x, this.hipPosition.y, this.hipPosition.z);
      this.rotSpring.reset(this.hipRotation.x, this.hipRotation.y, this.hipRotation.z);
      this.bobSpring.reset(0, 0, 0);
      this.root.position.copy(this.hipPosition);
      this.root.rotation.copy(this.hipRotation);
    } else {
      if (this.unarmedGroup) this.unarmedGroup.visible = false;
      this.switchWeapon(this.currentWeapon, { silent: true, force: true });
    }
  }

  /**
   * Restores pristine default hand and bone pose for the active weapon in the F8 tuner.
   */
  resetHandPose() {
    if (this.isUnarmed) {
      if (this.unarmedGroup && this.unarmedGroup.userData.defaultHipPos) {
        this.unarmedHipPosition.copy(this.unarmedGroup.userData.defaultHipPos);
        this.unarmedHipRotation.copy(this.unarmedGroup.userData.defaultHipRot);
        this.unarmedGroup.scale.setScalar(this.unarmedGroup.userData.defaultScale ?? 1.0);
      }
      if (this.unarmedLeftPivot && this.unarmedLeftPivot.userData.defaultPos) {
        this.unarmedLeftPivot.position.copy(this.unarmedLeftPivot.userData.defaultPos);
        this.unarmedLeftPivot.rotation.copy(this.unarmedLeftPivot.userData.defaultRot);
      }
      if (this.unarmedRightPivot && this.unarmedRightPivot.userData.defaultPos) {
        this.unarmedRightPivot.position.copy(this.unarmedRightPivot.userData.defaultPos);
        this.unarmedRightPivot.rotation.copy(this.unarmedRightPivot.userData.defaultRot);
      }
      this._resetIndexFingerPose(this.unarmedLeftFinger);
      this._resetIndexFingerPose(this.unarmedRightFinger);
      this.posSpring.reset(this.unarmedHipPosition.x, this.unarmedHipPosition.y, this.unarmedHipPosition.z);
      this.rotSpring.reset(this.unarmedHipRotation.x, this.unarmedHipRotation.y, this.unarmedHipRotation.z);
      this.root.position.copy(this.unarmedHipPosition);
      this.root.rotation.copy(this.unarmedHipRotation);
      this._syncTuner();
      return;
    }

    const w = this.currentWeapon;
    const isUSP = w === 'hk_usp';
    const isShotgun = w === 'shotgun';
    const isMP5 = w === 'hk_mp5';
    const isColt = w === 'colt_peacemaker';
    const isGlock = w === 'glock_flamengo';
    const isAkms = w === 'akms_gold';

    let target = this.pistolHandPivot;
    let wrist = this.pistolWristBone;
    let elbow = this.pistolElbowBone;
    let triggerFinger = this.pistolTriggerFinger;
    if (isUSP) { target = this.uspHandPivot; wrist = this.uspWristBone; elbow = this.uspElbowBone; triggerFinger = this.uspTriggerFinger; }
    else if (isShotgun) { target = this.shotgunHandPivot; wrist = this.shotgunWristBone; elbow = this.shotgunElbowBone; triggerFinger = null; }
    else if (isMP5) { target = this.mp5HandPivot; wrist = this.mp5WristBone; elbow = this.mp5ElbowBone; triggerFinger = null; }
    else if (isColt) { target = this.coltHandPivot; wrist = this.coltWristBone; elbow = this.coltElbowBone; triggerFinger = this.coltTriggerFinger; }
    else if (isGlock) { target = this.glockHandPivot; wrist = this.glockWristBone; elbow = this.glockElbowBone; triggerFinger = this.glockTriggerFinger; }
    else if (isAkms) { target = this.akmsHandPivot; wrist = this.akmsWristBone; elbow = this.akmsElbowBone; triggerFinger = null; }

    if (target && target.userData.defaultPos) {
      target.position.copy(target.userData.defaultPos);
      target.rotation.copy(target.userData.defaultRot);
      target.scale.copy(target.userData.defaultScale);
    }

    const defaultPitch = isGlock ? 0.4 : (isColt ? 0.3 : (isUSP ? 0.24 : (isMP5 ? 0.04 : (isAkms ? -0.06 : (isShotgun ? -0.08 : -0.02)))));
    const defaultRoll = isGlock ? 0.34 : ((isUSP || isColt || isAkms) ? 0.02 : (isMP5 ? 0.04 : (isShotgun ? -0.1 : -0.02)));
    const defaultBend = (isUSP || isColt || isGlock) ? 0 : ((isShotgun || isMP5 || isAkms) ? -0.22 : -0.02);
    const pitch = wrist?.userData?.defaultPitch ?? defaultPitch;
    const roll = wrist?.userData?.defaultRoll ?? defaultRoll;
    const bend = elbow?.userData?.defaultBend ?? defaultBend;
    this._applyHandBoneOffsets(wrist, elbow, pitch, roll, bend);

    this._resetIndexFingerPose(triggerFinger);

    if (this.tunerMode === 'GUN (HIP)') {
      if (isUSP) {
        this.uspHipPosition.set(0.1, -0.1, -0.22);
        this.uspHipRotation.set(0.1, 0, 0.1);
      } else if (isShotgun) {
        this.shotgunHipPosition.set(0.1, -0.13, -0.042);
        this.shotgunHipRotation.set(0.1, 0, 0);
      } else if (isMP5) {
        this.mp5HipPosition.set(0.1, -0.13, -0.13);
        this.mp5HipRotation.set(0.08, 0, 0.05);
      } else if (isColt) {
        this.coltHipPosition.set(0.1, -0.1, -0.22);
        this.coltHipRotation.set(0.03, 0, 0.1);
      } else if (isGlock) {
        this.glockHipPosition.set(0.1, -0.08, -0.22);
        this.glockHipRotation.set(0.1, 0.1, 0.1);
      } else if (isAkms) {
        this.akmsHipPosition.set(0.1, -0.13, -0.1);
        this.akmsHipRotation.set(0.1, 0, 0);
      } else {
        this.pistolHipPosition.set(0.1, -0.1, -0.4);
        this.pistolHipRotation.set(0.1, 0, 0.1);
      }
      const posTarget = this.hipPosition;
      const rotTarget = this.hipRotation;
      this.posSpring.reset(posTarget.x, posTarget.y + this.reloadTilt.y, posTarget.z);
      this.rotSpring.reset(rotTarget.x + this.reloadTilt.pitch, rotTarget.y + this.reloadTilt.yaw, rotTarget.z + this.reloadTilt.roll);
    } else if (this.tunerMode === 'GUN (ADS)') {
      if (isUSP) {
        this.uspAdsPosition.set(0, -0.077, -0.16);
        this.uspAdsRotation.set(0, 0, 0);
      } else if (isShotgun) {
        this.shotgunAdsPosition.set(0, -0.075, -0.09);
        this.shotgunAdsRotation.set(0, 0, 0);
      } else if (isMP5) {
        this.mp5AdsPosition.set(0, -0.085, -0.08);
        this.mp5AdsRotation.set(0, 0, 0);
      } else if (isColt) {
        this.coltAdsPosition.set(0, -0.0793, -0.16);
        this.coltAdsRotation.set(-0.004, 0, 0);
      } else if (isGlock) {
        this.glockAdsPosition.set(-0.0014, -0.0596, -0.14);
        this.glockAdsRotation.set(0.0025, 0.0784, 0.0204);
      } else if (isAkms) {
        this.akmsAdsPosition.set(0.008, -0.083, -0.094);
        this.akmsAdsRotation.set(0, 0, 0);
      } else {
        this.pistolAdsPosition.set(0.000, -0.104, -0.345);
        this.pistolAdsRotation.set(-0.017, 0, 0);
      }
      const posTarget = this.adsPosition;
      const rotTarget = this.adsRotation;
      this.posSpring.reset(posTarget.x, posTarget.y + this.reloadTilt.y, posTarget.z);
      this.rotSpring.reset(rotTarget.x + this.reloadTilt.pitch, rotTarget.y + this.reloadTilt.yaw, rotTarget.z + this.reloadTilt.roll);
    }

    this._syncTuner();
  }

  // ===========================================================================
  // WEAPON SWITCHING & ADS
  // ===========================================================================

  switchWeapon(weaponType, options = {}) {
    if (this.isUnarmed) return;
    const isSilent = (typeof options === 'object' && options !== null) ? !!options.silent : false;
    const isForce = (typeof options === 'object' && options !== null) ? !!options.force : (typeof options === 'boolean' ? options : false);

    if (this.currentWeapon === weaponType && !isForce) return;

    if (this.sound && typeof this.sound.stopActionSounds === 'function') {
      this.sound.stopActionSounds();
    }

    this._clearReloadTimersAndTweens();

    this.isReloading = false;
    this.isPumping = false;
    this._updateShotgunPumpVisuals(0);
    if (this.shotgunReloadShell) this.shotgunReloadShell.visible = false;
    for (const leftGroup of [this.shotgunLeftHandGroup, this.mp5LeftHandGroup, this.akmsLeftHandGroup]) {
      if (leftGroup) {
        leftGroup.position.set(0, 0, 0);
        leftGroup.rotation.set(0, 0, 0);
      }
    }
    this._resetAllTriggerFingers();
    if (this.glockTriggerMesh) this.glockTriggerMesh.position.z = this.glockTriggerRestZ || 0;
    this.mp5BoltBlowback = 0;
    if (this.mp5BoltMesh && this.mp5BoltRestZ !== undefined) {
      this.mp5BoltMesh.position.z = this.mp5BoltRestZ;
    }
    if (this.mp5MagMesh && this.mp5MagRestY !== undefined && this.mp5MagRestZ !== undefined) {
      this.mp5MagMesh.visible = true;
      this.mp5MagMesh.position.set(0, this.mp5MagRestY, this.mp5MagRestZ);
    }
    if (this.mp5TriggerMesh) this.mp5TriggerMesh.rotation.x = 0;
    this.isTriggerHeld = false;
    this.glockSlideBlowback = 0;
    this.glockSlideCycle = 0;
    this._glockShotJustTriggered = false;
    if (this.glockTriggerMesh) {
      this.glockTriggerMesh.position.z = this.glockTriggerRestZ || 0;
    }
    if (this.glockSlideMesh && this.glockSlideRestY !== undefined) {
      this.glockSlideMesh.position.y = this.glockSlideRestY;
      this.glockSlideMesh.position.z = this.glockSlideRestZ;
    }
    if (this.glockSelectorMesh && this.glockSelectorRestY !== undefined) {
      this.glockSelectorMesh.position.y = this.glockSelectorRestY;
      this.glockSelectorMesh.position.z = this.glockSelectorRestZ;
    }
    if (this.glockMagMesh && this.glockMagRestY !== undefined) {
      this.glockMagMesh.visible = true;
      this.glockMagMesh.position.y = this.glockMagRestY;
      this.glockMagMesh.position.z = this.glockMagRestZ;
    }
    this._resetColtMechState();
    this._resetAkmsMechState();
    if (this.magGroup) {
      this.magGroup.position.set(0, 0, 0);
      this.magGroup.visible = true;
    }
    this._updateDesertEagleMagVisuals(0, true);

    this.currentWeapon = weaponType;
    const isUSP = weaponType === 'hk_usp';
    const isShotgun = weaponType === 'shotgun';
    const isMP5 = weaponType === 'hk_mp5';
    const isPistol = weaponType === 'desert_eagle' || weaponType === 'pistol';
    const isColt = weaponType === 'colt_peacemaker';
    const isGlock = weaponType === 'glock_flamengo';
    const isAkms = weaponType === 'akms_gold';

    this._syncTuner();

    if (this.uspGroup) this.uspGroup.visible = isUSP;
    if (this.gunGroup) this.gunGroup.visible = isPistol;
    if (this.shotgunGroup) this.shotgunGroup.visible = isShotgun;
    if (this.mp5Group) this.mp5Group.visible = isMP5;
    if (this.coltGroup) this.coltGroup.visible = isColt;
    if (this.glockGroup) this.glockGroup.visible = isGlock;
    if (this.akmsGroup) this.akmsGroup.visible = isAkms;

    if (isUSP) {
      this.hipPosition = this.uspHipPosition;
      this.adsPosition = this.uspAdsPosition;
      this.hipRotation = this.uspHipRotation;
      this.adsRotation = this.uspAdsRotation;
      this.muzzleAnchor = this.uspMuzzleSocket;
    } else if (isMP5) {
      this.hipPosition = this.mp5HipPosition;
      this.adsPosition = this.mp5AdsPosition;
      this.hipRotation = this.mp5HipRotation;
      this.adsRotation = this.mp5AdsRotation;
      this.muzzleAnchor = this.mp5MuzzleSocket;
    } else if (isShotgun) {
      this.hipPosition = this.shotgunHipPosition;
      this.adsPosition = this.shotgunAdsPosition;
      this.hipRotation = this.shotgunHipRotation;
      this.adsRotation = this.shotgunAdsRotation;
      this.muzzleAnchor = this.shotgunMuzzleSocket;
    } else if (isColt) {
      this.hipPosition = this.coltHipPosition;
      this.adsPosition = this.coltAdsPosition;
      this.hipRotation = this.coltHipRotation;
      this.adsRotation = this.coltAdsRotation;
      this.muzzleAnchor = this.coltMuzzleSocket;
    } else if (isGlock) {
      this.hipPosition = this.glockHipPosition;
      this.adsPosition = this.glockAdsPosition;
      this.hipRotation = this.glockHipRotation;
      this.adsRotation = this.glockAdsRotation;
      this.muzzleAnchor = this.glockMuzzleSocket;
    } else if (isAkms) {
      this.hipPosition = this.akmsHipPosition;
      this.adsPosition = this.akmsAdsPosition;
      this.hipRotation = this.akmsHipRotation;
      this.adsRotation = this.akmsAdsRotation;
      this.muzzleAnchor = this.akmsMuzzleSocket;
    } else {
      this.hipPosition = this.pistolHipPosition;
      this.adsPosition = this.pistolAdsPosition;
      this.hipRotation = this.pistolHipRotation;
      this.adsRotation = this.pistolAdsRotation;
      this.muzzleAnchor = this.muzzleSocket;
    }

    if (this.muzzleFlashGroup && this.muzzleAnchor) {
      this.muzzleAnchor.add(this.muzzleFlashGroup);
      this.muzzleFlashGroup.visible = false;
    }

    // 1. Immediately sync spring state to active weapon rest pose so it doesn't cross-contaminate
    const targetPos = this.isADS ? this.adsPosition : this.hipPosition;
    const targetRot = this.isADS ? this.adsRotation : this.hipRotation;
    this.posSpring.reset(targetPos.x, targetPos.y, targetPos.z);
    this.rotSpring.reset(targetRot.x, targetRot.y, targetRot.z);

    // 2. Equip transition and audio
    if (isSilent) {
      this.reloadTilt.x = 0;
      this.reloadTilt.y = 0;
      this.reloadTilt.z = 0;
      this.reloadTilt.pitch = 0;
      this.reloadTilt.roll = 0;
      this.reloadTilt.yaw = 0;
    } else {
      // Smooth, subtle low-ready equip transition (no forward Z impulse, no overshooting)
      this.reloadTilt.x = 0;
      this.reloadTilt.y = isUSP ? -0.035 : (isShotgun ? -0.030 : (isMP5 ? -0.032 : -0.040));
      this.reloadTilt.z = 0;
      this.reloadTilt.pitch = isUSP ? -0.05 : (isShotgun ? -0.045 : (isMP5 ? -0.048 : -0.07));
      this.reloadTilt.roll = isUSP ? 0.03 : (isShotgun ? -0.03 : (isMP5 ? 0.025 : 0.04));
      this.reloadTilt.yaw = 0;

      const equipTween = new TWEEN.Tween(this.reloadTilt, true)
        .to({ roll: 0, pitch: 0, yaw: 0, y: 0, x: 0, z: 0 }, 190)
        .easing(TWEEN.Easing.Cubic.Out);
      this.reloadTweens.push(equipTween);
      equipTween.start();

      if (this.sound && typeof this.sound.playWeaponSwitch === 'function') {
        this.sound.playWeaponSwitch(weaponType);
      }
    }
  }

  /**
   * Explicitly triggers the weapon draw/equip animation and sound effect.
   * Called when clicking START on the main menu to enter gameplay.
   */
  playEquipAnimation(weaponType = this.currentWeapon) {
    if (this.isUnarmed) return;
    const isUSP = weaponType === 'hk_usp';
    const isShotgun = weaponType === 'shotgun';
    const isMP5 = weaponType === 'hk_mp5';

    this.reloadTweens.forEach((t) => t.stop());
    this.reloadTweens.length = 0;

    this.reloadTilt.x = 0;
    this.reloadTilt.y = isUSP ? -0.040 : (isShotgun ? -0.035 : (isMP5 ? -0.036 : -0.045));
    this.reloadTilt.z = 0;
    this.reloadTilt.pitch = isUSP ? -0.06 : (isShotgun ? -0.055 : (isMP5 ? -0.052 : -0.08));
    this.reloadTilt.roll = isUSP ? 0.035 : (isShotgun ? -0.035 : (isMP5 ? 0.028 : 0.045));
    this.reloadTilt.yaw = 0;

    const equipTween = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: 0, pitch: 0, yaw: 0, y: 0, x: 0, z: 0 }, 220)
      .easing(TWEEN.Easing.Cubic.Out);
    this.reloadTweens.push(equipTween);
    equipTween.start();

    // Snap root immediately to starting low-ready draw offset so exiting unarmed has zero 1-frame pop
    const targetPos = this.isADS ? this.adsPosition : this.hipPosition;
    const targetRot = this.isADS ? this.adsRotation : this.hipRotation;
    if (targetPos && targetRot) {
      this.root.position.set(
        targetPos.x + this.reloadTilt.x,
        targetPos.y + this.reloadTilt.y,
        targetPos.z + this.reloadTilt.z
      );
      this.root.rotation.set(
        targetRot.x + this.reloadTilt.pitch,
        targetRot.y + this.reloadTilt.yaw,
        targetRot.z + this.reloadTilt.roll
      );
    }

    if (this.sound && typeof this.sound.playWeaponSwitch === 'function') {
      this.sound.playWeaponSwitch(weaponType);
    }
  }

  setADS(enable) {
    if (window.isViewmodelTunerOpen && this.tunerForceADS !== null) {
      enable = this.tunerForceADS;
    }
    if (this.isADS !== enable) {
      this.isADS = enable;
      if (this.sound) {
        this.sound.playADSWhoosh(enable);
      }
    }
  }

  // ===========================================================================
  // MUZZLE FLASH RIG
  // ===========================================================================

  _buildMuzzleFlashRig() {
    this.muzzleFlashGroup = new THREE.Group();
    this.muzzleFlashGroup.name = 'MuzzleFlashRig';
    this.muzzleFlashGroup.visible = false;
    this.muzzleAnchor.add(this.muzzleFlashGroup);

    // Front-facing starburst disc
    const discGeo = new THREE.PlaneGeometry(0.15, 0.15);
    const discMesh = new THREE.Mesh(discGeo, this.muzzleFlashMaterial);
    discMesh.position.set(0, 0, -0.005);
    discMesh.frustumCulled = false;
    this.muzzleFlashGroup.add(discMesh);

    // Crossed lengthwise flame cones jutting forward
    const coneGeo = new THREE.PlaneGeometry(0.13, 0.17);
    coneGeo.translate(0, 0.085, 0);

    const coneH = new THREE.Mesh(coneGeo, this.muzzleFlashMaterial);
    coneH.rotation.x = -Math.PI / 2;
    coneH.frustumCulled = false;
    this.muzzleFlashGroup.add(coneH);

    const coneV = new THREE.Mesh(coneGeo, this.muzzleFlashMaterial);
    coneV.rotation.x = -Math.PI / 2;
    coneV.rotation.y = Math.PI / 2;
    coneV.frustumCulled = false;
    this.muzzleFlashGroup.add(coneV);
  }

  triggerMuzzleFlash() {
    if (!this.muzzleFlashGroup) return;
    this.muzzleFlashGroup.visible = true;
    this.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
    let baseScale = 0.88;
    if (this.currentWeapon === 'shotgun') baseScale = 1.25;
    else if (this.currentWeapon === 'colt_peacemaker') baseScale = 1.05;
    else if (this.currentWeapon === 'akms_gold') baseScale = 0.95;
    else if (this.currentWeapon === 'hk_usp' || this.currentWeapon === 'glock_flamengo') baseScale = 0.65;
    else if (this.currentWeapon === 'hk_mp5') baseScale = 0.70;
    const s = baseScale + Math.random() * 0.40;
    this.muzzleFlashGroup.scale.set(s, s, s);
    this.muzzleFlashMaterial.opacity = 1.0;
    this.flashTimer = 0.045;
  }

  // ===========================================================================
  // FIRING RECOIL & CYCLING
  // ===========================================================================

  setTriggerHeld(held) {
    this.isTriggerHeld = !!held;
  }

  applyRecoil() {
    if (this.currentWeapon === 'shotgun') {
      const recoilKick = this.isADS ? 0.082 : 0.135;
      const recoilPitch = this.isADS ? 0.115 : 0.235;
      const recoilYaw = (Math.random() - 0.5) * (this.isADS ? 0.014 : 0.032);
      const rollTorque = (Math.random() > 0.5 ? 1 : -1) * (this.isADS ? 0.024 : 0.052);

      this.posSpring.impulse(0, recoilKick * 0.26, recoilKick);
      this.rotSpring.impulse(recoilPitch, recoilYaw, rollTorque);

      if (this.shotgunTriggerMesh) this.shotgunTriggerMesh.rotation.x = 0.16;
      this.triggerMuzzleFlash();
      return;
    }

    if (this.currentWeapon === 'colt_peacemaker') {
      const recoilKick = this.isADS ? 0.072 : 0.125;
      const recoilZ = this.isADS ? 0.014 : 0.115;
      const recoilPitch = this.isADS ? 0.115 : 0.235;
      const recoilYaw = (Math.random() - 0.5) * (this.isADS ? 0.010 : 0.024);
      const rollTorque = (Math.random() > 0.5 ? 1 : -1) * (this.isADS ? 0.020 : 0.045);

      this.posSpring.impulse(0, recoilKick * 0.30, recoilZ);
      this.rotSpring.impulse(recoilPitch, recoilYaw, rollTorque);

      this.coltHammerRecoil = 0.45;
      if (this.coltCylinderMesh) {
        this.coltCylinderSpin = (this.coltCylinderSpin + Math.PI / 3) % (Math.PI * 2);
        this.coltCylinderMesh.rotation.z = this.coltCylinderSpin;
      }
      if (this.coltTriggerFinger) {
        this.coltTriggerFinger.squeeze = 1.0;
        this._applyTriggerFingerPose(this.coltTriggerFinger);
      }

      this.triggerMuzzleFlash();
      return;
    }

    if (this.currentWeapon === 'glock_flamengo') {
      const recoilKick = this.isADS ? 0.016 : 0.030;
      const recoilZ = this.isADS ? 0.004 : 0.022;
      const recoilPitch = this.isADS ? 0.024 : 0.048;
      const recoilYaw = (Math.random() - 0.5) * (this.isADS ? 0.005 : 0.011);
      const rollTorque = (Math.random() > 0.5 ? 1 : -1) * (this.isADS ? 0.006 : 0.014);

      this.posSpring.impulse(0, recoilKick * 0.22, recoilZ);
      this.rotSpring.impulse(recoilPitch, recoilYaw, rollTorque);

      this.glockSlideCycle = 0.0001;
      this.glockSlideCycleDuration = 0.050;
      this.glockSlideMaxStroke = this.isADS ? 0.068 : 0.088;
      this._glockShotJustTriggered = true;
      this.isTriggerHeld = true;

      this.triggerMuzzleFlash();
      return;
    }

    if (this.currentWeapon === 'akms_gold') {
      const recoilKick = this.isADS ? 0.034 : 0.068;
      const recoilZ = this.isADS ? 0.009 : 0.065;
      const recoilPitch = this.isADS ? 0.055 : 0.115;
      const recoilYaw = (Math.random() - 0.5) * (this.isADS ? 0.008 : 0.018);
      const rollTorque = (Math.random() > 0.5 ? 1 : -1) * (this.isADS ? 0.012 : 0.026);

      this.posSpring.impulse(0, recoilKick * 0.25, recoilZ);
      this.rotSpring.impulse(recoilPitch, recoilYaw, rollTorque);

      this.akmsBoltBlowback = 0.078;
      this.akmsBoltHold = 0.025;
      if (this.akmsBoltMesh && this.akmsBoltRestX !== undefined) {
        this.akmsBoltMesh.position.x = this.akmsBoltRestX - this.akmsBoltBlowback;
      }
      this.isTriggerHeld = true;

      this.triggerMuzzleFlash();
      return;
    }

    if (this.currentWeapon === 'hk_usp') {
      const recoilKick = this.isADS ? 0.040 : 0.075;
      const recoilZ = this.isADS ? 0.008 : 0.075;
      const recoilPitch = this.isADS ? 0.060 : 0.125;
      const recoilYaw = (Math.random() - 0.5) * (this.isADS ? 0.008 : 0.018);
      const rollTorque = (Math.random() > 0.5 ? 1 : -1) * (this.isADS ? 0.012 : 0.025);

      this.posSpring.impulse(0, recoilKick * 0.25, recoilZ);
      this.rotSpring.impulse(recoilPitch, recoilYaw, rollTorque);

      this.uspSlideBlowback = 0.024;
      this.uspHammerRecoil = 0.40;
      if (this.uspTriggerGroup) this.uspTriggerGroup.rotation.x = -0.18;
      if (this.uspTriggerFinger) {
        this.uspTriggerFinger.squeeze = 1.0;
        this._applyTriggerFingerPose(this.uspTriggerFinger);
      }

      this.triggerMuzzleFlash();
      return;
    }

    if (this.currentWeapon === 'hk_mp5') {
      const recoilKick = this.isADS ? 0.024 : 0.048;
      const recoilZ = this.isADS ? 0.006 : 0.045; // 50%+ reduction on ADS to prevent camera clipping
      const recoilPitch = this.isADS ? 0.038 : 0.075;
      const recoilYaw = (Math.random() - 0.5) * (this.isADS ? 0.006 : 0.014);
      const rollTorque = (Math.random() > 0.5 ? 1 : -1) * (this.isADS ? 0.008 : 0.018);

      this.posSpring.impulse(0, recoilKick * 0.22, recoilZ);
      this.rotSpring.impulse(recoilPitch, recoilYaw, rollTorque);

      this.mp5BoltBlowback = 0.032;
      this.isTriggerHeld = true;

      this.triggerMuzzleFlash();
      return;
    }

    const recoilKick = this.isADS ? 0.065 : 0.115;
    const recoilZ = this.isADS ? 0.012 : 0.115;
    const recoilPitch = this.isADS ? 0.095 : 0.200;
    const recoilYaw = (Math.random() - 0.5) * (this.isADS ? 0.010 : 0.025);
    const rollTorque = (Math.random() > 0.5 ? 1 : -1) * (this.isADS ? 0.018 : 0.040);

    this.posSpring.impulse(0, recoilKick * 0.28, recoilZ);
    this.rotSpring.impulse(recoilPitch, recoilYaw, rollTorque);

    // Slide Blowback kick
    this.slideBlowback = 0.036;
    this.hammerRecoil = 0.35;

    if (this.triggerMesh) this.triggerMesh.rotation.x = 0.15;
    if (this.pistolTriggerFinger) {
      this.pistolTriggerFinger.squeeze = 1.0;
      this._applyTriggerFingerPose(this.pistolTriggerFinger);
    }

    this.triggerMuzzleFlash();
  }

  _updateDesertEagleMagVisuals(dropY, isVisible = true) {
    if (this.deMagMeshes && this.deMagRestY) {
      this.deMagMeshes.forEach((mesh, idx) => {
        mesh.visible = isVisible;
        mesh.position.y = this.deMagRestY[idx] + dropY * 100;
      });
    }
  }

  _updateShotgunPumpVisuals(pumpZ) {
    this.shotgunPumpOffset = pumpZ;
    if (this.shotgunPumpGroup) {
      this.shotgunPumpGroup.position.z = pumpZ;
    }
    if (this.shotgunBoltGroup) {
      this.shotgunBoltGroup.position.z = pumpZ;
    }

    // In RootNode, pump and rods translate along -X when pumped backward.
    // Scale conversion: 1 meter = 1 / (0.89 * 0.01) = 112.35955 units in RootNode.
    const deltaX = pumpZ * 112.35955;
    const boltDeltaX = deltaX * 0.45;
    if (this.shotgunPumpMesh && this.shotgunPumpRestX !== undefined) {
      this.shotgunPumpMesh.position.x = this.shotgunPumpRestX - deltaX;
    }
    if (this.shotgunPumpRodsMesh && this.shotgunPumpRodsRestX !== undefined) {
      this.shotgunPumpRodsMesh.position.x = this.shotgunPumpRodsRestX - deltaX;
    }
    if (this.shotgunSlideLRodsMesh && this.shotgunSlideLRodsRestX !== undefined) {
      this.shotgunSlideLRodsMesh.position.x = this.shotgunSlideLRodsRestX - boltDeltaX;
    }
    if (this.shotgunBoltMesh && this.shotgunBoltRestX !== undefined) {
      this.shotgunBoltMesh.position.x = this.shotgunBoltRestX - boltDeltaX;
    }
  }

  startShotgunPumpAnimation(options = {}) {
    const { onEjectShell, onComplete } = options;
    if (this.currentWeapon !== 'shotgun') return;

    this.isPumping = true;
    const pumpState = { z: 0 };

    const delayTimer = setTimeout(() => {
      if (this.currentWeapon !== 'shotgun') return;

      if (this.sound && typeof this.sound.playShotgunPump === 'function') {
        this.sound.playShotgunPump();
      }

      // Rearward stroke: 0 -> 0.038m over 110ms
      this.posSpring.impulse(0, -0.012, 0.032);
      this.rotSpring.impulse(0.035, 0.012, -0.035);

      const pullBack = new TWEEN.Tween(pumpState, true)
        .to({ z: 0.038 }, 110)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          this._updateShotgunPumpVisuals(pumpState.z);
        })
        .onComplete(() => {
          if (typeof onEjectShell === 'function') onEjectShell();

          // Forward stroke: 0.038m -> 0 over 105ms
          this.posSpring.impulse(0, 0.010, -0.038);
          this.rotSpring.impulse(-0.045, -0.010, 0.030);

          const pushFwd = new TWEEN.Tween(pumpState, true)
            .to({ z: 0 }, 105)
            .easing(TWEEN.Easing.Back.Out)
            .onUpdate(() => {
              this._updateShotgunPumpVisuals(pumpState.z);
            })
            .onComplete(() => {
              this._updateShotgunPumpVisuals(0);
              this.isPumping = false;
              if (typeof onComplete === 'function') onComplete();
            });
          this.reloadTweens.push(pushFwd);
          pushFwd.start();
        });
      this.reloadTweens.push(pullBack);
      pullBack.start();
    }, 150);

    this.reloadTimers.push(delayTimer);
  }

  applyMouseSway(deltaX, deltaY) {
    const swayAmount = this.isADS ? 0.0003 : 0.0008;
    this.rotSpring.impulse(
      deltaY * -swayAmount * 1.5,
      deltaX * -swayAmount * 1.5,
      deltaX * -swayAmount * 2.0
    );
  }

  update(delta, playerVelocity, isGrounded) {
    if (this.isUnarmed) {
      const breathScale = window.isViewmodelTunerOpen ? 0 : 1;
      this.unarmedIdlePhase += delta * 2.1;
      const breathX = Math.cos(this.unarmedIdlePhase * 0.5) * 0.0018 * breathScale;
      const breathY = Math.sin(this.unarmedIdlePhase) * 0.0032 * breathScale;
      const breathPitch = Math.sin(this.unarmedIdlePhase) * 0.009 * breathScale;

      const horizSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);
      if (isGrounded && horizSpeed > 0.5) {
        const bobFreq = horizSpeed > 7.0 ? 11.0 : 8.5;
        this.bobCycle += bobFreq * delta;
        const bobAmp = horizSpeed > 7.0 ? 0.0090 : 0.0058;
        const bobX = Math.cos(this.bobCycle) * bobAmp;
        const bobY = Math.sin(this.bobCycle * 2) * (bobAmp * 0.78);
        this.bobSpring.setTarget(bobX, bobY, 0);
      } else {
        this.bobSpring.setTarget(0, 0, 0);
      }

      this.posSpring.setTarget(
        this.unarmedHipPosition.x,
        this.unarmedHipPosition.y,
        this.unarmedHipPosition.z
      );
      this.rotSpring.setTarget(
        this.unarmedHipRotation.x + breathPitch,
        this.unarmedHipRotation.y,
        this.unarmedHipRotation.z
      );

      const pos = this.posSpring.update(delta);
      const rot = this.rotSpring.update(delta);
      const bob = this.bobSpring.update(delta);

      this.root.position.set(pos.x + bob.x + breathX, pos.y + bob.y + breathY, pos.z + bob.z);
      this.root.rotation.set(rot.x, rot.y, rot.z);
      return;
    }

    if (window.isViewmodelTunerOpen && this.tunerForceADS !== null) {
      this.isADS = this.tunerForceADS;
    }

    // 1. ADS Interpolation
    const targetPos = this.isADS ? this.adsPosition : this.hipPosition;
    const targetRot = this.isADS ? this.adsRotation : this.hipRotation;

    this.posSpring.setTarget(
      targetPos.x,
      targetPos.y + this.reloadTilt.y,
      targetPos.z
    );
    this.rotSpring.setTarget(
      targetRot.x + this.reloadTilt.pitch,
      targetRot.y + this.reloadTilt.yaw,
      targetRot.z + this.reloadTilt.roll
    );

    // 2. Slide Blowback & Reciprocation
    if (this.currentWeapon === 'glock_flamengo') {
      if (this.glockSlideCycle > 0) {
        if (this._glockShotJustTriggered) {
          this._glockShotJustTriggered = false;
          this.glockSlideCycle = 0.24;
        } else {
          this.glockSlideCycle += delta / (this.glockSlideCycleDuration || 0.052);
        }

        if (this.glockSlideCycle >= 1.0) {
          this.glockSlideCycle = 0;
          this.glockSlideBlowback = 0;
        } else {
          this.glockSlideBlowback = Math.sin(this.glockSlideCycle * Math.PI) * (this.glockSlideMaxStroke || 0.088);
        }

        const d = this.glockSlideBlowback;
        // Translate strictly along the Glock frame rail slope (dy = +d, dz = +0.0562 * d)
        if (this.glockSlideMesh && this.glockSlideRestY !== undefined) {
          this.glockSlideMesh.position.y = this.glockSlideRestY + d;
          this.glockSlideMesh.position.z = this.glockSlideRestZ + d * 0.0562;
        }
        if (this.glockSelectorMesh && this.glockSelectorRestY !== undefined) {
          this.glockSelectorMesh.position.y = this.glockSelectorRestY + d;
          this.glockSelectorMesh.position.z = this.glockSelectorRestZ + d * 0.0562;
        }
      } else {
        if (this.glockSlideMesh && this.glockSlideRestY !== undefined && this.glockSlideMesh.position.y !== this.glockSlideRestY) {
          this.glockSlideMesh.position.y = this.glockSlideRestY;
          this.glockSlideMesh.position.z = this.glockSlideRestZ;
        }
        if (this.glockSelectorMesh && this.glockSelectorRestY !== undefined && this.glockSelectorMesh.position.y !== this.glockSelectorRestY) {
          this.glockSelectorMesh.position.y = this.glockSelectorRestY;
          this.glockSelectorMesh.position.z = this.glockSelectorRestZ;
        }
      }
    } else if (this.currentWeapon === 'colt_peacemaker') {
      if (this.coltHammerRecoil > 0.001) {
        this.coltHammerRecoil = THREE.MathUtils.lerp(this.coltHammerRecoil, 0, Math.min(delta * 20.0, 1.0));
      }
    } else if (this.currentWeapon === 'akms_gold') {
      if (!this.isReloading) {
        if (this.akmsBoltHold > 0) {
          this.akmsBoltHold = Math.max(0, this.akmsBoltHold - Math.min(delta, 0.033));
          if (this.akmsBoltMesh && this.akmsBoltRestX !== undefined) {
            this.akmsBoltMesh.position.x = this.akmsBoltRestX - this.akmsBoltBlowback;
          }
        } else if (this.akmsBoltBlowback > 0.0005) {
          const dt = Math.min(delta, 0.033);
          this.akmsBoltBlowback *= Math.exp(-38.0 * dt);
          if (this.akmsBoltBlowback <= 0.0005) this.akmsBoltBlowback = 0;
          if (this.akmsBoltMesh && this.akmsBoltRestX !== undefined) {
            this.akmsBoltMesh.position.x = this.akmsBoltRestX - this.akmsBoltBlowback;
          }
        } else if (this.akmsBoltMesh && this.akmsBoltRestX !== undefined && this.akmsBoltMesh.position.x !== this.akmsBoltRestX) {
          this.akmsBoltMesh.position.x = this.akmsBoltRestX;
        }
      }
    } else if (this.currentWeapon === 'hk_mp5') {
      if (!this.isReloading) {
        if (this.mp5BoltBlowback > 0.0005) {
          this.mp5BoltBlowback = THREE.MathUtils.lerp(this.mp5BoltBlowback, 0, Math.min(delta * 38.0, 1.0));
          if (this.mp5BoltMesh && this.mp5BoltRestZ !== undefined) {
            this.mp5BoltMesh.position.z = this.mp5BoltRestZ + this.mp5BoltBlowback * 1000;
          }
        } else if (this.mp5BoltMesh && this.mp5BoltRestZ !== undefined && this.mp5BoltMesh.position.z !== this.mp5BoltRestZ) {
          this.mp5BoltMesh.position.z = this.mp5BoltRestZ;
        }
      }
    } else if (this.currentWeapon === 'hk_usp') {
      if (this.isSlideLocked) {
        if (this.uspSlideGroup) {
          this.uspSlideGroup.position.z = 0.024;
        }
        if (this.uspHammerGroup) {
          this.uspHammerGroup.rotation.x = 0.40;
        }
      } else {
        if (this.uspSlideBlowback > 0.0005) {
          this.uspSlideBlowback = THREE.MathUtils.lerp(this.uspSlideBlowback, 0, Math.min(delta * 28.0, 1.0));
          if (this.uspSlideGroup) {
            this.uspSlideGroup.position.z = this.uspSlideBlowback;
          }
        } else if (this.uspSlideGroup && this.uspSlideGroup.position.z !== 0) {
          this.uspSlideGroup.position.z = 0;
        }

        if (this.uspHammerRecoil > 0.001) {
          this.uspHammerRecoil = THREE.MathUtils.lerp(this.uspHammerRecoil, 0, Math.min(delta * 24.0, 1.0));
          if (this.uspHammerGroup) {
            this.uspHammerGroup.rotation.x = this.uspHammerRecoil;
          }
        } else if (this.uspHammerGroup && this.uspHammerGroup.rotation.x !== 0) {
          this.uspHammerGroup.rotation.x = 0;
        }
      }
    } else if (this.isSlideLocked) {
      this.slideGroup.position.z = 0.036;
      if (this.pistolSlideMesh && this.deSlideRestZ !== undefined) {
        this.pistolSlideMesh.position.z = this.deSlideRestZ - 3.6;
      }
      if (this.hammerGroup) this.hammerGroup.rotation.x = this.hammerRestAngle + 0.35;
    } else {
      if (this.slideBlowback > 0.0001) {
        this.slideBlowback = THREE.MathUtils.lerp(this.slideBlowback, 0, Math.min(delta * 24.0, 1.0));
        this.slideGroup.position.z = this.slideBlowback;
        if (this.pistolSlideMesh && this.deSlideRestZ !== undefined) {
          this.pistolSlideMesh.position.z = this.deSlideRestZ - this.slideBlowback * 100;
        }
      } else {
        if (this.slideGroup.position.z !== 0) this.slideGroup.position.z = 0;
        if (this.pistolSlideMesh && this.deSlideRestZ !== undefined && this.pistolSlideMesh.position.z !== this.deSlideRestZ) {
          this.pistolSlideMesh.position.z = this.deSlideRestZ;
        }
      }

      if (this.hammerRecoil > 0.001) {
        this.hammerRecoil = THREE.MathUtils.lerp(this.hammerRecoil, 0, Math.min(delta * 24.0, 1.0));
        if (this.hammerGroup) this.hammerGroup.rotation.x = this.hammerRestAngle + this.hammerRecoil;
      } else if (this.hammerGroup && this.hammerGroup.rotation.x !== this.hammerRestAngle) {
        this.hammerGroup.rotation.x = this.hammerRestAngle;
      }
    }

    // 3. Smooth trigger squeeze & release (Full-Auto weapons lock/hold the trigger down while firing!)
    const isFullAutoHeld =
      this.isTriggerHeld &&
      !this.isReloading &&
      (this.currentWeapon === 'glock_flamengo' || this.currentWeapon === 'hk_mp5' || this.currentWeapon === 'akms_gold');

    if (this.triggerMesh && this.triggerMesh.rotation.x > 0.001) {
      this.triggerMesh.rotation.x = THREE.MathUtils.lerp(this.triggerMesh.rotation.x, 0, Math.min(delta * 20.0, 1.0));
    }
    if (this.shotgunTriggerMesh && this.shotgunTriggerMesh.rotation.x > 0.001) {
      this.shotgunTriggerMesh.rotation.x = THREE.MathUtils.lerp(this.shotgunTriggerMesh.rotation.x, 0, Math.min(delta * 20.0, 1.0));
    }
    if (this.uspTriggerGroup && this.uspTriggerGroup.rotation.x < -0.001) {
      this.uspTriggerGroup.rotation.x = THREE.MathUtils.lerp(this.uspTriggerGroup.rotation.x, 0, Math.min(delta * 20.0, 1.0));
    }
    for (const tf of [this.pistolTriggerFinger, this.uspTriggerFinger, this.coltTriggerFinger]) {
      if (tf && tf.squeeze > 0.001) {
        tf.squeeze = THREE.MathUtils.lerp(tf.squeeze, 0, Math.min(delta * 18.0, 1.0));
        if (tf.squeeze <= 0.001) tf.squeeze = 0;
        this._applyTriggerFingerPose(tf);
      }
    }

    // Full-Auto Trigger Lock for MP5 and Glock
    const mp5Held = isFullAutoHeld && this.currentWeapon === 'hk_mp5';
    if (this.mp5TriggerMesh) {
      const targetRot = mp5Held ? 0.16 : 0;
      if (Math.abs(this.mp5TriggerMesh.rotation.x - targetRot) > 0.001) {
        this.mp5TriggerMesh.rotation.x = THREE.MathUtils.lerp(this.mp5TriggerMesh.rotation.x, targetRot, Math.min(delta * 24.0, 1.0));
      } else {
        this.mp5TriggerMesh.rotation.x = targetRot;
      }
    }

    const glockHeld = isFullAutoHeld && this.currentWeapon === 'glock_flamengo';
    if (this.glockTriggerMesh) {
      const targetZ = glockHeld ? -0.045 : 0;
      if (Math.abs(this.glockTriggerMesh.position.z - targetZ) > 0.0005) {
        this.glockTriggerMesh.position.z = THREE.MathUtils.lerp(this.glockTriggerMesh.position.z, targetZ, Math.min(delta * 26.0, 1.0));
      } else {
        this.glockTriggerMesh.position.z = targetZ;
      }
    }

    // Only Glock renders a right trigger arm; MP5 and AKMS render only the left support arm.
    const fullAutoFingers = [
      [this.glockTriggerFinger, glockHeld, 26.0],
    ];
    for (const [tf, held, speed] of fullAutoFingers) {
      if (!tf) continue;
      const targetSqueeze = held ? 1.0 : 0.0;
      if (Math.abs(tf.squeeze - targetSqueeze) > 0.002) {
        tf.squeeze = THREE.MathUtils.lerp(tf.squeeze, targetSqueeze, Math.min(delta * speed, 1.0));
        this._applyTriggerFingerPose(tf);
      } else if (tf.squeeze !== targetSqueeze) {
        tf.squeeze = targetSqueeze;
        this._applyTriggerFingerPose(tf);
      }
    }

    // 4. Muzzle flash fade
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.muzzleFlashGroup.visible = false;
      } else {
        this.muzzleFlashMaterial.opacity = Math.max(0, this.flashTimer / 0.045);
      }
    }

    // 5. Walking Bob
    const horizSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);
    if (isGrounded && horizSpeed > 0.5) {
      const bobFreq = this.isADS ? 6.0 : (horizSpeed > 7.0 ? 11.0 : 8.5);
      this.bobCycle += bobFreq * delta;
      const bobAmp = this.isADS ? 0.0016 : 0.0060;
      const bobX = Math.cos(this.bobCycle) * bobAmp;
      const bobY = Math.sin(this.bobCycle * 2) * (bobAmp * 0.8);
      this.bobSpring.setTarget(bobX, bobY, 0);
    } else {
      this.bobSpring.setTarget(0, 0, 0);
    }

    // 6. Integrate Springs
    const pos = this.posSpring.update(delta);
    const rot = this.rotSpring.update(delta);
    const bob = this.bobSpring.update(delta);

    this.root.position.set(pos.x + bob.x, pos.y + bob.y, pos.z + bob.z);
    this.root.rotation.set(rot.x, rot.y, rot.z);

    // 7. Update sockets
    const activeMuzzle = this._getActiveMuzzleSocket();
    const activeEjection = this._getActiveEjectionAnchor();
    activeMuzzle.updateWorldMatrix(true, false);
    activeMuzzle.getWorldPosition(this.muzzleWorldPos);
    activeEjection.updateWorldMatrix(true, false);
    activeEjection.getWorldPosition(this.ejectionWorldPos);
  }

  _getActiveMuzzleSocket() {
    if (this.currentWeapon === 'hk_usp') return this.uspMuzzleSocket;
    if (this.currentWeapon === 'shotgun') return this.shotgunMuzzleSocket;
    if (this.currentWeapon === 'hk_mp5') return this.mp5MuzzleSocket;
    if (this.currentWeapon === 'colt_peacemaker') return this.coltMuzzleSocket;
    if (this.currentWeapon === 'glock_flamengo') return this.glockMuzzleSocket;
    if (this.currentWeapon === 'akms_gold') return this.akmsMuzzleSocket;
    return this.muzzleSocket;
  }

  _getActiveEjectionAnchor() {
    if (this.currentWeapon === 'hk_usp') return this.uspEjectionAnchor;
    if (this.currentWeapon === 'shotgun') return this.shotgunEjectionAnchor;
    if (this.currentWeapon === 'hk_mp5') return this.mp5EjectionAnchor;
    if (this.currentWeapon === 'colt_peacemaker') return this.coltEjectionAnchor;
    if (this.currentWeapon === 'glock_flamengo') return this.glockEjectionAnchor;
    if (this.currentWeapon === 'akms_gold') return this.akmsEjectionAnchor;
    return this.ejectionAnchor;
  }

  getMuzzleWorldPosition(targetVec) {
    const out = targetVec || this.muzzleWorldPos;
    const activeMuzzle = this._getActiveMuzzleSocket();
    activeMuzzle.updateWorldMatrix(true, false);
    return activeMuzzle.getWorldPosition(out);
  }

  getEjectionWorldPosition(targetVec) {
    const out = targetVec || this.ejectionWorldPos;
    const activeEjection = this._getActiveEjectionAnchor();
    activeEjection.updateWorldMatrix(true, false);
    return activeEjection.getWorldPosition(out);
  }

  setSlideLocked(locked) {
    this.isSlideLocked = locked;
    if (this.currentWeapon === 'hk_usp') {
      if (this.uspSlideGroup) {
        this.uspSlideGroup.position.z = locked ? 0.024 : 0;
      }
      if (this.uspHammerGroup) {
        this.uspHammerGroup.rotation.x = locked ? 0.40 : 0;
      }
      return;
    }
    if (this.currentWeapon === 'desert_eagle' || this.currentWeapon === 'pistol') {
      if (locked) {
        this.slideBlowback = 0.036;
        this.slideGroup.position.z = 0.036;
        if (this.pistolSlideMesh && this.deSlideRestZ !== undefined) {
          this.pistolSlideMesh.position.z = this.deSlideRestZ - 3.6;
        }
      } else {
        this.slideBlowback = 0;
        this.slideGroup.position.z = 0;
        if (this.pistolSlideMesh && this.deSlideRestZ !== undefined) {
          this.pistolSlideMesh.position.z = this.deSlideRestZ;
        }
      }
      return;
    }
  }

  playDryFireTwitch() {
    this.rotSpring.impulse(-0.015, 0.008, -0.012);
  }

  // ===========================================================================
  // RELOAD ANIMATIONS
  // ===========================================================================

  startReloadAnimation(options = {}) {
    const { onComplete, shellsToLoad, onShellInserted } = options;

    this._clearReloadTimersAndTweens();

    this.isReloading = true;

    if (this.currentWeapon === 'hk_usp') {
      this._startUSPReloadAnimation(onComplete);
      return;
    }

    if (this.currentWeapon === 'hk_mp5') {
      this._startMP5ReloadAnimation(onComplete);
      return;
    }

    if (this.currentWeapon === 'shotgun') {
      this._startShotgunReloadAnimation(shellsToLoad, onShellInserted, onComplete);
      return;
    }

    if (this.currentWeapon === 'colt_peacemaker') {
      this._startColtReloadAnimation(onComplete);
      return;
    }

    if (this.currentWeapon === 'glock_flamengo') {
      this._startGlockReloadAnimation(onComplete);
      return;
    }

    if (this.currentWeapon === 'akms_gold') {
      this._startAkmsReloadAnimation(onComplete);
      return;
    }

    // Reset magGroup position
    if (this.magGroup) {
      this.magGroup.position.set(0, 0, 0);
      this.magGroup.visible = true;
    }
    this._updateDesertEagleMagVisuals(0, true);

    // Authentic reload sound (9mm_reload.mp3 pitched to 0.90x) or procedural fallback
    if (this.sound && typeof this.sound.playReloadSound === 'function') {
      this.sound.playReloadSound('desert_eagle');
    } else if (this.sound) {
      this.sound.playMagOut();
    }

    // STAGE 1 — Tilt & Mag Eject (0.00s to 0.35s)
    const tiltIn = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: 0.38, pitch: 0.16, yaw: 0.12, y: -0.02 }, 350)
      .easing(TWEEN.Easing.Cubic.Out);
    this.reloadTweens.push(tiltIn);
    tiltIn.start();

    if (this.magGroup) {
      const magDrop = new TWEEN.Tween(this.magGroup.position, true)
        .to({ y: -0.22 }, 320)
        .easing(TWEEN.Easing.Quadratic.In)
        .onUpdate(() => {
          this._updateDesertEagleMagVisuals(this.magGroup.position.y, true);
        })
        .onComplete(() => {
          this.magGroup.visible = false;
          this._updateDesertEagleMagVisuals(this.magGroup.position.y, false);
        });
      this.reloadTweens.push(magDrop);
      magDrop.start();
    }

    // STAGE 2 — Fresh Mag Insert & Seating Slap (seating at ~0.67s to match 9mm_reload.mp3 at 0.90x)
    const stage2Timer = setTimeout(() => {
      if (!this.isReloading) return;

      if (this.magGroup) {
        this.magGroup.position.set(0, -0.22, 0);
        this.magGroup.visible = true;
        this._updateDesertEagleMagVisuals(-0.22, true);

        const magInsert = new TWEEN.Tween(this.magGroup.position, true)
          .to({ y: 0 }, 320)
          .easing(TWEEN.Easing.Back.Out)
          .onUpdate(() => {
            this._updateDesertEagleMagVisuals(this.magGroup.position.y, true);
          })
          .onComplete(() => {
            this.magGroup.position.set(0, 0, 0);
            this._updateDesertEagleMagVisuals(0, true);
            this.posSpring.impulse(0, 0.065, 0);
            this.rotSpring.impulse(0.020, 0, 0.040);
            if (this.sound) this.sound.playMagIn();
          });
        this.reloadTweens.push(magInsert);
        magInsert.start();
      }
    }, 350);
    this.reloadTimers.push(stage2Timer);

    // STAGE 3 — Slide Release Slam & Return to Ready (slide release at 1.78s matching 9mm_reload.mp3 rack at 0.90x)
    const stage3Timer = setTimeout(() => {
      if (!this.isReloading) return;

      this.isSlideLocked = false;
      this.slideBlowback = 0;
      this.slideGroup.position.z = 0;
      if (this.pistolSlideMesh && this.deSlideRestZ !== undefined) {
        this.pistolSlideMesh.position.z = this.deSlideRestZ;
      }

      this.posSpring.impulse(0, -0.015, -0.040);
      this.rotSpring.impulse(-0.065, 0, -0.025);
      if (this.sound) this.sound.playSlideRelease();

      const tiltOut = new TWEEN.Tween(this.reloadTilt, true)
        .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, 350)
        .easing(TWEEN.Easing.Cubic.Out)
        .onComplete(() => {
          this.isReloading = false;
          this.isSlideLocked = false;
          this.slideBlowback = 0;
          this.slideGroup.position.z = 0;
          if (this.pistolSlideMesh && this.deSlideRestZ !== undefined) {
            this.pistolSlideMesh.position.z = this.deSlideRestZ;
          }
          if (typeof onComplete === 'function') onComplete();
        });
      this.reloadTweens.push(tiltOut);
      tiltOut.start();
    }, 1780);
    this.reloadTimers.push(stage3Timer);
  }

  _startShotgunReloadAnimation(shellsToLoad = 4, onShellInserted, onComplete) {
    const count = Math.max(1, Math.min(6, shellsToLoad));
    const tiltInMs = 220;
    const perShellMs = 220;

    const tiltIn = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: 0.46, pitch: 0.20, yaw: 0.22, y: -0.015 }, tiltInMs)
      .easing(TWEEN.Easing.Cubic.Out);
    this.reloadTweens.push(tiltIn);
    tiltIn.start();

    if (this.shotgunLeftHandGroup) {
      const handToGatePos = new TWEEN.Tween(this.shotgunLeftHandGroup.position, true)
        .to({ x: 0.016, y: -0.045, z: 0.172 }, tiltInMs)
        .easing(TWEEN.Easing.Cubic.Out);
      const handToGateRot = new TWEEN.Tween(this.shotgunLeftHandGroup.rotation, true)
        .to({ x: -0.26, y: 0.08, z: -0.22 }, tiltInMs)
        .easing(TWEEN.Easing.Cubic.Out);
      this.reloadTweens.push(handToGatePos, handToGateRot);
      handToGatePos.start();
      handToGateRot.start();
    }

    for (let i = 0; i < count; i++) {
      const shellStartDelay = tiltInMs + i * perShellMs;
      const shellTimer = setTimeout(() => {
        if (!this.isReloading || this.currentWeapon !== 'shotgun') return;

        if (this.shotgunLeftHandGroup) {
          this.shotgunLeftHandGroup.position.set(0.018, -0.052, 0.184);
          this.shotgunLeftHandGroup.rotation.set(-0.34, 0.08, -0.24);

          const handPushUp = new TWEEN.Tween(this.shotgunLeftHandGroup.position, true)
            .to({ x: 0.012, y: -0.018, z: 0.150 }, 140)
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(() => {
              if (!this.isReloading || !this.shotgunLeftHandGroup) return;
              if (i < count - 1) {
                const handDipBack = new TWEEN.Tween(this.shotgunLeftHandGroup.position, true)
                  .to({ x: 0.018, y: -0.050, z: 0.180 }, 70)
                  .easing(TWEEN.Easing.Quadratic.In);
                this.reloadTweens.push(handDipBack);
                handDipBack.start();
              } else {
                const handReturnPos = new TWEEN.Tween(this.shotgunLeftHandGroup.position, true)
                  .to({ x: 0, y: 0, z: 0 }, 110)
                  .easing(TWEEN.Easing.Cubic.InOut);
                const handReturnRot = new TWEEN.Tween(this.shotgunLeftHandGroup.rotation, true)
                  .to({ x: 0, y: 0, z: 0 }, 110)
                  .easing(TWEEN.Easing.Cubic.InOut);
                this.reloadTweens.push(handReturnPos, handReturnRot);
                handReturnPos.start();
                handReturnRot.start();
              }
            });
          this.reloadTweens.push(handPushUp);
          handPushUp.start();
        }

        if (this.shotgunReloadShell) {
          this.shotgunReloadShell.visible = true;
          this.shotgunReloadShell.position.set(0.008, -0.055, 0.028);
          this.shotgunReloadShell.rotation.set(-0.38, 0, 0);

          const shellInsert = new TWEEN.Tween(this.shotgunReloadShell.position, true)
            .to({ x: 0, y: -0.004, z: -0.032 }, 165)
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(() => {
              if (this.shotgunReloadShell) this.shotgunReloadShell.visible = false;
            });
          this.reloadTweens.push(shellInsert);
          shellInsert.start();
        }

        if (this.shotgunCarrierGroup) {
          this.shotgunCarrierGroup.rotation.x = -0.26;
          const carrierTween = new TWEEN.Tween(this.shotgunCarrierGroup.rotation, true)
            .to({ x: 0 }, 160)
            .easing(TWEEN.Easing.Quadratic.Out);
          this.reloadTweens.push(carrierTween);
          carrierTween.start();
        }

        this.posSpring.impulse(0, 0.032, -0.014);
        this.rotSpring.impulse(0.032, 0, 0.026);

        if (this.sound && typeof this.sound.playShotgunShellInsert === 'function') {
          this.sound.playShotgunShellInsert();
        }

        if (typeof onShellInserted === 'function') {
          onShellInserted(i + 1);
        }
      }, shellStartDelay);
      this.reloadTimers.push(shellTimer);
    }

    const totalDuration = tiltInMs + count * perShellMs + 100;
    const finishTimer = setTimeout(() => {
      if (!this.isReloading || this.currentWeapon !== 'shotgun') return;

      if (this.shotgunReloadShell) this.shotgunReloadShell.visible = false;
      if (this.shotgunLeftHandGroup) {
        this.shotgunLeftHandGroup.position.set(0, 0, 0);
        this.shotgunLeftHandGroup.rotation.set(0, 0, 0);
      }

      if (this.sound && typeof this.sound.playShotgunPump === 'function') {
        this.sound.playShotgunPump();
      }

      const pumpObj = { z: 0 };
      const pumpStroke = new TWEEN.Tween(pumpObj, true)
        .to({ z: 0.038 }, 110)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          this._updateShotgunPumpVisuals(pumpObj.z);
        })
        .onComplete(() => {
          this.posSpring.impulse(0, -0.015, -0.035);
          this.rotSpring.impulse(-0.045, 0, 0.030);

          const pumpReturn = new TWEEN.Tween(pumpObj, true)
            .to({ z: 0 }, 105)
            .easing(TWEEN.Easing.Back.Out)
            .onUpdate(() => {
              this._updateShotgunPumpVisuals(pumpObj.z);
            })
            .onComplete(() => {
              this._updateShotgunPumpVisuals(0);
            });
          this.reloadTweens.push(pumpReturn);
          pumpReturn.start();
        });
      this.reloadTweens.push(pumpStroke);
      pumpStroke.start();

      const tiltOut = new TWEEN.Tween(this.reloadTilt, true)
        .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, 240)
        .easing(TWEEN.Easing.Cubic.Out)
        .onComplete(() => {
          this.isReloading = false;
          this._updateShotgunPumpVisuals(0);
          if (this.shotgunCarrierGroup) this.shotgunCarrierGroup.rotation.x = 0;
          if (this.shotgunReloadShell) this.shotgunReloadShell.visible = false;
          if (this.shotgunLeftHandGroup) {
            this.shotgunLeftHandGroup.position.set(0, 0, 0);
            this.shotgunLeftHandGroup.rotation.set(0, 0, 0);
          }
          this.reloadTilt.roll = 0;
          this.reloadTilt.pitch = 0;
          this.reloadTilt.yaw = 0;
          this.reloadTilt.y = 0;
          if (typeof onComplete === 'function') onComplete();
        });
      this.reloadTweens.push(tiltOut);
      tiltOut.start();
    }, totalDuration);

    this.reloadTimers.push(finishTimer);
  }

  _startUSPReloadAnimation(onComplete) {
    // Fast, snappy H&K USP tactical reload (~0.85s slide release)
    if (this.sound && typeof this.sound.playReloadSound === 'function') {
      this.sound.playReloadSound('hk_usp');
    } else if (this.sound) {
      this.sound.playMagOut();
    }

    if (this.uspMagGroup) {
      this.uspMagGroup.visible = true;
      this.uspMagGroup.position.set(0, 0, 0);
    }

    // STAGE 1: Tilt weapon inward and down slightly (0 to 220ms)
    const tiltIn = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: 0.32, pitch: 0.12, yaw: 0.08, y: -0.015 }, 220)
      .easing(TWEEN.Easing.Cubic.Out);
    this.reloadTweens.push(tiltIn);
    tiltIn.start();

    // STAGE 2: Magazine slides out along grip angle at 220ms
    const magDropTimer = setTimeout(() => {
      if (!this.isReloading || this.currentWeapon !== 'hk_usp') return;
      if (this.uspMagGroup) {
        const drop = new TWEEN.Tween(this.uspMagGroup.position, true)
          .to({ y: -0.14, z: 0.035 }, 180)
          .easing(TWEEN.Easing.Quadratic.In)
          .onComplete(() => {
            if (this.uspMagGroup) this.uspMagGroup.visible = false;
          });
        this.reloadTweens.push(drop);
        drop.start();
      }

      // STAGE 3: Fresh magazine inserted at 440ms
      const magInTimer = setTimeout(() => {
        if (!this.isReloading || this.currentWeapon !== 'hk_usp') return;
        if (this.uspMagGroup) {
          this.uspMagGroup.visible = true;
          this.uspMagGroup.position.set(0, -0.14, 0.035);
          const insert = new TWEEN.Tween(this.uspMagGroup.position, true)
            .to({ y: 0, z: 0 }, 180)
            .easing(TWEEN.Easing.Back.Out)
            .onComplete(() => {
              this.posSpring.impulse(0, 0.045, 0);
              this.rotSpring.impulse(0.015, 0, 0.030);
              if (this.sound) this.sound.playMagIn();
            });
          this.reloadTweens.push(insert);
          insert.start();
        }

        // STAGE 4: Slide release snapping forward into battery at 720ms
        const rackTimer = setTimeout(() => {
          if (!this.isReloading || this.currentWeapon !== 'hk_usp') return;
          this.setSlideLocked(false);
          if (this.uspSlideGroup) this.uspSlideGroup.position.z = 0;
          this.posSpring.impulse(0, -0.010, -0.030);
          this.rotSpring.impulse(-0.045, 0, -0.020);
          if (this.sound && typeof this.sound.play9mmSlideRack === 'function') {
            this.sound.play9mmSlideRack();
          } else if (this.sound) {
            this.sound.playSlideRelease();
          }

          // STAGE 5: Return to ready pose
          const tiltOut = new TWEEN.Tween(this.reloadTilt, true)
            .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, 180)
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(() => {
              this.isReloading = false;
              this.setSlideLocked(false);
              if (this.uspMagGroup) {
                this.uspMagGroup.visible = true;
                this.uspMagGroup.position.set(0, 0, 0);
              }
              if (typeof onComplete === 'function') onComplete();
            });
          this.reloadTweens.push(tiltOut);
          tiltOut.start();
        }, 280);
        this.reloadTimers.push(rackTimer);
      }, 220);
      this.reloadTimers.push(magInTimer);
    }, 220);
    this.reloadTimers.push(magDropTimer);
  }
  _startMP5ReloadAnimation(onComplete) {
    // Fast, snappy submachine gun tactical reload (~1.38s total cycle)
    if (this.sound && typeof this.sound.playReloadSound === 'function') {
      this.sound.playReloadSound('hk_mp5');
    } else if (this.sound) {
      this.sound.playMagOut();
    }

    if (this.mp5MagMesh) {
      this.mp5MagMesh.visible = true;
      this.mp5MagMesh.position.y = this.mp5MagRestY;
      this.mp5MagMesh.position.z = this.mp5MagRestZ;
    }

    // STAGE 1: Tilt weapon slightly inward/upward (0 to 240ms)
    const tiltIn = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: 0.28, pitch: 0.14, yaw: 0.08, y: -0.015 }, 240)
      .easing(TWEEN.Easing.Cubic.Out);
    this.reloadTweens.push(tiltIn);
    tiltIn.start();

    // STAGE 2: Magazine drops out at 240ms
    const magDropTimer = setTimeout(() => {
      if (!this.isReloading || this.currentWeapon !== 'hk_mp5') return;
      if (this.mp5MagMesh) {
        const drop = new TWEEN.Tween(this.mp5MagMesh.position, true)
          .to({ y: this.mp5MagRestY - 220, z: this.mp5MagRestZ - 40 }, 220)
          .easing(TWEEN.Easing.Quadratic.In)
          .onComplete(() => {
            if (this.mp5MagMesh) this.mp5MagMesh.visible = false;
          });
        this.reloadTweens.push(drop);
        drop.start();
      }

      // STAGE 3: Fresh magazine inserted at 550ms
      const magInTimer = setTimeout(() => {
        if (!this.isReloading || this.currentWeapon !== 'hk_mp5') return;
        if (this.mp5MagMesh) {
          this.mp5MagMesh.visible = true;
          this.mp5MagMesh.position.set(0, this.mp5MagRestY - 200, this.mp5MagRestZ - 35);
          const insert = new TWEEN.Tween(this.mp5MagMesh.position, true)
            .to({ y: this.mp5MagRestY, z: this.mp5MagRestZ }, 200)
            .easing(TWEEN.Easing.Back.Out)
            .onComplete(() => {
              this.posSpring.impulse(0, 0.045, 0);
              this.rotSpring.impulse(0.018, 0, 0.035);
              if (this.sound) this.sound.playMagIn();
            });
          this.reloadTweens.push(insert);
          insert.start();
        }

        // STAGE 4: Charging handle pull and HK slap at 960ms
        const slapTimer = setTimeout(() => {
          if (!this.isReloading || this.currentWeapon !== 'hk_mp5') return;

          if (this.mp5BoltMesh) {
            this.mp5BoltMesh.position.z = this.mp5BoltRestZ + 35;
          }
          this.posSpring.impulse(0, 0.015, 0.025);
          this.rotSpring.impulse(0.022, 0, -0.015);

          const releaseTimer = setTimeout(() => {
            if (!this.isReloading || this.currentWeapon !== 'hk_mp5') return;
            if (this.mp5BoltMesh) {
              this.mp5BoltMesh.position.z = this.mp5BoltRestZ;
            }
            this.posSpring.impulse(0, -0.012, -0.035);
            this.rotSpring.impulse(-0.042, 0, -0.018);
            if (this.sound && typeof this.sound.playSlideRelease === 'function') {
              this.sound.playSlideRelease();
            }

            // STAGE 5: Return to ready pose
            const tiltOut = new TWEEN.Tween(this.reloadTilt, true)
              .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, 180)
              .easing(TWEEN.Easing.Cubic.Out)
              .onComplete(() => {
                this.isReloading = false;
                if (this.mp5BoltMesh) this.mp5BoltMesh.position.z = this.mp5BoltRestZ;
                if (this.mp5MagMesh) {
                  this.mp5MagMesh.visible = true;
                  this.mp5MagMesh.position.set(0, this.mp5MagRestY, this.mp5MagRestZ);
                }
                if (typeof onComplete === 'function') onComplete();
              });
            this.reloadTweens.push(tiltOut);
            tiltOut.start();
          }, 120);
          this.reloadTimers.push(releaseTimer);
        }, 410);
        this.reloadTimers.push(slapTimer);
      }, 310);
      this.reloadTimers.push(magInTimer);
    }, 240);
    this.reloadTimers.push(magDropTimer);
  }

  _clearReloadTimersAndTweens() {
    this.reloadTimers.forEach((id) => clearTimeout(id));
    this.reloadTimers.length = 0;
    this.reloadTweens.forEach((tw) => tw.stop());
    this.reloadTweens.length = 0;
  }

  _resetColtMechState() {
    if (this.coltModelGroup) {
      this.coltModelGroup.position.set(0, 0, 0);
      this.coltModelGroup.rotation.set(0, 0, 0);
    }
    if (this.coltGroup) {
      this.coltGroup.rotation.set(0, 0, 0);
    }
    if (this.coltCylinderMesh) {
      this.coltCylinderMesh.rotation.z = this.coltCylinderSpin;
    }
  }

  _startColtReloadAnimation(onComplete) {
    if (this.sound && typeof this.sound.playReloadSound === 'function') {
      this.sound.playReloadSound('colt_peacemaker');
    } else if (this.sound) {
      this.sound.playMagOut();
    }

    this._resetColtMechState();

    const totalMs = (this.sound && typeof this.sound.getReloadDurationMs === 'function')
      ? this.sound.getReloadDurationMs('colt_peacemaker', 3344)
      : 3344;
    const tiltOutMs = 240;
    const lockDelay = Math.max(950, totalMs - tiltOutMs);
    const cylinderSpinMs = Math.max(850, lockDelay - 80);

    const tiltIn = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: -0.45, pitch: 0.22, yaw: -0.14, y: -0.02 }, 260)
      .easing(TWEEN.Easing.Cubic.Out);
    this.reloadTweens.push(tiltIn);
    tiltIn.start();

    if (this.coltCylinderMesh) {
      const spinObj = { z: this.coltCylinderSpin };
      const spinTween = new TWEEN.Tween(spinObj, true)
        .to({ z: this.coltCylinderSpin + Math.PI * 6 }, cylinderSpinMs)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate(() => {
          if (this.coltCylinderMesh) this.coltCylinderMesh.rotation.z = spinObj.z;
        })
        .onComplete(() => {
          this.coltCylinderSpin = spinObj.z % (Math.PI * 2);
        });
      this.reloadTweens.push(spinTween);
      spinTween.start();
    }

    const lockTimer = setTimeout(() => {
      if (!this.isReloading || this.currentWeapon !== 'colt_peacemaker') return;
      this.posSpring.impulse(0, 0.04, -0.03);
      this.rotSpring.impulse(-0.05, 0, 0.04);
      if (this.sound && typeof this.sound.playSlideRelease === 'function') {
        this.sound.playSlideRelease();
      }

      const tiltOut = new TWEEN.Tween(this.reloadTilt, true)
        .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, tiltOutMs)
        .easing(TWEEN.Easing.Cubic.Out)
        .onComplete(() => {
          this.isReloading = false;
          this._resetColtMechState();
          if (typeof onComplete === 'function') onComplete();
        });
      this.reloadTweens.push(tiltOut);
      tiltOut.start();
    }, lockDelay);
    this.reloadTimers.push(lockTimer);
  }

  _startGlockReloadAnimation(onComplete) {
    if (this.sound && typeof this.sound.playReloadSound === 'function') {
      this.sound.playReloadSound('glock_flamengo');
    } else if (this.sound) {
      this.sound.playMagOut();
    }

    if (this.glockMagMesh) {
      this.glockMagMesh.visible = true;
      this.glockMagMesh.position.y = this.glockMagRestY;
      this.glockMagMesh.position.z = this.glockMagRestZ;
    }

    const tiltIn = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: 0.34, pitch: 0.14, yaw: 0.08, y: -0.015 }, 220)
      .easing(TWEEN.Easing.Cubic.Out);
    this.reloadTweens.push(tiltIn);
    tiltIn.start();

    const magDropTimer = setTimeout(() => {
      if (!this.isReloading || this.currentWeapon !== 'glock_flamengo') return;
      if (this.glockMagMesh) {
        // Scene_1 in glock_flamengo.glb has basis Z = downward (-Y in viewmodel) and basis Y = backward (+Z in viewmodel).
        // Dropping the drum magazine down along the grip angle requires +Z (+1.35) and slightly +Y (+0.26).
        const drop = new TWEEN.Tween(this.glockMagMesh.position, true)
          .to({ y: this.glockMagRestY + 0.26, z: this.glockMagRestZ + 1.35 }, 210)
          .easing(TWEEN.Easing.Quadratic.In)
          .onComplete(() => {
            if (this.glockMagMesh) this.glockMagMesh.visible = false;
          });
        this.reloadTweens.push(drop);
        drop.start();
      }

      const magInTimer = setTimeout(() => {
        if (!this.isReloading || this.currentWeapon !== 'glock_flamengo') return;
        if (this.glockMagMesh) {
          this.glockMagMesh.visible = true;
          this.glockMagMesh.position.y = this.glockMagRestY + 0.26;
          this.glockMagMesh.position.z = this.glockMagRestZ + 1.35;
          const insert = new TWEEN.Tween(this.glockMagMesh.position, true)
            .to({ y: this.glockMagRestY, z: this.glockMagRestZ }, 220)
            .easing(TWEEN.Easing.Back.Out)
            .onComplete(() => {
              this.posSpring.impulse(0, 0.048, 0);
              this.rotSpring.impulse(0.018, 0, 0.032);
              if (this.sound) this.sound.playMagIn();
            });
          this.reloadTweens.push(insert);
          insert.start();
        }

        const rackTimer = setTimeout(() => {
          if (!this.isReloading || this.currentWeapon !== 'glock_flamengo') return;
          this.glockSlideCycle = 0.0001;
          this.glockSlideCycleDuration = 0.13;
          this.glockSlideMaxStroke = 0.115;
          this._glockShotJustTriggered = true;
          this.posSpring.impulse(0, -0.012, -0.032);
          this.rotSpring.impulse(-0.048, 0, -0.022);
          if (this.sound && typeof this.sound.play9mmSlideRack === 'function') {
            this.sound.play9mmSlideRack();
          }

          const tiltOut = new TWEEN.Tween(this.reloadTilt, true)
            .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, 190)
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(() => {
              this.isReloading = false;
              if (this.glockMagMesh) {
                this.glockMagMesh.visible = true;
                this.glockMagMesh.position.y = this.glockMagRestY;
                this.glockMagMesh.position.z = this.glockMagRestZ;
              }
              if (typeof onComplete === 'function') onComplete();
            });
          this.reloadTweens.push(tiltOut);
          tiltOut.start();
        }, 300);
        this.reloadTimers.push(rackTimer);
      }, 240);
      this.reloadTimers.push(magInTimer);
    }, 220);
    this.reloadTimers.push(magDropTimer);
  }

  _resetAkmsMechState() {
    this.akmsBoltBlowback = 0;
    this.akmsBoltHold = 0;
    if (this.akmsBoltMesh && this.akmsBoltRestX !== undefined) {
      this.akmsBoltMesh.position.x = this.akmsBoltRestX;
    }
    if (this.akmsMagMesh && this.akmsMagRestY !== undefined) {
      this.akmsMagMesh.visible = true;
      this.akmsMagMesh.position.set(this.akmsMagRestX, this.akmsMagRestY, this.akmsMagRestZ);
      this.akmsMagMesh.rotation.set(0, 0, 0);
    }
  }

  _startAkmsReloadAnimation(onComplete) {
    if (this.sound && typeof this.sound.playReloadSound === 'function') {
      this.sound.playReloadSound('akms_gold');
    } else if (this.sound) {
      this.sound.playMagOut();
    }

    this._resetAkmsMechState();

    // Sync animation stages proportionally to akms_reload.mp3 duration (~1.646s)
    const totalMs = (this.sound && typeof this.sound.getReloadDurationMs === 'function')
      ? this.sound.getReloadDurationMs('akms_gold', 1646)
      : 1646;
    const scale = Math.max(0.5, totalMs / 1646);
    const ms = (v) => Math.max(20, Math.round(v * scale));

    // STAGE 1: Lift weapon and cant slightly right so magazine rock-out/in is clearly framed
    const tiltIn = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: -0.18, pitch: 0.22, yaw: 0.08, y: 0.042 }, ms(230))
      .easing(TWEEN.Easing.Cubic.Out);
    this.reloadTweens.push(tiltIn);
    tiltIn.start();

    // STAGE 2: Rock magazine forward (-Y rot) and pull downward (-Z, +X in Sketchfab local coords)
    const magDropTimer = setTimeout(() => {
      if (!this.isReloading || this.currentWeapon !== 'akms_gold') return;
      if (this.akmsMagMesh) {
        const dropPos = new TWEEN.Tween(this.akmsMagMesh.position, true)
          .to({ z: this.akmsMagRestZ - 0.19, x: this.akmsMagRestX + 0.032 }, ms(240))
          .easing(TWEEN.Easing.Quadratic.In)
          .onComplete(() => {
            if (this.akmsMagMesh) this.akmsMagMesh.visible = false;
          });
        const dropRot = new TWEEN.Tween(this.akmsMagMesh.rotation, true)
          .to({ y: -0.36 }, ms(190))
          .easing(TWEEN.Easing.Cubic.Out);
        this.reloadTweens.push(dropPos, dropRot);
        dropPos.start();
        dropRot.start();
      }

      // STAGE 3: Insert fresh magazine upward (+Z) and rock back to lock upright into receiver
      const magInTimer = setTimeout(() => {
        if (!this.isReloading || this.currentWeapon !== 'akms_gold') return;
        if (this.akmsMagMesh) {
          this.akmsMagMesh.visible = true;
          this.akmsMagMesh.position.set(this.akmsMagRestX + 0.032, this.akmsMagRestY, this.akmsMagRestZ - 0.19);
          this.akmsMagMesh.rotation.set(0, -0.36, 0);
          const insertPos = new TWEEN.Tween(this.akmsMagMesh.position, true)
            .to({ x: this.akmsMagRestX, y: this.akmsMagRestY, z: this.akmsMagRestZ }, ms(240))
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(() => {
              this.posSpring.impulse(0, 0.052, 0);
              this.rotSpring.impulse(0.022, 0, 0.038);
              if (this.sound) this.sound.playMagIn();
              const tiltCharge = new TWEEN.Tween(this.reloadTilt, true)
                .to({ roll: 0.30, pitch: 0.18, yaw: 0.06, y: 0.018 }, ms(180))
                .easing(TWEEN.Easing.Cubic.Out);
              this.reloadTweens.push(tiltCharge);
              tiltCharge.start();
            });
          const insertRot = new TWEEN.Tween(this.akmsMagMesh.rotation, true)
            .to({ y: 0 }, ms(240))
            .easing(TWEEN.Easing.Quadratic.Out);
          this.reloadTweens.push(insertPos, insertRot);
          insertPos.start();
          insertRot.start();
        }

        // STAGE 4: Rack charging handle backward (-X) and snap forward to chamber a round
        const chargeTimer = setTimeout(() => {
          if (!this.isReloading || this.currentWeapon !== 'akms_gold') return;

          const finishCharge = (settleMs = ms(236)) => {
            this.posSpring.impulse(0, -0.015, -0.042);
            this.rotSpring.impulse(-0.055, 0, -0.025);
            if (this.sound && typeof this.sound.playSlideRelease === 'function') {
              this.sound.playSlideRelease();
            }
            const tiltOut = new TWEEN.Tween(this.reloadTilt, true)
              .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, settleMs)
              .easing(TWEEN.Easing.Cubic.Out)
              .onComplete(() => {
                this.isReloading = false;
                this._resetAkmsMechState();
                if (typeof onComplete === 'function') onComplete();
              });
            this.reloadTweens.push(tiltOut);
            tiltOut.start();
          };

          if (this.akmsBoltMesh && this.akmsBoltRestX !== undefined) {
            this.posSpring.impulse(0, 0.012, 0.025);
            this.rotSpring.impulse(0.025, 0, -0.015);
            const pullBolt = new TWEEN.Tween(this.akmsBoltMesh.position, true)
              .to({ x: this.akmsBoltRestX - 0.080 }, ms(150))
              .easing(TWEEN.Easing.Cubic.Out)
              .onComplete(() => {
                if (!this.isReloading || this.currentWeapon !== 'akms_gold') return;
                const holdBoltTimer = setTimeout(() => {
                  if (!this.isReloading || this.currentWeapon !== 'akms_gold') return;
                  const releaseBolt = new TWEEN.Tween(this.akmsBoltMesh.position, true)
                    .to({ x: this.akmsBoltRestX }, ms(100))
                    .easing(TWEEN.Easing.Cubic.In)
                    .onComplete(() => finishCharge(ms(236)));
                  this.reloadTweens.push(releaseBolt);
                  releaseBolt.start();
                }, ms(60));
                this.reloadTimers.push(holdBoltTimer);
              });
            this.reloadTweens.push(pullBolt);
            pullBolt.start();
          } else {
            finishCharge(ms(546));
          }
        }, ms(460));
        this.reloadTimers.push(chargeTimer);
      }, ms(380));
      this.reloadTimers.push(magInTimer);
    }, ms(260));
    this.reloadTimers.push(magDropTimer);
  }

  reset() {
    this._clearReloadTimersAndTweens();

    if (this.sound && typeof this.sound.stopActionSounds === 'function') {
      this.sound.stopActionSounds();
    }

    this.currentWeapon = 'hk_usp';
    this.isADS = false;
    this.isReloading = false;
    this.isPumping = false;
    this.isSlideLocked = false;
    this.slideBlowback = 0;
    this.hammerRecoil = 0;
    this.uspSlideBlowback = 0;
    this.uspHammerRecoil = 0;
    this.mp5BoltBlowback = 0;
    this.coltHammerRecoil = 0;
    this.glockSlideBlowback = 0;
    this.glockSlideCycle = 0;
    this._glockShotJustTriggered = false;
    this.isTriggerHeld = false;
    this.flashTimer = 0;

    // Restore 3D weapon group visibilities to Slot 1 (H&K USP 9mm)
    if (this.uspGroup) this.uspGroup.visible = !this.isUnarmed;
    if (this.gunGroup) this.gunGroup.visible = false;
    if (this.shotgunGroup) this.shotgunGroup.visible = false;
    if (this.mp5Group) this.mp5Group.visible = false;
    if (this.coltGroup) this.coltGroup.visible = false;
    if (this.glockGroup) this.glockGroup.visible = false;
    if (this.akmsGroup) this.akmsGroup.visible = false;
    if (this.unarmedGroup) this.unarmedGroup.visible = this.isUnarmed;

    // Restore active hip/ADS transform pointers & muzzle socket
    this.hipPosition = this.isUnarmed ? this.unarmedHipPosition : this.uspHipPosition;
    this.adsPosition = this.isUnarmed ? this.unarmedAdsPosition : this.uspAdsPosition;
    this.hipRotation = this.isUnarmed ? this.unarmedHipRotation : this.uspHipRotation;
    this.adsRotation = this.isUnarmed ? this.unarmedAdsRotation : this.uspAdsRotation;
    this.muzzleAnchor = this.uspMuzzleSocket;

    if (this.muzzleFlashGroup && this.muzzleAnchor) {
      this.muzzleAnchor.add(this.muzzleFlashGroup);
      this.muzzleFlashGroup.visible = false;
    }

    if (this.uspSlideGroup) this.uspSlideGroup.position.set(0, 0, 0);
    if (this.uspHammerGroup) this.uspHammerGroup.rotation.x = 0;
    if (this.uspTriggerGroup) this.uspTriggerGroup.rotation.x = 0;
    if (this.uspMagGroup) {
      this.uspMagGroup.position.set(0, 0, 0);
      this.uspMagGroup.visible = true;
    }
    if (this.slideGroup) this.slideGroup.position.set(0, 0, 0);
    if (this.pistolSlideMesh && this.deSlideRestZ !== undefined) {
      this.pistolSlideMesh.position.z = this.deSlideRestZ;
    }
    if (this.triggerMesh) this.triggerMesh.rotation.x = 0;
    if (this.magGroup) {
      this.magGroup.position.set(0, 0, 0);
      this.magGroup.visible = true;
    }
    this._updateDesertEagleMagVisuals(0, true);
    this._updateShotgunPumpVisuals(0);
    if (this.shotgunCarrierGroup) this.shotgunCarrierGroup.rotation.x = 0;
    if (this.shotgunTriggerMesh) this.shotgunTriggerMesh.rotation.x = 0;
    if (this.shotgunReloadShell) this.shotgunReloadShell.visible = false;
    for (const leftGroup of [this.shotgunLeftHandGroup, this.mp5LeftHandGroup, this.akmsLeftHandGroup]) {
      if (leftGroup) {
        leftGroup.position.set(0, 0, 0);
        leftGroup.rotation.set(0, 0, 0);
      }
    }
    if (this.mp5BoltMesh && this.mp5BoltRestZ !== undefined) {
      this.mp5BoltMesh.position.z = this.mp5BoltRestZ;
    }
    if (this.mp5MagMesh && this.mp5MagRestY !== undefined && this.mp5MagRestZ !== undefined) {
      this.mp5MagMesh.visible = true;
      this.mp5MagMesh.position.set(0, this.mp5MagRestY, this.mp5MagRestZ);
    }
    if (this.mp5TriggerMesh) this.mp5TriggerMesh.rotation.x = 0;
    this._resetAllTriggerFingers();
    if (this.glockTriggerMesh) this.glockTriggerMesh.position.z = this.glockTriggerRestZ || 0;
    if (this.glockSlideMesh && this.glockSlideRestY !== undefined) {
      this.glockSlideMesh.position.y = this.glockSlideRestY;
      this.glockSlideMesh.position.z = this.glockSlideRestZ;
    }
    if (this.glockSelectorMesh && this.glockSelectorRestY !== undefined) {
      this.glockSelectorMesh.position.y = this.glockSelectorRestY;
      this.glockSelectorMesh.position.z = this.glockSelectorRestZ;
    }
    if (this.glockMagMesh && this.glockMagRestY !== undefined) {
      this.glockMagMesh.visible = true;
      this.glockMagMesh.position.y = this.glockMagRestY;
      this.glockMagMesh.position.z = this.glockMagRestZ;
    }
    this._resetColtMechState();
    this._resetAkmsMechState();

    this._syncTuner();

    const targetPos = this.hipPosition;
    const targetRot = this.hipRotation;
    this.posSpring.reset(targetPos.x, targetPos.y, targetPos.z);
    this.rotSpring.reset(targetRot.x, targetRot.y, targetRot.z);
    this.bobSpring.reset(0, 0, 0);
    this.bobCycle = 0;
    this.root.position.set(targetPos.x, targetPos.y, targetPos.z);
    this.root.rotation.set(targetRot.x, targetRot.y, targetRot.z);
    this.reloadTilt.x = 0;
    this.reloadTilt.y = 0;
    this.reloadTilt.z = 0;
    this.reloadTilt.pitch = 0;
    this.reloadTilt.yaw = 0;
    this.reloadTilt.roll = 0;
  }

  /**
   * Returns a cloned 3D weapon pivotGroup normalized & centered via exact visible-mesh Box3
   * for Gun Shop previews. Strips shared cross-context RenderTarget envMaps so GunShopHUD's
   * bright RoomEnvironment cubemap illuminates metals cleanly.
   */
  getShowcaseModelClone(weaponId) {
    const sourceMap = {
      hk_usp: this.uspModelGroup,
      shotgun: this.shotgunModelGroup,
      remington_870: this.shotgunModelGroup,
      desert_eagle: this.pistolModelGroup,
      colt_peacemaker: this.coltModelGroup,
      hk_mp5: this.mp5ModelGroup,
      glock_flamengo: this.glockModelGroup,
      akms_gold: this.akmsModelGroup,
    };
    const src = sourceMap[weaponId];
    if (!src) return null;

    const clone = src.clone(true);
    clone.visible = true;
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.set(1, 1, 1);

    const matClones = new Map();
    clone.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = false;
        if (child.material) {
          const cloneMat = (m) => {
            if (!m) return m;
            if (matClones.has(m)) return matClones.get(m);
            const c = m.clone();
            if (c.isMeshStandardMaterial) {
              // Detach Engine WebGL context's dark RenderTarget envMap so showcaseScene.environment applies cleanly
              c.envMap = null;
              c.envMapIntensity = 0.45;
              c.needsUpdate = true;
            }
            matClones.set(m, c);
            return c;
          };
          child.material = Array.isArray(child.material)
            ? child.material.map(cloneMat)
            : cloneMat(child.material);
        }
      }
    });

    // Side profile orientation (-Z muzzle points cleanly right along +X, +X right side faces +Z camera)
    clone.rotation.y = -Math.PI * 0.5;
    clone.updateMatrixWorld(true);

    // Compute exact bounding box over visible meshes only
    const box = new THREE.Box3();
    const meshBox = new THREE.Box3();
    clone.traverse((child) => {
      if (child.isMesh && child.visible && child.geometry) {
        child.geometry.computeBoundingBox();
        if (child.geometry.boundingBox) {
          meshBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
          box.union(meshBox);
        }
      }
    });

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    if (!box.isEmpty()) {
      box.getSize(size);
      box.getCenter(center);
    } else {
      size.set(1, 1, 1);
    }

    // Center model at origin inside pivotGroup and normalize largest dimension to 1.0 unit
    const pivotGroup = new THREE.Group();
    pivotGroup.name = `ShopShowcase_${weaponId}`;
    clone.position.sub(center);
    pivotGroup.add(clone);

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const normScale = 1.0 / maxDim;
    pivotGroup.scale.setScalar(normScale);
    pivotGroup.updateMatrixWorld(true);

    pivotGroup.userData.showcaseSize = {
      width: size.x * normScale,
      height: size.y * normScale,
      depth: size.z * normScale,
    };

    const wrapper = new THREE.Group();
    wrapper.name = `ShopShowcaseNorm_${weaponId}`;
    wrapper.add(pivotGroup);
    wrapper.userData.showcaseSize = pivotGroup.userData.showcaseSize;
    wrapper.updateMatrixWorld(true);
    return wrapper;
  }
}
