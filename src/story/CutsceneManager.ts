import * as THREE from 'three';
import { GameData } from '@/data/GameData';
import { EventBus } from '@/core/EventBus';
import { Logger } from '@/core/Logger';
import type { CutsceneStep, DialogueAction, WeatherKind } from '@/data/schema';

const log = Logger.scope('Cutscene');

/** Die Faehigkeiten, die eine Cutscene vom Spiel benoetigt. */
export interface CutsceneHost {
  /** Bewegt einen benannten Darsteller; liefert true bei Ankunft. */
  moveActor(actor: string, x: number, z: number, dt: number, run: boolean): boolean;
  faceActor(actor: string, target: string | [number, number]): void;
  spawnActor(actor: string, npcId: string | undefined, x: number, z: number, facing: number): void;
  despawnActor(actor: string): void;
  animateActor(actor: string, animation: string): void;
  actorPosition(actor: string): THREE.Vector3 | null;

  cameraMoveTo(position: THREE.Vector3, target: THREE.Vector3, seconds: number, ease: boolean): void;
  cameraFollow(actor: string, distance: number, height: number): void;
  cameraShake(intensity: number, seconds: number): void;
  cameraRelease(): void;

  showMessage(speaker: string | undefined, lines: string[], onDone: () => void): void;
  startDialogue(dialogueId: string, onDone: () => void): void;
  runActions(actions: DialogueAction[]): void;

  playMusic(track: string | null, fade: number): void;
  playSfx(sound: string): void;
  playEffect(effect: string, position: THREE.Vector3 | null): void;
  fade(to: 'black' | 'white' | 'clear', seconds: number): void;

  setWeather(weather: WeatherKind): void;
  setHour(hour: number): void;
  teleport(area: string, spawnPoint: string): void;
  startTrainerBattle(trainerId: string, gigantic: boolean, onDone: () => void): void;
  startWildBattle(species: string, level: number, legendary: boolean, onDone: () => void): void;
}

export interface CutsceneEvents extends Record<string, unknown> {
  started: { id: string };
  finished: { id: string };
  stepStarted: { id: string; index: number; kind: string };
}

/**
 * Fuehrt Cutscenes schrittweise aus.
 *
 * Schritte laufen sequenziell; blockierende Schritte (Bewegung, Dialoge,
 * Kaempfe) halten die Abfolge an, bis sie fertig sind. Die Spielersteuerung
 * bleibt waehrenddessen deaktiviert.
 */
export class CutsceneManager {
  readonly events = new EventBus<CutsceneEvents>();

  private steps: CutsceneStep[] = [];
  private index = 0;
  private activeId: string | null = null;
  private waiting = false;
  private timer = 0;
  private onComplete: (() => void) | null = null;
  private currentMove: { actor: string; x: number; z: number; run: boolean } | null = null;

  constructor(private readonly host: CutsceneHost) {}

  get isActive(): boolean { return this.activeId !== null; }
  get currentId(): string | null { return this.activeId; }

  play(cutsceneId: string, onComplete?: () => void): boolean {
    const data = GameData.cutscenes.tryGet(cutsceneId);
    if (!data) {
      log.warn(`Unbekannte Cutscene "${cutsceneId}"`);
      onComplete?.();
      return false;
    }
    if (this.activeId) {
      log.warn(`Cutscene "${cutsceneId}" abgelehnt - "${this.activeId}" laeuft bereits`);
      return false;
    }
    this.activeId = cutsceneId;
    this.steps = data.steps;
    this.index = 0;
    this.waiting = false;
    this.timer = 0;
    this.currentMove = null;
    this.onComplete = onComplete ?? null;
    if (data.music) this.host.playMusic(data.music, 0.6);
    this.events.emit('started', { id: cutsceneId });
    this.nextStep();
    return true;
  }

  /** Bricht die laufende Cutscene ab (z.B. beim Laden eines Spielstands). */
  abort(): void {
    if (!this.activeId) return;
    const id = this.activeId;
    this.activeId = null;
    this.steps = [];
    this.currentMove = null;
    this.host.cameraRelease();
    const done = this.onComplete;
    this.onComplete = null;
    this.events.emit('finished', { id });
    done?.();
  }

