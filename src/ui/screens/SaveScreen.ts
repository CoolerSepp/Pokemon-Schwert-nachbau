import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { SaveManager, type SlotInfo } from '@/save/SaveManager';
import { GameConfig } from '@/core/Config';

/**
 * Spielstandverwaltung: speichern, laden, loeschen.
 *
 * Bestaetigung vor dem Ueberschreiben und vor dem Loeschen - ein verlorener
 * Spielstand waere der schlimmste Fehler des Spiels.
 */
export class SaveScreen implements Screen {
  readonly id = 'save';
  readonly modal = true;

  private root!: HTMLElement;
  private listNode!: HTMLElement;
  private hintNode!: HTMLElement;
  private slots: SlotInfo[] = [];
  private selected = 0;
  private confirmMode: 'none' | 'overwrite' | 'load' | 'delete' = 'none';
  private busy = false;

  constructor(private readonly ctx: MenuContext) {}

  mount(_context: ScreenContext): HTMLElement {
    this.listNode = el('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '9px' },
    });
    this.hintNode = el('div', { className: 'entry-sub' });

    this.root = el('div', {
      className: 'menu-overlay',
      children: [
        el('div', {
          className: 'panel menu-panel',
          style: { maxWidth: '660px' },
          children: [
            el('div', {
              className: 'menu-header',
              children: [el('h2', { text: 'Spielstaende' }), this.hintNode],
            }),
            el('div', { className: 'menu-body', children: [this.listNode] }),
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'W/S: Auswaehlen' }),
                el('span', { text: 'E: Speichern' }),
                el('span', { text: 'F5: Laden' }),
                el('span', { text: 'Esc: Zurueck' }),
              ],
            }),
          ],
        }),
      ],
    });
    void this.reload();
    return this.root;
  }

  onShow(): void {
    this.confirmMode = 'none';
    void this.reload();
  }

  private async reload(): Promise<void> {
    this.slots = await this.ctx.listSaves();
    this.render();
  }

  private render(): void {
    clearChildren(this.listNode);
    this.hintNode.textContent = this.confirmMode === 'none'
      ? `Spielzeit ${this.ctx.player.formatPlaytime()}`
      : this.confirmText();

    this.slots.forEach((slot, index) => {
      const isAuto = slot.slot === GameConfig.save.autosaveSlot;
      const meta = slot.meta;
      this.listNode.appendChild(el('div', {
        className: `menu-entry${index === this.selected ? ' selected' : ''}`,
        style: { padding: '14px 17px' },
        children: [
          el('div', {
            style: { display: 'flex', justifyContent: 'space-between', gap: '11px' },
            children: [
              el('div', {
                className: 'entry-title',
                text: isAuto ? 'Automatisch' : `Platz ${index}`,
              }),
              el('div', {
                className: 'entry-sub',
                text: meta ? SaveManager.formatDate(meta.savedAt) : 'leer',
              }),
            ],
          }),
          meta ? el('div', {
            className: 'entry-sub',
            style: { marginTop: '5px' },
            text: `${meta.playerName} · ${meta.areaName} · ${meta.badgeCount}/8 Orden · ${meta.partySize} im Team · ${meta.caughtCount} gefangen · ${formatTime(meta.playtimeSeconds)}`,
          }) : el('div', {
            className: 'entry-sub',
            style: { marginTop: '5px' },
            text: 'Kein Spielstand vorhanden.',
          }),
        ],
        onClick: () => { this.selected = index; this.render(); },
      }));
    });
  }

  private confirmText(): string {
    const slot = this.slots[this.selected];
    const name = slot?.slot === GameConfig.save.autosaveSlot ? 'Automatisch' : `Platz ${this.selected}`;
    switch (this.confirmMode) {
      case 'overwrite': return `${name} ueberschreiben? E bestaetigen, Esc abbrechen.`;
      case 'load': return `${name} laden? Ungespeicherter Fortschritt geht verloren. E bestaetigen.`;
      case 'delete': return `${name} endgueltig loeschen? E bestaetigen.`;
      default: return '';
    }
  }

  handleAction(action: GameAction): boolean {
    if (this.busy) return true;
    switch (action) {
      case 'up':
      case 'moveForward':
        this.selected = (this.selected - 1 + this.slots.length) % this.slots.length;
        this.confirmMode = 'none';
        this.render();
        return true;
      case 'down':
      case 'moveBackward':
        this.selected = (this.selected + 1) % this.slots.length;
        this.confirmMode = 'none';
        this.render();
        return true;
      case 'interact':
      case 'confirm':
        void this.confirm();
        return true;
      case 'quickSave':
        this.confirmMode = this.slots[this.selected]?.meta ? 'load' : 'none';
        this.render();
        return true;
      case 'prevItem':
        if (this.slots[this.selected]?.meta) {
          this.confirmMode = 'delete';
          this.render();
        }
        return true;
      case 'cancel':
        if (this.confirmMode !== 'none') {
          this.confirmMode = 'none';
          this.render();
          return true;
        }
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }

  private async confirm(): Promise<void> {
    const slot = this.slots[this.selected];
    if (!slot) return;
    this.busy = true;
    try {
      if (this.confirmMode === 'load') {
        const ok = await this.ctx.loadGame(slot.slot);
        this.ctx.ui.toast(ok ? 'Spielstand geladen.' : 'Laden fehlgeschlagen.', ok ? 'success' : 'warn');
        if (ok) this.ctx.ui.popAll();
        return;
      }
      if (this.confirmMode === 'delete') {
        const ok = await this.ctx.deleteSave(slot.slot);
        this.ctx.ui.toast(ok ? 'Spielstand geloescht.' : 'Loeschen fehlgeschlagen.', ok ? 'info' : 'warn');
        this.confirmMode = 'none';
        await this.reload();
        return;
      }
      if (slot.meta && this.confirmMode !== 'overwrite') {
        this.confirmMode = 'overwrite';
        this.render();
        return;
      }
      const ok = await this.ctx.saveGame(slot.slot);
      this.ctx.ui.toast(ok ? 'Spielstand gespeichert.' : 'Speichern fehlgeschlagen.', ok ? 'success' : 'warn');
      this.confirmMode = 'none';
      await this.reload();
    } finally {
      this.busy = false;
    }
  }
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, '0')} h`;
}
