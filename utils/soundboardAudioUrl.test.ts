import { describe, expect, it } from 'vitest';
import { normalizeSoundboardAudioUrl } from './soundboardAudioUrl';

describe('normalizeSoundboardAudioUrl', () => {
  const fileId = 'abc123_XYZ-987';
  const canonicalUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;

  it('converts file/d/<id>/view links to the canonical playback URL', () => {
    expect(
      normalizeSoundboardAudioUrl(
        `https://drive.google.com/file/d/${fileId}/view?usp=sharing`
      )
    ).toBe(canonicalUrl);
  });

  it('converts open?id=<id> links to the canonical playback URL', () => {
    expect(
      normalizeSoundboardAudioUrl(
        `https://drive.google.com/open?id=${fileId}&resourcekey=foo`
      )
    ).toBe(canonicalUrl);
  });

  it('converts docs.google.com file links to the canonical playback URL', () => {
    expect(
      normalizeSoundboardAudioUrl(
        `https://docs.google.com/file/d/${fileId}/view?usp=drive_link`
      )
    ).toBe(canonicalUrl);
  });

  it('adds export=download for uc?id=<id> links that are missing it', () => {
    expect(
      normalizeSoundboardAudioUrl(`https://drive.google.com/uc?id=${fileId}`)
    ).toBe(canonicalUrl);
  });

  it('keeps uc?id=<id>&export=download links stable (idempotent)', () => {
    expect(normalizeSoundboardAudioUrl(canonicalUrl)).toBe(canonicalUrl);
  });

  it('leaves non-Drive MP3 URLs unchanged', () => {
    const externalUrl = 'https://cdn.example.com/audio/bell.mp3';
    expect(normalizeSoundboardAudioUrl(externalUrl)).toBe(externalUrl);
  });
});
