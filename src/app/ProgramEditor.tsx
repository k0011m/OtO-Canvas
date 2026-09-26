import { useEffect, useRef, useState } from "react";
import { ControlIcon } from "./ControlIcon";
import { MotionPreview } from "./MotionPreview";
import { ANIMATION_MOODS, MOOD_NAMES, type AnimationMood } from "../visuals/animationMood";
import { MAX_PROGRAM_MOVES, type MotionProgram } from "../visuals/motionProgram";
import { PerformanceCanvas } from "../visuals/PerformanceCanvas";
import { WORLDS, type CanvasShape, type WorldId } from "../types/project";

/** 言葉を読まなくても開始・反復・完了を区別できる太い絵記号。 */
function ProgramSymbol({ kind }: { kind: "flag" | "repeat" | "done" | "group" }) {
  return <svg viewBox="0 0 48 48" className="program-symbol" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    {kind === "flag" && <path d="M12 40 V8 Q22 2 30 8 T42 8 V28 Q32 34 24 28 T12 28" />}
    {kind === "repeat" && <><path d="M38 18 A16 16 0 1 0 39 32 M38 7 V18 H27" /><path d="M38 18 L29 10" /></>}
    {kind === "done" && <path d="M9 25 L20 36 L40 12" />}
    {kind === "group" && <><circle cx="12" cy="16" r="6" fill="#efbb4d" /><path d="M33 9 L43 26 H23 Z" fill="#e58197" /><rect x="12" y="29" width="13" height="13" rx="3" fill="#76c5c8" /></>}
  </svg>;
}

