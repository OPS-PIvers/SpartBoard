import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import {
  DriveAuthError,
  setDriveAuthErrorHandler,
} from '@/utils/driveAuthErrors';
import {
  GuidedLearningDriveService,
  resetGuidedLearningDriveFolderCache,
} from './guidedLearningDriveService';

const set: GuidedLearningSet = {
  id: 'abcdef12-3456',
  title: 'Cells',
  imageUrls: [],
  steps: [],
  mode: 'structured',
  createdAt: 1,
  updatedAt: 1,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const empty = (status: number) => new Response(null, { status });

type Handler = (url: string, init: RequestInit) => Response;

let calls: { url: string; method: string; body?: string }[];
let handler: Handler;

beforeEach(() => {
  calls = [];
  resetGuidedLearningDriveFolderCache();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? init.body : undefined,
      });
      return Promise.resolve(handler(url, init));
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  setDriveAuthErrorHandler(null);
});

const service = () =>
  new GuidedLearningDriveService('token-1', { retryBaseMs: 0 });

// Folder lookups find both folders; no file with the set's name exists yet.
const driveWithFolders =
  (overrides: (url: string, method: string) => Response | null): Handler =>
  (url, init) => {
    const method = init.method ?? 'GET';
    const hit = overrides(url, method);
    if (hit) return hit;
    if (method === 'GET' && url.includes('files?q=')) {
      const q = decodeURIComponent(url);
      if (q.includes('google-apps.folder'))
        return json({ files: [{ id: 'folder-1' }] });
      return json({ files: [] });
    }
    if (method === 'POST') return json({ id: 'new-file', name: 'x' });
    if (method === 'PATCH') return empty(200);
    return empty(500);
  };

describe('GuidedLearningDriveService.saveSet', () => {
  it('makes exactly one request when the PATCH succeeds', async () => {
    handler = driveWithFolders(() => null);
    await expect(service().saveSet(set, 'file-1')).resolves.toBe('file-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'PATCH' });
    expect(calls[0].url).toContain('/files/file-1?uploadType=media');
  });

  it('writes compact JSON', async () => {
    handler = driveWithFolders(() => null);
    await service().saveSet(set, 'file-1');
    expect(calls[0].body).toBe(JSON.stringify(set));
  });

  it('falls through to lookup and create on 404', async () => {
    handler = driveWithFolders((url, method) =>
      method === 'PATCH' && url.includes('/files/file-1') ? empty(404) : null
    );
    await expect(service().saveSet(set, 'file-1')).resolves.toBe('new-file');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('retries a 500 and succeeds without creating a new file', async () => {
    let patches = 0;
    handler = driveWithFolders((_url, method) => {
      if (method !== 'PATCH') return null;
      patches += 1;
      return patches < 3 ? empty(500) : empty(200);
    });
    await expect(service().saveSet(set, 'file-1')).resolves.toBe('file-1');
    expect(patches).toBe(3);
    expect(calls.every((c) => c.method === 'PATCH')).toBe(true);
  });

  it('retries a 429', async () => {
    let patches = 0;
    handler = driveWithFolders((_url, method) => {
      if (method !== 'PATCH') return null;
      patches += 1;
      return patches === 1 ? empty(429) : empty(200);
    });
    await expect(service().saveSet(set, 'file-1')).resolves.toBe('file-1');
    expect(patches).toBe(2);
  });

  it('throws after three failed tries instead of creating a duplicate', async () => {
    handler = driveWithFolders((_url, method) =>
      method === 'PATCH' ? empty(503) : null
    );
    await expect(service().saveSet(set, 'file-1')).rejects.toThrow(
      'Failed to save guided learning set to Drive'
    );
    expect(calls).toHaveLength(3);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('surfaces a 401 as a reconnect error and reports it', async () => {
    const onAuthError = vi.fn();
    setDriveAuthErrorHandler(onAuthError);
    handler = driveWithFolders(() => empty(401));
    const err: unknown = await service()
      .saveSet(set, 'file-1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DriveAuthError);
    expect((err as Error).message).toContain('Reconnect Google Drive');
    expect(onAuthError).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
  });

  it('caches the folder id per token across saves', async () => {
    handler = driveWithFolders(() => null);
    const drive = service();
    await drive.saveSet(set);
    const folderLookups = () =>
      calls.filter((c) =>
        decodeURIComponent(c.url).includes('google-apps.folder')
      ).length;
    expect(folderLookups()).toBe(2);
    await drive.saveSet({ ...set, id: 'second-set' });
    await service().saveSet({ ...set, id: 'third-set' });
    expect(folderLookups()).toBe(2);
  });
});

describe('GuidedLearningDriveService.deleteSlideFile', () => {
  const meta: Record<string, { name: string; parents: string[] }> = {
    slideFileId1234: { name: 's.webp', parents: ['hotspotFolder1'] },
    rosterFileId1234: { name: 'r.json', parents: ['rosterFolder12'] },
    hotspotFolder1: { name: 'HotspotImages', parents: ['assetsFolder12'] },
    assetsFolder12: { name: 'Assets', parents: ['appFolder12345'] },
    rosterFolder12: { name: 'Rosters', parents: ['appFolder12345'] },
    appFolder12345: { name: 'SpartBoard', parents: ['root'] },
  };
  beforeEach(() => {
    handler = (url, init) => {
      if ((init.method ?? 'GET') === 'DELETE') return empty(204);
      const id = /files\/([^?]+)\?fields=/.exec(url)?.[1] ?? '';
      return meta[id] ? json(meta[id]) : empty(404);
    };
  });
  const deletes = () => calls.filter((c) => c.method === 'DELETE');

  it('deletes a slide in the app slide folder', async () => {
    await service().deleteSlideFile('slideFileId1234');
    expect(deletes().map((c) => c.url)).toEqual([
      'https://www.googleapis.com/drive/v3/files/slideFileId1234',
    ]);
  });

  it('never deletes a file outside it', async () => {
    await service().deleteSlideFile('rosterFileId1234');
    await service().deleteSlideFile('missingFileId12');
    expect(deletes()).toEqual([]);
  });
});
