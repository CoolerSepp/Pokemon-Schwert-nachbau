import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { DialogueManager, DialogueLine } from '@/story/DialogueManager';
import type { DialogueChoice } from '@/data/schema';
import { GameConfig } from '@/core/Config';

export type TextSpeed = keyof typeof GameConfig.ui.textSpeedChars;

/**
 * Dialogfenster mit Schreibmaschineneffekt und Antwortauswahl.
 *
 * Erste Eingabe laesst den Text sofort vollstaendig erscheinen, die zweite
 * rueckt vor - das ist die gewohnte und schnellste Bedienung.
 */
export class DialogueScreen implements Screen {
  readonly id = 'dialogue';
  readonly modal = true;
  readonly transparent = true;

  private root!: HTMLElement;
  private speakerLabel!: HTMLElement;
  private textNode!: HTMLElement;
  private nextIndicator!: HTMLElement;
  private choiceList!: HTMLElement;

  private fullText = '';
  private visibleChars = 0;
  private typing = false;
  private choices: DialogueChoice[] = [];
  private selectedChoice = 0;
  private textSpeed: TextSpeed = 'normal';
  private unsubscribe: (() => void)[] = [];

  constructor(private readonly dialogue: DialogueManager) {}

  setTextSpeed(speed: TextSpeed): void {
    this.textSpeed = speed;
  }

  mount(_ctx: ScreenContext): HTMLElement {
    this.speakerLabel = el('div', { className: 'dialogue-speaker' });
    this.speakerLabel.hidden = true;
    this.textNode = el('div', { className: 'dialogue-text' });
    this.nextIndicator = el('div', { className: 'dialogue-next', text: '▼' });
    this.nextIndicator.hidden = true;
    this.choiceList = el('div', { className: 'dialogue-choices' });
    this.choiceList.hidden = true;

    this.root = el('div', {
      className: 'dialogue',
      children: [
        el('div', {
          className: 'panel dialogue-box',
          children: [this.speakerLabel, this.textNode, this.nextIndicator, this.choiceList],
        }),
      ],
    });

    this.unsubscribe.push(
      this.dialogue.events.on('line', ({ line }) => this.showLine(line)),
      this.dialogue.events.on('choices', ({ choices }) => this.showChoices(choices)),
    );
    return this.root;
  }

  unmount(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }

  private showLine(line: DialogueLine): void {
    this.choices = [];
    this.choiceList.hidden = true;
    clearChildren(this.choiceList);

    if (line.speaker) {
      this.speakerLabel.hidden = false;
      this.speakerLabel.textContent = line.speaker;
      if (line.portrait) this.speakerLabel.style.background = line.portrait;
    } else {
      this.speakerLabel.hidden = true;
    }

    this.fullText = line.text;
    this.visibleChars = 0;
    this.typing = true;
    this.textNode.textContent = '';
    this.nextIndicator.hidden = true;
  }

  private showChoices(choices: DialogueChoice[]): void {
    this.choices = choices;
    this.selectedChoice = 0;
    this.nextIndicator.hidden = true;
    this.choiceList.hidden = false;
    clearChildren(this.choiceList);
    choices.forEach((choice, index) => {
      this.choiceList.appendChild(el('div', {
        className: `choice${index === 0 ? ' selected' : ''}`,
        text: choice.text,
        onClick: () => {
          this.selectedChoice = index;
          this.confirmChoice();
        },
      }));
    });
  }

  private refreshChoiceSelection(): void {
    for (let i = 0; i < this.choiceList.children.length; i++) {
      this.choiceList.children[i]!.classList.toggle('selected', i === this.selectedChoice);
    }
  }

  update(dt: number): void {
    if (!this.typing) return;
    const charsPerSecond = GameConfig.ui.textSpeedChars[this.textSpeed];
    this.visibleChars += charsPerSecond * dt;
    const shown = Math.min(this.fullText.length, Math.floor(this.visibleChars));
    if (this.textNode.textContent?.length !== shown) {
      this.textNode.textContent = this.fullText.slice(0, shown);
    }
    if (shown >= this.fullText.length) {
      this.typing = false;
      this.nextIndicator.hidden = this.choices.length > 0;
    }
  }

  handleAction(action: GameAction): boolean {
    if (this.choices.length > 0 && !this.typing) {
      switch (action) {
        case 'up':
        case 'moveForward':
          this.selectedChoice = (this.selectedChoice - 1 + this.choices.length) % this.choices.length;
          this.refreshChoiceSelection();
          return true;
        case 'down':
        case 'moveBackward':
          this.selectedChoice = (this.selectedChoice + 1) % this.choices.length;
          this.refreshChoiceSelection();
          return true;
        case 'interact':
        case 'confirm':
          this.confirmChoice();
          return true;
        default:
          return true;
      }
    }

    if (action === 'interact' || action === 'confirm' || action === 'cancel') {
      if (this.typing) {
        // Erste Eingabe: Text sofort vollstaendig anzeigen.
        this.visibleChars = this.fullText.length;
        this.textNode.textContent = this.fullText;
        this.typing = false;
        this.nextIndicator.hidden = false;
      } else {
        this.dialogue.advance();
      }
      return true;
    }
    // Alle uebrigen Eingaben schlucken, solange ein Dialog laeuft.
    return true;
  }

  private confirmChoice(): void {
    if (this.choices.length === 0) return;
    const index = this.selectedChoice;
    this.choices = [];
    this.choiceList.hidden = true;
    this.dialogue.choose(index);
  }
}
