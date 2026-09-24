import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildBuildingIndexEntry } from './buildingIndexEntry';

// Same cases the server mirror runs (functions/src/glBuildingIndex.ts), so the fallback and the index agree.
interface IndexCase {
  name: string;
  id: string;
  set: unknown;
  expected: unknown;
}

const cases = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'functions', 'src', 'glBuildingIndex.cases.json'),
    'utf8'
  )
) as IndexCase[];

describe('buildBuildingIndexEntry parity with the server mirror', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(buildBuildingIndexEntry(c.id, c.set)).toEqual(c.expected);
  });

  it('rejects non-objects', () => {
    expect(buildBuildingIndexEntry('x', undefined)).toBeNull();
  });
});
