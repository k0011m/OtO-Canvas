import { buildArrangement } from "./arranger";
import { buildSceneBackingTrack } from "./backingTrack";
import type { OtoProject } from "../types/project";

/** 再生要求のスナップショットだけを使い、画面の応答を止めずに主旋律と伴奏を生成する。 */
self.onmessage = ({ data: project }: MessageEvent<OtoProject>) => {
  try {
    const events = buildArrangement(project.shapes, project.seed, project.worldId, project.sceneCount, project.sceneSoundPrograms);
    const mixedEvents = [...events, ...buildSceneBackingTrack(project.worldId, project.sceneMoods ?? [], project.sceneCount ?? 3, project.seed, project.sceneSoundPrograms, project.soundProgramBgm)]
      .sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id));
    self.postMessage({ events, mixedEvents });
  } catch {
    self.postMessage({ error: "演奏データを生成できませんでした" });
  }
};
