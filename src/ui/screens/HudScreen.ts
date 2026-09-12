import type { Screen, ScreenContext, UIManager } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import { creatureColor, formatMoney, keyCap, setHpBar } from '../uiHelpers';
import type { PlayerState } from '@/player/PlayerState';
import type { TimeManager } from '@/world/TimeManager';
import { GameData } from '@/data/GameData';
import type { WeatherKind } from '@/data/schema';

const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: 'Klar', cloudy: 'Bewoelkt', rain: 'Regen', heavyRain: 'Starkregen',
  thunderstorm: 'Gewitter', snow: 'Schnee', blizzard: 'Blizzard',
  fog: 'Nebel', sandstorm: 'Sandsturm', harshSun: 'Gleissende Sonne',
};

const TIME_LABELS = { dawn: 'Morgen', day: 'Tag', dusk: 'Abend', night: 'Nacht' } as const;

export interface HudContext {
  player: PlayerState;
  time: TimeManager;
  getAreaName: () => string;
  getWeather: () => WeatherKind;
  /** Aktueller Interaktionshinweis, falls vorhanden. */
  getInteractHint: () => string | null;
}

/**
 * Dauerhaft sichtbare Kopfzeile: Ort, Uhrzeit, Wetter, Geld, Orden, Team.
 *
 * Aktualisiert ausschliesslich Textknoten und Balkenbreiten - kein Neuaufbau
 * des DOM pro Bild (Anforderung 48).
 */
export class HudScreen implements Screen {
  readonly id = 'hud';
  readonly modal = false;
  readonly transparent = true;

  private root!: HTMLElement;
  private areaLabel!: HTMLElement;
  private areaKind!: HTMLElement;
  private clockLabel!: HTMLElement;
  private weatherLabel!: HTMLElement;
  private moneyLabel!: HTMLElement;
  private badgeRow!: HTMLElement;
  private questBox!: HTMLElement;
  private questName!: HTMLElement;
  private questStep!: HTMLElement;
  private partyRow!: HTMLElement;
  private hintBox!: HTMLElement;
  private hintText!: HTMLElement;

  private partySignature = '';
  private lastQuestSignature = '';
  private refreshTimer = 0;

  constructor(private readonly ctx: HudContext) {}

  mount(_context: ScreenContext): HTMLElement {
    this.areaLabel = el('span', { text: '' });
    this.areaKind = el('small', { text: '' });
    this.clockLabel = el('span', { text: '00:00' });
    this.weatherLabel = el('span', { text: '' });
    this.moneyLabel = el('span', { text: '' });
    this.badgeRow = el('div', { className: 'hud-badges' });
    this.questName = el('div', { className: 'quest-name' });
    this.questStep = el('div', { className: 'quest-step' });
    this.questBox = el('div', {
      className: 'hud-quest',
      children: [this.questName, this.questStep],
    });
    this.questBox.hidden = true;
    this.partyRow = el('div', { className: 'hud-party' });
    this.hintText = el('span', { text: '' });
    this.hintBox = el('div', {
      className: 'hud-hint',
      children: [keyCap('E'), this.hintText],
    });

    for (let i = 0; i < 8; i++) {
      this.badgeRow.appendChild(el('div', { className: 'hud-badge' }));
    }

    this.root = el('div', {
      className: 'hud',
      children: [
        el('div', {
          className: 'hud-top-left',
          children: [
            el('div', {
              className: 'hud-area',
              children: [this.areaLabel, this.areaKind],
            }),
            el('div', {
              className: 'hud-clock',
              children: [this.clockLabel, el('span', { text: '·' }), this.weatherLabel],
            }),
            this.questBox,
          ],
        }),
        el('div', {
          className: 'hud-top-right',
          children: [
            el('div', { className: 'hud-money', children: [this.moneyLabel] }),
            this.badgeRow,
          ],
        }),
        this.partyRow,
        this.hintBox,
        el('div', {
          className: 'hud-controls',
          children: [
            el('div', { text: 'WASD Bewegen · Umschalt Rennen · E Interagieren' }),
            el('div', { text: 'M Menue · N Karte · F1 Entwickleransicht' }),
          ],
        }),
      ],
    });
    this.rebuildParty();
    this.refresh();
    return this.root;
  }

