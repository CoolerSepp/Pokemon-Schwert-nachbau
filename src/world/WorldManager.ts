import * as THREE from 'three';
import { GameData } from '@/data/GameData';
import type { AreaData, WeatherKind } from '@/data/schema';
import { EventBus } from '@/core/EventBus';
import { Logger } from '@/core/Logger';
import type { AssetManager } from '@/engine/AssetManager';
import type { Renderer } from '@/engine/Renderer';
import { AreaRuntime } from './AreaRuntime';
import { PropFactory } from './PropFactory';
import { BuildingFactory } from './BuildingFactory';
import { InteriorFactory } from './InteriorFactory';
import type { TimeManager } from './TimeManager';

const log = Logger.scope('World');

export interface WorldEvents extends Record<string, unknown> {
  areaLoaded: { area: AreaRuntime; spawnPoint: string };
  areaUnloaded: { areaId: string };
  areaChangeRequested: { to: string; spawnPoint: string };
}

/**
 * Verwaltet geladene Gebiete, Beleuchtung und Gebietswechsel.
 *
 * Es ist immer genau ein Gebiet aktiv; zuletzt besuchte Gebiete bleiben
 * begrenzt im Cache, damit Hin- und Herwechseln nicht jedes Mal neu
 * generiert werden muss (Anforderung 47).
 */
export class WorldManager {
  readonly events = new EventBus<WorldEvents>();
  readonly scene = new THREE.Scene();
  private readonly props: PropFactory;
  private readonly buildings: BuildingFactory;
  private readonly interiors: InteriorFactory;
  private readonly cache = new Map<string, AreaRuntime>();
  private readonly cacheOrder: string[] = [];
  private readonly maxCached = 3;

  private activeArea: AreaRuntime | null = null;
  private readonly sun: THREE.DirectionalLight;
  private readonly ambient: THREE.HemisphereLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly sunTarget = new THREE.Object3D();
  private readonly tmpVec = new THREE.Vector3();
  private weather: WeatherKind = 'clear';
  private lightDirty = true;

  constructor(
    assets: AssetManager,
    private readonly time: TimeManager,
    private readonly renderer: Renderer,
  ) {
    this.props = new PropFactory(assets);
    this.buildings = new BuildingFactory(assets);
    this.interiors = new InteriorFactory(assets);

    this.scene.name = 'world';
    this.ambient = new THREE.HemisphereLight(0xcfe4f2, 0x54492f, 0.8);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.4);
    this.sun.castShadow = renderer.profile.shadows;
    this.configureShadow();
    this.scene.add(this.sun);
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    // Schwaches Gegenlicht, damit Schattenseiten nicht schwarz absaufen.
    this.fill = new THREE.DirectionalLight(0x9fb4cc, 0.28);
    this.fill.position.set(-0.6, 0.5, -0.8);
    this.scene.add(this.fill);

    this.scene.fog = new THREE.Fog(0xcfe4f2, 40, 260);

