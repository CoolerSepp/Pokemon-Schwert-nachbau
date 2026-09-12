import { GameData } from '@/data/GameData';
import type {
  ElementType, MoveData, NatureData, SpeciesData, StatBlock, StatKey, StatusCondition,
} from '@/data/schema';
import { STAT_KEYS } from '@/data/schema';
import { GameConfig } from '@/core/Config';
import { calcAllStats, clampEvs, natureMultiplier } from './StatCalc';
import { expForLevel, levelForExp, levelProgress } from './Experience';
import type { CreatureState, Gender, MoveSlot } from './CreatureTypes';

/**
 * Laufzeit-Huelle um `CreatureState`.
 *
 * Alle abgeleiteten Werte (Statuswerte, Typen, Anzeigename) werden hier
 * berechnet und gecacht; der gekapselte Zustand bleibt rein serialisierbar.
 */
export class Creature {
  private cachedStats: StatBlock | null = null;
  private cachedLevel = -1;

  constructor(readonly state: CreatureState) {}

  get uid(): string { return this.state.uid; }
  get speciesId(): string { return this.state.speciesId; }
  get species(): SpeciesData { return GameData.species.get(this.state.speciesId); }
  get level(): number { return this.state.level; }
  get exp(): number { return this.state.exp; }
  get gender(): Gender { return this.state.gender; }
  get friendship(): number { return this.state.friendship; }
  get heldItem(): string | null { return this.state.heldItem; }
  get status(): StatusCondition { return this.state.status; }
  get moves(): MoveSlot[] { return this.state.moves; }
  get isVariant(): boolean { return this.state.variant; }

  get name(): string {
    return this.state.nickname ?? this.species.name;
  }

  get types(): ElementType[] {
    return [...this.species.types];
  }

  get nature(): NatureData | null {
    return GameData.natures.tryGet(this.state.natureId) ?? null;
  }

  get ability(): string {
    return this.state.abilityId;
  }

  /** Berechnete Statuswerte (ohne Kampf-Stufen). */
  get stats(): StatBlock {
    if (!this.cachedStats || this.cachedLevel !== this.state.level) {
      this.cachedStats = calcAllStats(
        this.species.baseStats, this.state.ivs, this.state.evs,
        this.state.level, this.nature,
      );
      this.cachedLevel = this.state.level;
    }
    return this.cachedStats;
  }

  get maxHp(): number { return this.stats.hp; }
  get currentHp(): number { return this.state.currentHp; }
  get hpFraction(): number { return this.maxHp > 0 ? this.state.currentHp / this.maxHp : 0; }
  get isFainted(): boolean { return this.state.currentHp <= 0; }

  get canGigantic(): boolean {
    return this.species.canGigantic && this.state.giganticFactor;
  }

  /** Anzeigegroesse in Metern unter Beruecksichtigung der Groessenvariante. */
  get displayHeight(): number {
    const f = this.state.sizeVariant === 'large' ? 1.22
      : this.state.sizeVariant === 'small' ? 0.78 : 1;
    return Math.round(this.species.heightM * f * 100) / 100;
  }

  get displayWeight(): number {
    const f = this.state.sizeVariant === 'large' ? 1.5
      : this.state.sizeVariant === 'small' ? 0.6 : 1;
    return Math.round(this.species.weightKg * f * 10) / 10;
  }

  /** Modellskalierung fuer die 3D-Darstellung. */
  get modelScale(): number {
    const variant = this.state.sizeVariant === 'large' ? 1.18
      : this.state.sizeVariant === 'small' ? 0.84 : 1;
    return (this.species.fieldScale ?? 1) * variant;
  }

  getMoveData(slotIndex: number): MoveData | null {
    const slot = this.state.moves[slotIndex];
    return slot ? GameData.moves.tryGet(slot.moveId) ?? null : null;
  }

  knowsMove(moveId: string): boolean {
    return this.state.moves.some((m) => m.moveId === moveId);
  }

  hasUsableMove(): boolean {
    return this.state.moves.some((m) => m.pp > 0);
  }

  // ---------------------------------------------------------------- Mutation

  /** Setzt KP unter Beruecksichtigung der Grenzen. Liefert die reale Aenderung. */
  applyHpDelta(delta: number): number {
    const before = this.state.currentHp;
    this.state.currentHp = Math.max(0, Math.min(this.maxHp, before + delta));
    return this.state.currentHp - before;
  }

