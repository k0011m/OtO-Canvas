export const ANIMATION_MOODS = ["float", "pop", "cosmic"] as const;

export type AnimationMood = (typeof ANIMATION_MOODS)[number];

export const DEFAULT_ANIMATION_MOOD: AnimationMood = "float";

export function isAnimationMood(value: unknown): value is AnimationMood {
  return ANIMATION_MOODS.some((mood) => mood === value);
}
