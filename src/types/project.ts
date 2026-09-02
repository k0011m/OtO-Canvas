export type StampShapeKind =
  | "circle"
  | "triangle"
  | "line"
  | "square"
  | "diamond"
  | "star"
  | "hexagon"
  | "ring";
export type ShapeKind = StampShapeKind | "pen";
export type ShapeColorId =
  | "sun"
  | "coral"
  | "ocean"
  | "violet"
  | "mint"
  | "rose"
  | "lime"
  | "ink";
export type WorldId = "soft" | "bounce" | "space";
export type SceneIndex = 0 | 1 | 2;
export type SectionId = "intro" | "a" | "b" | "break" | "climax" | "outro";
export type VisualEventKind = "pulse" | "orbit" | "wave" | "split" | "fade";
/**
 * Musical voices used by the arranger and audio engine.
 *
 * `bell`, `percussion`, and `pad` remain valid so projects created by the
 * earlier four-voice build can still be loaded and played.
 */
export type InstrumentId =
  | "bell"
  | "percussion"
  | "pad"
  | "bass"
  | "marimba"
  | "drum"
  | "piano"
  | "harp"
  | "glockenspiel"
  | "kalimba"
  | "chime"
  | "flute";

export interface Point {
  x: number;
  y: number;
}

export interface CanvasShape {
  id: string;
  kind: ShapeKind;
  position: Point;
  size: number;
  rotation: number;
  colorId: string;
  patternId: string;
  zIndex: number;
  /** Optional for backwards compatibility. New projects use three 10-second scenes. */
  scene?: SceneIndex;
  /** Pen strokes store normalized local points around `position`. */
  points?: Point[];
}

export interface MusicEvent {
  id: string;
  shapeId: string;
  beat: number;
  durationBeats: number;
  midiNote?: number;
  velocity: number;
  instrumentId: InstrumentId;
  section: SectionId;
  visualEvent: VisualEventKind;
}

export interface OtoProject {
  version: 1;
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  seed: number;
  worldId: WorldId;
  bpm: 96;
  bars: 12;
  shapes: CanvasShape[];
  events: MusicEvent[];
}

export interface WorldTheme {
  id: WorldId;
  name: string;
  hint: string;
  background: string;
  surface: string;
  ink: string;
  circle: string;
  triangle: string;
  line: string;
  accent: string;
}

export interface PlaybackSnapshot {
  beat: number;
  progress: number;
  section: SectionId;
  playing: boolean;
}

export const BPM = 96 as const;
export const BARS = 12 as const;
export const TOTAL_BEATS = BARS * 4;
export const DURATION_SECONDS = (TOTAL_BEATS * 60) / BPM;

export const STAMP_SHAPE_KINDS: readonly StampShapeKind[] = [
  "circle",
  "triangle",
  "line",
  "square",
  "diamond",
  "star",
  "hexagon",
  "ring",
] as const;

export const SHAPE_COLOR_PALETTE: ReadonlyArray<{
  id: ShapeColorId;
  name: string;
  value: string;
}> = [
  { id: "sun", name: "きいろ", value: "#f4b942" },
  { id: "coral", name: "あか", value: "#e56b6f" },
  { id: "ocean", name: "あお", value: "#4d96a9" },
  { id: "violet", name: "むらさき", value: "#7868d8" },
  { id: "mint", name: "みどり", value: "#4fae8a" },
  { id: "rose", name: "ももいろ", value: "#df78a4" },
  { id: "lime", name: "きみどり", value: "#8cab4a" },
  { id: "ink", name: "こんいろ", value: "#3d405b" },
] as const;

export function shapeColorValue(colorId: string): string | undefined {
  return SHAPE_COLOR_PALETTE.find((color) => color.id === colorId)?.value;
}

export const WORLDS: Record<WorldId, WorldTheme> = {
  soft: {
    id: "soft",
    name: "ふわり",
    hint: "やさしく ころころ",
    background: "#f7f4ed",
    surface: "#fffdf8",
    ink: "#252525",
    circle: "#f4b942",
    triangle: "#e56b6f",
    line: "#4d96a9",
    accent: "#6c63ff",
  },
  bounce: {
    id: "bounce",
    name: "ぽんぽん",
    hint: "げんきに はずむ",
    background: "#fff4dc",
    surface: "#fffaf0",
    ink: "#29231d",
    circle: "#ff9f1c",
    triangle: "#ff5d73",
    line: "#2ec4b6",
    accent: "#7a5cff",
  },
  space: {
    id: "space",
    name: "きらり",
    hint: "ゆっくり うちゅう",
    background: "#10142c",
    surface: "#191f40",
    ink: "#f7f5ff",
    circle: "#ffd166",
    triangle: "#ef6f9b",
    line: "#58c7e8",
    accent: "#a78bfa",
  },
};
