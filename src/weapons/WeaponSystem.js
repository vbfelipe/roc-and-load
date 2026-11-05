import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { ObjectPool } from '../core/ObjectPool.js';

// Pre-allocated scratch variables for zero-GC hitscan and transforms
const _rayOrigin = new THREE.Vector3();
const _rayDirection = new THREE.Vector3();
const _scratchVec1 = new THREE.Vector3();
const _scratchVec2 = new THREE.Vector3();
const _scratchVec3 = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _tracerDir = new THREE.Vector3();
const _tracerSpawn = new THREE.Vector3();
const _pelletForward = new THREE.Vector3();
const _pelletRight = new THREE.Vector3();
const _pelletUp = new THREE.Vector3();
const _decalUnitZ = new THREE.Vector3(0, 0, 1);
const _raycaster = new THREE.Raycaster();
_raycaster.firstHitOnly = true;

// Procedural multi-layered architectural wall/surface bullet impact decal texture (256x256)
// Generates subtle variations so consecutive shots never look like identical stamps.
function createBulletDecalTexture(variantIndex = 0, isHeavySpall = false) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size * 0.5;
  const cy = size * 0.5;
  const maxR = size * 0.5; // 128px

  ctx.clearRect(0, 0, size, size);

  // Deterministic PRNG per variant so each pooled texture has unique organic geometry
  let seed = (variantIndex + 1) * 9301 + (isHeavySpall ? 49297 : 17389);
  const rand = () => {
    seed = (seed * 16807 + 11) % 2147483647;
    return (seed & 0x7fffffff) / 2147483647;
  };

  const spallBoost = isHeavySpall ? 1.12 : 1.0;

  // ===========================================================================
  // LAYER 1 — SUBTLE SCORCH & DUST HALO
  // Soft, low-opacity radial smudge of gunsmoke soot and chalky plaster/concrete
  // dust fading smoothly to rgba(0,0,0,0) well before the outer canvas border.
  // ===========================================================================
  const dustOuterR = 114;
  const dustGrad = ctx.createRadialGradient(cx, cy, 22, cx, cy, dustOuterR);
  dustGrad.addColorStop(0.0, 'rgba(178, 184, 192, 0.22)');
  dustGrad.addColorStop(0.32, 'rgba(152, 158, 168, 0.13)');
  dustGrad.addColorStop(0.65, 'rgba(116, 122, 132, 0.045)');
  dustGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = dustGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, dustOuterR, 0, Math.PI * 2);
  ctx.fill();

  // Asymmetric off-center chalky dust puffs so the outer halo feels organic
  const puffCount = 5;
  for (let i = 0; i < puffCount; i++) {
    const a = (i / puffCount) * Math.PI * 2 + rand() * 0.65;
    const dist = 16 + rand() * 18;
    const px = cx + Math.cos(a) * dist;
    const py = cy + Math.sin(a) * dist;
    const pr = 46 + rand() * 28;
    const pGrad = ctx.createRadialGradient(px, py, 6, px, py, pr);
    pGrad.addColorStop(0.0, 'rgba(168, 174, 182, 0.09)');
    pGrad.addColorStop(0.55, 'rgba(95, 102, 112, 0.035)');
    pGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft propellant gunsmoke scorch smudge around the crater rim
  const scorchOuterR = 76 * spallBoost;
  const scorchGrad = ctx.createRadialGradient(cx, cy, 18, cx, cy, scorchOuterR);
  scorchGrad.addColorStop(0.0, 'rgba(22, 26, 32, 0.36)');
  scorchGrad.addColorStop(0.42, 'rgba(34, 39, 47, 0.18)');
  scorchGrad.addColorStop(0.76, 'rgba(48, 54, 64, 0.05)');
  scorchGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = scorchGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, scorchOuterR, 0, Math.PI * 2);
  ctx.fill();

  // ===========================================================================
  // LAYER 2 — CHIPPED PLASTER/CONCRETE SPALL CRATER (3D DEPTH ILLUSION)
  // Irregular, jagged chipped rim using lighter gray/off-white spalled drywall
  // tones (#8a8f96 to #b8bec6) with directional inner shading (darker top-inner
  // bevel, subtle lighter bottom-inner edge) so the crater looks recessed.
  // ===========================================================================
  const outerPtsCount = 28;
  const outerRimPts = [];
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  for (let i = 0; i < outerPtsCount; i++) {
    const a = (i / outerPtsCount) * Math.PI * 2;
    const wave =
      Math.sin(a * 3 + phase1) * 4.2 +
      Math.cos(a * 7 + phase2) * 3.1 +
      (rand() - 0.5) * 6.4;
    const baseR = (49 + wave) * spallBoost; // ~42px to 58px
    outerRimPts.push({
      a,
      r: baseR,
      x: cx + Math.cos(a) * baseR,
      y: cy + Math.sin(a) * baseR,
    });
  }

  // Subtle outer ambient-occlusion lip where paint/plaster is sheared off
  ctx.fillStyle = 'rgba(26, 30, 36, 0.42)';
  ctx.beginPath();
  for (let i = 0; i < outerRimPts.length; i++) {
    const p = outerRimPts[i];
    const ox = p.x + 0.8;
    const oy = p.y + 1.0;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
  }
  ctx.closePath();
  ctx.fill();

  // Primary chipped spall crater shelf (#8a8f96 to #b8bec6 directional shading)
  const spallShelfGrad = ctx.createLinearGradient(cx - 52, cy - 52, cx + 52, cy + 52);
  spallShelfGrad.addColorStop(0.0, '#8a8f96');
  spallShelfGrad.addColorStop(0.45, '#9fa5ae');
  spallShelfGrad.addColorStop(1.0, '#b8bec6');
  ctx.fillStyle = spallShelfGrad;
  ctx.beginPath();
  for (let i = 0; i < outerRimPts.length; i++) {
    const p = outerRimPts[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  // Terraced spall facets / chipped plaster flakes around the crater shelf
  const facetCount = isHeavySpall ? 9 : 6;
  const facetTones = ['#8a8f96', '#949aa2', '#a4aab3', '#b0b6bf', '#b8bec6'];
  for (let f = 0; f < facetCount; f++) {
    const startIdx = Math.floor((f / facetCount) * outerPtsCount + rand() * 2) % outerPtsCount;
    const span = 3 + Math.floor(rand() * 3);
    const innerR1 = (32 + rand() * 6) * spallBoost;
    const innerR2 = (33 + rand() * 6) * spallBoost;

    ctx.fillStyle = facetTones[(f + variantIndex) % facetTones.length];
    ctx.beginPath();
    for (let k = 0; k <= span; k++) {
      const pt = outerRimPts[(startIdx + k) % outerPtsCount];
      const jitterR = pt.r * (0.90 + rand() * 0.12);
      const px = cx + Math.cos(pt.a) * jitterR;
      const py = cy + Math.sin(pt.a) * jitterR;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    const endA = outerRimPts[(startIdx + span) % outerPtsCount].a;
    const startA = outerRimPts[startIdx].a;
    ctx.lineTo(cx + Math.cos(endA) * innerR2, cy + Math.sin(endA) * innerR2);
    ctx.lineTo(cx + Math.cos(startA) * innerR1, cy + Math.sin(startA) * innerR1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(48, 54, 62, 0.34)';
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }

  // Recessed inner bevel ring (directional 3D bowl shading: darker top-inner bevel,
  // lighter bottom-inner edge)
  const bevelPtsCount = 24;
  const bevelPts = [];
  for (let i = 0; i < bevelPtsCount; i++) {
    const a = (i / bevelPtsCount) * Math.PI * 2;
    const r = (36.5 + Math.sin(a * 5 + phase1) * 2.2 + (rand() - 0.5) * 3.4) * (isHeavySpall ? 1.06 : 1.0);
    bevelPts.push({
      a,
      r,
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
    });
  }

  // Directional inner bevel gradient: dark top-inner bevel (#3a4048) -> lighter bottom-inner edge (#b8bec6)
  const innerBevelGrad = ctx.createLinearGradient(cx - 10, cy - 38, cx + 10, cy + 38);
  innerBevelGrad.addColorStop(0.0, '#3a4048');
  innerBevelGrad.addColorStop(0.38, '#585f6a');
  innerBevelGrad.addColorStop(0.72, '#9298a1');
  innerBevelGrad.addColorStop(1.0, '#b8bec6');
  ctx.fillStyle = innerBevelGrad;
  ctx.beginPath();
  for (let i = 0; i < bevelPts.length; i++) {
    const p = bevelPts[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  // Top-inner shadow crescent inside the upper crater wall for deep 3D recession
  ctx.strokeStyle = 'rgba(28, 32, 38, 0.68)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  for (let i = 0; i < bevelPts.length; i++) {
    const p = bevelPts[i];
    if (Math.sin(p.a) < 0.15) {
      if (i === 0 || Math.sin(bevelPts[(i - 1 + bevelPts.length) % bevelPts.length].a) >= 0.15) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
  }
  ctx.stroke();

  // Subtle lighter bottom-inner catchlight edge along the lower crater lip
  ctx.strokeStyle = 'rgba(202, 208, 216, 0.78)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < bevelPts.length; i++) {
    const p = bevelPts[i];
    if (Math.sin(p.a) > 0.10) {
      if (i === 0 || Math.sin(bevelPts[(i - 1 + bevelPts.length) % bevelPts.length].a) <= 0.10) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
  }
  ctx.stroke();

  // ===========================================================================
  // LAYER 3 — MICRO-FRACTURES & SPALL FLECKS
  // Short, sharp, ultra-thin hairline cracks (lineWidth: 0.6–1.2px, tapering
  // opacity) and tiny irregular chipped debris dots hugging closely to the
  // crater rim — NO long, thick cartoon spider legs sticking out.
  // ===========================================================================
  const numHairlines = isHeavySpall ? 14 : 11;
  for (let i = 0; i < numHairlines; i++) {
    const baseAngle = (i / numHairlines) * Math.PI * 2 + (rand() - 0.5) * 0.28;
    const startR = (35 + rand() * 8) * (isHeavySpall ? 1.05 : 1.0);
    const totalLen = (10 + rand() * 14) * spallBoost; // short, tight to the rim (reaches ~46-66px)
    const segs = 3;

    let curX = cx + Math.cos(baseAngle) * startR;
    let curY = cy + Math.sin(baseAngle) * startR;
    let curA = baseAngle;

    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const segLen = totalLen / segs;
      curA += (rand() - 0.5) * 0.34;
      const nextX = curX + Math.cos(curA) * segLen;
      const nextY = curY + Math.sin(curA) * segLen;

      const width = 1.15 - t * 0.52; // 1.15px tapering down to 0.63px
      const alpha = (0.56 - t * 0.36).toFixed(2);

      // Ultra-thin hairline shadow fracture
      ctx.strokeStyle = `rgba(30, 34, 42, ${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(curX, curY);
      ctx.lineTo(nextX, nextY);
      ctx.stroke();

      // Faint plaster edge micro-highlight alongside the hairline
      ctx.strokeStyle = `rgba(186, 192, 200, ${((0.56 - t * 0.36) * 0.42).toFixed(2)})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(curX + 0.5, curY + 0.5);
      ctx.lineTo(nextX + 0.5, nextY + 0.5);
      ctx.stroke();

      curX = nextX;
      curY = nextY;
    }
  }

  // Tiny irregular chipped debris dots & spall flecks hugging the crater rim
  const numFlecks = isHeavySpall ? 34 : 26;
  const fleckColors = ['#8a8f96', '#9ca2ab', '#b4bac2', '#2e333b', '#6c727b'];
  for (let i = 0; i < numFlecks; i++) {
    const a = (i / numFlecks) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const r = (39 + rand() * 29) * spallBoost; // tightly hugging the rim (~39px to 68px)
    const fx = cx + Math.cos(a) * r;
    const fy = cy + Math.sin(a) * r;
    const fr = 0.8 + rand() * 1.5;

    ctx.fillStyle = fleckColors[(i + variantIndex) % fleckColors.length];
    ctx.beginPath();
    const sides = 4;
    for (let v = 0; v < sides; v++) {
      const va = (v / sides) * Math.PI * 2 + rand() * 0.5;
      const vr = fr * (0.65 + rand() * 0.55);
      const vx = fx + Math.cos(va) * vr;
      const vy = fy + Math.sin(va) * vr;
      if (v === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ===========================================================================
  // LAYER 4 — DEEP ENTRY CAVITY (CORE PUNCTURE)
  // Sharp, irregular pitch-black entry hole (#050608) occupying only ~22%–26%
  // of the canvas radius (128px * 0.22..0.26 = 28.2px..33.3px) so the black
  // bullet hole itself stays tight and proportional.
  // ===========================================================================
  const corePtsCount = 22;
  const coreBaseR = maxR * (0.232 + (variantIndex % 3) * 0.006); // ~29.7px to 31.2px (~23-24.5% of 128px)
  const corePts = [];
  for (let i = 0; i < corePtsCount; i++) {
    const a = (i / corePtsCount) * Math.PI * 2;
    const rJitter =
      Math.sin(a * 4 + phase2) * 1.4 +
      Math.cos(a * 6 + phase1) * 1.1 +
      (rand() - 0.5) * 2.2;
    const r = THREE.MathUtils.clamp(coreBaseR + rJitter, maxR * 0.22, maxR * 0.26);
    corePts.push({
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
    });
  }

  // Crushed dark concrete transition lip right around the core puncture
  ctx.fillStyle = '#1b1f26';
  ctx.beginPath();
  for (let i = 0; i < corePts.length; i++) {
    const p = corePts[i];
    const tx = cx + (p.x - cx) * 1.10;
    const ty = cy + (p.y - cy) * 1.10;
    if (i === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }
  ctx.closePath();
  ctx.fill();

  // Sharp, irregular pitch-black entry cavity (#050608)
  ctx.fillStyle = '#050608';
  ctx.beginPath();
  for (let i = 0; i < corePts.length; i++) {
    const p = corePts[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();

  // Crisp inner cavity edge definition
  ctx.strokeStyle = '#0d1015';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Procedural laminated/tempered architectural glass bullet impact decal texture (256x256)
function createGlassBulletDecalTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size * 0.5;
  const cy = size * 0.5;

  ctx.clearRect(0, 0, size, size);

  // 1. Subtle frosted glass delamination cloud around impact zone
  const frostGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 86);
  frostGrad.addColorStop(0.0, 'rgba(235, 246, 255, 0.58)');
  frostGrad.addColorStop(0.32, 'rgba(210, 232, 252, 0.28)');
  frostGrad.addColorStop(0.68, 'rgba(185, 215, 245, 0.08)');
  frostGrad.addColorStop(1.0, 'rgba(185, 215, 245, 0.0)');
  ctx.fillStyle = frostGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 86, 0, Math.PI * 2);
  ctx.fill();

  // 2. Concentric conchoidal spiderweb fracture rings (3 irregular stress rings)
  const ringRadii = [23, 41, 64];
  const ringSegs = 18;
  for (let rIdx = 0; rIdx < ringRadii.length; rIdx++) {
    const baseR = ringRadii[rIdx];
    const alpha = 0.82 - rIdx * 0.22;

    // Dark refractive shadow offset
    ctx.strokeStyle = `rgba(22, 34, 48, ${alpha * 0.62})`;
    ctx.lineWidth = 1.6 - rIdx * 0.25;
    ctx.beginPath();
    for (let s = 0; s <= ringSegs; s++) {
      const idx = s % ringSegs;
      const a = (idx / ringSegs) * Math.PI * 2;
      const jitter = Math.sin(idx * 5.3 + rIdx * 2.1) * (2.5 + rIdx * 1.4);
      const rr = baseR + jitter;
      const px = cx + 1.0 + Math.cos(a) * rr;
      const py = cy + 1.0 + Math.sin(a) * rr;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Crisp white specular fracture line
    ctx.strokeStyle = `rgba(245, 252, 255, ${alpha})`;
    ctx.lineWidth = 1.25 - rIdx * 0.2;
    ctx.beginPath();
    for (let s = 0; s <= ringSegs; s++) {
      const idx = s % ringSegs;
      const a = (idx / ringSegs) * Math.PI * 2;
      const jitter = Math.sin(idx * 5.3 + rIdx * 2.1) * (2.5 + rIdx * 1.4);
      const rr = baseR + jitter;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // 3. 18 Razor-sharp radial spiderweb cracks with forked secondary branches
  const numRays = 18;
  for (let i = 0; i < numRays; i++) {
    const baseAngle = (i / numRays) * Math.PI * 2 + Math.sin(i * 4.1) * 0.11;
    const startR = 11 + (i % 3) * 1.5;
    const maxLen = 46 + ((i * 19 + 7) % 66); // reaches 58px to 122px
    const steps = 4;

    const pts = [];
    let curA = baseAngle;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const r = startR + maxLen * t;
      if (k > 0) {
        curA += Math.sin(i * 7.3 + k * 3.9) * 0.055;
      }
      pts.push({
        x: cx + Math.cos(curA) * r,
        y: cy + Math.sin(curA) * r,
        r,
        a: curA,
      });
    }

    // Dark refractive edge
    ctx.strokeStyle = 'rgba(18, 28, 42, 0.65)';
    ctx.lineWidth = i % 2 === 0 ? 1.85 : 1.35;
    ctx.beginPath();
    ctx.moveTo(pts[0].x + 0.9, pts[0].y + 0.9);
    for (let k = 1; k < pts.length; k++) {
      ctx.lineTo(pts[k].x + 0.9, pts[k].y + 0.9);
    }
    ctx.stroke();

    // Bright crystalline white crack highlight
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(250, 254, 255, 0.95)' : 'rgba(225, 242, 255, 0.82)';
    ctx.lineWidth = i % 2 === 0 ? 1.35 : 0.95;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) {
      ctx.lineTo(pts[k].x, pts[k].y);
    }
    ctx.stroke();

    // Secondary forked branch on alternating rays
    if (i % 2 === 0 && pts.length >= 3) {
      const forkOrigin = pts[2];
      const forkSign = i % 4 === 0 ? 1 : -1;
      const forkAngle = forkOrigin.a + forkSign * 0.34;
      const forkLen = 20 + (i % 5) * 5;
      const fx = forkOrigin.x + Math.cos(forkAngle) * forkLen;
      const fy = forkOrigin.y + Math.sin(forkAngle) * forkLen;

      ctx.strokeStyle = 'rgba(20, 32, 48, 0.48)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(forkOrigin.x + 0.7, forkOrigin.y + 0.7);
      ctx.lineTo(fx + 0.7, fy + 0.7);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(240, 250, 255, 0.80)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(forkOrigin.x, forkOrigin.y);
      ctx.lineTo(fx, fy);
      ctx.stroke();
    }
  }

  // 4. Pulverized white crushed-glass impact collar around bullet hole
  ctx.fillStyle = 'rgba(238, 248, 255, 0.94)';
  ctx.beginPath();
  const collarPts = 20;
  for (let i = 0; i < collarPts; i++) {
    const a = (i / collarPts) * Math.PI * 2;
    const r = 16 + ((i * 7 + 3) % 7); // 16px to 22px
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Scattered crystalline micro-shard flecks around the crushed collar
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.14;
    const r = 20 + ((i * 11) % 34);
    const sx = cx + Math.cos(a) * r;
    const sy = cy + Math.sin(a) * r;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.92)' : 'rgba(205, 232, 255, 0.75)';
    ctx.fillRect(sx - 1.2, sy - 1.2, 2.4, 2.4);
  }

  // 5. Central bullet puncture core & bright white crushed-glass inner rim
  ctx.fillStyle = 'rgba(14, 22, 32, 0.86)';
  ctx.beginPath();
  ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(cx, cy, 10.5, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Procedural hot-metal ember glow texture
function createEmberGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
  grad.addColorStop(0.0, 'rgba(255, 240, 180, 1.0)'); // white-hot center
  grad.addColorStop(0.35, 'rgba(255, 120, 20, 0.85)'); // incandescent orange
  grad.addColorStop(0.70, 'rgba(200, 40, 0, 0.40)');  // deep red-orange
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class WeaponSystem {
  constructor(scene, camera, viewmodel, inputManager, soundManager, player = null) {
    this.scene = scene;
    this.camera = camera;
    this.viewmodel = viewmodel;
    this.input = inputManager;
    this.sound = soundManager;
    this.player = player;

    this.currentWeapon = 'hk_usp';
    this.weapons = {
      hk_usp: {
        currentAmmo: 12,
        maxAmmo: 12,
        fireRate: 0.18,
        isSlideLocked: false,
      },
      pistol: {
        currentAmmo: 7,
        maxAmmo: 7,
        fireRate: 0.45,
        isSlideLocked: false,
      },
      shotgun: {
        currentAmmo: 6,
        maxAmmo: 6,
        fireRate: 0.72,
        isSlideLocked: false,
      },
      hk_mp5: {
        currentAmmo: 30,
        maxAmmo: 30,
        fireRate: 0.075,
        isSlideLocked: false,
      },
    };

    this.fireRate = 0.18;
    this.fireTimer = 0;
    this.wasMouseDown0 = false;

    this.maxAmmo = 12;
    this.currentAmmo = 12;
    this.isReloading = false;
    this.isSlideLocked = false;
    this.hud = null;
    if (typeof window !== 'undefined') window.__rocWeaponSystem = this;

    this.colliderMesh = null;
    this.glassMesh = null;
    this.glassMeshes = null;
    this.boxManager = null;
    this.monitorScreens = [];
    this.crosshairEl = null;

    // Pre-generated 256x256 Wall Bullet Decal Variations & Base Materials
    this.decalTextures = [
      createBulletDecalTexture(0, false),
      createBulletDecalTexture(1, false),
      createBulletDecalTexture(2, false),
      createBulletDecalTexture(3, false),
    ];
    this.heavyDecalTextures = [
      createBulletDecalTexture(0, true),
      createBulletDecalTexture(1, true),
      createBulletDecalTexture(2, true),
      createBulletDecalTexture(3, true),
    ];
    this.decalTexture = this.decalTextures[0];
    this._lastDecalVariantIdx = -1;
    this.glassDecalTexture = createGlassBulletDecalTexture();
    this.emberTexture = createEmberGlowTexture();

    this.baseDecalMaterial = new THREE.MeshBasicMaterial({
      map: this.decalTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.baseEmberMaterial = new THREE.MeshBasicMaterial({
      map: this.emberTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 1.0,
    });

    // Warm Ballistic Tracer Material (Incandescent golden-yellow streak)
    this.tracerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd060,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Shiny .50 AE Brass Shell Casing Material
    this.casingMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.90,
      roughness: 0.20,
    });

    // Red 12-Gauge Shotgun Hull Material
    this.shotgunHullMaterial = new THREE.MeshStandardMaterial({
      color: 0xc81e1e,
      metalness: 0.08,
      roughness: 0.42,
    });

    // Impact Sparks Material (Hot metal orange-yellow)
    this.sparkMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    // Pre-allocated Zero-GC Object Pools
    this._initObjectPools();

    // Muzzle Flash PointLight (Warm fiery pulse 0xff6600, 6.0 intensity, 3.5m range)
    this.muzzleLight = new THREE.PointLight(0xff6600, 0, 3.5, 2.0);
    this.muzzleLight.visible = true; // Kept permanently visible to eliminate Three.js shader re-compilation freezes!
    this.scene.add(this.muzzleLight);
    this.flashDuration = 0;
    this._lastCrosshairHidden = null;

    // Strict game state gating (MENU vs PLAYING) and arming cooldown
    this.gameState = 'MENU';
    this.armedAt = 0;
  }

  setGameState(state) {
    this.gameState = state;
    if (state === 'PLAYING') {
      this.wasMouseDown0 = true;
      this.armedAt = performance.now() + 150; // 150ms arming cooldown after pointer lock acquired
    } else {
      this.wasMouseDown0 = true;
      this.viewmodel.setADS(false);
    }
  }

  setHUD(hud) {
    this.hud = hud;
    if (this.hud) {
      if (typeof this.hud.setWeapon === 'function') {
        this.hud.setWeapon(this.currentWeapon, this.currentAmmo, this.maxAmmo);
      } else {
        this.hud.updateAmmo(this.currentAmmo, this.maxAmmo);
      }
      this.hud.setReloadCallback(() => this.startReload());
    }
  }

  /**
   * Switches between Slot 1 ('hk_usp' - 9mm H&K USP),
   * Slot 2 ('pistol' - .50 AE Desert Eagle),
   * Slot 3 ('shotgun' - Remington 870 12-Gauge),
   * and Slot 4 ('hk_mp5' - 9mm H&K MP5 Submachine Gun).
   */
  switchWeapon(weaponType, force = false, options = {}) {
    let isSilent = false;
    if (typeof force === 'object' && force !== null) {
      options = force;
      force = !!options.force;
      isSilent = !!options.silent;
    } else if (typeof options === 'object' && options !== null) {
      isSilent = !!options.silent;
    }

    const canSwitch = force || window.isViewmodelTunerOpen || (this.gameState === 'PLAYING' && this.input.isLocked && document.pointerLockElement !== null);
    if (!canSwitch) return;
    if (weaponType === 1 || weaponType === '1') weaponType = 'hk_usp';
    if (weaponType === 2 || weaponType === '2') weaponType = 'pistol';
    if (weaponType === 3 || weaponType === '3') weaponType = 'shotgun';
    if (weaponType === 4 || weaponType === '4') weaponType = 'hk_mp5';
    if (weaponType !== 'hk_usp' && weaponType !== 'pistol' && weaponType !== 'shotgun' && weaponType !== 'hk_mp5') return;
    if (this.currentWeapon === weaponType && (!this.viewmodel || this.viewmodel.currentWeapon === weaponType) && !force) return;

    // 1. Persist current weapon state
    const prevState = this.weapons[this.currentWeapon];
    if (prevState) {
      prevState.currentAmmo = this.currentAmmo;
      prevState.isSlideLocked = this.isSlideLocked;
    }

    // 2. Cancel any active reload and load target weapon state
    this.isReloading = false;
    if (this.sound && typeof this.sound.stopActionSounds === 'function') {
      this.sound.stopActionSounds();
    }
    this.currentWeapon = weaponType;
    const nextState = this.weapons[weaponType];
    this.currentAmmo = nextState.currentAmmo;
    this.maxAmmo = nextState.maxAmmo;
    this.fireRate = nextState.fireRate;
    this.isSlideLocked = nextState.isSlideLocked;
    this.fireTimer = 0.18; // Brief equip readiness delay

    // 3. Switch 3D viewmodel & ADS state
    if (this.viewmodel) {
      if (!window.isViewmodelTunerOpen) {
        this.viewmodel.setADS(false);
      }
      this.viewmodel.switchWeapon(weaponType, { silent: isSilent, force });
      if (weaponType === 'hk_usp' || weaponType === 'pistol') {
        this.viewmodel.setSlideLocked(this.isSlideLocked);
      }
    }

    // 4. Update HUD to display active weapon caliber, mode, ammo count, and cartridge/shotshell pips
    if (this.hud) {
      if (typeof this.hud.setWeapon === 'function') {
        this.hud.setWeapon(weaponType, this.currentAmmo, this.maxAmmo);
      } else {
        this.hud.updateAmmo(this.currentAmmo, this.maxAmmo, true);
      }
    }
  }

  /**
   * Plays the tactical weapon draw/equip animation and sound when entering gameplay.
   */
  playInitialEquip() {
    this.fireTimer = 0.22; // Brief equip delay before firing
    if (this.viewmodel && typeof this.viewmodel.playEquipAnimation === 'function') {
      this.viewmodel.playEquipAnimation(this.currentWeapon);
    }
  }

  startReload(force = false) {
    const canReload = force || window.isViewmodelTunerOpen || (this.gameState === 'PLAYING' && this.input.isLocked && document.pointerLockElement !== null);
    if (!canReload) return;
    if (this.currentAmmo >= this.maxAmmo || this.isReloading) return;

    this.isReloading = true;
    if (!window.isViewmodelTunerOpen) {
      this.viewmodel.setADS(false);
    }

    if (this.hud) {
      this.hud.onReloadStart();
    }

    const ammoBeforeReload = this.currentAmmo;
    const shellsNeeded = this.maxAmmo - this.currentAmmo;

    this.viewmodel.startReloadAnimation({
      shellsToLoad: shellsNeeded,
      onShellInserted: () => {
        if (this.currentWeapon === 'shotgun' && this.currentAmmo < this.maxAmmo) {
          this.currentAmmo++;
          this.weapons.shotgun.currentAmmo = this.currentAmmo;
          if (this.hud) {
            if (typeof this.hud.onShotgunShellInserted === 'function') {
              this.hud.onShotgunShellInserted(this.currentAmmo, this.maxAmmo);
            } else {
              this.hud.updateAmmo(this.currentAmmo, this.maxAmmo);
            }
          }
        }
      },
      onCameraNudge: (pitchImpulse) => {
        if (this.player && typeof this.player.applyCameraRecoil === 'function') {
          this.player.applyCameraRecoil(pitchImpulse);
        }
      },
      onComplete: () => {
        this.currentAmmo = this.maxAmmo;
        this.isSlideLocked = false;
        this.isReloading = false;
        this.weapons[this.currentWeapon].currentAmmo = this.maxAmmo;
        this.weapons[this.currentWeapon].isSlideLocked = false;
        if (this.currentWeapon === 'hk_usp' || this.currentWeapon === 'pistol') {
          this.viewmodel.setSlideLocked(false);
        }

        if (this.hud) {
          this.hud.updateAmmo(this.currentAmmo, this.maxAmmo);
          this.hud.setEmptyState(false);
          if (this.currentWeapon === 'pistol' || this.currentWeapon === 'hk_usp' || this.currentWeapon === 'hk_mp5') {
            this.hud.onReloadComplete(ammoBeforeReload);
          }
        }
      }
    });
  }

  setCollider(colliderMesh) {
    this.colliderMesh = colliderMesh;
  }

  setMonitorScreens(screens) {
    this.monitorScreens = screens;
  }

  setBoxManager(boxManager) {
    this.boxManager = boxManager;
  }

  setPlayer(player) {
    this.player = player;
  }

  _initObjectPools() {
    // 1. Bullet & Buckshot Decals Pool (128 items to support extended 7.0s persistence across high-RPM bursts)
    // Each mesh clones the base material for independent opacity fading
    const decalGeo = new THREE.PlaneGeometry(0.24, 0.24);
    const emberGeo = new THREE.PlaneGeometry(0.072, 0.072);
    this.decalPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(decalGeo, this.baseDecalMaterial.clone());
      mesh.name = 'BulletDecal';
      mesh.userData.age = 0;

      // Hot-metal cooling ember child
      const emberMesh = new THREE.Mesh(emberGeo, this.baseEmberMaterial.clone());
      emberMesh.name = 'EmberGlow';
      emberMesh.position.set(0, 0, 0.001);
      emberMesh.visible = false;
      mesh.add(emberMesh);
      mesh.userData.ember = emberMesh;

      this.scene.add(mesh);
      return mesh;
    }, 128);

    // 2. Ballistic Tracers Pool (48 items, fast-moving 150u/s golden streak bolts)
    // Tapered cylinder along Z: length 0.85m, front tip facing +Z, tail at origin (0, 0, 0)
    const tracerLength = 0.85;
    const tracerGeo = new THREE.CylinderGeometry(0.0018, 0.0042, tracerLength, 8);
    tracerGeo.translate(0, tracerLength / 2, 0); // Shift so tail is at Y = 0, tip at Y = +tracerLength
    tracerGeo.rotateX(Math.PI / 2); // Rotates tip (+Y) to +Z so front tip faces target on lookAt, tail at (0, 0, 0)
    this.tracerPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(tracerGeo, this.tracerMaterial);
      mesh.name = 'BulletTracer';
      mesh.frustumCulled = false;
      mesh._dir = new THREE.Vector3();
      mesh._speed = 150;
      mesh._distTraveled = 0;
      mesh._maxDist = 0;
      this.scene.add(mesh);
      return mesh;
    }, 48);

    // 3. Pooled Shiny Brass .50 AE Shell Casings (15 items)
    const casingGeo = new THREE.CylinderGeometry(0.0068, 0.0068, 0.032, 10);
    this.casingPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(casingGeo, this.casingMaterial);
      mesh.name = 'ShellCasing';
      mesh._velocity = new THREE.Vector3();
      mesh._rotVelocity = new THREE.Vector3();
      mesh._life = 0;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    }, 15);

    // 3a. Pooled 9mm Luger Brass Shell Casings (24 items)
    const casing9mmGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.019, 10);
    // 3a. Pooled 9mm Luger Brass Shell Casings (36 items for full-auto)
    this.casing9mmPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(casing9mmGeo, this.casingMaterial);
      mesh.name = 'ShellCasing9mm';
      mesh._velocity = new THREE.Vector3();
      mesh._rotVelocity = new THREE.Vector3();
      mesh._life = 0;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    }, 36);

    // 3b. Pooled Red 12-Gauge Shotgun Shells with Brass Base (15 items)
    const shellHullGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.042, 12);
    const shellBrassGeo = new THREE.CylinderGeometry(0.0098, 0.0098, 0.015, 12);
    this.shotgunShellPool = new ObjectPool(() => {
      const group = new THREE.Group();
      group.name = 'ShotgunShellCasing';
      const hull = new THREE.Mesh(shellHullGeo, this.shotgunHullMaterial);
      hull.position.y = 0.007;
      const brass = new THREE.Mesh(shellBrassGeo, this.casingMaterial);
      brass.position.y = -0.020;
      group.add(hull);
      group.add(brass);
      group._velocity = new THREE.Vector3();
      group._rotVelocity = new THREE.Vector3();
      group._life = 0;
      group.visible = false;
      this.scene.add(group);
      return group;
    }, 15);

    // 4. Pooled Hot Metal Impact Sparks (64 items)
    const sparkGeo = new THREE.BoxGeometry(0.016, 0.016, 0.016);
    this.sparkPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(sparkGeo, this.sparkMaterial);
      mesh.name = 'ImpactSpark';
      mesh._velocity = new THREE.Vector3();
      mesh._life = 0;
      mesh._maxLife = 0;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    }, 64);

    // 5. Pooled Cyan/White/Amber Electric Sparks & Glass Shards (32 items)
    const glassGeo = new THREE.BoxGeometry(0.014, 0.014, 0.014);
    this.glassSparkPool = new ObjectPool(() => {
      const mesh = new THREE.Mesh(glassGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }));
      mesh.name = 'MonitorGlassSpark';
      mesh._velocity = new THREE.Vector3();
      mesh._life = 0;
      mesh._maxLife = 0;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    }, 32);
  }

  update(delta) {
    // 1. Always update in-flight visual effects (tracers, casings, sparks, decals, light fade)
    this._updateVisualEffects(delta);

    // 2. Strict Game State Gate: block weapon inputs while in MENU, unlocked, or during 150ms arming cooldown
    const isArmed = this.gameState === 'PLAYING' &&
                    this.input.isLocked &&
                    document.pointerLockElement !== null &&
                    performance.now() >= this.armedAt;

    if (!isArmed) {
      this.wasMouseDown0 = true; // Prevents click-bleed
      if (!window.isViewmodelTunerOpen) {
        this.viewmodel.setADS(false);
      }
      return;
    }

    // 3. Advance fire timer
    if (this.fireTimer > 0) {
      this.fireTimer -= delta;
    }

    // 3b. Weapon Slot Switching (Key 1 = 9mm H&K USP, Key 2 = .50 AE Desert Eagle, Key 3 = Remington 870 Shotgun, Key 4 = H&K MP5)
    if (this.input.consumeKeyJustPressed('Digit1') || this.input.consumeKeyJustPressed('1')) {
      this.switchWeapon('hk_usp');
      return;
    }
    if (this.input.consumeKeyJustPressed('Digit2') || this.input.consumeKeyJustPressed('2')) {
      this.switchWeapon('pistol');
      return;
    }
    if (this.input.consumeKeyJustPressed('Digit3') || this.input.consumeKeyJustPressed('3')) {
      this.switchWeapon('shotgun');
      return;
    }
    if (this.input.consumeKeyJustPressed('Digit4') || this.input.consumeKeyJustPressed('4')) {
      this.switchWeapon('hk_mp5');
      return;
    }

    // 3c. Mouse Wheel Cycling
    if (typeof this.input.consumeWheelDelta === 'function') {
      const wheelDelta = this.input.consumeWheelDelta();
      if (wheelDelta !== 0) {
        const order = ['hk_usp', 'pistol', 'shotgun', 'hk_mp5'];
        const curIdx = order.indexOf(this.currentWeapon);
        if (curIdx !== -1) {
          const nextIdx = wheelDelta > 0
            ? (curIdx + 1) % order.length
            : (curIdx - 1 + order.length) % order.length;
          this.switchWeapon(order[nextIdx]);
          return;
        }
      }
    }

    // 4. Manual KeyR Reload check
    if (this.input.consumeKeyJustPressed('KeyR') || this.input.consumeKeyJustPressed('r') || this.input.consumeKeyJustPressed('Keyr')) {
      if (this.currentAmmo < this.maxAmmo && !this.isReloading) {
        this.startReload();
      }
    }

    // 5. Handle ADS (Right Mouse Button) - Interrupted back to hip-fire during reload
    const isRightDown = this.input.isMouseDown(2) && !this.isReloading;
    this.viewmodel.setADS(isRightDown);

    // Fade crosshair during ADS for authentic iron sights alignment (dirty checked)
    if (!this.crosshairEl) {
      this.crosshairEl = document.getElementById('crosshair-container');
      if (this.crosshairEl) this.crosshairEl.style.transition = 'opacity 0.12s ease-out';
    }
    if (this.crosshairEl && this._lastCrosshairHidden !== isRightDown) {
      this._lastCrosshairHidden = isRightDown;
      this.crosshairEl.style.opacity = isRightDown ? '0' : '1';
    }

    // Smooth camera FOV zoom during ADS (only recalculate matrix when FOV changes)
    const targetFOV = isRightDown ? 60 : 75;
    if (Math.abs(targetFOV - this.camera.fov) > 0.05) {
      this.camera.fov += (targetFOV - this.camera.fov) * Math.min(delta * 14.0, 1.0);
      this.camera.updateProjectionMatrix();
    }

    // 6. Trigger handling: Full-Auto for MP5, Semi-Auto for USP, Pistol, Shotgun
    const isLeftDown = this.input.isMouseDown(0);
    const justClicked = isLeftDown && !this.wasMouseDown0;
    this.wasMouseDown0 = isLeftDown;

    const isFullAuto = this.currentWeapon === 'hk_mp5';
    const shouldFire = isFullAuto
      ? (isLeftDown && this.fireTimer <= 0 && !this.isReloading && (this.currentAmmo > 0 || justClicked))
      : (justClicked && this.fireTimer <= 0);

    if (shouldFire) {
      this.fire();
    }
  }

  _updateVisualEffects(delta) {
    // 1. Update Muzzle Flash Light (Warm firelight fadeout over 45ms, disable visible when off)
    if (this.flashDuration > 0) {
      this.flashDuration -= delta;
      if (this.flashDuration <= 0) {
        this.muzzleLight.intensity = 0;
      } else {
        this.muzzleLight.intensity = (this.flashDuration / 0.045) * 6.0;
      }
    }

    // 2. Update Active Tracers (140 units/sec ballistic bolt traveling from muzzle to hitPoint)
    this.tracerPool.forEachActive((tracer) => {
      const step = tracer._speed * delta;
      tracer._distTraveled += step;

      if (tracer._distTraveled >= tracer._maxDist) {
        tracer.visible = false;
        tracer.scale.set(1.0, 1.0, 1.0);
        this.tracerPool.release(tracer);
        return;
      }

      tracer.position.addScaledVector(tracer._dir, step);
    });

    // 3. Update Pooled Brass .50 AE Shell Casings (Gravity + tumbling + bounce)
    this.casingPool.forEachActive((casing) => {
      casing._life -= delta;
      if (casing._life <= 0) {
        casing.visible = false;
        this.casingPool.release(casing);
        return;
      }

      // Gravity acceleration
      casing._velocity.y -= 14.0 * delta;
      casing.position.addScaledVector(casing._velocity, delta);

      // Tumbling rotation
      casing.rotation.x += casing._rotVelocity.x * delta;
      casing.rotation.y += casing._rotVelocity.y * delta;
      casing.rotation.z += casing._rotVelocity.z * delta;

      // Floor bounce & friction
      if (casing.position.y < 0.015) {
        casing.position.y = 0.015;
        casing._velocity.y = -casing._velocity.y * 0.35;
        casing._velocity.x *= 0.65;
        casing._velocity.z *= 0.65;
        casing._rotVelocity.multiplyScalar(0.60);
      }
    });

    // 3a. Update Pooled Brass 9mm Shell Casings
    if (this.casing9mmPool) {
      this.casing9mmPool.forEachActive((casing) => {
        casing._life -= delta;
        if (casing._life <= 0) {
          casing.visible = false;
          this.casing9mmPool.release(casing);
          return;
        }

        casing._velocity.y -= 14.0 * delta;
        casing.position.addScaledVector(casing._velocity, delta);

        casing.rotation.x += casing._rotVelocity.x * delta;
        casing.rotation.y += casing._rotVelocity.y * delta;
        casing.rotation.z += casing._rotVelocity.z * delta;

        if (casing.position.y < 0.012) {
          casing.position.y = 0.012;
          casing._velocity.y = -casing._velocity.y * 0.38;
          casing._velocity.x *= 0.65;
          casing._velocity.z *= 0.65;
          casing._rotVelocity.multiplyScalar(0.62);
        }
      });
    }

    // 3b. Update Pooled Red 12-Gauge Shotgun Hulls (Gravity + tumbling + bounce)
    if (this.shotgunShellPool) {
      this.shotgunShellPool.forEachActive((shell) => {
        shell._life -= delta;
        if (shell._life <= 0) {
          shell.visible = false;
          this.shotgunShellPool.release(shell);
          return;
        }

        shell._velocity.y -= 14.0 * delta;
        shell.position.addScaledVector(shell._velocity, delta);

        shell.rotation.x += shell._rotVelocity.x * delta;
        shell.rotation.y += shell._rotVelocity.y * delta;
        shell.rotation.z += shell._rotVelocity.z * delta;

        if (shell.position.y < 0.018) {
          shell.position.y = 0.018;
          shell._velocity.y = -shell._velocity.y * 0.32;
          shell._velocity.x *= 0.65;
          shell._velocity.z *= 0.65;
          shell._rotVelocity.multiplyScalar(0.58);
        }
      });
    }

    // 4. Update Impact Sparks (Gravity-driven hot metal arcs)
    this.sparkPool.forEachActive((spark) => {
      spark._life -= delta;
      if (spark._life <= 0) {
        spark.visible = false;
        this.sparkPool.release(spark);
        return;
      }

      spark._velocity.y -= 16.0 * delta;
      spark.position.addScaledVector(spark._velocity, delta);

      const progress = Math.max(0, spark._life / spark._maxLife);
      spark.scale.set(progress, progress, progress);
    });

    // 5. Update Monitor Glass & Electric Sparks
    this.glassSparkPool.forEachActive((spark) => {
      spark._life -= delta;
      if (spark._life <= 0) {
        spark.visible = false;
        this.glassSparkPool.release(spark);
        return;
      }

      spark._velocity.y -= 15.0 * delta;
      spark.position.addScaledVector(spark._velocity, delta);

      const progress = Math.max(0, spark._life / spark._maxLife);
      spark.scale.set(progress, progress, progress);
    });

    // 6. Update Bullet Decals Lifecycle (5.0s hold + 2.0s smooth fade-out + 0.6s hot-metal cooling)
    this.decalPool.forEachActive((decal) => {
      decal.userData.age += delta;
      const age = decal.userData.age;

      // Hot-metal cooling: sizzles warm orange and cools down to neutral dark grey within 0.6s
      if (decal.userData.ember && decal.userData.ember.visible) {
        if (age < 0.6) {
          decal.userData.ember.material.opacity = 1.0 - (age / 0.6);
        } else {
          decal.userData.ember.visible = false;
        }
      }

      // 0.0s to 5.0s: Hold Phase (opacity 1.0 - doubled hold time)
      if (age < 5.0) {
        decal.material.opacity = 1.0;
      }
      // 5.0s to 7.0s: Fade Phase (linearly interpolate 1.0 down to 0.0 over 2.0s)
      else if (age < 7.0) {
        decal.material.opacity = 1.0 - (age - 5.0) / 2.0;
      }
      // At 7.0s: Recycle back to pool (zero draw calls wasted on invisible planes)
      else {
        decal.visible = false;
        if (decal.userData.ember) decal.userData.ember.visible = false;
        this.decalPool.release(decal);
      }
    });
  }

  fire() {
    if (this.gameState !== 'PLAYING' || !this.input.isLocked || document.pointerLockElement === null || performance.now() < this.armedAt) return;
    if (this.isReloading) return;

    // Dry-Fire on Empty Click (currentAmmo === 0)
    if (this.currentAmmo === 0) {
      this.fireTimer = 0.22; // Cadence for dead trigger click
      if (this.sound) {
        this.sound.playDryFireClick(this.currentWeapon);
      }
      if (this.viewmodel) {
        this.viewmodel.playDryFireTwitch();
      }
      if (this.hud) {
        this.hud.triggerDryFireWarning();
      }
      return;
    }

    this.currentAmmo--;
    this.weapons[this.currentWeapon].currentAmmo = this.currentAmmo;
    this.fireTimer = this.fireRate;

    const isShotgun = this.currentWeapon === 'shotgun';
    const isUSP = this.currentWeapon === 'hk_usp';
    const isMP5 = this.currentWeapon === 'hk_mp5';

    if (this.sound) {
      if (isMP5 && typeof this.sound.playMP5Gunshot === 'function') {
        this.sound.playMP5Gunshot();
      } else if (isUSP && typeof this.sound.play9mmGunshot === 'function') {
        this.sound.play9mmGunshot();
      } else if (isShotgun && typeof this.sound.playShotgunBlast === 'function') {
        this.sound.playShotgunBlast();
      } else {
        this.sound.playGunshot();
      }
    }
    if (this.viewmodel) {
      this.viewmodel.applyRecoil();
    }
    if (this.player && typeof this.player.applyCameraRecoil === 'function') {
      const pitchKick = isShotgun
        ? (this.viewmodel && this.viewmodel.isADS ? 0.036 : 0.062)
        : (isUSP
          ? (this.viewmodel && this.viewmodel.isADS ? 0.012 : 0.022)
          : (isMP5
            ? (this.viewmodel && this.viewmodel.isADS ? 0.007 : 0.013)
            : (this.viewmodel && this.viewmodel.isADS ? 0.022 : 0.042)));
      this.player.applyCameraRecoil(pitchKick);
    }

    this.viewmodel.getMuzzleWorldPosition(_muzzlePos);
    this.muzzleLight.position.copy(_muzzlePos);
    this.muzzleLight.intensity = isShotgun ? 8.5 : (isUSP ? 4.5 : (isMP5 ? 4.2 : 6.0));
    this.flashDuration = isMP5 ? 0.035 : 0.045;

    if (isShotgun) {
      // Multi-pellet 12-gauge buckshot spread hitscan
      this._performShotgunHitscan();

      // Automatic pump-action cycle after blast, ejecting the spent red 12-gauge hull on rearward stroke
      if (this.viewmodel && typeof this.viewmodel.startShotgunPumpAnimation === 'function') {
        this.viewmodel.startShotgunPumpAnimation({
          onEjectShell: () => this._ejectShellCasing('shotgun'),
        });
      }

      if (this.currentAmmo === 0 && this.hud) {
        this.hud.setEmptyState(true);
      }
    } else {
      this._ejectShellCasing(this.currentWeapon);
      this._performHitscan();

      if (this.currentAmmo === 0) {
        if (this.currentWeapon === 'hk_usp' || this.currentWeapon === 'pistol') {
          this.isSlideLocked = true;
          this.weapons[this.currentWeapon].isSlideLocked = true;
          if (this.viewmodel) {
            this.viewmodel.setSlideLocked(true);
          }
          if (this.sound) {
            this.sound.playSlideCatchRing();
          }
        }
        if (this.hud) {
          this.hud.setEmptyState(true);
        }
      }
    }

    // Update HUD ammo readout & cartridge/shotshell pips
    if (this.hud) {
      this.hud.updateAmmo(this.currentAmmo, this.maxAmmo);
    }
  }

  _ejectShellCasing(weaponType = 'pistol') {
    let ejectPos = _scratchVec1;
    if (this.viewmodel && typeof this.viewmodel.getEjectionWorldPosition === 'function') {
      ejectPos = this.viewmodel.getEjectionWorldPosition(_scratchVec1);
    } else {
      ejectPos.copy(this.camera.position);
    }

    let pool = this.casingPool;
    if (weaponType === 'shotgun' && this.shotgunShellPool) {
      pool = this.shotgunShellPool;
    } else if ((weaponType === 'hk_usp' || weaponType === 'hk_mp5') && this.casing9mmPool) {
      pool = this.casing9mmPool;
    }
    const casing = pool.acquire();
    casing.visible = true;
    casing.position.copy(ejectPos);
    casing._life = 1.25; // 1.25s active life

    // Calculate camera space orientation vectors
    _camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    _camFwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);

    // Eject to top-right with realistic upward/rightward velocity & slight backward push
    casing._velocity.copy(_camRight).multiplyScalar(1.9 + Math.random() * 0.7)
      .addScaledVector(_camUp, 2.2 + Math.random() * 0.8)
      .addScaledVector(_camFwd, -0.3 + (Math.random() - 0.5) * 0.4);

    // Tumbling spin
    casing._rotVelocity.set(
      18 + Math.random() * 20,
      12 + Math.random() * 25,
      15 + Math.random() * 20
    );

    casing.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
  }

  _getGlassMeshes() {
    if (this.glassMeshes && this.glassMeshes.length > 0) {
      return this.glassMeshes;
    }
    if (!this.scene) return [];
    const meshes = [];
    const vestGlass = this.scene.getObjectByName('DC_VestibuleGlass');
    if (vestGlass) meshes.push(vestGlass);
    const podGlass = this.scene.getObjectByName('DC_ServerPodGlass');
    if (podGlass) meshes.push(podGlass);
    if (meshes.length > 0) {
      this.glassMeshes = meshes;
      this.glassMesh = vestGlass || meshes[0];
    }
    return meshes;
  }

  /**
   * 12-Gauge 00-Buckshot Multi-Pellet Hitscan (8 Pellets in a Conical Choke Pattern).
   * Spawns individual pellet tracers, smaller buckshot pellet decals in a realistic cluster,
   * and preserves destructible monitor screen behavior without duplicate audio spam.
   */
  _performShotgunHitscan() {
    _rayOrigin.copy(this.camera.position);
    this.camera.getWorldDirection(_pelletForward);
    _pelletRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _pelletUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);

    this.viewmodel.getMuzzleWorldPosition(_muzzlePos);

    const numPellets = 8;
    // Tighter choked spread when aiming down the receiver groove & front bead sight
    const maxSpread = this.viewmodel.isADS ? 0.038 : 0.068;
    const baseAngleOffset = Math.random() * Math.PI * 2;
    let playedGlassTickThisBlast = false;

    for (let i = 0; i < numPellets; i++) {
      _rayDirection.copy(_pelletForward);

      if (i === 0) {
        // Center core pellet with tiny jitter
        const r = maxSpread * 0.18 * Math.random();
        const a = Math.random() * Math.PI * 2;
        _rayDirection.addScaledVector(_pelletRight, Math.cos(a) * r);
        _rayDirection.addScaledVector(_pelletUp, Math.sin(a) * r);
      } else {
        // 7 outer buckshot ring pellets distributed evenly around the cone with organic radial variance
        const ringIdx = i - 1;
        const angle = baseAngleOffset + (ringIdx / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const radius = maxSpread * (0.42 + Math.random() * 0.58);
        _rayDirection.addScaledVector(_pelletRight, Math.cos(angle) * radius);
        _rayDirection.addScaledVector(_pelletUp, Math.sin(angle) * radius);
      }
      _rayDirection.normalize();

      _raycaster.set(_rayOrigin, _rayDirection);
      _raycaster.far = 100;

      let closestHit = null;
      let hitObject = null;
      let hitScreenMesh = null;

      if (this.boxManager && typeof this.boxManager.raycast === 'function') {
        const boxHit = this.boxManager.raycast(_raycaster);
        if (boxHit) {
          closestHit = boxHit;
          hitObject = 'box';
        }
      }

      if (this.monitorScreens && this.monitorScreens.length > 0) {
        const screenHits = _raycaster.intersectObjects(this.monitorScreens, false);
        if (screenHits.length > 0) {
          if (!closestHit || screenHits[0].distance < closestHit.distance) {
            closestHit = screenHits[0];
            hitObject = 'monitorScreen';
            hitScreenMesh = screenHits[0].object;
          }
        }
      }

      const glassMeshes = this._getGlassMeshes();
      if (glassMeshes.length > 0) {
        const glassHits = _raycaster.intersectObjects(glassMeshes, false);
        if (glassHits.length > 0) {
          if (!closestHit || glassHits[0].distance < closestHit.distance) {
            closestHit = glassHits[0];
            hitObject = 'glass';
            hitScreenMesh = null;
          }
        }
      }

      if (this.colliderMesh) {
        const hits = _raycaster.intersectObject(this.colliderMesh, false);
        if (hits.length > 0) {
          if (!closestHit || hits[0].distance < closestHit.distance) {
            closestHit = hits[0];
            hitObject = 'arena';
            hitScreenMesh = null;
          }
        }
      }

      if (closestHit) {
        _hitPoint.copy(closestHit.point);
        const normal = closestHit.face
          ? _scratchVec2.copy(closestHit.face.normal).transformDirection(closestHit.object.matrixWorld).normalize()
          : (closestHit.normal ? _scratchVec2.copy(closestHit.normal).normalize() : _scratchVec2.set(0, 0, -1));
        if (normal.dot(_raycaster.ray.direction) > 0) {
          normal.negate();
        }

        this._spawnTracer(_muzzlePos, _hitPoint, true);

        if (hitObject === 'monitorScreen' && hitScreenMesh) {
          const isBroken = !!hitScreenMesh.userData.isBroken;
          if (!isBroken) {
            hitScreenMesh.userData.isBroken = true;
            if (hitScreenMesh.userData.brokenMaterial) {
              hitScreenMesh.material = hitScreenMesh.userData.brokenMaterial;
            }
            if (hitScreenMesh.userData.brokenGeometry) {
              hitScreenMesh.geometry = hitScreenMesh.userData.brokenGeometry;
            }
            this._spawnMonitorSparks(_hitPoint, normal, true);
            if (this.sound && typeof this.sound.playMonitorShatter === 'function') {
              this.sound.playMonitorShatter(closestHit.distance);
            }
          } else {
            this._spawnMonitorSparks(_hitPoint, normal, false, 2);
            if (!playedGlassTickThisBlast && this.sound) {
              playedGlassTickThisBlast = true;
              if (typeof this.sound.playMonitorHit === 'function') {
                this.sound.playMonitorHit(closestHit.distance);
              } else if (typeof this.sound.playGlassTick === 'function') {
                this.sound.playGlassTick(closestHit.distance);
              }
            }
          }
        } else if (hitObject === 'glass') {
          this._spawnMonitorSparks(_hitPoint, normal, false, 3);
          this._spawnDecal(_hitPoint, normal, true, true);
          if (!playedGlassTickThisBlast && this.sound) {
            playedGlassTickThisBlast = true;
            if (typeof this.sound.playGlassImpact === 'function') {
              this.sound.playGlassImpact(closestHit.distance);
            } else if (typeof this.sound.playGlassTick === 'function') {
              this.sound.playGlassTick(closestHit.distance);
            }
          }
        } else if (hitObject === 'arena') {
          this._spawnImpactSparks(_hitPoint, normal, 2);
          this._spawnDecal(_hitPoint, normal, true, false, 'shotgun');
        } else if (hitObject === 'box' && this.boxManager) {
          this._spawnImpactSparks(_hitPoint, normal, 2);
          this.boxManager.onHit(closestHit);
        }
      } else {
        _hitPoint.copy(_rayOrigin).addScaledVector(_rayDirection, 100);
        this._spawnTracer(_muzzlePos, _hitPoint, true);
      }
    }
  }

  _performHitscan() {
    // Ray origin is the camera position
    _rayOrigin.copy(this.camera.position);

    // Ray direction: camera world forward + subtle spread if not in ADS
    this.camera.getWorldDirection(_rayDirection);
    if (!this.viewmodel.isADS) {
      const spread = this.currentWeapon === 'hk_mp5' ? 0.012 : 0.008;
      _rayDirection.x += (Math.random() - 0.5) * spread;
      _rayDirection.y += (Math.random() - 0.5) * spread;
      _rayDirection.z += (Math.random() - 0.5) * spread;
      _rayDirection.normalize();
    }

    _raycaster.set(_rayOrigin, _rayDirection);
    _raycaster.far = 100;

    let closestHit = null;
    let hitObject = null;
    let hitScreenMesh = null;

    if (this.boxManager && typeof this.boxManager.raycast === 'function') {
      const boxHit = this.boxManager.raycast(_raycaster);
      if (boxHit) {
        closestHit = boxHit;
        hitObject = 'box';
      }
    }

    // Raycast against individual destructible monitor screens
    if (this.monitorScreens && this.monitorScreens.length > 0) {
      const screenHits = _raycaster.intersectObjects(this.monitorScreens, false);
      if (screenHits.length > 0) {
        if (!closestHit || screenHits[0].distance < closestHit.distance) {
          closestHit = screenHits[0];
          hitObject = 'monitorScreen';
          hitScreenMesh = screenHits[0].object;
        }
      }
    }

    // Raycast against architectural glass (vestibule partition/door glass & server containment pod glass)
    const glassMeshes = this._getGlassMeshes();
    if (glassMeshes.length > 0) {
      const glassHits = _raycaster.intersectObjects(glassMeshes, false);
      if (glassHits.length > 0) {
        if (!closestHit || glassHits[0].distance < closestHit.distance) {
          closestHit = glassHits[0];
          hitObject = 'glass';
          hitScreenMesh = null;
        }
      }
    }

    // Raycast against merged BVH warehouse geometry
    if (this.colliderMesh) {
      const hits = _raycaster.intersectObject(this.colliderMesh, false);
      if (hits.length > 0) {
        if (!closestHit || hits[0].distance < closestHit.distance) {
          closestHit = hits[0];
          hitObject = 'arena';
          hitScreenMesh = null;
        }
      }
    }

    // EXACT world-space muzzle position from the dedicated barrel socket
    this.viewmodel.getMuzzleWorldPosition(_muzzlePos);

    if (closestHit) {
      _hitPoint.copy(closestHit.point);
      const normal = closestHit.face
        ? _scratchVec2.copy(closestHit.face.normal).transformDirection(closestHit.object.matrixWorld).normalize()
        : (closestHit.normal ? _scratchVec2.copy(closestHit.normal).normalize() : _scratchVec2.set(0, 0, -1));
      if (normal.dot(_raycaster.ray.direction) > 0) {
        normal.negate();
      }

      // Spawn ballistic bolt from muzzle socket to hit point
      this._spawnTracer(_muzzlePos, _hitPoint);

      if (hitObject === 'monitorScreen' && hitScreenMesh) {
        const isBroken = !!hitScreenMesh.userData.isBroken;
        if (!isBroken) {
          hitScreenMesh.userData.isBroken = true;
          if (hitScreenMesh.userData.brokenMaterial) {
            hitScreenMesh.material = hitScreenMesh.userData.brokenMaterial;
          }
          if (hitScreenMesh.userData.brokenGeometry) {
            hitScreenMesh.geometry = hitScreenMesh.userData.brokenGeometry;
          }
          this._spawnMonitorSparks(_hitPoint, normal, true);
          if (this.sound && typeof this.sound.playMonitorShatter === 'function') {
            this.sound.playMonitorShatter(closestHit.distance);
          }
        } else {
          this._spawnMonitorSparks(_hitPoint, normal, false);
          if (this.sound) {
            if (typeof this.sound.playMonitorHit === 'function') {
              this.sound.playMonitorHit(closestHit.distance);
            } else if (typeof this.sound.playGlassTick === 'function') {
              this.sound.playGlassTick(closestHit.distance);
            }
          }
        }
        // NOTE: Wall bullet decals are suppressed on monitor screens!
      } else if (hitObject === 'glass') {
        this._spawnMonitorSparks(_hitPoint, normal, false, 8);
        this._spawnDecal(_hitPoint, normal, false, true);
        if (this.sound) {
          if (typeof this.sound.playGlassImpact === 'function') {
            this.sound.playGlassImpact(closestHit.distance);
          } else if (typeof this.sound.playGlassTick === 'function') {
            this.sound.playGlassTick(closestHit.distance);
          }
        }
      } else if (hitObject === 'arena') {
        // Burst 6-8 hot metal impact sparks arcing with gravity
        this._spawnImpactSparks(_hitPoint, normal);
        this._spawnDecal(_hitPoint, normal, false, false, this.currentWeapon);
      } else if (hitObject === 'box' && this.boxManager) {
        this._spawnImpactSparks(_hitPoint, normal);
        this.boxManager.onHit(closestHit);
      }
    } else {
      // Whiff into distance (100 units forward along camera ray)
      _hitPoint.copy(_rayOrigin).addScaledVector(_rayDirection, 100);
      this._spawnTracer(_muzzlePos, _hitPoint);
    }
  }

  _spawnMonitorSparks(hitPoint, normal, isFirstHit, overrideCount = null) {
    const count = overrideCount !== null ? overrideCount : (isFirstHit ? 14 : 6);
    const sparkColors = [0x00e5ff, 0xffffff, 0x38bdf8, 0xdbeafe];
    for (let i = 0; i < count; i++) {
      const spark = this.glassSparkPool.acquire();
      spark.visible = true;
      spark.position.copy(hitPoint);
      spark._life = 0.20 + Math.random() * 0.18;
      spark._maxLife = spark._life;
      spark.material.color.setHex(sparkColors[Math.floor(Math.random() * sparkColors.length)]);

      _scratchVec1.copy(normal).multiplyScalar(2.2 + Math.random() * 3.5);
      _scratchVec1.x += (Math.random() - 0.5) * 4.2;
      _scratchVec1.y += Math.random() * 3.0;
      _scratchVec1.z += (Math.random() - 0.5) * 4.2;
      spark._velocity.copy(_scratchVec1);
    }
  }

  _spawnImpactSparks(hitPoint, normal, overrideCount = null) {
    const count = overrideCount !== null ? overrideCount : (6 + Math.floor(Math.random() * 3));
    const isCeiling = normal.y < -0.5;
    for (let i = 0; i < count; i++) {
      const spark = this.sparkPool.acquire();
      spark.visible = true;
      spark.position.copy(hitPoint).addScaledVector(normal, 0.012);
      spark._life = 0.22 + Math.random() * 0.16;
      spark._maxLife = spark._life;

      // Arc outward along normal + hemisphere scatter (shower downward cleanly on ceiling hits)
      _scratchVec1.copy(normal).multiplyScalar(2.0 + Math.random() * 3.0);
      _scratchVec1.x += (Math.random() - 0.5) * 4.0;
      _scratchVec1.y += isCeiling ? (-Math.random() * 1.4) : (Math.random() * 2.8);
      _scratchVec1.z += (Math.random() - 0.5) * 4.0;
      spark._velocity.copy(_scratchVec1);
    }
  }

  _spawnTracer(startPoint, endPoint, isPellet = false) {
    const tracer = this.tracerPool.acquire();

    // Direction vector from barrel muzzle socket to hit point
    _tracerDir.subVectors(endPoint, startPoint).normalize();
    const totalDist = startPoint.distanceTo(endPoint);

    // Spawn 0.04m forward along shot direction so tracer tail sits cleanly in front of the barrel crown
    _tracerSpawn.copy(startPoint).addScaledVector(_tracerDir, 0.04);

    tracer.position.copy(_tracerSpawn);
    tracer.lookAt(endPoint);

    const thickness = isPellet ? 0.65 : 1.0;
    const baseLength = 0.85;
    if (totalDist < baseLength) {
      tracer.scale.set(thickness, thickness, Math.max(0.1, totalDist / baseLength));
    } else {
      tracer.scale.set(thickness, thickness, isPellet ? 0.75 : 1.0);
    }

    tracer._dir.copy(_tracerDir);
    tracer._speed = 150; // 150 units/sec rapid ballistic speed
    tracer._distTraveled = 0.04;
    tracer._maxDist = totalDist;
    tracer.visible = true;
  }

  _spawnDecal(hitPoint, surfaceNormal, isPellet = false, isGlass = false, weaponId = this.currentWeapon) {
    const decal = this.decalPool.acquire();

    // Reset age and visual state
    decal.userData.age = 0;
    decal.material.opacity = 1.0;

    const activeWeapon = isPellet ? 'shotgun' : (weaponId || this.currentWeapon);

    let targetMap = this.glassDecalTexture;
    if (!isGlass) {
      const variants = activeWeapon === 'pistol' ? this.heavyDecalTextures : this.decalTextures;
      if (variants && variants.length > 0) {
        let nextIdx = Math.floor(Math.random() * variants.length);
        if (variants.length > 1 && nextIdx === this._lastDecalVariantIdx) {
          nextIdx = (nextIdx + 1 + Math.floor(Math.random() * (variants.length - 1))) % variants.length;
        }
        this._lastDecalVariantIdx = nextIdx;
        targetMap = variants[nextIdx];
      } else {
        targetMap = this.decalTexture;
      }
    }

    if (decal.material.map !== targetMap) {
      decal.material.map = targetMap;
      decal.material.needsUpdate = true;
    }
    decal.renderOrder = isGlass ? 3 : 1;

    // Sizzling hot-metal ember begins active on solid surfaces, suppressed on glass
    if (decal.userData.ember) {
      decal.userData.ember.visible = !isGlass;
      decal.userData.ember.material.opacity = isGlass ? 0.0 : 1.0;
    }

    // Ensure surfaceNormal is unit length and position decal slightly offset toward shooter to avoid z-fighting
    _scratchVec3.copy(surfaceNormal).normalize();
    decal.position.copy(hitPoint).addScaledVector(_scratchVec3, isGlass ? 0.004 : 0.005);

    // Orient decal via unit-vector quaternion alignment (prevents lookAt() collinearity on flat ceilings & floors)
    decal.quaternion.setFromUnitVectors(_decalUnitZ, _scratchVec3);

    // Apply random Z-axis roll (0 to Math.PI * 2) around surface normal
    decal.rotateZ(Math.random() * Math.PI * 2);

    if (isGlass) {
      // Glass spiderweb fractures kept 100% untouched
      const s = isPellet ? (0.58 + Math.random() * 0.16) : (1.08 + Math.random() * 0.30);
      decal.scale.set(s, s, 1.0);
    } else {
      // Caliber-specific world-space quad size (in meters) with ±8% random scale jitter
      // Base decal PlaneGeometry is 0.24m x 0.24m
      let baseQuadMeters;
      if (isPellet || activeWeapon === 'shotgun') {
        // 12 Gauge Buckshot ('shotgun' / Remington 870): ~0.032m to 0.042m per pellet
        baseQuadMeters = 0.037;
      } else if (activeWeapon === 'pistol') {
        // .50 AE ('pistol' / Desert Eagle): ~0.105m to 0.125m total quad size (~1.9x 9mm)
        baseQuadMeters = 0.115;
      } else {
        // 9mm ('hk_usp' and 'hk_mp5'): ~0.055m to 0.065m total quad size
        baseQuadMeters = 0.060;
      }

      const jitter = 1.0 + (Math.random() * 2.0 - 1.0) * 0.08;
      const worldQuadSize = baseQuadMeters * jitter;
      const s = worldQuadSize / 0.24;
      decal.scale.set(s, s, 1.0);
    }
  }

  reset() {
    TWEEN.removeAll();

    this.currentWeapon = 'hk_usp';
    this.weapons.hk_usp.currentAmmo = 12;
    this.weapons.hk_usp.isSlideLocked = false;
    this.weapons.pistol.currentAmmo = 7;
    this.weapons.pistol.isSlideLocked = false;
    this.weapons.shotgun.currentAmmo = 6;
    this.weapons.shotgun.isSlideLocked = false;
    this.weapons.hk_mp5.currentAmmo = 30;
    this.weapons.hk_mp5.isSlideLocked = false;

    this.maxAmmo = 12;
    this.currentAmmo = 12;
    this.fireRate = 0.18;
    this.isReloading = false;
    this.isSlideLocked = false;
    this.fireTimer = 0;
    this.wasMouseDown0 = true;
    this.flashDuration = 0;

    if (this.muzzleLight) {
      this.muzzleLight.intensity = 0;
    }

    if (this.camera && this.camera.fov !== 75) {
      this.camera.fov = 75;
      this.camera.updateProjectionMatrix();
    }

    if (this.crosshairEl) {
      this._lastCrosshairHidden = false;
      this.crosshairEl.style.opacity = '1';
    }

    // Clear and reset all active bullet impact decals
    this.decalPool.forEachActive((decal) => {
      decal.visible = false;
      decal.userData.age = 0;
      if (decal.userData.ember) {
        decal.userData.ember.visible = false;
        decal.userData.ember.material.opacity = 1.0;
      }
      decal.material.opacity = 1.0;
    });
    this.decalPool.releaseAll();

    // Clear and reset all active bullet tracers
    this.tracerPool.forEachActive((tracer) => {
      tracer.visible = false;
      tracer.scale.set(1.0, 1.0, 1.0);
    });
    this.tracerPool.releaseAll();

    // Clear and reset all ejected brass shell casings
    this.casingPool.forEachActive((casing) => {
      casing.visible = false;
    });
    this.casingPool.releaseAll();

    if (this.casing9mmPool) {
      this.casing9mmPool.forEachActive((casing) => {
        casing.visible = false;
      });
      this.casing9mmPool.releaseAll();
    }

    if (this.shotgunShellPool) {
      this.shotgunShellPool.forEachActive((shell) => {
        shell.visible = false;
      });
      this.shotgunShellPool.releaseAll();
    }

    // Clear and reset all impact sparks
    this.sparkPool.forEachActive((spark) => {
      spark.visible = false;
    });
    this.sparkPool.releaseAll();

    // Clear and reset all glass/electric sparks
    if (this.glassSparkPool) {
      this.glassSparkPool.forEachActive((spark) => {
        spark.visible = false;
      });
      this.glassSparkPool.releaseAll();
    }

    // Reset viewmodel
    if (this.viewmodel && typeof this.viewmodel.reset === 'function') {
      this.viewmodel.reset();
    }

    // Reset HUD
    if (this.hud && typeof this.hud.reset === 'function') {
      this.hud.reset();
    }
  }

  /**
   * Pre-uploads weapon effect textures and pre-compiles effect shaders (decals, embers,
   * tracers, shell casings, sparks, and muzzle flash point light).
   */
  warmUpGPU(renderer, camera) {
    if (!renderer) return;

    // 1. Upload effect textures (including all procedural wall decal variations) to GPU
    if (this.decalTextures && this.decalTextures.length > 0) {
      for (const tex of this.decalTextures) {
        if (tex) {
          try { renderer.initTexture(tex); } catch (e) {}
        }
      }
    }
    if (this.heavyDecalTextures && this.heavyDecalTextures.length > 0) {
      for (const tex of this.heavyDecalTextures) {
        if (tex) {
          try { renderer.initTexture(tex); } catch (e) {}
        }
      }
    }
    if (this.decalTexture) {
      try { renderer.initTexture(this.decalTexture); } catch (e) {}
    }
    if (this.glassDecalTexture) {
      try { renderer.initTexture(this.glassDecalTexture); } catch (e) {}
    }
    if (this.emberTexture) {
      try { renderer.initTexture(this.emberTexture); } catch (e) {}
    }

    // 2. Temporarily acquire 1 sample from each effect pool and make visible for shader compilation
    const samples = [];
    const pools = [
      this.decalPool,
      this.tracerPool,
      this.casingPool,
      this.casing9mmPool,
      this.shotgunShellPool,
      this.sparkPool,
      this.glassSparkPool,
    ];

    for (const pool of pools) {
      if (pool && typeof pool.acquire === 'function') {
        const item = pool.acquire();
        if (item) {
          item.visible = true;
          samples.push({ pool, item });
        }
      }
    }

    // 3. Temporarily set muzzle light intensity > 0 to guarantee shaders with active point lights compile
    const prevIntensity = this.muzzleLight ? this.muzzleLight.intensity : 0;
    if (this.muzzleLight) {
      this.muzzleLight.intensity = 1.0;
    }

    // 4. Compile shaders with scene & camera
    if (this.scene && camera) {
      try {
        renderer.compile(this.scene, camera);
        // Force 1 render frame to warm the GPU pipeline
        renderer.render(this.scene, camera);
      } catch (err) {
        console.warn('[WeaponSystem] warmUpGPU compile warning:', err);
      }
    }

    // 5. Restore muzzle light intensity and release pool items
    if (this.muzzleLight) {
      this.muzzleLight.intensity = prevIntensity;
    }

    for (const { pool, item } of samples) {
      item.visible = false;
      pool.release(item);
    }
  }
}
