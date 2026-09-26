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
import { useFullscreen } from "./useFullscreen";
import { loadCreationMode, saveCreationMode, type CreationMode } from "../storage/parentSettings";
import { downloadJacketPng, downloadRecordedVideo } from "../export/artworkExporter";
import { exportAndDownloadWav } from "../export/wavExporter";
import { audioEngine, DEFAULT_MASTER_VOLUME } from "../music/audioEngine";
import { buildArrangement, createProject, getSectionAtBeat } from "../music/arranger";
import { buildSceneBackingTrack } from "../music/backingTrack";
import { WORLD_SOUND_LABELS } from "../music/worldSounds";
import { instrumentForShape } from "../music/shapeMapper";
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
  normalizeSceneCount,
  shapesForScene,
} from "../music/creativeRules";
import {
  BARS,
  BPM,
  DURATION_SECONDS,
  MAX_SHAPES_PER_SCENE,
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
  ANIMATION_MOODS, MOOD_NAMES, backingMood,
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



const CREATION_TOOLS: readonly ShapeKind[] = [...STAMP_SHAPE_KINDS, "pen"];

const SECTION_LABELS = {
  intro: "はじまり",
  a: "ひろがる",
  b: "へんしん",
  break: "ひとやすみ",
  climax: "おおきな おと",
  outro: "おしまい",
} as const;

const ANIMATION_MOOD_OPTIONS = ANIMATION_MOODS.map((id) => ({ id, name: MOOD_NAMES[id], motion: "みんなで " + MOOD_NAMES[id], bgm: backingMood(id) === "pop" ? "リズムBGM" : backingMood(id) === "cosmic" ? "うちゅうBGM" : "やさしいBGM" }));

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
  const { expanded, toggleFullscreen } = useFullscreen();
  // 小さい画面ではキャンバスを広く使い、丸ボタンから必要なときにツールを開く。
  const [toolsOpen, setToolsOpen] = useState(() =>
    !window.matchMedia("(max-width: 760px), (max-height: 500px)").matches);
  const toolToggleRef = useRef<HTMLButtonElement | null>(null);
  const toolDrawerRef = useRef<HTMLDivElement | null>(null);
  const toolSwipeStart = useRef<number | null>(null);
  const [screen, setScreen] = useState<Screen>("start");
  const [worldId, setWorldId] = useState<WorldId>("soft");
  const [shapes, setShapes] = useState<CanvasShape[]>([]);
  const [creationMode, setCreationMode] = useState(loadCreationMode);
  const simpleCreation = creationMode === "basic";
  const [settingsSaved, setSettingsSaved] = useState<boolean | null>(null);
  const [sceneCount, setSceneCount] = useState(() => creationMode === "basic" ? 1 : 3);
  const [sceneMoods, setSceneMoods] = useState<AnimationMood[]>(Array(10).fill(DEFAULT_ANIMATION_MOOD));
  const [editingSceneMood, setEditingSceneMood] = useState(false);
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
  const [volume, setVolume] = useState(DEFAULT_MASTER_VOLUME);
  const [audioReady, setAudioReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

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
  // 画面外へ収納したツールには、キーボードや読み上げの操作が入らないようにする。
  useEffect(() => {
    if (toolDrawerRef.current) toolDrawerRef.current.inert = !toolsOpen;
  }, [toolsOpen, screen]);

  // 閉じたパネルにフォーカスを残さず、再び開ける丸ボタンへ戻す。
  const closeTools = useCallback(() => {
    toolToggleRef.current?.focus({ preventScroll: true });
    setToolsOpen(false);
  }, []);
  const events = useMemo(
    () => buildArrangement(shapes, seedRef.current, worldId, sceneCount),
    [remixVersion, shapes, worldId, sceneCount],
  );
  const mixedEvents = useMemo(
    () =>
      [
        ...events,
        ...buildSceneBackingTrack(worldId, sceneMoods, sceneCount, seedRef.current),
      ].sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id)),
    [sceneMoods, sceneCount, events, worldId],
  );
  const playingMood = sceneMoods[sceneForBeat(playback.beat, sceneCount)] ?? DEFAULT_ANIMATION_MOOD;
  const activeMood = animationMoodOption(playingMood);
  const activeShapes = useMemo(
    () => shapes.filter((shape) => (shape.scene ?? 0) === currentScene),
    [currentScene, shapes],
  );
  const performanceShapes = useMemo(
    () => shapesForScene(shapes, sceneForBeat(playback.beat, sceneCount), sceneCount),
    [playback.beat, shapes, sceneCount],
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

  /** 表示する道具だけを切り替え、既存作品の場面・動きは削除しない。 */
  const changeCreationMode = useCallback((mode: CreationMode) => {
    setCreationMode(mode);
    setSettingsSaved(saveCreationMode(mode));
    setMoodPickerOpen(false);
    setCurrentScene(0);
    setSelectedId(null);
    if (shapes.length === 0) setSceneCount(mode === "basic" ? 1 : 3);
  }, [shapes.length]);

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

  const screenBgmEnabled = screen !== "perform";
  // 作品の再生中は専用BGMを止め、選択・編集へ戻ったときだけ再開する。
  useEffect(() => {
    if (!audioReady || !screenBgmEnabled) return;
    // 非表示タブでは鳴らさず、戻ったときは現在の音世界で再開する。
    const updateScreenBgm = () => {
      if (document.hidden) audioEngine.stopScreenBgm();
      else audioEngine.startScreenBgm(worldId);
    };
    updateScreenBgm();
    document.addEventListener("visibilitychange", updateScreenBgm);
    return () => {
      document.removeEventListener("visibilitychange", updateScreenBgm);
      audioEngine.stopScreenBgm();
    };
  }, [audioReady, screenBgmEnabled, worldId]);

  useEffect(() => {
    if (screen === "start" || screen === "world") return undefined;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const project = createProject(shapes, seedRef.current, worldId, {
        id: projectIdRef.current,
        title: projectTitle,
        timestamp: createdAtRef.current,
        sceneCount, sceneMoods,
      });
      project.updatedAt = Date.now();
      void saveProject(project).catch(() => undefined);
    }, 550);
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [events, projectTitle, screen, shapes, worldId, sceneCount, sceneMoods]);

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
      setAudioReady(true);
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
    setSceneCount(normalizeSceneCount(project.sceneCount));
    setSceneMoods(Array.from({ length: 10 }, (_, index) => project.sceneMoods?.[index] ?? DEFAULT_ANIMATION_MOOD));
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
    setEditingSceneMood(false);
    setMoodPickerOpen(true);
  }, [events.length, shapes.length, showToast]);

  const beginPerformance = useCallback(
    async (mood?: AnimationMood, saveVideo = false) => {
      if (shapes.length === 0 || events.length === 0) {
        showToast("まず かたちを おいてみよう");
        return;
      }
      if (!(await startAudio())) return;

      audioEngine.stopScreenBgm();

      const nextMoods = mood ? sceneMoods.map((value, index) => index === currentScene ? mood : value) : sceneMoods;
      setSceneMoods(nextMoods);
      const performanceEvents = [
        ...events,
        ...buildSceneBackingTrack(worldId, nextMoods, sceneCount, seedRef.current),
      ].sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id));


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
    [sceneMoods, sceneCount, currentScene, events, shapes.length, showToast, startAudio, worldId],
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
      audioEngine.liveConduct(gesture.x, gesture.y, worldId);
    }
  }, [performanceShapes, worldId]);

  const replay = useCallback(() => {
    void beginPerformance();
  }, [beginPerformance]);

  // 作品棚・完了画面から新規作成へ移っても、画面BGMは継続する。
  const newProject = useCallback(() => {
    projectIdRef.current = createId("project");
    createdAtRef.current = Date.now();
    seedRef.current = seedFromText(projectIdRef.current);
    setShapes([]);
    setSceneCount(simpleCreation ? 1 : 3);
    setSceneMoods(Array(10).fill(DEFAULT_ANIMATION_MOOD));
    setCurrentScene(0);
    setProjectTitle("わたしのおと");
    setUndoStack([]);
    setSelectedId(null);
    setPlayback(EMPTY_PLAYBACK);

    setMoodPickerOpen(false);
    setRemixVersion((value) => value + 1);
    setRestoredProject(null);
    setScreen("world");
  }, [simpleCreation]);

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

  /** 場面を減らしても絵と振り付けを保持し、再び増やすと元へ戻せるようにする。 */
  const changeSceneCount = useCallback((delta: number) => {
    const next = normalizeSceneCount(sceneCount + delta);
    setSceneCount(next);
    setCurrentScene((scene) => Math.min(scene, next - 1) as SceneIndex);
    setSelectedId(null);
    if (delta < 0) showToast("しまった ばめんは ＋で もどせるよ");
  }, [sceneCount, showToast]);

  const openGallery = useCallback(async () => {
    await startAudio();
    setGalleryProjects(await listProjects());
    setScreen("gallery");
  }, [startAudio]);

  const loadFromGallery = useCallback(async (project: OtoProject) => {
    await startAudio();
    projectIdRef.current = project.id;
    createdAtRef.current = project.createdAt;
    seedRef.current = project.seed;
    setProjectTitle(project.title ?? "わたしのおと");
    setWorldId(project.worldId);
    setSceneCount(normalizeSceneCount(project.sceneCount));
    setSceneMoods(Array.from({ length: 10 }, (_, index) => project.sceneMoods?.[index] ?? DEFAULT_ANIMATION_MOOD));
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
    const nextEvents = buildArrangement(nextShapes, project.seed, project.worldId, normalizeSceneCount(project.sceneCount));
    const performanceEvents = [
      ...nextEvents,
      ...buildSceneBackingTrack(project.worldId, project.sceneMoods ?? [], normalizeSceneCount(project.sceneCount), project.seed),
    ].sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id));
    setProjectTitle(project.title ?? "わたしのおと");
    setWorldId(project.worldId);
    setSceneCount(normalizeSceneCount(project.sceneCount));
    setSceneMoods(Array.from({ length: 10 }, (_, index) => project.sceneMoods?.[index] ?? DEFAULT_ANIMATION_MOOD));
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
  }, [startAudio]);

  const duplicateGalleryProject = useCallback(async (project: OtoProject) => {
    const copy = createProject(project.shapes, (project.seed + 1) >>> 0, project.worldId, {
      id: createId("project"),
      title: `${project.title ?? "わたしのおと"} コピー`,
      sceneCount: project.sceneCount, sceneMoods: project.sceneMoods,
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
      await downloadJacketPng(shapes, theme, projectTitle, sceneCount);
      showToast("ジャケットを ほぞんしました");
    } catch {
      showToast("ジャケットを ほぞんできませんでした");
    }
  }, [projectTitle, shapes, showToast, theme, sceneCount]);

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
    <main className={`app-shell${expanded ? " app-shell--expanded" : ""}`} style={worldStyle(worldId)}>
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
        <section className="screen create-screen" aria-label="おとをつくる" data-tools-open={toolsOpen}>
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
              {!simpleCreation && <button className="icon-button" type="button" onClick={remix} disabled={shapes.length === 0} aria-label="音をリミックスする">
                ⤨
              </button>}
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
            {!simpleCreation && <><div className="scene-controls" role="group" aria-label="場面と動き">
              <button type="button" aria-label="場面を減らす" disabled={sceneCount === 1} onClick={() => changeSceneCount(-1)}>−</button>
              <span data-testid="scene-count">{sceneCount} ばめん</span>
              <button type="button" aria-label="場面を増やす" disabled={sceneCount === 10} onClick={() => changeSceneCount(1)}>＋</button>
              <button type="button" data-testid="scene-motion" onClick={() => { setEditingSceneMood(true); setMoodPickerOpen(true); }}>うごき：{MOOD_NAMES[sceneMoods[currentScene] ?? DEFAULT_ANIMATION_MOOD]}</button>
            </div>
            <div className="scene-switcher" role="tablist" aria-label="MVのシーン">
              {Array.from({ length: sceneCount }, (_, index) => index as SceneIndex).map((scene) => {
                const count = shapes.filter((shape) => (shape.scene ?? 0) === scene).length;
                return (
                  <button
                    key={scene}
                    type="button"
                    role="tab"
                    aria-selected={currentScene === scene}
                    onClick={() => { setCurrentScene(scene); setSelectedId(null); }}
                  >
                    <strong>{scene + 1}</strong><span>{scene === 0 ? "はじまり" : scene === sceneCount - 1 ? "おわり" : "なか"}</span><small>{count}</small>
                  </button>
                );
              })}
              {currentScene > 0 && activeShapes.length === 0 && (
                <button className="copy-scene" type="button" onClick={copyPreviousScene}>まえを うつす</button>
              )}
            </div>
            </>}
            <CanvasEditor
              allowTransforms={!simpleCreation}
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
              <p className="canvas-hint">{toolsOpen
                ? <>かたちを えらんで<br />ひろいところに おいてみよう</>
                : <>ひだりしたの まるから<br />かたちを えらんでね</>}</p>
            )}
            <span className="shape-count" aria-live="polite">
              {activeRelationships > 0 ? `♪ ${activeRelationships}コンボ · ` : ""}{activeShapes.length} / {MAX_SHAPES_PER_SCENE}
            </span>


            {selectedId && toolsOpen && (
              <div className="selection-controls" aria-label={simpleCreation ? "選んだ形の色を変える" : "選んだ形の色・大きさ・向きを変える"}>
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
                {!simpleCreation && <><div className="property-group">
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
                </>}
                <button className="property-delete" type="button" aria-label="選んだ形を消す" onClick={deleteSelected}>
                  × けす
                </button>
              </div>
            )}
          </div>
          <footer className="creation-playback">
            <button
              ref={toolToggleRef}
              className="tool-toggle"
              type="button"
              data-testid="tools-toggle"
              aria-label={toolsOpen ? "図形ツールをしまう" : "図形ツールを開く"}
              aria-expanded={toolsOpen}
              aria-controls="shape-tool-drawer"
              onClick={() => setToolsOpen((open) => !open)}
            >
              <ToolIcon kind={selectedKind} />
            </button>
            <button className="fullscreen-button" type="button" aria-label={expanded ? "最大化を解除" : "画面を最大化"}
              aria-pressed={expanded} onClick={() => void toggleFullscreen()}>
              <span aria-hidden="true">{expanded ? "⊡" : "⛶"}</span>
              <small>{expanded ? "もどす" : "ひろげる"}</small>
            </button>
            <button
              ref={playButtonRef}
              className="play-button"
              type="button"
              data-testid="play-button"
              aria-label="できた曲を再生する"
              onClick={() => simpleCreation ? void beginPerformance() : openMoodPicker()}
            >
              <span className="play-icon" aria-hidden="true" />
              <span>さいせい</span>
            </button>
          </footer>
          <div ref={toolDrawerRef} id="shape-tool-drawer" className="tool-drawer" data-open={toolsOpen} aria-hidden={!toolsOpen}
            onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeTools(); } }}>
            {/* タップと下向きスワイプのどちらでも、ツールを画面外へ収納できる。 */}
            <button className="tool-drawer-handle" type="button" onClick={closeTools} aria-label="図形ツールをしまう"
              onPointerDown={(event) => { toolSwipeStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerUp={(event) => {
                if (toolSwipeStart.current !== null && event.clientY - toolSwipeStart.current > 28) closeTools();
                toolSwipeStart.current = null;
              }}
              onPointerCancel={() => { toolSwipeStart.current = null; }}>
              <span className="drawer-grip" aria-hidden="true" /><span>かたち</span><small>⌄ しまう</small>
            </button>
            <nav className="tool-dock" aria-label="かたちを選ぶ">
              {CREATION_TOOLS.map((kind) => (
                <button
                  key={kind}
                  className="tool-button"
                  type="button"
                  data-testid={`tool-${kind}`}
                  aria-label={`${SHAPE_LABELS[kind]}・${WORLD_SOUND_LABELS[worldId][instrumentForShape({ kind })]}`}
                  aria-pressed={selectedKind === kind}
                  onClick={() => {
                    setSelectedKind(kind);
                    setSelectedId(null);
                    showToast(`${SHAPE_LABELS[kind]}は ${WORLD_SOUND_LABELS[worldId][instrumentForShape({ kind })]}の おと`);
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
            </nav>
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
            animationMood={playingMood}
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
            <div className="performance-actions">
            <button className="fullscreen-button" type="button" aria-label={expanded ? "最大化を解除" : "画面を最大化"}
              aria-pressed={expanded} onClick={() => void toggleFullscreen()}>
              <span aria-hidden="true">{expanded ? "⊡" : "⛶"}</span>
              <small>{expanded ? "もどす" : "ひろげる"}</small>
            </button>
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
              shapes={shapesForScene(shapes, (sceneCount - 1) as SceneIndex, sceneCount)}
              events={events}
              theme={theme}
              beat={TOTAL_BEATS - 1}
              section="outro"
              animationMood={playingMood}
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
              <button className="action-card" type="button" disabled={recordingVideo} onClick={() => void beginPerformance(undefined, true)}>
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

      {!simpleCreation && moodPickerOpen && screen === "create" && (
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
                <h2 id="mood-title">{currentScene + 1}ばんの うごき</h2>
                <p id="mood-description">みんなの うごきを えらんでね・1ばめん {(30 / sceneCount).toFixed(1)}びょう</p>
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
            {!editingSceneMood && <button className="pill-button" type="button" data-testid="play-scene-plan" onClick={() => void beginPerformance()}>この うごきで さいせい</button>}
            <div className="mood-grid">
              {ANIMATION_MOOD_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`mood-card mood-card-${option.id}`}
                  type="button"
                  data-testid={`mood-${option.id}`}
                  onClick={() => { if (editingSceneMood) { setSceneMoods((values) => values.map((value, index) => index === currentScene ? option.id : value)); closeMoodPicker(); } else void beginPerformance(option.id); }}
                  aria-label={`${option.name}。${option.motion}な動き。${option.bgm}`}
                >
                  <span className={`mood-preview mood-preview-${backingMood(option.id)}`} data-motion={option.id} aria-hidden="true">
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
            <fieldset className="creation-settings">
              <legend>子どもに表示する機能</legend>
              <p>興味や慣れ具合に合わせて選べます。いつでも変更できます。</p>
              <label className="creation-mode-option">
                <input type="radio" name="creation-mode" value="basic" checked={simpleCreation} onChange={() => changeCreationMode("basic")} />
                <span><strong>図形と色であそぶ</strong><small>図形を置く・動かす・色を変える。音楽と動きはおまかせ。新しい作品は1場面です。</small></span>
              </label>
              <label className="creation-mode-option">
                <input type="radio" name="creation-mode" value="motion" checked={!simpleCreation} onChange={() => changeCreationMode("motion")} />
                <span><strong>動きも編集する</strong><small>場面を1〜10に増減し、15種類の集団の動きを選べます。大きさ・回転の編集も表示します。</small></span>
              </label>
              <p>設定はこのブラウザに自動保存します。別の端末・ブラウザには引き継がれません。ブラウザのデータを消すと設定も消えます。</p>
              <p>「図形と色」に切り替えても作品は消えません。既存作品は最初の場面を編集し、再生では保存済みの全場面と動きを使います。</p>
              <p>現在の動き編集は選択式です。命令を並べる・くり返すプログラミング学習機能は、まだ含まれていません。</p>
              {settingsSaved !== null && <p className="settings-save-status" role="status">{settingsSaved ? "このブラウザに設定を保存しました。" : "設定を保存できませんでした。今開いている間だけ適用します。"}</p>}
            </fieldset>
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
                <span><strong>音量</strong><small>音の大きさを調整できます</small></span>
                <input
                  type="range"
                  min="0"
                  max="1"
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

      {expanded && screen !== "create" && screen !== "perform" && (
        <button className="fullscreen-button fullscreen-exit" type="button" aria-label="最大化を解除"
          onClick={() => void toggleFullscreen()}>
          <span aria-hidden="true">⊡</span><small>もどす</small>
        </button>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

export default App;
