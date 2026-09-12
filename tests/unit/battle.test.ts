import { describe, expect, it, beforeAll } from 'vitest';
import { GameData } from '@/data/GameData';
import { CreatureFactory } from '@/creatures/CreatureFactory';
import { emptyStats } from '@/creatures/StatCalc';
import { RNG } from '@/core/RNG';
import { calculateDamage, accuracyChance, weatherDamageMultiplier } from '@/battle/DamageCalc';
import { attemptCapture, fleeChance, ballMultiplier } from '@/battle/Capture';
import { createVolatile, type SideState } from '@/battle/BattleTypes';
import type { Creature } from '@/creatures/Creature';

beforeAll(() => GameData.load());

const factory = new CreatureFactory(new RNG('battle-tests'));

function make(species: string, level: number, extra: Parameters<typeof factory.create>[1] = { level }) {
  return factory.create(species, { ...extra, level });
}

function side(id: 'player' | 'enemy', party: Creature[]): SideState {
  return {
    id, party, activeIndex: 0, volatile: createVolatile(),
    screens: { physical: 0, special: 0 }, items: [],
    trainerId: null, trainerName: 'Test', canGigantic: false,
    giganticUsed: false, participants: new Set<string>(),
  };
}

describe('Schadensberechnung', () => {
  it('wendet die Typentabelle korrekt an', () => {
    const attacker = make('glutkitz', 50, { level: 50, ivs: emptyStats(31), moves: ['glutwelle'] });
    const grassTarget = make('sprossling', 50, { level: 50, ivs: emptyStats(31) });
    const waterTarget = make('tropfling', 50, { level: 50, ivs: emptyStats(31) });
    const move = GameData.moves.get('glutwelle');
    const rng = new RNG('dmg');

    const vsGrass = calculateDamage({
      attacker, defender: grassTarget,
      attackerSide: side('player', [attacker]), defenderSide: side('enemy', [grassTarget]),
      move, weather: 'clear', rng, forceCritical: false, forceRandom: 1,
    });
    const vsWater = calculateDamage({
      attacker, defender: waterTarget,
      attackerSide: side('player', [attacker]), defenderSide: side('enemy', [waterTarget]),
      move, weather: 'clear', rng, forceCritical: false, forceRandom: 1,
    });
    expect(vsGrass.effectiveness).toBe(2);
    expect(vsGrass.effectivenessLabel).toBe('strong');
    expect(vsWater.effectiveness).toBe(0.5);
    expect(vsGrass.damage).toBeGreaterThan(vsWater.damage * 2);
    expect(vsGrass.stab).toBe(true);
  });

  it('meldet Immunitaet als Null-Schaden', () => {
    const attacker = make('nagezahn', 50, { level: 50, moves: ['rempler'] });
    const ghost = make('nachtschleier', 50, { level: 50 });
    const result = calculateDamage({
      attacker, defender: ghost,
      attackerSide: side('player', [attacker]), defenderSide: side('enemy', [ghost]),
      move: GameData.moves.get('rempler'), weather: 'clear', rng: new RNG('x'),
      forceCritical: false, forceRandom: 1,
    });
    expect(result.effectiveness).toBe(0);
    expect(result.damage).toBe(0);
    expect(result.effectivenessLabel).toBe('immune');
  });

  it('erhoeht den Schaden bei Volltreffern', () => {
    const a = make('nagezahn', 50, { level: 50, ivs: emptyStats(31), moves: ['rempler'] });
    const d = make('nagezahn', 50, { level: 50, ivs: emptyStats(31) });
    const args = {
      attacker: a, defender: d,
      attackerSide: side('player', [a]), defenderSide: side('enemy', [d]),
      move: GameData.moves.get('rempler'), weather: 'clear' as const,
      rng: new RNG('c'), forceRandom: 1,
    };
    const normal = calculateDamage({ ...args, forceCritical: false });
    const crit = calculateDamage({ ...args, forceCritical: true });
    expect(crit.damage).toBeGreaterThan(normal.damage);
    expect(crit.critical).toBe(true);
  });

  it('halbiert physischen Schaden bei Verbrennung', () => {
    const a = make('nagezahn', 50, { level: 50, ivs: emptyStats(31), moves: ['rempler'] });
    const d = make('nagezahn', 50, { level: 50, ivs: emptyStats(31) });
    const args = {
      attacker: a, defender: d,
      attackerSide: side('player', [a]), defenderSide: side('enemy', [d]),
      move: GameData.moves.get('rempler'), weather: 'clear' as const,
      rng: new RNG('b'), forceCritical: false, forceRandom: 1,
    };
    const healthy = calculateDamage(args);
    a.setStatus('burn');
    const burned = calculateDamage(args);
    expect(burned.damage).toBeLessThan(healthy.damage);
    expect(burned.damage).toBeGreaterThan(healthy.damage * 0.4);
  });

  it('beruecksichtigt Wetter beim Schaden', () => {
    expect(weatherDamageMultiplier('water', 'rain')).toBe(1.5);
    expect(weatherDamageMultiplier('fire', 'rain')).toBe(0.5);
    expect(weatherDamageMultiplier('fire', 'harshSun')).toBe(1.5);
    expect(weatherDamageMultiplier('normal', 'clear')).toBe(1);
    expect(weatherDamageMultiplier('fire', 'heavyRain')).toBe(0.25);
  });

  it('skaliert Treffergenauigkeit mit Wertstufen', () => {
    const a = make('nagezahn', 20, { level: 20, moves: ['steinwurf'] });
    const playerSide = side('player', [a]);
    const enemySide = side('enemy', [a]);
    const move = GameData.moves.get('steinwurf'); // 90 % Genauigkeit
    const base = accuracyChance({ move, attacker: a, attackerSide: playerSide, defenderSide: enemySide, weather: 'clear' });
    expect(base).toBeCloseTo(0.9, 5);

    enemySide.volatile.stages.evasion = 2;
    const evasive = accuracyChance({ move, attacker: a, attackerSide: playerSide, defenderSide: enemySide, weather: 'clear' });
    expect(evasive).toBeLessThan(base);

    const perfect = GameData.moves.get('windschritt'); // Genauigkeit 0 = trifft immer
    expect(accuracyChance({ move: perfect, attacker: a, attackerSide: playerSide, defenderSide: enemySide, weather: 'clear' })).toBe(1);
  });

  it('macht Blitzattacken bei Regen unfehlbar', () => {
    const a = make('funkenfell', 40, { level: 40, moves: ['donnerkeil'] });
    const s = side('player', [a]);
    const move = GameData.moves.get('donnerkeil');
    expect(accuracyChance({ move, attacker: a, attackerSide: s, defenderSide: side('enemy', [a]), weather: 'clear' })).toBeLessThan(1);
    expect(accuracyChance({ move, attacker: a, attackerSide: s, defenderSide: side('enemy', [a]), weather: 'rain' })).toBe(1);
  });
});

