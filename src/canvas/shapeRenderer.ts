import {
  shapeColorValue,
  type CanvasShape,
  type Point,
  type StampShapeKind,
  type WorldTheme,
} from "../types/project";

export interface CanvasViewport {
  width: number;
  height: number;
}

export interface RenderShapeOptions {
  selected?: boolean;
  disabled?: boolean;
  allowTransforms?: boolean;
}

export const MIN_SHAPE_SIZE = 0.07;
export const MAX_SHAPE_SIZE = 0.42;

const TAU = Math.PI * 2;
const SELECTION_PADDING = 12;
const ROTATE_HANDLE_GAP = 34;

interface LocalBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Palette colours are fixed; legacy kind ids continue to follow the current world. */
function colorForShape(shape: CanvasShape, theme: WorldTheme): string {
  const paletteColor = shapeColorValue(shape.colorId);
  if (paletteColor) return paletteColor;

  if (shape.colorId === "circle") return theme.circle;
  if (shape.colorId === "triangle") return theme.triangle;
  if (shape.colorId === "line") return theme.line;

  switch (shape.kind) {
    case "circle":
    case "square":
    case "ring":
      return theme.circle;
    case "triangle":
    case "diamond":
    case "star":
      return theme.triangle;
    case "line":
    case "hexagon":
    case "pen":
      return theme.line;
  }
}

function patternOffset(patternId: string): number {
  let value = 0;
  for (let index = 0; index < patternId.length; index += 1) {
    value = (value * 31 + patternId.charCodeAt(index)) >>> 0;
  }
  return value % 12;
}

function toCanvasPoint(point: Point, viewport: CanvasViewport): Point {
  return { x: point.x * viewport.width, y: point.y * viewport.height };
}

function localPoint(shape: CanvasShape, point: Point, viewport: CanvasViewport): Point {
  const center = toCanvasPoint(shape.position, viewport);
  const canvasPoint = toCanvasPoint(point, viewport);
  const dx = canvasPoint.x - center.x;
  const dy = canvasPoint.y - center.y;
  const cosine = Math.cos(-shape.rotation);
  const sine = Math.sin(-shape.rotation);
  return { x: dx * cosine - dy * sine, y: dx * sine + dy * cosine };
}

function canvasPointFromLocal(shape: CanvasShape, point: Point, viewport: CanvasViewport): Point {
  const center = toCanvasPoint(shape.position, viewport);
  const cosine = Math.cos(shape.rotation);
  const sine = Math.sin(shape.rotation);
  return {
    x: center.x + point.x * cosine - point.y * sine,
    y: center.y + point.x * sine + point.y * cosine,
  };
}

function radiusForShape(shape: CanvasShape, viewport: CanvasViewport): number {
  return clamp(shape.size, MIN_SHAPE_SIZE, MAX_SHAPE_SIZE) * Math.min(viewport.width, viewport.height) * 0.5;
}

function lineMetrics(shape: CanvasShape, viewport: CanvasViewport): { halfLength: number; thickness: number } {
  const diameter = radiusForShape(shape, viewport) * 2;
  return { halfLength: diameter * 0.78, thickness: clamp(diameter * 0.2, 10, 28) };
}

function penMetrics(shape: CanvasShape, viewport: CanvasViewport): { points: Point[]; lineWidth: number } {
  const radius = radiusForShape(shape, viewport);
  const sourcePoints = shape.points?.length ? shape.points : [{ x: 0, y: 0 }];
  return {
    points: sourcePoints.map((point) => ({ x: point.x * radius, y: point.y * radius })),
    lineWidth: clamp(radius * 0.16, 6, 24),
  };
}

