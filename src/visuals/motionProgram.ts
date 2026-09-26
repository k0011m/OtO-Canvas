import { isAnimationMood, type AnimationMood } from "./animationMood";
import { normalizeSceneCount, sceneForBeat } from "../music/creativeRules";

export interface MotionProgram { moves: AnimationMood[]; repeat: number }
export type ScenePrograms = (MotionProgram | null)[];
export const MAX_PROGRAM_MOVES = 6;

/** 保存ファイルの命令数と反復数を制限し、有限の短いプログラムだけを実行する。 */
export function isScenePrograms(value: unknown): value is ScenePrograms {
  return Array.isArray(value) && value.length <= 10 && value.every((item) => item === null || (
    typeof item === "object" && item !== null && Array.isArray(item.moves) &&
    item.moves.length >= 1 && item.moves.length <= MAX_PROGRAM_MOVES && item.moves.every(isAnimationMood) &&
    Number.isInteger(item.repeat) && item.repeat >= 1 && item.repeat <= 3
  ));
}

/** 状態と保存データが配列を共有しないよう、未設定の場面も含めて複製する。 */
export function copyScenePrograms(programs: ScenePrograms = []): ScenePrograms {
  return programs.map((program) => program ? { moves: [...program.moves], repeat: program.repeat } : null);
}

/** 場面の時間を命令と反復に均等配分し、最後の拍でも最終命令を示す。 */
export function programStepAtBeat(beat: number, count: number, moods: readonly AnimationMood[], programs: ScenePrograms) {
  const total = normalizeSceneCount(count);
  const scene = sceneForBeat(beat, total);
  const program = programs[scene];
  const moves = program?.moves ?? [moods[scene] ?? "float"];
  const repeat = program?.repeat ?? 1;
  const duration = 48 / total;
  const fraction = Math.max(0, Math.min(1, (beat - scene * duration) / duration));
  const position = Math.min(moves.length * repeat - 1, Math.floor(fraction * moves.length * repeat));
  return { scene, mood: moves[position % moves.length], index: position % moves.length,
    iteration: Math.floor(position / moves.length) + 1, moves, repeat, programmed: !!program,
    elapsedSeconds: (fraction * moves.length * repeat - position) * duration / moves.length / repeat * .625 };
}
