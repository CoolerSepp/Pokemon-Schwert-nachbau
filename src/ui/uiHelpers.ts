import type { ElementType, StatusCondition, StatKey, BattleStatKey } from '@/data/schema';
import type { Creature } from '@/creatures/Creature';
import { el } from './UIManager';

/** Farbe je Elementtyp - einheitlich in HUD, Index und Kampf. */
export const TYPE_COLORS: Record<ElementType, string> = {
  normal: '#b8b4a4', fire: '#f0864b', water: '#5b9bd8', electric: '#f0cf4b',
  grass: '#7fc45b', ice: '#8fd8e0', fighting: '#c96b4b', poison: '#a86bc4',
  ground: '#d8b06b', flying: '#a8b8e0', psychic: '#f07f9b', bug: '#a8c44b',
  rock: '#c4b88f', ghost: '#8f7fb8', dragon: '#7f6bd8', dark: '#7a6b5f',
  steel: '#b8bcc9', fairy: '#f0a8cf',
};

export const TYPE_NAMES: Record<ElementType, string> = {
  normal: 'Normal', fire: 'Feuer', water: 'Wasser', electric: 'Elektro',
  grass: 'Pflanze', ice: 'Eis', fighting: 'Kampf', poison: 'Gift',
  ground: 'Boden', flying: 'Flug', psychic: 'Psycho', bug: 'Kaefer',
  rock: 'Gestein', ghost: 'Geist', dragon: 'Drache', dark: 'Unlicht',
  steel: 'Stahl', fairy: 'Fee',
};

export const STATUS_NAMES: Record<StatusCondition, string> = {
  none: '', burn: 'VBR', freeze: 'GFR', paralysis: 'PAR',
  poison: 'GIF', toxic: 'TOX', sleep: 'SLF',
};

export const STATUS_COLORS: Record<StatusCondition, string> = {
  none: '#8f8f8f', burn: '#e07a4b', freeze: '#7fd8f0', paralysis: '#e0cf4b',
  poison: '#b06bc4', toxic: '#8f3fa8', sleep: '#8f9bb0',
};

export const STAT_NAMES: Record<StatKey, string> = {
  hp: 'KP', atk: 'Angriff', def: 'Verteidigung',
  spa: 'Sp.-Angriff', spd: 'Sp.-Verteidigung', spe: 'Initiative',
};

export const STAT_SHORT: Record<StatKey, string> = {
  hp: 'KP', atk: 'ANG', def: 'VER', spa: 'SPA', spd: 'SPV', spe: 'INI',
};

export const BATTLE_STAT_NAMES: Record<BattleStatKey, string> = {
  atk: 'Angriff', def: 'Verteidigung', spa: 'Sp.-Angriff',
  spd: 'Sp.-Verteidigung', spe: 'Initiative',
  accuracy: 'Genauigkeit', evasion: 'Ausweichen',
};

export const MOVE_CATEGORY_NAMES = {
  physical: 'Physisch', special: 'Spezial', status: 'Status',
} as const;

/** Leitfarbe einer Kreatur - aus ihrer Modellpalette. */
export function creatureColor(creature: Creature): string {
  return creature.species.model.palette.primary ?? TYPE_COLORS[creature.types[0]!];
}

export function typeChip(type: ElementType): HTMLElement {
  return el('span', {
    className: 'type-chip',
    text: TYPE_NAMES[type],
    style: { background: TYPE_COLORS[type] },
  });
}

export function statusChip(status: StatusCondition): HTMLElement | null {
  if (status === 'none') return null;
  return el('span', {
    className: 'status-chip',
    text: STATUS_NAMES[status],
    style: { background: STATUS_COLORS[status] },
  });
}

/** KP-Balken mit farblicher Warnstufe. */
export function hpBar(fraction: number): { root: HTMLElement; fill: HTMLElement } {
  const fill = el('div', { className: 'bar-fill' });
  const root = el('div', { className: 'bar bar-hp', children: [fill] });
  setHpBar(root, fill, fraction);
  return { root, fill };
}

export function setHpBar(root: HTMLElement, fill: HTMLElement, fraction: number): void {
  const clamped = Math.max(0, Math.min(1, fraction));
  fill.style.width = `${clamped * 100}%`;
  root.classList.toggle('warn', clamped <= 0.5 && clamped > 0.2);
  root.classList.toggle('danger', clamped <= 0.2);
}

export function expBar(fraction: number): HTMLElement {
  return el('div', {
    className: 'bar bar-exp',
    children: [el('div', {
      className: 'bar-fill',
      style: { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` },
    })],
  });
}

/** Kompakte Kreaturkarte fuer Team- und Kampf-Ansichten. */
export function creatureCard(
  creature: Creature, options: { selected?: boolean; showExp?: boolean; onClick?: () => void } = {},
): HTMLElement {
  const hp = hpBar(creature.hpFraction);
  const card = el('div', {
    className: `creature-card${options.selected ? ' selected' : ''}${creature.isFainted ? ' fainted' : ''}`,
    children: [
      el('div', {
        className: 'creature-portrait',
        style: { background: creatureColor(creature) },
      }),
      el('div', {
        className: 'creature-info',
        children: [
          el('div', {
            className: 'creature-name-row',
            children: [
              el('span', { className: 'creature-name', text: creature.name }),
              el('span', { className: 'creature-level', text: `Lv. ${creature.level}` }),
            ],
          }),
          el('div', {
            style: { marginBottom: '5px' },
            children: [
              ...creature.types.map(typeChip),
              statusChip(creature.status),
            ],
          }),
          hp.root,
          el('div', {
            className: 'hp-text',
            children: [
              el('span', { text: `${creature.currentHp} / ${creature.maxHp} KP` }),
              options.showExp
                ? el('span', { text: `${Math.round(creature.levelProgress() * 100)} % EP` })
                : null,
            ],
          }),
          options.showExp ? expBar(creature.levelProgress()) : null,
        ],
      }),
    ],
  });
  if (options.onClick) card.addEventListener('click', options.onClick);
  return card;
}

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString('de-DE')} M`;
}

export function keyCap(label: string): HTMLElement {
  return el('span', { className: 'key-cap', text: label });
}
