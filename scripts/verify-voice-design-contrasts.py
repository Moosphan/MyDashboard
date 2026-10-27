import contextlib
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

import mlx_whisper
import numpy as np
from scipy.signal import correlate, find_peaks, resample_poly
import soundfile as sf


def median_pitch(audio, rate):
    downsampled = resample_poly(audio, 1, rate // 16000)
    pitches = []
    threshold = np.max(np.abs(downsampled)) * 0.05
    for offset in range(0, len(downsampled) - 1024, 320):
        frame = downsampled[offset:offset + 1024]
        if np.sqrt(np.mean(frame ** 2)) < threshold:
            continue
        centered = frame - np.mean(frame)
        correlation = correlate(centered, centered, mode="full", method="fft")[1023:]
        lower, upper = 16000 // 600, 16000 // 60
        peaks, _ = find_peaks(correlation[lower:upper])
        if not len(peaks) or correlation[0] <= 0:
            continue
        lags = peaks + lower
        best = np.max(correlation[lags])
        if best / correlation[0] < 0.5:
            continue
        lag = lags[np.flatnonzero(correlation[lags] >= best * 0.9)[0]]
        pitches.append(16000 / lag)
    return float(np.median(pitches)) if pitches else None


samples = json.loads(Path(sys.argv[1]).read_text())
model = str(Path.home() / ".cache/huggingface/hub/models--mlx-community--whisper-small-mlx/snapshots/45f3915923c7a79a5a5b5a7d909d39aeb0e5630e")
report = []
hashes = set()
with tempfile.TemporaryDirectory(prefix="voice-contrasts-qa-") as temporary:
    for sample in samples:
        raw, rate = sf.read(sample["rawPath"])
        audio, output_rate = sf.read(sample["path"])
        assert rate == output_rate == 48000
        assert np.isfinite(audio).all() and np.sqrt(np.mean(audio ** 2)) > 0.001
        digest = hashlib.sha256(Path(sample["rawPath"]).read_bytes()).hexdigest()
        assert digest not in hashes
        hashes.add(digest)
        raw_duration = len(raw) / rate
        duration = len(audio) / rate
        assert abs(duration - raw_duration / sample["options"]["designTempo"]) < 0.08
        converted = Path(temporary) / f'{sample["id"]}.wav'
        subprocess.run(["/opt/homebrew/bin/ffmpeg", "-v", "error", "-y", "-i", sample["path"], "-ar", "16000", "-ac", "1", str(converted)], check=True)
        reference, _ = sf.read(converted, dtype="float32")
        with contextlib.redirect_stdout(sys.stderr):
            result = mlx_whisper.transcribe(reference, path_or_hf_repo=model, temperature=0.0, condition_on_previous_text=False, initial_prompt="以下是普通话的简体中文转写。")
        report.append({"id": sample["id"], "rawDuration": raw_duration, "duration": duration, "rawMedianPitchHz": median_pitch(raw, rate), "medianPitchHz": median_pitch(audio, rate), "peak": float(np.max(np.abs(audio))), "sha256": digest, "transcript": result["text"].strip(), "expected": "你好，今天我们一起听一个新的故事。"})
print(json.dumps(report, ensure_ascii=False, indent=2))
