import * as THREE from 'three';
import type { AreaData, BuildingPlacement, PropPlacement } from '@/data/schema';
import { GameConfig } from '@/core/Config';
import { RNG } from '@/core/RNG';
import { Logger } from '@/core/Logger';
import { TerrainField, type FlattenZone } from './TerrainField';
import { CollisionGrid } from './CollisionGrid';
import { buildTerrainMesh, buildSky, BIOME_PALETTES, type BiomePalette } from './TerrainMesh';
import { PropFactory, type PropKind } from './PropFactory';
import { BuildingFactory } from './BuildingFactory';
import { InteriorFactory } from './InteriorFactory';

const log = Logger.scope('Area');

export interface DoorTrigger {
  /** Ziel-Innenraum. */
  area: string;
  spawnPoint: string;
  x: number;
  z: number;
  radius: number;
  label: string;
}

export interface GrassZoneRuntime {
  x: number; z: number; width: number; depth: number;
}

/** Automatische Prop-Verteilung je Biom, wenn ein Gebiet keine eigene Liste hat. */
const BIOME_SCATTER: Record<string, { kind: PropKind; weight: number; scale: [number, number] }[]> = {
  grassland: [
    { kind: 'tree', weight: 30, scale: [0.9, 1.3] },
    { kind: 'bush', weight: 26, scale: [0.8, 1.2] },
    { kind: 'flower', weight: 34, scale: [0.8, 1.4] },
    { kind: 'rock', weight: 10, scale: [0.6, 1.0] },
  ],
  meadow: [
    { kind: 'flower', weight: 48, scale: [0.9, 1.5] },
    { kind: 'bush', weight: 22, scale: [0.7, 1.1] },
    { kind: 'tree', weight: 18, scale: [0.9, 1.2] },
    { kind: 'rock', weight: 8, scale: [0.5, 0.9] },
  ],
  forest: [
    { kind: 'tree', weight: 44, scale: [1.0, 1.5] },
    { kind: 'pine', weight: 24, scale: [1.0, 1.4] },
    { kind: 'bush', weight: 18, scale: [0.8, 1.3] },
    { kind: 'mushroom', weight: 10, scale: [0.8, 1.4] },
    { kind: 'stump', weight: 6, scale: [0.8, 1.1] },
  ],
  rocky: [
    { kind: 'rock', weight: 40, scale: [0.8, 1.4] },
    { kind: 'boulder', weight: 20, scale: [0.8, 1.3] },
    { kind: 'bush', weight: 14, scale: [0.6, 1.0] },
    { kind: 'deadTree', weight: 10, scale: [0.8, 1.1] },
  ],
  mountain: [
    { kind: 'rock', weight: 34, scale: [0.9, 1.5] },
    { kind: 'boulder', weight: 26, scale: [0.9, 1.5] },
    { kind: 'pine', weight: 20, scale: [0.8, 1.2] },
  ],
  snow: [
    { kind: 'pine', weight: 32, scale: [0.9, 1.3] },
    { kind: 'rock', weight: 22, scale: [0.7, 1.2] },
    { kind: 'deadTree', weight: 14, scale: [0.8, 1.1] },
    { kind: 'snowman', weight: 3, scale: [0.9, 1.1] },
  ],
  desert: [
    { kind: 'cactus', weight: 32, scale: [0.9, 1.4] },
    { kind: 'rock', weight: 26, scale: [0.7, 1.2] },
    { kind: 'boulder', weight: 12, scale: [0.8, 1.2] },
    { kind: 'deadTree', weight: 8, scale: [0.7, 1.0] },
  ],
  wetland: [
    { kind: 'reed', weight: 38, scale: [0.9, 1.4] },
    { kind: 'bush', weight: 20, scale: [0.8, 1.2] },
    { kind: 'tree', weight: 16, scale: [0.9, 1.2] },
    { kind: 'lilypad', weight: 14, scale: [0.8, 1.3] },
    { kind: 'mushroom', weight: 8, scale: [0.8, 1.2] },
  ],
  coastal: [
    { kind: 'palm', weight: 28, scale: [0.9, 1.3] },
    { kind: 'rock', weight: 24, scale: [0.7, 1.2] },
    { kind: 'bush', weight: 16, scale: [0.7, 1.1] },
    { kind: 'reed', weight: 10, scale: [0.8, 1.2] },
  ],
  cave: [
    { kind: 'stalagmite', weight: 42, scale: [0.8, 1.5] },
    { kind: 'rock', weight: 26, scale: [0.7, 1.3] },
    { kind: 'crystal', weight: 14, scale: [0.8, 1.4] },
    { kind: 'mushroom', weight: 8, scale: [0.9, 1.5] },
  ],
  volcanic: [
    { kind: 'rock', weight: 34, scale: [0.8, 1.4] },
    { kind: 'boulder', weight: 24, scale: [0.9, 1.4] },
    { kind: 'deadTree', weight: 12, scale: [0.8, 1.1] },
    { kind: 'crystal', weight: 6, scale: [0.7, 1.1] },
  ],
  urban: [
    { kind: 'lamp', weight: 22, scale: [0.9, 1.1] },
    { kind: 'bench', weight: 16, scale: [0.9, 1.1] },
    { kind: 'bush', weight: 24, scale: [0.7, 1.0] },
    { kind: 'tree', weight: 20, scale: [0.8, 1.1] },
    { kind: 'flower', weight: 16, scale: [0.8, 1.2] },
  ],
  industrial: [
    { kind: 'container', weight: 26, scale: [0.9, 1.2] },
    { kind: 'pipe', weight: 22, scale: [0.9, 1.3] },
    { kind: 'barrel', weight: 24, scale: [0.9, 1.1] },
    { kind: 'crate', weight: 18, scale: [0.9, 1.2] },
  ],
  ruins: [
    { kind: 'pillar', weight: 32, scale: [0.9, 1.3] },
    { kind: 'rock', weight: 24, scale: [0.7, 1.2] },
    { kind: 'statue', weight: 8, scale: [0.9, 1.1] },
    { kind: 'bush', weight: 16, scale: [0.7, 1.1] },
    { kind: 'torch', weight: 8, scale: [0.9, 1.1] },
  ],
};

