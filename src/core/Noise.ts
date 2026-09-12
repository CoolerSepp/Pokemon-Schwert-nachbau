import { RNG } from './RNG';

/**
 * Value-Noise mit fraktaler Ueberlagerung (fBm).
 *
 * Selbst implementiert statt via Bibliothek, weil wir deterministische,
 * seedbare Terrain-Generierung brauchen, die in Tests reproduzierbar ist.
 */
export class ValueNoise2D {
  private readonly perm: Uint8Array;

  constructor(seed: number | string) {
    const rng = new RNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const t = p[i]!;
      p[i] = p[j]!;
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
  }

  private hash(x: number, y: number): number {
    const h = this.perm[(this.perm[x & 255]! + (y & 255)) & 511]!;
    return h / 255;
  }

  /** Rohes Value-Noise in [0, 1]. */
  sample(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    // Smootherstep fuer C2-stetige Uebergaenge (keine sichtbaren Gitterkanten).
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);

    const a = this.hash(xi, yi);
    const b = this.hash(xi + 1, yi);
    const c = this.hash(xi, yi + 1);
    const d = this.hash(xi + 1, yi + 1);

    const top = a + (b - a) * u;
    const bottom = c + (d - c) * u;
    return top + (bottom - top) * v;
  }

  /** Fraktales Rauschen in [0, 1]. */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.sample(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }

  /** Ridged Noise - erzeugt Bergkaemme. */
  ridged(x: number, y: number, octaves = 4): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.sample(x * freq, y * freq) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return norm > 0 ? sum / norm : 0;
  }
}
