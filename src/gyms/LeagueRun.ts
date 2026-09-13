import { GameData } from '@/data/GameData';
import { Logger } from '@/core/Logger';
import type { LeagueData } from '@/data/schema';

const log = Logger.scope('Liga');

export type LeagueStepResult = 'weiter' | 'champion' | 'gewonnen' | 'ignoriert';

/**
 * Ablauf der Ligaherausforderung.
 *
 * Die vier Herausforderer und der Champion muessen in einer Sitzung
 * nacheinander besiegt werden. Wer die Arena verlaesst oder verliert,
 * beginnt von vorn - zwischendurch heilt niemand, es zaehlen die
 * mitgebrachten Gegenstaende.
 */
export class LeagueRun {
  private league: LeagueData | null = null;
  private index = 0;
  private running = false;

  get isRunning(): boolean { return this.running; }
  get data(): LeagueData | null { return this.league; }
  /** Gesamtzahl der Gegner. */
  get total(): number {
    return this.league ? this.league.challengers.length + 1 : 0;
  }
  /** Anzahl bereits besiegter Gegner. */
  get defeated(): number { return this.index; }

  /** Der als naechstes faellige Gegner. */
  get currentTrainerId(): string | null {
    if (!this.league || !this.running) return null;
    if (this.index < this.league.challengers.length) {
      return this.league.challengers[this.index] ?? null;
    }
    if (this.index === this.league.challengers.length) return this.league.champion;
    return null;
  }

  /** Gehoert dieser Trainer zur Liga? */
  belongsToLeague(trainerId: string): boolean {
    if (!this.league) return false;
    return this.league.challengers.includes(trainerId) || this.league.champion === trainerId;
  }

  /** Startet die Herausforderung im angegebenen Gebiet, falls vorgesehen. */
  start(areaId: string, badgeCount: number): { started: boolean; reason?: string } {
    const league = GameData.leagues.all().find((l) => l.area === areaId);
    if (!league) {
      this.abort();
      return { started: false };
    }
    if (badgeCount < league.requiredBadges) {
      this.abort();
      return {
        started: false,
        reason: `Fuer die Liga brauchst du ${league.requiredBadges} Orden.`,
      };
    }
    this.league = league;
    this.index = 0;
    this.running = true;
    log.info(`Ligaherausforderung "${league.id}" gestartet`);
    return { started: true };
  }

  /** Bricht die Herausforderung ab (Verlassen der Arena, Niederlage). */
  abort(): void {
    if (this.running) log.info('Ligaherausforderung abgebrochen');
    this.league = null;
    this.index = 0;
    this.running = false;
  }

  /**
   * Meldet den Sieg ueber einen Ligagegner.
   *
   * Gegner ausserhalb der Reihenfolge werden ignoriert, damit niemand den
   * Champion vor den Herausforderern besiegen kann.
   */
  defeat(trainerId: string): LeagueStepResult {
    if (!this.league || !this.running) return 'ignoriert';
    if (trainerId !== this.currentTrainerId) return 'ignoriert';
    this.index++;
    if (this.index > this.league.challengers.length) {
      this.running = false;
      return 'gewonnen';
    }
    return this.index === this.league.challengers.length ? 'champion' : 'weiter';
  }

  /** Text fuer einen Gegner, der noch nicht an der Reihe ist. */
  blockedText(trainerId: string): string | null {
    if (!this.league || !this.running) return null;
    const current = this.currentTrainerId;
    if (!current || trainerId === current) return null;
    const name = GameData.trainers.tryGet(current)?.name ?? current;
    return `Zuerst musst du ${name} besiegen.`;
  }
}
