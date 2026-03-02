import { renderHook, act } from '@testing-library/react';
import { useStorage } from '../../hooks/useStorage';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { useGoogleDrive } from '../../hooks/useGoogleDrive';

// Mock dependencies
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
  getStorage: vi.fn(() => ({})),
  storage: {},
}));

vi.mock('../../context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useGoogleDrive', () => ({
  useGoogleDrive: vi.fn(),
}));

// URL.createObjectURL / revokeObjectURL — needed only for the blob URL deleteFile test
const mockRevokeObjectURL = vi.fn();
Object.defineProperty(URL, 'revokeObjectURL', {
  value: mockRevokeObjectURL,
  writable: true,
});

describe('useStorage', () => {
  const mockUploadBytes = uploadBytes as Mock;
  const mockGetDownloadURL = getDownloadURL as Mock;
  const mockRef = ref as Mock;
  const mockDeleteObject = deleteObject as Mock;
  const mockUseGoogleDrive = useGoogleDrive as Mock;

  const mockFile = new File(['dummy content'], 'test.png', {
    type: 'image/png',
  });
  const mockDriveService = {
    uploadFile: vi.fn(),
    makePublic: vi.fn(),
    deleteFile: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Drive not connected
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
    it('should upload to Google Drive when Drive is connected', async () => {
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

    it('should upload to Google Drive when Drive is connected (admin user)', async () => {
      // Admins no longer bypass Drive — they use Drive the same as non-admins
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
        url = await result.current.uploadBackgroundImage('admin123', mockFile);
      });

      expect(url).toBe('https://drive.google.com/content-link');
      expect(mockUploadBytes).not.toHaveBeenCalled();
    });

    it('should fall back to Firebase Storage when Drive is not connected', async () => {
      mockUseGoogleDrive.mockReturnValue({ driveService: null });

      const { result } = renderHook(() => useStorage());

      let url;
      await act(async () => {
        url = await result.current.uploadBackgroundImage('user123', mockFile);
      });

      expect(mockUploadBytes).toHaveBeenCalled();
      expect(url).toBe('https://firebase.storage/url');
      expect(mockDriveService.uploadFile).not.toHaveBeenCalled();
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

    it('should revoke blob URLs without hitting Firebase or Drive', async () => {
      const { result } = renderHook(() => useStorage());
      const blobUrl = 'blob:http://localhost/some-uuid';

      await act(async () => {
        await result.current.deleteFile(blobUrl);
      });

      expect(mockRevokeObjectURL).toHaveBeenCalledWith(blobUrl);
      expect(mockDeleteObject).not.toHaveBeenCalled();
    });

    it('should skip deletion for Drive-hosted URLs without a parseable file ID', async () => {
      mockUseGoogleDrive.mockReturnValue({
        driveService: mockDriveService,
      });

      const { result } = renderHook(() => useStorage());

      await act(async () => {
        await result.current.deleteFile(
          'https://lh3.googleusercontent.com/some-image'
        );
      });

      expect(mockDeleteObject).not.toHaveBeenCalled();
      expect(mockDriveService.deleteFile).not.toHaveBeenCalled();
    });

    it('should delete file from Google Drive when URL contains a file ID', async () => {
      mockUseGoogleDrive.mockReturnValue({
        driveService: mockDriveService,
      });
      mockDriveService.deleteFile.mockResolvedValue(undefined);

      const { result } = renderHook(() => useStorage());

      await act(async () => {
        await result.current.deleteFile(
          'https://drive.google.com/file/d/abc123xyz/view'
        );
      });

      expect(mockDeleteObject).not.toHaveBeenCalled();
      expect(mockDriveService.deleteFile).toHaveBeenCalledWith('abc123xyz');
    });

    it('should delete from Drive regardless of admin status', async () => {
      mockUseGoogleDrive.mockReturnValue({
        driveService: mockDriveService,
      });
      mockDriveService.deleteFile.mockResolvedValue(undefined);

      const { result } = renderHook(() => useStorage());

      await act(async () => {
        await result.current.deleteFile(
          'https://drive.google.com/file/d/admin-file-id/view'
        );
      });

      expect(mockDriveService.deleteFile).toHaveBeenCalledWith('admin-file-id');
    });

    it('should extract file ID from webContentLink uc?id= format', async () => {
      mockUseGoogleDrive.mockReturnValue({
        driveService: mockDriveService,
      });
      mockDriveService.deleteFile.mockResolvedValue(undefined);

      const { result } = renderHook(() => useStorage());

      await act(async () => {
        await result.current.deleteFile(
          'https://drive.google.com/uc?export=download&id=webContentFileId'
        );
      });

      expect(mockDeleteObject).not.toHaveBeenCalled();
      expect(mockDriveService.deleteFile).toHaveBeenCalledWith(
        'webContentFileId'
      );
    });
  });

  describe('uploadPdf', () => {
    it('should upload PDF to Google Drive when connected', async () => {
      mockUseGoogleDrive.mockReturnValue({
        driveService: mockDriveService,
        userDomain: 'school.edu',
      });
      mockDriveService.uploadFile.mockResolvedValue({
        id: 'pdf-drive-id',
        webViewLink: 'https://drive.google.com/file/d/pdf-drive-id/view',
      });

      const pdfFile = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const { result } = renderHook(() => useStorage());

      let pdfResult;
      await act(async () => {
        pdfResult = await result.current.uploadPdf('user123', pdfFile);
      });

      expect(pdfResult).toEqual({
        url: 'https://drive.google.com/file/d/pdf-drive-id/preview',
        storagePath: 'https://drive.google.com/file/d/pdf-drive-id/view',
      });
    });

    it('should fall back to Firebase Storage when Drive is not connected', async () => {
      mockUseGoogleDrive.mockReturnValue({ driveService: null });

      const pdfFile = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const { result } = renderHook(() => useStorage());

      let pdfResult: { url: string; storagePath: string } | undefined;
      await act(async () => {
        pdfResult = await result.current.uploadPdf('user123', pdfFile);
      });

      expect(mockUploadBytes).toHaveBeenCalled();
      expect(pdfResult?.url).toBe('https://firebase.storage/url');
      expect(pdfResult?.storagePath).toMatch(/users\/user123\/pdfs\/.*/);
    });
  });
});
