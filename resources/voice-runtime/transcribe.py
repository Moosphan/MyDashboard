import argparse
import contextlib
import json
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--audio', required=True)
    args = parser.parse_args()
    with contextlib.redirect_stdout(sys.stderr):
        import soundfile as sf
        import mlx_whisper

        audio, sample_rate = sf.read(args.audio, dtype='float32')
        if sample_rate != 16000 or audio.ndim != 1:
            raise ValueError('Expected 16 kHz mono reference')
        result = mlx_whisper.transcribe(audio, path_or_hf_repo=args.model, temperature=0.0, condition_on_previous_text=False, initial_prompt='以下是普通话的简体中文转写，使用标点符号。')
        text = result['text']
        if not text.strip():
            raise ValueError('No speech recognized')
    print(json.dumps({'text': text.strip()}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
