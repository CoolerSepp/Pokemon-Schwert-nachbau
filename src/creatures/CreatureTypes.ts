import type { ElementType, StatBlock, StatusCondition } from '@/data/schema';

export type Gender = 'male' | 'female' | 'none';
export type SizeVariant = 'small' | 'normal' | 'large';

export interface MoveSlot {
  moveId: string;
  pp: number;
  maxPp: number;
}

/**
 * Serialisierbarer Zustand einer Kreatur.
 *
 * Bewusst ein reines Datenobjekt (keine Methoden, keine Verweise auf
 * Engine-Objekte), damit Speichern/Laden trivial und verlustfrei ist.
 */
export interface CreatureState {
  uid: string;
  speciesId: string;
  nickname: string | null;
  level: number;
  exp: number;
  ivs: StatBlock;
  evs: StatBlock;
  natureId: string;
  abilityId: string;
  gender: Gender;
  moves: MoveSlot[];
  currentHp: number;
  status: StatusCondition;
  /** Restliche Runden fuer Schlaf; Zaehler fuer Schwere Vergiftung. */
  statusCounter: number;
  friendship: number;
  heldItem: string | null;
  originalTrainer: string;
  caughtBall: string;
  caughtArea: string;
  caughtLevel: number;
  /** Besondere Farbvariante (selten). */
  variant: boolean;
  sizeVariant: SizeVariant;
  /** Kann diese Kreatur gigantifizieren (individuell, nicht nur artabhaengig)? */
  giganticFactor: boolean;
  /** Anzahl der Kaempfe, die diese Kreatur bestritten hat. */
  battleCount: number;
}

export interface EffectiveStats extends StatBlock {
  types: ElementType[];
}
