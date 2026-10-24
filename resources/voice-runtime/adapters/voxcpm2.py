from pathlib import Path
from tempfile import TemporaryDirectory
import wave


def generate(model, request):
    with wave.open(request["referencePath"], "rb") as reference:
        parameters = reference.getparams()
        frames = reference.readframes(reference.getnframes())
    pause_seconds = request["options"].get("promptPauseMs", 320) / 1000
    pause_frames = round(parameters.framerate * pause_seconds)
    silence = b"\x80" if parameters.sampwidth == 1 else b"\x00"
    pause = silence * pause_frames * parameters.nchannels * parameters.sampwidth
    with TemporaryDirectory(prefix="voxcpm2-prompt-") as directory:
        prompt_path = str(Path(directory) / "prompt.wav")
        with wave.open(prompt_path, "wb") as prompt:
            prompt.setparams(parameters)
            prompt.writeframes(frames + pause)
        yield from model.generate(
            text=request["text"],
            ref_audio=request["referencePath"],
            prompt_audio=prompt_path,
            prompt_text=request["referenceText"],
            inference_timesteps=request["options"]["steps"],
            cfg_value=request["options"]["cfg"],
            max_tokens=1500,
        )
