import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// Attach BVH extensions to Three.js prototypes
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/**
 * Creates a custom PlaneGeometry whose front face points towards -Z (the player),
 * with correct unmirrored UV mapping: (X = -hw) -> U = uMin, (X = +hw) -> U = uMax.
 */
function createPlaneFacingPlayer(w, h, uMin = 0, vMin = 0, uMax = 1, vMax = 1) {
  const geo = new THREE.BufferGeometry();
  const hw = w / 2;
  const hh = h / 2;

  // Vertices facing -Z directly toward player
  const positions = new Float32Array([
    -hw,  hh, 0, // 0: Top-Left
     hw,  hh, 0, // 1: Top-Right
    -hw, -hh, 0, // 2: Bottom-Left
     hw, -hh, 0  // 3: Bottom-Right
  ]);

  const normals = new Float32Array([
    0, 0, -1,
    0, 0, -1,
    0, 0, -1,
    0, 0, -1
  ]);

  const uvs = new Float32Array([
    uMax, vMax, // 0: Top-Left (unmirrored U mapping)
    uMin, vMax, // 1: Top-Right
    uMax, vMin, // 2: Bottom-Left
    uMin, vMin  // 3: Bottom-Right
  ]);

  // Winding order for front-face pointing toward -Z
  const indices = [0, 1, 2, 2, 1, 3];

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Creates a custom PlaneGeometry whose front face points towards +Z (rear of monitor),
 * with correct unmirrored UV mapping for rear-facing panels:
 * (X = +hw) -> U = uMin (observer's left), (X = -hw) -> U = uMax (observer's right).
 */
function createPlaneFacingRear(w, h, uMin = 0, vMin = 0, uMax = 1, vMax = 1) {
  const geo = new THREE.BufferGeometry();
  const hw = w / 2;
  const hh = h / 2;

  // Vertices facing +Z away from screen (toward rear observer)
  // Observer looking down -Z: observer's left is -X, right is +X
  const positions = new Float32Array([
    -hw,  hh, 0, // 0: Observer Top-Left (-X, +Y)
     hw,  hh, 0, // 1: Observer Top-Right (+X, +Y)
    -hw, -hh, 0, // 2: Observer Bottom-Left (-X, -Y)
     hw, -hh, 0  // 3: Observer Bottom-Right (+X, -Y)
  ]);

  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1
  ]);

  const uvs = new Float32Array([
    uMin, vMax, // 0: Top-Left
    uMax, vMax, // 1: Top-Right
    uMin, vMin, // 2: Bottom-Left
    uMax, vMin  // 3: Bottom-Right
  ]);

  const indices = [0, 2, 1, 2, 3, 1];

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Procedural Clean Solid Anti-Static Tile Textures for the Main Room Lower Floor (1024x1024).
 * Modular 2x2 grid of clean, uniform solid anthracite anti-static access tiles (each 512x512px).
 * - Balanced architectural anthracite slate palette (#252933 base with #13171d recessed gasket seams).
 * - 4 subtle metallic corner lock-screw / tile-lifter dimples (#3b4252) inset near corners.
 * - Directional micro-speckle / brushed anti-static texture across every tile.
 * - 100% free of ventilation grilles or micro-perforations for a clean, grounded lower floor arena.
 * - Scaled with repeat.set(10, 11.75) for exact 1.0m x 1.0m physical tile squares across W=20.0m x L=23.5m.
 * - Accompanied by a matched 1024x1024 bumpMap for realistic normal depth under overhead lights.
 */
function createSolidFloorTextures() {
  const width = 1024;
  const height = 1024;

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const diffCtx = diffCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bumpCtx = bumpCanvas.getContext('2d');

  // Base tile fill - balanced architectural dark slate anthracite #252933
  diffCtx.fillStyle = '#252933';
  diffCtx.fillRect(0, 0, width, height);

  // Bump neutral gray 128
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, width, height);

  // Subtle directional micro-speckle / brushed anti-static texture
  const imgData = diffCtx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const bumpImgData = bumpCtx.getImageData(0, 0, width, height);
  const bumpData = bumpImgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 8;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));

    const bNoise = (Math.random() - 0.5) * 5;
    bumpData[i] = Math.min(255, Math.max(0, bumpData[i] + bNoise));
    bumpData[i + 1] = bumpData[i];
    bumpData[i + 2] = bumpData[i];
  }
  diffCtx.putImageData(imgData, 0, 0);
  bumpCtx.putImageData(bumpImgData, 0, 0);

  // 2x2 modular tile quadrants (all 4 tiles are clean, uniform solid tiles!)
  const quadrants = [
    { x: 0, y: 0 },
    { x: 512, y: 0 },
    { x: 0, y: 512 },
    { x: 512, y: 512 },
  ];

  for (const q of quadrants) {
    const qx = q.x;
    const qy = q.y;
    const qw = 512;
    const qh = 512;

    // Crisp dark rubberized gasket seam around perimeter (#13171d)
    diffCtx.strokeStyle = '#13171d';
    diffCtx.lineWidth = 4;
    diffCtx.strokeRect(qx + 2, qy + 2, qw - 4, qh - 4);

    bumpCtx.strokeStyle = '#181818';
    bumpCtx.lineWidth = 5;
    bumpCtx.strokeRect(qx + 2, qy + 2, qw - 4, qh - 4);

    // Subtle bevel edge highlight inside gasket
    diffCtx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    diffCtx.lineWidth = 1.5;
    diffCtx.beginPath();
    diffCtx.moveTo(qx + 4, qy + qh - 4);
    diffCtx.lineTo(qx + 4, qy + 4);
    diffCtx.lineTo(qx + qw - 4, qy + 4);
    diffCtx.stroke();

    bumpCtx.strokeStyle = '#9a9a9a';
    bumpCtx.lineWidth = 1.5;
    bumpCtx.beginPath();
    bumpCtx.moveTo(qx + 4, qy + qh - 4);
    bumpCtx.lineTo(qx + 4, qy + 4);
    bumpCtx.lineTo(qx + qw - 4, qy + 4);
    bumpCtx.stroke();

    // 4 Corner metallic lock-screw / tile-lifter dimples (#3b4252)
    const screwOffsets = [
      [24, 24],
      [qw - 24, 24],
      [24, qh - 24],
      [qw - 24, qh - 24]
    ];

    for (const [sx, sy] of screwOffsets) {
      const cx = qx + sx;
      const cy = qy + sy;

      // Recessed outer gasket ring
      diffCtx.fillStyle = '#13171d';
      diffCtx.beginPath();
      diffCtx.arc(cx, cy, 7, 0, Math.PI * 2);
      diffCtx.fill();

      bumpCtx.fillStyle = '#141414';
      bumpCtx.beginPath();
      bumpCtx.arc(cx, cy, 7, 0, Math.PI * 2);
      bumpCtx.fill();

      // Metallic screw head
      diffCtx.fillStyle = '#3b4252';
      diffCtx.beginPath();
      diffCtx.arc(cx, cy, 5, 0, Math.PI * 2);
      diffCtx.fill();

      bumpCtx.fillStyle = '#9c9c9c';
      bumpCtx.beginPath();
      bumpCtx.arc(cx, cy, 5, 0, Math.PI * 2);
      bumpCtx.fill();

      // Specular highlight rim
      diffCtx.fillStyle = '#657187';
      diffCtx.beginPath();
      diffCtx.arc(cx - 1.2, cy - 1.2, 2.0, 0, Math.PI * 2);
      diffCtx.fill();

      // Dark drive socket (hex/torx)
      diffCtx.fillStyle = '#181c24';
      diffCtx.beginPath();
      diffCtx.arc(cx, cy, 1.8, 0, Math.PI * 2);
      diffCtx.fill();

      bumpCtx.fillStyle = '#000000';
      bumpCtx.beginPath();
      bumpCtx.arc(cx, cy, 2.2, 0, Math.PI * 2);
      bumpCtx.fill();
    }
  }

  // UV repeat set for exact 1.0m x 1.0m square tiles across Main Room Floor (W=20.0m x L=23.5m)
  // Each UV unit contains 2x2 tiles -> 10 repeats across X = 20 tiles (1.0m), 11.75 repeats across Z = 23.5 tiles (1.0m)
  const diffuseTexture = new THREE.CanvasTexture(diffCanvas);
  diffuseTexture.wrapS = THREE.RepeatWrapping;
  diffuseTexture.wrapT = THREE.RepeatWrapping;
  diffuseTexture.repeat.set(10, 11.75);
  diffuseTexture.colorSpace = THREE.SRGBColorSpace;
  diffuseTexture.anisotropy = 8;
  diffuseTexture.needsUpdate = true;

  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.RepeatWrapping;
  bumpTexture.wrapT = THREE.RepeatWrapping;
  bumpTexture.repeat.set(10, 11.75);
  bumpTexture.anisotropy = 8;
  bumpTexture.needsUpdate = true;

  return { diffuseTexture, bumpTexture };
}

/**
 * Procedural Perforated Server-Cooling Plenum Floor Textures for the Raised Platform Stage (1024x1024).
 * Modular 2x2 grid of authentic server-cooling plenum tiles (each 512x512px).
 * - Rich dark anthracite slate palette (#22262e base with #14171e perimeter gasket seams).
 * - Authentic 6x6 center micro-perforation dot matrix airflow holes (#12151b) with depth-carved bump recesses.
 * - 4 heavy-duty metallic corner locking bolts (#475569) with torx drive sockets.
 * - Scaled with repeat.set(7, 3) for exact 1.0m x 1.0m physical tile squares across platW=14.0m x platL=6.0m.
 * - Accompanied by a matched 1024x1024 bumpMap for crisp lighting response under ceiling panels.
 */
function createPerforatedFloorTextures() {
  const width = 1024;
  const height = 1024;

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const diffCtx = diffCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bumpCtx = bumpCanvas.getContext('2d');

  // Base tile fill - deep server-stage anthracite #22262e
  diffCtx.fillStyle = '#22262e';
  diffCtx.fillRect(0, 0, width, height);

  // Bump neutral gray 128
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, width, height);

  // Subtle aggregate micro-noise
  const imgData = diffCtx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const bumpImgData = bumpCtx.getImageData(0, 0, width, height);
  const bumpData = bumpImgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 10;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));

    const bNoise = (Math.random() - 0.5) * 6;
    bumpData[i] = Math.min(255, Math.max(0, bumpData[i] + bNoise));
    bumpData[i + 1] = bumpData[i];
    bumpData[i + 2] = bumpData[i];
  }
  diffCtx.putImageData(imgData, 0, 0);
  bumpCtx.putImageData(bumpImgData, 0, 0);

  // 2x2 modular tile quadrants (512x512 each)
  const quadrants = [
    { x: 0, y: 0 },
    { x: 512, y: 0 },
    { x: 0, y: 512 },
    { x: 512, y: 512 },
  ];

  for (const q of quadrants) {
    const qx = q.x;
    const qy = q.y;
    const qw = 512;
    const qh = 512;

    // Crisp dark perimeter gasket seam (#14171e)
    diffCtx.strokeStyle = '#14171e';
    diffCtx.lineWidth = 4;
    diffCtx.strokeRect(qx + 2, qy + 2, qw - 4, qh - 4);

    bumpCtx.strokeStyle = '#161616';
    bumpCtx.lineWidth = 5;
    bumpCtx.strokeRect(qx + 2, qy + 2, qw - 4, qh - 4);

    // Subtle bevel edge highlight inside gasket
    diffCtx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    diffCtx.lineWidth = 1.5;
    diffCtx.beginPath();
    diffCtx.moveTo(qx + 4, qy + qh - 4);
    diffCtx.lineTo(qx + 4, qy + 4);
    diffCtx.lineTo(qx + qw - 4, qy + 4);
    diffCtx.stroke();

    bumpCtx.strokeStyle = '#9a9a9a';
    bumpCtx.lineWidth = 1.5;
    bumpCtx.beginPath();
    bumpCtx.moveTo(qx + 4, qy + qh - 4);
    bumpCtx.lineTo(qx + 4, qy + 4);
    bumpCtx.lineTo(qx + qw - 4, qy + 4);
    bumpCtx.stroke();

    // Authentic 6x6 Center Micro-Perforation Dot Matrix (Airflow Plenum Holes)
    const cx = qx + qw / 2;
    const cy = qy + qh / 2;
    const spacing = 26; // 6 holes centered from -65px to +65px

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const hx = cx + (c - 2.5) * spacing;
        const hy = cy + (r - 2.5) * spacing;

        // Recessed perforation hole
        diffCtx.fillStyle = '#12151b';
        diffCtx.beginPath();
        diffCtx.arc(hx, hy, 3.2, 0, Math.PI * 2);
        diffCtx.fill();

        // Depressed hole in bump map
        bumpCtx.fillStyle = '#101010';
        bumpCtx.beginPath();
        bumpCtx.arc(hx, hy, 3.2, 0, Math.PI * 2);
        bumpCtx.fill();

        // Punched sheet metal rim bevel highlight
        diffCtx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        diffCtx.lineWidth = 0.8;
        diffCtx.beginPath();
        diffCtx.arc(hx - 0.5, hy - 0.5, 3.2, Math.PI * 0.75, Math.PI * 1.75);
        diffCtx.stroke();
      }
    }

    // 4 Corner heavy-duty metallic locking bolts (#475569)
    const boltOffsets = [
      [24, 24],
      [qw - 24, 24],
      [24, qh - 24],
      [qw - 24, qh - 24]
    ];

    for (const [bxOffset, byOffset] of boltOffsets) {
      const bx = qx + bxOffset;
      const by = qy + byOffset;

      // Recessed outer gasket ring
      diffCtx.fillStyle = '#14171e';
      diffCtx.beginPath();
      diffCtx.arc(bx, by, 7.5, 0, Math.PI * 2);
      diffCtx.fill();

      bumpCtx.fillStyle = '#141414';
      bumpCtx.beginPath();
      bumpCtx.arc(bx, by, 7.5, 0, Math.PI * 2);
      bumpCtx.fill();

      // Metallic bolt head
      diffCtx.fillStyle = '#475569';
      diffCtx.beginPath();
      diffCtx.arc(bx, by, 5.5, 0, Math.PI * 2);
      diffCtx.fill();

      bumpCtx.fillStyle = '#9e9e9e';
      bumpCtx.beginPath();
      bumpCtx.arc(bx, by, 5.5, 0, Math.PI * 2);
      bumpCtx.fill();

      // Specular highlight rim
      diffCtx.fillStyle = '#64748b';
      diffCtx.beginPath();
      diffCtx.arc(bx - 1.2, by - 1.2, 2.2, 0, Math.PI * 2);
      diffCtx.fill();

      // Dark drive socket (hex/torx)
      diffCtx.fillStyle = '#14171e';
      diffCtx.beginPath();
      diffCtx.arc(bx, by, 1.8, 0, Math.PI * 2);
      diffCtx.fill();

      bumpCtx.fillStyle = '#000000';
      bumpCtx.beginPath();
      bumpCtx.arc(bx, by, 2.0, 0, Math.PI * 2);
      bumpCtx.fill();
    }
  }

  // UV repeat set for exact 1.0m x 1.0m square tiles across Raised Platform (platW=14.0m x platL=6.0m)
  // Each UV unit contains 2x2 tiles -> 7 repeats across X = 14 tiles (1.0m), 3 repeats across Z = 6 tiles (1.0m)
  const diffuseTexture = new THREE.CanvasTexture(diffCanvas);
  diffuseTexture.wrapS = THREE.RepeatWrapping;
  diffuseTexture.wrapT = THREE.RepeatWrapping;
  diffuseTexture.repeat.set(7, 3);
  diffuseTexture.colorSpace = THREE.SRGBColorSpace;
  diffuseTexture.anisotropy = 8;
  diffuseTexture.needsUpdate = true;

  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.RepeatWrapping;
  bumpTexture.wrapT = THREE.RepeatWrapping;
  bumpTexture.repeat.set(7, 3);
  bumpTexture.anisotropy = 8;
  bumpTexture.needsUpdate = true;

  return { diffuseTexture, bumpTexture };
}

/**
 * Compatibility aliases
 */
function createUnifiedFloorTexture() {
  return createSolidFloorTextures().diffuseTexture;
}

function createPlenumFloorTextures() {
  return createPerforatedFloorTextures();
}

/**
 * Procedural Ribbed Rubber Step Tread with Sight-Line Accent (512x64).
 * Spans depth of step nosing lip (y: 0 to 64 = 0.046m) and repeats along step length (x: 512 = 1.0m).
 * - Dark charcoal ribbed rubber (#161920) with fine parallel grip grooves.
 * - Recessed 3px cool-ice / cyan-silver metallic sight-line (#8ca2b8 / #56c4b8).
 * - Anodized metal bullnose bevel highlights.
 */
function createStepTreadTexture() {
  const width = 512;
  const height = 64;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Base rubber fill #161920
  ctx.fillStyle = '#161920';
  ctx.fillRect(0, 0, width, height);

  // Micro rubber stipple grain
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 8;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // Rear transition bevel to metal nosing channel (y = 0..6)
  ctx.fillStyle = '#262c36';
  ctx.fillRect(0, 0, width, 2);
  ctx.fillStyle = '#1c212a';
  ctx.fillRect(0, 2, width, 4);

  // 6 Longitudinal anti-slip ribbed grip ridges (y = 8..44)
  const numRibs = 6;
  const ribHeight = 4;
  const ribSpacing = 6;
  const startY = 8;

  for (let r = 0; r < numRibs; r++) {
    const ry = startY + r * ribSpacing;

    // Recessed dark groove
    ctx.fillStyle = '#0b0d11';
    ctx.fillRect(0, ry - 1, width, 2);

    // Raised rubber ridge
    ctx.fillStyle = '#1c2028';
    ctx.fillRect(0, ry + 1, width, ribHeight);

    // Ridge specular edge
    ctx.fillStyle = '#2e3542';
    ctx.fillRect(0, ry + 1, width, 1);
  }

  // Recessed Sight-Line Accent Strip (y = 47..56)
  ctx.fillStyle = '#0a0c0e';
  ctx.fillRect(0, 47, width, 9);

  // Cool-ice / silver-cyan metallic sight line (#8ca2b8 with #56c4b8 accent)
  const sightGrad = ctx.createLinearGradient(0, 48, 0, 55);
  sightGrad.addColorStop(0, '#9bb2c8');
  sightGrad.addColorStop(0.5, '#56c4b8'); // high-tech cyan-ice accent
  sightGrad.addColorStop(1, '#6b7e92');

  ctx.fillStyle = sightGrad;
  ctx.fillRect(0, 49, width, 5);

  // Center bright highlight core
  ctx.fillStyle = '#d2e4f2';
  ctx.fillRect(0, 51, width, 1.5);

  // Front bullnose lip shadow (y = 57..64)
  ctx.fillStyle = '#121418';
  ctx.fillRect(0, 57, width, 4);
  ctx.fillStyle = '#0a0b0e';
  ctx.fillRect(0, 61, width, 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a step tread BoxGeometry with custom UV mapping on the top surface.
 * Sight-line is oriented toward the outer exposed step edge.
 */
function createTreadBoxGeo(lenX, h, lenZ, repeatCount, axis = 'x') {
  const geo = new THREE.BoxGeometry(lenX, h, lenZ);
  const uvAttr = geo.getAttribute('uv');
  const posAttr = geo.getAttribute('position');
  const normAttr = geo.getAttribute('normal');

  for (let i = 0; i < posAttr.count; i++) {
    if (normAttr.getY(i) > 0.5) {
      if (axis === 'x') {
        const u = ((posAttr.getX(i) / lenX) + 0.5) * repeatCount;
        const normZ = (posAttr.getZ(i) / lenZ) + 0.5;
        const v = 1 - normZ; // sight-line on outer front lip
        uvAttr.setXY(i, u, v);
      } else if (axis === 'z_left') {
        const u = ((posAttr.getZ(i) / lenZ) + 0.5) * repeatCount;
        const normX = (posAttr.getX(i) / lenX) + 0.5;
        const v = 1 - normX; // sight-line on left outer edge (-X)
        uvAttr.setXY(i, u, v);
      } else {
        const u = ((posAttr.getZ(i) / lenZ) + 0.5) * repeatCount;
        const normX = (posAttr.getX(i) / lenX) + 0.5;
        const v = normX; // sight-line on right outer edge (+X)
        uvAttr.setXY(i, u, v);
      }
    }
  }
  uvAttr.needsUpdate = true;
  return geo;
}

/**
 * Procedural architectural Data Center Wall Texture (512x512).
 * Spans full vertical height (V: 0.0 to 1.0 = 3.8m) and repeats every 2.0m horizontally (U).
 * Real-world corporate IT facility / NOC wall design:
 * 1. Upper Wall (y: 0..295): Clean matte commercial drywall in cool light-grey/putty (#8c95a0)
 *    with 14px ceiling shadow-gap/crown trim (#1c2026) at top.
 * 2. Middle Infrastructure (y: 295..328): Brushed aluminum cable raceway/trunking (#c2cad2)
 *    with dual power socket & RJ45 Ethernet patch faceplates repeating every 256px.
 * 3. Lower Wall (y: 328..468): Scuff-resistant slate wainscoting (#3d444e) with zero dots/bolts.
 * 4. Subtle full-height 2px vertical drywall expansion joints at x = 0 and x = 256.
 * 5. Clean dark rubber baseboard (y: 468..512) in #181b20 with 2px top bevel highlight (#2c313a).
 */
/**
 * Procedural architectural Data Center Wall Texture (1024x512).
 * Spans full vertical height (V: 0.0 to 1.0 = 3.8m) and repeats every 4.0m horizontally (U).
 * Real-world corporate IT facility / NOC wall design:
 * 1. Upper Wall (y: 0..295): Clean matte commercial drywall in cool light-grey/putty (#8c95a0)
 *    with 14px ceiling shadow-gap/crown trim (#1c2026) at top.
 * 2. Middle Infrastructure (y: 295..328): Brushed aluminum cable raceway/trunking (#c2cad2)
 *    with one high-detail 3-gang commercial faceplate station per 4.0m tile (centered at x = 384).
 * 3. Lower Wall (y: 328..468): Scuff-resistant slate wainscoting (#3d444e) with zero dots/bolts.
 * 4. Subtle full-height 2px vertical drywall expansion joints every 256px (1.0m panels at x = 0, 256, 512, 768).
 * 5. Clean dark rubber baseboard (y: 468..512) in #181b20 with 2px top bevel highlight (#2c313a).
 */
function createDataCenterWallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // 1. Upper Wall Base — Cool Architectural Light-Grey / Putty (#8c95a0)
  ctx.fillStyle = '#8c95a0';
  ctx.fillRect(0, 0, 1024, 295);

  // 3. Lower Wall Base — Scuff-Resistant Medium-Dark Slate Grey (#3d444e)
  ctx.fillStyle = '#3d444e';
  ctx.fillRect(0, 328, 1024, 140);

  // 5. Clean Dark Rubber Baseboard (y = 468..512) in #181b20
  ctx.fillStyle = '#181b20';
  ctx.fillRect(0, 468, 1024, 44);

  // Baseboard top 2px bevel edge highlight
  ctx.fillStyle = '#2c313a';
  ctx.fillRect(0, 468, 1024, 2);

  // Baseboard bottom floor-contact shadow
  ctx.fillStyle = '#0a0c0e';
  ctx.fillRect(0, 508, 1024, 4);

  // Ceiling shadow-gap / crown trim at top (y = 0..14) in #1c2026
  ctx.fillStyle = '#1c2026';
  ctx.fillRect(0, 0, 1024, 14);
  ctx.fillStyle = '#111418';
  ctx.fillRect(0, 13, 1024, 2);

  // Very subtle, fine matte drywall/plaster grain (±3 luminance variation, zero color tint)
  const imgData = ctx.getImageData(0, 0, 1024, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = Math.round((Math.random() - 0.5) * 6);
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // 4. Subtle Full-Height Vertical Drywall Expansion Joints every 256px across 1024px width (1.0m panels)
  const vJoints = [0, 256, 512, 768, 1024];
  for (const vx of vJoints) {
    // Upper wall expansion groove (y = 14..294)
    ctx.fillStyle = '#525a66';
    ctx.fillRect(vx - 1, 14, 2, 280);
    ctx.fillStyle = '#9aa4af';
    ctx.fillRect(vx + 1, 14, 1, 280);

    // Lower wall expansion groove (y = 328..468)
    ctx.fillStyle = '#2b3038';
    ctx.fillRect(vx - 1, 328, 2, 140);
    ctx.fillStyle = '#4a5360';
    ctx.fillRect(vx + 1, 328, 1, 140);
  }

  // 2. Middle Infrastructure — Brushed Aluminum Cable Trunking / Raceway (y = 295..328)
  // Base brushed anodized aluminum (#c2cad2)
  ctx.fillStyle = '#c2cad2';
  ctx.fillRect(0, 295, 1024, 33);

  // Fine horizontal brushed metal streaks
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  for (let i = 0; i < 28; i++) {
    const ry = 296 + Math.floor(Math.random() * 30);
    ctx.fillRect(0, ry, 1024, 1);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  for (let i = 0; i < 28; i++) {
    const ry = 296 + Math.floor(Math.random() * 30);
    ctx.fillRect(0, ry, 1024, 1);
  }

  // Top/bottom crisp shadow seams (#232830) & bevel highlights
  ctx.fillStyle = '#232830';
  ctx.fillRect(0, 294, 1024, 2);
  ctx.fillStyle = '#e4ebf2';
  ctx.fillRect(0, 296, 1024, 1.5);

  ctx.fillStyle = '#e4ebf2';
  ctx.fillRect(0, 326, 1024, 1);
  ctx.fillStyle = '#232830';
  ctx.fillRect(0, 327, 1024, 2);

  // Central snap-cover seam line (y = 311..312)
  ctx.fillStyle = '#8a939e';
  ctx.fillRect(0, 311, 1024, 1);
  ctx.fillStyle = '#dbe2ea';
  ctx.fillRect(0, 312, 1024, 1);

  // Aluminum raceway snap-join lines at x = 0, 512, 1024
  for (const jx of [0, 512, 1024]) {
    ctx.fillStyle = '#7a838e';
    ctx.fillRect(jx - 1, 295, 1, 33);
    ctx.fillStyle = '#e4ebf2';
    ctx.fillRect(jx, 295, 1, 33);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Brazilian 3-Gang IT Faceplate (768x256).
 * Dual RJ45 ports, white 127V socket, and red 220V socket.
 */
function createBrazilianITFaceplateTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // 1. Outer White Faceplate (0, 0 to 768, 256) - clean matte white polycarbonate (#f2f4f7)
  ctx.fillStyle = '#f2f4f7';
  ctx.fillRect(0, 0, 768, 256);

  // Soft subtle outer 3D bevel edge (#d5dae0 border)
  ctx.strokeStyle = '#d5dae0';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 764, 252);

  // Top/left highlight (#ffffff) & bottom/right shadow (#c0c7d0)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 760, 248);
  ctx.strokeStyle = '#c0c7d0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, 251); ctx.lineTo(764, 251); ctx.lineTo(764, 4);
  ctx.stroke();

  // Two crisp recessed silver mounting screws at far left (x = 34, y = 128) and far right (x = 734, y = 128)
  const screws = [34, 734];
  for (const sx of screws) {
    const sy = 128;
    // Outer counterbore recess
    ctx.fillStyle = '#8c949e';
    ctx.beginPath();
    ctx.arc(sx, sy, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Top shadow inside screw hole
    ctx.fillStyle = '#4a5059';
    ctx.beginPath();
    ctx.arc(sx, sy, 6.5, Math.PI, Math.PI * 2);
    ctx.fill();

    // Metallic screw head
    const screwGrad = ctx.createLinearGradient(sx - 5, sy - 5, sx + 5, sy + 5);
    screwGrad.addColorStop(0, '#e2e8f0');
    screwGrad.addColorStop(0.5, '#cbd5e1');
    screwGrad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = screwGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Screw slot
    ctx.fillStyle = '#334155';
    ctx.fillRect(sx - 4.5, sy - 0.75, 9, 1.5);
  }

  // Recessed modular bay (x = 72 to 696, y = 70 to 186: width = 624, height = 116)
  ctx.fillStyle = '#8c949e';
  ctx.fillRect(72, 70, 624, 116);
  ctx.strokeStyle = '#5a626d';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(72, 70, 624, 116);

  // Inner shadow on recessed modular bay
  ctx.fillStyle = '#4a5059';
  ctx.fillRect(72, 70, 624, 2);
  ctx.fillRect(72, 70, 2, 116);
  ctx.fillStyle = '#e5ebf2';
  ctx.fillRect(72, 185, 624, 1);
  ctx.fillRect(695, 70, 1, 116);

  // Module 1 (Left): Dual CAT6 RJ45 Jacks
  ctx.fillStyle = '#f5f7fa';
  ctx.fillRect(74, 72, 204, 112);
  ctx.strokeStyle = '#555b65';
  ctx.lineWidth = 2;
  ctx.strokeRect(74, 72, 204, 112);

  // Two RJ45 Keystone Ports: Left (Amber/Orange uplink), Right (Network Blue)
  const rjPorts = [
    { cx: 126, color: '#d97724', darkColor: '#9a3412', iconColor: '#d97724' },
    { cx: 226, color: '#1e6bb8', darkColor: '#174e85', iconColor: '#1e6bb8' },
  ];

  for (const port of rjPorts) {
    const px = port.cx - 34; // 68px wide -> from cx - 34 to cx + 34
    const py = 98;           // 76px tall -> from 98 to 174

    // Circuit-label window above RJ45 jack (y = 76..92, width = 60, centered at cx)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(port.cx - 30, 76, 60, 15);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(port.cx - 30, 76, 60, 15);

    // Inner shadow in label window
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(port.cx - 29, 77, 58, 1);

    // Network icon color strip (NO blurry text!)
    ctx.fillStyle = port.iconColor;
    ctx.fillRect(port.cx - 22, 83, 44, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(port.cx - 6, 82, 12, 5);
    ctx.fillStyle = port.iconColor;
    ctx.fillRect(port.cx - 4, 83, 8, 3);

    // Keystone colored bezel (68px wide x 76px tall)
    ctx.fillStyle = port.color;
    ctx.fillRect(px, py, 68, 76);
    ctx.strokeStyle = port.darkColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, 68, 76);

    // Bezel inner 3D bevel highlights
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 2, py + 74); ctx.lineTo(px + 2, py + 2); ctx.lineTo(px + 66, py + 2);
    ctx.stroke();

    // Stepped T-shaped black RJ45 modular jack cutout (#0e1014) - standard upright keystone orientation!
    // Upper latch notch: 24px wide x 16px tall (centered at cx, y = 106..122)
    ctx.fillStyle = '#0e1014';
    ctx.fillRect(port.cx - 12, 106, 24, 16);

    // Upper tab wings: 32px wide x 6px tall (y = 116..122)
    ctx.fillRect(port.cx - 16, 116, 32, 6);

    // Main lower cavity: 44px wide x 42px tall (centered at cx, y = 122..164)
    ctx.fillRect(port.cx - 22, 122, 44, 42);

    // Cutout inner shadow bevel
    ctx.fillStyle = '#050608';
    ctx.fillRect(port.cx - 12, 106, 24, 2);
    ctx.fillRect(port.cx - 22, 122, 2, 42);

    // 8 crisp vertical gold contact pins (#eab308) gleaming at the BOTTOM of the port!
    for (let pin = 0; pin < 8; pin++) {
      const pinX = port.cx - 16 + pin * 4.4;
      ctx.fillStyle = '#eab308';
      ctx.fillRect(pinX, 152, 2, 12);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(pinX + 0.5, 153, 1, 9);
    }
  }

  // Module 2 (Center): Brazilian White 127V Socket
  ctx.fillStyle = '#f5f7fa';
  ctx.fillRect(282, 72, 204, 112);
  ctx.strokeStyle = '#555b65';
  ctx.lineWidth = 2;
  ctx.strokeRect(282, 72, 204, 112);

  // Center Module Hexagon Recess (162px wide x 76px tall, centered at cx = 384, cy = 128)
  const mcx = 384;
  const mcy = 128;
  const gradWhite = ctx.createLinearGradient(0, mcy - 38, 0, mcy + 38);
  gradWhite.addColorStop(0, '#dce1e8');
  gradWhite.addColorStop(0.35, '#e8ecf2');
  gradWhite.addColorStop(1, '#eef1f6');

  ctx.beginPath();
  ctx.moveTo(mcx - 46, mcy - 38);
  ctx.lineTo(mcx + 46, mcy - 38);
  ctx.lineTo(mcx + 81, mcy);
  ctx.lineTo(mcx + 46, mcy + 38);
  ctx.lineTo(mcx - 46, mcy + 38);
  ctx.lineTo(mcx - 81, mcy);
  ctx.closePath();
  ctx.fillStyle = gradWhite;
  ctx.fill();

  // White hexagon inner shadow (top) and highlight (bottom)
  ctx.strokeStyle = '#b0b8c4';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(mcx - 81, mcy);
  ctx.lineTo(mcx - 46, mcy - 38);
  ctx.lineTo(mcx + 46, mcy - 38);
  ctx.lineTo(mcx + 81, mcy);
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mcx - 81, mcy);
  ctx.lineTo(mcx - 46, mcy + 38);
  ctx.lineTo(mcx + 46, mcy + 38);
  ctx.lineTo(mcx + 81, mcy);
  ctx.stroke();

  // Module 3 (Right): Brazilian Full-Red 220V Socket
  ctx.fillStyle = '#b51f29';
  ctx.fillRect(490, 72, 204, 112);
  ctx.strokeStyle = '#4a1015';
  ctx.lineWidth = 2;
  ctx.strokeRect(490, 72, 204, 112);

  // Right Module Hexagon Recess (162px wide x 76px tall, centered at cx = 592, cy = 128)
  const rcx = 592;
  const rcy = 128;
  const gradRed = ctx.createLinearGradient(0, rcy - 38, 0, rcy + 38);
  gradRed.addColorStop(0, '#8a141d');
  gradRed.addColorStop(0.35, '#991720');
  gradRed.addColorStop(1, '#a51b24');

  ctx.beginPath();
  ctx.moveTo(rcx - 46, rcy - 38);
  ctx.lineTo(rcx + 46, rcy - 38);
  ctx.lineTo(rcx + 81, rcy);
  ctx.lineTo(rcx + 46, rcy + 38);
  ctx.lineTo(rcx - 46, rcy + 38);
  ctx.lineTo(rcx - 81, rcy);
  ctx.closePath();
  ctx.fillStyle = gradRed;
  ctx.fill();

  // Red hexagon inner shadow (top) and highlight (bottom)
  ctx.strokeStyle = '#630d13';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(rcx - 81, rcy);
  ctx.lineTo(rcx - 46, rcy - 38);
  ctx.lineTo(rcx + 46, rcy - 38);
  ctx.lineTo(rcx + 81, rcy);
  ctx.stroke();

  ctx.strokeStyle = '#c92e3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rcx - 81, rcy);
  ctx.lineTo(rcx - 46, rcy + 38);
  ctx.lineTo(rcx + 46, rcy + 38);
  ctx.lineTo(rcx + 81, rcy);
  ctx.stroke();

  // Socket Pin Holes and Contacts
  const hexSockets = [
    { cx: mcx, cy: mcy, isRed: false },
    { cx: rcx, cy: rcy, isRed: true },
  ];

  for (const sock of hexSockets) {
    const holes = [
      [sock.cx - 40, sock.cy + 6],  // Left pin
      [sock.cx, sock.cy - 12],     // Center ground pin
      [sock.cx + 40, sock.cy + 6],  // Right pin
    ];

    for (const [hx, hy] of holes) {
      // 2px sunken rim chamfer around the hole
      ctx.fillStyle = sock.isRed ? '#5d0f15' : '#c5cbd5';
      ctx.beginPath();
      ctx.arc(hx, hy + 0.8, 10.5, 0, Math.PI * 2);
      ctx.fill();

      // Deep circular hole core
      ctx.fillStyle = '#101215';
      ctx.beginPath();
      ctx.arc(hx, hy, 8.5, 0, Math.PI * 2);
      ctx.fill();

      // Two warm brass/gold contact clips peeking inside the dark hole
      // Left brass leaf
      ctx.fillStyle = '#9c7a38';
      ctx.fillRect(hx - 6.5, hy - 4, 2.5, 8);
      ctx.fillStyle = '#d8b768';
      ctx.fillRect(hx - 6, hy - 3.5, 1, 7);

      // Right brass leaf
      ctx.fillStyle = '#9c7a38';
      ctx.fillRect(hx + 4, hy - 4, 2.5, 8);
      ctx.fillStyle = '#d8b768';
      ctx.fillRect(hx + 4.5, hy - 3.5, 1, 7);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 3D Faceplate Box Geometry (0.27m wide x 0.095m tall x 0.008m deep).
 * Maps front face (+Z) to full [0, 1] texture, and sides/back to clean white polycarbonate border.
 */
function createOutletBoxGeometry(w = 0.27, h = 0.095, d = 0.008) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const nz = norm.getZ(i);
    if (nz > 0.5) {
      // Front face (+Z): map full [0, 1] texture cleanly
      const x = pos.getX(i);
      const y = pos.getY(i);
      const u = (x + w / 2) / w;
      const v = (y + h / 2) / h;
      uv.setXY(i, u, v);
    } else {
      // Sides and back: sample neutral white polycarbonate border at (0.04, 0.05)
      uv.setXY(i, 0.04, 0.05);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Procedural woven nylon barrier belt texture (512x64).
 */
function createStanchionBeltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Deep tactical charcoal/navy-black woven nylon webbing base
  ctx.fillStyle = '#1a1e24';
  ctx.fillRect(0, 0, 512, 64);

  // Fine diagonal herringbone fabric weave lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let x = -64; x < 512 + 64; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x + 16, 32);
    ctx.lineTo(x, 58);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  for (let x = -62; x < 512 + 64; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x + 16, 32);
    ctx.lineTo(x, 58);
    ctx.stroke();
  }

  // Top stitched safety border stripe (6px wide in High-Contrast Corporate Amber/Yellow #e5a024)
  ctx.fillStyle = '#e5a024';
  ctx.fillRect(0, 2, 512, 6);
  // Bottom stitched safety border stripe (6px wide)
  ctx.fillRect(0, 56, 512, 6);

  // Stitched border fine detail (stitch thread lines)
  ctx.fillStyle = '#b45309';
  for (let x = 0; x < 512; x += 6) {
    ctx.fillRect(x, 7, 3, 1);
    ctx.fillRect(x, 56, 3, 1);
  }

  // Subtle diagonal hazard warning accents along the belt
  ctx.fillStyle = 'rgba(229, 160, 36, 0.18)';
  for (let x = 16; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x + 12, 10);
    ctx.lineTo(x + 28, 54);
    ctx.lineTo(x + 16, 54);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(3, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural 3D catenary sagging belt ribbon geometry with 8 subdivisions.
 * Applies subtle parabolic downward sag between postA and postB:
 * yOffset = -maxSag * 4 * t * (1 - t)
 */
function createCatenaryBeltGeometry(pA, pB, maxSag = 0.024, beltY = 1.062, trim = 0.053, hH = 0.036, hT = 0.0025) {
  const dx = pB.x - pA.x;
  const dz = pB.z - pA.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.1) return new THREE.BufferGeometry();

  const ux = dx / dist;
  const uz = dz / dist;
  const nx = -uz;
  const nz = ux;

  // Trim inward at both ends so belt starts/ends cleanly at cassette slots
  const sx = pA.x + ux * trim;
  const sz = pA.z + uz * trim;
  const ex = pB.x - ux * trim;
  const ez = pB.z - uz * trim;
  const spanX = ex - sx;
  const spanZ = ez - sz;

  const segments = 8;

  const positions = [];
  const normals = [];
  const uvs = [];

  // Generate 8 segments (quads on front, back, top, bottom)
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;

    // Center positions
    const c0x = sx + spanX * t0;
    const c0z = sz + spanZ * t0;
    const ySag0 = -maxSag * 4 * t0 * (1 - t0);
    const c0y = beltY + ySag0;

    const c1x = sx + spanX * t1;
    const c1z = sz + spanZ * t1;
    const ySag1 = -maxSag * 4 * t1 * (1 - t1);
    const c1y = beltY + ySag1;

    // Corner vertices at t0
    const v0_tf = [c0x + nx * hT, c0y + hH, c0z + nz * hT];
    const v0_bf = [c0x + nx * hT, c0y - hH, c0z + nz * hT];
    const v0_tb = [c0x - nx * hT, c0y + hH, c0z - nz * hT];
    const v0_bb = [c0x - nx * hT, c0y - hH, c0z - nz * hT];

    // Corner vertices at t1
    const v1_tf = [c1x + nx * hT, c1y + hH, c1z + nz * hT];
    const v1_bf = [c1x + nx * hT, c1y - hH, c1z + nz * hT];
    const v1_tb = [c1x - nx * hT, c1y + hH, c1z - nz * hT];
    const v1_bb = [c1x - nx * hT, c1y - hH, c1z - nz * hT];

    // Helper to push a quad (2 triangles)
    const pushQuad = (p1, p2, p3, p4, n, u0, u1) => {
      // Triangle 1: p1, p2, p3
      positions.push(...p1, ...p2, ...p3);
      normals.push(...n, ...n, ...n);
      uvs.push(u0, 1, u0, 0, u1, 0);

      // Triangle 2: p1, p3, p4
      positions.push(...p1, ...p3, ...p4);
      normals.push(...n, ...n, ...n);
      uvs.push(u0, 1, u1, 0, u1, 1);
    };

    // Front face (normal = nx, 0, nz)
    pushQuad(v0_tf, v0_bf, v1_bf, v1_tf, [nx, 0, nz], t0, t1);
    // Back face (normal = -nx, 0, -nz)
    pushQuad(v1_tb, v1_bb, v0_bb, v0_tb, [-nx, 0, -nz], t1, t0);
    // Top edge (normal = 0, 1, 0)
    pushQuad(v0_tb, v0_tf, v1_tf, v1_tb, [0, 1, 0], t0, t1);
    // Bottom edge (normal = 0, -1, 0)
    pushQuad(v0_bf, v0_bb, v1_bb, v1_bf, [0, -1, 0], t0, t1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Procedural Touchscreen UI for Enterprise Coffee Station (512x512).
 */
function createCoffeeScreenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // 1. Brushed Silver Outer Frame Bezel (18px wide #c8cfd8 with crisp inner bevel)
  const silverGrad = ctx.createLinearGradient(0, 0, 512, 512);
  silverGrad.addColorStop(0, '#e8edf4');
  silverGrad.addColorStop(0.25, '#c8cfd8');
  silverGrad.addColorStop(0.5, '#d4dbe4');
  silverGrad.addColorStop(0.75, '#b8c0cc');
  silverGrad.addColorStop(1, '#9eabbc');
  ctx.fillStyle = silverGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Outer edge dark rim
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, 510.5, 510.5);

  // Brushed metallic highlight groove around the bezel
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(3.5, 3.5, 505, 505);

  // Inner bevel edge (shadow and highlight creating recessed glass look)
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2;
  ctx.strokeRect(17, 17, 478, 478);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, 476, 476);

  // 2. Inner Glossy Black Glass Display (x: 18 to 494, y: 18 to 494, width 476, height 476)
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(18, 18, 476, 476);

  // Subtle glass reflection streak across upper-right
  const glassGrad = ctx.createLinearGradient(18, 18, 494, 494);
  glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  glassGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.02)');
  glassGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glassGrad;
  ctx.fillRect(18, 18, 476, 476);

  // 3. Header Bar (y: 18 to 68, height 50)
  ctx.fillStyle = '#141822';
  ctx.fillRect(18, 18, 476, 50);
  ctx.strokeStyle = '#273042';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(18, 68); ctx.lineTo(494, 68);
  ctx.stroke();

  // Minimalist white cup logo icon
  ctx.strokeStyle = '#f8fafc';
  ctx.fillStyle = '#f8fafc';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(34, 33);
  ctx.lineTo(36, 47);
  ctx.quadraticCurveTo(36, 53, 44, 53);
  ctx.lineTo(52, 53);
  ctx.quadraticCurveTo(60, 53, 60, 47);
  ctx.lineTo(62, 33);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(64, 42, 5.5, -Math.PI / 2, Math.PI / 2, false);
  ctx.stroke();

  // Steam lines
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(40, 29); ctx.quadraticCurveTo(38, 25, 42, 21);
  ctx.moveTo(48, 29); ctx.quadraticCurveTo(50, 25, 46, 21);
  ctx.moveTo(56, 29); ctx.quadraticCurveTo(54, 25, 58, 21);
  ctx.stroke();

  // Crisp Generic "COFFEE" Header
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('COFFEE', 78, 43);

  // Status indicator
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(388, 43, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('92°C  |  READY', 399, 43);

  // 4. 4x3 Grid of 12 Drink Cards
  const drinks = [
    { name: 'ESPRESSO', crema: '#8a4b16', milk: 0, foam: 0, tag: 'INTENSE' },
    { name: 'RISTRETTO', crema: '#5c2d0c', milk: 0, foam: 0, tag: 'BOLD' },
    { name: 'DOPPIO', crema: '#7a3e12', milk: 0, foam: 0, tag: 'DOUBLE' },
    { name: 'AMERICANO', crema: '#9e5d23', milk: 0, foam: 0, tag: 'CLASSIC' },
    { name: 'CAPPUCCINO', crema: '#8a4b16', milk: 0.4, foam: 0.35, tag: 'FOAM' },
    { name: 'CAFÉ LATTE', crema: '#9e5d23', milk: 0.6, foam: 0.2, tag: 'CREAMY' },
    { name: 'FLAT WHITE', crema: '#7a3e12', milk: 0.5, foam: 0.15, tag: 'SILKY' },
    { name: 'CORTADO', crema: '#8a4b16', milk: 0.35, foam: 0.1, tag: 'BALANCED' },
    { name: 'CAFÉ MOCHA', crema: '#4a2511', milk: 0.45, foam: 0.25, tag: 'CHOCO' },
    { name: 'MACCHIATO', crema: '#7a3e12', milk: 0.15, foam: 0.2, tag: 'SPOT' },
    { name: 'CHOCOLATE', crema: '#3d1c06', milk: 0.55, foam: 0.25, tag: 'SWEET' },
    { name: 'HOT WATER', crema: '#38bdf8', milk: 0, foam: 0, tag: 'TEA' },
  ];

  const startX = 26;
  const startY = 76;
  const cardW = 105;
  const cardH = 118;
  const gapX = 13;
  const gapY = 8;

  drinks.forEach((d, idx) => {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const cx = startX + col * (cardW + gapX);
    const cy = startY + row * (cardH + gapY);

    ctx.fillStyle = '#151922';
    ctx.strokeStyle = idx === 4 ? '#eab308' : '#252d3d';
    ctx.lineWidth = idx === 4 ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(cx, cy, cardW, cardH, 6);
    ctx.fill();
    ctx.stroke();

    if (idx === 4) {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
      ctx.beginPath();
      ctx.roundRect(cx + 2, cy + 2, cardW - 4, cardH - 4, 5);
      ctx.fill();
    }

    const cupCenterX = cx + cardW / 2;
    const cupTopY = cy + 18;
    const cupW = 34;
    const cupH = 42;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(cupCenterX, cupTopY + cupH + 4, cupW / 2 + 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(cupCenterX - cupW / 2, cupTopY, cupW, cupH, [2, 2, 7, 7]);
    ctx.fill();

    const liqX = cupCenterX - cupW / 2 + 3;
    const liqW = cupW - 6;
    const liqY = cupTopY + 3;
    const liqH = cupH - 6;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(liqX, liqY, liqW, liqH, [1, 1, 5, 5]);
    ctx.clip();

    ctx.fillStyle = d.crema;
    ctx.fillRect(liqX, liqY, liqW, liqH);

    if (d.milk > 0) {
      const milkH = liqH * d.milk;
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(liqX, liqY + liqH - milkH, liqW, milkH);
    }

    if (d.foam > 0) {
      const foamH = liqH * d.foam;
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(liqX, liqY, liqW, foamH);
      if (d.name === 'CAPPUCCINO' || d.name === 'CAFÉ MOCHA') {
        ctx.fillStyle = '#6b3710';
        ctx.fillRect(cupCenterX - 4, liqY + 2, 8, 2);
      }
    }
    ctx.restore();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cupCenterX + cupW / 2 + 2, cupTopY + cupH / 2, 5.5, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.name, cupCenterX, cy + 78);

    ctx.fillStyle = '#222938';
    ctx.beginPath();
    ctx.roundRect(cupCenterX - 26, cy + 90, 52, 16, 8);
    ctx.fill();

    ctx.fillStyle = idx === 4 ? '#facc15' : '#94a3b8';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText(d.tag, cupCenterX, cy + 98);
  });

  // 5. Footer Bar (y: 460 to 494, height 34)
  ctx.fillStyle = '#0f1218';
  ctx.fillRect(18, 460, 476, 34);
  ctx.strokeStyle = '#273042';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(18, 460); ctx.lineTo(494, 460);
  ctx.stroke();

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TOQUE PARA SELECIONAR  /  TOUCH TO SELECT', 256, 477);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Side Panel Artwork for Enterprise Coffee Station (512x512).
 */
function createCoffeeSideTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0c0d10';
  ctx.fillRect(0, 0, 512, 512);

  const sheen = ctx.createLinearGradient(0, 0, 512, 512);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 512, 512);

  // Sweeping deep-red ribbon wave
  const waveGrad = ctx.createLinearGradient(80, 200, 480, 460);
  waveGrad.addColorStop(0, '#750c13');
  waveGrad.addColorStop(0.4, '#a8141e');
  waveGrad.addColorStop(0.7, '#c81b26');
  waveGrad.addColorStop(1, '#660a10');

  ctx.fillStyle = waveGrad;
  ctx.beginPath();
  ctx.moveTo(0, 420);
  ctx.bezierCurveTo(80, 390, 160, 280, 290, 240);
  ctx.bezierCurveTo(400, 205, 480, 250, 512, 290);
  ctx.lineTo(512, 450);
  ctx.bezierCurveTo(420, 480, 280, 440, 140, 460);
  ctx.bezierCurveTo(70, 470, 20, 490, 0, 512);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 420);
  ctx.bezierCurveTo(80, 390, 160, 280, 290, 240);
  ctx.bezierCurveTo(400, 205, 480, 250, 512, 290);
  ctx.stroke();

  // Bold crisp generic "COFFEE" typography
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 62px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('COFFEE', 256, 120);

  // Steaming coffee cup icon
  ctx.strokeStyle = '#c81b26';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 3.5;
  const icx = 256;
  const icy = 60;
  ctx.beginPath();
  ctx.moveTo(icx - 18, icy - 10);
  ctx.lineTo(icx - 14, icy + 10);
  ctx.quadraticCurveTo(icx - 14, icy + 16, icx, icy + 16);
  ctx.quadraticCurveTo(icx + 14, icy + 16, icx + 14, icy + 10);
  ctx.lineTo(icx + 18, icy - 10);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(icx - 7, icy - 15); ctx.quadraticCurveTo(icx - 11, icy - 21, icx - 7, icy - 27);
  ctx.moveTo(icx, icy - 16); ctx.quadraticCurveTo(icx + 4, icy - 22, icx, icy - 28);
  ctx.moveTo(icx + 7, icy - 15); ctx.quadraticCurveTo(icx + 3, icy - 21, icx + 7, icy - 27);
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('PROFESSIONAL BEVERAGE SYSTEM', 256, 164);
  ctx.restore();

  // Top-down white saucer & coffee cup inside red wave
  const cupX = 280;
  const cupY = 355;

  const saucerShadow = ctx.createRadialGradient(cupX + 10, cupY + 12, 10, cupX + 10, cupY + 12, 90);
  saucerShadow.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
  saucerShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = saucerShadow;
  ctx.beginPath();
  ctx.arc(cupX + 10, cupY + 12, 90, 0, Math.PI * 2);
  ctx.fill();

  const saucerGrad = ctx.createRadialGradient(cupX - 15, cupY - 15, 20, cupX, cupY, 78);
  saucerGrad.addColorStop(0, '#ffffff');
  saucerGrad.addColorStop(0.85, '#e2e8f0');
  saucerGrad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = saucerGrad;
  ctx.beginPath();
  ctx.arc(cupX, cupY, 78, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cupX, cupY, 52, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cupX - 44, cupY - 26, 12, 7, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.stroke();

  const cupRimGrad = ctx.createRadialGradient(cupX - 10, cupY - 10, 10, cupX, cupY, 44);
  cupRimGrad.addColorStop(0, '#ffffff');
  cupRimGrad.addColorStop(0.9, '#f1f5f9');
  cupRimGrad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = cupRimGrad;
  ctx.beginPath();
  ctx.arc(cupX, cupY, 44, 0, Math.PI * 2);
  ctx.fill();

  const cremaGrad = ctx.createRadialGradient(cupX - 6, cupY - 6, 4, cupX, cupY, 38);
  cremaGrad.addColorStop(0, '#fef08a');
  cremaGrad.addColorStop(0.25, '#d97706');
  cremaGrad.addColorStop(0.65, '#92400e');
  cremaGrad.addColorStop(0.95, '#451a03');
  cremaGrad.addColorStop(1, '#270e02');
  ctx.fillStyle = cremaGrad;
  ctx.beginPath();
  ctx.arc(cupX, cupY, 38, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#fffbeb';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cupX, cupY, 14, 0, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cupX - 2, cupY, 22, Math.PI * 0.4, Math.PI * 1.8);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('HOT BEVERAGE UNIT', 496, 480);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('MODEL ES-500 ENTERPRISE', 496, 495);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Monolithic 5-sided polygon geometry matching the exact profile of the coffee machine side:
 * - Bottom from z = -0.34 to z = +0.28 (y = 0.0)
 * - Niche vertical front edge up to y = 0.41 (z = +0.28)
 * - Slopes backward at exactly 12° from (z = +0.28, y = 0.41) to (z = +0.174, y = 0.91)
 * - Top edge runs back from z = +0.174 to z = -0.34 at y = 0.91
 * - Back edge runs vertically from y = 0.91 to y = 0.0 at z = -0.34
 * Perfectly eliminates rectangular fins and pointed corners from all camera angles!
 */
function createCoffeeSidePanelGeometry(isRightSide = false) {
  const geo = new THREE.BufferGeometry();

  const v0 = [0, 0.00, -0.34];  // bottom-back
  const v1 = [0, 0.00,  0.28];  // bottom-front
  const v2 = [0, 0.41,  0.28];  // niche corner
  const v3 = [0, 0.91,  0.174]; // sloped top-front (12° back!)
  const v4 = [0, 0.91, -0.34];  // top-back

  let positions, normals, uvs;
  const nx = isRightSide ? 1.0 : -1.0;

  if (!isRightSide) {
    // Left side (normal = -1, 0, 0)
    positions = new Float32Array([
      ...v0, ...v1, ...v2,
      ...v0, ...v2, ...v3,
      ...v0, ...v3, ...v4,
    ]);
    const u3 = (0.174 - (-0.34)) / (0.28 - (-0.34)); // 0.829
    uvs = new Float32Array([
      0.0, 0.0,  1.0, 0.0,   1.0, 0.45,
      0.0, 0.0,  1.0, 0.45,  u3,  1.0,
      0.0, 0.0,  u3,  1.0,   0.0, 1.0,
    ]);
  } else {
    // Right side (normal = +1, 0, 0)
    positions = new Float32Array([
      ...v0, ...v2, ...v1,
      ...v0, ...v3, ...v2,
      ...v0, ...v4, ...v3,
    ]);
    const u3 = (0.28 - 0.174) / (0.28 - (-0.34)); // 0.171
    uvs = new Float32Array([
      1.0, 0.0,  0.0, 0.45,  0.0, 0.0,
      1.0, 0.0,  u3,  1.0,   0.0, 0.45,
      1.0, 0.0,  1.0, 1.0,   u3,  1.0,
    ]);
  }

  normals = new Float32Array(9 * 3);
  for (let i = 0; i < 9; i++) {
    normals[i * 3 + 0] = nx;
    normals[i * 3 + 1] = 0.0;
    normals[i * 3 + 2] = 0.0;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Top Smoked-Acrylic Bean Hopper texture (512x256).
 * Dark roasted coffee beans with "GRÃOS MOÍDOS NA HORA" header banner.
 */
function createCoffeeHopperTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#221208';
  ctx.fillRect(0, 0, 512, 256);

  // Roasted beans
  for (let i = 0; i < 160; i++) {
    const bx = Math.random() * 512;
    const by = Math.random() * 256;
    const br = 8 + Math.random() * 7;
    const ang = Math.random() * Math.PI;

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang);
    ctx.fillStyle = Math.random() > 0.5 ? '#3b1e0f' : '#2c1509';
    ctx.beginPath();
    ctx.ellipse(0, 0, br, br * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#120803';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-br * 0.8, 0);
    ctx.quadraticCurveTo(0, br * 0.2, br * 0.8, 0);
    ctx.stroke();
    ctx.restore();
  }

  // Smoked acrylic overlay
  const smoke = ctx.createLinearGradient(0, 0, 0, 256);
  smoke.addColorStop(0, 'rgba(15, 18, 24, 0.7)');
  smoke.addColorStop(0.5, 'rgba(15, 18, 24, 0.45)');
  smoke.addColorStop(1, 'rgba(15, 18, 24, 0.85)');
  ctx.fillStyle = smoke;
  ctx.fillRect(0, 0, 512, 256);

  // Header Banner
  ctx.fillStyle = '#0f1116';
  ctx.fillRect(40, 28, 432, 54);
  ctx.strokeStyle = '#2d3340';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 28, 432, 54);

  ctx.fillStyle = '#c41824';
  ctx.fillRect(44, 32, 8, 46);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GRÃOS MOÍDOS NA HORA', 260, 55);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Procedural Areca Palm (Palmeira Areca) Frond Texture (512x512).
 * Transparent background, central rachis stem, and 46 pairs of sharp pinnate leaflets.
 */
function createPalmFrondTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 512, 512);

  const numPairs = 46;
  const startY = 490;
  const endY = 30;

  for (let i = 0; i < numPairs; i++) {
    const t = i / (numPairs - 1);
    const yStem = startY - t * (startY - endY);

    const envelope = Math.sin(Math.pow(t, 0.7) * Math.PI);
    const leafletLen = 50 + envelope * 185;
    const baseWidth = Math.max(2.5, 6.5 * (1.0 - t * 0.5));

    const angleRad = 0.55 + 0.15 * (1.0 - t);
    const dx = leafletLen * Math.cos(angleRad);
    const dy = -leafletLen * Math.sin(angleRad);

    const leftTipX = 256 - dx;
    const rightTipX = 256 + dx;
    const tipY = yStem + dy;

    // Left Leaflet
    const leftGrad = ctx.createLinearGradient(256, yStem, leftTipX, tipY);
    leftGrad.addColorStop(0, '#1c5214');
    leftGrad.addColorStop(0.35, '#2d7a1f');
    leftGrad.addColorStop(0.75, '#469c2d');
    leftGrad.addColorStop(1, '#6abf40');

    ctx.fillStyle = leftGrad;
    ctx.beginPath();
    ctx.moveTo(256, yStem - baseWidth / 2);
    ctx.quadraticCurveTo(256 - dx * 0.45, yStem + dy * 0.35 - 3, leftTipX, tipY);
    ctx.quadraticCurveTo(256 - dx * 0.55, yStem + dy * 0.65 + 2, 256, yStem + baseWidth / 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#226b17';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(256, yStem);
    ctx.quadraticCurveTo(256 - dx * 0.5, yStem + dy * 0.5, leftTipX, tipY);
    ctx.stroke();

    // Right Leaflet
    const rightGrad = ctx.createLinearGradient(256, yStem, rightTipX, tipY);
    rightGrad.addColorStop(0, '#1c5214');
    rightGrad.addColorStop(0.35, '#2d7a1f');
    rightGrad.addColorStop(0.75, '#469c2d');
    rightGrad.addColorStop(1, '#6abf40');

    ctx.fillStyle = rightGrad;
    ctx.beginPath();
    ctx.moveTo(256, yStem - baseWidth / 2);
    ctx.quadraticCurveTo(256 + dx * 0.45, yStem + dy * 0.35 - 3, rightTipX, tipY);
    ctx.quadraticCurveTo(256 + dx * 0.55, yStem + dy * 0.65 + 2, 256, yStem + baseWidth / 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#226b17';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(256, yStem);
    ctx.quadraticCurveTo(256 + dx * 0.5, yStem + dy * 0.5, rightTipX, tipY);
    ctx.stroke();
  }

  // Central Golden-Green Rachis Stem
  const rachisGrad = ctx.createLinearGradient(256, startY + 20, 256, endY);
  rachisGrad.addColorStop(0, '#8fa832');
  rachisGrad.addColorStop(0.4, '#6b9c24');
  rachisGrad.addColorStop(0.8, '#43871d');
  rachisGrad.addColorStop(1, '#346d16');

  ctx.strokeStyle = rachisGrad;
  ctx.lineCap = 'round';

  for (let y = startY + 15; y >= endY; y -= 10) {
    const t = 1.0 - (y - endY) / (startY + 15 - endY);
    const width = 7.0 * (1.0 - t * 0.75);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(256, y + 5);
    ctx.lineTo(256, y - 10);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Creates an arching 3D feathered palm frond ribbon along a parabolic gravity arc
 * with a slight V-fold cross section so it never looks flat from the side!
 */
function createCurvedPalmFrondGeometry(len = 1.1, width = 0.38, archRise = 0.22, droop = 0.45, vFold = 0.025) {
  const segments = 10;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = archRise * Math.sin(Math.PI * t * 0.75) - droop * (t * t);
    const z = len * t;
    const w = width * (1.0 - 0.15 * t);

    // Left vertex (-w/2, elevated by vFold)
    positions.push(-w / 2, y + vFold, z);
    uvs.push(0, t);

    // Center rachis vertex (0, y, z)
    positions.push(0, y, z);
    uvs.push(0.5, t);

    // Right vertex (+w/2, elevated by vFold)
    positions.push(w / 2, y + vFold, z);
    uvs.push(1, t);

    if (i < segments) {
      const row0 = i * 3;
      const row1 = (i + 1) * 3;

      // Left wing: winding order counter-clockwise from above so normals point upward (+y)
      indices.push(row0, row1 + 1, row0 + 1);
      indices.push(row0, row1, row1 + 1);

      // Right wing: winding order counter-clockwise from above so normals point upward (+y)
      indices.push(row0 + 1, row1 + 2, row0 + 2);
      indices.push(row0 + 1, row1 + 1, row1 + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Procedural suspended tech ceiling texture with recessed cleanroom LED light troffers (512x512).
 * Returns { diffuseTexture, emissiveTexture } tiled across the ceiling.
 */
function createDataCenterCeilingTextures() {
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = 512;
  diffCanvas.height = 512;
  const dCtx = diffCanvas.getContext('2d');

  const emisCanvas = document.createElement('canvas');
  emisCanvas.width = 512;
  emisCanvas.height = 512;
  const eCtx = emisCanvas.getContext('2d');

  // Base background: dark charcoal acoustic tile (#1e2229)
  dCtx.fillStyle = '#1e2229';
  dCtx.fillRect(0, 0, 512, 512);

  // Emissive is pure black by default (#000000)
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 512, 512);

  // Subtle acoustic aggregate noise on diffuse
  const imgData = dCtx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 10;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  dCtx.putImageData(imgData, 0, 0);

  // Perforated dot matrix on Tile 1 (top-right: 256, 0) and Tile 3 (bottom-right: 256, 256)
  // matching the floor's dot matrix perforations!
  const dotTiles = [[256, 0], [256, 256]];
  for (const [tx, ty] of dotTiles) {
    dCtx.fillStyle = '#13161c';
    for (let py = ty + 24; py < ty + 236; py += 16) {
      for (let px = tx + 24; px < tx + 236; px += 16) {
        dCtx.beginPath();
        dCtx.arc(px, py, 1.8, 0, Math.PI * 2);
        dCtx.fill();
      }
    }
  }

  // Tile 2 (bottom-left: x: 0 to 256, y: 256 to 512) -> HVAC Return Air Grille
  const hvacX = 26;
  const hvacY = 282;
  const hvacW = 204;
  const hvacH = 204;

  dCtx.fillStyle = '#12151a';
  dCtx.fillRect(hvacX, hvacY, hvacW, hvacH);
  dCtx.strokeStyle = '#2d343f';
  dCtx.lineWidth = 3;
  dCtx.strokeRect(hvacX, hvacY, hvacW, hvacH);

  // 14 horizontal louver slats
  for (let ly = hvacY + 12; ly < hvacY + hvacH - 8; ly += 13) {
    dCtx.fillStyle = '#0a0c0f';
    dCtx.fillRect(hvacX + 6, ly, hvacW - 12, 4);
    dCtx.fillStyle = '#252b34';
    dCtx.fillRect(hvacX + 6, ly + 4, hvacW - 12, 5);
    dCtx.fillStyle = '#3d4552';
    dCtx.fillRect(hvacX + 6, ly + 9, hvacW - 12, 1);
  }

  // Tile 0 (top-left: x: 0 to 256, y: 0 to 256) -> Recessed Cleanroom LED Light Troffer
  const trofferX = 38;
  const trofferY = 88;
  const trofferW = 180;
  const trofferH = 80;

  // Dark metal housing bezel
  dCtx.fillStyle = '#14171d';
  dCtx.fillRect(trofferX - 10, trofferY - 10, trofferW + 20, trofferH + 20);
  dCtx.strokeStyle = '#38404c';
  dCtx.lineWidth = 2;
  dCtx.strokeRect(trofferX - 10, trofferY - 10, trofferW + 20, trofferH + 20);

  // Cleanroom LED light diffuser panel (cool-white/ice-blue #dceeff)
  const grad = dCtx.createLinearGradient(trofferX, trofferY, trofferX, trofferY + trofferH);
  grad.addColorStop(0, '#ebf5ff');
  grad.addColorStop(0.5, '#dceeff');
  grad.addColorStop(1, '#c8e2fb');
  dCtx.fillStyle = grad;
  dCtx.fillRect(trofferX, trofferY, trofferW, trofferH);

  // Subtle inner bezel frame on diffuse
  dCtx.strokeStyle = '#94a3b8';
  dCtx.lineWidth = 1;
  dCtx.strokeRect(trofferX, trofferY, trofferW, trofferH);

  // Companion emissiveMap: ONLY this rectangular LED light bar is bright (#8899aa)
  eCtx.fillStyle = '#8899aa';
  eCtx.fillRect(trofferX, trofferY, trofferW, trofferH);

  // 1. 2x2 Dark Metallic T-bar Suspension Rails (#16191e with #343b46 bevel edges)
  // Perimeter rails
  dCtx.strokeStyle = '#16191e';
  dCtx.lineWidth = 10;
  dCtx.strokeRect(0, 0, 512, 512);

  // Center cross rails
  dCtx.beginPath();
  dCtx.moveTo(256, 0); dCtx.lineTo(256, 512);
  dCtx.moveTo(0, 256); dCtx.lineTo(512, 256);
  dCtx.stroke();

  // Bevel highlight edges on rails
  dCtx.strokeStyle = '#343b46';
  dCtx.lineWidth = 1.5;
  dCtx.beginPath();
  dCtx.moveTo(258, 0); dCtx.lineTo(258, 512);
  dCtx.moveTo(0, 258); dCtx.lineTo(512, 258);
  dCtx.stroke();

  // Center intersection clip
  dCtx.fillStyle = '#424b58';
  dCtx.fillRect(250, 250, 12, 12);

  // Diffuse texture
  const diffuseTexture = new THREE.CanvasTexture(diffCanvas);
  diffuseTexture.wrapS = THREE.RepeatWrapping;
  diffuseTexture.wrapT = THREE.RepeatWrapping;
  diffuseTexture.repeat.set(5, 6);
  diffuseTexture.colorSpace = THREE.SRGBColorSpace;
  diffuseTexture.anisotropy = 4;
  diffuseTexture.needsUpdate = true;

  // Emissive texture
  const emissiveTexture = new THREE.CanvasTexture(emisCanvas);
  emissiveTexture.wrapS = THREE.RepeatWrapping;
  emissiveTexture.wrapT = THREE.RepeatWrapping;
  emissiveTexture.repeat.set(5, 6);
  emissiveTexture.anisotropy = 4;
  emissiveTexture.needsUpdate = true;

  return { diffuseTexture, emissiveTexture };
}

/**
 * Creates wall box geometry with UV coordinates precisely locked to world meters:
 * - V: 0.0 to 1.0 spans the exact 3.8m wall height (floor to ceiling).
 * - U: 1.0 repeat = exactly 4.0m horizontally.
 * Ensures zero stretching and crisp commercial IT trunking faceplate proportions on all walls!
 */
function createWallBoxGeometry(w, h, d, isZAxis = false, reverseU = false) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // v is normalized to 3.8m full wall height (0.0 at floor, 1.0 at ceiling)
    const v = (y + h / 2) / 3.8;

    // u is normalized so 1.0 repeat = exactly 4.0m horizontally
    let horiz = isZAxis ? (z + d / 2) : (x + w / 2);
    if (reverseU) {
      horiz = (isZAxis ? d : w) - horiz;
    }
    const u = horiz / 4.0;

    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Procedural Enterprise 42U Server Cabinet Textures (1024x2048).
 * Generates high-resolution Diffuse Map and Emissive Map inspired by Dell PowerEdge and Cisco Nexus racks.
 * Precision enterprise-scale SMD LED light guides with clean, harmonized illumination.
 */
function createServerCabinetTextures() {
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = 1024;
  diffCanvas.height = 2048;
  const dCtx = diffCanvas.getContext('2d');

  const emisCanvas = document.createElement('canvas');
  emisCanvas.width = 1024;
  emisCanvas.height = 2048;
  const eCtx = emisCanvas.getContext('2d');

  // 1. Base dark anodized gunmetal cabinet bezel (#14171e)
  dCtx.fillStyle = '#14171e';
  dCtx.fillRect(0, 0, 1024, 2048);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 1024, 2048);

  // Helper: Draw Precision Clean Enterprise SMD LED Light Guide
  const drawSMDLed = (x, y, w = 7, h = 3.5, type = 'green') => {
    const cx = x + w / 2;
    const cy = y + h / 2;

    let bodyCol = '#10b981'; // Enterprise Emerald
    let coreCol = '#a7f3d0'; // Crisp mint highlight
    let haloCol = 'rgba(0, 240, 64, 0.25)';
    let emisCol = '#00f040'; // Pure zero-blue emerald

    if (type === 'amber') {
      bodyCol = '#f59e0b';
      coreCol = '#fde68a';
      haloCol = 'rgba(245, 158, 11, 0.25)';
      emisCol = '#ffaa00'; // Pure zero-blue amber
    } else if (type === 'red') {
      bodyCol = '#ef4444';
      coreCol = '#fca5a5';
      haloCol = 'rgba(239, 68, 68, 0.28)';
      emisCol = '#ff2222'; // Pure zero-blue red
    }

    // --- 1. Diffuse Map (map) ---
    // Recessed dark bezel housing (1px frame)
    dCtx.fillStyle = '#0a0e14';
    dCtx.fillRect(x - 1, y - 1, w + 2, h + 2);

    // Outer precision LED body
    dCtx.fillStyle = bodyCol;
    dCtx.fillRect(x, y, w, h);

    // Inner bright core highlight (adds physical depth and realism)
    if (w >= 4 && h >= 2.5) {
      dCtx.fillStyle = coreCol;
      dCtx.fillRect(x + 1, y + 0.5, w - 2, h - 1);
    }

    // --- 2. Emissive Map (emissiveMap) ---
    // Tight 1.5px soft edge for distance mipmap retention without bleeding or blur
    const haloPad = 1.5;
    const grad = eCtx.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.max(w, h) * 0.5 + haloPad);
    grad.addColorStop(0, haloCol);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    eCtx.fillStyle = grad;
    eCtx.fillRect(x - haloPad, y - haloPad, w + haloPad * 2, h + haloPad * 2);

    // Solid crisp LED core on emissiveMap
    eCtx.fillStyle = emisCol;
    eCtx.fillRect(x, y, w, h);
  };

  // Helper: Draw OLED iDRAC telemetry display strip (High-Definition Cybernetic Readout)
  const drawOLEDTelemetry = (x, y, w, h, line1, line2, barVal = 0.7) => {
    // Bezel & deep obsidian OLED panel
    dCtx.fillStyle = '#1e293b';
    dCtx.fillRect(x, y, w, h);
    dCtx.fillStyle = '#030712';
    dCtx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);

    // Subtle glossy reflection streak
    const grad = dCtx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.01)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
    dCtx.fillStyle = grad;
    dCtx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);

    // High-definition Consolas typography: razor-sharp, zero-glitch text
    const fontMetrics = 'bold 12px "Consolas", "Courier New", monospace';
    const fontSub = 'bold 10px "Consolas", "Courier New", monospace';

    // Cyan micro-telemetry text
    dCtx.font = fontMetrics;
    dCtx.fillStyle = '#00e5ff';
    dCtx.fillText(line1, x + 12, y + 22);

    dCtx.font = fontSub;
    dCtx.fillStyle = '#38bdf8';
    dCtx.fillText(line2, x + 12, y + 38);

    // Segmented resource bar: clean, bold tactical segments
    const segCount = 10;
    const segW = 18;
    const segH = 10;
    const segY = y + 48;
    for (let i = 0; i < segCount; i++) {
      const segX = x + 12 + i * (segW + 3);
      const active = (i / segCount) < barVal;
      dCtx.fillStyle = active ? '#00e5ff' : '#0a1d2e';
      dCtx.fillRect(segX, segY, segW, segH);
      if (active) {
        dCtx.fillStyle = '#a5f3fc';
        dCtx.fillRect(segX + 2, segY + 2, segW - 4, 2);
      }
    }

    // Emissive Map: Only paint glowing Cyan elements -> steady, razor-sharp OLED readout!
    eCtx.font = fontMetrics;
    eCtx.fillStyle = '#00e5ff';
    eCtx.fillText(line1, x + 12, y + 22);

    eCtx.font = fontSub;
    eCtx.fillStyle = '#00e5ff';
    eCtx.fillText(line2, x + 12, y + 38);

    for (let i = 0; i < segCount; i++) {
      if ((i / segCount) < barVal) {
        const segX = x + 12 + i * (segW + 3);
        eCtx.fillStyle = '#00e5ff';
        eCtx.fillRect(segX, segY, segW, segH);
      }
    }
  };

  // Helper: Honeycomb air-intake mesh
  const drawHoneycombMesh = (x, y, w, h) => {
    dCtx.fillStyle = '#090d14';
    dCtx.fillRect(x, y, w, h);

    dCtx.fillStyle = '#1e293b';
    const rad = 2.4;
    const stepX = 7.5;
    const stepY = 6.5;
    for (let py = y + 3; py < y + h - 3; py += stepY) {
      const rowOffset = ((Math.floor((py - y) / stepY) % 2) === 1) ? stepX / 2 : 0;
      for (let px = x + 3 + rowOffset; px < x + w - 3; px += stepX) {
        dCtx.beginPath();
        dCtx.arc(px, py, rad, 0, Math.PI * 2);
        dCtx.fill();
      }
    }
  };

  // Helper: Vertical bundled patch cable routing into side cable ducts
  const drawPatchCable = (startX, startY, toRight = true, col = '#0284c7') => {
    const endX = toRight ? (910 + (startX % 17)) : (90 + (startX % 17));
    const endY = startY + 50 + (startX % 25);
    const ctrl1X = startX + (toRight ? 30 : -30);
    const ctrl1Y = startY + 40;
    const ctrl2X = endX + (toRight ? -15 : 15);
    const ctrl2Y = endY - 20;

    // Drop shadow
    dCtx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    dCtx.lineWidth = 4;
    dCtx.beginPath();
    dCtx.moveTo(startX + 1, startY + 2);
    dCtx.bezierCurveTo(ctrl1X + 1, ctrl1Y + 2, ctrl2X + 1, ctrl2Y + 2, endX + 1, endY + 2);
    dCtx.stroke();

    // Cable body
    dCtx.strokeStyle = col;
    dCtx.lineWidth = 3;
    dCtx.beginPath();
    dCtx.moveTo(startX, startY);
    dCtx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, endX, endY);
    dCtx.stroke();

    // Cable highlight
    dCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    dCtx.lineWidth = 1;
    dCtx.beginPath();
    dCtx.moveTo(startX, startY);
    dCtx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, endX, endY);
    dCtx.stroke();
  };

  // 2. Top Exhaust Header (Y: 0 to 48)
  dCtx.fillStyle = '#11151d';
  dCtx.fillRect(0, 0, 1024, 48);
  dCtx.fillStyle = '#080a0f';
  for (let y = 10; y < 42; y += 9) {
    for (let x = 84; x < 940; x += 14) {
      dCtx.beginPath();
      dCtx.arc(x, y, 2.2, 0, Math.PI * 2);
      dCtx.fill();
    }
  }
  dCtx.fillStyle = '#64748b';
  dCtx.font = 'bold 10px "Consolas", "Courier New", monospace';
  dCtx.fillText('ENTERPRISE 42U HIGH-DENSITY CABINET // ZONE-DC // DELL POWEREDGE', 84, 44);
  dCtx.strokeStyle = '#273142';
  dCtx.lineWidth = 1.5;
  dCtx.beginPath();
  dCtx.moveTo(0, 48);
  dCtx.lineTo(1024, 48);
  dCtx.stroke();

  // 3. EIA-310 Mounting Rails (Left: X = 16..76, Right: X = 948..1008, Y: 48 to 1988)
  dCtx.fillStyle = '#222733';
  dCtx.fillRect(16, 48, 60, 1940);
  dCtx.fillRect(948, 48, 60, 1940);

  // Rail inner edges
  dCtx.strokeStyle = '#333c4d';
  dCtx.lineWidth = 1.5;
  dCtx.beginPath();
  dCtx.moveTo(76, 48); dCtx.lineTo(76, 1988);
  dCtx.moveTo(948, 48); dCtx.lineTo(948, 1988);
  dCtx.stroke();

  const totalUnits = 42;
  const uHeight = 1940 / totalUnits; // 46.19px per 1U
  for (let u = totalUnits; u >= 1; u--) {
    const uIdx = totalUnits - u;
    const uY = 48 + uIdx * uHeight;

    // 3 Square cage nut holes per 1U
    const holeFracs = [0.22, 0.50, 0.78];
    for (const hf of holeFracs) {
      const hy = uY + uHeight * hf;
      // Left rail hole
      dCtx.fillStyle = '#090d14';
      dCtx.fillRect(36, hy - 3.5, 7, 7);
      dCtx.strokeStyle = '#181f2b';
      dCtx.lineWidth = 1;
      dCtx.strokeRect(36, hy - 3.5, 7, 7);

      // Right rail hole
      dCtx.fillStyle = '#090d14';
      dCtx.fillRect(980, hy - 3.5, 7, 7);
      dCtx.strokeRect(980, hy - 3.5, 7, 7);
    }

    // Silver mounting screws on mounted hardware ears
    const hasScrew = (u % 2 === 0);
    if (hasScrew) {
      const sy = uY + uHeight * 0.50;
      for (const sx of [39.5, 983.5]) {
        dCtx.fillStyle = '#94a3b8';
        dCtx.beginPath();
        dCtx.arc(sx, sy, 4.5, 0, Math.PI * 2);
        dCtx.fill();
        dCtx.strokeStyle = '#1e293b';
        dCtx.lineWidth = 1;
        dCtx.beginPath();
        dCtx.moveTo(sx - 3, sy); dCtx.lineTo(sx + 3, sy);
        dCtx.moveTo(sx, sy - 3); dCtx.lineTo(sx, sy + 3);
        dCtx.stroke();
      }
    }

    // Unit numbers (42, 40, 38, ... 02) printed along rail edge
    if (u % 2 === 0) {
      const uStr = (u < 10 ? '0' : '') + u;
      dCtx.font = 'bold 9px monospace';
      dCtx.fillStyle = '#94a3b8';
      dCtx.fillText(uStr, 54, uY + uHeight * 0.55);
      dCtx.fillText(uStr, 960, uY + uHeight * 0.55);
    }
  }

  // 4. TOP TIER (42U–39U, Y: 48 to 234) — 48-Port Switches & Fiber Uplinks
  // Switch 1: 42U-41U (2U, Y: 48 to 140, Height = 92px)
  dCtx.fillStyle = '#181d26';
  dCtx.fillRect(76, 48, 872, 92);
  dCtx.strokeStyle = '#2d3748';
  dCtx.lineWidth = 1;
  dCtx.strokeRect(76.5, 48.5, 871, 91);

  dCtx.font = 'bold 11px "Consolas", "Courier New", monospace';
  dCtx.fillStyle = '#94a3b8';
  dCtx.fillText('CISCO NEXUS 9300-GX // 48x1G + 4x10G SFP+', 86, 68);

  // Status LEDs on left: Clean rectangular light guides (7px x 3.5px)
  drawSMDLed(86, 76, 7, 3.5, 'green');
  drawSMDLed(98, 76, 7, 3.5, 'green');
  drawSMDLed(110, 76, 7, 3.5, 'amber');

  // Port metal frame & dark cavity background
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 24; col++) {
      const px = 130 + col * 25;
      const py = 76 + row * 24;

      dCtx.fillStyle = '#080a0f';
      dCtx.fillRect(px, py, 21, 15);
      dCtx.strokeStyle = '#475569';
      dCtx.lineWidth = 1;
      dCtx.strokeRect(px, py, 21, 15);

      dCtx.fillStyle = '#d97706';
      dCtx.fillRect(px + 4, py + 2, 13, 2);
    }
  }

  // Harmonized port-group status indicators (6px x 3px) across switch rows
  for (let g = 0; g < 16; g++) {
    const lx = 138 + g * 36;
    const isAmberRow0 = (g % 5 === 2);
    drawSMDLed(lx, 68, 6, 3, isAmberRow0 ? 'amber' : 'green');
    const isAmberRow1 = (g % 6 === 1);
    drawSMDLed(lx, 92, 6, 3, isAmberRow1 ? 'amber' : 'green');
  }

  // 4 SFP+ Fiber Transceiver Cages (X = 760 to 860)
  for (let s = 0; s < 4; s++) {
    const sx = 760 + s * 26;
    dCtx.fillStyle = '#475569';
    dCtx.fillRect(sx, 76, 22, 28);
    dCtx.fillStyle = '#06b6d4'; // Cyan transceiver latch
    dCtx.fillRect(sx + 4, 88, 14, 12);
    dCtx.fillStyle = '#080a0f';
    dCtx.fillRect(sx + 6, 78, 10, 8);
    // Clean fiber link LED
    drawSMDLed(sx + 7, 68, 7, 3.5, 'green');
  }

  // Bundled patch cables routing into side channels
  const cableCols1 = ['#0284c7', '#10b981', '#f59e0b', '#dc2626'];
  for (let c = 0; c < 24; c += 2) {
    const startX = 130 + c * 25 + 10;
    const startY = 96;
    drawPatchCable(startX, startY, c >= 12, cableCols1[c % cableCols1.length]);
  }

  // Switch 2: 40U-39U (2U, Y: 140 to 234, Height = 94px)
  dCtx.fillStyle = '#151b24';
  dCtx.fillRect(76, 140, 872, 94);
  dCtx.strokeStyle = '#273142';
  dCtx.lineWidth = 1;
  dCtx.strokeRect(76.5, 140.5, 871, 93);

  dCtx.font = 'bold 11px "Consolas", "Courier New", monospace';
  dCtx.fillStyle = '#94a3b8';
  dCtx.fillText('CORE-AGGREGATION-02 // GIGABIT FABRIC SWITCH', 86, 160);

  // Status LEDs (7px x 3.5px)
  drawSMDLed(86, 168, 7, 3.5, 'green');
  drawSMDLed(98, 168, 7, 3.5, 'green');
  drawSMDLed(110, 168, 7, 3.5, 'amber');

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 24; col++) {
      const px = 130 + col * 25;
      const py = 168 + row * 24;

      dCtx.fillStyle = '#080a0f';
      dCtx.fillRect(px, py, 21, 15);
      dCtx.strokeStyle = '#475569';
      dCtx.lineWidth = 1;
      dCtx.strokeRect(px, py, 21, 15);

      dCtx.fillStyle = '#d97706';
      dCtx.fillRect(px + 4, py + 2, 13, 2);
    }
  }

  // Harmonized port-group status indicators (6px x 3px)
  for (let g = 0; g < 16; g++) {
    const lx = 138 + g * 36;
    const isAmberRow0 = (g % 4 === 1);
    drawSMDLed(lx, 160, 6, 3, isAmberRow0 ? 'amber' : 'green');
    const isAmberRow1 = (g % 5 === 3);
    drawSMDLed(lx, 184, 6, 3, isAmberRow1 ? 'amber' : 'green');
  }

  // SFP+ Cages on Switch 2
  for (let s = 0; s < 4; s++) {
    const sx = 760 + s * 26;
    dCtx.fillStyle = '#475569';
    dCtx.fillRect(sx, 168, 22, 28);
    dCtx.fillStyle = '#06b6d4';
    dCtx.fillRect(sx + 4, 180, 14, 12);
    dCtx.fillStyle = '#080a0f';
    dCtx.fillRect(sx + 6, 170, 10, 8);
    drawSMDLed(sx + 7, 160, 7, 3.5, 'green');
  }

  // Patch cables for Switch 2
  const cableCols2 = ['#2563eb', '#eab308', '#10b981', '#06b6d4'];
  for (let c = 1; c < 24; c += 2) {
    const startX = 130 + c * 25 + 10;
    const startY = 188;
    drawPatchCable(startX, startY, c < 12, cableCols2[c % cableCols2.length]);
  }

  // Cable management channel tie-wraps on sides
  dCtx.fillStyle = '#0a0d14';
  dCtx.fillRect(76, 48, 16, 186);
  dCtx.fillRect(932, 48, 16, 186);
  for (let vy = 70; vy < 230; vy += 36) {
    dCtx.fillStyle = '#1e293b';
    dCtx.fillRect(76, vy, 16, 8);
    dCtx.fillRect(932, vy, 16, 8);
  }

  // 5. UPPER COMPUTE TIER (38U–23U, Y: 234 to 974, Height = 740px)
  // 8x 2U PowerEdge-style servers, each ~92.5px
  const telemetryData = [
    { line1: '21.4°C | 480W | HEALTHY', line2: 'iDRAC9 ENTERPRISE // NVMe RAID-10', bar: 0.85 },
    { line1: '19.8°C | 420W | OPTIMAL', line2: 'STORAGE-ARRAY-01 // ZFS POOL OK', bar: 0.65 },
    { line1: '23.1°C | 620W | ACTIVE',  line2: 'HYPERVISOR CLUSTER // NODE-03',  bar: 0.90 },
    { line1: '20.2°C | 510W | HEALTHY', line2: 'DATABASE MASTER // POSTGRES-01', bar: 0.70 },
    { line1: '18.5°C | 390W | OPTIMAL', line2: 'KUBERNETES WORKER // POD-POOL-07', bar: 0.55 },
    { line1: '22.0°C | 580W | ACTIVE',  line2: 'BACKUP VAULT // CEPH REPLICA',   bar: 0.80 },
    { line1: '20.9°C | 520W | HEALTHY', line2: 'GPU INFERENCE NODE // 4x A100',  bar: 0.75 },
    { line1: '19.4°C | 440W | OPTIMAL', line2: 'ANALYTICS PIPELINE // SPARK-02', bar: 0.60 }
  ];

  const serverCount = 8;
  const s2UH = 740 / serverCount; // 92.5px
  for (let s = 0; s < serverCount; s++) {
    const sY = 234 + s * s2UH;

    // Server chassis faceplate
    dCtx.fillStyle = '#1a202c';
    dCtx.fillRect(76, sY, 872, s2UH);
    dCtx.strokeStyle = '#334155';
    dCtx.lineWidth = 1;
    dCtx.strokeRect(76.5, sY + 0.5, 871, s2UH - 1);

    // Left rack ear: silver pull handle + power button
    dCtx.fillStyle = '#94a3b8';
    dCtx.fillRect(80, sY + 12, 6, s2UH - 24);
    dCtx.strokeStyle = '#475569';
    dCtx.strokeRect(80, sY + 12, 6, s2UH - 24);

    // Power & ID button: Clean rectangular light pipe (8px x 4.5px)
    drawSMDLed(86, sY + 20, 8, 4.5, 'green');
    dCtx.fillStyle = '#38bdf8';
    dCtx.beginPath();
    dCtx.arc(90, sY + 36, 2.8, 0, Math.PI * 2);
    dCtx.fill();

    // 10 Hot-Swap 2.5" NVMe Drive Caddies across X = 104 to 684
    const caddyCount = 10;
    const caddyW = 54;
    const caddyGap = 4;
    const caddyH = 74;
    for (let c = 0; c < caddyCount; c++) {
      const cx = 104 + c * (caddyW + caddyGap);
      const cy = sY + 9;

      // Caddy frame
      dCtx.fillStyle = '#1e2634';
      dCtx.fillRect(cx, cy, caddyW, caddyH);
      dCtx.strokeStyle = '#374151';
      dCtx.lineWidth = 1;
      dCtx.strokeRect(cx + 0.5, cy + 0.5, caddyW - 1, caddyH - 1);

      // Brushed dark aluminum handle
      dCtx.fillStyle = '#283243';
      dCtx.fillRect(cx + 4, cy + 6, caddyW - 18, 16);
      dCtx.strokeStyle = '#4b5563';
      dCtx.strokeRect(cx + 4.5, cy + 6.5, caddyW - 19, 15);

      // Micro-ventilation slots
      dCtx.fillStyle = '#0b0f16';
      for (let vy = cy + 26; vy < cy + 54; vy += 3.5) {
        dCtx.fillRect(cx + 6, vy, caddyW - 22, 1.8);
      }

      // Capacity label badge (clean, high-contrast, razor-sharp Consolas)
      dCtx.fillStyle = '#080d17';
      dCtx.fillRect(cx + 4, cy + 49, 38, 14);
      dCtx.strokeStyle = '#273444';
      dCtx.lineWidth = 1;
      dCtx.strokeRect(cx + 4.5, cy + 49.5, 37, 13);

      dCtx.fillStyle = '#38bdf8';
      dCtx.font = 'bold 8.5px "Consolas", "Courier New", monospace';
      const capLabels = ['3.8TB', '7.6TB', '15TB', 'NVMe'];
      dCtx.fillText(capLabels[(s + c) % capLabels.length], cx + 7, cy + 59.5);

      // Colored release latch tab (crimson or cobalt)
      const isCrimson = ((s + c) % 2 === 0);
      dCtx.fillStyle = isCrimson ? '#dc2626' : '#2563eb';
      dCtx.fillRect(cx + 6, cy + caddyH - 8, 18, 5);
      dCtx.fillStyle = '#374151';
      dCtx.fillRect(cx + 28, cy + caddyH - 8, caddyW - 36, 5);

      // Two precision rectangular LED light-pipes (7px wide x 3.5px tall) on right edge
      const ledX = cx + caddyW - 10;
      // Power LED (Green)
      drawSMDLed(ledX, cy + 12, 7, 3.5, 'green');
      // Activity LED (Amber, Green, or Red)
      const isCrimsonAct = ((s + c) % 6 === 5);
      const isActAmber = ((s * 3 + c) % 3 === 1);
      const actType = isCrimsonAct ? 'red' : (isActAmber ? 'amber' : 'green');
      drawSMDLed(ledX, cy + 24, 7, 3.5, actType);
    }

    // Right Ear: Dark-Glass OLED iDRAC Telemetry Strip (X = 696 to 936, W = 240, H = 72)
    const tData = telemetryData[s % telemetryData.length];
    drawOLEDTelemetry(696, sY + 10, 240, 72, tData.line1, tData.line2, tData.bar);
  }

  // 6. MID TIER (22U–9U, Y: 974 to 1618, Height = 644px)
  // 14x 1U High-Density Compute Blades, each 46px
  const blade1UCount = 14;
  const b1UH = 644 / blade1UCount; // 46px
  for (let b = 0; b < blade1UCount; b++) {
    const bY = 974 + b * b1UH;

    // Faceplate
    dCtx.fillStyle = '#171e28';
    dCtx.fillRect(76, bY, 872, b1UH);
    dCtx.strokeStyle = '#2d3848';
    dCtx.lineWidth = 1;
    dCtx.strokeRect(76.5, bY + 0.5, 871, b1UH - 1);

    // Left and right silver pull handles
    dCtx.fillStyle = '#64748b';
    dCtx.fillRect(80, bY + 8, 5, b1UH - 16);
    dCtx.fillRect(939, bY + 8, 5, b1UH - 16);

    // Hexagonal honeycomb intake mesh (X = 96 to 576)
    drawHoneycombMesh(96, bY + 6, 480, b1UH - 12);

    // White barcode asset sticker
    const barX = 590;
    const barY = bY + 10;
    const barW = 86;
    const barH = b1UH - 20;
    dCtx.fillStyle = '#f1f5f9';
    dCtx.fillRect(barX, barY, barW, barH);
    dCtx.fillStyle = '#0f172a';
    for (let bx = barX + 6; bx < barX + barW - 6; bx += 3) {
      if (bx % 5 !== 0) {
        dCtx.fillRect(bx, barY + 3, (bx % 4 === 0) ? 2 : 1, barH - 11);
      }
    }
    dCtx.font = 'bold 8px "Consolas", "Courier New", monospace';
    dCtx.fillText(`SRV-${8420 + b * 17}`, barX + 8, barY + barH - 3);

    // 4 Precision status light indicators (9px wide x 4px tall) spaced 24px center-to-center
    const clusterX = 690;
    const labels = ['PWR', 'NIC', 'SSD', 'ALM'];
    dCtx.font = 'bold 8px "Consolas", "Courier New", monospace';
    for (let li = 0; li < 4; li++) {
      const lx = clusterX + li * 24;
      dCtx.fillStyle = '#94a3b8';
      dCtx.fillText(labels[li], lx, bY + 15);

      let ledType = 'green';
      if (li === 2) ledType = 'amber';
      if (li === 3) ledType = (b % 5 === 0) ? 'red' : 'green';

      drawSMDLed(lx, bY + 21, 9, 4, ledType);
    }

    // Maintenance I/O ports (USB + VGA)
    const portX = 820;
    dCtx.fillStyle = '#0b0f16';
    dCtx.fillRect(portX, bY + 12, 42, b1UH - 24);
    dCtx.strokeStyle = '#334155';
    dCtx.strokeRect(portX, bY + 12, 42, b1UH - 24);
    dCtx.fillStyle = '#0284c7';
    dCtx.fillRect(portX + 6, bY + 16, 12, 6);
    dCtx.fillRect(portX + 24, bY + 16, 12, 6);

    dCtx.fillStyle = '#0284c7';
    dCtx.fillRect(portX + 54, bY + 14, 22, 14);
    dCtx.fillStyle = '#050b14';
    dCtx.fillRect(portX + 56, bY + 16, 18, 10);
  }

  // 7. LOWER COMPUTE TIER (8U–5U, Y: 1618 to 1802, Height = 184px)
  // 4U High-Density Storage / GPU Accelerator Array
  dCtx.fillStyle = '#131822';
  dCtx.fillRect(76, 1618, 872, 184);
  dCtx.strokeStyle = '#2b3547';
  dCtx.lineWidth = 1.5;
  dCtx.strokeRect(76.5, 1618.5, 871, 183);

  // Left: 4 Large Circular Fan Grilles
  const fanRadius = 26;
  for (let f = 0; f < 4; f++) {
    const fx = 135 + f * 78;
    const fy = 1618 + 92;

    dCtx.fillStyle = '#070a10';
    dCtx.beginPath();
    dCtx.arc(fx, fy, fanRadius, 0, Math.PI * 2);
    dCtx.fill();

    dCtx.strokeStyle = '#334155';
    dCtx.lineWidth = 1.2;
    for (let r = 8; r <= fanRadius; r += 7) {
      dCtx.beginPath();
      dCtx.arc(fx, fy, r, 0, Math.PI * 2);
      dCtx.stroke();
    }

    dCtx.fillStyle = '#1e2532';
    dCtx.beginPath();
    dCtx.arc(fx, fy, 7, 0, Math.PI * 2);
    dCtx.fill();

    drawSMDLed(fx - 4, fy - fanRadius - 8, 8, 4, (f === 2) ? 'amber' : 'green');
  }

  // Right: 3x4 SAS 3.5" Drive Matrix
  const bayStartX = 470;
  const bayW = 92;
  const bayH = 46;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const bx = bayStartX + c * (bayW + 12);
      const by = 1618 + 14 + r * (bayH + 8);
      dCtx.fillStyle = '#1e2430';
      dCtx.fillRect(bx, by, bayW, bayH);
      dCtx.strokeStyle = '#334155';
      dCtx.strokeRect(bx, by, bayW, bayH);

      dCtx.fillStyle = '#2b3648';
      dCtx.fillRect(bx + 4, by + 4, bayW - 8, 12);

      drawSMDLed(bx + bayW - 11, by + 18, 7, 3.5, ((r + c) % 3 === 0) ? 'amber' : 'green');
      drawSMDLed(bx + bayW - 11, by + 26, 7, 3.5, 'green');
    }
  }

  dCtx.font = 'bold 11px "Consolas", "Courier New", monospace';
  dCtx.fillStyle = '#94a3b8';
  dCtx.fillText('SAN STORAGE BLADE 6000 // 24x 18TB SAS // 432TB RAW // HIGH-THROUGHPUT', 470, 1618 + 172);

  // 8. BOTTOM TIER (4U–1U, Y: 1802 to 1988, Height = 186px) — Enterprise Rackmount UPS & PDU
  dCtx.fillStyle = '#111620';
  dCtx.fillRect(76, 1802, 872, 186);
  dCtx.strokeStyle = '#273142';
  dCtx.lineWidth = 1.5;
  dCtx.strokeRect(76.5, 1802.5, 871, 185);

  // Left master breaker levers
  dCtx.fillStyle = '#1e2533';
  dCtx.fillRect(96, 1802 + 25, 120, 136);
  dCtx.fillStyle = '#dc2626'; // Red master cutoff
  dCtx.fillRect(116, 1802 + 45, 24, 40);
  dCtx.fillStyle = '#10b981'; // Green toggle
  dCtx.fillRect(160, 1802 + 45, 24, 40);
  dCtx.font = 'bold 9px "Consolas", "Courier New", monospace';
  dCtx.fillStyle = '#94a3b8';
  dCtx.fillText('MAIN PDU-A', 104, 1802 + 115);

  // High-voltage warning badge
  const badgeX = 240;
  const badgeY = 1802 + 35;
  dCtx.fillStyle = '#1e2430';
  dCtx.fillRect(badgeX, badgeY, 180, 80);
  dCtx.strokeStyle = '#eab308';
  dCtx.lineWidth = 2;
  dCtx.strokeRect(badgeX, badgeY, 180, 80);

  // Yellow warning triangle
  dCtx.fillStyle = '#eab308';
  dCtx.beginPath();
  dCtx.moveTo(badgeX + 24, badgeY + 60);
  dCtx.lineTo(badgeX + 44, badgeY + 22);
  dCtx.lineTo(badgeX + 64, badgeY + 60);
  dCtx.closePath();
  dCtx.fill();
  dCtx.fillStyle = '#000000';
  dCtx.font = 'bold 16px sans-serif';
  dCtx.fillText('!', badgeX + 41, badgeY + 54);

  dCtx.fillStyle = '#eab308';
  dCtx.font = 'bold 11px "Consolas", "Courier New", monospace';
  dCtx.fillText('WARNING: 400V', badgeX + 74, badgeY + 38);
  dCtx.fillStyle = '#f8fafc';
  dCtx.font = 'bold 9px "Consolas", "Courier New", monospace';
  dCtx.fillText('3-PHASE 16kVA PDU', badgeX + 74, badgeY + 52);
  dCtx.fillText('DUAL-FEED REDUNDANT', badgeX + 74, badgeY + 65);

  // Glowing Cyan/Emerald battery load meter window (X = 450 to 920, Y = 1827, W = 470, H = 136)
  const meterX = 450;
  const meterY = 1802 + 25;
  const meterW = 470;
  const meterH = 136;

  dCtx.fillStyle = '#050a12';
  dCtx.fillRect(meterX, meterY, meterW, meterH);
  dCtx.strokeStyle = '#1e293b';
  dCtx.lineWidth = 1.5;
  dCtx.strokeRect(meterX, meterY, meterW, meterH);

  // Meter telemetry strings (Consolas High-Definition)
  const upsLine1 = 'ONLINE // 98% LOAD // 230V // 12.4A // 50.0Hz';
  const upsLine2 = 'UPS-BATTERY-PACK-A [NORMAL] // RUNTIME: 42 MIN';
  dCtx.font = 'bold 13px "Consolas", "Courier New", monospace';
  dCtx.fillStyle = '#00e5ff';
  dCtx.fillText(upsLine1, meterX + 16, meterY + 30);
  dCtx.font = 'bold 10px "Consolas", "Courier New", monospace';
  dCtx.fillStyle = '#38bdf8';
  dCtx.fillText(upsLine2, meterX + 16, meterY + 50);

  // 16-Segment horizontal load bar
  const barSegW = 22;
  const barSegH = 28;
  const barSegY = meterY + 62;
  for (let i = 0; i < 16; i++) {
    const bsX = meterX + 16 + i * (barSegW + 5);
    const isLit = (i < 14);
    dCtx.fillStyle = isLit ? '#00e5ff' : '#082030';
    dCtx.fillRect(bsX, barSegY, barSegW, barSegH);
  }

  // Emissive Map for UPS: Pure Cyan (B > 160, R < 40) -> 100% steady glow!
  eCtx.font = 'bold 13px "Consolas", "Courier New", monospace';
  eCtx.fillStyle = '#00e5ff';
  eCtx.fillText(upsLine1, meterX + 16, meterY + 30);
  eCtx.font = 'bold 10px "Consolas", "Courier New", monospace';
  eCtx.fillStyle = '#00e5ff';
  eCtx.fillText(upsLine2, meterX + 16, meterY + 50);

  for (let i = 0; i < 14; i++) {
    const bsX = meterX + 16 + i * (barSegW + 5);
    eCtx.fillStyle = '#00e5ff';
    eCtx.fillRect(bsX, barSegY, barSegW, barSegH);
  }

  // 9. Bottom Intake Grille (Y: 1988 to 2048)
  dCtx.fillStyle = '#0a0d13';
  dCtx.fillRect(0, 1988, 1024, 60);
  dCtx.strokeStyle = '#273142';
  dCtx.lineWidth = 1.5;
  dCtx.strokeRect(0, 1988, 1024, 60);

  dCtx.fillStyle = '#1e2430';
  for (let gy = 1996; gy < 2042; gy += 7) {
    dCtx.fillRect(80, gy, 864, 3);
  }

  // 10. Create and configure Three.js CanvasTextures
  const diffuseTexture = new THREE.CanvasTexture(diffCanvas);
  diffuseTexture.colorSpace = THREE.SRGBColorSpace;
  diffuseTexture.anisotropy = 8;
  diffuseTexture.needsUpdate = true;

  const emissiveTexture = new THREE.CanvasTexture(emisCanvas);
  emissiveTexture.colorSpace = THREE.SRGBColorSpace;
  emissiveTexture.anisotropy = 8;
  emissiveTexture.needsUpdate = true;

  return { diffuseTexture, emissiveTexture };
}

/**
 * Procedural 4-in-1 Monitor Screen Atlas (512x256).
 * High-contrast, crystal clear, un-mirrored screen visuals.
 */
function createMonitorScreenAtlasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // --- 1. SYSTEM DASHBOARD (Top-Left: 0, 0 to 256, 128) ---
  ctx.fillStyle = '#0a101d';
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 20);
  // Window dots
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(12, 10, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(24, 10, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(36, 10, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#cbd5e1'; ctx.font = 'bold 9px monospace'; ctx.fillText('ops-dashboard // live', 52, 13);

  // Status meters
  ctx.fillStyle = '#00ff66'; ctx.font = 'bold 10px monospace'; ctx.fillText('● CLUSTER 01: HEALTHY (99.9%)', 12, 36);
  ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 9px monospace';
  ctx.fillText('CPU [████████░░] 78%', 12, 50);
  ctx.fillText('RAM [██████░░░░] 61%', 12, 63);
  ctx.fillText('NET: 42.8 Gbps ▲ 18.1 Gbps ▼', 12, 76);

  // Terminal lines
  ctx.fillStyle = '#6ee7b7'; ctx.font = '8px monospace';
  ctx.fillText('> tail -f /var/log/datacenter.log', 12, 92);
  ctx.fillText('> [OK] 42U blades synced (0.8ms)', 12, 103);
  ctx.fillText('> live telemetry active █', 12, 114);

  // Sparkline wave graph
  ctx.strokeStyle = '#00ff66';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(170, 75);
  ctx.lineTo(190, 70);
  ctx.lineTo(205, 52);
  ctx.lineTo(220, 78);
  ctx.lineTo(235, 45);
  ctx.lineTo(250, 60);
  ctx.stroke();

  // --- 2. CRITICAL ALERT / SERVER DOWN (Top-Right: 256, 0 to 512, 128) ---
  ctx.fillStyle = '#260808';
  ctx.fillRect(256, 0, 256, 128);

  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 5;
  ctx.strokeRect(258, 2, 252, 124);

  ctx.fillStyle = '#fee2e2';
  ctx.font = '900 13px sans-serif';
  ctx.fillText('⚠️ CRITICAL PACKET LOSS ⚠️', 270, 24);

  // Spiky red ping chart
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(270, 80);
  ctx.lineTo(310, 75);
  ctx.lineTo(340, 82);
  ctx.lineTo(370, 36);
  ctx.lineTo(390, 90);
  ctx.lineTo(420, 28);
  ctx.lineTo(460, 30);
  ctx.lineTo(495, 78);
  ctx.stroke();

  // Alert box
  ctx.fillStyle = '#3f1010';
  ctx.fillRect(268, 86, 232, 34);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(268, 86, 232, 34);

  ctx.fillStyle = '#fef2f2';
  ctx.font = 'bold 9px monospace';
  ctx.fillText('DDOS DETECTED // PORT 443 OVERLOAD', 274, 99);
  ctx.fillStyle = '#fca5a5';
  ctx.fillText('DROP RATE: 94.2%  FAILOVER: ACTIVE', 274, 112);

  // --- 3. CLASSIC BSOD (Bottom-Left: 0, 128 to 256, 256) ---
  ctx.fillStyle = '#0066cc';
  ctx.fillRect(0, 128, 256, 128);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(':(', 16, 175);

  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('Your PC ran into a problem and needs', 16, 196);
  ctx.fillText('to restart. We are collecting error info.', 16, 209);
  ctx.fillText('100% complete', 16, 222);

  // QR Code box
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(16, 230, 18, 18);
  ctx.fillStyle = '#0066cc';
  ctx.fillRect(19, 233, 4, 4);
  ctx.fillRect(27, 233, 4, 4);
  ctx.fillRect(23, 241, 4, 4);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 8px monospace';
  ctx.fillText('STOP: CRITICAL_PROCESS_DIED', 42, 242);

  // --- 4. CYBER SECURITY / MATRIX TERMINAL (Bottom-Right: 256, 128 to 512, 256) ---
  ctx.fillStyle = '#030c05';
  ctx.fillRect(256, 128, 256, 128);

  ctx.fillStyle = '#00ff66';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('CORE FIREWALL // INTRUSION BLOCKED', 270, 146);

  ctx.fillStyle = '#22c55e';
  ctx.font = '8px monospace';
  ctx.fillText('0x7FFF98A0 : 4C 89 E5 48 83 EC 20', 270, 164);
  ctx.fillText('0x7FFF98B0 : E8 24 FF FF FF 85 C0', 270, 178);
  ctx.fillText('0x7FFF98C0 : 74 12 48 8B 05 A1 3B', 270, 192);
  ctx.fillText('0x7FFF98D0 : 48 89 05 9A 3B 20 00', 270, 206);

  // Radar circle
  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(460, 210, 28, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(460, 210, 16, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#00ff66';
  ctx.beginPath(); ctx.moveTo(460, 210); ctx.lineTo(484, 196); ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural High-Resolution Shattered Broken LCD Panel Texture (1024x576 widescreen).
 * Replicating real LCD impact rupture and shattered tempered glass physics (image_62b79d.jpg):
 * 1. Deep black void canvas (#050507) with dead column driver patches (#020204, zero static)
 * 2. Subtle, desaturated vertical subpixel static (cyan-slate, wine-magenta, amber-brown, olive-green)
 * 3. Gritty monochrome film grain across dark regions (matte electronic LCD texture)
 * 4. Broad sweeping fracture arcs cutting across panel corners and borders
 * 5. Concentric elliptical tension rings with shockwave steps and bottom-right spallation teeth
 * 6. Branching spiderweb radial cracks with internal glass refraction double-traces
 * 7. Dense horizontal crystalline needle feathering spreading outward to left and right
 * 8. Brilliant pure-white pulverized crushed-glass impact core (cx ≈ 460, cy ≈ 295, radius ≈ 28px)
 * Supports variant = 1 and variant = 2 with varied impact centers and crack layouts for dual monitors!
 */
function createBrokenMonitorScreenTexture(variantIndex = 0) {
  const width = 1024;
  const height = 576;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Deterministic PRNG so every build is crisp, reproducible, and 100% original
  let seed = (variantIndex + 1) * 987654321;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const randRange = (min, max) => min + rand() * (max - min);

  // Impact focal coordinates (slightly shifted per variant)
  const cx = variantIndex % 2 === 0 ? 462 : 548;
  const cy = variantIndex % 2 === 0 ? 322 : 274;
  const dir = variantIndex % 2 === 0 ? 1 : -1;

  // ============================================================================
  // LAYER 1: PER-PIXEL IMAGEDATA SUBPIXEL INTERFERENCE CARPET & POLARIZER GRAIN
  // ============================================================================
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Precompute column-level LCD driver damage parameters
  const colType = new Uint8Array(width);
  const colAmp = new Float32Array(width);
  const colFreq1 = new Float32Array(width);
  const colFreq2 = new Float32Array(width);
  const colPhase1 = new Float32Array(width);
  const colPhase2 = new Float32Array(width);

  for (let x = 0; x < width; x++) {
    const r = rand();
    // 0: Dead/Dark, 1: Emerald-Green subpixel, 2: Crimson-Magenta, 3: Cobalt-Cyan, 4: Muted Amber
    colType[x] = r < 0.26 ? 0 : r < 0.50 ? 1 : r < 0.72 ? 2 : r < 0.90 ? 3 : 4;
    // Group columns into natural vertical interference clusters
    const clusterWave = 0.55 + 0.45 * Math.sin(x * 0.045) * Math.cos(x * 0.019);
    colAmp[x] = randRange(0.25, 1.0) * clusterWave;
    colFreq1[x] = randRange(0.035, 0.14);
    colFreq2[x] = randRange(0.16, 0.42);
    colPhase1[x] = randRange(0, Math.PI * 2);
    colPhase2[x] = randRange(0, Math.PI * 2);
  }

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;

      // Distance from primary impact cavity & right-hand fan cavity (dead liquid crystal shadow)
      const dx1 = (x - cx) / 145;
      const dy1 = (y - cy) / 135;
      const dist1 = dx1 * dx1 + dy1 * dy1;

      const dx2 = (x - (cx + dir * 135)) / 155;
      const dy2 = (y - cy) / 125;
      const dist2 = dx2 * dx2 + dy2 * dy2;

      // Ruptured crystal blackout mask (darkens the static inside the central fracture zone)
      const cavityMask1 = Math.min(1.0, Math.max(0.12, Math.pow(Math.min(dist1, 1.5) / 1.5, 1.35)));
      const cavityMask2 = Math.min(1.0, Math.max(0.18, Math.pow(Math.min(dist2, 1.5) / 1.5, 1.25)));
      const shadowMask = Math.min(cavityMask1, cavityMask2);

      // Vertical broken scanline packet modulation
      const wave1 = Math.sin(y * colFreq1[x] + colPhase1[x]);
      const wave2 = Math.cos(y * colFreq2[x] + colPhase2[x]);
      const packet = Math.max(0, wave1 * wave2);
      const intensity = packet * colAmp[x] * shadowMask;

      // Base matte polarizer grain (#07080a to #17191f)
      const grain = (rand() - 0.5) * 22;
      let r = 10 + grain;
      let g = 11 + grain;
      let b = 13 + grain;

      const t = colType[x];
      if (t === 1) {
        // Muted Emerald / Olive Subpixel Static
        r += intensity * 24;
        g += intensity * 112;
        b += intensity * 38;
      } else if (t === 2) {
        // Muted Crimson / Wine Magenta Subpixel Static
        r += intensity * 118;
        g += intensity * 22;
        b += intensity * 68;
      } else if (t === 3) {
        // Deep Cobalt / Slate Cyan Subpixel Static
        r += intensity * 20;
        g += intensity * 64;
        b += intensity * 124;
      } else if (t === 4) {
        // Desaturated Warm Amber Static
        r += intensity * 115;
        g += intensity * 86;
        b += intensity * 24;
      }

      data[idx] = Math.max(0, Math.min(255, r));
      data[idx + 1] = Math.max(0, Math.min(255, g));
      data[idx + 2] = Math.max(0, Math.min(255, b));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // ============================================================================
  // LAYER 2: FRACTAL MIDPOINT-DISPLACEMENT GLASS CRACK ENGINE (ZERO CIRCLES!)
  // ============================================================================
  const generateFractalPoints = (x1, y1, x2, y2, maxOffset, iterations) => {
    let pts = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    let offset = maxOffset;
    for (let i = 0; i < iterations; i++) {
      const next = [pts[0]];
      for (let j = 0; j < pts.length - 1; j++) {
        const p0 = pts[j];
        const p1 = pts[j + 1];
        const mx = (p0.x + p1.x) * 0.5;
        const my = (p0.y + p1.y) * 0.5;
        const segDx = p1.x - p0.x;
        const segDy = p1.y - p0.y;
        const len = Math.hypot(segDx, segDy) || 1;
        const nx = -segDy / len;
        const ny = segDx / len;
        const disp = (rand() - 0.5) * 2 * offset;
        next.push({ x: mx + nx * disp, y: my + ny * disp }, p1);
      }
      pts = next;
      offset *= 0.52;
    }
    return pts;
  };

  const drawCrystallineCrack = (x1, y1, x2, y2, roughness, iterations, baseWidth, baseAlpha, spawnSpalls = false) => {
    const pts = generateFractalPoints(x1, y1, x2, y2, roughness, iterations);
    for (let i = 0; i < pts.length - 1; i++) {
      const t = i / (pts.length - 1);
      // Taper crack thickness naturally and flicker with glass internal reflection
      const taper = Math.sin(t * Math.PI) * 0.75 + 0.25;
      const glint = rand() < 0.22 ? 1.55 : randRange(0.45, 1.05);
      const w = Math.max(0.25, baseWidth * taper * glint);
      const a = Math.min(1.0, baseAlpha * (0.4 + 0.6 * glint));

      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.strokeStyle = `rgba(248, 252, 255, ${a.toFixed(3)})`;
      ctx.lineWidth = w;
      ctx.stroke();

      // Secondary parallel refraction edge on thicker ridges
      if (w > 1.05 && rand() < 0.35) {
        ctx.beginPath();
        ctx.moveTo(pts[i].x + 1.2, pts[i].y + 0.8);
        ctx.lineTo(pts[i + 1].x + 1.2, pts[i + 1].y + 0.8);
        ctx.strokeStyle = `rgba(200, 225, 255, ${(a * 0.35).toFixed(3)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Triangular white glass spall flakes at jagged vertices
      if (spawnSpalls && i > 0 && rand() < 0.16) {
        const p = pts[i];
        const s = randRange(2.2, 6.8) * baseWidth;
        const ang = randRange(0, Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(ang) * s, p.y + Math.sin(ang) * s);
        ctx.lineTo(p.x + Math.cos(ang + randRange(0.35, 0.9)) * (s * 0.75), p.y + Math.sin(ang + randRange(0.35, 0.9)) * (s * 0.75));
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, a * 1.1).toFixed(3)})`;
        ctx.fill();
      }
    }
    return pts;
  };

  // ============================================================================
  // 1. ASYMMETRIC ONE-SIDED HAIRLINE FILAMENT FAN (MATCHING REFERENCE CENTER-RIGHT)
  // ============================================================================
  const fanCount = 58;
  for (let i = 0; i < fanCount; i++) {
    const baseAngle = dir === 1
      ? randRange(-0.68, 0.68)
      : Math.PI + randRange(-0.68, 0.68);
    const reach = randRange(95, 295) * (1 - 0.35 * Math.abs(Math.sin(baseAngle)));
    const ex = cx + Math.cos(baseAngle) * reach;
    const ey = cy + Math.sin(baseAngle) * reach + randRange(-24, 24);

    const pts = drawCrystallineCrack(cx + randRange(-6, 6), cy + randRange(-10, 10), ex, ey, randRange(5, 14), 4, randRange(0.35, 0.95), randRange(0.45, 0.88), false);

    // Fine cross-linking tension steps inside the fan (especially near rib zones ~145px and ~230px out)
    if (i > 0 && rand() < 0.65) {
      const idx = Math.floor(pts.length * randRange(0.42, 0.85));
      const p = pts[idx];
      const ribLen = randRange(8, 26);
      const perpAngle = baseAngle + Math.PI * 0.5 + randRange(-0.25, 0.25);
      drawCrystallineCrack(p.x, p.y, p.x + Math.cos(perpAngle) * ribLen, p.y + Math.sin(perpAngle) * ribLen, 2.5, 2, randRange(0.4, 1.3), randRange(0.55, 0.95), true);
    }
  }

  // ============================================================================
  // 2. BROKEN, STEPPED CRESCENT SHOCKWAVE ARCS (INCOMPLETE SECTORS ONLY)
  // ============================================================================
  const arcConfigs = [
    { r: 105, aStart: -2.6, aSpan: 1.4, w: 1.5, spall: true },
    { r: 138, aStart: 0.55, aSpan: 1.65, w: 1.3, spall: true },
    { r: 162, aStart: -0.85, aSpan: 1.55, w: 1.9, spall: true },
    { r: 195, aStart: -2.25, aSpan: 1.85, w: 1.4, spall: true },
    { r: 228, aStart: -0.95, aSpan: 1.75, w: 1.7, spall: true },
    { r: 248, aStart: 1.15, aSpan: 1.45, w: 1.35, spall: true },
    { r: 272, aStart: -1.65, aSpan: 1.35, w: 1.6, spall: true }
  ];

  for (const cfg of arcConfigs) {
    const steps = 7;
    let curR = cfg.r + randRange(-8, 8);
    const arcCx = cx + dir * 32;
    const arcCy = cy - 8;
    for (let s = 0; s < steps; s++) {
      if (rand() < 0.15) continue; // Natural broken gaps in the crescent
      const a0 = cfg.aStart + (s / steps) * cfg.aSpan;
      const a1 = cfg.aStart + ((s + 1) / steps) * cfg.aSpan;
      // Step radius slightly at radial boundaries so it NEVER looks like a smooth compass circle
      const nextR = curR + randRange(-9, 9);
      const x1 = arcCx + Math.cos(a0) * curR;
      const y1 = arcCy + Math.sin(a0) * (curR * 0.92);
      const x2 = arcCx + Math.cos(a1) * nextR;
      const y2 = arcCy + Math.sin(a1) * (nextR * 0.92);
      drawCrystallineCrack(x1, y1, x2, y2, randRange(3.5, 8.5), 3, cfg.w * randRange(0.7, 1.35), randRange(0.65, 0.98), cfg.spall);
      curR = nextR;
    }
  }

  // ============================================================================
  // 3. LONG WANDERING PRIMARY SHEAR CRACKS & BIFURCATING FORKS
  // ============================================================================
  const primaryTargets = [
    { x: 0, y: randRange(75, 145), w: 1.35 },
    { x: randRange(120, 260), y: randRange(330, 420), w: 1.65 },
    { x: randRange(680, 830), y: randRange(25, 90), w: 1.25 },
    { x: randRange(780, 940), y: randRange(470, 565), w: 1.85 },
    { x: randRange(310, 440), y: randRange(500, 570), w: 1.15 }
  ];

  for (const tgt of primaryTargets) {
    const mainPts = drawCrystallineCrack(cx, cy, tgt.x, tgt.y, randRange(18, 34), 5, tgt.w, 0.92, true);
    // Spawn 2 to 3 secondary forks branching off the main crack at acute glass-cleavage angles
    for (let f = 0; f < 3; f++) {
      const branchIdx = Math.floor(mainPts.length * randRange(0.25, 0.78));
      const bp = mainPts[branchIdx];
      const forkAngle = Math.atan2(tgt.y - cy, tgt.x - cx) + (rand() < 0.5 ? 1 : -1) * randRange(0.32, 0.78);
      const forkLen = randRange(55, 165);
      drawCrystallineCrack(bp.x, bp.y, bp.x + Math.cos(forkAngle) * forkLen, bp.y + Math.sin(forkAngle) * forkLen, randRange(8, 16), 4, tgt.w * 0.65, 0.78, true);
    }
  }

  // ============================================================================
  // 4. CRUSHED CRYSTALLINE IMPACT SPALL NUCLEUS (IRREGULAR SHARD CLUSTER, NO CIRCLE)
  // ============================================================================
  // Draw 115 overlapping micro-shards and needle splinters concentrated in a vertical/angled spall ridge
  for (let i = 0; i < 115; i++) {
    const spreadAngle = randRange(0, Math.PI * 2);
    const dist = Math.pow(rand(), 1.8) * 34;
    // Vertically elongated and jagged nucleus shape matching reference
    const sx = cx + Math.cos(spreadAngle) * (dist * 0.65) + randRange(-4, 4);
    const sy = cy + Math.sin(spreadAngle) * (dist * 1.25) + randRange(-6, 6);
    const shardLen = randRange(3.5, 16) * (1 - dist / 42);
    const shardWidth = randRange(1.2, 4.8);
    const shardAngle = spreadAngle + randRange(-0.5, 0.5);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(shardAngle) * shardLen, sy + Math.sin(shardAngle) * shardLen);
    ctx.lineTo(sx + Math.cos(shardAngle + 0.45) * shardWidth, sy + Math.sin(shardAngle + 0.45) * shardWidth);
    ctx.closePath();
    const alpha = randRange(0.55, 1.0);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
    ctx.fill();
  }

  // Short razor-sharp radiating micro-needles around the crushed nucleus
  for (let i = 0; i < 75; i++) {
    const a = randRange(0, Math.PI * 2);
    const r0 = randRange(2, 14);
    const r1 = r0 + randRange(12, 48);
    drawCrystallineCrack(
      cx + Math.cos(a) * r0 * 0.7,
      cy + Math.sin(a) * r0 * 1.15,
      cx + Math.cos(a) * r1,
      cy + Math.sin(a) * r1,
      randRange(2.5, 6.0),
      3,
      randRange(0.45, 1.35),
      randRange(0.65, 0.98),
      false
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// High-Resolution Procedural 16:9 Screen Textures (1024x576)
// ---------------------------------------------------------------------------

/**
 * Procedural Windows 11 Sunrise Mountain Lake Landscape Wallpaper (1024x576 widescreen).
 * Exact composition, lighting, and color palette of the Windows 11 Sunrise Mountain Lake wallpaper:
 * - Clear morning sky & low glowing sun (cx = 504, cy = 288) with soft atmospheric solar bloom
 * - Left snowy mountain ridge, dense evergreen pine forest belt, and sunlit frosted snow bluff (x = 0 to 590)
 * - Far-right distant misty headland (x = 770 to 1024, y = 298 to 345)
 * - Glassy turquoise-teal alpine lake (y = 345 to 576) with inverted mountain reflections and sun shimmer column
 * - Right foreground golden-reed coastal spit and terraced lush green grass banks (x = 595 to 1024, y = 358 to 515)
 */
function drawWindows11BloomWallpaper(ctx, width = 1024, height = 576) {
  const horizonY = 345;

  // =========================================================================
  // 1. CLEAR MORNING SKY & LOW GLOWING SUN (y = 0 to 345)
  // =========================================================================
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0, '#a3c6da'); // Soft powder-blue at top
  skyGrad.addColorStop(160 / horizonY, '#bedae8');
  skyGrad.addColorStop(280 / horizonY, '#dceef2'); // Warm misty pale-cyan
  skyGrad.addColorStop(1, '#eef5f4'); // Warm ivory horizon glow
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, horizonY);

  // Soft atmospheric solar bloom behind and around the sun (cx = 504, cy = 288)
  const sunX = 504;
  const sunY = 288;
  const sunBloom = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 150);
  sunBloom.addColorStop(0, 'rgba(255, 255, 250, 0.85)');
  sunBloom.addColorStop(0.2, 'rgba(255, 252, 240, 0.55)');
  sunBloom.addColorStop(0.55, 'rgba(255, 248, 230, 0.18)');
  sunBloom.addColorStop(1, 'rgba(255, 248, 230, 0)');
  ctx.fillStyle = sunBloom;
  ctx.fillRect(sunX - 150, sunY - 150, 300, 300);

  // Brilliant pure-white solar disc (cx = 504, cy = 288, radius = 27px)
  ctx.save();
  ctx.shadowColor = 'rgba(255, 255, 245, 0.9)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // =========================================================================
  // 2. FAR-RIGHT DISTANT MISTY HEADLAND (x = 770 to 1024, y = 298 to 345)
  // =========================================================================
  ctx.save();
  // Back distant hazy ridge
  const backRightGrad = ctx.createLinearGradient(840, 345, 1024, 285);
  backRightGrad.addColorStop(0, '#d8cbcf');
  backRightGrad.addColorStop(1, '#b4c4d2');
  ctx.fillStyle = backRightGrad;
  ctx.beginPath();
  ctx.moveTo(840, horizonY);
  ctx.bezierCurveTo(890, 335, 940, 318, 980, 305);
  ctx.bezierCurveTo(1000, 298, 1015, 292, 1024, 288);
  ctx.lineTo(1024, horizonY);
  ctx.closePath();
  ctx.fill();

  // Foreground distant headland: dusty rose-taupe base -> pale slate upper ridge
  const rightHeadlandGrad = ctx.createLinearGradient(770, horizonY, 1024, 298);
  rightHeadlandGrad.addColorStop(0, '#d5c5c8');
  rightHeadlandGrad.addColorStop(0.45, '#c5b7bc');
  rightHeadlandGrad.addColorStop(0.8, '#b6c3cd');
  rightHeadlandGrad.addColorStop(1, '#aebdca');
  ctx.fillStyle = rightHeadlandGrad;
  ctx.beginPath();
  ctx.moveTo(770, horizonY);
  ctx.bezierCurveTo(805, 342, 835, 336, 868, 333);
  ctx.bezierCurveTo(900, 330, 930, 322, 965, 312);
  ctx.bezierCurveTo(990, 305, 1010, 301, 1024, 298);
  ctx.lineTo(1024, horizonY);
  ctx.closePath();
  ctx.fill();

  // Subtle snow facets and shadowed gullies on the right headland
  ctx.strokeStyle = 'rgba(245, 240, 242, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(880, 333);
  ctx.lineTo(920, 325);
  ctx.moveTo(945, 318);
  ctx.lineTo(995, 304);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(150, 165, 180, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(895, 335);
  ctx.lineTo(915, 342);
  ctx.moveTo(960, 320);
  ctx.lineTo(978, 334);
  ctx.stroke();
  ctx.restore();

  // =========================================================================
  // 3. LEFT SNOWY MOUNTAIN RIDGE, PINE FOREST BELT & SUNLIT BLUFF
  // =========================================================================
  // A. Upper Snowy Peaks (x = 0, y = 140 sloping down to x = 440, y = 335)
  ctx.save();
  // Layer 1: Background Distant Ridge & Glacial Dome
  const backPeakGrad = ctx.createLinearGradient(0, 130, 440, 335);
  backPeakGrad.addColorStop(0, '#8aa9be');
  backPeakGrad.addColorStop(0.45, '#b0c8d8');
  backPeakGrad.addColorStop(0.85, '#d0e0eb');
  backPeakGrad.addColorStop(1, '#e4eef4');
  ctx.fillStyle = backPeakGrad;
  ctx.beginPath();
  ctx.moveTo(0, 135);
  ctx.bezierCurveTo(20, 130, 45, 145, 70, 160);
  ctx.bezierCurveTo(100, 175, 120, 170, 150, 190);
  ctx.bezierCurveTo(180, 210, 210, 225, 250, 250);
  ctx.bezierCurveTo(290, 275, 340, 295, 390, 315);
  ctx.bezierCurveTo(415, 325, 430, 330, 440, 335);
  ctx.lineTo(440, horizonY);
  ctx.lineTo(0, horizonY);
  ctx.closePath();
  ctx.fill();

  // Layer 2: Main Mountain Rocky Ridges & Sunlit Glaciers
  const mainPeakGrad = ctx.createLinearGradient(0, 145, 420, 335);
  mainPeakGrad.addColorStop(0, '#97b3c6');
  mainPeakGrad.addColorStop(0.4, '#c5dae6');
  mainPeakGrad.addColorStop(0.8, '#dceaf2');
  mainPeakGrad.addColorStop(1, '#eaf2f7');
  ctx.fillStyle = mainPeakGrad;
  ctx.beginPath();
  ctx.moveTo(0, 150);
  ctx.bezierCurveTo(25, 155, 55, 172, 85, 182);
  ctx.bezierCurveTo(115, 192, 145, 198, 175, 215);
  ctx.bezierCurveTo(215, 235, 255, 258, 305, 282);
  ctx.bezierCurveTo(355, 305, 400, 322, 435, 335);
  ctx.lineTo(435, horizonY);
  ctx.lineTo(0, horizonY);
  ctx.closePath();
  ctx.fill();

  // Layer 3: Sunlit Glacial Bulges & Facets facing the morning sun
  const facetGrad = ctx.createLinearGradient(0, 150, 300, 260);
  facetGrad.addColorStop(0, '#ffffff');
  facetGrad.addColorStop(0.5, '#e2eef6');
  facetGrad.addColorStop(1, '#bcd2e2');
  ctx.fillStyle = facetGrad;
  ctx.beginPath();
  ctx.moveTo(0, 170);
  ctx.bezierCurveTo(35, 165, 70, 185, 100, 198);
  ctx.bezierCurveTo(130, 210, 160, 215, 190, 232);
  ctx.bezierCurveTo(220, 248, 250, 262, 275, 275);
  ctx.lineTo(260, 290);
  ctx.bezierCurveTo(190, 265, 120, 235, 0, 205);
  ctx.closePath();
  ctx.fill();

  // Diagonal snow ridge highlights
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(10, 155); ctx.bezierCurveTo(40, 165, 65, 178, 90, 186);
  ctx.moveTo(105, 192); ctx.bezierCurveTo(135, 202, 165, 212, 195, 226);
  ctx.moveTo(205, 232); ctx.bezierCurveTo(245, 250, 280, 270, 325, 292);
  ctx.moveTo(335, 298); ctx.bezierCurveTo(370, 314, 405, 325, 430, 334);
  ctx.stroke();

  // Subtle diagonal snow ridges & cool crevasse shadow streaks
  ctx.strokeStyle = 'rgba(120, 145, 168, 0.42)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(35, 175); ctx.lineTo(70, 198);
  ctx.moveTo(110, 205); ctx.lineTo(150, 230);
  ctx.moveTo(180, 238); ctx.lineTo(225, 264);
  ctx.moveTo(260, 272); ctx.lineTo(305, 298);
  ctx.stroke();
  ctx.restore();

  // B. Mid-Slope Evergreen Pine Forest Belt (x = 0, y = 190-260 down to x = 465, y = 335)
  ctx.save();
  // 1. Base dark forest silhouette filling the wide terrace band
  const forestBeltGrad = ctx.createLinearGradient(0, 190, 465, 335);
  forestBeltGrad.addColorStop(0, '#16281a');
  forestBeltGrad.addColorStop(0.5, '#1e3421');
  forestBeltGrad.addColorStop(1, '#2b472c');
  ctx.fillStyle = forestBeltGrad;
  ctx.beginPath();
  // Top boundary of tree belt
  ctx.moveTo(0, 195);
  ctx.bezierCurveTo(45, 205, 95, 222, 150, 242);
  ctx.bezierCurveTo(210, 265, 280, 288, 350, 308);
  ctx.bezierCurveTo(395, 320, 435, 328, 465, 335);
  // Bottom boundary of tree belt where it meets foreground snow
  ctx.lineTo(465, 340);
  ctx.bezierCurveTo(410, 336, 340, 325, 260, 308);
  ctx.bezierCurveTo(170, 290, 80, 268, 0, 258);
  ctx.closePath();
  ctx.fill();

  const drawPineTree = (tx, ty, th, tw, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tx, ty - th);
    ctx.lineTo(tx + tw * 0.5, ty);
    ctx.lineTo(tx - tw * 0.5, ty);
    ctx.closePath();
    ctx.fill();
  };

  // 2. Carpet the entire terrace with dense overlapping pine trees (500+ trees across multiple rows)
  for (let step = 0; step < 520; step++) {
    const tRatio = step / 520;
    const baseX = tRatio * 465;
    // Top crest of trees at this x
    const topY = 195 + Math.pow(tRatio, 0.88) * 140;
    // Bottom edge of trees at this x
    const botY = 258 + Math.pow(tRatio, 0.88) * 82;
    const bandHeight = Math.max(8, botY - topY);

    // Multi-row distribution
    const pseudoA = Math.sin(step * 12.9898 + 4.12);
    const pseudoB = Math.cos(step * 78.233 + 1.67);
    const pseudoC = Math.sin(step * 45.164 + 9.81);

    const verticalFraction = (pseudoA * 0.5 + 0.5);
    const treeY = topY + verticalFraction * bandHeight;
    const treeH = 6 + (pseudoB * 0.5 + 0.5) * 12 * (1 - tRatio * 0.4);
    const treeW = 2.8 + (pseudoC * 0.5 + 0.5) * 3.2;

    // Background darker tree
    drawPineTree(baseX + pseudoB * 2, treeY, treeH, treeW, '#16281a');

    // Mid forest foliage
    if (step % 2 === 0) {
      drawPineTree(baseX + 1, treeY + 1, treeH * 0.85, treeW * 0.85, '#233c26');
    }
    // Sunlit golden-olive tip where morning sunlight grazes the tops
    if (step % 3 === 0) {
      drawPineTree(baseX + 0.5, treeY - treeH * 0.35, treeH * 0.45, treeW * 0.55, '#4f693e');
    }
  }

  // Soft morning mist/haze drifting across lower half of tree line
  const treeMist = ctx.createLinearGradient(0, 240, 465, 335);
  treeMist.addColorStop(0, 'rgba(235, 225, 220, 0.16)');
  treeMist.addColorStop(0.5, 'rgba(235, 225, 220, 0.32)');
  treeMist.addColorStop(1, 'rgba(250, 240, 235, 0.42)');
  ctx.fillStyle = treeMist;
  ctx.beginPath();
  ctx.moveTo(0, 245);
  ctx.bezierCurveTo(90, 265, 180, 290, 270, 312);
  ctx.bezierCurveTo(340, 325, 410, 333, 465, 335);
  ctx.lineTo(465, 345);
  ctx.lineTo(0, 275);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // C. Lower Foreground Snowy/Frosted Slope (x = 0, y = 255 tapering down to lake at x = 590, y = 345)
  ctx.save();
  const snowSlopeGrad = ctx.createLinearGradient(0, 255, 590, horizonY);
  snowSlopeGrad.addColorStop(0, '#eae8ed'); // Soft warm-tinted snow top crest
  snowSlopeGrad.addColorStop(0.35, '#dde3eb');
  snowSlopeGrad.addColorStop(0.7, '#cdd6e0'); // Mid-slope frost shadow
  snowSlopeGrad.addColorStop(1, '#9eb2c4'); // Water's edge shadow
  ctx.fillStyle = snowSlopeGrad;
  ctx.beginPath();
  ctx.moveTo(0, 255);
  ctx.bezierCurveTo(80, 268, 170, 290, 260, 310);
  ctx.bezierCurveTo(350, 325, 440, 336, 520, 342);
  ctx.bezierCurveTo(550, 344, 575, 345, 590, horizonY);
  ctx.lineTo(590, horizonY);
  ctx.lineTo(0, horizonY);
  ctx.closePath();
  ctx.fill();

  // Rolling snow drift highlights along the crest
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, 256);
  ctx.bezierCurveTo(80, 269, 170, 291, 260, 311);
  ctx.bezierCurveTo(350, 326, 440, 337, 520, 342.5);
  ctx.bezierCurveTo(550, 344.5, 575, 345, 590, horizonY);
  ctx.stroke();

  // Frost texture ripples on the snow embankment
  ctx.strokeStyle = 'rgba(180, 198, 214, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(30, 275); ctx.bezierCurveTo(90, 286, 150, 302, 210, 316);
  ctx.moveTo(120, 300); ctx.bezierCurveTo(180, 312, 240, 324, 310, 331);
  ctx.moveTo(250, 322); ctx.bezierCurveTo(320, 330, 390, 337, 470, 342);
  ctx.stroke();
  ctx.restore();

  // =========================================================================
  // 4. GLASSY TURQUOISE-TEAL ALPINE LAKE & MIRROR REFLECTIONS (y = 345 to 576)
  // =========================================================================
  ctx.save();
  // Water Base Gradient: #86bac8 at horizon -> #4294ab center -> #185a70 deep teal in foreground
  const waterGrad = ctx.createLinearGradient(0, horizonY, 0, height);
  waterGrad.addColorStop(0, '#86bac8'); // Misty horizon line
  waterGrad.addColorStop(0.12, '#62a8ba');
  waterGrad.addColorStop(0.38, '#4294ab'); // Glowing turquoise center
  waterGrad.addColorStop(0.72, '#28758c');
  waterGrad.addColorStop(1, '#185a70'); // Deep teal in bottom foreground
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, horizonY, width, height - horizonY);

  // Inverted Mountain & Forest Reflection (x = 0 to 430, y = 345 to 485)
  // Mirror reflection of the dark forest and mountain slope
  const reflGrad = ctx.createLinearGradient(0, horizonY, 0, 485);
  reflGrad.addColorStop(0, 'rgba(19, 56, 68, 0.72)');
  reflGrad.addColorStop(0.45, 'rgba(28, 77, 92, 0.58)');
  reflGrad.addColorStop(0.8, 'rgba(35, 95, 112, 0.28)');
  reflGrad.addColorStop(1, 'rgba(40, 110, 130, 0)');
  ctx.fillStyle = reflGrad;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.bezierCurveTo(80, 385, 150, 435, 200, 465);
  ctx.bezierCurveTo(240, 485, 280, 478, 320, 440);
  ctx.bezierCurveTo(360, 405, 395, 370, 435, horizonY);
  ctx.closePath();
  ctx.fill();

  // Soft vertical reflection ripples
  ctx.fillStyle = 'rgba(19, 56, 68, 0.28)';
  for (let rx = 10; rx < 360; rx += 4) {
    const rHeight = 35 + Math.sin(rx * 0.08) * 22 + Math.cos(rx * 0.15) * 12;
    ctx.fillRect(rx, horizonY, 2.5, rHeight);
  }

  // Fine horizontal glassy water-ripple lines breaking up lower reflection edge
  ctx.strokeStyle = 'rgba(120, 195, 210, 0.42)';
  ctx.lineWidth = 1.2;
  for (let ry = horizonY + 5; ry < 485; ry += 4) {
    const rw = 70 + Math.sin(ry * 0.25) * 45;
    const rx = 20 + Math.cos(ry * 0.18) * 20;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + rw, ry);
    ctx.stroke();
  }

  // Soft sun shimmer column directly below the sun (x = 450 to 555, y = 345 to 460)
  const shimmerGrad = ctx.createLinearGradient(sunX - 55, 0, sunX + 55, 0);
  shimmerGrad.addColorStop(0, 'rgba(225, 250, 255, 0)');
  shimmerGrad.addColorStop(0.3, 'rgba(225, 250, 255, 0.22)');
  shimmerGrad.addColorStop(0.5, 'rgba(240, 253, 255, 0.38)');
  shimmerGrad.addColorStop(0.7, 'rgba(225, 250, 255, 0.22)');
  shimmerGrad.addColorStop(1, 'rgba(225, 250, 255, 0)');
  ctx.fillStyle = shimmerGrad;
  ctx.fillRect(sunX - 55, horizonY, 110, 115);

  // Horizontal glint ripples along the sun shimmer column
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  for (let sy = horizonY + 2; sy < 460; sy += 4) {
    const progress = (sy - horizonY) / 115;
    const sw = (28 + Math.sin(sy * 0.6) * 18) * (1 - progress * 0.45);
    const sox = sunX + Math.sin(sy * 0.4) * 6;
    ctx.lineWidth = 1 + (1 - progress) * 0.6;
    ctx.beginPath();
    ctx.moveTo(sox - sw * 0.5, sy);
    ctx.lineTo(sox + sw * 0.5, sy);
    ctx.stroke();
  }

  // Crisp horizon shoreline line separating land from water (y = 345)
  ctx.strokeStyle = '#3a6b7c';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(width, horizonY);
  ctx.stroke();
  ctx.restore();

  // =========================================================================
  // 5. RIGHT FOREGROUND GOLDEN-REED & LUSH GREEN MEADOW PENINSULA
  //    (x = 595 to 1024, y = 358 to 515)
  // =========================================================================
  ctx.save();
  // A. Upper Golden Reed Spit (x = 595, y = 404 out to x = 1024, y = 358)
  const reedGrad = ctx.createLinearGradient(600, 404, 1024, 358);
  reedGrad.addColorStop(0, '#decab0'); // Warm sunlit wheat/tan
  reedGrad.addColorStop(0.45, '#c9b190');
  reedGrad.addColorStop(0.8, '#bfa480');
  reedGrad.addColorStop(1, '#a88d6b');
  ctx.fillStyle = reedGrad;
  ctx.beginPath();
  ctx.moveTo(595, 404); // Tip of the spit
  ctx.bezierCurveTo(680, 396, 780, 382, 890, 368);
  ctx.bezierCurveTo(940, 362, 985, 360, 1024, 358);
  ctx.lineTo(1024, 420);
  ctx.bezierCurveTo(940, 422, 850, 424, 760, 420);
  ctx.bezierCurveTo(690, 418, 630, 412, 595, 404); // Bottom contour
  ctx.closePath();
  ctx.fill();

  // Shoreline shadow along golden spit
  ctx.strokeStyle = '#8c7355';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(595, 404);
  ctx.bezierCurveTo(680, 396, 780, 382, 890, 368);
  ctx.bezierCurveTo(940, 362, 985, 360, 1024, 358);
  ctx.stroke();

  // Fine short vertical & diagonal reed texture strokes
  for (let r = 0; r < 240; r++) {
    const rx = 605 + Math.random() * 415;
    const norm = (rx - 595) / 429;
    const topY = 404 - norm * 44;
    const ry = topY + 2 + Math.random() * 22;
    const rLen = 3 + Math.random() * 4.5;
    const rAngle = -0.15 + (Math.random() - 0.5) * 0.35;
    ctx.strokeStyle = r % 2 === 0 ? '#f2e5d0' : (r % 3 === 0 ? '#c4ab82' : '#8c7355');
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + Math.sin(rAngle) * rLen, ry - Math.cos(rAngle) * rLen);
    ctx.stroke();
  }

  // B. Lower Terraced Green Grass Banks (x = 755 to 1024, y = 408 to 512)
  // Tier 1: Upper Green Meadow Bank
  const grassTier1Grad = ctx.createLinearGradient(755, 412, 1024, 465);
  grassTier1Grad.addColorStop(0, '#65833d'); // Sunlit top meadow green
  grassTier1Grad.addColorStop(0.55, '#486328'); // Mid foliage green
  grassTier1Grad.addColorStop(1, '#344b1c'); // Shadowed contour
  ctx.fillStyle = grassTier1Grad;
  ctx.beginPath();
  ctx.moveTo(755, 418);
  ctx.bezierCurveTo(775, 432, 805, 448, 850, 452);
  ctx.bezierCurveTo(910, 456, 965, 446, 1024, 436);
  ctx.lineTo(1024, 475);
  ctx.bezierCurveTo(940, 478, 860, 472, 800, 454);
  ctx.bezierCurveTo(775, 442, 760, 428, 755, 418);
  ctx.closePath();
  ctx.fill();

  // Tier 2: Lower Stepped Waterfront Grass Bank
  const grassTier2Grad = ctx.createLinearGradient(810, 455, 1024, 512);
  grassTier2Grad.addColorStop(0, '#53742d');
  grassTier2Grad.addColorStop(0.5, '#3a531e');
  grassTier2Grad.addColorStop(1, '#2c4016'); // Shadowed water's edge
  ctx.fillStyle = grassTier2Grad;
  ctx.beginPath();
  ctx.moveTo(815, 454);
  ctx.bezierCurveTo(835, 474, 875, 492, 930, 504);
  ctx.bezierCurveTo(965, 510, 995, 506, 1024, 498);
  ctx.lineTo(1024, 524);
  ctx.lineTo(920, 524);
  ctx.bezierCurveTo(870, 515, 835, 490, 815, 454);
  ctx.closePath();
  ctx.fill();

  // Fine organic grass-blade texture strokes along contoured terrace rims
  for (let g = 0; g < 220; g++) {
    const gx = 760 + Math.random() * 260;
    const tier = g % 2 === 0 ? 1 : 2;
    let gy = 422 + (gx - 760) * 0.18 + Math.random() * 16;
    if (tier === 2 && gx > 815) {
      gy = 458 + (gx - 815) * 0.22 + Math.random() * 22;
    }
    const gLen = 3.5 + Math.random() * 4.5;
    const gAngle = (Math.random() - 0.45) * 0.5;
    ctx.strokeStyle = g % 3 === 0 ? '#7da34c' : (g % 2 === 0 ? '#486328' : '#2c4016');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.sin(gAngle) * gLen, gy - Math.cos(gAngle) * gLen);
    ctx.stroke();
  }

  // Dark shoreline shadow rim & wet water reflection line where grass meets lake
  ctx.strokeStyle = 'rgba(26, 56, 40, 0.65)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(815, 454);
  ctx.bezierCurveTo(835, 474, 875, 492, 930, 504);
  ctx.bezierCurveTo(965, 510, 995, 506, 1024, 498);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(180, 235, 245, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(820, 456);
  ctx.bezierCurveTo(840, 476, 880, 494, 932, 506);
  ctx.bezierCurveTo(968, 512, 998, 508, 1024, 500);
  ctx.stroke();
  ctx.restore();
}

function drawWindows11Taskbar(ctx, width = 1024, height = 576, activeApps = {}) {
  const barY = 538;
  const barH = 38;

  // Frosted taskbar body
  ctx.fillStyle = 'rgba(235, 243, 252, 0.94)';
  ctx.fillRect(0, barY, width, barH);

  // Top border line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, barY + 0.5);
  ctx.lineTo(width, barY + 0.5);
  ctx.stroke();

  // Helper for active indicator dot under an icon
  const drawActiveDot = (centerX) => {
    ctx.fillStyle = '#0078d4';
    ctx.beginPath();
    ctx.roundRect(centerX - 4, barY + barH - 4, 8, 3, 1.5);
    ctx.fill();
  };

  // Centered Icons (Centered around x = 512)
  const icons = [
    { id: 'start', x: 370 },
    { id: 'search', x: 406 },
    { id: 'taskview', x: 442 },
    { id: 'widgets', x: 478 },
    { id: 'explorer', x: 514 },
    { id: 'edge', x: 550 },
    { id: 'terminal', x: 586 },
    { id: 'excel', x: 622 },
    { id: 'taskmgr', x: 658 }
  ];

  for (const ic of icons) {
    const cx = ic.x + 13;
    const cy = barY + 19;

    if (ic.id === 'start') {
      // 4 bright blue Windows Start squares
      ctx.fillStyle = '#0078d4';
      ctx.fillRect(cx - 9, cy - 9, 8, 8);
      ctx.fillRect(cx + 1, cy - 9, 8, 8);
      ctx.fillRect(cx - 9, cy + 1, 8, 8);
      ctx.fillRect(cx + 1, cy + 1, 8, 8);
    } else if (ic.id === 'search') {
      // Search magnifier
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx - 2, cy - 2, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 2.5, cy + 2.5);
      ctx.lineTo(cx + 7.5, cy + 7.5);
      ctx.stroke();
    } else if (ic.id === 'taskview') {
      // Task view cards
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.roundRect(cx - 8, cy - 6, 9, 12, 1.5);
      ctx.fill();
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.roundRect(cx - 2, cy - 8, 10, 14, 1.5);
      ctx.fill();
    } else if (ic.id === 'widgets') {
      // Weather widget
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(cx - 1, cy - 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(cx + 3, cy + 2, 5, 0, Math.PI * 2);
      ctx.arc(cx - 3, cy + 4, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (ic.id === 'explorer') {
      // File Explorer folder
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.roundRect(cx - 9, cy - 6, 18, 14, 2);
      ctx.fill();
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.roundRect(cx - 9, cy - 2, 18, 10, 2);
      ctx.fill();
      if (activeApps.explorer) drawActiveDot(cx);
    } else if (ic.id === 'edge') {
      // Edge browser swirl orb
      const edgeGrad = ctx.createLinearGradient(cx - 8, cy - 8, cx + 8, cy + 8);
      edgeGrad.addColorStop(0, '#0284c7');
      edgeGrad.addColorStop(0.5, '#06b6d4');
      edgeGrad.addColorStop(1, '#10b981');
      ctx.fillStyle = edgeGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 2, cy - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (ic.id === 'terminal') {
      // Dark Terminal box with >_
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(cx - 8, cy - 7, 16, 14, 2);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 8px monospace';
      ctx.fillText('>_', cx - 5, cy + 3);
      if (activeApps.terminal) drawActiveDot(cx);
    } else if (ic.id === 'excel') {
      // Excel green box with X
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.roundRect(cx - 8, cy - 7, 16, 14, 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('X', cx - 3, cy + 4);
    } else if (ic.id === 'taskmgr') {
      // Task Manager dark blue box with pulse
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(cx - 8, cy - 7, 16, 14, 2);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy);
      ctx.lineTo(cx - 2, cy - 4);
      ctx.lineTo(cx + 1, cy + 4);
      ctx.lineTo(cx + 6, cy);
      ctx.stroke();
      if (activeApps.taskmgr) drawActiveDot(cx);
    }
  }

  // System Tray on Right
  // Upward chevron ^
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(830, barY + 22);
  ctx.lineTo(834, barY + 17);
  ctx.lineTo(838, barY + 22);
  ctx.stroke();

  // Language pill: ENG
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
  ctx.fillText('ENG', 855, barY + 23);

  // Wi-Fi icon (3 concentric arcs)
  const wifiX = 895;
  const wifiY = barY + 23;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(wifiX, wifiY, 3, -0.8 * Math.PI, -0.2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(wifiX, wifiY, 7, -0.8 * Math.PI, -0.2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(wifiX, wifiY, 11, -0.8 * Math.PI, -0.2 * Math.PI); ctx.stroke();

  // Speaker icon
  const spkX = 922;
  const spkY = barY + 20;
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(spkX, spkY - 2);
  ctx.lineTo(spkX + 4, spkY - 2);
  ctx.lineTo(spkX + 8, spkY - 6);
  ctx.lineTo(spkX + 8, spkY + 6);
  ctx.lineTo(spkX + 4, spkY + 2);
  ctx.lineTo(spkX, spkY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(spkX + 8, spkY, 4, -0.3 * Math.PI, 0.3 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(spkX + 8, spkY, 7, -0.3 * Math.PI, 0.3 * Math.PI); ctx.stroke();

  // Battery icon
  const batX = 948;
  const batY = barY + 15;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(batX, batY, 14, 8);
  ctx.fillStyle = '#334155';
  ctx.fillRect(batX + 14, batY + 2.5, 2, 3);
  ctx.fillRect(batX + 2, batY + 2, 9, 4);

  // Stacked Time & Date
  ctx.fillStyle = '#1e293b';
  ctx.font = '500 11px "Segoe UI", Arial, sans-serif';
  ctx.fillText('11:05 AM', 974, barY + 17);
  ctx.fillStyle = '#475569';
  ctx.font = '500 9.5px "Segoe UI", Arial, sans-serif';
  ctx.fillText('26/10/2026', 974, barY + 29);

  // Show desktop thin divider line
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1020, barY + 8);
  ctx.lineTo(1020, barY + barH - 8);
  ctx.stroke();
}

/**
 * Draws a desktop shortcut icon with a micro shortcut arrow badge and 2-line label.
 */
function drawDesktopShortcut(ctx, x, y, iconDrawer, label1, label2 = '') {
  ctx.save();
  iconDrawer(ctx, x, y);
  ctx.restore();

  // Micro label underneath with dark drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#ffffff';
  ctx.font = '500 9.5px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label1, x + 14, y + 40);
  if (label2) {
    ctx.fillText(label2, x + 14, y + 51);
  }
  ctx.restore();
}

function drawShortcutBadge(ctx, x, y) {
  // Tiny 8x8 white square with dark arrow in lower-left corner
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.roundRect(x - 2, y + 19, 9, 9, 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + 25);
  ctx.lineTo(x + 4, y + 22);
  ctx.lineTo(x + 1, y + 22);
  ctx.stroke();
}

/**
 * SCREEN A: Windows 11 "Bloom" Desktop Workspace (1024x576, 16:9 widescreen).
 */
function createWindows11DesktopTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext('2d');

  // 1. Wallpaper & Bloom Sculpture
  drawWindows11BloomWallpaper(ctx, 1024, 576);

  // 2. Desktop Shortcut Icons (2 columns: x = 24 and x = 84)
  // Column 1, Row 1 (x=24, y=22): Recycle Bin
  drawDesktopShortcut(ctx, 24, 22, (c, x, y) => {
    // Glass wastebasket
    c.fillStyle = 'rgba(226, 232, 240, 0.75)';
    c.strokeStyle = '#38bdf8';
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(x + 3, y + 4, 22, 20, [2, 2, 5, 5]);
    c.fill();
    c.stroke();
    // Recycle arrows
    c.strokeStyle = '#0284c7';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x + 14, y + 14, 5, 0, Math.PI * 1.5);
    c.stroke();
  }, 'Recycle Bin');

  // Column 2, Row 1 (x=84, y=22): Discord
  drawDesktopShortcut(ctx, 84, 22, (c, x, y) => {
    c.fillStyle = '#5865f2';
    c.beginPath();
    c.roundRect(x, y, 28, 28, 6);
    c.fill();
    // Controller / Clyde face
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x + 10, y + 14, 2.8, 0, Math.PI * 2);
    c.arc(x + 18, y + 14, 2.8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1.8;
    c.beginPath();
    c.arc(x + 14, y + 15, 7, 0.2 * Math.PI, 0.8 * Math.PI);
    c.stroke();
    drawShortcutBadge(c, x, y);
  }, 'Discord');

  // Column 1, Row 2 (x=24, y=86): Game Launcher (Riot style)
  drawDesktopShortcut(ctx, 24, 86, (c, x, y) => {
    c.fillStyle = '#dc2626';
    c.beginPath();
    c.roundRect(x, y, 28, 28, 6);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(x + 7, y + 7);
    c.lineTo(x + 21, y + 14);
    c.lineTo(x + 7, y + 21);
    c.closePath();
    c.fill();
    drawShortcutBadge(c, x, y);
  }, 'Riot Client');

  // Column 2, Row 2 (x=84, y=86): Epic Games
  drawDesktopShortcut(ctx, 84, 86, (c, x, y) => {
    c.fillStyle = '#1e1e24';
    c.beginPath();
    c.roundRect(x, y, 28, 28, 6);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = 'bold 8px sans-serif';
    c.textAlign = 'center';
    c.fillText('EPIC', x + 14, y + 17);
    drawShortcutBadge(c, x, y);
  }, 'Epic Games', 'Launcher');

  // Column 1, Row 3 (x=24, y=150): Adobe Photoshop
  drawDesktopShortcut(ctx, 24, 150, (c, x, y) => {
    c.fillStyle = '#001e36';
    c.beginPath();
    c.roundRect(x, y, 28, 28, 6);
    c.fill();
    c.strokeStyle = '#31a8ff';
    c.lineWidth = 1.5;
    c.strokeRect(x + 1, y + 1, 26, 26);
    c.fillStyle = '#31a8ff';
    c.font = 'bold 12px sans-serif';
    c.textAlign = 'center';
    c.fillText('Ps', x + 14, y + 18);
    drawShortcutBadge(c, x, y);
  }, 'Adobe', 'Photoshop');

  // Column 2, Row 3 (x=84, y=150): Steam / Driver
  drawDesktopShortcut(ctx, 84, 150, (c, x, y) => {
    const sGrad = c.createLinearGradient(x, y, x + 28, y + 28);
    sGrad.addColorStop(0, '#171a21');
    sGrad.addColorStop(1, '#1b2838');
    c.fillStyle = sGrad;
    c.beginPath();
    c.arc(x + 14, y + 14, 14, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#66c0f4';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x + 16, y + 11, 4.5, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(x + 13, y + 13);
    c.lineTo(x + 8, y + 19);
    c.stroke();
    drawShortcutBadge(c, x, y);
  }, 'Steam');

  // Column 1, Row 4 (x=24, y=214): Twitch
  drawDesktopShortcut(ctx, 24, 214, (c, x, y) => {
    c.fillStyle = '#9146ff';
    c.beginPath();
    c.roundRect(x, y, 28, 28, 6);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.roundRect(x + 6, y + 6, 16, 14, 2);
    c.fill();
    c.fillStyle = '#9146ff';
    c.fillRect(x + 10, y + 10, 2.5, 5);
    c.fillRect(x + 15, y + 10, 2.5, 5);
    drawShortcutBadge(c, x, y);
  }, 'Twitch');

  // Column 2, Row 4 (x=84, y=214): Battle.net
  drawDesktopShortcut(ctx, 84, 214, (c, x, y) => {
    c.fillStyle = '#0e3c82';
    c.beginPath();
    c.arc(x + 14, y + 14, 14, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#38bdf8';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x + 14, y + 14, 8, 0, Math.PI * 1.5);
    c.stroke();
    drawShortcutBadge(c, x, y);
  }, 'Battle.net');

  // Column 1, Row 5 (x=24, y=278): Roblox Studio / 3D App
  drawDesktopShortcut(ctx, 24, 278, (c, x, y) => {
    c.fillStyle = '#00a2ff';
    c.beginPath();
    c.roundRect(x, y, 28, 28, 6);
    c.fill();
    c.fillStyle = '#ffffff';
    c.save();
    c.translate(x + 14, y + 14);
    c.rotate(0.35);
    c.fillRect(-6, -6, 12, 12);
    c.fillStyle = '#00a2ff';
    c.fillRect(-2.5, -2.5, 5, 5);
    c.restore();
    drawShortcutBadge(c, x, y);
  }, 'Roblox', 'Studio');

  // Column 2, Row 5 (x=84, y=278): Antigravity IDE
  drawDesktopShortcut(ctx, 84, 278, (c, x, y) => {
    c.fillStyle = '#1e1035';
    c.beginPath();
    c.roundRect(x, y, 28, 28, 6);
    c.fill();
    c.strokeStyle = '#38bdf8';
    c.lineWidth = 1.8;
    c.beginPath();
    c.arc(x + 10, y + 14, 4, 0, Math.PI * 2);
    c.arc(x + 18, y + 14, 4, 0, Math.PI * 2);
    c.stroke();
    drawShortcutBadge(c, x, y);
  }, 'Antigravity');

  // 3. Centered Frosted Taskbar
  drawWindows11Taskbar(ctx, 1024, 576, { explorer: true });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * SCREEN B: Windows 11 "Glow" Lock Screen (1024x576, 16:9 widescreen).
 */
function createWindows11LockTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext('2d');

  // 1. Deep Midnight Background (space-black -> dark-indigo)
  const bgGrad = ctx.createLinearGradient(0, 0, 1024, 576);
  bgGrad.addColorStop(0, '#03050a');
  bgGrad.addColorStop(0.5, '#070b19');
  bgGrad.addColorStop(1, '#140926');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1024, 576);

  // 2. Glowing Planetary Sphere Centerpiece
  const cx = 512;
  const cy = 325;
  const radius = 235;

  // Ambient outer bloom around the bottom rim of sphere
  const outerBloom = ctx.createRadialGradient(cx, cy + 220, 20, cx, cy + 220, 170);
  outerBloom.addColorStop(0, 'rgba(255, 117, 143, 0.45)');
  outerBloom.addColorStop(0.4, 'rgba(168, 85, 247, 0.28)');
  outerBloom.addColorStop(0.8, 'rgba(99, 102, 241, 0.12)');
  outerBloom.addColorStop(1, 'transparent');
  ctx.fillStyle = outerBloom;
  ctx.beginPath();
  ctx.arc(cx, cy + 220, 170, 0, Math.PI * 2);
  ctx.fill();

  // Draw Sphere interior
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Dark baseline sphere
  const sphereBase = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
  sphereBase.addColorStop(0, '#040814');
  sphereBase.addColorStop(0.6, '#081022');
  sphereBase.addColorStop(1, '#0e0b24');
  ctx.fillStyle = sphereBase;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Electric Royal Blue Radial Light (Lower-left)
  const blueLight = ctx.createRadialGradient(cx - 70, cy + 90, 20, cx - 70, cy + 90, 220);
  blueLight.addColorStop(0, '#0088ff');
  blueLight.addColorStop(0.35, '#0055d4');
  blueLight.addColorStop(0.7, '#002288');
  blueLight.addColorStop(1, 'transparent');
  ctx.fillStyle = blueLight;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Neon Violet/Purple Radial Light (Right outer crescent)
  const purpleLight = ctx.createRadialGradient(cx + 120, cy + 60, 20, cx + 120, cy + 60, 200);
  purpleLight.addColorStop(0, '#a855f7');
  purpleLight.addColorStop(0.4, '#6b21a8');
  purpleLight.addColorStop(0.75, '#3b0764');
  purpleLight.addColorStop(1, 'transparent');
  ctx.fillStyle = purpleLight;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Horizon Warm Glow (Bottom rim)
  const warmGlow = ctx.createRadialGradient(cx, cy + 230, 10, cx, cy + 230, 110);
  warmGlow.addColorStop(0, '#ffe4cc');
  warmGlow.addColorStop(0.25, '#ff9e80');
  warmGlow.addColorStop(0.5, '#ff758f');
  warmGlow.addColorStop(0.75, '#c084fc');
  warmGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = warmGlow;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.restore();

  // Razor-sharp glowing rim arcs outside the clip
  // Bottom warm horizon rim
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0.28 * Math.PI, 0.72 * Math.PI);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255, 215, 205, 0.95)';
  ctx.shadowColor = '#ff758f';
  ctx.shadowBlur = 14;
  ctx.stroke();

  // Right vibrant purple rim
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 1.88 * Math.PI, 0.28 * Math.PI);
  ctx.lineWidth = 2.0;
  ctx.strokeStyle = 'rgba(192, 132, 252, 0.85)';
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();

  // 3. Crisp Lock Screen Clock & Date (Upper-Center)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 12;

  // Digital Clock: 1:17
  ctx.font = '600 96px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('1:17', 512, 135);

  // Date: Monday, October 26
  ctx.font = '500 22px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillText('Monday, October 26', 512, 182);

  // Micro Wi-Fi & Battery indicator at bottom-right
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(964, 538, 16, 9);
  ctx.fillRect(980, 541, 2, 3);
  ctx.fillRect(967, 541, 10, 4);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * SCREEN C: Dark-Mode AI IDE Workspace (Antigravity / VS Code Style) (1024x576, 16:9 widescreen).
 */
function createAIIDEWorkspaceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext('2d');

  // Base background
  ctx.fillStyle = '#141418';
  ctx.fillRect(0, 0, 1024, 576);

  // 1. Top Window Title Bar (h = 26px, #18181c)
  ctx.fillStyle = '#18181c';
  ctx.fillRect(0, 0, 1024, 26);
  ctx.strokeStyle = '#26262e';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 26.5); ctx.lineTo(1024, 26.5); ctx.stroke();

  // Traffic light window dots
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(14, 13, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(28, 13, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(42, 13, 4.5, 0, Math.PI * 2); ctx.fill();

  // Window title
  ctx.fillStyle = '#9ca3af';
  ctx.font = '11px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('roc-and-load — WorldBuilder.js', 512, 17);

  // Right layout icons
  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(960, 8, 14, 10);
  ctx.strokeRect(982, 8, 14, 10);
  ctx.strokeRect(1004, 8, 14, 10);
  ctx.textAlign = 'left';

  // 2. Left Activity Strip (x = 0 to 34, #141418)
  ctx.fillStyle = '#141418';
  ctx.fillRect(0, 26, 34, 528);
  ctx.strokeStyle = '#23232b';
  ctx.strokeRect(33.5, 26, 1, 528);

  // File explorer icon
  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(9, 44, 15, 12);

  // Search icon
  ctx.beginPath(); ctx.arc(16, 76, 5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, 80); ctx.lineTo(24, 84); ctx.stroke();

  // Git Source Control (Active tab)
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(0, 96, 2.5, 26); // Active blue indicator strip
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(14, 103, 2.5, 0, Math.PI * 2);
  ctx.arc(14, 115, 2.5, 0, Math.PI * 2);
  ctx.arc(22, 109, 2.5, 0, Math.PI * 2);
  ctx.stroke();
  // Notification badge circle: 2
  ctx.fillStyle = '#2563eb';
  ctx.beginPath(); ctx.arc(24, 100, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('2', 24, 103);
  ctx.textAlign = 'left';

  // Debug run icon
  ctx.fillStyle = '#6b7280';
  ctx.beginPath();
  ctx.moveTo(12, 134); ctx.lineTo(22, 140); ctx.lineTo(12, 146);
  ctx.closePath(); ctx.fill();

  // Settings gear at bottom
  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(17, 534, 5, 0, Math.PI * 2); ctx.stroke();

  // 3. Left Sidebar: Source Control & Git Graph (x = 34 to 220, #19191f)
  ctx.fillStyle = '#19191f';
  ctx.fillRect(34, 26, 186, 528);
  ctx.strokeStyle = '#26262e';
  ctx.strokeRect(219.5, 26, 1, 528);

  // Upper Source Control Pane (y = 26 to 270)
  ctx.fillStyle = '#9ca3af';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('SOURCE CONTROL', 44, 44);

  // Commit message input box
  ctx.fillStyle = '#121216';
  ctx.beginPath(); ctx.roundRect(42, 54, 168, 26, 4); ctx.fill();
  ctx.strokeStyle = '#2e2e38'; ctx.stroke();
  ctx.fillStyle = '#6b7280';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('Message (Enter to commit)', 48, 70);

  // Royal-blue Commit button
  ctx.fillStyle = '#2563eb';
  ctx.beginPath(); ctx.roundRect(42, 86, 168, 24, 4); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✓ Commit', 126, 102);
  ctx.textAlign = 'left';

  // Changes header
  ctx.fillStyle = '#9ca3af';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.fillText('Changes', 44, 128);
  ctx.fillStyle = '#2563eb';
  ctx.beginPath(); ctx.roundRect(92, 120, 16, 12, 6); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('2', 100, 129);
  ctx.textAlign = 'left';

  // File 1: WorldBuilder.js M
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 9.5px monospace';
  ctx.fillText('JS', 44, 146);
  ctx.fillStyle = '#e4e4e7';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('WorldBuilder.js', 62, 146);
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.fillText('M', 198, 146);

  // File 2: EnemySpawner.js U
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 9.5px monospace';
  ctx.fillText('JS', 44, 166);
  ctx.fillStyle = '#e4e4e7';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('EnemySpawner.js', 62, 166);
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.fillText('U', 198, 166);

  // Lower Git Graph Pane (y = 270 to 554)
  ctx.strokeStyle = '#26262e';
  ctx.beginPath(); ctx.moveTo(34, 270); ctx.lineTo(220, 270); ctx.stroke();
  ctx.fillStyle = '#9ca3af';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('GRAPH', 44, 288);

  // 8 Git graph commit rows with branching track lines
  const graphRows = [
    { text: 'Merge PR #8571...', pill: 'main', dotCol: '#8b5cf6', trackCol: '#8b5cf6' },
    { text: '[World] Add datacenter screens', dotCol: '#06b6d4', trackCol: '#06b6d4' },
    { text: 'Merge PR #8569 from rj...', dotCol: '#ec4899', trackCol: '#ec4899' },
    { text: '[World] Canvas filtering', dotCol: '#3b82f6', trackCol: '#3b82f6' },
    { text: '[Dev] Telemetry metrics', dotCol: '#10b981', trackCol: '#10b981' },
    { text: 'Merge PR #8562 from bn...', dotCol: '#8b5cf6', trackCol: '#8b5cf6' },
    { text: '[Render] Anisotropy 8', dotCol: '#06b6d4', trackCol: '#06b6d4' },
    { text: 'Merge PR #8555 from hj...', dotCol: '#ec4899', trackCol: '#ec4899' },
  ];

  let gy = 306;
  for (let i = 0; i < graphRows.length; i++) {
    const row = graphRows[i];
    // Branch lane line
    ctx.strokeStyle = row.trackCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(48, gy - 12);
    ctx.lineTo(48, gy + 8);
    ctx.stroke();

    // Branch curve accent
    if (i % 2 === 1) {
      ctx.strokeStyle = '#ec4899';
      ctx.beginPath();
      ctx.moveTo(48, gy);
      ctx.bezierCurveTo(54, gy, 58, gy + 4, 58, gy + 12);
      ctx.stroke();
    }

    // Glowing commit dot
    ctx.fillStyle = row.dotCol;
    ctx.beginPath();
    ctx.arc(48, gy - 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Commit message
    ctx.fillStyle = '#d4d4d8';
    ctx.font = '9px sans-serif';
    ctx.fillText(row.text, 64, gy + 1);

    // Pill badge for main
    if (row.pill) {
      ctx.fillStyle = '#8b5cf6';
      ctx.beginPath(); ctx.roundRect(178, gy - 8, 30, 11, 4); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('main', 193, gy);
      ctx.textAlign = 'left';
    }

    gy += 20;
  }

  // 4. Center Code Editor (x = 220 to 780, y = 26 to 390)
  // Tab Bar (y = 26 to 54)
  ctx.fillStyle = '#18181c';
  ctx.fillRect(220, 26, 560, 28);
  ctx.strokeStyle = '#23232b';
  ctx.beginPath(); ctx.moveTo(220, 54); ctx.lineTo(780, 54); ctx.stroke();

  // Active Tab: WorldBuilder.js
  ctx.fillStyle = '#141418';
  ctx.fillRect(220, 26, 140, 28);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(220, 26, 140, 2); // Blue top line
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px sans-serif';
  ctx.fillText('WorldBuilder.js', 236, 43);
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath(); ctx.arc(330, 40, 2.5, 0, Math.PI * 2); ctx.fill(); // Orange M dot
  ctx.fillStyle = '#71717a';
  ctx.fillText('×', 345, 43);

  // Inactive Tabs
  ctx.fillStyle = '#71717a';
  ctx.fillText('main.js', 376, 43);
  ctx.fillText('Walkthrough', 450, 43);
  ctx.fillText('Implementation Plan', 550, 43);

  // Breadcrumb bar (y = 54 to 70)
  ctx.fillStyle = '#141418';
  ctx.fillRect(220, 54, 560, 16);
  ctx.fillStyle = '#71717a';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('src > world > WorldBuilder.js > _buildMonitor', 228, 66);

  // Line Number Gutter & Code Lines (y = 70 to 390)
  ctx.fillStyle = '#141418';
  ctx.fillRect(220, 70, 560, 320);
  ctx.strokeStyle = '#202026';
  ctx.beginPath(); ctx.moveTo(252, 70); ctx.lineTo(252, 390); ctx.stroke();

  const codeLines = [
    { num: 18, tokens: [['#include ', '#c678dd'], ['"world/WorldBuilder.h"', '#98c379']] },
    { num: 19, tokens: [['#include ', '#c678dd'], ['"render/CanvasTexture.h"', '#98c379']] },
    { num: 20, tokens: [] },
    { num: 21, tokens: [['using namespace ', '#c678dd'], ['world;', '#e5c07b']] },
    { num: 22, tokens: [] },
    { num: 23, tokens: [['namespace ', '#c678dd'], ['{', '#abb2bf']] },
    { num: 24, tokens: [['  struct ', '#c678dd'], ['ScreenMetrics ', '#56b6c2'], ['{', '#abb2bf']] },
    { num: 25, tokens: [['    const char ', '#c678dd'], ['*name;', '#e06c75']] },
    { num: 26, tokens: [['    float ', '#56b6c2'], ['width;', '#e06c75']] },
    { num: 27, tokens: [['    float ', '#56b6c2'], ['height;', '#e06c75']] },
    { num: 28, tokens: [['  };', '#abb2bf']] },
    { num: 29, tokens: [['  // End anonymous namespace', '#5c6370']] },
    { num: 30, tokens: [] },
    { num: 31, tokens: [['  static const ', '#c678dd'], ['ScreenMetrics ', '#56b6c2'], ['Default = {', '#abb2bf']] },
    { num: 32, tokens: [['    "1024x576_Widescreen"', '#98c379'], [', ', '#abb2bf'], ['1024.0f', '#d19a66'], [', ', '#abb2bf'], ['576.0f', '#d19a66']] },
    { num: 33, tokens: [['  };', '#abb2bf']] },
    { num: 34, tokens: [] },
    { num: 35, tokens: [['  bool ', '#56b6c2'], ['buildMonitorScreens', '#61afef'], ['(Warehouse &wh) {', '#abb2bf']] }
  ];

  let cyPos = 84;
  for (const cl of codeLines) {
    ctx.fillStyle = '#4b5563';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(cl.num.toString(), 246, cyPos);
    ctx.textAlign = 'left';

    let cxPos = 260;
    for (const [txt, col] of cl.tokens) {
      ctx.fillStyle = col;
      ctx.fillText(txt, cxPos, cyPos);
      cxPos += ctx.measureText(txt).width;
    }
    cyPos += 14;
  }

  // Inline AI Diff Overlay (around line 36-38, y = 330 to 380)
  // Red diff row (Line 36)
  ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
  ctx.fillRect(220, 328, 512, 16);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(220, 328, 3, 16);
  ctx.fillStyle = '#ef4444';
  ctx.font = '10px monospace';
  ctx.fillText('36 -', 230, 340);
  ctx.fillStyle = '#fca5a5';
  ctx.fillText('   assert(screenId >= 0 && screenId < 4); // Old atlas quadrant', 260, 340);

  // Green diff row (Line 37)
  ctx.fillStyle = 'rgba(34, 197, 94, 0.18)';
  ctx.fillRect(220, 345, 512, 16);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(220, 345, 3, 16);
  ctx.fillStyle = '#22c55e';
  ctx.font = '10px monospace';
  ctx.fillText('37 +', 230, 357);
  ctx.fillStyle = '#86efac';
  ctx.fillText('   return setProceduralCanvasDisplay(ScreenType::Windows11Bloom);', 260, 357);

  // Floating AI Diff Action Pill Toolbar
  ctx.fillStyle = '#1e1e26';
  ctx.beginPath(); ctx.roundRect(330, 365, 210, 22, 4); ctx.fill();
  ctx.strokeStyle = '#3b82f6'; ctx.stroke();

  // Accept Changes blue button
  ctx.fillStyle = '#2563eb';
  ctx.beginPath(); ctx.roundRect(334, 367, 102, 18, 3); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Accept Changes', 385, 379);

  // Reject button
  ctx.fillStyle = '#2d2d38';
  ctx.beginPath(); ctx.roundRect(442, 367, 52, 18, 3); ctx.fill();
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('Reject', 468, 379);

  // Arrows
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px sans-serif';
  ctx.fillText('↑  ↓', 516, 379);
  ctx.textAlign = 'left';

  // Right Code Minimap (x = 732 to 780, y = 70 to 390)
  ctx.fillStyle = '#16161b';
  ctx.fillRect(732, 70, 48, 320);
  ctx.strokeStyle = '#202026';
  ctx.strokeRect(731.5, 70, 1, 320);

  // Micro syntax bars on minimap
  const miniColors = ['#c678dd', '#98c379', '#56b6c2', '#61afef', '#e5c07b', '#d19a66'];
  for (let my = 75; my < 380; my += 5) {
    const mw = 12 + ((my * 7) % 28);
    const mc = miniColors[(my / 5) % miniColors.length];
    ctx.fillStyle = mc;
    ctx.fillRect(736, my, mw, 2.5);
  }
  // Viewport highlight box
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fillRect(734, 180, 44, 120);

  // 5. Bottom Terminal Panel (x = 220 to 780, y = 390 to 554, #121216)
  ctx.fillStyle = '#121216';
  ctx.fillRect(220, 390, 560, 164);
  ctx.strokeStyle = '#282830';
  ctx.beginPath(); ctx.moveTo(220, 390); ctx.lineTo(780, 390); ctx.stroke();

  // Terminal Tab Bar (y = 390 to 414)
  ctx.fillStyle = '#16161c';
  ctx.fillRect(220, 390, 560, 24);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('Problems (4)', 232, 406);
  ctx.fillText('Output', 304, 406);
  ctx.fillText('Debug Console', 356, 406);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.fillText('Terminal', 440, 406);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(440, 412, 42, 2); // Underline
  ctx.fillStyle = '#9ca3af';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('Ports', 504, 406);

  // Terminal Body Lines
  ctx.font = '9.5px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('felipe@roc-dev', 232, 428);
  ctx.fillStyle = '#a855f7';
  ctx.fillText('rocAndLoad %', 304, 428);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('npm run build', 374, 428);

  ctx.fillStyle = '#9ca3af';
  ctx.fillText('vite v5.4.2 building for production...', 232, 444);
  ctx.fillStyle = '#22c55e';
  ctx.fillText('✓ 78 modules transformed.', 232, 460);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('dist/index.html                   1.42 kB │ gzip:  0.68 kB', 232, 476);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('dist/assets/index-Dk82P.js     482.11 kB │ gzip: 132.45 kB', 232, 492);
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('✓ built in 429ms', 232, 510);

  ctx.font = '9.5px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('felipe@roc-dev rocAndLoad % █', 232, 530);

  // 6. Right AI Agent Manager Sidebar (x = 780 to 1024, #19191f)
  ctx.fillStyle = '#19191f';
  ctx.fillRect(780, 26, 244, 528);
  ctx.strokeStyle = '#282830';
  ctx.strokeRect(779.5, 26, 1, 528);

  // Header Bar
  ctx.fillStyle = '#16161c';
  ctx.fillRect(780, 26, 244, 30);
  ctx.fillStyle = '#e4e4e7';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('Checking File Types', 792, 45);

  // Right icons in Agent header
  ctx.fillStyle = '#71717a';
  ctx.font = '12px sans-serif';
  ctx.fillText('+  ◫  ×', 975, 45);

  // Card 1: Creating implementation plan
  ctx.fillStyle = '#202028';
  ctx.beginPath(); ctx.roundRect(790, 64, 224, 28, 5); ctx.fill();
  ctx.strokeStyle = '#2d2d38'; ctx.stroke();
  ctx.fillStyle = '#38bdf8';
  ctx.font = '10px sans-serif';
  ctx.fillText('⚙ Creating implementation plan', 800, 81);

  // Explanatory microtext
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('Found display texture definitions in', 792, 106);
  ctx.fillText('WarehouseBuilder.js. Updating monitor canvas', 792, 118);
  ctx.fillText('materials to 1024x576 resolution with', 792, 130);
  ctx.fillText('high-fidelity procedural renders.', 792, 142);

  // Card 2: Proceeded with Implementation Plan
  ctx.fillStyle = '#16261c';
  ctx.beginPath(); ctx.roundRect(790, 154, 224, 28, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)'; ctx.stroke();
  ctx.fillStyle = '#86efac';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('✓ Proceeded with Implementation Plan', 800, 171);

  // Thought dropdown
  ctx.fillStyle = '#71717a';
  ctx.font = '9px sans-serif';
  ctx.fillText('> Thought for 2s', 792, 196);

  // Card 3: Status Summary
  ctx.fillStyle = '#202028';
  ctx.beginPath(); ctx.roundRect(790, 208, 224, 52, 5); ctx.fill();
  ctx.strokeStyle = '#2d2d38'; ctx.stroke();
  ctx.fillStyle = '#d4d4d8';
  ctx.font = '9px sans-serif';
  ctx.fillText('Checking WarehouseBuilder.js...', 800, 224);
  ctx.fillStyle = '#22c55e';
  ctx.fillText('✓ 4 new CanvasTextures generated', 800, 240);
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText('Files: WarehouseBuilder.js', 800, 252);

  // Bottom Chat input box & Accept all button
  ctx.fillStyle = '#17171c';
  ctx.fillRect(780, 480, 244, 74);
  ctx.strokeStyle = '#26262e';
  ctx.beginPath(); ctx.moveTo(780, 480); ctx.lineTo(1024, 480); ctx.stroke();

  ctx.fillStyle = '#131317';
  ctx.beginPath(); ctx.roundRect(790, 488, 224, 30, 4); ctx.fill();
  ctx.strokeStyle = '#2e2e38'; ctx.stroke();
  ctx.fillStyle = '#71717a';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('Ask anything, @ to mention...', 798, 506);

  // Model pill badge
  ctx.fillStyle = '#a1a1aa';
  ctx.font = '9px sans-serif';
  ctx.fillText('⚡ Gemini 3.8 Flash (High)', 792, 536);

  // Bright blue Accept all button
  ctx.fillStyle = '#2563eb';
  ctx.beginPath(); ctx.roundRect(942, 524, 72, 22, 4); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Accept all', 978, 538);
  ctx.textAlign = 'left';

  // 7. Bottom Status Bar (y = 554 to 576, #18181c)
  ctx.fillStyle = '#18181c';
  ctx.fillRect(0, 554, 1024, 22);
  ctx.strokeStyle = '#282830';
  ctx.beginPath(); ctx.moveTo(0, 554); ctx.lineTo(1024, 554); ctx.stroke();

  // Far-left blue branch pill
  ctx.fillStyle = '#2563eb';
  ctx.beginPath(); ctx.roundRect(6, 557, 54, 16, 3); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('⑂ main*', 12, 568);

  ctx.fillStyle = '#9ca3af';
  ctx.font = '9px sans-serif';
  ctx.fillText('⊘ 0   ⚠ 0', 68, 568);

  // Far-right status items
  ctx.textAlign = 'right';
  ctx.fillText('Ln 37, Col 1   Spaces: 2   UTF-8   LF   JavaScript   Antigravity', 1016, 568);
  ctx.textAlign = 'left';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * SCREEN D: Windows 11 Active Multi-Window Workspace (For Dual-Monitor Pairing) (1024x576, 16:9 widescreen).
 */
function createWindows11MultiWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext('2d');

  // 1. Wallpaper background (Windows 11 Bloom)
  drawWindows11BloomWallpaper(ctx, 1024, 576);

  // 2. Left Window: Dark Windows Terminal / PowerShell (x = 36, y = 36, w = 450, h = 485)
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#0b0f19';
  ctx.beginPath(); ctx.roundRect(36, 36, 450, 485, 8); ctx.fill();
  ctx.strokeStyle = '#334155'; ctx.stroke();
  ctx.restore();

  // PowerShell Title Bar (y = 36 to 66)
  ctx.fillStyle = '#1e293b';
  ctx.beginPath(); ctx.roundRect(36, 36, 450, 30, [8, 8, 0, 0]); ctx.fill();
  // Tab 1 (active)
  ctx.fillStyle = '#0b0f19';
  ctx.beginPath(); ctx.roundRect(42, 42, 110, 24, [4, 4, 0, 0]); ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 8.5px monospace';
  ctx.fillText('>_ PowerShell', 50, 57);
  // Tab 2
  ctx.fillStyle = '#94a3b8';
  ctx.font = '8.5px sans-serif';
  ctx.fillText('Azure Shell', 165, 57);
  // Window controls
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';
  ctx.fillText('—  □  ×', 440, 55);

  // PowerShell Body Content
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9.5px monospace';
  ctx.fillText('Windows PowerShell [Version 10.0.22631.3007]', 48, 86);
  ctx.fillStyle = '#64748b';
  ctx.fillText('(c) Microsoft Corporation. All rights reserved.', 48, 100);

  ctx.fillStyle = '#38bdf8';
  ctx.fillText('PS C:\\DataCenter\\Cluster> Get-ClusterStatus -Detailed', 48, 124);

  // Telemetry table
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 9px monospace';
  ctx.fillText('NodeID      Status     CPU Load   Memory       Uptime', 48, 144);
  ctx.fillStyle = '#475569';
  ctx.fillText('---------------------------------------------------------', 48, 154);

  const clusterNodes = [
    { id: 'NODE-01', stat: 'ONLINE', load: '24%', mem: '32.4 GB', up: '42d 18h' },
    { id: 'NODE-02', stat: 'ONLINE', load: '38%', mem: '48.1 GB', up: '42d 18h' },
    { id: 'NODE-03', stat: 'ONLINE', load: '19%', mem: '28.0 GB', up: '42d 18h' },
    { id: 'STORAGE', stat: 'HEALTHY', load: '41%', mem: '1.84 PB', up: '180d 04h' }
  ];

  let ny = 170;
  for (const n of clusterNodes) {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '9px monospace';
    ctx.fillText(n.id, 48, ny);
    ctx.fillStyle = '#22c55e';
    ctx.fillText(n.stat, 126, ny);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(n.load, 194, ny);
    ctx.fillText(n.mem, 260, ny);
    ctx.fillText(n.up, 345, ny);
    ny += 16;
  }

  // Ping test section
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('PS C:\\DataCenter\\Cluster> ping gateway.corp.net', 48, 252);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('Reply from 10.0.0.1: bytes=32 time=0.4ms TTL=64', 48, 268);
  ctx.fillText('Reply from 10.0.0.1: bytes=32 time=0.3ms TTL=64', 48, 282);
  ctx.fillStyle = '#22c55e';
  ctx.fillText('Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)', 48, 300);

  ctx.fillStyle = '#38bdf8';
  ctx.fillText('PS C:\\DataCenter\\Cluster> █', 48, 330);

  // 3. Right Window: Windows 11 Task Manager Performance (x = 510, y = 50, w = 480, h = 470)
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath(); ctx.roundRect(510, 50, 480, 470, 8); ctx.fill();
  ctx.strokeStyle = '#475569'; ctx.stroke();
  ctx.restore();

  // Task Manager Title Bar
  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.roundRect(510, 50, 480, 32, [8, 8, 0, 0]); ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('Task Manager — Performance', 530, 70);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';
  ctx.fillText('—  □  ×', 950, 70);

  // Left Nav Rail inside Task Manager (w = 44px)
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(510, 82, 44, 438);
  ctx.strokeStyle = '#334155';
  ctx.strokeRect(553.5, 82, 1, 438);

  // Active CPU icon on nav rail
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(510, 94, 2.5, 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('CPU', 522, 110);
  ctx.fillStyle = '#64748b';
  ctx.fillText('MEM', 522, 140);
  ctx.fillText('DISK', 522, 170);
  ctx.fillText('NET', 522, 200);
  ctx.fillText('GPU', 522, 230);

  // Main Performance Body Panel
  // CPU Header
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('CPU  AMD EPYC 9654 96-Core Processor', 568, 108);

  // CPU live utilization sparkline chart area
  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.roundRect(568, 120, 404, 120, 4); ctx.fill();
  ctx.strokeStyle = '#334155'; ctx.stroke();

  // Grid lines inside chart
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  for (let gy = 145; gy < 240; gy += 25) {
    ctx.beginPath(); ctx.moveTo(568, gy); ctx.lineTo(972, gy); ctx.stroke();
  }
  for (let gx = 620; gx < 970; gx += 60) {
    ctx.beginPath(); ctx.moveTo(gx, 120); ctx.lineTo(gx, 240); ctx.stroke();
  }

  // Live CPU waveform curve with gradient fill
  const waveGrad = ctx.createLinearGradient(568, 120, 568, 240);
  waveGrad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
  waveGrad.addColorStop(1, 'rgba(56, 189, 248, 0.05)');
  ctx.fillStyle = waveGrad;
  ctx.beginPath();
  ctx.moveTo(568, 240);
  ctx.lineTo(568, 200);
  ctx.bezierCurveTo(610, 180, 640, 215, 680, 170);
  ctx.bezierCurveTo(720, 135, 750, 195, 790, 150);
  ctx.bezierCurveTo(830, 120, 870, 180, 910, 160);
  ctx.bezierCurveTo(940, 145, 960, 155, 972, 148);
  ctx.lineTo(972, 240);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(568, 200);
  ctx.bezierCurveTo(610, 180, 640, 215, 680, 170);
  ctx.bezierCurveTo(720, 135, 750, 195, 790, 150);
  ctx.bezierCurveTo(830, 120, 870, 180, 910, 160);
  ctx.bezierCurveTo(940, 145, 960, 155, 972, 148);
  ctx.stroke();

  // Top-right percentage badge
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('28% Utilization', 875, 140);

  // Metrics row
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('Utilization: 28%  •  Speed: 3.42 GHz  •  Processes: 248  •  Threads: 3120', 568, 258);

  // Memory section
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('Memory  64.2 / 256 GB (25%)', 568, 282);
  // Memory horizontal usage bar
  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.roundRect(568, 290, 404, 12, 3); ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath(); ctx.roundRect(568, 290, 101, 12, 3); ctx.fill();

  // GPU Section
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('GPU 0  NVIDIA H100 PCIe (Temp: 44°C, Util: 12%)', 568, 324);
  // GPU mini sparkline
  ctx.fillStyle = '#0f172a';
  ctx.beginPath(); ctx.roundRect(568, 332, 404, 45, 3); ctx.fill();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(568, 365);
  ctx.lineTo(650, 360);
  ctx.lineTo(720, 345);
  ctx.lineTo(800, 358);
  ctx.lineTo(890, 350);
  ctx.lineTo(972, 354);
  ctx.stroke();

  // 4. Centered Windows 11 Frosted Taskbar
  drawWindows11Taskbar(ctx, 1024, 576, { terminal: true, taskmgr: true });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * SCREEN E: Enterprise IT Technical Support & Ticket ERP Web Portal (1024x576, 16:9 widescreen).
 * Authentic procedural recreation of an IT Service web application running in a dark browser chrome.
 */
function createITServicePortalTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext('2d');

  // --- 1. DARK BROWSER CHROME & BOOKMARKS (y = 0 to 72) ---
  // Top tab strip background
  ctx.fillStyle = '#1e2229';
  ctx.fillRect(0, 0, 1024, 26);

  // Browser Tabs (5 tabs)
  const tabs = [
    { title: 'R&L Service', active: false, x: 10, w: 108, icon: 'shield' },
    { title: 'R&L INTRANET', active: true, x: 122, w: 124, icon: 'globe' },
    { title: '(2) WebChat', active: false, x: 250, w: 108, icon: 'chat' },
    { title: 'AI Assistant', active: false, x: 362, w: 102, icon: 'sparkle' },
    { title: 'Nova guia', active: false, x: 468, w: 80, icon: 'plus' }
  ];

  for (const t of tabs) {
    if (t.active) {
      ctx.fillStyle = '#282c34';
      ctx.beginPath();
      ctx.roundRect(t.x, 2, t.w, 24, [6, 6, 0, 0]);
      ctx.fill();
      ctx.strokeStyle = '#3e4451';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#1e2229';
      ctx.fillRect(t.x, 3, t.w, 23);
      ctx.strokeStyle = '#2d333f';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(t.x, 4, t.w, 22);
    }

    // Favicons
    if (t.icon === 'shield') {
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(t.x + 12, 14, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.icon === 'globe') {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(t.x + 12, 14, 5.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.icon === 'chat') {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(t.x + 12, 14, 5, 0, Math.PI * 2);
      ctx.fill();
      // Red notification badge
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(t.x + 16, 9, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.icon === 'sparkle') {
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(t.x + 12, 14, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.icon === 'plus') {
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('+', t.x + 10, 17);
    }

    // Tab Title
    ctx.fillStyle = t.active ? '#f8fafc' : '#94a3b8';
    ctx.font = t.active ? 'bold 8.5px sans-serif' : '8.5px sans-serif';
    ctx.fillText(t.title, t.x + 23, 17);

    // Close button 'x' on non-plus tabs
    if (t.icon !== 'plus') {
      ctx.fillStyle = '#64748b';
      ctx.font = '8px sans-serif';
      ctx.fillText('✕', t.x + t.w - 12, 16);
    }
  }

  // Top-Right Window Controls
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';
  ctx.fillText('—   □   ✕', 955, 16);

  // Address Bar row (y = 26 to 50)
  ctx.fillStyle = '#282c34';
  ctx.fillRect(0, 26, 1024, 24);

  // Browser Nav Chevrons & Refresh
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('‹   ›', 14, 42);
  ctx.font = '12px sans-serif';
  ctx.fillText('↻', 46, 42);

  // Rounded URL Pill
  ctx.fillStyle = '#1e2229';
  ctx.beginPath();
  ctx.roundRect(74, 29, 855, 19, 9.5);
  ctx.fill();
  ctx.strokeStyle = '#3b4252';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Green padlock icon
  ctx.fillStyle = '#10b981';
  ctx.font = '9px sans-serif';
  ctx.fillText('🔒', 84, 43);

  // Full ERP URL
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '9.5px "Segoe UI", sans-serif';
  ctx.fillText('https://erp.rocload.srv.br/webforms/AtdTecnico/Agenda.aspx', 104, 43);

  // Star & Extension icons on right of address bar
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px sans-serif';
  ctx.fillText('★', 885, 43);
  ctx.fillText('🧩', 908, 43);

  // User Profile Circle avatar & menu dots
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.arc(952, 38, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 7px sans-serif';
  ctx.fillText('RA', 947, 41);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('⋮', 974, 42);

  // Bookmarks Bar (y = 50 to 72)
  ctx.fillStyle = '#1e2229';
  ctx.fillRect(0, 50, 1024, 22);
  ctx.strokeStyle = '#2d333f';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 71.5);
  ctx.lineTo(1024, 71.5);
  ctx.stroke();

  const bookmarks = [
    { title: 'R&L Service', icon: '🏢', x: 12 },
    { title: 'Intranet', icon: '🌐', x: 104 },
    { title: 'WebChat', icon: '💬', x: 172 },
    { title: 'Drive Analistas', icon: '📁', x: 248 },
    { title: 'Drive Atend.', icon: '📂', x: 358 },
    { title: 'AI Assistant', icon: '✨', x: 452 }
  ];

  ctx.font = '8.5px sans-serif';
  for (const b of bookmarks) {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`${b.icon} ${b.title}`, b.x, 65);
  }
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('📋 Todos os favoritos', 892, 65);

  // --- 2. SLATE-BLUE METALLIC ERP HEADER BANNER (y = 72 to 124) ---
  const headerGrad = ctx.createLinearGradient(0, 72, 1024, 124);
  headerGrad.addColorStop(0, '#262e3d');
  headerGrad.addColorStop(0.5, '#3e4b5f');
  headerGrad.addColorStop(1, '#27303f');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 72, 1024, 52);

  // Subtle metallic bevel lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 72.5);
  ctx.lineTo(1024, 72.5);
  ctx.stroke();

  ctx.strokeStyle = '#151b24';
  ctx.beginPath();
  ctx.moveTo(0, 123.5);
  ctx.lineTo(1024, 123.5);
  ctx.stroke();

  // Left Brand Monogram (RL SERVICE)
  ctx.fillStyle = '#064e3b';
  ctx.beginPath();
  ctx.roundRect(14, 79, 62, 38, 5);
  ctx.fill();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 20px "Segoe UI", sans-serif';
  ctx.fillText('RL', 24, 101);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 6px sans-serif';
  ctx.fillText('S E R V I C E', 19, 112);

  // Green Shield Badge next to monogram
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.moveTo(85, 87);
  ctx.lineTo(95, 87);
  ctx.lineTo(95, 100);
  ctx.lineTo(90, 106);
  ctx.lineTo(85, 100);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('✓', 87.5, 99);

  // User Greeting & Date
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('Boa Tarde, Roc Admin', 106, 94);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '9.5px sans-serif';
  ctx.fillText('Segunda-feira, 26 de Outubro de 2026', 106, 110);

  // Center Notification Pill Button
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(455, 84, 126, 26, 4);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 8.5px sans-serif';
  ctx.fillText('🔔 NOTIFICAÇÕES', 472, 101);

  // Right Header Action Buttons (Row of 5 compact dark-slate action buttons)
  const headerBtns = [
    { title: 'Intranet', x: 720, w: 56, textCol: '#e2e8f0' },
    { title: 'Meu Cadastro', x: 780, w: 76, textCol: '#e2e8f0' },
    { title: 'Alterar Senha', x: 860, w: 74, textCol: '#e2e8f0' },
    { title: 'Ajuda', x: 938, w: 40, textCol: '#e2e8f0' },
    { title: 'Logoff', x: 982, w: 36, textCol: '#fca5a5' }
  ];

  for (const hb of headerBtns) {
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(hb.x, 86, hb.w, 23, 3);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = hb.textCol;
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText(hb.title, hb.x + 5, 101);
  }

  // --- 3. LEFT VERTICAL NAVIGATION SIDEBAR (x = 0 to 94, y = 124 to 548) ---
  ctx.fillStyle = '#374151';
  ctx.fillRect(0, 124, 94, 424);

  // Sidebar Header: "Módulos"
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 124, 94, 20);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.fillText('Módulos', 26, 138);

  // Stacked Vertical Menu Cells
  const menuCells = [
    { label: 'Administrador', active: false },
    { label: 'Atendimento', active: false },
    { label: 'Atendimento Técnico', active: true },
    { label: 'Comercial', active: false },
    { label: 'Estoq.Componentes', active: false },
    { label: 'Estoq.Equipamentos', active: false },
    { label: 'Financeiro', active: false },
    { label: 'Laboratório', active: false },
    { label: 'Montagem', active: false }
  ];

  let cellY = 144;
  for (const mc of menuCells) {
    if (mc.active) {
      ctx.fillStyle = '#dbeafe';
      ctx.fillRect(0, cellY, 94, 19);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(0, cellY, 3, 19); // Active blue indicator strip
      ctx.fillStyle = '#1e3a8a';
      ctx.font = 'bold 8px sans-serif';
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, cellY, 94, 19);
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(0, cellY, 94, 19);
      ctx.fillStyle = '#1f2937';
      ctx.font = '7.5px sans-serif';
    }
    ctx.fillText(mc.label, 6, cellY + 13);
    cellY += 19;
  }

  // Accordion Header: "Relatórios ▾"
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 315, 94, 20);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('Relatórios  ▾', 18, 329);

  // Fill lower sidebar
  ctx.fillStyle = '#26303f';
  ctx.fillRect(0, 335, 94, 213);

  // --- 4. MAIN ERP CONTENT AREA & DENSE TICKET GRID (x = 94 to 1024, y = 124 to 548) ---
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(94, 124, 930, 424);

  // Top Sub-Navigation Tabs
  const subTabs = [
    { label: 'Agenda', active: true, x: 98, w: 58 },
    { label: 'Validar Chamado', active: false, x: 160, w: 92 },
    { label: 'Solicitar Material', active: false, x: 256, w: 96 },
    { label: 'Empréstimo Montagem', active: false, x: 356, w: 118 }
  ];

  for (const st of subTabs) {
    if (st.active) {
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(st.x, 126, st.w, 22, [4, 4, 0, 0]);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8.5px sans-serif';
    } else {
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.roundRect(st.x, 126, st.w, 22, [4, 4, 0, 0]);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.font = '8.5px sans-serif';
    }
    ctx.fillText(st.label, st.x + 6, 140);
  }

  // Section 1: "Informar utilização de material"
  ctx.fillStyle = '#b91c1c';
  ctx.font = 'bold 10.5px sans-serif';
  ctx.fillText('Informar utilização de material', 98, 163);

  // Section 1 Mini Table Header
  ctx.fillStyle = '#b8c5d6';
  ctx.fillRect(98, 168, 920, 15);
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('Nº do Chamado', 190, 179);
  ctx.fillText('Data de Conclusão', 460, 179);
  ctx.fillText('Nome Fantasia do Cliente', 750, 179);

  // Section 1 Empty Row
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(98, 183, 920, 15);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(98, 183, 920, 15);
  ctx.fillStyle = '#64748b';
  ctx.font = 'italic 8px sans-serif';
  ctx.fillText('Nenhum Chamado encontrado', 510, 194);

  // Section 2: "Chamados do Técnico"
  ctx.fillStyle = '#b91c1c';
  ctx.font = 'bold 10.5px sans-serif';
  ctx.fillText('Chamados do Técnico', 98, 213);

  // Search Controls
  ctx.fillStyle = '#1e293b';
  ctx.font = '8px sans-serif';
  ctx.fillText('Pesquisar Nº Chamado', 98, 232);

  // Search Input Field
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(200, 222, 105, 16);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(200, 222, 105, 16);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '7.5px sans-serif';
  ctx.fillText('Nº do chamado', 205, 233);

  // Search Button
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(310, 222, 56, 16, 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('Pesquisar', 318, 233);

  // Dense Ticket Data Table Header
  ctx.fillStyle = '#b8c5d6';
  ctx.fillRect(98, 245, 920, 17);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(98, 245, 920, 17);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('Nº chamado', 104, 257);
  ctx.fillText('Nome Fantasia', 165, 257);
  ctx.fillText('Localização', 645, 257);
  ctx.fillText('Data Agendamento', 735, 257);
  ctx.fillText('Tipo Atendimento', 830, 257);
  ctx.fillText('Não Agendado ▾', 905, 257);
  ctx.fillText('Ações', 975, 257);

  // 16 Realistic Parody Ticket Rows
  const ticketData = [
    { num: '105169', client: 'PLAZA NITERÓI', loc: 'SANTA ROSA', date: '22/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '105021', client: 'ANCAR - MIDWAY MALL', loc: 'TIROL', date: '20/10/2026 13:30', type: 'Técnico', status: 'Agendado' },
    { num: '104978', client: 'ANCAR - CONDOMÍNIO EDIFÍCIO PORTO VELHO SHOPPING', loc: 'FLODOALDO P.', date: '19/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104240', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104239', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104238', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104237', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104236', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104218', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104217', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104216', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104214', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104213', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104212', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104211', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' },
    { num: '104181', client: 'ARM ARMAZÉNS GERAIS & LOGÍSTICA LTDA', loc: 'XERÉM', date: '05/10/2026 18:00', type: 'Técnico', status: 'Agendado' }
  ];

  let rowY = 262;
  const rowH = 17.2;

  for (let i = 0; i < ticketData.length; i++) {
    const t = ticketData[i];
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(98, rowY, 920, rowH);

    // Row border line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(98, rowY + rowH);
    ctx.lineTo(1018, rowY + rowH);
    ctx.stroke();

    // Row cell text
    ctx.fillStyle = '#1e293b';
    ctx.font = '7.5px sans-serif';
    ctx.fillText(t.num, 104, rowY + 12);
    ctx.fillText(t.client, 165, rowY + 12);
    ctx.fillText(t.loc, 645, rowY + 12);
    ctx.fillText(t.date, 735, rowY + 12);
    ctx.fillText(t.type, 830, rowY + 12);
    ctx.fillText(t.status, 905, rowY + 12);

    // Right-aligned underlined 'detalhes' link
    ctx.fillStyle = '#2563eb';
    ctx.fillText('detalhes', 975, rowY + 12);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(975, rowY + 13.5);
    ctx.lineTo(1005, rowY + 13.5);
    ctx.stroke();

    rowY += rowH;
  }

  // --- 5. BOTTOM STATUS BAR (y = 548 to 576) ---
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 548, 1024, 28);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 548.5);
  ctx.lineTo(1024, 548.5);
  ctx.stroke();

  // Telemetry indicators
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 8px monospace';
  ctx.fillText('LATÊNCIA:', 14, 565);
  ctx.fillStyle = '#10b981';
  ctx.fillText('▊ 2ms', 64, 565);

  ctx.fillStyle = '#94a3b8';
  ctx.fillText('SISTEMA:', 116, 565);
  ctx.fillStyle = '#10b981';
  ctx.fillText('▊ 14.02', 162, 565);

  ctx.fillStyle = '#94a3b8';
  ctx.fillText('USUÁRIOS:', 222, 565);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('43', 274, 565);

  // Copyright Centered
  ctx.fillStyle = '#94a3b8';
  ctx.font = '8px sans-serif';
  ctx.fillText('© 2026 R&L Service - Todos os direitos reservados.', 430, 565);

  // Bottom-Right Action Button
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.roundRect(878, 553, 134, 18, 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '8px sans-serif';
  ctx.fillText('Notas de Atualização (1.4.1)', 888, 565);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * SCREEN F: Dark-Mode Music Streaming Desktop App (1024x576, 16:9 widescreen).
 * High-detail procedural recreation of a modern music streaming desktop application.
 */
function createMusicAppTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext('2d');

  // Deep pitch-black base shell
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 1024, 576);

  // --- 1. TOP NAVIGATION BAR (y = 0 to 42) ---
  // Nav Chevrons (< >)
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  ctx.arc(22, 21, 12, 0, Math.PI * 2);
  ctx.arc(50, 21, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a7a7a7';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('‹', 19, 25);
  ctx.fillText('›', 47, 25);

  // Home Circle Button
  ctx.fillStyle = '#1f1f1f';
  ctx.beginPath();
  ctx.arc(372, 21, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px sans-serif';
  ctx.fillText('⌂', 368, 25);

  // Search Pill
  ctx.fillStyle = '#1f1f1f';
  ctx.beginPath();
  ctx.roundRect(398, 8, 270, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#a7a7a7';
  ctx.font = '10px sans-serif';
  ctx.fillText('🔍 O que você quer ouvir?', 412, 25);

  // Browse box icon on right of search pill
  ctx.fillStyle = '#737373';
  ctx.font = '11px sans-serif';
  ctx.fillText('🗂', 644, 25);

  // Top-Right Notifications, Friends & User Avatar
  ctx.fillStyle = '#b3b3b3';
  ctx.font = '11px sans-serif';
  ctx.fillText('🔔', 848, 25);
  ctx.fillText('👥', 878, 25);

  // Circular User Avatar
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.arc(912, 21, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('RA', 906, 24);

  // Window Controls
  ctx.fillStyle = '#b3b3b3';
  ctx.font = '10px sans-serif';
  ctx.fillText('—   □   ✕', 955, 25);

  // --- 2. LEFT MINI LIBRARY RAIL (x = 6 to 48, y = 44 to 496) ---
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  ctx.roundRect(6, 44, 42, 452, 6);
  ctx.fill();

  // Top Library Icons
  ctx.fillStyle = '#b3b3b3';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('|||\\', 12, 60);
  ctx.fillText('+', 34, 60);

  // Stack of 10 playlist art thumbnails (26x26px, x = 14)
  const thumbDefs = [
    { bg: ['#4f46e5', '#7c3aed'], icon: '♥', textCol: '#ffffff' },
    { bg: ['#eab308', '#ca8a04'], icon: '🎤', textCol: '#000000' },
    { bg: ['#0284c7', '#0369a1'], icon: '🎧', textCol: '#ffffff' },
    { bg: ['#ec4899', '#be185d'], icon: '🌆', textCol: '#ffffff' },
    { bg: ['#374151', '#1f2937'], icon: '🎸', textCol: '#ffffff' },
    { bg: ['#06b6d4', '#0891b2'], icon: '⚡', textCol: '#ffffff' },
    { bg: ['#16a34a', '#15803d'], icon: '🌊', textCol: '#ffffff' },
    { bg: ['#2563eb', '#1d4ed8'], icon: '🛡', textCol: '#ffffff' },
    { bg: ['#e2e8f0', '#94a3b8'], icon: '✨', textCol: '#0f172a' },
    { bg: ['#dc2626', '#991b1b'], icon: '🔥', textCol: '#ffffff' }
  ];

  let thumbY = 72;
  for (const td of thumbDefs) {
    const tGrad = ctx.createLinearGradient(14, thumbY, 40, thumbY + 26);
    tGrad.addColorStop(0, td.bg[0]);
    tGrad.addColorStop(1, td.bg[1]);
    ctx.fillStyle = tGrad;
    ctx.beginPath();
    ctx.roundRect(14, thumbY, 26, 26, 3);
    ctx.fill();

    ctx.fillStyle = td.textCol;
    ctx.font = '9px sans-serif';
    ctx.fillText(td.icon, 21, thumbY + 17);
    thumbY += 32;
  }

  // --- 3. CENTER MAIN MUSIC FEED (x = 54 to 784, y = 44 to 496) ---
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  ctx.roundRect(54, 44, 730, 452, 6);
  ctx.fill();

  // Subtle upper slate ambience
  const feedGlow = ctx.createLinearGradient(54, 44, 54, 180);
  feedGlow.addColorStop(0, '#1c2430');
  feedGlow.addColorStop(1, '#121212');
  ctx.fillStyle = feedGlow;
  ctx.beginPath();
  ctx.roundRect(54, 44, 730, 136, [6, 6, 0, 0]);
  ctx.fill();

  // Filter Pills (Tudo, Músicas, Podcasts, Audiolivros)
  const pills = [
    { label: 'Tudo', active: true, x: 64, w: 44 },
    { label: 'Músicas', active: false, x: 114, w: 58 },
    { label: 'Podcasts', active: false, x: 178, w: 62 },
    { label: 'Audiolivros', active: false, x: 246, w: 72 }
  ];

  for (const p of pills) {
    if (p.active) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(p.x, 52, p.w, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 9.5px sans-serif';
    } else {
      ctx.fillStyle = '#242424';
      ctx.beginPath();
      ctx.roundRect(p.x, 52, p.w, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '9.5px sans-serif';
    }
    ctx.fillText(p.label, p.x + 8, 66);
  }

  // 2x4 Quick-Play Cards Grid (y = 80 to 148)
  const quickCards = [
    { title: 'Músicas Curtidas', bg: ['#4f46e5', '#7c3aed'], icon: '♥', col: 0, row: 0 },
    { title: 'Starlight (Remix)', bg: ['#0f172a', '#0284c7'], icon: '⚡', col: 1, row: 0 },
    { title: 'This Is Eminem', bg: ['#eab308', '#854d0e'], icon: '🎤', col: 2, row: 0 },
    { title: 'Adapt or Vanish', bg: ['#dc2626', '#450a0a'], icon: '⚔', col: 3, row: 0 },
    { title: 'Touch The Cosmos', bg: ['#06b6d4', '#164e63'], icon: '🪐', col: 0, row: 1 },
    { title: 'Top Hits de 2018', bg: ['#ec4899', '#831843'], icon: '⭐', col: 1, row: 1 },
    { title: 'Grand Theft Auto VI', bg: ['#f97316', '#7c2d12'], icon: '🌴', col: 2, row: 1 },
    { title: 'Escape The Noise', bg: ['#3b82f6', '#172554'], icon: '🎧', col: 3, row: 1 }
  ];

  for (const qc of quickCards) {
    const cardX = 64 + qc.col * 178;
    const cardY = 80 + qc.row * 36;
    ctx.fillStyle = '#242424';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, 172, 30, 4);
    ctx.fill();

    // Mini album square on left
    const qGrad = ctx.createLinearGradient(cardX, cardY, cardX + 30, cardY + 30);
    qGrad.addColorStop(0, qc.bg[0]);
    qGrad.addColorStop(1, qc.bg[1]);
    ctx.fillStyle = qGrad;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, 30, 30, [4, 0, 0, 4]);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.fillText(qc.icon, cardX + 9, cardY + 19);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(qc.title, cardX + 36, cardY + 19);
  }

  // Section 1: "Feito para Roc Admin"
  ctx.fillStyle = '#a7a7a7';
  ctx.font = '8.5px sans-serif';
  ctx.fillText('Feito para', 64, 166);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('Roc Admin', 64, 180);
  ctx.fillStyle = '#b3b3b3';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('Mostrar tudo', 720, 180);

  // Row of 6 Mix Cards (112x94px art)
  const mixCards = [
    { title: 'Descobertas da Semana', sub: 'Seu atalho para novas joias...', bg: ['#ec4899', '#1e1b4b'], badge: 'RADAR' },
    { title: 'DJ Beta', sub: 'Todo tipo de música escolhida...', bg: ['#1d4ed8', '#1e40af'], badge: 'DJ' },
    { title: 'Daily Mix 1', sub: 'dream_wave fm, Moebius...', bg: ['#0f766e', '#042f2e'], badge: 'MIX 01' },
    { title: 'Daily Mix 2', sub: 'Post Malone, Drake, Eminem...', bg: ['#ca8a04', '#422006'], badge: 'MIX 02' },
    { title: 'Daily Mix 3', sub: 'David Guetta, Tiësto, TELY...', bg: ['#ea580c', '#431407'], badge: 'MIX 03' },
    { title: 'Daily Mix 4', sub: 'Jagex Audio Team, LoL...', bg: ['#9333ea', '#3b0764'], badge: 'MIX 04' }
  ];

  for (let i = 0; i < mixCards.length; i++) {
    const mc = mixCards[i];
    const mx = 64 + i * 120;
    const my = 188;

    // Card background
    ctx.fillStyle = '#181818';
    ctx.beginPath();
    ctx.roundRect(mx, my, 114, 126, 6);
    ctx.fill();

    // Album art cover
    const mGrad = ctx.createLinearGradient(mx + 5, my + 5, mx + 109, my + 95);
    mGrad.addColorStop(0, mc.bg[0]);
    mGrad.addColorStop(1, mc.bg[1]);
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.roundRect(mx + 5, my + 5, 104, 82, 4);
    ctx.fill();

    // Badge on art
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.roundRect(mx + 10, my + 64, 42, 16, 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 7.5px sans-serif';
    ctx.fillText(mc.badge, mx + 14, my + 75);

    // Title & subtitle
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8.5px sans-serif';
    ctx.fillText(mc.title, mx + 5, my + 102);

    ctx.fillStyle = '#a7a7a7';
    ctx.font = '7px sans-serif';
    ctx.fillText(mc.sub, mx + 5, my + 114);
  }

  // Section 2: "Novos lançamentos para você"
  ctx.fillStyle = '#a7a7a7';
  ctx.font = '8px sans-serif';
  ctx.fillText('Músicas novinhas em folha dos artistas que você adora.', 64, 335);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('Novos lançamentos para você', 64, 349);
  ctx.fillStyle = '#b3b3b3';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('Mostrar tudo', 720, 349);

  // Row of 6 Album Release Cards
  const releaseCards = [
    { title: 'The Light We Lost', artist: 'dream_wave fm', bg: ['#38bdf8', '#0369a1'], symbol: '✧' },
    { title: 'FIRESTARTER', artist: 'R&L Sound Team', bg: ['#ef4444', '#7f1d1d'], symbol: '🔥' },
    { title: 'Origin', artist: 'Ilkay Sencan', bg: ['#d97706', '#78350f'], symbol: '☕' },
    { title: 'Fluxiverse Vol.3', artist: 'Flux Pavilion', bg: ['#06b6d4', '#155e75'], symbol: '⚡' },
    { title: 'Say It Back', artist: 'Gaullin', bg: ['#f97316', '#9a3412'], symbol: '🌅' },
    { title: 'Sad King', artist: 'Besomorph', bg: ['#be123c', '#4c0519'], symbol: '👑' }
  ];

  for (let i = 0; i < releaseCards.length; i++) {
    const rc = releaseCards[i];
    const rx = 64 + i * 120;
    const ry = 356;

    ctx.fillStyle = '#181818';
    ctx.beginPath();
    ctx.roundRect(rx, ry, 114, 126, 6);
    ctx.fill();

    const rGrad = ctx.createLinearGradient(rx + 5, ry + 5, rx + 109, ry + 95);
    rGrad.addColorStop(0, rc.bg[0]);
    rGrad.addColorStop(1, rc.bg[1]);
    ctx.fillStyle = rGrad;
    ctx.beginPath();
    ctx.roundRect(rx + 5, ry + 5, 104, 82, 4);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '22px sans-serif';
    ctx.fillText(rc.symbol, rx + 44, ry + 52);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8.5px sans-serif';
    ctx.fillText(rc.title, rx + 5, ry + 102);

    ctx.fillStyle = '#a7a7a7';
    ctx.font = '7.5px sans-serif';
    ctx.fillText(rc.artist, rx + 5, ry + 114);
  }

  // --- 4. RIGHT SIDEBAR ("NOW PLAYING") (x = 790 to 1018, y = 44 to 496) ---
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  ctx.roundRect(790, 44, 228, 452, 6);
  ctx.fill();

  // Sidebar Header
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('Starlight (Skrillex & ring noord Remix)', 798, 60);

  // Large Cover Art (x = 798, y = 68, w = 212, h = 175)
  ctx.fillStyle = '#080d1a';
  ctx.beginPath();
  ctx.roundRect(798, 68, 212, 175, 6);
  ctx.fill();

  // Cyan Radar Grid & Targeting Insignia
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 0.5;
  for (let gx = 808; gx < 1000; gx += 20) {
    ctx.beginPath(); ctx.moveTo(gx, 68); ctx.lineTo(gx, 243); ctx.stroke();
  }
  for (let gy = 78; gy < 240; gy += 20) {
    ctx.beginPath(); ctx.moveTo(798, gy); ctx.lineTo(1010, gy); ctx.stroke();
  }

  // Target rings
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(904, 155, 30, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(904, 155, 55, 0, Math.PI * 2); ctx.stroke();

  // Glowing center winged sword emblem
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(904, 105); ctx.lineTo(904, 205);
  ctx.moveTo(864, 155); ctx.lineTo(944, 155);
  ctx.moveTo(884, 125); ctx.lineTo(904, 105); ctx.lineTo(924, 125);
  ctx.stroke();

  // Track Details underneath cover art
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('Starlight - Skrillex & ring noord Re...', 798, 262);

  ctx.fillStyle = '#a7a7a7';
  ctx.font = '8px sans-serif';
  ctx.fillText('Danny L Harle, PinkPantheress, Skrillex...', 798, 276);

  // Circle plus icon
  ctx.strokeStyle = '#b3b3b3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(996, 268, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#b3b3b3';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('+', 994, 271);

  // Section: "Videoclipes relacionados"
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.fillText('Videoclipes relacionados', 798, 302);

  // Video 1
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(798, 312, 102, 54, 4);
  ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.font = '16px sans-serif';
  ctx.fillText('🏔', 838, 342);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('On A Mountain', 798, 376);
  ctx.fillStyle = '#a7a7a7';
  ctx.font = '7px sans-serif';
  ctx.fillText('Danny L Harle, DJ...', 798, 386);

  // Video 2
  ctx.fillStyle = '#450a0a';
  ctx.beginPath();
  ctx.roundRect(908, 312, 102, 54, 4);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.font = '16px sans-serif';
  ctx.fillText('🌋', 948, 342);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('Interlocked', 908, 376);
  ctx.fillStyle = '#a7a7a7';
  ctx.font = '7px sans-serif';
  ctx.fillText('Danny L Harle, DJ...', 908, 386);

  // Section: "Sobre o artista"
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9.5px sans-serif';
  ctx.fillText('Sobre o artista', 798, 412);

  // Artist Card
  ctx.fillStyle = '#1c1c1c';
  ctx.beginPath();
  ctx.roundRect(798, 420, 212, 68, 4);
  ctx.fill();

  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.arc(816, 442, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('Danny L Harle', 834, 438);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('✓ Artista Verificado', 834, 450);

  ctx.fillStyle = '#a7a7a7';
  ctx.font = '7.5px sans-serif';
  ctx.fillText('3.489.120 ouvintes mensais', 806, 468);
  ctx.fillText('Londres, Reino Unido • Electronic / Hyperpop', 806, 479);

  // --- 5. BOTTOM PLAYER CONTROLS BAR (y = 498 to 542) ---
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 498, 1024, 44);

  // Left Track Info
  ctx.fillStyle = '#080d1a';
  ctx.beginPath();
  ctx.roundRect(16, 503, 34, 34, 3);
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('Starlight - Skrillex & ring noord Remix', 58, 517);

  ctx.fillStyle = '#a7a7a7';
  ctx.font = '7.5px sans-serif';
  ctx.fillText('Danny L Harle, PinkPantheress, Skrillex', 58, 529);

  // Green Heart
  ctx.fillStyle = '#1db954';
  ctx.font = '11px sans-serif';
  ctx.fillText('♥', 236, 524);

  // Center Playback Controls
  ctx.fillStyle = '#a7a7a7';
  ctx.font = '11px sans-serif';
  ctx.fillText('⇄', 450, 516);

  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText('⏮', 478, 516);

  // Circular Play Button
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(512, 513, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('▶', 509.5, 517);

  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText('⏭', 542, 516);

  ctx.fillStyle = '#a7a7a7';
  ctx.font = '11px sans-serif';
  ctx.fillText('↻', 570, 516);

  // Seekbar
  ctx.fillStyle = '#a7a7a7';
  ctx.font = '7.5px sans-serif';
  ctx.fillText('1:00', 374, 532);

  ctx.fillStyle = '#4d4d4d';
  ctx.beginPath();
  ctx.roundRect(396, 529, 230, 3, 1.5);
  ctx.fill();

  // Active portion & white scrubber knob
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(396, 529, 82, 3, 1.5);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(478, 530.5, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#a7a7a7';
  ctx.fillText('2:55', 632, 532);

  // Right Controls
  ctx.fillStyle = '#b3b3b3';
  ctx.font = '10px sans-serif';
  ctx.fillText('🎤   ☰   💻   🔊', 838, 524);

  // Volume slider
  ctx.fillStyle = '#4d4d4d';
  ctx.beginPath();
  ctx.roundRect(930, 521, 60, 3, 1.5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(930, 521, 38, 3, 1.5);
  ctx.fill();

  // --- 6. WINDOWS 11 DARK TASKBAR (y = 542 to 576) ---
  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 542, 1024, 34);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 542.5);
  ctx.lineTo(1024, 542.5);
  ctx.stroke();

  // Centered Windows 11 App Icons
  const taskIcons = [
    { type: 'start', x: 426 },
    { type: 'search', x: 454 },
    { type: 'taskview', x: 482 },
    { type: 'explorer', x: 510 },
    { type: 'edge', x: 538 },
    { type: 'spotify', x: 566 },
    { type: 'terminal', x: 594 },
    { type: 'discord', x: 622 }
  ];

  for (const ti of taskIcons) {
    const cx = ti.x + 9;
    const cy = 558;

    if (ti.type === 'start') {
      ctx.fillStyle = '#0078d4';
      ctx.fillRect(cx - 7, cy - 7, 6, 6);
      ctx.fillRect(cx + 1, cy - 7, 6, 6);
      ctx.fillRect(cx - 7, cy + 1, 6, 6);
      ctx.fillRect(cx + 1, cy + 1, 6, 6);
    } else if (ti.type === 'search') {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx - 1, cy - 1, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 3, cy + 3); ctx.lineTo(cx + 7, cy + 7); ctx.stroke();
    } else if (ti.type === 'taskview') {
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(cx - 7, cy - 4, 7, 9);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 2, cy - 7, 7, 9);
    } else if (ti.type === 'explorer') {
      ctx.fillStyle = '#eab308';
      ctx.fillRect(cx - 7, cy - 5, 14, 11);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - 5, cy - 7, 6, 3);
    } else if (ti.type === 'edge') {
      ctx.fillStyle = '#0284c7';
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 4, 0, Math.PI * 2); ctx.fill();
    } else if (ti.type === 'spotify') {
      // Vibrant Spotify Green Circle
      ctx.fillStyle = '#1db954';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();

      // Sound waves inside Spotify icon
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy + 4, 6, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + 5, 4, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();

      // Active app indicator pill underneath icon
      ctx.fillStyle = '#1db954';
      ctx.beginPath();
      ctx.roundRect(cx - 6, 571, 12, 2.5, 1.25);
      ctx.fill();
    } else if (ti.type === 'terminal') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - 7, cy - 6, 14, 12);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 7, cy - 6, 14, 12);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7px monospace';
      ctx.fillText('>_', cx - 5, cy + 3);
    } else if (ti.type === 'discord') {
      ctx.fillStyle = '#5865f2';
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('🎮', cx - 4, cy + 3);
    }
  }

  // System Tray on far right
  ctx.fillStyle = '#a7a7a7';
  ctx.font = '8px sans-serif';
  ctx.fillText('POR PTB2', 885, 562);
  ctx.fillText('📶  🔊  🔋', 932, 562);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('12:30', 980, 555);
  ctx.fillStyle = '#a7a7a7';
  ctx.font = '7.5px sans-serif';
  ctx.fillText('26/10/2026', 972, 566);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural breathable mesh texture (256x256) for ergonomic office chair backrests.
 * Open diamond lattice (16px spacing, 3px line width, ~70% transparent) in #4a525e.
 */
function createChairMeshTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256); // 100% transparent base

  // Medium-light charcoal grey lines that catch datacenter illumination
  ctx.strokeStyle = '#4a525e';
  ctx.lineWidth = 3;

  // Crisp, open diamond lattice (16px cell spacing, leaving ~70% open transparent area)
  const step = 16;
  ctx.beginPath();
  for (let x = -256; x <= 512; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 256, 256);
    ctx.moveTo(x, 256);
    ctx.lineTo(x + 256, 0);
  }
  ctx.stroke();

  // Subtle intersection reinforcement dots (accentuates breathable weave)
  ctx.fillStyle = '#64748b';
  for (let y = 0; y <= 256; y += step) {
    for (let x = (y % (step * 2) === 0 ? 0 : step / 2); x <= 256; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 6);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Sculpted single-extrusion 2D Shape for the ergonomic chair backrest outer frame.
 * 0.60m at shoulders, 0.50m at base, with rounded corners and arched top header.
 * Punches a large inner window hole with smooth beveled borders.
 */
function createBackrestFrameGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.24, 0);
  shape.quadraticCurveTo(0.25, 0.01, 0.25, 0.03);
  shape.lineTo(0.26, 0.22);
  shape.lineTo(0.30, 0.52);
  shape.quadraticCurveTo(0.30, 0.62, 0.27, 0.64);
  shape.quadraticCurveTo(0.14, 0.68, 0, 0.68);
  shape.quadraticCurveTo(-0.14, 0.68, -0.27, 0.64);
  shape.quadraticCurveTo(-0.30, 0.62, -0.30, 0.52);
  shape.lineTo(-0.26, 0.22);
  shape.lineTo(-0.25, 0.03);
  shape.quadraticCurveTo(-0.25, 0.01, -0.24, 0);
  shape.closePath();

  // Inner cutout hole for breathable mesh
  const hole = new THREE.Path();
  hole.moveTo(0, 0.04);
  hole.lineTo(-0.205, 0.04);
  hole.quadraticCurveTo(-0.215, 0.05, -0.215, 0.07);
  hole.lineTo(-0.22, 0.22);
  hole.lineTo(-0.255, 0.51);
  hole.quadraticCurveTo(-0.255, 0.59, -0.23, 0.605);
  hole.quadraticCurveTo(-0.12, 0.635, 0, 0.635);
  hole.quadraticCurveTo(0.12, 0.635, 0.23, 0.605);
  hole.quadraticCurveTo(0.255, 0.59, 0.255, 0.51);
  hole.lineTo(0.22, 0.22);
  hole.lineTo(0.215, 0.07);
  hole.quadraticCurveTo(0.215, 0.05, 0.205, 0.04);
  hole.closePath();

  shape.holes.push(hole);

  const extrudeSettings = {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 12,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Center Z depth
  geo.translate(0, 0, -0.035 / 2);
  return geo;
}

/**
 * Sculpted beveled seat cushion (width: 0.64m, depth: 0.60m, thickness: 0.085m).
 * Extruded with soft rounded upholstery edges and curved waterfall front.
 */
function createSeatCushionGeometry() {
  const shape = new THREE.Shape();
  const hw = 0.30;
  const hd = 0.28;
  const r = 0.08;

  shape.moveTo(-hw + r, -hd);
  shape.quadraticCurveTo(0, -hd - 0.02, hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const extrudeSettings = {
    depth: 0.049,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 3,
    curveSegments: 12,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, -0.018, 0); // Top plush surface sits exactly at Y = 0
  return geo;
}

/**
 * Sculpted beveled forearm pad for T-armrests (0.095m x 0.028m x 0.30m).
 */
function createArmPadGeometry() {
  const shape = new THREE.Shape();
  const hw = 0.042;
  const hd = 0.14;
  const r = 0.035;

  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const extrudeSettings = {
    depth: 0.016,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 8,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, -0.006, 0); // Top forearm rest surface sits exactly at Y = 0
  return geo;
}

/**
 * Procedural High-Detail Mechanical Keyboard Diffuse & Emissive Canvas Textures (1024x384).
 * Creates a crisp 104-key gaming keyboard layout with:
 * - Clean dark matte keycap tops (#252932) separated by dark recessed switch gaps (#0b0d12).
 * - Signature Tactical Red ESC key (#dc2626) in top-left.
 * - Warm amber accents on ENTER, SPACE, and WASD / Arrow keys (#f59e0b).
 * - Crisp micro-legends on keycaps and 3 glowing terminal green status LEDs (NUM, CAPS, SCRL) (#22c55e).
 */
function createMechanicalKeyboardTextures() {
  const dCanvas = document.createElement('canvas');
  dCanvas.width = 1024;
  dCanvas.height = 384;
  const dCtx = dCanvas.getContext('2d');

  const eCanvas = document.createElement('canvas');
  eCanvas.width = 1024;
  eCanvas.height = 384;
  const eCtx = eCanvas.getContext('2d');

  // Base background: dark recessed switch plate (#0b0d12)
  dCtx.fillStyle = '#0b0d12';
  dCtx.fillRect(0, 0, 1024, 384);

  // Emissive is pure black (#000000)
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 1024, 384);

  // Helper for drawing an individual keycap
  const drawKey = (x, y, w, h, label, bg = '#252932', textCol = '#cbd5e1', fontSize = 11, fontBold = false, accentBottom = null, emissiveColor = null) => {
    // Keycap shadow base
    dCtx.fillStyle = '#14171e';
    dCtx.fillRect(x, y, w, h);

    // Keycap top face
    dCtx.fillStyle = bg;
    dCtx.fillRect(x + 1, y + 1, w - 2, h - 2);

    // Top bevel highlight
    dCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    dCtx.fillRect(x + 1, y + 1, w - 2, 2);

    // Bottom bevel shadow
    dCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    dCtx.fillRect(x + 1, y + h - 3, w - 2, 2);

    // Optional accent bottom bar (WASD, Enter, etc.)
    if (accentBottom) {
      dCtx.fillStyle = accentBottom;
      dCtx.fillRect(x + 3, y + h - 4, w - 6, 2);
    }

    // Legend
    if (label) {
      dCtx.fillStyle = textCol;
      dCtx.font = `${fontBold ? 'bold ' : ''}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      dCtx.textAlign = 'center';
      dCtx.textBaseline = 'middle';
      dCtx.fillText(label, x + w / 2, y + h / 2 - 1);
    }

    // Emissive mask
    if (emissiveColor) {
      eCtx.fillStyle = emissiveColor;
      eCtx.fillRect(x + 1, y + 1, w - 2, h - 2);
    } else if (accentBottom) {
      eCtx.fillStyle = accentBottom;
      eCtx.fillRect(x + 3, y + h - 4, w - 6, 2);
    }
  };

  // 1. Function Row (y = 22, h = 42)
  // Standard black ESC key, matching F1-F12
  drawKey(24, 22, 40, 42, 'ESC', '#252932', '#cbd5e1', 11, false, null, null);

  // F1-F4
  const fKeys1 = ['F1', 'F2', 'F3', 'F4'];
  for (let i = 0; i < fKeys1.length; i++) {
    drawKey(84 + i * 40, 22, 36, 42, fKeys1[i]);
  }
  // F5-F8
  const fKeys2 = ['F5', 'F6', 'F7', 'F8'];
  for (let i = 0; i < fKeys2.length; i++) {
    drawKey(264 + i * 40, 22, 36, 42, fKeys2[i]);
  }
  // F9-F12
  const fKeys3 = ['F9', 'F10', 'F11', 'F12'];
  for (let i = 0; i < fKeys3.length; i++) {
    drawKey(444 + i * 40, 22, 36, 42, fKeys3[i]);
  }

  // Top Nav (Prt, Scr, Pau)
  const navTop = ['PRT', 'SCR', 'PAU'];
  for (let i = 0; i < navTop.length; i++) {
    drawKey(648 + i * 40, 22, 36, 42, navTop[i], '#252932', '#94a3b8', 10);
  }

  // Status LEDs Area (x = 794 to 994, y = 22 to 64)
  dCtx.fillStyle = '#12151c';
  dCtx.fillRect(794, 22, 200, 42);
  dCtx.strokeStyle = '#222733';
  dCtx.lineWidth = 1.5;
  dCtx.strokeRect(794.5, 22.5, 199, 41);

  const ledLabels = ['NUM', 'CAPS', 'SCRL'];
  const ledX = [834, 894, 954];
  for (let i = 0; i < 3; i++) {
    const lx = ledX[i];
    // Label above LED
    dCtx.fillStyle = '#94a3b8';
    dCtx.font = 'bold 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    dCtx.textAlign = 'center';
    dCtx.textBaseline = 'middle';
    dCtx.fillText(ledLabels[i], lx, 33);

    // Glowing Green LED on Diffuse
    const g = dCtx.createRadialGradient(lx, 49, 1, lx, 49, 7);
    g.addColorStop(0, '#86efac');
    g.addColorStop(0.4, '#22c55e');
    g.addColorStop(1, 'rgba(34, 197, 94, 0)');
    dCtx.fillStyle = g;
    dCtx.beginPath();
    dCtx.arc(lx, 49, 7, 0, Math.PI * 2);
    dCtx.fill();

    dCtx.fillStyle = '#dcfce7';
    dCtx.beginPath();
    dCtx.arc(lx, 49, 2.5, 0, Math.PI * 2);
    dCtx.fill();

    // Glowing Green LED on Emissive Map
    const eg = eCtx.createRadialGradient(lx, 49, 1, lx, 49, 9);
    eg.addColorStop(0, '#86efac');
    eg.addColorStop(0.5, '#22c55e');
    eg.addColorStop(1, '#000000');
    eCtx.fillStyle = eg;
    eCtx.beginPath();
    eCtx.arc(lx, 49, 9, 0, Math.PI * 2);
    eCtx.fill();
  }

  // 2. Main 60% Alphanumeric Block (x = 24 to 618, y = 74 to 362)
  // Row 1: Number row (y = 74, h = 50)
  const row1Keys = ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
  for (let i = 0; i < row1Keys.length; i++) {
    drawKey(24 + i * 40, 74, 36, 50, row1Keys[i]);
  }
  drawKey(544, 74, 74, 50, 'BACKSPACE', '#20242c', '#94a3b8', 9);

  // Row 2: QWERTY row (y = 130, h = 50)
  drawKey(24, 130, 54, 50, 'TAB', '#20242c', '#94a3b8', 10);
  const row2Keys = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'];
  for (let i = 0; i < row2Keys.length; i++) {
    const kx = 82 + i * 40;
    const k = row2Keys[i];
    if (k === 'W') {
      // Tactical W gamer key
      drawKey(kx, 130, 36, 50, 'W', '#333a48', '#ffffff', 12, true, '#f59e0b');
    } else {
      drawKey(kx, 130, 36, 50, k);
    }
  }

  // Row 3: ASDF row (y = 186, h = 50)
  drawKey(24, 186, 64, 50, 'CAPS', '#20242c', '#94a3b8', 10);
  const row3Keys = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'"];
  for (let i = 0; i < row3Keys.length; i++) {
    const kx = 92 + i * 40;
    const k = row3Keys[i];
    if (k === 'A' || k === 'S' || k === 'D') {
      // Tactical ASD gamer keys
      drawKey(kx, 186, 36, 50, k, '#333a48', '#ffffff', 12, true, '#f59e0b');
    } else {
      drawKey(kx, 186, 36, 50, k);
    }
  }
  // ENTER key with warm accent
  drawKey(532, 186, 86, 50, 'ENTER ↵', '#2d3544', '#f59e0b', 11, true, null, '#b45309');

  // Row 4: ZXCV row (y = 242, h = 50)
  drawKey(24, 242, 84, 50, 'SHIFT', '#20242c', '#94a3b8', 10);
  const row4Keys = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/'];
  for (let i = 0; i < row4Keys.length; i++) {
    drawKey(112 + i * 40, 242, 36, 50, row4Keys[i]);
  }
  drawKey(512, 242, 106, 50, 'SHIFT', '#20242c', '#94a3b8', 10);

  // Row 5: Space row (y = 298, h = 64)
  drawKey(24, 298, 46, 64, 'CTRL', '#20242c', '#94a3b8', 10);
  drawKey(74, 298, 42, 64, 'WIN', '#20242c', '#94a3b8', 10);
  drawKey(120, 298, 44, 64, 'ALT', '#20242c', '#94a3b8', 10);
  // Distinct raised SPACEBAR top art
  drawKey(168, 298, 276, 64, '—', '#282d38', '#f59e0b', 14, true, '#f59e0b');
  drawKey(448, 298, 44, 64, 'ALT', '#20242c', '#94a3b8', 10);
  drawKey(496, 298, 42, 64, 'WIN', '#20242c', '#94a3b8', 10);
  drawKey(542, 298, 36, 64, 'FN', '#20242c', '#94a3b8', 9);
  drawKey(582, 298, 36, 64, 'CTRL', '#20242c', '#94a3b8', 9);

  // 3. Nav Cluster (x = 648 to 768)
  const navR1 = ['INS', 'HOME', 'PGUP'];
  for (let i = 0; i < 3; i++) drawKey(648 + i * 40, 74, 36, 50, navR1[i], '#252932', '#94a3b8', 9);
  const navR2 = ['DEL', 'END', 'PGDN'];
  for (let i = 0; i < 3; i++) drawKey(648 + i * 40, 130, 36, 50, navR2[i], '#252932', '#94a3b8', 9);

  // Inverted-T Arrows
  drawKey(688, 242, 36, 50, '▲', '#333a48', '#f59e0b', 12, true, '#f59e0b');
  drawKey(648, 298, 36, 64, '◄', '#333a48', '#f59e0b', 12, true, '#f59e0b');
  drawKey(688, 298, 36, 64, '▼', '#333a48', '#f59e0b', 12, true, '#f59e0b');
  drawKey(728, 298, 36, 64, '►', '#333a48', '#f59e0b', 12, true, '#f59e0b');

  // 4. Numpad Block (x = 794 to 994)
  const numR1 = ['NUM', '/', '*', '-'];
  for (let i = 0; i < 4; i++) drawKey(794 + i * 50, 74, 46, 50, numR1[i], '#22262e', '#94a3b8', 10);

  const numR2 = ['7', '8', '9'];
  for (let i = 0; i < 3; i++) drawKey(794 + i * 50, 130, 46, 50, numR2[i]);
  drawKey(944, 130, 46, 106, '+', '#22262e', '#cbd5e1', 14); // Tall +

  const numR3 = ['4', '5', '6'];
  for (let i = 0; i < 3; i++) drawKey(794 + i * 50, 186, 46, 50, numR3[i]);

  const numR4 = ['1', '2', '3'];
  for (let i = 0; i < 3; i++) drawKey(794 + i * 50, 242, 46, 50, numR4[i]);
  drawKey(944, 242, 46, 120, 'ENT', '#2d3544', '#f59e0b', 11, true, null, '#b45309'); // Tall Enter

  drawKey(794, 298, 96, 64, '0'); // Double-width 0
  drawKey(894, 298, 46, 64, '.');

  // 5. PBT Keycap Micro-Grain Noise
  const imgData = dCtx.getImageData(0, 0, 1024, 384);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 18 || data[i + 1] > 18 || data[i + 2] > 18) {
      const noise = (Math.random() - 0.5) * 8;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i] + noise));
    }
  }
  dCtx.putImageData(imgData, 0, 0);

  const diffuseTexture = new THREE.CanvasTexture(dCanvas);
  diffuseTexture.colorSpace = THREE.SRGBColorSpace;
  diffuseTexture.anisotropy = 4;
  diffuseTexture.needsUpdate = true;

  const emissiveTexture = new THREE.CanvasTexture(eCanvas);
  emissiveTexture.colorSpace = THREE.SRGBColorSpace;
  emissiveTexture.anisotropy = 4;
  emissiveTexture.needsUpdate = true;

  return { diffuseTexture, emissiveTexture };
}

/**
 * Procedural Tactical Stitched Mousepad Texture (512x430).
 * High-durability micro-weave cloth with dark stitched perimeter border
 * and a subtle tactical orange/red brand tag in the top-right corner.
 */
function createTacticalMousepadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 430;
  const ctx = canvas.getContext('2d');

  // 1. Dark Matte Cloth Weave Base (#14171f)
  ctx.fillStyle = '#14171f';
  ctx.fillRect(0, 0, 512, 430);

  // Micro-weave crosshatch pattern
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  for (let y = 0; y < 430; y += 4) {
    for (let x = (y % 8 === 0 ? 0 : 2); x < 512; x += 4) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // 2. Heavy Stitched Perimeter Border
  // Outer rubber edge (#0c0e13)
  ctx.strokeStyle = '#0c0e13';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 498, 416);

  // Dark stitched seam with dashed lines (#282e3d and #384155)
  ctx.strokeStyle = '#282e3d';
  ctx.lineWidth = 3.5;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(12, 12, 488, 406);

  ctx.strokeStyle = '#384155';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 8]);
  ctx.strokeRect(12, 12, 488, 406);
  ctx.setLineDash([]); // reset

  // 3. Tactical Woven Brand Tag in top-right corner (x = 438..488, y = 6..28)
  ctx.fillStyle = '#ea580c'; // Vibrant tactical orange/red
  ctx.fillRect(438, 6, 50, 22);
  ctx.fillStyle = '#c2410c';
  ctx.fillRect(438, 26, 50, 2);

  // Tag micro-brand text "ROC"
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ROC', 463, 16);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a raised 3D keycap island block inside the keyboard keywell.
 * Assigns planar projection UVs across (X: -0.208..+0.208, Z: -0.064..+0.064)
 * on top faces (+Y normal), and dark matte border UVs on side/bottom faces.
 */
function createKeycapBlockGeometry(w, h, d, localX, localZ) {
  const box = new THREE.BoxGeometry(w, h, d);
  box.translate(localX, h / 2, localZ);
  const nonIndexed = box.toNonIndexed();
  box.dispose();

  const pos = nonIndexed.getAttribute('position');
  const norm = nonIndexed.getAttribute('normal');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  // Keybed range in local space: X: -0.208 to +0.208 (width 0.416m), Z: -0.064 to +0.064 (depth 0.128m)
  for (let i = 0; i < count; i++) {
    const ny = norm.getY(i);
    if (ny > 0.5) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const u = Math.min(1, Math.max(0, (0.208 - vx) / 0.416));
      const v = Math.min(1, Math.max(0, (vz + 0.064) / 0.128));
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    } else {
      uvs[i * 2] = 0.005;
      uvs[i * 2 + 1] = 0.005;
    }
  }
  nonIndexed.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return nonIndexed;
}

/**
 * Creates a stitched tactical mousepad geometry with top-face planar UVs.
 */
function createMousepadGeometry(w, h, d) {
  const box = new THREE.BoxGeometry(w, h, d);
  const nonIndexed = box.toNonIndexed();
  box.dispose();

  const pos = nonIndexed.getAttribute('position');
  const norm = nonIndexed.getAttribute('normal');
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  // Top face (+Y): U = 0..1 from left to right, V = 0..1 from front to rear
  for (let i = 0; i < count; i++) {
    const ny = norm.getY(i);
    if (ny > 0.5) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      uvs[i * 2] = Math.min(1, Math.max(0, (w / 2 - vx) / w));
      uvs[i * 2 + 1] = Math.min(1, Math.max(0, (vz + d / 2) / d));
    } else {
      uvs[i * 2] = 0.01;
      uvs[i * 2 + 1] = 0.01;
    }
  }
  nonIndexed.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return nonIndexed;
}

/**
 * Creates the sleek, ergonomic contoured lower base chassis for the wireless mouse.
 * Features an organic hourglass shape with thumb rest and pinky contours.
 */
function createSculptedMouseBaseGeometry() {
  const shape = new THREE.Shape();
  // 2D shape in X-Y where 3D Z = -Y
  // Front nose (3D Z = +0.056) -> 2D Y = -0.056
  shape.moveTo(0, -0.056);
  // Front-left nose curve
  shape.quadraticCurveTo(0.014, -0.056, 0.024, -0.048);
  // Left button flare
  shape.lineTo(0.028, -0.025);
  // Left thumb ergonomic waist (contour flare for right hand)
  shape.quadraticCurveTo(0.032, -0.010, 0.032, 0.012);
  shape.quadraticCurveTo(0.032, 0.032, 0.028, 0.044);
  // Rear-left palm curve to center tail (3D Z = -0.056) -> 2D Y = +0.056
  shape.quadraticCurveTo(0.022, 0.056, 0, 0.056);
  // Rear-right palm curve
  shape.quadraticCurveTo(-0.022, 0.056, -0.028, 0.044);
  // Right pinky waist curve
  shape.quadraticCurveTo(-0.031, 0.025, -0.029, 0.000);
  shape.quadraticCurveTo(-0.028, -0.025, -0.026, -0.042);
  // Front-right nose curve back to center
  shape.quadraticCurveTo(-0.018, -0.056, 0, -0.056);

  const extrudeSettings = {
    depth: 0.005,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 3,
    curveSegments: 16,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/**
 * Creates the organic, smooth 3D curved palm dome hump for the wireless mouse.
 * 8-segment bevel creates a continuous organic injection-molded shell.
 */
function createSculptedMousePalmGeometry() {
  const shape = new THREE.Shape();
  // Covers palm region from 3D Z = +0.008 (front seam) to 3D Z = -0.052 (rear tail)
  // In 2D: Y = -0.008 to Y = +0.052
  shape.moveTo(-0.024, -0.008);
  shape.lineTo(0.025, -0.008);
  // Left palm curve
  shape.quadraticCurveTo(0.029, 0.012, 0.028, 0.034);
  // Rear palm dome curve
  shape.quadraticCurveTo(0.022, 0.052, 0, 0.052);
  // Right palm dome curve
  shape.quadraticCurveTo(-0.022, 0.052, -0.026, 0.034);
  shape.quadraticCurveTo(-0.027, 0.012, -0.024, -0.008);

  const extrudeSettings = {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.016, // 16mm smooth organic bevel dome
    bevelSize: 0.004,
    bevelSegments: 8,     // 8 smooth curved segments
    curveSegments: 16,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.007, 0); // Sits smoothly on top of base
  return geo;
}

/**
 * Creates sculpted, beveled left or right click button plates.
 */
function createSculptedMouseButtonGeometry(isLeft = true) {
  const shape = new THREE.Shape();
  // 3D Z: +0.008 to +0.054 -> 2D Y: -0.008 to -0.054
  // For left button (user's left +X): x from +0.002 to +0.026
  // For right button (user's right -X): x from -0.026 to -0.002
  const innerX = isLeft ? 0.0025 : -0.0025;
  const outerXFront = isLeft ? 0.018 : -0.018;
  const outerXRear = isLeft ? 0.026 : -0.026;

  shape.moveTo(innerX, -0.008);
  shape.lineTo(outerXRear, -0.008);
  shape.lineTo(outerXFront, -0.046);
  // Curved front tip
  shape.quadraticCurveTo(outerXFront * 0.7, -0.054, innerX, -0.054);
  shape.lineTo(innerX, -0.008);

  const extrudeSettings = {
    depth: 0.004,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.0015,
    bevelSegments: 3,
    curveSegments: 10,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.rotateX(-Math.PI / 2);
  // Slope downward from rear (Z = 0.008, Y ~ 0.020m) to front tip (Z = 0.054, Y ~ 0.011m)
  geo.rotateX(0.14);
  geo.translate(0, 0.019, 0);
  return geo;
}

/**
 * Creates an unmirrored rectangular faceplate pointing toward -Z (toward player at -Z).
 * In camera space when looking along +Z:
 * Local X = +hw (Screen Left) -> UV U = 0 (Canvas Left: Optical Drive Bay)
 * Local X = -hw (Screen Right) -> UV U = 1 (Canvas Right: Brushed Grey I/O Strip + Asset Tag)
 * Local Y = +hh (Screen Top) -> UV V = 1 (Canvas Top: Power button, ODD top)
 * Local Y = -hh (Screen Bottom) -> UV V = 0 (Canvas Bottom: Asset Tag)
 * Normal points strictly along (0, 0, -1).
 */
function createFrontBezelPlane(w, h) {
  const geo = new THREE.BufferGeometry();
  const hw = w / 2;
  const hh = h / 2;

  const positions = new Float32Array([
     hw,  hh, 0, // 0: Screen Top-Left
    -hw,  hh, 0, // 1: Screen Top-Right
     hw, -hh, 0, // 2: Screen Bottom-Left
    -hw, -hh, 0  // 3: Screen Bottom-Right
  ]);

  const normals = new Float32Array([
    0, 0, -1,
    0, 0, -1,
    0, 0, -1,
    0, 0, -1
  ]);

  const uvs = new Float32Array([
    0, 1, // 0: Screen Top-Left -> Canvas (0, 1)
    1, 1, // 1: Screen Top-Right -> Canvas (1, 1)
    0, 0, // 2: Screen Bottom-Left -> Canvas (0, 0)
    1, 0  // 3: Screen Bottom-Right -> Canvas (1, 0)
  ]);

  const indices = [0, 2, 1, 1, 2, 3];

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Creates a circular disc pointing toward -Z where:
 * In camera space when looking along +Z:
 * Local X = +radius (Screen Left) -> UV U = 0 (Upright "P")
 * Local X = -radius (Screen Right) -> UV U = 1 (Tilted "C")
 * Normal points strictly along (0, 0, -1).
 */
function createFrontBadgeCircle(radius, segments = 32) {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  // Center vertex
  positions.push(0, 0, 0);
  normals.push(0, 0, -1);
  uvs.push(0.5, 0.5);

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = radius * Math.cos(theta);
    const y = radius * Math.sin(theta);
    positions.push(x, y, 0);
    normals.push(0, 0, -1);
    uvs.push(-x / (2 * radius) + 0.5, y / (2 * radius) + 0.5);
  }

  for (let i = 1; i <= segments; i++) {
    indices.push(0, i + 1, i);
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Helper to draw a rounded rectangle on a 2D canvas.
 */
function drawSFFRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Procedural Front Bezel Texture (512x1024) for Enterprise SFF Desktop PC.
 * Inspired by Dell OptiPlex SFF industrial design:
 * - Vertical louver grille with alternating dark ribs and deep shadow channels
 * - Upper-left slim optical drive bay with eject button and activity LED
 * - Upper-right brushed grey I/O plate with circular power button, ice-blue LED slit,
 *   headphone jack with headset icon, 2x USB-A with trident icons, 1x USB-A + 1x USB-C with 5Gbps/10Gbps labels
 * - Center circular Parody "PC" badge: brushed-silver outer ring, dark disc, upright "P" & 28° tilted "C"
 * - Bottom-right service tag / asset plate with barcode
 */
function createSFFFrontTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // 1. Dark Matte ABS Outer Bezel Frame (#111318)
  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, 512, 1024);

  // Recessed Grille Bed (#07080b)
  ctx.fillStyle = '#07080b';
  ctx.fillRect(16, 16, 480, 992);

  // 2. Vertical Louver Slats (Alternating #1c2026 ribs and #07080b air intake channels)
  for (let sx = 20; sx < 490; sx += 12) {
    // Slat Rib Body
    ctx.fillStyle = '#1c2026';
    ctx.fillRect(sx, 18, 7.5, 988);

    // Left Highlight Bevel (#2d333e)
    ctx.fillStyle = '#2d333e';
    ctx.fillRect(sx, 18, 1.2, 988);

    // Right Deep Shadow Bevel (#0b0d10)
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(sx + 6.3, 18, 1.2, 988);
  }

  // 3. Upper-Left Slim Optical Drive Bay (Vertical laptop-style 9.5mm tray)
  // X = 34..76 (width 42px), Y = 30..460 (height 430px)
  ctx.fillStyle = '#07080a';
  ctx.fillRect(32, 28, 46, 434);

  ctx.fillStyle = '#171a21';
  ctx.fillRect(34, 30, 42, 430);

  // Optical drive tray seam line along right edge
  ctx.fillStyle = '#08090c';
  ctx.fillRect(74, 30, 2, 430);
  ctx.fillStyle = '#282e38';
  ctx.fillRect(76, 30, 1, 430);

  // Slim optical drive tray subtle vertical ribbing
  for (let ox = 38; ox < 72; ox += 8) {
    ctx.fillStyle = '#1e222a';
    ctx.fillRect(ox, 34, 4, 340);
  }

  // ODD Activity LED (tiny green slit)
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(53, 392, 4, 3);

  // Emergency eject pinhole
  ctx.fillStyle = '#090a0d';
  ctx.beginPath();
  ctx.arc(55, 410, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Rectangular Eject Button with Eject Symbol
  ctx.fillStyle = '#282d38';
  drawSFFRoundRect(ctx, 42, 422, 26, 18, 2);
  ctx.fill();
  ctx.strokeStyle = '#121419';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Silver Eject Icon (small triangle + horizontal bar)
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(55, 426);
  ctx.lineTo(50, 432);
  ctx.lineTo(60, 432);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(50, 434, 10, 2);

  // 4. Upper-Right Brushed Grey I/O Module Plate (#525862)
  // X = 356..488 (width 132px), Y = 28..468 (height 440px), radius 14px
  ctx.fillStyle = '#07080a';
  drawSFFRoundRect(ctx, 354, 26, 136, 444, 16);
  ctx.fill();

  const ioGrad = ctx.createLinearGradient(356, 28, 488, 468);
  ioGrad.addColorStop(0, '#5a626e');
  ioGrad.addColorStop(0.5, '#525862');
  ioGrad.addColorStop(1, '#464c55');
  ctx.fillStyle = ioGrad;
  drawSFFRoundRect(ctx, 356, 28, 132, 440, 14);
  ctx.fill();

  // Brushed metallic streaks across the I/O plate
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let i = 0; i < 40; i++) {
    const sy = 32 + Math.floor(Math.random() * 430);
    ctx.fillRect(360, sy, 124, 1);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
  for (let i = 0; i < 40; i++) {
    const sy = 32 + Math.floor(Math.random() * 430);
    ctx.fillRect(360, sy, 124, 1);
  }

  // Plate border & inner highlight
  ctx.strokeStyle = '#343840';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(358, 446);
  ctx.lineTo(358, 42);
  ctx.quadraticCurveTo(358, 30, 370, 30);
  ctx.lineTo(474, 30);
  ctx.stroke();

  // --- Circular Power Button at Top (X = 422, Y = 85) ---
  ctx.fillStyle = '#1c1f26';
  ctx.beginPath();
  ctx.arc(422, 85, 26, 0, Math.PI * 2);
  ctx.fill();

  const btnGrad = ctx.createRadialGradient(420, 83, 2, 422, 85, 22);
  btnGrad.addColorStop(0, '#58606f');
  btnGrad.addColorStop(0.75, '#3b414c');
  btnGrad.addColorStop(1, '#2c313a');
  ctx.fillStyle = btnGrad;
  ctx.beginPath();
  ctx.arc(422, 85, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#8a94a2';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tiny Glowing White/Ice-Blue LED Slit
  ctx.save();
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#f0f9ff';
  drawSFFRoundRect(ctx, 420.5, 73, 3, 24, 1.5);
  ctx.fill();
  ctx.restore();

  // --- 3.5mm Headset Jack (X = 422, Y = 162) ---
  // Micro headphone icon above jack
  ctx.strokeStyle = '#9ca6b4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(422, 137, 6, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#9ca6b4';
  ctx.fillRect(415, 137, 2, 4);
  ctx.fillRect(427, 137, 2, 4);

  // Silver/nickel jack outer ring
  const jackGrad = ctx.createLinearGradient(410, 150, 434, 174);
  jackGrad.addColorStop(0, '#98a4b4');
  jackGrad.addColorStop(1, '#565d6a');
  ctx.fillStyle = jackGrad;
  ctx.beginPath();
  ctx.arc(422, 162, 14, 0, Math.PI * 2);
  ctx.fill();

  // Dark socket cavity
  ctx.fillStyle = '#090a0d';
  ctx.beginPath();
  ctx.arc(422, 162, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#030405';
  ctx.beginPath();
  ctx.arc(422, 162, 5.5, 0, Math.PI * 2);
  ctx.fill();
  // Gold contact leaf
  ctx.fillStyle = '#eab308';
  ctx.fillRect(421, 167, 2, 3);

  // --- Middle USB Row: Two Vertical USB-A Ports (X = 392, X = 452, Y = 245) ---
  // Micro USB Trident symbols above
  ctx.fillStyle = '#8a94a2';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('⑂', 392, 218);
  ctx.fillText('⑂', 452, 218);

  const drawUSBA = (px, py) => {
    // Outer dark bezel recess
    ctx.fillStyle = '#1c1f26';
    drawSFFRoundRect(ctx, px - 11, py - 21, 22, 42, 3);
    ctx.fill();
    // Metal shield collar
    ctx.fillStyle = '#5c6572';
    drawSFFRoundRect(ctx, px - 9, py - 19, 18, 38, 2);
    ctx.fill();
    // Dark socket cavity
    ctx.fillStyle = '#060709';
    drawSFFRoundRect(ctx, px - 7, py - 17, 14, 34, 1.5);
    ctx.fill();
    // Blue/black internal plastic wafer tongue (top half)
    ctx.fillStyle = '#1a2230';
    ctx.fillRect(px - 6, py - 16, 12, 15);
    // 4 vertical gold contact pins
    ctx.fillStyle = '#eab308';
    for (let p = 0; p < 4; p++) {
      ctx.fillRect(px - 5 + p * 3, py - 7, 1.5, 5.5);
    }
  };

  drawUSBA(392, 245);
  drawUSBA(452, 245);

  // --- Bottom USB Row: One USB-A (Left) & One USB-C (Right) (Y = 350) ---
  // Micro speed labels above
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('5Gbps', 392, 318);
  ctx.fillText('10Gbps', 452, 318);

  // Left: USB-A (392, 348)
  drawUSBA(392, 348);

  // Right: Pill-shaped USB-C (452, 348)
  ctx.fillStyle = '#1c1f26';
  drawSFFRoundRect(ctx, 440, 330, 24, 38, 12);
  ctx.fill();
  ctx.fillStyle = '#7a8594';
  drawSFFRoundRect(ctx, 442, 332, 20, 34, 10);
  ctx.fill();
  ctx.fillStyle = '#060709';
  drawSFFRoundRect(ctx, 444, 334, 16, 30, 8);
  ctx.fill();
  // Centered internal wafer tongue
  ctx.fillStyle = '#181b22';
  drawSFFRoundRect(ctx, 450, 339, 4, 20, 2);
  ctx.fill();
  // Gold contacts along tongue edges
  ctx.fillStyle = '#d97706';
  ctx.fillRect(449.5, 344, 1, 10);
  ctx.fillRect(453.5, 344, 1, 10);

  // Bottom I/O plate rivet dot
  ctx.fillStyle = '#363b46';
  ctx.beginPath();
  ctx.arc(422, 435, 3, 0, Math.PI * 2);
  ctx.fill();

  // 5. Bottom-Right Recessed Sticker Mounting Socket (directly aligned under top-right I/O strip)
  // X = 370..474 (width 104px centered at 422), Y = 852..958 (height 106px centered at 905)
  ctx.fillStyle = '#080a0d';
  drawSFFRoundRect(ctx, 370, 852, 104, 106, 4);
  ctx.fill();
  ctx.strokeStyle = '#181b22';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Subtle inner beveled shadow
  ctx.strokeStyle = '#030406';
  ctx.lineWidth = 1;
  drawSFFRoundRect(ctx, 372, 854, 100, 102, 3);
  ctx.stroke();

  // 6. Center Circular Recessed Mounting Pad for Dedicated High-Res 3D "PC" Badge
  // Clean recessed dark circular bed so no vertical louvers intersect or z-fight with the badge!
  ctx.fillStyle = '#0a0c10';
  ctx.beginPath();
  ctx.arc(256, 563, 68, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#181b22';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = '#282d38';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(256, 563, 65, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Rear I/O Panel Texture (512x1024) for Enterprise SFF Desktop PC.
 * Inspired by Dell OptiPlex SFF rear panel:
 * - Stamped galvanized steel backplate (#adb5bd / #8f97a0) with rivet dots and seam lines
 * - Dark case edge with side-panel release latches
 * - Motherboard I/O section: DisplayPort, HDMI, 2 stamped '+' knockouts, 4x USB-A (2x2 grid),
 *   RJ-45 Ethernet with green link & amber activity LEDs
 * - Rear exhaust: 6x14 grid of black square honeycomb perforations
 * - Middle: 2 horizontal stamped-steel PCIe slot covers with square vents and '+' stamps
 * - Bottom PSU: Square honeycomb exhaust grid, recessed black hexagonal 3-prong IEC C14 power socket,
 *   two Phillips mounting screws, and signature green PSU diagnostic LED
 */
function createSFFRearTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // 1. Dark Charcoal Case Outer Edge Frame (#1c2026)
  ctx.fillStyle = '#1c2026';
  ctx.fillRect(0, 0, 512, 1024);

  // Side-panel release latches along the right edge
  ctx.fillStyle = '#101216';
  drawSFFRoundRect(ctx, 492, 260, 18, 55, 3);
  ctx.fill();
  drawSFFRoundRect(ctx, 492, 750, 18, 55, 3);
  ctx.fill();
  ctx.fillStyle = '#64748b';
  ctx.fillRect(495, 282, 12, 10);
  ctx.fillRect(495, 772, 12, 10);

  // 2. Main Inner Backplate: Industrial Brushed Galvanized Steel (#adb5bd / #8f97a0)
  ctx.fillStyle = '#a4acb5';
  ctx.fillRect(16, 16, 474, 992);

  // Brushed steel horizontal streaks
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let i = 0; i < 90; i++) {
    const sy = 18 + Math.floor(Math.random() * 988);
    ctx.fillRect(18, sy, 470, 1);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let i = 0; i < 90; i++) {
    const sy = 18 + Math.floor(Math.random() * 988);
    ctx.fillRect(18, sy, 470, 1);
  }

  // Stamped perimeter bevel line
  ctx.strokeStyle = '#6d7580';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 466, 984);
  ctx.strokeStyle = '#d0d7df';
  ctx.lineWidth = 1;
  ctx.strokeRect(21, 21, 464, 982);

  // Perimeter rivet dots
  const drawRivet = (rx, ry) => {
    ctx.fillStyle = '#5c646f';
    ctx.beginPath();
    ctx.arc(rx, ry + 0.8, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c5cbd4';
    ctx.beginPath();
    ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(rx - 0.7, ry - 0.7, 1, 0, Math.PI * 2);
    ctx.fill();
  };

  for (let ry = 40; ry < 990; ry += 70) {
    drawRivet(24, ry);
    drawRivet(482, ry);
  }
  for (let rx = 60; rx < 460; rx += 70) {
    drawRivet(rx, 24);
    drawRivet(rx, 996);
  }

  // 3. Upper Section (Motherboard I/O Shield & Exhaust Grille)
  // --- Left Half: Stamped Silver Motherboard I/O Shield ---
  // X = 28..244 (width 216px), Y = 38..494 (height 456px)
  ctx.fillStyle = '#bcc4cd';
  ctx.fillRect(28, 38, 216, 456);
  ctx.strokeStyle = '#5a626d';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(28, 38, 216, 456);

  // DisplayPort (DP) Cutout (top-left: 48, 56)
  ctx.fillStyle = '#0a0b0e';
  ctx.beginPath();
  ctx.moveTo(48, 56);
  ctx.lineTo(68, 56);
  ctx.lineTo(76, 64);
  ctx.lineTo(76, 108);
  ctx.lineTo(48, 108);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5a626d';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#505762';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('DP', 56, 50);

  // HDMI Port Cutout (below DP: 48, 130)
  ctx.fillStyle = '#0a0b0e';
  ctx.beginPath();
  ctx.moveTo(50, 130);
  ctx.lineTo(74, 130);
  ctx.lineTo(76, 136);
  ctx.lineTo(74, 176);
  ctx.lineTo(50, 176);
  ctx.lineTo(48, 136);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5a626d';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#505762';
  ctx.font = 'bold 8px sans-serif';
  ctx.fillText('HDMI', 52, 124);

  // Knockout 1 with stamped '+' cross (130, 70, 80x85)
  ctx.strokeStyle = '#7c8692';
  ctx.lineWidth = 2;
  drawSFFRoundRect(ctx, 130, 70, 80, 85, 8);
  ctx.stroke();
  ctx.fillStyle = '#1a1d22';
  ctx.fillRect(166, 96, 8, 32);
  ctx.fillRect(154, 108, 32, 8);
  drawRivet(138, 78);
  drawRivet(202, 147);

  // Knockout 2 with stamped '+' cross (95, 210, 80x85)
  ctx.strokeStyle = '#7c8692';
  ctx.lineWidth = 2;
  drawSFFRoundRect(ctx, 95, 210, 80, 85, 8);
  ctx.stroke();
  ctx.fillStyle = '#1a1d22';
  ctx.fillRect(131, 236, 8, 32);
  ctx.fillRect(119, 248, 32, 8);
  drawRivet(103, 218);
  drawRivet(167, 287);

  // 4 Black USB-A Ports in 2x2 Grid (Bottom-Left of I/O Shield)
  const drawRearUSBA = (ux, uy) => {
    ctx.fillStyle = '#14161a';
    drawSFFRoundRect(ctx, ux - 10, uy - 18, 20, 36, 2);
    ctx.fill();
    ctx.fillStyle = '#646d79';
    drawSFFRoundRect(ctx, ux - 8, uy - 16, 16, 32, 1.5);
    ctx.fill();
    ctx.fillStyle = '#08090b';
    drawSFFRoundRect(ctx, ux - 6, uy - 14, 12, 28, 1);
    ctx.fill();
    ctx.fillStyle = '#181b22';
    ctx.fillRect(ux - 5, uy - 13, 10, 13);
    ctx.fillStyle = '#d97706';
    for (let p = 0; p < 4; p++) {
      ctx.fillRect(ux - 4 + p * 2.5, uy - 5, 1.2, 4);
    }
  };

  drawRearUSBA(52, 350);
  drawRearUSBA(86, 350);
  drawRearUSBA(52, 430);
  drawRearUSBA(86, 430);

  // RJ-45 Ethernet Port (X = 135..195, Y = 405..475)
  ctx.fillStyle = '#08090b';
  drawSFFRoundRect(ctx, 135, 405, 60, 68, 3);
  ctx.fill();
  ctx.strokeStyle = '#646d79';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Internal RJ-45 connector notch & pins
  ctx.fillStyle = '#12151b';
  ctx.fillRect(140, 410, 50, 46);
  ctx.fillStyle = '#08090b';
  ctx.fillRect(152, 456, 26, 16);

  ctx.fillStyle = '#eab308';
  for (let pin = 0; pin < 8; pin++) {
    ctx.fillRect(143 + pin * 5.8, 412, 2, 9);
  }

  // RJ-45 LEDs (Green Link & Amber Activity)
  ctx.save();
  ctx.shadowColor = '#22c55e';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(150, 396, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(180, 396, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- Right Half: Rear Exhaust Grille (6x14 Grid of Square Honeycomb Vents) ---
  // X = 260..475, Y = 42..490
  for (let row = 0; row < 14; row++) {
    for (let col = 0; col < 6; col++) {
      const hx = 262 + col * 35;
      const hy = 46 + row * 31.5;
      ctx.fillStyle = '#090a0d';
      drawSFFRoundRect(ctx, hx, hy, 23, 21, 2);
      ctx.fill();
      ctx.strokeStyle = '#5a626d';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // 4. Middle Section: Two Horizontal PCIe Expansion Brackets
  // Bracket 1: Y = 520, H = 65. Bracket 2: Y = 600, H = 65.
  const drawPCIeBracket = (by) => {
    ctx.fillStyle = '#a6aeb7';
    ctx.fillRect(30, by, 445, 65);
    ctx.strokeStyle = '#626a74';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, by, 445, 65);

    // 12 columns x 2 rows of square vents
    for (let c = 0; c < 12; c++) {
      if (c >= 5 && c <= 6) continue; // Skip center for '+' knockout stamp
      for (let r = 0; r < 2; r++) {
        const vx = 42 + c * 34;
        const vy = by + 12 + r * 22;
        ctx.fillStyle = '#090a0d';
        drawSFFRoundRect(ctx, vx, vy, 14, 14, 1.5);
        ctx.fill();
      }
    }

    // Centered Stamped '+' Knockout Stamp
    ctx.fillStyle = '#1c2025';
    ctx.fillRect(246, by + 16, 6, 32);
    ctx.fillRect(233, by + 29, 32, 6);

    // Bracket retention screw on right
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(460, by + 32, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  drawPCIeBracket(520);
  drawPCIeBracket(600);

  // 5. Bottom Section: Power Supply Unit (PSU) & IEC Socket
  // Y = 690..995
  ctx.fillStyle = '#9aa2ab';
  ctx.fillRect(28, 690, 450, 305);
  ctx.strokeStyle = '#5a626d';
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 690, 450, 305);

  // PSU Square Honeycomb Exhaust Grid (10 cols x 9 rows)
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 10; c++) {
      const px = 42 + c * 42;
      const py = 704 + r * 31;

      // Skip area occupied by the IEC socket (X ~ 180..320, Y ~ 740..850)
      if (px >= 170 && px <= 325 && py >= 735 && py <= 855) continue;
      // Skip area for screws & diagnostic LED
      if (px <= 110 && py <= 750) continue; // top-left screw
      if (px >= 380 && py >= 920) continue; // bottom-right screw
      if (px >= 120 && px <= 210 && py >= 900) continue; // diagnostic LED + BIST

      ctx.fillStyle = '#090a0d';
      drawSFFRoundRect(ctx, px, py, 19, 18, 2);
      ctx.fill();
      ctx.strokeStyle = '#5a626d';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Recessed Black Hexagonal IEC C14 3-Prong Power Socket (Centered at X = 250, Y = 790)
  ctx.fillStyle = '#131518';
  ctx.beginPath();
  ctx.moveTo(195, 745);
  ctx.lineTo(305, 745);
  ctx.lineTo(320, 775);
  ctx.lineTo(305, 835);
  ctx.lineTo(195, 835);
  ctx.lineTo(180, 775);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#353a42';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Socket inner recess cup
  ctx.fillStyle = '#07080a';
  ctx.beginPath();
  ctx.moveTo(202, 752);
  ctx.lineTo(298, 752);
  ctx.lineTo(312, 778);
  ctx.lineTo(298, 828);
  ctx.lineTo(202, 828);
  ctx.lineTo(188, 778);
  ctx.closePath();
  ctx.fill();

  // 3 Metallic Silver Pins (C14 prongs)
  const pinGrad = ctx.createLinearGradient(0, 750, 0, 820);
  pinGrad.addColorStop(0, '#ffffff');
  pinGrad.addColorStop(0.5, '#e2e8f0');
  pinGrad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = pinGrad;

  // Top Ground Pin (centered)
  drawSFFRoundRect(ctx, 247, 762, 6, 20, 1);
  ctx.fill();
  // Bottom-Left Neutral Pin
  drawSFFRoundRect(ctx, 218, 796, 6, 20, 1);
  ctx.fill();
  // Bottom-Right Line Pin
  drawSFFRoundRect(ctx, 276, 796, 6, 20, 1);
  ctx.fill();

  // Two Silver Phillips-Head PSU Mounting Screws
  const drawPSUScrew = (sx, sy) => {
    // Outer silver washer
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(sx, sy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Screw head
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fill();

    // Phillips '+' slot
    ctx.fillStyle = '#1e2228';
    ctx.fillRect(sx - 1.5, sy - 6, 3, 12);
    ctx.fillRect(sx - 6, sy - 1.5, 12, 3);
  };

  drawPSUScrew(95, 730);
  drawPSUScrew(415, 945);

  // Signature Circular Green PSU Diagnostic LED (Bottom-Left)
  ctx.fillStyle = '#14171c';
  ctx.beginPath();
  ctx.arc(145, 925, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Glowing Green LED Lens
  ctx.save();
  ctx.shadowColor = '#22c55e';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(145, 925, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Center specular highlight
  ctx.fillStyle = '#bbf7d0';
  ctx.beginPath();
  ctx.arc(143, 923, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#505762';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('DIAG', 145, 948);

  // BIST (Built-In Self-Test) micro push-button next to LED
  ctx.fillStyle = '#181b20';
  ctx.beginPath();
  ctx.arc(180, 925, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#2d333e';
  ctx.beginPath();
  ctx.arc(180, 925, 6, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Dedicated Circular "PC" Parody Badge Texture (256x256).
 * Sharp vector-like rendering with minFilter LinearFilter (no mipmap blur!).
 * - Deep matte black background (#0d1015)
 * - Metallic silver-white outer ring (#f1f5f9, 14px stroke)
 * - Large geometric sans-serif: upright "P" (left, 88, 128) and counter-clockwise -25° tilted "C" (right, 166, 128)
 */
function createSFFBadgeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Deep matte black circle background (#0d1015)
  ctx.fillStyle = '#0d1015';
  ctx.fillRect(0, 0, 256, 256);

  // Bold metallic silver-white outer ring (radius 112px, lineWidth 14px)
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();

  // Subtle inner metallic bevel line
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(128, 128, 103, 0, Math.PI * 2);
  ctx.stroke();

  // Large, ultra-clean, heavy geometric sans-serif letters "P" and "C" in bright pure white/chrome
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 108px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Upright "P" on the left half of the circle
  ctx.fillText('P', 88, 128);

  // Tilted "C" on the right half, rotated counter-clockwise by -25 degrees (Dell "E" parody)
  ctx.save();
  ctx.translate(166, 128);
  ctx.rotate(-25 * Math.PI / 180);
  ctx.fillText('C', 0, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Dedicated Metallic-Blue Processor Sticker Badge (128x128)
 * Inspired by iconic Intel Core / Inside holographic case stickers:
 * - Rich diagonal metallic blue foil gradient (#0071c5 -> #00a8e8 -> #003c71)
 * - Holographic sheen band and silver-white outer border (#e2e8f0, lineWidth 6)
 * - Classic curved swirl / circuit accent in upper-left
 * - Micro-typography: "inside" (top), bold pure white "CORE" (center), and bright cyan pill with "i9" (bottom-right)
 */
function createSFFStickerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // 1. Rich diagonal metallic blue gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 128, 128);
  bgGrad.addColorStop(0, '#0071c5');
  bgGrad.addColorStop(0.35, '#00a8e8');
  bgGrad.addColorStop(0.68, '#00529b');
  bgGrad.addColorStop(1, '#002855');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 128, 128);

  // 2. Holographic foil diagonal sheen streak
  const sheen = ctx.createLinearGradient(16, 0, 112, 128);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0)');
  sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0.12)');
  sheen.addColorStop(0.50, 'rgba(224, 242, 254, 0.40)');
  sheen.addColorStop(0.58, 'rgba(255, 255, 255, 0.12)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 128, 128);

  // 3. Subtle micro-circuit / Intel swirl arc in upper corner
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.50)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(38, 28, 22, 14, Math.PI / 5, 0, Math.PI * 1.5);
  ctx.stroke();

  // Micro circuit node dots
  ctx.fillStyle = '#7dd3fc';
  ctx.beginPath();
  ctx.arc(58, 20, 2, 0, Math.PI * 2);
  ctx.arc(22, 38, 2, 0, Math.PI * 2);
  ctx.fill();

  // 4. Outer metallic silver foil rim (lineWidth = 6) & inner fine bevel
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 122, 122);

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(7, 7, 114, 114);

  // 5. Micro header text: "inside"
  ctx.fillStyle = '#bae6fd';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('inside', 14, 14);

  // 6. Bold white sans-serif center brand: "CORE"
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 27px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CORE', 64, 56);

  // 7. Bottom-Right bright cyan pill highlight with "i9"
  drawSFFRoundRect(ctx, 64, 80, 50, 34, 5);
  ctx.fillStyle = '#011c38';
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('i9', 89, 97);

  // Bottom-Left "vPRO" feature badge
  ctx.fillStyle = '#7dd3fc';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('vPRO', 15, 98);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural LG Artcool Mirror Split AC Front Panel Textures (1024x256).
 * Edge-to-edge frameless smoked titanium/gunmetal mirror finish with realistic
 * horizon reflection sheen, bottom brushed satin-silver trim bar, non-emissive
 * "DUAL INVERTER" micro-label, and hidden-until-lit "18°" digital LED readout with
 * cooling snowflake icon and dedicated emissiveMap.
 */
function createSplitAcFrontTextures() {
  const w = 1024;
  const h = 256;

  // --- 1. DIFFUSE TEXTURE ---
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = w;
  diffCanvas.height = h;
  const ctx = diffCanvas.getContext('2d');

  // 1.1 Rich Smoked Titanium/Gunmetal Mirror Gradient (LG Artcool Smoked Glass)
  // Blends from warm smoked silver-slate across upper/middle curve down to deep smoked charcoal near bottom
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0.00, '#4a5260'); // warm smoked silver-slate at upper curve
  bg.addColorStop(0.18, '#3d4452');
  bg.addColorStop(0.45, '#323945');
  bg.addColorStop(0.70, '#262c36');
  bg.addColorStop(0.88, '#1e232c'); // deep smoked charcoal near bottom lip
  bg.addColorStop(1.00, '#161920');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 1.2 Soft, wide, low-contrast horizon reflection sweep across upper curve
  const horizonSheen = ctx.createLinearGradient(0, 25, w, 110);
  horizonSheen.addColorStop(0.00, 'rgba(255, 255, 255, 0.00)');
  horizonSheen.addColorStop(0.25, 'rgba(255, 255, 255, 0.03)');
  horizonSheen.addColorStop(0.50, 'rgba(255, 255, 255, 0.07)');
  horizonSheen.addColorStop(0.75, 'rgba(255, 255, 255, 0.03)');
  horizonSheen.addColorStop(1.00, 'rgba(255, 255, 255, 0.00)');
  ctx.fillStyle = horizonSheen;
  ctx.fillRect(0, 0, w, h);

  // Subtle natural diagonal sheen to enhance curved smoked glass depth
  const glassReflect = ctx.createLinearGradient(w * 0.15, 0, w * 0.55, h);
  glassReflect.addColorStop(0.0, 'rgba(255, 255, 255, 0.00)');
  glassReflect.addColorStop(0.4, 'rgba(255, 255, 255, 0.03)');
  glassReflect.addColorStop(0.5, 'rgba(224, 242, 254, 0.06)');
  glassReflect.addColorStop(0.6, 'rgba(255, 255, 255, 0.03)');
  glassReflect.addColorStop(1.0, 'rgba(255, 255, 255, 0.00)');
  ctx.fillStyle = glassReflect;
  ctx.fillRect(0, 0, w, h);

  // 1.3 Frameless Edge Treatment:
  // Tiny ultra-dark 2px chamfer shadow around outer glass edges (NO white picture-frame border!)
  ctx.strokeStyle = 'rgba(10, 12, 16, 0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  // 1.4 Single sleek, thin brushed satin-silver horizontal trim bar along bottom edge
  const btmTrim = ctx.createLinearGradient(0, h - 6, 0, h);
  btmTrim.addColorStop(0.0, 'rgba(203, 213, 225, 0.85)');
  btmTrim.addColorStop(0.4, 'rgba(241, 245, 249, 0.95)');
  btmTrim.addColorStop(1.0, 'rgba(148, 163, 184, 0.80)');
  ctx.fillStyle = btmTrim;
  ctx.fillRect(0, h - 5, w, 3);

  // Gasket shadow line under the bottom silver trim bar
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0, h - 2, w, 2);

  // 1.5 Subtle circular metallic parody emblem near center-left bottom edge of glass
  const emblemX = 260;
  const emblemY = 222;
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.45)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(emblemX, emblemY, 10, 0, Math.PI * 2);
  ctx.stroke();

  // Inner stylized cooling circle arc
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.50)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(emblemX, emblemY, 5.5, 0.2 * Math.PI, 1.8 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = 'rgba(226, 232, 240, 0.60)';
  ctx.beginPath();
  ctx.arc(emblemX - 1.5, emblemY - 1.5, 2, 0, Math.PI * 2);
  ctx.fill();

  // 1.6 Lower-Right Quadrant: Hidden-Until-Lit LED Display (78%–84% X, 62%–72% Y)
  const ledX = 820;
  const ledY = 178;

  // Non-emissive subtle satin-silver micro-typography directly above the LED readout
  ctx.save();
  ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.font = '600 12px "Inter", system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('DUAL INVERTER', ledX - 10, ledY - 32);
  ctx.restore();

  // Digital readout "18°" on diffuse canvas
  ctx.save();
  ctx.font = '700 42px "Inter", "Segoe UI", monospace, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Glow halo
  ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#7dd3fc';
  ctx.fillText('18°', ledX, ledY);

  // Crisp core
  ctx.shadowBlur = 3;
  ctx.fillStyle = '#eefaff';
  ctx.fillText('18°', ledX, ledY);
  ctx.restore();

  // Cooling snowflake micro-icon next to the temperature readout
  const iconX = ledX + 82;
  const iconY = ledY - 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
  ctx.lineWidth = 1.8;
  ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
  ctx.shadowBlur = 8;
  for (let a = 0; a < 3; a++) {
    const angle = (a * Math.PI) / 3;
    const dx = Math.cos(angle) * 7.5;
    const dy = Math.sin(angle) * 7.5;
    ctx.beginPath();
    ctx.moveTo(iconX - dx, iconY - dy);
    ctx.lineTo(iconX + dx, iconY + dy);
    ctx.stroke();
  }
  ctx.fillStyle = '#eefaff';
  ctx.beginPath();
  ctx.arc(iconX, iconY, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- 2. EMISSIVE MAP TEXTURE ---
  // Pure black background (#000000) so ONLY the hidden LED display glows
  const emisCanvas = document.createElement('canvas');
  emisCanvas.width = w;
  emisCanvas.height = h;
  const eCtx = emisCanvas.getContext('2d');

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, w, h);

  // Glowing 18° numeral on emissive map
  eCtx.save();
  eCtx.font = '700 42px "Inter", "Segoe UI", monospace, sans-serif';
  eCtx.textAlign = 'left';
  eCtx.textBaseline = 'middle';

  // Soft cyan blur halo
  eCtx.shadowColor = '#38bdf8';
  eCtx.shadowBlur = 14;
  eCtx.fillStyle = '#7dd3fc';
  eCtx.fillText('18°', ledX, ledY);

  // Bright white core
  eCtx.shadowBlur = 4;
  eCtx.fillStyle = '#ffffff';
  eCtx.fillText('18°', ledX, ledY);
  eCtx.restore();

  // Glowing snowflake micro-icon on emissive map
  eCtx.save();
  eCtx.strokeStyle = '#38bdf8';
  eCtx.lineWidth = 2.0;
  eCtx.shadowColor = '#38bdf8';
  eCtx.shadowBlur = 10;
  for (let a = 0; a < 3; a++) {
    const angle = (a * Math.PI) / 3;
    const dx = Math.cos(angle) * 7.5;
    const dy = Math.sin(angle) * 7.5;
    eCtx.beginPath();
    eCtx.moveTo(iconX - dx, iconY - dy);
    eCtx.lineTo(iconX + dx, iconY + dy);
    eCtx.stroke();
  }
  eCtx.fillStyle = '#ffffff';
  eCtx.beginPath();
  eCtx.arc(iconX, iconY, 2.5, 0, Math.PI * 2);
  eCtx.fill();
  eCtx.restore();

  // Wrap in Three.js CanvasTextures (1024x256, LinearFilter, anisotropy = 8)
  const diffuseTexture = new THREE.CanvasTexture(diffCanvas);
  diffuseTexture.colorSpace = THREE.SRGBColorSpace;
  diffuseTexture.minFilter = THREE.LinearFilter;
  diffuseTexture.magFilter = THREE.LinearFilter;
  diffuseTexture.anisotropy = 8;
  diffuseTexture.needsUpdate = true;

  const emissiveTexture = new THREE.CanvasTexture(emisCanvas);
  emissiveTexture.colorSpace = THREE.SRGBColorSpace;
  emissiveTexture.minFilter = THREE.LinearFilter;
  emissiveTexture.magFilter = THREE.LinearFilter;
  emissiveTexture.anisotropy = 8;
  emissiveTexture.needsUpdate = true;

  return { diffuseTexture, emissiveTexture };
}

/**
 * Builds the compact, intimate Enterprise Data Center Shooting Range.
 * Rendered in batched draw calls with zero PointLights.
 */
/**
 * Procedural Front Stand "PC" Micro-Logo Texture (128x64).
 * Inspired by Dell P2425H front stand logo:
 * - Platinum-silver background (#cfd6df) matching stand finish
 * - Crisp dark-charcoal (#252930) geometric sans-serif: upright "P" (left) and -25° tilted "C" (right)
 */
function createStandFrontLogoTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Platinum-silver background matching monitorStandSilverMaterial
  ctx.fillStyle = '#cfd6df';
  ctx.fillRect(0, 0, 128, 64);

  // Dark-charcoal "PC" parody text (with tilted "C")
  ctx.fillStyle = '#252930';
  ctx.font = '900 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Upright "P"
  ctx.fillText('P', 64 - 15, 32);

  // Tilted "C" (-25 degrees)
  ctx.save();
  ctx.translate(64 + 15, 32);
  ctx.rotate(-25 * Math.PI / 180);
  ctx.fillText('C', 0, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Dell P2425H Monitor Rear Panel Texture (1024x576, 16:9 widescreen).
 * High-resolution canvas texture mapped to the rear of every workstation monitor:
 * - Matte graphite-charcoal shell (#252830) with subtle radial/vertical ambient sheen
 * - Continuous row of fine dark cooling ventilation micro-slots along top edge
 * - Upper-center circular silver parody emblem (radius ~52px) with upright "P" and -25° tilted "C"
 * - Center square VESA mount panel (y = 165 to 365) with recessed border, 4 corner screws, center hinge boss,
 *   and horizontal pill-shaped quick-release button tab below
 * - Lower recessed downward-facing I/O port pocket (y = 395 to 560) with port label strip (~, HDMI, DP, USB),
 *   metallic connector outlines, and realistic black-and-white regulatory sticker featuring TWO crisp white QR codes
 * - Bottom-left rear controls: circular tactile power button with power symbol and circular 5-way mini OSD joystick nub
 */
function createMonitorBackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const ctx = canvas.getContext('2d');

  // 1. Matte graphite-charcoal background & ambient radial sheen
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 576);
  bgGrad.addColorStop(0, '#262932');
  bgGrad.addColorStop(0.35, '#2b2f39');
  bgGrad.addColorStop(0.70, '#242731');
  bgGrad.addColorStop(1, '#1b1d24');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1024, 576);

  // Ambient radial sheen catching ceiling overhead light
  const ambientGlow = ctx.createRadialGradient(512, 180, 50, 512, 180, 500);
  ambientGlow.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  ambientGlow.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
  ambientGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = ambientGlow;
  ctx.fillRect(0, 0, 1024, 576);

  // 2. Top Micro-Ventilation Cooling Slots (continuous horizontal row)
  ctx.fillStyle = '#111318';
  for (let vx = 36; vx < 1024 - 36; vx += 7) {
    ctx.fillRect(vx, 7, 3.5, 9);
  }
  ctx.strokeStyle = '#383e4a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(34, 18.5);
  ctx.lineTo(1024 - 34, 18.5);
  ctx.stroke();

  // 3. Upper-Center Circular "PC" Parody Logo Ring (centered at x = 512, y = 88, radius = 48px)
  const logoX = 512;
  const logoY = 88;
  const logoR = 48;

  // Dark recessed circular well
  ctx.fillStyle = '#161920';
  ctx.beginPath();
  ctx.arc(logoX, logoY, logoR, 0, Math.PI * 2);
  ctx.fill();

  // Crisp silver-white outer ring (#e2e8f0, lineWidth: 5px)
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 4.8;
  ctx.beginPath();
  ctx.arc(logoX, logoY, logoR - 2.4, 0, Math.PI * 2);
  ctx.stroke();

  // Inner subtle metallic bevel line
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(logoX, logoY, logoR - 5.5, 0, Math.PI * 2);
  ctx.stroke();

  // Bold geometric sans-serif letters "PC" in bright brushed silver (#f1f5f9)
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '900 44px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Upright "P" on left
  ctx.fillText('P', logoX - 16, logoY);

  // Tilted "C" on right, rotated counter-clockwise by -25 degrees
  ctx.save();
  ctx.translate(logoX + 16, logoY);
  ctx.rotate(-25 * Math.PI / 180);
  ctx.fillText('C', 0, 0);
  ctx.restore();

  // 4. Center Square VESA Mount Cavity & Quick-Release Latch (y = 165 to 365)
  const vesaX = 512 - 130; // 382
  const vesaY = 165;
  const vesaW = 260;
  const vesaH = 195;

  ctx.fillStyle = '#1a1c22';
  ctx.beginPath();
  ctx.roundRect(vesaX, vesaY, vesaW, vesaH, 4);
  ctx.fill();

  // 1px-2px dark recessed seam (#14161b)
  ctx.strokeStyle = '#121419';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner bevel highlight
  ctx.strokeStyle = '#2d323c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vesaX + 2, vesaY + vesaH - 1);
  ctx.lineTo(vesaX + vesaW - 1, vesaY + vesaH - 1);
  ctx.lineTo(vesaX + vesaW - 1, vesaY + 2);
  ctx.stroke();

  // 4 VESA Corner Screw Inserts
  const screwOffsets = [
    [vesaX + 28, vesaY + 28],
    [vesaX + vesaW - 28, vesaY + 28],
    [vesaX + 28, vesaY + vesaH - 28],
    [vesaX + vesaW - 28, vesaY + vesaH - 28]
  ];
  for (const [sx, sy] of screwOffsets) {
    ctx.fillStyle = '#0f1115';
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx - 3, sy); ctx.lineTo(sx + 3, sy);
    ctx.moveTo(sx, sy - 3); ctx.lineTo(sx, sy + 3);
    ctx.stroke();
  }

  // Circular center hinge boss
  const hingeCx = 512;
  const hingeCy = vesaY + vesaH / 2;
  ctx.fillStyle = '#14161c';
  ctx.beginPath();
  ctx.arc(hingeCx, hingeCy, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#282d36';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#1c1f27';
  ctx.beginPath();
  ctx.arc(hingeCx, hingeCy, 30, 0, Math.PI * 2);
  ctx.fill();

  // Horizontal pill-shaped VESA quick-release button tab directly below
  const tabW = 68;
  const tabH = 14;
  const tabX = 512 - tabW / 2;
  const tabY = vesaY + vesaH + 6;
  ctx.fillStyle = '#1c1f26';
  ctx.beginPath();
  ctx.roundRect(tabX, tabY, tabW, tabH, 4);
  ctx.fill();
  ctx.strokeStyle = '#121418';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(512 - 6, tabY + 5);
  ctx.lineTo(512, tabY + 9);
  ctx.lineTo(512 + 6, tabY + 5);
  ctx.stroke();

  // 5. Lower Recessed Downward-Facing I/O Port Pocket & QR Regulatory Label (x = 240 to 784, y = 395 to 560)
  const pocketX = 240;
  const pocketY = 395;
  const pocketW = 544;
  const pocketH = 165;

  const pocketGrad = ctx.createLinearGradient(0, pocketY, 0, pocketY + pocketH);
  pocketGrad.addColorStop(0, '#101217'); // Deep dark inner shadow
  pocketGrad.addColorStop(0.2, '#14161d');
  pocketGrad.addColorStop(1, '#1c2026');
  ctx.fillStyle = pocketGrad;
  ctx.beginPath();
  ctx.roundRect(pocketX, pocketY, pocketW, pocketH, [6, 6, 0, 0]);
  ctx.fill();

  // Upper horizontal port label lip (y = 395 to 421)
  ctx.fillStyle = '#181b22';
  ctx.fillRect(pocketX, pocketY, pocketW, 26);
  ctx.strokeStyle = '#2b303b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pocketX, pocketY + 26.5);
  ctx.lineTo(pocketX + pocketW, pocketY + 26.5);
  ctx.stroke();

  // Recessed port label strip with tiny crisp dark/grey port micro-icons
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText('~', pocketX + 45, pocketY + 13);
  ctx.fillText('HDMI', pocketX + 160, pocketY + 13);
  ctx.fillText('DP', pocketX + 235, pocketY + 13);
  ctx.fillText('USB-B ⑂', pocketX + 310, pocketY + 13);
  ctx.fillText('SS ⑂', pocketX + 410, pocketY + 13);
  ctx.fillText('SS ⑂', pocketX + 480, pocketY + 13);

  // Metallic port connector edges peeking from underneath the horizontal lip
  const ports = [
    [pocketX + 35, 20, '#0a0b0e'],
    [pocketX + 148, 24, '#334155'],
    [pocketX + 223, 24, '#334155'],
    [pocketX + 298, 24, '#0284c7'],
    [pocketX + 398, 24, '#0284c7'],
    [pocketX + 468, 24, '#0284c7']
  ];
  for (const [px, pw, pcol] of ports) {
    ctx.fillStyle = pcol;
    ctx.fillRect(px, pocketY + 27, pw, 5);
  }

  // Realistic Black-and-White Regulatory / Serial Sticker with TWO crisp white QR code squares
  const stickerW = 124;
  const stickerH = 62;
  const stickerX = 512 - stickerW / 2;
  const stickerY = pocketY + 54;

  ctx.fillStyle = '#0b0d11';
  ctx.beginPath();
  ctx.roundRect(stickerX, stickerY, stickerW, stickerH, 3);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Helper: draw crisp procedural QR code square
  const drawQRCode = (qx, qy, size) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qx, qy, size, size);

    ctx.fillStyle = '#000000';
    const cellSize = size / 9;

    // Finder pattern top-left
    ctx.fillRect(qx, qy, cellSize * 3, cellSize * 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qx + cellSize, qy + cellSize, cellSize, cellSize);

    // Finder pattern top-right
    ctx.fillStyle = '#000000';
    ctx.fillRect(qx + cellSize * 6, qy, cellSize * 3, cellSize * 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qx + cellSize * 7, qy + cellSize, cellSize, cellSize);

    // Finder pattern bottom-left
    ctx.fillStyle = '#000000';
    ctx.fillRect(qx, qy + cellSize * 6, cellSize * 3, cellSize * 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qx + cellSize, qy + cellSize * 7, cellSize, cellSize);

    // Inner QR data bits
    ctx.fillStyle = '#000000';
    const dataBits = [
      [3, 0], [4, 1], [5, 0], [3, 2], [4, 3], [5, 2],
      [0, 4], [2, 4], [4, 4], [6, 4], [8, 4],
      [1, 5], [3, 5], [5, 5], [7, 5],
      [3, 6], [5, 6], [7, 6], [4, 7], [6, 7], [8, 7],
      [3, 8], [5, 8], [7, 8]
    ];
    for (const [bx, by] of dataBits) {
      ctx.fillRect(qx + bx * cellSize, qy + by * cellSize, cellSize, cellSize);
    }
  };

  drawQRCode(stickerX + 11, stickerY + 8, 36);
  drawQRCode(stickerX + 57, stickerY + 8, 36);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '6px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('MODEL: P2425Hb', stickerX + 11, stickerY + 50);
  ctx.fillText('DP/N: 09X4Y1', stickerX + 70, stickerY + 50);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('CN-0P2425H-PC00-A00', stickerX + 11, stickerY + 57);

  // 6. Bottom-Left Rear OSD Joystick & Tactile Power Button (x = 82 and x = 132, y = 505)
  // Left: Circular tactile power button
  const pBtnX = 82;
  const pBtnY = 505;
  ctx.fillStyle = '#14161c';
  ctx.beginPath();
  ctx.arc(pBtnX, pBtnY, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b303c';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#222630';
  ctx.beginPath();
  ctx.arc(pBtnX, pBtnY, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(pBtnX, pBtnY + 1, 5, -Math.PI * 0.7, -Math.PI * 0.3, true);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pBtnX, pBtnY - 5);
  ctx.lineTo(pBtnX, pBtnY);
  ctx.stroke();

  // Right: Circular 5-way mini OSD Joystick nub
  const joyX = 132;
  const joyY = 505;
  ctx.fillStyle = '#14161c';
  ctx.beginPath();
  ctx.arc(joyX, joyY, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b303c';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const joyGrad = ctx.createRadialGradient(joyX - 3, joyY - 3, 2, joyX, joyY, 14);
  joyGrad.addColorStop(0, '#3a414e');
  joyGrad.addColorStop(0.7, '#242832');
  joyGrad.addColorStop(1, '#171920');
  ctx.fillStyle = joyGrad;
  ctx.beginPath();
  ctx.arc(joyX, joyY, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f1115';
  const dimpleDist = 6.5;
  ctx.fillRect(joyX - 1, joyY - dimpleDist - 1, 2, 2);
  ctx.fillRect(joyX - 1, joyY + dimpleDist - 1, 2, 2);
  ctx.fillRect(joyX - dimpleDist - 1, joyY - 1, 2, 2);
  ctx.fillRect(joyX + dimpleDist - 1, joyY - 1, 2, 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export class WarehouseBuilder {
  constructor(scene) {
    this.scene = scene;
    this.colliderMesh = null;
    this.coverNodes = [];

    // 1. Textures (SRGB + anisotropy 8)
    const mainFloorTex = createSolidFloorTextures();
    this.floorTexture = mainFloorTex.diffuseTexture;
    this.floorBumpTexture = mainFloorTex.bumpTexture;
    this.wallTexture = createDataCenterWallTexture();
    const ceilingTex = createDataCenterCeilingTextures();
    this.ceilingTexture = ceilingTex.diffuseTexture;
    this.ceilingEmissiveTexture = ceilingTex.emissiveTexture;
    const rackTex = createServerCabinetTextures();
    this.serverBladeDiffuseTexture = rackTex.diffuseTexture;
    this.serverBladeEmissiveTexture = rackTex.emissiveTexture;
    this.monitorScreenAtlasTex = createMonitorScreenAtlasTexture();
    this.screenATexture = createWindows11DesktopTexture();
    this.screenBTexture = createWindows11LockTexture();
    this.screenCTexture = createAIIDEWorkspaceTexture();
    this.screenDTexture = createWindows11MultiWindowTexture();
    this.screenETexture = createITServicePortalTexture();
    this.screenFTexture = createMusicAppTexture();
    this.brokenScreenTexture1 = createBrokenMonitorScreenTexture(0);
    this.brokenScreenTexture2 = createBrokenMonitorScreenTexture(1);
    this.chairMeshTexture = createChairMeshTexture();
    this.outletTexture = createBrazilianITFaceplateTexture();
    this.stanchionBeltTexture = createStanchionBeltTexture();
    this.coffeeScreenTexture = createCoffeeScreenTexture();
    this.coffeeSideTexture = createCoffeeSideTexture();
    this.coffeeHopperTexture = createCoffeeHopperTexture();
    this.palmFrondTexture = createPalmFrondTexture();
    const splitAcTex = createSplitAcFrontTextures();
    this.splitAcFrontTexture = splitAcTex.diffuseTexture;
    this.splitAcFrontEmissiveTexture = splitAcTex.emissiveTexture;

    // High-Detail Workstation Peripheral Textures
    const kbTextures = createMechanicalKeyboardTextures();
    this.keyboardDiffuseTexture = kbTextures.diffuseTexture;
    this.keyboardEmissiveTexture = kbTextures.emissiveTexture;
    this.mousepadTexture = createTacticalMousepadTexture();

    // Enterprise SFF Desktop PC Textures (Dell OptiPlex Parody)
    this.sffFrontTexture = createSFFFrontTexture();
    this.sffRearTexture = createSFFRearTexture();
    this.sffBadgeTexture = createSFFBadgeTexture();
    this.sffStickerTexture = createSFFStickerTexture();
    this.monitorBackTexture = createMonitorBackTexture();
    this.monitorStandLogoTexture = createStandFrontLogoTexture();

    // Enterprise Data Center Raised Plenum Floor Textures
    const plenumTex = createPerforatedFloorTextures();
    this.plenumFloorTexture = plenumTex.diffuseTexture;
    this.plenumFloorBumpTexture = plenumTex.bumpTexture;

    this.stepTreadTexture = createStepTreadTexture();

    // 2. High-Readability Industrial Palette (NO pure pitch-black silhouettes!)
    this.floorMaterial = new THREE.MeshStandardMaterial({
      map: this.floorTexture,
      bumpMap: this.floorBumpTexture,
      bumpScale: 0.0015,
      roughness: 0.75,
      metalness: 0.20,
    });

    this.wallMaterial = new THREE.MeshStandardMaterial({
      map: this.wallTexture,
      bumpMap: this.wallTexture,
      bumpScale: 0.0015,
      roughness: 0.85,
      metalness: 0.05,
    });

    this.outletMaterial = new THREE.MeshStandardMaterial({
      map: this.outletTexture,
      roughness: 0.40,
      metalness: 0.05,
    });

    // Sleek brushed dark gunmetal chrome for stanchion posts & heavy cast-iron bases
    this.stanchionPostMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a404a,
      metalness: 0.65,
      roughness: 0.32,
    });

    // Dark matte polymer for stanchion rubber floor rings, cassette heads, and belt end-clips
    this.stanchionHardwareMaterial = new THREE.MeshStandardMaterial({
      color: 0x181b20,
      metalness: 0.20,
      roughness: 0.60,
    });

    // Tactical woven nylon barrier belt webbing with safety yellow stitching
    this.stanchionBeltMaterial = new THREE.MeshStandardMaterial({
      map: this.stanchionBeltTexture,
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    this.ceilingMaterial = new THREE.MeshStandardMaterial({
      map: this.ceilingTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this.ceilingEmissiveTexture,
      emissiveIntensity: 0.60,
      roughness: 0.60,
      metalness: 0.25,
    });

    // Industrial Gunmetal Slate for cabinets, PC chassis, desk legs, monitor bezels
    this.serverChassisMaterial = new THREE.MeshStandardMaterial({
      color: 0x363d47,
      metalness: 0.55,
      roughness: 0.40,
    });

    // Enterprise Raised Plenum Floor Stage Materials
    this.plenumFloorMaterial = new THREE.MeshStandardMaterial({
      map: this.plenumFloorTexture,
      bumpMap: this.plenumFloorBumpTexture,
      bumpScale: 0.002,
      roughness: 0.72,
      metalness: 0.22,
    });

    // Solid dark structural gunmetal for the raised platform base box walls
    this.plenumBaseMaterial = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      roughness: 0.65,
      metalness: 0.35,
    });

    // Grounding dark rubber/anthracite cove baseboard strip along floor (y = 0)
    this.plenumBaseboardMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f1217,
      roughness: 0.85,
      metalness: 0.10,
    });

    this.stepNosingMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x4b5563,
      roughness: 0.40,
      metalness: 0.65,
    });

    this.stepTreadMaterial = new THREE.MeshStandardMaterial({
      map: this.stepTreadTexture,
      roughness: 0.80,
      metalness: 0.15,
    });

    // Enterprise Split AC Materials (LG Artcool Mirror Style)
    this.splitAcBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x22262e,
      roughness: 0.55,
      metalness: 0.20,
    });

    this.splitAcFrontMaterial = new THREE.MeshStandardMaterial({
      map: this.splitAcFrontTexture,
      roughness: 0.14,
      metalness: 0.72,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this.splitAcFrontEmissiveTexture,
      emissiveIntensity: 1.35,
    });

    this.splitAcLouverMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b0d12,
      roughness: 0.85,
      metalness: 0.10,
    });

    // Dark brushed steel rack side panels (Powder-coated metal finish)
    this.serverCabinetMaterial = new THREE.MeshStandardMaterial({
      color: 0x1c2028,
      roughness: 0.45,
      metalness: 0.55,
    });

    // Brushed Silver-Grey Frame Trim for cabinet doors and desk bevel edges
    this.silverTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0x6c7685,
      metalness: 0.75,
      roughness: 0.35,
    });

    // Warm technical light-slate for desktop work surfaces
    this.deskSurfaceMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a525e,
      roughness: 0.50,
      metalness: 0.25,
    });

    // Enterprise 42U Server Cabinet Front Face (MeshStandardMaterial with Emissive & GPU Blinking)
    this.serverRackBladeUniforms = {
      uTime: { value: 0.0 },
    };

    this.serverRackBladeMaterial = new THREE.MeshStandardMaterial({
      map: this.serverBladeDiffuseTexture,
      emissiveMap: this.serverBladeEmissiveTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.15,
      roughness: 0.40,
      metalness: 0.60,
    });

    this.serverRackBladeMaterial.customProgramCacheKey = () => 'EnterpriseRackBladeShader';

    this.serverRackBladeMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.serverRackBladeUniforms.uTime;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vRackWorldPos;`
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `vRackWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#include <project_vertex>`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
varying vec3 vRackWorldPos;

float rackHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
#ifdef USE_EMISSIVEMAP
  vec2 pix = vec2(vEmissiveMapUv.x * 1024.0, (1.0 - vEmissiveMapUv.y) * 2048.0);

  // 1. ABSOLUTE SCREEN & INSCRIPTION GUARD:
  // - OLED Telemetry Displays: strictly at X > 685.0 in 2U servers (Y: 234 to 974)
  // - UPS Battery Load Window: strictly at Y >= 1800.0
  // - All Cyan Text & Display Graphics: have B > 0.15
  // These NEVER blink under any circumstances - characters remain 100% steady, razor-sharp & static!
  bool isScreenOrText = (pix.y >= 1800.0) || 
                        (pix.y >= 234.0 && pix.y < 974.0 && pix.x > 685.0) ||
                        (emissiveColor.b > 0.15);

  if (!isScreenOrText && (emissiveColor.g > 0.15 || emissiveColor.r > 0.15)) {
    vec2 ledId;
    bool isUpperPowerLed = false;

    if (pix.y < 234.0) {
      // Zone 1: Switches (Canvas Y: 48 to 234)
      float swRow = floor((pix.y - 48.0) / 46.0);
      float swCol = floor((pix.x - 76.0) / 25.0);
      ledId = vec2(swCol, swRow);
    } else if (pix.y < 974.0) {
      // Zone 2: 2U Compute / NVMe Caddies (Canvas Y: 234 to 974)
      float s = floor((pix.y - 234.0) / 92.5);
      float localY = mod(pix.y - 234.0, 92.5);
      float c = floor((pix.x - 100.0) / 58.0);
      // Top LED is at localY ~ 21..24.5; Bottom LED is at localY ~ 33..36.5
      // Split at 28.5 is strictly in the black gap between LEDs (ZERO slicing glitch!)
      float r = (localY < 28.5) ? 0.0 : 1.0;
      if (r < 0.5) {
        isUpperPowerLed = true;
      }
      ledId = vec2(c, s * 2.0 + r + 10.0);
    } else if (pix.y < 1618.0) {
      // Zone 3: 1U Compute Blades (Canvas Y: 974 to 1618)
      float b = floor((pix.y - 974.0) / 46.0);
      float li = floor((pix.x - 680.0) / 24.0);
      if (li < 0.5) {
        isUpperPowerLed = true; // Blade PWR status indicator
      }
      ledId = vec2(li, b + 40.0);
    } else {
      // Zone 4: SAN Storage / Fans (Canvas Y: 1618 to 1802)
      float r = floor((pix.y - 1618.0) / 28.0);
      float c = floor((pix.x - 76.0) / 44.0);
      ledId = vec2(c, r + 70.0);
    }

    vec2 rackSeed = floor(vRackWorldPos.xz * 2.0);
    float h = rackHash(ledId + rackSeed * 17.31);
    float h2 = rackHash(ledId * 2.3 + rackSeed * 31.7);

    float ledMultiplier = 1.0;
    if (isUpperPowerLed) {
      // Upper Power / Presence indicators:
      // 70% Steady Solid Green (authentic hardware power)
      // 30% Smooth Breathing Heartbeat (calm, elegant, zero-jitter)
      if (h < 0.70) {
        ledMultiplier = 1.0;
      } else {
        float breath = 0.5 + 0.5 * sin(uTime * 2.5 + h * 6.28);
        ledMultiplier = mix(0.30, 1.30, breath);
      }
    } else {
      // Lower LEDs: Drive Activity / Network / Bus Traffic
      // Smooth, natural optical waveforms (eliminates harsh 1-frame strobe noise)
      if (h < 0.15) {
        // 15% Steady idle link
        ledMultiplier = 1.0;
      } else if (h < 0.60) {
        // 45% Dynamic Traffic Bursts: rhythmic burst envelope + smooth optical pulse train
        float cyclePeriod = 1.2 + fract(h * 3.71) * 0.8;
        float burstPhase = fract((uTime + h * 13.0) / cyclePeriod);
        float inBurst = smoothstep(0.0, 0.05, burstPhase) * (1.0 - smoothstep(0.35, 0.42, burstPhase));
        float pulseSpeed = 6.0 + fract(h2 * 5.1) * 4.0;
        float pulse = 0.5 + 0.5 * sin(uTime * pulseSpeed);
        float wave = inBurst * pulse;
        ledMultiplier = mix(0.18, 1.45, wave);
      } else if (h < 0.85) {
        // 25% Continuous Data Streaming (smooth continuous optical wave)
        float speed = 3.5 + fract(h * 4.3) * 3.0;
        float pulse = 0.5 + 0.5 * sin(uTime * speed + h * 6.28);
        pulse = pulse * pulse;
        ledMultiplier = mix(0.18, 1.40, pulse);
      } else {
        // 15% System Heartbeat / Sync
        float pulse = 0.5 + 0.5 * sin(uTime * 3.0 + h * 6.28);
        ledMultiplier = mix(0.20, 1.35, pulse);
      }
    }

    totalEmissiveRadiance *= ledMultiplier;
  }
#endif`
      );
    };

    // Monitor screen displays (Self-Illuminating!)
    // Preserved classic BSOD material
    this.monitorScreenMaterial = new THREE.MeshBasicMaterial({
      map: this.monitorScreenAtlasTex,
    });
    // High-resolution procedural 16:9 widescreen materials
    this.screenAMaterial = new THREE.MeshBasicMaterial({
      map: this.screenATexture,
    });
    this.screenBMaterial = new THREE.MeshBasicMaterial({
      map: this.screenBTexture,
    });
    this.screenCMaterial = new THREE.MeshBasicMaterial({
      map: this.screenCTexture,
    });
    this.screenDMaterial = new THREE.MeshBasicMaterial({
      map: this.screenDTexture,
    });
    this.screenEMaterial = new THREE.MeshBasicMaterial({
      map: this.screenETexture,
    });
    this.screenFMaterial = new THREE.MeshBasicMaterial({
      map: this.screenFTexture,
    });
    // Destructible Broken LCD Monitor Materials (Emissive backlit cracked LCD)
    // Shader hook strictly zeroes out direct diffuse & specular light reflections, eliminating
    // any orange/yellow muzzle flash reflection, rim-light highlight, or bullet impact spark flare
    const suppressScreenFlashShader = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Completely strip direct & specular flash reflections (eliminates muzzle flash & impact spark glare on screen surface)
        reflectedLight.directSpecular = vec3(0.0);
        reflectedLight.directDiffuse = vec3(0.0);
        reflectedLight.indirectSpecular = vec3(0.0);
        `
      );
    };

    this.brokenScreenMaterial1 = new THREE.MeshStandardMaterial({
      map: this.brokenScreenTexture1,
      emissiveMap: this.brokenScreenTexture1,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.22,
      roughness: 0.36,
      metalness: 0.15,
    });
    this.brokenScreenMaterial1.onBeforeCompile = suppressScreenFlashShader;
    this.brokenScreenMaterial1.customProgramCacheKey = () => 'BrokenScreenNoFlash1';

    this.brokenScreenMaterial2 = new THREE.MeshStandardMaterial({
      map: this.brokenScreenTexture2,
      emissiveMap: this.brokenScreenTexture2,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.22,
      roughness: 0.36,
      metalness: 0.15,
    });
    this.brokenScreenMaterial2.onBeforeCompile = suppressScreenFlashShader;
    this.brokenScreenMaterial2.customProgramCacheKey = () => 'BrokenScreenNoFlash2';

    this.monitorScreens = [];
    // Dell P2425H Monitor Materials
    this.monitorBackMaterial = new THREE.MeshStandardMaterial({
      map: this.monitorBackTexture,
      roughness: 0.62,
      metalness: 0.25,
    });
    this.monitorStandSilverMaterial = new THREE.MeshStandardMaterial({
      color: 0xcfd6df,
      roughness: 0.32,
      metalness: 0.68,
    });
    this.monitorHousingMaterial = new THREE.MeshStandardMaterial({
      color: 0x14161b,
      roughness: 0.70,
      metalness: 0.15,
    });
    this.monitorStandLogoMaterial = new THREE.MeshBasicMaterial({
      map: this.monitorStandLogoTexture,
    });

    // Warning Yellow for barrier top pad and floor hazard line
    this.warningYellowMaterial = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.35,
      metalness: 0.20,
    });

    // Glowing Cyan for PC tower power rings & RGB accent strips
    this.glowingCyanMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
    });

    // High-readability charcoal polymer / metal for chair frames, bases, arms
    this.chairFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x2e343d,
      roughness: 0.50,
      metalness: 0.30,
    });

    // Breathable mesh backrest with see-through alphaTest cutouts
    this.chairMeshMaterial = new THREE.MeshStandardMaterial({
      map: this.chairMeshTexture,
      alphaTest: 0.35,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 0.60,
      metalness: 0.20,
    });

    // Enterprise Breakroom Coffee Station & Palm Materials
    this.coffeeCabinetMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b2d26,
      roughness: 0.60,
      metalness: 0.10,
    });

    this.coffeeCountertopMaterial = new THREE.MeshStandardMaterial({
      color: 0x141619,
      roughness: 0.20,
      metalness: 0.25,
    });

    this.coffeeMachineMaterial = new THREE.MeshStandardMaterial({
      color: 0x181a1e,
      roughness: 0.45,
      metalness: 0.30,
    });

    this.coffeeSideMaterial = new THREE.MeshStandardMaterial({
      map: this.coffeeSideTexture,
      roughness: 0.35,
      metalness: 0.10,
    });

    this.coffeeScreenMaterial = new THREE.MeshStandardMaterial({
      map: this.coffeeScreenTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this.coffeeScreenTexture,
      emissiveIntensity: 0.85,
      roughness: 0.20,
      metalness: 0.10,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    this.coffeeHopperMaterial = new THREE.MeshStandardMaterial({
      map: this.coffeeHopperTexture,
      roughness: 0.30,
      metalness: 0.10,
    });

    this.coffeeSilverMaterial = new THREE.MeshStandardMaterial({
      color: 0xc8cfd8,
      roughness: 0.28,
      metalness: 0.85,
    });

    this.coffeeRedSlashMaterial = new THREE.MeshBasicMaterial({
      color: 0xdd1824,
    });

    this.coffeeCupMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f6f8,
      roughness: 0.65,
      metalness: 0.02,
    });

    this.palmPotMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8ecf0,
      roughness: 0.55,
      metalness: 0.05,
    });

    this.palmSoilMaterial = new THREE.MeshStandardMaterial({
      color: 0x261911,
      roughness: 0.90,
      metalness: 0.02,
    });

    this.palmStemMaterial = new THREE.MeshStandardMaterial({
      color: 0x769e2c,
      roughness: 0.50,
      metalness: 0.10,
    });

    this.palmFrondMaterial = new THREE.MeshStandardMaterial({
      map: this.palmFrondTexture,
      alphaTest: 0.50,
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      roughness: 0.45,
      metalness: 0.05,
    });

    // High-Detail Procedural Mechanical Keyboards & Ergonomic Mice Materials
    this.keyboardChassisMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1d24,
      roughness: 0.50,
      metalness: 0.35,
    });

    this.keyboardPlateMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f1117,
      roughness: 0.60,
      metalness: 0.20,
    });

    this.keyboardKeyMaterial = new THREE.MeshStandardMaterial({
      map: this.keyboardDiffuseTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this.keyboardEmissiveTexture,
      emissiveIntensity: 0.85,
      roughness: 0.40,
      metalness: 0.15,
    });

    this.mousepadMaterial = new THREE.MeshStandardMaterial({
      map: this.mousepadTexture,
      roughness: 0.90,
      metalness: 0.05,
    });

    this.mouseBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e222b,
      roughness: 0.55,
      metalness: 0.15,
    });

    this.mouseButtonMaterial = new THREE.MeshStandardMaterial({
      color: 0x282d38,
      roughness: 0.45,
      metalness: 0.20,
    });

    this.mouseWheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d0f14,
      roughness: 0.85,
      metalness: 0.40,
    });

    // Enterprise SFF Desktop PC Materials (Dell OptiPlex Parody)
    this.sffChassisMaterial = new THREE.MeshStandardMaterial({
      color: 0x22262e,
      roughness: 0.55,
      metalness: 0.45,
    });

    this.sffFrontMaterial = new THREE.MeshStandardMaterial({
      map: this.sffFrontTexture,
      roughness: 0.50,
      metalness: 0.20,
    });

    this.sffRearMaterial = new THREE.MeshStandardMaterial({
      map: this.sffRearTexture,
      roughness: 0.40,
      metalness: 0.65,
    });

    this.sffIOPlateMaterial = new THREE.MeshStandardMaterial({
      color: 0x525862,
      roughness: 0.40,
      metalness: 0.50,
    });

    this.sffRubberFeetMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f1115,
      roughness: 0.85,
      metalness: 0.05,
    });

    this.sffGreenLedMaterial = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
    });

    this.sffIceBlueLedMaterial = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
    });

    this.sffBadgeMaterial = new THREE.MeshBasicMaterial({
      map: this.sffBadgeTexture,
    });

    this.sffStickerMaterial = new THREE.MeshStandardMaterial({
      map: this.sffStickerTexture,
      roughness: 0.25,
      metalness: 0.40,
    });
  }

  /**
   * Restores all shattered destructible monitor display screens in the Data Center
   * back to their clean, intact OS display state.
   */
  resetMonitors() {
    if (!this.monitorScreens) return;
    for (const mesh of this.monitorScreens) {
      mesh.userData.isBroken = false;
      if (mesh.userData.intactMaterial) {
        mesh.material = mesh.userData.intactMaterial;
      }
      if (mesh.userData.intactGeometry) {
        mesh.geometry = mesh.userData.intactGeometry;
      }
    }
  }

  build() {
    this.monitorScreens = [];
    const group = new THREE.Group();
    group.name = 'DataCenterArena';
    this.scene.add(group);

    const colliderGeometries = [];

    // Pre-allocated scratch matrices for zero-GC geometry transformations
    const _m = new THREE.Matrix4();
    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3(1, 1, 1);
    const _e = new THREE.Euler();

    // Visual geometry buckets grouped strictly by material (Batched draw calls!)
    const visualBuckets = {
      floor: [],
      wall: [],
      ceiling: [],
      wallOutlets: [],
      stanchionPosts: [],
      stanchionHardware: [],
      stanchionBelts: [],
      serverCabinet: [],
      serverChassis: [],
      silverTrim: [],
      deskSurface: [],
      serverRackBlade: [],
      monitorScreen: [],
      screenBsod: [],
      screenA: [],
      screenB: [],
      screenC: [],
      screenD: [],
      screenE: [],
      screenF: [],
      monitorBack: [],
      monitorStandSilver: [],
      monitorHousing: [],
      monitorStandLogo: [],
      warningYellow: [],
      plenumFloor: [],
      plenumBase: [],
      plenumBaseboard: [],
      stepNosingMetal: [],
      stepTread: [],
      glowingCyan: [],
      chairFrame: [],
      chairMesh: [],
      coffeeCabinet: [],
      coffeeCountertop: [],
      coffeeMachine: [],
      coffeeSide: [],
      coffeeScreen: [],
      coffeeHopper: [],
      coffeeSilver: [],
      coffeeRedSlash: [],
      coffeeCups: [],
      palmPot: [],
      palmSoil: [],
      palmStems: [],
      palmFronds: [],
      keyboardChassis: [],
      keyboardPlate: [],
      keyboardKeys: [],
      mousepad: [],
      mouseBody: [],
      mouseButtons: [],
      mouseWheel: [],
      sffChassis: [],
      sffFront: [],
      sffRear: [],
      sffIOPlate: [],
      sffRubberFeet: [],
      sffGreenLed: [],
      sffIceBlueLed: [],
      sffBadge: [],
      sffSticker: [],
      splitAcBody: [],
      splitAcFront: [],
      splitAcLouver: [],
    };

    const registerCollider = (geo, posX, posY, posZ, rotX = 0, rotY = 0, rotZ = 0) => {
      _p.set(posX, posY, posZ);
      _e.set(rotX, rotY, rotZ);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);

      const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone();
      nonIndexed.applyMatrix4(_m);
      const cleanGeo = new THREE.BufferGeometry();
      cleanGeo.setAttribute('position', nonIndexed.getAttribute('position'));
      colliderGeometries.push(cleanGeo);
      nonIndexed.dispose();
    };

    const addVisual = (bucket, geo, posX, posY, posZ, rotX = 0, rotY = 0, rotZ = 0) => {
      _p.set(posX, posY, posZ);
      _e.set(rotX, rotY, rotZ);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);

      const g = (geo.index ? geo.toNonIndexed() : geo.clone());
      g.applyMatrix4(_m);
      bucket.push(g);
    };

    const addPart = (bucket, geo, posX, posY, posZ, rotX = 0, rotY = 0, rotZ = 0, collidable = true) => {
      addVisual(bucket, geo, posX, posY, posZ, rotX, rotY, rotZ);
      if (collidable) {
        registerCollider(geo, posX, posY, posZ, rotX, rotY, rotZ);
      }
    };

    const addPartMatrix = (bucket, geo, matrix, collidable = true) => {
      const g = (geo.index ? geo.toNonIndexed() : geo.clone());
      g.applyMatrix4(matrix);
      bucket.push(g);

      if (collidable) {
        const cleanGeo = new THREE.BufferGeometry();
        cleanGeo.setAttribute('position', g.getAttribute('position').clone());
        colliderGeometries.push(cleanGeo);
      }
    };

    // Room dimensions: W = 20.0m, H = 3.8m, L = 23.5m
    const W = 20.0;
    const H = 3.8;
    const L = 23.5;
    const zCenter = 1.75; // Midpoint between -10.0 and +13.5

    // 1. UNIFIED COHESIVE FLOOR (Z = -10.0 to +13.5)
    const floorGeo = new THREE.PlaneGeometry(W, L);
    const floorMesh = new THREE.Mesh(floorGeo, this.floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, zCenter);
    group.add(floorMesh);

    // Floor physics collider
    const floorCollider = new THREE.BoxGeometry(W, 1, L);
    registerCollider(floorCollider, 0, -0.5, zCenter);
    floorCollider.dispose();

    // 2. ENTERPRISE DATA CENTER RAISED PLENUM FLOOR STAGE (Z = 7.5 to 13.5, Height = +0.35m)
    // Elevates Row 3 workstations and the back wall server racks on an authentic modular access plenum floor.
    // Dimensions & collider bounds are 100% preserved (platW = 14.0m, platL = 6.0m, platH = 0.35m, platZ = 10.5m).
    const platW = 14.0;
    const platL = 6.0;
    const platH = 0.35;
    const platZ = 10.5;

    // A. Static BVH Environment Collider for Raised Platform (Identical bounds: 14.0m x 0.35m x 6.0m)
    const platformColliderGeo = new THREE.BoxGeometry(platW, platH, platL);
    registerCollider(platformColliderGeo, 0, platH / 2, platZ);
    platformColliderGeo.dispose();

    // B. Solid, Grounded 3D Platform Base Box (y = 0.0 to y = platH = 0.35m)
    // 100% opaque, outward-facing solid box walls in dark structural gunmetal (#181c24)
    const platformBaseGeo = new THREE.BoxGeometry(platW, platH, platL);
    addVisual(visualBuckets.plenumBase, platformBaseGeo, 0, platH / 2, platZ);
    platformBaseGeo.dispose();

    // C. Clean, Uniform Modular Anti-Static Tiled Top Cap (Sitting cleanly on top at y = platH + 0.002m)
    const topPlaneGeo = new THREE.PlaneGeometry(platW, platL);
    topPlaneGeo.rotateX(-Math.PI / 2);
    addVisual(visualBuckets.plenumFloor, topPlaneGeo, 0, platH + 0.002, platZ);
    topPlaneGeo.dispose();

    // D. Grounding Cove Baseboard Trim at y = 0.0 (0.015m thick x 0.035m tall in #0f1217)
    // Front baseboard strip (Z = 7.5)
    const frontBaseboardGeo = new THREE.BoxGeometry(platW + 0.03, 0.035, 0.015);
    addVisual(visualBuckets.plenumBaseboard, frontBaseboardGeo, 0, 0.035 / 2, 7.5 - 0.015 / 2);
    frontBaseboardGeo.dispose();

    // Left side baseboard strip (X = -7.0m)
    const leftBaseboardGeo = new THREE.BoxGeometry(0.015, 0.035, platL);
    addVisual(visualBuckets.plenumBaseboard, leftBaseboardGeo, -platW / 2 - 0.015 / 2, 0.035 / 2, platZ);
    leftBaseboardGeo.dispose();

    // Right side baseboard strip (X = +7.0m)
    const rightBaseboardGeo = new THREE.BoxGeometry(0.015, 0.035, platL);
    addVisual(visualBuckets.plenumBaseboard, rightBaseboardGeo, platW / 2 + 0.015 / 2, 0.035 / 2, platZ);
    rightBaseboardGeo.dispose();

    // E. Flush, Low-Profile Brushed Slate-Steel Top Perimeter Nosing Channels (No overhanging gap or z-fighting)
    // Front nosing metal channel
    const frontNosingGeo = new THREE.BoxGeometry(platW + 0.03, 0.018, 0.024);
    addVisual(visualBuckets.stepNosingMetal, frontNosingGeo, 0, platH + 0.001, 7.5 - 0.012);
    frontNosingGeo.dispose();

    // Left side nosing metal channel
    const leftNosingGeo = new THREE.BoxGeometry(0.024, 0.018, platL);
    addVisual(visualBuckets.stepNosingMetal, leftNosingGeo, -platW / 2 - 0.012, platH + 0.001, platZ);
    leftNosingGeo.dispose();

    // Right side nosing metal channel
    const rightNosingGeo = new THREE.BoxGeometry(0.024, 0.018, platL);
    addVisual(visualBuckets.stepNosingMetal, rightNosingGeo, platW / 2 + 0.012, platH + 0.001, platZ);
    rightNosingGeo.dispose();

    // F. Flush Ribbed Rubber Anti-Slip Step Tread with High-Tech Sight-Line Accent
    // Front step tread
    const frontTreadGeo = createTreadBoxGeo(platW, 0.004, 0.020, 14, 'x');
    addVisual(visualBuckets.stepTread, frontTreadGeo, 0, platH + 0.005, 7.5 - 0.010);
    frontTreadGeo.dispose();

    // Left side step tread (direct box aligned along Z, no Y-rotation!)
    const leftTreadGeo = createTreadBoxGeo(0.020, 0.004, platL, 6, 'z_left');
    addVisual(visualBuckets.stepTread, leftTreadGeo, -platW / 2 - 0.010, platH + 0.005, platZ);
    leftTreadGeo.dispose();

    // Right side step tread (direct box aligned along Z, no Y-rotation!)
    const rightTreadGeo = createTreadBoxGeo(0.020, 0.004, platL, 6, 'z_right');
    addVisual(visualBuckets.stepTread, rightTreadGeo, platW / 2 + 0.010, platH + 0.005, platZ);
    rightTreadGeo.dispose();

    // 3. PERIMETER WALLS & CEILING
    // Suspended Tech Ceiling (Y = H = 3.8m, facing down -Y toward room)
    const ceilingGeo = new THREE.PlaneGeometry(W, L);
    addVisual(visualBuckets.ceiling, ceilingGeo, 0, H, zCenter, Math.PI / 2, 0, 0);
    ceilingGeo.dispose();

    // Back Wall (Z = +13.5, Room-facing side at Z = +13.0)
    const backWallGeo = createWallBoxGeometry(W, H, 1.0, false, false);
    addPart(visualBuckets.wall, backWallGeo, 0, H / 2, 13.5);
    backWallGeo.dispose();

    // Front Wall (Z = -10.0, Room-facing side at Z = -9.5)
    const frontWallGeo = createWallBoxGeometry(W, H, 1.0, false, true);
    addPart(visualBuckets.wall, frontWallGeo, 0, H / 2, -10.0);
    frontWallGeo.dispose();

    // Left Wall (X = -10.0, Room-facing side at X = -10.0)
    const leftWallGeo = createWallBoxGeometry(1.0, H, L, true, false);
    addPart(visualBuckets.wall, leftWallGeo, -10.5, H / 2, zCenter);
    leftWallGeo.dispose();

    // Right Wall (X = +10.0, Room-facing side at X = +10.0)
    const rightWallGeo = createWallBoxGeometry(1.0, H, L, true, true);
    addPart(visualBuckets.wall, rightWallGeo, 10.5, H / 2, zCenter);
    rightWallGeo.dispose();

    // 3D Batched Brazilian NBR 14136 Outlet Plates along cable raceway (Y = 1.49m)
    // Spaced every 4.0m along left and right walls (Z = -6.0, -2.0, 2.0, 6.0, 10.0)
    const outletGeo = createOutletBoxGeometry(0.27, 0.095, 0.008);
    const outletZPositions = [-6.0, -2.0, 2.0, 6.0, 10.0];
    const outletY = 1.49;

    for (const oz of outletZPositions) {
      // Left Wall (X = -10.0, faces +X into room, rotY = Math.PI / 2)
      addVisual(visualBuckets.wallOutlets, outletGeo, -9.995, outletY, oz, 0, Math.PI / 2, 0);
      // Right Wall (X = +10.0, faces -X into room, rotY = -Math.PI / 2)
      addVisual(visualBuckets.wallOutlets, outletGeo, 9.995, outletY, oz, 0, -Math.PI / 2, 0);
    }
    outletGeo.dispose();

    // Zone A: Ornamental Stanchion Cluster (FPS Hero Scale: Level with coffee countertop at Y ≈ 1.14m)
    // Stanchion Post Hero Scale Templates (38% to 45% chunkier & taller)
    const postMetalBaseGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.032, 24);
    const postMetalCollarGeo = new THREE.CylinderGeometry(0.050, 0.090, 0.045, 24);
    const postMetalPoleGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.91, 20);

    const postHwRubberGeo = new THREE.CylinderGeometry(0.255, 0.255, 0.010, 24);
    const postHwCassetteGeo = new THREE.CylinderGeometry(0.054, 0.054, 0.13, 24);
    const postHwCapGeo = new THREE.CylinderGeometry(0.058, 0.054, 0.016, 24);
    const postHwSlotGeo = new THREE.BoxGeometry(0.018, 0.105, 0.016);
    const postColliderGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.143, 16);
    const endClipGeo = new THREE.BoxGeometry(0.024, 0.090, 0.020);

    // 4 Stanchion Posts in Hero Scale parked along the right wall immediately to the right of the coffee cabinet
    // Post 0 & 1: wall-adjacent pair (center distance 0.95m, clear of wall by 0.20m, linked with belt);
    // Post 2 & 3: front-row staggered posts (generous clearances >= 0.60m from all other posts).
    const stanchionPosts = [
      { x: 9.55, z: -4.95, yaw: 0.28 },  // Connected pair (near wall)
      { x: 9.52, z: -4.00, yaw: -0.36 }, // Connected pair (near wall)
      { x: 9.02, z: -4.55, yaw: 1.12 },  // Standalone post (staggered forward)
      { x: 9.18, z: -3.50, yaw: -1.74 }  // Standalone post (staggered forward)
    ];

    // Assemble 4 Hero Scale stanchion posts
    for (const post of stanchionPosts) {
      const px = post.x;
      const pz = post.z;
      const yaw = post.yaw;

      // 1. Brushed Dark Steel / Metal Parts (visualBuckets.stanchionPosts)
      // Base: bottom at y = 0.010m, top at y = 0.042m
      addVisual(visualBuckets.stanchionPosts, postMetalBaseGeo, px, 0.026, pz, 0, yaw, 0);
      // Flared Collar: bottom at y = 0.042m, top at y = 0.087m
      addVisual(visualBuckets.stanchionPosts, postMetalCollarGeo, px, 0.0645, pz, 0, yaw, 0);
      // Heavy Industrial Pole: bottom at y = 0.087m, top at y = 0.997m
      addVisual(visualBuckets.stanchionPosts, postMetalPoleGeo, px, 0.542, pz, 0, yaw, 0);

      // 2. Black Polymer / Rubber Hardware (visualBuckets.stanchionHardware)
      // Rubber floor ring: resting flat on floor tiles (y = 0.000m to 0.010m)
      addVisual(visualBuckets.stanchionHardware, postHwRubberGeo, px, 0.005, pz, 0, yaw, 0);
      // Cassette head: bottom at y = 0.997m, top at y = 1.127m
      addVisual(visualBuckets.stanchionHardware, postHwCassetteGeo, px, 1.062, pz, 0, yaw, 0);
      // Top cap: top surface sits at y = 1.143m (level with adjacent coffee countertop at 1.145m!)
      addVisual(visualBuckets.stanchionHardware, postHwCapGeo, px, 1.135, pz, 0, yaw, 0);

      // 4 Receiver slots around cassette head at 90-degree increments
      for (let s = 0; s < 4; s++) {
        const slotAngle = yaw + s * (Math.PI / 2);
        const slotX = px + Math.sin(slotAngle) * 0.054;
        const slotZ = pz + Math.cos(slotAngle) * 0.054;
        addVisual(visualBuckets.stanchionHardware, postHwSlotGeo, slotX, 1.062, slotZ, 0, slotAngle, 0);
      }

      // 3. Post Physics & Hitscan Collider (scaled 1:1 with Hero Scale silhouette)
      registerCollider(postColliderGeo, px, 0.5715, pz);
    }

    // 1 Sagging Fabric Belt Span connecting the two wall-adjacent stanchions (Post 0 and Post 1)
    const postA = stanchionPosts[0];
    const postB = stanchionPosts[1];
    const beltGeo = createCatenaryBeltGeometry(postA, postB, 0.024, 1.062, 0.053, 0.036, 0.0025);
    addVisual(visualBuckets.stanchionBelts, beltGeo, 0, 0, 0);
    beltGeo.dispose();

    // Molded plastic belt end-clips at postA and postB attachment points
    const bDx = postB.x - postA.x;
    const bDz = postB.z - postA.z;
    const bDist = Math.hypot(bDx, bDz);
    if (bDist > 0.1) {
      const bUx = bDx / bDist;
      const bUz = bDz / bDist;
      const sx = postA.x + bUx * 0.053;
      const sz = postA.z + bUz * 0.053;
      const ex = postB.x - bUx * 0.053;
      const ez = postB.z - bUz * 0.053;
      const theta = Math.atan2(bDx, bDz);
      addVisual(visualBuckets.stanchionHardware, endClipGeo, sx, 1.062, sz, 0, theta, 0);
      addVisual(visualBuckets.stanchionHardware, endClipGeo, ex, 1.062, ez, 0, theta, 0);
    }

    postMetalBaseGeo.dispose();
    postMetalCollarGeo.dispose();
    postMetalPoleGeo.dispose();
    postHwRubberGeo.dispose();
    postHwCassetteGeo.dispose();
    postHwCapGeo.dispose();
    postHwSlotGeo.dispose();
    postColliderGeo.dispose();
    endClipGeo.dispose();

    // Player Lounge: Enterprise Coffee Station & Potted Areca Palm
    // A. Enterprise Coffee Station (RED Rectangle: Z = -6.8m, X = +9.55m flush to wall)
    // Rotated -Math.PI / 2 so cabinet doors, touchscreen & spout face inward (-X toward player)
    this._buildCoffeeStation(addVisual, registerCollider, visualBuckets, 9.55, 0.0, -6.8);

    // B. Potted Areca Palm Plant (GREEN Rectangle: Z = -8.8m, X = +9.2m corner)
    this._buildArecaPalm(addVisual, registerCollider, visualBuckets, 9.2, 0.0, -8.8);

    // C. Enterprise Wall-Mounted Split AC Units (LG Artcool Mirror Style - +40% FPS Hero Scale)
    // 3 units mounted high on the wall with the stanchions, coffee machine & plant (X = 10.0m) near ceiling (Y = 3.42m)
    // Facing into room (-X), spaced at Z = 0.0m, Z = 5.0m, Z = 10.0m exactly where indicated in screenshot
    const acZPositions = [0.0, 5.0, 10.0];
    for (const acZ of acZPositions) {
      this._buildSplitAC(addVisual, registerCollider, visualBuckets, 9.845, 3.42, acZ);
    }

    // Zone B: 42U Server Racks
    // Back Wall Server Racks: Full row of 8 massive cabinets across Z = 12.52 facing -Z!
    // Stood directly ON TOP of the raised platform at baseY = platH (0.35m), with 8cm rear wall clearance!
    const backRackX = [-5.6, -4.0, -2.4, -0.8, 0.8, 2.4, 4.0, 5.6];
    const backRackZ = 12.52; // Rear face at Z = 12.92, wall at Z = 13.00 -> Clean, unclipped clearance
    for (const rx of backRackX) {
      this._buildServerCabinet(addPart, addVisual, visualBuckets, rx, backRackZ, 0, platH); // rotY = 0 faces -Z, on platform!
    }

    // Zone C: Workstation Cover Rows
    // Row 1: Close Distance (Z = 1.8m, Floor level)
    this._buildWorkstationRow(addPart, addVisual, visualBuckets, 1.8, 0.0, 'close', addPartMatrix);

    // Row 2: Mid Distance (Z = 5.5m, Floor level, staggered wider)
    this._buildWorkstationRow(addPart, addVisual, visualBuckets, 5.5, 0.0, 'mid', addPartMatrix);

    // Row 3: Far Distance (Z = 9.2m, Elevated on +0.35m platform!)
    this._buildWorkstationRow(addPart, addVisual, visualBuckets, 9.2, platH, 'far', addPartMatrix);

    // Batch Merge Geometry Buckets
    const bucketDefs = [
      { bucket: visualBuckets.wall, material: this.wallMaterial, name: 'DC_Walls' },
      { bucket: visualBuckets.ceiling, material: this.ceilingMaterial, name: 'DC_Ceiling' },
      { bucket: visualBuckets.wallOutlets, material: this.outletMaterial, name: 'DC_WallOutlets' },
      { bucket: visualBuckets.stanchionPosts, material: this.stanchionPostMaterial, name: 'DC_StanchionPosts' },
      { bucket: visualBuckets.stanchionHardware, material: this.stanchionHardwareMaterial, name: 'DC_StanchionHardware' },
      { bucket: visualBuckets.stanchionBelts, material: this.stanchionBeltMaterial, name: 'DC_StanchionBelts' },
      { bucket: visualBuckets.serverCabinet, material: this.serverCabinetMaterial, name: 'DC_ServerCabinet' },
      { bucket: visualBuckets.serverChassis, material: this.serverChassisMaterial, name: 'DC_Chassis' },
      { bucket: visualBuckets.silverTrim, material: this.silverTrimMaterial, name: 'DC_SilverTrim' },
      { bucket: visualBuckets.deskSurface, material: this.deskSurfaceMaterial, name: 'DC_DeskSurfaces' },
      { bucket: visualBuckets.serverRackBlade, material: this.serverRackBladeMaterial, name: 'DC_ServerBlades' },
      { bucket: visualBuckets.plenumFloor, material: this.plenumFloorMaterial, name: 'DC_PlenumFloor' },
      { bucket: visualBuckets.plenumBase, material: this.plenumBaseMaterial, name: 'DC_PlenumBase' },
      { bucket: visualBuckets.plenumBaseboard, material: this.plenumBaseboardMaterial, name: 'DC_PlenumBaseboard' },
      { bucket: visualBuckets.stepNosingMetal, material: this.stepNosingMetalMaterial, name: 'DC_StepNosingMetal' },
      { bucket: visualBuckets.stepTread, material: this.stepTreadMaterial, name: 'DC_StepTread' },
      { bucket: visualBuckets.screenBsod, material: this.monitorScreenMaterial, name: 'DC_ScreenBSOD' },
      { bucket: visualBuckets.screenA, material: this.screenAMaterial, name: 'DC_ScreenA' },
      { bucket: visualBuckets.screenB, material: this.screenBMaterial, name: 'DC_ScreenB' },
      { bucket: visualBuckets.screenC, material: this.screenCMaterial, name: 'DC_ScreenC' },
      { bucket: visualBuckets.screenD, material: this.screenDMaterial, name: 'DC_ScreenD' },
      { bucket: visualBuckets.screenE, material: this.screenEMaterial, name: 'DC_ScreenE' },
      { bucket: visualBuckets.screenF, material: this.screenFMaterial, name: 'DC_ScreenF' },
      { bucket: visualBuckets.monitorBack, material: this.monitorBackMaterial, name: 'DC_MonitorBack' },
      { bucket: visualBuckets.monitorStandSilver, material: this.monitorStandSilverMaterial, name: 'DC_MonitorStandSilver' },
      { bucket: visualBuckets.monitorHousing, material: this.monitorHousingMaterial, name: 'DC_MonitorHousing' },
      { bucket: visualBuckets.monitorStandLogo, material: this.monitorStandLogoMaterial, name: 'DC_MonitorStandLogo' },
      { bucket: visualBuckets.warningYellow, material: this.warningYellowMaterial, name: 'DC_WarningYellow' },
      { bucket: visualBuckets.glowingCyan, material: this.glowingCyanMaterial, name: 'DC_CyanGlow' },
      { bucket: visualBuckets.chairFrame, material: this.chairFrameMaterial, name: 'DC_ChairFrames' },
      { bucket: visualBuckets.chairMesh, material: this.chairMeshMaterial, name: 'DC_ChairMeshBacks' },
      { bucket: visualBuckets.coffeeCabinet, material: this.coffeeCabinetMaterial, name: 'DC_CoffeeCabinet' },
      { bucket: visualBuckets.coffeeCountertop, material: this.coffeeCountertopMaterial, name: 'DC_CoffeeCountertop' },
      { bucket: visualBuckets.coffeeMachine, material: this.coffeeMachineMaterial, name: 'DC_CoffeeMachine' },
      { bucket: visualBuckets.coffeeSide, material: this.coffeeSideMaterial, name: 'DC_CoffeeSide' },
      { bucket: visualBuckets.coffeeScreen, material: this.coffeeScreenMaterial, name: 'DC_CoffeeScreen' },
      { bucket: visualBuckets.coffeeHopper, material: this.coffeeHopperMaterial, name: 'DC_CoffeeHopper' },
      { bucket: visualBuckets.coffeeSilver, material: this.coffeeSilverMaterial, name: 'DC_CoffeeSilver' },
      { bucket: visualBuckets.coffeeRedSlash, material: this.coffeeRedSlashMaterial, name: 'DC_CoffeeRedSlash' },
      { bucket: visualBuckets.coffeeCups, material: this.coffeeCupMaterial, name: 'DC_CoffeeCups' },
      { bucket: visualBuckets.palmPot, material: this.palmPotMaterial, name: 'DC_PalmPot' },
      { bucket: visualBuckets.palmSoil, material: this.palmSoilMaterial, name: 'DC_PalmSoil' },
      { bucket: visualBuckets.palmStems, material: this.palmStemMaterial, name: 'DC_PalmStems' },
      { bucket: visualBuckets.palmFronds, material: this.palmFrondMaterial, name: 'DC_PalmFronds' },
      { bucket: visualBuckets.keyboardChassis, material: this.keyboardChassisMaterial, name: 'DC_KeyboardChassis' },
      { bucket: visualBuckets.keyboardPlate, material: this.keyboardPlateMaterial, name: 'DC_KeyboardPlate' },
      { bucket: visualBuckets.keyboardKeys, material: this.keyboardKeyMaterial, name: 'DC_KeyboardKeys' },
      { bucket: visualBuckets.mousepad, material: this.mousepadMaterial, name: 'DC_Mousepads' },
      { bucket: visualBuckets.mouseBody, material: this.mouseBodyMaterial, name: 'DC_MouseBodies' },
      { bucket: visualBuckets.mouseButtons, material: this.mouseButtonMaterial, name: 'DC_MouseButtons' },
      { bucket: visualBuckets.mouseWheel, material: this.mouseWheelMaterial, name: 'DC_MouseWheels' },
      { bucket: visualBuckets.sffChassis, material: this.sffChassisMaterial, name: 'DC_SFFChassis' },
      { bucket: visualBuckets.sffFront, material: this.sffFrontMaterial, name: 'DC_SFFFront' },
      { bucket: visualBuckets.sffRear, material: this.sffRearMaterial, name: 'DC_SFFRear' },
      { bucket: visualBuckets.sffIOPlate, material: this.sffIOPlateMaterial, name: 'DC_SFFIOPlate' },
      { bucket: visualBuckets.sffRubberFeet, material: this.sffRubberFeetMaterial, name: 'DC_SFFRubberFeet' },
      { bucket: visualBuckets.sffGreenLed, material: this.sffGreenLedMaterial, name: 'DC_SFFGreenLed' },
      { bucket: visualBuckets.sffIceBlueLed, material: this.sffIceBlueLedMaterial, name: 'DC_SFFIceBlueLed' },
      { bucket: visualBuckets.sffBadge, material: this.sffBadgeMaterial, name: 'DC_SFFBadge' },
      { bucket: visualBuckets.sffSticker, material: this.sffStickerMaterial, name: 'DC_SFFSticker' },
      { bucket: visualBuckets.splitAcBody, material: this.splitAcBodyMaterial, name: 'DC_SplitAcBody' },
      { bucket: visualBuckets.splitAcFront, material: this.splitAcFrontMaterial, name: 'DC_SplitAcFront' },
      { bucket: visualBuckets.splitAcLouver, material: this.splitAcLouverMaterial, name: 'DC_SplitAcLouver' },
    ];

    for (const def of bucketDefs) {
      if (def.bucket.length > 0) {
        // Ensure all geometries are non-indexed with compatible attributes (position, normal, uv)
        const normalized = def.bucket.map(g => {
          const res = g.index ? g.toNonIndexed() : g.clone();
          if (!res.getAttribute('normal')) {
            res.computeVertexNormals();
          }
          if (!res.getAttribute('uv')) {
            const count = res.getAttribute('position').count;
            res.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
          }
          const attrNames = Object.keys(res.attributes);
          for (const name of attrNames) {
            if (name !== 'position' && name !== 'normal' && name !== 'uv') {
              res.deleteAttribute(name);
            }
          }
          return res;
        });

        const mergedGeo = BufferGeometryUtils.mergeGeometries(normalized, false);
        if (mergedGeo) {
          mergedGeo.computeBoundingBox();
          mergedGeo.computeBoundingSphere();
          const mesh = new THREE.Mesh(mergedGeo, def.material);
          mesh.name = def.name;
          if (def.name === 'DC_ServerBlades') {
            mesh.onBeforeRender = () => {
              this.serverRackBladeUniforms.uTime.value = performance.now() * 0.001;
            };
          }
          group.add(mesh);
        } else {
          console.error(`[WarehouseBuilder] mergeGeometries failed for bucket ${def.name}`);
        }

        // Dispose temporary geometries
        for (let i = 0; i < def.bucket.length; i++) {
          def.bucket[i].dispose();
        }
        for (let i = 0; i < normalized.length; i++) {
          normalized[i].dispose();
        }
      }
    }

    // Unified BVH Colliders: Weapon Hitscan Collider
    const weaponColliderGeo = BufferGeometryUtils.mergeGeometries(colliderGeometries, false);
    weaponColliderGeo.computeVertexNormals();
    weaponColliderGeo.computeBoundsTree({
      maxLeafTris: 5,
      strategy: 0
    });

    this.weaponColliderMesh = new THREE.Mesh(
      weaponColliderGeo,
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    this.weaponColliderMesh.name = 'DataCenterWeaponCollider';
    this.scene.add(this.weaponColliderMesh);
    this.colliderMesh = this.weaponColliderMesh;

    // 2. Player Movement Capsule Collider (Uses unified room collision without artificial invisible walls)
    this.playerColliderMesh = this.weaponColliderMesh;

    return this.weaponColliderMesh;
  }

  /**
   * Builds an individual 42U server cabinet (width 1.2m, height 2.8m, depth 0.8m).
   * Front faceplate faces -Z toward player (rotated by rotY).
   * Supports baseY to stand on floor (baseY = 0) or elevated platform (baseY = platH).
   */
  _buildServerCabinet(addPart, addVisual, visualBuckets, x, z, rotY = 0, baseY = 0) {
    const w = 1.20;
    const h = 2.80;
    const d = 0.80;
    const centerY = baseY + h / 2;

    // 1. Cabinet Chassis (Dark brushed steel rack side panels #1c2028, roughness: 0.45, metalness: 0.55)
    const chassisGeo = new THREE.BoxGeometry(w, h, d);
    addPart(visualBuckets.serverCabinet, chassisGeo, x, centerY, z, 0, rotY, 0, true);
    chassisGeo.dispose();

    // 2. Brushed Silver-Grey Frame Trim around front door (0x6c7685)
    const trimThick = 0.04;
    const trimDepth = 0.03;
    const topTrim = new THREE.BoxGeometry(w, trimThick, trimDepth);
    topTrim.translate(0, h / 2 - trimThick / 2, -d / 2 - trimDepth / 2);
    addVisual(visualBuckets.silverTrim, topTrim, x, centerY, z, 0, rotY, 0);
    topTrim.dispose();

    const btmTrim = new THREE.BoxGeometry(w, trimThick, trimDepth);
    btmTrim.translate(0, -h / 2 + trimThick / 2, -d / 2 - trimDepth / 2);
    addVisual(visualBuckets.silverTrim, btmTrim, x, centerY, z, 0, rotY, 0);
    btmTrim.dispose();

    const sideTrim = new THREE.BoxGeometry(trimThick, h, trimDepth);
    sideTrim.translate(-w / 2 + trimThick / 2, 0, -d / 2 - trimDepth / 2);
    addVisual(visualBuckets.silverTrim, sideTrim, x, centerY, z, 0, rotY, 0);
    sideTrim.dispose();

    const sideTrimR = new THREE.BoxGeometry(trimThick, h, trimDepth);
    sideTrimR.translate(w / 2 - trimThick / 2, 0, -d / 2 - trimDepth / 2);
    addVisual(visualBuckets.silverTrim, sideTrimR, x, centerY, z, 0, rotY, 0);
    sideTrimR.dispose();

    // 3. Front Server Blades Faceplate (Normal points directly toward -Z player)
    const faceW = w - 0.08;
    const faceH = h - 0.08;
    const faceGeo = createPlaneFacingPlayer(faceW, faceH, 0, 0, 1, 1);
    faceGeo.translate(0, 0, -d / 2 - 0.008);
    addVisual(visualBuckets.serverRackBlade, faceGeo, x, centerY, z, 0, rotY, 0);
    faceGeo.dispose();
  }

  /**
   * Builds a row of 2 workstation desks, PC towers, and monitors (+40% Hero Scale).
   */
  _buildWorkstationRow(addPart, addVisual, visualBuckets, z, baseY, tierName, addPartMatrix = null) {
    const deskW = 3.20; // +40% scaled width with spacious equipment clearance
    const deskD = 1.10;
    const deskH = 0.95; // +40% scaled height
    const surfaceY = baseY + deskH;

    // Desks layout: Row 1 & 3 tighter, Row 2 staggered wider
    const isMid = tierName === 'mid';
    const leftDeskX = isMid ? -2.9 : -2.5;
    const rightDeskX = isMid ? 2.9 : 2.5;

    // Build the 2 desks
    this._buildDesk(addPart, addVisual, visualBuckets, leftDeskX, z, deskW, deskD, deskH, baseY);
    this._buildDesk(addPart, addVisual, visualBuckets, rightDeskX, z, deskW, deskD, deskH, baseY);

    // Register Duck Hunt target cover nodes
    this.coverNodes.push({
      id: `${tierName}_left`,
      x: leftDeskX,
      y: surfaceY,
      z: z,
      width: deskW,
      height: deskH,
      tier: tierName
    });

    this.coverNodes.push({
      id: `${tierName}_right`,
      x: rightDeskX,
      y: surfaceY,
      z: z,
      width: deskW,
      height: deskH,
      tier: tierName
    });

    // Place Hero-Scaled SFF PC Towers (0.15m x 0.43m x 0.39m) with natural 0.14m gap to monitors
    const pcW = 0.15;
    let leftPcX, rightPcX;

    if (tierName === 'close') {
      // Row 1: Dual monitors on LeftDesk (front-right in player view), Ultrawide BSOD on RightDesk (front-left in player view)
      leftPcX = (leftDeskX - 0.50 - 0.46) - 0.14 - pcW / 2;
      rightPcX = (rightDeskX + 0.68) + 0.14 + pcW / 2;
    } else if (tierName === 'mid') {
      // Row 2: Ultrawide on Left (outer edge at -3.58), Dual monitors on Right (outer edge at 3.86)
      leftPcX = (leftDeskX - 0.68) - 0.14 - pcW / 2;
      rightPcX = (rightDeskX + 0.50 + 0.46) + 0.14 + pcW / 2;
    } else {
      // Row 3: Dual monitors on both desks (outer edges at ±3.46)
      leftPcX = (leftDeskX - 0.50 - 0.46) - 0.14 - pcW / 2;
      rightPcX = (rightDeskX + 0.50 + 0.46) + 0.14 + pcW / 2;
    }

    // Angle towers ~9.5° inward toward user's chair (left tower +0.165 rad, right tower -0.165 rad)
    this._buildPCTower(addPart, addVisual, visualBuckets, leftPcX, surfaceY, z - 0.05, 0.165);
    this._buildPCTower(addPart, addVisual, visualBuckets, rightPcX, surfaceY, z - 0.05, -0.165);

    // Strictly ONE high-detail mechanical keyboard + contoured mouse and mousepad per desk!
    // Centered ergonomically with desk chair (centered in front of single monitor, or between dual monitors)
    // Subtle natural lived-in rotation (±1.5° to 3° yaw)
    const yawLeft = tierName === 'close' ? -0.035 : (tierName === 'mid' ? -0.045 : 0.038);
    const yawRight = tierName === 'close' ? 0.040 : (tierName === 'mid' ? 0.030 : -0.032);
    this._buildWorkstationPeripherals(addVisual, visualBuckets, leftDeskX, surfaceY, z, yawLeft);
    this._buildWorkstationPeripherals(addVisual, visualBuckets, rightDeskX, surfaceY, z, yawRight);

    // Place Hero Scale Monitors (Collision-Free: 8.5cm dual-screen gap, 26cm PC clearance, ergonomic inward curve)
    if (tierName === 'close') {
      // Row 1: Front-Left Single-Monitor Desk (BSOD), Front-Right Dual-Monitor Desk (Screen C + Screen A)
      this._buildMonitor(addPart, addVisual, visualBuckets, rightDeskX, surfaceY, z, 0, true, 'bsod');             // BSOD Ultrawide centered on Front-Left desk
      this._buildMonitor(addPart, addVisual, visualBuckets, leftDeskX + 0.50, surfaceY, z, 0.10, false, 'screenC');  // Screen C (Dark-Mode AI IDE) on Left monitor of Front-Right desk
      this._buildMonitor(addPart, addVisual, visualBuckets, leftDeskX - 0.50, surfaceY, z, -0.10, false, 'screenA'); // Screen A (Windows 11 Bloom Desktop) on Right monitor of Front-Right desk

      // Front-Right desk chair (centered between dual monitors)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, leftDeskX - 0.18, baseY, z - 0.92, 0.38, addPartMatrix);
      // Front-Left desk chair (centered on ultrawide BSOD, swiveled slightly toward aisle)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, rightDeskX + 0.12, baseY, z - 1.00, -0.52, addPartMatrix);
    } else if (tierName === 'mid') {
      // Row 2: Mid-Left Dual-Monitor Desk (Screen C AI IDE + Screen D Multi-Window), Mid-Right Single-Monitor Desk (Screen B Glow Lock Screen)
      this._buildMonitor(addPart, addVisual, visualBuckets, rightDeskX + 0.50, surfaceY, z, 0.10, false, 'screenC'); // Screen C (Dark-Mode AI IDE) (angled inward)
      this._buildMonitor(addPart, addVisual, visualBuckets, rightDeskX - 0.50, surfaceY, z, -0.10, false, 'screenD'); // Screen D (Windows 11 Active Multi-Window) (angled inward)
      this._buildMonitor(addPart, addVisual, visualBuckets, leftDeskX, surfaceY, z, 0, true, 'screenB');              // Windows 11 Glow Lock Screen Ultrawide centered

      // Mid-Right desk chair (pushed back with hurried exit angle)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, leftDeskX + 0.20, baseY, z - 1.04, 0.75, addPartMatrix);
      // Mid-Left desk chair (casual slight angle)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, rightDeskX - 0.15, baseY, z - 0.86, -0.22, addPartMatrix);
    } else {
      // Row 3 (Far, on +0.35m platform): High-density NOC Dual-Monitor Monitoring Station
      // Left Desk in view: Screen A (Windows 11 Bloom Desktop) + Screen D (Windows 11 Active Multi-Window)
      this._buildMonitor(addPart, addVisual, visualBuckets, rightDeskX + 0.50, surfaceY, z, 0.10, false, 'screenA'); // Windows 11 Bloom Desktop
      this._buildMonitor(addPart, addVisual, visualBuckets, rightDeskX - 0.50, surfaceY, z, -0.10, false, 'screenD'); // Windows 11 Active Multi-Window
      // Right Desk in view: Screen E (Enterprise IT Ticket ERP Portal) + Screen F (Dark-Mode Music App)
      this._buildMonitor(addPart, addVisual, visualBuckets, leftDeskX + 0.50, surfaceY, z, 0.10, false, 'screenE');  // Screen E (Enterprise IT ERP Portal)
      this._buildMonitor(addPart, addVisual, visualBuckets, leftDeskX - 0.50, surfaceY, z, -0.10, false, 'screenF');  // Screen F (Dark-Mode Music App)

      // Left desk chair (on raised platform baseY = platH, swiveled toward left aisle)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, rightDeskX + 0.25, baseY, z - 1.05, 0.98, addPartMatrix);
      // Right desk chair (on raised platform baseY = platH, pushed back with rapid swivel)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, leftDeskX - 0.10, baseY, z - 0.90, -0.62, addPartMatrix);
    }
  }

  /**
   * Builds strictly ONE ergonomic Workstation Peripheral Kit (Mechanical Keyboard, Mousepad, and Optical Mouse).
   * Aligns keyboard slightly left-of-center (~0.14m back from front edge) and mousepad cleanly to the right
   * with a 0.09m clear gap so zero geometry clips or overlaps.
   */
  _buildWorkstationPeripherals(addVisual, visualBuckets, cx, surfaceY, deskZ, yawOffset = 0) {
    const scale = new THREE.Vector3(1, 1, 1);

    // -------------------------------------------------------------
    // 1. PROCEDURAL 3D MECHANICAL KEYBOARD
    // -------------------------------------------------------------
    // Keyboard center: slightly to user's left in front of chair (~0.10m left in +X), ~0.14m from front edge
    const kbX = cx + 0.10;
    const kbZ = deskZ - 0.335;
    const kbPitch = -0.087; // ~5° pitch tilt toward user (rear higher than front)

    // Base transform for keyboard (centered on kbX, surfaceY, kbZ with yawOffset)
    const kbPos = new THREE.Vector3(kbX, surfaceY, kbZ);
    const kbQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawOffset, 0, 'YXZ'));
    const kbBaseMatrix = new THREE.Matrix4().compose(kbPos, kbQuat, scale);

    // Tilted keyboard transform: tilted by ~5° around local X, center raised so front rests flush on desk
    const kbTiltedLocal = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.0145, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(kbPitch, 0, 0, 'XYZ')),
      scale
    );
    const kbWorldMatrix = kbBaseMatrix.clone().multiply(kbTiltedLocal);

    // Helper to push transformed geometry into a visual bucket
    const pushPart = (bucket, geo, localX = 0, localY = 0, localZ = 0, rotX = 0, rotY = 0, rotZ = 0) => {
      const partLocal = new THREE.Matrix4().compose(
        new THREE.Vector3(localX, localY, localZ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ)),
        scale
      );
      const finalMat = kbWorldMatrix.clone().multiply(partLocal);
      const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
      nonIndexed.applyMatrix4(finalMat);
      bucket.push(nonIndexed);
      if (geo !== nonIndexed) {
        geo.dispose();
      }
    };

    // A. Lower Wedge Chassis (0.44m wide x 0.15m deep x 0.016m tall, #1a1d24)
    const chassisGeo = new THREE.BoxGeometry(0.44, 0.016, 0.15);
    pushPart(visualBuckets.keyboardChassis, chassisGeo, 0, 0, 0);

    // B. Bezel Frame Outer Strips
    // Top bezel (+Z)
    const topBezel = new THREE.BoxGeometry(0.44, 0.005, 0.011);
    pushPart(visualBuckets.keyboardChassis, topBezel, 0, 0.009, 0.0695);
    // Bottom bezel (-Z)
    const btmBezel = new THREE.BoxGeometry(0.44, 0.005, 0.011);
    pushPart(visualBuckets.keyboardChassis, btmBezel, 0, 0.009, -0.0695);
    // Left bezel (-X)
    const leftBezel = new THREE.BoxGeometry(0.012, 0.005, 0.128);
    pushPart(visualBuckets.keyboardChassis, leftBezel, -0.214, 0.009, 0);
    // Right bezel (+X)
    const rightBezel = new THREE.BoxGeometry(0.012, 0.005, 0.128);
    pushPart(visualBuckets.keyboardChassis, rightBezel, 0.214, 0.009, 0);

    // C. Recessed Keywell Plate (#0f1117)
    const plateGeo = new THREE.BoxGeometry(0.416, 0.002, 0.128);
    pushPart(visualBuckets.keyboardPlate, plateGeo, 0, 0.007, 0);

    // D. Rear Flip-Out Riser Feet (Rest on desk surface under rear chassis)
    const footGeoL = new THREE.BoxGeometry(0.024, 0.010, 0.018);
    pushPart(visualBuckets.keyboardChassis, footGeoL, -0.19, -0.009, 0.055);
    const footGeoR = new THREE.BoxGeometry(0.024, 0.010, 0.018);
    pushPart(visualBuckets.keyboardChassis, footGeoR, 0.19, -0.009, 0.055);

    // E. 3D Raised Keycap Island Meshes (With planar-projected keyboard texture)
    // 1. Function Row Block (ESC + F1..F12 on left)
    const fRowGeo = createKeycapBlockGeometry(0.244, 0.008, 0.016, 0.080, 0.046);
    pushPart(visualBuckets.keyboardKeys, fRowGeo, 0, 0.008, 0);

    // 2. Main 60% Alphanumeric Block (on left)
    const alphaGeo = createKeycapBlockGeometry(0.244, 0.008, 0.056, 0.080, 0.002);
    pushPart(visualBuckets.keyboardKeys, alphaGeo, 0, 0.008, 0);

    // 3. Distinct Raised Spacebar Block (taller: 0.010m)
    const spaceGeo = createKeycapBlockGeometry(0.118, 0.010, 0.016, 0.076, -0.046);
    pushPart(visualBuckets.keyboardKeys, spaceGeo, 0, 0.008, 0);

    // 4. Bottom Modifiers Left & Right
    const modLGeo = createKeycapBlockGeometry(0.062, 0.008, 0.016, 0.171, -0.046);
    pushPart(visualBuckets.keyboardKeys, modLGeo, 0, 0.008, 0);
    const modRGeo = createKeycapBlockGeometry(0.054, 0.008, 0.016, -0.015, -0.046);
    pushPart(visualBuckets.keyboardKeys, modRGeo, 0, 0.008, 0);

    // 5. Nav Cluster Function Keys (Prt/Scr/Pause)
    const navTopGeo = createKeycapBlockGeometry(0.048, 0.008, 0.016, -0.075, 0.046);
    pushPart(visualBuckets.keyboardKeys, navTopGeo, 0, 0.008, 0);

    // 6. Nav Cluster Mid Keys (Ins/Del/Home/End/PgUp/PgDn)
    const navMidGeo = createKeycapBlockGeometry(0.048, 0.008, 0.034, -0.075, 0.013);
    pushPart(visualBuckets.keyboardKeys, navMidGeo, 0, 0.008, 0);

    // 7. Inverted-T Up Arrow
    const arrowUpGeo = createKeycapBlockGeometry(0.016, 0.008, 0.016, -0.075, -0.024);
    pushPart(visualBuckets.keyboardKeys, arrowUpGeo, 0, 0.008, 0);

    // 8. Inverted-T Left/Down/Right Arrows
    const arrowBtmGeo = createKeycapBlockGeometry(0.048, 0.008, 0.016, -0.075, -0.046);
    pushPart(visualBuckets.keyboardKeys, arrowBtmGeo, 0, 0.008, 0);

    // 9. Numpad Status LEDs & Top Row (on right)
    const numTopGeo = createKeycapBlockGeometry(0.086, 0.008, 0.016, -0.158, 0.046);
    pushPart(visualBuckets.keyboardKeys, numTopGeo, 0, 0.008, 0);

    // 10. Numpad Main Number Block (on right)
    const numMainGeo = createKeycapBlockGeometry(0.086, 0.008, 0.076, -0.158, -0.016);
    pushPart(visualBuckets.keyboardKeys, numMainGeo, 0, 0.008, 0);

    // (Wireless Mechanical Keyboard: zero cables)

    // -------------------------------------------------------------
    // 2. PROCEDURAL 3D TACTICAL MOUSEPAD & CONTOURED OPTICAL MOUSE
    // -------------------------------------------------------------
    // Mousepad center: clean 0.09m clear gap from keyboard right edge (zero overlap/clipping!)
    // Keyboard right edge is kbX - 0.22 = cx - 0.12.
    // Mousepad left edge is (cx - 0.12) - 0.09 = cx - 0.21. Width is 0.25 -> padX = cx - 0.335.
    const padX = cx - 0.335;
    const padZ = deskZ - 0.325;
    const padW = 0.25;
    const padD = 0.21;
    const padH = 0.004;

    // Mousepad Transform (flush on desk surface at surfaceY)
    const padPos = new THREE.Vector3(padX, surfaceY + padH / 2, padZ);
    const padQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yawOffset, 0));
    const padMatrix = new THREE.Matrix4().compose(padPos, padQuat, scale);

    const mousepadGeo = createMousepadGeometry(padW, padH, padD);
    mousepadGeo.applyMatrix4(padMatrix);
    visualBuckets.mousepad.push(mousepadGeo);

    // Sculpted 3D Optical Mouse: sitting on top of mousepad (base at surfaceY + padH)
    // Hand angle: ~6° inward yaw
    const mousePos = new THREE.Vector3(padX, surfaceY + padH, padZ);
    const mouseYaw = yawOffset + 0.10; // ~6° natural right-hand inward yaw
    const mouseQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, mouseYaw, 0));
    const mouseBaseMatrix = new THREE.Matrix4().compose(mousePos, mouseQuat, scale);

    const pushMousePart = (bucket, geo, localX = 0, localY = 0, localZ = 0, rotX = 0, rotY = 0, rotZ = 0) => {
      const partLocal = new THREE.Matrix4().compose(
        new THREE.Vector3(localX, localY, localZ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ)),
        scale
      );
      const finalMat = mouseBaseMatrix.clone().multiply(partLocal);
      const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
      nonIndexed.applyMatrix4(finalMat);
      bucket.push(nonIndexed);
      if (geo !== nonIndexed) {
        geo.dispose();
      }
    };

    // A. Sculpted Organic Mouse Body:
    // 1. Contoured lower base chassis with ergonomic waist and thumb rest
    const mouseBaseGeo = createSculptedMouseBaseGeometry();
    pushMousePart(visualBuckets.mouseBody, mouseBaseGeo, 0, 0, 0);

    // 2. Smooth 8-segment curved palm dome hump
    const palmDomeGeo = createSculptedMousePalmGeometry();
    pushMousePart(visualBuckets.mouseBody, palmDomeGeo, 0, 0, 0);

    // B. Sculpted Beveled Split Left & Right Click Button Plates:
    const leftClickGeo = createSculptedMouseButtonGeometry(true);
    pushMousePart(visualBuckets.mouseButtons, leftClickGeo, 0, 0, 0);

    const rightClickGeo = createSculptedMouseButtonGeometry(false);
    pushMousePart(visualBuckets.mouseButtons, rightClickGeo, 0, 0, 0);

    // C. Center Recessed Wheel Well & 3D Scroll Wheel
    const wheelWellGeo = new THREE.BoxGeometry(0.005, 0.008, 0.026);
    pushMousePart(visualBuckets.keyboardPlate, wheelWellGeo, 0, 0.015, 0.026);

    const wheelGeo = new THREE.CylinderGeometry(0.0058, 0.0058, 0.0040, 24);
    wheelGeo.rotateZ(Math.PI / 2);
    pushMousePart(visualBuckets.mouseWheel, wheelGeo, 0, 0.019, 0.026);

    const wheelAxleGeo = new THREE.CylinderGeometry(0.0040, 0.0040, 0.0048, 16);
    wheelAxleGeo.rotateZ(Math.PI / 2);
    pushMousePart(visualBuckets.silverTrim, wheelAxleGeo, 0, 0.019, 0.026);

    // D. Ergonomic Thumb Side Buttons (Back / Forward on left +X flank)
    const thumbBackGeo = new THREE.BoxGeometry(0.0025, 0.0035, 0.011);
    pushMousePart(visualBuckets.mouseButtons, thumbBackGeo, 0.030, 0.015, -0.004);

    const thumbFwdGeo = new THREE.BoxGeometry(0.0025, 0.0035, 0.011);
    pushMousePart(visualBuckets.mouseButtons, thumbFwdGeo, 0.029, 0.015, 0.010);

    // E. Sleek Recessed DPI LED Accent Strip & Optical Sensor Glow
    const dpiLedGeo = new THREE.BoxGeometry(0.002, 0.0015, 0.007);
    pushMousePart(visualBuckets.glowingCyan, dpiLedGeo, 0, 0.022, 0.006);

    // PTFE Skates (Glides) on bottom
    const skateFGeo = new THREE.BoxGeometry(0.034, 0.0006, 0.008);
    pushMousePart(visualBuckets.mouseButtons, skateFGeo, 0, 0.0003, 0.044);

    const skateRGeo = new THREE.BoxGeometry(0.042, 0.0006, 0.010);
    pushMousePart(visualBuckets.mouseButtons, skateRGeo, 0, 0.0003, -0.044);

    // Red optical sensor glow underneath base
    const sensorGeo = new THREE.BoxGeometry(0.006, 0.0005, 0.008);
    pushMousePart(visualBuckets.coffeeRedSlash, sensorGeo, 0, 0.0003, -0.004);

    // (Wireless Optical Mouse: zero cables)
  }

  /**
   * Builds an IT Workstation desk (+40% scale, warm technical light-slate top, silver trim).
   */
  _buildDesk(addPart, addVisual, visualBuckets, x, z, width, depth, height, baseY) {
    const topThickness = 0.08;
    const deskY = baseY + height;

    // 1. Desktop Work Surface (Warm technical light-slate 0x4a525e)
    const topGeo = new THREE.BoxGeometry(width, topThickness, depth);
    addPart(visualBuckets.deskSurface, topGeo, x, deskY - topThickness / 2, z, 0, 0, 0, true);
    topGeo.dispose();

    // 2. Brushed Silver-Grey Edge Trim around desktop perimeter (0x6c7685)
    const trimFront = new THREE.BoxGeometry(width + 0.02, 0.03, 0.02);
    addVisual(visualBuckets.silverTrim, trimFront, x, deskY - topThickness / 2, z - depth / 2 - 0.01);
    trimFront.dispose();

    // 3. Dark Steel Legs (4 chunky square legs)
    const legGeo = new THREE.BoxGeometry(0.09, height - topThickness, 0.09);
    const dx = width / 2 - 0.12;
    const dz = depth / 2 - 0.12;
    const legCenterY = baseY + (height - topThickness) / 2;
    const corners = [
      [x - dx, z - dz],
      [x + dx, z - dz],
      [x - dx, z + dz],
      [x + dx, z + dz]
    ];
    for (const [lx, lz] of corners) {
      addPart(visualBuckets.serverChassis, legGeo, lx, legCenterY, lz, 0, 0, 0, true);
    }
    legGeo.dispose();
  }

  /**
   * Builds an FPS Hero Scale Enterprise Small Form Factor (SFF) desktop workstation tower
   * (~0.15m wide x ~0.43m tall x ~0.39m deep, ~80% of adjacent monitor height).
   * - Sits completely flush on desk surface (y = deskTopY).
   * - Angled inward toward user's chair via rotY (~9.5°).
   * - Front bezel: vertical louvers, top-left optical drive, top-right brushed grey I/O strip,
   *   bottom-right asset tag, and centered dedicated razor-sharp 3D circular parody "PC" badge.
   * - Rear panel: stamped galvanized steel backplate, motherboard I/O, 6x14 exhaust vents,
   *   PCIe brackets, C14 power socket, and green diagnostic LED.
   * - Physics: main chassis box registered into three-mesh-bvh collision tree with rotY angle.
   */
  _buildPCTower(addPart, addVisual, visualBuckets, x, y, z, rotY = 0) {
    const w = 0.15;
    const h = 0.43;
    const d = 0.39;
    const chassisY = y + h / 2; // Bottom flush on desk surface (y = deskTopY)

    // Helper to position and orient sub-parts relative to the tower center with yaw rotation rotY
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const addLocal = (bucket, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0, collidable = false) => {
      const px = x + (lx * cosY + lz * sinY);
      const py = chassisY + ly;
      const pz = z + (-lx * sinY + lz * cosY);
      const totalRotY = rotY + ry;
      if (collidable) {
        addPart(bucket, geo, px, py, pz, rx, totalRotY, rz, true);
      } else {
        addVisual(bucket, geo, px, py, pz, rx, totalRotY, rz);
      }
    };

    // 1. Four Dark Rubber Bottom Feet (flush with desk surface at y)
    const footW = 0.022;
    const footH = 0.003;
    const footD = 0.030;
    const footGeo = new THREE.BoxGeometry(footW, footH, footD);
    const fxOffsets = [-1, 1];
    const fzOffsets = [-1, 1];
    for (const sx of fxOffsets) {
      for (const sz of fzOffsets) {
        const lx = sx * (w / 2 - footW / 2 - 0.008);
        const lz = sz * (d / 2 - footD / 2 - 0.016);
        addLocal(visualBuckets.sffRubberFeet, footGeo, lx, -h / 2 + footH / 2, lz);
      }
    }
    footGeo.dispose();

    // 2. Main Tower Chassis (Matte dark charcoal gunmetal #22262e)
    // Registered in BVH collider so bullets leave sparks/decals and player collides accurately!
    const chassisGeo = new THREE.BoxGeometry(w, h, d);
    addLocal(visualBuckets.sffChassis, chassisGeo, 0, 0, 0, 0, 0, 0, true);
    chassisGeo.dispose();

    // 3. Subtle Recessed Side-Panel Seam Lines
    const seamGeo = new THREE.BoxGeometry(0.001, h - 0.03, d * 0.75);
    addLocal(visualBuckets.sffRubberFeet, seamGeo, -w / 2 - 0.0005, 0, 0);
    addLocal(visualBuckets.sffRubberFeet, seamGeo, w / 2 + 0.0005, 0, 0);
    seamGeo.dispose();

    // 4. Front Bezel 3D ABS Outer Lip (#111318)
    const lipThick = 0.006;
    const lipDepth = 0.008;
    const frontLz = -d / 2;

    const topLipGeo = new THREE.BoxGeometry(w + 0.002, lipThick, lipDepth);
    addLocal(visualBuckets.sffChassis, topLipGeo, 0, h / 2 - lipThick / 2, frontLz - lipDepth / 2);
    topLipGeo.dispose();

    const botLipGeo = new THREE.BoxGeometry(w + 0.002, lipThick, lipDepth);
    addLocal(visualBuckets.sffChassis, botLipGeo, 0, -h / 2 + lipThick / 2, frontLz - lipDepth / 2);
    botLipGeo.dispose();

    const sideLipGeo = new THREE.BoxGeometry(lipThick, h - 2 * lipThick, lipDepth);
    addLocal(visualBuckets.sffChassis, sideLipGeo, -w / 2 + lipThick / 2, 0, frontLz - lipDepth / 2);
    addLocal(visualBuckets.sffChassis, sideLipGeo, w / 2 - lipThick / 2, 0, frontLz - lipDepth / 2);
    sideLipGeo.dispose();

    // 5. Front Faceplate with High-Res Procedural Bezel Texture (unmirrored, facing -Z)
    // Top-Left: Optical Drive, Top-Right: Brushed Grey I/O Strip, Bottom-Right: Service Tag Plate
    const frontPlaneGeo = createFrontBezelPlane(w - 2 * lipThick, h - 2 * lipThick);
    addLocal(visualBuckets.sffFront, frontPlaneGeo, 0, 0, frontLz - 0.001);
    frontPlaneGeo.dispose();

    // 6. Dedicated High-Res Razor-Sharp Parody "PC" Badge Mesh (radius 0.026m)
    // Positioned at center mounting pad, offset 0.004m forward in front of slats for ZERO z-fighting!
    const badgeRadius = 0.026;
    const badgeLy = -0.05 * h;
    const badgeGeo = createFrontBadgeCircle(badgeRadius, 32);
    addLocal(visualBuckets.sffBadge, badgeGeo, 0, badgeLy, frontLz - 0.004);
    badgeGeo.dispose();

    // 3D Brushed Silver Bezel Torus Rim framing the badge
    const badgeRimGeo = new THREE.TorusGeometry(badgeRadius, 0.002, 8, 32);
    addLocal(visualBuckets.silverTrim, badgeRimGeo, 0, badgeLy, frontLz - 0.0045);
    badgeRimGeo.dispose();

    // 7. Upper-Right I/O Module 3D Power LED Slit (White/Ice-Blue Glow)
    // Canvas X=422 -> U=0.824 (Canvas Right, Screen Right -> Local X < 0), Y=85 -> V=0.917 (Top)
    const pLx = -(0.824 - 0.5) * (w - 2 * lipThick);
    const pLy = (0.917 - 0.5) * (h - 2 * lipThick);
    const ledSlitGeo = new THREE.BoxGeometry(0.0016, 0.008, 0.002);
    addLocal(visualBuckets.sffIceBlueLed, ledSlitGeo, pLx, pLy, frontLz - 0.003);
    ledSlitGeo.dispose();

    // 8. Dedicated Metallic-Blue Processor Sticker Badge (Intel Core i9 Parody)
    // Mounted in bottom-right corner recess, directly aligned below top-right I/O strip
    // Canvas X=422 -> U=0.824 (Canvas Right, Screen Right -> Local X < 0), Y=905 -> V=0.1162
    const stickerW = 0.022;
    const stickerH = 0.024;
    const stickerLx = -(0.824 - 0.5) * (w - 2 * lipThick);
    const stickerLy = ((1024 - 905) / 1024 - 0.5) * (h - 2 * lipThick);
    const stickerGeo = createFrontBezelPlane(stickerW, stickerH);
    addLocal(visualBuckets.sffSticker, stickerGeo, stickerLx, stickerLy, frontLz - 0.004);
    stickerGeo.dispose();

    // 9. Rear Faceplate with Stamped Steel I/O Shield Texture (faces +Z)
    // Left: Motherboard I/O ports. Right: Honeycomb exhaust perforations.
    const rearPlaneGeo = new THREE.PlaneGeometry(w, h);
    addLocal(visualBuckets.sffRear, rearPlaneGeo, 0, 0, d / 2 + 0.001);
    rearPlaneGeo.dispose();

    // 10. Rear 3D Relief Details:
    // IEC C14 Power Socket Housing (Bottom PSU, centered)
    const socketGeo = new THREE.BoxGeometry(0.042, 0.028, 0.004);
    const sockLx = (250 / 512 - 0.5) * w;
    const sockLy = ((1024 - 790) / 1024 - 0.5) * h;
    addLocal(visualBuckets.sffChassis, socketGeo, sockLx, sockLy, d / 2 + 0.002);
    socketGeo.dispose();

    // PSU Diagnostic LED (Tiny 3D glowing green cylinder at bottom-left)
    const psuLedLx = (145 / 512 - 0.5) * w;
    const psuLedLy = ((1024 - 925) / 1024 - 0.5) * h;
    const psuLedGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.0025, 12);
    addLocal(visualBuckets.sffGreenLed, psuLedGeo, psuLedLx, psuLedLy, d / 2 + 0.003, Math.PI / 2, 0, 0);
    psuLedGeo.dispose();

    // Two Rear Side-Panel Thumbscrews on Case Right Edge (+X)
    const screwGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.005, 12);
    addLocal(visualBuckets.silverTrim, screwGeo, w / 2 - 0.008, h * 0.25, d / 2 + 0.003, Math.PI / 2, 0, 0);
    addLocal(visualBuckets.silverTrim, screwGeo, w / 2 - 0.008, -h * 0.25, d / 2 + 0.003, Math.PI / 2, 0, 0);
    screwGeo.dispose();
  }

  /**
   * Builds a Monitor (+40% Hero Scale) facing -Z directly toward player.
   * Stand post and base are positioned strictly BEHIND the screen (+Z side).
   */
  /**
   * Builds a Monitor (+40% Hero Scale) facing -Z directly toward player.
   * Dell P2425H Industrial Design:
   * - Ultra-thin 3-sided front micro-bezels + bottom chin bar with ice-blue power LED pinpoint.
   * - Contoured matte charcoal rear casing with procedural CanvasTexture (cooling vents, circular "PC" logo,
   *   VESA mount with quick-release tab, recessed port pocket with QR sticker, OSD joystick & power button).
   * - Iconic Dell Platinum-Silver Stand with thin beveled base plate, black under-pad, vertical riser column
   *   featuring an OPEN cable-management pass-through cutout slot, and front "PC" micro-badge.
   * - Screen display plane kept at 100% exact original coordinates, size, and existing screen textures!
   */
  _buildMonitor(addPart, addVisual, visualBuckets, x, y, z, rotY = 0, isUltrawide = false, screenType = 'bsod') {
    // Hero Scale: Standard (0.92m x 0.58m), Ultrawide (1.36m x 0.62m)
    const monW = isUltrawide ? 1.36 : 0.92;
    const monH = isUltrawide ? 0.62 : 0.58;
    const monD = 0.045;
    const centerY = y + 0.34;

    // Stand offsets in local monitor space (+Z is behind monitor)
    const standZ = monD / 2 + 0.048; // Center of vertical column
    const baseZ = monD / 2 + 0.055;  // Center of base plate

    // -----------------------------------------------------------------------
    // 1. Sleek Low-Profile Platinum-Silver Base Plate + Black Under-Pad
    // -----------------------------------------------------------------------
    // Bottom thin matte-black foot pad (~0.004m thick) resting flush on desk surface
    const footPadGeo = new THREE.BoxGeometry(0.276, 0.004, 0.206);
    footPadGeo.translate(0, 0.002, baseZ);
    addVisual(visualBuckets.monitorHousing, footPadGeo, x, y, z, 0, rotY, 0);
    footPadGeo.dispose();

    // Platinum-Silver Base Plate (0.28m wide x 0.21m deep x 0.009m thick)
    const basePlateGeo = new THREE.BoxGeometry(0.280, 0.009, 0.210);
    basePlateGeo.translate(0, 0.0085, baseZ);
    addPart(visualBuckets.monitorStandSilver, basePlateGeo, x, y, z, 0, rotY, 0, false);
    basePlateGeo.dispose();

    // Subtle beveled edge trim on base plate
    const chamferGeo = new THREE.BoxGeometry(0.284, 0.003, 0.214);
    chamferGeo.translate(0, 0.0055, baseZ);
    addVisual(visualBuckets.monitorStandSilver, chamferGeo, x, y, z, 0, rotY, 0);
    chamferGeo.dispose();

    // -----------------------------------------------------------------------
    // 2. Contoured Silver Vertical Riser Column with Cable-Management Pass-Through Slot
    // -----------------------------------------------------------------------
    // Column dimensions: width ~0.056m x depth ~0.032m
    // A. Lower solid section / column foot (y = 0.013 to y = 0.065, height = 0.052m)
    const footH = 0.052;
    const lowerColGeo = new THREE.BoxGeometry(0.056, footH, 0.032);
    lowerColGeo.translate(0, 0.013 + footH / 2, standZ);
    addVisual(visualBuckets.monitorStandSilver, lowerColGeo, x, y, z, 0, rotY, 0);
    lowerColGeo.dispose();

    // Front Riser "PC" Micro-Logo (facing user/keyboard on front of lower section)
    const standLogoGeo = createPlaneFacingPlayer(0.024, 0.012);
    standLogoGeo.translate(0, 0.013 + footH / 2, standZ - 0.016 - 0.001);
    addVisual(visualBuckets.monitorStandLogo, standLogoGeo, x, y, z, 0, rotY, 0);
    standLogoGeo.dispose();

    // B. Middle Section with OPEN Cable Pass-Through Slot (y = 0.065 to y = 0.160, height = 0.095m)
    const slotH = 0.095;
    const pillarW = 0.015; // Left & Right framing pillars (0.015 * 2 + 0.026 slot = 0.056 total width)
    const leftPillarGeo = new THREE.BoxGeometry(pillarW, slotH, 0.032);
    leftPillarGeo.translate(-0.0205, 0.065 + slotH / 2, standZ);
    addVisual(visualBuckets.monitorStandSilver, leftPillarGeo, x, y, z, 0, rotY, 0);
    leftPillarGeo.dispose();

    const rightPillarGeo = new THREE.BoxGeometry(pillarW, slotH, 0.032);
    rightPillarGeo.translate(0.0205, 0.065 + slotH / 2, standZ);
    addVisual(visualBuckets.monitorStandSilver, rightPillarGeo, x, y, z, 0, rotY, 0);
    rightPillarGeo.dispose();

    // Dark-grey inner sleeve lining inside the slot (top and bottom curved lip)
    const sleeveBotGeo = new THREE.BoxGeometry(0.026, 0.008, 0.030);
    sleeveBotGeo.translate(0, 0.065 + 0.004, standZ);
    addVisual(visualBuckets.monitorHousing, sleeveBotGeo, x, y, z, 0, rotY, 0);
    sleeveBotGeo.dispose();

    const sleeveTopGeo = new THREE.BoxGeometry(0.026, 0.008, 0.030);
    sleeveTopGeo.translate(0, 0.160 - 0.004, standZ);
    addVisual(visualBuckets.monitorHousing, sleeveTopGeo, x, y, z, 0, rotY, 0);
    sleeveTopGeo.dispose();

    // C. Upper solid section / riser body (y = 0.160 to y = 0.440, height = 0.280m)
    const upperH = 0.280;
    const upperColGeo = new THREE.BoxGeometry(0.056, upperH, 0.032);
    upperColGeo.translate(0, 0.160 + upperH / 2, standZ);
    addVisual(visualBuckets.monitorStandSilver, upperColGeo, x, y, z, 0, rotY, 0);
    upperColGeo.dispose();

    // Rounded top cap of riser
    const topCapGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.056, 16);
    topCapGeo.rotateZ(Math.PI / 2);
    topCapGeo.translate(0, 0.440, standZ);
    addVisual(visualBuckets.monitorStandSilver, topCapGeo, x, y, z, 0, rotY, 0);
    topCapGeo.dispose();

    // D. Matte-black VESA Hinge Neck connecting column to monitor back
    const neckGeo = new THREE.BoxGeometry(0.042, 0.046, 0.038);
    neckGeo.translate(0, 0.02, monD / 2 + 0.024);
    addVisual(visualBuckets.monitorHousing, neckGeo, x, centerY, z, 0, rotY, 0);
    neckGeo.dispose();

    // -----------------------------------------------------------------------
    // 3. Monitor Casing & Rear Panel with High-Resolution Procedural Texture
    // -----------------------------------------------------------------------
    // Main casing box (collidable)
    const casingGeo = new THREE.BoxGeometry(monW, monH, monD);
    addPart(visualBuckets.monitorHousing, casingGeo, x, centerY, z, 0, rotY, 0, true);
    casingGeo.dispose();

    // High-Resolution Procedural Rear Texture Plane (facing +Z away from player)
    const rearPlaneGeo = createPlaneFacingRear(monW, monH);
    rearPlaneGeo.translate(0, 0, monD / 2 + 0.001);
    addVisual(visualBuckets.monitorBack, rearPlaneGeo, x, centerY, z, 0, rotY, 0);
    rearPlaneGeo.dispose();

    // 3D VESA mount square relief
    const vesaBlockGeo = new THREE.BoxGeometry(0.15, 0.15, 0.006);
    vesaBlockGeo.translate(0, 0.02, monD / 2 + 0.004);
    addVisual(visualBuckets.monitorHousing, vesaBlockGeo, x, centerY, z, 0, rotY, 0);
    vesaBlockGeo.dispose();

    // 3D Downward-facing I/O Port Overhang Lip
    const portLipGeo = new THREE.BoxGeometry(0.36, 0.010, 0.012);
    portLipGeo.translate(0, -0.09, monD / 2 + 0.006);
    addVisual(visualBuckets.monitorHousing, portLipGeo, x, centerY, z, 0, rotY, 0);
    portLipGeo.dispose();

    // 3D OSD Joystick nub (at lower-left of rear shell: +X in local space)
    const joyGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.006, 12);
    joyGeo.rotateX(Math.PI / 2);
    joyGeo.translate(-monW * 0.38, -monH * 0.38, monD / 2 + 0.004);
    addVisual(visualBuckets.monitorHousing, joyGeo, x, centerY, z, 0, rotY, 0);
    joyGeo.dispose();

    // 3D Power button ring
    const pBtnGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.003, 12);
    pBtnGeo.rotateX(Math.PI / 2);
    pBtnGeo.translate(-monW * 0.38 + 0.025, -monH * 0.38, monD / 2 + 0.003);
    addVisual(visualBuckets.monitorHousing, pBtnGeo, x, centerY, z, 0, rotY, 0);
    pBtnGeo.dispose();

    // -----------------------------------------------------------------------
    // 4. Ultra-Thin 3-Sided Front Micro-Bezel & Chin Bar
    // -----------------------------------------------------------------------
    const screenW = monW - 0.04;
    const screenH = monH - 0.04;

    // Top micro-bezel (~0.008m border)
    const topBezelGeo = new THREE.BoxGeometry(screenW + 0.016, 0.008, 0.006);
    topBezelGeo.translate(0, screenH / 2 + 0.004, -monD / 2 - 0.002);
    addVisual(visualBuckets.monitorHousing, topBezelGeo, x, centerY, z, 0, rotY, 0);
    topBezelGeo.dispose();

    // Left micro-bezel (~0.008m border)
    const leftBezelGeo = new THREE.BoxGeometry(0.008, screenH, 0.006);
    leftBezelGeo.translate(-screenW / 2 - 0.004, 0, -monD / 2 - 0.002);
    addVisual(visualBuckets.monitorHousing, leftBezelGeo, x, centerY, z, 0, rotY, 0);
    leftBezelGeo.dispose();

    // Right micro-bezel (~0.008m border)
    const rightBezelGeo = new THREE.BoxGeometry(0.008, screenH, 0.006);
    rightBezelGeo.translate(screenW / 2 + 0.004, 0, -monD / 2 - 0.002);
    addVisual(visualBuckets.monitorHousing, rightBezelGeo, x, centerY, z, 0, rotY, 0);
    rightBezelGeo.dispose();

    // Bottom chin bar (~0.016m tall)
    const chinGeo = new THREE.BoxGeometry(screenW + 0.016, 0.016, 0.008);
    chinGeo.translate(0, -screenH / 2 - 0.008, -monD / 2 - 0.001);
    addVisual(visualBuckets.monitorHousing, chinGeo, x, centerY, z, 0, rotY, 0);
    chinGeo.dispose();

    // Tiny ice-blue power LED pinpoint near bottom-right corner of chin
    const ledGeo = new THREE.BoxGeometry(0.0025, 0.0025, 0.002);
    ledGeo.translate(screenW / 2 - 0.025, -screenH / 2 - 0.008, -monD / 2 - 0.0055);
    addVisual(visualBuckets.sffIceBlueLed, ledGeo, x, centerY, z, 0, rotY, 0);
    ledGeo.dispose();

    // -----------------------------------------------------------------------
    // 5. Destructible Independent Front Screen Plane (Positioned on -Z side)
    // Kept at exact original dimensions, coordinates, and existing textures!
    // Un-merged so each monitor shatters independently when shot.
    // -----------------------------------------------------------------------
    let targetMaterial = this.screenAMaterial;
    let uMin = 0.0, uMax = 1.0, vMin = 0.0, vMax = 1.0;

    if (screenType === 'bsod' || screenType === 2) {
      targetMaterial = this.monitorScreenMaterial;
      uMin = 0.0; uMax = 0.5; vMin = 0.0; vMax = 0.5; // Classic BSOD in existing atlas (untouched)
    } else if (screenType === 'screenA' || screenType === 'A' || screenType === 0) {
      targetMaterial = this.screenAMaterial;
    } else if (screenType === 'screenB' || screenType === 'B' || screenType === 1) {
      targetMaterial = this.screenBMaterial;
    } else if (screenType === 'screenC' || screenType === 'C' || screenType === 3) {
      targetMaterial = this.screenCMaterial;
    } else if (screenType === 'screenD' || screenType === 'D' || screenType === 4) {
      targetMaterial = this.screenDMaterial;
    } else if (screenType === 'screenE' || screenType === 'E' || screenType === 5) {
      targetMaterial = this.screenEMaterial;
    } else if (screenType === 'screenF' || screenType === 'F' || screenType === 6) {
      targetMaterial = this.screenFMaterial;
    }

    // Assign broken material variant (alternating 1 and 2 for distinct cracks on dual setups)
    const brokenMat = (this.monitorScreens.length % 2 === 0) ? this.brokenScreenMaterial1 : this.brokenScreenMaterial2;

    const intactGeo = createPlaneFacingPlayer(screenW, screenH, uMin, vMin, uMax, vMax);
    const brokenGeo = (screenType === 'bsod' || screenType === 2)
      ? createPlaneFacingPlayer(screenW, screenH, 0.0, 0.0, 1.0, 1.0)
      : intactGeo;

    const screenMesh = new THREE.Mesh(intactGeo, targetMaterial);
    screenMesh.name = `DC_MonitorScreen_${screenType}_${this.monitorScreens.length}`;

    // Exact world position: offset by -monD/2 - 0.004 along local -Z, rotated by rotY
    const screenOffset = new THREE.Vector3(0, 0, -monD / 2 - 0.004);
    screenOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    screenMesh.position.set(x + screenOffset.x, centerY, z + screenOffset.z);
    screenMesh.rotation.y = rotY;

    screenMesh.userData.isMonitorScreen = true;
    screenMesh.userData.isBroken = false;
    screenMesh.userData.intactMaterial = targetMaterial;
    screenMesh.userData.brokenMaterial = brokenMat;
    screenMesh.userData.intactGeometry = intactGeo;
    screenMesh.userData.brokenGeometry = brokenGeo;
    screenMesh.userData.screenType = screenType;

    this.scene.add(screenMesh);
    this.monitorScreens.push(screenMesh);
  }

  /**
   * Builds an Ergonomic Mesh-Back Swivel Office Chair (+35% Hero Scale to fit 0.95m desks).
   * Total height: 1.28m, seat height: 0.60m, armrests: 0.82m.
   * Single extruded backrest frame with inner window cutout, beveled seat cushion,
   * sleek T-armrests, rear lumbar support (+Z only), and see-through breathable mesh.
   */
  _buildOfficeChair(addPart, addVisual, visualBuckets, cx, cy, cz, yaw = 0, addPartMatrix = null) {
    const chairHeading = yaw + Math.PI; // Face desk (+Z world) when yaw = 0
    const chairPos = new THREE.Vector3(cx, cy, cz);
    const chairQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, chairHeading, 0));
    const chairScale = new THREE.Vector3(1, 1, 1);
    const chairMatrix = new THREE.Matrix4().compose(chairPos, chairQuat, chairScale);

    // Helper: transform a local part into world space via chairMatrix
    const applyLocalPart = (bucket, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0, collidable = true) => {
      const localMat = new THREE.Matrix4().compose(
        new THREE.Vector3(lx, ly, lz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        chairScale
      );
      const worldMat = chairMatrix.clone().multiply(localMat);
      if (addPartMatrix) {
        addPartMatrix(bucket, geo, worldMat, collidable);
      } else {
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        worldMat.decompose(p, q, s);
        const e = new THREE.Euler().setFromQuaternion(q);
        addPart(bucket, geo, p.x, p.y, p.z, e.x, e.y, e.z, collidable);
      }
    };

    // 1. 5-Star Wheeled Base (Radius 0.42m) & Chunky Dual-Wheel Casters (Radius 0.048m)
    const hubGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.06, 12);
    applyLocalPart(visualBuckets.chairFrame, hubGeo, 0, 0.10, 0);
    hubGeo.dispose();

    const legLength = 0.38;
    const legGeo = new THREE.BoxGeometry(0.045, 0.035, legLength);
    legGeo.translate(0, 0, legLength / 2); // pivot at center hub

    const wheelGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.045, 12);
    wheelGeo.rotateZ(Math.PI / 2); // horizontal rolling axis

    const casterStemGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.045, 8);

    const baseRadius = 0.40;
    for (let i = 0; i < 5; i++) {
      const legAngle = i * (Math.PI * 2 / 5);
      // Radiating 5-star leg
      applyLocalPart(visualBuckets.chairFrame, legGeo, 0, 0.09, 0, 0, legAngle, 0);

      // Chunky dual-wheel caster touching floor at Y = 0.048m
      const tipX = Math.sin(legAngle) * baseRadius;
      const tipZ = Math.cos(legAngle) * baseRadius;
      applyLocalPart(visualBuckets.chairFrame, wheelGeo, tipX, 0.048, tipZ, 0, legAngle, 0);
      applyLocalPart(visualBuckets.chairFrame, casterStemGeo, tipX, 0.075, tipZ, 0, legAngle, 0);
    }
    legGeo.dispose();
    wheelGeo.dispose();
    casterStemGeo.dispose();

    // 2. Heavy-Duty Pneumatic Cylinder (Gas lift: radius 0.038m, rising to Y = 0.54m)
    const collarGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.20, 12);
    applyLocalPart(visualBuckets.chairFrame, collarGeo, 0, 0.22, 0);
    collarGeo.dispose();

    const pistonGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.32, 12);
    applyLocalPart(visualBuckets.chairFrame, pistonGeo, 0, 0.42, 0);
    pistonGeo.dispose();

    // 3. Under-Seat Tilt Mechanism Chassis & Tension Knob
    const tiltGeo = new THREE.BoxGeometry(0.30, 0.055, 0.28);
    applyLocalPart(visualBuckets.chairFrame, tiltGeo, 0, 0.545, -0.02);
    tiltGeo.dispose();

    const knobGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.05, 10);
    applyLocalPart(visualBuckets.chairFrame, knobGeo, 0, 0.50, -0.08);
    knobGeo.dispose();

    // 4. Contoured Seat Cushion (Beveled ExtrudeGeometry, Width 0.64m, Depth 0.60m, Top Y = 0.60m)
    const seatGeo = createSeatCushionGeometry();
    applyLocalPart(visualBuckets.chairFrame, seatGeo, 0, 0.60, -0.02, 0, 0, 0, true);
    seatGeo.dispose();

    // 5. Sleek Curved T-Armrests (Stems from seat underside to Y = 0.82m pads)
    const armStemGeo = new THREE.BoxGeometry(0.038, 0.275, 0.05);
    const armBracketGeo = new THREE.BoxGeometry(0.12, 0.03, 0.05);

    // Left Armrest (X = -0.34m)
    applyLocalPart(visualBuckets.chairFrame, armBracketGeo, -0.28, 0.535, -0.02);
    applyLocalPart(visualBuckets.chairFrame, armStemGeo, -0.34, 0.66, -0.02);
    // Right Armrest (X = +0.34m)
    applyLocalPart(visualBuckets.chairFrame, armBracketGeo, 0.28, 0.535, -0.02);
    applyLocalPart(visualBuckets.chairFrame, armStemGeo, 0.34, 0.66, -0.02);

    armStemGeo.dispose();
    armBracketGeo.dispose();

    // Beveled Forearm Pads (Width 0.095m, Length 0.30m, Top Y = 0.82m)
    const padGeoLeft = createArmPadGeometry();
    applyLocalPart(visualBuckets.chairFrame, padGeoLeft, -0.34, 0.82, -0.02);
    padGeoLeft.dispose();

    const padGeoRight = createArmPadGeometry();
    applyLocalPart(visualBuckets.chairFrame, padGeoRight, 0.34, 0.82, -0.02);
    padGeoRight.dispose();

    // 6. Sculpted Backrest Assembly (Pivoted at Y = 0.60m, Z = +0.26m with -10° Backward Recline)
    // Shared backrest matrix ensures 100% mathematical alignment: frame, mesh, and rear lumbar NEVER glitch!
    const backrestPivotPos = new THREE.Vector3(0, 0.60, 0.26);
    const backrestTiltQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1745, 0, 0)); // 10° backward recline away from seat
    const backrestPivotMat = new THREE.Matrix4().compose(backrestPivotPos, backrestTiltQuat, chairScale);
    const backrestWorldMat = chairMatrix.clone().multiply(backrestPivotMat);

    const applyBackrestPart = (bucket, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0, collidable = true) => {
      const localPartMat = new THREE.Matrix4().compose(
        new THREE.Vector3(lx, ly, lz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        chairScale
      );
      const worldMat = backrestWorldMat.clone().multiply(localPartMat);
      if (addPartMatrix) {
        addPartMatrix(bucket, geo, worldMat, collidable);
      } else {
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        worldMat.decompose(p, q, s);
        const e = new THREE.Euler().setFromQuaternion(q);
        addPart(bucket, geo, p.x, p.y, p.z, e.x, e.y, e.z, collidable);
      }
    };

    // A. Outer Frame: Single continuous 2D Shape with inner hole cutout (ExtrudeGeometry with bevels)
    // Base width 0.50m, shoulder width 0.60m, arched top reaches Y = 0.68m (total chair height = 1.28m!)
    const frameGeo = createBackrestFrameGeometry();
    applyBackrestPart(visualBuckets.chairFrame, frameGeo, 0, 0, 0, 0, 0, 0, true);
    frameGeo.dispose();

    // B. Breathable See-Through Mesh Backrest (AlphaTest: 0.35, centered inside frame opening)
    const meshPlaneGeo = new THREE.PlaneGeometry(0.48, 0.58);
    applyBackrestPart(visualBuckets.chairMesh, meshPlaneGeo, 0, 0.34, 0, 0, 0, 0, false);
    meshPlaneGeo.dispose();

    // C. Ergonomic Curved Lumbar Support Bar (STRICTLY on REAR +Z face: flush at Z = +0.038m)
    const lumbarGeo = new THREE.BoxGeometry(0.48, 0.075, 0.022);
    applyBackrestPart(visualBuckets.chairFrame, lumbarGeo, 0, 0.22, 0.038, 0, 0, 0, true);
    lumbarGeo.dispose();

    // D. Central Spine Connector (STRICTLY on REAR +Z face: flush at Z = +0.040m)
    const spineGeo = new THREE.BoxGeometry(0.065, 0.30, 0.025);
    applyBackrestPart(visualBuckets.chairFrame, spineGeo, 0, 0.18, 0.040, 0, 0, 0, true);
    spineGeo.dispose();

    // E. Sleek Under-Seat Rear Spine Bracket (Connects tilt mechanism to backrest pivot without ugly blocks)
    const spineBaseGeo = new THREE.BoxGeometry(0.065, 0.045, 0.20);
    spineBaseGeo.rotateX(-0.25);
    applyLocalPart(visualBuckets.chairFrame, spineBaseGeo, 0, 0.56, 0.16, 0, 0, 0, true);
    spineBaseGeo.dispose();
  }

  createOfficeChairGeometry(addPart, addVisual, visualBuckets, cx, cy, cz, yaw = 0, addPartMatrix = null) {
    return this._buildOfficeChair(addPart, addVisual, visualBuckets, cx, cy, cz, yaw, addPartMatrix);
  }

  /**
   * Builds the Enterprise Breakroom Coffee Station (+40% Hero Scale) along the right lounge wall.
   * - Dark walnut executive breakroom cabinet with brushed chrome D-handles and dark granite countertop (Y = 1.17m)
   * - Hero-scaled commercial coffee machine with bean-to-cup hopper reaching Y = 2.29m (eye level)
   * - Recessed dispensing niche with dual spouts and cup-centering bracket
   * - Angled touchscreen fascia assembly (Y = 1.58m to 2.08m) sitting proud with ZERO clipping into chassis
   * - Paper cup stacks, placed espresso cup, and fully registered BVH colliders.
   */
  _buildCoffeeStation(addVisual, registerCollider, visualBuckets, posX = 9.55, posY = 0.0, posZ = -6.8) {
    const coffeePos = new THREE.Vector3(posX, posY, posZ);
    const coffeeQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
    const coffeeScale = new THREE.Vector3(1, 1, 1);
    const coffeeMatrix = new THREE.Matrix4().compose(coffeePos, coffeeQuat, coffeeScale);

    const applyCoffeePart = (bucket, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0) => {
      const localMat = new THREE.Matrix4().compose(
        new THREE.Vector3(lx, ly, lz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(1, 1, 1)
      );
      const worldMat = coffeeMatrix.clone().multiply(localMat);
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(worldMat);
      bucket.push(g);
    };

    // 1. BREAKROOM CABINET (+40% Hero Scale: width 1.66m along Z, depth 0.90m along X, height 1.17m)
    // Recessed dark toe-kick plinth (Y = 0.0 to 0.10m)
    const plinthGeo = new THREE.BoxGeometry(1.54, 0.10, 0.80);
    applyCoffeePart(visualBuckets.coffeeMachine, plinthGeo, 0, 0.05, -0.02);
    plinthGeo.dispose();

    // Main walnut carcass box (Y = 0.10 to 1.12m)
    const carcassGeo = new THREE.BoxGeometry(1.60, 1.02, 0.84);
    applyCoffeePart(visualBuckets.coffeeCabinet, carcassGeo, 0, 0.61, -0.01);
    carcassGeo.dispose();

    // Walnut cabinet doors (front face at local +Z = +0.422m)
    const doorW = 0.77;
    const doorH = 0.98;
    const doorGeo = new THREE.BoxGeometry(doorW, doorH, 0.024);
    applyCoffeePart(visualBuckets.coffeeCabinet, doorGeo, -0.395, 0.61, 0.422);
    applyCoffeePart(visualBuckets.coffeeCabinet, doorGeo, 0.395, 0.61, 0.422);
    doorGeo.dispose();

    // Center seam shadow
    const seamGeo = new THREE.BoxGeometry(0.01, doorH, 0.026);
    applyCoffeePart(visualBuckets.coffeeMachine, seamGeo, 0, 0.61, 0.422);
    seamGeo.dispose();

    // Curved brushed-chrome D-handles on doors (Y = 0.80m)
    const handleBarGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.22, 12);
    const handlePostGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.035, 8);
    handlePostGeo.rotateX(Math.PI / 2);

    applyCoffeePart(visualBuckets.coffeeSilver, handleBarGeo, -0.065, 0.80, 0.465);
    applyCoffeePart(visualBuckets.coffeeSilver, handlePostGeo, -0.065, 0.89, 0.445);
    applyCoffeePart(visualBuckets.coffeeSilver, handlePostGeo, -0.065, 0.71, 0.445);

    applyCoffeePart(visualBuckets.coffeeSilver, handleBarGeo, 0.065, 0.80, 0.465);
    applyCoffeePart(visualBuckets.coffeeSilver, handlePostGeo, 0.065, 0.89, 0.445);
    applyCoffeePart(visualBuckets.coffeeSilver, handlePostGeo, 0.065, 0.71, 0.445);

    handleBarGeo.dispose();
    handlePostGeo.dispose();

    // Glossy black granite/slate countertop overhang (Y = 1.12m to 1.17m)
    const topGeo = new THREE.BoxGeometry(1.66, 0.05, 0.90);
    applyCoffeePart(visualBuckets.coffeeCountertop, topGeo, 0, 1.145, 0.01);
    topGeo.dispose();

    // 2. COFFEE MACHINE BODY (+40% Hero Scale: Y = 1.17m to 2.29m)
    // Shifted slightly to local +X (+0.22m) to leave ample room for cup stacks on left (local -X)
    const mx = 0.22;
    const mz = 0.0;

    // A. SOLID CONTINUOUS SIDE FLANKS (Extruded monolithic architectural side walls)
    // Runs from back (z = -0.34) to front (z = +0.28) and bottom (y = 0.0) to top (y = 0.91m).
    // Slopes backward at exactly 12° from (z = +0.28, y = 0.41) to (z = +0.174, y = 0.91m).
    // Eliminates all pointed fins, corners, floating blocks, and open air pockets!
    const sideShape = new THREE.Shape();
    sideShape.moveTo(0.34, 0.0);      // Bottom-back (z = -0.34, y = 0.0)
    sideShape.lineTo(-0.28, 0.0);     // Bottom-front (z = +0.28, y = 0.0)
    sideShape.lineTo(-0.28, 0.41);    // Niche front corner (z = +0.28, y = 0.41)
    sideShape.lineTo(-0.174, 0.91);   // Top-front corner of fascia slant (z = +0.174, y = 0.91)
    sideShape.lineTo(0.34, 0.91);     // Top-back (z = -0.34, y = 0.91)
    sideShape.closePath();

    const sidePanelGeo = new THREE.ExtrudeGeometry(sideShape, {
      depth: 0.02,
      bevelEnabled: false
    });
    sidePanelGeo.rotateY(Math.PI / 2);

    // Left Side Flank (x: mx - 0.275 to mx - 0.255)
    applyCoffeePart(visualBuckets.coffeeMachine, sidePanelGeo, mx - 0.275, 1.17, 0);
    // Right Side Flank (x: mx + 0.255 to mx + 0.275)
    applyCoffeePart(visualBuckets.coffeeMachine, sidePanelGeo, mx + 0.255, 1.17, 0);
    sidePanelGeo.dispose();

    // Side Panels with "COFFEE" artwork: custom 5-point polygon geometry matching the exact 12° slope
    // (ZERO rectangular fins sticking forward at the top!)
    const sideArtLeft = createCoffeeSidePanelGeometry(false);
    applyCoffeePart(visualBuckets.coffeeSide, sideArtLeft, mx - 0.276, 1.17, 0);
    sideArtLeft.dispose();

    const sideArtRight = createCoffeeSidePanelGeometry(true);
    applyCoffeePart(visualBuckets.coffeeSide, sideArtRight, mx + 0.276, 1.17, 0);
    sideArtRight.dispose();

    // B. CENTRAL HOUSING ENCLOSURE (Between Left and Right Flanks: width 0.55m)
    // Solid Back Wall (Counter to roof: Y = 1.17 to 2.08m)
    const backWallGeo = new THREE.BoxGeometry(0.55, 0.91, 0.04);
    applyCoffeePart(visualBuckets.coffeeMachine, backWallGeo, mx, 1.625, mz - 0.32);
    backWallGeo.dispose();

    // Solid Top Roof Panel: runs from z = -0.34 to z = +0.15m (stops cleanly 2.4cm BEHIND fascia top edge at z = +0.174m!)
    const roofGeo = new THREE.BoxGeometry(0.55, 0.03, 0.49);
    applyCoffeePart(visualBuckets.coffeeMachine, roofGeo, mx, 2.065, mz - 0.095);
    roofGeo.dispose();

    // Solid Bottom Base Panel (Counter level: Y = 1.19m)
    const floorGeo = new THREE.BoxGeometry(0.55, 0.04, 0.62);
    applyCoffeePart(visualBuckets.coffeeMachine, floorGeo, mx, 1.19, mz - 0.03);
    floorGeo.dispose();

    // C. RECESSED DISPENSING NICHE (Lower Section, Y = 1.23 to 1.58m)
    // Slotted stainless drip tray grate
    const trayGrate = new THREE.BoxGeometry(0.51, 0.008, 0.20);
    applyCoffeePart(visualBuckets.coffeeSilver, trayGrate, mx, 1.234, mz + 0.18);
    trayGrate.dispose();

    // Brushed Silver Niche Rear Wall (Drops from Y = 1.58m down to 1.23m at z = +0.08m)
    const nicheBack = new THREE.BoxGeometry(0.51, 0.35, 0.02);
    applyCoffeePart(visualBuckets.coffeeSilver, nicheBack, mx, 1.405, mz + 0.08);
    nicheBack.dispose();

    // Brushed Silver Niche Ceiling (Horizontal roof at Y = 1.57m from z = +0.08m to +0.28m)
    const nicheCeil = new THREE.BoxGeometry(0.51, 0.02, 0.20);
    applyCoffeePart(visualBuckets.coffeeSilver, nicheCeil, mx, 1.57, mz + 0.18);
    nicheCeil.dispose();

    // Dual Chrome Espresso Spouts & Cup Guide (Positioned at z = mz + 0.18m)
    const spoutBlock = new THREE.BoxGeometry(0.12, 0.035, 0.07);
    applyCoffeePart(visualBuckets.coffeeMachine, spoutBlock, mx, 1.55, mz + 0.18);
    spoutBlock.dispose();

    const nozzleGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.035, 8);
    applyCoffeePart(visualBuckets.coffeeSilver, nozzleGeo, mx - 0.025, 1.515, mz + 0.18);
    applyCoffeePart(visualBuckets.coffeeSilver, nozzleGeo, mx + 0.025, 1.515, mz + 0.18);
    nozzleGeo.dispose();

    const bracketGeo = new THREE.TorusGeometry(0.048, 0.004, 6, 12, Math.PI);
    applyCoffeePart(visualBuckets.coffeeSilver, bracketGeo, mx, 1.38, mz + 0.18, Math.PI / 2, 0, 0);
    bracketGeo.dispose();

    // D. ANGLED TOUCHSCREEN FASCIA ASSEMBLY (Upper Front, Y = 1.58 to 2.08m, Tilted -12° / -0.2094 rad)
    // Spans the FULL 0.55m machine width across the front with ZERO side-wall fins or cheeks sticking out!
    const tiltAng = -0.20944; // -12° tilt matching sideShape slope exactly!

    // Door housing backing structure
    const fasciaHousingGeo = new THREE.BoxGeometry(0.548, 0.51, 0.024);
    applyCoffeePart(visualBuckets.coffeeMachine, fasciaHousingGeo, mx, 1.83, mz + 0.216, tiltAng, 0, 0);
    fasciaHousingGeo.dispose();

    // Single unified Touchscreen Display Plane with BAKED-IN 18px brushed silver frame bezel!
    // (NO separate bezelGeo mesh: 100% mathematically immune to Z-fighting, clipping, or popping!)
    const screenGeo = new THREE.PlaneGeometry(0.55, 0.511);
    applyCoffeePart(visualBuckets.coffeeScreen, screenGeo, mx, 1.83, mz + 0.229, tiltAng, 0, 0);
    screenGeo.dispose();

    // Curved Silver Bottom Lip with Red Accent Slash across the lower door border
    const lipGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.55, 16);
    lipGeo.rotateZ(Math.PI / 2);
    applyCoffeePart(visualBuckets.coffeeSilver, lipGeo, mx, 1.58, mz + 0.285);
    lipGeo.dispose();

    const slashGeo = new THREE.BoxGeometry(0.018, 0.032, 0.015);
    applyCoffeePart(visualBuckets.coffeeRedSlash, slashGeo, mx, 1.58, mz + 0.301);
    slashGeo.dispose();

    // E. TOP SMOKED-ACRYLIC BEAN HOPPER & BANNER (Y = 2.08 to 2.28m)
    // Sits securely recessed on top of the solid roof behind the front fascia
    const hopperGeo = new THREE.BoxGeometry(0.48, 0.18, 0.36);
    applyCoffeePart(visualBuckets.coffeeHopper, hopperGeo, mx, 2.17, mz - 0.08);
    hopperGeo.dispose();

    const lidGeo = new THREE.BoxGeometry(0.50, 0.025, 0.38);
    applyCoffeePart(visualBuckets.coffeeMachine, lidGeo, mx, 2.27, mz - 0.08);
    lidGeo.dispose();

    // 7. PAPER CUPS (+40% Hero Scale)
    // Stack 1 (8 cups) on countertop to left of machine
    const cupStack1X = mx - 0.46;
    const cupStack1Z = mz + 0.08;
    const cupBaseGeo = new THREE.CylinderGeometry(0.048, 0.036, 0.12, 16);
    applyCoffeePart(visualBuckets.coffeeCups, cupBaseGeo, cupStack1X, 1.17 + 0.06, cupStack1Z);

    const rimGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.007, 16);
    for (let k = 0; k < 7; k++) {
      applyCoffeePart(visualBuckets.coffeeCups, rimGeo, cupStack1X, 1.17 + 0.12 + k * 0.018, cupStack1Z);
    }

    // Stack 2 (6 cups) behind Stack 1
    const cupStack2X = mx - 0.62;
    const cupStack2Z = mz - 0.08;
    applyCoffeePart(visualBuckets.coffeeCups, cupBaseGeo, cupStack2X, 1.17 + 0.06, cupStack2Z);
    for (let k = 0; k < 5; k++) {
      applyCoffeePart(visualBuckets.coffeeCups, rimGeo, cupStack2X, 1.17 + 0.12 + k * 0.018, cupStack2Z);
    }
    cupBaseGeo.dispose();
    rimGeo.dispose();

    // Single white paper cup placed on drip tray under espresso spout (z = mz + 0.18m!)
    // Completely unclipped, perfectly centered in the niche directly under the dual nozzles!
    const placedCupGeo = new THREE.CylinderGeometry(0.046, 0.034, 0.11, 16);
    applyCoffeePart(visualBuckets.coffeeCups, placedCupGeo, mx, 1.234 + 0.055, mz + 0.18);
    placedCupGeo.dispose();

    const placedRimGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.006, 16);
    applyCoffeePart(visualBuckets.coffeeCups, placedRimGeo, mx, 1.234 + 0.11, mz + 0.18);
    placedRimGeo.dispose();

    // 8. COLLIDERS (Registered into BVH for physics and bullet hitscan!)
    const counterCollider = new THREE.BoxGeometry(1.66, 1.17, 0.90);
    registerCollider(counterCollider, posX, 0.585, posZ, 0, -Math.PI / 2, 0);
    counterCollider.dispose();

    const machineCollider = new THREE.BoxGeometry(0.58, 1.12, 0.68);
    registerCollider(machineCollider, posX - 0.01, 1.17 + 0.56, posZ + mx, 0, -Math.PI / 2, 0);
    machineCollider.dispose();
  }

  /**
   * Builds the lush Potted Areca Palm Plant (Palmeira Areca) in the back-right corner (+40% Hero Scale).
   * White tapered ceramic pot (Y = 0.0 to 0.60m) with rim collar and dark soil disc,
   * 16 clustered golden-green cane stems with node rings,
   * and 24 arching 3D feathered palm fronds across 3 natural tiers reaching Y ~ 2.45m!
   */
  _buildArecaPalm(addVisual, registerCollider, visualBuckets, px = 9.2, py = 0.0, pz = -8.8) {
    // 1. Tapered White Ceramic Planter Pot (Y = 0.0 to 0.60m)
    const potGeo = new THREE.CylinderGeometry(0.34, 0.26, 0.60, 24, 1, false);
    addVisual(visualBuckets.palmPot, potGeo, px, 0.30, pz);
    potGeo.dispose();

    // Stepped Top Rim Collar (radius 0.36m, height 0.06m)
    const collarGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.06, 24, 1, false);
    addVisual(visualBuckets.palmPot, collarGeo, px, 0.57, pz);
    collarGeo.dispose();

    // Dark Potting Soil Disc (Y = 0.56m)
    const soilGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.02, 24);
    addVisual(visualBuckets.palmSoil, soilGeo, px, 0.56, pz);
    soilGeo.dispose();

    // 2. Clustered Golden-Green Cane Stems (16 stems)
    const stemRingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.008, 8);
    for (let i = 0; i < 16; i++) {
      const az = (i / 16) * Math.PI * 2 + 0.08 * Math.sin(i * 1.5);
      const r0 = 0.045 + 0.045 * ((i % 3) / 2);
      const r1 = 0.16 + 0.12 * (((i * 5) % 4) / 3);
      const hStem = 0.85 + 0.35 * (((i * 7) % 10) / 10);

      const stemGeo = new THREE.CylinderGeometry(0.008, 0.015, hStem, 8);
      const midR = (r0 + r1) / 2;
      const stemX = px + midR * Math.cos(az);
      const stemZ = pz + midR * Math.sin(az);
      const stemY = 0.56 + hStem / 2;

      const tilt = 0.14;
      const rotX = Math.sin(az) * tilt;
      const rotZ = -Math.cos(az) * tilt;

      addVisual(visualBuckets.palmStems, stemGeo, stemX, stemY, stemZ, rotX, 0, rotZ);
      stemGeo.dispose();

      // Bamboo node rings
      addVisual(visualBuckets.palmStems, stemRingGeo, stemX, stemY - hStem * 0.25, stemZ, rotX, 0, rotZ);
      addVisual(visualBuckets.palmStems, stemRingGeo, stemX, stemY + hStem * 0.25, stemZ, rotX, 0, rotZ);
    }
    stemRingGeo.dispose();

    // 3. Arching 3D Feathered Palm Fronds (24 fronds across 3 natural tiers, reaching Y ~ 2.45m)
    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3(1, 1, 1);
    const _m = new THREE.Matrix4();
    const _e = new THREE.Euler();

    // Tier 1: Lower Drooping Fronds (8 fronds, droop low and spread wide)
    for (let j = 0; j < 8; j++) {
      const az = (j / 8) * Math.PI * 2 + 0.15;
      const len = 1.35 + 0.08 * (j % 3);
      const w = 0.48;
      const archRise = 0.25;
      const droop = 0.65;
      const elev = -0.22;

      const startR = 0.24;
      const fx = px + startR * Math.cos(az);
      const fy = 0.92 + 0.05 * (j % 3);
      const fz = pz + startR * Math.sin(az);

      const fGeo = createCurvedPalmFrondGeometry(len, w, archRise, droop, 0.026);
      _p.set(fx, fy, fz);
      _e.set(-elev, -az, 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      fGeo.applyMatrix4(_m);
      visualBuckets.palmFronds.push(fGeo);
    }

    // Tier 2: Mid Spreading Fronds (9 fronds, elegant balanced arc)
    for (let j = 0; j < 9; j++) {
      const az = (j / 9) * Math.PI * 2 + 0.42;
      const len = 1.55 + 0.10 * (j % 3);
      const w = 0.50;
      const archRise = 0.36;
      const droop = 0.48;
      const elev = 0.48;

      const startR = 0.18;
      const fx = px + startR * Math.cos(az);
      const fy = 1.20 + 0.06 * (j % 3);
      const fz = pz + startR * Math.sin(az);

      const fGeo = createCurvedPalmFrondGeometry(len, w, archRise, droop, 0.030);
      _p.set(fx, fy, fz);
      _e.set(-elev, -az, 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      fGeo.applyMatrix4(_m);
      visualBuckets.palmFronds.push(fGeo);
    }

    // Tier 3: Tall Upright Center Fronds (7 fronds, reaching Y ~ 2.45m!)
    for (let j = 0; j < 7; j++) {
      const az = (j / 7) * Math.PI * 2 + 0.08;
      const len = 1.70 + 0.12 * (j % 3);
      const w = 0.48;
      const archRise = 0.45;
      const droop = 0.34;
      const elev = 1.02;

      const startR = 0.11;
      const fx = px + startR * Math.cos(az);
      const fy = 1.45 + 0.08 * (j % 3);
      const fz = pz + startR * Math.sin(az);

      const fGeo = createCurvedPalmFrondGeometry(len, w, archRise, droop, 0.032);
      _p.set(fx, fy, fz);
      _e.set(-elev, -az, 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      fGeo.applyMatrix4(_m);
      visualBuckets.palmFronds.push(fGeo);
    }

    // 4. Planter Pot Physics & Hitscan Collider
    const potCollider = new THREE.CylinderGeometry(0.36, 0.36, 0.60, 12);
    registerCollider(potCollider, px, 0.30, pz);
    potCollider.dispose();
  }

  /**
   * Builds an individual Enterprise Split AC Unit (LG Artcool Mirror Style - +40% FPS Hero Scale).
   * Exact Footprint: 1.512m wide (along Z) x 0.490m tall (along Y) x 0.308m deep (along X).
   * Mounted flush against wall at X = 10.0m near ceiling (y = 3.42m).
   * Facing into the room (-X).
   */
  _buildSplitAC(addVisual, registerCollider, visualBuckets, x, y, z) {
    const w = 1.512; // Width along Z (+40%: 1.08 * 1.4)
    const h = 0.490; // Height along Y (+40%: 0.35 * 1.4)
    const d = 0.308; // Depth along X (+40%: 0.22 * 1.4)
    const endcapThick = 0.018;
    const wInner = w - 2 * endcapThick; // 1.476m

    // 1. Sculpted Aerodynamic Side Endcaps (Custom 2D Profile THREE.Shape + ExtrudeGeometry)
    // Authentic LG Artcool side profile: rounded top crown, expansive front mirror arc (76% height),
    // recessed discharge throat, and 38° swept-back underbelly to flush rear wall
    const endcapShape = new THREE.Shape();
    endcapShape.moveTo(0.154, 0.245); // Flush against rear wall
    endcapShape.lineTo(-0.100, 0.245); // Top crown start
    endcapShape.quadraticCurveTo(-0.136, 0.245, -0.136, 0.225); // Rounded top crown
    endcapShape.quadraticCurveTo(-0.158, 0.050, -0.136, -0.145); // Expansive convex front mirror arc
    endcapShape.lineTo(-0.075, -0.145); // Louver throat upper ledge
    endcapShape.lineTo(-0.075, -0.195); // Louver throat cavity depth
    endcapShape.quadraticCurveTo(0.030, -0.235, 0.154, -0.245); // Swept-back underbelly to rear wall
    endcapShape.lineTo(0.154, 0.245); // Rear wall vertical closure

    const endcapGeo = new THREE.ExtrudeGeometry(endcapShape, { depth: endcapThick, bevelEnabled: false });
    // Left endcap at Z = z - w/2
    addVisual(visualBuckets.splitAcBody, endcapGeo, x, y, z - w / 2);
    // Right endcap at Z = z + w/2 - endcapThick
    addVisual(visualBuckets.splitAcBody, endcapGeo, x, y, z + w / 2 - endcapThick);
    endcapGeo.dispose();

    // 2. Signature Brushed Chrome/Silver Side Accent Strip (~0.012m wide) along parting contour
    const arcShape = new THREE.Shape();
    arcShape.moveTo(-0.136, 0.225);
    arcShape.quadraticCurveTo(-0.158, 0.050, -0.136, -0.145);
    arcShape.lineTo(-0.124, -0.145);
    arcShape.quadraticCurveTo(-0.146, 0.050, -0.124, 0.225);
    arcShape.closePath();

    const arcGeo = new THREE.ExtrudeGeometry(arcShape, { depth: 0.003, bevelEnabled: false });
    addVisual(visualBuckets.silverTrim, arcGeo, x, y, z - w / 2 - 0.001);
    addVisual(visualBuckets.silverTrim, arcGeo, x, y, z + w / 2 - 0.002);
    arcGeo.dispose();

    // Recessed side mold seam line groove right behind the metallic arc
    const seamShape = new THREE.Shape();
    seamShape.moveTo(-0.123, 0.225);
    seamShape.quadraticCurveTo(-0.145, 0.050, -0.123, -0.145);
    seamShape.lineTo(-0.119, -0.145);
    seamShape.quadraticCurveTo(-0.141, 0.050, -0.119, 0.225);
    seamShape.closePath();

    const seamGeo = new THREE.ExtrudeGeometry(seamShape, { depth: 0.002, bevelEnabled: false });
    addVisual(visualBuckets.splitAcLouver, seamGeo, x, y, z - w / 2 - 0.001);
    addVisual(visualBuckets.splitAcLouver, seamGeo, x, y, z + w / 2 - 0.001);
    seamGeo.dispose();

    // 3. Main Upper Dark Matte Chassis Housing (visualBuckets.splitAcBody)
    const upperBodyGeo = new THREE.BoxGeometry(0.279, 0.380, wInner);
    addVisual(visualBuckets.splitAcBody, upperBodyGeo, x + 0.0145, y + 0.055, z);
    upperBodyGeo.dispose();

    // Top crown rounded bevel facet transitioning to front mirror glass
    const crownBevelGeo = new THREE.BoxGeometry(0.042, 0.028, wInner);
    crownBevelGeo.rotateZ(0.61);
    addVisual(visualBuckets.splitAcBody, crownBevelGeo, x - 0.116, y + 0.235, z);
    crownBevelGeo.dispose();

    // Recessed top air intake grille
    const intakeGeo = new THREE.BoxGeometry(0.220, 0.018, wInner - 0.040);
    addVisual(visualBuckets.splitAcLouver, intakeGeo, x + 0.030, y + 0.242, z);
    intakeGeo.dispose();

    // Top intake grille fine slats
    const slatGeo = new THREE.BoxGeometry(0.210, 0.006, 0.014);
    for (let si = -0.65; si <= 0.65; si += 0.10) {
      addVisual(visualBuckets.splitAcBody, slatGeo, x + 0.030, y + 0.248, z + si);
    }
    slatGeo.dispose();

    // 4. Swept-Back Aerodynamic Underbelly Cowl (visualBuckets.splitAcBody)
    // Tapers back toward wall at ~38° swept angle - completely eliminating blocky 90° bottom-front corner!
    const underbellyGeo = new THREE.BoxGeometry(0.235, 0.016, wInner);
    underbellyGeo.rotateZ(-0.215);
    addVisual(visualBuckets.splitAcBody, underbellyGeo, x + 0.0395, y - 0.220, z);
    underbellyGeo.dispose();

    // Aerodynamic rounded lower lip along discharge vent entrance
    const lowerLipGeo = new THREE.CylinderGeometry(0.010, 0.010, wInner, 8, 1, false, -Math.PI / 2, Math.PI);
    lowerLipGeo.rotateX(Math.PI / 2);
    addVisual(visualBuckets.splitAcBody, lowerLipGeo, x - 0.075, y - 0.195, z);
    lowerLipGeo.dispose();

    // Rear wall bottom closure seal
    const rearBottomGeo = new THREE.BoxGeometry(0.070, 0.030, wInner);
    addVisual(visualBuckets.splitAcBody, rearBottomGeo, x + 0.119, y - 0.235, z);
    rearBottomGeo.dispose();

    // 5. Deep Recessed Airflow Throat (visualBuckets.splitAcLouver)
    const throatGeo = new THREE.BoxGeometry(0.120, 0.050, wInner);
    addVisual(visualBuckets.splitAcLouver, throatGeo, x - 0.015, y - 0.170, z);
    throatGeo.dispose();

    // 6. Open Motorized Louver Blade & Satin Silver Leading Edge Highlight
    const bladeChord = 0.075;
    const bladeThick = 0.008;
    const bladeAngle = -0.49; // ~28° downward into room

    const bladeGeo = new THREE.BoxGeometry(bladeChord, bladeThick, wInner - 0.008);
    bladeGeo.rotateZ(bladeAngle);
    addVisual(visualBuckets.splitAcBody, bladeGeo, x - 0.070, y - 0.175, z);
    bladeGeo.dispose();

    // Satin silver leading edge highlight
    const bladeTipGeo = new THREE.BoxGeometry(0.008, 0.004, wInner - 0.008);
    bladeTipGeo.rotateZ(bladeAngle);
    const tipOffsetX = -Math.cos(0.49) * (bladeChord / 2);
    const tipOffsetY = -Math.sin(0.49) * (bladeChord / 2);
    addVisual(visualBuckets.silverTrim, bladeTipGeo, x - 0.070 + tipOffsetX, y - 0.175 + tipOffsetY, z);
    bladeTipGeo.dispose();

    // 7. 11 Vertical Directional Air-Guide Deflector Fins inside throat gap
    const finGeo = new THREE.BoxGeometry(0.055, 0.042, 0.005);
    const finCount = 11;
    const finSpan = 1.30;
    const finStep = finSpan / (finCount - 1);
    for (let fi = 0; fi < finCount; fi++) {
      const fz = -finSpan / 2 + fi * finStep;
      addVisual(visualBuckets.splitAcBody, finGeo, x - 0.015, y - 0.170, z + fz);
    }
    finGeo.dispose();

    // 8. Frameless Convex Curved Smoked-Mirror Front Glass Panel (visualBuckets.splitAcFront)
    // Edge-to-edge frameless front mirror with convex curve bowing slightly forward into room
    const frontH = 0.370; // 76% of total height for signature LG Artcool smoked mirror dominance
    const segY = 12;
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let j = 0; j <= segY; j++) {
      const v = j / segY;
      const yRel = -frontH / 2 + v * frontH;
      // Convex parabolic bow: apex at center (v ~ 0.5), bowing forward towards -X
      const xRel = -0.018 * Math.sin(v * Math.PI);

      // Left vertex (u = 0, Z = -w / 2)
      positions.push(xRel, yRel, -w / 2);
      uvs.push(0, v);

      // Right vertex (u = 1, Z = +w / 2)
      positions.push(xRel, yRel, w / 2);
      uvs.push(1, v);
    }

    for (let j = 0; j < segY; j++) {
      const bl = j * 2;
      const br = j * 2 + 1;
      const tl = (j + 1) * 2;
      const tr = (j + 1) * 2 + 1;

      // CCW winding facing -X into room
      indices.push(bl, br, tr);
      indices.push(bl, tr, tl);
    }

    const frontGeo = new THREE.BufferGeometry();
    frontGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    frontGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    frontGeo.setIndex(indices);
    frontGeo.computeVertexNormals();

    // Position centered at x - 0.136, y + 0.040, z (spans from y - 0.145 to y + 0.225)
    addVisual(visualBuckets.splitAcFront, frontGeo, x - 0.136, y + 0.040, z);
    frontGeo.dispose();

    // 9. Brushed Satin-Silver Horizontal Trim Bar along bottom edge of front glass panel
    const trimBarGeo = new THREE.BoxGeometry(0.008, 0.005, w + 0.002);
    addVisual(visualBuckets.silverTrim, trimBarGeo, x - 0.136, y - 0.145, z);
    trimBarGeo.dispose();

    // 10. Static BVH Environment Collider (Unchanged exact bounds)
    const colliderGeo = new THREE.BoxGeometry(d + 0.03, h + 0.03, w + 0.03);
    registerCollider(colliderGeo, x, y, z);
    colliderGeo.dispose();
  }
}

