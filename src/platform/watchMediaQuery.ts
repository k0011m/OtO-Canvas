/** 古いSafari等でも画面幅・動きの設定変更を監視できるようにする。 */
export function watchMediaQuery(query: MediaQueryList, listener: () => void): () => void {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }
  query.addListener(listener);
  return () => query.removeListener(listener);
}
