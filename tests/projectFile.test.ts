import { expect, it } from "vitest";
import { createProject } from "../src/music/arranger";
import { parseProjectFile, serializeProject, MAX_PROJECT_FILE_BYTES } from "../src/export/projectFile";

const project = createProject([{ id: "one", kind: "circle", position: { x: .3, y: .4 }, size: .2,
  rotation: .1, colorId: "sun", patternId: "circle-1", zIndex: 0, scene: 9 }], 123, "space",
{ title: "テスト", sceneCount: 2, sceneMoods: ["wave", "pop", "carousel"] });

// 非表示の場面も含めて再編集の材料を往復し、音符は再生成する。
it("round trips editable content including dormant scenes", () => {
  const result = parseProjectFile(serializeProject(project));
  expect(result).toEqual({ ...project, events: [] });
});

// 破損・未来版・過大ファイルを編集状態へ反映しない。
it("rejects malformed, future and oversized files", () => {
  expect(() => parseProjectFile("no json")).toThrow();
  expect(() => parseProjectFile('{"format":"otocanvas","fileVersion":2}')).toThrow();
  expect(() => parseProjectFile(" ".repeat(MAX_PROJECT_FILE_BYTES + 1))).toThrow();
  expect(() => parseProjectFile(serializeProject({ ...project, sceneCount: 11 }))).toThrow();
});

// ファイルの図形数・重複ID・描画座標を検証する。
it("rejects duplicate shapes, invalid coordinates and overfull scenes", () => {
  expect(() => parseProjectFile(serializeProject({ ...project, shapes: [project.shapes[0], project.shapes[0]] }))).toThrow();
  expect(() => parseProjectFile(serializeProject({ ...project, shapes: [{ ...project.shapes[0], position: { x: 100, y: .5 } }] }))).toThrow();
  expect(() => parseProjectFile(serializeProject({ ...project, shapes: Array.from({ length: 51 }, (_, i) => ({ ...project.shapes[0], id: `${i}` })) }))).toThrow();
});
