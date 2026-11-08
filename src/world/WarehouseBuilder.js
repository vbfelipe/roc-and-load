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
 * Creates a BoxGeometry(w, h, d) with unseen faces culled by local normal key
 * ('+x', '-x', '+y', '-y', '+z', '-z').
 */
function createBoxWithoutFaces(w, h, d, excludeNormals = []) {
  const box = new THREE.BoxGeometry(w, h, d);
  // BoxGeometry face order: 0: +x, 1: -x, 2: +y, 3: -y, 4: +z, 5: -z
  const faceOrder = ['+x', '-x', '+y', '-y', '+z', '-z'];
  const excludeSet = new Set(excludeNormals);
  const srcIndex = box.getIndex().array;
  const keptIndices = [];
  for (let f = 0; f < 6; f++) {
    if (!excludeSet.has(faceOrder[f])) {
      const base = f * 6;
      for (let i = 0; i < 6; i++) {
        keptIndices.push(srcIndex[base + i]);
      }
    }
  }
  box.setIndex(keptIndices);
  box.clearGroups();
  return box;
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

  // UV repeat set for exact 1.0m x 1.0m square tiles across Raised Platform (platW=14.0m x platL=3.00m)
  // Each UV unit contains 2x2 tiles -> 7 repeats across X = 14 tiles (1.0m), 1.5 repeats across Z = 3 tiles (1.0m)
  const diffuseTexture = new THREE.CanvasTexture(diffCanvas);
  diffuseTexture.wrapS = THREE.RepeatWrapping;
  diffuseTexture.wrapT = THREE.RepeatWrapping;
  diffuseTexture.repeat.set(7, 1.5);
  diffuseTexture.colorSpace = THREE.SRGBColorSpace;
  diffuseTexture.anisotropy = 8;
  diffuseTexture.needsUpdate = true;

  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.RepeatWrapping;
  bumpTexture.wrapT = THREE.RepeatWrapping;
  bumpTexture.repeat.set(7, 1.5);
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
        const v = 1 - normZ; // sight-line on outer -Z lip
        uvAttr.setXY(i, u, v);
      } else if (axis === 'x_front') {
        const u = ((posAttr.getX(i) / lenX) + 0.5) * repeatCount;
        const normZ = (posAttr.getZ(i) / lenZ) + 0.5;
        const v = normZ; // sight-line on outer +Z lip
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
 * Procedural Corporate IT Office Suspended Acoustic Ceiling Textures (2048x2048).
 * Mapped 1:1 across the W = 20.0m (X = -10.0 to +10.0) x L = 23.5m (Z = -10.0 to +13.5) ceiling plane:
 * - Clean, uniform Armstrong-style mineral-fiber Tegular acoustic ceiling tiles (#b8c1cc) with
 *   stepped 3D shadow-line reveal edges (ZERO punctured dot grids, ZERO dark slotted grates!).
 * - Continuous, flush satin-aluminum 1.0m x 1.0m T-bar suspension grid (ZERO gray squares at intersections!),
 *   mathematically aligned with the floor tiles and the Server Containment Pod headers (X = ±7.0m, Z = -6.5m).
 * - Undivided, seamless recessed architectural LED flat-panel troffers installed cleanly inside
 *   their modular bays (drawn after the T-bar grid so ZERO lines ever cut a lamp in half!).
 */
function createDataCenterCeilingTextures() {
  const cw = 2048;
  const ch = 2048;

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = cw;
  diffCanvas.height = ch;
  const dCtx = diffCanvas.getContext('2d');

  const emisCanvas = document.createElement('canvas');
  emisCanvas.width = cw;
  emisCanvas.height = ch;
  const eCtx = emisCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = cw;
  bumpCanvas.height = ch;
  const bCtx = bumpCanvas.getContext('2d');

  // Coordinate mappers from world (X in [-10..+10], Z in [-10..+13.5]) to canvas pixels
  const xToPx = (wx) => ((wx + 10.0) / 20.0) * cw;
  const zToPy = (wz) => ((13.5 - wz) / 23.5) * ch;
  const tileW = cw / 20.0;  // 102.4px per 1.0m along X
  const tileH = ch / 23.5;  // 87.15px per 1.0m along Z

  // Base fill: clean corporate cool light-grey mineral-fiber acoustic board (#b8c1cc)
  dCtx.fillStyle = '#b8c1cc';
  dCtx.fillRect(0, 0, cw, ch);

  // Calibrated indirect room-bounce ambient fill on emissive so downward-facing ceiling (normal 0,-1,0)
  // reads as a bright, natural corporate IT office acoustic ceiling alongside the #8c95a0 upper walls
  eCtx.fillStyle = '#4c535e';
  eCtx.fillRect(0, 0, cw, ch);

  // Neutral mid-height bump base
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, cw, ch);

  // 1. Subtle per-tile tonal variation & tegular stepped reveal edges for every 1.0m x 1.0m acoustic tile
  let tileSeed = 48271;
  const nextRand = () => {
    tileSeed = (tileSeed * 16807) % 2147483647;
    return (tileSeed - 1) / 2147483646;
  };

  for (let wx = -10; wx < 10; wx++) {
    const x0 = xToPx(wx);
    const x1 = xToPx(wx + 1.0);
    const w = x1 - x0;

    for (let wz = -10.5; wz < 13.5; wz += 1.0) {
      // Tile spans [wz, wz + 1.0]; in canvas Y, zToPy(wz + 1.0) is top, zToPy(wz) is bottom
      const y0 = zToPy(wz + 1.0);
      const y1 = zToPy(wz);
      const h = y1 - y0;

      // Very gentle natural mineral-fiber board variation (±2.5 RGB)
      const delta = Math.round((nextRand() - 0.5) * 5);
      const r = Math.min(255, Math.max(0, 184 + delta));
      const g = Math.min(255, Math.max(0, 193 + delta));
      const b = Math.min(255, Math.max(0, 204 + delta));

      // Slim tegular recessed reveal margin around the T-bar flange (~1.8px) so squares sit close together
      const rev = 1.8;
      dCtx.fillStyle = '#5c6674'; // Subtle recessed shadow-line reveal channel around tile perimeter
      dCtx.fillRect(x0, y0, w, h);

      eCtx.fillStyle = '#282e37';
      eCtx.fillRect(x0, y0, w, h);

      bCtx.fillStyle = '#484848'; // Recessed groove in bump map
      bCtx.fillRect(x0, y0, w, h);

      // Raised central acoustic tile face dropping below the T-bar (Tegular edge profile)
      dCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      dCtx.fillRect(x0 + rev, y0 + rev, w - rev * 2, h - rev * 2);

      const er = Math.min(255, Math.max(0, 76 + Math.round(delta * 0.5)));
      const eg = Math.min(255, Math.max(0, 83 + Math.round(delta * 0.5)));
      const eb = Math.min(255, Math.max(0, 94 + Math.round(delta * 0.5)));
      eCtx.fillStyle = `rgb(${er}, ${eg}, ${eb})`;
      eCtx.fillRect(x0 + rev, y0 + rev, w - rev * 2, h - rev * 2);

      bCtx.fillStyle = '#969696'; // Raised tegular tile face in bump map
      bCtx.fillRect(x0 + rev, y0 + rev, w - rev * 2, h - rev * 2);

      // Crisp chamfered bevel highlight & shade along the tegular step
      dCtx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
      dCtx.lineWidth = 0.9;
      dCtx.beginPath();
      dCtx.moveTo(x0 + rev, y1 - rev);
      dCtx.lineTo(x0 + rev, y0 + rev);
      dCtx.lineTo(x1 - rev, y0 + rev);
      dCtx.stroke();

      dCtx.strokeStyle = 'rgba(30, 36, 44, 0.22)';
      dCtx.lineWidth = 0.9;
      dCtx.beginPath();
      dCtx.moveTo(x0 + rev, y1 - rev);
      dCtx.lineTo(x1 - rev, y1 - rev);
      dCtx.lineTo(x1 - rev, y0 + rev);
      dCtx.stroke();
    }
  }

  // Fine mineral-fiber acoustic micro-stipple across the tiles
  const imgData = dCtx.getImageData(0, 0, cw, ch);
  const data = imgData.data;
  const bumpImg = bCtx.getImageData(0, 0, cw, ch);
  const bData = bumpImg.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 7;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));

    const bGrain = (Math.random() - 0.5) * 6;
    bData[i] = Math.min(255, Math.max(0, bData[i] + bGrain));
    bData[i + 1] = bData[i];
    bData[i + 2] = bData[i];
  }
  dCtx.putImageData(imgData, 0, 0);
  bCtx.putImageData(bumpImg, 0, 0);

  // 2. Continuous Slim Satin-Aluminum / Off-White 1.0m x 1.0m T-Bar Suspension Grid
  // Zero corner squares or blobs! Clean continuous main runners and cross-tees.
  const tBarHalfW = 1.0; // 2.0px slim architectural T-bar flange
  for (let wx = -10; wx <= 10; wx++) {
    const px = xToPx(wx);
    dCtx.fillStyle = '#9aa3b0';
    dCtx.fillRect(px - tBarHalfW, 0, tBarHalfW * 2, ch);
    dCtx.fillStyle = '#b4bdca';
    dCtx.fillRect(px - 0.4, 0, 0.8, ch);

    eCtx.fillStyle = '#3d434d';
    eCtx.fillRect(px - tBarHalfW, 0, tBarHalfW * 2, ch);

    bCtx.fillStyle = '#747474';
    bCtx.fillRect(px - tBarHalfW, 0, tBarHalfW * 2, ch);
  }

  for (let wz = -9.5; wz <= 13.5; wz += 1.0) {
    const py = zToPy(wz);
    dCtx.fillStyle = '#9aa3b0';
    dCtx.fillRect(0, py - tBarHalfW, cw, tBarHalfW * 2);
    dCtx.fillStyle = '#b4bdca';
    dCtx.fillRect(0, py - 0.4, cw, 0.8);

    eCtx.fillStyle = '#3d434d';
    eCtx.fillRect(0, py - tBarHalfW, cw, tBarHalfW * 2);

    bCtx.fillStyle = '#747474';
    bCtx.fillRect(0, py - tBarHalfW, cw, tBarHalfW * 2);
  }

  // 3. Undivided, Seamless Recessed Architectural LED Flat-Panel Troffers
  // Drawn AFTER the T-bar grid so that multi-tile (2.0m x 1.0m) fixtures replace the intermediate
  // cross-tee as a single, whole, unbroken luminaire with ZERO lines cutting through the lamp!
  const drawUndividedLedPanel = (xMin, xMax, zMin, zMax) => {
    // Inset strictly inside the surrounding perimeter T-bar flange with a tight reveal
    const padPx = tBarHalfW + 0.8;
    const x0 = xToPx(xMin) + padPx;
    const x1 = xToPx(xMax) - padPx;
    const y0 = zToPy(zMax) + padPx;
    const y1 = zToPy(zMin) - padPx;
    const w = x1 - x0;
    const h = y1 - y0;

    // A. Outer dark recessed shadow gap around fixture perimeter
    dCtx.fillStyle = '#48505d';
    dCtx.fillRect(x0, y0, w, h);
    eCtx.fillStyle = '#20252d';
    eCtx.fillRect(x0, y0, w, h);
    bCtx.fillStyle = '#383838';
    bCtx.fillRect(x0, y0, w, h);

    // B. Sleek powder-coated white/silver aluminum luminaire bezel frame (~5.5px wide)
    const frameInset = 1.0;
    const frameW = 5.5;
    const fx = x0 + frameInset;
    const fy = y0 + frameInset;
    const fw = w - frameInset * 2;
    const fh = h - frameInset * 2;

    const frameGrad = dCtx.createLinearGradient(fx, fy, fx, fy + fh);
    frameGrad.addColorStop(0, '#d8e0ea');
    frameGrad.addColorStop(0.5, '#c5ced9');
    frameGrad.addColorStop(1, '#b0bac7');
    dCtx.fillStyle = frameGrad;
    dCtx.fillRect(fx, fy, fw, fh);

    eCtx.fillStyle = '#586170';
    eCtx.fillRect(fx, fy, fw, fh);

    bCtx.fillStyle = '#a8a8a8';
    bCtx.fillRect(fx, fy, fw, fh);

    // Subtle 45-degree mitered corner lines on the aluminum bezel frame
    dCtx.strokeStyle = 'rgba(70, 80, 95, 0.45)';
    dCtx.lineWidth = 1.0;
    dCtx.beginPath();
    // Top-left miter
    dCtx.moveTo(fx, fy);
    dCtx.lineTo(fx + frameW, fy + frameW);
    // Top-right miter
    dCtx.moveTo(fx + fw, fy);
    dCtx.lineTo(fx + fw - frameW, fy + frameW);
    // Bottom-left miter
    dCtx.moveTo(fx, fy + fh);
    dCtx.lineTo(fx + frameW, fy + fh - frameW);
    // Bottom-right miter
    dCtx.moveTo(fx + fw, fy + fh);
    dCtx.lineTo(fx + fw - frameW, fy + fh - frameW);
    dCtx.stroke();

    // C. Inner recessed diffuser gasket rim
    const lx = fx + frameW;
    const ly = fy + frameW;
    const lw = fw - frameW * 2;
    const lh = fh - frameW * 2;

    dCtx.fillStyle = '#7c8796';
    dCtx.fillRect(lx - 1.5, ly - 1.5, lw + 3.0, lh + 3.0);
    bCtx.fillStyle = '#505050';
    bCtx.fillRect(lx - 1.5, ly - 1.5, lw + 3.0, lh + 3.0);

    // D. Single Undivided Micro-Prismatic Opal LED Diffuser Lens (100% seamless — zero divider bars!)
    const diffGrad = dCtx.createLinearGradient(lx, ly, lx, ly + lh);
    diffGrad.addColorStop(0, '#e6f0fa');
    diffGrad.addColorStop(0.18, '#f5f9ff');
    diffGrad.addColorStop(0.50, '#ffffff');
    diffGrad.addColorStop(0.82, '#f5f9ff');
    diffGrad.addColorStop(1, '#e2edf8');
    dCtx.fillStyle = diffGrad;
    dCtx.fillRect(lx, ly, lw, lh);

    // Soft radial/edge falloff on emissive map so the glowing panel has realistic depth
    const emisGrad = eCtx.createLinearGradient(lx, ly, lx, ly + lh);
    emisGrad.addColorStop(0, '#c8daf0');
    emisGrad.addColorStop(0.15, '#eaf3ff');
    emisGrad.addColorStop(0.50, '#ffffff');
    emisGrad.addColorStop(0.85, '#eaf3ff');
    emisGrad.addColorStop(1, '#c8daf0');
    eCtx.fillStyle = emisGrad;
    eCtx.fillRect(lx, ly, lw, lh);

    // Flat recessed lens surface in bump map
    bCtx.fillStyle = '#686868';
    bCtx.fillRect(lx, ly, lw, lh);
  };

  // Lighting Z-bands (each spanning exactly 1.0m [zMin, zMax] between horizontal T-bars):
  // - Inside Server Containment Pod (Z = -9.5 to -6.5m): centered row [-8.5, -7.5] (1.0m clear of Z = -6.5m pod frame!)
  // - Across Main Office (Z = -6.5 to +13.5m): every 3.0m ([-5.5,-4.5], [-2.5,-1.5], [0.5,1.5], [3.5,4.5], [6.5,7.5], [9.5,10.5])
  const lightZBands = [
    [-8.5, -7.5],
    [-5.5, -4.5],
    [-2.5, -1.5],
    [0.5, 1.5],
    [3.5, 4.5],
    [6.5, 7.5],
    [9.5, 10.5],
  ];

  for (const [zMin, zMax] of lightZBands) {
    // 3 Central Undivided 2.0m x 1.0m Recessed LED Troffers (2.0m clear of X = ±7.0m pod walls!)
    drawUndividedLedPanel(-5.0, -3.0, zMin, zMax);
    drawUndividedLedPanel(-1.0, 1.0, zMin, zMax);
    drawUndividedLedPanel(3.0, 5.0, zMin, zMax);

    // 2 Side-Aisle Undivided 1.0m x 1.0m Recessed LED Troffers (1.0m clear of X = ±7.0m pod walls & X = ±10.0m outer walls!)
    drawUndividedLedPanel(-9.0, -8.0, zMin, zMax);
    drawUndividedLedPanel(8.0, 9.0, zMin, zMax);
  }

  // Diffuse texture (1:1 full-room mapping)
  const diffuseTexture = new THREE.CanvasTexture(diffCanvas);
  diffuseTexture.wrapS = THREE.ClampToEdgeWrapping;
  diffuseTexture.wrapT = THREE.ClampToEdgeWrapping;
  diffuseTexture.repeat.set(1, 1);
  diffuseTexture.colorSpace = THREE.SRGBColorSpace;
  diffuseTexture.anisotropy = 8;
  diffuseTexture.needsUpdate = true;

  // Emissive texture (1:1 full-room mapping)
  const emissiveTexture = new THREE.CanvasTexture(emisCanvas);
  emissiveTexture.wrapS = THREE.ClampToEdgeWrapping;
  emissiveTexture.wrapT = THREE.ClampToEdgeWrapping;
  emissiveTexture.repeat.set(1, 1);
  emissiveTexture.colorSpace = THREE.SRGBColorSpace;
  emissiveTexture.anisotropy = 8;
  emissiveTexture.needsUpdate = true;

  // Bump texture (1:1 full-room mapping)
  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.ClampToEdgeWrapping;
  bumpTexture.wrapT = THREE.ClampToEdgeWrapping;
  bumpTexture.repeat.set(1, 1);
  bumpTexture.anisotropy = 8;
  bumpTexture.needsUpdate = true;

  return { diffuseTexture, emissiveTexture, bumpTexture };
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
 * Removes hidden faces from a BoxGeometry based on face normal direction
 * so adjacent wall segments never have internal coplanar or perpendicular seam faces.
 */
function filterBoxFaces(geo, hideFaces) {
  if (!hideFaces) return geo;
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
  const pos = nonIndexed.attributes.position;
  const norm = nonIndexed.attributes.normal;
  const uv = nonIndexed.attributes.uv;

  const newPos = [];
  const newNorm = [];
  const newUv = [];

  for (let i = 0; i < pos.count; i += 3) {
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);

    if (hideFaces.px && nx > 0.5) continue;
    if (hideFaces.nx && nx < -0.5) continue;
    if (hideFaces.py && ny > 0.5) continue;
    if (hideFaces.ny && ny < -0.5) continue;
    if (hideFaces.pz && nz > 0.5) continue;
    if (hideFaces.nz && nz < -0.5) continue;

    for (let v = 0; v < 3; v++) {
      const idx = i + v;
      newPos.push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
      newNorm.push(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
      newUv.push(uv.getX(idx), uv.getY(idx));
    }
  }

  if (nonIndexed !== geo) nonIndexed.dispose();
  geo.dispose();
  const filtered = new THREE.BufferGeometry();
  filtered.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
  filtered.setAttribute('normal', new THREE.Float32BufferAttribute(newNorm, 3));
  filtered.setAttribute('uv', new THREE.Float32BufferAttribute(newUv, 2));
  return filtered;
}

/**
 * Creates a BoxGeometry for a sub-segment of a 3.8m tall wall while preserving
 * 100% seamless world-space UV continuity with createWallBoxGeometry, and optionally
 * strips internal/back faces to guarantee zero seam artifacts.
 */
function createWallSegmentGeometry(
  w,
  h,
  d,
  isZAxis = false,
  reverseU = false,
  yBottom = 0,
  horizStart = 0,
  fullLength = 23.5,
  hideFaces = null
) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const worldY = yBottom + (y + h / 2);
    const v = worldY / 3.8;

    let horiz = horizStart + (isZAxis ? (z + d / 2) : (x + w / 2));
    if (reverseU) {
      horiz = fullLength - horiz;
    }
    const u = horiz / 4.0;

    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return filterBoxFaces(geo, hideFaces);
}

/**
 * Creates a BoxGeometry with world-space planar UV coordinates on top/side faces
 * so tiled black marble slabs align seamlessly across adjacent floor segments and stairs.
 */
function createMarbleFloorBoxGeometry(w, h, d, worldXCenter = 0, worldZCenter = 0, tileScale = 2.4) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const wx = worldXCenter + pos.getX(i);
    const wy = pos.getY(i) + h / 2;
    const wz = worldZCenter + pos.getZ(i);
    const ny = Math.abs(norm.getY(i));

    if (ny > 0.5) {
      uv.setXY(i, wx / tileScale, wz / tileScale);
    } else {
      uv.setXY(i, (wx + wz) / tileScale, wy / tileScale);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Creates a cylinder geometry oriented along the 3D segment from p1 to p2.
 */
function createCylinderBetweenPoints(p1, p2, radius, radialSegments = 12) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, radialSegments).toNonIndexed();
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(mat);
  return geo;
}

/**
 * High-Resolution Procedural Nero Marquina Polished Black Marble Textures (2048x2048).
 * Generates Diffuse, Bump, and Roughness maps featuring:
 * - Large-format rectangular stone slabs (2x4 running-bond grid) where each slab is clipped
 *   to its own unique stone block cut (veins terminate authentically at grout joints).
 * - Deep obsidian/charcoal limestone matrix with directional mineral strata & smokey quartz clouds.
 * - Pinch-and-swell crystalline white calcite veins with soft mineral halo bleed, jagged tectonic
 *   micro-faults, and delicate secondary hairline cross-fractures.
 * - Warm golden-taupe & silver-grey sheared metamorphic mineral ribbon on accent slabs.
 */
function createBlackMarbleTextures() {
  const size = 2048;
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = size;
  diffCanvas.height = size;
  const ctx = diffCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d');

  // Base fills
  ctx.fillStyle = '#080a0e';
  ctx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Polished stone base roughness (~0.13 -> rgb 33)
  rCtx.fillStyle = '#212121';
  rCtx.fillRect(0, 0, size, size);

  let seed = 104729;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Helper: Renders a natural pinch-and-swell geological calcite vein inside the active slab clip
  const renderGeologicalVein = (x0, y0, baseAngle, length, maxThickness, intensity, isWarm = false, depth = 0) => {
    const steps = Math.max(24, Math.floor(length / 7));
    const stepLen = length / steps;
    const pts = [];
    let x = x0;
    let y = y0;
    let ang = baseAngle;
    const phase1 = rand() * Math.PI * 2;
    const phase2 = rand() * Math.PI * 2;
    const freq1 = 1.5 + rand() * 2.5;
    const freq2 = 5.0 + rand() * 6.0;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Smooth tectonic meandering + sharp crystalline micro-jags
      ang += (rand() - 0.5) * 0.28 + Math.sin(t * Math.PI * freq1 + phase1) * 0.04;
      if (rand() < 0.08) {
        // Sudden micro-fault jog
        ang += (rand() > 0.5 ? 1 : -1) * (0.35 + rand() * 0.35);
      }

      // Pinch-and-swell width envelope (swells at crystalline nodes, pinches to hairline)
      const endTaper = Math.sin(t * Math.PI);
      const swell = Math.max(
        0.08,
        0.48 + 0.38 * Math.sin(t * Math.PI * freq1 + phase1) + 0.28 * Math.cos(t * Math.PI * freq2 + phase2)
      );
      const w = maxThickness * swell * (0.25 + 0.75 * endTaper);

      pts.push({ x, y, w, ang });
      x += Math.cos(ang) * stepLen;
      y += Math.sin(ang) * stepLen;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Pass 1: Soft translucent mineral halo / bleed into surrounding dark limestone
    if (maxThickness > 1.6 && depth === 0) {
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const haloAlpha = intensity * 0.085 * (p0.w / maxThickness);
        ctx.strokeStyle = isWarm
          ? `rgba(145, 134, 102, ${haloAlpha.toFixed(4)})`
          : `rgba(140, 152, 168, ${haloAlpha.toFixed(4)})`;
        ctx.lineWidth = p0.w * 4.2 + 2.0;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }

    // Pass 2: Medium pearl-silver calcite body
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const bodyAlpha = intensity * (0.32 + 0.35 * (p0.w / maxThickness));
      ctx.strokeStyle = isWarm
        ? `rgba(182, 170, 136, ${bodyAlpha.toFixed(4)})`
        : `rgba(198, 206, 218, ${bodyAlpha.toFixed(4)})`;
      ctx.lineWidth = Math.max(0.5, p0.w * 1.45);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    // Pass 3: Crisp bright crystalline calcite core + roughness/bump signature
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const coreAlpha = Math.min(0.95, intensity * (0.55 + 0.42 * (p0.w / maxThickness)));
      ctx.strokeStyle = isWarm
        ? `rgba(224, 215, 188, ${coreAlpha.toFixed(4)})`
        : `rgba(246, 249, 255, ${coreAlpha.toFixed(4)})`;
      ctx.lineWidth = Math.max(0.35, p0.w * 0.62);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();

      // Subtle crystalline roughness & bump along primary veins
      if (p0.w > 1.2) {
        rCtx.strokeStyle = 'rgba(58, 58, 58, 0.35)';
        rCtx.lineWidth = p0.w * 1.2;
        rCtx.beginPath();
        rCtx.moveTo(p0.x, p0.y);
        rCtx.lineTo(p1.x, p1.y);
        rCtx.stroke();

        bCtx.strokeStyle = 'rgba(142, 142, 142, 0.30)';
        bCtx.lineWidth = p0.w;
        bCtx.beginPath();
        bCtx.moveTo(p0.x, p0.y);
        bCtx.lineTo(p1.x, p1.y);
        bCtx.stroke();
      }

      // Spawn secondary conjugate hairline fractures at crystalline nodes
      if (depth < 2 && i > 3 && i < pts.length - 4) {
        const branchChance = depth === 0 ? 0.085 : 0.045;
        if (rand() < branchChance) {
          const branchSign = rand() > 0.5 ? 1 : -1;
          const branchAngle = p0.ang + branchSign * (0.45 + rand() * 0.65);
          const branchLen = length * (0.22 + rand() * 0.32);
          const branchThick = Math.max(0.55, p0.w * (0.38 + rand() * 0.25));
          renderGeologicalVein(
            p0.x,
            p0.y,
            branchAngle,
            branchLen,
            branchThick,
            intensity * 0.78,
            isWarm,
            depth + 1
          );
        }
      }
    }
  };

  // 4 Rows of Rectangular Architectural Stone Slabs (Running-bond staggered layout)
  const numRows = 4;
  const slabH = size / numRows; // 512px
  const slabW = size / 2;       // 1024px (2:1 rectangular stone slab aspect ratio!)

  for (let row = 0; row < numRows; row++) {
    const yMin = row * slabH;
    const staggerX = (row % 2 === 1) ? slabW * 0.5 : 0;

    // Render slabs across row (including wrap-around slab when staggered)
    const numCols = staggerX > 0 ? 3 : 2;
    for (let col = 0; col < numCols; col++) {
      const rawXMin = col * slabW - staggerX;
      const xMin = Math.max(0, rawXMin);
      const xMax = Math.min(size, rawXMin + slabW);
      const curW = xMax - xMin;
      if (curW <= 0) continue;

      ctx.save();
      bCtx.save();
      rCtx.save();

      ctx.beginPath();
      ctx.rect(xMin, yMin, curW, slabH);
      ctx.clip();

      bCtx.beginPath();
      bCtx.rect(xMin, yMin, curW, slabH);
      bCtx.clip();

      rCtx.beginPath();
      rCtx.rect(xMin, yMin, curW, slabH);
      rCtx.clip();

      // 1. Per-slab deep obsidian/charcoal tonal gradient
      const baseTone = 7 + Math.floor(rand() * 5);
      const slabGrad = ctx.createLinearGradient(xMin, yMin, xMax, yMin + slabH);
      slabGrad.addColorStop(0, `rgb(${baseTone}, ${baseTone + 2}, ${baseTone + 5})`);
      slabGrad.addColorStop(0.5, `rgb(${baseTone + 3}, ${baseTone + 5}, ${baseTone + 9})`);
      slabGrad.addColorStop(1, `rgb(${baseTone - 1}, ${baseTone + 1}, ${baseTone + 4})`);
      ctx.fillStyle = slabGrad;
      ctx.fillRect(xMin, yMin, curW, slabH);

      // Slight per-slab base roughness variation (11% to 15%)
      const rVal = 28 + Math.floor(rand() * 10);
      rCtx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
      rCtx.fillRect(xMin, yMin, curW, slabH);

      // 2. Natural bedding plane angle for this stone block
      const beddingAngle = -0.38 + (rand() - 0.5) * 0.48;
      const cosB = Math.cos(beddingAngle);
      const sinB = Math.sin(beddingAngle);

      // Directional mineral strata & smokey graphite clouds stretched along beddingAngle
      for (let m = 0; m < 28; m++) {
        const mx = xMin + rand() * curW;
        const my = yMin + rand() * slabH;
        const len = 180 + rand() * 420;
        const wid = 24 + rand() * 68;
        const isDark = rand() > 0.55;

        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(beddingAngle + (rand() - 0.5) * 0.18);
        ctx.scale(1.0, wid / len);
        const mGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, len * 0.5);
        if (isDark) {
          mGrad.addColorStop(0, 'rgba(2, 3, 5, 0.16)');
          mGrad.addColorStop(1, 'rgba(8, 10, 14, 0)');
        } else {
          mGrad.addColorStop(0, 'rgba(34, 40, 50, 0.075)');
          mGrad.addColorStop(1, 'rgba(8, 10, 14, 0)');
        }
        ctx.fillStyle = mGrad;
        ctx.fillRect(-len * 0.5, -len * 0.5, len, len);
        ctx.restore();
      }

      // 3. Sheared warm golden-ochre / silver-grey metamorphic mineral ribbon on select slabs
      // (Matches the dramatic sheared mineral band seen in the real vestibule floor photo!)
      if ((row === 3 && col === 0) || (row === 1 && col === 1)) {
        const ribX = xMin + curW * 0.15;
        const ribY = yMin + slabH * 0.82;
        for (let b = 0; b < 5; b++) {
          renderGeologicalVein(
            ribX + b * 18,
            ribY - b * 8,
            -0.32 + (rand() - 0.5) * 0.08,
            curW * 0.95,
            4.5 + rand() * 3.5,
            0.55 + rand() * 0.25,
            true,
            0
          );
        }
      }

      // 4. Primary Crystalline White Calcite Veins (2 to 4 major veins per slab)
      const numPrimary = 2 + Math.floor(rand() * 3);
      for (let p = 0; p < numPrimary; p++) {
        const vx = xMin - 40 + rand() * (curW + 80);
        const vy = yMin - 30 + rand() * (slabH + 60);
        const vLen = 320 + rand() * 680;
        const vThick = 1.8 + rand() * 3.2;
        const vInt = 0.58 + rand() * 0.36;
        renderGeologicalVein(
          vx,
          vy,
          beddingAngle + (rand() - 0.5) * 0.32,
          vLen,
          vThick,
          vInt,
          false,
          0
        );
      }

      // 5. Fine Crystalline Hairline Fissures & Breccia Webbing
      const numHairlines = 7 + Math.floor(rand() * 6);
      for (let h = 0; h < numHairlines; h++) {
        const hx = xMin + rand() * curW;
        const hy = yMin + rand() * slabH;
        const hLen = 90 + rand() * 240;
        const hThick = 0.45 + rand() * 0.85;
        const hAng = beddingAngle + (rand() - 0.5) * 1.15;
        renderGeologicalVein(hx, hy, hAng, hLen, hThick, 0.30 + rand() * 0.35, false, 1);
      }

      // 6. Subtle internal slab edge bevel & razor-sharp dark grout seam
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 2;
      ctx.strokeRect(xMin + 2, yMin + 2, curW - 4, slabH - 4);

      ctx.strokeStyle = '#030406';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(xMin, yMin, curW, slabH);

      bCtx.strokeStyle = '#242424';
      bCtx.lineWidth = 4.5;
      bCtx.strokeRect(xMin, yMin, curW, slabH);

      rCtx.strokeStyle = '#c0c0c0';
      rCtx.lineWidth = 4.5;
      rCtx.strokeRect(xMin, yMin, curW, slabH);

      ctx.restore();
      bCtx.restore();
      rCtx.restore();
    }
  }

  const diffuse = new THREE.CanvasTexture(diffCanvas);
  diffuse.wrapS = THREE.RepeatWrapping;
  diffuse.wrapT = THREE.RepeatWrapping;
  diffuse.colorSpace = THREE.SRGBColorSpace;
  diffuse.anisotropy = 16;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.anisotropy = 8;

  const roughness = new THREE.CanvasTexture(roughCanvas);
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.anisotropy = 8;

  return { diffuse, bump, roughness };
}

/**
 * Procedural Matte Architectural Off-White Plaster Texture (512x512)
 * Calibrated to #98a0aa so under PBR RoomEnvironment IBL + DirectionalLight + ACES tone mapping
 * it renders as a crisp, natural corporate off-white without triggering post-processing bloom.
 */
function createVestibulePlasterTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#98a0aa';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  let seed = 55123;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < data.length; i += 4) {
    const grain = Math.round((rand() - 0.5) * 6);
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Procedural Grey Architectural Stone/Concrete Cladding Texture (1024x512)
 * for the vestibule side of the lower half-wall below the glass partition.
 */
function createVestibuleHalfWallTexture() {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#676c74';
  ctx.fillRect(0, 0, w, h);

  let seed = 41299;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Mottled concrete/plaster tonal variation
  for (let i = 0; i < 240; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const r = 20 + rand() * 85;
    const shade = rand() > 0.5 ? 128 : 78;
    const alpha = 0.04 + rand() * 0.05;
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    grad.addColorStop(0, `rgba(${shade}, ${shade + 2}, ${shade + 5}, ${alpha})`);
    grad.addColorStop(1, 'rgba(103, 108, 116, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // 4 vertical architectural panel joints matching the 4 glass panes above
  const panelW = w / 4;
  for (let i = 1; i < 4; i++) {
    const px = i * panelW;
    ctx.fillStyle = 'rgba(42, 45, 50, 0.75)';
    ctx.fillRect(px - 2, 0, 3, h);
    ctx.fillStyle = 'rgba(145, 150, 158, 0.35)';
    ctx.fillRect(px + 1, 0, 2, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Procedural Brushed Stainless Steel Texture (512x512)
 * for the double elevator doors, call button plate, and cylindrical office trash bin.
 */
function createBrushedStainlessTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#c8cfd8');
  grad.addColorStop(0.5, '#e2e7ee');
  grad.addColorStop(1, '#bcc4ce');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  let seed = 91823;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 1600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 18 + rand() * 70;
    const bright = rand() > 0.5 ? 250 : 165;
    ctx.strokeStyle = `rgba(${bright}, ${bright}, ${bright + 4}, 0.08)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Procedural Elevator Digital Floor Indicator & Hall Call Buttons Atlas (512x512).
 * - Top half (y = 0..256, v = 0.5..1.0): Digital '⬇ 30' Floor Indicator Screen
 * - Bottom-left quadrant (cx = 128, cy = 384, u = 0..0.5, v = 0..0.5): Tactile '▲' UP Call Button
 * - Bottom-right quadrant (cx = 384, cy = 384, u = 0.5..1.0, v = 0..0.5): Illuminated '▼' DOWN Call Button
 */
function createElevatorDisplayTextures() {
  const w = 512;
  const h = 512;
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = w;
  diffCanvas.height = h;
  const ctx = diffCanvas.getContext('2d');

  const emCanvas = document.createElement('canvas');
  emCanvas.width = w;
  emCanvas.height = h;
  const eCtx = emCanvas.getContext('2d');

  // Clear full 512x512 atlas
  ctx.fillStyle = '#090b0f';
  ctx.fillRect(0, 0, w, h);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, w, h);

  // =========================================================================
  // 1. TOP HALF (y = 0..256): DIGITAL FLOOR INDICATOR SCREEN ('⬇ 30')
  // =========================================================================
  ctx.strokeStyle = '#333942';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, w - 12, 256 - 12);

  const drawDisplayGlyphs = (targetCtx, color) => {
    targetCtx.fillStyle = color;
    // Down arrow on left
    targetCtx.fillRect(140, 72, 24, 52);

    targetCtx.beginPath();
    targetCtx.moveTo(116, 120);
    targetCtx.lineTo(188, 120);
    targetCtx.lineTo(152, 176);
    targetCtx.closePath();
    targetCtx.fill();

    // Digital floor readout '30'
    targetCtx.font = 'bold 124px monospace';
    targetCtx.textAlign = 'center';
    targetCtx.textBaseline = 'middle';
    targetCtx.fillText('30', 324, 130);
  };

  drawDisplayGlyphs(ctx, '#ff5522');
  drawDisplayGlyphs(eCtx, '#ff4510');

  // =========================================================================
  // 2. BOTTOM HALF (y = 256..512): MACHINED ELEVATOR CALL PUSHBUTTONS ('▲' & '▼')
  // =========================================================================
  const drawCallButton = (cx, cy, isUp, isActive) => {
    // A. Outer dark recessed collar shadow
    ctx.fillStyle = '#11151c';
    ctx.beginPath();
    ctx.arc(cx, cy, 122, 0, Math.PI * 2);
    ctx.fill();

    // B. Machined stainless outer chamfer ring
    const ringGrad = ctx.createLinearGradient(cx - 110, cy - 110, cx + 110, cy + 110);
    ringGrad.addColorStop(0.0, '#d8e0ea');
    ringGrad.addColorStop(0.5, '#8c96a4');
    ringGrad.addColorStop(1.0, '#49525e');
    ctx.fillStyle = ringGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 114, 0, Math.PI * 2);
    ctx.fill();

    // C. Illuminated LED Halo Ring (r = 86..106)
    ctx.fillStyle = isActive ? '#ff5522' : '#cdd6e2';
    ctx.beginPath();
    ctx.arc(cx, cy, 105, 0, Math.PI * 2);
    ctx.fill();

    if (isActive) {
      const emHalo = eCtx.createRadialGradient(cx, cy, 80, cx, cy, 110);
      emHalo.addColorStop(0.0, '#000000');
      emHalo.addColorStop(0.35, '#ff4510');
      emHalo.addColorStop(0.75, '#ff5522');
      emHalo.addColorStop(1.0, '#000000');
      eCtx.fillStyle = emHalo;
      eCtx.beginPath();
      eCtx.arc(cx, cy, 110, 0, Math.PI * 2);
      eCtx.fill();
    } else {
      eCtx.strokeStyle = '#2a3442';
      eCtx.lineWidth = 14;
      eCtx.beginPath();
      eCtx.arc(cx, cy, 95, 0, Math.PI * 2);
      eCtx.stroke();
    }

    // D. Tactile Brushed Dark Stainless Center Cap (r = 85)
    const capGrad = ctx.createLinearGradient(cx - 60, cy - 85, cx + 60, cy + 85);
    capGrad.addColorStop(0.0, '#4a5360');
    capGrad.addColorStop(0.48, '#2d333d');
    capGrad.addColorStop(1.0, '#1c2027');
    ctx.fillStyle = capGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 85, 0, Math.PI * 2);
    ctx.fill();

    // Subtle horizontal brushed-metal grain across the tactile cap
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 84, 0, Math.PI * 2);
    ctx.clip();
    for (let y = cy - 84; y <= cy + 84; y += 3) {
      ctx.fillStyle = (y % 6 === 0) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
      ctx.fillRect(cx - 85, y, 170, 1.5);
    }
    ctx.restore();

    // E. Center Engraved / Backlit Directional Chevron ('▲' or '▼')
    const drawChevron = (targetCtx, strokeColor) => {
      targetCtx.strokeStyle = strokeColor;
      targetCtx.lineWidth = 14;
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';
      targetCtx.beginPath();
      if (isUp) {
        targetCtx.moveTo(cx - 34, cy + 16);
        targetCtx.lineTo(cx, cy - 22);
        targetCtx.lineTo(cx + 34, cy + 16);
      } else {
        targetCtx.moveTo(cx - 34, cy - 16);
        targetCtx.lineTo(cx, cy + 22);
        targetCtx.lineTo(cx + 34, cy - 16);
      }
      targetCtx.stroke();
    };

    drawChevron(ctx, isActive ? '#ff6633' : '#e6edf5');
    drawChevron(eCtx, isActive ? '#ff4510' : '#334155');
  };

  // Bottom-Left: UP Button ('▲', standby)
  drawCallButton(128, 384, true, false);
  // Bottom-Right: DOWN Button ('▼', active/lit)
  drawCallButton(384, 384, false, true);

  const diffuse = new THREE.CanvasTexture(diffCanvas);
  diffuse.colorSpace = THREE.SRGBColorSpace;
  diffuse.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(emCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.anisotropy = 8;
  return { diffuse, emissive };
}

/**
 * Procedural ISO 7010 / ABNT Emergency Exit Down-Stairs Sign Textures (1024x512).
 * Matches the Running-Man + Descending Stairs + Diagonal Arrow reference graphic.
 */
function createExitSignTextures() {
  const w = 1024;
  const h = 512;
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = w;
  diffCanvas.height = h;
  const ctx = diffCanvas.getContext('2d');

  const emCanvas = document.createElement('canvas');
  emCanvas.width = w;
  emCanvas.height = h;
  const eCtx = emCanvas.getContext('2d');

  const drawRoundedRect = (c, x, y, width, height, radius) => {
    c.beginPath();
    c.moveTo(x + radius, y);
    c.lineTo(x + width - radius, y);
    c.quadraticCurveTo(x + width, y, x + width, y + radius);
    c.lineTo(x + width, y + height - radius);
    c.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    c.lineTo(x + radius, y + height);
    c.quadraticCurveTo(x, y + height, x, y + height - radius);
    c.lineTo(x, y + radius);
    c.quadraticCurveTo(x, y, x + radius, y);
    c.closePath();
  };

  const drawSign = (c, isEmissive) => {
    const greenColor = isEmissive ? '#005c25' : '#007934';
    const whiteColor = isEmissive ? '#eef8f2' : '#ffffff';

    // 1. Crisp White Outer Sign Border
    c.fillStyle = whiteColor;
    c.fillRect(0, 0, w, h);

    // 2. Deep Safety-Green Rounded Field (inset 14px, 16px corner radius)
    c.fillStyle = greenColor;
    drawRoundedRect(c, 14, 14, w - 28, h - 28, 16);
    c.fill();

    // 3. Left Graphic: Solid White Doorway with 45° Perspective Threshold Extension
    c.fillStyle = whiteColor;
    c.beginPath();
    c.moveTo(132, 60);
    c.lineTo(398, 60);
    c.lineTo(398, 414);
    c.lineTo(362, 450);
    c.lineTo(96, 450);
    c.lineTo(132, 414);
    c.closePath();
    c.fill();

    // White outline extension on the left of the doorway where the runner's rear foot kicks out
    c.beginPath();
    c.moveTo(133, 311);
    c.lineTo(106, 311);
    c.lineTo(86, 362);
    c.lineTo(133, 362);
    c.closePath();
    c.fill();

    // 4. Green Running Man Silhouette (Running RIGHT toward the stairs)
    c.fillStyle = greenColor;

    // Circular Head
    c.beginPath();
    c.arc(314, 114, 33, 0, Math.PI * 2);
    c.fill();

    // Connected Torso, Arms, Front Leg, and Rear Kicking Leg
    c.beginPath();
    c.moveTo(180, 160);
    c.lineTo(298, 160);
    c.lineTo(352, 204);
    c.lineTo(400, 204);
    c.lineTo(400, 232);
    c.lineTo(340, 232);
    c.lineTo(290, 190);
    c.lineTo(262, 248);
    c.lineTo(360, 412);
    c.lineTo(318, 412);
    c.lineTo(234, 268);
    c.lineTo(224, 354);
    c.lineTo(96, 354);
    c.lineTo(112, 319);
    c.lineTo(192, 319);
    c.lineTo(202, 244);
    c.lineTo(236, 190);
    c.lineTo(196, 190);
    c.lineTo(175, 231);
    c.arc(162, 224, 15, 0.48, Math.PI + 0.48, false);
    c.closePath();
    c.fill();

    // Green 45° Perspective Floor Shadow Under Front Foot
    c.beginPath();
    c.moveTo(316, 419);
    c.lineTo(358, 419);
    c.lineTo(324, 451);
    c.lineTo(282, 451);
    c.closePath();
    c.fill();

    // 5. Right Graphic: White Descending Staircase (5 treads, 4 risers, 36px bar thickness)
    c.fillStyle = whiteColor;
    c.beginPath();
    c.moveTo(498, 84);
    c.lineTo(604, 84);
    c.lineTo(604, 166);
    c.lineTo(690, 166);
    c.lineTo(690, 248);
    c.lineTo(776, 248);
    c.lineTo(776, 330);
    c.lineTo(862, 330);
    c.lineTo(862, 412);
    c.lineTo(914, 412);
    c.lineTo(914, 448);
    c.lineTo(826, 448);
    c.lineTo(826, 366);
    c.lineTo(740, 366);
    c.lineTo(740, 284);
    c.lineTo(654, 284);
    c.lineTo(654, 202);
    c.lineTo(568, 202);
    c.lineTo(568, 120);
    c.lineTo(498, 120);
    c.closePath();
    c.fill();

    // 6. Diagonal 45° Down-Right Directional Arrow Above the Stairs
    c.beginPath();
    c.moveTo(770, 98);
    c.lineTo(856, 184);
    c.lineTo(856, 122);
    c.lineTo(888, 154);
    c.lineTo(888, 238);
    c.lineTo(804, 238);
    c.lineTo(772, 206);
    c.lineTo(834, 206);
    c.lineTo(748, 120);
    c.closePath();
    c.fill();
  };

  drawSign(ctx, false);
  drawSign(eCtx, true);

  const diffuse = new THREE.CanvasTexture(diffCanvas);
  diffuse.colorSpace = THREE.SRGBColorSpace;
  diffuse.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(emCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.anisotropy = 8;
  return { diffuse, emissive };
}

/**
 * Procedural Brazilian Portuguese "AVISO / ACESSO RESTRITO / SOMENTE PESSOAS AUTORIZADAS" Sign Plaque Texture (600x420).
 * Matches standard Brazilian NBR / NR-26 security & restricted access signage.
 */
function createNoEntrySignTexture() {
  const w = 600;
  const h = 420;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const drawRoundedRect = (rx, ry, rw, rh, rad) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(rx, ry, rw, rh, rad);
    } else {
      ctx.moveTo(rx + rad, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rad);
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rad);
      ctx.arcTo(rx, ry + rh, rx, ry, rad);
      ctx.arcTo(rx, ry, rx + rw, ry, rad);
      ctx.closePath();
    }
  };

  // 1. White Base & Outer Black Rounded Border
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  drawRoundedRect(14, 14, 572, 392, 24);
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 7;
  ctx.stroke();

  // 2. Top Blue Header Box & "AVISO" Title
  drawRoundedRect(28, 28, 544, 118, 14);
  ctx.fillStyle = '#001eff';
  ctx.fill();

  ctx.save();
  ctx.translate(300, 90);
  ctx.scale(1.08, 1.0);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 88px "Arial Black", Impact, Arial, sans-serif';
  ctx.fillText('AVISO', 0, 0);
  ctx.restore();

  // 3. Middle-Left Stacked Text ("ACESSO" / "RESTRITO")
  ctx.fillStyle = '#0a0a0a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 62px "Arial Black", Arial, sans-serif';
  ctx.fillText('ACESSO', 212, 204);
  ctx.fillText('RESTRITO', 212, 282);

  // 4. Middle-Right Prohibition Icon & Front-Facing Standing Silhouette
  // Step A: Front-Facing Standing Person Silhouette (#0a0a0a, drawn BEFORE red ring/slash)
  // Head: Solid black circle at (468, 198), radius = 11.5
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.arc(468, 198, 11.5, 0, Math.PI * 2);
  ctx.fill();

  // Shoulders & Torso: Solid black rounded rectangle from x = 451 to 485 (w = 34), y = 213 to 260 (h = 47, radius = 8)
  drawRoundedRect(451, 213, 34, 47, 8);
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();

  // Arms: Two thick black rounded strokes (lineWidth = 8.5, lineCap = 'round') angled slightly outward
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 8.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(451, 219);
  ctx.lineTo(442, 260);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(485, 219);
  ctx.lineTo(494, 260);
  ctx.stroke();

  // Legs: Two vertical black rounded strokes (lineWidth = 10.5, lineCap = 'round')
  ctx.lineWidth = 10.5;
  ctx.beginPath();
  ctx.moveTo(460, 256);
  ctx.lineTo(460, 300);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(476, 256);
  ctx.lineTo(476, 300);
  ctx.stroke();

  // Step B: Red Prohibition Ring & 45° Diagonal Slash (#ee1111)
  ctx.strokeStyle = '#ee1111';
  ctx.lineWidth = 15;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(468, 244, 68, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(468 - 48, 244 - 48);
  ctx.lineTo(468 + 48, 244 + 48);
  ctx.stroke();

  // 5. Bottom Full-Width Footer Text ("SOMENTE PESSOAS AUTORIZADAS")
  ctx.save();
  ctx.translate(300, 368);
  ctx.scale(0.82, 1.0);
  ctx.fillStyle = '#0a0a0a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 32px "Arial Black", Arial, sans-serif';
  ctx.fillText('SOMENTE PESSOAS AUTORIZADAS', 0, 0, 620);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Brazilian "EXTINTOR" Sign Plaque Texture (400x580).
 * Matches standard Brazilian NBR 13434 / NR-23 safety signage with vivid safety-red background,
 * white rounded border, INDA FIRE vendor stamp, extinguisher silhouette, bold "EXTINTOR" title,
 * downward chevron arrow, and micro certification code.
 */
function createExtinguisherSignTexture() {
  const w = 400;
  const h = 580;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const drawRoundedRect = (rx, ry, rw, rh, rad) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(rx, ry, rw, rh, rad);
    } else {
      ctx.moveTo(rx + rad, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rad);
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rad);
      ctx.arcTo(rx, ry + rh, rx, ry, rad);
      ctx.arcTo(rx, ry, rx + rw, ry, rad);
      ctx.closePath();
    }
  };

  // 1. Rich Safety-Red Plaque Background (#d91108) & Thick White Rounded Inset Border
  ctx.fillStyle = '#d91108';
  ctx.fillRect(0, 0, w, h);

  drawRoundedRect(18, 18, 364, 544, 40);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.stroke();

  // 2. Large White Extinguisher Silhouette (Top-Center: y = 48 to 292, centered at x = 200)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(140, 135);
  ctx.arcTo(140, 96, 185, 96, 40);
  ctx.lineTo(185, 96);
  ctx.lineTo(185, 52);
  ctx.lineTo(215, 52);
  ctx.lineTo(215, 96);
  ctx.arcTo(260, 96, 260, 135, 40);
  ctx.lineTo(260, 292);
  ctx.lineTo(140, 292);
  ctx.closePath();
  ctx.fill();

  // Valve handle extending to the right
  drawRoundedRect(194, 52, 54, 18, 7);
  ctx.fill();

  // Curved hose arching to the left
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 15;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(194, 61);
  ctx.bezierCurveTo(142, 56, 114, 72, 110, 104);
  ctx.stroke();

  // Nozzle tip
  drawRoundedRect(103, 104, 14, 20, 4);
  ctx.fill();

  // 3. Bold White "EXTINTOR" Title (Middle: y = 348)
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 52px Arial, Helvetica, sans-serif';
  ctx.fillText('EXTINTOR', 200, 348);

  // 4. Bold White Downward Arrow (Bottom-Center: y = 398 to 524)
  ctx.beginPath();
  ctx.moveTo(183, 398);
  ctx.lineTo(217, 398);
  ctx.lineTo(217, 452);
  ctx.lineTo(258, 452);
  ctx.lineTo(200, 524);
  ctx.lineTo(142, 452);
  ctx.lineTo(183, 452);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Brazilian Fire Extinguisher Instruction Sticker Texture (256x256).
 * Includes INMETRO certification seal, ABC dry powder header, pictograms for Class A/B (flame)
 * and Class C (electrical spark), usage instructions, and technical maintenance ratings.
 */
function createExtinguisherStickerTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Background - clean white sticker
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size, size);

  // Thin outer label border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(3, 3, size - 6, size - 6);

  // 1. Top INMETRO seal and inspection badge
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(10, 8, 46, 20);
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(10, 8, 46, 20);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 8px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('INMETRO', 33, 18);

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(62, 8, 184, 20);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(62, 8, 184, 20);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 8px Arial, sans-serif';
  ctx.fillText('SELO DE CONFORMIDADE NBR 15808', 154, 18);

  // 2. Red Header Bar
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(8, 32, 240, 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 13px Arial, sans-serif';
  ctx.fillText('EXTINTOR PÓ ABC', 128, 44);

  // 3. Pictogram Boxes (Left: Flame / Classes A&B, Right: Spark / Class C)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(12, 60, 110, 46);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 60, 110, 46);

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(12, 60, 110, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px Arial, sans-serif';
  ctx.fillText('SÓLIDOS E LÍQUIDOS (A B)', 67, 66);

  // Stylized flame pictogram
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(67, 76);
  ctx.bezierCurveTo(60, 82, 54, 92, 60, 98);
  ctx.bezierCurveTo(63, 101, 71, 101, 74, 98);
  ctx.bezierCurveTo(80, 92, 74, 82, 67, 76);
  ctx.closePath();
  ctx.fill();

  // Right: Blue electrical spark box
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(134, 60, 110, 46);
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  ctx.strokeRect(134, 60, 110, 46);

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(134, 60, 110, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px Arial, sans-serif';
  ctx.fillText('EQUIPAMENTOS ELÉTRICOS (C)', 189, 66);

  // Stylized electrical lightning spark pictogram
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.moveTo(193, 76);
  ctx.lineTo(183, 89);
  ctx.lineTo(189, 89);
  ctx.lineTo(185, 100);
  ctx.lineTo(195, 87);
  ctx.lineTo(189, 87);
  ctx.closePath();
  ctx.fill();

  // 4. Instructions
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.font = 'bold 9px Arial, sans-serif';
  ctx.fillText('INSTRUÇÕES DE USO:', 14, 120);

  ctx.font = 'bold 8.5px Arial, sans-serif';
  ctx.fillText('1. PUXE A TRAVA E O LACRE PLÁSTICO', 16, 136);
  ctx.fillText('2. APONTE A MANGUEIRA PARA A BASE DO FOGO', 16, 152);
  ctx.fillText('3. APERTE O GATILHO E FAÇA MOVIMENTOS EM LEQUE', 16, 168);

  // Technical Specs Box
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(12, 182, 232, 64);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 182, 232, 64);

  ctx.fillStyle = '#334155';
  ctx.font = '7.5px Arial, sans-serif';
  ctx.fillText('AGENTE EXTINTOR: PÓ QUÍMICO SECO ABC 55%', 16, 196);
  ctx.fillText('CAPACIDADE: 4 KG  |  PRESSÃO DE TRABALHO: 1.0 MPa', 16, 209);
  ctx.fillText('TEMPERATURA DE OPERAÇÃO: -10°C A +50°C', 16, 222);
  ctx.fillText('VALIDADE DA CARGA: 1 ANO  |  TESTE HIDROSTÁTICO: 5 ANOS', 16, 235);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Extinguisher Pressure Gauge (Manometer) Texture (64x64).
 * Front dial displaying red/green/red pressure zones with vertical needle.
 */
function createExtinguisherGaugeTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = 26;

  // Background white dial
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Chrome outer rim
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Left red arc (0 to 10 bar)
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5, Math.PI * 0.85, Math.PI * 1.30);
  ctx.stroke();

  // Center green arc (10 to 14 bar - operational range)
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5, Math.PI * 1.30, Math.PI * 1.70);
  ctx.stroke();

  // Right red arc (14 to 20 bar)
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5, Math.PI * 1.70, Math.PI * 2.15);
  ctx.stroke();

  // Black needle pointing straight up into green zone
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - 17);
  ctx.stroke();

  // Center pivot pin
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural ISO 7010 / Brazilian Standard Emergency Running-Man Exit Sign Textures (512x256).
 * Produces crisp Diffuse Map and Emissive Map featuring a white running person exiting a doorway
 * with a bold directional arrow (->) on an emerald green (#007a3d) background.
 */
/**
 * Procedural Front Panel Texture for the Enterprise Multifunction Printer (512x256).
 * Features clean off-white corporate casing (#ebedf2), prominent centered dark-gray metallic "EPSON" lettering,
 * "WorkForce Enterprise" sub-badge, and bottom-right PrecisionCore / Heat-Free Technology badge.
 */
function createPrinterBadgeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Matte corporate tech casing base (toned down to prevent any glowing)
  ctx.fillStyle = '#98a0ab';
  ctx.fillRect(0, 0, 512, 256);

  // Subtle vertical panel seam on left side (x = 32)
  ctx.fillStyle = '#7c838e';
  ctx.fillRect(32, 0, 3, 256);
  ctx.fillStyle = '#1e2229';
  ctx.fillRect(33, 0, 1, 256);

  // Subtle horizontal divide seam near bottom (y = 210)
  ctx.fillStyle = '#7c838e';
  ctx.fillRect(0, 210, 512, 2);
  ctx.fillStyle = '#1e2229';
  ctx.fillRect(0, 211, 512, 1);

  // Centered PRINTER metallic logo (generic branding to avoid copyright issues)
  ctx.fillStyle = '#1a1d22';
  ctx.font = 'bold 42px "Arial Black", "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRINTER', 268, 92);

  // Subtle 1px metallic highlight above letters
  ctx.fillStyle = '#d1d5db';
  ctx.font = 'bold 42px "Arial Black", "Segoe UI", Arial, sans-serif';
  ctx.fillText('PRINTER', 268, 91);

  // Subtitle "Enterprise Series"
  ctx.fillStyle = '#2d3748';
  ctx.font = '600 15px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Enterprise Series', 268, 128);

  // Enterprise Technology Badge in bottom-right corner
  const bx = 348;
  const by = 160;
  const bw = 138;
  const bh = 38;
  const br = 6;

  // Dark navy badge backing
  ctx.fillStyle = '#0a1020';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, br);
  ctx.fill();

  // Cyan top accent line
  ctx.fillStyle = '#00a0e9';
  ctx.fillRect(bx + 4, by + 2, bw - 8, 3);

  // Color ink droplet dots (Cyan, Magenta, Yellow)
  const dots = ['#00a0e9', '#e4007f', '#ffed00'];
  for (let i = 0; i < dots.length; i++) {
    ctx.fillStyle = dots[i];
    ctx.beginPath();
    ctx.arc(bx + 16 + i * 11, by + 21, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Badge text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('INKJET TECH', bx + 54, by + 18);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 8px "Segoe UI", Arial, sans-serif';
  ctx.fillText('ENTERPRISE CORE', bx + 54, by + 29);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * Procedural Articulated Touchscreen UI Texture for the Enterprise Multifunction Printer (512x320).
 * Replicates the authentic Epson WorkForce Enterprise touchscreen UI (media_1794021878159_397ab72c.jpg):
 * - Top Status Bar (#22262b) with Home icon, time, and toner status
 * - Main Bright Workspace (#f8fafc) with 3x4 grid of royal-blue square app tiles (#2470c6)
 * - Bottom Footer Bar (#22262b) with "Job/Status" pill button
 */
function createPrinterTouchscreenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');

  // 1. Top Status Bar (height: 36px)
  ctx.fillStyle = '#22262b';
  ctx.fillRect(0, 0, 512, 36);

  // Left: Home icon + "Home"
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(18, 20);
  ctx.lineTo(26, 12);
  ctx.lineTo(34, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(20, 20, 12, 9);
  ctx.clearRect(24, 23, 4, 6);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Home', 40, 19);

  // Right status icons: CMYK toner levels, LAN signal, clock
  const tonerColors = ['#00a0e9', '#e4007f', '#ffed00', '#111111'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#475569';
    ctx.fillRect(340 + i * 14, 11, 10, 16);
    ctx.fillStyle = tonerColors[i];
    ctx.fillRect(341 + i * 14, 13, 8, 12);
  }

  // Network bars
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(406 + i * 5, 24 - (i + 1) * 3, 3.5, (i + 1) * 3);
  }

  // Clock
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('14:28', 496, 19);

  // 2. Main White Workspace (y = 36 to 270)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 36, 512, 234);

  // 3x4 Grid of Royal-Blue Square Tiles
  const tiles = [
    // Row 0
    { col: 0, row: 0, label: 'Copy', icon: 'copy' },
    { col: 1, row: 0, label: 'Scan', icon: 'scan' },
    { col: 2, row: 0, label: 'Fax', icon: 'fax' },
    { col: 3, row: 0, label: 'Preset', icon: 'preset' },
    // Row 1
    { col: 0, row: 1, label: 'Storage', icon: 'storage' },
    { col: 1, row: 1, label: 'Fax Box', icon: 'faxbox' },
    { col: 2, row: 1, label: 'Print Stored', icon: 'print' },
    { col: 3, row: 1, label: 'Quick Dial', icon: 'dial' },
    // Row 2
    { col: 0, row: 2, label: 'Auto Cleaning', icon: 'clean' },
    { col: 1, row: 2, label: 'Settings', icon: 'settings' }
  ];

  const tileW = 104;
  const tileH = 64;
  const startX = 22;
  const startY = 48;
  const gapX = 18;
  const gapY = 12;

  for (const t of tiles) {
    const tx = startX + t.col * (tileW + gapX);
    const ty = startY + t.row * (tileH + gapY);

    // Blue tile background with subtle gradient
    const grad = ctx.createLinearGradient(tx, ty, tx, ty + tileH);
    grad.addColorStop(0, '#297ad6');
    grad.addColorStop(1, '#1e64b8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tileW, tileH, 8);
    ctx.fill();

    // Top subtle highlight edge
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tx + 1, ty + 1, tileW - 2, tileH - 2, 7);
    ctx.stroke();

    // Icon glyph (drawn vector in white)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    const cx = tx + tileW / 2;
    const cy = ty + 24;

    if (t.icon === 'copy') {
      ctx.strokeRect(cx - 10, cy - 10, 14, 16);
      ctx.fillRect(cx - 6, cy - 6, 14, 16);
      ctx.fillStyle = '#1e64b8';
      ctx.fillRect(cx - 3, cy - 2, 8, 2);
      ctx.fillRect(cx - 3, cy + 2, 8, 2);
    } else if (t.icon === 'scan') {
      ctx.strokeRect(cx - 12, cy - 4, 24, 12);
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy - 4);
      ctx.lineTo(cx + 8, cy - 14);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - 8, cy - 1, 16, 2);
    } else if (t.icon === 'fax') {
      ctx.strokeRect(cx - 5, cy - 10, 14, 16);
      ctx.beginPath();
      ctx.arc(cx - 7, cy + 2, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.icon === 'preset') {
      ctx.strokeRect(cx - 10, cy - 9, 14, 16);
      ctx.fillStyle = '#ffed00';
      ctx.beginPath();
      ctx.arc(cx + 4, cy + 3, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.icon === 'storage') {
      ctx.strokeRect(cx - 12, cy - 8, 24, 16);
      ctx.fillRect(cx - 5, cy - 2, 10, 3);
    } else if (t.icon === 'faxbox') {
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy + 4);
      ctx.lineTo(cx - 6, cy + 10);
      ctx.lineTo(cx + 6, cy + 10);
      ctx.lineTo(cx + 12, cy + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 9);
      ctx.lineTo(cx, cy + 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 2);
      ctx.lineTo(cx, cy + 3);
      ctx.lineTo(cx + 4, cy - 2);
      ctx.stroke();
    } else if (t.icon === 'print') {
      ctx.strokeRect(cx - 11, cy - 4, 22, 10);
      ctx.fillRect(cx - 7, cy - 10, 14, 6);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - 7, cy + 6, 14, 5);
    } else if (t.icon === 'dial') {
      ctx.strokeRect(cx - 11, cy - 9, 22, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 7, cy - 4, 5, 5);
      ctx.fillRect(cx + 1, cy - 4, 7, 2);
      ctx.fillRect(cx + 1, cy - 1, 7, 2);
    } else if (t.icon === 'clean') {
      ctx.fillRect(cx - 8, cy - 8, 16, 7);
      ctx.fillStyle = '#38bdf8';
      for (let s = -2; s <= 2; s++) {
        ctx.beginPath();
        ctx.arc(cx + s * 4, cy + 4 + Math.abs(s) * 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (t.icon === 'settings') {
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.stroke();
      for (let g = 0; g < 6; g++) {
        const ga = (g * Math.PI) / 3;
        ctx.fillRect(cx + Math.cos(ga) * 7 - 1.5, cy + Math.sin(ga) * 7 - 1.5, 3, 3);
      }
    }

    // Label underneath
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.label, cx, ty + 49);
  }

  // 3. Bottom Footer Bar (y = 270 to 320, height: 50px)
  ctx.fillStyle = '#22262b';
  ctx.fillRect(0, 270, 512, 50);

  // Left pill button "Job/Status"
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(18, 279, 134, 32, 16);
  ctx.fill();

  // Active green status dot
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(36, 295, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Job / Status', 48, 295);

  // Pagination indicator in center
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(248, 295, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(264, 295, 3.5, 0, Math.PI * 2);
  ctx.stroke();

  // Right date
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('2026-11-07', 496, 295);

  // Outer side edge strips in matching bezel charcoal (#22262b)
  ctx.fillStyle = '#22262b';
  ctx.fillRect(0, 0, 2, 320);
  ctx.fillRect(510, 0, 2, 320);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

function createRunningManExitSignTextures() {
  const w = 1024;
  const h = 512;
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = w;
  diffCanvas.height = h;
  const ctx = diffCanvas.getContext('2d');

  const emCanvas = document.createElement('canvas');
  emCanvas.width = w;
  emCanvas.height = h;
  const eCtx = emCanvas.getContext('2d');

  const drawRoundedRect = (c, x, y, width, height, radius) => {
    c.beginPath();
    c.moveTo(x + radius, y);
    c.lineTo(x + width - radius, y);
    c.quadraticCurveTo(x + width, y, x + width, y + radius);
    c.lineTo(x + width, y + height - radius);
    c.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    c.lineTo(x + radius, y + height);
    c.quadraticCurveTo(x, y + height, x, y + height - radius);
    c.lineTo(x, y + radius);
    c.quadraticCurveTo(x, y, x + radius, y);
    c.closePath();
  };

  const drawExitSign = (c, isEmissive) => {
    const greenColor = isEmissive ? '#005c25' : '#007934';
    const whiteColor = isEmissive ? '#eef8f2' : '#ffffff';

    // 1. Crisp White Outer Sign Border
    c.fillStyle = whiteColor;
    c.fillRect(0, 0, w, h);

    // 2. Deep Safety-Green Rounded Field (inset 14px, 16px corner radius)
    c.fillStyle = greenColor;
    drawRoundedRect(c, 14, 14, w - 28, h - 28, 16);
    c.fill();

    // 3. Left Graphic: Solid White Doorway with 45° Perspective Threshold Extension
    c.fillStyle = whiteColor;
    c.beginPath();
    c.moveTo(132, 60);
    c.lineTo(398, 60);
    c.lineTo(398, 414);
    c.lineTo(362, 450);
    c.lineTo(96, 450);
    c.lineTo(132, 414);
    c.closePath();
    c.fill();

    // White outline extension on the left of the doorway where the runner's rear foot kicks out
    c.beginPath();
    c.moveTo(133, 311);
    c.lineTo(106, 311);
    c.lineTo(86, 362);
    c.lineTo(133, 362);
    c.closePath();
    c.fill();

    // 4. Green Running Man Silhouette (Running RIGHT toward the arrow)
    c.fillStyle = greenColor;

    // Circular Head
    c.beginPath();
    c.arc(314, 114, 33, 0, Math.PI * 2);
    c.fill();

    // Connected Torso, Arms, Front Leg, and Rear Kicking Leg
    c.beginPath();
    // Rear (left) upper arm + shoulder top edge
    c.moveTo(180, 160);
    c.lineTo(298, 160);
    // Front (right) arm angling down-right to elbow and horizontally to right doorway edge
    c.lineTo(352, 204);
    c.lineTo(400, 204);
    c.lineTo(400, 232);
    c.lineTo(340, 232);
    c.lineTo(290, 190);
    // Chest angling down-left to hip, then straight down-right along front leg to toe
    c.lineTo(262, 248);
    c.lineTo(360, 412);
    // Flat horizontal sole of front foot
    c.lineTo(318, 412);
    // Back edge of front leg up-left to crotch
    c.lineTo(234, 268);
    // Back of rear thigh down-left to lower knee corner
    c.lineTo(224, 354);
    // Bottom of horizontal rear calf/foot kicking left outside doorway
    c.lineTo(96, 354);
    // Angled rear foot tip going up-right
    c.lineTo(112, 319);
    // Top of rear calf going right to inner knee bend
    c.lineTo(192, 319);
    // Front of rear thigh + back of torso going up-right to left armpit
    c.lineTo(202, 244);
    c.lineTo(236, 190);
    // Under rear upper arm to inner elbow
    c.lineTo(196, 190);
    // Inner rear forearm down-left to hand
    c.lineTo(175, 231);
    // Rounded rear hand cap & outer rear forearm back to (180, 160)
    c.arc(162, 224, 15, 0.48, Math.PI + 0.48, false);
    c.closePath();
    c.fill();

    // Green 45° Perspective Floor Shadow Under Front Foot (separated by white gap line y=412..419)
    c.beginPath();
    c.moveTo(316, 419);
    c.lineTo(358, 419);
    c.lineTo(324, 451);
    c.lineTo(282, 451);
    c.closePath();
    c.fill();

    // 5. Right Graphic: Bold White Right-Pointing Directional Arrow (->)
    c.fillStyle = whiteColor;
    c.beginPath();
    c.moveTo(600, 223);
    c.lineTo(792, 223);
    c.lineTo(736, 146);
    c.lineTo(804, 146);
    c.lineTo(914, 256);
    c.lineTo(804, 366);
    c.lineTo(736, 366);
    c.lineTo(792, 289);
    c.lineTo(600, 289);
    c.closePath();
    c.fill();
  };

  drawExitSign(ctx, false);
  drawExitSign(eCtx, true);

  const diffuse = new THREE.CanvasTexture(diffCanvas);
  diffuse.colorSpace = THREE.SRGBColorSpace;
  diffuse.anisotropy = 8;
  const emissive = new THREE.CanvasTexture(emCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.anisotropy = 8;
  return { diffuse, emissive };
}

/**
 * Procedural Inscribed Safety-Red Lettering Texture for Fire Hose Cabinet (1024x256).
 * Features a 100% transparent background with bold safety-red uppercase lettering
 * split into "INCÊ" on the left door leaf and "NDIO" on the right door leaf,
 * so the inscription is printed directly on the cabinet metal and respects the physical door seam.
 */
function createFireHoseHeaderTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // 100% transparent background - text is inscribed directly on the cabinet inox metal
  ctx.clearRect(0, 0, 1024, 256);

  // Large, bold, industrial typeface
  ctx.font = '900 135px "Arial Black", Impact, "Segoe UI Black", sans-serif';
  ctx.textBaseline = 'middle';

  const drawInscribedWord = (word, x, align) => {
    ctx.textAlign = align;

    // 1. Subtle drop shadow for stamped/engraved depth into the metal
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#b71212';
    ctx.fillText(word, x, 128);

    // Reset shadow
    ctx.shadowColor = 'transparent';

    // 2. Subtle top-edge light highlight for embossed metal stamp look
    ctx.fillStyle = 'rgba(255, 180, 180, 0.45)';
    ctx.fillText(word, x, 126);

    // 3. Crisp safety-red face
    ctx.fillStyle = '#d81313';
    ctx.fillText(word, x, 128);
  };

  // Left half (x = 0 to 512): "INCÊ" right-aligned toward center seam (x = 490)
  drawInscribedWord('INCÊ', 490, 'right');

  // Right half (x = 512 to 1024): "NDIO" left-aligned toward center seam (x = 534)
  drawInscribedWord('NDIO', 534, 'left');

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/**
 * Procedural Multi-Layer Coiled Fire Hose Texture (512x512).
 * Draws 14 tightly wound concentric layers of off-white woven canvas fire hose (#f1f3f5 to #dcdfe4)
 * separated by dark spiral shadow grooves (#4b525c) and subtle diagonal fabric weave lines,
 * plus a dark hollow center hub.
 */
function createFireHoseCoilTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const cx = 256;
  const cy = 256;

  // Background: clean off-white woven canvas
  ctx.fillStyle = '#e8ebed';
  ctx.fillRect(0, 0, 512, 512);

  // 14 concentric woven hose layers
  const innerR = 48;
  const outerR = 250;
  const totalLayers = 14;
  const dr = (outerR - innerR) / totalLayers; // ~14.43px per layer

  const layerColors = [
    '#f5f6f8', '#eceef1', '#e2e5e9', '#f2f4f6', '#e9ecf0',
    '#dfdfe4', '#f6f7f9', '#edeff2', '#e4e6eb', '#f1f3f6',
    '#e7eaee', '#dcdee3', '#f3f5f8', '#ebedf2'
  ];

  for (let i = 0; i < totalLayers; i++) {
    const r0 = innerR + i * dr;
    const r1 = innerR + (i + 1) * dr;
    const midR = (r0 + r1) * 0.5;

    // Fill ring layer
    ctx.fillStyle = layerColors[i % layerColors.length];
    ctx.beginPath();
    ctx.arc(cx, cy, r1, 0, Math.PI * 2);
    ctx.arc(cx, cy, r0, Math.PI * 2, 0, true);
    ctx.fill();

    // Subtle diagonal fabric weave lines across layer
    const numTicks = Math.floor(midR * 1.6);
    const dTheta = (Math.PI * 2) / numTicks;
    for (let t = 0; t < numTicks; t++) {
      const th = t * dTheta;
      const x0 = cx + Math.cos(th) * (r0 + 1);
      const y0 = cy + Math.sin(th) * (r0 + 1);
      const x1 = cx + Math.cos(th + 0.04) * (r1 - 1);
      const y1 = cy + Math.sin(th + 0.04) * (r1 - 1);

      ctx.strokeStyle = (t % 2 === 0) ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Dark shadow groove separating layers
    ctx.strokeStyle = '#4b525c';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(cx, cy, r0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner 1px light highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(cx, cy, r0 + 1.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Outer groove rim
  ctx.strokeStyle = '#383e48';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.stroke();

  // Center hub hole (r < 44)
  ctx.fillStyle = '#1e2227';
  ctx.beginPath();
  ctx.arc(cx, cy, innerR - 4, 0, Math.PI * 2);
  ctx.fill();

  // Chrome hub ring rim (44 to 48)
  ctx.fillStyle = '#8a929e';
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.arc(cx, cy, innerR - 4, Math.PI * 2, 0, true);
  ctx.fill();

  ctx.strokeStyle = '#d4dae2';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

/**
 * Procedural Soft Anti-Aliased Circular Alpha Texture for Stars (16x16).
 * Ensures WebGL points render as smooth tiny round circles rather than harsh square pixels.
 */
function createStarPointTexture() {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(8, 8, 8, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Procedural Photorealistic Moon Texture (512x512).
 * Replicates high-resolution lunar astrophotography:
 * - 100% transparent background with ZERO outer blur halo outside r = 210px.
 * - Crisp lunar disc clipped at (cx = 256, cy = 256, r = 210px).
 * - Bright, unmistakable sunlit lunar disc (#f8fafc to #e2e8f0).
 * - Crisp, high-contrast dark slate lunar mare seas (#475569, #64748b, #94a3b8).
 * - Micro impact craters with sharp sunlit rims and shadow depths.
 * - Realistic angled crescent/gibbous terminator shadow across the upper-left (#070a10).
 * - Delicate edge rim highlight along the illuminated lower-right limb.
 */
function createMoonTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const moonR = 210;

  // Crisp Lunar Disc (strictly clipped to r = 210px so outside remains 100% transparent)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, moonR, 0, Math.PI * 2);
  ctx.clip();

  // 1. Bright Sunlit Lunar Surface Base (#f8fafc to #e2e8f0)
  const surfaceGrad = ctx.createRadialGradient(cx + 70, cy + 70, 50, cx, cy, moonR);
  surfaceGrad.addColorStop(0.00, '#f8fafc');
  surfaceGrad.addColorStop(0.40, '#f1f5f9');
  surfaceGrad.addColorStop(0.75, '#e2e8f0');
  surfaceGrad.addColorStop(1.00, '#cbd5e1');
  ctx.fillStyle = surfaceGrad;
  ctx.fillRect(cx - moonR, cy - moonR, moonR * 2, moonR * 2);

  // 2. Overlapping Dark Slate Lunar Maria Seas (#475569, #64748b, #94a3b8)
  const maria = [
    { x: cx - 45, y: cy - 60, r: 72, col: 'rgba(71, 85, 105, 0.85)' },  // Mare Imbrium
    { x: cx + 30, y: cy - 70, r: 58, col: 'rgba(100, 116, 139, 0.80)' }, // Mare Serenitatis
    { x: cx - 80, y: cy - 16, r: 66, col: 'rgba(51, 65, 85, 0.82)' },   // Oceanus Procellarum upper
    { x: cx - 30, y: cy + 18, r: 82, col: 'rgba(71, 85, 105, 0.78)' },  // Mare Nubium
    { x: cx + 55, y: cy - 28, r: 46, col: 'rgba(100, 116, 139, 0.76)' }, // Mare Tranquillitatis
    { x: cx - 88, y: cy + 54, r: 55, col: 'rgba(51, 65, 85, 0.80)' },   // Oceanus Procellarum lower
    { x: cx + 10, y: cy + 80, r: 62, col: 'rgba(71, 85, 105, 0.75)' },  // Mare Humorum / South
    { x: cx + 72, y: cy + 45, r: 48, col: 'rgba(100, 116, 139, 0.72)' }, // Mare Fecunditatis
    { x: cx + 95, y: cy - 50, r: 35, col: 'rgba(71, 85, 105, 0.88)' },  // Mare Crisium
  ];
  for (let m = 0; m < maria.length; m++) {
    const item = maria[m];
    const mg = ctx.createRadialGradient(item.x, item.y, 6, item.x, item.y, item.r);
    mg.addColorStop(0.00, item.col);
    mg.addColorStop(0.70, item.col.replace(/[\d\.]+\)$/, '0.45)'));
    mg.addColorStop(1.00, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Small Impact Craters with Sunlit Rims & Shadow Depths
  let cSeed = 19690720;
  const cRand = () => {
    cSeed = (cSeed * 1664525 + 1013904223) % 4294967296;
    return cSeed / 4294967296;
  };

  for (let i = 0; i < 90; i++) {
    const ang = cRand() * Math.PI * 2;
    const dist = cRand() * (moonR - 15);
    const crX = cx + Math.cos(ang) * dist;
    const crY = cy + Math.sin(ang) * dist;
    const crR = 3.0 + cRand() * 9.0;

    // Dark crater floor
    ctx.fillStyle = 'rgba(30, 41, 59, 0.75)';
    ctx.beginPath();
    ctx.arc(crX, crY, crR, 0, Math.PI * 2);
    ctx.fill();

    // Sunlit crater rim highlight (lower-right, facing sun)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(crX, crY, crR, -Math.PI * 0.15, Math.PI * 0.75);
    ctx.stroke();

    // Shadow on opposing rim (upper-left)
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(crX, crY, crR, Math.PI * 0.85, Math.PI * 1.75);
    ctx.stroke();
  }

  // 4. Realistic Angled Crescent/Gibbous Terminator Shadow (#070a10)
  const termGrad = ctx.createLinearGradient(cx - 170, cy - 170, cx + 100, cy + 100);
  termGrad.addColorStop(0.00, '#070a10'); // Deep pitch-black lunar night
  termGrad.addColorStop(0.38, '#070a10'); // Solid shadow
  termGrad.addColorStop(0.52, 'rgba(15, 23, 42, 0.82)'); // Terminator threshold
  termGrad.addColorStop(0.66, 'rgba(30, 41, 59, 0.38)'); // Penumbra
  termGrad.addColorStop(0.80, 'rgba(0, 0, 0, 0.05)');
  termGrad.addColorStop(1.00, 'rgba(0, 0, 0, 0)');      // Bright daylight
  ctx.fillStyle = termGrad;
  ctx.fillRect(cx - moonR, cy - moonR, moonR * 2, moonR * 2);

  // 5. Delicate Edge Rim Highlight on Sunlit Lower-Right Limb
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, moonR - 0.75, -Math.PI * 0.1, Math.PI * 0.65);
  ctx.stroke();

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Procedural Seamless High-Density Epoxy Flake / Granite Terrazzo Balcony Floor Texture (1024x1024).
 * Replicates luxury high-rise outdoor aggregate balcony coatings (Granite / Domino / Terrazzo flake blend):
 * - Seamless 100% toroidal edge wrapping (zero tiling seams, zero grid grout lines).
 * - Multi-tier dense aggregate chip distribution:
 *   1. Fine micro-stipple stone matrix (14,000+ tiny 1-2px mineral specks).
 *   2. Medium irregular broadcast flakes (8,500+ 3-5px angular chips: bright white, slate, charcoal, black, warm sandstone).
 *   3. Large hero granite flakes (1,800+ 5-8px distinctive angular chips with irregular polygon edges).
 * - Returns { map, bumpMap } with matching high-resolution tactile aggregate relief.
 */
function createGraniteFlakeFloorTexture() {
  const size = 1024;

  // 1. Diffuse Color Canvas
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 2. Normal / Bump Canvas (tactile 3D relief for individual aggregate chips)
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d');

  // Base stone grey resin matrix
  ctx.fillStyle = '#656b74';
  ctx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, size, size);

  // Subtle natural undercoat resin mottling (soft organic cloudy variation)
  let seed = 8675309;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < 48; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const cr = 60 + rand() * 120;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    const bright = (rand() - 0.5) * 16;
    const rTone = Math.floor(101 + bright);
    const gTone = Math.floor(107 + bright);
    const bTone = Math.floor(116 + bright);
    grad.addColorStop(0, `rgba(${rTone}, ${gTone}, ${bTone}, 0.25)`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Helper: draw irregular polygon flake with 100% seamless toroidal edge wrapping
  const drawFlake = (cx, cy, r, color, bumpTone, sides = 5) => {
    const offsetsX = cx - r < 0 ? [0, size] : (cx + r > size ? [0, -size] : [0]);
    const offsetsY = cy - r < 0 ? [0, size] : (cy + r > size ? [0, -size] : [0]);

    for (const ox of offsetsX) {
      for (const oy of offsetsY) {
        const x = cx + ox;
        const y = cy + oy;

        ctx.fillStyle = color;
        ctx.beginPath();
        bumpCtx.fillStyle = bumpTone;
        bumpCtx.beginPath();

        for (let j = 0; j < sides; j++) {
          const ang = (j * Math.PI * 2) / sides;
          const rad = r * (0.68 + rand() * 0.64);
          const px = x + Math.cos(ang) * rad;
          const py = y + Math.sin(ang) * rad;
          if (j === 0) {
            ctx.moveTo(px, py);
            bumpCtx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
            bumpCtx.lineTo(px, py);
          }
        }
        ctx.closePath();
        ctx.fill();

        bumpCtx.closePath();
        bumpCtx.fill();
      }
    }
  };

  // Color palettes matching the reference photos (Granite/Domino aggregate blend)
  const whiteFlakes = ['#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0'];
  const darkFlakes = ['#111419', '#1a1f26', '#262d36', '#333b47'];
  const slateFlakes = ['#828a96', '#98a1ad', '#b0b8c3', '#c5cdd6'];
  const warmFlakes = ['#c8bcaf', '#b4a697', '#dfd5ca', '#a19383'];

  // Layer 1: Fine mineral micro-stipple (14,000 tiny aggregate sand grains, radius 0.8 to 1.6px)
  for (let i = 0; i < 14000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.8 + rand() * 0.8;
    const roll = rand();
    let col, bump;
    if (roll < 0.32) {
      col = whiteFlakes[Math.floor(rand() * whiteFlakes.length)];
      bump = '#969696';
    } else if (roll < 0.65) {
      col = darkFlakes[Math.floor(rand() * darkFlakes.length)];
      bump = '#6c6c6c';
    } else if (roll < 0.88) {
      col = slateFlakes[Math.floor(rand() * slateFlakes.length)];
      bump = '#888888';
    } else {
      col = warmFlakes[Math.floor(rand() * warmFlakes.length)];
      bump = '#8c8c8c';
    }
    drawFlake(x, y, r, col, bump, 3 + Math.floor(rand() * 2));
  }

  // Layer 2: Medium broadcast flakes (8,500 irregular 4-6 sided flakes, radius 2.2 to 4.5px)
  for (let i = 0; i < 8500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 2.2 + rand() * 2.3;
    const roll = rand();
    let col, bump;
    if (roll < 0.34) {
      col = whiteFlakes[Math.floor(rand() * whiteFlakes.length)];
      bump = '#a6a6a6';
    } else if (roll < 0.68) {
      col = darkFlakes[Math.floor(rand() * darkFlakes.length)];
      bump = '#5e5e5e';
    } else if (roll < 0.88) {
      col = slateFlakes[Math.floor(rand() * slateFlakes.length)];
      bump = '#8a8a8a';
    } else {
      col = warmFlakes[Math.floor(rand() * warmFlakes.length)];
      bump = '#909090';
    }
    drawFlake(x, y, r, col, bump, 4 + Math.floor(rand() * 3));
  }

  // Layer 3: Large hero granite flakes (1,800 distinctive angular chips, radius 4.5 to 7.8px)
  for (let i = 0; i < 1800; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 4.5 + rand() * 3.3;
    const roll = rand();
    let col, bump;
    if (roll < 0.40) {
      col = whiteFlakes[Math.floor(rand() * whiteFlakes.length)];
      bump = '#b8b8b8';
    } else if (roll < 0.75) {
      col = darkFlakes[Math.floor(rand() * darkFlakes.length)];
      bump = '#545454';
    } else if (roll < 0.90) {
      col = slateFlakes[Math.floor(rand() * slateFlakes.length)];
      bump = '#8e8e8e';
    } else {
      col = warmFlakes[Math.floor(rand() * warmFlakes.length)];
      bump = '#989898';
    }
    drawFlake(x, y, r, col, bump, 5 + Math.floor(rand() * 3));
  }

  // Create Three.js textures
  const mapTexture = new THREE.CanvasTexture(canvas);
  mapTexture.wrapS = THREE.RepeatWrapping;
  mapTexture.wrapT = THREE.RepeatWrapping;
  mapTexture.repeat.set(9.0, 3.0);
  mapTexture.colorSpace = THREE.SRGBColorSpace;
  mapTexture.anisotropy = 16;

  const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS = THREE.RepeatWrapping;
  bumpTexture.wrapT = THREE.RepeatWrapping;
  bumpTexture.repeat.set(9.0, 3.0);
  bumpTexture.anisotropy = 16;

  return { map: mapTexture, bumpMap: bumpTexture };
}

/**
 * Procedural Photorealistic High-Density Skyscraper Facade Textures (1024x2048 each).
 * Returns { facadeA, facadeB, facadeC, facadeDiagrid }:
 * - 36 to 44 window columns across width, 80 to 88 floors vertically.
 * - Tiny realistic window scale: ~12px to 16px individual panes, 4px dark mullions, 9px spandrels (#050811).
 * - Real office lighting: horizontal runs of 4 to 14 consecutive lit windows (active suites) with vertical ceiling glow gradient.
 * - Solid dark vertical corner piers (24px wide #04070e) and periodic mechanical floors.
 * - Facade Diagrid: ONLY ONE refined, slender landmark diagrid with crisp 3px architectural gold diagrid lines.
 */
function createSkyscraperFacadeTextures() {
  const w = 512;
  const h = 1024;

  const createRng = (initSeed) => {
    let s = initSeed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  };

  const setupFacadeTexture = (canvas) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
  };

  // Helper to draw realistic high-density micro-windows on a canvas
  const drawBaseTower = (ctx, rng, config) => {
    const {
      numCols = 40,
      numFloors = 84,
      spandrelH = 9,
      mullionW = 4,
      cornerPierW = 24,
      activeFloorChance = 0.55,
      warmPalette = ['#ffe8b8', '#ffbe66', '#f59e0b', '#ffd180'],
      coolPalette = ['#e0f4ff', '#93c5fd', '#38bdf8', '#bae6fd'],
      dimColor = '#1e3a5f',
      darkColor = '#060b14',
      spandrelColor = '#050811'
    } = config;

    // Deep architectural background
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, w, h);

    const innerW = w - cornerPierW * 2;
    const colStep = innerW / numCols;
    const floorStep = h / numFloors;
    const winW = colStep - mullionW;
    const winH = floorStep - spandrelH;

    for (let f = 0; f < numFloors; f++) {
      const fy = f * floorStep;
      const isMechFloor = f % 18 === 17;

      if (isMechFloor) {
        // Dark mechanical louvers floor
        ctx.fillStyle = '#030509';
        ctx.fillRect(0, fy, w, floorStep);
        ctx.fillStyle = '#080d16';
        for (let ly = fy + 3; ly < fy + floorStep - 2; ly += 4) {
          ctx.fillRect(cornerPierW, ly, innerW, 2);
        }
        continue;
      }

      // Horizontal concrete/steel spandrel band (#050811)
      ctx.fillStyle = spandrelColor;
      ctx.fillRect(0, fy + winH, w, spandrelH);
      // Subtle 1px floor dividing seam
      ctx.fillStyle = '#0b111e';
      ctx.fillRect(0, fy + winH + spandrelH - 1, w, 1);

      // Determine office suites on this floor: horizontal runs of 4 to 14 lit windows
      const isFloorActive = rng() < activeFloorChance;
      let litRunRemaining = 0;
      let suitePalette = warmPalette;
      let isSuiteWarm = true;

      for (let c = 0; c < numCols; c++) {
        const bx = cornerPierW + c * colStep;
        const winX = bx + mullionW / 2;
        const winY = fy + 1;

        if (isFloorActive) {
          if (litRunRemaining <= 0) {
            if (rng() < 0.45) {
              litRunRemaining = Math.floor(4 + rng() * 11); // 4 to 14 consecutive windows
              isSuiteWarm = rng() > 0.40;
              suitePalette = isSuiteWarm ? warmPalette : coolPalette;
            } else {
              litRunRemaining = -Math.floor(2 + rng() * 6);
            }
          }
        }

        const isLit = isFloorActive && litRunRemaining > 0;
        if (litRunRemaining > 0) litRunRemaining--;
        else if (litRunRemaining < 0) litRunRemaining++;

        if (isLit) {
          // Lit office window with subtle vertical gradient (brighter ceiling light)
          const baseCol = suitePalette[Math.floor(rng() * suitePalette.length)];
          ctx.fillStyle = baseCol;
          ctx.fillRect(winX, winY, winW, winH);

          // Top ceiling light fixture glow
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.fillRect(winX, winY, winW, Math.max(2, winH * 0.25));

          // Occasional micro venetian-blind lines or partition silhouette
          if (rng() < 0.35) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            ctx.fillRect(winX, winY + winH * 0.55, winW, 1.5);
          }
        } else {
          // Dark after-hours window with subtle night reflection
          ctx.fillStyle = rng() < 0.15 ? dimColor : darkColor;
          ctx.fillRect(winX, winY, winW, winH);
        }

        // Dark vertical mullion
        ctx.fillStyle = '#04070e';
        ctx.fillRect(bx, fy, mullionW, floorStep);
      }
    }

    // Solid dark vertical corner piers (#04070e)
    ctx.fillStyle = '#04070e';
    ctx.fillRect(0, 0, cornerPierW, h);
    ctx.fillRect(w - cornerPierW, 0, cornerPierW, h);
    // Subtle inner pier highlight
    ctx.fillStyle = '#0c1322';
    ctx.fillRect(cornerPierW - 2, 0, 2, h);
    ctx.fillRect(w - cornerPierW, 0, 2, h);
  };

  // 1. Facade A: Corporate High-Rise
  const canvasA = document.createElement('canvas');
  canvasA.width = w;
  canvasA.height = h;
  const ctxA = canvasA.getContext('2d');
  drawBaseTower(ctxA, createRng(101), {
    numCols: 40,
    numFloors: 84,
    spandrelH: 9,
    mullionW: 4,
    activeFloorChance: 0.58
  });

  // 2. Facade B: Modern Financial Center (Vertical Fins & Cool Cyan Ribbon Bands)
  const canvasB = document.createElement('canvas');
  canvasB.width = w;
  canvasB.height = h;
  const ctxB = canvasB.getContext('2d');
  drawBaseTower(ctxB, createRng(202), {
    numCols: 44,
    numFloors: 88,
    spandrelH: 8,
    mullionW: 3.5,
    activeFloorChance: 0.62,
    coolPalette: ['#38bdf8', '#7dd3fc', '#bae6fd', '#0284c7']
  });

  // Add vertical fin piers every 4 columns
  const numFins = 11;
  const finStep = (w - 48) / numFins;
  for (let i = 0; i <= numFins; i++) {
    const fx = 24 + i * finStep;
    ctxB.fillStyle = '#111827';
    ctxB.fillRect(fx - 2, 0, 4, h);
    ctxB.fillStyle = '#1e293b';
    ctxB.fillRect(fx - 1, 0, 2, h);
  }

  // 3. Facade C: International Commerce Tower (Rich Warm Gold & Ice White Executive Suites)
  const canvasC = document.createElement('canvas');
  canvasC.width = w;
  canvasC.height = h;
  const ctxC = canvasC.getContext('2d');
  drawBaseTower(ctxC, createRng(303), {
    numCols: 38,
    numFloors: 80,
    spandrelH: 10,
    mullionW: 4.5,
    activeFloorChance: 0.50,
    warmPalette: ['#ffcf70', '#ffa826', '#ffe0a3', '#f59e0b']
  });

  // 4. Facade D: Slender Landmark Diagrid Tower (Crisp 3px architectural gold diagrid)
  const canvasD = document.createElement('canvas');
  canvasD.width = w;
  canvasD.height = h;
  const ctxD = canvasD.getContext('2d');
  drawBaseTower(ctxD, createRng(404), {
    numCols: 36,
    numFloors: 82,
    spandrelH: 9,
    mullionW: 4,
    activeFloorChance: 0.52
  });

  // Overlay refined, slender 3px warm-white/gold diagrid trusses
  const diagridTiers = 5;
  const tierH = h / diagridTiers;
  for (let t = 0; t < diagridTiers; t++) {
    const yTop = t * tierH;
    const yMid = yTop + tierH * 0.5;
    const yBot = yTop + tierH;

    // Horizontal structural tie ring (crisp 3px)
    ctxD.fillStyle = '#d97706';
    ctxD.fillRect(0, yTop - 2, w, 4);
    ctxD.fillStyle = '#fef3c7';
    ctxD.fillRect(0, yTop - 1, w, 2);

    const diagonals = [
      [0, yTop, w, yBot],
      [w, yTop, 0, yBot],
      [w * 0.5, yTop, 0, yMid],
      [w * 0.5, yTop, w, yMid],
      [0, yMid, w * 0.5, yBot],
      [w, yMid, w * 0.5, yBot]
    ];

    for (const [x1, y1, x2, y2] of diagonals) {
      // Thin 5px subtle warm ambient glow
      ctxD.strokeStyle = 'rgba(245, 158, 11, 0.40)';
      ctxD.lineWidth = 5;
      ctxD.lineCap = 'round';
      ctxD.beginPath();
      ctxD.moveTo(x1, y1);
      ctxD.lineTo(x2, y2);
      ctxD.stroke();

      // Crisp 3px champagne/gold architectural steel line
      ctxD.strokeStyle = '#fde68a';
      ctxD.lineWidth = 3;
      ctxD.stroke();

      // Thin 1px white highlight core
      ctxD.strokeStyle = '#ffffff';
      ctxD.lineWidth = 1;
      ctxD.stroke();
    }
  }

  return {
    facadeA: setupFacadeTexture(canvasA),
    facadeB: setupFacadeTexture(canvasB),
    facadeC: setupFacadeTexture(canvasC),
    facadeDiagrid: setupFacadeTexture(canvasD),
  };
}

/**
 * Creates separate facade geometry (4 vertical sides with seamless world UVs)
 * and roof geometry (top horizontal cap) for a skyscraper tower.
 * Discards underground bottom face.
 */
function createTowerGeometries(w, h, d, uScale = null, vScale = 45.0) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;

  const facadePositions = [];
  const facadeNormals = [];
  const facadeUVs = [];

  const roofPositions = [];
  const roofNormals = [];
  const roofUVs = [];

  for (let i = 0; i < pos.count; i += 3) {
    const ny = norm.getY(i);
    if (ny < -0.5) continue; // Skip bottom underground face

    const isRoof = ny > 0.5;
    for (let j = 0; j < 3; j++) {
      const idx = i + j;
      const x = pos.getX(idx);
      const y = pos.getY(idx);
      const z = pos.getZ(idx);
      const nx = norm.getX(idx);
      const nz = norm.getZ(idx);

      if (isRoof) {
        roofPositions.push(x, y, z);
        roofNormals.push(nx, ny, nz);
        roofUVs.push((x + w / 2) / w, (z + d / 2) / d);
      } else {
        facadePositions.push(x, y, z);
        facadeNormals.push(nx, ny, nz);

        const v = (y + h / 2) / vScale;
        let u = 0;
        const scaleX = uScale !== null ? uScale : w;
        const scaleZ = uScale !== null ? uScale : d;

        if (nz > 0.5) {
          u = (x + w / 2) / scaleX;
        } else if (nz < -0.5) {
          u = (w - (x + w / 2)) / scaleX;
        } else if (nx > 0.5) {
          u = (z + d / 2) / scaleZ;
        } else {
          u = (d - (z + d / 2)) / scaleZ;
        }
        facadeUVs.push(u, v);
      }
    }
  }

  geo.dispose();

  const facadeGeo = new THREE.BufferGeometry();
  facadeGeo.setAttribute('position', new THREE.Float32BufferAttribute(facadePositions, 3));
  facadeGeo.setAttribute('normal', new THREE.Float32BufferAttribute(facadeNormals, 3));
  facadeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(facadeUVs, 2));

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofPositions, 3));
  roofGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roofNormals, 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roofUVs, 2));

  return { facadeGeo, roofGeo };
}

/**
 * Procedural Enterprise 42U Server Cabinet Textures (512x1024 — 2x supersampled from 1024x2048 space).
 * Generates high-resolution Diffuse Map and Emissive Map inspired by Dell PowerEdge and Cisco Nexus racks.
 * Precision enterprise-scale SMD LED light guides with baked multi-intensity optical depth (zero per-frame shader overhead).
 */
function createServerCabinetTextures() {
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = 512;
  diffCanvas.height = 1024;
  const dCtx = diffCanvas.getContext('2d');
  dCtx.scale(0.5, 0.5);

  const emisCanvas = document.createElement('canvas');
  emisCanvas.width = 512;
  emisCanvas.height = 1024;
  const eCtx = emisCanvas.getContext('2d');
  eCtx.scale(0.5, 0.5);

  // 1. Base dark anodized gunmetal cabinet bezel (#14171e)
  dCtx.fillStyle = '#14171e';
  dCtx.fillRect(0, 0, 1024, 2048);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 1024, 2048);

  // Helper: Draw Precision Clean Enterprise SMD LED Light Guide (with baked optical intensity variance)
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

    // Deterministic per-LED brightness variance (simulates natural frozen mid-traffic optical states)
    const ledHash = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    const emisAlpha = 0.52 + 0.48 * ledHash;

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
    eCtx.save();
    eCtx.globalAlpha = emisAlpha;
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
    eCtx.restore();
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

/**
 * Procedural Commercial Janitor Cart Folded "CUIDADO / CAUTION / PISO MOLHADO / WET FLOOR"
 * Wet Floor Sign Texture (256x512) — maps onto the tapered main graphic panel below the 3D handle cutout.
 */
function createJanitorCautionSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // 1. Vivid Safety-Yellow Molded Plastic Base (#ffd000 -> #f5c000)
  const bgGrad = ctx.createLinearGradient(0, 0, 256, 512);
  bgGrad.addColorStop(0.0, '#ffda1a');
  bgGrad.addColorStop(0.5, '#f9c700');
  bgGrad.addColorStop(1.0, '#eab500');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 256, 512);

  // Subtle molded recessed graphic panel border (matching reference photo)
  ctx.strokeStyle = '#d4a300';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(12, 10, 232, 468, 10);
  ctx.stroke();

  ctx.strokeStyle = '#ffe55c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(15, 13, 226, 462, 8);
  ctx.stroke();

  // Bottom horizontal molded panel lip shadow & highlight
  ctx.fillStyle = '#cf9e00';
  ctx.fillRect(14, 476, 228, 4);
  ctx.fillStyle = '#ffe55c';
  ctx.fillRect(14, 480, 228, 3);

  // 2. Top Bilingual Header: "CUIDADO" (bold) / "CAUTION" (medium)
  ctx.fillStyle = '#111317';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 42px Arial, Helvetica, sans-serif';
  ctx.fillText('CUIDADO', 128, 56);

  ctx.font = '700 28px Arial, Helvetica, sans-serif';
  ctx.fillText('CAUTION', 128, 96);

  // 3. Center Bold Black Equilateral Warning Triangle (Y = 132 to 316)
  const txTop = 128;
  const tyTop = 134;
  const txLeft = 34;
  const tyBot = 312;
  const txRight = 222;

  ctx.strokeStyle = '#111317';
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(txTop, tyTop);
  ctx.lineTo(txRight, tyBot);
  ctx.lineTo(txLeft, tyBot);
  ctx.closePath();
  ctx.stroke();

  // 4. Slipping-Person Silhouette + Wavy Water Lines Inside Warning Triangle
  ctx.fillStyle = '#111317';
  ctx.strokeStyle = '#111317';

  // Head
  ctx.beginPath();
  ctx.arc(108, 206, 9.5, 0, Math.PI * 2);
  ctx.fill();

  // Reclining torso (falling backward)
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(112, 220);
  ctx.lineTo(131, 254);
  ctx.stroke();

  // Left arm (bent backward/downward)
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  ctx.moveTo(111, 221);
  ctx.lineTo(91, 232);
  ctx.lineTo(86, 250);
  ctx.stroke();

  // Right arm (reaching forward/up for balance)
  ctx.beginPath();
  ctx.moveTo(115, 221);
  ctx.lineTo(135, 224);
  ctx.lineTo(149, 213);
  ctx.stroke();

  // Upper leg (raised forward)
  ctx.lineWidth = 8.5;
  ctx.beginPath();
  ctx.moveTo(131, 252);
  ctx.lineTo(169, 239);
  ctx.stroke();

  // Lower slipping leg (kicked out over wet floor)
  ctx.beginPath();
  ctx.moveTo(131, 255);
  ctx.lineTo(175, 273);
  ctx.stroke();

  // Wavy wet-floor slip lines beneath person
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(106, 275);
  ctx.bezierCurveTo(116, 270, 124, 282, 134, 279);
  ctx.bezierCurveTo(144, 276, 150, 287, 162, 284);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(112, 286);
  ctx.bezierCurveTo(124, 282, 132, 293, 144, 290);
  ctx.bezierCurveTo(154, 287, 162, 296, 174, 293);
  ctx.stroke();

  // 5. Bottom Bilingual Text: "PISO" / "MOLHADO" / "WET FLOOR"
  ctx.fillStyle = '#111317';
  ctx.font = '900 38px Arial, Helvetica, sans-serif';
  ctx.fillText('PISO', 128, 354);
  ctx.fillText('MOLHADO', 128, 394);

  ctx.font = '700 25px Arial, Helvetica, sans-serif';
  ctx.fillText('WET FLOOR', 128, 432);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Fine Synthetic Bristle Texture (256x256) for the Janitor Cart Push Broom.
 * Renders hundreds of vertical/fanned charcoal & slate-gray synthetic fibers with
 * dark socket root shading at the bottom (v=0) and feathered flagged bristle tips at the top (v=1).
 */
function createJanitorBroomBristleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Base vertical gradient from dark socket roots (bottom) to lighter flagged tips (top)
  const baseGrad = ctx.createLinearGradient(0, 256, 0, 0);
  baseGrad.addColorStop(0.0, '#272c35');
  baseGrad.addColorStop(0.18, '#3f4754');
  baseGrad.addColorStop(0.78, '#556070');
  baseGrad.addColorStop(1.0, '#788496');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Deterministic pseudo-random helper for dense synthetic fiber strands
  let seed = 48271;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const palette = ['#252a32', '#323944', '#434c59', '#586373', '#6c788a', '#8390a2'];
  for (let i = 0; i < 480; i++) {
    const x0 = rand() * 256;
    ctx.strokeStyle = palette[Math.floor(rand() * palette.length)];
    ctx.lineWidth = 0.8 + rand() * 1.3;
    ctx.globalAlpha = 0.55 + rand() * 0.40;
    ctx.beginPath();
    ctx.moveTo(x0, 256);
    ctx.lineTo(x0, 0);
    ctx.stroke();
  }

  // Subtle tuft bundle shadow grooves
  ctx.globalAlpha = 0.28;
  for (let tx = 4; tx < 256; tx += 8) {
    ctx.fillStyle = '#1b1f26';
    ctx.fillRect(tx, 16, 1.5, 240);
  }
  ctx.globalAlpha = 1.0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Heavy-Duty Yellow Vinyl Refuse Bag Texture (256x256) with subtle ripstop
 * nylon weave and soft vertical cloth drape shading (eliminating hard geometric box edges).
 */
function createJanitorYellowVinylTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Base warm safety-yellow vinyl fill
  ctx.fillStyle = '#f2b718';
  ctx.fillRect(0, 0, 256, 256);

  // Soft sinusoidal vertical fabric drape shading across U (0..256)
  for (let x = 0; x < 256; x++) {
    const u = (x / 256) * Math.PI * 2;
    const wave =
      Math.sin(u * 4.0) * 0.45 +
      Math.sin(u * 8.0 + 0.9) * 0.30 +
      Math.cos(u * 12.0 - 0.4) * 0.25;
    const shade = Math.round(wave * 18);
    if (shade > 0) {
      ctx.fillStyle = `rgba(255, 232, 120, ${(shade / 18) * 0.22})`;
    } else {
      ctx.fillStyle = `rgba(145, 96, 0, ${(-shade / 18) * 0.24})`;
    }
    ctx.fillRect(x, 0, 1, 256);
  }

  // Top collar hem shadow & bottom sewn seam shading
  const vGrad = ctx.createLinearGradient(0, 0, 0, 256);
  vGrad.addColorStop(0.0, 'rgba(90, 60, 0, 0.26)');
  vGrad.addColorStop(0.07, 'rgba(0, 0, 0, 0.0)');
  vGrad.addColorStop(0.88, 'rgba(0, 0, 0, 0.0)');
  vGrad.addColorStop(1.0, 'rgba(110, 72, 0, 0.28)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Fine ripstop vinyl micro-grid
  ctx.strokeStyle = 'rgba(160, 110, 0, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural Plush Microfiber Terry-Cloth Towel Texture (256x256) with soft fabric
 * fold shading, looped terry micro-pile grain, and stitched overlock hem border.
 */
function createJanitorTowelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Warm tan/taupe microfiber base (#a89682)
  ctx.fillStyle = '#a89682';
  ctx.fillRect(0, 0, 256, 256);

  // Soft vertical cloth fold shading across U (0..256)
  for (let x = 0; x < 256; x++) {
    const u = (x / 256) * Math.PI * 3.0;
    const fold = Math.sin(u) * 0.55 + Math.cos(u * 2.0 + 0.6) * 0.35;
    if (fold > 0) {
      ctx.fillStyle = `rgba(235, 220, 200, ${fold * 0.22})`;
    } else {
      ctx.fillStyle = `rgba(75, 60, 45, ${-fold * 0.25})`;
    }
    ctx.fillRect(x, 0, 1, 256);
  }

  // Subtle darkening at the top caddy-rim bend (v ~ 0.40)
  const bendGrad = ctx.createLinearGradient(0, 0, 0, 256);
  bendGrad.addColorStop(0.0, 'rgba(65, 50, 38, 0.18)');
  bendGrad.addColorStop(0.32, 'rgba(245, 232, 215, 0.16)');
  bendGrad.addColorStop(0.45, 'rgba(65, 50, 38, 0.20)');
  bendGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.0)');
  bendGrad.addColorStop(1.0, 'rgba(60, 48, 36, 0.22)');
  ctx.fillStyle = bendGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Deterministic terry-cloth microfiber pile speckles
  let seed = 91823;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 3600; i++) {
    const px = Math.floor(rand() * 256);
    const py = Math.floor(rand() * 256);
    ctx.fillStyle = rand() > 0.5 ? 'rgba(240, 228, 212, 0.18)' : 'rgba(82, 68, 54, 0.18)';
    ctx.fillRect(px, py, 2, 2);
  }

  // Stitched overlock hem border around perimeter
  ctx.strokeStyle = '#7d6b58';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 244);
  ctx.strokeStyle = '#c4b29e';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(10, 10, 236, 236);
  ctx.setLineDash([]);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
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
    this.ceilingBumpTexture = ceilingTex.bumpTexture;
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
    this.noEntrySignTexture = createNoEntrySignTexture();
    this.extinguisherSignTexture = createExtinguisherSignTexture();
    this.extinguisherStickerTexture = createExtinguisherStickerTexture();
    this.extinguisherGaugeTexture = createExtinguisherGaugeTexture();

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
      bumpMap: this.ceilingBumpTexture,
      bumpScale: 0.002,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this.ceilingEmissiveTexture,
      emissiveIntensity: 0.65,
      roughness: 0.78,
      metalness: 0.08,
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

    // Enterprise 42U Server Cabinet Front Face (Baked multi-intensity emissive map — zero per-frame shader overhead)
    this.serverRackBladeMaterial = new THREE.MeshStandardMaterial({
      map: this.serverBladeDiffuseTexture,
      emissiveMap: this.serverBladeEmissiveTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.15,
      roughness: 0.40,
      metalness: 0.60,
    });

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

    // Corporate Access Vestibule (Stairwell, Glass Partition & Elevator Room) Materials
    const marbleTextures = createBlackMarbleTextures();
    this.vestibulePlasterTex = createVestibulePlasterTexture();
    this.vestibuleHalfWallTex = createVestibuleHalfWallTexture();
    this.brushedStainlessTex = createBrushedStainlessTexture();
    const elevDisplayTex = createElevatorDisplayTextures();
    const exitSignTex = createExitSignTextures();

    this.vestibuleGlassMaterial = new THREE.MeshBasicMaterial({
      color: 0x16222f,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.vestibuleGlassSeamMaterial = new THREE.MeshBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.vestibuleSillMaterial = new THREE.MeshStandardMaterial({
      color: 0xb2aca0,
      roughness: 0.55,
      metalness: 0.04,
      envMapIntensity: 0.45,
    });

    this.vestibuleAlumFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0xaab3be,
      roughness: 0.32,
      metalness: 0.72,
      envMapIntensity: 0.55,
    });

    this.vestibuleChromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.18,
      metalness: 0.88,
      envMapIntensity: 0.60,
    });

    this.vestibuleBlackMarbleMaterial = new THREE.MeshStandardMaterial({
      map: marbleTextures.diffuse,
      bumpMap: marbleTextures.bump,
      bumpScale: 0.0018,
      roughnessMap: marbleTextures.roughness,
      roughness: 1.0,
      metalness: 0.08,
      envMapIntensity: 0.72,
    });

    this.vestibuleWhiteWallMaterial = new THREE.MeshStandardMaterial({
      map: this.vestibulePlasterTex,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.02,
      envMapIntensity: 0.42,
    });

    this.vestibuleHalfWallMaterial = new THREE.MeshStandardMaterial({
      map: this.vestibuleHalfWallTex,
      roughness: 0.72,
      metalness: 0.04,
      envMapIntensity: 0.45,
    });

    this.vestibuleVoidMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
    });

    this.vestibuleDarkShadowMaterial = new THREE.MeshStandardMaterial({
      color: 0x050608,
      roughness: 0.95,
      metalness: 0.05,
      envMapIntensity: 0.20,
    });

    this.elevatorStainlessMaterial = new THREE.MeshStandardMaterial({
      map: this.brushedStainlessTex,
      color: 0xb8c0ca,
      roughness: 0.28,
      metalness: 0.78,
      envMapIntensity: 0.55,
    });

    this.elevatorPortalMaterial = new THREE.MeshStandardMaterial({
      color: 0x262a32,
      roughness: 0.40,
      metalness: 0.60,
      envMapIntensity: 0.50,
    });

    this.elevatorDisplayMaterial = new THREE.MeshStandardMaterial({
      map: elevDisplayTex.diffuse,
      emissiveMap: elevDisplayTex.emissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.15,
      roughness: 0.22,
      metalness: 0.30,
    });

    this.exitSignMaterial = new THREE.MeshStandardMaterial({
      map: exitSignTex.diffuse,
      emissiveMap: exitSignTex.emissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.24,
      roughness: 0.42,
      metalness: 0.04,
    });

    this.vestibuleCeilingLightMaterial = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      emissive: new THREE.Color(0x94a3b8),
      emissiveIntensity: 0.45,
      roughness: 0.30,
      metalness: 0.10,
    });

    // Server Containment Pod (Platform-to-Ceiling Tempered Glass Enclosure & Double Doors) Materials
    this.serverPodAlumFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a929a,
      roughness: 0.28,
      metalness: 0.75,
      envMapIntensity: 0.60,
    });

    this.serverPodGlassMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f161e,
      transparent: true,
      opacity: 0.72,
      roughness: 0.08,
      metalness: 0.28,
      envMapIntensity: 1.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Closed Matte-White Staff Door ("NO ENTRY / STAFF ONLY") Materials
    // Anti-bloom calibrated: matte architectural painted finish with low specular & envMap reflection
    this.staffDoorFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0xb4bcc6,
      roughness: 0.88,
      metalness: 0.0,
      envMapIntensity: 0.10,
    });

    this.staffDoorLeafMaterial = new THREE.MeshStandardMaterial({
      color: 0xbdc5ce,
      roughness: 0.86,
      metalness: 0.0,
      envMapIntensity: 0.10,
    });

    this.staffDoorSeamMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e2228,
      roughness: 0.90,
      metalness: 0.10,
    });

    this.staffDoorHandleMaterial = new THREE.MeshStandardMaterial({
      color: 0xc6ccd4,
      metalness: 0.85,
      roughness: 0.28,
      envMapIntensity: 0.75,
    });

    this.staffDoorSignMaterial = new THREE.MeshStandardMaterial({
      map: this.noEntrySignTexture,
      roughness: 0.78,
      metalness: 0.0,
      envMapIntensity: 0.15,
    });

    // Hero-Scale Fire Extinguisher & Polished Inox Stand Materials
    this.inoxStandMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e6ec,
      metalness: 0.92,
      roughness: 0.12,
      envMapIntensity: 0.85,
      side: THREE.DoubleSide,
    });

    this.extinguisherRedMaterial = new THREE.MeshStandardMaterial({
      color: 0xd11515,
      roughness: 0.20,
      metalness: 0.30,
      envMapIntensity: 0.40,
    });

    this.extinguisherLabelMaterial = new THREE.MeshStandardMaterial({
      map: this.extinguisherStickerTexture,
      roughness: 0.40,
      metalness: 0.05,
    });

    this.extinguisherHoseMaterial = new THREE.MeshStandardMaterial({
      color: 0x141619,
      roughness: 0.70,
      metalness: 0.10,
    });

    this.extinguisherMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0xc8ced6,
      metalness: 0.85,
      roughness: 0.25,
      envMapIntensity: 0.60,
    });

    this.extinguisherGaugeMaterial = new THREE.MeshStandardMaterial({
      map: this.extinguisherGaugeTexture,
      roughness: 0.25,
      metalness: 0.30,
      envMapIntensity: 0.40,
    });

    this.extinguisherSignMaterial = new THREE.MeshStandardMaterial({
      map: this.extinguisherSignTexture,
      roughness: 0.55,
      metalness: 0.0,
      envMapIntensity: 0.10,
    });

    // Enterprise Multifunction Printer Materials
    this.printerBadgeTexture = createPrinterBadgeTexture();
    this.printerScreenTexture = createPrinterTouchscreenTexture();

    // Calibrated matte cool-gray white plastic to eliminate over-exposure / glowing
    this.printerWhiteMaterial = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.62,
      metalness: 0.03,
    });

    this.printerCharcoalMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1d22,
      roughness: 0.55,
      metalness: 0.15,
    });

    this.printerBadgeMaterial = new THREE.MeshStandardMaterial({
      map: this.printerBadgeTexture,
      roughness: 0.62,
      metalness: 0.03,
    });

    this.printerScreenMaterial = new THREE.MeshBasicMaterial({
      map: this.printerScreenTexture,
      toneMapped: false,
    });

    this.printerPaperMaterial = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.90,
      metalness: 0.0,
    });

    // Wall-Mounted Hero-Scale Fire Hose Cabinet ("Abrigo de Incêndio") Materials
    this.fireHoseHeaderTexture = createFireHoseHeaderTexture();
    this.fireHoseCoilTexture = createFireHoseCoilTexture();

    this.fireHoseInoxMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4dae2,
      metalness: 0.88,
      roughness: 0.20,
      envMapIntensity: 0.70,
    });

    this.fireHoseBackplateMaterial = new THREE.MeshStandardMaterial({
      color: 0x7a828c,
      roughness: 0.45,
      metalness: 0.70,
      envMapIntensity: 0.40,
    });

    this.fireHoseHeaderMaterial = new THREE.MeshStandardMaterial({
      map: this.fireHoseHeaderTexture,
      transparent: true,
      alphaTest: 0.15,
      roughness: 0.25,
      metalness: 0.85,
      envMapIntensity: 0.60,
    });

    this.fireHoseCoilMaterial = new THREE.MeshStandardMaterial({
      map: this.fireHoseCoilTexture,
      roughness: 0.82,
      metalness: 0.05,
    });

    this.fireHoseBrassMaterial = new THREE.MeshStandardMaterial({
      color: 0xc89d28,
      metalness: 0.85,
      roughness: 0.24,
      envMapIntensity: 0.60,
    });

    // Closed Double Balcony Door & Exterior Skyline Materials
    this.runningManExitSignTextures = createRunningManExitSignTextures();
    this.runningManExitSignTexture = this.runningManExitSignTextures.diffuse;
    this.runningManExitSignMaterial = new THREE.MeshStandardMaterial({
      map: this.runningManExitSignTextures.diffuse,
      emissiveMap: this.runningManExitSignTextures.emissive,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.24,
      roughness: 0.42,
      metalness: 0.04,
    });

    this.nightSkyBackdropMaterial = new THREE.MeshBasicMaterial({
      color: 0x010204,
      side: THREE.BackSide,
      fog: false,
      toneMapped: false,
      depthWrite: false,
    });

    this.moonTexture = createMoonTexture();
    this.moonMaterial = new THREE.MeshBasicMaterial({
      map: this.moonTexture,
      side: THREE.DoubleSide,
      transparent: true,
      fog: false,
      toneMapped: false,
      depthTest: true,
      depthWrite: false,
    });

    const flakeTextures = createGraniteFlakeFloorTexture();
    this.balconyTileTexture = flakeTextures.map;
    this.balconyFlakeBumpMap = flakeTextures.bumpMap;

    this.balconyFloorMaterial = new THREE.MeshStandardMaterial({
      map: this.balconyTileTexture,
      bumpMap: this.balconyFlakeBumpMap,
      bumpScale: 0.0035,
      roughness: 0.40,
      metalness: 0.08,
    });

    this.balconyCurbMaterial = new THREE.MeshStandardMaterial({
      map: this.balconyTileTexture,
      bumpMap: this.balconyFlakeBumpMap,
      bumpScale: 0.0025,
      roughness: 0.45,
      metalness: 0.08,
    });

    this.patioMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x232020,
      roughness: 0.38,
      metalness: 0.65,
    });

    this.patioTeakMaterial = new THREE.MeshStandardMaterial({
      color: 0xc49a76,
      roughness: 0.70,
      metalness: 0.05,
    });

    this.patioTabletopMaterial = new THREE.MeshStandardMaterial({
      color: 0xb37444,
      roughness: 0.45,
      metalness: 0.10,
    });

    this.patioUmbrellaMaterial = new THREE.MeshStandardMaterial({
      color: 0xdcc3a5,
      roughness: 0.85,
      emissive: 0x3a2a18,
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
    });

    this.patioCeramicMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f7fa,
      roughness: 0.30,
      metalness: 0.05,
    });

    this.patioTrayMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b1d14,
      roughness: 0.55,
      metalness: 0.05,
    });

    this.balconyRailMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8dde4,
      metalness: 0.88,
      roughness: 0.18,
      envMapIntensity: 0.65,
    });

    this.balconySmokedGlassMaterial = new THREE.MeshBasicMaterial({
      color: 0x16222f,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.balconyExteriorWallMaterial = new THREE.MeshStandardMaterial({
      color: 0x161a20,
      roughness: 0.85,
      metalness: 0.15,
    });

    // Hero-Scale Commercial Janitor Cleaning Cart ("Carrinho de Limpeza Funcional") Materials
    this.janitorCautionSignTexture = createJanitorCautionSignTexture();
    this.janitorBroomBristleTexture = createJanitorBroomBristleTexture();
    this.janitorYellowVinylTexture = createJanitorYellowVinylTexture();
    this.janitorTowelTexture = createJanitorTowelTexture();

    this.janitorBlackPlasticMaterial = new THREE.MeshStandardMaterial({
      color: 0x181a1e,
      roughness: 0.55,
      metalness: 0.08,
    });

    this.janitorGrayRubberMaterial = new THREE.MeshStandardMaterial({
      color: 0x646e78,
      roughness: 0.62,
      metalness: 0.18,
    });

    this.janitorYellowPlasticMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5b800,
      roughness: 0.32,
      metalness: 0.04,
    });

    this.janitorYellowVinylMaterial = new THREE.MeshStandardMaterial({
      map: this.janitorYellowVinylTexture,
      roughness: 0.46,
      metalness: 0.02,
    });

    this.janitorBroomBristleMaterial = new THREE.MeshStandardMaterial({
      map: this.janitorBroomBristleTexture,
      roughness: 0.88,
      metalness: 0.04,
    });

    this.janitorCautionSignMaterial = new THREE.MeshStandardMaterial({
      map: this.janitorCautionSignTexture,
      roughness: 0.34,
      metalness: 0.04,
    });

    this.janitorSoapyWaterMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.34,
      roughness: 0.10,
      metalness: 0.08,
      depthWrite: false,
    });

    this.janitorBluePlasticMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.36,
      metalness: 0.05,
    });

    this.janitorCyanBottleMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.25,
      metalness: 0.05,
    });

    this.janitorGreenPlasticMaterial = new THREE.MeshStandardMaterial({
      color: 0x65b71e,
      roughness: 0.38,
      metalness: 0.05,
    });

    this.janitorTowelTanMaterial = new THREE.MeshStandardMaterial({
      map: this.janitorTowelTexture,
      roughness: 0.88,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const skylineFacades = createSkyscraperFacadeTextures();
    this.skylineTowerATexture = skylineFacades.facadeA;
    this.skylineTowerBTexture = skylineFacades.facadeB;
    this.skylineTowerCTexture = skylineFacades.facadeC;
    this.skylineTowerDTexture = skylineFacades.facadeDiagrid;

    this.skylineTowerAMaterial = new THREE.MeshBasicMaterial({
      map: skylineFacades.facadeA,
      fog: false,
      toneMapped: false,
    });

    this.skylineTowerBMaterial = new THREE.MeshBasicMaterial({
      map: skylineFacades.facadeB,
      fog: false,
      toneMapped: false,
    });

    this.skylineTowerCMaterial = new THREE.MeshBasicMaterial({
      map: skylineFacades.facadeC,
      fog: false,
      toneMapped: false,
    });

    this.skylineTowerDMaterial = new THREE.MeshBasicMaterial({
      map: skylineFacades.facadeDiagrid,
      fog: false,
      toneMapped: false,
    });

    this.skylineTowerRoofMaterial = new THREE.MeshBasicMaterial({
      color: 0x0a0d14,
      fog: false,
    });

    this.skylineRoofTrimMaterial = new THREE.MeshBasicMaterial({
      color: 0xffdfa0,
      fog: false,
      toneMapped: false,
    });

    this.skylineBeaconMatA = new THREE.MeshBasicMaterial({
      color: 0xff1515,
      fog: false,
      toneMapped: false,
    });

    this.skylineBeaconMatB = new THREE.MeshBasicMaterial({
      color: 0xff1515,
      fog: false,
      toneMapped: false,
    });

    this.skylineBeaconMaterial = this.skylineBeaconMatA;
    this.skylineBeacons = [];
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
    this.glassMeshes = [];
    const group = new THREE.Group();
    group.name = 'DataCenterArena';
    this.scene.add(group);

    this.exteriorVistaGroup = new THREE.Group();
    this.exteriorVistaGroup.name = 'DC_ExteriorVistaGroup';
    group.add(this.exteriorVistaGroup);

    const colliderGeometries = [];
    const playerOnlyColliderGeometries = [];

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
      vestibuleGlass: [],
      vestibuleGlassSeam: [],
      vestibuleSill: [],
      vestibuleAlumFrame: [],
      vestibuleChrome: [],
      vestibuleBlackMarble: [],
      vestibuleWhiteWall: [],
      vestibuleHalfWall: [],
      vestibuleVoid: [],
      vestibuleDarkShadow: [],
      elevatorStainless: [],
      elevatorPortal: [],
      elevatorDisplay: [],
      exitSign: [],
      vestibuleCeilingLight: [],
      serverPodAlumFrame: [],
      serverPodGlass: [],
      staffDoorFrame: [],
      staffDoorLeaf: [],
      staffDoorSeam: [],
      staffDoorHandle: [],
      staffDoorSign: [],
      extinguisherInox: [],
      extinguisherRed: [],
      extinguisherLabel: [],
      extinguisherHose: [],
      extinguisherMetal: [],
      extinguisherGauge: [],
      extinguisherSign: [],
      balconyFloor: [],
      balconyCurb: [],
      balconyRailMetal: [],
      balconySmokedGlass: [],
      balconyExteriorWall: [],
      patioMetal: [],
      patioTeak: [],
      patioTabletop: [],
      patioUmbrella: [],
      patioCeramic: [],
      patioTray: [],
      printerWhite: [],
      printerCharcoal: [],
      printerBadge: [],
      printerScreen: [],
      printerPaper: [],
      fireHoseInox: [],
      fireHoseBackplate: [],
      fireHoseHeader: [],
      fireHoseCoil: [],
      fireHoseBrass: [],
      runningManExitSign: [],
      skylineTowerA: [],
      skylineTowerB: [],
      skylineTowerC: [],
      skylineTowerD: [],
      skylineTowerRoofs: [],
      skylineRoofTrim: [],
      janitorBlackPlastic: [],
      janitorGrayRubber: [],
      janitorYellowPlastic: [],
      janitorYellowVinyl: [],
      janitorCautionSign: [],
      janitorSoapyWater: [],
      janitorBluePlastic: [],
      janitorCyanBottle: [],
      janitorGreenPlastic: [],
      janitorTowelTan: [],
      janitorBroomBristle: [],
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

    const registerPlayerOnlyCollider = (geo, posX, posY, posZ, rotX = 0, rotY = 0, rotZ = 0) => {
      _p.set(posX, posY, posZ);
      _e.set(rotX, rotY, rotZ);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);

      const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone();
      nonIndexed.applyMatrix4(_m);
      const cleanGeo = new THREE.BufferGeometry();
      cleanGeo.setAttribute('position', nonIndexed.getAttribute('position'));
      playerOnlyColliderGeometries.push(cleanGeo);
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

    // 2. ENTERPRISE DATA CENTER RAISED PLENUM FLOOR STAGE (Z = -9.50 to -6.50, Height = +0.35m)
    // Supports the 8 server racks along the Front Wall (Z = -9.50m) spanning exactly 3 full 1.0m floor squares.
    const platW = 14.0;
    const platL = 3.00;
    const platH = 0.35;
    const platZ = -8.00;      // Back edge flush with Front Wall inner surface at Z = -9.50m
    const platZFront = -6.50; // Exposed front step edge facing +Z into the room (aligned exactly with the 3rd tile seam)

    // A. Static BVH Environment Collider for Raised Platform (14.0m x 0.35m x 3.00m)
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
    // Front baseboard strip (Z = -6.50m, facing +Z)
    const frontBaseboardGeo = new THREE.BoxGeometry(platW + 0.03, 0.035, 0.015);
    addVisual(visualBuckets.plenumBaseboard, frontBaseboardGeo, 0, 0.035 / 2, platZFront + 0.015 / 2);
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
    // Front nosing metal channel (along Z = -6.50m)
    const frontNosingGeo = new THREE.BoxGeometry(platW + 0.03, 0.018, 0.024);
    addVisual(visualBuckets.stepNosingMetal, frontNosingGeo, 0, platH + 0.001, platZFront + 0.012);
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
    // Front step tread (along Z = -6.50m, sight-line on outer +Z lip)
    const frontTreadGeo = createTreadBoxGeo(platW, 0.004, 0.020, 14, 'x_front');
    addVisual(visualBuckets.stepTread, frontTreadGeo, 0, platH + 0.005, platZFront + 0.010);
    frontTreadGeo.dispose();

    // Left side step tread (direct box aligned along Z, no Y-rotation!)
    const leftTreadGeo = createTreadBoxGeo(0.020, 0.004, platL, 3, 'z_left');
    addVisual(visualBuckets.stepTread, leftTreadGeo, -platW / 2 - 0.010, platH + 0.005, platZ);
    leftTreadGeo.dispose();

    // Right side step tread (direct box aligned along Z, no Y-rotation!)
    const rightTreadGeo = createTreadBoxGeo(0.020, 0.004, platL, 3, 'z_right');
    addVisual(visualBuckets.stepTread, rightTreadGeo, platW / 2 + 0.010, platH + 0.005, platZ);
    rightTreadGeo.dispose();

    // 3. PERIMETER WALLS & CEILING
    // Suspended Tech Ceiling (Y = H = 3.8m, facing down -Y toward room)
    const ceilingGeo = new THREE.PlaneGeometry(W, L);
    addPart(visualBuckets.ceiling, ceilingGeo, 0, H, zCenter, Math.PI / 2, 0, 0, true);
    ceilingGeo.dispose();

    // Back Wall (Z = +13.00 room face, Z = +13.10 center, thickness 0.20m, Y = 0.00 to 3.80m)
    // Seamless UV world-space continuity across all segments matching the full 20.0m x 3.8m room span.
    const backWallZCenter = 13.10;
    const backWallThick = 0.20;
    const backWallSegs = [
      // 1. Full-width continuous upper header above door & window (X = -10.00 to +10.00, Y = 2.649 to 3.80m)
      {
        w: 20.00, h: 1.151, d: backWallThick, x: 0.00, yBottom: 2.649, z: backWallZCenter, horizStart: 0.00,
        hide: { pz: true, py: true, ny: true }
      },
      // 2. Far-Left solid corner wall (X = +7.50 to +10.00, Y = 0.00 to 2.649m)
      {
        w: 2.50, h: 2.649, d: backWallThick, x: 8.75, yBottom: 0.00, z: backWallZCenter, horizStart: 17.50,
        hide: { pz: true, py: true, ny: true, px: true }
      },
      // 3. Solid center-left pillar between Balcony Door and Window (X = +4.50 to +5.50, Y = 0.00 to 2.649m)
      {
        w: 1.00, h: 2.649, d: backWallThick, x: 5.00, yBottom: 0.00, z: backWallZCenter, horizStart: 14.50,
        hide: { pz: true, py: true, ny: true }
      },
      // 4. Lower half-wall below Panoramic Window (X = -4.50 to +4.50, Y = 0.00 to 1.081m)
      {
        w: 9.00, h: 1.081, d: backWallThick, x: 0.00, yBottom: 0.00, z: backWallZCenter, horizStart: 5.50,
        hide: { pz: true, py: true, ny: true }
      },
      // 5. Far-Right solid corner wall (X = -10.00 to -4.50, Y = 0.00 to 2.649m)
      {
        w: 5.50, h: 2.649, d: backWallThick, x: -7.25, yBottom: 0.00, z: backWallZCenter, horizStart: 0.00,
        hide: { pz: true, py: true, ny: true, nx: true }
      },
    ];

    for (const seg of backWallSegs) {
      const segGeo = createWallSegmentGeometry(
        seg.w, seg.h, seg.d, false, false, seg.yBottom, seg.horizStart, W, seg.hide
      );
      addVisual(visualBuckets.wall, segGeo, seg.x, seg.yBottom + seg.h / 2, seg.z);
      segGeo.dispose();

      const colGeo = new THREE.BoxGeometry(seg.w, seg.h, seg.d);
      registerCollider(colGeo, seg.x, seg.yBottom + seg.h / 2, seg.z);
      colGeo.dispose();
    }

    // Player-only collision barriers for the doorway and window openings
    // Blocks player from stepping outside while weapon raycasts pass through to hit glass/frames
    const doorBarrierGeo = new THREE.BoxGeometry(2.00, 2.649, backWallThick);
    registerPlayerOnlyCollider(doorBarrierGeo, 6.50, 2.649 / 2, backWallZCenter);
    doorBarrierGeo.dispose();

    const winClearH = 2.649 - 1.081;
    const winBarrierGeo = new THREE.BoxGeometry(9.00, winClearH, backWallThick);
    registerPlayerOnlyCollider(winBarrierGeo, 0.00, 1.081 + winClearH / 2, backWallZCenter);
    winBarrierGeo.dispose();

    // Front Wall (Z = -10.0, Room-facing side at Z = -9.5)
    const frontWallGeo = createWallBoxGeometry(W, H, 1.0, false, true);
    addPart(visualBuckets.wall, frontWallGeo, 0, H / 2, -10.0);
    frontWallGeo.dispose();

    // Left Wall (X = -10.0, Room-facing side at X = -10.0)
    // Doorway top and Glass Partition Window top are BOTH aligned at Y = 2.65m, allowing the entire
    // upper wall header (Y = 2.65m to 3.80m) across Z = -10.00 to +13.50 to be 1 single uncut span
    // with internal/back faces stripped for zero seam artifacts!
    const leftWallSegs = [
      // 1. Continuous full-length upper header across the entire room (Z = -10.00 to +13.50, Y = 2.65 to 3.80m)
      {
        w: 0.18, h: 1.15, d: 23.50, x: -10.09, yBottom: 2.65, z: 1.75, horizStart: 0.00,
        hide: { nx: true, py: true, ny: true, pz: true, nz: true }
      },
      // 2. Lower solid front-left wall up to right window jamb (Z = -10.00 to +1.703, Y = 0.00 to 2.65m)
      {
        w: 0.18, h: 2.65, d: 11.703, x: -10.09, yBottom: 0.00, z: -4.1485, horizStart: 0.00,
        hide: { nx: true, py: true, ny: true, pz: true, nz: true }
      },
      // 3. Lower half-wall below glass partition (Z = +1.703 to +9.497, Y = 0.00 to 1.08m)
      {
        w: 0.18, h: 1.08, d: 7.794, x: -10.09, yBottom: 0.00, z: 5.60, horizStart: 11.703,
        hide: { nx: true, py: true, ny: true, pz: true, nz: true }
      },
      // 4. Narrow pillar mullion between window & doorway (Z = +9.497 to +9.752, Y = 0.00 to 2.65m)
      {
        w: 0.18, h: 2.65, d: 0.255, x: -10.09, yBottom: 0.00, z: 9.6245, horizStart: 19.497,
        hide: { nx: true, py: true, ny: true, pz: true, nz: true }
      },
      // 5. Lower solid back-left wall from doorway left jamb to server racks wall (Z = +10.848 to +13.50, Y = 0.00 to 2.65m)
      {
        w: 0.18, h: 2.65, d: 2.652, x: -10.09, yBottom: 0.00, z: 12.174, horizStart: 20.848,
        hide: { nx: true, py: true, ny: true, pz: true, nz: true }
      },
    ];
    for (const seg of leftWallSegs) {
      const segGeo = createWallSegmentGeometry(
        seg.w, seg.h, seg.d, true, false, seg.yBottom, seg.horizStart, L, seg.hide
      );
      addVisual(visualBuckets.wall, segGeo, seg.x, seg.yBottom + seg.h / 2, seg.z);
      segGeo.dispose();

      // Span collider across full 0.210m partition wall thickness (-10.000 office face to -10.210 vestibule face)
      // so bullet decals land flush on BOTH the main office side and the vestibule side!
      const colGeo = new THREE.BoxGeometry(0.210, seg.h, seg.d);
      registerCollider(colGeo, -10.105, seg.yBottom + seg.h / 2, seg.z);
      colGeo.dispose();
    }

    // Right Wall (X = +10.0, Room-facing side at X = +10.0)
    const rightWallGeo = createWallBoxGeometry(1.0, H, L, true, true);
    addPart(visualBuckets.wall, rightWallGeo, 10.5, H / 2, zCenter);
    rightWallGeo.dispose();

    // 3D Batched Brazilian NBR 14136 Outlet Plates along cable raceway (Y = 1.49m)
    // Sleek 2.4mm flush relief (front face 2.6mm off wall < 5.0mm decal offset) so wall & outlet decals never clip or z-fight!
    const outletGeo = createOutletBoxGeometry(0.27, 0.095, 0.0024);
    const outletZPositions = [-6.0, -2.0, 2.0, 6.0, 10.0];
    const outletY = 1.49;

    for (const oz of outletZPositions) {
      // Left Wall (X = -10.0, faces +X into room): only place on intact solid front-left wall (Z < 1.0)
      if (oz < 1.0) {
        addPart(visualBuckets.wallOutlets, outletGeo, -9.9986, outletY, oz, 0, Math.PI / 2, 0);
      }
      // Right Wall (X = +10.0, faces -X into room, rotY = -Math.PI / 2)
      addPart(visualBuckets.wallOutlets, outletGeo, 9.9986, outletY, oz, 0, -Math.PI / 2, 0);
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

    // 4 Stanchion Posts in Hero Scale relocated to the Left Wall under the first glass partition window
    // (exact position indicated in front of the access vestibule window, Z ≈ 7.4m to 8.85m, X ≈ -9.55m to -9.02m)
    // Post 0 & 1: wall-adjacent pair linked with sagging fabric belt (Z = 7.40m to 8.35m, 0.20m clear of wall)
    // Post 2 & 3: front-row staggered posts (X = -9.02m and -9.18m, generous clearances >= 0.60m from all posts)
    const stanchionPosts = [
      { x: -9.55, z: 7.40, yaw: 0.28 },  // Connected pair (near wall)
      { x: -9.52, z: 8.35, yaw: -0.36 }, // Connected pair (near wall)
      { x: -9.02, z: 7.95, yaw: 1.12 },  // Standalone post (staggered forward)
      { x: -9.18, z: 8.85, yaw: -1.74 }  // Standalone post (staggered forward)
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

    // Enterprise Coffee Station & Potted Areca Palm (Relocated to Glass Partition Wall at X = -10.0m)
    // A. Enterprise Coffee Station (Rotated +Math.PI / 2 so cabinet doors, touchscreen & spout face inward (+X into room))
    // Sits on solid wall section immediately to the right of glass window frame (Z = 0.70m, X = -9.55m flush to wall)
    this._buildCoffeeStation(addVisual, registerCollider, visualBuckets, -9.55, 0.0, 0.70, Math.PI / 2);

    // B. Potted Areca Palm Plant (Compact indoor office scale ~58%, placed neatly beside the coffee cabinet)
    this._buildArecaPalm(addVisual, registerCollider, visualBuckets, -9.45, 0.0, -0.62, 0.58, 0.50);

    // C. Closed Matte-White Staff Door ("NO ENTRY / STAFF ONLY")
    // Mounted flush against Left Wall at X = -10.0m, Z = -4.0m, cleanly centered between wall outlets at Z = -2.0m & -6.0m
    this._buildStaffDoor(addPart, addVisual, registerCollider, visualBuckets, -10.0, 0.0, -4.0);

    // D. Enterprise Wall-Mounted Split AC Units (LG Artcool Mirror Style - +40% FPS Hero Scale)
    // 3 units mounted high on the East wall (X = 10.0m) near ceiling (Y = 3.42m) facing into room (-X).
    // Slid toward the server racks and aligned directly with the 3 workstation cover desk rows along Z:
    // - Row 1 (Close / Server Pod side): Z = 1.8 - 4.5 = -2.7m
    // - Row 2 (Mid / Center):            Z = 5.5 - 4.5 =  1.0m
    // - Row 3 (Far / Balcony side):      Z = 9.2 - 4.5 =  4.7m
    const acZPositions = [-2.7, 1.0, 4.7];
    for (const acZ of acZPositions) {
      this._buildSplitAC(addVisual, registerCollider, visualBuckets, 9.845, 3.42, acZ);
    }

    // E. Hero-Scale Enterprise Multifunction Printer & Brushed Stainless-Steel Trash Bin
    // Backed up against East AC wall (X = 10.0m) directly below the middle AC unit (Z = 1.0m):
    // - Printer at X = 9.53m, Z = 1.00m (facing -X into room)
    // - Trash Bin at X = 9.62m, Z = 2.00m
    this._buildEnterprisePrinter(addVisual, registerCollider, visualBuckets, 9.53, 0.0, 1.00, -Math.PI / 2);
    this._buildCylindricalTrashBin(addVisual, registerCollider, visualBuckets, 9.62, 2.00);

    // Zone B: 42U Server Racks & Tempered Glass Server Containment Pod
    // Front Wall Server Racks: Full row of 8 massive cabinets across Z = -9.02 facing +Z!
    // Symmetrically centered inside each of the 8 equal-width glass bays of the 14.0m Server Containment Pod!
    const frontRackX = [-6.087, -4.353, -2.619, -0.871, 0.871, 2.619, 4.353, 6.087];
    const frontRackZ = -9.02; // Rear face at Z = -9.42, wall at Z = -9.50 -> Clean, unclipped 8cm clearance
    for (const rx of frontRackX) {
      this._buildServerCabinet(addPart, addVisual, visualBuckets, rx, frontRackZ, Math.PI, platH); // rotY = Math.PI faces +Z into the room!
    }

    // Platform-to-Ceiling Tempered Glass Server Containment Pod with Centered Double Aluminum-Glass Doors
    this._buildServerContainmentPod(
      addPart,
      addVisual,
      registerCollider,
      registerPlayerOnlyCollider,
      visualBuckets
    );

    // Hero-Scale Floor-Standing Fire Extinguishers & Wall-Mounted "EXTINTOR" Signs
    // Placed symmetrically on BOTH sides (X = -8.50m and X = +8.50m, Z = -9.18m) dead-center in open wall bays
    this._buildFloorFireExtinguishers(
      addPart,
      addVisual,
      registerCollider,
      visualBuckets
    );

    // Zone C: Workstation Cover Rows (All 3 rows strictly on the main floor at baseY = 0.0!)
    // Uniformly translated by -4.5m along Z toward the Server Pod (Z = -6.50m) so Row 1 sits ~2.8m-3.25m
    // from the Server Pod glass wall and opens up a generous clear zone in front of the Vestibule Door.
    const deskClusterOffsetZ = -4.5;

    // Row 1: Close Distance (Z = -2.7m, Floor level)
    this._buildWorkstationRow(addPart, addVisual, visualBuckets, 1.8 + deskClusterOffsetZ, 0.0, 'close', addPartMatrix);

    // Row 2: Mid Distance (Z = 1.0m, Floor level, staggered wider)
    this._buildWorkstationRow(addPart, addVisual, visualBuckets, 5.5 + deskClusterOffsetZ, 0.0, 'mid', addPartMatrix);

    // Row 3: Far Distance (Z = 4.7m, Floor level)
    this._buildWorkstationRow(addPart, addVisual, visualBuckets, 9.2 + deskClusterOffsetZ, 0.0, 'far', addPartMatrix);

    // Zone D: Corporate Access Vestibule (Glass Partition Wall, Open Glass Door, Stairwell & Elevator Room)
    this._buildCorporateAccessVestibule(
      addPart,
      addVisual,
      registerCollider,
      registerPlayerOnlyCollider,
      visualBuckets,
      group,
      addPartMatrix
    );

    // Zone E: Back Wall Transformation (Closed Double Balcony Door, Panoramic Window, Exterior Balcony & 3D Skyline)
    this._buildDoubleBalconyDoor(addPart, addVisual, visualBuckets, group);
    this._buildPanoramicExteriorWindow(addPart, addVisual, visualBuckets);
    this._buildExteriorBalcony(addPart, addVisual, registerCollider, visualBuckets, addPartMatrix);
    this._buildNightCitySkyline(addVisual, visualBuckets, this.exteriorVistaGroup);

    // Wall-Mounted Hero-Scale Stainless-Steel Fire Hose Cabinet ("Abrigo de Incêndio")
    // Mounted centered on wall panel seam at X = -7.00m, Y = 1.571m (bottom edge aligned with windowsill at Y = 1.081m), Z = 12.90m (facing -Z into room)
    this._buildFireHoseCabinet(addVisual, registerCollider, registerPlayerOnlyCollider, visualBuckets, -7.00, 1.571, 12.90);

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
      { bucket: visualBuckets.vestibuleSill, material: this.vestibuleSillMaterial, name: 'DC_VestibuleSill' },
      { bucket: visualBuckets.vestibuleAlumFrame, material: this.vestibuleAlumFrameMaterial, name: 'DC_VestibuleAlumFrame' },
      { bucket: visualBuckets.vestibuleChrome, material: this.vestibuleChromeMaterial, name: 'DC_VestibuleChrome' },
      { bucket: visualBuckets.vestibuleBlackMarble, material: this.vestibuleBlackMarbleMaterial, name: 'DC_VestibuleBlackMarble' },
      { bucket: visualBuckets.vestibuleWhiteWall, material: this.vestibuleWhiteWallMaterial, name: 'DC_VestibuleWhiteWall' },
      { bucket: visualBuckets.vestibuleHalfWall, material: this.vestibuleHalfWallMaterial, name: 'DC_VestibuleHalfWall' },
      { bucket: visualBuckets.vestibuleVoid, material: this.vestibuleVoidMaterial, name: 'DC_VestibuleVoid' },
      { bucket: visualBuckets.vestibuleDarkShadow, material: this.vestibuleDarkShadowMaterial, name: 'DC_VestibuleDarkShadow' },
      { bucket: visualBuckets.elevatorStainless, material: this.elevatorStainlessMaterial, name: 'DC_ElevatorStainless' },
      { bucket: visualBuckets.elevatorPortal, material: this.elevatorPortalMaterial, name: 'DC_ElevatorPortal' },
      { bucket: visualBuckets.elevatorDisplay, material: this.elevatorDisplayMaterial, name: 'DC_ElevatorDisplay' },
      { bucket: visualBuckets.exitSign, material: this.exitSignMaterial, name: 'DC_ExitSign' },
      { bucket: visualBuckets.vestibuleCeilingLight, material: this.vestibuleCeilingLightMaterial, name: 'DC_VestibuleCeilingLight' },
      { bucket: visualBuckets.serverPodAlumFrame, material: this.serverPodAlumFrameMaterial, name: 'DC_ServerPodAlumFrame' },
      { bucket: visualBuckets.vestibuleGlassSeam, material: this.vestibuleGlassSeamMaterial, name: 'DC_VestibuleGlassSeam', renderOrder: 2 },
      { bucket: visualBuckets.vestibuleGlass, material: this.vestibuleGlassMaterial, name: 'DC_VestibuleGlass', renderOrder: 2, isGlass: true },
      { bucket: visualBuckets.serverPodGlass, material: this.serverPodGlassMaterial, name: 'DC_ServerPodGlass', renderOrder: 2, isGlass: true },
      { bucket: visualBuckets.staffDoorFrame, material: this.staffDoorFrameMaterial, name: 'DC_StaffDoorFrame' },
      { bucket: visualBuckets.staffDoorLeaf, material: this.staffDoorLeafMaterial, name: 'DC_StaffDoorLeaf' },
      { bucket: visualBuckets.staffDoorSeam, material: this.staffDoorSeamMaterial, name: 'DC_StaffDoorSeam' },
      { bucket: visualBuckets.staffDoorHandle, material: this.staffDoorHandleMaterial, name: 'DC_StaffDoorHandle' },
      { bucket: visualBuckets.staffDoorSign, material: this.staffDoorSignMaterial, name: 'DC_StaffDoorSign' },
      { bucket: visualBuckets.extinguisherInox, material: this.inoxStandMaterial, name: 'DC_ExtinguisherInox' },
      { bucket: visualBuckets.extinguisherRed, material: this.extinguisherRedMaterial, name: 'DC_ExtinguisherRed' },
      { bucket: visualBuckets.extinguisherLabel, material: this.extinguisherLabelMaterial, name: 'DC_ExtinguisherLabel' },
      { bucket: visualBuckets.extinguisherHose, material: this.extinguisherHoseMaterial, name: 'DC_ExtinguisherHose' },
      { bucket: visualBuckets.extinguisherMetal, material: this.extinguisherMetalMaterial, name: 'DC_ExtinguisherMetal' },
      { bucket: visualBuckets.extinguisherGauge, material: this.extinguisherGaugeMaterial, name: 'DC_ExtinguisherGauge' },
      { bucket: visualBuckets.extinguisherSign, material: this.extinguisherSignMaterial, name: 'DC_ExtinguisherSign' },
      { bucket: visualBuckets.balconyFloor, material: this.balconyFloorMaterial, name: 'DC_BalconyFloor' },
      { bucket: visualBuckets.balconyCurb, material: this.balconyCurbMaterial, name: 'DC_BalconyCurb' },
      { bucket: visualBuckets.balconyRailMetal, material: this.balconyRailMetalMaterial, name: 'DC_BalconyRailMetal' },
      { bucket: visualBuckets.balconySmokedGlass, material: this.balconySmokedGlassMaterial, name: 'DC_BalconyGlass', renderOrder: 2, isGlass: true },
      { bucket: visualBuckets.balconyExteriorWall, material: this.balconyExteriorWallMaterial, name: 'DC_BalconyExteriorWall' },
      { bucket: visualBuckets.patioMetal, material: this.patioMetalMaterial, name: 'DC_PatioMetal' },
      { bucket: visualBuckets.patioTeak, material: this.patioTeakMaterial, name: 'DC_PatioTeak' },
      { bucket: visualBuckets.patioTabletop, material: this.patioTabletopMaterial, name: 'DC_PatioTabletop' },
      { bucket: visualBuckets.patioUmbrella, material: this.patioUmbrellaMaterial, name: 'DC_PatioUmbrella' },
      { bucket: visualBuckets.patioCeramic, material: this.patioCeramicMaterial, name: 'DC_PatioCeramic' },
      { bucket: visualBuckets.patioTray, material: this.patioTrayMaterial, name: 'DC_PatioTray' },
      { bucket: visualBuckets.printerWhite, material: this.printerWhiteMaterial, name: 'DC_PrinterWhite' },
      { bucket: visualBuckets.printerCharcoal, material: this.printerCharcoalMaterial, name: 'DC_PrinterCharcoal' },
      { bucket: visualBuckets.printerBadge, material: this.printerBadgeMaterial, name: 'DC_PrinterBadge' },
      { bucket: visualBuckets.printerScreen, material: this.printerScreenMaterial, name: 'DC_PrinterScreen' },
      { bucket: visualBuckets.printerPaper, material: this.printerPaperMaterial, name: 'DC_PrinterPaper' },
      { bucket: visualBuckets.fireHoseInox, material: this.fireHoseInoxMaterial, name: 'DC_FireHoseInox' },
      { bucket: visualBuckets.fireHoseBackplate, material: this.fireHoseBackplateMaterial, name: 'DC_FireHoseBackplate' },
      { bucket: visualBuckets.fireHoseHeader, material: this.fireHoseHeaderMaterial, name: 'DC_FireHoseHeader' },
      { bucket: visualBuckets.fireHoseCoil, material: this.fireHoseCoilMaterial, name: 'DC_FireHoseCoil' },
      { bucket: visualBuckets.fireHoseBrass, material: this.fireHoseBrassMaterial, name: 'DC_FireHoseBrass' },
      { bucket: visualBuckets.runningManExitSign, material: this.runningManExitSignMaterial, name: 'DC_BalconyExitSign' },
      { bucket: visualBuckets.skylineTowerA, material: this.skylineTowerAMaterial, name: 'DC_SkylineTowerA' },
      { bucket: visualBuckets.skylineTowerB, material: this.skylineTowerBMaterial, name: 'DC_SkylineTowerB' },
      { bucket: visualBuckets.skylineTowerC, material: this.skylineTowerCMaterial, name: 'DC_SkylineTowerC' },
      { bucket: visualBuckets.skylineTowerD, material: this.skylineTowerDMaterial, name: 'DC_SkylineTowerD' },
      { bucket: visualBuckets.skylineTowerRoofs, material: this.skylineTowerRoofMaterial, name: 'DC_SkylineTowerRoofs' },
      { bucket: visualBuckets.skylineRoofTrim, material: this.skylineRoofTrimMaterial, name: 'DC_SkylineRoofTrim' },
      { bucket: visualBuckets.janitorBlackPlastic, material: this.janitorBlackPlasticMaterial, name: 'DC_JanitorBlackPlastic' },
      { bucket: visualBuckets.janitorGrayRubber, material: this.janitorGrayRubberMaterial, name: 'DC_JanitorGrayRubber' },
      { bucket: visualBuckets.janitorYellowPlastic, material: this.janitorYellowPlasticMaterial, name: 'DC_JanitorYellowPlastic' },
      { bucket: visualBuckets.janitorYellowVinyl, material: this.janitorYellowVinylMaterial, name: 'DC_JanitorYellowVinyl' },
      { bucket: visualBuckets.janitorCautionSign, material: this.janitorCautionSignMaterial, name: 'DC_JanitorCautionSign' },
      { bucket: visualBuckets.janitorSoapyWater, material: this.janitorSoapyWaterMaterial, name: 'DC_JanitorSoapyWater', renderOrder: 1 },
      { bucket: visualBuckets.janitorBluePlastic, material: this.janitorBluePlasticMaterial, name: 'DC_JanitorBluePlastic' },
      { bucket: visualBuckets.janitorCyanBottle, material: this.janitorCyanBottleMaterial, name: 'DC_JanitorCyanBottle' },
      { bucket: visualBuckets.janitorGreenPlastic, material: this.janitorGreenPlasticMaterial, name: 'DC_JanitorGreenPlastic' },
      { bucket: visualBuckets.janitorTowelTan, material: this.janitorTowelTanMaterial, name: 'DC_JanitorTowelTan' },
      { bucket: visualBuckets.janitorBroomBristle, material: this.janitorBroomBristleMaterial, name: 'DC_JanitorBroomBristle' },
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
          if (def.isGlass && typeof mergedGeo.computeBoundsTree === 'function') {
            mergedGeo.computeBoundsTree({ maxLeafTris: 5, strategy: 0 });
          }
          const mesh = new THREE.Mesh(mergedGeo, def.material);
          mesh.name = def.name;
          if (def.isGlass) {
            mesh.userData.isGlass = true;
            this.glassMeshes.push(mesh);
            if (def.name === 'DC_VestibuleGlass') {
              this.glassMesh = mesh;
            }
          }
          if (def.renderOrder !== undefined) {
            mesh.renderOrder = def.renderOrder;
          }
          const exteriorMeshNames = new Set([
            'DC_BalconyFloor',
            'DC_BalconyCurb',
            'DC_BalconyRailMetal',
            'DC_BalconyGlass',
            'DC_BalconyExteriorWall',
            'DC_PatioMetal',
            'DC_PatioTeak',
            'DC_PatioTabletop',
            'DC_PatioUmbrella',
            'DC_PatioCeramic',
            'DC_PatioTray',
            'DC_SkylineTowerA',
            'DC_SkylineTowerB',
            'DC_SkylineTowerC',
            'DC_SkylineTowerD',
            'DC_SkylineTowerRoofs',
            'DC_SkylineRoofTrim',
          ]);
          if (exteriorMeshNames.has(def.name)) {
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            this.exteriorVistaGroup.add(mesh);
          } else {
            group.add(mesh);
          }
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

    // 2. Player Movement Capsule Collider (Includes invisible safety barrier around stairwell opening)
    if (playerOnlyColliderGeometries.length > 0) {
      const playerColliderGeo = BufferGeometryUtils.mergeGeometries(
        [...colliderGeometries, ...playerOnlyColliderGeometries],
        false
      );
      playerColliderGeo.computeVertexNormals();
      playerColliderGeo.computeBoundsTree({
        maxLeafTris: 5,
        strategy: 0
      });
      this.playerColliderMesh = new THREE.Mesh(
        playerColliderGeo,
        new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
      );
      this.playerColliderMesh.name = 'DataCenterPlayerCollider';
      this.scene.add(this.playerColliderMesh);
    } else {
      this.playerColliderMesh = this.weaponColliderMesh;
    }

    for (let i = 0; i < colliderGeometries.length; i++) {
      colliderGeometries[i].dispose();
    }
    for (let i = 0; i < playerOnlyColliderGeometries.length; i++) {
      playerOnlyColliderGeometries[i].dispose();
    }

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

    // 1. Cabinet Chassis (Dark brushed steel rack side panels #1c2028 — visual-only inside sealed pod, bottom & rear faces culled)
    const chassisGeo = createBoxWithoutFaces(w, h, d, ['-y', '+z']);
    addVisual(visualBuckets.serverCabinet, chassisGeo, x, centerY, z, 0, rotY, 0);
    chassisGeo.dispose();

    // 2. Brushed Silver-Grey Frame Trim around front door (0x6c7685 — non-overlapping corners, rear face culled)
    const trimThick = 0.04;
    const trimDepth = 0.03;
    const topTrim = createBoxWithoutFaces(w, trimThick, trimDepth, ['+z']);
    topTrim.translate(0, h / 2 - trimThick / 2, -d / 2 - trimDepth / 2);
    addVisual(visualBuckets.silverTrim, topTrim, x, centerY, z, 0, rotY, 0);
    topTrim.dispose();

    const btmTrim = createBoxWithoutFaces(w, trimThick, trimDepth, ['+z']);
    btmTrim.translate(0, -h / 2 + trimThick / 2, -d / 2 - trimDepth / 2);
    addVisual(visualBuckets.silverTrim, btmTrim, x, centerY, z, 0, rotY, 0);
    btmTrim.dispose();

    const sideTrimH = h - trimThick * 2;
    const sideTrim = createBoxWithoutFaces(trimThick, sideTrimH, trimDepth, ['+z', '+y', '-y']);
    sideTrim.translate(-w / 2 + trimThick / 2, 0, -d / 2 - trimDepth / 2);
    addVisual(visualBuckets.silverTrim, sideTrim, x, centerY, z, 0, rotY, 0);
    sideTrim.dispose();

    const sideTrimR = createBoxWithoutFaces(trimThick, sideTrimH, trimDepth, ['+z', '+y', '-y']);
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
    if (typeof intactGeo.computeBoundsTree === 'function') {
      intactGeo.computeBoundsTree({ maxLeafTris: 2, strategy: 0 });
    }
    const brokenGeo = (screenType === 'bsod' || screenType === 2)
      ? createPlaneFacingPlayer(screenW, screenH, 0.0, 0.0, 1.0, 1.0)
      : intactGeo;
    if (brokenGeo !== intactGeo && typeof brokenGeo.computeBoundsTree === 'function') {
      brokenGeo.computeBoundsTree({ maxLeafTris: 2, strategy: 0 });
    }

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
  _buildCoffeeStation(addVisual, registerCollider, visualBuckets, posX = -9.55, posY = 0.0, posZ = 0.70, rotY = Math.PI / 2) {
    const coffeePos = new THREE.Vector3(posX, posY, posZ);
    const coffeeQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
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
    registerCollider(counterCollider, posX, posY + 0.585, posZ, 0, rotY, 0);
    counterCollider.dispose();

    const machineCollider = new THREE.BoxGeometry(0.58, 1.12, 0.68);
    const machWorldPos = new THREE.Vector3(mx, 1.17 + 0.56, mz).applyMatrix4(coffeeMatrix);
    registerCollider(machineCollider, machWorldPos.x, machWorldPos.y, machWorldPos.z, 0, rotY, 0);
    machineCollider.dispose();
  }

  /**
   * Builds the closed Matte-White Staff Door ("NO ENTRY / STAFF ONLY")
   * Scaled to FPS Hero Scale (matching top header line of glass partition window ~2.65m).
   * Mounted flush against the Left Solid Wall at posX = -10.0m, posZ = -4.0m
   * (cleanly centered between wall outlets at Z = -2.0m and Z = -6.0m).
   *
   * Features:
   * 1. Hero-scale outer casing architrave (~1.32m wide x 2.65m tall, 80mm trim width).
   * 2. Recessed solid matte-white door leaf (1.14m x 2.50m) with dark perimeter shadow seam (0x1e2228).
   * 3. Scaled brushed chrome lever handle on right side of leaf (at waist/hand height Y ≈ 1.18m,
   *    lever length ~0.145m pointing inward to the left) with rosette, collar, spindle, hub, and keyhole escutcheon.
   * 4. Eye-level (Y ≈ 1.78m) procedural "NO ENTRY / STAFF ONLY" sign plaque (0.38m wide x 0.25m tall).
   * 5. Full physics & weapon hitscan collider registration for bullet decals & sparks.
   */
  /**
   * Builds an authentic Hero-Scale Brushed Stainless-Steel Cylindrical Office Trash Bin
   * with black rubber floor ring, cylindrical stainless body, polished chrome top collar,
   * dark recessed dome top with center swing-flap opening, and BVH collider.
   */
  _buildCylindricalTrashBin(addVisual, registerCollider, visualBuckets, binX, binZ) {
    const binR = 0.21;
    const binH = 0.68;

    // 1. Black Rubber Floor Base Ring
    const binBaseGeo = new THREE.CylinderGeometry(binR + 0.004, binR + 0.006, 0.025, 24);
    addVisual(visualBuckets.elevatorPortal, binBaseGeo, binX, 0.013, binZ);
    binBaseGeo.dispose();

    // 2. Brushed Stainless-Steel Cylindrical Body
    const binBodyGeo = new THREE.CylinderGeometry(binR, binR, binH - 0.056, 28);
    addVisual(visualBuckets.elevatorStainless, binBodyGeo, binX, 0.026 + (binH - 0.056) * 0.5, binZ);
    binBodyGeo.dispose();

    // 3. Polished Chrome Upper Rim Collar
    const binRimGeo = new THREE.CylinderGeometry(binR + 0.005, binR + 0.005, 0.030, 28);
    addVisual(visualBuckets.vestibuleChrome, binRimGeo, binX, binH - 0.015, binZ);
    binRimGeo.dispose();

    // 4. Recessed Black Swing-Top Dome Lid
    const binSwingFlapGeo = new THREE.SphereGeometry(binR * 0.86, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.38);
    binSwingFlapGeo.scale(1, 0.42, 1);
    addVisual(visualBuckets.elevatorPortal, binSwingFlapGeo, binX, binH - 0.018, binZ);
    binSwingFlapGeo.dispose();

    // 5. Trash Bin Collider
    const binColliderGeo = new THREE.CylinderGeometry(binR + 0.01, binR + 0.01, binH, 16);
    registerCollider(binColliderGeo, binX, binH * 0.5, binZ);
    binColliderGeo.dispose();
  }

  /**
   * Builds the 3D Hero-Scale Enterprise Multifunction Printer (~0.84m W x 1.44m H x 0.78m D)
   * modeled after the Epson WorkForce Enterprise MFP:
   * - Recessed Roller Base (Y = 0.00m to 0.05m) with charcoal frame and 4 corner casters
   * - Lower Paper Cassette Tower (Y = 0.05m to 0.62m) with 4 pull-out drawers, recessed handles, and paper size slots
   * - Middle Print Engine Cover (Y = 0.62m to 0.98m) with EPSON & PrecisionCore tech badges, side jam handle & louvers
   * - Recessed Charcoal Output Bay / C-Cavity (Y = 0.90m to 1.18m) with angled ribbed tray, paper guides, and printed paper sheets
   * - Top Flatbed Scanner & Automatic Document Feeder - ADF (Y = 1.18m to 1.44m) with platen lift lip, intake cowl, document tray & queued paper
   * - Articulated Tilt-Up Touchscreen Control Panel (Y ≈ 1.16m to 1.32m) with angled neck, power button, Home icon, USB port & high-res procedural UI
   * - Watertight BVH colliders for both player movement and hitscan raycasting
   */
  _buildEnterprisePrinter(addVisual, registerCollider, visualBuckets, posX = 9.53, posY = 0.0, posZ = 7.15, rotY = -Math.PI / 2) {
    const printerPos = new THREE.Vector3(posX, posY, posZ);
    const printerQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
    const printerScale = new THREE.Vector3(1, 1, 1);
    const printerMatrix = new THREE.Matrix4().compose(printerPos, printerQuat, printerScale);

    const applyPrinterPart = (bucket, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0) => {
      const localMat = new THREE.Matrix4().compose(
        new THREE.Vector3(lx, ly, lz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(1, 1, 1)
      );
      const worldMat = printerMatrix.clone().multiply(localMat);
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(worldMat);
      bucket.push(g);
    };

    const w = 0.84;
    const d = 0.78;

    // -------------------------------------------------------------------------
    // 1. RECESSED ROLLER BASE (Y = 0.00m to 0.05m)
    // -------------------------------------------------------------------------
    const basePlinthGeo = new THREE.BoxGeometry(0.80, 0.045, 0.72);
    applyPrinterPart(visualBuckets.printerCharcoal, basePlinthGeo, 0, 0.0225, 0);
    basePlinthGeo.dispose();

    // 4 Corner Swivel Casters
    const casterBracketGeo = new THREE.BoxGeometry(0.045, 0.025, 0.045);
    const casterWheelGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.020, 12);
    casterWheelGeo.rotateZ(Math.PI / 2);
    const casterPositions = [
      [-0.35, -0.31],
      [ 0.35, -0.31],
      [-0.35,  0.31],
      [ 0.35,  0.31]
    ];
    for (const [cx, cz] of casterPositions) {
      applyPrinterPart(visualBuckets.printerCharcoal, casterBracketGeo, cx, 0.035, cz);
      applyPrinterPart(visualBuckets.printerCharcoal, casterWheelGeo, cx, 0.020, cz);
    }
    casterBracketGeo.dispose();
    casterWheelGeo.dispose();

    // -------------------------------------------------------------------------
    // 2. LOWER PAPER CASSETTE TOWER — 4 STACKED DRAWERS (Y = 0.05m to 0.62m)
    // Non-overlapping depth hierarchy: inner carcass stops at Z = +0.370m!
    // Drawer fronts sit at Z = +0.380m (thickness 0.016m -> front face at Z = +0.388m).
    // -------------------------------------------------------------------------
    const lowerTowerH = 0.57;
    // Inner carcass recessed back by 20mm so drawer faces and seams never z-fight with it!
    const lowerTowerCarcass = new THREE.BoxGeometry(w, lowerTowerH, d - 0.020);
    applyPrinterPart(visualBuckets.printerWhite, lowerTowerCarcass, 0, 0.05 + lowerTowerH / 2, -0.010);
    lowerTowerCarcass.dispose();

    // 4 Stacked Drawers (Trays 1 to 4)
    const drawerH = 0.136;
    const drawerGap = 0.005;
    const drawerFrontGeo = new THREE.BoxGeometry(w - 0.004, drawerH, 0.016);
    const drawerSeamGeo = new THREE.BoxGeometry(w, drawerGap, 0.014);
    const handleRecessGeo = new THREE.BoxGeometry(0.18, 0.036, 0.012);
    const handleGripGeo = new THREE.BoxGeometry(0.16, 0.016, 0.008);
    const indicatorSlotGeo = new THREE.BoxGeometry(0.046, 0.022, 0.012);
    const indicatorBadgeGeo = new THREE.BoxGeometry(0.038, 0.016, 0.014);

    const drawerYLevels = [
      0.05 + 0.004 + drawerH * 0.5,
      0.05 + 0.004 + (drawerH + drawerGap) + drawerH * 0.5,
      0.05 + 0.004 + (drawerH + drawerGap) * 2 + drawerH * 0.5,
      0.05 + 0.004 + (drawerH + drawerGap) * 3 + drawerH * 0.5
    ];

    for (let i = 0; i < 4; i++) {
      const dy = drawerYLevels[i];
      // Front drawer face (center at Z = 0.380m, front face at +0.388m)
      applyPrinterPart(visualBuckets.printerWhite, drawerFrontGeo, 0, dy, 0.380);

      // Horizontal shadow seam above drawer (recessed at Z = 0.378m)
      if (i < 3) {
        applyPrinterPart(visualBuckets.printerCharcoal, drawerSeamGeo, 0, dy + drawerH / 2 + drawerGap / 2, 0.378);
      }

      // Center recessed finger-pull handle pocket (inset into drawer face)
      applyPrinterPart(visualBuckets.printerCharcoal, handleRecessGeo, 0, dy + 0.012, 0.384);
      applyPrinterPart(visualBuckets.silverTrim, handleGripGeo, 0, dy + 0.018, 0.388);

      // Right paper-size indicator slot (cleanly proud at Z = 0.388m)
      applyPrinterPart(visualBuckets.printerCharcoal, indicatorSlotGeo, 0.34, dy, 0.385);
      applyPrinterPart(visualBuckets.printerWhite, indicatorBadgeGeo, 0.34, dy, 0.389);
    }
    drawerFrontGeo.dispose();
    drawerSeamGeo.dispose();
    handleRecessGeo.dispose();
    handleGripGeo.dispose();
    indicatorSlotGeo.dispose();
    indicatorBadgeGeo.dispose();

    // -------------------------------------------------------------------------
    // 3. MIDDLE PRINT ENGINE COVER & SIDE PANELS (Y = 0.62m to 0.90m)
    // Non-overlapping: strictly ends at Y = 0.90m where C-cavity starts!
    // -------------------------------------------------------------------------
    const midEngineH = 0.28;
    const midEngineCarcass = new THREE.BoxGeometry(w, midEngineH, d - 0.020);
    applyPrinterPart(visualBuckets.printerWhite, midEngineCarcass, 0, 0.62 + midEngineH / 2, -0.010);
    midEngineCarcass.dispose();

    // Front access door panel (flush with drawer fronts at Z = 0.380m)
    const midDoorGeo = new THREE.BoxGeometry(w - 0.004, midEngineH - 0.006, 0.016);
    applyPrinterPart(visualBuckets.printerWhite, midDoorGeo, 0, 0.62 + midEngineH / 2, 0.380);
    midDoorGeo.dispose();

    // Horizontal seam separating drawers and engine door
    const midSeamGeo = new THREE.BoxGeometry(w, 0.006, 0.014);
    applyPrinterPart(visualBuckets.printerCharcoal, midSeamGeo, 0, 0.62, 0.378);
    midSeamGeo.dispose();

    // Left vertical door seam line (x = -0.16m)
    const vertDoorSeamGeo = new THREE.BoxGeometry(0.004, midEngineH, 0.018);
    applyPrinterPart(visualBuckets.printerCharcoal, vertDoorSeamGeo, -0.16, 0.62 + midEngineH / 2, 0.381);
    vertDoorSeamGeo.dispose();

    // Front PRINTER Badge decal plane (sitting 2mm proud of door face at Z = 0.390m)
    const badgeDecalGeo = new THREE.BoxGeometry(0.56, 0.24, 0.003);
    applyPrinterPart(visualBuckets.printerBadge, badgeDecalGeo, 0.04, 0.76, 0.390);
    badgeDecalGeo.dispose();

    // Right outer side service handle & cooling vents (in middle block Y = 0.65m to 0.88m)
    const sideHandleRecessGeo = new THREE.BoxGeometry(0.014, 0.10, 0.05);
    applyPrinterPart(visualBuckets.printerCharcoal, sideHandleRecessGeo, w / 2 - 0.006, 0.77, 0.10);
    sideHandleRecessGeo.dispose();

    const sideHandleLeverGeo = new THREE.BoxGeometry(0.012, 0.08, 0.022);
    applyPrinterPart(visualBuckets.silverTrim, sideHandleLeverGeo, w / 2 - 0.004, 0.77, 0.10);
    sideHandleLeverGeo.dispose();

    const sideLouverGeo = new THREE.BoxGeometry(0.012, 0.006, 0.20);
    for (let v = 0; v < 5; v++) {
      const vy = 0.68 + v * 0.020;
      applyPrinterPart(visualBuckets.printerCharcoal, sideLouverGeo, w / 2 - 0.005, vy, -0.12);
      applyPrinterPart(visualBuckets.printerCharcoal, sideLouverGeo, -w / 2 + 0.005, vy, -0.12);
    }
    sideLouverGeo.dispose();

    // -------------------------------------------------------------------------
    // 4. RECESSED CHARCOAL OUTPUT BAY / C-CAVITY (Y = 0.90m to 1.18m)
    // Zero Z-fighting on right wall:
    // Right outer casing wall is WHITE (w/2 - 0.025 to w/2), coplanar with entire side!
    // Charcoal inner cavity liner stays strictly inside (x <= 0.39m)!
    // -------------------------------------------------------------------------
    const cavityH = 0.28;
    const pillarW = 0.26;
    const rightWallThick = 0.030;
    const cavityW = w - pillarW - rightWallThick; // 0.55m
    const cavityMidX = -w / 2 + pillarW + cavityW / 2; // +0.115m

    // Left structural scanner support pillar (white outer casing)
    const leftPillarGeo = new THREE.BoxGeometry(pillarW, cavityH, d);
    applyPrinterPart(visualBuckets.printerWhite, leftPillarGeo, -w / 2 + pillarW / 2, 0.90 + cavityH / 2, 0);
    leftPillarGeo.dispose();

    // Right outer structural side wall (solid WHITE, completely eliminates right-side z-fighting!)
    const rightSideWallGeo = new THREE.BoxGeometry(rightWallThick, cavityH, d);
    applyPrinterPart(visualBuckets.printerWhite, rightSideWallGeo, w / 2 - rightWallThick / 2, 0.90 + cavityH / 2, 0);
    rightSideWallGeo.dispose();

    // Charcoal C-Cavity inner walls and ceiling (strictly internal, never touches x = w/2)
    const cavityBackGeo = new THREE.BoxGeometry(cavityW, cavityH, 0.05);
    applyPrinterPart(visualBuckets.printerCharcoal, cavityBackGeo, cavityMidX, 1.04, -d / 2 + 0.035);
    cavityBackGeo.dispose();

    const cavityFloorGeo = new THREE.BoxGeometry(cavityW, 0.025, d - 0.06);
    applyPrinterPart(visualBuckets.printerCharcoal, cavityFloorGeo, cavityMidX, 0.9125, 0);
    cavityFloorGeo.dispose();

    // Inner right charcoal liner (contained inside at x <= 0.39m)
    const cavityRightGeo = new THREE.BoxGeometry(0.010, cavityH, d - 0.06);
    applyPrinterPart(visualBuckets.printerCharcoal, cavityRightGeo, w / 2 - rightWallThick - 0.005, 1.04, 0);
    cavityRightGeo.dispose();

    const cavityCeilingGeo = new THREE.BoxGeometry(cavityW, 0.025, d - 0.06);
    applyPrinterPart(visualBuckets.printerCharcoal, cavityCeilingGeo, cavityMidX, 1.1675, 0);
    cavityCeilingGeo.dispose();

    // Angled Ribbed Black Output Catch Tray
    const trayGeo = new THREE.BoxGeometry(0.44, 0.016, 0.46);
    applyPrinterPart(visualBuckets.printerCharcoal, trayGeo, cavityMidX, 0.95, 0.04, 0.14, 0, 0);
    trayGeo.dispose();

    const trayLipGeo = new THREE.BoxGeometry(0.44, 0.035, 0.016);
    applyPrinterPart(visualBuckets.printerCharcoal, trayLipGeo, cavityMidX, 0.985, 0.26, 0.14, 0, 0);
    trayLipGeo.dispose();

    const trayGuideGeo = new THREE.BoxGeometry(0.014, 0.032, 0.38);
    applyPrinterPart(visualBuckets.printerCharcoal, trayGuideGeo, cavityMidX - 0.18, 0.965, 0.06, 0.14, 0, 0);
    applyPrinterPart(visualBuckets.printerCharcoal, trayGuideGeo, cavityMidX + 0.18, 0.965, 0.06, 0.14, 0, 0);
    trayGuideGeo.dispose();

    // Stack of Printed Paper Sheets Resting on Tray
    const printedPaperGeo = new THREE.BoxGeometry(0.22, 0.012, 0.30);
    applyPrinterPart(visualBuckets.printerPaper, printedPaperGeo, cavityMidX, 0.97, 0.06, 0.14, 0, 0);
    printedPaperGeo.dispose();

    // -------------------------------------------------------------------------
    // 5. TOP FLATBED SCANNER & AUTOMATIC DOCUMENT FEEDER — ADF (Y = 1.18m to 1.45m)
    // Modeled after the authentic Epson WorkForce Enterprise MFP (reference photo):
    // - Flatbed Scanner Platen Deck with front 45° chamfer undercut, dark glass reveal,
    //   recessed handle grip with silver lift trim, and heavy-duty rear hinges
    // - Swept-back aerodynamic ADF cowl on the left with 35° sloped front wedge,
    //   curved injection-molded top crown, maintenance parting seam, and status LED
    // - Sloped intake throat with dark feed slot and 3 rubber separation rollers
    // - Cantilevered Document Input Tray (tilted ~8.6° upward to the right, raised flared
    //   side cheek rails, two adjustable dark charcoal sliding paper guides with finger tabs
    //   and silver alignment indicators, upturned stop lip, and center thumb scoop)
    // - Authentic queued document paper stack resting neatly between the paper guides
    // - Recessed Duplex Document Output Return Cavity underneath the input tray with
    //   recessed dark catch bed, eject roller axle with silver drive tires, and catch stop
    // - Contoured rear structural spine connecting cowl and tray support
    // -------------------------------------------------------------------------
    // A. Flatbed Scanner Platen Deck & Hinges (Y = 1.18m to 1.25m)
    const platenBedGeo = new THREE.BoxGeometry(w, 0.065, d - 0.02);
    applyPrinterPart(visualBuckets.printerWhite, platenBedGeo, 0, 1.18 + 0.0325, -0.01);
    platenBedGeo.dispose();

    // Front lower chamfer undercut (eliminates flat boxy edge)
    const platenBevelGeo = new THREE.BoxGeometry(w - 0.004, 0.030, 0.030);
    applyPrinterPart(visualBuckets.printerWhite, platenBevelGeo, 0, 1.195, 0.365, Math.PI / 4, 0, 0);
    platenBevelGeo.dispose();

    // Dark perimeter glass platen reveal seam
    const platenSeamGeo = new THREE.BoxGeometry(w - 0.01, 0.006, d - 0.03);
    applyPrinterPart(visualBuckets.printerCharcoal, platenSeamGeo, 0, 1.248, -0.01);
    platenSeamGeo.dispose();

    // Front lid lift handle pocket & silver trim
    const platenLiftGripGeo = new THREE.BoxGeometry(0.22, 0.022, 0.020);
    applyPrinterPart(visualBuckets.printerCharcoal, platenLiftGripGeo, 0.04, 1.242, d / 2 - 0.015);
    platenLiftGripGeo.dispose();

    const platenLiftTrimGeo = new THREE.BoxGeometry(0.18, 0.008, 0.008);
    applyPrinterPart(visualBuckets.silverTrim, platenLiftTrimGeo, 0.04, 1.245, d / 2 - 0.005);
    platenLiftTrimGeo.dispose();

    // Two heavy-duty rear scanner hinges at Z = -0.35m
    const hingeCylGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.07, 16);
    hingeCylGeo.rotateZ(Math.PI / 2);
    applyPrinterPart(visualBuckets.printerCharcoal, hingeCylGeo, -0.26, 1.25, -0.35);
    applyPrinterPart(visualBuckets.printerCharcoal, hingeCylGeo,  0.26, 1.25, -0.35);
    hingeCylGeo.dispose();

    // B. ADF Platen Lid Base (Y = 1.251m to 1.280m)
    const adfBaseLidGeo = new THREE.BoxGeometry(w - 0.01, 0.026, d - 0.03);
    applyPrinterPart(visualBuckets.printerWhite, adfBaseLidGeo, 0, 1.264, -0.01);
    adfBaseLidGeo.dispose();

    // C. Left-Side Feeder Housing / Cowl (Solid injection-molded contours, ZERO floating parts)
    // 1. Lower main base block (spans Y = 1.264m to 1.344m, sitting flush on platen lid)
    const cowlBaseGeo = new THREE.BoxGeometry(0.32, 0.080, 0.52);
    applyPrinterPart(visualBuckets.printerWhite, cowlBaseGeo, -0.24, 1.304, 0.00);
    cowlBaseGeo.dispose();

    // 2. Upper cowl hood block (spans Y = 1.344m to 1.384m, width 0.30m, depth 0.44m)
    const cowlUpperHood = new THREE.BoxGeometry(0.30, 0.040, 0.44);
    applyPrinterPart(visualBuckets.printerWhite, cowlUpperHood, -0.24, 1.364, -0.03);
    cowlUpperHood.dispose();

    // 3. Swept-back aerodynamic front wedge (sloping 35° from front nose up to hood)
    const cowlFrontWedge = new THREE.BoxGeometry(0.30, 0.050, 0.12);
    applyPrinterPart(visualBuckets.printerWhite, cowlFrontWedge, -0.24, 1.348, 0.18, 0.40, 0, 0);
    cowlFrontWedge.dispose();

    // 4. Crown top beveled cap (spans Y = 1.384m to 1.398m)
    const cowlCrownGeo = new THREE.BoxGeometry(0.26, 0.014, 0.40);
    applyPrinterPart(visualBuckets.printerWhite, cowlCrownGeo, -0.24, 1.391, -0.03);
    cowlCrownGeo.dispose();

    // 5. Inset longitudinal parting seam (2mm dark groove flush in crown cap, ZERO floating)
    const cowlSeamGeo = new THREE.BoxGeometry(0.003, 0.004, 0.40);
    applyPrinterPart(visualBuckets.printerCharcoal, cowlSeamGeo, -0.24, 1.398, -0.03);
    cowlSeamGeo.dispose();

    // 6. Sloped inner intake funnel flange (facing right toward the paper tray)
    const throatFlangeGeo = new THREE.BoxGeometry(0.045, 0.065, 0.40);
    applyPrinterPart(visualBuckets.printerWhite, throatFlangeGeo, -0.095, 1.330, -0.01, 0, 0, 0.52);
    throatFlangeGeo.dispose();

    // 7. Dark paper feed entry aperture slot & rubber separation rollers
    const intakeMouthGeo = new THREE.BoxGeometry(0.025, 0.016, 0.34);
    applyPrinterPart(visualBuckets.printerCharcoal, intakeMouthGeo, -0.075, 1.326, -0.01);
    intakeMouthGeo.dispose();

    const rollerGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.035, 12);
    rollerGeo.rotateX(Math.PI / 2);
    applyPrinterPart(visualBuckets.printerCharcoal, rollerGeo, -0.072, 1.326, -0.10);
    applyPrinterPart(visualBuckets.printerCharcoal, rollerGeo, -0.072, 1.326,  0.00);
    applyPrinterPart(visualBuckets.printerCharcoal, rollerGeo, -0.072, 1.326, +0.10);
    rollerGeo.dispose();

    // 8. Front document feeder status LED indicator
    const adfStatusLedGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.006, 12);
    adfStatusLedGeo.rotateX(0.40);
    applyPrinterPart(visualBuckets.sffIceBlueLed, adfStatusLedGeo, -0.16, 1.338, 0.22);
    adfStatusLedGeo.dispose();

    // D. Cantilevered Document Input Tray (UNIFIED TRAY MATRIX HIERARCHY — 100% immune to floating!)
    // Tray root coordinates: sits flush against intake mouth at X = -0.06m, Y = 1.326m, Z = -0.01m
    const trayRootX = -0.06;
    const trayRootY = 1.326;
    const trayRootZ = -0.01;
    const trayTiltZ = -0.12; // ~7° natural ergonomic tray tilt

    const trayLocalMat = new THREE.Matrix4().compose(
      new THREE.Vector3(trayRootX, trayRootY, trayRootZ),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, trayTiltZ)),
      new THREE.Vector3(1, 1, 1)
    );
    const trayWorldMat = printerMatrix.clone().multiply(trayLocalMat);

    const applyTrayPart = (bucket, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0) => {
      const partLocalMat = new THREE.Matrix4().compose(
        new THREE.Vector3(lx, ly, lz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(1, 1, 1)
      );
      const worldMat = trayWorldMat.clone().multiply(partLocalMat);
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(worldMat);
      bucket.push(g);
    };

    // 1. Molded Tray Floor (length = 0.44m, depth = 0.42m, thickness = 0.008m)
    // Top surface is EXACTLY at ly = 0.000m!
    const trayFloorGeo = new THREE.BoxGeometry(0.44, 0.008, 0.42);
    applyTrayPart(visualBuckets.printerWhite, trayFloorGeo, 0.22, -0.004, 0.00);
    trayFloorGeo.dispose();

    // 2. Cantilever structural support bracket (ties underside of tray to rear frame)
    const trayStanchionGeo = new THREE.BoxGeometry(0.24, 0.035, 0.035);
    applyTrayPart(visualBuckets.printerWhite, trayStanchionGeo, 0.18, -0.024, -0.19);
    trayStanchionGeo.dispose();

    // 3. Flared side cheek rails (front & rear) — bottom face sits flush at ly = 0.000m!
    const cheekFrontGeo = new THREE.BoxGeometry(0.44, 0.022, 0.008);
    applyTrayPart(visualBuckets.printerWhite, cheekFrontGeo, 0.22, 0.011, 0.206);
    cheekFrontGeo.dispose();

    const cheekRearGeo = new THREE.BoxGeometry(0.44, 0.022, 0.008);
    applyTrayPart(visualBuckets.printerWhite, cheekRearGeo, 0.22, 0.011, -0.206);
    cheekRearGeo.dispose();

    // 4. Two adjustable dark charcoal sliding paper width guides — resting flush at ly = 0.000m!
    const frontGuideGeo = new THREE.BoxGeometry(0.28, 0.022, 0.014);
    applyTrayPart(visualBuckets.printerCharcoal, frontGuideGeo, 0.18, 0.011, 0.135);
    frontGuideGeo.dispose();

    const rearGuideGeo = new THREE.BoxGeometry(0.28, 0.022, 0.014);
    applyTrayPart(visualBuckets.printerCharcoal, rearGuideGeo, 0.18, 0.011, -0.135);
    rearGuideGeo.dispose();

    // Sliding finger grip tabs
    const guideTabGeo = new THREE.BoxGeometry(0.038, 0.028, 0.016);
    applyTrayPart(visualBuckets.printerCharcoal, guideTabGeo, 0.18, 0.014,  0.135);
    applyTrayPart(visualBuckets.printerCharcoal, guideTabGeo, 0.18, 0.014, -0.135);
    guideTabGeo.dispose();

    // Silver alignment arrow marks
    const arrowGeo = new THREE.BoxGeometry(0.012, 0.003, 0.017);
    applyTrayPart(visualBuckets.silverTrim, arrowGeo, 0.18, 0.0285,  0.135);
    applyTrayPart(visualBuckets.silverTrim, arrowGeo, 0.18, 0.0285, -0.135);
    arrowGeo.dispose();

    // 5. Upturned right-end document stop lip & center thumb scoop — resting flush at ly = 0.000m!
    const endLipFrontGeo = new THREE.BoxGeometry(0.010, 0.024, 0.13);
    applyTrayPart(visualBuckets.printerWhite, endLipFrontGeo, 0.435, 0.012, 0.135);
    endLipFrontGeo.dispose();

    const endLipRearGeo = new THREE.BoxGeometry(0.010, 0.024, 0.13);
    applyTrayPart(visualBuckets.printerWhite, endLipRearGeo, 0.435, 0.012, -0.135);
    endLipRearGeo.dispose();

    const endScoopSillGeo = new THREE.BoxGeometry(0.010, 0.008, 0.14);
    applyTrayPart(visualBuckets.printerWhite, endScoopSillGeo, 0.435, 0.004, 0.00);
    endScoopSillGeo.dispose();

    // 6. Queued document sheets — resting flush on tray floor at ly = 0.000m!
    const adfPaperGeo = new THREE.BoxGeometry(0.28, 0.006, 0.25);
    applyTrayPart(visualBuckets.printerPaper, adfPaperGeo, 0.17, 0.003, 0.00);
    adfPaperGeo.dispose();

    // E. Enclosed Duplex Document Output Return Cavity (Solid white plastic, 100% z-fighting free)
    // 1. Lower return tray bed base (rests flush on platen lid at Y = 1.264m)
    const returnBaseGeo = new THREE.BoxGeometry(0.42, 0.012, 0.44);
    applyPrinterPart(visualBuckets.printerWhite, returnBaseGeo, 0.17, 1.270, -0.01);
    returnBaseGeo.dispose();

    // 2. Rear vertical wall of return cavity (solid backing enclosing the gap)
    const returnRearWallGeo = new THREE.BoxGeometry(0.42, 0.075, 0.020);
    applyPrinterPart(visualBuckets.printerWhite, returnRearWallGeo, 0.17, 1.305, -0.22);
    returnRearWallGeo.dispose();

    // 3. Right side end wall riser (supports outer edge and prevents hollow floating appearance)
    const returnRiserGeo = new THREE.BoxGeometry(0.018, 0.045, 0.42);
    applyPrinterPart(visualBuckets.printerWhite, returnRiserGeo, 0.375, 1.295, -0.01);
    returnRiserGeo.dispose();

    // 4. Scanned document eject roller axle and silver tires at inner mouth
    const ejectAxleGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.38, 12);
    ejectAxleGeo.rotateX(Math.PI / 2);
    applyPrinterPart(visualBuckets.printerCharcoal, ejectAxleGeo, -0.065, 1.288, -0.01);
    ejectAxleGeo.dispose();

    const ejectTireGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.020, 12);
    ejectTireGeo.rotateX(Math.PI / 2);
    applyPrinterPart(visualBuckets.silverTrim, ejectTireGeo, -0.065, 1.288, -0.12);
    applyPrinterPart(visualBuckets.silverTrim, ejectTireGeo, -0.065, 1.288,  0.00);
    applyPrinterPart(visualBuckets.silverTrim, ejectTireGeo, -0.065, 1.288, +0.12);
    ejectTireGeo.dispose();

    // 5. Right catch stop lip on return bed (in matching printerWhite, zero overlap & zero z-fighting)
    const returnCatchLipGeo = new THREE.BoxGeometry(0.010, 0.014, 0.38);
    applyPrinterPart(visualBuckets.printerWhite, returnCatchLipGeo, 0.355, 1.283, -0.01);
    returnCatchLipGeo.dispose();

    // F. Rear Structural Spine / Wire Loom Housing
    const rearSpineGeo = new THREE.BoxGeometry(0.64, 0.075, 0.08);
    applyPrinterPart(visualBuckets.printerWhite, rearSpineGeo, 0.02, 1.320, -0.31);
    rearSpineGeo.dispose();

    const spineSeamGeo = new THREE.BoxGeometry(0.64, 0.005, 0.008);
    applyPrinterPart(visualBuckets.printerCharcoal, spineSeamGeo, 0.02, 1.320, -0.268);
    spineSeamGeo.dispose();

    // -------------------------------------------------------------------------
    // 6. ARTICULATED TILT-UP TOUCHSCREEN CONTROL PANEL (Y ≈ 1.16m to 1.34m)
    // Offset forward to Z = 0.44m so rear tilted edge NEVER intersects scanner platen!
    // Balanced, authentic bezel margins on ALL FOUR SIDES (User requested: "wheres the other margin"):
    // - Tablet Housing: 0.32m wide x 0.19m high x 0.024m deep (lx: -0.160m to +0.160m, ly: -0.095m to +0.095m)
    // - Active Screen Display: 0.192m wide x 0.120m high (exact 1.6:1 aspect ratio matching 512x320 canvas!)
    // - Screen positioned at lx = +0.040m, ly = 0.000m:
    //   * Right Bezel Margin: 0.024m (24mm) crisp, bold, dark bezel framing!
    //   * Top & Bottom Bezel Margins: 0.035m (35mm) uniform top/bottom framing!
    //   * Left Bezel Margin: 0.104m (104mm) hosting centered hardware controls at lx = -0.108m
    //     (exactly 52mm from left edge and 52mm from screen, dead-centered!)
    // - Using PlaneGeometry for the screen quad (ZERO thickness, ZERO edge faces! Completely immune to glitched top edge lines!)
    // - Power button, Home button & Status LED neatly integrated
    // -------------------------------------------------------------------------
    const tx = -0.22;
    const ty = 1.22;
    const tz = d / 2 + 0.05; // 0.44m forward clearance
    const tiltX = -0.45;     // ~26° tilt back toward user

    // Angled Neck Support Arm & Hinge
    const neckArmGeo = new THREE.BoxGeometry(0.08, 0.08, 0.12);
    applyPrinterPart(visualBuckets.printerCharcoal, neckArmGeo, tx, 1.16, tz - 0.06);
    neckArmGeo.dispose();

    const hingeGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.10, 14);
    hingeGeo.rotateZ(Math.PI / 2);
    applyPrinterPart(visualBuckets.printerCharcoal, hingeGeo, tx, 1.18, tz - 0.02);
    hingeGeo.dispose();

    // Tablet coordinate transformation
    const tabletLocalMat = new THREE.Matrix4().compose(
      new THREE.Vector3(tx, ty, tz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, 0, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    const tabletWorldMat = printerMatrix.clone().multiply(tabletLocalMat);

    const applyTabletPart = (bucket, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0) => {
      const partLocalMat = new THREE.Matrix4().compose(
        new THREE.Vector3(lx, ly, lz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(1, 1, 1)
      );
      const worldMat = tabletWorldMat.clone().multiply(partLocalMat);
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(worldMat);
      bucket.push(g);
    };

    // Main Tablet Housing Box (0.32m W x 0.19m H x 0.024m D -> front face at z = +0.012m)
    const tabletBoxGeo = new THREE.BoxGeometry(0.32, 0.19, 0.024);
    applyTabletPart(visualBuckets.printerCharcoal, tabletBoxGeo, 0, 0, 0);
    tabletBoxGeo.dispose();

    // Stepped Chamfered Rear Casing
    const tabletBackGeo = new THREE.BoxGeometry(0.30, 0.17, 0.010);
    applyTabletPart(visualBuckets.printerCharcoal, tabletBackGeo, 0, 0, -0.016);
    tabletBackGeo.dispose();

    // Side USB Port Recess on Left Edge
    const usbRecessGeo = new THREE.BoxGeometry(0.014, 0.024, 0.016);
    applyTabletPart(visualBuckets.silverTrim, usbRecessGeo, -0.160, -0.04, 0);
    usbRecessGeo.dispose();

    // Active Screen Display Plane (width: 0.192m, height: 0.120m, z = +0.0122m)
    // Using PlaneGeometry (0 thickness, ZERO top/bottom/side edge faces: 100% immune to glitched top lines!)
    // Spans horizontally from lx = -0.056m to +0.136m; vertically from ly = -0.060m to +0.060m.
    // Perfectly framed with 24mm right bezel, 35mm top/bottom bezels, and 104mm left bezel!
    const screenQuadGeo = new THREE.PlaneGeometry(0.192, 0.120);
    applyTabletPart(visualBuckets.printerScreen, screenQuadGeo, 0.040, 0.000, 0.0122);
    screenQuadGeo.dispose();

    // Left Bezel Hardware Controls (dead-centered at lx = -0.108m, exactly 52mm from edge and 52mm from screen)
    // 1. Circular Glowing Power Button (silver bezel collar + glowing cyan/ice-blue center)
    const powerRingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.004, 16);
    powerRingGeo.rotateX(Math.PI / 2);
    applyTabletPart(visualBuckets.silverTrim, powerRingGeo, -0.108, 0.042, 0.013);
    powerRingGeo.dispose();

    const powerButtonCenterGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.005, 16);
    powerButtonCenterGeo.rotateX(Math.PI / 2);
    applyTabletPart(visualBuckets.sffIceBlueLed, powerButtonCenterGeo, -0.108, 0.042, 0.014);
    powerButtonCenterGeo.dispose();

    // 2. White Home Icon Button (positioned on left bezel at ly = -0.005m)
    const homeBtnGeo = new THREE.BoxGeometry(0.016, 0.016, 0.004);
    applyTabletPart(visualBuckets.silverTrim, homeBtnGeo, -0.108, -0.005, 0.0135);
    homeBtnGeo.dispose();

    // 3. Status LED Strip (positioned on left bezel at ly = -0.048m)
    const ledStripGeo = new THREE.BoxGeometry(0.022, 0.006, 0.004);
    applyTabletPart(visualBuckets.sffIceBlueLed, ledStripGeo, -0.108, -0.048, 0.0135);
    ledStripGeo.dispose();

    // -------------------------------------------------------------------------
    // 7. WATERTIGHT BVH COLLIDERS (Physics movement & Weapon hitscan bullet decals)
    // -------------------------------------------------------------------------
    // Lower Drawer Tower Collider
    const colBase = new THREE.BoxGeometry(w, 0.62, d);
    const posBase = new THREE.Vector3(0, 0.31, 0).applyMatrix4(printerMatrix);
    registerCollider(colBase, posBase.x, posBase.y, posBase.z, 0, rotY, 0);
    colBase.dispose();

    // Middle Engine Block & Left Pillar Collider
    const colMid = new THREE.BoxGeometry(w, 0.56, d);
    const posMid = new THREE.Vector3(0, 0.62 + 0.28, 0).applyMatrix4(printerMatrix);
    registerCollider(colMid, posMid.x, posMid.y, posMid.z, 0, rotY, 0);
    colMid.dispose();

    // Top Scanner & ADF Deck Collider
    const colTop = new THREE.BoxGeometry(w, 0.28, d);
    const posTop = new THREE.Vector3(0, 1.18 + 0.14, 0).applyMatrix4(printerMatrix);
    registerCollider(colTop, posTop.x, posTop.y, posTop.z, 0, rotY, 0);
    colTop.dispose();

    // Articulated Tablet Touchscreen Collider
    const colTab = new THREE.BoxGeometry(0.33, 0.20, 0.08);
    const posTab = new THREE.Vector3(tx, ty, tz).applyMatrix4(printerMatrix);
    registerCollider(colTab, posTab.x, posTab.y, posTab.z, tiltX, rotY, 0);
    colTab.dispose();
  }

  _buildStaffDoor(addPart, addVisual, arg3, arg4, arg5 = -10.0, arg6 = 0.0, arg7 = -4.0) {
    let registerCollider = null;
    let visualBuckets;
    let posX = -10.0;
    let posY = 0.0;
    let posZ = -4.0;

    if (typeof arg3 === 'function') {
      registerCollider = arg3;
      visualBuckets = arg4;
      if (arg5 !== undefined) posX = arg5;
      if (arg6 !== undefined) posY = arg6;
      if (arg7 !== undefined) posZ = arg7;
    } else {
      visualBuckets = arg3;
      if (arg4 !== undefined) posX = arg4;
      if (arg5 !== undefined) posY = arg5;
      if (arg6 !== undefined) posZ = arg6;
    }

    // Hero-Scale Dimensions:
    // Aligns with the 2.649m top header line of the glass partition window & vestibule doorway on the same wall!
    const frameH = 2.650; // Total outer casing height (matching 2.649m header line)
    const trimW = 0.080;  // 80mm architrave trim width
    const trimD = 0.030;  // 30mm casing projection from wall (proud)
    const openH = frameH - trimW; // 2.570m clear height inside casing
    const openW = 1.150;  // 1.150m clear width inside casing
    const frameW = openW + trimW * 2.0; // 1.310m total outer frame width
    const frameCenterX = posX + trimD * 0.5; // -9.985m

    // 1. Outer Frame / Architrave (0xf0f2f5, roughness: 0.55)
    // Left Jamb (at +Z side) — height openH (jambs meet bottom of header casing seamlessly)
    const jambGeo = new THREE.BoxGeometry(trimD, openH, trimW);
    const leftJambZ = posZ + openW * 0.5 + trimW * 0.5; // -3.385m
    const jambY = posY + openH * 0.5; // 1.285m
    addPart(visualBuckets.staffDoorFrame, jambGeo, frameCenterX, jambY, leftJambZ, 0, 0, 0, true);

    // Right Jamb (at -Z side)
    const rightJambZ = posZ - openW * 0.5 - trimW * 0.5; // -4.615m
    addPart(visualBuckets.staffDoorFrame, jambGeo, frameCenterX, jambY, rightJambZ, 0, 0, 0, true);
    jambGeo.dispose();

    // Top Header Casing (spans entire width: frameW = 1.310m, seated directly atop the jambs)
    const headerGeo = new THREE.BoxGeometry(trimD, trimW, frameW);
    const headerY = posY + openH + trimW * 0.5; // 2.610m (bottom at 2.570m, top reaches 2.650m)
    addPart(visualBuckets.staffDoorFrame, headerGeo, frameCenterX, headerY, posZ, 0, 0, 0, true);
    headerGeo.dispose();

    // 2. Dark Perimeter Shadow Gap Seam (0x1e2228, roughness: 0.90)
    // Backing reveal layer inside opening behind the door leaf
    const seamD = 0.012;
    const seamGeo = new THREE.BoxGeometry(seamD, openH, openW);
    addVisual(visualBuckets.staffDoorSeam, seamGeo, posX + seamD * 0.5, posY + openH * 0.5, posZ);
    seamGeo.dispose();

    // 3. Recessed Matte-White Door Leaf (0xf7f8fa, roughness: 0.50)
    // Borders perfectly aligned with the door frame opening with exact 2.5mm uniform reveal on top, left & right!
    const revealGap = 0.0025; // 2.5mm exact uniform architectural reveal gap
    const floorGap = 0.008;   // 8mm floor clearance gap
    const leafW = openW - revealGap * 2.0; // 1.145m (exactly 2.5mm from left & right jambs)
    const leafTopY = openH - revealGap;    // 2.5675m (exactly 2.5mm from top header soffit)
    const leafBottomY = posY + floorGap;   // 0.008m
    const leafH = leafTopY - leafBottomY;  // 2.5595m
    const leafCenterY = (leafTopY + leafBottomY) * 0.5; // 1.28775m
    const leafD = 0.024; // 24mm thick solid flush door leaf
    const leafFrontX = posX + 0.002 + leafD; // -9.974m (subtle 4mm architectural recess inside casing at -9.970m)
    const leafCenterX = posX + 0.002 + leafD * 0.5; // -9.986m

    const leafGeo = new THREE.BoxGeometry(leafD, leafH, leafW);
    addPart(visualBuckets.staffDoorLeaf, leafGeo, leafCenterX, leafCenterY, posZ, 0, 0, 0, true);
    leafGeo.dispose();

    // 4. Procedural Brazilian Portuguese "AVISO / ACESSO RESTRITO" Sign Plaque (0.38m wide x 0.266m tall x 0.004m thick)
    // Mounted flush on door leaf at eye level (Y ≈ 1.78m), horizontally centered on the door leaf (Z = posZ)
    const signW = 0.380; // width along Z
    const signH = 0.266; // height along Y (~0.38m x 0.266m matches 600x420 aspect ratio)
    const signD = 0.004; // 4mm thickness
    const signGeo = new THREE.BoxGeometry(signD, signH, signW);
    const signX = leafFrontX + signD * 0.5; // -9.972m
    const signY = 1.78;
    addPart(visualBuckets.staffDoorSign, signGeo, signX, signY, posZ, 0, 0, 0, true);
    signGeo.dispose();

    // 5. Hero-Scale Brushed Chrome Lever Handle (0xd8dde4, metalness: 0.88, roughness: 0.18)
    // Mounted on right side of leaf at natural ergonomic hand height (Y ≈ 1.30m on 2.65m hero door)
    const handleBackset = 0.085; // 85mm from right leaf edge
    const handleZ = posZ - leafW * 0.5 + handleBackset; // -4.4875m
    const handleY = 1.30;

    // A. Circular Rosette Backplate (diameter 68mm, thickness 7mm)
    const rosetteGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.007, 24);
    rosetteGeo.rotateZ(Math.PI * 0.5);
    addVisual(visualBuckets.staffDoorHandle, rosetteGeo, leafFrontX + 0.0035, handleY, handleZ);
    rosetteGeo.dispose();

    // Rosette beveled base collar (diameter 76mm, thickness 2.5mm)
    const collarGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.0025, 24);
    collarGeo.rotateZ(Math.PI * 0.5);
    addVisual(visualBuckets.staffDoorHandle, collarGeo, leafFrontX + 0.0012, handleY, handleZ);
    collarGeo.dispose();

    // B. Cylindrical Spindle Neck (diameter 24mm, length 26mm)
    const spindleGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.026, 18);
    spindleGeo.rotateZ(Math.PI * 0.5);
    const spindleX = leafFrontX + 0.007 + 0.013; // -9.958m
    addVisual(visualBuckets.staffDoorHandle, spindleGeo, spindleX, handleY, handleZ);
    spindleGeo.dispose();

    // C. Elbow Hub (connecting spindle to lever)
    const hubGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.024, 18);
    hubGeo.rotateX(Math.PI * 0.5);
    const hubX = leafFrontX + 0.033; // -9.945m
    addVisual(visualBuckets.staffDoorHandle, hubGeo, hubX, handleY, handleZ);
    hubGeo.dispose();

    // D. Horizontal Contoured Lever Bar (~0.145m long, pointing inward to the left (+Z))
    const leverLen = 0.145;
    const leverGeo = new THREE.CylinderGeometry(0.0105, 0.0095, leverLen, 18);
    leverGeo.rotateX(Math.PI * 0.5);
    const leverZ = handleZ + leverLen * 0.5; // -4.4125m
    addVisual(visualBuckets.staffDoorHandle, leverGeo, hubX, handleY, leverZ);
    leverGeo.dispose();

    // E. Rounded Lever Tip (sphere at end of lever)
    const tipGeo = new THREE.SphereGeometry(0.010, 14, 14);
    addVisual(visualBuckets.staffDoorHandle, tipGeo, hubX, handleY, handleZ + leverLen);
    tipGeo.dispose();

    // F. Keyhole / Escutcheon Plate (115mm below handle at Y ≈ 1.065m)
    const keyplateGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.006, 20);
    keyplateGeo.rotateZ(Math.PI * 0.5);
    const keyplateY = handleY - 0.115;
    addVisual(visualBuckets.staffDoorHandle, keyplateGeo, leafFrontX + 0.003, keyplateY, handleZ);
    keyplateGeo.dispose();

    const keyholeGeo = new THREE.BoxGeometry(0.004, 0.015, 0.005);
    addVisual(visualBuckets.staffDoorSeam, keyholeGeo, leafFrontX + 0.006, keyplateY, handleZ);
    keyholeGeo.dispose();

    // G. Handle Collider (for weapon hitscan raycasting)
    if (typeof registerCollider === 'function') {
      const handleColliderGeo = new THREE.BoxGeometry(0.08, 0.26, 0.24);
      registerCollider(handleColliderGeo, leafFrontX + 0.030, handleY - 0.055, handleZ + leverLen * 0.40);
      handleColliderGeo.dispose();
    }
  }

  /**
   * Builds the lush Potted Areca Palm Plant (Palmeira Areca) in the back-right corner (+40% Hero Scale).
   * White tapered ceramic pot (Y = 0.0 to 0.60m) with rim collar and dark soil disc,
   * 16 clustered golden-green cane stems with node rings,
   * and 24 arching 3D feathered palm fronds across 3 natural tiers reaching Y ~ 2.45m!
   */
  _buildArecaPalm(
    addVisual,
    registerCollider,
    visualBuckets,
    px = 9.2,
    py = 0.0,
    pz = -8.8,
    scale = 1.0,
    frondSpreadScale = 1.0
  ) {
    const reachScale = scale * frondSpreadScale;
    const isCompactCorner = frondSpreadScale < 0.85;

    // 1. Tapered White Ceramic Planter Pot (Y = 0.0 to 0.60m * scale)
    const potH = 0.60 * scale;
    const potGeo = new THREE.CylinderGeometry(0.34 * scale, 0.26 * scale, potH, 24, 1, false);
    addVisual(visualBuckets.palmPot, potGeo, px, py + potH * 0.5, pz);
    potGeo.dispose();

    // Stepped Top Rim Collar (radius 0.36m * scale, height 0.06m * scale)
    const collarGeo = new THREE.CylinderGeometry(0.36 * scale, 0.36 * scale, 0.06 * scale, 24, 1, false);
    addVisual(visualBuckets.palmPot, collarGeo, px, py + 0.57 * scale, pz);
    collarGeo.dispose();

    // Dark Potting Soil Disc (Y = 0.56m * scale)
    const soilGeo = new THREE.CylinderGeometry(0.33 * scale, 0.33 * scale, 0.02 * scale, 24);
    addVisual(visualBuckets.palmSoil, soilGeo, px, py + 0.56 * scale, pz);
    soilGeo.dispose();

    // 2. Clustered Golden-Green Cane Stems (16 stems)
    const stemRingGeo = new THREE.CylinderGeometry(0.012 * scale, 0.012 * scale, 0.008 * scale, 8);
    for (let i = 0; i < 16; i++) {
      const az = (i / 16) * Math.PI * 2 + 0.08 * Math.sin(i * 1.5);
      const r0 = (0.045 + 0.045 * ((i % 3) / 2)) * reachScale;
      const r1 = (0.16 + 0.12 * (((i * 5) % 4) / 3)) * reachScale;
      const hStem = (0.85 + 0.35 * (((i * 7) % 10) / 10)) * scale;

      const stemGeo = new THREE.CylinderGeometry(0.008 * scale, 0.015 * scale, hStem, 8);
      const midR = (r0 + r1) / 2;
      const stemX = px + midR * Math.cos(az);
      const stemZ = pz + midR * Math.sin(az);
      const stemY = py + 0.56 * scale + hStem / 2;

      const tilt = 0.14 * frondSpreadScale;
      const rotX = Math.sin(az) * tilt;
      const rotZ = -Math.cos(az) * tilt;

      addVisual(visualBuckets.palmStems, stemGeo, stemX, stemY, stemZ, rotX, 0, rotZ);
      stemGeo.dispose();

      // Bamboo node rings
      addVisual(visualBuckets.palmStems, stemRingGeo, stemX, stemY - hStem * 0.25, stemZ, rotX, 0, rotZ);
      addVisual(visualBuckets.palmStems, stemRingGeo, stemX, stemY + hStem * 0.25, stemZ, rotX, 0, rotZ);
    }
    stemRingGeo.dispose();

    // 3. Arching 3D Feathered Palm Fronds (24 fronds across 3 natural tiers)
    const _p = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3(1, 1, 1);
    const _m = new THREE.Matrix4();
    const _e = new THREE.Euler();

    // Tier 1: Lower Drooping Fronds (8 fronds, droop low and spread wide)
    for (let j = 0; j < 8; j++) {
      const az = (j / 8) * Math.PI * 2 + 0.15;
      const len = (1.35 + 0.08 * (j % 3)) * reachScale;
      const w = 0.48 * scale;
      const archRise = 0.25 * scale;
      const droop = 0.65 * reachScale;
      const elev = isCompactCorner ? 0.16 : -0.22;

      const startR = 0.24 * reachScale;
      const fx = px + startR * Math.cos(az);
      const fy = py + (0.92 + 0.05 * (j % 3)) * scale;
      const fz = pz + startR * Math.sin(az);

      const fGeo = createCurvedPalmFrondGeometry(len, w, archRise, droop, 0.026 * scale);
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
      const len = (1.55 + 0.10 * (j % 3)) * reachScale;
      const w = 0.50 * scale;
      const archRise = 0.36 * scale;
      const droop = 0.48 * reachScale;
      const elev = isCompactCorner ? 0.58 : 0.48;

      const startR = 0.18 * reachScale;
      const fx = px + startR * Math.cos(az);
      const fy = py + (1.20 + 0.06 * (j % 3)) * scale;
      const fz = pz + startR * Math.sin(az);

      const fGeo = createCurvedPalmFrondGeometry(len, w, archRise, droop, 0.030 * scale);
      _p.set(fx, fy, fz);
      _e.set(-elev, -az, 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      fGeo.applyMatrix4(_m);
      visualBuckets.palmFronds.push(fGeo);
    }

    // Tier 3: Tall Upright Center Fronds (7 fronds)
    for (let j = 0; j < 7; j++) {
      const az = (j / 7) * Math.PI * 2 + 0.08;
      const len = (1.70 + 0.12 * (j % 3)) * (isCompactCorner ? scale * 0.62 : reachScale);
      const w = 0.48 * scale;
      const archRise = 0.45 * scale;
      const droop = 0.34 * reachScale;
      const elev = isCompactCorner ? 1.08 : 1.02;

      const startR = 0.11 * reachScale;
      const fx = px + startR * Math.cos(az);
      const fy = py + (1.45 + 0.08 * (j % 3)) * scale;
      const fz = pz + startR * Math.sin(az);

      const fGeo = createCurvedPalmFrondGeometry(len, w, archRise, droop, 0.032 * scale);
      _p.set(fx, fy, fz);
      _e.set(-elev, -az, 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      fGeo.applyMatrix4(_m);
      visualBuckets.palmFronds.push(fGeo);
    }

    // 4. Planter Pot Physics & Hitscan Collider
    const potCollider = new THREE.CylinderGeometry(0.36 * scale, 0.36 * scale, potH, 12);
    registerCollider(potCollider, px, py + potH * 0.5, pz);
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

  /**
   * Builds the Corporate Access Vestibule (Glass Partition Window, Open Aluminum-Framed Glass Door,
   * Glossy Nero Marquina Black Marble Landing, Descending Stairwell with Chrome Guardrails & Dark Void,
   * Brushed Stainless Double Elevator Doors, Illuminated EXIT Sign, and Cylindrical Office Trash Bin)
   * along the Left Wall (X = -10.0m, opposite the AC/coffee/stanchions wall).
   */
  _buildCorporateAccessVestibule(
    addPart,
    addVisual,
    registerCollider,
    registerPlayerOnlyCollider,
    visualBuckets,
    group,
    addPartMatrix
  ) {
    // =========================================================================
    // 1. GLASS PARTITION WINDOW & STONE WINDOWSILL (Z = +1.70 to +9.50, Y = 1.08 to 2.65m)
    // =========================================================================
    const winZStart = 1.703;
    const winZEnd = 9.497;
    const winLen = winZEnd - winZStart; // 7.794m (3mm inset from jambs to prevent Z-fighting)
    const winZCenter = (winZStart + winZEnd) * 0.5; // 5.60m
    const wallX = -10.105; // Center of partition wall + vestibule cladding (X = -10.00 to -10.21)

    // A. Beige / Light-Gray Stone Windowsill Cap Ledge (Y = 1.081m to 1.125m, overhanging slightly)
    const sillH = 0.044;
    const sillW = 0.27; // Overhangs cleanly on both office (-9.970) and vestibule (-10.240) sides
    const sillY = 1.081 + sillH * 0.5;
    const sillGeo = new THREE.BoxGeometry(sillW, sillH, winLen);
    addPart(visualBuckets.vestibuleSill, sillGeo, wallX, sillY, winZCenter, 0, 0, 0, true);
    sillGeo.dispose();

    // B. Slim Anodized Silver Aluminum Window Perimeter Frame Channels
    const winBottomY = 1.126;
    const winTopY = 2.649;
    const winClearH = winTopY - winBottomY;
    const winMidY = (winBottomY + winTopY) * 0.5;
    const frameThick = 0.032;
    const frameDepthX = 0.216; // Spans full 21cm wall opening thickness (-9.997 to -10.213) to seal window reveals

    const horizChannelGeo = new THREE.BoxGeometry(frameDepthX, frameThick, winLen);
    // Bottom U-channel sitting on stone sill
    addPart(visualBuckets.vestibuleAlumFrame, horizChannelGeo, wallX, winBottomY + frameThick * 0.5, winZCenter);
    // Top U-channel under upper wall header
    addPart(visualBuckets.vestibuleAlumFrame, horizChannelGeo, wallX, winTopY - frameThick * 0.5, winZCenter);
    horizChannelGeo.dispose();

    const vertChannelH = winClearH - frameThick * 2 - 0.002;
    const vertChannelGeo = new THREE.BoxGeometry(frameDepthX, vertChannelH, frameThick);
    // Right jamb channel (Z = +1.703)
    addPart(visualBuckets.vestibuleAlumFrame, vertChannelGeo, wallX, winMidY, winZStart + frameThick * 0.5);
    // Left jamb channel (Z = +9.497)
    addPart(visualBuckets.vestibuleAlumFrame, vertChannelGeo, wallX, winMidY, winZEnd - frameThick * 0.5);
    vertChannelGeo.dispose();

    // C. 4 Large Clear Architectural Glass Panes & 3 Thin Vertical Butt-Joint Seams
    const innerZSpan = winLen - frameThick * 2 - 0.002;
    const numPanes = 4;
    const seamWidthZ = 0.010;
    const paneSpanZ = (innerZSpan - seamWidthZ * (numPanes - 1)) / numPanes;
    const paneGeo = new THREE.BoxGeometry(0.012, vertChannelH - 0.002, paneSpanZ);
    const seamGeo = new THREE.BoxGeometry(0.018, vertChannelH - 0.002, seamWidthZ - 0.002);

    for (let p = 0; p < numPanes; p++) {
      const pz = (winZStart + frameThick + 0.001) + paneSpanZ * 0.5 + p * (paneSpanZ + seamWidthZ);
      addVisual(visualBuckets.vestibuleGlass, paneGeo, wallX, winMidY, pz);
      if (p < numPanes - 1) {
        const sz = pz + paneSpanZ * 0.5 + seamWidthZ * 0.5;
        addVisual(visualBuckets.vestibuleGlassSeam, seamGeo, wallX, winMidY, sz);
      }
    }
    paneGeo.dispose();
    seamGeo.dispose();

    // Player-only barrier for the glass window opening (weapon raycasts hit DC_VestibuleGlass directly for glass decals!)
    const windowColliderGeo = new THREE.BoxGeometry(0.16, winClearH, winLen);
    registerPlayerOnlyCollider(windowColliderGeo, wallX, winMidY, winZCenter);
    windowColliderGeo.dispose();

    // =========================================================================
    // 2. OPEN ALUMINUM-FRAMED GLASS DOOR (Z = +9.75 to +10.85, Y = 0.0 to 2.65m — ALIGNED WITH GLASS WALL)
    // =========================================================================
    const doorZMin = 9.752;
    const doorZMax = 10.848;
    const doorZMid = (doorZMin + doorZMax) * 0.5; // 10.30m
    const doorOpenH = 2.649; // Top-aligned with winTopY (2.649m)
    const jambThickZ = 0.040;
    const jambDepthX = 0.222; // Proud by 6mm on both office (-9.994) and vestibule (-10.216) sides

    // A. Outer Silver/White Aluminum Door Frame Lining the Opening (Zero overlap between jambs & header)
    const jambVertH = doorOpenH - jambThickZ - 0.005;
    const doorJambGeo = new THREE.BoxGeometry(jambDepthX, jambVertH, jambThickZ);
    // Left Jamb (Z = 10.828, near server racks corner)
    addPart(visualBuckets.vestibuleAlumFrame, doorJambGeo, wallX, 0.004 + jambVertH * 0.5, doorZMax - jambThickZ * 0.5);
    // Right Jamb (Z = 9.772, next to center pillar)
    addPart(visualBuckets.vestibuleAlumFrame, doorJambGeo, wallX, 0.004 + jambVertH * 0.5, doorZMin + jambThickZ * 0.5);
    doorJambGeo.dispose();

    const doorHeaderFullZ = doorZMax - doorZMin;
    const doorHeaderGeo = new THREE.BoxGeometry(jambDepthX, jambThickZ, doorHeaderFullZ);
    addPart(visualBuckets.vestibuleAlumFrame, doorHeaderGeo, wallX, doorOpenH - jambThickZ * 0.5, doorZMid);
    doorHeaderGeo.dispose();

    // Flush Brushed Stainless Doorway Threshold Strip at Y = 0.001m to 0.004m
    const doorClearZ = doorHeaderFullZ - jambThickZ * 2 - 0.004;
    const thresholdGeo = new THREE.BoxGeometry(0.210, 0.003, doorClearZ);
    addVisual(visualBuckets.elevatorStainless, thresholdGeo, wallX, 0.0025, doorZMid);
    thresholdGeo.dispose();

    // B. Swung-Open Aluminum-Framed Glass Door Leaf (Swung Open INTO the Main Office Room!)
    // Hinged on the main-office-side left jamb at (X = -9.985, Z = 10.805)
    const hingeX = -9.985;
    const hingeZ = 10.805;
    const doorLeafW = 0.96;
    const doorLeafH = 2.55; // Taller leaf matching the 2.65m top-aligned door frame
    const doorLeafBottomY = 0.015;
    const doorLeafMidY = doorLeafBottomY + doorLeafH * 0.5;
    // In Three.js right-handed Y-rotation: local +Z maps to (+sin(rotY), 0, +cos(rotY))
    // For rotY = +Math.PI * 0.42 (+75.6 deg): sin = +0.969 (into +X main office!), cos = +0.249 (toward +Z corner wall!)
    const doorYaw = Math.PI * 0.42;
    const dirX = Math.sin(doorYaw);
    const dirZ = Math.cos(doorYaw);
    const normX = Math.cos(doorYaw);
    const normZ = -Math.sin(doorYaw);

    const addDoorLeafPart = (bucket, lenU, lenY, lenW, uCenter, yCenter, wOffset = 0, collidable = false) => {
      const wx = hingeX + dirX * uCenter + normX * wOffset;
      const wz = hingeZ + dirZ * uCenter + normZ * wOffset;
      const box = new THREE.BoxGeometry(lenW, lenY, lenU);
      addPart(bucket, box, wx, yCenter, wz, 0, doorYaw, 0, collidable);
      box.dispose();
    };

    const stileW = 0.075;
    const railH = 0.085;
    const leafThick = 0.042;

    // Hinge stile (u = 0 to 0.075)
    addDoorLeafPart(visualBuckets.vestibuleAlumFrame, stileW, doorLeafH, leafThick, stileW * 0.5, doorLeafMidY, 0, true);
    // Lock stile (u = 0.885 to 0.96)
    addDoorLeafPart(visualBuckets.vestibuleAlumFrame, stileW, doorLeafH, leafThick, doorLeafW - stileW * 0.5, doorLeafMidY, 0, true);
    // Bottom & Top rails (strictly between the two stiles with 1mm clearance)
    const innerGlassW = doorLeafW - stileW * 2 - 0.002;
    addDoorLeafPart(visualBuckets.vestibuleAlumFrame, innerGlassW, railH, leafThick, doorLeafW * 0.5, doorLeafBottomY + railH * 0.5, 0, true);
    addDoorLeafPart(visualBuckets.vestibuleAlumFrame, innerGlassW, railH, leafThick, doorLeafW * 0.5, doorLeafBottomY + doorLeafH - railH * 0.5, 0, true);

    // Clear glass insert inside door leaf (weapon raycasts hit DC_VestibuleGlass directly for glass decals!)
    const innerGlassH = doorLeafH - railH * 2 - 0.002;
    addDoorLeafPart(visualBuckets.vestibuleGlass, innerGlassW, innerGlassH, 0.010, doorLeafW * 0.5, doorLeafMidY, 0, false);
    const doorGlassPlayerCol = new THREE.BoxGeometry(0.06, innerGlassH, innerGlassW);
    registerPlayerOnlyCollider(
      doorGlassPlayerCol,
      hingeX + dirX * (doorLeafW * 0.5),
      doorLeafMidY,
      hingeZ + dirZ * (doorLeafW * 0.5),
      0,
      doorYaw,
      0
    );
    doorGlassPlayerCol.dispose();

    // 3 Chrome Barrel Hinges along the hinge axis (u = 0)
    const barrelHingeGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.095, 12);
    for (const hy of [0.42, 1.29, 2.16]) {
      addVisual(visualBuckets.vestibuleChrome, barrelHingeGeo, hingeX, hy, hingeZ);
    }
    barrelHingeGeo.dispose();

    // Keyhole cylinder lock escutcheon on lock stile (u = doorLeafW - stileW * 0.5, Y = 1.00m)
    addDoorLeafPart(visualBuckets.vestibuleChrome, 0.034, 0.065, leafThick + 0.010, doorLeafW - stileW * 0.5, 1.00, 0, false);

    // Long Vertical Polished Chrome Pull Bar Handle (on both sides of the door leaf, u = doorLeafW - 0.13m, Y = 0.65m to 1.51m)
    const handleU = doorLeafW - 0.13;
    const handleYMin = 0.65;
    const handleYMax = 1.51;
    const handleYMid = (handleYMin + handleYMax) * 0.5;
    const handleLen = handleYMax - handleYMin;

    const pullBarGeo = new THREE.CylinderGeometry(0.014, 0.014, handleLen, 14);
    const standoffGeo = new THREE.BoxGeometry(0.036, 0.022, 0.022);
    for (const sideSign of [-1, 1]) {
      const wOff = sideSign * (leafThick * 0.5 + 0.038);
      const bx = hingeX + dirX * handleU + normX * wOff;
      const bz = hingeZ + dirZ * handleU + normZ * wOff;
      addVisual(visualBuckets.vestibuleChrome, pullBarGeo, bx, handleYMid, bz);

      const sOff = sideSign * (leafThick * 0.5 + 0.019);
      const sx = hingeX + dirX * handleU + normX * sOff;
      const sz = hingeZ + dirZ * handleU + normZ * sOff;
      addVisual(visualBuckets.vestibuleChrome, standoffGeo, sx, handleYMin + 0.06, sz, 0, doorYaw, 0);
      addVisual(visualBuckets.vestibuleChrome, standoffGeo, sx, handleYMax - 0.06, sz, 0, doorYaw, 0);
    }
    pullBarGeo.dispose();
    standoffGeo.dispose();

    // =========================================================================
    // 3. CORPORATE ACCESS VESTIBULE ROOM (X = -10.21 to -14.20, Z = +1.20 to +11.30)
    // =========================================================================
    // Note: Main office Left Wall occupies X = -10.000 to -10.180 (with -X back face stripped).
    // Vestibule cladding occupies X = -10.185 to -10.210 (5mm internal air gap -> ZERO Z-fighting!).
    const vestXEast = -10.210;
    const vestXWest = -14.200;
    const vestZSouth = 1.200;
    const vestZNorth = 11.300;
    const vestW = vestXEast - vestXWest; // 3.99m
    const vestL = vestZNorth - vestZSouth; // 10.10m
    const vestXMid = (vestXEast + vestXWest) * 0.5; // -12.205m
    const vestZMid = (vestZSouth + vestZNorth) * 0.5; // 6.25m
    const vestH = 3.80;

    // A. Perimeter Matte Off-White Plaster Walls & Ceiling (Strictly X <= -10.182, zero overlap with office wall!)
    // West Wall (X = -14.450 to -14.200, Z = 0.950 to 11.550)
    const westWallGeo = new THREE.BoxGeometry(0.25, vestH, vestL + 0.50);
    addPart(visualBuckets.vestibuleWhiteWall, westWallGeo, vestXWest - 0.125, vestH * 0.5, vestZMid);
    westWallGeo.dispose();

    // South End Wall (Z = 0.950 to 1.200, X = -14.198 to -10.182 -> 18.2cm away from office wall face X = -10.00!)
    const endWallSpanX = (-10.182) - (-14.198);
    const endWallMidX = (-10.182 + -14.198) * 0.5;
    const southWallGeo = new THREE.BoxGeometry(endWallSpanX, vestH, 0.25);
    addPart(visualBuckets.vestibuleWhiteWall, southWallGeo, endWallMidX, vestH * 0.5, vestZSouth - 0.125);
    southWallGeo.dispose();

    // North Elevator Wall (Z = 11.300 to 11.550, X = -14.198 to -10.182 -> 18.2cm away from office wall face X = -10.00!)
    const northWallGeo = new THREE.BoxGeometry(endWallSpanX, vestH, 0.25);
    addPart(visualBuckets.vestibuleWhiteWall, northWallGeo, endWallMidX, vestH * 0.5, vestZNorth + 0.125);
    northWallGeo.dispose();

    // Vestibule Ceiling Slab (Y = 3.802m to 3.962m, strictly above walls)
    const vestCeilingGeo = new THREE.BoxGeometry(vestW, 0.16, vestL);
    addPart(visualBuckets.vestibuleWhiteWall, vestCeilingGeo, vestXMid, vestH + 0.082, vestZMid, 0, 0, 0, true);
    vestCeilingGeo.dispose();

    // 6 Recessed Circular LED Downlight Fixtures in Vestibule Ceiling
    const downlightRingGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.010, 20);
    const downlightDiskGeo = new THREE.CylinderGeometry(0.102, 0.102, 0.012, 20);
    for (const lx of [-11.00, -12.90]) {
      for (const lz of [2.80, 6.25, 9.70]) {
        addPart(visualBuckets.vestibuleAlumFrame, downlightRingGeo, lx, vestH - 0.004, lz, 0, 0, 0, true);
        addPart(visualBuckets.vestibuleCeilingLight, downlightDiskGeo, lx, vestH - 0.008, lz, 0, 0, 0, true);
      }
    }
    downlightRingGeo.dispose();
    downlightDiskGeo.dispose();

    // 1 Subtle Static Fill PointLight (Calibrated to 1.4 intensity so the vestibule is naturally lit without blooming)
    const vestFillLight = new THREE.PointLight(0xe2e8f0, 1.4, 9.5, 1.8);
    vestFillLight.position.set(-12.0, 3.30, 8.20);
    group.add(vestFillLight);

    // B. Vestibule-Side Cladding of the Partition Wall (Occupies X = -10.185 to -10.210, 5mm clear of office wall X = -10.180)
    // Uniform matte off-white plaster cladding across ALL vestibule partition wall segments (including lower half-wall!)
    const cladThickX = 0.025;
    const cladCenterX = -10.1975;

    const whiteCladSegs = [
      // 1. Single continuous upper header spanning the entire vestibule length above window & door (Z = 1.202 to 11.298, Y = 2.650 to 3.798m)
      { yMin: 2.650, yMax: 3.798, zMin: 1.202, zMax: 11.298 },
      // 2. Lower half-wall below glass partition window (Z = 1.702 to 9.498, Y = 0.110 to 1.081m)
      { yMin: 0.110, yMax: 1.081, zMin: 1.702, zMax: 9.498 },
      // 3. Right jamb beside window (Z = 1.202 to 1.702, Y = 0.110 to 2.650m)
      { yMin: 0.110, yMax: 2.650, zMin: 1.202, zMax: 1.702 },
      // 4. Center pillar between window & door (Z = 9.498 to 9.752, Y = 0.110 to 2.650m)
      { yMin: 0.110, yMax: 2.650, zMin: 9.498, zMax: 9.752 },
      // 5. Left jamb beside door near elevator wall (Z = 10.848 to 11.298, Y = 0.110 to 2.650m)
      { yMin: 0.110, yMax: 2.650, zMin: 10.848, zMax: 11.298 },
    ];
    for (const cs of whiteCladSegs) {
      const ch = cs.yMax - cs.yMin;
      const cd = cs.zMax - cs.zMin;
      const cy = (cs.yMin + cs.yMax) * 0.5;
      const cz = (cs.zMin + cs.zMax) * 0.5;
      const cg = filterBoxFaces(
        new THREE.BoxGeometry(cladThickX, ch, cd),
        { px: true, py: true, ny: true, pz: true, nz: true }
      );
      addPart(visualBuckets.vestibuleWhiteWall, cg, cladCenterX, cy, cz, 0, 0, 0, true);
      cg.dispose();
    }

    // C. Glossy Nero Marquina Black Marble Floor Landing (Y = -0.160m to 0.000m, strictly non-overlapping!)
    const stairXEast = -11.450;
    const stairXWest = -13.950;
    const stairZSouth = 2.200;
    const stairZNorth = 7.400;
    const floorThick = 0.160;
    const floorY = -floorThick * 0.5; // Top surface at Y = 0.000m, bottom at Y = -0.160m

    const marbleSlabs = [
      // 1. North Elevator & Doorway Landing (X = -14.198 to -10.212, Z = +7.401 to +11.298)
      { xMin: -14.198, xMax: -10.212, zMin: 7.401, zMax: 11.298 },
      // 2. East Walkway Strip along glass partition half-wall (X = -11.450 to -10.212, Z = +2.200 to +7.399)
      { xMin: stairXEast, xMax: -10.212, zMin: stairZSouth, zMax: 7.399 },
      // 3. South End Landing (X = -14.198 to -10.212, Z = +1.202 to +2.199)
      { xMin: -14.198, xMax: -10.212, zMin: 1.202, zMax: 2.199 },
      // 4. West Wall Marble Ledge (X = -14.198 to -13.950, Z = +2.200 to +7.399)
      { xMin: -14.198, xMax: stairXWest, zMin: stairZSouth, zMax: 7.399 },
      // 5. Doorway Threshold Slab (Strictly inside doorway opening Z = 9.794 to 10.806, X = -10.210 to -10.002)
      { xMin: -10.210, xMax: -10.002, zMin: 9.794, zMax: 10.806 },
    ];

    for (const slab of marbleSlabs) {
      const sw = slab.xMax - slab.xMin;
      const sd = slab.zMax - slab.zMin;
      const sx = (slab.xMin + slab.xMax) * 0.5;
      const sz = (slab.zMin + slab.zMax) * 0.5;
      const sGeo = createMarbleFloorBoxGeometry(sw, floorThick, sd, sx, sz, 2.4);
      addPart(visualBuckets.vestibuleBlackMarble, sGeo, sx, floorY, sz, 0, 0, 0, true);
      sGeo.dispose();
    }

    // D. Glossy Black Marble Baseboards (Y = 0.002m to 0.110m, non-overlapping at corners)
    const bbH = 0.108;
    const bbY = 0.002 + bbH * 0.5;
    const bbT = 0.016;
    const baseboards = [
      // Along partition wall right of doorway (Z = 1.220 to 9.748, X = -10.211 to -10.227)
      { w: bbT, d: 9.748 - 1.220, x: vestXEast - bbT * 0.5 - 0.001, z: (1.220 + 9.748) * 0.5 },
      // Along partition left jamb (Z = 10.852 to 11.280)
      { w: bbT, d: 11.280 - 10.852, x: vestXEast - bbT * 0.5 - 0.001, z: (10.852 + 11.280) * 0.5 },
      // Along south wall (X = -14.180 to -10.230)
      { w: (-10.230) - (-14.180), d: bbT, x: (-10.230 + -14.180) * 0.5, z: vestZSouth + bbT * 0.5 + 0.001 },
      // Along west wall (Z = 1.220 to 11.280)
      { w: bbT, d: 11.280 - 1.220, x: vestXWest + bbT * 0.5 + 0.001, z: vestZMid },
      // Along north wall right of elevator (X = -11.620 to -10.230)
      { w: (-10.230) - (-11.620), d: bbT, x: (-10.230 + -11.620) * 0.5, z: vestZNorth - bbT * 0.5 - 0.001 },
      // Along north wall left of elevator (X = -14.180 to -13.280)
      { w: (-13.280) - (-14.180), d: bbT, x: (-13.280 + -14.180) * 0.5, z: vestZNorth - bbT * 0.5 - 0.001 },
    ];
    for (const bb of baseboards) {
      const bbGeo = new THREE.BoxGeometry(bb.w, bbH, bb.d);
      addVisual(visualBuckets.vestibuleBlackMarble, bbGeo, bb.x, bbY, bb.z);
      bbGeo.dispose();
    }

    // =========================================================================
    // 4. DESCENDING STAIRWELL, CHROME GUARDRAILS & DARK VOID
    // =========================================================================
    const stairW = stairXEast - stairXWest; // 2.50m
    const stairL = stairZNorth - stairZSouth; // 5.20m
    const stairXMid = (stairXEast + stairXWest) * 0.5; // -12.70m
    const stairZMid = (stairZSouth + stairZNorth) * 0.5; // 4.80m

    // A. Stairwell Pit Enclosure Walls
    // Start strictly at Y = -0.162m (2mm BELOW the -0.160m bottom of the marble floor slabs -> ZERO Z-fighting!)
    const pitTopY = -0.162;
    const upperPitH = 1.25;
    const upperPitY = pitTopY - upperPitH * 0.5;
    const lowerPitH = 1.60;
    const lowerPitY = pitTopY - upperPitH - lowerPitH * 0.5;

    const pitWallDefs = [
      // East pit wall (X = -11.450 to -11.290, Z = 2.201 to 7.399)
      { w: 0.16, d: stairL - 0.002, x: stairXEast + 0.08, z: stairZMid },
      // West pit wall (X = -14.110 to -13.950, Z = 2.201 to 7.399)
      { w: 0.16, d: stairL - 0.002, x: stairXWest - 0.08, z: stairZMid },
      // South pit wall (Z = 2.040 to 2.200, X = -14.110 to -11.290)
      { w: stairW + 0.32, d: 0.16, x: stairXMid, z: stairZSouth - 0.08 },
      // North pit under-slab wall (Z = 7.400 to 7.560, X = -14.110 to -11.290)
      { w: stairW + 0.32, d: 0.16, x: stairXMid, z: stairZNorth + 0.08 },
    ];
    for (const pw of pitWallDefs) {
      const upGeo = new THREE.BoxGeometry(pw.w, upperPitH, pw.d);
      addPart(visualBuckets.vestibuleWhiteWall, upGeo, pw.x, upperPitY, pw.z);
      upGeo.dispose();

      const lowGeo = new THREE.BoxGeometry(pw.w, lowerPitH, pw.d);
      addPart(visualBuckets.vestibuleDarkShadow, lowGeo, pw.x, lowerPitY, pw.z);
      lowGeo.dispose();
    }

    // Pitch-Black Unlit Void Box at the bottom of the stairwell so players cannot see out of the map
    const voidBoxGeo = new THREE.BoxGeometry(stairW - 0.01, 0.85, stairL - 0.01);
    addVisual(visualBuckets.vestibuleVoid, voidBoxGeo, stairXMid, -2.55, stairZMid);
    voidBoxGeo.dispose();

    // B. 12 Descending Glossy Black Marble Steps with Chrome Nosing Strips (Strictly non-overlapping!)
    const numSteps = 12;
    const stepRise = 0.185;
    const stepRun = 0.31;
    const stepSpanW = stairW - 0.02; // 2.48m (1cm clear of East & West pit walls)
    const stepNosingGeo = new THREE.BoxGeometry(stepSpanW - 0.004, 0.016, 0.020);

    for (let s = 0; s < numSteps; s++) {
      const topY = -(s + 1) * stepRise;
      const stepH = stepRise - 0.001;
      const stepD = stepRun - 0.002;
      const stepZCenter = stairZNorth - (s + 0.5) * stepRun;
      const stepGeo = createMarbleFloorBoxGeometry(stepSpanW, stepH, stepD, stairXMid, stepZCenter, 2.4);
      addPart(
        visualBuckets.vestibuleBlackMarble,
        stepGeo,
        stairXMid,
        topY - stepH * 0.5,
        stepZCenter,
        0,
        0,
        0,
        true
      );
      stepGeo.dispose();

      // Chrome nosing strip sitting proud along leading (-Z) top edge of each step
      const nosingZ = stairZNorth - (s + 1) * stepRun + 0.009;
      addVisual(visualBuckets.vestibuleChrome, stepNosingGeo, stairXMid, topY + 0.001, nosingZ);
    }
    stepNosingGeo.dispose();

    // C. Polished Chrome Tubular Guardrail System
    const railX = -11.36; // 9cm onto the east marble walkway from the stairwell edge (-11.45)
    const railZSouth = 2.12; // 8cm onto the south marble landing from the stairwell edge (2.20)
    const railZNorth = 7.36;
    const railTopY = 0.98;
    const midRailHeights = [0.18, 0.37, 0.56, 0.75];

    const postGeo = new THREE.CylinderGeometry(0.020, 0.020, railTopY, 14);
    const flangeGeo = new THREE.CylinderGeometry(0.052, 0.056, 0.014, 16);
    const capBallGeo = new THREE.SphereGeometry(0.025, 12, 12);

    // 1. Level Guardrail Posts along East Walkway (X = -11.36, Z = 7.36 down to 2.12)
    const eastPostZ = [7.36, 6.05, 4.74, 3.43, 2.12];
    for (const pz of eastPostZ) {
      addVisual(visualBuckets.vestibuleChrome, postGeo, railX, railTopY * 0.5, pz);
      addVisual(visualBuckets.vestibuleChrome, flangeGeo, railX, 0.008, pz);
      addVisual(visualBuckets.vestibuleChrome, capBallGeo, railX, railTopY, pz);
    }

    // 2. Level Guardrail Posts along South Landing (Z = 2.12, X = -12.64 and -13.92)
    const southPostX = [-12.64, -13.92];
    for (const px of southPostX) {
      addVisual(visualBuckets.vestibuleChrome, postGeo, px, railTopY * 0.5, railZSouth);
      addVisual(visualBuckets.vestibuleChrome, flangeGeo, px, 0.008, railZSouth);
      addVisual(visualBuckets.vestibuleChrome, capBallGeo, px, railTopY, railZSouth);
    }

    // Top Handrail & 4 Horizontal Mid-Rails along East Walkway (Z = 7.36 to 2.12)
    const eastSpanLen = railZNorth - railZSouth;
    const eastSpanMidZ = (railZNorth + railZSouth) * 0.5;
    const eastTopRailGeo = new THREE.CylinderGeometry(0.022, 0.022, eastSpanLen, 14);
    eastTopRailGeo.rotateX(Math.PI * 0.5);
    addPart(visualBuckets.vestibuleChrome, eastTopRailGeo, railX, railTopY, eastSpanMidZ, 0, 0, 0, true);
    eastTopRailGeo.dispose();

    const eastMidRailGeo = new THREE.CylinderGeometry(0.0085, 0.0085, eastSpanLen, 10);
    eastMidRailGeo.rotateX(Math.PI * 0.5);
    for (const my of midRailHeights) {
      addVisual(visualBuckets.vestibuleChrome, eastMidRailGeo, railX, my, eastSpanMidZ);
    }
    eastMidRailGeo.dispose();

    // Top Handrail & 4 Horizontal Mid-Rails along South Landing (X = -11.36 to -13.92)
    const southSpanLen = Math.abs(-13.92 - railX);
    const southSpanMidX = (-13.92 + railX) * 0.5;
    const southTopRailGeo = new THREE.CylinderGeometry(0.022, 0.022, southSpanLen, 14);
    southTopRailGeo.rotateZ(Math.PI * 0.5);
    addPart(visualBuckets.vestibuleChrome, southTopRailGeo, southSpanMidX, railTopY, railZSouth, 0, 0, 0, true);
    southTopRailGeo.dispose();

    const southMidRailGeo = new THREE.CylinderGeometry(0.0085, 0.0085, southSpanLen, 10);
    southMidRailGeo.rotateZ(Math.PI * 0.5);
    for (const my of midRailHeights) {
      addVisual(visualBuckets.vestibuleChrome, southMidRailGeo, southSpanMidX, my, railZSouth);
    }
    southMidRailGeo.dispose();

    // 3. Sloped Descending Stairwell Guardrail along Inner Step Edge (X = -11.55)
    const stairRailX = -11.55;
    const stairPostIndices = [0, 3, 6, 9, 11];
    for (const sIdx of stairPostIndices) {
      const stepTopY = -(sIdx + 1) * stepRise;
      const stepZ = stairZNorth - (sIdx + 0.5) * stepRun;
      addVisual(visualBuckets.vestibuleChrome, postGeo, stairRailX, stepTopY + railTopY * 0.5, stepZ);
      addVisual(visualBuckets.vestibuleChrome, flangeGeo, stairRailX, stepTopY + 0.008, stepZ);
      addVisual(visualBuckets.vestibuleChrome, capBallGeo, stairRailX, stepTopY + railTopY, stepZ);
    }

    const pStartTop = new THREE.Vector3(stairRailX, -stepRise + railTopY, stairZNorth - 0.5 * stepRun);
    const pEndTop = new THREE.Vector3(stairRailX, -numSteps * stepRise + railTopY, stairZNorth - (numSteps - 0.5) * stepRun);
    const slopedTopGeo = createCylinderBetweenPoints(pStartTop, pEndTop, 0.021, 14);
    addVisual(visualBuckets.vestibuleChrome, slopedTopGeo, 0, 0, 0);
    slopedTopGeo.dispose();

    for (const my of midRailHeights) {
      const pStartMid = new THREE.Vector3(stairRailX, -stepRise + my, stairZNorth - 0.5 * stepRun);
      const pEndMid = new THREE.Vector3(stairRailX, -numSteps * stepRise + my, stairZNorth - (numSteps - 0.5) * stepRun);
      const slopedMidGeo = createCylinderBetweenPoints(pStartMid, pEndMid, 0.008, 10);
      addVisual(visualBuckets.vestibuleChrome, slopedMidGeo, 0, 0, 0);
      slopedMidGeo.dispose();
    }

    postGeo.dispose();
    flangeGeo.dispose();
    capBallGeo.dispose();

    // D. Full-Height Invisible Player Safety Barriers Around Stairwell Opening
    const barrierH = 3.80;
    const eastBarrierGeo = new THREE.BoxGeometry(0.12, barrierH, eastSpanLen + 0.20);
    registerPlayerOnlyCollider(eastBarrierGeo, railX, barrierH * 0.5, eastSpanMidZ);
    eastBarrierGeo.dispose();

    const northStairBarrierGeo = new THREE.BoxGeometry(stairW + 0.30, barrierH, 0.12);
    registerPlayerOnlyCollider(northStairBarrierGeo, stairXMid, barrierH * 0.5, stairZNorth + 0.04);
    northStairBarrierGeo.dispose();

    const southStairBarrierGeo = new THREE.BoxGeometry(stairW + 0.30, barrierH, 0.12);
    registerPlayerOnlyCollider(southStairBarrierGeo, stairXMid, barrierH * 0.5, railZSouth);
    southStairBarrierGeo.dispose();

    // =========================================================================
    // 5. ELEVATOR DOOR, ILLUMINATED EXIT SIGN & CYLINDRICAL OFFICE TRASH BIN
    // =========================================================================
    // A. Recessed Brushed Stainless-Steel Double Elevator Door on North Vestibule Wall (Z = +11.30, facing -Z)
    const elevCenterX = -12.45;
    const elevWallZ = vestZNorth; // 11.300m
    const elevDoorW = 1.38;
    const elevDoorH = 2.22;
    const portalFrameW = 0.12;
    const portalDepthZ = 0.070;

    // Dark-gray metallic elevator portal jambs & header surround (Z = 11.225 to 11.295, 5mm in front of northWall Z = 11.300)
    const portalZCenter = elevWallZ - 0.005 - portalDepthZ * 0.5;
    const portalJambGeo = new THREE.BoxGeometry(portalFrameW, elevDoorH, portalDepthZ);
    addPart(
      visualBuckets.elevatorPortal,
      portalJambGeo,
      elevCenterX - elevDoorW * 0.5 - portalFrameW * 0.5,
      elevDoorH * 0.5 + 0.002,
      portalZCenter
    );
    addPart(
      visualBuckets.elevatorPortal,
      portalJambGeo,
      elevCenterX + elevDoorW * 0.5 + portalFrameW * 0.5,
      elevDoorH * 0.5 + 0.002,
      portalZCenter
    );
    portalJambGeo.dispose();

    const portalHeaderGeo = new THREE.BoxGeometry(elevDoorW + portalFrameW * 2, portalFrameW, portalDepthZ);
    addPart(
      visualBuckets.elevatorPortal,
      portalHeaderGeo,
      elevCenterX,
      elevDoorH + 0.004 + portalFrameW * 0.5,
      portalZCenter
    );
    portalHeaderGeo.dispose();

    // Left & Right Brushed Stainless-Steel Sliding Door Panels (Z = 11.255 to 11.295)
    const panelW = (elevDoorW - 0.018) * 0.5;
    const panelGeo = new THREE.BoxGeometry(panelW, elevDoorH, 0.040);
    addPart(
      visualBuckets.elevatorStainless,
      panelGeo,
      elevCenterX - panelW * 0.5 - 0.009,
      elevDoorH * 0.5 + 0.002,
      elevWallZ - 0.025
    );
    addPart(
      visualBuckets.elevatorStainless,
      panelGeo,
      elevCenterX + panelW * 0.5 + 0.009,
      elevDoorH * 0.5 + 0.002,
      elevWallZ - 0.025
    );
    panelGeo.dispose();

    // Dark vertical center seam between the double elevator doors (Non-overlapping between left & right panels)
    const centerSeamGeo = new THREE.BoxGeometry(0.014, elevDoorH, 0.036);
    addVisual(visualBuckets.vestibuleVoid, centerSeamGeo, elevCenterX, elevDoorH * 0.5 + 0.002, elevWallZ - 0.025);
    centerSeamGeo.dispose();

    // Top Digital Floor Indicator Display ('▼ 30') above the elevator frame (Housed in dark metallic bezel)
    const displayY = elevDoorH + portalFrameW + 0.15;
    const displayBezelGeo = new THREE.BoxGeometry(0.336, 0.148, 0.026);
    addVisual(visualBuckets.elevatorPortal, displayBezelGeo, elevCenterX, displayY, elevWallZ - 0.015);
    displayBezelGeo.dispose();

    const displayScreenGeo = new THREE.PlaneGeometry(0.312, 0.126);
    const dispUv = displayScreenGeo.attributes.uv;
    for (let i = 0; i < dispUv.count; i++) {
      dispUv.setY(i, dispUv.getY(i) * 0.5 + 0.5);
    }
    dispUv.needsUpdate = true;
    displayScreenGeo.rotateY(Math.PI);
    addVisual(visualBuckets.elevatorDisplay, displayScreenGeo, elevCenterX, displayY, elevWallZ - 0.029);
    displayScreenGeo.dispose();

    // Right-side Brushed Stainless Hall Call Station with Tactile '▲' UP & Illuminated '▼' DOWN Pushbuttons
    // Ultra-flush <3.8mm profile so decals on the panel or adjacent wall never clip or z-fight
    const callPlateX = elevCenterX + elevDoorW * 0.5 + portalFrameW + 0.14;
    const callPlateY = 1.30;

    // Dark anodized recessed wall-mount backing bezel
    const callBackBezelGeo = new THREE.BoxGeometry(0.094, 0.226, 0.0014);
    addVisual(visualBuckets.elevatorPortal, callBackBezelGeo, callPlateX, callPlateY, elevWallZ - 0.0007);
    callBackBezelGeo.dispose();

    // Brushed stainless-steel main faceplate
    const callPlateGeo = new THREE.BoxGeometry(0.086, 0.218, 0.0022);
    addVisual(visualBuckets.elevatorStainless, callPlateGeo, callPlateX, callPlateY, elevWallZ - 0.0015);
    callPlateGeo.dispose();

    // Unified front-plane hitscan collider (front face at elevWallZ - 0.0038)
    const callColliderGeo = new THREE.BoxGeometry(0.094, 0.226, 0.0038);
    registerCollider(callColliderGeo, callPlateX, callPlateY, elevWallZ - 0.0019);
    callColliderGeo.dispose();

    // Top & bottom countersunk security mounting screws
    const screwGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.001, 10);
    screwGeo.rotateX(Math.PI * 0.5);
    addVisual(visualBuckets.elevatorPortal, screwGeo, callPlateX, callPlateY + 0.092, elevWallZ - 0.0025);
    addVisual(visualBuckets.elevatorPortal, screwGeo, callPlateX, callPlateY - 0.092, elevWallZ - 0.0025);
    screwGeo.dispose();

    // Flush-profile 3D Chrome Outer Bezel Rings + Tactile Pushbutton Barrels
    const btnBezelGeo = new THREE.CylinderGeometry(0.020, 0.021, 0.001, 20);
    btnBezelGeo.rotateX(Math.PI * 0.5);
    addVisual(visualBuckets.vestibuleChrome, btnBezelGeo, callPlateX, callPlateY + 0.036, elevWallZ - 0.0029);
    addVisual(visualBuckets.vestibuleChrome, btnBezelGeo, callPlateX, callPlateY - 0.036, elevWallZ - 0.0029);
    btnBezelGeo.dispose();

    const btnBarrelGeo = new THREE.CylinderGeometry(0.0165, 0.0165, 0.0012, 20);
    btnBarrelGeo.rotateX(Math.PI * 0.5);
    addVisual(visualBuckets.elevatorPortal, btnBarrelGeo, callPlateX, callPlateY + 0.036, elevWallZ - 0.0031);
    addVisual(visualBuckets.elevatorPortal, btnBarrelGeo, callPlateX, callPlateY - 0.036, elevWallZ - 0.0031);
    btnBarrelGeo.dispose();

    // Helper to build circular button cap mapped to the UP or DOWN quadrant of elevatorDisplay atlas
    const buildCallBtnFace = (uOffset) => {
      const faceGeo = new THREE.CircleGeometry(0.0162, 24);
      const uv = faceGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * 0.46 + uOffset, uv.getY(i) * 0.46 + 0.02);
      }
      uv.needsUpdate = true;
      faceGeo.rotateY(Math.PI);
      return faceGeo;
    };

    const upBtnFaceGeo = buildCallBtnFace(0.02);
    addVisual(visualBuckets.elevatorDisplay, upBtnFaceGeo, callPlateX, callPlateY + 0.036, elevWallZ - 0.0038);
    upBtnFaceGeo.dispose();

    const downBtnFaceGeo = buildCallBtnFace(0.52);
    addVisual(visualBuckets.elevatorDisplay, downBtnFaceGeo, callPlateX, callPlateY - 0.036, elevWallZ - 0.0038);
    downBtnFaceGeo.dispose();

    // B. Emergency Exit Down-Stairs Sign on Vestibule Wall (50%+ Larger Hero Scale, 0.58m W x 0.29m H, flush <3.5mm relief)
    const exitY = 3.00;
    const exitZ = 9.05;
    const exitSignW = 0.58;
    const exitSignH = 0.29;
    const exitSignD = 0.0028;

    const exitHousingGeo = new THREE.BoxGeometry(exitSignD, exitSignH, exitSignW);
    addPart(visualBuckets.printerWhite, exitHousingGeo, vestXWest + exitSignD / 2, exitY, exitZ);
    exitHousingGeo.dispose();

    const exitFaceGeo = new THREE.PlaneGeometry(exitSignW, exitSignH);
    exitFaceGeo.rotateY(Math.PI / 2);
    addVisual(visualBuckets.exitSign, exitFaceGeo, vestXWest + exitSignD + 0.0004, exitY, exitZ);
    exitFaceGeo.dispose();

    // C. Cylindrical Brushed Stainless-Steel Office Trash Bin (Inside Main Office under Glass Window)
    // Positioned at X = -9.72m, Z = +2.10m against the lower half-wall below the glass partition (0.36m from coffee cabinet)
    this._buildCylindricalTrashBin(addVisual, registerCollider, visualBuckets, -9.72, 2.10);

    // D. Potted Areca Palm Plant in the North-West Vestibule Corner (next to the Elevator Portal)
    // Scaled (scale = 0.64, frondSpreadScale = 0.50) to harmonize cleanly with the 0.94m corner niche
    // between the elevator left portal jamb (X = -13.26) and the west wall (X = -14.20) at Z = 10.83.
    this._buildArecaPalm(addVisual, registerCollider, visualBuckets, -13.73, 0.0, 10.83, 0.64, 0.50);

    // E. Hero-Scale Commercial Janitor Cleaning Cart ("Carrinho de Limpeza Funcional")
    // Abandoned in a rush on the black marble floor beneath the green stairwell exit sign (Z = 8.98m, X = -13.56m),
    // rotated at a dynamic organic angle (~16° / +0.28 rad yaw away from the west wall) with mop bucket pointing
    // toward the elevator/vestibule doorway and yellow refuse bag toward the stairwell.
    this._buildJanitorCart(addPartMatrix, registerPlayerOnlyCollider, visualBuckets, -13.56, 0.0, 8.98, 0.28);
  }

  /**
   * Builds the Hero-Scale Commercial Janitor Cleaning Cart ("Carrinho de Limpeza Funcional")
   * across 6 detailed component groups:
   *  1. Black Molded-Plastic 3-Tier Frame, Front Deck & Wheel Assembly
   *  2. Front Platform: Bright Yellow Mop Bucket & Side-Press Wringer
   *  3. Rear Frame: Hanging Yellow Vinyl Refuse Bag & Hinged Black Lid
   *  4. Front-Mounted Yellow "CAUTION / CUIDADO" Folded Wet Floor Sign
   *  5. 3 Tall Clipped Cleaning Tools & Draped Microfiber Rag (Rising to Y ~ 1.85m)
   *  6. Stocked Cleaning Supplies on Top Caddy & Lower Shelves
   */
  _buildJanitorCart(
    addPartMatrix,
    registerPlayerOnlyCollider,
    visualBuckets,
    cartX,
    cartY,
    cartZ,
    cartYaw = 0.28
  ) {
    const cartPos = new THREE.Vector3(cartX, cartY, cartZ);
    const cartQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, cartYaw, 0));
    const cartScale = new THREE.Vector3(1, 1, 1);
    const cartMatrix = new THREE.Matrix4().compose(cartPos, cartQuat, cartScale);

    const localPos = new THREE.Vector3();
    const localEuler = new THREE.Euler();
    const localQuat = new THREE.Quaternion();
    const localMatrix = new THREE.Matrix4();
    const worldMatrix = new THREE.Matrix4();

    // Helper: transforms local cart space (lx, ly, lz, rx, ry, rz) into world space
    // and routes into merged visualBuckets + weapon hitscan BVH collider
    const addLocal = (bucket, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0, collidable = true) => {
      localPos.set(lx, ly, lz);
      localEuler.set(rx, ry, rz);
      localQuat.setFromEuler(localEuler);
      localMatrix.compose(localPos, localQuat, cartScale);
      worldMatrix.multiplyMatrices(cartMatrix, localMatrix);
      addPartMatrix(bucket, geo, worldMatrix, collidable);
    };

    // =========================================================================
    // 1. BLACK MOLDED-PLASTIC 3-TIER FRAME, FRONT DECK & WHEEL ASSEMBLY
    // =========================================================================
    // Local coordinate orientation:
    //   +Z = Front (Mop bucket deck, front swivel casters, caution sign)
    //   -Z = Rear  (Hanging yellow vinyl refuse bag, large rear wheels)
    //   +X = Right / East (Room-facing side with clipped broom, flat mop, draped rag)
    //   -X = Left / West  (Wall-facing side)
    // Total Footprint: ~1.42m long (Z = -0.68 to +0.74) x 0.66m wide (X = -0.33 to +0.33)

    // A. Base Deck & Front Tray (Y = 0.09m to 0.16m)
    const deckSlabGeo = new THREE.BoxGeometry(0.62, 0.045, 1.18);
    addLocal(visualBuckets.janitorBlackPlastic, deckSlabGeo, 0, 0.1125, 0.13);
    deckSlabGeo.dispose();

    // Raised perimeter lip around front bucket platform (Z = +0.16 to +0.72, Y = 0.135 to 0.168)
    const frontLipGeo = new THREE.BoxGeometry(0.64, 0.036, 0.032);
    addLocal(visualBuckets.janitorBlackPlastic, frontLipGeo, 0, 0.148, 0.71);
    frontLipGeo.dispose();

    const sideLipGeo = new THREE.BoxGeometry(0.032, 0.036, 1.18);
    addLocal(visualBuckets.janitorBlackPlastic, sideLipGeo, -0.304, 0.148, 0.13);
    addLocal(visualBuckets.janitorBlackPlastic, sideLipGeo, 0.304, 0.148, 0.13);
    sideLipGeo.dispose();

    const midDividerLipGeo = new THREE.BoxGeometry(0.58, 0.028, 0.026);
    addLocal(visualBuckets.janitorBlackPlastic, midDividerLipGeo, 0, 0.144, 0.16);
    midDividerLipGeo.dispose();

    // B. 2 Large Rear Wheels (radius = 0.14m, centered at Y = 0.14m, Z = -0.36m, X = +-0.325m)
    const rearTireGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.046, 16);
    rearTireGeo.rotateZ(Math.PI / 2);
    const rearRimGeo = new THREE.CylinderGeometry(0.102, 0.102, 0.050, 12);
    rearRimGeo.rotateZ(Math.PI / 2);
    const rearSpokeGeo = new THREE.BoxGeometry(0.054, 0.19, 0.022);
    const rearHubCapGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.058, 10);
    rearHubCapGeo.rotateZ(Math.PI / 2);
    const rearFenderGeo = new THREE.CylinderGeometry(0.162, 0.162, 0.068, 12, 1, false, -Math.PI * 0.42, Math.PI * 0.84);
    rearFenderGeo.rotateZ(Math.PI / 2);

    for (const sideX of [-0.325, 0.325]) {
      addLocal(visualBuckets.janitorGrayRubber, rearTireGeo, sideX, 0.14, -0.36);
      addLocal(visualBuckets.janitorBlackPlastic, rearRimGeo, sideX, 0.14, -0.36);
      for (let sp = 0; sp < 5; sp++) {
        addLocal(visualBuckets.janitorBlackPlastic, rearSpokeGeo, sideX, 0.14, -0.36, (sp * Math.PI) / 5, 0, 0, false);
      }
      addLocal(visualBuckets.vestibuleChrome, rearHubCapGeo, sideX, 0.14, -0.36, 0, 0, 0, false);
      addLocal(visualBuckets.janitorBlackPlastic, rearFenderGeo, sideX * 0.96, 0.155, -0.36);
    }
    rearTireGeo.dispose();
    rearRimGeo.dispose();
    rearSpokeGeo.dispose();
    rearHubCapGeo.dispose();
    rearFenderGeo.dispose();

    // Rear solid steel axle rod
    const rearAxleGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.66, 8);
    rearAxleGeo.rotateZ(Math.PI / 2);
    addLocal(visualBuckets.vestibuleChrome, rearAxleGeo, 0, 0.14, -0.36, 0, 0, 0, false);
    rearAxleGeo.dispose();

    // C. 2 Front Swivel Casters (radius = 0.055m at Y = 0.055m, Z = +0.65m, X = +-0.24m)
    const casterPlateGeo = new THREE.BoxGeometry(0.065, 0.012, 0.065);
    const casterForkGeo = new THREE.BoxGeometry(0.046, 0.052, 0.048);
    const casterWheelGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.028, 12);
    casterWheelGeo.rotateZ(Math.PI / 2);
    const casterHubGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.032, 10);
    casterHubGeo.rotateZ(Math.PI / 2);

    const casterConfigs = [
      { cx: -0.24, cz: 0.65, yaw: 0.38 },
      { cx: 0.24, cz: 0.65, yaw: -0.24 },
    ];
    for (const c of casterConfigs) {
      addLocal(visualBuckets.vestibuleChrome, casterPlateGeo, c.cx, 0.088, c.cz, 0, c.yaw, 0, false);
      addLocal(visualBuckets.vestibuleChrome, casterForkGeo, c.cx, 0.066, c.cz - 0.012, 0, c.yaw, 0, false);
      addLocal(visualBuckets.janitorGrayRubber, casterWheelGeo, c.cx, 0.055, c.cz - 0.018, 0, c.yaw, 0);
      addLocal(visualBuckets.janitorBlackPlastic, casterHubGeo, c.cx, 0.055, c.cz - 0.018, 0, c.yaw, 0, false);
    }
    casterPlateGeo.dispose();
    casterForkGeo.dispose();
    casterWheelGeo.dispose();
    casterHubGeo.dispose();

    // D. 3-Tier Central Shelving Tower (Y = 0.16m to 1.28m, Z = -0.38m to +0.16m)
    const postH = 1.06;
    const postGeo = new THREE.BoxGeometry(0.046, postH, 0.046);
    const postXList = [-0.265, 0.265];
    const postZList = [-0.33, 0.11];
    const boltHeadGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.052, 8);
    boltHeadGeo.rotateZ(Math.PI / 2);

    for (const px of postXList) {
      for (const pz of postZList) {
        addLocal(visualBuckets.janitorBlackPlastic, postGeo, px, 0.14 + postH * 0.5, pz);
        // Silver structural bolt heads at Middle Shelf & lower brace joints
        addLocal(visualBuckets.vestibuleChrome, boltHeadGeo, px, 0.68, pz, 0, 0, 0, false);
        addLocal(visualBuckets.vestibuleChrome, boltHeadGeo, px, 0.61, pz, 0, 0, 0, false);
      }
    }
    postGeo.dispose();
    boltHeadGeo.dispose();

    // Middle Shelf (Y = 0.68m) with raised side & rear retention ledges
    const midShelfBaseGeo = new THREE.BoxGeometry(0.58, 0.032, 0.50);
    addLocal(visualBuckets.janitorBlackPlastic, midShelfBaseGeo, 0, 0.675, -0.11);
    midShelfBaseGeo.dispose();

    const midShelfSideRimGeo = new THREE.BoxGeometry(0.024, 0.048, 0.50);
    addLocal(visualBuckets.janitorBlackPlastic, midShelfSideRimGeo, -0.278, 0.698, -0.11);
    addLocal(visualBuckets.janitorBlackPlastic, midShelfSideRimGeo, 0.278, 0.698, -0.11);
    midShelfSideRimGeo.dispose();

    const midShelfFBGeo = new THREE.BoxGeometry(0.58, 0.048, 0.024);
    addLocal(visualBuckets.janitorBlackPlastic, midShelfFBGeo, 0, 0.698, 0.128);
    addLocal(visualBuckets.janitorBlackPlastic, midShelfFBGeo, 0, 0.698, -0.348);
    midShelfFBGeo.dispose();

    // Top Deep Caddy Tray (Y = 1.18m to 1.28m) with molded side tool-holder notches
    const topTrayFloorGeo = new THREE.BoxGeometry(0.58, 0.028, 0.52);
    addLocal(visualBuckets.janitorBlackPlastic, topTrayFloorGeo, 0, 1.194, -0.11);
    topTrayFloorGeo.dispose();

    const topTrayWallSideGeo = new THREE.BoxGeometry(0.028, 0.095, 0.52);
    addLocal(visualBuckets.janitorBlackPlastic, topTrayWallSideGeo, -0.276, 1.232, -0.11);
    addLocal(visualBuckets.janitorBlackPlastic, topTrayWallSideGeo, 0.276, 1.232, -0.11);
    topTrayWallSideGeo.dispose();

    const topTrayWallFBGeo = new THREE.BoxGeometry(0.58, 0.115, 0.028);
    addLocal(visualBuckets.janitorBlackPlastic, topTrayWallFBGeo, 0, 1.222, 0.136);
    addLocal(visualBuckets.janitorBlackPlastic, topTrayWallFBGeo, 0, 1.222, -0.356);
    topTrayWallFBGeo.dispose();

    // Molded front sign-hanger hook & backing plate on front wall of Top Caddy
    // (Covers the full width of the Wet Floor Sign handle cutout hole so no shelf items show through)
    const signHookGeo = new THREE.BoxGeometry(0.145, 0.095, 0.032);
    addLocal(visualBuckets.janitorBlackPlastic, signHookGeo, 0, 1.188, 0.148);
    signHookGeo.dispose();

    // Molded side tool-holder clip blocks along the +X and front-right edges of the Top Caddy
    // Front mop clip moved to X = +0.238m so the mop handle clears BOTH the Wet Floor Sign and the right wringer cheek!
    const toolClipGeo = new THREE.BoxGeometry(0.052, 0.046, 0.052);
    addLocal(visualBuckets.janitorBlackPlastic, toolClipGeo, 0.302, 1.242, 0.075);
    addLocal(visualBuckets.janitorBlackPlastic, toolClipGeo, 0.302, 1.242, -0.155);
    addLocal(visualBuckets.janitorBlackPlastic, toolClipGeo, 0.238, 1.242, 0.165);
    // Lower mid-shelf broom/mop clip bracket on +X side
    addLocal(visualBuckets.janitorBlackPlastic, toolClipGeo, 0.302, 0.695, 0.075);
    addLocal(visualBuckets.janitorBlackPlastic, toolClipGeo, 0.302, 0.695, -0.155);
    toolClipGeo.dispose();

    // =========================================================================
    // 2. FRONT PLATFORM: BRIGHT YELLOW MOP BUCKET & OPEN-TOP SIDE-PRESS WRINGER
    // =========================================================================
    const bktCenterZ = 0.44;
    const bktBottomY = 0.162;

    // 4 Small Chrome Caster Sockets under the yellow mop bucket
    const bktSocketGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.028, 8);
    for (const sx of [-0.16, 0.16]) {
      for (const sz of [bktCenterZ - 0.18, bktCenterZ + 0.18]) {
        addLocal(visualBuckets.vestibuleChrome, bktSocketGeo, sx, 0.148, sz, 0, 0, 0, false);
      }
    }
    bktSocketGeo.dispose();

    // Yellow Rolling Bucket Tub (~0.40m W x 0.35m H x 0.50m L, Y = 0.162m to 0.512m)
    const bktBottomSlabGeo = new THREE.BoxGeometry(0.38, 0.028, 0.48);
    addLocal(visualBuckets.janitorYellowPlastic, bktBottomSlabGeo, 0, bktBottomY + 0.014, bktCenterZ);
    bktBottomSlabGeo.dispose();

    const bktSideWallGeo = new THREE.BoxGeometry(0.022, 0.34, 0.49);
    addLocal(visualBuckets.janitorYellowPlastic, bktSideWallGeo, -0.188, bktBottomY + 0.17, bktCenterZ, 0, 0, 0.03);
    addLocal(visualBuckets.janitorYellowPlastic, bktSideWallGeo, 0.188, bktBottomY + 0.17, bktCenterZ, 0, 0, -0.03);
    bktSideWallGeo.dispose();

    const bktFrontBackWallGeo = new THREE.BoxGeometry(0.39, 0.34, 0.022);
    addLocal(visualBuckets.janitorYellowPlastic, bktFrontBackWallGeo, 0, bktBottomY + 0.17, bktCenterZ + 0.238, 0.03, 0, 0);
    addLocal(visualBuckets.janitorYellowPlastic, bktFrontBackWallGeo, 0, bktBottomY + 0.17, bktCenterZ - 0.238, -0.03, 0, 0);
    bktFrontBackWallGeo.dispose();

    // Top Molded Rim Lip around the yellow bucket (Y = 0.505m)
    const bktRimSideGeo = new THREE.BoxGeometry(0.036, 0.024, 0.52);
    addLocal(visualBuckets.janitorYellowPlastic, bktRimSideGeo, -0.198, 0.505, bktCenterZ);
    addLocal(visualBuckets.janitorYellowPlastic, bktRimSideGeo, 0.198, 0.505, bktCenterZ);
    bktRimSideGeo.dispose();

    const bktRimFBGeo = new THREE.BoxGeometry(0.43, 0.024, 0.036);
    addLocal(visualBuckets.janitorYellowPlastic, bktRimFBGeo, 0, 0.505, bktCenterZ + 0.252);
    addLocal(visualBuckets.janitorYellowPlastic, bktRimFBGeo, 0, 0.505, bktCenterZ - 0.252);
    bktRimFBGeo.dispose();

    // Translucent Aqua-Blue Soapy Water Surface Plane inside bucket (Y = 0.33m, deep inside yellow tub)
    const waterPlaneGeo = new THREE.PlaneGeometry(0.34, 0.44);
    waterPlaneGeo.rotateX(-Math.PI / 2);
    addLocal(visualBuckets.janitorSoapyWater, waterPlaneGeo, 0, 0.33, bktCenterZ, 0, 0, 0, false);
    waterPlaneGeo.dispose();

    // Mounted Open-Top Yellow Side-Press Wringer Hopper (Y = 0.50m to 0.84m, seated on rear half of bucket rim)
    const wringerZ = bktCenterZ - 0.10; // +0.34m (leaves front 0.24m of bucket wide open for the wet mop!)

    // Recessed perforated bottom drain floor of the open wringer hopper
    const wringerFloorGeo = new THREE.BoxGeometry(0.255, 0.022, 0.21);
    addLocal(visualBuckets.janitorYellowPlastic, wringerFloorGeo, 0, 0.525, wringerZ);
    wringerFloorGeo.dispose();

    // Rear wall of open wringer hopper
    const wringerRearWallGeo = new THREE.BoxGeometry(0.285, 0.24, 0.024);
    addLocal(visualBuckets.janitorYellowPlastic, wringerRearWallGeo, 0, 0.635, wringerZ - 0.102);
    wringerRearWallGeo.dispose();

    // Dark-gray rubber protective top trim along rear wringer lip (matching reference photo)
    const wringerRearTrimGeo = new THREE.BoxGeometry(0.290, 0.022, 0.030);
    addLocal(visualBuckets.janitorBlackPlastic, wringerRearTrimGeo, 0, 0.755, wringerZ - 0.102);
    wringerRearTrimGeo.dispose();

    // Curved high side cheeks of wringer (X = +-0.138m, outer face at X = +-0.154m so mop pole at X = +0.185m clears cleanly!)
    const wringerCheekLowGeo = new THREE.BoxGeometry(0.032, 0.22, 0.225);
    const wringerCheekTopGeo = new THREE.CylinderGeometry(0.112, 0.112, 0.032, 12);
    wringerCheekTopGeo.rotateZ(Math.PI / 2);
    for (const wx of [-0.138, 0.138]) {
      addLocal(visualBuckets.janitorYellowPlastic, wringerCheekLowGeo, wx, 0.62, wringerZ);
      addLocal(visualBuckets.janitorYellowPlastic, wringerCheekTopGeo, wx, 0.73, wringerZ);
    }
    wringerCheekLowGeo.dispose();
    wringerCheekTopGeo.dispose();

    // Slotted vertical louver front press wall of wringer
    const wringerFrontPlateGeo = new THREE.BoxGeometry(0.255, 0.18, 0.020);
    addLocal(visualBuckets.janitorYellowPlastic, wringerFrontPlateGeo, 0, 0.60, wringerZ + 0.105);
    wringerFrontPlateGeo.dispose();

    const wringerLouverGeo = new THREE.BoxGeometry(0.008, 0.135, 0.014);
    for (let li = -4; li <= 4; li++) {
      addLocal(visualBuckets.janitorBlackPlastic, wringerLouverGeo, li * 0.023, 0.60, wringerZ + 0.112, 0, 0, 0, false);
    }
    wringerLouverGeo.dispose();

    // Movable Angled Squeeze Paddle Plate INSIDE the open wringer hopper + Chrome Torque Shaft
    const wringerPaddleGeo = new THREE.BoxGeometry(0.235, 0.15, 0.022);
    addLocal(visualBuckets.janitorYellowPlastic, wringerPaddleGeo, 0, 0.61, wringerZ - 0.015, 0.36, 0, 0);
    wringerPaddleGeo.dispose();

    const wringerShaftGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.33, 8);
    wringerShaftGeo.rotateZ(Math.PI / 2);
    addLocal(visualBuckets.vestibuleChrome, wringerShaftGeo, -0.01, 0.70, wringerZ - 0.035, 0, 0, 0, false);
    wringerShaftGeo.dispose();

    // Side-Mounted Wringer Press Lever Handle on the LEFT outside cheek (X = -0.168m)
    const wringerLeverShaftGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.20, 8);
    addLocal(visualBuckets.janitorBlackPlastic, wringerLeverShaftGeo, -0.168, 0.79, wringerZ - 0.015, 0.22, 0, 0.06);
    wringerLeverShaftGeo.dispose();

    const wringerGripGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.115, 8);
    addLocal(visualBuckets.janitorBluePlastic, wringerGripGeo, -0.174, 0.90, wringerZ + 0.012, 0.22, 0, 0.06);
    wringerGripGeo.dispose();

    // =========================================================================
    // 3. REAR FRAME: HANGING YELLOW VINYL REFUSE BAG & HINGED BLACK LID
    // =========================================================================
    const bagCenterZ = -0.52;
    // Rectangular black plastic bag-holder frame at Y = 1.24m
    const bagRimSideGeo = new THREE.BoxGeometry(0.034, 0.040, 0.36);
    addLocal(visualBuckets.janitorBlackPlastic, bagRimSideGeo, -0.245, 1.24, bagCenterZ);
    addLocal(visualBuckets.janitorBlackPlastic, bagRimSideGeo, 0.245, 1.24, bagCenterZ);
    bagRimSideGeo.dispose();

    const bagRimRearGeo = new THREE.BoxGeometry(0.524, 0.040, 0.036);
    addLocal(visualBuckets.janitorBlackPlastic, bagRimRearGeo, 0, 1.24, -0.685);
    bagRimRearGeo.dispose();

    // Continuous Molded Ergonomic Rear Push-Handle U-Loop extending to Z = -0.75m
    const pushArmGeo = new THREE.BoxGeometry(0.032, 0.034, 0.075);
    addLocal(visualBuckets.janitorBlackPlastic, pushArmGeo, -0.215, 1.24, -0.72);
    addLocal(visualBuckets.janitorBlackPlastic, pushArmGeo, 0.215, 1.24, -0.72);
    pushArmGeo.dispose();

    const pushCrossBarGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.46, 10);
    pushCrossBarGeo.rotateZ(Math.PI / 2);
    addLocal(visualBuckets.janitorBlackPlastic, pushCrossBarGeo, 0, 1.24, -0.75);
    pushCrossBarGeo.dispose();

    // Closed Cohesive Matte-Black Hinged Rectangular Cover Lid (Y = 1.26m to 1.285m)
    const bagLidOuterGeo = new THREE.BoxGeometry(0.49, 0.022, 0.335);
    addLocal(visualBuckets.janitorBlackPlastic, bagLidOuterGeo, 0, 1.264, bagCenterZ);
    bagLidOuterGeo.dispose();

    // Molded raised outer rim border on top of black lid (100% cohesive black plastic)
    const bagLidRimLRGeo = new THREE.BoxGeometry(0.036, 0.008, 0.31);
    addLocal(visualBuckets.janitorBlackPlastic, bagLidRimLRGeo, -0.21, 1.278, bagCenterZ, 0, 0, 0, false);
    addLocal(visualBuckets.janitorBlackPlastic, bagLidRimLRGeo, 0.21, 1.278, bagCenterZ, 0, 0, 0, false);
    bagLidRimLRGeo.dispose();

    const bagLidRimFBGeo = new THREE.BoxGeometry(0.45, 0.008, 0.036);
    addLocal(visualBuckets.janitorBlackPlastic, bagLidRimFBGeo, 0, 1.278, bagCenterZ + 0.138, 0, 0, 0, false);
    addLocal(visualBuckets.janitorBlackPlastic, bagLidRimFBGeo, 0, 1.278, bagCenterZ - 0.138, 0, 0, 0, false);
    bagLidRimFBGeo.dispose();

    // Rear lid hinge knuckles (attaching lid to top caddy rear wall)
    const lidHingeGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.065, 8);
    lidHingeGeo.rotateZ(Math.PI / 2);
    addLocal(visualBuckets.janitorBlackPlastic, lidHingeGeo, -0.14, 1.268, -0.352, 0, 0, 0, false);
    addLocal(visualBuckets.janitorBlackPlastic, lidHingeGeo, 0.14, 1.268, -0.352, 0, 0, 0, false);
    lidHingeGeo.dispose();

    // Suspended Bright Yellow Heavy-Duty Vinyl Refuse Bag (Y = 0.28m to 1.238m)
    // Single continuous smooth-normal lofted rounded-rectangle sack (zero glued-on stick boxes!)
    {
      const segY = 18;
      const segP = 40;
      const yBot = 0.285;
      const yTop = 1.238;
      const positions = [];
      const uvs = [];
      const indices = [];

      // Helper: smooth rounded-rectangle perimeter point (theta in 0..2PI)
      const sampleRoundedRect = (theta, halfW, halfD, cornerR) => {
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        // Superellipse exponent n = 4.5 produces a rectangular sack with soft rounded corners
        const exp = 0.42;
        const rx = Math.sign(c) * Math.pow(Math.abs(c), exp) * (halfW - cornerR * 0.15);
        const rz = Math.sign(s) * Math.pow(Math.abs(s), exp) * (halfD - cornerR * 0.15);
        return [rx, rz];
      };

      for (let j = 0; j <= segY; j++) {
        const v = j / segY; // 0 = bottom seam, 1 = top collar rim
        const y = yBot + v * (yTop - yBot);

        // Top collar conforms to frame; lower-middle swells gently; bottom tapers slightly into sewn hem
        const taper = 0.89 + 0.11 * Math.pow(v, 0.45);
        const belly = Math.sin(Math.pow(v, 0.72) * Math.PI) * 0.016;
        const halfW = 0.216 * taper + belly;
        const halfD = 0.144 * taper + belly * 0.85;
        const drapeEnv = Math.sin(v * Math.PI); // 0 at top & bottom seams, max in middle

        for (let i = 0; i <= segP; i++) {
          const u = i / segP;
          const theta = u * Math.PI * 2;
          const [baseX, baseZ] = sampleRoundedRect(theta, halfW, halfD, 0.042);

          // Gentle continuous cloth drape undulation
          const wave =
            drapeEnv *
            (0.0065 * Math.sin(theta * 4.0 + v * 2.0) +
              0.0040 * Math.cos(theta * 6.0 - v * 1.6));
          const nx = Math.cos(theta);
          const nz = Math.sin(theta);

          positions.push(baseX + nx * wave, y, bagCenterZ + baseZ + nz * wave);
          uvs.push(u, v);
        }
      }

      const ringStride = segP + 1;
      for (let j = 0; j < segY; j++) {
        for (let i = 0; i < segP; i++) {
          const a = j * ringStride + i;
          const b = a + 1;
          const c = (j + 1) * ringStride + i;
          const d = c + 1;
          indices.push(a, c, b);
          indices.push(b, c, d);
        }
      }

      // Sewn closed bottom cap (fan from center point at yBot - 0.012m to bottom ring j = 0)
      const bottomCenterIdx = positions.length / 3;
      positions.push(0, yBot - 0.010, bagCenterZ);
      uvs.push(0.5, 0.0);
      for (let i = 0; i < segP; i++) {
        indices.push(bottomCenterIdx, i, i + 1);
      }

      const bagLoftGeo = new THREE.BufferGeometry();
      bagLoftGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      bagLoftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      bagLoftGeo.setIndex(indices);
      // Compute smooth vertex normals while indexed so toNonIndexed() preserves silky cloth shading
      bagLoftGeo.computeVertexNormals();

      addLocal(visualBuckets.janitorYellowVinyl, bagLoftGeo, 0, 0, 0);
      bagLoftGeo.dispose();
    }

    // =========================================================================
    // 4. FRONT-MOUNTED YELLOW "CUIDADO / CAUTION / PISO MOLHADO" WET FLOOR SIGN
    // =========================================================================
    // Authentic tapered trapezoidal A-frame sign board (narrower at top, wider at bottom)
    // with real 3D handle cutout at top, bottom arch feet cutout, and folded rear leaf.
    {
      const signPivotY = 1.245;
      const signPivotZ = 0.164;
      const totalH = 0.725; // Spans from Y = 0.520m (above wringer rim) to Y = 1.245m
      const wBot = 0.340;   // Bottom width at y = 0
      const wTop = 0.246;   // Tapered top width at y = totalH
      const leafThick = 0.014;

      const widthAtY = (ly) => wBot + (wTop - wBot) * (ly / totalH);

      // Builds a watertight 3D trapezoidal prism section [y0..y1] spanning [xL0..xR0] at y0 to [xL1..xR1] at y1
      const pushTrapPrism = (posArr, uvArr, idxArr, xL0, xR0, y0, xL1, xR1, y1, zFront, zBack) => {
        const base = posArr.length / 3;
        // 8 corners:
        // 0: front-BL, 1: front-BR, 2: front-TR, 3: front-TL
        // 4: back-BL,  5: back-BR,  6: back-TR,  7: back-TL
        const pts = [
          [xL0, y0, zFront],
          [xR0, y0, zFront],
          [xR1, y1, zFront],
          [xL1, y1, zFront],
          [xL0, y0, zBack],
          [xR0, y0, zBack],
          [xR1, y1, zBack],
          [xL1, y1, zBack],
        ];
        for (const p of pts) {
          posArr.push(p[0], p[1], p[2]);
          uvArr.push(0.5, 0.5);
        }
        const faces = [
          [0, 1, 2, 3], // Front (+Z)
          [5, 4, 7, 6], // Back (-Z)
          [4, 0, 3, 7], // Left (-X)
          [1, 5, 6, 2], // Right (+X)
          [3, 2, 6, 7], // Top (+Y)
          [4, 5, 1, 0], // Bottom (-Y)
        ];
        for (const [a, b, c, d] of faces) {
          idxArr.push(base + a, base + b, base + c);
          idxArr.push(base + a, base + c, base + d);
        }
      };

      const buildSignLeafGeo = (includeHandleNotch = true) => {
        const pos = [];
        const uvs = [];
        const idx = [];
        const zF = leafThick * 0.5;
        const zB = -leafThick * 0.5;

        // 1. Bottom Left & Right A-Frame Feet (y = 0.000 to 0.055) with center arch cutout
        const y0 = 0.0;
        const y1 = 0.055;
        const hw0 = widthAtY(y0) * 0.5;
        const hw1 = widthAtY(y1) * 0.5;
        pushTrapPrism(pos, uvs, idx, -hw0, -0.095, y0, -hw1, -0.082, y1, zF, zB);
        pushTrapPrism(pos, uvs, idx, 0.095, hw0, y0, 0.082, hw1, y1, zF, zB);

        // 2. Main Solid Tapered Graphic Panel (y = 0.055 to 0.605)
        const y2 = 0.605;
        const hw2 = widthAtY(y2) * 0.5;
        pushTrapPrism(pos, uvs, idx, -hw1, hw1, y1, -hw2, hw2, y2, zF, zB);

        // 3. Left & Right Shoulders Flanking Real 3D Handle Cutout Hole (y = 0.605 to 0.672)
        const y3 = 0.672;
        const hw3 = widthAtY(y3) * 0.5;
        const holeHalfWBot = 0.056;
        const holeHalfWTop = 0.058;
        pushTrapPrism(pos, uvs, idx, -hw2, -holeHalfWBot, y2, -hw3, -holeHalfWTop, y3, zF, zB);
        pushTrapPrism(pos, uvs, idx, holeHalfWBot, hw2, y2, holeHalfWTop, hw3, y3, zF, zB);

        // 4. Top Arched Handle Bar (y = 0.672 to 0.725) + Center Ergonomic Finger-Grip Tab
        const y4 = totalH;
        const hw4 = widthAtY(y4) * 0.5;
        pushTrapPrism(pos, uvs, idx, -hw3, hw3, y3, -hw4, hw4, y4, zF, zB);
        if (includeHandleNotch) {
          pushTrapPrism(pos, uvs, idx, -0.024, 0.024, y3 - 0.007, -0.028, 0.028, y3, zF, zB);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(idx);
        // Convert to non-indexed before computing normals so flat plastic facets remain crisp
        const nonIdx = geo.toNonIndexed();
        geo.dispose();
        nonIdx.computeVertexNormals();
        // Shift origin to top hinge pivot (y = totalH) so tilting around X keeps all sections 100% locked together
        nonIdx.translate(0, -totalH, 0);
        return nonIdx;
      };

      // Front & Rear folded A-frame leaves hanging from top hinge pivot
      const frontTiltX = -0.045; // Hangs slightly forward (+Z at bottom)
      const rearTiltX = 0.015;   // Rear folded leaf tucked behind front leaf
      const frontLeafGeo = buildSignLeafGeo(true);
      const rearLeafGeo = buildSignLeafGeo(false);

      addLocal(visualBuckets.janitorYellowPlastic, frontLeafGeo, 0, signPivotY, signPivotZ + 0.010, frontTiltX, 0, 0);
      addLocal(visualBuckets.janitorYellowPlastic, rearLeafGeo, 0, signPivotY, signPivotZ - 0.010, rearTiltX, 0, 0);
      frontLeafGeo.dispose();
      rearLeafGeo.dispose();

      // Small dark molded top hinge latch slots on top bar corners (matching reference photo)
      const latchSlotGeo = new THREE.BoxGeometry(0.022, 0.022, 0.016);
      latchSlotGeo.translate(0, -0.026, 0);
      addLocal(visualBuckets.janitorBlackPlastic, latchSlotGeo, -0.088, signPivotY, signPivotZ + 0.010, frontTiltX, 0, 0, false);
      addLocal(visualBuckets.janitorBlackPlastic, latchSlotGeo, 0.088, signPivotY, signPivotZ + 0.010, frontTiltX, 0, 0, false);
      latchSlotGeo.dispose();

      // Tapered Trapezoidal Front Graphic Decal Quad (matches exact taper of y = 0.055..0.605 panel)
      const yPanelBot = 0.056;
      const yPanelTop = 0.604;
      const hwBot = widthAtY(yPanelBot) * 0.5 - 0.004;
      const hwTop = widthAtY(yPanelTop) * 0.5 - 0.004;
      const zDecal = leafThick * 0.5 + 0.0012;

      const decalPos = new Float32Array([
        -hwBot, yPanelBot - totalH, zDecal,
         hwBot, yPanelBot - totalH, zDecal,
         hwTop, yPanelTop - totalH, zDecal,
        -hwBot, yPanelBot - totalH, zDecal,
         hwTop, yPanelTop - totalH, zDecal,
        -hwTop, yPanelTop - totalH, zDecal,
      ]);
      const decalUvs = new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 0,
        1, 1,
        0, 1,
      ]);
      const signDecalGeo = new THREE.BufferGeometry();
      signDecalGeo.setAttribute('position', new THREE.BufferAttribute(decalPos, 3));
      signDecalGeo.setAttribute('uv', new THREE.BufferAttribute(decalUvs, 2));
      signDecalGeo.computeVertexNormals();

      addLocal(visualBuckets.janitorCautionSign, signDecalGeo, 0, signPivotY, signPivotZ + 0.010, frontTiltX, 0, 0, false);
      signDecalGeo.dispose();
    }

    // =========================================================================
    // 5. 3 TALL CLIPPED CLEANING TOOLS & DRAPED MICROFIBER RAG (Y up to ~1.85m)
    // =========================================================================
    // Tool 1 — Wet String Mop (Resting in Front-Right of Yellow Bucket, Leaning Outside Right Wringer Cheek)
    // Mathematically aligned along a single 3D axis from mop jaw clamp (0.156, 0.42, 0.568)
    // straight through the front-right tool clip (0.238, 1.242, 0.165) up to the lime-green cap!
    // At Z = 0.44m (wringer front), pole X is +0.182m — completely clearing the right wringer cheek (X <= +0.154m)!
    {
      const pJaw = new THREE.Vector3(0.156, 0.42, 0.568);
      const pClip = new THREE.Vector3(0.238, 1.242, 0.165);
      const mopDir = new THREE.Vector3().subVectors(pClip, pJaw).normalize();
      const mopQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), mopDir);
      const mopEuler = new THREE.Euler().setFromQuaternion(mopQuat);

      // Splayed Cotton Yarn Mop Head Bundle resting inside the front-right bucket basin
      const strandGeo = new THREE.CylinderGeometry(0.009, 0.014, 0.18, 6);
      for (let ring = 0; ring < 2; ring++) {
        const count = ring === 0 ? 7 : 11;
        const spreadR = ring === 0 ? 0.020 : 0.042;
        for (let ms = 0; ms < count; ms++) {
          const ang = (ms / count) * Math.PI * 2 + ring * 0.3;
          const sx = Math.min(0.158, pJaw.x - mopDir.x * 0.065 + Math.cos(ang) * spreadR - 0.018);
          const sy = pJaw.y - 0.075;
          const sz = Math.min(0.635, pJaw.z - mopDir.z * 0.065 + Math.sin(ang) * spreadR - 0.015);
          addLocal(
            visualBuckets.vestibuleSill,
            strandGeo,
            sx,
            sy,
            sz,
            mopEuler.x + Math.sin(ang) * 0.24,
            mopEuler.y,
            mopEuler.z - Math.cos(ang) * 0.24,
            false
          );
        }
      }
      strandGeo.dispose();

      // Molded gray/blue plastic mop-head jaw clamp collar gripping the cotton strands
      const mopJawGeo = new THREE.BoxGeometry(0.074, 0.046, 0.034);
      addLocal(visualBuckets.janitorGrayRubber, mopJawGeo, pJaw.x, pJaw.y, pJaw.z, mopEuler.x, mopEuler.y, mopEuler.z);
      mopJawGeo.dispose();

      const mopCollarNutGeo = new THREE.CylinderGeometry(0.017, 0.021, 0.044, 8);
      const pNut = pJaw.clone().addScaledVector(mopDir, 0.036);
      addLocal(visualBuckets.janitorBluePlastic, mopCollarNutGeo, pNut.x, pNut.y, pNut.z, mopEuler.x, mopEuler.y, mopEuler.z, false);
      mopCollarNutGeo.dispose();

      // Long silver aluminum handle passing dead-center through the clip at (0.238, 1.242, 0.165)
      const mopPoleLen = 1.42;
      const mopPoleGeo = new THREE.CylinderGeometry(0.0115, 0.0115, mopPoleLen, 8);
      const pPoleMid = pJaw.clone().addScaledVector(mopDir, mopPoleLen * 0.5 + 0.03);
      addLocal(visualBuckets.silverTrim, mopPoleGeo, pPoleMid.x, pPoleMid.y, pPoleMid.z, mopEuler.x, mopEuler.y, mopEuler.z);
      mopPoleGeo.dispose();

      // Bright Lime-Green Hanging Grip Cap at top of wet mop (Y ~ 1.82m)
      const mopGreenCapGeo = new THREE.CylinderGeometry(0.014, 0.013, 0.115, 8);
      const pCap = pJaw.clone().addScaledVector(mopDir, mopPoleLen + 0.065);
      addLocal(visualBuckets.janitorGreenPlastic, mopGreenCapGeo, pCap.x, pCap.y, pCap.z, mopEuler.x, mopEuler.y, mopEuler.z);
      mopGreenCapGeo.dispose();
    }

    // Tool 2 — Italian-Style Flagged Push Broom (Clipped on +X Side Holder at Z = +0.075m)
    // Subdivided into 24 vertical strip quads across the trapezoid width so UV interpolation has ZERO diagonal kink!
    {
      const broomX = 0.308;
      const broomZ = 0.075;
      const broomYaw = 0.0;

      // Lower royal-blue end grip at Y = 0.23m
      const broomBottomCapGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.09, 8);
      addLocal(visualBuckets.janitorBluePlastic, broomBottomCapGeo, broomX, 0.23, broomZ);
      broomBottomCapGeo.dispose();

      // Light-gray aluminum shaft (Y = 0.27m to 1.43m)
      const broomShaftGeo = new THREE.CylinderGeometry(0.0115, 0.0115, 1.16, 8);
      addLocal(visualBuckets.silverTrim, broomShaftGeo, broomX, 0.85, broomZ);
      broomShaftGeo.dispose();

      // Threaded royal-blue neck ferrule (Y = 1.415m to 1.465m)
      const broomFerruleGeo = new THREE.CylinderGeometry(0.019, 0.0135, 0.055, 10);
      addLocal(visualBuckets.janitorBluePlastic, broomFerruleGeo, broomX, 1.44, broomZ, 0, broomYaw, 0);
      broomFerruleGeo.dispose();

      // Sculpted Tapered Royal-Blue Plastic Broom Shroud Cap (flares smoothly from neck to 0.20m bristle bar)
      const buildBroomShroudGeo = () => {
        const segY = 5;
        const segP = 24;
        const h = 0.044;
        const pos = [];
        const uvs = [];
        const idx = [];

        for (let j = 0; j <= segY; j++) {
          const v = j / segY;
          const y = v * h;
          const ease = Math.pow(v, 0.65);
          const halfW = 0.020 + ease * 0.080;
          const halfD = 0.018 - ease * 0.002;

          for (let i = 0; i <= segP; i++) {
            const u = i / segP;
            const theta = u * Math.PI * 2;
            const c = Math.cos(theta);
            const s = Math.sin(theta);
            const exp = 1.0 - ease * 0.45;
            const x = Math.sign(s) * Math.pow(Math.abs(s), exp) * halfD;
            const z = Math.sign(c) * Math.pow(Math.abs(c), exp) * halfW;
            pos.push(x, y, z);
            uvs.push(u, v);
          }
        }

        const stride = segP + 1;
        for (let j = 0; j < segY; j++) {
          for (let i = 0; i < segP; i++) {
            const a = j * stride + i;
            const b = a + 1;
            const c = (j + 1) * stride + i;
            const d = c + 1;
            idx.push(a, b, c);
            idx.push(b, d, c);
          }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        return geo;
      };

      const broomShroudGeo = buildBroomShroudGeo();
      addLocal(visualBuckets.janitorBluePlastic, broomShroudGeo, broomX, 1.460, broomZ, 0, broomYaw, 0);
      broomShroudGeo.dispose();

      // Molded blue lip collar at top of blue shroud (Y = 1.502m)
      const broomLipGeo = new THREE.BoxGeometry(0.032, 0.010, 0.204);
      addLocal(visualBuckets.janitorBluePlastic, broomLipGeo, broomX, 1.502, broomZ, 0, broomYaw, 0);
      broomLipGeo.dispose();

      // Multi-Strip Subdivided Trapezoidal Bristle Wedge (Y = 1.505m to 1.665m)
      // Subdividing the trapezoid horizontally into 24 narrow vertical quads eliminates affine triangle UV skew!
      const buildFlaredBristleWedgeGeo = () => {
        const h = 0.160;
        const hwBot = 0.098;
        const hwTop = 0.128;
        const htBot = 0.013;
        const htTop = 0.008;
        const strips = 24;

        const pos = [];
        const uvs = [];

        const pushTri = (x0, y0, z0, u0, v0, x1, y1, z1, u1, v1, x2, y2, z2, u2, v2) => {
          pos.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
          uvs.push(u0, v0, u1, v1, u2, v2);
        };

        for (let i = 0; i < strips; i++) {
          const u0 = i / strips;
          const u1 = (i + 1) / strips;
          const zB0 = hwBot - u0 * (hwBot * 2);
          const zB1 = hwBot - u1 * (hwBot * 2);
          const zT0 = hwTop - u0 * (hwTop * 2);
          const zT1 = hwTop - u1 * (hwTop * 2);

          // +X Outer Face strip
          pushTri(htBot, 0, zB0, u0, 0, htBot, 0, zB1, u1, 0, htTop, h, zT1, u1, 1);
          pushTri(htBot, 0, zB0, u0, 0, htTop, h, zT1, u1, 1, htTop, h, zT0, u0, 1);

          // -X Inner Face strip
          pushTri(-htBot, 0, zB1, u1, 0, -htBot, 0, zB0, u0, 0, -htTop, h, zT0, u0, 1);
          pushTri(-htBot, 0, zB1, u1, 0, -htTop, h, zT0, u0, 1, -htTop, h, zT1, u1, 1);
        }

        // +Z Front Flare Edge
        pushTri(-htBot, 0, hwBot, 0, 0, htBot, 0, hwBot, 0.12, 0, htTop, h, hwTop, 0.12, 1);
        pushTri(-htBot, 0, hwBot, 0, 0, htTop, h, hwTop, 0.12, 1, -htTop, h, hwTop, 0, 1);

        // -Z Rear Flare Edge
        pushTri(htBot, 0, -hwBot, 0, 0, -htBot, 0, -hwBot, 0.12, 0, -htTop, h, -hwTop, 0.12, 1);
        pushTri(htBot, 0, -hwBot, 0, 0, -htTop, h, -hwTop, 0.12, 1, htTop, h, -hwTop, 0, 1);

        // +Y Top Sweeping Tip Face
        pushTri(-htTop, h, hwTop, 0, 0.96, htTop, h, hwTop, 0.1, 0.96, htTop, h, -hwTop, 0.1, 1);
        pushTri(-htTop, h, hwTop, 0, 0.96, htTop, h, -hwTop, 0.1, 1, -htTop, h, -hwTop, 0, 1);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.computeVertexNormals();
        return geo;
      };

      const bristleFanGeo = buildFlaredBristleWedgeGeo();
      addLocal(visualBuckets.janitorBroomBristle, bristleFanGeo, broomX, 1.505, broomZ, 0, broomYaw, 0);
      bristleFanGeo.dispose();
    }

    // Tool 3 — Flat Microfiber Dust Mop (Standing Vertically on +X Rear-Side Holder at Z = -0.155m, Rising to Y ~ 1.85m)
    const flatMopX = 0.308;
    const flatMopZ = -0.155;
    // Lower olive-tan ergonomic foam grip sleeve (Y = 0.18m to 0.56m)
    const flatMopGripGeo = new THREE.CylinderGeometry(0.0145, 0.0145, 0.38, 8);
    addLocal(visualBuckets.janitorTowelTan, flatMopGripGeo, flatMopX, 0.37, flatMopZ);
    flatMopGripGeo.dispose();

    // Telescopic chrome pole & white locking collars (Y = 0.56m to 1.48m, terminating into central swivel bracket)
    const flatMopPoleGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.92, 8);
    addLocal(visualBuckets.vestibuleChrome, flatMopPoleGeo, flatMopX, 1.02, flatMopZ);
    flatMopPoleGeo.dispose();

    const flatMopCollarGeo = new THREE.CylinderGeometry(0.0155, 0.0155, 0.095, 8);
    addLocal(visualBuckets.printerWhite, flatMopCollarGeo, flatMopX, 0.88, flatMopZ, 0, 0, 0, false);
    addLocal(visualBuckets.printerWhite, flatMopCollarGeo, flatMopX, 1.32, flatMopZ, 0, 0, 0, false);
    flatMopCollarGeo.dispose();

    // Central swivel joint block connecting telescopic pole to the flat mop backing plate (Y = 1.48m)
    const mopSwivelGeo = new THREE.BoxGeometry(0.028, 0.048, 0.042);
    addLocal(visualBuckets.janitorGrayRubber, mopSwivelGeo, flatMopX + 0.008, 1.48, flatMopZ, 0, 0, 0, false);
    mopSwivelGeo.dispose();

    // Tall Vertical Rectangular White Microfiber Mop Pad Frame (~0.145m W x 0.46m H, rising to Y = 1.85m)
    const mopPadBackingGeo = new THREE.BoxGeometry(0.014, 0.46, 0.145);
    addLocal(visualBuckets.janitorGrayRubber, mopPadBackingGeo, flatMopX + 0.018, 1.62, flatMopZ);
    mopPadBackingGeo.dispose();

    const mopPadWhiteGeo = new THREE.BoxGeometry(0.016, 0.44, 0.132);
    addLocal(visualBuckets.printerWhite, mopPadWhiteGeo, flatMopX + 0.026, 1.62, flatMopZ);
    mopPadWhiteGeo.dispose();

    // Reworked Soft-Body Draped Tan Microfiber Cleaning Cloth over upper +X lip of Top Caddy Tray (Z = -0.262m)
    // Smooth-normal sculpted cloth ribbon with rounded top arch, organic hanging pleats, and terry-cloth weave texture!
    {
      const segS = 24; // Along the U-drape profile (from inner caddy wall over the rim down outside)
      const segW = 18; // Across the cloth width (along Z)
      const clothHalfThick = 0.0035;
      const centerZ = -0.262; // Cleanly centered between tool clip (-0.181) and rear wall (-0.342)
      const baseWidth = 0.126;

      // Evaluates the 2D centerline (cx, cy) and outward normal (nx, ny) along the U-shaped cloth drape (s in 0..1)
      const sampleClothSpine = (s, uW) => {
        // Caddy wall dimensions: X spans [0.262..0.290], Y top = 1.2795
        // Cloth arches smoothly over the rim: apex at Y = 1.294 (inner surface Y = 1.2905 > 1.2795)
        // Outer vertical drape hangs at X >= 0.302 (inner surface X >= 0.2985 > 0.290: zero clipping!)
        const wave = Math.sin(uW * Math.PI * 3.0 + 0.4) * 0.0035 + Math.cos(uW * Math.PI * 5.0) * 0.0015;
        const gather = 1.0 - 0.08 * Math.exp(-Math.pow((s - 0.38) * 4.5, 2));

        let cx, cy, tx, ty;
        if (s < 0.25) {
          // Inner tail hanging inside the caddy tray (s = 0..0.25 -> Y = 1.215..1.272, X = 0.252..0.254)
          const t = s / 0.25;
          const innerFlare = (1.0 - t) * (wave * 0.5 - 0.002);
          cx = 0.252 + t * 0.002 + innerFlare;
          cy = 1.215 + t * 0.057;
          tx = 0.03;
          ty = 1.0;
        } else if (s <= 0.50) {
          // Smooth rounded arch over the top caddy rim (theta from PI down to 0)
          // Centered at (X = 0.278, Y = 1.272) with radiusX = 0.024, radiusY = 0.022
          // At corner X = 0.290, cloth centerline Y = 1.291 (inner surface 1.2875 > 1.2795: 8mm clearance)
          const t = (s - 0.25) / 0.25;
          const theta = Math.PI * (1.0 - t);
          cx = 0.278 + Math.cos(theta) * 0.024;
          cy = 1.272 + Math.sin(theta) * 0.022;
          tx = 0.024 * Math.sin(theta) * Math.PI;
          ty = -0.022 * Math.cos(theta) * Math.PI;
        } else {
          // Outer drape hanging down the outside of the caddy (s = 0.50..1.0 -> Y = 1.272..1.105, X = 0.302..0.312)
          // Always X >= 0.302 (inner surface >= 0.2985, black wall ends at X = 0.290: 8.5mm clearance)
          const t = (s - 0.50) / 0.50;
          const cornerDroop = Math.pow((uW - 0.5) * 2.0, 2) * 0.010 * t;
          const pleatX = t * (0.003 + wave);
          cx = 0.302 + t * 0.008 + pleatX;
          cy = 1.272 - t * 0.165 - cornerDroop;
          tx = 0.05;
          ty = -1.0;
        }

        const len = Math.hypot(tx, ty) || 1;
        const nx = -ty / len;
        const ny = tx / len;
        return { cx, cy, nx, ny, gather };
      };

      const pos = [];
      const uvs = [];
      const idx = [];

      // Build closed double-sided thickened cloth shell (top/outer surface + inner/under surface)
      // Cross-section around the cloth width (segW * 2 perimeter points per spine station)
      const ringCount = segW * 2;
      for (let j = 0; j <= segS; j++) {
        const s = j / segS;
        // Taper thickness slightly at the stitched top/bottom hems
        const hemTaper = Math.sin(Math.min(1, s * 10) * Math.PI * 0.5) * Math.sin(Math.min(1, (1 - s) * 10) * Math.PI * 0.5);
        const hThick = clothHalfThick * (0.45 + 0.55 * hemTaper);

        for (let i = 0; i <= ringCount; i++) {
          const pFrac = i / ringCount; // 0..0.5 = outer face (-Z to +Z), 0.5..1.0 = inner face (+Z to -Z)
          let uW, sideSign;
          if (pFrac <= 0.5) {
            uW = pFrac * 2.0;
            sideSign = 1.0;
          } else {
            uW = (1.0 - pFrac) * 2.0;
            sideSign = -1.0;
          }
          // Taper thickness at left/right side hems (uW near 0 or 1)
          const edgePinch = Math.sin(uW * Math.PI);
          const localOff = sideSign * hThick * (0.25 + 0.75 * Math.pow(edgePinch, 0.45));

          const { cx, cy, nx, ny, gather } = sampleClothSpine(s, uW);
          const z = centerZ + (uW - 0.5) * baseWidth * gather;
          pos.push(cx + nx * localOff, cy + ny * localOff, z);
          uvs.push(uW, s);
        }
      }

      const stride = ringCount + 1;
      for (let j = 0; j < segS; j++) {
        for (let i = 0; i < ringCount; i++) {
          const a = j * stride + i;
          const b = a + 1;
          const c = (j + 1) * stride + i;
          const d = c + 1;
          idx.push(a, c, b);
          idx.push(b, c, d);
        }
      }

      const towelLoftGeo = new THREE.BufferGeometry();
      towelLoftGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      towelLoftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      towelLoftGeo.setIndex(idx);
      towelLoftGeo.computeVertexNormals();

      addLocal(visualBuckets.janitorTowelTan, towelLoftGeo, 0, 0, 0);
      towelLoftGeo.dispose();
    }

    // =========================================================================
    // 6. STOCKED CLEANING SUPPLIES ON TOP CADDY & LOWER SHELVES
    // =========================================================================
    // A. Top Caddy Tray (Y = 1.21m): 4 Colorful Plastic Trigger Spray & Cleaner Bottles
    const bottleBodyGeo = new THREE.CylinderGeometry(0.032, 0.042, 0.16, 10);
    const bottleNeckGeo = new THREE.CylinderGeometry(0.014, 0.024, 0.045, 8);
    const triggerHeadGeo = new THREE.BoxGeometry(0.028, 0.032, 0.075);
    const triggerLeverGeo = new THREE.BoxGeometry(0.012, 0.042, 0.014);

    // 1. Clear/Cyan Glass-Cleaner Spray Bottle (Front-Left of Top Caddy)
    addLocal(visualBuckets.janitorCyanBottle, bottleBodyGeo, -0.14, 1.285, 0.04);
    addLocal(visualBuckets.janitorCyanBottle, bottleNeckGeo, -0.14, 1.385, 0.04);
    addLocal(visualBuckets.printerWhite, triggerHeadGeo, -0.14, 1.418, 0.052, 0, 0.25, 0);
    addLocal(visualBuckets.printerWhite, triggerLeverGeo, -0.135, 1.392, 0.072, 0.35, 0.25, 0, false);

    // 2. White Bottle with Bright Red Neck & White Trigger Sprayer (Front-Center)
    addLocal(visualBuckets.printerWhite, bottleBodyGeo, 0.02, 1.285, 0.03);
    addLocal(visualBuckets.extinguisherRed, bottleNeckGeo, 0.02, 1.385, 0.03);
    addLocal(visualBuckets.printerWhite, triggerHeadGeo, 0.02, 1.418, 0.042, 0, -0.18, 0);
    addLocal(visualBuckets.extinguisherRed, triggerLeverGeo, 0.015, 1.392, 0.062, 0.35, -0.18, 0, false);

    // 3. Royal-Blue Cleaner Bottle with White Sprayer (Rear-Left)
    addLocal(visualBuckets.janitorBluePlastic, bottleBodyGeo, -0.11, 1.285, -0.14);
    addLocal(visualBuckets.janitorBluePlastic, bottleNeckGeo, -0.11, 1.385, -0.14);
    addLocal(visualBuckets.printerWhite, triggerHeadGeo, -0.11, 1.418, -0.128, 0, 0.40, 0);

    // 4. Green Disinfectant Bottle with White Cap (Rear-Right)
    addLocal(visualBuckets.janitorGreenPlastic, bottleBodyGeo, 0.09, 1.285, -0.15);
    addLocal(visualBuckets.printerWhite, bottleNeckGeo, 0.09, 1.385, -0.15);

    bottleBodyGeo.dispose();
    bottleNeckGeo.dispose();
    triggerHeadGeo.dispose();
    triggerLeverGeo.dispose();

    // B. Middle Shelf (Y = 0.69m): 2 Vertical White Jumbo Paper Towel Rolls with dark inner cores
    const paperRollGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.26, 14);
    const paperCoreGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.264, 10);
    for (const rz of [-0.01, -0.20]) {
      addLocal(visualBuckets.printerWhite, paperRollGeo, 0.08, 0.82, rz);
      addLocal(visualBuckets.janitorBlackPlastic, paperCoreGeo, 0.08, 0.82, rz, 0, 0, 0, false);
    }
    paperRollGeo.dispose();
    paperCoreGeo.dispose();

    // C. Bottom Shelf (Y = 0.14m): 2 Large 5-Liter Chemical Jugs filled with Blue Liquid
    const jugLowerBlueGeo = new THREE.CylinderGeometry(0.092, 0.095, 0.135, 12);
    const jugUpperWhiteGeo = new THREE.CylinderGeometry(0.082, 0.092, 0.125, 12);
    const jugShoulderGeo = new THREE.CylinderGeometry(0.026, 0.082, 0.055, 12);
    const jugCapGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.026, 10);
    const jugLabelBandGeo = new THREE.CylinderGeometry(0.094, 0.094, 0.036, 12);
    const jugHandleGeo = new THREE.BoxGeometry(0.022, 0.085, 0.038);

    for (const jz of [-0.01, -0.22]) {
      const jx = 0.05;
      addLocal(visualBuckets.janitorBluePlastic, jugLowerBlueGeo, jx, 0.208, jz);
      addLocal(visualBuckets.janitorYellowPlastic, jugLabelBandGeo, jx, 0.275, jz, 0, 0, 0, false);
      addLocal(visualBuckets.printerWhite, jugUpperWhiteGeo, jx, 0.338, jz);
      addLocal(visualBuckets.printerWhite, jugShoulderGeo, jx, 0.428, jz);
      addLocal(visualBuckets.janitorBluePlastic, jugCapGeo, jx, 0.466, jz);
      addLocal(visualBuckets.printerWhite, jugHandleGeo, jx + 0.068, 0.395, jz, -0.25, 0, 0, false);
    }
    jugLowerBlueGeo.dispose();
    jugUpperWhiteGeo.dispose();
    jugShoulderGeo.dispose();
    jugCapGeo.dispose();
    jugLabelBandGeo.dispose();
    jugHandleGeo.dispose();

    // =========================================================================
    // 7. PLAYER-ONLY BVH COLLIDER BOX (Full cart envelope so player cannot walk through)
    // =========================================================================
    const playerColliderGeo = new THREE.BoxGeometry(0.76, 1.85, 1.48);
    playerColliderGeo.rotateY(cartYaw);
    registerPlayerOnlyCollider(playerColliderGeo, cartX, cartY + 0.925, cartZ);
    playerColliderGeo.dispose();
  }

  /**
   * Builds the Platform-to-Ceiling 3-Sided Tempered Glass Server Containment Pod
   * enclosing the 8 Server Racks on the raised platform (X = -7.00m to +7.00m,
   * Z = -9.50m to -6.50m, Y = 0.35m to 3.80m), complete with anodized aluminum
   * perimeter framing, rack-aligned vertical mullions, a centered double aluminum-glass
   * door assembly, brushed-chrome pull handles/locks/hinges, and an interior ceiling shadow soffit.
   */
  _buildServerContainmentPod(
    addPart,
    addVisual,
    registerCollider,
    registerPlayerOnlyCollider,
    visualBuckets
  ) {
    const yBottom = 0.353; // Flush on top of the 0.352m plenum platform surface (1mm clearance for zero Z-fighting)
    const yTop = 3.798;    // Flush against the 3.800m suspended ceiling
    const podH = yTop - yBottom; // 3.445m
    const podMidY = (yBottom + yTop) * 0.5;

    const zFront = -6.535; // Sits flat on platform top just behind the -6.500m front step tread
    const xLeft = -6.965;  // Sits flat on platform top just inside the -7.000m left step tread
    const xRight = 6.965;  // Sits flat on platform top just inside the +7.000m right step tread

    const trackH = 0.046;
    const headerH = 0.050;
    const paneYMin = yBottom + trackH + 0.001; // 0.400m
    const paneYMax = yTop - headerH - 0.001;   // 3.747m
    const paneH = paneYMax - paneYMin;         // 3.347m
    const paneMidY = (paneYMin + paneYMax) * 0.5;
    const glassThick = 0.012;

    // =========================================================================
    // 1. CORNER COLUMNS & BACK-WALL VERTICAL JAMBS
    // =========================================================================
    // 2 Front Corner Columns (X = ±6.965m, Z = -6.535m)
    const cornerPostGeo = new THREE.BoxGeometry(0.064, podH, 0.064);
    addPart(visualBuckets.serverPodAlumFrame, cornerPostGeo, xLeft, podMidY, zFront);
    addPart(visualBuckets.serverPodAlumFrame, cornerPostGeo, xRight, podMidY, zFront);
    cornerPostGeo.dispose();

    // 2 Back-Wall Vertical Jambs sealing flush against Front Wall inner surface (Z = -9.500m)
    const wallJambGeo = new THREE.BoxGeometry(0.060, podH, 0.048);
    addVisual(visualBuckets.serverPodAlumFrame, wallJambGeo, xLeft, podMidY, -9.476);
    addVisual(visualBuckets.serverPodAlumFrame, wallJambGeo, xRight, podMidY, -9.476);
    wallJambGeo.dispose();

    // =========================================================================
    // 2. LEFT & RIGHT SIDE GLASS WALLS (X = ±6.965m, Z = -9.451m to -6.568m)
    // =========================================================================
    const sideZStart = -9.451;
    const sideZEnd = -6.568;
    const sideSpanZ = sideZEnd - sideZStart; // 2.883m
    const sideMidZ = (sideZStart + sideZEnd) * 0.5; // -8.0095m

    const sideBottomTrackGeo = new THREE.BoxGeometry(0.056, trackH, sideSpanZ);
    const sideTopHeaderGeo = new THREE.BoxGeometry(0.056, headerH, sideSpanZ);
    const sideMullionGeo = new THREE.BoxGeometry(0.052, paneH, 0.044);

    const sideBaySpanZ = (sideSpanZ - 0.044 - 0.004) * 0.5; // 1.4175m per side bay
    // Single-sheet outward-facing PlaneGeometry (eliminates multi-layer BoxGeometry transparent overdraw)
    const sideGlassGeo = new THREE.PlaneGeometry(sideBaySpanZ, paneH - 0.002);
    const sideRearBayMidZ = sideZStart + 0.001 + sideBaySpanZ * 0.5;
    const sideFrontBayMidZ = sideZEnd - 0.001 - sideBaySpanZ * 0.5;

    for (const sx of [xLeft, xRight]) {
      const sideRotY = sx < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
      // Bottom platform track & top ceiling header channel
      addPart(visualBuckets.serverPodAlumFrame, sideBottomTrackGeo, sx, yBottom + trackH * 0.5, sideMidZ);
      addPart(visualBuckets.serverPodAlumFrame, sideTopHeaderGeo, sx, yTop - headerH * 0.5, sideMidZ);
      // Center vertical side mullion dividing side wall into 2 modular bays
      addPart(visualBuckets.serverPodAlumFrame, sideMullionGeo, sx, paneMidY, sideMidZ);
      // 2 Smoked Tempered Glass Side Bays (outward-facing normals: -X on left, +X on right)
      addVisual(visualBuckets.serverPodGlass, sideGlassGeo, sx, paneMidY, sideRearBayMidZ, 0, sideRotY, 0);
      addVisual(visualBuckets.serverPodGlass, sideGlassGeo, sx, paneMidY, sideFrontBayMidZ, 0, sideRotY, 0);
    }
    sideBottomTrackGeo.dispose();
    sideTopHeaderGeo.dispose();
    sideMullionGeo.dispose();
    sideGlassGeo.dispose();

    // =========================================================================
    // 3. FRONT GLASS WALL — TOP HEADER, DOOR PORTAL & FIXED WINGS (Z = -6.535m)
    // =========================================================================
    const frontFullSpanX = (xRight - 0.032) - (xLeft + 0.032) - 0.002; // 13.864m (-6.932 to +6.932)
    const frontTopHeaderGeo = new THREE.BoxGeometry(frontFullSpanX, headerH, 0.056);
    addPart(visualBuckets.serverPodAlumFrame, frontTopHeaderGeo, 0, yTop - headerH * 0.5, zFront);
    frontTopHeaderGeo.dispose();

    // 8 Equal Symmetrical Bays across the 13.930m Pod Width (bayStride = 6.965 / 4 = 1.74125m)
    // Heavy Anodized Aluminum Door Portal Posts at X = ±1.74125m (exact 1/4-span points)
    const portalX = xRight * 0.25; // 1.74125m
    const portalPostW = 0.064;
    const portalPostH = yTop - headerH - yBottom - 0.002; // 3.393m (Y = 0.353 to 3.746)
    const portalPostMidY = yBottom + portalPostH * 0.5;
    const portalPostGeo = new THREE.BoxGeometry(portalPostW, portalPostH, 0.068);
    addPart(visualBuckets.serverPodAlumFrame, portalPostGeo, -portalX, portalPostMidY, zFront);
    addPart(visualBuckets.serverPodAlumFrame, portalPostGeo, portalX, portalPostMidY, zFront);
    portalPostGeo.dispose();

    // Left & Right Fixed Wing Bottom Tracks (X = ±1.77425m to ±6.932m, span = 5.15775m)
    const wingInnerX = portalX + portalPostW * 0.5 + 0.001; // 1.77425m
    const wingOuterX = xRight - 0.032 - 0.001;              // 6.932m
    const wingSpanX = wingOuterX - wingInnerX;              // 5.15775m
    const wingMidX = (wingInnerX + wingOuterX) * 0.5;       // 4.353125m

    const wingBottomTrackGeo = new THREE.BoxGeometry(wingSpanX, trackH, 0.056);
    addPart(visualBuckets.serverPodAlumFrame, wingBottomTrackGeo, -wingMidX, yBottom + trackH * 0.5, zFront);
    addPart(visualBuckets.serverPodAlumFrame, wingBottomTrackGeo, wingMidX, yBottom + trackH * 0.5, zFront);
    wingBottomTrackGeo.dispose();

    // Slim Vertical Aluminum Mullions trisecting Left & Right Wings into 3 IDENTICAL equal-width bays (1.688m each)
    const mullionW = 0.044;
    const equalWingBayW = (wingSpanX - 2 * mullionW - 0.006) / 3; // 1.6879m
    const mullion1X = wingInnerX + 0.001 + equalWingBayW + 0.001 + mullionW * 0.5; // 3.486m
    const mullion2X = mullion1X + mullionW * 0.5 + 0.001 + equalWingBayW + 0.001 + mullionW * 0.5; // 5.220m
    const frontMullionGeo = new THREE.BoxGeometry(mullionW, paneH, 0.052);
    for (const mx of [-mullion2X, -mullion1X, mullion1X, mullion2X]) {
      addPart(visualBuckets.serverPodAlumFrame, frontMullionGeo, mx, paneMidY, zFront);
    }
    frontMullionGeo.dispose();

    // 6 Identical-Width Modular Smoked Glass Bays across Left & Right Fixed Wings (3 on Left Wing, 3 on Right Wing)
    const wingBayBounds = [
      // Left Wing (Racks 1, 2, 3 — all 3 bays strictly equal width!)
      [-wingOuterX + 0.001, -mullion2X - mullionW * 0.5 - 0.001],
      [-mullion2X + mullionW * 0.5 + 0.001, -mullion1X - mullionW * 0.5 - 0.001],
      [-mullion1X + mullionW * 0.5 + 0.001, -wingInnerX - 0.001],
      // Right Wing (Racks 6, 7, 8 — all 3 bays strictly equal width!)
      [wingInnerX + 0.001, mullion1X - mullionW * 0.5 - 0.001],
      [mullion1X + mullionW * 0.5 + 0.001, mullion2X - mullionW * 0.5 - 0.001],
      [mullion2X + mullionW * 0.5 + 0.001, wingOuterX - 0.001],
    ];
    for (const [bxMin, bxMax] of wingBayBounds) {
      const bw = bxMax - bxMin;
      const bMidX = (bxMin + bxMax) * 0.5;
      const bayGlassGeo = new THREE.PlaneGeometry(bw, paneH - 0.002);
      addVisual(visualBuckets.serverPodGlass, bayGlassGeo, bMidX, paneMidY, zFront);
      bayGlassGeo.dispose();
    }

    // =========================================================================
    // 4. CENTERED DOUBLE ALUMINUM-GLASS DOORS & TOP TRANSOM (X = -1.709m to +1.709m)
    // =========================================================================
    const portalClearHalfW = portalX - portalPostW * 0.5; // 1.70925m
    const portalClearFullW = portalClearHalfW * 2;        // 3.4185m

    // A. Horizontal Door Portal Transom Header Bar (Y = 3.132m to 3.190m, aligned with server rack tops at 3.15m)
    const transomBarH = 0.058;
    const transomBarYMin = 3.132;
    const transomBarYMax = transomBarYMin + transomBarH; // 3.190m
    const transomBarMidY = (transomBarYMin + transomBarYMax) * 0.5;
    const transomBarGeo = new THREE.BoxGeometry(portalClearFullW - 0.002, transomBarH, 0.066);
    addPart(visualBuckets.serverPodAlumFrame, transomBarGeo, 0, transomBarMidY, zFront);
    transomBarGeo.dispose();

    // B. Top Smoked-Glass Transom above Double Doors (Y = 3.191m to 3.747m)
    const transomPaneYMin = transomBarYMax + 0.001;
    const transomPaneYMax = paneYMax;
    const transomPaneH = transomPaneYMax - transomPaneYMin; // 0.556m
    const transomPaneMidY = (transomPaneYMin + transomPaneYMax) * 0.5;

    const transomCenterMullionGeo = new THREE.BoxGeometry(mullionW, transomPaneH, 0.052);
    addPart(visualBuckets.serverPodAlumFrame, transomCenterMullionGeo, 0, transomPaneMidY, zFront);
    transomCenterMullionGeo.dispose();

    const transomGlassW = portalClearHalfW - mullionW * 0.5 - 0.002; // 1.544m
    const transomGlassMidX = mullionW * 0.5 + 0.001 + transomGlassW * 0.5;
    const transomGlassGeo = new THREE.PlaneGeometry(transomGlassW, transomPaneH - 0.002);
    addVisual(visualBuckets.serverPodGlass, transomGlassGeo, -transomGlassMidX, transomPaneMidY, zFront);
    addVisual(visualBuckets.serverPodGlass, transomGlassGeo, transomGlassMidX, transomPaneMidY, zFront);
    transomGlassGeo.dispose();

    // C. Flush Brushed Stainless-Steel Threshold Strip under Double Doors (Y = 0.353m to 0.357m)
    const doorThresholdGeo = new THREE.BoxGeometry(portalClearFullW - 0.004, 0.004, 0.064);
    addVisual(visualBuckets.elevatorStainless, doorThresholdGeo, 0, yBottom + 0.002, zFront);
    doorThresholdGeo.dispose();

    // D. Two Symmetrical Closed Aluminum-Glass Door Leaves (Y = 0.358m to 3.130m)
    const doorYMin = yBottom + 0.005;       // 0.358m
    const doorYMax = transomBarYMin - 0.002; // 3.130m
    const doorLeafH = doorYMax - doorYMin;  // 2.772m
    const doorLeafMidY = (doorYMin + doorYMax) * 0.5; // 1.744m
    const doorLeafThick = 0.044;

    const doorStileW = 0.078;
    const doorBottomRailH = 0.095;
    const doorTopRailH = 0.085;
    const centerGapHalf = 0.004; // 8mm center meeting seam
    const outerGap = 0.004;
    const leafXInner = centerGapHalf;                    // 0.004m
    const leafXOuter = portalClearHalfW - outerGap;      // 1.564m
    const leafW = leafXOuter - leafXInner;               // 1.560m
    const leafInnerGlassW = leafW - doorStileW * 2 - 0.002; // 1.402m
    const leafInnerGlassH = doorLeafH - doorBottomRailH - doorTopRailH - 0.002; // 2.590m
    const leafInnerGlassMidY = doorYMin + doorBottomRailH + 0.001 + leafInnerGlassH * 0.5;

    const doorStileGeo = new THREE.BoxGeometry(doorStileW, doorLeafH, doorLeafThick);
    const doorBottomRailGeo = new THREE.BoxGeometry(leafInnerGlassW, doorBottomRailH, doorLeafThick);
    const doorTopRailGeo = new THREE.BoxGeometry(leafInnerGlassW, doorTopRailH, doorLeafThick);
    const doorGlassPaneGeo = new THREE.PlaneGeometry(leafInnerGlassW, leafInnerGlassH);

    for (const sign of [-1, 1]) {
      const outerStileX = sign * (leafXOuter - doorStileW * 0.5);
      const innerStileX = sign * (leafXInner + doorStileW * 0.5);
      const leafMidX = sign * ((leafXInner + leafXOuter) * 0.5);

      // Outer hinge stile & inner meeting stile
      addPart(visualBuckets.serverPodAlumFrame, doorStileGeo, outerStileX, doorLeafMidY, zFront);
      addPart(visualBuckets.serverPodAlumFrame, doorStileGeo, innerStileX, doorLeafMidY, zFront);
      // Bottom & top horizontal door rails
      addPart(visualBuckets.serverPodAlumFrame, doorBottomRailGeo, leafMidX, doorYMin + doorBottomRailH * 0.5, zFront);
      addPart(visualBuckets.serverPodAlumFrame, doorTopRailGeo, leafMidX, doorYMax - doorTopRailH * 0.5, zFront);
      // Smoked tempered glass center door pane
      addVisual(visualBuckets.serverPodGlass, doorGlassPaneGeo, leafMidX, leafInnerGlassMidY, zFront);
    }
    doorStileGeo.dispose();
    doorBottomRailGeo.dispose();
    doorTopRailGeo.dispose();
    doorGlassPaneGeo.dispose();

    // Center Meeting Seam Astragal Gasket at X = 0.000m
    const astragalGeo = new THREE.BoxGeometry(0.006, doorLeafH - 0.002, 0.036);
    addVisual(visualBuckets.elevatorPortal, astragalGeo, 0, doorLeafMidY, zFront);
    astragalGeo.dispose();

    // E. Symmetrical Brushed-Chrome Vertical Pull Handles, Standoffs, Lock Cylinders & Barrel Hinges
    const handleYMin = 1.05; // 0.70m above platform floor
    const handleYMax = 1.85; // 1.50m above platform floor
    const handleLen = handleYMax - handleYMin; // 0.80m
    const handleMidY = (handleYMin + handleYMax) * 0.5; // 1.45m
    const handleXOffset = 0.105; // Mounted symmetrically on left (-0.105m) & right (+0.105m) door leaves

    const pullBarGeo = new THREE.CylinderGeometry(0.014, 0.014, handleLen, 10);
    const standoffGeo = new THREE.BoxGeometry(0.022, 0.022, 0.036);
    const lockEscutcheonGeo = new THREE.CylinderGeometry(0.018, 0.018, doorLeafThick + 0.012, 10);
    lockEscutcheonGeo.rotateX(Math.PI * 0.5);

    const barZ = zFront + doorLeafThick * 0.5 + 0.038;
    const standZ = zFront + doorLeafThick * 0.5 + 0.019;
    for (const doorSign of [-1, 1]) {
      const hx = doorSign * handleXOffset;
      // Keyhole lock cylinder on inner lock stile at Y = 0.96m (visual-only)
      addVisual(visualBuckets.vestibuleChrome, lockEscutcheonGeo, doorSign * 0.043, 0.96, zFront);

      // Exterior (+Z) pull handles & standoffs on each door leaf (visual-only)
      addVisual(visualBuckets.vestibuleChrome, pullBarGeo, hx, handleMidY, barZ);
      addVisual(visualBuckets.vestibuleChrome, standoffGeo, hx, handleYMin + 0.06, standZ);
      addVisual(visualBuckets.vestibuleChrome, standoffGeo, hx, handleYMax - 0.06, standZ);
    }
    pullBarGeo.dispose();
    standoffGeo.dispose();
    lockEscutcheonGeo.dispose();

    // 6 Chrome Barrel Hinges (3 on left portal jamb, 3 on right portal jamb)
    const barrelHingeGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.095, 12);
    for (const sideSign of [-1, 1]) {
      const hingeX = sideSign * (portalClearHalfW - 0.002);
      for (const hy of [0.72, 1.74, 2.76]) {
        addVisual(visualBuckets.vestibuleChrome, barrelHingeGeo, hingeX, hy, zFront + 0.024);
      }
    }
    barrelHingeGeo.dispose();

    // =========================================================================
    // 5. PLAYER-ONLY COLLISION BARRIERS ALONG 3-SIDED POD PERIMETER
    // =========================================================================
    // (Weapon raycasts pass through playerOnlyColliders to hit DC_ServerPodGlass directly for glass decals
    //  or colliderMesh for aluminum frames, while the player is solidly blocked at the outer perimeter!)
    const frontPlayerColGeo = new THREE.BoxGeometry(14.0, podH, 0.14);
    registerPlayerOnlyCollider(frontPlayerColGeo, 0, podMidY, zFront);
    frontPlayerColGeo.dispose();

    const sidePlayerColGeo = new THREE.BoxGeometry(0.14, podH, 3.00);
    registerPlayerOnlyCollider(sidePlayerColGeo, xLeft, podMidY, -8.00);
    registerPlayerOnlyCollider(sidePlayerColGeo, xRight, podMidY, -8.00);
    sidePlayerColGeo.dispose();
  }

  /**
   * Builds the two Hero-Scale Floor-Standing Fire Extinguishers inside polished stainless-steel
   * cylindrical stands with wall-mounted Brazilian "EXTINTOR" sign plaques above them,
   * placed symmetrically on both sides of the Server Containment Pod (X = ±7.50m, Z = -9.25m).
   */
  _buildFloorFireExtinguishers(
    addPart,
    addVisual,
    registerCollider,
    visualBuckets
  ) {
    // Symmetrically placed dead-center in the open wall bays between the Server Pod and the room corners:
    // Shifted outward by one full floor tile to X = ±8.50m, slightly forward at Z = -9.18m (zero baseboard clipping)
    const standPositions = [
      { x: -8.50, z: -9.18 },
      { x: 8.50, z: -9.18 },
    ];

    // 1. Wall-Mounted "EXTINTOR" Sign Plaque (0.30m wide x 0.43m tall x 0.005m thick)
    // Mounted high on the upper light-gray drywall panel at Y = 1.84m (bottom edge at 1.625m, well above
    // the white cable trunking strip ending at Y = 1.61m and above the taller 1.4x hose loop at Y ≈ 1.39m)
    const signW = 0.300;
    const signH = 0.430;
    const signD = 0.005;
    const signGeo = new THREE.BoxGeometry(signW, signH, signD);

    // 2. 1.4x Hero Scale Assembly Geometries (~1.38m Total Height, ~0.36m Outer Stand Diameter)
    const standR = 0.182; // 0.130m * 1.4 = 0.182m (~0.364m outer diameter)
    const rubberBaseGeo = new THREE.CylinderGeometry(0.188, 0.190, 0.034, 32);
    const chromeLipGeo = new THREE.CylinderGeometry(0.185, 0.187, 0.014, 32);
    const lowerStandGeo = new THREE.CylinderGeometry(standR, standR, 0.357, 32); // 0.255m * 1.4 = 0.357m

    // Upper inox cylinder with wide front U-cutout window (0.300m * 1.4 = 0.420m)
    const cutoutSpan = 1.85;
    const wrapSpan = Math.PI * 2 - cutoutSpan; // ~4.433 rad
    const thetaStart = cutoutSpan * 0.5; // ~0.925 rad
    const upperCutoutGeo = new THREE.CylinderGeometry(standR, standR, 0.420, 32, 1, true, thetaStart, wrapSpan);

    // Red fire extinguisher steel tank (0.108m * 1.4 = 0.151m radius, 0.690m * 1.4 = 0.966m height)
    const tankR = 0.151;
    const tankH = 0.966;
    const tankGeo = new THREE.CylinderGeometry(tankR, tankR, tankH, 28);
    const domeGeo = new THREE.SphereGeometry(tankR, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    domeGeo.scale(1, 0.48, 1);

    // Front instruction sticker curved around the front of the tank (visible through U-cutout)
    const stickerGeo = new THREE.CylinderGeometry(tankR + 0.001, tankR + 0.001, 0.350, 24, 1, true, -1.05, 2.10);

    // Valve collar, body & levers scaled by 1.4x
    const neckCollarGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.045, 16);
    const valveBlockGeo = new THREE.BoxGeometry(0.056, 0.050, 0.056);
    const lowerLeverGeo = new THREE.BoxGeometry(0.133, 0.010, 0.034);
    const upperLeverGeo = new THREE.BoxGeometry(0.140, 0.010, 0.031);
    const sealPinGeo = new THREE.TorusGeometry(0.017, 0.004, 8, 16);

    // Pressure gauge facing forward (+Z)
    const gaugeGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.017, 16);
    gaugeGeo.rotateX(Math.PI * 0.5);

    // Hose ferrules
    const ferruleGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.028, 12);
    const ferrule1Geo = ferruleGeo.clone();
    ferrule1Geo.rotateZ(Math.PI * 0.5);

    // Player collision box (AABB 0.40m x 1.40m x 0.40m matching 1.4x stand radius & height)
    const playerColGeo = new THREE.BoxGeometry(0.40, 1.40, 0.40);

    for (const pos of standPositions) {
      const sx = pos.x;
      const sz = pos.z;

      // A. Wall-Mounted "EXTINTOR" Sign Plaque (centered with extinguisher at X = ±8.50m, Y = 1.84m)
      addPart(visualBuckets.extinguisherSign, signGeo, sx, 1.84, -9.4975, 0, 0, 0, true);

      // B. Black Rubber Floor Base Ring (flush on floor at Y = 0.00m)
      addPart(visualBuckets.extinguisherHose, rubberBaseGeo, sx, 0.017, sz, 0, 0, 0, true);

      // C. Stepped Chrome Base Lip
      addPart(visualBuckets.extinguisherInox, chromeLipGeo, sx, 0.041, sz, 0, 0, 0, true);

      // D. Polished Inox Cylindrical Stand (Lower Solid Body: Y = 0.035m to 0.392m)
      addPart(visualBuckets.extinguisherInox, lowerStandGeo, sx, 0.035 + 0.357 * 0.5, sz, 0, 0, 0, true);

      // E. Polished Inox Cylindrical Stand (Upper U-Cutout: Y = 0.392m to 0.812m)
      addPart(visualBuckets.extinguisherInox, upperCutoutGeo, sx, 0.392 + 0.210, sz, 0, 0, 0, true);

      // F. Red Fire Extinguisher Tank & Hemispherical Shoulder Dome
      addPart(visualBuckets.extinguisherRed, tankGeo, sx, 0.042 + tankH * 0.5, sz, 0, 0, 0, true);
      addPart(visualBuckets.extinguisherRed, domeGeo, sx, 1.008, sz, 0, 0, 0, true);

      // G. Front Instruction Sticker (visible through U-cutout)
      addVisual(visualBuckets.extinguisherLabel, stickerGeo, sx, 0.616, sz);

      // H. Valve Assembly & Forward Pressure Gauge
      addPart(visualBuckets.extinguisherMetal, neckCollarGeo, sx, 1.100, sz, 0, 0, 0, true);
      addPart(visualBuckets.extinguisherMetal, valveBlockGeo, sx, 1.137, sz, 0, 0, 0, true);
      addPart(visualBuckets.extinguisherGauge, gaugeGeo, sx, 1.137, sz + 0.034, 0, 0, 0, true);

      // I. Red Metal Squeeze / Carry Levers
      addPart(visualBuckets.extinguisherRed, lowerLeverGeo, sx + 0.073, 1.151, sz, 0, 0, -0.05, true);
      addPart(visualBuckets.extinguisherRed, upperLeverGeo, sx + 0.076, 1.179, sz, 0, 0, 0.26, true);

      // J. Blue Tamper-Seal Pin Loop
      addVisual(visualBuckets.extinguisherGauge, sealPinGeo, sx + 0.036, 1.169, sz);

      // K. Curved Black Rubber Hose Loop (Apex reaches Y ≈ 1.39m)
      const hoseCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx - 0.031, 1.137, sz),
        new THREE.Vector3(sx - 0.123, 1.225, sz + 0.017),
        new THREE.Vector3(sx - 0.105, 1.379, sz),
        new THREE.Vector3(sx - 0.035, 1.302, sz - 0.022),
        new THREE.Vector3(sx - 0.020, 1.162, sz + 0.025),
      ]);
      const hoseGeo = new THREE.TubeGeometry(hoseCurve, 32, 0.012, 8, false);
      addPart(visualBuckets.extinguisherHose, hoseGeo, 0, 0, 0, 0, 0, 0, true);
      hoseGeo.dispose();

      // Hose silver metallic end ferrules
      addVisual(visualBuckets.extinguisherMetal, ferrule1Geo, sx - 0.036, 1.137, sz);
      addVisual(visualBuckets.extinguisherMetal, ferruleGeo, sx - 0.020, 1.162, sz + 0.025);

      // L. Player Collision Box (solid barrier so player cannot walk through)
      registerCollider(playerColGeo, sx, 0.70, sz);
    }

    signGeo.dispose();
    rubberBaseGeo.dispose();
    chromeLipGeo.dispose();
    lowerStandGeo.dispose();
    upperCutoutGeo.dispose();
    tankGeo.dispose();
    domeGeo.dispose();
    stickerGeo.dispose();
    neckCollarGeo.dispose();
    valveBlockGeo.dispose();
    lowerLeverGeo.dispose();
    upperLeverGeo.dispose();
    sealPinGeo.dispose();
    gaugeGeo.dispose();
    ferruleGeo.dispose();
    ferrule1Geo.dispose();
    playerColGeo.dispose();
  }

  /**
   * Builds the Hero-Scale Wall-Mounted Stainless-Steel Fire Hose Cabinet ("Abrigo de Mangueira de Incêndio")
   * with a detailed 3D interior, bold red "INCÊNDIO" header lettering, and tempered glass viewing windows
   * mounted on the solid wall section between the Panoramic Window and the Access Vestibule door (Z = +13.0m).
   */
  _buildFireHoseCabinet(
    addVisual,
    registerCollider,
    registerPlayerOnlyCollider,
    visualBuckets,
    posX = -7.00,
    posY = 1.571,
    posZ = 12.90
  ) {
    const addPart = (bucket, geo, x, y, z, rx = 0, ry = 0, rz = 0, collidable = true) => {
      addVisual(bucket, geo, x, y, z, rx, ry, rz);
      if (collidable) {
        registerCollider(geo, x, y, z, rx, ry, rz);
      }
    };

    // =========================================================================
    // 1. OUTER STAINLESS-STEEL ("INOX") BOX & RECESSED INNER CAVITY
    // Dimensions: 0.94m Wide x 0.98m Tall x 0.20m Deep.
    // Cavity: 0.88m Wide x 0.92m Tall x 0.14m Deep (from Z = posZ - 0.08 to posZ + 0.06).
    // Flush against back wall drywall at Z = 13.00m (posZ + 0.10m).
    // =========================================================================

    // A. Outer Perimeter Box (color: 0xd4dae2, metalness: 0.88, roughness: 0.20)
    const topOuterGeo = new THREE.BoxGeometry(0.94, 0.03, 0.20);
    addPart(visualBuckets.fireHoseInox, topOuterGeo, posX, posY + 0.475, posZ, 0, 0, 0, true);
    topOuterGeo.dispose();

    const bottomOuterGeo = new THREE.BoxGeometry(0.94, 0.03, 0.20);
    addPart(visualBuckets.fireHoseInox, bottomOuterGeo, posX, posY - 0.475, posZ, 0, 0, 0, true);
    bottomOuterGeo.dispose();

    const leftOuterGeo = new THREE.BoxGeometry(0.03, 0.92, 0.20);
    addPart(visualBuckets.fireHoseInox, leftOuterGeo, posX - 0.455, posY, posZ, 0, 0, 0, true);
    leftOuterGeo.dispose();

    const rightOuterGeo = new THREE.BoxGeometry(0.03, 0.92, 0.20);
    addPart(visualBuckets.fireHoseInox, rightOuterGeo, posX + 0.455, posY, posZ, 0, 0, 0, true);
    rightOuterGeo.dispose();

    // B. Inner Cavity Stainless Walls (ceiling, floor, side liners)
    const innerCeilGeo = new THREE.BoxGeometry(0.88, 0.005, 0.14);
    addPart(visualBuckets.fireHoseInox, innerCeilGeo, posX, posY + 0.4575, posZ - 0.01, 0, 0, 0, true);
    innerCeilGeo.dispose();

    const innerFloorGeo = new THREE.BoxGeometry(0.88, 0.005, 0.14);
    addPart(visualBuckets.fireHoseInox, innerFloorGeo, posX, posY - 0.4575, posZ - 0.01, 0, 0, 0, true);
    innerFloorGeo.dispose();

    const innerLeftGeo = new THREE.BoxGeometry(0.005, 0.915, 0.14);
    addPart(visualBuckets.fireHoseInox, innerLeftGeo, posX - 0.4375, posY, posZ - 0.01, 0, 0, 0, true);
    innerLeftGeo.dispose();

    const innerRightGeo = new THREE.BoxGeometry(0.005, 0.915, 0.14);
    addPart(visualBuckets.fireHoseInox, innerRightGeo, posX + 0.4375, posY, posZ - 0.01, 0, 0, 0, true);
    innerRightGeo.dispose();

    // C. Darker Steel Inner Backplate (0x7a828c, roughness: 0.45, metalness: 0.70)
    // Sits at back of cavity (posZ + 0.08m) for high visual contrast with interior equipment
    const backplateGeo = new THREE.BoxGeometry(0.88, 0.92, 0.04);
    addPart(visualBuckets.fireHoseBackplate, backplateGeo, posX, posY, posZ + 0.08, 0, 0, 0, true);
    backplateGeo.dispose();

    // =========================================================================
    // 2. FRONT FLUSH DOUBLE DOORS & VIEWING WINDOW CUTOUTS
    // Inset double doors at Z ≈ posZ - 0.10m (12.80m) facing -Z into room.
    // Divided at horizontal center by thin vertical dark shadow seam.
    // Two tall viewing cutouts (0.30m W x 0.68m H) with smooth rounded corners.
    // =========================================================================

    // Helper to generate a single door leaf shape with a rounded rectangle window cutout
    const makeDoorLeafGeo = (isLeft) => {
      const shape = new THREE.Shape();
      const w = 0.436; // 0.88m / 2 - 2mm seam
      const h = 0.92;
      const hw = w * 0.5;
      const hh = h * 0.5;
      shape.moveTo(-hw, -hh);
      shape.lineTo(hw, -hh);
      shape.lineTo(hw, hh);
      shape.lineTo(-hw, hh);
      shape.closePath();

      const hole = new THREE.Path();
      const r = 0.035; // 3.5cm smooth corner radius
      const cutW = 0.300;
      const cutH = 0.680;
      // Window centered slightly toward outer edge to leave generous meeting stiles
      const cutCenterX = isLeft ? -0.010 : 0.010;
      const cutCenterY = -0.020;
      const hx = cutCenterX - cutW * 0.5;
      const hy = cutCenterY - cutH * 0.5;

      hole.moveTo(hx + r, hy);
      hole.lineTo(hx + cutW - r, hy);
      hole.quadraticCurveTo(hx + cutW, hy, hx + cutW, hy + r);
      hole.lineTo(hx + cutW, hy + cutH - r);
      hole.quadraticCurveTo(hx + cutW, hy + cutH, hx + cutW - r, hy + cutH);
      hole.lineTo(hx + r, hy + cutH);
      hole.quadraticCurveTo(hx, hy + cutH, hx, hy + cutH - r);
      hole.lineTo(hx, hy + r);
      hole.quadraticCurveTo(hx, hy, hx + r, hy);
      hole.closePath();
      shape.holes.push(hole);

      const geo = new THREE.ShapeGeometry(shape, 8);
      geo.rotateY(Math.PI); // Orient front normal to face -Z into room
      return geo;
    };

    // Front door faces
    const leftDoorGeo = makeDoorLeafGeo(true);
    addVisual(visualBuckets.fireHoseInox, leftDoorGeo, posX - 0.220, posY, posZ - 0.10);
    leftDoorGeo.dispose();

    const rightDoorGeo = makeDoorLeafGeo(false);
    addVisual(visualBuckets.fireHoseInox, rightDoorGeo, posX + 0.220, posY, posZ - 0.10);
    rightDoorGeo.dispose();

    // Dark vertical center seam between doors (2mm width)
    const centerSeamGeo = new THREE.BoxGeometry(0.003, 0.92, 0.012);
    addVisual(visualBuckets.extinguisherHose, centerSeamGeo, posX, posY, posZ - 0.095);
    centerSeamGeo.dispose();

    // Solid inner door frame boxes surrounding window cutouts (bullet collider + thickness)
    // Top header rail (Y = 2.00m to 2.14m)
    const headerRailGeo = new THREE.BoxGeometry(0.88, 0.14, 0.015);
    addPart(visualBuckets.fireHoseInox, headerRailGeo, posX, posY + 0.39, posZ - 0.0925, 0, 0, 0, true);
    headerRailGeo.dispose();

    // Bottom rail (Y = 1.22m to 1.32m)
    const bottomRailGeo = new THREE.BoxGeometry(0.88, 0.10, 0.015);
    addPart(visualBuckets.fireHoseInox, bottomRailGeo, posX, posY - 0.41, posZ - 0.0925, 0, 0, 0, true);
    bottomRailGeo.dispose();

    // Outer side stiles
    const outerStileGeo = new THREE.BoxGeometry(0.06, 0.68, 0.015);
    addPart(visualBuckets.fireHoseInox, outerStileGeo, posX - 0.410, posY - 0.02, posZ - 0.0925, 0, 0, 0, true);
    addPart(visualBuckets.fireHoseInox, outerStileGeo, posX + 0.410, posY - 0.02, posZ - 0.0925, 0, 0, 0, true);
    outerStileGeo.dispose();

    // Center meeting stiles (between windows)
    const centerStileGeo = new THREE.BoxGeometry(0.156, 0.68, 0.015);
    addPart(visualBuckets.fireHoseInox, centerStileGeo, posX, posY - 0.02, posZ - 0.0925, 0, 0, 0, true);
    centerStileGeo.dispose();

    // =========================================================================
    // 3. BOLD SAFETY-RED "INCÊNDIO" INSCRIBED DIRECTLY ON CABINET DOOR METAL
    // Split across the double doors: "INCÊ" on left door leaf, "NDIO" on right door leaf.
    // 100% transparent background with alphaTest - no rectangular sign or patch!
    // The physical 2mm vertical door seam cuts cleanly between the two words.
    // =========================================================================
    const quadW = 0.32;
    const quadH = 0.115;

    // Left door leaf inscription ("INCÊ"): UV range u ∈ [0.0, 0.5]
    const leftHeaderGeo = new THREE.PlaneGeometry(quadW, quadH);
    leftHeaderGeo.rotateY(Math.PI); // Face -Z into room
    const uvL = leftHeaderGeo.getAttribute('uv');
    if (uvL) {
      for (let i = 0; i < uvL.count; i++) {
        uvL.setX(i, uvL.getX(i) * 0.5);
      }
      uvL.needsUpdate = true;
    }
    // Sits flush on the left door metal at Y = 2.07m (posX + 0.168m leaves 8mm gap to seam)
    addPart(visualBuckets.fireHoseHeader, leftHeaderGeo, posX + 0.168, posY + 0.39, posZ - 0.1006, 0, 0, 0, true);
    leftHeaderGeo.dispose();

    // Right door leaf inscription ("NDIO"): UV range u ∈ [0.5, 1.0]
    const rightHeaderGeo = new THREE.PlaneGeometry(quadW, quadH);
    rightHeaderGeo.rotateY(Math.PI); // Face -Z into room
    const uvR = rightHeaderGeo.getAttribute('uv');
    if (uvR) {
      for (let i = 0; i < uvR.count; i++) {
        uvR.setX(i, 0.5 + uvR.getX(i) * 0.5);
      }
      uvR.needsUpdate = true;
    }
    // Sits flush on the right door metal at Y = 2.07m (posX - 0.168m leaves 8mm gap to seam)
    addPart(visualBuckets.fireHoseHeader, rightHeaderGeo, posX - 0.168, posY + 0.39, posZ - 0.1006, 0, 0, 0, true);
    rightHeaderGeo.dispose();

    // =========================================================================
    // 4. TEMPERED GLASS VIEWING WINDOW PANES
    // Routed into visualBuckets.vestibuleGlass with NO collider covering them so
    // shooting the hose-box windows spawns shattered spiderweb glass bullet decals and SFX!
    // =========================================================================
    const glassPaneGeo = new THREE.PlaneGeometry(0.305, 0.685);
    glassPaneGeo.rotateY(Math.PI); // Face -Z into room
    // Left viewing glass
    addVisual(visualBuckets.vestibuleGlass, glassPaneGeo, posX - 0.230, posY - 0.02, posZ - 0.088);
    // Right viewing glass
    addVisual(visualBuckets.vestibuleGlass, glassPaneGeo, posX + 0.230, posY - 0.02, posZ - 0.088);
    glassPaneGeo.dispose();

    // =========================================================================
    // 5. DUAL GLOSSY RED CIRCULAR DOOR KNOB HANDLES
    // Mounted at mid-height (Y ≈ 1.62m) on meeting stiles with short chrome stems
    // =========================================================================
    const knobStemGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.022, 12);
    knobStemGeo.rotateX(Math.PI * 0.5);
    const knobRedGeo = new THREE.SphereGeometry(0.026, 16, 12);
    knobRedGeo.scale(1, 1, 0.65);

    // Left door handle (X ≈ posX - 0.035m)
    addPart(visualBuckets.extinguisherMetal, knobStemGeo, posX - 0.035, posY - 0.06, posZ - 0.111, 0, 0, 0, true);
    addPart(visualBuckets.extinguisherRed, knobRedGeo, posX - 0.035, posY - 0.06, posZ - 0.123, 0, 0, 0, true);

    // Right door handle (X ≈ posX + 0.035m)
    addPart(visualBuckets.extinguisherMetal, knobStemGeo, posX + 0.035, posY - 0.06, posZ - 0.111, 0, 0, 0, true);
    addPart(visualBuckets.extinguisherRed, knobRedGeo, posX + 0.035, posY - 0.06, posZ - 0.123, 0, 0, 0, true);

    knobStemGeo.dispose();
    knobRedGeo.dispose();

    // =========================================================================
    // 6. 3D INTERIOR FIRE HOSE REEL COIL (Center-Right of Cavity)
    // Cylindrical hose reel disc (radius = 0.305m, thickness = 0.095m at X ≈ -7.16m, Y ≈ 1.66m)
    // 14 concentric woven canvas layers with dark shadow grooves & diagonal fabric weave
    // =========================================================================
    const hoseCoilX = posX + 0.09; // -7.16m
    const hoseCoilY = posY - 0.02; // 1.66m
    const hoseCoilZ = posZ - 0.01; // 12.89m (centered in 0.14m cavity)
    const hoseR = 0.305;
    const hoseThick = 0.095;

    // Front textured circular face of the coiled hose
    const hoseFrontGeo = new THREE.CircleGeometry(hoseR, 32);
    hoseFrontGeo.rotateY(Math.PI); // Face -Z
    addPart(visualBuckets.fireHoseCoil, hoseFrontGeo, hoseCoilX, hoseCoilY, hoseCoilZ - hoseThick * 0.5, 0, 0, 0, true);
    hoseFrontGeo.dispose();

    // Outer cylindrical wrap of the fire hose coil (sample off-white woven canvas)
    const hoseWrapGeo = new THREE.CylinderGeometry(hoseR, hoseR, hoseThick, 32, 1, true);
    hoseWrapGeo.rotateX(Math.PI * 0.5);
    const wrapUv = hoseWrapGeo.getAttribute('uv');
    if (wrapUv) {
      for (let i = 0; i < wrapUv.count; i++) {
        wrapUv.setY(i, 0.95);
      }
      wrapUv.needsUpdate = true;
    }
    addPart(visualBuckets.fireHoseCoil, hoseWrapGeo, hoseCoilX, hoseCoilY, hoseCoilZ, 0, 0, 0, true);
    hoseWrapGeo.dispose();

    // Polished chrome center support pin & hub bracket
    const centerPinGeo = new THREE.CylinderGeometry(0.026, 0.026, hoseThick + 0.02, 16);
    centerPinGeo.rotateX(Math.PI * 0.5);
    addPart(visualBuckets.extinguisherMetal, centerPinGeo, hoseCoilX, hoseCoilY, hoseCoilZ, 0, 0, 0, true);
    centerPinGeo.dispose();

    const centerCapGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.012, 16);
    centerCapGeo.rotateX(Math.PI * 0.5);
    addPart(visualBuckets.extinguisherMetal, centerCapGeo, hoseCoilX, hoseCoilY, hoseCoilZ - hoseThick * 0.5 - 0.006, 0, 0, 0, true);
    centerCapGeo.dispose();

    // =========================================================================
    // 7. HEAVY CAST-BRASS ANGLE GLOBE HYDRANT VALVE WITH RED HANDWHEEL (Bottom-Left)
    // Sits in bottom-left corner at X ≈ posX - 0.28m (-7.53m), Y ≈ 1.33m
    // =========================================================================
    const valveX = posX - 0.280; // -7.530m (moved right with generous clearance from hose)
    const valveY = posY - 0.35; // 1.33m
    const valveZ = posZ - 0.01; // 12.89m

    // Horizontal brass valve body along X
    const valveBodyGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.10, 16);
    valveBodyGeo.rotateZ(Math.PI * 0.5);
    addPart(visualBuckets.fireHoseBrass, valveBodyGeo, valveX, valveY, valveZ, 0, 0, 0, true);
    valveBodyGeo.dispose();

    // Hex collar ring on brass body
    const valveHexGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.025, 6);
    valveHexGeo.rotateZ(Math.PI * 0.5);
    addPart(visualBuckets.fireHoseBrass, valveHexGeo, valveX - 0.032, valveY, valveZ, 0, 0, 0, true);
    valveHexGeo.dispose();

    // Rear wall-supply pipe coupling extending into backplate
    const valveSupplyGeo = new THREE.CylinderGeometry(0.030, 0.030, 0.07, 16);
    valveSupplyGeo.rotateX(Math.PI * 0.5);
    addPart(visualBuckets.fireHoseBrass, valveSupplyGeo, valveX - 0.025, valveY, valveZ + 0.045, 0, 0, 0, true);
    valveSupplyGeo.dispose();

    // Silver metallic Storz coupling on right side of valve (connecting toward hose)
    const valveCouplingGeo = new THREE.CylinderGeometry(0.037, 0.037, 0.065, 16);
    valveCouplingGeo.rotateZ(Math.PI * 0.5);
    addPart(visualBuckets.extinguisherMetal, valveCouplingGeo, valveX + 0.075, valveY, valveZ, 0, 0, 0, true);
    valveCouplingGeo.dispose();

    const valveLugGeo = new THREE.CylinderGeometry(0.043, 0.043, 0.022, 16);
    valveLugGeo.rotateZ(Math.PI * 0.5);
    addPart(visualBuckets.extinguisherMetal, valveLugGeo, valveX + 0.095, valveY, valveZ, 0, 0, 0, true);
    valveLugGeo.dispose();

    // Vertical valve bonnet, hex gland nut & stem
    const valveBonnetGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.035, 12);
    addPart(visualBuckets.fireHoseBrass, valveBonnetGeo, valveX, valveY + 0.035, valveZ, 0, 0, 0, true);
    valveBonnetGeo.dispose();

    const valveGlandGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.015, 6);
    addPart(visualBuckets.fireHoseBrass, valveGlandGeo, valveX, valveY + 0.055, valveZ, 0, 0, 0, true);
    valveGlandGeo.dispose();

    const valveStemGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.040, 12);
    addPart(visualBuckets.fireHoseBrass, valveStemGeo, valveX, valveY + 0.080, valveZ, 0, 0, 0, true);
    valveStemGeo.dispose();

    // Horizontal red circular handwheel at Y ≈ 1.43m (0xd11515)
    const wheelRimGeo = new THREE.TorusGeometry(0.046, 0.007, 8, 20);
    wheelRimGeo.rotateX(Math.PI * 0.5);
    addPart(visualBuckets.extinguisherRed, wheelRimGeo, valveX, valveY + 0.100, valveZ, 0, 0, 0, true);
    wheelRimGeo.dispose();

    const wheelHubGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.012, 12);
    addPart(visualBuckets.extinguisherRed, wheelHubGeo, valveX, valveY + 0.100, valveZ, 0, 0, 0, true);
    wheelHubGeo.dispose();

    const wheelSpoke1Geo = new THREE.BoxGeometry(0.092, 0.007, 0.012);
    addPart(visualBuckets.extinguisherRed, wheelSpoke1Geo, valveX, valveY + 0.100, valveZ, 0, 0, 0, true);
    wheelSpoke1Geo.dispose();

    const wheelSpoke2Geo = new THREE.BoxGeometry(0.012, 0.007, 0.092);
    addPart(visualBuckets.extinguisherRed, wheelSpoke2Geo, valveX, valveY + 0.100, valveZ, 0, 0, 0, true);
    wheelSpoke2Geo.dispose();

    // =========================================================================
    // 8. VERTICAL RED & BRASS FIRE NOZZLE / BRANCHPIPE (Left Side of Cavity)
    // Mounted vertically at X ≈ posX - 0.345m (-7.595m), Y spans 1.48m to 1.88m
    // =========================================================================
    const nozzleX = posX - 0.345; // -7.595m (moved right with generous clearance from hose)
    const nozzleZ = posZ - 0.01; // 12.89m

    // A. Lower chrome quick-connect coupling (Y = 1.48m to 1.53m)
    const nozzleCouplingGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.05, 16);
    addPart(visualBuckets.extinguisherMetal, nozzleCouplingGeo, nozzleX, posY - 0.175, nozzleZ, 0, 0, 0, true);
    nozzleCouplingGeo.dispose();

    // B. Ribbed brass grip collar (Y = 1.53m to 1.58m)
    const nozzleGripGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.05, 16);
    addPart(visualBuckets.fireHoseBrass, nozzleGripGeo, nozzleX, posY - 0.125, nozzleZ, 0, 0, 0, true);
    nozzleGripGeo.dispose();

    const nozzleRingGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.008, 16);
    addPart(visualBuckets.fireHoseBrass, nozzleRingGeo, nozzleX, posY - 0.135, nozzleZ, 0, 0, 0, true);
    addPart(visualBuckets.fireHoseBrass, nozzleRingGeo, nozzleX, posY - 0.115, nozzleZ, 0, 0, 0, true);
    nozzleRingGeo.dispose();

    // C. Tapered bright-red nozzle barrel (Y = 1.58m to 1.82m)
    const nozzleBarrelGeo = new THREE.CylinderGeometry(0.015, 0.024, 0.24, 16);
    addPart(visualBuckets.extinguisherRed, nozzleBarrelGeo, nozzleX, posY + 0.020, nozzleZ, 0, 0, 0, true);
    nozzleBarrelGeo.dispose();

    // D. Top brass spray tip & knurled ring (Y = 1.82m to 1.88m)
    const nozzleTipGeo = new THREE.CylinderGeometry(0.011, 0.015, 0.06, 12);
    addPart(visualBuckets.fireHoseBrass, nozzleTipGeo, nozzleX, posY + 0.170, nozzleZ, 0, 0, 0, true);
    nozzleTipGeo.dispose();

    const nozzleKnurlGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.014, 14);
    addPart(visualBuckets.fireHoseBrass, nozzleKnurlGeo, nozzleX, posY + 0.148, nozzleZ, 0, 0, 0, true);
    nozzleKnurlGeo.dispose();

    // E. Stainless mounting spring clips attaching nozzle to left inner wall
    const nozzleClipGeo = new THREE.BoxGeometry(0.085, 0.014, 0.02);
    addPart(visualBuckets.extinguisherMetal, nozzleClipGeo, nozzleX - 0.042, posY - 0.12, nozzleZ, 0, 0, 0, true);
    addPart(visualBuckets.extinguisherMetal, nozzleClipGeo, nozzleX - 0.042, posY + 0.08, nozzleZ, 0, 0, 0, true);
    nozzleClipGeo.dispose();

    // =========================================================================
    // 9. SOLID PLAYER COLLIDER BARRIER
    // Solid barrier so player cannot walk through the cabinet into the wall,
    // while weapon bullet raycasts pass through window cutouts to hit DC_VestibuleGlass!
    // =========================================================================
    const playerCabinetGeo = new THREE.BoxGeometry(0.94, 0.98, 0.20);
    registerPlayerOnlyCollider(playerCabinetGeo, posX, posY, posZ);
    playerCabinetGeo.dispose();
  }

  /**
   * Builds the Closed Double Aluminum-Glass Balcony Door (Hero Scale ~2.00m wide x 2.649m tall)
   * with illuminated green emergency exit sign mounted directly above the top header.
   */
  _buildDoubleBalconyDoor(addPart, addVisual, visualBuckets, group) {
    const doorX = 6.50;
    const doorZ = 13.10;
    const doorW = 2.00;
    const doorH = 2.649;
    const frameThick = 0.045;
    const frameDepth = 0.22;

    // 1. Anodized Aluminum Outer Perimeter Frame
    const jambH = doorH - frameThick;
    const jambGeo = new THREE.BoxGeometry(frameThick, jambH, frameDepth);
    // Left jamb (X = 7.50 - frameThick/2 = 7.4775)
    addPart(visualBuckets.vestibuleAlumFrame, jambGeo, doorX + doorW / 2 - frameThick / 2, jambH / 2, doorZ);
    // Right jamb (X = 5.50 + frameThick/2 = 5.5225)
    addPart(visualBuckets.vestibuleAlumFrame, jambGeo, doorX - doorW / 2 + frameThick / 2, jambH / 2, doorZ);
    jambGeo.dispose();

    // Top Header Channel
    const headerGeo = new THREE.BoxGeometry(doorW, frameThick, frameDepth);
    addPart(visualBuckets.vestibuleAlumFrame, headerGeo, doorX, doorH - frameThick / 2, doorZ);
    headerGeo.dispose();

    // Flush Brushed Stainless Doorway Threshold
    const threshW = doorW - frameThick * 2 - 0.004;
    const threshGeo = new THREE.BoxGeometry(threshW, 0.004, frameDepth - 0.010);
    addVisual(visualBuckets.elevatorStainless, threshGeo, doorX, 0.002, doorZ);
    threshGeo.dispose();

    // 2. Closed Symmetrical Aluminum-Framed Double Door Leaves
    const clearW = doorW - frameThick * 2 - 0.006;
    const leafW = clearW / 2; // ~0.952m
    const leafH = doorH - frameThick - 0.015; // ~2.589m
    const leafY = 0.010 + leafH / 2;
    const leafThick = 0.042;
    const stileW = 0.080;
    const topRailH = 0.090;
    const botRailH = 0.120;
    const glassW = leafW - stileW * 2;
    const glassH = leafH - topRailH - botRailH;
    const glassY = 0.010 + botRailH + glassH / 2;

    const buildDoorLeaf = (leafX, isLeftLeaf) => {
      // Outer & Meeting Vertical Stiles
      const stileGeo = new THREE.BoxGeometry(stileW, leafH, leafThick);
      const outerStileX = isLeftLeaf ? (leafX + leafW / 2 - stileW / 2) : (leafX - leafW / 2 + stileW / 2);
      addPart(visualBuckets.vestibuleAlumFrame, stileGeo, outerStileX, leafY, doorZ);
      const meetStileX = isLeftLeaf ? (leafX - leafW / 2 + stileW / 2) : (leafX + leafW / 2 - stileW / 2);
      addPart(visualBuckets.vestibuleAlumFrame, stileGeo, meetStileX, leafY, doorZ);
      stileGeo.dispose();

      // Top Rail
      const topRailGeo = new THREE.BoxGeometry(glassW, topRailH, leafThick);
      addPart(visualBuckets.vestibuleAlumFrame, topRailGeo, leafX, 0.010 + leafH - topRailH / 2, doorZ);
      topRailGeo.dispose();

      // Bottom Rail
      const botRailGeo = new THREE.BoxGeometry(glassW, botRailH, leafThick);
      addPart(visualBuckets.vestibuleAlumFrame, botRailGeo, leafX, 0.010 + botRailH / 2, doorZ);
      botRailGeo.dispose();

      // Clear Tempered Glass Panel
      const glassGeo = new THREE.BoxGeometry(glassW, glassH, 0.012);
      addVisual(visualBuckets.vestibuleGlass, glassGeo, leafX, glassY, doorZ);
      glassGeo.dispose();

      // 3 Barrel Hinges on Outer Stile
      const hingeGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.075, 12);
      const hingeYLevels = [0.38, 1.30, 2.22];
      const hingeOffsetZ = -leafThick / 2 - 0.003;
      const hingeXPos = isLeftLeaf ? (outerStileX + stileW / 2 - 0.005) : (outerStileX - stileW / 2 + 0.005);
      for (const hy of hingeYLevels) {
        addVisual(visualBuckets.vestibuleChrome, hingeGeo, hingeXPos, hy, doorZ + hingeOffsetZ);
      }
      hingeGeo.dispose();

      // Hardware on Meeting Stile: Escutcheon Plate & Brushed Chrome Lever Handle
      const handleY = 1.05;
      const hwOffsetZ = leafThick / 2 + 0.004;

      // Chrome Escutcheon Plate
      const escPlateGeo = new THREE.BoxGeometry(0.038, 0.22, 0.006);
      addVisual(visualBuckets.vestibuleChrome, escPlateGeo, meetStileX, handleY, doorZ - hwOffsetZ);
      addVisual(visualBuckets.vestibuleChrome, escPlateGeo, meetStileX, handleY, doorZ + hwOffsetZ);
      escPlateGeo.dispose();

      // Keyhole slot
      const keyholeGeo = new THREE.BoxGeometry(0.010, 0.024, 0.008);
      addVisual(visualBuckets.vestibuleVoid, keyholeGeo, meetStileX, handleY - 0.055, doorZ - hwOffsetZ);
      addVisual(visualBuckets.vestibuleVoid, keyholeGeo, meetStileX, handleY - 0.055, doorZ + hwOffsetZ);
      keyholeGeo.dispose();

      // Rosette & Lever Handle
      const rosetteGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.008, 16);
      rosetteGeo.rotateX(Math.PI / 2);
      addVisual(visualBuckets.vestibuleChrome, rosetteGeo, meetStileX, handleY + 0.035, doorZ - hwOffsetZ - 0.004);
      addVisual(visualBuckets.vestibuleChrome, rosetteGeo, meetStileX, handleY + 0.035, doorZ + hwOffsetZ + 0.004);
      rosetteGeo.dispose();

      const spindleGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.026, 12);
      spindleGeo.rotateX(Math.PI / 2);
      addVisual(visualBuckets.vestibuleChrome, spindleGeo, meetStileX, handleY + 0.035, doorZ - hwOffsetZ - 0.016);
      addVisual(visualBuckets.vestibuleChrome, spindleGeo, meetStileX, handleY + 0.035, doorZ + hwOffsetZ + 0.016);
      spindleGeo.dispose();

      const leverLength = 0.125;
      const leverDir = isLeftLeaf ? 1 : -1;
      const leverArmGeo = new THREE.BoxGeometry(leverLength, 0.018, 0.014);
      addVisual(visualBuckets.vestibuleChrome, leverArmGeo, meetStileX + leverDir * (leverLength / 2), handleY + 0.035, doorZ - hwOffsetZ - 0.026);
      addVisual(visualBuckets.vestibuleChrome, leverArmGeo, meetStileX + leverDir * (leverLength / 2), handleY + 0.035, doorZ + hwOffsetZ + 0.026);
      leverArmGeo.dispose();
    };

    // Left Leaf (X > doorX)
    buildDoorLeaf(doorX + 0.003 + leafW / 2, true);
    // Right Leaf (X < doorX)
    buildDoorLeaf(doorX - 0.003 - leafW / 2, false);

    // 3. Emergency Exit Sign Above Door Header (50%+ Larger Hero Scale, 2:1 Aspect Ratio, flush <3.5mm relief)
    const signX = doorX;
    const signY = 2.88;
    const signZ = 12.9986;
    const signW = 0.58;
    const signH = 0.29;
    const signD = 0.0028;

    const signHousingGeo = new THREE.BoxGeometry(signW, signH, signD);
    addPart(visualBuckets.printerWhite, signHousingGeo, signX, signY, signZ);
    signHousingGeo.dispose();

    const signFaceGeo = new THREE.PlaneGeometry(signW, signH);
    signFaceGeo.rotateY(Math.PI);
    addVisual(visualBuckets.runningManExitSign, signFaceGeo, signX, signY, signZ - signD / 2 - 0.0004);
    signFaceGeo.dispose();
  }

  /**
   * Builds the Panoramic Exterior Glass Window Partition (9.0m wide x 1.568m clear glass height)
   * with stone windowsill ledge (Y = 1.081m to 1.125m) and 5 modular vertical glass panes.
   */
  _buildPanoramicExteriorWindow(addPart, addVisual, visualBuckets) {
    const winX = 0.00;
    const winZ = 13.10;
    const winW = 9.00;
    const sillBottomY = 1.081;
    const sillTopY = 1.125;
    const sillH = sillTopY - sillBottomY; // 0.044m
    const winTopY = 2.649;
    const frameDepth = 0.22;
    const frameThick = 0.032;

    // 1. Beige / Light-Gray Stone Windowsill Cap Ledge (Y = 1.081m to 1.125m)
    const sillDepth = 0.27;
    const sillGeo = new THREE.BoxGeometry(winW, sillH, sillDepth);
    addPart(visualBuckets.vestibuleSill, sillGeo, winX, sillBottomY + sillH / 2, winZ);
    sillGeo.dispose();

    // 2. Anodized Aluminum Perimeter Frame
    const clearH = winTopY - sillTopY;
    const innerH = clearH - frameThick * 2;

    // Bottom U-channel on sill
    const botChannelGeo = new THREE.BoxGeometry(winW, frameThick, frameDepth);
    addPart(visualBuckets.vestibuleAlumFrame, botChannelGeo, winX, sillTopY + frameThick / 2, winZ);
    botChannelGeo.dispose();

    // Top U-channel under upper header
    const topChannelGeo = new THREE.BoxGeometry(winW, frameThick, frameDepth);
    addPart(visualBuckets.vestibuleAlumFrame, topChannelGeo, winX, winTopY - frameThick / 2, winZ);
    topChannelGeo.dispose();

    // Left and Right Jamb Channels
    const jambGeo = new THREE.BoxGeometry(frameThick, innerH, frameDepth);
    addPart(visualBuckets.vestibuleAlumFrame, jambGeo, winX + winW / 2 - frameThick / 2, sillTopY + frameThick + innerH / 2, winZ);
    addPart(visualBuckets.vestibuleAlumFrame, jambGeo, winX - winW / 2 + frameThick / 2, sillTopY + frameThick + innerH / 2, winZ);
    jambGeo.dispose();

    // 3. 5 Modular Tempered Glass Panes & 4 Slim Aluminum Mullions
    const innerW = winW - frameThick * 2;
    const numPanes = 5;
    const mullionW = 0.035;
    const totalMullionW = (numPanes - 1) * mullionW;
    const paneW = (innerW - totalMullionW) / numPanes; // ~1.759m
    const paneH = innerH - 0.004;
    const paneY = sillTopY + frameThick + innerH / 2;

    const paneGeo = new THREE.BoxGeometry(paneW, paneH, 0.014);
    const mullionGeo = new THREE.BoxGeometry(mullionW, innerH, frameDepth - 0.004);

    const startX = winX - innerW / 2;
    for (let i = 0; i < numPanes; i++) {
      const px = startX + paneW / 2 + i * (paneW + mullionW);
      addVisual(visualBuckets.vestibuleGlass, paneGeo, px, paneY, winZ);

      if (i < numPanes - 1) {
        const mx = px + paneW / 2 + mullionW / 2;
        addPart(visualBuckets.vestibuleAlumFrame, mullionGeo, mx, paneY, winZ);
      }
    }
    paneGeo.dispose();
    mullionGeo.dispose();
  }

  /**
   * Builds the Spacious Exterior High-Rise Balcony Terrace (4.80m deep x 14.60m wide, Z = 13.20m to 18.00m)
   * with dark basalt pavers, solid 0.20m dark-granite concrete parapet curb (ZERO bottom gap!),
   * Hero-Scale 1.34m guardrail (stainless posts, top handrail, thin mid-rail, smoked glass balustrade),
   * 2 complete high-craft Outdoor Patio Dining & Umbrella sets with tabletop props,
   * skyscraper exterior facade drop down to Y = -35.0m, and completely open upward sky sightline (NO soffit/roof!).
   */
  _buildExteriorBalcony(addPart, addVisual, registerCollider, visualBuckets, addPartMatrix = null) {
    const balX = 1.50;
    const balW = 14.60;
    const balFloorY = 0.00;
    const balSlabH = 0.30;
    const wallZ = 13.20; // Exterior back wall surface
    const frontOuterZ = 18.00; // Balcony slab front edge (spacious 4.80m depth!)
    const balD = frontOuterZ - wallZ; // 4.80m
    const balZ = (wallZ + frontOuterZ) / 2; // 15.60m

    // 1. Structural Concrete Cantilever Slab (-0.30m to 0.00m)
    const slabGeo = new THREE.BoxGeometry(balW, balSlabH, balD);
    addVisual(visualBuckets.balconyExteriorWall, slabGeo, balX, balFloorY - balSlabH / 2, balZ);
    slabGeo.dispose();

    // 2. Balcony Tile Floor (Dark basalt pavers with drainage grate along building wall at Y = 0.001m)
    const floorGeo = new THREE.PlaneGeometry(balW, balD);
    floorGeo.rotateX(-Math.PI / 2);
    addVisual(visualBuckets.balconyFloor, floorGeo, balX, balFloorY + 0.001, balZ);
    floorGeo.dispose();

    // 3. Solid Continuous Dark-Granite Parapet Curb (Height: 0.20m, Thickness: 0.18m)
    // Sits flush on balcony slab so there is ZERO bottom gap where background textures can bleed through.
    const curbH = 0.20;
    const curbThick = 0.18;
    const curbY = balFloorY + curbH / 2; // 0.10m
    const frontCurbZ = frontOuterZ - curbThick / 2; // 17.91m
    const leftCurbX = balX + balW / 2 - curbThick / 2; // 8.71m
    const rightCurbX = balX - balW / 2 + curbThick / 2; // -5.71m
    const sideCurbD = balD - curbThick; // 4.62m
    const sideCurbZ = (wallZ + (frontOuterZ - curbThick)) / 2; // 15.51m

    // Front continuous curb
    const frontCurbGeo = new THREE.BoxGeometry(balW, curbH, curbThick);
    addVisual(visualBuckets.balconyCurb, frontCurbGeo, balX, curbY, frontCurbZ);
    frontCurbGeo.dispose();

    // Side returns
    const sideCurbGeo = new THREE.BoxGeometry(curbThick, curbH, sideCurbD);
    addVisual(visualBuckets.balconyCurb, sideCurbGeo, leftCurbX, curbY, sideCurbZ);
    addVisual(visualBuckets.balconyCurb, sideCurbGeo, rightCurbX, curbY, sideCurbZ);
    sideCurbGeo.dispose();

    // 4. Hero-Scale Architectural Guardrail (Top Handrail at Y = 1.34m, visible above 1.125m windowsill)
    const handrailY = 1.34;
    const midRailY = 1.25;
    const postW = 0.040;
    const handrailDia = 0.045;
    const midRailDia = 0.018;

    // A. Vertical Stainless Steel Square Posts (anchored into curb from Y = 0.20m up to Y = 1.34m)
    const postH = handrailY - curbH; // 1.14m
    const postY = curbH + postH / 2; // 0.77m
    const postGeo = new THREE.BoxGeometry(postW, postH, postW);

    const numFrontPosts = 11;
    const frontSpan = (leftCurbX - rightCurbX);
    const postStep = frontSpan / (numFrontPosts - 1); // ~1.442m

    for (let p = 0; p < numFrontPosts; p++) {
      const px = rightCurbX + p * postStep;
      addVisual(visualBuckets.balconyRailMetal, postGeo, px, postY, frontCurbZ);
    }

    // Side return posts (extended across full 4.71m return length)
    const sideReturnL = frontCurbZ - wallZ; // ~4.71m
    const numSideIntervals = 4;
    const sideStep = sideReturnL / numSideIntervals;
    for (let s = 0; s <= numSideIntervals; s++) {
      const sz = wallZ + s * sideStep;
      addVisual(visualBuckets.balconyRailMetal, postGeo, leftCurbX, postY, sz);
      addVisual(visualBuckets.balconyRailMetal, postGeo, rightCurbX, postY, sz);
    }
    postGeo.dispose();

    // B. Cylindrical Top Handrails (Y = 1.34m)
    const frontHandrailGeo = new THREE.CylinderGeometry(handrailDia / 2, handrailDia / 2, balW, 16);
    frontHandrailGeo.rotateZ(Math.PI / 2);
    addVisual(visualBuckets.balconyRailMetal, frontHandrailGeo, balX, handrailY, frontCurbZ);
    frontHandrailGeo.dispose();

    const sideHandrailGeo = new THREE.CylinderGeometry(handrailDia / 2, handrailDia / 2, sideReturnL, 16);
    sideHandrailGeo.rotateX(Math.PI / 2);
    addVisual(visualBuckets.balconyRailMetal, sideHandrailGeo, leftCurbX, handrailY, (wallZ + frontCurbZ) / 2);
    addVisual(visualBuckets.balconyRailMetal, sideHandrailGeo, rightCurbX, handrailY, (wallZ + frontCurbZ) / 2);
    sideHandrailGeo.dispose();

    // C. Thin Horizontal Chrome Mid-Rail (Y = 1.25m, centered in the 0.18m gap above the glass)
    const frontMidRailGeo = new THREE.CylinderGeometry(midRailDia / 2, midRailDia / 2, balW, 12);
    frontMidRailGeo.rotateZ(Math.PI / 2);
    addVisual(visualBuckets.balconyRailMetal, frontMidRailGeo, balX, midRailY, frontCurbZ);
    frontMidRailGeo.dispose();

    const sideMidRailGeo = new THREE.CylinderGeometry(midRailDia / 2, midRailDia / 2, sideReturnL, 12);
    sideMidRailGeo.rotateX(Math.PI / 2);
    addVisual(visualBuckets.balconyRailMetal, sideMidRailGeo, leftCurbX, midRailY, (wallZ + frontCurbZ) / 2);
    addVisual(visualBuckets.balconyRailMetal, sideMidRailGeo, rightCurbX, midRailY, (wallZ + frontCurbZ) / 2);
    sideMidRailGeo.dispose();

    // D. Lightly Smoked Glass Balustrade Panels (Y = 0.24m to Y = 1.16m)
    const glassBottomY = 0.24;
    const glassTopY = 1.16;
    const glassH = glassTopY - glassBottomY; // 0.92m
    const glassY = (glassBottomY + glassTopY) / 2; // 0.70m
    const glassThick = 0.012;

    // Front glass panels between posts
    const frontPanelW = postStep - postW - 0.030; // ~1.372m
    const frontPanelGeo = new THREE.BoxGeometry(frontPanelW, glassH, glassThick);
    for (let p = 0; p < numFrontPosts - 1; p++) {
      const px = rightCurbX + (p + 0.5) * postStep;
      addVisual(visualBuckets.balconySmokedGlass, frontPanelGeo, px, glassY, frontCurbZ);
    }
    frontPanelGeo.dispose();

    // Side return glass panels (4 panels per side)
    const sidePanelW = sideStep - postW - 0.030;
    const sidePanelGeo = new THREE.BoxGeometry(glassThick, glassH, sidePanelW);
    for (let sp = 0; sp < numSideIntervals; sp++) {
      const sz = wallZ + (sp + 0.5) * sideStep;
      addVisual(visualBuckets.balconySmokedGlass, sidePanelGeo, leftCurbX, glassY, sz);
      addVisual(visualBuckets.balconySmokedGlass, sidePanelGeo, rightCurbX, glassY, sz);
    }
    sidePanelGeo.dispose();

    // E. Small Chrome Mounting Clamps on posts
    const clampGeo = new THREE.BoxGeometry(0.024, 0.032, 0.024);
    const clampYLevels = [0.38, 1.02];
    for (let p = 0; p < numFrontPosts; p++) {
      const px = rightCurbX + p * postStep;
      for (const cy of clampYLevels) {
        if (p < numFrontPosts - 1) addVisual(visualBuckets.balconyRailMetal, clampGeo, px + postW / 2 + 0.008, cy, frontCurbZ);
        if (p > 0) addVisual(visualBuckets.balconyRailMetal, clampGeo, px - postW / 2 - 0.008, cy, frontCurbZ);
      }
    }
    clampGeo.dispose();

    // -------------------------------------------------------------------------
    // 5. High-Craft 3D Outdoor Patio Furniture Sets with Market Umbrellas
    // -------------------------------------------------------------------------
    const _vDir = new THREE.Vector3();
    const _vMid = new THREE.Vector3();
    const _vUnitZ = new THREE.Vector3(0, 0, 1);
    const _vScale = new THREE.Vector3(1, 1, 1);
    const _qRod = new THREE.Quaternion();
    const _mRod = new THREE.Matrix4();

    const addRod = (bucket, x1, y1, z1, x2, y2, z2, width, height) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.001) return;

      const rodGeo = new THREE.BoxGeometry(width, height, len);
      _vDir.set(dx / len, dy / len, dz / len);
      _vMid.set((x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5);
      _qRod.setFromUnitVectors(_vUnitZ, _vDir);
      _mRod.compose(_vMid, _qRod, _vScale);

      const g = rodGeo.toNonIndexed();
      g.applyMatrix4(_mRod);
      bucket.push(g);
      rodGeo.dispose();
    };

    const buildPatioSet = (setX, setZ, hasProps = false) => {
      // A. Large Market Patio Umbrella (Hero Scale, 8-rib collapsible mechanical structure)
      // 1. Heavy circular cast-iron weight base
      const baseGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.06, 24);
      addVisual(visualBuckets.patioMetal, baseGeo, setX, 0.03, setZ);
      baseGeo.dispose();

      // 2. Vertical aluminum center pole (height = 2.55m)
      const poleGeo = new THREE.CylinderGeometry(0.022, 0.022, 2.55, 16);
      addVisual(visualBuckets.patioMetal, poleGeo, setX, 1.275, setZ);
      poleGeo.dispose();

      // Silver locking collar
      const collarGeo = new THREE.CylinderGeometry(0.030, 0.030, 0.035, 16);
      addVisual(visualBuckets.vestibuleChrome, collarGeo, setX, 1.05, setZ);
      collarGeo.dispose();

      // 3D Side crank winder housing & angled crank handle at Y = 1.15m
      const crankBoxGeo = new THREE.BoxGeometry(0.05, 0.08, 0.05);
      addVisual(visualBuckets.patioMetal, crankBoxGeo, setX + 0.032, 1.15, setZ);
      crankBoxGeo.dispose();

      const crankArmGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.065, 8);
      crankArmGeo.rotateZ(Math.PI / 4);
      addVisual(visualBuckets.vestibuleChrome, crankArmGeo, setX + 0.075, 1.165, setZ);
      crankArmGeo.dispose();

      const crankKnobGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.032, 8);
      crankKnobGeo.rotateX(Math.PI / 2);
      addVisual(visualBuckets.patioMetal, crankKnobGeo, setX + 0.10, 1.185, setZ);
      crankKnobGeo.dispose();

      // Upper Notch / Top Hub at apex (Y = 2.505m, R = 0.040m)
      const topHubGeo = new THREE.CylinderGeometry(0.040, 0.040, 0.045, 16);
      addVisual(visualBuckets.patioMetal, topHubGeo, setX, 2.505, setZ);
      topHubGeo.dispose();

      // Lower Runner Hub (Sliding Hub at Y = 2.06m)
      const runnerHubGeo = new THREE.CylinderGeometry(0.040, 0.040, 0.055, 16);
      addVisual(visualBuckets.patioMetal, runnerHubGeo, setX, 2.06, setZ);
      runnerHubGeo.dispose();

      const runnerCollarGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.020, 16);
      addVisual(visualBuckets.vestibuleChrome, runnerCollarGeo, setX, 2.02, setZ);
      runnerCollarGeo.dispose();

      // 8-Segment Canopy Framework: 8 Main Ribs + 8 Diagonal Stretchers + Pivot Hinge Brackets + Outer Tip Caps
      const tipCapGeo = new THREE.BoxGeometry(0.024, 0.020, 0.036);
      const hingeBracketGeo = new THREE.BoxGeometry(0.020, 0.024, 0.026);

      for (let k = 0; k < 8; k++) {
        const theta = (k * Math.PI) / 4;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);

        // 1. Main Rib from Upper Hub (r = 0.04m, Y = 2.500m) along underside of seam to corner tip (r = 1.320m, Y = 2.142m)
        const ribStartX = setX + 0.040 * sinT;
        const ribStartY = 2.500;
        const ribStartZ = setZ + 0.040 * cosT;

        const ribEndX = setX + 1.320 * sinT;
        const ribEndY = 2.142;
        const ribEndZ = setZ + 1.320 * cosT;

        addRod(visualBuckets.patioMetal, ribStartX, ribStartY, ribStartZ, ribEndX, ribEndY, ribEndZ, 0.016, 0.012);

        // Outer corner tip pocket cap
        addVisual(visualBuckets.patioMetal, tipCapGeo, ribEndX, ribEndY + 0.005, ribEndZ, 0, theta, 0);

        // 2. Diagonal Stretcher (Strut) from Lower Runner Hub (r = 0.04m, Y = 2.060m) to Main Rib midpoint (r = 0.580m, Y = 2.342m)
        const strStartX = setX + 0.040 * sinT;
        const strStartY = 2.060;
        const strStartZ = setZ + 0.040 * cosT;

        const strEndX = setX + 0.580 * sinT;
        const strEndY = 2.342;
        const strEndZ = setZ + 0.580 * cosT;

        addRod(visualBuckets.patioMetal, strStartX, strStartY, strStartZ, strEndX, strEndY, strEndZ, 0.014, 0.012);

        // Pivot hinge bracket at strut-rib connection
        addVisual(visualBuckets.patioMetal, hingeBracketGeo, strEndX, strEndY, strEndZ, 0, theta, 0);
      }

      tipCapGeo.dispose();
      hingeBracketGeo.dispose();

      // 3. Octagonal Warm Tan Fabric Canopy (diameter = 2.65m, radius = 1.325m, Y = 2.15m to 2.52m)
      const canopyGeo = new THREE.CylinderGeometry(0.08, 1.325, 0.37, 8, 1, true);
      addVisual(visualBuckets.patioUmbrella, canopyGeo, setX, 2.335, setZ);
      canopyGeo.dispose();

      // Second-tier wind-vent cap / valance at apex (Y = 2.45m to 2.58m)
      const ventGeo = new THREE.CylinderGeometry(0.04, 0.38, 0.14, 8, 1, true);
      addVisual(visualBuckets.patioUmbrella, ventGeo, setX, 2.51, setZ);
      ventGeo.dispose();

      // Turned finial ball at top
      const finialGeo = new THREE.SphereGeometry(0.035, 12, 10);
      addVisual(visualBuckets.patioMetal, finialGeo, setX, 2.61, setZ);
      finialGeo.dispose();

      // B. Square Hero-Scale Patio Dining Table (1.24m x 1.24m, height = 0.82m)
      const tableW = 1.24;
      const tableTopY = 0.82;
      const frameThick = 0.040;
      const frameDepth = 0.040;

      // Tabletop outer perimeter metal frame
      const frameRimLongGeo = new THREE.BoxGeometry(tableW, frameThick, frameDepth);
      addVisual(visualBuckets.patioMetal, frameRimLongGeo, setX, tableTopY - frameThick / 2, setZ + tableW / 2 - frameDepth / 2);
      addVisual(visualBuckets.patioMetal, frameRimLongGeo, setX, tableTopY - frameThick / 2, setZ - tableW / 2 + frameDepth / 2);
      frameRimLongGeo.dispose();

      const frameRimShortGeo = new THREE.BoxGeometry(frameDepth, frameThick, tableW - frameDepth * 2);
      addVisual(visualBuckets.patioMetal, frameRimShortGeo, setX + tableW / 2 - frameDepth / 2, tableTopY - frameThick / 2, setZ);
      addVisual(visualBuckets.patioMetal, frameRimShortGeo, setX - tableW / 2 + frameDepth / 2, tableTopY - frameThick / 2, setZ);
      frameRimShortGeo.dispose();

      // Teak wood slats tabletop (7 horizontal slats)
      const numSlats = 7;
      const slatInnerW = tableW - frameDepth * 2; // 1.16m
      const slatD = (slatInnerW - (numSlats - 1) * 0.008) / numSlats; // ~0.158m per slat
      const slatH = 0.024;
      const slatGeo = new THREE.BoxGeometry(slatInnerW, slatH, slatD);
      for (let s = 0; s < numSlats; s++) {
        const sz = setZ - slatInnerW / 2 + (s + 0.5) * (slatInnerW / numSlats);
        // Leave center clearance for pole
        if (Math.abs(sz - setZ) < 0.07) {
          const splitW = (slatInnerW - 0.14) / 2;
          const splitGeo = new THREE.BoxGeometry(splitW, slatH, slatD);
          addVisual(visualBuckets.patioTabletop, splitGeo, setX - splitW / 2 - 0.07, tableTopY - slatH / 2, sz);
          addVisual(visualBuckets.patioTabletop, splitGeo, setX + splitW / 2 + 0.07, tableTopY - slatH / 2, sz);
          splitGeo.dispose();
        } else {
          addVisual(visualBuckets.patioTabletop, slatGeo, setX, tableTopY - slatH / 2, sz);
        }
      }
      slatGeo.dispose();

      // Center umbrella grommet ring
      const grommetGeo = new THREE.CylinderGeometry(0.040, 0.040, 0.030, 16);
      addVisual(visualBuckets.patioMetal, grommetGeo, setX, tableTopY - 0.015, setZ);
      grommetGeo.dispose();

      // 4 Chunky tubular table legs (radius 0.024m, height = 0.78m)
      const legRadius = 0.024;
      const legH = tableTopY - frameThick; // 0.78m
      const legGeo = new THREE.CylinderGeometry(legRadius, legRadius, legH, 14);
      const legOffset = tableW / 2 - 0.07; // 0.55m
      const legPositions = [
        [-legOffset, -legOffset],
        [legOffset, -legOffset],
        [-legOffset, legOffset],
        [legOffset, legOffset]
      ];
      for (const [lx, lz] of legPositions) {
        addVisual(visualBuckets.patioMetal, legGeo, setX + lx, legH / 2, setZ + lz);
      }
      legGeo.dispose();

      // Foot glides
      const glideGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.018, 14);
      for (const [lx, lz] of legPositions) {
        addVisual(visualBuckets.patioMetal, glideGeo, setX + lx, 0.009, setZ + lz);
      }
      glideGeo.dispose();

      // C. 4 Hero-Scale Patio Armchairs per Table (Width: 0.60m, Depth: 0.54m, Seat Y = 0.50m, Arm Y = 0.72m, Back Top Y = 1.02m)
      const chairDist = 0.88;
      const chairConfigs = [
        { x: setX, z: setZ - chairDist, rotY: 0 },              // South chair, facing North (+Z) towards table
        { x: setX, z: setZ + chairDist, rotY: Math.PI },          // North chair, facing South (-Z) towards table
        { x: setX - chairDist, z: setZ, rotY: Math.PI * 0.5 },    // West chair, facing East (+X) towards table
        { x: setX + chairDist, z: setZ, rotY: -Math.PI * 0.5 }    // East chair, facing West (-X) towards table
      ];

      const chairSeatW = 0.60;
      const chairSeatD = 0.54;
      const seatH = 0.50;
      const armH = 0.72;
      const backTopH = 1.02;
      const tubeThick = 0.026;

      // Geometries for chair parts (reused across all 4 chairs)
      // 1. Seat frame: side rails and cross rails
      const seatSideRailGeo = new THREE.BoxGeometry(tubeThick, tubeThick, chairSeatD);
      const seatCrossRailGeo = new THREE.BoxGeometry(chairSeatW - tubeThick * 2, tubeThick, tubeThick);

      // 2. Teak seat slats (5 horizontal slats recessed into frame)
      const numSeatSlats = 5;
      const seatSlatW = chairSeatW - tubeThick * 2 - 0.010; // ~0.538m
      const seatSlatD = 0.088;
      const seatSlatH = 0.018;
      const seatSlatGeo = new THREE.BoxGeometry(seatSlatW, seatSlatH, seatSlatD);

      // 3. Front legs with integrated armrest upright (continuous tubular upright from floor to armrest)
      // Height = armH - 0.010 = 0.71m. Center Y = 0.010 + 0.71 / 2 = 0.365m.
      const frontUprightH = armH - 0.010;
      const frontUprightGeo = new THREE.CylinderGeometry(0.015, 0.015, frontUprightH, 12);

      // 4. Rear legs (from floor to seat)
      const rearLegH = seatH - 0.010;
      const rearLegGeo = new THREE.CylinderGeometry(0.015, 0.015, rearLegH, 12);

      // 5. Backrest posts (rising from seat to backTopH with -8.6° backward recline)
      const backRise = backTopH - seatH; // 0.52m
      const reclineAngle = 0.15; // ~8.6° backward
      const backPostLen = backRise / Math.cos(reclineAngle); // ~0.526m
      const backPostGeo = new THREE.CylinderGeometry(0.015, 0.015, backPostLen, 12);
      const backPostCapGeo = new THREE.SphereGeometry(0.018, 10, 8);

      // 6. 3 Teak backrest slats
      const backSlatW = chairSeatW - tubeThick * 2 - 0.010; // ~0.538m
      const backSlatH = 0.092;
      const backSlatThick = 0.020;
      const backSlatGeo = new THREE.BoxGeometry(backSlatW, backSlatH, backSlatThick);

      // 7. Left & Right Armrest tubular bars
      const armBarLen = chairSeatD - 0.06; // 0.48m
      const armBarGeo = new THREE.BoxGeometry(tubeThick, 0.022, armBarLen);

      // 8. Teak wood armrest caps (warm tactile forearm rests)
      const armCapGeo = new THREE.BoxGeometry(0.046, 0.016, armBarLen + 0.02);

      // 9. Leg foot glides
      const chairGlideGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.012, 12);

      const chairPos = new THREE.Vector3();
      const chairQuat = new THREE.Quaternion();
      const chairScale = new THREE.Vector3(1, 1, 1);
      const chairMatrix = new THREE.Matrix4();
      const localMat = new THREE.Matrix4();
      const worldMat = new THREE.Matrix4();
      const _lPos = new THREE.Vector3();
      const _lQuat = new THREE.Quaternion();
      const _lEuler = new THREE.Euler();

      const applyLocalPart = (bucket, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0) => {
        _lPos.set(lx, ly, lz);
        _lEuler.set(rx, ry, rz);
        _lQuat.setFromEuler(_lEuler);
        localMat.compose(_lPos, _lQuat, chairScale);
        worldMat.multiplyMatrices(chairMatrix, localMat);

        const g = (geo.index ? geo.toNonIndexed() : geo.clone());
        g.applyMatrix4(worldMat);
        bucket.push(g);
      };

      const legOffX = chairSeatW / 2 - 0.035;
      const frontLegZ = chairSeatD / 2 - 0.035;
      const rearLegZ = -chairSeatD / 2 + 0.035;

      for (const ch of chairConfigs) {
        chairPos.set(ch.x, 0, ch.z);
        chairQuat.setFromEuler(new THREE.Euler(0, ch.rotY, 0));
        chairMatrix.compose(chairPos, chairQuat, chairScale);

        // A. Seat frame perimeter
        applyLocalPart(visualBuckets.patioMetal, seatSideRailGeo, -chairSeatW / 2 + tubeThick / 2, seatH - tubeThick / 2, 0);
        applyLocalPart(visualBuckets.patioMetal, seatSideRailGeo, chairSeatW / 2 - tubeThick / 2, seatH - tubeThick / 2, 0);
        applyLocalPart(visualBuckets.patioMetal, seatCrossRailGeo, 0, seatH - tubeThick / 2, frontLegZ);
        applyLocalPart(visualBuckets.patioMetal, seatCrossRailGeo, 0, seatH - tubeThick / 2, rearLegZ);

        // B. 5 Teak seat slats
        for (let sl = 0; sl < numSeatSlats; sl++) {
          const slatZ = rearLegZ + 0.048 + sl * ((chairSeatD - 0.12) / (numSeatSlats - 1));
          applyLocalPart(visualBuckets.patioTeak, seatSlatGeo, 0, seatH - 0.005, slatZ);
        }

        // C. Continuous Front Legs + Armrest Uprights (rising from floor Y = 0.010m to armrest Y = 0.72m)
        applyLocalPart(visualBuckets.patioMetal, frontUprightGeo, -legOffX, frontUprightH / 2 + 0.010, frontLegZ);
        applyLocalPart(visualBuckets.patioMetal, frontUprightGeo, legOffX, frontUprightH / 2 + 0.010, frontLegZ);

        // D. Rear Legs (from floor Y = 0.010m to seat Y = 0.50m)
        applyLocalPart(visualBuckets.patioMetal, rearLegGeo, -legOffX, rearLegH / 2 + 0.010, rearLegZ);
        applyLocalPart(visualBuckets.patioMetal, rearLegGeo, legOffX, rearLegH / 2 + 0.010, rearLegZ);

        // E. 4 Foot Glides
        applyLocalPart(visualBuckets.patioMetal, chairGlideGeo, -legOffX, 0.006, frontLegZ, 0, 0, 0, false);
        applyLocalPart(visualBuckets.patioMetal, chairGlideGeo, legOffX, 0.006, frontLegZ, 0, 0, 0, false);
        applyLocalPart(visualBuckets.patioMetal, chairGlideGeo, -legOffX, 0.006, rearLegZ, 0, 0, 0, false);
        applyLocalPart(visualBuckets.patioMetal, chairGlideGeo, legOffX, 0.006, rearLegZ, 0, 0, 0, false);

        // F. Reclined Backrest Uprights (2 posts tilted backwards by 8.6°)
        const backMidY = seatH + backRise / 2;
        const backMidZ = rearLegZ - (backRise / 2) * Math.sin(reclineAngle);
        applyLocalPart(visualBuckets.patioMetal, backPostGeo, -legOffX, backMidY, backMidZ, -reclineAngle, 0, 0);
        applyLocalPart(visualBuckets.patioMetal, backPostGeo, legOffX, backMidY, backMidZ, -reclineAngle, 0, 0);

        // Top decorative finial balls
        const backTopZ = rearLegZ - backRise * Math.sin(reclineAngle);
        applyLocalPart(visualBuckets.patioMetal, backPostCapGeo, -legOffX, backTopH, backTopZ, 0, 0, 0, false);
        applyLocalPart(visualBuckets.patioMetal, backPostCapGeo, legOffX, backTopH, backTopZ, 0, 0, 0, false);

        // G. 3 Teak Backrest Slats
        for (let b = 0; b < 3; b++) {
          const slatYOff = 0.12 + b * 0.15;
          const slatY = seatH + slatYOff;
          const slatZ = rearLegZ - slatYOff * Math.sin(reclineAngle) + 0.012; // Flush against front face of post
          applyLocalPart(visualBuckets.patioTeak, backSlatGeo, 0, slatY, slatZ, -reclineAngle, 0, 0);
        }

        // H. Left & Right Closed Armrests (tubular steel bar + teak wood cap)
        const armBarMidZ = (frontLegZ + rearLegZ) / 2;
        applyLocalPart(visualBuckets.patioMetal, armBarGeo, -legOffX, armH - 0.011, armBarMidZ);
        applyLocalPart(visualBuckets.patioMetal, armBarGeo, legOffX, armH - 0.011, armBarMidZ);

        applyLocalPart(visualBuckets.patioTeak, armCapGeo, -legOffX, armH + 0.008, armBarMidZ);
        applyLocalPart(visualBuckets.patioTeak, armCapGeo, legOffX, armH + 0.008, armBarMidZ);
      }

      seatSideRailGeo.dispose();
      seatCrossRailGeo.dispose();
      seatSlatGeo.dispose();
      frontUprightGeo.dispose();
      rearLegGeo.dispose();
      backPostGeo.dispose();
      backPostCapGeo.dispose();
      backSlatGeo.dispose();
      armBarGeo.dispose();
      armCapGeo.dispose();
      chairGlideGeo.dispose();

      // D. Tabletop Props on Set 1 Table
      if (hasProps) {
        // Wooden serving tray
        const trayGeo = new THREE.BoxGeometry(0.36, 0.020, 0.24);
        addVisual(visualBuckets.patioTray, trayGeo, setX + 0.12, tableTopY + 0.010, setZ - 0.10);
        trayGeo.dispose();

        // French press coffee carafe
        const pressGlassGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.14, 16);
        addVisual(visualBuckets.vestibuleGlass, pressGlassGeo, setX + 0.06, tableTopY + 0.09, setZ - 0.10);
        pressGlassGeo.dispose();

        const pressCoffeeGeo = new THREE.CylinderGeometry(0.039, 0.039, 0.08, 16);
        addVisual(visualBuckets.coffeeMachine, pressCoffeeGeo, setX + 0.06, tableTopY + 0.06, setZ - 0.10);
        pressCoffeeGeo.dispose();

        const pressChromeGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.018, 16);
        addVisual(visualBuckets.vestibuleChrome, pressChromeGeo, setX + 0.06, tableTopY + 0.165, setZ - 0.10);
        pressChromeGeo.dispose();

        const plungerRodGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.08, 8);
        addVisual(visualBuckets.vestibuleChrome, plungerRodGeo, setX + 0.06, tableTopY + 0.20, setZ - 0.10);
        plungerRodGeo.dispose();

        // 2 White ceramic coffee mugs
        const mugGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.07, 16);
        addVisual(visualBuckets.patioCeramic, mugGeo, setX + 0.18, tableTopY + 0.055, setZ - 0.06);
        addVisual(visualBuckets.patioCeramic, mugGeo, setX + 0.18, tableTopY + 0.055, setZ - 0.14);
        mugGeo.dispose();

        const mugCoffeeGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.005, 12);
        addVisual(visualBuckets.coffeeMachine, mugCoffeeGeo, setX + 0.18, tableTopY + 0.080, setZ - 0.06);
        addVisual(visualBuckets.coffeeMachine, mugCoffeeGeo, setX + 0.18, tableTopY + 0.080, setZ - 0.14);
        mugCoffeeGeo.dispose();

        // Open magazine
        const magGeo = new THREE.BoxGeometry(0.20, 0.004, 0.14);
        addVisual(visualBuckets.extinguisherLabel, magGeo, setX - 0.22, tableTopY + 0.004, setZ + 0.12, 0, 0.25, 0);
        magGeo.dispose();
      }
    };

    // Build Set 1 (positioned at X = -3.20m, Z = 15.60m in front of panoramic window, with tabletop props)
    buildPatioSet(-3.20, 15.60, true);

    // Build Set 2 (slid away from balcony door to X = 1.80m, Z = 15.60m)
    buildPatioSet(1.80, 15.60, false);

    // 6. Skyscraper Exterior Concrete Facade Drop below Balcony (Y = 0.00 down to -35.00m)
    const dropH = 35.00;
    const dropY = -dropH / 2;
    // Front drop
    const frontDropGeo = new THREE.BoxGeometry(balW, dropH, 0.30);
    addVisual(visualBuckets.balconyExteriorWall, frontDropGeo, balX, dropY, frontOuterZ - 0.15);
    frontDropGeo.dispose();

    // Side drops
    const sideDropGeo = new THREE.BoxGeometry(0.30, dropH, balD);
    addVisual(visualBuckets.balconyExteriorWall, sideDropGeo, balX + balW / 2 - 0.15, dropY, balZ);
    addVisual(visualBuckets.balconyExteriorWall, sideDropGeo, balX - balW / 2 + 0.15, dropY, balZ);
    sideDropGeo.dispose();
  }

  /**
   * Constructs the Alive 3D Parallax Nighttime City Skyline:
   * - Layer A: Curved Panoramic Sky Backdrop (Radius = 115m, Height = 95m, unlit fog-free)
   * - Layer B: Dedicated 3D Luminous Glowing Moon (10m x 10m at X = -6.5m, Y = 16.5m, Z = 108m)
   * - Layer C: 32 3D High-Rise Skyscraper Towers across 3 True Depth Tiers (Z = 38m to 125m, Y = -35m to +15m)
   * - Layer D: Stepped Rooftop Crowns, Illuminated Roof Trims & Pulsing Red Aviation Warning Beacons
   */
  _buildNightCitySkyline(addVisual, visualBuckets, group) {
    // -------------------------------------------------------------------------
    // Layer A: Pure Pitch-Black Unlit Sky Dome (Radius = 220m, 360° Surrounding)
    // -------------------------------------------------------------------------
    const skyGeo = new THREE.SphereGeometry(220, 32, 24);
    const skyMesh = new THREE.Mesh(skyGeo, this.nightSkyBackdropMaterial);
    skyMesh.position.set(0, 0, 15);
    skyMesh.renderOrder = -10;
    skyMesh.castShadow = false;
    skyMesh.receiveShadow = false;
    skyMesh.name = 'DC_NightSkyBackdrop';
    group.add(skyMesh);

    // -------------------------------------------------------------------------
    // Layer B: Screen-Space Anti-Aliased Pinpoint Starfield (THREE.Points, sizeAttenuation: false)
    // -------------------------------------------------------------------------
    const starPointTexture = createStarPointTexture();

    let seed = 42109;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const generateStarVertices = (count) => {
      const positions = new Float32Array(count * 3);
      let idx = 0;
      while (idx < count) {
        const u = rand() * 2 - 1;
        const v = rand() * 2 - 1;
        const w = rand() * 2 - 1;
        const lenSq = u * u + v * v + w * w;
        if (lenSq > 1 || lenSq < 0.0001) continue;
        const invLen = 1 / Math.sqrt(lenSq);
        const r = 188 + rand() * 4;
        const px = u * invLen * r;
        const py = v * invLen * r;
        const pz = 15 + w * invLen * r;
        if (py >= -5 && pz >= 5) {
          positions[idx * 3] = px;
          positions[idx * 3 + 1] = py;
          positions[idx * 3 + 2] = pz;
          idx++;
        }
      }
      return positions;
    };

    // Layer B1: 1,800 Faint Pinpoint Stars (sub-pixel 0.65 size, opacity 0.35, color 0xcbd5e1)
    const pointsGeoA = new THREE.BufferGeometry();
    pointsGeoA.setAttribute('position', new THREE.Float32BufferAttribute(generateStarVertices(1800), 3));
    const pointsMatA = new THREE.PointsMaterial({
      map: starPointTexture,
      alphaTest: 0.05,
      color: 0xcbd5e1,
      size: 0.65,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.35,
      fog: false,
      toneMapped: false,
      depthWrite: false,
    });
    const starsA = new THREE.Points(pointsGeoA, pointsMatA);
    starsA.renderOrder = -9;
    starsA.name = 'DC_Stars_Faint';
    group.add(starsA);

    // Layer B2: 250 Crisp Bright Pinpoint Stars (0.95 size, opacity 0.78, color 0xffffff)
    const pointsGeoB = new THREE.BufferGeometry();
    pointsGeoB.setAttribute('position', new THREE.Float32BufferAttribute(generateStarVertices(250), 3));
    const pointsMatB = new THREE.PointsMaterial({
      map: starPointTexture,
      alphaTest: 0.05,
      color: 0xffffff,
      size: 0.95,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.78,
      fog: false,
      toneMapped: false,
      depthWrite: false,
    });
    const starsB = new THREE.Points(pointsGeoB, pointsMatB);
    starsB.renderOrder = -8;
    starsB.name = 'DC_Stars_Bright';
    group.add(starsB);

    // -------------------------------------------------------------------------
    // Layer C: ONE Single Photorealistic 3D Moon (Celestial Distance, Upper Right Sky)
    // Positioned at (X = 124.0m, Y = 100.0m, Z = 117.0m) at celestial distance R = 188.5m,
    // matching the exact position drawn in the user's reference screenshot (media_1793994528461_590ddf26.jpg).
    // Sized at 38.4m x 38.4m (20% smaller as requested for authentic celestial scale).
    // -------------------------------------------------------------------------
    const moonGeo = new THREE.PlaneGeometry(38.4, 38.4);
    const moonMesh = new THREE.Mesh(moonGeo, this.moonMaterial);
    moonMesh.position.set(124.0, 100.0, 117.0);
    moonMesh.lookAt(0, 1.7, 12.6);
    moonMesh.renderOrder = -2;
    moonMesh.castShadow = false;
    moonMesh.receiveShadow = false;
    moonMesh.name = 'DC_GlowingMoon';
    group.add(moonMesh);

    // -------------------------------------------------------------------------
    // Layer D: 37 3D Skyscraper Towers Horizontally Distributed (X = -65m to +65m)
    // - Foreground towers (Z = 40m–55m) spaced with 4.0m to 8.5m of open sky between them
    // - Midground (Z = 62m–86m) and Distant (Z = 92m–125m) towers staggered behind gaps
    // - All towers feature complete architectural crowns, penthouses, trims & beacons
    // -------------------------------------------------------------------------
    const towers = [
      // Tier 1 — Foreground (Z = 40m to 54m): 9 towers across X = -56m to +60m
      { x: -56.0, z: 46.0, w: 6.8, d: 6.0, hTop: 9.5, hBot: -35.0, facade: 'A', beacon: true, spireH: 3.8, penthouse: true, roofTrim: true, cornerBeacons: true },
      { x: -42.0, z: 43.0, w: 6.2, d: 5.6, hTop: 10.2, hBot: -35.0, facade: 'C', beacon: true, spireH: 4.0, penthouse: true, roofTrim: true, cornerBeacons: true },
      { x: -28.0, z: 45.0, w: 6.5, d: 5.8, hTop: 9.0, hBot: -35.0, facade: 'B', beacon: true, spireH: 3.5, penthouse: true, roofTrim: true, cornerBeacons: true },
      // Restored Tower: Full penthouse crown, roof trim, spire antenna & red warning beacons
      { x: -9.5, z: 44.0, w: 6.0, d: 5.5, hTop: 9.8, hBot: -35.0, facade: 'A', beacon: true, spireH: 4.0, penthouse: true, roofTrim: true, cornerBeacons: true },
      // Landmark Diagrid Tower (Slender, gold diagrid lines, 3-tier stepped crown, and spire)
      { x: 8.5, z: 50.0, w: 6.5, d: 6.0, hTop: 13.0, hBot: -35.0, facade: 'D', beacon: true, spireH: 4.8, crownSteps: 3, roofTrim: true, cornerBeacons: true },
      { x: 22.0, z: 43.0, w: 6.2, d: 5.8, hTop: 8.8, hBot: -35.0, facade: 'B', beacon: true, spireH: 3.2, penthouse: true, roofTrim: true, cornerBeacons: true },
      { x: 35.0, z: 47.0, w: 6.6, d: 6.0, hTop: 10.8, hBot: -35.0, facade: 'C', beacon: true, spireH: 4.2, penthouse: true, roofTrim: true, cornerBeacons: true },
      { x: 48.0, z: 44.0, w: 6.2, d: 5.8, hTop: 9.2, hBot: -35.0, facade: 'A', beacon: true, spireH: 3.6, penthouse: true, roofTrim: true, cornerBeacons: true },
      { x: 60.0, z: 48.0, w: 7.0, d: 6.5, hTop: 8.5, hBot: -35.0, facade: 'B', beacon: false, penthouse: true, roofTrim: true },

      // Tier 2 — Midground (Z = 62m to 86m): 13 towers filling corridors and creating 3D parallax
      { x: -64.0, z: 66.0, w: 8.0, d: 7.5, hTop: 11.5, hBot: -35.0, facade: 'C', beacon: true, spireH: 4.0, penthouse: true, roofTrim: true },
      { x: -49.0, z: 62.0, w: 7.5, d: 7.0, hTop: 12.2, hBot: -35.0, facade: 'A', beacon: true, spireH: 4.5, crownSteps: 2, roofTrim: true },
      { x: -35.0, z: 68.0, w: 7.8, d: 7.2, hTop: 13.0, hBot: -35.0, facade: 'B', beacon: true, spireH: 4.8, penthouse: true, roofTrim: true },
      { x: -20.0, z: 64.0, w: 7.2, d: 6.8, hTop: 12.5, hBot: -35.0, facade: 'C', beacon: true, spireH: 4.2, crownSteps: 2, roofTrim: true },
      // Restored Midground Tower: Stepped crown, roof trim, spire antenna & red warning beacon
      { x: -7.0, z: 76.0, w: 6.5, d: 6.0, hTop: 12.8, hBot: -35.0, facade: 'A', beacon: true, spireH: 4.5, crownSteps: 2, roofTrim: true },
      { x: 0.0, z: 65.0, w: 7.2, d: 6.8, hTop: 12.8, hBot: -35.0, facade: 'B', beacon: true, spireH: 4.6, crownSteps: 3, roofTrim: true },
      { x: 15.0, z: 63.0, w: 7.5, d: 7.0, hTop: 11.8, hBot: -35.0, facade: 'C', beacon: true, spireH: 4.0, penthouse: true, roofTrim: true },
      { x: 28.5, z: 67.0, w: 8.0, d: 7.5, hTop: 13.5, hBot: -35.0, facade: 'A', beacon: true, spireH: 5.0, crownSteps: 2, roofTrim: true },
      { x: 42.0, z: 64.0, w: 7.6, d: 7.2, hTop: 12.0, hBot: -35.0, facade: 'B', beacon: true, spireH: 4.2, penthouse: true, roofTrim: true },
      { x: 54.0, z: 68.0, w: 8.0, d: 7.5, hTop: 13.2, hBot: -35.0, facade: 'C', beacon: false, penthouse: true, roofTrim: true },
      { x: 65.0, z: 62.0, w: 8.2, d: 7.6, hTop: 11.0, hBot: -35.0, facade: 'A', beacon: true, spireH: 3.8, penthouse: true, roofTrim: true },
      { x: -27.0, z: 82.0, w: 8.5, d: 7.8, hTop: 13.8, hBot: -35.0, facade: 'B', beacon: true, spireH: 4.5, crownSteps: 2, roofTrim: true },
      { x: 35.0, z: 82.0, w: 8.5, d: 8.0, hTop: 13.5, hBot: -35.0, facade: 'A', beacon: true, spireH: 4.6, penthouse: true, roofTrim: true },

      // Tier 3 — Distant Horizon (Z = 92m to 125m): 15 towers creating a vast sprawling skyline
      { x: -62.0, z: 95.0, w: 10.0, d: 9.0, hTop: 13.5, hBot: -35.0, facade: 'A', beacon: false },
      { x: -48.0, z: 100.0, w: 9.5, d: 8.5, hTop: 14.2, hBot: -35.0, facade: 'C', beacon: true, spireH: 4.0 },
      { x: -34.0, z: 96.0, w: 9.0, d: 8.0, hTop: 13.8, hBot: -35.0, facade: 'B', beacon: false },
      { x: -18.0, z: 102.0, w: 9.2, d: 8.2, hTop: 14.0, hBot: -35.0, facade: 'A', beacon: true, spireH: 4.2 },
      // Restored Distant Tower: Spire antenna & red warning beacon
      { x: -5.0, z: 98.0, w: 8.8, d: 8.0, hTop: 14.0, hBot: -35.0, facade: 'C', beacon: true, spireH: 4.0 },
      { x: 8.0, z: 95.0, w: 9.0, d: 8.2, hTop: 14.5, hBot: -35.0, facade: 'B', beacon: true, spireH: 4.0 },
      { x: 22.0, z: 100.0, w: 9.5, d: 8.5, hTop: 13.8, hBot: -35.0, facade: 'A', beacon: false },
      { x: 38.0, z: 96.0, w: 9.2, d: 8.2, hTop: 14.2, hBot: -35.0, facade: 'C', beacon: true, spireH: 4.5 },
      { x: 52.0, z: 98.0, w: 9.8, d: 8.6, hTop: 13.5, hBot: -35.0, facade: 'B', beacon: false },
      { x: 64.0, z: 94.0, w: 10.0, d: 8.8, hTop: 13.0, hBot: -35.0, facade: 'A', beacon: false },
      { x: -42.0, z: 118.0, w: 11.5, d: 10.0, hTop: 14.5, hBot: -35.0, facade: 'B', beacon: false },
      { x: -20.0, z: 120.0, w: 11.0, d: 9.5, hTop: 14.8, hBot: -35.0, facade: 'A', beacon: true, spireH: 3.5 },
      { x: 2.0, z: 122.0, w: 11.0, d: 9.5, hTop: 14.2, hBot: -35.0, facade: 'C', beacon: false },
      { x: 25.0, z: 118.0, w: 11.5, d: 10.0, hTop: 14.6, hBot: -35.0, facade: 'B', beacon: false },
      { x: 48.0, z: 120.0, w: 11.8, d: 10.2, hTop: 13.8, hBot: -35.0, facade: 'A', beacon: false },
    ];

    this.skylineBeacons = [];
    const beaconSphereGeo = new THREE.SphereGeometry(0.22, 12, 10);
    const cornerBeaconGeo = new THREE.SphereGeometry(0.14, 10, 8);
    const beaconGeosA = [];
    const beaconGeosB = [];
    const _mBeacon = new THREE.Matrix4();

    for (let t = 0; t < towers.length; t++) {
      const tow = towers[t];
      const hTotal = tow.hTop - tow.hBot;
      const centerY = (tow.hTop + tow.hBot) / 2;

      const { facadeGeo, roofGeo } = createTowerGeometries(
        tow.w, hTotal, tow.d,
        tow.w,
        45.0
      );

      let targetBucket = visualBuckets.skylineTowerA;
      if (tow.facade === 'B') targetBucket = visualBuckets.skylineTowerB;
      else if (tow.facade === 'C') targetBucket = visualBuckets.skylineTowerC;
      else if (tow.facade === 'D') targetBucket = visualBuckets.skylineTowerD;

      addVisual(targetBucket, facadeGeo, tow.x, centerY, tow.z);
      addVisual(visualBuckets.skylineTowerRoofs, roofGeo, tow.x, centerY, tow.z);
      facadeGeo.dispose();
      roofGeo.dispose();

      let roofTopY = tow.hTop;

      // Illuminated architectural roof trim
      if (tow.roofTrim) {
        const trimH = 0.18;
        const trimGeo = new THREE.BoxGeometry(tow.w + 0.10, trimH, tow.d + 0.10);
        addVisual(visualBuckets.skylineRoofTrim, trimGeo, tow.x, roofTopY + trimH / 2, tow.z);
        trimGeo.dispose();
      }

      if (tow.crownSteps) {
        let cw = tow.w * 0.78;
        let cd = tow.d * 0.78;
        const stepH = 1.80;
        for (let s = 0; s < tow.crownSteps; s++) {
          const stepGeo = new THREE.BoxGeometry(cw, stepH, cd);
          addVisual(visualBuckets.skylineTowerRoofs, stepGeo, tow.x, roofTopY + stepH / 2, tow.z);
          stepGeo.dispose();

          if (tow.roofTrim) {
            const stepTrimGeo = new THREE.BoxGeometry(cw + 0.08, 0.14, cd + 0.08);
            addVisual(visualBuckets.skylineRoofTrim, stepTrimGeo, tow.x, roofTopY + stepH + 0.07, tow.z);
            stepTrimGeo.dispose();
          }

          roofTopY += stepH;
          cw *= 0.72;
          cd *= 0.72;
        }
      } else if (tow.penthouse) {
        const phW = tow.w * 0.55;
        const phD = tow.d * 0.55;
        const phH = 2.40;
        const phGeo = new THREE.BoxGeometry(phW, phH, phD);
        addVisual(visualBuckets.skylineTowerRoofs, phGeo, tow.x, roofTopY + phH / 2, tow.z);
        phGeo.dispose();

        if (tow.roofTrim) {
          const phTrimGeo = new THREE.BoxGeometry(phW + 0.08, 0.14, phD + 0.08);
          addVisual(visualBuckets.skylineRoofTrim, phTrimGeo, tow.x, roofTopY + phH + 0.07, tow.z);
          phTrimGeo.dispose();
        }

        roofTopY += phH;
      }

      // Roof corner beacons on foreground towers
      if (tow.cornerBeacons) {
        const halfW = tow.w / 2 - 0.20;
        const halfD = tow.d / 2 - 0.20;
        const cornerY = tow.hTop + 0.22;
        const corners = [
          [-halfW, -halfD],
          [halfW, -halfD]
        ];
        for (let c = 0; c < corners.length; c++) {
          _mBeacon.makeTranslation(tow.x + corners[c][0], cornerY, tow.z + corners[c][1]);
          const cbG = cornerBeaconGeo.toNonIndexed();
          cbG.applyMatrix4(_mBeacon);
          if ((t + c) % 2 === 0) {
            beaconGeosA.push(cbG);
          } else {
            beaconGeosB.push(cbG);
          }
        }
      }

      // Central rooftop antenna & aviation warning beacon
      if (tow.beacon) {
        const spireHeight = tow.spireH || 4.5;
        const spireGeo = new THREE.CylinderGeometry(0.02, 0.08, spireHeight, 10);
        addVisual(visualBuckets.skylineTowerRoofs, spireGeo, tow.x, roofTopY + spireHeight / 2, tow.z);
        spireGeo.dispose();

        const beaconY = roofTopY + spireHeight + 0.15;
        _mBeacon.makeTranslation(tow.x, beaconY, tow.z);
        const bG = beaconSphereGeo.toNonIndexed();
        bG.applyMatrix4(_mBeacon);
        if (t % 2 === 0) {
          beaconGeosA.push(bG);
        } else {
          beaconGeosB.push(bG);
        }
      }
    }
    beaconSphereGeo.dispose();
    cornerBeaconGeo.dispose();

    if (beaconGeosA.length > 0) {
      const mergedA = BufferGeometryUtils.mergeGeometries(beaconGeosA, false);
      if (mergedA) {
        mergedA.computeBoundingSphere();
        this.skylineBeaconMeshA = new THREE.Mesh(mergedA, this.skylineBeaconMatA);
        this.skylineBeaconMeshA.name = 'DC_SkylineBeaconsA';
        this.skylineBeaconMeshA.castShadow = false;
        this.skylineBeaconMeshA.receiveShadow = false;
        group.add(this.skylineBeaconMeshA);
      }
      for (let i = 0; i < beaconGeosA.length; i++) beaconGeosA[i].dispose();
    }

    if (beaconGeosB.length > 0) {
      const mergedB = BufferGeometryUtils.mergeGeometries(beaconGeosB, false);
      if (mergedB) {
        mergedB.computeBoundingSphere();
        this.skylineBeaconMeshB = new THREE.Mesh(mergedB, this.skylineBeaconMatB);
        this.skylineBeaconMeshB.name = 'DC_SkylineBeaconsB';
        this.skylineBeaconMeshB.castShadow = false;
        this.skylineBeaconMeshB.receiveShadow = false;
        group.add(this.skylineBeaconMeshB);
      }
      for (let i = 0; i < beaconGeosB.length; i++) beaconGeosB[i].dispose();
    }
  }

  /**
   * Smoothly animates the sinusoidal breathing pulse of all red aviation warning beacons
   * atop the skyscrapers in the night skyline.
   */
  updateSkylineBeacons(time) {
    if (!this.skylineBeaconMatA || !this.skylineBeaconMatB) return;
    const pulseA = 0.55 + 0.45 * Math.sin(time * 3.0);
    const pulseB = 0.55 + 0.45 * Math.sin(time * 3.0 + Math.PI * 0.5);
    const rA = 0.25 + 0.75 * pulseA;
    const rB = 0.25 + 0.75 * pulseB;
    this.skylineBeaconMatA.color.setRGB(rA, 0.04 * rA, 0.04 * rA);
    this.skylineBeaconMatB.color.setRGB(rB, 0.04 * rB, 0.04 * rB);
  }

  /**
   * Returns array of procedural textures to pre-warm on the GPU during the loading screen pass.
   */
  getPreloadTextures() {
    return [
      this.serverBladeDiffuseTexture,
      this.serverBladeEmissiveTexture,
      this.noEntrySignTexture,
      this.extinguisherSignTexture,
      this.extinguisherStickerTexture,
      this.extinguisherGaugeTexture,
      this.runningManExitSignTexture,
      this.printerBadgeTexture,
      this.printerScreenTexture,
      this.fireHoseHeaderTexture,
      this.fireHoseCoilTexture,
      this.janitorCautionSignTexture,
      this.janitorBroomBristleTexture,
      this.janitorYellowVinylTexture,
      this.janitorTowelTexture,
      this.moonTexture,
      this.balconyTileTexture,
      this.skylineTowerATexture,
      this.skylineTowerBTexture,
      this.skylineTowerCTexture,
      this.skylineTowerDTexture,
    ].filter(Boolean);
  }
}

