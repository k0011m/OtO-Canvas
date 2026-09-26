import { describe, expect, it } from "vitest";
import { buildBackingTrack } from "../src/music/backingTrack";
import { WORLD_TONICS, isPentatonicMidi } from "../src/music/scales";
import { getSectionAtBeat } from "../src/music/sections";
import { TOTAL_BEATS, type MusicEvent, type WorldId } from "../src/types/project";
import { ANIMATION_MOODS, type AnimationMood } from "../src/visuals/animationMood";

const WORLDS = ["soft", "bounce", "space"] as const satisfies readonly WorldId[];

function maximumPolyphony(events: readonly MusicEvent[]): number {
  const moments = new Set(events.flatMap((event) => [
    event.beat,
    event.beat + event.durationBeats,
  ]));
  let maximum = 0;

  for (const moment of moments) {
    const sounding = events.filter(
      (event) => event.beat <= moment && event.beat + event.durationBeats > moment,
    ).length;
    maximum = Math.max(maximum, sounding);
  }

  return maximum;
}

describe("buildBackingTrack", () => {
  it.each(ANIMATION_MOODS)(
    "builds a deterministic %s backing track",
    (mood) => {
      const first = buildBackingTrack("soft", mood, 20260830);
      const second = buildBackingTrack("soft", mood, 20260830);

      expect(first).toEqual(second);
      expect(first.length).toBeGreaterThan(0);
      expect(buildBackingTrack("soft", mood, 20260831)).not.toEqual(first);
    },
  );

  it.each(WORLDS)("stays in the %s world's pentatonic key", (worldId) => {
    for (const mood of ANIMATION_MOODS) {
      const events = buildBackingTrack(worldId, mood, 13579);
      for (const event of events) {
        if (event.midiNote !== undefined) {
          expect(isPentatonicMidi(event.midiNote, WORLD_TONICS[worldId])).toBe(true);
        }
      }
    }
  });

  it.each(ANIMATION_MOODS)(
    "keeps %s quiet, inside 48 beats, and section-correct",
    (mood) => {
      const events = buildBackingTrack("bounce", mood, 24680);
      const sections = new Set(events.map((event) => event.section));

      expect(sections).toEqual(
        new Set(["intro", "a", "b", "break", "climax", "outro"]),
      );
      for (const event of events) {
        expect(event.id.startsWith(`bgm-${mood}-`)).toBe(true);
        expect(event.shapeId.startsWith(`bgm:${mood}:`)).toBe(true);
        expect(event.beat).toBeGreaterThanOrEqual(0);
        expect(event.beat).toBeLessThan(TOTAL_BEATS);
        expect(event.durationBeats).toBeGreaterThan(0);
        expect(event.beat + event.durationBeats).toBeLessThanOrEqual(TOTAL_BEATS);
        expect(event.velocity).toBeGreaterThanOrEqual(0.12);
        expect(event.velocity).toBeLessThanOrEqual(0.28);
        expect(event.section).toBe(getSectionAtBeat(event.beat));
      }
    },
  );

  it("uses a genuinely different instrument family and rhythm for each mood", () => {
    const tracks: Record<"float" | "pop" | "cosmic", MusicEvent[]> = {
      float: buildBackingTrack("space", "float", 4242),
      pop: buildBackingTrack("space", "pop", 4242),
      cosmic: buildBackingTrack("space", "cosmic", 4242),
    };

    expect(new Set(tracks.float.map((event) => event.instrumentId))).toEqual(
      new Set(["piano", "chime", "flute"]),
    );
    expect(new Set(tracks.pop.map((event) => event.instrumentId))).toEqual(
      new Set(["drum", "bass", "piano"]),
    );
    expect(new Set(tracks.cosmic.map((event) => event.instrumentId))).toEqual(
      new Set(["flute", "chime", "glockenspiel"]),
    );

    const onsetSignatures = (["float", "pop", "cosmic"] as const).map((mood) =>
      [...new Set(tracks[mood].map((event) => event.beat % 4))].join(",")
    );
    expect(new Set(onsetSignatures).size).toBe(3);
  });

  it.each(ANIMATION_MOODS)(
    "keeps %s backing polyphony sparse",
    (mood) => {
      const events = buildBackingTrack("soft", mood, 999);
      expect(maximumPolyphony(events)).toBeLessThanOrEqual(2);
      expect(events.length).toBeLessThanOrEqual(100);
    },
  );
});

// 伴奏の選択は手動場面だけに適用し、自動演奏の場面には影響させない。
it("keeps optional backing music for programmed scenes", async () => {
  const { buildSceneBackingTrack } = await import("../src/music/backingTrack");
  const without = buildSceneBackingTrack("bounce", ["float", "pop"], 2, 1, [["one"], null]);
  const withBgm = buildSceneBackingTrack("bounce", ["float", "pop"], 2, 1, [["one"], null], true);
  expect(without.every((event) => event.beat >= 24)).toBe(true);
  expect(withBgm.some((event) => event.beat < 24)).toBe(true);
  expect(withBgm.filter((event) => event.beat >= 24)).toEqual(without);
});
