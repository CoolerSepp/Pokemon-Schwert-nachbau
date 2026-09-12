import * as THREE from 'three';
import { damp } from '@/core/MathUtils';
import type { HumanoidModel } from './PlayerModel';

export type HumanState =
  | 'idle' | 'walk' | 'run' | 'turn' | 'interact'
  | 'celebrate' | 'damage' | 'fall' | 'sit' | 'sleep' | 'throw';

interface Pose {
  armL: number; armR: number; legL: number; legR: number;
  torsoPitch: number; torsoRoll: number; headPitch: number; headYaw: number;
  hipY: number;
}

function pose(): Pose {
  return {
    armL: 0, armR: 0, legL: 0, legR: 0,
    torsoPitch: 0, torsoRoll: 0, headPitch: 0, headYaw: 0, hipY: 0,
  };
}

/**
 * Prozedurale Animation fuer Menschenmodelle.
 *
 * Gehen/Rennen werden aus einer Phasenfunktion erzeugt und weich ueberblendet;
 * einmalige Zustaende (Interagieren, Jubeln, Treffer) laufen ueber eine
 * normierte Fortschrittszeit ab.
 */
export class HumanoidAnimator {
  private state: HumanState = 'idle';
  private phase = 0;
  private stateTime = 0;
  private target = pose();
  private current = pose();
  private speed = 0;
  private readonly baseHipY: number;
  private onDone: (() => void) | null = null;

  constructor(private readonly model: HumanoidModel) {
    this.baseHipY = model.parts.hips.position.y;
  }

  get currentState(): HumanState { return this.state; }

  /** Setzt die Bewegungsgeschwindigkeit (m/s) und waehlt Gehen/Rennen. */
  setLocomotion(speedMetersPerSecond: number): void {
    this.speed = speedMetersPerSecond;
    if (this.isOneShot(this.state)) return;
    if (speedMetersPerSecond > 6) this.state = 'run';
    else if (speedMetersPerSecond > 0.35) this.state = 'walk';
    else this.state = 'idle';
  }

  play(state: HumanState, onDone?: () => void): void {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
    this.onDone = onDone ?? null;
  }

  private isOneShot(state: HumanState): boolean {
    return state === 'interact' || state === 'celebrate'
      || state === 'damage' || state === 'throw' || state === 'turn';
  }

  private duration(state: HumanState): number {
    switch (state) {
      case 'interact': return 0.7;
      case 'celebrate': return 1.6;
      case 'damage': return 0.5;
      case 'throw': return 0.8;
      case 'turn': return 0.4;
      default: return 0;
    }
  }

  update(dt: number): void {
    this.stateTime += dt;
    if (this.isOneShot(this.state) && this.stateTime >= this.duration(this.state)) {
      const cb = this.onDone;
      this.onDone = null;
      this.state = this.speed > 6 ? 'run' : this.speed > 0.35 ? 'walk' : 'idle';
      this.stateTime = 0;
      cb?.();
    }

    const cycleSpeed = this.state === 'run' ? 2.05 : 1.85;
    this.phase += dt * Math.max(1.2, this.speed * cycleSpeed);
    this.computeTarget();

    const halfLife = 0.055;
    for (const key of Object.keys(this.target) as (keyof Pose)[]) {
      this.current[key] = damp(this.current[key], this.target[key], halfLife, dt);
    }
    this.apply();
  }

