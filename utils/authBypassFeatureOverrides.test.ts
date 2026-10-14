import { describe, it, expect } from 'vitest';
import {
  getBuildTimeFeatureOverrides,
  getRuntimeFeatureOverrides,
  resolveAuthBypassFeatureOverride,
} from './authBypassFeatureOverrides';

function fakeStorage(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: () => value };
}

describe('getBuildTimeFeatureOverrides', () => {
  it('parses a valid JSON object of booleans', () => {
    expect(getBuildTimeFeatureOverrides('{"quiz-read-aloud":false}')).toEqual({
      'quiz-read-aloud': false,
    });
  });

  it('returns empty for undefined input', () => {
    expect(getBuildTimeFeatureOverrides(undefined)).toEqual({});
  });

  it('returns empty for malformed JSON', () => {
    expect(getBuildTimeFeatureOverrides('{not json')).toEqual({});
  });

  it('returns empty for a non-object JSON value', () => {
    expect(getBuildTimeFeatureOverrides('true')).toEqual({});
    expect(getBuildTimeFeatureOverrides('[1,2]')).toEqual({});
  });

  it('drops non-boolean values', () => {
    expect(getBuildTimeFeatureOverrides('{"quiz-read-aloud":"yes"}')).toEqual(
      {}
    );
  });
});

describe('getRuntimeFeatureOverrides', () => {
  it('parses localStorage JSON', () => {
    expect(
      getRuntimeFeatureOverrides(fakeStorage('{"quiz-read-aloud":true}'))
    ).toEqual({ 'quiz-read-aloud': true });
  });

  it('returns empty when storage is undefined', () => {
    expect(getRuntimeFeatureOverrides(undefined)).toEqual({});
  });

  it('returns empty when storage throws', () => {
    const throwing: Pick<Storage, 'getItem'> = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(getRuntimeFeatureOverrides(throwing)).toEqual({});
  });

  it('returns empty for malformed localStorage JSON', () => {
    expect(getRuntimeFeatureOverrides(fakeStorage('{bad'))).toEqual({});
  });
});

describe('resolveAuthBypassFeatureOverride', () => {
  it('prefers the runtime localStorage override over the build-time default', () => {
    const result = resolveAuthBypassFeatureOverride(
      'quiz-read-aloud',
      '{"quiz-read-aloud":true}',
      fakeStorage('{"quiz-read-aloud":false}')
    );
    expect(result).toBe(false);
  });

  it('falls back to the build-time default when localStorage has no entry', () => {
    const result = resolveAuthBypassFeatureOverride(
      'quiz-read-aloud',
      '{"quiz-read-aloud":true}',
      fakeStorage(null)
    );
    expect(result).toBe(true);
  });

  it('returns undefined when neither source has an override', () => {
    const result = resolveAuthBypassFeatureOverride(
      'quiz-read-aloud',
      undefined,
      fakeStorage(null)
    );
    expect(result).toBeUndefined();
  });
});
