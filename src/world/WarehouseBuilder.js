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
 * Unified cohesive floor texture for both Firing Bay & Data Center.
 * High-contrast architectural dark slate concrete with crisp grid lines.
 */
function createUnifiedFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Readable dark industrial slate slab (NOT pitch black!)
  ctx.fillStyle = '#242830';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle aggregate micro-noise
  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 14;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // 2x2 grid of 600x600mm server room floor tiles with crisp dark seams
  ctx.strokeStyle = '#14171e';
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, 508, 508);
  ctx.beginPath();
  ctx.moveTo(256, 0); ctx.lineTo(256, 512);
  ctx.moveTo(0, 256); ctx.lineTo(512, 256);
  ctx.stroke();

  // Subtle bevel seam highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(258, 0); ctx.lineTo(258, 512);
  ctx.moveTo(0, 258); ctx.lineTo(512, 258);
  ctx.stroke();

  // Perforated hole grid in tile centers
  const quadrants = [[128, 128], [384, 128], [128, 384], [384, 384]];
  for (const [qx, qy] of quadrants) {
    ctx.fillStyle = '#171b22';
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        ctx.beginPath();
        ctx.arc(qx + c * 22, qy + r * 22, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Corner locking screw heads
  const corners = [
    [16, 16], [240, 16], [272, 16], [496, 16],
    [16, 240], [240, 240], [272, 240], [496, 240],
    [16, 272], [240, 272], [272, 272], [496, 272],
    [16, 496], [240, 496], [272, 496], [496, 496]
  ];
  ctx.fillStyle = '#475569';
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 10);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
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
 * Procedural 42U Server Rack Face Texture (256x512).
 * High-contrast server blades, glowing LEDs, LCDs, and patch cables.
 */
function createServerBladeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Gunmetal rack chassis backing (NOT pitch black!)
  ctx.fillStyle = '#1c232e';
  ctx.fillRect(0, 0, 256, 512);

  // Upright rack rails with square mounting holes
  ctx.fillStyle = '#374151';
  ctx.fillRect(0, 0, 16, 512);
  ctx.fillRect(240, 0, 16, 512);
  ctx.fillStyle = '#111827';
  for (let y = 8; y < 512; y += 12) {
    ctx.fillRect(5, y, 6, 6);
    ctx.fillRect(245, y, 6, 6);
  }

  // Draw 20 stacked 1U and 2U server blade bays
  let currentY = 8;
  let bladeIndex = 0;
  while (currentY < 500) {
    const is2U = (bladeIndex % 5 === 2) || (bladeIndex % 7 === 4);
    const bladeH = is2U ? 36 : 20;
    bladeIndex++;

    if (currentY + bladeH > 506) break;

    // Blade chassis faceplate
    ctx.fillStyle = '#283140';
    ctx.fillRect(18, currentY, 220, bladeH - 2);

    // Silver bevel highlight
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 1;
    ctx.strokeRect(18.5, currentY + 0.5, 219, bladeH - 3);

    // Silver pull handles
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(20, currentY + 3, 4, bladeH - 8);
    ctx.fillRect(232, currentY + 3, 4, bladeH - 8);

    // Dark air intake louvers
    ctx.fillStyle = '#0f172a';
    const ventW = 90;
    ctx.fillRect(28, currentY + 3, ventW, bladeH - 8);
    ctx.strokeStyle = '#1e293b';
    for (let vx = 32; vx < 28 + ventW; vx += 5) {
      ctx.beginPath();
      ctx.moveTo(vx, currentY + 4);
      ctx.lineTo(vx, currentY + bladeH - 6);
      ctx.stroke();
    }

    // Patch ports
    const portStartX = 124;
    ctx.fillStyle = '#111827';
    ctx.fillRect(portStartX, currentY + 4, 46, bladeH - 9);

    // Patch cables
    if (bladeIndex % 3 === 0) {
      const cableColors = ['#0284c7', '#f59e0b', '#ef4444', '#10b981'];
      const cCol = cableColors[bladeIndex % cableColors.length];
      ctx.strokeStyle = cCol;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(portStartX + 8, currentY + 7);
      ctx.bezierCurveTo(portStartX + 12, currentY + bladeH + 6, portStartX + 26, currentY + bladeH + 6, portStartX + 30, currentY + 7);
      ctx.stroke();
    }

    // LCD screen on 2U blades
    if (is2U) {
      const lcdX = 176;
      const lcdY = currentY + 5;
      ctx.fillStyle = '#0369a1';
      ctx.fillRect(lcdX, lcdY, 48, 22);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(lcdX, lcdY, 48, 22);

      ctx.fillStyle = '#e0f2fe';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(`18°C 42%`, lcdX + 4, lcdY + 10);
      ctx.fillText(`BLADE-${bladeIndex}`, lcdX + 4, lcdY + 18);
    }

    // High-visibility status LEDs
    const ledXStart = is2U ? 126 : 176;
    const ledY = currentY + (bladeH / 2) - 1.5;
    const ledCols = ['#00ff66', '#00e5ff', '#ffaa00', bladeIndex % 6 === 0 ? '#ff2222' : '#00ff66'];

    for (let li = 0; li < 4; li++) {
      const lx = ledXStart + li * 11;
      const col = ledCols[li];

      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(lx, ledY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Outer glow ring
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(lx, ledY, 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    currentY += bladeH;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
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
  texture.anisotropy = 4;
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
 * Builds the compact, intimate Enterprise Data Center Shooting Range.
 * Rendered in batched draw calls with zero PointLights.
 */
export class WarehouseBuilder {
  constructor(scene) {
    this.scene = scene;
    this.colliderMesh = null;
    this.coverNodes = [];

    // 1. Textures (SRGB + anisotropy 4)
    this.floorTexture = createUnifiedFloorTexture();
    this.wallTexture = createDataCenterWallTexture();
    const ceilingTex = createDataCenterCeilingTextures();
    this.ceilingTexture = ceilingTex.diffuseTexture;
    this.ceilingEmissiveTexture = ceilingTex.emissiveTexture;
    this.serverBladeTexture = createServerBladeTexture();
    this.monitorScreenAtlasTex = createMonitorScreenAtlasTexture();
    this.chairMeshTexture = createChairMeshTexture();
    this.outletTexture = createBrazilianITFaceplateTexture();
    this.stanchionBeltTexture = createStanchionBeltTexture();
    this.coffeeScreenTexture = createCoffeeScreenTexture();
    this.coffeeSideTexture = createCoffeeSideTexture();
    this.coffeeHopperTexture = createCoffeeHopperTexture();
    this.palmFrondTexture = createPalmFrondTexture();

    // 2. High-Readability Industrial Palette (NO pure pitch-black silhouettes!)
    this.floorMaterial = new THREE.MeshStandardMaterial({
      map: this.floorTexture,
      roughness: 0.65,
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

    // Server blade faceplates with glowing LEDs, LCDs, and patch cables (Self-Illuminating!)
    this.serverRackBladeMaterial = new THREE.MeshBasicMaterial({
      map: this.serverBladeTexture,
    });

    // Monitor screen displays sliced from the screen atlas (Self-Illuminating!)
    this.monitorScreenMaterial = new THREE.MeshBasicMaterial({
      map: this.monitorScreenAtlasTex,
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
  }

  build() {
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
      serverChassis: [],
      silverTrim: [],
      deskSurface: [],
      serverRackBlade: [],
      monitorScreen: [],
      warningYellow: [],
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

    // 2. RAISED PLATFORM FLOOR FOR ROW 3 & BACK SERVERS (Z = 7.5 to 13.5, Height = +0.35m)
    // Elevates Row 3 & the back wall server racks. Width is 14.0m so it leaves a clean 78cm aisle
    // to the angled flank servers, completely eliminating corner clipping!
    const platW = 14.0;
    const platL = 6.0;
    const platH = 0.35;
    const platZ = 10.5;
    const platformGeo = new THREE.BoxGeometry(platW, platH, platL);
    addPart(visualBuckets.serverChassis, platformGeo, 0, platH / 2, platZ, 0, 0, 0, true);
    platformGeo.dispose();

    // Platform step hazard trim on front edge
    const frontTrimGeo = new THREE.BoxGeometry(platW, 0.04, 0.08);
    addVisual(visualBuckets.warningYellow, frontTrimGeo, 0, platH, 7.5);
    frontTrimGeo.dispose();

    // Platform step hazard trim on left and right side edges
    const sideTrimGeo = new THREE.BoxGeometry(0.08, 0.04, platL);
    addVisual(visualBuckets.warningYellow, sideTrimGeo, -platW / 2, platH, platZ);
    addVisual(visualBuckets.warningYellow, sideTrimGeo, platW / 2, platH, platZ);
    sideTrimGeo.dispose();

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

    // Zone B: 42U Server Racks
    // Back Wall Server Racks: Full row of 8 massive cabinets across Z = 12.8 facing -Z!
    // Stood directly ON TOP of the raised platform at baseY = platH (0.35m)!
    const backRackX = [-5.6, -4.0, -2.4, -0.8, 0.8, 2.4, 4.0, 5.6];
    for (const rx of backRackX) {
      this._buildServerCabinet(addPart, addVisual, visualBuckets, rx, 12.8, 0, platH); // rotY = 0 faces -Z, on platform!
    }

    // Left Wall Server Racks: 4 cabinets angled at 35° toward player on the lower floor
    const flankZ = [0.5, 3.5, 6.5, 9.5];
    for (const fz of flankZ) {
      this._buildServerCabinet(addPart, addVisual, visualBuckets, -8.5, fz, -0.70, 0.0); // Angled inward
      this._buildServerCabinet(addPart, addVisual, visualBuckets, 8.5, fz, 0.70, 0.0);   // Angled inward
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
      { bucket: visualBuckets.serverChassis, material: this.serverChassisMaterial, name: 'DC_Chassis' },
      { bucket: visualBuckets.silverTrim, material: this.silverTrimMaterial, name: 'DC_SilverTrim' },
      { bucket: visualBuckets.deskSurface, material: this.deskSurfaceMaterial, name: 'DC_DeskSurfaces' },
      { bucket: visualBuckets.serverRackBlade, material: this.serverRackBladeMaterial, name: 'DC_ServerBlades' },
      { bucket: visualBuckets.monitorScreen, material: this.monitorScreenMaterial, name: 'DC_MonitorScreens' },
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

    // 1. Cabinet Chassis (Industrial Gunmetal Slate 0x363d47)
    const chassisGeo = new THREE.BoxGeometry(w, h, d);
    addPart(visualBuckets.serverChassis, chassisGeo, x, centerY, z, 0, rotY, 0, true);
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

    // Place PC Towers (0.30m x 0.65m x 0.54m) on the far outer edges of desks
    const pcW = 0.30;
    const leftPcX = leftDeskX - deskW / 2 + pcW / 2 + 0.08;
    const rightPcX = rightDeskX + deskW / 2 - pcW / 2 - 0.08;
    this._buildPCTower(addPart, addVisual, visualBuckets, leftPcX, surfaceY, z - 0.05);
    this._buildPCTower(addPart, addVisual, visualBuckets, rightPcX, surfaceY, z - 0.05);

    // Keyboard & mousepad mesh generator
    const kbGeo = new THREE.BoxGeometry(0.52, 0.02, 0.18);
    const padGeo = new THREE.BoxGeometry(0.28, 0.005, 0.24);
    const placeKeyboard = (kx) => {
      addVisual(visualBuckets.serverChassis, kbGeo, kx - 0.06, surfaceY + 0.01, z - 0.35);
      addVisual(visualBuckets.serverChassis, padGeo, kx + 0.28, surfaceY + 0.005, z - 0.35);
    };

    // Place Hero Scale Monitors (Collision-Free: 8.5cm dual-screen gap, 26cm PC clearance, ergonomic inward curve)
    if (tierName === 'close') {
      // Row 1: Dual monitors on Left Desk, Centered Ultrawide on Right Desk
      this._buildMonitor(addPart, addVisual, visualBuckets, leftDeskX - 0.50, surfaceY, z, -0.10, false, 0); // Dashboard (angled inward)
      this._buildMonitor(addPart, addVisual, visualBuckets, leftDeskX + 0.50, surfaceY, z, 0.10, false, 1);  // Alert (angled inward)
      this._buildMonitor(addPart, addVisual, visualBuckets, rightDeskX, surfaceY, z, 0, true, 2);             // BSOD Ultrawide centered

      placeKeyboard(leftDeskX - 0.50);
      placeKeyboard(leftDeskX + 0.50);
      placeKeyboard(rightDeskX);

      // Left desk chair (slightly shifted toward primary dashboard monitor, swiveled inward)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, leftDeskX - 0.18, baseY, z - 0.92, 0.38, addPartMatrix);
      // Right desk chair (centered on ultrawide, swiveled left toward aisle)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, rightDeskX + 0.12, baseY, z - 1.00, -0.52, addPartMatrix);
    } else if (tierName === 'mid') {
      // Row 2: Centered Ultrawide on Left Desk, Dual monitors on Right Desk
      this._buildMonitor(addPart, addVisual, visualBuckets, leftDeskX, surfaceY, z, 0, true, 1);              // Alert Ultrawide centered
      this._buildMonitor(addPart, addVisual, visualBuckets, rightDeskX - 0.50, surfaceY, z, -0.10, false, 3); // Matrix (angled inward)
      this._buildMonitor(addPart, addVisual, visualBuckets, rightDeskX + 0.50, surfaceY, z, 0.10, false, 0);  // Dashboard (angled inward)

      placeKeyboard(leftDeskX);
      placeKeyboard(rightDeskX - 0.50);
      placeKeyboard(rightDeskX + 0.50);

      // Left desk chair (pushed back with hurried exit angle)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, leftDeskX + 0.20, baseY, z - 1.04, 0.75, addPartMatrix);
      // Right desk chair (casual slight angle)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, rightDeskX - 0.15, baseY, z - 0.86, -0.22, addPartMatrix);
    } else {
      // Row 3 (Far, on +0.35m platform): High-density NOC Dual-Monitor Monitoring Station
      this._buildMonitor(addPart, addVisual, visualBuckets, leftDeskX - 0.50, surfaceY, z, -0.10, false, 2);  // BSOD (angled inward)
      this._buildMonitor(addPart, addVisual, visualBuckets, leftDeskX + 0.50, surfaceY, z, 0.10, false, 1);   // Alert (angled inward)
      this._buildMonitor(addPart, addVisual, visualBuckets, rightDeskX - 0.50, surfaceY, z, -0.10, false, 0); // Dashboard (angled inward)
      this._buildMonitor(addPart, addVisual, visualBuckets, rightDeskX + 0.50, surfaceY, z, 0.10, false, 3);  // Matrix (angled inward)

      placeKeyboard(leftDeskX - 0.50);
      placeKeyboard(leftDeskX + 0.50);
      placeKeyboard(rightDeskX - 0.50);
      placeKeyboard(rightDeskX + 0.50);

      // Left desk chair (on raised platform baseY = platH, swiveled toward left aisle)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, leftDeskX - 0.10, baseY, z - 0.90, -0.62, addPartMatrix);
      // Right desk chair (on raised platform baseY = platH, pushed back with rapid swivel)
      this._buildOfficeChair(addPart, addVisual, visualBuckets, rightDeskX + 0.25, baseY, z - 1.05, 0.98, addPartMatrix);
    }

    kbGeo.dispose();
    padGeo.dispose();
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
   * Builds a chunky PC Mid/Full Tower (0.30m x 0.65m x 0.54m)
   * Front mesh and glowing power button face -Z directly toward player.
   */
  _buildPCTower(addPart, addVisual, visualBuckets, x, y, z) {
    const w = 0.30;
    const h = 0.65;
    const d = 0.54;

    // Main Tower Chassis (Industrial Gunmetal Slate 0x363d47)
    const chassisGeo = new THREE.BoxGeometry(w, h, d);
    addPart(visualBuckets.serverChassis, chassisGeo, x, y + h / 2, z, 0, 0, 0, true);
    chassisGeo.dispose();

    // Front Mesh Intake Panel (faces -Z player)
    const meshGeo = new THREE.BoxGeometry(w * 0.85, h * 0.60, 0.02);
    addVisual(visualBuckets.serverChassis, meshGeo, x, y + h * 0.35, z - d / 2 - 0.01);
    meshGeo.dispose();

    // Glowing Cyan Power Ring / Accent LED Strip
    const powerRing = new THREE.BoxGeometry(w * 0.65, 0.035, 0.015);
    addVisual(visualBuckets.glowingCyan, powerRing, x, y + h * 0.82, z - d / 2 - 0.012);
    powerRing.dispose();

    // Brushed Silver Side Bevel Trim
    const sideBevel = new THREE.BoxGeometry(0.02, h, 0.02);
    addVisual(visualBuckets.silverTrim, sideBevel, x - w / 2 - 0.01, y + h / 2, z - d / 2);
    addVisual(visualBuckets.silverTrim, sideBevel, x + w / 2 + 0.01, y + h / 2, z - d / 2);
    sideBevel.dispose();
  }

  /**
   * Builds a Monitor (+40% Hero Scale) facing -Z directly toward player.
   * Stand post and base are positioned strictly BEHIND the screen (+Z side).
   */
  _buildMonitor(addPart, addVisual, visualBuckets, x, y, z, rotY = 0, isUltrawide = false, screenType = 0) {
    // Hero Scale: Standard (0.92m x 0.58m), Ultrawide (1.36m x 0.62m)
    const monW = isUltrawide ? 1.36 : 0.92;
    const monH = isUltrawide ? 0.62 : 0.58;
    const monD = 0.05;

    // 1. Stand Post (BEHIND the monitor on +Z side: local z = +0.05)
    const postH = 0.38;
    const postGeo = new THREE.BoxGeometry(0.06, postH, 0.06);
    postGeo.translate(0, postH / 2, monD / 2 + 0.03);
    addPart(visualBuckets.serverChassis, postGeo, x, y, z, 0, rotY, 0, false);
    postGeo.dispose();

    // 2. Stand Base (On desk surface, under post on +Z side: local z = +0.05)
    const baseGeo = new THREE.BoxGeometry(0.32, 0.018, 0.22);
    baseGeo.translate(0, 0.009, monD / 2 + 0.03);
    addPart(visualBuckets.serverChassis, baseGeo, x, y, z, 0, rotY, 0, false);
    baseGeo.dispose();

    // 3. Monitor Bezel Frame (Centered at y + 0.34)
    const centerY = y + 0.34;
    const bezelGeo = new THREE.BoxGeometry(monW, monH, monD);
    addPart(visualBuckets.serverChassis, bezelGeo, x, centerY, z, 0, rotY, 0, true);
    bezelGeo.dispose();

    // 4. Brushed Silver Frame Bevel
    const trimGeo = new THREE.BoxGeometry(monW + 0.02, 0.015, 0.015);
    trimGeo.translate(0, -monH / 2, -monD / 2);
    addVisual(visualBuckets.silverTrim, trimGeo, x, centerY, z, 0, rotY, 0);
    trimGeo.dispose();

    // 5. Glowing Front Screen Plane (Positioned in FRONT on -Z side: local z = -monD/2 - 0.004)
    // Uses createPlaneFacingPlayer so normal points toward -Z and UVs are unmirrored!
    const screenW = monW - 0.04;
    const screenH = monH - 0.04;

    let uMin = 0.0, uMax = 0.5, vMin = 0.5, vMax = 1.0;
    if (screenType === 1) {
      uMin = 0.5; uMax = 1.0; vMin = 0.5; vMax = 1.0; // Critical Alert
    } else if (screenType === 2) {
      uMin = 0.0; uMax = 0.5; vMin = 0.0; vMax = 0.5; // Classic BSOD
    } else if (screenType === 3) {
      uMin = 0.5; uMax = 1.0; vMin = 0.0; vMax = 0.5; // Matrix Telemetry
    }

    const screenGeo = createPlaneFacingPlayer(screenW, screenH, uMin, vMin, uMax, vMax);
    screenGeo.translate(0, 0, -monD / 2 - 0.004);
    addVisual(visualBuckets.monitorScreen, screenGeo, x, centerY, z, 0, rotY, 0);
    screenGeo.dispose();
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
}