/**
 * Ein geladenes Gebiet: Szenengraph, Kollision, Hoehenfeld und Metadaten.
 *
 * Gebiete werden vollstaendig aus `AreaData` erzeugt. Alles Sichtbare ist
 * prozedural; die JSON-Datei beschreibt nur Layout und Parameter.
 */
export class AreaRuntime {
  readonly root = new THREE.Group();
  readonly data: AreaData;
  readonly field: TerrainField;
  readonly collision: CollisionGrid;
  readonly palette: BiomePalette;
  readonly doors: DoorTrigger[] = [];
  readonly grassZones: GrassZoneRuntime[] = [];
  readonly sky: THREE.Mesh | null = null;
  readonly water: THREE.Mesh | null = null;
  /** Objekte, die abhaengig von der Entfernung ein-/ausgeblendet werden. */
  private readonly cullables: { object: THREE.Object3D; x: number; z: number; distSq: number }[] = [];
  private disposed = false;

  constructor(
    data: AreaData,
    private readonly props: PropFactory,
    private readonly buildings: BuildingFactory,
    private readonly interiors: InteriorFactory | null = null,
  ) {
    this.data = data;
    this.root.name = `area:${data.id}`;
    this.palette = BIOME_PALETTES[data.biome];
    this.field = TerrainField.fromAreaData(
      data, data.terrain.flat ? 6 : 2, AreaRuntime.flattenZonesFor(data),
    );
    this.collision = new CollisionGrid(
      data.size[0], data.size[1], GameConfig.world.collisionCellSize,
    );

    const started = performance.now();
    const terrain = buildTerrainMesh(this.field, data.biome, { seed: data.seed });
    this.root.add(terrain.mesh);
    if (terrain.water) {
      this.root.add(terrain.water);
      this.water = terrain.water;
    }

    if (!data.indoor) {
      const radius = Math.max(data.size[0], data.size[1]) * 1.5 + 120;
      this.sky = buildSky(
        data.ambience?.skyTop ?? this.palette.skyTop,
        data.ambience?.skyBottom ?? this.palette.skyBottom,
        radius,
      );
      this.sky.position.set(data.size[0] / 2, 0, data.size[1] / 2);
      this.root.add(this.sky);
    }

    this.buildInterior();
    this.buildBuildings();
    this.buildProps();
    this.buildGrass();
    this.blockWater();

    log.info(
      `Gebiet "${data.id}" aufgebaut in ${Math.round(performance.now() - started)} ms ` +
      `(${this.cullables.length} Objekte, Belegung ${(this.collision.blockedRatio * 100).toFixed(1)} %)`,
    );
  }

  /**
   * Bauplaetze, die vor der Prop-Platzierung eingeebnet werden.
   * Ohne das stehen Gebaeude schief im Hang oder schweben ueber dem Boden.
   */
  private static flattenZonesFor(data: AreaData): FlattenZone[] {
    const zones: FlattenZone[] = [];
    for (const b of data.buildings ?? []) {
      // Grosszuegige Schaetzung der Grundflaeche - die genauen Masse stehen
      // erst nach dem Bau fest, eine leicht zu grosse Flaeche schadet nicht.
      const scale = b.scale ?? 1;
      const size = {
        house: 8, hut: 6, shop: 10, center: 12, gym: 17, stadium: 38,
        lab: 13, station: 14, tower: 8, warehouse: 18, ruin: 13,
      }[b.kind] * scale;
      zones.push({ x: b.pos[0], z: b.pos[1], width: size, depth: size, margin: 6 });
    }
    return zones;
  }

