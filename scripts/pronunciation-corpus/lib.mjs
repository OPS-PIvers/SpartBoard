// Shared helpers for the Speak corpus scripts (docs/multilingual-pronunciation-engine.md §8).
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
export const SCRIPT_DIR = path.join(ROOT, 'scripts/pronunciation-corpus');
export const FIXTURE_DIR = path.join(
  ROOT,
  'tests/fixtures/pronunciation-corpus'
);
export const MANIFEST_PATH = path.join(FIXTURE_DIR, 'manifest.json');
export const WORDS_PATH = path.join(SCRIPT_DIR, 'words.json');
export const VOICE_REFS_PATH = path.join(FIXTURE_DIR, 'voice-refs.json');

/** The tuning corpus (`main`) or the held-out one S11d confirms the cut-offs on (`heldout`); never tune on `heldout`. */
export const CORPUS_SETS = ['main', 'heldout'];

export function corpusSet(name = 'main') {
  if (!CORPUS_SETS.includes(name)) throw new Error(`Unknown corpus set ${name}`);
  const dir = name === 'main' ? FIXTURE_DIR : path.join(FIXTURE_DIR, name);
  return {
    name,
    wordsPath:
      name === 'main' ? WORDS_PATH : path.join(SCRIPT_DIR, `words.${name}.json`),
    dir,
    manifestPath: path.join(dir, 'manifest.json'),
    clipsDir: path.join(dir, 'clips'),
    creditsPath: path.join(dir, 'CREDITS.md'),
  };
}

// Wikimedia's User-Agent policy asks for a tool name and a contact.
export const USER_AGENT =
  'SpartBoardCorpusFetch/1.0 (https://github.com/OPS-PIvers/SpartBoard; paul.ivers@orono.k12.mn.us) node-fetch';

export const LINGUA_LIBRE_SPARQL =
  'https://lingualibre.org/bigdata/namespace/wdq/sparql';
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

/** Lingua Libre item ids for each corpus language. */
export const LL_LANGUAGE = { es: 'Q386', de: 'Q24', en: 'Q22' };
export const LL_NATIVE_LEVEL = 'Q15';

export const sha1 = (buf) => createHash('sha1').update(buf).digest('hex');
export const md5 = (buf) => createHash('md5').update(buf).digest('hex');

export const readJson = (p, fallback) =>
  fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;

export function writeJson(p, value) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, p);
}

/** Commons file title ("LL-Q1321 (spa)-X-perro.wav") from a Special:FilePath URL. */
export function commonsTitleFromFilePath(url) {
  const name = decodeURIComponent(url.split('/Special:FilePath/')[1] ?? '');
  if (!name) throw new Error(`Not a Special:FilePath URL: ${url}`);
  return name.replace(/_/g, ' ');
}

/** Direct upload.wikimedia.org URL, which skips the Special:FilePath redirect (one request instead of two). */
export function commonsUploadUrl(title) {
  const name = title.replace(/ /g, '_');
  const h = md5(Buffer.from(name, 'utf8'));
  return `https://upload.wikimedia.org/wikipedia/commons/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(name)}`;
}

/** Safe, stable fixture file name for a clip. */
export function clipFileName(language, word, speakerId) {
  const slug = word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return `${language}/${slug}-${speakerId}.flac`;
}

/** Up to perWord speakers per word; speakers who recorded more of the list come first, so the corpus stays consistent. */
export function pickClips(rows, perWordLimit) {
  const coverage = new Map();
  for (const r of rows) {
    const set = coverage.get(r.speaker) ?? new Set();
    set.add(r.word);
    coverage.set(r.speaker, set);
  }
  const rank = (s) => coverage.get(s)?.size ?? 0;
  const byWord = new Map();
  for (const r of rows) {
    const list = byWord.get(r.word) ?? [];
    if (!list.some((x) => x.speaker === r.speaker)) list.push(r);
    byWord.set(r.word, list);
  }
  const picked = [];
  for (const [, list] of [...byWord].sort(([a], [b]) => a.localeCompare(b))) {
    list.sort(
      (a, b) =>
        rank(b.speaker) - rank(a.speaker) || a.speaker.localeCompare(b.speaker)
    );
    picked.push(...list.slice(0, perWordLimit));
  }
  return picked;
}

export class RateLimitedError extends Error {
  constructor(url, waitSeconds) {
    super(
      `Wikimedia asked us to wait ${waitSeconds}s before ${url}. Stopping here; rerun later and the fetch resumes from manifest.json.`
    );
    this.name = 'RateLimitedError';
    this.waitSeconds = waitSeconds;
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One request at a time, a minimum gap, Retry-After honoured and exponential backoff on 429/503. */
export function createPoliteClient({
  minGapMs = 1100,
  maxAttempts = 6,
  maxWaitSeconds = 120,
  log = console.log,
  fetchImpl = fetch,
  sleep = delay,
  now = Date.now,
} = {}) {
  let last = 0;
  let queue = Promise.resolve();

  async function attempt(url, init) {
    let backoff = 5;
    for (let i = 1; i <= maxAttempts; i++) {
      const gap = last + minGapMs - now();
      if (gap > 0) await sleep(gap);
      last = now();
      const res = await fetchImpl(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...(init?.headers ?? {}) },
      });
      if (res.status !== 429 && res.status !== 503) return res;
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : backoff;
      if (wait > maxWaitSeconds || i === maxAttempts) {
        throw new RateLimitedError(url, wait);
      }
      log(`  ${res.status}; waiting ${wait}s (attempt ${i}/${maxAttempts})`);
      await sleep(wait * 1000);
      backoff = Math.min(backoff * 2, maxWaitSeconds);
    }
    throw new RateLimitedError(url, backoff);
  }

