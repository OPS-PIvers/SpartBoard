#!/usr/bin/env node
// Usage: function-targets.mjs <deploy-only> [functions-lib-index]; prints deploy-only with only real Cloud Functions named.

import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const deployOnly = process.argv[2] ?? '';
const libIndex = resolve(process.argv[3] ?? 'functions/lib/index.js');

const targets = deployOnly.split(',').filter(Boolean);
const named = targets.filter((t) => t.startsWith('functions:'));
const others = targets.filter((t) => !t.startsWith('functions:'));

function everyFunction(reason) {
  process.stderr.write(`::warning::Deploying every function: ${reason}\n`);
  return ['functions', ...others];
}

let result = targets;
if (named.length > 0 && process.env.DEPLOY_ALL_FUNCTIONS === 'true') {
  result = everyFunction('the shared dev backend was last deployed from another branch or commit');
} else if (named.length > 0) {
  try {
    const exported = createRequire(import.meta.url)(libIndex);
    // The CLI also tells functions from helpers by firebase-functions' __endpoint marker.
    const kept = named.filter((t) => exported[t.slice('functions:'.length)]?.__endpoint);
    const dropped = named.filter((t) => !kept.includes(t));
    if (dropped.length > 0) process.stderr.write(`Not Cloud Functions, skipped: ${dropped.join(',')}\n`);
    result = [...kept, ...others];
  } catch (error) {
    result = everyFunction(`could not load ${libIndex} (${error.message})`);
  }
}
process.stdout.write(`${result.join(',')}\n`);
// Loading the functions can leave SDK handles open.
process.exit(0);
