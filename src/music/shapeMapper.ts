import type {
  CanvasShape,
  InstrumentId,
  VisualEventKind,
  WorldId,
} from "../types/project";
import { colorSoundProfile } from "./creativeRules";
import { pitchForInstrument, transposePentatonic, WORLD_TONICS } from "./scales";

export const STEPS_PER_BAR = 16 as const;
export const BEATS_PER_STEP = 0.25 as const;

export interface MotifEvent {
  shapeId: string;
  shapeOrder: number;
  step: number;
  durationBeats: number;
  midiNote?: number;
  velocity: number;
  instrumentId: InstrumentId;
  visualEvent: VisualEventKind;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalized(value: number, fallback = 0.5): number {
  return clamp(Number.isFinite(value) ? value : fallback, 0, 1);
}

/** Maps 0..1 canvas X onto the nearest one of sixteen sequencer steps. */
export function quantizeXToStep(x: number): number {
  return Math.round(normalized(x) * (STEPS_PER_BAR - 1));
}

export function instrumentForShape(shape: CanvasShape): InstrumentId {
  switch (shape.kind) {
    case "circle":
      return "marimba";
    case "triangle":
      return "drum";
    case "line":
      return "bass";
    case "square":
      return "piano";
    case "diamond":
      return "harp";
    case "star":
      return "glockenspiel";
    case "hexagon":
      return "kalimba";
    case "ring":
      return "chime";
    case "pen":
      return "flute";
  }
}

function effectiveSize(shape: CanvasShape): number {
  const baseSize = normalized(shape.size, 0.2);
  if (shape.kind !== "pen" || !shape.points || shape.points.length < 2) {
    return baseSize;
  }

  let strokeLength = 0;
  for (let index = 1; index < shape.points.length; index += 1) {
    const previous = shape.points[index - 1];
    const current = shape.points[index];
    if (!previous || !current) continue;
    if (
      !Number.isFinite(previous.x) ||
      !Number.isFinite(previous.y) ||
      !Number.isFinite(current.x) ||
      !Number.isFinite(current.y)
    ) {
      continue;
    }
    strokeLength += Math.hypot(current.x - previous.x, current.y - previous.y);
  }

  // Longer strokes create a gently longer pad while retaining the size knob.
  return Math.max(baseSize, clamp(strokeLength / 2, 0, 1));
}

function visualForInstrument(instrumentId: InstrumentId): VisualEventKind {
  switch (instrumentId) {
    case "bell":
    case "marimba":
    case "piano":
    case "kalimba":
      return "pulse";
    case "percussion":
    case "drum":
      return "split";
    case "bass":
    case "harp":
    case "flute":
      return "wave";
    case "pad":
    case "chime":
      return "orbit";
    case "glockenspiel":
      return "fade";
  }
}

function durationForInstrument(instrumentId: InstrumentId, size: number): number {
  switch (instrumentId) {
    case "bell":
      return 0.25 + size * 0.5;
    case "marimba":
      return 0.3 + size * 0.4;
    case "piano":
      return 0.4 + size * 0.4;
    case "harp":
      return 0.65 + size * 0.75;
    case "glockenspiel":
      return 0.25 + size * 0.35;
    case "kalimba":
      return 0.25 + size * 0.4;
    case "chime":
      return 0.9 + size;
    case "flute":
      return 0.7 + size;
    case "percussion":
    case "drum":
      return 0.125;
    case "bass":
      return 0.5 + size * 0.5;
    case "pad":
      return 1 + size;
  }
}

export function mapShapeToMotif(
  shape: CanvasShape,
  worldId: WorldId,
  shapeOrder = 0,
): MotifEvent {
  const size = effectiveSize(shape);
  const instrumentId = instrumentForShape(shape);
  const profile = colorSoundProfile(shape.colorId);
  const baseMidiNote = pitchForInstrument(shape.position.y, instrumentId, worldId);
  const midiNote = baseMidiNote === undefined
    ? undefined
    : transposePentatonic(baseMidiNote, profile.degreeOffset, WORLD_TONICS[worldId]);
  const event: MotifEvent = {
    shapeId: shape.id,
    shapeOrder,
    step: quantizeXToStep(shape.position.x),
    durationBeats: clamp(durationForInstrument(instrumentId, size) * profile.durationScale, 0.1, 2.4),
    velocity: clamp((0.38 + size * 0.5) * profile.velocityScale, 0.26, 0.94),
    instrumentId,
    visualEvent: visualForInstrument(instrumentId),
  };

  if (midiNote !== undefined) {
    event.midiNote = midiNote;
  }

  return event;
}

/**
 * Stable spatial ordering is important: adding a shape must not reorder equal-X
 * shapes unpredictably between browsers.
 */
export function shapesToMotif(
  shapes: readonly CanvasShape[],
  worldId: WorldId,
): MotifEvent[] {
  const ordered = shapes
    .map((shape, sourceIndex) => ({ shape, sourceIndex }))
    .sort((left, right) => {
      const xDifference = left.shape.position.x - right.shape.position.x;
      if (xDifference !== 0) return xDifference;
      const zDifference = left.shape.zIndex - right.shape.zIndex;
      if (zDifference !== 0) return zDifference;
      const idDifference = left.shape.id.localeCompare(right.shape.id);
      return idDifference !== 0 ? idDifference : left.sourceIndex - right.sourceIndex;
    });

  return ordered.map(({ shape }, shapeOrder) =>
    mapShapeToMotif(shape, worldId, shapeOrder),
  );
}
