import * as THREE from 'three';
import { Logger } from '@/core/Logger';

const log = Logger.scope('Texturen');

export type TextureKind =
  | 'grass' | 'dirt' | 'sand' | 'rock' | 'snow'
  | 'plaster' | 'shingle' | 'plank' | 'bark' | 'stone' | 'metal' | 'tile';

/** Streut eine Zeichenkette in eine Zahl - fuer reproduzierbare Texturen. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministischer Zufall, damit jede Textur reproduzierbar bleibt. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wertrauschen mit weicher Interpolation auf einem Gitter. */
function noiseField(size: number, cells: number, rand: () => number): (x: number, y: number) => number {
  const grid = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const step = size / cells;
  return (x: number, y: number) => {
    const gx = (x / step) % cells;
    const gy = (y / step) % cells;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const at = (ix: number, iy: number) => grid[(iy % cells) * (cells + 1) + (ix % cells)]!;
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
  };
}

/**
 * Prozedurale Texturen.
 *
 * Das Spiel enthaelt keine Bilddateien - jede Textur wird beim Start auf ein
 * Canvas gezeichnet. Das haelt die Auslieferung bei einer einzigen HTML-Datei
 * und erlaubt es, Farben aus der Biom-Palette zu uebernehmen.
 *
 * Alle Texturen kacheln nahtlos: gezeichnet wird ausschliesslich mit
 * Rauschfeldern, die sich am Rand wiederholen, und mit Mustern, deren
 * Elemente ueber den Rand hinaus gespiegelt werden.
 */
export class TextureFactory {
  private readonly cache = new Map<string, THREE.Texture>();
  private readonly size = 256;

  /** Textur einer Art in einer Grundfarbe. */
  get(kind: TextureKind, color: string): THREE.Texture {
    const key = `${kind}:${color}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = this.size;
    canvas.height = this.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      log.warn('Canvas nicht verfuegbar - Texturen werden uebersprungen');
      const fallback = new THREE.Texture();
      this.cache.set(key, fallback);
      return fallback;
    }

    const base = new THREE.Color(color);
    const seed = hashString(key);
    this.draw(ctx, kind, base, seed);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.cache.set(key, texture);
    return texture;
  }

  private draw(
    ctx: CanvasRenderingContext2D, kind: TextureKind, base: THREE.Color, seed: number,
  ): void {
    const size = this.size;
    const rand = makeRandom(seed);
    const fill = (c: THREE.Color) => {
      ctx.fillStyle = `#${c.getHexString()}`;
      ctx.fillRect(0, 0, size, size);
    };
    const shade = (amount: number, sat = 0): string =>
      `#${base.clone().offsetHSL(0, sat, amount).getHexString()}`;

    fill(base);

