import { describe, expect, it, beforeAll } from 'vitest';
import { GameData } from '@/data/GameData';
import { LeagueRun } from '@/gyms/LeagueRun';

beforeAll(() => {
  GameData.load();
});

describe('Liga-Daten', () => {
  it('verweist auf vorhandene Trainer, Gebiete und Zwischensequenzen', () => {
    const leagues = GameData.leagues.all();
    expect(leagues.length).toBeGreaterThan(0);
    for (const league of leagues) {
      expect(GameData.areas.has(league.area), `Gebiet ${league.area}`).toBe(true);
      expect(GameData.cutscenes.has(league.victoryCutscene)).toBe(true);
      expect(league.challengers.length).toBeGreaterThanOrEqual(4);
      for (const id of [...league.challengers, league.champion]) {
        expect(GameData.trainers.has(id), `Trainer ${id}`).toBe(true);
      }
      // Alle Ligagegner muessen auch im Gebiet stehen.
      const area = GameData.areas.get(league.area);
      const placed = new Set((area.npcs ?? []).map((n) => n.trainer));
      for (const id of [...league.challengers, league.champion]) {
        expect(placed.has(id), `${id} steht nicht in ${league.area}`).toBe(true);
      }
    }
  });

  it('steigert die Level von den Herausforderern zum Champion', () => {
    const league = GameData.leagues.all()[0]!;
    const maxLevel = (id: string) =>
      Math.max(...GameData.trainers.get(id).team.map((m) => m.level));
    const championLevel = maxLevel(league.champion);
    for (const id of league.challengers) {
      expect(championLevel).toBeGreaterThan(maxLevel(id));
    }
  });
});

describe('Ligaherausforderung', () => {
  function started(): LeagueRun {
    const league = GameData.leagues.all()[0]!;
    const run = new LeagueRun();
    expect(run.start(league.area, league.requiredBadges).started).toBe(true);
    return run;
  }

  it('verlangt die volle Ordenszahl', () => {
    const league = GameData.leagues.all()[0]!;
    const run = new LeagueRun();
    const result = run.start(league.area, league.requiredBadges - 1);
    expect(result.started).toBe(false);
    expect(result.reason).toContain(String(league.requiredBadges));
    expect(run.isRunning).toBe(false);
    expect(run.currentTrainerId).toBeNull();
  });

  it('startet nur im Ligagebiet', () => {
    const run = new LeagueRun();
    expect(run.start('route_1', 8).started).toBe(false);
  });

  it('erzwingt die Reihenfolge der Gegner', () => {
    const run = started();
    const league = GameData.leagues.all()[0]!;
    expect(run.currentTrainerId).toBe(league.challengers[0]);

    // Der Champion laesst sich nicht vorziehen.
    expect(run.defeat(league.champion)).toBe('ignoriert');
    expect(run.blockedText(league.champion)).toContain(
      GameData.trainers.get(league.challengers[0]!).name,
    );
    expect(run.defeated).toBe(0);

    for (let i = 0; i < league.challengers.length; i++) {
      const expected = i === league.challengers.length - 1 ? 'champion' : 'weiter';
      expect(run.defeat(league.challengers[i]!)).toBe(expected);
    }
    expect(run.currentTrainerId).toBe(league.champion);
    expect(run.defeat(league.champion)).toBe('gewonnen');
    expect(run.isRunning).toBe(false);
    expect(run.defeated).toBe(run.total);
  });

  it('setzt den Lauf beim Abbruch zurueck', () => {
    const run = started();
    const league = GameData.leagues.all()[0]!;
    run.defeat(league.challengers[0]!);
    expect(run.defeated).toBe(1);
    run.abort();
    expect(run.isRunning).toBe(false);
    expect(run.currentTrainerId).toBeNull();
    run.start(league.area, league.requiredBadges);
    expect(run.defeated).toBe(0);
    expect(run.currentTrainerId).toBe(league.challengers[0]);
  });
});

describe('Ligazugang', () => {
  it('ist im Stadion an acht Orden gebunden', () => {
    const stadion = GameData.areas.get('ligastadion');
    const door = (stadion.buildings ?? []).find((b) => b.interior === 'liga_arena');
    expect(door, 'Kein Eingang zur Ligaarena').toBeTruthy();
    expect(door!.requires?.badge).toBe(8);
    expect(door!.blockedText?.length ?? 0).toBeGreaterThan(10);
  });
});
