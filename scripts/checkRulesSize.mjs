#!/usr/bin/env node
/**
 * Guard firestore.rules against Firebase's compiled-ruleset size cap.
 *
 * BACKGROUND: the Firebase Rules API rejects a ruleset whose SOURCE TEXT
 * exceeds 256 KiB (262144 bytes) with a bare
 * `HTTP Error: 400, Request contains an invalid argument` at the
 * `firebaserules.googleapis.com/v1/projects/*:test` compile step — no mention
 * of size. Comments count toward the cap.
 *
 * Nothing else in the pipeline catches this: the Firestore emulator that backs
 * `pnpm run test:rules` does NOT enforce the cap, so the full rules suite goes
 * green on a file that the real API will refuse. The failure therefore lands in
 * the deploy job on `main`/`dev-*` AFTER merge, where it also blocks the
 * indexes, Storage rules, and Cloud Functions bundled into the same deploy.
 *
 * That is exactly how #2915 shipped: it added 569 bytes to a file already 92
 * bytes under the cap, and the dev-paul deploy failed on a green PR. It had
 * happened once before (#2089, which reclaimed headroom by slimming comments).
 *
 * Since PR 0 of docs/plans/shipped/QUIZ_QUESTION_BANKS_AND_LEARNING_TARGETS.md, the
 * deploy script strips full-line comments and blank lines first
 * (scripts/stripRulesComments.mjs), so the cap applies to the STRIPPED
 * text. This guard measures that same stripped text; the source size is
 * reported for reference only.
 *
 * This check is byte-exact and needs no emulator or network, so it runs in
 * `validate` and ahead of `test:rules`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripRulesComments } from './stripRulesComments.mjs';

const MAX_BYTES = 262144; // 256 KiB, enforced by the Firebase Rules API
const WARN_RATIO = 0.9;

/**
 * The binding limit in practice is the OTHER one: Firestore caps the COMPILED
 * ruleset at 250 KB, separately from the 256 KiB source cap above, and enforces
 * it only when the ruleset is RELEASED — never at the `:test` compile or at
 * ruleset creation, both of which return 200. The rejection is a bare
 * `400 INVALID_ARGUMENT` naming no field, and firebase-tools hides even that
 * behind a 409, so the deploy log reads like a harmless race while nothing
 * ships.
 *
 * The Firestore emulator jar carries Firebase's own rules compiler, and
 * scripts/rulesAst/RulesAst.java measures its AST with source positions
 * removed. That number matches the 2026-09-21 outage: 249350 released
 * (081f914), 249568 was refused (56d0070), and every other commit that month
 * sorts the same way. Comments and whitespace add nothing to it; expression
 * nodes and identifier lengths are what count.
 */
const COMPILED_CLIFF = 249350;
const COMPILED_WARN_RATIO = 0.96;

const RULES_PATH = fileURLToPath(
  new URL('../firestore.rules', import.meta.url)
);

function findEmulatorJar() {
  const fromEnv = process.env.FIRESTORE_EMULATOR_JAR;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  const dir = path.join(homedir(), '.cache', 'firebase', 'emulators');
  if (!existsSync(dir)) return null;
  const jars = readdirSync(dir)
    .filter((f) => /^cloud-firestore-emulator-v[\d.]+\.jar$/.test(f))
    .sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  return jars.length ? path.join(dir, jars[jars.length - 1]) : null;
}

function measureCompiled() {
  const jar = findEmulatorJar();
  if (!jar) return null;
  const tool = fileURLToPath(new URL('./rulesAst/RulesAst.java', import.meta.url));
  try {
    const out = execFileSync('java', ['-cp', jar, tool, 'size', RULES_PATH], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return Number(out.trim().split('\n').pop());
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    console.error(`\nfirestore.rules failed to compile:\n${err.stderr ?? err}\n`);
    process.exit(1);
  }
}

const source = readFileSync(RULES_PATH, 'utf8');
const sourceBytes = Buffer.byteLength(source, 'utf8');
const bytes = Buffer.byteLength(stripRulesComments(source), 'utf8');
const pct = ((bytes / MAX_BYTES) * 100).toFixed(1);

if (bytes > MAX_BYTES) {
  const over = bytes - MAX_BYTES;
  const commentBytes = readFileSync(RULES_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('//'))
    .reduce((sum, line) => sum + Buffer.byteLength(line, 'utf8') + 1, 0);
  console.error(
    `\nfirestore.rules is ${bytes} bytes — ${over} OVER the ${MAX_BYTES}-byte ` +
      `(256 KiB) Firebase ruleset cap.\n\n` +
      `The deploy will fail with "HTTP Error: 400, Request contains an invalid ` +
      `argument" at the rules compile step. The emulator does not enforce this, ` +
      `so test:rules will still pass.\n\n` +
      `Comments count toward the cap and currently account for ${commentBytes} ` +
      `bytes. Condense comment blocks to reclaim headroom (see #2089 and #2915) ` +
      `— that is a comments-only change with no rule-logic impact.\n`
  );
  process.exit(1);
}

const compiled = measureCompiled();

if (compiled === null) {
  const why =
    'compiled rules size not measured: needs `java` (JDK 21) and the ' +
    'Firestore emulator jar (`pnpm exec firebase setup:emulators:firestore`).';
  if (process.env.CI) {
    console.error(`\n${why}\n`);
    process.exit(1);
  }
  console.warn(`warning: ${why}`);
} else if (compiled > COMPILED_CLIFF) {
  console.error(
    `\nfirestore.rules compiles to ${compiled} bytes, past the ` +
      `${COMPILED_CLIFF}-byte mark where Firestore stops accepting the ` +
      `compiled ruleset.\n\n` +
      `The rules will compile and upload fine and then be refused at release ` +
      `with "400 Request contains an invalid argument", which firebase-tools ` +
      `reports as a 409. test:rules will still pass — the emulator does not ` +
      `enforce this.\n\n` +
      `Compiled size counts expression nodes, not bytes, so comments do not ` +
      `matter: use the incoming()/existing()/unchanged()/isStr() shorthands ` +
      `(node scripts/rulesAst/applyShorthands.mjs) or factor repeated ` +
      `conditions into functions.\n`
  );
  process.exit(1);
} else if (compiled > COMPILED_CLIFF * COMPILED_WARN_RATIO) {
  console.warn(
    `warning: firestore.rules compiles to ${compiled} bytes, within ` +
      `${COMPILED_CLIFF - compiled} bytes of the compiled-ruleset limit that ` +
      `blocks releases. Factor conditions into functions before adding rules.`
  );
} else {
  console.log(
    `firestore.rules compiles to ${compiled} bytes ` +
      `(${COMPILED_CLIFF - compiled} under the ${COMPILED_CLIFF}-byte release limit)`
  );
}

if (bytes > MAX_BYTES * WARN_RATIO) {
  console.warn(
    `warning: firestore.rules is ${bytes} bytes stripped (${pct}% of the ` +
      `${MAX_BYTES}-byte cap, ${MAX_BYTES - bytes} left). Reclaim headroom before ` +
      `it blocks a deploy.`
  );
} else {
  console.log(
    `firestore.rules: ${bytes} bytes stripped (${pct}% of cap, ` +
      `${MAX_BYTES - bytes} free; ${sourceBytes} bytes with comments)`
  );
}
