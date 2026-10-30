import { describe, expect, it } from 'vitest';
import {
  buildEmbedReference,
  buildLinkReference,
  buildPhotoSticker,
} from './referenceLanding';

describe('referenceLanding', () => {
  it('stores the link as given, so the widget can keep a linked slide', () => {
    expect(
      buildEmbedReference('https://youtu.be/dQw4w9WgXcQ', '  Song  ')
    ).toEqual({
      type: 'embed',
      overrides: {
        config: {
          url: 'https://youtu.be/dQw4w9WgXcQ',
          mode: 'url',
          isEmbeddable: true,
          blockedReason: '',
        },
        customTitle: 'Song',
      },
    });
  });

  it('falls back to a Links widget titled by host', () => {
    const link = buildLinkReference('www.example.com/a');
    expect(link.type).toBe('url');
    expect(link.overrides.config).toMatchObject({
      urls: [{ url: 'https://www.example.com/a', title: 'example.com' }],
    });
  });

  it('sizes a photo sticker to the photo shape', () => {
    const sticker = buildPhotoSticker('https://img/x.jpg', {
      width: 1000,
      height: 500,
    });
    expect(sticker.type).toBe('sticker');
    expect(sticker.overrides).toMatchObject({
      w: 500,
      h: 250,
      config: { url: 'https://img/x.jpg', rotation: 0 },
    });
  });
});
