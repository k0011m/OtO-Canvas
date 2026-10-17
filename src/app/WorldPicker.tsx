import { useState, type CSSProperties } from "react";
import { WORLDS, type WorldId } from "../types/project";
import { WorldEmblem, WorldShapes } from "./WorldIllustrations";
import { ControlIcon } from "./ControlIcon";

const WORLD_IDS: WorldId[] = ["soft", "bounce", "space"];

/** 一度目はその場で拡大して試聴し、選択中のカードをもう一度押したときだけ編集へ進む。 */
export function WorldPicker({ onPreview, onConfirm, onBack }: {
  onPreview: (id: WorldId) => void;
  onConfirm: (id: WorldId) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<WorldId | null>(null);
  return <section className="screen world-screen world-screen--redesign" aria-labelledby="world-title">
    <header className="screen-heading"><h2 id="world-title">どんな おとにする？</h2>
      <p aria-live="polite">{selected ? "えらんだものを もういちど おすと はじまるよ" : "ひとつ えらんで おとを きいてみよう"}</p>
    </header>
    <div className="world-carousel" data-selected={selected !== null}>
      {WORLD_IDS.map((id, index) => {
        const world = WORLDS[id];
        return <button key={id} className="world-choice" type="button" data-testid={`world-${id}`} data-slot={index}
          data-active={selected === id} aria-pressed={selected === id}
          aria-label={`${world.name}${selected === id ? "：もう一度押して決定" : "：音をためす"}`}
          style={{ "--card-bg": world.background, "--card-ink": world.ink } as CSSProperties}
          onClick={() => {
            if (selected === id) onConfirm(id);
            else { setSelected(id); onPreview(id); }
          }}>
          <WorldEmblem world={id} /><WorldShapes world={id} />
          <span className="world-choice-label"><strong>{world.name}</strong><small>{world.hint}</small></span>
          <span className="world-confirm-hint" aria-hidden="true">これにする <ControlIcon name="play" /></span>
        </button>;
      })}
    </div>
    <button className="quiet-button back-button" type="button" onClick={onBack}><ControlIcon name="left" />もどる</button>
  </section>;
}
