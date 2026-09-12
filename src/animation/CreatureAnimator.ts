import * as THREE from 'three';
import type { CreatureModel, ModelPartInstance } from '@/creatures/CreatureModel';
import { clamp01, easeOutCubic, damp } from '@/core/MathUtils';
import type { RigKind } from '@/data/schema';

export const ANIMATION_STATES = [
  'idle', 'walk', 'run', 'attack', 'damage', 'victory', 'defeat',
  'interact', 'special', 'capture', 'evolution', 'gigantic', 'sleep', 'hurt',
] as const;
export type AnimationState = (typeof ANIMATION_STATES)[number];

interface StateConfig {
  loop: boolean;
  /** Dauer in Sekunden bei einmaligen Zustaenden. */
  duration: number;
  /** Uebergangszeit beim Wechsel. */
  blend: number;
  /** Gewichtung fuer die Rueckkehr zum Ruhezustand. */
  priority: number;
}

const STATE_CONFIG: Record<AnimationState, StateConfig> = {
  idle: { loop: true, duration: 0, blend: 0.28, priority: 0 },
  walk: { loop: true, duration: 0, blend: 0.18, priority: 1 },
  run: { loop: true, duration: 0, blend: 0.14, priority: 1 },
  attack: { loop: false, duration: 0.62, blend: 0.07, priority: 5 },
  damage: { loop: false, duration: 0.45, blend: 0.05, priority: 6 },
  hurt: { loop: false, duration: 0.45, blend: 0.05, priority: 6 },
  victory: { loop: false, duration: 1.5, blend: 0.2, priority: 4 },
  defeat: { loop: false, duration: 1.1, blend: 0.12, priority: 7 },
  interact: { loop: false, duration: 0.75, blend: 0.15, priority: 3 },
  special: { loop: false, duration: 1.1, blend: 0.16, priority: 5 },
  capture: { loop: false, duration: 0.65, blend: 0.06, priority: 8 },
  evolution: { loop: true, duration: 0, blend: 0.3, priority: 6 },
  gigantic: { loop: true, duration: 0, blend: 0.35, priority: 6 },
  sleep: { loop: true, duration: 0, blend: 0.4, priority: 2 },
};

/** Beinrollen in Laufreihenfolge (diagonale Gangart). */
const LEG_PHASE: Record<string, number> = {
  legFrontLeft: 0,
  legBackRight: 0,
  legFrontRight: Math.PI,
  legBackLeft: Math.PI,
};

interface PoseTarget {
  posX: number; posY: number; posZ: number;
  rotX: number; rotY: number; rotZ: number;
}

function emptyPose(): PoseTarget {
  return { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0 };
}

/**
 * Prozeduraler Animator fuer Kreaturenmodelle.
 *
 * Statt vorgefertigter Keyframes werden Posen aus Rig-Typ, Zustand und Phase
 * berechnet. Das funktioniert fuer beliebig viele Arten ohne Animationsdaten
 * und laesst sich weich ueberblenden (crossFade).
 */
export class CreatureAnimator {
  private state: AnimationState = 'idle';
  private phase = 0;
  private stateTime = 0;
  private speedScale = 1;
  private readonly targets: PoseTarget[];
  private readonly current: PoseTarget[];
  private queue: AnimationState[] = [];
  private rootOffsetY = 0;
  private extraScale = 1;
  private targetScale = 1;
  private baseScale: number;
  private onComplete: (() => void) | null = null;

  constructor(private readonly model: CreatureModel) {
    this.targets = model.parts.map(() => emptyPose());
    this.current = model.parts.map(() => emptyPose());
    this.baseScale = model.root.scale.x;
  }

  get currentState(): AnimationState { return this.state; }
  get isPlaying(): boolean {
    return !STATE_CONFIG[this.state].loop && this.stateTime < STATE_CONFIG[this.state].duration;
  }

  /** Startet einen Zustand. `speed` skaliert die Geschwindigkeit. */
  play(state: AnimationState, speed = 1, onComplete?: () => void): void {
    if (state === this.state && STATE_CONFIG[state].loop) {
      this.speedScale = speed;
      return;
    }
    this.state = state;
    this.stateTime = 0;
    this.speedScale = speed;
    this.onComplete = onComplete ?? null;
    if (state === 'gigantic') this.targetScale = 1.85;
    else if (state === 'capture') this.targetScale = 0.05;
    else if (state !== 'evolution') this.targetScale = 1;
  }

