import type { Screen, ScreenContext } from '../UIManager';
import { el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import { GameConfig } from '@/core/Config';
import type { AudioManager } from '@/audio/AudioManager';
import type { TextSpeed } from './DialogueScreen';

let instanceCounter = 0;

/**
 * Einfaches Textfenster ohne Dialogbaum.
 *
 * Wird fuer Trainerspruechen, Cutscene-Zeilen und Systemmeldungen benutzt,
 * die keine Verzweigung brauchen.
 */
export class MessageScreen implements Screen {
  readonly id: string;
  readonly modal = true;
  readonly transparent = true;

  private root!: HTMLElement;
  private textNode!: HTMLElement;
  private indicator!: HTMLElement;
  private lineIndex = 0;
  private visibleChars = 0;
  private typing = true;

  constructor(
    private readonly speaker: string | null,
    private readonly lines: string[],
    private readonly textSpeed: TextSpeed,
    private readonly audio: AudioManager,
    private readonly onDone: () => void,
  ) {
    instanceCounter++;
    this.id = `message-${instanceCounter}`;
  }

  mount(_ctx: ScreenContext): HTMLElement {
    this.textNode = el('div', { className: 'dialogue-text' });
    this.indicator = el('div', { className: 'dialogue-next', text: '▼' });
    this.indicator.hidden = true;

    const speakerNode = this.speaker
      ? el('div', { className: 'dialogue-speaker', text: this.speaker })
      : null;

    this.root = el('div', {
      className: 'dialogue',
      children: [
        el('div', {
          className: 'panel dialogue-box',
          children: [speakerNode, this.textNode, this.indicator],
        }),
      ],
    });
    return this.root;
  }

  update(dt: number): void {
    if (!this.typing) return;
    const speed = GameConfig.ui.textSpeedChars[this.textSpeed];
    this.visibleChars += speed * dt;
    const full = this.lines[this.lineIndex] ?? '';
    const shown = Math.min(full.length, Math.floor(this.visibleChars));
    if (this.textNode.textContent?.length !== shown) {
      this.textNode.textContent = full.slice(0, shown);
    }
    if (shown >= full.length) {
      this.typing = false;
      this.indicator.hidden = false;
    }
  }

  handleAction(action: GameAction): boolean {
    if (action !== 'interact' && action !== 'confirm' && action !== 'cancel') return true;
    if (this.typing) {
      this.visibleChars = Number.MAX_SAFE_INTEGER;
      this.textNode.textContent = this.lines[this.lineIndex] ?? '';
      this.typing = false;
      this.indicator.hidden = false;
      return true;
    }
    this.audio.playSfx('confirm');
    this.lineIndex++;
    if (this.lineIndex >= this.lines.length) {
      this.onDone();
      return true;
    }
    this.visibleChars = 0;
    this.typing = true;
    this.indicator.hidden = true;
    this.textNode.textContent = '';
    return true;
  }
}
