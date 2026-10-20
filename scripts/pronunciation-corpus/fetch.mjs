#!/usr/bin/env node
// Fetches the Speak native-speaker corpus (§8) from Lingua Libre into tests/fixtures/pronunciation-corpus.
//
//   node scripts/pronunciation-corpus/fetch.mjs                 pick clips for words.json and download them
//   node scripts/pronunciation-corpus/fetch.mjs --from-manifest re-download exactly the pinned clips, checking SHA-1
//   options: --set main|heldout  --language es|de|en  --per-word 3  --limit N (clips, for a smoke run)  --gap-ms 1100  --max-wait 120
//
// Safe to stop and rerun: finished clips stay in manifest.json and are skipped.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  COMMONS_API,
  LINGUA_LIBRE_SPARQL,
  LL_LANGUAGE,
  LL_NATIVE_LEVEL,
  RateLimitedError,
  clipFileName,
  commonsTitleFromFilePath,
  commonsUploadUrl,
  corpusSet,
  createPoliteClient,
  pickClips,
  readJson,
  sha1,
  toFlac16k,
  writeJson,
} from './lib.mjs';

const { values: args } = parseArgs({
  options: {
    set: { type: 'string', default: 'main' },
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

const set = corpusSet(args.set);
const words = readJson(set.wordsPath);
const languages = args.language ?? Object.keys(words.languages);
const manifest = readJson(set.manifestPath, {
  version: 1,
  source: 'Lingua Libre (https://lingualibre.org) via Wikimedia Commons',
  format: '16 kHz mono 16-bit FLAC',
  clips: [],
});
const save = () => {
  manifest.clips.sort((a, b) => a.id.localeCompare(b.id));
  writeJson(set.manifestPath, manifest);
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
      iiprop: 'sha1|size|url|extmetadata',
      redirects: '1',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl',
      maxlag: '5',
      titles: batch.map((t) => `File:${t}`).join('|'),
    });
    let json;
    for (let attempt = 1; ; attempt++) {
      const res = await client.request(`${COMMONS_API}?${params}`);
      if (!res.ok) throw new Error(`Commons API ${res.status}`);
      json = await res.json();
      // MediaWiki reports replica lag as HTTP 200 with an error body.
      if (json.error?.code === 'maxlag' && attempt < 6) {
        console.log(`  Commons replicas lagging; waiting 10s`);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        continue;
      }
      if (json.error)
        throw new Error(
          `Commons API error: ${json.error.code} ${json.error.info ?? ''}`
        );
      break;
    }
    // Map each returned title back to the one we asked for, through normalization and redirects.
    const asked = new Map(
      (json.query?.normalized ?? []).map((n) => [n.to, n.from])
    );
    for (const r of json.query?.redirects ?? []) {
      asked.set(r.to, asked.get(r.from) ?? r.from);
    }
    for (const page of json.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata ?? {};
      const title = (asked.get(page.title) ?? page.title).replace(/^File:/, '');
      out.set(title, {
        sha1: info.sha1,
        bytes: info.size,
        url: info.url,
        license: meta.LicenseShortName?.value ?? null,
        licenseUrl: meta.LicenseUrl?.value ?? null,
        artist: meta.Artist?.value ? plainText(meta.Artist.value) : null,
      });
    }
  }
  return out;
}

/** Commons HTML metadata to plain text that is safe in a Markdown table cell. */
function plainText(html) {
  let text = html;
  for (let prev = ''; prev !== text; ) {
    prev = text;
    text = text.replace(/<[^>]*>/g, '');
  }
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const cell = (s) => String(s).replace(/[\\|]/g, '\\$&');

async function download(clip) {
  const res = await client.request(clip.url ?? commonsUploadUrl(clip.title));
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
    path.join(set.clipsDir, clip.flac)
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
    const license = c.license
      ? c.licenseUrl
        ? `[${cell(c.license)}](${c.licenseUrl})`
        : cell(c.license)
      : 'see source';
    lines.push(
      `| \`${c.flac}\` | ${cell(c.word)} | ${cell(c.artist ?? c.speakerName ?? c.speaker)} | ${license} | [Commons](${source}) |`
    );
  }
  fs.writeFileSync(set.creditsPath, `${lines.join('\n')}\n`);
}

async function main() {
  const done = new Set(
    manifest.clips
      .filter((c) => fs.existsSync(path.join(set.clipsDir, c.flac)))
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
        // A clip already pinned in the manifest keeps its pin.
        const pinned = manifest.clips.find((c) => c.id === id);
        todo.push({
          id,
          language,
          ...p,
          flac: clipFileName(language, p.word, p.speaker),
          ...(pinned ? { sha1: pinned.sha1 } : {}),
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
  const skipped = [];
  for (const clip of todo) {
    const meta = info.get(clip.title);
    if (!meta) {
      skipped.push(`${clip.title}: not on Commons`);
      continue;
    }
    if (clip.sha1 && meta.sha1 !== clip.sha1) {
      skipped.push(`${clip.title}: Commons file changed since it was pinned`);
      continue;
    }
    let result;
    try {
      result = await download({ ...clip, sha1: meta.sha1, url: meta.url });
    } catch (err) {
      if (err instanceof RateLimitedError) throw err;
      skipped.push(err.message);
      continue;
    }
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
  if (skipped.length) {
    for (const s of skipped) console.warn(`skipped ${s}`);
    process.exitCode = 1;
  }
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
