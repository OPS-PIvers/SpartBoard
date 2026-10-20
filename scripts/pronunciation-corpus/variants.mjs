#!/usr/bin/env node
// Learns Speak's native-variant table (S11b) from the model's readings of Cloud TTS voices, never from the native clips.
//
//   node scripts/pronunciation-corpus/variants.mjs [--rate 0.05] [--min-count 2]
//   Needs Cloud TTS on spartboard-dev: `gcloud auth application-default login` (or a proxy that injects credentials).
//   Caches audio and decodes in ~/.cache/spartboard-pronunciation/tts (PRONUNCIATION_GATE_CACHE overrides).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  MODEL_CACHE_DIR,
  corpusSet,
  ROOT,
  SCRIPT_DIR,
  WORDS_PATH,
  createModelSession,
  importTs,
  md5,
  readJson,
  writeJson,
} from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    rate: { type: 'string', default: '0.05' },
    'min-count': { type: 'string', default: '2' },
  },
});
const RATE = Number(args.rate);
const MIN_COUNT = Number(args['min-count']);
if (
  !(RATE > 0 && RATE < 1) ||
  !(Number.isInteger(MIN_COUNT) && MIN_COUNT >= 1)
) {
  console.error(
    '--rate must be between 0 and 1 and --min-count a whole number from 1.'
  );
  process.exit(1);
}
const OUT_PATH = path.join(ROOT, 'config/pronunciationVariants.ts');
const EXTRA_WORDS_PATH = path.join(SCRIPT_DIR, 'variant-words.json');
const TTS_PROJECT = 'spartboard-dev';

const [
  { PRONUNCIATION_MODEL },
  { PRONUNCIATION_VOICES, voiceLanguageCode },
  audio,
  { greedyCtcDecode, invertVocab },
  { alignPronunciation },
  { PRONUNCIATION_GROUPS, RECOGNIZER_TOLERANCE, SPEAK_LANGUAGES },
  { HIGH_LOAD_SWAPS },
] = await Promise.all([
  importTs('config/pronunciationModel.ts'),
  importTs('config/pronunciationVoices.ts'),
  importTs('utils/pronunciation/audio.ts'),
  importTs('utils/pronunciation/ctcDecode.ts'),
  importTs('utils/pronunciation/score.ts'),
  importTs('config/pronunciationGroups.ts'),
  importTs('scripts/pronunciation-corpus/mutate.ts'),
]);
const SYMBOLS = invertVocab(
  readJson(path.join(ROOT, 'utils/pronunciation/xlsr53EspeakVocab.json'))
);

// ---------- word list: corpus words plus the extra common words ----------

const wordLists = [readJson(WORDS_PATH), readJson(EXTRA_WORDS_PATH)];
// The held-out words confirm the cut-offs, so the table never learns from them.
const heldOut = Object.fromEntries(
  SPEAK_LANGUAGES.map((language) => [
    language,
    new Set(
      readJson(corpusSet('heldout').wordsPath).languages[language].words.map(
        (w) => w.word.toLowerCase()
      )
    ),
  ])
);
/** language -> [{ word, refs: token arrays per dialect }] */
const wordsByLanguage = Object.fromEntries(
  SPEAK_LANGUAGES.map((language) => {
    const byWord = new Map();
    for (const list of wordLists) {
      for (const entry of list.languages[language].words) {
        const refs = Object.values(entry.refs)
          .filter((r) => r.tokens)
          .map((r) => r.tokens);
        if (heldOut[language].has(entry.word.toLowerCase())) continue;
        if (refs.length && !byWord.has(entry.word))
          byWord.set(entry.word, refs);
      }
    }
    return [language, [...byWord].map(([word, refs]) => ({ word, refs }))];
  })
);

// ---------- Cloud TTS (cached as WAV files) ----------

