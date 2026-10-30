import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Spring3D, Spring1D } from '../player/Spring.js';

// Pre-allocated scratch vector for zero-GC calculations
const _scratchVec = new THREE.Vector3();

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
 * 100% 3D GLTF Asset Pipeline Viewmodel for Slot 1 (.50 AE Desert Eagle),
 * Slot 2 (Remington 870 12-Gauge Pump Shotgun), and Rigged First-Person Hands.
 */
export class WeaponViewmodel {
  constructor(camera, soundManager) {
    this.camera = camera;
    this.sound = soundManager;

    this.root = new THREE.Group();
    this.root.name = 'WeaponViewmodel';
    this.camera.add(this.root);
    if (typeof window !== 'undefined') window.__rocViewmodel = this;

    // Active weapon type ('pistol' = Slot 1 Desert Eagle .50 AE, 'shotgun' = Slot 2 Remington 870)
    this.currentWeapon = 'pistol';

    // ADS interpolation flag
    this.isADS = false;
    this.tunerForceADS = null;
    this.tunerMode = 'HAND RIG';

    // Slot 1 (.50 AE Desert Eagle) Hip & ADS Transforms
    this.pistolHipPosition = new THREE.Vector3(0.1, -0.1, -0.42);
    this.pistolAdsPosition = new THREE.Vector3(0.000, -0.0973, -0.345);
    this.pistolHipRotation = new THREE.Euler(0.15, 0.04, 0.1);
    this.pistolAdsRotation = new THREE.Euler(0, 0, 0);

    // Slot 2 (Remington 870 12-Gauge Shotgun) Hip & ADS Transforms
    this.shotgunHipPosition = new THREE.Vector3(0.106, -0.122, -0.182);
    this.shotgunAdsPosition = new THREE.Vector3(0, -0.072, -0.116);
    this.shotgunHipRotation = new THREE.Euler(0.1, 0, 0);
    this.shotgunAdsRotation = new THREE.Euler(0.015, 0.005, 0);

    // Dynamic targets pointing to current active weapon transforms
    this.hipPosition = this.pistolHipPosition;
    this.adsPosition = this.pistolAdsPosition;
    this.hipRotation = this.pistolHipRotation;
    this.adsRotation = this.pistolAdsRotation;

    // Second-order harmonic springs for natural weight, inertia and snappy recovery
    this.posSpring = new Spring3D({ stiffness: 220, damping: 20 });
    this.rotSpring = new Spring3D({ stiffness: 210, damping: 19 });

    // Procedural weapon sway and bobbing
    this.bobSpring = new Spring3D({ stiffness: 120, damping: 14 });
    this.bobCycle = 0;

    // Sockets & anchors
    this.muzzleSocket = new THREE.Object3D();
    this.muzzleSocket.name = 'PistolMuzzleSocket';
    this.shotgunMuzzleSocket = new THREE.Object3D();
    this.shotgunMuzzleSocket.name = 'ShotgunMuzzleSocket';
    this.muzzleAnchor = this.muzzleSocket;

    this.ejectionAnchor = new THREE.Group();
    this.ejectionAnchor.name = 'PistolEjectionAnchor';
    this.shotgunEjectionAnchor = new THREE.Group();
    this.shotgunEjectionAnchor.name = 'ShotgunEjectionAnchor';

    this.muzzleWorldPos = new THREE.Vector3();
    this.ejectionWorldPos = new THREE.Vector3();

    // Slide Blowback, Hammer Action, Pump Action & Reload state
    this.slideBlowback = 0;
    this.hammerRecoil = 0;
    this.hammerRestAngle = 0;
    this.isSlideLocked = false;
    this.isReloading = false;
    this.isPumping = false;
    this.shotgunPumpOffset = 0;
    this.reloadTilt = { roll: 0, pitch: 0, yaw: 0, y: 0, x: 0, z: 0 };

    // Sub-assemblies & references
    this.gunGroup = null;
    this.pistolGroup = null;
    this.pistolModelGroup = null;
    this.pistolSlideMesh = null;
    this.deSlideRestZ = 0;
    this.magGroup = null;
    this.hammerGroup = null;
    this.triggerMesh = null;

    this.shotgunGroup = null;
    this.shotgunModelGroup = null;
    this.shotgunPumpGroup = null;
    this.shotgunBoltGroup = null;
    this.shotgunCarrierGroup = null;
    this.shotgunReloadShell = null;
    this.shotgunTriggerMesh = null;

    // Hand references
    this.rawHandsScene = null;
    this.pistolHandGroup = null;
    this.pistolHandsClone = null;
    this.pistolHandPivot = null;
    this.pistolWristBone = null;
    this.pistolElbowBone = null;
    this.pistolTriggerFingerGroup = null;

    this.shotgunLeftHandGroup = null;
    this.shotgunRightHandGroup = null;
    this.shotgunHandsClone = null;
    this.shotgunHandPivot = null;
    this.shotgunWristBone = null;
    this.shotgunElbowBone = null;
    this.shotgunTriggerFingerGroup = null;

    this.reloadTweens = [];
    this.reloadTimers = [];

    // Muzzle flash rig
    this.muzzleFlashGroup = null;
    this.flashTimer = 0;

    // Tuner state
    this.handTunerOverlay = null;
    this.tunerMode = 'HAND RIG'; // 'HAND RIG' | 'GUN (HIP)' | 'GUN (ADS)'

    this._buildMaterials();
    this._buildGunMesh();
    this._buildShotgunMesh();
    this._buildMuzzleFlashRig();

    // Load 3D GLTF models asynchronously
    this._loadWeaponModels();
    this._setupHandTuner();
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

  _buildGunMesh() {
    this.gunGroup = new THREE.Group();
    this.gunGroup.name = 'DesertEagle50';
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

    this.ejectionAnchor.position.set(0.018, 0.032, 0.015);
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

    this.shotgunRightHandGroup = new THREE.Group();
    this.shotgunRightHandGroup.name = 'ShotgunRightHandContainer';
    this.shotgunGroup.add(this.shotgunRightHandGroup);

    this.shotgunMuzzleSocket.position.set(0, 0.020, -0.520);
    this.shotgunGroup.add(this.shotgunMuzzleSocket);

    this.shotgunEjectionAnchor.position.set(0.020, 0.026, -0.008);
    this.shotgunGroup.add(this.shotgunEjectionAnchor);

    // Tactical reload shell cylinder (visible when inserting shells into loading gate)
    this.shotgunReloadShell = new THREE.Group();
    this.shotgunReloadShell.name = 'ShotgunReloadShell';
    this.shotgunReloadShell.visible = false;

    const shellHullGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.056, 16);
    shellHullGeo.rotateX(Math.PI / 2);
    const shellHullMesh = new THREE.Mesh(shellHullGeo, this.shellHullMaterial);
    this.shotgunReloadShell.add(shellHullMesh);

    const brassRimGeo = new THREE.CylinderGeometry(0.0106, 0.0106, 0.018, 16);
    brassRimGeo.rotateX(Math.PI / 2);
    const brassRimMesh = new THREE.Mesh(brassRimGeo, this.brassMaterial);
    brassRimMesh.position.set(0, 0, 0.022);
    this.shotgunReloadShell.add(brassRimMesh);

    this.shotgunGroup.add(this.shotgunReloadShell);
  }

