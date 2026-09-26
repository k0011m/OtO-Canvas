import {
  shapeColorValue,
  type CanvasShape,
  type MusicEvent,
  type SectionId,
  type VisualEventKind,
  type WorldTheme,
} from "../types/project";
import type { AnimationMood } from "./animationMood";

export interface VisualInteraction {
  /** Normalised canvas position. */
  x: number;
  /** Normalised canvas position. */
  y: number;
  /** 0-1 conducting energy. */
  strength: number;
}

export interface VisualFrameInput {
  shapes: readonly CanvasShape[];
  /** Events should be sorted by beat for the fastest lookup. */
  events: readonly MusicEvent[];
  theme: WorldTheme;
  beat: number;
  section: SectionId;
  width: number;
  height: number;
  dpr?: number;
  timeMs: number;
  /** The visual choreography selected before playback. */
  animationMood?: AnimationMood;
  interaction?: VisualInteraction;
  reducedMotion?: boolean;
  lowPower?: boolean;
}

export interface VisualNode {
  id: string;
  sourceId: string;
  shape: CanvasShape;
  x: number;
  y: number;
  radius: number;
  rotation: number;
  scale: number;
  opacity: number;
  eventIntensity: number;
  eventKind?: VisualEventKind;
  clone: boolean;
}

export type VisualNodeTransformer = (
  nodes: readonly VisualNode[],
) => readonly VisualNode[];

export interface ActiveVisualEvent {
  event: MusicEvent;
  intensity: number;
}

interface SectionRange {
  start: number;
  end: number;
}

const TAU = Math.PI * 2;
const SECONDS_PER_BEAT = 60 / 96;
export const SECTION_SLIDE_BEATS = 1.25;
const ACTIVE_EVENT_LOOKBACK_BEATS = 6;

const SECTION_SEQUENCE: readonly SectionId[] = [
  "intro",
  "a",
  "b",
  "break",
  "climax",
  "outro",
] as const;

export const SECTION_BEAT_RANGES: Readonly<Record<SectionId, SectionRange>> = {
  intro: { start: 0, end: 8 },
  a: { start: 8, end: 16 },
  b: { start: 16, end: 24 },
  break: { start: 24, end: 32 },
  climax: { start: 32, end: 40 },
  outro: { start: 40, end: 48 },
};

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;

const smoothstep = (from: number, to: number, value: number): number => {
  if (from === to) return value < from ? 0 : 1;
  const amount = clamp((value - from) / (to - from));
  return amount * amount * (3 - 2 * amount);
};

const textHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const hashUnit = (value: string): number => textHash(value) / 0xffffffff;

const safeBeat = (beat: number): number => (Number.isFinite(beat) ? beat : 0);

export function sectionAtBeat(beat: number): SectionId {
  const current = safeBeat(beat);
  if (current < SECTION_BEAT_RANGES.intro.end) return "intro";
  if (current < SECTION_BEAT_RANGES.a.end) return "a";
  if (current < SECTION_BEAT_RANGES.b.end) return "b";
  if (current < SECTION_BEAT_RANGES.break.end) return "break";
  if (current < SECTION_BEAT_RANGES.climax.end) return "climax";
  return "outro";
}

export function getSectionProgress(beat: number, section: SectionId): number {
  const range = SECTION_BEAT_RANGES[section];
  return clamp((safeBeat(beat) - range.start) / (range.end - range.start));
}

/**
 * A soft note envelope. It deliberately has no single-frame spikes, so even
 * dense arrangements cannot create flashing imagery.
 */
export function getEventIntensity(event: MusicEvent, beat: number): number {
  const offset = safeBeat(beat) - event.beat;
  if (offset < -0.08) return 0;

  const attack = smoothstep(-0.08, 0.08, offset);
  const life = Math.max(0.65, Math.min(2.4, event.durationBeats + 0.35));
  const decay = Math.exp((-Math.max(0, offset) * 2.35) / life);
  // Exponential decay alone never reaches zero. The smooth finite tail makes
  // every event arrive at exactly zero before it leaves the active window, so
  // an orbit or wave cannot vanish between adjacent frames.
  const finiteTail = 1 - smoothstep(4.75, ACTIVE_EVENT_LOOKBACK_BEATS, Math.max(0, offset));
  return clamp(attack * decay * finiteTail * (0.55 + clamp(event.velocity) * 0.45));
}

function lowerBoundByBeat(events: readonly MusicEvent[], targetBeat: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle].beat < targetBeat) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Finds only the short event window that can still be visible. */
export function collectActiveVisualEvents(
  events: readonly MusicEvent[],
  beat: number,
): ActiveVisualEvent[] {
  if (events.length === 0) return [];

  const current = safeBeat(beat);
  // The longest visual decay remains faintly visible for almost six beats.
  // Looking back for the full tail prevents an event from disappearing in one
  // frame merely because it crossed a fixed lookup-window boundary.
  const first = lowerBoundByBeat(events, current - ACTIVE_EVENT_LOOKBACK_BEATS);
  const active: ActiveVisualEvent[] = [];
  for (let index = first; index < events.length; index += 1) {
    const event = events[index];
    if (event.beat > current + 0.08) break;
    const intensity = getEventIntensity(event, current);
    if (intensity > 0) active.push({ event, intensity });
  }
  return active;
}

function shapeRadius(shape: CanvasShape, shortestSide: number): number {
  const size = Number.isFinite(shape.size) ? shape.size : 0.09;
  if (size <= 1.5) return clamp(size, 0.038, 0.22) * shortestSide;
  return clamp(size, 18, shortestSide * 0.24);
}

function rotationInRadians(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;
  return Math.abs(rotation) > TAU * 1.1 ? (rotation * Math.PI) / 180 : rotation;
}

interface VisualReaction {
  intensity: number;
  kind: VisualEventKind;
  byKind: Record<VisualEventKind, number>;
}

function emptyReaction(kind: VisualEventKind): VisualReaction {
  return {
    intensity: 0,
    kind,
    byKind: { pulse: 0, orbit: 0, wave: 0, split: 0, fade: 0 },
  };
}