  /** Reiht einen Zustand ein, der nach dem aktuellen abgespielt wird. */
  queueState(state: AnimationState): void {
    this.queue.push(state);
  }

  stop(): void {
    this.queue.length = 0;
    this.play('idle');
  }

  isState(state: AnimationState): boolean { return this.state === state; }

  /** Setzt die Skalierung zurueck (nach Gigantifizierung/Fang). */
  resetScale(): void {
    this.targetScale = 1;
  }

  update(dt: number): void {
    const config = STATE_CONFIG[this.state];
    this.stateTime += dt;
    this.phase += dt * this.speedScale * this.model.idleSpeed * this.phaseSpeed();
    if (this.phase > Math.PI * 2000) this.phase %= Math.PI * 2;

    if (!config.loop && this.stateTime >= config.duration) {
      const cb = this.onComplete;
      this.onComplete = null;
      const next = this.queue.shift() ?? 'idle';
      this.play(next);
      cb?.();
    }

    this.computePose();
    this.applyPose(dt);
  }

  private phaseSpeed(): number {
    switch (this.state) {
      case 'walk': return 7.5;
      case 'run': return 12.5;
      case 'sleep': return 1.1;
      case 'gigantic': return 2.6;
      case 'evolution': return 9;
      default: return 2.4;
    }
  }

  /** Fuellt `targets` mit der Zielpose des aktuellen Zustands. */
  private computePose(): void {
    for (const t of this.targets) {
      t.posX = 0; t.posY = 0; t.posZ = 0;
      t.rotX = 0; t.rotY = 0; t.rotZ = 0;
    }
    const p = this.phase;
    const parts = this.model.parts;
    const progress = STATE_CONFIG[this.state].duration > 0
      ? clamp01(this.stateTime / STATE_CONFIG[this.state].duration)
      : 0;

    switch (this.state) {
      case 'idle':
      case 'interact':
        this.poseIdle(p, parts);
        if (this.state === 'interact') this.poseHeadNod(progress, parts);
        break;
      case 'walk':
      case 'run':
        this.poseLocomotion(p, parts, this.state === 'run' ? 1.5 : 1);
        break;
      case 'attack':
        this.poseAttack(progress, parts);
        break;
      case 'damage':
      case 'hurt':
        this.poseDamage(progress, parts);
        break;
      case 'victory':
        this.poseVictory(progress, p, parts);
        break;
      case 'defeat':
        this.poseDefeat(progress, parts);
        break;
      case 'special':
        this.poseSpecial(progress, p, parts);
        break;
      case 'capture':
        this.poseCapture(progress, parts);
        break;
      case 'evolution':
        this.poseIdle(p * 2, parts);
        break;
      case 'gigantic':
        this.poseGigantic(p, parts);
        break;
      case 'sleep':
        this.poseSleep(p, parts);
        break;
    }
  }

