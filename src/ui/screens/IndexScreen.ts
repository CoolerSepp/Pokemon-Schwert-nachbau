import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { TYPE_NAMES, typeChip } from '../uiHelpers';
import { GameData } from '@/data/GameData';
import { describeEvolution, evolutionLine } from '@/creatures/Evolution';
import { STAT_KEYS, type SpeciesData } from '@/data/schema';

/**
 * Kreaturenbuch: gesehen/gefangen, Beschreibung, Fundorte, Entwicklung.
 *
 * Nicht gesehene Arten erscheinen als Platzhalter, gesehene mit Silhouette
 * und Grunddaten, gefangene vollstaendig.
 */
export class IndexScreen implements Screen {
  readonly id = 'index';
  readonly modal = true;

  private root!: HTMLElement;
  private listNode!: HTMLElement;
  private detailNode!: HTMLElement;
  private headerInfo!: HTMLElement;
  private selected = 0;
  private entries: SpeciesData[] = [];

  constructor(private readonly ctx: MenuContext) {}

  mount(_context: ScreenContext): HTMLElement {
    this.listNode = el('div', {
      style: {
        display: 'flex', flexDirection: 'column', gap: '3px',
        minWidth: '270px', maxHeight: '60vh', overflowY: 'auto',
      },
    });
    this.detailNode = el('div', { style: { flex: '1', minWidth: '0' } });
    this.headerInfo = el('div', { className: 'entry-sub' });

    this.root = el('div', {
      className: 'menu-overlay',
      children: [
        el('div', {
          className: 'panel menu-panel',
          children: [
            el('div', {
              className: 'menu-header',
              children: [el('h2', { text: 'Kreaturenbuch' }), this.headerInfo],
            }),
            el('div', {
              className: 'menu-body',
              style: { display: 'flex', gap: '18px' },
              children: [this.listNode, this.detailNode],
            }),
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'W/S: Blaettern' }),
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

  private refresh(): void {
    this.entries = [...GameData.getDexOrder()];
    const player = this.ctx.player;
    this.headerInfo.textContent =
      `${player.caughtSpecies.size} gefangen · ${player.seenSpecies.size} gesehen · ${this.entries.length} bekannt`;

    clearChildren(this.listNode);
    this.entries.forEach((species, index) => {
      const caught = player.caughtSpecies.has(species.id);
      const seen = player.seenSpecies.has(species.id);
      this.listNode.appendChild(el('div', {
        className: `menu-entry${index === this.selected ? ' selected' : ''}`,
        style: {
          padding: '7px 11px', display: 'flex', gap: '9px', alignItems: 'center',
          opacity: seen ? '1' : '0.4',
        },
        children: [
          el('span', {
            text: String(species.dex).padStart(3, '0'),
            style: { color: 'var(--ui-text-dim)', fontSize: '11px', width: '30px' },
          }),
          el('div', {
            style: {
              width: '14px', height: '14px', borderRadius: '50%',
              background: seen ? species.model.palette.primary : '#3a3f47',
            },
          }),
          el('span', { text: seen ? species.name : '???', style: { flex: '1' } }),
          caught ? el('span', { text: '●', style: { color: 'var(--ui-accent)' } }) : null,
        ],
        onClick: () => { this.selected = index; this.refresh(); },
      }));
    });

    // Ausgewaehlten Eintrag in den Sichtbereich holen.
    const node = this.listNode.children[this.selected] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
    this.renderDetail();
  }

  private renderDetail(): void {
    clearChildren(this.detailNode);
    const species = this.entries[this.selected];
    if (!species) return;
    const player = this.ctx.player;
    const seen = player.seenSpecies.has(species.id);
    const caught = player.caughtSpecies.has(species.id);

    if (!seen) {
      this.detailNode.appendChild(el('div', {
        className: 'entry-sub',
        text: 'Diese Kreatur wurde noch nicht gesichtet.',
      }));
      return;
    }

    const line = evolutionLine(species.id).map((id) => {
      const s = GameData.species.tryGet(id);
      return s ? (player.seenSpecies.has(id) ? s.name : '???') : id;
    }).join(' → ');

    const bst = STAT_KEYS.reduce((sum, k) => sum + species.baseStats[k], 0);

    this.detailNode.appendChild(el('div', {
      children: [
        el('div', {
          style: { display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '14px' },
          children: [
            el('div', {
              style: {
                width: '84px', height: '84px', borderRadius: '15px',
                background: caught ? species.model.palette.primary : '#2b3038',
                border: '2px solid rgba(255,255,255,0.2)',
              },
            }),
            el('div', {
              children: [
                el('div', {
                  style: { fontSize: '20px', fontWeight: '700' },
                  text: `Nr. ${String(species.dex).padStart(3, '0')} ${species.name}`,
                }),
                el('div', { className: 'entry-sub', text: species.category }),
                el('div', {
                  style: { marginTop: '6px' },
                  children: species.types.map(typeChip),
                }),
              ],
            }),
          ],
        }),
        el('div', {
          style: { lineHeight: '1.65', marginBottom: '15px' },
          text: caught ? species.dexEntry : 'Weitere Angaben erscheinen nach dem Fang.',
        }),
        el('div', {
          style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' },
          children: [
            el('div', {
              children: [
                el('h3', { className: 'panel-title', text: 'Steckbrief' }),
                el('div', {
                  className: 'entry-sub',
                  style: { whiteSpace: 'pre-wrap', lineHeight: '1.75' },
                  text: [
                    `Groesse: ${species.heightM} m`,
                    `Gewicht: ${species.weightKg} kg`,
                    `Typen: ${species.types.map((t) => TYPE_NAMES[t]).join(' / ')}`,
                    caught ? `Basiswertsumme: ${bst}` : 'Basiswertsumme: ???',
                    caught ? `Fangrate: ${species.captureRate}` : 'Fangrate: ???',
                    `Gigantifizierbar: ${species.canGigantic ? 'ja' : 'nein'}`,
                    `Lebensraum: ${species.habitat.join(', ')}`,
                  ].join('\n'),
                }),
              ],
            }),
            el('div', {
              children: [
                el('h3', { className: 'panel-title', text: 'Entwicklungsreihe' }),
                el('div', { className: 'entry-sub', style: { lineHeight: '1.7' }, text: line }),
                species.evolutions.length > 0 ? el('div', {
                  className: 'entry-sub',
                  style: { marginTop: '9px', lineHeight: '1.7' },
                  text: species.evolutions.map(describeEvolution).join('\n'),
                }) : null,
                el('h3', {
                  className: 'panel-title',
                  style: { marginTop: '15px' },
                  text: 'Fundorte',
                }),
                el('div', {
                  className: 'entry-sub',
                  style: { lineHeight: '1.7' },
                  text: this.findHabitats(species.id),
                }),
              ],
            }),
          ],
        }),
      ],
    }));
  }

  /** Sucht alle besuchten Gebiete, in denen diese Art vorkommt. */
  private findHabitats(speciesId: string): string {
    const places: string[] = [];
    for (const area of GameData.areas.all()) {
      if (!area.spawnTable?.some((e) => e.species === speciesId)) continue;
      if (!this.ctx.player.visitedAreas.has(area.id)) continue;
      places.push(area.name);
    }
    return places.length > 0 ? places.join(', ') : 'Noch keine Fundorte bekannt.';
  }

  handleAction(action: GameAction): boolean {
    switch (action) {
      case 'up':
      case 'moveForward':
        this.selected = (this.selected - 1 + this.entries.length) % this.entries.length;
        this.refresh();
        return true;
      case 'down':
      case 'moveBackward':
        this.selected = (this.selected + 1) % this.entries.length;
        this.refresh();
        return true;
      case 'left':
      case 'moveLeft':
        this.selected = Math.max(0, this.selected - 10);
        this.refresh();
        return true;
      case 'right':
      case 'moveRight':
        this.selected = Math.min(this.entries.length - 1, this.selected + 10);
        this.refresh();
        return true;
      case 'cancel':
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }
}
