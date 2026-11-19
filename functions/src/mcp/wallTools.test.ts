import { describe, expect, it } from 'vitest';
import { applyFields, defaultWall } from './wallTools';

describe('applyFields text_posts', () => {
  const base = () => defaultWall('w1', 1);

  it('keeps text on when only media types change', () => {
    const wall = applyFields(base(), { post_types: ['video'] });
    expect(wall.allowedTypes).toEqual({
      photo: false,
      link: false,
      file: false,
      video: true,
    });
  });

  it('turns text off for a video-only wall and keeps it off on later edits', () => {
    const wall = applyFields(base(), {
      post_types: ['video'],
      text_posts: false,
    });
    expect(wall.allowedTypes).toMatchObject({ text: false, video: true });
    const edited = applyFields(wall, { post_types: ['video', 'photo'] });
    expect(edited.allowedTypes).toMatchObject({
      text: false,
      video: true,
      photo: true,
    });
  });

  it('refuses a wall with no way to post', () => {
    expect(() => applyFields(base(), { text_posts: false })).toThrow(
      'Turn on at least one post type when text is off.'
    );
  });
});
