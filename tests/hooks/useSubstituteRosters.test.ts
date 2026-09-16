import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { useAuth } from '@/context/useAuth';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import { useSubstituteRosters } from '@/hooks/useSubstituteRosters';
import type { SubstituteShareRoster } from '@/types';

const downloadFile = vi.fn();

vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useGooglePicker', () => ({ useGooglePicker: vi.fn() }));
vi.mock('@/utils/googleDriveService', () => ({
  GoogleDriveService: function GoogleDriveService() {
    return { downloadFile };
  },
}));

const mockUseAuth = useAuth as Mock;
const mockUseGooglePicker = useGooglePicker as Mock;
const openPicker = vi.fn();
const ensureGoogleScope = vi.fn();

const SHARED: SubstituteShareRoster[] = [
  { id: 'r1', name: 'Period 1', driveFileId: 'file-1' },
];

// jsdom's Blob has no text(); the hook only calls text().
function rosterBlob(): Pick<Blob, 'text'> {
  const body = JSON.stringify({
    version: 2,
    students: [{ id: 's1', firstName: 'Ada', lastName: 'Lovelace' }],
  });
  return { text: () => Promise.resolve(body) };
}

describe('useSubstituteRosters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockUseAuth.mockReturnValue({
      googleAccessToken: 'token',
      refreshGoogleToken: vi.fn(),
      ensureGoogleScope,
    });
    mockUseGooglePicker.mockReturnValue({ openPicker });
    ensureGoogleScope.mockResolvedValue('token');
  });

  it('reports none when the share has no rosters', () => {
    const { result } = renderHook(() => useSubstituteRosters(undefined));
    expect(result.current.status).toBe('none');
    expect(result.current.rosters).toEqual([]);
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('loads silently when the sub can already read the file', async () => {
    downloadFile.mockResolvedValue(rosterBlob());
    const { result } = renderHook(() => useSubstituteRosters(SHARED));
    expect(result.current.status).toBe('checking');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.rosters[0]).toMatchObject({
      id: 'r1',
      name: 'Period 1',
      studentCount: 1,
    });
    expect(result.current.rosters[0].students[0].firstName).toBe('Ada');
    expect(openPicker).not.toHaveBeenCalled();
  });

  it('locks when the file is unreadable, then loads after the Picker grant', async () => {
    downloadFile.mockRejectedValueOnce(new Error('404'));
    const { result } = renderHook(() => useSubstituteRosters(SHARED));
    await waitFor(() => expect(result.current.status).toBe('locked'));

    openPicker.mockResolvedValue({ id: 'file-1', name: 'r', mimeType: '' });
    downloadFile.mockResolvedValue(rosterBlob());
    await act(() => result.current.loadRosters());

    expect(openPicker).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'token', fileIds: ['file-1'] })
    );
    expect(result.current.status).toBe('ready');
    expect(result.current.rosters).toHaveLength(1);
  });

  it('stays locked when the sub cancels the Picker', async () => {
    downloadFile.mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useSubstituteRosters(SHARED));
    await waitFor(() => expect(result.current.status).toBe('locked'));

    openPicker.mockResolvedValue(null);
    await act(() => result.current.loadRosters());
    expect(result.current.status).toBe('locked');
  });

  it('reports an error when the picked file still fails to load', async () => {
    downloadFile.mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useSubstituteRosters(SHARED));
    await waitFor(() => expect(result.current.status).toBe('locked'));

    openPicker.mockResolvedValue({ id: 'file-1', name: 'r', mimeType: '' });
    await act(() => result.current.loadRosters());
    expect(result.current.status).toBe('error');
    expect(result.current.rosters).toEqual([]);
  });
});
