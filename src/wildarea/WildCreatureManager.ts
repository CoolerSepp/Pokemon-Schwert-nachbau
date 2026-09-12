import * as THREE from 'three';
import type { AreaData, SpawnEntry, TimeOfDay, WeatherKind } from '@/data/schema';
import { GameData } from '@/data/GameData';
import { GameConfig } from '@/core/Config';
import { RNG } from '@/core/RNG';
import { distance2D, moveTowardsAngle } from '@/core/MathUtils';
import type { AssetManager } from '@/engine/AssetManager';
import type { AreaRuntime } from '@/world/AreaRuntime';
import type { Creature } from '@/creatures/Creature';
import type { CreatureFactory } from '@/creatures/CreatureFactory';
import { buildCreatureModel, type CreatureModel } from '@/creatures/CreatureModel';
import { CreatureAnimator } from '@/animation/CreatureAnimator';
import type { PlayerState } from '@/player/PlayerState';

export type WildBehaviour = NonNullable<SpawnEntry['behaviour']>;

export interface WildInstance {
  creature: Creature;
  model: CreatureModel;
  animator: CreatureAnimator;
  x: number;
  z: number;
  facing: number;
  targetX: number;
  targetZ: number;
  waitTimer: number;
  behaviour: WildBehaviour;
  rare: boolean;
  /** Verhindert sofortige Wiederbegegnung nach einem Kampf. */
  cooldown: number;
  homeX: number;
  homeZ: number;
  fleeing: boolean;
}

export interface SpawnContext {
  timeOfDay: TimeOfDay;
  weather: WeatherKind;
  storyStage: number;
  /** Aktive Kreatur des Spielers - beeinflusst Lockfaehigkeiten. */
  leadTypeBias: string | null;
}

/**
 * Sichtbare wilde Kreaturen in der Welt.
 *
 * Kreaturen laufen tatsaechlich herum, fliehen oder verfolgen den Spieler -
 * Begegnungen entstehen durch Beruehrung, nicht durch Zufall beim Laufen.
 * Spawn-Raten haengen von Tageszeit, Wetter und Story-Fortschritt ab.
 */
export class WildCreatureManager {
  private readonly instances: WildInstance[] = [];
  private readonly group = new THREE.Group();
  private area: AreaRuntime | null = null;
  private rng = new RNG('wild');
  private spawnTimer = 0;
  private encounterCooldown = 0;
  private paused = false;

  constructor(
    private readonly assets: AssetManager,
    private readonly factory: CreatureFactory,
    private readonly player: PlayerState,
  ) {
    this.group.name = 'wildCreatures';
  }

  get object(): THREE.Object3D { return this.group; }
  get count(): number { return this.instances.length; }
  get all(): readonly WildInstance[] { return this.instances; }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Bereitet ein Gebiet vor und setzt eine Grundbevoelkerung. */
  load(area: AreaRuntime, ctx: SpawnContext): void {
    this.clear();
    this.area = area;
    this.rng = new RNG(`wild-${area.data.id}-${Math.floor(Date.now() / 60000)}`);
    if (!area.data.spawnTable || area.data.spawnTable.length === 0) return;

    const target = Math.min(
      area.data.maxWild ?? 10, GameConfig.world.maxActiveWildCreatures,
    );
    for (let i = 0; i < target; i++) this.trySpawn(area, ctx);
  }

  /** Filtert die Spawn-Tabelle nach den aktuellen Bedingungen. */
  private availableEntries(data: AreaData, ctx: SpawnContext): { value: SpawnEntry; weight: number }[] {
    const out: { value: SpawnEntry; weight: number }[] = [];
    for (const entry of data.spawnTable ?? []) {
      if (entry.timeOfDay && !entry.timeOfDay.includes(ctx.timeOfDay)) continue;
      if (entry.weather && !entry.weather.includes(ctx.weather)) continue;
      if (entry.minStoryStage !== undefined && ctx.storyStage < entry.minStoryStage) continue;
      if (!GameData.species.has(entry.species)) continue;

      let weight = entry.weight;
      // Wetter verschiebt die Haeufigkeiten spuerbar.
      const species = GameData.species.get(entry.species);
      weight *= this.weatherBias(species.types, ctx.weather);
      if (ctx.timeOfDay === 'night' && species.types.some((t) => t === 'ghost' || t === 'dark')) {
        weight *= 1.8;
      }
      if (ctx.leadTypeBias && species.types.includes(ctx.leadTypeBias as never)) {
        weight *= 1.5;
      }
      out.push({ value: entry, weight });
    }
    return out;
  }

