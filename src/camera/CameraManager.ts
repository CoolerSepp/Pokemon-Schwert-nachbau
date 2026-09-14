import * as THREE from 'three';
import { GameConfig } from '@/core/Config';
import { clamp, damp, dampAngle, easeInOutCubic, wrapAngle } from '@/core/MathUtils';
import type { InputManager } from '@/engine/InputManager';
import type { CollisionGrid } from '@/world/CollisionGrid';

export type CameraMode = 'follow' | 'cinematic' | 'battle' | 'fixed' | 'lockOn';

interface CinematicKey {
  position: THREE.Vector3;
  target: THREE.Vector3;
  duration: number;
  ease: boolean;
}

/**
 * Third-Person-Kamera mit Kollision, weichem Nachfuehren und Cinematic-Modus.
 *
 * Im Follow-Modus orbitiert die Kamera um den Spieler; bei Storyereignissen
 * uebernimmt der Cinematic-Modus vollstaendig (Anforderung 5).
 */
export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  private mode: CameraMode = 'follow';
  private yaw = 0;
  private pitch: number = GameConfig.camera.defaultPitch;
  private distance: number = GameConfig.camera.distance;
  private targetDistance: number = GameConfig.camera.distance;
  private readonly focus = new THREE.Vector3();
  private readonly smoothFocus = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private sensitivity = 1;
  /** Obergrenze fuer die Kamerahoehe (Innenraeume mit Decke). */
  private ceilingHeight: number | null = null;
  private invertY = false;
  private shakeAmount = 0;
  private shakeTime = 0;
  private shakeDecay = 1;
  private readonly shakeOffset = new THREE.Vector3();

  private cinematicKeys: CinematicKey[] = [];
  private cinematicIndex = 0;
  private cinematicTime = 0;
  private cinematicFrom = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private cinematicDone: (() => void) | null = null;
  private lockOnTarget: THREE.Object3D | null = null;
  /** Zielwinkel beim Zuruecksetzen hinter die Figur; null = kein Zuruecksetzen. */
  private recenterYaw: number | null = null;

  constructor(aspect: number, private readonly input: InputManager) {
    this.camera = new THREE.PerspectiveCamera(
      GameConfig.camera.fov, aspect,
      GameConfig.camera.near, GameConfig.camera.far,
    );
    this.camera.position.set(0, 6, -8);
  }

  get currentMode(): CameraMode { return this.mode; }
  get yawAngle(): number { return this.yaw; }
  get pitchAngle(): number { return this.pitch; }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setSensitivity(value: number): void { this.sensitivity = clamp(value, 0.1, 4); }

  /**
   * Schwenkt die Kamera weich hinter die Figur.
   *
   * Bei freier 360-Grad-Sicht verliert man leicht die Orientierung; ein
   * Tastendruck stellt die gewohnte Ansicht wieder her, ohne zu springen.
   */
  recenterBehind(facing: number): void {
    this.recenterYaw = wrapAngle(facing);
  }

  /**
   * Begrenzt die Kamerahoehe, damit sie in Innenraeumen nicht durch die Decke
   * stoesst. `null` hebt die Begrenzung auf (Aussenbereiche).
   */
  setCeiling(height: number | null): void { this.ceilingHeight = height; }

  /**
   * Bodenhoehe an einer Stelle - die Kamera bleibt darueber.
   *
   * Das Belegungsgitter kennt nur Hindernisse, kein Gelaende. Ohne diese
   * Abfrage taucht die Kamera an jedem Hang in den Boden ein und man sieht
   * die Erde von innen. Setzt der Aufrufer nichts, bleibt es beim alten
   * Verhalten.
   */
  groundAt: ((x: number, z: number) => number) | null = null;
  setInvertY(value: boolean): void { this.invertY = value; }
  setMode(mode: CameraMode): void { this.mode = mode; }

  setFarPlane(distance: number): void {
    this.camera.far = distance;
    this.camera.updateProjectionMatrix();
  }

  /** Setzt die Kamera hinter ein Ziel, ohne Ueberblendung. */
  snapBehind(x: number, y: number, z: number, facing: number): void {
    this.recenterYaw = null;
    this.yaw = facing;
    this.focus.set(x, y + GameConfig.camera.height, z);
    this.smoothFocus.copy(this.focus);
    this.updateDesiredPosition();
    this.camera.position.copy(this.desiredPosition);
    this.smoothLook.copy(this.focus);
    this.camera.lookAt(this.smoothLook);
  }

  shake(intensity: number, duration: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
    this.shakeDecay = duration;
  }

  lockOn(target: THREE.Object3D | null): void {
    this.lockOnTarget = target;
    this.mode = target ? 'lockOn' : 'follow';
  }

  /** Startet eine Kamerafahrt; `onDone` wird nach dem letzten Schritt gerufen. */
  playCinematic(keys: CinematicKey[], onDone?: () => void): void {
    if (keys.length === 0) {
      onDone?.();
      return;
    }
    this.mode = 'cinematic';
    this.cinematicKeys = keys;
    this.cinematicIndex = 0;
    this.cinematicTime = 0;
    this.cinematicFrom.position.copy(this.camera.position);
    this.cinematicFrom.target.copy(this.smoothLook);
    this.cinematicDone = onDone ?? null;
  }

  stopCinematic(): void {
    this.cinematicKeys = [];
    this.cinematicDone = null;
    if (this.mode === 'cinematic') this.mode = 'follow';
  }

  /** Einzelne Kamerafahrt zu Position/Ziel. */
  moveTo(position: THREE.Vector3, target: THREE.Vector3, seconds: number, ease = true, onDone?: () => void): void {
    this.playCinematic([{
      position: position.clone(), target: target.clone(),
      duration: Math.max(0.01, seconds), ease,
    }], onDone);
  }

  update(
    dt: number, focusX: number, focusY: number, focusZ: number,
    collision: CollisionGrid | null, allowInput: boolean,
  ): void {
    if (this.mode === 'cinematic') {
      this.updateCinematic(dt);
      this.applyShake(dt);
      return;
    }

    if (allowInput) {
      const look = this.input.getLookDelta(dt, this.sensitivity);
      // Eigene Eingabe hat Vorrang: sie bricht ein laufendes Zuruecksetzen ab.
      if (look.x !== 0 || look.y !== 0) this.recenterYaw = null;
      this.yaw = wrapAngle(this.yaw - look.x);
      this.pitch = clamp(
        this.pitch + (this.invertY ? -look.y : look.y),
        GameConfig.camera.pitchMin, GameConfig.camera.pitchMax,
      );
      this.targetDistance = clamp(
        this.targetDistance + this.input.getZoomDelta(dt),
        GameConfig.camera.minDistance, GameConfig.camera.maxDistance,
      );
    }

    this.focus.set(focusX, focusY + GameConfig.camera.height, focusZ);
    this.smoothFocus.x = damp(this.smoothFocus.x, this.focus.x, GameConfig.camera.positionHalfLife, dt);
    this.smoothFocus.y = damp(this.smoothFocus.y, this.focus.y, GameConfig.camera.positionHalfLife * 1.8, dt);
    this.smoothFocus.z = damp(this.smoothFocus.z, this.focus.z, GameConfig.camera.positionHalfLife, dt);

    if (this.recenterYaw !== null) {
      this.yaw = dampAngle(this.yaw, this.recenterYaw, 0.1, dt);
      if (Math.abs(wrapAngle(this.recenterYaw - this.yaw)) < 0.02) {
        this.yaw = this.recenterYaw;
        this.recenterYaw = null;
      }
    }

    if (this.mode === 'lockOn' && this.lockOnTarget) {
      // Blickrichtung auf das Ziel ausrichten, Abstand beibehalten.
      const targetPos = this.lockOnTarget.getWorldPosition(new THREE.Vector3());
      const dx = targetPos.x - this.smoothFocus.x;
      const dz = targetPos.z - this.smoothFocus.z;
      const desiredYaw = Math.atan2(dx, dz) + Math.PI;
      this.yaw = dampAngle(this.yaw, desiredYaw, 0.16, dt);
    }

    this.distance = damp(this.distance, this.targetDistance, 0.12, dt);
    this.updateDesiredPosition();
    if (collision) this.resolveCollision(collision);
    this.resolveGround();
    if (this.ceilingHeight !== null) {
      this.desiredPosition.y = Math.min(this.desiredPosition.y, this.ceilingHeight);
    }

    this.camera.position.x = damp(this.camera.position.x, this.desiredPosition.x, GameConfig.camera.rotationHalfLife, dt);
    this.camera.position.y = damp(this.camera.position.y, this.desiredPosition.y, GameConfig.camera.rotationHalfLife, dt);
    this.camera.position.z = damp(this.camera.position.z, this.desiredPosition.z, GameConfig.camera.rotationHalfLife, dt);

    this.lookTarget.copy(this.smoothFocus);
    this.smoothLook.x = damp(this.smoothLook.x, this.lookTarget.x, 0.05, dt);
    this.smoothLook.y = damp(this.smoothLook.y, this.lookTarget.y, 0.05, dt);
    this.smoothLook.z = damp(this.smoothLook.z, this.lookTarget.z, 0.05, dt);
    this.camera.lookAt(this.smoothLook);
    this.applyShake(dt);
  }

  private updateDesiredPosition(): void {
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.desiredPosition.set(
      this.smoothFocus.x - Math.sin(this.yaw) * horizontal,
      this.smoothFocus.y + Math.sin(this.pitch) * this.distance,
      this.smoothFocus.z - Math.cos(this.yaw) * horizontal,
    );
  }

  /**
   * Verkuerzt den Kameraabstand, wenn eine Wand im Weg steht.
   * Abtastung entlang der Sichtlinie gegen das Belegungsgitter.
   */
  private resolveCollision(collision: CollisionGrid): void {
    const fx = this.smoothFocus.x;
    const fz = this.smoothFocus.z;
    const dx = this.desiredPosition.x - fx;
    const dz = this.desiredPosition.z - fz;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return;

    const steps = Math.max(4, Math.ceil(dist / 0.4));
    let allowed = dist;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * dist;
      const px = fx + (dx / dist) * t;
      const pz = fz + (dz / dist) * t;
      if (collision.isBlocked(px, pz)) {
        allowed = Math.max(GameConfig.camera.minDistance * 0.5,
          t - GameConfig.camera.collisionPadding);
        break;
      }
    }
    if (allowed < dist) {
      const scale = allowed / dist;
      this.desiredPosition.x = fx + dx * scale;
      this.desiredPosition.z = fz + dz * scale;
      const heightDiff = this.desiredPosition.y - this.smoothFocus.y;
      this.desiredPosition.y = this.smoothFocus.y + heightDiff * scale;
    }
  }

  /**
   * Haelt die Kamera ueber dem Gelaende.
   *
   * Erst wird die Sichtlinie vom Spieler zur Kamera gegen das Hoehenfeld
   * geprueft: steigt der Boden dazwischen an, rueckt die Kamera naeher
   * heran. Danach wird die Hoehe hart auf den Boden begrenzt. Ohne beides
   * steckte die Kamera an jedem Hang im Berg - man sah eine braune Flaeche
   * statt der Landschaft, und der Anstieg auf Route 1 war unspielbar.
   */
  private resolveGround(): void {
    if (!this.groundAt) return;
    const clearance = GameConfig.camera.groundClearance;
    const fx = this.smoothFocus.x;
    const fy = this.smoothFocus.y;
    const fz = this.smoothFocus.z;
    const dx = this.desiredPosition.x - fx;
    const dy = this.desiredPosition.y - fy;
    const dz = this.desiredPosition.z - fz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.05) return;

    const steps = Math.max(4, Math.ceil(dist / 0.5));
    let allowed = 1;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const py = fy + dy * t;
      if (py < this.groundAt(fx + dx * t, fz + dz * t) + clearance) {
        allowed = Math.max(0.28, (i - 1) / steps);
        break;
      }
    }
    if (allowed < 1) {
      this.desiredPosition.set(fx + dx * allowed, fy + dy * allowed, fz + dz * allowed);
    }
    const floor = this.groundAt(this.desiredPosition.x, this.desiredPosition.z) + clearance;
    if (this.desiredPosition.y < floor) this.desiredPosition.y = floor;
  }

  private updateCinematic(dt: number): void {
    const key = this.cinematicKeys[this.cinematicIndex];
    if (!key) {
      const cb = this.cinematicDone;
      this.cinematicDone = null;
      this.cinematicKeys = [];
      this.mode = 'follow';
      cb?.();
      return;
    }
    this.cinematicTime += dt;
    const raw = clamp(this.cinematicTime / key.duration, 0, 1);
    const t = key.ease ? easeInOutCubic(raw) : raw;

    this.camera.position.lerpVectors(this.cinematicFrom.position, key.position, t);
    this.smoothLook.lerpVectors(this.cinematicFrom.target, key.target, t);
    this.camera.lookAt(this.smoothLook);

    if (raw >= 1) {
      this.cinematicFrom.position.copy(key.position);
      this.cinematicFrom.target.copy(key.target);
      this.cinematicIndex++;
      this.cinematicTime = 0;
    }
  }

  private applyShake(dt: number): void {
    if (this.shakeTime <= 0) return;
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    const falloff = this.shakeDecay > 0 ? this.shakeTime / this.shakeDecay : 0;
    const amount = this.shakeAmount * falloff * falloff;
    this.shakeOffset.set(
      (Math.random() - 0.5) * amount,
      (Math.random() - 0.5) * amount,
      (Math.random() - 0.5) * amount,
    );
    this.camera.position.add(this.shakeOffset);
    if (this.shakeTime <= 0) this.shakeAmount = 0;
  }

  /** Positioniert die Kamera fuer eine Kampfszene. */
  setupBattleView(center: THREE.Vector3, distance = 9, height = 4.2, angle = 0.35): void {
    this.mode = 'battle';
    this.camera.position.set(
      center.x + Math.sin(angle) * distance,
      center.y + height,
      center.z + Math.cos(angle) * distance,
    );
    this.smoothLook.copy(center);
    this.camera.lookAt(center);
  }

  /** Weiche Kamerabewegung im Kampf (ohne Cinematic-Zustand zu verlassen). */
  orbitBattleView(center: THREE.Vector3, distance: number, height: number, angle: number, dt: number): void {
    const target = new THREE.Vector3(
      center.x + Math.sin(angle) * distance,
      center.y + height,
      center.z + Math.cos(angle) * distance,
    );
    this.camera.position.x = damp(this.camera.position.x, target.x, 0.18, dt);
    this.camera.position.y = damp(this.camera.position.y, target.y, 0.18, dt);
    this.camera.position.z = damp(this.camera.position.z, target.z, 0.18, dt);
    this.smoothLook.x = damp(this.smoothLook.x, center.x, 0.14, dt);
    this.smoothLook.y = damp(this.smoothLook.y, center.y, 0.14, dt);
    this.smoothLook.z = damp(this.smoothLook.z, center.z, 0.14, dt);
    this.camera.lookAt(this.smoothLook);
    this.applyShake(dt);
  }
}

export type { CinematicKey };
