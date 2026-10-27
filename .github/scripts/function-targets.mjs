#!/usr/bin/env node
// Drop `functions:<name>` targets that are not Cloud Functions (test hooks and helpers
// index.ts also exports): the CLI fails a deploy whose --only names a non-function.
//
// Usage: function-targets.mjs <deploy-only> [functions-lib-index]
// Prints the deploy-only list to use. If the built functions cannot be loaded, named
// function targets widen to `functions` so nothing is skipped.

import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const deployOnly = process.argv[2] ?? '';
const libIndex = resolve(process.argv[3] ?? 'functions/lib/index.js');

const targets = deployOnly.split(',').filter(Boolean);
const named = targets.filter((t) => t.startsWith('functions:'));

let result = targets;
if (named.length > 0) {
  const others = targets.filter((t) => !t.startsWith('functions:'));
  try {
    const exported = createRequire(import.meta.url)(libIndex);
    // firebase-functions marks every trigger with __endpoint; the CLI discovers functions the same way.
    const kept = named.filter((t) => exported[t.slice('functions:'.length)]?.__endpoint);
    const dropped = named.filter((t) => !kept.includes(t));
    if (dropped.length > 0) process.stderr.write(`Not Cloud Functions, skipped: ${dropped.join(',')}\n`);
    result = [...kept, ...others];
  } catch (error) {
    process.stderr.write(`Could not load ${libIndex} (${error.message}); deploying every function.\n`);
    result = ['functions', ...others];
  }
}
process.stdout.write(`${result.join(',')}\n`);
// Loading the functions can leave SDK handles open.
process.exit(0);