  // ===========================================================================
  // 3D GLTF ASSET PIPELINE LOADER
  // ===========================================================================

  _loadWeaponModels() {
    const loader = new GLTFLoader();

    // 1. Desert Eagle (.50 AE)
    loader.load(
      './models/desert_eagle.glb',
      (gltf) => {
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
            if (child.material && child.material.map) {
              child.material.map.colorSpace = THREE.SRGBColorSpace;
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

        const magNode = deScene.getObjectByName('Magazine_low');
        const magBaseNode = deScene.getObjectByName('MagazineBase_low');
        const baseInsideNode = deScene.getObjectByName('BaseInside_low');
        [magNode, magBaseNode, baseInsideNode].forEach((node) => {
          if (node) this.magGroup.attach(node);
        });

        this.pistolModelGroup.add(deScene);
      },
      undefined,
      (err) => console.error('Failed to load ./models/desert_eagle.glb:', err)
    );

    // 2. Remington 870 12-Gauge Pump Shotgun
    loader.load(
      './models/remington_870.glb',
      (gltf) => {
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

        const pump = remScene.getObjectByName('Pump_low');
        const pumpRods = remScene.getObjectByName('PumpRods_low');
        const slideLRods = remScene.getObjectByName('SlideLRods_low');
        [pump, pumpRods, slideLRods].forEach((node) => {
          if (node) this.shotgunPumpGroup.attach(node);
        });

        const boltSlide = remScene.getObjectByName('Slide_low');
        if (boltSlide) this.shotgunBoltGroup.attach(boltSlide);

        const carrierPlate = remScene.getObjectByName('LoadingPlate_low');
        if (carrierPlate) this.shotgunCarrierGroup = carrierPlate;

        this.shotgunTriggerMesh = remScene.getObjectByName('Trigger_low');

        this.shotgunModelGroup.add(remScene);
      },
      undefined,
      (err) => console.error('Failed to load ./models/remington_870.glb:', err)
    );

    // 3. Rigged FPS Hands by EvolveGames
    loader.load(
      './models/fps_hands.glb',
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (child.isMesh || child.isSkinnedMesh) {
            child.frustumCulled = false;
            child.castShadow = false;
            child.receiveShadow = true;
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

        this._buildPistolHand();
        this._buildShotgunHands();

        if (this.handTunerOverlay && this.handTunerOverlay.style.display !== 'none') {
          this._updateHandTunerSliders();
        }
      },
      undefined,
      (err) => console.error('Failed to load ./models/fps_hands.glb:', err)
    );
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
  _createPalmCenteredHandClone(side) {
    if (!this.rawHandsScene) return null;

    const clone = SkeletonUtils.clone(this.rawHandsScene);
    clone.name = side === 'R' ? 'PistolRiggedHands' : 'ShotgunRiggedHands';

    const targetSideTag = side === 'R' ? '_R' : '_L';
    const oppositeSideTag = side === 'R' ? '_L' : '_R';

    // Clone SkinnedMesh geometry and filter index buffer so opposite arm has exactly 0 triangles
    clone.traverse((child) => {
      if (child.isSkinnedMesh) {
        const geo = child.geometry.clone();
        child.geometry = geo;

        const skinIndex = geo.attributes.skinIndex;
        const skinWeight = geo.attributes.skinWeight;
        const oldIndex = geo.index;

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

          const IndexArrayType = geo.attributes.position.count > 65535 ? Uint32Array : Uint16Array;
          geo.setIndex(new THREE.BufferAttribute(new IndexArrayType(newIndices), 1));
          geo.computeVertexNormals();
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
    return { pivotGroup, clone, palmBone, wristBone, elbowBone };
  }

  /**
   * Builds Slot 1 (.50 AE Desert Eagle) Single Right Rigged Hand
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
    this.pistolHandPivot.position.set(0.006, 0.012, 0.256);
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

    // Link trigger finger
    this.pistolTriggerFingerGroup =
      handData.clone.getObjectByName('index0_R_035') ||
      handData.clone.getObjectByName('index1_R_036');

    this.pistolHandGroup.add(this.pistolHandPivot);
  }

  /**
   * Builds Slot 2 (Remington 870 Shotgun) Single Left Rigged Hand
   * Mounted directly onto this.shotgunPumpGroup so it translates 1:1 with pump action.
   */
  _buildShotgunHands() {
    if (!this.shotgunLeftHandGroup) return;
    while (this.shotgunLeftHandGroup.children.length > 0) {
      this.shotgunLeftHandGroup.remove(this.shotgunLeftHandGroup.children[0]);
    }

    const handData = this._createPalmCenteredHandClone('L');
    if (!handData) return;

    this.shotgunHandPivot = handData.pivotGroup;
    this.shotgunHandsClone = handData.clone;
    this.shotgunWristBone = handData.wristBone;
    this.shotgunElbowBone = handData.elbowBone;

    // User-tuned Remington 870 pump grip anchor and orientation
    this.shotgunHandPivot.position.set(-0.084, -0.122, 0.174);
    this.shotgunHandPivot.rotation.set(2.88, 0.92, 2.14);
    this.shotgunHandPivot.scale.setScalar(0.92);

    // Initial bone delta rotations (wristPitch: -0.18, wristRoll: 0.20, elbowBend: -0.56)
    if (this.shotgunWristBone) {
      this.shotgunWristBone.userData.pitch = -0.18;
      this.shotgunWristBone.userData.roll = 0.20;
      this.shotgunWristBone.quaternion.copy(this.shotgunWristBone.userData.restQuat);
      const qDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-0.18, 0, 0.20, 'XYZ')
      );
      this.shotgunWristBone.quaternion.multiply(qDelta);
    }
    if (this.shotgunElbowBone) {
      this.shotgunElbowBone.userData.bend = -0.56;
      this.shotgunElbowBone.quaternion.copy(this.shotgunElbowBone.userData.restQuat);
      const qDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-0.56, 0, 0, 'XYZ')
      );
      this.shotgunElbowBone.quaternion.multiply(qDelta);
    }

    // Bend left upper-arm bone downward behind camera frustum so upper arm & shoulder stay 100% off-screen
    const armL = handData.clone.getObjectByName('arm_L_01');
    if (armL) {
      armL.rotation.x = 0.45;
    }

    // Cache default transforms for Reset Hand Pose
    this.shotgunHandPivot.userData.defaultPos = this.shotgunHandPivot.position.clone();
    this.shotgunHandPivot.userData.defaultRot = this.shotgunHandPivot.rotation.clone();
    this.shotgunHandPivot.userData.defaultScale = this.shotgunHandPivot.scale.clone();

    this.shotgunLeftHandGroup.add(this.shotgunHandPivot);
  }

  /**
   * Restores pristine default hand and bone pose for the active weapon in the F8 tuner.
   */
  resetHandPose() {
    const isPistol = this.currentWeapon === 'pistol';
    const target = isPistol ? this.pistolHandPivot : this.shotgunHandPivot;
    const wrist = isPistol ? this.pistolWristBone : this.shotgunWristBone;
    const elbow = isPistol ? this.pistolElbowBone : this.shotgunElbowBone;

    if (target && target.userData.defaultPos) {
      target.position.copy(target.userData.defaultPos);
      target.rotation.copy(target.userData.defaultRot);
      target.scale.copy(target.userData.defaultScale);
    }
    if (wrist && wrist.userData.restQuat) {
      const defaultPitch = isPistol ? -0.02 : -0.18;
      const defaultRoll = isPistol ? -0.02 : 0.20;
      wrist.userData.pitch = defaultPitch;
      wrist.userData.roll = defaultRoll;
      wrist.quaternion.copy(wrist.userData.restQuat);
      if (defaultPitch !== 0 || defaultRoll !== 0) {
        const qDelta = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(defaultPitch, 0, defaultRoll, 'XYZ')
        );
        wrist.quaternion.multiply(qDelta);
      }
    }
    if (elbow && elbow.userData.restQuat) {
      const defaultBend = isPistol ? -0.02 : -0.56;
      elbow.userData.bend = defaultBend;
      elbow.quaternion.copy(elbow.userData.restQuat);
      if (defaultBend !== 0) {
        const qDelta = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(defaultBend, 0, 0, 'XYZ')
        );
        elbow.quaternion.multiply(qDelta);
      }
    }
    this._updateHandTunerSliders();
  }

  // ===========================================================================
  // UPGRADED F8 TUNER (HAND RIG, GUN HIP, GUN ADS)
  // ===========================================================================

  /**
   * Toggleable in-game Viewmodel & Hand Tuner overlay (F8 key).
   * Supports toggling between [ HAND RIG ], [ GUN (HIP) ], and [ GUN (ADS) ].
   */
  _setupHandTuner() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let overlay = document.getElementById('hand-tuner-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'hand-tuner-overlay';
      overlay.style.cssText = `
        position: fixed;
        bottom: 16px;
        left: 16px;
        width: 320px;
        background: rgba(15, 20, 28, 0.96);
        border: 1px solid #4a5568;
        border-radius: 8px;
        padding: 12px;
        color: #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
        font-size: 11px;
        z-index: 99999;
        display: none;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.75);
        pointer-events: auto;
        user-select: none;
      `;

      overlay.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #2d3748; padding-bottom:6px;">
          <strong style="color:#63b3ed; font-size:12px;">Viewmodel Tuner (F8)</strong>
          <span id="ht-weapon-badge" style="color:#f6ad55; font-weight:bold; font-size:11px; text-transform:uppercase;">PISTOL</span>
        </div>
        <div style="display:flex; gap:4px; margin-bottom:6px;">
          <button id="ht-slot1-btn" style="flex:1; padding:4px 2px; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Slot 1: Pistol</button>
          <button id="ht-slot2-btn" style="flex:1; padding:4px 2px; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Slot 2: Shotgun</button>
          <button id="ht-ads-btn" style="flex:1; padding:4px 2px; background:#4a5568; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Toggle ADS</button>
        </div>
        <div style="display:flex; gap:4px; margin-bottom:8px;">
          <button id="ht-fire-btn" style="flex:1; padding:4px 2px; background:#dd6b20; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Test Fire</button>
          <button id="ht-reload-btn" style="flex:1; padding:4px 2px; background:#319795; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Test Reload</button>
          <button id="ht-reset-pose-btn" style="flex:1; padding:4px 2px; background:#4a5568; color:#cbd5e0; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">Reset Pose</button>
        </div>
        <div style="display:flex; gap:4px; margin-bottom:8px;">
          <button id="ht-mode-hand" style="flex:1; padding:4px 2px; background:#4a5568; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">HAND RIG</button>
          <button id="ht-mode-hip" style="flex:1; padding:4px 2px; background:#2d3748; color:#a0aec0; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">GUN (HIP)</button>
          <button id="ht-mode-ads" style="flex:1; padding:4px 2px; background:#2d3748; color:#a0aec0; border:none; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">GUN (ADS)</button>
        </div>
        <div id="ht-sliders-container" style="display:flex; flex-direction:column; gap:5px; max-height:280px; overflow-y:auto; padding-right:4px;"></div>
        <div style="margin-top:10px; display:flex; gap:8px;">
          <button id="ht-copy-btn" style="flex:1; padding:6px; background:#3182ce; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Copy Transform</button>
          <button id="ht-close-btn" style="padding:6px 12px; background:#4a5568; color:#fff; border:none; border-radius:4px; cursor:pointer;">Close</button>
        </div>
      `;
      document.body.appendChild(overlay);

      const openTuner = () => {
        window.isViewmodelTunerOpen = true;
        overlay.style.display = 'block';
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        const startModal = document.getElementById('start-modal');
        if (startModal) {
          startModal.classList.add('hidden');
        }
        this.root.visible = true;
        this._updateHandTunerSliders();
      };

      const closeTuner = () => {
        window.isViewmodelTunerOpen = false;
        this.tunerForceADS = null;
        overlay.style.display = 'none';
        const canvas = document.getElementById('game-canvas');
        if (canvas && canvas.requestPointerLock) {
          canvas.requestPointerLock();
        }
      };

      const closeBtn = document.getElementById('ht-close-btn');
      if (closeBtn) closeBtn.onclick = closeTuner;

      const slot1Btn = document.getElementById('ht-slot1-btn');
      if (slot1Btn) {
        slot1Btn.onclick = () => {
          if (window.weaponSystem) {
            window.weaponSystem.switchWeapon('pistol', true);
          } else {
            this.switchWeapon('pistol');
          }
          this._updateHandTunerSliders();
        };
      }

      const slot2Btn = document.getElementById('ht-slot2-btn');
      if (slot2Btn) {
        slot2Btn.onclick = () => {
          if (window.weaponSystem) {
            window.weaponSystem.switchWeapon('shotgun', true);
          } else {
            this.switchWeapon('shotgun');
          }
          this._updateHandTunerSliders();
        };
      }

      const adsBtn = document.getElementById('ht-ads-btn');
      if (adsBtn) {
        adsBtn.onclick = () => {
          this.tunerForceADS = !this.isADS;
          this.setADS(this.tunerForceADS);
          adsBtn.style.background = this.isADS ? '#805ad5' : '#4a5568';
          adsBtn.textContent = this.isADS ? 'ADS: ON' : 'Toggle ADS';
          this._updateHandTunerSliders();
        };
      }

      const fireBtn = document.getElementById('ht-fire-btn');
      if (fireBtn) {
        fireBtn.onclick = () => {
          this.applyRecoil();
          if (this.currentWeapon === 'shotgun') {
            this.startShotgunPumpAnimation();
          }
          if (this.sound) {
            if (this.currentWeapon === 'shotgun') this.sound.playShotgunFire();
            else this.sound.playPistolFire();
          }
        };
      }

      const reloadBtn = document.getElementById('ht-reload-btn');
      if (reloadBtn) {
        reloadBtn.onclick = () => {
          if (window.weaponSystem) {
            window.weaponSystem.startReload(true);
          } else {
            this.startReloadAnimation();
          }
        };
      }

      const resetPoseBtn = document.getElementById('ht-reset-pose-btn');
      if (resetPoseBtn) {
        resetPoseBtn.onclick = () => {
          this.resetHandPose();
        };
      }

      const modeHand = document.getElementById('ht-mode-hand');
      const modeHip = document.getElementById('ht-mode-hip');
      const modeAds = document.getElementById('ht-mode-ads');
      const updateTabs = (mode) => {
        this.tunerMode = mode;
        [modeHand, modeHip, modeAds].forEach((btn) => {
          btn.style.background = '#2d3748';
          btn.style.color = '#a0aec0';
        });
        if (mode === 'HAND RIG') {
          modeHand.style.background = '#4a5568';
          modeHand.style.color = '#fff';
        } else if (mode === 'GUN (HIP)') {
          modeHip.style.background = '#4a5568';
          modeHip.style.color = '#fff';
          this.tunerForceADS = false;
          this.setADS(false);
          if (adsBtn) {
            adsBtn.style.background = '#4a5568';
            adsBtn.textContent = 'Toggle ADS';
          }
        } else {
          modeAds.style.background = '#4a5568';
          modeAds.style.color = '#fff';
          this.tunerForceADS = true;
          this.setADS(true);
          if (adsBtn) {
            adsBtn.style.background = '#805ad5';
            adsBtn.textContent = 'ADS: ON';
          }
        }
        this._updateHandTunerSliders();
      };

      if (modeHand) modeHand.onclick = () => updateTabs('HAND RIG');
      if (modeHip) modeHip.onclick = () => updateTabs('GUN (HIP)');
      if (modeAds) modeAds.onclick = () => updateTabs('GUN (ADS)');

      const copyBtn = document.getElementById('ht-copy-btn');
      if (copyBtn) {
        copyBtn.onclick = () => {
          const isPistol = this.currentWeapon === 'pistol';
          const handPivot = isPistol ? this.pistolHandPivot : this.shotgunHandPivot;
          const wrist = isPistol ? this.pistolWristBone : this.shotgunWristBone;
          const elbow = isPistol ? this.pistolElbowBone : this.shotgunElbowBone;
          const config = {
            weapon: this.currentWeapon,
            mode: this.tunerMode,
            hand: handPivot
              ? {
                  pos: [
                    Number(handPivot.position.x.toFixed(4)),
                    Number(handPivot.position.y.toFixed(4)),
                    Number(handPivot.position.z.toFixed(4)),
                  ],
                  rot: [
                    Number(handPivot.rotation.x.toFixed(4)),
                    Number(handPivot.rotation.y.toFixed(4)),
                    Number(handPivot.rotation.z.toFixed(4)),
                  ],
                  scale: Number(handPivot.scale.x.toFixed(4)),
                  wristPitch: wrist && wrist.userData.pitch !== undefined ? Number(wrist.userData.pitch.toFixed(4)) : 0,
                  wristRoll: wrist && wrist.userData.roll !== undefined ? Number(wrist.userData.roll.toFixed(4)) : 0,
                  elbowBend: elbow && elbow.userData.bend !== undefined ? Number(elbow.userData.bend.toFixed(4)) : 0,
                }
              : null,
            hip: {
              pos: (isPistol ? this.pistolHipPosition : this.shotgunHipPosition).toArray().map((v) => Number(v.toFixed(4))),
              rot: [
                Number((isPistol ? this.pistolHipRotation : this.shotgunHipRotation).x.toFixed(4)),
                Number((isPistol ? this.pistolHipRotation : this.shotgunHipRotation).y.toFixed(4)),
                Number((isPistol ? this.pistolHipRotation : this.shotgunHipRotation).z.toFixed(4)),
              ],
            },
            ads: {
              pos: (isPistol ? this.pistolAdsPosition : this.shotgunAdsPosition).toArray().map((v) => Number(v.toFixed(4))),
              rot: [
                Number((isPistol ? this.pistolAdsRotation : this.shotgunAdsRotation).x.toFixed(4)),
                Number((isPistol ? this.pistolAdsRotation : this.shotgunAdsRotation).y.toFixed(4)),
                Number((isPistol ? this.pistolAdsRotation : this.shotgunAdsRotation).z.toFixed(4)),
              ],
            },
          };

          const text = JSON.stringify(config, null, 2);
          console.log('[VIEWMODEL TUNER CONFIG]:\n' + text);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {});
          }
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy Transform'; }, 1200);
        };
      }

      window.addEventListener('keydown', (e) => {
        if (e.key === 'F8') {
          e.preventDefault();
          const isHidden = overlay.style.display === 'none' || !overlay.style.display;
          if (isHidden) {
            openTuner();
          } else {
            closeTuner();
          }
        }
      });
    }

    this.handTunerOverlay = overlay;
  }

  _updateHandTunerSliders() {
    if (!this.handTunerOverlay) return;

    const isPistol = this.currentWeapon === 'pistol';
    const badge = document.getElementById('ht-weapon-badge');
    if (badge) badge.textContent = isPistol ? 'PISTOL' : 'SHOTGUN';

    const adsBtn = document.getElementById('ht-ads-btn');
    if (adsBtn) {
      adsBtn.textContent = this.isADS ? 'ADS: ON' : 'Toggle ADS';
      adsBtn.style.background = this.isADS ? '#805ad5' : '#4a5568';
    }

    const container = document.getElementById('ht-sliders-container');
    if (!container) return;
    container.innerHTML = '';

    const createSliderRow = (f) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:6px;';
      const curVal = f.get();
      row.innerHTML = `
        <span style="width:72px; color:#cbd5e0; font-size:10px;">${f.label}:</span>
        <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${curVal}" style="flex:1; cursor:pointer;" />
        <span id="val-${f.id}" style="width:46px; text-align:right; color:#68d391; font-family:monospace; font-size:10px;">${curVal.toFixed(3)}</span>
      `;
      const slider = row.querySelector('input');
      const valDisplay = row.querySelector(`#val-${f.id}`);
      slider.oninput = (e) => {
        const num = parseFloat(e.target.value);
        f.set(num);
        valDisplay.textContent = num.toFixed(3);
      };
      container.appendChild(row);
    };

    if (this.tunerMode === 'HAND RIG') {
      const target = isPistol ? this.pistolHandPivot : this.shotgunHandPivot;
      const wrist = isPistol ? this.pistolWristBone : this.shotgunWristBone;
      const elbow = isPistol ? this.pistolElbowBone : this.shotgunElbowBone;

      if (!target) {
        container.innerHTML = '<div style="color:#a0aec0; padding:10px 0;">Loading hands 3D model...</div>';
        return;
      }

      const fields = [
        { id: 'posX', label: 'Pos X', min: -0.4, max: 0.4, step: 0.002, get: () => target.position.x, set: (v) => { target.position.x = v; } },
        { id: 'posY', label: 'Pos Y', min: -0.4, max: 0.4, step: 0.002, get: () => target.position.y, set: (v) => { target.position.y = v; } },
        { id: 'posZ', label: 'Pos Z', min: -0.5, max: 0.5, step: 0.002, get: () => target.position.z, set: (v) => { target.position.z = v; } },
        { id: 'rotX', label: 'Rot X', min: -3.14, max: 3.14, step: 0.02, get: () => target.rotation.x, set: (v) => { target.rotation.x = v; } },
        { id: 'rotY', label: 'Rot Y', min: -3.14, max: 3.14, step: 0.02, get: () => target.rotation.y, set: (v) => { target.rotation.y = v; } },
        { id: 'rotZ', label: 'Rot Z', min: -3.14, max: 3.14, step: 0.02, get: () => target.rotation.z, set: (v) => { target.rotation.z = v; } },
        { id: 'scale', label: 'Scale', min: 0.5, max: 1.8, step: 0.01, get: () => target.scale.x, set: (v) => { target.scale.setScalar(v); } },
      ];

      if (wrist) {
        fields.push(
          {
            id: 'wristP',
            label: 'Wrist Pitch',
            min: -1.5,
            max: 1.5,
            step: 0.02,
            get: () => (wrist.userData && wrist.userData.pitch !== undefined ? wrist.userData.pitch : 0),
            set: (v) => {
              wrist.userData.pitch = v;
              wrist.quaternion.copy(wrist.userData.restQuat);
              const qDelta = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(wrist.userData.pitch || 0, 0, wrist.userData.roll || 0, 'XYZ')
              );
              wrist.quaternion.multiply(qDelta);
            },
          },
          {
            id: 'wristR',
            label: 'Wrist Roll',
            min: -1.5,
            max: 1.5,
            step: 0.02,
            get: () => (wrist.userData && wrist.userData.roll !== undefined ? wrist.userData.roll : 0),
            set: (v) => {
              wrist.userData.roll = v;
              wrist.quaternion.copy(wrist.userData.restQuat);
              const qDelta = new THREE.Quaternion().setFromEuler(
                new THREE.Euler(wrist.userData.pitch || 0, 0, wrist.userData.roll || 0, 'XYZ')
              );
              wrist.quaternion.multiply(qDelta);
            },
          }
        );
      }
      if (elbow) {
        fields.push({
          id: 'elbowB',
          label: 'Elbow Bend',
          min: -1.5,
          max: 1.5,
          step: 0.02,
          get: () => (elbow.userData && elbow.userData.bend !== undefined ? elbow.userData.bend : 0),
          set: (v) => {
            elbow.userData.bend = v;
            elbow.quaternion.copy(elbow.userData.restQuat);
            const qDelta = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(elbow.userData.bend || 0, 0, 0, 'XYZ')
            );
            elbow.quaternion.multiply(qDelta);
          },
        });
      }

      fields.forEach(createSliderRow);
    } else if (this.tunerMode === 'GUN (HIP)') {
      const posTarget = isPistol ? this.pistolHipPosition : this.shotgunHipPosition;
      const rotTarget = isPistol ? this.pistolHipRotation : this.shotgunHipRotation;

      const fields = [
        {
          id: 'hipX',
          label: 'Hip Pos X',
          min: -0.4,
          max: 0.4,
          step: 0.002,
          get: () => posTarget.x,
          set: (v) => {
            posTarget.x = v;
            if (window.isViewmodelTunerOpen) {
              this.posSpring.reset(posTarget.x, posTarget.y + this.reloadTilt.y, posTarget.z);
            }
          },
        },
        {
          id: 'hipY',
          label: 'Hip Pos Y',
          min: -0.4,
          max: 0.4,
          step: 0.002,
          get: () => posTarget.y,
          set: (v) => {
            posTarget.y = v;
            if (window.isViewmodelTunerOpen) {
              this.posSpring.reset(posTarget.x, posTarget.y + this.reloadTilt.y, posTarget.z);
            }
          },
        },
        {
          id: 'hipZ',
          label: 'Hip Pos Z',
          min: -0.6,
          max: 0.1,
          step: 0.002,
          get: () => posTarget.z,
          set: (v) => {
            posTarget.z = v;
            if (window.isViewmodelTunerOpen) {
              this.posSpring.reset(posTarget.x, posTarget.y + this.reloadTilt.y, posTarget.z);
            }
          },
        },
        {
          id: 'hipRotX',
          label: 'Hip Rot X',
          min: -1.5,
          max: 1.5,
          step: 0.01,
          get: () => rotTarget.x,
          set: (v) => {
            rotTarget.x = v;
            if (window.isViewmodelTunerOpen) {
              this.rotSpring.reset(rotTarget.x + this.reloadTilt.pitch, rotTarget.y + this.reloadTilt.yaw, rotTarget.z + this.reloadTilt.roll);
            }
          },
        },
        {
          id: 'hipRotY',
          label: 'Hip Rot Y',
          min: -1.5,
          max: 1.5,
          step: 0.01,
          get: () => rotTarget.y,
          set: (v) => {
            rotTarget.y = v;
            if (window.isViewmodelTunerOpen) {
              this.rotSpring.reset(rotTarget.x + this.reloadTilt.pitch, rotTarget.y + this.reloadTilt.yaw, rotTarget.z + this.reloadTilt.roll);
            }
          },
        },
        {
          id: 'hipRotZ',
          label: 'Hip Rot Z',
          min: -1.5,
          max: 1.5,
          step: 0.01,
          get: () => rotTarget.z,
          set: (v) => {
            rotTarget.z = v;
            if (window.isViewmodelTunerOpen) {
              this.rotSpring.reset(rotTarget.x + this.reloadTilt.pitch, rotTarget.y + this.reloadTilt.yaw, rotTarget.z + this.reloadTilt.roll);
            }
          },
        },
      ];
      fields.forEach(createSliderRow);
    } else {
      const posTarget = isPistol ? this.pistolAdsPosition : this.shotgunAdsPosition;
      const rotTarget = isPistol ? this.pistolAdsRotation : this.shotgunAdsRotation;

      const fields = [
        {
          id: 'adsX',
          label: 'ADS Pos X',
          min: -0.2,
          max: 0.2,
          step: 0.001,
          get: () => posTarget.x,
          set: (v) => {
            posTarget.x = v;
            if (window.isViewmodelTunerOpen) {
              this.posSpring.reset(posTarget.x, posTarget.y + this.reloadTilt.y, posTarget.z);
            }
          },
        },
        {
          id: 'adsY',
          label: 'ADS Pos Y',
          min: -0.2,
          max: 0.2,
          step: 0.001,
          get: () => posTarget.y,
          set: (v) => {
            posTarget.y = v;
            if (window.isViewmodelTunerOpen) {
              this.posSpring.reset(posTarget.x, posTarget.y + this.reloadTilt.y, posTarget.z);
            }
          },
        },
        {
          id: 'adsZ',
          label: 'ADS Pos Z',
          min: -0.5,
          max: 0.1,
          step: 0.002,
          get: () => posTarget.z,
          set: (v) => {
            posTarget.z = v;
            if (window.isViewmodelTunerOpen) {
              this.posSpring.reset(posTarget.x, posTarget.y + this.reloadTilt.y, posTarget.z);
            }
          },
        },
        {
          id: 'adsRotX',
          label: 'ADS Rot X',
          min: -0.5,
          max: 0.5,
          step: 0.005,
          get: () => rotTarget.x,
          set: (v) => {
            rotTarget.x = v;
            if (window.isViewmodelTunerOpen) {
              this.rotSpring.reset(rotTarget.x + this.reloadTilt.pitch, rotTarget.y + this.reloadTilt.yaw, rotTarget.z + this.reloadTilt.roll);
            }
          },
        },
        {
          id: 'adsRotY',
          label: 'ADS Rot Y',
          min: -0.5,
          max: 0.5,
          step: 0.005,
          get: () => rotTarget.y,
          set: (v) => {
            rotTarget.y = v;
            if (window.isViewmodelTunerOpen) {
              this.rotSpring.reset(rotTarget.x + this.reloadTilt.pitch, rotTarget.y + this.reloadTilt.yaw, rotTarget.z + this.reloadTilt.roll);
            }
          },
        },
        {
          id: 'adsRotZ',
          label: 'ADS Rot Z',
          min: -0.5,
          max: 0.5,
          step: 0.005,
          get: () => rotTarget.z,
          set: (v) => {
            rotTarget.z = v;
            if (window.isViewmodelTunerOpen) {
              this.rotSpring.reset(rotTarget.x + this.reloadTilt.pitch, rotTarget.y + this.reloadTilt.yaw, rotTarget.z + this.reloadTilt.roll);
            }
          },
        },
      ];
      fields.forEach(createSliderRow);
    }
  }

  // ===========================================================================
  // WEAPON SWITCHING & ADS
  // ===========================================================================

  switchWeapon(weaponType) {
    if (this.currentWeapon === weaponType) return;

    this.reloadTimers.forEach((t) => clearTimeout(t));
    this.reloadTimers.length = 0;
    this.reloadTweens.forEach((t) => t.stop());
    this.reloadTweens.length = 0;

    this.isReloading = false;
    this.isPumping = false;
    this._updateShotgunPumpVisuals(0);
    if (this.shotgunReloadShell) this.shotgunReloadShell.visible = false;
    if (this.shotgunLeftHandGroup) {
      this.shotgunLeftHandGroup.position.set(0, 0, 0);
      this.shotgunLeftHandGroup.rotation.set(0, 0, 0);
    }
    if (this.pistolTriggerFingerGroup) this.pistolTriggerFingerGroup.rotation.x = 0;
    if (this.magGroup) {
      this.magGroup.position.set(0, 0, 0);
      this.magGroup.visible = true;
    }

    this.currentWeapon = weaponType;
    const isShotgun = weaponType === 'shotgun';

    if (this.handTunerOverlay && this.handTunerOverlay.style.display !== 'none') {
      this._updateHandTunerSliders();
    }

    if (this.gunGroup) this.gunGroup.visible = !isShotgun;
    if (this.shotgunGroup) this.shotgunGroup.visible = isShotgun;

    this.hipPosition = isShotgun ? this.shotgunHipPosition : this.pistolHipPosition;
    this.adsPosition = isShotgun ? this.shotgunAdsPosition : this.pistolAdsPosition;
    this.hipRotation = isShotgun ? this.shotgunHipRotation : this.pistolHipRotation;
    this.adsRotation = isShotgun ? this.shotgunAdsRotation : this.pistolAdsRotation;
    this.muzzleAnchor = isShotgun ? this.shotgunMuzzleSocket : this.muzzleSocket;

    if (this.muzzleFlashGroup && this.muzzleAnchor) {
      this.muzzleAnchor.add(this.muzzleFlashGroup);
      this.muzzleFlashGroup.visible = false;
    }

    // Equip transition spring impulse
    this.reloadTilt.y = -0.09;
    this.reloadTilt.pitch = -0.22;
    this.reloadTilt.roll = isShotgun ? -0.18 : 0.18;
    this.reloadTilt.yaw = 0;

    this.posSpring.impulse(0, -0.05, 0.04);
    this.rotSpring.impulse(-0.12, 0, isShotgun ? -0.08 : 0.08);

    const equipTween = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, 240)
      .easing(TWEEN.Easing.Back.Out);
    this.reloadTweens.push(equipTween);
    equipTween.start();

    if (this.sound && typeof this.sound.playWeaponSwitch === 'function') {
      this.sound.playWeaponSwitch(isShotgun);
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
    this.muzzleFlashGroup.add(discMesh);

    // Crossed lengthwise flame cones jutting forward
    const coneGeo = new THREE.PlaneGeometry(0.13, 0.17);
    coneGeo.translate(0, 0.085, 0);

    const coneH = new THREE.Mesh(coneGeo, this.muzzleFlashMaterial);
    coneH.rotation.x = -Math.PI / 2;
    this.muzzleFlashGroup.add(coneH);

    const coneV = new THREE.Mesh(coneGeo, this.muzzleFlashMaterial);
    coneV.rotation.x = -Math.PI / 2;
    coneV.rotation.y = Math.PI / 2;
    this.muzzleFlashGroup.add(coneV);
  }

  triggerMuzzleFlash() {
    if (!this.muzzleFlashGroup) return;
    this.muzzleFlashGroup.visible = true;
    this.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
    const baseScale = this.currentWeapon === 'shotgun' ? 1.25 : 0.88;
    const s = baseScale + Math.random() * 0.40;
    this.muzzleFlashGroup.scale.set(s, s, s);
    this.muzzleFlashMaterial.opacity = 1.0;
    this.flashTimer = 0.045;
  }

  // ===========================================================================
  // FIRING RECOIL & CYCLING
  // ===========================================================================

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

    const recoilKick = this.isADS ? 0.065 : 0.115;
    const recoilZ = this.isADS ? 0.032 : 0.115;
    const recoilPitch = this.isADS ? 0.095 : 0.200;
    const recoilYaw = (Math.random() - 0.5) * (this.isADS ? 0.010 : 0.025);
    const rollTorque = (Math.random() > 0.5 ? 1 : -1) * (this.isADS ? 0.018 : 0.040);

    this.posSpring.impulse(0, recoilKick * 0.28, recoilZ);
    this.rotSpring.impulse(recoilPitch, recoilYaw, rollTorque);

    // Slide Blowback kick
    this.slideBlowback = 0.036;
    this.hammerRecoil = 0.35;

    if (this.triggerMesh) this.triggerMesh.rotation.x = 0.15;
    if (this.pistolTriggerFingerGroup) this.pistolTriggerFingerGroup.rotation.x = 0.22;

    this.triggerMuzzleFlash();
  }

  _updateShotgunPumpVisuals(pumpZ) {
    this.shotgunPumpOffset = pumpZ;
    if (this.shotgunPumpGroup) {
      this.shotgunPumpGroup.position.z = pumpZ;
    }
    if (this.shotgunBoltGroup) {
      this.shotgunBoltGroup.position.z = pumpZ;
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

      // Rearward stroke: 0 -> 0.064m over 110ms
      this.posSpring.impulse(0, -0.012, 0.032);
      this.rotSpring.impulse(0.035, 0.012, -0.035);

      const pullBack = new TWEEN.Tween(pumpState, true)
        .to({ z: 0.064 }, 110)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          this._updateShotgunPumpVisuals(pumpState.z);
        })
        .onComplete(() => {
          if (typeof onEjectShell === 'function') onEjectShell();

          // Forward stroke: 0.064m -> 0 over 105ms
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
    if (this.isSlideLocked) {
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

    // 3. Smooth return for triggers
    if (this.triggerMesh && this.triggerMesh.rotation.x > 0.001) {
      this.triggerMesh.rotation.x = THREE.MathUtils.lerp(this.triggerMesh.rotation.x, 0, Math.min(delta * 20.0, 1.0));
    }
    if (this.shotgunTriggerMesh && this.shotgunTriggerMesh.rotation.x > 0.001) {
      this.shotgunTriggerMesh.rotation.x = THREE.MathUtils.lerp(this.shotgunTriggerMesh.rotation.x, 0, Math.min(delta * 20.0, 1.0));
    }
    if (this.pistolTriggerFingerGroup && this.pistolTriggerFingerGroup.rotation.x > 0.001) {
      this.pistolTriggerFingerGroup.rotation.x = THREE.MathUtils.lerp(this.pistolTriggerFingerGroup.rotation.x, 0, Math.min(delta * 20.0, 1.0));
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
    const activeMuzzle = this.currentWeapon === 'shotgun' ? this.shotgunMuzzleSocket : this.muzzleSocket;
    const activeEjection = this.currentWeapon === 'shotgun' ? this.shotgunEjectionAnchor : this.ejectionAnchor;
    activeMuzzle.updateWorldMatrix(true, false);
    activeMuzzle.getWorldPosition(this.muzzleWorldPos);
    activeEjection.updateWorldMatrix(true, false);
    activeEjection.getWorldPosition(this.ejectionWorldPos);
  }

  getMuzzleWorldPosition(targetVec) {
    const out = targetVec || this.muzzleWorldPos;
    const activeMuzzle = this.currentWeapon === 'shotgun' ? this.shotgunMuzzleSocket : this.muzzleSocket;
    activeMuzzle.updateWorldMatrix(true, false);
    return activeMuzzle.getWorldPosition(out);
  }

  getEjectionWorldPosition(targetVec) {
    const out = targetVec || this.ejectionWorldPos;
    const activeEjection = this.currentWeapon === 'shotgun' ? this.shotgunEjectionAnchor : this.ejectionAnchor;
    activeEjection.updateWorldMatrix(true, false);
    return activeEjection.getWorldPosition(out);
  }

  setSlideLocked(locked) {
    this.isSlideLocked = locked;
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
  }

  playDryFireTwitch() {
    this.rotSpring.impulse(-0.015, 0.008, -0.012);
  }

  // ===========================================================================
  // RELOAD ANIMATIONS
  // ===========================================================================

  startReloadAnimation(options = {}) {
    const { onComplete, shellsToLoad, onShellInserted } = options;

    this.reloadTimers.forEach((id) => clearTimeout(id));
    this.reloadTimers.length = 0;
    this.reloadTweens.forEach((tw) => tw.stop());
    this.reloadTweens.length = 0;

    this.isReloading = true;

    if (this.currentWeapon === 'shotgun') {
      this._startShotgunReloadAnimation(shellsToLoad, onShellInserted, onComplete);
      return;
    }

    // Reset magGroup position
    if (this.magGroup) {
      this.magGroup.position.set(0, 0, 0);
      this.magGroup.visible = true;
    }

    // STAGE 1 — Tilt & Mag Eject (0.00s to 0.35s)
    const tiltIn = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: 0.38, pitch: 0.16, yaw: 0.12, y: -0.02 }, 350)
      .easing(TWEEN.Easing.Cubic.Out);
    this.reloadTweens.push(tiltIn);
    tiltIn.start();

    if (this.sound) this.sound.playMagOut();

    if (this.magGroup) {
      const magDrop = new TWEEN.Tween(this.magGroup.position, true)
        .to({ y: -0.22 }, 320)
        .easing(TWEEN.Easing.Quadratic.In)
        .onComplete(() => {
          this.magGroup.visible = false;
        });
      this.reloadTweens.push(magDrop);
      magDrop.start();
    }

    // STAGE 2 — Fresh Mag Insert & Seating Slap (0.35s to 0.80s)
    const stage2Timer = setTimeout(() => {
      if (!this.isReloading) return;

      if (this.magGroup) {
        this.magGroup.position.set(0, -0.22, 0);
        this.magGroup.visible = true;

        const magInsert = new TWEEN.Tween(this.magGroup.position, true)
          .to({ y: 0 }, 450)
          .easing(TWEEN.Easing.Back.Out)
          .onComplete(() => {
            this.magGroup.position.set(0, 0, 0);
            this.posSpring.impulse(0, 0.065, 0);
            this.rotSpring.impulse(0.020, 0, 0.040);
            if (this.sound) this.sound.playMagIn();
          });
        this.reloadTweens.push(magInsert);
        magInsert.start();
      }
    }, 350);
    this.reloadTimers.push(stage2Timer);

    // STAGE 3 — Slide Release Slam & Return to Ready (0.80s to 1.15s)
    const stage3Timer = setTimeout(() => {
      if (!this.isReloading) return;

      const slideReleaseTimer = setTimeout(() => {
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
      }, 80);
      this.reloadTimers.push(slideReleaseTimer);

      const tiltOut = new TWEEN.Tween(this.reloadTilt, true)
        .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, 300)
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
    }, 800);
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
        .to({ z: 0.064 }, 110)
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

  reset() {
    this.reloadTimers.forEach((id) => clearTimeout(id));
    this.reloadTimers.length = 0;
    this.reloadTweens.forEach((tw) => tw.stop());
    this.reloadTweens.length = 0;

    this.isReloading = false;
    this.isPumping = false;
    this.isSlideLocked = false;
    this.slideBlowback = 0;

    if (this.slideGroup) this.slideGroup.position.set(0, 0, 0);
    if (this.pistolSlideMesh && this.deSlideRestZ !== undefined) {
      this.pistolSlideMesh.position.z = this.deSlideRestZ;
    }
    if (this.magGroup) {
      this.magGroup.position.set(0, 0, 0);
      this.magGroup.visible = true;
    }
    this._updateShotgunPumpVisuals(0);
    if (this.shotgunReloadShell) this.shotgunReloadShell.visible = false;
    if (this.shotgunLeftHandGroup) {
      this.shotgunLeftHandGroup.position.set(0, 0, 0);
      this.shotgunLeftHandGroup.rotation.set(0, 0, 0);
    }
    if (this.pistolTriggerFingerGroup) this.pistolTriggerFingerGroup.rotation.x = 0;
    if (this.muzzleFlashGroup) this.muzzleFlashGroup.visible = false;

    this.posSpring.reset();
    this.rotSpring.reset();
    this.reloadTilt.x = 0;
    this.reloadTilt.y = 0;
    this.reloadTilt.z = 0;
    this.reloadTilt.pitch = 0;
    this.reloadTilt.yaw = 0;
    this.reloadTilt.roll = 0;
  }
}
