import { BPM, TOTAL_BEATS } from "../types/project";
import type {
  CanvasShape,
  InstrumentId,
  MusicEvent,
  PlaybackSnapshot,
  WorldId,
} from "../types/project";
import { instrumentForShape } from "./shapeMapper";
import { colorSoundProfile } from "./creativeRules";
import { getSectionAtBeat } from "./sections";
import { buildBackingTrack } from "./backingTrack";

// UIと音声エンジンで初期音量をそろえ、試聴・再生・MV録音へ共通適用する。
export const DEFAULT_MASTER_VOLUME = 0.7;
const MAX_MASTER_GAIN = 0.75;
const MAX_POLYPHONY = 8;
const LOOK_AHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;
const START_LEAD_SECONDS = 0.035;
const MIN_SCHEDULE_LEAD_SECONDS = 0.006;
const MIN_GAIN = 0.0001;
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21] as const;

export type AudioEngineState = "stopped" | "playing" | "paused" | "disposed";
type VoicePriority = "timeline" | "auxiliary";

export interface AudioEngineCallbacks {
  /** Called at display-frame cadence with the authoritative audio-clock position. */
  onTick?: (snapshot: PlaybackSnapshot) => void;
  /** Called when the audio clock reaches an event, rather than when it is pre-scheduled. */
  onEvent?: (event: MusicEvent, snapshot: PlaybackSnapshot) => void;
  /** Called only when the timeline reaches its natural end. */
  onEnded?: () => void;
}

export interface PlaybackOptions extends AudioEngineCallbacks {
  bpm?: number;
  totalBeats?: number;
  fromBeat?: number;
}

interface ActiveVoice {
  readonly gain: GainNode;
  readonly nodes: Set<AudioNode>;
  readonly sources: Set<AudioScheduledSourceNode>;
  readonly startTime: number;
  readonly priority: VoicePriority;
  endTime: number;
  releasing: boolean;
}

interface TriggerOptions {
  instrumentId: InstrumentId;
  midiNote: number;
  velocity: number;
  durationSeconds: number;
  when: number;
  pan?: number;
  seed: string;
  priority?: VoicePriority;
}

