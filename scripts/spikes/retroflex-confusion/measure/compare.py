"""Score every committed clip against its espeak reference, in all four
quantizations, and print the edit operations the alignment engine would charge.

Stating the result in edits rather than in raw phoneme strings is the point:
"the model returned perro" means nothing until you know the reference is
`pero` and the extra token is an insertion A5/A6 dock.

WHAT THIS COVERS, AND WHAT IT DOES NOT
--------------------------------------
Five clips, ONE speaker, deliberate productions, n = 1 per condition. Greedy
CTC decoding is deterministic (verified: three identical runs), so re-running a
clip cannot add observations -- only new recordings can.

This is therefore a necessary-condition SCREEN, not the 3x3 confusion matrix
with n >= 30 per cell that #2355 specifies. It can refute (a collapse that
shows up here is real) far better than it can confirm. Any reading about
tap/trill confusability is additionally confounded: the speaker's L1 is not
recorded anywhere, and a deliberate tap is not a learner's tap.

Usage:
    MODEL_DIR=/path/to/model python3 compare.py
"""

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import onnxruntime as ort  # noqa: E402
from decode import MODEL_DIR, decode, read_wav  # noqa: E402

AUDIO = os.environ.get(
    "AUDIO_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "../../pronunciation-bias-probe/audio"),
)

# clip -> (target word, what the speaker was deliberately producing)
CLIPS = [
    ("pero_anglo_r_human.wav", "pero", "English retroflex (the learner ERROR)"),
    ("pero_tap_human.wav", "pero", "Spanish tap (CORRECT)"),
    ("perro_trill_human_1.wav", "perro", "trill, weakest (CORRECT)"),
    ("perro_trill_human_2.wav", "perro", "trill, middle (CORRECT)"),
    ("perro_trill_human_3.wav", "perro", "trill, strongest (CORRECT)"),
]

VARIANTS = [
    ("model.onnx", "fp32"),
    ("model_fp16.onnx", "fp16"),
    ("model_q4.onnx", "q4"),
    ("model_q4f16.onnx", "q4f16"),
]

STRESS = "ˈˌ"
ZWJ = "‍"  # espeak --ipa=3 writes this inside diphthongs; strip it


def reference(word):
    """espeak-ng's narrow IPA for the word, stress marks and ZWJ removed."""
    raw = subprocess.run(
        ["espeak-ng", "-v", "es-419", "-q", "--ipa=3", word],
        capture_output=True, text=True, check=True).stdout.strip()
    out = raw
    for ch in STRESS + ZWJ:
        out = out.replace(ch, "")
    return out, raw


def tokenize(s, vocab):
    """Longest-match tokenization against the model's own vocabulary.

    Necessary because the model's alphabet has multi-character tokens; naive
    per-character splitting would miscount every diphthong and length mark.
    """
    toks, i = [], 0
    while i < len(s):
        for n in (3, 2, 1):
            if s[i:i + n] in vocab:
                toks.append(s[i:i + n])
                i += n
                break
        else:
            toks.append(s[i])
            i += 1
    return toks


def edits(ref, hyp):
    """Levenshtein distance plus the operation list, ref -> hyp."""
    n, m = len(ref), len(hyp)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1,
                          d[i - 1][j - 1] + (ref[i - 1] != hyp[j - 1]))
    ops, i, j = [], n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + (ref[i - 1] != hyp[j - 1]):
            if ref[i - 1] != hyp[j - 1]:
                ops.append(f"sub {ref[i-1]}->{hyp[j-1]}")
            i, j = i - 1, j - 1
        elif j > 0 and d[i][j] == d[i][j - 1] + 1:
            ops.append(f"ins {hyp[j-1]}")
            j -= 1
        else:
            ops.append(f"del {ref[i-1]}")
            i -= 1
    return d[n][m], list(reversed(ops))


def main():
    import json
    with open(f"{MODEL_DIR}/vocab.json") as f:
        vocab = json.load(f)
    vocab_inv = {v: k for k, v in vocab.items()}
    grid = {}

    for model_file, label in VARIANTS:
        sess = ort.InferenceSession(f"{MODEL_DIR}/{model_file}",
                                    providers=["CPUExecutionProvider"])
        print(f"\n{'='*72}\n{label}\n{'='*72}")
        exact = total = 0
        for fn, word, desc in CLIPS:
            ref_s, raw = reference(word)
            ref = tokenize(ref_s, vocab)
            toks, _, _ = decode(sess, vocab_inv, read_wav(f"{AUDIO}/{fn}"))
            hyp = [t for t, _, _ in toks]
            dist, ops = edits(ref, hyp)
            exact += dist == 0
            total += dist
            grid[(label, fn)] = dist
            print(f"\n{fn}\n  intent : {desc}")
            print(f"  target : {word}  espeak={raw!r}  ref={ref}")
            print(f"  model  : {hyp}")
            print(f"  {'MATCH ' if dist == 0 else 'DIFFER'}  edits={dist}"
                  f"   {'; '.join(ops) if ops else '-'}")
        grid[(label, "_exact")] = exact
        grid[(label, "_total")] = total
        print(f"\n  exact matches: {exact}/{len(CLIPS)}   total edits: {total}")

    labels = [lab for _, lab in VARIANTS]
    print(f"\n\n{'='*72}\nSUMMARY — edit distance vs the espeak reference\n{'='*72}")
    print(f"{'clip':<30}" + "".join(f"{lab:>8}" for lab in labels))
    for fn, _, _ in CLIPS:
        print(f"{fn[:29]:<30}" + "".join(f"{grid[(l, fn)]:>8}" for l in labels))
    print(f"{'exact / 5':<30}" + "".join(f"{grid[(l, '_exact')]:>8}" for l in labels))
    print(f"{'total edits':<30}" + "".join(f"{grid[(l, '_total')]:>8}" for l in labels))


if __name__ == "__main__":
    main()
