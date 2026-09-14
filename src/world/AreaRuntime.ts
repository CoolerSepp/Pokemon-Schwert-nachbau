import * as THREE from 'three';
import type { AreaData, BuildingPlacement, PropPlacement } from '@/data/schema';
import { GameConfig } from '@/core/Config';
import { RNG } from '@/core/RNG';
import { Logger } from '@/core/Logger';
import { TerrainField, type FlattenZone } from './TerrainField';
import { CollisionGrid } from './CollisionGrid';
import {
  buildTerrainMesh, buildSky, buildBackdrop, backdropOuterRadius, BIOME_PALETTES,
  type BiomePalette, type PathSegment,
} from './TerrainMesh';
import { PropFactory, type PropKind } from './PropFactory';
import { StaticBatcher } from './StaticBatcher';
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
  /** Zugangsvoraussetzung, falls die Tuer bewacht ist. */
  requires?: { storyStage?: number; badge?: number; flag?: string };
  blockedText?: string;
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
/**
 * Dreht einen gebaeudelokalen Versatz in Weltkoordinaten.
 *
 * Muss exakt der Drehung des Objekts um die Y-Achse entsprechen: dort wird
 * lokal (x, z) zu (x*cos + z*sin, -x*sin + z*cos). Mit einem Vorzeichenfehler
 * landet der Tuer-Ausloeser auf der gegenueberliegenden Hauswand - die
 * sichtbare Tuer waere dann unbenutzbar.
 */
function rotateOffset(
  baseX: number, baseZ: number, offsetX: number, offsetZ: number, rotation: number,
): [number, number] {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [
    baseX + offsetX * cos + offsetZ * sin,
    baseZ - offsetX * sin + offsetZ * cos,
  ];
}

export class AreaRuntime {
  readonly root = new THREE.Group();
  readonly data: AreaData;
  readonly field: TerrainField;
  readonly collision: CollisionGrid;
  readonly palette: BiomePalette;
  readonly doors: DoorTrigger[] = [];
  readonly grassZones: GrassZoneRuntime[] = [];
  readonly sky: THREE.Mesh | null = null;
  /** Bergkulisse hinter dem Spielfeld (nur im Freien). */
  readonly backdrop: THREE.Group | null = null;
  /** Radius der Himmelskugel - die Kamera muss weiter sehen als bis dorthin. */
  readonly skyRadius: number = 0;
  readonly water: THREE.Mesh | null = null;
  /** Objekte, die abhaengig von der Entfernung ein-/ausgeblendet werden. */
  private readonly cullables: { object: THREE.Object3D; x: number; z: number; distSq: number }[] = [];
  /** Wege des Gebietes - beeinflussen Bodenfarbe und Streudetails. */
  private pathSegments: PathSegment[] = [];
  /** Requisiten vor dem Zusammenfassen. */
  private readonly propObjects: { object: THREE.Object3D; x: number; z: number }[] = [];
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
    this.pathSegments = AreaRuntime.pathsFor(data);
    const terrain = buildTerrainMesh(this.field, data.biome, {
      seed: data.seed, paths: data.indoor ? [] : this.pathSegments,
      textures: this.props.textures,
    });
    this.root.add(terrain.mesh);
    if (terrain.water) {
      this.root.add(terrain.water);
      this.water = terrain.water;
    }

    if (!data.indoor) {
      const backdropInner = Math.max(data.size[0], data.size[1]) * 0.62;
      // Der Himmel muss die Bergkulisse umschliessen, sonst ragen die
      // Gipfel durch die Himmelskugel hindurch.
      const radius = Math.max(
        Math.max(data.size[0], data.size[1]) * 1.5 + 120,
        backdropOuterRadius(backdropInner) + 160,
      );
      this.skyRadius = radius;
      this.sky = buildSky(
        data.ambience?.skyTop ?? this.palette.skyTop,
        data.ambience?.skyBottom ?? this.palette.skyBottom,
        radius,
      );
      this.sky.position.set(data.size[0] / 2, 0, data.size[1] / 2);
      this.root.add(this.sky);

      // Bergkulisse ausserhalb des Spielfelds: gibt dem Horizont Tiefe.
      this.backdrop = buildBackdrop(this.palette, backdropInner, data.seed);
      this.backdrop.position.set(
        data.size[0] / 2, this.field.heightAt(data.size[0] / 2, data.size[1] / 2) - 2,
        data.size[1] / 2,
      );
      this.root.add(this.backdrop);
    }

