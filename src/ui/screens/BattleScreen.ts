import type { Screen, ScreenContext } from '../UIManager';
import { clearChildren, el } from '../UIManager';
import type { GameAction } from '@/engine/InputManager';
import { GameData } from '@/data/GameData';
import { GameConfig } from '@/core/Config';
import type { BattleEngine } from '@/battle/BattleEngine';
import type { BattleAction, BattleEvent, SideId } from '@/battle/BattleTypes';
import type { BattleScene, BattleSlot } from '@/battle/BattleScene';
import type { AudioManager, SfxKind } from '@/audio/AudioManager';
import type { PlayerState } from '@/player/PlayerState';
import type { Settings } from '@/save/Settings';
import type { Creature } from '@/creatures/Creature';
import {
  creatureCard, hpBar, setHpBar, statusChip, typeChip,
  MOVE_CATEGORY_NAMES, TYPE_COLORS, BATTLE_STAT_NAMES,
} from '../uiHelpers';
import type { BattleStatKey } from '@/data/schema';

export interface BattleUiContext {
  engine: BattleEngine;
  scene: BattleScene;
  audio: AudioManager;
  player: PlayerState;
  settings: Settings;
  /** Wird nach dem Kampfende gerufen. */
  onFinished: () => void;
  /** Cinematics fuer Entwicklungen nach dem Kampf. */
  onEvolutionReady: (uid: string, toSpecies: string) => void;
}

type Panel = 'none' | 'actions' | 'moves' | 'party' | 'bag' | 'learnMove';

const EFFECTIVENESS_LABELS: Record<string, string> = {
  veryStrong: 'Sehr effektiv!', strong: 'Effektiv', normal: '',
  weak: 'Wenig effektiv', veryWeak: 'Kaum wirksam', immune: 'Wirkungslos',
};

/**
 * Kampfoberflaeche.
 *
 * Sie spielt das Ereignisprotokoll der Engine ab: jedes Ereignis loest
 * Animation, Ton, Balkenbewegung und Text aus und belegt eine definierte
 * Zeitspanne. Eingaben werden erst wieder entgegengenommen, wenn die
 * Warteschlange leer ist.
 */
export class BattleScreen implements Screen {
  readonly id = 'battle';
  readonly modal = true;

  private root!: HTMLElement;
  private enemyInfo!: HTMLElement;
  private playerInfo!: HTMLElement;
  private messageBox!: HTMLElement;
  private actionPanel!: HTMLElement;
  private movePanel!: HTMLElement;
  private listPanel!: HTMLElement;
  private giganticButton!: HTMLElement;
  private raidShields!: HTMLElement;
  private damageLayer!: HTMLElement;

  private panel: Panel = 'none';
  private selectedAction = 0;
  private selectedMove = 0;
  private selectedListItem = 0;
  private giganticArmed = false;
  private queue: BattleEvent[] = [];
  private eventTimer = 0;
  private awaitingInput = false;
  private finished = false;
  private bagItems: { itemId: string; quantity: number }[] = [];
  private learnChoice = 0;

  /** Sanft animierte KP-Anzeigen. */
  private displayHp: Record<SideId, number> = { player: 1, enemy: 1 };
  private targetHp: Record<SideId, number> = { player: 1, enemy: 1 };
  private displayExp = 0;
  private targetExp = 0;

  private hpBars!: Record<SideId, { root: HTMLElement; fill: HTMLElement; text: HTMLElement }>;
  private expFill!: HTMLElement;

  constructor(private readonly ctx: BattleUiContext) {}

  // ------------------------------------------------------------------ Aufbau

  mount(_context: ScreenContext): HTMLElement {
    this.enemyInfo = el('div', { className: 'battle-info enemy' });
    this.playerInfo = el('div', { className: 'battle-info player' });
    this.messageBox = el('div', { className: 'battle-message' });
    this.actionPanel = el('div', { className: 'battle-actions' });
    this.movePanel = el('div', { className: 'battle-moves' });
    this.listPanel = el('div', { className: 'battle-list' });
    this.damageLayer = el('div', {
      style: { position: 'absolute', inset: '0', pointerEvents: 'none' },
    });
    this.raidShields = el('div', { className: 'battle-raid-shields' });
    this.giganticButton = el('div', {
      className: 'battle-gigantic hidden',
      text: 'GIGANTIFIZIEREN',
      onClick: () => this.toggleGigantic(),
    });

    this.root = el('div', {
      className: 'battle-ui',
      children: [
        this.enemyInfo, this.playerInfo, this.raidShields,
        this.messageBox, this.actionPanel, this.movePanel,
        this.listPanel, this.giganticButton, this.damageLayer,
      ],
    });

    this.buildInfoPanels();
    this.setPanel('none');
    this.startBattle();
    return this.root;
  }

  private buildInfoPanels(): void {
    this.hpBars = {
      enemy: this.buildInfoPanel(this.enemyInfo, false),
      player: this.buildInfoPanel(this.playerInfo, true),
    };
  }

