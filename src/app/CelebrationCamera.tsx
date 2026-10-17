import { ControlIcon } from "./ControlIcon";
import { useEffect, useRef, useState } from "react";
import { openCamera } from "../storage/cameraSettings";
import { downloadFile } from "../export/projectFile";

/** 子どもが撮影を選んだ間だけ映像を表示し、閉じる・背景移行・エラーで必ず停止する。 */
export function CelebrationCamera({ onClose, onDenied }: { onClose: () => void; onDenied: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [mirrored, setMirrored] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const capturing = useRef(false);

  /** 閉じる・切替・背景移行で、予約した撮影と遅れて返る写真を無効にする。 */
  const stop = () => {
    generation.current += 1;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    capturing.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let active = true;
    setReady(false); setCountdown(null); setError("");
    // StrictModeの再マウント確認では権限要求を重複させない。
    void Promise.resolve().then(() => active ? openCamera(facing) : null).then(async (stream) => {
      if (!stream) return;
      if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const actualFacing = stream.getVideoTracks()[0]?.getSettings().facingMode;
      setMirrored((actualFacing ?? facing) === "user");
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    }).catch((err: unknown) => {
      if (!active) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) onDenied();
      else setError(facing === "environment" ? "そとカメラを開けませんでした。うちカメラにもどすか、おとなの方に確認してもらってね。" : "カメラを開けませんでした。ほかのアプリで使用していないか、おとなの方に確認してもらってね。");
    });
    /** 背景タブで撮影が続かないよう、画面を離れたら閉じる。 */
    const hide = () => { if (document.hidden) { active = false; stop(); onClose(); } };
    /** ページを離れる際も撮影ストリームを停止する。 */
    const leave = () => { active = false; stop(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => { active = false; stop(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", leave); };
  }, [attempt, facing, onClose, onDenied]);

  useEffect(() => {
    if (!photo) { setPhotoUrl(""); return; }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  /** カウント終了時の映像を、内カメラだけ鏡像にしてJPEGへ保存する。 */
  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !streamRef.current?.active) { capturing.current = false; setError("カメラの映像を確認して、もう一度ためしてね。"); return; }
    const request = generation.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) { capturing.current = false; setError("写真を作れませんでした。"); return; }
    if (mirrored) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (generation.current !== request) return;
      capturing.current = false;
      if (!blob) { setError("写真を作れませんでした。もう一度ためしてね。"); return; }
      setPhoto(blob); setReady(false);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    }, "image/jpeg", .9);
  };

  /** 二重撮影を防ぎ、3・2・1をそれぞれ1秒見せてから撮影する。 */
  const startCountdown = () => {
    if (!ready || error || capturing.current) return;
    capturing.current = true;
    const request = generation.current;
    setCountdown(3);
    /** 画面を閉じた後の予約処理を無視し、最後の数字から撮影へ進める。 */
    const tick = (remaining: number) => {
      if (generation.current !== request) return;
      if (remaining === 0) { timerRef.current = null; setCountdown(null); capture(); return; }
      setCountdown(remaining);
      timerRef.current = setTimeout(() => tick(remaining - 1), 1000);
    };
    timerRef.current = setTimeout(() => tick(2), 1000);
  };

  /** 端末が同時に複数カメラを開けなくても切り替えられるよう、先に映像を解放する。 */
  const switchCamera = () => {
    stop(); setReady(false); setCountdown(null); setError("");
    setFacing((current) => current === "user" ? "environment" : "user");
  };

  return <div className="parent-overlay"><section className="parent-panel camera-panel" role="dialog" aria-modal="true" aria-labelledby="camera-title">
    <header><h2 id="camera-title">できたね！ ピース！</h2><button className="icon-button" onClick={() => { stop(); onClose(); }} aria-label="撮影を閉じる"><ControlIcon name="close" /></button></header>
    <p>おもいどおりに できたら、ピースして とってみよう。とらずに とじても いいよ。</p>
    <div className="camera-preview">
      {photoUrl ? <img className="celebration-photo" src={photoUrl} alt="撮影した記念写真" /> : <video key={`${facing}-${attempt}`} ref={videoRef} className="celebration-video" style={{ transform: mirrored ? "scaleX(-1)" : "none" }} muted playsInline onLoadedData={() => setReady(true)} />}
      {countdown !== null && <div className="camera-countdown" role="status" aria-live="assertive" aria-atomic="true"><span>{countdown}</span></div>}
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="camera-actions">{photo ? <>
      <button className="pill-button" onClick={() => void downloadFile(photo, "otocanvas-peace.jpg").catch(() => setError("写真を保存できませんでした。もう一度ためしてね。"))}>しゃしんを ほぞん</button>
      <button className="pill-button" onClick={() => { setPhoto(null); setPhotoUrl(""); setError(""); setAttempt((n) => n + 1); }}>とりなおす</button>
    </> : <>
      <button className="pill-button" disabled={!ready || !!error || countdown !== null} onClick={startCountdown}>ピース！ とる</button>
      <button className="pill-button" disabled={countdown !== null} onClick={switchCamera}>{facing === "user" ? "そとカメラに きりかえ" : "うちカメラに きりかえ"}</button>
      {error && <button className="pill-button" onClick={() => setAttempt((n) => n + 1)}>もういちど ためす</button>}
    </>}</div>
    <p>写真は送信しません。「ほぞん」で画像ファイルになります。閉じるとアプリ内の写真は消えます。</p>
  </section></div>;
}
