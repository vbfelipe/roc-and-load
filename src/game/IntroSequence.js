import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const INTRO_STATES = Object.freeze({
  ELEVATOR_ARRIVING: 'ELEVATOR_ARRIVING',
  UNARMED_INTRO: 'UNARMED_INTRO',
  PHONE_RINGING: 'PHONE_RINGING',
  PHONE_ANSWERED: 'PHONE_ANSWERED',
  CALL_ENDED: 'CALL_ENDED',
  BUILDING_EXPLOSION: 'BUILDING_EXPLOSION',
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

// Post-call disconnect tone finishes at ~1.25s, followed by 2.2s eerie silence -> 3.45s total
const PHONE_DISCONNECT_FINISH_SECONDS = 1.25;
const POST_CALL_SILENCE_SECONDS = 2.20;
const POST_CALL_EXPLOSION_DELAY_SECONDS = PHONE_DISCONNECT_FINISH_SECONDS + POST_CALL_SILENCE_SECONDS;
const BUILDING_EXPLOSION_DURATION_SECONDS = 9.0;
const COMBAT_UNLOCK_EXPLOSION_TIME_SECONDS = 5.2;
const COMBAT_TUTORIAL_MIN_DURATION_SECONDS = 7.5;
const COMBAT_TUTORIAL_POST_EQUIP_SECONDS = 3.5;
const STAIRWELL_BLAST_POS = Object.freeze({ x: -11.0, y: 1.2, z: 11.5 });
const SMOKE_POOL_COUNT = 120;
const CONCRETE_DEBRIS_COUNT = 24;
const PLASTER_DEBRIS_COUNT = 12;

/**
 * Coordinates the opening gameplay state sequence:
 *  ELEVATOR_ARRIVING -> UNARMED_INTRO -> PHONE_RINGING -> PHONE_ANSWERED -> CALL_ENDED -> BUILDING_EXPLOSION
 */
export class IntroSequence {
  constructor({ scene, camera, player, weaponSystem, hud, sound, input, warehouse, zombieManager = null }) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.weaponSystem = weaponSystem;
    this.hud = hud;
    this.sound = sound;
    this.input = input;
    this.warehouse = warehouse;
    this.zombieManager = zombieManager;

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

    // Post-call & stairwell building explosion state
    this._callEndedTimer = 0;
    this._explosionTimer = 0;
    this._explosionWave2Triggered = false;
    this._explosionWave3Triggered = false;
    this._explosionFadeTriggered = false;
    this._explosionAudioStopped = false;
    this._stanchionClatterPlayed = false;
    this._wave1Triggered = false;
    this._combatUnlocked = false;
    this._combatTutorialVisible = false;
    this._combatTutorialTimer = 0;
    this._combatEquipDetected = false;
    this._postEquipTutorialTimer = 0;
    this._debrisAllSettled = true;
    this._smokeActiveCount = 0;

    // Pre-allocated scratch vectors for zero per-frame GC allocations
    this._phoneWorldPos = new THREE.Vector3(1.46, 0.95, -2.82);
    this._toPhone = new THREE.Vector3();
    this._toBlast = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._camUp = new THREE.Vector3();
    this._dummyObj = new THREE.Object3D();
    this._arrowBaseY = this._phoneWorldPos.y + 0.48;

    this._phoneRef = null;
    this.arrowMesh = null;

    this._resolvePhoneReference();
    this._buildFloatingArrow();
    this._buildExplosionVfxPools();

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

  _createSmokePuffTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);
    // Soft multi-lobe volumetric smoke cloud (thick cloudy body, drops cleanly to 0 strictly inside r = 56/128 = 0.4375)
    const lobes = [
      { x: 64, y: 64, r: 56, a: 0.90 },
      { x: 50, y: 58, r: 41, a: 0.58 },
      { x: 78, y: 55, r: 39, a: 0.54 },
      { x: 59, y: 77, r: 41, a: 0.56 },
    ];
    for (const l of lobes) {
      const g = ctx.createRadialGradient(l.x, l.y, l.r * 0.08, l.x, l.y, l.r);
      g.addColorStop(0.0, `rgba(214, 212, 208, ${l.a})`);
      g.addColorStop(0.50, `rgba(174, 174, 172, ${(l.a * 0.72).toFixed(3)})`);
      g.addColorStop(0.78, `rgba(130, 132, 134, ${(l.a * 0.34).toFixed(3)})`);
      g.addColorStop(1.0, 'rgba(90, 92, 96, 0.0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  _buildExplosionVfxPools() {
    this._smokeTex = this._createSmokePuffTexture();
    const smokeQuadGeo = new THREE.PlaneGeometry(1, 1);
    const smokeTints = [0x828489, 0x99958d, 0x6c7077, 0xb0aba2];

    this._smokePool = [];
    for (let i = 0; i < SMOKE_POOL_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this._smokeTex,
        color: smokeTints[i % smokeTints.length],
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(smokeQuadGeo, mat);
      mesh.name = `StairwellSmokePuff_${i}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      // Draw before DC_VestibuleGlass (renderOrder = 2) so office view sees smoke behind glass
      mesh.renderOrder = 1;
      mesh.visible = false;
      if (this.scene) this.scene.add(mesh);

      this._smokePool.push({
        mesh,
        mat,
        active: false,
        ambientHaze: false,
        age: 0,
        life: 6.0,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        startScale: 1.0,
        endScale: 3.0,
        peakOpacity: 0.45,
        rot: 0,
        rotVel: 0,
      });
    }

    // Build deterministic jagged low-poly concrete & plaster debris instanced batches (2 draw calls total)
    const concreteGeo = new THREE.DodecahedronGeometry(0.058, 0);
    const cPos = concreteGeo.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const j = 0.72 + ((i * 37) % 13) * 0.045;
      cPos.setXYZ(i, cPos.getX(i) * j, cPos.getY(i) * (0.68 + (i % 5) * 0.11), cPos.getZ(i) * j);
    }
    concreteGeo.computeVertexNormals();
    this._concreteMat = new THREE.MeshStandardMaterial({
      color: 0x626870,
      roughness: 0.94,
      metalness: 0.04,
    });
    this._concreteInstanced = new THREE.InstancedMesh(concreteGeo, this._concreteMat, CONCRETE_DEBRIS_COUNT);
    this._concreteInstanced.name = 'StairwellConcreteDebris';
    this._concreteInstanced.castShadow = false;
    this._concreteInstanced.receiveShadow = true;
    this._concreteInstanced.frustumCulled = false;
    this._concreteInstanced.visible = false;

    const plasterGeo = new THREE.BoxGeometry(0.145, 0.022, 0.105);
    this._plasterMat = new THREE.MeshStandardMaterial({
      color: 0xd0d5dc,
      roughness: 0.92,
      metalness: 0.02,
    });
    this._plasterInstanced = new THREE.InstancedMesh(plasterGeo, this._plasterMat, PLASTER_DEBRIS_COUNT);
    this._plasterInstanced.name = 'StairwellPlasterDebris';
    this._plasterInstanced.castShadow = false;
    this._plasterInstanced.receiveShadow = true;
    this._plasterInstanced.frustumCulled = false;
    this._plasterInstanced.visible = false;

    if (this.scene) {
      this.scene.add(this._concreteInstanced);
      this.scene.add(this._plasterInstanced);
    }

    this._debrisItems = [];
    const totalDebris = CONCRETE_DEBRIS_COUNT + PLASTER_DEBRIS_COUNT;
    for (let i = 0; i < totalDebris; i++) {
      const isConcrete = i < CONCRETE_DEBRIS_COUNT;
      this._debrisItems.push({
        isConcrete,
        instIdx: isConcrete ? i : i - CONCRETE_DEBRIS_COUNT,
        active: false,
        settled: false,
        x: 0, y: -10, z: 0,
        vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0,
        avx: 0, avy: 0, avz: 0,
        sx: 1, sy: 1, sz: 1,
        restY: isConcrete ? 0.036 : 0.012,
      });
    }
    this._hideAllDebris();
  }

  _hideAllDebris() {
    this._dummyObj.position.set(0, -10, 0);
    this._dummyObj.scale.set(0, 0, 0);
    this._dummyObj.rotation.set(0, 0, 0);
    this._dummyObj.updateMatrix();
    if (this._concreteInstanced) {
      for (let i = 0; i < CONCRETE_DEBRIS_COUNT; i++) {
        this._concreteInstanced.setMatrixAt(i, this._dummyObj.matrix);
      }
      this._concreteInstanced.instanceMatrix.needsUpdate = true;
      this._concreteInstanced.visible = false;
    }
    if (this._plasterInstanced) {
      for (let i = 0; i < PLASTER_DEBRIS_COUNT; i++) {
        this._plasterInstanced.setMatrixAt(i, this._dummyObj.matrix);
      }
      this._plasterInstanced.instanceMatrix.needsUpdate = true;
      this._plasterInstanced.visible = false;
    }
    if (this._debrisItems) {
      for (const d of this._debrisItems) {
        d.active = false;
        d.settled = false;
      }
    }
    this._debrisAllSettled = true;
  }

  _hideAllSmoke() {
    if (!this._smokePool) return;
    for (const p of this._smokePool) {
      p.active = false;
      p.ambientHaze = false;
      p.mat.opacity = 0;
      p.mesh.visible = false;
    }
    this._smokeActiveCount = 0;
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
    const halfLeafW = this.warehouse.elevatorDoorHalfWidth ?? 0.3425;

    if (this.warehouse.elevatorLeftDoorMesh && this.warehouse.elevatorDoorClosedLeftX !== undefined) {
      const leftX = this.warehouse.elevatorDoorClosedLeftX - t * slide;
      this.warehouse.elevatorLeftDoorMesh.position.x = leftX;
      if (this.warehouse.elevatorLeftDoorBlocker) {
        this.warehouse.elevatorLeftDoorBlocker.minX = leftX - halfLeafW;
        this.warehouse.elevatorLeftDoorBlocker.maxX = leftX + halfLeafW + 0.002;
      }
    }
    if (this.warehouse.elevatorRightDoorMesh && this.warehouse.elevatorDoorClosedRightX !== undefined) {
      const rightX = this.warehouse.elevatorDoorClosedRightX + t * slide;
      this.warehouse.elevatorRightDoorMesh.position.x = rightX;
      if (this.warehouse.elevatorRightDoorBlocker) {
        this.warehouse.elevatorRightDoorBlocker.minX = rightX - halfLeafW - 0.002;
        this.warehouse.elevatorRightDoorBlocker.maxX = rightX + halfLeafW;
      }
    }
  }

  _setElevatorDoorBlockerActive(active) {
    if (!this.warehouse) return;
    const isActive = !!active;
    if (Array.isArray(this.warehouse.elevatorDoorBlockers)) {
      for (const blocker of this.warehouse.elevatorDoorBlockers) {
        if (blocker) blocker.active = isActive;
      }
    }
    if (this.warehouse.elevatorDoorBlocker) {
      this.warehouse.elevatorDoorBlocker.active = isActive;
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
    this._callEndedTimer = 0;
    this._explosionTimer = 0;
    this._explosionWave2Triggered = false;
    this._explosionWave3Triggered = false;
    this._explosionFadeTriggered = false;
    this._explosionAudioStopped = false;
    this._stanchionClatterPlayed = false;
    this._wave1Triggered = false;
    this._combatUnlocked = false;
    this._combatTutorialVisible = false;
    this._combatTutorialTimer = 0;
    this._combatEquipDetected = false;
    this._postEquipTutorialTimer = 0;

    this._hideAllDebris();
    this._hideAllSmoke();
    if (this.warehouse && this.warehouse.stairwellStanchions) {
      this.warehouse.stairwellStanchions.resetStairwellStanchions();
    }

    this.spawnInElevator(false);
    if (this.sound && typeof this.sound.resume === 'function') {
      this.sound.resume();
    }
    if (this.player && typeof this.player.setJumpSuppressed === 'function') {
      this.player.setJumpSuppressed(false);
    }
    if (this.weaponSystem) {
      if (typeof this.weaponSystem.lockAllWeapons === 'function') {
        this.weaponSystem.lockAllWeapons();
      }
      if (typeof this.weaponSystem.setUnarmed === 'function') {
        this.weaponSystem.setUnarmed(true);
      }
    }
    if (this.hud) {
      if (typeof this.hud.resetTutorialBar === 'function') {
        this.hud.resetTutorialBar();
      }
      this.hud.setTutorialVisible(false, true);
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
    } else if (this.state === INTRO_STATES.BUILDING_EXPLOSION) {
      if (typeof this.sound.setBuildingExplosionPaused === 'function') {
        this.sound.setBuildingExplosionPaused(nextState !== 'PLAYING');
      }
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

    if (typeof window !== 'undefined' && window.__rocWeaponWheel?.isOpen) {
      window.__rocWeaponWheel.close(false);
    }

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
    if (this.state === INTRO_STATES.CALL_ENDED || this.state === INTRO_STATES.BUILDING_EXPLOSION) return;
    this.state = INTRO_STATES.CALL_ENDED;
    this._dialogueActive = false;
    this._callEndedTimer = 0;

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

  _triggerBuildingExplosion() {
    if (this.state === INTRO_STATES.BUILDING_EXPLOSION) return;
    this.state = INTRO_STATES.BUILDING_EXPLOSION;
    this._explosionTimer = 0;
    this._explosionWave2Triggered = false;
    this._explosionWave3Triggered = false;
    this._explosionFadeTriggered = false;
    this._explosionAudioStopped = false;
    this._stanchionClatterPlayed = false;
    this._wave1Triggered = false;
    this._combatUnlocked = false;
    this._combatTutorialVisible = false;
    this._combatTutorialTimer = 0;
    this._combatEquipDetected = false;
    this._postEquipTutorialTimer = 0;

    if (this.sound && typeof this.sound.playBuildingExplosion === 'function') {
      this.sound.playBuildingExplosion();
    }

    if (this.warehouse && this.warehouse.stairwellStanchions) {
      this.warehouse.stairwellStanchions.toppleStairwellStanchions(true);
    }

    // Wave 1: Initial blast smoke plume & concrete rubble surge engulfing the entire vestibule
    this._launchSmokeWave(1);
    this._launchDebrisWave(0, 16, 1.0);
  }

  _launchSmokeWave(waveIdx) {
    if (!this._smokePool) return;
    const waveCounts = { 1: 56, 2: 32, 3: 32 };
    const want = waveCounts[waveIdx] || 32;
    let spawned = 0;

    for (let i = 0; i < this._smokePool.length && spawned < want; i++) {
      const p = this._smokePool[i];
      if (p.active) continue;

      const u = (spawned + 0.5) / want;
      const isEdgeHugger = (spawned % 2 === 0);

      p.active = true;
      p.ambientHaze = true; // Held full density through 9.0s action, then smoothly fades out
      p.age = 0;
      p.life = 13.8 + (spawned % 5) * 0.45; // Smoothly resolves after the 9.0s action finishes

      if (isEdgeHugger) {
        // Tighter clouds hug right up against glass window, ceiling, floor & walls without clipping
        p.startScale = 1.00 + (spawned % 3) * 0.16;
        p.endScale = 1.48 + (spawned % 3) * 0.18; // max 1.84m -> radius ~0.83m fills to 2cm of glass/walls
      } else {
        // Larger volumetric core billows pack the interior volume of the vestibule
        p.startScale = 1.25 + (spawned % 3) * 0.22;
        p.endScale = 2.00 + (spawned % 4) * 0.18; // max 2.54m -> fits cleanly inside 3.99m x 3.80m box
      }

      // Distribute across EVERY zone of the vestibule (stairwell, south pocket, window corridor, doorway & elevator)
      const zoneMod = spawned % 5;
      if (zoneMod === 0) {
        // Right behind the glass partition window (Z = 1.9..9.6)
        p.x = -12.10 + (spawned % 3) * 0.48;
        p.y = 0.72 + ((spawned * 3) % 5) * 0.54;
        p.z = 1.90 + u * 8.40;
      } else if (zoneMod === 1) {
        // Center & north marble vestibule (elevator / plant / cart / doorway)
        p.x = -13.45 + u * 2.55;
        p.y = 0.75 + ((spawned * 2) % 4) * 0.65;
        p.z = 7.60 + ((spawned * 3) % 5) * 0.72;
      } else if (zoneMod === 2) {
        // Stairwell upper mouth & mid-landing
        p.x = -13.50 + u * 2.50;
        p.y = 0.75 + (spawned % 4) * 0.60;
        p.z = 5.05 + ((spawned * 5) % 4) * 0.68;
      } else if (zoneMod === 3) {
        // South vestibule stairwell bay (Z = 1.8..5.2)
        p.x = -13.45 + u * 2.45;
        p.y = 0.80 + (spawned % 4) * 0.60;
        p.z = 1.85 + ((spawned * 7) % 5) * 0.68;
      } else {
        // Upper vestibule volume filling ceiling layer (Y = 1.8..3.0)
        p.x = -13.35 + u * 2.35;
        p.y = 1.85 + (spawned % 3) * 0.48;
        p.z = 2.40 + u * 7.90;
      }

      // Swirling turbulence strictly inside the vestibule
      p.vx = Math.sin(spawned * 3.7 + waveIdx) * 0.44;
      p.vy = 0.16 + ((spawned % 3) - 1) * 0.14;
      p.vz = Math.cos(spawned * 2.9 + waveIdx) * 0.44 + 0.08;

      p.peakOpacity = waveIdx === 1 ? 0.78 : 0.72;
      p.rot = (spawned * 1.17) % (Math.PI * 2);
      p.rotVel = ((spawned % 2 === 0 ? 1 : -1) * (0.24 + (spawned % 3) * 0.09));

      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.scale.set(p.startScale, p.startScale, 1);
      p.mat.opacity = 0;
      p.mesh.visible = true;
      spawned++;
    }
  }

  _launchDebrisWave(startIdx, endIdx, waveBoost = 1.0) {
    if (!this._debrisItems) return;
    if (this._concreteInstanced) this._concreteInstanced.visible = true;
    if (this._plasterInstanced) this._plasterInstanced.visible = true;
    this._debrisAllSettled = false;

    const span = Math.max(1, endIdx - startIdx);
    for (let i = startIdx; i < endIdx && i < this._debrisItems.length; i++) {
      const d = this._debrisItems[i];
      const frac = (i - startIdx) / span;
      const seed = (i + 1) * 1.6180339;

      d.active = true;
      d.settled = false;
      d.x = -13.65 + frac * 1.95 + Math.sin(seed * 4.3) * 0.16;
      d.y = 0.18 + ((i * 7) % 5) * 0.12;
      d.z = 6.55 + ((i * 5) % 4) * 0.22;

      // Positive Z velocities ensure chunks blast out of stairwell onto vestibule black marble landing
      d.vx = Math.sin(seed * 7.1) * 1.35 + 0.30;
      d.vy = (2.8 + ((i * 11) % 6) * 0.52) * waveBoost;
      d.vz = (1.9 + ((i * 13) % 7) * 0.36) * waveBoost;

      d.rx = seed;
      d.ry = seed * 2.1;
      d.rz = seed * 0.7;
      d.avx = (i % 2 === 0 ? 1 : -1) * (5.5 + (i % 5) * 1.8);
      d.avy = (i % 3 === 0 ? 1 : -1) * (4.5 + (i % 4) * 1.6);
      d.avz = (i % 2 === 0 ? -1 : 1) * (5.0 + (i % 6) * 1.4);

      const scaleBase = d.isConcrete ? (0.72 + (i % 5) * 0.19) : (0.75 + (i % 4) * 0.22);
      d.sx = scaleBase;
      d.sy = scaleBase * (d.isConcrete ? (0.75 + (i % 3) * 0.16) : 1.0);
      d.sz = scaleBase * (d.isConcrete ? (0.85 + (i % 4) * 0.12) : 1.0);
      d.restY = (d.isConcrete ? 0.036 : 0.012) * d.sy;
    }
  }

  /**
   * Procedural tremor envelope compressed to the 9.0s action window:
   *  - 0.0s - 1.8s: Sharp initial blast shockwave jolt tapering through 1.8s
   *  - 1.8s - 2.5s: Heavy structural groan lull
   *  - 2.5s - 4.5s: Secondary explosion shock pulse
   *  - 4.5s - 7.8s: Heavy sustained structural collapse tremor
   *  - 7.8s - 9.0s: Smooth cosine decay back to 0.0
   */
  _computeWaveformShakeAmplitude(t) {
    if (t < 0 || t >= BUILDING_EXPLOSION_DURATION_SECONDS) return 0;

    if (t < 1.8) {
      const attack = Math.min(1.0, t / 0.10);
      const decay = 0.34 + 0.66 * Math.exp(-t * 0.95);
      const ripple = 1.0 + 0.16 * Math.sin(t * 7.8);
      return attack * decay * ripple;
    }
    if (t < 2.5) {
      const u = (t - 1.8) / 0.7;
      return 0.28 - 0.07 * Math.sin(u * Math.PI);
    }
    if (t < 4.5) {
      const u = t - 2.5;
      const pulse1 = 0.76 * Math.exp(-u * 1.45);
      const pulse2 = 0.46 * Math.exp(-Math.pow((u - 1.05) / 0.42, 2));
      return Math.max(0.28, 0.28 + pulse1 + pulse2);
    }
    if (t < 7.8) {
      // Intense collapse tremor across 4.5s..7.8s
      const rampIn = Math.min(1.0, Math.max(0.0, (t - 4.4) / 0.55));
      const rampOut = t > 7.1 ? Math.max(0.45, 1.0 - ((t - 7.1) / 0.7) * 0.55) : 1.0;
      const collapseBody = 0.88 + 0.18 * Math.sin((t - 4.5) * 3.8) + 0.09 * Math.cos((t - 4.5) * 9.5);
      return rampIn * rampOut * collapseBody;
    }

    // 7.8s - 9.0s smooth cosine fade to 0.0
    const fadeU = (t - 7.8) / 1.2;
    return 0.44 * 0.5 * (1.0 + Math.cos(Math.PI * Math.min(1.0, fadeU)));
  }

  _updateSmokePool(delta) {
    if (!this._smokePool) return;
    let activeCount = 0;

    for (let i = 0; i < this._smokePool.length; i++) {
      const p = this._smokePool[i];
      if (!p.active) continue;

      p.age += delta;
      // After the ~9s explosion action ends, let designated floor haze linger softly across vestibule
      if (!p.ambientHaze && p.age >= p.life) {
        p.active = false;
        p.mat.opacity = 0;
        p.mesh.visible = false;
        continue;
      }

      activeCount++;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;

      // Light drag keeps plumes churning across the entire 9s window without stalling at t=3s
      const drag = Math.exp(-delta * 0.18);
      p.vx *= drag;
      p.vy *= Math.exp(-delta * 0.24);
      p.vz *= drag;
      p.rot += p.rotVel * delta;

      // Fast initial expansion into thick cloud volume over the first ~1.6s, holding full volume afterward
      const expandFrac = Math.min(1.0, p.age / 1.6);
      const scale = p.startScale + (p.endScale - p.startScale) * (1.0 - Math.pow(1.0 - expandFrac, 1.8));

      // Hard-contain the entire visible puff radius inside vestibule walls (-14.18..-10.24, Y 0.04..3.76, Z 1.24..11.26)
      // Since _smokeTex drops to 0.0 alpha inside r = 0.4375 * scale, rMargin = 0.45 * scale + 0.03 keeps 100% of pixels inside
      const rMargin = Math.min(scale * 0.45 + 0.03, 1.82);
      const minX = -14.18 + rMargin;
      const maxX = -10.24 - rMargin;
      const minY = 0.04 + rMargin;
      const maxY = 3.76 - rMargin;
      const minZ = 1.24 + rMargin;
      const maxZ = 11.26 - rMargin;

      if (p.x < minX) {
        p.x = minX;
        p.vx = Math.abs(p.vx) * 0.45;
      } else if (p.x > maxX) {
        p.x = maxX;
        p.vx = -Math.abs(p.vx) * 0.45;
      }
      if (p.y < minY) {
        p.y = minY;
        p.vy = Math.abs(p.vy) * 0.35;
      } else if (p.y > maxY) {
        p.y = maxY;
        p.vy = -Math.abs(p.vy) * 0.30;
      }
      if (p.z < minZ) {
        p.z = minZ;
        p.vz = Math.abs(p.vz) * 0.40;
      } else if (p.z > maxZ) {
        p.z = maxZ;
        p.vz = -Math.abs(p.vz) * 0.40;
      }

      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.scale.set(scale, scale, 1);

      let alpha;
      if (p.age < 0.35) {
        // Snap rapidly into full engulfing blast smoke
        alpha = p.peakOpacity * (p.age / 0.35);
      } else if (this._explosionTimer <= BUILDING_EXPLOSION_DURATION_SECONDS) {
        // Keep the entire vestibule solidly engulfed for the full 9.0s action beat
        const churn = 0.90 + 0.10 * Math.sin(p.age * 1.9 + p.rot);
        alpha = p.peakOpacity * churn;
      } else {
        // Smooth fade out after the 9.0s action beat ends (9.0s -> 13.5s)
        const postT = this._explosionTimer - BUILDING_EXPLOSION_DURATION_SECONDS;
        const fadeDur = 4.5 + (i % 4) * 0.45;
        const fadeFrac = Math.min(1.0, postT / fadeDur);
        alpha = p.peakOpacity * Math.pow(Math.max(0, 1.0 - fadeFrac), 1.45);
        if (alpha <= 0.005) {
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
      }

      p.mat.opacity = alpha;
      if (this.camera) {
        p.mesh.quaternion.copy(this.camera.quaternion);
        p.mesh.rotateZ(p.rot);
      }
    }
    this._smokeActiveCount = activeCount;
  }

  _updateDebrisPhysics(delta) {
    if (this._debrisAllSettled || !this._debrisItems) return;

    const dt = Math.min(delta, 0.05);
    let concreteDirty = false;
    let plasterDirty = false;
    let anyUnsettled = false;

    for (let i = 0; i < this._debrisItems.length; i++) {
      const d = this._debrisItems[i];
      if (!d.active) continue;
      if (d.settled) continue;

      anyUnsettled = true;
      d.vy -= 14.5 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;

      d.rx += d.avx * dt;
      d.ry += d.avy * dt;
      d.rz += d.avz * dt;

      // Keep inside vestibule boundaries
      if (d.x < -14.08) {
        d.x = -14.08;
        d.vx = Math.abs(d.vx) * 0.45;
      } else if (d.x > -10.35) {
        d.x = -10.35;
        d.vx = -Math.abs(d.vx) * 0.45;
      }
      if (d.z > 11.08) {
        d.z = 11.08;
        d.vz = -Math.abs(d.vz) * 0.40;
      } else if (d.z < 7.46 && d.y <= d.restY + 0.15) {
        // Reflect slightly forward onto landing lip so debris collects visibly on floor
        d.z = 7.46;
        d.vz = Math.abs(d.vz) * 0.45;
      }

      // Floor collision against black marble floor (Y = 0.0)
      if (d.y <= d.restY) {
        d.y = d.restY;
        if (Math.abs(d.vy) < 0.45) {
          d.vx = 0;
          d.vy = 0;
          d.vz = 0;
          d.avx = 0;
          d.avy = 0;
          d.avz = 0;
          if (!d.isConcrete) {
            // Flat ceiling tile shard settles relatively flat on marble surface
            d.rx *= 0.12;
            d.rz *= 0.12;
          }
          d.settled = true;
        } else {
          d.vy = Math.abs(d.vy) * 0.30;
          d.vx *= 0.62;
          d.vz *= 0.62;
          d.avx *= 0.50;
          d.avy *= 0.50;
          d.avz *= 0.50;
        }
      }

      this._dummyObj.position.set(d.x, d.y, d.z);
      this._dummyObj.rotation.set(d.rx, d.ry, d.rz);
      this._dummyObj.scale.set(d.sx, d.sy, d.sz);
      this._dummyObj.updateMatrix();

      if (d.isConcrete) {
        this._concreteInstanced.setMatrixAt(d.instIdx, this._dummyObj.matrix);
        concreteDirty = true;
      } else {
        this._plasterInstanced.setMatrixAt(d.instIdx, this._dummyObj.matrix);
        plasterDirty = true;
      }
    }

    if (concreteDirty && this._concreteInstanced) {
      this._concreteInstanced.instanceMatrix.needsUpdate = true;
    }
    if (plasterDirty && this._plasterInstanced) {
      this._plasterInstanced.instanceMatrix.needsUpdate = true;
    }

    if (!anyUnsettled) {
      this._debrisAllSettled = true;
    }
  }

  _updateBuildingExplosion(delta) {
    this._explosionTimer += delta;

    // Metallic stanchion floor-impact clatter synced with topple arc hitting marble floor
    if (!this._stanchionClatterPlayed && this._explosionTimer >= 0.30) {
      this._stanchionClatterPlayed = true;
      if (this.sound && typeof this.sound.playStanchionToppleClatter === 'function') {
        this.sound.playStanchionToppleClatter();
      }
    }

    // Secondary & heavy collapse explosion pulse waves (2.5s & 4.6s within 9.0s action beat)
    if (!this._explosionWave2Triggered && this._explosionTimer >= 2.5) {
      this._explosionWave2Triggered = true;
      this._launchSmokeWave(2);
      this._launchDebrisWave(16, 26, 0.95);
    }
    if (!this._explosionWave3Triggered && this._explosionTimer >= 4.6) {
      this._explosionWave3Triggered = true;
      this._launchSmokeWave(3);
      this._launchDebrisWave(26, 36, 1.12);
    }
    if (!this._combatUnlocked && this._explosionTimer >= COMBAT_UNLOCK_EXPLOSION_TIME_SECONDS) {
      this._combatUnlocked = true;
      this._combatTutorialVisible = true;
      this._combatTutorialTimer = 0;
      this._combatEquipDetected = !!(this.weaponSystem && !this.weaponSystem.isUnarmed);
      this._postEquipTutorialTimer = 0;

      if (this.weaponSystem) {
        if (typeof this.weaponSystem.unlockWeapon === 'function') {
          this.weaponSystem.unlockWeapon('usp');
        } else if (typeof this.weaponSystem.unlockStartingPistol === 'function') {
          this.weaponSystem.unlockStartingPistol();
        }
      }
      if (typeof window !== 'undefined' && window.__rocWeaponWheel) {
        window.__rocWeaponWheel.refreshVisuals();
      }
      if (this.hud && typeof this.hud.showCombatTutorialBar === 'function') {
        this.hud.showCombatTutorialBar(true);
      }
    }
    if (this._combatTutorialVisible) {
      this._combatTutorialTimer += delta;
      if (!this._combatEquipDetected && this.weaponSystem && !this.weaponSystem.isUnarmed) {
        this._combatEquipDetected = true;
        this._postEquipTutorialTimer = 0;
      } else if (this._combatEquipDetected) {
        this._postEquipTutorialTimer += delta;
      }

      const expiredTotal = this._combatTutorialTimer >= COMBAT_TUTORIAL_MIN_DURATION_SECONDS;
      const expiredAfterEquip = !this._combatEquipDetected || this._postEquipTutorialTimer >= COMBAT_TUTORIAL_POST_EQUIP_SECONDS;
      if (expiredTotal && expiredAfterEquip) {
        this._combatTutorialVisible = false;
        if (this.hud) {
          this.hud.setTutorialVisible(false);
        }
      }
    }
    if (!this._explosionFadeTriggered && this._explosionTimer >= 7.9) {
      this._explosionFadeTriggered = true;
      if (this.sound && typeof this.sound.fadeOutBuildingExplosion === 'function') {
        this.sound.fadeOutBuildingExplosion(1.1);
      }
    }
    if (!this._explosionAudioStopped && this._explosionTimer >= 9.2) {
      this._explosionAudioStopped = true;
      if (this.sound && typeof this.sound.stopBuildingExplosion === 'function') {
        this.sound.stopBuildingExplosion();
      }
    }
    if (!this._wave1Triggered && this._explosionTimer >= BUILDING_EXPLOSION_DURATION_SECONDS) {
      this._wave1Triggered = true;
      if (this.zombieManager && typeof this.zombieManager.triggerWave1 === 'function') {
        this.zombieManager.triggerWave1();
      }
    }

    // Animate toppling stairwell stanchions until settled
    if (this.warehouse && this.warehouse.stairwellStanchions) {
      this.warehouse.stairwellStanchions.update(delta);
    }

    // Update spatial audio & procedural stronger camera tremor over 9.0s action window
    if (this.camera) {
      this._toBlast.set(
        STAIRWELL_BLAST_POS.x - this.camera.position.x,
        STAIRWELL_BLAST_POS.y - this.camera.position.y,
        STAIRWELL_BLAST_POS.z - this.camera.position.z
      );
      const distance = this._toBlast.length();
      let pan = 0;
      if (distance > 0.001) {
        const invDist = 1.0 / distance;
        this._camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        pan = (this._camRight.x * this._toBlast.x + this._camRight.z * this._toBlast.z) * invDist;
      }

      const posRef = this.player ? this.player.position : this.camera.position;
      const inMainOffice = posRef.x > -9.9;

      if (this.sound && typeof this.sound.updateBuildingExplosionSpatial === 'function') {
        this.sound.updateBuildingExplosionSpatial(distance, pan, inMainOffice);
      }

      if (this._explosionTimer < BUILDING_EXPLOSION_DURATION_SECONDS) {
        const rawAmp = this._computeWaveformShakeAmplitude(this._explosionTimer);
        const proxScale = inMainOffice
          ? Math.max(0.72, 1.05 - Math.max(0, distance - 8.0) * 0.024)
          : Math.min(1.32, 1.12 + Math.max(0, 6.0 - distance) * 0.032);
        const amp = rawAmp * proxScale;

        if (amp > 0.001) {
          const t = this._explosionTimer;
          const rollWave = Math.sin(t * 23.4) * 0.55 + Math.cos(t * 38.7) * 0.45;
          const heaveWave = Math.sin(t * 18.6 + 0.9) * 0.60 + Math.sin(t * 45.2) * 0.40;
          const lateralWave = Math.cos(t * 20.5 + 1.4) * 0.55 + Math.sin(t * 33.9) * 0.45;

          this._camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
          this._camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);

          this.camera.position.addScaledVector(this._camRight, lateralWave * 0.024 * amp);
          this.camera.position.addScaledVector(this._camUp, heaveWave * 0.029 * amp);

          this.camera.rotation.x += heaveWave * 0.0125 * amp;
          this.camera.rotation.z += rollWave * 0.0275 * amp;
        }
      }
    }

    this._updateSmokePool(delta);
    this._updateDebrisPhysics(delta);
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
    if (
      !this.tutorialDismissed &&
      this.state !== INTRO_STATES.PHONE_ANSWERED &&
      this.state !== INTRO_STATES.CALL_ENDED &&
      this.state !== INTRO_STATES.BUILDING_EXPLOSION
    ) {
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
    } else if (this.state === INTRO_STATES.CALL_ENDED) {
      this._callEndedTimer += delta;
      if (this._callEndedTimer >= POST_CALL_EXPLOSION_DELAY_SECONDS) {
        this._triggerBuildingExplosion();
      }
    } else if (this.state === INTRO_STATES.BUILDING_EXPLOSION) {
      this._updateBuildingExplosion(delta);
    }
  }

  setZombieManager(zombieManager) {
    this.zombieManager = zombieManager;
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
    this._callEndedTimer = 0;
    this._explosionTimer = 0;
    this._explosionWave2Triggered = false;
    this._explosionWave3Triggered = false;
    this._explosionFadeTriggered = false;
    this._explosionAudioStopped = false;
    this._stanchionClatterPlayed = false;
    this._wave1Triggered = false;
    this._combatUnlocked = false;
    this._combatTutorialVisible = false;
    this._combatTutorialTimer = 0;
    this._combatEquipDetected = false;
    this._postEquipTutorialTimer = 0;

    if (this.player && typeof this.player.setJumpSuppressed === 'function') {
      this.player.setJumpSuppressed(false);
    }
    if (this.sound) {
      this.sound.stopPhoneRingtone();
      if (typeof this.sound.stopBuildingExplosion === 'function') {
        this.sound.stopBuildingExplosion();
      }
      if (typeof this.sound.stopAllZombieVocals === 'function') {
        this.sound.stopAllZombieVocals();
      }
    }
    if (this.arrowMesh) {
      this.arrowMesh.visible = false;
    }

    this._hideAllDebris();
    this._hideAllSmoke();
    if (this.warehouse && this.warehouse.stairwellStanchions) {
      this.warehouse.stairwellStanchions.resetStairwellStanchions();
    }

    this._resetPhoneToIdle();

    if (this.hud) {
      if (typeof this.hud.resetTutorialBar === 'function') {
        this.hud.resetTutorialBar();
      }
      this.hud.setTutorialVisible(false, true);
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

    if (this.weaponSystem) {
      if (typeof this.weaponSystem.lockAllWeapons === 'function') {
        this.weaponSystem.lockAllWeapons();
      }
      if (typeof this.weaponSystem.setUnarmed === 'function') {
        this.weaponSystem.setUnarmed(true);
      }
    }
    this.spawnInElevator(true);
  }
}
