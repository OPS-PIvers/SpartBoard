#!/usr/bin/env node
// The Speak corpus gate (§8): decodes every clip once with the real model, then judges presets, mutated references and other words.
//
//   node scripts/pronunciation-corpus/gate.mjs [--smoke N] [--enforce] [--out docs/pronunciation-gate-results.md]
//   env: PRONUNCIATION_MODEL_PATH (else ~/.cache/spartboard-pronunciation), PRONUNCIATION_GATE_CACHE
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  CORPUS_SETS,
  FIXTURE_DIR,
  MODEL_CACHE_DIR,
  ROOT,
  SCRIPT_DIR,
  VOICE_REFS_PATH,
  corpusSet,
  createModelSession,
  espeakKey,
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

const E = await importTs('scripts/pronunciation-corpus/engine.ts');
const { PRONUNCIATION_MODEL, audio, core, groups, stress } = E;
const vocab = readJson(
  path.join(ROOT, 'utils/pronunciation/xlsr53EspeakVocab.json')
);
const SYMBOLS = E.invertVocab(vocab);

// ---------- decode (cached by clip and model) ----------

const cacheDir = MODEL_CACHE_DIR;
let session = null;
const getSession = async () =>
  (session ??= await createModelSession(PRONUNCIATION_MODEL));

// Keyed by model and by the decode code, so a change to trimming or CTC decoding re-decodes every clip.
const decodeCodeHash = md5(
  [
    'utils/pronunciation/audio.ts',
    'utils/pronunciation/ctcDecode.ts',
    'utils/pronunciation/recognizerCore.ts',
    'scripts/pronunciation-corpus/lib.mjs',
    'utils/pronunciation/xlsr53EspeakVocab.json',
  ]
    .map((f) => fs.readFileSync(path.join(ROOT, f)))
    .join('\n')
).slice(0, 12);
const cacheTag = `${PRONUNCIATION_MODEL.md5Prefix}-${decodeCodeHash}`;
const decodeCachePath = path.join(cacheDir, `decode-${cacheTag}.json`);
// Raw logits per clip, beside the JSON; the log-softmax is taken on load, as the Worker does.
const logitsDir = path.join(cacheDir, `logits-${cacheTag}`);
const decodeCache = readJson(decodeCachePath, {});

function cachedLogits(key) {
  const file = path.join(logitsDir, `${key}.f32`);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  // Copied out, since a Buffer's offset isn't always 4-byte aligned.
  return new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  );
}

async function decodeClip(flacPath, key) {
  const raw = await readClip16k(flacPath);
  const trimmed = audio.trimSilence(raw);
  let entry = decodeCache[key];
  let logits = entry ? cachedLogits(key) : null;
  if (!entry || !logits || logits.length !== entry.frames * entry.size) {
    const s = await getSession();
    const t0 = performance.now();
    const out = await s.run(audio.normalizeForWav2Vec2(trimmed));
    const decodeMs = Math.round(performance.now() - t0);
    logits = out.data;
    const { tokens } = E.greedyCtcDecode(
      logits,
      out.frames,
      out.size,
      SYMBOLS,
      PRONUNCIATION_MODEL.padId
    );
    entry = {
      tokens,
      confidence: core.meanNonBlankConfidence(
        logits,
        out.frames,
        out.size,
        PRONUNCIATION_MODEL.padId
      ),
      // On the untrimmed take, as S2's recognizer measures it.
      voicedMs: core.measureVoicedMs(raw),
      decodeMs,
      seconds: Number((trimmed.length / audio.MODEL_SAMPLE_RATE).toFixed(2)),
      frames: out.frames,
      size: out.size,
    };
    decodeCache[key] = entry;
    fs.mkdirSync(logitsDir, { recursive: true });
    fs.writeFileSync(
      path.join(logitsDir, `${key}.f32`),
      Buffer.from(logits.buffer, logits.byteOffset, logits.byteLength)
    );
  }
  return {
    ...entry,
    audio16k: trimmed,
    logProbs: {
      data: E.logSoftmax(logits, entry.frames, entry.size),
      frames: entry.frames,
      vocabSize: entry.size,
    },
  };
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
  return E.judgeSpeech({
    refs,
    spoken: decoded.tokens.map((t) => t.symbol),
    stressFor: stressFor(language, decoded),
    confidence: decoded.confidence,
    voicedMs: decoded.voicedMs,
    language,
    settings,
    unclearConfidence: E.DEFAULT_UNCLEAR_CONFIDENCE,
    logProbs: decoded.logProbs,
  });
}

