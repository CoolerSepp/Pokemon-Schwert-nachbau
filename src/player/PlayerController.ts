import * as THREE from 'three';
import { GameConfig } from '@/core/Config';
import { clamp, damp, moveTowardsAngle, wrapAngle } from '@/core/MathUtils';
import type { InputManager } from '@/engine/InputManager';
import type { AssetManager } from '@/engine/AssetManager';
import type { AreaRuntime } from '@/world/AreaRuntime';
import { buildHumanoid, type HumanoidModel } from './PlayerModel';
import { HumanoidAnimator } from './HumanoidAnimator';
import type { NpcAppearance } from '@/data/schema';

export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  facing: number;
  speed: number;
  grounded: boolean;
  inTallGrass: boolean;
  /** Zurueckgelegte Strecke seit dem Start - fuer Schutzspray und Ei-Logik. */
  distanceWalked: number;
}

/**
 * Third-Person-Spielersteuerung.
 *
 * Bewegung ist kamerarelativ mit weicher Beschleunigung und Abbremsung;
 * Kollision wird ueber das Belegungsgitter aufgeloest, Hoehen ueber das
 * Hoehenfeld abgetastet. Kleine Hoehenunterschiede (Stufen) werden
 * automatisch ueberwunden, zu steile Haenge blockieren.
 */
export class PlayerController {
  readonly model: HumanoidModel;
  readonly animator: HumanoidAnimator;
  readonly object: THREE.Group;

  private position = new THREE.Vector3();
  private velocity = new THREE.Vector2();
  private verticalVelocity = 0;
  private facing = 0;
  private targetFacing = 0;
  private grounded = true;
  private area: AreaRuntime | null = null;
  private controlEnabled = true;
  private distanceWalked = 0;
  private inTallGrass = false;
  private grassTimer = 0;
  private canRun = true;
  private speedBonusValue = 1;
  private readonly tmpVec = new THREE.Vector3();

  constructor(
    assets: AssetManager,
    private readonly input: InputManager,
    appearance?: Partial<NpcAppearance>,
  ) {
    this.model = buildHumanoid(assets, appearance);
    this.animator = new HumanoidAnimator(this.model);
    this.object = this.model.root;
    this.object.name = 'player';
  }

  // ---------------------------------------------------------------- Zustand

  get x(): number { return this.position.x; }
  get y(): number { return this.position.y; }
  get z(): number { return this.position.z; }
  get yaw(): number { return this.facing; }
  get speed(): number { return this.velocity.length(); }
  get isGrounded(): boolean { return this.grounded; }
  get isInTallGrass(): boolean { return this.inTallGrass; }
  get walkedDistance(): number { return this.distanceWalked; }

  get snapshot(): PlayerSnapshot {
    return {
      x: this.position.x, y: this.position.y, z: this.position.z,
      facing: this.facing, speed: this.speed, grounded: this.grounded,
      inTallGrass: this.inTallGrass, distanceWalked: this.distanceWalked,
    };
  }

  setArea(area: AreaRuntime): void {
    this.area = area;
  }

  setRunUnlocked(unlocked: boolean): void {
    this.canRun = unlocked;
  }

  /** Zusaetzlicher Geschwindigkeitsfaktor (Gelaenderad). */
  setSpeedBonus(factor: number): void {
    this.speedBonus = Math.max(0.5, Math.min(2.5, factor));
  }

  get speedBonus(): number { return this.speedBonusValue; }
  private set speedBonus(value: number) { this.speedBonusValue = value; }

  setControlEnabled(enabled: boolean): void {
    this.controlEnabled = enabled;
    if (!enabled) {
      this.velocity.set(0, 0);
      this.animator.setLocomotion(0);
    }
  }

  get isControlEnabled(): boolean { return this.controlEnabled; }

  /** Setzt den Spieler an eine Position und richtet ihn aus. */
  teleport(x: number, z: number, facing = this.facing): void {
    const area = this.area;
    const safe = area
      ? area.collision.findFreeNear(x, z, GameConfig.player.radius)
      : [x, z];
    this.position.set(safe[0], area?.heightAt(safe[0], safe[1]) ?? 0, safe[1]);
    this.facing = facing;
    this.targetFacing = facing;
    this.velocity.set(0, 0);
    this.verticalVelocity = 0;
    this.grounded = true;
    this.syncObject();
  }

  /** Dreht den Spieler zu einem Punkt (fuer Dialoge/Cutscenes). */
  faceTowards(x: number, z: number): void {
    this.targetFacing = Math.atan2(x - this.position.x, z - this.position.z);
  }

