import { describe, expect, it } from "vitest";
import {
  WORLDS,
  type CanvasShape,
  type MusicEvent,
  type ShapeKind,
} from "../src/types/project";
import {
  ANIMATION_MOODS,
  DEFAULT_ANIMATION_MOOD,
  isAnimationMood,
  type AnimationMood,
} from "../src/visuals/animationMood";
import {
  SECTION_SLIDE_BEATS,
  buildVisualNodes,
  sectionAtBeat,
  type VisualFrameInput,
  type VisualNode,
} from "../src/visuals/visualEngine";

const SHAPE: CanvasShape = {
  id: "test-star",
  kind: "star",
  position: { x: 0.28, y: 0.62 },
  size: 0.16,
  rotation: 25,
  colorId: "sun",
  patternId: "none",
  zIndex: 0,
};

const BASE_FRAME: VisualFrameInput = {
  shapes: [SHAPE],
  events: [],
  theme: WORLDS.soft,
  beat: 12.5,
  section: "a",
  width: 800,
  height: 600,
  timeMs: 7_812.5,
};

const BOUNDARY_SHAPES: CanvasShape[] = (
  [
    "circle",
    "triangle",
    "line",
    "square",
    "diamond",
    "star",
    "hexagon",
    "ring",
    "pen",
  ] satisfies ShapeKind[]
).map((kind, index) => ({
  id: `boundary-${kind}`,
  kind,
  position: {
    x: 0.12 + (index % 3) * 0.34,
    y: 0.16 + Math.floor(index / 3) * 0.31,
  },
  size: 0.09 + (index % 3) * 0.025,
  rotation: index * 23,
  colorId: "sun",
  patternId: "none",
  zIndex: index,
  points: kind === "pen"
    ? [{ x: -0.5, y: -0.2 }, { x: 0, y: 0.3 }, { x: 0.5, y: -0.1 }]
    : undefined,
}));

function nodesAt(
  beat: number,
  mood: AnimationMood,
  shapes: readonly CanvasShape[] = [SHAPE],
  events: readonly MusicEvent[] = [],
  section = sectionAtBeat(beat),
): VisualNode[] {
  return buildVisualNodes({
    ...BASE_FRAME,
    shapes,
    events,
    beat,
    section,
    animationMood: mood,
  });
}

function primaryNodeAt(
  beat: number,
  mood: AnimationMood,
  shapeId = SHAPE.id,
  events: readonly MusicEvent[] = [],
): VisualNode {
  const node = nodesAt(beat, mood, [SHAPE], events)
    .find((candidate) => !candidate.clone && candidate.sourceId === shapeId);
  expect(node).toBeDefined();
  return node!;
}

function poseDistance(left: VisualNode, right: VisualNode): number {
  const turn = Math.atan2(
    Math.sin(right.rotation - left.rotation),
    Math.cos(right.rotation - left.rotation),
  ) / (Math.PI * 2);
  return Math.hypot(
    (right.x - left.x) / BASE_FRAME.width,
    (right.y - left.y) / BASE_FRAME.height,
    turn,
    Math.log(Math.max(0.001, right.scale) / Math.max(0.001, left.scale)),
    right.opacity - left.opacity,
  );
}

function estimatedJump(
  sample: (beat: number) => VisualNode,
  beat: number,
  halfWindow: number,
): number {
  const wide = poseDistance(sample(beat - halfWindow), sample(beat + halfWindow));
  const narrow = poseDistance(
    sample(beat - halfWindow / 2),
    sample(beat + halfWindow / 2),
  );
  return Math.max(0, narrow * 2 - wide);
}

function baseNode(mood?: AnimationMood, reducedMotion = false): VisualNode {
  const nodes = buildVisualNodes({
    ...BASE_FRAME,
    animationMood: mood,
    reducedMotion,
  });
  const node = nodes.find((candidate) => !candidate.clone);
  expect(node).toBeDefined();
  return node!;
}

