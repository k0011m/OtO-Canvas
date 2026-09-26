import { describe, expect, it } from "vitest";
import { mapShapeToMotif, quantizeXToStep } from "../src/music/shapeMapper";
import type { CanvasShape, ShapeKind } from "../src/types/project";

function makeShape(
  kind: ShapeKind,
  overrides: Partial<CanvasShape> = {},
): CanvasShape {
  return {
    id: `${kind}-test`,
    kind,
    position: { x: 0.5, y: 0.5 },
    size: 0.2,
    rotation: 0,
    colorId: kind,
    patternId: `${kind}-1`,
    zIndex: 0,
    ...overrides,
  };
}

describe("quantizeXToStep", () => {
  it.each([
    [-10, 0],
    [0, 0],
    [0.5 / 15 - Number.EPSILON, 0],
    [0.5 / 15, 1],
    [0.5, 8],
    [14.49 / 15, 14],
    [14.5 / 15, 15],
    [1, 15],
    [10, 15],
    [Number.NaN, 8],
    [Number.POSITIVE_INFINITY, 8],
  ])("quantizes x=%s to step %s", (x, expected) => {
    expect(quantizeXToStep(x)).toBe(expected);
  });
});

describe("mapShapeToMotif", () => {
  it("maps circles to pitched marimba pulses", () => {
    const high = mapShapeToMotif(
      makeShape("circle", { position: { x: 0.2, y: 0 } }),
      "soft",
      3,
    );
    const low = mapShapeToMotif(
      makeShape("circle", { id: "circle-low", position: { x: 0.2, y: 1 } }),
      "soft",
      4,
    );

    expect(high).toMatchObject({
      shapeId: "circle-test",
      shapeOrder: 3,
      step: 3,
      instrumentId: "marimba",
      visualEvent: "pulse",
    });
    expect(high.midiNote).toBeTypeOf("number");
    expect(low.midiNote).toBeTypeOf("number");
    expect(high.midiNote as number).toBeGreaterThan(low.midiNote as number);
  });

  it("maps triangles to unpitched drum splits", () => {
    const motif = mapShapeToMotif(
      makeShape("triangle", { position: { x: 0.75, y: 0.1 } }),
      "bounce",
    );

    expect(motif).toMatchObject({
      step: 11,
      durationBeats: 0.125,
      instrumentId: "drum",
      visualEvent: "split",
    });
    expect(motif).not.toHaveProperty("midiNote");
  });

  it.each([
    ["circle", "marimba", "pulse", true],
    ["triangle", "drum", "split", false],
    ["line", "bass", "wave", true],
    ["square", "piano", "pulse", true],
    ["diamond", "harp", "wave", true],
    ["star", "glockenspiel", "fade", true],
    ["hexagon", "kalimba", "pulse", true],
    ["ring", "chime", "orbit", true],
    ["pen", "flute", "wave", true],
  ] as const)(
    "maps %s to the %s voice",
    (kind, instrumentId, visualEvent, isPitched) => {
      // Pen intentionally has no points here: even a tap/legacy stroke is musical.
      const motif = mapShapeToMotif(makeShape(kind), "bounce");

      expect(motif.instrumentId).toBe(instrumentId);
      expect(motif.visualEvent).toBe(visualEvent);
      if (isPitched) {
        expect(motif.midiNote).toBeTypeOf("number");
      } else {
        expect(motif).not.toHaveProperty("midiNote");
      }
    },
  );

  it("lets pen stroke length gently extend its flute note", () => {
    const tap = mapShapeToMotif(makeShape("pen", { size: 0.1 }), "space");
    const stroke = mapShapeToMotif(
      makeShape("pen", {
        id: "pen-stroke",
        size: 0.1,
        points: [
          { x: -0.4, y: 0 },
          { x: 0.4, y: 0 },
        ],
      }),
      "space",
    );

    expect(tap.durationBeats).toBeCloseTo(0.8);
    expect(stroke.durationBeats).toBeGreaterThan(tap.durationBeats);
    expect(stroke.durationBeats).toBeLessThanOrEqual(1.7);
  });

  it("maps every line style to the bass voice", () => {
    for (const patternId of ["line-thin", "gentle-pad"] as const) {
      const motif = mapShapeToMotif(
        makeShape("line", { patternId, size: 0.1 }),
        "space",
      );

      expect(motif.instrumentId).toBe("bass");
      expect(motif.visualEvent).toBe("wave");
      expect(motif.durationBeats).toBeCloseTo(0.55);
      expect(motif.midiNote).toBeGreaterThanOrEqual(24);
      expect(motif.midiNote).toBeLessThanOrEqual(96);
    }
  });

  it("maps thick and default-sized lines to the same bass voice", () => {
    for (const shape of [
      makeShape("line", { patternId: "line-thick", size: 0.3 }),
      makeShape("line", { id: "plain-line", patternId: "plain", size: 0.2 }),
    ]) {
      const motif = mapShapeToMotif(shape, "soft");
      expect(motif.instrumentId).toBe("bass");
      expect(motif.visualEvent).toBe("wave");
      expect(motif.midiNote).toBeTypeOf("number");
    }
  });

  it("clamps malformed normalized values to safe musical output", () => {
    const motif = mapShapeToMotif(
      makeShape("circle", {
        position: { x: 5, y: -8 },
        size: 99,
      }),
      "soft",
    );

    expect(motif.step).toBe(15);
    expect(motif.velocity).toBeLessThanOrEqual(0.9);
    expect(motif.durationBeats).toBeLessThanOrEqual(0.75);
    expect(motif.midiNote).toBeGreaterThanOrEqual(24);
    expect(motif.midiNote).toBeLessThanOrEqual(96);
  });
});