  // ------------------------------------------------------------------ Aufbau

  /** Baut Waende, Decke und Einrichtung eines Innenraums. */
  private buildInterior(): void {
    const style = this.data.interiorStyle;
    if (!style || !this.interiors) return;
    const result = this.interiors.build(style, this.data.size[0], this.data.size[1]);
    result.object.position.y = this.field.heightAt(this.data.size[0] / 2, this.data.size[1] / 2);
    this.root.add(result.object);
    this.interiors.applyBlockers(this.collision, result.blockers);
  }

  private buildBuildings(): void {
    for (const placement of this.data.buildings ?? []) {
      const accent = this.buildingAccent(placement);
      const result = this.buildings.create(placement, accent);
      const [x, z] = placement.pos;
      const rotation = placement.rotation ?? 0;
      const y = this.field.heightAt(x, z);
      result.object.position.set(x, y, z);
      result.object.rotation.y = rotation;
      this.root.add(result.object);
      this.addCullable(result.object, x, z, GameConfig.world.propCullDistance * 2.2);

      this.collision.addBox({
        x, z,
        width: result.footprint.width + 0.4,
        depth: result.footprint.depth + 0.4,
        rotation,
      });

      if (result.door && placement.interior) {
        const offset = placement.doorOffset ?? [result.door.x, result.door.z];
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const dx = x + offset[0] * cos - offset[1] * sin;
        const dz = z + offset[0] * sin + offset[1] * cos;
        this.doors.push({
          area: placement.interior,
          spawnPoint: placement.spawnPoint ?? 'entrance',
          x: dx, z: dz,
          radius: Math.max(1.3, result.door.width * 0.6),
          label: placement.label ?? 'Eingang',
        });
        // Tuerbereich begehbar halten.
        this.collision.clearBox({ x: dx, z: dz, width: result.door.width, depth: 1.6 });
      }
    }
  }

  private buildingAccent(placement: BuildingPlacement): string | undefined {
    if (placement.kind === 'center') return '#d8455f';
    if (placement.kind === 'shop') return '#3f7fbf';
    return undefined;
  }

  private buildProps(): void {
    const rng = new RNG(`props-${this.data.id}-${this.data.seed}`);
    const explicit = this.data.props ?? [];
    for (const placement of explicit) this.placeProp(placement, rng);

    // Automatische Streuung, wenn keine dichte Handplatzierung vorliegt.
    const area = this.data.size[0] * this.data.size[1];
    const targetDensity = this.data.indoor ? 0 : this.scatterDensity();
    const desired = Math.round(area * targetDensity);
    const missing = Math.max(0, desired - explicit.length);
    if (missing === 0) return;

    const table = BIOME_SCATTER[this.data.biome] ?? BIOME_SCATTER.grassland!;
    const weighted = table.map((e) => ({ value: e, weight: e.weight }));
    let placed = 0;
    let attempts = 0;
    const maxAttempts = missing * 8;

    while (placed < missing && attempts < maxAttempts) {
      attempts++;
      const x = rng.float(2, this.data.size[0] - 2);
      const z = rng.float(2, this.data.size[1] - 2);
      if (this.collision.isBlocked(x, z)) continue;
      if (this.field.isUnderWater(x, z)) continue;
      if (this.isInGrassZone(x, z)) continue;
      if (this.isNearDoor(x, z, 4)) continue;
      // Steile Haenge bleiben frei, sonst schweben Objekte.
      if (this.field.slopeAt(x, z) > 0.42) continue;
      const entry = rng.weighted(weighted);
      if (!entry) break;
      this.placeProp({
        kind: entry.kind,
        pos: [x, z],
        rotation: rng.float(0, Math.PI * 2),
        scale: rng.float(entry.scale[0], entry.scale[1]),
        variant: rng.int(0, 999),
      }, rng);
      placed++;
    }
  }

  private scatterDensity(): number {
    switch (this.data.kind) {
      case 'town':
      case 'city':
        return 0.008;
      case 'forest':
        return 0.055;
      case 'cave':
        return 0.03;
      case 'wildarea':
        return 0.022;
      case 'route':
        return 0.028;
      default:
        return 0.02;
    }
  }

