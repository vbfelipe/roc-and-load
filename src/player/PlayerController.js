import * as THREE from 'three';
import { ExtendedTriangle } from 'three-mesh-bvh';
import { Spring1D } from './Spring.js';

// Pre-allocated scratch variables to guarantee ZERO GC allocations during physics ticks
const _tempVec1 = new THREE.Vector3();
const _tempVec2 = new THREE.Vector3();
const _tempTriNormal = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pushDirection = new THREE.Vector3();
const _capsuleSegment = new THREE.Line3();
const _capsuleBox = new THREE.Box3();
const _tempTri = new ExtendedTriangle();

// FPS player capsule movement and collision resolution
export class PlayerController {
  constructor(camera, inputManager) {
    this.camera = camera;
    this.input = inputManager;

    this.radius = 0.35;
    this.height = 1.80;
    this.eyeHeight = 1.65;

    this.position = new THREE.Vector3(0, 0, -10);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.isGrounded = false;
    this.wasGrounded = false;
    this.jumpTimer = 0;

    this.walkSpeed = 6.2;
    this.sprintSpeed = 9.8;
    this.jumpForce = 7.5;
    this.gravity = -22.0;

    this.pitch = 0;
    this.yaw = Math.PI;
    this.sensitivity = 0.0022;
    this.recoilPitch = 0;

    this.bobCycle = 0;
    this.bobOffset = new THREE.Vector3(0, 0, 0);
    this.landingSpring = new Spring1D({ stiffness: 220, damping: 22, mass: 1.0 });

    this.colliderMesh = null;
    this.gameState = 'MENU';

    // Initial camera placement
    this._updateCameraTransform();
  }

  setGameState(state) {
    this.gameState = state;
    if (state !== 'PLAYING') {
      this.velocity.set(0, 0, 0);
    }
  }

  setCollider(colliderMesh) {
    this.colliderMesh = colliderMesh;
  }