  private buildInfoPanel(
    container: HTMLElement, withExp: boolean,
  ): { root: HTMLElement; fill: HTMLElement; text: HTMLElement } {
    clearChildren(container);
    // Eindeutige Kennzeichnung: ohne sie ist auf den ersten Blick nicht
    // erkennbar, welche Anzeige zur eigenen Kreatur gehoert.
    const owner = el('span', {
      className: `battle-info-owner ${withExp ? 'own' : 'foe'}`,
      text: withExp ? 'DEINE KREATUR' : 'GEGNER',
    });
    const name = el('span', { className: 'battle-info-name' });
    const level = el('span', { className: 'battle-info-level' });
    const types = el('span', { className: 'battle-info-types' });
    const bar = hpBar(1);
    const text = el('div', { className: 'battle-hp-text' });
    const stages = el('div', { className: 'battle-stage-row' });

    container.appendChild(owner);
    container.appendChild(el('div', {
      className: 'battle-info-head',
      children: [name, level],
    }));
    container.appendChild(types);
    container.appendChild(bar.root);
    container.appendChild(text);
    if (withExp) {
      this.expFill = el('div', { className: 'bar-fill', style: { width: '0%' } });
      container.appendChild(el('div', {
        className: 'bar bar-exp',
        style: { marginTop: '6px' },
        children: [this.expFill],
      }));
    }
    container.appendChild(stages);
    container.dataset.name = '';
    return { root: bar.root, fill: bar.fill, text };
  }

  // ------------------------------------------------------------------ Ablauf

  private startBattle(): void {
    const engine = this.ctx.engine;
    this.ctx.scene.setCreature('player', engine.playerActive);
    this.ctx.scene.setCreature('enemy', engine.enemyActive, engine.isRaid ? 1.8 : 1);
    if (engine.isRaid) this.ctx.scene.setAllies(engine.raidAllies);
    this.displayHp.player = engine.playerActive.hpFraction;
    this.displayHp.enemy = engine.enemyActive.hpFraction;
    this.targetHp.player = this.displayHp.player;
    this.targetHp.enemy = this.displayHp.enemy;
    this.displayExp = engine.playerActive.levelProgress();
    this.targetExp = this.displayExp;

    this.enqueue(engine.start());
    this.refreshInfo();
  }

  private enqueue(events: BattleEvent[]): void {
    this.queue.push(...events);
    this.awaitingInput = false;
    this.setPanel('none');
  }

  private get speedFactor(): number {
    return this.ctx.settings.battleSpeedFactor;
  }

  update(dt: number): void {
    // KP- und EP-Balken laufen weich nach.
    for (const side of ['player', 'enemy'] as SideId[]) {
      const speed = dt / (GameConfig.battle.hpDrainSecondsPerFull * this.speedFactor);
      const diff = this.targetHp[side] - this.displayHp[side];
      if (Math.abs(diff) > 0.0005) {
        this.displayHp[side] += Math.sign(diff) * Math.min(Math.abs(diff), speed);
        const bar = this.hpBars[side];
        setHpBar(bar.root, bar.fill, this.displayHp[side]);
      }
    }
    if (Math.abs(this.targetExp - this.displayExp) > 0.002) {
      const diff = this.targetExp - this.displayExp;
      this.displayExp += Math.sign(diff) * Math.min(Math.abs(diff), dt * 0.8);
      if (this.expFill) this.expFill.style.width = `${this.displayExp * 100}%`;
    }

    if (this.eventTimer > 0) {
      this.eventTimer -= dt;
      return;
    }
    if (this.queue.length > 0) {
      const event = this.queue.shift()!;
      this.eventTimer = this.playEvent(event) * this.speedFactor;
      return;
    }
    if (!this.awaitingInput && !this.finished) this.onQueueEmpty();
  }

  /** Nach Abarbeiten aller Ereignisse: naechste Eingabe anfordern. */
  private onQueueEmpty(): void {
    const engine = this.ctx.engine;
    switch (engine.phase) {
      case 'chooseAction':
        this.awaitingInput = true;
        this.selectedAction = 0;
        this.setPanel('actions');
        this.setMessage(`Was soll ${engine.playerActive.name} tun?`);
        this.refreshInfo();
        break;
      case 'chooseReplacement':
        this.awaitingInput = true;
        this.selectedListItem = 0;
        this.setPanel('party');
        this.setMessage('Welche Kreatur soll kaempfen?');
        break;
      case 'chooseLearnMove':
        this.awaitingInput = true;
        this.learnChoice = 0;
        this.setPanel('learnMove');
        break;
      case 'ended':
        this.finishBattle();
        break;
      default:
        break;
    }
  }

  private finishBattle(): void {
    if (this.finished) return;
    this.finished = true;
    const result = this.ctx.engine.result;
    this.setPanel('none');
    if (result) {
      for (const candidate of result.evolutionCandidates) {
        this.ctx.onEvolutionReady(candidate.uid, candidate.toSpecies);
      }
    }
    window.setTimeout(() => this.ctx.onFinished(), 500);
  }

