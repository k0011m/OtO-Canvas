type IconName = "left" | "right" | "close" | "plus" | "minus" | "undo" | "redo" | "shuffle" | "trash" | "more" | "expand" | "collapse" | "pause" | "play";

/** 細い文字記号を使わず、端末のフォントに左右されない太い操作アイコンを描く。 */
export function ControlIcon({ name }: { name: IconName }) {
  const paths: Partial<Record<IconName, string>> = {
    close: "M6 6 L18 18 M18 6 L6 18", plus: "M12 5 V19 M5 12 H19", minus: "M5 12 H19",
    undo: "M9 5 L4 10 L9 15 M4 10 H14 A6 6 0 0 1 14 22",
    redo: "M15 5 L20 10 L15 15 M20 10 H10 A6 6 0 0 0 10 22",
    shuffle: "M4 6 H7 C12 6 12 18 17 18 H20 M17 15 L20 18 L17 21 M4 18 H7 C12 18 12 6 17 6 H20 M17 3 L20 6 L17 9",
    trash: "M4 6 H20 M9 6 V3 H15 V6 M6 6 L7 21 H17 L18 6 M10 10 V17 M14 10 V17",
    expand: "M9 3 H3 V9 M15 3 H21 V9 M3 15 V21 H9 M21 15 V21 H15",
    collapse: "M3 9 H9 V3 M21 9 H15 V3 M9 21 V15 H3 M15 21 V15 H21",
  };
  return <svg className="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    {paths[name] && <path d={paths[name]} />}
    {name === "left" && <path d="M18 3 L5 12 L18 21 Z" fill="currentColor" stroke="none" />}
    {(name === "right" || name === "play") && <path d="M6 3 L19 12 L6 21 Z" fill="currentColor" stroke="none" />}
    {name === "pause" && <path d="M8 5 V19 M16 5 V19" strokeWidth="5" />}
    {name === "more" && [5, 12, 19].map((x) => <circle key={x} cx={x} cy="12" r="2" fill="currentColor" stroke="none" />)}
  </svg>;
}
