import { expect, it } from "vitest";
import { selectClimaxFrame } from "../src/app/ClimaxSnapshot";
import { WORLDS, type CanvasShape } from "../src/types/project";

it("最後の場面ではなく、クライマックス中に図形が多く見える場面を選ぶ", () => {
  const shapes: CanvasShape[] = [
    { id: "single", kind: "circle", scene: 6, position: { x: .5, y: .5 }, size: .1, rotation: 0, colorId: "sun", patternId: "dots", zIndex: 0 },
    ...[.25, .5, .75].map((x, index): CanvasShape => ({ id: `group-${index}`, kind: "square", scene: 7, position: { x, y: .5 }, size: .1, rotation: 0, colorId: "ocean", patternId: "dots", zIndex: index })),
    { id: "last", kind: "circle", scene: 9, position: { x: .5, y: .5 }, size: .1, rotation: 0, colorId: "sun", patternId: "dots", zIndex: 0 },
  ];
  const props = { shapes, events: [], theme: WORLDS.bounce, sceneCount: 10, sceneMoods: [], scenePrograms: [] };
  const frame = selectClimaxFrame(props);
  expect(frame.beat).toBeGreaterThanOrEqual(32);
  expect(frame.beat).toBeLessThan(40);
  expect(frame.shapes.map((shape) => shape.id)).toEqual(["group-0", "group-1", "group-2"]);
  expect(selectClimaxFrame(props)).toEqual(frame);
});