  // ------------------------------------------------------- Ereignisdarstellung

  /** Spielt ein Ereignis ab und liefert die Anzeigedauer in Sekunden. */
  private playEvent(event: BattleEvent): number {
    const base = GameConfig.battle.baseStepSeconds;
    const scene = this.ctx.scene;
    const audio = this.ctx.audio;

    switch (event.t) {
      case 'battleStart':
        audio.playSfx('encounter');
        scene.setCameraFocus('wide');
        this.setMessage(event.isTrainer
          ? `${event.enemyName} fordert dich heraus!`
          : event.kind === 'raid'
            ? `${event.enemyName} bricht aus dem Energiepunkt hervor!`
            : `Ein wildes Wesen erscheint!`);
        return base * 1.2;

      case 'sendOut': {
        const creature = this.creatureByUid(event.uid);
        if (creature) {
          scene.setCreature(
            event.side as BattleSlot, creature,
            this.ctx.engine.isRaid && event.side === 'enemy' ? 1.8 : 1,
          );
          this.targetHp[event.side] = creature.hpFraction;
          this.displayHp[event.side] = creature.hpFraction;
          if (event.side === 'player') {
            this.targetExp = creature.levelProgress();
            this.displayExp = this.targetExp;
          }
          if (creature.species.cry) audio.playCry(creature.species.cry);
        }
        this.refreshInfo();
        this.setMessage(event.side === 'player'
          ? `Los, ${event.name}!`
          : `${event.name} erscheint!`);
        return base * 0.9;
      }

      case 'withdraw':
        scene.playAnimation(event.side as BattleSlot, 'capture');
        this.setMessage(`${event.name}, komm zurueck!`);
        return base * 0.7;

      case 'message':
        this.setMessage(event.text);
        return (event.hold ?? GameConfig.battle.messageSeconds);

      case 'useMove': {
        const move = GameData.moves.tryGet(event.moveId);
        scene.setCameraFocus(event.side === 'player' ? 'player' : 'enemy');
        scene.lunge(event.side as BattleSlot);
        if (move) {
          audio.playSfx(this.sfxForMove(move.sound));
          const targetSlot: BattleSlot = event.side === 'player' ? 'enemy' : 'player';
          if (move.category === 'status') {
            scene.effects.aura(scene.positionOf(event.side as BattleSlot), TYPE_COLORS[move.type], 2, 0.6);
          } else {
            window.setTimeout(() => {
              scene.effectAt(targetSlot, move.type, event.gigantic ? 1.8 : 1);
            }, 190);
          }
        }
        this.setMessage(`${this.nameOf(event.uid)} setzt ${event.moveName} ein!`);
        return base * 1.05;
      }

      case 'moveFailed':
        audio.playSfx(event.reason === 'miss' ? 'whoosh' : 'error');
        this.setMessage(event.text);
        return base * 0.85;

      case 'damage': {
        this.targetHp[event.side] = event.maxHp > 0 ? event.newHp / event.maxHp : 0;
        const slot = event.side as BattleSlot;
        scene.playAnimation(slot, 'damage');
        scene.effects.impact(scene.positionOf(slot, 0.5));
        audio.playSfx(
          event.critical ? 'critical'
            : event.effectiveness === 'strong' || event.effectiveness === 'veryStrong' ? 'hitSuper'
            : event.effectiveness === 'weak' || event.effectiveness === 'veryWeak' ? 'hitWeak'
            : 'hitNormal',
        );
        if (event.critical || event.effectiveness === 'veryStrong') {
          scene.shakeCamera(0.6, 0.35);
        }
        this.showDamageNumber(slot, event.amount, event.critical);
        const label = EFFECTIVENESS_LABELS[event.effectiveness] ?? '';
        if (event.critical) this.setMessage('Ein Volltreffer!');
        else if (label) this.setMessage(label);
        return base * (event.hitCount && event.hitCount > 1 ? 0.34 : 0.95);
      }

      case 'heal':
        this.targetHp[event.side] = event.maxHp > 0 ? event.newHp / event.maxHp : 0;
        scene.effects.heal(scene.positionOf(event.side as BattleSlot));
        audio.playSfx('heal');
        return base * 0.8;

      case 'statChange':
        audio.playSfx(event.delta > 0 ? 'buff' : 'debuff');
        scene.effects.aura(
          scene.positionOf(event.side as BattleSlot),
          event.delta > 0 ? '#7fd88f' : '#e08f8f', 1.8, 0.5,
        );
        this.setMessage(event.text);
        this.refreshInfo();
        return base * 0.85;

      case 'statusApplied':
        audio.playSfx('statusApply');
        this.setMessage(event.text);
        this.refreshInfo();
        return base * 0.95;

      case 'statusCleared':
        this.setMessage(event.text);
        this.refreshInfo();
        return base * 0.8;

      case 'statusDamage':
        this.targetHp[event.side] = this.hpFractionOf(event.uid, event.newHp);
        audio.playSfx('hitWeak');
        this.setMessage(`${this.nameOf(event.uid)} leidet unter seinem Zustand!`);
        return base * 0.8;

      case 'weatherDamage':
        this.targetHp[event.side] = this.hpFractionOf(event.uid, event.newHp);
        this.setMessage(`${this.nameOf(event.uid)} nimmt Schaden durch das Wetter!`);
        return base * 0.75;

      case 'confused':
      case 'trapped':
        audio.playSfx('statusApply');
        this.setMessage(event.text);
        return base * 0.85;

      case 'confusionHit':
        this.targetHp[event.side] = this.hpFractionOf(event.uid, event.newHp);
        scene.playAnimation(event.side as BattleSlot, 'damage');
        audio.playSfx('hitNormal');
        this.setMessage(`${this.nameOf(event.uid)} verletzt sich in seiner Verwirrung!`);
        return base * 0.9;

      case 'flinched':
        this.setMessage(`${this.nameOf(event.uid)} schreckt zurueck!`);
        return base * 0.8;

      case 'weatherChange':
        this.setMessage(event.text);
        return base * 0.9;

      case 'faint': {
        const slot = event.side as BattleSlot;
        this.targetHp[event.side] = 0;
        scene.playAnimation(slot, 'defeat');
        audio.playSfx('faint');
        this.setMessage(`${event.name} wurde besiegt!`);
        return base * 1.5;
      }

      case 'gigantic': {
        const slot = event.side as BattleSlot;
        scene.setCameraFocus('gigantic');
        scene.effects.gigantic(scene.positionOf(slot, 0.4));
        scene.shakeCamera(1.4, 0.9);
        scene.playAnimation(slot, 'gigantic');
        audio.playSfx('gigantic');
        this.setMessage(`${event.name} gigantifiziert!`);
        this.giganticArmed = false;
        return base * 2.4;
      }

      case 'giganticEnd':
        this.ctx.scene.playAnimation(event.side as BattleSlot, 'idle');
        this.ctx.scene.setCameraFocus('wide');
        this.setMessage(`${event.name} kehrt zur normalen Groesse zurueck.`);
        return base * 0.9;

      case 'ability':
      case 'heldItem':
        this.setMessage(event.text);
        return base * 0.85;

      case 'itemUsed':
        audio.playSfx('itemGet');
        this.setMessage(event.text);
        return base * 0.9;

      case 'captureThrow':
        audio.playSfx('ballThrow');
        scene.effects.capture(scene.positionOf('enemy', 0.5));
        scene.playAnimation('enemy', 'capture');
        this.setMessage('Du wirfst einen Ball!');
        return base * 1.1;

      case 'captureShake':
        audio.playSfx('ballShake');
        return base * 0.75;

      case 'captureResult':
        if (event.success) {
          audio.playSfx('ballCatch');
          scene.effects.captureSuccess(scene.positionOf('enemy', 0.5));
          scene.setCreature('enemy', null);
          this.setMessage(`${event.name} wurde gefangen!`);
          return base * 2;
        }
        audio.playSfx('ballBreak');
        scene.setCreature('enemy', this.ctx.engine.enemyActive);
        scene.playAnimation('enemy', 'idle');
        return base * 0.8;

      case 'expGain':
        this.targetExp = event.progress;
        this.setMessage(`${event.name} erhaelt ${event.amount} Erfahrungspunkte.`);
        return base * 1.1;

      case 'levelUp': {
        audio.playSfx('levelUp');
        const creature = this.creatureByUid(event.uid);
        if (creature) {
          this.targetExp = creature.levelProgress();
          this.displayExp = 0;
          scene.effects.heal(scene.positionOf('player'));
        }
        this.refreshInfo();
        this.setMessage(`${event.name} erreicht Level ${event.level}!`);
        return base * 1.4;
      }

      case 'moveLearned':
        audio.playSfx('confirm');
        this.setMessage(`${event.name} erlernt ${event.moveName}!`);
        return base * 1.2;

      case 'moveLearnPrompt':
        this.setMessage(`${event.name} moechte ${event.moveName} erlernen.`);
        return base * 1.2;

      case 'evolutionReady':
        return 0;

      case 'fleeAttempt':
        audio.playSfx(event.success ? 'confirm' : 'error');
        this.setMessage(event.text);
        return base * 1.1;

      case 'screen':
        audio.playSfx('buff');
        this.setMessage(event.text);
        return base * 0.85;

      case 'raidShieldBreak':
        audio.playSfx('explosion');
        scene.shakeCamera(1.1, 0.6);
        this.renderRaidShields();
        this.setMessage('Der Schild zerbricht!');
        return base * 1.4;

      case 'raidPhase':
        audio.playSfx('gigantic');
        this.renderRaidShields();
        this.setMessage(event.text);
        return base * 1.4;

      case 'crowdReaction':
        scene.cheer(event.intensity);
        audio.playSfx(event.reaction === 'gasp' ? 'crowdGasp' : 'crowdCheer');
        return 0;

      case 'battleEnd':
        this.setMessage(event.text);
        return base * 1.6;

      default:
        return base * 0.6;
    }
  }

