import type { AnimationMood } from "../visuals/animationMood";
import {
  BARS,
  TOTAL_BEATS,
  type InstrumentId,
  type MusicEvent,
  type VisualEventKind,
  type WorldId,
} from "../types/project";
import { mixSeed, createPrng } from "./prng";
import { pentatonicDegreeToMidi, WORLD_TONICS } from "./scales";
import { getSectionAtBeat } from "./sections";

const BACKING_VELOCITY_MIN = 0.12;
const BACKING_VELOCITY_MAX = 0.28;

interface BackingEventInput {
  role: string;
  beat: number;
  durationBeats: number;
  velocity: number;
  instrumentId: InstrumentId;
  visualEvent: VisualEventKind;
  degree?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}

function sectionEnergy(beat: number): number {
  switch (getSectionAtBeat(beat)) {
    case "intro":
      return 0.78;
    case "a":
      return 0.9;
    case "b":
      return 0.98;
    case "break":
      return 0.72;
    case "climax":
      return 1.08;
    case "outro":
      return 0.68;
  }
}

function makeEvent(
  mood: AnimationMood,
  worldId: WorldId,
  index: number,
  input: BackingEventInput,
): MusicEvent | undefined {
  if (input.beat < 0 || input.beat >= TOTAL_BEATS) return undefined;

  const durationBeats = Math.min(input.durationBeats, TOTAL_BEATS - input.beat);
  if (durationBeats <= 0) return undefined;

  const event: MusicEvent = {
    id: `bgm-${mood}-${index.toString(36)}`,
    shapeId: `bgm:${mood}:${input.role}`,
    beat: input.beat,
    durationBeats,
    velocity: clamp(
      input.velocity * sectionEnergy(input.beat),
      BACKING_VELOCITY_MIN,
      BACKING_VELOCITY_MAX,
    ),
    instrumentId: input.instrumentId,
    section: getSectionAtBeat(input.beat),
    visualEvent: input.visualEvent,
  };

  if (input.degree !== undefined) {
    event.midiNote = pentatonicDegreeToMidi(
      input.degree,
      WORLD_TONICS[worldId],
    );
  }

  return event;
}

function buildFloatInputs(seed: number): BackingEventInput[] {
  const random = createPrng(mixSeed("bgm", "float", seed));
  const degreeOffset = random.integer(0, 5);
  const pianoDegrees = [-5, -3, -4, -2, -5, -1] as const;
  const chimeDegrees = [5, 7, 9, 6, 8] as const;
  const fluteDegrees = [1, 2, 4, 3, 0] as const;
  const inputs: BackingEventInput[] = [];

  for (let bar = 0; bar < BARS; bar += 1) {
    const barBeat = bar * 4;
    const pianoDegree = pianoDegrees[bar % pianoDegrees.length] + degreeOffset;
    const chimeDegree = chimeDegrees[(bar + degreeOffset) % chimeDegrees.length];
    const chimeOffset = random.pick([1.0, 1.25, 1.5, 1.75] as const);

    inputs.push({
      role: "piano-bed",
      beat: barBeat,
      durationBeats: 3.45,
      velocity: 0.2,
      instrumentId: "piano",
      visualEvent: "fade",
      degree: pianoDegree,
    });
    inputs.push({
      role: "loose-chime",
      beat: barBeat + chimeOffset,
      durationBeats: 0.8,
      velocity: 0.21,
      instrumentId: "chime",
      visualEvent: "orbit",
      degree: chimeDegree,
    });

    if (bar % 2 === 1) {
      inputs.push({
        role: "soft-flute",
        beat: barBeat + 2.55,
        durationBeats: 0.72,
        velocity: 0.17,
        instrumentId: "flute",
        visualEvent: "wave",
        degree: fluteDegrees[(bar + degreeOffset) % fluteDegrees.length],
      });
    }
  }

  return inputs;
}

