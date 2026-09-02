import { describe, it, expect, vi } from 'vitest';
import { createDriveTakeUrlResolver } from './quizMediaPlayback';

describe('createDriveTakeUrlResolver', () => {
  it('fetches with the teacher own live token and never mints a share link', async () => {
    const fetchBlobUrl = vi.fn(() => Promise.resolve('blob:ok'));
    const refreshToken = vi.fn(() => Promise.resolve('fresh'));
    const resolve = createDriveTakeUrlResolver({
      getToken: () => 'live',
      refreshToken,
      fetchBlobUrl,
    });
    await expect(resolve('file-1')).resolves.toBe('blob:ok');
    expect(fetchBlobUrl).toHaveBeenCalledWith('file-1', 'live');
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('refreshes once and retries when Drive rejects the token', async () => {
    const fetchBlobUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch Drive audio (401).'))
      .mockResolvedValueOnce('blob:after-refresh');
    const resolve = createDriveTakeUrlResolver({
      getToken: () => 'stale',
      refreshToken: () => Promise.resolve('fresh'),
      fetchBlobUrl,
    });
    await expect(resolve('file-1')).resolves.toBe('blob:after-refresh');
    expect(fetchBlobUrl).toHaveBeenNthCalledWith(2, 'file-1', 'fresh');
  });

  it('does not retry a non-auth failure', async () => {
    const fetchBlobUrl = vi
      .fn()
      .mockRejectedValue(new Error('Failed to fetch Drive audio (500).'));
    const refreshToken = vi.fn(() => Promise.resolve('fresh'));
    const resolve = createDriveTakeUrlResolver({
      getToken: () => 'live',
      refreshToken,
      fetchBlobUrl,
    });
    await expect(resolve('file-1')).rejects.toThrow(/500/);
    expect(fetchBlobUrl).toHaveBeenCalledTimes(1);
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('fails closed with no Google token at all', async () => {
    const resolve = createDriveTakeUrlResolver({
      getToken: () => null,
      refreshToken: () => Promise.resolve(null),
      fetchBlobUrl: () => Promise.resolve('blob:never'),
    });
    await expect(resolve('file-1')).rejects.toThrow('no-google-token');
  });

  it('refuses an empty file id', async () => {
    const resolve = createDriveTakeUrlResolver({
      getToken: () => 'live',
      refreshToken: () => Promise.resolve('fresh'),
      fetchBlobUrl: () => Promise.resolve('blob:never'),
    });
    await expect(resolve('')).rejects.toThrow('missing-drive-file');
  });
});
