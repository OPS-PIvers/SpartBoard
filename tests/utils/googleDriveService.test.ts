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

  describe('fetchWithRetry (401 auto-refresh)', () => {
    it('should retry with a new token after a 401 when onTokenExpire is provided', async () => {
      const newToken = 'refreshed-token';
      const onTokenExpire = vi.fn().mockResolvedValue(newToken);
      const retryService = new GoogleDriveService(accessToken, onTokenExpire);

      const mockFiles = [{ id: '1', name: 'file1' }];
      vi.spyOn(global, 'fetch')
        // First call → 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        } as Response)
        // Retry call → 200 with data
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ files: mockFiles }),
        } as Response);

      const files = await retryService.listFiles();

      expect(onTokenExpire).toHaveBeenCalledTimes(1);
      expect(files).toEqual(mockFiles);
    });

    it('should propagate 401 as a thrown error when no onTokenExpire is provided', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      await expect(service.listFiles()).rejects.toThrow(
        'Google Drive access expired. Please sign in again.'
      );
    });
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

  describe('findFolder', () => {
    it('should generate correct query for folder by name', async () => {
      const fetchSpy = mockFetch({
        json: () => Promise.resolve({ files: [] }),
      });

      await service.findFolder('MyFolder');

      const [urlStr] = fetchSpy.mock.calls[0];
      const url = new URL(urlStr as string);
      const q = url.searchParams.get('q') ?? '';

      expect(q).toContain("name = 'MyFolder'");
      expect(q).toContain("mimeType = 'application/vnd.google-apps.folder'");
      expect(q).toContain('trashed = false');
      expect(
        (fetchSpy.mock.calls[0][1] as RequestInit)?.headers as Record<
          string,
          string
        >
      ).toMatchObject({ Authorization: `Bearer ${accessToken}` });
    });

    it('should generate correct query with parentId', async () => {
      const fetchSpy = mockFetch({
        json: () => Promise.resolve({ files: [] }),
      });

      await service.findFolder('MyFolder', 'parent123');

      const [urlStr] = fetchSpy.mock.calls[0];
      const url = new URL(urlStr as string);
      const q = url.searchParams.get('q') ?? '';

      expect(q).toContain("name = 'MyFolder'");
      expect(q).toContain("mimeType = 'application/vnd.google-apps.folder'");
      expect(q).toContain('trashed = false');
      expect(q).toContain("'parent123' in parents");
    });

    it('should return folder ID if found', async () => {
      mockFetch({
        json: () =>
          Promise.resolve({ files: [{ id: 'folder-id', name: 'MyFolder' }] }),
      });

      const folderId = await service.findFolder('MyFolder');
      expect(folderId).toBe('folder-id');
    });

    it('should return null if not found', async () => {
      mockFetch({
        json: () => Promise.resolve({ files: [] }),
      });

      const folderId = await service.findFolder('NonExistentFolder');
      expect(folderId).toBeNull();
    });
  });

  describe('createSpreadsheet', () => {
    it('should create a new spreadsheet with correct metadata', async () => {
      const fetchSpy = mockFetch({
        json: () => Promise.resolve({ id: 'sheet-1', name: 'MySheet' }),
      });

      const sheet = await service.createSpreadsheet('MySheet', 'parent-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/files'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${accessToken}`,
          }),
        })
      );

      const lastCall = fetchSpy.mock.calls[0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      const body = JSON.parse((lastCall[1] as any)?.body as string);
      expect(body).toEqual({
        name: 'MySheet',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: ['parent-123'],
      });

      expect(sheet).toEqual({
        id: 'sheet-1',
        name: 'MySheet',
        mimeType: 'application/vnd.google-apps.spreadsheet',
      });
    });

    it('creates spreadsheet without folderId (no parents in metadata)', async () => {
      const fetchSpy = mockFetch({
        json: () => Promise.resolve({ id: 'sheet-2', name: 'NoParent' }),
      });

      const sheet = await service.createSpreadsheet('NoParent');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as any)?.body as string);
      expect(body).toEqual({
        name: 'NoParent',
        mimeType: 'application/vnd.google-apps.spreadsheet',
      });
      expect(body).not.toHaveProperty('parents');

      expect(sheet).toEqual({
        id: 'sheet-2',
        name: 'NoParent',
        mimeType: 'application/vnd.google-apps.spreadsheet',
      });
    });

    it('should throw an error if creation fails', async () => {
      mockFetch({
        ok: false,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Error details'),
      });

      await expect(service.createSpreadsheet('MySheet')).rejects.toThrow(
        'Failed to create spreadsheet: Bad Request'
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

  describe('getFileMetadata', () => {
    it('should fetch file metadata correctly', async () => {
      const mockMetadata = {
        id: 'file-123',
        name: 'Test Doc',
        mimeType: 'application/vnd.google-apps.document',
      };
      const fetchSpy = mockFetch({
        json: () => Promise.resolve(mockMetadata),
      });

      const result = await service.getFileMetadata('file-123');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '/files/file-123?fields=id,name,mimeType,webViewLink,webContentLink'
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${accessToken}`,
          }),
        })
      );
      expect(result).toEqual(mockMetadata);
    });
  });

  describe('exportFileText', () => {
    it('should export Google Doc as plain text', async () => {
      const mockText = 'Extracted text content';
      const fetchSpy = mockFetch({
        text: () => Promise.resolve(mockText),
      });

      const result = await service.exportFileText(
        'file-123',
        'application/vnd.google-apps.document'
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/files/file-123/export?mimeType=text/plain'),
        expect.anything()
      );
      expect(result).toBe(mockText);
    });

    it('should export Google Spreadsheet as CSV', async () => {
      const mockText = 'col1,col2\nval1,val2';
      const fetchSpy = mockFetch({
        text: () => Promise.resolve(mockText),
      });

      const result = await service.exportFileText(
        'file-123',
        'application/vnd.google-apps.spreadsheet'
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/files/file-123/export?mimeType=text/csv'),
        expect.anything()
      );
      expect(result).toBe(mockText);
    });

    it('should download plain text files directly', async () => {
      const mockText = 'Raw text content';
      const fetchSpy = mockFetch({
        text: () => Promise.resolve(mockText),
      });

      const result = await service.exportFileText('file-123', 'text/plain');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/files/file-123?alt=media'),
        expect.anything()
      );
      expect(result).toBe(mockText);
    });

    it('should throw error for unsupported mime types', async () => {
      await expect(
        service.exportFileText('file-123', 'application/pdf')
      ).rejects.toThrow('Unsupported file type for text extraction.');
    });
  });
});
