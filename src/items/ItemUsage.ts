import { GameData } from '@/data/GameData';
import type { ItemData, StatusCondition, TimeOfDay } from '@/data/schema';
import type { Creature } from '@/creatures/Creature';
import type { PlayerState } from '@/player/PlayerState';
import { checkEvolution } from '@/creatures/Evolution';

export interface ItemUseResult {
  success: boolean;
  message: string;
  /** Die Kreatur kann sich durch den Gegenstand entwickeln. */
  evolveTo?: string;
  /** Der Gegenstand wurde verbraucht. */
  consumed: boolean;
  /** Eine Attacke soll gelehrt werden (Attacken-Disk). */
  teachMove?: string;
}

const ALL_STATUS: StatusCondition[] = ['burn', 'freeze', 'paralysis', 'poison', 'toxic', 'sleep'];

/**
 * Wendet einen Gegenstand ausserhalb des Kampfes an.
 *
 * Liefert immer eine aussagekraeftige Rueckmeldung - auch im Fehlerfall,
 * damit die Oberflaeche nie stumm bleibt.
 */
export function useItemOnCreature(
  player: PlayerState, itemId: string, creature: Creature, options: {
    timeOfDay: TimeOfDay; areaId: string; moveIndex?: number;
  },
): ItemUseResult {
  const item = GameData.items.tryGet(itemId);
  if (!item) return fail('Dieser Gegenstand existiert nicht.');
  if (!player.hasItem(itemId)) return fail(`Du hast keine ${item.name} mehr.`);
  if (!item.usableInField) return fail(`${item.name} kann hier nicht benutzt werden.`);

  const effect = item.effect;
  if (!effect) {
    if (item.teachesMove) {
      return teachDisk(item, creature);
    }
    return fail(`${item.name} zeigt keine Wirkung.`);
  }

  switch (effect.kind) {
    case 'healHp': {
      if (creature.isFainted) {
        return fail(`${creature.name} ist kampfunfaehig und braucht einen Beleber.`);
      }
      if (creature.currentHp >= creature.maxHp) {
        return fail(`${creature.name} hat bereits volle KP.`);
      }
      const amount = effect.amount === 'full' ? creature.maxHp
        : effect.amount === 'half' ? Math.ceil(creature.maxHp / 2)
        : effect.amount === 'quarter' ? Math.ceil(creature.maxHp / 4)
        : effect.amount;
      const healed = creature.applyHpDelta(amount);
      player.removeItem(itemId);
      return ok(`${creature.name} erhaelt ${healed} KP zurueck.`);
    }

    case 'healStatus': {
      const list = effect.status === 'all' ? ALL_STATUS : effect.status;
      if (creature.status === 'none' || !list.includes(creature.status)) {
        return fail(`${creature.name} hat kein passendes Statusproblem.`);
      }
      creature.clearStatus();
      player.removeItem(itemId);
      return ok(`${creature.name} ist wieder wohlauf.`);
    }

    case 'revive': {
      if (!creature.isFainted) return fail(`${creature.name} ist nicht kampfunfaehig.`);
      creature.applyHpDelta(Math.max(1, Math.floor(creature.maxHp * effect.fraction)));
      creature.clearStatus();
      player.removeItem(itemId);
      return ok(`${creature.name} wurde wiederbelebt!`);
    }

    case 'restorePp': {
      const amount = effect.amount === 'full' ? 99 : effect.amount;
      let restored = 0;
      if (effect.allMoves) {
        for (let i = 0; i < creature.moves.length; i++) restored += creature.restorePp(i, amount);
      } else {
        const index = options.moveIndex ?? creature.moves.findIndex((m) => m.pp < m.maxPp);
        if (index < 0) return fail('Alle Attacken haben volle AP.');
        restored = creature.restorePp(index, amount);
      }
      if (restored === 0) return fail('Alle Attacken haben bereits volle AP.');
      player.removeItem(itemId);
      return ok(`${creature.name} erhaelt ${restored} AP zurueck.`);
    }

    case 'evolve': {
      const target = checkEvolution(creature, {
        timeOfDay: options.timeOfDay, areaId: options.areaId, usedItem: itemId,
      });
      if (!target) return fail(`${item.name} zeigt bei ${creature.name} keine Wirkung.`);
      player.removeItem(itemId);
      return {
        success: true, consumed: true, evolveTo: target,
        message: `${creature.name} reagiert auf ${item.name}!`,
      };
    }

    case 'friendship': {
      creature.addFriendship(effect.amount);
      player.removeItem(itemId);
      return ok(`${creature.name} freut sich ueber ${item.name}.`);
    }

    case 'evBoost': {
      creature.addEvs({ [effect.stat]: effect.amount });
      player.removeItem(itemId);
      return ok(`Die Werte von ${creature.name} verbessern sich.`);
    }

    case 'levelUp': {
      const levels = creature.addExp(creature.expToNextLevel());
      player.removeItem(itemId);
      return ok(levels.length > 0
        ? `${creature.name} erreicht Level ${creature.level}!`
        : `${creature.name} kann nicht weiter aufsteigen.`);
    }

    default:
      return fail(`${item.name} kann hier nicht benutzt werden.`);
  }
}

/** Gegenstaende, die nicht auf eine Kreatur wirken (Schutzspray, Fluchtseil). */
export function useFieldItem(player: PlayerState, itemId: string): ItemUseResult {
  const item = GameData.items.tryGet(itemId);
  if (!item?.effect) return fail('Dieser Gegenstand hat keine Wirkung.');
  if (!player.hasItem(itemId)) return fail(`Du hast keine ${item.name} mehr.`);

  switch (item.effect.kind) {
    case 'repel':
      player.removeItem(itemId);
      player.setFlag('repelActive', true);
      return ok(`${item.name} wurde benutzt. Schwache Kreaturen bleiben fern.`);
    case 'escape':
      return fail('Das wirkt nur im Kampf.');
    default:
      return fail(`${item.name} kann hier nicht benutzt werden.`);
  }
}

function teachDisk(item: ItemData, creature: Creature): ItemUseResult {
  const moveId = item.teachesMove!;
  const move = GameData.moves.tryGet(moveId);
  if (!move) return fail('Diese Disk ist beschaedigt.');
  if (creature.knowsMove(moveId)) {
    return fail(`${creature.name} beherrscht ${move.name} bereits.`);
  }
  const learnable = creature.species.tmMoves?.includes(moveId) ?? false;
  if (!learnable) {
    return fail(`${creature.name} kann ${move.name} nicht erlernen.`);
  }
  return {
    success: true, consumed: false, teachMove: moveId,
    message: `${creature.name} kann ${move.name} erlernen.`,
  };
}

function ok(message: string): ItemUseResult {
  return { success: true, message, consumed: true };
}

function fail(message: string): ItemUseResult {
  return { success: false, message, consumed: false };
}

/** Verkaufspreis eines Gegenstands. */
export function sellPrice(itemId: string): number {
  const item = GameData.items.tryGet(itemId);
  if (!item) return 0;
  return item.sellPrice ?? Math.floor(item.price / 2);
}
