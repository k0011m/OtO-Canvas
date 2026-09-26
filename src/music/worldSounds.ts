import type { InstrumentId, WorldId } from "../types/project";

export const WORLD_SOUND_LABELS: Record<WorldId, Record<InstrumentId, string>> = {
  bounce: { marimba: "マリンバ", drum: "たいこ", bass: "ベース", piano: "ピアノ", harp: "ハープ", glockenspiel: "てっきん", kalimba: "カリンバ", chime: "チャイム", flute: "フルート", bell: "ベル", pad: "パッド", percussion: "パーカッション" },
  soft: { marimba: "みずのしずく", drum: "かみをやぶく", bass: "なみ", piano: "こいし", harp: "こもれびのはっぱ", glockenspiel: "こおり", kalimba: "きのえだ", chime: "あわ", flute: "かぜ", bell: "みずのしずく", pad: "なみ", percussion: "かみをやぶく" },
  space: { marimba: "ピコピコ", drum: "でんしドラム", bass: "シンセベース", piano: "でんしキー", harp: "レーザー", glockenspiel: "うちゅうベル", kalimba: "ロボット", chime: "レーダー", flute: "うちゅうパッド", bell: "ピコピコ", pad: "うちゅうパッド", percussion: "でんしドラム" },
};

/** 環境音の質感と電子音を、音階を保った共通波形として再生・WAVへ渡す。録音素材は使わない。 */
export function worldSoundSample(world: "soft" | "space", instrument: InstrumentId, time: number, gate: number, frequency: number, noise: number): number {
  const phase = 2 * Math.PI * frequency * time;
  const attack = Math.min(1, time / 0.006);
  const release = Math.max(0, 1 - Math.max(0, time - gate) / 0.04);
  const envelope = attack * release;
  if (world === "soft") {
    const tone = Math.sin(phase);
    switch (instrument) {
      case "drum": case "percussion":
        return envelope * (tone * 0.42 + noise * 0.23 * (0.4 + 0.6 * Math.abs(Math.sin(time * 95)))) * Math.exp(-6 * time);
      case "bass": case "pad":
        return envelope * (tone * 0.5 + noise * 0.08) * (0.65 + 0.35 * Math.sin(time * 7));
      case "piano":
        return envelope * (tone * 0.52 + Math.sin(phase * 2.6) * 0.13 + noise * 0.15 * Math.exp(-70 * time)) * Math.exp(-7 * time);
      case "harp":
        return envelope * (tone * 0.4 + noise * 0.14 * (0.5 + 0.5 * Math.sin(time * 37))) * Math.exp(-3 * time);
      case "glockenspiel":
        return envelope * (tone * 0.45 + Math.sin(phase * 3.7) * 0.14) * Math.exp(-5 * time);
      case "kalimba":
        return envelope * (tone * 0.5 + noise * 0.2 * Math.exp(-55 * time)) * Math.exp(-9 * time);
      case "flute":
        return envelope * Math.min(1, time / 0.07) * (tone * 0.4 + noise * 0.13) * (0.8 + 0.2 * Math.sin(time * 13));
      case "chime":
        return envelope * Math.sin(phase + 0.7 * Math.sin(time * 32) * Math.exp(-10 * time)) * 0.58 * Math.exp(-4 * time);
      default:
        return envelope * Math.sin(phase + 1.3 * (1 - Math.exp(-30 * time))) * 0.65 * Math.exp(-8 * time);
    }
  }
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