const passes = (j) => j.verdict === 'exact' || j.verdict === 'accepted';
const ratio = (hit, total) => (total ? hit / total : null);
const pct = (r) => (r === null ? 'n/a' : `${(r * 100).toFixed(1)}%`);

// ---------- references ----------

// S11a's voice references, committed by voice-refs.mjs because CI has no TTS.
const voiceRefFile = readJson(VOICE_REFS_PATH, null);
const voiceRefsUsable =
  voiceRefFile?.model === PRONUNCIATION_MODEL.md5Prefix &&
  JSON.stringify(voiceRefFile.voices) === JSON.stringify(E.PRONUNCIATION_VOICES)
    ? voiceRefFile
    : null;

function refBuilder(words) {
  const missingVoice = new Set();
  const refsFor = (language, word) => {
    const entry = words.languages[language].words.find((w) => w.word === word);
    const espeak = Object.entries(entry?.refs ?? {})
      .filter(([, r]) => r.tokens)
      .map(([dialect, r]) => ({
        dialect,
        tokens: r.tokens,
        stress: r.stress,
        source: 'espeak',
      }));
    // Voice references built beside other espeak ones are stale, so they count as missing.
    const voiced =
      voiceRefsUsable?.espeak?.[language]?.[word] === espeakKey(entry ?? {})
        ? voiceRefsUsable.refs?.[language]?.[word]
        : undefined;
    if (!voiced) missingVoice.add(`${language} ${word}`);
    return [...espeak, ...(voiced ?? [])];
  };
  return { refsFor, missingVoice };
}

// ---------- one corpus set ----------

// Other words each clip is judged against, picked from a hash of the clip id so a pick never shifts when clips are added.
const WRONG_WORDS_PER_CLIP = 8;
const sameSound = (a, b) => {
  const keys = new Set(a.map((r) => r.tokens.join(' ')));
  return b.some((r) => keys.has(r.tokens.join(' ')));
};