    this.time.events.on('timeOfDayChanged', () => { this.lightDirty = true; });
  }

  private configureShadow(): void {
    const size = this.renderer.profile.shadowMapSize;
    this.sun.shadow.mapSize.set(size, size);
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = 220;
    cam.left = -55;
    cam.right = 55;
    cam.top = 55;
    cam.bottom = -55;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.035;
    cam.updateProjectionMatrix();
  }

  get area(): AreaRuntime | null { return this.activeArea; }
  get areaId(): string | null { return this.activeArea?.data.id ?? null; }
  get currentWeather(): WeatherKind { return this.weather; }

  /** Laedt ein Gebiet und macht es aktiv. */
  loadArea(areaId: string, spawnPoint = 'default'): AreaRuntime {
    const existing = this.cache.get(areaId);
    const area = existing ?? this.buildArea(areaId);

    if (this.activeArea && this.activeArea !== area) {
      this.scene.remove(this.activeArea.root);
      this.events.emit('areaUnloaded', { areaId: this.activeArea.data.id });
    }
    this.activeArea = area;
    this.scene.add(area.root);
    this.touchCache(areaId);
    this.applyAmbience(area);
    this.lightDirty = true;
    this.events.emit('areaLoaded', { area, spawnPoint });
    return area;
  }

  private buildArea(areaId: string): AreaRuntime {
    const data = GameData.areas.get(areaId);
    const area = new AreaRuntime(data, this.props, this.buildings, this.interiors);
    this.cache.set(areaId, area);
    this.cacheOrder.push(areaId);
    this.evictCache();
    return area;
  }

  private touchCache(areaId: string): void {
    const idx = this.cacheOrder.indexOf(areaId);
    if (idx >= 0) this.cacheOrder.splice(idx, 1);
    this.cacheOrder.push(areaId);
    this.evictCache();
  }

  /** Entfernt selten benutzte Gebiete aus dem Speicher. */
  private evictCache(): void {
    while (this.cacheOrder.length > this.maxCached) {
      const oldest = this.cacheOrder.shift();
      if (!oldest || oldest === this.activeArea?.data.id) continue;
      const area = this.cache.get(oldest);
      if (area) {
        area.dispose();
        this.cache.delete(oldest);
        log.debug(`Gebiet "${oldest}" aus dem Cache entfernt`);
      }
    }
  }

  private applyAmbience(area: AreaRuntime): void {
    const ambience = area.data.ambience;
    const fog = this.scene.fog as THREE.Fog;
    const drawScale = this.renderer.profile.drawDistance;
    fog.near = (ambience?.fogNear ?? (area.data.indoor ? 18 : 45)) * drawScale;
    fog.far = (ambience?.fogFar ?? (area.data.indoor ? 70 : 280)) * drawScale;
    if (ambience?.fogColor) fog.color.set(ambience.fogColor);

    // Innenraeume bekommen konstantes, warmes Licht statt Tagesverlauf.
    if (area.data.indoor) {
      this.sun.castShadow = false;
      this.ambient.intensity = 1.05;
      this.ambient.color.set(0xffeedd);
      this.ambient.groundColor.set(0x50463c);
    } else {
      this.sun.castShadow = this.renderer.profile.shadows;
    }
  }

  setWeather(weather: WeatherKind): void {
    this.weather = weather;
    this.lightDirty = true;
  }

  /** Aktualisiert Licht, Nebel und Himmel nach Uhrzeit und Wetter. */
  update(playerX: number, playerZ: number, playerY: number): void {
    const area = this.activeArea;
    if (!area) return;

    // Schattenkamera dem Spieler nachfuehren, damit die Aufloesung reicht.
    this.time.sunDirection(this.tmpVec);
    this.sun.position.set(
      playerX + this.tmpVec.x * 80,
      playerY + this.tmpVec.y * 80 + 20,
      playerZ + this.tmpVec.z * 80,
    );
    this.sunTarget.position.set(playerX, playerY, playerZ);
    this.sunTarget.updateMatrixWorld();

    if (area.sky) area.sky.position.set(playerX, 0, playerZ);
    area.updateCulling(playerX, playerZ);

    if (!this.lightDirty && !area.data.indoor) {
      // Licht folgt der Zeit kontinuierlich - jede Bildwiederholung guenstig.
      this.applyLighting(area);
      return;
    }
    this.lightDirty = false;
    this.applyLighting(area);
  }

  private applyLighting(area: AreaRuntime): void {
    if (area.data.indoor) return;
    const lighting = this.time.lighting;
    const weatherFactor = this.weatherLightFactor();

    this.sun.color.copy(lighting.sunColor);
    this.sun.intensity = lighting.sunIntensity * weatherFactor.sun
      * (area.data.ambience?.lightIntensity ?? 1);
    this.ambient.color.copy(lighting.skyTint);
    this.ambient.groundColor.set(area.palette.ground);
    this.ambient.intensity = lighting.ambientIntensity * weatherFactor.ambient;

    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(lighting.fogColor).lerp(
      new THREE.Color(weatherFactor.fogColor), weatherFactor.fogBlend,
    );
    fog.far = (area.data.ambience?.fogFar ?? 280)
      * this.renderer.profile.drawDistance * weatherFactor.fogRange;

    if (area.sky) {
      const mat = area.sky.material as THREE.ShaderMaterial;
      const top = mat.uniforms.topColor!.value as THREE.Color;
      const bottom = mat.uniforms.bottomColor!.value as THREE.Color;
      top.copy(lighting.skyTint).multiplyScalar(weatherFactor.sky);
      bottom.copy(lighting.fogColor).lerp(lighting.skyTint, 0.3)
        .multiplyScalar(weatherFactor.sky);
    }
  }

  private weatherLightFactor(): {
    sun: number; ambient: number; sky: number;
    fogColor: string; fogBlend: number; fogRange: number;
  } {
    switch (this.weather) {
      case 'rain': return { sun: 0.45, ambient: 0.8, sky: 0.66, fogColor: '#8fa0b0', fogBlend: 0.55, fogRange: 0.6 };
      case 'heavyRain': return { sun: 0.3, ambient: 0.72, sky: 0.52, fogColor: '#77889b', fogBlend: 0.7, fogRange: 0.45 };
      case 'thunderstorm': return { sun: 0.26, ambient: 0.68, sky: 0.44, fogColor: '#5f6b7f', fogBlend: 0.78, fogRange: 0.42 };
      case 'snow': return { sun: 0.62, ambient: 1.05, sky: 0.88, fogColor: '#dfe9f2', fogBlend: 0.6, fogRange: 0.55 };
      case 'blizzard': return { sun: 0.34, ambient: 0.95, sky: 0.7, fogColor: '#e8f0f7', fogBlend: 0.85, fogRange: 0.28 };
      case 'fog': return { sun: 0.5, ambient: 0.95, sky: 0.8, fogColor: '#c9d2d8', fogBlend: 0.9, fogRange: 0.24 };
      case 'sandstorm': return { sun: 0.55, ambient: 0.9, sky: 0.8, fogColor: '#d8bd88', fogBlend: 0.85, fogRange: 0.3 };
      case 'cloudy': return { sun: 0.7, ambient: 0.95, sky: 0.82, fogColor: '#b8c4cf', fogBlend: 0.35, fogRange: 0.85 };
      case 'harshSun': return { sun: 1.35, ambient: 1.1, sky: 1.12, fogColor: '#ffe8c4', fogBlend: 0.3, fogRange: 1.15 };
      default: return { sun: 1, ambient: 1, sky: 1, fogColor: '#ffffff', fogBlend: 0, fogRange: 1 };
    }
  }

  /** Prueft Gebietsuebergaenge an der Spielerposition. */
  checkTransitions(x: number, z: number): { to: string; spawnPoint: string; requires?: AreaData['connections'][number]['requires']; blockedText?: string } | null {
    const area = this.activeArea;
    if (!area) return null;
    for (const conn of area.data.connections) {
      const t = conn.trigger;
      if (x >= t.x && x <= t.x + t.width && z >= t.z && z <= t.z + t.depth) {
        return {
          to: conn.to, spawnPoint: conn.spawnPoint,
          requires: conn.requires, blockedText: conn.blockedText,
        };
      }
    }
    return null;
  }

  /** Prueft, ob der Spieler vor einer Tuer steht. */
  checkDoor(x: number, z: number): { area: string; spawnPoint: string; label: string } | null {
    const area = this.activeArea;
    if (!area) return null;
    for (const door of area.doors) {
      if (Math.hypot(door.x - x, door.z - z) <= door.radius) {
        return { area: door.area, spawnPoint: door.spawnPoint, label: door.label };
      }
    }
    return null;
  }

  /** Bodenhoehe an einer Position im aktiven Gebiet. */
  heightAt(x: number, z: number): number {
    return this.activeArea?.heightAt(x, z) ?? 0;
  }

  dispose(): void {
    for (const area of this.cache.values()) area.dispose();
    this.cache.clear();
    this.cacheOrder.length = 0;
    this.activeArea = null;
    this.events.clear();
    this.scene.clear();
  }
}
