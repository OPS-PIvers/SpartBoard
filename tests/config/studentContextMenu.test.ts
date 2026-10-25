import { describe, it, expect } from 'vitest';
import {
  isStudentFacingPath,
  normalizeStudentContextMenuSettings,
} from '@/config/studentContextMenu';

describe('isStudentFacingPath', () => {
  it.each([
    '/join',
    '/join/123',
    '/quiz',
    '/quiz/abc',
    '/activity/xyz',
    '/activity-wall/abc',
    '/guided-learning/s1',
    '/miniapp/m1',
    '/flashcards/a/set1',
    '/my-assignments',
    '/project/p1',
    '/classroom-addon/student',
    '/lti/student',
  ])('covers %s', (path) => {
    expect(isStudentFacingPath(path)).toBe(true);
  });

  it.each([
    '/',
    '/remote',
    '/plc/abc',
    '/subs',
    '/activity-wall/gallery/share1',
    '/flashcards/set1',
    '/classroom-addon/teacher',
    '/lti/teacher',
    '/quizzes',
    '/activityfoo',
  ])('leaves %s alone', (path) => {
    expect(isStudentFacingPath(path)).toBe(false);
  });
});

describe('normalizeStudentContextMenuSettings', () => {
  it('turns on only for an explicit true', () => {
    expect(normalizeStudentContextMenuSettings({ enabled: true })).toEqual({
      enabled: true,
    });
    expect(normalizeStudentContextMenuSettings({ enabled: 'yes' })).toEqual({
      enabled: false,
    });
    expect(normalizeStudentContextMenuSettings(null)).toEqual({
      enabled: false,
    });
  });
});
