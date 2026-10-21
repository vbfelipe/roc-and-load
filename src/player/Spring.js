import * as THREE from 'three';

/**
 * 1-Dimensional Damped Harmonic Oscillator.
 * Zero-allocation, rock-solid stability with sub-stepped Euler integration.
 */
export class Spring1D {
  constructor({ stiffness = 160, damping = 18, mass = 1.0, initial = 0 } = {}) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;

    this.position = initial;
    this.target = initial;
    this.velocity = 0;
  }

  setTarget(target) {
    this.target = target;
  }

  impulse(force) {
    this.velocity += force / this.mass;
  }

  reset(val = 0, vel = 0) {
    this.position = val;
    this.target = val;
    this.velocity = vel;
  }

  update(dt) {
    // Clamp dt to avoid explosion on long frames
    const clampedDt = Math.min(dt, 0.1);
    const stepSize = 0.005;
    let remaining = clampedDt;

    while (remaining > 0) {
      const step = Math.min(remaining, stepSize);
      const displacement = this.position - this.target;
      const springForce = -this.stiffness * displacement;
      const dampingForce = -this.damping * this.velocity;
      const accel = (springForce + dampingForce) / this.mass;

      this.velocity += accel * step;
      this.position += this.velocity * step;
      remaining -= step;
    }

    return this.position;
  }
}

/**
 * 3-Dimensional Damped Harmonic Oscillator.
 * Operates in-place on THREE.Vector3 instances without GC pressure.
 */
export class Spring3D {
  constructor({ stiffness = 160, damping = 18, mass = 1.0, initial = null } = {}) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;

    this.position = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    if (initial) {
      this.position.copy(initial);
      this.target.copy(initial);
    }
  }

  setTarget(x, y, z) {
    if (typeof x === 'object' && x !== null) {
      this.target.copy(x);
    } else {
      this.target.set(x, y, z);
    }
  }

  impulse(x, y, z) {
    if (typeof x === 'object' && x !== null) {
      this.velocity.x += x.x / this.mass;
      this.velocity.y += x.y / this.mass;
      this.velocity.z += x.z / this.mass;
    } else {
      this.velocity.x += x / this.mass;
      this.velocity.y += y / this.mass;
      this.velocity.z += z / this.mass;
    }
  }

  reset(x = 0, y = 0, z = 0) {
    if (typeof x === 'object' && x !== null) {
      this.position.copy(x);
      this.target.copy(x);
    } else {
      this.position.set(x, y, z);
      this.target.set(x, y, z);
    }
    this.velocity.set(0, 0, 0);
  }

  update(dt) {
    const clampedDt = Math.min(dt, 0.1);
    const stepSize = 0.005;
    let remaining = clampedDt;

    while (remaining > 0) {
      const step = Math.min(remaining, stepSize);

      // X Axis
      const dispX = this.position.x - this.target.x;
      const sForceX = -this.stiffness * dispX;
      const dForceX = -this.damping * this.velocity.x;
      const accelX = (sForceX + dForceX) / this.mass;
      this.velocity.x += accelX * step;
      this.position.x += this.velocity.x * step;

      // Y Axis
      const dispY = this.position.y - this.target.y;
      const sForceY = -this.stiffness * dispY;
      const dForceY = -this.damping * this.velocity.y;
      const accelY = (sForceY + dForceY) / this.mass;
      this.velocity.y += accelY * step;
      this.position.y += this.velocity.y * step;

      // Z Axis
      const dispZ = this.position.z - this.target.z;
      const sForceZ = -this.stiffness * dispZ;
      const dForceZ = -this.damping * this.velocity.z;
      const accelZ = (sForceZ + dForceZ) / this.mass;
      this.velocity.z += accelZ * step;
      this.position.z += this.velocity.z * step;

      remaining -= step;
    }

    return this.position;
  }
}
