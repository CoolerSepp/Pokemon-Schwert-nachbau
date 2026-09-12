import { GameData } from '@/data/GameData';
import type { EvolutionEntry, TimeOfDay } from '@/data/schema';
import type { Creature } from './Creature';

export interface EvolutionContext {
  timeOfDay: TimeOfDay;
  areaId: string;
  /** Gesetzt, wenn die Pruefung durch Benutzung eines Gegenstands ausgeloest wurde. */
  usedItem?: string;
  /** Wurde die Kreatur getauscht? */
  traded?: boolean;
  /** Hat die Kreatur im letzten Kampf gigantifiziert? */
  gigantified?: boolean;
}

const DAY_TIMES: TimeOfDay[] = ['dawn', 'day'];
const NIGHT_TIMES: TimeOfDay[] = ['dusk', 'night'];

/**
 * Prueft alle Entwicklungsbedingungen einer Kreatur.
 * Liefert die Ziel-Art oder null.
 */
export function checkEvolution(creature: Creature, ctx: EvolutionContext): string | null {
  const species = creature.species;
  for (const evo of species.evolutions) {
    if (matches(evo, creature, ctx)) return evo.to;
  }
  return null;
}

function matches(evo: EvolutionEntry, creature: Creature, ctx: EvolutionContext): boolean {
  const m = evo.method;
  switch (m.kind) {
    case 'level':
      return creature.level >= m.level;
    case 'levelDay':
      return creature.level >= m.level && DAY_TIMES.includes(ctx.timeOfDay);
    case 'levelNight':
      return creature.level >= m.level && NIGHT_TIMES.includes(ctx.timeOfDay);
    case 'item':
      return ctx.usedItem === m.item;
    case 'friendship':
      return creature.friendship >= m.min;
    case 'friendshipDay':
      return creature.friendship >= m.min && DAY_TIMES.includes(ctx.timeOfDay);
    case 'friendshipNight':
      return creature.friendship >= m.min && NIGHT_TIMES.includes(ctx.timeOfDay);
    case 'area':
      return creature.level >= m.level && ctx.areaId === m.area;
    case 'knowsMove':
      return creature.knowsMove(m.move);
    case 'stat': {
      if (creature.level < m.level) return false;
      const s = creature.stats;
      if (m.compare === 'atkGtDef') return s.atk > s.def;
      if (m.compare === 'defGtAtk') return s.def > s.atk;
      return s.atk === s.def;
    }
    case 'trade':
      return ctx.traded === true;
    case 'gigantic':
      return creature.level >= m.level && ctx.gigantified === true;
  }
}

/** Alle Arten einer Entwicklungsreihe, von der Basisform aufwaerts. */
export function evolutionLine(speciesId: string): string[] {
  let rootId = speciesId;
  for (let guard = 0; guard < 10; guard++) {
    const prevo = GameData.species.tryGet(rootId)?.prevo;
    if (!prevo) break;
    rootId = prevo;
  }
  const line: string[] = [];
  const walk = (id: string) => {
    if (line.includes(id)) return;
    line.push(id);
    const s = GameData.species.tryGet(id);
    if (!s) return;
    for (const evo of s.evolutions) walk(evo.to);
  };
  walk(rootId);
  return line;
}

/** Menschenlesbare Beschreibung einer Entwicklungsbedingung. */
export function describeEvolution(evo: EvolutionEntry): string {
  const m = evo.method;
  const target = GameData.species.tryGet(evo.to)?.name ?? evo.to;
  switch (m.kind) {
    case 'level': return `ab Level ${m.level} zu ${target}`;
    case 'levelDay': return `ab Level ${m.level} bei Tag zu ${target}`;
    case 'levelNight': return `ab Level ${m.level} bei Nacht zu ${target}`;
    case 'item': return `mit ${GameData.items.tryGet(m.item)?.name ?? m.item} zu ${target}`;
    case 'friendship': return `bei hoher Zuneigung zu ${target}`;
    case 'friendshipDay': return `bei hoher Zuneigung am Tag zu ${target}`;
    case 'friendshipNight': return `bei hoher Zuneigung in der Nacht zu ${target}`;
    case 'area': return `ab Level ${m.level} in einem besonderen Gebiet zu ${target}`;
    case 'knowsMove': return `wenn ${GameData.moves.tryGet(m.move)?.name ?? m.move} bekannt ist, zu ${target}`;
    case 'stat': return `ab Level ${m.level} je nach Werteverhaeltnis zu ${target}`;
    case 'trade': return `durch Tausch zu ${target}`;
    case 'gigantic': return `ab Level ${m.level} nach einer Gigantifizierung zu ${target}`;
  }
}
