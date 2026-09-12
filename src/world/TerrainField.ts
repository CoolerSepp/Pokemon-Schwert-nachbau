import { ValueNoise2D } from '@/core/Noise';
import { clamp, clamp01, smoothstep } from '@/core/MathUtils';
import type { AreaData } from '@/data/schema';

export interface TerrainPath {
  points: [number, number][];
  width: number;
}

/** Bereich, der auf eine gemeinsame Hoehe eingeebnet wird (z.B. Bauplaetze). */
export interface FlattenZone {
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Breite des weichen Uebergangs nach aussen. */
  margin?: number;
}

export interface TerrainOptions {
  width: number;
  depth: number;
  seed: number;
  baseHeight: number;
  amplitude: number;
  frequency: number;
  octaves: number;
  waterLevel: number | null;
  cliffBorder: boolean;
  flat: boolean;
  ridged: boolean;
  paths: TerrainPath[];
  /** Flaechen, die eingeebnet werden - Gebaeude sollen nicht im Hang stecken. */
  flattenZones: FlattenZone[];
  /** Abtastabstand in Metern. Kleiner = genauer, aber teurer. */
  resolution: number;
}

/**
 * Hoehenfeld eines Gebiets.
 *
 * Wird sowohl fuer die Mesh-Erzeugung als auch fuer Kollision und Platzierung
 * benutzt; dadurch stimmen Darstellung und Physik zwangslaeufig ueberein.
 * Rein rechnerisch - keine Three.js-Abhaengigkeit, daher unit-testbar.
 */
export class TerrainField {
  readonly width: number;
  readonly depth: number;
  readonly resolution: number;
  readonly cols: number;
  readonly rows: number;
  readonly waterLevel: number | null;
  private readonly heights: Float32Array;
  private minH = Infinity;
  private maxH = -Infinity;

  constructor(private readonly options: TerrainOptions) {
    this.width = options.width;
    this.depth = options.depth;
    this.resolution = options.resolution;
    this.waterLevel = options.waterLevel;
    this.cols = Math.max(2, Math.ceil(options.width / options.resolution) + 1);
    this.rows = Math.max(2, Math.ceil(options.depth / options.resolution) + 1);
    this.heights = new Float32Array(this.cols * this.rows);
    this.generate();
  }

  static fromAreaData(
    area: AreaData, resolution = 2, flattenZones: FlattenZone[] = [],
  ): TerrainField {
    const t = area.terrain;
    return new TerrainField({
      flattenZones,
      width: area.size[0],
      depth: area.size[1],
      seed: area.seed,
      baseHeight: t.baseHeight,
      amplitude: t.flat ? 0 : t.amplitude,
      frequency: t.frequency,
      octaves: t.octaves ?? 4,
      waterLevel: t.waterLevel ?? null,
      cliffBorder: t.cliffBorder ?? false,
      flat: t.flat ?? false,
      ridged: t.ridged ?? false,
      paths: t.paths ?? [],
      resolution,
    });
  }

  private generate(): void {
    const o = this.options;
    const noise = new ValueNoise2D(o.seed);
    const detail = new ValueNoise2D(o.seed + 7919);

    for (let r = 0; r < this.rows; r++) {
      const z = (r / (this.rows - 1)) * this.depth;
      for (let c = 0; c < this.cols; c++) {
        const x = (c / (this.cols - 1)) * this.width;
        let h = o.baseHeight;

        if (!o.flat && o.amplitude > 0) {
          const n = o.ridged
            ? noise.ridged(x * o.frequency, z * o.frequency, o.octaves)
            : noise.fbm(x * o.frequency, z * o.frequency, o.octaves);
          h += (n - 0.4) * o.amplitude;
          // Feindetail fuer eine weniger "digitale" Oberflaeche.
          h += (detail.fbm(x * o.frequency * 4.3, z * o.frequency * 4.3, 2) - 0.5)
            * o.amplitude * 0.12;
        }

        if (o.cliffBorder) h += this.borderRise(x, z);
        h = this.applyPaths(x, z, h);

        this.heights[r * this.cols + c] = h;
      }
    }

    this.applyFlattenZones();

    for (let i = 0; i < this.heights.length; i++) {
      const h = this.heights[i]!;
      if (h < this.minH) this.minH = h;
      if (h > this.maxH) this.maxH = h;
    }
  }

