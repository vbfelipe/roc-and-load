import * as THREE from 'three';

/**
 * NightOfficeEnvironment
 *
 * Baked once into a PMREM at startup (zero per-frame cost) and used as scene.environment for the WORLD.
 *
 * Why this exists:
 * RoomEnvironment (the old world IBL) is a photo-studio with 6 small, very hot area-light boxes
 * (emissive 17..100). Every glossy surface (polished black marble, chrome, stainless) mirrored those
 * boxes as random round blobs that matched NO real fixture in the level.
 *
 * This environment is a single, perfectly smooth radiance gradient (vertex colours on a sphere):
 * - Upper hemisphere: dim cool-white "lit troffer ceiling" glow (strongest at zenith).
 * - Horizon: cool slate walls, with a soft blue city-light lobe towards +Z (panoramic window).
 * - Lower hemisphere: dark charcoal floor bounce.
 * No hard edges and no small hot spots -> glossy reflections are soft sheens, never phantom blobs.
 *
 * Brightness is deliberately ~45% of RoomEnvironment's average radiance: dim night office, NOT a blackout.
 */
export class NightOfficeEnvironment extends THREE.Scene {
  constructor() {
    super();
    this.name = 'NightOfficeEnvironment';

    // Linear-space radiance keys
    const zenith = new THREE.Color().setRGB(0.50, 0.56, 0.66);   // lit ceiling troffers (cool 6000K)
    const upper = new THREE.Color().setRGB(0.30, 0.34, 0.41);    // ceiling between fixtures
    const horizon = new THREE.Color().setRGB(0.16, 0.185, 0.23); // cool slate walls
    const floor = new THREE.Color().setRGB(0.050, 0.056, 0.068); // charcoal floor bounce
    const cityGlow = new THREE.Color().setRGB(0.10, 0.15, 0.24); // added blue lobe toward +Z window

    const geo = new THREE.SphereGeometry(10, 64, 32);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const dir = new THREE.Vector3();
    const c = new THREE.Color();

    const smooth = (e0, e1, x) => {
      const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };

    for (let i = 0; i < pos.count; i++) {
      dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const y = dir.y;

      if (y >= 0) {
        // horizon -> upper -> zenith
        c.copy(horizon).lerp(upper, smooth(0.0, 0.55, y));
        c.lerp(zenith, smooth(0.55, 1.0, y));
      } else {
        // horizon -> floor
        c.copy(horizon).lerp(floor, smooth(0.0, -0.45, y));
      }

      // Soft broad city-light lobe through the panoramic window (+Z), concentrated near the horizon
      const toWindow = Math.max(0, dir.z);
      const nearHorizon = 1.0 - smooth(0.0, 0.6, Math.abs(y - 0.08));
      const lobe = toWindow * toWindow * nearHorizon;
      c.r += cityGlow.r * lobe;
      c.g += cityGlow.g * lobe;
      c.b += cityGlow.b * lobe;

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      toneMapped: false,
      fog: false,
    });
    this.add(new THREE.Mesh(geo, mat));
  }

  dispose() {
    this.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });
  }
}