  return {
    request(url, init) {
      const run = queue.then(() => attempt(url, init));
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

export function run(cmd, args, { input, encoding } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `${cmd} exited ${code}: ${Buffer.concat(err).toString().slice(-800)}`
          )
        );
        return;
      }
      const buf = Buffer.concat(out);
      resolve(encoding ? buf.toString(encoding) : buf);
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

const BITEXACT = [
  '-map_metadata',
  '-1',
  '-fflags',
  '+bitexact',
  '-flags:a',
  '+bitexact',
];

/** Any ffmpeg-readable audio to 16 kHz mono 16-bit FLAC, written without timestamps so reruns are byte-identical. */
export async function toFlac16k(inputBytes, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const flac = await run(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-sample_fmt',
      's16',
      ...BITEXACT,
      '-compression_level',
      '8',
      '-f',
      'flac',
      'pipe:1',
    ],
    { input: inputBytes }
  );
  fs.writeFileSync(outPath, flac);
  return flac;
}

/** Raw float32 PCM (16 kHz mono) to FLAC, for the synthetic controls. */
export async function pcmToFlac16k(samples, outPath) {
  const bytes = Buffer.from(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const flac = await run(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'f32le',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-i',
      'pipe:0',
      '-sample_fmt',
      's16',
      ...BITEXACT,
      '-compression_level',
      '8',
      '-f',
      'flac',
      'pipe:1',
    ],
    { input: bytes }
  );
  fs.writeFileSync(outPath, flac);
  return flac;
}

/** A FLAC fixture decoded to the model's 16 kHz mono float32. */
export async function readClip16k(flacPath) {
  const raw = await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    flacPath,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'f32le',
    'pipe:1',
  ]);
  return new Float32Array(
    raw.buffer,
    raw.byteOffset,
    raw.byteLength / 4
  ).slice();
}

/** Loads a repo TypeScript module (with the `@/` alias) from a plain Node script. */
export async function importTs(relPath) {
  const { runnerImport } = await import('vite');
  const { module } = await runnerImport(path.join(ROOT, relPath), {
    configFile: false,
    logLevel: 'error',
    resolve: { alias: { '@': ROOT } },
  });
  return module;
}

/** A word's espeak references as one string, so stale voice references are noticed. */
export const espeakKey = (entry) =>
  Object.entries(entry.refs ?? {})
    .filter(([, r]) => r.tokens)
    .map(([d, r]) => `${d}:${r.tokens.join(' ')}:${r.stress.join(',')}`)
    .join('|');

export const MODEL_CACHE_DIR =
  process.env.PRONUNCIATION_GATE_CACHE ??
  path.join(os.homedir(), '.cache/spartboard-pronunciation');

/** The pinned model as an onnxruntime session, downloaded once to the cache and checked by size and MD5. */
export async function createModelSession(model) {
  const modelPath =
    process.env.PRONUNCIATION_MODEL_PATH ??
    path.join(MODEL_CACHE_DIR, `${model.id}.onnx`);
  if (!fs.existsSync(modelPath)) {
    console.log(`Downloading ${model.huggingFaceUrl}`);
    const res = await fetch(model.huggingFaceUrl);
    if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`);
    fs.mkdirSync(path.dirname(modelPath), { recursive: true });
    fs.writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = fs.readFileSync(modelPath);
  const digest = md5(bytes);
  if (bytes.length !== model.bytes || !digest.startsWith(model.md5Prefix)) {
    throw new Error(
      `${modelPath} is not the pinned model (size ${bytes.length}, md5 ${digest.slice(0, 12)})`
    );
  }
  const ort = await import('onnxruntime-web-1-31');
  ort.env.wasm.numThreads = Math.min(4, os.availableParallelism());
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
  });
  return {
    /** Raw logits for one normalized 16 kHz take. */
    async run(input) {
      const feeds = {
        [session.inputNames[0]]: new ort.Tensor('float32', input, [
          1,
          input.length,
        ]),
      };
      if (session.inputNames.includes('attention_mask')) {
        feeds.attention_mask = new ort.Tensor(
          'int64',
          new BigInt64Array(input.length).fill(1n),
          [1, input.length]
        );
      }
      const out = (await session.run(feeds))[session.outputNames[0]];
      const [, frames, size] = out.dims;
      return { data: out.data, frames, size };
    },
  };
}