  private forEachRole(
    parts: ModelPartInstance[], test: (role: string) => boolean,
    fn: (target: PoseTarget, part: ModelPartInstance, index: number) => void,
  ): void {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (!test(part.role)) continue;
      fn(this.targets[i]!, part, i);
    }
  }

  private poseIdle(p: number, parts: ModelPartInstance[]): void {
    const breathe = Math.sin(p) * 0.022;
    const sway = Math.sin(p * 0.63) * 0.035;
    this.forEachRole(parts, (r) => r === 'body', (t) => {
      t.posY = breathe;
      t.rotZ = sway * 0.3;
    });
    this.forEachRole(parts, (r) => r === 'head', (t) => {
      t.posY = breathe * 0.8;
      t.rotY = sway;
      t.rotX = Math.sin(p * 0.41) * 0.05;
    });
    this.forEachRole(parts, (r) => r === 'tail' || r === 'tailTip', (t) => {
      t.rotY = Math.sin(p * 1.15) * 0.22;
      t.rotX = Math.sin(p * 0.9) * 0.08;
    });
    this.forEachRole(parts, (r) => r === 'wingLeft' || r === 'wingRight', (t, part) => {
      const dir = part.role === 'wingLeft' ? 1 : -1;
      const flap = this.model.hover > 0 ? Math.sin(p * 3.2) * 0.4 : Math.sin(p * 0.8) * 0.09;
      t.rotZ = flap * dir;
    });
    this.forEachRole(parts, (r) => r === 'ear', (t, part) => {
      t.rotX = Math.sin(p * 1.4 + part.roleIndex) * 0.07;
    });
    this.forEachRole(parts, (r) => r === 'fin' || r === 'orb', (t, part) => {
      t.posY = Math.sin(p * 1.6 + part.roleIndex * 1.7) * 0.045;
      t.rotY = p * 0.35;
    });
    this.rootOffsetY = this.model.hover > 0
      ? this.model.hover + Math.sin(p * 1.3) * 0.06
      : 0;
  }

  private poseLocomotion(p: number, parts: ModelPartInstance[], intensity: number): void {
    const swing = 0.55 * intensity;
    const bob = 0.03 * intensity;
    const rig: RigKind = this.model.rig;

    if (rig === 'serpentine') {
      // Schlangen: Wellenbewegung ueber die Segmente.
      let seg = 0;
      this.forEachRole(parts, (r) => r === 'tail' || r === 'body', (t) => {
        t.posX = Math.sin(p - seg * 0.8) * 0.13 * intensity;
        t.posY = Math.abs(Math.sin(p * 0.5 - seg * 0.4)) * 0.03;
        seg++;
      });
    } else {
      this.forEachRole(parts, (r) => r.startsWith('leg'), (t, part) => {
        const base = LEG_PHASE[part.role] ?? (part.roleIndex % 2 === 0 ? 0 : Math.PI);
        t.rotX = Math.sin(p + base) * swing;
      });
      this.forEachRole(parts, (r) => r === 'armLeft' || r === 'armRight', (t, part) => {
        const base = part.role === 'armLeft' ? Math.PI : 0;
        t.rotX = Math.sin(p + base) * swing * 0.8;
      });
    }

    this.forEachRole(parts, (r) => r === 'body', (t) => {
      t.posY = Math.abs(Math.sin(p)) * bob;
      t.rotZ = Math.sin(p) * 0.05 * intensity;
      t.rotX = intensity > 1.2 ? -0.12 : -0.04;
    });
    this.forEachRole(parts, (r) => r === 'head', (t) => {
      t.posY = Math.abs(Math.sin(p + 0.4)) * bob * 0.7;
      t.rotX = Math.sin(p * 2) * 0.05;
    });
    this.forEachRole(parts, (r) => r === 'tail' || r === 'tailTip', (t) => {
      t.rotY = Math.sin(p * 1.4) * 0.35 * intensity;
      t.rotX = -0.12 * intensity;
    });
    this.forEachRole(parts, (r) => r === 'wingLeft' || r === 'wingRight', (t, part) => {
      const dir = part.role === 'wingLeft' ? 1 : -1;
      t.rotZ = Math.sin(p * 1.8) * 0.62 * dir * intensity;
    });
    this.rootOffsetY = this.model.hover > 0
      ? this.model.hover + Math.sin(p * 2) * 0.08
      : 0;
  }

  private poseHeadNod(progress: number, parts: ModelPartInstance[]): void {
    const nod = Math.sin(progress * Math.PI * 2) * 0.4;
    this.forEachRole(parts, (r) => r === 'head', (t) => { t.rotX += nod; });
  }

  private poseAttack(progress: number, parts: ModelPartInstance[]): void {
    // Ausholen, Vorstossen, zurueck.
    const lunge = progress < 0.28
      ? -progress / 0.28 * 0.35
      : progress < 0.52
        ? (progress - 0.28) / 0.24 * 1.35 - 0.35
        : (1 - (progress - 0.52) / 0.48);
    this.forEachRole(parts, (r) => r === 'body', (t) => {
      t.posZ = lunge * 0.42;
      t.rotX = -lunge * 0.22;
    });
    this.forEachRole(parts, (r) => r === 'head' || r === 'snout' || r === 'jaw', (t) => {
      t.posZ = lunge * 0.22;
      t.rotX = -lunge * 0.34;
    });
    this.forEachRole(parts, (r) => r === 'armLeft' || r === 'armRight', (t, part) => {
      const dir = part.role === 'armLeft' ? 1 : -1;
      t.rotX = -lunge * 1.25;
      t.rotZ = dir * 0.2;
    });
    this.forEachRole(parts, (r) => r.startsWith('legFront'), (t) => {
      t.rotX = -lunge * 0.6;
    });
    this.forEachRole(parts, (r) => r === 'tail', (t) => { t.rotX = lunge * 0.4; });
  }

  private poseDamage(progress: number, parts: ModelPartInstance[]): void {
    const recoil = (1 - progress) * Math.exp(-progress * 3);
    const shake = Math.sin(progress * 48) * recoil * 0.09;
    this.forEachRole(parts, () => true, (t, part) => {
      t.posX = shake * (part.roleIndex % 2 === 0 ? 1 : -1);
    });
    this.forEachRole(parts, (r) => r === 'body', (t) => {
      t.posZ = -recoil * 0.3;
      t.rotX = recoil * 0.3;
    });
    this.forEachRole(parts, (r) => r === 'head', (t) => { t.rotX = recoil * 0.45; });
  }

  private poseVictory(progress: number, p: number, parts: ModelPartInstance[]): void {
    const hop = Math.abs(Math.sin(progress * Math.PI * 3)) * (1 - progress * 0.4);
    this.rootOffsetY = this.model.hover + hop * 0.34;
    this.forEachRole(parts, (r) => r === 'body', (t) => { t.rotX = -0.12; });
    this.forEachRole(parts, (r) => r === 'head', (t) => {
      t.rotX = -0.28;
      t.rotY = Math.sin(p * 2.2) * 0.28;
    });
    this.forEachRole(parts, (r) => r === 'armLeft' || r === 'armRight', (t, part) => {
      const dir = part.role === 'armLeft' ? 1 : -1;
      t.rotZ = dir * 1.15;
      t.rotX = -0.4;
    });
    this.forEachRole(parts, (r) => r === 'tail' || r === 'tailTip', (t) => {
      t.rotY = Math.sin(p * 4) * 0.55;
    });
    this.forEachRole(parts, (r) => r === 'wingLeft' || r === 'wingRight', (t, part) => {
      const dir = part.role === 'wingLeft' ? 1 : -1;
      t.rotZ = Math.sin(p * 5) * 0.8 * dir;
    });
  }

  private poseDefeat(progress: number, parts: ModelPartInstance[]): void {
    const fall = easeOutCubic(progress);
    this.rootOffsetY = -fall * 0.3 + this.model.hover * (1 - fall);
    this.forEachRole(parts, (r) => r === 'body', (t) => {
      t.rotX = fall * 1.05;
      t.posY = -fall * 0.28;
    });
    this.forEachRole(parts, (r) => r === 'head', (t) => {
      t.rotX = fall * 0.85;
      t.posY = -fall * 0.2;
    });
    this.forEachRole(parts, (r) => r.startsWith('leg'), (t) => { t.rotX = fall * 0.9; });
    this.forEachRole(parts, (r) => r === 'wingLeft' || r === 'wingRight', (t, part) => {
      const dir = part.role === 'wingLeft' ? 1 : -1;
      t.rotZ = -dir * fall * 1.1;
    });
    this.forEachRole(parts, (r) => r === 'tail', (t) => { t.rotX = fall * 0.5; });
  }

  private poseSpecial(progress: number, p: number, parts: ModelPartInstance[]): void {
    const rise = Math.sin(progress * Math.PI);
    this.rootOffsetY = this.model.hover + rise * 0.55;
    this.forEachRole(parts, (r) => r === 'body' || r === 'head', (t) => {
      t.rotX = -rise * 0.3;
    });
    this.forEachRole(parts, (r) => r === 'armLeft' || r === 'armRight', (t, part) => {
      const dir = part.role === 'armLeft' ? 1 : -1;
      t.rotZ = dir * rise * 1.4;
    });
    this.forEachRole(parts, (r) => r === 'orb', (t, part) => {
      const a = p * 3 + part.roleIndex * 2.1;
      t.posX = Math.cos(a) * 0.3 * rise;
      t.posZ = Math.sin(a) * 0.3 * rise;
      t.posY = rise * 0.2;
    });
  }

  private poseCapture(progress: number, parts: ModelPartInstance[]): void {
    const pull = easeOutCubic(progress);
    this.forEachRole(parts, () => true, (t) => {
      t.posY = -pull * 0.1;
    });
    this.forEachRole(parts, (r) => r === 'body' || r === 'head', (t) => {
      t.rotX = pull * 0.4;
    });
  }

  private poseGigantic(p: number, parts: ModelPartInstance[]): void {
    const pulse = Math.sin(p) * 0.05;
    this.forEachRole(parts, (r) => r === 'body', (t) => {
      t.posY = pulse;
      t.rotX = -0.08;
    });
    this.forEachRole(parts, (r) => r === 'head', (t) => {
      t.rotX = -0.16;
      t.posY = pulse * 0.6;
    });
    this.forEachRole(parts, (r) => r === 'armLeft' || r === 'armRight', (t, part) => {
      const dir = part.role === 'armLeft' ? 1 : -1;
      t.rotZ = dir * (0.32 + pulse);
    });
    this.rootOffsetY = this.model.hover;
  }

  private poseSleep(p: number, parts: ModelPartInstance[]): void {
    const breathe = Math.sin(p) * 0.04;
    this.forEachRole(parts, (r) => r === 'body', (t) => {
      t.posY = breathe - 0.08;
      t.rotX = 0.18;
    });
    this.forEachRole(parts, (r) => r === 'head', (t) => {
      t.rotX = 0.42;
      t.posY = breathe - 0.06;
    });
    this.forEachRole(parts, (r) => r.startsWith('leg'), (t) => { t.rotX = 0.5; });
    this.rootOffsetY = this.model.hover * 0.4;
  }

  /** Ueberblendet weich zur Zielpose und schreibt sie in die Pivots. */
  private applyPose(dt: number): void {
    // Die Ueberblendzeit des Zielzustands bestimmt, wie schnell die aktuelle
    // Pose der Zielpose folgt - dadurch entsteht ein echtes crossFade.
    const halfLife = Math.max(0.02, STATE_CONFIG[this.state].blend * 0.32);
    const parts = this.model.parts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const target = this.targets[i]!;
      const cur = this.current[i]!;
      cur.posX = damp(cur.posX, target.posX, halfLife, dt);
      cur.posY = damp(cur.posY, target.posY, halfLife, dt);
      cur.posZ = damp(cur.posZ, target.posZ, halfLife, dt);
      cur.rotX = damp(cur.rotX, target.rotX, halfLife, dt);
      cur.rotY = damp(cur.rotY, target.rotY, halfLife, dt);
      cur.rotZ = damp(cur.rotZ, target.rotZ, halfLife, dt);

      part.pivot.position.set(
        part.restPosition.x + cur.posX,
        part.restPosition.y + cur.posY,
        part.restPosition.z + cur.posZ,
      );
      part.pivot.rotation.set(
        part.restRotation.x + cur.rotX,
        part.restRotation.y + cur.rotY,
        part.restRotation.z + cur.rotZ,
      );
    }

    this.extraScale = damp(this.extraScale, this.targetScale, 0.12, dt);
    this.model.root.scale.setScalar(this.baseScale * this.extraScale);
    this.model.root.position.y = damp(
      this.model.root.position.y, this.rootOffsetY, 0.09, dt,
    );
  }

  /** Basisskalierung nach Groessenaenderung neu setzen. */
  setBaseScale(scale: number): void {
    this.baseScale = scale;
  }

  /** Sofortige Ausrichtung ohne Ueberblendung (z.B. beim Einwechseln). */
  snapToRest(): void {
    for (const cur of this.current) {
      cur.posX = 0; cur.posY = 0; cur.posZ = 0;
      cur.rotX = 0; cur.rotY = 0; cur.rotZ = 0;
    }
    for (const part of this.model.parts) {
      part.pivot.position.copy(part.restPosition);
      part.pivot.rotation.copy(part.restRotation);
    }
    this.extraScale = 1;
    this.targetScale = 1;
    this.model.root.scale.setScalar(this.baseScale);
  }
}

/** Hilfsobjekt fuer Blickrichtungen; vermeidet Allokationen im Loop. */
export const TMP_VEC = new THREE.Vector3();
