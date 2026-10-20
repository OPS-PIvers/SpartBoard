#!/usr/bin/env node
// The Speak corpus gate (§8): decodes every clip once with the real model, then judges presets and mutated references.
//
//   node scripts/pronunciation-corpus/gate.mjs [--smoke N] [--enforce] [--out docs/pronunciation-gate-results.md]
//   env: PRONUNCIATION_MODEL_PATH (else ~/.cache/spartboard-pronunciation), PRONUNCIATION_GATE_CACHE
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  FIXTURE_DIR,
  MANIFEST_PATH,
  ROOT,
  SCRIPT_DIR,
  WORDS_PATH,
  importTs,
  md5,
  readClip16k,
  readJson,
  writeJson,
} from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    smoke: { type: 'string' },
    enforce: { type: 'boolean', default: false },
    out: { type: 'string', default: 'docs/pronunciation-gate-results.md' },
    json: { type: 'string' },
  },
});

const config = readJson(path.join(SCRIPT_DIR, 'gate.config.json'));
const T = config.thresholds;
const smoke = args.smoke ? Number(args.smoke) : null;
const enforce = (args.enforce || config.enforce) && smoke === null;

const [
  { PRONUNCIATION_MODEL },
  audio,
  { greedyCtcDecode, invertVocab },
  stress,
  core,
  groups,
  { DEFAULT_UNCLEAR_CONFIDENCE },
  { generateMutations, applyMutation },
] = await Promise.all([
  importTs('config/pronunciationModel.ts'),
  importTs('utils/pronunciation/audio.ts'),
  importTs('utils/pronunciation/ctcDecode.ts'),
  importTs('utils/pronunciation/stress.ts'),
  importTs('utils/pronunciation/recognizerCore.ts'),
  importTs('config/pronunciationGroups.ts'),
  importTs('config/flashcardsSpeakAdmin.ts'),
  importTs('scripts/pronunciation-corpus/mutate.ts'),
]);
const vocab = readJson(
  path.join(ROOT, 'utils/pronunciation/xlsr53EspeakVocab.json')
);
const SYMBOLS = invertVocab(vocab);

// S1's judgeSpeech; until it lands on this branch the gate reports decode output only.
let judgeSpeech = null;
if (fs.existsSync(path.join(ROOT, 'utils/pronunciation/verdict.ts'))) {
  ({ judgeSpeech } = await importTs('utils/pronunciation/verdict.ts'));
} else {
  console.warn(
    'utils/pronunciation/verdict.ts is not on this branch; decode-only run.'
  );
}

// ---------- model ----------

const cacheDir =
  process.env.PRONUNCIATION_GATE_CACHE ??
  path.join(os.homedir(), '.cache/spartboard-pronunciation');
const modelPath =
  process.env.PRONUNCIATION_MODEL_PATH ??
  path.join(cacheDir, `${PRONUNCIATION_MODEL.id}.onnx`);