function eventReactionMap(
  activeEvents: readonly ActiveVisualEvent[],
): Map<string, VisualReaction> {
  const reactions = new Map<string, VisualReaction>();
  for (const active of activeEvents) {
    const reaction = reactions.get(active.event.shapeId) ?? emptyReaction(active.event.visualEvent);
    reaction.byKind[active.event.visualEvent] = Math.max(
      reaction.byKind[active.event.visualEvent],
      active.intensity,
    );
    if (active.intensity >= reaction.intensity) {
      reaction.intensity = active.intensity;
      reaction.kind = active.event.visualEvent;
    }
    reactions.set(active.event.shapeId, reaction);
  }
  return reactions;
}

interface ShapeGroupPosition {
  index: number;
  count: number;
}

function groupPositions(shapes: readonly CanvasShape[]): Map<string, ShapeGroupPosition> {
  const counts = new Map<CanvasShape["kind"], number>();
  for (const shape of shapes) counts.set(shape.kind, (counts.get(shape.kind) ?? 0) + 1);

  const seen = new Map<CanvasShape["kind"], number>();
  const positions = new Map<string, ShapeGroupPosition>();
  for (const shape of shapes) {
    const index = seen.get(shape.kind) ?? 0;
    seen.set(shape.kind, index + 1);
    positions.set(shape.id, { index, count: counts.get(shape.kind) ?? 1 });
  }
  return positions;
}

function bSectionPosition(
  shape: CanvasShape,
  group: ShapeGroupPosition,
  index: number,
  count: number,
  width: number,
  height: number,
  time: number,
  motion: number,
): { x: number; y: number; rotation: number } {
  const phase = hashUnit(shape.id) * TAU;
  const groupRatio = (group.index + 0.5) / Math.max(1, group.count);
  const layoutRatio = (index + 0.5) / Math.max(1, count);

  if (shape.kind === "circle" || shape.kind === "ring") {
    const angle = layoutRatio * TAU - Math.PI / 2 + time * 0.08 * motion;
    const orbitX = width * (0.22 + hashUnit(`${shape.id}:orbit`) * 0.09);
    const orbitY = height * 0.25;
    return {
      x: width / 2 + Math.cos(angle) * orbitX,
      y: height / 2 + Math.sin(angle) * orbitY,
      rotation: angle + Math.PI / 2,
    };
  }

  if (
    shape.kind === "triangle" ||
    shape.kind === "diamond" ||
    shape.kind === "star"
  ) {
    const angle = layoutRatio * TAU - Math.PI / 2;
    const orbitX = width * (0.12 + group.count * 0.008);
    const orbitY = height * (0.11 + group.count * 0.006);
    return {
      x: width / 2 + Math.cos(angle) * orbitX,
      y: height / 2 + Math.sin(angle) * orbitY,
      rotation: phase + angle + Math.sin(time * 0.25 + phase) * 0.08 * motion,
    };
  }

  if (shape.kind === "square" || shape.kind === "hexagon") {
    const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / columns));
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: width * (0.28 + (columns === 1 ? 0.22 : (column / (columns - 1)) * 0.44)),
      y: height * (0.28 + (rows === 1 ? 0.22 : (row / (rows - 1)) * 0.44)),
      rotation: phase + Math.sin(time * 0.25 + phase) * 0.08 * motion,
    };
  }

  return {
    x: width * (0.16 + layoutRatio * 0.68),
    y: height / 2 + Math.sin(layoutRatio * Math.PI * 2 + time * 0.35) * height * 0.2 * motion,
    rotation: Math.sin(groupRatio * Math.PI * 2 + time * 0.2) * 0.45 * motion,
  };
}

interface BaseLayout {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
}

const SECTION_MOTION_GAIN: Readonly<Record<SectionId, number>> = {
  intro: 0.64,
  a: 0.9,
  b: 1.08,
  break: 0.72,
  climax: 1.62,
  outro: 0.92,
};

const SECTION_CLIMAX_WEIGHT: Readonly<Record<SectionId, number>> = {
  intro: 0,
  a: 0,
  b: 0,
  break: 0,
  climax: 1,
  outro: 0,
};

const SECTION_RING_WEIGHT: Readonly<Record<SectionId, number>> = {
  intro: 0,
  a: 0,
  b: 1,
  break: 0,
  climax: 1,
  outro: 0,
};

const SECTION_SURFACE_ALPHA: Readonly<Record<SectionId, number>> = {
  intro: 0.26,
  a: 0.26,
  b: 0.26,
  break: 0.42,
  climax: 0.26,
  outro: 0.26,
};

const SECTION_SURFACE_RADIUS: Readonly<Record<SectionId, number>> = {
  intro: 0.27,
  a: 0.27,
  b: 0.27,
  break: 0.34,
  climax: 0.47,
  outro: 0.27,
};

function animationMood(input: VisualFrameInput): AnimationMood {
  return input.animationMood ?? "float";
}

/**
 * Adds the selected choreography on top of the section composition. All
 * curves are continuous: movement can be bold without relying on flashes or
 * single-frame cuts.
 */
