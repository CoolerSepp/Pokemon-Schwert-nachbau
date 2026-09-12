import { GameConfig } from '@/core/Config';
import { EventBus } from '@/core/EventBus';
import { GameData } from '@/data/GameData';
import { Creature } from '@/creatures/Creature';
import type { CreatureState } from '@/creatures/CreatureTypes';
import type { ItemCategory } from '@/data/schema';

export interface InventoryEntry {
  itemId: string;
  quantity: number;
}

export interface QuestProgress {
  questId: string;
  stepIndex: number;
  completed: boolean;
  startedAt: number;
}

export interface PlayerStateEvents extends Record<string, unknown> {
  moneyChanged: { money: number; delta: number };
  itemChanged: { itemId: string; quantity: number; delta: number };
  partyChanged: Record<string, never>;
  badgeEarned: { index: number; name: string };
  storyStageChanged: { from: number; to: number };
  flagChanged: { flag: string; value: boolean };
  creatureCaught: { creature: Creature };
  dexUpdated: { speciesId: string; caught: boolean };
}

export interface SerializedPlayerState {
  name: string;
  money: number;
  storyStage: number;
  badges: boolean[];
  flags: string[];
  party: CreatureState[];
  boxes: CreatureState[][];
  inventory: InventoryEntry[];
  seen: string[];
  caught: string[];
  quests: QuestProgress[];
  visitedAreas: string[];
  playtimeSeconds: number;
  areaId: string;
  spawnPoint: string;
  position: { x: number; z: number; facing: number; distance: number };
  hour: number;
  settings: Record<string, unknown>;
}

/**
 * Gesamter Spielerfortschritt.
 *
 * Bewusst frei von Renderer- und DOM-Bezuegen, damit der Zustand vollstaendig
 * serialisierbar bleibt und im Test ohne Browser geprueft werden kann.
 */
export class PlayerState {
  readonly events = new EventBus<PlayerStateEvents>();

  name = 'Spieler';
  money = 3000;
  storyStage = 0;
  playtimeSeconds = 0;
  areaId = 'home_bedroom';
  spawnPoint = 'default';

  readonly party: Creature[] = [];
  readonly boxes: Creature[][] = Array.from(
    { length: GameConfig.creature.boxCount }, () => [],
  );
  readonly badges: boolean[] = Array.from({ length: 8 }, () => false);
  readonly flags = new Set<string>();
  readonly seenSpecies = new Set<string>();
  readonly caughtSpecies = new Set<string>();
  readonly visitedAreas = new Set<string>();
  readonly quests: QuestProgress[] = [];
  private readonly inventory = new Map<string, number>();

  // ---------------------------------------------------------------- Geld

  addMoney(amount: number): void {
    const before = this.money;
    this.money = Math.max(0, Math.min(9_999_999, this.money + amount));
    if (this.money !== before) {
      this.events.emit('moneyChanged', { money: this.money, delta: this.money - before });
    }
  }

  canAfford(amount: number): boolean {
    return this.money >= amount;
  }

  // ------------------------------------------------------------ Inventar

  addItem(itemId: string, quantity = 1): void {
    if (!GameData.items.has(itemId) || quantity === 0) return;
    const before = this.inventory.get(itemId) ?? 0;
    const next = Math.max(0, Math.min(999, before + quantity));
    if (next === 0) this.inventory.delete(itemId);
    else this.inventory.set(itemId, next);
    this.events.emit('itemChanged', { itemId, quantity: next, delta: next - before });
  }

  removeItem(itemId: string, quantity = 1): boolean {
    const have = this.inventory.get(itemId) ?? 0;
    if (have < quantity) return false;
    this.addItem(itemId, -quantity);
    return true;
  }

  itemCount(itemId: string): number {
    return this.inventory.get(itemId) ?? 0;
  }

  hasItem(itemId: string, quantity = 1): boolean {
    return this.itemCount(itemId) >= quantity;
  }

