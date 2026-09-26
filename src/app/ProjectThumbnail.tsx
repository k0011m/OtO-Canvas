import { useEffect, useRef } from "react";
import { drawCanvasBackdrop, renderShapes } from "../canvas/shapeRenderer";
import { shapesForScene } from "../music/creativeRules";
import { WORLDS, type OtoProject } from "../types/project";

export function ProjectThumbnail({ project }: { project: OtoProject }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const viewport = { width: 300, height: 180 };
    const theme = WORLDS[project.worldId];
    drawCanvasBackdrop(context, viewport, theme);
    renderShapes(context, shapesForScene(project.shapes, 0, project.sceneCount), theme, viewport, null, true);
  }, [project]);
  return <canvas ref={ref} width={300} height={180} aria-hidden="true" />;
}
