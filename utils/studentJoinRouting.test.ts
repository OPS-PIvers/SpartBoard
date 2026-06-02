import { describe, it, expect } from 'vitest';
import { resolveNextTarget, shouldGateToSso } from './studentJoinRouting';

describe('resolveNextTarget', () => {
  it('returns null for empty / missing input', () => {
    expect(resolveNextTarget(null)).toBeNull();
    expect(resolveNextTarget('')).toBeNull();
  });

  it('allows the whitelisted /quiz and /join routes (with query preserved)', () => {
    expect(resolveNextTarget('/quiz?code=ABC123')).toBe('/quiz?code=ABC123');
    expect(resolveNextTarget('/join?code=XYZ')).toBe('/join?code=XYZ');
    expect(resolveNextTarget('/quiz')).toBe('/quiz');
  });

  it('rejects protocol-relative URLs (open-redirect vector)', () => {
    expect(resolveNextTarget('//evil.com')).toBeNull();
    expect(resolveNextTarget('//evil.com/quiz')).toBeNull();
  });

  it('rejects absolute URLs to another origin', () => {
    expect(resolveNextTarget('https://evil.com/quiz')).toBeNull();
    expect(resolveNextTarget('http://evil.com')).toBeNull();
  });

  it('rejects backslash tricks some engines normalise to /', () => {
    expect(resolveNextTarget('/\\evil.com')).toBeNull();
    expect(resolveNextTarget('/quiz\\@evil.com')).toBeNull();
  });

  it('rejects non-whitelisted internal paths', () => {
    expect(resolveNextTarget('/my-assignments')).toBeNull();
    expect(resolveNextTarget('/admin')).toBeNull();
    // Prefix look-alikes must not slip through — the path must match exactly.
    expect(resolveNextTarget('/quizzes')).toBeNull();
    expect(resolveNextTarget('/quiz/../admin')).toBeNull();
  });
});

describe('shouldGateToSso', () => {
  const base = {
    flagEnabled: true,
    isStudentRole: false,
    embedded: false,
    hasCode: true,
    classIds: ['F33EC569'],
  };

  it('gates when every condition is met', () => {
    expect(shouldGateToSso(base)).toBe(true);
  });

  it('does not gate when the flag is off', () => {
    expect(shouldGateToSso({ ...base, flagEnabled: false })).toBe(false);
  });

  it('does not gate an already-SSO student (they auto-join)', () => {
    expect(shouldGateToSso({ ...base, isStudentRole: true })).toBe(false);
  });

  it('does not gate inside the Classroom add-on iframe', () => {
    expect(shouldGateToSso({ ...base, embedded: true })).toBe(false);
  });

  it('does not gate without a join code', () => {
    expect(shouldGateToSso({ ...base, hasCode: false })).toBe(false);
  });

  it('does not gate a PIN-only session (no classIds)', () => {
    expect(shouldGateToSso({ ...base, classIds: [] })).toBe(false);
    expect(shouldGateToSso({ ...base, classIds: undefined })).toBe(false);
  });
});
