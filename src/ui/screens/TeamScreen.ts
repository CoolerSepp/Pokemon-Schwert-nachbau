import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import {
  creatureCard, creatureColor, expBar, hpBar, STAT_NAMES, statusChip,
  typeChip, MOVE_CATEGORY_NAMES, TYPE_COLORS,
} from '../uiHelpers';
import { GameData } from '@/data/GameData';
import { describeEvolution } from '@/creatures/Evolution';
import { STAT_KEYS } from '@/data/schema';
import type { Creature } from '@/creatures/Creature';

type Mode = 'list' | 'detail' | 'swap';

/**
 * Teamuebersicht mit Detailansicht, Umsortieren und Gegenstandseinsatz.
 */
export class TeamScreen implements Screen {
  readonly id = 'team';
  readonly modal = true;

  private root!: HTMLElement;
  private listNode!: HTMLElement;
  private detailNode!: HTMLElement;
  private footerNode!: HTMLElement;
  private selected = 0;
  private swapFrom = -1;
  private mode: Mode = 'list';
  /** Gesetzt, wenn der Bildschirm zur Zielauswahl fuer einen Gegenstand dient. */
  private pendingItem: string | null = null;

  constructor(private readonly ctx: MenuContext) {}

  /** Oeffnet den Bildschirm zur Auswahl eines Ziels fuer einen Gegenstand. */
  setPendingItem(itemId: string | null): void {
    this.pendingItem = itemId;
  }

  mount(_context: ScreenContext): HTMLElement {
    this.listNode = el('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '9px', minWidth: '320px' },
    });
    this.detailNode = el('div', { style: { flex: '1', minWidth: '0' } });
    this.footerNode = el('div', { className: 'menu-footer' });

