import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import type { MenuContext } from './MenuContext';
import { creatureCard, creatureColor } from '../uiHelpers';
import { GameConfig } from '@/core/Config';
import { GameData } from '@/data/GameData';
import type { AudioManager } from '@/audio/AudioManager';
import type { Creature } from '@/creatures/Creature';

type Activity = 'play' | 'feed' | 'rest' | 'watch';

const ACTIVITIES: { id: Activity; label: string; describe: string }[] = [
  { id: 'play', label: 'Spielen', describe: 'Staerkt die Zuneigung deutlich.' },
  { id: 'feed', label: 'Fuettern', describe: 'Braucht eine Zutat, heilt und erfreut.' },
  { id: 'rest', label: 'Ausruhen', describe: 'Stellt einen Teil der KP wieder her.' },
  { id: 'watch', label: 'Beobachten', describe: 'Zeigt, wie es deiner Kreatur geht.' },
];

/** Reaktionen nach Zuneigungsstufe - jede Kreatur wirkt eigenstaendig. */
function reaction(creature: Creature): string {
  const f = creature.friendship;
  if (f >= 220) return `${creature.name} weicht dir nicht von der Seite.`;
  if (f >= 160) return `${creature.name} wirkt richtig zufrieden.`;
  if (f >= 100) return `${creature.name} beobachtet dich aufmerksam.`;
  if (f >= 50) return `${creature.name} haelt noch etwas Abstand.`;
  return `${creature.name} ist dir gegenueber zurueckhaltend.`;
}

/**
 * Lager: Zeit mit dem Team verbringen.
 *
 * Jede Handlung hat eine echte Auswirkung (Zuneigung, KP, Zutatenverbrauch) -
 * es gibt keine reine Zierde.
 */
export class CampScreen implements Screen {
  readonly id = 'camp';
  readonly modal = true;

  private root!: HTMLElement;
  private partyNode!: HTMLElement;
  private activityNode!: HTMLElement;
  private logNode!: HTMLElement;
  private selectedCreature = 0;
  private selectedActivity = 0;
  private focus: 'creature' | 'activity' = 'creature';

  constructor(
    private readonly ctx: MenuContext,
    private readonly audio: AudioManager,
  ) {}

