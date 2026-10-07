#!/usr/bin/env node
// Root app ESLint pass: lints everything, or with --shard=I/N one size-balanced slice of the same files.
import { spawnSync, execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Splits sorted paths into `count` contiguous slices of roughly equal total size. */
export function partition(files, count, sizeOf) {
  const sorted = [...files].sort();
  const total = sorted.reduce((sum, f) => sum + sizeOf(f), 0);
  const slices = Array.from({ length: count }, () => []);
  let index = 0;
  let filled = 0;
  for (const file of sorted) {
    while (index < count - 1 && filled >= (total * (index + 1)) / count) index++;
    slices[index].push(file);
    filled += sizeOf(file);
  }
  return slices;
}

export function parseShard(arg) {
  const match = /^--shard=(\d+)\/(\d+)$/.exec(arg);
  const [index, count] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
  if (count < 1 || index < 1 || index > count) {
    throw new Error(`Invalid shard ${arg}: expected --shard=I/N with 1 <= I <= N`);
  }
  return { index, count };
}

/** Tracked files `eslint .` would lint: ESLint reports unmatched and ignored files alike as ignored. */
export async function lintableFiles() {
  const { ESLint } = await import('eslint');
  const eslint = new ESLint();
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const kept = [];
  for (const file of tracked) {
    if (!(await eslint.isPathIgnored(file))) kept.push(file);
  }
  return kept;
}

async function main() {
  const args = process.argv.slice(2);
  const shard = args[0]?.startsWith('--shard') ? parseShard(args.shift()) : null;
  let targets = ['.'];
  if (shard) {
    const files = await lintableFiles();
    targets = partition(files, shard.count, (f) => statSync(f).size)[shard.index - 1];
    console.log(`Shard ${shard.index}/${shard.count}: ${targets.length} of ${files.length} files`);
    if (targets.length === 0) return;
  }
  // `eslint/bin` is not in the package's exports map, so resolve it from the main entry (lib/api.js).
  const eslintApi = createRequire(import.meta.url).resolve('eslint');
  const eslintBin = join(dirname(eslintApi), '../bin/eslint.js');
  const result = spawnSync(
    process.execPath,
    [eslintBin, ...targets, '--max-warnings', '0', ...args],
    { stdio: 'inherit' }
  );
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