function applyAnimationMood(
  layout: BaseLayout,
  shape: CanvasShape,
  index: number,
  input: VisualFrameInput,
  seconds: number,
): BaseLayout {
  const shortest = Math.min(input.width, input.height);
  const phase = hashUnit(`${shape.id}:mood`) * TAU;
  const direction = hashUnit(`${shape.id}:direction`) > 0.5 ? 1 : -1;
  const gain = SECTION_MOTION_GAIN[input.section];
  // Reduced motion still communicates the chosen mood, but keeps travel and
  // zoom close to the resting composition. Low power lowers amplitude without
  // changing timing, keeping audio and visuals synchronised.
  const motion = input.reducedMotion ? 0.12 : input.lowPower ? 0.82 : 1;
  const progress = getSectionProgress(input.beat, input.section);
  const endingEase = input.section === "outro" ? 1 - smoothstep(0.78, 1, progress) * 0.45 : 1;
  const amount = gain * motion * endingEase;

  const mood = animationMood(input);
  if (mood !== "float" && mood !== "pop" && mood !== "cosmic") {
    return groupChoreography(layout, mood, index, input, seconds, motion * endingEase);
  }

  switch (mood) {
    case "float": {
      const wave = shortest * (0.048 + gain * 0.038) * motion * endingEase;
      const longWave = Math.sin(seconds * 0.72 + phase);
      const crossWave = Math.sin(seconds * 1.02 + phase * 1.73 + index * 0.31);
      return {
        ...layout,
        x:
          layout.x +
          longWave * wave +
          Math.sin(seconds * 0.31 + phase + layout.y / Math.max(1, input.height)) * wave * 0.48,
        y: layout.y + crossWave * wave * 0.78,
        rotation:
          layout.rotation + Math.sin(seconds * 0.58 + phase) * (0.16 + gain * 0.13) * motion,
        scale:
          layout.scale *
          (1 + Math.sin(seconds * 0.86 + phase * 0.7) * (0.035 + gain * 0.035) * motion),
      };
    }
    case "pop": {
      const rhythm = seconds * (2.45 + gain * 0.22) + phase;
      const rebound = Math.abs(Math.sin(rhythm));
      const sideTravel = shortest * (0.045 + gain * 0.032) * motion * endingEase;
      // Raising a smooth 0-1 wave gives a punchy zoom while retaining a soft
      // transition across frames.
      const punch = Math.pow((Math.sin(rhythm * 1.12) + 1) / 2, 5);
      return {
        ...layout,
        x: layout.x + Math.sin(seconds * 1.55 + phase + index * 0.18) * sideTravel,
        y:
          layout.y +
          (0.48 - rebound) * shortest * (0.075 + gain * 0.042) * motion * endingEase,
        rotation:
          layout.rotation +
          direction * seconds * (0.2 + gain * 0.29) * motion +
          Math.sin(rhythm) * 0.2 * amount,
        scale: layout.scale * (1 + punch * (0.08 + gain * 0.095) * motion),
      };
    }
    case "cosmic": {
      const centerX = input.width / 2;
      const centerY = input.height / 2;
      const deltaX = layout.x - centerX;
      const deltaY = layout.y - centerY;
      const orbitAngle =
        direction * (seconds * (0.1 + gain * 0.16) + Math.sin(seconds * 0.25 + phase) * 0.18) *
        motion;
      const cosine = Math.cos(orbitAngle);
      const sine = Math.sin(orbitAngle);
      const depth = Math.sin(seconds * 0.72 + phase + index * 0.27);
      const radialScale = 1 + depth * (0.065 + gain * 0.055) * motion;
      const localOrbit = shortest * (0.025 + gain * 0.022) * motion * endingEase;
      return {
        ...layout,
        x:
          centerX +
          (deltaX * cosine - deltaY * sine) * radialScale +
          Math.cos(seconds * 1.08 + phase) * localOrbit,
        y:
          centerY +
          (deltaX * sine + deltaY * cosine) * radialScale +
          Math.sin(seconds * 0.92 + phase) * localOrbit * 0.72,
        rotation: layout.rotation + orbitAngle + direction * seconds * 0.12 * amount,
        scale: layout.scale * (1 + depth * (0.09 + gain * 0.075) * motion),
      };
    }
  }
}

/** 集団で揃う動きと順番に伝わる動きを、連続した曲線で描き分ける。 */
function groupChoreography(layout: BaseLayout, mood: AnimationMood, index: number, input: VisualFrameInput, seconds: number, motion: number): BaseLayout {
  const t = seconds * 1.6;
  const wave = Math.sin(t);
  const amplitude = Math.min(input.width, input.height) * 0.12 * motion;
  const centerX = input.width / 2;
  const centerY = input.height / 2;
  const dx = layout.x - centerX;
  const dy = layout.y - centerY;
  switch (mood) {
    case "wave": return { ...layout, y: layout.y + Math.sin(t - index * 0.65) * amplitude };
    case "march": return { ...layout, x: layout.x + wave * amplitude, y: layout.y - Math.abs(Math.sin(t * 2 + index * Math.PI)) * amplitude * 0.3 };
    case "spiral": {
      const angle = t * 0.45 * motion;
      const radius = 0.8 + 0.2 * Math.cos(t * 0.6);
      return { ...layout, x: centerX + (dx * Math.cos(angle) - dy * Math.sin(angle)) * (1 + (radius - 1) * motion), y: centerY + (dx * Math.sin(angle) + dy * Math.cos(angle)) * (1 + (radius - 1) * motion) };
    }
    case "breathe": return { ...layout, scale: layout.scale * (1 + wave * 0.24 * motion) };
    case "swing": return { ...layout, x: layout.x + wave * amplitude, rotation: layout.rotation + wave * 0.5 * motion };
    case "zigzag": return { ...layout, x: layout.x + Math.asin(Math.sin(t)) / (Math.PI / 2) * amplitude, y: layout.y + Math.cos(t * 2) * amplitude * 0.4 };
    case "gather": { const factor = (1 - Math.cos(t * 0.5)) * 0.3 * motion; return { ...layout, x: layout.x - dx * factor, y: layout.y - dy * factor }; }
    case "scatter": { const factor = (1 - Math.cos(t)) * 0.17 * motion; return { ...layout, x: layout.x + dx * factor, y: layout.y + dy * factor }; }
    case "rise": return { ...layout, y: layout.y - (1 - Math.cos(t * 0.55)) * amplitude, x: layout.x + Math.sin(t * 0.7 + index) * amplitude * 0.25 };
    case "rain": return { ...layout, y: layout.y + (1 - Math.cos(t * 0.75 + index * 0.3)) * amplitude, rotation: layout.rotation + Math.sin(t + index) * 0.3 * motion };
    case "figure8": return { ...layout, x: layout.x + wave * amplitude, y: layout.y + Math.sin(t * 2) * amplitude * 0.6 };
    case "carousel": { const angle = t * 0.35 * motion; return { ...layout, x: centerX + dx * Math.cos(angle) - dy * Math.sin(angle), y: centerY + dx * Math.sin(angle) + dy * Math.cos(angle), rotation: layout.rotation + angle }; }
    default: return layout;
  }
}

