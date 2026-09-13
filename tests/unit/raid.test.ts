import { describe, expect, it, beforeAll } from 'vitest';
import { GameData } from '@/data/GameData';
import { RNG } from '@/core/RNG';
import { WeatherDirector } from '@/world/WeatherDirector';
import { BattleEngine } from '@/battle/BattleEngine';
import { CreatureFactory } from '@/creatures/CreatureFactory';
import type { AreaData, WeatherKind } from '@/data/schema';

beforeAll(() => {
  GameData.load();
});

describe('Raid-Daten', () => {
  it('enthaelt fuenf Stufen mit gueltigen Bossen und Verbuendeten', () => {
    const raids = GameData.raids.all();
    expect(raids.length).toBe(5);
    for (const raid of raids) {
      expect(raid.bosses.length).toBeGreaterThan(0);
      for (const boss of raid.bosses) {
        expect(GameData.species.has(boss.species), `Art ${boss.species}`).toBe(true);
        expect(boss.level).toBeGreaterThan(0);
      }
      expect(raid.allies.length).toBeGreaterThanOrEqual(3);
      for (const ally of raid.allies) {
        expect(GameData.trainers.has(ally), `Trainer ${ally}`).toBe(true);
      }
      for (const reward of raid.rewardItems) {
        expect(GameData.items.has(reward.item), `Gegenstand ${reward.item}`).toBe(true);
      }
      expect(raid.shieldThresholds.length).toBe(raid.tier);
      expect(raid.turnLimit).toBeGreaterThan(5);
    }
  });

  it('staerkere Stufen haben hoehere Bosslevel', () => {
    const byTier = [...GameData.raids.all()].sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < byTier.length; i++) {
      const prev = Math.max(...byTier[i - 1]!.bosses.map((b) => b.level));
      const cur = Math.max(...byTier[i]!.bosses.map((b) => b.level));
      expect(cur).toBeGreaterThan(prev);
    }
  });

  it('jedes Nest in den Gebieten verweist auf eine vorhandene Stufe', () => {
    for (const area of GameData.areas.all()) {
      for (const den of area.raidDens ?? []) {
        expect(GameData.raids.has(`raid_tier${den.tier}`), `${area.id}/${den.id}`).toBe(true);
        expect(den.pos[0]).toBeGreaterThan(0);
        expect(den.pos[0]).toBeLessThan(area.size[0]);
        expect(den.pos[1]).toBeLessThan(area.size[1]);
      }
    }
  });
});

describe('Raid-Kampf', () => {
  it('Schilde absorbieren Schaden und brechen nacheinander', () => {
    const factory = new CreatureFactory(new RNG('raid-test'));
    const raid = GameData.raids.get('raid_tier3');
    // Der Boss bekommt eine schwache Attacke, damit der Test nicht am
    // Zufall eines Volltreffers scheitert, sondern die Schilde prueft.
    const boss = factory.create(raid.bosses[0]!.species, {
      level: 40, perfectIvs: 6, moves: ['kratzer'],
    });
    const hero = factory.create('panzerwacht', { level: 90, moves: ['wurzelgriff'] });

    const engine = new BattleEngine({
      kind: 'raid',
      playerParty: [hero],
      enemyParty: [boss],
      playerName: 'Test',
      enemyName: boss.name,
      seed: 'raid-fight',
      allowFlee: false,
      raid: { shieldThresholds: raid.shieldThresholds, turnLimit: 40, allies: [] },
    });
    engine.start();
    expect(engine.isRaid).toBe(true);
    const shieldsAtStart = engine.raidShieldRemaining;
    expect(shieldsAtStart).toBe(raid.shieldThresholds.length);

    let brokeOne = false;
    for (let turn = 0; turn < 40 && engine.phase === 'chooseAction'; turn++) {
      const events = engine.submitAction({ kind: 'move', moveIndex: 0 });
      if (events.some((e) => e.t === 'raidShieldBreak')) brokeOne = true;
    }
    expect(brokeOne, 'kein Schild zerbrochen').toBe(true);
    expect(engine.raidShieldRemaining).toBeLessThan(shieldsAtStart);
  });

  it('aus einem Raid kann nicht geflohen werden', () => {
    const factory = new CreatureFactory(new RNG('raid-flee'));
    const boss = factory.create('nagezahn', { level: 30, moves: ['kratzer'] });
    const hero = factory.create('sprossling', { level: 30, moves: ['kratzer'] });
    const engine = new BattleEngine({
      kind: 'raid',
      playerParty: [hero],
      enemyParty: [boss],
      playerName: 'Test',
      enemyName: boss.name,
      seed: 'raid-flee',
      raid: { shieldThresholds: [0.5], turnLimit: 10, allies: [] },
    });
    engine.start();
    expect(engine.canFlee()).toBe(false);
    expect(engine.canCapture()).toBe(true);
  });
});

describe('Wetterwechsel', () => {
  function area(weather: WeatherKind[]): AreaData {
    return { ...GameData.areas.get('route_1'), weather, indoor: false } as AreaData;
  }

  it('waehlt nur erlaubte Wetterarten und wechselt ueber die Zeit', () => {
    const director = new WeatherDirector(new RNG('wetter'));
    const allowed: WeatherKind[] = ['clear', 'rain', 'fog'];
    const start = director.enterArea(area(allowed));
    expect(allowed).toContain(start);

    const seen = new Set<WeatherKind>([start]);
    for (let i = 0; i < 400; i++) {
      const change = director.update(5);
      if (change) {
        expect(allowed).toContain(change.weather);
        expect(change.text.length).toBeGreaterThan(5);
        seen.add(change.weather);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('wechselt nie direkt auf dasselbe Wetter', () => {
    const director = new WeatherDirector(new RNG('wetter2'));
    director.enterArea(area(['clear', 'rain']));
    let previous = director.weather;
    for (let i = 0; i < 200; i++) {
      const change = director.update(5);
      if (!change) continue;
      expect(change.weather).not.toBe(previous);
      previous = change.weather;
    }
  });

  it('haelt Innenraeume wetterfrei', () => {
    const director = new WeatherDirector(new RNG('wetter3'));
    const indoor = { ...GameData.areas.get('route_1'), indoor: true, weather: ['rain'] } as AreaData;
    expect(director.enterArea(indoor)).toBe('clear');
    for (let i = 0; i < 100; i++) expect(director.update(10)).toBeNull();
  });
});