  private weatherBias(types: readonly string[], weather: WeatherKind): number {
    const has = (t: string) => types.includes(t);
    switch (weather) {
      case 'rain':
      case 'heavyRain':
        return has('water') ? 2.2 : has('fire') ? 0.4 : 1;
      case 'thunderstorm':
        return has('electric') ? 2.4 : has('flying') ? 0.5 : 1;
      case 'snow':
      case 'blizzard':
        return has('ice') ? 2.4 : has('fire') ? 0.4 : 1;
      case 'sandstorm':
        return has('ground') || has('rock') ? 2.2 : 0.7;
      case 'fog':
        return has('ghost') || has('dark') ? 2.0 : 0.8;
      case 'harshSun':
        return has('fire') ? 2.0 : has('water') ? 0.5 : 1;
      default:
        return 1;
    }
  }

  private trySpawn(area: AreaRuntime, ctx: SpawnContext): boolean {
    const entries = this.availableEntries(area.data, ctx);
    const entry = this.rng.weighted(entries);
    if (!entry) return false;

    const position = this.findSpawnPosition(area);
    if (!position) return false;

    const level = this.rng.int(entry.minLevel, entry.maxLevel);
    const creature = this.factory.create(entry.species, {
      level,
      caughtArea: area.data.id,
      sizeVariant: entry.sizeVariant,
    });

    const model = buildCreatureModel(creature.species.model, this.assets, {
      scale: creature.modelScale,
      variantTint: creature.isVariant ? 0.42 : undefined,
    });
    model.root.position.set(position[0], area.heightAt(position[0], position[1]), position[1]);
    this.group.add(model.root);

    const animator = new CreatureAnimator(model);
    animator.snapToRest();
    animator.play('idle');

    this.instances.push({
      creature, model, animator,
      x: position[0], z: position[1],
      facing: this.rng.float(0, Math.PI * 2),
      targetX: position[0], targetZ: position[1],
      homeX: position[0], homeZ: position[1],
      waitTimer: this.rng.float(0.5, 4),
      behaviour: entry.behaviour ?? 'wander',
      rare: entry.rare ?? false,
      cooldown: 0,
      fleeing: false,
    });
    return true;
  }

  /** Sucht eine freie Position bevorzugt in Graszonen. */
  private findSpawnPosition(area: AreaRuntime): [number, number] | null {
    const zones = area.data.grassZones ?? [];
    for (let attempt = 0; attempt < 24; attempt++) {
      let x: number;
      let z: number;
      if (zones.length > 0 && attempt < 18) {
        const zone = this.rng.pick(zones);
        x = zone.x + this.rng.float(-zone.width / 2, zone.width / 2);
        z = zone.z + this.rng.float(-zone.depth / 2, zone.depth / 2);
      } else {
        x = this.rng.float(4, area.data.size[0] - 4);
        z = this.rng.float(4, area.data.size[1] - 4);
      }
      if (area.collision.isBlocked(x, z)) continue;
      if (area.field.isUnderWater(x, z)) continue;
      return [x, z];
    }
    return null;
  }

  update(
    dt: number, playerX: number, playerZ: number, ctx: SpawnContext,
  ): WildInstance | null {
    const area = this.area;
    if (!area || this.paused) return null;

    if (this.encounterCooldown > 0) this.encounterCooldown -= dt;

    // Nachbesetzung, wenn Kreaturen gefangen oder besiegt wurden.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 3;
      const target = Math.min(
        area.data.maxWild ?? 10, GameConfig.world.maxActiveWildCreatures,
      );
      if (this.instances.length < target) this.trySpawn(area, ctx);
    }

    let contact: WildInstance | null = null;
    const repelActive = this.player.hasFlag('repelActive');

