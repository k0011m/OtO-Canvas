import { describe, expect, it } from "vitest";
import { renderMusicEventsToWav } from "../src/export/wavExporter";
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