async function loadModelBytes() {
  if (!fs.existsSync(modelPath)) {
    console.log(`Downloading ${PRONUNCIATION_MODEL.huggingFaceUrl}`);
    const res = await fetch(PRONUNCIATION_MODEL.huggingFaceUrl);
    if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`);
    fs.mkdirSync(path.dirname(modelPath), { recursive: true });
    fs.writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = fs.readFileSync(modelPath);
  const digest = md5(bytes);
  if (
    bytes.length !== PRONUNCIATION_MODEL.bytes ||
    !digest.startsWith(PRONUNCIATION_MODEL.md5Prefix)
  ) {
    throw new Error(
      `${modelPath} is not the pinned model (size ${bytes.length}, md5 ${digest.slice(0, 12)})`
    );
  }
  return bytes;
}

let session = null;
async function getSession() {
  if (session) return session;
  const ort = await import('onnxruntime-web-1-30');
  ort.env.wasm.numThreads = Math.min(4, os.availableParallelism());
  session = await ort.InferenceSession.create(await loadModelBytes(), {
    executionProviders: ['wasm'],
  });
  session.ort = ort;
  return session;
}

// ---------- decode (cached by clip and model) ----------

// Keyed by model and by the decode code, so a change to trimming or CTC decoding re-decodes every clip.
const decodeCodeHash = md5(
  [
    'utils/pronunciation/audio.ts',
    'utils/pronunciation/ctcDecode.ts',
    'utils/pronunciation/recognizerCore.ts',
    'scripts/pronunciation-corpus/gate.mjs',
    'utils/pronunciation/xlsr53EspeakVocab.json',
  ]
    .map((f) => fs.readFileSync(path.join(ROOT, f)))
    .join('\n')
).slice(0, 12);
const decodeCachePath = path.join(
  cacheDir,
  `decode-${PRONUNCIATION_MODEL.md5Prefix}-${decodeCodeHash}.json`
);
const decodeCache = readJson(decodeCachePath, {});

async function decodeClip(flacPath, key) {
  const raw = await readClip16k(flacPath);
  const trimmed = audio.trimSilence(raw);
  if (decodeCache[key]) return { ...decodeCache[key], audio16k: trimmed };
  const s = await getSession();
  const input = audio.normalizeForWav2Vec2(trimmed);
  const feeds = {
    [s.inputNames[0]]: new s.ort.Tensor('float32', input, [1, input.length]),
  };
  if (s.inputNames.includes('attention_mask')) {
    feeds.attention_mask = new s.ort.Tensor(
      'int64',
      new BigInt64Array(input.length).fill(1n),
      [1, input.length]
    );
  }
  const t0 = performance.now();
  const out = await s.run(feeds);
  const decodeMs = Math.round(performance.now() - t0);
  const logits = out[s.outputNames[0]];
  const [, frames, size] = logits.dims;
  const data = logits.data;
  const { tokens } = greedyCtcDecode(
    data,
    frames,
    size,
    SYMBOLS,
    PRONUNCIATION_MODEL.padId
  );
  const result = {
    tokens,
    confidence: core.meanNonBlankConfidence(
      data,
      frames,
      size,
      PRONUNCIATION_MODEL.padId
    ),
    // On the untrimmed take, as S2's recognizer measures it.
    voicedMs: core.measureVoicedMs(raw),
    decodeMs,
    seconds: Number((trimmed.length / audio.MODEL_SAMPLE_RATE).toFixed(2)),
  };
  decodeCache[key] = result;
  return { ...result, audio16k: trimmed };
}

// ---------- judging ----------

function stressFor(language, decoded) {
  return (ref, alignment) => {
    const nuclei = stress.extractNuclei(decoded.tokens, alignment);
    const measurements = stress.measureNuclei(decoded.audio16k, nuclei);
    const found = stress.detectStress({
      nuclei,
      measurements,
      alignment,
      targetPhonemes: ref.tokens,
      // The detector speaks 1-based syllables; the §5 references are 0-based.
      accepted: ref.stress.map((s) => s + 1),
      config: { ...stress.DEFAULT_STRESS_CONFIG, language },
    });
    return found ? found.detected - 1 : null;
  };
}

function judge(language, refs, decoded, settings) {
  return judgeSpeech({
    refs,
    spoken: decoded.tokens.map((t) => t.symbol),
    stressFor: stressFor(language, decoded),
    confidence: decoded.confidence,
    voicedMs: decoded.voicedMs,
    language,
    settings,
    unclearConfidence: DEFAULT_UNCLEAR_CONFIDENCE,
  });
}

const ratio = (hit, total) => (total ? hit / total : null);
const pct = (r) => (r === null ? 'n/a' : `${(r * 100).toFixed(1)}%`);

// ---------- run ----------

const words = readJson(WORDS_PATH);
const manifest = readJson(MANIFEST_PATH, { clips: [] });
const controls = readJson(path.join(FIXTURE_DIR, 'controls.json'), {
  controls: [],
});
const missingClips = manifest.clips.filter(
  (c) => !fs.existsSync(path.join(FIXTURE_DIR, 'clips', c.flac))
);
let clips = manifest.clips.filter((c) => !missingClips.includes(c));
if (smoke !== null) clips = clips.slice(0, smoke);

const refsFor = (language, word) => {
  const entry = words.languages[language].words.find((w) => w.word === word);
  return Object.entries(entry?.refs ?? {})
    .filter(([, r]) => r.tokens)
    .map(([dialect, r]) => ({ dialect, tokens: r.tokens, stress: r.stress }));
};

const started = Date.now();
const perLanguage = {};
const confusions = {};
const rows = [];
for (const [i, clip] of clips.entries()) {
  const decoded = await decodeClip(
    path.join(FIXTURE_DIR, 'clips', clip.flac),
    clip.flacSha1 ?? clip.id
  );
  if ((i + 1) % 25 === 0) console.log(`  decoded ${i + 1}/${clips.length}`);
  const refs = refsFor(clip.language, clip.word);
  const row = {
    id: clip.id,
    language: clip.language,
    word: clip.word,
    heard: decoded.tokens.map((t) => t.symbol).join(' '),
    confidence: decoded.confidence,
  };
  rows.push(row);
  const L = (perLanguage[clip.language] ??= {
    clips: 0,
    beginner: 0,
    advanced: 0,
    unclear: 0,
    highLoad: [0, 0],
    groupRequire: [0, 0],
    groupForgive: [0, 0],
  });
  L.clips++;
  if (!judgeSpeech || refs.length === 0) continue;

  const beginner = judge(
    clip.language,
    refs,
    decoded,
    groups.speakPresetSettings(clip.language, 'beginner')
  );
  const advanced = judge(
    clip.language,
    refs,
    decoded,
    groups.speakPresetSettings(clip.language, 'advanced')
  );
  row.beginner = beginner.verdict;
  row.advanced = advanced.verdict;
  if (beginner.verdict === 'unclear') L.unclear++;
  if (beginner.verdict === 'exact' || beginner.verdict === 'accepted')
    L.beginner++;
  if (advanced.verdict === 'exact' || advanced.verdict === 'accepted')
    L.advanced++;
  // Native substitutions under Advanced, for S11's tolerance review.
  const pairs = new Set(
    advanced.entries
      .filter((e) => e.status === 'substituted')
      .map((e) => `${clip.language} ${e.targetIPA}→${e.spokenIPA}`)
  );
  for (const k of pairs) confusions[k] = (confusions[k] ?? 0) + 1;

  // Mutations use the dialect the clean Advanced judgement matched, and only clips that pass it clean.
  if (advanced.verdict === 'wrong' || advanced.verdict === 'unclear') continue;
  const base = refs.find((r) => r.dialect === advanced.dialect) ?? refs[0];
  const lenient = { strict: false, groups: {} };
  // Only positions the clean alignment heard exactly, so the change is the only difference.
  const heardExactly = new Set(
    advanced.entries
      .filter((e) => e.kind === 'correct')
      .map((e) => e.position - 1)
  );
  for (const m of generateMutations(base.tokens, clip.language)) {
    if (!heardExactly.has(m.position)) continue;
    const mutated = [{ ...base, tokens: applyMutation(base.tokens, m) }];
    const at = (j) =>
      j.entries.find(
        (e) => e.position === m.position + 1 && e.targetIPA === m.target
      );
    if (m.kind === 'high-load') {
      const j = judge(
        clip.language,
        mutated,
        decoded,
        groups.speakPresetSettings(clip.language, 'beginner')
      );
      L.highLoad[1]++;
      if (j.verdict === 'wrong' && at(j)?.kind === 'error') L.highLoad[0]++;
    } else {
      const req = judge(clip.language, mutated, decoded, {
        ...lenient,
        groups: { [m.groupId]: 'require' },
      });
      L.groupRequire[1]++;
      if (req.verdict === 'wrong' && at(req)?.kind === 'error')
        L.groupRequire[0]++;
      const fgv = judge(clip.language, mutated, decoded, {
        ...lenient,
        groups: { [m.groupId]: 'forgive' },
      });
      L.groupForgive[1]++;
      if (fgv.verdict === 'accepted' && fgv.forgivenGroups.includes(m.groupId))
        L.groupForgive[0]++;
    }
  }
}

let controlsUnclear = 0;
const controlRows = [];
for (const c of controls.controls) {
  const decoded = await decodeClip(
    path.join(FIXTURE_DIR, c.flac),
    c.flacSha1 ?? c.id
  );
  const verdict = judgeSpeech
    ? judge(
        'es',
        [{ dialect: 'es-419', tokens: ['o', 'l', 'a'], stress: [] }],
        decoded,
        { strict: false, groups: {} }
      ).verdict
    : null;
  if (verdict === 'unclear') controlsUnclear++;
  controlRows.push({
    id: c.id,
    heard: decoded.tokens.map((t) => t.symbol).join(' '),
    confidence: decoded.confidence,
    voicedMs: decoded.voicedMs,
    verdict,
  });
}
fs.mkdirSync(cacheDir, { recursive: true });
writeJson(decodeCachePath, decodeCache);

// ---------- report ----------

const checks = [];
const check = (name, value, pass, threshold) =>
  checks.push({
    name,
    value,
    threshold,
    pass: value === null ? null : pass(value),
  });
for (const [language, L] of Object.entries(perLanguage)) {
  check(
    `${language}: natives pass Beginner`,
    ratio(L.beginner, L.clips),
    (v) => v >= T.nativeBeginnerPass,
    `≥ ${pct(T.nativeBeginnerPass)}`
  );
  check(
    `${language}: natives pass Advanced`,
    ratio(L.advanced, L.clips),
    (v) => v >= T.nativeAdvancedPass,
    `≥ ${pct(T.nativeAdvancedPass)}`
  );
  check(
    `${language}: natives unclear`,
    ratio(L.unclear, L.clips),
    (v) => v <= T.nativeUnclearMax,
    `≤ ${pct(T.nativeUnclearMax)}`
  );
  check(
    `${language}: high-load mutations caught`,
    ratio(...L.highLoad),
    (v) => v >= T.highLoadRecall,
    `≥ ${pct(T.highLoadRecall)}`
  );
  check(
    `${language}: group pairs caught under require`,
    ratio(...L.groupRequire),
    (v) => v >= T.groupRequireRecall,
    `≥ ${pct(T.groupRequireRecall)}`
  );
  check(
    `${language}: group pairs Accepted under forgive`,
    ratio(...L.groupForgive),
    (v) => v >= T.groupForgiveAccepted,
    `≥ ${pct(T.groupForgiveAccepted)}`
  );
}
check(
  'controls: judged unclear',
  judgeSpeech ? ratio(controlsUnclear, controls.controls.length) : null,
  (v) => v >= T.controlsUnclear,
  '100%'
);

const thin = Object.keys(words.languages).filter(
  (l) => (perLanguage[l]?.clips ?? 0) < config.minClipsPerLanguage
);
const failed = checks.filter((c) => c.pass === false);
// An enforced gate never passes on a corpus or engine it could not measure.
const unmeasured = [
  ...(judgeSpeech ? [] : ['utils/pronunciation/verdict.ts is missing']),
  ...thin.map((l) => `${l} has fewer than ${config.minClipsPerLanguage} clips`),
  ...(missingClips.length
    ? [`${missingClips.length} manifest clips are missing`]
    : []),
  ...(judgeSpeech
    ? checks
        .filter((c) => c.pass === null)
        .map((c) => `${c.name} had nothing to measure`)
    : []),
];
const md = [
  '# Speak corpus gate results',
  '',
  `Run ${new Date().toISOString().slice(0, 10)} on ${clips.length} clips and ${controls.controls.length} controls` +
    `${smoke !== null ? ` (smoke run of ${smoke})` : ''}, model \`${PRONUNCIATION_MODEL.id}\`, unclear cut-off ${DEFAULT_UNCLEAR_CONFIDENCE}, ${Math.round((Date.now() - started) / 1000)} s.`,
  judgeSpeech
    ? ''
    : '\n**Decode only:** `utils/pronunciation/verdict.ts` is not on this branch yet, so no verdicts were judged.\n',
  thin.length
    ? `**Corpus incomplete:** fewer than ${config.minClipsPerLanguage} clips for ${thin.join(', ')}; run \`scripts/pronunciation-corpus/fetch.mjs\`.\n`
    : '',
  '| Check | Result | Pass mark | |',
  '| ----- | ------ | --------- | - |',
  ...checks.map(
    (c) =>
      `| ${c.name} | ${pct(c.value)} | ${c.threshold} | ${c.pass === null ? 'n/a' : c.pass ? 'pass' : '**fail**'} |`
  ),
  '',
  '| Language | Clips | Mutations (high-load / group) |',
  '| -------- | ----- | ----------------------------- |',
  ...Object.entries(perLanguage).map(
    ([l, L]) =>
      `| ${l} | ${L.clips} | ${L.highLoad[1]} / ${L.groupRequire[1]} |`
  ),
  '',
  'Browser and Node decode agreement (§8) is checked by hand on `/pronunciation-dev`, not here.',
  '',
  '## Native substitutions under Advanced',
  '',
  "Pairs natives produce in at least 10% of clips are tolerance candidates for S11 (§4.2), each with Paul's yes.",
  '',
  '| Pair | Clips |',
  '| ---- | ----- |',
  ...Object.entries(confusions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k, n]) => `| ${k} | ${n} |`),
  '',
  '## Controls',
  '',
  '| Control | Heard | Confidence | Voiced ms | Verdict |',
  '| ------- | ----- | ---------- | --------- | ------- |',
  ...controlRows.map(
    (r) =>
      `| ${r.id} | ${r.heard || '(nothing)'} | ${r.confidence.toFixed(2)} | ${r.voicedMs} | ${r.verdict ?? 'n/a'} |`
  ),
  '',
];
fs.writeFileSync(args.out, md.join('\n'));
if (args.json)
  writeJson(args.json, {
    checks,
    perLanguage,
    confusions,
    rows,
    controls: controlRows,
  });
console.log(md.slice(0, 6 + checks.length + 2).join('\n'));
console.log(`\nWrote ${args.out}.`);

if (enforce && (failed.length || unmeasured.length)) {
  console.error(`${failed.length} checks below their pass mark.`);
  for (const u of unmeasured) console.error(`Not measured: ${u}.`);
  process.exit(1);
}
if (failed.length)
  console.warn(
    `${failed.length} checks below their pass mark (not enforced${smoke !== null ? ' on a smoke run' : ''}).`
  );