  private placeProp(placement: PropPlacement, rng: RNG): void {
    const kind = placement.kind as PropKind;
    const result = this.props.create(
      kind, placement.variant ?? rng.int(0, 999), this.palette, placement.scale ?? 1,
    );
    const [x, z] = placement.pos;
    const y = this.field.heightAt(x, z);
    result.object.position.set(x, y, z);
    result.object.rotation.y = placement.rotation ?? 0;
    this.root.add(result.object);
    this.addCullable(result.object, x, z, GameConfig.world.propCullDistance);
    if (result.collisionRadius > 0) {
      this.collision.addCircle({ x, z, radius: result.collisionRadius });
    }
  }

  private buildGrass(): void {
    const zones = this.data.grassZones ?? [];
    if (zones.length === 0) return;
    const rng = new RNG(`grass-${this.data.id}`);
    const tufts: { x: number; y: number; z: number; scale: number }[] = [];

    for (const zone of zones) {
      this.grassZones.push({ ...zone });
      const density = zone.density ?? 1.6;
      const count = Math.min(4200, Math.round(zone.width * zone.depth * density));
      for (let i = 0; i < count; i++) {
        const x = zone.x + rng.float(-zone.width / 2, zone.width / 2);
        const z = zone.z + rng.float(-zone.depth / 2, zone.depth / 2);
        if (this.field.isUnderWater(x, z)) continue;
        tufts.push({
          x, y: this.field.heightAt(x, z) - 0.05, z,
          scale: rng.float(0.75, 1.35),
        });
      }
    }
    if (tufts.length === 0) return;
    const mesh = this.props.createGrassInstances(tufts, this.palette);
    this.root.add(mesh);
  }

  /** Tiefes Wasser blockieren, damit der Spieler nicht hineinlaeuft. */
  private blockWater(): void {
    if (this.field.waterLevel === null) return;
    const step = GameConfig.world.collisionCellSize;
    const deepThreshold = this.field.waterLevel - 0.55;
    for (let z = step / 2; z < this.data.size[1]; z += step) {
      for (let x = step / 2; x < this.data.size[0]; x += step) {
        if (this.field.heightAt(x, z) < deepThreshold) this.collision.setBlocked(x, z, true);
      }
    }
  }

  private addCullable(object: THREE.Object3D, x: number, z: number, distance: number): void {
    this.cullables.push({ object, x, z, distSq: distance * distance });
  }

  // ------------------------------------------------------------------ Zugriff

  isInGrassZone(x: number, z: number): boolean {
    for (const zone of this.data.grassZones ?? []) {
      if (Math.abs(x - zone.x) <= zone.width / 2 && Math.abs(z - zone.z) <= zone.depth / 2) {
        return true;
      }
    }
    return false;
  }

  isInWaterZone(x: number, z: number): boolean {
    if (this.field.isUnderWater(x, z)) return true;
    for (const zone of this.data.waterZones ?? []) {
      if (Math.abs(x - zone.x) <= zone.width / 2 && Math.abs(z - zone.z) <= zone.depth / 2) {
        return true;
      }
    }
    return false;
  }

  private isNearDoor(x: number, z: number, radius: number): boolean {
    return this.doors.some((d) => Math.hypot(d.x - x, d.z - z) < radius + d.radius);
  }

  getSpawnPoint(id: string): { x: number; z: number; facing: number } {
    const point = this.data.spawnPoints.find((p) => p.id === id) ?? this.data.spawnPoints[0];
    if (!point) {
      return { x: this.data.size[0] / 2, z: this.data.size[1] / 2, facing: 0 };
    }
    return { x: point.pos[0], z: point.pos[1], facing: point.facing ?? 0 };
  }

  heightAt(x: number, z: number): number {
    return this.field.heightAt(x, z);
  }

  /**
   * Blendet weit entfernte Objekte aus.
   * Spart Draw Calls, ohne die Weltdaten anzutasten (Anforderung 48).
   */
  updateCulling(px: number, pz: number): void {
    for (const entry of this.cullables) {
      const dx = entry.x - px;
      const dz = entry.z - pz;
      const visible = dx * dx + dz * dz <= entry.distSq;
      if (entry.object.visible !== visible) entry.object.visible = visible;
    }
  }

  get objectCount(): number { return this.cullables.length; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      // Nur gebietsspezifische Geometrien freigeben; geteilte bleiben im Cache.
      if (mesh.geometry && (mesh.name === 'terrain' || mesh.name === 'water' || mesh.name === 'sky')) {
        mesh.geometry.dispose();
      }
      if (mesh.name === 'sky') {
        const mat = mesh.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
    this.root.clear();
    this.root.removeFromParent();
    this.cullables.length = 0;
  }
}
