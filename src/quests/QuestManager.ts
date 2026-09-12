import { GameData } from '@/data/GameData';
import { EventBus } from '@/core/EventBus';
import { Logger } from '@/core/Logger';
import type { QuestData, QuestStepData } from '@/data/schema';
import type { PlayerState } from '@/player/PlayerState';

const log = Logger.scope('Quest');

export interface QuestEvents extends Record<string, unknown> {
  questStarted: { quest: QuestData };
  stepCompleted: { quest: QuestData; step: QuestStepData; index: number };
  questCompleted: { quest: QuestData };
}

/**
 * Auftragsverwaltung.
 *
 * Schritte werden automatisch geprueft, sobald sich der Spielzustand aendert
 * (Flag, Gegenstand, Orden, besiegter Trainer, Gebiet, Fang). Dadurch muss
 * kein Inhalt den Fortschritt von Hand weiterschalten.
 */
export class QuestManager {
  readonly events = new EventBus<QuestEvents>();

  constructor(private readonly player: PlayerState) {
    // Fortschritt nach jeder relevanten Zustandsaenderung neu bewerten.
    this.player.events.on('flagChanged', () => this.evaluate());
    this.player.events.on('storyStageChanged', () => { this.autoStart(); this.evaluate(); });
    this.player.events.on('itemChanged', () => this.evaluate());
    this.player.events.on('badgeEarned', () => this.evaluate());
    this.player.events.on('dexUpdated', () => this.evaluate());
  }

  /** Startet Auftraege, deren Story-Voraussetzung erfuellt ist. */
  autoStart(): void {
    for (const quest of GameData.quests.all()) {
      if (quest.autoStartStage === undefined) continue;
      if (this.player.storyStage < quest.autoStartStage) continue;
      if (this.player.getQuest(quest.id)) continue;
      this.start(quest.id);
    }
  }

  start(questId: string): boolean {
    const quest = GameData.quests.tryGet(questId);
    if (!quest) {
      log.warn(`Unbekannter Auftrag "${questId}"`);
      return false;
    }
    if (this.player.getQuest(questId)) return false;
    if (!this.meetsRequirements(quest)) return false;
    this.player.startQuest(questId);
    this.events.emit('questStarted', { quest });
    log.info(`Auftrag gestartet: ${quest.name}`);
    this.evaluate();
    return true;
  }

  private meetsRequirements(quest: QuestData): boolean {
    const req = quest.requires;
    if (!req) return true;
    if (req.storyStage !== undefined && this.player.storyStage < req.storyStage) return false;
    if (req.flag && !this.player.hasFlag(req.flag)) return false;
    if (req.quest && !this.player.getQuest(req.quest)?.completed) return false;
    return true;
  }

  /** Rueckt einen Auftrag manuell weiter (aus Dialogen). */
  advance(questId: string, toStep?: number): void {
    const progress = this.player.getQuest(questId);
    const quest = GameData.quests.tryGet(questId);
    if (!progress || !quest || progress.completed) return;
    const next = toStep ?? progress.stepIndex + 1;
    this.setStep(quest, next);
  }

  complete(questId: string): void {
    const quest = GameData.quests.tryGet(questId);
    const progress = this.player.getQuest(questId);
    if (!quest || !progress || progress.completed) return;
    this.setStep(quest, quest.steps.length);
  }

  private setStep(quest: QuestData, index: number): void {
    const progress = this.player.getQuest(quest.id);
    if (!progress || progress.completed) return;

    while (progress.stepIndex < index && progress.stepIndex < quest.steps.length) {
      const step = quest.steps[progress.stepIndex]!;
      this.events.emit('stepCompleted', { quest, step, index: progress.stepIndex });
      progress.stepIndex++;
    }

    if (progress.stepIndex >= quest.steps.length) {
      progress.completed = true;
      this.grantRewards(quest);
      this.events.emit('questCompleted', { quest });
      log.info(`Auftrag abgeschlossen: ${quest.name}`);
    }
  }

  private grantRewards(quest: QuestData): void {
    if (quest.rewards?.money) this.player.addMoney(quest.rewards.money);
    for (const item of quest.rewards?.items ?? []) {
      this.player.addItem(item.item, item.quantity);
    }
    if (quest.rewards?.exp) {
      for (const creature of this.player.party) creature.addExp(quest.rewards.exp);
    }
  }

  /** Prueft alle offenen Auftraege auf erfuellte Schritte. */
  evaluate(): void {
    for (const progress of this.player.activeQuests) {
      const quest = GameData.quests.tryGet(progress.questId);
      if (!quest) continue;
      // Mehrere Schritte koennen gleichzeitig erfuellt sein.
      let guard = 0;
      while (progress.stepIndex < quest.steps.length && guard++ < quest.steps.length) {
        const step = quest.steps[progress.stepIndex]!;
        if (!this.isStepComplete(step)) break;
        this.setStep(quest, progress.stepIndex + 1);
      }
    }
  }

  private isStepComplete(step: QuestStepData): boolean {
    const c = step.completion;
    if (!c || c.kind === 'manual') return false;
    switch (c.kind) {
      case 'flag': return this.player.hasFlag(c.flag);
      case 'storyStage': return this.player.storyStage >= c.stage;
      case 'item': return this.player.hasItem(c.item, c.quantity);
      case 'defeatTrainer': return this.player.hasFlag(`trainer:${c.trainer}`);
      case 'catchSpecies': return this.player.caughtSpecies.has(c.species);
      case 'catchCount': return this.player.caughtSpecies.size >= c.count;
      case 'badge': return this.player.badgeCount >= c.badge;
      case 'visitArea': return this.player.visitedAreas.has(c.area);
      default: return false;
    }
  }
}
