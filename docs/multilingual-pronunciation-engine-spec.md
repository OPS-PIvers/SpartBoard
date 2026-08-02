# Multilingual Pronunciation Engine — Source Specification

**Status:** Source material — captured verbatim, not yet accepted
**Author:** ops-pivers (original spec) — transcribed by Claude
**Companion to:** [`multilingual-pronunciation-engine.md`](./multilingual-pronunciation-engine.md)
**Live plan:** [Wayfinder Map: Multilingual Pronunciation Engine](https://github.com/OPS-PIvers/SpartBoard/issues/2331)
— where the open decisions about this spec are tracked and resolved.

This document preserves the original technical specification as authored, so
the decision map beside it has something concrete to refer to. It is **source
material, not an accepted design** — several parts are contradicted by findings
recorded in the companion doc, and those contradictions are flagged inline
rather than silently corrected.

> **Where this spec is already known to be wrong**, see the companion doc:
>
> - §2.1 English G2P (CMUDict + neural fallback) — likely unnecessary; a
>   rule-based engine reproduced both cited examples.
> - §2.2 client-side inference — unresolved (decision D1), and the reason the
>   whole design is still blocked.
> - `languageCode` as a flat 2-letter code — insufficient; dialect changes the
>   correct answer (`es` vs `es-419`).
> - Mandarin as a peer of es/de/en — it is a materially harder, separate
>   problem.

---

## 1. Product framing (why the quiz widget)

The engine is intended to land **inside the existing quiz widget** rather than
as a standalone widget, because the quiz already carries the integration
surface this feature would otherwise have to rebuild: Schoology and Google
Classroom assignment + grade push, roster targeting, PLC sharing, and the
assignment archive.

It is a **highly content-specific** feature — relevant to language and EL
teachers, not to the general staff population — so it must be gateable to a
named set of users rather than shipped to everyone with quiz access.

_(This framing is the author's stated rationale. The mechanism for the gating
requirement is resolved in the companion doc, decision D3.)_

---

## 2. System architecture & data flow

A modular, client-side evaluation component designed to plug into existing web
applications. It accepts target text, a target language code, a match
strictness setting, and a raw audio recording, and returns a sound-by-sound
phonetic breakdown and an overall accuracy score.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HOST FIREBASE WEB APP                           │
│  Inputs: Target Text, Language Code ('en'|'es'|'de'|'zh'), Strictness   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               PRONUNCIATION ENGINE (Client-Side Pipeline)              │
│                                                                        │
│   1. G2P Layer       ──> Converts Target Text to Expected IPA Array     │
│   2. Acoustic Model  ──> Converts Audio Recording to Spoken IPA Array   │
│   3. Sequence Engine ──> Performs Levenshtein Alignment & Backtrace     │
│   4. Scoring Engine  ──> Calculates PER, Accuracy %, and Pass/Fail      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           EVALUATION OUTPUT                            │
│  - Accuracy Score (0-100%) & Pass/Fail Boolean                          │
│  - Annotated Phoneme Payload (Target, Heard, Status, Position)          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component breakdown

### 3.1 Grapheme-to-Phoneme (G2P) translation layer

Converts standard orthography into IPA phonemes based on the target language
code.

- **Spanish (`es`)** — Deterministic, rule-based parser handling digraphs
  (`rr`, `ch`, `ll`, `qu`), silent `h`, soft/hard `c`/`g`, and tap /ɾ/ vs.
  trilled /r/.
- **German (`de`)** — Rule-based parser mapping umlauts (`ä`, `ö`, `ü`),
  diphthongs (`ei`, `eu`, `au`), digraphs/trigraphs (`ch`, `sch`, `sp`, `st`),
  and word-final consonant devoicing (e.g. "Tag" → /taːk/).
- **English (`en`, EL/ELL)** — Dictionary lookup (e.g. CMUDict mapped to IPA)
  paired with a fallback neural G2P parser to resolve non-phonemic spelling
  (e.g. "rough" → /ɹʌf/ vs. "through" → /θɹuː/).
  > **Contradicted.** A rule-based engine produced both of these correctly with
  > no dictionary and no neural fallback. See companion doc §5.
- **Mandarin Chinese (`zh`)** — Two-stage parser converting Hanzi characters or
  Pinyin into initial consonants, final vowels, and tone contours represented
  as numbered pitch values (1–5).
  - "mā" → /m/ /a⁵⁵/ (high level tone) vs. "mǎ" → /m/ /a²¹⁴/ (dipping tone).
    > **Flagged.** Tone contour is a pitch-tracking problem, not a phoneme-
    > inventory problem — a second acoustic task, not a fourth language.

### 3.2 Client-side acoustic recognition layer

Processes the recorded audio stream directly in the browser without server
round-trips, using WebAssembly (WASM) or WebGPU via libraries like Hugging Face
`transformers.js`.

- **Model architecture** — quantized multilingual CTC phoneme recognition model
  (e.g. `wav2vec2-xlsr-53-phoneme` or `mhubert-base-g2p`).
- **Execution** — single-pass Connectionist Temporal Classification (CTC)
  pipeline. Rather than predicting text tokens or words, the model outputs raw
  IPA phoneme probabilities frame-by-frame.
- **Performance** — loads once into local browser cache (~80MB–150MB
  quantized). Inference completes in under 500ms for short audio clips on
  standard laptop/tablet hardware.

> **This is decision D1 and it is unresolved.** The rationale for a CTC model
> over an LLM is that a CTC model is a _dumb_ listener — it has no notion of
> the expected answer and therefore cannot bias toward it. See companion doc §4.

### 3.3 Phonetic alignment & sequence matcher

Calculates structural divergence between expected and recognized phonemes using
dynamic programming sequence alignment.

- **Matrix construction** — two-dimensional Levenshtein distance matrix
  comparing expected IPA tokens `T = [t₁ … tₙ]` against spoken IPA tokens
  `S = [s₁ … sₘ]`.
- **Cost weights** — exact match 0; substitution (mispronunciation) 1; deletion
  (omission/silence) 1; insertion (extra sound) 1.
- **Backtrace mapping** — traverses the matrix backward from `(n, m)` to
  `(0, 0)` to generate an explicit element-by-element mapping array.

---

## 4. Reference implementation — alignment & scoring engine

Preserved as authored. This is the portion of the spec that is **safe to build
before D1 resolves** (companion doc §9): a pure function with zero
dependencies, identical whether phonemes arrive from a CTC model or an API.

```js
/**
 * Standalone Client-Side Alignment & Scoring Engine
 */
class PhonemeAlignmentEngine {
  static THRESHOLDS = {
    Loose: 60,
    Close: 80,
    Exact: 95,
  };

  /**
   * Aligns expected vs spoken phonemes and returns structured evaluation metrics.
   * @param {string[]} targetPhonemes - Array of target IPA phoneme strings.
   * @param {string[]} spokenPhonemes - Array of recognized IPA phoneme strings.
   * @param {string} matchLevel - Strictness profile ('Loose' | 'Close' | 'Exact').
   * @returns {Object} Evaluation output payload.
   */
  static evaluate(targetPhonemes, spokenPhonemes, matchLevel = 'Close') {
    const n = targetPhonemes.length;
    const m = spokenPhonemes.length;

    // 1. Build Levenshtein Distance Matrix
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (targetPhonemes[i - 1] === spokenPhonemes[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1]; // Match
        } else {
          dp[i][j] =
            1 +
            Math.min(
              dp[i - 1][j - 1], // Substitution
              dp[i - 1][j], // Deletion / Omission
              dp[i][j - 1] // Insertion
            );
        }
      }
    }

    // 2. Backtrace Path to Identify Diagnostic Errors
    let i = n;
    let j = m;
    const alignment = [];
    let substitutions = 0;
    let omissions = 0;
    let insertions = 0;
    let correct = 0;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && targetPhonemes[i - 1] === spokenPhonemes[j - 1]) {
        alignment.unshift({
          position: i,
          targetIPA: targetPhonemes[i - 1],
          spokenIPA: spokenPhonemes[j - 1],
          status: 'correct',
        });
        correct++;
        i--;
        j--;
      } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
        alignment.unshift({
          position: i,
          targetIPA: targetPhonemes[i - 1],
          spokenIPA: spokenPhonemes[j - 1],
          status: 'substituted',
          diagnostic: `Expected /${targetPhonemes[i - 1]}/, detected /${spokenPhonemes[j - 1]}/`,
        });
        substitutions++;
        i--;
        j--;
      } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
        alignment.unshift({
          position: i,
          targetIPA: targetPhonemes[i - 1],
          spokenIPA: '—',
          status: 'omitted',
          diagnostic: `Phoneme /${targetPhonemes[i - 1]}/ was omitted`,
        });
        omissions++;
        i--;
      } else {
        // Insertion (extra sound uttered by student)
        insertions++;
        j--;
      }
    }

    // 3. Compute Metrics and Accuracy Percentage
    const totalEdits = substitutions + omissions + insertions;
    const per = n > 0 ? totalEdits / n : 0;
    const rawScore = Math.max(0, Math.round((1 - per) * 100));

    const requiredScore = this.THRESHOLDS[matchLevel] || 80;
    const passed = rawScore >= requiredScore;

    return {
      score: rawScore,
      passed: passed,
      matchLevel: matchLevel,
      metrics: {
        targetPhonemeCount: n,
        correctCount: correct,
        substitutionCount: substitutions,
        omissionCount: omissions,
        insertionCount: insertions,
        per: Number(per.toFixed(3)),
      },
      alignment: alignment,
    };
  }
}
```

### Review notes on the reference implementation

Recorded during transcription; **not yet verified by tests.** Resolve these
when this becomes real code (companion doc §9.1):

1. **Insertions are counted but not represented in `alignment[]`.** The final
   `else` branch increments `insertions` and decrements `j` without pushing an
   entry. A student who inserts an extra sound sees no badge for it, so the UI
   in §7 cannot render insertions at all.
2. **PER is normalized by `n` only.** With enough insertions, `totalEdits` can
   exceed `n`, making `per > 1`. `Math.max(0, …)` clamps the score at 0, so
   this is not a crash — but PER is then no longer a rate in [0, 1], which
   matters if it is ever surfaced to teachers.
3. **`THRESHOLDS[matchLevel] || 80`** silently falls back to Close on a typo'd
   `matchLevel`. Prefer an explicit validation error.
4. **Backtrace tie-breaking is order-dependent.** The `else if` chain prefers
   substitution over deletion when both are optimal, which is a defensible but
   arbitrary choice; it should be a documented decision, since it changes which
   diagnostic the student sees.

---

## 5. Scoring math & thresholds

### 5.1 Formulas

The original spec included formula images that did not survive transcription.
Both are recoverable from the reference implementation above and are stated
here as **derived from the code**, not quoted from the original:

```
PER      = (substitutions + omissions + insertions) / N
Accuracy = max(0, round((1 - PER) × 100))
```

where `N` is the total count of expected target phonemes.

### 5.2 Match threshold profiles

| Profile   | Accuracy threshold | Max error margin (PER) | Target use case & behavior                                                                                                                                 |
| --------- | ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Loose** | ≥ 60%              | ≤ 40%                  | _Intelligibility focus._ Accepts heavy non-native accents, unrolled consonants, and minor vowel distortions as long as core phonetic structure is present. |
| **Close** | ≥ 80%              | ≤ 20%                  | _Standard classroom practice._ Penalizes incorrect vowels, dropped syllables, missing Mandarin tones, or substituted consonants.                           |
| **Exact** | ≥ 95%              | ≤ 5%                   | _Native-level precision._ Requires precise articulation of target IPA sounds (e.g. English /θ/ vs /f/, or German /ç/ vs /k/).                              |

> **Open question for D6.** These thresholds are the author's proposal and are
> unvalidated against real learner audio. Note that "Loose" accepting "unrolled
> consonants" directly interacts with the dialect finding in the companion doc:
> a scorer must not penalize a regionally correct pronunciation at _any_
> strictness level, which is a different concern from leniency.

---

## 6. Input & output schemas

### 6.1 Engine input payload

```json
{
  "targetText": "El perro",
  "languageCode": "es",
  "matchLevel": "Close",
  "audioBlob": "data:audio/wav;base64,UklGRi..."
}
```

> **`languageCode` is insufficient** — it must carry dialect (`es-419` vs `es`).
> See companion doc §5.

### 6.2 Engine evaluation output payload

```json
{
  "score": 75,
  "passed": false,
  "matchLevel": "Close",
  "metrics": {
    "targetPhonemeCount": 6,
    "correctCount": 5,
    "substitutionCount": 1,
    "omissionCount": 0,
    "insertionCount": 0,
    "per": 0.166
  },
  "alignment": [
    { "position": 1, "targetIPA": "e", "spokenIPA": "e", "status": "correct" },
    { "position": 2, "targetIPA": "l", "spokenIPA": "l", "status": "correct" },
    { "position": 3, "targetIPA": "p", "spokenIPA": "p", "status": "correct" },
    { "position": 4, "targetIPA": "e", "spokenIPA": "e", "status": "correct" },
    {
      "position": 5,
      "targetIPA": "r",
      "spokenIPA": "ɹ",
      "status": "substituted",
      "diagnostic": "Expected trilled /r/, detected English retroflex /ɹ/"
    },
    { "position": 6, "targetIPA": "o", "spokenIPA": "o", "status": "correct" }
  ]
}
```

This `El perro` example is the canonical test case — it is exactly the
tap/trill contrast the D1 spike probes, and should become the first unit test
of the alignment engine.

> **Note:** the `diagnostic` string here ("Expected trilled /r/, detected
> English retroflex /ɹ/") is richer than what the reference implementation
> generates (`Expected /r/, detected /ɹ/`). Human-readable phoneme names are an
> additional lookup table the code does not yet have.

---

## 7. Visual UI annotation component

The engine renders a zero-dependency DOM element, or returns an array for
native web component binding:

- **Green badge** (`status: "correct"`) — target phoneme with a solid green
  border and checkmark background.
- **Red badge** (`status: "substituted"`) — red border, showing the expected
  sound above and the incorrectly spoken sound beneath (e.g. Expected /r/,
  Heard /ɹ/).
- **Yellow/orange badge** (`status: "omitted"`) — dashed orange border labeled
  "Silent" or "Skipped".

> **Integration notes.** Two adjustments are required for SpartBoard:
>
> 1. Colour alone cannot carry the correct/substituted/omitted distinction —
>    the project's accessibility baseline is WCAG AA. The badges already differ
>    in border style and label, which is most of the fix; make that explicit.
> 2. "Zero-dependency DOM element" conflicts with the widget architecture.
>    Return the `alignment[]` array and render it as a React component using
>    container-query units per the widget scaling rules in `CLAUDE.md`.
> 3. There is no badge for insertions, because the reference implementation
>    does not emit them (see §4 review note 1).
