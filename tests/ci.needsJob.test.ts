// Guards needs-job.mjs: PR Validation skips rules tests only when nothing they read changed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { needsJob, rulesImports } from '@/.github/scripts/needs-job.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rules = (changed: string[]) => needsJob('rules', changed, root);

describe('needs-job.mjs rules', () => {
  it('runs rules tests for rules, their tests, their scripts and shared config', () => {
    for (const path of [
      'firestore.rules',
      'storage.rules',
      'tests/rules/quiz.test.ts',
      'scripts/runRulesTests.mjs',
      'scripts/rulesAst/parse.mjs',
      'firebase.json',
      'pnpm-lock.yaml',
      'package.json',
      '.github/workflows/pr-validation.yml',
      '.github/scripts/needs-job.mjs',
    ]) {
      expect(rules([path]), path).toBe(true);
    }
  });

  it('runs rules tests when app code their tests import changes', () => {
    const imports = rulesImports(root);
    expect(imports.has('utils/quizResponseKey.ts')).toBe(true);
    expect(imports.has('types.ts')).toBe(true);
    expect(rules(['utils/quizResponseKey.ts'])).toBe(true);
  });

  it('skips rules tests for app, functions and doc changes they never read', () => {
    expect(rules(['components/widgets/Clock/Widget.tsx'])).toBe(false);
    expect(rules(['functions/src/aiRouter.ts'])).toBe(false);
    expect(rules(['docs/ONBOARDING.md', 'AGENT_BACKLOG.md'])).toBe(false);
  });

  it('wires the decision into PR Validation and keeps the count guard running', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/pr-validation.yml'),
      'utf-8'
    );
    expect(workflow).toContain('node .github/scripts/needs-job.mjs rules');
    expect(workflow).toContain("needs.changes.outputs.rules == 'true'");
    expect(workflow).toContain(
      "(needs.rules.result == 'success' || needs.rules.result == 'skipped')"
    );
  });
});
