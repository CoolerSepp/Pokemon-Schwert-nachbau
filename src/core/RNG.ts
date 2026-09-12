/**
 * Deterministischer Zufallsgenerator (mulberry32).
 *
 * Deterministisch, weil Kampf-, Spawn- und Weltgenerierung reproduzierbar
 * testbar sein muessen. Jede Subsystem-Instanz bekommt ihren eigenen Stream,
 * damit z.B. ein Kampf die Weltgenerierung nicht verschiebt.
 */
export class RNG {
  private state: number;

  constructor(seed: number | string = Date.now()) {
    this.state = RNG.hashSeed(seed);
  }

  static hashSeed(seed: number | string): number {
    if (typeof seed === 'number') return seed >>> 0;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Neuer, unabhaengiger Stream, abgeleitet aus diesem. */
  fork(label: string): RNG {
    return new RNG(`${this.state}:${label}`);
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Ganzzahl in [min, max] (beide inklusive). */
  int(min: number, max: number): number {
    if (max < min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Gleitkomma in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Trifft mit Wahrscheinlichkeit p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Trifft in `n` von `outOf` Faellen. */
  oneIn(n: number): boolean {
    return n <= 1 ? true : this.next() < 1 / n;
  }

  pick<T>(list: readonly T[]): T {
    if (list.length === 0) throw new Error('RNG.pick: leere Liste');
    return list[this.int(0, list.length - 1)]!;
  }

  /** Gewichtete Auswahl. Gewichte <= 0 werden ignoriert. */
  weighted<T>(entries: readonly { value: T; weight: number }[]): T | null {
    let total = 0;
    for (const e of entries) if (e.weight > 0) total += e.weight;
    if (total <= 0) return null;
    let roll = this.next() * total;
    for (const e of entries) {
      if (e.weight <= 0) continue;
      roll -= e.weight;
      if (roll <= 0) return e.value;
    }
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i]!.weight > 0) return entries[i]!.value;
    }
    return null;
  }

  /** Fisher-Yates, in-place. */
  shuffle<T>(list: T[]): T[] {
    for (let i = list.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = list[i]!;
      list[i] = list[j]!;
      list[j] = tmp;
    }
    return list;
  }
}

/** Globaler, nicht-deterministischer Stream fuer reine Kosmetik (Partikel etc.). */
export const cosmeticRNG = new RNG(Date.now() ^ 0x9e3779b9);
