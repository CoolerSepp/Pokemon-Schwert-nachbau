import * as THREE from 'three';
import { GameConfig } from './Config';
import { EventBus } from './EventBus';
import { Logger } from './Logger';
import { RNG } from './RNG';
import { GameData } from '@/data/GameData';
import { Renderer } from '@/engine/Renderer';
import { GameLoop } from '@/engine/GameLoop';
import { InputManager } from '@/engine/InputManager';
import { AssetManager } from '@/engine/AssetManager';
import { TimeManager } from '@/world/TimeManager';
import { WorldManager } from '@/world/WorldManager';
import { WeatherDirector } from '@/world/WeatherDirector';
import { PlayerController } from '@/player/PlayerController';
import { CameraManager } from '@/camera/CameraManager';
import { CreatureFactory } from '@/creatures/CreatureFactory';

const log = Logger.scope('Game');

export const GAME_MODES = ['boot', 'world', 'battle', 'cutscene', 'menu', 'dialogue', 'transition'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export interface GameEvents extends Record<string, unknown> {
  modeChanged: { from: GameMode; to: GameMode };
  areaEntered: { areaId: string; areaName: string };
  ready: Record<string, never>;
  /** Ein wiederholbarer Hinweis fuer die Oberflaeche. */
  notice: { text: string; kind?: 'info' | 'warn' | 'success' };
}

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  /** Startgebiet - ueberschreibbar fuer Tests. */
  startArea?: string;
  startSpawnPoint?: string;
  seed?: number | string;
}

/**
 * Zentrale Spielinstanz.
 *
 * Besitzt alle Manager und verdrahtet die Phasen der Spielschleife
 * (Eingabe -> Simulation -> KI -> Animation -> Effekte -> Kamera ->
 * Rendering -> UI). Jede Instanz ist vollstaendig eigenstaendig; `dispose`
 * loest saemtliche Listener, damit ein Neustart keine Reste hinterlaesst.
 */
export class Game {
  readonly events = new EventBus<GameEvents>();
  readonly renderer: Renderer;
  readonly loop = new GameLoop();
  readonly input: InputManager;
  readonly assets = new AssetManager();
  readonly time: TimeManager;
  readonly world: WorldManager;
  readonly weather: WeatherDirector;
  readonly camera: CameraManager;
  readonly player: PlayerController;
  readonly creatures: CreatureFactory;
  readonly rng: RNG;
  readonly uiRoot: HTMLElement;

  private modeValue: GameMode = 'boot';
  private disposed = false;
  private readonly unsubscribes: (() => void)[] = [];
  private pendingAreaChange: { to: string; spawnPoint: string } | null = null;
  private transitionCooldown = 0;
  private readonly tmpVec = new THREE.Vector3();

  constructor(options: GameOptions) {
    this.uiRoot = options.uiRoot;
    this.rng = new RNG(options.seed ?? Date.now());
    this.renderer = new Renderer(options.canvas);
    this.input = new InputManager(options.canvas);
    this.time = new TimeManager();
    this.world = new WorldManager(this.assets, this.time, this.renderer);
    this.weather = new WeatherDirector(this.rng.fork('weather'));
    this.camera = new CameraManager(this.renderer.aspect, this.input);
    this.player = new PlayerController(this.assets, this.input);
    this.creatures = new CreatureFactory(this.rng.fork('creatures'));

    this.camera.setFarPlane(GameConfig.camera.far * this.renderer.profile.drawDistance);
    // Die Weltverwaltung meldet, wie weit die Kamera im geladenen Gebiet
    // sehen muss (Himmelskugel und Bergkulisse).
    this.world.onFarPlane = (distance) => this.camera.setFarPlane(distance);
    // Die Kamera darf nicht im Hang verschwinden.
    this.camera.groundAt = (x, z) => this.world.area?.heightAt(x, z)
      ?? Number.NEGATIVE_INFINITY;
    this.world.scene.add(this.player.object);
    this.input.attach();
    this.registerLoopPhases();
    this.registerResize();
  }

  // ------------------------------------------------------------------ Zugriff

  get mode(): GameMode { return this.modeValue; }
  get isRunning(): boolean { return this.loop.isRunning; }
  /** Zugriff auf die Inhalts-Registry - fuer Debug-Overlay und Tests. */
  get data(): typeof GameData { return GameData; }

  setMode(mode: GameMode): void {
    if (mode === this.modeValue) return;
    const from = this.modeValue;
    this.modeValue = mode;
    // Freie Spielersteuerung nur im Weltmodus.
    const worldControl = mode === 'world';
    this.player.setControlEnabled(worldControl);
    this.input.setEnabled(mode !== 'boot');
    this.events.emit('modeChanged', { from, to: mode });
  }

  /** Startet das Spiel im angegebenen Gebiet. */
  start(areaId: string, spawnPoint = 'default'): void {
    this.enterArea(areaId, spawnPoint);
    this.setMode('world');
    this.loop.start();
    this.events.emit('ready', {});
    log.info(`Spiel gestartet in "${areaId}"`);
  }

  stop(): void {
    this.loop.stop();
  }

  /** Wechselt das Gebiet und setzt den Spieler an den Spawnpunkt. */
  enterArea(areaId: string, spawnPoint = 'default'): void {
    const area = this.world.loadArea(areaId, spawnPoint);
    this.player.setArea(area);
    const point = area.getSpawnPoint(spawnPoint);
    this.player.teleport(point.x, point.z, point.facing);
    this.camera.snapBehind(this.player.x, this.player.y, this.player.z, point.facing);

    // In Innenraeumen mit Decke die Kamera unter der Decke halten.
    const style = area.data.interiorStyle;
    this.camera.setCeiling(
      style && style.ceiling !== false
        ? area.heightAt(point.x, point.z) + style.wallHeight - 0.35
        : null,
    );

    this.world.setWeather(this.weather.enterArea(area.data));
    this.transitionCooldown = 0.6;
    this.events.emit('areaEntered', { areaId: area.data.id, areaName: area.data.name });
  }

