#!/usr/bin/env node
/**
 * D1 SPIKE — Does an LLM phoneme transcriber bias toward the expected answer?
 *
 * THE QUESTION
 * A pronunciation scorer must report what the student ACTUALLY said. An LLM
 * that is told the target text knows what the word is supposed to sound like,
 * and may normalize toward it — silently erasing the exact errors we want to
 * catch. If so, server-side Gemini is disqualified as the acoustic layer and
 * the client-side CTC model in the spec is required.
 *
 * THE DESIGN (why this needs no phonetician)
 * We hold the AUDIO CONSTANT and vary only what we CLAIM the target was.
 * Ground truth is irrelevant: if the reported phonemes move when only the
 * prompt moves, that shift IS the bias. Same bytes in, different answer out.
 *
 *   Condition   Audio            Claimed target   Honest model reports
 *   ---------   --------------   --------------   --------------------
 *   A  control  trill (perro)    "perro"          r
 *   B  PROBE    tap   (pero)     "perro"          ɾ   <-- if it says r, biased
 *   C  control  tap   (pero)     "pero"           ɾ
 *   D  blind    tap   (pero)     (none given)     ɾ
 *
 * VERDICT: compare B against D. Same audio, one told to expect a trill and one
 * told nothing. If B reports /r/ while D reports /ɾ/, the model is answering
 * from the prompt rather than the waveform. That is disqualifying.
 *
 * Each condition runs N times (default 10) because a single sample cannot
 * distinguish bias from sampling noise. See BIAS_DELTA near the verdict for
 * how to read a result.
 *
 * USAGE
 *   node bias-probe.mjs [--model gemini-3.5-flash-lite] [--runs 10]
 *
 * The key is read from GEMINI_API_KEY or VITE_GEMINI_API_KEY, in the shell or
 * in the repo-root `.env.local`. The script prints which source it used (name
 * only, never the value).
 *
 * CAVEAT ON THE AUDIO
 * These clips are espeak-ng synthesis, not real learner speech. That makes
 * this a CONSERVATIVE test of bias: the tap/trill contrast here is clean and
 * unambiguous. A model that cannot report an unambiguous tap honestly will
 * certainly not do better on messy classroom recordings. A PASS here is
 * therefore necessary but NOT sufficient — follow up with real learner audio
 * before trusting the server-side path.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

// Keep this current. The first run of this probe used a stale default
// (gemini-2.5-flash) and produced a NO RESULT that was an artifact of the
// model, not of the audio or the design: that model does not transcribe the
// clips as Spanish unprompted, so the control condition held no measurement.
// A stale default here silently invalidates the whole experiment.
const MODEL = arg('--model', 'gemini-3.5-flash-lite');
// Default 10, not 5. At n=5 the verdict threshold below can fire on a 2/5 vs
// 4/5 split, which is a routine noise outcome (Fisher exact p ~= 0.5) — the
// run counts are printed alongside the verdict so the split stays inspectable.
const RUNS = Number(arg('--runs', '10'));

/**
 * Resolve the key from the shell first, then from `.env.local`.
 *
 * The `.env.local` read is not a nicety: it is this repo's documented way of
 * holding VITE_GEMINI_API_KEY (see CLAUDE.md), and Vite only injects those
 * into the browser bundle — a plain `node` process gets nothing. Without this
 * fallback, the developer most likely to run this script (one who already has
 * the app working locally) is the one for whom it silently fails.
 *
 * Deliberately minimal: KEY=VALUE lines, `export ` prefix and surrounding
 * quotes stripped, everything else ignored. Not a general dotenv parser.
 */
const readEnvLocal = () => {
  for (const p of [
    join(HERE, '../../../.env.local'), // repo root, from scripts/spikes/<name>/
    join(process.cwd(), '.env.local'),
  ]) {
    let raw;
    try {
      raw = readFileSync(p, 'utf8');
    } catch {
      continue; // absent is the normal case — keep looking
    }
    const found = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) found[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
    return found;
  }
  return {};
};