interface WebkitAudioWindow extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Native Web Audio playback for OtoCanvas.
 *
 * The constructor and module singleton are silent. Call `unlock()` from a real
 * pointer/keyboard gesture before previewing or starting a timeline.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private outputBoost: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private captureDestination: MediaStreamAudioDestinationNode | null = null;
  private volume = DEFAULT_MASTER_VOLUME;

  private playbackState: AudioEngineState = "stopped";
  private screenBgmPlaying = false;
  private events: readonly MusicEvent[] = [];
  private callbacks: AudioEngineCallbacks = {};
  private bpm: number = BPM;
  private totalBeats: number = TOTAL_BEATS;
  private anchorBeat = 0;
  private anchorTime = 0;
  private pausedBeat = 0;
  private nextScheduleIndex = 0;
  private nextDispatchIndex = 0;
  private readonly scheduledEventIds = new Set<string>();

  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private animationFrame: number | null = null;
  private frameFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly activeVoices = new Set<ActiveVoice>();
  private lastConductTime = Number.NEGATIVE_INFINITY;

  get state(): AudioEngineState {
    return this.playbackState;
  }

  get isUnlocked(): boolean {
    return this.context?.state === "running";
  }

  get masterVolume(): number {
    return this.volume;
  }

  /** Mirrors the safe master output into a MediaStream for an explicit MV recording. */
  createCaptureStream(): MediaStream | null {
    const context = this.runningContextOrNull();
    const limiter = this.limiter;
    if (!context || !limiter) return null;
    this.stopCaptureStream();
    const destination = context.createMediaStreamDestination();
    limiter.connect(destination);
    this.captureDestination = destination;
    return destination.stream;
  }

  stopCaptureStream(): void {
    const destination = this.captureDestination;
    if (!destination) return;
    try {
      this.limiter?.disconnect(destination);
    } catch {
      // The graph may already be disconnected during page teardown.
    }
    for (const track of destination.stream.getTracks()) track.stop();
    this.captureDestination = null;
  }

  /**
   * Creates/resumes AudioContext. This must be called from a user gesture;
   * nothing in this class attempts to bypass browser autoplay policy.
   */
  async unlock(): Promise<void> {
    this.assertNotDisposed();

    if (typeof window === "undefined") {
      throw new Error("Web Audio is only available in a browser.");
    }

    if (!this.context) {
      const audioWindow = window as WebkitAudioWindow;
      const AudioContextConstructor =
        audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

      if (!AudioContextConstructor) {
        throw new Error("This browser does not support the Web Audio API.");
      }

      const context = new AudioContextConstructor({ latencyHint: "interactive" });
      this.context = context;
      this.buildOutputGraph(context);
    }

    const context = this.context;
    if (!context) {
      throw new Error("Web Audio could not be initialized.");
    }

    if (context.state === "suspended") {
      await context.resume();
    }

    if (context.state !== "running") {
      throw new Error(
        "Audio could not start. Call unlock() directly from a tap or click handler.",
      );
    }
  }

  /** Set a normalized 0..1 volume. The output graph applies a conservative cap. */
  setMasterVolume(volume: number): void {
    this.assertNotDisposed();
    this.volume = clamp(finiteOr(volume, DEFAULT_MASTER_VOLUME), 0, 1);

    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain) {
      return;
    }

    const now = context.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setTargetAtTime(
      this.volume * MAX_MASTER_GAIN,
      now,
      0.025,
    );
  }

  /** Plays a short, safe preview derived from a canvas shape. */
  previewShape(shape: CanvasShape, worldId: WorldId): boolean {
    const context = this.runningContextOrNull();
    if (!context) {
      return false;
    }

    const x = clamp(finiteOr(shape.position.x, 0.5), 0, 1);
    const y = clamp(finiteOr(shape.position.y, 0.5), 0, 1);
    const size = normalizedShapeSize(shape.size);
    const root = worldId === "bounce" ? 62 : worldId === "space" ? 55 : 60;
    const scaleIndex = Math.round((1 - y) * (PENTATONIC.length - 1));
    const profile = colorSoundProfile(shape.colorId);
    const shiftedIndex = scaleIndex + profile.degreeOffset;
    const octave = Math.floor(shiftedIndex / PENTATONIC.length);
    const pitchIndex = ((shiftedIndex % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length;
    const midiNote = root + (PENTATONIC[pitchIndex] ?? 0) + octave * 12;
    const instrumentId = instrumentForShape(shape);

    return this.triggerInstrument({
      instrumentId,
      midiNote,
      velocity: Math.min(0.8, (0.28 + size * 0.28) * profile.velocityScale),
      durationSeconds: previewDurationForInstrument(instrumentId, size) * profile.durationScale,
      when: context.currentTime + MIN_SCHEDULE_LEAD_SECONDS,
      pan: x * 1.5 - 0.75,
      seed: `${worldId}:${shape.id}:${shape.patternId}`,
    });
  }

  /** 選択・編集用の控えめなBGMを繰り返し、図形の試聴と同じ音量設定で鳴らす。 */
  startScreenBgm(worldId: WorldId): void {
    if (!this.isUnlocked) return;
    const events = buildBackingTrack(worldId, "float", 20260926).map((event) => ({
      ...event,
      velocity: event.velocity * 0.75,
    }));
    // 再生の完了通知で次の周回を開始し、停止時は既存のタイマー解除を利用する。
    const playLoop = () => {
      this.start(events, { onEnded: playLoop });
      this.screenBgmPlaying = true;
    };
    playLoop();
  }

  /** 画面BGMだけを停止し、画面遷移後に始まった作品の再生には触れない。 */
  stopScreenBgm(): void {
    if (this.screenBgmPlaying) this.stop();
  }

  start(
    events: readonly MusicEvent[],
    options?: PlaybackOptions,
  ): void;
  start(
    events: readonly MusicEvent[],
    bpm?: number,
    callbacks?: AudioEngineCallbacks,
  ): void;
  start(
    events: readonly MusicEvent[],
    optionsOrBpm: PlaybackOptions | number = {},
    legacyCallbacks: AudioEngineCallbacks = {},
  ): void {
    const context = this.requireRunningContext();
    this.screenBgmPlaying = false;
    const options: PlaybackOptions =
      typeof optionsOrBpm === "number"
        ? { bpm: optionsOrBpm, ...legacyCallbacks }
        : optionsOrBpm;

    this.cancelPlaybackLoops();
    this.releaseAllVoices(0.018);

    this.bpm = validBpm(options.bpm ?? BPM);
    this.totalBeats = validTotalBeats(options.totalBeats ?? TOTAL_BEATS);
    this.events = [...events]
      .filter(isPlayableEvent)
      .sort(compareMusicEvents)
      .filter((event) => event.beat < this.totalBeats);
    this.scheduledEventIds.clear();
    this.callbacks = {
      onTick: options.onTick,
      onEvent: options.onEvent,
      onEnded: options.onEnded,
    };

    const fromBeat = clamp(
      finiteOr(options.fromBeat, 0),
      0,
      this.totalBeats,
    );
    this.anchorBeat = fromBeat;
    this.pausedBeat = fromBeat;
    this.anchorTime = context.currentTime + START_LEAD_SECONDS;
    this.nextScheduleIndex = this.findFirstPotentiallyAudibleEvent(fromBeat);
    this.nextDispatchIndex = this.findFirstPotentiallyAudibleEvent(fromBeat);
    this.playbackState = "playing";

    this.runScheduler();
    this.schedulerTimer = setInterval(
      () => this.runScheduler(),
      SCHEDULER_INTERVAL_MS,
    );
    this.requestPlaybackFrame();
  }

  /** Alias useful to callers that name the primary action `play`. */
  play(events: readonly MusicEvent[], options: PlaybackOptions = {}): void {
    this.start(events, options);
  }

  pause(): void {
    if (this.playbackState !== "playing") {
      return;
    }

    this.pausedBeat = this.currentBeat();
    this.playbackState = "paused";
    this.cancelPlaybackLoops();
    this.releaseAllVoices(0.018);
    this.emitTick(this.snapshotAt(this.pausedBeat, false));
  }

  /** Resume should normally be called from the same user gesture as the UI action. */
  async resume(): Promise<boolean> {
    if (this.playbackState !== "paused") {
      return false;
    }

    const context = this.context;
    if (!context) {
      return false;
    }

    if (context.state === "suspended") {
      await context.resume();
    }
    if (context.state !== "running") {
      return false;
    }

    this.anchorBeat = this.pausedBeat;
    this.anchorTime = context.currentTime + START_LEAD_SECONDS;
    this.nextScheduleIndex = this.findFirstPotentiallyAudibleEvent(
      this.pausedBeat,
    );
    this.playbackState = "playing";
    this.runScheduler();
    this.schedulerTimer = setInterval(
      () => this.runScheduler(),
      SCHEDULER_INTERVAL_MS,
    );
    this.requestPlaybackFrame();
    return true;
  }

  stop(): void {
    this.screenBgmPlaying = false;
    if (this.playbackState === "disposed") {
      return;
    }

    const callbacks = this.callbacks;
    this.cancelPlaybackLoops();
    this.releaseAllVoices(0.018);
    this.playbackState = "stopped";
    this.anchorBeat = 0;
    this.pausedBeat = 0;
    this.nextScheduleIndex = 0;
    this.nextDispatchIndex = 0;
    this.scheduledEventIds.clear();
    this.events = [];

    callSafely(callbacks.onTick, this.snapshotAt(0, false));
    this.callbacks = {};
  }

  getSnapshot(): PlaybackSnapshot {
    const beat =
      this.playbackState === "playing"
        ? this.currentBeat()
        : this.playbackState === "paused"
          ? this.pausedBeat
          : 0;
    return this.snapshotAt(beat, this.playbackState === "playing");
  }

  /**
   * Adds a deliberately quiet pentatonic flourish. x/y are normalized canvas
   * coordinates. Calls are throttled and share the global polyphony ceiling.
   */
  liveConduct(x: number, y: number): boolean {
    const context = this.runningContextOrNull();
    if (!context || context.currentTime - this.lastConductTime < 0.1) {
      return false;
    }

    this.lastConductTime = context.currentTime;
    const normalizedX = clamp(finiteOr(x, 0.5), 0, 1);
    const normalizedY = clamp(finiteOr(y, 0.5), 0, 1);
    const scaleIndex = Math.round(
      (normalizedX * 0.6 + (1 - normalizedY) * 0.4) *
        (PENTATONIC.length - 1),
    );
    const midiNote = 57 + PENTATONIC[scaleIndex];
    const pan = normalizedX * 1.6 - 0.8;
    const now = context.currentTime + MIN_SCHEDULE_LEAD_SECONDS;
    const firstPlayed = this.triggerInstrument({
      instrumentId: "chime",
      midiNote,
      velocity: 0.24 + (1 - normalizedY) * 0.12,
      durationSeconds: 0.42,
      when: now,
      pan,
      seed: `conduct:${midiNote}:a`,
    });

    if (firstPlayed) {
      this.triggerInstrument({
        instrumentId: "glockenspiel",
        midiNote: midiNote + (normalizedY < 0.45 ? 7 : 5),
        velocity: 0.18,
        durationSeconds: 0.32,
        when: now + 0.095,
        pan: -pan * 0.45,
        seed: `conduct:${midiNote}:b`,
      });
    }

    return firstPlayed;
  }

  async dispose(): Promise<void> {
    if (this.playbackState === "disposed") {
      return;
    }

    this.cancelPlaybackLoops();
    this.releaseAllVoices(0.01);
    this.playbackState = "disposed";
    this.events = [];
    this.callbacks = {};
    this.scheduledEventIds.clear();

    const context = this.context;
    for (const voice of [...this.activeVoices]) {
      this.cleanupVoice(voice);
    }
    this.disconnectOutputGraph();
    this.context = null;

    if (context && context.state !== "closed") {
      await context.close();
    }
  }

  /** 圧縮後の音を2.5倍に増幅し、再生・BGM・録音へピークを抑えた共通出力を渡す。 */
  private buildOutputGraph(context: AudioContext): void {
    const masterGain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const outputBoost = context.createGain();
    const limiter = context.createDynamicsCompressor();

    masterGain.gain.value = this.volume * MAX_MASTER_GAIN;
    // 圧縮前に増幅すると増幅分が圧縮されるため、コンプレッサーの後で音量を上げる。
    outputBoost.gain.value = 2.5;

    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.2;

    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;

    masterGain.connect(compressor);
    compressor.connect(outputBoost);
    outputBoost.connect(limiter);
    limiter.connect(context.destination);

    this.masterGain = masterGain;
    this.compressor = compressor;
    this.outputBoost = outputBoost;
    this.limiter = limiter;
  }

  private disconnectOutputGraph(): void {
    this.stopCaptureStream();
    for (const node of [this.masterGain, this.compressor, this.outputBoost, this.limiter]) {
      try {
        node?.disconnect();
      } catch {
        // Already disconnected during browser teardown.
      }
    }
    this.masterGain = null;
    this.compressor = null;
    this.outputBoost = null;
    this.limiter = null;
  }

  private runScheduler(): void {
    if (this.playbackState !== "playing") {
      return;
    }

    const context = this.context;
    if (!context || context.state !== "running") {
      return;
    }

    const secondsPerBeat = 60 / this.bpm;
    const audibleBeat = this.currentBeat();
    const lookAheadBeat =
      this.anchorBeat +
      Math.max(
        0,
        context.currentTime + LOOK_AHEAD_SECONDS - this.anchorTime,
      ) /
        secondsPerBeat;

    while (this.nextScheduleIndex < this.events.length) {
      const event = this.events[this.nextScheduleIndex];
      if (event.beat > lookAheadBeat || event.beat >= this.totalBeats) {
        break;
      }
      this.nextScheduleIndex += 1;

      const audibleStartBeat = Math.max(
        event.beat,
        this.anchorBeat,
        audibleBeat,
      );
      const elapsedEventBeats = audibleStartBeat - event.beat;
      const remainingBeats = event.durationBeats - elapsedEventBeats;
      if (remainingBeats <= 0) {
        continue;
      }

      const idealStartTime =
        this.anchorTime +
        (audibleStartBeat - this.anchorBeat) * secondsPerBeat;
      const wasScheduled = this.triggerInstrument({
        instrumentId: event.instrumentId,
        midiNote: event.midiNote ?? defaultMidiNote(event.instrumentId),
        velocity: event.velocity,
        durationSeconds: remainingBeats * secondsPerBeat,
        when: Math.max(
          idealStartTime,
          context.currentTime + MIN_SCHEDULE_LEAD_SECONDS,
        ),
        seed: event.id,
        // The generated backing track stays underneath the child's shapes.
        // Foreground timeline notes may reclaim these low-priority voices when
        // the eight-voice safety cap is reached.
        priority: event.shapeId.startsWith("bgm:") ? "auxiliary" : "timeline",
      });
      if (wasScheduled) {
        this.scheduledEventIds.add(event.id);
      }
    }
  }

  private requestPlaybackFrame(): void {
    if (this.playbackState !== "playing") {
      return;
    }

    const run = () => {
      this.animationFrame = null;
      this.frameFallbackTimer = null;
      this.onPlaybackFrame();
    };

    if (typeof globalThis.requestAnimationFrame === "function") {
      this.animationFrame = globalThis.requestAnimationFrame(run);
    } else {
      this.frameFallbackTimer = setTimeout(run, 16);
    }
  }

  private onPlaybackFrame(): void {
    if (this.playbackState !== "playing") {
      return;
    }

    const context = this.context;
    const beat = this.currentBeat();
    const snapshot = this.snapshotAt(beat, true);

    if (context && context.currentTime >= this.anchorTime) {
      while (this.nextDispatchIndex < this.events.length) {
        const event = this.events[this.nextDispatchIndex];
        if (event.beat > beat + Number.EPSILON) {
          break;
        }
        this.nextDispatchIndex += 1;
        if (this.scheduledEventIds.has(event.id)) {
          callSafely(this.callbacks.onEvent, event, {
            ...snapshot,
            section: event.section,
          });
          this.scheduledEventIds.delete(event.id);
        }
      }
    }

    this.emitTick(snapshot);

    if (beat >= this.totalBeats) {
      this.finishNaturally();
      return;
    }
    this.requestPlaybackFrame();
  }

  private finishNaturally(): void {
    const callbacks = this.callbacks;
    this.cancelPlaybackLoops();
    this.releaseAllVoices(0.035);
    this.playbackState = "stopped";
    this.anchorBeat = this.totalBeats;
    this.pausedBeat = this.totalBeats;
    this.emitTick(this.snapshotAt(this.totalBeats, false));
    this.events = [];
    this.callbacks = {};
    this.scheduledEventIds.clear();
    callSafely(callbacks.onEnded);
  }

  private cancelPlaybackLoops(): void {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.animationFrame !== null) {
      globalThis.cancelAnimationFrame?.(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.frameFallbackTimer !== null) {
      clearTimeout(this.frameFallbackTimer);
      this.frameFallbackTimer = null;
    }
  }

  private currentBeat(): number {
    const context = this.context;
    if (!context) {
      return this.pausedBeat;
    }
    const elapsedSeconds = Math.max(0, context.currentTime - this.anchorTime);
    return clamp(
      this.anchorBeat + elapsedSeconds * (this.bpm / 60),
      0,
      this.totalBeats,
    );
  }

  private snapshotAt(beat: number, playing: boolean): PlaybackSnapshot {
    const safeBeat = clamp(finiteOr(beat, 0), 0, this.totalBeats);
    return {
      beat: safeBeat,
      progress: clamp(safeBeat / this.totalBeats, 0, 1),
      section: getSectionAtBeat(safeBeat),
      playing,
    };
  }

  private emitTick(snapshot: PlaybackSnapshot): void {
    callSafely(this.callbacks.onTick, snapshot);
  }

  private findFirstPotentiallyAudibleEvent(beat: number): number {
    const index = this.events.findIndex(
      (event) => event.beat + event.durationBeats > beat,
    );
    return index === -1 ? this.events.length : index;
  }

  private triggerInstrument(options: TriggerOptions): boolean {
    const context = this.runningContextOrNull();
    if (
      !context ||
      !this.masterGain
    ) {
      return false;
    }

    const when = Math.max(
      finiteOr(options.when, context.currentTime),
      context.currentTime + MIN_SCHEDULE_LEAD_SECONDS,
    );
    const midiNote = clamp(Math.round(finiteOr(options.midiNote, 60)), 32, 96);
    const velocity = clamp(finiteOr(options.velocity, 0.5), 0.04, 1);
    const durationSeconds = clamp(
      finiteOr(options.durationSeconds, 0.4),
      0.06,
      8,
    );
    const pan = clamp(finiteOr(options.pan, 0), -0.85, 0.85);
    const priority = options.priority ?? "auxiliary";

    switch (options.instrumentId) {
      case "marimba":
        return this.triggerMarimba(
          midiNote,
          velocity,
          durationSeconds,
          when,
          pan,
          priority,
        );
      case "drum":
        return this.triggerDrum(
          midiNote,
          velocity,
          when,
          pan,
          options.seed,
          priority,
        );
      case "piano":
        return this.triggerPiano(
          midiNote,
          velocity,
          durationSeconds,
          when,
          pan,
          priority,
        );
      case "harp":
        return this.triggerHarp(
          midiNote,
          velocity,
          durationSeconds,
          when,
          pan,
          priority,
        );
      case "glockenspiel":
        return this.triggerGlockenspiel(
          midiNote,
          velocity,
          durationSeconds,
          when,
          pan,
          priority,
        );
      case "kalimba":
        return this.triggerKalimba(
          midiNote,
          velocity,
          durationSeconds,
          when,
          pan,
          priority,
        );
      case "chime":
        return this.triggerChime(
          midiNote,
          velocity,
          durationSeconds,
          when,
          pan,
          priority,
        );
      case "flute":
        return this.triggerFlute(
          midiNote,
          velocity,
          durationSeconds,
          when,
          pan,
          priority,
        );
      case "bell":
        return this.triggerBell(
          midiNote,
          velocity,
          durationSeconds,
          when,
          pan,
          priority,
        );
      case "percussion":
        return this.triggerPercussion(
          midiNote,
          velocity,
          when,
          pan,
          options.seed,
          priority,
        );
      case "bass":
        return this.triggerBass(
          midiNote,
          velocity,
          durationSeconds,
          when,
          pan,
          priority,
        );
      case "pad":
        return this.triggerPad(
          midiNote,
          velocity,
          durationSeconds,
          when,
          pan,
          priority,
        );
    }
  }

  /** A short wooden-bar tone: rounded fundamental with one dry upper partial. */
  private triggerMarimba(
    midiNote: number,
    velocity: number,
    requestedDuration: number,
    when: number,
    pan: number,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = clamp(requestedDuration, 0.28, 1.35);
    const voice = this.createVoice(pan, when, when + duration + 0.025, priority);
    if (!voice) return false;

    const fundamental = context.createOscillator();
    const woodenPartial = context.createOscillator();
    const partialGain = context.createGain();
    const filter = context.createBiquadFilter();
    const frequency = midiToFrequency(clamp(midiNote, 48, 84));

    fundamental.type = "sine";
    fundamental.frequency.setValueAtTime(frequency, when);
    woodenPartial.type = "sine";
    woodenPartial.frequency.setValueAtTime(frequency * 3.98, when);
    partialGain.gain.setValueAtTime(0.12, when);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2600, when);
    filter.Q.setValueAtTime(0.7, when);

    fundamental.connect(filter);
    woodenPartial.connect(partialGain);
    partialGain.connect(filter);
    filter.connect(voice.gain);
    voice.nodes.add(fundamental);
    voice.nodes.add(woodenPartial);
    voice.nodes.add(partialGain);
    voice.nodes.add(filter);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.17,
      0.003,
      0.13,
      0.035,
      Math.min(0.24, duration * 0.45),
    );
    this.startSource(voice, fundamental, when, when + duration + 0.025);
    this.startSource(voice, woodenPartial, when, when + duration + 0.025);
    return true;
  }

  /** A gentle low tom with a tiny filtered-noise mallet attack. */
  private triggerDrum(
    midiNote: number,
    velocity: number,
    when: number,
    pan: number,
    seed: string,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = 0.3;
    const voice = this.createVoice(pan * 0.6, when, when + duration + 0.02, priority);
    if (!voice) return false;

    const body = context.createOscillator();
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const startFrequency = clamp(midiToFrequency(midiNote - 12), 105, 210);

    body.type = "sine";
    body.frequency.setValueAtTime(startFrequency, when);
    body.frequency.exponentialRampToValueAtTime(
      Math.max(58, startFrequency * 0.48),
      when + 0.14,
    );
    noise.buffer = createDeterministicNoiseBuffer(context, `${seed}:drum`, duration);
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(850, when);
    noiseFilter.Q.setValueAtTime(0.5, when);
    noiseGain.gain.setValueAtTime(0.09, when);

    body.connect(voice.gain);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(voice.gain);
    voice.nodes.add(body);
    voice.nodes.add(noise);
    voice.nodes.add(noiseFilter);
    voice.nodes.add(noiseGain);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.18,
      0.003,
      0.07,
      0.06,
      0.15,
    );
    this.startSource(voice, body, when, when + duration + 0.02);
    this.startSource(voice, noise, when, when + duration + 0.02);
    return true;
  }

  /** A soft toy-piano colour made from a filtered string-like harmonic stack. */
  private triggerPiano(
    midiNote: number,
    velocity: number,
    requestedDuration: number,
    when: number,
    pan: number,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = clamp(requestedDuration, 0.4, 2.3);
    const voice = this.createVoice(pan, when, when + duration + 0.03, priority);
    if (!voice) return false;

    const fundamental = context.createOscillator();
    const octave = context.createOscillator();
    const thirdPartial = context.createOscillator();
    const octaveGain = context.createGain();
    const thirdGain = context.createGain();
    const filter = context.createBiquadFilter();
    const frequency = midiToFrequency(clamp(midiNote, 45, 84));

    fundamental.type = "triangle";
    fundamental.frequency.setValueAtTime(frequency, when);
    octave.type = "sine";
    octave.frequency.setValueAtTime(frequency * 2.002, when);
    thirdPartial.type = "sine";
    thirdPartial.frequency.setValueAtTime(frequency * 3.01, when);
    octaveGain.gain.setValueAtTime(0.15, when);
    thirdGain.gain.setValueAtTime(0.055, when);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3000, when);
    filter.frequency.exponentialRampToValueAtTime(1150, when + duration);
    filter.Q.setValueAtTime(0.55, when);

    fundamental.connect(filter);
    octave.connect(octaveGain);
    octaveGain.connect(filter);
    thirdPartial.connect(thirdGain);
    thirdGain.connect(filter);
    filter.connect(voice.gain);
    voice.nodes.add(fundamental);
    voice.nodes.add(octave);
    voice.nodes.add(thirdPartial);
    voice.nodes.add(octaveGain);
    voice.nodes.add(thirdGain);
    voice.nodes.add(filter);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.135,
      0.004,
      0.24,
      0.12,
      Math.min(0.38, duration * 0.35),
    );
    const stopAt = when + duration + 0.03;
    this.startSource(voice, fundamental, when, stopAt);
    this.startSource(voice, octave, when, stopAt);
    this.startSource(voice, thirdPartial, when, stopAt);
    return true;
  }

  /** A bright, quickly plucked string with a softer octave response. */
  private triggerHarp(
    midiNote: number,
    velocity: number,
    requestedDuration: number,
    when: number,
    pan: number,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = clamp(requestedDuration, 0.42, 2.6);
    const voice = this.createVoice(pan, when, when + duration + 0.025, priority);
    if (!voice) return false;

    const string = context.createOscillator();
    const octave = context.createOscillator();
    const octaveGain = context.createGain();
    const filter = context.createBiquadFilter();
    const frequency = midiToFrequency(clamp(midiNote, 48, 88));

    string.type = "triangle";
    string.frequency.setValueAtTime(frequency, when);
    octave.type = "sine";
    octave.frequency.setValueAtTime(frequency * 2.005, when);
    octaveGain.gain.setValueAtTime(0.18, when);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(4300, when);
    filter.frequency.exponentialRampToValueAtTime(900, when + duration);
    filter.Q.setValueAtTime(0.45, when);

    string.connect(filter);
    octave.connect(octaveGain);
    octaveGain.connect(filter);
    filter.connect(voice.gain);
    voice.nodes.add(string);
    voice.nodes.add(octave);
    voice.nodes.add(octaveGain);
    voice.nodes.add(filter);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.13,
      0.002,
      0.2,
      0.045,
      Math.min(0.48, duration * 0.45),
    );
    this.startSource(voice, string, when, when + duration + 0.025);
    this.startSource(voice, octave, when, when + duration + 0.025);
    return true;
  }

  /** A high metal-bar ring using deliberately inharmonic partials. */
  private triggerGlockenspiel(
    midiNote: number,
    velocity: number,
    requestedDuration: number,
    when: number,
    pan: number,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = clamp(requestedDuration, 0.52, 2.8);
    const voice = this.createVoice(pan, when, when + duration + 0.03, priority);
    if (!voice) return false;

    const base = context.createOscillator();
    const metalA = context.createOscillator();
    const metalB = context.createOscillator();
    const metalAGain = context.createGain();
    const metalBGain = context.createGain();
    const frequency = midiToFrequency(clamp(midiNote + 12, 67, 96));

    base.type = "sine";
    base.frequency.setValueAtTime(frequency, when);
    metalA.type = "sine";
    metalA.frequency.setValueAtTime(frequency * 2.76, when);
    metalB.type = "sine";
    metalB.frequency.setValueAtTime(frequency * 5.4, when);
    metalAGain.gain.setValueAtTime(0.2, when);
    metalBGain.gain.setValueAtTime(0.07, when);

    base.connect(voice.gain);
    metalA.connect(metalAGain);
    metalAGain.connect(voice.gain);
    metalB.connect(metalBGain);
    metalBGain.connect(voice.gain);
    voice.nodes.add(base);
    voice.nodes.add(metalA);
    voice.nodes.add(metalB);
    voice.nodes.add(metalAGain);
    voice.nodes.add(metalBGain);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.105,
      0.002,
      0.24,
      0.075,
      Math.min(0.7, duration * 0.5),
    );
    const stopAt = when + duration + 0.03;
    this.startSource(voice, base, when, stopAt);
    this.startSource(voice, metalA, when, stopAt);
    this.startSource(voice, metalB, when, stopAt);
    return true;
  }

  /** A hollow thumb-piano pluck with a quiet resonating tine. */
  private triggerKalimba(
    midiNote: number,
    velocity: number,
    requestedDuration: number,
    when: number,
    pan: number,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = clamp(requestedDuration, 0.34, 1.75);
    const voice = this.createVoice(pan, when, when + duration + 0.025, priority);
    if (!voice) return false;

    const tine = context.createOscillator();
    const shimmer = context.createOscillator();
    const shimmerGain = context.createGain();
    const resonator = context.createBiquadFilter();
    const frequency = midiToFrequency(clamp(midiNote, 52, 88));

    tine.type = "sine";
    tine.frequency.setValueAtTime(frequency, when);
    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(frequency * 2.02, when);
    shimmerGain.gain.setValueAtTime(0.11, when);
    resonator.type = "lowpass";
    resonator.frequency.setValueAtTime(2100, when);
    resonator.Q.setValueAtTime(1.3, when);

    tine.connect(resonator);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(resonator);
    resonator.connect(voice.gain);
    voice.nodes.add(tine);
    voice.nodes.add(shimmer);
    voice.nodes.add(shimmerGain);
    voice.nodes.add(resonator);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.145,
      0.002,
      0.16,
      0.035,
      Math.min(0.36, duration * 0.42),
    );
    this.startSource(voice, tine, when, when + duration + 0.025);
    this.startSource(voice, shimmer, when, when + duration + 0.025);
    return true;
  }

  /** A slow sparkling chime with three soft, slightly inharmonic rings. */
  private triggerChime(
    midiNote: number,
    velocity: number,
    requestedDuration: number,
    when: number,
    pan: number,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = clamp(requestedDuration, 0.65, 3.5);
    const voice = this.createVoice(pan, when, when + duration + 0.03, priority);
    if (!voice) return false;

    const base = context.createOscillator();
    const upperA = context.createOscillator();
    const upperB = context.createOscillator();
    const upperAGain = context.createGain();
    const upperBGain = context.createGain();
    const frequency = midiToFrequency(clamp(midiNote, 55, 88));

    base.type = "sine";
    base.frequency.setValueAtTime(frequency, when);
    upperA.type = "sine";
    upperA.frequency.setValueAtTime(frequency * 2.01, when);
    upperB.type = "sine";
    upperB.frequency.setValueAtTime(frequency * 3.96, when);
    upperAGain.gain.setValueAtTime(0.16, when);
    upperBGain.gain.setValueAtTime(0.075, when);

    base.connect(voice.gain);
    upperA.connect(upperAGain);
    upperAGain.connect(voice.gain);
    upperB.connect(upperBGain);
    upperBGain.connect(voice.gain);
    voice.nodes.add(base);
    voice.nodes.add(upperA);
    voice.nodes.add(upperB);
    voice.nodes.add(upperAGain);
    voice.nodes.add(upperBGain);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.09,
      0.006,
      0.3,
      0.12,
      Math.min(0.9, duration * 0.55),
    );
    const stopAt = when + duration + 0.03;
    this.startSource(voice, base, when, stopAt);
    this.startSource(voice, upperA, when, stopAt);
    this.startSource(voice, upperB, when, stopAt);
    return true;
  }

  /** A rounded sine flute with gentle breath onset and restrained vibrato. */
  private triggerFlute(
    midiNote: number,
    velocity: number,
    requestedDuration: number,
    when: number,
    pan: number,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = clamp(requestedDuration, 0.38, 3.4);
    const voice = this.createVoice(pan, when, when + duration + 0.03, priority);
    if (!voice) return false;

    const tone = context.createOscillator();
    const airyHarmonic = context.createOscillator();
    const harmonicGain = context.createGain();
    const vibrato = context.createOscillator();
    const vibratoDepth = context.createGain();
    const filter = context.createBiquadFilter();
    const frequency = midiToFrequency(clamp(midiNote, 55, 88));

    tone.type = "sine";
    tone.frequency.setValueAtTime(frequency, when);
    airyHarmonic.type = "triangle";
    airyHarmonic.frequency.setValueAtTime(frequency * 2, when);
    harmonicGain.gain.setValueAtTime(0.045, when);
    vibrato.type = "sine";
    vibrato.frequency.setValueAtTime(5.1, when);
    vibratoDepth.gain.setValueAtTime(5.5, when);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2500, when);
    filter.Q.setValueAtTime(0.35, when);

    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(tone.detune);
    vibratoDepth.connect(airyHarmonic.detune);
    tone.connect(filter);
    airyHarmonic.connect(harmonicGain);
    harmonicGain.connect(filter);
    filter.connect(voice.gain);
    voice.nodes.add(tone);
    voice.nodes.add(airyHarmonic);
    voice.nodes.add(harmonicGain);
    voice.nodes.add(vibrato);
    voice.nodes.add(vibratoDepth);
    voice.nodes.add(filter);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.105,
      Math.min(0.075, duration * 0.2),
      0.1,
      0.78,
      Math.min(0.24, duration * 0.32),
    );
    const stopAt = when + duration + 0.03;
    this.startSource(voice, tone, when, stopAt);
    this.startSource(voice, airyHarmonic, when, stopAt);
    this.startSource(voice, vibrato, when, stopAt);
    return true;
  }

  private triggerBell(
    midiNote: number,
    velocity: number,
    requestedDuration: number,
    when: number,
    pan: number,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = clamp(requestedDuration, 0.18, 2.2);
    const voice = this.createVoice(
      pan,
      when,
      when + duration + 0.025,
      priority,
    );
    if (!voice) {
      return false;
    }

    const fundamental = context.createOscillator();
    const overtone = context.createOscillator();
    const overtoneGain = context.createGain();
    const frequency = midiToFrequency(midiNote);

    fundamental.type = "sine";
    fundamental.frequency.setValueAtTime(frequency, when);
    overtone.type = "sine";
    overtone.frequency.setValueAtTime(frequency * 2.01, when);
    overtoneGain.gain.setValueAtTime(0.16, when);

    fundamental.connect(voice.gain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(voice.gain);
    voice.nodes.add(fundamental);
    voice.nodes.add(overtone);
    voice.nodes.add(overtoneGain);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.18,
      0.008,
      0.11,
      0.28,
      Math.min(0.42, duration * 0.55),
    );
    this.startSource(voice, fundamental, when, when + duration + 0.025);
    this.startSource(voice, overtone, when, when + duration + 0.025);
    return true;
  }

  private triggerPercussion(
    midiNote: number,
    velocity: number,
    when: number,
    pan: number,
    seed: string,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = 0.16;
    const voice = this.createVoice(
      pan,
      when,
      when + duration + 0.015,
      priority,
    );
    if (!voice) {
      return false;
    }

    const oscillator = context.createOscillator();
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    const frequency = clamp(midiToFrequency(midiNote), 115, 520);

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(65, frequency * 0.28),
      when + 0.085,
    );

    noise.buffer = createDeterministicNoiseBuffer(context, seed, duration);
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(clamp(frequency * 3, 650, 2400), when);
    noiseFilter.Q.setValueAtTime(0.75, when);
    noiseGain.gain.setValueAtTime(0.22, when);

    oscillator.connect(voice.gain);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(voice.gain);
    voice.nodes.add(oscillator);
    voice.nodes.add(noise);
    voice.nodes.add(noiseFilter);
    voice.nodes.add(noiseGain);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.19,
      0.002,
      0.035,
      0.22,
      0.075,
    );
    this.startSource(voice, oscillator, when, when + duration + 0.015);
    this.startSource(voice, noise, when, when + duration + 0.015);
    return true;
  }

  private triggerBass(
    midiNote: number,
    velocity: number,
    requestedDuration: number,
    when: number,
    pan: number,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = clamp(requestedDuration, 0.2, 2.6);
    const voice = this.createVoice(
      pan * 0.35,
      when,
      when + duration + 0.02,
      priority,
    );
    if (!voice) {
      return false;
    }

    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    let bassNote = midiNote;
    while (bassNote > 58) {
      bassNote -= 12;
    }

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(
      midiToFrequency(clamp(bassNote, 34, 58)),
      when,
    );
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(620, when);
    filter.Q.setValueAtTime(0.65, when);

    oscillator.connect(filter);
    filter.connect(voice.gain);
    voice.nodes.add(oscillator);
    voice.nodes.add(filter);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.16,
      0.018,
      0.08,
      0.68,
      Math.min(0.22, duration * 0.35),
    );
    this.startSource(voice, oscillator, when, when + duration + 0.02);
    return true;
  }

  private triggerPad(
    midiNote: number,
    velocity: number,
    requestedDuration: number,
    when: number,
    pan: number,
    priority: VoicePriority,
  ): boolean {
    const context = this.requireRunningContext();
    const duration = clamp(requestedDuration, 0.45, 5.5);
    const voice = this.createVoice(
      pan * 0.7,
      when,
      when + duration + 0.03,
      priority,
    );
    if (!voice) {
      return false;
    }

    const oscillatorA = context.createOscillator();
    const oscillatorB = context.createOscillator();
    const oscillatorBGain = context.createGain();
    const filter = context.createBiquadFilter();
    const frequency = midiToFrequency(clamp(midiNote, 45, 79));

    oscillatorA.type = "sine";
    oscillatorA.frequency.setValueAtTime(frequency, when);
    oscillatorB.type = "triangle";
    oscillatorB.frequency.setValueAtTime(frequency, when);
    oscillatorB.detune.setValueAtTime(5, when);
    oscillatorBGain.gain.setValueAtTime(0.24, when);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1250, when);
    filter.Q.setValueAtTime(0.4, when);

    oscillatorA.connect(filter);
    oscillatorB.connect(oscillatorBGain);
    oscillatorBGain.connect(filter);
    filter.connect(voice.gain);
    voice.nodes.add(oscillatorA);
    voice.nodes.add(oscillatorB);
    voice.nodes.add(oscillatorBGain);
    voice.nodes.add(filter);

    applyEnvelope(
      voice.gain.gain,
      when,
      when + duration,
      velocity * 0.105,
      Math.min(0.28, duration * 0.25),
      0.16,
      0.74,
      Math.min(0.5, duration * 0.35),
    );
    this.startSource(voice, oscillatorA, when, when + duration + 0.03);
    this.startSource(voice, oscillatorB, when, when + duration + 0.03);
    return true;
  }

  private createVoice(
    pan: number,
    startTime: number,
    endTime: number,
    priority: VoicePriority,
  ): ActiveVoice | null {
    const context = this.runningContextOrNull();
    const masterGain = this.masterGain;
    if (!context || !masterGain) {
      return null;
    }

    let overlappingVoices = [...this.activeVoices].filter(
      (voice) =>
        !voice.releasing &&
        voice.startTime < endTime &&
        voice.endTime > startTime,
    );

    // Timeline notes have priority over transient preview/conduct voices. The
    // deterministic arrangement already caps itself at eight overlapping notes.
    if (
      priority === "timeline" &&
      overlappingVoices.length >= MAX_POLYPHONY
    ) {
      const auxiliaryVoices = overlappingVoices.filter(
        (voice) => voice.priority === "auxiliary",
      );
      for (const voice of auxiliaryVoices) {
        this.releaseVoice(voice, 0.012);
        overlappingVoices = overlappingVoices.filter(
          (candidate) => candidate !== voice,
        );
        if (overlappingVoices.length < MAX_POLYPHONY) {
          break;
        }
      }
    }
    if (overlappingVoices.length >= MAX_POLYPHONY) {
      return null;
    }

    const gain = context.createGain();
    const panner = context.createStereoPanner();
    gain.gain.value = MIN_GAIN;
    panner.pan.value = clamp(pan, -0.85, 0.85);
    gain.connect(panner);
    panner.connect(masterGain);

    const voice: ActiveVoice = {
      gain,
      nodes: new Set<AudioNode>([gain, panner]),
      sources: new Set<AudioScheduledSourceNode>(),
      startTime,
      priority,
      endTime,
      releasing: false,
    };
    this.activeVoices.add(voice);
    return voice;
  }

  private startSource(
    voice: ActiveVoice,
    source: AudioScheduledSourceNode,
    when: number,
    stopAt: number,
  ): void {
    voice.sources.add(source);
    source.addEventListener(
      "ended",
      () => {
        voice.sources.delete(source);
        if (voice.sources.size === 0) {
          this.cleanupVoice(voice);
        }
      },
      { once: true },
    );
    source.start(when);
    source.stop(Math.max(stopAt, when + 0.01));
  }

  private releaseAllVoices(fadeSeconds: number): void {
    for (const voice of [...this.activeVoices]) {
      this.releaseVoice(voice, fadeSeconds);
    }
  }

  private releaseVoice(voice: ActiveVoice, fadeSeconds: number): void {
    const context = this.context;
    if (!context || voice.releasing) {
      return;
    }

    const now = context.currentTime;
    const stopAt = now + Math.max(0.008, fadeSeconds);
    voice.releasing = true;
    voice.endTime = stopAt + 0.002;
    const gain = voice.gain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(MIN_GAIN, gain.value), now);
    gain.exponentialRampToValueAtTime(MIN_GAIN, stopAt);
    for (const source of voice.sources) {
      try {
        source.stop(stopAt + 0.002);
      } catch {
        // A source that naturally ended between frames needs no further work.
      }
    }
  }

  private cleanupVoice(voice: ActiveVoice): void {
    if (!this.activeVoices.delete(voice)) {
      return;
    }
    for (const node of voice.nodes) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected during context shutdown.
      }
    }
    voice.nodes.clear();
    voice.sources.clear();
  }

  private runningContextOrNull(): AudioContext | null {
    if (this.playbackState === "disposed") {
      return null;
    }
    return this.context?.state === "running" ? this.context : null;
  }

  private requireRunningContext(): AudioContext {
    this.assertNotDisposed();
    const context = this.runningContextOrNull();
    if (!context) {
      throw new Error(
        "Audio is locked. Call audioEngine.unlock() from a user tap or click first.",
      );
    }
    return context;
  }

  private assertNotDisposed(): void {
    if (this.playbackState === "disposed") {
      throw new Error("This AudioEngine has been disposed.");
    }
  }
}