  /** Beutelinhalt einer Kategorie, sortiert nach der Datenreihenfolge. */
  itemsOfCategory(category: ItemCategory): InventoryEntry[] {
    return [...this.inventory.entries()]
      .map(([itemId, quantity]) => ({ itemId, quantity }))
      .filter((e) => GameData.items.tryGet(e.itemId)?.category === category)
      .sort((a, b) => {
        const ia = GameData.items.get(a.itemId);
        const ib = GameData.items.get(b.itemId);
        return (ia.sortOrder ?? 0) - (ib.sortOrder ?? 0) || ia.name.localeCompare(ib.name);
      });
  }

  allItems(): InventoryEntry[] {
    return [...this.inventory.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
  }

  // --------------------------------------------------------------- Team

  get healthyParty(): Creature[] {
    return this.party.filter((c) => !c.isFainted);
  }

  get hasUsableCreature(): boolean {
    return this.party.some((c) => !c.isFainted);
  }

  /** Fuegt eine Kreatur zum Team hinzu oder legt sie in die erste freie Box. */
  addCreature(creature: Creature): 'party' | 'box' {
    this.registerCaught(creature.speciesId);
    if (this.party.length < GameConfig.creature.maxPartySize) {
      this.party.push(creature);
      this.events.emit('partyChanged', {});
      this.events.emit('creatureCaught', { creature });
      return 'party';
    }
    for (const box of this.boxes) {
      if (box.length < GameConfig.creature.boxSize) {
        box.push(creature);
        this.events.emit('creatureCaught', { creature });
        return 'box';
      }
    }
    // Alle Boxen voll: die Kreatur wird trotzdem aufgenommen, indem die
    // letzte Box erweitert wird - ein Verlust waere fuer Spielende schlimmer.
    this.boxes[this.boxes.length - 1]!.push(creature);
    this.events.emit('creatureCaught', { creature });
    return 'box';
  }

  removeFromParty(index: number): Creature | null {
    if (index < 0 || index >= this.party.length) return null;
    if (this.party.length <= 1) return null;
    const [removed] = this.party.splice(index, 1);
    this.events.emit('partyChanged', {});
    return removed ?? null;
  }

  swapPartySlots(a: number, b: number): void {
    if (a === b) return;
    const ca = this.party[a];
    const cb = this.party[b];
    if (!ca || !cb) return;
    this.party[a] = cb;
    this.party[b] = ca;
    this.events.emit('partyChanged', {});
  }

  healParty(): void {
    for (const creature of this.party) creature.healFully();
    this.events.emit('partyChanged', {});
  }

  findCreature(uid: string): Creature | null {
    const inParty = this.party.find((c) => c.uid === uid);
    if (inParty) return inParty;
    for (const box of this.boxes) {
      const found = box.find((c) => c.uid === uid);
      if (found) return found;
    }
    return null;
  }

  /** Hoechstes Level im Team - fuer Levelskalierung von Gegnern. */
  get highestLevel(): number {
    return this.party.reduce((max, c) => Math.max(max, c.level), 1);
  }

  get averageLevel(): number {
    if (this.party.length === 0) return 1;
    return Math.round(this.party.reduce((sum, c) => sum + c.level, 0) / this.party.length);
  }

  // ------------------------------------------------------------ Fortschritt

  setStoryStage(stage: number): void {
    if (stage <= this.storyStage) return;
    const from = this.storyStage;
    this.storyStage = stage;
    this.events.emit('storyStageChanged', { from, to: stage });
  }

  setFlag(flag: string, value = true): void {
    const had = this.flags.has(flag);
    if (value) this.flags.add(flag);
    else this.flags.delete(flag);
    if (had !== value) this.events.emit('flagChanged', { flag, value });
  }

  hasFlag(flag: string): boolean {
    return this.flags.has(flag);
  }

  earnBadge(index: number, name: string): void {
    if (index < 0 || index >= this.badges.length || this.badges[index]) return;
    this.badges[index] = true;
    this.events.emit('badgeEarned', { index, name });
  }

  get badgeCount(): number {
    return this.badges.filter(Boolean).length;
  }

  /** Maximales Level, das noch gehorcht - steigt mit jedem Orden. */
  get obedienceLevel(): number {
    const table = [20, 28, 36, 44, 52, 62, 72, 85, 100];
    return table[Math.min(table.length - 1, this.badgeCount)]!;
  }

  registerSeen(speciesId: string): void {
    if (this.seenSpecies.has(speciesId)) return;
    this.seenSpecies.add(speciesId);
    this.events.emit('dexUpdated', { speciesId, caught: false });
  }

  registerCaught(speciesId: string): void {
    this.seenSpecies.add(speciesId);
    if (this.caughtSpecies.has(speciesId)) return;
    this.caughtSpecies.add(speciesId);
    this.events.emit('dexUpdated', { speciesId, caught: true });
  }

  visitArea(areaId: string): void {
    this.visitedAreas.add(areaId);
  }

  // --------------------------------------------------------------- Quests

  startQuest(questId: string): QuestProgress | null {
    if (!GameData.quests.has(questId)) return null;
    const existing = this.quests.find((q) => q.questId === questId);
    if (existing) return existing;
    const progress: QuestProgress = {
      questId, stepIndex: 0, completed: false, startedAt: this.playtimeSeconds,
    };
    this.quests.push(progress);
    return progress;
  }

  getQuest(questId: string): QuestProgress | undefined {
    return this.quests.find((q) => q.questId === questId);
  }

  get activeQuests(): QuestProgress[] {
    return this.quests.filter((q) => !q.completed);
  }

  // --------------------------------------------------------- Serialisierung

  serialize(extra: {
    position: SerializedPlayerState['position'];
    hour: number;
    settings: Record<string, unknown>;
  }): SerializedPlayerState {
    return {
      name: this.name,
      money: this.money,
      storyStage: this.storyStage,
      badges: [...this.badges],
      flags: [...this.flags],
      party: this.party.map((c) => structuredClone(c.state)),
      boxes: this.boxes.map((box) => box.map((c) => structuredClone(c.state))),
      inventory: this.allItems(),
      seen: [...this.seenSpecies],
      caught: [...this.caughtSpecies],
      quests: this.quests.map((q) => ({ ...q })),
      visitedAreas: [...this.visitedAreas],
      playtimeSeconds: Math.round(this.playtimeSeconds),
      areaId: this.areaId,
      spawnPoint: this.spawnPoint,
      ...extra,
    };
  }

  deserialize(data: SerializedPlayerState): void {
    this.name = data.name;
    this.money = data.money;
    this.storyStage = data.storyStage;
    this.playtimeSeconds = data.playtimeSeconds;
    this.areaId = data.areaId;
    this.spawnPoint = data.spawnPoint;

    for (let i = 0; i < this.badges.length; i++) this.badges[i] = data.badges[i] ?? false;

    this.flags.clear();
    for (const f of data.flags) this.flags.add(f);

    this.party.length = 0;
    for (const state of data.party) {
      // Unbekannte Arten ueberspringen statt den Spielstand zu zerstoeren.
      if (GameData.species.has(state.speciesId)) this.party.push(new Creature(state));
    }

    for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i]!.length = 0;
      for (const state of data.boxes[i] ?? []) {
        if (GameData.species.has(state.speciesId)) this.boxes[i]!.push(new Creature(state));
      }
    }

    this.inventory.clear();
    for (const entry of data.inventory) {
      if (GameData.items.has(entry.itemId)) this.inventory.set(entry.itemId, entry.quantity);
    }

    this.seenSpecies.clear();
    for (const id of data.seen) this.seenSpecies.add(id);
    this.caughtSpecies.clear();
    for (const id of data.caught) this.caughtSpecies.add(id);

    this.visitedAreas.clear();
    for (const id of data.visitedAreas) this.visitedAreas.add(id);

    this.quests.length = 0;
    for (const q of data.quests) {
      if (GameData.quests.has(q.questId)) this.quests.push({ ...q });
    }

    this.events.emit('partyChanged', {});
  }

  /** Formatiert die Spielzeit als "H:MM". */
  formatPlaytime(): string {
    const total = Math.floor(this.playtimeSeconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  }
}
