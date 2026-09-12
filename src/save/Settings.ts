import { GameConfig } from '@/core/Config';
import { EventBus } from '@/core/EventBus';
import type { QualityLevel } from '@/engine/Renderer';
import type { TextSpeed } from '@/ui/screens/DialogueScreen';
import type { Bindings } from '@/engine/InputManager';

export type BattleSpeed = 'slow' | 'normal' | 'fast' | 'instant';

export interface SettingsData {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  quality: QualityLevel;
  cameraSensitivity: number;
  invertCameraY: boolean;
  textSpeed: TextSpeed;
  battleSpeed: BattleSpeed;
  showDamageNumbers: boolean;
  autoSave: boolean;
  bindings: Partial<Bindings>;
}

export interface SettingsEvents extends Record<string, unknown> {
  changed: { key: keyof SettingsData };
}

const STORAGE_KEY = 'aetheria-settings';

export const DEFAULT_SETTINGS: SettingsData = {
  masterVolume: GameConfig.audio.masterVolume,
  musicVolume: GameConfig.audio.musicVolume,
  sfxVolume: GameConfig.audio.sfxVolume,
  quality: 'high',
  cameraSensitivity: 1,
  invertCameraY: false,
  textSpeed: 'normal',
  battleSpeed: 'normal',
  showDamageNumbers: true,
  autoSave: true,
  bindings: {},
};

export const BATTLE_SPEED_FACTORS: Record<BattleSpeed, number> = {
  slow: 1.5, normal: 1, fast: 0.55, instant: 0.12,
};

/**
 * Einstellungen mit sofortiger Persistenz im localStorage.
 *
 * Von den Spielstaenden getrennt: Einstellungen gelten geraetebezogen und
 * sollen einen geloeschten Spielstand ueberleben.
 */
export class Settings {
  readonly events = new EventBus<SettingsEvents>();
  private data: SettingsData = structuredClone(DEFAULT_SETTINGS);

  constructor(quality?: QualityLevel) {
    if (quality) this.data.quality = quality;
    this.load();
  }

  get<K extends keyof SettingsData>(key: K): SettingsData[K] {
    return this.data[key];
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    if (this.data[key] === value) return;
    this.data[key] = value;
    this.save();
    this.events.emit('changed', { key });
  }

  all(): Readonly<SettingsData> {
    return this.data;
  }

  reset(): void {
    this.data = structuredClone(DEFAULT_SETTINGS);
    this.save();
    this.events.emit('changed', { key: 'quality' });
  }

  get battleSpeedFactor(): number {
    return BATTLE_SPEED_FACTORS[this.data.battleSpeed];
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SettingsData>;
      // Nur bekannte Schluessel uebernehmen, damit alte Staende nicht stoeren.
      for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SettingsData)[]) {
        if (parsed[key] !== undefined) {
          (this.data[key] as unknown) = parsed[key];
        }
      }
    } catch {
      // Beschaedigte Einstellungen werden ignoriert - Standardwerte greifen.
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Privater Modus o.ae.: Einstellungen gelten dann nur fuer diese Sitzung.
    }
  }
}
