#!/usr/bin/env node
// Writes tests/fixtures/pronunciation-corpus/voice-refs.json: S11a's voiced-example references for every corpus word, so CI never calls TTS.
//
//   gcloud auth application-default login
//   node scripts/pronunciation-corpus/voice-refs.mjs [--project spartboard-dev] [--set main|heldout] [--fresh]
//
// Reuses readings already in the file for the same model and voice unless --fresh; safe to stop and rerun.
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import {
  CORPUS_SETS,
  VOICE_REFS_PATH,
  corpusSet,
  createModelSession,
  importTs,
  readJson,
  writeJson,
} from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    project: { type: 'string', default: 'spartboard-dev' },
    set: { type: 'string', multiple: true },
    fresh: { type: 'boolean', default: false },
  },
});

// The server's own pipeline (functions/src/pronunciation), so the committed references match what the lookup stores.
const [voiceRefs, voices] = await Promise.all([
  importTs('functions/src/pronunciation/voiceRefs.ts'),
  importTs('functions/src/pronunciation/voices.ts'),
]);
const { PRONUNCIATION_MODEL, PRONUNCIATION_VOICES, voiceDialect } = voices;

function accessToken() {
  try {
    return execFileSync(
      'gcloud',
      ['auth', 'application-default', 'print-access-token'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch {
    // An authenticating proxy (cloud sessions) adds the credential itself.
    console.warn('No application-default credentials; sending TTS requests without a token.');
    return null;
  }
}
const token = accessToken();

async function synthesize(voice, word) {
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-user-project': args.project,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      input: { text: word },
      voice: { languageCode: voices.voiceLanguageCode(voice), name: voice },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 16000 },
    }),
  });
  if (res.status === 400 || res.status === 404) {
    console.warn(`  ${voice} can't say ${word} (HTTP ${res.status})`);
    return null;
  }
  if (!res.ok) throw new Error(`TTS ${voice} ${word}: HTTP ${res.status} ${await res.text()}`);
  const { audioContent } = await res.json();
  return audioContent ? Buffer.from(audioContent, 'base64') : null;
}

const model = await createModelSession(PRONUNCIATION_MODEL);
// TTS calls overlap; model runs go one at a time.
let modelQueue = Promise.resolve();
const reader = voiceRefs.createVoiceReader({
  synthesize,
  runModel(input) {
    const job = modelQueue.then(() => model.run(input));
    modelQueue = job.catch(() => undefined);
    return job;
  },
});

const previous = readJson(VOICE_REFS_PATH, null);
const reuse =
  !args.fresh && previous?.model === PRONUNCIATION_MODEL.md5Prefix
    ? previous.readings
    : {};
const out = {
  version: 1,
  note: 'Voiced-example references for the corpus words (S11a pipeline), written by voice-refs.mjs. Regenerate when the voices, the model or the espeak references change.',
  model: PRONUNCIATION_MODEL.md5Prefix,
  voices: PRONUNCIATION_VOICES,
  readings: previous?.model === PRONUNCIATION_MODEL.md5Prefix ? previous.readings : {},
  refs: previous?.model === PRONUNCIATION_MODEL.md5Prefix ? previous.refs : {},
};

for (const setName of args.set ?? CORPUS_SETS) {
  const words = readJson(corpusSet(setName).wordsPath);
  for (const [language, spec] of Object.entries(words.languages)) {
    const list = PRONUNCIATION_VOICES[language];
    for (const [i, entry] of spec.words.entries()) {
      const readings = Object.fromEntries(
        await Promise.all(
          list.map(async (voice) => [
            voice,
            reuse[language]?.[entry.word]?.[voice] ??
              (await reader.read(voice, entry.word)),
          ])
        )
      );
      // As the lookup's addVoiceReferences: each distinct usable reading joins its dialect's espeak reference.
      const bases = Object.entries(entry.refs ?? {})
        .filter(([, r]) => r.tokens)
        .map(([dialect, r]) => ({ dialect, tokens: r.tokens, stress: r.stress }));
      const seen = new Set(bases.map((r) => r.tokens.join(' ')));
      const refs = [];
      for (const voice of list) {
        const base = bases.find((r) => r.dialect === voiceDialect(voice));
        const ref = base && voiceRefs.voiceReference(base, readings[voice]);
        if (!ref || seen.has(ref.tokens.join(' '))) continue;
        seen.add(ref.tokens.join(' '));
        refs.push(ref);
      }
      (out.readings[language] ??= {})[entry.word] = readings;
      (out.refs[language] ??= {})[entry.word] = refs;
      if ((i + 1) % 10 === 0) {
        console.log(`  ${setName} ${language} ${i + 1}/${spec.words.length}`);
        writeJson(VOICE_REFS_PATH, out);
      }
    }
  }
}
writeJson(VOICE_REFS_PATH, out);
console.log(`Wrote ${VOICE_REFS_PATH}.`);
