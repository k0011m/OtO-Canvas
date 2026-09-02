import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CanvasEditor } from "../canvas/CanvasEditor";
import { ProjectThumbnail } from "./ProjectThumbnail";
import { downloadJacketPng, downloadRecordedVideo } from "../export/artworkExporter";
import { exportAndDownloadWav } from "../export/wavExporter";
import { audioEngine } from "../music/audioEngine";
import { buildArrangement, createProject, getSectionAtBeat } from "../music/arranger";
import { buildBackingTrack } from "../music/backingTrack";
import {
  clearProjects,
  deleteProject,
  listProjects,
  loadLatestProject,
  saveProject,
} from "../storage/projectStore";
import {
  colorSoundProfile,
  relationshipCount,
  sceneForBeat,
  shapesForScene,
} from "../music/creativeRules";
import {
  BARS,
  BPM,
  DURATION_SECONDS,
  SHAPE_COLOR_PALETTE,
  STAMP_SHAPE_KINDS,
  TOTAL_BEATS,
  WORLDS,
  type CanvasShape,
  type OtoProject,
  type PlaybackSnapshot,
  type SceneIndex,
  type ShapeKind,
  type WorldId,
} from "../types/project";
import { createId, seedFromText } from "../utils/id";
import {
  PerformanceCanvas,
  type ConductGesture,
} from "../visuals/PerformanceCanvas";
import {
  DEFAULT_ANIMATION_MOOD,
  type AnimationMood,
} from "../visuals/animationMood";

type Screen = "start" | "world" | "create" | "perform" | "finish" | "gallery";
const EMPTY_PLAYBACK: PlaybackSnapshot = {
  beat: 0,
  progress: 0,
  section: "intro",
  playing: false,
};

const SHAPE_LABELS: Record<ShapeKind, string> = {
  circle: "まる",
  triangle: "さんかく",
  line: "せん",
  square: "しかく",
  diamond: "ひしがた",
  star: "ほし",
  hexagon: "ろっかく",
  ring: "わっか",
  pen: "おえかきペン",
};

const SHAPE_INSTRUMENT_LABELS: Record<ShapeKind, string> = {
  circle: "マリンバ",
  triangle: "たいこ",
  line: "ベース",
  square: "ピアノ",
  diamond: "ハープ",
  star: "てっきん",
  hexagon: "カリンバ",
  ring: "チャイム",
  pen: "フルート",
};

const CREATION_TOOLS: readonly ShapeKind[] = [...STAMP_SHAPE_KINDS, "pen"];

const SECTION_LABELS = {
  intro: "はじまり",
  a: "ひろがる",
  b: "へんしん",
  break: "ひとやすみ",
  climax: "おおきな おと",
  outro: "おしまい",
} as const;

const ANIMATION_MOOD_OPTIONS: ReadonlyArray<{
  id: AnimationMood;
  name: string;
  motion: string;
  bgm: string;
}> = [
  { id: "float", name: "ゆらゆら", motion: "なめらか", bgm: "やさしいBGM" },
  { id: "pop", name: "はじける", motion: "ぴょんぴょん", bgm: "リズムBGM" },
  { id: "cosmic", name: "ぐるぐる", motion: "うずを えがく", bgm: "うちゅうBGM" },
];

function animationMoodOption(mood: AnimationMood) {
  return ANIMATION_MOOD_OPTIONS.find((option) => option.id === mood) ?? ANIMATION_MOOD_OPTIONS[0];
}

function cloneShapes(shapes: readonly CanvasShape[]): CanvasShape[] {
  return shapes.map((shape) => ({
    ...shape,
    position: { ...shape.position },
    points: shape.points?.map((point) => ({ ...point })),
  }));
}

function worldStyle(worldId: WorldId): CSSProperties {
  const world = WORLDS[worldId];
  return {
    "--bg": world.background,
    "--surface": world.surface,
    "--ink": world.ink,
    "--circle": world.circle,
    "--triangle": world.triangle,
    "--line": world.line,
    "--accent": world.accent,
  } as CSSProperties;
}

function WorldPreview({ worldId }: { worldId: WorldId }) {
  const world = WORLDS[worldId];
  const style = {
    "--card-bg": world.background,
    "--card-ink": world.ink,
    "--card-circle": world.circle,
    "--card-triangle": world.triangle,
    "--card-line": world.line,
  } as CSSProperties;

  return (
    <div className="world-preview" style={style} aria-hidden="true">
      <span className="preview-circle" />
      <span className="preview-triangle" />
      <span className="preview-line" />
    </div>
  );
}

function BrandShapes() {
  return (
    <div className="brand-shapes" aria-hidden="true">
      <span className="brand-circle" />
      <span className="brand-triangle" />
      <span className="brand-line" />
    </div>
  );
}