function tracePolygon(context: CanvasRenderingContext2D, sides: number, radius: number, startAngle: number): void {
  context.beginPath();
  for (let index = 0; index < sides; index += 1) {
    const angle = startAngle + (index / sides) * TAU;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function traceTriangle(context: CanvasRenderingContext2D, radius: number): void {
  context.beginPath();
  context.moveTo(0, -radius * 1.05);
  context.lineTo(radius * 0.94, radius * 0.7);
  context.lineTo(-radius * 0.94, radius * 0.7);
  context.closePath();
}

function traceStar(context: CanvasRenderingContext2D, radius: number): void {
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const pointRadius = index % 2 === 0 ? radius : radius * 0.44;
    const angle = -Math.PI / 2 + (index / 10) * TAU;
    const x = Math.cos(angle) * pointRadius;
    const y = Math.sin(angle) * pointRadius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function traceStamp(context: CanvasRenderingContext2D, kind: StampShapeKind, radius: number): void {
  switch (kind) {
    case "circle":
      context.beginPath();
      context.arc(0, 0, radius, 0, TAU);
      return;
    case "triangle":
      traceTriangle(context, radius);
      return;
    case "square":
      context.beginPath();
      context.rect(-radius * 0.82, -radius * 0.82, radius * 1.64, radius * 1.64);
      return;
    case "diamond":
      tracePolygon(context, 4, radius, -Math.PI / 2);
      return;
    case "star":
      traceStar(context, radius);
      return;
    case "hexagon":
      tracePolygon(context, 6, radius, -Math.PI / 2);
      return;
    case "ring":
      context.beginPath();
      context.arc(0, 0, radius, 0, TAU, false);
      context.arc(0, 0, radius * 0.5, 0, TAU, true);
      context.closePath();
      return;
    case "line":
      context.beginPath();
  }
}

function drawDotPattern(context: CanvasRenderingContext2D, radius: number, ink: string, offset: number): void {
  const spacing = clamp(radius * 0.42, 9, 18);
  context.fillStyle = ink;
  context.globalAlpha = 0.25;
  for (let y = -radius - spacing; y <= radius + spacing; y += spacing) {
    for (let x = -radius - spacing; x <= radius + spacing; x += spacing) {
      const stagger = Math.floor((y + radius) / spacing) % 2 === 0 ? 0 : spacing / 2;
      context.beginPath();
      context.arc(x + stagger + offset * 0.18, y, clamp(radius * 0.075, 2, 4), 0, TAU);
      context.fill();
    }
  }
}

function drawStripePattern(context: CanvasRenderingContext2D, radius: number, ink: string, offset: number): void {
  const spacing = clamp(radius * 0.36, 9, 17);
  context.strokeStyle = ink;
  context.globalAlpha = 0.24;
  context.lineWidth = clamp(radius * 0.065, 2, 4);
  for (let start = -radius * 2 + offset; start < radius * 2; start += spacing) {
    context.beginPath();
    context.moveTo(start - radius, radius * 1.4);
    context.lineTo(start + radius, -radius * 1.4);
    context.stroke();
  }
}

function drawGridPattern(context: CanvasRenderingContext2D, radius: number, ink: string, offset: number): void {
  const spacing = clamp(radius * 0.43, 10, 20);
  context.strokeStyle = ink;
  context.globalAlpha = 0.2;
  context.lineWidth = clamp(radius * 0.05, 1.5, 3.5);
  for (let line = -radius * 1.5 + offset; line <= radius * 1.5; line += spacing) {
    context.beginPath();
    context.moveTo(line, -radius * 1.5);
    context.lineTo(line, radius * 1.5);
    context.stroke();
    context.beginPath();
    context.moveTo(-radius * 1.5, line);
    context.lineTo(radius * 1.5, line);
    context.stroke();
  }
}

function drawRingPattern(context: CanvasRenderingContext2D, radius: number, ink: string, offset: number): void {
  context.strokeStyle = ink;
  context.globalAlpha = 0.28;
  context.lineWidth = clamp(radius * 0.07, 2, 4);
  const turn = (offset / 12) * (Math.PI / 8);
  for (let index = 0; index < 16; index += 1) {
    const angle = turn + (index / 16) * TAU;
    context.beginPath();
    context.moveTo(Math.cos(angle) * radius * 0.61, Math.sin(angle) * radius * 0.61);
    context.lineTo(Math.cos(angle) * radius * 0.88, Math.sin(angle) * radius * 0.88);
    context.stroke();
  }
}

function drawStampPattern(context: CanvasRenderingContext2D, kind: StampShapeKind, radius: number, ink: string, offset: number): void {
  if (kind === "ring") drawRingPattern(context, radius, ink, offset);
  else if (kind === "square" || kind === "hexagon") drawGridPattern(context, radius, ink, offset);
  else if (kind === "triangle" || kind === "diamond") drawStripePattern(context, radius, ink, offset);
  else drawDotPattern(context, radius, ink, offset);
}

function drawLine(context: CanvasRenderingContext2D, shape: CanvasShape, theme: WorldTheme, viewport: CanvasViewport): void {
  const { halfLength, thickness } = lineMetrics(shape, viewport);
  context.strokeStyle = colorForShape(shape, theme);
  context.lineWidth = thickness;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(-halfLength, 0);
  context.lineTo(halfLength, 0);
  context.stroke();

  context.strokeStyle = theme.ink;
  context.globalAlpha = 0.28;
  context.lineWidth = Math.max(2, thickness * 0.12);
  const spacing = clamp(thickness * 0.95, 12, 22);
  const offset = patternOffset(shape.patternId) * 0.5;
  for (let x = -halfLength + spacing + offset; x < halfLength; x += spacing) {
    context.beginPath();
    context.moveTo(x, -thickness * 0.32);
    context.lineTo(x, thickness * 0.32);
    context.stroke();
  }
  context.globalAlpha = 0.32;
  context.lineWidth = Math.max(1.5, thickness * 0.08);
  context.beginPath();
  context.moveTo(-halfLength * 0.86, -thickness * 0.18);
  context.lineTo(halfLength * 0.86, -thickness * 0.18);
  context.stroke();
}

function drawPen(context: CanvasRenderingContext2D, shape: CanvasShape, theme: WorldTheme, viewport: CanvasViewport): void {
  const { points, lineWidth } = penMetrics(shape, viewport);
  const color = colorForShape(shape, theme);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (points.length <= 1) {
    const point = points[0] ?? { x: 0, y: 0 };
    context.beginPath();
    context.arc(point.x, point.y, lineWidth * 0.52, 0, TAU);
    context.fill();
    return;
  }
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    context.quadraticCurveTo(previous.x, previous.y, (previous.x + current.x) / 2, (previous.y + current.y) / 2);
  }
  const last = points[points.length - 1];
  context.lineTo(last.x, last.y);
  context.stroke();
}

function shapeLocalBounds(shape: CanvasShape, viewport: CanvasViewport): LocalBounds {
  const radius = radiusForShape(shape, viewport);
  if (shape.kind === "line") {
    const { halfLength, thickness } = lineMetrics(shape, viewport);
    return { left: -halfLength, right: halfLength, top: -thickness / 2, bottom: thickness / 2 };
  }
  if (shape.kind === "pen") {
    const { points, lineWidth } = penMetrics(shape, viewport);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const halfLine = lineWidth / 2;
    return {
      left: Math.min(...xs) - halfLine,
      right: Math.max(...xs) + halfLine,
      top: Math.min(...ys) - halfLine,
      bottom: Math.max(...ys) + halfLine,
    };
  }
  if (shape.kind === "triangle") {
    return { left: -radius * 0.94, right: radius * 0.94, top: -radius * 1.05, bottom: radius * 0.7 };
  }
  if (shape.kind === "square") {
    return { left: -radius * 0.82, right: radius * 0.82, top: -radius * 0.82, bottom: radius * 0.82 };
  }
  return { left: -radius, right: radius, top: -radius, bottom: radius };
}

function paddedSelectionBounds(shape: CanvasShape, viewport: CanvasViewport): LocalBounds {
  const bounds = shapeLocalBounds(shape, viewport);
  return {
    left: bounds.left - SELECTION_PADDING,
    right: bounds.right + SELECTION_PADDING,
    top: bounds.top - SELECTION_PADDING,
    bottom: bounds.bottom + SELECTION_PADDING,
  };
}

/** かんたん設定でも選択枠は残し、使えない回転・拡縮ハンドルだけを隠す。 */
function drawSelection(context: CanvasRenderingContext2D, shape: CanvasShape, theme: WorldTheme, viewport: CanvasViewport, allowTransforms = true): void {
  const bounds = paddedSelectionBounds(shape, viewport);
  const scalePoint = { x: bounds.right, y: bounds.bottom };
  const rotatePoint = { x: (bounds.left + bounds.right) / 2, y: bounds.top - ROTATE_HANDLE_GAP };
  context.save();
  context.globalAlpha = 1;
  context.shadowColor = "transparent";
  context.strokeStyle = theme.ink;
  context.fillStyle = theme.surface;
  context.lineWidth = 3;
  context.setLineDash([7, 6]);
  context.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
  context.setLineDash([]);
  if (!allowTransforms) {
    context.restore();
    return;
  }
  context.beginPath();
  context.moveTo(rotatePoint.x, bounds.top);
  context.lineTo(rotatePoint.x, rotatePoint.y);
  context.stroke();
  context.beginPath();
  context.arc(rotatePoint.x, rotatePoint.y, 9, 0, TAU);
  context.fill();
  context.stroke();
  context.fillStyle = theme.accent;
  context.beginPath();
  context.arc(scalePoint.x, scalePoint.y, 9, 0, TAU);
  context.fill();
  context.stroke();
  context.restore();
}

export function drawCanvasBackdrop(context: CanvasRenderingContext2D, viewport: CanvasViewport, theme: WorldTheme): void {
  context.save();
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, viewport.width, viewport.height);
  const spacing = clamp(Math.min(viewport.width, viewport.height) * 0.085, 34, 58);
  context.fillStyle = theme.ink;
  context.globalAlpha = 0.055;
  for (let y = spacing * 0.7; y < viewport.height; y += spacing) {
    for (let x = spacing * 0.7; x < viewport.width; x += spacing) {
      context.beginPath();
      context.arc(x, y, 1.5, 0, TAU);
      context.fill();
    }
  }
  context.restore();
}

export function renderShape(context: CanvasRenderingContext2D, shape: CanvasShape, theme: WorldTheme, viewport: CanvasViewport, options: RenderShapeOptions = {}): void {
  const center = toCanvasPoint(shape.position, viewport);
  const radius = radiusForShape(shape, viewport);
  const offset = patternOffset(shape.patternId);
  context.save();
  context.translate(center.x, center.y);
  context.rotate(shape.rotation);
  context.globalAlpha = options.disabled ? 0.62 : 1;
  context.shadowColor = "rgba(18, 20, 36, 0.16)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 5;
  if (shape.kind === "line") {
    drawLine(context, shape, theme, viewport);
  } else if (shape.kind === "pen") {
    drawPen(context, shape, theme, viewport);
  } else {
    context.fillStyle = colorForShape(shape, theme);
    context.strokeStyle = theme.ink;
    context.lineWidth = clamp(radius * 0.065, 2, 4);
    traceStamp(context, shape.kind, radius);
    context.fill(shape.kind === "ring" ? "evenodd" : "nonzero");
    context.shadowColor = "transparent";
    context.stroke();
    context.save();
    traceStamp(context, shape.kind, Math.max(1, radius - 2));
    context.clip(shape.kind === "ring" ? "evenodd" : "nonzero");
    drawStampPattern(context, shape.kind, radius, theme.ink, offset);
    context.restore();
  }
  context.shadowColor = "transparent";
  if (options.selected) drawSelection(context, shape, theme, viewport, options.allowTransforms);
  context.restore();
}

/** 選択状態と許可された編集ハンドルを各図形の描画へ渡す。 */
export function renderShapes(context: CanvasRenderingContext2D, shapes: readonly CanvasShape[], theme: WorldTheme, viewport: CanvasViewport, selectedId: string | null, disabled = false, allowTransforms = true): void {
  const orderedShapes = [...shapes].sort((left, right) => left.zIndex - right.zIndex);
  for (const shape of orderedShapes) {
    renderShape(context, shape, theme, viewport, { selected: shape.id === selectedId, disabled, allowTransforms });
  }
}

function pointInTriangle(point: Point, a: Point, b: Point, c: Point): boolean {
  const sign = (first: Point, second: Point, third: Point): number =>
    (first.x - third.x) * (second.y - third.y) - (second.x - third.x) * (first.y - third.y);
  const d1 = sign(point, a, b);
  const d2 = sign(point, b, c);
  const d3 = sign(point, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function polygonPoints(sides: number, radius: number, startAngle: number): Point[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = startAngle + (index / sides) * TAU;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

function starPoints(outerRadius: number, innerRadius: number): Point[] {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (index / 10) * TAU;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    const intersects = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

export function hitTestShape(shape: CanvasShape, point: Point, viewport: CanvasViewport): boolean {
  const local = localPoint(shape, point, viewport);
  const radius = radiusForShape(shape, viewport);
  const padding = 10;
  switch (shape.kind) {
    case "circle":
      return Math.hypot(local.x, local.y) <= radius + padding;
    case "triangle": {
      const expandedRadius = radius + padding;
      return pointInTriangle(local, { x: 0, y: -expandedRadius * 1.05 }, { x: expandedRadius * 0.94, y: expandedRadius * 0.7 }, { x: -expandedRadius * 0.94, y: expandedRadius * 0.7 });
    }
    case "line": {
      const { halfLength, thickness } = lineMetrics(shape, viewport);
      return Math.abs(local.x) <= halfLength + padding && Math.abs(local.y) <= Math.max(14, thickness * 0.5 + padding);
    }
    case "square": {
      const halfSide = radius * 0.82 + padding;
      return Math.abs(local.x) <= halfSide && Math.abs(local.y) <= halfSide;
    }
    case "diamond":
      return Math.abs(local.x) + Math.abs(local.y) <= radius + padding * Math.SQRT2;
    case "star":
      return pointInPolygon(local, starPoints(radius + padding, radius * 0.44 + padding * 0.45));
    case "hexagon":
      return pointInPolygon(local, polygonPoints(6, radius + padding, -Math.PI / 2));
    case "ring": {
      const distance = Math.hypot(local.x, local.y);
      return distance <= radius + padding && distance >= Math.max(0, radius * 0.5 - padding);
    }
    case "pen": {
      const { points, lineWidth } = penMetrics(shape, viewport);
      const hitRadius = lineWidth / 2 + padding;
      if (points.length <= 1) {
        const onlyPoint = points[0] ?? { x: 0, y: 0 };
        return Math.hypot(local.x - onlyPoint.x, local.y - onlyPoint.y) <= hitRadius;
      }
      return points.slice(1).some((end, index) => distanceToSegment(local, points[index], end) <= hitRadius);
    }
  }
}

export function getScaleHandlePoint(shape: CanvasShape, viewport: CanvasViewport): Point {
  const bounds = paddedSelectionBounds(shape, viewport);
  return canvasPointFromLocal(shape, { x: bounds.right, y: bounds.bottom }, viewport);
}

export function getRotateHandlePoint(shape: CanvasShape, viewport: CanvasViewport): Point {
  const bounds = paddedSelectionBounds(shape, viewport);
  return canvasPointFromLocal(shape, { x: (bounds.left + bounds.right) / 2, y: bounds.top - ROTATE_HANDLE_GAP }, viewport);
}

export function hitTestScaleHandle(shape: CanvasShape, point: Point, viewport: CanvasViewport): boolean {
  const handle = getScaleHandlePoint(shape, viewport);
  const canvasPoint = toCanvasPoint(point, viewport);
  return Math.hypot(handle.x - canvasPoint.x, handle.y - canvasPoint.y) <= 24;
}

export function hitTestRotateHandle(shape: CanvasShape, point: Point, viewport: CanvasViewport): boolean {
  const handle = getRotateHandlePoint(shape, viewport);
  const canvasPoint = toCanvasPoint(point, viewport);
  return Math.hypot(handle.x - canvasPoint.x, handle.y - canvasPoint.y) <= 24;
}

export function clampShapePosition(shape: CanvasShape, position: Point, viewport: CanvasViewport): Point {
  const bounds = shapeLocalBounds(shape, viewport);
  const corners: Point[] = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ];
  const cosine = Math.cos(shape.rotation);
  const sine = Math.sin(shape.rotation);
  let xExtent = 0;
  let yExtent = 0;
  for (const corner of corners) {
    xExtent = Math.max(xExtent, Math.abs(corner.x * cosine - corner.y * sine));
    yExtent = Math.max(yExtent, Math.abs(corner.x * sine + corner.y * cosine));
  }
  const xMargin = Math.min(0.45, xExtent / Math.max(1, viewport.width));
  const yMargin = Math.min(0.45, yExtent / Math.max(1, viewport.height));
  return { x: clamp(position.x, xMargin, 1 - xMargin), y: clamp(position.y, yMargin, 1 - yMargin) };
}

export function clampShapeSize(size: number): number {
  return clamp(size, MIN_SHAPE_SIZE, MAX_SHAPE_SIZE);
}
