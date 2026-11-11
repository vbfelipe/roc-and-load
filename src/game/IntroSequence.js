import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const INTRO_STATES = Object.freeze({
  UNARMED_INTRO: 'UNARMED_INTRO',
  PHONE_RINGING: 'PHONE_RINGING',
  PHONE_ANSWERED: 'PHONE_ANSWERED',
});

export const VESTIBULE_SPAWN = Object.freeze({
  x: -12.45,
  y: 0.0,
  z: 10.30,
  yaw: -Math.PI / 2,
  pitch: 0.0,
});

// Threshold X coordinate stepping out of the glass partition doorway into the main office room
const MAIN_ROOM_THRESHOLD_X = -9.8;
const PHONE_INTERACT_RADIUS = 1.22;
const TUTORIAL_DELAY_SECONDS = 2.0;
const TUTORIAL_MAX_DURATION_SECONDS = 12.0;

/**
 * Coordinates the opening gameplay state sequence:
 *  UNARMED_INTRO -> PHONE_RINGING -> PHONE_ANSWERED
 */
export class IntroSequence {
  constructor({ scene, camera, player, weaponSystem, hud, sound, input, warehouse }) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.weaponSystem = weaponSystem;
    this.hud = hud;
    this.sound = sound;
    this.input = input;
    this.warehouse = warehouse;

    this.state = INTRO_STATES.UNARMED_INTRO;
    this.hasStarted = false;
    this.tutorialShown = false;
    this.tutorialDismissed = false;
    this.tutorialTimer = 0;
    this.tutorialVisibleTimer = 0;

    // Pre-allocated scratch vectors for zero per-frame GC allocations
    this._phoneWorldPos = new THREE.Vector3(1.46, 0.95, -2.82);
    this._toPhone = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._arrowBaseY = this._phoneWorldPos.y + 0.48;

    this._phoneRef = null;
    this.arrowMesh = null;

