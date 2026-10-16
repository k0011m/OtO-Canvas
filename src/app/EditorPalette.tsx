import { useEffect, useRef, type ReactNode } from "react";

interface PaletteProps {
  side: "left" | "right";
  open: boolean;
  label: string;
  icon: ReactNode;
  onToggle: () => void;
  children: ReactNode;
}

/** 隅のボタンを固定したまま横へ展開し、収納中の項目にはフォーカスを入れない。 */
export function EditorPalette({ side, open, label, icon, onToggle, children }: PaletteProps) {
  const contents = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (contents.current) contents.current.inert = !open; }, [open]);
  return <div className={`editor-palette editor-palette--${side}`} data-open={open} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); toggle.current?.focus(); onToggle(); }
  }}>
    <button ref={toggle} className="palette-toggle" type="button" data-testid={side === "left" ? "tools-toggle" : "colors-toggle"}
      aria-label={`${label}を${open ? "しまう" : "開く"}`} aria-expanded={open} aria-controls={`palette-${side}`} onClick={onToggle}>
      {icon}
    </button>
    <div ref={contents} id={`palette-${side}`} className="palette-items" aria-hidden={!open} role="group" aria-label={`${label}を選ぶ`}>
      {children}
    </div>
  </div>;
}
