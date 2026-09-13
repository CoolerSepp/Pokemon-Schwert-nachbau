import type { ScaleName } from './Synth';

export interface TrackDefinition {
  id: string;
  name: string;
  bpm: number;
  /** Grundton als MIDI-Note. */
  root: number;
  scale: ScaleName;
  /** Akkordfolge als Tonleiterstufen (0 = Grundakkord). */
  chords: number[];
  /** Takte pro Akkord. */
  barsPerChord: number;
  /** Melodierhythmus: Werte in Sechzehnteln, 0 = Pause. */
  melody: number[];
  /** Stufenversatz der Melodie relativ zum aktuellen Akkord. */
  melodyShape: number[];
  bassPattern: number[];
  /** Schlagmuster: k = Kick, s = Snare, h = HiHat, '-' = Pause. */
  drums: string;
  lead: OscillatorType;
  pad: OscillatorType;
  bass: OscillatorType;
  /** Gesamtlautstaerke des Stuecks. */
  volume: number;
  /** Kein Schlagwerk (ruhige Stuecke). */
  noDrums?: boolean;
}

/**
 * Musikstuecke als Parametersaetze.
 *
 * Jedes Stueck wird zur Laufzeit synthetisiert; es gibt keine Audiodateien.
 * Die Parameter bestimmen Stimmung, Tempo und Instrumentierung.
 */
