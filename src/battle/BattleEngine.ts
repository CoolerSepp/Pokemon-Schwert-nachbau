import { GameData } from '@/data/GameData';
import type {
  AbilityEffect, AiProfile, BattleStatKey, ItemEffect, MoveData,
  StatusCondition, TimeOfDay, WeatherKind,
} from '@/data/schema';
import { GameConfig } from '@/core/Config';
import { RNG } from '@/core/RNG';
import { Logger } from '@/core/Logger';
import type { Creature } from '@/creatures/Creature';
import { expGain } from '@/creatures/Experience';
import { stageMultiplier } from '@/creatures/StatCalc';
import { checkEvolution } from '@/creatures/Evolution';
import { calculateDamage, accuracyChance, effectiveSpeed } from './DamageCalc';
import { attemptCapture, fleeChance } from './Capture';
import { BattleAI } from './BattleAI';
import {
  createVolatile, effectivenessLabel,
  type BattleAction, type BattleEvent, type BattleKind, type BattleOutcome,
  type BattlePhase, type BattleResult, type FieldState, type PendingLearn,
  type SideId, type SideState,
} from './BattleTypes';

const log = Logger.scope('Battle');

export interface RaidAlly {
  creature: Creature;
  ai: AiProfile;
  trainerName: string;
  /** Runden bis zur Wiederbelebung; 0 = im Kampf. */
  downTurns: number;
}

export interface BattleSetup {
  kind: BattleKind;
  playerParty: Creature[];
  enemyParty: Creature[];
  playerName: string;
  enemyName: string;
  trainerId?: string | null;
  aiProfile?: AiProfile;
  enemyItems?: string[];
  ambientWeather?: WeatherKind;
  timeOfDay?: TimeOfDay;
  inCave?: boolean;
  playerCanGigantic?: boolean;
  enemyCanGigantic?: boolean;
  /** Preisgeld pro Level der staerksten gegnerischen Kreatur. */
  rewardBase?: number;
  seed?: number | string;
  /** Liefert die verfuegbare Menge eines Gegenstands im Spielerbeutel. */
  getItemCount?: (itemId: string) => number;
  /** Verbraucht einen Gegenstand aus dem Beutel; false = nicht vorhanden. */
  consumeItem?: (itemId: string) => boolean;
  /** Kann der Spieler fliehen? (Arena-/Storykaempfe: nein) */
  allowFlee?: boolean;
  /** Duerfen Faenge stattfinden? */
  allowCapture?: boolean;
  raid?: { shieldThresholds: number[]; turnLimit: number; allies: RaidAlly[] };
  /** Publikumsreaktionen ausgeben (Arena/Stadion). */
  withCrowd?: boolean;
}

interface PlannedAction {
  side: SideId;
  action: BattleAction;
  priority: number;
  speed: number;
  /** Nur fuer Raid-Verbuendete gesetzt. */
  allyIndex?: number;
}

/**
 * Rundenbasierte Kampf-Engine.
 *
 * Vollstaendig kopfueber betreibbar (kein Renderer, kein DOM): Eingabe sind
 * Aktionen, Ausgabe ist ein Ereignisprotokoll. Die Darstellung spielt dieses
 * Protokoll ab. Dadurch ist die gesamte Kampflogik unit-testbar und die
 * Animationsschicht kann beliebig ausgetauscht werden.
 */
export class BattleEngine {
  readonly kind: BattleKind;
  readonly player: SideState;
  readonly enemy: SideState;
  readonly field: FieldState;

  private readonly rng: RNG;
  private readonly ai: BattleAI;
  private readonly setup: BattleSetup;
  private readonly ambientWeather: WeatherKind;

  private phaseValue: BattlePhase = 'notStarted';
  private resultValue: BattleResult | null = null;
  private fleeAttempts = 0;
  private pendingLearns: PendingLearn[] = [];
  private evolutionCandidates: { uid: string; toSpecies: string }[] = [];
  private caughtCreature: Creature | null = null;
  private lastBallUsed: string | null = null;

  /** Raid-Zustand. */
  private raidShields: number[] = [];
  private raidShieldHp = 0;
  private raidPhase = 0;
  private raidTurnsLeft = 0;
  private readonly allies: RaidAlly[] = [];

  constructor(setup: BattleSetup) {
    this.setup = setup;
    this.kind = setup.kind;
    this.rng = new RNG(setup.seed ?? `battle-${Date.now()}`);
    this.ai = new BattleAI(setup.aiProfile ?? (setup.trainerId ? 'smart' : 'basic'));
    this.ambientWeather = setup.ambientWeather ?? 'clear';

    this.player = this.makeSide('player', setup.playerParty, setup.playerName,
      null, [], setup.playerCanGigantic ?? false);
    this.enemy = this.makeSide('enemy', setup.enemyParty, setup.enemyName,
      setup.trainerId ?? null, setup.enemyItems ?? [], setup.enemyCanGigantic ?? false);

    this.field = {
      weather: this.ambientWeather,
      weatherTurns: 0,
      weatherIsAmbient: true,
      turn: 0,
    };

    if (setup.raid) {
      this.raidShields = [...setup.raid.shieldThresholds].sort((a, b) => b - a);
      this.raidTurnsLeft = setup.raid.turnLimit;
      this.allies.push(...setup.raid.allies);
    }
  }

  // ------------------------------------------------------------------ Zugriff

  get phase(): BattlePhase { return this.phaseValue; }
  get result(): BattleResult | null { return this.resultValue; }
  get turn(): number { return this.field.turn; }
  get pendingLearnMoves(): readonly PendingLearn[] { return this.pendingLearns; }
  get raidAllies(): readonly RaidAlly[] { return this.allies; }
  get isRaid(): boolean { return this.setup.raid !== undefined; }
  get raidShieldRemaining(): number { return this.raidShields.length; }
  /** Gesamtzahl der Schilde zu Kampfbeginn. */
  get raidShieldTotal(): number { return this.setup.raid?.shieldThresholds.length ?? 0; }

  get playerActive(): Creature { return this.player.party[this.player.activeIndex]!; }
  get enemyActive(): Creature { return this.enemy.party[this.enemy.activeIndex]!; }

  activeOf(side: SideId): Creature {
    return side === 'player' ? this.playerActive : this.enemyActive;
  }

  sideOf(side: SideId): SideState {
    return side === 'player' ? this.player : this.enemy;
  }

  opposing(side: SideId): SideState {
    return side === 'player' ? this.enemy : this.player;
  }

  /** Indizes der Teammitglieder, die eingewechselt werden koennen. */
  availableSwitches(side: SideId): number[] {
    const s = this.sideOf(side);
    return s.party
      .map((c, i) => ({ c, i }))
      .filter((e) => !e.c.isFainted && e.i !== s.activeIndex)
      .map((e) => e.i);
  }

  canFlee(): boolean {
    if (this.setup.allowFlee === false) return false;
    if (this.enemy.trainerId) return false;
    if (this.isRaid) return false;
    for (const eff of this.abilityEffects(this.enemyActive)) {
      if (eff.kind === 'preventEscape') return false;
    }
    return this.player.volatile.trapTurns <= 0;
  }

  canCapture(): boolean {
    return (this.setup.allowCapture ?? !this.enemy.trainerId) && !this.enemy.trainerId;
  }

  // ------------------------------------------------------------------- Ablauf

  /** Startet den Kampf und liefert die Eroeffnungsereignisse. */
  start(): BattleEvent[] {
    if (this.phaseValue !== 'notStarted') return [];
    const events: BattleEvent[] = [];
    this.player.activeIndex = this.firstHealthyIndex(this.player);
    this.enemy.activeIndex = this.firstHealthyIndex(this.enemy);

    events.push({
      t: 'battleStart', kind: this.kind,
      enemyName: this.enemy.trainerName,
      isTrainer: this.enemy.trainerId !== null,
    });

    if (this.field.weather !== 'clear') {
      events.push({
        t: 'weatherChange', weather: this.field.weather,
        text: this.weatherText(this.field.weather),
      });
    }

    events.push(this.sendOutEvent('enemy'));
    events.push(this.sendOutEvent('player'));
    this.markParticipant('player');

    if (this.isRaid) {
      this.raidPhase = 1;
      events.push({ t: 'raidPhase', phase: 1, text: `${this.enemyActive.name} umgibt sich mit gleissender Energie!` });
      events.push({
        t: 'gigantic', side: 'enemy', uid: this.enemyActive.uid,
        name: this.enemyActive.name, newMaxHp: this.enemyActive.maxHp,
      });
      this.enemy.volatile.giganticTurns = Number.MAX_SAFE_INTEGER;
      for (const ally of this.allies) {
        events.push({
          t: 'message',
          text: `${ally.trainerName} schickt ${ally.creature.name} in den Kampf!`,
        });
      }
    }

    events.push(...this.onEntryEffects('enemy'));
    events.push(...this.onEntryEffects('player'));

    this.phaseValue = 'chooseAction';
    return events;
  }