    switch (kind) {
      case 'grass':
        // Nur feine Koernung: grossflaechige Flecken wuerden sich mit jeder
        // Kachel wiederholen und als Muster auffallen. Die grosse Variation
        // liefern die Vertexfarben des Gelaendes.
        this.speckle(ctx, rand, 0.05, 3000, [shade(0.07, 0.03), shade(-0.08), shade(0.03, -0.03)]);
        this.strokes(ctx, rand, 1800, 4, 9, [shade(0.09, 0.04), shade(-0.07)], 0.45);
        break;

      case 'dirt':
        this.speckle(ctx, rand, 0.05, 2200, [shade(-0.1), shade(0.07)]);
        this.pebbles(ctx, rand, 90, [shade(0.12), shade(-0.12)]);
        break;

      case 'sand':
        this.speckle(ctx, rand, 0.04, 2600, [shade(0.06), shade(-0.05)]);
        this.waves(ctx, rand, 14, shade(-0.04), 0.6);
        break;

      case 'rock':
      case 'stone':
        this.blotches(ctx, rand, 18, [shade(-0.08), shade(0.06)], 0.7);
        this.cracks(ctx, rand, kind === 'stone' ? 10 : 16, shade(-0.16));
        this.speckle(ctx, rand, 0.05, 900, [shade(0.08), shade(-0.08)]);
        break;

      case 'snow':
        this.speckle(ctx, rand, 0.03, 2600, [shade(0.05), shade(-0.03)]);
        break;

      case 'plaster':
        // Bewusst zurueckhaltend: Putz ist eine feine Koernung, keine
        // Fleckenlandschaft. Zu starke Flecken sehen aus wie Schimmel.
        this.speckle(ctx, rand, 0.012, 5200, [shade(0.02), shade(-0.02)]);
        this.blotches(ctx, rand, 5, [shade(0.012), shade(-0.012)], 0.1);
        break;

      case 'shingle':
        this.shingles(ctx, rand, base);
        break;

      case 'plank':
        this.planks(ctx, rand, base, 'vertical');
        break;

      case 'bark':
        this.planks(ctx, rand, base, 'vertical', true);
        break;

      case 'tile':
        this.tiles(ctx, base, 4, shade(-0.1));
        break;

      case 'metal':
        this.waves(ctx, rand, 8, shade(-0.06), 1);
        this.speckle(ctx, rand, 0.02, 700, [shade(0.05), shade(-0.05)]);
        break;
    }
  }

  // ------------------------------------------------------------- Zeichenhilfen

  /** Feine Farbsprenkel; `strength` steuert die Deckkraft. */
  private speckle(
    ctx: CanvasRenderingContext2D, rand: () => number,
    strength: number, count: number, colors: string[],
  ): void {
    for (let i = 0; i < count; i++) {
      ctx.globalAlpha = 0.25 + rand() * strength * 8;
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)]!;
      const s = 1 + rand() * 2.5;
      ctx.fillRect(rand() * this.size, rand() * this.size, s, s);
    }
    ctx.globalAlpha = 1;
  }

  /** Weiche Flecken - geben grossen Flaechen Struktur. */
  private blotches(
    ctx: CanvasRenderingContext2D, rand: () => number,
    count: number, colors: string[], alpha: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const x = rand() * this.size;
      const y = rand() * this.size;
      const r = this.size * (0.06 + rand() * 0.14);
      const color = colors[Math.floor(rand() * colors.length)]!;
      // Vier Kopien ueber die Raender, damit die Kachelung nahtlos bleibt.
      for (const [ox, oy] of [[0, 0], [this.size, 0], [0, this.size], [this.size, this.size]]) {
        const gradient = ctx.createRadialGradient(x - ox!, y - oy!, 0, x - ox!, y - oy!, r);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.6, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        // Die vier Randkopien teilen sich die Deckkraft, sonst wird die
        // Ueberlappung an den Kacheldiagonalen doppelt so dunkel.
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.size, this.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Kurze Striche - fuer Grashalme und Fasern. */
  private strokes(
    ctx: CanvasRenderingContext2D, rand: () => number,
    count: number, minLen: number, maxLen: number, colors: string[], alpha: number,
  ): void {
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const x = rand() * this.size;
      const y = rand() * this.size;
      const len = minLen + rand() * (maxLen - minLen);
      const angle = -Math.PI / 2 + (rand() - 0.5) * 0.9;
      ctx.strokeStyle = colors[Math.floor(rand() * colors.length)]!;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Kleine helle und dunkle Steine. */
  private pebbles(
    ctx: CanvasRenderingContext2D, rand: () => number, count: number, colors: string[],
  ): void {
    for (let i = 0; i < count; i++) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)]!;
      const x = rand() * this.size;
      const y = rand() * this.size;
      const r = 1.5 + rand() * 3;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Wellenlinien - Sandrippel oder Blechprofil. */
  private waves(
    ctx: CanvasRenderingContext2D, rand: () => number,
    count: number, color: string, alpha: number,
  ): void {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.5;
    ctx.lineWidth = 2;
    const noise = noiseField(this.size, 6, rand);
    for (let i = 0; i < count; i++) {
      const y = (i / count) * this.size;
      ctx.beginPath();
      for (let x = 0; x <= this.size; x += 8) {
        const offset = (noise(x, y) - 0.5) * 10;
        if (x === 0) ctx.moveTo(x, y + offset);
        else ctx.lineTo(x, y + offset);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Risse fuer Fels und Mauerwerk. */
  private cracks(
    ctx: CanvasRenderingContext2D, rand: () => number, count: number, color: string,
  ): void {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < count; i++) {
      let x = rand() * this.size;
      let y = rand() * this.size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const segments = 3 + Math.floor(rand() * 4);
      for (let s = 0; s < segments; s++) {
        x += (rand() - 0.5) * 40;
        y += (rand() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Dachschindeln in versetzten Reihen. */
  private shingles(ctx: CanvasRenderingContext2D, rand: () => number, base: THREE.Color): void {
    const rows = 8;
    const cols = 8;
    const h = this.size / rows;
    const w = this.size / cols;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (w / 2);
      for (let c = -1; c <= cols; c++) {
        const x = c * w + offset;
        const y = r * h;
        const tone = base.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.09);
        ctx.fillStyle = `#${tone.getHexString()}`;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 1);
        ctx.lineTo(x + w - 1, y + 1);
        ctx.lineTo(x + w - 1, y + h - 2);
        ctx.quadraticCurveTo(x + w / 2, y + h + 1, x + 1, y + h - 2);
        ctx.closePath();
        ctx.fill();
        // Schattenfuge unter jeder Schindel.
        ctx.strokeStyle = `#${base.clone().offsetHSL(0, 0, -0.16).getHexString()}`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  /** Bretter oder Rinde mit Maserung. */
  private planks(
    ctx: CanvasRenderingContext2D, rand: () => number, base: THREE.Color,
    direction: 'vertical' | 'horizontal', rough = false,
  ): void {
    const count = rough ? 7 : 5;
    const step = this.size / count;
    for (let i = 0; i < count; i++) {
      const tone = base.clone().offsetHSL(0, 0, (rand() - 0.5) * (rough ? 0.16 : 0.08));
      ctx.fillStyle = `#${tone.getHexString()}`;
      const pos = i * step;
      if (direction === 'vertical') ctx.fillRect(pos, 0, step, this.size);
      else ctx.fillRect(0, pos, this.size, step);

      // Maserung
      ctx.strokeStyle = `#${base.clone().offsetHSL(0, 0, -0.12).getHexString()}`;
      ctx.globalAlpha = rough ? 0.55 : 0.3;
      ctx.lineWidth = rough ? 2.2 : 1;
      const lines = rough ? 5 : 3;
      for (let l = 0; l < lines; l++) {
        const off = pos + step * ((l + 0.5) / lines) + (rand() - 0.5) * 4;
        ctx.beginPath();
        for (let t = 0; t <= this.size; t += 16) {
          const wobble = Math.sin((t / this.size) * Math.PI * 2 + i) * (rough ? 4 : 1.5);
          if (direction === 'vertical') {
            if (t === 0) ctx.moveTo(off + wobble, t);
            else ctx.lineTo(off + wobble, t);
          } else if (t === 0) ctx.moveTo(t, off + wobble);
          else ctx.lineTo(t, off + wobble);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Fuge zwischen den Brettern
      ctx.strokeStyle = `#${base.clone().offsetHSL(0, 0, -0.2).getHexString()}`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (direction === 'vertical') { ctx.moveTo(pos, 0); ctx.lineTo(pos, this.size); }
      else { ctx.moveTo(0, pos); ctx.lineTo(this.size, pos); }
      ctx.stroke();
    }
  }

  /** Gleichmaessiges Fliesenraster fuer Innenraeume. */
  private tiles(
    ctx: CanvasRenderingContext2D, base: THREE.Color, count: number, line: string,
  ): void {
    const step = this.size / count;
    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    for (let i = 0; i <= count; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, this.size);
      ctx.moveTo(0, i * step);
      ctx.lineTo(this.size, i * step);
      ctx.stroke();
    }
    void base;
  }

  dispose(): void {
    for (const texture of this.cache.values()) texture.dispose();
    this.cache.clear();
  }

  get count(): number { return this.cache.size; }
}
