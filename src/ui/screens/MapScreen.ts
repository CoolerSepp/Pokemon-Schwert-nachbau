import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { GameData } from '@/data/GameData';
import type { AreaData } from '@/data/schema';

const KIND_COLORS: Record<string, string> = {
  town: '#7fc44b', city: '#4fa8e0', route: '#d8c98f', cave: '#7a6b5f',
  forest: '#4f8a42', lake: '#3f8fc4', mountain: '#9b9384', snow: '#dfe9f2',
  industrial: '#8f8f8a', ruins: '#a89f88', lab: '#8fc4e0', stadium: '#e0a84b',
  wildarea: '#9bd85b', league: '#ffd76b', endgame: '#c46bd8', home: '#e0a8a8',
  interior: '#6b6b76',
};

/**
 * Weltkarte mit Spielerposition, besuchten Orten und Schnellreise.
 *
 * Nur tatsaechlich besuchte Orte sind sichtbar und anwaehlbar - das haelt die
 * Karte ehrlich und macht Erkundung bedeutsam.
 */
export class MapScreen implements Screen {
  readonly id = 'map';
  readonly modal = true;

  private root!: HTMLElement;
  private canvasNode!: HTMLElement;
  private infoNode!: HTMLElement;
  private zoom = 1;
  private selected = 0;
  private places: AreaData[] = [];

  constructor(private readonly ctx: MenuContext) {}

