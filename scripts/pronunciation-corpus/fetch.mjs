#!/usr/bin/env node
// Fetches the Speak native-speaker corpus (§8) from Lingua Libre into tests/fixtures/pronunciation-corpus.
//
//   node scripts/pronunciation-corpus/fetch.mjs                 pick clips for words.json and download them
//   node scripts/pronunciation-corpus/fetch.mjs --from-manifest re-download exactly the pinned clips, checking SHA-1
//   options: --language es|de|en  --per-word 3  --limit N (clips, for a smoke run)  --gap-ms 1100  --max-wait 120
//
// Safe to stop and rerun: finished clips stay in manifest.json and are skipped.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  COMMONS_API,
  FIXTURE_DIR,
  LINGUA_LIBRE_SPARQL,
  LL_LANGUAGE,
  LL_NATIVE_LEVEL,
  MANIFEST_PATH,
  RateLimitedError,
  WORDS_PATH,
  clipFileName,
  commonsTitleFromFilePath,
  commonsUploadUrl,
  createPoliteClient,
  pickClips,
  readJson,
  sha1,
  toFlac16k,
  writeJson,
} from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    language: { type: 'string', multiple: true },
    'per-word': { type: 'string', default: '3' },
    limit: { type: 'string' },
    'gap-ms': { type: 'string', default: '1100' },
    'max-wait': { type: 'string', default: '120' },
    'from-manifest': { type: 'boolean', default: false },
  },
});

const perWord = Number(args['per-word']);
const limit = args.limit ? Number(args.limit) : Infinity;
const client = createPoliteClient({
  minGapMs: Number(args['gap-ms']),
  maxWaitSeconds: Number(args['max-wait']),
});

const words = readJson(WORDS_PATH);
const languages = args.language ?? Object.keys(words.languages);
const manifest = readJson(MANIFEST_PATH, {
  version: 1,
  source: 'Lingua Libre (https://lingualibre.org) via Wikimedia Commons',
  format: '16 kHz mono 16-bit FLAC',
  clips: [],
});
const save = () => {
  manifest.clips.sort((a, b) => a.id.localeCompare(b.id));
  writeJson(MANIFEST_PATH, manifest);
};

/** Every native-speaker recording Lingua Libre has for these words, in one SPARQL query per language. */
async function discover(language) {
  const lang = LL_LANGUAGE[language];
  const list = words.languages[language].words.map((w) =>
    JSON.stringify(w.word)
  );
  const query = `PREFIX ll: <https://lingualibre.org/entity/>
PREFIX llp: <https://lingualibre.org/prop/>
PREFIX llps: <https://lingualibre.org/prop/statement/>
PREFIX llpq: <https://lingualibre.org/prop/qualifier/>
PREFIX lld: <https://lingualibre.org/prop/direct/>
SELECT ?word ?file ?speaker ?speakerName ?residence WHERE {
  VALUES ?word { ${list.join(' ')} }
  ?rec lld:P2 ll:Q2 ; lld:P4 ll:${lang} ; lld:P7 ?word ; lld:P3 ?file ; lld:P5 ?speaker .
  ?speaker llp:P4 ?st . ?st llps:P4 ll:${lang} ; llpq:P16 ll:${LL_NATIVE_LEVEL} .
  OPTIONAL { ?speaker lld:P11 ?speakerName }
  OPTIONAL { ?speaker lld:P14 ?residence }
}`;
  const res = await client.request(
    `${LINGUA_LIBRE_SPARQL}?query=${encodeURIComponent(query)}`,
    { headers: { Accept: 'application/sparql-results+json' } }
  );
  if (!res.ok) throw new Error(`Lingua Libre SPARQL ${res.status}`);
  const json = await res.json();
  return json.results.bindings.map((b) => ({
    word: b.word.value,
    title: commonsTitleFromFilePath(b.file.value),
    speaker: b.speaker.value.split('/').pop(),
    speakerName: b.speakerName?.value ?? null,
    residence: b.residence?.value?.split('/').pop() ?? null,
  }));
}

