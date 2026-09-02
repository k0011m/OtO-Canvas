import { describe, expect, it } from "vitest";
import {
  buildRelationshipEvents,
  colorSoundProfile,
  relationshipCount,
  sceneForBeat,
  shapesForScene,
} from "../src/music/creativeRules";
import type { CanvasShape, MusicEvent } from "../src/types/project";

function shape(id: string, x: number, scene?: 0 | 1 | 2): CanvasShape {
  return {
    id,
    kind: "circle",
    position: { x, y: 0.5 },
    size: 0.2,
    rotation: 0,
    colorId: "sun",
    patternId: "circle-1",
    zIndex: 0,
    ...(scene === undefined ? {} : { scene }),
  };
}

const baseEvent: MusicEvent = {
  id: "event-a",
  shapeId: "a",
  beat: 0,
  durationBeats: 0.5,
  midiNote: 60,
  velocity: 0.6,
  instrumentId: "marimba",
  section: "intro",
  visualEvent: "pulse",
};

describe("three-scene selection", () => {
  it("maps the 30-second timeline into three equal scenes", () => {
    expect(sceneForBeat(0)).toBe(0);
    expect(sceneForBeat(15.99)).toBe(0);
    expect(sceneForBeat(16)).toBe(1);
    expect(sceneForBeat(32)).toBe(2);
  });

  it("uses the previous drawing when a scene is empty", () => {
    const first = shape("first", 0.2, 0);
    expect(shapesForScene([first], 2)).toEqual([first]);
  });

  it("keeps legacy one-canvas projects visible throughout", () => {
    const legacy = shape("legacy", 0.5);
    expect(shapesForScene([legacy], 0)).toEqual([legacy]);
    expect(shapesForScene([legacy], 2)).toEqual([legacy]);
  });
});

describe("creative sound rules", () => {
  it("gives every palette choice an audible profile", () => {
    expect(colorSoundProfile("ocean").durationScale).toBeGreaterThan(1);
    expect(colorSoundProfile("coral").velocityScale).toBeGreaterThan(1);
    expect(colorSoundProfile("ink").degreeOffset).toBeLessThan(0);
  });

  it("detects friends and adds an overlap harmony", () => {
    const shapes = [shape("a", 0.5), shape("b", 0.53)];
    expect(relationshipCount(shapes)).toBe(1);
    const extras = buildRelationshipEvents(shapes, [baseEvent], 0, "soft");
    expect(extras.some((event) => event.id.startsWith("combo-"))).toBe(true);
    expect(extras.every((event) => event.beat < 4)).toBe(true);
  });
});
