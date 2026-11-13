import * as THREE from 'three';
import { ObjectPool } from '../core/ObjectPool.js';

const _raycaster = new THREE.Raycaster();
const _unitZ = new THREE.Vector3(0, 0, 1);
const _tmpDir = new THREE.Vector3();
const _tmpNormal = new THREE.Vector3();
const _tmpPoint = new THREE.Vector3();
const _downDir = new THREE.Vector3(0, -1, 0);

function createSeededRandom(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Generates an organic dark-crimson zombie blood splatter texture (256x256).
 * Deep maroon core (#4a0404 -> #7f1d1d) with irregular splat lobes and satellite droplets.
 */
function createZombieBloodTexture(seed = 77) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size * 0.5;
  const cy = size * 0.5;
  const rand = createSeededRandom(seed);

  ctx.clearRect(0, 0, size, size);

  // 1. Subtle dark wet blood stain halo
  const outerGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 98);
  outerGrad.addColorStop(0.0, 'rgba(74, 4, 4, 0.88)');
  outerGrad.addColorStop(0.45, 'rgba(105, 16, 16, 0.52)');
  outerGrad.addColorStop(0.78, 'rgba(127, 29, 29, 0.16)');
  outerGrad.addColorStop(1.0, 'rgba(74, 4, 4, 0.0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 98, 0, Math.PI * 2);
  ctx.fill();

  // 2. Irregular organic main splat polygon
  const pts = 32;
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  ctx.beginPath();
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const lobe =
      Math.sin(a * 3 + p1) * 14 +
      Math.cos(a * 5 + p2) * 10 +
      Math.sin(a * 9 + seed) * 6 +
      (rand() - 0.5) * 14;
    const r = Math.max(24, 52 + lobe);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const coreGrad = ctx.createRadialGradient(cx - 6, cy - 6, 4, cx, cy, 74);
  coreGrad.addColorStop(0.0, '#2a0202');
  coreGrad.addColorStop(0.32, '#4a0404');
  coreGrad.addColorStop(0.70, '#7f1d1d');
  coreGrad.addColorStop(1.0, 'rgba(127, 29, 29, 0.65)');
  ctx.fillStyle = coreGrad;
  ctx.fill();

  // 3. Organic outward splatter streaks & satellite micro-droplets
  const streakCount = 14;
  for (let i = 0; i < streakCount; i++) {
    const a = (i / streakCount) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const startR = 38 + rand() * 18;
    const len = 18 + rand() * 44;
    const sx = cx + Math.cos(a) * startR;
    const sy = cy + Math.sin(a) * startR;
    const ex = cx + Math.cos(a) * (startR + len);
    const ey = cy + Math.sin(a) * (startR + len);

    ctx.strokeStyle = rand() > 0.4 ? 'rgba(74, 4, 4, 0.90)' : 'rgba(127, 29, 29, 0.82)';
    ctx.lineWidth = 2.0 + rand() * 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Terminal droplet bulb
    const dropR = 2.2 + rand() * 4.2;
    ctx.fillStyle = '#5c0808';
    ctx.beginPath();
    ctx.arc(ex + Math.cos(a) * (4 + rand() * 10), ey + Math.sin(a) * (4 + rand() * 10), dropR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Additional scattered fine droplets near rim
  for (let d = 0; d < 24; d++) {
    const a = rand() * Math.PI * 2;
    const dist = 54 + rand() * 58;
    const rx = cx + Math.cos(a) * dist;
    const ry = cy + Math.sin(a) * dist;
    if (rx < 6 || rx > size - 6 || ry < 6 || ry > size - 6) continue;
    const dr = 1.2 + rand() * 3.2;
    ctx.fillStyle = rand() > 0.35 ? 'rgba(85, 9, 9, 0.85)' : 'rgba(127, 29, 29, 0.72)';
    ctx.beginPath();
    ctx.arc(rx, ry, dr, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Manages zero-GC pooled dark-red zombie blood decals (on-body bone decals + world floor/wall splatter)
 * and 3D blood-burst impact droplets.
 */
export class DecalManager {
  constructor(scene, colliderMesh = null) {
    this.scene = scene;
    this.colliderMesh = colliderMesh;
    this._bloodLayerSeq = 0;

    this.bloodTextures = [
      createZombieBloodTexture(101),
      createZombieBloodTexture(203),
      createZombieBloodTexture(307),
    ];

    this.worldDecalGeo = new THREE.PlaneGeometry(0.38, 0.38);
    this.dropletGeo = new THREE.SphereGeometry(0.015, 6, 5);

    this.worldDecalBaseMat = new THREE.MeshBasicMaterial({
      map: this.bloodTextures[0],
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.dropletMat = new THREE.MeshBasicMaterial({
      color: 0x6b0b0f,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    // Pool of floor / wall blood splatter decals (6.0s full opacity -> 2.5s fade -> recycle at 8.5s)
    this.worldBloodPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(this.worldDecalGeo, this.worldDecalBaseMat.clone());
      mesh.visible = false;
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      mesh.userData = {
        isBloodDecal: true,
        age: 0,
        holdDuration: 6.0,
        fadeDuration: 2.5,
      };
      this.scene.add(mesh);
      return mesh;
    }, 48);
    this._activeWorldQueue = [];

    // Pool of fast 3D blood droplets puffing from bullet impacts
    this.dropletPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(this.dropletGeo, this.dropletMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh._vel = new THREE.Vector3();
      mesh._life = 0;
      mesh._maxLife = 0.35;
      this.scene.add(mesh);
      return mesh;
    }, 72);
  }

  setCollider(colliderMesh) {
    this.colliderMesh = colliderMesh;
  }

  getPreloadTextures() {
    return this.bloodTextures;
  }

  /**
   * Emits 10-12 fast dark-crimson 3D blood droplets from a bullet hit on a zombie.
   */
  spawnBloodBurst(hitPoint, shotDirection, isHeadshot = false) {
    const count = isHeadshot ? 12 : 10;
    _tmpDir.copy(shotDirection || _unitZ).normalize();

    for (let i = 0; i < count; i++) {
      const drop = this.dropletPool.acquire();
      if (!drop) break;

      drop.position.copy(hitPoint);
      drop.visible = true;
      const s = (isHeadshot ? 1.15 : 0.95) + Math.random() * 0.6;
      drop.scale.setScalar(s);

      // Spray both along exit direction and back-splatter toward shooter
      const dirSign = i < 6 ? 1.0 : -0.65;
      drop._vel.set(
        _tmpDir.x * dirSign * (1.2 + Math.random() * 2.2) + (Math.random() - 0.5) * 2.4,
        0.9 + Math.random() * 2.2,
        _tmpDir.z * dirSign * (1.2 + Math.random() * 2.2) + (Math.random() - 0.5) * 2.4
      );
      drop._maxLife = 0.28 + Math.random() * 0.18;
      drop._life = drop._maxLife;
    }
  }

  /**
   * Projects organic dark-crimson blood splatter decals onto nearby walls behind the zombie
   * and onto the floor beneath her impact point.
   */
  projectBloodSplatter(worldHitPoint, shotDirection, isHeadshot = false) {
    if (!this.colliderMesh) return;

    // 1. Wall / desk spray directly behind zombie along bullet direction (within 2.8m)
    if (shotDirection) {
      _tmpDir.copy(shotDirection).normalize();
      _raycaster.set(worldHitPoint, _tmpDir);
      _raycaster.far = 2.8;
      const wallHits = _raycaster.intersectObject(this.colliderMesh, false);
      if (wallHits.length > 0) {
        const hit = wallHits[0];
        if (hit.face) {
          _tmpNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
          if (_tmpNormal.dot(_tmpDir) > 0) _tmpNormal.negate();
          this.spawnWorldBloodDecal(hit.point, _tmpNormal, isHeadshot ? 1.2 : 1.0);
        }
      }
    }

    // 2. Floor blood puddle beneath hit position (slightly jittered forward along shot)
    _tmpPoint.copy(worldHitPoint);
    if (shotDirection) {
      _tmpPoint.x += shotDirection.x * (0.25 + Math.random() * 0.35);
      _tmpPoint.z += shotDirection.z * (0.25 + Math.random() * 0.35);
    }
    _tmpPoint.y = Math.max(0.2, _tmpPoint.y);
    _raycaster.set(_tmpPoint, _downDir);
    _raycaster.far = 3.2;
    const floorHits = _raycaster.intersectObject(this.colliderMesh, false);
    if (floorHits.length > 0) {
      const hit = floorHits[0];
      _tmpNormal.set(0, 1, 0);
      this.spawnWorldBloodDecal(hit.point, _tmpNormal, isHeadshot ? 1.3 : 1.05);
    }
  }

  /**
   * Places a dark-crimson blood decal flush onto a world surface (wall or floor).
   */
  spawnWorldBloodDecal(point, surfaceNormal, scaleMult = 1.0) {
    // Enforce clean FIFO cap so pool never fails when saturated
    if (this._activeWorldQueue.length >= 44) {
      const oldest = this._activeWorldQueue.shift();
      if (oldest) {
        oldest.visible = false;
        this.worldBloodPool.release(oldest);
      }
    }

    const decal = this.worldBloodPool.acquire();
    if (!decal) return;

    const tex = this.bloodTextures[Math.floor(Math.random() * this.bloodTextures.length)];
    if (decal.material.map !== tex) {
      decal.material.map = tex;
    }
    decal.material.opacity = 0.92;
    decal.userData.age = 0;
    decal.userData.holdDuration = 6.0;
    decal.userData.fadeDuration = 2.5;

    const layerStep = ((this._bloodLayerSeq++) % 24) * 0.00014;
    _tmpNormal.copy(surfaceNormal).normalize();
    decal.position.copy(point).addScaledVector(_tmpNormal, 0.0065 + layerStep);
    decal.quaternion.setFromUnitVectors(_unitZ, _tmpNormal);
    decal.rotateZ(Math.random() * Math.PI * 2);

    const s = scaleMult * (0.85 + Math.random() * 0.42);
    decal.scale.set(s, s, 1.0);
    decal.visible = true;
    this._activeWorldQueue.push(decal);
  }

  update(delta) {
    this.dropletPool.forEachActive((drop) => {
      drop._life -= delta;
      if (drop._life <= 0) {
        drop.visible = false;
        this.dropletPool.release(drop);
        return;
      }
      drop._vel.y -= 13.5 * delta;
      drop.position.addScaledVector(drop._vel, delta);
      if (drop.position.y < 0.01) {
        drop.visible = false;
        this.dropletPool.release(drop);
      }
    });

    // Update floor/wall blood splatter lifetimes (6.0s hold -> 2.5s fade -> recycle at 8.5s)
    this.worldBloodPool.forEachActive((decal) => {
      const ud = decal.userData;
      ud.age += delta;
      const hold = ud.holdDuration ?? 6.0;
      const fade = ud.fadeDuration ?? 2.5;
      if (ud.age <= hold) {
        if (decal.material.opacity !== 0.92) {
          decal.material.opacity = 0.92;
        }
      } else if (ud.age < hold + fade) {
        const t = (ud.age - hold) / fade;
        decal.material.opacity = 0.92 * (1.0 - t);
      } else {
        decal.visible = false;
        decal.material.opacity = 0.92;
        ud.age = 0;
        const idx = this._activeWorldQueue.indexOf(decal);
        if (idx !== -1) {
          this._activeWorldQueue.splice(idx, 1);
        }
        this.worldBloodPool.release(decal);
      }
    });
  }

  clearBloodDecals() {
    this._activeWorldQueue.length = 0;
    this.worldBloodPool.forEachActive((decal) => {
      decal.visible = false;
      decal.material.opacity = 0.92;
      decal.userData.age = 0;
    });
    this.worldBloodPool.releaseAll();

    this.dropletPool.forEachActive((drop) => {
      drop.visible = false;
    });
    this.dropletPool.releaseAll();
  }

  prepareWarmUp(renderer) {
    if (renderer) {
      for (const tex of this.bloodTextures) {
        if (tex) {
          try { renderer.initTexture(tex); } catch (e) {}
        }
      }
    }

    const samples = [];
    const worldSample = this.worldBloodPool.acquire();
    if (worldSample) {
      worldSample.position.set(0, -10, 0);
      worldSample.visible = true;
      samples.push({ pool: this.worldBloodPool, item: worldSample });
    }
    const dropSample = this.dropletPool.acquire();
    if (dropSample) {
      dropSample.position.set(0, -10, 0);
      dropSample.visible = true;
      samples.push({ pool: this.dropletPool, item: dropSample });
    }
    return { samples };
  }

  finishWarmUp(state) {
    if (!state || !state.samples) return;
    for (const { pool, item } of state.samples) {
      item.visible = false;
      pool.release(item);
    }
  }
}

