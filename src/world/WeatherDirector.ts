import type { RNG } from '@/core/RNG';
import type { AreaData, WeatherKind } from '@/data/schema';

/** Meldungstext beim Wetterwechsel. */
const CHANGE_TEXT: Record<WeatherKind, string> = {
  clear: 'Der Himmel klart auf.',
  cloudy: 'Wolken ziehen auf.',
  rain: 'Es beginnt zu regnen.',
  heavyRain: 'Ein heftiger Regenguss setzt ein.',
  thunderstorm: 'Ein Gewitter zieht herauf.',
  snow: 'Es fangt an zu schneien.',
  blizzard: 'Ein Schneesturm bricht los.',
  sandstorm: 'Ein Sandsturm fegt heran.',
  fog: 'Dichter Nebel zieht auf.',
  harshSun: 'Die Sonne brennt herunter.',
};

/** Grundgewicht einer Wetterart - ruhiges Wetter ist haeufiger. */
const BASE_WEIGHT: Record<WeatherKind, number> = {
  clear: 5, cloudy: 4, rain: 3, heavyRain: 1.5, thunderstorm: 1,
  snow: 3, blizzard: 1.2, sandstorm: 1.5, fog: 2, harshSun: 1.5,
};

export interface WeatherChange {
  weather: WeatherKind;
  text: string;
}

/**
 * Wechselndes Wetter im Freien.
 *
 * Jedes Gebiet erlaubt eine Liste von Wetterarten; der Regisseur waehlt in
 * unregelmaessigen Abstaenden eine neue daraus. Extreme Wetterlagen halten
 * kuerzer an als ruhige, damit ein Gewitter nicht zum Dauerzustand wird.
 */
export class WeatherDirector {
  private timer = 0;
  private current: WeatherKind = 'clear';
  private allowed: WeatherKind[] = [];
  private enabled = false;

  constructor(private readonly rng: RNG) {}

  get weather(): WeatherKind { return this.current; }
  /** Verbleibende Sekunden bis zum naechsten moeglichen Wechsel. */
  get secondsUntilChange(): number { return this.timer; }

  /** Uebernimmt die Wetterliste eines Gebietes und waehlt einen Startwert. */
  enterArea(data: AreaData): WeatherKind {
    this.allowed = data.indoor ? [] : (data.weather ?? []);
    this.enabled = this.allowed.length > 1;
    this.current = data.indoor || this.allowed.length === 0
      ? 'clear'
      : this.pick(null);
    this.timer = this.durationFor(this.current);
    return this.current;
  }

  /** Setzt das Wetter direkt (Zwischensequenz, Spielstand). */
  force(weather: WeatherKind): void {
    this.current = weather;
    this.timer = this.durationFor(weather);
  }

  /** Zaehlt herunter und meldet einen Wechsel, sobald die Zeit abgelaufen ist. */
  update(deltaSeconds: number): WeatherChange | null {
    if (!this.enabled) return null;
    this.timer -= deltaSeconds;
    if (this.timer > 0) return null;

    const next = this.pick(this.current);
    this.current = next;
    this.timer = this.durationFor(next);
    return { weather: next, text: CHANGE_TEXT[next] };
  }

  private pick(exclude: WeatherKind | null): WeatherKind {
    const entries = this.allowed
      .filter((w) => w !== exclude)
      .map((w) => ({ value: w, weight: BASE_WEIGHT[w] ?? 1 }));
    if (entries.length === 0) return exclude ?? 'clear';
    return this.rng.weighted(entries) ?? 'clear';
  }

  /** Extreme Wetterlagen halten kuerzer an. */
  private durationFor(weather: WeatherKind): number {
    switch (weather) {
      case 'thunderstorm':
      case 'blizzard':
      case 'heavyRain':
        return this.rng.float(55, 95);
      case 'sandstorm':
      case 'fog':
      case 'harshSun':
        return this.rng.float(80, 140);
      default:
        return this.rng.float(120, 220);
    }
  }
}