  private sfxForMove(sound: string): SfxKind {
    const known: SfxKind[] = [
      'fire', 'water', 'electric', 'grass', 'ice', 'rock', 'steel', 'psychic',
      'dark', 'fairy', 'poison', 'ground', 'flying', 'bug', 'ghost', 'dragon',
      'fighting', 'normal', 'buff', 'debuff', 'heal', 'slash', 'impact', 'explosion',
    ];
    return known.includes(sound as SfxKind) ? (sound as SfxKind) : 'impact';
  }

  private creatureByUid(uid: string): Creature | null {
    const engine = this.ctx.engine;
    return engine.player.party.find((c) => c.uid === uid)
      ?? engine.enemy.party.find((c) => c.uid === uid)
      ?? null;
  }

  private nameOf(uid: string): string {
    return this.creatureByUid(uid)?.name ?? 'Die Kreatur';
  }

  private hpFractionOf(uid: string, newHp: number): number {
    const creature = this.creatureByUid(uid);
    return creature && creature.maxHp > 0 ? newHp / creature.maxHp : 0;
  }

  private setMessage(text: string): void {
    this.messageBox.textContent = text;
  }

  private showDamageNumber(slot: BattleSlot, amount: number, critical: boolean): void {
    if (!this.ctx.settings.get('showDamageNumbers')) return;
    const node = el('div', {
      className: 'damage-number',
      text: `-${amount}`,
      style: {
        left: slot === 'player' ? '34%' : '66%',
        top: slot === 'player' ? '58%' : '42%',
        color: critical ? '#ffd84b' : '#ff8f8f',
      },
    });
    this.damageLayer.appendChild(node);
    window.setTimeout(() => node.remove(), 1000);
  }

