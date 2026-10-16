import type { WorldId } from "../types/project";

/** 輪郭線を使わず、少ない淡い色と丸い面で音の世界を表す。 */
export function WorldEmblem({ world }: { world: WorldId }) {
  return <svg viewBox="0 0 160 140" aria-hidden="true" className={`world-emblem world-emblem--${world}`}>
    {world === "soft" ? <g>
      <ellipse cx="82" cy="119" rx="49" ry="7" fill="#dfb36f" opacity=".12" />
      <path d="M48 75 C26 70 23 39 44 30 C68 20 82 39 77 58 C88 56 106 61 121 70 Q132 62 137 65 C141 90 122 111 91 114 C57 119 34 102 41 83Z" fill="#f1d58a" />
      <path d="M32 49 Q21 49 13 54 Q7 63 33 65 Q42 62 41 58Z" fill="#dfb36f" />
      <circle cx="46" cy="45" r="3.2" fill="#756452" />
      <path d="M76 78 C89 71 108 74 110 84 C109 96 86 99 75 91 Q69 85 76 78Z" fill="#dfb36f" opacity=".3" />
    </g> : world === "bounce" ? <g>
      <g className="drum-body">
        <path d="M29 65 L30 107 C30 132 131 132 131 107 L132 65Z" fill="#dba6a3" />
        <path d="M47 78 Q48 96 55 111 M78 85 L80 116 M111 78 Q110 96 105 111" fill="none" stroke="#f5e8d4" strokeWidth="6" strokeLinecap="round" opacity=".65" />
        <ellipse cx="80" cy="66" rx="52" ry="20" fill="#f5e8d4" />
      </g>
      <g className="drum-stick" fill="#c7ad8b"><path d="M21 20 Q18 14 25 14 L76 52 Q83 59 76 63 Q71 66 67 59Z" /></g>
      <g className="drum-stick second" fill="#c7ad8b"><path d="M144 20 Q147 14 140 14 L92 50 Q85 57 92 61 Q97 64 101 57Z" /></g>
    </g> : <g transform="rotate(-20 80 72)">
      <ellipse cx="80" cy="74" rx="72" ry="23" fill="none" stroke="#cbb5d1" strokeWidth="12" opacity=".85" />
      <circle cx="80" cy="68" r="42" fill="#ead6ae" />
      <path d="M46 66 Q79 79 114 65 Q114 83 104 94 Q80 110 58 94 Q48 83 46 66Z" fill="#d9bd90" opacity=".3" />
      <path d="M8 74 C8 105 152 105 152 74" fill="none" stroke="#cbb5d1" strokeWidth="12" strokeLinecap="round" />
    </g>}
  </svg>;
}

/** 楽器の従来モチーフを保ち、ほかの世界には重複しない種類の図形を割り当てる。 */
export function WorldShapes({ world }: { world: WorldId }) {
  return <svg viewBox="0 0 240 190" className={`world-shapes world-shapes--${world}`} aria-hidden="true">
    {world === "bounce" ? <>
      <circle cx="63" cy="61" r="37" fill="#f7a425" />
      <path d="M163 37 L202 111 H124Z" fill="#f25c79" />
      <path d="M56 156 L202 132" stroke="#50bdb2" strokeWidth="15" strokeLinecap="round" />
    </> : world === "soft" ? <>
      <rect x="34" y="26" width="67" height="67" rx="16" fill="#e8ac53" transform="rotate(-9 67 60)" />
      <path d="M171 46 L211 87 L171 128 L131 87Z" fill="#dc899d" />
      <path d="M59 117 L88 101 L117 117 V151 L88 168 L59 151Z" fill="#66a9ae" />
    </> : <>
      <path d="M67 22 L79 50 L109 53 L86 73 L93 103 L67 87 L40 103 L47 73 L24 53 L55 50Z" fill="#f4ce70" />
      <circle cx="172" cy="104" r="39" fill="none" stroke="#85cbdf" strokeWidth="13" />
      <path d="M41 153 Q65 115 82 151 T128 155" fill="none" stroke="#cf94c5" strokeWidth="11" strokeLinecap="round" />
    </>}
  </svg>;
}

/** 記念写真の入口に使う、肌の色を表さない黄色で全端末共通のピースイラスト。 */
export function PeaceIllustration() {
  return <svg className="peace-illustration" viewBox="0 0 140 150" aria-hidden="true">
    <path d="M49 85 L37 29 Q34 15 45 13 Q56 11 59 25 L70 67 L80 23 Q83 10 94 14 Q104 17 100 30 L90 82 Q111 83 114 103 Q116 128 91 139 Q65 149 44 131 Q30 121 29 103 L27 82 Q26 70 37 69 Q47 69 48 80Z" fill="#ffda38" stroke="#8b710e" strokeWidth="6" strokeLinejoin="round" />
    <path d="M49 83 Q47 64 59 64 Q70 64 72 82 L73 97 Q72 107 63 106 Q53 106 51 96Z" fill="#ffda38" stroke="#8b710e" strokeWidth="6" />
    <path d="M29 85 Q27 73 38 73 Q48 73 49 85 L51 98 Q51 109 42 110 Q31 111 30 101Z" fill="#ffda38" stroke="#8b710e" strokeWidth="6" />
    <path d="M109 112 Q102 90 82 89 Q70 88 69 98 Q68 106 80 109 L89 115 M80 109 Q65 114 60 128" fill="#ffda38" stroke="#8b710e" strokeWidth="6" strokeLinecap="round" />
    <path d="M16 35 L8 27 M116 46 L127 41" stroke="#edbe17" strokeWidth="5" strokeLinecap="round" />
  </svg>;
}

/** 広がった絵具の水滴を描き、塗る道具ではなく色そのものを表す。 */
export function PaintDrop({ color }: { color: string }) {
  return <svg viewBox="0 0 56 56" aria-hidden="true" className="paint-drop">
    <path d="M18 16 C12 8 6 12 10 21 C12 25 3 25 4 32 C5 38 15 34 17 39 C18 48 24 49 28 42 C31 37 36 49 42 44 C48 40 39 34 44 31 C54 28 52 21 43 22 C36 24 42 12 35 10 C28 8 29 20 24 20 C22 20 20 18 18 16Z" fill={color} />
    <circle cx="47" cy="12" r="3" fill={color} />
    <circle cx="8" cy="45" r="2.5" fill={color} />
    <path d="M18 27 Q22 22 28 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".5" />
  </svg>;
}
