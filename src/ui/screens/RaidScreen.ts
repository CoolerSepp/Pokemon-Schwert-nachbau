import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { GameData } from '@/data/GameData';
import { typeChip, TYPE_NAMES } from '../uiHelpers';
import type { AudioManager } from '@/audio/AudioManager';
import type { DenState } from '@/raids/RaidManager';

export interface RaidBriefing {
  den: DenState;
  bossSpecies: string;
  bossLevel: number;
  gigantic: boolean;
  allyNames: string[];
  shields: number;
  turnLimit: number;
  rewards: string[];
  /** Passt die Stufe zum Fortschritt des Spielers? */
  warning: string | null;
}

/**
 * Ansicht eines Energiepunktes vor dem Raid.
 *
 * Zeigt Stufe, Boss, Verbuendete, Schilde und Rundenlimit - der Spieler
 * entscheidet danach, ob er den Kampf beginnt.
 */
export class RaidScreen implements Screen {
  readonly id = 'raid';
  readonly modal = true;

  private root!: HTMLElement;
  private bodyNode!: HTMLElement;
  private briefing: RaidBriefing | null = null;
  private selected = 0;

  constructor(
    private readonly ctx: MenuContext,
    private readonly audio: AudioManager,
    private readonly onStart: (den: DenState) => void,
  ) {}

  setBriefing(briefing: RaidBriefing): void {
    this.briefing = briefing;
    this.selected = 0;
    if (this.bodyNode) this.render();
  }

  mount(_context: ScreenContext): HTMLElement {
    this.bodyNode = el('div', { className: 'menu-body' });
    this.root = el('div', {
      className: 'menu-overlay',
      children: [
        el('div', {
          className: 'panel menu-panel',
          style: { maxWidth: '660px' },
          children: [
            el('div', {
              className: 'menu-header',
              children: [
                el('h2', { text: 'Energiepunkt' }),
                el('div', { className: 'entry-sub', text: 'Ein Raid-Kampf gegen einen uebermaechtigen Gegner.' }),
              ],
            }),
            this.bodyNode,
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'W/S: Auswaehlen' }),
                el('span', { text: 'E: Bestaetigen' }),
                el('span', { text: 'Esc: Zurueck' }),
              ],
            }),
          ],
        }),
      ],
    });
    this.render();
    return this.root;
  }

  private render(): void {
    clearChildren(this.bodyNode);
    const b = this.briefing;
    if (!b) {
      this.bodyNode.appendChild(el('div', { text: 'Dieser Energiepunkt ist erloschen.' }));
      return;
    }
    const species = GameData.species.tryGet(b.bossSpecies);
    const stars = '★'.repeat(b.den.tier) + '☆'.repeat(Math.max(0, 5 - b.den.tier));

    this.bodyNode.appendChild(el('div', {
      style: { display: 'flex', gap: '18px', alignItems: 'center', marginBottom: '14px' },
      children: [
        el('div', {
          style: {
            width: '96px', height: '96px', borderRadius: '18px', flexShrink: '0',
            background: species?.model.palette.primary ?? '#555',
            border: '3px solid rgba(255,255,255,0.3)',
          },
        }),
        el('div', {
          children: [
            el('div', { className: 'entry-title', text: `${species?.name ?? 'Unbekannt'} · Lv. ${b.bossLevel}` }),
            el('div', { style: { margin: '6px 0' }, children: (species?.types ?? []).map(typeChip) }),
            el('div', { className: 'entry-sub', text: `Stufe ${b.den.tier} ${stars}` }),
            b.gigantic
              ? el('div', {
                style: { color: 'var(--ui-accent)', fontWeight: '650', marginTop: '4px' },
                text: 'Dieser Gegner ist gigantifiziert.',
              })
              : null,
          ],
        }),
      ],
    }));

    this.bodyNode.appendChild(el('div', {
      className: 'entry-sub',
      style: { lineHeight: '1.8', marginBottom: '12px', whiteSpace: 'pre-line' },
      text: [
        `Typ: ${(species?.types ?? []).map((t) => TYPE_NAMES[t]).join(' / ')}`,
        `Schilde: ${b.shields}`,
        `Rundenlimit: ${b.turnLimit}`,
        `Verbuendete: ${b.allyNames.join(', ')}`,
        `Moegliche Beute: ${b.rewards.join(', ')}`,
      ].join('\n'),
    }));

    if (b.warning) {
      this.bodyNode.appendChild(el('div', {
        style: { color: '#ffb454', marginBottom: '10px', fontWeight: '650' },
        text: b.warning,
      }));
    }

    const options = this.options();
    options.forEach((option, index) => {
      this.bodyNode.appendChild(el('div', {
        className: `menu-entry${index === this.selected ? ' selected' : ''}`,
        children: [el('div', { className: 'entry-title', text: option.label })],
        onClick: () => { this.selected = index; this.activate(); },
      }));
    });
  }

  private options(): { label: string; run: () => void }[] {
    const b = this.briefing;
    const out: { label: string; run: () => void }[] = [];
    if (b && !b.den.cleared && b.den.active) {
      out.push({
        label: 'Raid beginnen',
        run: () => {
          this.ctx.ui.pop(this.id);
          this.onStart(b.den);
        },
      });
    }
    out.push({ label: 'Zurueck', run: () => this.ctx.ui.pop(this.id) });
    return out;
  }

  handleAction(action: GameAction): boolean {
    const options = this.options();
    switch (action) {
      case 'up':
      case 'moveForward':
        this.selected = (this.selected - 1 + options.length) % options.length;
        this.audio.playSfx('select');
        this.render();
        return true;
      case 'down':
      case 'moveBackward':
        this.selected = (this.selected + 1) % options.length;
        this.audio.playSfx('select');
        this.render();
        return true;
      case 'interact':
      case 'confirm':
        this.activate();
        return true;
      case 'cancel':
        this.audio.playSfx('cancel');
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }

  private activate(): void {
    const option = this.options()[this.selected];
    if (!option) return;
    this.audio.playSfx('confirm');
    option.run();
  }
}
