import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const drive = {
  uploadFile: vi.fn(() => Promise.resolve({ id: 'newSlideId12345' })),
  makePublic: vi.fn(() => Promise.resolve()),
  isInAppFolder: vi.fn(() => Promise.resolve(false)),
  deleteFile: vi.fn(() => Promise.resolve()),
};

vi.mock('@/config/firebase', () => ({
  storage: {},
  db: {},
  auth: { currentUser: { uid: 'teacher-uid' } },
}));
vi.mock('./useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: drive, userDomain: '' }),
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), setDoc: vi.fn() }));
vi.mock('@/components/tours/tourTestRun', () => ({
  isTestRunProject: () => false,
}));
// Skip the cross-set reference check: every candidate reaches the Drive delete guard.
vi.mock('@/utils/guidedLearningFileRelease', () => ({
  releaseStorageFiles: vi.fn(() => Promise.resolve()),
  releaseDriveFiles: vi.fn(
    async (
      opts: { candidates: string[] },
      del: (id: string) => Promise<void>
    ) => {
      for (const id of opts.candidates) await del(id);
    }
  ),
}));

import { useStorage } from './useStorage';
import { GL_SLIDE_APP_PROPERTY } from '@/utils/driveAppFolder';

beforeEach(() => vi.clearAllMocks());

describe('useStorage Guided Learning slide ownership marker', () => {
  it('marks every Drive slide upload', async () => {
    const { result } = renderHook(() => useStorage());
    const uploaded = await result.current.uploadGuidedLearningImage(
      'teacher-uid',
      new Blob(['x'], { type: 'image/png' }),
      'slide.png'
    );
    expect(uploaded.driveFileId).toBe('newSlideId12345');
    expect(drive.uploadFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'Assets/HotspotImages',
      { [GL_SLIDE_APP_PROPERTY]: '1' }
    );
  });

  it('releases only marked files, so an imported URL naming a Hotspot image deletes nothing', async () => {
    const { result } = renderHook(() => useStorage());
    drive.isInAppFolder.mockImplementation(((
      id: string,
      _folders: string[],
      marker?: string
    ) =>
      Promise.resolve(
        marker === GL_SLIDE_APP_PROPERTY && id === 'markedSlide1234'
      )) as unknown as () => Promise<boolean>);
    await result.current.releaseGuidedLearningFiles('set-1', false, {
      storagePaths: [],
      driveFileIds: ['hotspotImage123', 'markedSlide1234'],
    });
    expect(drive.deleteFile).toHaveBeenCalledTimes(1);
    expect(drive.deleteFile).toHaveBeenCalledWith('markedSlide1234');
  });
});
