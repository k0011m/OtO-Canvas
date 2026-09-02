import { describe, expect, it } from "vitest";
import { buildArrangement, getSectionAtBeat } from "../src/music/arranger";
import { SECTION_DEFINITIONS } from "../src/music/sections";
import {
  BARS,
  BPM,
  DURATION_SECONDS,
  TOTAL_BEATS,
  type CanvasShape,
  type MusicEvent,
  type ShapeKind,
  type WorldId,
} from "../src/types/project";

const MAJOR_PENTATONIC_PITCH_CLASSES = new Set([0, 2, 4, 7, 9]);
const WORLD_TONICS: Readonly<Record<WorldId, number>> = {
  soft: 60,
  bounce: 62,
  space: 57,
};
const ALL_SHAPE_KINDS = [
  "circle",
  "triangle",
  "line",
  "square",
  "diamond",
  "star",
  "hexagon",
  "ring",
  "pen",
] as const satisfies readonly ShapeKind[];

const TEST_SHAPES: readonly CanvasShape[] = [
  {
    id: "circle-high",
    kind: "circle",
    position: { x: 0.04, y: 0.12 },
    size: 0.16,
    rotation: 0,
    colorId: "circle",
    patternId: "circle-1",
    zIndex: 0,
  },
  {
    id: "triangle-mid",
    kind: "triangle",
    position: { x: 0.28, y: 0.48 },
    size: 0.2,
    rotation: 0.25,
    colorId: "triangle",
    patternId: "triangle-2",
    zIndex: 1,
  },
  {
    id: "line-bass",
    kind: "line",
    position: { x: 0.57, y: 0.82 },
    size: 0.28,
    rotation: 0.5,
    colorId: "line",
    patternId: "line-thick",
    zIndex: 2,
  },
  {
    id: "line-pad",
    kind: "line",
    position: { x: 0.91, y: 0.34 },
    size: 0.14,
    rotation: 1,
    colorId: "line",
    patternId: "line-thin-pad",
    zIndex: 3,
  },
  {
    id: "square-bass",
    kind: "square",
    position: { x: 0.16, y: 0.72 },
    size: 0.22,
    rotation: 0.1,
    colorId: "ocean",
    patternId: "square-1",
    zIndex: 4,
  },
  {
    id: "diamond-bell",
    kind: "diamond",
    position: { x: 0.37, y: 0.3 },
    size: 0.18,
    rotation: 0.2,
    colorId: "violet",
    patternId: "diamond-1",
    zIndex: 5,
  },
  {
    id: "star-bell",
    kind: "star",
    position: { x: 0.48, y: 0.18 },
    size: 0.17,
    rotation: 0.3,
    colorId: "sun",
    patternId: "star-1",
    zIndex: 6,
  },
  {
    id: "hex-percussion",
    kind: "hexagon",
    position: { x: 0.68, y: 0.56 },
    size: 0.2,
    rotation: 0.4,
    colorId: "mint",
    patternId: "hexagon-1",
    zIndex: 7,
  },
  {
    id: "ring-pad",
    kind: "ring",
    position: { x: 0.79, y: 0.42 },
    size: 0.19,
    rotation: 0.5,
    colorId: "rose",
    patternId: "ring-1",
    zIndex: 8,
  },
  {
    id: "pen-pad",
    kind: "pen",
    position: { x: 0.97, y: 0.65 },
    size: 0.12,
    rotation: 0,
    colorId: "ink",
    patternId: "pen-1",
    zIndex: 9,
    points: [
      { x: -0.1, y: -0.05 },
      { x: 0, y: 0.08 },
      { x: 0.12, y: -0.02 },
    ],
  },
];

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function expectEventsInTimeline(events: readonly MusicEvent[]): void {
  for (const event of events) {
    expect(event.beat).toBeGreaterThanOrEqual(0);
    expect(event.beat).toBeLessThan(TOTAL_BEATS);
    expect(event.durationBeats).toBeGreaterThan(0);
    expect(event.beat + event.durationBeats).toBeLessThanOrEqual(TOTAL_BEATS);
    expect(event.section).toBe(getSectionAtBeat(event.beat));
  }
}

describe("fixed composition timeline", () => {
  it("is exactly 12 bars, 48 beats, and 30 seconds", () => {
    expect(BPM).toBe(96);
    expect(BARS).toBe(12);
    expect(TOTAL_BEATS).toBe(48);
    expect(DURATION_SECONDS).toBe(30);
    expect((TOTAL_BEATS * 60) / BPM).toBe(DURATION_SECONDS);
  });

  it("gives each of the six story sections exactly two bars", () => {
    expect(SECTION_DEFINITIONS).toHaveLength(6);
    for (const [index, section] of SECTION_DEFINITIONS.entries()) {
      expect(section.startBar).toBe(index * 2);
      expect(section.endBar).toBe(index * 2 + 2);
      expect(section.startBeat).toBe(index * 8);
      expect(section.endBeat).toBe(index * 8 + 8);
    }
  });

  it.each([
    [-1, "intro"],
    [0, "intro"],
    [7.999, "intro"],
    [8, "a"],
    [15.999, "a"],
    [16, "b"],
    [23.999, "b"],
    [24, "break"],
    [31.999, "break"],
    [32, "climax"],
    [39.999, "climax"],
    [40, "outro"],
    [47.999, "outro"],
    [48, "outro"],
    [999, "outro"],
  ] as const)("maps beat %s to %s", (beat, expectedSection) => {
    expect(getSectionAtBeat(beat)).toBe(expectedSection);
  });
});

