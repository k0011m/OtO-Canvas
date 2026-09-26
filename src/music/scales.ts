import type { InstrumentId, WorldId } from "../types/project";

export const MAJOR_PENTATONIC = [0, 2, 4, 7, 9] as const;

/** Middle-register tonics; bass and pad mappings shift these down safely. */
export const WORLD_TONICS: Readonly<Record<WorldId, number>> = {
  soft: 60,
  bounce: 62,
  space: 57,
};

const MIDI_MIN = 24;
const MIDI_MAX = 96;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function isPentatonicMidi(note: number, tonicMidi = 60): boolean {
  if (!Number.isInteger(note)) return false;
  const pitchClass = positiveModulo(note - tonicMidi, 12);
  return MAJOR_PENTATONIC.some((interval) => interval === pitchClass);
}

/**
 * Finds the nearest in-scale MIDI note without ever clamping to an out-of-scale
 * raw boundary. Equal-distance ties resolve downward for cross-browser stability.
 */
export function nearestPentatonicInRange(
  note: number,
  tonicMidi = 60,
  minimum = MIDI_MIN,
  maximum = MIDI_MAX,
): number {
  const lower = clamp(Math.ceil(minimum), 0, 127);
  const upper = clamp(Math.floor(maximum), lower, 127);
  const target = Number.isFinite(note) ? note : tonicMidi;
  let closest: number | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let candidate = lower; candidate <= upper; candidate += 1) {
    if (!isPentatonicMidi(candidate, tonicMidi)) continue;
    const distance = Math.abs(target - candidate);
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }

  // Every normal musical register spans at least one pentatonic note. The
  // fallback only covers callers supplying a pathologically narrow range.
  return closest ?? lower;
}

/** Converts a scale degree (including negative degrees) into a MIDI note. */
export function pentatonicDegreeToMidi(
  degree: number,
  tonicMidi = 60,
): number {
  const integerDegree = Math.trunc(degree);
  const scaleIndex = positiveModulo(integerDegree, MAJOR_PENTATONIC.length);
  const octave = Math.floor(integerDegree / MAJOR_PENTATONIC.length);
  return tonicMidi + octave * 12 + MAJOR_PENTATONIC[scaleIndex];
}

/** Returns the closest note in the chosen major-pentatonic scale. */
export function quantizeToPentatonic(note: number, tonicMidi = 60): number {
  return nearestPentatonicInRange(note, tonicMidi, 0, 127);
}

/**
 * Maps normalized canvas Y (top = high) to a pentatonic scale degree.
 * `degreeCount` is deliberately expressed in scale notes, not semitones.
 */
export function normalizedYToPentatonic(
  y: number,
  tonicMidi = 60,
  degreeCount = 15,
): number {
  const normalized = clamp(Number.isFinite(y) ? y : 0.5, 0, 1);
  const safeCount = Math.max(1, Math.trunc(degreeCount));
  const degree = Math.round((1 - normalized) * (safeCount - 1));
  return nearestPentatonicInRange(
    pentatonicDegreeToMidi(degree, tonicMidi),
    tonicMidi,
    MIDI_MIN,
    MIDI_MAX,
  );
}

/** 世界の基準音から図形の音程を決め、楽器コースの打楽器だけを無音程にする。 */
export function pitchForInstrument(
  y: number,
  instrumentId: InstrumentId,
  worldId: WorldId,
): number | undefined {
  const tonic = WORLD_TONICS[worldId];

  switch (instrumentId) {
    case "bell":
      return normalizedYToPentatonic(y, tonic, 15);
    case "marimba":
      return normalizedYToPentatonic(y, tonic - 12, 12);
    case "piano":
      return normalizedYToPentatonic(y, tonic - 12, 16);
    case "harp":
      return normalizedYToPentatonic(y, tonic, 14);
    case "glockenspiel":
      return normalizedYToPentatonic(y, tonic + 12, 10);
    case "kalimba":
      return normalizedYToPentatonic(y, tonic, 11);
    case "chime":
      return normalizedYToPentatonic(y, tonic + 12, 8);
    case "flute":
      return normalizedYToPentatonic(y, tonic, 13);
    case "bass":
      return normalizedYToPentatonic(y, tonic - 24, 6);
    case "pad":
      return normalizedYToPentatonic(y, tonic - 12, 10);
    case "drum":
    case "percussion":
      return worldId === "bounce" ? undefined : normalizedYToPentatonic(y, tonic - 12, 10);
  }
}

/** Moves a MIDI note by scale degrees while keeping it in a safe register. */
export function transposePentatonic(
  note: number,
  degreeOffset: number,
  tonicMidi = 60,
): number {
  const quantized = quantizeToPentatonic(note, tonicMidi);
  let currentDegree = 0;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (let degree = -20; degree <= 30; degree += 1) {
    const candidate = pentatonicDegreeToMidi(degree, tonicMidi);
    const distance = Math.abs(candidate - quantized);
    if (distance < smallestDistance) {
      currentDegree = degree;
      smallestDistance = distance;
    }
  }

  return nearestPentatonicInRange(
    pentatonicDegreeToMidi(currentDegree + Math.trunc(degreeOffset), tonicMidi),
    tonicMidi,
    MIDI_MIN,
    MIDI_MAX,
  );
}
