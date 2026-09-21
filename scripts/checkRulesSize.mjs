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
 * Since PR 0 of docs/plans/QUIZ_QUESTION_BANKS_AND_LEARNING_TARGETS.md, the
 * deploy script strips full-line comments and blank lines first
 * (scripts/stripRulesComments.mjs), so the cap applies to the STRIPPED
 * text. This guard measures that same stripped text; the source size is
 * reported for reference only.
 *
 * This check is byte-exact and needs no emulator or network, so it runs in
 * `validate` and ahead of `test:rules`.
 */

import { readFileSync } from 'node:fs';
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
 * Compiled size cannot be measured without releasing, so this is an empirical
 * proxy measured on 2026-09-21, when it stopped every deploy for ten hours:
 * 182349 stripped bytes released (3dd8514a); 182493 was refused (56d0070b).
 * Anything at or above the smaller number is assumed to be over.
 */
const COMPILED_CLIFF_BYTES = 182349;
const COMPILED_WARN_RATIO = 0.98;

const RULES_PATH = fileURLToPath(
  new URL('../firestore.rules', import.meta.url)
);

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

if (bytes >= COMPILED_CLIFF_BYTES) {
  console.error(
    `\nfirestore.rules is ${bytes} bytes stripped, at or past the ` +
      `${COMPILED_CLIFF_BYTES}-byte mark where Firestore stops accepting the ` +
      `compiled ruleset.\n\n` +
      `The rules will compile and upload fine and then be refused at release ` +
      `with "400 Request contains an invalid argument", which firebase-tools ` +
      `reports as a 409. test:rules will still pass — the emulator does not ` +
      `enforce this.\n\n` +
      `Compiled size tracks the number of expressions, not bytes, so condensing ` +
      `comments will not help here: remove dead rules or factor repeated ` +
      `conditions into functions (see the optString/optMap helpers).\n`
  );
  process.exit(1);
}

if (bytes > COMPILED_CLIFF_BYTES * COMPILED_WARN_RATIO) {
  console.warn(
    `warning: firestore.rules is ${bytes} bytes stripped, within ` +
      `${COMPILED_CLIFF_BYTES - bytes} bytes of the compiled-ruleset limit that ` +
      `blocks releases. Factor conditions into functions before adding rules.`
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
