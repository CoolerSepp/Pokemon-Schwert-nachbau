import * as THREE from 'three';
import type { AreaNpcPlacement, NpcAppearance } from '@/data/schema';
import { GameData } from '@/data/GameData';
import { GameConfig } from '@/core/Config';
import { RNG } from '@/core/RNG';
import { distance2D, moveTowardsAngle } from '@/core/MathUtils';
import type { AssetManager } from '@/engine/AssetManager';
import type { AreaRuntime } from '@/world/AreaRuntime';
import { buildHumanoid, disposeHumanoid, type HumanoidModel } from '@/player/PlayerModel';
import { HumanoidAnimator } from '@/player/HumanoidAnimator';
import type { PlayerState } from '@/player/PlayerState';

export interface NpcInstance {
  id: string;
  placement: AreaNpcPlacement;
  model: HumanoidModel;
  animator: HumanoidAnimator;
  x: number;
  z: number;
  facing: number;
  targetX: number;
  targetZ: number;
  homeX: number;
  homeZ: number;
  waitTimer: number;
  /** Hat dieser Trainer den Spieler bereits erblickt? */
  spotted: boolean;
  defeated: boolean;
  /** Aktuelle Tagesplan-Aktivitaet. */
  activity: string;
}

export type NpcInteraction =
  | { kind: 'dialogue'; npc: NpcInstance; dialogueId: string }
  | { kind: 'trainer'; npc: NpcInstance; trainerId: string }
  | { kind: 'shop'; npc: NpcInstance; shopId: string }
  | { kind: 'heal'; npc: NpcInstance };

/**
 * Erzeugt und belebt die NPCs eines Gebiets.
 *
 * NPCs folgen Tagesplaenen, wandern in ihrem Revier und blicken den Spieler
 * an, wenn er nahe kommt. Trainer erfassen den Spieler ueber eine Sichtlinie
 * und loesen dann einen Kampf aus.
 */
export class NpcManager {
  private readonly npcs: NpcInstance[] = [];
  private readonly group = new THREE.Group();
  private area: AreaRuntime | null = null;
  private readonly rng = new RNG('npcs');
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();

  constructor(
    private readonly assets: AssetManager,
    private readonly player: PlayerState,
  ) {
    this.group.name = 'npcs';
  }

  get object(): THREE.Object3D { return this.group; }
  get all(): readonly NpcInstance[] { return this.npcs; }

  /** Baut alle NPCs eines Gebiets auf. Alte werden entfernt. */
  load(area: AreaRuntime): void {
    this.clear();
    this.area = area;

    for (const placement of area.data.npcs ?? []) {
      if (!this.isVisible(placement)) continue;
      const appearance = placement.appearance ?? this.randomAppearance(placement.id);
      const model = buildHumanoid(this.assets, appearance);
      const [x, z] = area.collision.findFreeNear(
        placement.pos[0], placement.pos[1], GameConfig.player.radius,
      );
      model.root.position.set(x, area.heightAt(x, z), z);
      model.root.rotation.y = placement.facing ?? 0;
      this.group.add(model.root);

      const npc: NpcInstance = {
        id: placement.id,
        placement,
        model,
        animator: new HumanoidAnimator(model),
        x, z,
        facing: placement.facing ?? 0,
        targetX: x, targetZ: z,
        homeX: x, homeZ: z,
        waitTimer: this.rng.float(1, 5),
        spotted: false,
        defeated: placement.trainer
          ? this.player.hasFlag(`trainer:${placement.trainer}`)
          : false,
        activity: 'idle',
      };
      npc.animator.play('idle');
      this.npcs.push(npc);
      // NPCs blockieren den Weg nicht dauerhaft, aber der Spieler soll nicht
      // durch sie hindurchlaufen: kleiner Kollisionskreis.
      area.collision.addCircle({ x, z, radius: 0.45 });
    }
  }

  /** Prueft Sichtbarkeit nach Story-Fortschritt. */
  private isVisible(placement: AreaNpcPlacement): boolean {
    const stage = this.player.storyStage;
    if (placement.minStoryStage !== undefined && stage < placement.minStoryStage) return false;
    if (placement.maxStoryStage !== undefined && stage > placement.maxStoryStage) return false;
    return true;
  }

