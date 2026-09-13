import * as THREE from 'three';
import { GameConfig } from '@/core/Config';
import { EventBus } from '@/core/EventBus';
import { clamp01, lerp } from '@/core/MathUtils';
import type { TimeOfDay } from '@/data/schema';

export interface TimeEvents extends Record<string, unknown> {
  timeOfDayChanged: { from: TimeOfDay; to: TimeOfDay; hour: number };
  hourChanged: { hour: number };
}

interface LightingProfile {
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  fogColor: THREE.Color;
  skyTint: THREE.Color;
  /** Sonnenhoehe in Radiant ueber dem Horizont. */
  sunElevation: number;
}

function profile(
  sun: string, sunI: number, amb: string, ambI: number,
  fog: string, sky: string, elevation: number,
): LightingProfile {
  return {
    sunColor: new THREE.Color(sun),
    sunIntensity: sunI,
    ambientColor: new THREE.Color(amb),
    ambientIntensity: ambI,
    fogColor: new THREE.Color(fog),
    skyTint: new THREE.Color(sky),
    sunElevation: elevation,
  };
}

/** Stuetzstellen des Tagesverlaufs; dazwischen wird interpoliert. */
const KEYFRAMES: { hour: number; profile: LightingProfile }[] = [
  { hour: 0, profile: profile('#7a8cc4', 0.38, '#41527d', 0.72, '#232b42', '#202844', 0.15) },
  { hour: 5, profile: profile('#9494bd', 0.46, '#4d5678', 0.78, '#434a63', '#414a6a', 0.06) },
  { hour: 6.5, profile: profile('#ffb07a', 0.85, '#8a7f8f', 0.62, '#e0b096', '#d99b7f', 0.18) },
  { hour: 9, profile: profile('#fff2d8', 1.35, '#b8c9dd', 0.72, '#cfe4f2', '#7fc0ef', 0.62) },
  { hour: 13, profile: profile('#ffffff', 1.55, '#cfe0ef', 0.8, '#dcecf7', '#5fb0ef', 1.15) },
  { hour: 17, profile: profile('#ffe8c0', 1.25, '#c2c9d8', 0.72, '#e4e0ea', '#7fb8e8', 0.55) },
  { hour: 19, profile: profile('#ff9b5f', 0.85, '#8f7f8f', 0.6, '#e8a87f', '#e08f6b', 0.16) },
  { hour: 20.5, profile: profile('#9c82ad', 0.55, '#5e5880', 0.76, '#6b5f7a', '#514868', 0.06) },
  { hour: 22, profile: profile('#7a8cc4', 0.4, '#46557f', 0.74, '#2b3350', '#262e4a', 0.13) },
  { hour: 24, profile: profile('#7a8cc4', 0.38, '#41527d', 0.72, '#232b42', '#202844', 0.15) },
];

/**
 * Spielzeit und Tageslicht.
 *
 * Die Uhrzeit steuert Beleuchtung, Nebel, Himmelsfarbe sowie - ueber
 * `timeOfDay` - Spawns, NPC-Zeitplaene, Musik und Entwicklungen.
 */
export class TimeManager {
  readonly events = new EventBus<TimeEvents>();
  private hourValue: number;
  private dayValue = 1;
  private lastTimeOfDay: TimeOfDay;
  private lastWholeHour: number;
  private paused = false;
  private speedMultiplier = 1;
  private readonly current: LightingProfile;

  constructor(startHour = GameConfig.time.startHour) {
    this.hourValue = startHour % 24;
    this.lastTimeOfDay = TimeManager.timeOfDayFor(this.hourValue);
    this.lastWholeHour = Math.floor(this.hourValue);
    this.current = this.sample(this.hourValue);
  }

  get hour(): number { return this.hourValue; }
  /** Fortlaufender Spieltag, beginnend bei 1. */
  get day(): number { return this.dayValue; }
  get timeOfDay(): TimeOfDay { return this.lastTimeOfDay; }
  get isNight(): boolean { return this.lastTimeOfDay === 'night'; }
  get lighting(): Readonly<LightingProfile> { return this.current; }

  setHour(hour: number): void {
    this.hourValue = ((hour % 24) + 24) % 24;
    this.refresh();
  }

