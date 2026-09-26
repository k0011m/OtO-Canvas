import type {
  CanvasShape,
  MusicEvent,
  SceneIndex,
  VisualEventKind,
  WorldId,
} from "../types/project";
import { transposePentatonic, WORLD_TONICS } from "./scales";

export interface ColorSoundProfile {
  name: string;
  degreeOffset: number;
  durationScale: number;
  velocityScale: number;
}

const COLOR_SOUND: Readonly<Record<string, ColorSoundProfile>> = {
  sun: { name: "きらきら", degreeOffset: 2, durationScale: 0.78, velocityScale: 1.08 },
  coral: { name: "ぱわふる", degreeOffset: 0, durationScale: 0.72, velocityScale: 1.18 },
  ocean: { name: "ひびく", degreeOffset: -1, durationScale: 1.42, velocityScale: 0.9 },
  violet: { name: "ふしぎ", degreeOffset: 1, durationScale: 1.28, velocityScale: 0.86 },
  mint: { name: "さわやか", degreeOffset: 1, durationScale: 0.9, velocityScale: 0.94 },
  rose: { name: "やわらか", degreeOffset: 0, durationScale: 1.18, velocityScale: 0.82 },
  lime: { name: "はずむ", degreeOffset: 3, durationScale: 0.62, velocityScale: 1.04 },
  ink: { name: "ふかい", degreeOffset: -2, durationScale: 1.5, velocityScale: 0.88 },
};

const DEFAULT_COLOR_SOUND: ColorSoundProfile = {
  name: "すなお",
  degreeOffset: 0,
  durationScale: 1,
  velocityScale: 1,
};

export function colorSoundProfile(colorId: string): ColorSoundProfile {
  return COLOR_SOUND[colorId] ?? DEFAULT_COLOR_SOUND;
}

/** 場面数を範囲内に収め、旧作品は3場面として扱う。 */
export function normalizeSceneCount(count = 3): number {
  return Number.isFinite(count) ? Math.max(1, Math.min(10, Math.round(count))) : 3;
}

/** 30秒の拍位置から現在の場面を求め、最終拍は最後の場面に収める。 */
export function sceneForBeat(beat: number, count = 3): SceneIndex {
  const total = normalizeSceneCount(count);
  return Math.max(0, Math.min(total - 1, Math.floor((Number.isFinite(beat) ? beat : 0) * total / 48))) as SceneIndex;
}

export function shapesForScene(
  shapes: readonly CanvasShape[],
  scene: SceneIndex,
  count = 3,
): CanvasShape[] {
  const hasScenes = shapes.some((shape) => shape.scene !== undefined);
  if (!hasScenes) return [...shapes];

  const exact = shapes.filter((shape) => shape.scene === scene);
  if (exact.length > 0) return exact;

  // Empty pages continue the closest previous picture instead of turning the
  // 30-second piece silent. This also makes three-scene creation optional.
  for (let previous = scene - 1; previous >= 0; previous -= 1) {
    const fallback = shapes.filter((shape) => shape.scene === previous);
    if (fallback.length > 0) return fallback;
  }
  for (let next = scene + 1; next < normalizeSceneCount(count); next += 1) {
    const fallback = shapes.filter((shape) => shape.scene === next);
    if (fallback.length > 0) return fallback;
  }
  return [];
}

function distance(left: CanvasShape, right: CanvasShape): number {
  return Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y,
  );
}

function distanceToPen(shape: CanvasShape, pen: CanvasShape): number {
  const points = (pen.points ?? []).map((point) => ({
    x: pen.position.x + point.x * pen.size * 0.5,
    y: pen.position.y + point.y * pen.size * 0.5,
  }));
  if (points.length < 2) return distance(shape, pen);
  let shortest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1] as { x: number; y: number };
    const end = points[index] as { x: number; y: number };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const amount = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0,
      ((shape.position.x - start.x) * dx + (shape.position.y - start.y) * dy) / lengthSquared,
    ));
    shortest = Math.min(shortest, Math.hypot(
      shape.position.x - (start.x + dx * amount),
      shape.position.y - (start.y + dy * amount),
    ));
  }
  return shortest;
}

