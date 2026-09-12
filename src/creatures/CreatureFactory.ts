import { GameData } from '@/data/GameData';
import type { SpeciesData, StatBlock } from '@/data/schema';
import { STAT_KEYS } from '@/data/schema';
import { GameConfig } from '@/core/Config';
import { RNG } from '@/core/RNG';
import { expForLevel } from './Experience';
import { emptyStats } from './StatCalc';
import { Creature } from './Creature';
import type { CreatureState, Gender, MoveSlot, SizeVariant } from './CreatureTypes';

export interface CreateOptions {
  level: number;
  /** Ueberschreibt die automatisch gewaehlten Attacken. */
  moves?: string[];
  abilityId?: string;
  natureId?: string;
  ivs?: Partial<StatBlock>;
  evs?: Partial<StatBlock>;
  gender?: Gender;
  heldItem?: string | null;
  nickname?: string;
  friendship?: number;
  originalTrainer?: string;
  caughtBall?: string;
  caughtArea?: string;
  variant?: boolean;
  sizeVariant?: SizeVariant;
  giganticFactor?: boolean;
  /** Perfekte Werte fuer Bosse/Legendaere. */
  perfectIvs?: number;
}

/** Wahrscheinlichkeit fuer eine besondere Farbvariante. */
const VARIANT_ODDS = 1 / 1024;

let uidCounter = 0;

function nextUid(): string {
  uidCounter++;
  return `c${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

/**
 * Erzeugt Kreaturen aus Artdaten.
 *
 * Nutzt einen uebergebenen RNG-Stream, damit Begegnungen reproduzierbar
 * erzeugt werden koennen (wichtig fuer Tests und fuer Seeds in der Wild Area).
 */
export class CreatureFactory {
  constructor(private rng: RNG = new RNG('creatures')) {}

  setRng(rng: RNG): void {
    this.rng = rng;
  }

  create(speciesId: string, options: CreateOptions): Creature {
    const species = GameData.species.get(speciesId);
    const level = Math.max(1, Math.min(GameConfig.creature.maxLevel, Math.floor(options.level)));

    const ivs = this.rollIvs(options);
    const evs = emptyStats();
    if (options.evs) for (const k of STAT_KEYS) evs[k] = options.evs[k] ?? 0;

    const natureId = options.natureId ?? this.rng.pick(GameData.natures.all()).id;
    const abilityId = options.abilityId ?? this.rollAbility(species);
    const gender = options.gender ?? this.rollGender(species);
    const moves = this.buildMoveSlots(species, level, options.moves);

    const state: CreatureState = {
      uid: nextUid(),
      speciesId: species.id,
      nickname: options.nickname ?? null,
      level,
      exp: expForLevel(species.growthRate, level),
      ivs,
      evs,
      natureId,
      abilityId,
      gender,
      moves,
      currentHp: 0,
      status: 'none',
      statusCounter: 0,
      friendship: options.friendship ?? species.baseFriendship,
      heldItem: options.heldItem ?? null,
      originalTrainer: options.originalTrainer ?? '',
      caughtBall: options.caughtBall ?? 'fangkugel',
      caughtArea: options.caughtArea ?? '',
      caughtLevel: level,
      variant: options.variant ?? this.rng.chance(VARIANT_ODDS),
      sizeVariant: options.sizeVariant ?? this.rollSize(),
      giganticFactor: options.giganticFactor ?? (species.canGigantic && this.rng.chance(0.12)),
      battleCount: 0,
    };

    const creature = new Creature(state);
    state.currentHp = creature.maxHp;
    return creature;
  }

  /** Erzeugt ein komplettes Trainerteam. */
  createTeam(entries: readonly {
    species: string; level: number; moves?: string[]; ability?: string;
    item?: string; nature?: string; ivs?: Partial<StatBlock>; evs?: Partial<StatBlock>;
    gigantic?: boolean;
  }[], trainerName: string): Creature[] {
    return entries.map((e) =>
      this.create(e.species, {
        level: e.level,
        moves: e.moves,
        abilityId: e.ability,
        natureId: e.nature,
        ivs: e.ivs,
        evs: e.evs,
        heldItem: e.item ?? null,
        originalTrainer: trainerName,
        giganticFactor: e.gigantic ?? false,
        perfectIvs: 0,
      }),
    );
  }

  private rollIvs(options: CreateOptions): StatBlock {
    const ivs = emptyStats();
    const max = GameConfig.creature.ivMax;
    for (const k of STAT_KEYS) ivs[k] = options.ivs?.[k] ?? this.rng.int(0, max);
    // Garantierte Maximalwerte fuer Bosse/Legendaere.
    const perfect = options.perfectIvs ?? 0;
    if (perfect > 0) {
      const keys = this.rng.shuffle([...STAT_KEYS]).slice(0, Math.min(perfect, STAT_KEYS.length));
      for (const k of keys) ivs[k] = max;
    }
    return ivs;
  }

  private rollAbility(species: SpeciesData): string {
    // Verborgene Faehigkeit selten; sonst gleichverteilt aus den regulaeren.
    if (species.hiddenAbility && this.rng.chance(0.05)) return species.hiddenAbility;
    return this.rng.pick(species.abilities);
  }

  private rollGender(species: SpeciesData): Gender {
    if (species.genderRatio === null) return 'none';
    return this.rng.chance(species.genderRatio) ? 'male' : 'female';
  }

  private rollSize(): SizeVariant {
    const roll = this.rng.next();
    if (roll < 0.06) return 'large';
    if (roll < 0.12) return 'small';
    return 'normal';
  }

  /** Die vier zuletzt erlernbaren Attacken bis zum aktuellen Level. */
  private buildMoveSlots(species: SpeciesData, level: number, override?: string[]): MoveSlot[] {
    const ids = override
      ? override.filter((id) => GameData.moves.has(id))
      : species.learnset
          .filter((e) => e.level <= level)
          .sort((a, b) => a.level - b.level)
          .map((e) => e.move)
          .filter((id, i, arr) => arr.indexOf(id) === i)
          .slice(-4);

    const slots = ids.slice(0, 4).map((moveId) => {
      const data = GameData.moves.get(moveId);
      return { moveId, pp: data.pp, maxPp: data.pp };
    });

    if (slots.length === 0) {
      // Fallback: erste Attacke des Lernsets, damit nie eine Kreatur ohne
      // Attacke in den Kampf geht (das wuerde den Kampf blockieren).
      const first = species.learnset[0];
      if (first) {
        const data = GameData.moves.get(first.move);
        slots.push({ moveId: first.move, pp: data.pp, maxPp: data.pp });
      }
    }
    return slots;
  }
}

export const creatureFactory = new CreatureFactory();
