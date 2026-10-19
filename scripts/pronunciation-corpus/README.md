# Speak corpus and gate

The native-speaker corpus and CI gate for Flashcards Speak (`docs/multilingual-pronunciation-engine.md` §8).

| File               | What it does                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `words.json`       | 60 words per language, chosen to cover every §4.2 sound group and stress position, with espeak-ng references per dialect.                   |
| `refs.mjs`         | Refills `refs` in `words.json` from espeak-ng, tokenized with `utils/pronunciation/tokenizeIpa.ts`.                                         |
| `fetch.mjs`        | Finds native-speaker recordings on Lingua Libre, downloads them from Commons and writes 16 kHz mono FLAC, `manifest.json` and `CREDITS.md`. |
| `controls.mjs`     | Writes the 20 synthetic silence and noise controls. Deterministic; rerunning it gives the same bytes.                                       |
| `mutate.ts`        | The mutated-reference generator: one token of a native clip's reference changed to a high-load swap or a §4.2 group pair.                   |
| `gate.mjs`         | Decodes every clip once with the pinned model in Node, then judges it with `judgeSpeech` under the presets and every mutation.              |
| `gate.config.json` | The §8 pass marks. Never lower one without Paul's yes. `enforce` stays `false` until S11's calibration run.                                 |

Clips live in `tests/fixtures/pronunciation-corpus/` (`clips/<lang>/`, `controls/`), so CI and S11 never call Wikimedia.

## Fetching the corpus

Wikimedia rate-limits the shared address cloud sessions use (HTTP 429 with a 600 s `Retry-After`). Three ways to fetch, in order of preference:

1. **From CI:** add the `fetch-corpus` label to the PR. The `Pronunciation Gate` workflow fetches the clips on a GitHub runner, commits them to the PR branch and removes the label.
2. **On a computer with Node 24 and ffmpeg on the PATH:** from the repo root, `node scripts/pronunciation-corpus/fetch.mjs`, then commit `tests/fixtures/pronunciation-corpus/`.
3. **Re-create a committed corpus exactly:** `node scripts/pronunciation-corpus/fetch.mjs --from-manifest` downloads only the pinned files and checks each SHA-1.

The fetch sends a descriptive User-Agent, makes one request at a time at least 1.1 s apart, batches Commons metadata 50 titles per call, honours `Retry-After` and backs off on 429 and 503. It stops cleanly when asked to wait longer than `--max-wait` seconds (default 120); rerun it and it resumes from `manifest.json`. `--limit N` fetches a smoke subset.

## Running the gate

```
node scripts/pronunciation-corpus/gate.mjs                 # full run, writes docs/pronunciation-gate-results.md
node scripts/pronunciation-corpus/gate.mjs --smoke 5       # first 5 clips, never fails the build
```

It downloads the pinned model (241 MB) to `~/.cache/spartboard-pronunciation` on first use (`PRONUNCIATION_MODEL_PATH` overrides) and caches each clip's decode there, keyed by the model and the decode code. Until `utils/pronunciation/verdict.ts` (S1) is on the branch it reports decode output only. Browser-versus-Node decode agreement is checked by hand on `/pronunciation-dev`.

When enforced, the gate also fails if it could not measure something: a missing `verdict.ts`, a language under 100 clips, a missing clip file, or a check with nothing to count. CI uploads the results as an artifact and job summary; S11 commits the doc.

How each check is counted:

- **Natives pass:** the clip's clean references under the Beginner and Advanced presets give Exact or Accepted.
- **Mutations** use clips that pass Advanced clean, against the dialect that matched, and only positions that alignment heard exactly. A high-load swap counts as caught when Beginner says Not yet with an error at the changed position. A group pair is judged with only that group set to require (Not yet with the error at that position expected) and then to forgive (Accepted naming the group expected).
- **Controls** are judged against a short Spanish word and must all read as unclear.

## Refreshing references

```
npm i --prefix /tmp/espeak @echogarden/espeak-ng-emscripten@0.3.5
ESPEAK_NG_MODULE=/tmp/espeak/node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.js node scripts/pronunciation-corpus/refs.mjs
```

espeak-ng is GPL-3.0 and is never added to the app's dependencies; it runs only here and on the server (S3).
