/** Tonleitern als Halbtonabstaende zur Grundnote. */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
} as const;
export type ScaleName = keyof typeof SCALES;

/** MIDI-Notennummer in Frequenz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Note einer Tonleiter: `degree` darf ueber die Oktave hinausgehen. */
export function scaleNote(root: number, scale: ScaleName, degree: number): number {
  const steps = SCALES[scale];
  const octave = Math.floor(degree / steps.length);
  const index = ((degree % steps.length) + steps.length) % steps.length;
  return root + steps[index]! + octave * 12;
}

export interface VoiceOptions {
  type: OscillatorType;
  frequency: number;
  startTime: number;
  duration: number;
  gain: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  /** Frequenzverlauf zum Zielwert (Glissando). */
  glideTo?: number;
  /** Tiefpassfilter-Grenzfrequenz. */
  filter?: number;
  /** Leichte Verstimmung fuer Fuelle. */
  detune?: number;
  /** Vibrato-Tiefe in Cent. */
  vibrato?: number;
}

/**
 * Erzeugt eine einzelne Stimme mit ADSR-Huellkurve.
 *
 * Bewusst ohne Samples: die gesamte Musik und alle Klangeffekte werden zur
 * Laufzeit synthetisiert - dadurch braucht das Spiel keine Audiodateien.
 */
export function playVoice(
  ctx: AudioContext, destination: AudioNode, options: VoiceOptions,
): void {
  const {
    type, frequency, startTime, duration, gain,
    attack = 0.012, decay = 0.07, sustain = 0.6, release = 0.14,
  } = options;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  if (options.detune) osc.detune.setValueAtTime(options.detune, startTime);
  if (options.glideTo) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, options.glideTo), startTime + duration,
    );
  }

  let node: AudioNode = osc;
  if (options.filter) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.filter, startTime);
    filter.Q.value = 0.9;
    osc.connect(filter);
    node = filter;
  }

  const envelope = ctx.createGain();
  const peak = Math.max(0.0001, gain);
  envelope.gain.setValueAtTime(0.0001, startTime);
  envelope.gain.linearRampToValueAtTime(peak, startTime + attack);
  envelope.gain.linearRampToValueAtTime(peak * sustain, startTime + attack + decay);
  const stopTime = startTime + duration;
  envelope.gain.setValueAtTime(peak * sustain, Math.max(stopTime - release, startTime + attack + decay));
  envelope.gain.exponentialRampToValueAtTime(0.0001, stopTime + release);

  node.connect(envelope);
  envelope.connect(destination);

  if (options.vibrato) {
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.4;
    lfoGain.gain.value = options.vibrato;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune);
    lfo.start(startTime);
    lfo.stop(stopTime + release);
  }

  osc.start(startTime);
  osc.stop(stopTime + release + 0.02);
}

/** Rauschbasierter Schlag (Trommel, Aufprall, Explosion). */
export function playNoise(
  ctx: AudioContext, destination: AudioNode, options: {
    startTime: number; duration: number; gain: number;
    filterStart: number; filterEnd: number; type?: BiquadFilterType;
  },
): void {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * options.duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = options.type ?? 'lowpass';
  filter.frequency.setValueAtTime(options.filterStart, options.startTime);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(40, options.filterEnd), options.startTime + options.duration,
  );

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(options.gain, options.startTime);
  envelope.gain.exponentialRampToValueAtTime(0.0001, options.startTime + options.duration);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);
  source.start(options.startTime);
  source.stop(options.startTime + options.duration + 0.02);
}
