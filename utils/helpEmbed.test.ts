import { describe, it, expect } from 'vitest';
import {
  inferHelpEmbedType,
  isAllowedHelpUrl,
  toHelpEmbedSrc,
  HELP_IFRAME_SANDBOX,
} from './helpEmbed';

describe('inferHelpEmbedType', () => {
  it('infers youtube from youtube.com', () => {
    expect(inferHelpEmbedType('https://www.youtube.com/watch?v=abc')).toBe(
      'youtube'
    );
  });

  it('infers youtube from youtu.be', () => {
    expect(inferHelpEmbedType('https://youtu.be/abc')).toBe('youtube');
  });

  it('infers doc from docs.google.com/document', () => {
    expect(
      inferHelpEmbedType('https://docs.google.com/document/d/abc/edit')
    ).toBe('doc');
  });

  it('infers slides from docs.google.com/presentation', () => {
    expect(
      inferHelpEmbedType('https://docs.google.com/presentation/d/abc/edit')
    ).toBe('slides');
  });

  it('infers sheet from docs.google.com/spreadsheets', () => {
    expect(
      inferHelpEmbedType('https://docs.google.com/spreadsheets/d/abc/edit')
    ).toBe('sheet');
  });

  it('infers drive from drive.google.com/file', () => {
    expect(inferHelpEmbedType('https://drive.google.com/file/d/abc/view')).toBe(
      'drive'
    );
  });

  it('infers pdf from a .pdf url', () => {
    expect(inferHelpEmbedType('https://example.com/guide.pdf')).toBe('pdf');
  });

  it('falls back to other for unrecognized urls', () => {
    expect(inferHelpEmbedType('https://example.com/page')).toBe('other');
  });

  it('falls back to other for an unparseable url', () => {
    expect(inferHelpEmbedType('not a url')).toBe('other');
  });
});

describe('isAllowedHelpUrl', () => {
  it('allows https urls', () => {
    expect(isAllowedHelpUrl('https://example.com')).toBe(true);
  });

  it('rejects http urls', () => {
    expect(isAllowedHelpUrl('http://example.com')).toBe(false);
  });

  it('rejects unparseable urls', () => {
    expect(isAllowedHelpUrl('not a url')).toBe(false);
  });
});

describe('toHelpEmbedSrc', () => {
  it('converts a recognized url', () => {
    expect(toHelpEmbedSrc('https://youtu.be/abc123defgh')).toContain(
      'youtube.com/embed'
    );
  });

  it('returns the input unchanged for unrecognized urls', () => {
    expect(toHelpEmbedSrc('https://example.com/page')).toBe(
      'https://example.com/page'
    );
  });
});

describe('HELP_IFRAME_SANDBOX', () => {
  it('matches the BlendingBoard precedent', () => {
    expect(HELP_IFRAME_SANDBOX).toBe(
      'allow-scripts allow-forms allow-popups allow-same-origin'
    );
  });
});
