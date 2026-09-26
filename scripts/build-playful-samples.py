"""CC0の原音から短いPCM音源を生成する。実行にはffmpegが必要。"""
import array
import base64
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE = 22050
LIMITS = {"voice-ah": .75, "voice-hum": .7, "mouth-pop": .3, "toy-duck": .6,
          "toy-squeak": .32, "toy-ball": .35, "cartoon-boing": .25,
          "cartoon-twang": .65, "slide-whistle": .7}


# 音量の大きい区間の自己相関から基準音を推定し、非周期音は中央ドを基準にする。
def estimate_pitch(samples):
    width = min(2205, len(samples))
    starts = range(0, max(1, len(samples) - width), max(1, width // 2))
    start = max(starts, key=lambda i: sum(x*x for x in samples[i:i+width]))
    chunk = samples[start:start+width]
    correlations = []
    for lag in range(16, min(276, len(chunk)//2)):
        a, b = chunk[:-lag], chunk[lag:]
        power = math.sqrt(sum(x*x for x in a) * sum(x*x for x in b))
        correlations.append(sum(x*y for x, y in zip(a, b)) / max(power, 1e-12))
    peaks = [i for i in range(1, len(correlations)-1)
             if correlations[i] > correlations[i-1] and correlations[i] >= correlations[i+1]]
    if not peaks or max(correlations[i] for i in peaks) < .4:
        return 261.625565
    threshold = max(correlations[i] for i in peaks) * .92
    peak = next(i for i in peaks if correlations[i] >= threshold)
    return RATE / (peak + 16)


# MP3の無音を除き、短いフェードと共通の音量上限を付けて再生/WAV共通データにする。
def main():
    folder = ROOT / "assets/audio-sources"
    sources = json.loads((folder / "sources.json").read_text(encoding="utf-8-sig"))
    bank = {}
    with tempfile.TemporaryDirectory() as directory:
        for source in sources:
            name = source["name"]
            original = folder / (name + ".mp3")
            decoded = Path(directory) / (name + ".wav")
            # 外部音源を実行せず、ffmpegへデータファイルとして渡してPCMに変換する。
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(original), "-ac", "1",
                            "-ar", str(RATE), "-af", "highpass=f=70,lowpass=f=8500",
                            "-c:a", "pcm_s16le", str(decoded)], check=True)
            with wave.open(str(decoded), "rb") as wav:
                raw = array.array("h", wav.readframes(wav.getnframes()))
            if sys.byteorder != "little": raw.byteswap()
            values = [x / 32768 for x in raw]
            peak = max(abs(x) for x in values)
            active = [i for i, x in enumerate(values) if abs(x) > peak * .08]
            if not active: raise ValueError("無音の素材: " + name)
            start = max(0, active[0] - int(.008 * RATE))
            end = min(len(values), active[-1] + int(.025 * RATE), start + int(LIMITS[name] * RATE))
            values = values[start:end]
            mean = sum(values) / len(values)
            values = [x - mean for x in values]
            root = estimate_pitch(values)
            rms = math.sqrt(sum(x*x for x in values) / len(values))
            gain = min(.78 / max(abs(x) for x in values), .22 / max(rms, 1e-8))
            values = [x * gain * min(1, i / (RATE * .004), (len(values)-1-i) / (RATE * .025)) for i, x in enumerate(values)]
            pcm = array.array("h", (round(x * 32767) for x in values))
            if sys.byteorder != "little": pcm.byteswap()
            bank[name] = {"sampleRate": RATE, "rootHz": round(root, 6), "pcm": base64.b64encode(pcm.tobytes()).decode("ascii")}
            source.update({"sha256": hashlib.sha256(original.read_bytes()).hexdigest(), "license": "CC0-1.0",
                           "retrieved": "2026-09-26", "excerptStart": round(start / RATE, 4),
                           "excerptSeconds": round(len(values) / RATE, 4), "estimatedRootHz": round(root, 3)})
            preview = ROOT / ".tmp/playful-sources" / (name + "-edited.wav")
            preview.parent.mkdir(parents=True, exist_ok=True)
            with wave.open(str(preview), "wb") as wav:
                wav.setparams((1, 2, RATE, 0, "NONE", "not compressed")); wav.writeframes(pcm.tobytes())
            print(f"{name}: {len(values)/RATE:.3f}s, root={root:.1f}Hz, peak={max(abs(x) for x in values):.3f}")
    (ROOT / "src/music/playfulSamples.json").write_text(json.dumps(bank, separators=(",", ":")), encoding="utf-8")
    (folder / "sources.json").write_text(json.dumps(sources, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
