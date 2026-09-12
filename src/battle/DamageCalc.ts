import { GameData } from '@/data/GameData';
import type {
  AbilityEffect, ElementType, ItemEffect, MoveData, WeatherKind,
} from '@/data/schema';
import { GameConfig } from '@/core/Config';
import type { RNG } from '@/core/RNG';
import type { Creature } from '@/creatures/Creature';
import { stageMultiplier } from '@/creatures/StatCalc';
import type { SideState } from './BattleTypes';
import { effectivenessLabel, type Effectiveness } from './BattleTypes';

export interface DamageInput {
  attacker: Creature;
  defender: Creature;
  attackerSide: SideState;
  defenderSide: SideState;
  move: MoveData;
  weather: WeatherKind;
  rng: RNG;
  /** Kritischer Treffer wird von aussen vorgegeben (fuer Tests deterministisch). */
  forceCritical?: boolean;
  /** Erzwingt den Zufallsfaktor (0.85..1.0). */
  forceRandom?: number;
  /** Gigantifizierter Angreifer: Attacke wirkt staerker. */
  giganticAttacker?: boolean;
}

export interface DamageOutput {
  damage: number;
  effectiveness: number;
  effectivenessLabel: Effectiveness;
  critical: boolean;
  stab: boolean;
}

function abilityEffects(creature: Creature): AbilityEffect[] {
  return GameData.abilities.tryGet(creature.ability)?.effects ?? [];
}

function heldItemEffect(creature: Creature): ItemEffect | null {
  if (!creature.heldItem) return null;
  return GameData.items.tryGet(creature.heldItem)?.effect ?? null;
}

/** Wetterbedingter Multiplikator auf den Attackenschaden. */
export function weatherDamageMultiplier(type: ElementType, weather: WeatherKind): number {
  switch (weather) {
    case 'rain':
    case 'thunderstorm':
      if (type === 'water') return 1.5;
      if (type === 'fire') return 0.5;
      return 1;
    case 'heavyRain':
      if (type === 'water') return 1.5;
      if (type === 'fire') return 0.25;
      return 1;
    case 'harshSun':
      if (type === 'fire') return 1.5;
      if (type === 'water') return 0.5;
      return 1;
    case 'snow':
    case 'blizzard':
      if (type === 'ice') return 1.2;
      if (type === 'fire') return 0.85;
      return 1;
    case 'sandstorm':
      if (type === 'rock' || type === 'ground') return 1.15;
      return 1;
    case 'fog':
      return type === 'ghost' || type === 'dark' ? 1.15 : 1;
    default:
      return 1;
  }
}

/** Volltrefferchance in Abhaengigkeit der Stufe. */
export function criticalChance(stages: number): number {
  const table = GameConfig.battle.critChanceStages;
  return table[Math.max(0, Math.min(table.length - 1, stages))]!;
}

/**
 * Berechnet die Trefferwahrscheinlichkeit einer Attacke (0..1).
 * Genauigkeit 0 bedeutet: trifft immer.
 */
export function accuracyChance(input: {
  move: MoveData;
  attacker: Creature;
  attackerSide: SideState;
  defenderSide: SideState;
  weather: WeatherKind;
}): number {
  const { move, attacker, attackerSide, defenderSide, weather } = input;
  if (move.accuracy <= 0) return 1;

  // Unfehlbare Attacken bei passendem Wetter.
  if (move.id === 'donnerkeil' && ['rain', 'heavyRain', 'thunderstorm'].includes(weather)) return 1;
  if (move.id === 'blizzardbrise' && weather === 'blizzard') return 1;

  const accStage = attackerSide.volatile.stages.accuracy;
  const evaStage = defenderSide.volatile.stages.evasion;
  let chance = (move.accuracy / 100) * stageMultiplier(accStage, 'accuracy')
    / stageMultiplier(evaStage, 'evasion');

  for (const eff of abilityEffects(attacker)) {
    if (eff.kind === 'accuracyBoost') chance *= eff.multiplier;
  }
  if (weather === 'fog') chance *= 0.85;
  return Math.max(0.05, Math.min(1, chance));
}