function sectionLayout(
  shape: CanvasShape,
  index: number,
  count: number,
  group: ShapeGroupPosition,
  input: VisualFrameInput,
  time: number,
): BaseLayout {
  const { width, height, section, reducedMotion } = input;
  const shortest = Math.min(width, height);
  const margin = shortest * 0.1;
  const originalX = margin + clamp(shape.position.x) * Math.max(1, width - margin * 2);
  const originalY = margin + clamp(shape.position.y) * Math.max(1, height - margin * 2);
  const originalRotation = rotationInRadians(shape.rotation);
  const progress = getSectionProgress(input.beat, section);
  const motion = reducedMotion ? 0.14 : 1;
  const phase = hashUnit(shape.id) * TAU;

  switch (section) {
    case "intro": {
      const revealStart = index / Math.max(1, count);
      const reveal = smoothstep(revealStart, Math.min(1, revealStart + 0.2), progress);
      return {
        x: originalX,
        y: originalY + (1 - reveal) * shortest * 0.04 * motion,
        rotation: originalRotation,
        scale: lerp(0.72, 1, reveal),
        opacity: reveal,
      };
    }
    case "a":
      return {
        x: originalX + Math.cos(time * 0.24 + phase) * shortest * 0.008 * motion,
        y: originalY + Math.sin(time * 0.2 + phase) * shortest * 0.008 * motion,
        rotation: originalRotation,
        scale: 1,
        opacity: 1,
      };
    case "b": {
      const position = bSectionPosition(
        shape,
        group,
        index,
        count,
        width,
        height,
        time,
        motion,
      );
      return {
        ...position,
        rotation: originalRotation + position.rotation,
        scale: 0.94,
        opacity: 0.96,
      };
    }
    case "break": {
      const visibleCount = Math.max(1, Math.ceil(count * 0.45));
      const featured = index < visibleCount;
      const ratio = (index + 1) / (visibleCount + 1);
      return {
        x: featured ? width * (0.18 + ratio * 0.64) : originalX,
        y:
          (featured ? height * (0.42 + (index % 2) * 0.16) : originalY) +
          Math.sin(time * 0.12 + phase) * shortest * 0.006 * motion,
        rotation: originalRotation,
        scale: featured ? 0.88 : 0.62,
        opacity: featured ? 0.82 : 0.08,
      };
    }
    case "climax": {
      const ratio = (index + 0.5) / Math.max(1, count);
      const angle = ratio * TAU + phase * 0.18 + time * 0.12 * motion;
      const radiusX = width * (0.25 + 0.08 * Math.sin(time * 0.18 + phase) * motion);
      const radiusY = height * (0.25 + 0.06 * Math.cos(time * 0.16 + phase) * motion);
      return {
        x: width / 2 + Math.cos(angle) * radiusX,
        y: height / 2 + Math.sin(angle) * radiusY,
        rotation: originalRotation + angle * 0.18 * motion,
        scale: 1.04,
        opacity: 1,
      };
    }
    case "outro": {
      if (index === 0) {
        const finalFade = 1 - smoothstep(0.94, 1, progress);
        return {
          x: lerp(originalX, width / 2, smoothstep(0.35, 0.86, progress)),
          y: lerp(originalY, height / 2, smoothstep(0.35, 0.86, progress)),
          rotation: originalRotation,
          scale: lerp(1, 0.82, progress),
          opacity: finalFade,
        };
      }
      const removalRank = (count - 1 - index) / Math.max(1, count - 1);
      const fade = 1 - smoothstep(removalRank * 0.78, removalRank * 0.78 + 0.2, progress);
      const direction = hashUnit(`${shape.id}:exit`) > 0.5 ? 1 : -1;
      return {
        x: originalX + direction * smoothstep(0, 1, 1 - fade) * width * 0.08 * motion,
        y: originalY - smoothstep(0, 1, 1 - fade) * height * 0.05 * motion,
        rotation: originalRotation + direction * (1 - fade) * 0.2 * motion,
        scale: lerp(1, 0.76, 1 - fade),
        opacity: fade,
      };
    }
  }
}

function blendLayouts(from: BaseLayout, to: BaseLayout, amount: number): BaseLayout {
  const eased = clamp(amount);
  return {
    x: lerp(from.x, to.x, eased),
    y: lerp(from.y, to.y, eased),
    rotation: lerp(from.rotation, to.rotation, eased),
    scale: lerp(from.scale, to.scale, eased),
    opacity: lerp(from.opacity, to.opacity, eased),
  };
}

function posedSectionLayout(
  section: SectionId,
  shape: CanvasShape,
  index: number,
  count: number,
  group: ShapeGroupPosition,
  input: VisualFrameInput,
  seconds: number,
): BaseLayout {
  const sectionInput = section === input.section ? input : { ...input, section };
  const layout = sectionLayout(
    shape,
    index,
    count,
    group,
    sectionInput,
    seconds,
  );
  return applyAnimationMood(layout, shape, index, sectionInput, seconds);
}

/**
 * Slides each source shape from one section composition into the next. At the
 * exact boundary the previous pose is retained, then the new destination is
 * approached over a short eased interval. No coordinate wrapping or position
 * replacement is used, so even a very fast transition still has a visible
 * path between its endpoints.
 */
function continuousSectionLayout(
  shape: CanvasShape,
  index: number,
  count: number,
  group: ShapeGroupPosition,
  input: VisualFrameInput,
  seconds: number,
): BaseLayout {
  const sectionIndex = SECTION_SEQUENCE.indexOf(input.section);
  const current = posedSectionLayout(
    input.section,
    shape,
    index,
    count,
    group,
    input,
    seconds,
  );
  if (sectionIndex <= 0) return current;

  const sectionStart = SECTION_BEAT_RANGES[input.section].start;
  const slide = smoothstep(
    sectionStart,
    sectionStart + SECTION_SLIDE_BEATS,
    safeBeat(input.beat),
  );
  if (slide >= 1) return current;

  const previousSection = SECTION_SEQUENCE[sectionIndex - 1];
  const previous = posedSectionLayout(
    previousSection,
    shape,
    index,
    count,
    group,
    input,
    seconds,
  );
  return blendLayouts(previous, current, slide);
}

function continuousSectionValue(
  input: VisualFrameInput,
  values: Readonly<Record<SectionId, number>>,
): number {
  const sectionIndex = SECTION_SEQUENCE.indexOf(input.section);
  const current = values[input.section];
  if (sectionIndex <= 0) return current;

  const sectionStart = SECTION_BEAT_RANGES[input.section].start;
  const slide = smoothstep(
    sectionStart,
    sectionStart + SECTION_SLIDE_BEATS,
    safeBeat(input.beat),
  );
  return lerp(values[SECTION_SEQUENCE[sectionIndex - 1]], current, slide);
}

