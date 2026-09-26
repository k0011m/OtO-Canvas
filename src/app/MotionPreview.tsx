import { useEffect, useId, useState } from "react";
import type { AnimationMood } from "../visuals/animationMood";

export const MOTION_HINTS: Record<AnimationMood, string> = {
  float: "ふわふわ ゆれる", pop: "ぱっと はじける", cosmic: "まるく まわる",
  wave: "なみのように うねる", march: "ならんで すすむ", spiral: "うずを えがく",
  breathe: "おおきく、ちいさく", swing: "ふりこのように ゆれる", zigzag: "おれまがって すすむ",
  gather: "まんなかに あつまる", scatter: "そとへ ひろがる", rise: "うえへ のぼる",
  rain: "ひらひら したへ", figure8: "８のじを えがく", carousel: "みんなで わに なって まわる",
};

type Example = { paths: string[]; points: [number, number][] };
const EXAMPLES: Record<AnimationMood, Example> = {
  float: { paths: ["M45 85 Q15 55 45 30 Q75 55 45 85", "M155 110 Q190 75 155 45 Q125 75 155 110"], points: [[45, 85], [155, 45]] },
  pop: { paths: ["M120 75 L48 30", "M120 75 L195 30", "M120 75 L195 122", "M120 75 L48 122"], points: [[48, 30], [195, 30], [195, 122], [48, 122]] },
  cosmic: { paths: ["M175 75 A55 50 0 1 1 65 75 A55 50 0 1 1 175 75"], points: [[175, 75], [65, 75], [120, 25]] },
  wave: { paths: ["M18 80 C40 10 65 10 90 80 S140 145 160 80 S195 10 222 80"], points: [[48, 30], [120, 125], [195, 30]] },
  march: { paths: ["M25 80 L210 80"], points: [[40, 80], [90, 80], [140, 80]] },
  spiral: { paths: ["M208 110 C250 10 65 -5 40 60 C5 150 195 165 180 80 C170 25 70 35 83 90 C94 126 150 110 139 75 C134 62 115 68 120 82"], points: [[208, 110], [40, 60], [120, 82]] },
  breathe: { paths: [], points: [] },
  swing: { paths: ["M53 94 Q120 155 187 94 Q120 155 53 94"], points: [[53, 94], [120, 124], [187, 94]] },
  zigzag: { paths: ["M20 115 L65 35 L110 115 L155 35 L200 115 L223 75"], points: [[20, 115], [110, 115], [200, 115]] },
  gather: { paths: ["M30 28 L99 62", "M210 28 L141 62", "M30 125 L99 88", "M210 125 L141 88"], points: [[30, 28], [210, 28], [30, 125], [210, 125]] },
  scatter: { paths: ["M99 62 L30 28", "M141 62 L210 28", "M99 88 L30 125", "M141 88 L210 125"], points: [[99, 62], [141, 62], [99, 88], [141, 88]] },
  rise: { paths: ["M55 125 Q35 75 55 25", "M120 125 Q100 75 120 25", "M185 125 Q165 75 185 25"], points: [[55, 100], [120, 70], [185, 40]] },
  rain: { paths: ["M40 20 Q90 50 40 80 Q10 105 55 130", "M155 20 Q205 50 155 80 Q125 105 170 130"], points: [[40, 20], [40, 80], [170, 130]] },
  figure8: { paths: ["M120 75 C20 -50 0 175 120 75 C240 -25 220 175 120 75"], points: [[52, 75], [120, 75], [188, 75]] },
  carousel: { paths: ["M200 85 A80 40 0 1 1 40 85 A80 40 0 1 1 200 85"], points: [[40, 85], [120, 45], [200, 85], [120, 125]] },
};

/** 静止時にも軌道と配置で違いが伝わる見本。色付きの図形が指示の方向へ進む。 */
export function MotionPreview({ mood }: { mood: AnimationMood }) {
  const arrow = useId().replace(/:/g, "");
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const example = EXAMPLES[mood];
  return <span className="mood-preview motion-diagram" data-motion={mood} aria-hidden="true">
    <svg viewBox="0 0 240 160" focusable="false">
      <defs><marker id={arrow} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 L6 3.5 L0 7" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
      {mood === "march" && <path className="motion-scenery" d="M20 118 H220 M40 112 v12 M90 112 v12 M140 112 v12 M190 112 v12" />}
      {mood === "swing" && <path className="motion-scenery" d="M53 94 L120 18 L187 94 M120 18 V124" />}
      {mood === "carousel" && <path className="motion-scenery" d="M40 85 L120 25 L200 85 M120 25 V125 M70 50 Q120 5 170 50 Z" />}
      {mood === "pop" && <path className="motion-burst" d="M120 47 L128 62 L146 60 L137 76 L146 91 L128 88 L120 105 L112 88 L94 91 L103 76 L94 60 L112 62 Z" />}
      {(mood === "gather" || mood === "scatter") && <circle className="motion-scenery" cx="120" cy="75" r="30" strokeDasharray="4 5" />}
      {mood === "breathe" && <>
        <circle className="motion-scenery" cx="120" cy="80" r="59" strokeDasharray="5 6" />
        <circle className="motion-scenery" cx="120" cy="80" r="36" />
        <path className="motion-route" d="M45 80 H20 M195 80 H220" markerEnd={`url(#${arrow})`} />
        <circle className="motion-token" cx="120" cy="80" r="22" fill="var(--mood-a)">
          {!reduced && <animate attributeName="r" values="22;54;22" dur="3s" repeatCount="indefinite" />}
        </circle>
      </>}
      {example.paths.map((path, index) => <path key={index} className="motion-route" d={path} markerEnd={`url(#${arrow})`} />)}
      {example.points.map(([x, y], index) => <g key={index} transform={`translate(${x} ${y})`} className="motion-sample" fill={`var(--mood-${["a", "b", "c"][index % 3]})`}>
        {mood === "rain" ? <path d="M-12 -8 Q12 -15 12 8 Q-12 15 -12 -8" /> : index % 2 === 0 ? <circle r="12" /> : <rect x="-11" y="-11" width="22" height="22" rx="4" />}
      </g>)}
      {!reduced && example.paths.map((path, index) => <g key={index} className="motion-token" fill={`var(--mood-${["b", "c", "a"][index % 3]})`}>
        <animateMotion path={path} dur={mood === "pop" ? "1.7s" : "4s"} repeatCount="indefinite" begin={`${-index * .7}s`} />
        <rect x="-9" y="-9" width="18" height="18" rx={mood === "rain" ? 1 : 5} />
      </g>)}
    </svg>
  </span>;
}
