import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { GameData } from '@/data/GameData';
import { typeChip, TYPE_NAMES } from '../uiHelpers';
import type { AudioManager } from '@/audio/AudioManager';
import { STAT_KEYS } from '@/data/schema';

/**
 * Auswahl des ersten Begleiters.
 *
 * Die Wahl ist endgueltig, deshalb wird sie bestaetigt und alle drei Arten
 * werden mit Typen, Staerken und Beschreibung vollstaendig gezeigt.
 */
export class StarterScreen implements Screen {
  readonly id = 'starter';
  readonly modal = true;

  private root!: HTMLElement;
  private cardsNode!: HTMLElement;
  private detailNode!: HTMLElement;
  private selected = 0;
  private confirming = false;

  constructor(
    private readonly ctx: MenuContext,
    private readonly audio: AudioManager,
    private readonly speciesIds: string[],
    private readonly onChosen: (speciesId: string) => void,
  ) {}

  mount(_context: ScreenContext): HTMLElement {
    this.cardsNode = el('div', {
      style: { display: 'flex', gap: '14px', justifyContent: 'center', marginBottom: '20px' },
    });
    this.detailNode = el('div', { style: { minHeight: '190px' } });

    this.root = el('div', {
      className: 'menu-overlay',
      children: [
        el('div', {
          className: 'panel menu-panel',
          style: { maxWidth: '840px' },
          children: [
            el('div', {
              className: 'menu-header',
              children: [
                el('h2', { text: 'Waehle deinen ersten Begleiter' }),
                el('div', { className: 'entry-sub', text: 'Diese Wahl ist endgueltig.' }),
              ],
            }),
            el('div', {
              className: 'menu-body',
              children: [this.cardsNode, this.detailNode],
            }),
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'A/D: Auswaehlen' }),
                el('span', { text: 'E: Bestaetigen' }),
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
    clearChildren(this.cardsNode);
    this.speciesIds.forEach((id, index) => {
      const species = GameData.species.tryGet(id);
      if (!species) return;
      this.cardsNode.appendChild(el('div', {
        className: `menu-entry${index === this.selected ? ' selected' : ''}`,
        style: {
          width: '200px', textAlign: 'center', padding: '20px 15px',
        },
        children: [
          el('div', {
            style: {
              width: '92px', height: '92px', margin: '0 auto 13px',
              borderRadius: '18px',
              background: species.model.palette.primary,
              border: '3px solid rgba(255,255,255,0.28)',
            },
          }),
          el('div', { className: 'entry-title', text: species.name }),
          el('div', { style: { marginTop: '7px' }, children: species.types.map(typeChip) }),
        ],
        onClick: () => { this.selected = index; this.confirm(); },
      }));
    });
    this.renderDetail();
  }

  private renderDetail(): void {
    clearChildren(this.detailNode);
    const species = GameData.species.tryGet(this.speciesIds[this.selected] ?? '');
    if (!species) return;
    const bst = STAT_KEYS.reduce((sum, k) => sum + species.baseStats[k], 0);
    const evolutions = species.evolutions.length > 0
      ? `Entwickelt sich weiter (${species.evolutions.length} Stufe${species.evolutions.length > 1 ? 'n' : ''})`
      : 'Entwickelt sich nicht';

    this.detailNode.appendChild(el('div', {
      style: { textAlign: 'center' },
      children: [
        el('div', {
          style: { fontSize: '19px', fontWeight: '700', marginBottom: '5px' },
          text: `${species.name} · ${species.category}`,
        }),
        el('div', {
          style: { lineHeight: '1.65', maxWidth: '620px', margin: '0 auto 15px' },
          text: species.dexEntry,
        }),
        el('div', {
          className: 'entry-sub',
          style: { lineHeight: '1.7' },
          text: [
            `Typ: ${species.types.map((t) => TYPE_NAMES[t]).join(' / ')}`,
            `Basiswertsumme: ${bst}`,
            `Groesse: ${species.heightM} m, ${species.weightKg} kg`,
            evolutions,
          ].join(' · '),
        }),
        this.confirming ? el('div', {
          style: {
            marginTop: '18px', fontSize: '16px',
            color: 'var(--ui-accent)', fontWeight: '650',
          },
          text: `${species.name} als Begleiter waehlen? E bestaetigen, Esc abbrechen.`,
        }) : null,
      ],
    }));
  }

  handleAction(action: GameAction): boolean {
    switch (action) {
      case 'left':
      case 'moveLeft':
      case 'up':
      case 'moveForward':
        this.selected = (this.selected - 1 + this.speciesIds.length) % this.speciesIds.length;
        this.confirming = false;
        this.audio.playSfx('select');
        this.render();
        return true;
      case 'right':
      case 'moveRight':
      case 'down':
      case 'moveBackward':
        this.selected = (this.selected + 1) % this.speciesIds.length;
        this.confirming = false;
        this.audio.playSfx('select');
        this.render();
        return true;
      case 'interact':
      case 'confirm':
        this.confirm();
        return true;
      case 'cancel':
        // Die Wahl ist verpflichtend - nur die Bestaetigung laesst sich zuruecknehmen.
        if (this.confirming) {
          this.confirming = false;
          this.render();
        }
        return true;
      default:
        return true;
    }
  }

  private confirm(): void {
    const speciesId = this.speciesIds[this.selected];
    if (!speciesId) return;
    if (!this.confirming) {
      this.confirming = true;
      this.audio.playSfx('select');
      this.render();
      return;
    }
    const species = GameData.species.tryGet(speciesId);
    if (species?.cry) this.audio.playCry(species.cry);
    this.ctx.ui.pop(this.id);
    this.onChosen(speciesId);
  }
}