  private randomAppearance(seed: string): NpcAppearance {
    const rng = new RNG(`npc-${seed}`);
    const skins = ['#f0cfa8', '#e8c19b', '#d8b08a', '#c99a6b', '#a8794f', '#7a5433'];
    const hairs = ['#2b2b2b', '#4a3524', '#8a5a2b', '#c4c4c4', '#c24b4b', '#3f3f6b'];
    const shirts = ['#4b8f5f', '#c24b4b', '#4b6b9b', '#c2a04b', '#8f4bbf', '#4bbfa8'];
    const pants = ['#3a3a42', '#4a4a52', '#5f4a33', '#3f5f8f'];
    const hats: NpcAppearance['hat'][] = ['none', 'none', 'cap', 'beanie', 'band'];
    return {
      skin: rng.pick(skins), hair: rng.pick(hairs), shirt: rng.pick(shirts),
      pants: rng.pick(pants), accent: '#f0e6d2', hat: rng.pick(hats),
      height: rng.float(0.9, 1.06), build: rng.pick(['slim', 'normal', 'broad'] as const),
    };
  }

  update(dt: number, playerX: number, playerZ: number, hour: number): void {
    const area = this.area;
    if (!area) return;

    for (const npc of this.npcs) {
      this.updateSchedule(npc, hour);
      this.updateMovement(npc, dt, area);

      const distance = distance2D(npc.x, npc.z, playerX, playerZ);
      // In Spielernaehe den Kopf zuwenden.
      if (distance < 6) {
        this.tmpVec.set(playerX, 0, playerZ);
        this.tmpQuat.setFromEuler(new THREE.Euler(0, npc.facing, 0));
        npc.animator.lookAt(
          this.tmpVec, this.tmpQuat, new THREE.Vector3(npc.x, 0, npc.z),
        );
      }
      npc.animator.update(dt);
      npc.model.root.position.set(npc.x, area.heightAt(npc.x, npc.z), npc.z);
      npc.model.root.rotation.y = npc.facing;
      // Weit entfernte NPCs ausblenden.
      npc.model.root.visible = distance < GameConfig.world.creatureCullDistance;
    }
  }

  /** Setzt das Ziel nach Tagesplan. */
  private updateSchedule(npc: NpcInstance, hour: number): void {
    const schedule = npc.placement.schedule;
    if (!schedule || schedule.length === 0) return;
    // Letzter Eintrag, dessen Stunde bereits erreicht ist.
    let active = schedule[schedule.length - 1]!;
    for (const entry of schedule) {
      if (hour >= entry.hour) active = entry;
    }
    if (npc.activity !== (active.activity ?? 'idle')) {
      npc.activity = active.activity ?? 'idle';
      npc.targetX = active.pos[0];
      npc.targetZ = active.pos[1];
      npc.homeX = active.pos[0];
      npc.homeZ = active.pos[1];
    }
  }

  private updateMovement(npc: NpcInstance, dt: number, area: AreaRuntime): void {
    const wanderRadius = npc.placement.wander ?? 0;
    const distanceToTarget = distance2D(npc.x, npc.z, npc.targetX, npc.targetZ);

    if (distanceToTarget < 0.3) {
      npc.animator.setLocomotion(0);
      npc.waitTimer -= dt;
      if (npc.waitTimer <= 0 && wanderRadius > 0) {
        const angle = this.rng.float(0, Math.PI * 2);
        const radius = this.rng.float(0.5, wanderRadius);
        const nx = npc.homeX + Math.cos(angle) * radius;
        const nz = npc.homeZ + Math.sin(angle) * radius;
        if (!area.collision.isBlocked(nx, nz)) {
          npc.targetX = nx;
          npc.targetZ = nz;
        }
        npc.waitTimer = this.rng.float(2.5, 7);
      }
      return;
    }

    const speed = 1.9;
    const dx = npc.targetX - npc.x;
    const dz = npc.targetZ - npc.z;
    const length = Math.hypot(dx, dz) || 1;
    const nextX = npc.x + (dx / length) * speed * dt;
    const nextZ = npc.z + (dz / length) * speed * dt;
    if (area.collision.isBlocked(nextX, nextZ)) {
      // Weg versperrt: neues Ziel suchen.
      npc.targetX = npc.x;
      npc.targetZ = npc.z;
      npc.waitTimer = 1.5;
      return;
    }
    npc.x = nextX;
    npc.z = nextZ;
    npc.facing = moveTowardsAngle(npc.facing, Math.atan2(dx, dz), 5 * dt);
    npc.animator.setLocomotion(speed);
  }

