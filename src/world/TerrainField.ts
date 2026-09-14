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
  private readonly noise: ValueNoise2D;
  private readonly detailNoise: ValueNoise2D;

  constructor(private readonly options: TerrainOptions) {
    this.width = options.width;
    this.depth = options.depth;
    this.resolution = options.resolution;
    this.waterLevel = options.waterLevel;
    this.cols = Math.max(2, Math.ceil(options.width / options.resolution) + 1);
    this.rows = Math.max(2, Math.ceil(options.depth / options.resolution) + 1);
    this.heights = new Float32Array(this.cols * this.rows);
    this.noise = new ValueNoise2D(options.seed);
    this.detailNoise = new ValueNoise2D(options.seed + 7919);
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

  /**
   * Gelaendehoehe ohne Wege und Bauplaetze.
   *
   * Wird auch von der Wegglaettung gebraucht: ein Weg soll sich an die
   * Landschaft anlegen, nicht an eine feste Hoehe.
   */
  private rawHeight(x: number, z: number): number {
    const o = this.options;
    let h = o.baseHeight;
    if (!o.flat && o.amplitude > 0) {
      // Kleines "gain" laesst die hohen Oktaven kaum durch: das Gelaende
      // besteht dadurch aus wenigen grossen Formen statt aus vielen
      // kleinen Buckeln. Genau die haben vorher jede Fernsicht zerhackt.
      const n = o.ridged
        ? this.noise.ridged(x * o.frequency, z * o.frequency, o.octaves)
        : this.noise.fbm(x * o.frequency, z * o.frequency, o.octaves, 2, 0.38);
      h += (n - 0.4) * o.amplitude;
      // Sehr flache, langwellige Unruhe gegen eine zu glatte Oberflaeche.
      h += (this.detailNoise.fbm(x * o.frequency * 2.1, z * o.frequency * 2.1, 2) - 0.5)
        * o.amplitude * 0.05;
    }
    if (o.cliffBorder) h += this.borderRise(x, z);
    return h;
  }

  private generate(): void {
    for (let r = 0; r < this.rows; r++) {
      const z = (r / (this.rows - 1)) * this.depth;
      for (let c = 0; c < this.cols; c++) {
        const x = (c / (this.cols - 1)) * this.width;
        this.heights[r * this.cols + c] = this.applyPaths(x, z, this.rawHeight(x, z));
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
   * Zieht das Gelaende entlang der Wege glatt.
   *
   * Frueher wurde jeder Weg auf "baseHeight" gezogen. Damit war jede Route
   * schnurgerade eben und schnitt eine Rinne durch die Huegel: ein
   * "Anstieg" gewann keinen einzigen Meter Hoehe und am Wegrand standen
   * Kanten. Jetzt ist das Ziel die geglaettete Gelaendehoehe auf der
   * Wegachse - der Weg rollt mit der Landschaft, ist aber quer zur
   * Laufrichtung eben.
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
        result = result * (1 - blend) + this.pathHeight(x, z, a, b) * blend;
      }
    }
    return result;
  }

  /**
   * Geglaettete Hoehe der Wegachse am naechstgelegenen Punkt.
   *
   * Es wird nicht nur ein Punkt abgetastet, sondern ein kurzes Stueck der
   * Achse gemittelt. Ein einzelner Punkt uebernaehme das feine Rauschen und
   * der Weg wuerde wellig.
   */
  private pathHeight(
    x: number, z: number, a: [number, number], b: [number, number],
  ): number {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lenSq = dx * dx + dz * dz;
    const t = lenSq > 1e-6
      ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / lenSq, 0, 1)
      : 0;
    const px = a[0] + dx * t;
    const pz = a[1] + dz * t;
    const len = Math.sqrt(lenSq) || 1;
    const ux = dx / len;
    const uz = dz / len;

    let sum = 0;
    let weight = 0;
    for (let i = -3; i <= 3; i++) {
      const w = 4 - Math.abs(i);
      sum += this.rawHeight(px + ux * i * 4, pz + uz * i * 4) * w;
      weight += w;
    }
    return sum / weight;
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
