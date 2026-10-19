import { useCallback, useEffect, useRef, type RefObject } from "react";

export interface DraggedShapeArea {
  x: number;
  y: number;
  radius: number;
}

interface ControlArea {
  element: HTMLElement;
  bounds: DOMRect[];
  hidden: boolean;
}

/** ドラッグ開始時の位置で接近を判定し、退避アニメーションによる判定のちらつきを防ぐ。 */
export function useEditorControlAvoidance(root: RefObject<HTMLElement | null>) {
  const controls = useRef<ControlArea[] | null>(null);

  /** 終了・キャンセル・画面離脱では、収納前の開閉状態を保ったまま操作を戻す。 */
  const restore = useCallback(() => {
    for (const { element } of controls.current ?? []) {
      delete element.dataset.dragAvoid;
      element.inert = false;
    }
    controls.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("blur", restore);
    window.addEventListener("resize", restore);
    return () => {
      restore();
      window.removeEventListener("blur", restore);
      window.removeEventListener("resize", restore);
    };
  }, [restore]);

  /** 毎フレームのReact再描画を避け、接近状態が変わった操作要素だけを更新する。 */
  return useCallback((area: DraggedShapeArea | null) => {
    if (!area) { restore(); return; }
    if (!controls.current) {
      controls.current = Array.from(root.current?.querySelectorAll<HTMLElement>(
        ".editor-toolbar > button, .editor-palette",
      ) ?? []).map(element => {
        const parts = element.matches(".editor-palette")
          ? Array.from(element.querySelectorAll<HTMLElement>(element.dataset.open === "true"
            ? ".palette-toggle, .palette-items" : ".palette-toggle"))
          : [element];
        return { element, bounds: parts.map(part => part.getBoundingClientRect()), hidden: false };
      });
    }
    for (const control of controls.current) {
      // 復帰距離を少し広げ、境界付近で指が揺れても点滅させない。
      const distance = area.radius + (control.hidden ? 36 : 20);
      const hidden = control.bounds.some(rect => Math.hypot(
        area.x - Math.max(rect.left, Math.min(area.x, rect.right)),
        area.y - Math.max(rect.top, Math.min(area.y, rect.bottom)),
      ) < distance);
      if (hidden === control.hidden) continue;
      control.hidden = hidden;
      control.element.dataset.dragAvoid = String(hidden);
      control.element.inert = hidden;
    }
  }, [root, restore]);
}
