import { drawCanvasBackdrop, renderShapes } from "../canvas/shapeRenderer";
import { shapesForScene } from "../music/creativeRules";
import type { CanvasShape, SceneIndex, WorldTheme } from "../types/project";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadJacketPng(
  shapes: readonly CanvasShape[],
  theme: WorldTheme,
  title = "MY OTO CANVAS",
): Promise<void> {
  const size = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available.");

  context.fillStyle = theme.background;
  context.fillRect(0, 0, size, size);
  context.fillStyle = theme.ink;
  context.font = "800 76px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(title, size / 2, 105);
  context.font = "600 28px system-ui, sans-serif";
  context.globalAlpha = 0.68;
  context.fillText("DRAWING BECOMES MUSIC", size / 2, 153);
  context.globalAlpha = 1;

  const panelWidth = 340;
  const panelHeight = 790;
  const gap = 28;
  const startX = (size - panelWidth * 3 - gap * 2) / 2;
  ([0, 1, 2] as SceneIndex[]).forEach((scene) => {
    const x = startX + scene * (panelWidth + gap);
    const y = 205;
    context.save();
    context.beginPath();
    context.roundRect(x, y, panelWidth, panelHeight, 34);
    context.clip();
    context.translate(x, y);
    const viewport = { width: panelWidth, height: panelHeight };
    drawCanvasBackdrop(context, viewport, theme);
    renderShapes(context, shapesForScene(shapes, scene), theme, viewport, null, true);
    context.restore();
    context.fillStyle = theme.ink;
    context.globalAlpha = 0.62;
    context.font = "700 24px system-ui, sans-serif";
    context.fillText(`${scene + 1}`, x + panelWidth / 2, 1040);
    context.globalAlpha = 1;
  });

  context.fillStyle = theme.ink;
  context.font = "800 34px system-ui, sans-serif";
  context.fillText("OtoCanvas", size / 2, 1125);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG export failed.")), "image/png");
  });
  downloadBlob(blob, "otocanvas-jacket.png");
}

export function downloadRecordedVideo(chunks: readonly Blob[], mimeType: string): void {
  downloadBlob(new Blob([...chunks], { type: mimeType }), "otocanvas-mv.webm");
}