describe("buildArrangement", () => {
  it("returns byte-for-byte equivalent event data for the same input", () => {
    const shapesBefore = structuredClone(TEST_SHAPES);
    const first = buildArrangement(TEST_SHAPES, 20260830, "soft");
    const second = buildArrangement(TEST_SHAPES, 20260830, "soft");

    expect(first).toEqual(second);
    expect(TEST_SHAPES).toEqual(shapesBefore);
    expect(first.length).toBeGreaterThan(0);
  });

  it("keeps non-empty drawings active across all 12 bars and inside 48 beats", () => {
    const events = buildArrangement(TEST_SHAPES, 42, "bounce");
    const activeBars = new Set(events.map((event) => Math.floor(event.beat / 4)));

    expect(activeBars).toEqual(new Set(Array.from({ length: BARS }, (_, bar) => bar)));
    expectEventsInTimeline(events);
  });

  it.each(ALL_SHAPE_KINDS)(
    "keeps a single %s active in every bar",
    (kind) => {
      const shape: CanvasShape = {
        id: `single-${kind}`,
        kind,
        position: { x: 0.97, y: 0.5 },
        size: 0.2,
        rotation: 0,
        colorId: "sun",
        patternId: `${kind}-1`,
        zIndex: 0,
      };
      const events = buildArrangement([shape], 24680, "soft");
      const activeBars = new Set(events.map((event) => Math.floor(event.beat / 4)));

      expect(activeBars).toEqual(new Set(Array.from({ length: BARS }, (_, bar) => bar)));
      expectEventsInTimeline(events);
    },
  );

  it("keeps one recognizable instrument identity per drawing tool", () => {
    const expected = {
      circle: "marimba",
      triangle: "drum",
      line: "bass",
      square: "piano",
      diamond: "harp",
      star: "glockenspiel",
      hexagon: "kalimba",
      ring: "chime",
      pen: "flute",
    } as const;

    for (const kind of ALL_SHAPE_KINDS) {
      const shape: CanvasShape = {
        id: `voice-${kind}`,
        kind,
        position: { x: 0.5, y: 0.5 },
        size: 0.2,
        rotation: 0,
        colorId: "sun",
        patternId: `${kind}-1`,
        zIndex: 0,
      };
      const instruments = new Set(
        buildArrangement([shape], 12345, "soft").map(
          (event) => event.instrumentId,
        ),
      );

      expect(instruments).toEqual(new Set([expected[kind]]));
    }
  });

  it("uses only safe-register notes from the selected pentatonic world", () => {
    for (const worldId of ["soft", "bounce", "space"] as const) {
      const events = buildArrangement(TEST_SHAPES, 987654321, worldId);
      const pitchedEvents = events.filter(
        (event): event is MusicEvent & { midiNote: number } => event.midiNote !== undefined,
      );

      expect(pitchedEvents.length).toBeGreaterThan(0);
      for (const event of pitchedEvents) {
        expect(event.midiNote).toBeGreaterThanOrEqual(24);
        expect(event.midiNote).toBeLessThanOrEqual(96);
        expect(
          MAJOR_PENTATONIC_PITCH_CLASSES.has(
            positiveModulo(event.midiNote - WORLD_TONICS[worldId], 12),
          ),
        ).toBe(true);
      }
    }
  });

  it("never exceeds eight simultaneously sounding events", () => {
    const crowdedDrawing: CanvasShape[] = Array.from({ length: 20 }, (_, index) => ({
      id: `pad-${index}`,
      kind: "line",
      position: { x: 0.5, y: index / 19 },
      size: 0.3,
      rotation: 0,
      colorId: "line",
      patternId: "line-thin-pad",
      zIndex: index,
    }));
    const events = buildArrangement(crowdedDrawing, 13579, "space");
    const onsetBeats = [...new Set(events.map((event) => event.beat))];

    for (const onset of onsetBeats) {
      const sounding = events.filter(
        (event) => event.beat <= onset && event.beat + event.durationBeats > onset,
      );
      expect(sounding.length, `polyphony at beat ${onset}`).toBeLessThanOrEqual(8);
    }
  });

  it("returns no events for an empty canvas", () => {
    expect(buildArrangement([], 123, "soft")).toEqual([]);
  });
});
