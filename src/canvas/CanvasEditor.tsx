import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { CanvasShape, Point, ShapeKind, WorldTheme } from "../types/project";
import { MAX_SHAPES_PER_SCENE } from "../types/project";
import { createId } from "../utils/id";
import {
  clampShapePosition,
  clampShapeSize,
  drawCanvasBackdrop,
  hitTestRotateHandle,
  hitTestScaleHandle,
  hitTestShape,
  renderShapes,
  type CanvasViewport,
} from "./shapeRenderer";

export interface CanvasEditorProps {
  shapes: CanvasShape[];
  selectedKind: ShapeKind;
  selectedColorId: string;
  selectedId: string | null;
  theme: WorldTheme;
  disabled?: boolean;
  allowTransforms?: boolean;
  className?: string;
  onShapesChange: (next: CanvasShape[], actionLabel: string) => void;
  onSelect: (id: string | null) => void;
  onPreview?: (shape: CanvasShape) => void;
}

type InteractionMode = "move" | "scale" | "rotate";

interface PointerInteraction {
  pointerId: number;
  mode: InteractionMode;
  shapeId: string;
  originalShape: CanvasShape;
  startPoint: CanvasShape["position"];
  startDistance: number;
  startAngle: number;
  draftShapes: CanvasShape[];
  changed: boolean;
}

interface PendingAdd {
  pointerId: number;
  startPoint: CanvasShape["position"];
  startClientX: number;
  startClientY: number;
}

interface PendingStroke {
  pointerId: number;
  shapeId: string;
  points: Point[];
}

interface MeasuredViewport extends CanvasViewport {
  dpr: number;
}

const MOVE_THRESHOLD_PX = 3;
const TAP_THRESHOLD_PX = 12;

