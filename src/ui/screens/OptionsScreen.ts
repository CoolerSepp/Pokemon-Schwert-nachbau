import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import type { SettingsData } from '@/save/Settings';

interface Option {
  key: keyof SettingsData | 'fullscreen' | 'resetBindings';
  label: string;
  describe: () => string;
  adjust: (direction: -1 | 1) => void;
  activate?: () => void;
}

/** Optionen: Ton, Grafik, Steuerung, Text- und Kampftempo, Vollbild. */
export class OptionsScreen implements Screen {
  readonly id = 'options';
  readonly modal = true;

  private root!: HTMLElement;
  private listNode!: HTMLElement;
  private options: Option[] = [];
  private selected = 0;

  constructor(private readonly ctx: MenuContext) {}

  mount(_context: ScreenContext): HTMLElement {
    const s = this.ctx.settings;
    const percent = (v: number) => `${Math.round(v * 100)} %`;
    const step = (key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'cameraSensitivity') =>
      (direction: -1 | 1) => {
        const range = key === 'cameraSensitivity' ? [0.2, 3] : [0, 1];
        const delta = key === 'cameraSensitivity' ? 0.1 : 0.05;
        const next = Math.round(
          Math.max(range[0]!, Math.min(range[1]!, s.get(key) + direction * delta)) * 100,
        ) / 100;
        s.set(key, next);
        this.ctx.applySettings();
      };
    const cycle = <K extends keyof SettingsData>(key: K, values: SettingsData[K][]) =>
      (direction: -1 | 1) => {
        const index = values.indexOf(s.get(key));
        const next = values[(index + direction + values.length) % values.length]!;
        s.set(key, next);
        this.ctx.applySettings();
      };

    this.options = [
      {
        key: 'masterVolume', label: 'Gesamtlautstaerke',
        describe: () => percent(s.get('masterVolume')), adjust: step('masterVolume'),
      },
      {
        key: 'musicVolume', label: 'Musik',
        describe: () => percent(s.get('musicVolume')), adjust: step('musicVolume'),
      },
      {
        key: 'sfxVolume', label: 'Klangeffekte',
        describe: () => percent(s.get('sfxVolume')), adjust: step('sfxVolume'),
      },
      {
        key: 'quality', label: 'Grafikqualitaet',
        describe: () => ({ low: 'Niedrig', medium: 'Mittel', high: 'Hoch' })[s.get('quality')],
        adjust: cycle('quality', ['low', 'medium', 'high']),
      },
      {
        key: 'cameraSensitivity', label: 'Kameraempfindlichkeit',
        describe: () => `${s.get('cameraSensitivity').toFixed(1)}x`,
        adjust: step('cameraSensitivity'),
      },
      {
        key: 'invertCameraY', label: 'Kamera Y invertieren',
        describe: () => (s.get('invertCameraY') ? 'an' : 'aus'),
        adjust: () => { s.set('invertCameraY', !s.get('invertCameraY')); this.ctx.applySettings(); },
      },
      {
        key: 'textSpeed', label: 'Textgeschwindigkeit',
        describe: () => ({ slow: 'Langsam', normal: 'Normal', fast: 'Schnell', instant: 'Sofort' })[s.get('textSpeed')],
        adjust: cycle('textSpeed', ['slow', 'normal', 'fast', 'instant']),
      },
      {
        key: 'battleSpeed', label: 'Kampftempo',
        describe: () => ({ slow: 'Langsam', normal: 'Normal', fast: 'Schnell', instant: 'Sofort' })[s.get('battleSpeed')],
        adjust: cycle('battleSpeed', ['slow', 'normal', 'fast', 'instant']),
      },
      {
        key: 'showDamageNumbers', label: 'Schadenszahlen',
        describe: () => (s.get('showDamageNumbers') ? 'an' : 'aus'),
        adjust: () => { s.set('showDamageNumbers', !s.get('showDamageNumbers')); },
      },
      {
        key: 'autoSave', label: 'Automatisch speichern',
        describe: () => (s.get('autoSave') ? 'an' : 'aus'),
        adjust: () => { s.set('autoSave', !s.get('autoSave')); },
      },
      {
        key: 'fullscreen', label: 'Vollbild',
        describe: () => (document.fullscreenElement ? 'an' : 'aus'),
        adjust: () => this.toggleFullscreen(),
        activate: () => this.toggleFullscreen(),
      },
      {
        key: 'resetBindings', label: 'Einstellungen zuruecksetzen',
        describe: () => 'E zum Bestaetigen',
        adjust: () => undefined,
        activate: () => {
          s.reset();
          this.ctx.applySettings();
          this.ctx.ui.toast('Einstellungen zurueckgesetzt.', 'info');
          this.render();
        },
      },
    ];

    this.listNode = el('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '5px' },
    });

    this.root = el('div', {
      className: 'menu-overlay',
      children: [
        el('div', {
          className: 'panel menu-panel',
          style: { maxWidth: '620px' },
          children: [
            el('div', {
              className: 'menu-header',
              children: [el('h2', { text: 'Optionen' })],
            }),
            el('div', { className: 'menu-body', children: [this.listNode] }),
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'W/S: Auswaehlen' }),
                el('span', { text: 'A/D: Aendern' }),
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

  onShow(): void { this.render(); }

  private render(): void {
    clearChildren(this.listNode);
    this.options.forEach((option, index) => {
      this.listNode.appendChild(el('div', {
        className: `menu-entry${index === this.selected ? ' selected' : ''}`,
        style: {
          padding: '11px 15px', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', gap: '13px',
        },
        children: [
          el('span', { text: option.label }),
          el('span', {
            text: option.describe(),
            style: { color: 'var(--ui-accent)', fontWeight: '600' },
          }),
        ],
        onClick: () => {
          this.selected = index;
          if (option.activate) option.activate();
          else option.adjust(1);
          this.render();
        },
      }));
    });
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        this.ctx.ui.toast('Vollbild wurde vom Browser abgelehnt.', 'warn');
      });
    }
    // Der Zustandswechsel ist asynchron - Anzeige kurz danach auffrischen.
    window.setTimeout(() => this.render(), 220);
  }

  handleAction(action: GameAction): boolean {
    const option = this.options[this.selected];
    switch (action) {
      case 'up':
      case 'moveForward':
        this.selected = (this.selected - 1 + this.options.length) % this.options.length;
        this.render();
        return true;
      case 'down':
      case 'moveBackward':
        this.selected = (this.selected + 1) % this.options.length;
        this.render();
        return true;
      case 'left':
      case 'moveLeft':
        option?.adjust(-1);
        this.render();
        return true;
      case 'right':
      case 'moveRight':
        option?.adjust(1);
        this.render();
        return true;
      case 'interact':
      case 'confirm':
        if (option?.activate) option.activate();
        else option?.adjust(1);
        this.render();
        return true;
      case 'cancel':
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }
}