  // ---------------------------------------------------------------- Anzeige

  private refreshInfo(): void {
    const engine = this.ctx.engine;
    this.renderInfoPanel('enemy', engine.enemyActive);
    this.renderInfoPanel('player', engine.playerActive);
    this.renderRaidShields();
    if (this.ctx.engine.isRaid) this.ctx.scene.refreshAllies();
    this.updateGiganticButton();
  }

  private renderInfoPanel(side: SideId, creature: Creature): void {
    const container = side === 'enemy' ? this.enemyInfo : this.playerInfo;
    const head = container.querySelector('.battle-info-head');
    if (head) {
      (head.children[0] as HTMLElement).textContent =
        `${creature.name}${creature.isVariant ? ' ✦' : ''}`;
      (head.children[1] as HTMLElement).textContent = `Lv. ${creature.level}`;
    }
    // Typen und Status neu setzen. Bewusst ueber die Klasse gesucht und
    // nicht ueber die Kindposition: ein zusaetzliches Element im Panel
    // verschob sonst die Zaehlung und loeschte die Namenszeile.
    const typeRow = container.querySelector('.battle-info-types') as HTMLElement | null;
    if (typeRow) {
      clearChildren(typeRow);
      for (const type of creature.types) typeRow.appendChild(typeChip(type));
      const status = statusChip(creature.status);
      if (status) typeRow.appendChild(status);
    }
    const bar = this.hpBars[side];
    bar.text.textContent = side === 'player'
      ? `${creature.currentHp} / ${creature.maxHp} KP`
      : `${Math.round((creature.currentHp / Math.max(1, creature.maxHp)) * 100)} %`;

    const stageRow = container.querySelector('.battle-stage-row') as HTMLElement | null;
    if (stageRow) {
      clearChildren(stageRow);
      const stages = this.ctx.engine.getStages(side);
      for (const [key, value] of Object.entries(stages) as [BattleStatKey, number][]) {
        if (value === 0) continue;
        stageRow.appendChild(el('span', {
          className: `stage-chip ${value > 0 ? 'up' : 'down'}`,
          text: `${BATTLE_STAT_NAMES[key]} ${value > 0 ? '+' : ''}${value}`,
        }));
      }
    }
  }

  private renderRaidShields(): void {
    const engine = this.ctx.engine;
    clearChildren(this.raidShields);
    if (!engine.isRaid) return;
    const total = engine.raidShieldTotal;
    for (let i = 0; i < total; i++) {
      this.raidShields.appendChild(el('div', {
        className: `raid-shield${i >= engine.raidShieldRemaining ? ' broken' : ''}`,
      }));
    }
  }

  private updateGiganticButton(): void {
    const engine = this.ctx.engine;
    const available = engine.player.canGigantic
      && !engine.player.giganticUsed
      && engine.playerActive.canGigantic
      && engine.phase === 'chooseAction';
    this.giganticButton.classList.toggle('hidden', !available);
    this.giganticButton.classList.toggle('armed', this.giganticArmed);
  }

