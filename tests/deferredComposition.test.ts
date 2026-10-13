import { expect, it } from "vitest";
import { buildArrangement, createDraftProject } from "../src/music/arranger";

it("編集データの保存は作曲せず、保存した音階と順番から再生時に生成できる", () => {
  const draft = createDraftProject([{
    id: "a", kind: "circle", position: { x: .5, y: .5 }, size: .2,
    rotation: 0, colorId: "sun", patternId: "dots", zIndex: 0, soundNote: 3,
  }], 42, "bounce", { sceneCount: 1, sceneSoundPrograms: [["a", "a"]] });
  expect(draft.events).toEqual([]);
  const restored = JSON.parse(JSON.stringify(draft));
  const events = buildArrangement(restored.shapes, restored.seed, restored.worldId, restored.sceneCount, restored.sceneSoundPrograms);
  expect(events.map((event) => event.midiNote)).toEqual([65, 65]);
});
