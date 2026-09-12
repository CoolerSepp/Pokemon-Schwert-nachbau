import type { Screen, ScreenContext } from '../UIManager';
import { el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { formatMoney } from '../uiHelpers';

interface MenuEntry {
  id: string;
  title: string;
  sub: () => string;
  screen?: string;
  action?: () => void;
  enabled: () => boolean;
}

/**
 * Hauptmenue mit Tastatur- und Mausbedienung.
 *
 * Jeder Eintrag fuehrt zu einem tatsaechlich implementierten Bildschirm;
 * nicht verfuegbare Punkte werden ausgegraut und begruendet.
 */
export class MainMenuScreen implements Screen {
  readonly id = 'mainMenu';
  readonly modal = true;

  private root!: HTMLElement;
  private grid!: HTMLElement;
  private selected = 0;
  private entries: MenuEntry[] = [];
  private nodes: HTMLElement[] = [];

  constructor(private readonly ctx: MenuContext) {}

  mount(_context: ScreenContext): HTMLElement {
    this.entries = [
      {
        id: 'team', title: 'Team', screen: 'team',
        sub: () => `${this.ctx.player.party.length} Kreaturen`,
        enabled: () => this.ctx.player.party.length > 0,
      },
      {
        id: 'bag', title: 'Beutel', screen: 'bag',
        sub: () => `${this.ctx.player.allItems().length} Gegenstaende`,
        enabled: () => true,
      },
      {
        id: 'index', title: 'Kreaturenbuch', screen: 'index',
        sub: () => `${this.ctx.player.caughtSpecies.size} gefangen, ${this.ctx.player.seenSpecies.size} gesehen`,
        enabled: () => this.ctx.player.hasItem('kreaturenindex') || this.ctx.player.seenSpecies.size > 0,
      },
      {
        id: 'map', title: 'Karte', screen: 'map',
        sub: () => this.ctx.areaName(this.ctx.currentAreaId()),
        enabled: () => true,
      },
      {
        id: 'quests', title: 'Auftraege', screen: 'quests',
        sub: () => `${this.ctx.player.activeQuests.length} offen`,
        enabled: () => true,
      },
      {
        id: 'camp', title: 'Lager', action: () => this.ctx.openCamp(),
        sub: () => this.ctx.player.hasItem('campkoffer')
          ? 'Zeit mit dem Team verbringen' : 'Campkoffer fehlt',
        enabled: () => this.ctx.player.hasItem('campkoffer') && this.ctx.player.party.length > 0,
      },
      {
        id: 'save', title: 'Speichern', screen: 'save',
        sub: () => `Spielzeit ${this.ctx.player.formatPlaytime()}`,
        enabled: () => true,
      },
      {
        id: 'options', title: 'Optionen', screen: 'options',
        sub: () => 'Ton, Grafik, Steuerung',
        enabled: () => true,
      },
    ];

    this.grid = el('div', { className: 'menu-grid' });
    this.nodes = this.entries.map((entry, index) => {
      const node = el('div', {
        className: 'menu-entry',
        children: [
          el('div', { className: 'entry-title', text: entry.title }),
          el('div', { className: 'entry-sub', text: entry.sub() }),
        ],
        onClick: () => {
          this.selected = index;
          this.activate();
        },
      });
      this.grid.appendChild(node);
      return node;
    });

    this.root = el('div', {
      className: 'menu-overlay',
      children: [
        el('div', {
          className: 'panel menu-panel',
          children: [
            el('div', {
              className: 'menu-header',
              children: [
                el('h2', { text: 'Menue' }),
                el('div', {
                  className: 'entry-sub',
                  text: `${this.ctx.player.name} · ${formatMoney(this.ctx.player.money)} · ${this.ctx.player.badgeCount}/8 Orden`,
                }),
              ],
            }),
            el('div', { className: 'menu-body', children: [this.grid] }),
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'WASD / Pfeile: Auswaehlen' }),
                el('span', { text: 'E / Enter: Oeffnen' }),
                el('span', { text: 'Esc: Schliessen' }),
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
    this.entries.forEach((entry, index) => {
      const node = this.nodes[index]!;
      const enabled = entry.enabled();
      node.classList.toggle('selected', index === this.selected);
      node.style.opacity = enabled ? '1' : '0.45';
      node.style.cursor = enabled ? 'pointer' : 'not-allowed';
      const sub = node.querySelector('.entry-sub');
      if (sub) sub.textContent = entry.sub();
    });
  }

  handleAction(action: GameAction): boolean {
    const columns = 2;
    switch (action) {
      case 'up':
      case 'moveForward':
        this.selected = (this.selected - columns + this.entries.length) % this.entries.length;
        this.refresh();
        return true;
      case 'down':
      case 'moveBackward':
        this.selected = (this.selected + columns) % this.entries.length;
        this.refresh();
        return true;
      case 'left':
      case 'moveLeft':
        this.selected = (this.selected - 1 + this.entries.length) % this.entries.length;
        this.refresh();
        return true;
      case 'right':
      case 'moveRight':
        this.selected = (this.selected + 1) % this.entries.length;
        this.refresh();
        return true;
      case 'interact':
      case 'confirm':
        this.activate();
        return true;
      case 'cancel':
      case 'menu':
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }

  private activate(): void {
    const entry = this.entries[this.selected];
    if (!entry) return;
    if (!entry.enabled()) {
      this.ctx.ui.toast(`${entry.title}: ${entry.sub()}`, 'warn');
      return;
    }
    if (entry.screen) this.ctx.ui.push(entry.screen);
    else entry.action?.();
  }
}