function applyEnvelope(
  parameter: AudioParam,
  start: number,
  end: number,
  peak: number,
  attackSeconds: number,
  decaySeconds: number,
  sustainRatio: number,
  releaseSeconds: number,
): void {
  const duration = Math.max(0.02, end - start);
  const attackEnd = start + Math.min(attackSeconds, duration * 0.3);
  const decayEnd = Math.min(
    start + duration * 0.58,
    attackEnd + Math.min(decaySeconds, duration * 0.25),
  );
  const releaseStart = Math.max(decayEnd + 0.001, end - releaseSeconds);
  const sustain = Math.max(MIN_GAIN, peak * sustainRatio);

  parameter.cancelScheduledValues(start);
  parameter.setValueAtTime(MIN_GAIN, start);
  parameter.linearRampToValueAtTime(Math.max(MIN_GAIN, peak), attackEnd);
  parameter.exponentialRampToValueAtTime(sustain, decayEnd);
  parameter.setValueAtTime(sustain, releaseStart);
  parameter.exponentialRampToValueAtTime(MIN_GAIN, end);
}

function createDeterministicNoiseBuffer(
  context: AudioContext,
  seedText: string,
  durationSeconds: number,
): AudioBuffer {
  const frameCount = Math.max(
    1,
    Math.ceil(context.sampleRate * durationSeconds),
  );
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = hashString(seedText) || 0x6d2b79f5;

  for (let index = 0; index < samples.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    samples[index] = ((state >>> 0) / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function midiToFrequency(midiNote: number): number {
  return 440 * 2 ** ((midiNote - 69) / 12);
}

function defaultMidiNote(instrumentId: InstrumentId): number {
  switch (instrumentId) {
    case "marimba":
      return 64;
    case "drum":
      return 48;
    case "piano":
      return 60;
    case "harp":
      return 67;
    case "glockenspiel":
      return 72;
    case "kalimba":
      return 65;
    case "chime":
      return 69;
    case "flute":
      return 67;
    case "bell":
      return 72;
    case "percussion":
      return 60;
    case "bass":
      return 43;
    case "pad":
      return 60;
  }
}

function previewDurationForInstrument(
  instrumentId: InstrumentId,
  normalizedSize: number,
): number {
  const size = clamp(normalizedSize, 0, 1);
  switch (instrumentId) {
    case "drum":
    case "percussion":
      return 0.3;
    case "marimba":
    case "kalimba":
      return 0.38 + size * 0.42;
    case "piano":
    case "harp":
      return 0.52 + size * 0.68;
    case "glockenspiel":
    case "bell":
      return 0.72 + size * 0.8;
    case "chime":
      return 0.9 + size * 1.05;
    case "flute":
      return 0.68 + size * 0.78;
    case "bass":
      return 0.42 + size * 0.58;
    case "pad":
      return 0.65 + size * 0.8;
  }
}

function normalizedShapeSize(size: number): number {
  const safeSize = Math.max(0, finiteOr(size, 0.5));
  return clamp(safeSize <= 1 ? safeSize : safeSize / 180, 0, 1);
}

function validBpm(value: number): number {
  if (!Number.isFinite(value) || value < 30 || value > 240) {
    throw new RangeError("bpm must be a finite value between 30 and 240.");
  }
  return value;
}

function validTotalBeats(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("totalBeats must be a positive finite value.");
  }
  return value;
}

function isPlayableEvent(event: MusicEvent): boolean {
  return (
    Number.isFinite(event.beat) &&
    event.beat >= 0 &&
    Number.isFinite(event.durationBeats) &&
    event.durationBeats > 0 &&
    Number.isFinite(event.velocity)
  );
}

function compareMusicEvents(left: MusicEvent, right: MusicEvent): number {
  return (
    left.beat - right.beat ||
    left.id.localeCompare(right.id) ||
    left.shapeId.localeCompare(right.shapeId)
  );
}

function lowerBoundEventBeat(
  events: readonly MusicEvent[],
  targetBeat: number,
): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle].beat < targetBeat) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function callSafely<Arguments extends readonly unknown[]>(
  callback: ((...args: Arguments) => void) | undefined,
  ...args: Arguments
): void {
  if (!callback) {
    return;
  }
  try {
    callback(...args);
  } catch (error) {
    console.error("OtoCanvas audio callback failed", error);
  }
}

export const audioEngine = new AudioEngine();

export default audioEngine;