const ttsDir = path.join(MODEL_CACHE_DIR, 'tts');
// ADC tokens last an hour, so a long cold run fetches a new one every 45 minutes.
let authHeader;
let authAt = 0;
function ttsAuth() {
  if (authHeader !== undefined && Date.now() - authAt < 45 * 60_000)
    return authHeader;
  authAt = Date.now();
  try {
    const token = execFileSync(
      'gcloud',
      ['auth', 'application-default', 'print-access-token'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    // No gcloud: rely on an outbound proxy that injects Google credentials.
    authHeader = {};
  }
  return authHeader;
}

const wavPath = (language, voice, word) =>
  path.join(ttsDir, language, voice, `${encodeURIComponent(word)}.wav`);

async function synthesize(language, voice, word) {
  const file = wavPath(language, voice, word);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  for (let attempt = 1; ; attempt++) {
    const retry = () => new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    let res;
    try {
      res = await fetch(
        'https://texttospeech.googleapis.com/v1/text:synthesize',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-user-project': TTS_PROJECT,
            ...ttsAuth(),
          },
          body: JSON.stringify({
            input: { text: word },
            voice: { languageCode: voiceLanguageCode(voice), name: voice },
            audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 16000 },
          }),
        }
      );
    } catch (err) {
      if (attempt < 5) {
        await retry();
        continue;
      }
      throw err;
    }
    if (res.ok) {
      const { audioContent } = await res.json();
      const bytes = Buffer.from(audioContent, 'base64');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // Written then renamed, so an interrupted run never leaves a cut-off WAV behind.
      fs.writeFileSync(`${file}.tmp`, bytes);
      fs.renameSync(`${file}.tmp`, file);
      return bytes;
    }
    if (res.status === 401 && attempt < 5) authHeader = undefined;
    if (
      (res.status === 401 || res.status === 429 || res.status >= 500) &&
      attempt < 5
    ) {
      await retry();
      continue;
    }
    throw new Error(
      `TTS ${voice} "${word}": HTTP ${res.status} ${(await res.text()).slice(0, 300)}`
    );
  }
}

/** 16-bit mono PCM from a WAV file's `data` chunk, as floats. */
function wavToFloat(bytes) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === 'data') {
      const end = Math.min(bytes.length, offset + 8 + size);
      const out = new Float32Array(Math.floor((end - offset - 8) / 2));
      for (let i = 0; i < out.length; i++)
        out[i] = bytes.readInt16LE(offset + 8 + i * 2) / 32768;
      return out;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

// ---------- decode (cached by model, decode code and voice list) ----------

const decodeCodeHash = md5(
  [
    'utils/pronunciation/audio.ts',
    'utils/pronunciation/ctcDecode.ts',
    'utils/pronunciation/xlsr53EspeakVocab.json',
    'scripts/pronunciation-corpus/lib.mjs',
  ]
    .map((f) => fs.readFileSync(path.join(ROOT, f)))
    .join('\n')
).slice(0, 12);
const decodeCachePath = path.join(
  ttsDir,
  `decodes-${PRONUNCIATION_MODEL.md5Prefix}-${decodeCodeHash}.json`
);
const decodeCache = readJson(decodeCachePath, {});

let session = null;
let fresh = 0;
async function decode(language, voice, word) {
  const key = `${language}|${voice}|${word}`;
  if (decodeCache[key]) return decodeCache[key];
  const trimmed = audio.trimSilence(
    wavToFloat(await synthesize(language, voice, word))
  );
  session ??= await createModelSession(PRONUNCIATION_MODEL);
  const { data, frames, size } = await session.run(
    audio.normalizeForWav2Vec2(trimmed)
  );
  const { tokens } = greedyCtcDecode(
    data,
    frames,
    size,
    SYMBOLS,
    PRONUNCIATION_MODEL.padId
  );
  decodeCache[key] = tokens.map((t) => t.symbol);
  if (++fresh % 200 === 0) writeJson(decodeCachePath, decodeCache);
  return decodeCache[key];
}

// ---------- learn ----------

// Never learned: group pairs (as listed), high-load swaps (both ways), and tolerance pairs, which are already always correct.
const protectedSwaps = Object.fromEntries(
  SPEAK_LANGUAGES.map((language) => {
    const set = new Set();
    for (const g of PRONUNCIATION_GROUPS[language])
      for (const p of g.pairs) set.add(`${p.target}>${p.spoken}`);
    for (const p of RECOGNIZER_TOLERANCE[language])
      set.add(`${p.target}>${p.spoken}`);
    for (const [a, b] of HIGH_LOAD_SWAPS) {
      set.add(`${a}>${b}`);
      set.add(`${b}>${a}`);
    }
    return [language, set];
  })
);
// Tone digits and syllable dots are other languages' tokens, never a variant of ours.
const plainToken = (t) => t === null || !/[\d.]/.test(t);
const DROP = '∅';

const table = {};
const report = [];
fs.mkdirSync(ttsDir, { recursive: true });

// Fetch every reading first, a few at a time, so decoding never waits on the network.
const jobs = SPEAK_LANGUAGES.flatMap((language) =>
  wordsByLanguage[language].flatMap(({ word }) =>
    PRONUNCIATION_VOICES[language].map((voice) => [language, voice, word])
  )
).filter(([l, v, w]) => !decodeCache[`${l}|${v}|${w}`]);
let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < jobs.length) await synthesize(...jobs[next++]);
  })
);

