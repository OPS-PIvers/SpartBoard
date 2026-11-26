import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  normalizeSoundboardAudioUrl,
  isDriveUrl,
  extractDriveAudioFileId,
  fetchDriveAudioBlobUrl,
} from './soundboardAudioUrl';

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

describe('isDriveUrl', () => {
  it('returns true for drive.google.com URLs', () => {
    expect(isDriveUrl('https://drive.google.com/file/d/abc123/view')).toBe(
      true
    );
  });

  it('returns true for docs.google.com URLs', () => {
    expect(isDriveUrl('https://docs.google.com/file/d/abc123/view')).toBe(true);
  });

  it('returns false for non-Drive URLs', () => {
    expect(isDriveUrl('https://cdn.example.com/audio/bell.mp3')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isDriveUrl('not-a-url')).toBe(false);
  });
});

describe('extractDriveAudioFileId', () => {
  it('extracts file ID from /file/d/<id>/view links', () => {
    expect(
      extractDriveAudioFileId(
        'https://drive.google.com/file/d/abc123_XYZ/view?usp=sharing'
      )
    ).toBe('abc123_XYZ');
  });

  it('extracts file ID from open?id=<id> links', () => {
    expect(
      extractDriveAudioFileId('https://drive.google.com/open?id=abc123_XYZ')
    ).toBe('abc123_XYZ');
  });

  it('returns null for URLs without a file ID', () => {
    expect(extractDriveAudioFileId('https://drive.google.com/')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(extractDriveAudioFileId('')).toBeNull();
  });
});

describe('fetchDriveAudioBlobUrl', () => {
  const FAKE_BLOB_URL = 'blob:http://localhost/fake';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(FAKE_BLOB_URL);
  });

  it('fetches the file via the Drive API and returns a blob URL', async () => {
    const blob = new Blob(['audio'], { type: 'audio/mpeg' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(blob, { status: 200 })
    );

    const result = await fetchDriveAudioBlobUrl('file123', 'token');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/file123?alt=media',
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } })
    );
    expect(result).toBe(FAKE_BLOB_URL);
  });

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 403 })
    );

    await expect(fetchDriveAudioBlobUrl('file123', 'token')).rejects.toThrow(
      /Failed to fetch Drive audio \(403\)/
    );
  });
});
