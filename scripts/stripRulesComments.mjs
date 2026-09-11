#!/usr/bin/env node
/**
 * Strip full-line comments and blank lines from firestore.rules for deploy.
 *
 * WHY: the Firebase Rules API caps a ruleset's SOURCE TEXT at 256 KiB and
 * comments count. firestore.rules carries ~97 KB of security rationale that
 * is worth keeping in git but worthless to the compiler. Slimming the source
 * by hand bought headroom twice (#2089, #2924) and it regrew within months.
 * Stripping at deploy time keeps the documented source and gives the
 * compiled ruleset the full cap for logic.
 *
 * WHAT IS REMOVED: only lines whose first non-blank characters are `//`, and
 * lines that are entirely whitespace. Trailing inline comments are left alone
 * so no `//` inside a string literal (URLs, regexes) can ever be touched.
 * Every surviving line is byte-identical to the source line, which is the
 * verification the repo has always used for comments-only rules changes.
 *
 * WHERE IT RUNS: .github/scripts/firebase-deploy-with-retry.sh rewrites
 * firestore.rules in place right before `firebase deploy` (the CI checkout is
 * disposable, and the rewrite is idempotent across retries). Rules tests keep
 * loading the commented source; comments never change rule semantics.
 * scripts/checkRulesSize.mjs measures the stripped size, since that is what
 * the API sees.
 *
 * Usage: node scripts/stripRulesComments.mjs [path] [--write]
 *   default path: firestore.rules. Without --write, prints the stripped size.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function stripRulesComments(source) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return (
    source
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed !== '' && !trimmed.startsWith('//');
      })
      .join(eol) + eol
  );
}

// Lines that survive must be exactly the source's non-comment, non-blank lines.
export function assertOnlyCommentsRemoved(source, stripped) {
  const expected = source
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('//'));
  const actual = stripped.split(/\r?\n/).filter((l) => l !== '');
  if (expected.length !== actual.length) {
    throw new Error(
      `strip changed line count: ${expected.length} expected, ${actual.length} got`
    );
  }
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) {
      throw new Error(`strip altered a code line at index ${i}`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const file = args.find((a) => !a.startsWith('--')) ?? 'firestore.rules';
  const target = path.resolve(file);
  const source = readFileSync(target, 'utf8');
  const stripped = stripRulesComments(source);
  assertOnlyCommentsRemoved(source, stripped);
  const before = Buffer.byteLength(source, 'utf8');
  const after = Buffer.byteLength(stripped, 'utf8');
  if (write) {
    writeFileSync(target, stripped);
    console.log(
      `${file}: stripped comments in place, ${before} -> ${after} bytes`
    );
  } else {
    console.log(`${file}: ${before} bytes source, ${after} bytes stripped`);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  main();
}