  healFully(): void {
    this.state.currentHp = this.maxHp;
    this.state.status = 'none';
    this.state.statusCounter = 0;
    for (const m of this.state.moves) m.pp = m.maxPp;
  }

  setStatus(status: StatusCondition, counter = 0): void {
    this.state.status = status;
    this.state.statusCounter = counter;
  }

  clearStatus(): void {
    this.state.status = 'none';
    this.state.statusCounter = 0;
  }

  usePp(slotIndex: number, amount = 1): void {
    const slot = this.state.moves[slotIndex];
    if (slot) slot.pp = Math.max(0, slot.pp - amount);
  }

  restorePp(slotIndex: number, amount: number): number {
    const slot = this.state.moves[slotIndex];
    if (!slot) return 0;
    const before = slot.pp;
    slot.pp = Math.min(slot.maxPp, slot.pp + amount);
    return slot.pp - before;
  }

  addFriendship(delta: number): void {
    this.state.friendship = Math.max(
      0, Math.min(GameConfig.creature.maxFriendship, this.state.friendship + delta),
    );
  }

  addEvs(gains: Partial<StatBlock>): void {
    const next = { ...this.state.evs };
    for (const key of STAT_KEYS) next[key] += gains[key] ?? 0;
    this.state.evs = clampEvs(next);
    this.cachedStats = null;
  }

  /**
   * Vergibt Erfahrung und liefert die erreichten Level.
   * KP wachsen bei Levelaufstieg proportional mit (KP-Differenz wird addiert).
   */
  addExp(amount: number): number[] {
    const rate = this.species.growthRate;
    const max = GameConfig.creature.maxLevel;
    if (this.state.level >= max) return [];
    this.state.exp += Math.max(0, Math.floor(amount));
    const cap = expForLevel(rate, max);
    if (this.state.exp > cap) this.state.exp = cap;

    const gained: number[] = [];
    let newLevel = levelForExp(rate, this.state.exp);
    while (this.state.level < newLevel) {
      const beforeMax = this.maxHp;
      this.state.level++;
      this.cachedStats = null;
      const delta = this.maxHp - beforeMax;
      if (!this.isFainted) this.state.currentHp += delta;
      this.addFriendship(GameConfig.creature.friendshipOnLevelUp);
      gained.push(this.state.level);
      newLevel = levelForExp(rate, this.state.exp);
    }
    return gained;
  }

  /** Attacken, die auf dem aktuellen Level neu erlernt werden. */
  movesLearnedAtLevel(level: number): string[] {
    return this.species.learnset
      .filter((e) => e.level === level && !this.knowsMove(e.move))
      .map((e) => e.move);
  }

  /** Fuegt eine Attacke hinzu. Liefert false, wenn alle vier Plaetze belegt sind. */
  learnMove(moveId: string, replaceIndex?: number): boolean {
    const data = GameData.moves.tryGet(moveId);
    if (!data || this.knowsMove(moveId)) return false;
    const slot: MoveSlot = { moveId, pp: data.pp, maxPp: data.pp };
    if (replaceIndex !== undefined && replaceIndex >= 0 && replaceIndex < 4) {
      this.state.moves[replaceIndex] = slot;
      return true;
    }
    if (this.state.moves.length >= 4) return false;
    this.state.moves.push(slot);
    return true;
  }

  /** Artwechsel bei Entwicklung; Werte und KP-Anteil bleiben erhalten. */
  evolveInto(speciesId: string): void {
    const next = GameData.species.get(speciesId);
    const fraction = this.hpFraction;
    this.state.speciesId = next.id;
    this.cachedStats = null;
    this.cachedLevel = -1;
    if (!next.abilities.includes(this.state.abilityId) && next.hiddenAbility !== this.state.abilityId) {
      this.state.abilityId = next.abilities[0]!;
    }
    this.state.currentHp = Math.max(1, Math.round(this.maxHp * fraction));
  }

  levelProgress(): number {
    return levelProgress(this.species.growthRate, this.state.level, this.state.exp);
  }

  expToNextLevel(): number {
    if (this.state.level >= GameConfig.creature.maxLevel) return 0;
    return Math.max(0, expForLevel(this.species.growthRate, this.state.level + 1) - this.state.exp);
  }

  natureLabel(stat: StatKey): 'up' | 'down' | 'none' {
    const m = natureMultiplier(this.nature, stat);
    return m > 1 ? 'up' : m < 1 ? 'down' : 'none';
  }

  clone(): Creature {
    return new Creature(structuredClone(this.state));
  }
}