  private toggleGigantic(): void {
    if (this.giganticButton.classList.contains('hidden')) return;
    this.giganticArmed = !this.giganticArmed;
    this.ctx.audio.playSfx(this.giganticArmed ? 'confirm' : 'cancel');
    this.updateGiganticButton();
    this.setMessage(this.giganticArmed
      ? 'Die naechste Attacke wird gigantifiziert!'
      : `Was soll ${this.ctx.engine.playerActive.name} tun?`);
  }

  // ------------------------------------------------------------------ Panels

  private setPanel(panel: Panel): void {
    this.panel = panel;
    this.actionPanel.hidden = panel !== 'actions';
    this.movePanel.hidden = panel !== 'moves';
    this.listPanel.hidden = panel !== 'party' && panel !== 'bag' && panel !== 'learnMove';
    if (panel === 'actions') this.renderActions();
    if (panel === 'moves') this.renderMoves();
    if (panel === 'party') this.renderParty();
    if (panel === 'bag') this.renderBag();
    if (panel === 'learnMove') this.renderLearnMove();
    this.updateGiganticButton();
  }

  private actionEntries(): { label: string; enabled: boolean; run: () => void }[] {
    const engine = this.ctx.engine;
    return [
      { label: 'Kampf', enabled: true, run: () => { this.selectedMove = 0; this.setPanel('moves'); } },
      {
        label: 'Team',
        enabled: engine.availableSwitches('player').length > 0,
        run: () => { this.selectedListItem = 0; this.setPanel('party'); },
      },
      {
        label: 'Beutel',
        enabled: this.usableItems().length > 0,
        run: () => { this.selectedListItem = 0; this.setPanel('bag'); },
      },
      {
        label: engine.enemy.trainerId ? 'Aufgeben' : 'Flucht',
        enabled: engine.canFlee(),
        run: () => this.submit({ kind: 'run' }),
      },
    ];
  }

  private renderActions(): void {
    clearChildren(this.actionPanel);
    const entries = this.actionEntries();
    entries.forEach((entry, index) => {
      this.actionPanel.appendChild(el('div', {
        className: `battle-action${index === this.selectedAction ? ' selected' : ''}${entry.enabled ? '' : ' disabled'}`,
        text: entry.label,
        onClick: () => {
          this.selectedAction = index;
          this.activateAction();
        },
      }));
    });
  }

  private renderMoves(): void {
    clearChildren(this.movePanel);
    const creature = this.ctx.engine.playerActive;
    creature.moves.forEach((slot, index) => {
      const move = GameData.moves.tryGet(slot.moveId);
      if (!move) return;
      const preview = this.ctx.engine.previewEffectiveness(index);
      const disabled = slot.pp <= 0;
      this.movePanel.appendChild(el('div', {
        className: `battle-move${index === this.selectedMove ? ' selected' : ''}${disabled ? ' disabled' : ''}`,
        style: { borderLeftColor: TYPE_COLORS[move.type] },
        children: [
          el('div', {
            className: 'battle-move-name',
            children: [
              el('span', { text: move.name }),
              el('span', {
                text: `${slot.pp}/${slot.maxPp}`,
                style: { color: disabled ? 'var(--ui-danger)' : 'var(--ui-text-dim)', fontSize: '12px' },
              }),
            ],
          }),
          el('div', {
            className: 'battle-move-meta',
            children: [
              typeChip(move.type),
              el('span', { text: MOVE_CATEGORY_NAMES[move.category] }),
              move.power > 0 ? el('span', { text: `St. ${move.power}` }) : null,
              preview.label !== 'normal' && move.category !== 'status'
                ? el('span', {
                    className: `effectiveness ${preview.label}`,
                    text: EFFECTIVENESS_LABELS[preview.label] ?? '',
                  })
                : null,
            ],
          }),
        ],
        onClick: () => {
          this.selectedMove = index;
          this.activateMove();
        },
      }));
    });
  }

  private renderParty(): void {
    clearChildren(this.listPanel);
    const engine = this.ctx.engine;
    const options = engine.phase === 'chooseReplacement'
      ? engine.availableSwitches('player')
      : engine.availableSwitches('player');
    this.listPanel.appendChild(el('div', {
      className: 'panel-title',
      text: engine.phase === 'chooseReplacement' ? 'Ersatz waehlen' : 'Wechseln',
    }));
    options.forEach((partyIndex, listIndex) => {
      const creature = engine.player.party[partyIndex]!;
      this.listPanel.appendChild(creatureCard(creature, {
        selected: listIndex === this.selectedListItem,
        onClick: () => { this.selectedListItem = listIndex; this.activateList(); },
      }));
    });
    if (options.length === 0) {
      this.listPanel.appendChild(el('div', {
        className: 'entry-sub', text: 'Keine weitere Kreatur einsatzbereit.',
      }));
    }
  }

