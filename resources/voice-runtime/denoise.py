import argparse
import contextlib
import hashlib
import json
import math
import os
from pathlib import Path
import sys


def enhance_reference(model_path, audio_path, expected_sha256, output_path):
    model = Path(model_path)
    source = Path(audio_path)
    output = Path(output_path)
    if source.resolve() == output.resolve():
        raise ValueError("降噪输出不能覆盖原录音")
    if hashlib.sha256(source.read_bytes()).hexdigest() != expected_sha256:
        raise ValueError("REFERENCE_INVALID: 参考声音校验失败")
    for filename in ("configuration.json", "pytorch_model.bin"):
        if not (model / filename).is_file():
            raise ValueError(f"降噪模型缺少 {filename}，请先配置本地模型")
    os.environ["MODELSCOPE_OFFLINE"] = "1"
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np
        import soundfile as sf
        import torch
        import torchaudio
        from modelscope.pipelines import pipeline
        from modelscope.utils.constant import Tasks

        torch.set_num_threads(4)
        original = sf.info(source)
        temporary = output.with_name(output.name + ".tmp.wav")
        try:
            enhancer = pipeline(Tasks.acoustic_noise_suppression, model=str(model), device="cpu")
            enhancer(str(source), output_path=str(temporary))
            audio, sample_rate = torchaudio.load(str(temporary))
            loudness = torchaudio.functional.loudness(audio, sample_rate)
            if not torch.isfinite(loudness).all():
                raise ValueError("降噪后未检测到有效人声")
            normalized = torchaudio.functional.gain(audio, -20 - loudness)
            torchaudio.save(str(temporary), normalized, sample_rate)
            cleaned, sample_rate = sf.read(temporary)
            duration = len(cleaned) / sample_rate
            if sample_rate != 16000 or cleaned.ndim != 1 or not np.isfinite(cleaned).all():
                raise ValueError("降噪输出格式无效")
            if not 3 <= duration <= 30.05 or not math.isclose(duration, original.duration, abs_tol=0.02):
                raise ValueError("降噪输出时长与参考录音不一致")
            peak = float(np.max(np.abs(cleaned)))
            if not 0.001 <= peak < 1:
                raise ValueError("降噪输出静音或发生削波，请更换参考片段")
            temporary.replace(output)
            return {"sampleRate": sample_rate, "duration": duration}
        finally:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        result = enhance_reference(args.model, args.audio, args.sha256, args.output)
        print(json.dumps(result), flush=True)
    except Exception as error:
        print(f"DENOISE_FAILED: {error}", file=sys.stderr, flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
