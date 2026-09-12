import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { formatMoney } from '../uiHelpers';
import { GameData } from '@/data/GameData';
import { ITEM_CATEGORIES, type ItemCategory } from '@/data/schema';
import type { TeamScreen } from './TeamScreen';

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  heal: 'Heilung', ball: 'Fangkugeln', battle: 'Kampf', evolution: 'Entwicklung',
  held: 'Tragbar', key: 'Wichtiges', disk: 'Attacken-Disks',
  treasure: 'Wertsachen', ingredient: 'Zutaten',
};

/**
 * Beutel mit Kategorien, Einsatz und Wegwerfen.
 *
 * Gegenstaende, die auf eine Kreatur wirken, oeffnen die Teamansicht zur
 * Zielauswahl - es gibt keinen Knopf ohne Funktion.
 */
export class BagScreen implements Screen {
  readonly id = 'bag';
  readonly modal = true;

  private root!: HTMLElement;
  private tabsNode!: HTMLElement;
  private listNode!: HTMLElement;
  private detailNode!: HTMLElement;
  private categoryIndex = 0;
  private itemIndex = 0;
  private categories: ItemCategory[] = [];

  constructor(private readonly ctx: MenuContext, private readonly teamScreen: TeamScreen) {}

  mount(_context: ScreenContext): HTMLElement {
    this.tabsNode = el('div', {
      style: { display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '14px' },
    });
    this.listNode = el('div', {
      style: {
        display: 'flex', flexDirection: 'column', gap: '5px',
        minWidth: '330px', maxHeight: '52vh', overflowY: 'auto',
      },
    });
    this.detailNode = el('div', { style: { flex: '1', minWidth: '0' } });

    this.root = el('div', {
      className: 'menu-overlay',
      children: [
        el('div', {
          className: 'panel menu-panel',
          children: [
            el('div', {
              className: 'menu-header',
              children: [
                el('h2', { text: 'Beutel' }),
                el('div', { className: 'entry-sub', text: formatMoney(this.ctx.player.money) }),
              ],
            }),
            el('div', {
              className: 'menu-body',
              children: [
                this.tabsNode,
                el('div', {
                  style: { display: 'flex', gap: '18px' },
                  children: [this.listNode, this.detailNode],
                }),
              ],
            }),
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'A/D: Kategorie' }),
                el('span', { text: 'W/S: Gegenstand' }),
                el('span', { text: 'E: Benutzen' }),
                el('span', { text: 'Esc: Zurueck' }),
              ],
            }),
          ],
        }),
      ],
    });
    this.refresh();
    return this.root;
  }

  onShow(): void {
    this.refresh();
  }

  private currentItems(): { itemId: string; quantity: number }[] {
    const category = this.categories[this.categoryIndex];
    return category ? this.ctx.player.itemsOfCategory(category) : [];
  }

  private refresh(): void {
    // Nur Kategorien mit Inhalt anzeigen.
    this.categories = ITEM_CATEGORIES.filter(
      (c) => this.ctx.player.itemsOfCategory(c).length > 0,
    );
    if (this.categories.length === 0) this.categories = ['heal'];
    this.categoryIndex = Math.min(this.categoryIndex, this.categories.length - 1);

    clearChildren(this.tabsNode);
    this.categories.forEach((category, index) => {
      this.tabsNode.appendChild(el('div', {
        className: `choice${index === this.categoryIndex ? ' selected' : ''}`,
        text: CATEGORY_LABELS[category],
        style: { padding: '6px 13px', fontSize: '13px' },
        onClick: () => { this.categoryIndex = index; this.itemIndex = 0; this.refresh(); },
      }));
    });

    const items = this.currentItems();
    this.itemIndex = Math.max(0, Math.min(this.itemIndex, items.length - 1));

    clearChildren(this.listNode);
    if (items.length === 0) {
      this.listNode.appendChild(el('div', {
        className: 'entry-sub', text: 'Keine Gegenstaende in dieser Kategorie.',
      }));
    }
    items.forEach((entry, index) => {
      const item = GameData.items.get(entry.itemId);
      this.listNode.appendChild(el('div', {
        className: `menu-entry${index === this.itemIndex ? ' selected' : ''}`,
        style: { padding: '9px 13px', display: 'flex', alignItems: 'center', gap: '11px' },
        children: [
          el('div', {
            style: {
              width: '18px', height: '18px', borderRadius: '5px',
              background: item.color ?? '#8f8f8f', flexShrink: '0',
            },
          }),
          el('span', { text: item.name, style: { flex: '1' } }),
          el('span', {
            text: `x${entry.quantity}`,
            style: { color: 'var(--ui-text-dim)', fontSize: '12px' },
          }),
        ],
        onClick: () => { this.itemIndex = index; this.useSelected(); },
      }));
    });
    this.renderDetail();
  }

  private renderDetail(): void {
    clearChildren(this.detailNode);
    const entry = this.currentItems()[this.itemIndex];
    if (!entry) return;
    const item = GameData.items.get(entry.itemId);
    const move = item.teachesMove ? GameData.moves.tryGet(item.teachesMove) : null;

    this.detailNode.appendChild(el('div', {
      children: [
        el('div', {
          style: { fontSize: '18px', fontWeight: '700', marginBottom: '5px' },
          text: item.name,
        }),
        el('div', {
          className: 'entry-sub',
          style: { lineHeight: '1.6', marginBottom: '13px' },
          text: item.description,
        }),
        move ? el('div', {
          className: 'entry-sub',
          style: { marginBottom: '13px' },
          text: `Lehrt: ${move.name} (${move.type}, Staerke ${move.power})`,
        }) : null,
        el('div', {
          className: 'entry-sub',
          style: { whiteSpace: 'pre-wrap', lineHeight: '1.7' },
          text: [
            `Bestand: ${entry.quantity}`,
            item.price > 0 ? `Kaufpreis: ${formatMoney(item.price)}` : 'Nicht kaeuflich',
            `Im Kampf: ${item.usableInBattle ? 'ja' : 'nein'}`,
            `Ausserhalb: ${item.usableInField ? 'ja' : 'nein'}`,
          ].join('\n'),
        }),
      ],
    }));
  }

  handleAction(action: GameAction): boolean {
    const items = this.currentItems();
    switch (action) {
      case 'left':
      case 'moveLeft':
        this.categoryIndex = (this.categoryIndex - 1 + this.categories.length) % this.categories.length;
        this.itemIndex = 0;
        this.refresh();
        return true;
      case 'right':
      case 'moveRight':
        this.categoryIndex = (this.categoryIndex + 1) % this.categories.length;
        this.itemIndex = 0;
        this.refresh();
        return true;
      case 'up':
      case 'moveForward':
        if (items.length > 0) {
          this.itemIndex = (this.itemIndex - 1 + items.length) % items.length;
          this.refresh();
        }
        return true;
      case 'down':
      case 'moveBackward':
        if (items.length > 0) {
          this.itemIndex = (this.itemIndex + 1) % items.length;
          this.refresh();
        }
        return true;
      case 'interact':
      case 'confirm':
        this.useSelected();
        return true;
      case 'cancel':
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }

  private useSelected(): void {
    const entry = this.currentItems()[this.itemIndex];
    if (!entry) return;
    const item = GameData.items.get(entry.itemId);

    if (item.category === 'key') {
      this.ctx.ui.toast(`${item.name}: ${item.description}`, 'info');
      return;
    }
    if (item.category === 'treasure' || item.category === 'ingredient') {
      this.ctx.ui.toast(`${item.name} kann bei Haendlern verkauft werden.`, 'info');
      return;
    }
    // Gegenstaende mit Kreaturziel: Teamansicht zur Auswahl oeffnen.
    const needsTarget = item.category === 'heal' || item.category === 'evolution'
      || item.category === 'disk' || item.category === 'held';
    if (needsTarget) {
      if (this.ctx.player.party.length === 0) {
        this.ctx.ui.toast('Du hast noch keine Kreatur.', 'warn');
        return;
      }
      this.teamScreen.setPendingItem(entry.itemId);
      this.ctx.ui.push('team');
      return;
    }
    const message = this.ctx.useItem(entry.itemId, null);
    this.ctx.ui.toast(message, 'info');
    this.refresh();
  }
}
