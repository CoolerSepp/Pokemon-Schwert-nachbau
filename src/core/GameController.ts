import * as THREE from 'three';
import { Game, type GameMode } from './Game';
import { GameConfig } from './Config';
import { Logger } from './Logger';
import { GameData } from '@/data/GameData';
import type {
  DialogueAction, ElementType, NpcAppearance, TimeOfDay, WeatherKind,
} from '@/data/schema';
import { UIManager } from '@/ui/UIManager';
import { HudScreen } from '@/ui/screens/HudScreen';
import { DialogueScreen } from '@/ui/screens/DialogueScreen';
import { MainMenuScreen } from '@/ui/screens/MainMenuScreen';
import { TeamScreen } from '@/ui/screens/TeamScreen';
import { BagScreen } from '@/ui/screens/BagScreen';
import { IndexScreen } from '@/ui/screens/IndexScreen';
import { MapScreen } from '@/ui/screens/MapScreen';
import { QuestScreen } from '@/ui/screens/QuestScreen';
import { SaveScreen } from '@/ui/screens/SaveScreen';
import { OptionsScreen } from '@/ui/screens/OptionsScreen';
import { BattleScreen } from '@/ui/screens/BattleScreen';
import { RaidScreen, type RaidBriefing } from '@/ui/screens/RaidScreen';
import { HallOfFameScreen } from '@/ui/screens/HallOfFameScreen';
import type { MenuContext } from '@/ui/screens/MenuContext';
import { PlayerState } from '@/player/PlayerState';
import { NpcManager, type NpcInstance } from '@/npcs/NpcManager';
import { WildCreatureManager, type WildInstance } from '@/wildarea/WildCreatureManager';
import { DialogueManager } from '@/story/DialogueManager';
import { CutsceneManager, type CutsceneHost } from '@/story/CutsceneManager';
import { QuestManager } from '@/quests/QuestManager';
import { RaidManager, type DenState } from '@/raids/RaidManager';
import { LeagueRun } from '@/gyms/LeagueRun';
import { AudioManager } from '@/audio/AudioManager';
import { BattleScene } from '@/battle/BattleScene';
import { BattleEngine, type BattleSetup } from '@/battle/BattleEngine';
import { SaveManager, type SaveData } from '@/save/SaveManager';
import { Settings } from '@/save/Settings';
import { useFieldItem, useItemOnCreature } from '@/items/ItemUsage';
import type { Creature } from '@/creatures/Creature';
import { el } from '@/ui/UIManager';
import { buildCreatureModel } from '@/creatures/CreatureModel';
import { CreatureAnimator } from '@/animation/CreatureAnimator';
import { DebugOverlay } from '@/debug/DebugOverlay';

const log = Logger.scope('Controller');

/** Schwebender Gegenstand in der Welt. */
interface GroundItem {
  id: string;
  itemId: string;
  quantity: number;
  x: number;
  z: number;
  object: THREE.Object3D;
  hidden: boolean;
}

interface PendingEvolution {
  uid: string;
  toSpecies: string;
}

/**
 * Verbindet Engine, Inhalte und Oberflaeche zu einem spielbaren Ganzen.
 *
 * Alles, was ueber reines Rendern hinausgeht - Interaktion, Begegnungen,
 * Kaempfe, Dialoge, Story, Speichern -, wird hier zusammengefuehrt.
 */
export class GameController {
  readonly game: Game;
  readonly player = new PlayerState();
  readonly ui: UIManager;
  readonly audio = new AudioManager();
  readonly settings: Settings;
  readonly saves = new SaveManager();
  readonly npcs: NpcManager;
  readonly wild: WildCreatureManager;
  readonly dialogue: DialogueManager;
  readonly cutscenes: CutsceneManager;
  readonly quests: QuestManager;
  readonly raids: RaidManager;
  readonly league = new LeagueRun();
  readonly battleScene: BattleScene;

  private hud!: HudScreen;
  private dialogueScreen!: DialogueScreen;
  private teamScreen!: TeamScreen;
  private battleScreen: BattleScreen | null = null;
  private battleEngine: BattleEngine | null = null;
  private battleOnDone: (() => void) | null = null;
  private battleWildInstance: WildInstance | null = null;
  private battleTrainerNpc: NpcInstance | null = null;
  private raidScreen!: RaidScreen;
  private hallOfFameScreen!: HallOfFameScreen;
  /** Nest des laufenden Raid-Kampfes. */
  private activeRaidDen: DenState | null = null;

  private readonly groundItems: GroundItem[] = [];
  private readonly itemGroup = new THREE.Group();
  private readonly firedTriggers = new Set<string>();
  private pendingEvolutions: PendingEvolution[] = [];
  private interactHint: string | null = null;
  private fadeLayer!: HTMLElement;
  /** Zeitpunkt des letzten Hinweises auf das kampfunfaehige Team. */
  private partyDownWarnedAt = 0;
  private debugOverlay!: DebugOverlay;
  private autosaveTimer = 0;
  private approachingTrainer: NpcInstance | null = null;
  private readonly tmpVec = new THREE.Vector3();
  private evolutionOverlay: {
    model: ReturnType<typeof buildCreatureModel>;
    animator: CreatureAnimator;
    creature: Creature;
    toSpecies: string;
    timer: number;
    phase: 'start' | 'morph' | 'done';
  } | null = null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.game = new Game({ canvas, uiRoot });
    this.settings = new Settings(this.game.renderer.quality);
    this.ui = new UIManager(uiRoot, this.game.input);
    this.npcs = new NpcManager(this.game.assets, this.player);
    this.wild = new WildCreatureManager(this.game.assets, this.game.creatures, this.player);
    this.dialogue = new DialogueManager(this.player, (action) => this.runAction(action));
    this.quests = new QuestManager(this.player);
    this.raids = new RaidManager();
    this.battleScene = new BattleScene(
      this.game.assets, this.game.renderer.profile.particleBudget,
    );
    this.cutscenes = new CutsceneManager(this.createCutsceneHost());

    this.game.world.scene.add(this.npcs.object);
    this.game.world.scene.add(this.wild.object);
    this.game.world.scene.add(this.raids.object);
    this.game.world.scene.add(this.itemGroup);
    this.itemGroup.name = 'groundItems';

    // Gebietsuebergaenge gegen Story-Fortschritt, Orden und Flags pruefen.
    this.game.transitionGate = (requires) => {
      if (requires.storyStage !== undefined && this.player.storyStage < requires.storyStage) return false;
      if (requires.badge !== undefined && this.player.badgeCount < requires.badge) return false;
      if (requires.flag && !this.player.hasFlag(requires.flag)) return false;
      return true;
    };

