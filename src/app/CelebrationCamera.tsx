import { useEffect, useRef, useState } from "react";
import { openFrontCamera } from "../storage/cameraSettings";
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

  useEffect(() => {
    let active = true;
    // StrictModeの再マウント確認では権限要求を重複させない。
    void Promise.resolve().then(() => active ? openFrontCamera() : null).then(async (stream) => {
      if (!stream) return;
      if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    }).catch((err: unknown) => {
      if (!active) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")) onDenied();
      else setError("カメラを開けませんでした。ほかのアプリで使用していないか、おとなの方に確認してもらってね。");
    });
    /** 背景タブで撮影が続かないよう、画面を離れたら閉じる。 */
    const hide = () => { if (document.hidden) { streamRef.current?.getTracks().forEach((track) => track.stop()); onClose(); } };
    /** ページを離れる際も撮影ストリームを停止する。 */
    const stop = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => { active = false; stop(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", stop); };
  }, [attempt, onClose, onDenied]);

  useEffect(() => {
    if (!photo) { setPhotoUrl(""); return; }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  /** 手動シャッターで鏡像のプレビューと同じJPEGを作り、撮影直後にカメラを止める。 */
  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { setError("写真を作れませんでした。もう一度ためしてね。"); return; }
      setPhoto(blob); setReady(false);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    }, "image/jpeg", .9);
  };

  return <div className="parent-overlay"><section className="parent-panel camera-panel" role="dialog" aria-modal="true" aria-labelledby="camera-title">
    <header><h2 id="camera-title">できたね！ ピース！</h2><button className="icon-button" onClick={onClose} aria-label="撮影を閉じる">×</button></header>
    <p>おもいどおりに できたら、ピースして とってみよう。とらずに とじても いいよ。</p>
    {photoUrl ? <img className="celebration-photo" src={photoUrl} alt="撮影した記念写真" /> : <video ref={videoRef} className="celebration-video" muted playsInline onLoadedData={() => setReady(true)} />}
    {error && <p role="alert">{error}</p>}
    <div className="camera-actions">{photo ? <>
      <button className="pill-button" onClick={() => downloadFile(photo, "otocanvas-peace.jpg")}>しゃしんを ほぞん</button>
      <button className="pill-button" onClick={() => { setPhoto(null); setPhotoUrl(""); setError(""); setAttempt((n) => n + 1); }}>とりなおす</button>
    </> : <button className="pill-button" disabled={!ready || !!error} onClick={capture}>ピース！ とる</button>}</div>
    <p>写真は送信しません。「ほぞん」で画像ファイルになります。閉じるとアプリ内の写真は消えます。</p>
  </section></div>;
}