function applyInteraction(
  layout: BaseLayout,
  radius: number,
  input: VisualFrameInput,
): BaseLayout {
  if (!input.interaction || input.interaction.strength <= 0.001) return layout;

  const interactionX = clamp(input.interaction.x) * input.width;
  const interactionY = clamp(input.interaction.y) * input.height;
  const deltaX = layout.x - interactionX;
  const deltaY = layout.y - interactionY;
  const distance = Math.hypot(deltaX, deltaY);
  const reach = Math.min(input.width, input.height) * 0.38;
  const proximity = (1 - smoothstep(radius, reach, distance)) * clamp(input.interaction.strength);
  if (proximity <= 0) return layout;

  const safeDistance = Math.max(radius * 0.5, distance);
  const travel = (input.reducedMotion ? 5 : 18) * proximity;
  return {
    ...layout,
    x: layout.x + (deltaX / safeDistance) * travel,
    y: layout.y + (deltaY / safeDistance) * travel,
    rotation: layout.rotation + (deltaX / safeDistance) * proximity * 0.08,
    scale: layout.scale * (1 + proximity * 0.14),
  };
}

/**
 * Turns project shapes into a deterministic draw list. Exported so layout and
 * accessibility tests can inspect the animation without a real canvas.
 */
export function buildVisualNodes(input: VisualFrameInput): VisualNode[] {
  const derivedSection = sectionAtBeat(input.beat);
  const frameInput = input.section === derivedSection
    ? input
    : { ...input, section: derivedSection };
  const { shapes, width, height, reducedMotion, lowPower } = frameInput;
  if (width <= 0 || height <= 0 || shapes.length === 0) return [];

  const sortedShapes = [...shapes].sort((left, right) => {
    if (left.zIndex !== right.zIndex) return left.zIndex - right.zIndex;
    return left.id.localeCompare(right.id);
  });
  const groups = groupPositions(sortedShapes);
  const reactions = eventReactionMap(
    collectActiveVisualEvents(frameInput.events, frameInput.beat),
  );
  const shortest = Math.min(width, height);
  // Animation time comes from the musical playhead, not wall-clock time. This
  // keeps playback, seeking, tests and future exports frame-for-frame stable.
  const seconds = safeBeat(frameInput.beat) * SECONDS_PER_BEAT;
  const nodes: VisualNode[] = [];

  sortedShapes.forEach((shape, index) => {
    const radius = shapeRadius(shape, shortest);
    const group = groups.get(shape.id) ?? { index, count: sortedShapes.length };
    let layout = continuousSectionLayout(
      shape,
      index,
      sortedShapes.length,
      group,
      frameInput,
      seconds,
    );
    const reaction = reactions.get(shape.id);
    const eventIntensity = reaction?.intensity ?? 0;
    const eventKind = reaction?.kind;
    const eventByKind = reaction?.byKind ?? {
      pulse: 0,
      orbit: 0,
      wave: 0,
      split: 0,
      fade: 0,
    };
    const motion = reducedMotion ? 0.16 : 1;

    if (eventByKind.orbit > 0) {
      const angle = seconds * 2.2 + hashUnit(shape.id) * TAU;
      layout.x += Math.cos(angle) * radius * 0.48 * eventByKind.orbit * motion;
      layout.y += Math.sin(angle) * radius * 0.48 * eventByKind.orbit * motion;
    }
    if (eventByKind.wave > 0) {
      layout.y += Math.sin(seconds * 3 + index) * radius * 0.58 * eventByKind.wave * motion;
      layout.rotation += Math.cos(seconds * 2.4 + index) * 0.12 * eventByKind.wave * motion;
    }
    if (eventByKind.fade > 0) {
      layout.opacity *= 1 - eventByKind.fade * 0.34;
    }

    const nonPulseIntensity = Math.max(
      eventByKind.orbit,
      eventByKind.wave,
      eventByKind.split,
      eventByKind.fade,
    );
    layout.scale *= 1 + eventByKind.pulse * 0.24 + nonPulseIntensity * 0.13;
    layout = applyInteraction(layout, radius, frameInput);

    const baseNode: VisualNode = {
      id: shape.id,
      sourceId: shape.id,
      shape,
      x: layout.x,
      y: layout.y,
      radius,
      rotation: layout.rotation,
      scale: layout.scale,
      opacity: clamp(layout.opacity),
      eventIntensity,
      eventKind,
      clone: false,
    };
    nodes.push(baseNode);

    const splitClone = eventByKind.split > 0.004;
    if (splitClone) {
      const splitAngle = hashUnit(`${shape.id}:split`) * TAU;
      const distance = radius * 0.9 * eventByKind.split * motion;
      nodes.push({
        ...baseNode,
        id: `${shape.id}:split`,
        x: baseNode.x + Math.cos(splitAngle) * distance,
        y: baseNode.y + Math.sin(splitAngle) * distance,
        scale: baseNode.scale * 0.82,
        opacity: baseNode.opacity * eventByKind.split * 0.46,
        clone: true,
      });
    }

    if (!reducedMotion) {
      const mood = animationMood(frameInput);
      // Stable clone ids across the full timeline prevent trails from popping
      // into an unrelated position at section changes. Their opacity carries
      // the effect in and out continuously instead.
      const copies = lowPower ? 1 : mood === "float" ? 2 : 3;
      const climaxEnergy =
        smoothstep(32, 33.25, safeBeat(frameInput.beat)) *
        (1 - smoothstep(40, 41.25, safeBeat(frameInput.beat)));

      for (let copy = 0; copy < copies; copy += 1) {
        const copyIndex = copy + 1;
        const direction = hashUnit(`${shape.id}:trail-direction`) > 0.5 ? 1 : -1;
        const phase = hashUnit(`${shape.id}:${mood}:trail:${copy}`) * TAU;
        let x = baseNode.x;
        let y = baseNode.y;
        let rotation = baseNode.rotation;
        let scale = baseNode.scale;
        let opacity = baseNode.opacity;

        if (mood === "float") {
          const distance = radius * (0.9 + copyIndex * 0.62);
          const angle = phase + seconds * 0.42 * direction;
          x += Math.cos(angle) * distance;
          y += Math.sin(angle * 0.78) * distance * 0.72;
          rotation += Math.sin(angle) * 0.3;
          scale *= 0.7 - copy * 0.1;
          opacity *= 0.16 - copy * 0.035;
        } else if (mood === "pop") {
          const angle = phase + seconds * 0.74 * direction;
          const distance = radius * (1.18 + copyIndex * 0.74);
          x += Math.cos(angle) * distance;
          y += Math.sin(angle) * distance;
          rotation += direction * copyIndex * 0.32;
          scale *= Math.max(0.4, 0.72 - copy * 0.1);
          const trailEnergy = Math.max(eventIntensity, climaxEnergy);
          opacity *= trailEnergy * Math.max(0.08, 0.22 - copy * 0.045);
        } else {
          const centerX = width / 2;
          const centerY = height / 2;
          const deltaX = baseNode.x - centerX;
          const deltaY = baseNode.y - centerY;
          const lag = -direction * copyIndex * 0.1;
          const cosine = Math.cos(lag);
          const sine = Math.sin(lag);
          x = centerX + deltaX * cosine - deltaY * sine + Math.cos(phase) * radius * 0.3;
          y = centerY + deltaX * sine + deltaY * cosine + Math.sin(phase) * radius * 0.3;
          rotation -= direction * copyIndex * 0.14;
          scale *= Math.max(0.46, 0.8 - copy * 0.1);
          opacity *= Math.max(0.07, 0.19 - copy * 0.038);
        }

        nodes.push({
          ...baseNode,
          id: `${shape.id}:${mood}:trail:${copy}`,
          x,
          y,
          rotation,
          scale,
          opacity: clamp(opacity),
          clone: true,
        });
      }
    }
  });

  return nodes;
}

