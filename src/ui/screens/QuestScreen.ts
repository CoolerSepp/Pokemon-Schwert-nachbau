import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { GameData } from '@/data/GameData';
import { formatMoney } from '../uiHelpers';
import type { QuestProgress } from '@/player/PlayerState';

/** Auftragsliste mit Schritten, Fortschritt und Belohnungen. */
export class QuestScreen implements Screen {
  readonly id = 'quests';
  readonly modal = true;

  private root!: HTMLElement;
  private listNode!: HTMLElement;
  private detailNode!: HTMLElement;
  private selected = 0;
  private entries: QuestProgress[] = [];

  constructor(private readonly ctx: MenuContext) {}

  mount(_context: ScreenContext): HTMLElement {
    this.listNode = el('div', {
      style: {
        display: 'flex', flexDirection: 'column', gap: '5px',
        minWidth: '300px', maxHeight: '58vh', overflowY: 'auto',
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
              children: [el('h2', { text: 'Auftraege' })],
            }),
            el('div', {
              className: 'menu-body',
              style: { display: 'flex', gap: '18px' },
              children: [this.listNode, this.detailNode],
            }),
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'W/S: Auswaehlen' }),
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

  onShow(): void { this.refresh(); }

  private refresh(): void {
    // Offene zuerst, danach abgeschlossene.
    this.entries = [...this.ctx.player.quests].sort(
      (a, b) => Number(a.completed) - Number(b.completed),
    );
    this.selected = Math.max(0, Math.min(this.selected, this.entries.length - 1));

    clearChildren(this.listNode);
    if (this.entries.length === 0) {
      this.listNode.appendChild(el('div', {
        className: 'entry-sub', text: 'Noch keine Auftraege erhalten.',
      }));
    }
    this.entries.forEach((progress, index) => {
      const quest = GameData.quests.tryGet(progress.questId);
      if (!quest) return;
      this.listNode.appendChild(el('div', {
        className: `menu-entry${index === this.selected ? ' selected' : ''}`,
        style: { padding: '10px 13px', opacity: progress.completed ? '0.55' : '1' },
        children: [
          el('div', {
            className: 'entry-title',
            text: `${quest.kind === 'main' ? '◆' : '◇'} ${quest.name}`,
          }),
          el('div', {
            className: 'entry-sub',
            text: progress.completed
              ? 'Abgeschlossen'
              : quest.steps[progress.stepIndex]?.description ?? quest.description,
          }),
        ],
        onClick: () => { this.selected = index; this.refresh(); },
      }));
    });
    this.renderDetail();
  }

  private renderDetail(): void {
    clearChildren(this.detailNode);
    const progress = this.entries[this.selected];
    if (!progress) return;
    const quest = GameData.quests.tryGet(progress.questId);
    if (!quest) return;

    const steps = quest.steps.map((step, index) => {
      const done = progress.completed || index < progress.stepIndex;
      const active = !progress.completed && index === progress.stepIndex;
      return el('div', {
        style: {
          display: 'flex', gap: '10px', alignItems: 'flex-start',
          padding: '7px 0', opacity: done ? '0.6' : '1',
        },
        children: [
          el('span', {
            text: done ? '✓' : active ? '▶' : '○',
            style: {
              color: done ? 'var(--ui-accent)' : active ? 'var(--ui-accent-2)' : 'var(--ui-text-dim)',
              width: '16px', flexShrink: '0',
            },
          }),
          el('span', {
            text: step.description,
            style: {
              textDecoration: done ? 'line-through' : 'none',
              fontWeight: active ? '600' : '400',
            },
          }),
        ],
      });
    });

    const rewards: string[] = [];
    if (quest.rewards?.money) rewards.push(formatMoney(quest.rewards.money));
    for (const r of quest.rewards?.items ?? []) {
      rewards.push(`${GameData.items.tryGet(r.item)?.name ?? r.item} x${r.quantity}`);
    }
    if (quest.rewards?.exp) rewards.push(`${quest.rewards.exp} EP`);

    this.detailNode.appendChild(el('div', {
      children: [
        el('div', { style: { fontSize: '18px', fontWeight: '700' }, text: quest.name }),
        el('div', {
          className: 'entry-sub',
          style: { marginBottom: '14px' },
          text: `${quest.kind === 'main' ? 'Hauptauftrag' : 'Nebenauftrag'}${quest.giver ? ` · von ${quest.giver}` : ''}`,
        }),
        el('div', { style: { lineHeight: '1.65', marginBottom: '16px' }, text: quest.description }),
        el('h3', { className: 'panel-title', text: 'Schritte' }),
        el('div', { children: steps }),
        rewards.length > 0 ? el('div', {
          style: { marginTop: '16px' },
          children: [
            el('h3', { className: 'panel-title', text: 'Belohnung' }),
            el('div', { className: 'entry-sub', text: rewards.join(' · ') }),
          ],
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
          this.refresh();
        }
        return true;
      case 'down':
      case 'moveBackward':
        if (this.entries.length > 0) {
          this.selected = (this.selected + 1) % this.entries.length;
          this.refresh();
        }
        return true;
      case 'cancel':
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }
}
