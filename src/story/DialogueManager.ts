import { GameData } from '@/data/GameData';
import { EventBus } from '@/core/EventBus';
import { Logger } from '@/core/Logger';
import type { DialogueAction, DialogueChoice, DialogueNode } from '@/data/schema';
import type { PlayerState } from '@/player/PlayerState';

const log = Logger.scope('Dialog');

export interface DialogueLine {
  speaker: string | null;
  text: string;
  portrait: string | null;
}

export interface DialogueEvents extends Record<string, unknown> {
  started: { treeId: string };
  line: { line: DialogueLine; index: number; total: number };
  choices: { choices: DialogueChoice[] };
  action: { action: DialogueAction };
  finished: { treeId: string };
}

/**
 * Fuehrt Dialogbaeume aus.
 *
 * Reine Ablauflogik ohne DOM: der Bildschirm abonniert die Ereignisse. Dadurch
 * ist der Dialogfluss testbar und die Darstellung austauschbar.
 */
export class DialogueManager {
  readonly events = new EventBus<DialogueEvents>();

  private treeId: string | null = null;
  private node: DialogueNode | null = null;
  private lineIndex = 0;
  private waitingForChoice = false;
  private onFinish: (() => void) | null = null;
  private readonly visitedNodes = new Set<string>();

  constructor(
    private readonly player: PlayerState,
    private readonly runAction: (action: DialogueAction) => void,
  ) {}

  get isActive(): boolean { return this.node !== null; }
  get awaitingChoice(): boolean { return this.waitingForChoice; }
  get currentSpeaker(): string | null { return this.node?.speaker ?? null; }

  /**
   * Startet einen Dialogbaum. Waehlt den ersten Startknoten, dessen
   * Bedingungen erfuellt sind.
   */
  start(treeId: string, onFinish?: () => void): boolean {
    const tree = GameData.dialogues.tryGet(treeId);
    if (!tree) {
      log.warn(`Unbekannter Dialog "${treeId}"`);
      return false;
    }
    const entryNode = tree.entry
      .map((id) => tree.nodes.find((n) => n.id === id))
      .find((n) => n !== undefined && this.meetsRequirements(n));
    if (!entryNode) {
      log.warn(`Dialog "${treeId}" hat keinen passenden Einstiegsknoten`);
      return false;
    }

    this.treeId = treeId;
    this.onFinish = onFinish ?? null;
    this.visitedNodes.clear();
    this.events.emit('started', { treeId });
    this.enterNode(entryNode);
    return true;
  }

  /** Rueckt eine Zeile vor. Liefert false, wenn der Dialog beendet ist. */
  advance(): boolean {
    if (!this.node || this.waitingForChoice) return this.isActive;
    this.lineIndex++;
    if (this.lineIndex < this.node.lines.length) {
      this.emitLine();
      return true;
    }
    return this.finishNode();
  }

  /** Waehlt eine Antwortmoeglichkeit. */
  choose(index: number): boolean {
    if (!this.node || !this.waitingForChoice) return this.isActive;
    const choice = this.node.choices?.[index];
    if (!choice) return this.isActive;
    this.waitingForChoice = false;
    for (const action of choice.actions ?? []) this.emitAction(action);
    if (choice.next) {
      const next = this.findNode(choice.next);
      if (next) {
        this.enterNode(next);
        return true;
      }
    }
    return this.stop();
  }

  /** Bricht den Dialog ab. */
  stop(): boolean {
    const treeId = this.treeId;
    this.node = null;
    this.treeId = null;
    this.lineIndex = 0;
    this.waitingForChoice = false;
    const finish = this.onFinish;
    this.onFinish = null;
    if (treeId) this.events.emit('finished', { treeId });
    finish?.();
    return false;
  }

  private enterNode(node: DialogueNode): void {
    // Schleifenschutz: derselbe Knoten darf pro Dialog nur einmal betreten
    // werden, wenn er ohne Zeilen direkt weiterverzweigt.
    if (node.lines.length === 0 && this.visitedNodes.has(node.id)) {
      log.warn(`Dialogschleife bei Knoten "${node.id}" abgebrochen`);
      this.stop();
      return;
    }
    this.visitedNodes.add(node.id);
    this.node = node;
    this.lineIndex = 0;
    this.waitingForChoice = false;
    for (const action of node.actions ?? []) this.emitAction(action);
    if (node.lines.length > 0) this.emitLine();
    else this.finishNode();
  }

  private finishNode(): boolean {
    const node = this.node;
    if (!node) return false;
    if (node.choices && node.choices.length > 0) {
      this.waitingForChoice = true;
      this.events.emit('choices', { choices: node.choices });
      return true;
    }
    if (node.next) {
      const next = this.findNode(node.next);
      if (next) {
        this.enterNode(next);
        return true;
      }
    }
    return this.stop();
  }

  private findNode(id: string): DialogueNode | null {
    if (!this.treeId) return null;
    const tree = GameData.dialogues.tryGet(this.treeId);
    return tree?.nodes.find((n) => n.id === id) ?? null;
  }

  private emitLine(): void {
    const node = this.node;
    if (!node) return;
    const raw = node.lines[this.lineIndex] ?? '';
    this.events.emit('line', {
      line: {
        speaker: node.speaker ?? null,
        text: this.interpolate(raw),
        portrait: node.portrait ?? null,
      },
      index: this.lineIndex,
      total: node.lines.length,
    });
  }

  private emitAction(action: DialogueAction): void {
    this.events.emit('action', { action });
    this.runAction(action);
  }

  /** Ersetzt Platzhalter wie {spieler} und {starter}. */
  private interpolate(text: string): string {
    return text
      .replace(/\{spieler\}/g, this.player.name)
      .replace(/\{starter\}/g, this.player.party[0]?.name ?? 'deinem Begleiter')
      .replace(/\{orden\}/g, String(this.player.badgeCount))
      .replace(/\{geld\}/g, this.player.money.toLocaleString('de-DE'));
  }

  /** Prueft die Bedingungen eines Knotens gegen den Spielerfortschritt. */
  meetsRequirements(node: DialogueNode): boolean {
    const req = node.requires;
    if (!req) return true;
    if (req.storyStage !== undefined && this.player.storyStage < req.storyStage) return false;
    if (req.maxStoryStage !== undefined && this.player.storyStage > req.maxStoryStage) return false;
    if (req.flag && !this.player.hasFlag(req.flag)) return false;
    if (req.notFlag && this.player.hasFlag(req.notFlag)) return false;
    if (req.badge !== undefined && this.player.badgeCount < req.badge) return false;
    if (req.hasItem && !this.player.hasItem(req.hasItem)) return false;
    return true;
  }
}