  private usableItems(): { itemId: string; quantity: number }[] {
    return this.ctx.player.allItems().filter((entry) => {
      const item = GameData.items.tryGet(entry.itemId);
      if (!item?.usableInBattle) return false;
      // Faengkugeln nur gegen wilde Kreaturen anbieten.
      if (item.effect?.kind === 'catch' && !this.ctx.engine.canCapture()) return false;
      return true;
    });
  }

  private renderBag(): void {
    clearChildren(this.listPanel);
    this.bagItems = this.usableItems();
    this.listPanel.appendChild(el('div', { className: 'panel-title', text: 'Beutel' }));
    this.bagItems.forEach((entry, index) => {
      const item = GameData.items.get(entry.itemId);
      this.listPanel.appendChild(el('div', {
        className: `menu-entry${index === this.selectedListItem ? ' selected' : ''}`,
        style: { padding: '9px 13px', display: 'flex', gap: '11px', alignItems: 'center' },
        children: [
          el('div', {
            style: {
              width: '16px', height: '16px', borderRadius: '4px',
              background: item.color ?? '#8f8f8f',
            },
          }),
          el('span', { text: item.name, style: { flex: '1' } }),
          el('span', {
            text: `x${entry.quantity}`,
            style: { fontSize: '12px', color: 'var(--ui-text-dim)' },
          }),
        ],
        onClick: () => { this.selectedListItem = index; this.activateList(); },
      }));
    });
    if (this.bagItems.length === 0) {
      this.listPanel.appendChild(el('div', {
        className: 'entry-sub', text: 'Keine einsetzbaren Gegenstaende.',
      }));
    }
  }

  private renderLearnMove(): void {
    clearChildren(this.listPanel);
    const pending = this.ctx.engine.pendingLearnMoves[0];
    if (!pending) return;
    const creature = this.creatureByUid(pending.uid);
    const newMove = GameData.moves.tryGet(pending.moveId);
    if (!creature || !newMove) return;

    this.listPanel.appendChild(el('div', {
      className: 'panel-title',
      text: `${creature.name} kann nur vier Attacken. Welche ersetzen?`,
    }));
    creature.moves.forEach((slot, index) => {
      const move = GameData.moves.get(slot.moveId);
      this.listPanel.appendChild(el('div', {
        className: `menu-entry${index === this.learnChoice ? ' selected' : ''}`,
        style: { padding: '9px 13px' },
        children: [
          el('div', { className: 'entry-title', text: move.name }),
          el('div', {
            className: 'entry-sub',
            text: `${MOVE_CATEGORY_NAMES[move.category]} · St. ${move.power} · ${slot.pp}/${slot.maxPp} AP`,
          }),
        ],
        onClick: () => { this.learnChoice = index; this.activateList(); },
      }));
    });
    this.listPanel.appendChild(el('div', {
      className: `menu-entry${this.learnChoice === creature.moves.length ? ' selected' : ''}`,
      style: { padding: '9px 13px' },
      children: [
        el('div', { className: 'entry-title', text: `${newMove.name} nicht erlernen` }),
      ],
      onClick: () => { this.learnChoice = creature.moves.length; this.activateList(); },
    }));
  }

  // ------------------------------------------------------------------ Eingabe

  handleAction(action: GameAction): boolean {
    if (!this.awaitingInput) {
      // Waehrend der Wiedergabe beschleunigt eine Eingabe die Anzeige.
      if (action === 'interact' || action === 'confirm') this.eventTimer = 0;
      return true;
    }

    switch (this.panel) {
      case 'actions':
        return this.handleActionsInput(action);
      case 'moves':
        return this.handleMovesInput(action);
      case 'party':
      case 'bag':
      case 'learnMove':
        return this.handleListInput(action);
      default:
        return true;
    }
  }

  private handleActionsInput(action: GameAction): boolean {
    const entries = this.actionEntries();
    switch (action) {
      case 'left':
      case 'moveLeft':
      case 'up':
      case 'moveForward':
        this.selectedAction = (this.selectedAction - 1 + entries.length) % entries.length;
        this.ctx.audio.playSfx('select');
        this.renderActions();
        return true;
      case 'right':
      case 'moveRight':
      case 'down':
      case 'moveBackward':
        this.selectedAction = (this.selectedAction + 1) % entries.length;
        this.ctx.audio.playSfx('select');
        this.renderActions();
        return true;
      case 'interact':
      case 'confirm':
        this.activateAction();
        return true;
      case 'sprint':
        this.toggleGigantic();
        return true;
      default:
        return true;
    }
  }

  private handleMovesInput(action: GameAction): boolean {
    const count = this.ctx.engine.playerActive.moves.length;
    switch (action) {
      case 'left':
      case 'moveLeft':
      case 'up':
      case 'moveForward':
        this.selectedMove = (this.selectedMove - 1 + count) % count;
        this.ctx.audio.playSfx('select');
        this.renderMoves();
        return true;
      case 'right':
      case 'moveRight':
      case 'down':
      case 'moveBackward':
        this.selectedMove = (this.selectedMove + 1) % count;
        this.ctx.audio.playSfx('select');
        this.renderMoves();
        return true;
      case 'interact':
      case 'confirm':
        this.activateMove();
        return true;
      case 'cancel':
        this.ctx.audio.playSfx('cancel');
        this.setPanel('actions');
        return true;
      case 'sprint':
        this.toggleGigantic();
        return true;
      default:
        return true;
    }
  }

