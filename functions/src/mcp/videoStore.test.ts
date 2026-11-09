import { describe, expect, it } from 'vitest';
import { extractYouTubeId } from './videoStore';

describe('extractYouTubeId', () => {
  it('reads watch, shorts and live links', () => {
    expect(
      extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(
      extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ?si=x')
    ).toBe('dQw4w9WgXcQ');
  });
});
