import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { partition, parseShard } from './lintApp.mjs';

const files = ['b.ts', 'a.ts', 'd.tsx', 'c.ts', 'e.ts', 'f.tsx', 'g.ts'];
const sizes: Record<string, number> = {
  'a.ts': 50,
  'b.ts': 10,
  'c.ts': 10,
  'd.tsx': 10,
  'e.ts': 10,
  'f.tsx': 5,
  'g.ts': 5,
};
const sizeOf = (f: string): number => sizes[f];

describe('lintApp partition', () => {
  it('covers every file exactly once, in sorted contiguous slices', () => {
    for (const count of [1, 2, 3, 5, 10]) {
      const slices = partition(files, count, sizeOf);
      expect(slices).toHaveLength(count);
      expect(slices.flat()).toEqual([...files].sort());
    }
  });

  it('balances slices by size, not file count', () => {
    const slices = partition(files, 2, sizeOf);
    expect(slices[0]).toEqual(['a.ts']);
    expect(slices[1]).toEqual([
      'b.ts',
      'c.ts',
      'd.tsx',
      'e.ts',
      'f.tsx',
      'g.ts',
    ]);
  });

  it('returns the same slices whatever the input order', () => {
    const shuffled = [...files].reverse();
    expect(partition(shuffled, 3, sizeOf)).toEqual(partition(files, 3, sizeOf));
  });
});

describe('lintApp parseShard', () => {
  it('reads I/N', () => {
    expect(parseShard('--shard=2/3')).toEqual({ index: 2, count: 3 });
  });

  it.each([
    '--shard=0/3',
    '--shard=4/3',
    '--shard=1/0',
    '--shard=a/b',
    '--shard',
  ])('rejects %s instead of silently linting everything', (arg) => {
    expect(() => parseShard(arg)).toThrow(/Invalid shard/);
  });
});

// A shard count that disagrees with the matrix would leave files unlinted with a green check.
describe.each(['pr-validation.yml', 'firebase-dev-deploy.yml'])(
  '%s lint:app shards',
  (name) => {
    it('has one matrix entry per shard the lint step splits into', () => {
      const yaml = readFileSync(
        resolve(__dirname, '../.github/workflows', name),
        'utf-8'
      );
      const counts = [
        ...yaml.matchAll(/lint:app --shard=\$\{\{ matrix\.shard \}\}\/(\d+)/g),
      ].map((m) => Number(m[1]));
      expect(counts).toHaveLength(1);
      const shards = [...yaml.matchAll(/shard: (\d+) \}/g)].map((m) =>
        Number(m[1])
      );
      expect(shards).toEqual(
        Array.from({ length: counts[0] }, (_, i) => i + 1)
      );
    });
  }
);