    for (const instance of this.instances) {
      if (instance.cooldown > 0) instance.cooldown -= dt;
      const distance = distance2D(instance.x, instance.z, playerX, playerZ);

      // Ferne Kreaturen nicht simulieren und ausblenden.
      const visible = distance < GameConfig.world.creatureCullDistance;
      instance.model.root.visible = visible;
      if (distance > GameConfig.world.creatureSimRadius) continue;

      this.updateBehaviour(instance, dt, distance, playerX, playerZ, area);
      instance.animator.update(dt);
      instance.model.root.position.set(
        instance.x, area.heightAt(instance.x, instance.z), instance.z,
      );
      instance.model.root.rotation.y = instance.facing;

      if (
        contact === null
        && this.encounterCooldown <= 0
        && instance.cooldown <= 0
        && distance <= GameConfig.encounter.contactRadius
      ) {
        // Schutzspray haelt schwaechere Kreaturen fern.
        if (repelActive && instance.creature.level < this.player.highestLevel) continue;
        contact = instance;
      }
    }
    return contact;
  }

  private updateBehaviour(
    instance: WildInstance, dt: number, distance: number,
    playerX: number, playerZ: number, area: AreaRuntime,
  ): void {
    const aggro = GameConfig.encounter.aggroRadius;
    const flee = GameConfig.encounter.fleeRadius;

    switch (instance.behaviour) {
      case 'aggressive':
        if (distance < aggro) {
          instance.targetX = playerX;
          instance.targetZ = playerZ;
          instance.fleeing = false;
        }
        break;
      case 'skittish':
      case 'shy':
        if (distance < (instance.behaviour === 'shy' ? flee : aggro * 0.7)) {
          // Vom Spieler wegbewegen.
          const dx = instance.x - playerX;
          const dz = instance.z - playerZ;
          const length = Math.hypot(dx, dz) || 1;
          instance.targetX = instance.x + (dx / length) * 6;
          instance.targetZ = instance.z + (dz / length) * 6;
          instance.fleeing = true;
        } else {
          instance.fleeing = false;
        }
        break;
      case 'static':
        instance.targetX = instance.homeX;
        instance.targetZ = instance.homeZ;
        break;
      default:
        break;
    }

    const toTarget = distance2D(instance.x, instance.z, instance.targetX, instance.targetZ);
    if (toTarget < 0.35) {
      instance.animator.play('idle');
      instance.waitTimer -= dt;
      if (instance.waitTimer <= 0 && instance.behaviour !== 'static') {
        const angle = this.rng.float(0, Math.PI * 2);
        const radius = this.rng.float(1.5, 7);
        const nx = instance.homeX + Math.cos(angle) * radius;
        const nz = instance.homeZ + Math.sin(angle) * radius;
        if (!area.collision.isBlocked(nx, nz) && !area.field.isUnderWater(nx, nz)) {
          instance.targetX = nx;
          instance.targetZ = nz;
        }
        instance.waitTimer = this.rng.float(1.5, 6);
      }
      return;
    }

    const speed = instance.fleeing ? 5.4
      : instance.behaviour === 'aggressive' ? 3.8 : 1.8;
    const dx = instance.targetX - instance.x;
    const dz = instance.targetZ - instance.z;
    const length = Math.hypot(dx, dz) || 1;
    const nextX = instance.x + (dx / length) * speed * dt;
    const nextZ = instance.z + (dz / length) * speed * dt;

    if (area.collision.isBlocked(nextX, nextZ) || area.field.isUnderWater(nextX, nextZ)) {
      instance.targetX = instance.x;
      instance.targetZ = instance.z;
      instance.waitTimer = 0.8;
      return;
    }
    instance.x = nextX;
    instance.z = nextZ;
    instance.facing = moveTowardsAngle(instance.facing, Math.atan2(dx, dz), 6 * dt);
    instance.animator.play(speed > 3 ? 'run' : 'walk', speed > 3 ? 1.3 : 1);
  }

  /** Entfernt eine Kreatur (nach Fang) oder setzt sie auf Abklingzeit. */
  resolveEncounter(instance: WildInstance, caught: boolean): void {
    const index = this.instances.indexOf(instance);
    if (index < 0) return;
    this.encounterCooldown = GameConfig.encounter.cooldownSeconds;
    if (caught) {
      this.group.remove(instance.model.root);
      this.instances.splice(index, 1);
      return;
    }
    // Nicht gefangene Kreaturen fliehen ein Stueck und sind kurz nicht ansprechbar.
    instance.cooldown = GameConfig.world.respawnDelaySeconds * 0.35;
    instance.fleeing = true;
    instance.targetX = instance.homeX + this.rng.float(-8, 8);
    instance.targetZ = instance.homeZ + this.rng.float(-8, 8);
  }

  /** Entfernt eine besiegte Kreatur vollstaendig. */
  remove(instance: WildInstance): void {
    const index = this.instances.indexOf(instance);
    if (index < 0) return;
    this.group.remove(instance.model.root);
    this.instances.splice(index, 1);
    this.encounterCooldown = GameConfig.encounter.cooldownSeconds;
  }

  clear(): void {
    for (const instance of this.instances) this.group.remove(instance.model.root);
    this.instances.length = 0;
    this.area = null;
    this.spawnTimer = 0;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
