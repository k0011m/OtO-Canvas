export interface OfflineState {
  status: "preparing" | "ready" | "error" | "unsupported" | "development";
  updateAvailable: boolean;
}
let state: OfflineState = { status: import.meta.env.DEV ? "development" : "preparing", updateAvailable: false };
const listeners = new Set<() => void>();
let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let currentRegistration: ServiceWorkerRegistration | null = null;

/** React側へ安定した参照の状態を渡す。 */
export function getOfflineState(): OfflineState { return state; }
/** 親設定の開閉にかかわらず登録の進行を共有する。 */
export function subscribeOffline(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** 必須ファイルの準備と更新待ちを別々に通知する。 */
function publish(patch: Partial<OfflineState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

/** 古いWorkerや応答不能時も画面を待たせ続けず、準備完了を誤表示しない。 */
function askWorker(worker: ServiceWorker, type: string): Promise<{ ready: boolean }> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => { channel.port1.close(); reject(new Error("Offline cache check timed out")); }, 8000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer); channel.port1.close();
      if (event.data?.error) reject(new Error("Offline cache unavailable"));
      else resolve({ ready: event.data?.ready === true });
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}

/** 初回・再訪・更新後に保存ファイルの実在を確認する。 */
export async function checkOfflineReady(): Promise<void> {
  const worker = currentRegistration?.active;
  if (!worker || worker.state !== "activated") return;
  try {
    const result = await askWorker(worker, "OFFLINE_STATUS");
    publish({ status: result.ready ? "ready" : "error" });
  } catch { publish({ status: "error" }); }
}

/** 保存を完了した新しい版は待機させ、編集中に勝手に再読み込みしない。 */
function watchWorker(worker: ServiceWorker): void {
  const update = () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) publish({ updateAvailable: true });
    if (worker.state === "activated") void checkOfflineReady();
    if (worker.state === "redundant" && state.status !== "ready") publish({ status: "error" });
  };
  worker.addEventListener("statechange", update);
  update();
}

/** 本番の全ファイル入りWorkerだけを登録し、開発用コードはキャッシュしない。 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registrationPromise) return registrationPromise;
  if (import.meta.env.DEV) return Promise.resolve(null);
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    publish({ status: "unsupported" }); return Promise.resolve(null);
  }
  registrationPromise = (async () => {
    try {
      const url = new URL("sw.js", new URL(import.meta.env.BASE_URL, window.location.href));
      const registration = await navigator.serviceWorker.register(url, { scope: new URL("./", url).pathname, updateViaCache: "none" });
      currentRegistration = registration;
      registration.addEventListener("updatefound", () => { if (registration.installing) watchWorker(registration.installing); });
      navigator.serviceWorker.addEventListener("controllerchange", () => { void checkOfflineReady(); });
      if (registration.installing) watchWorker(registration.installing);
      if (registration.waiting) publish({ updateAvailable: true });
      void checkOfflineReady();
      void registration.update().catch(() => { /* オフライン再訪は保存済みの版を使う。 */ });
      return registration;
    } catch {
      registrationPromise = null; publish({ status: "error" }); return null;
    }
  })();
  return registrationPromise;
}

/** 親の操作時だけ再取得を試し、接続復帰後の失敗したインストールをやり直す。 */
export async function retryOfflinePreparation(): Promise<void> {
  // 初回インストールが失敗した空の登録は、update()では復旧できないため登録し直す。
  if (currentRegistration && !currentRegistration.active && !currentRegistration.installing && !currentRegistration.waiting) registrationPromise = null;
  const registration = await registerServiceWorker();
  if (!registration) return;
  try {
    await registration.update();
    if (state.status !== "ready" && registration.active?.state === "activated" && !registration.waiting) await askWorker(registration.active, "REPAIR_SHELL");
    await checkOfflineReady();
  }
  catch { if (state.status !== "ready") publish({ status: "error" }); }
}

/** 呼び出し側で作品を永続保存した後、新版へ切り替えて再起動する。 */
export async function applyOfflineUpdate(): Promise<void> {
  const worker = currentRegistration?.waiting;
  if (!worker) throw new Error("更新を準備できていません。オンラインで再確認してください。");
  const result = await askWorker(worker, "OFFLINE_STATUS");
  if (!result.ready) throw new Error("更新に必要なファイルが不足しています。");
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
  worker.postMessage({ type: "SKIP_WAITING" });
}

/** 起動に必要な現行版は残し、旧キャッシュと再起動後の作業メモリだけ整理する。 */
export async function cleanAppCache(): Promise<void> {
  if (import.meta.env.PROD) {
    const registration = await registerServiceWorker();
    if (!registration?.active) throw new Error("Offline cache is not ready");
    const result = await askWorker(registration.active, "CLEAN_OLD_CACHES");
    if (!result.ready) throw new Error("Offline cache is not ready");
  } else if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("oto-canvas-shell-")).map((key) => caches.delete(key)));
  }
}
