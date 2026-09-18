/**
 * Regression test: every Firestore rules suite needs its own emulator project.
 *
 * Bug: `firestore-rules-organizations.test.ts`,
 * `firestore-rules-external-user.test.ts` and
 * `plcInvitationEmailBound.test.ts` all declared
 * `PROJECT_ID = 'spartboard-rules-test'`. Vitest runs test FILES in parallel,
 * and every rules suite calls `testEnv.clearFirestore()` in `beforeEach` —
 * which wipes the whole emulator project, not just that file's documents. Two
 * suites on one project id therefore delete each other's seed data mid-test,
 * so a random handful of cases fail with PERMISSION_DENIED on member/admin
 * lookups that should have resolved. Each file passed in isolation, and the
 * failing subset changed every run, so the red CI looked like a rules bug.
 *
 * Fix: the three files got distinct project ids. Nothing structural stopped
 * the collision — the ids are hand-written string literals in 72 files — so
 * this test pins uniqueness rather than trusting the next author to check.
 *
 * It reads the suites as plain text: hermetic, no emulator, and it runs in the
 * normal `pnpm test` shards rather than the separate `test:rules` job.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rulesDir = resolve(__dirname, 'rules');

const suiteFiles = readdirSync(rulesDir)
  .filter((name) => name.endsWith('.test.ts'))
  .sort();

const PROJECT_ID_DECL = /^const PROJECT_ID = '([^']+)';$/gm;

function declaredProjectIds(source: string): string[] {
  return [...source.matchAll(PROJECT_ID_DECL)].map((match) => match[1]);
}

describe('Firestore rules suites: emulator project isolation', () => {
  it('finds the rules suites', () => {
    expect(suiteFiles.length).toBeGreaterThan(0);
  });

  it('declares exactly one PROJECT_ID per suite', () => {
    const offenders = suiteFiles.filter(
      (name) =>
        declaredProjectIds(readFileSync(resolve(rulesDir, name), 'utf-8'))
          .length !== 1
    );
    expect(offenders).toEqual([]);
  });

  it('never points initializeTestEnvironment at a literal project id', () => {
    // A hard-coded projectId would bypass the PROJECT_ID scan below.
    const offenders = suiteFiles.filter((name) =>
      readFileSync(resolve(rulesDir, name), 'utf-8')
        .split('\n')
        .some(
          (line) =>
            line.includes('projectId:') &&
            !line.includes('projectId: PROJECT_ID')
        )
    );
    expect(offenders).toEqual([]);
  });

  it('gives every suite a project id no other suite uses', () => {
    const owners = new Map<string, string[]>();
    for (const name of suiteFiles) {
      for (const id of declaredProjectIds(
        readFileSync(resolve(rulesDir, name), 'utf-8')
      )) {
        owners.set(id, [...(owners.get(id) ?? []), name]);
      }
    }

    const shared = [...owners.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([id, files]) => `${id}: ${files.join(', ')}`);

    expect(shared).toEqual([]);
  });
});
