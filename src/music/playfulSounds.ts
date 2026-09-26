import bank from "./playfulSamples.json";
import type { InstrumentId } from "../types/project";

export const PLAYFUL_VOICES: Record<InstrumentId, keyof typeof bank> = {
  marimba: "voice-ah", bell: "voice-ah", drum: "mouth-pop", percussion: "mouth-pop",
  bass: "cartoon-boing", pad: "voice-hum", piano: "toy-duck", harp: "cartoon-twang",
  glockenspiel: "toy-squeak", kalimba: "toy-ball", chime: "slide-whistle", flute: "voice-hum",
};

/** 音源をJSと一緒に読み込み、通信失敗やデコード待ちで図形だけが無音になるのを防ぐ。 */
function decodePcm(encoded: string): Float32Array {
  const bytes = atob(encoded);
  const values = new Float32Array(bytes.length / 2);
  for (let i = 0; i < values.length; i++) {
    const word = bytes.charCodeAt(i * 2) | (bytes.charCodeAt(i * 2 + 1) << 8);
    values[i] = (word >= 32768 ? word - 65536 : word) / 32768;
  }
  return values;
}

const samples = Object.fromEntries(Object.entries(bank).map(([id, item]) => [id, {
  ...item, data: decodePcm(item.pcm),
  // 原音の声質を保つ音域を基準にし、ド〜高いドの1オクターブは折り返さない。
  referenceHz: item.rootHz / 2 ** Math.round(Math.log2(item.rootHz / 261.625565)),
}]));

/** 自動編曲の極端な低音だけ上げ、声が不自然に長く引き伸ばされないようにする。 */
function playbackRate(instrument: InstrumentId, frequency: number): number {
  let pitch = Number.isFinite(frequency) && frequency > 0 ? frequency : 261.625565;
  while (pitch > 0 && pitch < 130.8) pitch *= 2;
  while (pitch > 1046.6) pitch /= 2;
  return Math.max(.25, pitch / samples[PLAYFUL_VOICES[instrument]]!.referenceHz);
}

/** 原音の長さと発音枠の短い方を使い、長いサンプルの重なりを抑える。 */
export function playfulDuration(instrument: InstrumentId, frequency: number, gate: number): number {
  const sample = samples[PLAYFUL_VOICES[instrument]]!;
  return Math.min(sample.data.length / sample.sampleRate / playbackRate(instrument, frequency), Math.max(.16, gate) + .04, .8);
}

/** 同じPCMの補間・移調・フェードを、Web AudioとWAVの両方で使う。 */
export function playfulSoundSample(instrument: InstrumentId, time: number, gate: number, frequency: number): number {
  const sample = samples[PLAYFUL_VOICES[instrument]]!;
  const duration = playfulDuration(instrument, frequency, gate);
  if (time < 0 || time >= duration) return 0;
  const position = time * sample.sampleRate * playbackRate(instrument, frequency);
  const index = Math.floor(position);
  const fraction = position - index;
  const value = (sample.data[index] ?? 0) * (1 - fraction) + (sample.data[index + 1] ?? 0) * fraction;
  return value * Math.min(1, time / .003, (duration - time) / .018);
}
