import type { MusicEvent, OtoProject } from "../types/project";

export interface PreparedPerformance {
  events: MusicEvent[];
  mixedEvents: MusicEvent[];
}

/** 中止・失敗・完了のいずれでもWorkerを解放し、古い要求が再生を開始しないようにする。 */
export function preparePerformance(project: OtoProject, signal: AbortSignal): Promise<PreparedPerformance> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
    const worker = new Worker(new URL("./preparePerformance.worker.ts", import.meta.url), { type: "module" });
    /** 作曲用スレッドと待機タイマーを残さない。 */
    const cleanup = () => { worker.terminate(); clearTimeout(timeout); signal.removeEventListener("abort", abort); };
    /** 中止後は結果を受け取らず、呼び出し元へ終了を通知する。 */
    const abort = () => { cleanup(); reject(new DOMException("Cancelled", "AbortError")); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error("作曲が時間内に完了しませんでした")); }, 60000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }: MessageEvent<PreparedPerformance & { error?: string }>) => {
      cleanup();
      if (data.error) reject(new Error(data.error)); else resolve(data);
    };
    worker.onerror = () => { cleanup(); reject(new Error("作曲処理を開始できませんでした")); };
    try { worker.postMessage(project); } catch (error) { cleanup(); reject(error); }
  });
}