export const MUSIC_TRACKS: Record<string, TrackDefinition> = {
  title: {
    id: 'title', name: 'Aufbruch', bpm: 96, root: 57, scale: 'major',
    chords: [0, 5, 3, 4], barsPerChord: 2,
    melody: [4, 0, 2, 2, 4, 0, 4, 0, 2, 2, 6, 0],
    melodyShape: [0, 2, 4, 2, 5, 4, 2, 0],
    bassPattern: [1, 0, 0, 1, 0, 1, 0, 0],
    drums: 'k-h-s-h-k-h-s-h-', lead: 'triangle', pad: 'sine', bass: 'sine',
    volume: 0.55,
  },
  town: {
    id: 'town', name: 'Heimat', bpm: 104, root: 60, scale: 'major',
    chords: [0, 3, 4, 0], barsPerChord: 2,
    melody: [2, 2, 4, 0, 2, 2, 4, 0, 2, 2, 2, 2, 8, 0],
    melodyShape: [4, 2, 0, 2, 4, 5, 4, 2],
    bassPattern: [1, 0, 1, 0, 1, 0, 1, 0],
    drums: 'k-h-s-h-k-h-s-h-', lead: 'triangle', pad: 'sine', bass: 'triangle',
    volume: 0.42,
  },
  home: {
    id: 'home', name: 'Zuhause', bpm: 78, root: 60, scale: 'major',
    chords: [0, 5, 3, 4], barsPerChord: 2,
    melody: [8, 0, 4, 4, 8, 0, 8, 0],
    melodyShape: [0, 2, 4, 2],
    bassPattern: [1, 0, 0, 0, 1, 0, 0, 0],
    drums: '', lead: 'sine', pad: 'sine', bass: 'sine',
    volume: 0.3, noDrums: true,
  },
  route: {
    id: 'route', name: 'Unterwegs', bpm: 128, root: 62, scale: 'major',
    chords: [0, 4, 5, 3], barsPerChord: 1,
    melody: [2, 2, 2, 2, 4, 0, 2, 2, 2, 2, 4, 0],
    melodyShape: [0, 2, 4, 5, 4, 2, 1, 0],
    bassPattern: [1, 0, 1, 1, 0, 1, 0, 1],
    drums: 'k-hhs-h-k-hhs-hh', lead: 'square', pad: 'triangle', bass: 'sawtooth',
    volume: 0.4,
  },
  forest: {
    id: 'forest', name: 'Dichtes Gruen', bpm: 88, root: 59, scale: 'dorian',
    chords: [0, 3, 6, 4], barsPerChord: 2,
    melody: [4, 4, 8, 0, 4, 2, 2, 4, 8, 0],
    melodyShape: [0, 3, 2, 5, 4, 2],
    bassPattern: [1, 0, 0, 1, 0, 0, 1, 0],
    drums: 'k---s---k---s-h-', lead: 'triangle', pad: 'sine', bass: 'sine',
    volume: 0.36,
  },
  cave: {
    id: 'cave', name: 'Tiefe', bpm: 72, root: 52, scale: 'phrygian',
    chords: [0, 1, 0, 5], barsPerChord: 2,
    melody: [8, 0, 8, 0, 4, 4, 8, 0],
    melodyShape: [0, 1, 3, 2],
    bassPattern: [1, 0, 0, 0, 1, 0, 0, 0],
    drums: 'k-------k-------', lead: 'sine', pad: 'sine', bass: 'sine',
    volume: 0.32,
  },
  center: {
    id: 'center', name: 'Ruhepunkt', bpm: 92, root: 65, scale: 'major',
    chords: [0, 4, 5, 3], barsPerChord: 2,
    melody: [4, 4, 4, 4, 8, 0],
    melodyShape: [4, 2, 0, 2, 4],
    bassPattern: [1, 0, 1, 0, 1, 0, 1, 0],
    drums: '', lead: 'sine', pad: 'sine', bass: 'sine',
    volume: 0.3, noDrums: true,
  },
  shop: {
    id: 'shop', name: 'Warenlager', bpm: 112, root: 64, scale: 'major',
    chords: [0, 3, 4, 0], barsPerChord: 1,
    melody: [2, 2, 4, 2, 2, 4, 0],
    melodyShape: [0, 2, 4, 6, 4, 2],
    bassPattern: [1, 0, 1, 0, 1, 0, 1, 0],
    drums: 'k-h-s-h-', lead: 'square', pad: 'triangle', bass: 'triangle',
    volume: 0.32,
  },
  lab: {
    id: 'lab', name: 'Forschung', bpm: 100, root: 62, scale: 'lydian',
    chords: [0, 4, 2, 5], barsPerChord: 2,
    melody: [4, 2, 2, 4, 4, 8, 0],
    melodyShape: [0, 3, 6, 4, 2],
    bassPattern: [1, 0, 0, 1, 1, 0, 0, 0],
    drums: 'k---h---s---h---', lead: 'triangle', pad: 'sine', bass: 'sine',
    volume: 0.32,
  },
  battleWild: {
    id: 'battleWild', name: 'Wilde Begegnung', bpm: 158, root: 57, scale: 'minor',
    chords: [0, 5, 3, 4], barsPerChord: 1,
    melody: [2, 2, 2, 2, 2, 2, 4, 0],
    melodyShape: [0, 3, 4, 3, 5, 4, 3, 0],
    bassPattern: [1, 1, 0, 1, 1, 0, 1, 1],
    drums: 'k-hhs-hhk-hhs-hh', lead: 'square', pad: 'sawtooth', bass: 'sawtooth',
    volume: 0.42,
  },
  battleTrainer: {
    id: 'battleTrainer', name: 'Herausforderung', bpm: 168, root: 55, scale: 'minor',
    chords: [0, 4, 6, 3], barsPerChord: 1,
    melody: [2, 2, 4, 2, 2, 2, 2, 4, 0],
    melodyShape: [0, 4, 3, 5, 7, 5, 3, 0],
    bassPattern: [1, 1, 1, 0, 1, 1, 0, 1],
    drums: 'kkhhs-hhk-hhs-hs', lead: 'square', pad: 'sawtooth', bass: 'sawtooth',
    volume: 0.46,
  },
  gym: {
    id: 'gym', name: 'Arena', bpm: 150, root: 59, scale: 'minor',
    chords: [0, 3, 5, 4], barsPerChord: 2,
    melody: [4, 2, 2, 4, 4, 2, 2, 4],
    melodyShape: [0, 2, 4, 3, 5, 4, 2, 0],
    bassPattern: [1, 0, 1, 1, 0, 1, 1, 0],
    drums: 'k-h-s-h-k-hhs-h-', lead: 'square', pad: 'triangle', bass: 'sawtooth',
    volume: 0.4,
  },
  boss: {
    id: 'boss', name: 'Arenaleitung', bpm: 174, root: 53, scale: 'phrygian',
    chords: [0, 1, 4, 0], barsPerChord: 1,
    melody: [2, 2, 2, 2, 4, 2, 2, 4],
    melodyShape: [0, 1, 4, 3, 6, 4, 1, 0],
    bassPattern: [1, 1, 1, 1, 1, 1, 1, 1],
    drums: 'kkhhskhhkkhhsshh', lead: 'sawtooth', pad: 'sawtooth', bass: 'sawtooth',
    volume: 0.48,
  },
  finalBattle: {
    id: 'finalBattle', name: 'Entscheidung', bpm: 182, root: 50, scale: 'phrygian',
    chords: [0, 1, 5, 4], barsPerChord: 1,
    melody: [2, 1, 1, 2, 2, 2, 2, 4],
    melodyShape: [0, 3, 1, 6, 5, 3, 7, 0],
    bassPattern: [1, 1, 1, 1, 1, 1, 1, 1],
    drums: 'kkhhsshhkkhhsshh', lead: 'sawtooth', pad: 'sawtooth', bass: 'sawtooth',
    volume: 0.5,
  },
  victory: {
    id: 'victory', name: 'Sieg', bpm: 144, root: 60, scale: 'major',
    chords: [0, 4, 5, 0], barsPerChord: 1,
    melody: [2, 2, 2, 2, 8, 0],
    melodyShape: [0, 2, 4, 7, 7],
    bassPattern: [1, 1, 0, 1, 1, 0, 1, 1],
    drums: 'k-hhs-hhk-hhs-hh', lead: 'square', pad: 'triangle', bass: 'triangle',
    volume: 0.44,
  },
  night: {
    id: 'night', name: 'Sternenklar', bpm: 70, root: 55, scale: 'minor',
    chords: [0, 5, 3, 6], barsPerChord: 2,
    melody: [8, 0, 8, 0, 4, 4, 8, 0],
    melodyShape: [0, 3, 2, 5],
    bassPattern: [1, 0, 0, 0, 1, 0, 0, 0],
    drums: '', lead: 'sine', pad: 'sine', bass: 'sine',
    volume: 0.28, noDrums: true,
  },
  snow: {
    id: 'snow', name: 'Frostebene', bpm: 82, root: 64, scale: 'minor',
    chords: [0, 5, 4, 3], barsPerChord: 2,
    melody: [4, 4, 8, 0, 4, 4, 8, 0],
    melodyShape: [0, 4, 2, 5, 3],
    bassPattern: [1, 0, 0, 1, 0, 0, 1, 0],
    drums: '---h---h---h---h', lead: 'sine', pad: 'sine', bass: 'sine',
    volume: 0.3,
  },
  industrial: {
    id: 'industrial', name: 'Werkhalle', bpm: 120, root: 53, scale: 'minorPentatonic',
    chords: [0, 3, 0, 4], barsPerChord: 1,
    melody: [2, 2, 4, 2, 2, 4],
    melodyShape: [0, 2, 1, 3, 2, 0],
    bassPattern: [1, 0, 1, 1, 0, 1, 0, 1],
    drums: 'k-hhk-hhs-hhk-hh', lead: 'square', pad: 'sawtooth', bass: 'sawtooth',
    volume: 0.36,
  },
  ruins: {
    id: 'ruins', name: 'Vergessen', bpm: 66, root: 50, scale: 'wholeTone',
    chords: [0, 2, 4, 3], barsPerChord: 2,
    melody: [8, 0, 4, 4, 8, 0],
    melodyShape: [0, 2, 4, 3],
    bassPattern: [1, 0, 0, 0, 0, 0, 0, 0],
    drums: '', lead: 'sine', pad: 'sine', bass: 'sine',
    volume: 0.28, noDrums: true,
  },
  wildarea: {
    id: 'wildarea', name: 'Weites Land', bpm: 116, root: 62, scale: 'pentatonic',
    chords: [0, 3, 4, 2], barsPerChord: 2,
    melody: [4, 2, 2, 4, 4, 8, 0],
    melodyShape: [0, 2, 4, 3, 1],
    bassPattern: [1, 0, 1, 0, 1, 0, 1, 0],
    drums: 'k-h-s-h-k-h-s-hh', lead: 'triangle', pad: 'sine', bass: 'triangle',
    volume: 0.38,
  },
  raid: {
    id: 'raid', name: 'Energiepunkt', bpm: 164, root: 54, scale: 'minor',
    chords: [0, 6, 4, 5], barsPerChord: 1,
    melody: [2, 2, 2, 2, 2, 2, 2, 2],
    melodyShape: [0, 5, 3, 7, 5, 3, 6, 0],
    bassPattern: [1, 1, 1, 1, 1, 1, 1, 1],
    drums: 'kkhhsshhkkhhsshh', lead: 'sawtooth', pad: 'sawtooth', bass: 'sawtooth',
    volume: 0.44,
  },
  volcanic: {
    id: 'volcanic', name: 'Aschenfeld', bpm: 108, root: 51, scale: 'phrygian',
    chords: [0, 1, 3, 0], barsPerChord: 2,
    melody: [4, 4, 4, 4, 8, 0],
    melodyShape: [0, 1, 3, 4, 1],
    bassPattern: [1, 0, 1, 0, 1, 0, 1, 0],
    drums: 'k---s---k-h-s---', lead: 'sawtooth', pad: 'sine', bass: 'sawtooth',
    volume: 0.36,
  },
  league: {
    id: 'league', name: 'Grosses Turnier', bpm: 156, root: 60, scale: 'major',
    chords: [0, 5, 3, 4], barsPerChord: 1,
    melody: [2, 2, 4, 2, 2, 4],
    melodyShape: [0, 4, 7, 5, 4, 2],
    bassPattern: [1, 1, 0, 1, 1, 0, 1, 1],
    drums: 'k-hhs-hhk-hhs-hh', lead: 'square', pad: 'triangle', bass: 'sawtooth',
    volume: 0.44,
  },
  hallOfFame: {
    id: 'hallOfFame', name: 'Ruhmeshalle', bpm: 82, root: 60, scale: 'major',
    chords: [0, 3, 5, 4], barsPerChord: 2,
    melody: [4, 4, 8, 4, 4, 8],
    melodyShape: [0, 4, 7, 9, 7, 4],
    bassPattern: [1, 0, 0, 0, 1, 0, 1, 0],
    drums: '', lead: 'triangle', pad: 'sine', bass: 'sine',
    volume: 0.34, noDrums: true,
  },
};

export type MusicTrackId = keyof typeof MUSIC_TRACKS;
