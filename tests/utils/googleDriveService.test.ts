/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleDriveService } from '@/utils/googleDriveService';
import { Dashboard } from '@/types';

// Helper to mock fetch responses
const mockFetch = (
  response: Partial<Response> | Promise<Partial<Response>>
) => {
  return vi.spyOn(global, 'fetch').mockImplementation(async () => {
    const resolvedResponse = await Promise.resolve(response);
    return {
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      blob: () => Promise.resolve(new Blob()),
      headers: new Headers(),
      ...resolvedResponse,
    } as Response;
  });
};

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;
  const accessToken = 'mock-access-token';

  beforeEach(() => {
    service = new GoogleDriveService(accessToken);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listFiles', () => {
    it('should list files with correct query params', async () => {
      const mockFiles = [{ id: '1', name: 'file1' }];
      const fetchSpy = mockFetch({
        json: () => Promise.resolve({ files: mockFiles }),
      });

      const files = await service.listFiles("name = 'test'");

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://www.googleapis.com/drive/v3/files'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${accessToken}`,
          }),
        })
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('q=name+%3D+%27test%27'),
        expect.anything()
      );
      expect(files).toEqual(mockFiles);
    });

    it('should handle 401 error', async () => {
      mockFetch({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(service.listFiles()).rejects.toThrow(
        'Google Drive access expired. Please sign in again.'
      );
    });

    it('should handle generic errors', async () => {
      mockFetch({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(service.listFiles()).rejects.toThrow(
        'Failed to list Drive files: Internal Server Error (500)'
      );
    });
  });

  describe('getOrCreateFolder', () => {
    it('should return existing folder ID if found', async () => {
      const mockFolder = { id: 'folder-1', name: 'TestFolder' };
      const fetchSpy = mockFetch({
        json: () => Promise.resolve({ files: [mockFolder] }),
      });

      const folderId = await service.getOrCreateFolder('TestFolder');

      expect(fetchSpy).toHaveBeenCalledTimes(1); // Only listFiles called
      expect(folderId).toBe(mockFolder.id);
    });

    it('should create folder if not found', async () => {
      // First call (listFiles) returns empty
      // Second call (create) returns new folder
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ id: 'new-folder-id', name: 'TestFolder' }),
        } as Response);

      const folderId = await service.getOrCreateFolder('TestFolder');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      // Check create call
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://www.googleapis.com/drive/v3/files',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'TestFolder',
            mimeType: 'application/vnd.google-apps.folder',
          }),
        })
      );
      expect(folderId).toBe('new-folder-id');
    });
  });

  describe('uploadFile', () => {
    it('should upload file correctly', async () => {
      // Mock getFolderPath calls (2 levels: App -> Misc)
      // Mock listFiles for getFolderPath (assume exists)
      const mockAppFolder = { id: 'app-folder-id' };
      const mockMiscFolder = { id: 'misc-folder-id' };
      const mockFile = { id: 'file-id', webViewLink: 'link' };

      const fetchSpy = vi
        .spyOn(global, 'fetch')
        // 1. getAppFolder -> listFiles
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [mockAppFolder] }),
        } as Response)
        // 2. getFolderPath -> listFiles for Misc
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [mockMiscFolder] }),
        } as Response)
        // 3. create metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'file-id' }),
        } as Response)
        // 4. upload content
        .mockResolvedValueOnce({
          ok: true,
        } as Response)
        // 5. get details
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockFile),
        } as Response);

      const file = new Blob(['test content'], { type: 'text/plain' });
      const result = await service.uploadFile(file, 'test.txt');

      expect(result).toEqual(mockFile);
      expect(fetchSpy).toHaveBeenCalledTimes(5);
    });
  });

  describe('exportDashboard', () => {
    const mockDashboard: Dashboard = {
      id: 'd1',
      name: 'Test Dash',
      widgets: [],
      createdAt: 123,
      background: 'bg-1',
    };

    it('should update existing file by ID', async () => {
      const dashboardWithId = { ...mockDashboard, driveFileId: 'existing-id' };

      // Mock getFolderPath (2 calls: App -> Dashboards)
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        // 1. getAppFolder -> listFiles
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [{ id: 'app-folder' }] }),
        } as Response)
        // 2. getFolderPath -> listFiles for Dashboards
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [{ id: 'dashboards-folder' }] }),
        } as Response)
        // 3. update content (PATCH)
        .mockResolvedValueOnce({
          ok: true,
        } as Response);

      const fileId = await service.exportDashboard(dashboardWithId);

      expect(fileId).toBe('existing-id');
      expect(fetchSpy).toHaveBeenLastCalledWith(
        expect.stringContaining('/files/existing-id'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should create new file if ID not present and name not found', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        // 1. getAppFolder -> listFiles
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [{ id: 'app-folder' }] }),
        } as Response)
        // 2. getFolderPath -> listFiles for Dashboards
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [{ id: 'dashboards-folder' }] }),
        } as Response)
        // 3. search by name (returns empty)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: [] }),
        } as Response)
        // 4. create metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'new-file-id' }),
        } as Response)
        // 5. upload content
        .mockResolvedValueOnce({
          ok: true,
        } as Response);

      const fileId = await service.exportDashboard(mockDashboard);

      expect(fileId).toBe('new-file-id');
      // Verify metadata creation
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"Test Dash.spart"'),
        })
      );
    });
  });

  describe('importDashboard', () => {
    it('should fetch and return dashboard JSON', async () => {
      const mockData = { id: 'd1', name: 'Imported' };
      const fetchSpy = mockFetch({
        json: () => Promise.resolve(mockData),
      });

      const result = await service.importDashboard('file-id');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/files/file-id?alt=media'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${accessToken}`,
          }),
        })
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('deleteFile', () => {
    it('should send DELETE request', async () => {
      const fetchSpy = mockFetch({ ok: true });

      await service.deleteFile('file-id');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/files/file-id'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should ignore 404 (already deleted)', async () => {
      mockFetch({ ok: false, status: 404 });
      await expect(service.deleteFile('file-id')).resolves.not.toThrow();
    });
  });

  describe('makePublic', () => {
    it('should share with domain when a non-consumer domain is provided', async () => {
      const fetchSpy = mockFetch({ ok: true });
      await service.makePublic('file-id', 'school.edu');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/permissions'),
        expect.objectContaining({
          body: JSON.stringify({
            role: 'reader',
            type: 'domain',
            domain: 'school.edu',
          }),
        })
      );
    });

    it('should fall back to anyone-with-link for consumer domains', async () => {
      const fetchSpy = mockFetch({ ok: true });
      await service.makePublic('file-id', 'gmail.com');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/permissions'),
        expect.objectContaining({
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        })
      );
    });

    it('should fall back to anyone-with-link when no domain is provided', async () => {
      const fetchSpy = mockFetch({ ok: true });
      await service.makePublic('file-id');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/permissions'),
        expect.objectContaining({
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        })
      );
    });
  });

  describe('updateFileContent', () => {
    it('should perform a network request to update file content', async () => {
      const fetchSpy = mockFetch({ ok: true });
      const blob = new Blob(['updated content'], { type: 'text/plain' });
      await service.updateFileContent('file-id', blob);
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  describe('downloadFile', () => {
    it('should fetch and return file blob', async () => {
      const expectedBlob = new Blob(['file content'], { type: 'text/plain' });
      const fetchSpy = mockFetch({
        blob: () => Promise.resolve(expectedBlob),
      });
      const result = await service.downloadFile('file-id');
      expect(fetchSpy).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Blob);
      // Narrow equality check to verify we return the blob from fetch
      expect(result).toBe(expectedBlob);
    });
  });

  describe('getBackgroundImages', () => {
    it('should delegate to listFiles and return the result', async () => {
      const mockImages = [
        { id: 'bg1', name: 'Background 1' },
        { id: 'bg2', name: 'Background 2' },
      ];
      const listFilesSpy = vi
        .spyOn(service, 'listFiles')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        .mockResolvedValue(mockImages as any);
      const result = await service.getBackgroundImages();
      expect(listFilesSpy).toHaveBeenCalled();
      expect(result).toEqual(mockImages);
    });
  });
});
