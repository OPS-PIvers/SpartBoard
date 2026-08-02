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
 *   E  FALSE-PASS  Anglo ɹ       "perro"          ɹ   <-- if it says r, it
 *                                                        passed a student who
 *                                                        did not trill
 *
 * VERDICT: compare B against D. Same audio, one told to expect a trill and one
 * told nothing. If B reports /r/ while D reports /ɾ/, the model is answering
 * from the prompt rather than the waveform. That is disqualifying.
 *
 * TWO MORE CHECKS, both added after the bias verdict alone proved misleading:
 *   - DISCRIMINATION (A vs B): does the report follow the AUDIO? A model that
 *     ignores the audio passes the bias test trivially, because an output that
 *     never moves cannot be moved by priming.
 *   - FALSE PASS (E): the tap is not a sufficient stand-in for "the untrilled
 *     error". The model reports the tap honestly every time but reports a trill
 *     for the English retroflex ~15% of the time. Only E catches that.
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
 * Every active clip is a HUMAN recording from one speaker, so all conditions
 * share a recording chain and a difference between them is attributable to the
 * phoneme rather than the microphone. They started out synthetic, and the
 * synthetic trill was a BROKEN stimulus: models reported a tap in it 36/40,
 * which read as "this model cannot hear trills" until the same model scored
 * 82/90 trills on the human recording. Do not reintroduce synthesized rhotics.
 *
 * Still not real LEARNER speech: a speaker deliberately producing an error is
 * not a student failing to avoid one, and is likelier to be a clean exemplar
 * than the unstable in-between articulation a struggling learner produces. A
 * PASS remains necessary but NOT sufficient — follow up with actual learner
 * recordings, and with German final-devoicing, before trusting the server-side
 * path.
 *
 * KNOWN LIMIT OF THE OUTPUT, not of the model's hearing: once the prompt names
 * Spanish, the model reports within Spanish phonology and the English retroflex
 * becomes invisible — 0/40 samples, versus 4/10 under a prompt naming no
 * language at all. Scoring outcomes mostly survive (ɾ still != r, so the student
 * is still marked wrong) but DIAGNOSTIC feedback does not: it will say "you
 * produced a tap" to a student who produced an English r.
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

// HUMAN recording, utterance 3 of 3 (the speaker's strongest trill — chosen on
// that stated ground, not by which clip scored best). It REPLACED an espeak-ng
// synthetic trill, which turned out to be a broken stimulus: models reported a
// tap in it 36/40, which read as "the model can't hear trills" until the same
// models scored 82/90 trills on this recording. Do not reintroduce a synthesized
// trill — espeak's Spanish /r/ is not convincingly trilled.
const TRILL = audio('perro_trill_human_3.wav'); // "perro" -> /pˈero/, trilled
// Human too, same speaker — so A vs B is now a clean discrimination test:
// same recording chain, one phoneme different. The espeak tap it replaced is
// kept in audio/ but no longer used; human and synthetic agreed on it (40/40
// vs 30/30), which is the only reason to still trust any synthetic stimulus
// here at all.
const TAP = audio('pero_tap_human.wav'); // "pero" tapped -> /pˈeɾo/
// The English retroflex ɹ — the actual L1-English learner error in a US
// classroom, and the substitution in the spec's own worked example (expected
// /r/, detected /ɹ/). Worth its own condition because the tap and the Anglo r
// are NOT interchangeable stand-ins: the model reports the tap honestly but
// reports /r/ for this clip some of the time, which is a false pass.
const ANGLO = audio('pero_anglo_r_human.wav'); // "pero" with English r -> /pˈeɹo/

/** Prompt mirrors how the real feature would call it: target text supplied. */
const promptFor = (target) =>
  target
    ? `A Spanish student was asked to say "${target}". Transcribe what they ACTUALLY said into IPA phonemes. Report the sounds you hear, not the sounds you expect. Return one phoneme per array element, no stress marks.`
    : `Transcribe this audio into IPA phonemes. Return one phoneme per array element, no stress marks.`;

