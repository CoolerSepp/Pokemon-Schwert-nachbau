import { describe, expect, it, beforeAll } from 'vitest';
import { GameData } from '@/data/GameData';
import { ELEMENT_TYPES, STAT_KEYS } from '@/data/schema';

beforeAll(() => GameData.load());

describe('Inhalts-Registry', () => {
  it('laedt alle Datenverzeichnisse', () => {
    expect(GameData.species.size).toBeGreaterThan(50);
    expect(GameData.moves.size).toBeGreaterThan(100);
    expect(GameData.items.size).toBeGreaterThan(80);
    expect(GameData.abilities.size).toBeGreaterThan(20);
    expect(GameData.natures.size).toBe(25);
  });

  it('vergibt fortlaufende, eindeutige Index-Nummern', () => {
    const dex = GameData.getDexOrder();
    const seen = new Set<number>();
    for (const s of dex) {
      expect(seen.has(s.dex)).toBe(false);
      seen.add(s.dex);
    }
    expect(dex[0]!.dex).toBe(1);
  });

  it('haelt saemtliche Attackenverweise gueltig', () => {
    for (const s of GameData.species.all()) {
      for (const entry of s.learnset) {
        expect(GameData.moves.has(entry.move), `${s.id} -> ${entry.move}`).toBe(true);
        expect(entry.level).toBeGreaterThanOrEqual(1);
      }
      for (const m of s.tmMoves ?? []) {
        expect(GameData.moves.has(m), `${s.id} TM -> ${m}`).toBe(true);
      }
      if (s.giganticMove) expect(GameData.moves.has(s.giganticMove)).toBe(true);
    }
  });

  it('haelt Faehigkeits- und Entwicklungsverweise gueltig', () => {
    for (const s of GameData.species.all()) {
      expect(s.abilities.length).toBeGreaterThan(0);
      for (const a of s.abilities) expect(GameData.abilities.has(a), `${s.id} -> ${a}`).toBe(true);
      if (s.hiddenAbility) expect(GameData.abilities.has(s.hiddenAbility)).toBe(true);
      for (const evo of s.evolutions) {
        expect(GameData.species.has(evo.to), `${s.id} -> ${evo.to}`).toBe(true);
        if (evo.method.kind === 'item') {
          expect(GameData.items.has(evo.method.item), `${s.id} Item`).toBe(true);
        }
      }
    }
  });

  it('definiert vollstaendige Basiswerte und gueltige Typen', () => {
    for (const s of GameData.species.all()) {
      for (const k of STAT_KEYS) {
        expect(typeof s.baseStats[k], `${s.id}.${k}`).toBe('number');
        expect(s.baseStats[k]).toBeGreaterThan(0);
      }
      expect(s.types.length).toBeGreaterThanOrEqual(1);
      expect(s.types.length).toBeLessThanOrEqual(2);
      for (const t of s.types) expect(ELEMENT_TYPES).toContain(t);
      expect(s.captureRate).toBeGreaterThan(0);
      expect(s.model.parts.length).toBeGreaterThan(2);
    }
  });

  it('liefert eine vollstaendige und plausible Typentabelle', () => {
    for (const a of ELEMENT_TYPES) {
      for (const d of ELEMENT_TYPES) {
        const v = GameData.effectiveness(a, d);
        expect([0, 0.5, 1, 2]).toContain(v);
      }
    }
    // Stichproben gegen bekannte Beziehungen
    expect(GameData.effectiveness('fire', 'grass')).toBe(2);
    expect(GameData.effectiveness('water', 'fire')).toBe(2);
    expect(GameData.effectiveness('electric', 'ground')).toBe(0);
    expect(GameData.effectiveness('normal', 'ghost')).toBe(0);
    expect(GameData.effectivenessAgainst('electric', ['water', 'flying'])).toBe(4);
    expect(GameData.effectivenessAgainst('grass', ['fire', 'flying'])).toBe(0.25);
  });

  it('haelt Modell-Farbschluessel gegen die Palette gueltig', () => {
    for (const s of GameData.species.all()) {
      for (const part of s.model.parts) {
        if (part.color.startsWith('#')) continue;
        expect(s.model.palette[part.color], `${s.id}/${part.role}`).toBeDefined();
      }
    }
  });

  it('haelt Gegenstands-Verweise auf Attacken gueltig', () => {
    for (const item of GameData.items.all()) {
      if (item.teachesMove) expect(GameData.moves.has(item.teachesMove)).toBe(true);
    }
  });
});