  /** Naechster NPC im Interaktionsbereich. */
  findInteractable(
    playerX: number, playerZ: number, canInteract: (x: number, z: number) => boolean,
  ): NpcInstance | null {
    let best: NpcInstance | null = null;
    let bestDistance = Infinity;
    for (const npc of this.npcs) {
      if (!canInteract(npc.x, npc.z)) continue;
      const distance = distance2D(npc.x, npc.z, playerX, playerZ);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = npc;
      }
    }
    return best;
  }

  /** Leitet aus einem NPC die passende Interaktion ab. */
  interactionFor(npc: NpcInstance): NpcInteraction {
    if (npc.placement.trainer && !npc.defeated) {
      return { kind: 'trainer', npc, trainerId: npc.placement.trainer };
    }
    // Ein hinterlegter Dialogbaum hat Vorrang: er kann Heilung und Laden als
    // Aktion ausloesen und bietet zusaetzlich eine Auswahl.
    if (!npc.placement.dialogue) {
      if (npc.placement.role === 'shop' && npc.placement.shop) {
        return { kind: 'shop', npc, shopId: npc.placement.shop };
      }
      if (npc.placement.role === 'heal') {
        return { kind: 'heal', npc };
      }
    }
    const dialogueId = npc.placement.dialogue
      ?? (npc.placement.trainer
        ? `trainer_defeated:${npc.placement.trainer}`
        : 'generic_npc');
    return { kind: 'dialogue', npc, dialogueId };
  }

  /**
   * Sucht einen Trainer, der den Spieler gerade erblickt.
   * Sichtlinie plus Blickwinkel - wie ein echtes Erfassen.
   */
  findSpottingTrainer(playerX: number, playerZ: number): NpcInstance | null {
    const area = this.area;
    if (!area) return null;
    for (const npc of this.npcs) {
      if (!npc.placement.trainer || npc.defeated || npc.spotted) continue;
      const distance = distance2D(npc.x, npc.z, playerX, playerZ);
      if (distance > GameConfig.encounter.trainerSightRange) continue;

      const dx = playerX - npc.x;
      const dz = playerZ - npc.z;
      const forwardX = Math.sin(npc.facing);
      const forwardZ = Math.cos(npc.facing);
      const dot = (dx * forwardX + dz * forwardZ) / (distance || 1);
      if (dot < GameConfig.encounter.trainerSightAngleCos) continue;
      if (!area.collision.lineOfSight(npc.x, npc.z, playerX, playerZ)) continue;
      return npc;
    }
    return null;
  }

  markDefeated(trainerId: string): void {
    for (const npc of this.npcs) {
      if (npc.placement.trainer === trainerId) {
        npc.defeated = true;
        npc.spotted = false;
      }
    }
  }

  /** Laesst einen NPC zum Spieler laufen (nach dem Erblicken). */
  approach(npc: NpcInstance, targetX: number, targetZ: number, dt: number): boolean {
    const distance = distance2D(npc.x, npc.z, targetX, targetZ);
    if (distance <= 2.2) {
      npc.animator.setLocomotion(0);
      npc.facing = moveTowardsAngle(
        npc.facing, Math.atan2(targetX - npc.x, targetZ - npc.z), 8 * dt,
      );
      return true;
    }
    const speed = 4.2;
    const dx = targetX - npc.x;
    const dz = targetZ - npc.z;
    const length = Math.hypot(dx, dz) || 1;
    npc.x += (dx / length) * speed * dt;
    npc.z += (dz / length) * speed * dt;
    npc.facing = moveTowardsAngle(npc.facing, Math.atan2(dx, dz), 8 * dt);
    npc.animator.setLocomotion(speed);
    return false;
  }

  /** NPC-Anzeigename fuer Dialoge. */
  displayName(npc: NpcInstance): string {
    if (npc.placement.name) return npc.placement.name;
    if (npc.placement.trainer) {
      return GameData.trainers.tryGet(npc.placement.trainer)?.name ?? 'Trainer';
    }
    return 'Person';
  }

  clear(): void {
    for (const npc of this.npcs) {
      this.group.remove(npc.model.root);
      // Die zusammengefassten Koerperteile sind eigene Geometrien je Figur.
      // Ohne diese Freigabe waechst der Grafikspeicher bei jedem
      // Gebietswechsel um mehrere hundert Geometrien.
      disposeHumanoid(npc.model);
    }
    this.npcs.length = 0;
    this.area = null;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
