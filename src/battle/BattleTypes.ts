import type {
  BattleStatKey, ElementType, StatusCondition, WeatherKind,
} from '@/data/schema';
import type { Creature } from '@/creatures/Creature';

export type SideId = 'player' | 'enemy';

export const BATTLE_KINDS = ['wild', 'trainer', 'gym', 'rival', 'legendary', 'raid', 'league', 'final'] as const;
export type BattleKind = (typeof BATTLE_KINDS)[number];

export type BattleOutcome = 'win' | 'loss' | 'fled' | 'caught' | 'draw' | 'aborted';

/** Was die Engine als naechstes vom Spieler braucht. */
export type BattlePhase =
  | 'notStarted'
  | 'chooseAction'
  | 'chooseReplacement'
  | 'chooseLearnMove'
  | 'ended';

export type BattleAction =
  | { kind: 'move'; moveIndex: number; gigantic?: boolean }
  | { kind: 'switch'; partyIndex: number }
  | { kind: 'item'; itemId: string; targetIndex: number; moveIndex?: number }
  | { kind: 'run' };

/** Fluechtige Zustaende der aktiven Kreatur - werden beim Wechsel geleert. */
export interface VolatileState {
  stages: Record<BattleStatKey, number>;
  confusionTurns: number;
  trapTurns: number;
  trapDamageFraction: number;
  /** Letzte Runde erfolgreich geschuetzt - senkt die Folgechance. */
  protectStreak: number;
  protectedThisTurn: boolean;
  /** Aufgeladene Attacke, die in dieser Runde ausgefuehrt wird. */
  chargingMoveIndex: number | null;
  mustRecharge: boolean;
  flinched: boolean;
  /** Gigantifizierung aktiv: verbleibende Runden. */
  giganticTurns: number;
  giganticBonusHp: number;
  /** Kreaturen, die an diesem Kampf teilgenommen haben (fuer EP-Verteilung). */
  turnsOnField: number;
  /** Erst-Runde-Marker fuer Flinkkugel und aehnliche Effekte. */
  justSwitchedIn: boolean;
}

export interface SideState {
  id: SideId;
  party: Creature[];
  activeIndex: number;
  volatile: VolatileState;
  /** Team-Schutzschilde: verbleibende Runden. */
  screens: { physical: number; special: number };
  /** Nutzbare Gegenstaende (Trainer-KI). */
  items: string[];
  trainerId: string | null;
  trainerName: string;
  canGigantic: boolean;
  giganticUsed: boolean;
  /** UIDs der Kreaturen, die seit dem letzten gegnerischen K.O. im Kampf waren. */
  participants: Set<string>;
}

export interface FieldState {
  weather: WeatherKind;
  weatherTurns: number;
  /** Vom Wetter dieses Gebiets (unbegrenzt) oder durch eine Attacke gesetzt? */
  weatherIsAmbient: boolean;
  turn: number;
}

// ---------------------------------------------------------------------------
// Kampf-Ereignisse: Das vollstaendige, abspielbare Protokoll einer Runde.
// Die Engine ist rein; die Darstellung konsumiert ausschliesslich diese Liste.
// ---------------------------------------------------------------------------

export type Effectiveness = 'immune' | 'veryWeak' | 'weak' | 'normal' | 'strong' | 'veryStrong';