const fileEnv = readEnvLocal();
const SOURCES = [
  ['GEMINI_API_KEY (shell)', process.env.GEMINI_API_KEY],
  ['VITE_GEMINI_API_KEY (shell)', process.env.VITE_GEMINI_API_KEY],
  ['GEMINI_API_KEY (.env.local)', fileEnv.GEMINI_API_KEY],
  ['VITE_GEMINI_API_KEY (.env.local)', fileEnv.VITE_GEMINI_API_KEY],
];
const [KEY_SOURCE, API_KEY] = SOURCES.find(([, v]) => v) ?? [null, undefined];

if (!API_KEY) {
  console.error(
    'No API key found. Checked, in order:\n' +
      SOURCES.map(([name]) => `  - ${name}`).join('\n') +
      "\n\nSet one and re-run. If you set it in a hosted environment's settings,\n" +
      'use separate name and value fields — pasting "GEMINI_API_KEY=AIza..." into\n' +
      'the value field yields a key with the name baked into it.'
  );
  process.exit(1);
}

// Name only, never the value — this output belongs in PR comments.
console.log(`key source: ${KEY_SOURCE}\nmodel: ${MODEL}   runs: ${RUNS}\n`);

const audio = (name) =>
  readFileSync(join(HERE, 'audio', name)).toString('base64');

const TRILL = audio('perro_trill.wav'); // correct Spanish "perro" -> /pˈero/
const TAP = audio('perro_tap.wav'); // "pero" = the untrilled error -> /pˈeɾo/

/** Prompt mirrors how the real feature would call it: target text supplied. */
const promptFor = (target) =>
  target
    ? `A Spanish student was asked to say "${target}". Transcribe what they ACTUALLY said into IPA phonemes. Report the sounds you hear, not the sounds you expect. Return one phoneme per array element, no stress marks.`
    : `Transcribe this audio into IPA phonemes. Return one phoneme per array element, no stress marks.`;

const CONDITIONS = [
  { id: 'A', label: 'trill audio, told "perro"', wav: TRILL, target: 'perro' },
  { id: 'B', label: 'TAP audio,   told "perro"', wav: TAP, target: 'perro' },
  { id: 'C', label: 'TAP audio,   told "pero" ', wav: TAP, target: 'pero' },
  { id: 'D', label: 'TAP audio,   told nothing', wav: TAP, target: null },
];

const ai = new GoogleGenAI({ apiKey: API_KEY });

async function transcribe({ wav, target }) {
  const result = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptFor(target) },
          { inlineData: { mimeType: 'audio/wav', data: wav } },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          phonemes: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['phonemes'],
      },
      // Deliberately NOT temperature 0 — we want the model's natural
      // distribution, since production would run at default settings.
    },
  });
  const parsed = JSON.parse(result.text);
  // Fail loudly rather than returning []. An empty array would be tallied as
  // '?' — indistinguishable from "the model reported no rhotic" — whereas a
  // throw lands in the caller's catch and is tallied as 'ERR'. In a script
  // whose only output is a measurement, a non-answer must never be able to
  // look like an answer. (JSON.parse('null') returns null, which the previous
  // `parsed.phonemes ?? []` would have silently swallowed.)
  if (!parsed || !Array.isArray(parsed.phonemes)) {
    throw new Error(
      `Malformed response: expected {phonemes: string[]}, got ${JSON.stringify(parsed)?.slice(0, 60)}`
    );
  }
  return parsed.phonemes;
}

