import type { NatureData, StatBlock, StatKey, BattleStatKey } from '@/data/schema';
import { STAT_KEYS } from '@/data/schema';
import { GameConfig } from '@/core/Config';

/** Multiplikator einer Natur auf einen Wert (0.9 / 1.0 / 1.1). */
export function natureMultiplier(nature: NatureData | null, stat: StatKey): number {
  if (!nature || stat === 'hp') return 1;
  if (nature.up === stat && nature.down !== stat) return 1.1;
  if (nature.down === stat && nature.up !== stat) return 0.9;
  return 1;
}

export function calcHp(base: number, iv: number, ev: number, level: number): number {
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

export function calcStat(
  base: number, iv: number, ev: number, level: number, natureMult: number,
): number {
  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  return Math.floor(raw * natureMult);
}

export function calcAllStats(
  baseStats: StatBlock, ivs: StatBlock, evs: StatBlock, level: number,
  nature: NatureData | null,
): StatBlock {
  const out = {} as StatBlock;
  for (const key of STAT_KEYS) {
    out[key] =
      key === 'hp'
        ? calcHp(baseStats.hp, ivs.hp, evs.hp, level)
        : calcStat(baseStats[key], ivs[key], evs[key], level, natureMultiplier(nature, key));
  }
  return out;
}

/**
 * Multiplikator einer Wertveraenderungs-Stufe.
 *
 * Angriff/Verteidigung/Initiative nutzen (2+s)/2 bzw. 2/(2-s);
 * Genauigkeit/Ausweichen nutzen die flachere Kurve (3+s)/3.
 */
export function stageMultiplier(stage: number, stat: BattleStatKey): number {
  const s = Math.max(GameConfig.battle.minStatStage, Math.min(GameConfig.battle.maxStatStage, stage));
  if (stat === 'accuracy' || stat === 'evasion') {
    return s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
  }
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

export function emptyStats(value = 0): StatBlock {
  return { hp: value, atk: value, def: value, spa: value, spd: value, spe: value };
}

/** Begrenzt EVs auf das Einzel- und Gesamtmaximum. */
export function clampEvs(evs: StatBlock): StatBlock {
  const out = { ...evs };
  let total = 0;
  for (const key of STAT_KEYS) {
    out[key] = Math.max(0, Math.min(GameConfig.creature.evMaxPerStat, Math.floor(out[key])));
    total += out[key];
  }
  const max = GameConfig.creature.evMaxTotal;
  if (total > max) {
    // Ueberschuss von den hoechsten Werten abziehen, bis das Limit passt.
    let excess = total - max;
    const order = [...STAT_KEYS].sort((a, b) => out[b] - out[a]);
    for (const key of order) {
      if (excess <= 0) break;
      const take = Math.min(out[key], excess);
      out[key] -= take;
      excess -= take;
    }
  }
  return out;
}