  private computeTarget(): void {
    const t = this.target;
    const p = this.phase;
    t.armL = 0; t.armR = 0; t.legL = 0; t.legR = 0;
    t.torsoPitch = 0; t.torsoRoll = 0; t.headPitch = 0; t.headYaw = 0; t.hipY = 0;

    switch (this.state) {
      case 'idle': {
        const breathe = Math.sin(p * 0.7) * 0.04;
        t.torsoPitch = 0.03 + breathe * 0.3;
        t.armL = breathe;
        t.armR = -breathe;
        t.headYaw = Math.sin(p * 0.31) * 0.14;
        t.hipY = breathe * 0.02;
        break;
      }
      case 'walk':
      case 'run': {
        const intensity = this.state === 'run' ? 1.5 : 1;
        const swing = 0.72 * intensity;
        t.legL = Math.sin(p) * swing;
        t.legR = Math.sin(p + Math.PI) * swing;
        t.armL = Math.sin(p + Math.PI) * swing * 0.82;
        t.armR = Math.sin(p) * swing * 0.82;
        t.torsoPitch = this.state === 'run' ? 0.2 : 0.07;
        t.torsoRoll = Math.sin(p) * 0.05 * intensity;
        t.hipY = Math.abs(Math.sin(p)) * 0.05 * intensity;
        t.headPitch = -t.torsoPitch * 0.5;
        break;
      }
      case 'turn': {
        const k = this.stateTime / this.duration('turn');
        t.torsoRoll = Math.sin(k * Math.PI) * 0.2;
        t.headYaw = Math.sin(k * Math.PI) * 0.45;
        break;
      }
      case 'interact': {
        const k = this.stateTime / this.duration('interact');
        const reach = Math.sin(k * Math.PI);
        t.armR = -reach * 1.45;
        t.torsoPitch = reach * 0.22;
        t.headPitch = reach * 0.22;
        break;
      }
      case 'throw': {
        const k = this.stateTime / this.duration('throw');
        const wind = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
        t.armR = k < 0.4 ? wind * 1.9 : -wind * 1.7;
        t.torsoRoll = -wind * 0.22;
        t.torsoPitch = k < 0.4 ? -wind * 0.14 : wind * 0.2;
        break;
      }
      case 'celebrate': {
        const k = this.stateTime / this.duration('celebrate');
        const hop = Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k * 0.35);
        t.armL = -2.2 * hop;
        t.armR = -2.2 * hop;
        t.hipY = hop * 0.22;
        t.headPitch = -0.3 * hop;
        t.legL = -0.2 * hop;
        t.legR = -0.2 * hop;
        break;
      }
      case 'damage': {
        const k = this.stateTime / this.duration('damage');
        const recoil = (1 - k) * Math.exp(-k * 3);
        t.torsoPitch = -recoil * 0.55;
        t.headPitch = -recoil * 0.4;
        t.armL = recoil * 0.9;
        t.armR = recoil * 0.9;
        break;
      }
      case 'fall': {
        t.armL = -1.6; t.armR = -1.6;
        t.legL = 0.4; t.legR = -0.4;
        t.torsoPitch = -0.25;
        break;
      }
      case 'sit': {
        t.legL = -1.5; t.legR = -1.5;
        t.torsoPitch = 0.14;
        t.hipY = -0.42;
        break;
      }
      case 'sleep': {
        const breathe = Math.sin(p * 0.6) * 0.035;
        t.torsoPitch = 1.45;
        t.hipY = -0.72 + breathe * 0.1;
        t.headPitch = 0.3;
        t.legL = -0.25; t.legR = -0.25;
        break;
      }
    }
  }

  private apply(): void {
    const c = this.current;
    const parts = this.model.parts;
    parts.armLeft.rotation.x = c.armL;
    parts.armRight.rotation.x = c.armR;
    parts.legLeft.rotation.x = c.legL;
    parts.legRight.rotation.x = c.legR;
    parts.torso.rotation.x = c.torsoPitch;
    parts.torso.rotation.z = c.torsoRoll;
    parts.head.rotation.x = c.headPitch;
    parts.head.rotation.y = c.headYaw;
    parts.hips.position.y = this.baseHipY + c.hipY;
  }

  /** Setzt den Kopf auf ein Ziel in der Welt aus (fuer Dialoge). */
  lookAt(worldTarget: THREE.Vector3, rootQuaternion: THREE.Quaternion, rootPos: THREE.Vector3): void {
    const dir = worldTarget.clone().sub(rootPos);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) return;
    dir.normalize().applyQuaternion(rootQuaternion.clone().invert());
    this.target.headYaw = Math.atan2(dir.x, dir.z) * 0.55;
  }
}
