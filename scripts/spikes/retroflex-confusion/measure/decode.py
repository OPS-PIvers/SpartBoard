"""Greedy CTC decode for wav2vec2-xlsr-53-espeak-cv-ft (ONNX).

Owns the argmax + CTC collapse itself, per S1 in the stress-detection spike:
`pipeline('automatic-speech-recognition')` discards frame timing, so the
convenience API cannot be used here either.

Prints the phoneme string, the frame span each symbol came from, and the
posteriors on the three contrastive rhotics at every frame where one of them
is the argmax.

Usage:
    MODEL_DIR=/path/to/model python3 decode.py model_q4.onnx clip.wav [...]

See ../RESULTS.md for how to fetch the model files (they are not committed).
"""

import json
import os
import sys
import wave
from math import gcd

import numpy as np
import onnxruntime as ort
from scipy.signal import resample_poly

MODEL_DIR = os.environ.get("MODEL_DIR", "./model")
TARGET_SR = 16000
PAD_ID = 0
RHOTICS = ("ɹ", "ɾ", "r")


def read_wav(path):
    """Read a mono 16-bit wav and resample to the model's 16 kHz."""
    with wave.open(path) as w:
        assert w.getnchannels() == 1, f"{path} is not mono"
        assert w.getsampwidth() == 2, f"{path} is not 16-bit PCM"
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if sr != TARGET_SR:
        g = gcd(sr, TARGET_SR)
        audio = resample_poly(audio, TARGET_SR // g, sr // g).astype(np.float32)
    return audio


def normalize(audio):
    """Wav2Vec2FeatureExtractor with do_normalize: zero mean, unit variance."""
    return ((audio - audio.mean()) / np.sqrt(audio.var() + 1e-7)).astype(np.float32)


def decode(session, vocab_inv, audio):
    """Return (tokens, frame_ids, logits).

    tokens is a list of (symbol, start_frame, end_frame) after the CTC
    collapse: merge runs of the same id, then drop <pad>.
    """
    x = normalize(audio)[None, :]
    feeds = {session.get_inputs()[0].name: x}
    if "attention_mask" in {i.name for i in session.get_inputs()}:
        feeds["attention_mask"] = np.ones(x.shape, dtype=np.int64)
    logits = session.run(None, feeds)[0]  # [1, frames, 392]
    ids = logits[0].argmax(-1)

    out, prev, start = [], None, 0
    for i, t in enumerate(ids):
        if t != prev:
            if prev is not None and prev != PAD_ID:
                out.append((vocab_inv[prev], start, i))
            prev, start = t, i
    if prev is not None and prev != PAD_ID:
        out.append((vocab_inv[prev], start, len(ids)))
    return out, ids, logits[0]


def softmax(logits):
    e = np.exp(logits - logits.max(-1, keepdims=True))
    return e / e.sum(-1, keepdims=True)


def load(model_file):
    vocab = json.load(open(f"{MODEL_DIR}/vocab.json"))
    session = ort.InferenceSession(
        f"{MODEL_DIR}/{model_file}", providers=["CPUExecutionProvider"]
    )
    return vocab, {v: k for k, v in vocab.items()}, session


def main():
    model_file = sys.argv[1]
    vocab, vocab_inv, session = load(model_file)
    rho = {s: vocab[s] for s in RHOTICS}

    print(f"=== {model_file} ===")
    for p in sys.argv[2:]:
        audio = read_wav(p)
        toks, ids, logits = decode(session, vocab_inv, audio)
        probs = softmax(logits)
        stride = len(audio) / TARGET_SR * 1000 / len(ids)

        print(f"\n{p.rsplit('/', 1)[-1]}  ({len(audio)/TARGET_SR:.2f}s, "
              f"{len(ids)} frames, {stride:.1f} ms/frame)")
        print("  string: " + "".join(t for t, _, _ in toks))
        print("  spans : " + "  ".join(
            f"{t}[{a*stride:.0f}-{b*stride:.0f}ms]" for t, a, b in toks))

        hits = [i for i, t in enumerate(ids) if t in rho.values()]
        if not hits:
            print("  rhotic frames: NONE")
            continue
        print("  rhotic frames:")
        for i in hits:
            cells = "  ".join(f"{s}={probs[i, k]:.3f}" for s, k in rho.items())
            print(f"    f{i} ({i*stride:.0f}ms) argmax={vocab_inv[ids[i]]}   {cells}")


if __name__ == "__main__":
    main()
