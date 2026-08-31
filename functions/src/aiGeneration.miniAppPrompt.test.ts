import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('mini-app generation system prompt (M17 C4)', () => {
  const source = readFileSync(join(__dirname, 'aiGeneration.ts'), 'utf8');

  it('requires the generated app to apply timeMultiplier invisibly', () => {
    expect(source).toMatch(/timeMultiplier/);
    expect(source).toMatch(/Apply the multiplier silently/);
    expect(source).toMatch(/never display the multiplier value/i);
    expect(source).toMatch(/never label the timer as/i);
  });
});
