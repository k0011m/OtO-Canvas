import { expect, it } from "vitest";
import { copyScenePrograms, isScenePrograms, programStepAtBeat, type ScenePrograms } from "../src/visuals/motionProgram";
import { createProject } from "../src/music/arranger";
import { isOtoProject } from "../src/storage/projectStore";
import { parseProjectFile, serializeProject } from "../src/export/projectFile";

// 1〜10場面のすべてで、命令の順番・反復・最終拍の判定が一致する。
it.each([1, 2, 3, 7, 10])("executes ordered loops in %i scenes", (count) => {
  const programs: ScenePrograms = Array.from({ length: count }, () => ({ moves: ["wave", "pop", "gather"], repeat: 3 }));
  for (let scene = 0; scene < count; scene++) for (let step = 0; step < 9; step++) {
    const beat = scene * 48 / count + (step + .25) * 48 / count / 9;
    const state = programStepAtBeat(beat, count, [], programs);
    expect(state.scene).toBe(scene);
    expect(state.index).toBe(step % 3);
    expect(state.iteration).toBe(Math.floor(step / 3) + 1);
    expect(state.mood).toBe(["wave", "pop", "gather"][step % 3]);
    expect(state.elapsedSeconds).toBeCloseTo(.25 * 30 / count / 9);
  }
  expect(programStepAtBeat(48, count, [], programs).index).toBe(2);
});

// 旧作品は単一動作のまま、新しいプログラムはファイルと保存形式で往復する。
it("preserves programs through cloning and portable files", () => {
  const programs: ScenePrograms = [{ moves: ["wave", "pop"], repeat: 2 }, null];
  const copy = copyScenePrograms(programs);
  copy[0]!.moves[0] = "rain";
  expect(programs[0]!.moves[0]).toBe("wave");
  const project = createProject([], 3, "soft", { scenePrograms: programs });
  expect(isOtoProject(project)).toBe(true);
  expect(parseProjectFile(serializeProject(project)).scenePrograms).toEqual(programs);
  expect(programStepAtBeat(0, 3, ["spiral"], []).mood).toBe("spiral");
  expect(programStepAtBeat(0, 3, [], []).programmed).toBe(false);
});

// 不正な命令や無限反復を保存ファイルから実行させない。
it("rejects unsupported and unbounded programs", () => {
  for (const value of [[{ moves: [], repeat: 1 }], [{ moves: ["unknown"], repeat: 1 }],
    [{ moves: ["float"], repeat: 0 }], [{ moves: ["float"], repeat: 4 }],
    [{ moves: Array(7).fill("float"), repeat: 1 }], Array(11).fill(null)]) expect(isScenePrograms(value)).toBe(false);
});
