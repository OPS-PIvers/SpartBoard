import { describe, expect, it } from 'vitest';
import { teacherPostTypes, wallTypeOn } from './activityWallTypes';

const videoOnly = {
  text: false,
  photo: false,
  link: false,
  file: false,
  video: true,
};

describe('activityWallTypes', () => {
  it('treats a missing text key as on and missing media as off', () => {
    expect(wallTypeOn(undefined, 'text')).toBe(true);
    expect(wallTypeOn(undefined, 'photo')).toBe(false);
    expect(wallTypeOn(videoOnly, 'text')).toBe(false);
  });

  it('gives the owner text plus the wall media types', () => {
    expect(teacherPostTypes({ allowedTypes: videoOnly }, false)).toEqual({
      ...videoOnly,
      text: true,
    });
  });

  it('gives a co-teacher text and links only', () => {
    expect(
      teacherPostTypes({ allowedTypes: { ...videoOnly, link: true } }, true)
    ).toEqual({
      text: true,
      photo: false,
      file: false,
      video: false,
      link: true,
    });
  });
});