  /** Fuehrt eine vollstaendige Runde aus. */
  submitAction(playerAction: BattleAction): BattleEvent[] {
    if (this.phaseValue !== 'chooseAction') {
      log.warn(`submitAction in Phase "${this.phaseValue}" ignoriert`);
      return [];
    }
    const events: BattleEvent[] = [];
    this.field.turn++;
    if (this.isRaid) this.raidTurnsLeft--;

    this.player.volatile.protectedThisTurn = false;
    this.enemy.volatile.protectedThisTurn = false;

    // --- Flucht wird vor allem anderen aufgeloest --------------------------
    if (playerAction.kind === 'run') {
      const fled = this.tryFlee(events);
      if (fled) return events;
    }

    // --- Fang wird ebenfalls sofort aufgeloest -----------------------------
    if (playerAction.kind === 'item') {
      const item = GameData.items.tryGet(playerAction.itemId);
      if (item?.effect?.kind === 'catch') {
        const done = this.tryCapture(playerAction.itemId, events);
        if (done) return events;
        // Fehlschlag: der Gegner ist trotzdem am Zug.
        events.push(...this.runEnemyOnlyTurn());
        events.push(...this.endOfTurn());
        this.settlePhase(events);
        return events;
      }
    }

    const enemyAction = this.chooseEnemyAction();
    const planned = this.orderActions(playerAction, enemyAction);

    for (const entry of planned) {
      if (this.resultValue) break;
      const side = this.sideOf(entry.side);
      const activeCreature = entry.allyIndex !== undefined
        ? this.allies[entry.allyIndex]!.creature
        : side.party[side.activeIndex]!;
      if (activeCreature.isFainted) continue;
      events.push(...this.performAction(entry));
      events.push(...this.checkFaints());
      if (this.resultValue) break;
    }

    if (!this.resultValue) {
      events.push(...this.endOfTurn());
      events.push(...this.checkFaints());
    }

    this.settlePhase(events);
    return events;
  }

  /** Wechselt nach einem K.O. die Kreatur des Spielers ein. */
  submitReplacement(partyIndex: number): BattleEvent[] {
    if (this.phaseValue !== 'chooseReplacement') return [];
    const target = this.player.party[partyIndex];
    if (!target || target.isFainted) return [];
    const events: BattleEvent[] = [];
    this.player.activeIndex = partyIndex;
    this.player.volatile = createVolatile();
    events.push(this.sendOutEvent('player'));
    this.markParticipant('player');
    events.push(...this.onEntryEffects('player'));
    this.phaseValue = 'chooseAction';
    return events;
  }

  /**
   * Loest eine offene Attackenwahl auf.
   * `replaceIndex === null` bedeutet: Attacke nicht erlernen.
   */
  resolveLearnMove(uid: string, moveId: string, replaceIndex: number | null): BattleEvent[] {
    const idx = this.pendingLearns.findIndex((p) => p.uid === uid && p.moveId === moveId);
    if (idx < 0) return [];
    this.pendingLearns.splice(idx, 1);
    const events: BattleEvent[] = [];
    const creature = this.findCreature(uid);
    if (creature && replaceIndex !== null) {
      const move = GameData.moves.get(moveId);
      creature.learnMove(moveId, replaceIndex);
      events.push({
        t: 'moveLearned', uid, name: creature.name,
        moveId, moveName: move.name,
      });
    } else if (creature) {
      events.push({
        t: 'message',
        text: `${creature.name} hat ${GameData.moves.get(moveId).name} nicht erlernt.`,
      });
    }
    if (this.pendingLearns.length === 0 && this.phaseValue === 'chooseLearnMove') {
      this.phaseValue = this.resultValue ? 'ended' : 'chooseAction';
      if (this.resultValue === null && this.playerActive.isFainted) {
        this.phaseValue = this.availableSwitches('player').length > 0
          ? 'chooseReplacement' : 'ended';
      }
    }
    return events;
  }

  /** Bricht den Kampf ab (z.B. beim Verlassen des Spiels). */
  abort(): void {
    this.resultValue = {
      outcome: 'aborted', moneyDelta: 0, caughtCreature: null,
      evolutionCandidates: [], defeatedTrainerId: null,
    };
    this.phaseValue = 'ended';
  }

  // -------------------------------------------------------------- Hilfsmethoden

  private makeSide(
    id: SideId, party: Creature[], trainerName: string,
    trainerId: string | null, items: string[], canGigantic: boolean,
  ): SideState {
    return {
      id, party, activeIndex: 0,
      volatile: createVolatile(),
      screens: { physical: 0, special: 0 },
      items: [...items],
      trainerId, trainerName, canGigantic,
      giganticUsed: false,
      participants: new Set<string>(),
    };
  }

  private firstHealthyIndex(side: SideState): number {
    const idx = side.party.findIndex((c) => !c.isFainted);
    return idx >= 0 ? idx : 0;
  }

  private sendOutEvent(side: SideId): BattleEvent {
    const s = this.sideOf(side);
    const creature = s.party[s.activeIndex]!;
    creature.state.battleCount++;
    return {
      t: 'sendOut', side, uid: creature.uid, name: creature.name,
      level: creature.level, partyIndex: s.activeIndex,
    };
  }

  private markParticipant(side: SideId): void {
    const s = this.sideOf(side);
    s.participants.add(s.party[s.activeIndex]!.uid);
  }

  private findCreature(uid: string): Creature | null {
    return (
      this.player.party.find((c) => c.uid === uid) ??
      this.enemy.party.find((c) => c.uid === uid) ??
      this.allies.find((a) => a.creature.uid === uid)?.creature ??
      null
    );
  }

  private abilityEffects(creature: Creature): AbilityEffect[] {
    return GameData.abilities.tryGet(creature.ability)?.effects ?? [];
  }

  private heldEffect(creature: Creature): ItemEffect | null {
    if (!creature.heldItem) return null;
    return GameData.items.tryGet(creature.heldItem)?.effect ?? null;
  }

  private weatherText(weather: WeatherKind): string {
    const map: Record<WeatherKind, string> = {
      clear: 'Der Himmel klart auf.',
      cloudy: 'Wolken ziehen auf.',
      rain: 'Es beginnt zu regnen!',
      heavyRain: 'Ein Wolkenbruch setzt ein!',
      thunderstorm: 'Ein Gewitter bricht los!',
      snow: 'Es beginnt zu schneien!',
      blizzard: 'Ein Blizzard tobt!',
      fog: 'Dichter Nebel zieht auf!',
      sandstorm: 'Ein Sandsturm wirbelt auf!',
      harshSun: 'Die Sonne brennt erbarmungslos!',
    };
    return map[weather];
  }

  // ------------------------------------------------------- Aktionsreihenfolge

  private chooseEnemyAction(): BattleAction {
    return this.ai.chooseAction({
      self: this.enemy, opponent: this.player,
      weather: this.field.weather, rng: this.rng, turn: this.field.turn,
      allowItems: this.enemy.trainerId !== null,
      allowGigantic: this.enemy.canGigantic && !this.isRaid,
    });
  }

  private actionPriority(side: SideId, action: BattleAction): number {
    // Wechsel und Gegenstaende gehen allen Attacken voraus.
    if (action.kind === 'switch') return 7;
    if (action.kind === 'item') return 6;
    if (action.kind === 'run') return 8;
    const creature = this.activeOf(side);
    const move = creature.getMoveData(action.moveIndex);
    return move?.priority ?? 0;
  }

