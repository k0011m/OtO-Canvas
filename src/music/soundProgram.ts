import { TOTAL_BEATS, type CanvasShape, type MusicEvent, type SceneIndex, type WorldId } from "../types/project";
import { normalizeSceneCount, shapesForScene } from "./creativeRules";
import { instrumentForShape } from "./shapeMapper";
import { getSectionAtBeat } from "./sections";

export const NOTE_NAMES = ["ド", "レ", "ミ", "ファ", "ソ", "ラ", "シ", "高いド"] as const;
export const NOTE_MIDI = [60, 62, 64, 65, 67, 69, 71, 72] as const;
export const MAX_SOUND_STEPS = 32;
export type SceneSoundPrograms = (string[] | null)[];

/** 読み込んだ音階を8音の範囲に限定する。 */
export function isSoundNote(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 8;
}

/** 外部ファイルから極端に長い命令列や不正な図形参照を持ち込ませない。 */
export function isSceneSoundPrograms(value: unknown): value is SceneSoundPrograms {
  return Array.isArray(value) && value.length <= 10 && value.every((steps) => steps === null ||
    (Array.isArray(steps) && steps.length <= MAX_SOUND_STEPS && steps.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200)));
}

/** 保存済みの命令配列を編集用に複製する。 */
export function copySoundPrograms(value?: SceneSoundPrograms): SceneSoundPrograms {
  return value?.map((steps) => steps ? [...steps] : null) ?? [];
}

/** 音階学習では、たいこはマリンバ、音域を折り返すベースはピアノで8音を保つ。 */
export function soundProgramInstrument(shape: CanvasShape, world: WorldId) {
  const instrument = instrumentForShape(shape);
  if (world === "bounce" && instrument === "drum") return "marimba";
  if (world === "bounce" && instrument === "bass") return "piano";
  return instrument;
}

/** 削除・別場面の図形を除き、同じ図形を複数回並べた順番は保つ。 */
export function playableSoundSteps(steps: readonly string[], shapes: readonly CanvasShape[]): string[] {
  const ids = new Set(shapes.map((shape) => shape.id));
  return steps.filter((id) => ids.has(id)).slice(0, MAX_SOUND_STEPS);
}

/** 手動の場面は自動編曲を置き換え、指定順を場面内に1回、等間隔で演奏する。 */
export function applySoundPrograms(events: MusicEvent[], shapes: readonly CanvasShape[], world: WorldId,
  sceneCount: number, programs?: SceneSoundPrograms): MusicEvent[] {
  const count = normalizeSceneCount(sceneCount);
  let result = [...events];
  for (let scene = 0; scene < count; scene++) {
    const steps = programs?.[scene];
    if (!steps) continue;
    const start = scene * TOTAL_BEATS / count;
    const end = (scene + 1) * TOTAL_BEATS / count;
    result = result.filter((event) => event.beat < start || event.beat >= end);
    const picture = shapesForScene(shapes, scene as SceneIndex, count);
    const order = playableSoundSteps(steps, picture);
    const spacing = (end - start) / Math.max(1, order.length);
    order.forEach((id, index) => {
      const shape = picture.find((item) => item.id === id)!;
      const beat = start + index * spacing;
      result.push({ id: `sound-program-${scene}-${index}`, shapeId: id, soundWorld: world,
        beat, durationBeats: Math.min(.8, spacing * .8), midiNote: NOTE_MIDI[shape.soundNote ?? 0],
        velocity: .7, instrumentId: soundProgramInstrument(shape, world), section: getSectionAtBeat(beat), visualEvent: "pulse" });
    });
  }
  return result.sort((a, b) => a.beat - b.beat);
}