async function runSet(name) {
  const set = corpusSet(name);
  const words = readJson(set.wordsPath);
  const manifest = readJson(set.manifestPath, { clips: [] });
  const missingClips = manifest.clips.filter(
    (c) => !fs.existsSync(path.join(set.clipsDir, c.flac))
  );
  let clips = manifest.clips.filter((c) => !missingClips.includes(c));
  if (smoke !== null) clips = clips.slice(0, smoke);
  const { refsFor, missingVoice } = refBuilder(words);

  const perLanguage = {};
  const confusions = {};
  const rows = [];
  for (const [i, clip] of clips.entries()) {
    const decoded = await decodeClip(
      path.join(set.clipsDir, clip.flac),
      clip.flacSha1 ?? clip.id
    );
    if ((i + 1) % 25 === 0)
      console.log(`  ${name}: judged ${i + 1}/${clips.length}`);
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
      wrongWord: [0, 0],
    });
    L.clips++;
    if (refs.length === 0) continue;

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
    if (passes(beginner)) L.beginner++;
    if (passes(advanced)) L.advanced++;
    // Native substitutions under Advanced, for the tolerance review.
    const pairs = new Set(
      advanced.entries
        .filter((e) => e.kind === 'error' && e.status === 'substituted')
        .map((e) => `${clip.language} ${e.targetIPA}→${e.spokenIPA}`)
    );
    for (const k of pairs) confusions[k] = (confusions[k] ?? 0) + 1;

    // A clip judged against another word's references, all of them, under the most lenient preset must be Not yet.
    if (beginner.verdict !== 'unclear') {
      const others = words.languages[clip.language].words.filter(
        (w) => w.word !== clip.word
      );
      const start = parseInt(md5(clip.id).slice(0, 8), 16);
      const stride = Math.max(1, Math.floor(others.length / WRONG_WORDS_PER_CLIP));
      for (let k = 0; k < Math.min(WRONG_WORDS_PER_CLIP, others.length); k++) {
        const other = others[(start + k * stride) % others.length].word;
        const otherRefs = refsFor(clip.language, other);
        // A homophone's references are this word's too.
        if (otherRefs.length === 0 || sameSound(refs, otherRefs)) continue;
        L.wrongWord[1]++;
        const j = judge(
          clip.language,
          otherRefs,
          decoded,
          groups.speakPresetSettings(clip.language, 'beginner')
        );
        if (passes(j)) L.wrongWord[0]++;
      }
    }

    // Mutations use the dialect the clean Advanced judgement matched, and only clips that pass it clean.
    if (!passes(advanced)) continue;
    const base = refs.find((r) => r.dialect === advanced.dialect) ?? refs[0];
    const lenient = { strict: false, groups: {} };
    // Only positions the clean alignment heard exactly, so the change is the only difference.
    const heardExactly = new Set(
      advanced.entries
        .filter((e) => e.kind === 'correct')
        .map((e) => e.position - 1)
    );
    for (const m of E.generateMutations(base.tokens, clip.language)) {
      if (!heardExactly.has(m.position)) continue;
      const mutated = [{ ...base, tokens: E.applyMutation(base.tokens, m) }];
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

  const minClips =
    name === 'main'
      ? config.minClipsPerLanguage
      : config.minHeldOutClipsPerLanguage;
  const thin = Object.keys(words.languages).filter(
    (l) => (perLanguage[l]?.clips ?? 0) < minClips
  );
  return {
    name,
    clips: clips.length,
    perLanguage,
    confusions,
    rows,
    missingClips,
    missingVoice: [...missingVoice],
    thin,
    minClips,
  };
}

// ---------- run ----------

const started = Date.now();
const results = [];
for (const name of CORPUS_SETS) results.push(await runSet(name));