  private handleListInput(action: GameAction): boolean {
    const size = this.listSize();
    switch (action) {
      case 'up':
      case 'moveForward':
        this.moveListSelection(-1, size);
        return true;
      case 'down':
      case 'moveBackward':
        this.moveListSelection(1, size);
        return true;
      case 'interact':
      case 'confirm':
        this.activateList();
        return true;
      case 'cancel':
        // In der Ersatzphase ist Abbrechen nicht erlaubt.
        if (this.ctx.engine.phase === 'chooseReplacement'
          || this.ctx.engine.phase === 'chooseLearnMove') return true;
        this.ctx.audio.playSfx('cancel');
        this.setPanel('actions');
        return true;
      default:
        return true;
    }
  }

  private listSize(): number {
    if (this.panel === 'party') return this.ctx.engine.availableSwitches('player').length;
    if (this.panel === 'bag') return this.bagItems.length;
    if (this.panel === 'learnMove') {
      const pending = this.ctx.engine.pendingLearnMoves[0];
      const creature = pending ? this.creatureByUid(pending.uid) : null;
      return creature ? creature.moves.length + 1 : 0;
    }
    return 0;
  }

  private moveListSelection(delta: number, size: number): void {
    if (size === 0) return;
    if (this.panel === 'learnMove') {
      this.learnChoice = (this.learnChoice + delta + size) % size;
      this.renderLearnMove();
    } else {
      this.selectedListItem = (this.selectedListItem + delta + size) % size;
      if (this.panel === 'party') this.renderParty();
      else this.renderBag();
    }
    this.ctx.audio.playSfx('select');
  }

  private activateAction(): void {
    const entry = this.actionEntries()[this.selectedAction];
    if (!entry) return;
    if (!entry.enabled) {
      this.ctx.audio.playSfx('error');
      this.setMessage('Das ist gerade nicht moeglich.');
      return;
    }
    this.ctx.audio.playSfx('confirm');
    entry.run();
  }

  private activateMove(): void {
    const creature = this.ctx.engine.playerActive;
    const slot = creature.moves[this.selectedMove];
    if (!slot) return;
    if (slot.pp <= 0) {
      // Sind alle Attacken leer, bleibt die Verzweiflungsattacke - die Engine
      // setzt sie ein, sobald eine Attacke ohne AP gewaehlt wird. Sonst waere
      // der Kampf ohne Fluchtmoeglichkeit nicht mehr zu beenden.
      const allEmpty = creature.moves.every((m) => m.pp <= 0);
      if (!allEmpty) {
        this.ctx.audio.playSfx('error');
        this.setMessage('Diese Attacke hat keine AP mehr!');
        return;
      }
      this.setMessage(`${creature.name} hat keine AP mehr!`);
    }
    this.ctx.audio.playSfx('confirm');
    this.submit({ kind: 'move', moveIndex: this.selectedMove, gigantic: this.giganticArmed });
  }

  private activateList(): void {
    const engine = this.ctx.engine;
    if (this.panel === 'party') {
      const options = engine.availableSwitches('player');
      const partyIndex = options[this.selectedListItem];
      if (partyIndex === undefined) return;
      this.ctx.audio.playSfx('confirm');
      if (engine.phase === 'chooseReplacement') {
        this.awaitingInput = false;
        this.setPanel('none');
        this.enqueue(engine.submitReplacement(partyIndex));
      } else {
        this.submit({ kind: 'switch', partyIndex });
      }
      return;
    }

    if (this.panel === 'bag') {
      const entry = this.bagItems[this.selectedListItem];
      if (!entry) return;
      this.ctx.audio.playSfx('confirm');
      this.submit({
        kind: 'item', itemId: entry.itemId,
        targetIndex: engine.player.activeIndex,
      });
      return;
    }

    if (this.panel === 'learnMove') {
      const pending = engine.pendingLearnMoves[0];
      if (!pending) return;
      const creature = this.creatureByUid(pending.uid);
      if (!creature) return;
      const replaceIndex = this.learnChoice < creature.moves.length ? this.learnChoice : null;
      this.ctx.audio.playSfx('confirm');
      this.awaitingInput = false;
      this.setPanel('none');
      this.enqueue(engine.resolveLearnMove(pending.uid, pending.moveId, replaceIndex));
    }
  }

  private submit(action: BattleAction): void {
    this.awaitingInput = false;
    this.setPanel('none');
    const events = this.ctx.engine.submitAction(action);
    this.giganticArmed = false;
    this.enqueue(events);
  }
}
