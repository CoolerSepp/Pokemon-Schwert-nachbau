import { describe, expect, it, beforeAll } from 'vitest';
import { GameData } from '@/data/GameData';
import { AREA_KINDS, BIOMES, ELEMENT_TYPES } from '@/data/schema';

beforeAll(() => GameData.load());

/** Sammelt alle Verweise, die zur Laufzeit aufgeloest werden muessen. */
describe('Inhaltliche Verweise', () => {
  it('laedt die vollstaendige Region', () => {
    expect(GameData.areas.size).toBeGreaterThanOrEqual(50);
    expect(GameData.trainers.size).toBeGreaterThanOrEqual(60);
    expect(GameData.gyms.size).toBe(8);
    expect(GameData.quests.size).toBeGreaterThanOrEqual(12);
    expect(GameData.dialogues.size).toBeGreaterThanOrEqual(25);
    expect(GameData.shops.size).toBeGreaterThanOrEqual(3);
    expect(GameData.cutscenes.size).toBeGreaterThanOrEqual(4);
    expect(GameData.storyStages.size).toBeGreaterThanOrEqual(14);
  });

  it('haelt alle Gebietsverweise gueltig', () => {
    for (const area of GameData.areas.all()) {
      expect(AREA_KINDS, `${area.id}.kind`).toContain(area.kind);
      expect(BIOMES, `${area.id}.biome`).toContain(area.biome);
      expect(area.size[0]).toBeGreaterThan(4);
      expect(area.size[1]).toBeGreaterThan(4);
      expect(area.spawnPoints.length, `${area.id} ohne Spawnpunkt`).toBeGreaterThan(0);

      for (const conn of area.connections) {
        expect(GameData.areas.has(conn.to), `${area.id} -> ${conn.to}`).toBe(true);
        const target = GameData.areas.get(conn.to);
        expect(
          target.spawnPoints.some((p) => p.id === conn.spawnPoint),
          `${area.id} -> ${conn.to}: Spawnpunkt "${conn.spawnPoint}" fehlt`,
        ).toBe(true);
      }
      for (const building of area.buildings ?? []) {
        if (!building.interior) continue;
        expect(GameData.areas.has(building.interior), `${area.id}: ${building.interior}`).toBe(true);
      }
      for (const npc of area.npcs ?? []) {
        if (npc.trainer) {
          expect(GameData.trainers.has(npc.trainer), `${area.id}: ${npc.trainer}`).toBe(true);
        }
        if (npc.dialogue) {
          expect(GameData.dialogues.has(npc.dialogue), `${area.id}: ${npc.dialogue}`).toBe(true);
        }
        if (npc.shop) {
          expect(GameData.shops.has(npc.shop), `${area.id}: ${npc.shop}`).toBe(true);
        }
      }
      for (const item of area.items ?? []) {
        expect(GameData.items.has(item.item), `${area.id}: ${item.item}`).toBe(true);
      }
      for (const entry of area.spawnTable ?? []) {
        expect(GameData.species.has(entry.species), `${area.id}: ${entry.species}`).toBe(true);
        expect(entry.minLevel).toBeLessThanOrEqual(entry.maxLevel);
        expect(entry.weight).toBeGreaterThan(0);
      }
      for (const trigger of area.triggers ?? []) {
        const action = trigger.action;
        if (action.kind === 'cutscene') {
          expect(GameData.cutscenes.has(action.cutscene), `${area.id}: ${action.cutscene}`).toBe(true);
        }
        if (action.kind === 'dialogue') {
          expect(GameData.dialogues.has(action.dialogue), `${area.id}: ${action.dialogue}`).toBe(true);
        }
        if (action.kind === 'battle') {
          expect(GameData.trainers.has(action.trainer), `${area.id}: ${action.trainer}`).toBe(true);
        }
      }
    }
  });

  it('haelt alle Trainerteams gueltig und ausgewogen', () => {
    for (const trainer of GameData.trainers.all()) {
      expect(trainer.team.length, `${trainer.id} ohne Team`).toBeGreaterThan(0);
      expect(trainer.team.length).toBeLessThanOrEqual(6);
      expect(trainer.dialogue.intro.length).toBeGreaterThan(0);
      expect(trainer.dialogue.defeat.length).toBeGreaterThan(0);

      for (const member of [...trainer.team, ...(trainer.rematchTeam ?? [])]) {
        expect(GameData.species.has(member.species), `${trainer.id}: ${member.species}`).toBe(true);
        expect(member.level).toBeGreaterThan(0);
        expect(member.level).toBeLessThanOrEqual(100);
        for (const move of member.moves ?? []) {
          expect(GameData.moves.has(move), `${trainer.id}: ${move}`).toBe(true);
        }
        if (member.item) expect(GameData.items.has(member.item)).toBe(true);
        if (member.ability) expect(GameData.abilities.has(member.ability)).toBe(true);
      }
      for (const itemId of trainer.items ?? []) {
        expect(GameData.items.has(itemId), `${trainer.id}: ${itemId}`).toBe(true);
      }
    }
  });

  it('haelt Arenen konsistent', () => {
    const badgeIndices = new Set<number>();
    for (const gym of GameData.gyms.all()) {
      expect(GameData.trainers.has(gym.leader), `${gym.id}: ${gym.leader}`).toBe(true);
      expect(GameData.areas.has(gym.area), `${gym.id}: ${gym.area}`).toBe(true);
      expect(ELEMENT_TYPES).toContain(gym.type);
      for (const minion of gym.minions) {
        expect(GameData.trainers.has(minion), `${gym.id}: ${minion}`).toBe(true);
      }
      for (const item of gym.rewardItems ?? []) {
        expect(GameData.items.has(item), `${gym.id}: ${item}`).toBe(true);
      }
      expect(badgeIndices.has(gym.badgeIndex), `Doppelter Orden ${gym.badgeIndex}`).toBe(false);
      badgeIndices.add(gym.badgeIndex);
    }
    // Alle acht Orden muessen vergeben werden.
    for (let i = 0; i < 8; i++) expect(badgeIndices.has(i), `Orden ${i} fehlt`).toBe(true);
  });

  it('haelt Dialogbaeume schleifenfrei und vollstaendig', () => {
    for (const tree of GameData.dialogues.all()) {
      const ids = new Set(tree.nodes.map((n) => n.id));
      expect(tree.entry.length, `${tree.id} ohne Einstieg`).toBeGreaterThan(0);
      for (const entry of tree.entry) {
        expect(ids.has(entry), `${tree.id}: Einstieg "${entry}"`).toBe(true);
      }
      for (const node of tree.nodes) {
        if (node.next) expect(ids.has(node.next), `${tree.id}/${node.id}`).toBe(true);
        for (const choice of node.choices ?? []) {
          if (choice.next) expect(ids.has(choice.next), `${tree.id}/${node.id}`).toBe(true);
        }
        // Knoten ohne Zeilen und ohne Auswahl wuerden den Dialog stumm beenden.
        if (node.lines.length === 0) {
          expect(
            Boolean(node.next || node.choices?.length || node.actions?.length),
            `${tree.id}/${node.id}: leerer Knoten ohne Wirkung`,
          ).toBe(true);
        }
        for (const action of [...(node.actions ?? []),
                              ...(node.choices ?? []).flatMap((c) => c.actions ?? [])]) {
          switch (action.kind) {
            case 'giveItem':
            case 'takeItem':
              expect(GameData.items.has(action.item), `${tree.id}: ${action.item}`).toBe(true);
              break;
            case 'giveCreature':
              expect(GameData.species.has(action.species), `${tree.id}: ${action.species}`).toBe(true);
              break;
            case 'startBattle':
              expect(GameData.trainers.has(action.trainer), `${tree.id}: ${action.trainer}`).toBe(true);
              break;
            case 'openShop':
              expect(GameData.shops.has(action.shop), `${tree.id}: ${action.shop}`).toBe(true);
              break;
            case 'startQuest':
            case 'advanceQuest':
            case 'completeQuest':
              expect(GameData.quests.has(action.quest), `${tree.id}: ${action.quest}`).toBe(true);
              break;
            case 'cutscene':
              expect(GameData.cutscenes.has(action.cutscene), `${tree.id}: ${action.cutscene}`).toBe(true);
              break;
            case 'teleport':
              expect(GameData.areas.has(action.area), `${tree.id}: ${action.area}`).toBe(true);
              break;
            default:
              break;
          }
        }
      }
    }
  });

  it('haelt Auftraege aufloesbar', () => {
    for (const quest of GameData.quests.all()) {
      expect(quest.steps.length, `${quest.id} ohne Schritte`).toBeGreaterThan(0);
      for (const step of quest.steps) {
        const c = step.completion;
        if (!c) continue;
        if (c.kind === 'defeatTrainer') {
          expect(GameData.trainers.has(c.trainer), `${quest.id}: ${c.trainer}`).toBe(true);
        }
        if (c.kind === 'catchSpecies') {
          expect(GameData.species.has(c.species), `${quest.id}: ${c.species}`).toBe(true);
        }
        if (c.kind === 'visitArea') {
          expect(GameData.areas.has(c.area), `${quest.id}: ${c.area}`).toBe(true);
        }
        if (c.kind === 'item') {
          expect(GameData.items.has(c.item), `${quest.id}: ${c.item}`).toBe(true);
        }
      }
      for (const reward of quest.rewards?.items ?? []) {
        expect(GameData.items.has(reward.item), `${quest.id}: ${reward.item}`).toBe(true);
      }
    }
  });

  it('haelt Laeden gueltig', () => {
    for (const shop of GameData.shops.all()) {
      expect(shop.stock.length).toBeGreaterThan(0);
      for (const entry of shop.stock) {
        expect(GameData.items.has(entry.item), `${shop.id}: ${entry.item}`).toBe(true);
        const item = GameData.items.get(entry.item);
        // Unverkaeufliche Gegenstaende gehoeren nicht ins Sortiment.
        expect(entry.priceOverride ?? item.price, `${shop.id}: ${entry.item} ohne Preis`)
          .toBeGreaterThan(0);
      }
    }
  });

  it('haelt Cutscenes ausfuehrbar', () => {
    for (const cutscene of GameData.cutscenes.all()) {
      expect(cutscene.steps.length, `${cutscene.id} ohne Schritte`).toBeGreaterThan(0);
      for (const step of cutscene.steps) {
        if (step.kind === 'battle') {
          expect(GameData.trainers.has(step.trainer), `${cutscene.id}: ${step.trainer}`).toBe(true);
        }
        if (step.kind === 'wildBattle') {
          expect(GameData.species.has(step.species), `${cutscene.id}: ${step.species}`).toBe(true);
        }
        if (step.kind === 'dialogue') {
          expect(GameData.dialogues.has(step.dialogue), `${cutscene.id}: ${step.dialogue}`).toBe(true);
        }
        if (step.kind === 'teleport') {
          expect(GameData.areas.has(step.area), `${cutscene.id}: ${step.area}`).toBe(true);
        }
      }
    }
  });

  it('verbindet die Region lueckenlos vom Start bis zur Liga', () => {
    // Erreichbarkeit per Breitensuche ueber Verbindungen und Gebaeudeeingaenge.
    const visited = new Set<string>(['home_bedroom']);
    const queue = ['home_bedroom'];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const area = GameData.areas.tryGet(id);
      if (!area) continue;
      const targets = [
        ...area.connections.map((c) => c.to),
        ...(area.buildings ?? []).map((b) => b.interior).filter((v): v is string => Boolean(v)),
      ];
      for (const target of targets) {
        if (visited.has(target)) continue;
        visited.add(target);
        queue.push(target);
      }
    }
    const unreachable = GameData.areas.ids().filter((id) => !visited.has(id));
    expect(unreachable, `Nicht erreichbare Gebiete: ${unreachable.join(', ')}`).toEqual([]);
  });

  it('steigert die Trainerlevel entlang des Spielverlaufs', () => {
    // Arenaleitungen muessen mit der Ordensnummer staerker werden.
    const gyms = GameData.gyms.all().sort((a, b) => a.badgeIndex - b.badgeIndex);
    let previousMax = 0;
    for (const gym of gyms) {
      const leader = GameData.trainers.get(gym.leader);
      const maxLevel = Math.max(...leader.team.map((m) => m.level));
      expect(maxLevel, `${gym.id} nicht staerker als die vorige Arena`)
        .toBeGreaterThan(previousMax);
      expect(maxLevel).toBeLessThanOrEqual(gym.obedienceLevel + 4);
      previousMax = maxLevel;
    }
  });
});
