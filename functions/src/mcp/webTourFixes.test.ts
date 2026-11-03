import { describe, it, expect } from 'vitest';
import { readableFixLocator, stepFixes } from './webTourFixes';

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

describe('readableFixLocator', () => {
  const locator = {
    role: 'link',
    name: 'Gradebook',
    attrs: { ariaLabel: 'Grades', testId: 'free text', href: '/x' },
  };
  const fix = (source: 'admin' | 'check' | 'teacher') => ({
    locator,
    source,
    count: 2,
    at: 1,
  });

  it('drops a teachers fix control id and link address, keeping the recorded clues', () => {
    expect(readableFixLocator(fix('teacher'))).toEqual({
      role: 'link',
      name: 'Gradebook',
      attrs: { ariaLabel: 'Grades' },
    });
    expect(
      readableFixLocator({
        ...fix('teacher'),
        locator: { role: 'link', attrs: { testId: 't', href: '/x' } },
      })
    ).toEqual({ role: 'link' });
  });

  it('leaves an admin run and an admin check as they are', () => {
    expect(readableFixLocator(fix('admin'))).toBe(locator);
    expect(readableFixLocator(fix('check'))).toBe(locator);
  });
});

describe('stepFixes admin group', () => {
  it('takes the admin run locator over a teacher run that hashes the same', () => {
    const fixed = (css: string, admin: boolean, testId: string) => ({
      v: 5,
      surface: 'web',
      startedAt: 1,
      misses: ['a'],
      weak: [],
      admin,
      fixes: { a: { css, attrs: { testId } } },
    });
    const out = stepFixes({ steps: [step] }, { at: 5, steps: [step] }, [
      fixed('#x', false, 'teacher text'),
      fixed('#x', true, 'admin-id'),
    ]);
    expect(out.get('a')?.locator).toMatchObject({
      attrs: { testId: 'admin-id' },
    });
  });
});
