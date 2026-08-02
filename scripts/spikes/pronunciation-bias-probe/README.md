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
node bias-probe.mjs [--model gemini-3.5-flash-lite] [--runs 10]
```

The key is read from `GEMINI_API_KEY` or `VITE_GEMINI_API_KEY`, in the shell or
in the repo-root `.env.local`. The script prints which source it resolved (name
only, never the value) so a misconfiguration cannot be mistaken for a result.

Paste the output into the PR or into §4 of the doc. It is safe to share — no
key material, no user data.

### The model cannot be pinned, so runs are not comparable across time

`gemini-3.5-flash-lite` is a **moving alias**, and there is no way to pin it.
Checked directly against the API on 2026-08-02:

- `models.list` exposes exactly one matching identifier — `models/gemini-3.5-flash-lite`. No dated variant is offered.
- Requesting a dated form anyway fails: `gemini-3.5-flash-lite-07-2026` returns **404 not found for API version v1beta**.
- The response's own `modelVersion` field echoes the bare alias, so a run cannot capture which checkpoint actually answered it.

This is the same failure that already cost this spike one entire run — a stale
`gemini-2.5-flash` default produced a `NO RESULT` that was an artifact of the
model rather than of the audio. Pinning would be the obvious fix and it is
simply not available.

**What follows for [#2344](https://github.com/OPS-PIvers/SpartBoard/issues/2344)
and any later re-run:** re-run **every** condition in one sitting. Do not
compare fresh cells against numbers recorded here, and do not treat a changed
result as a finding about the audio — there is no way to assert the same
checkpoint produced both. Record the date with the results, since that is the
only version handle available.

## Why the .wav files are committed

They are the **stimulus of a controlled experiment**, not build output. The
whole design is "hold the audio constant, vary only the prompt" — so the bytes
have to be fixed, or a changed verdict can't be attributed to the model rather
than to the audio.

### The trill fixtures are human; the tap is still synthetic

| file                      | used by   | provenance                       | md5 (12)       |
| ------------------------- | --------- | -------------------------------- | -------------- |
| `perro_trill_human_3.wav` | **A**     | human, strongest of three trills | `0d8f91b136fe` |
| `perro_trill_human_1.wav` | —         | human, weakest trill             | `00335dd8dba3` |
| `perro_trill_human_2.wav` | —         | human, middle trill              | `cc884eb4bf87` |
| `pero_tap_human.wav`      | **B/C/D** | human, Spanish tap               | `9a42165305d0` |
| `pero_anglo_r_human.wav`  | **E**     | human, English retroflex ɹ       | `ab74e6ea281a` |
| `perro_tap.wav`           | retired   | espeak-ng 1.51 — see below       | `20edab1676c3` |

All active fixtures are **human, one speaker**, so every condition shares a
recording chain and a difference between conditions is attributable to the
phoneme rather than to the microphone.

`perro_tap.wav` is kept but unused. It is the one synthetic stimulus that human
audio corroborated — 40/40 synthetic against 20/20 human — and that agreement is
the only reason any synthetic audio in this spike retains credibility. Deleting
it would remove the evidence for that claim.

**A synthesized trill was a broken stimulus and had to be thrown out.** The
original `perro_trill.wav` (espeak-ng `-v es-419 -s 130`) drew tap reports from
models 36/40 — which read as "the model cannot hear trills" until the same model
scored 82/90 trills on the human recording. espeak's Spanish `/r/` is simply not
convincingly trilled. Do not reintroduce one.

The human clips are utterances 1–3 of a single continuous recording, one adult
speaker, trill strength increasing across them by the speaker's own account.
Condition A uses utterance 3 on that stated ground — not because it scored best
(it did not; utterance 2 did).

**Condition E is not optional.** The tap and the English retroflex are NOT
interchangeable stand-ins for "the untrilled error": the model reports the tap
honestly every time, but reports a trill for the retroflex ~15% of the time —
passing a student who did not trill. A probe testing only the tap reports a
clean pass and misses this, which is exactly what happened for this probe's
entire life until human audio arrived.

The old espeak note on regeneration fragility still applies to the tap clip: a
one-unit speed typo produces different audio, and dropping `-419` yields
**Castilian** rather than Latin American Spanish — a different dialect, which
per §5 of the doc changes what counts as a correct pronunciation. That failure
is silent: the script would run happily and return a verdict about the wrong
stimulus.

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
sudo apt-get install -y espeak-ng          # 1.51 produced the committed tap
espeak-ng -v es-419 -s 130 -w audio/perro_tap.wav   "pero"    # /pˈeɾo/  tapped
```

**Do not regenerate the trill this way** — see above; the synthetic trill is
what this spike had to discard. Human clips were cut from a single recording
with:

```
ffmpeg -i recording.MOV -map 0:1 -ac 1 -ar 22050 -c:a pcm_s16le full.wav
ffmpeg -i full.wav -ss <start> -t <dur> -c:a pcm_s16le audio/perro_trill_human_N.wav
```

`perro` vs `pero` is the minimal pair the probe turns on: the trill is the
correct Spanish rhotic, and the tap stands in for the L1-English learner error
of failing to trill it.

## Scope

This is spike code, not production code. It is committed so the D1 decision is
reproducible and auditable rather than resting on a screenshot in a PR comment.
Once D1 is settled and its result recorded in the doc, this directory can be
deleted — the doc is the durable artifact.
