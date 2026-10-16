import { useEffect, useRef } from "react";
import type { CanvasShape, MusicEvent, WorldTheme } from "../types/project";
import { shapesForScene } from "../music/creativeRules";
import { programStepAtBeat, type ScenePrograms } from "../visuals/motionProgram";
import type { AnimationMood } from "../visuals/animationMood";
import { buildVisualNodes, drawPerformanceFrame, type VisualFrameInput } from "../visuals/visualEngine";

interface SnapshotProps {
  shapes: CanvasShape[];
  events: MusicEvent[];
  theme: WorldTheme;
  sceneCount: number;
  sceneMoods: AnimationMood[];
  scenePrograms: ScenePrograms;
}

/** クライマックスの候補から、画面内の元図形が多く音の反応もある一枚を選ぶ。 */
export function selectClimaxFrame(props: SnapshotProps): VisualFrameInput {
  let best: VisualFrameInput | undefined;
  let bestScore = -Infinity;
  for (let beat = 33; beat < 40; beat += .5) {
    const step = programStepAtBeat(beat, props.sceneCount, props.sceneMoods, props.scenePrograms);
    const input: VisualFrameInput = {
      shapes: shapesForScene(props.shapes, step.scene, props.sceneCount), events: props.events,
      theme: props.theme, beat, section: "climax", animationMood: step.mood,
      motionSeconds: step.programmed ? step.elapsedSeconds : undefined,
      width: 800, height: 800, dpr: 1, timeMs: beat * 625,
    };
    const visible = buildVisualNodes(input).filter((node) => !node.clone && node.opacity > .2 &&
      node.x >= node.radius && node.x <= 800 - node.radius && node.y >= node.radius && node.y <= 800 - node.radius);
    const score = visible.length * 100 + visible.reduce((sum, node) => sum + node.eventIntensity, 0);
    if (score > bestScore) { best = input; bestScore = score; }
  }
  return best!;
}

/** 本編と同じ描画器で一度だけ描き、完成画面では静止したスクリーンショットを表示する。 */
export function ClimaxSnapshot(props: SnapshotProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const frame = selectClimaxFrame(props);
    drawPerformanceFrame(context, frame);
    canvas.dataset.beat = String(frame.beat);
    canvas.dataset.shapeCount = String(frame.shapes.length);
  }, [props.shapes, props.events, props.theme, props.sceneCount, props.sceneMoods, props.scenePrograms]);
  return <canvas ref={ref} width={800} height={800} className="climax-snapshot" role="img" aria-label="作品のクライマックスの記念画像" />;
}