  mount(_context: ScreenContext): HTMLElement {
    this.canvasNode = el('div', {
      style: {
        position: 'relative', flex: '1', minHeight: '380px',
        background: 'linear-gradient(160deg, #1a2634 0%, #16202c 100%)',
        borderRadius: '12px', border: '1px solid var(--ui-border)',
        overflow: 'hidden',
      },
    });
    this.infoNode = el('div', { style: { width: '260px', flexShrink: '0' } });

    this.root = el('div', {
      className: 'menu-overlay',
      children: [
        el('div', {
          className: 'panel menu-panel',
          children: [
            el('div', {
              className: 'menu-header',
              children: [
                el('h2', { text: 'Region Aetheria' }),
                el('div', {
                  className: 'entry-sub',
                  text: `Besucht: ${this.ctx.player.visitedAreas.size} Orte`,
                }),
              ],
            }),
            el('div', {
              className: 'menu-body',
              style: { display: 'flex', gap: '18px' },
              children: [this.canvasNode, this.infoNode],
            }),
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'W/S: Ort waehlen' }),
                el('span', { text: '+/-: Zoom' }),
                el('span', { text: 'E: Schnellreise' }),
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
    const player = this.ctx.player;
    this.places = GameData.areas
      .filter((a) => a.mapPos !== undefined && !a.indoor && player.visitedAreas.has(a.id))
      .sort((a, b) => (b.mapPos![1] - a.mapPos![1]) || a.name.localeCompare(b.name));

    if (this.places.length === 0) {
      clearChildren(this.canvasNode);
      this.canvasNode.appendChild(el('div', {
        className: 'entry-sub',
        style: { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center' },
        text: 'Noch keine Orte entdeckt.',
      }));
      clearChildren(this.infoNode);
      return;
    }
    this.selected = Math.min(this.selected, this.places.length - 1);

    clearChildren(this.canvasNode);
    const currentId = this.ctx.currentAreaId();

    // Verbindungen zwischen besuchten Orten zeichnen.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.pointerEvents = 'none';
    for (const area of this.places) {
      for (const conn of area.connections) {
        const target = this.places.find((p) => p.id === conn.to);
        if (!target || target.mapPos![1] > area.mapPos![1]) continue;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', `${this.mapX(area)}%`);
        line.setAttribute('y1', `${this.mapY(area)}%`);
        line.setAttribute('x2', `${this.mapX(target)}%`);
        line.setAttribute('y2', `${this.mapY(target)}%`);
        line.setAttribute('stroke', 'rgba(255,255,255,0.22)');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '5 4');
        svg.appendChild(line);
      }
    }
    this.canvasNode.appendChild(svg);

    this.places.forEach((area, index) => {
      const isCurrent = area.id === currentId;
      const isSelected = index === this.selected;
      const size = (isCurrent ? 18 : 13) * this.zoom;
      const marker = el('div', {
        style: {
          position: 'absolute',
          left: `${this.mapX(area)}%`,
          top: `${this.mapY(area)}%`,
          transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
          cursor: 'pointer',
        },
        children: [
          el('div', {
            style: {
              width: `${size}px`, height: `${size}px`, borderRadius: '50%',
              background: KIND_COLORS[area.kind] ?? '#8f8f8f',
              border: isSelected ? '3px solid #fff' : '2px solid rgba(0,0,0,0.45)',
              boxShadow: isCurrent ? '0 0 14px rgba(127,196,75,0.85)' : 'none',
            },
          }),
          el('div', {
            text: area.name,
            style: {
              fontSize: `${Math.max(9, 11 * this.zoom)}px`,
              color: isSelected ? '#fff' : 'var(--ui-text-dim)',
              textShadow: '0 1px 3px rgba(0,0,0,0.85)',
              whiteSpace: 'nowrap',
            },
          }),
        ],
        onClick: () => { this.selected = index; this.refresh(); },
      });
      this.canvasNode.appendChild(marker);
    });

    this.renderInfo();
  }

  private mapX(area: AreaData): number {
    return Math.max(4, Math.min(96, area.mapPos![0]));
  }

  private mapY(area: AreaData): number {
    return Math.max(6, Math.min(94, area.mapPos![1]));
  }

  private renderInfo(): void {
    clearChildren(this.infoNode);
    const area = this.places[this.selected];
    if (!area) return;
    const isCurrent = area.id === this.ctx.currentAreaId();
    const canTravel = this.ctx.canFastTravel() && !isCurrent;

    this.infoNode.appendChild(el('div', {
      children: [
        el('div', { style: { fontSize: '17px', fontWeight: '700' }, text: area.name }),
        el('div', {
          className: 'entry-sub',
          style: { marginBottom: '11px' },
          text: isCurrent ? 'Du bist hier.' : area.description ?? '',
        }),
        el('div', {
          className: 'entry-sub',
          style: { whiteSpace: 'pre-wrap', lineHeight: '1.7' },
          text: [
            `Art: ${area.kind}`,
            `Biom: ${area.biome}`,
            area.spawnTable?.length
              ? `Wilde Kreaturen: ${area.spawnTable.length} Arten`
              : 'Keine wilden Kreaturen',
          ].join('\n'),
        }),
        el('div', {
          className: 'choice',
          style: {
            marginTop: '15px', textAlign: 'center',
            opacity: canTravel ? '1' : '0.4',
            cursor: canTravel ? 'pointer' : 'not-allowed',
          },
          text: isCurrent ? 'Aktueller Ort'
            : canTravel ? 'Hierher reisen'
            : 'Schnellreise noch nicht verfuegbar',
          onClick: () => this.travel(),
        }),
      ],
    }));
  }

  private travel(): void {
    const area = this.places[this.selected];
    if (!area) return;
    if (area.id === this.ctx.currentAreaId()) {
      this.ctx.ui.toast('Du bist bereits hier.', 'info');
      return;
    }
    if (!this.ctx.canFastTravel()) {
      this.ctx.ui.toast('Du brauchst erst ein Flugticket.', 'warn');
      return;
    }
    if (this.ctx.fastTravel(area.id)) {
      this.ctx.ui.popAll();
      this.ctx.ui.toast(`Angekommen in ${area.name}.`, 'success');
    } else {
      this.ctx.ui.toast('Diese Reise ist nicht moeglich.', 'warn');
    }
  }

  handleAction(action: GameAction): boolean {
    switch (action) {
      case 'up':
      case 'moveForward':
        if (this.places.length > 0) {
          this.selected = (this.selected - 1 + this.places.length) % this.places.length;
          this.refresh();
        }
        return true;
      case 'down':
      case 'moveBackward':
        if (this.places.length > 0) {
          this.selected = (this.selected + 1) % this.places.length;
          this.refresh();
        }
        return true;
      case 'zoomIn':
        this.zoom = Math.min(2.2, this.zoom + 0.2);
        this.refresh();
        return true;
      case 'zoomOut':
        this.zoom = Math.max(0.6, this.zoom - 0.2);
        this.refresh();
        return true;
      case 'interact':
      case 'confirm':
        this.travel();
        return true;
      case 'cancel':
      case 'map':
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }
}
