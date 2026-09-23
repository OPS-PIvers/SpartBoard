import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUB_LAUNCH_AS_TEACHER_SETTINGS,
  normalizeSubLaunchAsTeacherSettings,
} from '@/config/subLaunchAsTeacher';

describe('normalizeSubLaunchAsTeacherSettings', () => {
  it('reads a missing doc as off', () => {
    expect(normalizeSubLaunchAsTeacherSettings(undefined)).toEqual(
      DEFAULT_SUB_LAUNCH_AS_TEACHER_SETTINGS
    );
    expect(DEFAULT_SUB_LAUNCH_AS_TEACHER_SETTINGS.enabled).toBe(false);
  });

  // Anything but a literal `true` has to read as off: a half-written or
  // malformed doc must not hand a substitute the teacher's account.
  it('only a literal true turns it on', () => {
    expect(normalizeSubLaunchAsTeacherSettings({ enabled: true })).toEqual({
      enabled: true,
    });
    for (const raw of [
      { enabled: 'true' },
      { enabled: 1 },
      { enabled: null },
      {},
      'on',
      null,
    ]) {
      expect(normalizeSubLaunchAsTeacherSettings(raw).enabled).toBe(false);
    }
  });
});
