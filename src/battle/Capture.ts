import { GameData } from '@/data/GameData';
import type { ItemEffect, TimeOfDay } from '@/data/schema';
import type { RNG } from '@/core/RNG';
import type { Creature } from '@/creatures/Creature';

export interface CaptureContext {
  target: Creature;
  ballId: string;
  turn: number;
  timeOfDay: TimeOfDay;
  inCave: boolean;
  /** Wurde in dieser Runde bereits ein Ball geworfen? */
  isFirstTurn: boolean;
  rng: RNG;
}

export interface CaptureResult {
  success: boolean;
  /** Anzahl Wackler vor dem Ergebnis (0..3). */
  shakes: number;
  /** Effektiver Fangwert - fuer Debug-Anzeige. */
  catchValue: number;
}

/** Statusbedingter Bonus auf die Fangchance. */
function statusBonus(creature: Creature): number {
  switch (creature.status) {
    case 'sleep':
    case 'freeze':
      return 2.5;
    case 'paralysis':
    case 'burn':
    case 'poison':
    case 'toxic':
      return 1.5;
    default:
      return 1;
  }
}

/** Situationsabhaengiger Ballmultiplikator. */
export function ballMultiplier(ctx: CaptureContext): number {
  const item = GameData.items.tryGet(ctx.ballId);
  const effect: ItemEffect | undefined = item?.effect;
  if (!effect || effect.kind !== 'catch') return 1;
  const base = effect.rate;
  switch (effect.special) {
    case 'master':
      return 255;
    case 'net':
      return ctx.target.types.some((t) => t === 'water' || t === 'bug') ? 3.5 : 1;
    case 'dusk':
      return ctx.inCave || ctx.timeOfDay === 'night' || ctx.timeOfDay === 'dusk' ? 3 : 1;
    case 'quick':
      return ctx.isFirstTurn ? 4 : 1;
    case 'timer':
      return Math.min(4, 1 + ctx.turn * 0.3);
    case 'heavy':
      return ctx.target.displayWeight > 200 ? 3 : 1;
    default:
      return base;
  }
}

/**
 * Fangberechnung.
 *
 * Der Fangwert steigt mit sinkenden KP, gutem Ball, Statusproblem und
 * niedrigem Level. Aus ihm wird eine Wacklerschwelle abgeleitet; vier
 * bestandene Wackler bedeuten einen erfolgreichen Fang.
 */
export function attemptCapture(ctx: CaptureContext): CaptureResult {
  const { target, rng } = ctx;
  const item = GameData.items.tryGet(ctx.ballId);
  if (!item || item.effect?.kind !== 'catch') {
    return { success: false, shakes: 0, catchValue: 0 };
  }
  if (item.effect.special === 'master') {
    return { success: true, shakes: 3, catchValue: 255 };
  }

  const maxHp = target.maxHp;
  const hp = Math.max(1, target.currentHp);
  const rate = target.species.captureRate;
  const ball = ballMultiplier(ctx);
  const status = statusBonus(target);

  // Kein zusaetzlicher Levelbonus: die Balance kommt ueber `captureRate` aus
  // den Artdaten. Ein Levelbonus wuerde die Fangrate fruehr Arten auf 100 %
  // saettigen und die Mechanik (KP senken, Status setzen) bedeutungslos machen.
  const a = ((3 * maxHp - 2 * hp) / (3 * maxHp)) * rate * ball * status;
  const catchValue = Math.min(255, a);

  if (catchValue >= 255) return { success: true, shakes: 3, catchValue };

  const b = Math.floor(65536 / Math.pow(255 / catchValue, 0.1875));
  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (rng.int(0, 65535) < b) shakes++;
    else break;
  }
  return { success: shakes >= 4, shakes: Math.min(3, shakes), catchValue };
}

/**
 * Fluchtchance aus einem wilden Kampf.
 * Steigt mit jedem Versuch und mit dem Initiativevorteil.
 */
export function fleeChance(
  playerSpeed: number, enemySpeed: number, attempts: number,
): number {
  if (playerSpeed > enemySpeed) return 1;
  if (enemySpeed <= 0) return 1;
  const odds = (Math.floor((playerSpeed * 128) / enemySpeed) + 30 * attempts) % 256;
  return Math.max(0, Math.min(1, odds / 256));
}
