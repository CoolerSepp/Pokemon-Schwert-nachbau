import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { GameData } from '@/data/GameData';
import { typeChip } from '../uiHelpers';
import type { AudioManager } from '@/audio/AudioManager';
import type { HallOfFameEntry } from '@/player/PlayerState';

/**
 * Ruhmeshalle.
 *
 * Zeigt das Team, mit dem die Liga gewonnen wurde, samt Spielzeit und
 * Ordenszahl. Alle Eintraege bleiben im Spielstand erhalten und lassen
 * sich spaeter erneut ansehen.
 */
export class HallOfFameScreen implements Screen {
  readonly id = 'hallOfFame';
  readonly modal = true;

  private root!: HTMLElement;
  private bodyNode!: HTMLElement;
  private titleNode!: HTMLElement;
  private index = 0;

  constructor(
    private readonly ctx: MenuContext,
    private readonly audio: AudioManager,
    private readonly onClosed: (() => void) | null = null,
  ) {}

  /** Zeigt einen bestimmten Eintrag (Standard: der neueste). */
  showEntry(index: number): void {
    this.index = index;
    if (this.bodyNode) this.render();
  }

  mount(_context: ScreenContext): HTMLElement {
    this.bodyNode = el('div', { className: 'menu-body' });
    this.titleNode = el('h2', { text: 'Ruhmeshalle' });
    this.root = el('div', {
      className: 'menu-overlay hall-of-fame',
      children: [
        el('div', {
          className: 'panel menu-panel',
          style: { maxWidth: '760px' },
          children: [
            el('div', {
              className: 'menu-header',
              children: [
                this.titleNode,
                el('div', { className: 'entry-sub', text: 'Die Siegerinnen und Sieger der Liga' }),
              ],
            }),
            this.bodyNode,
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'A/D: Blaettern' }),
                el('span', { text: 'Esc: Schliessen' }),
              ],
            }),
          ],
        }),
      ],
    });
    this.render();
    return this.root;
  }

  onShow(): void {
    this.index = Math.max(0, this.entries().length - 1);
    this.render();
  }

  private entries(): readonly HallOfFameEntry[] {
    return this.ctx.player.hallOfFame;
  }

  private render(): void {
    clearChildren(this.bodyNode);
    const entries = this.entries();
    if (entries.length === 0) {
      this.bodyNode.appendChild(el('div', {
        text: 'Noch hat niemand die Liga gewonnen.',
      }));
      return;
    }
    const entry = entries[Math.min(this.index, entries.length - 1)]!;
    const date = new Date(entry.date).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    this.titleNode.textContent = `Ruhmeshalle ${this.index + 1} / ${entries.length}`;

    this.bodyNode.appendChild(el('div', {
      className: 'entry-sub',
      style: { marginBottom: '14px', lineHeight: '1.8', whiteSpace: 'pre-line' },
      text: [
        `${entry.playerName} · Champion von Aetheria`,
        `Eingetragen am ${date}`,
        `Orden: ${entry.badges} · Spielzeit: ${formatTime(entry.playtimeSeconds)}`,
        `Gefangene Arten: ${entry.caughtCount}`,
      ].join('\n'),
    }));

    const grid = el('div', {
      style: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '10px',
      },
    });
    for (const member of entry.team) {
      const species = GameData.species.tryGet(member.speciesId);
      grid.appendChild(el('div', {
        className: 'menu-entry',
        children: [
          el('div', {
            style: {
              width: '54px', height: '54px', borderRadius: '13px', marginBottom: '8px',
              background: species?.model.palette.primary ?? '#555',
              border: '2px solid rgba(255,255,255,0.25)',
            },
          }),
          el('div', { className: 'entry-title', text: `${member.name} · Lv. ${member.level}` }),
          el('div', { style: { marginTop: '6px' }, children: (species?.types ?? []).map(typeChip) }),
        ],
      }));
    }
    this.bodyNode.appendChild(grid);
  }

  handleAction(action: GameAction): boolean {
    const count = this.entries().length;
    switch (action) {
      case 'left':
      case 'moveLeft':
        if (count > 0) {
          this.index = (this.index - 1 + count) % count;
          this.audio.playSfx('select');
          this.render();
        }
        return true;
      case 'right':
      case 'moveRight':
        if (count > 0) {
          this.index = (this.index + 1) % count;
          this.audio.playSfx('select');
          this.render();
        }
        return true;
      case 'cancel':
      case 'confirm':
      case 'interact':
        this.audio.playSfx('cancel');
        this.ctx.ui.pop(this.id);
        this.onClosed?.();
        return true;
      default:
        return true;
    }
  }
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${m.toString().padStart(2, '0')} h`;
}
