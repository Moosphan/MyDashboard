import importlib.util
from pathlib import Path
import tempfile
import unittest
import wave


adapter_path = Path(__file__).resolve().parent.parent / "resources/voice-runtime/adapters/voxcpm2.py"
spec = importlib.util.spec_from_file_location("voxcpm2_adapter", adapter_path)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
qwen_spec = importlib.util.spec_from_file_location(
    "qwen3_adapter",
    Path(__file__).resolve().parent.parent / "resources/voice-runtime/adapters/qwen3.py",
)
qwen_adapter = importlib.util.module_from_spec(qwen_spec)
qwen_spec.loader.exec_module(qwen_adapter)


class ContinuationCloneModel:
    def __init__(self, fail=False):
        self.fail = fail

    def generate(self, **arguments):
        self.arguments = arguments
        prompt = arguments.get("prompt_audio")
        if prompt:
            with wave.open(prompt, "rb") as recording:
                self.prompt_rate = recording.getframerate()
                self.prompt_frames = recording.readframes(recording.getnframes())
        if self.fail:
            raise RuntimeError("generation failed")
        yield "cloned audio"


class QwenCloneModel:
    def generate(self, **arguments):
        self.arguments = arguments
        yield "cloned audio"


class VoxCPM2AdapterTests(unittest.TestCase):
    def generate(self, directory, rate, fail=False, pause_ms=None):
        model = ContinuationCloneModel(fail)
        reference = Path(directory) / "reference.wav"
        frames = b"\x00\x20" * rate
        with wave.open(str(reference), "wb") as recording:
            recording.setnchannels(1)
            recording.setsampwidth(2)
            recording.setframerate(rate)
            recording.writeframes(frames)
        original = reference.read_bytes()
        request = {
            "text": "自控的核心动作不是永远不分心。",
            "referencePath": str(reference),
            "referenceText": "有时是灵动可爱的少女。",
            "options": {"steps": 10, "cfg": 2},
        }
        if pause_ms is not None:
            request["options"]["promptPauseMs"] = pause_ms
        expected_pause = (320 if pause_ms is None else pause_ms) / 1000

        if fail:
            with self.assertRaisesRegex(RuntimeError, "generation failed"):
                list(adapter.generate(model, request))
        else:
            self.assertEqual(list(adapter.generate(model, request)), ["cloned audio"])
        self.assertIn("prompt_audio", model.arguments)
        self.assertEqual(model.prompt_rate, rate)
        self.assertEqual(len(model.prompt_frames), len(frames) + round(rate * expected_pause) * 2)
        self.assertEqual(model.prompt_frames, frames + b"\x00\x00" * round(rate * expected_pause))
        self.assertEqual(reference.read_bytes(), original)
        self.assertEqual(model.arguments["ref_audio"], str(reference))
        self.assertEqual(model.arguments["prompt_text"], request["referenceText"])
        self.assertEqual(model.arguments["text"], request["text"])
        self.assertEqual(model.arguments["inference_timesteps"], 10)
        self.assertEqual(model.arguments["cfg_value"], 2)
        self.assertEqual(model.arguments["max_tokens"], 1500)
        self.assertFalse(Path(model.arguments["prompt_audio"]).exists())

    def test_continuation_starts_after_a_pause_without_changing_speaker_reference(self):
        for rate in [16000, 24000]:
            with self.subTest(rate=rate), tempfile.TemporaryDirectory() as directory:
                self.generate(directory, rate)

    def test_temporary_prompt_is_removed_when_generation_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            self.generate(directory, 24000, fail=True)

    def test_configurable_pause_including_zero_reaches_the_continuation_prompt(self):
        for pause_ms in [0, 160, 500, 1000]:
            with self.subTest(pause_ms=pause_ms), tempfile.TemporaryDirectory() as directory:
                self.generate(directory, 24000, pause_ms=pause_ms)


class Qwen3AdapterTests(unittest.TestCase):
    def test_base_model_receives_only_the_frozen_reference_clone_inputs(self):
        model = QwenCloneModel()
        result = list(
            qwen_adapter.generate(
                model,
                {
                    "text": "第九段重新生成也应保持同一音色。",
                    "referencePath": "/tmp/frozen-female-reference.wav",
                    "referenceText": "这是冻结音色的准确参考文字。",
                    "options": {"language": "zh", "temperature": 0.35},
                },
            )
        )
        self.assertEqual(result, ["cloned audio"])
        self.assertEqual(model.arguments["ref_audio"], "/tmp/frozen-female-reference.wav")
        self.assertEqual(model.arguments["ref_text"], "这是冻结音色的准确参考文字。")
        self.assertEqual(model.arguments["lang_code"], "Chinese")
        self.assertEqual(model.arguments["temperature"], 0.35)
        self.assertNotIn("voice", model.arguments)
        self.assertNotIn("speaker", model.arguments)


if __name__ == "__main__":
    unittest.main()