const controls = readJson(path.join(FIXTURE_DIR, 'controls.json'), {
  controls: [],
});
let controlsUnclear = 0;
const controlRows = [];
for (const c of controls.controls) {
  const decoded = await decodeClip(
    path.join(FIXTURE_DIR, c.flac),
    c.flacSha1 ?? c.id
  );
  const verdict = judge(
    'es',
    [{ dialect: 'es-419', tokens: ['o', 'l', 'a'], stress: [] }],
    decoded,
    { strict: false, groups: {} }
  ).verdict;
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
// Decodes from older models or decode code are never read again; dropping them keeps the CI cache from growing.
for (const f of fs.readdirSync(cacheDir)) {
  if (/^(decode|logits)-/.test(f) && !f.includes(cacheTag))
    fs.rmSync(path.join(cacheDir, f), { recursive: true, force: true });
}

// ---------- checks ----------

const checks = [];
const check = (set, name, value, pass, threshold) =>
  checks.push({
    set,
    name,
    value,
    threshold,
    pass: pass === null || value === null ? null : pass(value),
  });
for (const r of results) {
  for (const [language, L] of Object.entries(r.perLanguage)) {
    const c = (name, value, pass, threshold) =>
      check(r.name, `${language}: ${name}`, value, pass, threshold);
    c(
      'natives pass Beginner',
      ratio(L.beginner, L.clips),
      (v) => v >= T.nativeBeginnerPass,
      `≥ ${pct(T.nativeBeginnerPass)}`
    );
    c(
      'natives pass Advanced',
      ratio(L.advanced, L.clips),
      (v) => v >= T.nativeAdvancedPass,
      `≥ ${pct(T.nativeAdvancedPass)}`
    );
    c(
      'natives unclear',
      ratio(L.unclear, L.clips),
      (v) => v <= T.nativeUnclearMax,
      `≤ ${pct(T.nativeUnclearMax)}`
    );
    c(
      'high-load mutations caught',
      ratio(...L.highLoad),
      (v) => v >= T.highLoadRecall,
      `≥ ${pct(T.highLoadRecall)}`
    );
    c(
      'group pairs caught under require',
      ratio(...L.groupRequire),
      (v) => v >= T.groupRequireRecall,
      `≥ ${pct(T.groupRequireRecall)}`
    );
    c(
      'group pairs Accepted under forgive',
      ratio(...L.groupForgive),
      (v) => v >= T.groupForgiveAccepted,
      `≥ ${pct(T.groupForgiveAccepted)}`
    );
    // No pass mark agreed yet: reported, and an enforced gate counts it as unmeasured until Paul sets wrongWordAcceptedMax.
    c(
      'another word accepted (Beginner)',
      ratio(...L.wrongWord),
      T.wrongWordAcceptedMax === undefined
        ? null
        : (v) => v <= T.wrongWordAcceptedMax,
      T.wrongWordAcceptedMax === undefined
        ? 'none set'
        : `≤ ${pct(T.wrongWordAcceptedMax)}`
    );
  }
}
check(
  'controls',
  'controls: judged unclear',
  ratio(controlsUnclear, controls.controls.length),
  (v) => v >= T.controlsUnclear,
  '100%'
);

const failed = checks.filter((c) => c.pass === false);
// An enforced gate never passes on a corpus or references it could not measure.
const unmeasured = [
  ...(voiceRefsUsable
    ? []
    : [
        `${path.relative(ROOT, VOICE_REFS_PATH)} is missing or for another model`,
      ]),
  ...results.flatMap((r) => [
    ...r.thin.map(
      (l) => `${r.name}: ${l} has fewer than ${r.minClips} clips`
    ),
    ...(r.missingClips.length
      ? [`${r.name}: ${r.missingClips.length} manifest clips are missing`]
      : []),
    ...(r.missingVoice.length
      ? [`${r.name}: no voice references for ${r.missingVoice.join(', ')}`]
      : []),
  ]),
  ...checks
    .filter((c) => c.value === null)
    .map((c) => `${c.set} ${c.name} had nothing to measure`),
  ...(T.wrongWordAcceptedMax === undefined
    ? ['the another-word check has no pass mark (wrongWordAcceptedMax)']
    : []),
];

// ---------- report ----------

const checkTable = (rows) => [
  '| Check | Result | Pass mark | |',
  '| ----- | ------ | --------- | - |',
  ...rows.map(
    (c) =>
      `| ${c.name} | ${pct(c.value)} | ${c.threshold} | ${c.pass === null ? 'n/a' : c.pass ? 'pass' : '**fail**'} |`
  ),
];
const TITLES = {
  main: 'Tuning set',
  heldout: 'Held-out set',
};
const NOTES = {
  main: 'The words the scorer cut-offs were picked on (`words.json`).',
  heldout:
    'New words and speakers (`words.heldout.json`) that no cut-off was tuned on; they confirm the tuning set generalises.',
};
const md = [
  '# Speak corpus gate results',
  '',
  `Run ${new Date().toISOString().slice(0, 10)} on ${results.map((r) => `${r.clips} ${r.name}`).join(' and ')} clips and ${controls.controls.length} controls` +
    `${smoke !== null ? ` (smoke run of ${smoke} per set)` : ''}, model \`${PRONUNCIATION_MODEL.id}\`, likelihood scorer (swap ${E.scoring.SWAP_CUTOFF}, required group ${E.scoring.REQUIRED_GROUP_CUTOFF}, forgiven group ${E.scoring.FORGIVEN_GROUP_CUTOFF}, window ${E.scoring.CHARITABLE_WINDOW}), ${Object.entries(E.PRONUNCIATION_VARIANTS).map(([l, v]) => `${v.length} ${l}`).join(' / ')} native variants, unclear cut-off ${E.DEFAULT_UNCLEAR_CONFIDENCE}, ${Math.round((Date.now() - started) / 1000)} s.`,
  '',
  `References: espeak-ng plus ${voiceRefsUsable ? Object.entries(voiceRefsUsable.voices).map(([l, v]) => `${v.length} ${l}`).join(' / ') : 'no'} Cloud TTS voices per word (\`tests/fixtures/pronunciation-corpus/voice-refs.json\`).`,
  '',
  unmeasured.length
    ? `**Not measured:** ${unmeasured.join('; ')}.\n`
    : '',
  `Gate ${enforce ? 'enforced' : 'not enforced'}: ${failed.length} checks below their pass mark.`,
  '',
  ...results.flatMap((r) => [
    `## ${TITLES[r.name]}`,
    '',
    NOTES[r.name],
    '',
    ...checkTable(checks.filter((c) => c.set === r.name)),
    '',
    '| Language | Clips | Mutations (high-load / group) | Other-word judgements |',
    '| -------- | ----- | ----------------------------- | --------------------- |',
    ...Object.entries(r.perLanguage).map(
      ([l, L]) =>
        `| ${l} | ${L.clips} | ${L.highLoad[1]} / ${L.groupRequire[1]} | ${L.wrongWord[1]} |`
    ),
    '',
  ]),
  '## Controls',
  '',
  ...checkTable(checks.filter((c) => c.set === 'controls')),
  '',
  '| Control | Heard | Confidence | Voiced ms | Verdict |',
  '| ------- | ----- | ---------- | --------- | ------- |',
  ...controlRows.map(
    (r) =>
      `| ${r.id} | ${r.heard || '(nothing)'} | ${r.confidence.toFixed(2)} | ${r.voicedMs} | ${r.verdict} |`
  ),
  '',
  'Browser and Node decode agreement (§8) is checked by hand on `/pronunciation-dev`, not here.',
  '',
  '## Native errors under Advanced (tuning set)',
  '',
  'Substitutions the scorer still counts against natives; candidates for the variant table or a tolerance pair, each with Paul\'s yes.',
  '',
  '| Pair | Clips |',
  '| ---- | ----- |',
  ...Object.entries(results[0].confusions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([k, n]) => `| ${k} | ${n} |`),
  '',
];
fs.writeFileSync(args.out, md.join('\n'));
if (args.json)
  writeJson(args.json, {
    checks,
    sets: results.map(({ name, perLanguage, confusions, rows }) => ({
      name,
      perLanguage,
      confusions,
      rows,
    })),
    controls: controlRows,
  });
for (const c of checks)
  console.log(
    `${c.set.padEnd(8)} ${c.name.padEnd(46)} ${pct(c.value).padStart(7)} ${c.threshold.padEnd(8)} ${c.pass === null ? 'n/a' : c.pass ? 'pass' : 'FAIL'}`
  );
console.log(`\nWrote ${args.out}.`);

if (enforce && (failed.length || unmeasured.length)) {
  console.error(`${failed.length} checks below their pass mark.`);
  for (const u of unmeasured) console.error(`Not measured: ${u}.`);
  process.exit(1);
}
if (failed.length || unmeasured.length)
  console.warn(
    `${failed.length} checks below their pass mark, ${unmeasured.length} not measured (not enforced${smoke !== null ? ' on a smoke run' : ''}).`
  );
