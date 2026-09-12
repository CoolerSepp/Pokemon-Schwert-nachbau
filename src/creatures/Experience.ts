import type { GrowthRate } from '@/data/schema';
import { GameConfig } from '@/core/Config';

/**
 * Erfahrungskurven.
 *
 * Sechs Kurven mit deutlich unterschiedlichem Verlauf, damit seltene/starke
 * Arten spuerbar langsamer aufsteigen als haeufige. Die Formeln sind
 * geschlossene Ausdruecke - kein Tabellen-Import noetig.
 */
export function expForLevel(rate: GrowthRate, level: number): number {
  const n = Math.max(1, Math.min(GameConfig.creature.maxLevel, Math.floor(level)));
  if (n <= 1) return 0;
  switch (rate) {
    case 'fast':
      return Math.floor((4 * n ** 3) / 5);
    case 'mediumFast':
      return n ** 3;
    case 'mediumSlow':
      return Math.max(0, Math.floor((6 / 5) * n ** 3 - 15 * n ** 2 + 100 * n - 140));
    case 'slow':
      return Math.floor((5 * n ** 3) / 4);
    case 'erratic':
      if (n < 50) return Math.floor((n ** 3 * (100 - n)) / 50);
      if (n < 68) return Math.floor((n ** 3 * (150 - n)) / 100);
      if (n < 98) return Math.floor((n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((n ** 3 * (160 - n)) / 100);
    case 'fluctuating':
      if (n < 15) return Math.floor((n ** 3 * (Math.floor((n + 1) / 3) + 24)) / 50);
      if (n < 36) return Math.floor((n ** 3 * (n + 14)) / 50);
      return Math.floor((n ** 3 * (Math.floor(n / 2) + 32)) / 50);
  }
}

/** Level, das zu einem Erfahrungsstand gehoert. */
export function levelForExp(rate: GrowthRate, exp: number): number {
  const max = GameConfig.creature.maxLevel;
  let level = 1;
  while (level < max && exp >= expForLevel(rate, level + 1)) level++;
  return level;
}

/** Fortschritt zum naechsten Level als Anteil 0..1. */
export function levelProgress(rate: GrowthRate, level: number, exp: number): number {
  if (level >= GameConfig.creature.maxLevel) return 1;
  const cur = expForLevel(rate, level);
  const next = expForLevel(rate, level + 1);
  if (next <= cur) return 1;
  return Math.max(0, Math.min(1, (exp - cur) / (next - cur)));
}

/**
 * Erfahrungsgewinn fuer das Besiegen eines Gegners.
 *
 * Skaliert mit dem Levelunterschied, damit unterlevelte Kreaturen schneller
 * aufholen und ueberlevelte Kreaturen langsamer wachsen.
 */
export function expGain(params: {
  defeatedBaseExp: number;
  defeatedLevel: number;
  winnerLevel: number;
  isTrainerBattle: boolean;
  participants: number;
  expShare: boolean;
  itemMultiplier?: number;
  friendshipBonus?: boolean;
}): number {
  const {
    defeatedBaseExp, defeatedLevel, winnerLevel,
    isTrainerBattle, participants, expShare,
  } = params;
  const base = (defeatedBaseExp * defeatedLevel) / 5;
  const levelTerm =
    Math.pow((2 * defeatedLevel + 10) / (defeatedLevel + winnerLevel + 10), 2.5);
  let value = base * levelTerm + 1;
  if (isTrainerBattle) value *= 1.5;
  value /= Math.max(1, participants);
  if (expShare) value *= GameConfig.battle.expShareMultiplier;
  if (params.itemMultiplier) value *= params.itemMultiplier;
  if (params.friendshipBonus) value *= 1.2;
  return Math.max(1, Math.floor(value));
}