  private orderActions(playerAction: BattleAction, enemyAction: BattleAction): PlannedAction[] {
    const entries: PlannedAction[] = [
      {
        side: 'player', action: playerAction,
        priority: this.actionPriority('player', playerAction),
        speed: effectiveSpeed(this.playerActive, this.player, this.field.weather),
      },
      {
        side: 'enemy', action: enemyAction,
        priority: this.actionPriority('enemy', enemyAction),
        speed: effectiveSpeed(this.enemyActive, this.enemy, this.field.weather),
      },
    ];

    // Raid-Verbuendete handeln als eigenstaendige Teilnehmer.
    this.allies.forEach((ally, index) => {
      if (ally.downTurns > 0 || ally.creature.isFainted) return;
      const action = this.chooseAllyAction(ally);
      entries.push({
        side: 'player', action, allyIndex: index,
        priority: ally.creature.getMoveData(
          action.kind === 'move' ? action.moveIndex : 0,
        )?.priority ?? 0,
        speed: ally.creature.stats.spe,
      });
    });

    entries.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.speed !== b.speed) return b.speed - a.speed;
      // Gleichstand: zufaellig, aber deterministisch ueber den Seed.
      return this.rng.chance(0.5) ? -1 : 1;
    });
    return entries;
  }

  private chooseAllyAction(ally: RaidAlly): BattleAction {
    const ai = new BattleAI(ally.ai);
    // Der Verbuendete wird als eigene Seite modelliert, damit die Bewertung
    // seine eigenen Werte statt der Spielerkreatur benutzt.
    const pseudoSide: SideState = {
      ...this.player,
      party: [ally.creature],
      activeIndex: 0,
      volatile: createVolatile(),
      items: [],
    };
    return ai.chooseAction({
      self: pseudoSide, opponent: this.enemy,
      weather: this.field.weather, rng: this.rng, turn: this.field.turn,
      allowItems: false, allowGigantic: false,
    });
  }

  // ------------------------------------------------------- Aktionsausfuehrung

  private performAction(entry: PlannedAction): BattleEvent[] {
    const { side, action } = entry;
    switch (action.kind) {
      case 'switch':
        return this.performSwitch(side, action.partyIndex);
      case 'item':
        return this.performItem(side, action);
      case 'run':
        // Fehlgeschlagene Flucht: die Runde ist verloren.
        return [];
      case 'move':
        return this.performMove(entry);
    }
  }

  private performSwitch(side: SideId, partyIndex: number): BattleEvent[] {
    const s = this.sideOf(side);
    const target = s.party[partyIndex];
    if (!target || target.isFainted || partyIndex === s.activeIndex) return [];
    const events: BattleEvent[] = [];
    const outgoing = s.party[s.activeIndex]!;
    events.push({ t: 'withdraw', side, uid: outgoing.uid, name: outgoing.name });
    s.activeIndex = partyIndex;
    s.volatile = createVolatile();
    events.push(this.sendOutEvent(side));
    this.markParticipant(side);
    events.push(...this.onEntryEffects(side));
    return events;
  }

  private performItem(
    side: SideId, action: Extract<BattleAction, { kind: 'item' }>,
  ): BattleEvent[] {
    const events: BattleEvent[] = [];
    const item = GameData.items.tryGet(action.itemId);
    if (!item || !item.effect) return events;
    const s = this.sideOf(side);
    const target = s.party[action.targetIndex] ?? s.party[s.activeIndex]!;

    if (side === 'player') {
      if (this.setup.consumeItem && !this.setup.consumeItem(action.itemId)) {
        events.push({ t: 'message', text: `Du hast keine ${item.name} mehr.` });
        return events;
      }
    } else {
      const idx = s.items.indexOf(action.itemId);
      if (idx >= 0) s.items.splice(idx, 1);
    }

    const applied = this.applyItemEffect(item.effect, target, side, action, events);
    events.unshift({
      t: 'itemUsed', side, itemId: item.id, itemName: item.name,
      targetUid: target.uid,
      text: side === 'player'
        ? `Du setzt ${item.name} ein!`
        : `${s.trainerName} setzt ${item.name} ein!`,
    });
    if (!applied) events.push({ t: 'message', text: 'Es zeigt keine Wirkung.' });
    return events;
  }

  private applyItemEffect(
    effect: ItemEffect, target: Creature, side: SideId,
    action: Extract<BattleAction, { kind: 'item' }>, events: BattleEvent[],
  ): boolean {
    switch (effect.kind) {
      case 'healHp': {
        if (target.isFainted || target.currentHp >= target.maxHp) return false;
        const amount = effect.amount === 'full' ? target.maxHp
          : effect.amount === 'half' ? Math.ceil(target.maxHp / 2)
          : effect.amount === 'quarter' ? Math.ceil(target.maxHp / 4)
          : effect.amount;
        const healed = target.applyHpDelta(amount);
        events.push({
          t: 'heal', side, uid: target.uid, amount: healed,
          newHp: target.currentHp, maxHp: target.maxHp, source: 'item',
        });
        return healed > 0;
      }
      case 'healStatus': {
        const list = effect.status === 'all'
          ? (['burn', 'freeze', 'paralysis', 'poison', 'toxic', 'sleep'] as StatusCondition[])
          : effect.status;
        if (target.status === 'none' || !list.includes(target.status)) return false;
        const cleared = target.status;
        target.clearStatus();
        events.push({
          t: 'statusCleared', side, uid: target.uid, status: cleared,
          text: `${target.name} ist wieder wohlauf.`,
        });
        return true;
      }
      case 'revive': {
        if (!target.isFainted) return false;
        target.applyHpDelta(Math.max(1, Math.floor(target.maxHp * effect.fraction)));
        target.clearStatus();
        events.push({
          t: 'heal', side, uid: target.uid, amount: target.currentHp,
          newHp: target.currentHp, maxHp: target.maxHp, source: 'revive',
        });
        return true;
      }
      case 'restorePp': {
        const amount = effect.amount === 'full' ? 99 : effect.amount;
        let restored = 0;
        if (effect.allMoves) {
          for (let i = 0; i < target.moves.length; i++) restored += target.restorePp(i, amount);
        } else if (action.moveIndex !== undefined) {
          restored = target.restorePp(action.moveIndex, amount);
        }
        if (restored > 0) {
          events.push({ t: 'message', text: `${target.name} hat wieder Angriffspunkte.` });
        }
        return restored > 0;
      }
      case 'statBoost': {
        const s = this.sideOf(side);
        return this.applyStatStage(s, effect.stat, effect.stages, events);
      }
      case 'escape': {
        if (!this.canFlee()) return false;
        this.finish('fled', events, 'Du bist entkommen!');
        return true;
      }
      default:
        return false;
    }
  }

  // ------------------------------------------------------------ Attackeneinsatz

  private performMove(entry: PlannedAction): BattleEvent[] {
    const events: BattleEvent[] = [];
    const action = entry.action as Extract<BattleAction, { kind: 'move' }>;
    const side = entry.side;
    const attackerSide = this.sideOf(side);
    const defenderSide = this.opposing(side);

    const isAlly = entry.allyIndex !== undefined;
    const attacker = isAlly
      ? this.allies[entry.allyIndex!]!.creature
      : attackerSide.party[attackerSide.activeIndex]!;
    const defender = defenderSide.party[defenderSide.activeIndex]!;
    const volatile = isAlly ? createVolatile() : attackerSide.volatile;

    if (attacker.isFainted || defender.isFainted) return events;

    // --- Erholungsphase nach einer erschoepfenden Attacke ------------------
    if (volatile.mustRecharge) {
      volatile.mustRecharge = false;
      events.push({ t: 'message', text: `${attacker.name} muss sich erst erholen!` });
      return events;
    }

    // --- Zurueckschrecken --------------------------------------------------
    if (volatile.flinched) {
      volatile.flinched = false;
      events.push({ t: 'flinched', side, uid: attacker.uid });
      return events;
    }

    // --- Statusbedingte Handlungsblockaden ---------------------------------
    const blocked = this.checkStatusBlock(side, attacker, events);
    if (blocked) return events;

    // --- Verwirrung --------------------------------------------------------
    if (volatile.confusionTurns > 0) {
      volatile.confusionTurns--;
      if (volatile.confusionTurns === 0) {
        events.push({
          t: 'statusCleared', side, uid: attacker.uid, status: 'none',
          text: `${attacker.name} ist nicht mehr verwirrt.`,
        });
      } else {
        events.push({ t: 'confused', side, uid: attacker.uid, text: `${attacker.name} ist verwirrt!` });
        if (this.rng.chance(1 / 3)) {
          const selfHit = this.confusionSelfDamage(attacker);
          attacker.applyHpDelta(-selfHit);
          events.push({
            t: 'confusionHit', side, uid: attacker.uid,
            amount: selfHit, newHp: attacker.currentHp,
          });
          return events;
        }
      }
    }

    // --- Aufladeattacke: zweite Runde -------------------------------------
    let moveIndex = action.moveIndex;
    let isChargeRelease = false;
    if (volatile.chargingMoveIndex !== null) {
      moveIndex = volatile.chargingMoveIndex;
      volatile.chargingMoveIndex = null;
      isChargeRelease = true;
    }

    let move = attacker.getMoveData(moveIndex);
    const slot = attacker.moves[moveIndex];

    // --- Gigantifizierung --------------------------------------------------
    let gigantic = volatile.giganticTurns > 0;
    if (action.gigantic && !isAlly && !gigantic && attackerSide.canGigantic
        && !attackerSide.giganticUsed && attacker.canGigantic) {
      events.push(...this.activateGigantic(side));
      gigantic = true;
    }

    // Gigantifizierte Kreaturen nutzen ihre exklusive Attacke.
    if (gigantic && attacker.species.giganticMove) {
      const gmax = GameData.moves.tryGet(attacker.species.giganticMove);
      if (gmax && move && move.category !== 'status') move = gmax;
    }

    if (!move || !slot) {
      events.push({ t: 'message', text: `${attacker.name} kann nicht angreifen!` });
      return events;
    }

    // --- AP pruefen --------------------------------------------------------
    const usesPp = !isChargeRelease && !(gigantic && move.giganticOnly);
    if (usesPp && slot.pp <= 0) {
      // Ohne AP bleibt nur die Verzweiflungsattacke.
      const struggle = GameData.moves.tryGet('verzweiflung');
      if (!struggle) {
        events.push({ t: 'message', text: `${attacker.name} kann nicht mehr angreifen!` });
        return events;
      }
      move = struggle;
    } else if (usesPp && !isAlly) {
      attacker.usePp(moveIndex);
    }

    // --- Aufladeattacke: erste Runde --------------------------------------
    if (move.effect?.chargeTurn && !isChargeRelease) {
      volatile.chargingMoveIndex = moveIndex;
      const text = (move.effect.chargeMessage ?? '{user} laedt Energie auf!')
        .replace('{user}', attacker.name);
      events.push({
        t: 'useMove', side, uid: attacker.uid, moveId: move.id,
        moveName: move.name, gigantic,
      });
      events.push({ t: 'message', text });
      return events;
    }

    events.push({
      t: 'useMove', side, uid: attacker.uid, moveId: move.id,
      moveName: move.name, gigantic,
    });

    // --- Schutz des Verteidigers ------------------------------------------
    if (defenderSide.volatile.protectedThisTurn && move.target !== 'self' && move.target !== 'field') {
      events.push({
        t: 'moveFailed', side, reason: 'protected',
        text: `${defender.name} hat sich geschuetzt!`,
      });
      return events;
    }

    // --- Selbst- und Feldattacken -----------------------------------------
    if (move.target === 'self' || move.target === 'field') {
      events.push(...this.applySelfMove(side, attacker, move));
      return events;
    }

    // --- Trefferwurf -------------------------------------------------------
    const hitChance = accuracyChance({
      move, attacker, attackerSide, defenderSide, weather: this.field.weather,
    });
    if (!this.rng.chance(hitChance)) {
      events.push({
        t: 'moveFailed', side, reason: 'miss',
        text: `${attacker.name}s Angriff geht daneben!`,
      });
      if (move.effect?.recoil === 1.0) {
        // Selbstzerstoerung wirkt auch bei Fehlschlag.
        attacker.applyHpDelta(-attacker.maxHp);
      }
      return events;
    }

    // --- Immunitaet durch Faehigkeit --------------------------------------
    const absorbed = this.checkAbilityAbsorb(defenderSide.id, defender, move, events);
    if (absorbed) return events;

    // --- Schaden -----------------------------------------------------------
    let totalDamage = 0;
    if (move.category !== 'status') {
      const hits = move.effect?.multiHit
        ? this.rollMultiHit(move.effect.multiHit)
        : 1;
      for (let hit = 0; hit < hits; hit++) {
        if (defender.isFainted) break;
        const calc = calculateDamage({
          attacker, defender, attackerSide, defenderSide, move,
          weather: this.field.weather, rng: this.rng,
          giganticAttacker: gigantic,
        });
        if (calc.effectiveness === 0) {
          events.push({
            t: 'moveFailed', side, reason: 'noEffect',
            text: `Es hat keine Wirkung auf ${defender.name}...`,
          });
          return events;
        }
        let damage = calc.damage;
        damage = this.applyRaidShield(defenderSide.id, damage, events);
        const applied = -defender.applyHpDelta(-damage);
        totalDamage += applied;
        events.push({
          t: 'damage', side: defenderSide.id, uid: defender.uid, amount: applied,
          newHp: defender.currentHp, maxHp: defender.maxHp,
          effectiveness: calc.effectivenessLabel, critical: calc.critical,
          hitIndex: hits > 1 ? hit + 1 : undefined,
          hitCount: hits > 1 ? hits : undefined,
        });
        if (this.setup.withCrowd) {
          if (calc.critical) events.push({ t: 'crowdReaction', reaction: 'gasp', intensity: 0.8 });
          else if (calc.effectiveness > 1) events.push({ t: 'crowdReaction', reaction: 'cheer', intensity: 0.6 });
        }
      }
      if (totalDamage > 0 && move.effect?.multiHit) {
        events.push({ t: 'message', text: `Getroffen!` });
      }
    }

    // --- Rueckstoss und Lebensentzug --------------------------------------
    if (move.effect?.recoil && totalDamage > 0) {
      const recoil = move.effect.recoil >= 1
        ? attacker.maxHp
        : Math.max(1, Math.floor(totalDamage * move.effect.recoil));
      attacker.applyHpDelta(-recoil);
      events.push({
        t: 'damage', side, uid: attacker.uid, amount: recoil,
        newHp: attacker.currentHp, maxHp: attacker.maxHp,
        effectiveness: 'normal', critical: false,
      });
      events.push({ t: 'message', text: `${attacker.name} nimmt Rueckstossschaden!` });
    }
    if (move.effect?.drain && totalDamage > 0) {
      const drained = attacker.applyHpDelta(Math.max(1, Math.floor(totalDamage * move.effect.drain)));
      if (drained > 0) {
        events.push({
          t: 'heal', side, uid: attacker.uid, amount: drained,
          newHp: attacker.currentHp, maxHp: attacker.maxHp, source: 'drain',
        });
      }
    }

    // --- Zusatzeffekte -----------------------------------------------------
    if (!defender.isFainted) {
      events.push(...this.applySecondaryEffects(side, defender, move));
      events.push(...this.applyContactAbility(side, attacker, defender, move));
    }

    // --- Erschoepfung ------------------------------------------------------
    if (move.effect?.rechargeTurn) volatile.mustRecharge = true;
    if (move.effect?.selfSwitch && this.availableSwitches(side).length > 0) {
      const next = this.availableSwitches(side)[0]!;
      events.push(...this.performSwitch(side, next));
    }

    return events;
  }

  private rollMultiHit(range: [number, number]): number {
    const [min, max] = range;
    if (min === max) return min;
    // Zwei und drei Treffer sind haeufiger als vier und fuenf.
    const roll = this.rng.next();
    if (roll < 0.375) return min;
    if (roll < 0.75) return Math.min(max, min + 1);
    if (roll < 0.875) return Math.min(max, min + 2);
    return max;
  }

  private confusionSelfDamage(attacker: Creature): number {
    const power = GameConfig.battle.confusionSelfHitPower;
    const atk = attacker.stats.atk;
    const def = attacker.stats.def;
    const base = Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * power * atk) / def / 50) + 2;
    return Math.max(1, base);
  }

  private checkStatusBlock(side: SideId, creature: Creature, events: BattleEvent[]): boolean {
    switch (creature.status) {
      case 'sleep': {
        creature.state.statusCounter--;
        if (creature.state.statusCounter <= 0) {
          creature.clearStatus();
          events.push({
            t: 'statusCleared', side, uid: creature.uid, status: 'sleep',
            text: `${creature.name} wacht auf!`,
          });
          return false;
        }
        events.push({ t: 'message', text: `${creature.name} schlaeft tief und fest.` });
        return true;
      }
      case 'freeze': {
        if (this.rng.chance(0.2)) {
          creature.clearStatus();
          events.push({
            t: 'statusCleared', side, uid: creature.uid, status: 'freeze',
            text: `${creature.name} taut auf!`,
          });
          return false;
        }
        events.push({ t: 'message', text: `${creature.name} ist eingefroren!` });
        return true;
      }
      case 'paralysis': {
        if (this.rng.chance(0.25)) {
          events.push({ t: 'message', text: `${creature.name} ist gelaehmt und kann nicht angreifen!` });
          return true;
        }
        return false;
      }
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------- Effekte

  private applySelfMove(side: SideId, user: Creature, move: MoveData): BattleEvent[] {
    const events: BattleEvent[] = [];
    const s = this.sideOf(side);
    const eff = move.effect;
    if (!eff) return events;

    if (eff.protect) {
      // Wiederholter Schutz wird zunehmend unzuverlaessig.
      const chance = 1 / Math.pow(2, s.volatile.protectStreak);
      if (this.rng.chance(chance)) {
        s.volatile.protectedThisTurn = true;
        s.volatile.protectStreak++;
        events.push({ t: 'message', text: `${user.name} schuetzt sich!` });
      } else {
        s.volatile.protectStreak = 0;
        events.push({ t: 'moveFailed', side, reason: 'failed', text: 'Doch es schlug fehl!' });
      }
      return events;
    }
    s.volatile.protectStreak = 0;

    if (eff.heal) {
      let fraction = eff.heal;
      // Mondlicht wirkt nachts staerker, in der Sonne schwaecher.
      if (move.id === 'mondlicht') {
        if (this.setup.timeOfDay === 'night' || this.setup.timeOfDay === 'dusk') fraction = 0.66;
        else if (this.field.weather === 'harshSun') fraction = 0.33;
      }
      if (move.id === 'sandpanzer' && this.field.weather === 'sandstorm') fraction = 0.66;
      const amount = Math.floor(user.maxHp * fraction);
      const healed = user.applyHpDelta(amount);
      if (healed <= 0) {
        events.push({ t: 'moveFailed', side, reason: 'failed', text: 'Doch es schlug fehl!' });
      } else {
        events.push({
          t: 'heal', side, uid: user.uid, amount: healed,
          newHp: user.currentHp, maxHp: user.maxHp, source: 'move',
        });
      }
    }

    if (eff.statChanges) {
      for (const change of eff.statChanges) {
        const targetSide = change.target === 'self' ? s : this.opposing(side);
        this.applyStatStage(targetSide, change.stat, change.stages, events);
      }
    }

    if (eff.weather) {
      this.setWeather(eff.weather, eff.weatherTurns ?? 5, events);
    }

    if (eff.screen) {
      const turns = eff.screenTurns ?? 5;
      s.screens[eff.screen] = turns;
      events.push({
        t: 'screen', side, kind: eff.screen, turns,
        text: eff.screen === 'physical'
          ? 'Ein Schild gegen physische Angriffe entsteht!'
          : 'Ein Schild gegen Spezial-Angriffe entsteht!',
      });
    }

    if (eff.critStages) {
      events.push({ t: 'message', text: `${user.name} konzentriert sich!` });
      s.volatile.stages.accuracy = Math.min(6, s.volatile.stages.accuracy + 1);
    }

    if (eff.healPartyStatus) {
      let healed = 0;
      for (const c of s.party) {
        if (c.status !== 'none' && !c.isFainted) {
          c.clearStatus();
          healed++;
        }
      }
      events.push({
        t: 'message',
        text: healed > 0
          ? 'Das ganze Team wurde von Statusproblemen befreit!'
          : 'Doch es schlug fehl!',
      });
    }

    return events;
  }

  private applySecondaryEffects(
    side: SideId, defender: Creature, move: MoveData,
  ): BattleEvent[] {
    const events: BattleEvent[] = [];
    const eff = move.effect;
    if (!eff) return events;
    const defenderSide = this.opposing(side);

    if (eff.status && this.rng.chance(eff.statusChance ?? 0)) {
      this.applyStatus(defenderSide.id, defender, eff.status, events);
    }

    if (eff.statChanges) {
      const chance = eff.statChangeChance ?? 1;
      if (this.rng.chance(chance)) {
        for (const change of eff.statChanges) {
          const targetSide = change.target === 'self' ? this.sideOf(side) : defenderSide;
          this.applyStatStage(targetSide, change.stat, change.stages, events);
        }
      }
    }

    const confuseChance = typeof eff.confuseChance === 'number'
      ? eff.confuseChance : eff.confuseChance === true ? 1 : eff.confuse ? 1 : 0;
    if (confuseChance > 0 && this.rng.chance(confuseChance)) {
      if (defenderSide.volatile.confusionTurns <= 0) {
        defenderSide.volatile.confusionTurns = this.rng.int(2, 5);
        events.push({
          t: 'confused', side: defenderSide.id, uid: defender.uid,
          text: `${defender.name} wird verwirrt!`,
        });
      }
    }

    if (eff.flinchChance && this.rng.chance(eff.flinchChance)) {
      defenderSide.volatile.flinched = true;
    }

    if (eff.trap && defenderSide.volatile.trapTurns <= 0) {
      defenderSide.volatile.trapTurns = this.rng.int(4, 5);
      defenderSide.volatile.trapDamageFraction = eff.trapDamage ?? 0.0625;
      events.push({
        t: 'trapped', side: defenderSide.id, uid: defender.uid,
        text: `${defender.name} kann nicht mehr entkommen!`,
      });
    }

    if (eff.forceSwitch) {
      const options = this.availableSwitches(defenderSide.id);
      if (options.length > 0 && !defenderSide.trainerId) {
        this.finish('fled', events, `${defender.name} ergreift die Flucht!`);
      } else if (options.length > 0) {
        const next = this.rng.pick(options);
        events.push(...this.performSwitch(defenderSide.id, next));
      }
    }

    if (eff.weather) this.setWeather(eff.weather, eff.weatherTurns ?? 4, events);

    return events;
  }

  /** Faehigkeiten, die bei Beruehrung auf den Angreifer wirken. */
  private applyContactAbility(
    side: SideId, attacker: Creature, defender: Creature, move: MoveData,
  ): BattleEvent[] {
    const events: BattleEvent[] = [];
    if (!move.contact || move.category === 'status') return events;
    for (const eff of this.abilityEffects(defender)) {
      if (eff.kind === 'contactStatus' && attacker.status === 'none' && this.rng.chance(eff.chance)) {
        const abilityName = GameData.abilities.get(defender.ability).name;
        events.push({
          t: 'ability', side: this.opposing(side).id, uid: defender.uid,
          abilityName, text: `${defender.name}s ${abilityName} wirkt!`,
        });
        this.applyStatus(side, attacker, eff.status, events);
      }
    }
    return events;
  }

  /** Faehigkeiten, die einen Attackentyp vollstaendig absorbieren. */
  private checkAbilityAbsorb(
    side: SideId, defender: Creature, move: MoveData, events: BattleEvent[],
  ): boolean {
    if (move.category === 'status') return false;
    for (const eff of this.abilityEffects(defender)) {
      if (eff.kind !== 'immuneToType' || eff.type !== move.type) continue;
      const abilityName = GameData.abilities.get(defender.ability).name;
      events.push({
        t: 'ability', side, uid: defender.uid, abilityName,
        text: `${defender.name}s ${abilityName} absorbiert den Angriff!`,
      });
      if (eff.heal) {
        const healed = defender.applyHpDelta(Math.floor(defender.maxHp * eff.heal));
        if (healed > 0) {
          events.push({
            t: 'heal', side, uid: defender.uid, amount: healed,
            newHp: defender.currentHp, maxHp: defender.maxHp, source: 'ability',
          });
        }
      }
      if (eff.boostStat) {
        this.applyStatStage(this.sideOf(side), eff.boostStat, 1, events);
      }
      return true;
    }
    return false;
  }

  private applyStatus(
    side: SideId, target: Creature, status: StatusCondition, events: BattleEvent[],
  ): boolean {
    if (status === 'none' || target.status !== 'none' || target.isFainted) return false;

    // Typbedingte Immunitaeten
    const types = target.types;
    const immune =
      (status === 'burn' && types.includes('fire')) ||
      (status === 'freeze' && types.includes('ice')) ||
      (status === 'paralysis' && types.includes('electric')) ||
      ((status === 'poison' || status === 'toxic') &&
        (types.includes('poison') || types.includes('steel')));
    if (immune) return false;

    for (const eff of this.abilityEffects(target)) {
      if (eff.kind === 'statusImmunity' && eff.status.includes(status)) {
        const abilityName = GameData.abilities.get(target.ability).name;
        events.push({
          t: 'ability', side, uid: target.uid, abilityName,
          text: `${target.name}s ${abilityName} verhindert das!`,
        });
        return false;
      }
    }
    const held = this.heldEffect(target);
    if (held?.kind === 'heldStatusGuard') {
      const list = held.status === 'all'
        ? (['burn', 'freeze', 'paralysis', 'poison', 'toxic', 'sleep'] as StatusCondition[])
        : held.status;
      if (list.includes(status)) return false;
    }

    const counter = status === 'sleep' ? this.rng.int(2, 4) : status === 'toxic' ? 1 : 0;
    target.setStatus(status, counter);
    events.push({
      t: 'statusApplied', side, uid: target.uid, status,
      text: this.statusText(target.name, status),
    });
    return true;
  }

  private statusText(name: string, status: StatusCondition): string {
    switch (status) {
      case 'burn': return `${name} erleidet Verbrennungen!`;
      case 'freeze': return `${name} friert ein!`;
      case 'paralysis': return `${name} ist gelaehmt!`;
      case 'poison': return `${name} wurde vergiftet!`;
      case 'toxic': return `${name} wurde schwer vergiftet!`;
      case 'sleep': return `${name} schlaeft ein!`;
      default: return '';
    }
  }

  private applyStatStage(
    target: SideState, stat: BattleStatKey, delta: number, events: BattleEvent[],
  ): boolean {
    const creature = target.party[target.activeIndex]!;
    if (creature.isFainted) return false;

    if (delta < 0) {
      for (const eff of this.abilityEffects(creature)) {
        if (eff.kind === 'ignoreStatChanges') {
          return false;
        }
      }
    }

    const current = target.volatile.stages[stat];
    const next = Math.max(
      GameConfig.battle.minStatStage,
      Math.min(GameConfig.battle.maxStatStage, current + delta),
    );
    if (next === current) {
      events.push({
        t: 'message',
        text: delta > 0
          ? `${creature.name}s ${this.statName(stat)} kann nicht weiter steigen!`
          : `${creature.name}s ${this.statName(stat)} kann nicht weiter sinken!`,
      });
      return false;
    }
    target.volatile.stages[stat] = next;
    const magnitude = Math.abs(delta);
    const dir = delta > 0 ? 'steigt' : 'sinkt';
    const intensity = magnitude >= 3 ? ' extrem' : magnitude === 2 ? ' stark' : '';
    events.push({
      t: 'statChange', side: target.id, uid: creature.uid, stat, delta,
      newStage: next,
      text: `${creature.name}s ${this.statName(stat)} ${dir}${intensity}!`,
    });
    return true;
  }

  private statName(stat: BattleStatKey): string {
    const names: Record<BattleStatKey, string> = {
      atk: 'Angriff', def: 'Verteidigung', spa: 'Spezial-Angriff',
      spd: 'Spezial-Verteidigung', spe: 'Initiative',
      accuracy: 'Genauigkeit', evasion: 'Ausweichen',
    };
    return names[stat];
  }

  private setWeather(weather: WeatherKind, turns: number, events: BattleEvent[]): void {
    if (this.field.weather === weather && !this.field.weatherIsAmbient) {
      events.push({ t: 'moveFailed', side: 'player', reason: 'failed', text: 'Doch es schlug fehl!' });
      return;
    }
    this.field.weather = weather;
    this.field.weatherTurns = turns;
    this.field.weatherIsAmbient = false;
    events.push({ t: 'weatherChange', weather, text: this.weatherText(weather) });
  }

  private onEntryEffects(side: SideId): BattleEvent[] {
    const events: BattleEvent[] = [];
    const s = this.sideOf(side);
    const creature = s.party[s.activeIndex]!;
    const ability = GameData.abilities.tryGet(creature.ability);
    if (!ability) return events;

    for (const eff of ability.effects) {
      switch (eff.kind) {
        case 'weatherOnEntry':
          if (this.field.weather !== eff.weather) {
            events.push({
              t: 'ability', side, uid: creature.uid, abilityName: ability.name,
              text: `${creature.name}s ${ability.name} veraendert das Wetter!`,
            });
            this.setWeather(eff.weather, eff.turns, events);
          }
          break;
        case 'statOnEntry':
          events.push({
            t: 'ability', side, uid: creature.uid, abilityName: ability.name,
            text: `${creature.name}s ${ability.name} wirkt!`,
          });
          this.applyStatStage(s, eff.stat, eff.stages, events);
          break;
        case 'intimidate': {
          const other = this.opposing(side);
          events.push({
            t: 'ability', side, uid: creature.uid, abilityName: ability.name,
            text: `${creature.name} schuechtert den Gegner ein!`,
          });
          this.applyStatStage(other, 'atk', -eff.stages, events);
          break;
        }
        default:
          break;
      }
    }
    return events;
  }

  // ----------------------------------------------------------- Rundenabschluss

  private endOfTurn(): BattleEvent[] {
    const events: BattleEvent[] = [];

    // Wetter laeuft ab und faellt auf das Umgebungswetter zurueck.
    if (!this.field.weatherIsAmbient && this.field.weatherTurns > 0) {
      this.field.weatherTurns--;
      if (this.field.weatherTurns === 0) {
        this.field.weather = this.ambientWeather;
        this.field.weatherIsAmbient = true;
        events.push({
          t: 'weatherChange', weather: this.field.weather,
          text: 'Das Wetter normalisiert sich.',
        });
      }
    }

    for (const side of ['player', 'enemy'] as SideId[]) {
      const s = this.sideOf(side);
      const creature = s.party[s.activeIndex]!;
      if (creature.isFainted) continue;

      events.push(...this.applyWeatherDamage(side, creature));
      if (creature.isFainted) continue;
      events.push(...this.applyStatusDamage(side, creature));
      if (creature.isFainted) continue;
      events.push(...this.applyTrapDamage(side, creature));
      if (creature.isFainted) continue;
      events.push(...this.applyHeldItemTick(side, creature));

      // Schutzschilde laufen ab.
      for (const kind of ['physical', 'special'] as const) {
        if (s.screens[kind] > 0) {
          s.screens[kind]--;
          if (s.screens[kind] === 0) {
            events.push({
              t: 'message',
              text: kind === 'physical'
                ? 'Der Schild gegen physische Angriffe verschwindet.'
                : 'Der Schild gegen Spezial-Angriffe verschwindet.',
            });
          }
        }
      }

      // Gigantifizierung laeuft ab.
      if (s.volatile.giganticTurns > 0 && s.volatile.giganticTurns !== Number.MAX_SAFE_INTEGER) {
        s.volatile.giganticTurns--;
        if (s.volatile.giganticTurns === 0) {
          events.push(...this.deactivateGigantic(side));
        }
      }

      s.volatile.turnsOnField++;
      s.volatile.justSwitchedIn = false;
    }

    // Raid-Verbuendete erholen sich.
    for (const ally of this.allies) {
      if (ally.downTurns > 0) {
        ally.downTurns--;
        if (ally.downTurns === 0) {
          ally.creature.applyHpDelta(Math.floor(ally.creature.maxHp * 0.5));
          events.push({
            t: 'message',
            text: `${ally.trainerName} schickt ${ally.creature.name} zurueck in den Kampf!`,
          });
        }
      }
    }

    // Raid-Zeitlimit
    if (this.isRaid && this.raidTurnsLeft <= 0 && !this.resultValue) {
      this.finish('loss', events, 'Die Energie des Punktes versiegt - der Raid ist gescheitert.');
    }

    return events;
  }

  private applyWeatherDamage(side: SideId, creature: Creature): BattleEvent[] {
    const events: BattleEvent[] = [];
    const weather = this.field.weather;
    const immune = this.abilityEffects(creature).some((e) => e.kind === 'noWeatherDamage');
    if (immune) {
      // Regenerationsfaehigkeiten wirken weiterhin.
      for (const eff of this.abilityEffects(creature)) {
        if (eff.kind === 'healInWeather' && eff.weather.includes(weather)) {
          const healed = creature.applyHpDelta(Math.floor(creature.maxHp * eff.fraction));
          if (healed > 0) {
            events.push({
              t: 'heal', side, uid: creature.uid, amount: healed,
              newHp: creature.currentHp, maxHp: creature.maxHp, source: 'ability',
            });
          }
        }
      }
      return events;
    }

    for (const eff of this.abilityEffects(creature)) {
      if (eff.kind === 'healInWeather' && eff.weather.includes(weather)) {
        const healed = creature.applyHpDelta(Math.floor(creature.maxHp * eff.fraction));
        if (healed > 0) {
          events.push({
            t: 'heal', side, uid: creature.uid, amount: healed,
            newHp: creature.currentHp, maxHp: creature.maxHp, source: 'ability',
          });
        }
        return events;
      }
    }

    const types = creature.types;
    let fraction = 0;
    if (weather === 'sandstorm' && !types.some((t) => t === 'rock' || t === 'ground' || t === 'steel')) {
      fraction = 1 / 16;
    } else if (weather === 'blizzard' && !types.includes('ice')) {
      fraction = 1 / 16;
    }
    if (fraction <= 0) return events;

    const damage = Math.max(1, Math.floor(creature.maxHp * fraction));
    creature.applyHpDelta(-damage);
    events.push({
      t: 'weatherDamage', side, uid: creature.uid, amount: damage,
      newHp: creature.currentHp, weather,
    });
    return events;
  }

  private applyStatusDamage(side: SideId, creature: Creature): BattleEvent[] {
    const events: BattleEvent[] = [];
    let fraction = 0;
    if (creature.status === 'burn') fraction = 1 / 16;
    else if (creature.status === 'poison') fraction = 1 / 8;
    else if (creature.status === 'toxic') {
      fraction = creature.state.statusCounter / 16;
      creature.state.statusCounter = Math.min(15, creature.state.statusCounter + 1);
    }
    if (fraction <= 0) return events;

    const damage = Math.max(1, Math.floor(creature.maxHp * fraction));
    creature.applyHpDelta(-damage);
    events.push({
      t: 'statusDamage', side, uid: creature.uid, status: creature.status,
      amount: damage, newHp: creature.currentHp,
    });
    return events;
  }

  private applyTrapDamage(side: SideId, creature: Creature): BattleEvent[] {
    const events: BattleEvent[] = [];
    const s = this.sideOf(side);
    if (s.volatile.trapTurns <= 0) return events;
    s.volatile.trapTurns--;
    const damage = Math.max(1, Math.floor(creature.maxHp * s.volatile.trapDamageFraction));
    creature.applyHpDelta(-damage);
    events.push({
      t: 'damage', side, uid: creature.uid, amount: damage,
      newHp: creature.currentHp, maxHp: creature.maxHp,
      effectiveness: 'normal', critical: false,
    });
    if (s.volatile.trapTurns === 0) {
      events.push({ t: 'message', text: `${creature.name} ist wieder frei.` });
    }
    return events;
  }

  private applyHeldItemTick(side: SideId, creature: Creature): BattleEvent[] {
    const events: BattleEvent[] = [];
    const effect = this.heldEffect(creature);
    if (!effect) return events;
    const itemName = GameData.items.get(creature.heldItem!).name;

    if (effect.kind === 'heldHealEachTurn' && creature.currentHp < creature.maxHp) {
      const healed = creature.applyHpDelta(Math.max(1, Math.floor(creature.maxHp * effect.fraction)));
      if (healed > 0) {
        events.push({
          t: 'heldItem', side, uid: creature.uid, itemId: creature.heldItem!,
          text: `${creature.name} regeneriert durch ${itemName}.`,
        });
        events.push({
          t: 'heal', side, uid: creature.uid, amount: healed,
          newHp: creature.currentHp, maxHp: creature.maxHp, source: 'item',
        });
      }
    }

    if (effect.kind === 'heldPinch' && creature.hpFraction <= effect.threshold
        && creature.currentHp > 0) {
      const healed = creature.applyHpDelta(Math.floor(creature.maxHp * effect.fraction));
      if (healed > 0) {
        creature.state.heldItem = null;
        events.push({
          t: 'heldItem', side, uid: creature.uid, itemId: itemName,
          text: `${creature.name} verzehrt ${itemName}!`,
        });
        events.push({
          t: 'heal', side, uid: creature.uid, amount: healed,
          newHp: creature.currentHp, maxHp: creature.maxHp, source: 'item',
        });
      }
    }
    return events;
  }

  // ------------------------------------------------------------ Gigantifizierung

  private activateGigantic(side: SideId): BattleEvent[] {
    const events: BattleEvent[] = [];
    const s = this.sideOf(side);
    const creature = s.party[s.activeIndex]!;
    const bonus = Math.floor(creature.maxHp * (GameConfig.battle.giganticHpMultiplier - 1));
    s.volatile.giganticTurns = GameConfig.battle.giganticTurns;
    s.volatile.giganticBonusHp = bonus;
    s.giganticUsed = true;
    creature.applyHpDelta(bonus);
    // Der Bonus wirkt als temporaere Zusatz-KP ueber dem Maximum hinaus.
    creature.state.currentHp = Math.min(creature.maxHp + bonus, creature.currentHp + bonus);
    events.push({
      t: 'gigantic', side, uid: creature.uid, name: creature.name,
      newMaxHp: creature.maxHp + bonus,
    });
    events.push({
      t: 'message',
      text: `${creature.name} gigantifiziert und wird gewaltig gross!`,
    });
    if (this.setup.withCrowd) {
      events.push({ t: 'crowdReaction', reaction: 'roar', intensity: 1 });
    }
    return events;
  }

  private deactivateGigantic(side: SideId): BattleEvent[] {
    const events: BattleEvent[] = [];
    const s = this.sideOf(side);
    const creature = s.party[s.activeIndex]!;
    if (creature.currentHp > creature.maxHp) {
      creature.state.currentHp = creature.maxHp;
    }
    s.volatile.giganticBonusHp = 0;
    events.push({ t: 'giganticEnd', side, uid: creature.uid, name: creature.name });
    events.push({ t: 'message', text: `${creature.name} kehrt zur normalen Groesse zurueck.` });
    return events;
  }

  /**
   * Raid-Schild: absorbiert Schaden, bricht bei erschoepfter Schildhuelle und
   * kappt den Treffer, der die naechste Schwelle unterschreitet.
   *
   * Ohne die Kappung koennte ein einziger starker Treffer saemtliche Schilde
   * ueberspringen und den Boss sofort besiegen.
   */
  private applyRaidShield(defenderSide: SideId, damage: number, events: BattleEvent[]): number {
    if (!this.isRaid || defenderSide !== 'enemy') return damage;
    const boss = this.enemyActive;
    let incoming = damage;

    if (this.raidShieldHp > 0) {
      const absorbed = Math.min(this.raidShieldHp, incoming);
      this.raidShieldHp -= absorbed;
      incoming = Math.floor((incoming - absorbed) + absorbed * 0.25);
      if (this.raidShieldHp <= 0) {
        this.raidShields.shift();
        events.push({ t: 'raidShieldBreak', remaining: this.raidShields.length });
        events.push({ t: 'message', text: `Der Schild von ${boss.name} zerbricht!` });
        this.enemy.volatile.mustRecharge = true;
      }
      incoming = Math.max(1, incoming);
    }

    // Naechste Schwelle: der Boss bleibt darauf stehen und errichtet dort
    // seinen Schild.
    const nextThreshold = this.raidShields[0];
    if (nextThreshold !== undefined) {
      const thresholdHp = Math.max(1, Math.ceil(boss.maxHp * nextThreshold));
      if (boss.currentHp - incoming < thresholdHp) {
        this.raidShieldHp = Math.floor(boss.maxHp * 0.22);
        this.raidPhase++;
        events.push({
          t: 'raidPhase', phase: this.raidPhase,
          text: `${boss.name} errichtet einen Schild!`,
        });
        return Math.max(0, boss.currentHp - thresholdHp);
      }
    }
    return incoming;
  }

  // ------------------------------------------------------- K.O. und Erfahrung

  private checkFaints(): BattleEvent[] {
    const events: BattleEvent[] = [];
    if (this.resultValue) return events;

    // Raid-Verbuendete
    for (const ally of this.allies) {
      if (ally.creature.isFainted && ally.downTurns === 0) {
        ally.downTurns = 2;
        events.push({ t: 'message', text: `${ally.creature.name} wurde zurueckgezogen!` });
      }
    }

    const enemy = this.enemyActive;
    if (enemy.isFainted) {
      events.push({ t: 'faint', side: 'enemy', uid: enemy.uid, name: enemy.name });
      if (this.setup.withCrowd) {
        events.push({ t: 'crowdReaction', reaction: 'cheer', intensity: 0.9 });
      }
      events.push(...this.awardExperience(enemy));
      const remaining = this.availableSwitches('enemy');
      if (remaining.length === 0) {
        this.finish('win', events, this.victoryText());
        return events;
      }
      const next = this.chooseEnemyReplacement(remaining);
      this.enemy.activeIndex = next;
      this.enemy.volatile = createVolatile();
      this.enemy.participants.clear();
      events.push({
        t: 'message',
        text: `${this.enemy.trainerName} schickt ${this.enemy.party[next]!.name} in den Kampf!`,
      });
      events.push(this.sendOutEvent('enemy'));
      events.push(...this.onEntryEffects('enemy'));
      this.markParticipant('player');
      return events;
    }

    const player = this.playerActive;
    if (player.isFainted) {
      events.push({ t: 'faint', side: 'player', uid: player.uid, name: player.name });
      player.addFriendship(GameConfig.creature.friendshipOnFaint);
      const remaining = this.availableSwitches('player');
      if (remaining.length === 0) {
        const money = this.calculateLossMoney();
        this.finish('loss', events, 'Du hast keine einsatzfaehigen Kreaturen mehr!', -money);
        return events;
      }
      this.phaseValue = 'chooseReplacement';
    }
    return events;
  }

  private chooseEnemyReplacement(options: number[]): number {
    const target = this.playerActive;
    let best = options[0]!;
    let bestScore = -Infinity;
    for (const idx of options) {
      const c = this.enemy.party[idx]!;
      let score = 0;
      for (const slot of c.moves) {
        const move = GameData.moves.tryGet(slot.moveId);
        if (!move || move.category === 'status') continue;
        score = Math.max(score, move.power * GameData.effectivenessAgainst(move.type, target.types));
      }
      // Defensive Eignung mitbewerten.
      const incoming = Math.max(
        ...target.types.map((t) => GameData.effectivenessAgainst(t, c.types)),
      );
      score -= incoming * 25;
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    }
    return best;
  }

  private awardExperience(defeated: Creature): BattleEvent[] {
    const events: BattleEvent[] = [];
    const participants = this.player.party.filter(
      (c) => !c.isFainted && this.player.participants.has(c.uid),
    );
    const recipients = participants.length > 0
      ? participants
      : this.player.party.filter((c) => !c.isFainted).slice(0, 1);
    if (recipients.length === 0) return events;

    for (const creature of recipients) {
      if (creature.level >= GameConfig.creature.maxLevel) continue;
      const heldEff = this.heldEffect(creature);
      const amount = expGain({
        defeatedBaseExp: defeated.species.baseExp,
        defeatedLevel: defeated.level,
        winnerLevel: creature.level,
        isTrainerBattle: this.enemy.trainerId !== null,
        participants: recipients.length,
        expShare: false,
        itemMultiplier: heldEff?.kind === 'heldExpBoost' ? heldEff.multiplier : 1,
        friendshipBonus: creature.friendship >= 220,
      });

      const beforeStats = { ...creature.stats };
      const levels = creature.addExp(amount);
      events.push({
        t: 'expGain', uid: creature.uid, name: creature.name, amount,
        newExp: creature.exp, progress: creature.levelProgress(),
      });

      for (const level of levels) {
        const gains: Record<string, number> = {};
        const afterStats = creature.stats;
        for (const key of Object.keys(afterStats) as (keyof typeof afterStats)[]) {
          gains[key] = afterStats[key] - beforeStats[key];
        }
        events.push({
          t: 'levelUp', uid: creature.uid, name: creature.name, level, statGains: gains,
        });
        for (const moveId of creature.movesLearnedAtLevel(level)) {
          const move = GameData.moves.tryGet(moveId);
          if (!move) continue;
          if (creature.moves.length < 4) {
            creature.learnMove(moveId);
            events.push({
              t: 'moveLearned', uid: creature.uid, name: creature.name,
              moveId, moveName: move.name,
            });
          } else {
            this.pendingLearns.push({ uid: creature.uid, moveId });
            events.push({
              t: 'moveLearnPrompt', uid: creature.uid, name: creature.name,
              moveId, moveName: move.name,
            });
          }
        }
      }

      // EV-Ertrag
      creature.addEvs(defeated.species.evYield);

      // Entwicklung vormerken
      const evolveTo = checkEvolution(creature, {
        timeOfDay: this.setup.timeOfDay ?? 'day',
        areaId: '',
        gigantified: this.player.volatile.giganticTurns > 0,
      });
      if (evolveTo && !this.evolutionCandidates.some((e) => e.uid === creature.uid)) {
        this.evolutionCandidates.push({ uid: creature.uid, toSpecies: evolveTo });
        events.push({
          t: 'evolutionReady', uid: creature.uid, name: creature.name, toSpecies: evolveTo,
        });
      }
    }
    return events;
  }

  private victoryText(): string {
    if (this.enemy.trainerId) return `Du hast ${this.enemy.trainerName} besiegt!`;
    return `Das wilde ${this.enemyActive.name} wurde besiegt!`;
  }

  private calculateRewardMoney(): number {
    if (!this.enemy.trainerId) return 0;
    const base = this.setup.rewardBase ?? 60;
    const highestLevel = Math.max(...this.enemy.party.map((c) => c.level));
    return base * highestLevel;
  }

  private calculateLossMoney(): number {
    const highestLevel = Math.max(...this.player.party.map((c) => c.level), 1);
    return Math.min(8000, highestLevel * 40);
  }

  // --------------------------------------------------------------- Flucht/Fang

  private tryFlee(events: BattleEvent[]): boolean {
    if (!this.canFlee()) {
      events.push({
        t: 'fleeAttempt', success: false,
        text: this.enemy.trainerId
          ? 'Vor einem Trainerkampf kann man nicht fliehen!'
          : 'Eine Flucht ist nicht moeglich!',
      });
      return false;
    }
    this.fleeAttempts++;
    const chance = fleeChance(
      effectiveSpeed(this.playerActive, this.player, this.field.weather),
      effectiveSpeed(this.enemyActive, this.enemy, this.field.weather),
      this.fleeAttempts,
    );
    if (this.rng.chance(chance)) {
      events.push({ t: 'fleeAttempt', success: true, text: 'Du bist entkommen!' });
      this.finish('fled', events, '');
      return true;
    }
    events.push({ t: 'fleeAttempt', success: false, text: 'Die Flucht misslingt!' });
    // Der Gegner ist trotzdem am Zug.
    events.push(...this.runEnemyOnlyTurn());
    events.push(...this.endOfTurn());
    events.push(...this.checkFaints());
    this.settlePhase(events);
    return true;
  }

  /** Wirft einen Fangball. Liefert true, wenn der Kampf damit endet. */
  private tryCapture(ballId: string, events: BattleEvent[]): boolean {
    if (!this.canCapture()) {
      events.push({ t: 'message', text: 'Man kann nicht die Kreatur eines anderen Trainers fangen!' });
      this.phaseValue = 'chooseAction';
      return true;
    }
    if (this.setup.consumeItem && !this.setup.consumeItem(ballId)) {
      events.push({ t: 'message', text: 'Du hast keinen solchen Ball mehr.' });
      this.phaseValue = 'chooseAction';
      return true;
    }
    this.lastBallUsed = ballId;
    const target = this.enemyActive;
    events.push({ t: 'captureThrow', itemId: ballId, targetUid: target.uid });

    const result = attemptCapture({
      target, ballId, turn: this.field.turn,
      timeOfDay: this.setup.timeOfDay ?? 'day',
      inCave: this.setup.inCave ?? false,
      isFirstTurn: this.field.turn <= 1,
      rng: this.rng,
    });

    const shakes = result.success ? 3 : result.shakes;
    for (let i = 0; i < shakes; i++) events.push({ t: 'captureShake', index: i + 1 });
    events.push({
      t: 'captureResult', success: result.success,
      targetUid: target.uid, name: target.name,
    });

    if (result.success) {
      target.state.caughtBall = ballId;
      target.state.originalTrainer = this.setup.playerName;
      target.state.caughtLevel = target.level;
      this.caughtCreature = target;
      this.finish('caught', events, `${target.name} wurde gefangen!`);
      return true;
    }
    events.push({ t: 'message', text: `Oh nein! ${target.name} hat sich befreit!` });
    return false;
  }

  /** Nur der Gegner handelt (nach fehlgeschlagener Flucht oder fehlgeschlagenem Fang). */
  private runEnemyOnlyTurn(): BattleEvent[] {
    if (this.resultValue) return [];
    const action = this.chooseEnemyAction();
    const events = this.performAction({
      side: 'enemy', action, priority: 0,
      speed: effectiveSpeed(this.enemyActive, this.enemy, this.field.weather),
    });
    events.push(...this.checkFaints());
    return events;
  }

  // ------------------------------------------------------------------ Abschluss

  private finish(outcome: BattleOutcome, events: BattleEvent[], text: string, moneyOverride?: number): void {
    if (this.resultValue) return;
    const money = moneyOverride ?? (outcome === 'win' ? this.calculateRewardMoney() : 0);
    this.resultValue = {
      outcome,
      moneyDelta: money,
      caughtCreature: this.caughtCreature,
      evolutionCandidates: this.evolutionCandidates,
      defeatedTrainerId: outcome === 'win' ? this.enemy.trainerId : null,
    };
    if (text) events.push({ t: 'message', text });
    if (outcome === 'win' && money > 0) {
      events.push({
        t: 'message',
        text: `Du erhaeltst ${money} Muenzen Preisgeld!`,
      });
    }
    if (outcome === 'loss' && money < 0) {
      events.push({ t: 'message', text: `Du verlierst ${Math.abs(money)} Muenzen.` });
    }
    events.push({
      t: 'battleEnd', outcome, moneyDelta: money,
      text: this.outcomeText(outcome),
    });
    this.phaseValue = 'ended';
  }

  private outcomeText(outcome: BattleOutcome): string {
    switch (outcome) {
      case 'win': return 'Kampf gewonnen!';
      case 'loss': return 'Kampf verloren...';
      case 'fled': return 'Entkommen.';
      case 'caught': return 'Fang erfolgreich!';
      case 'draw': return 'Unentschieden.';
      case 'aborted': return 'Kampf abgebrochen.';
    }
  }

  /** Setzt die Phase nach einer Runde anhand des Zustands. */
  private settlePhase(_events: BattleEvent[]): void {
    if (this.resultValue) {
      this.phaseValue = this.pendingLearns.length > 0 ? 'chooseLearnMove' : 'ended';
      return;
    }
    if (this.pendingLearns.length > 0) {
      this.phaseValue = 'chooseLearnMove';
      return;
    }
    if (this.playerActive.isFainted) {
      this.phaseValue = this.availableSwitches('player').length > 0
        ? 'chooseReplacement' : 'ended';
      return;
    }
    this.phaseValue = 'chooseAction';
  }

  /** Letzter benutzter Ball - fuer die Darstellung des Fangs. */
  get lastBall(): string | null { return this.lastBallUsed; }

  /** Aktuelle Wertstufen zur Anzeige im Kampf-HUD. */
  getStages(side: SideId): Readonly<Record<BattleStatKey, number>> {
    return this.sideOf(side).volatile.stages;
  }

  /** Effektiver Multiplikator eines Werts - fuer Debug-Anzeige. */
  getStageMultiplier(side: SideId, stat: BattleStatKey): number {
    return stageMultiplier(this.sideOf(side).volatile.stages[stat], stat);
  }

  /** Typ-Effektivitaet einer Attacke des Spielers gegen den aktuellen Gegner. */
  previewEffectiveness(moveIndex: number): { multiplier: number; label: string } {
    const move = this.playerActive.getMoveData(moveIndex);
    if (!move) return { multiplier: 1, label: 'normal' };
    const mult = GameData.effectivenessAgainst(move.type, this.enemyActive.types);
    return { multiplier: mult, label: effectivenessLabel(mult) };
  }
}
