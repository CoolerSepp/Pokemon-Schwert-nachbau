import { describe, expect, it, beforeAll } from 'vitest';
import { GameData } from '@/data/GameData';
import { CreatureFactory } from '@/creatures/CreatureFactory';
import { calcHp, calcStat, stageMultiplier, clampEvs } from '@/creatures/StatCalc';
import { expForLevel, levelForExp, expGain, levelProgress } from '@/creatures/Experience';
import { checkEvolution, evolutionLine, describeEvolution } from '@/creatures/Evolution';
import { RNG } from '@/core/RNG';
import { emptyStats } from '@/creatures/StatCalc';

beforeAll(() => GameData.load());

const factory = new CreatureFactory(new RNG('test-creatures'));

describe('Werteberechnung', () => {
  it('berechnet KP nach der dokumentierten Formel', () => {
    // base 100, IV 31, EV 0, Level 50 -> floor((2*100+31)*50/100)+50+10 = 175
    expect(calcHp(100, 31, 0, 50)).toBe(175);
    expect(calcHp(100, 31, 252, 50)).toBe(207);
    expect(calcHp(45, 0, 0, 5)).toBe(19);
  });

  it('berechnet Nicht-KP-Werte inklusive Naturmodifikator', () => {
    expect(calcStat(100, 31, 0, 50, 1)).toBe(120);
    expect(calcStat(100, 31, 0, 50, 1.1)).toBe(132);
    expect(calcStat(100, 31, 0, 50, 0.9)).toBe(108);
  });

  it('liefert korrekte Stufenmultiplikatoren', () => {
    expect(stageMultiplier(0, 'atk')).toBe(1);
    expect(stageMultiplier(2, 'atk')).toBe(2);
    expect(stageMultiplier(6, 'atk')).toBe(4);
    expect(stageMultiplier(-2, 'atk')).toBe(0.5);
    expect(stageMultiplier(-6, 'atk')).toBe(0.25);
    expect(stageMultiplier(1, 'accuracy')).toBeCloseTo(4 / 3);
    // Werte ausserhalb des Bereichs werden begrenzt
    expect(stageMultiplier(99, 'atk')).toBe(4);
  });

  it('begrenzt EVs auf Einzel- und Gesamtmaximum', () => {
    const evs = clampEvs({ hp: 400, atk: 300, def: 200, spa: 200, spd: 200, spe: 200 });
    expect(evs.hp).toBeLessThanOrEqual(252);
    expect(evs.atk).toBeLessThanOrEqual(252);
    const total = Object.values(evs).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(510);
  });
});

