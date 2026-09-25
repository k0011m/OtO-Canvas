import type { InstrumentId, MusicEvent, WorldId } from "../types/project";
import type { MotifEvent } from "./shapeMapper";
import { mixSeed } from "./prng";
import { nearestPentatonicInRange, transposePentatonic, WORLD_TONICS } from "./scales";
import { getSectionAtBar } from "./sections";

const PHRASES: Record<InstrumentId, readonly number[]> = {
  marimba: [0, 2, 4, 1, 3, 2, -1, 0],
  piano: [0, 2, 4, 2, 1, 3, 2, 0],
  harp: [0, 1, 2, 4, 3, 2, 1, 0],
  glockenspiel: [0, 4, 2, 3, 1, 4, 2, 0],
  kalimba: [0, 2, 1, 3, 2, 4, 1, 0],
  chime: [0, 3, 2, 4, 1, 3, 2, 0],
  flute: [0, 1, 3, 2, 4, 3, 1, 0],
  bass: [0, 2, 0, 3, 1, 2, -1, 0],
  drum: [0, 0, 0, 0],
  percussion: [0, 0, 0, 0],
  bell: [0, 2, 4, 1, 3, 2, -1, 0],
  pad: [0, 2, 1, 3, 2, 4, 1, 0],
};

const REGISTERS: Record<InstrumentId, readonly [number, number]> = {
  marimba: [48, 84], piano: [45, 84], harp: [48, 88],
  glockenspiel: [55, 84], kalimba: [52, 88], chime: [55, 88],
  flute: [55, 88], bass: [34, 58], bell: [48, 88], pad: [45, 79],
  drum: [36, 60], percussion: [36, 60],
};

/** 図形を楽器別にまとめ、各楽器が毎小節に参加する複数音程のフレーズへ展開する。 */
export function buildInstrumentPhrases(
  motif: readonly MotifEvent[], bar: number, seed: number, worldId: WorldId,
): MusicEvent[] {
  const groups = new Map<InstrumentId, MotifEvent[]>();
  for (const note of motif) {
    const group = groups.get(note.instrumentId) ?? [];
    group.push(note);
    groups.set(note.instrumentId, group);
  }
  const section = getSectionAtBar(bar);
  const quiet = section === "intro" || section === "break" || section === "outro";
  const events: MusicEvent[] = [];
  const rotation = ((motif[0]?.step ?? 0) + (bar % 2) * 2) % 16;
  let instrumentIndex = 0;
  for (const [instrumentId, group] of groups) {
    const phrase = PHRASES[instrumentId];
    const phase = mixSeed(seed, worldId, instrumentId) % phrase.length;
    const [minimum, maximum] = REGISTERS[instrumentId];
    for (let noteIndex = 0; noteIndex < 2; noteIndex += 1) {
      const source = group[(bar * 2 + noteIndex) % group.length];
      // 楽器ごとに開始位置をずらし、同じ場所に置かれた9種類も順番に参加させる。
      const step = (Math.floor(instrumentIndex * 16 / groups.size) + rotation + noteIndex * 8) % 16;
      const beat = bar * 4 + step * 0.25;
      const event: MusicEvent = {
        id: `part-${bar}-${instrumentId}-${noteIndex}`,
        shapeId: source.shapeId,
        beat,
        durationBeats: Math.min(source.durationBeats, quiet ? 0.65 : 0.8, (bar + 1) * 4 - beat),
        velocity: Math.min(0.9, source.velocity * (quiet ? 0.78 : section === "climax" ? 1.08 : 0.94)
          * (noteIndex === 0 ? 1 : 0.86)),
        instrumentId,
        section,
        visualEvent: section === "outro" ? "fade" : source.visualEvent,
      };
      if (source.midiNote !== undefined) {
        const root = nearestPentatonicInRange(source.midiNote, WORLD_TONICS[worldId], minimum + 5, maximum - 7);
        event.midiNote = nearestPentatonicInRange(
          transposePentatonic(root, phrase[(bar * 2 + noteIndex + phase) % phrase.length], WORLD_TONICS[worldId]),
          WORLD_TONICS[worldId], minimum, maximum,
        );
      }
      events.push(event);
    }
    instrumentIndex += 1;
  }
  return events;
}

// 合成音の最短発音時間を見込み、編曲上の短い音でも実再生の余韻用スロットを確保する。
const MIN_VOICE_SECONDS: Record<InstrumentId, number> = {
  marimba: 0.28, drum: 0.3, bass: 0.2, piano: 0.4, harp: 0.42,
  glockenspiel: 0.52, kalimba: 0.34, chime: 0.65, flute: 0.38,
  bell: 0.18, percussion: 0.16, pad: 0.45,
};

/** 音声エンジンの最短発音時間とノード解放の余裕を含めて、同時発音枠の終端を返す。 */
export function voiceBudgetEnd(event: MusicEvent): number {
  return event.beat + Math.max(event.durationBeats, MIN_VOICE_SECONDS[event.instrumentId] * 96 / 60) + 0.08;
}
