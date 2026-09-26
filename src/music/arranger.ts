import { applySoundPrograms, copySoundPrograms, type SceneSoundPrograms } from "./soundProgram";
import {
  BARS,
  BPM,
  TOTAL_BEATS,
  type CanvasShape,
  type InstrumentId,
  type MusicEvent,
  type OtoProject,
  type SectionId,
  type VisualEventKind,
  type WorldId,
} from "../types/project";
import { hashString, mixSeed, randomFrom, createPrng } from "./prng";
import { WORLD_TONICS, transposePentatonic } from "./scales";
import { BEATS_PER_STEP, STEPS_PER_BAR, shapesToMotif, type MotifEvent } from "./shapeMapper";
import {
  buildRelationshipEvents,
  sceneForBeat,
  shapesForScene,
  normalizeSceneCount,
} from "./creativeRules";
import { getSectionAtBar, getSectionDefinition } from "./sections";
import { buildInstrumentPhrases, voiceBudgetEnd } from "./instrumentPhrases";

export { getSectionAtBeat } from "./sections";

export const MAX_SIMULTANEOUS_EVENTS = 8 as const;

export interface BarVariation {
  rotateSteps: number;
  transposeDegrees: number;
  thinProbability: number;
  doubleImportant: boolean;
  dropoutInstruments: readonly InstrumentId[];
}

export interface CreateProjectOptions {
  sceneSoundPrograms?: SceneSoundPrograms;
  scenePrograms?: OtoProject["scenePrograms"];
  sceneCount?: number;
  sceneMoods?: OtoProject["sceneMoods"];
  id?: string;
  title?: string;
  timestamp?: number;
}