describe('Erfahrungskurven', () => {
  it('ist fuer jede Kurve monoton steigend', () => {
    for (const rate of ['erratic', 'fast', 'mediumFast', 'mediumSlow', 'slow', 'fluctuating'] as const) {
      let prev = -1;
      for (let lvl = 1; lvl <= 100; lvl++) {
        const v = expForLevel(rate, lvl);
        expect(v, `${rate} @ ${lvl}`).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
      expect(expForLevel(rate, 1)).toBe(0);
      expect(expForLevel(rate, 100)).toBeGreaterThan(500000);
    }
  });

  it('bildet Level und Erfahrung konsistent aufeinander ab', () => {
    for (const rate of ['fast', 'mediumFast', 'mediumSlow', 'slow'] as const) {
      for (let lvl = 1; lvl <= 100; lvl++) {
        expect(levelForExp(rate, expForLevel(rate, lvl))).toBe(lvl);
      }
    }
  });

  it('meldet den Fortschritt zwischen zwei Leveln', () => {
    const at10 = expForLevel('mediumFast', 10);
    const at11 = expForLevel('mediumFast', 11);
    expect(levelProgress('mediumFast', 10, at10)).toBeCloseTo(0);
    expect(levelProgress('mediumFast', 10, Math.floor((at10 + at11) / 2))).toBeCloseTo(0.5, 1);
    expect(levelProgress('mediumFast', 100, 999999999)).toBe(1);
  });

  it('gibt mehr Erfahrung fuer staerkere und fuer Trainer-Gegner', () => {
    const wild = expGain({
      defeatedBaseExp: 100, defeatedLevel: 20, winnerLevel: 20,
      isTrainerBattle: false, participants: 1, expShare: false,
    });
    const trainer = expGain({
      defeatedBaseExp: 100, defeatedLevel: 20, winnerLevel: 20,
      isTrainerBattle: true, participants: 1, expShare: false,
    });
    const stronger = expGain({
      defeatedBaseExp: 100, defeatedLevel: 40, winnerLevel: 20,
      isTrainerBattle: false, participants: 1, expShare: false,
    });
    const shared = expGain({
      defeatedBaseExp: 100, defeatedLevel: 20, winnerLevel: 20,
      isTrainerBattle: false, participants: 3, expShare: false,
    });
    expect(trainer).toBeGreaterThan(wild);
    expect(stronger).toBeGreaterThan(wild);
    expect(shared).toBeLessThan(wild);
    expect(wild).toBeGreaterThan(0);
  });
});

describe('Kreatur-Erzeugung', () => {
  it('erzeugt eine vollstaendig einsatzfaehige Kreatur', () => {
    const c = factory.create('sprossling', { level: 12 });
    expect(c.level).toBe(12);
    expect(c.currentHp).toBe(c.maxHp);
    expect(c.maxHp).toBeGreaterThan(10);
    expect(c.moves.length).toBeGreaterThan(0);
    expect(c.moves.length).toBeLessThanOrEqual(4);
    for (const m of c.moves) {
      expect(GameData.moves.has(m.moveId)).toBe(true);
      expect(m.pp).toBe(m.maxPp);
    }
    expect(c.status).toBe('none');
    expect(c.isFainted).toBe(false);
  });

  it('vergibt niemals mehr als vier Attacken', () => {
    for (const species of GameData.species.all()) {
      const c = factory.create(species.id, { level: 100 });
      expect(c.moves.length, species.id).toBeLessThanOrEqual(4);
      expect(c.moves.length, species.id).toBeGreaterThan(0);
    }
  });

  it('respektiert vorgegebene Werte', () => {
    const c = factory.create('glutkitz', {
      level: 25, natureId: 'atk_spa', ivs: emptyStats(31),
      moves: ['funkenflug', 'rempler'], heldItem: 'holzkohle', nickname: 'Kitz',
    });
    expect(c.name).toBe('Kitz');
    expect(c.heldItem).toBe('holzkohle');
    expect(c.moves.map((m) => m.moveId)).toEqual(['funkenflug', 'rempler']);
    expect(c.natureLabel('atk')).toBe('up');
    expect(c.natureLabel('spa')).toBe('down');
  });

  it('verteilt Erfahrung und steigt korrekt auf', () => {
    const c = factory.create('nagezahn', { level: 5 });
    const hpBefore = c.maxHp;
    const levels = c.addExp(expForLevel('mediumFast', 12) - c.exp);
    expect(c.level).toBe(12);
    expect(levels).toEqual([6, 7, 8, 9, 10, 11, 12]);
    expect(c.maxHp).toBeGreaterThan(hpBefore);
    expect(c.currentHp).toBe(c.maxHp);
  });

  it('haelt KP-Anteil bei einer Entwicklung', () => {
    const c = factory.create('sprossling', { level: 16 });
    c.applyHpDelta(-Math.floor(c.maxHp / 2));
    const fractionBefore = c.hpFraction;
    c.evolveInto('blattbock');
    expect(c.speciesId).toBe('blattbock');
    expect(c.hpFraction).toBeCloseTo(fractionBefore, 1);
    expect(c.maxHp).toBeGreaterThan(0);
  });
});

describe('Entwicklungsbedingungen', () => {
  it('erkennt Level-Entwicklungen', () => {
    const low = factory.create('sprossling', { level: 15 });
    const high = factory.create('sprossling', { level: 16 });
    expect(checkEvolution(low, { timeOfDay: 'day', areaId: '' })).toBeNull();
    expect(checkEvolution(high, { timeOfDay: 'day', areaId: '' })).toBe('blattbock');
  });

  it('beachtet Tageszeit-Entwicklungen', () => {
    const c = factory.create('nachtschleier', { level: 40 });
    expect(checkEvolution(c, { timeOfDay: 'day', areaId: '' })).toBeNull();
    expect(checkEvolution(c, { timeOfDay: 'night', areaId: '' })).toBe('geisterfuerst');
  });

  it('beachtet Zuneigungs-Entwicklungen', () => {
    const c = factory.create('feenfunke', { level: 20, friendship: 100 });
    expect(checkEvolution(c, { timeOfDay: 'day', areaId: '' })).toBeNull();
    c.addFriendship(200);
    expect(checkEvolution(c, { timeOfDay: 'day', areaId: '' })).toBe('lichtfee');
  });

  it('liefert vollstaendige Entwicklungsreihen', () => {
    expect(evolutionLine('blattbock')).toEqual(['sprossling', 'blattbock', 'forstwaechter']);
    expect(evolutionLine('forstwaechter')).toEqual(['sprossling', 'blattbock', 'forstwaechter']);
    expect(evolutionLine('schneehase')).toEqual(['schneehase']);
  });

  it('beschreibt jede Entwicklungsbedingung lesbar', () => {
    for (const s of GameData.species.all()) {
      for (const evo of s.evolutions) {
        const text = describeEvolution(evo);
        expect(text.length).toBeGreaterThan(5);
        expect(text).not.toContain('undefined');
      }
    }
  });
});