function resolveShapeColor(shape: CanvasShape, theme: WorldTheme): string {
  const custom = (shape.colorId ?? "").trim();
  if (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(custom)) return custom;
  const paletteColor = shapeColorValue(custom);
  if (paletteColor) return paletteColor;
  if (custom === "accent") return theme.accent;
  if (custom === "ink") return theme.ink;
  // Projects made before the colour picker stored the shape name as colorId.
  if (custom === "circle") return theme.circle;
  if (custom === "triangle") return theme.triangle;
  if (custom === "line") return theme.line;

  switch (shape.kind) {
    case "circle":
    case "square":
      return theme.circle;
    case "triangle":
    case "diamond":
      return theme.triangle;
    case "line":
    case "hexagon":
      return theme.line;
    case "star":
    case "ring":
      return theme.accent;
    case "pen":
      return theme.ink;
  }
}

function traceRegularPolygon(
  context: CanvasRenderingContext2D,
  sides: number,
  radius: number,
  startAngle = -Math.PI / 2,
): void {
  for (let index = 0; index < sides; index += 1) {
    const angle = startAngle + (index / sides) * TAU;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function traceStar(context: CanvasRenderingContext2D, radius: number): void {
  const points = 10;
  for (let index = 0; index < points; index += 1) {
    const pointRadius = index % 2 === 0 ? radius : radius * 0.44;
    const angle = -Math.PI / 2 + (index / points) * TAU;
    const x = Math.cos(angle) * pointRadius;
    const y = Math.sin(angle) * pointRadius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function penPoints(shape: CanvasShape, radius: number): Array<{ x: number; y: number }> {
  const pointScale = radius * 2;
  return (shape.points ?? [])
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: point.x * pointScale, y: point.y * pointScale }));
}

function tracePenStroke(
  context: CanvasRenderingContext2D,
  shape: CanvasShape,
  radius: number,
): void {
  const points = penPoints(shape, radius);
  if (points.length === 0) {
    context.moveTo(-radius * 0.08, 0);
    context.lineTo(radius * 0.08, 0);
    return;
  }

  const first = points[0];
  context.moveTo(first.x, first.y);
  if (points.length === 1) {
    context.lineTo(first.x + Math.max(0.5, radius * 0.01), first.y);
    return;
  }
  if (points.length === 2) {
    context.lineTo(points[1].x, points[1].y);
    return;
  }

  // Quadratic midpoints round off the sampled pointer corners without adding
  // nondeterministic interpolation or changing the stored drawing.
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    context.quadraticCurveTo(
      point.x,
      point.y,
      (point.x + next.x) / 2,
      (point.y + next.y) / 2,
    );
  }
  const penultimate = points[points.length - 2];
  const last = points[points.length - 1];
  context.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
}

function drawShapePath(
  context: CanvasRenderingContext2D,
  shape: CanvasShape,
  radius: number,
): void {
  context.beginPath();
  switch (shape.kind) {
    case "circle":
      context.arc(0, 0, radius, 0, TAU);
      return;
    case "triangle":
      context.moveTo(0, -radius);
      context.lineTo(radius * 0.9, radius * 0.7);
      context.lineTo(-radius * 0.9, radius * 0.7);
      context.closePath();
      return;
    case "line":
      context.moveTo(-radius * 1.25, 0);
      context.lineTo(radius * 1.25, 0);
      return;
    case "square": {
      const halfSide = radius * 0.78;
      context.rect(-halfSide, -halfSide, halfSide * 2, halfSide * 2);
      return;
    }
    case "diamond":
      context.moveTo(0, -radius);
      context.lineTo(radius * 0.82, 0);
      context.lineTo(0, radius);
      context.lineTo(-radius * 0.82, 0);
      context.closePath();
      return;
    case "star":
      traceStar(context, radius);
      return;
    case "hexagon":
      traceRegularPolygon(context, 6, radius);
      return;
    case "ring":
      context.arc(0, 0, radius * 0.84, 0, TAU);
      return;
    case "pen":
      tracePenStroke(context, shape, radius);
      return;
  }
}

function isStrokeShape(shape: CanvasShape): boolean {
  return shape.kind === "line" || shape.kind === "ring" || shape.kind === "pen";
}

function shapeStrokeWidth(shape: CanvasShape, radius: number): number {
  if (shape.kind === "line") return Math.max(7, radius * 0.34);
  if (shape.kind === "ring") return Math.max(6, radius * 0.24);
  if (shape.kind === "pen") return Math.max(5, radius * 0.17);
  return Math.max(2, radius * 0.08);
}