const SCREEN_READER_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const KIND_LABELS: Record<ShapeKind, string> = {
  circle: "まる",
  triangle: "さんかく",
  line: "せん",
  square: "しかく",
  diamond: "ひしがた",
  star: "ほし",
  hexagon: "ろっかく",
  ring: "わっか",
  pen: "おえかき",
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function shapesByFrontmost(shapes: readonly CanvasShape[]): CanvasShape[] {
  return [...shapes].sort((left, right) => right.zIndex - left.zIndex);
}

function replaceShape(
  shapes: readonly CanvasShape[],
  replacement: CanvasShape,
): CanvasShape[] {
  return shapes.map((shape) => (shape.id === replacement.id ? replacement : shape));
}

/** 親が選んだ操作範囲を、ボタン以外のポインター・キー入力にも適用する。 */
export function CanvasEditor({
  shapes,
  selectedKind,
  selectedColorId,
  selectedId,
  theme,
  disabled = false,
  allowTransforms = true,
  className,
  onShapesChange,
  onSelect,
  onPreview,
}: CanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interactionRef = useRef<PointerInteraction | null>(null);
  const pendingAddRef = useRef<PendingAdd | null>(null);
  const pendingStrokeRef = useRef<PendingStroke | null>(null);
  const [draftShapes, setDraftShapes] = useState<CanvasShape[] | null>(null);
  const [viewport, setViewport] = useState<MeasuredViewport>({
    width: 1,
    height: 1,
    dpr: 1,
  });
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState("キャンバスのじゅんびができました");
  const instructionsId = useId();
  const statusId = useId();

  const visibleShapes = draftShapes ?? shapes;
  const selectedShape = useMemo(
    () => shapes.find((shape) => shape.id === selectedId) ?? null,
    [selectedId, shapes],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const measure = (): void => {
      const bounds = container.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(bounds.width));
      const nextHeight = Math.max(1, Math.round(bounds.height));
      const nextDpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      setViewport((current) => {
        if (
          current.width === nextWidth &&
          current.height === nextHeight &&
          current.dpr === nextDpr
        ) {
          return current;
        }
        return { width: nextWidth, height: nextHeight, dpr: nextDpr };
      });
    };

    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(container);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pixelWidth = Math.max(1, Math.round(viewport.width * viewport.dpr));
    const pixelHeight = Math.max(1, Math.round(viewport.height * viewport.dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    drawCanvasBackdrop(context, viewport, theme);
    renderShapes(context, visibleShapes, theme, viewport, selectedId, disabled, allowTransforms);
  }, [disabled, selectedId, theme, viewport, visibleShapes, allowTransforms]);

  useEffect(() => {
    if (interactionRef.current && !shapes.some((shape) => shape.id === interactionRef.current?.shapeId)) {
      interactionRef.current = null;
      setDraftShapes(null);
    }
  }, [shapes]);

  const pointFromClient = useCallback(
    (clientX: number, clientY: number): CanvasShape["position"] => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        return { x: 0.5, y: 0.5 };
      }
      return {
        x: clamp01((clientX - bounds.left) / bounds.width),
        y: clamp01((clientY - bounds.top) / bounds.height),
      };
    },
    [],
  );

  const makeStrokeShape = useCallback(
    (rawPoints: readonly Point[], shapeId = createId("shape")): CanvasShape => {
      const sourcePoints = rawPoints.length > 0 ? rawPoints : [{ x: 0.5, y: 0.5 }];
      const pixelPoints = sourcePoints.map((point) => ({
        x: point.x * viewport.width,
        y: point.y * viewport.height,
      }));
      const minX = Math.min(...pixelPoints.map((point) => point.x));
      const maxX = Math.max(...pixelPoints.map((point) => point.x));
      const minY = Math.min(...pixelPoints.map((point) => point.y));
      const maxY = Math.max(...pixelPoints.map((point) => point.y));
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const minimumDimension = Math.max(1, Math.min(viewport.width, viewport.height));
      const span = Math.max(maxX - minX, maxY - minY, minimumDimension * 0.035);
      const size = clampShapeSize(span / minimumDimension);
      const radius = Math.max(1, (size * minimumDimension) / 2);
      const highestZ = shapes.reduce((highest, shape) => Math.max(highest, shape.zIndex), -1);
      const shape: CanvasShape = {
        id: shapeId,
        kind: "pen",
        position: {
          x: clamp01(center.x / Math.max(1, viewport.width)),
          y: clamp01(center.y / Math.max(1, viewport.height)),
        },
        size,
        rotation: 0,
        colorId: selectedColorId,
        patternId: `pen-${(shapes.length % 3) + 1}`,
        zIndex: highestZ + 1,
        points: pixelPoints.map((point) => ({
          x: (point.x - center.x) / radius,
          y: (point.y - center.y) / radius,
        })),
      };
      return {
        ...shape,
        position: clampShapePosition(shape, shape.position, viewport),
      };
    },
    [selectedColorId, shapes, viewport],
  );

  const makeShape = useCallback(
    (position: CanvasShape["position"]): CanvasShape => {
      const defaultSizes: Record<ShapeKind, number> = {
        circle: 0.17,
        triangle: 0.18,
        line: 0.22,
        square: 0.18,
        diamond: 0.18,
        star: 0.2,
        hexagon: 0.19,
        ring: 0.19,
        pen: 0.07,
      };
      if (selectedKind === "pen") return makeStrokeShape([position]);
      const highestZ = shapes.reduce((highest, shape) => Math.max(highest, shape.zIndex), -1);
      const shape: CanvasShape = {
        id: createId("shape"),
        kind: selectedKind,
        position,
        size: defaultSizes[selectedKind],
        rotation: selectedKind === "line" ? ((shapes.length % 4) * Math.PI) / 12 : 0,
        colorId: selectedColorId,
        patternId: `${selectedKind}-${(shapes.length % 3) + 1}`,
        zIndex: highestZ + 1,
      };
      return {
        ...shape,
        position: clampShapePosition(shape, position, viewport),
      };
    },
    [makeStrokeShape, selectedColorId, selectedKind, shapes, viewport],
  );

  const addShape = useCallback(
    (position: CanvasShape["position"]): void => {
      if (disabled) return;
      if (shapes.length >= MAX_SHAPES_PER_SCENE) {
        setStatus(`図形は${MAX_SHAPES_PER_SCENE}こまでです`);
        return;
      }

      const nextShape = makeShape(position);
      onShapesChange([...shapes, nextShape], `${KIND_LABELS[nextShape.kind]}をおいた`);
      onSelect(nextShape.id);
      onPreview?.(nextShape);
      setStatus(`${KIND_LABELS[nextShape.kind]}をおきました。おとがなります`);
    },
    [disabled, makeShape, onPreview, onSelect, onShapesChange, shapes],
  );

  const finishPointer = useCallback(
    (pointerId: number, clientX: number, clientY: number, cancelled: boolean): void => {
      const canvas = canvasRef.current;
      const interaction = interactionRef.current;

      if (interaction?.pointerId === pointerId) {
        if (!cancelled && interaction.changed) {
          const changedShape = interaction.draftShapes.find(
            (shape) => shape.id === interaction.shapeId,
          );
          const actionLabel =
            interaction.mode === "move"
              ? "図形をうごかした"
              : interaction.mode === "scale"
                ? "おおきさをかえた"
                : "図形をまわした";
          onShapesChange(interaction.draftShapes, actionLabel);
          if (changedShape) onPreview?.(changedShape);
          setStatus(actionLabel);
        }
        interactionRef.current = null;
        setDraftShapes(null);
      } else {
        const pendingStroke = pendingStrokeRef.current;
        if (pendingStroke?.pointerId === pointerId) {
          const endPoint = pointFromClient(clientX, clientY);
          const lastPoint = pendingStroke.points[pendingStroke.points.length - 1];
          const endDistance = lastPoint
            ? Math.hypot(
                (endPoint.x - lastPoint.x) * viewport.width,
                (endPoint.y - lastPoint.y) * viewport.height,
              )
            : Number.POSITIVE_INFINITY;
          if (endDistance >= 2) pendingStroke.points.push(endPoint);
          if (!cancelled) {
            const strokeShape = makeStrokeShape(pendingStroke.points, pendingStroke.shapeId);
            onShapesChange([...shapes, strokeShape], "おえかきをかいた");
            onSelect(strokeShape.id);
            onPreview?.(strokeShape);
            setStatus("おえかきをかきました。おとがなります");
          }
          pendingStrokeRef.current = null;
          setDraftShapes(null);
        } else {
          const pendingAdd = pendingAddRef.current;
          if (pendingAdd?.pointerId === pointerId) {
            const moved = Math.hypot(
              clientX - pendingAdd.startClientX,
              clientY - pendingAdd.startClientY,
            );
            if (!cancelled && moved <= TAP_THRESHOLD_PX) {
              addShape(pointFromClient(clientX, clientY));
            }
            pendingAddRef.current = null;
          }
        }
      }

      if (canvas?.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
    },
    [
      addShape,
      makeStrokeShape,
      onPreview,
      onSelect,
      onShapesChange,
      pointFromClient,
      shapes,
      viewport,
    ],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      if (
        disabled ||
        event.button !== 0 ||
        interactionRef.current ||
        pendingAddRef.current ||
        pendingStrokeRef.current
      ) return;
      event.preventDefault();

      const point = pointFromClient(event.clientX, event.clientY);
      if (selectedKind === "pen") {
        if (shapes.length >= MAX_SHAPES_PER_SCENE) {
          setStatus(`図形は${MAX_SHAPES_PER_SCENE}こまでです`);
          return;
        }
        const shapeId = createId("shape");
        pendingStrokeRef.current = {
          pointerId: event.pointerId,
          shapeId,
          points: [point],
        };
        onSelect(null);
        setDraftShapes([...shapes, makeStrokeShape([point], shapeId)]);
        setStatus("ゆびやペンをうごかして えをかけます");
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus({ preventScroll: true });
        return;
      }

      const selected = shapes.find((shape) => shape.id === selectedId);
      const rotateTarget =
        allowTransforms && selected && hitTestRotateHandle(selected, point, viewport) ? selected : null;
      const scaleTarget =
        allowTransforms && !rotateTarget && selected && hitTestScaleHandle(selected, point, viewport) ? selected : null;
      const hitShape =
        rotateTarget ?? scaleTarget ?? shapesByFrontmost(shapes).find((shape) => hitTestShape(shape, point, viewport));

      if (hitShape) {
        const mode: InteractionMode = rotateTarget ? "rotate" : scaleTarget ? "scale" : "move";
        const dx = (point.x - hitShape.position.x) * viewport.width;
        const dy = (point.y - hitShape.position.y) * viewport.height;
        interactionRef.current = {
          pointerId: event.pointerId,
          mode,
          shapeId: hitShape.id,
          originalShape: hitShape,
          startPoint: point,
          startDistance: Math.max(1, Math.hypot(dx, dy)),
          startAngle: Math.atan2(dy, dx),
          draftShapes: shapes,
          changed: false,
        };
        onSelect(hitShape.id);
        onPreview?.(hitShape);
        setStatus(`${KIND_LABELS[hitShape.kind]}をえらびました`);
      } else {
        pendingAddRef.current = {
          pointerId: event.pointerId,
          startPoint: point,
          startClientX: event.clientX,
          startClientY: event.clientY,
        };
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
    },
    [
      disabled,
      makeStrokeShape,
      allowTransforms,
      onPreview,
      onSelect,
      pointFromClient,
      selectedId,
      selectedKind,
      shapes,
      viewport,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      if (disabled) return;
      const pendingStroke = pendingStrokeRef.current;
      if (pendingStroke?.pointerId === event.pointerId) {
        event.preventDefault();
        const point = pointFromClient(event.clientX, event.clientY);
        const lastPoint = pendingStroke.points[pendingStroke.points.length - 1];
        const distance = Math.hypot(
          (point.x - lastPoint.x) * viewport.width,
          (point.y - lastPoint.y) * viewport.height,
        );
        if (distance >= 2.5) {
          pendingStroke.points.push(point);
          setDraftShapes([
            ...shapes,
            makeStrokeShape(pendingStroke.points, pendingStroke.shapeId),
          ]);
        }
        return;
      }

      const interaction = interactionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      event.preventDefault();

      const point = pointFromClient(event.clientX, event.clientY);
      let nextShape: CanvasShape;
      if (interaction.mode === "move") {
        const nextPosition = {
          x: interaction.originalShape.position.x + point.x - interaction.startPoint.x,
          y: interaction.originalShape.position.y + point.y - interaction.startPoint.y,
        };
        nextShape = {
          ...interaction.originalShape,
          position: clampShapePosition(interaction.originalShape, nextPosition, viewport),
        };
      } else if (interaction.mode === "scale") {
        const dx = (point.x - interaction.originalShape.position.x) * viewport.width;
        const dy = (point.y - interaction.originalShape.position.y) * viewport.height;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const resizedShape = {
          ...interaction.originalShape,
          size: clampShapeSize(
            interaction.originalShape.size * (distance / interaction.startDistance),
          ),
        };
        nextShape = {
          ...resizedShape,
          position: clampShapePosition(resizedShape, resizedShape.position, viewport),
        };
      } else {
        const dx = (point.x - interaction.originalShape.position.x) * viewport.width;
        const dy = (point.y - interaction.originalShape.position.y) * viewport.height;
        const currentAngle = Math.atan2(dy, dx);
        const angleDelta = Math.atan2(
          Math.sin(currentAngle - interaction.startAngle),
          Math.cos(currentAngle - interaction.startAngle),
        );
        const rotatedShape = {
          ...interaction.originalShape,
          rotation: interaction.originalShape.rotation + angleDelta,
        };
        nextShape = {
          ...rotatedShape,
          position: clampShapePosition(rotatedShape, rotatedShape.position, viewport),
        };
      }

      const distanceFromStart = Math.hypot(
        (point.x - interaction.startPoint.x) * viewport.width,
        (point.y - interaction.startPoint.y) * viewport.height,
      );
      const nextShapes = replaceShape(shapes, nextShape);
      interaction.draftShapes = nextShapes;
      interaction.changed = interaction.changed || distanceFromStart >= MOVE_THRESHOLD_PX;
      setDraftShapes(nextShapes);
    },
    [disabled, makeStrokeShape, pointFromClient, shapes, viewport],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      event.preventDefault();
      finishPointer(event.pointerId, event.clientX, event.clientY, false);
    },
    [finishPointer],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>): void => {
      finishPointer(event.pointerId, event.clientX, event.clientY, true);
    },
    [finishPointer],
  );

  const changeSelected = useCallback(
    (
      transform: (shape: CanvasShape) => CanvasShape,
      actionLabel: string,
      shouldPreview = true,
    ): void => {
      if (disabled || !selectedShape) return;
      const changedShape = transform(selectedShape);
      onShapesChange(replaceShape(shapes, changedShape), actionLabel);
      if (shouldPreview) onPreview?.(changedShape);
      setStatus(actionLabel);
    },
    [disabled, onPreview, onShapesChange, selectedShape, shapes],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLCanvasElement>): void => {
      if (disabled || !allowTransforms || !selectedShape) return;
      event.preventDefault();
      const step = event.deltaY < 0 ? 0.018 : -0.018;
      changeSelected(
        (shape) => ({ ...shape, size: clampShapeSize(shape.size + step) }),
        step > 0 ? "図形をおおきくした" : "図形をちいさくした",
      );
    },
    [changeSelected, disabled, selectedShape, allowTransforms],
  );

  const cycleSelection = useCallback(
    (direction: number): void => {
      if (shapes.length === 0) return;
      const ordered = [...shapes].sort((left, right) => left.zIndex - right.zIndex);
      const currentIndex = ordered.findIndex((shape) => shape.id === selectedId);
      const nextIndex =
        currentIndex < 0
          ? direction > 0
            ? 0
            : ordered.length - 1
          : (currentIndex + direction + ordered.length) % ordered.length;
      const nextShape = ordered[nextIndex];
      onSelect(nextShape.id);
      onPreview?.(nextShape);
      setStatus(`${KIND_LABELS[nextShape.kind]}をえらびました`);
    },
    [onPreview, onSelect, selectedId, shapes],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLCanvasElement>): void => {
      if (disabled) return;

      if (event.key === "[") {
        event.preventDefault();
        cycleSelection(-1);
        return;
      }
      if (event.key === "]") {
        event.preventDefault();
        cycleSelection(1);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onSelect(null);
        setStatus("えらびなおせます");
        return;
      }

      if (!selectedShape) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          addShape({ x: 0.5, y: 0.5 });
        }
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onShapesChange(
          shapes.filter((shape) => shape.id !== selectedShape.id),
          "図形をけした",
        );
        onSelect(null);
        setStatus(`${KIND_LABELS[selectedShape.kind]}をけしました`);
        return;
      }

      if (!allowTransforms && ["+", "=", "-", "_", "r"].includes(event.key.toLowerCase())) return;

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeSelected(
          (shape) => ({ ...shape, size: clampShapeSize(shape.size + 0.02) }),
          "図形をおおきくした",
        );
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        changeSelected(
          (shape) => ({ ...shape, size: clampShapeSize(shape.size - 0.02) }),
          "図形をちいさくした",
        );
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        const turn = (event.shiftKey ? -1 : 1) * (Math.PI / 12);
        changeSelected(
          (shape) => {
            const rotatedShape = { ...shape, rotation: shape.rotation + turn };
            return {
              ...rotatedShape,
              position: clampShapePosition(rotatedShape, rotatedShape.position, viewport),
            };
          },
          "図形をまわした",
        );
        return;
      }

      const movement = event.shiftKey ? 0.05 : 0.018;
      const direction: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -movement, y: 0 },
        ArrowRight: { x: movement, y: 0 },
        ArrowUp: { x: 0, y: -movement },
        ArrowDown: { x: 0, y: movement },
      };
      if (event.key in direction) {
        event.preventDefault();
        const delta = direction[event.key];
        changeSelected(
          (shape) => ({
            ...shape,
            position: clampShapePosition(
              shape,
              { x: shape.position.x + delta.x, y: shape.position.y + delta.y },
              viewport,
            ),
          }),
          "図形をうごかした",
          false,
        );
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onPreview?.(selectedShape);
        setStatus(`${KIND_LABELS[selectedShape.kind]}のおとがなります`);
      }
    },
    [
      addShape,
      changeSelected,
      cycleSelection,
      allowTransforms,
      disabled,
      onPreview,
      onSelect,
      onShapesChange,
      selectedShape,
      shapes,
      viewport,
    ],
  );

  const selectedDescription = selectedShape
    ? `${KIND_LABELS[selectedShape.kind]}をえらんでいます`
    : `${KIND_LABELS[selectedKind]}をおけます`;

  return (
    <div
      ref={containerRef}
      className={className ? `canvas-editor ${className}` : "canvas-editor"}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        borderRadius: "inherit",
        background: theme.background,
      }}
      data-shape-count={shapes.length}
    >
      <p id={instructionsId} style={SCREEN_READER_ONLY}>
        空いている場所を押すと図形を置けます。ペンでは指やマウスを動かして絵を描けます。図形を押すと選んで動かせます。キーボードでは角かっこで図形を選び、矢印で移動、Deleteで削除、Enterで音を鳴らします。
        {allowTransforms && "右下の取っ手で大きさ、上の取っ手で向きを変えられます。プラスとマイナスで拡大縮小、Rで回転できます。"}
      </p>
      <p id={statusId} role="status" aria-live="polite" style={SCREEN_READER_ONLY}>
        {status}
      </p>
      <canvas
        ref={canvasRef}
        role="application"
        aria-roledescription="音であそぶキャンバス"
        aria-label={`おとキャンバス。図形は${shapes.length}こ。${selectedDescription}`}
        aria-describedby={`${instructionsId} ${statusId}`}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          touchAction: "none",
          cursor: disabled
            ? "not-allowed"
            : interactionRef.current
              ? "grabbing"
              : selectedKind === "pen"
                ? "crosshair"
                : "copy",
          outline: focused ? `4px solid ${theme.accent}` : "none",
          outlineOffset: -4,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        おとキャンバスです。図形やお絵かきを置いて、動かして、おとを作れます。
      </canvas>
    </div>
  );
}

export default CanvasEditor;