  setPaused(paused: boolean): void { this.paused = paused; }
  setSpeed(multiplier: number): void { this.speedMultiplier = Math.max(0, multiplier); }

  update(deltaSeconds: number): void {
    if (this.paused) return;
    const minutes = deltaSeconds * GameConfig.time.minutesPerRealSecond * this.speedMultiplier;
    const next = this.hourValue + minutes / 60;
    if (next >= 24) this.dayValue++;
    this.hourValue = next % 24;
    this.refresh();
  }

  private refresh(): void {
    const next = TimeManager.timeOfDayFor(this.hourValue);
    if (next !== this.lastTimeOfDay) {
      const from = this.lastTimeOfDay;
      this.lastTimeOfDay = next;
      this.events.emit('timeOfDayChanged', { from, to: next, hour: this.hourValue });
    }
    const whole = Math.floor(this.hourValue);
    if (whole !== this.lastWholeHour) {
      this.lastWholeHour = whole;
      this.events.emit('hourChanged', { hour: whole });
    }
    const sampled = this.sample(this.hourValue);
    this.current.sunColor.copy(sampled.sunColor);
    this.current.ambientColor.copy(sampled.ambientColor);
    this.current.fogColor.copy(sampled.fogColor);
    this.current.skyTint.copy(sampled.skyTint);
    this.current.sunIntensity = sampled.sunIntensity;
    this.current.ambientIntensity = sampled.ambientIntensity;
    this.current.sunElevation = sampled.sunElevation;
  }

  static timeOfDayFor(hour: number): TimeOfDay {
    const c = GameConfig.time;
    if (hour >= c.nightHour || hour < c.dawnHour) return 'night';
    if (hour < c.dayHour) return 'dawn';
    if (hour < c.duskHour) return 'day';
    return 'dusk';
  }

  /** Interpoliert zwischen den Stuetzstellen. */
  private sample(hour: number): LightingProfile {
    let a = KEYFRAMES[0]!;
    let b = KEYFRAMES[KEYFRAMES.length - 1]!;
    for (let i = 0; i < KEYFRAMES.length - 1; i++) {
      if (hour >= KEYFRAMES[i]!.hour && hour <= KEYFRAMES[i + 1]!.hour) {
        a = KEYFRAMES[i]!;
        b = KEYFRAMES[i + 1]!;
        break;
      }
    }
    const span = b.hour - a.hour || 1;
    const t = clamp01((hour - a.hour) / span);
    return {
      sunColor: a.profile.sunColor.clone().lerp(b.profile.sunColor, t),
      ambientColor: a.profile.ambientColor.clone().lerp(b.profile.ambientColor, t),
      fogColor: a.profile.fogColor.clone().lerp(b.profile.fogColor, t),
      skyTint: a.profile.skyTint.clone().lerp(b.profile.skyTint, t),
      sunIntensity: lerp(a.profile.sunIntensity, b.profile.sunIntensity, t),
      ambientIntensity: lerp(a.profile.ambientIntensity, b.profile.ambientIntensity, t),
      sunElevation: lerp(a.profile.sunElevation, b.profile.sunElevation, t),
    };
  }

  /** Uhrzeit als "HH:MM". */
  format(): string {
    const h = Math.floor(this.hourValue);
    const m = Math.floor((this.hourValue - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /** Sonnenrichtung fuer das Licht (normalisiert). */
  sunDirection(target: THREE.Vector3): THREE.Vector3 {
    // Die Sonne wandert ueber den Tag von Ost nach West.
    const dayAngle = ((this.hourValue - 6) / 12) * Math.PI;
    const elevation = Math.max(0.05, this.current.sunElevation);
    return target.set(
      Math.cos(dayAngle),
      Math.sin(elevation * Math.PI * 0.5) + 0.25,
      Math.sin(dayAngle) * 0.45 + 0.35,
    ).normalize();
  }

  serialize(): { hour: number; day: number } {
    return { hour: this.hourValue, day: this.dayValue };
  }

  deserialize(state: { hour: number; day?: number }): void {
    this.dayValue = Math.max(1, Math.floor(state.day ?? 1));
    this.setHour(state.hour);
  }
}
