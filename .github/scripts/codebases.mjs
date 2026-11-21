#!/usr/bin/env node
// Function codebases from functions/codebases.json and firebase.json; CLI: qualify <names> | whole <deploy-only> | list.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_CODEBASE = 'default';
const NAME = /^[a-z][a-z0-9_-]*$/;

// name -> codebase, for every name the manifest lists.
export function readManifest(root = '.') {
  const file = join(resolve(root), 'functions', 'codebases.json');
  const owner = new Map();
  if (!existsSync(file)) return owner;
  const parsed = JSON.parse(readFileSync(file, 'utf-8'));
  const codebases = parsed?.codebases;
  if (!codebases || typeof codebases !== 'object' || Array.isArray(codebases)) {
    throw new Error('functions/codebases.json has no "codebases" object');
  }
  for (const [codebase, names] of Object.entries(codebases)) {
    if (!NAME.test(codebase) || codebase === DEFAULT_CODEBASE)
      throw new Error(`bad codebase name '${codebase}'`);
    if (!Array.isArray(names))
      throw new Error(`codebase '${codebase}' is not a list`);
    for (const name of names) {
      if (owner.has(name))
        throw new Error(
          `${name} is in both ${owner.get(name)} and ${codebase}`
        );
      owner.set(name, codebase);
    }
  }
  return owner;
}

// Codebase names firebase.json deploys, in its order.
export function configCodebases(root = '.') {
  const file = join(resolve(root), 'firebase.json');
  if (!existsSync(file)) return [DEFAULT_CODEBASE];
  const functions = JSON.parse(readFileSync(file, 'utf-8')).functions;
  if (!functions) return [];
  const list = Array.isArray(functions) ? functions : [functions];
  return [...new Set(list.map((c) => c.codebase ?? DEFAULT_CODEBASE))];
}

export const codebaseOf = (name, manifest) =>
  manifest.get(name) ?? DEFAULT_CODEBASE;

// functions:<codebase>:<name> for each name.
export const qualify = (names, manifest) =>
  names.map((name) => `functions:${codebaseOf(name, manifest)}:${name}`);

// A functions target split the way the CLI's parseFunctionSelector reads it: { codebase, name? }.
export function parseTarget(target, codebases) {
  if (target === 'functions') return { all: true };
  const [, first, second] = target.split(':');
  if (second !== undefined) return { codebase: first, name: second };
  if (codebases.includes(first)) return { codebase: first };
  return { codebase: DEFAULT_CODEBASE, name: first };
}

// True when a deploy of these targets can delete functions: all codebases or a whole one.
export function deploysWholeCodebase(deployOnly, codebases) {
  return deployOnly
    .split(',')
    .filter((t) => t === 'functions' || t.startsWith('functions:'))
    .some((t) => !parseTarget(t, codebases).name);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command, arg = ''] = process.argv.slice(2);
  if (command === 'qualify') {
    const names = arg.split(',').filter(Boolean);
    process.stdout.write(`${qualify(names, readManifest()).join(',')}\n`);
  } else if (command === 'list') {
    process.stdout.write(`${configCodebases().join('\n')}\n`);
  } else if (command === 'whole') {
    process.stdout.write(`${deploysWholeCodebase(arg, configCodebases())}\n`);
  } else {
    process.stderr.write(
      'usage: codebases.mjs qualify <name,...> | whole <deploy-only> | list\n'
    );
    process.exit(2);
  }
}
