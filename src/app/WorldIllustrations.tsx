import type { WorldId } from "../types/project";

/** フォントや絵文字に依存しない、音の世界を表す小さなイラスト。 */
export function WorldEmblem({ world }: { world: WorldId }) {
  return <svg viewBox="0 0 160 140" aria-hidden="true" className={`world-emblem world-emblem--${world}`}>
    {world === "soft" ? <g stroke="#754c26" strokeWidth="3" strokeLinejoin="round">
      <ellipse cx="85" cy="119" rx="62" ry="10" fill="#8acdd1" stroke="none" opacity=".55" />
      <path d="M48 75 C26 70 23 39 44 30 C68 20 82 39 77 58 C88 56 106 61 121 70 L139 59 C144 89 124 111 91 114 C57 119 34 102 41 83Z" fill="#f6c34d" />
      <path d="M31 47 L10 54 Q9 63 33 66 L42 59Z" fill="#e98b43" />
      <circle cx="46" cy="45" r="4" fill="#3b302b" stroke="none" />
      <circle cx="54" cy="62" r="7" fill="#ed9c66" stroke="none" opacity=".65" />
      <path d="M76 77 Q109 64 114 86 Q96 104 73 91" fill="#edac35" stroke="none" />
      <path d="M39 122 Q60 128 79 122 M109 124 L131 124" fill="none" stroke="#59aeb8" strokeLinecap="round" />
    </g> : world === "bounce" ? <g stroke="#57423d" strokeWidth="3" strokeLinejoin="round">
      <g className="drum-body"><path d="M28 64 L29 109 Q80 140 132 108 L132 64" fill="#db7373" />
      <path d="M35 76 L49 118 L65 82 L80 124 L96 82 L112 119 L126 75" fill="none" stroke="#fff1d2" strokeWidth="5" />
      <ellipse cx="80" cy="66" rx="53" ry="20" fill="#fff4db" />
      <path d="M28 103 Q80 133 132 103" fill="none" stroke="#e6b74f" strokeWidth="8" />
      <ellipse cx="80" cy="66" rx="53" ry="20" fill="none" stroke="#e6b74f" strokeWidth="7" /></g>
      <g className="drum-stick"><path d="M24 17 L72 56" stroke="#a77443" strokeWidth="8" strokeLinecap="round" /><ellipse cx="73" cy="57" rx="9" ry="6" fill="#ebcc99" transform="rotate(38 73 57)" /></g>
      <g className="drum-stick second"><path d="M141 17 L96 54" stroke="#a77443" strokeWidth="8" strokeLinecap="round" /><ellipse cx="95" cy="55" rx="9" ry="6" fill="#ebcc99" transform="rotate(-38 95 55)" /></g>
      <path d="M74 30 L72 22 M88 28 L94 19" stroke="#d49e38" strokeLinecap="round" />
    </g> : <g transform="rotate(-16 80 70)">
      <defs><clipPath id="jupiter-disc"><circle cx="80" cy="72" r="51" /></clipPath></defs>
      <circle cx="80" cy="72" r="51" fill="#e6ba8b" />
      <g clipPath="url(#jupiter-disc)" fill="none" strokeLinecap="round">
        <path d="M21 40 Q65 55 138 40 M18 68 Q75 83 140 65 M22 100 Q77 115 139 95" stroke="#ae765e" strokeWidth="12" />
        <path d="M23 53 Q87 68 140 52 M20 87 Q78 103 137 84 M41 116 L125 115" stroke="#fff0cc" strokeWidth="8" />
        <ellipse cx="103" cy="89" rx="17" ry="9" fill="#b76955" stroke="#d88d64" strokeWidth="4" />
      </g>
      <circle cx="80" cy="72" r="51" fill="none" stroke="#896b72" strokeWidth="2" />
      <path d="M17 27 V39 M11 33 H23 M141 106 V116 M136 111 H146" stroke="#efd69a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="135" cy="25" r="3" fill="#a8d2df" />
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

/** 記念写真の入口に使う、全端末で同じ形のピースイラスト。 */
export function PeaceIllustration() {
  return <svg className="peace-illustration" viewBox="0 0 140 150" aria-hidden="true">
    <path d="M49 85 L37 29 Q34 15 45 13 Q56 11 59 25 L70 67 L80 23 Q83 10 94 14 Q104 17 100 30 L90 82 Q111 83 114 103 Q116 128 91 139 Q65 149 44 131 Q30 121 29 103 L27 82 Q26 70 37 69 Q47 69 48 80Z" fill="#f0ca8d" stroke="#654f42" strokeWidth="6" strokeLinejoin="round" />
    <path d="M49 83 Q47 64 59 64 Q70 64 72 82 L73 97 Q72 107 63 106 Q53 106 51 96Z" fill="#f0ca8d" stroke="#654f42" strokeWidth="6" />
    <path d="M29 85 Q27 73 38 73 Q48 73 49 85 L51 98 Q51 109 42 110 Q31 111 30 101Z" fill="#f0ca8d" stroke="#654f42" strokeWidth="6" />
    <path d="M109 112 Q102 90 82 89 Q70 88 69 98 Q68 106 80 109 L89 115 M80 109 Q65 114 60 128" fill="#f0ca8d" stroke="#654f42" strokeWidth="6" strokeLinecap="round" />
    <path d="M16 35 L8 27 M116 46 L127 41" stroke="#dba34c" strokeWidth="5" strokeLinecap="round" />
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
