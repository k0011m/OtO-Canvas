import { describe, expect, it } from "vitest";
import { worldSoundNoise, worldSoundSample } from "../src/music/worldSounds";
import { buildArrangement, createProject } from "../src/music/arranger";
import { buildBackingTrack } from "../src/music/backingTrack";
import { isOtoProject } from "../src/storage/projectStore";
import { renderMusicEventsToWav } from "../src/export/wavExporter";
import { STAMP_SHAPE_KINDS, type CanvasShape, type InstrumentId } from "../src/types/project";

const voices: InstrumentId[] = ["marimba", "drum", "bass", "piano", "harp", "glockenspiel", "kalimba", "chime", "flute"];
const shapes: CanvasShape[] = [...STAMP_SHAPE_KINDS, "pen" as const].map((kind, index) => ({
  id: kind, kind, position: { x: index / 9, y: 0.4 }, size: 0.2, rotation: 0,
  colorId: "ocean", patternId: "test", zIndex: index,
}));

describe("sound worlds", () => {
  // 全図形が音階で演奏でき、伴奏・保存データにも同じ世界が引き継がれる。
  it.each(["soft", "space"] as const)("keeps every %s voice pitched and persistent", (world) => {
    for (const shape of shapes) {
      const events = buildArrangement([shape], 42, world);
      expect(events.every((event) => event.soundWorld === world && Number.isFinite(event.midiNote))).toBe(true);
      expect(new Set(events.map((event) => event.midiNote)).size).toBeGreaterThan(1);
    }
    expect(buildBackingTrack(world, "pop", 42).every((event) => event.soundWorld === world)).toBe(true);
    const project = createProject(shapes, 42, world);
    expect(isOtoProject(JSON.parse(JSON.stringify(project)))).toBe(true);
    expect(isOtoProject({ ...project, events: [{ ...project.events[0], soundWorld: "invalid" }] })).toBe(false);
  });

  // 音量が有限で末尾が無音になり、音高指定と世界の違いが波形へ反映される。
  it.each(voices)("renders distinct pitched and bounded %s sounds", (voice) => {
    const signals = [];
    for (const world of ["soft", "space"] as const) {
      const samples = Array.from({ length: 6000 }, (_, frame) => worldSoundSample(world, voice, frame / 22050, 0.2, 220, worldSoundNoise(frame)));
      expect(samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1)).toBe(true);
      expect(samples.some((sample) => Math.abs(sample) > 0.1)).toBe(true);
      expect(Math.abs(samples.at(-1)!)).toBe(0);
      const higher = samples.map((_, frame) => worldSoundSample(world, voice, frame / 22050, 0.2, 440, worldSoundNoise(frame)));
      expect(higher).not.toEqual(samples);
      signals.push(samples);
    }
    expect(signals[0]).not.toEqual(signals[1]);
  });

  // 世界によってWAV内容が切り替わり、ミュートと旧データ互換を保つ。
  it("exports world sounds and accepts legacy events", async () => {
    const project = createProject(shapes, 42, "bounce");
    const event = { ...project.events[0], beat: 0, midiNote: 60 };
    const files = [];
    for (const world of ["soft", "bounce", "space"] as const) {
      const blob = await renderMusicEventsToWav([{ ...event, soundWorld: world }], { durationSeconds: 0.25, sampleRate: 8000 });
      files.push(new Uint8Array(await blob.arrayBuffer()));
    }
    expect(files[0]).not.toEqual(files[1]);
    expect(files[1]).not.toEqual(files[2]);
    expect(files[0]).not.toEqual(files[2]);
    const { soundWorld, ...legacy } = event;
    expect(isOtoProject({ ...project, events: [legacy] })).toBe(true);
    const muted = await renderMusicEventsToWav([{ ...event, soundWorld: "soft" }], { durationSeconds: 0.25, sampleRate: 8000, masterGain: 0 });
    expect(new Uint8Array(await muted.arrayBuffer()).slice(44).every((byte) => byte === 0)).toBe(true);
  });
});
