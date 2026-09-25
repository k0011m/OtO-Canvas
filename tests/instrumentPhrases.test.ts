import { describe, expect, it } from "vitest";
import { buildArrangement } from "../src/music/arranger";
import { voiceBudgetEnd } from "../src/music/instrumentPhrases";
import { instrumentForShape } from "../src/music/shapeMapper";
import { MAX_SHAPES_PER_SCENE, STAMP_SHAPE_KINDS, type CanvasShape, type ShapeKind } from "../src/types/project";

const KINDS: readonly ShapeKind[] = [...STAMP_SHAPE_KINDS, "pen"];

/** 50個を同じ位置へ重ねても、少数の楽器が消えないかを調べる密集データを作る。 */
function crowdedShapes(x: number): CanvasShape[] {
  return Array.from({ length: MAX_SHAPES_PER_SCENE }, (_, index) => ({
    id: `crowded-${index}`, kind: KINDS[Math.min(index, KINDS.length - 1)],
    position: { x, y: 0.2 }, size: 0.4, rotation: 0,
    colorId: "ocean", patternId: "test", zIndex: index, scene: 0,
  }));
}

describe("instrument-led arrangements", () => {
  // 楽器数は音階数にせず、単独の楽器にも複数音程の旋律を与える。
  it.each(KINDS.filter((kind) => kind !== "triangle"))("gives one %s multiple pitches and rhythms", (kind) => {
    const shape = { ...crowdedShapes(0.5)[0], kind };
    const events = buildArrangement([shape], 1234, "soft");
    expect(new Set(events.map((event) => event.midiNote)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(events.map((event) => event.beat % 4)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(events.map((event) => event.instrumentId))).toEqual(new Set([instrumentForShape(shape)]));
  });

  // 同じX位置へ50個を集中させても、9楽器すべてのフレーズと発音枠を維持する。
  it.each([0, 0.5, 1])("keeps all instruments active at x=%s without exceeding the voice budget", (x) => {
    for (const world of ["soft", "bounce", "space"] as const) {
      const shapes = crowdedShapes(x);
      const events = buildArrangement(shapes, 9876, world);
      expect(events).toEqual(buildArrangement(shapes, 9876, world));
      for (let bar = 0; bar < 12; bar += 1) {
        const parts = events.filter((event) => event.id.startsWith(`part-${bar}-`));
        expect(parts.length, `${world} bar ${bar}`).toBe(18);
        expect(new Set(parts.map((event) => event.instrumentId)).size).toBe(9);
      }
      for (const event of events) {
        expect(event.beat + event.durationBeats).toBeLessThanOrEqual(48);
        const simultaneous = events.filter((other) => other.beat <= event.beat && voiceBudgetEnd(other) > event.beat);
        expect(simultaneous.length).toBeLessThanOrEqual(8);
      }
    }
  });

  // シーンに存在しない楽器を前景の演奏へ混ぜず、空シーンだけ前の絵を引き継ぐ。
  it("uses the instruments in each scene and retains the empty-scene fallback", () => {
    const first = { ...crowdedShapes(0.5)[0], kind: "circle" as const };
    const second = { ...crowdedShapes(0.5)[1], kind: "pen" as const, scene: 1 as const };
    const events = buildArrangement([first, second], 12, "bounce");
    expect(new Set(events.filter((event) => event.beat < 16).map((event) => event.instrumentId))).toEqual(new Set(["marimba"]));
    expect(new Set(events.filter((event) => event.beat >= 16).map((event) => event.instrumentId))).toEqual(new Set(["flute"]));
  });
});