const INSTRUMENT_PRIORITY: Readonly<Record<InstrumentId, number>> = {
  drum: 0,
  percussion: 0,
  bass: 1,
  piano: 2,
  marimba: 3,
  kalimba: 4,
  harp: 5,
  glockenspiel: 6,
  bell: 6,
  chime: 7,
  flute: 8,
  pad: 8,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rotateStep(step: number, amount: number): number {
  return ((Math.trunc(step + amount) % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
}

/** One deterministic variation plan for a single bar. */
export function getVariationForBar(
  bar: number,
  seed: number,
  worldId: WorldId,
): BarVariation {
  const safeBar = clamp(Math.trunc(bar), 0, BARS - 1);
  const section = getSectionAtBar(safeBar);
  const sectionDefinition = getSectionDefinition(section);
  const sectionBar = safeBar - sectionDefinition.startBar;
  const isSectionEnding = safeBar === sectionDefinition.endBar - 1;
  const random = createPrng(mixSeed(seed, worldId, safeBar, section));

  switch (section) {
    case "intro":
      return {
        rotateSteps: 0,
        transposeDegrees: 0,
        thinProbability: 0,
        doubleImportant: false,
        dropoutInstruments: [],
      };
    case "a":
      return {
        rotateSteps: isSectionEnding ? random.pick([-1, 1]) : 0,
        transposeDegrees: isSectionEnding ? random.pick([0, 1]) : 0,
        thinProbability: isSectionEnding ? 0.08 : 0,
        doubleImportant: false,
        dropoutInstruments: [],
      };
    case "b":
      return {
        rotateSteps: random.pick(sectionBar === 0 ? [2, 4] : [4, 6, 8]),
        transposeDegrees: random.pick([-2, -1, 2, 3]),
        thinProbability: isSectionEnding ? random.pick([0.08, 0.12, 0.16]) : 0.06,
        doubleImportant: false,
        dropoutInstruments: isSectionEnding ? ["chime", "flute", "pad"] : [],
      };
    case "break":
      return {
        rotateSteps: random.pick([0, 4]),
        transposeDegrees: random.pick([-2, -1, 0]),
        thinProbability: isSectionEnding ? 0.62 : 0.48,
        doubleImportant: false,
        dropoutInstruments: isSectionEnding
          ? ["drum", "percussion", "bass"]
          : ["drum", "percussion"],
      };
    case "climax":
      return {
        rotateSteps: random.pick(isSectionEnding ? [2, 4] : [0, 2]),
        transposeDegrees: random.pick([0, 1, 2, 3]),
        thinProbability: isSectionEnding ? 0.04 : 0,
        doubleImportant: true,
        dropoutInstruments: [],
      };
    case "outro":
      return {
        rotateSteps: isSectionEnding ? 2 : 0,
        transposeDegrees: isSectionEnding ? -1 : 0,
        thinProbability: isSectionEnding ? 0.48 : 0.15,
        doubleImportant: false,
        dropoutInstruments: isSectionEnding ? ["percussion"] : [],
      };
  }
}

function featuredMotifIndex(motif: readonly MotifEvent[], seed: number): number {
  if (motif.length === 0) return -1;
  const melodic = motif
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.instrumentId === "bell");
  const candidates = melodic.length > 0 ? melodic : motif.map((event, index) => ({ event, index }));
  return candidates[Math.floor(randomFrom(seed, "featured") * candidates.length)]?.index ?? 0;
}

/** Implements Intro reveal and Outro dropout without mutating the motif. */
function activeMotifsForBar(
  motif: readonly MotifEvent[],
  bar: number,
  seed: number,
): readonly MotifEvent[] {
  if (motif.length <= 1) return motif;
  const section = getSectionAtBar(bar);

  if (section === "intro") {
    const definition = getSectionDefinition(section);
    const sectionLength = Math.max(1, definition.endBar - definition.startBar);
    const sectionBar = bar - definition.startBar;
    const count = clamp(
      Math.ceil(((sectionBar + 1) / sectionLength) * motif.length),
      1,
      motif.length,
    );
    return motif.slice(0, count);
  }

  if (section === "outro") {
    const definition = getSectionDefinition(section);
    const sectionLength = Math.max(1, definition.endBar - definition.startBar);
    const sectionBar = bar - definition.startBar;
    const featuredIndex = featuredMotifIndex(motif, seed);
    const featured = motif[featuredIndex] as MotifEvent;
    const others = motif.filter((_, index) => index !== featuredIndex);
    const progressRemaining = sectionLength === 1
      ? 0
      : 1 - sectionBar / (sectionLength - 1);
    const count = clamp(
      Math.ceil(1 + (motif.length - 1) * progressRemaining),
      1,
      motif.length,
    );
    return [featured, ...others].slice(0, count);
  }

  return motif;
}

function shouldThinEvent(
  motifEvent: MotifEvent,
  variation: BarVariation,
  bar: number,
  seed: number,
): boolean {
  return randomFrom(seed, bar, motifEvent.shapeId, motifEvent.shapeOrder, "thin") <
    variation.thinProbability;
}

function transformedVisual(
  base: VisualEventKind,
  section: SectionId,
  doubled: boolean,
): VisualEventKind {
  if (section === "outro") return "fade";
  if (doubled) return "orbit";
  if (section === "climax" && base === "pulse") return "split";
  return base;
}

function stableEventId(
  motifEvent: MotifEvent,
  bar: number,
  step: number,
  variant: "main" | "double",
): string {
  const hash = hashString(
    `${motifEvent.shapeId}|${motifEvent.shapeOrder}|${bar}|${step}|${variant}`,
  );
  return `event-${bar.toString(36)}-${step.toString(36)}-${hash.toString(36)}-${variant}`;
}

function createEvent(
  motifEvent: MotifEvent,
  bar: number,
  variation: BarVariation,
  worldId: WorldId,
  variant: "main" | "double",
): MusicEvent | undefined {
  const section = getSectionAtBar(bar);
  const step = rotateStep(motifEvent.step, variation.rotateSteps);
  const beat = bar * 4 + step * BEATS_PER_STEP;
  // Keep voices inside their source bar. Besides making each two-bar section
  // articulate cleanly, this guarantees a fresh polyphony budget every bar.
  const durationBeats = Math.min(
    motifEvent.durationBeats,
    (bar + 1) * 4 - beat,
    TOTAL_BEATS - beat,
  );
  if (durationBeats <= 0) return undefined;

  let midiNote = motifEvent.midiNote;
  if (midiNote !== undefined) {
    midiNote = transposePentatonic(
      midiNote,
      variation.transposeDegrees,
      WORLD_TONICS[worldId],
    );
    if (variant === "double") {
      // Five pentatonic degrees equal one octave, while retaining the scale at
      // the safe-register boundary.
      midiNote = transposePentatonic(midiNote, 5, WORLD_TONICS[worldId]);
    }
  }

  const event: MusicEvent = {
    id: stableEventId(motifEvent, bar, step, variant),
    shapeId: motifEvent.shapeId,
    beat,
    durationBeats,
    velocity: clamp(
      motifEvent.velocity + (section === "climax" ? 0.08 : 0) - (variant === "double" ? 0.12 : 0),
      0.2,
      0.96,
    ),
    instrumentId: motifEvent.instrumentId,
    section,
    visualEvent: transformedVisual(motifEvent.visualEvent, section, variant === "double"),
  };

  if (midiNote !== undefined) event.midiNote = midiNote;
  return event;
}

function compareEvents(left: MusicEvent, right: MusicEvent): number {
  if (left.beat !== right.beat) return left.beat - right.beat;
  const instrumentDifference =
    INSTRUMENT_PRIORITY[left.instrumentId] - INSTRUMENT_PRIORITY[right.instrumentId];
  if (instrumentDifference !== 0) return instrumentDifference;
  const noteDifference = (left.midiNote ?? -1) - (right.midiNote ?? -1);
  if (noteDifference !== 0) return noteDifference;
  const shapeDifference = left.shapeId.localeCompare(right.shapeId);
  return shapeDifference !== 0 ? shapeDifference : left.id.localeCompare(right.id);
}

/** 全楽器のフレーズを先に確保し、残りの枠へ元の図形音・コンボを加える。 */
function limitPolyphony(events: readonly MusicEvent[]): MusicEvent[] {
  const ordered = [...events].sort((left, right) =>
    Number(right.id.startsWith("part-")) - Number(left.id.startsWith("part-")) || compareEvents(left, right));
  const accepted: MusicEvent[] = [];
  for (const event of ordered) {
    const end = voiceBudgetEnd(event);
    const overlaps = accepted.filter((other) => other.beat < end && voiceBudgetEnd(other) > event.beat);
    const checkpoints = [event.beat, ...overlaps.map((other) => other.beat).filter((beat) => beat > event.beat)];
    const fits = checkpoints.every((beat) => overlaps.filter((other) =>
      other.beat <= beat && voiceBudgetEnd(other) > beat).length < MAX_SIMULTANEOUS_EVENTS);
    if (fits) accepted.push(event);
  }
  return accepted.sort(compareEvents);
}

/** 通常は全楽器の曲を編曲し、音プログラムを指定した場面だけ固定音階・指定順へ置き換える。 */
export function buildArrangement(
  shapes: readonly CanvasShape[],
  seed: number,
  worldId: WorldId,
  sceneCount?: number,
  sceneSoundPrograms?: SceneSoundPrograms,
): MusicEvent[] {
  // 小節途中に場面境界が来る場合も、発音先と映像の場面を一致させる。
  if (sceneCount !== undefined) {
    const count = normalizeSceneCount(sceneCount);
    const sceneEvents: MusicEvent[] = [];
    for (let scene = 0; scene < count; scene += 1) {
      const start = scene * TOTAL_BEATS / count;
      const end = (scene + 1) * TOTAL_BEATS / count;
      const picture = shapesForScene(shapes, scene as import("../types/project").SceneIndex, count)
        .map(({ scene: _scene, ...shape }) => shape);
      const notes = buildArrangement(picture, seed, worldId)
        .filter((event) => event.beat >= start && event.beat < end)
        .map((event) => ({ ...event, id: `${event.id}-scene-${scene}`, durationBeats: Math.min(event.durationBeats, end - event.beat) }));
      sceneEvents.push(...notes);
    }
    return applySoundPrograms(limitPolyphony(sceneEvents), shapes, worldId, count, sceneSoundPrograms);
  }
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  if (shapes.length === 0) return [];
  const usesScenes = shapes.some((shape) => shape.scene !== undefined);
  const legacyMotif = usesScenes ? [] : shapesToMotif(shapes, worldId);

  const candidates: MusicEvent[] = [];

  for (let bar = 0; bar < BARS; bar += 1) {
    const sceneShapes = usesScenes
      ? shapesForScene(shapes, sceneForBeat(bar * 4))
      : [...shapes];
    const motif = usesScenes ? shapesToMotif(sceneShapes, worldId) : legacyMotif;
    if (motif.length === 0) continue;
    const variation = getVariationForBar(bar, safeSeed, worldId);
    const activeMotif = activeMotifsForBar(motif, bar, safeSeed);
    const candidateCountAtBarStart = candidates.length;

    for (const motifEvent of activeMotif) {
      if (variation.dropoutInstruments.includes(motifEvent.instrumentId)) continue;
      if (shouldThinEvent(motifEvent, variation, bar, safeSeed)) continue;

      const main = createEvent(motifEvent, bar, variation, worldId, "main");
      if (main) candidates.push(main);

      const canDouble = variation.doubleImportant &&
        motifEvent.midiNote !== undefined &&
        (motifEvent.instrumentId === "bell" || motifEvent.instrumentId === "bass") &&
        randomFrom(safeSeed, worldId, bar, motifEvent.shapeId, "double") < 0.42;
      if (canDouble) {
        const doubled = createEvent(motifEvent, bar, variation, worldId, "double");
        if (doubled) candidates.push(doubled);
      }
    }

    // Variation may reduce a sparse drawing to silence. Keep one quiet anchor
    // so a non-empty canvas still spans every bar of the short film.
    if (candidates.length === candidateCountAtBarStart && activeMotif[0]) {
      const anchor = createEvent(activeMotif[0], bar, variation, worldId, "main");
      if (anchor) candidates.push({ ...anchor, velocity: Math.min(anchor.velocity, 0.58) });
    }

    const barEvents = candidates.slice(candidateCountAtBarStart);
    candidates.push(...buildRelationshipEvents(sceneShapes, barEvents, bar, worldId));
    candidates.push(...buildInstrumentPhrases(motif, bar, safeSeed, worldId));
  }

  return limitPolyphony(candidates).map((event) => ({ ...event, soundWorld: worldId }));
}

function stableProjectId(
  shapes: readonly CanvasShape[],
  seed: number,
  worldId: WorldId,
): string {
  const signature = shapes
    .map((shape) => `${shape.id}:${shape.kind}:${shape.position.x}:${shape.position.y}:${shape.size}`)
    .join("|");
  return `oto-${hashString(`${seed}|${worldId}|${signature}`).toString(36)}`;
}

/** 図形と場面ごとの動き・音の命令を保存し、同じ設定から演奏イベントを再生成する。 */
export function createProject(
  shapes: readonly CanvasShape[],
  seed: number,
  worldId: WorldId,
  options: CreateProjectOptions = {},
): OtoProject {
  const timestamp = options.timestamp ?? Date.now();
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  const project: OtoProject = {
    version: 1,
    id: options.id ?? stableProjectId(shapes, safeSeed, worldId),
    createdAt: timestamp,
    updatedAt: timestamp,
    seed: safeSeed,
    worldId,
    bpm: BPM,
    bars: BARS,
    shapes: shapes.map((shape) => ({
      ...shape,
      position: { ...shape.position },
    })),
    sceneCount: normalizeSceneCount(options.sceneCount),
    sceneMoods: options.sceneMoods?.slice(0, 10),
    scenePrograms: options.scenePrograms?.map((program) => program ? { moves: [...program.moves], repeat: program.repeat } : null),
    sceneSoundPrograms: copySoundPrograms(options.sceneSoundPrograms),
    events: buildArrangement(shapes, safeSeed, worldId, normalizeSceneCount(options.sceneCount), options.sceneSoundPrograms),
  };

  if (options.title !== undefined) project.title = options.title;
  return project;
}