/**
 * Schadensformel.
 *
 * Aufbau: Grundschaden aus Level/Staerke/Angriff/Verteidigung, danach
 * multiplikative Modifikatoren (Volltreffer, Zufall, STAB, Typentabelle,
 * Verbrennung, Wetter, Faehigkeiten, getragene Gegenstaende, Schutzschilde).
 */
export function calculateDamage(input: DamageInput): DamageOutput {
  const {
    attacker, defender, attackerSide, defenderSide, move, weather, rng,
  } = input;

  const defenderTypes = defender.types;
  let effectiveness = GameData.effectivenessAgainst(move.type, defenderTypes);

  // Attacken, die eine Immunitaet ignorieren (z.B. Geist gegen Normal).
  if (effectiveness === 0 && move.effect?.ignoreImmunity) {
    const ignored = move.effect.ignoreImmunity;
    if (defenderTypes.some((t) => ignored.includes(t))) {
      effectiveness = GameData.effectivenessAgainst(
        move.type, defenderTypes.filter((t) => !ignored.includes(t)),
      );
      if (defenderTypes.every((t) => ignored.includes(t))) effectiveness = 1;
    }
  }

  if (move.category === 'status' || effectiveness === 0) {
    return {
      damage: 0, effectiveness,
      effectivenessLabel: effectivenessLabel(effectiveness),
      critical: false, stab: false,
    };
  }

  // ---- Feste Schadensarten ------------------------------------------------
  if (move.effect?.levelDamage) {
    return {
      damage: Math.max(1, attacker.level), effectiveness: 1,
      effectivenessLabel: 'normal', critical: false, stab: false,
    };
  }
  if (move.effect?.fixedDamage) {
    return {
      damage: move.effect.fixedDamage, effectiveness: 1,
      effectivenessLabel: 'normal', critical: false, stab: false,
    };
  }

  // ---- Volltreffer --------------------------------------------------------
  let critStages = move.effect?.critStages ?? 0;
  const itemEff = heldItemEffect(attacker);
  if (itemEff?.kind === 'heldCritBoost') critStages += itemEff.stages;
  const defenderCritImmune = abilityEffects(defender).some((e) => e.kind === 'critImmunity');
  const critical = input.forceCritical ?? (!defenderCritImmune && rng.chance(criticalChance(critStages)));

  // ---- Angriffs- und Verteidigungswert ------------------------------------
  const physical = move.category === 'physical';
  const usesPhysDef = physical || move.effect?.usesPhysicalDefense === true;

  const atkStatKey = physical ? 'atk' : 'spa';
  const defStatKey = usesPhysDef ? 'def' : 'spd';

  const defenderIgnoresStages = abilityEffects(attacker).some((e) => e.kind === 'ignoreStatChanges');

  let atkStage = attackerSide.volatile.stages[atkStatKey];
  let defStage = defenderSide.volatile.stages[defStatKey];
  // Volltreffer ignorieren nachteilige Angriffs- bzw. vorteilhafte Verteidigungsstufen.
  if (critical) {
    if (atkStage < 0) atkStage = 0;
    if (defStage > 0) defStage = 0;
  }
  if (defenderIgnoresStages && defStage > 0) defStage = 0;

  let attackValue = attacker.stats[atkStatKey] * stageMultiplier(atkStage, atkStatKey);
  let defenseValue = defender.stats[defStatKey] * stageMultiplier(defStage, defStatKey);

  // Getragene Gegenstaende auf Werte
  if (itemEff?.kind === 'heldStatBoost' && itemEff.stat === atkStatKey) {
    attackValue *= itemEff.multiplier;
  }
  const defItemEff = heldItemEffect(defender);
  if (defItemEff?.kind === 'heldStatBoost' && defItemEff.stat === defStatKey) {
    defenseValue *= defItemEff.multiplier;
  }

  // Verbrennung halbiert den physischen Angriff.
  if (physical && attacker.status === 'burn') {
    attackValue *= GameConfig.battle.burnAttackMultiplier;
  }
  // Sandsturm: Spezial-Verteidigung von Gesteinskreaturen steigt.
  if (weather === 'sandstorm' && defenderTypes.includes('rock') && defStatKey === 'spd') {
    defenseValue *= 1.5;
  }
  // Schnee: Verteidigung von Eiskreaturen steigt.
  if ((weather === 'snow' || weather === 'blizzard') && defenderTypes.includes('ice') && defStatKey === 'def') {
    defenseValue *= 1.5;
  }

  // ---- Attackenstaerke ----------------------------------------------------
  let power = move.power;
  const eff = move.effect;
  if (eff?.powerFromHp) {
    power = Math.max(1, Math.floor(150 * attacker.hpFraction));
  }
  if (eff?.powerFromFriendship) {
    power = Math.max(1, Math.floor((attacker.friendship / 255) * 102) + 10);
  }
  if (eff?.doublePowerIfStatus && eff.doublePowerIfStatus.includes(defender.status)) {
    power *= 2;
  }
  if (eff?.doublePowerIfWeather && eff.doublePowerIfWeather.includes(weather)) {
    power *= 2;
  }
  if (move.id === 'nachtjagd' && (weather === 'fog')) power = Math.floor(power * 1.3);

  // Faehigkeiten des Angreifers
  for (const a of abilityEffects(attacker)) {
    if (a.kind === 'typeBoostLowHp' && move.type === a.type && attacker.hpFraction <= a.threshold) {
      power *= a.multiplier;
    }
    if (a.kind === 'powerPunch' && move.contact && move.category === 'physical') {
      power *= a.multiplier;
    }
  }
  // Typverstaerkende getragene Gegenstaende
  if (itemEff?.kind === 'heldTypeBoost' && itemEff.type === move.type) {
    power *= itemEff.multiplier;
  }
  if (input.giganticAttacker) power *= 1.15;

  // ---- Grundschaden -------------------------------------------------------
  const level = attacker.level;
  let damage =
    Math.floor(
      (Math.floor((Math.floor((2 * level) / 5 + 2) * power * attackValue) / defenseValue) / 50),
    ) + 2;

  // ---- Multiplikatoren ----------------------------------------------------
  if (critical) damage = Math.floor(damage * GameConfig.battle.critMultiplier);

  const random = input.forceRandom
    ?? rng.float(GameConfig.battle.randomDamageMin, GameConfig.battle.randomDamageMax);
  damage = Math.floor(damage * random);

  const stab = attacker.types.includes(move.type);
  if (stab) damage = Math.floor(damage * GameConfig.battle.stabMultiplier);

  damage = Math.floor(damage * effectiveness);
  damage = Math.floor(damage * weatherDamageMultiplier(move.type, weather));

  // Schutzschilde des Verteidigers
  const screenActive = usesPhysDef
    ? defenderSide.screens.physical > 0
    : defenderSide.screens.special > 0;
  if (screenActive && !critical) damage = Math.floor(damage * 0.5);

  // Schadensreduktion durch Faehigkeiten des Verteidigers
  for (const a of abilityEffects(defender)) {
    if (a.kind === 'damageReduction') {
      if (a.condition === 'always' || (a.condition === 'superEffective' && effectiveness > 1)) {
        damage = Math.floor(damage * a.multiplier);
      }
    }
  }

  return {
    damage: Math.max(1, damage),
    effectiveness,
    effectivenessLabel: effectivenessLabel(effectiveness),
    critical,
    stab,
  };
}

/** Effektive Initiative unter Beruecksichtigung von Status, Stufen und Wetter. */
export function effectiveSpeed(creature: Creature, side: SideState, weather: WeatherKind): number {
  let speed = creature.stats.spe * stageMultiplier(side.volatile.stages.spe, 'spe');
  if (creature.status === 'paralysis') speed *= 0.5;
  for (const a of abilityEffects(creature)) {
    if (a.kind === 'speedInWeather' && a.weather.includes(weather)) speed *= a.multiplier;
  }
  const item = heldItemEffect(creature);
  if (item?.kind === 'heldStatBoost' && item.stat === 'spe') speed *= item.multiplier;
  return speed;
}
