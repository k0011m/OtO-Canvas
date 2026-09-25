import { describe, expect, it } from "vitest";
import { encodePcm16Wav, renderMusicEventsToWav } from "../src/export/wavExporter";
import type { InstrumentId, MusicEvent } from "../src/types/project";

const INSTRUMENTS: readonly InstrumentId[] = [
  "marimba",
  "drum",
  "bass",
  "piano",
  "harp",
  "glockenspiel",
  "kalimba",
  "chime",
  "flute",
  // Persisted projects from the previous release can still contain these.
  "bell",
  "percussion",
  "pad",
];

function eventFor(instrumentId: InstrumentId, index: number): MusicEvent {
  return {
    id: `wav-${instrumentId}`,
    shapeId: `shape-${index}`,
    beat: 0,
    durationBeats: 0.125,
    midiNote: 48 + index * 2,
    velocity: 0.45,
    instrumentId,
    section: "intro",
    visualEvent: "pulse",
  };
}

describe("renderMusicEventsToWav", () => {
  // 大音量の重なりでもPCM上限へ張り付かず、小さな音は増幅し、ミュートは無音に保つ。
  it("boosts quiet samples while retaining peak headroom and mute", async () => {
    const samples = new Float32Array([-10, -2, -0.1, 0, 0.1, 2, 10]);
    const output = new DataView(await (await encodePcm16Wav(samples, 8_000)).arrayBuffer());
    for (let index = 0; index < samples.length; index += 1) {
      expect(Math.abs(output.getInt16(44 + index * 2, true))).toBeLessThan(32_200);
    }
    expect(output.getInt16(44 + 4 * 2, true) / 32_767).toBeGreaterThan(0.14);
    // 小信号では旧出力の約4倍となり、ピーク付近だけが制限されることを確認する。
    const quiet = new DataView(await (await encodePcm16Wav(new Float32Array([0.01]), 8_000)).arrayBuffer());
    const previousQuietLevel = 0.98 * Math.tanh(0.01 * 1.6);
    // PCM量子化と滑らかなピーク処理を含め、倍率の誤差を1%以内に収める。
    expect(Math.abs(quiet.getInt16(44, true) / 32_767 / previousQuietLevel - 4)).toBeLessThan(0.04);
    const muted = new DataView(await (await encodePcm16Wav(samples, 8_000, { masterGain: 0 })).arrayBuffer());
    for (let offset = 44; offset < muted.byteLength; offset += 2) {
      expect(muted.getInt16(offset, true)).toBe(0);
    }
  });

  it("renders every current and legacy instrument into a valid finite PCM WAV", async () => {
    const progress: number[] = [];
    const durationSeconds = 0.12;
    const sampleRate = 8_000;
    const blob = await renderMusicEventsToWav(
      INSTRUMENTS.map(eventFor),
      {
        durationSeconds,
        sampleRate,
        masterGain: 0.4,
        onProgress: (value) => progress.push(value),
      },
    );

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const ascii = (start: number, length: number) =>
      String.fromCharCode(...bytes.slice(start, start + length));

    expect(blob.type).toBe("audio/wav");
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(bytes.length).toBe(44 + Math.ceil(durationSeconds * sampleRate) * 2);
    expect(bytes.slice(44).some((value) => value !== 0)).toBe(true);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
  });
});
