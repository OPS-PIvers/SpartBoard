#!/usr/bin/env node
// Usage: function-targets.mjs <deploy-only> [functions-lib-index]; prints deploy-only with only real Cloud Functions named,
// each as functions:<codebase>:<name> from functions/codebases.json (run from the repo root).

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  codebaseOf,
  configCodebases,
  parseTarget,
  readManifest,
} from './codebases.mjs';

const deployOnly = process.argv[2] ?? '';
const libIndex = resolve(process.argv[3] ?? 'functions/lib/index.js');

const targets = deployOnly.split(',').filter(Boolean);
const isFunctions = (t) => t === 'functions' || t.startsWith('functions:');
const functionTargets = targets.filter(isFunctions);
const others = targets.filter((t) => !isFunctions(t));

function everyFunction(reason) {
  process.stderr.write(`::warning::Deploying every function: ${reason}\n`);
  return ['functions', ...others];
}

let result = targets;
try {
  const codebases = configCodebases();
  const parsed = functionTargets.map((t) => ({
    target: t,
    ...parseTarget(t, codebases),
  }));
  const named = parsed.filter((p) => p.name);
  const whole = parsed.filter((p) => !p.name).map((p) => p.target);
  const unknown = whole.filter(
    (t) =>
      t !== 'functions' &&
      !codebases.includes(parseTarget(t, codebases).codebase)
  );
  if (unknown.length > 0)
    throw new Error(`no such codebase in firebase.json: ${unknown.join(',')}`);
  if (whole.includes('functions')) {
    result = ['functions', ...others];
  } else if (named.length > 0 && process.env.DEPLOY_ALL_FUNCTIONS === 'true') {
    result = everyFunction(
      'the shared dev backend was last deployed from another branch or commit'
    );
  } else if (named.length > 0) {
    const manifest = readManifest();
    const exported = createRequire(import.meta.url)(libIndex);
    // The CLI also tells functions from helpers by firebase-functions' __endpoint marker.
    const kept = named.filter((p) => exported[p.name]?.__endpoint);
    const dropped = named.filter((p) => !kept.includes(p));
    if (dropped.length > 0)
      process.stderr.write(
        `Not Cloud Functions, skipped: ${dropped.map((p) => p.name).join(',')}\n`
      );
    // A bare or stale codebase would make the CLI plan a delete in the codebase the name left.
    const qualified = kept.map(
      (p) => `functions:${codebaseOf(p.name, manifest)}:${p.name}`
    );
    // None surviving most likely means the marker moved, not that nothing changed.
    result =
      kept.length > 0
        ? [...whole, ...qualified, ...others]
        : everyFunction('no named target is a Cloud Function');
  }
} catch (error) {
  result = functionTargets.length > 0 ? everyFunction(error.message) : targets;
}
process.stdout.write(`${[...new Set(result)].join(',')}\n`);
// Loading the functions can leave SDK handles open.
process.exit(0);
