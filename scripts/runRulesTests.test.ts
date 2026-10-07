import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { rulesTestCommands } from './runRulesTests.mjs';

const names = (cmds: string[][]): string[] =>
  cmds.map((c) => c.slice(0, 3).join(' '));

describe('rulesTestCommands', () => {
  it('runs the size check, the whole suite and the count guard when unsharded', () => {
    const cmds = rulesTestCommands(undefined);
    expect(names(cmds)).toEqual([
      'node scripts/checkRulesSize.mjs',
      'pnpm exec vitest',
      'node scripts/checkTestCounts.mjs rules',
    ]);
    expect(cmds[1]).toContain('--outputFile=.vitest-reports/rules.json');
    expect(cmds[1].some((a) => a.startsWith('--shard'))).toBe(false);
  });

  it('runs the size check on shard 1 only and leaves the count guard to CI', () => {
    expect(names(rulesTestCommands('1/2'))).toEqual([
      'node scripts/checkRulesSize.mjs',
      'pnpm exec vitest',
    ]);
    const second = rulesTestCommands('2/2');
    expect(names(second)).toEqual(['pnpm exec vitest']);
    expect(second[0]).toContain('--shard=2/2');
    expect(second[0]).toContain(
      '--outputFile=.vitest-reports/rules-shard-2.json'
    );
  });

  it.each(['2', 'a/b', '1/2/3'])('rejects RULES_SHARD=%s', (value) => {
    expect(() => rulesTestCommands(value)).toThrow(/Invalid RULES_SHARD/);
  });
});

// A shard count that disagrees with the matrix would leave rules suites unrun with a green check.
describe.each(['pr-validation.yml', 'firebase-dev-deploy.yml'])(
  '%s rules shards',
  (name) => {
    const yaml = readFileSync(
      resolve(__dirname, '../.github/workflows', name),
      'utf-8'
    );

    it('has one matrix entry per shard and merges every shard report into the count guard', () => {
      const counts = [
        ...yaml.matchAll(
          /RULES_SHARD=\$\{\{ matrix\.shard \}\}\/(\d+) pnpm run test:rules/g
        ),
      ].map((m) => Number(m[1]));
      expect(counts).toHaveLength(1);
      const rulesJob = yaml.slice(yaml.indexOf('\n  rules:'));
      const matrix = /shard: \[([\d, ]+)\]/.exec(rulesJob)?.[1];
      expect(matrix?.split(',').map((s) => Number(s.trim()))).toEqual(
        Array.from({ length: counts[0] }, (_, i) => i + 1)
      );
      expect(yaml).toContain(
        'pnpm run test:merge-reports .vitest-reports/rules.json .vitest-reports/rules-shards/rules-shard-*.json'
      );
      expect(yaml).toMatch(/test-counts:\n {4}needs: \[test, rules\]/);
    });
  }
);
