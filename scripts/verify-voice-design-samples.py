import contextlib
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

import mlx_whisper
import numpy as np
import soundfile as sf


directory = Path(__file__).resolve().parent.parent / "resources/voice-design"
model = str(Path.home() / ".cache/huggingface/hub/models--mlx-community--whisper-small-mlx/snapshots/45f3915923c7a79a5a5b5a7d909d39aeb0e5630e")
samples = json.loads((directory / "samples.json").read_text())
report = []
with tempfile.TemporaryDirectory(prefix="voice-design-qa-") as temporary:
    for sample in samples:
        path = directory / sample["filename"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == sample["sha256"]
        audio, rate = sf.read(path)
        assert rate == 48000 and np.isfinite(audio).all()
        assert 3 <= len(audio) / rate <= 30
        assert np.sqrt(np.mean(audio ** 2)) > 0.001
        converted = Path(temporary) / sample["filename"]
        subprocess.run(["/opt/homebrew/bin/ffmpeg", "-v", "error", "-y", "-i", str(path), "-ar", "16000", "-ac", "1", str(converted)], check=True)
        reference, _ = sf.read(converted, dtype="float32")
        with contextlib.redirect_stdout(sys.stderr):
            result = mlx_whisper.transcribe(reference, path_or_hf_repo=model, temperature=0.0, condition_on_previous_text=False, initial_prompt="以下是普通话的简体中文转写。")
        report.append({"id": sample["id"], "duration": len(audio) / rate, "peak": float(np.max(np.abs(audio))), "transcript": result["text"].strip(), "expected": sample["sampleText"]})
print(json.dumps(report, ensure_ascii=False, indent=2))
