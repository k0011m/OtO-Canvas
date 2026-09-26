import { useEffect, useRef, useState } from "react";
import { type CanvasShape, type WorldId, shapeColorValue, WORLDS } from "../types/project";
import { renderShapes } from "../canvas/shapeRenderer";
import { audioEngine } from "../music/audioEngine";
import { MAX_SOUND_STEPS, NOTE_NAMES, playableSoundSteps } from "../music/soundProgram";
import { ControlIcon } from "./ControlIcon";

/** 同じ種類でも色と番号で個々の図形を見分けられる小さなカード。 */
function SoundShape({ shape, number, world }: { shape: CanvasShape; number: number; world: WorldId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, 80, 80);
    renderShapes(context, [{ ...shape, position: { x: .5, y: .5 }, size: .6 }], WORLDS[world], { width: 80, height: 80 }, null, true);
  }, [shape, world]);
  return <span className="sound-shape"><canvas ref={ref} width={80} height={80} aria-hidden="true" /><strong style={{ borderColor: shapeColorValue(shape.colorId) }}>{number}</strong></span>;
}

/** 図形ごとの固定音階と、繰り返し配置できる発音順を別々に編集する。 */
export function SoundProgramEditor({ shapes, world, steps, seconds, onShapesChange, onChange, onClose }: {
  shapes: CanvasShape[]; world: WorldId; steps: string[] | null; seconds: number;
  onShapesChange: (shapes: CanvasShape[]) => void; onChange: (steps: string[] | null) => void; onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(shapes[0]?.id);
  const [playing, setPlaying] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const generation = useRef(0);
  const selected = shapes.find((shape) => shape.id === selectedId) ?? shapes[0];
  const order = playableSoundSteps(steps ?? [], shapes);

  /** 再試聴・編集・閉じるで前のタイマーを止め、遅れて音が鳴ることを防ぐ。 */
  function stop() {
    generation.current++;
    timers.current.forEach(clearTimeout); timers.current = []; setPlaying(null);
  }
  useEffect(() => () => { generation.current++; timers.current.forEach(clearTimeout); }, []);

  /** 初期値のドも明示して、本番と試聴で音色・音高の選択を一致させる。 */
  async function preview(shape: CanvasShape) {
    await audioEngine.unlock();
    audioEngine.previewShape({ ...shape, soundNote: shape.soundNote ?? 0 }, world);
  }

  /** 本番と同じ場面の長さで順番を試し、実行中の図形カードを光らせる。 */
  async function trySequence() {
    stop();
    const ticket = generation.current;
    await audioEngine.unlock();
    if (ticket !== generation.current) return;
    audioEngine.stopScreenBgm();
    order.forEach((id, index) => {
      timers.current.push(setTimeout(() => {
        setPlaying(index);
        const shape = shapes.find((item) => item.id === id)!;
        audioEngine.previewShape({ ...shape, soundNote: shape.soundNote ?? 0 }, world);
      }, index * seconds * 1000 / order.length));
    });
    timers.current.push(setTimeout(() => setPlaying(null), seconds * 1000));
  }

  /** カード順の変更は音階を変えず、実行中なら試聴を停止する。 */
  function move(index: number, delta: number) {
    stop(); const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onChange(next);
  }

  return <div className="parent-overlay"><section className="parent-panel sound-editor" role="dialog" aria-modal="true" aria-labelledby="sound-program-title">
    <header><h2 id="sound-program-title">おとの プログラム</h2><button className="icon-button" aria-label="音プログラムを閉じる" onClick={onClose}><ControlIcon name="close" /></button></header>
    <h3 aria-label="1. 図形の音階を決める" className="sound-picture-heading"><span aria-hidden="true">1 · ● → ♪</span></h3>
    {!shapes.length && <p className="sr-only">まず このばめんに ずけいを おいてね。</p>}
    <div className="sound-shape-list" role="group" aria-label="音をつける図形">
      {shapes.map((shape, index) => <button key={shape.id} aria-label={`ずけい${index + 1}`} aria-pressed={selected?.id === shape.id} onClick={() => { stop(); setSelectedId(shape.id); void preview(shape); }}>
        <SoundShape shape={shape} number={index + 1} world={world} /><span>{NOTE_NAMES[shape.soundNote ?? 0]}</span>
      </button>)}
    </div>
    {selected && <><p className="sr-only">ずけい{shapes.indexOf(selected) + 1} の おと</p><div className="sound-note-picker" role="group" aria-label="図形の音階">
      {NOTE_NAMES.map((name, note) => <button key={note} aria-pressed={(selected.soundNote ?? 0) === note} onClick={() => {
        stop(); const next = { ...selected, soundNote: note };
        onShapesChange(shapes.map((shape) => shape.id === selected.id ? next : shape)); void preview(next);
      }}>{name}</button>)}
    </div></>}
    <h3 aria-label="2. 鳴らす順番を作る" className="sound-picture-heading"><span aria-hidden="true">2 · ▶ ▣ → ▣ → ▣</span></h3>
    <p className="sr-only">ずけいを えらんで「じゅんばんに たす」。おなじ ずけいも なんかいでも つかえるよ。</p>
    <button className="pill-button" aria-label="じゅんばんに たす" disabled={!selected || order.length >= MAX_SOUND_STEPS} onClick={() => {
      stop();
      if (selected!.soundNote === undefined) onShapesChange(shapes.map((shape) => shape.id === selected!.id ? { ...shape, soundNote: 0 } : shape));
      onChange([...order, selected!.id]);
    }}><ControlIcon name="plus" /><span aria-hidden="true">♪</span></button>
    <p className="sr-only">{steps === null ? "いまは おまかせえんそう。カードを たすと じぶんの じゅんばんに なるよ。" : `${order.length} / ${MAX_SOUND_STEPS}こ · ${seconds.toFixed(1)}びょうで 1かい ならすよ。`}</p>
    {steps !== null && !order.length && <p className="sr-only">カードが ないと このばめんの ずけいは おやすみするよ。</p>}
    <ol className="sound-sequence" aria-label="音の順番">
      {order.map((id, index) => {
        const shape = shapes.find((item) => item.id === id)!;
        return <li key={`${index}-${id}`} aria-current={playing === index ? "step" : undefined} data-testid={`sound-step-${index}`}>
          <button aria-label={`${index + 1}番を試聴`} onClick={() => { stop(); void preview(shape); }}><b>{index + 1}</b><SoundShape shape={shape} number={shapes.indexOf(shape) + 1} world={world} /><span>{NOTE_NAMES[shape.soundNote ?? 0]}</span></button>
          <div className="program-step-actions"><button aria-label={`音の${index + 1}番を前へ`} disabled={index === 0} onClick={() => move(index, -1)}><ControlIcon name="left" /></button><button aria-label={`音の${index + 1}番を後ろへ`} disabled={index === order.length - 1} onClick={() => move(index, 1)}><ControlIcon name="right" /></button><button aria-label={`音の${index + 1}番を消す`} onClick={() => { stop(); onChange(order.filter((_, i) => i !== index)); }}><ControlIcon name="close" /></button></div>
        </li>;
      })}
    </ol>
    <div className="camera-actions"><button className="pill-button" aria-label={playing === null ? "じゅんばんを きく" : "とめる"} disabled={!order.length} onClick={() => playing === null ? void trySequence() : stop()}><ControlIcon name={playing === null ? "play" : "pause"} /></button><button className="pill-button" aria-label="おまかせに もどす" onClick={() => { stop(); onChange(null); }}><ControlIcon name="undo" /></button><button className="pill-button" aria-label="できた" onClick={onClose}><svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 L10 18 L21 5" fill="none" stroke="currentColor" strokeWidth="4" /></svg></button></div>
    <p className="sr-only">おとは ドから 高いドまで。ぽんぽんの さんかくは マリンバ、せんは ピアノで なるよ。</p>
  </section></div>;
}
