import { expect, it } from "vitest";
import { sceneForBeat, shapesForScene } from "../src/music/creativeRules";
import { buildArrangement, createProject } from "../src/music/arranger";
import { buildSceneBackingTrack } from "../src/music/backingTrack";
import { isOtoProject } from "../src/storage/projectStore";
import { ANIMATION_MOODS } from "../src/visuals/animationMood";
import type { CanvasShape, SceneIndex } from "../src/types/project";

const shapes: CanvasShape[] = Array.from({ length: 10 }, (_, index) => ({
  id: `scene-${index}`, kind: "circle", scene: index as SceneIndex,
  position: { x: 0.2, y: 0.4 }, size: 0.2, rotation: 0,
  colorId: "ocean", patternId: "test", zIndex: index,
}));

// 小節途中の場面境界でも、その場面の図形だけが発音し、曲は48拍に収まる。
it.each([1, 2, 3, 5, 7, 10])("synchronizes music and scenes for count=%i", (count) => {
  expect(sceneForBeat(48, count)).toBe(count - 1);
  for (let scene = 0; scene < count; scene += 1) {
    expect(sceneForBeat(scene * 48 / count + 0.00001, count)).toBe(scene);
  }
  const events = buildArrangement(shapes, 123, "soft", count);
  expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  expect(new Set(events.map((event) => event.shapeId)).size).toBe(count);
  for (const event of events) {
    const scene = sceneForBeat(event.beat, count);
    expect(event.shapeId).toBe(`scene-${scene}`);
    expect(event.beat + event.durationBeats).toBeLessThanOrEqual((scene + 1) * 48 / count + 1e-8);
  }
  const backing = buildSceneBackingTrack("soft", ANIMATION_MOODS, count, 123);
  expect(backing.length).toBeGreaterThan(0);
  for (const event of backing) expect(event.beat + event.durationBeats).toBeLessThanOrEqual(48);
});

// 隠した場面は前方の空場面へ流入せず、再表示すれば絵が戻る。
it("keeps dormant scenes and validates saved choreography", () => {
  expect(shapesForScene([shapes[9]], 0, 1)).toEqual([]);
  expect(shapesForScene([shapes[9]], 9, 10)).toEqual([shapes[9]]);
  const project = createProject(shapes, 12, "soft", { sceneCount: 10, sceneMoods: ANIMATION_MOODS.slice(0, 10) });
  expect(isOtoProject(JSON.parse(JSON.stringify(project)))).toBe(true);
  expect(isOtoProject({ ...project, sceneCount: 11 })).toBe(false);
  expect(isOtoProject({ ...project, sceneMoods: ["invalid"] })).toBe(false);
  const { sceneCount, sceneMoods, ...legacy } = project;
  expect(isOtoProject({ ...legacy, shapes: shapes.slice(0, 3) })).toBe(true);
  expect(sceneForBeat(16)).toBe(1);
});
