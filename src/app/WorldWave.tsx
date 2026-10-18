import { useLayoutEffect, useRef } from "react";
import { drawCanvasBackdrop, renderShapes } from "../canvas/shapeRenderer";
import type { CanvasShape, WorldTheme } from "../types/project";

/** 左上から柔らかい波で世界を塗り替え、波が届いた図形を一度だけふわっと膨らませる。 */
export function WorldWave({ before, shapes, theme, selectedId, allowTransforms, onComplete }: {
  before: HTMLCanvasElement;
  shapes: CanvasShape[];
  theme: WorldTheme;
  selectedId: string | null;
  allowTransforms: boolean;
  onComplete: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const oldCanvas = useRef<HTMLCanvasElement>(null);
  const newCanvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const previous = oldCanvas.current!;
    const next = newCanvas.current!;
    const host = container.current!;
    const bounds = host.getBoundingClientRect();
    const viewport = { width: bounds.width, height: bounds.height };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    previous.width = before.width;
    previous.height = before.height;
    previous.getContext("2d")?.drawImage(before, 0, 0);
    next.width = Math.round(bounds.width * dpr);
    next.height = Math.round(bounds.height * dpr);
    const context = next.getContext("2d");
    if (!context) { onComplete(); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 160 : 1100;
    const diagonal = Math.hypot(bounds.width, bounds.height);
    const start = performance.now();
    const focused = document.activeElement;
    host.focus({ preventScroll: true });
    let frame = 0;
    /** 一時的な表示サイズだけを変え、保存する配置・色・音階には手を加えない。 */
    const draw = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCanvasBackdrop(context, viewport, theme);
      const animated = reduced ? shapes : shapes.map(shape => {
        const arrival = Math.hypot(shape.position.x * bounds.width, shape.position.y * bounds.height) / diagonal * 0.7;
        const phase = Math.max(0, Math.min(1, (progress - arrival) / 0.28));
        return { ...shape, size: shape.size * (1 + Math.sin(phase * Math.PI) * 0.14) };
      });
      renderShapes(context, animated, theme, viewport, selectedId, false, allowTransforms);
      if (reduced) next.style.opacity = String(progress);
      else {
        const radius = (diagonal + 100) * Math.min(1, progress / 0.8) - 50;
        const mask = `radial-gradient(circle at 0 0, #000 ${Math.max(0, radius - 36)}px, transparent ${Math.max(1, radius + 36)}px)`;
        next.style.maskImage = mask;
        next.style.webkitMaskImage = mask;
      }
      if (progress < 1) frame = requestAnimationFrame(draw);
      else onComplete();
    };
    draw(start);
    return () => {
      cancelAnimationFrame(frame);
      if (document.activeElement === host && focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    };
  }, [before, shapes, theme, selectedId, allowTransforms, onComplete]);
  return <div ref={container} className="world-wave" role="status" aria-label={`${theme.name}に へんしん`} tabIndex={-1}
    onKeyDown={event => { event.preventDefault(); event.stopPropagation(); }}>
    <canvas ref={oldCanvas} aria-hidden="true" /><canvas ref={newCanvas} aria-hidden="true" />
  </div>;
}
