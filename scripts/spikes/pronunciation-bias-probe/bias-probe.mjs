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
 * Each condition runs N times (default 5) because a single sample cannot
 * distinguish bias from sampling noise.
 *
 * USAGE
 *   GEMINI_API_KEY=... node bias-probe.mjs [--model gemini-2.5-flash] [--runs 5]
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

const MODEL = arg('--model', 'gemini-2.5-flash');
// Default 10, not 5. At n=5 the verdict threshold below can fire on a 2/5 vs
// 4/5 split, which is a routine noise outcome (Fisher exact p ~= 0.5) — the
// run counts are printed alongside the verdict so the split stays inspectable.
const RUNS = Number(arg('--runs', '10'));
const API_KEY = process.env.GEMINI_API_KEY ?? process.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
  console.error('Set GEMINI_API_KEY (or VITE_GEMINI_API_KEY) and re-run.');
  process.exit(1);
}

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
  return parsed.phonemes ?? [];
}

/** Which rhotic did it report? This is the entire measurement. */
const rhoticOf = (phonemes) => {
  const joined = phonemes.join('');
  if (joined.includes('ɾ')) return 'ɾ'; // tap — honest for B/C/D
  if (joined.includes('r')) return 'r'; // trill — expected only for A
  return '?';
};

const results = {};

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
const tapRate = (id) =>
  results[id].rhotics.filter((r) => r === 'ɾ').length / RUNS;

const tapCount = (id) => results[id].rhotics.filter((r) => r === 'ɾ').length;

const bTap = tapRate('B'); // told to expect a trill
const dTap = tapRate('D'); // told nothing

console.log('\n--- VERDICT ---');
console.log(
  `B (primed "perro") reported the true tap: ${tapCount('B')}/${RUNS} (${(bTap * 100).toFixed(0)}%)`
);
console.log(
  `D (unprimed)       reported the true tap: ${tapCount('D')}/${RUNS} (${(dTap * 100).toFixed(0)}%)`
);

if (RUNS < 10) {
  console.log(
    `\n! UNDER-POWERED: --runs ${RUNS}. The threshold below can fire on splits\n` +
      `  that are indistinguishable from sampling noise. Re-run with --runs 10+\n` +
      `  before acting on this verdict.`
  );
}

if (dTap - bTap >= 0.4) {
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
