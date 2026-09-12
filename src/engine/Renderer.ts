import * as THREE from 'three';
import { Logger } from '@/core/Logger';
import { clamp } from '@/core/MathUtils';

const log = Logger.scope('Renderer');

export type QualityLevel = 'low' | 'medium' | 'high';

interface QualityProfile {
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  /** Sichtweite als Faktor auf die konfigurierte Kamerareichweite. */
  drawDistance: number;
  /** Maximale Anzahl gleichzeitiger Partikel. */
  particleBudget: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: { pixelRatioCap: 1, shadows: false, shadowMapSize: 512, antialias: false, drawDistance: 0.55, particleBudget: 260 },
  medium: { pixelRatioCap: 1.5, shadows: true, shadowMapSize: 1024, antialias: true, drawDistance: 0.8, particleBudget: 700 },
  high: { pixelRatioCap: 2, shadows: true, shadowMapSize: 2048, antialias: true, drawDistance: 1, particleBudget: 1600 },
};

export interface RenderStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
}

/**
 * Kapselt den WebGL-Renderer.
 *
 * Die Qualitaetsstufe wird beim Start automatisch anhand der Geraeteleistung
 * geschaetzt und kann in den Optionen ueberschrieben werden - das Spiel soll
 * auch auf schwachen Geraeten fluessig laufen (Anforderung 48).
 */
export class Renderer {
  readonly three: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private qualityLevel: QualityLevel;
  private frameTimes: number[] = [];
  private lastStats: RenderStats = {
    fps: 0, frameMs: 0, drawCalls: 0, triangles: 0,
    programs: 0, geometries: 0, textures: 0,
  };

  constructor(canvas: HTMLCanvasElement, quality?: QualityLevel) {
    this.canvas = canvas;
    this.qualityLevel = quality ?? Renderer.detectQuality();
    const profile = QUALITY_PROFILES[this.qualityLevel];

    this.three = new THREE.WebGLRenderer({
      canvas,
      antialias: profile.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap));
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.toneMapping = THREE.ACESFilmicToneMapping;
    this.three.toneMappingExposure = 1.05;
    this.three.shadowMap.enabled = profile.shadows;
    this.three.shadowMap.type = THREE.PCFSoftShadowMap;
    this.three.info.autoReset = false;

    log.info(`WebGL-Renderer bereit (Qualitaet: ${this.qualityLevel})`);
    this.resize();
  }

  /** Schaetzt eine sinnvolle Startqualitaet anhand von Geraetehinweisen. */
  static detectQuality(): QualityLevel {
    const cores = navigator.hardwareConcurrency ?? 4;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile || cores <= 2 || memory <= 2) return 'low';
    if (cores <= 4 || memory <= 4) return 'medium';
    return 'high';
  }

  get quality(): QualityLevel { return this.qualityLevel; }
  get profile(): QualityProfile { return QUALITY_PROFILES[this.qualityLevel]; }

  setQuality(level: QualityLevel): void {
    if (level === this.qualityLevel) return;
    this.qualityLevel = level;
    const profile = QUALITY_PROFILES[level];
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap));
    this.three.shadowMap.enabled = profile.shadows;
    this.three.shadowMap.needsUpdate = true;
    this.resize();
    log.info(`Qualitaet auf "${level}" gesetzt`);
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;
    this.three.setSize(width, height, false);
  }

  get aspect(): number {
    const size = new THREE.Vector2();
    this.three.getSize(size);
    return size.y > 0 ? size.x / size.y : 16 / 9;
  }

  render(scene: THREE.Scene, camera: THREE.Camera, frameMs: number): void {
    this.three.info.reset();
    this.three.render(scene, camera);
    this.collectStats(frameMs);
  }

  private collectStats(frameMs: number): void {
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const info = this.three.info;
    this.lastStats = {
      fps: avg > 0 ? clamp(1000 / avg, 0, 999) : 0,
      frameMs: avg,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  get stats(): RenderStats { return this.lastStats; }

  dispose(): void {
    this.three.dispose();
  }
}
