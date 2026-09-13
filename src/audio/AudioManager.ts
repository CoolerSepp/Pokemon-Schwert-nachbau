import { Logger } from '@/core/Logger';
import { GameConfig } from '@/core/Config';
import { RNG } from '@/core/RNG';
import { MUSIC_TRACKS, type TrackDefinition } from './MusicTracks';
import { midiToFreq, playNoise, playVoice, scaleNote } from './Synth';

const log = Logger.scope('Audio');

export type SfxKind =
  | 'select' | 'confirm' | 'cancel' | 'error' | 'open' | 'close'
  | 'step' | 'jump' | 'land' | 'interact' | 'itemGet' | 'money'
  | 'hitNormal' | 'hitSuper' | 'hitWeak' | 'critical' | 'faint'
  | 'fire' | 'water' | 'electric' | 'grass' | 'ice' | 'rock' | 'steel'
  | 'psychic' | 'dark' | 'fairy' | 'poison' | 'ground' | 'flying'
  | 'bug' | 'ghost' | 'dragon' | 'fighting' | 'normal'
  | 'buff' | 'debuff' | 'heal' | 'statusApply' | 'explosion'
  | 'ballThrow' | 'ballShake' | 'ballCatch' | 'ballBreak'
  | 'levelUp' | 'evolution' | 'gigantic' | 'badge' | 'save'
  | 'encounter' | 'rustle' | 'door' | 'crowdCheer' | 'crowdGasp' | 'whoosh' | 'slash' | 'impact'
  | 'thunder' | 'raidPulse' | 'raidOpen';

interface CryOptions {
  baseHz: number;
  kind: 'chirp' | 'growl' | 'roar' | 'trill' | 'hum' | 'screech';
}