function cloneRelationEvent(
  source: MusicEvent,
  id: string,
  beat: number,
  worldId: WorldId,
  degreeOffset: number,
  visualEvent: VisualEventKind,
): MusicEvent | null {
  if (beat >= Math.floor(source.beat / 4) * 4 + 4 || beat >= 48) return null;
  const event: MusicEvent = {
    ...source,
    id,
    beat,
    durationBeats: Math.min(source.durationBeats * 0.82, 48 - beat),
    velocity: Math.min(0.72, source.velocity * 0.72),
    visualEvent,
  };
  if (source.midiNote !== undefined) {
    event.midiNote = transposePentatonic(
      source.midiNote,
      degreeOffset,
      WORLD_TONICS[worldId],
    );
  }
  return event;
}

/** Extra notes created by overlap, proximity, rings and pen-drawn sound paths. */
export function buildRelationshipEvents(
  shapes: readonly CanvasShape[],
  barEvents: readonly MusicEvent[],
  bar: number,
  worldId: WorldId,
): MusicEvent[] {
  if (shapes.length < 2 || barEvents.length === 0) return [];
  const extras: MusicEvent[] = [];
  const eventByShape = new Map<string, MusicEvent>();
  for (const event of barEvents) {
    if (!eventByShape.has(event.shapeId)) eventByShape.set(event.shapeId, event);
  }

  for (let leftIndex = 0; leftIndex < shapes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < shapes.length; rightIndex += 1) {
      const left = shapes[leftIndex] as CanvasShape;
      const right = shapes[rightIndex] as CanvasShape;
      const gap = distance(left, right);
      const overlap = gap < (left.size + right.size) * 0.34;
      const nearby = !overlap && gap < 0.22;
      const source = eventByShape.get(left.id) ?? eventByShape.get(right.id);
      if (!source) continue;

      if (overlap) {
        const harmony = cloneRelationEvent(
          source,
          `combo-${bar}-${left.id}-${right.id}`,
          source.beat,
          worldId,
          2,
          "orbit",
        );
        if (harmony) extras.push(harmony);
      } else if (nearby) {
        const echo = cloneRelationEvent(
          source,
          `friend-${bar}-${left.id}-${right.id}`,
          source.beat + 0.5,
          worldId,
          1,
          "wave",
        );
        if (echo) extras.push(echo);
      }
    }
  }

  for (const ring of shapes.filter((shape) => shape.kind === "ring")) {
    const inside = shapes.find(
      (shape) => shape.id !== ring.id && distance(ring, shape) < ring.size * 0.62,
    );
    const source = inside ? eventByShape.get(inside.id) : undefined;
    if (!inside || !source) continue;
    const echo = cloneRelationEvent(
      source,
      `ring-${bar}-${ring.id}-${inside.id}`,
      source.beat + 0.75,
      worldId,
      -1,
      "orbit",
    );
    if (echo) {
      echo.durationBeats = Math.min(1.5, echo.durationBeats * 1.45);
      extras.push(echo);
    }
  }

  for (const pen of shapes.filter((shape) => shape.kind === "pen" && (shape.points?.length ?? 0) > 1)) {
    const connected = shapes
      .filter((shape) => shape.id !== pen.id)
      .map((shape) => ({ shape, gap: distanceToPen(shape, pen) }))
      .filter(({ gap }) => gap < Math.max(0.08, pen.size * 0.38))
      .sort((a, b) => a.shape.position.x - b.shape.position.x)
      .slice(0, 4);
    connected.forEach(({ shape }, index) => {
      const source = eventByShape.get(shape.id);
      if (!source) return;
      const pathNote = cloneRelationEvent(
        source,
        `path-${bar}-${pen.id}-${shape.id}`,
        bar * 4 + 0.25 + index * 0.5,
        worldId,
        index,
        "wave",
      );
      if (pathNote) extras.push(pathNote);
    });
  }

  return extras;
}

export function relationshipCount(shapes: readonly CanvasShape[]): number {
  let count = 0;
  for (let left = 0; left < shapes.length; left += 1) {
    for (let right = left + 1; right < shapes.length; right += 1) {
      if (distance(shapes[left] as CanvasShape, shapes[right] as CanvasShape) < 0.22) count += 1;
    }
  }
  return count;
}
