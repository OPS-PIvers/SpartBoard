#!/usr/bin/env node
// Keeps recent builds' assets live across a deploy so open tabs never hit the stale-chunk reload.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MANIFEST_FILE = 'asset-manifest.json';
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_BUILDS = 40;

/** Keeps previous builds deployed within KEEP_MS (newest first, capped at maxBuilds) and lists their files the new build lacks. */
export function planCarryForward(previous, current, now, maxBuilds = MAX_BUILDS) {
  const prior = Array.isArray(previous?.builds) ? previous.builds : [];
  const kept = prior
    .filter(
      (b) =>
        b &&
        typeof b.id === 'string' &&
        b.id !== current.id &&
        Array.isArray(b.files) &&
        now - Date.parse(b.deployedAt) < KEEP_MS
    )
    .slice(0, maxBuilds - 1);
  const have = new Set(current.files);
  const toFetch = [
    ...new Set(kept.flatMap((b) => b.files).filter((f) => !have.has(f))),
  ];
  const manifest = {
    builds: [
      {
        id: current.id,
        deployedAt: new Date(now).toISOString(),
        files: current.files,
      },
      ...kept,
    ],
  };
  return { toFetch, manifest };
}

/** Rejects names that could escape dist/assets. */
export function isSafeAssetName(name) {
  return (
    typeof name === 'string' &&
    /^[\w.-]+$/.test(name) &&
    name !== '.' &&
    name !== '..'
  );
}

async function fetchPreviousManifest(siteUrl) {
  try {
    const res = await fetch(`${siteUrl}/${MANIFEST_FILE}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('json')) return null;
    return await res.json();
  } catch (err) {
    console.warn(`No previous asset manifest: ${err.message}`);
    return null;
  }
}

async function fetchAsset(siteUrl, name, assetsDir) {
  const res = await fetch(`${siteUrl}/assets/${name}`);
  const type = res.headers.get('content-type') ?? '';
  // Firebase's SPA rewrite answers a missing file with index.html, not a 404.
  if (!res.ok || type.includes('text/html')) return false;
  writeFileSync(
    path.join(assetsDir, name),
    Buffer.from(await res.arrayBuffer())
  );
  return true;
}

async function main() {
  const [siteArg, distArg = 'dist', maxArg] = process.argv.slice(2);
  const maxBuilds = Number.parseInt(maxArg ?? '', 10) || MAX_BUILDS;
  if (!siteArg) {
    console.error(
      'Usage: carryForwardAssets.mjs <live-site-url> [dist-dir] [max-builds]'
    );
    process.exit(1);
  }
  const siteUrl = siteArg.replace(/\/+$/, '');
  const dist = path.resolve(distArg);
  const assetsDir = path.join(dist, 'assets');
  const { buildId } = JSON.parse(
    readFileSync(path.join(dist, 'version.json'), 'utf8')
  );
  const files = readdirSync(assetsDir).filter(isSafeAssetName).sort();
  const previous = await fetchPreviousManifest(siteUrl);
  const { toFetch, manifest } = planCarryForward(
    previous,
    { id: String(buildId ?? 'unknown'), files },
    Date.now(),
    maxBuilds
  );

  const missing = [];
  const queue = toFetch.filter(isSafeAssetName);
  const worker = async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      const ok = await fetchAsset(siteUrl, name, assetsDir).catch(() => false);
      if (!ok) missing.push(name);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  writeFileSync(path.join(dist, MANIFEST_FILE), JSON.stringify(manifest));
  console.log(
    `Carried forward ${toFetch.length - missing.length} asset(s) from ${manifest.builds.length - 1} previous build(s); ${missing.length} unavailable.`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  await main();
}
