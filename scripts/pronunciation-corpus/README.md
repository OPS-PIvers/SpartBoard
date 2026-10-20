# Speak corpus and gate

The native-speaker corpus and CI gate for Flashcards Speak (`docs/multilingual-pronunciation-engine.md` §8).

| File                 | What it does                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `words.json`         | 60 words per language, chosen to cover every §4.2 sound group and stress position, with espeak-ng references per dialect.                                       |
| `words.heldout.json` | The held-out set: 40-50 more common words per language with native recordings, none in `words.json`. Never tune a cut-off on it.                                |
| `voice-refs.mjs`     | Writes `voice-refs.json`: the S11a voiced-example references for every corpus word, through the server's own pipeline. Needs Cloud TTS.                         |
| `refs.mjs`           | Refills `refs` in `words.json` from espeak-ng, tokenized with `utils/pronunciation/tokenizeIpa.ts`.                                                             |
| `fetch.mjs`          | Finds native-speaker recordings on Lingua Libre, downloads them from Commons and writes 16 kHz mono FLAC, `manifest.json` and `CREDITS.md`.                     |
| `controls.mjs`       | Writes the 20 synthetic silence and noise controls. Deterministic; rerunning it gives the same bytes.                                                           |
| `mutate.ts`          | The mutated-reference generator: one token of a native clip's reference changed to a high-load swap or a §4.2 group pair.                                       |
| `engine.ts`          | The gate's single import of the app's scoring code, so every module shares one instance.                                                                        |
| `gate.mjs`           | Decodes every clip once with the pinned model in Node, then judges it with `judgeSpeech` (likelihood scorer) under the presets, every mutation and other words. |
| `gate.config.json`   | The §8 pass marks. Never lower one without Paul's yes. `enforce` turns `true` only when both sets meet every mark.                                              |

Clips live in `tests/fixtures/pronunciation-corpus/` (`clips/<lang>/`, `controls/`, and `heldout/` for the held-out set), so CI never calls Wikimedia.

## Fetching the corpus

Wikimedia rate-limits the shared address cloud sessions use (HTTP 429 with a 600 s `Retry-After`). Three ways to fetch, in order of preference:

1. **From CI:** add the `fetch-corpus` label to the PR. The `Pronunciation Gate` workflow fetches both sets on a GitHub runner, commits them to the PR branch and removes the label.
2. **On a computer with Node 24 and ffmpeg on the PATH:** from the repo root, `node scripts/pronunciation-corpus/fetch.mjs` (add `--set heldout` for the held-out set), then commit `tests/fixtures/pronunciation-corpus/`.
3. **Re-create a committed corpus exactly:** `node scripts/pronunciation-corpus/fetch.mjs --from-manifest` downloads only the pinned files and checks each SHA-1.

The fetch sends a descriptive User-Agent, makes one request at a time at least 1.1 s apart, batches Commons metadata 50 titles per call, honours `Retry-After` and backs off on 429 and 503. It stops cleanly when asked to wait longer than `--max-wait` seconds (default 120); rerun it and it resumes from `manifest.json`. `--limit N` fetches a smoke subset.

## Running the gate

```
node scripts/pronunciation-corpus/gate.mjs                 # full run, writes docs/pronunciation-gate-results.md
node scripts/pronunciation-corpus/gate.mjs --smoke 5       # first 5 clips, never fails the build
```

It downloads the pinned model (241 MB) to `~/.cache/spartboard-pronunciation` on first use (`PRONUNCIATION_MODEL_PATH` overrides) and caches each clip's decode and raw logits there, keyed by the model and the decode code. Decoding mirrors the app's recognizer: `trimSilence`, then the model, with confidence and voiced time from `recognizerCore.ts` (S2), the log-softmax the Worker sends (S11c), and verdicts from `verdict.ts`. Each clip's references are its espeak ones plus the committed voice references. Browser-versus-Node decode agreement is checked by hand on `/pronunciation-dev`.

Both sets are judged the same way and reported separately. When enforced, the gate also fails if it could not measure something: voice references missing or for another model, a language under 100 tuning or 80 held-out clips, a missing clip file, or a check with nothing to count. CI uploads the results as an artifact and job summary; S11 commits the doc.

How each check is counted:

- **Natives pass:** the clip's clean references under the Beginner and Advanced presets give Exact or Accepted.
- **Mutations** use clips that pass Advanced clean, against the dialect that matched, and only positions that alignment heard exactly. A high-load swap counts as caught when Beginner says Not yet with an error at the changed position. A group pair is judged with only that group set to require (Not yet with the error at that position expected) and then to forgive (Accepted naming the group expected).
- **Another word accepted:** each clip that isn't unclear is judged under Beginner against five other words' full references; any Exact or Accepted counts. No pass mark is agreed yet (`wrongWordAcceptedMax`).
- **Controls** are judged against a short Spanish word and must all read as unclear.

## Refreshing voice references

```
gcloud auth application-default login
node scripts/pronunciation-corpus/voice-refs.mjs --project spartboard-dev
```

Run it after changing `config/pronunciationVoices.ts`, the model or a word list's espeak references, and commit `tests/fixtures/pronunciation-corpus/voice-refs.json`. It reuses stored readings for the same model and voice (`--fresh` redoes them). About 8 TTS calls per word.

## Refreshing references

```
npm i --prefix /tmp/espeak @echogarden/espeak-ng-emscripten@0.3.5
ESPEAK_NG_MODULE=/tmp/espeak/node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.js node scripts/pronunciation-corpus/refs.mjs [--set heldout]
```

espeak-ng is GPL-3.0 and is never added to the app's dependencies; it runs only here and on the server (S3).

## Native variants

```
gcloud auth application-default login
node scripts/pronunciation-corpus/variants.mjs
```

Each word in `words.json` and `variant-words.json` (about 330 more common words per language, never a corpus or held-out word) is spoken by every voice in `config/pronunciationVoices.ts` through Cloud TTS on `spartboard-dev`, decoded with the pinned model and aligned to its closest espeak reference. A swap or drop the voices make at least twice and in at least 5% of that sound's uses is written to `config/pronunciationVariants.ts` (`--min-count`, `--rate`). Group pairs, high-load swaps, tolerance pairs and tokens with tone digits or `.` are never learned, and the native clips are never used. Audio and decodes are cached in `~/.cache/spartboard-pronunciation/tts`; a cold run is about 9,000 TTS calls and three hours of decoding on four cores. The table is committed, so CI never calls TTS. Refresh `variant-words.json` references with `refs.mjs --words variant-words.json`.
