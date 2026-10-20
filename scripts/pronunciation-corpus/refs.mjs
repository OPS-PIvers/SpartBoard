#!/usr/bin/env node
// Fills words.json refs from espeak-ng (the engine S3 runs server-side), tokenized like the app does.
// Usage: ESPEAK_NG_MODULE=/path/to/@echogarden/espeak-ng-emscripten/espeak-ng.js node scripts/pronunciation-corpus/refs.mjs [--set main|heldout]
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { corpusSet, importTs, readJson, writeJson } from './lib.mjs';

const { values: args } = parseArgs({
  options: { set: { type: 'string', default: 'main' } },
});
const WORDS_PATH = corpusSet(args.set).wordsPath;

const ESPEAK_VERSION = '@echogarden/espeak-ng-emscripten@0.3.5';

async function loadEspeak() {
  const spec = process.env.ESPEAK_NG_MODULE;
  if (!spec) {
    console.error(
      `Set ESPEAK_NG_MODULE to espeak-ng.js from ${ESPEAK_VERSION}, e.g.\n` +
        `  npm i --prefix /tmp/espeak ${ESPEAK_VERSION}\n` +
        '  ESPEAK_NG_MODULE=/tmp/espeak/node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.js node scripts/pronunciation-corpus/refs.mjs'
    );
    process.exit(1);
  }
  const { default: Module } = await import(pathToFileURL(spec).href);
  const m = await Module();
  return new m.eSpeakNGWorker();
}

const espeak = await loadEspeak();
const { tokenizeIpa } = await importTs('utils/pronunciation/tokenizeIpa.ts');
const words = readJson(WORDS_PATH);
let failures = 0;

for (const [language, spec] of Object.entries(words.languages)) {
  for (const entry of spec.words) {
    entry.refs = {};
    for (const [dialect, voice] of Object.entries(spec.dialects)) {
      espeak.set_voice(voice);
      const { code, ipa: raw } = espeak.synthesize_ipa(entry.word);
      // espeak separates phonemes with `_`; the tokenizer wants plain IPA.
      const ipa = raw.replace(/[_\n]/g, '').trim();
      const result =
        code === 0 ? tokenizeIpa(ipa) : { ok: false, reason: 'espeak' };
      if (!result.ok) {
        failures++;
        console.warn(
          `${language} ${entry.word} ${dialect}: ${result.reason} (${ipa})`
        );
        entry.refs[dialect] = { ipa, error: result.reason };
        continue;
      }
      entry.refs[dialect] = {
        ipa,
        tokens: result.tokens,
        // §5 contract: 0-based syllable indices; the tokenizer reports 1-based.
        stress: result.primary.map((s) => s - 1),
      };
    }
  }
}

words.g2p = ESPEAK_VERSION;
writeJson(WORDS_PATH, words);
console.log(
  `Wrote ${WORDS_PATH}${failures ? ` with ${failures} failures` : ''}.`
);