    this.buildInterior();
    this.buildBuildings();
    this.buildProps();
    this.batchProps();
    this.buildGrass();
    this.buildGroundDetail();
    this.blockWater();
    this.clearConnections();

    log.info(
      `Gebiet "${data.id}" aufgebaut in ${Math.round(performance.now() - started)} ms ` +
      `(${this.cullables.length} Objekte, Belegung ${(this.collision.blockedRatio * 100).toFixed(1)} %)`,
    );
  }

  /**
   * Wegenetz eines Gebietes: von jeder Haustuer zur Ortsmitte und von dort
   * zu den Ausgaengen. Das ergibt begehbar wirkende Plaetze statt einer
   * gleichfoermigen Wiese.
   */
  private static pathsFor(data: AreaData): PathSegment[] {
    if (data.indoor) return [];
    const segments: PathSegment[] = [];
    const centerX = data.size[0] / 2;
    const centerZ = data.size[1] / 2;

    for (const b of data.buildings ?? []) {
      const rotation = b.rotation ?? 0;
      const offset = b.doorOffset ?? [0, 3];
      const [dx, dz] = rotateOffset(b.pos[0], b.pos[1], offset[0], offset[1], rotation);
      segments.push({ ax: dx, az: dz, bx: centerX, bz: centerZ, width: 2.2 });
    }

    for (const conn of data.connections) {
      const t = conn.trigger;
      segments.push({
        ax: t.x + t.width / 2, az: t.z + t.depth / 2,
        bx: centerX, bz: centerZ, width: 2.6,
      });
    }
    // Ohne Gebaeude und mit nur zwei Ausgaengen (Routen): direkter Weg von
    // Ausgang zu Ausgang statt eines Sterns ueber die Mitte.
    if ((data.buildings ?? []).length === 0 && data.connections.length === 2) {
      const [a, b] = data.connections;
      segments.length = 0;
      segments.push({
        ax: a!.trigger.x + a!.trigger.width / 2, az: a!.trigger.z + a!.trigger.depth / 2,
        bx: centerX, bz: centerZ, width: 2.8,
      });
      segments.push({
        ax: centerX, az: centerZ,
        bx: b!.trigger.x + b!.trigger.width / 2, bz: b!.trigger.z + b!.trigger.depth / 2,
        width: 2.8,
      });
    }
    return segments;
  }

  /** Abstand zum naechsten Weg. */
  private distanceToPath(x: number, z: number): number {
    let best = Number.POSITIVE_INFINITY;
    for (const s of this.pathSegments) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const lenSq = dx * dx + dz * dz;
      const t = lenSq === 0 ? 0
        : Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / lenSq));
      const dist = Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)) - s.width / 2;
      if (dist < best) best = dist;
    }
    return best;
  }

  /**
   * Streudetails auf dem Boden: kurze Halme, Blumen und Kiesel.
   *
   * Drei Instanz-Zeichnungen fuer das ganze Gebiet. Wege und Gebaeude bleiben
   * frei, damit die Details nicht durch Waende wachsen.
   */
  private buildGroundDetail(): void {
    if (this.data.indoor) return;
    const rng = new RNG(`detail-${this.data.id}`);
    const area = this.data.size[0] * this.data.size[1];
    const palette = this.palette;

    const blades: { x: number; y: number; z: number; scale: number; tint: number }[] = [];
    const flowers: typeof blades = [];
    const pebbles: typeof blades = [];

    // Halme muessen dicht stehen, damit sie als Bewuchs und nicht als
    // einzelne Objekte gelesen werden. Sie wachsen in Buescheln statt
    // gleichmaessig verteilt: bei gleicher Anzahl wirkt die Wiese dadurch
    // deutlich dichter, weil freie Flaechen und dichte Flecken abwechseln.
    const bladeTarget = Math.min(11000, Math.round(area * 0.62));
    const flowerTarget = Math.min(1300, Math.round(area * 0.018));
    const pebbleTarget = Math.min(900, Math.round(area * 0.012));
    const attempts = (bladeTarget + flowerTarget + pebbleTarget) * 2;
    /** Wie viele Halme aus einem Bueschel wachsen. */
    const clumpSize = 5;

    let placedBlades = 0;
    let placedFlowers = 0;
    let placedPebbles = 0;

    for (let i = 0; i < attempts; i++) {
      if (placedBlades >= bladeTarget && placedFlowers >= flowerTarget
        && placedPebbles >= pebbleTarget) break;
      const x = rng.float(0.5, this.data.size[0] - 0.5);
      const z = rng.float(0.5, this.data.size[1] - 0.5);
      if (this.collision.isBlocked(x, z)) continue;
      if (this.field.isUnderWater(x, z)) continue;
      if (this.field.slopeAt(x, z) > 0.5) continue;

      const onPath = this.distanceToPath(x, z) < 0.3;
      const y = this.field.heightAt(x, z) - 0.02;
      const tint = rng.float(0, 1);

      if (onPath) {
        // Auf Wegen liegen Kiesel statt Gras.
        if (placedPebbles < pebbleTarget) {
          pebbles.push({ x, y, z, scale: rng.float(0.35, 0.8), tint });
          placedPebbles++;
        }
        continue;
      }
      if (placedBlades < bladeTarget && rng.chance(0.93)) {
        // Ein Bueschel: mehrere Halme dicht beieinander, leicht versetzt.
        const baseScale = rng.float(0.6, 1.3);
        for (let k = 0; k < clumpSize && placedBlades < bladeTarget; k++) {
          const a = rng.float(0, Math.PI * 2);
          const r = k === 0 ? 0 : rng.float(0.12, 0.62);
          const bx = x + Math.cos(a) * r;
          const bz = z + Math.sin(a) * r;
          blades.push({
            x: bx, y: this.field.heightAt(bx, bz) - 0.02, z: bz,
            scale: baseScale * rng.float(0.7, 1.15),
            tint: Math.min(1, Math.max(0, tint + rng.float(-0.12, 0.12))),
          });
          placedBlades++;
        }
      } else if (placedFlowers < flowerTarget) {
        flowers.push({ x, y, z, scale: rng.float(0.75, 1.3), tint });
        placedFlowers++;
      }
    }

    for (const [kind, list] of [
      ['blade', blades], ['flower', flowers], ['pebble', pebbles],
    ] as const) {
      if (list.length === 0) continue;
      const mesh = this.props.createDetailInstances(kind, list, palette);
      this.root.add(mesh);
    }
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
  /**
   * Haelt alle Gebietsuebergaenge frei.
   *
   * Moebel, Requisiten und Waende werden unabhaengig voneinander gesetzt;
   * ohne diesen letzten Schritt kann ein Ausloeser zugebaut sein und das
   * Zielgebiet waere unerreichbar (so war die Treppe ins Obergeschoss
   * durch das Treppenmoebel selbst versperrt).
   */
  private clearConnections(): void {
    for (const conn of this.data.connections) {
      const t = conn.trigger;
      this.collision.clearBox({
        x: t.x + t.width / 2, z: t.z + t.depth / 2,
        width: t.width, depth: t.depth,
      });
    }
  }

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

      // Ein Gebaeude besteht aus vielen kleinen Teilen (Fenster, Rahmen,
      // Sims, Balken). Einzeln gezeichnet ergeben schon wenige Haeuser
      // mehrere hundert Zeichenaufrufe, deshalb wird jedes Gebaeude zu
      // wenigen Meshes zusammengefasst.
      const batcher = new StaticBatcher();
      batcher.add(result.object);
      const merged = batcher.build('building');
      const object = merged ?? result.object;
      this.root.add(object);
      this.addCullable(object, x, z, GameConfig.world.propCullDistance * 2.2);

      this.collision.addBox({
        x, z,
        width: result.footprint.width + 0.4,
        depth: result.footprint.depth + 0.4,
        rotation,
      });

      if (result.door && placement.interior) {
        const offset = placement.doorOffset ?? [result.door.x, result.door.z];
        const [dx, dz] = rotateOffset(x, z, offset[0], offset[1], rotation);
        this.doors.push({
          area: placement.interior,
          spawnPoint: placement.spawnPoint ?? 'entrance',
          x: dx, z: dz,
          radius: Math.max(1.3, result.door.width * 0.6),
          label: placement.label ?? 'Eingang',
          requires: placement.requires,
          blockedText: placement.blockedText,
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
      // Spawnpunkte und Gebietsuebergaenge freihalten: sonst steht die Kamera
      // beim Betreten in einer Baumkrone.
      if (this.isNearEntry(x, z, 7)) continue;
      // Wege bleiben frei begehbar und sichtbar.
      if (this.distanceToPath(x, z) < 1.6) continue;
      // Sehr steile Haenge bleiben frei, sonst schweben Objekte. Maessige
      // Haenge duerfen bewachsen sein - kahle Boeschungen wirken kuenstlich.
      if (this.field.slopeAt(x, z) > 0.62) continue;
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
        // Orte sind weitlaeufig, aber keine Waelder: die Dichte ist so
        // gewaehlt, dass die Zahl der Streuobjekte trotz der gewachsenen
        // Flaeche etwa gleich bleibt.
        return 0.012;
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

  /**
   * Fasst die platzierten Requisiten kachelweise zu wenigen Zeichenaufrufen
   * zusammen. Die Kacheln bleiben einzeln kullbar, damit entfernte Teile des
   * Gebietes weiterhin uebersprungen werden.
   */
  private batchProps(): void {
    if (this.propObjects.length === 0) return;
    const tile = GameConfig.world.propBatchTileSize;
    const groups = new Map<string, { objects: THREE.Object3D[]; x: number; z: number }>();

    for (const entry of this.propObjects) {
      const key = `${Math.floor(entry.x / tile)}:${Math.floor(entry.z / tile)}`;
      let group = groups.get(key);
      if (!group) {
        group = { objects: [], x: 0, z: 0 };
        groups.set(key, group);
      }
      group.objects.push(entry.object);
      group.x += entry.x;
      group.z += entry.z;
    }

    const before = this.propObjects.length;
    let batches = 0;
    for (const group of groups.values()) {
      const batcher = new StaticBatcher();
      for (const object of group.objects) batcher.add(object);
      const merged = batcher.build('props');
      for (const object of group.objects) this.root.remove(object);
      if (!merged) continue;
      this.root.add(merged);
      batches++;
      const centerX = group.x / group.objects.length;
      const centerZ = group.z / group.objects.length;
      // Reichweite um die halbe Kacheldiagonale erweitern, damit am Rand
      // stehende Objekte nicht zu frueh verschwinden.
      this.addCullable(
        merged, centerX, centerZ,
        GameConfig.world.propCullDistance + tile * 0.75,
      );
    }
    this.propObjects.length = 0;
    log.debug(`Gebiet "${this.data.id}": ${before} Requisiten in ${batches} Stapeln`);
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
    this.propObjects.push({ object: result.object, x, z });
    const rotation = placement.rotation ?? 0;
    if (result.collisionBox) {
      this.collision.addBox({
        x, z,
        width: result.collisionBox.width,
        depth: result.collisionBox.depth,
        rotation,
      });
    } else if (result.collisionRadius > 0) {
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

  /** Naehe zu Spawnpunkten und Uebergangsflaechen. */
  private isNearEntry(x: number, z: number, radius: number): boolean {
    for (const point of this.data.spawnPoints ?? []) {
      if (Math.hypot(point.pos[0] - x, point.pos[1] - z) < radius) return true;
    }
    for (const conn of this.data.connections) {
      const t = conn.trigger;
      const cx = Math.max(t.x, Math.min(x, t.x + t.width));
      const cz = Math.max(t.z, Math.min(z, t.z + t.depth));
      if (Math.hypot(cx - x, cz - z) < radius) return true;
    }
    return false;
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
      const ownGeometry = mesh.name === 'terrain' || mesh.name === 'water'
        || mesh.name === 'sky' || mesh.parent?.name === 'props'
        || mesh.parent?.name === 'building';
      if (mesh.geometry && ownGeometry) mesh.geometry.dispose();
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