const CONDITIONS = [
  { id: 'A', label: 'TRILL audio, told "perro"', wav: TRILL, target: 'perro' },
  { id: 'B', label: 'tap audio,   told "perro"', wav: TAP, target: 'perro' },
  { id: 'C', label: 'tap audio,   told "pero" ', wav: TAP, target: 'pero' },
  { id: 'D', label: 'tap audio,   told nothing', wav: TAP, target: null },
  { id: 'E', label: 'ANGLO-r aud, told "perro"', wav: ANGLO, target: 'perro' },
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
// by then all CONDITIONS.length x RUNS calls are gone and the only thing left
// to decide is whether to distrust a result you already paid for.
//
// Derive the count from CONDITIONS rather than hardcoding it. This said 4 when
// there were four conditions and silently under-quoted by 20% the moment E was
// added — in the one message whose entire job is letting you abort before
// spending.
if (RUNS < 10) {
  console.log(
    `! UNDER-POWERED RUN — about to spend ${CONDITIONS.length * RUNS} API calls on a result\n` +
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
  // Name the actual cause rather than asserting one. A collapse made of 'none'
  // is a stimulus/prompt problem; a collapse made of 'ERR' is a wiring problem.
  // They have different fixes, and this message previously claimed "every call
  // errored" unconditionally — which sent the reader to debug API errors that
  // had not occurred. Same reasoning as the exclusion breakdown in line().
  // ['B','D'] is hardcoded on purpose, and deliberately NOT derived from
  // CONDITIONS the way the pre-spend estimate above is. That estimate counts
  // every condition because every condition costs API calls; this list is the
  // two conditions the BIAS VERDICT is computed from, which is a fixed property
  // of the experiment's design rather than of the CONDITIONS array. A/C/E can
  // collapse without making the bias verdict uncomputable — they have their own
  // guards further down — so widening this to CONDITIONS would abort runs that
  // still had an answer to give.
  const dead = ['B', 'D'].filter((id) => validCount(id) === 0);
  const errs = dead.reduce((n, id) => n + countOf(id, 'ERR'), 0);
  const nones = dead.reduce((n, id) => n + countOf(id, 'none'), 0);
  console.log(
    `\nNO RESULT. Condition${dead.length > 1 ? 's' : ''} ${dead.join(' and ')} produced zero usable samples.\n` +
      `Breakdown: ${errs} API error${errs === 1 ? '' : 's'}, ${nones} with no rhotic reported.`
  );
  // Only name a single cause when the other count is genuinely zero. Keying off
  // whichever is LARGER would assert one cause on a mixed collapse — and on an
  // exact tie would assert the API-error remedy while half the failures were
  // 'none', which is the same "confidently wrong cause" this block exists to
  // stop.
  const stimulus =
    'Calls returned a transcription with no rhotic in it at all. That is a\n' +
    'stimulus or prompt problem, not an API problem — look at what the model\n' +
    'actually transcribed before touching the API wiring.';
  console.log(
    nones === 0
      ? 'Fix the API errors above and re-run.'
      : errs === 0
        ? stimulus
        : `Both causes are in play and they have different fixes.\n${stimulus}\n` +
          'Then fix the API errors above. Addressing only one will not restore\n' +
          'the condition.'
  );
  console.log('There is nothing to interpret here.');
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
      'primed to expect a trill. Necessary, not sufficient: see the two checks\n' +
      'below, and note no clip here is real LEARNER speech. German\n' +
      'final-devoicing is still untested.'
  );
} else {
  console.log(
    '\nINCONCLUSIVE / UNRELIABLE. Neither condition reported the tap consistently,\n' +
      'so the model is not a dependable phoneme transcriber here regardless of bias.\n' +
      '=> Treat this as a failure for the server-side path.'
  );
}

// ---- Check 2: discrimination (A vs B) ------------------------------------
//
// The bias verdict above can be passed by a model that IGNORES the audio: an
// output that never moves cannot be moved by priming. This is the comparison
// that catches that — same prompt, different audio. It exists because an
// earlier run passed the bias test while reporting a tap for BOTH clips, and
// only a human recording revealed the stimulus was at fault rather than the
// model. Do not read the bias verdict without reading this one.
const trillCount = (id) => results[id].rhotics.filter((r) => r === 'r').length;
const aTrill = trillCount('A');
const bTrill = trillCount('B');
// Minimum gap between A's and B's trill rates to call the model discriminating.
// Like BIAS_DELTA, a screening heuristic and not a significance test. 0.5 was
// picked by judgement when this check was added, with no derivation behind it.
//
// Calibration, computed after the fact so a cold reader can judge a bare pass
// (two-tailed Fisher exact, n=10 per condition, splits that exactly clear 0.5):
//   - 10/10 vs 5/10  p ~= 0.033
//   -  9/10 vs 4/10  p ~= 0.057
//   -  8/10 vs 3/10  p ~= 0.070   <- weakest qualifying splits sit mid-range
//   -  7/10 vs 2/10  p ~= 0.070
//   -  5/10 vs  0/10 p ~= 0.033
// So a bare pass here lands around p ~= 0.03-0.07 — meaningfully stronger than
// a bare BIAS_DELTA pass (p ~= 0.14), still short of decisive. Treat it as
// "probably real, worth confirming", not as settled.
//
// Nothing on record depends on the exact cutoff: the recorded run cleared it by
// a wide margin (24/30 vs 0/30, gap 0.80, p ~= 3e-11). Raw counts print above
// the verdict so this call never has to be taken on trust.
const DISCRIMINATION_DELTA = 0.5;
console.log('\n--- DISCRIMINATION (does the report follow the audio?) ---');
console.log(`A (trill audio) reported a trill: ${aTrill}/${validCount('A')}`);
console.log(`B (tap audio)   reported a trill: ${bTrill}/${validCount('B')}`);
if (validCount('A') === 0 || validCount('B') === 0) {
  console.log('No usable samples in one condition — no comparison possible.');
} else if (
  aTrill / validCount('A') - bTrill / validCount('B') >=
  DISCRIMINATION_DELTA
) {
  console.log(
    'DISCRIMINATES. The reported rhotic tracks the waveform, so the bias pass\n' +
      'above is a real observation rather than a constant output.'
  );
} else {
  console.log(
    'DOES NOT DISCRIMINATE. The model reports much the same thing for both\n' +
      'clips, so the bias verdict above is UNINTERPRETABLE — a model ignoring\n' +
      'the audio passes it too. Before blaming the model, verify the stimulus:\n' +
      'a synthesized trill already produced exactly this false alarm once.'
  );
}

// ---- Check 3: the false pass (E) -----------------------------------------
//
// The costliest classroom error: a student produces an English retroflex
// instead of a trill and is told they got it right. Reporting /r/ here means
// the model supplied the target it was told to expect on audio that does not
// contain it. Kept separate from the bias verdict because the tap and the
// Anglo r are not interchangeable — the model handles them differently.
const eTrill = trillCount('E');
const eValid = validCount('E');
// False-pass rate above which the run prints a warning. Picked by judgement
// when this check was added, with no derivation — and deliberately left that
// way, because unlike the two deltas this is not a comparison between
// conditions, so there is no two-sample test to calibrate it against. What
// counts as an intolerable rate of passing a student who did not trill is a
// pedagogical judgement, not a statistical one; 0.1 is a placeholder for a
// teacher's answer, not a substitute for it.
//
// It is a WARN line, not a verdict — the rate prints either way, so a reader
// who disagrees with the cutoff still sees the number.
const FALSE_PASS_WARN_RATE = 0.1;
console.log(
  '\n--- FALSE PASS (Anglo-r audio, told the target was "perro") ---'
);
// Mirror the DISCRIMINATION block: say "no samples" rather than printing 0/0,
// which reads as a measured zero-rate false pass — the most reassuring possible
// result — when in fact nothing was measured at all.
if (eValid === 0) {
  console.log(
    'No usable samples in E — no false-pass rate can be computed. This is not\n' +
      'a clean bill of health; the costliest error is simply untested here.'
  );
} else {
  console.log(`E reported a trill (a WRONG pass):       ${eTrill}/${eValid}`);
  // 'other' is the residual non-tap non-trill rhotic bucket (see the classifier
  // docs above), not a dedicated ɹ counter. It is ɹ in every recorded run, but
  // the label must not claim more than the bucket measures — a uvular ʁ would
  // land here too and would not be "the retroflex reported honestly".
  console.log(
    `E reported a non-trill rhotic, usually ɹ: ${countOf('E', 'other')}/${eValid}`
  );
  if (eTrill / eValid > FALSE_PASS_WARN_RATE) {
    console.log(
      'WARNING: this rate is a per-attempt chance of marking an untrilled\n' +
        'answer correct. Judge it against how much a wrong pass costs a learner.'
    );
  }
}
