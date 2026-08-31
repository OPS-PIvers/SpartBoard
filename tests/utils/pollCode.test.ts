import { describe, it, expect } from 'vitest';
import {
  POLL_CODE_LENGTH,
  buildPollJoinUrl,
  generatePollCode,
  normalizePollCode,
} from '@/utils/pollCode';

describe('normalizePollCode', () => {
  it('trims, strips punctuation, and uppercases', () => {
    expect(normalizePollCode('  k3f-9q  ')).toBe('K3F9Q');
    expect(normalizePollCode('k3f 9q')).toBe('K3F9Q');
    expect(normalizePollCode('K3F9Q')).toBe('K3F9Q');
  });

  it('returns an empty string for junk input', () => {
    expect(normalizePollCode('   ')).toBe('');
    expect(normalizePollCode('!!!')).toBe('');
  });
});

describe('generatePollCode', () => {
  it('produces a code of the configured length', () => {
    expect(generatePollCode()).toHaveLength(POLL_CODE_LENGTH);
    expect(generatePollCode(8)).toHaveLength(8);
  });

  it('never emits characters that are ambiguous on a projector', () => {
    const ambiguous = /[01OIL5S2Z8B]/;
    for (let i = 0; i < 200; i += 1) {
      expect(generatePollCode()).not.toMatch(ambiguous);
    }
  });

  it('round-trips through normalization unchanged', () => {
    const code = generatePollCode();
    expect(normalizePollCode(code)).toBe(code);
  });

  it('does not repeat itself across draws', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generatePollCode()));
    expect(seen.size).toBeGreaterThan(40);
  });
});

describe('buildPollJoinUrl', () => {
  it('builds a short, code-based join link', () => {
    expect(buildPollJoinUrl('K3F9Q')).toBe(
      `${window.location.origin}/poll?code=K3F9Q`
    );
  });
});