for (const language of SPEAK_LANGUAGES) {
  const uses = new Map();
  const swaps = new Map();
  let readings = 0;
  for (const { word, refs } of wordsByLanguage[language]) {
    for (const voice of PRONUNCIATION_VOICES[language]) {
      const spoken = await decode(language, voice, word);
      if (!spoken.length) continue;
      readings++;
      // Against the dialect reference it is closest to, first one on a tie.
      let best = null;
      for (const ref of refs) {
        const { alignment, counts } = alignPronunciation(ref, spoken);
        const cost = counts.substituted + counts.omitted + counts.inserted;
        if (!best || cost < best.cost) best = { alignment, cost };
      }
      for (const a of best.alignment) {
        if (a.targetIPA === null) continue;
        uses.set(a.targetIPA, (uses.get(a.targetIPA) ?? 0) + 1);
        const heard =
          a.status === 'omitted'
            ? DROP
            : a.status === 'substituted'
              ? a.spokenIPA
              : null;
        if (heard === null) continue;
        const k = `${a.targetIPA}>${heard}`;
        swaps.set(k, (swaps.get(k) ?? 0) + 1);
      }
    }
  }
  const learned = [];
  for (const [k, count] of swaps) {
    const [target, heard] = k.split('>');
    const spoken = heard === DROP ? null : heard;
    const of = uses.get(target);
    if (count < MIN_COUNT || count / of < RATE) continue;
    if (protectedSwaps[language].has(k)) continue;
    if (!plainToken(target) || !plainToken(spoken)) continue;
    learned.push({ target, spoken, count, of });
  }
  learned.sort(
    (a, b) =>
      a.target.localeCompare(b.target) ||
      (a.spoken ?? '').localeCompare(b.spoken ?? '')
  );
  table[language] = learned;
  report.push(
    `${language}: ${wordsByLanguage[language].length} words, ${readings} readings, ${learned.length} variants`
  );
}
writeJson(decodeCachePath, decodeCache);

// ---------- write ----------

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const body = SPEAK_LANGUAGES.map(
  (language) =>
    `  ${language}: [\n${table[language]
      .map(
        (v) =>
          `    { target: ${q(v.target)}, spoken: ${v.spoken === null ? 'null' : q(v.spoken)} }, // ${v.count} of ${v.of}`
      )
      .join('\n')}\n  ],`
).join('\n');
const source = `import type { SpeakLanguage } from '@/types';

// Generated by scripts/pronunciation-corpus/variants.mjs from Cloud TTS readings; a variant swap never counts against a student.

/** A reference sound native voices often realize as \`spoken\`; null means they drop it. */
export interface NativeVariant {
  target: string;
  spoken: string | null;
}

export const PRONUNCIATION_VARIANTS: Readonly<
  Record<SpeakLanguage, readonly NativeVariant[]>
> = {
${body}
};
`;

const prettier = await import('prettier');
fs.writeFileSync(
  OUT_PATH,
  await prettier.format(source, {
    ...(await prettier.resolveConfig(OUT_PATH)),
    filepath: OUT_PATH,
  })
);
console.log(`Wrote ${OUT_PATH}`);
console.log(report.join('\n'));
