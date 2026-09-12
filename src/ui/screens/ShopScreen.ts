import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import type { ShopData } from '@/data/schema';
import { GameData } from '@/data/GameData';
import { formatMoney } from '../uiHelpers';
import { sellPrice } from '@/items/ItemUsage';
import type { AudioManager } from '@/audio/AudioManager';

type Tab = 'buy' | 'sell';

/**
 * Laden mit Kauf und Verkauf.
 *
 * Das Sortiment waechst mit der Ordenszahl; verkauft werden koennen nur
 * Gegenstaende mit einem Verkaufswert (keine Schluesselgegenstaende).
 */
export class ShopScreen implements Screen {
  readonly id = 'shop';
  readonly modal = true;

  private root!: HTMLElement;
  private listNode!: HTMLElement;
  private detailNode!: HTMLElement;
  private moneyNode!: HTMLElement;
  private tabsNode!: HTMLElement;
  private tab: Tab = 'buy';
  private selected = 0;
  private quantity = 1;
  private entries: { itemId: string; price: number; owned: number }[] = [];

  constructor(
    private readonly ctx: MenuContext,
    private readonly shop: ShopData,
    private readonly audio: AudioManager,
  ) {}

  mount(_context: ScreenContext): HTMLElement {
    this.moneyNode = el('div', { className: 'entry-sub' });
    this.tabsNode = el('div', {
      style: { display: 'flex', gap: '7px', marginBottom: '14px' },
    });
    this.listNode = el('div', {
      style: {
        display: 'flex', flexDirection: 'column', gap: '5px',
        minWidth: '330px', maxHeight: '50vh', overflowY: 'auto',
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
              children: [el('h2', { text: this.shop.name }), this.moneyNode],
            }),
            el('div', {
              className: 'menu-body',
              children: [
                el('div', {
                  className: 'entry-sub',
                  style: { marginBottom: '13px' },
                  text: this.shop.greeting,
                }),
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
                el('span', { text: 'A/D: Kaufen/Verkaufen' }),
                el('span', { text: 'W/S: Auswaehlen' }),
                el('span', { text: '+/-: Menge' }),
                el('span', { text: 'E: Bestaetigen' }),
                el('span', { text: 'Esc: Verlassen' }),
              ],
            }),
          ],
        }),
      ],
    });
    this.refresh();
    return this.root;
  }

  onShow(): void { this.refresh(); }

  private refresh(): void {
    const player = this.ctx.player;
    this.moneyNode.textContent = formatMoney(player.money);

    clearChildren(this.tabsNode);
    for (const tab of ['buy', 'sell'] as Tab[]) {
      if (tab === 'sell' && !this.shop.buysItems) continue;
      this.tabsNode.appendChild(el('div', {
        className: `choice${this.tab === tab ? ' selected' : ''}`,
        style: { padding: '6px 15px', fontSize: '13px' },
        text: tab === 'buy' ? 'Kaufen' : 'Verkaufen',
        onClick: () => { this.tab = tab; this.selected = 0; this.quantity = 1; this.refresh(); },
      }));
    }

    this.entries = this.tab === 'buy'
      ? this.shop.stock
          .filter((s) => (s.minBadges ?? 0) <= player.badgeCount)
          .map((s) => ({
            itemId: s.item,
            price: s.priceOverride ?? GameData.items.get(s.item).price,
            owned: player.itemCount(s.item),
          }))
      : player.allItems()
          .filter((e) => sellPrice(e.itemId) > 0)
          .map((e) => ({ itemId: e.itemId, price: sellPrice(e.itemId), owned: e.quantity }));

    this.selected = Math.max(0, Math.min(this.selected, this.entries.length - 1));
    this.quantity = Math.max(1, Math.min(this.quantity, this.maxQuantity()));

    clearChildren(this.listNode);
    if (this.entries.length === 0) {
      this.listNode.appendChild(el('div', {
        className: 'entry-sub',
        text: this.tab === 'buy' ? 'Nichts im Angebot.' : 'Nichts zu verkaufen.',
      }));
    }
    this.entries.forEach((entry, index) => {
      const item = GameData.items.get(entry.itemId);
      this.listNode.appendChild(el('div', {
        className: `menu-entry${index === this.selected ? ' selected' : ''}`,
        style: { padding: '9px 13px', display: 'flex', gap: '11px', alignItems: 'center' },
        children: [
          el('div', {
            style: {
              width: '16px', height: '16px', borderRadius: '4px',
              background: item.color ?? '#8f8f8f',
            },
          }),
          el('span', { text: item.name, style: { flex: '1' } }),
          el('span', {
            text: formatMoney(entry.price),
            style: { fontSize: '12px', color: 'var(--ui-text-dim)' },
          }),
          el('span', {
            text: `(${entry.owned})`,
            style: { fontSize: '11px', color: 'var(--ui-text-dim)' },
          }),
        ],
        onClick: () => { this.selected = index; this.confirm(); },
      }));
    });
    this.renderDetail();
  }

  private maxQuantity(): number {
    const entry = this.entries[this.selected];
    if (!entry) return 1;
    if (this.tab === 'sell') return Math.max(1, entry.owned);
    return Math.max(1, Math.min(99, Math.floor(this.ctx.player.money / Math.max(1, entry.price))));
  }

  private renderDetail(): void {
    clearChildren(this.detailNode);
    const entry = this.entries[this.selected];
    if (!entry) return;
    const item = GameData.items.get(entry.itemId);
    const total = entry.price * this.quantity;
    const affordable = this.tab === 'sell' || this.ctx.player.money >= total;

    this.detailNode.appendChild(el('div', {
      children: [
        el('div', { style: { fontSize: '17px', fontWeight: '700' }, text: item.name }),
        el('div', {
          className: 'entry-sub',
          style: { lineHeight: '1.6', margin: '7px 0 15px' },
          text: item.description,
        }),
        el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '13px', marginBottom: '13px' },
          children: [
            el('span', { text: 'Menge:' }),
            el('span', {
              text: String(this.quantity),
              style: { fontSize: '21px', fontWeight: '700', color: 'var(--ui-accent)' },
            }),
            el('span', {
              className: 'entry-sub',
              text: `von max. ${this.maxQuantity()}`,
            }),
          ],
        }),
        el('div', {
          style: {
            fontSize: '16px', fontWeight: '650',
            color: affordable ? 'var(--ui-accent)' : 'var(--ui-danger)',
          },
          text: this.tab === 'buy'
            ? `Gesamtpreis: ${formatMoney(total)}`
            : `Erloes: ${formatMoney(total)}`,
        }),
        !affordable ? el('div', {
          className: 'entry-sub',
          style: { marginTop: '7px', color: 'var(--ui-danger)' },
          text: 'Dafuer reicht dein Geld nicht.',
        }) : null,
      ],
    }));
  }

  handleAction(action: GameAction): boolean {
    switch (action) {
      case 'up':
      case 'moveForward':
        if (this.entries.length > 0) {
          this.selected = (this.selected - 1 + this.entries.length) % this.entries.length;
          this.quantity = 1;
          this.audio.playSfx('select');
          this.refresh();
        }
        return true;
      case 'down':
      case 'moveBackward':
        if (this.entries.length > 0) {
          this.selected = (this.selected + 1) % this.entries.length;
          this.quantity = 1;
          this.audio.playSfx('select');
          this.refresh();
        }
        return true;
      case 'left':
      case 'moveLeft':
        if (this.shop.buysItems) {
          this.tab = this.tab === 'buy' ? 'sell' : 'buy';
          this.selected = 0;
          this.quantity = 1;
          this.refresh();
        }
        return true;
      case 'right':
      case 'moveRight':
        if (this.shop.buysItems) {
          this.tab = this.tab === 'buy' ? 'sell' : 'buy';
          this.selected = 0;
          this.quantity = 1;
          this.refresh();
        }
        return true;
      case 'zoomIn':
      case 'nextItem':
        this.quantity = Math.min(this.maxQuantity(), this.quantity + 1);
        this.renderDetail();
        return true;
      case 'zoomOut':
      case 'prevItem':
        this.quantity = Math.max(1, this.quantity - 1);
        this.renderDetail();
        return true;
      case 'interact':
      case 'confirm':
        this.confirm();
        return true;
      case 'cancel':
        this.audio.playSfx('close');
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }

  private confirm(): void {
    const entry = this.entries[this.selected];
    if (!entry) return;
    const item = GameData.items.get(entry.itemId);
    const total = entry.price * this.quantity;

    if (this.tab === 'buy') {
      if (!this.ctx.player.canAfford(total)) {
        this.audio.playSfx('error');
        this.ctx.ui.toast('Dafuer reicht dein Geld nicht.', 'warn');
        return;
      }
      this.ctx.player.addMoney(-total);
      this.ctx.player.addItem(entry.itemId, this.quantity);
      this.audio.playSfx('money');
      this.ctx.ui.toast(`${item.name} x${this.quantity} gekauft.`, 'success');
    } else {
      if (!this.ctx.player.hasItem(entry.itemId, this.quantity)) {
        this.audio.playSfx('error');
        return;
      }
      this.ctx.player.removeItem(entry.itemId, this.quantity);
      this.ctx.player.addMoney(total);
      this.audio.playSfx('money');
      this.ctx.ui.toast(`${item.name} x${this.quantity} verkauft.`, 'success');
    }
    this.quantity = 1;
    this.refresh();
  }
}
