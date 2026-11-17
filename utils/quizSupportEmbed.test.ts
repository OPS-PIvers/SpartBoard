import { describe, expect, it } from 'vitest';
import { embeddableSupportUrl } from './quizSupportEmbed';

const link = (url: string) => ({ kind: 'link' as const, title: 'x', url });

describe('embeddableSupportUrl', () => {
  it('previews a Drive file support', () => {
    expect(
      embeddableSupportUrl({ kind: 'drive', title: 'x', fileId: '1AbCdEfGhIj' })
    ).toBe('https://drive.google.com/file/d/1AbCdEfGhIj/preview');
  });

  it('turns Google Docs and Drive links into previews', () => {
    expect(
      embeddableSupportUrl(
        link('https://docs.google.com/document/d/abc_123/edit')
      )
    ).toBe('https://docs.google.com/document/d/abc_123/preview');
    expect(
      embeddableSupportUrl(link('https://drive.google.com/file/d/abc_123/view'))
    ).toBe('https://drive.google.com/file/d/abc_123/preview');
  });

  it('turns YouTube links into embeds', () => {
    expect(
      embeddableSupportUrl(link('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
    ).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(embeddableSupportUrl(link('https://youtu.be/dQw4w9WgXcQ'))).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    );
  });

  it('handles the other common Google and YouTube link forms', () => {
    const E = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
    for (const u of [
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://youtube.com/live/dQw4w9WgXcQ',
    ])
      expect(embeddableSupportUrl(link(u))).toBe(E);
    expect(
      embeddableSupportUrl(
        link('https://docs.google.com/document/u/0/d/abc_123/edit')
      )
    ).toBe('https://docs.google.com/document/d/abc_123/preview');
    expect(
      embeddableSupportUrl(link('https://drive.google.com/open?id=abc_123'))
    ).toBe('https://drive.google.com/file/d/abc_123/preview');
  });

  it('keeps other https links and refuses anything else', () => {
    expect(embeddableSupportUrl(link('https://example.org/a'))).toBe(
      'https://example.org/a'
    );
    expect(embeddableSupportUrl(link('javascript:alert(1)'))).toBeNull();
    expect(embeddableSupportUrl(link('http://example.org'))).toBeNull();
  });
});