/**
 * Vollstaendig prozeduraler Ton.
 *
 * Musik und Klangeffekte werden per Web Audio synthetisiert - das Spiel
 * enthaelt keine Audiodateien. Der Kontext startet erst nach der ersten
 * Benutzereingabe, wie es Browser verlangen.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  private currentTrack: TrackDefinition | null = null;
  private pendingTrack: TrackDefinition | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private schedulerId = 0;
  private readonly rng = new RNG('audio');
  private unlocked = false;
  private muted = false;

  private volumes: Record<'master' | 'music' | 'sfx', number> = {
    master: GameConfig.audio.masterVolume,
    music: GameConfig.audio.musicVolume,
    sfx: GameConfig.audio.sfxVolume,
  };

  get isUnlocked(): boolean { return this.unlocked; }
  get currentTrackId(): string | null { return this.currentTrack?.id ?? null; }

  /**
   * Muss aus einer Benutzergeste heraus aufgerufen werden.
   * Mehrfachaufrufe sind unschaedlich.
   */
  unlock(): void {
    if (this.unlocked) return;
    try {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        log.warn('Web Audio nicht verfuegbar - das Spiel laeuft ohne Ton');
        return;
      }
      this.ctx = new Ctor();
      void this.ctx.resume();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.ratio.value = 8;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.2;

      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();

      this.musicBus.connect(this.musicGain);
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      this.applyVolumes();
      this.unlocked = true;
      this.nextNoteTime = this.ctx.currentTime + 0.08;
      this.startScheduler();
      log.info('Tonsystem bereit (prozedural)');

      if (this.pendingTrack) {
        const track = this.pendingTrack;
        this.pendingTrack = null;
        this.playMusic(track.id);
      }
    } catch (err) {
      log.warn('Tonsystem konnte nicht gestartet werden', err);
    }
  }

  setVolume(kind: 'master' | 'music' | 'sfx', value: number): void {
    this.volumes[kind] = Math.max(0, Math.min(1, value));
    this.applyVolumes();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  // ---------------------------------------------------------------- Musik

  playMusic(trackId: string, fadeSeconds: number = GameConfig.audio.musicFadeSeconds): void {
    const track = MUSIC_TRACKS[trackId];
    if (!track) {
      log.warn(`Unbekanntes Musikstueck "${trackId}"`);
      return;
    }
    if (!this.unlocked) {
      this.pendingTrack = track;
      return;
    }
    if (this.currentTrack?.id === track.id) return;
    this.crossfadeTo(track, fadeSeconds);
  }

  stopMusic(fadeSeconds: number = GameConfig.audio.musicFadeSeconds): void {
    if (!this.ctx || !this.musicBus) {
      this.pendingTrack = null;
      return;
    }
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.0001, t + fadeSeconds);
    window.setTimeout(() => { this.currentTrack = null; }, fadeSeconds * 1000);
  }

  private crossfadeTo(track: TrackDefinition, fadeSeconds: number): void {
    if (!this.ctx || !this.musicBus) return;
    const t = this.ctx.currentTime;
    const hadTrack = this.currentTrack !== null;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);

    if (hadTrack) {
      this.musicBus.gain.linearRampToValueAtTime(0.0001, t + fadeSeconds * 0.5);
      window.setTimeout(() => this.switchTrack(track, fadeSeconds * 0.5), fadeSeconds * 500);
    } else {
      this.switchTrack(track, fadeSeconds);
    }
  }

  private switchTrack(track: TrackDefinition, fadeSeconds: number): void {
    if (!this.ctx || !this.musicBus) return;
    this.currentTrack = track;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(0.0001, t);
    this.musicBus.gain.linearRampToValueAtTime(track.volume, t + Math.max(0.05, fadeSeconds));
  }

  /** Plant Noten im Voraus - unabhaengig von der Bildrate. */
  private startScheduler(): void {
    if (this.schedulerId) return;
    this.schedulerId = window.setInterval(() => this.scheduleAhead(), 40);
  }

  private scheduleAhead(): void {
    const ctx = this.ctx;
    const track = this.currentTrack;
    if (!ctx || !track || !this.musicBus) return;
    const secondsPerStep = 60 / track.bpm / 4;
    const horizon = ctx.currentTime + 0.25;

    while (this.nextNoteTime < horizon) {
      this.scheduleStep(track, this.step, this.nextNoteTime, secondsPerStep);
      this.nextNoteTime += secondsPerStep;
      this.step++;
    }
  }

  private scheduleStep(
    track: TrackDefinition, step: number, time: number, stepSeconds: number,
  ): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;

    const stepsPerBar = 16;
    const bar = Math.floor(step / stepsPerBar);
    const inBar = step % stepsPerBar;
    const chordIndex = Math.floor(bar / track.barsPerChord) % track.chords.length;
    const chordRoot = track.chords[chordIndex]!;

    // --- Akkordflaeche zu Beginn jedes Taktes ----------------------------
    if (inBar === 0) {
      const chordSeconds = stepSeconds * stepsPerBar * 0.96;
      for (const offset of [0, 2, 4]) {
        const note = scaleNote(track.root, track.scale, chordRoot + offset);
        playVoice(ctx, bus, {
          type: track.pad, frequency: midiToFreq(note), startTime: time,
          duration: chordSeconds, gain: 0.1,
          attack: 0.12, decay: 0.3, sustain: 0.72, release: 0.4,
          filter: 1900, detune: this.rng.float(-6, 6),
        });
      }
    }

    // --- Bass -------------------------------------------------------------
    const bassStep = Math.floor(inBar / 2);
    if (track.bassPattern[bassStep % track.bassPattern.length] === 1 && inBar % 2 === 0) {
      const note = scaleNote(track.root - 12, track.scale, chordRoot);
      playVoice(ctx, bus, {
        type: track.bass, frequency: midiToFreq(note), startTime: time,
        duration: stepSeconds * 1.7, gain: 0.17,
        attack: 0.006, decay: 0.05, sustain: 0.55, release: 0.09, filter: 620,
      });
    }

    // --- Melodie ----------------------------------------------------------
    const melodyPosition = this.melodyIndexFor(track, step % (stepsPerBar * 2));
    if (melodyPosition >= 0) {
      const shapeIndex = (bar * 2 + melodyPosition) % track.melodyShape.length;
      const degree = chordRoot + track.melodyShape[shapeIndex]!;
      const note = scaleNote(track.root + 12, track.scale, degree);
      const length = track.melody[melodyPosition % track.melody.length]! || 2;
      playVoice(ctx, bus, {
        type: track.lead, frequency: midiToFreq(note), startTime: time,
        duration: stepSeconds * length * 0.85, gain: 0.13,
        attack: 0.008, decay: 0.06, sustain: 0.62, release: 0.11,
        filter: 3400, vibrato: 5,
      });
    }

    // --- Schlagwerk -------------------------------------------------------
    if (!track.noDrums && track.drums.length > 0) {
      const hit = track.drums[inBar % track.drums.length];
      if (hit === 'k') {
        playVoice(ctx, bus, {
          type: 'sine', frequency: 120, glideTo: 42, startTime: time,
          duration: 0.13, gain: 0.34, attack: 0.002, decay: 0.03, sustain: 0.3, release: 0.05,
        });
      } else if (hit === 's') {
        playNoise(ctx, bus, {
          startTime: time, duration: 0.13, gain: 0.13,
          filterStart: 3200, filterEnd: 900,
        });
      } else if (hit === 'h') {
        playNoise(ctx, bus, {
          startTime: time, duration: 0.045, gain: 0.045,
          filterStart: 9000, filterEnd: 5200, type: 'highpass',
        });
      }
    }
  }

  /** Wandelt das Rhythmusmuster in Startpositionen um. */
  private melodyIndexFor(track: TrackDefinition, stepInPhrase: number): number {
    let cursor = 0;
    for (let i = 0; i < track.melody.length; i++) {
      const length = track.melody[i]!;
      if (length === 0) continue;
      if (cursor === stepInPhrase) return i;
      cursor += length;
      if (cursor > stepInPhrase) return -1;
    }
    return -1;
  }

  // --------------------------------------------------------- Klangeffekte

  playSfx(kind: SfxKind, pitchScale = 1): void {
    const ctx = this.ctx;
    const bus = this.sfxGain;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + 0.005;
    const p = Math.max(0.25, pitchScale);

    const tone = (
      freq: number, duration: number, gain: number,
      type: OscillatorType = 'square', glideTo?: number, filter?: number,
    ) => playVoice(ctx, bus, {
      type, frequency: freq * p, startTime: t, duration, gain,
      glideTo: glideTo ? glideTo * p : undefined, filter,
      attack: 0.004, decay: 0.03, sustain: 0.55, release: 0.06,
    });
    const noise = (
      duration: number, gain: number, from: number, to: number,
      type: BiquadFilterType = 'lowpass',
    ) => playNoise(ctx, bus, {
      startTime: t, duration, gain, filterStart: from * p, filterEnd: to * p, type,
    });

    switch (kind) {
      case 'select': tone(760, 0.05, 0.11, 'square'); break;
      case 'confirm': tone(620, 0.06, 0.13, 'square', 940); break;
      case 'cancel': tone(430, 0.07, 0.11, 'square', 290); break;
      case 'error': tone(200, 0.16, 0.14, 'sawtooth', 150); break;
      case 'open': tone(500, 0.09, 0.1, 'triangle', 860); break;
      case 'close': tone(860, 0.08, 0.1, 'triangle', 460); break;
      case 'step': noise(0.05, 0.035, 1300, 420); break;
      case 'jump': tone(380, 0.1, 0.12, 'square', 720); break;
      case 'land': noise(0.08, 0.07, 900, 220); break;
      case 'interact': tone(680, 0.06, 0.11, 'triangle', 900); break;
      case 'itemGet':
        tone(660, 0.07, 0.13, 'square');
        playVoice(ctx, bus, { type: 'square', frequency: 880 * p, startTime: t + 0.08, duration: 0.09, gain: 0.13 });
        playVoice(ctx, bus, { type: 'square', frequency: 1320 * p, startTime: t + 0.17, duration: 0.16, gain: 0.13 });
        break;
      case 'money': tone(1180, 0.07, 0.1, 'square', 1560); break;
      case 'door': noise(0.24, 0.07, 700, 180); break;
      case 'save': tone(520, 0.1, 0.11, 'triangle', 780); break;
      case 'badge':
        for (let i = 0; i < 4; i++) {
          playVoice(ctx, bus, {
            type: 'square', frequency: midiToFreq(72 + i * 4) * p,
            startTime: t + i * 0.1, duration: 0.16, gain: 0.13,
          });
        }
        break;
      case 'levelUp':
        for (let i = 0; i < 3; i++) {
          playVoice(ctx, bus, {
            type: 'square', frequency: midiToFreq(70 + i * 5) * p,
            startTime: t + i * 0.075, duration: 0.14, gain: 0.14,
          });
        }
        break;
      case 'hitNormal': noise(0.12, 0.13, 2100, 480); break;
      case 'hitSuper':
        noise(0.2, 0.2, 3400, 400);
        tone(300, 0.16, 0.12, 'sawtooth', 120);
        break;
      case 'hitWeak': noise(0.09, 0.06, 1200, 460); break;
      case 'critical':
        noise(0.24, 0.22, 5200, 420);
        tone(900, 0.12, 0.12, 'square', 320);
        break;
      case 'impact': noise(0.1, 0.12, 1800, 380); break;
      case 'slash': noise(0.11, 0.11, 6500, 1400, 'bandpass'); break;
      case 'whoosh': noise(0.2, 0.08, 900, 2600, 'bandpass'); break;
      case 'faint': tone(520, 0.5, 0.13, 'triangle', 110); break;
      case 'fire': noise(0.34, 0.11, 1500, 320); break;
      case 'water': noise(0.3, 0.1, 2600, 600); break;
      case 'electric':
        noise(0.16, 0.12, 7200, 2400, 'highpass');
        tone(1500, 0.1, 0.08, 'sawtooth', 500);
        break;
      case 'grass': noise(0.24, 0.08, 4200, 1100, 'bandpass'); break;
      case 'ice': tone(1700, 0.26, 0.09, 'sine', 800); break;
      case 'rock': noise(0.22, 0.15, 700, 140); break;
      case 'steel': tone(2100, 0.2, 0.09, 'square', 1300); break;
      case 'psychic': tone(720, 0.36, 0.09, 'sine', 1500); break;
      case 'dark': tone(180, 0.34, 0.11, 'sawtooth', 70); break;
      case 'fairy': tone(1400, 0.26, 0.08, 'sine', 2100); break;
      case 'poison': noise(0.28, 0.08, 900, 260); break;
      case 'ground': noise(0.28, 0.16, 480, 90); break;
      case 'flying': noise(0.26, 0.08, 1800, 4200, 'bandpass'); break;
      case 'bug': tone(1900, 0.14, 0.07, 'square', 1500); break;
      case 'ghost': tone(420, 0.44, 0.09, 'sine', 180); break;
      case 'dragon': tone(260, 0.42, 0.13, 'sawtooth', 110); break;
      case 'fighting': noise(0.13, 0.15, 1600, 320); break;
      case 'normal': noise(0.1, 0.11, 1700, 500); break;
      case 'buff': tone(520, 0.26, 0.1, 'triangle', 1050); break;
      case 'debuff': tone(880, 0.26, 0.1, 'triangle', 330); break;
      case 'heal': tone(700, 0.32, 0.1, 'sine', 1200); break;
      case 'statusApply': tone(340, 0.24, 0.1, 'square', 220); break;
      case 'explosion':
        noise(0.55, 0.26, 2400, 90);
        tone(130, 0.36, 0.16, 'sawtooth', 40);
        break;
      case 'thunder':
        // Kurzer Knall, dann langes Grollen.
        noise(0.12, 0.2, 5200, 1800, 'bandpass');
        playNoise(ctx, bus, {
          startTime: t + 0.1, duration: 1.6, gain: 0.2,
          filterStart: 420, filterEnd: 70, type: 'lowpass',
        });
        break;
      case 'raidPulse':
        tone(90, 0.5, 0.12, 'sine', 150);
        noise(0.5, 0.06, 300, 900, 'bandpass');
        break;
      case 'raidOpen':
        for (let i = 0; i < 4; i++) {
          playVoice(ctx, bus, {
            type: 'sawtooth', frequency: midiToFreq(40 + i * 7) * p,
            startTime: t + i * 0.12, duration: 0.3, gain: 0.11, filter: 900,
          });
        }
        noise(0.9, 0.12, 1800, 200);
        break;
      case 'ballThrow': noise(0.16, 0.07, 2200, 800, 'bandpass'); break;
      case 'ballShake': tone(560, 0.09, 0.1, 'square', 430); break;
      case 'ballCatch':
        for (let i = 0; i < 3; i++) {
          playVoice(ctx, bus, {
            type: 'square', frequency: midiToFreq(74 + i * 4) * p,
            startTime: t + i * 0.11, duration: 0.15, gain: 0.13,
          });
        }
        break;
      case 'ballBreak': tone(720, 0.2, 0.12, 'sawtooth', 280); break;
      case 'evolution': tone(420, 0.9, 0.11, 'sine', 1500); break;
      case 'gigantic':
        tone(90, 0.8, 0.18, 'sawtooth', 300);
        noise(0.7, 0.14, 600, 3200, 'bandpass');
        break;
      case 'encounter':
        tone(880, 0.1, 0.13, 'square', 620);
        playVoice(ctx, bus, { type: 'square', frequency: 620 * p, startTime: t + 0.11, duration: 0.14, gain: 0.13 });
        break;
      case 'rustle': noise(0.14, 0.05, 5200, 1400, 'bandpass'); break;
      case 'crowdCheer': noise(0.9, 0.09, 900, 2400, 'bandpass'); break;
      case 'crowdGasp': noise(0.5, 0.07, 1600, 500, 'bandpass'); break;
    }
  }

  /** Ruf einer Kreatur - aus Art-Parametern synthetisiert. */
  playCry(options: CryOptions, pitchScale = 1): void {
    const ctx = this.ctx;
    const bus = this.sfxGain;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + 0.01;
    const base = options.baseHz * pitchScale;

    switch (options.kind) {
      case 'chirp':
        playVoice(ctx, bus, { type: 'square', frequency: base, glideTo: base * 1.7, startTime: t, duration: 0.1, gain: 0.11 });
        playVoice(ctx, bus, { type: 'square', frequency: base * 1.4, glideTo: base * 0.9, startTime: t + 0.12, duration: 0.12, gain: 0.1 });
        break;
      case 'growl':
        playVoice(ctx, bus, { type: 'sawtooth', frequency: base, glideTo: base * 0.6, startTime: t, duration: 0.34, gain: 0.13, filter: 1200, vibrato: 22 });
        break;
      case 'roar':
        playVoice(ctx, bus, { type: 'sawtooth', frequency: base * 1.2, glideTo: base * 0.5, startTime: t, duration: 0.52, gain: 0.16, filter: 1500, vibrato: 30 });
        playNoise(ctx, bus, { startTime: t, duration: 0.5, gain: 0.06, filterStart: 900, filterEnd: 260 });
        break;
      case 'trill':
        for (let i = 0; i < 4; i++) {
          playVoice(ctx, bus, {
            type: 'triangle', frequency: base * (1 + (i % 2) * 0.28),
            startTime: t + i * 0.07, duration: 0.07, gain: 0.1,
          });
        }
        break;
      case 'hum':
        playVoice(ctx, bus, { type: 'sine', frequency: base, glideTo: base * 1.12, startTime: t, duration: 0.48, gain: 0.12, vibrato: 14 });
        break;
      case 'screech':
        playVoice(ctx, bus, { type: 'sawtooth', frequency: base * 1.6, glideTo: base * 2.4, startTime: t, duration: 0.2, gain: 0.11, filter: 5200 });
        playNoise(ctx, bus, { startTime: t, duration: 0.22, gain: 0.05, filterStart: 5200, filterEnd: 2600, type: 'bandpass' });
        break;
    }
  }

  dispose(): void {
    if (this.schedulerId) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = 0;
    }
    this.currentTrack = null;
    void this.ctx?.close();
    this.ctx = null;
    this.unlocked = false;
  }
}