  // -------------------------------------------------------------- Spielschleife

  private registerLoopPhases(): void {
    this.unsubscribes.push(
      this.loop.on('input', () => {
        this.input.pollGamepad();
      }),
      this.loop.on('fixed', (dt) => {
        if (this.modeValue === 'world' || this.modeValue === 'cutscene') {
          this.player.update(dt, this.camera.yawAngle);
        }
      }),
      this.loop.on('simulation', (dt) => {
        this.time.update(dt);
        if (this.modeValue === 'world') this.updateWeather(dt);
        if (this.transitionCooldown > 0) this.transitionCooldown -= dt;
        if (this.modeValue === 'world') this.checkAreaTransition();
      }),
      this.loop.on('camera', (dt) => {
        const allowLook = this.modeValue === 'world';
        this.camera.update(
          dt, this.player.x, this.player.y, this.player.z,
          this.world.area?.collision ?? null, allowLook,
        );
      }),
      this.loop.on('render', (dt) => {
        this.world.update(
          dt, this.player.x, this.player.z, this.player.y,
          this.camera.camera.position,
        );
        this.renderer.render(this.world.scene, this.camera.camera, dt * 1000);
      }),
      this.loop.on('ui', () => {
        this.input.endFrame();
        if (this.pendingAreaChange) {
          const change = this.pendingAreaChange;
          this.pendingAreaChange = null;
          this.enterArea(change.to, change.spawnPoint);
        }
      }),
    );
  }

  /** Laesst das Wetter im Freien ueber die Zeit wechseln. */
  private updateWeather(dt: number): void {
    const change = this.weather.update(dt);
    if (!change) return;
    this.world.setWeather(change.weather);
    this.events.emit('notice', { text: change.text, kind: 'info' });
  }

  /** Prueft Gebietsuebergaenge und Tueren an der Spielerposition. */
  private checkAreaTransition(): void {
    if (this.transitionCooldown > 0 || this.pendingAreaChange) return;
    const transition = this.world.checkTransitions(this.player.x, this.player.z);
    if (transition) {
      if (!GameData.areas.has(transition.to)) {
        this.events.emit('notice', {
          text: 'Dieser Weg ist noch nicht begehbar.', kind: 'warn',
        });
        this.transitionCooldown = 1.5;
        return;
      }
      if (!this.transitionAllowed(transition.requires)) {
        this.events.emit('notice', {
          text: transition.blockedText ?? 'Hier kommst du noch nicht weiter.',
          kind: 'warn',
        });
        // Den Spieler ein Stueck zurueckschieben, damit der Hinweis nicht
        // sofort erneut ausloest.
        this.pushBackFromTransition();
        this.transitionCooldown = 2.4;
        return;
      }
      this.pendingAreaChange = { to: transition.to, spawnPoint: transition.spawnPoint };
      return;
    }
    // Tueren erfordern eine Interaktion.
    const door = this.world.checkDoor(this.player.x, this.player.z);
    if (!door || !this.input.wasPressed('interact') || !GameData.areas.has(door.area)) return;
    if (!this.transitionAllowed(door.requires)) {
      this.events.emit('notice', {
        text: door.blockedText ?? 'Diese Tuer ist dir noch verschlossen.',
        kind: 'warn',
      });
      this.transitionCooldown = 1.2;
      return;
    }
    this.pendingAreaChange = { to: door.area, spawnPoint: door.spawnPoint };
  }

  /** Prueft die Voraussetzungen eines Gebietsuebergangs. */
  private transitionAllowed(
    requires: { storyStage?: number; badge?: number; flag?: string } | undefined,
  ): boolean {
    if (!requires) return true;
    const check = this.transitionGate;
    if (!check) return true;
    return check(requires);
  }

  /** Wird vom Controller gesetzt; ohne Pruefer sind alle Uebergaenge offen. */
  transitionGate: ((requires: {
    storyStage?: number; badge?: number; flag?: string;
  }) => boolean) | null = null;

  /** Schiebt den Spieler aus dem Uebergangsbereich heraus. */
  private pushBackFromTransition(): void {
    const area = this.world.area;
    if (!area) return;
    const centerX = area.data.size[0] / 2;
    const centerZ = area.data.size[1] / 2;
    const dx = centerX - this.player.x;
    const dz = centerZ - this.player.z;
    const length = Math.hypot(dx, dz) || 1;
    this.player.teleport(
      this.player.x + (dx / length) * 3,
      this.player.z + (dz / length) * 3,
      this.player.yaw,
    );
  }

  private registerResize(): void {
    const onResize = () => {
      this.renderer.resize();
      this.camera.setAspect(this.renderer.aspect);
    };
    window.addEventListener('resize', onResize);
    this.unsubscribes.push(() => window.removeEventListener('resize', onResize));
  }

  /** Weltposition vor dem Spieler - Hilfsfunktion fuer Interaktionen. */
  getFocusPoint(): THREE.Vector3 {
    return this.tmpVec.set(this.player.x, this.player.y + 1, this.player.z);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
    this.input.detach();
    this.world.dispose();
    this.assets.dispose();
    this.renderer.dispose();
    this.events.clear();
    log.info('Spielinstanz freigegeben');
  }
}