/** 絵のブロックをつなぎ、本番と同じ時間配分で実際の図形を試せる全画面編集画面。 */
export function ProgramEditor({ program, fallback, seconds, shapes, world, onChange, onClose }: {
  program: MotionProgram | null; fallback: AnimationMood; seconds: number;
  shapes: CanvasShape[]; world: WorldId;
  onChange: (program: MotionProgram | null) => void; onClose: () => void;
}) {
  const value = program ?? { moves: [fallback], repeat: 1 };
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const dragIndex = useRef<number | null>(null);
  const activeIndex = Math.min(selected, value.moves.length - 1);
  const stepSeconds = seconds / value.moves.length / value.repeat;
  const position = Math.min(value.moves.length * value.repeat - 1, Math.floor(elapsed / stepSeconds));
  const playingIndex = position % value.moves.length;
  const mood = value.moves[playing ? playingIndex : activeIndex];

  // 画面を閉じる・編集するたびに試演を止め、古い命令のタイマーを残さない。
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const start = performance.now();
    /** 実時間から命令と反復の位置を計算し、場面の長さで試演を終了する。 */
    const tick = (now: number) => {
      const time = Math.min(seconds, (now - start) / 1000);
      setElapsed(time);
      if (time >= seconds) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, seconds]);

  /** 編集結果を既存の作品保存へ渡し、実行中の表示を編集状態へ戻す。 */
  function change(next: MotionProgram | null) { setPlaying(false); setElapsed(0); onChange(next); }

  /** ドラッグとボタンで同じ並べ替えを使い、配列の範囲外への移動を防ぐ。 */
  function move(from: number, to: number) {
    if (from < 0 || to < 0 || from >= value.moves.length || to >= value.moves.length || from === to) return;
    const moves = [...value.moves];
    moves.splice(to, 0, moves.splice(from, 1)[0]);
    setSelected(to); change({ ...value, moves });
  }

  return <section className="block-editor" role="dialog" aria-modal="true" aria-labelledby="program-title">
    <header className="block-editor-header">
      <button className="icon-button" autoFocus aria-label="プログラムを閉じる" onClick={onClose}><ControlIcon name="left" /></button>
      <h2 id="program-title">プログラム</h2>
      <button className="block-done" aria-label="できた" onClick={onClose}><ProgramSymbol kind="done" /></button>
    </header>
    <div className="block-editor-body">
      <aside className="block-palette" role="group" aria-label={`${activeIndex + 1}番の動きを選ぶ`}>
        {ANIMATION_MOODS.map((choice) => <button key={choice} className="puzzle-block palette-block" aria-label={MOOD_NAMES[choice]} aria-pressed={value.moves[activeIndex] === choice}
          onClick={() => change({ ...value, moves: value.moves.map((old, i) => i === activeIndex ? choice : old) })}>
          <MotionPreview mood={choice} />
        </button>)}
      </aside>
      <div className="block-workspace">
        <div className="block-start" aria-label="ここから全ての図形が動く"><ProgramSymbol kind="flag" /><ProgramSymbol kind="group" /></div>
        <div className="block-loop">
          <div className="block-loop-header" role="group" aria-label="全体のくり返し回数">
            <ProgramSymbol kind="repeat" />
            {[1, 2, 3].map((repeat) => <button key={repeat} aria-label={`${repeat}かい`} aria-pressed={value.repeat === repeat} onClick={() => change({ ...value, repeat })}>{repeat}</button>)}
          </div>
          <ol className="block-stack" aria-label="動きの順番">
            {value.moves.map((item, index) => <li key={index} data-testid={`program-step-${index}`} aria-current={playing && index === playingIndex ? "step" : undefined}
              className="puzzle-block" data-selected={index === activeIndex} draggable
              onDragStart={(event) => { dragIndex.current = index; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }}
              onDragOver={(event) => event.preventDefault()} onDragEnd={() => { dragIndex.current = null; }}
              onDrop={(event) => { event.preventDefault(); if (dragIndex.current !== null) move(dragIndex.current, index); dragIndex.current = null; }}>
              <button className="program-command" aria-label={`${index + 1}番：${MOOD_NAMES[item]}`} aria-pressed={index === activeIndex}
                onClick={() => { setPlaying(false); setSelected(index); }}><b>{index + 1}</b><MotionPreview mood={item} /></button>
              <div className="program-step-actions">
                <button aria-label={`${index + 1}番を前へ`} disabled={index === 0} onClick={() => move(index, index - 1)}><span className="block-up"><ControlIcon name="left" /></span></button>
                <button aria-label={`${index + 1}番を後ろへ`} disabled={index === value.moves.length - 1} onClick={() => move(index, index + 1)}><span className="block-up"><ControlIcon name="right" /></span></button>
                <button aria-label={`${index + 1}番を消す`} disabled={value.moves.length === 1} onClick={() => { change({ ...value, moves: value.moves.filter((_, i) => i !== index) }); setSelected(Math.max(0, index - 1)); }}><ControlIcon name="trash" /></button>
              </div>
            </li>)}
          </ol>
          <button className="block-add" aria-label="＋ めいれいを たす" disabled={value.moves.length >= MAX_PROGRAM_MOVES} onClick={() => { setSelected(value.moves.length); change({ ...value, moves: [...value.moves, fallback] }); }}><ControlIcon name="plus" /><small>{value.moves.length}/{MAX_PROGRAM_MOVES}</small></button>
        </div>
        <button className="icon-button block-reset" aria-label="うごき１つに もどす" onClick={() => { change(null); setSelected(0); }}><ControlIcon name="undo" /></button>
      </div>
      <aside className="block-stage-panel">
        <div className="block-stage">
          {/* 登場演出で図形が消えない構図を固定し、命令の経過時間だけを進める。 */}
          <PerformanceCanvas shapes={shapes} theme={WORLDS[world]} beat={12} section="a" animationMood={mood}
            motionSeconds={playing ? elapsed - position * stepSeconds : 0} playing={playing} ariaLabel="プログラムの動きを試す作品" />
          {!shapes.length && <span className="block-empty"><ProgramSymbol kind="group" /></span>}
        </div>
        <div className="block-stage-controls">
          <button className="block-run" aria-label={playing ? "試演を止める" : "プログラムを試す"} disabled={!shapes.length} onClick={() => { setElapsed(0); setPlaying(!playing); }}><ControlIcon name={playing ? "pause" : "play"} /></button>
          <span aria-label="場面の秒数">{seconds.toFixed(0)}s</span>
          {playing && <span role="status"><ProgramSymbol kind="repeat" />{Math.floor(position / value.moves.length) + 1}/{value.repeat}</span>}
        </div>
      </aside>
    </div>
  </section>;
}