function drawPattern(
  context: CanvasRenderingContext2D,
  node: VisualNode,
  theme: WorldTheme,
): void {
  const pattern = textHash(node.shape.patternId || node.shape.id) % 3;
  const radius = node.radius;
  context.save();
  context.globalAlpha *= 0.27;
  context.strokeStyle = theme.ink;
  context.fillStyle = theme.ink;
  context.lineWidth = Math.max(1.5, radius * 0.055);

  if (isStrokeShape(node.shape)) {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(1.5, shapeStrokeWidth(node.shape, radius) * 0.16);
    if (pattern === 0) context.setLineDash([radius * 0.2, radius * 0.12]);
    if (pattern === 1) context.setLineDash([radius * 0.035, radius * 0.13]);
    drawShapePath(context, node.shape, radius * 0.92);
    context.stroke();
    context.restore();
    return;
  }

  drawShapePath(context, node.shape, radius);
  context.clip();
  if (pattern === 0) {
    for (let offset = -radius * 2; offset <= radius * 2; offset += Math.max(8, radius * 0.36)) {
      context.beginPath();
      context.moveTo(offset - radius, radius);
      context.lineTo(offset + radius, -radius);
      context.stroke();
    }
  } else if (pattern === 1) {
    const dotRadius = Math.max(1.5, radius * 0.06);
    for (let y = -radius * 0.6; y <= radius * 0.6; y += radius * 0.38) {
      for (let x = -radius * 0.6; x <= radius * 0.6; x += radius * 0.38) {
        context.beginPath();
        context.arc(x, y, dotRadius, 0, TAU);
        context.fill();
      }
    }
  } else {
    drawShapePath(context, node.shape, radius * 0.43);
    context.stroke();
  }
  context.restore();
}

function drawNode(
  context: CanvasRenderingContext2D,
  node: VisualNode,
  theme: WorldTheme,
  lowPower: boolean,
): void {
  if (node.opacity <= 0.004 || node.scale <= 0.004) return;

  context.save();
  context.translate(node.x, node.y);
  context.rotate(node.rotation);
  context.scale(node.scale, node.scale);
  context.globalAlpha = node.opacity;

  if (!lowPower && node.eventIntensity > 0.04) {
    context.save();
    context.globalAlpha *= node.eventIntensity * 0.2;
    context.strokeStyle = resolveShapeColor(node.shape, theme);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = isStrokeShape(node.shape)
      ? shapeStrokeWidth(node.shape, node.radius) * 1.28
      : Math.max(2, node.radius * 0.09);
    drawShapePath(context, node.shape, node.radius * (1.18 + node.eventIntensity * 0.18));
    context.stroke();
    context.restore();
  }

  const color = resolveShapeColor(node.shape, theme);
  context.fillStyle = color;
  context.strokeStyle = color;
  if (!lowPower && !node.clone) {
    context.shadowColor = color;
    context.shadowBlur = node.radius * (0.08 + node.eventIntensity * 0.12);
  }

  drawShapePath(context, node.shape, node.radius);
  if (isStrokeShape(node.shape)) {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = shapeStrokeWidth(node.shape, node.radius);
    context.stroke();
  } else {
    context.fill();
  }
  context.shadowBlur = 0;

  if (!node.clone && !lowPower) drawPattern(context, node, theme);
  context.restore();
}

function drawMoodBackdrop(
  context: CanvasRenderingContext2D,
  input: VisualFrameInput,
  seconds: number,
  beatEnergy: number,
): void {
  const { width, height, theme, reducedMotion, lowPower } = input;
  const shortest = Math.min(width, height);
  const gain = continuousSectionValue(input, SECTION_MOTION_GAIN);
  const climaxWeight = continuousSectionValue(input, SECTION_CLIMAX_WEIGHT);
  const motion = reducedMotion ? 0.12 : 1;
  const mood = animationMood(input);

  if (mood === "float") {
    const ribbonCount = lowPower ? 1 : 4;
    for (let ribbon = 0; ribbon < ribbonCount; ribbon += 1) {
      const phase = ribbon * 1.71 + seconds * (0.19 + ribbon * 0.025) * motion;
      const baseY = height * (0.22 + ribbon * (0.56 / Math.max(1, ribbonCount - 1)));
      const wave = shortest * (0.07 + gain * 0.035);
      const drift = Math.sin(phase) * wave * motion;

      context.save();
      context.strokeStyle = ribbon % 2 === 0 ? theme.accent : theme.circle;
      const visibility = ribbon < 3 || lowPower ? 1 : climaxWeight;
      context.globalAlpha =
        (0.072 + climaxWeight * 0.033 + beatEnergy * 0.022) * visibility;
      context.lineWidth = shortest * (0.012 + ribbon * 0.003);
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(-width * 0.08, baseY + drift);
      context.bezierCurveTo(
        width * 0.16,
        baseY - wave + drift,
        width * 0.34,
        baseY + wave - drift * 0.4,
        width * 0.52,
        baseY - drift * 0.25,
      );
      context.bezierCurveTo(
        width * 0.7,
        baseY - wave - drift * 0.35,
        width * 0.86,
        baseY + wave + drift * 0.25,
        width * 1.08,
        baseY - drift,
      );
      context.stroke();
      context.restore();
    }
    return;
  }

  if (mood === "pop") {
    const dotCount = lowPower ? 5 : 14;
    const colors = [theme.accent, theme.circle, theme.triangle, theme.line];
    context.save();
    for (let dot = 0; dot < dotCount; dot += 1) {
      const key = `pop-backdrop:${dot}`;
      const phase = hashUnit(key) * TAU;
      const baseX = width * (0.08 + hashUnit(`${key}:x`) * 0.84);
      const baseY = height * (0.1 + hashUnit(`${key}:y`) * 0.8);
      const pulse = (Math.sin(seconds * (1.3 + (dot % 3) * 0.24) + phase) + 1) / 2;
      const travel = shortest * (0.025 + gain * 0.018) * motion;
      const radius = shortest * (0.009 + hashUnit(`${key}:radius`) * 0.018) * (0.78 + pulse * 0.5);
      context.fillStyle = colors[dot % colors.length];
      const visibility = dot < 9 || lowPower ? 1 : climaxWeight;
      context.globalAlpha =
        (0.08 + pulse * 0.055 + beatEnergy * 0.018) * visibility;
      context.beginPath();
      context.arc(
        baseX + Math.sin(seconds * 1.1 + phase) * travel,
        baseY + Math.cos(seconds * 1.7 + phase) * travel,
        radius,
        0,
        TAU,
      );
      context.fill();
    }
    context.restore();

    if (!lowPower && climaxWeight > 0) {
      context.save();
      context.translate(width / 2, height / 2);
      context.rotate(seconds * 0.16 * motion);
      context.strokeStyle = theme.accent;
      context.globalAlpha = (0.1 + beatEnergy * 0.025) * climaxWeight;
      context.lineWidth = Math.max(2, shortest * 0.004);
      context.lineCap = "round";
      for (let ray = 0; ray < 10; ray += 1) {
        const angle = (ray / 10) * TAU;
        context.beginPath();
        context.moveTo(Math.cos(angle) * shortest * 0.28, Math.sin(angle) * shortest * 0.28);
        context.lineTo(Math.cos(angle) * shortest * 0.43, Math.sin(angle) * shortest * 0.43);
        context.stroke();
      }
      context.restore();
    }
    return;
  }

  const starCount = lowPower ? 10 : 28;
  const centerX = width / 2;
  const centerY = height / 2;
  context.save();
  for (let star = 0; star < starCount; star += 1) {
    const key = `cosmic-backdrop:${star}`;
    const phase = hashUnit(key) * TAU;
    const orbit = shortest * (0.13 + hashUnit(`${key}:orbit`) * 0.48);
    const depth = (Math.sin(seconds * 0.45 + phase) + 1) / 2;
    const angle = phase + seconds * (0.035 + (star % 4) * 0.012) * motion;
    const ellipse = 0.56 + hashUnit(`${key}:ellipse`) * 0.28;
    const radius = (1.2 + hashUnit(`${key}:size`) * 2.6) * (0.68 + depth * 0.72);
    context.fillStyle = star % 3 === 0 ? theme.accent : theme.ink;
    const visibility = star < 20 || lowPower ? 1 : climaxWeight;
    context.globalAlpha = (0.12 + depth * 0.16) * visibility;
    context.beginPath();
    context.arc(
      centerX + Math.cos(angle) * orbit,
      centerY + Math.sin(angle) * orbit * ellipse,
      radius,
      0,
      TAU,
    );
    context.fill();
  }
  context.restore();

  context.save();
  context.translate(centerX, centerY);
  context.rotate(seconds * 0.055 * motion);
  context.strokeStyle = theme.accent;
  context.lineWidth = Math.max(1.5, shortest * 0.003);
  const orbitCount = lowPower ? 2 : 5;
  for (let orbit = 0; orbit < orbitCount; orbit += 1) {
    const visibility = orbit < 4 || lowPower ? 1 : climaxWeight;
    context.globalAlpha = (0.105 + climaxWeight * 0.065) * visibility;
    context.beginPath();
    context.ellipse(
      0,
      0,
      shortest * (0.16 + orbit * 0.08),
      shortest * (0.07 + orbit * 0.048),
      orbit * 0.34,
      orbit * 0.22,
      orbit * 0.22 + Math.PI * (1.18 + (orbit % 2) * 0.28),
    );
    context.stroke();
  }
  context.restore();
}

