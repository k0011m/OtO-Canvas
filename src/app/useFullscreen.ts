import { useCallback, useEffect, useState } from "react";

/** 全画面APIとEscによる解除を同期し、非対応端末では編集領域の拡大へ切り替える。 */
export function useFullscreen() {
  const [expanded, setExpanded] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    // ブラウザ側の終了操作もボタン表示へ反映する。
    const syncFullscreen = () => setExpanded(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  // クリックのユーザー操作権限を保ったまま全画面を要求し、非対応でも制作領域を広げる。
  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        setExpanded(Boolean(document.fullscreenElement));
      }
    } else if (expanded) {
      setExpanded(false);
    } else {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // iPhoneや埋め込み表示などでは、ブラウザ内で操作領域を広げる。
      }
      setExpanded(true);
    }
  }, [expanded]);
  return { expanded, toggleFullscreen };
}
