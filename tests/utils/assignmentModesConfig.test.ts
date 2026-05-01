import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { parseAssignmentModesConfig } from '@/utils/assignmentModesConfig';

describe('parseAssignmentModesConfig', () => {
  let warnSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined) as unknown as MockInstance<
      (...args: unknown[]) => void
    >;
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns an empty config for null/undefined/non-object inputs', () => {
    expect(parseAssignmentModesConfig(null)).toEqual({});
    expect(parseAssignmentModesConfig(undefined)).toEqual({});
    expect(parseAssignmentModesConfig('view-only')).toEqual({});
    expect(parseAssignmentModesConfig(42)).toEqual({});
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns recognized widget keys with valid mode values', () => {
    const result = parseAssignmentModesConfig({
      quiz: 'view-only',
      videoActivity: 'submissions',
      miniApp: 'view-only',
      guidedLearning: 'submissions',
    });
    expect(result).toEqual({
      quiz: 'view-only',
      videoActivity: 'submissions',
      miniApp: 'view-only',
      guidedLearning: 'submissions',
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('drops unknown widget keys silently', () => {
    const result = parseAssignmentModesConfig({
      quiz: 'view-only',
      // Typo'd key — should be silently dropped without warning.
      quizz: 'view-only',
      // Stale legacy key — same.
      activityWall: 'submissions',
    });
    expect(result).toEqual({ quiz: 'view-only' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns on and drops unrecognized mode values for known widget keys', () => {
    const result = parseAssignmentModesConfig({
      quiz: 'review-only', // future mode this client doesn't know
      miniApp: 'view-only',
      videoActivity: 42, // wrong type
      guidedLearning: null, // also wrong
    });
    expect(result).toEqual({ miniApp: 'view-only' });
    expect(warnSpy).toHaveBeenCalledTimes(3);
    // Each warning should reference the offending widget key + value so a
    // future operator can grep the logs to find the drift source.
    const calls: string[] = (warnSpy.mock.calls as readonly unknown[][]).map(
      (args) => String(args[0])
    );
    expect(
      calls.some((m) => m.includes('quiz') && m.includes('review-only'))
    ).toBe(true);
    expect(calls.some((m) => m.includes('videoActivity'))).toBe(true);
    expect(calls.some((m) => m.includes('guidedLearning'))).toBe(true);
  });

  it('handles a config blob with mixed valid + invalid entries', () => {
    const result = parseAssignmentModesConfig({
      quiz: 'submissions',
      miniApp: 'banana',
      somethingElse: 'view-only',
    });
    expect(result).toEqual({ quiz: 'submissions' });
    // Only the known-key-with-bad-value triggers a warn; the unknown key is
    // silent since the schema may legitimately gain keys we don't yet know.
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
