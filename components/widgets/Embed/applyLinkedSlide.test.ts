import { describe, it, expect } from 'vitest';
import { applyLinkedSlide } from './applyLinkedSlide';
import { convertToEmbedUrl } from '@/utils/urlHelpers';

const embedFor = (url: string) =>
  applyLinkedSlide(convertToEmbedUrl(url), url, true);

describe('applyLinkedSlide', () => {
  it('keeps the slide from a copied edit link', () => {
    const url =
      'https://docs.google.com/presentation/d/abc123/edit?slide=id.g3c33466b1b1_0_0#slide=id.g3c33466b1b1_0_0';
    expect(embedFor(url)).toBe(
      'https://docs.google.com/presentation/d/abc123/preview?slide=id.g3c33466b1b1_0_0#slide=id.g3c33466b1b1_0_0'
    );
  });

  it('reads a hash-only slide', () => {
    expect(
      embedFor('https://docs.google.com/presentation/d/abc123/edit#slide=id.p3')
    ).toBe(
      'https://docs.google.com/presentation/d/abc123/preview?slide=id.p3#slide=id.p3'
    );
  });

  it('leaves links without a slide unchanged', () => {
    const url = 'https://docs.google.com/presentation/d/abc123/edit';
    expect(embedFor(url)).toBe(convertToEmbedUrl(url));
  });

  it('does nothing when disabled', () => {
    const url =
      'https://docs.google.com/presentation/d/abc123/edit#slide=id.p3';
    expect(applyLinkedSlide(convertToEmbedUrl(url), url, false)).toBe(
      'https://docs.google.com/presentation/d/abc123/preview'
    );
  });

  it('ignores non-Slides embeds', () => {
    expect(
      applyLinkedSlide(
        'https://www.youtube.com/embed/abcdefghijk',
        'https://example.com/?slide=id.p3',
        true
      )
    ).toBe('https://www.youtube.com/embed/abcdefghijk');
  });
});
