import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { CanvasShape, MusicEvent, SectionId, WorldTheme } from "../types/project";
import {
  DEFAULT_ANIMATION_MOOD,
  MOOD_NAMES,
  type AnimationMood,
} from "./animationMood";
import {
  drawPerformanceFrame,
  type VisualInteraction,
  type VisualNode,
} from "./visualEngine";

export type InteractionPulse = number | VisualInteraction;

export interface ConductGesture {
  phase: "start" | "move" | "end";
  /** Normalised canvas position. */
  x: number;
  /** Normalised canvas position. */
  y: number;
  /** Delta since the previous event in normalised canvas units. */
  deltaX: number;
  deltaY: number;
  /** Travel speed in normalised canvas units per second. */
  velocity: number;
  pressure: number;
  pointerType: "mouse" | "pen" | "touch" | "keyboard";
  timeMs: number;
}

export interface PerformanceCanvasProps {
  shapes: readonly CanvasShape[];
  events?: readonly MusicEvent[];
  theme: WorldTheme;
  beat: number;
  section: SectionId;
  /** Selects the performance animation style without changing the composition. */
  animationMood?: AnimationMood;
  playing?: boolean;
  /** A 0-1 global pulse, or a positioned 0-1 visual interaction. */
  interactionPulse?: InteractionPulse;
  /** Overrides the operating-system motion preference when supplied. */
  reducedMotion?: boolean;
  /** Caps rendering to 30 fps, reduces DPR, shadows and duplicated shapes. */
  lowPower?: boolean;
  onConduct?: (gesture: ConductGesture) => void;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

interface PointerState {
  id: number;
  x: number;
  y: number;
  timeMs: number;
}

interface LocalInteraction extends VisualInteraction {
  updatedAt: number;
}

const DEFAULT_LABEL =
  "音に合わせて動く図形のミュージックビデオ。画面をなぞると演奏に参加できます";

const ANIMATION_MOOD_LABELS = MOOD_NAMES;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function slideRotation(from: number, to: number, amount: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
}

function slideVisualNodes(
  targets: readonly VisualNode[],
  displayed: Map<string, VisualNode>,
  amount: number,
): VisualNode[] {
  const originals = targets.filter((node) => !node.clone);
  const entryAnchor = originals.length > 0
    ? {
        x: originals.reduce((sum, node) => sum + node.x, 0) / originals.length,
        y: originals.reduce((sum, node) => sum + node.y, 0) / originals.length,
      }
    : { x: 0, y: 0 };
  const sourceNodes = new Map(
    originals.map((node) => [node.sourceId, node]),
  );
  const targetIds = new Set<string>();
  const result: VisualNode[] = [];

  for (const target of targets) {
    targetIds.add(target.id);
    const previous = displayed.get(target.id);
    const source = sourceNodes.get(target.sourceId);
    const startingNode = previous ?? (target.clone && source
      ? {
          ...target,
          x: source.x,
          y: source.y,
          rotation: source.rotation,
          scale: source.scale,
          opacity: 0,
          eventIntensity: 0,
        }
      : {
          ...target,
          x: entryAnchor.x,
          y: entryAnchor.y,
          scale: target.scale * 0.25,
          opacity: 0,
          eventIntensity: 0,
        });
    const follow = amount;
    const current: VisualNode = {
      ...target,
      x: startingNode.x + (target.x - startingNode.x) * follow,
      y: startingNode.y + (target.y - startingNode.y) * follow,
      radius: startingNode.radius + (target.radius - startingNode.radius) * follow,
      rotation: slideRotation(startingNode.rotation, target.rotation, follow),
      scale: startingNode.scale + (target.scale - startingNode.scale) * follow,
      opacity: startingNode.opacity + (target.opacity - startingNode.opacity) * follow,
      eventIntensity:
        startingNode.eventIntensity +
        (target.eventIntensity - startingNode.eventIntensity) * follow,
    };
    displayed.set(target.id, current);
    result.push(current);
  }

  // A disappearing effect completes its exit at the last known position. This
  // covers a live accessibility/quality-setting change without popping clones.
  for (const [id, previous] of displayed) {
    if (targetIds.has(id)) continue;
    const opacity = previous.opacity * (1 - amount);
    if (opacity <= 0.004) {
      displayed.delete(id);
      continue;
    }
    const current = {
      ...previous,
      opacity,
      eventIntensity: previous.eventIntensity * (1 - amount),
    };
    displayed.set(id, current);
    result.push(current);
  }

  return result;
}

function normaliseExternalInteraction(
  interaction: InteractionPulse | undefined,
): VisualInteraction | undefined {
  if (typeof interaction === "number") {
    const strength = clamp01(interaction);
    return strength > 0 ? { x: 0.5, y: 0.5, strength } : undefined;
  }
  if (!interaction) return undefined;
  return {
    x: clamp01(interaction.x),
    y: clamp01(interaction.y),
    strength: clamp01(interaction.strength),
  };
}

function strongerInteraction(
  local: VisualInteraction | undefined,
  external: VisualInteraction | undefined,
): VisualInteraction | undefined {
  if (!local) return external;
  if (!external) return local;
  return local.strength >= external.strength ? local : external;
}

export function PerformanceCanvas({
  shapes,
  events = [],
  theme,
  beat,
  section,
  animationMood = DEFAULT_ANIMATION_MOOD,
  playing = false,
  interactionPulse,
  reducedMotion,
  lowPower,
  onConduct,
  className,
  style,
  ariaLabel,
}: PerformanceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<Viewport>({ width: 1, height: 1, dpr: 1 });
  const pointerRef = useRef<PointerState | null>(null);
  const localInteractionRef = useRef<LocalInteraction>({
    x: 0.5,
    y: 0.5,
    strength: 0,
    updatedAt: 0,
  });
  const smoothedInteractionRef = useRef<VisualInteraction>({
    x: 0.5,
    y: 0.5,
    strength: 0,
  });
  const displayedNodesRef = useRef<Map<string, VisualNode>>(new Map());
  const keyboardPointRef = useRef({ x: 0.5, y: 0.5 });
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [detectedLowPower, setDetectedLowPower] = useState(false);

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (left, right) => left.beat - right.beat || left.id.localeCompare(right.id),
      ),
    [events],
  );

  const effectiveReducedMotion = reducedMotion ?? systemReducedMotion;
  const effectiveLowPower = lowPower ?? detectedLowPower;

  const renderPropsRef = useRef({
    shapes,
    events: sortedEvents,
    theme,
    beat,
    section,
    animationMood,
    playing,
    interactionPulse,
    reducedMotion: effectiveReducedMotion,
    lowPower: effectiveLowPower,
    onConduct,
  });
  renderPropsRef.current = {
    shapes,
    events: sortedEvents,
    theme,
    beat,
    section,
    animationMood,
    playing,
    interactionPulse,
    reducedMotion: effectiveReducedMotion,
    lowPower: effectiveLowPower,
    onConduct,
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const device = navigator as Navigator & { deviceMemory?: number };
    const fewCores = typeof device.hardwareConcurrency === "number" && device.hardwareConcurrency <= 4;
    const littleMemory = typeof device.deviceMemory === "number" && device.deviceMemory <= 4;
    setDetectedLowPower(fewCores || littleMemory);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const measure = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const nativeDpr = window.devicePixelRatio || 1;
      const dpr = Math.min(nativeDpr, effectiveLowPower ? 1.25 : 2);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));

      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      viewportRef.current = { width, height, dpr };
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(canvas);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [effectiveLowPower]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return undefined;

    let animationFrame = 0;
    let previousFrameAt = 0;
    const render = (timeMs: number) => {
      animationFrame = window.requestAnimationFrame(render);
      const props = renderPropsRef.current;
      const frameDuration = props.lowPower ? 1000 / 30 : props.playing ? 1000 / 60 : 1000 / 24;
      if (timeMs - previousFrameAt < frameDuration) return;
      const elapsedFrameMs = previousFrameAt > 0
        ? Math.min(100, timeMs - previousFrameAt)
        : frameDuration;
      previousFrameAt = timeMs;

      const local = localInteractionRef.current;
      const age = Math.max(0, timeMs - local.updatedAt);
      const decayDuration = props.reducedMotion ? 300 : 850;
      const decayedStrength = pointerRef.current
        ? local.strength
        : local.strength * Math.max(0, 1 - age / decayDuration);
      const localInteraction =
        decayedStrength > 0.005
          ? { x: local.x, y: local.y, strength: decayedStrength }
          : undefined;
      const external = normaliseExternalInteraction(props.interactionPulse);
      const interactionTarget = strongerInteraction(localInteraction, external);
      const smoothed = smoothedInteractionRef.current;
      const target = interactionTarget ?? {
        x: smoothed.x,
        y: smoothed.y,
        strength: 0,
      };
      // Pointer and keyboard samples can arrive far apart. Following their
      // target with a frame-rate-independent ease makes the visual response a
      // fast slide instead of a one-frame position replacement.
      const follow = 1 - Math.exp(-elapsedFrameMs / (props.reducedMotion ? 90 : 48));
      smoothed.x += (target.x - smoothed.x) * follow;
      smoothed.y += (target.y - smoothed.y) * follow;
      smoothed.strength += (target.strength - smoothed.strength) * follow;
      const interaction = smoothed.strength > 0.005 ? { ...smoothed } : undefined;
      const viewport = viewportRef.current;
      const nodeFollow = 1 - Math.exp(-elapsedFrameMs / (props.reducedMotion ? 70 : 32));

      drawPerformanceFrame(context, {
        shapes: props.shapes,
        events: props.events,
        theme: props.theme,
        beat: props.beat,
        section: props.section,
        animationMood: props.animationMood,
        width: viewport.width,
        height: viewport.height,
        dpr: viewport.dpr,
        timeMs,
        interaction,
        reducedMotion: props.reducedMotion,
        lowPower: props.lowPower,
      }, (nodes) => slideVisualNodes(nodes, displayedNodesRef.current, nodeFollow));
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  const pointFromPointer = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - bounds.left) / Math.max(1, bounds.width)),
      y: clamp01((event.clientY - bounds.top) / Math.max(1, bounds.height)),
    };
  }, []);

  const updatePointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>, phase: ConductGesture["phase"]) => {
      const point = pointFromPointer(event);
      const timeMs = performance.now();
      const previous = pointerRef.current;
      const deltaX = previous ? point.x - previous.x : 0;
      const deltaY = previous ? point.y - previous.y : 0;
      const deltaSeconds = previous ? Math.max(0.008, (timeMs - previous.timeMs) / 1000) : 1;
      const velocity = Math.min(4, Math.hypot(deltaX, deltaY) / deltaSeconds);
      const pressure = phase === "end" ? 0 : event.pressure > 0 ? event.pressure : 0.65;
      const strength = phase === "end" ? 0.72 : clamp01(0.62 + velocity * 0.22 + pressure * 0.2);

      localInteractionRef.current = { ...point, strength, updatedAt: timeMs };
      if (phase === "end") pointerRef.current = null;
      else pointerRef.current = { id: event.pointerId, ...point, timeMs };

      const rawPointerType = event.pointerType;
      const pointerType: ConductGesture["pointerType"] =
        rawPointerType === "touch" || rawPointerType === "pen" ? rawPointerType : "mouse";
      renderPropsRef.current.onConduct?.({
        phase,
        ...point,
        deltaX,
        deltaY,
        velocity,
        pressure,
        pointerType,
        timeMs,
      });
    },
    [pointFromPointer],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updatePointer(event, "start");
    },
    [updatePointer],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (pointerRef.current?.id !== event.pointerId) return;
      updatePointer(event, "move");
    },
    [updatePointer],
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (pointerRef.current?.id !== event.pointerId) return;
      updatePointer(event, "end");
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    },
    [updatePointer],
  );

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const point = keyboardPointRef.current;
    const next = { ...point };
    const step = event.shiftKey ? 0.12 : 0.06;
    let phase: ConductGesture["phase"] = "move";

    if (event.key === "ArrowLeft") next.x = clamp01(next.x - step);
    else if (event.key === "ArrowRight") next.x = clamp01(next.x + step);
    else if (event.key === "ArrowUp") next.y = clamp01(next.y - step);
    else if (event.key === "ArrowDown") next.y = clamp01(next.y + step);
    else if (event.key === " " || event.key === "Enter") phase = "start";
    else return;

    event.preventDefault();
    const timeMs = performance.now();
    const deltaX = next.x - point.x;
    const deltaY = next.y - point.y;
    const velocity = phase === "start" ? 1 : Math.hypot(deltaX, deltaY) * 6;
    keyboardPointRef.current = next;
    localInteractionRef.current = { ...next, strength: 1, updatedAt: timeMs };
    renderPropsRef.current.onConduct?.({
      phase,
      ...next,
      deltaX,
      deltaY,
      velocity,
      pressure: 1,
      pointerType: "keyboard",
      timeMs,
    });
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role={onConduct ? "application" : "img"}
      tabIndex={onConduct ? 0 : undefined}
      aria-label={
        ariaLabel ?? `${DEFAULT_LABEL}。${ANIMATION_MOOD_LABELS[animationMood]}の雰囲気`
      }
      aria-keyshortcuts={onConduct ? "ArrowUp ArrowDown ArrowLeft ArrowRight Space Enter" : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onKeyDown={handleKeyDown}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        touchAction: "none",
        cursor: onConduct ? "crosshair" : "default",
        ...style,
      }}
    />
  );
}

export default PerformanceCanvas;
