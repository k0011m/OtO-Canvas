import type { OtoProject } from "../types/project";
import { isOtoProject } from "../storage/projectStore";

export const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024;

/** ダウンロード用URLは使い終わったら解放し、写真などをメモリに残し続けない。 */
export function downloadFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 再生成できる音符を除き、絵・音世界・シード・全場面を専用JSON形式で保存する。 */
export function serializeProject(project: OtoProject): string {
  return JSON.stringify({ format: "otocanvas", fileVersion: 1, project: { ...project, events: [] } }, null, 2);
}

/** 外部ファイルは版・型・数量・座標を検証し、不正なデータを作品棚へ入れない。 */
export function parseProjectFile(text: string): OtoProject {
  if (new TextEncoder().encode(text).length > MAX_PROJECT_FILE_BYTES) throw new Error("ファイルは10MB以下にしてください。");
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("作品ファイルのJSONが壊れています。"); }
  if (data?.format !== "otocanvas" || data?.fileVersion !== 1) throw new Error("未対応の作品ファイル形式です。");
  const project = data.project;
  if (!isOtoProject(project) || project.shapes.length > 500 || project.events.length > 20000) throw new Error("作品データの形式が正しくありません。");
  const ids = new Set<string>();
  const counts = Array(10).fill(0);
  for (const shape of project.shapes) {
    if (ids.has(shape.id) || shape.id.length > 200 || ++counts[shape.scene ?? 0] > 50 ||
      shape.position.x < 0 || shape.position.x > 1 || shape.position.y < 0 || shape.position.y > 1 ||
      shape.size < .01 || shape.size > 1 || Math.abs(shape.rotation) > 100000 ||
      shape.colorId.length > 100 || shape.patternId.length > 100 ||
      (shape.points && (shape.points.length > 20000 || shape.points.some((p) => Math.abs(p.x) > 100 || Math.abs(p.y) > 100)))) {
      throw new Error("図形の数や位置に読み込めないデータがあります。");
    }
    ids.add(shape.id);
  }
  // 未知の追加フィールドは取り込まず、カメラ設定や写真を作品ファイル経由で復元しない。
  return {
    version: 1, id: project.id, title: (project.title ?? "わたしのおと").slice(0, 32),
    createdAt: project.createdAt, updatedAt: project.updatedAt, seed: project.seed,
    worldId: project.worldId, bpm: 96, bars: 12, sceneCount: project.sceneCount,
    sceneMoods: project.sceneMoods?.slice(), events: [],
    shapes: project.shapes.map((s) => ({ id: s.id, kind: s.kind, position: { ...s.position }, size: s.size,
      rotation: s.rotation, colorId: s.colorId, patternId: s.patternId, zIndex: s.zIndex, scene: s.scene,
      points: s.points?.map((p) => ({ x: p.x, y: p.y })) })),
  };
}