  /**
   * Ebnet Bauplaetze ein.
   *
   * Zwei Durchlaeufe: erst die Durchschnittshoehe der Flaeche bestimmen, dann
   * alle Zellen mit weichem Uebergang darauf ziehen. So stehen Gebaeude nicht
   * schief im Hang und versinken nicht halb im Boden.
   */
  private applyFlattenZones(): void {
    const zones = this.options.flattenZones;
    if (zones.length === 0) return;

    for (const zone of zones) {
      const margin = zone.margin ?? 4;
      const hw = zone.width / 2;
      const hd = zone.depth / 2;

      const minC = this.colIndex(zone.x - hw - margin);
      const maxC = this.colIndex(zone.x + hw + margin);
      const minR = this.rowIndex(zone.z - hd - margin);
      const maxR = this.rowIndex(zone.z + hd + margin);

      // Durchschnittshoehe der eigentlichen Baugrube bestimmen.
      let sum = 0;
      let count = 0;
      for (let r = this.rowIndex(zone.z - hd); r <= this.rowIndex(zone.z + hd); r++) {
        for (let c = this.colIndex(zone.x - hw); c <= this.colIndex(zone.x + hw); c++) {
          sum += this.heights[r * this.cols + c]!;
          count++;
        }
      }
      if (count === 0) continue;
      const target = sum / count;

      for (let r = minR; r <= maxR; r++) {
        const z = (r / (this.rows - 1)) * this.depth;
        for (let c = minC; c <= maxC; c++) {
          const x = (c / (this.cols - 1)) * this.width;
          const dx = Math.max(0, Math.abs(x - zone.x) - hw);
          const dz = Math.max(0, Math.abs(z - zone.z) - hd);
          const dist = Math.hypot(dx, dz);
          if (dist > margin) continue;
          const blend = 1 - smoothstep(0, margin, dist);
          const idx = r * this.cols + c;
          this.heights[idx] = this.heights[idx]! * (1 - blend) + target * blend;
        }
      }
    }
  }

  private colIndex(x: number): number {
    return clamp(Math.round((x / this.width) * (this.cols - 1)), 0, this.cols - 1);
  }

  private rowIndex(z: number): number {
    return clamp(Math.round((z / this.depth) * (this.rows - 1)), 0, this.rows - 1);
  }

  /** Randanhebung: begrenzt das Gebiet sichtbar durch Felswaende. */
  private borderRise(x: number, z: number): number {
    const margin = Math.min(14, Math.min(this.width, this.depth) * 0.14);
    const dx = Math.min(x, this.width - x);
    const dz = Math.min(z, this.depth - z);
    const d = Math.min(dx, dz);
    if (d >= margin) return 0;
    // Smoothstep statt quadratischem Verlauf: die Kante wirkt sonst wie eine
    // abrupte Wand am Bildrand.
    const t = 1 - smoothstep(0, margin, d);
    return t * 9.5;
  }

  /**
   * Glaettet das Terrain entlang von Wegen.
   * Wege interpolieren zur Hoehe des naechstgelegenen Streckenpunkts.
   */
  private applyPaths(x: number, z: number, height: number): number {
    const o = this.options;
    if (o.paths.length === 0) return height;
    let result = height;
    for (const path of o.paths) {
      for (let i = 0; i < path.points.length - 1; i++) {
        const a = path.points[i]!;
        const b = path.points[i + 1]!;
        const dist = distanceToSegment(x, z, a[0], a[1], b[0], b[1]);
        const half = path.width * 0.5;
        if (dist > half + 3.5) continue;
        // Innerhalb des Weges vollstaendig eben, aussen weicher Uebergang.
        const blend = 1 - smoothstep(half, half + 3.5, dist);
        result = result * (1 - blend) + o.baseHeight * blend;
      }
    }
    return result;
  }

  /** Hoehe an beliebiger Weltposition (bilinear interpoliert). */
  heightAt(x: number, z: number): number {
    const gx = clamp((x / this.width) * (this.cols - 1), 0, this.cols - 1);
    const gz = clamp((z / this.depth) * (this.rows - 1), 0, this.rows - 1);
    const c0 = Math.floor(gx);
    const r0 = Math.floor(gz);
    const c1 = Math.min(this.cols - 1, c0 + 1);
    const r1 = Math.min(this.rows - 1, r0 + 1);
    const tx = gx - c0;
    const tz = gz - r0;

    const h00 = this.heights[r0 * this.cols + c0]!;
    const h10 = this.heights[r0 * this.cols + c1]!;
    const h01 = this.heights[r1 * this.cols + c0]!;
    const h11 = this.heights[r1 * this.cols + c1]!;
    const top = h00 + (h10 - h00) * tx;
    const bottom = h01 + (h11 - h01) * tx;
    return top + (bottom - top) * tz;
  }

  /** Oberflaechennormale, genaehert ueber zentrale Differenzen. */
  normalAt(x: number, z: number): [number, number, number] {
    const e = this.resolution;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    const nx = hl - hr;
    const nz = hd - hu;
    const ny = 2 * e;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  }

  /** Steigung (0 = eben, 1 = senkrecht) an einer Position. */
  slopeAt(x: number, z: number): number {
    return 1 - this.normalAt(x, z)[1];
  }

  isUnderWater(x: number, z: number): boolean {
    return this.waterLevel !== null && this.heightAt(x, z) < this.waterLevel;
  }

  get minHeight(): number { return this.minH; }
  get maxHeight(): number { return this.maxH; }

  /** Rohdaten fuer die Mesh-Erzeugung. */
  get raw(): Readonly<Float32Array> { return this.heights; }

  contains(x: number, z: number): boolean {
    return x >= 0 && x <= this.width && z >= 0 && z <= this.depth;
  }

  /** Begrenzt eine Position auf das Gebiet (mit Rand). */
  clampToBounds(x: number, z: number, margin = 1): [number, number] {
    return [
      clamp(x, margin, this.width - margin),
      clamp(z, margin, this.depth - margin),
    ];
  }
}

export function distanceToSegment(
  px: number, pz: number, ax: number, az: number, bx: number, bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - ax, pz - az);
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / lenSq);
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
