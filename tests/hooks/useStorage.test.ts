import { renderHook, act } from '@testing-library/react';
import { useStorage } from '../../hooks/useStorage';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { useAuth } from '../../context/useAuth';
import { useGoogleDrive } from '../../hooks/useGoogleDrive';

// Mock dependencies
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
  getStorage: vi.fn(() => ({})), // Return empty object as mock storage instance
  storage: {},
}));

vi.mock('../../context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useGoogleDrive', () => ({
  useGoogleDrive: vi.fn(),
}));

describe('useStorage', () => {
  const mockUploadBytes = uploadBytes as Mock;
  const mockGetDownloadURL = getDownloadURL as Mock;
  const mockRef = ref as Mock;
  const mockDeleteObject = deleteObject as Mock;
  const mockUseAuth = useAuth as Mock;
  const mockUseGoogleDrive = useGoogleDrive as Mock;

  const mockFile = new File(['dummy content'], 'test.png', {
    type: 'image/png',
  });
  const mockDriveService = {
    uploadFile: vi.fn(),
    makePublic: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks
    mockUseAuth.mockReturnValue({ isAdmin: true });
    mockUseGoogleDrive.mockReturnValue({ driveService: null });

    mockRef.mockReturnValue('mock-ref');
    mockUploadBytes.mockResolvedValue({ ref: 'mock-snapshot-ref' });
    mockGetDownloadURL.mockResolvedValue('https://firebase.storage/url');
  });

  describe('uploadFile (Firebase)', () => {
    it('should upload file to Firebase Storage and return URL', async () => {
      const { result } = renderHook(() => useStorage());

      let url;
      await act(async () => {
        url = await result.current.uploadFile('path/to/file.png', mockFile);
      });

      expect(mockRef).toHaveBeenCalledWith(
        expect.anything(),
        'path/to/file.png'
      );
      expect(mockUploadBytes).toHaveBeenCalledWith('mock-ref', mockFile);
      expect(mockGetDownloadURL).toHaveBeenCalledWith('mock-snapshot-ref');
      expect(url).toBe('https://firebase.storage/url');
      expect(result.current.uploading).toBe(false);
    });

    it('should handle errors and reset uploading state', async () => {
      const { result } = renderHook(() => useStorage());
      mockUploadBytes.mockRejectedValue(new Error('Upload failed'));

      await expect(
        act(async () => {
          await result.current.uploadFile('path/to/fail.png', mockFile);
        })
      ).rejects.toThrow('Upload failed');

      expect(result.current.uploading).toBe(false);
    });
  });

  describe('uploadBackgroundImage', () => {
    it('should upload to Firebase when user is Admin', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: true });
      const { result } = renderHook(() => useStorage());

      await act(async () => {
        await result.current.uploadBackgroundImage('user123', mockFile);
      });

      // Expect Firebase path structure
      expect(mockRef).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/users\/user123\/backgrounds\/.*-test.png/)
      );
      expect(mockUploadBytes).toHaveBeenCalled();
    });

    it('should upload to Google Drive when user is NOT Admin and Drive is connected', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: false });
      mockUseGoogleDrive.mockReturnValue({
        driveService: mockDriveService,
        userDomain: 'school.edu',
      });

      mockDriveService.uploadFile.mockResolvedValue({
        id: 'drive-file-id',
        webContentLink: 'https://drive.google.com/content-link',
      });

      const { result } = renderHook(() => useStorage());

      let url;
      await act(async () => {
        url = await result.current.uploadBackgroundImage('user123', mockFile);
      });

      expect(mockDriveService.uploadFile).toHaveBeenCalledWith(
        mockFile,
        expect.stringMatching(/background-.*-test.png/),
        'Assets/Backgrounds'
      );
      expect(mockDriveService.makePublic).toHaveBeenCalledWith(
        'drive-file-id',
        'school.edu'
      );
      expect(url).toBe('https://drive.google.com/content-link');
      expect(mockUploadBytes).not.toHaveBeenCalled();
    });

    it('should fall back to Firebase if not Admin but Drive NOT connected', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: false });
      mockUseGoogleDrive.mockReturnValue({ driveService: null }); // Drive disconnected

      const { result } = renderHook(() => useStorage());

      await act(async () => {
        await result.current.uploadBackgroundImage('user123', mockFile);
      });

      // Should hit Firebase
      expect(mockRef).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/users\/user123\/backgrounds\/.*-test.png/)
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file from Firebase Storage', async () => {
      const { result } = renderHook(() => useStorage());

      await act(async () => {
        await result.current.deleteFile('path/to/delete.png');
      });

      expect(mockRef).toHaveBeenCalledWith(
        expect.anything(),
        'path/to/delete.png'
      );
      expect(mockDeleteObject).toHaveBeenCalledWith('mock-ref');
    });

    it('should skip deletion for Drive-hosted URLs without a parseable file ID', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: false });
      const mockDriveServiceLocal = {
        uploadFile: vi.fn(),
        makePublic: vi.fn(),
        deleteFile: vi.fn(),
      };
      mockUseGoogleDrive.mockReturnValue({
        driveService: mockDriveServiceLocal,
      });

      const { result } = renderHook(() => useStorage());

      await act(async () => {
        await result.current.deleteFile(
          'https://lh3.googleusercontent.com/some-image'
        );
      });

      expect(mockDeleteObject).not.toHaveBeenCalled();
      expect(mockDriveServiceLocal.deleteFile).not.toHaveBeenCalled();
    });

    it('should delete file from Google Drive when URL contains a file ID', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: false });
      const mockDriveServiceLocal = {
        uploadFile: vi.fn(),
        makePublic: vi.fn(),
        deleteFile: vi.fn().mockResolvedValue(undefined),
      };
      mockUseGoogleDrive.mockReturnValue({
        driveService: mockDriveServiceLocal,
      });

      const { result } = renderHook(() => useStorage());

      await act(async () => {
        await result.current.deleteFile(
          'https://drive.google.com/file/d/abc123xyz/view'
        );
      });

      expect(mockDeleteObject).not.toHaveBeenCalled();
      expect(mockDriveServiceLocal.deleteFile).toHaveBeenCalledWith(
        'abc123xyz'
      );
    });
  });
});