  teleport(x, y, z) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this._updateCameraTransform();
  }

  reset(x = 0, y = 0.1, z = -7.0, yaw = Math.PI, pitch = 0) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.pitch = pitch;
    this.yaw = yaw;
    this.recoilPitch = 0;
    this.bobCycle = 0;
    this.bobOffset.set(0, 0, 0);
    this.landingSpring.reset(0, 0);
    this.isGrounded = false;
    this.wasGrounded = false;
    this.jumpTimer = 0;
    this._updateCameraTransform();
  }

  /**
   * Updates camera orientation based on accumulated raw mouse deltas.
   */
  updateLook() {
    if (this.gameState !== 'PLAYING' || !this.input.isLocked || document.pointerLockElement === null) {
      this.input.consumeMouseDelta();
      return null;
    }

    const delta = this.input.consumeMouseDelta();
    if (delta.x !== 0 || delta.y !== 0) {
      this.yaw -= delta.x * this.sensitivity;
      this.pitch -= delta.y * this.sensitivity;

      // Clamp vertical pitch to prevent gimbal flipping (-89° to +89°)
      const maxPitch = (89 * Math.PI) / 180;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    }
    return delta;
  }

  /**
   * Fixed physics tick with BVH shapecast collision resolution.
   * Called STEPS_PER_FRAME times per render frame.
   */
  fixedUpdate(subDelta) {
    if (this.gameState !== 'PLAYING' || !this.input.isLocked || document.pointerLockElement === null) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }

    if (!this.colliderMesh || !this.colliderMesh.geometry.boundsTree) {
      return;
    }

    // 1. Gather directional input relative to yaw
    _moveDir.set(0, 0, 0);
    const forwardKey = this.input.isKeyDown('KeyW') || this.input.isKeyDown('ArrowUp');
    const backwardKey = this.input.isKeyDown('KeyS') || this.input.isKeyDown('ArrowDown');
    const leftKey = this.input.isKeyDown('KeyA') || this.input.isKeyDown('ArrowLeft');
    const rightKey = this.input.isKeyDown('KeyD') || this.input.isKeyDown('ArrowRight');
    const sprintKey = this.input.isKeyDown('ShiftLeft') || this.input.isKeyDown('ShiftRight');
    const jumpKey = this.input.isKeyDown('Space');

    if (forwardKey) _moveDir.z += 1;
    if (backwardKey) _moveDir.z -= 1;
    if (leftKey) _moveDir.x -= 1;
    if (rightKey) _moveDir.x += 1;

    // Normalize horizontal move direction
    if (_moveDir.lengthSq() > 0) {
      _moveDir.normalize();
    }

    // Transform move direction by player yaw
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // Advance jump buffer timer
    if (this.jumpTimer > 0) {
      this.jumpTimer -= subDelta;
    }

    const targetSpeed = sprintKey ? this.sprintSpeed : this.walkSpeed;
    const targetVelX = (_right.x * _moveDir.x + _forward.x * _moveDir.z) * targetSpeed;
    const targetVelZ = (_right.z * _moveDir.x + _forward.z * _moveDir.z) * targetSpeed;

    // 2. Apply movement acceleration & momentum (properly bounded, smooth interpolation)
    if (this.isGrounded) {
      // Ground movement: crisp response when pressing keys, smooth fast brake when releasing
      const rate = _moveDir.lengthSq() > 0 ? 14.0 : 18.0;
      const lerp = Math.min(rate * subDelta, 1.0);
      this.velocity.x += (targetVelX - this.velocity.x) * lerp;
      this.velocity.z += (targetVelZ - this.velocity.z) * lerp;

      // Jump
      if (jumpKey && this.jumpTimer <= 0) {
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
        this.jumpTimer = 0.15; // 150ms buffer before re-grounding
        this.landingSpring.impulse(0.3);
      }
    } else {
      // In-air movement: PRESERVE FORWARD MOMENTUM without accelerating out of control!
      if (_moveDir.lengthSq() > 0) {
        const airRate = 3.0;
        const lerp = Math.min(airRate * subDelta, 1.0);
        this.velocity.x += (targetVelX - this.velocity.x) * lerp;
        this.velocity.z += (targetVelZ - this.velocity.z) * lerp;
      }

      // Hard clamp horizontal air speed so jumping NEVER rockets or teleports forward!
      const currentHorizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      const maxAllowedSpeed = Math.max(targetSpeed, this.walkSpeed);
      if (currentHorizSpeed > maxAllowedSpeed) {
        const scale = maxAllowedSpeed / currentHorizSpeed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    }

    // Apply Gravity
    this.velocity.y += this.gravity * subDelta;

    // 3. Integrate position
    this.position.x += this.velocity.x * subDelta;
    this.position.y += this.velocity.y * subDelta;
    this.position.z += this.velocity.z * subDelta;

    // 4. Resolve Capsule Collisions against BVH
    this._resolveCapsuleCollisions();

    // 5. Detect landing impact (subtle, clean bump without dragging downward)
    if (!this.wasGrounded && this.isGrounded) {
      const impactVelocity = Math.abs(this.velocity.y);
      this.landingSpring.impulse(-Math.min(impactVelocity * 0.05, 0.25));
    }
    this.wasGrounded = this.isGrounded;
  }

  /**
   * Shapecast capsule collision using three-mesh-bvh.
   */
  _resolveCapsuleCollisions() {
    const boundsTree = this.colliderMesh.geometry.boundsTree;

    // Define capsule line segment
    const capBottom = this.position.y + this.radius;
    const capTop = this.position.y + this.height - this.radius;
    _capsuleSegment.start.set(this.position.x, capBottom, this.position.z);
    _capsuleSegment.end.set(this.position.x, capTop, this.position.z);

    // Bounding box enclosing the capsule for initial BVH broadphase
    _capsuleBox.set(
      _tempVec1.set(
        this.position.x - this.radius,
        this.position.y,
        this.position.z - this.radius
      ),
      _tempVec2.set(
        this.position.x + this.radius,
        this.position.y + this.height,
        this.position.z + this.radius
      )
    );

    let groundedThisFrame = false;

    // Shapecast against BVH
    boundsTree.shapecast({
      intersectsBounds: (box) => box.intersectsBox(_capsuleBox),
      intersectsTriangle: (tri) => {
        // Find closest point on triangle to capsule segment
        const triPoint = _tempVec1;
        const capPoint = _tempVec2;
        const dist = tri.closestPointToSegment(_capsuleSegment, triPoint, capPoint);

        if (dist < this.radius) {
          const depth = this.radius - dist;
          _pushDirection.subVectors(capPoint, triPoint);

          tri.getNormal(_tempTriNormal);

          if (_pushDirection.lengthSq() < 1e-6) {
            _pushDirection.copy(_tempTriNormal);
          } else {
            _pushDirection.normalize();
            // If pushing backwards into triangle backface, align with normal
            if (_pushDirection.dot(_tempTriNormal) < 0) {
              _pushDirection.copy(_tempTriNormal);
            }
          }

          // Displace capsule segment out of geometry
          _capsuleSegment.start.addScaledVector(_pushDirection, depth);
          _capsuleSegment.end.addScaledVector(_pushDirection, depth);

          // Update player position based on resolved bottom point
          this.position.x = _capsuleSegment.start.x;
          this.position.y = _capsuleSegment.start.y - this.radius;
          this.position.z = _capsuleSegment.start.z;

          // If push normal has strong upward component, we are on ground (respecting jumpTimer)
          if (_pushDirection.y > 0.55 && this.jumpTimer <= 0) {
            groundedThisFrame = true;
          }

          // Cancel velocity component pointing into the collider
          const velDot = this.velocity.dot(_pushDirection);
          if (velDot < 0) {
            this.velocity.addScaledVector(_pushDirection, -velDot);
          }

          // Expand bounding box for subsequent triangle tests
          _capsuleBox.min.x = Math.min(_capsuleBox.min.x, this.position.x - this.radius);
          _capsuleBox.min.y = Math.min(_capsuleBox.min.y, this.position.y);
          _capsuleBox.min.z = Math.min(_capsuleBox.min.z, this.position.z - this.radius);
          _capsuleBox.max.x = Math.max(_capsuleBox.max.x, this.position.x + this.radius);
          _capsuleBox.max.y = Math.max(_capsuleBox.max.y, this.position.y + this.height);
          _capsuleBox.max.z = Math.max(_capsuleBox.max.z, this.position.z + this.radius);
        }
      }
    });

    this.isGrounded = groundedThisFrame;
  }

  /**
   * Smooth, subtle modern FPS camera motion and landing recovery.
   */
  updateBobAndCamera(frameDelta) {
    // 1. Advance subtle head bob cycle when moving on ground
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.isGrounded && horizSpeed > 0.5) {
      const bobFreq = horizSpeed > 7.0 ? 11.0 : 8.5;
      this.bobCycle += bobFreq * frameDelta;

      // Extremely subtle, clean step bob (stable reticle, zero nausea)
      const bobY = Math.sin(this.bobCycle * 2) * 0.007;
      const bobX = Math.cos(this.bobCycle) * 0.004;
      this.bobOffset.set(bobX, bobY, 0);
    } else {
      // Smoothly return bob to neutral
      this.bobOffset.multiplyScalar(0.85);
    }

    // 2. Smoothly settle camera recoil kick back down over ~0.35s
    if (Math.abs(this.recoilPitch) > 0.0001) {
      this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 8.5, frameDelta);
    } else {
      this.recoilPitch = 0;
    }

    // 3. Update landing spring
    const landingY = this.landingSpring.update(frameDelta);

    // 4. Final camera transform
    this._updateCameraTransform(landingY, 0);
  }

  /**
   * Applies subtle upward camera pitch recoil kick on gun fire.
   * Settles smoothly back down over ~0.35s.
   */
  applyCameraRecoil(pitchDelta = 0.035) {
    this.recoilPitch += pitchDelta;
  }

  _updateCameraTransform(landingY = 0, cameraRoll = 0) {
    // Eye position in world
    this.camera.position.x = this.position.x + this.bobOffset.x;
    this.camera.position.y = this.position.y + this.eyeHeight + this.bobOffset.y + landingY;
    this.camera.position.z = this.position.z + this.bobOffset.z;

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch;
    this.camera.rotation.z = cameraRoll;
  }
}