/**
 * Which rhotic did the model report? This is the entire measurement.
 *
 * Four outcomes, deliberately kept distinct rather than collapsed to
 * tap/not-tap, because they do not mean the same thing:
 *
 *   'ɾ'     alveolar tap    — the honest answer for the tap audio (B, C, D)
 *   'r'     alveolar trill  — the target-shaped answer; evidence of bias when
 *                             reported for tap audio
 *   'other' another rhotic  — chiefly the English retroflex ɹ (U+0279), which
 *                             is a DIFFERENT CODEPOINT from r (U+0072) and so
 *                             used to fall through to the catch-all. The model
 *                             heard a rhotic and got it wrong: not the tap, but
 *                             also not the target-shaped trill. Notably this is
 *                             the exact substitution in the spec's own worked
 *                             example (expected /r/, detected /ɹ/).
 *   'none'  no rhotic       — the model reported nothing in the rhotic slot.
 *                             That is a NON-OBSERVATION, not a negative one,
 *                             and is excluded from rates exactly as 'ERR' is.
 *
 * Collapsing 'other' and 'none' together (the previous '?') conflated a real
 * observation with a missing one, and the two must move in opposite directions:
 * 'other' belongs in the denominator, 'none' does not.
 */
const OTHER_RHOTICS = /[ɹɻʀʁɽɺ]/u; // approximants, uvulars, flaps — not the tap
const rhoticOf = (phonemes) => {
  const joined = phonemes.join('');
  if (joined.includes('ɾ')) return 'ɾ';
  if (joined.includes('r')) return 'r';
  if (OTHER_RHOTICS.test(joined)) return 'other';
  return 'none';
};

/** Slots that carry no observation of the rhotic, so cannot enter a rate. */
const NON_OBSERVATIONS = new Set(['ERR', 'none']);

const results = {};

// Warn BEFORE spending anything. The same caveat repeats at the verdict, but
// by then all 4 x RUNS calls are gone and the only thing left to decide is
// whether to distrust a result you already paid for.
if (RUNS < 10) {
  console.log(
    `! UNDER-POWERED RUN — about to spend ${4 * RUNS} API calls on a result\n` +
      `  that cannot separate bias from noise. At --runs ${RUNS}, the verdict\n` +
      `  threshold can fire on an ordinary sampling split. Ctrl-C now and\n` +
      `  re-run with --runs 10 (the default) unless you are just smoke-testing.\n`
  );
}

for (const cond of CONDITIONS) {
  const rhotics = [];
  const samples = [];
  for (let i = 0; i < RUNS; i++) {
    try {
      const ph = await transcribe(cond);
      rhotics.push(rhoticOf(ph));
      samples.push(ph.join(' '));
    } catch (err) {
      rhotics.push('ERR');
      samples.push(String(err?.message ?? err).slice(0, 80));
    }
  }
  results[cond.id] = { rhotics, samples };
  const tally = rhotics.reduce((a, r) => ((a[r] = (a[r] ?? 0) + 1), a), {});
  console.log(
    `${cond.id}  ${cond.label}  ->  ${JSON.stringify(tally)}\n     e.g. [${samples[0]}]`
  );
}

// ---- Verdict -------------------------------------------------------------
//
// BIAS_DELTA is a screening heuristic, NOT a significance test. 0.4 was chosen
// as "large enough that it is unlikely to be noise at n=10, small enough to
// catch partial bias" — it is a judgement call, not a derived value, and
// nothing downstream depends on the exact number.
//
// Calibration, so a cold reader can judge the verdict themselves:
//   - 9/10 vs 5/10 clears the threshold but is Fisher p ~= 0.14. Suggestive.
//   - 10/10 vs 2/10 is p < 0.01. Decisive.
// Treat a bare threshold pass as "investigate further", and only treat a
// lopsided split as settling D1. The raw counts print above the verdict
// precisely so this call does not have to be taken on trust.
const BIAS_DELTA = 0.4;

const tapCount = (id) => results[id].rhotics.filter((r) => r === 'ɾ').length;

