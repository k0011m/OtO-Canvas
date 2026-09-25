import { BARS, BPM, type InstrumentId, type MusicEvent } from "../types/project";

const TWO_PI = Math.PI * 2;
const DEFAULT_SAMPLE_RATE = 22_050;
const MAX_DURATION_SECONDS = 10 * 60;

export interface WavExportOptions {
  bpm?: number;
  bars?: number;
  sampleRate?: number;
  durationSeconds?: number;
  masterGain?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function defaultMidiNote(instrumentId: InstrumentId): number {
  switch (instrumentId) {
    case "marimba":
      return 60;
    case "drum":
      return 48;
    case "piano":
      return 64;
    case "harp":
      return 67;
    case "glockenspiel":
      return 79;
    case "kalimba":
      return 72;
    case "chime":
      return 76;
    case "flute":
      return 72;
    case "bass":
      return 43;
    case "pad":
      return 60;
    case "percussion":
      return 48;
    case "bell":
      return 72;
  }
}

function hashText(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function nextNoise(state: number): [number, number] {
  let next = state || 0x6d2b79f5;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return [next >>> 0, ((next >>> 0) / 4_294_967_295) * 2 - 1];
}

function releaseSeconds(instrumentId: InstrumentId): number {
  switch (instrumentId) {
    case "marimba":
      return 0.55;
    case "drum":
      return 0.28;
    case "piano":
      return 1.1;
    case "harp":
      return 1.35;
    case "glockenspiel":
      return 1.9;
    case "kalimba":
      return 0.85;
    case "chime":
      return 2.2;
    case "flute":
      return 0.32;
    case "bell":
      return 1.6;
    case "pad":
      return 0.8;
    case "bass":
      return 0.18;
    case "percussion":
      return 0.25;
  }
}

function makeAbortError(): DOMException {
  return new DOMException("WAV export was cancelled.", "AbortError");
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw makeAbortError();
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function reportProgress(callback: WavExportOptions["onProgress"], progress: number): void {
  callback?.(clamp(progress, 0, 1));
}

function renderBell(time: number, frequency: number): number {
  const envelope = Math.exp(-3.4 * time);
  return (
    Math.sin(TWO_PI * frequency * time) * 0.72 +
    Math.sin(TWO_PI * frequency * 2.01 * time) * 0.2 +
    Math.sin(TWO_PI * frequency * 3.98 * time) * 0.08
  ) * envelope;
}

function renderBass(time: number, gate: number, frequency: number): number {
  const attack = Math.min(1, time / 0.012);
  const release = time <= gate ? 1 : Math.max(0, 1 - (time - gate) / 0.18);
  const body = Math.sin(TWO_PI * frequency * time) * 0.82;
  const warmth = Math.sin(TWO_PI * frequency * 2 * time) * 0.18;
  return (body + warmth) * attack * release * 0.8;
}

function renderPad(time: number, gate: number, frequency: number): number {
  const attackTime = Math.min(0.35, Math.max(0.06, gate * 0.4));
  const attack = Math.min(1, time / attackTime);
  const release = time <= gate ? 1 : Math.max(0, 1 - (time - gate) / 0.8);
  const shimmer =
    Math.sin(TWO_PI * frequency * 0.997 * time) * 0.34 +
    Math.sin(TWO_PI * frequency * 1.003 * time) * 0.34 +
    Math.sin(TWO_PI * frequency * 2 * time) * 0.12;
  return shimmer * attack * release * 0.72;
}

function renderPercussion(time: number, noise: number): number {
  const noiseEnvelope = Math.exp(-22 * time);
  const drumEnvelope = Math.exp(-12 * time);
  const fallingFrequency = 120 - Math.min(70, time * 420);
  const drum = Math.sin(TWO_PI * fallingFrequency * time) * drumEnvelope;
  return drum * 0.7 + noise * noiseEnvelope * 0.3;
}

function renderMarimba(time: number, frequency: number): number {
  const attack = Math.min(1, time / 0.004);
  const woodenBody =
    Math.sin(TWO_PI * frequency * time) * 0.78 * Math.exp(-4.6 * time) +
    Math.sin(TWO_PI * frequency * 3.98 * time) * 0.16 * Math.exp(-7.5 * time) +
    Math.sin(TWO_PI * frequency * 9.2 * time) * 0.06 * Math.exp(-13 * time);
  return woodenBody * attack * 0.86;
}

function renderPiano(time: number, gate: number, frequency: number): number {
  const attack = Math.min(1, time / 0.004);
  const gateRelease = time <= gate ? 1 : Math.exp(-5.5 * (time - gate));
  const naturalDecay = Math.exp(-1.55 * time);
  const hammer = Math.exp(-32 * time) * Math.sin(TWO_PI * frequency * 7.03 * time) * 0.08;
  const strings =
    Math.sin(TWO_PI * frequency * time) * 0.58 +
    Math.sin(TWO_PI * frequency * 2.003 * time) * 0.25 +
    Math.sin(TWO_PI * frequency * 3.006 * time) * 0.11 +
    Math.sin(TWO_PI * frequency * 4.01 * time) * 0.06;
  return (strings * naturalDecay + hammer) * attack * gateRelease * 0.74;
}

function renderHarp(time: number, frequency: number): number {
  const attack = Math.min(1, time / 0.003);
  const pluck =
    Math.sin(TWO_PI * frequency * time) * 0.5 * Math.exp(-2.1 * time) +
    Math.sin(TWO_PI * frequency * 2 * time) * 0.25 * Math.exp(-3.3 * time) +
    Math.sin(TWO_PI * frequency * 3 * time) * 0.15 * Math.exp(-4.7 * time) +
    Math.sin(TWO_PI * frequency * 5 * time) * 0.1 * Math.exp(-7.5 * time);
  return pluck * attack * 0.78;
}

function renderGlockenspiel(time: number, frequency: number): number {
  const attack = Math.min(1, time / 0.002);
  const metal =
    Math.sin(TWO_PI * frequency * time) * 0.5 * Math.exp(-2.4 * time) +
    Math.sin(TWO_PI * frequency * 2.77 * time) * 0.25 * Math.exp(-3.1 * time) +
    Math.sin(TWO_PI * frequency * 5.4 * time) * 0.16 * Math.exp(-4.5 * time) +
    Math.sin(TWO_PI * frequency * 8.93 * time) * 0.09 * Math.exp(-6.8 * time);
  return metal * attack * 0.7;
}

function renderKalimba(time: number, frequency: number): number {
  const attack = Math.min(1, time / 0.003);
  const tine =
    Math.sin(TWO_PI * frequency * time) * 0.7 * Math.exp(-3.4 * time) +
    Math.sin(TWO_PI * frequency * 2.03 * time) * 0.12 * Math.exp(-7.2 * time) +
    Math.sin(TWO_PI * frequency * 5.9 * time) * 0.18 * Math.exp(-9.5 * time);
  return tine * attack * 0.82;
}

function renderChime(time: number, frequency: number): number {
  const attack = Math.min(1, time / 0.006);
  const shimmer =
    Math.sin(TWO_PI * frequency * time) * 0.35 * Math.exp(-1.65 * time) +
    Math.sin(TWO_PI * frequency * 2.41 * time) * 0.28 * Math.exp(-2.05 * time) +
    Math.sin(TWO_PI * frequency * 4.11 * time) * 0.22 * Math.exp(-2.7 * time) +
    Math.sin(TWO_PI * frequency * 6.76 * time) * 0.15 * Math.exp(-3.8 * time);
  return shimmer * attack * 0.66;
}

function renderFlute(time: number, gate: number, frequency: number, noise: number): number {
  const attack = Math.min(1, time / 0.075);
  const release = time <= gate ? 1 : Math.max(0, 1 - (time - gate) / 0.32);
  const vibrato = 1 + Math.sin(TWO_PI * 5.1 * time) * 0.0028;
  const tone =
    Math.sin(TWO_PI * frequency * vibrato * time) * 0.78 +
    Math.sin(TWO_PI * frequency * 2 * vibrato * time) * 0.16 +
    Math.sin(TWO_PI * frequency * 3 * vibrato * time) * 0.06;
  const breath = noise * 0.035;
  return (tone + breath) * attack * release * 0.58;
}

async function renderEvent(
  mix: Float32Array,
  event: MusicEvent,
  sampleRate: number,
  secondsPerBeat: number,
  signal?: AbortSignal,
): Promise<void> {
  if (!Number.isFinite(event.beat) || !Number.isFinite(event.durationBeats)) return;

  const eventStartSeconds = event.beat * secondsPerBeat;
  const gateSeconds = Math.max(0.04, event.durationBeats * secondsPerBeat);
  const startFrame = Math.max(0, Math.floor(eventStartSeconds * sampleRate));
  if (startFrame >= mix.length) return;

  const midiNote = clamp(
    Math.round(event.midiNote ?? defaultMidiNote(event.instrumentId)),
    24,
    108,
  );
  const frequency = midiToFrequency(midiNote);
  const velocity = clamp(Number.isFinite(event.velocity) ? event.velocity : 0.7, 0, 1);
  const totalSeconds = gateSeconds + releaseSeconds(event.instrumentId);
  const endFrame = Math.min(mix.length, startFrame + Math.ceil(totalSeconds * sampleRate));
  let noiseState = hashText(`${event.id}:${event.shapeId}`);

  for (let frame = startFrame; frame < endFrame; frame += 1) {
    if ((frame & 0x3fff) === 0) checkAborted(signal);
    if (frame > startFrame && (frame - startFrame) % 131_072 === 0) {
      await yieldToBrowser();
    }

    const time = (frame - startFrame) / sampleRate;
    let sample = 0;

    switch (event.instrumentId) {
      case "marimba":
        sample = renderMarimba(time, frequency);
        break;
      case "drum": {
        let noise: number;
        [noiseState, noise] = nextNoise(noiseState);
        sample = renderPercussion(time, noise);
        break;
      }
      case "piano":
        sample = renderPiano(time, gateSeconds, frequency);
        break;
      case "harp":
        sample = renderHarp(time, frequency);
        break;
      case "glockenspiel":
        sample = renderGlockenspiel(time, frequency);
        break;
      case "kalimba":
        sample = renderKalimba(time, frequency);
        break;
      case "chime":
        sample = renderChime(time, frequency);
        break;
      case "flute": {
        let noise: number;
        [noiseState, noise] = nextNoise(noiseState);
        sample = renderFlute(time, gateSeconds, frequency, noise);
        break;
      }
      case "percussion": {
        let noise: number;
        [noiseState, noise] = nextNoise(noiseState);
        sample = renderPercussion(time, noise);
        break;
      }
      case "bass":
        sample = renderBass(time, gateSeconds, frequency);
        break;
      case "pad":
        sample = renderPad(time, gateSeconds, frequency);
        break;
      case "bell":
        sample = renderBell(time, frequency);
        break;
    }

    mix[frame] += sample * velocity;
  }
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

/** 音量を適用し、重なった音のピークを滑らかに抑えて16ビットPCM WAVへ変換する。 */
export async function encodePcm16Wav(
  samples: Float32Array,
  sampleRate: number,
  options: Pick<WavExportOptions, "masterGain" | "signal" | "onProgress"> = {},
): Promise<Blob> {
  const safeSampleRate = Math.round(clamp(finiteOr(sampleRate, DEFAULT_SAMPLE_RATE), 8_000, 44_100));
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, safeSampleRate, true);
  view.setUint32(28, safeSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  const masterGain = clamp(finiteOr(options.masterGain, 1), 0, 1);
  const chunkSize = 131_072;

  for (let start = 0; start < samples.length; start += chunkSize) {
    checkAborted(options.signal);
    const end = Math.min(samples.length, start + chunkSize);

    for (let index = start; index < end; index += 1) {
      const source = Number.isFinite(samples[index]) ? samples[index] : 0;
      // 音量を上げてもPCM上限で波形を切らないよう、ソフトリミットに2%の余裕を残す。
      const limited = 0.98 * Math.tanh(source * masterGain * 1.6);
      const sample = clamp(limited, -1, 1);
      view.setInt16(
        44 + index * 2,
        sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767),
        true,
      );
    }

    reportProgress(options.onProgress, 0.82 + (end / Math.max(1, samples.length)) * 0.18);
    await yieldToBrowser();
  }

  checkAborted(options.signal);
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Synthesizes MusicEvent data without a server, AudioContext, or sample files.
 * The default 12 bars at 96 BPM produces an exact 30-second WAV.
 */
export async function renderMusicEventsToWav(
  events: readonly MusicEvent[],
  options: WavExportOptions = {},
): Promise<Blob> {
  const bpm = clamp(finiteOr(options.bpm, BPM), 30, 240);
  const bars = clamp(finiteOr(options.bars, BARS), 1, 240);
  const sampleRate = Math.round(
    clamp(finiteOr(options.sampleRate, DEFAULT_SAMPLE_RATE), 8_000, 44_100),
  );
  const requestedDuration = finiteOr(options.durationSeconds, (bars * 4 * 60) / bpm);
  const durationSeconds = clamp(requestedDuration, 0.1, MAX_DURATION_SECONDS);
  const sampleCount = Math.ceil(durationSeconds * sampleRate);
  const mix = new Float32Array(sampleCount);
  const secondsPerBeat = 60 / bpm;

  reportProgress(options.onProgress, 0);
  checkAborted(options.signal);

  for (let index = 0; index < events.length; index += 1) {
    await renderEvent(mix, events[index], sampleRate, secondsPerBeat, options.signal);
    reportProgress(options.onProgress, ((index + 1) / Math.max(1, events.length)) * 0.82);

    if ((index & 7) === 7) await yieldToBrowser();
  }

  if (events.length === 0) reportProgress(options.onProgress, 0.82);
  return encodePcm16Wav(mix, sampleRate, options);
}

function normalizeWavFileName(fileName: string): string {
  const safe = fileName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-") || "oto-canvas";
  return safe.toLowerCase().endsWith(".wav") ? safe : `${safe}.wav`;
}

/** Starts a user-visible browser download for a WAV Blob. */
export function downloadWav(blob: Blob, fileName = "oto-canvas.wav"): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("WAV downloads require a browser document.");
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = normalizeWavFileName(fileName);
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export async function exportAndDownloadWav(
  events: readonly MusicEvent[],
  fileName = "oto-canvas.wav",
  options: WavExportOptions = {},
): Promise<Blob> {
  const blob = await renderMusicEventsToWav(events, options);
  downloadWav(blob, fileName);
  return blob;
}