    this._resolvePhoneReference();
    this._buildFloatingArrow();
  }

  _resolvePhoneReference() {
    let phone = this.warehouse && this.warehouse.telestreamPhone
      ? this.warehouse.telestreamPhone
      : null;

    if (!phone && this.scene) {
      phone = this.scene.getObjectByName('telestream_gxp2170') || null;
    }

    this._phoneRef = phone;
    if (this._phoneRef) {
      this._phoneRef.updateWorldMatrix(true, false);
      this._phoneRef.getWorldPosition(this._phoneWorldPos);
      this._arrowBaseY = this._phoneWorldPos.y + 0.68;
    }
  }

  _buildFloatingArrow() {
    // 1. Sleek Beveled Double-Chevron Objective Marker (HDR bright for bloom pop across the office)
    const mainChevron = new THREE.Shape();
    mainChevron.moveTo(0.0, -0.22);
    mainChevron.lineTo(0.165, 0.035);
    mainChevron.lineTo(0.115, 0.035);
    mainChevron.lineTo(0.0, -0.105);
    mainChevron.lineTo(-0.115, 0.035);
    mainChevron.lineTo(-0.165, 0.035);
    mainChevron.closePath();

    const upperChevron = new THREE.Shape();
    upperChevron.moveTo(0.0, -0.025);
    upperChevron.lineTo(0.115, 0.155);
    upperChevron.lineTo(0.072, 0.155);
    upperChevron.lineTo(0.0, 0.055);
    upperChevron.lineTo(-0.072, 0.155);
    upperChevron.lineTo(-0.115, 0.155);
    upperChevron.closePath();

    const extrudeOpts = {
      depth: 0.022,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.007,
      bevelSegments: 2,
      curveSegments: 4,
    };

    const mainGeo = new THREE.ExtrudeGeometry(mainChevron, extrudeOpts);
    mainGeo.translate(0, 0, -0.011);
    const upperGeo = new THREE.ExtrudeGeometry(upperChevron, extrudeOpts);
    upperGeo.translate(0, 0, -0.011);

    const chevronMerged = mergeGeometries([mainGeo, upperGeo], false);
    mainGeo.dispose();
    upperGeo.dispose();

    this._arrowCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffe14d).multiplyScalar(1.95),
      toneMapped: false,
      transparent: true,
      opacity: 0.96,
    });

    this.arrowMesh = new THREE.Mesh(chevronMerged, this._arrowCoreMat);
    this.arrowMesh.name = 'TelestreamObjectiveArrow';
    this.arrowMesh.castShadow = false;
    this.arrowMesh.receiveShadow = false;
    this.arrowMesh.position.set(this._phoneWorldPos.x, this._arrowBaseY, this._phoneWorldPos.z);
    this.arrowMesh.visible = false;

    if (this.scene) {
      this.scene.add(this.arrowMesh);
    }
  }

  /**
   * Positions Roc inside the elevator vestibule facing the open double doors
   * and sets up unarmed state.
   */
  spawnInVestibule(useReset = false) {
    if (!this.player) return;
    if (useReset && typeof this.player.reset === 'function') {
      this.player.reset(
        VESTIBULE_SPAWN.x,
        VESTIBULE_SPAWN.y,
        VESTIBULE_SPAWN.z,
        VESTIBULE_SPAWN.yaw,
        VESTIBULE_SPAWN.pitch
      );
    } else {
      this.player.teleport(VESTIBULE_SPAWN.x, VESTIBULE_SPAWN.y, VESTIBULE_SPAWN.z);
      this.player.yaw = VESTIBULE_SPAWN.yaw;
      this.player.pitch = VESTIBULE_SPAWN.pitch;
      if (typeof this.player._updateCameraTransform === 'function') {
        this.player._updateCameraTransform();
      }
    }
  }

  onGameStartPressed() {
    if (this.hasStarted) return;
    this.hasStarted = true;
    this.state = INTRO_STATES.UNARMED_INTRO;
    this.tutorialTimer = 0;
    this.tutorialVisibleTimer = 0;
    this.tutorialShown = false;
    this.tutorialDismissed = false;

    this.spawnInVestibule(false);
    if (this.weaponSystem && typeof this.weaponSystem.setUnarmed === 'function') {
      this.weaponSystem.setUnarmed(true);
    }
    if (this.hud) {
      this.hud.setTutorialVisible(false);
      this.hud.setObjectiveVisible(false);
      this.hud.setInteractVisible(false);
    }
  }

  onGameStateChanged(nextState) {
    if (!this.sound) return;
    if (this.state === INTRO_STATES.PHONE_RINGING) {
      this.sound.setPhoneRingtonePaused(nextState !== 'PLAYING');
    }
  }

  _enterPhoneRinging() {
    if (this.state !== INTRO_STATES.UNARMED_INTRO) return;
    this.state = INTRO_STATES.PHONE_RINGING;

    this._resolvePhoneReference();
    if (this.arrowMesh) {
      this.arrowMesh.position.set(this._phoneWorldPos.x, this._arrowBaseY, this._phoneWorldPos.z);
      this.arrowMesh.visible = true;
    }
    if (this.hud) {
      this.hud.setObjectiveText('Atenda o telefone para continuar');
      this.hud.setObjectiveVisible(true);
    }
    if (this.sound && typeof this.sound.startPhoneRingtone === 'function') {
      this.sound.resume();
      this.sound.startPhoneRingtone();
    }
  }

  answerPhone() {
    if (this.state !== INTRO_STATES.PHONE_RINGING) return;
    this.state = INTRO_STATES.PHONE_ANSWERED;

    if (this.sound) {
      this.sound.stopPhoneRingtone();
      this.sound.playPhonePickupClick();
    }

    if (this.arrowMesh) {
      this.arrowMesh.visible = false;
    }

    if (this.hud) {
      this.hud.setInteractVisible(false);
      this.hud.setTutorialVisible(false);
      this.hud.setObjectiveVisible(false);
    }

    this._setPhoneAnsweredVisuals();
  }

  _setPhoneAnsweredVisuals() {
    if (!this._phoneRef) return;
    if (this._phoneRef.mwiLedMesh && this._phoneRef.mwiLedMesh.material) {
      this._phoneRef.mwiLedMesh.material.color.setHex(0x22c55e);
    }
    if (this._phoneRef.screenMaterial) {
      this._phoneRef.screenMaterial.color.setHex(0xffffff);
    }
  }

  _updateRingingVisualsAndAudio(timeSec) {
    // 1. Animate sculpted HDR double-chevron arrow
    if (this.arrowMesh && this.arrowMesh.visible) {
      this.arrowMesh.position.y = this._arrowBaseY + Math.sin(timeSec * 3.8) * 0.065;
      if (this.camera) {
        const dx = this.camera.position.x - this._phoneWorldPos.x;
        const dz = this.camera.position.z - this._phoneWorldPos.z;
        this.arrowMesh.rotation.y = Math.atan2(dx, dz) + Math.sin(timeSec * 2.1) * 0.22;
      } else {
        this.arrowMesh.rotation.y = timeSec * 1.4;
      }

      const pulse = 0.5 + 0.5 * Math.sin(timeSec * 6.0);
      if (this._arrowCoreMat) {
        this._arrowCoreMat.opacity = 0.68 + 0.32 * pulse;
      }
    }

    // 2. Sync Telestream GXP2170 MWI red LED & subtle LCD highlight with ring cadence
    const isRingBurst = this.sound && typeof this.sound.isPhoneRingBurstActive === 'function'
      ? this.sound.isPhoneRingBurstActive()
      : (Math.sin(timeSec * 8.0) > 0);

    if (this._phoneRef) {
      if (this._phoneRef.mwiLedMesh && this._phoneRef.mwiLedMesh.material) {
        this._phoneRef.mwiLedMesh.material.color.setHex(isRingBurst ? 0xff2a2a : 0x450a0a);
      }
      if (this._phoneRef.screenMaterial) {
        this._phoneRef.screenMaterial.color.setHex(isRingBurst ? 0xffffff : 0xcbd5e1);
      }
    }

    // 3. Distance-attenuated, lowpass-filtered, stereo-panned ringtone (zero allocations)
    if (this.camera) {
      this._toPhone.subVectors(this._phoneWorldPos, this.camera.position);
      const distance = this._toPhone.length();

      let pan = 0;
      if (distance > 0.001) {
        this._toPhone.multiplyScalar(1.0 / distance);
        this._camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        pan = this._camRight.x * this._toPhone.x + this._camRight.z * this._toPhone.z;
      }

      if (this.sound && typeof this.sound.updatePhoneRingtoneSpatial === 'function') {
        this.sound.updatePhoneRingtoneSpatial(distance, pan);
      }

      // 4. Proximity [F] INTERAGIR prompt (horizontal XZ distance <= 2.5m) & F key pickup
      const posRef = this.player ? this.player.position : this.camera.position;
      const horizDist = Math.hypot(this._phoneWorldPos.x - posRef.x, this._phoneWorldPos.z - posRef.z);
      const inRange = horizDist <= PHONE_INTERACT_RADIUS;
      if (this.hud) {
        this.hud.setInteractVisible(inRange);
      }

      if (
        inRange &&
        this.input &&
        this.input.isLocked &&
        document.pointerLockElement !== null &&
        (this.input.consumeKeyJustPressed('KeyF') || this.input.consumeKeyJustPressed('f'))
      ) {
        this.answerPhone();
      }
    }
  }

  update(delta, gameState) {
    if (!this.hasStarted || gameState !== 'PLAYING') return;

    // 2-second delayed tutorial controls HUD, auto-hidden after at most 6 seconds on screen
    if (!this.tutorialDismissed && this.state !== INTRO_STATES.PHONE_ANSWERED) {
      if (!this.tutorialShown) {
        this.tutorialTimer += delta;
        if (this.tutorialTimer >= TUTORIAL_DELAY_SECONDS) {
          this.tutorialShown = true;
          this.tutorialVisibleTimer = 0;
          if (this.hud) {
            this.hud.setTutorialVisible(true);
          }
        }
      } else {
        this.tutorialVisibleTimer += delta;
        if (this.tutorialVisibleTimer >= TUTORIAL_MAX_DURATION_SECONDS) {
          this.tutorialDismissed = true;
          if (this.hud) {
            this.hud.setTutorialVisible(false);
          }
        }
      }
    }

    // Trigger ringing sequence when Roc steps out of the vestibule into the main office room
    if (this.state === INTRO_STATES.UNARMED_INTRO) {
      const liveX = this.player ? this.player.position.x : (this.camera ? this.camera.position.x : -999);
      if (liveX > MAIN_ROOM_THRESHOLD_X) {
        this._enterPhoneRinging();
      }
    }

    if (this.state === INTRO_STATES.PHONE_RINGING) {
      this._updateRingingVisualsAndAudio(performance.now() * 0.001);
    }
  }

  reset() {
    this.state = INTRO_STATES.UNARMED_INTRO;
    this.hasStarted = false;
    this.tutorialShown = false;
    this.tutorialDismissed = false;
    this.tutorialTimer = 0;
    this.tutorialVisibleTimer = 0;

    if (this.sound) {
      this.sound.stopPhoneRingtone();
    }
    if (this.arrowMesh) {
      this.arrowMesh.visible = false;
    }

    if (this._phoneRef) {
      if (this._phoneRef.mwiLedMesh && this._phoneRef.mwiLedMesh.material) {
        this._phoneRef.mwiLedMesh.material.color.setHex(0xef4444);
      }
      if (this._phoneRef.screenMaterial) {
        this._phoneRef.screenMaterial.color.setHex(0xffffff);
      }
    }

    if (this.hud) {
      this.hud.setTutorialVisible(false);
      this.hud.setObjectiveVisible(false);
      this.hud.setInteractVisible(false);
    }

    if (this.weaponSystem && typeof this.weaponSystem.setUnarmed === 'function') {
      this.weaponSystem.setUnarmed(true);
    }
    this.spawnInVestibule(true);
  }
}