function ToolIcon({ kind }: { kind: ShapeKind }) {
  return <span className={`tool-shape-${kind}`} aria-hidden="true" />;
}

function demoShape(worldId: WorldId): CanvasShape {
  const kind: ShapeKind = worldId === "soft" ? "circle" : worldId === "bounce" ? "triangle" : "line";
  return {
    id: `world-${worldId}`,
    kind,
    position: { x: 0.5, y: worldId === "space" ? 0.38 : 0.5 },
    size: worldId === "space" ? 0.13 : 0.22,
    rotation: worldId === "bounce" ? 0.12 : -0.08,
    colorId: kind,
    patternId: worldId === "space" ? "line-pad" : `${kind}-1`,
    zIndex: 0,
  };
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("start");
  const [worldId, setWorldId] = useState<WorldId>("soft");
  const [shapes, setShapes] = useState<CanvasShape[]>([]);
  const [currentScene, setCurrentScene] = useState<SceneIndex>(0);
  const [projectTitle, setProjectTitle] = useState("わたしのおと");
  const [galleryProjects, setGalleryProjects] = useState<OtoProject[]>([]);
  const [selectedKind, setSelectedKind] = useState<ShapeKind>("circle");
  const [selectedColorId, setSelectedColorId] = useState("sun");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<CanvasShape[][]>([]);
  const [playback, setPlayback] = useState<PlaybackSnapshot>(EMPTY_PLAYBACK);
  const [restoredProject, setRestoredProject] = useState<Awaited<ReturnType<typeof loadLatestProject>>>(null);
  const [parentOpen, setParentOpen] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [animationMood, setAnimationMood] = useState<AnimationMood>(DEFAULT_ANIMATION_MOOD);
  const [moodPickerOpen, setMoodPickerOpen] = useState(false);
  const [remixVersion, setRemixVersion] = useState(0);
  const [recordingVideo, setRecordingVideo] = useState(false);

  const projectIdRef = useRef(createId("project"));
  const createdAtRef = useRef(Date.now());
  const seedRef = useRef(seedFromText(projectIdRef.current));
  const saveTimerRef = useRef<number | null>(null);
  const playButtonRef = useRef<HTMLButtonElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const lastLiveShapeAtRef = useRef(0);

  const theme = WORLDS[worldId];
  const events = useMemo(
    () => buildArrangement(shapes, seedRef.current, worldId),
    [remixVersion, shapes, worldId],
  );
  const mixedEvents = useMemo(
    () =>
      [
        ...events,
        ...buildBackingTrack(worldId, animationMood, seedRef.current),
      ].sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id)),
    [animationMood, events, worldId],
  );
  const activeMood = animationMoodOption(animationMood);
  const activeShapes = useMemo(
    () => shapes.filter((shape) => (shape.scene ?? 0) === currentScene),
    [currentScene, shapes],
  );
  const performanceShapes = useMemo(
    () => shapesForScene(shapes, sceneForBeat(playback.beat)),
    [playback.beat, shapes],
  );
  const activeRelationships = useMemo(
    () => relationshipCount(activeShapes),
    [activeShapes],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 2100);
  }, []);

  useEffect(() => {
    let active = true;
    void loadLatestProject()
      .then((project) => {
        if (active && project && project.shapes.length > 0) {
          setRestoredProject(project);
        }
      })
      .catch(() => {
        // Creation stays available even when private browsing blocks storage.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    audioEngine.setMasterVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (screen === "start" || screen === "world") return undefined;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const project = createProject(shapes, seedRef.current, worldId, {
        id: projectIdRef.current,
        title: projectTitle,
        timestamp: createdAtRef.current,
      });
      project.updatedAt = Date.now();
      void saveProject(project).catch(() => undefined);
    }, 550);
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [events, projectTitle, screen, shapes, worldId]);

  useEffect(
    () => () => {
      audioEngine.stop();
    },
    [],
  );

  const closeMoodPicker = useCallback(() => {
    setMoodPickerOpen(false);
    window.requestAnimationFrame(() => playButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!moodPickerOpen) return undefined;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>("[data-testid='mood-float']")?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMoodPickerOpen(false);
      window.requestAnimationFrame(() => previousFocus?.focus());
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [moodPickerOpen]);

  const startAudio = useCallback(async () => {
    try {
      await audioEngine.unlock();
      return true;
    } catch {
      showToast("おとの じゅんびが できませんでした");
      return false;
    }
  }, [showToast]);

  const handleStart = useCallback(async () => {
    await startAudio();
    setScreen("world");
  }, [startAudio]);

  const restorePrevious = useCallback(async () => {
    const project = restoredProject;
    if (!project) return;
    await startAudio();
    projectIdRef.current = project.id;
    createdAtRef.current = project.createdAt;
    seedRef.current = project.seed;
    setWorldId(project.worldId);
    setShapes(cloneShapes(project.shapes).map((shape) => ({ ...shape, scene: shape.scene ?? 0 })));
    setProjectTitle(project.title ?? "わたしのおと");
    setCurrentScene(0);
    setRemixVersion((value) => value + 1);
    setUndoStack([]);
    setSelectedId(null);
    setScreen("create");
  }, [restoredProject, startAudio]);

  const chooseWorld = useCallback(
    (nextWorld: WorldId) => {
      setWorldId(nextWorld);
      audioEngine.previewShape(demoShape(nextWorld), nextWorld);
      window.setTimeout(() => setScreen("create"), 180);
    },
    [],
  );

  const previewWorld = useCallback((nextWorld: WorldId) => {
    audioEngine.previewShape(demoShape(nextWorld), nextWorld);
  }, []);

  const commitShapes = useCallback(
    (next: CanvasShape[], actionLabel: string) => {
      setUndoStack((history) => [...history.slice(-29), cloneShapes(shapes)]);
      setShapes(next);
      showToast(actionLabel);
    },
    [shapes, showToast],
  );

  const commitActiveShapes = useCallback(
    (next: CanvasShape[], actionLabel: string) => {
      const otherScenes = shapes.filter((shape) => (shape.scene ?? 0) !== currentScene);
      commitShapes(
        [...otherScenes, ...next.map((shape) => ({ ...shape, scene: currentScene }))],
        actionLabel,
      );
    },
    [commitShapes, currentScene, shapes],
  );

  const undo = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setShapes(cloneShapes(previous));
    setUndoStack((history) => history.slice(0, -1));
    setSelectedId(null);
    showToast("ひとつ もどりました");
  }, [showToast, undoStack]);

  const updateSelected = useCallback(
    (updater: (shape: CanvasShape) => CanvasShape, label: string) => {
      if (!selectedId) return;
      const next = shapes.map((shape) => (shape.id === selectedId ? updater(shape) : shape));
      commitShapes(next, label);
      const selected = next.find((shape) => shape.id === selectedId);
      if (selected) audioEngine.previewShape(selected, worldId);
    },
    [commitShapes, selectedId, shapes, worldId],
  );

  const selectShape = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const shape = id ? shapes.find((candidate) => candidate.id === id) : undefined;
      if (shape && SHAPE_COLOR_PALETTE.some((color) => color.id === shape.colorId)) {
        setSelectedColorId(shape.colorId);
      }
    },
    [shapes],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commitShapes(
      shapes.filter((shape) => shape.id !== selectedId),
      "けしました",
    );
    setSelectedId(null);
  }, [commitShapes, selectedId, shapes]);

  const clearCanvas = useCallback(() => {
    if (activeShapes.length === 0) return;
    if (!window.confirm("ぜんぶの かたちを けしますか？")) return;
    commitActiveShapes([], "このシーンを まっさらにしました");
    setSelectedId(null);
  }, [activeShapes.length, commitActiveShapes]);

  const openMoodPicker = useCallback(() => {
    if (shapes.length === 0 || events.length === 0) {
      showToast("まず かたちを おいてみよう");
      return;
    }
    setMoodPickerOpen(true);
  }, [events.length, shapes.length, showToast]);

  const beginPerformance = useCallback(
    async (mood: AnimationMood = animationMood, saveVideo = false) => {
      if (shapes.length === 0 || events.length === 0) {
        showToast("まず かたちを おいてみよう");
        return;
      }
      if (!(await startAudio())) return;

      const performanceEvents = [
        ...events,
        ...buildBackingTrack(worldId, mood, seedRef.current),
      ].sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id));

      setAnimationMood(mood);
      setMoodPickerOpen(false);
      setPlayback({ ...EMPTY_PLAYBACK, section: "intro" });
      setScreen("perform");

      let recorder: MediaRecorder | null = null;
      let recordingStream: MediaStream | null = null;
      if (saveVideo && typeof MediaRecorder !== "undefined") {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
        const canvas = document.querySelector<HTMLCanvasElement>(".performance-screen canvas");
        const canvasStream = canvas?.captureStream?.(30);
        const audioStream = audioEngine.createCaptureStream();
        if (canvasStream && audioStream) {
          recordingStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioStream.getAudioTracks(),
          ]);
          const mimeType = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
          ].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
          const chunks: Blob[] = [];
          recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
          };
          recorder.onstop = () => {
            if (chunks.length > 0) downloadRecordedVideo(chunks, recorder?.mimeType || "video/webm");
            recordingStream?.getTracks().forEach((track) => track.stop());
            audioEngine.stopCaptureStream();
            recorderRef.current = null;
            setRecordingVideo(false);
            showToast(chunks.length > 0 ? "MVを ほぞんしました" : "MVを ほぞんできませんでした");
          };
          recorder.start(500);
          recorderRef.current = recorder;
          setRecordingVideo(true);
          showToast("30びょうの MVを ろくがしています");
        } else {
          audioEngine.stopCaptureStream();
          showToast("このブラウザでは MVを ほぞんできません");
        }
      } else if (saveVideo) {
        showToast("このブラウザでは MVを ほぞんできません");
      }

      audioEngine.start(performanceEvents, {
        bpm: BPM,
        totalBeats: TOTAL_BEATS,
        onTick: setPlayback,
        onEnded: () => {
          setPlayback({
            beat: TOTAL_BEATS,
            progress: 1,
            section: getSectionAtBeat(TOTAL_BEATS - 0.001),
            playing: false,
          });
          const activeRecorder = recorderRef.current;
          if (activeRecorder?.state === "recording") activeRecorder.stop();
          window.setTimeout(() => setScreen("finish"), activeRecorder ? 120 : 0);
        },
      });
    },
    [animationMood, events, shapes.length, showToast, startAudio, worldId],
  );

  const leavePerformance = useCallback(() => {
    audioEngine.stop();
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    audioEngine.stopCaptureStream();
    setPlayback(EMPTY_PLAYBACK);
    setScreen("create");
  }, []);

  const togglePause = useCallback(async () => {
    if (playback.playing) {
      audioEngine.pause();
    } else {
      await audioEngine.resume();
    }
  }, [playback.playing]);

  const conduct = useCallback((gesture: ConductGesture) => {
    if (gesture.phase === "end") return;
    const now = performance.now();
    const nearest = performanceShapes
      .map((shape) => ({
        shape,
        gap: Math.hypot(shape.position.x - gesture.x, shape.position.y - gesture.y),
      }))
      .sort((left, right) => left.gap - right.gap)[0];
    if (nearest && nearest.gap < Math.max(0.1, nearest.shape.size * 0.65) && now - lastLiveShapeAtRef.current > 130) {
      audioEngine.previewShape(nearest.shape, worldId);
      lastLiveShapeAtRef.current = now;
    } else {
      audioEngine.liveConduct(gesture.x, gesture.y);
    }
  }, [performanceShapes, worldId]);

  const replay = useCallback(() => {
    void beginPerformance();
  }, [beginPerformance]);

  const newProject = useCallback(() => {
    audioEngine.stop();
    projectIdRef.current = createId("project");
    createdAtRef.current = Date.now();
    seedRef.current = seedFromText(projectIdRef.current);
    setShapes([]);
    setCurrentScene(0);
    setProjectTitle("わたしのおと");
    setUndoStack([]);
    setSelectedId(null);
    setPlayback(EMPTY_PLAYBACK);
    setAnimationMood(DEFAULT_ANIMATION_MOOD);
    setMoodPickerOpen(false);
    setRemixVersion((value) => value + 1);
    setRestoredProject(null);
    setScreen("world");
  }, []);

  const remix = useCallback(() => {
    seedRef.current = (seedRef.current + 0x9e3779b9) >>> 0;
    setRemixVersion((value) => value + 1);
    showToast("おなじ えから ちがう おとに なりました");
  }, [showToast]);

  const copyPreviousScene = useCallback(() => {
    if (currentScene === 0) return;
    const previous = shapes.filter((shape) => (shape.scene ?? 0) === currentScene - 1);
    if (previous.length === 0) {
      showToast("まえの シーンは まだ からっぽです");
      return;
    }
    commitActiveShapes(
      previous.map((shape, index) => ({
        ...shape,
        id: createId("shape"),
        scene: currentScene,
        zIndex: index,
        position: { ...shape.position },
        points: shape.points?.map((point) => ({ ...point })),
      })),
      "まえの えを うつしました",
    );
  }, [commitActiveShapes, currentScene, shapes, showToast]);

  const openGallery = useCallback(async () => {
    setGalleryProjects(await listProjects());
    setScreen("gallery");
  }, []);

  const loadFromGallery = useCallback(async (project: OtoProject) => {
    await startAudio();
    projectIdRef.current = project.id;
    createdAtRef.current = project.createdAt;
    seedRef.current = project.seed;
    setProjectTitle(project.title ?? "わたしのおと");
    setWorldId(project.worldId);
    setShapes(cloneShapes(project.shapes).map((shape) => ({ ...shape, scene: shape.scene ?? 0 })));
    setCurrentScene(0);
    setUndoStack([]);
    setSelectedId(null);
    setRemixVersion((value) => value + 1);
    setScreen("create");
  }, [startAudio]);

  const watchGalleryProject = useCallback(async (project: OtoProject) => {
    if (!(await startAudio())) return;
    projectIdRef.current = project.id;
    createdAtRef.current = project.createdAt;
    seedRef.current = project.seed;
    const nextShapes = cloneShapes(project.shapes).map((shape) => ({ ...shape, scene: shape.scene ?? 0 }));
    const nextEvents = buildArrangement(nextShapes, project.seed, project.worldId);
    const performanceEvents = [
      ...nextEvents,
      ...buildBackingTrack(project.worldId, animationMood, project.seed),
    ].sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id));
    setProjectTitle(project.title ?? "わたしのおと");
    setWorldId(project.worldId);
    setShapes(nextShapes);
    setCurrentScene(0);
    setPlayback({ ...EMPTY_PLAYBACK, section: "intro" });
    setScreen("perform");
    audioEngine.start(performanceEvents, {
      bpm: BPM,
      totalBeats: TOTAL_BEATS,
      onTick: setPlayback,
      onEnded: () => {
        setPlayback({ beat: TOTAL_BEATS, progress: 1, section: "outro", playing: false });
        setScreen("finish");
      },
    });
  }, [animationMood, startAudio]);

  const duplicateGalleryProject = useCallback(async (project: OtoProject) => {
    const copy = createProject(project.shapes, (project.seed + 1) >>> 0, project.worldId, {
      id: createId("project"),
      title: `${project.title ?? "わたしのおと"} コピー`,
    });
    await saveProject(copy);
    setGalleryProjects(await listProjects());
    showToast("コピーを つくりました");
  }, [showToast]);

  const renameGalleryProject = useCallback(async (project: OtoProject) => {
    const title = window.prompt("さくひんの なまえ", project.title ?? "わたしのおと")?.trim();
    if (!title) return;
    await saveProject({ ...project, title });
    setGalleryProjects(await listProjects());
  }, []);

  const removeGalleryProject = useCallback(async (project: OtoProject) => {
    if (!window.confirm(`「${project.title ?? "わたしのおと"}」を けしますか？`)) return;
    await deleteProject(project.id);
    setGalleryProjects(await listProjects());
  }, []);

  const exportJacket = useCallback(async () => {
    try {
      await downloadJacketPng(shapes, theme, projectTitle);
      showToast("ジャケットを ほぞんしました");
    } catch {
      showToast("ジャケットを ほぞんできませんでした");
    }
  }, [projectTitle, shapes, showToast, theme]);

  const exportWav = useCallback(async () => {
    if (events.length === 0 || exporting) return;
    setExporting(true);
    setExportProgress(0);
    try {
      await exportAndDownloadWav(mixedEvents, "otocanvas-music.wav", {
        bpm: BPM,
        bars: BARS,
        onProgress: setExportProgress,
      });
      showToast("おとを ほぞんしました");
    } catch {
      showToast("ほぞんできませんでした");
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  }, [events.length, exporting, mixedEvents, showToast]);

  const deleteSavedData = useCallback(async () => {
    if (!window.confirm("このたんまつに ほぞんした作品を すべて消しますか？")) return;
    await clearProjects();
    setRestoredProject(null);
    showToast("ほぞんデータを けしました");
  }, [showToast]);

  const remainingSeconds = Math.max(0, DURATION_SECONDS * (1 - playback.progress));

  return (
    <main className="app-shell" style={worldStyle(worldId)}>
      {screen === "start" && (
        <section className="screen start-screen" aria-labelledby="start-title">
          <button
            className="quiet-button parent-entry"
            type="button"
            onClick={() => setParentOpen(true)}
          >
            おとなの方へ
          </button>
          <div className="start-center">
            <BrandShapes />
            <div className="brand-lockup">
              <h1 id="start-title">OtO Canvas</h1>
              <p>えがくと、おとになる。</p>
            </div>
            <button
              className="start-button"
              type="button"
              data-testid="start-button"
              aria-label="はじめる"
              onClick={() => void handleStart()}
            >
              <span className="play-icon" aria-hidden="true" />
            </button>
            <div className="start-subactions">
              {restoredProject && (
                <button className="quiet-button" type="button" onClick={() => void restorePrevious()}>
                  つづきから
                </button>
              )}
              <button className="quiet-button" type="button" onClick={() => void openGallery()}>
                さくひんだな
              </button>
            </div>
          </div>
        </section>
      )}

      {screen === "gallery" && (
        <section className="screen gallery-screen" aria-labelledby="gallery-title">
          <header className="gallery-heading">
            <button className="icon-button" type="button" onClick={() => setScreen("start")} aria-label="最初へ戻る">←</button>
            <div><h2 id="gallery-title">さくひんだな</h2><p>この たんまつに ほぞんした おと</p></div>
            <button className="pill-button" type="button" onClick={newProject}>＋ あたらしく</button>
          </header>
          {galleryProjects.length === 0 ? (
            <div className="gallery-empty"><BrandShapes /><strong>まだ さくひんが ありません</strong></div>
          ) : (
            <div className="gallery-grid">
              {galleryProjects.map((project) => (
                <article className="project-card" key={project.id}>
                  <button className="project-open" type="button" onClick={() => void loadFromGallery(project)}>
                    <ProjectThumbnail project={project} />
                    <span><strong>{project.title ?? "わたしのおと"}</strong><small>{project.shapes.length}この かたち</small></span>
                  </button>
                  <div className="project-actions">
                    <button type="button" onClick={() => void watchGalleryProject(project)}>みる</button>
                    <button type="button" onClick={() => void renameGalleryProject(project)}>なまえ</button>
                    <button type="button" onClick={() => void duplicateGalleryProject(project)}>コピー</button>
                    <button type="button" onClick={() => void removeGalleryProject(project)}>けす</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {screen === "world" && (
        <section className="screen world-screen" aria-labelledby="world-title">
          <header className="screen-heading">
            <h2 id="world-title">どんな おとにする？</h2>
            <p>さわると おとを ためせるよ</p>
          </header>
          <div className="world-grid">
            {(Object.keys(WORLDS) as WorldId[]).map((id) => {
              const world = WORLDS[id];
              const style = {
                "--card-bg": world.background,
                "--card-ink": world.ink,
                "--card-circle": world.circle,
                "--card-triangle": world.triangle,
                "--card-line": world.line,
              } as CSSProperties;
              return (
                <button
                  key={id}
                  className="world-card"
                  style={style}
                  type="button"
                  data-testid={`world-${id}`}
                  onPointerEnter={() => previewWorld(id)}
                  onFocus={() => previewWorld(id)}
                  onClick={() => chooseWorld(id)}
                >
                  <WorldPreview worldId={id} />
                  <span className="world-label">
                    <strong>{world.name}</strong>
                    <span>{world.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button className="quiet-button back-button" type="button" onClick={() => setScreen("start")}>
            もどる
          </button>
        </section>
      )}

      {screen === "create" && (
        <section className="screen create-screen" aria-label="おとをつくる">
          <header className="top-bar">
            <div>
              <button className="icon-button" type="button" onClick={() => setScreen("world")} aria-label="おとの世界を選び直す">
                ←
              </button>
            </div>
            <div className="top-bar-center">
              <strong>{theme.name}</strong>
              <span>OTO CANVAS</span>
            </div>
            <div className="top-bar-actions">
              <button className="icon-button" type="button" onClick={remix} disabled={shapes.length === 0} aria-label="音をリミックスする">
                ⤨
              </button>
              <button className="icon-button" type="button" disabled={undoStack.length === 0} onClick={undo} aria-label="ひとつ戻す">
                ↶
              </button>
              <button className="icon-button" type="button" onClick={clearCanvas} disabled={activeShapes.length === 0} aria-label="このシーンを全部消す">
                ○
              </button>
              <button className="icon-button" type="button" onClick={() => setParentOpen(true)} aria-label="おとな向け設定">
                ⋯
              </button>
            </div>
          </header>

          <div className="canvas-stage" data-testid="canvas-editor">
            <div className="scene-switcher" role="tablist" aria-label="MVの3つのシーン">
              {([0, 1, 2] as SceneIndex[]).map((scene) => {
                const count = shapes.filter((shape) => (shape.scene ?? 0) === scene).length;
                return (
                  <button
                    key={scene}
                    type="button"
                    role="tab"
                    aria-selected={currentScene === scene}
                    onClick={() => { setCurrentScene(scene); setSelectedId(null); }}
                  >
                    <strong>{scene + 1}</strong><span>{scene === 0 ? "はじまり" : scene === 1 ? "なか" : "おわり"}</span><small>{count}</small>
                  </button>
                );
              })}
              {currentScene > 0 && activeShapes.length === 0 && (
                <button className="copy-scene" type="button" onClick={copyPreviousScene}>まえを うつす</button>
              )}
            </div>
            <CanvasEditor
              shapes={activeShapes}
              selectedKind={selectedKind}
              selectedColorId={selectedColorId}
              selectedId={selectedId}
              theme={theme}
              onShapesChange={commitActiveShapes}
              onSelect={selectShape}
              onPreview={(shape) => audioEngine.previewShape(shape, worldId)}
            />
            {activeShapes.length === 0 && (
              <p className="canvas-hint">かたちを えらんで<br />ひろいところに おいてみよう</p>
            )}
            <span className="shape-count" aria-live="polite">
              {activeRelationships > 0 ? `♪ ${activeRelationships}コンボ · ` : ""}{activeShapes.length} / 20
            </span>

            <nav className="tool-dock" aria-label="かたちを選ぶ">
              {CREATION_TOOLS.map((kind) => (
                <button
                  key={kind}
                  className="tool-button"
                  type="button"
                  data-testid={`tool-${kind}`}
                  aria-label={`${SHAPE_LABELS[kind]}・${SHAPE_INSTRUMENT_LABELS[kind]}`}
                  aria-pressed={selectedKind === kind}
                  onClick={() => {
                    setSelectedKind(kind);
                    setSelectedId(null);
                    showToast(`${SHAPE_LABELS[kind]}は ${SHAPE_INSTRUMENT_LABELS[kind]}の おと`);
                    audioEngine.previewShape(
                      {
                        id: `tool-${kind}`,
                        kind,
                        position: { x: 0.5, y: 0.5 },
                        size: 0.2,
                        rotation: 0,
                        colorId: selectedColorId,
                        patternId: `${kind}-1`,
                        zIndex: 0,
                        points: kind === "pen" ? [{ x: -0.3, y: 0.2 }, { x: 0, y: -0.2 }, { x: 0.3, y: 0.1 }] : undefined,
                      },
                      worldId,
                    );
                  }}
                >
                  <ToolIcon kind={kind} />
                </button>
              ))}
              <button
                ref={playButtonRef}
                className="play-button"
                type="button"
                data-testid="play-button"
                aria-label="できた曲を再生する"
                onClick={openMoodPicker}
              >
                <span className="play-icon" aria-hidden="true" />
              </button>
            </nav>

            {selectedId && (
              <div className="selection-controls" aria-label="選んだ形の色・大きさ・向きを変える">
                <div className="property-group">
                  <span className="property-label">いろ</span>
                  <div className="color-palette" role="group" aria-label="色を選ぶ">
                    {SHAPE_COLOR_PALETTE.map((color) => (
                      <button
                        key={color.id}
                        className="color-swatch"
                        style={{ "--swatch": color.value } as CSSProperties}
                        type="button"
                        data-testid={`color-${color.id}`}
                        aria-label={color.name}
                        aria-pressed={selectedColorId === color.id}
                        onClick={() => {
                          setSelectedColorId(color.id);
                          updateSelected(
                            (shape) => ({ ...shape, colorId: color.id }),
                            `${color.name}の ${colorSoundProfile(color.id).name}な おと`,
                          );
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="property-group">
                  <span className="property-label">おおきさ</span>
                  <div className="property-actions">
                    <button
                      className="property-button"
                      type="button"
                      aria-label="形を小さくする"
                      onClick={() => updateSelected((shape) => ({ ...shape, size: Math.max(0.07, shape.size - 0.035) }), "ちいさく なりました")}
                    >−</button>
                    <button
                      className="property-button"
                      type="button"
                      aria-label="形を大きくする"
                      onClick={() => updateSelected((shape) => ({ ...shape, size: Math.min(0.42, shape.size + 0.035) }), "おおきく なりました")}
                    >＋</button>
                  </div>
                </div>
                <div className="property-group">
                  <span className="property-label">まわす</span>
                  <div className="property-actions">
                    <button
                      className="property-button"
                      type="button"
                      data-testid="rotate-left"
                      aria-label="形を左へ回す"
                      onClick={() => updateSelected((shape) => ({ ...shape, rotation: shape.rotation - Math.PI / 12 }), "ひだりへ まわしました")}
                    >↶</button>
                    <button
                      className="property-button"
                      type="button"
                      data-testid="rotate-right"
                      aria-label="形を右へ回す"
                      onClick={() => updateSelected((shape) => ({ ...shape, rotation: shape.rotation + Math.PI / 12 }), "みぎへ まわしました")}
                    >↷</button>
                  </div>
                </div>
                <button className="property-delete" type="button" aria-label="選んだ形を消す" onClick={deleteSelected}>
                  × けす
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {screen === "perform" && (
        <section className="screen performance-screen" aria-label="おとのえいが">
          <PerformanceCanvas
            shapes={performanceShapes}
            events={events}
            theme={theme}
            beat={playback.beat}
            section={playback.section}
            animationMood={animationMood}
            playing={playback.playing}
            lowPower={lowPower}
            onConduct={conduct}
          />
          <div className="performance-controls">
            <button className="performance-back" type="button" onClick={leavePerformance} aria-label="編集へ戻る">
              <span aria-hidden="true">←</span><strong>もどる</strong>
            </button>
            <div className="performance-badges" aria-live="polite">
              <span className="section-badge">{SECTION_LABELS[playback.section]}</span>
              <span className="mood-badge">{activeMood.name} · {activeMood.bgm}</span>
            </div>
            <button
              className="icon-button"
              type="button"
              data-testid="pause-button"
              onClick={() => void togglePause()}
              aria-label={playback.playing ? "一時停止" : "再開"}
            >
              {playback.playing ? "Ⅱ" : "▶"}
            </button>
          </div>
          <p className="conduct-hint">さわって おとを うごかそう · あと {formatClock(remainingSeconds)}</p>
          <div className="progress-track" role="progressbar" aria-label="曲の進み具合" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(playback.progress * 100)}>
            <div className="progress-fill" style={{ "--progress": playback.progress } as CSSProperties} />
          </div>
        </section>
      )}

      {screen === "finish" && (
        <section className="screen finish-screen" aria-labelledby="finish-title">
          <div className="finish-art">
            <PerformanceCanvas
              shapes={shapesForScene(shapes, 2)}
              events={events}
              theme={theme}
              beat={TOTAL_BEATS - 1}
              section="outro"
              animationMood={animationMood}
              playing={false}
              reducedMotion
              lowPower={lowPower}
              ariaLabel="完成した作品"
            />
          </div>
          <div className="finish-content">
            <div>
              <h2 id="finish-title">できた！</h2>
              <p>{shapes.length}この かたちから、30びょうの おとが うまれました。</p>
            </div>
            <div className="finish-actions">
              <button className="action-card primary" type="button" onClick={replay}>
                <span className="action-icon">▶</span>もういちど みる
              </button>
              <button className="action-card" type="button" onClick={() => setScreen("create")}>
                <span className="action-icon">↶</span>すこし かえる
              </button>
              <button className="action-card" type="button" onClick={newProject}>
                <span className="action-icon">＋</span>あたらしく つくる
              </button>
              <button className="action-card" type="button" disabled={recordingVideo} onClick={() => void beginPerformance(animationMood, true)}>
                <span className="action-icon">●</span>{recordingVideo ? "ろくが中" : "MVを ほぞん"}
              </button>
              <button className="action-card" type="button" onClick={() => void exportJacket()}>
                <span className="action-icon">▣</span>ジャケット
              </button>
              <button className="quiet-button" type="button" onClick={() => setParentOpen(true)}>
                おとなの方へ・ほぞん
              </button>
            </div>
          </div>
        </section>
      )}

      {moodPickerOpen && screen === "create" && (
        <div
          className="mood-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMoodPicker();
          }}
        >
          <section
            className="mood-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mood-title"
            aria-describedby="mood-description"
          >
            <header className="mood-dialog-heading">
              <div>
                <h2 id="mood-title">どんな うごきで みる？</h2>
                <p id="mood-description">アニメと BGMを えらんでね</p>
              </div>
              <button
                className="mood-close"
                type="button"
                onClick={closeMoodPicker}
                aria-label="動き選びを閉じる"
              >
                ×
              </button>
            </header>
            <div className="mood-grid">
              {ANIMATION_MOOD_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`mood-card mood-card-${option.id}`}
                  type="button"
                  data-testid={`mood-${option.id}`}
                  onClick={() => void beginPerformance(option.id)}
                  aria-label={`${option.name}。${option.motion}な動き。${option.bgm}`}
                >
                  <span className={`mood-preview mood-preview-${option.id}`} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="mood-card-copy">
                    <strong>{option.name}</strong>
                    <span>{option.motion}</span>
                    <small>♪ {option.bgm}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {parentOpen && (
        <div className="parent-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setParentOpen(false);
        }}>
          <section className="parent-panel" role="dialog" aria-modal="true" aria-labelledby="parent-title">
            <header>
              <h2 id="parent-title">おとなの方へ</h2>
              <button className="icon-button" type="button" onClick={() => setParentOpen(false)} aria-label="閉じる">×</button>
            </header>
            <p>作品はこの端末の中だけに保存されます。ログイン、広告、カメラ、マイク、外部送信はありません。</p>
            <div className="parent-grid">
              <label className="setting-row">
                <span><strong>作品のなまえ</strong><small>作品棚とジャケットに表示します</small></span>
                <input
                  className="title-input"
                  value={projectTitle}
                  maxLength={32}
                  onChange={(event) => setProjectTitle(event.target.value)}
                />
              </label>
              <label className="setting-row">
                <span><strong>音量</strong><small>最初から大きな音にはなりません</small></span>
                <input
                  type="range"
                  min="0"
                  max="0.7"
                  step="0.05"
                  value={volume}
                  aria-label="音量"
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
              </label>
              <label className="setting-row">
                <span><strong>軽い動き</strong><small>動きを減らして端末の負荷を下げます</small></span>
                <input type="checkbox" checked={lowPower} onChange={(event) => setLowPower(event.target.checked)} />
              </label>
              <div className="setting-row">
                <span><strong>音声を書き出す</strong><small>{exporting ? `WAVを作成中 ${Math.round(exportProgress * 100)}%` : "30秒のWAVファイル"}</small></span>
                <button className="pill-button" type="button" disabled={events.length === 0 || exporting} onClick={() => void exportWav()}>
                  {exporting ? "作成中" : "WAV"}
                </button>
              </div>
              <div className="setting-row">
                <span><strong>保存データ</strong><small>この端末内の作品を消します</small></span>
                <button className="pill-button" type="button" onClick={() => void deleteSavedData()}>すべて消す</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

export default App;
