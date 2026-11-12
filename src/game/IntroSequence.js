import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const INTRO_STATES = Object.freeze({
  ELEVATOR_ARRIVING: 'ELEVATOR_ARRIVING',
  UNARMED_INTRO: 'UNARMED_INTRO',
  PHONE_RINGING: 'PHONE_RINGING',
  PHONE_ANSWERED: 'PHONE_ANSWERED',
  CALL_ENDED: 'CALL_ENDED',
});

export const PHONE_DIALOGUE_SCRIPT = Object.freeze([
  { speaker: 'jorio', text: 'Alô?! Quem tá aí?! ...Roc? Tentei te ligar no celular, mas o sinal morreu na cidade inteira!' },
  { speaker: 'roc', text: 'Jório?! Que inferno você quer às três da manhã de uma sexta-feira, cara? Só voltei pra buscar minhas chaves de casa e já tô saindo.' },
  { speaker: 'jorio', text: 'Não sai! Tranca a porta! Tem uma parada muito estranha acontecendo na cidade, cara... Tá um caos lá fora, tem uns malucos mordendo gente no meio da rua!' },
  { speaker: 'roc', text: 'Ah, pronto. Já começou a madrugada bebendo, né? Não vem inventar apocalipse pra faltar na segunda-feira.' },
  { speaker: 'jorio', text: 'Eu tô falando sério! O vigia da portaria nem responde no interfone... Pelo menos pega alguma coisa pra se defender antes de descer!' },
  { speaker: 'roc', text: 'Vai dormir, Jório. Se você atrasar meu relatório na segunda-feira, quem vai te morder sou eu.' },
]);

export const ELEVATOR_SPAWN = Object.freeze({
  x: -12.45,
  y: 0.0,
  z: 12.93,
  yaw: 0.0,
  pitch: 0.0,
});

export const VESTIBULE_SPAWN = ELEVATOR_SPAWN;

// Elevator arrival timing
const ELEVATOR_CHIME_DELAY_SECONDS = 0.65;
const ELEVATOR_DOOR_SLIDE_START_SECONDS = 1.10;
const ELEVATOR_DOOR_SLIDE_DURATION_SECONDS = 1.50;
const TUTORIAL_REVEAL_TIME_SECONDS = 2.45;

// Threshold X coordinate stepping out of the glass partition doorway into the main office room
const MAIN_ROOM_THRESHOLD_X = -9.8;
const PHONE_RING_DELAY_AFTER_ENTRY_SECONDS = 6.0;
const PHONE_INTERACT_RADIUS = 1.22;
const TUTORIAL_MAX_DURATION_SECONDS = 12.0;
const TYPEWRITER_CHARS_PER_SEC = 38.0;
const TYPEWRITER_PUNCT_PAUSE = 0.18;
const CALL_PICKUP_DELAY_SECONDS = 0.30;
const DIALOGUE_AUTO_ADVANCE_SECONDS = 3.0;

