// Two rules suites on one emulator project id wipe each other's seed data via clearFirestore().

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rulesDir = resolve(__dirname, 'rules');

const PROJECT_ID_DECL = /^const PROJECT_ID = '([^']+)';$/gm;

/** Only the `initializeTestEnvironment(...)` call: seed data has `projectId` fields too. */
function initEnvCall(source: string): string[] {
  const start = source.indexOf('initializeTestEnvironment(');
  if (start === -1) return [];
  let depth = 0;
  for (let i = source.indexOf('(', start); i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i).split('\n');
    }
  }
  return source.slice(start).split('\n');
}

const suites = readdirSync(rulesDir)
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => {
    const source = readFileSync(resolve(rulesDir, name), 'utf-8');
    return {
      name,
      projectIds: [...source.matchAll(PROJECT_ID_DECL)].map(
        (match) => match[1]
      ),
      hasLiteralProjectId: initEnvCall(source).some(
        (line) =>
          line.includes('projectId:') && !line.includes('projectId: PROJECT_ID')
      ),
    };
  });

describe('Firestore rules suites: emulator project isolation', () => {
  it('finds the rules suites', () => {
    expect(suites.length).toBeGreaterThan(0);
  });

  it('declares exactly one PROJECT_ID per suite', () => {
    const offenders = suites
      .filter((suite) => suite.projectIds.length !== 1)
      .map((suite) => suite.name);
    expect(offenders).toEqual([]);
  });

  it('never points initializeTestEnvironment at a literal project id', () => {
    // A hard-coded projectId would bypass the PROJECT_ID scan below.
    const offenders = suites
      .filter((suite) => suite.hasLiteralProjectId)
      .map((suite) => suite.name);
    expect(offenders).toEqual([]);
  });

  it('gives every suite a project id no other suite uses', () => {
    const owners = new Map<string, string[]>();
    for (const suite of suites) {
      for (const id of suite.projectIds) {
        owners.set(id, [...(owners.get(id) ?? []), suite.name]);
      }
    }

    const shared = [...owners.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([id, files]) => `${id}: ${files.join(', ')}`);

    expect(shared).toEqual([]);
  });
});

describe('the literal-project-id scan', () => {
  const scan = (source: string) =>
    initEnvCall(source).some(
      (line) =>
        line.includes('projectId:') && !line.includes('projectId: PROJECT_ID')
    );

  it('still catches a literal in the call it guards', () => {
    expect(
      scan("await initializeTestEnvironment({ projectId: 'hard-coded' });")
    ).toBe(true);
  });

  it('ignores a projectId field in seed data outside the call', () => {
    expect(
      scan(
        [
          "const run = { projectId: 'project-1' };",
          'await initializeTestEnvironment({',
          '  projectId: PROJECT_ID,',
          "  firestore: { rules: 'x' },",
          '});',
        ].join('\n')
      )
    ).toBe(false);
  });
});