  update(dt: number): void {
    if (!this.activeId) return;

    if (this.currentMove) {
      const arrived = this.host.moveActor(
        this.currentMove.actor, this.currentMove.x, this.currentMove.z, dt, this.currentMove.run,
      );
      if (arrived) {
        this.currentMove = null;
        this.nextStep();
      }
      return;
    }

    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.nextStep();
      return;
    }
  }

  /** Wird von blockierenden Schritten aufgerufen, wenn sie fertig sind. */
  private resume(): void {
    if (!this.waiting) return;
    this.waiting = false;
    this.nextStep();
  }

  private nextStep(): void {
    if (!this.activeId) return;
    if (this.index >= this.steps.length) {
      this.finish();
      return;
    }
    const step = this.steps[this.index++]!;
    this.events.emit('stepStarted', {
      id: this.activeId, index: this.index - 1, kind: step.kind,
    });
    this.executeStep(step);
  }

  private executeStep(step: CutsceneStep): void {
    const host = this.host;
    switch (step.kind) {
      case 'wait':
        this.timer = step.seconds;
        return;

      case 'fade':
        host.fade(step.to, step.seconds);
        this.timer = step.seconds;
        return;

      case 'camera': {
        const position = step.pos
          ? new THREE.Vector3(step.pos[0], step.pos[1], step.pos[2])
          : null;
        const target = step.target
          ? new THREE.Vector3(step.target[0], step.target[1], step.target[2])
          : null;
        if (position && target) {
          host.cameraMoveTo(position, target, step.seconds, step.ease ?? true);
        }
        this.timer = step.seconds;
        return;
      }

      case 'cameraFollow':
        host.cameraFollow(step.actor, step.distance ?? 7, step.height ?? 2.4);
        this.timer = step.seconds ?? 0.1;
        return;

      case 'cameraShake':
        host.cameraShake(step.intensity, step.seconds);
        this.timer = step.seconds;
        return;

      case 'dialogue':
        this.waiting = true;
        host.startDialogue(step.dialogue, () => this.resume());
        return;

      case 'message':
        this.waiting = true;
        host.showMessage(step.speaker, step.lines, () => this.resume());
        return;

      case 'moveActor':
        this.currentMove = {
          actor: step.actor, x: step.to[0], z: step.to[1], run: step.run ?? false,
        };
        return;

      case 'faceActor':
        host.faceActor(step.actor, step.target);
        this.nextStep();
        return;

      case 'spawnActor':
        host.spawnActor(step.actor, step.npc, step.pos[0], step.pos[1], step.facing ?? 0);
        this.nextStep();
        return;

      case 'despawnActor':
        host.despawnActor(step.actor);
        this.nextStep();
        return;

      case 'animate':
        host.animateActor(step.actor, step.animation);
        this.timer = step.seconds ?? 0.1;
        return;

      case 'music':
        host.playMusic(step.track, step.fade ?? 0.8);
        this.nextStep();
        return;

      case 'sfx':
        host.playSfx(step.sound);
        this.nextStep();
        return;

      case 'effect': {
        const position = step.pos
          ? new THREE.Vector3(step.pos[0], step.pos[1], step.pos[2])
          : null;
        host.playEffect(step.effect, position);
        this.timer = step.seconds ?? 0.1;
        return;
      }

      case 'weather':
        host.setWeather(step.weather);
        this.nextStep();
        return;

      case 'timeOfDay':
        host.setHour(step.hour);
        this.nextStep();
        return;

      case 'action':
        host.runActions(step.actions);
        this.nextStep();
        return;

      case 'battle':
        this.waiting = true;
        host.startTrainerBattle(step.trainer, step.gigantic ?? false, () => this.resume());
        return;

      case 'wildBattle':
        this.waiting = true;
        host.startWildBattle(
          step.species, step.level, step.legendary ?? false, () => this.resume(),
        );
        return;

      case 'teleport':
        host.teleport(step.area, step.spawnPoint);
        this.timer = 0.2;
        return;

      default:
        this.nextStep();
    }
  }

  private finish(): void {
    const id = this.activeId;
    this.activeId = null;
    this.steps = [];
    this.host.cameraRelease();
    const done = this.onComplete;
    this.onComplete = null;
    if (id) this.events.emit('finished', { id });
    done?.();
  }
}
