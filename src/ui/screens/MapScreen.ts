import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { GameData } from '@/data/GameData';
import type { AreaData } from '@/data/schema';
import { drawRegionMap, type MapNode } from '../RegionMap';

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
  private canvas!: HTMLCanvasElement;
  private infoNode!: HTMLElement;
  private selected = 0;
  /** Alle Orte der Karte - auch unbesuchte, diese als Schemen. */
  private places: AreaData[] = [];
  /** Nur besuchte Orte; nur sie lassen sich anwaehlen. */
  private known: AreaData[] = [];
  private lastSize = { width: 0, height: 0 };

  constructor(private readonly ctx: MenuContext) {}

  mount(_context: ScreenContext): HTMLElement {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'pointer';
    this.canvas.addEventListener('click', (event) => this.pickAt(event));

    this.canvasNode = el('div', {
      style: {
        position: 'relative', flex: '1', minHeight: '420px',
        borderRadius: '12px', border: '1px solid var(--ui-border)',
        overflow: 'hidden',
      },
      children: [this.canvas],
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
                el('span', { text: 'Klick: Ort auf der Karte' }),
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

  update(): void {
    // Bei Groessenaenderung des Fensters neu zeichnen.
    const width = this.canvasNode.clientWidth;
    const height = this.canvasNode.clientHeight;
    if (width !== this.lastSize.width || height !== this.lastSize.height) this.draw();
  }

  private refresh(): void {
    const player = this.ctx.player;
    // Alle Aussengebiete mit Kartenposition; unbesuchte bleiben als Schemen
    // sichtbar, damit die Form der Region erkennbar ist.
    this.places = GameData.areas
      .filter((a) => a.mapPos !== undefined && !a.indoor)
      .sort((a, b) => (b.mapPos![1] - a.mapPos![1]) || a.name.localeCompare(b.name));
    this.known = this.places.filter((a) => player.visitedAreas.has(a.id));

    if (this.known.length === 0) {
      this.selected = 0;
    } else {
      this.selected = Math.min(this.selected, this.known.length - 1);
    }
    this.draw();
    this.renderInfo();
  }

  /** Zeichnet die Karte in der aktuellen Groesse des Bereichs. */
  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = this.canvasNode.clientWidth || 640;
    const height = this.canvasNode.clientHeight || 420;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const currentId = this.ctx.currentAreaId();
    const selectedId = this.known[this.selected]?.id;
    const nodes: MapNode[] = this.places.map((area) => ({
      area,
      x: Math.max(6, Math.min(94, area.mapPos![0])),
      y: Math.max(7, Math.min(92, area.mapPos![1])),
      visited: this.ctx.player.visitedAreas.has(area.id),
      current: area.id === currentId,
      selected: area.id === selectedId,
      gym: GameData.gyms.all().some((g) => g.city === area.id),
      dens: area.raidDens?.length ?? 0,
    }));
    drawRegionMap(ctx, width, height, nodes);
    this.lastSize = { width, height };
  }

  /** Klick auf der Karte waehlt den naechstgelegenen besuchten Ort. */
  private pickAt(event: MouseEvent): void {
    if (this.known.length === 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    let bestIndex = -1;
    let bestDist = 8;
    this.known.forEach((area, index) => {
      const dist = Math.hypot(area.mapPos![0] - x, area.mapPos![1] - y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      this.selected = bestIndex;
      this.refresh();
    }
  }

  private renderInfo(): void {
    clearChildren(this.infoNode);
    const area = this.known[this.selected];
    if (!area) {
      this.infoNode.appendChild(el('div', {
        className: 'entry-sub',
        text: 'Noch keine Orte entdeckt. Geh hinaus und erkunde die Region.',
      }));
      return;
    }
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
    const area = this.known[this.selected];
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
      case 'left':
      case 'moveLeft':
        if (this.known.length > 0) {
          this.selected = (this.selected - 1 + this.known.length) % this.known.length;
          this.refresh();
        }
        return true;
      case 'down':
      case 'moveBackward':
      case 'right':
      case 'moveRight':
        if (this.known.length > 0) {
          this.selected = (this.selected + 1) % this.known.length;
          this.refresh();
        }
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