// Rates are over SAMPLES THAT PRODUCED A MEASUREMENT, not over RUNS. An 'ERR'
// or 'none' slot contains no observation of the rhotic, so counting it in the
// denominator silently deflates that condition's rate and can suppress a true
// BIASED verdict: D with 5/5 taps and 5 errors reads as 0.5 instead of 1.0,
// which can pull (dTap - bTap) under the threshold on a model that is in fact
// fully biased. Non-observations must shrink confidence, never masquerade as
// negative observations.
//
// 'other' (a reported non-tap rhotic, e.g. ɹ) DOES belong here — the model made
// a real observation and it was not the tap. Only genuine absences are dropped.
const validCount = (id) =>
  results[id].rhotics.filter((r) => !NON_OBSERVATIONS.has(r)).length;

const tapRate = (id) => {
  const valid = validCount(id);
  return valid === 0 ? NaN : tapCount(id) / valid;
};

const bTap = tapRate('B'); // told to expect a trill
const dTap = tapRate('D'); // told nothing

const countOf = (id, kind) =>
  results[id].rhotics.filter((r) => r === kind).length;

const line = (id, label) => {
  const valid = validCount(id);
  const pct = valid === 0 ? 'n/a' : `${(tapRate(id) * 100).toFixed(0)}%`;
  // Name what was excluded and why. "3 excluded" invites the reader to assume
  // API trouble when the real cause may be the model reporting no rhotic —
  // a different problem with a different fix.
  const excluded = [
    ['API error', countOf(id, 'ERR')],
    ['no rhotic reported', countOf(id, 'none')],
  ]
    .filter(([, n]) => n > 0)
    .map(([what, n]) => `${n} ${what}${n > 1 ? 's' : ''}`)
    .join(', ');
  const other = countOf(id, 'other');
  const notes = [
    excluded && `excluded: ${excluded}`,
    other &&
      `${other} other rhotic${other > 1 ? 's' : ''} (counted, not a tap)`,
  ].filter(Boolean);
  return `${label} ${tapCount(id)}/${valid} (${pct})${notes.length ? `  [${notes.join('; ')}]` : ''}`;
};

console.log('\n--- VERDICT ---');
console.log(line('B', 'B (primed "perro") reported the true tap:'));
console.log(line('D', 'D (unprimed)       reported the true tap:'));

// A condition with no usable samples has no rate, so no comparison is possible.
if (Number.isNaN(bTap) || Number.isNaN(dTap)) {
  console.log(
    '\nNO RESULT. At least one condition produced zero usable samples — every\n' +
      'call errored. Fix the API errors above and re-run; there is nothing to\n' +
      'interpret here.'
  );
  process.exit(1);
}

// Errors shrink the effective sample size, so the power caveat has to key off
// the worst condition's valid count rather than the requested --runs.
const effectiveN = Math.min(validCount('B'), validCount('D'));
if (effectiveN < RUNS) {
  console.log(
    `\n! DEGRADED: ${effectiveN} usable samples in the smallest compared condition\n` +
      `  (of ${RUNS} requested). Rates above are over usable samples only.`
  );
}

if (effectiveN < 10) {
  console.log(
    `\n! UNDER-POWERED (${effectiveN} usable samples): the verdict below can fire\n` +
      `  on an ordinary sampling split. Re-run with --runs 10+ (and no API\n` +
      `  errors) before acting on it.`
  );
}

if (dTap - bTap >= BIAS_DELTA) {
  console.log(
    '\nBIASED. Priming the model with the target text measurably suppressed\n' +
      'the real error. Server-side Gemini is DISQUALIFIED as the acoustic layer.\n' +
      '=> Take the client-side CTC path in the spec.'
  );
} else if (bTap >= 0.8) {
  console.log(
    '\nNO BIAS DETECTED on this contrast. Gemini reported the true tap even when\n' +
      'primed to expect a trill. Server-side stays viable — but this is synthetic\n' +
      'audio and ONE contrast. Re-run with real learner recordings and add German\n' +
      'final-devoicing + Mandarin tone contrasts before committing.'
  );
} else {
  console.log(
    '\nINCONCLUSIVE / UNRELIABLE. Neither condition reported the tap consistently,\n' +
      'so the model is not a dependable phoneme transcriber here regardless of bias.\n' +
      '=> Treat this as a failure for the server-side path.'
  );
}