export type BattleEvent =
  | { t: 'battleStart'; kind: BattleKind; enemyName: string; isTrainer: boolean }
  | { t: 'sendOut'; side: SideId; uid: string; name: string; level: number; partyIndex: number }
  | { t: 'withdraw'; side: SideId; uid: string; name: string }
  | { t: 'message'; text: string; hold?: number }
  | { t: 'useMove'; side: SideId; uid: string; moveId: string; moveName: string; gigantic: boolean }
  | { t: 'moveFailed'; side: SideId; reason: 'miss' | 'noEffect' | 'protected' | 'failed'; text: string }
  | { t: 'damage'; side: SideId; uid: string; amount: number; newHp: number; maxHp: number;
      effectiveness: Effectiveness; critical: boolean; hitIndex?: number; hitCount?: number }
  | { t: 'heal'; side: SideId; uid: string; amount: number; newHp: number; maxHp: number; source: string }
  | { t: 'statChange'; side: SideId; uid: string; stat: BattleStatKey; delta: number;
      newStage: number; text: string }
  | { t: 'statusApplied'; side: SideId; uid: string; status: StatusCondition; text: string }
  | { t: 'statusCleared'; side: SideId; uid: string; status: StatusCondition; text: string }
  | { t: 'statusDamage'; side: SideId; uid: string; status: StatusCondition; amount: number; newHp: number }
  | { t: 'confused'; side: SideId; uid: string; text: string }
  | { t: 'confusionHit'; side: SideId; uid: string; amount: number; newHp: number }
  | { t: 'flinched'; side: SideId; uid: string }
  | { t: 'weatherChange'; weather: WeatherKind; text: string }
  | { t: 'weatherDamage'; side: SideId; uid: string; amount: number; newHp: number; weather: WeatherKind }
  | { t: 'faint'; side: SideId; uid: string; name: string }
  | { t: 'gigantic'; side: SideId; uid: string; name: string; newMaxHp: number }
  | { t: 'giganticEnd'; side: SideId; uid: string; name: string }
  | { t: 'ability'; side: SideId; uid: string; abilityName: string; text: string }
  | { t: 'itemUsed'; side: SideId; itemId: string; itemName: string; targetUid: string | null; text: string }
  | { t: 'heldItem'; side: SideId; uid: string; itemId: string; text: string }
  | { t: 'captureThrow'; itemId: string; targetUid: string }
  | { t: 'captureShake'; index: number }
  | { t: 'captureResult'; success: boolean; targetUid: string; name: string }
  | { t: 'expGain'; uid: string; name: string; amount: number; newExp: number; progress: number }
  | { t: 'levelUp'; uid: string; name: string; level: number; statGains: Record<string, number> }
  | { t: 'moveLearned'; uid: string; name: string; moveId: string; moveName: string }
  | { t: 'moveLearnPrompt'; uid: string; name: string; moveId: string; moveName: string }
  | { t: 'evolutionReady'; uid: string; name: string; toSpecies: string }
  | { t: 'fleeAttempt'; success: boolean; text: string }
  | { t: 'screen'; side: SideId; kind: 'physical' | 'special'; turns: number; text: string }
  | { t: 'trapped'; side: SideId; uid: string; text: string }
  | { t: 'raidShieldBreak'; remaining: number }
  | { t: 'raidPhase'; phase: number; text: string }
  | { t: 'crowdReaction'; reaction: 'cheer' | 'gasp' | 'roar' | 'hush'; intensity: number }
  | { t: 'battleEnd'; outcome: BattleOutcome; moneyDelta: number; text: string };

export interface PendingLearn {
  uid: string;
  moveId: string;
}

export interface BattleResult {
  outcome: BattleOutcome;
  moneyDelta: number;
  caughtCreature: Creature | null;
  /** Kreaturen, die sich nach dem Kampf entwickeln koennen. */
  evolutionCandidates: { uid: string; toSpecies: string }[];
  defeatedTrainerId: string | null;
}

export interface TypeEffectInfo {
  multiplier: number;
  label: Effectiveness;
}

export function effectivenessLabel(multiplier: number): Effectiveness {
  if (multiplier === 0) return 'immune';
  if (multiplier <= 0.25) return 'veryWeak';
  if (multiplier < 1) return 'weak';
  if (multiplier === 1) return 'normal';
  if (multiplier < 4) return 'strong';
  return 'veryStrong';
}

export function createVolatile(): VolatileState {
  return {
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
    confusionTurns: 0,
    trapTurns: 0,
    trapDamageFraction: 0,
    protectStreak: 0,
    protectedThisTurn: false,
    chargingMoveIndex: null,
    mustRecharge: false,
    flinched: false,
    giganticTurns: 0,
    giganticBonusHp: 0,
    turnsOnField: 0,
    justSwitchedIn: true,
  };
}

export type ElementTypeList = readonly ElementType[];
