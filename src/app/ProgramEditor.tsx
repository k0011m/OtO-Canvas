import { ControlIcon } from "./ControlIcon";
import { useState } from "react";
import { MotionPreview } from "./MotionPreview";
import { ANIMATION_MOODS, MOOD_NAMES, type AnimationMood } from "../visuals/animationMood";
import { MAX_PROGRAM_MOVES, type MotionProgram } from "../visuals/motionProgram";

/** 大きな命令カードと前後ボタンで、ドラッグの精度を問わず順番と反復を編集する。 */
export function ProgramEditor({ program, fallback, seconds, onChange, onClose }: {
  program: MotionProgram | null; fallback: AnimationMood; seconds: number;
  onChange: (program: MotionProgram | null) => void; onClose: () => void;
}) {
  const value = program ?? { moves: [fallback], repeat: 1 };
  const [selected, setSelected] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const activeIndex = Math.min(selected, value.moves.length - 1);

  /** 入れ替えは命令そのものを動かし、選択も一緒に移す。 */
  const move = (index: number, delta: number) => {
    const moves = [...value.moves];
    [moves[index], moves[index + delta]] = [moves[index + delta], moves[index]];
    setSelected(index + delta); onChange({ ...value, moves });
  };

  return <div className="parent-overlay"><section className="parent-panel program-editor" role="dialog" aria-modal="true" aria-labelledby="program-title">
    <header><h2 id="program-title">みんなの プログラム</h2><button className="icon-button" aria-label="プログラムを閉じる" onClick={onClose}><ControlIcon name="close" /></button></header>
    <p>①から じゅんばんに うごくよ。カードを おすと うごきを かえられるよ。</p>
    <ol className="program-cards">
      {value.moves.map((mood, index) => <li key={index} data-testid={`program-step-${index}`}>
        <button className="program-command" aria-pressed={choosing && activeIndex === index} onClick={() => { setSelected(index); setChoosing(true); }}>
          <strong>{index + 1}</strong><MotionPreview mood={mood} /><span>{MOOD_NAMES[mood]}</span>
        </button>
        <div className="program-step-actions">
          <button aria-label={`${index + 1}番を前へ`} disabled={index === 0} onClick={() => move(index, -1)}><ControlIcon name="left" /></button>
          <button aria-label={`${index + 1}番を後ろへ`} disabled={index === value.moves.length - 1} onClick={() => move(index, 1)}><ControlIcon name="right" /></button>
          <button aria-label={`${index + 1}番を消す`} disabled={value.moves.length === 1} onClick={() => { onChange({ ...value, moves: value.moves.filter((_, i) => i !== index) }); setSelected(Math.max(0, index - 1)); setChoosing(false); }}><ControlIcon name="close" /></button>
        </div>
      </li>)}
    </ol>
    <button className="pill-button" aria-label="＋ めいれいを たす" disabled={value.moves.length >= MAX_PROGRAM_MOVES} onClick={() => { setSelected(value.moves.length); onChange({ ...value, moves: [...value.moves, fallback] }); setChoosing(true); }}><ControlIcon name="plus" /> めいれいを たす</button>
    {choosing && <div className="program-choices" role="group" aria-label={`${activeIndex + 1}番の動きを選ぶ`}>
      {ANIMATION_MOODS.map((mood) => <button key={mood} aria-pressed={value.moves[activeIndex] === mood} onClick={() => {
        onChange({ ...value, moves: value.moves.map((old, i) => i === activeIndex ? mood : old) }); setChoosing(false);
      }}><MotionPreview mood={mood} />{MOOD_NAMES[mood]}</button>)}
    </div>}
    <div className="program-repeat" role="group" aria-label="全体のくり返し回数"><strong>ぜんぶを くりかえす</strong>
      {[1, 2, 3].map((repeat) => <button key={repeat} aria-pressed={value.repeat === repeat} onClick={() => onChange({ ...value, repeat })}>{repeat}かい</button>)}
    </div>
    <p>1つの めいれいは {(seconds / value.moves.length / value.repeat).toFixed(1)}びょう。じゅんばんは そのまま、はやさは おまかせ。</p>
    <div className="camera-actions"><button className="pill-button" onClick={onClose}>できた</button><button className="pill-button" onClick={() => { onChange(null); setSelected(0); setChoosing(false); }}>うごき１つに もどす</button></div>
  </section></div>;
}