function buildPopInputs(seed: number): BackingEventInput[] {
  const random = createPrng(mixSeed("bgm", "pop", seed));
  const degreeOffset = random.integer(0, 5);
  const bassDegrees = [-10, -8, -9, -7, -10, -6] as const;
  const pianoDegrees = [0, 2, 4, 1, 3] as const;
  const inputs: BackingEventInput[] = [];

  for (let bar = 0; bar < BARS; bar += 1) {
    const barBeat = bar * 4;
    const bassDegree = bassDegrees[bar % bassDegrees.length] + degreeOffset;

    for (let quarter = 0; quarter < 4; quarter += 1) {
      inputs.push({
        role: quarter % 2 === 0 ? "strong-beat" : "light-beat",
        beat: barBeat + quarter,
        durationBeats: 0.12,
        velocity: quarter % 2 === 0 ? 0.23 : 0.17,
        instrumentId: "drum",
        visualEvent: "split",
      });
    }

    for (const halfBeat of [0, 2] as const) {
      inputs.push({
        role: "bass-step",
        beat: barBeat + halfBeat,
        durationBeats: 0.42,
        velocity: 0.22,
        instrumentId: "bass",
        visualEvent: "wave",
        degree: bassDegree + (halfBeat === 2 ? 1 : 0),
      });
    }

    for (const offbeat of [0.5, 2.5] as const) {
      const index = Math.floor(offbeat);
      inputs.push({
        role: "piano-offbeat",
        beat: barBeat + offbeat,
        durationBeats: 0.3,
        velocity: 0.18,
        instrumentId: "piano",
        visualEvent: "pulse",
        degree: pianoDegrees[(bar + index + degreeOffset) % pianoDegrees.length],
      });
    }
  }

  return inputs;
}

function buildCosmicInputs(seed: number): BackingEventInput[] {
  const random = createPrng(mixSeed("bgm", "cosmic", seed));
  const degreeOffset = random.integer(0, 5);
  const direction = random.pick([1, -1] as const);
  const droneDegrees = [-5, -3, -4, -2, -5, -1] as const;
  const arpeggioDegrees = [5, 7, 9, 12] as const;
  const inputs: BackingEventInput[] = [];

  for (let bar = 0; bar < BARS; bar += 1) {
    const barBeat = bar * 4;
    inputs.push({
      role: "flute-drone",
      beat: barBeat,
      durationBeats: 3.72,
      velocity: 0.16,
      instrumentId: "flute",
      visualEvent: "wave",
      degree: droneDegrees[bar % droneDegrees.length] + degreeOffset,
    });

    for (let step = 0; step < 4; step += 1) {
      const patternIndex = direction === 1 ? step : 3 - step;
      const instrumentId: InstrumentId = step % 2 === 0
        ? "chime"
        : "glockenspiel";
      inputs.push({
        role: instrumentId === "chime" ? "star-chime" : "star-glock",
        beat: barBeat + 0.5 + step,
        durationBeats: instrumentId === "chime" ? 0.7 : 0.28,
        velocity: instrumentId === "chime" ? 0.18 : 0.16,
        instrumentId,
        visualEvent: instrumentId === "chime" ? "orbit" : "fade",
        degree: arpeggioDegrees[(patternIndex + bar + degreeOffset) % arpeggioDegrees.length],
      });
    }
  }

  return inputs;
}

/**
 * Builds a quiet, deterministic 30-second backing part for one animation mood.
 * The backing track intentionally uses sparse voices so the drawing's own
 * instruments stay in the foreground.
 */
export function buildBackingTrack(
  worldId: WorldId,
  mood: AnimationMood,
  seed: number,
): MusicEvent[] {
  const normalizedSeed = safeSeed(seed);
  let inputs: BackingEventInput[];

  switch (mood) {
    case "float":
      inputs = buildFloatInputs(normalizedSeed);
      break;
    case "pop":
      inputs = buildPopInputs(normalizedSeed);
      break;
    case "cosmic":
      inputs = buildCosmicInputs(normalizedSeed);
      break;
  }

  return inputs
    .map((input, index) => makeEvent(mood, worldId, index, input))
    .filter((event): event is MusicEvent => event !== undefined)
    .sort((left, right) =>
      left.beat - right.beat || left.id.localeCompare(right.id)
    );
}
