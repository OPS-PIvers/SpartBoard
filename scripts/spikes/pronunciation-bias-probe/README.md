# D1 bias probe

Answers one question blocking the multilingual pronunciation engine: **does an
LLM told the target text report the phonemes it actually heard, or the ones it
expects?** If it biases toward the target, it silently erases the exact errors
a pronunciation scorer exists to catch, and the server-side path is
disqualified.

See [`docs/multilingual-pronunciation-engine.md`](../../../docs/multilingual-pronunciation-engine.md)
§4 for the decision this feeds, and the design rationale in the script header.

## Running it

```
node bias-probe.mjs [--model gemini-2.5-flash] [--runs 10]
```

The key is read from `GEMINI_API_KEY` or `VITE_GEMINI_API_KEY`, in the shell or
in the repo-root `.env.local`. The script prints which source it resolved (name
only, never the value) so a misconfiguration cannot be mistaken for a result.

Paste the output into the PR or into §4 of the doc. It is safe to share — no
key material, no user data.

## Why the .wav files are committed

They are the **stimulus of a controlled experiment**, not build output. The
whole design is "hold the audio constant, vary only the prompt" — so the bytes
have to be fixed, or a changed verdict can't be attributed to the model rather
than to the audio.

Regeneration is not byte-stable against small mistakes. On espeak-ng 1.51, the
documented commands reproduce the committed files exactly, but:

| command                        | md5 (12)       | size    |
| ------------------------------ | -------------- | ------- |
| `-v es-419 -s 130` (committed) | `20edab1676c3` | 41772 B |
| `-v es-419 -s 131`             | `ff4521508724` | 40926 B |
| `-v es -s 130`                 | `eaceaaa1650a` | 38556 B |

A one-unit speed typo produces different audio. Worse, dropping `-419` yields
**Castilian** rather than Latin American Spanish — a different dialect, which
per §5 of the doc changes what counts as a correct pronunciation. That failure
is silent: the script would run happily and return a verdict about the wrong
stimulus. Cross-version drift in espeak-ng itself is an additional unknown.

Committing the bytes removes that whole class of error, and removes espeak-ng
(plus root access to install it) from the requirements for anyone re-running
the probe. The cost is 92 KB against a 13 MB `.git` — about 0.7%, written once
and never modified. Git LFS would be heavier than the problem: the repo has no
`.gitattributes` and no LFS in use, so it would add a clone-time dependency for
every contributor to save 92 KB.

## Regenerating anyway

If the fixtures ever need to change — a new contrast, a different language —
regenerate deliberately and commit the new bytes rather than leaving them to be
produced at run time:

```
sudo apt-get install -y espeak-ng          # 1.51 produced the committed files
espeak-ng -v es-419 -s 130 -w audio/perro_trill.wav "perro"   # /pˈero/  trilled
espeak-ng -v es-419 -s 130 -w audio/perro_tap.wav   "pero"    # /pˈeɾo/  tapped
```

`perro` vs `pero` is the minimal pair the probe turns on: the trill is the
correct Spanish rhotic, and the tap stands in for the L1-English learner error
of failing to trill it.

## Scope

This is spike code, not production code. It is committed so the D1 decision is
reproducible and auditable rather than resting on a screenshot in a PR comment.
Once D1 is settled and its result recorded in the doc, this directory can be
deleted — the doc is the durable artifact.
