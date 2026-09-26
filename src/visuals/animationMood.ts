export const ANIMATION_MOODS = ["float", "pop", "cosmic", "wave", "march", "spiral", "breathe", "swing", "zigzag", "gather", "scatter", "rise", "rain", "figure8", "carousel"] as const;

export type AnimationMood = (typeof ANIMATION_MOODS)[number];

export const DEFAULT_ANIMATION_MOOD: AnimationMood = "float";

export const MOOD_NAMES: Record<AnimationMood, string> = {
  float: "ゆらゆら", pop: "はじける", cosmic: "ぐるぐる", wave: "なみなみ",
  march: "こうしん", spiral: "うずまき", breathe: "ふくらむ", swing: "ぶらんこ",
  zigzag: "ジグザグ", gather: "あつまる", scatter: "ひろがる", rise: "ふわっと のぼる",
  rain: "ひらひら おちる", figure8: "はちのじ", carousel: "かいてんもくば",
};

/** 動きに合う既存の伴奏を選び、15種類でも音楽のまとまりを保つ。 */
export function backingMood(mood: AnimationMood): "float" | "pop" | "cosmic" {
  if (["pop", "march", "zigzag", "scatter"].includes(mood)) return "pop";
  if (["cosmic", "spiral", "figure8", "carousel"].includes(mood)) return "cosmic";
  return "float";
}

/** 保存データに含まれる動きが対応する15種類かを確認する。 */
export function isAnimationMood(value: unknown): value is AnimationMood {
  return ANIMATION_MOODS.some((mood) => mood === value);
}
