import { clamp } from '@/core/MathUtils';

export interface CircleObstacle { x: number; z: number; radius: number; }
export interface BoxObstacle { x: number; z: number; width: number; depth: number; rotation?: number; }

/**
 * Belegungsgitter fuer die Weltkollision.
 *
 * Ein Gitter statt echter Geometrie-Kollision, weil die Welt aus vielen
 * tausend prozeduralen Objekten besteht: Rasterabfragen sind O(1) und
 * unabhaengig von der Objektanzahl. Aufloesung ist konfigurierbar
 * (Standard 0.5 m).
 */
export class CollisionGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;

  constructor(
    readonly width: number,
    readonly depth: number,
    readonly cellSize: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(depth / cellSize));
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  private index(col: number, row: number): number {
    return row * this.cols + col;
  }

  colOf(x: number): number {
    return clamp(Math.floor(x / this.cellSize), 0, this.cols - 1);
  }

  rowOf(z: number): number {
    return clamp(Math.floor(z / this.cellSize), 0, this.rows - 1);
  }

  isBlockedCell(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return true;
    return this.blocked[this.index(col, row)] === 1;
  }

  isBlocked(x: number, z: number): boolean {
    if (x < 0 || z < 0 || x > this.width || z > this.depth) return true;
    return this.isBlockedCell(this.colOf(x), this.rowOf(z));
  }

  setBlocked(x: number, z: number, value = true): void {
    if (x < 0 || z < 0 || x > this.width || z > this.depth) return;
    this.blocked[this.index(this.colOf(x), this.rowOf(z))] = value ? 1 : 0;
  }

  addCircle(obstacle: CircleObstacle): void {
    const { x, z, radius } = obstacle;
    const minC = this.colOf(x - radius);
    const maxC = this.colOf(x + radius);
    const minR = this.rowOf(z - radius);
    const maxR = this.rowOf(z + radius);
    const rSq = radius * radius;
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cx = (c + 0.5) * this.cellSize;
        const cz = (r + 0.5) * this.cellSize;
        const dx = cx - x;
        const dz = cz - z;
        if (dx * dx + dz * dz <= rSq) this.blocked[this.index(c, r)] = 1;
      }
    }
  }

  addBox(obstacle: BoxObstacle): void {
    const { x, z, width, depth, rotation = 0 } = obstacle;
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const reach = Math.hypot(hw, hd);
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const minC = this.colOf(x - reach);
    const maxC = this.colOf(x + reach);
    const minR = this.rowOf(z - reach);
    const maxR = this.rowOf(z + reach);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cx = (c + 0.5) * this.cellSize - x;
        const cz = (r + 0.5) * this.cellSize - z;
        // In den lokalen Raum des Hindernisses drehen.
        const lx = cx * cos - cz * sin;
        const lz = cx * sin + cz * cos;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) this.blocked[this.index(c, r)] = 1;
      }
    }
  }

  /** Oeffnet einen Bereich wieder (z.B. Tuerdurchgaenge). */
  clearBox(obstacle: BoxObstacle): void {
    const { x, z, width, depth } = obstacle;
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const minC = this.colOf(x - hw);
    const maxC = this.colOf(x + hw);
    const minR = this.rowOf(z - hd);
    const maxR = this.rowOf(z + hd);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) this.blocked[this.index(c, r)] = 0;
    }
  }

  /**
   * Verschiebt einen Kreis aus blockierten Zellen heraus.
   * Liefert die korrigierte Position; mehrere Durchlaeufe loesen Ecken auf.
   */
  resolveCircle(x: number, z: number, radius: number, iterations = 3): [number, number] {
    let px = clamp(x, radius, this.width - radius);
    let pz = clamp(z, radius, this.depth - radius);

    // Liegt der Mittelpunkt selbst in einem Hindernis (z.B. nach einem
    // Teleport oder einem sehr grossen Objekt), gibt es lokal kein Gefaelle
    // zum Herausschieben - die umliegenden Zellen heben sich gegenseitig auf.
    // In dem Fall wird zuerst radial nach draussen gesucht.
    if (this.isBlocked(px, pz)) {
      const escaped = this.findFreeNear(px, pz, radius, 64);
      px = escaped[0];
      pz = escaped[1];
    }

    for (let iter = 0; iter < iterations; iter++) {
      let pushX = 0;
      let pushZ = 0;
      let hits = 0;
      const minC = this.colOf(px - radius);
      const maxC = this.colOf(px + radius);
      const minR = this.rowOf(pz - radius);
      const maxR = this.rowOf(pz + radius);

      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (!this.isBlockedCell(c, r)) continue;
          // Naechster Punkt auf der Zelle zum Kreismittelpunkt.
          const cellMinX = c * this.cellSize;
          const cellMinZ = r * this.cellSize;
          const nearestX = clamp(px, cellMinX, cellMinX + this.cellSize);
          const nearestZ = clamp(pz, cellMinZ, cellMinZ + this.cellSize);
          let dx = px - nearestX;
          let dz = pz - nearestZ;
          let dist = Math.hypot(dx, dz);
          if (dist >= radius) continue;
          if (dist < 1e-5) {
            // Mittelpunkt genau in der Zelle: entlang der kuerzesten Achse schieben.
            const cx = cellMinX + this.cellSize * 0.5;
            const cz = cellMinZ + this.cellSize * 0.5;
            dx = px - cx || 1e-4;
            dz = pz - cz;
            if (Math.abs(dx) > Math.abs(dz)) dz = 0;
            else dx = 0;
            dist = Math.hypot(dx, dz) || 1e-4;
          }
          const overlap = radius - dist;
          pushX += (dx / dist) * overlap;
          pushZ += (dz / dist) * overlap;
          hits++;
        }
      }

      if (hits === 0) break;
      px += pushX / hits;
      pz += pushZ / hits;
      px = clamp(px, radius, this.width - radius);
      pz = clamp(pz, radius, this.depth - radius);
    }
    return [px, pz];
  }

  /** Prueft, ob eine gerade Linie frei ist (fuer Sichtlinien von Trainern). */
  lineOfSight(ax: number, az: number, bx: number, bz: number, step = 0.4): boolean {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist / step);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isBlocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /** Sucht die naechste freie Position um einen Punkt herum. */
  findFreeNear(x: number, z: number, radius: number, maxSearch = 12): [number, number] {
    if (!this.isBlocked(x, z)) return [x, z];
    for (let ring = 1; ring <= maxSearch; ring++) {
      const r = ring * this.cellSize;
      for (let a = 0; a < 16; a++) {
        const angle = (a / 16) * Math.PI * 2;
        const nx = x + Math.cos(angle) * r;
        const nz = z + Math.sin(angle) * r;
        if (nx < radius || nz < radius || nx > this.width - radius || nz > this.depth - radius) continue;
        if (!this.isBlocked(nx, nz)) return [nx, nz];
      }
    }
    return [x, z];
  }

  /** Anteil blockierter Zellen - nur fuer Diagnose. */
  get blockedRatio(): number {
    let n = 0;
    for (let i = 0; i < this.blocked.length; i++) if (this.blocked[i] === 1) n++;
    return n / this.blocked.length;
  }

  get raw(): Readonly<Uint8Array> { return this.blocked; }
}