  update(dt: number): void {
    this.refreshTimer -= dt;
    // Text nur zehnmal pro Sekunde anfassen - haeufiger bringt visuell nichts.
    if (this.refreshTimer <= 0) {
      this.refreshTimer = 0.1;
      this.refresh();
    }
    this.updateHint();
  }

  private refresh(): void {
    const { player, time } = this.ctx;

    this.areaLabel.textContent = this.ctx.getAreaName();
    this.areaKind.textContent = TIME_LABELS[time.timeOfDay];
    this.clockLabel.textContent = time.format();
    this.weatherLabel.textContent = WEATHER_LABELS[this.ctx.getWeather()];
    this.moneyLabel.textContent = formatMoney(player.money);

    for (let i = 0; i < this.badgeRow.children.length; i++) {
      this.badgeRow.children[i]!.classList.toggle('earned', player.badges[i] === true);
    }

    this.updateQuest();
    this.updateParty();
  }

  private updateQuest(): void {
    const active = this.ctx.player.activeQuests;
    const main = active.find((q) => GameData.quests.tryGet(q.questId)?.kind === 'main')
      ?? active[0];
    if (!main) {
      this.questBox.hidden = true;
      this.lastQuestSignature = '';
      return;
    }
    const signature = `${main.questId}:${main.stepIndex}`;
    if (signature === this.lastQuestSignature) return;
    this.lastQuestSignature = signature;

    const quest = GameData.quests.tryGet(main.questId);
    if (!quest) {
      this.questBox.hidden = true;
      return;
    }
    this.questBox.hidden = false;
    this.questName.textContent = quest.name;
    this.questStep.textContent =
      quest.steps[main.stepIndex]?.description ?? quest.description;
  }

  private updateParty(): void {
    const party = this.ctx.player.party;
    const signature = party.map((c) => `${c.uid}:${c.level}:${c.speciesId}`).join('|');
    if (signature !== this.partySignature) {
      this.partySignature = signature;
      this.rebuildParty();
      return;
    }
    // Nur KP-Balken aktualisieren.
    for (let i = 0; i < party.length; i++) {
      const slot = this.partyRow.children[i] as HTMLElement | undefined;
      if (!slot) continue;
      const bar = slot.querySelector('.bar') as HTMLElement | null;
      const fill = slot.querySelector('.bar-fill') as HTMLElement | null;
      if (bar && fill) setHpBar(bar, fill, party[i]!.hpFraction);
      slot.classList.toggle('fainted', party[i]!.isFainted);
    }
  }

  private rebuildParty(): void {
    clearChildren(this.partyRow);
    for (const creature of this.ctx.player.party) {
      const fill = el('div', {
        className: 'bar-fill',
        style: { width: `${creature.hpFraction * 100}%` },
      });
      const bar = el('div', { className: 'bar bar-hp', children: [fill] });
      setHpBar(bar, fill, creature.hpFraction);
      this.partyRow.appendChild(el('div', {
        className: `hud-party-slot${creature.isFainted ? ' fainted' : ''}`,
        children: [
          el('div', {
            className: 'hud-party-dot',
            style: { background: creatureColor(creature) },
          }),
          bar,
          el('div', { className: 'lvl', text: `Lv. ${creature.level}` }),
        ],
      }));
    }
  }

  private updateHint(): void {
    const hint = this.ctx.getInteractHint();
    const visible = hint !== null;
    this.hintBox.classList.toggle('visible', visible);
    if (visible && this.hintText.textContent !== hint) this.hintText.textContent = hint;
  }

  /** Erzwingt ein sofortiges Neuzeichnen (z.B. nach einem Kampf). */
  forceRefresh(): void {
    this.partySignature = '';
    this.lastQuestSignature = '';
    this.refresh();
  }
}

export function createHud(ui: UIManager, ctx: HudContext): HudScreen {
  const hud = new HudScreen(ctx);
  ui.register(hud);
  return hud;
}
