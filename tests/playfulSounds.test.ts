import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import bank from "../src/music/playfulSamples.json";
import sources from "../assets/audio-sources/sources.json";
import { PLAYFUL_VOICES, playfulDuration, playfulSoundSample } from "../src/music/playfulSounds";

// 音源と出典の対応・ハッシュを確認し、素材を入れ替えたときのクレジット漏れを防ぐ。
it("bundles nine CC0 sources with verified original hashes", () => {
  expect(new Set(Object.values(PLAYFUL_VOICES)).size).toBe(9);
  expect(Object.keys(bank).sort()).toEqual(sources.map((item) => item.name).sort());
  for (const source of sources) {
    expect(source.license).toBe("CC0-1.0");
    const bytes = readFileSync(new URL(`../assets/audio-sources/${source.name}.mp3`, import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(source.sha256);
  }
});

// ドと高いドが同音へ折り返されず、実際のPCMサンプルを2倍速で読むことを検証する。
it("transposes the same recorded sample across a full octave", () => {
  for (const instrument of Object.keys(PLAYFUL_VOICES) as (keyof typeof PLAYFUL_VOICES)[]) {
    expect(playfulSoundSample(instrument, .01, .8, 523.25113)).toBeCloseTo(playfulSoundSample(instrument, .02, .8, 261.625565), 6);
    const duration = playfulDuration(instrument, 261.625565, .3);
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThanOrEqual(.34);
    expect(playfulSoundSample(instrument, duration + .001, .3, 261.625565)).toBe(0);
    const signal = Array.from({ length: 500 }, (_, i) => playfulSoundSample(instrument, i / 2000, .3, 261.625565));
    expect(signal.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= .8)).toBe(true);
    expect(signal.some((sample) => Math.abs(sample) > .02)).toBe(true);
  }
});
