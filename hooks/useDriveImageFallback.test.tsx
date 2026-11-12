import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import {
  useDriveImageFallback,
  lh3DriveFileId,
  __resetDriveImageFallbackForTests,
} from './useDriveImageFallback';

const LH3 = 'https://lh3.googleusercontent.com/d/abc_DEF-123';

const Img: React.FC<{ src: string }> = ({ src }) => {
  const image = useDriveImageFallback(src);
  return <img alt="pic" src={image.src} onError={image.onError} />;
};

const renderWithToken = (src: string, token: string | null) =>
  render(
    <AuthContext.Provider
      value={{ googleAccessToken: token } as unknown as AuthContextType}
    >
      <Img src={src} />
    </AuthContext.Provider>
  );

describe('useDriveImageFallback', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    __resetDriveImageFallbackForTests();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    URL.createObjectURL = vi.fn(() => 'blob:drive-image');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the file id from lh3 Drive links only', () => {
    expect(lh3DriveFileId(LH3)).toBe('abc_DEF-123');
    expect(lh3DriveFileId(`${LH3}=s0`)).toBe('abc_DEF-123');
    expect(lh3DriveFileId('https://example.com/d/abc')).toBeNull();
    expect(lh3DriveFileId(undefined)).toBeNull();
  });

  it('reloads a failed lh3 image through the Drive API with the token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
    });
    renderWithToken(LH3, 'tok');
    const img = screen.getByAltText('pic');
    expect(img.getAttribute('src')).toBe(LH3);

    fireEvent.error(img);

    await waitFor(() =>
      expect(img.getAttribute('src')).toBe('blob:drive-image')
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/abc_DEF-123?alt=media',
      { headers: { Authorization: 'Bearer tok' } }
    );
    // A failing blob does not start another download.
    fireEvent.error(img);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the original src when the Drive download fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    renderWithToken(LH3, 'tok');
    const img = screen.getByAltText('pic');
    fireEvent.error(img);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(img.getAttribute('src')).toBe(LH3);
  });

  it('does nothing for other hosts', () => {
    renderWithToken('https://example.com/a.png', 'tok');
    fireEvent.error(screen.getByAltText('pic'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries once the Drive token arrives after the image failed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
    });
    const view = renderWithToken(LH3, null);
    const img = screen.getByAltText('pic');
    fireEvent.error(img);
    expect(fetchMock).not.toHaveBeenCalled();

    view.rerender(
      <AuthContext.Provider
        value={{ googleAccessToken: 'late' } as unknown as AuthContextType}
      >
        <Img src={LH3} />
      </AuthContext.Provider>
    );

    await waitFor(() =>
      expect(img.getAttribute('src')).toBe('blob:drive-image')
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries with a refreshed token after a failed download', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    const view = renderWithToken(LH3, 'old');
    const img = screen.getByAltText('pic');
    fireEvent.error(img);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
    });
    view.rerender(
      <AuthContext.Provider
        value={{ googleAccessToken: 'new' } as unknown as AuthContextType}
      >
        <Img src={LH3} />
      </AuthContext.Provider>
    );
    await waitFor(() =>
      expect(img.getAttribute('src')).toBe('blob:drive-image')
    );
  });
});
