import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import * as TWEEN from '@tweenjs/tween.js';
import { Spring3D, Spring1D } from '../player/Spring.js';

// Pre-allocated scratch vector for zero-GC calculations
const _scratchVec = new THREE.Vector3();

// Singleton cached procedural textures (created strictly once at startup)
let _cachedBrushedTexture = null;
let _cachedNoiseTexture = null;
let _cachedEngravingTexture = null;
let _cachedFlashTexture = null;
let _cachedWalnutTexture = null;
let _cachedWinchesterEngravingTexture = null;

/**
 * Creates an offline procedural horizontal brushed-steel grain texture (256x256)
 * for bumpMap and roughnessMap, producing authentic anisotropic machined satin steel.
 */
function createBrushedMetalTextures() {
  if (_cachedBrushedTexture) return _cachedBrushedTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Dark gray base (#70747c)
  ctx.fillStyle = '#70747c';
  ctx.fillRect(0, 0, 256, 256);

  // 1,200 fine, horizontal semi-transparent streaks of varying opacity (3% - 8%)
  for (let i = 0; i < 1200; i++) {
    const y = Math.random() * 256;
    const x = Math.random() * 200;
    const len = 30 + Math.random() * 110;
    const isLight = Math.random() > 0.5;
    const alpha = 0.03 + Math.random() * 0.05; // 3% - 8%
    ctx.strokeStyle = isLight ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;
    ctx.lineWidth = 0.5 + Math.random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }

  _cachedBrushedTexture = new THREE.CanvasTexture(canvas);
  _cachedBrushedTexture.wrapS = THREE.RepeatWrapping;
  _cachedBrushedTexture.wrapT = THREE.RepeatWrapping;
  _cachedBrushedTexture.repeat.set(2, 2);
  _cachedBrushedTexture.needsUpdate = true;
  return _cachedBrushedTexture;
}

/**
 * Creates an offline procedural stippled noise texture (128x128)
 * for the vulcanized high-grip polymer panels.
 */
function createProceduralNoiseTexture() {
  if (_cachedNoiseTexture) return _cachedNoiseTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);

  const imgData = ctx.getImageData(0, 0, 128, 128);
  const data = imgData.data;

  // Dense fine stipple grain
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 110;
    const v = Math.min(255, Math.max(0, Math.round(128 + n)));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // Vulcanized pebble stipples with micro-shadowing
  for (let i = 0; i < 180; i++) {
    const rx = Math.random() * 128;
    const ry = Math.random() * 128;
    const rad = 0.8 + Math.random() * 1.4;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.arc(rx + 0.5, ry + 0.5, rad, 0, Math.PI * 2);
    ctx.fill();

    const bright = 190 + Math.random() * 55;
    ctx.fillStyle = `rgb(${bright},${bright},${bright})`;
    ctx.beginPath();
    ctx.arc(rx - 0.3, ry - 0.3, rad * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  _cachedNoiseTexture = new THREE.CanvasTexture(canvas);
  _cachedNoiseTexture.wrapS = THREE.RepeatWrapping;
  _cachedNoiseTexture.wrapT = THREE.RepeatWrapping;
  _cachedNoiseTexture.repeat.set(4, 8);
  _cachedNoiseTexture.needsUpdate = true;
  return _cachedNoiseTexture;
}

/**
 * Creates an optimized canvas (256x64) for crisp factory engravings:
 * "MAGNUM RESEARCH INC. / PILLAGER, MN USA" and "50 AE".
 */
function createEngravingTexture() {
  if (_cachedEngravingTexture) return _cachedEngravingTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 64);

  // Dark laser-etched industrial typography
  ctx.fillStyle = '#181b20';
  ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MAGNUM RESEARCH INC.', 12, 24);

  ctx.font = 'bold 7px Arial, Helvetica, sans-serif';
  ctx.fillText('PILLAGER, MN USA', 12, 38);

  ctx.font = 'bold 14px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('50 AE', 242, 39);

  _cachedEngravingTexture = new THREE.CanvasTexture(canvas);
  _cachedEngravingTexture.colorSpace = THREE.SRGBColorSpace;
  _cachedEngravingTexture.needsUpdate = true;
  return _cachedEngravingTexture;
}

/**
 * Creates a rich procedural oiled American walnut woodgrain texture (256x256)
 * for the Winchester Model 1912 buttstock, semi-pistol wrist, and ribbed corn-cob pump fore-end.
 */
function createWalnutWoodTexture() {
  if (_cachedWalnutTexture) return _cachedWalnutTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Warm American walnut base gradient
  const baseGrad = ctx.createLinearGradient(0, 0, 256, 256);
  baseGrad.addColorStop(0.0, '#6e3a1a');
  baseGrad.addColorStop(0.35, '#7c4320');
  baseGrad.addColorStop(0.70, '#5e3015');
  baseGrad.addColorStop(1.0, '#6b3819');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Longitudinal wood fiber streaks and organic cathedral grain waves
  for (let i = 0; i < 950; i++) {
    const y = Math.random() * 256;
    const x = Math.random() * 220;
    const len = 35 + Math.random() * 140;
    const wave = (Math.random() - 0.5) * 4.5;
    const isDark = Math.random() > 0.36;
    const alpha = 0.05 + Math.random() * 0.12;
    ctx.strokeStyle = isDark
      ? `rgba(28, 12, 4, ${alpha})`
      : `rgba(168, 98, 48, ${alpha * 0.75})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y + wave, x + len, y + (Math.random() - 0.5) * 2.0);
    ctx.stroke();
  }

  // Subtle fine wood pore stipple
  for (let i = 0; i < 400; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    ctx.fillStyle = 'rgba(20, 8, 2, 0.14)';
    ctx.fillRect(px, py, 3 + Math.random() * 5, 0.8);
  }

  _cachedWalnutTexture = new THREE.CanvasTexture(canvas);
  _cachedWalnutTexture.colorSpace = THREE.SRGBColorSpace;
  _cachedWalnutTexture.wrapS = THREE.RepeatWrapping;
  _cachedWalnutTexture.wrapT = THREE.RepeatWrapping;
  _cachedWalnutTexture.repeat.set(2, 2);
  _cachedWalnutTexture.needsUpdate = true;
  return _cachedWalnutTexture;
}

/**
 * Creates a factory roll-mark engraving texture (256x64) for the Winchester Model 1912 receiver:
 * "WINCHESTER — MODEL 12 — 12 GA." and "U.S." ordnance stamp.
 */
function createWinchesterEngravingTexture() {
  if (_cachedWinchesterEngravingTexture) return _cachedWinchesterEngravingTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 64);

  ctx.fillStyle = '#9aa4b2';
  ctx.font = 'bold 10px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'left';
  ctx.fillText('WINCHESTER — MODEL 1912', 12, 24);

  ctx.font = 'bold 8px Arial, Helvetica, sans-serif';
  ctx.fillText('12 GA. — 2 3/4 CHAM. — FULL', 12, 39);

  ctx.font = 'bold 15px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'right';
  ctx.fillText('U.S.', 242, 38);

  _cachedWinchesterEngravingTexture = new THREE.CanvasTexture(canvas);
  _cachedWinchesterEngravingTexture.colorSpace = THREE.SRGBColorSpace;
  _cachedWinchesterEngravingTexture.needsUpdate = true;
  return _cachedWinchesterEngravingTexture;
}

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

  // Fully transparent canvas clear
  ctx.clearRect(0, 0, 256, 256);

  // 1. Soft radial flame glow (fades completely before border)
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

  // 2. 8 Jagged, tapered flame spikes radiating from center
  const numSpikes = 8;
  for (let i = 0; i < numSpikes; i++) {
    const angle = (i / numSpikes) * Math.PI * 2 + (i % 2 === 0 ? 0.06 : -0.06);
    const spikeLength = 68 + (i % 3) * 11; // within 92px max radius (<75% of 128)
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
 * Master Procedural Desert Eagle .50 First-Person Viewmodel.
 * Final Precision Polish:
 * - 100% unified beveled front muzzle with zero stray cubes or jutting blocks
 * - Smooth contoured combat hammer spur nestled in recessed slot above swept beaver-tail tang
 * - Seamless silver frame transition flowing into the sweeping beaver-tail over the grip
 * - Flush-embedded circular fiber-optic dots inside dark counterbore sight blades
 * - Compact hand-cannon proportions with clean horizontal dust-rail panel gap
 */
export class WeaponViewmodel {
  constructor(camera, soundManager) {
    this.camera = camera;
    this.sound = soundManager;

    // Viewmodel root attached directly to camera
    this.root = new THREE.Group();
    this.root.name = 'WeaponViewmodel';
    this.camera.add(this.root);

    // Active weapon type ('pistol' = Slot 1 Desert Eagle .50 AE, 'shotgun' = Slot 2 Winchester Model 1912)
    this.currentWeapon = 'pistol';

    // Dedicated World-Space Muzzle Sockets for bullet/pellet tracers & effects
    this.muzzleSocket = new THREE.Object3D();
    this.muzzleSocket.name = 'PistolMuzzleSocket';
    this.shotgunMuzzleSocket = new THREE.Object3D();
    this.shotgunMuzzleSocket.name = 'ShotgunMuzzleSocket';
    this.muzzleWorldPos = new THREE.Vector3();
    this.muzzleAnchor = this.muzzleSocket;

    // Ejection port anchors & world position for .50 AE brass casings and 12-gauge red hulls
    this.ejectionAnchor = new THREE.Group();
    this.shotgunEjectionAnchor = new THREE.Group();
    this.ejectionWorldPos = new THREE.Vector3();
    this.flashTimer = 0;

    // Slot 1 (.50 AE Desert Eagle) Hip & ADS Transforms
    // Sightline Height: Low-profile combat sights sit at local y = +0.0515
    this.pistolHipPosition = new THREE.Vector3(0.165, -0.142, -0.30);
    this.pistolAdsPosition = new THREE.Vector3(0.0, -0.0515, -0.21);
    this.pistolHipRotation = new THREE.Euler(0.05, -0.08, 0.02);
    this.pistolAdsRotation = new THREE.Euler(0, 0, 0);

    // Slot 2 (Winchester Model 1912 12-Gauge Shotgun) Hip & ADS Transforms
    // Sightline Height: Matted receiver sighting groove & front brass bead sit at local y = +0.0495
    this.shotgunHipPosition = new THREE.Vector3(0.158, -0.118, -0.285);
    this.shotgunAdsPosition = new THREE.Vector3(0.0, -0.0495, -0.225);
    this.shotgunHipRotation = new THREE.Euler(0.035, -0.095, 0.015);
    this.shotgunAdsRotation = new THREE.Euler(0, 0, 0);

    this.hipPosition = this.pistolHipPosition;
    this.adsPosition = this.pistolAdsPosition;
    this.hipRotation = this.pistolHipRotation;
    this.adsRotation = this.pistolAdsRotation;

    this.isADS = false;
    this.adsAlpha = 0;

    // Slide Blowback, Hammer Action, Pump Action & Reload state
    this.slideBlowback = 0;
    this.hammerRecoil = 0;
    this.hammerRestAngle = 0.40; // Cocked backward resting nicely above beaver-tail
    this.isSlideLocked = false;
    this.isReloading = false;
    this.isPumping = false;
    this.shotgunPumpOffset = 0;
    this.reloadTilt = { roll: 0, pitch: 0, yaw: 0, y: 0 };
    this.triggerMesh = null;
    this.shotgunTriggerMesh = null;
    this.magRelease = null;
    this.magGroup = null;
    this.shotgunGroup = null;
    this.shotgunPumpGroup = null;
    this.shotgunBoltGroup = null;
    this.shotgunCarrierGroup = null;
    this.shotgunReloadShell = null;
    this.reloadTweens = [];
    this.reloadTimers = [];

    // Damped Harmonic Springs (Zero-GC)
    this.posSpring = new Spring3D({
      stiffness: 240,
      damping: 22,
      mass: 0.85,
      initial: this.hipPosition,
    });

    this.rotSpring = new Spring3D({
      stiffness: 270,
      damping: 24,
      mass: 0.7,
      initial: new THREE.Vector3(0.05, -0.08, 0.02),
    });

    // Walking weapon bob
    this.bobCycle = 0;
    this.bobSpring = new Spring3D({ stiffness: 180, damping: 18, mass: 1.0 });

    // Build 3D meshes for both weapons
    this._buildMaterials();
    this._buildGunMesh();
    this._buildShotgunMesh();
    this._buildMuzzleFlashRig();

    // Disable shadow casting and receiving on first-person gun to eliminate shadow map passes
    this.root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
  }

  _buildMaterials() {
    // Procedural Textures
    this.brushedNoiseTexture = createBrushedMetalTextures();
    this.gripNoiseTexture = createProceduralNoiseTexture();
    this.engravingTexture = createEngravingTexture();

    // 1. Satin Brushed Steel (Slide, Barrel & Frame Chassis)
    this.steelMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a909a,
      metalness: 0.95,
      roughness: 0.32,
      bumpMap: this.brushedNoiseTexture,
      bumpScale: 0.0012,
      roughnessMap: this.brushedNoiseTexture,
      envMapIntensity: 1.15,
    });

    // 2. Machined Slide Serration Gunmetal Ribs (0x4a5058)
    this.serrationMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a5058,
      metalness: 0.90,
      roughness: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // 3. Inner Mechanical Dark Steel (Controls, Levers, Hammer, Safety) (0x22262b)
    this.darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x22262b,
      metalness: 0.88,
      roughness: 0.38,
      envMapIntensity: 0.80,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // 4. Heavy Textured Vulcanized Black Polymer (Grip panels)
    this.gripMaterial = new THREE.MeshStandardMaterial({
      color: 0x141618,
      metalness: 0.08,
      roughness: 0.82,
      bumpMap: this.gripNoiseTexture,
      bumpScale: 0.0035,
    });

    // 5. Deep Shadow Cavity Steel (Slots, panel seams, bore)
    this.cavityMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0c0e,
      metalness: 0.80,
      roughness: 0.85,
      envMapIntensity: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    // 6. Pitch Black Inner Bore Hole
    this.innerBoreMat = new THREE.MeshBasicMaterial({
      color: 0x040404,
    });

    // 7. High-Visibility Glowing Orange Fiber-Optic Combat Dots (Visible in both Hip-Fire & ADS)
    this.fiberOpticMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    // 8. Factory Laser-Etched Engravings Decal Material
    this.engravingMaterial = new THREE.MeshBasicMaterial({
      map: this.engravingTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    // 9. Procedural Fiery Muzzle Flash Additive Material
    this.flameTexture = createMuzzleFlashTexture();
    this.muzzleFlashMaterial = new THREE.MeshBasicMaterial({
      map: this.flameTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      opacity: 1.0,
    });

    // 10. Winchester Model 1912 Deep Charcoal-Blued Ordnance Steel (Balanced satin gunmetal-blue)
    this.bluedSteelMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b3340,
      metalness: 0.58,
      roughness: 0.34,
      bumpMap: this.brushedNoiseTexture,
      bumpScale: 0.0010,
      roughnessMap: this.brushedNoiseTexture,
      envMapIntensity: 0.78,
    });

    // 11. Polished Nickel / Stainless Breechbolt & Shell Lifter (Signature bright silver bolt)
    this.brightBoltMaterial = new THREE.MeshStandardMaterial({
      color: 0xe6edf5,
      metalness: 0.48,
      roughness: 0.24,
      emissive: 0x222933,
      emissiveIntensity: 0.35,
      bumpMap: this.brushedNoiseTexture,
      bumpScale: 0.0007,
      envMapIntensity: 1.15,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    // 12. Oiled American Walnut Stock & Ribbed Corn-Cob Pump Fore-End
    this.walnutTexture = createWalnutWoodTexture();
    this.walnutMaterial = new THREE.MeshStandardMaterial({
      map: this.walnutTexture,
      color: 0xd98a54,
      metalness: 0.06,
      roughness: 0.38,
      bumpMap: this.walnutTexture,
      bumpScale: 0.0028,
      envMapIntensity: 0.80,
    });

    // 13. Deep Recessed Walnut Grooves (For the 18-ring "Corn-Cob" pump handle)
    this.walnutGrooveMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e0d04,
      metalness: 0.04,
      roughness: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // 14. Classic Polished Brass (Front Sight Bead & 12-Gauge Shell High-Brass Head)
    this.brassMaterial = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.92,
      roughness: 0.20,
      envMapIntensity: 1.25,
    });

    // 15. Crimson 12-Gauge Shotshell Hull Material
    this.shellHullMaterial = new THREE.MeshStandardMaterial({
      color: 0xc81e1e,
      metalness: 0.08,
      roughness: 0.42,
    });

    // 16. Winchester Model 1912 Roll-Mark Receiver Engraving Material
    this.winchesterEngravingTexture = createWinchesterEngravingTexture();
    this.winchesterEngravingMaterial = new THREE.MeshBasicMaterial({
      map: this.winchesterEngravingTexture,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  _buildGunMesh() {
    this.gunGroup = new THREE.Group();
    this.gunGroup.name = 'DesertEagle50';
    this.root.add(this.gunGroup);

    // Solid internal structural core
    this.coreGroup = new THREE.Group();
    this.coreGroup.name = 'StructuralCore';
    this.gunGroup.add(this.coreGroup);

    // 0.1 Inner barrel cylinder running forward inside frame (spans z = -0.120 to +0.030)
    const coreCylinderGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.150, 24);
    coreCylinderGeo.rotateX(Math.PI / 2);
    const coreCylinder = new THREE.Mesh(coreCylinderGeo, this.darkMaterial);
    coreCylinder.position.set(0, 0.018, -0.045);
    this.coreGroup.add(coreCylinder);

    // 0.2 Lower frame internal deck (width 0.028 to prevent any side frame bleed)
    const coreDeckGeo = new THREE.BoxGeometry(0.028, 0.020, 0.150);
    const coreDeck = new THREE.Mesh(coreDeckGeo, this.darkMaterial);
    coreDeck.position.set(0, 0.006, -0.045);
    this.coreGroup.add(coreDeck);


    // Dual-profile barrel & fore-end
    this.barrelGroup = new THREE.Group();
    this.barrelGroup.name = 'BarrelAssembly';
    this.gunGroup.add(this.barrelGroup);

    // 1.1 Polygonal Upper Barrel with Hallmark Triangular/Hexagonal Cross-Section
    // +12% width: outer flats at x = ±0.0224 (width = 0.0448m)
    const barrelShape = new THREE.Shape();
    barrelShape.moveTo(-0.0135, 0.046); // Top flat (width 0.027)
    barrelShape.lineTo(0.0135, 0.046);
    barrelShape.lineTo(0.0224, 0.035);  // Upper 45° angled chamfer
    barrelShape.lineTo(0.0224, 0.005);  // Vertical flat side flank
    barrelShape.lineTo(0.0135, -0.008); // Lower inward bevel to seam
    barrelShape.lineTo(-0.0135, -0.008);
    barrelShape.lineTo(-0.0224, 0.005);
    barrelShape.lineTo(-0.0224, 0.035);
    barrelShape.closePath();

    // 18% compact length: extrudes 0.138m from z = -0.152 to z = -0.014
    // Smooth beveled front edges—NO extra cubes, rogue steps or misaligned blocks!
    const barrelExtrudeSettings = {
      depth: 0.138,
      bevelEnabled: true,
      bevelThickness: 0.0025,
      bevelSize: 0.0025,
      bevelSegments: 2,
    };
    const barrelGeo = new THREE.ExtrudeGeometry(barrelShape, barrelExtrudeSettings);
    const barrelMesh = new THREE.Mesh(barrelGeo, this.steelMaterial);
    barrelMesh.position.set(0, 0, -0.152);
    this.barrelGroup.add(barrelMesh);

    // 1.2 Lower Dust-Cover Rail Under Barrel (Matches Full Width of Frame: 0.0448m)
    // Sits flush at z = -0.150, cleanly separated by a horizontal panel gap
    const dustRailGeo = new THREE.BoxGeometry(0.0448, 0.015, 0.136);
    const dustRail = new THREE.Mesh(dustRailGeo, this.steelMaterial);
    dustRail.position.set(0, -0.004, -0.082);
    this.barrelGroup.add(dustRail);

    // Clean horizontal panel gap separating upper triangular barrel from lower frame rail
    const panelGapGeo = new THREE.BoxGeometry(0.0452, 0.0016, 0.136);
    const panelGap = new THREE.Mesh(panelGapGeo, this.cavityMaterial);
    panelGap.position.set(0, 0.0045, -0.082);
    this.barrelGroup.add(panelGap);

    // Bottom Picatinny accessory slots on underside of dust cover
    const railBottomGeo = new THREE.BoxGeometry(0.024, 0.0025, 0.100);
    const railBottom = new THREE.Mesh(railBottomGeo, this.cavityMaterial);
    railBottom.position.set(0, -0.0125, -0.082);
    this.barrelGroup.add(railBottom);

    const bottomSlotGeo = new THREE.BoxGeometry(0.025, 0.0020, 0.005);
    const bottomSlotGeos = [];
    for (let i = 0; i < 4; i++) {
      const bz = -0.117 + i * 0.022;
      const g = bottomSlotGeo.clone();
      g.translate(0, -0.0135, bz);
      bottomSlotGeos.push(g);
    }
    const mergedBottomSlots = BufferGeometryUtils.mergeGeometries(bottomSlotGeos, false);
    const bSlotMesh = new THREE.Mesh(mergedBottomSlots, this.steelMaterial);
    this.barrelGroup.add(bSlotMesh);
    bottomSlotGeo.dispose();
    bottomSlotGeos.forEach(g => g.dispose());

    // 1.3 Muzzle Compensator Ports (4 Vertical Slot Cuts merged into unified meshes)
    const portGeo = new THREE.BoxGeometry(0.0036, 0.013, 0.0034);
    const portBackingGeo = new THREE.BoxGeometry(0.0042, 0.014, 0.0040);
    const numPorts = 4;
    const portStartZ = -0.142;
    const portStepZ = 0.0075;
    const backingGeos = [];
    const cutGeos = [];

    for (let i = 0; i < numPorts; i++) {
      const pz = portStartZ + i * portStepZ;

      // Left port shadow backing + slot
      const lb = portBackingGeo.clone();
      lb.rotateZ(-0.785);
      lb.translate(-0.0175, 0.0405, pz);
      backingGeos.push(lb);

      const lp = portGeo.clone();
      lp.rotateZ(-0.785);
      lp.translate(-0.0178, 0.0410, pz);
      cutGeos.push(lp);

      // Right port shadow backing + slot
      const rb = portBackingGeo.clone();
      rb.rotateZ(0.785);
      rb.translate(0.0175, 0.0405, pz);
      backingGeos.push(rb);

      const rp = portGeo.clone();
      rp.rotateZ(0.785);
      rp.translate(0.0178, 0.0410, pz);
      cutGeos.push(rp);
    }

    const mergedBackings = BufferGeometryUtils.mergeGeometries(backingGeos, false);
    const backingsMesh = new THREE.Mesh(mergedBackings, this.cavityMaterial);
    this.barrelGroup.add(backingsMesh);

    const mergedPorts = BufferGeometryUtils.mergeGeometries(cutGeos, false);
    const portsMesh = new THREE.Mesh(mergedPorts, this.darkMaterial);
    this.barrelGroup.add(portsMesh);

    portGeo.dispose();
    portBackingGeo.dispose();
    backingGeos.forEach(g => g.dispose());
    cutGeos.forEach(g => g.dispose());

    // 1.4 Flush Recessed .50 Caliber Bore (Centered cleanly on front barrel face)
    // Chamfered dark steel crown lip embedded flush into muzzle face at z = -0.1522
    const crownRimGeo = new THREE.CylinderGeometry(0.0135, 0.0145, 0.0025, 28);
    crownRimGeo.rotateX(Math.PI / 2);
    const crownRim = new THREE.Mesh(crownRimGeo, this.darkMaterial);
    crownRim.position.set(0, 0.018, -0.1522);
    this.barrelGroup.add(crownRim);

    // Deep recessed dark .50 AE bore cylinder
    const boreGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.045, 28);
    boreGeo.rotateX(Math.PI / 2);
    const boreMesh = new THREE.Mesh(boreGeo, this.innerBoreMat);
    boreMesh.position.set(0, 0.018, -0.132);
    this.barrelGroup.add(boreMesh);

    // Dedicated Muzzle Socket & Anchor Point inside barrel tip at center of hollow .50 AE bore
    this.muzzleSocket.position.set(0, 0.018, -0.156);
    this.barrelGroup.add(this.muzzleSocket);
    this.muzzleAnchor = this.muzzleSocket;

    // Ejection Anchor Point for .50 AE Brass Casings (Chamber Port on right side)
    this.ejectionAnchor.position.set(0.018, 0.032, 0.015);
    this.gunGroup.add(this.ejectionAnchor);

    // 1.5 Top Picatinny Rail (8 Deeply Cut Cross-Slots) & Raised Spine
    const railSpineGeo = new THREE.BoxGeometry(0.022, 0.0025, 0.126);
    const railSpine = new THREE.Mesh(railSpineGeo, this.steelMaterial);
    railSpine.position.set(0, 0.0465, -0.078);
    this.barrelGroup.add(railSpine);

    const railCavityGeo = new THREE.BoxGeometry(0.021, 0.002, 0.124);
    const railCavity = new THREE.Mesh(railCavityGeo, this.cavityMaterial);
    railCavity.position.set(0, 0.0475, -0.078);
    this.barrelGroup.add(railCavity);

    // 8 distinct deeply cut cross-slots with steel teeth (Merged into 1 draw call)
    const toothGeo = new THREE.BoxGeometry(0.0225, 0.0035, 0.0075);
    const numTeeth = 8;
    const toothStartZ = -0.130;
    const toothSpan = 0.104;
    const toothGeos = [];
    for (let i = 0; i < numTeeth; i++) {
      const tz = toothStartZ + (i / (numTeeth - 1)) * toothSpan;
      const g = toothGeo.clone();
      g.translate(0, 0.0495, tz);
      toothGeos.push(g);
    }
    const mergedTeeth = BufferGeometryUtils.mergeGeometries(toothGeos, false);
    const toothMesh = new THREE.Mesh(mergedTeeth, this.steelMaterial);
    this.barrelGroup.add(toothMesh);
    toothGeo.dispose();
    toothGeos.forEach(g => g.dispose());

    // 1.6 Front Ramp Blade Sight
    const frontSightShape = new THREE.Shape();
    frontSightShape.moveTo(-0.006, 0.044);
    frontSightShape.lineTo(0.006, 0.044);
    frontSightShape.lineTo(-0.001, 0.0515); // Ramp apex
    frontSightShape.lineTo(-0.006, 0.0515);
    frontSightShape.closePath();

    const frontSightGeo = new THREE.ExtrudeGeometry(frontSightShape, {
      depth: 0.0036,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0006,
      bevelSegments: 1,
    });
    frontSightGeo.rotateY(Math.PI / 2);
    const frontBlade = new THREE.Mesh(frontSightGeo, this.darkMaterial);
    frontBlade.position.set(-0.0018, 0, -0.138);
    this.barrelGroup.add(frontBlade);

    // Front glowing orange fiber-optic bead facing shooter (y = 0.0515)
    const frontDotGeo = new THREE.SphereGeometry(0.0016, 16, 16);
    const frontDot = new THREE.Mesh(frontDotGeo, this.fiberOpticMaterial);
    frontDot.position.set(0, 0.0515, -0.136);
    frontDot.visible = true;
    this.barrelGroup.add(frontDot);

    // 1.7 Solid Rounded Barrel Chamber Hood (Seamlessly Spans Gap to Rear Slide)
    const hoodBlockGeo = new THREE.BoxGeometry(0.031, 0.032, 0.054);
    const hoodBlock = new THREE.Mesh(hoodBlockGeo, this.steelMaterial);
    hoodBlock.position.set(0, 0.026, 0.009);
    this.barrelGroup.add(hoodBlock);

    // 32-segment rounded cylindrical crown reaching y = 0.046 flush with barrel top
    const hoodCylinderGeo = new THREE.CylinderGeometry(0.0195, 0.0195, 0.054, 32);
    hoodCylinderGeo.rotateX(Math.PI / 2);
    const hoodCylinder = new THREE.Mesh(hoodCylinderGeo, this.steelMaterial);
    hoodCylinder.position.set(0, 0.0265, 0.009);
    this.barrelGroup.add(hoodCylinder);

    // Recessed extractor cutout groove on right chamber flank
    const chamberCutoutGeo = new THREE.BoxGeometry(0.004, 0.006, 0.024);
    const chamberCutout = new THREE.Mesh(chamberCutoutGeo, this.cavityMaterial);
    chamberCutout.position.set(0.015, 0.037, 0.015);
    this.barrelGroup.add(chamberCutout);

    // 1.8 Factory Laser-Etched Engravings Decal
    const engravePlaneGeo = new THREE.PlaneGeometry(0.118, 0.032);
    const engraveMesh = new THREE.Mesh(engravePlaneGeo, this.engravingMaterial);
    engraveMesh.rotation.y = -Math.PI / 2;
    engraveMesh.position.set(-0.0227, 0.020, -0.078);
    this.barrelGroup.add(engraveMesh);


    // Reciprocating rear slide assembly
    this.slideGroup = new THREE.Group();
    this.slideGroup.name = 'SlideAssembly';
    this.gunGroup.add(this.slideGroup);

    // 2.1 Unified Left Slide Flank & Bridge (100% Flush with Front Barrel down to 0.0000)
    // Seamlessly matches barrel outer X (-0.0224), upper 45° chamfer, and top deck (y = 0.046)
    const leftSlideShape = new THREE.Shape();
    leftSlideShape.moveTo(-0.0135, 0.046); // Matches barrel top flat exactly
    leftSlideShape.lineTo(-0.0224, 0.035); // Matches barrel upper 45° chamfer exactly
    leftSlideShape.lineTo(-0.0224, 0.014); // Matches barrel vertical outer wall exactly at x = -0.0224
    leftSlideShape.lineTo(-0.0164, 0.014); // Bottom rail seam (wall thickness 0.006)
    leftSlideShape.lineTo(-0.0164, 0.035); // Inner vertical wall
    leftSlideShape.lineTo(-0.0135, 0.041); // Inner chamfer
    leftSlideShape.closePath();

    const leftSlideGeo = new THREE.ExtrudeGeometry(leftSlideShape, {
      depth: 0.086, // Spans from z = -0.014 to z = 0.072 continuously with ZERO protruding ledge
      bevelEnabled: false,
    });
    const leftSlide = new THREE.Mesh(leftSlideGeo, this.steelMaterial);
    leftSlide.position.set(0, 0, -0.014);
    this.slideGroup.add(leftSlide);

    // 2.2 Top Slide Deck Bridge (Behind ejection port)
    const topSlideGeo = new THREE.BoxGeometry(0.027, 0.005, 0.040);
    const topSlide = new THREE.Mesh(topSlideGeo, this.steelMaterial);
    topSlide.position.set(0, 0.0435, 0.052);
    this.slideGroup.add(topSlide);

    // 2.3 Right Slide Rear Flank & Lower Guide Rail (Shiny silver steel)
    const rightSlideShape = new THREE.Shape();
    rightSlideShape.moveTo(0.0135, 0.046);
    rightSlideShape.lineTo(0.0224, 0.035);
    rightSlideShape.lineTo(0.0224, 0.014);
    rightSlideShape.lineTo(0.0164, 0.014);
    rightSlideShape.lineTo(0.0164, 0.035);
    rightSlideShape.lineTo(0.0135, 0.041);
    rightSlideShape.closePath();

    const rightSlideGeo = new THREE.ExtrudeGeometry(rightSlideShape, {
      depth: 0.040,
      bevelEnabled: false,
    });
    const rightRearSlide = new THREE.Mesh(rightSlideGeo, this.steelMaterial);
    rightRearSlide.position.set(0, 0, 0.032);
    this.slideGroup.add(rightRearSlide);

    const rightRailGeo = new THREE.BoxGeometry(0.006, 0.008, 0.046);
    const rightRail = new THREE.Mesh(rightRailGeo, this.steelMaterial);
    rightRail.position.set(0.0194, 0.010, 0.009);
    this.slideGroup.add(rightRail);

    // Spring-loaded extractor claw mounted in slide
    const extractorGeo = new THREE.BoxGeometry(0.003, 0.005, 0.012);
    const extractor = new THREE.Mesh(extractorGeo, this.darkMaterial);
    extractor.position.set(0.0220, 0.022, 0.030);
    this.slideGroup.add(extractor);

    // 2.4 Machined Slide Serration Grooves (10 Thin Grooves Spanning Full Height, merged into 1 draw call)
    // Spans cleanly from bottom edge (y = 0.014) up to angled bevel line (y = 0.035)
    const serrationRibGeo = new THREE.BoxGeometry(0.0008, 0.0215, 0.0012);
    const numSerrations = 10;
    const serrationStartZ = 0.035;
    const serrationStepZ = 0.0025; // 10 evenly spaced grooves
    const serrationGeos = [];

    for (let i = 0; i < numSerrations; i++) {
      const sz = serrationStartZ + i * serrationStepZ;

      // Left serration groove (protrudes by only +0.0004 outside silver wall at x = -0.0224)
      const lg = serrationRibGeo.clone();
      lg.rotateX(0.12); // Authentic forward slant
      lg.translate(-0.0226, 0.0245, sz);
      serrationGeos.push(lg);

      // Right serration groove
      const rg = serrationRibGeo.clone();
      rg.rotateX(0.12);
      rg.translate(0.0226, 0.0245, sz);
      serrationGeos.push(rg);
    }

    const mergedSerrations = BufferGeometryUtils.mergeGeometries(serrationGeos, false);
    const serrationsMesh = new THREE.Mesh(mergedSerrations, this.serrationMaterial);
    this.slideGroup.add(serrationsMesh);
    serrationRibGeo.dispose();
    serrationGeos.forEach(g => g.dispose());

    // 2.5 Ambidextrous Teardrop Safety Levers in Dark Steel (0x22262b)
    // Tightly hugs the slide wall without floating out to the side
    const safetyPinGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.044, 16);
    safetyPinGeo.rotateZ(Math.PI / 2);
    const safetyPin = new THREE.Mesh(safetyPinGeo, this.darkMaterial);
    safetyPin.position.set(0, 0.035, 0.063);
    this.slideGroup.add(safetyPin);

    // Teardrop paddle shape
    const safetyShape = new THREE.Shape();
    safetyShape.moveTo(0, 0);
    safetyShape.absarc(0, 0, 0.0038, 0, Math.PI * 2, false);
    safetyShape.moveTo(0, 0.0038);
    safetyShape.lineTo(-0.008, 0.002);
    safetyShape.lineTo(-0.008, -0.003);
    safetyShape.lineTo(0, -0.0038);
    safetyShape.closePath();

    const safetyGeo = new THREE.ExtrudeGeometry(safetyShape, {
      depth: 0.0014,
      bevelEnabled: true,
      bevelThickness: 0.0004,
      bevelSize: 0.0004,
      bevelSegments: 1,
    });
    safetyGeo.rotateY(Math.PI / 2);

    // Left safety lever (hugs slide flank at x = -0.0224 tightly)
    const safetyLeft = new THREE.Mesh(safetyGeo, this.darkMaterial);
    safetyLeft.position.set(-0.0224, 0.035, 0.063);
    this.slideGroup.add(safetyLeft);

    // Right safety lever
    const safetyRight = new THREE.Mesh(safetyGeo, this.darkMaterial);
    safetyRight.scale.set(1, 1, -1);
    safetyRight.position.set(0.0224, 0.035, 0.063);
    this.slideGroup.add(safetyRight);


    // Low-profile trapezoidal rear sight & backplate
    // 3.1 One Single Low-Profile Trapezoidal Rear Sight Block with Central U-Notch
    const sightShape = new THREE.Shape();
    sightShape.moveTo(-0.011, 0.046); // Bottom left sitting flush on slide top deck
    sightShape.lineTo(0.011, 0.046);  // Bottom right
    sightShape.lineTo(0.009, 0.0535); // Trapezoidal angled top right outer corner
    sightShape.lineTo(0.0025, 0.0535);// Central U-notch right corner
    sightShape.lineTo(0.0025, 0.0495);// U-notch floor right
    sightShape.lineTo(-0.0025, 0.0495);// U-notch floor left
    sightShape.lineTo(-0.0025, 0.0535);// Central U-notch left corner
    sightShape.lineTo(-0.009, 0.0535); // Trapezoidal angled top left outer corner
    sightShape.closePath();

    const sightGeo = new THREE.ExtrudeGeometry(sightShape, {
      depth: 0.008,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0006,
      bevelSegments: 1,
    });
    const rearSightMesh = new THREE.Mesh(sightGeo, this.darkMaterial);
    rearSightMesh.position.set(0, 0, 0.063);
    this.slideGroup.add(rearSightMesh);

    // Dual Glowing Orange Fiber-Optic Dots on rear sight face (z = 0.0725)
    // Flanking the central U-notch (at x = ±0.0060, y = 0.0515)
    const rearDotGeo = new THREE.SphereGeometry(0.0015, 16, 16);

    const leftRearDot = new THREE.Mesh(rearDotGeo, this.fiberOpticMaterial);
    leftRearDot.position.set(-0.0060, 0.0515, 0.0725);
    leftRearDot.visible = true;
    this.slideGroup.add(leftRearDot);

    const rightRearDot = new THREE.Mesh(rearDotGeo, this.fiberOpticMaterial);
    rightRearDot.position.set(0.0060, 0.0515, 0.0725);
    rightRearDot.visible = true;
    this.slideGroup.add(rightRearDot);

    // 3.2 Tapered Slide Backplate with Deep Vertical Center Slot for Tall Hammer
    // Narrowed by ~12% (width 0.0396m) to match sleek Desert Eagle rear reference
    const backplateShape = new THREE.Shape();
    backplateShape.moveTo(-0.0118, 0.046);
    backplateShape.lineTo(0.0118, 0.046);
    backplateShape.lineTo(0.0198, 0.035);
    backplateShape.lineTo(0.0198, 0.014);
    backplateShape.lineTo(0.0042, 0.014);
    backplateShape.lineTo(0.0042, 0.033);  // Deep vertical center slot right edge
    backplateShape.lineTo(-0.0042, 0.033); // Center slot ceiling
    backplateShape.lineTo(-0.0042, 0.014); // Deep vertical center slot left edge
    backplateShape.lineTo(-0.0198, 0.014);
    backplateShape.lineTo(-0.0198, 0.035);
    backplateShape.closePath();

    const backplateGeo = new THREE.ExtrudeGeometry(backplateShape, {
      depth: 0.0035,
      bevelEnabled: true,
      bevelThickness: 0.0008,
      bevelSize: 0.0008,
      bevelSegments: 2,
    });
    const backplate = new THREE.Mesh(backplateGeo, this.steelMaterial);
    backplate.position.set(0, 0, 0.0715);
    this.slideGroup.add(backplate);

    // Subtle fine vertical seam line (clean mechanical detail)
    const seamLineGeo = new THREE.BoxGeometry(0.0008, 0.012, 0.0004);
    const seamLine = new THREE.Mesh(seamLineGeo, this.cavityMaterial);
    seamLine.position.set(0, 0.039, 0.0759);
    this.slideGroup.add(seamLine);


    // Lower receiver, beaver-tail & combat hammer
    this.frameGroup = new THREE.Group();
    this.frameGroup.name = 'FrameAssembly';
    this.gunGroup.add(this.frameGroup);

    // 4.1 Mid Receiver Frame & Solid Steel Rear Housing Flanking Hammer
    const midFrameGeo = new THREE.BoxGeometry(0.0448, 0.024, 0.067);
    const midFrame = new THREE.Mesh(midFrameGeo, this.steelMaterial);
    midFrame.position.set(0, 0.002, 0.0185);
    this.frameGroup.add(midFrame);

    // Subtle slide/frame rail seam line
    const frameRailSeamGeo = new THREE.BoxGeometry(0.0452, 0.0012, 0.067);
    const frameRailSeam = new THREE.Mesh(frameRailSeamGeo, this.cavityMaterial);
    frameRailSeam.position.set(0, 0.0138, 0.0185);
    this.frameGroup.add(frameRailSeam);

    // Solid steel rear frame housing flanking the hammer slot (narrowed by ~12% to match slide)
    const rearFlankShape = new THREE.Shape();
    rearFlankShape.moveTo(0.048, 0.014);
    rearFlankShape.lineTo(0.076, 0.014);
    rearFlankShape.lineTo(0.076, 0.000);
    rearFlankShape.lineTo(0.068, -0.018);
    rearFlankShape.lineTo(0.048, -0.010);
    rearFlankShape.closePath();

    const rearFlankGeo = new THREE.ExtrudeGeometry(rearFlankShape, {
      depth: 0.0155, // Outer edge at x = ±0.0198
      bevelEnabled: true,
      bevelThickness: 0.0008,
      bevelSize: 0.0008,
      bevelSegments: 2,
    });
    rearFlankGeo.rotateY(-Math.PI / 2);

    // Left rear solid steel frame flank (x = -0.0198 to -0.0042)
    const leftRearFrame = new THREE.Mesh(rearFlankGeo, this.steelMaterial);
    leftRearFrame.position.set(-0.0042, 0, 0);
    this.frameGroup.add(leftRearFrame);

    // Right rear solid steel frame flank (x = +0.0042 to +0.0198)
    const rightRearFrame = new THREE.Mesh(rearFlankGeo, this.steelMaterial);
    rightRearFrame.position.set(0.0198, 0, 0);
    this.frameGroup.add(rightRearFrame);

    // Solid steel floor under hammer cavity
    const hammerFloorGeo = new THREE.BoxGeometry(0.0084, 0.008, 0.026);
    const hammerFloor = new THREE.Mesh(hammerFloorGeo, this.steelMaterial);
    hammerFloor.position.set(0, -0.006, 0.063);
    this.frameGroup.add(hammerFloor);

    // Massive Takedown Lever (Right side)
    const takedownGeo = new THREE.BoxGeometry(0.004, 0.007, 0.014);
    const takedown = new THREE.Mesh(takedownGeo, this.darkMaterial);
    takedown.position.set(0.0240, 0.003, -0.010);
    this.frameGroup.add(takedown);

    // Takedown pivot pin (Left side circular boss)
    const takedownPinGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 16);
    takedownPinGeo.rotateZ(Math.PI / 2);
    const takedownPin = new THREE.Mesh(takedownPinGeo, this.darkMaterial);
    takedownPin.position.set(-0.0226, 0.003, -0.010);
    this.frameGroup.add(takedownPin);

    // Stepped Slide Stop Lever with Ribbed Shelf (Left side, tightly hugging frame)
    const slideStopBodyGeo = new THREE.BoxGeometry(0.0016, 0.005, 0.018);
    const slideStopBody = new THREE.Mesh(slideStopBodyGeo, this.darkMaterial);
    slideStopBody.position.set(-0.0226, 0.008, 0.014);
    this.frameGroup.add(slideStopBody);

    const slideStopShelfGeo = new THREE.BoxGeometry(0.0022, 0.0022, 0.010);
    const slideStopShelf = new THREE.Mesh(slideStopShelfGeo, this.darkMaterial);
    slideStopShelf.position.set(-0.0231, 0.010, 0.010);
    this.frameGroup.add(slideStopShelf);

    // Magazine release button (Left side near grip/trigger junction)
    const magReleaseGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.002, 16);
    magReleaseGeo.rotateZ(Math.PI / 2);
    const magRelease = new THREE.Mesh(magReleaseGeo, this.darkMaterial);
    magRelease.position.set(-0.0226, -0.015, 0.022);
    this.frameGroup.add(magRelease);
    this.magRelease = magRelease;

    // 4.2 Seamless Sweeping Steel Beaver-Tail Tang & Beveled Lower Frame
    // Narrowed to 0.034m and contoured with 3-segment bevels to blend into the rounded grip backstrap
    const btShape = new THREE.Shape();
    btShape.moveTo(0.052, 0.000);
    btShape.lineTo(0.074, 0.000); // Flush under slide rear face
    btShape.quadraticCurveTo(0.076, -0.006, 0.072, -0.018); // Tapers smoothly down into backstrap
    btShape.lineTo(0.052, -0.018);
    btShape.closePath();

    const btGeo = new THREE.ExtrudeGeometry(btShape, {
      depth: 0.034, // Matching backstrap width
      bevelEnabled: true,
      bevelThickness: 0.0018,
      bevelSize: 0.0018,
      bevelSegments: 3,
    });
    btGeo.rotateY(-Math.PI / 2);
    const beaverTail = new THREE.Mesh(btGeo, this.steelMaterial);
    beaverTail.position.set(0.017, 0, 0);
    this.frameGroup.add(beaverTail);

    // 4.3 Tall, Thumb-Ribbed Combat Hammer extending upward into Slide Backplate Slot
    this.hammerGroup = new THREE.Group();
    this.hammerGroup.name = 'HammerSpur';
    this.hammerGroup.position.set(0, 0.008, 0.063);
    this.frameGroup.add(this.hammerGroup);

    // Rounded hammer pivot boss
    const hammerPivotGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.007, 16);
    hammerPivotGeo.rotateZ(Math.PI / 2);
    const hammerPivot = new THREE.Mesh(hammerPivotGeo, this.darkMaterial);
    this.hammerGroup.add(hammerPivot);

    // Tall contoured combat hammer arm extending upward into slide backplate slot
    const hammerShape = new THREE.Shape();
    hammerShape.moveTo(-0.0035, -0.004);
    hammerShape.lineTo(0.0035, -0.004);
    hammerShape.lineTo(0.0040, 0.024);
    hammerShape.quadraticCurveTo(0.0060, 0.029, 0.0015, 0.030); // Backward-sweeping thumb spur
    hammerShape.quadraticCurveTo(-0.0050, 0.028, -0.0035, 0.020);
    hammerShape.closePath();

    const hammerGeo = new THREE.ExtrudeGeometry(hammerShape, {
      depth: 0.0065,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0006,
      bevelSegments: 1,
    });
    hammerGeo.rotateY(Math.PI / 2);
    const hammerMesh = new THREE.Mesh(hammerGeo, this.darkMaterial);
    hammerMesh.position.set(-0.00325, 0, 0);
    this.hammerGroup.add(hammerMesh);

    // 5 Horizontal Thumb-Rib Serration Bars across hammer spur (matching reference!)
    const ribGeo = new THREE.BoxGeometry(0.0068, 0.0007, 0.0012);
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(ribGeo, this.darkMaterial);
      rib.position.set(0, 0.023 + i * 0.0015, 0.0025 - i * 0.0005);
      this.hammerGroup.add(rib);
    }

    // Cocked rest angle (~0.40 rad) standing tall in battery inside slide backplate slot
    this.hammerRestAngle = 0.40;
    this.hammerGroup.rotation.x = this.hammerRestAngle;

    // 4.4 Sculpted Flat-Bottomed Combat Trigger Guard & Serrated Steel Trigger
    // Smoothly sweeps up into the lower receiver frame under the trigger,
    // with ZERO hanging vertical lines or stray hair strips in front of the grip.
    const tgShape = new THREE.Shape();
    tgShape.moveTo(0.026, 0.006);   // Front top attachment under dust cover
    tgShape.lineTo(0.026, -0.033);  // Front serrated face dropping down
    tgShape.quadraticCurveTo(0.026, -0.038, 0.020, -0.038); // Front combat corner
    tgShape.lineTo(-0.006, -0.038); // Flat bottom floor
    tgShape.quadraticCurveTo(-0.016, -0.038, -0.022, -0.010); // Smooth upward curve into frame
    tgShape.lineTo(-0.022, 0.006);  // Anchored inside frame
    tgShape.closePath();

    const tgHole = new THREE.Path();
    tgHole.moveTo(0.020, 0.000);
    tgHole.lineTo(0.020, -0.031);
    tgHole.quadraticCurveTo(0.020, -0.033, 0.015, -0.033);
    tgHole.lineTo(-0.004, -0.033);
    tgHole.quadraticCurveTo(-0.012, -0.033, -0.016, -0.006);
    tgHole.lineTo(-0.016, 0.000);
    tgHole.closePath();
    tgShape.holes.push(tgHole);

    const tgGeo = new THREE.ExtrudeGeometry(tgShape, {
      depth: 0.013,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0015,
      bevelSegments: 2,
    });
    tgGeo.rotateY(Math.PI / 2);
    const triggerGuard = new THREE.Mesh(tgGeo, this.steelMaterial);
    triggerGuard.position.set(-0.0065, 0, 0);
    this.frameGroup.add(triggerGuard);

    // Slim metallic curved trigger with front face serration ribs
    const triggerShape = new THREE.Shape();
    triggerShape.moveTo(0.006, -0.003);
    triggerShape.quadraticCurveTo(0.003, -0.016, 0.012, -0.028);
    triggerShape.lineTo(0.016, -0.028);
    triggerShape.quadraticCurveTo(0.007, -0.016, 0.011, -0.003);
    triggerShape.closePath();

    const triggerGeo = new THREE.ExtrudeGeometry(triggerShape, {
      depth: 0.0055,
      bevelEnabled: true,
      bevelThickness: 0.001,
      bevelSize: 0.001,
      bevelSegments: 1,
    });
    triggerGeo.rotateY(Math.PI / 2);
    const trigger = new THREE.Mesh(triggerGeo, this.darkMaterial);
    trigger.position.set(-0.0028, 0, 0);
    this.frameGroup.add(trigger);
    this.triggerMesh = trigger;

    // 4.5 Ergonomic 15-Degree Angled Grip & Vulcanized Textured Polymer Wrap
    // Sunk deeply inside receiver (+0.018m Y translation) with extended upper core
    // to ensure 100% solid steel junction with ZERO air gap or horizontal cut.
    this.gripGroup = new THREE.Group();
    this.gripGroup.name = 'GripAssembly';
    this.gripGroup.position.set(0, 0.006, 0.040);
    this.gripGroup.rotation.x = 0.262; // ~15° ergonomic rake
    this.frameGroup.add(this.gripGroup);

    // Steel Core Grip Chassis with extended top penetrating deeply into lower receiver
    const gripCoreShape = new THREE.Shape();
    gripCoreShape.moveTo(-0.024, 0.022); // Deep penetration into receiver frame
    gripCoreShape.lineTo(-0.024, 0.0);
    gripCoreShape.quadraticCurveTo(-0.026, -0.065, -0.023, -0.130);
    gripCoreShape.lineTo(0.023, -0.130);
    gripCoreShape.quadraticCurveTo(0.026, -0.065, 0.023, 0.0);
    gripCoreShape.lineTo(0.023, 0.022);
    gripCoreShape.closePath();

    const gripCoreGeo = new THREE.ExtrudeGeometry(gripCoreShape, {
      depth: 0.034,
      bevelEnabled: true,
      bevelThickness: 0.002,
      bevelSize: 0.002,
      bevelSegments: 2,
    });
    gripCoreGeo.rotateY(Math.PI / 2);
    const gripCore = new THREE.Mesh(gripCoreGeo, this.steelMaterial);
    gripCore.position.set(-0.017, 0, 0);
    this.gripGroup.add(gripCore);

    // 7-Round .50 AE Magazine Assembly (Floorplate + Internal Body)
    this.magGroup = new THREE.Group();
    this.magGroup.name = 'MagazineAssembly';
    this.gripGroup.add(this.magGroup);

    // Flared Steel Magazine Floorplate Base
    const magBaseGeo = new THREE.BoxGeometry(0.038, 0.010, 0.056);
    const magBase = new THREE.Mesh(magBaseGeo, this.darkMaterial);
    magBase.position.set(0, -0.134, 0.002);
    this.magGroup.add(magBase);

    // Internal Dark Steel Magazine Body (hidden inside grip well at rest)
    const magBodyGeo = new THREE.BoxGeometry(0.029, 0.125, 0.046);
    const magBody = new THREE.Mesh(magBodyGeo, this.darkMaterial);
    magBody.position.set(0, -0.068, 0.002);
    this.magGroup.add(magBody);

    // 4.6 Sculpted Molded Polymer Grip Panels with Diagonal Relief Bar
    const panelGeo = new THREE.BoxGeometry(0.006, 0.116, 0.044);

    // Left Grip Panel
    const leftPanel = new THREE.Mesh(panelGeo, this.gripMaterial);
    leftPanel.position.set(-0.017, -0.064, 0.001);
    this.gripGroup.add(leftPanel);

    // Left Diagonal Relief Bar
    const leftBarGeo = new THREE.BoxGeometry(0.007, 0.004, 0.046);
    const leftBar = new THREE.Mesh(leftBarGeo, this.darkMaterial);
    leftBar.rotation.x = 0.35;
    leftBar.position.set(-0.0175, -0.064, 0.001);
    this.gripGroup.add(leftBar);

    // Right Grip Panel
    const rightPanel = new THREE.Mesh(panelGeo, this.gripMaterial);
    rightPanel.position.set(0.017, -0.064, 0.001);
    this.gripGroup.add(rightPanel);

    // Right Diagonal Relief Bar
    const rightBar = new THREE.Mesh(leftBarGeo, this.darkMaterial);
    rightBar.rotation.x = -0.35;
    rightBar.position.set(0.0175, -0.064, 0.001);
    this.gripGroup.add(rightBar);

    // Rear Ergonomic Rounded Rubber Backstrap Cushion (24-segment smooth semi-cylinder)
    // Sleek curved contour matching reference image with smooth vertical highlight
    const backstrapGeo = new THREE.CylinderGeometry(0.0125, 0.0135, 0.118, 24, 1, false, -Math.PI / 2, Math.PI);
    backstrapGeo.scale(1.0, 1.0, 0.65);
    const backstrap = new THREE.Mesh(backstrapGeo, this.gripMaterial);
    backstrap.position.set(0, -0.064, 0.016);
    this.gripGroup.add(backstrap);

    // Circular Logo Emblem Medallions in center of panels
    const medallionGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.002, 20);
    medallionGeo.rotateZ(Math.PI / 2);

    const leftMedallion = new THREE.Mesh(medallionGeo, this.darkMaterial);
    leftMedallion.position.set(-0.0205, -0.064, 0.001);
    this.gripGroup.add(leftMedallion);

    const rightMedallion = new THREE.Mesh(medallionGeo, this.darkMaterial);
    rightMedallion.position.set(0.0205, -0.064, 0.001);
    this.gripGroup.add(rightMedallion);

    // Micro-Screws holding the grip panels (Top & Bottom on each side)
    const screwGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.0025, 12);
    screwGeo.rotateZ(Math.PI / 2);
    const screwSlotGeo = new THREE.BoxGeometry(0.0028, 0.0006, 0.0035);

    const screwPositions = [
      { x: -0.0195, y: -0.024, z: 0.010 },
      { x: -0.0195, y: -0.106, z: -0.008 },
      { x: 0.0195, y: -0.024, z: 0.010 },
      { x: 0.0195, y: -0.106, z: -0.008 },
    ];

    for (const sp of screwPositions) {
      const screwMesh = new THREE.Mesh(screwGeo, this.darkMaterial);
      screwMesh.position.set(sp.x, sp.y, sp.z);
      this.gripGroup.add(screwMesh);

      const slotMesh = new THREE.Mesh(screwSlotGeo, this.cavityMaterial);
      slotMesh.position.set(sp.x, sp.y, sp.z);
      this.gripGroup.add(slotMesh);
    }
  }

  /**
   * Builds the procedural Winchester Model 1912 (M12) 12-Gauge Pump-Action Shotgun:
   * - Streamlined hammerless blued steel receiver with signature curved humpback rear tang
   * - Polished nickel/stainless reciprocating breechbolt visible inside right-side ejection port
   * - Stepped takedown receiver extension collar & toothed barrel adjusting sleeve lock
   * - 20" tapered blued ordnance steel barrel with pedestal brass/fiber front bead sight
   * - Full-length tubular magazine with figure-8 barrel yoke band & takedown pin
   * - Reciprocating 18-ring "Corn-Cob" oiled American walnut pump fore-end & steel action slide bar
   * - Contoured American walnut semi-pistol grip wrist, raised comb buttstock, and ribbed buttplate
   * - Bottom loading gate with pivoting bright steel shell carrier & animated 3D red 12-gauge shell
   */
  _buildShotgunMesh() {
    this.shotgunGroup = new THREE.Group();
    this.shotgunGroup.name = 'WinchesterModel1912';
    this.shotgunGroup.visible = false;
    this.root.add(this.shotgunGroup);

    // =========================================================================
    // 1. STREAMLINED HAMMERLESS WINCHESTER MODEL 1912 RECEIVER
    // =========================================================================
    this.shotgunReceiverGroup = new THREE.Group();
    this.shotgunReceiverGroup.name = 'ShotgunReceiver';
    this.shotgunGroup.add(this.shotgunReceiverGroup);

    // 1.1 Iconic Humpback Receiver Side Profile (Spans z = -0.056 to z = +0.092)
    const recShape = new THREE.Shape();
    recShape.moveTo(-0.056, -0.005); // Front bottom under magazine collar
    recShape.lineTo(-0.056, 0.041);  // Front vertical face up to top sighting plane
    recShape.lineTo(0.046, 0.041);   // Straight top receiver deck
    // Signature Winchester M1912 curved humpback rear shoulder dropping into stock wrist
    recShape.quadraticCurveTo(0.070, 0.040, 0.082, 0.025);
    recShape.quadraticCurveTo(0.090, 0.015, 0.092, 0.004);
    recShape.lineTo(0.080, -0.010);  // Lower rear tang junction with walnut wrist
    recShape.lineTo(-0.036, -0.008); // Flat lower receiver floor
    recShape.lineTo(-0.042, -0.005); // Front step to magazine tube
    recShape.closePath();

    const recGeoRaw = new THREE.ExtrudeGeometry(recShape, {
      depth: 0.031,
      curveSegments: 32,
      bevelEnabled: true,
      bevelThickness: 0.0022,
      bevelSize: 0.0020,
      bevelSegments: 5,
    });
    recGeoRaw.rotateY(-Math.PI / 2);
    recGeoRaw.translate(0.0155, 0, 0);
    const recGeo = BufferGeometryUtils.mergeVertices(recGeoRaw, 1e-4);
    recGeo.computeVertexNormals();
    const receiverMesh = new THREE.Mesh(recGeo, this.bluedSteelMaterial);
    this.shotgunReceiverGroup.add(receiverMesh);

    // Rounded cylindrical upper receiver crown for smooth machined steel highlight
    const recCrownGeo = new THREE.CylinderGeometry(0.0162, 0.0162, 0.102, 32);
    recCrownGeo.rotateX(Math.PI / 2);
    recCrownGeo.scale(1.0, 0.55, 1.0);
    const recCrown = new THREE.Mesh(recCrownGeo, this.bluedSteelMaterial);
    recCrown.position.set(0, 0.0345, -0.005);
    this.shotgunReceiverGroup.add(recCrown);

    // 1.2 Authentic Winchester M1912 Matted Sighting Plane & Rear Sighting U-Notch
    const sightRampGeo = new THREE.BoxGeometry(0.010, 0.0022, 0.102);
    const sightRamp = new THREE.Mesh(sightRampGeo, this.darkMaterial);
    sightRamp.position.set(0, 0.0432, -0.004);
    this.shotgunReceiverGroup.add(sightRamp);

    const sightGrooveGeo = new THREE.BoxGeometry(0.0042, 0.0014, 0.100);
    const sightGroove = new THREE.Mesh(sightGrooveGeo, this.cavityMaterial);
    sightGroove.position.set(0, 0.0442, -0.004);
    this.shotgunReceiverGroup.add(sightGroove);

    // Low-profile rear sighting ears flanking the central sighting groove at z = +0.042
    const rearEarGeo = new THREE.BoxGeometry(0.0032, 0.0042, 0.008);
    const rearEarLeft = new THREE.Mesh(rearEarGeo, this.darkMaterial);
    rearEarLeft.position.set(-0.0038, 0.0462, 0.042);
    this.shotgunReceiverGroup.add(rearEarLeft);

    const rearEarRight = new THREE.Mesh(rearEarGeo, this.darkMaterial);
    rearEarRight.position.set(0.0038, 0.0462, 0.042);
    this.shotgunReceiverGroup.add(rearEarRight);

    // 1.3 Ejection Port Cavity & Reciprocating Bright Silver Breechbolt
    // Recessed dark port window framing the bright polished stainless breechblock
    const portRecessGeo = new THREE.BoxGeometry(0.0354, 0.0215, 0.058);
    const portRecess = new THREE.Mesh(portRecessGeo, this.cavityMaterial);
    portRecess.position.set(0, 0.0255, -0.008);
    this.shotgunReceiverGroup.add(portRecess);

    // Reciprocating Polished Nickel / Stainless Breechbolt (Anchored at rear of ejection port z = +0.019 so it retracts cleanly inside the port without ever clipping out the rear receiver humpback)
    this.shotgunBoltGroup = new THREE.Group();
    this.shotgunBoltGroup.name = 'ShotgunBreechbolt';
    this.shotgunBoltGroup.position.set(0, 0, 0.019);
    this.shotgunReceiverGroup.add(this.shotgunBoltGroup);

    const boltBodyGeo = new THREE.BoxGeometry(0.0358, 0.0192, 0.054);
    const boltBody = new THREE.Mesh(boltBodyGeo, this.brightBoltMaterial);
    boltBody.position.set(0, 0.0252, -0.027);
    this.shotgunBoltGroup.add(boltBody);

    // Machined extractor claw & horizontal flute on breechbolt face
    const boltExtractorGeo = new THREE.BoxGeometry(0.0364, 0.0038, 0.015);
    const boltExtractor = new THREE.Mesh(boltExtractorGeo, this.darkMaterial);
    boltExtractor.position.set(0, 0.0235, -0.041);
    this.shotgunBoltGroup.add(boltExtractor);

    const boltFluteGeo = new THREE.BoxGeometry(0.0362, 0.0018, 0.034);
    const boltFlute = new THREE.Mesh(boltFluteGeo, this.serrationMaterial);
    boltFlute.position.set(0, 0.0285, -0.021);
    this.shotgunBoltGroup.add(boltFlute);

    // Ejection anchor positioned at the Model 1912 ejection port
    this.shotgunEjectionAnchor.position.set(0.020, 0.026, -0.008);
    this.shotgunReceiverGroup.add(this.shotgunEjectionAnchor);

    // 1.4 Stepped Takedown Receiver Extension Collar (Front of receiver: z = -0.056 to -0.082)
    const tdUpperRingGeo = new THREE.CylinderGeometry(0.0152, 0.0156, 0.026, 28);
    tdUpperRingGeo.rotateX(Math.PI / 2);
    const tdUpperRing = new THREE.Mesh(tdUpperRingGeo, this.bluedSteelMaterial);
    tdUpperRing.position.set(0, 0.0285, -0.068);
    this.shotgunReceiverGroup.add(tdUpperRing);

    const tdLowerRingGeo = new THREE.CylinderGeometry(0.0128, 0.0132, 0.024, 24);
    tdLowerRingGeo.rotateX(Math.PI / 2);
    const tdLowerRing = new THREE.Mesh(tdLowerRingGeo, this.bluedSteelMaterial);
    tdLowerRing.position.set(0, 0.0065, -0.067);
    this.shotgunReceiverGroup.add(tdLowerRing);

    const tdWebGeo = new THREE.BoxGeometry(0.026, 0.024, 0.024);
    const tdWeb = new THREE.Mesh(tdWebGeo, this.bluedSteelMaterial);
    tdWeb.position.set(0, 0.0175, -0.067);
    this.shotgunReceiverGroup.add(tdWeb);

    // Vertical machined takedown seam line & barrel adjusting sleeve lock ring
    const tdSeamGeo = new THREE.BoxGeometry(0.036, 0.044, 0.0012);
    const tdSeam = new THREE.Mesh(tdSeamGeo, this.cavityMaterial);
    tdSeam.position.set(0, 0.018, -0.056);
    this.shotgunReceiverGroup.add(tdSeam);

    const adjustSleeveGeo = new THREE.CylinderGeometry(0.0158, 0.0158, 0.007, 24);
    adjustSleeveGeo.rotateX(Math.PI / 2);
    const adjustSleeve = new THREE.Mesh(adjustSleeveGeo, this.darkMaterial);
    adjustSleeve.position.set(0, 0.0285, -0.078);
    this.shotgunReceiverGroup.add(adjustSleeve);

    // 1.5 Bottom Loading Port & Pivoting Bright Steel Shell Carrier/Lifter
    const loadWellGeo = new THREE.BoxGeometry(0.022, 0.005, 0.056);
    const loadWell = new THREE.Mesh(loadWellGeo, this.cavityMaterial);
    loadWell.position.set(0, -0.007, -0.006);
    this.shotgunReceiverGroup.add(loadWell);

    this.shotgunCarrierGroup = new THREE.Group();
    this.shotgunCarrierGroup.position.set(0, -0.0065, 0.018); // Hinged at rear of loading port
    this.shotgunReceiverGroup.add(this.shotgunCarrierGroup);

    const carrierPlateGeo = new THREE.BoxGeometry(0.018, 0.0022, 0.048);
    const carrierPlate = new THREE.Mesh(carrierPlateGeo, this.brightBoltMaterial);
    carrierPlate.position.set(0, 0, -0.024);
    this.shotgunCarrierGroup.add(carrierPlate);

    // 1.6 Factory Roll-Mark Engravings & Receiver Pins ("WINCHESTER - MODEL 1912 - U.S.")
    const sEngraveGeo = new THREE.PlaneGeometry(0.088, 0.020);
    const sEngraveLeft = new THREE.Mesh(sEngraveGeo, this.winchesterEngravingMaterial);
    sEngraveLeft.rotation.y = -Math.PI / 2;
    sEngraveLeft.position.set(-0.0178, 0.005, -0.004);
    this.shotgunReceiverGroup.add(sEngraveLeft);

    const sEngraveRight = new THREE.Mesh(sEngraveGeo, this.winchesterEngravingMaterial);
    sEngraveRight.rotation.y = Math.PI / 2;
    sEngraveRight.position.set(0.0178, 0.005, -0.004);
    this.shotgunReceiverGroup.add(sEngraveRight);

    const recPinGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.036, 12);
    recPinGeo.rotateZ(Math.PI / 2);
    const recPin1 = new THREE.Mesh(recPinGeo, this.darkMaterial);
    recPin1.position.set(0, 0.004, 0.036);
    this.shotgunReceiverGroup.add(recPin1);

    const recPin2 = new THREE.Mesh(recPinGeo, this.darkMaterial);
    recPin2.position.set(0, 0.012, 0.056);
    this.shotgunReceiverGroup.add(recPin2);

    // =========================================================================
    // 2. LONG 20" TAPERED BLUED STEEL BARREL & FRONT BRASS BEAD SIGHT
    // =========================================================================
    this.shotgunBarrelGroup = new THREE.Group();
    this.shotgunBarrelGroup.name = 'ShotgunBarrel';
    this.shotgunGroup.add(this.shotgunBarrelGroup);

    // 2.1 Tapered 12-Gauge Barrel (Spans z = -0.075 to z = -0.435, length 0.360m)
    const sBarrelGeo = new THREE.CylinderGeometry(0.0114, 0.0134, 0.360, 32);
    sBarrelGeo.rotateX(Math.PI / 2);
    const sBarrelMesh = new THREE.Mesh(sBarrelGeo, this.bluedSteelMaterial);
    sBarrelMesh.position.set(0, 0.0285, -0.255);
    this.shotgunBarrelGroup.add(sBarrelMesh);

    // Sleek low-profile top barrel sighting rib leading from receiver to front bead
    const barrelRibGeo = new THREE.BoxGeometry(0.0055, 0.0024, 0.352);
    const barrelRib = new THREE.Mesh(barrelRibGeo, this.darkMaterial);
    barrelRib.position.set(0, 0.0402, -0.252);
    this.shotgunBarrelGroup.add(barrelRib);

    // 2.2 Chamfered Muzzle Crown & Pitch-Black 12-Gauge Bore at z = -0.435
    const sCrownGeo = new THREE.CylinderGeometry(0.0110, 0.0114, 0.003, 28);
    sCrownGeo.rotateX(Math.PI / 2);
    const sCrown = new THREE.Mesh(sCrownGeo, this.darkMaterial);
    sCrown.position.set(0, 0.0285, -0.4355);
    this.shotgunBarrelGroup.add(sCrown);

    const sBoreGeo = new THREE.CylinderGeometry(0.0092, 0.0092, 0.045, 24);
    sBoreGeo.rotateX(Math.PI / 2);
    const sBore = new THREE.Mesh(sBoreGeo, this.innerBoreMat);
    sBore.position.set(0, 0.0285, -0.415);
    this.shotgunBarrelGroup.add(sBore);

    // Dedicated Shotgun Muzzle Socket at tip of 12-gauge bore
    this.shotgunMuzzleSocket.position.set(0, 0.0285, -0.440);
    this.shotgunBarrelGroup.add(this.shotgunMuzzleSocket);

    // 2.3 Pedestal Front Bead Sight (Aligned to y = +0.0495 sightline)
    const beadPedestalGeo = new THREE.BoxGeometry(0.0048, 0.0065, 0.012);
    const beadPedestal = new THREE.Mesh(beadPedestalGeo, this.darkMaterial);
    beadPedestal.position.set(0, 0.0435, -0.422);
    this.shotgunBarrelGroup.add(beadPedestal);

    const brassBeadGeo = new THREE.SphereGeometry(0.0024, 16, 16);
    const brassBead = new THREE.Mesh(brassBeadGeo, this.brassMaterial);
    brassBead.position.set(0, 0.0495, -0.422);
    this.shotgunBarrelGroup.add(brassBead);

    // High-visibility glowing front bead face facing shooter for crisp ADS & hip visibility
    const beadGlowGeo = new THREE.SphereGeometry(0.0019, 14, 14);
    const beadGlow = new THREE.Mesh(beadGlowGeo, this.fiberOpticMaterial);
    beadGlow.position.set(0, 0.0495, -0.4205);
    this.shotgunBarrelGroup.add(beadGlow);

    // =========================================================================
    // 3. TUBULAR MAGAZINE & FIGURE-8 BARREL YOKE BAND
    // =========================================================================
    // 3.1 Full-length 6-round Tubular Magazine (z = -0.075 to -0.352)
    const magTubeGeo = new THREE.CylinderGeometry(0.0106, 0.0108, 0.278, 28);
    magTubeGeo.rotateX(Math.PI / 2);
    const magTube = new THREE.Mesh(magTubeGeo, this.bluedSteelMaterial);
    magTube.position.set(0, 0.0065, -0.214);
    this.shotgunBarrelGroup.add(magTube);

    // Bright stainless magazine follower & inner tube sheen under pump travel zone
    const magInnerSheenGeo = new THREE.CylinderGeometry(0.0109, 0.0109, 0.110, 24);
    magInnerSheenGeo.rotateX(Math.PI / 2);
    const magInnerSheen = new THREE.Mesh(magInnerSheenGeo, this.darkMaterial);
    magInnerSheen.position.set(0, 0.0065, -0.125);
    this.shotgunBarrelGroup.add(magInnerSheen);

    // 3.2 Figure-8 Barrel / Magazine Yoke Band Clamp at z = -0.338
    const bandUpperGeo = new THREE.CylinderGeometry(0.0132, 0.0132, 0.016, 24);
    bandUpperGeo.rotateX(Math.PI / 2);
    const bandUpper = new THREE.Mesh(bandUpperGeo, this.bluedSteelMaterial);
    bandUpper.position.set(0, 0.0285, -0.338);
    this.shotgunBarrelGroup.add(bandUpper);

    const bandLowerGeo = new THREE.CylinderGeometry(0.0124, 0.0124, 0.016, 24);
    bandLowerGeo.rotateX(Math.PI / 2);
    const bandLower = new THREE.Mesh(bandLowerGeo, this.bluedSteelMaterial);
    bandLower.position.set(0, 0.0065, -0.338);
    this.shotgunBarrelGroup.add(bandLower);

    const bandWebGeo = new THREE.BoxGeometry(0.016, 0.022, 0.014);
    const bandWeb = new THREE.Mesh(bandWebGeo, this.bluedSteelMaterial);
    bandWeb.position.set(0, 0.0175, -0.338);
    this.shotgunBarrelGroup.add(bandWeb);

    const bandScrewGeo = new THREE.CylinderGeometry(0.0024, 0.0024, 0.018, 12);
    bandScrewGeo.rotateZ(Math.PI / 2);
    const bandScrew = new THREE.Mesh(bandScrewGeo, this.darkMaterial);
    bandScrew.position.set(0, 0.0175, -0.338);
    this.shotgunBarrelGroup.add(bandScrew);

    // Magazine Tube Plug End-Cap & Winchester Takedown Pin at z = -0.354
    const magPlugGeo = new THREE.CylinderGeometry(0.0112, 0.0112, 0.010, 24);
    magPlugGeo.rotateX(Math.PI / 2);
    const magPlug = new THREE.Mesh(magPlugGeo, this.darkMaterial);
    magPlug.position.set(0, 0.0065, -0.354);
    this.shotgunBarrelGroup.add(magPlug);

    const tdFrontPinGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.012, 14);
    tdFrontPinGeo.rotateX(Math.PI / 2);
    const tdFrontPin = new THREE.Mesh(tdFrontPinGeo, this.brightBoltMaterial);
    tdFrontPin.position.set(0, 0.0065, -0.362);
    this.shotgunBarrelGroup.add(tdFrontPin);

    // =========================================================================
    // 4. RECIPROCATING 18-RING "CORN-COB" RIBBED WALNUT PUMP FORE-END
    // =========================================================================
    this.shotgunPumpGroup = new THREE.Group();
    this.shotgunPumpGroup.name = 'ShotgunPumpForeEnd';
    this.shotgunGroup.add(this.shotgunPumpGroup);

    // 4.1 Core Oiled American Walnut Fore-End Cylinder (Spans z = -0.150 to -0.296)
    const pumpCoreGeo = new THREE.CylinderGeometry(0.0168, 0.0168, 0.132, 28);
    pumpCoreGeo.rotateX(Math.PI / 2);
    const pumpCore = new THREE.Mesh(pumpCoreGeo, this.walnutMaterial);
    pumpCore.position.set(0, 0.0065, -0.223);
    this.shotgunPumpGroup.add(pumpCore);

    // Tapered Front & Rear Walnut Nose Cones
    const pumpFrontConeGeo = new THREE.CylinderGeometry(0.0138, 0.0168, 0.012, 28);
    pumpFrontConeGeo.rotateX(Math.PI / 2);
    const pumpFrontCone = new THREE.Mesh(pumpFrontConeGeo, this.walnutMaterial);
    pumpFrontCone.position.set(0, 0.0065, -0.295);
    this.shotgunPumpGroup.add(pumpFrontCone);

    const pumpRearConeGeo = new THREE.CylinderGeometry(0.0168, 0.0138, 0.012, 28);
    pumpRearConeGeo.rotateX(Math.PI / 2);
    const pumpRearCone = new THREE.Mesh(pumpRearConeGeo, this.walnutMaterial);
    pumpRearCone.position.set(0, 0.0065, -0.151);
    this.shotgunPumpGroup.add(pumpRearCone);

    // 4.2 18 Deep Circumferential "Corn-Cob" Walnut Rings & 17 Recessed Dark Grooves
    const numCobRings = 18;
    const cobStartZ = -0.158;
    const cobSpanZ = 0.130;
    const cobStepZ = cobSpanZ / (numCobRings - 1);

    const ringBaseGeo = new THREE.CylinderGeometry(0.0188, 0.0188, 0.0046, 24);
    ringBaseGeo.rotateX(Math.PI / 2);
    const grooveBaseGeo = new THREE.CylinderGeometry(0.0156, 0.0156, 0.0030, 24);
    grooveBaseGeo.rotateX(Math.PI / 2);

    const cobRingGeos = [];
    const cobGrooveGeos = [];

    for (let i = 0; i < numCobRings; i++) {
      const rz = cobStartZ - i * cobStepZ;
      // Slight barrel-shaped swell in the middle of the corn-cob handle
      const arch = 1.0 + Math.sin((i / (numCobRings - 1)) * Math.PI) * 0.045;
      const rg = ringBaseGeo.clone();
      rg.scale(arch, arch, 1.0);
      rg.translate(0, 0.0065, rz);
      cobRingGeos.push(rg);

      if (i < numCobRings - 1) {
        const gz = rz - cobStepZ * 0.5;
        const gg = grooveBaseGeo.clone();
        gg.scale(arch, arch, 1.0);
        gg.translate(0, 0.0065, gz);
        cobGrooveGeos.push(gg);
      }
    }

    const mergedCobRings = BufferGeometryUtils.mergeGeometries(cobRingGeos, false);
    const cobRingsMesh = new THREE.Mesh(mergedCobRings, this.walnutMaterial);
    this.shotgunPumpGroup.add(cobRingsMesh);

    const mergedCobGrooves = BufferGeometryUtils.mergeGeometries(cobGrooveGeos, false);
    const cobGroovesMesh = new THREE.Mesh(mergedCobGrooves, this.walnutGrooveMaterial);
    this.shotgunPumpGroup.add(cobGroovesMesh);

    ringBaseGeo.dispose();
    grooveBaseGeo.dispose();
    cobRingGeos.forEach(g => g.dispose());
    cobGrooveGeos.forEach(g => g.dispose());

    // 4.3 Steel Fore-End Ferrule Collars & Left-Side Action Slide Bar
    const ferruleGeo = new THREE.CylinderGeometry(0.0139, 0.0139, 0.008, 24);
    ferruleGeo.rotateX(Math.PI / 2);

    const frontFerrule = new THREE.Mesh(ferruleGeo, this.bluedSteelMaterial);
    frontFerrule.position.set(0, 0.0065, -0.303);
    this.shotgunPumpGroup.add(frontFerrule);

    const rearFerrule = new THREE.Mesh(ferruleGeo, this.bluedSteelMaterial);
    rearFerrule.position.set(0, 0.0065, -0.143);
    this.shotgunPumpGroup.add(rearFerrule);

    // Bright Steel Action Slide Bar (Left side connecting pump to receiver front extension)
    const actionBarGeo = new THREE.BoxGeometry(0.0028, 0.0075, 0.082);
    const actionBar = new THREE.Mesh(actionBarGeo, this.brightBoltMaterial);
    actionBar.position.set(-0.0132, 0.0065, -0.110);
    this.shotgunPumpGroup.add(actionBar);

    // =========================================================================
    // 5. TRIGGER GUARD, CURVED TRIGGER & AMERICAN WALNUT BUTTSTOCK
    // =========================================================================
    // 5.1 Sculpted Blued Steel Trigger Guard Bow (Spans z = +0.020 to z = +0.076)
    const sTgShape = new THREE.Shape();
    sTgShape.moveTo(0.020, -0.005);
    sTgShape.lineTo(0.024, -0.028);
    sTgShape.quadraticCurveTo(0.026, -0.035, 0.036, -0.035);
    sTgShape.lineTo(0.058, -0.035);
    sTgShape.quadraticCurveTo(0.070, -0.035, 0.076, -0.008);
    sTgShape.lineTo(0.020, -0.005);
    sTgShape.closePath();

    const sTgHole = new THREE.Path();
    sTgHole.moveTo(0.028, -0.009);
    sTgHole.lineTo(0.030, -0.026);
    sTgHole.quadraticCurveTo(0.032, -0.030, 0.038, -0.030);
    sTgHole.lineTo(0.056, -0.030);
    sTgHole.quadraticCurveTo(0.064, -0.030, 0.068, -0.009);
    sTgHole.closePath();
    sTgShape.holes.push(sTgHole);

    const sTgGeo = new THREE.ExtrudeGeometry(sTgShape, {
      depth: 0.011,
      bevelEnabled: true,
      bevelThickness: 0.0012,
      bevelSize: 0.0012,
      bevelSegments: 2,
    });
    sTgGeo.rotateY(-Math.PI / 2);
    const sTriggerGuard = new THREE.Mesh(sTgGeo, this.bluedSteelMaterial);
    sTriggerGuard.position.set(0.0055, 0, 0);
    this.shotgunReceiverGroup.add(sTriggerGuard);

    // Curved Steel Shotgun Trigger
    const sTrigShape = new THREE.Shape();
    sTrigShape.moveTo(0.044, -0.006);
    sTrigShape.quadraticCurveTo(0.040, -0.018, 0.048, -0.027);
    sTrigShape.lineTo(0.052, -0.027);
    sTrigShape.quadraticCurveTo(0.045, -0.018, 0.049, -0.006);
    sTrigShape.closePath();

    const sTrigGeo = new THREE.ExtrudeGeometry(sTrigShape, {
      depth: 0.0048,
      bevelEnabled: true,
      bevelThickness: 0.0008,
      bevelSize: 0.0008,
      bevelSegments: 1,
    });
    sTrigGeo.rotateY(-Math.PI / 2);
    const sTrigger = new THREE.Mesh(sTrigGeo, this.brightBoltMaterial);
    sTrigger.position.set(0.0024, 0, 0);
    this.shotgunReceiverGroup.add(sTrigger);
    this.shotgunTriggerMesh = sTrigger;

    // 5.2 Contoured Oiled American Walnut Semi-Pistol Wrist & Drop-Comb Buttstock (z = +0.072 to +0.165)
    // Sweeps downward at a natural ergonomic angle so it stays 100% in front of camera.near in ADS
    // and frames the lower-right corner cleanly in hip-fire
    const stockShape = new THREE.Shape();
    stockShape.moveTo(0.072, 0.013);   // Upper tang junction behind humpback receiver
    stockShape.quadraticCurveTo(0.102, -0.006, 0.132, -0.024); // Smooth downward wrist sweep
    stockShape.lineTo(0.168, -0.048);  // Sloping walnut stock comb toward shoulder
    stockShape.lineTo(0.168, -0.115);  // Rear lower stock face
    stockShape.lineTo(0.126, -0.078);  // Pistol-grip bottom flare
    stockShape.quadraticCurveTo(0.098, -0.032, 0.072, -0.010); // Smooth front wrist sweep into receiver
    stockShape.closePath();

    const stockGeoRaw = new THREE.ExtrudeGeometry(stockShape, {
      depth: 0.023,
      curveSegments: 32,
      bevelEnabled: true,
      bevelThickness: 0.0055,
      bevelSize: 0.0050,
      bevelSegments: 5,
    });
    stockGeoRaw.rotateY(-Math.PI / 2);
    stockGeoRaw.translate(0.0115, 0, 0);
    const stockGeo = BufferGeometryUtils.mergeVertices(stockGeoRaw, 1e-4);
    stockGeo.computeVertexNormals();
    const stockMesh = new THREE.Mesh(stockGeo, this.walnutMaterial);
    this.shotgunGroup.add(stockMesh);

    // Black Fluted Hard-Rubber Pistol Grip Cap under wrist flare
    const gripCapGeo = new THREE.CylinderGeometry(0.0135, 0.0145, 0.004, 20);
    const gripCap = new THREE.Mesh(gripCapGeo, this.gripMaterial);
    gripCap.rotation.x = 0.25;
    gripCap.position.set(0, -0.078, 0.126);
    this.shotgunGroup.add(gripCap);

    // 5.3 Animated 3D Red 12-Gauge Reload Shell (Hidden at rest, animates into bottom loading gate)
    this.shotgunReloadShell = new THREE.Group();
    this.shotgunReloadShell.name = 'ShotgunReloadShell';
    this.shotgunReloadShell.visible = false;
    this.shotgunGroup.add(this.shotgunReloadShell);

    // Red ribbed plastic/paper hull
    const hullGeo = new THREE.CylinderGeometry(0.0096, 0.0096, 0.044, 18);
    hullGeo.rotateX(Math.PI / 2);
    const hullMesh = new THREE.Mesh(hullGeo, this.shellHullMaterial);
    hullMesh.position.set(0, 0, -0.008);
    this.shotgunReloadShell.add(hullMesh);

    // High-brass metallic head base
    const brassHeadGeo = new THREE.CylinderGeometry(0.0098, 0.0098, 0.016, 18);
    brassHeadGeo.rotateX(Math.PI / 2);
    const brassHeadMesh = new THREE.Mesh(brassHeadGeo, this.brassMaterial);
    brassHeadMesh.position.set(0, 0, 0.022);
    this.shotgunReloadShell.add(brassHeadMesh);

    // Brass extractor rim
    const brassRimGeo = new THREE.CylinderGeometry(0.0108, 0.0108, 0.0025, 18);
    brassRimGeo.rotateX(Math.PI / 2);
    const brassRimMesh = new THREE.Mesh(brassRimGeo, this.brassMaterial);
    brassRimMesh.position.set(0, 0, 0.030);
    this.shotgunReloadShell.add(brassRimMesh);
  }

  /**
   * Switches between Weapon 1 ('pistol' - .50 AE Desert Eagle)
   * and Weapon 2 ('shotgun' - Winchester Model 1912 12-Gauge).
   * Cancels any active reload/pump animations and plays a crisp equip transition.
   */
  switchWeapon(weaponType) {
    if (this.currentWeapon === weaponType) return;

    // 1. Cancel any active reload or pump tweens/timers
    this.reloadTimers.forEach(t => clearTimeout(t));
    this.reloadTimers.length = 0;
    this.reloadTweens.forEach(t => t.stop());
    this.reloadTweens.length = 0;

    this.isReloading = false;
    this.isPumping = false;
    this._updateShotgunPumpVisuals(0);
    if (this.shotgunCarrierGroup) this.shotgunCarrierGroup.rotation.x = 0;
    if (this.shotgunReloadShell) this.shotgunReloadShell.visible = false;
    if (this.magGroup) {
      this.magGroup.position.set(0, 0, 0);
      this.magGroup.visible = true;
    }

    this.currentWeapon = weaponType;
    const isShotgun = weaponType === 'shotgun';

    // 2. Toggle 3D weapon group visibility
    if (this.gunGroup) this.gunGroup.visible = !isShotgun;
    if (this.shotgunGroup) this.shotgunGroup.visible = isShotgun;

    // 3. Update active hip/ADS target references and re-parent muzzle flash rig
    this.hipPosition = isShotgun ? this.shotgunHipPosition : this.pistolHipPosition;
    this.adsPosition = isShotgun ? this.shotgunAdsPosition : this.pistolAdsPosition;
    this.hipRotation = isShotgun ? this.shotgunHipRotation : this.pistolHipRotation;
    this.adsRotation = isShotgun ? this.shotgunAdsRotation : this.pistolAdsRotation;
    this.muzzleAnchor = isShotgun ? this.shotgunMuzzleSocket : this.muzzleSocket;

    if (this.muzzleFlashGroup && this.muzzleAnchor) {
      this.muzzleAnchor.add(this.muzzleFlashGroup);
      this.muzzleFlashGroup.visible = false;
    }

    // 4. Tactile equip draw animation (dip down & spring up into the player's hands)
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
    if (this.isADS !== enable) {
      this.isADS = enable;
      if (this.sound) {
        this.sound.playADSWhoosh(enable);
      }
    }
  }

  /**
   * Multi-Plane 3D Flame Rig mounted directly to muzzleAnchor.
   * Proportional to barrel tip (~0.14m wide):
   * - 1 front-facing starburst disc at muzzle bore.
   * - 2 crossed lengthwise flame cones jutting forward from barrel.
   * - 2 small angled side-flame jets shooting outward from side compensator ports.
   */
  _buildMuzzleFlashRig() {
    this.muzzleFlashGroup = new THREE.Group();
    this.muzzleFlashGroup.name = 'MuzzleFlashRig';
    this.muzzleFlashGroup.visible = false;
    this.muzzleAnchor.add(this.muzzleFlashGroup);

    // 1. Front-facing starburst disc right at muzzle bore
    const discGeo = new THREE.PlaneGeometry(0.15, 0.15);
    const discMesh = new THREE.Mesh(discGeo, this.muzzleFlashMaterial);
    discMesh.position.set(0, 0, -0.005);
    this.muzzleFlashGroup.add(discMesh);

    // 2. Crossed lengthwise flame cones jutting forward along -Z (0.13m wide x 0.17m long)
    const coneGeo = new THREE.PlaneGeometry(0.13, 0.17);
    coneGeo.translate(0, 0.085, 0); // anchor at base

    // Plane 2a: Horizontal cone extending forward (-Z)
    const coneH = new THREE.Mesh(coneGeo, this.muzzleFlashMaterial);
    coneH.rotation.x = -Math.PI / 2;
    this.muzzleFlashGroup.add(coneH);

    // Plane 2b: Vertical cone extending forward (-Z)
    const coneV = new THREE.Mesh(coneGeo, this.muzzleFlashMaterial);
    coneV.rotation.x = -Math.PI / 2;
    coneV.rotation.y = Math.PI / 2;
    this.muzzleFlashGroup.add(coneV);

    // 3. Two small angled side-flame jets shooting outward from side compensator ports
    const jetGeo = new THREE.PlaneGeometry(0.065, 0.045);
    jetGeo.translate(0.032, 0, 0);

    // Left jet (angles outward to the left)
    const leftJet = new THREE.Mesh(jetGeo, this.muzzleFlashMaterial);
    leftJet.position.set(-0.022, 0.005, 0.015);
    leftJet.rotation.y = Math.PI * 0.75;
    this.muzzleFlashGroup.add(leftJet);

    // Right jet (angles outward to the right)
    const rightJet = new THREE.Mesh(jetGeo, this.muzzleFlashMaterial);
    rightJet.position.set(0.022, 0.005, 0.015);
    rightJet.rotation.y = -Math.PI * 0.75;
    this.muzzleFlashGroup.add(rightJet);
  }

  /**
   * Activates fiery muzzle flash rig with randomized rotation and scale.
   * Fades out rapidly over 45ms.
   */
  triggerMuzzleFlash() {
    if (!this.muzzleFlashGroup) return;
    this.muzzleFlashGroup.visible = true;
    this.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
    const baseScale = this.currentWeapon === 'shotgun' ? 1.22 : 0.85;
    const s = baseScale + Math.random() * 0.42;
    this.muzzleFlashGroup.scale.set(s, s, s);
    this.muzzleFlashMaterial.opacity = 1.0;
    this.flashTimer = 0.045; // 45ms duration
  }

  /**
   * Applies heavy recoil impulse on gun fire (adapts to .50 AE Pistol vs 12-Gauge Shotgun).
   */
  applyRecoil() {
    if (this.currentWeapon === 'shotgun') {
      const recoilKick = this.isADS ? 0.082 : 0.135;
      const recoilPitch = this.isADS ? 0.115 : 0.235;
      const recoilYaw = (Math.random() - 0.5) * (this.isADS ? 0.014 : 0.032);
      const rollTorque = (Math.random() > 0.5 ? 1 : -1) * (this.isADS ? 0.024 : 0.052);

      this.posSpring.impulse(0, recoilKick * 0.26, recoilKick);
      this.rotSpring.impulse(recoilPitch, recoilYaw, rollTorque);

      if (this.shotgunTriggerMesh) {
        this.shotgunTriggerMesh.rotation.x = 0.16;
      }

      this.triggerMuzzleFlash();
      return;
    }

    const recoilKick = this.isADS ? 0.065 : 0.115;
    const recoilPitch = this.isADS ? 0.095 : 0.200;
    const recoilYaw = (Math.random() - 0.5) * (this.isADS ? 0.010 : 0.025);
    const rollTorque = (Math.random() > 0.5 ? 1 : -1) * (this.isADS ? 0.018 : 0.040);

    // 1. Heavy viewmodel spring impulse (massive upward pitch, backward Z kick, and roll torque)
    this.posSpring.impulse(0, recoilKick * 0.28, recoilKick);
    this.rotSpring.impulse(recoilPitch, recoilYaw, rollTorque);

    // 2. Mechanical Slide Blowback Kick (snaps back fully)
    this.slideBlowback = 0.040;

    // 3. Hammer snap back against beaver-tail
    this.hammerRecoil = 0.35;

    // 4. Trigger fiery muzzle flash rig
    this.triggerMuzzleFlash();
  }

  /**
   * Updates the reciprocating shotgun pump fore-end position and retracts the
   * silver breechbolt strictly inside the ejection port window (z <= +0.019)
   * so it never clips through the rear humpback of the receiver.
   */
  _updateShotgunPumpVisuals(pumpZ) {
    this.shotgunPumpOffset = pumpZ;
    if (this.shotgunPumpGroup) {
      this.shotgunPumpGroup.position.z = pumpZ;
    }
    if (this.shotgunBoltGroup) {
      this.shotgunBoltGroup.position.z = 0.019;
      const openRatio = Math.min(1, Math.max(0, pumpZ / 0.064));
      this.shotgunBoltGroup.scale.z = Math.max(0.10, 1.0 - openRatio * 0.90);
    }
  }

  /**
   * Plays the automatic pump-action cycling animation after a shotgun blast:
   * - Briskly pulls the ribbed walnut corn-cob fore-end and silver breechbolt backward (+0.064m)
   * - Ejects the spent red 12-gauge hull at peak open breech
   * - Slams the pump fore-end and bolt back forward into battery
   */
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

      // Rearward pump stroke (0 -> +0.064m over 110ms)
      this.posSpring.impulse(0, -0.012, 0.032);
      this.rotSpring.impulse(0.035, 0.012, -0.035);

      const pullBack = new TWEEN.Tween(pumpState, true)
        .to({ z: 0.064 }, 110)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          this._updateShotgunPumpVisuals(pumpState.z);
        })
        .onComplete(() => {
          if (typeof onEjectShell === 'function') {
            onEjectShell();
          }

          // Forward pump slam into battery (+0.064m -> 0 over 105ms)
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
              if (typeof onComplete === 'function') {
                onComplete();
              }
            });
          this.reloadTweens.push(pushFwd);
          pushFwd.start();
        });
      this.reloadTweens.push(pullBack);
      pullBack.start();
    }, 150);

    this.reloadTimers.push(delayTimer);
  }

  /**
   * Mouse look sway calculation.
   */
  applyMouseSway(deltaX, deltaY) {
    const swayAmount = this.isADS ? 0.0003 : 0.0008;
    this.rotSpring.impulse(
      deltaY * -swayAmount * 1.5,
      deltaX * -swayAmount * 1.5,
      deltaX * -swayAmount * 2.0
    );
  }

  /**
   * Frame update for springs, ADS interpolation, slide blowback recovery,
   * animated hammer recovery, muzzle flash fade, and walking bob. Zero allocations at runtime.
   */
  update(delta, playerVelocity, isGrounded) {
    // 1. Smoothly target ADS vs Hip Position & Rotation (with procedural reload tilt)
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

    // 2. Slide Blowback & Hammer Recovery (Clamped wide open if slide is locked)
    if (this.isSlideLocked) {
      this.slideGroup.position.z = 0.040;
      this.hammerGroup.rotation.x = this.hammerRestAngle + 0.35;
    } else {
      // Slide Blowback Recovery (Weighted forward recovery with mechanical authority)
      if (this.slideBlowback > 0.0001) {
        this.slideBlowback = THREE.MathUtils.lerp(this.slideBlowback, 0, Math.min(delta * 24.0, 1.0));
        this.slideGroup.position.z = this.slideBlowback;
      } else if (this.slideGroup.position.z !== 0) {
        this.slideGroup.position.z = 0;
      }

      // Hammer Recovery (Springs back into cocked battery at rest angle)
      if (this.hammerRecoil > 0.001) {
        this.hammerRecoil = THREE.MathUtils.lerp(this.hammerRecoil, 0, Math.min(delta * 24.0, 1.0));
        this.hammerGroup.rotation.x = this.hammerRestAngle + this.hammerRecoil;
      } else if (this.hammerGroup.rotation.x !== this.hammerRestAngle) {
        this.hammerGroup.rotation.x = this.hammerRestAngle;
      }
    }

    // Smoothly return shotgun trigger if depressed
    if (this.shotgunTriggerMesh && this.shotgunTriggerMesh.rotation.x > 0.001) {
      this.shotgunTriggerMesh.rotation.x = THREE.MathUtils.lerp(
        this.shotgunTriggerMesh.rotation.x,
        0,
        Math.min(delta * 20.0, 1.0)
      );
    }

    // 4. Dynamic Muzzle Flash Rig fadeout (45ms)
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.muzzleFlashGroup.visible = false;
      } else {
        this.muzzleFlashMaterial.opacity = Math.max(0, this.flashTimer / 0.045);
      }
    }

    // 5. Walking weapon bob
    const horizSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);
    if (isGrounded && horizSpeed > 0.5) {
      const bobFreq = this.isADS ? 6.0 : (horizSpeed > 7.0 ? 11.0 : 8.5);
      this.bobCycle += bobFreq * delta;

      // Subtle weapon bob scale
      const bobAmp = this.isADS ? 0.0016 : 0.0060;
      const bobX = Math.cos(this.bobCycle) * bobAmp;
      const bobY = Math.sin(this.bobCycle * 2) * (bobAmp * 0.8);

      this.bobSpring.setTarget(bobX, bobY, 0);
    } else {
      this.bobSpring.setTarget(0, 0, 0);
    }

    // 6. Integrate harmonic springs
    const pos = this.posSpring.update(delta);
    const rot = this.rotSpring.update(delta);
    const bob = this.bobSpring.update(delta);

    // 7. Apply combined transform to root group
    this.root.position.set(
      pos.x + bob.x,
      pos.y + bob.y,
      pos.z + bob.z
    );

    this.root.rotation.set(
      rot.x,
      rot.y,
      rot.z
    );

    // 8. Update active muzzle & chamber ejection world positions for raycast tracers & shells
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

  /**
   * Sets or releases the last-round slide lock.
   */
  setSlideLocked(locked) {
    this.isSlideLocked = locked;
    if (locked) {
      this.slideBlowback = 0.040;
      this.slideGroup.position.z = 0.040;
      this.hammerRecoil = 0.35;
      this.hammerGroup.rotation.x = this.hammerRestAngle + 0.35;
    }
  }

  /**
   * Sharp dead-trigger micro-twitch into viewmodel spring and active trigger mesh.
   */
  playDryFireTwitch() {
    // 1. Sharp dead-trigger micro-twitch into spring (pitch: -0.015, z: +0.004)
    this.rotSpring.impulse(-0.015, 0, 0);
    this.posSpring.impulse(0, 0, 0.004);

    // 2. Animate active trigger mesh pulling back and releasing
    const activeTrigger = this.currentWeapon === 'shotgun' ? this.shotgunTriggerMesh : this.triggerMesh;
    if (activeTrigger) {
      new TWEEN.Tween(activeTrigger.rotation, true)
        .to({ x: 0.20 }, 35)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
          new TWEEN.Tween(activeTrigger.rotation, true)
            .to({ x: 0 }, 65)
            .easing(TWEEN.Easing.Quadratic.In)
            .start();
        })
        .start();
    }
  }

  /**
   * Dispatches reload choreography for either the .50 AE Desert Eagle or the Winchester Model 1912 Shotgun.
   */
  startReloadAnimation(options = {}) {
    if (this.currentWeapon === 'shotgun') {
      this._startShotgunReloadAnimation(options);
      return;
    }

    const { onCameraNudge, onComplete } = options;
    this.isReloading = true;

    // Clear any previous reload tweens & timeouts
    this.reloadTweens.forEach(t => t.stop());
    this.reloadTweens.length = 0;
    this.reloadTimers.forEach(id => clearTimeout(id));
    this.reloadTimers.length = 0;

    // Reset magGroup position and visibility
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

    // Depress mag-release button slightly
    if (this.magRelease) {
      const magBtnDown = new TWEEN.Tween(this.magRelease.position, true)
        .to({ x: -0.0210 }, 70)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
          const magBtnUp = new TWEEN.Tween(this.magRelease.position, true)
            .to({ x: -0.0226 }, 100)
            .easing(TWEEN.Easing.Quadratic.In);
          this.reloadTweens.push(magBtnUp);
          magBtnUp.start();
        });
      this.reloadTweens.push(magBtnDown);
      magBtnDown.start();
    }

    if (this.sound) {
      this.sound.playMagOut();
    }

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

    // STAGE 2 — Fresh Mag Insert & Heavy Slap (0.35s to 0.80s)
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

            // Seating slap at 0.80s!
            this.posSpring.impulse(0, 0.065, 0);
            this.rotSpring.impulse(0.020, 0, 0.040);

            if (this.sound) {
              this.sound.playMagIn();
            }
          });
        this.reloadTweens.push(magInsert);
        magInsert.start();
      }
    }, 350);
    this.reloadTimers.push(stage2Timer);

    // STAGE 3 — Slide Release Slam & Ready (0.80s to 1.15s)
    // Slide stop releases violently forward at 0.88s
    const stage3Timer = setTimeout(() => {
      if (!this.isReloading) return;

      this.isSlideLocked = false;
      this.slideBlowback = 0;
      this.slideGroup.position.z = 0;
      this.hammerRecoil = 0;
      this.hammerGroup.rotation.x = this.hammerRestAngle;

      // Sharp forward -Z and downward -pitch spring impulse into weapon
      this.posSpring.impulse(0, -0.015, -0.055);
      this.rotSpring.impulse(-0.075, 0, 0);

      if (typeof onCameraNudge === 'function') {
        onCameraNudge(-0.012);
      }

      if (this.sound) {
        this.sound.playSlideRelease();
      }

      // Return weapon tilt smoothly back to neutral hip-fire
      const tiltOut = new TWEEN.Tween(this.reloadTilt, true)
        .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, 270)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onComplete(() => {
          this.isReloading = false;
          if (typeof onComplete === 'function') {
            onComplete();
          }
        });
      this.reloadTweens.push(tiltOut);
      tiltOut.start();
    }, 880);
    this.reloadTimers.push(stage3Timer);

    // Safety fallback timer to guarantee completion even if tweens desync
    const safetyTimer = setTimeout(() => {
      if (this.isReloading) {
        this.isReloading = false;
        this.isSlideLocked = false;
        this.slideBlowback = 0;
        this.slideGroup.position.z = 0;
        this.hammerRecoil = 0;
        this.hammerGroup.rotation.x = this.hammerRestAngle;
        this.reloadTilt.roll = 0;
        this.reloadTilt.pitch = 0;
        this.reloadTilt.yaw = 0;
        this.reloadTilt.y = 0;
        if (typeof onComplete === 'function') {
          onComplete();
        }
      }
    }, 1250);
    this.reloadTimers.push(safetyTimer);
  }

  /**
   * Winchester Model 1912 Shell-by-Shell Bottom-Gate Reload & Final Pump Rack Choreography:
   * - Tilts the shotgun into an angled cradle showing the receiver & bottom shell carrier
   * - Inserts each missing red 12-gauge shell upward into the loading port with carrier lifter motion
   * - Calls onShellInserted() on each shell so HUD pips fill sequentially in real time
   * - Finishes with a crisp two-stroke pump rack ("CHK-CHK") to chamber a shell
   */
  _startShotgunReloadAnimation(options = {}) {
    const { shellsToLoad = 6, onShellInserted, onCameraNudge, onComplete } = options;
    this.isReloading = true;

    this.reloadTweens.forEach(t => t.stop());
    this.reloadTweens.length = 0;
    this.reloadTimers.forEach(id => clearTimeout(id));
    this.reloadTimers.length = 0;

    const count = Math.max(1, Math.min(6, shellsToLoad));
    const tiltInMs = 220;
    const perShellMs = 220;

    // 1. Tilt into tactical loading cradle
    const tiltIn = new TWEEN.Tween(this.reloadTilt, true)
      .to({ roll: 0.46, pitch: 0.20, yaw: 0.22, y: -0.015 }, tiltInMs)
      .easing(TWEEN.Easing.Cubic.Out);
    this.reloadTweens.push(tiltIn);
    tiltIn.start();

    // 2. Sequential 12-gauge shell insertion into bottom loading gate
    for (let i = 0; i < count; i++) {
      const shellStartDelay = tiltInMs + i * perShellMs;
      const shellTimer = setTimeout(() => {
        if (!this.isReloading || this.currentWeapon !== 'shotgun') return;

        if (this.shotgunReloadShell) {
          this.shotgunReloadShell.visible = true;
          this.shotgunReloadShell.position.set(0.008, -0.055, 0.028);
          this.shotgunReloadShell.rotation.set(-0.38, 0, 0);

          const shellInsert = new TWEEN.Tween(this.shotgunReloadShell.position, true)
            .to({ x: 0, y: -0.004, z: -0.032 }, 165)
            .easing(TWEEN.Easing.Cubic.Out)
            .onComplete(() => {
              if (this.shotgunReloadShell) {
                this.shotgunReloadShell.visible = false;
              }
            });
          this.reloadTweens.push(shellInsert);
          shellInsert.start();

          const shellRot = new TWEEN.Tween(this.shotgunReloadShell.rotation, true)
            .to({ x: 0 }, 165)
            .easing(TWEEN.Easing.Cubic.Out);
          this.reloadTweens.push(shellRot);
          shellRot.start();
        }

        // Pivot bright steel carrier spoon upward as shell slides into magazine tube
        if (this.shotgunCarrierGroup) {
          this.shotgunCarrierGroup.rotation.x = -0.26;
          const carrierTween = new TWEEN.Tween(this.shotgunCarrierGroup.rotation, true)
            .to({ x: 0 }, 160)
            .easing(TWEEN.Easing.Quadratic.Out);
          this.reloadTweens.push(carrierTween);
          carrierTween.start();
        }

        // Tactile upward thumb-push impulse
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

    // 3. Final Pump-Action Rack ("CHK-CHK") & Return to Ready
    const rackStartDelay = tiltInMs + count * perShellMs + 40;
    const rackTimer = setTimeout(() => {
      if (!this.isReloading || this.currentWeapon !== 'shotgun') return;

      if (this.shotgunReloadShell) {
        this.shotgunReloadShell.visible = false;
      }

      if (this.sound && typeof this.sound.playShotgunPump === 'function') {
        this.sound.playShotgunPump();
      }

      const pumpObj = { z: 0 };
      this.posSpring.impulse(0, -0.014, 0.038);
      this.rotSpring.impulse(0.045, 0, -0.035);

      const pumpBack = new TWEEN.Tween(pumpObj, true)
        .to({ z: 0.064 }, 115)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
          this._updateShotgunPumpVisuals(pumpObj.z);
        })
        .onComplete(() => {
          this.posSpring.impulse(0, 0.012, -0.048);
          this.rotSpring.impulse(-0.060, 0, 0.025);
          if (typeof onCameraNudge === 'function') {
            onCameraNudge(-0.014);
          }

          const pumpFwd = new TWEEN.Tween(pumpObj, true)
            .to({ z: 0 }, 110)
            .easing(TWEEN.Easing.Back.Out)
            .onUpdate(() => {
              this._updateShotgunPumpVisuals(pumpObj.z);
            })
            .onComplete(() => {
              this._updateShotgunPumpVisuals(0);
            });
          this.reloadTweens.push(pumpFwd);
          pumpFwd.start();
        });
      this.reloadTweens.push(pumpBack);
      pumpBack.start();

      // Smoothly return tilt to hip-fire ready
      const tiltOut = new TWEEN.Tween(this.reloadTilt, true)
        .to({ roll: 0, pitch: 0, yaw: 0, y: 0 }, 260)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onComplete(() => {
          this.isReloading = false;
          if (typeof onComplete === 'function') {
            onComplete();
          }
        });
      this.reloadTweens.push(tiltOut);
      tiltOut.start();
    }, rackStartDelay);
    this.reloadTimers.push(rackTimer);

    // Safety fallback timer
    const safetyTimer = setTimeout(() => {
      if (this.isReloading) {
        this.isReloading = false;
        this._updateShotgunPumpVisuals(0);
        if (this.shotgunCarrierGroup) this.shotgunCarrierGroup.rotation.x = 0;
        if (this.shotgunReloadShell) this.shotgunReloadShell.visible = false;
        this.reloadTilt.roll = 0;
        this.reloadTilt.pitch = 0;
        this.reloadTilt.yaw = 0;
        this.reloadTilt.y = 0;
        if (typeof onComplete === 'function') {
          onComplete();
        }
      }
    }, rackStartDelay + 420);
    this.reloadTimers.push(safetyTimer);
  }

  reset() {
    // 1. Clear any active reload timers and tweens
    this.reloadTimers.forEach(t => clearTimeout(t));
    this.reloadTimers = [];
    this.reloadTweens.forEach(t => t.stop());
    this.reloadTweens = [];

    // 2. Reset active weapon to Slot 1 (.50 AE Desert Eagle)
    this.currentWeapon = 'pistol';
    if (this.gunGroup) this.gunGroup.visible = true;
    if (this.shotgunGroup) this.shotgunGroup.visible = false;
    this.hipPosition = this.pistolHipPosition;
    this.adsPosition = this.pistolAdsPosition;
    this.hipRotation = this.pistolHipRotation;
    this.adsRotation = this.pistolAdsRotation;
    this.muzzleAnchor = this.muzzleSocket;
    if (this.muzzleFlashGroup && this.muzzleAnchor) {
      this.muzzleAnchor.add(this.muzzleFlashGroup);
    }

    // 3. Reset reload, slide, and shotgun pump states
    this.isReloading = false;
    this.isPumping = false;
    this.isSlideLocked = false;
    this.slideBlowback = 0;
    this._updateShotgunPumpVisuals(0);
    if (this.slideGroup) {
      this.slideGroup.position.set(0, 0, 0);
    }
    if (this.shotgunCarrierGroup) {
      this.shotgunCarrierGroup.rotation.set(0, 0, 0);
    }
    if (this.shotgunReloadShell) {
      this.shotgunReloadShell.visible = false;
    }
    this.hammerRecoil = 0;
    if (this.hammerGroup) {
      this.hammerGroup.rotation.x = this.hammerRestAngle;
    }

    // 4. Reset procedural reload tilts and animations
    this.reloadTilt = { roll: 0, pitch: 0, yaw: 0, y: 0 };
    if (this.magGroup) {
      this.magGroup.position.set(0, 0, 0);
      this.magGroup.rotation.set(0, 0, 0);
      this.magGroup.visible = true;
    }
    if (this.triggerMesh) {
      this.triggerMesh.rotation.x = 0;
    }
    if (this.shotgunTriggerMesh) {
      this.shotgunTriggerMesh.rotation.x = 0;
    }
    if (this.magRelease) {
      this.magRelease.position.set(-0.0226, -0.015, 0.022);
    }

    // 5. Reset ADS and springs to hip-fire resting position
    this.isADS = false;
    this.adsAlpha = 0;
    this.posSpring.reset(this.hipPosition.x, this.hipPosition.y, this.hipPosition.z);
    this.rotSpring.reset(this.hipRotation.x, this.hipRotation.y, this.hipRotation.z);
    this.bobSpring.reset(0, 0, 0);
    this.bobCycle = 0;

    // 6. Hide muzzle flash
    this.flashTimer = 0;
    if (this.muzzleFlashGroup) {
      this.muzzleFlashGroup.visible = false;
    }

    // 7. Reset root transform to hip position & rotation
    this.root.position.copy(this.hipPosition);
    this.root.rotation.set(this.hipRotation.x, this.hipRotation.y, this.hipRotation.z);
  }
}
