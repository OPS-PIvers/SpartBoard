import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const body = (path: string) =>
  readFileSync(join(__dirname, '..', '..', path), 'utf8')
    .split('\n')
    .slice(1)
    .join('\n');

describe('Mini App grading copies', () => {
  it('match below the header line', () => {
    expect(body('utils/miniAppGrading.ts')).toBe(
      body('functions/src/miniAppGrading.ts')
    );
  });
});
