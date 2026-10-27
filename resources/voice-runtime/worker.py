import contextlib
import hashlib
import json
import os
import sys
import threading
import time


def configure_memory(runtime):
    info = runtime.device_info()
    memory_limit = min(info["max_recommended_working_set_size"], info["memory_size"] // 2)
    runtime.set_memory_limit(memory_limit)
    runtime.set_cache_limit(128 * 1024**2)


def main():
    request = json.loads(sys.stdin.readline())
    output_stream = sys.stdout
    identity = {"protocolVersion": 1, "jobId": request["jobId"], "attemptId": request["attemptId"]}

    def emit(kind, **data):
        output_stream.write(json.dumps({**identity, "type": kind, **data}, ensure_ascii=False) + "\n")
        output_stream.flush()

    heartbeat_time = [time.monotonic()]

    def heartbeat_reader():
        for line in sys.stdin:
            heartbeat_time[0] = time.monotonic()
        os._exit(1)

    def watchdog():
        while True:
            time.sleep(5)
            if time.monotonic() - heartbeat_time[0] > 30:
                os._exit(1)

    threading.Thread(target=heartbeat_reader, daemon=True).start()
    threading.Thread(target=watchdog, daemon=True).start()
    try:
        with contextlib.redirect_stdout(sys.stderr):
            import mlx.core as mx
            import numpy as np
            import soundfile as sf
            from mlx_audio.tts.utils import load_model

            configure_memory(mx)
            if request.get("protocolVersion") != 1:
                raise ValueError("不支持的 Worker 协议")
            if request.get("voiceDesign"):
                if request["engine"] != "voxcpm2":
                    raise ValueError("INVALID_OPTIONS: 文字造声仅支持 VoxCPM2")
            else:
                with open(request["referencePath"], "rb") as reference_file:
                    digest = hashlib.sha256(reference_file.read()).hexdigest()
                if digest != request["referenceSha256"]:
                    raise ValueError("REFERENCE_INVALID: 参考声音校验失败")
            started = time.monotonic()
            model = load_model(request["modelPath"])
            mx.eval(model.parameters())
            load_seconds = time.monotonic() - started
            emit("phase", message="正在生成配音")
            mx.random.seed(request["options"]["seed"])
            if request["engine"] == "voxcpm2":
                from adapters.voxcpm2 import generate, generation_limit
                request["maxTokens"] = generation_limit(request)
            elif request["engine"] == "qwen3-tts":
                from adapters.qwen3 import generate
            else:
                raise ValueError("不支持的本地引擎")
            results = list(generate(model, request))
            if not results:
                raise ValueError("OUTPUT_INVALID: 未生成音频")
            rates = {result.sample_rate for result in results}
            if len(rates) != 1:
                raise ValueError("OUTPUT_INVALID: 采样率不一致")
            audio = np.concatenate([np.asarray(result.audio, dtype=np.float32).reshape(-1) for result in results])
            rate = results[0].sample_rate
            duration = audio.size / rate
            if audio.size == 0 or not np.isfinite(audio).all() or not 0 < duration <= 120:
                raise ValueError("OUTPUT_INVALID: 无效输出或超过 120 秒")
            peak = float(np.max(np.abs(audio)))
            if peak < 0.001:
                raise ValueError("OUTPUT_INVALID: 静音输出")
            if request["engine"] == "qwen3-tts" and any(result.token_count >= 2048 for result in results):
                raise ValueError("OUTPUT_TRUNCATED: 已达到生成上限，请缩短文案")
            if request["engine"] == "voxcpm2" and duration >= 119.5:
                raise ValueError("OUTPUT_TRUNCATED: 已达到时长上限，请缩短文案")
            if request["engine"] == "voxcpm2":
                patch_samples = model.patch_size * model.audio_vae.decode_chunk_size
                if audio.size >= patch_samples * (request["maxTokens"] - 1):
                    raise ValueError("OUTPUT_TRUNCATED: 本段生成未正常收尾，已达到按文案长度设置的时长上限；请核对参考音转写或缩短本段重试")
            raw_path = request["outputPath"]
            sf.write(raw_path, audio, rate, subtype="FLOAT")
            audio *= (10 ** (-1 / 20)) / peak
            gain = request["options"].get("gainDb", 0)
            if gain:
                audio *= 10 ** (gain / 20)
                audio /= max(1.0, float(np.max(np.abs(audio))) / (10 ** (-1 / 20)))
            processed_path = os.path.join(os.path.dirname(raw_path), "output.wav")
            sf.write(processed_path, audio, rate, subtype="PCM_16")
            emit("result", path="output.wav", rawPath="raw.wav", duration=duration, sampleRate=rate, generationSeconds=time.monotonic() - started, loadSeconds=load_seconds, peakMemoryBytes=mx.get_peak_memory())
    except Exception as error:
        emit("error", message=str(error))
        sys.exit(1)


if __name__ == "__main__":
    main()
