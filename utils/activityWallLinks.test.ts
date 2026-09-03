import { describe, expect, it } from 'vitest';
import {
  activityWallSessionId,
  activityWallStudentPath,
  buildGalleryLink,
  buildShortLinkUrl,
  buildStudentWallLink,
} from './activityWallLinks';

const ORIGIN = 'https://spartboard.web.app';

describe('activityWallLinks', () => {
  it('composes the session id the widget mirrors to', () => {
    expect(activityWallSessionId('teacher-1', 'wall-9')).toBe(
      'teacher-1_wall-9'
    );
    expect(activityWallStudentPath('teacher-1_wall-9')).toBe(
      '/activity-wall/teacher-1_wall-9'
    );
  });

  it('routes an SSO-only wall through the student login page', () => {
    expect(buildStudentWallLink(ORIGIN, 'teacher-1_wall-9', false)).toBe(
      `${ORIGIN}/student/login?next=${encodeURIComponent(
        '/activity-wall/teacher-1_wall-9'
      )}`
    );
  });

  it('links a guest-friendly wall directly', () => {
    expect(buildStudentWallLink(ORIGIN, 'teacher-1_wall-9', true)).toBe(
      `${ORIGIN}/activity-wall/teacher-1_wall-9`
    );
  });

  it('never emits a ?data= payload', () => {
    const guest = buildStudentWallLink(ORIGIN, 's', true);
    const sso = buildStudentWallLink(ORIGIN, 's', false);
    expect(guest).not.toContain('data=');
    expect(sso).not.toContain('?data=');
  });

  it('builds the gallery and short-link URLs', () => {
    expect(buildGalleryLink(ORIGIN, 'share-1')).toBe(
      `${ORIGIN}/activity-wall/gallery/share-1`
    );
    expect(buildShortLinkUrl(ORIGIN, 'ab12cd')).toBe(`${ORIGIN}/r/ab12cd`);
  });
});