  mount(_context: ScreenContext): HTMLElement {
    this.partyNode = el('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '7px', minWidth: '310px' },
    });
    this.activityNode = el('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '7px', minWidth: '230px' },
    });
    this.logNode = el('div', { style: { flex: '1', minWidth: '0' } });

    this.root = el('div', {
      className: 'menu-overlay',
      children: [
        el('div', {
          className: 'panel menu-panel',
          children: [
            el('div', {
              className: 'menu-header',
              children: [
                el('h2', { text: 'Lager' }),
                el('div', { className: 'entry-sub', text: 'Zeit mit deinem Team' }),
              ],
            }),
            el('div', {
              className: 'menu-body',
              style: { display: 'flex', gap: '18px' },
              children: [this.partyNode, this.activityNode, this.logNode],
            }),
            el('div', {
              className: 'menu-footer',
              children: [
                el('span', { text: 'W/S: Auswaehlen' }),
                el('span', { text: 'A/D: Bereich wechseln' }),
                el('span', { text: 'E: Ausfuehren' }),
                el('span', { text: 'Esc: Lager verlassen' }),
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

  private get creature(): Creature | null {
    return this.ctx.player.party[this.selectedCreature] ?? null;
  }

  private render(): void {
    clearChildren(this.partyNode);
    this.ctx.player.party.forEach((creature, index) => {
      this.partyNode.appendChild(creatureCard(creature, {
        selected: this.focus === 'creature' && index === this.selectedCreature,
        onClick: () => {
          this.selectedCreature = index;
          this.focus = 'creature';
          this.render();
        },
      }));
    });

    clearChildren(this.activityNode);
    ACTIVITIES.forEach((activity, index) => {
      this.activityNode.appendChild(el('div', {
        className: `menu-entry${this.focus === 'activity' && index === this.selectedActivity ? ' selected' : ''}`,
        style: { padding: '11px 14px' },
        children: [
          el('div', { className: 'entry-title', text: activity.label }),
          el('div', { className: 'entry-sub', text: activity.describe }),
        ],
        onClick: () => {
          this.selectedActivity = index;
          this.focus = 'activity';
          this.execute();
        },
      }));
    });

    this.renderLog();
  }

  private renderLog(): void {
    clearChildren(this.logNode);
    const creature = this.creature;
    if (!creature) {
      this.logNode.appendChild(el('div', { className: 'entry-sub', text: 'Dein Team ist leer.' }));
      return;
    }
    const level = creature.friendship;
    this.logNode.appendChild(el('div', {
      children: [
        el('div', {
          style: {
            width: '110px', height: '110px', borderRadius: '22px',
            background: creatureColor(creature),
            border: '3px solid rgba(255,255,255,0.25)', marginBottom: '15px',
          },
        }),
        el('div', { style: { fontSize: '18px', fontWeight: '700' }, text: creature.name }),
        el('div', {
          className: 'entry-sub',
          style: { margin: '7px 0 13px', lineHeight: '1.6' },
          text: reaction(creature),
        }),
        el('div', { className: 'panel-title', text: 'Zuneigung' }),
        el('div', {
          className: 'bar',
          style: { marginBottom: '5px' },
          children: [el('div', {
            className: 'bar-fill',
            style: {
              width: `${(level / GameConfig.creature.maxFriendship) * 100}%`,
              background: 'linear-gradient(90deg, #ff8fb8, #ffd84b)',
            },
          })],
        }),
        el('div', {
          className: 'entry-sub',
          text: `${level} / ${GameConfig.creature.maxFriendship}`,
        }),
        el('div', {
          className: 'entry-sub',
          style: { marginTop: '15px', lineHeight: '1.7' },
          text: `Zutaten im Beutel: ${this.ingredientCount()}`,
        }),
      ],
    }));
  }

  private ingredientCount(): number {
    return this.ctx.player.itemsOfCategory('ingredient')
      .reduce((sum, e) => sum + e.quantity, 0);
  }

  handleAction(action: GameAction): boolean {
    const partySize = this.ctx.player.party.length;
    switch (action) {
      case 'up':
      case 'moveForward':
        if (this.focus === 'creature' && partySize > 0) {
          this.selectedCreature = (this.selectedCreature - 1 + partySize) % partySize;
        } else {
          this.selectedActivity = (this.selectedActivity - 1 + ACTIVITIES.length) % ACTIVITIES.length;
        }
        this.audio.playSfx('select');
        this.render();
        return true;
      case 'down':
      case 'moveBackward':
        if (this.focus === 'creature' && partySize > 0) {
          this.selectedCreature = (this.selectedCreature + 1) % partySize;
        } else {
          this.selectedActivity = (this.selectedActivity + 1) % ACTIVITIES.length;
        }
        this.audio.playSfx('select');
        this.render();
        return true;
      case 'left':
      case 'moveLeft':
        this.focus = 'creature';
        this.render();
        return true;
      case 'right':
      case 'moveRight':
        this.focus = 'activity';
        this.render();
        return true;
      case 'interact':
      case 'confirm':
        if (this.focus === 'creature') {
          this.focus = 'activity';
          this.render();
        } else {
          this.execute();
        }
        return true;
      case 'cancel':
        this.audio.playSfx('close');
        this.ctx.ui.pop(this.id);
        return true;
      default:
        return true;
    }
  }

  private execute(): void {
    const creature = this.creature;
    if (!creature) return;
    const activity = ACTIVITIES[this.selectedActivity];
    if (!activity) return;

    switch (activity.id) {
      case 'play':
        creature.addFriendship(GameConfig.creature.friendshipOnCamp);
        this.audio.playSfx('confirm');
        if (creature.species.cry) this.audio.playCry(creature.species.cry);
        this.ctx.ui.toast(`${creature.name} tobt vergnuegt herum.`, 'success');
        break;
      case 'feed': {
        const ingredient = this.ctx.player.itemsOfCategory('ingredient')[0];
        if (!ingredient) {
          this.audio.playSfx('error');
          this.ctx.ui.toast('Du hast keine Zutaten dabei.', 'warn');
          return;
        }
        this.ctx.player.removeItem(ingredient.itemId, 1);
        creature.addFriendship(GameConfig.creature.friendshipOnCamp * 2);
        const healed = creature.applyHpDelta(Math.ceil(creature.maxHp * 0.35));
        this.audio.playSfx('heal');
        this.ctx.ui.toast(
          `${creature.name} frisst ${GameData.items.get(ingredient.itemId).name}`
          + (healed > 0 ? ` und erholt sich um ${healed} KP.` : '.'),
          'success',
        );
        break;
      }
      case 'rest': {
        let total = 0;
        for (const member of this.ctx.player.party) {
          total += member.applyHpDelta(Math.ceil(member.maxHp * 0.25));
        }
        this.audio.playSfx('heal');
        this.ctx.ui.toast(
          total > 0 ? `Das Team ruht sich aus (+${total} KP).` : 'Alle sind bereits ausgeruht.',
          total > 0 ? 'success' : 'info',
        );
        break;
      }
      case 'watch':
        this.audio.playSfx('select');
        this.ctx.ui.toast(reaction(creature), 'info', 4);
        break;
    }
    this.render();
  }
}
