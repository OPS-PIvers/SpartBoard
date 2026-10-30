import { describe, it, expect } from 'vitest';
import { stepFixes } from './webTourFixes';

const own = { role: 'link', name: 'Gradebook', css: '#nav > a.grades' };
const step = { id: 'a', web: { locator: own } };
const run = (weak: unknown) => ({
  v: 5,
  surface: 'web',
  startedAt: 1,
  misses: [],
  weak,
  fixes: { a: { css: '#other > a' } },
  admin: true,
});

describe('stepFixes struggled', () => {
  it('counts a well-formed weak entry for the step', () => {
    const out = stepFixes({ steps: [step] }, { at: 5, steps: [step] }, [
      run(['a:css']),
    ]);
    expect(out.has('a')).toBe(true);
  });

  it('ignores a malformed weak entry, like the client parseWeak', () => {
    const out = stepFixes({ steps: [step] }, { at: 5, steps: [step] }, [
      run(['a:bogus']),
    ]);
    expect(out.has('a')).toBe(false);
  });

  it('does not match a colon-less entry by truncating its last character', () => {
    const out = stepFixes({ steps: [step] }, { at: 5, steps: [step] }, [
      run(['ab']),
    ]);
    expect(out.has('a')).toBe(false);
  });
});