function drawBackground(
  context: CanvasRenderingContext2D,
  input: VisualFrameInput,
  activeEvents: readonly ActiveVisualEvent[],
): void {
  const { width, height, theme, interaction, reducedMotion, lowPower } = input;
  const shortest = Math.min(width, height);
  const seconds = safeBeat(input.beat) * SECONDS_PER_BEAT;
  const beatEnergy = activeEvents.reduce(
    (highest, active) => Math.max(highest, active.intensity),
    0,
  );

  context.fillStyle = theme.background;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = continuousSectionValue(input, SECTION_SURFACE_ALPHA);
  context.fillStyle = theme.surface;
  const baseRadius = shortest * continuousSectionValue(input, SECTION_SURFACE_RADIUS);
  context.beginPath();
  context.arc(
    width / 2,
    height / 2,
    baseRadius * (1 + beatEnergy * (reducedMotion ? 0.015 : 0.045)),
    0,
    TAU,
  );
  context.fill();
  context.restore();

  drawMoodBackdrop(context, input, seconds, beatEnergy);

  const ringWeight = continuousSectionValue(input, SECTION_RING_WEIGHT);
  const climaxWeight = continuousSectionValue(input, SECTION_CLIMAX_WEIGHT);
  if (!lowPower && ringWeight > 0) {
    context.save();
    context.strokeStyle = theme.accent;
    context.lineWidth = Math.max(1.5, shortest * 0.003);
    const ringCount = 3;
    for (let ring = 0; ring < ringCount; ring += 1) {
      const visibility = ring < 2 ? ringWeight : climaxWeight;
      context.globalAlpha = (0.1 + climaxWeight * 0.06) * visibility;
      const drift = reducedMotion ? 0 : Math.sin(seconds * 0.16 + ring) * shortest * 0.01;
      context.beginPath();
      context.ellipse(
        width / 2,
        height / 2,
        shortest * (0.22 + ring * 0.1) + drift,
        shortest * (0.15 + ring * 0.075) + drift,
        ring * 0.18,
        0,
        TAU,
      );
      context.stroke();
    }
    context.restore();
  }

  if (interaction && interaction.strength > 0.01) {
    context.save();
    context.strokeStyle = theme.accent;
    context.globalAlpha = interaction.strength * 0.22;
    context.lineWidth = Math.max(2, shortest * 0.006);
    context.beginPath();
    context.arc(
      clamp(interaction.x) * width,
      clamp(interaction.y) * height,
      shortest * (0.045 + interaction.strength * 0.035),
      0,
      TAU,
    );
    context.stroke();
    context.restore();
  }
}

/** Draws one complete frame in CSS-pixel coordinates on a high-DPI canvas. */
export function drawPerformanceFrame(
  context: CanvasRenderingContext2D,
  input: VisualFrameInput,
  transformNodes?: VisualNodeTransformer,
): void {
  const derivedSection = sectionAtBeat(input.beat);
  const frameInput = input.section === derivedSection
    ? input
    : { ...input, section: derivedSection };
  const width = Math.max(1, frameInput.width);
  const height = Math.max(1, frameInput.height);
  const dpr = clamp(frameInput.dpr ?? 1, 1, 3);
  const activeEvents = collectActiveVisualEvents(frameInput.events, frameInput.beat);

  context.save();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  drawBackground(context, frameInput, activeEvents);

  const targetNodes = buildVisualNodes(frameInput);
  const nodes = transformNodes ? transformNodes(targetNodes) : targetNodes;
  for (const node of nodes) {
    drawNode(context, node, frameInput.theme, Boolean(frameInput.lowPower));
  }
  context.restore();
}