  /** Bewegt den Spieler skriptgesteuert zu einem Ziel; liefert true bei Ankunft. */
  moveTo(x: number, z: number, dt: number, run = false): boolean {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.22) {
      this.velocity.set(0, 0);
      this.animator.setLocomotion(0);
      return true;
    }
    const speed = run ? GameConfig.player.runSpeed : GameConfig.player.walkSpeed;
    this.velocity.set((dx / dist) * speed, (dz / dist) * speed);
    this.targetFacing = Math.atan2(dx, dz);
    this.integrate(dt);
    return false;
  }

  // ----------------------------------------------------------------- Update

  update(dt: number, cameraYaw: number): void {
    if (this.controlEnabled) this.readInput(dt, cameraYaw);
    this.integrate(dt);
    this.updateGrassState(dt);
    this.animator.setLocomotion(this.velocity.length());
    this.animator.update(dt);
  }

  private readInput(dt: number, cameraYaw: number): void {
    const axis = this.input.getMoveAxis();
    const wantsRun = this.canRun && this.input.isDown('sprint');
    const maxSpeed = (wantsRun ? GameConfig.player.runSpeed : GameConfig.player.walkSpeed)
      * this.speedBonusValue;

    if (axis.x !== 0 || axis.y !== 0) {
      // Eingabe ist kamerarelativ: "vorwaerts" heisst immer "weg von der Kamera".
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      const dirX = axis.x * cos + axis.y * sin;
      const dirZ = -axis.x * sin + axis.y * cos;
      const len = Math.hypot(dirX, dirZ) || 1;
      const targetX = (dirX / len) * maxSpeed;
      const targetZ = (dirZ / len) * maxSpeed;
      const accel = GameConfig.player.acceleration * dt;
      this.velocity.x += clamp(targetX - this.velocity.x, -accel, accel);
      this.velocity.y += clamp(targetZ - this.velocity.y, -accel, accel);
      this.targetFacing = Math.atan2(dirX, dirZ);
    } else {
      const decel = GameConfig.player.deceleration * dt;
      const speed = this.velocity.length();
      if (speed <= decel) this.velocity.set(0, 0);
      else this.velocity.multiplyScalar((speed - decel) / speed);
    }

    if (this.input.wasPressed('jump') && this.grounded) {
      this.verticalVelocity = GameConfig.player.jumpVelocity;
      this.grounded = false;
    }
  }

  private integrate(dt: number): void {
    const area = this.area;
    if (!area) return;

    const prevX = this.position.x;
    const prevZ = this.position.z;
    let nextX = prevX + this.velocity.x * dt;
    let nextZ = prevZ + this.velocity.y * dt;

    // Kollision gegen das Belegungsgitter aufloesen.
    const resolved = area.collision.resolveCircle(nextX, nextZ, GameConfig.player.radius);
    nextX = resolved[0];
    nextZ = resolved[1];

    // Zu steile Haenge blockieren, kleine Stufen werden ueberwunden.
    const groundHere = area.heightAt(prevX, prevZ);
    const groundThere = area.heightAt(nextX, nextZ);
    const rise = groundThere - groundHere;
    const run = Math.hypot(nextX - prevX, nextZ - prevZ);
    if (run > 1e-4 && rise > 0) {
      const slope = rise / run;
      const maxSlope = Math.tan(Math.acos(GameConfig.player.maxSlopeCos));
      if (slope > maxSlope && rise > GameConfig.player.stepHeight) {
        nextX = prevX;
        nextZ = prevZ;
        this.velocity.multiplyScalar(0.25);
      }
    }

    this.position.x = nextX;
    this.position.z = nextZ;
    const movedDistance = Math.hypot(nextX - prevX, nextZ - prevZ);
    this.distanceWalked += movedDistance;

    // Vertikale Bewegung: Schwerkraft und Bodenkontakt.
    const ground = area.heightAt(this.position.x, this.position.z);
    if (!this.grounded) {
      this.verticalVelocity = Math.max(
        GameConfig.player.maxFallSpeed,
        this.verticalVelocity + GameConfig.player.gravity * dt,
      );
      this.position.y += this.verticalVelocity * dt;
      if (this.position.y <= ground) {
        this.position.y = ground;
        this.verticalVelocity = 0;
        this.grounded = true;
      }
    } else {
      const drop = this.position.y - ground;
      if (drop > GameConfig.player.stepHeight * 1.6) {
        // Der Boden ist deutlich tiefer: fallen lassen.
        this.grounded = false;
        this.verticalVelocity = 0;
      } else {
        // Sanft an die Bodenhoehe anpassen (weiche Stufen).
        this.position.y = damp(this.position.y, ground, 0.035, dt);
      }
    }

    // Ausrichtung weich nachfuehren.
    const turnStep = GameConfig.player.turnSpeed * dt;
    this.facing = moveTowardsAngle(this.facing, this.targetFacing, turnStep);
    this.syncObject();
  }

  private updateGrassState(dt: number): void {
    const area = this.area;
    if (!area) return;
    const inGrass = area.isInGrassZone(this.position.x, this.position.z);
    if (inGrass !== this.inTallGrass) {
      this.inTallGrass = inGrass;
      this.grassTimer = 0;
    }
    this.grassTimer += dt;
  }

  private syncObject(): void {
    this.object.position.copy(this.position);
    this.object.rotation.y = this.facing;
  }

  /** Punkt vor dem Spieler - fuer Interaktionsabfragen. */
  getInteractPoint(distance: number = GameConfig.player.interactRange * 0.6): THREE.Vector3 {
    return this.tmpVec.set(
      this.position.x + Math.sin(this.facing) * distance,
      this.position.y + 1,
      this.position.z + Math.cos(this.facing) * distance,
    );
  }

  /** Prueft, ob ein Weltpunkt im Interaktionskegel liegt. */
  canInteractWith(x: number, z: number, range: number = GameConfig.player.interactRange): boolean {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range) return false;
    if (dist < 0.4) return true;
    const angle = Math.atan2(dx, dz);
    return Math.abs(wrapAngle(angle - this.facing)) < Math.acos(GameConfig.player.interactAngleCos);
  }

  serialize(): { x: number; z: number; facing: number; distance: number } {
    return {
      x: this.position.x, z: this.position.z,
      facing: this.facing, distance: this.distanceWalked,
    };
  }

  deserialize(state: { x: number; z: number; facing: number; distance: number }): void {
    this.teleport(state.x, state.z, state.facing);
    this.distanceWalked = state.distance;
  }
}
