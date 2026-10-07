#!/usr/bin/env node
// Runs inside `firebase emulators:exec` for `pnpm run test:rules`; RULES_SHARD=I/N runs one Vitest shard (CI merges the counts).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Commands for one run: the size check once, Vitest, and the count guard only when unsharded. */
export function rulesTestCommands(shardEnv) {
  const match = /^(\d+)\/(\d+)$/.exec(shardEnv ?? '');
  if (shardEnv && !match) {
    throw new Error(`Invalid RULES_SHARD ${shardEnv}: expected I/N`);
  }
  const index = match ? Number(match[1]) : null;
  const vitest = [
    'pnpm',
    'exec',
    'vitest',
    'run',
    '--config',
    'vitest.rules.config.ts',
    '--reporter=default',
    '--reporter=json',
    `--outputFile=.vitest-reports/${index ? `rules-shard-${index}` : 'rules'}.json`,
    ...(match ? [`--shard=${shardEnv}`] : []),
  ];
  return [
    ...(index === null || index === 1 ? [['node', 'scripts/checkRulesSize.mjs']] : []),
    vitest,
    ...(match ? [] : [['node', 'scripts/checkTestCounts.mjs', 'rules']]),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [cmd, ...args] of rulesTestCommands(process.env.RULES_SHARD)) {
    const result = spawnSync(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
}
