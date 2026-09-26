import { expect, it } from "vitest";
import { createProject } from "../src/music/arranger";
import { buildSceneBackingTrack } from "../src/music/backingTrack";
import { NOTE_MIDI } from "../src/music/soundProgram";
import { parseProjectFile, serializeProject } from "../src/export/projectFile";
import type { CanvasShape } from "../src/types/project";

const shapes: CanvasShape[] = NOTE_MIDI.map((_, index) => ({ id: `s${index}`, kind: index === 1 ? "triangle" : "circle",
  position: { x: .3, y: .5 }, size: .2, rotation: 0, colorId: "sun", patternId: "plain", zIndex: index, scene: 0, soundNote: index }));

// ファ・シを含む8音と重複カードの順番を、自動編曲が変えないことを確認する。
it("plays all eight assigned notes in exact order including repeated shapes", () => {
  const order = ["s7", "s3", "s6", "s0", "s1", "s2", "s4", "s5", "s0"];
  for (const world of ["soft", "bounce", "space"] as const) {
    const project = createProject(shapes, 1, world, { sceneCount: 1, sceneSoundPrograms: [order] });
    expect(project.events.map((event) => event.shapeId)).toEqual(order);
    expect(project.events.map((event) => event.midiNote)).toEqual([72, 65, 71, 60, 62, 64, 67, 69, 60]);
    project.events.forEach((event, i) => {
      expect(event.beat).toBeCloseTo(i * 48 / order.length, 10);
      expect(event.beat + event.durationBeats).toBeLessThanOrEqual(48);
    });
    expect(buildSceneBackingTrack(world, [], 1, 1, [order])).toEqual([]);
  }
});

// 旧作品と自動の場面は維持し、消した図形や別場面を誤って鳴らさない。
it("handles deletion, silence and mixed automatic scenes", () => {
  const project = createProject(shapes, 2, "bounce", { sceneCount: 3, sceneSoundPrograms: [["deleted", "s1"], [], null] });
  expect(project.events.filter((event) => event.beat < 16).map((event) => event.shapeId)).toEqual(["s1"]);
  expect(project.events.filter((event) => event.beat >= 16 && event.beat < 32)).toEqual([]);
  expect(project.events.some((event) => event.beat >= 32)).toBe(true);
  expect(project.events[0].instrumentId).toBe("marimba");
});

// 専用ファイルの往復と外部入力の検証を行い、保存だけ成功して復元できない状態を防ぐ。
it("round trips notes and order and rejects malformed programs", () => {
  const project = createProject(shapes, 3, "space", { sceneCount: 1, sceneSoundPrograms: [["s3", "s6", "s3"]] });
  const loaded = parseProjectFile(serializeProject(project));
  expect(loaded.shapes).toEqual(project.shapes);
  expect(loaded.sceneSoundPrograms).toEqual(project.sceneSoundPrograms);
  expect(createProject(loaded.shapes, loaded.seed, loaded.worldId, loaded).events).toEqual(project.events);
  expect(() => parseProjectFile(serializeProject({ ...project, shapes: [{ ...shapes[0], soundNote: 8 }] }))).toThrow();
  expect(() => parseProjectFile(serializeProject({ ...project, sceneSoundPrograms: [Array(33).fill("s0")] }))).toThrow();
});