/**
 * Coordinates the opening gameplay state sequence:
 *  ELEVATOR_ARRIVING -> UNARMED_INTRO -> PHONE_RINGING -> PHONE_ANSWERED -> CALL_ENDED
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

    this.state = INTRO_STATES.ELEVATOR_ARRIVING;
    this._gameState = 'MAIN_MENU';
    this.hasStarted = false;
    this.tutorialShown = false;
    this.tutorialDismissed = false;
    this.tutorialTimer = 0;
    this.tutorialVisibleTimer = 0;
    this._elevatorTimer = 0;
    this._chimePlayed = false;
    this._doorSoundPlayed = false;
    this._enteredMainRoom = false;
    this._mainRoomRingTimer = 0;

    // Phone dialogue & typewriter state
    this._dialogueActive = false;
    this._callStartDelay = 0;
    this._dialogueTurnIndex = 0;
    this._charIndex = 0;
    this._charTimer = 0;
    this._postLineTimer = 0;
    this._nonSpaceCharCount = 0;
    this._callerDisplayedText = '';
    this._playerDisplayedText = '';
    this._showPlayerRow = false;

    // Pre-allocated scratch vectors for zero per-frame GC allocations
    this._phoneWorldPos = new THREE.Vector3(1.46, 0.95, -2.82);
    this._toPhone = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._arrowBaseY = this._phoneWorldPos.y + 0.48;

    this._phoneRef = null;
    this.arrowMesh = null;

    this._resolvePhoneReference();
    this._buildFloatingArrow();

    this._onKeyDown = (e) => this._handleKeyDown(e);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', this._onKeyDown, true);
    }
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
   * Positions Roc inside the closed elevator cab facing straight toward the steel doors
   * and ensures closed door panels + blocker collider are in their initial state.
   */
  spawnInElevator(useReset = false) {
    this._setElevatorDoorsProgress(0);
    this._setElevatorDoorBlockerActive(true);
    if (!this.player) return;
    if (useReset && typeof this.player.reset === 'function') {
      this.player.reset(
        ELEVATOR_SPAWN.x,
        ELEVATOR_SPAWN.y,
        ELEVATOR_SPAWN.z,
        ELEVATOR_SPAWN.yaw,
        ELEVATOR_SPAWN.pitch
      );
    } else {
      this.player.teleport(ELEVATOR_SPAWN.x, ELEVATOR_SPAWN.y, ELEVATOR_SPAWN.z);
      this.player.yaw = ELEVATOR_SPAWN.yaw;
      this.player.pitch = ELEVATOR_SPAWN.pitch;
      if (typeof this.player._updateCameraTransform === 'function') {
        this.player._updateCameraTransform();
      }
    }
  }

  /** @deprecated Alias kept for compatibility with external callers */
  spawnInVestibule(useReset = false) {
    this.spawnInElevator(useReset);
  }

  _setElevatorDoorsProgress(progress = 0) {
    if (!this.warehouse) return;
    const t = Math.max(0, Math.min(1, progress));
    const slide = this.warehouse.elevatorDoorSlideDistance ?? 0.695;
    if (this.warehouse.elevatorLeftDoorMesh && this.warehouse.elevatorDoorClosedLeftX !== undefined) {
      this.warehouse.elevatorLeftDoorMesh.position.x = this.warehouse.elevatorDoorClosedLeftX - t * slide;
    }
    if (this.warehouse.elevatorRightDoorMesh && this.warehouse.elevatorDoorClosedRightX !== undefined) {
      this.warehouse.elevatorRightDoorMesh.position.x = this.warehouse.elevatorDoorClosedRightX + t * slide;
    }
  }

  _setElevatorDoorBlockerActive(active) {
    if (this.warehouse && this.warehouse.elevatorDoorBlocker) {
      this.warehouse.elevatorDoorBlocker.active = !!active;
    }
  }

  onGameStartPressed() {
    if (this.hasStarted) return;
    this.hasStarted = true;
    this._gameState = 'PLAYING';
    this.state = INTRO_STATES.ELEVATOR_ARRIVING;
    this.tutorialTimer = 0;
    this.tutorialVisibleTimer = 0;
    this.tutorialShown = false;
    this.tutorialDismissed = false;
    this._elevatorTimer = 0;
    this._chimePlayed = false;
    this._doorSoundPlayed = false;
    this._enteredMainRoom = false;
    this._mainRoomRingTimer = 0;
    this._dialogueActive = false;

    this.spawnInElevator(false);
    if (this.sound && typeof this.sound.resume === 'function') {
      this.sound.resume();
    }
    if (this.player && typeof this.player.setJumpSuppressed === 'function') {
      this.player.setJumpSuppressed(false);
    }
    if (this.weaponSystem && typeof this.weaponSystem.setUnarmed === 'function') {
      this.weaponSystem.setUnarmed(true);
    }
    if (this.hud) {
      this.hud.setTutorialVisible(false);
      this.hud.setObjectiveVisible(false);
      this.hud.setInteractVisible(false);
      if (typeof this.hud.setPhoneDialogueVisible === 'function') {
        this.hud.setPhoneDialogueVisible(false, true);
      }
    }
  }

  onGameStateChanged(nextState) {
    this._gameState = nextState;
    if (!this.sound) return;
    if (this.state === INTRO_STATES.PHONE_RINGING) {
      this.sound.setPhoneRingtonePaused(nextState !== 'PLAYING');
    }
  }

  _handleKeyDown(e) {
    if (!e || e.code !== 'Space') return;
    if (this.state !== INTRO_STATES.PHONE_ANSWERED || this._gameState !== 'PLAYING') return;

    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (e.repeat) return;

    this._handleDialogueSpaceSkip();
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
    this._gameState = 'PLAYING';

    if (this.sound) {
      this.sound.stopPhoneRingtone();
      this.sound.playPhonePickupClick();
    }

    if (this.arrowMesh) {
      this.arrowMesh.visible = false;
    }

    if (this.player && typeof this.player.setJumpSuppressed === 'function') {
      this.player.setJumpSuppressed(true);
    }

    this.tutorialDismissed = true;
    if (this.hud) {
      this.hud.setInteractVisible(false);
      this.hud.setTutorialVisible(false);
      this.hud.setObjectiveVisible(false);
    }

    this._setPhoneAnsweredVisuals();
    this._startDialogueSequence();
  }

  _startDialogueSequence() {
    this._dialogueActive = true;
    this._callStartDelay = CALL_PICKUP_DELAY_SECONDS;
    this._dialogueTurnIndex = 0;
    this._charIndex = 0;
    this._charTimer = 0;
    this._postLineTimer = 0;
    this._nonSpaceCharCount = 0;
    this._callerDisplayedText = '';
    this._playerDisplayedText = '';
    this._showPlayerRow = false;
  }

  _beginDialogueTurn(turnIdx) {
    this._dialogueTurnIndex = turnIdx;
    this._charIndex = 0;
    this._charTimer = 0;
    this._postLineTimer = 0;
    this._nonSpaceCharCount = 0;
    const turn = PHONE_DIALOGUE_SCRIPT[turnIdx];
    if (turn.speaker === 'jorio') {
      this._callerDisplayedText = '';
    } else {
      this._playerDisplayedText = '';
      this._showPlayerRow = true;
    }
    this._syncDialogueHud();
  }

  _syncDialogueHud() {
    if (!this.hud) return;
    const turn = PHONE_DIALOGUE_SCRIPT[this._dialogueTurnIndex];
    if (!turn) return;

    const isLineComplete = this._charIndex >= turn.text.length;
    if (typeof this.hud.setPhoneDialogueVisible === 'function') {
      this.hud.setPhoneDialogueVisible(true);
    }
    if (typeof this.hud.setPhoneDialogueState === 'function') {
      this.hud.setPhoneDialogueState({
        showPlayerRow: this._showPlayerRow,
        activeSpeaker: turn.speaker,
        callerText: this._callerDisplayedText,
        playerText: this._playerDisplayedText,
        skipHintText: isLineComplete ? '[ESPAÇO] PRÓXIMO ▸' : '[ESPAÇO] PULAR ▸',
      });
    }
  }

  _handleDialogueSpaceSkip() {
    if (this.state !== INTRO_STATES.PHONE_ANSWERED || !this._dialogueActive) return;

    // If skipped during the 0.3s pickup transition, open Turn 1 immediately
    if (this._callStartDelay > 0) {
      this._callStartDelay = 0;
      this._beginDialogueTurn(0);
      return;
    }

    const turn = PHONE_DIALOGUE_SCRIPT[this._dialogueTurnIndex];
    if (!turn) return;

    if (this._charIndex < turn.text.length) {
      // 1st press: snap-complete current phrase immediately
      this._charIndex = turn.text.length;
      this._charTimer = 0;
      this._postLineTimer = 0;
      if (turn.speaker === 'jorio') {
        this._callerDisplayedText = turn.text;
      } else {
        this._playerDisplayedText = turn.text;
      }
      this._syncDialogueHud();
    } else {
      // 2nd press: immediately advance to next turn or end call after final turn
      this._advanceDialogueTurn();
    }
  }

  _advanceDialogueTurn() {
    const nextIdx = this._dialogueTurnIndex + 1;
    if (nextIdx >= PHONE_DIALOGUE_SCRIPT.length) {
      this._endPhoneCall();
      return;
    }
    this._beginDialogueTurn(nextIdx);
  }

  _updateDialogue(delta) {
    if (!this._dialogueActive) return;

    if (this._callStartDelay > 0) {
      this._callStartDelay -= delta;
      if (this._callStartDelay <= 0) {
        this._callStartDelay = 0;
        this._beginDialogueTurn(0);
      }
      return;
    }

    const turn = PHONE_DIALOGUE_SCRIPT[this._dialogueTurnIndex];
    if (!turn) return;

    if (this._charIndex < turn.text.length) {
      this._charTimer -= delta;
      const baseInterval = 1.0 / TYPEWRITER_CHARS_PER_SEC;
      let revealedAny = false;

      while (this._charTimer <= 0 && this._charIndex < turn.text.length) {
        const ch = turn.text[this._charIndex];
        this._charIndex++;
        revealedAny = true;

        if (ch !== ' ' && ch !== '\n') {
          this._nonSpaceCharCount++;
          if (this._nonSpaceCharCount % 3 === 1 && this.sound && typeof this.sound.playDialogueBlip === 'function') {
            this.sound.playDialogueBlip(turn.speaker);
          }
        }

        const hasMore = this._charIndex < turn.text.length;
        const isPunct = ch === '.' || ch === '?' || ch === '!' || ch === ',';
        this._charTimer += baseInterval + (hasMore && isPunct ? TYPEWRITER_PUNCT_PAUSE : 0);
      }

      if (revealedAny) {
        const slice = turn.text.slice(0, this._charIndex);
        if (turn.speaker === 'jorio') {
          this._callerDisplayedText = slice;
        } else {
          this._playerDisplayedText = slice;
        }
        if (this._charIndex >= turn.text.length) {
          this._postLineTimer = 0;
        }
        this._syncDialogueHud();
      }
    } else {
      this._postLineTimer += delta;
      if (this._postLineTimer >= DIALOGUE_AUTO_ADVANCE_SECONDS) {
        this._advanceDialogueTurn();
      }
    }
  }

  _endPhoneCall() {
    if (this.state === INTRO_STATES.CALL_ENDED) return;
    this.state = INTRO_STATES.CALL_ENDED;
    this._dialogueActive = false;

    if (this.player && typeof this.player.setJumpSuppressed === 'function') {
      this.player.setJumpSuppressed(false);
    }
    if (this.input && this.input.keys) {
      this.input.keys.Space = false;
      this.input.keys[' '] = false;
      if (this.input.justPressedKeys) {
        this.input.justPressedKeys.Space = false;
        this.input.justPressedKeys[' '] = false;
      }
    }

    if (this.sound && typeof this.sound.playPhoneDisconnectTone === 'function') {
      this.sound.playPhoneDisconnectTone();
    }

    if (this.hud && typeof this.hud.setPhoneDialogueVisible === 'function') {
      this.hud.setPhoneDialogueVisible(false);
    }

    this._resetPhoneToIdle();
  }

  _resetPhoneToIdle() {
    if (!this._phoneRef) return;
    const handset = this._phoneRef.handsetMesh;
    if (handset) {
      handset.visible = true;
      if (this._phoneRef.userData && this._phoneRef.userData.handsetRestPos) {
        handset.position.copy(this._phoneRef.userData.handsetRestPos);
      }
      if (this._phoneRef.userData && this._phoneRef.userData.handsetRestQuat) {
        handset.quaternion.copy(this._phoneRef.userData.handsetRestQuat);
      }
    }
    if (this._phoneRef.mwiLedMesh && this._phoneRef.mwiLedMesh.material) {
      this._phoneRef.mwiLedMesh.material.color.setHex(0xef4444);
    }
    if (this._phoneRef.screenMaterial) {
      this._phoneRef.screenMaterial.color.setHex(0xffffff);
    }
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
    this._gameState = gameState;
    if (!this.hasStarted || gameState !== 'PLAYING') return;

    // Elevator Arrival Sequence: "pin-dun" chime -> smooth sliding steel doors -> unlock exit
    if (this.state === INTRO_STATES.ELEVATOR_ARRIVING) {
      this._elevatorTimer += delta;
      if (!this._chimePlayed && this._elevatorTimer >= ELEVATOR_CHIME_DELAY_SECONDS) {
        this._chimePlayed = true;
        if (this.sound && typeof this.sound.playElevatorArrivalChime === 'function') {
          this.sound.playElevatorArrivalChime();
        }
      }
      if (!this._doorSoundPlayed && this._elevatorTimer >= ELEVATOR_DOOR_SLIDE_START_SECONDS) {
        this._doorSoundPlayed = true;
        if (this.sound && typeof this.sound.playElevatorDoorSlide === 'function') {
          this.sound.playElevatorDoorSlide();
        }
      }
      if (this._elevatorTimer >= ELEVATOR_DOOR_SLIDE_START_SECONDS) {
        const rawT = Math.min(
          1.0,
          (this._elevatorTimer - ELEVATOR_DOOR_SLIDE_START_SECONDS) / ELEVATOR_DOOR_SLIDE_DURATION_SECONDS
        );
        const smooth = rawT * rawT * (3 - 2 * rawT);
        this._setElevatorDoorsProgress(smooth);
        if (rawT >= 1.0) {
          this._setElevatorDoorBlockerActive(false);
          this.state = INTRO_STATES.UNARMED_INTRO;
        }
      }
    }

    // Fade in tutorial hint right as the elevator doors finish opening (~2.45s after START)
    if (!this.tutorialDismissed && this.state !== INTRO_STATES.PHONE_ANSWERED && this.state !== INTRO_STATES.CALL_ENDED) {
      if (!this.tutorialShown) {
        if (this.state !== INTRO_STATES.ELEVATOR_ARRIVING || this._elevatorTimer >= TUTORIAL_REVEAL_TIME_SECONDS) {
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

    // Trigger ringing sequence 6.0s after Roc steps out of the vestibule into the main office room
    if (this.state === INTRO_STATES.UNARMED_INTRO) {
      if (!this._enteredMainRoom) {
        const liveX = this.player ? this.player.position.x : (this.camera ? this.camera.position.x : -999);
        if (liveX > MAIN_ROOM_THRESHOLD_X) {
          this._enteredMainRoom = true;
          this._mainRoomRingTimer = 0;
        }
      } else {
        this._mainRoomRingTimer += delta;
        if (this._mainRoomRingTimer >= PHONE_RING_DELAY_AFTER_ENTRY_SECONDS) {
          this._enterPhoneRinging();
        }
      }
    }

    if (this.state === INTRO_STATES.PHONE_RINGING) {
      this._updateRingingVisualsAndAudio(performance.now() * 0.001);
    } else if (this.state === INTRO_STATES.PHONE_ANSWERED) {
      this._updateDialogue(delta);
    }
  }

  reset() {
    this.state = INTRO_STATES.ELEVATOR_ARRIVING;
    this._gameState = 'MAIN_MENU';
    this.hasStarted = false;
    this.tutorialShown = false;
    this.tutorialDismissed = false;
    this.tutorialTimer = 0;
    this.tutorialVisibleTimer = 0;
    this._elevatorTimer = 0;
    this._chimePlayed = false;
    this._doorSoundPlayed = false;
    this._enteredMainRoom = false;
    this._mainRoomRingTimer = 0;
    this._dialogueActive = false;
    this._callStartDelay = 0;
    this._dialogueTurnIndex = 0;
    this._charIndex = 0;
    this._charTimer = 0;
    this._postLineTimer = 0;
    this._callerDisplayedText = '';
    this._playerDisplayedText = '';
    this._showPlayerRow = false;

    if (this.player && typeof this.player.setJumpSuppressed === 'function') {
      this.player.setJumpSuppressed(false);
    }
    if (this.sound) {
      this.sound.stopPhoneRingtone();
    }
    if (this.arrowMesh) {
      this.arrowMesh.visible = false;
    }

    this._resetPhoneToIdle();

    if (this.hud) {
      this.hud.setTutorialVisible(false);
      this.hud.setObjectiveVisible(false);
      this.hud.setInteractVisible(false);
      if (typeof this.hud.setPhoneDialogueVisible === 'function') {
        this.hud.setPhoneDialogueVisible(false, true);
      }
      if (typeof this.hud.setPhoneDialogueState === 'function') {
        this.hud.setPhoneDialogueState({
          showPlayerRow: false,
          activeSpeaker: 'jorio',
          callerText: '',
          playerText: '',
          skipHintText: '[ESPAÇO] PULAR ▸',
        });
      }
    }

    if (this.weaponSystem && typeof this.weaponSystem.setUnarmed === 'function') {
      this.weaponSystem.setUnarmed(true);
    }
    this.spawnInElevator(true);
  }
}