    this.buildFadeLayer();
    this.debugOverlay = new DebugOverlay(uiRoot, {
      stats: () => this.game.renderer.stats,
      info: () => this.debugInfo,
      quality: () => this.game.renderer.quality,
    });
    this.registerScreens();
    this.registerEvents();
    this.registerLoop();
    this.applySettings();
  }

  // ------------------------------------------------------------------ Aufbau

  private buildFadeLayer(): void {
    this.fadeLayer = el('div', { className: 'fade-layer' });
    this.game.uiRoot.appendChild(this.fadeLayer);
    this.battleScene.effects.setScreenFlashHandler((color, seconds) => {
      this.fadeLayer.style.background = color;
      this.fadeLayer.style.transition = `opacity ${seconds}s ease`;
      this.fadeLayer.style.opacity = '0.55';
      window.setTimeout(() => { this.fadeLayer.style.opacity = '0'; }, seconds * 320);
    });
  }

  private menuContext(): MenuContext {
    return {
      player: this.player,
      ui: this.ui,
      settings: this.settings,
      time: this.game.time,
      areaName: (id) => GameData.areas.tryGet(id)?.name ?? id,
      currentAreaId: () => this.game.world.areaId ?? this.player.areaId,
      useItem: (itemId, creature) => this.useItem(itemId, creature),
      tossItem: (itemId, quantity) => {
        this.player.removeItem(itemId, quantity);
        return `${GameData.items.tryGet(itemId)?.name ?? itemId} weggeworfen.`;
      },
      saveGame: (slot) => this.saveGame(slot),
      loadGame: (slot) => this.loadGame(slot),
      deleteSave: (slot) => this.saves.remove(slot),
      listSaves: () => this.saves.listSlots(),
      fastTravel: (areaId) => this.fastTravel(areaId),
      canFastTravel: () => this.player.hasItem('flugticket'),
      travelDestinations: () => GameData.areas
        .filter((a) => !a.indoor && this.player.visitedAreas.has(a.id))
        .map((a) => ({ areaId: a.id, name: a.name })),
      applySettings: () => this.applySettings(),
      startEvolution: (creature, toSpecies) => this.beginEvolution(creature, toSpecies),
      teachMove: (creature, moveId, itemId) => this.teachMove(creature, moveId, itemId),
      openCamp: () => this.openCamp(),
    };
  }

  private registerScreens(): void {
    const ctx = this.menuContext();
    this.hud = new HudScreen({
      player: this.player,
      time: this.game.time,
      getAreaName: () => GameData.areas.tryGet(this.game.world.areaId ?? '')?.name ?? '',
      getWeather: () => this.game.world.currentWeather,
      getInteractHint: () => this.interactHint,
    });
    this.dialogueScreen = new DialogueScreen(this.dialogue);
    this.teamScreen = new TeamScreen(ctx);

    this.ui.register(this.hud);
    this.ui.register(this.dialogueScreen);
    this.ui.register(this.teamScreen);
    this.ui.register(new MainMenuScreen(ctx));
    this.ui.register(new BagScreen(ctx, this.teamScreen));
    this.ui.register(new IndexScreen(ctx));
    this.ui.register(new MapScreen(ctx));
    this.ui.register(new QuestScreen(ctx));
    this.ui.register(new SaveScreen(ctx));
    this.ui.register(new OptionsScreen(ctx));
    this.raidScreen = new RaidScreen(ctx, this.audio, (den) => this.startRaidBattle(den));
    this.ui.register(this.raidScreen);
    this.hallOfFameScreen = new HallOfFameScreen(ctx, this.audio);
    this.ui.register(this.hallOfFameScreen);
  }

  private registerEvents(): void {
    // Ton beim ersten Tastendruck freischalten (Browser-Vorgabe).
    const unlock = () => {
      this.audio.unlock();
      this.applySettings();
      this.updateMusic();
    };
    this.game.input.events.once('actionPressed', unlock);
    window.addEventListener('pointerdown', unlock, { once: true });

    this.game.input.events.on('actionPressed', ({ action }) => {
      // Die Debug-Anzeige laesst sich immer umschalten, auch in Menues.
      if (action === 'debug') {
        const shown = this.debugOverlay.toggle();
        this.ui.toast(shown ? 'Debug-Anzeige an' : 'Debug-Anzeige aus', 'info', 1.6);
        return;
      }
      if (action === 'cameraReset') {
        this.game.camera.recenterBehind(this.game.player.yaw);
        return;
      }
      if (this.ui.blocksGameplay) return;
      if (action === 'menu') {
        this.audio.playSfx('open');
        this.ui.push('mainMenu');
      } else if (action === 'map') {
        if (!this.player.hasItem('regionskarte')) {
          this.ui.toast('Du hast noch keine Regionskarte.', 'warn');
          return;
        }
        this.audio.playSfx('open');
        this.ui.push('map');
      } else if (action === 'interact') {
        this.handleInteract();
      } else if (action === 'quickSave') {
        void this.saveGame('slot1').then((ok) => {
          this.ui.toast(ok ? 'Schnell gespeichert.' : 'Speichern fehlgeschlagen.', ok ? 'success' : 'warn');
        });
      }
    });

    this.game.events.on('areaEntered', ({ areaId, areaName }) => {
      this.onAreaEntered(areaId, areaName);
    });
    this.game.events.on('notice', ({ text, kind }) => this.ui.toast(text, kind));

    this.quests.events.on('questStarted', ({ quest }) => {
      this.ui.toast(`Neuer Auftrag: ${quest.name}`, 'info', 4);
      this.hud.forceRefresh();
    });
    this.quests.events.on('questCompleted', ({ quest }) => {
      this.audio.playSfx('badge');
      this.ui.toast(`Auftrag abgeschlossen: ${quest.name}`, 'success', 4);
      this.hud.forceRefresh();
    });

    this.player.events.on('badgeEarned', ({ name }) => {
      this.audio.playSfx('badge');
      this.ui.toast(`Orden erhalten: ${name}!`, 'success', 5);
      this.checkGiganticUnlock();
    });
    this.player.events.on('partyChanged', () => this.hud.forceRefresh());
    this.player.events.on('itemChanged', () => this.applyKeyItems());

    this.game.time.events.on('timeOfDayChanged', () => this.updateMusic());

    // Wetterwechsel: Anzeige auffrischen, Blitze donnern lassen.
    this.game.world.events.on('weatherChanged', () => this.hud.forceRefresh());
    this.game.world.weatherSystem.onLightning = () => {
      if (this.game.mode !== 'world' && this.game.mode !== 'cutscene') return;
      this.audio.playSfx('thunder');
      this.battleScene.effects.flash('#dfe9ff', 0.18);
    };
  }

  private registerLoop(): void {
    this.game.loop.on('simulation', (dt) => this.updateGameplay(dt));
    this.game.loop.on('ai', (dt) => this.updateActors(dt));
    this.game.loop.on('effects', (dt) => {
      this.raids.update(dt);
      this.battleScene.effects.update(dt);
      this.updateEvolution(dt);
    });
    this.game.loop.on('render', (dt) => {
      if (this.game.mode === 'battle') {
        this.battleScene.update(dt);
        this.battleScene.setAspect(this.game.renderer.aspect);
        this.game.renderer.render(this.battleScene.scene, this.battleScene.camera, dt * 1000);
      }
    });
    this.game.loop.on('ui', (dt) => {
      this.ui.update(dt);
      this.debugOverlay.update(dt);
      this.player.playtimeSeconds += dt;
      this.cutscenes.update(dt);
    });
  }

  // ------------------------------------------------------------------ Start

  async start(): Promise<void> {
    await this.saves.init();
    this.ui.push('hud');
    this.player.areaId = 'home_bedroom';
    this.game.start('home_bedroom', 'default');
    this.player.name = 'Reisende';
    this.player.addItem('trank', 3);
    this.player.addItem('fangkugel', 5);
    this.player.setStoryStage(1);
    this.quests.autoStart();
    this.updateMusic();
    log.info('Spiel bereit');
  }

  private onAreaEntered(areaId: string, areaName: string): void {
    const area = this.game.world.area;
    if (!area) return;

    this.player.areaId = areaId;
    this.player.visitArea(areaId);
    this.npcs.load(area);
    this.wild.load(area, this.spawnContext());
    this.raids.load(area, this.game.time.day);
    this.applyKeyItems();
    this.updateLeagueRun(areaId);
    this.loadGroundItems();
    this.updateMusic();
    this.hud.forceRefresh();
    this.approachingTrainer = null;
    this.ui.toast(areaName, 'info', 2.4);
  }

  private spawnContext() {
    return {
      timeOfDay: this.game.time.timeOfDay as TimeOfDay,
      weather: this.game.world.currentWeather,
      storyStage: this.player.storyStage,
      leadTypeBias: this.leadTypeBias(),
    };
  }

  /** Lockfaehigkeit der ersten Teamkreatur. */
  private leadTypeBias(): string | null {
    const lead = this.player.party[0];
    if (!lead) return null;
    const ability = GameData.abilities.tryGet(lead.ability);
    for (const effect of ability?.effects ?? []) {
      if (effect.kind === 'encounterLure') return effect.typeBias;
    }
    return null;
  }

  private updateMusic(): void {
    if (this.game.mode === 'battle') return;
    const area = this.game.world.area;
    if (!area) return;
    let track = area.data.music;
    if (!area.data.indoor && this.game.time.isNight && area.data.kind === 'route') {
      track = 'night';
    }
    this.audio.playMusic(track);
  }

  // ------------------------------------------------------------ Spielschleife

  private updateGameplay(dt: number): void {
    if (this.game.mode === 'battle' || this.cutscenes.isActive) return;

    this.autosaveTimer += dt;
    if (this.settings.get('autoSave')
      && this.autosaveTimer >= GameConfig.save.autosaveIntervalSeconds) {
      this.autosaveTimer = 0;
      void this.saveGame(GameConfig.save.autosaveSlot, true);
    }

    if (this.ui.blocksGameplay) {
      this.interactHint = null;
      return;
    }

    this.updateInteractHint();
    this.checkAreaTriggers();
    this.checkGroundItems();

    // Trainer, der den Spieler erblickt, laeuft heran und fordert heraus.
    // Mit kampfunfaehigem Team sieht niemand hin: sonst stuende man nach
    // einer Niederlage sofort wieder vor demselben Trainer.
    if (!this.approachingTrainer && !this.partyIsDown) {
      const spotter = this.npcs.findSpottingTrainer(this.game.player.x, this.game.player.z);
      if (spotter) {
        spotter.spotted = true;
        this.approachingTrainer = spotter;
        this.game.player.setControlEnabled(false);
        this.audio.playSfx('encounter');
        this.ui.toast(`${this.npcs.displayName(spotter)} hat dich entdeckt!`, 'warn', 2.5);
      }
    }
  }

  private updateActors(dt: number): void {
    if (this.game.mode === 'battle') return;

    this.npcs.update(dt, this.game.player.x, this.game.player.z, this.game.time.hour);

    if (this.approachingTrainer) {
      const arrived = this.npcs.approach(
        this.approachingTrainer, this.game.player.x, this.game.player.z, dt,
      );
      if (arrived) {
        const npc = this.approachingTrainer;
        this.approachingTrainer = null;
        this.game.player.faceTowards(npc.x, npc.z);
        this.startTrainerBattleWithNpc(npc);
      }
      return;
    }

    if (this.cutscenes.isActive || this.ui.blocksGameplay) return;

    const contact = this.wild.update(
      dt, this.game.player.x, this.game.player.z, this.spawnContext(),
    );
    if (!contact) return;
    if (this.partyIsDown) {
      // Die Begegnung wird aufgeloest, sonst meldet sie sich im naechsten
      // Bild sofort wieder und der Rueckweg waere unpassierbar.
      this.wild.resolveEncounter(contact, false);
      this.warnPartyDown();
      return;
    }
    this.startWildEncounter(contact);
  }

  private updateInteractHint(): void {
    const player = this.game.player;
    const npc = this.npcs.findInteractable(
      player.x, player.z, (x, z) => player.canInteractWith(x, z),
    );
    if (npc) {
      const interaction = this.npcs.interactionFor(npc);
      this.interactHint = interaction.kind === 'trainer'
        ? `${this.npcs.displayName(npc)} herausfordern`
        : interaction.kind === 'shop' ? 'Handeln'
        : interaction.kind === 'heal' ? 'Team heilen'
        : `Mit ${this.npcs.displayName(npc)} sprechen`;
      return;
    }
    const item = this.findNearbyItem();
    if (item) {
      this.interactHint = item.hidden
        ? 'Etwas untersuchen'
        : `${GameData.items.tryGet(item.itemId)?.name ?? 'Gegenstand'} aufheben`;
      return;
    }
    const den = this.raids.denNear(player.x, player.z, GameConfig.world.raidDenRange);
    if (den) {
      this.interactHint = den.cleared ? 'Erloschener Energiepunkt'
        : den.active ? `Energiepunkt (Stufe ${den.tier}) betreten`
        : 'Ruhender Energiepunkt';
      return;
    }
    const door = this.game.world.checkDoor(player.x, player.z);
    this.interactHint = door ? `${door.label} betreten` : null;
  }

  private handleInteract(): void {
    if (this.cutscenes.isActive) return;
    const player = this.game.player;

    const npc = this.npcs.findInteractable(
      player.x, player.z, (x, z) => player.canInteractWith(x, z),
    );
    if (npc) {
      player.faceTowards(npc.x, npc.z);
      player.animator.play('interact');
      this.audio.playSfx('interact');
      this.handleNpcInteraction(npc);
      return;
    }

    const item = this.findNearbyItem();
    if (item) {
      this.pickUpItem(item);
      return;
    }

    const den = this.raids.denNear(player.x, player.z, GameConfig.world.raidDenRange);
    if (den) {
      this.openRaidBriefing(den);
      return;
    }
    // Tueren werden in Game.checkAreaTransition ausgewertet.
  }

  private handleNpcInteraction(npc: NpcInstance): void {
    const interaction = this.npcs.interactionFor(npc);
    switch (interaction.kind) {
      case 'trainer': {
        const trainerId = npc.placement.trainer;
        if (trainerId && this.league.belongsToLeague(trainerId)) {
          const blocked = this.league.blockedText(trainerId);
          if (blocked) {
            this.showQuickMessage(undefined, [blocked], () => undefined);
            return;
          }
        }
        this.startTrainerBattleWithNpc(npc);
        return;
      }
      case 'heal':
        this.healParty();
        return;
      case 'shop':
        this.openShop(interaction.shopId);
        return;
      case 'dialogue': {
        // Besiegte Trainer haben keinen eigenen Dialogbaum, sondern
        // Nachkampf-Zeilen in ihren Trainerdaten.
        const trainerId = npc.placement.trainer;
        if (trainerId && npc.defeated) {
          const trainer = GameData.trainers.tryGet(trainerId);
          const lines = trainer?.dialogue.postBattle ?? trainer?.dialogue.defeat ?? [];
          if (lines.length > 0) {
            this.showQuickMessage(trainer!.name, lines, () => undefined);
            return;
          }
        }
        this.startDialogue(interaction.dialogueId, npc);
        return;
      }
    }
  }

  /** Startet einen Dialog und zeigt das Dialogfenster. */
  startDialogue(dialogueId: string, npc?: NpcInstance, onDone?: () => void): boolean {
    if (!GameData.dialogues.has(dialogueId)) {
      // Kein eigener Dialog hinterlegt: verstaendliche Rueckmeldung statt Stille.
      const name = npc ? this.npcs.displayName(npc) : 'Die Person';
      this.ui.toast(`${name} hat gerade nichts zu sagen.`, 'info');
      onDone?.();
      return false;
    }
    this.game.setMode('dialogue');
    this.dialogueScreen.setTextSpeed(this.settings.get('textSpeed'));
    this.ui.push('dialogue');
    const off = this.dialogue.events.once('finished', () => {
      this.ui.pop('dialogue');
      if (this.game.mode === 'dialogue') this.game.setMode('world');
      onDone?.();
    });
    if (!this.dialogue.start(dialogueId)) {
      off();
      this.ui.pop('dialogue');
      this.game.setMode('world');
      onDone?.();
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------- Weltgegenstaende

  private loadGroundItems(): void {
    for (const item of this.groundItems) this.itemGroup.remove(item.object);
    this.groundItems.length = 0;
    const area = this.game.world.area;
    if (!area) return;

    for (const placement of area.data.items ?? []) {
      const flag = `item:${area.data.id}:${placement.id}`;
      if (this.player.hasFlag(flag)) continue;
      if (placement.minStoryStage !== undefined
        && this.player.storyStage < placement.minStoryStage) continue;

      const itemData = GameData.items.tryGet(placement.item);
      const object = new THREE.Group();
      const mesh = new THREE.Mesh(
        this.game.assets.getShape('octa', 1),
        this.game.assets.getMaterial({
          color: itemData?.color ?? '#e0c04b',
          flatShading: true,
          emissive: placement.hidden ? 0 : 0.35,
          opacity: placement.hidden ? 0.25 : 1,
        }),
      );
      mesh.scale.setScalar(placement.hidden ? 0.16 : 0.26);
      mesh.position.y = placement.hidden ? 0.12 : 0.45;
      mesh.castShadow = true;
      object.add(mesh);
      const [x, z] = placement.pos;
      object.position.set(x, area.heightAt(x, z), z);
      this.itemGroup.add(object);

      this.groundItems.push({
        id: placement.id, itemId: placement.item,
        quantity: placement.quantity ?? 1,
        x, z, object, hidden: placement.hidden ?? false,
      });
    }
  }

  private findNearbyItem(): GroundItem | null {
    const player = this.game.player;
    for (const item of this.groundItems) {
      if (player.canInteractWith(item.x, item.z, item.hidden ? 1.6 : 2.2)) return item;
    }
    return null;
  }

  private pickUpItem(item: GroundItem): void {
    const data = GameData.items.tryGet(item.itemId);
    this.player.addItem(item.itemId, item.quantity);
    this.player.setFlag(`item:${this.game.world.areaId}:${item.id}`, true);
    this.itemGroup.remove(item.object);
    const index = this.groundItems.indexOf(item);
    if (index >= 0) this.groundItems.splice(index, 1);
    this.audio.playSfx('itemGet');
    this.game.player.animator.play('interact');
    this.ui.toast(
      `${data?.name ?? item.itemId}${item.quantity > 1 ? ` x${item.quantity}` : ''} erhalten!`,
      'success',
    );
  }

  /** Rotation der Gegenstaende - macht sie in der Welt auffindbar. */
  private animateGroundItems(dt: number): void {
    for (const item of this.groundItems) {
      item.object.rotation.y += dt * 1.4;
      const child = item.object.children[0];
      if (child) child.position.y = (item.hidden ? 0.12 : 0.45)
        + Math.sin(performance.now() * 0.003 + item.x) * 0.06;
    }
  }

  private checkGroundItems(): void {
    this.animateGroundItems(1 / 60);
  }

  // --------------------------------------------------------------- Trigger

  private checkAreaTriggers(): void {
    const area = this.game.world.area;
    if (!area) return;
    const player = this.game.player;

    for (const trigger of area.data.triggers ?? []) {
      const key = `${area.data.id}:${trigger.id}`;
      if (trigger.once !== false && this.firedTriggers.has(key)) continue;
      if (this.player.hasFlag(`trigger:${key}`)) continue;

      const req = trigger.requires;
      if (req?.storyStage !== undefined && this.player.storyStage < req.storyStage) continue;
      if (req?.flag && !this.player.hasFlag(req.flag)) continue;
      if (req?.notFlag && this.player.hasFlag(req.notFlag)) continue;

      const distance = Math.hypot(trigger.pos[0] - player.x, trigger.pos[1] - player.z);
      if (distance > trigger.radius) continue;

      this.firedTriggers.add(key);
      if (trigger.once !== false) this.player.setFlag(`trigger:${key}`, true);
      this.executeTrigger(trigger.action);
      return;
    }
  }

  private executeTrigger(action: NonNullable<ReturnType<() => unknown>> extends never ? never
    : { kind: string } & Record<string, unknown>): void {
    switch (action.kind) {
      case 'cutscene':
        this.playCutscene(action.cutscene as string);
        break;
      case 'dialogue':
        this.startDialogue(action.dialogue as string);
        break;
      case 'battle':
        this.startTrainerBattle(action.trainer as string);
        break;
      case 'setFlag':
        this.player.setFlag(action.flag as string, true);
        break;
      case 'storyStage':
        this.player.setStoryStage(action.stage as number);
        break;
      case 'message':
        this.ui.toast(action.text as string, 'info', 4);
        break;
    }
  }

  playCutscene(cutsceneId: string, onDone?: () => void): void {
    if (!GameData.cutscenes.has(cutsceneId)) {
      log.warn(`Cutscene "${cutsceneId}" fehlt - wird uebersprungen`);
      onDone?.();
      return;
    }
    this.game.setMode('cutscene');
    this.game.player.setControlEnabled(false);
    const started = this.cutscenes.play(cutsceneId, () => {
      this.game.player.setControlEnabled(true);
      if (this.game.mode === 'cutscene') this.game.setMode('world');
      onDone?.();
    });
    // Abgelehnt (es laeuft bereits eine Sequenz): Steuerung sofort
    // zurueckgeben, sonst bliebe das Spiel im Sequenzmodus haengen.
    if (!started) {
      this.game.player.setControlEnabled(true);
      if (this.game.mode === 'cutscene') this.game.setMode('world');
      onDone?.();
    }
  }

  // ----------------------------------------------------------------- Kaempfe

  private startWildEncounter(instance: WildInstance): void {
    this.battleWildInstance = instance;
    this.player.registerSeen(instance.creature.speciesId);
    this.audio.playSfx('encounter');
    if (instance.creature.species.cry) this.audio.playCry(instance.creature.species.cry);

    this.startBattle({
      kind: instance.rare ? 'legendary' : 'wild',
      playerParty: this.player.party,
      enemyParty: [instance.creature],
      playerName: this.player.name,
      enemyName: instance.creature.name,
      aiProfile: 'basic',
      ambientWeather: this.game.world.currentWeather,
      timeOfDay: this.game.time.timeOfDay,
      inCave: this.game.world.area?.data.kind === 'cave',
      playerCanGigantic: this.player.hasFlag('giganticUnlocked'),
      allowCapture: true,
      allowFlee: true,
    });
  }

  startTrainerBattleWithNpc(npc: NpcInstance): void {
    const trainerId = npc.placement.trainer;
    if (!trainerId) return;
    this.battleTrainerNpc = npc;
    const trainer = GameData.trainers.tryGet(trainerId);
    if (!trainer) {
      log.error(`Trainer "${trainerId}" fehlt`);
      this.battleTrainerNpc = null;
      return;
    }
    // Vorkampf-Dialog, danach der Kampf.
    const lines = trainer.dialogue.intro;
    this.showQuickMessage(trainer.name, lines, () => this.startTrainerBattle(trainerId));
  }

  startTrainerBattle(trainerId: string, gigantic = false, onDone?: () => void): void {
    const trainer = GameData.trainers.tryGet(trainerId);
    if (!trainer) {
      log.error(`Trainer "${trainerId}" fehlt`);
      onDone?.();
      return;
    }
    const rematch = this.player.hasFlag(`trainer:${trainerId}`) && trainer.rematchTeam;
    const team = this.game.creatures.createTeam(
      rematch ? trainer.rematchTeam! : trainer.team, trainer.name,
    );
    const gym = GameData.gyms.filter((g) => g.leader === trainerId)[0];

    const league = this.league.data;
    const isLeague = this.league.belongsToLeague(trainerId);
    const isChampion = isLeague && league?.champion === trainerId;

    this.battleOnDone = onDone ?? null;
    this.startBattle({
      kind: isChampion ? 'final' : isLeague ? 'league'
        : gym ? 'gym' : trainerId.includes('rival') ? 'rival' : 'trainer',
      playerParty: this.player.party,
      enemyParty: team,
      playerName: this.player.name,
      enemyName: trainer.name,
      trainerId,
      aiProfile: trainer.ai,
      enemyItems: trainer.items ?? [],
      rewardBase: trainer.rewardBase,
      ambientWeather: this.game.world.currentWeather,
      timeOfDay: this.game.time.timeOfDay,
      playerCanGigantic: this.player.hasFlag('giganticUnlocked'),
      enemyCanGigantic: trainer.canGigantic ?? false,
      allowCapture: false,
      allowFlee: false,
      withCrowd: gym !== undefined || isLeague,
    }, trainer.appearance, gym?.colors ?? (isLeague ? league?.colors : undefined), gigantic);
  }

  startWildBattleDirect(
    speciesId: string, level: number, legendary: boolean, onDone?: () => void,
  ): void {
    const creature = this.game.creatures.create(speciesId, {
      level, perfectIvs: legendary ? 3 : 0,
    });
    this.player.registerSeen(speciesId);
    this.battleOnDone = onDone ?? null;
    this.startBattle({
      kind: legendary ? 'legendary' : 'wild',
      playerParty: this.player.party,
      enemyParty: [creature],
      playerName: this.player.name,
      enemyName: creature.name,
      aiProfile: legendary ? 'expert' : 'basic',
      ambientWeather: this.game.world.currentWeather,
      timeOfDay: this.game.time.timeOfDay,
      playerCanGigantic: this.player.hasFlag('giganticUnlocked'),
      allowCapture: true,
      allowFlee: !legendary,
    });
  }

  private startBattle(
    setup: BattleSetup,
    enemyAppearance?: NpcAppearance,
    stadiumColors?: { primary: string; secondary: string },
    forceGigantic = false,
  ): void {
    if (this.player.party.length === 0 || !this.player.hasUsableCreature) {
      this.ui.toast(
        'Du hast keine einsatzfaehige Kreatur - bring dein Team zu einer Heilstation.',
        'warn', 4,
      );
      this.battleWildInstance = null;
      this.battleTrainerNpc = null;
      return;
    }

    this.wild.setPaused(true);
    this.game.setMode('battle');
    this.game.player.setControlEnabled(false);

    const engine = new BattleEngine({
      ...setup,
      getItemCount: (itemId) => this.player.itemCount(itemId),
      consumeItem: (itemId) => this.player.removeItem(itemId, 1),
      seed: `battle-${Date.now()}`,
      enemyCanGigantic: setup.enemyCanGigantic || forceGigantic,
    });
    this.battleEngine = engine;

    const area = this.game.world.area;
    const lighting = this.game.time.lighting;
    this.battleScene.configure({
      biome: area?.data.biome ?? 'grassland',
      weather: this.game.world.currentWeather,
      indoor: area?.data.indoor ?? false,
      sunColor: lighting.sunColor,
      ambientColor: lighting.ambientColor,
      fogColor: lighting.fogColor,
      sunIntensity: lighting.sunIntensity,
      ambientIntensity: lighting.ambientIntensity,
      stadium: stadiumColors,
    });
    this.battleScene.setTrainers(enemyAppearance ?? null, this.playerAppearance());
    if (setup.withCrowd) this.battleScene.addCrowd(stadiumColors?.secondary ?? '#4b6b9b');

    this.audio.playMusic(this.musicForBattle(setup));

    this.battleScreen = new BattleScreen({
      engine,
      scene: this.battleScene,
      audio: this.audio,
      player: this.player,
      settings: this.settings,
      onFinished: () => this.finishBattle(),
      onEvolutionReady: (uid, toSpecies) => {
        this.pendingEvolutions.push({ uid, toSpecies });
      },
    });
    this.ui.register(this.battleScreen);
    this.ui.push('battle');
  }

  private musicForBattle(setup: BattleSetup): string {
    switch (setup.kind) {
      case 'gym': return 'boss';
      case 'rival': return 'battleTrainer';
      case 'league': return 'league';
      case 'final': return 'finalBattle';
      case 'raid': return 'raid';
      case 'legendary': return 'boss';
      case 'trainer': return 'battleTrainer';
      default: return 'battleWild';
    }
  }

  private playerAppearance(): NpcAppearance {
    return {
      skin: '#e8c19b', hair: '#3a2a1c', shirt: '#d84b3b',
      pants: '#3a4a6b', accent: '#f0e6d2', hat: 'cap',
    };
  }

  private finishBattle(): void {
    const engine = this.battleEngine;
    const result = engine?.result;
    this.ui.pop('battle');
    this.battleScreen = null;
    this.battleEngine = null;
    this.battleScene.reset();
    this.wild.setPaused(false);
    this.game.setMode('world');
    this.game.player.setControlEnabled(true);

    if (!result) {
      this.finishBattleCallback();
      return;
    }

    // Vorher/nachher messen: bei wenig Geld zahlt der Spieler weniger als
    // die Niederlagensumme, und gemeldet werden soll der echte Verlust.
    const moneyBefore = this.player.money;
    if (result.moneyDelta !== 0) this.player.addMoney(result.moneyDelta);
    const moneyPaid = Math.max(0, moneyBefore - this.player.money);

    if (result.caughtCreature) {
      const creature = result.caughtCreature;
      const where = this.player.addCreature(creature);
      this.audio.playSfx('ballCatch');
      this.ui.toast(
        where === 'party'
          ? `${creature.name} wurde ins Team aufgenommen!`
          : `${creature.name} wurde in eine Box geschickt.`,
        'success', 4,
      );
      if (this.battleWildInstance) this.wild.resolveEncounter(this.battleWildInstance, true);
    } else if (this.battleWildInstance) {
      this.wild.resolveEncounter(this.battleWildInstance, false);
      if (result.outcome === 'win') this.wild.remove(this.battleWildInstance);
    }
    this.battleWildInstance = null;

    if (result.outcome === 'win' && result.defeatedTrainerId) {
      this.onTrainerDefeated(result.defeatedTrainerId);
    }

    const raidDen = this.activeRaidDen;
    this.activeRaidDen = null;
    if (raidDen && (result.outcome === 'win' || result.outcome === 'caught')) {
      this.grantRaidRewards(raidDen);
    }
    if (result.outcome === 'loss') {
      this.handleBlackout(moneyPaid);
      return;
    }

    this.hud.forceRefresh();
    this.updateMusic();
    this.processPendingEvolutions();
    this.finishBattleCallback();
  }

  private finishBattleCallback(): void {
    const done = this.battleOnDone;
    this.battleOnDone = null;
    done?.();
  }

  private onTrainerDefeated(trainerId: string): void {
    this.player.setFlag(`trainer:${trainerId}`, true);
    this.npcs.markDefeated(trainerId);
    const npc = this.battleTrainerNpc;
    this.battleTrainerNpc = null;

    const trainer = GameData.trainers.tryGet(trainerId);
    const gym = GameData.gyms.filter((g) => g.leader === trainerId)[0];

    const afterLines = () => {
      if (gym) this.awardBadge(gym.badgeIndex, gym.badgeName, gym);
      this.onLeagueTrainerDefeated(trainerId);
    };
    if (trainer?.dialogue.defeat?.length) {
      this.showQuickMessage(trainer.name, trainer.dialogue.defeat, afterLines);
    } else {
      afterLines();
    }
    void npc;
  }

  // ------------------------------------------------------------------- Liga

  /** Startet oder beendet die Ligaherausforderung beim Gebietswechsel. */
  private updateLeagueRun(areaId: string): void {
    const league = GameData.leagues.all().find((l) => l.area === areaId);
    if (!league) {
      if (this.league.isRunning) {
        this.league.abort();
        this.ui.toast('Die Ligaherausforderung wurde abgebrochen.', 'warn', 4);
      }
      return;
    }
    if (this.league.isRunning) return;
    const result = this.league.start(areaId, this.player.badgeCount);
    if (result.started) {
      this.ui.toast(
        `${league.name}: ${this.league.total} Kaempfe ohne Pause. Viel Erfolg!`,
        'info', 5,
      );
    } else if (result.reason) {
      this.ui.toast(result.reason, 'warn', 4);
    }
  }

  /** Wertet den Sieg ueber einen Ligagegner aus. */
  private onLeagueTrainerDefeated(trainerId: string): boolean {
    if (!this.league.belongsToLeague(trainerId)) return false;
    const league = this.league.data;
    const step = this.league.defeat(trainerId);
    if (!league || step === 'ignoriert') return false;

    if (step === 'weiter' || step === 'champion') {
      const nextId = this.league.currentTrainerId;
      const next = nextId ? GameData.trainers.tryGet(nextId)?.name ?? nextId : '';
      this.ui.toast(
        step === 'champion'
          ? `Alle Herausforderer besiegt! Jetzt wartet Champion ${next}.`
          : `${this.league.defeated} / ${this.league.total} - als Naechstes: ${next}`,
        'success', 5,
      );
      return true;
    }

    // Der Champion ist besiegt: Sieg festhalten und feiern.
    this.player.setFlag(league.victoryFlag, true);
    this.player.addMoney(league.rewardMoney);
    this.player.setStoryStage(Math.max(this.player.storyStage, league.storyStageAfter));
    const entry = this.player.recordHallOfFame();
    this.quests.evaluate();
    this.hud.forceRefresh();
    log.info(`Liga gewonnen mit ${entry.team.length} Kreaturen`);

    const showHall = () => {
      this.audio.playMusic('hallOfFame');
      this.hallOfFameScreen.showEntry(this.player.hallOfFame.length - 1);
      this.ui.push('hallOfFame');
    };
    this.playCutscene(league.victoryCutscene, showHall);
    return true;
  }

  private awardBadge(
    index: number, name: string,
    gym: { rewardItems?: string[]; badgeIndex: number; city: string },
  ): void {
    this.player.earnBadge(index, name);
    for (const itemId of gym.rewardItems ?? []) this.player.addItem(itemId, 1);
    this.player.setStoryStage(this.player.storyStage + 1);
    this.quests.evaluate();
    this.hud.forceRefresh();
  }

  /** Niederlage: zurueck zur letzten Heilstation. */
  /**
   * Niederlage: das Team bleibt am Boden und der Spieler bleibt, wo er ist.
   *
   * Frueher wurde das Team kostenlos geheilt und der Spieler sofort zur
   * letzten Heilstation versetzt - eine Niederlage kostete damit nichts
   * ausser ein paar Sekunden. Jetzt bleibt sie stehen: kein Teleport,
   * keine Heilung, nur die Bergungskosten. Den Rueckweg zur Heilstation
   * geht man selbst.
   */
  private handleBlackout(moneyPaid: number): void {
    if (this.league.isRunning) {
      this.league.abort();
      this.ui.toast('Die Ligaherausforderung ist gescheitert.', 'warn', 4);
    }

    this.game.player.setControlEnabled(false);
    this.hud.forceRefresh();
    this.updateMusic();

    this.fadeToBlack(1.3, () => {
      const lines = [
        'Dein Team ist am Ende - keine Kreatur kann weiterkaempfen.',
        moneyPaid > 0
          ? `Fuer die Bergung gehen ${moneyPaid} M drauf.`
          : 'Du hast nicht einmal mehr Geld fuer die Bergung.',
        'Niemand traegt dich zurueck. Bring dein Team selbst zur naechsten '
          + 'Heilstation - angegriffen wirst du auf dem Weg nicht.',
      ];
      this.showQuickMessage('Niederlage', lines, () => {
        this.game.player.setControlEnabled(true);
        this.hud.forceRefresh();
        this.finishBattleCallback();
      });
    });
  }

  /**
   * Blendet den Bildschirm schwarz, ruft in der Dunkelheit den Rueckruf auf
   * und blendet wieder auf. Der Rueckruf laeuft im dunkelsten Moment - dort
   * gehoert die Meldung hin.
   */
  private fadeToBlack(seconds: number, onDark: () => void): void {
    const half = Math.max(0.2, seconds / 2);
    this.fadeLayer.style.background = '#000000';
    this.fadeLayer.style.transition = `opacity ${half}s ease`;
    this.fadeLayer.style.opacity = '1';
    window.setTimeout(() => {
      onDark();
      this.fadeLayer.style.opacity = '0';
    }, half * 1000);
  }

  /** Ohne einsatzfaehige Kreatur laesst die Welt den Spieler in Ruhe. */
  private get partyIsDown(): boolean {
    return !this.player.hasUsableCreature;
  }

  /**
   * Weist auf das kampfunfaehige Team hin - hoechstens alle 12 Sekunden.
   *
   * Ohne die Sperre kaeme der Hinweis bei jedem Grasbueschel erneut und
   * der Rueckweg waere eine Wand aus Meldungen.
   */
  private warnPartyDown(): void {
    const now = performance.now();
    if (now - this.partyDownWarnedAt < 12_000) return;
    this.partyDownWarnedAt = now;
    this.ui.toast(
      'Dein Team ist kampfunfaehig - niemand greift dich an. Such eine Heilstation.',
      'warn', 3.5,
    );
  }

  // ------------------------------------------------------------- Aktionen

  /** Fuehrt eine Dialog-/Cutscene-Aktion aus. */
  runAction(action: DialogueAction): void {
    switch (action.kind) {
      case 'setFlag':
        this.player.setFlag(action.flag, action.value ?? true);
        break;
      case 'storyStage':
        this.player.setStoryStage(action.stage);
        this.quests.autoStart();
        break;
      case 'giveItem': {
        const quantity = action.quantity ?? 1;
        this.player.addItem(action.item, quantity);
        const name = GameData.items.tryGet(action.item)?.name ?? action.item;
        this.audio.playSfx('itemGet');
        this.ui.toast(`${name}${quantity > 1 ? ` x${quantity}` : ''} erhalten!`, 'success');
        break;
      }
      case 'takeItem':
        this.player.removeItem(action.item, action.quantity ?? 1);
        break;
      case 'giveMoney':
        this.player.addMoney(action.amount);
        this.audio.playSfx('money');
        break;
      case 'giveCreature': {
        const creature = this.game.creatures.create(action.species, {
          level: action.level, originalTrainer: this.player.name,
        });
        const where = this.player.addCreature(creature);
        this.audio.playSfx('ballCatch');
        this.ui.toast(
          where === 'party'
            ? `${creature.name} schliesst sich dir an!`
            : `${creature.name} wurde in eine Box geschickt.`,
          'success', 4,
        );
        break;
      }
      case 'startBattle':
        this.startTrainerBattle(action.trainer);
        break;
      case 'healParty':
        this.healParty();
        break;
      case 'openShop':
        this.openShop(action.shop);
        break;
      case 'startQuest':
        this.quests.start(action.quest);
        break;
      case 'advanceQuest':
        this.quests.advance(action.quest, action.step);
        break;
      case 'completeQuest':
        this.quests.complete(action.quest);
        break;
      case 'cutscene':
        this.playCutscene(action.cutscene);
        break;
      case 'chooseStarter':
        this.openStarterSelection();
        break;
      case 'openBox':
        this.ui.push('team');
        break;
      case 'fastTravel':
        this.ui.push('map');
        break;
      case 'openCamp':
        this.openCamp();
        break;
      case 'teleport':
        this.game.enterArea(action.area, action.spawnPoint);
        break;
      case 'startRaid': {
        const den = this.raids.denById(action.den);
        if (den) this.openRaidBriefing(den);
        else this.ui.toast('Hier gibt es keinen Energiepunkt.', 'warn');
        break;
      }
    }
  }

  // -------------------------------------------------------------- Raid-Kaempfe

  /** Zeigt die Vorschau eines Energiepunktes. */
  private openRaidBriefing(den: DenState): void {
    if (den.cleared) {
      this.ui.toast('Dieser Energiepunkt ist bereits geleert.', 'info');
      return;
    }
    if (!den.active) {
      this.ui.toast('Dieser Energiepunkt ruht gerade.', 'info');
      return;
    }
    const raid = this.raids.raidFor(den);
    const boss = this.raids.bossFor(den);
    if (!raid || !boss) {
      this.ui.toast('Der Energiepunkt ist erloschen.', 'warn');
      return;
    }

    // Ohne Energiedetektor bleibt verborgen, was im Nest steckt.
    const detector = this.player.hasItem('energiedetektor');
    const briefing: RaidBriefing = {
      den,
      bossSpecies: detector ? boss.species : null,
      bossLevel: boss.level,
      gigantic: boss.gigantic === true,
      allyNames: raid.allies.map((id) => GameData.trainers.tryGet(id)?.name ?? id),
      shields: raid.shieldThresholds.length,
      turnLimit: raid.turnLimit,
      rewards: raid.rewardItems.map((r) => GameData.items.tryGet(r.item)?.name ?? r.item),
      warning: boss.level > this.player.obedienceLevel + 8
        ? 'Warnung: Dieser Gegner ist deutlich staerker als dein Team.'
        : null,
    };
    this.audio.playSfx('raidOpen');
    this.raidScreen.setBriefing(briefing);
    this.ui.push('raid');
  }

  /** Startet den Raid-Kampf gegen den Boss eines Nestes. */
  private startRaidBattle(den: DenState): void {
    const raid = this.raids.raidFor(den);
    const boss = this.raids.bossFor(den);
    if (!raid || !boss) return;

    const bossCreature = this.game.creatures.create(boss.species, {
      level: boss.level,
      perfectIvs: 3 + den.tier,
      giganticFactor: boss.gigantic === true,
      originalTrainer: 'Energiepunkt',
    });
    this.player.registerSeen(boss.species);

    // Verbuendete: jeweils die staerkste Kreatur des Trainers.
    const allies = raid.allies.slice(0, 3).map((trainerId) => {
      const trainer = GameData.trainers.tryGet(trainerId);
      const entry = trainer?.team.reduce(
        (best, cur) => (cur.level > best.level ? cur : best), trainer.team[0]!,
      );
      const level = Math.max(5, Math.min(boss.level - 2, entry?.level ?? boss.level - 5));
      const creature = this.game.creatures.create(entry?.species ?? boss.species, {
        level,
        moves: entry?.moves,
        originalTrainer: trainer?.name ?? 'Verbuendeter',
        perfectIvs: 2,
      });
      return {
        creature,
        ai: (den.tier >= 4 ? 'smart' : 'basic') as 'smart' | 'basic',
        trainerName: trainer?.name ?? 'Verbuendeter',
        downTurns: 0,
      };
    });

    this.activeRaidDen = den;
    this.audio.playSfx('raidPulse');
    this.startBattle({
      kind: 'raid',
      playerParty: this.player.party,
      enemyParty: [bossCreature],
      playerName: this.player.name,
      enemyName: bossCreature.name,
      aiProfile: den.tier >= 4 ? 'boss' : 'expert',
      ambientWeather: this.game.world.currentWeather,
      timeOfDay: this.game.time.timeOfDay,
      playerCanGigantic: this.player.hasFlag('giganticUnlocked'),
      allowCapture: true,
      allowFlee: false,
      rewardBase: 90 + den.tier * 40,
      raid: {
        shieldThresholds: raid.shieldThresholds,
        turnLimit: raid.turnLimit,
        allies,
      },
    });
  }

  /** Beute nach einem gewonnenen Raid. */
  private grantRaidRewards(den: DenState): void {
    const raid = this.raids.raidFor(den);
    if (!raid) return;
    this.raids.markCleared(den.id);

    const rng = this.game.rng.fork(`raid-reward-${den.id}-${this.game.time.day}`);
    const drops = 2 + Math.floor(den.tier / 2);
    const names: string[] = [];
    for (let i = 0; i < drops; i++) {
      const entry = rng.weighted(
        raid.rewardItems.map((r) => ({ value: r, weight: r.weight })),
      );
      if (!entry) continue;
      this.player.addItem(entry.item, entry.quantity);
      names.push(`${GameData.items.tryGet(entry.item)?.name ?? entry.item} x${entry.quantity}`);
    }
    if (names.length > 0) {
      this.audio.playSfx('itemGet');
      this.ui.toast(`Raid-Beute: ${names.join(', ')}`, 'success', 5);
    }
  }

  /** Ab dem dritten Orden darf der Spieler gigantifizieren. */
  private checkGiganticUnlock(): void {
    if (this.player.hasFlag('giganticUnlocked')) return;
    if (this.player.badgeCount < GameConfig.battle.giganticBadgeRequirement) return;
    this.player.setFlag('giganticUnlocked', true);
    this.audio.playSfx('gigantic');
    this.ui.toast(
      'Dein Band reagiert! Ab jetzt kannst du im Kampf gigantifizieren.',
      'success', 6,
    );
  }

  /**
   * Wirkung der Schluesselgegenstaende.
   *
   * Laufschuhe erlauben das Rennen, das Gelaenderad macht zusaetzlich
   * schneller. Wird nach jeder Bestandsaenderung und beim Laden geprueft.
   */
  private applyKeyItems(): void {
    this.game.player.setRunUnlocked(this.player.hasItem('laufschuhe'));
    this.game.player.setSpeedBonus(this.player.hasItem('fahrrad') ? 1.35 : 1);
  }

  private healParty(): void {
    this.player.healParty();
    this.audio.playSfx('heal');
    this.battleScene.effects.heal(new THREE.Vector3(this.game.player.x, 1, this.game.player.z));
    this.hud.forceRefresh();
    this.ui.toast('Dein Team ist wieder vollstaendig erholt!', 'success', 3.5);
    this.player.setFlag(`visited:${this.game.world.areaId}`, true);
  }

  /** Gegenstand ausserhalb der Menues benutzen - fuer Tests und Skripte. */
  useItemForTest(itemId: string, creature: Creature | null): string {
    return this.useItem(itemId, creature);
  }

  private useItem(itemId: string, creature: Creature | null): string {
    const item = GameData.items.tryGet(itemId);
    if (!item) return 'Unbekannter Gegenstand.';

    if (!creature) {
      const result = useFieldItem(this.player, itemId);
      this.audio.playSfx(result.success ? 'confirm' : 'error');
      return result.message;
    }

    const result = useItemOnCreature(this.player, itemId, creature, {
      timeOfDay: this.game.time.timeOfDay,
      areaId: this.game.world.areaId ?? '',
    });
    this.audio.playSfx(result.success ? 'heal' : 'error');
    if (result.evolveTo) {
      this.beginEvolution(creature, result.evolveTo);
    }
    if (result.teachMove) {
      this.teachMove(creature, result.teachMove, itemId);
    }
    this.hud.forceRefresh();
    return result.message;
  }

  private teachMove(creature: Creature, moveId: string, itemId: string): void {
    const move = GameData.moves.tryGet(moveId);
    if (!move) return;
    if (creature.moves.length < 4) {
      creature.learnMove(moveId);
      this.player.removeItem(itemId, 1);
      this.audio.playSfx('confirm');
      this.ui.toast(`${creature.name} erlernt ${move.name}!`, 'success');
      return;
    }
    // Vier Attacken belegt: Auswahl ueber eine einfache Abfrage.
    const names = creature.moves.map((m, i) => `${i + 1}. ${GameData.moves.get(m.moveId).name}`);
    const answer = window.prompt(
      `${creature.name} kennt bereits vier Attacken.\n${names.join('\n')}\n\n`
      + `Welche soll durch ${move.name} ersetzt werden? (1-4, leer = abbrechen)`,
    );
    const index = answer ? Number.parseInt(answer, 10) - 1 : NaN;
    if (Number.isInteger(index) && index >= 0 && index < creature.moves.length) {
      creature.learnMove(moveId, index);
      this.player.removeItem(itemId, 1);
      this.audio.playSfx('confirm');
      this.ui.toast(`${creature.name} erlernt ${move.name}!`, 'success');
    } else {
      this.ui.toast(`${creature.name} hat ${move.name} nicht erlernt.`, 'info');
    }
  }

  // --------------------------------------------------------------- Shop

  private openShop(shopId: string): void {
    const shop = GameData.shops.tryGet(shopId);
    if (!shop) {
      this.ui.toast('Dieser Laden hat gerade geschlossen.', 'warn');
      return;
    }
    void import('@/ui/screens/ShopScreen').then(({ ShopScreen }) => {
      const screen = new ShopScreen(this.menuContext(), shop, this.audio);
      this.ui.register(screen);
      this.ui.push(screen.id);
    });
  }

  private openCamp(): void {
    void import('@/ui/screens/CampScreen').then(({ CampScreen }) => {
      const screen = new CampScreen(this.menuContext(), this.audio);
      this.ui.register(screen);
      this.ui.push(screen.id);
    });
  }

  private openStarterSelection(): void {
    void import('@/ui/screens/StarterScreen').then(({ StarterScreen }) => {
      const screen = new StarterScreen(
        this.menuContext(), this.audio,
        ['sprossling', 'glutkitz', 'tropfling'],
        (speciesId: string) => {
          const creature = this.game.creatures.create(speciesId, {
            level: 5, originalTrainer: this.player.name, friendship: 80,
          });
          this.player.addCreature(creature);
          this.player.setFlag('starterChosen', true);
          this.player.setStoryStage(Math.max(2, this.player.storyStage));
          this.audio.playSfx('ballCatch');
          this.ui.toast(`${creature.name} schliesst sich dir an!`, 'success', 4);
          this.hud.forceRefresh();
          this.quests.evaluate();
        },
      );
      this.ui.register(screen);
      this.ui.push(screen.id);
    });
  }

  // ---------------------------------------------------------- Entwicklung

  private processPendingEvolutions(): void {
    const next = this.pendingEvolutions.shift();
    if (!next) return;
    const creature = this.player.findCreature(next.uid);
    if (!creature) {
      this.processPendingEvolutions();
      return;
    }
    this.beginEvolution(creature, next.toSpecies, () => this.processPendingEvolutions());
  }

  /** Entwicklungs-Cinematic mit Modellwechsel. */
  beginEvolution(creature: Creature, toSpecies: string, onDone?: () => void): void {
    const target = GameData.species.tryGet(toSpecies);
    if (!target) {
      onDone?.();
      return;
    }
    this.game.setMode('cutscene');
    this.game.player.setControlEnabled(false);
    this.audio.playMusic('victory', 0.4);
    this.audio.playSfx('evolution');

    const model = buildCreatureModel(creature.species.model, this.game.assets, {
      scale: creature.modelScale * 1.6,
    });
    const position = new THREE.Vector3(
      this.game.player.x, this.game.player.y + 1.2, this.game.player.z,
    );
    model.root.position.copy(position);
    this.game.world.scene.add(model.root);
    const animator = new CreatureAnimator(model);
    animator.play('evolution');

    this.battleScene.effects.evolution(position);
    this.evolutionOverlay = {
      model, animator, creature, toSpecies, timer: 0, phase: 'start',
    };
    this.evolutionDone = () => {
      this.game.player.setControlEnabled(true);
      if (this.game.mode === 'cutscene') this.game.setMode('world');
      this.updateMusic();
      this.hud.forceRefresh();
      onDone?.();
    };
    this.ui.toast(`${creature.name} entwickelt sich!`, 'info', 3);
  }

  private evolutionDone: (() => void) | null = null;

  private updateEvolution(dt: number): void {
    const overlay = this.evolutionOverlay;
    if (!overlay) return;
    overlay.timer += dt;
    overlay.animator.update(dt);
    overlay.model.root.rotation.y += dt * 1.6;

    const position = overlay.model.root.position;
    if (overlay.phase === 'start' && overlay.timer > 1.6) {
      // Modellwechsel im hellsten Moment.
      overlay.phase = 'morph';
      this.battleScene.effects.flash('#ffffff', 0.5);
      this.game.world.scene.remove(overlay.model.root);
      overlay.creature.evolveInto(overlay.toSpecies);
      this.player.registerCaught(overlay.toSpecies);

      const newModel = buildCreatureModel(overlay.creature.species.model, this.game.assets, {
        scale: overlay.creature.modelScale * 1.6,
      });
      newModel.root.position.copy(position);
      this.game.world.scene.add(newModel.root);
      overlay.model = newModel;
      overlay.animator = new CreatureAnimator(newModel);
      overlay.animator.play('victory');
      this.battleScene.effects.evolution(position);
      this.audio.playSfx('levelUp');
      this.ui.toast(`Entwicklung zu ${overlay.creature.name}!`, 'success', 4);
    } else if (overlay.phase === 'morph' && overlay.timer > 4.2) {
      overlay.phase = 'done';
      this.game.world.scene.remove(overlay.model.root);
      this.evolutionOverlay = null;
      const done = this.evolutionDone;
      this.evolutionDone = null;
      done?.();
    }
  }

  // ------------------------------------------------------ Kurzmitteilungen

  /** Zeigt Textzeilen ohne eigenen Dialogbaum (Trainer-Spruch, Cutscene). */
  showQuickMessage(speaker: string | undefined, lines: string[], onDone: () => void): void {
    if (lines.length === 0) {
      onDone();
      return;
    }
    void import('@/ui/screens/MessageScreen').then(({ MessageScreen }) => {
      const screen = new MessageScreen(
        speaker ?? null, lines,
        this.settings.get('textSpeed'), this.audio,
        () => {
          this.ui.pop(screen.id);
          onDone();
        },
      );
      this.ui.register(screen);
      this.ui.push(screen.id);
    });
  }

  // ------------------------------------------------------- Speichern/Laden

  async saveGame(slot: string, silent = false): Promise<boolean> {
    const area = GameData.areas.tryGet(this.player.areaId);
    const data: SaveData = {
      meta: {
        slot,
        savedAt: Date.now(),
        playerName: this.player.name,
        playtimeSeconds: this.player.playtimeSeconds,
        badgeCount: this.player.badgeCount,
        partySize: this.player.party.length,
        caughtCount: this.player.caughtSpecies.size,
        areaName: area?.name ?? this.player.areaId,
        storyStage: this.player.storyStage,
        version: GameConfig.saveVersion,
      },
      state: this.player.serialize({
        position: this.game.player.serialize(),
        hour: this.game.time.hour,
        day: this.game.time.day,
        raids: this.raids.serialize(),
        settings: {},
      }),
    };
    const ok = await this.saves.save(slot, data);
    if (ok && !silent) this.audio.playSfx('save');
    return ok;
  }

  async loadGame(slot: string): Promise<boolean> {
    const data = await this.saves.load(slot);
    if (!data) return false;

    this.cutscenes.abort();
    this.ui.popAll();
    this.ui.push('hud');
    this.battleScene.reset();
    this.firedTriggers.clear();
    this.pendingEvolutions.length = 0;

    this.player.deserialize(data.state);
    this.game.time.deserialize({ hour: data.state.hour, day: data.state.day });
    this.game.enterArea(this.player.areaId, this.player.spawnPoint);
    this.raids.deserialize(data.state.raids);
    this.checkGiganticUnlock();
    this.game.player.deserialize(data.state.position);
    this.game.setMode('world');
    this.game.player.setControlEnabled(true);
    this.hud.forceRefresh();
    this.updateMusic();
    log.info(`Spielstand "${slot}" geladen`);
    return true;
  }

  private fastTravel(areaId: string): boolean {
    if (!GameData.areas.has(areaId)) return false;
    if (!this.player.visitedAreas.has(areaId)) return false;
    this.game.enterArea(areaId, 'default');
    this.audio.playSfx('whoosh');
    return true;
  }

  applySettings(): void {
    const s = this.settings;
    this.audio.setVolume('master', s.get('masterVolume'));
    this.audio.setVolume('music', s.get('musicVolume'));
    this.audio.setVolume('sfx', s.get('sfxVolume'));
    this.game.renderer.setQuality(s.get('quality'));
    this.game.camera.setSensitivity(s.get('cameraSensitivity'));
    this.game.camera.setInvertY(s.get('invertCameraY'));
    this.dialogueScreen?.setTextSpeed(s.get('textSpeed'));
  }

  // ---------------------------------------------------------- Cutscene-Host

  private createCutsceneHost(): CutsceneHost {
    const controller = this;
    /** Benannte Darsteller: "spieler" oder eine NPC-ID. */
    const findNpc = (actor: string): NpcInstance | null =>
      controller.npcs.all.find((n) => n.id === actor) ?? null;

    return {
      moveActor(actor, x, z, dt, run) {
        if (actor === 'spieler') return controller.game.player.moveTo(x, z, dt, run);
        const npc = findNpc(actor);
        if (!npc) return true;
        return controller.npcs.approach(npc, x, z, dt);
      },
      faceActor(actor, target) {
        const position = Array.isArray(target)
          ? { x: target[0], z: target[1] }
          : actor === 'spieler'
            ? { x: controller.game.player.x, z: controller.game.player.z }
            : (() => {
                const npc = findNpc(String(target));
                return npc ? { x: npc.x, z: npc.z } : null;
              })();
        if (!position) return;
        if (actor === 'spieler') {
          controller.game.player.faceTowards(position.x, position.z);
        } else {
          const npc = findNpc(actor);
          if (npc) npc.facing = Math.atan2(position.x - npc.x, position.z - npc.z);
        }
      },
      spawnActor() {
        // Zusaetzliche Darsteller werden ueber die Gebietsdaten gesetzt;
        // dynamisches Nachladen ist bewusst nicht vorgesehen.
      },
      despawnActor() { /* siehe spawnActor */ },
      animateActor(actor, animation) {
        if (actor === 'spieler') {
          controller.game.player.animator.play(animation as never);
          return;
        }
        const npc = findNpc(actor);
        npc?.animator.play(animation as never);
      },
      actorPosition(actor) {
        if (actor === 'spieler') {
          return controller.tmpVec.set(
            controller.game.player.x, controller.game.player.y, controller.game.player.z,
          );
        }
        const npc = findNpc(actor);
        return npc
          ? controller.tmpVec.set(npc.x, controller.game.world.heightAt(npc.x, npc.z), npc.z)
          : null;
      },
      cameraMoveTo(position, target, seconds, ease) {
        controller.game.camera.moveTo(position, target, seconds, ease);
      },
      cameraFollow(actor, distance, height) {
        const position = this.actorPosition(actor);
        if (!position) return;
        controller.game.camera.moveTo(
          new THREE.Vector3(position.x, position.y + height, position.z + distance),
          position.clone(), 0.8, true,
        );
      },
      cameraShake(intensity, seconds) {
        controller.game.camera.shake(intensity, seconds);
      },
      cameraRelease() {
        controller.game.camera.stopCinematic();
        controller.game.camera.setMode('follow');
      },
      showMessage(speaker, lines, onDone) {
        controller.showQuickMessage(speaker, lines, onDone);
      },
      startDialogue(dialogueId, onDone) {
        controller.startDialogue(dialogueId, undefined, onDone);
      },
      runActions(actions) {
        for (const action of actions) controller.runAction(action);
      },
      playMusic(track, fade) {
        if (track === null) controller.audio.stopMusic(fade);
        else controller.audio.playMusic(track, fade);
      },
      playSfx(sound) {
        controller.audio.playSfx(sound as never);
      },
      playEffect(effect, position) {
        const target = position ?? new THREE.Vector3(
          controller.game.player.x, controller.game.player.y + 1, controller.game.player.z,
        );
        const effects = controller.battleScene.effects;
        switch (effect) {
          case 'explosion': effects.explosion(target); break;
          case 'evolution': effects.evolution(target); break;
          case 'gigantic': effects.gigantic(target); break;
          case 'heal': effects.heal(target); break;
          case 'capture': effects.capture(target); break;
          case 'flash': effects.flash('#ffffff', 0.5); break;
          default: effects.byType(effect as ElementType, target); break;
        }
      },
      fade(to, seconds) {
        controller.fadeLayer.style.transition = `opacity ${seconds}s ease`;
        controller.fadeLayer.classList.toggle('white', to === 'white');
        controller.fadeLayer.classList.toggle('active', to !== 'clear');
      },
      setWeather(weather: WeatherKind) {
        controller.game.weather.force(weather);
        controller.game.world.setWeather(weather);
      },
      setHour(hour) {
        controller.game.time.setHour(hour);
      },
      teleport(area, spawnPoint) {
        controller.game.enterArea(area, spawnPoint);
      },
      startTrainerBattle(trainerId, gigantic, onDone) {
        controller.startTrainerBattle(trainerId, gigantic, onDone);
      },
      startWildBattle(species, level, legendary, onDone) {
        controller.startWildBattleDirect(species, level, legendary, onDone);
      },
    };
  }

  // --------------------------------------------------------------- Zugriff

  get mode(): GameMode { return this.game.mode; }

  /** Debug-Ansicht: Kennzahlen fuer das Entwickler-Overlay. */
  get debugInfo(): Record<string, string | number> {
    return {
      modus: this.game.mode,
      gebiet: this.game.world.areaId ?? '-',
      position: `${this.game.player.x.toFixed(1)} / ${this.game.player.z.toFixed(1)}`,
      story: this.player.storyStage,
      team: this.player.party.length,
      wild: this.wild.count,
      npcs: this.npcs.all.length,
      partikel: this.battleScene.effects.particles.activeCount,
      uhrzeit: this.game.time.format(),
      tag: this.game.time.day,
      wetter: this.game.world.currentWeather,
      wetterPartikel: this.game.world.weatherSystem.activeParticles,
      nester: `${this.raids.activeCount}/${this.raids.dens.length}`,
      gefangen: this.player.caughtSpecies.size,
    };
  }

  dispose(): void {
    this.ui.dispose();
    this.npcs.dispose();
    this.debugOverlay.dispose();
    this.wild.dispose();
    this.battleScene.dispose();
    this.audio.dispose();
    this.game.dispose();
  }
}
