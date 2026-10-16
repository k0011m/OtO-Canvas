import { useEffect, useRef } from "react";
import { ControlIcon } from "./ControlIcon";

/** ブラウザ標準の小さな確認ではなく、中央の大きな確認で誤消去を防ぐ。 */
export function ClearCanvasDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); return () => { ref.current?.close(); }; }, []);
  return <dialog ref={ref} className="clear-canvas-dialog" aria-labelledby="clear-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <div className="clear-illustration"><ControlIcon name="trash" /></div>
    <h2 id="clear-title">ぜんぶ けす？</h2>
    <p>この ばめんの かたちが なくなるよ</p>
    <div className="clear-actions">
      <button type="button" className="pill-button" autoFocus onClick={onCancel}>やめる</button>
      <button type="button" className="pill-button clear-confirm" onClick={onConfirm}><ControlIcon name="trash" />けす</button>
    </div>
  </dialog>;
}