    this.root = el('div', {
      className: 'menu-overlay',
      children: [
        el('div', {
          className: 'panel menu-panel',
          children: [
            el('div', {
              className: 'menu-header',
              children: [
                el('h2', { text: 'Team' }),
                el('div', { className: 'entry-sub', text: `${this.ctx.player.party.length}/6 Plaetze` }),
              ],
            }),
            el('div', {
              className: 'menu-body',
              style: { display: 'flex', gap: '18px' },
              children: [this.listNode, this.detailNode],
            }),
            this.footerNode,
          ],
        }),
      ],
    });
    this.refresh();
    return this.root;
  }

  onShow(): void {
    this.selected = Math.min(this.selected, Math.max(0, this.ctx.player.party.length - 1));
    this.mode = 'list';
    this.refresh();
  }

  private get current(): Creature | null {
    return this.ctx.player.party[this.selected] ?? null;
  }

  private refresh(): void {
    clearChildren(this.listNode);
    this.ctx.player.party.forEach((creature, index) => {
      const card = creatureCard(creature, {
        selected: index === this.selected,
        showExp: true,
        onClick: () => { this.selected = index; this.confirm(); },
      });
      if (index === this.swapFrom) card.style.outline = '2px dashed var(--ui-accent-2)';
      this.listNode.appendChild(card);
    });
    this.renderDetail();
    this.renderFooter();
  }

  private renderDetail(): void {
    clearChildren(this.detailNode);
    const creature = this.current;
    if (!creature) {
      this.detailNode.appendChild(el('div', {
        className: 'entry-sub', text: 'Dein Team ist leer.',
      }));
      return;
    }

    const species = creature.species;
    const nature = creature.nature;

    const statRows = STAT_KEYS.map((key) => {
      const label = creature.natureLabel(key);
      const value = creature.stats[key];
      return el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '5px' },
        children: [
          el('span', {
            text: STAT_NAMES[key],
            style: { width: '140px', fontSize: '12px', color: 'var(--ui-text-dim)' },
          }),
          el('span', {
            text: String(value),
            style: {
              width: '44px', fontWeight: '650',
              color: label === 'up' ? '#7fd88f' : label === 'down' ? '#e08f8f' : 'inherit',
            },
          }),
          el('div', {
            className: 'bar',
            style: { flex: '1' },
            children: [el('div', {
              className: 'bar-fill',
              style: {
                width: `${Math.min(100, (value / 255) * 100)}%`,
                background: 'linear-gradient(90deg, #4fa8e0, #7fc44b)',
              },
            })],
          }),
        ],
      });
    });

    const moveRows = creature.moves.map((slot) => {
      const move = GameData.moves.get(slot.moveId);
      return el('div', {
        style: {
          padding: '9px 12px', borderRadius: '9px',
          background: 'rgba(255,255,255,0.05)',
          borderLeft: `3px solid ${TYPE_COLORS[move.type]}`,
        },
        children: [
          el('div', {
            style: { display: 'flex', justifyContent: 'space-between', gap: '9px' },
            children: [
              el('span', { text: move.name, style: { fontWeight: '600' } }),
              el('span', {
                text: `${slot.pp}/${slot.maxPp} AP`,
                style: {
                  fontSize: '11px',
                  color: slot.pp === 0 ? 'var(--ui-danger)' : 'var(--ui-text-dim)',
                },
              }),
            ],
          }),
          el('div', {
            style: { marginTop: '4px', fontSize: '11px', color: 'var(--ui-text-dim)' },
            children: [
              typeChip(move.type),
              el('span', {
                text: `${MOVE_CATEGORY_NAMES[move.category]} · ${move.power > 0 ? `St. ${move.power}` : 'ohne Schaden'} · ${move.accuracy > 0 ? `Gen. ${move.accuracy}` : 'trifft immer'}`,
              }),
            ],
          }),
          el('div', {
            style: { marginTop: '4px', fontSize: '11px', color: 'var(--ui-text-dim)' },
            text: move.description,
          }),
        ],
        onClick: () => this.ctx.ui.toast(`${move.name}: ${move.description}`, 'info'),
      });
    });

    const evolution = species.evolutions.length > 0
      ? species.evolutions.map((e) => describeEvolution(e)).join(', ')
      : 'Entwickelt sich nicht weiter';

    const hp = hpBar(creature.hpFraction);

    this.detailNode.appendChild(el('div', {
      children: [
        el('div', {
          style: { display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '14px' },
          children: [
            el('div', {
              style: {
                width: '76px', height: '76px', borderRadius: '14px',
                background: creatureColor(creature),
                border: '2px solid rgba(255,255,255,0.25)',
              },
            }),
            el('div', {
              children: [
                el('div', {
                  style: { fontSize: '19px', fontWeight: '700' },
                  text: `${creature.name}${creature.isVariant ? ' ✦' : ''}`,
                }),
                el('div', {
                  className: 'entry-sub',
                  text: `Nr. ${species.dex} · ${species.name} · Lv. ${creature.level} · ${genderLabel(creature)}`,
                }),
                el('div', {
                  style: { marginTop: '6px' },
                  children: [...creature.types.map(typeChip), statusChip(creature.status)],
                }),
              ],
            }),
          ],
        }),
        hp.root,
        el('div', {
          className: 'hp-text',
          style: { marginBottom: '6px' },
          children: [
            el('span', { text: `${creature.currentHp} / ${creature.maxHp} KP` }),
            el('span', { text: `Nächstes Level in ${creature.expToNextLevel()} EP` }),
          ],
        }),
        expBar(creature.levelProgress()),
        el('div', {
          style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginTop: '16px' },
          children: [
            el('div', {
              children: [
                el('h3', { className: 'panel-title', text: 'Werte' }),
                ...statRows,
                el('div', {
                  className: 'entry-sub',
                  text: [
                    `Wesen: ${nature?.name ?? 'unbekannt'}`,
                    `Faehigkeit: ${GameData.abilities.tryGet(creature.ability)?.name ?? creature.ability}`,
                    `Zuneigung: ${creature.friendship}/255`,
                    `Getragen: ${creature.heldItem ? GameData.items.tryGet(creature.heldItem)?.name ?? '-' : 'nichts'}`,
                    `Groesse: ${creature.displayHeight} m, ${creature.displayWeight} kg`,
                    `Entwicklung: ${evolution}`,
                  ].join('\n'),
                  style: { whiteSpace: 'pre-wrap', marginTop: '9px', lineHeight: '1.6' },
                }),
              ],
            }),
            el('div', {
              children: [
                el('h3', { className: 'panel-title', text: 'Attacken' }),
                el('div', {
                  style: { display: 'flex', flexDirection: 'column', gap: '7px' },
                  children: moveRows,
                }),
              ],
            }),
          ],
        }),
      ],
    }));
  }

  private renderFooter(): void {
    clearChildren(this.footerNode);
    const hints = this.pendingItem
      ? ['E: Gegenstand einsetzen', 'Esc: Abbrechen']
      : this.mode === 'swap'
        ? ['E: Platz tauschen', 'Esc: Abbrechen']
        : ['W/S: Auswaehlen', 'E: Platz tauschen', 'Esc: Zurueck'];
    for (const hint of hints) this.footerNode.appendChild(el('span', { text: hint }));
    if (this.pendingItem) {
      const item = GameData.items.tryGet(this.pendingItem);
      this.footerNode.appendChild(el('span', {
        text: `Ausgewaehlt: ${item?.name ?? this.pendingItem}`,
        style: { color: 'var(--ui-accent)' },
      }));
    }
  }

  handleAction(action: GameAction): boolean {
    const size = this.ctx.player.party.length;
    if (size === 0 && action !== 'cancel') return true;

    switch (action) {
      case 'up':
      case 'moveForward':
        this.selected = (this.selected - 1 + size) % size;
        this.refresh();
        return true;
      case 'down':
      case 'moveBackward':
        this.selected = (this.selected + 1) % size;
        this.refresh();
        return true;
      case 'interact':
      case 'confirm':
        this.confirm();
        return true;
      case 'cancel':
        if (this.pendingItem) {
          this.pendingItem = null;
          this.ctx.ui.pop(this.id);
          return true;
        }
        if (this.mode === 'swap') {
          this.mode = 'list';
          this.swapFrom = -1;
          this.refresh();
          return true;
        }
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }

  private confirm(): void {
    const creature = this.current;
    if (!creature) return;

    if (this.pendingItem) {
      const message = this.ctx.useItem(this.pendingItem, creature);
      this.ctx.ui.toast(message, 'info');
      this.pendingItem = null;
      this.ctx.ui.pop(this.id);
      return;
    }

    if (this.mode === 'swap' && this.swapFrom >= 0) {
      this.ctx.player.swapPartySlots(this.swapFrom, this.selected);
      this.swapFrom = -1;
      this.mode = 'list';
      this.refresh();
      return;
    }
    this.mode = 'swap';
    this.swapFrom = this.selected;
    this.refresh();
  }
}

function genderLabel(creature: Creature): string {
  return creature.gender === 'male' ? 'maennlich'
    : creature.gender === 'female' ? 'weiblich' : 'geschlechtslos';
}
