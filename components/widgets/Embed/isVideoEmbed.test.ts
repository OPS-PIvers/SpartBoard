import { describe, it, expect } from 'vitest';
import { isVideoEmbed } from './isVideoEmbed';

describe('isVideoEmbed', () => {
  it.each([
    'https://www.youtube.com/embed/aqz-KE-bpKQ',
    'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
    'https://player.vimeo.com/video/76979871',
  ])('treats %s as a video player', (url) => {
    expect(isVideoEmbed('url', url, '')).toBe(true);
  });

  it.each([
    'https://example.com',
    'https://docs.google.com/presentation/d/x/embed',
    'not a url',
    'https://youtube.com.evil.example/embed/x',
  ])('leaves %s zoomable', (url) => {
    expect(isVideoEmbed('url', url, '')).toBe(false);
  });

  it('detects player iframes in pasted code only', () => {
    expect(
      isVideoEmbed(
        'code',
        '',
        '<iframe src="https://player.vimeo.com/video/1"></iframe>'
      )
    ).toBe(true);
    expect(
      isVideoEmbed(
        'code',
        '',
        '<a href="https://www.youtube.com/embed/x">x</a>'
      )
    ).toBe(false);
  });
});
