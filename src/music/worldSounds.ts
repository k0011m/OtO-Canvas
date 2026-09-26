import { playfulSoundSample } from "./playfulSounds";
import type { InstrumentId, WorldId } from "../types/project";

export const WORLD_SOUND_LABELS: Record<WorldId, Record<InstrumentId, string>> = {
  bounce: { marimba: "マリンバ", drum: "たいこ", bass: "ベース", piano: "ピアノ", harp: "ハープ", glockenspiel: "てっきん", kalimba: "カリンバ", chime: "チャイム", flute: "フルート", bell: "ベル", pad: "パッド", percussion: "パーカッション" },
  soft: { marimba: "あーのこえ", drum: "くちでポッ", bass: "ぽよん", piano: "あひるのおもちゃ", harp: "びよーん", glockenspiel: "キュッ", kalimba: "ボールぽん", chime: "ヒューのふえ", flute: "ハミング", bell: "あーのこえ", pad: "ハミング", percussion: "くちでポッ" },
  space: { marimba: "ピコピコ", drum: "でんしドラム", bass: "シンセベース", piano: "でんしキー", harp: "レーザー", glockenspiel: "うちゅうベル", kalimba: "ロボット", chime: "レーダー", flute: "うちゅうパッド", bell: "ピコピコ", pad: "うちゅうパッド", percussion: "でんしドラム" },
};

/** ふわりは同梱の声・おもちゃ・まんが素材、きらりは電子合成を再生・WAVへ共通で渡す。 */
export function worldSoundSample(world: "soft" | "space", instrument: InstrumentId, time: number, gate: number, frequency: number, noise: number): number {
  const phase = 2 * Math.PI * frequency * time;
  const attack = Math.min(1, time / 0.006);
  const release = Math.max(0, 1 - Math.max(0, time - gate) / 0.04);
  const envelope = attack * release;
  if (world === "soft") return playfulSoundSample(instrument, time, gate, frequency);

  switch (instrument) {
    case "drum": case "percussion":
      return envelope * (Math.sin(phase + 2 * (1 - Math.exp(-45 * time))) * 0.62 + noise * 0.08 * Math.exp(-40 * time)) * Math.exp(-9 * time);
    case "bass":
      return envelope * (Math.sin(phase) * 0.5 + Math.sin(phase * 2) * 0.14 + Math.sin(phase * 3) * 0.08);
    case "piano":
      return envelope * Math.sin(phase + 1.2 * Math.sin(phase * 2) * Math.exp(-4 * time)) * 0.58 * Math.exp(-2 * time);
    case "harp":
      return envelope * Math.sin(phase + 4 * (1 - Math.exp(-18 * time))) * 0.6 * Math.exp(-4 * time);
    case "glockenspiel":
      return envelope * Math.sin(phase + 1.1 * Math.sin(phase * 3.5)) * 0.5 * Math.exp(-3 * time);
    case "kalimba":
      return envelope * (Math.sin(phase) * 0.4 + Math.sin(phase * 3) * 0.13) * (0.65 + 0.35 * Math.sin(time * 70));
    case "chime":
      return envelope * Math.sin(phase) * 0.6 * (0.55 + 0.45 * Math.cos(time * 35)) * Math.exp(-2 * time);
    case "flute": case "pad":
      return envelope * Math.min(1, time / 0.06) * (Math.sin(phase) * 0.4 + Math.sin(phase * 1.004) * 0.18 + Math.sin(phase * 2) * 0.08);
    default:
      return envelope * (Math.sin(phase) + Math.sin(phase * 3) / 3 + Math.sin(phase * 5) / 5) * 0.43 * Math.exp(-3 * time);
  }
}

/** サンプル番号から再現可能なノイズを作り、試聴と書き出しの質感をそろえる。 */
export function worldSoundNoise(frame: number): number {
  let value = Math.imul(frame + 1, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 2147483648 - 1;
}
