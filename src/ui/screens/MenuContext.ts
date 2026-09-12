import type { PlayerState } from '@/player/PlayerState';
import type { UIManager } from '../UIManager';
import type { Settings } from '@/save/Settings';
import type { TimeManager } from '@/world/TimeManager';
import type { SlotInfo } from '@/save/SaveManager';
import type { Creature } from '@/creatures/Creature';

/**
 * Bindeglied zwischen den Menuebildschirmen und dem Spiel.
 *
 * Die Bildschirme kennen weder Renderer noch Weltzustand - alles, was sie
 * ausloesen koennen, laeuft ueber diese schmale Schnittstelle.
 */
export interface MenuContext {
  player: PlayerState;
  ui: UIManager;
  settings: Settings;
  time: TimeManager;

  /** Anzeigename eines Gebiets. */
  areaName(areaId: string): string;
  currentAreaId(): string;

  /** Wendet einen Gegenstand an; liefert die Meldung fuer die Oberflaeche. */
  useItem(itemId: string, creature: Creature | null, moveIndex?: number): string;
  /** Wirft einen Gegenstand weg. */
  tossItem(itemId: string, quantity: number): string;

  saveGame(slot: string): Promise<boolean>;
  loadGame(slot: string): Promise<boolean>;
  deleteSave(slot: string): Promise<boolean>;
  listSaves(): Promise<SlotInfo[]>;

  /** Schnellreise; liefert false, wenn das Ziel nicht erreichbar ist. */
  fastTravel(areaId: string): boolean;
  canFastTravel(): boolean;
  /** Alle per Schnellreise erreichbaren Orte. */
  travelDestinations(): { areaId: string; name: string }[];

  applySettings(): void;
  /** Entwicklung einer Kreatur ausloesen (z.B. nach Steinbenutzung). */
  startEvolution(creature: Creature, toSpecies: string): void;
  /** Attacke lehren; oeffnet bei vier Attacken eine Auswahl. */
  teachMove(creature: Creature, moveId: string, itemId: string): void;
  /** Lager/Camp oeffnen. */
  openCamp(): void;
}
