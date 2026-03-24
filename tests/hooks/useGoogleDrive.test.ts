import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useAuth } from '@/context/useAuth';
import { APP_NAME } from '@/config/constants';

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/utils/googleDriveService', () => {
  return {
    GoogleDriveService: class {
      uploadFile = vi.fn();
      makePublic = vi.fn();
      findFolder = vi.fn();
      listFiles = vi.fn();
      getFileMetadata = vi.fn();
      exportFileText = vi.fn();
    },
  };
});

describe('useGoogleDrive', () => {
  const mockUseAuth = useAuth as Mock;
  const mockRefreshGoogleToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when unauthenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        googleAccessToken: null,
        refreshGoogleToken: mockRefreshGoogleToken,
        user: null,
      });
    });

    it('initializes correctly without an access token', () => {
      const { result } = renderHook(() => useGoogleDrive());
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isInitialized).toBe(false);
      expect(result.current.userDomain).toBeUndefined();
      expect(result.current.driveService).toBeNull();
    });

    it('throws error when uploadBackgroundToDrive is called', async () => {
      const { result } = renderHook(() => useGoogleDrive());
      const mockFile = new File(['dummy content'], 'test.png', {
        type: 'image/png',
      });

      await expect(
        result.current.uploadBackgroundToDrive(mockFile)
      ).rejects.toThrow('Google Drive is not connected. Please sign in again.');
    });

    it('returns empty array when getUserBackgroundsFromDrive is called', async () => {
      const { result } = renderHook(() => useGoogleDrive());
      let backgrounds;
      await act(async () => {
        backgrounds = await result.current.getUserBackgroundsFromDrive();
      });

      expect(backgrounds).toEqual([]);
    });

    it('returns null when getDriveFileTextContent is called', async () => {
      const { result } = renderHook(() => useGoogleDrive());
      let textContent;
      await act(async () => {
        textContent =
          await result.current.getDriveFileTextContent('mock-file-id');
      });

      expect(textContent).toBeNull();
    });
  });

  describe('when authenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        googleAccessToken: 'fake-token',
        refreshGoogleToken: mockRefreshGoogleToken,
        user: { email: 'user@example.com' },
      });
    });

    it('initializes correctly with an access token', () => {
      const { result } = renderHook(() => useGoogleDrive());
      expect(result.current.isConnected).toBe(true);
      expect(result.current.isInitialized).toBe(true);
      expect(result.current.userDomain).toBe('example.com');
      expect(result.current.driveService).toBeTruthy();
    });

    describe('uploadBackgroundToDrive', () => {
      it('uploads file and returns public URL', async () => {
        const { result } = renderHook(() => useGoogleDrive());
        const mockDriveService = result.current.driveService as unknown as {
          uploadFile: Mock;
          makePublic: Mock;
        };

        mockDriveService.uploadFile.mockResolvedValue({ id: 'mock-file-id' });
        mockDriveService.makePublic.mockResolvedValue(undefined);

        const mockFile = new File(['dummy content'], 'test.png', {
          type: 'image/png',
        });

        let url;
        await act(async () => {
          url = await result.current.uploadBackgroundToDrive(mockFile);
        });

        expect(mockDriveService.uploadFile).toHaveBeenCalledWith(
          mockFile,
          'test.png',
          'Backgrounds'
        );
        expect(mockDriveService.makePublic).toHaveBeenCalledWith(
          'mock-file-id',
          undefined
        );
        expect(url).toBe('https://lh3.googleusercontent.com/d/mock-file-id');
      });
    });

    describe('getUserBackgroundsFromDrive', () => {
      it('returns empty array if app folder is not found', async () => {
        const { result } = renderHook(() => useGoogleDrive());
        const mockDriveService = result.current.driveService as unknown as {
          findFolder: Mock;
        };

        mockDriveService.findFolder.mockResolvedValueOnce(null);

        let backgrounds;
        await act(async () => {
          backgrounds = await result.current.getUserBackgroundsFromDrive();
        });

        expect(mockDriveService.findFolder).toHaveBeenCalledWith(APP_NAME);
        expect(backgrounds).toEqual([]);
      });

      it('returns empty array if backgrounds folder is not found', async () => {
        const { result } = renderHook(() => useGoogleDrive());
        const mockDriveService = result.current.driveService as unknown as {
          findFolder: Mock;
        };

        mockDriveService.findFolder.mockImplementation((folderName: string) => {
          if (folderName === APP_NAME) return Promise.resolve('app-folder-id');
          if (folderName === 'Backgrounds') return Promise.resolve(null);
          return Promise.resolve(null);
        });

        let backgrounds;
        await act(async () => {
          backgrounds = await result.current.getUserBackgroundsFromDrive();
        });

        expect(mockDriveService.findFolder).toHaveBeenCalledWith(
          'Backgrounds',
          'app-folder-id'
        );
        expect(backgrounds).toEqual([]);
      });

      it('returns array of mapped file URLs', async () => {
        const { result } = renderHook(() => useGoogleDrive());
        const mockDriveService = result.current.driveService as unknown as {
          findFolder: Mock;
          listFiles: Mock;
        };

        mockDriveService.findFolder.mockImplementation((folderName: string) => {
          if (folderName === APP_NAME) return Promise.resolve('app-folder-id');
          if (folderName === 'Backgrounds')
            return Promise.resolve('bg-folder-id');
          return Promise.resolve(null);
        });

        mockDriveService.listFiles.mockResolvedValue([
          { id: 'file-1' },
          { id: 'file-2' },
        ]);

        let backgrounds;
        await act(async () => {
          backgrounds = await result.current.getUserBackgroundsFromDrive();
        });

        expect(mockDriveService.listFiles).toHaveBeenCalledWith(
          "mimeType contains 'image/' and 'bg-folder-id' in parents and trashed = false",
          'createdTime desc'
        );
        expect(backgrounds).toEqual([
          'https://lh3.googleusercontent.com/d/file-1',
          'https://lh3.googleusercontent.com/d/file-2',
        ]);
      });
    });

    describe('getDriveFileTextContent', () => {
      it('returns text content if successful', async () => {
        const { result } = renderHook(() => useGoogleDrive());
        const mockDriveService = result.current.driveService as unknown as {
          getFileMetadata: Mock;
          exportFileText: Mock;
        };

        mockDriveService.getFileMetadata.mockResolvedValue({
          mimeType: 'text/plain',
        });
        mockDriveService.exportFileText.mockResolvedValue('mock text content');

        let textContent;
        await act(async () => {
          textContent =
            await result.current.getDriveFileTextContent('mock-file-id');
        });

        expect(mockDriveService.getFileMetadata).toHaveBeenCalledWith(
          'mock-file-id'
        );
        expect(mockDriveService.exportFileText).toHaveBeenCalledWith(
          'mock-file-id',
          'text/plain'
        );
        expect(textContent).toBe('mock text content');
      });

      it('returns null and logs error if extraction fails', async () => {
        const { result } = renderHook(() => useGoogleDrive());
        const mockDriveService = result.current.driveService as unknown as {
          getFileMetadata: Mock;
        };
        const consoleErrorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => undefined);

        mockDriveService.getFileMetadata.mockRejectedValue(
          new Error('API Error')
        );

        let textContent;
        await act(async () => {
          textContent =
            await result.current.getDriveFileTextContent('mock-file-id');
        });

        expect(textContent).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to extract text from Drive file:',
          expect.any(Error)
        );

        consoleErrorSpy.mockRestore();
      });
    });
  });
});