describe('Fang- und Fluchtberechnung', () => {
  it('faengt leichter bei niedrigen KP', () => {
    const target = make('nagezahn', 5, { level: 5 });
    const rng = new RNG('capture');
    let fullHpSuccess = 0;
    let lowHpSuccess = 0;
    for (let i = 0; i < 400; i++) {
      target.state.currentHp = target.maxHp;
      if (attemptCapture({ target, ballId: 'fangkugel', turn: 1, timeOfDay: 'day', inCave: false, isFirstTurn: true, rng }).success) fullHpSuccess++;
      target.state.currentHp = 1;
      if (attemptCapture({ target, ballId: 'fangkugel', turn: 1, timeOfDay: 'day', inCave: false, isFirstTurn: true, rng }).success) lowHpSuccess++;
    }
    expect(lowHpSuccess).toBeGreaterThan(fullHpSuccess);
    expect(fullHpSuccess).toBeGreaterThan(0);
  });

  it('faengt mit der Meisterkugel immer', () => {
    const target = make('aetherion', 70, { level: 70 });
    const rng = new RNG('master');
    for (let i = 0; i < 20; i++) {
      expect(attemptCapture({ target, ballId: 'meisterkugel', turn: 1, timeOfDay: 'day', inCave: false, isFirstTurn: true, rng }).success).toBe(true);
    }
  });

  it('erhoeht Fangchancen durch Statusprobleme', () => {
    const target = make('sprossling', 20, { level: 20 }); // Fangrate 45
    const rng = new RNG('status-capture');
    const count = (status: 'none' | 'sleep') => {
      let n = 0;
      for (let i = 0; i < 400; i++) {
        target.state.currentHp = Math.ceil(target.maxHp / 2);
        target.setStatus(status === 'sleep' ? 'sleep' : 'none', 3);
        if (attemptCapture({ target, ballId: 'fangkugel', turn: 1, timeOfDay: 'day', inCave: false, isFirstTurn: true, rng }).success) n++;
      }
      return n;
    };
    expect(count('sleep')).toBeGreaterThan(count('none'));
  });

  it('wendet Spezialbaelle situationsabhaengig an', () => {
    const water = make('tropfling', 10, { level: 10 });
    const fire = make('glutkitz', 10, { level: 10 });
    const rng = new RNG('ball');
    const base = { turn: 1, timeOfDay: 'day' as const, inCave: false, isFirstTurn: true, rng };
    expect(ballMultiplier({ ...base, target: water, ballId: 'netzkugel' })).toBe(3.5);
    expect(ballMultiplier({ ...base, target: fire, ballId: 'netzkugel' })).toBe(1);
    expect(ballMultiplier({ ...base, target: fire, ballId: 'nachtkugel', inCave: true })).toBe(3);
    expect(ballMultiplier({ ...base, target: fire, ballId: 'flinkkugel' })).toBe(4);
    expect(ballMultiplier({ ...base, target: fire, ballId: 'flinkkugel', isFirstTurn: false })).toBe(1);
  });

  it('garantiert Flucht bei hoeherer Initiative', () => {
    expect(fleeChance(100, 50, 1)).toBe(1);
    expect(fleeChance(50, 100, 1)).toBeLessThan(1);
    expect(fleeChance(50, 100, 5)).toBeGreaterThan(fleeChance(50, 100, 1));
  });
});