/** SHA-1, size, licence and author for up to 50 Commons files per request. */
async function commonsInfo(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'imageinfo',
      iiprop: 'sha1|size|extmetadata',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl',
      maxlag: '5',
      titles: batch.map((t) => `File:${t}`).join('|'),
    });
    const res = await client.request(`${COMMONS_API}?${params}`);
    if (!res.ok) throw new Error(`Commons API ${res.status}`);
    const json = await res.json();
    const normalized = new Map(
      (json.query?.normalized ?? []).map((n) => [n.to, n.from])
    );
    for (const page of json.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata ?? {};
      const title = (normalized.get(page.title) ?? page.title).replace(
        /^File:/,
        ''
      );
      out.set(title, {
        sha1: info.sha1,
        bytes: info.size,
        license: meta.LicenseShortName?.value ?? null,
        licenseUrl: meta.LicenseUrl?.value ?? null,
        artist: meta.Artist?.value?.replace(/<[^>]+>/g, '').trim() ?? null,
      });
    }
  }
  return out;
}

async function download(clip) {
  const res = await client.request(commonsUploadUrl(clip.title));
  if (!res.ok) throw new Error(`${clip.title}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const got = sha1(bytes);
  if (clip.sha1 && got !== clip.sha1) {
    throw new Error(
      `${clip.title}: SHA-1 ${got} does not match pinned ${clip.sha1}`
    );
  }
  const flac = await toFlac16k(
    bytes,
    path.join(FIXTURE_DIR, 'clips', clip.flac)
  );
  return { sha1: got, bytes: bytes.length, flacSha1: sha1(flac) };
}

function writeCredits() {
  const lines = [
    '# Speak corpus credits',
    '',
    'Native-speaker recordings from [Lingua Libre](https://lingualibre.org), hosted on Wikimedia Commons.',
    'Each clip was converted to 16 kHz mono FLAC for testing; no other change was made.',
    'Generated by `scripts/pronunciation-corpus/fetch.mjs`; do not edit by hand.',
    '',
    '| Clip | Word | Speaker | Licence | Source |',
    '| ---- | ---- | ------- | ------- | ------ |',
  ];
  for (const c of manifest.clips) {
    const source = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(c.title.replace(/ /g, '_'))}`;
    lines.push(
      `| \`${c.flac}\` | ${c.word} | ${c.artist ?? c.speakerName ?? c.speaker} | ${c.license ?? 'see source'} | [Commons](${source}) |`
    );
  }
  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'CREDITS.md'),
    `${lines.join('\n')}\n`
  );
}

async function main() {
  const done = new Set(
    manifest.clips
      .filter((c) => fs.existsSync(path.join(FIXTURE_DIR, 'clips', c.flac)))
      .map((c) => c.id)
  );
  let todo;
  if (args['from-manifest']) {
    todo = manifest.clips.filter(
      (c) => languages.includes(c.language) && !done.has(c.id)
    );
  } else {
    todo = [];
    for (const language of languages) {
      const rows = await discover(language);
      const picked = pickClips(rows, perWord);
      const missing = words.languages[language].words
        .map((w) => w.word)
        .filter((w) => !picked.some((p) => p.word === w));
      console.log(
        `${language}: ${picked.length} clips from ${new Set(picked.map((p) => p.speaker)).size} native speakers` +
          (missing.length ? `; no recording for ${missing.join(', ')}` : '')
      );
      for (const p of picked) {
        const id = `${language}/${p.word}/${p.speaker}`;
        if (done.has(id)) continue;
        todo.push({
          id,
          language,
          ...p,
          flac: clipFileName(language, p.word, p.speaker),
        });
      }
    }
  }
  todo = todo.slice(0, limit);
  if (todo.length === 0) {
    console.log('Nothing to fetch.');
    writeCredits();
    return;
  }

  const info = await commonsInfo(todo.map((c) => c.title));
  let fetched = 0;
  for (const clip of todo) {
    const meta = info.get(clip.title);
    if (!meta) {
      console.warn(`skip ${clip.title}: not on Commons`);
      continue;
    }
    if (clip.sha1 && meta.sha1 !== clip.sha1) {
      console.warn(
        `skip ${clip.title}: Commons file changed since it was pinned`
      );
      continue;
    }
    const result = await download({ ...clip, sha1: meta.sha1 });
    const entry = { ...clip, ...meta, ...result };
    manifest.clips = manifest.clips
      .filter((c) => c.id !== entry.id)
      .concat(entry);
    save();
    fetched++;
    console.log(`  ${fetched}/${todo.length} ${clip.flac}`);
  }
  writeCredits();
  console.log(
    `Fetched ${fetched} clips; manifest has ${manifest.clips.length}.`
  );
}

try {
  await main();
} catch (err) {
  save();
  writeCredits();
  if (err instanceof RateLimitedError) {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
}