function expectFiniteNode(node: VisualNode): void {
  for (const value of [
    node.x,
    node.y,
    node.radius,
    node.rotation,
    node.scale,
    node.opacity,
    node.eventIntensity,
  ]) {
    expect(Number.isFinite(value)).toBe(true);
  }
}

describe("animation moods", () => {
  it("exposes fifteen valid moods and defaults to float", () => {
    expect(ANIMATION_MOODS).toHaveLength(15);
    expect(new Set(ANIMATION_MOODS).size).toBe(15);
    expect(DEFAULT_ANIMATION_MOOD).toBe("float");

    for (const mood of ANIMATION_MOODS) expect(isAnimationMood(mood)).toBe(true);
    for (const value of [undefined, null, "", "FLOAT", "sparkle", 0, {}]) {
      expect(isAnimationMood(value)).toBe(false);
    }
  });

  it("uses float choreography when the mood is omitted", () => {
    expect(baseNode()).toEqual(baseNode("float"));
  });

  it("produces finite and visibly different layouts for float, pop, and cosmic", () => {
    const nodes = Object.fromEntries(
      ANIMATION_MOODS.map((mood) => [mood, baseNode(mood)]),
    ) as Record<AnimationMood, VisualNode>;

    for (const node of Object.values(nodes)) expectFiniteNode(node);

    const pose = (node: VisualNode) => [node.x, node.y, node.rotation, node.scale];
    expect(new Set(Object.values(nodes).map((node) => JSON.stringify(pose(node)))).size).toBe(15);
    expect(pose(nodes.float)).not.toEqual(pose(nodes.pop));
    expect(pose(nodes.float)).not.toEqual(pose(nodes.cosmic));
    expect(pose(nodes.pop)).not.toEqual(pose(nodes.cosmic));
  });

  it("keeps every mood finite and restrained when reduced motion is requested", () => {
    for (const mood of ANIMATION_MOODS) {
      const node = baseNode(mood, true);
      expectFiniteNode(node);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(BASE_FRAME.width);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(BASE_FRAME.height);
      expect(node.scale).toBeGreaterThan(0.5);
      expect(node.scale).toBeLessThan(1.5);
    }
  });

  it("slides every source shape continuously across all section boundaries", () => {
    const boundaries = [8, 16, 24, 32, 40] as const;

    for (const mood of ANIMATION_MOODS) {
      for (const boundary of boundaries) {
        for (const shape of BOUNDARY_SHAPES) {
          const sample = (beat: number) => {
            const node = nodesAt(beat, mood, BOUNDARY_SHAPES)
              .find((candidate) => !candidate.clone && candidate.sourceId === shape.id);
            expect(node).toBeDefined();
            return node!;
          };
          expect(estimatedJump(sample, boundary, 0.001)).toBeLessThan(0.00001);
        }
      }
    }
  });

  it("keeps both ends of every section slide continuous", () => {
    for (const mood of ANIMATION_MOODS) {
      for (const boundary of [8, 16, 24, 32, 40]) {
        const slideEnd = boundary + SECTION_SLIDE_BEATS;
        expect(
          estimatedJump((beat) => primaryNodeAt(beat, mood), slideEnd, 0.001),
        ).toBeLessThan(0.00001);
      }
    }
  });

  it("derives the visual section from the playhead to reject stale section frames", () => {
    const correct = nodesAt(16.4, "cosmic");
    const stale = nodesAt(16.4, "cosmic", [SHAPE], [], "intro");
    expect(stale).toEqual(correct);
  });

  it("does not cut off a still-moving event at the old lookup boundary", () => {
    const event: MusicEvent = {
      id: "long-orbit",
      shapeId: SHAPE.id,
      beat: 10,
      durationBeats: 2.4,
      midiNote: 64,
      velocity: 1,
      instrumentId: "marimba",
      section: "a",
      visualEvent: "orbit",
    };
    const oldCutoff = event.beat + 2.5;
    const jump = estimatedJump(
      (beat) => primaryNodeAt(beat, "float", SHAPE.id, [event]),
      oldCutoff,
      0.001,
    );
    expect(jump).toBeLessThan(0.00001);
  });
});
