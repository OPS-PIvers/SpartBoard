import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeckAccessError,
  DeckDrive,
  deckErrorFor,
  readDeckForCheck,
} from './deckDrive';
import {
  DriveAuthError,
  setDriveAuthErrorHandler,
  onDriveTokenChange,
} from '@/utils/driveAuthErrors';
import { readDeckState, setDeckSharing } from '@/utils/course/deckSharing';

const DOMAIN = 'orono.k12.mn.us';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function forbidden(reason: string): Response {
  return json(403, { error: { code: 403, errors: [{ reason }] } });
}

describe('DeckDrive', () => {
  const toast = vi.fn();
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    toast.mockReset();
    onDriveTokenChange(`t-${Math.random()}`);
    setDriveAuthErrorHandler(toast);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    setDriveAuthErrorHandler(null);
    vi.unstubAllGlobals();
  });

  it('reads a deck the teacher cannot share as unknown, with no sign-in toast', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/permissions')
          ? forbidden('insufficientFilePermissions')
          : json(200, { modifiedTime: '2026-11-16T10:00:00Z' })
      )
    );
    const drive = new DeckDrive('tok', () => Promise.resolve(null));
    const state = await readDeckState(drive, 'deck123456', DOMAIN);
    expect(state).toEqual({
      sharing: 'unknown',
      modifiedAt: Date.parse('2026-11-16T10:00:00Z'),
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it('refuses to share a deck it cannot change without a sign-in toast', async () => {
    fetchMock.mockResolvedValue(forbidden('insufficientFilePermissions'));
    const drive = new DeckDrive('tok', () => Promise.resolve(null));
    const err = await setDeckSharing(
      drive,
      'deck123456',
      'domain',
      DOMAIN
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeckAccessError);
    expect((err as DeckAccessError).reason).toBe('no-access');
    expect(toast).not.toHaveBeenCalled();
  });

  it('a 403 on removing public access is a deck error, not a sign-in error', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'DELETE'
          ? forbidden('insufficientFilePermissions')
          : json(200, {
              permissions: [{ id: 'anyoneWithLink', type: 'anyone' }],
            })
      )
    );
    const drive = new DeckDrive('tok', () => Promise.resolve(null));
    await expect(
      setDeckSharing(drive, 'deck123456', 'domain', DOMAIN)
    ).rejects.toBeInstanceOf(DeckAccessError);
    expect(toast).not.toHaveBeenCalled();
  });

  it('refreshes the token once on a 401 and retries', async () => {
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(
      json(200, {
        permissions: [{ id: 'd', type: 'domain', domain: DOMAIN }],
      })
    );
    const refresh = vi.fn(() => Promise.resolve('fresh'));
    const drive = new DeckDrive('tok', refresh);
    await expect(drive.listFilePermissions('deck123456')).resolves.toEqual([
      { id: 'd', type: 'domain', domain: DOMAIN },
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer fresh');
  });

  it('a 401 that survives the refresh fires the sign-in toast', async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    const drive = new DeckDrive('tok', () => Promise.resolve(null));
    await expect(
      drive.getFileModifiedTime('deck123456')
    ).rejects.toBeInstanceOf(DriveAuthError);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('follows every page of permissions', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(200, {
          nextPageToken: 'p2',
          permissions: [{ id: 'a', type: 'user' }],
        })
      )
      .mockResolvedValueOnce(
        json(200, { permissions: [{ id: 'b', type: 'anyone' }] })
      );
    const drive = new DeckDrive('tok', () => Promise.resolve(null));
    const perms = await drive.listFilePermissions('deck123456');
    expect(perms.map((p) => p.id)).toEqual(['a', 'b']);
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=p2');
  });
});

describe('readDeckForCheck', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gives no reading when sign-in or the network fails, so no check is written', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json(401, {})))
    );
    const drive = new DeckDrive('tok', () => Promise.resolve(null));
    await expect(
      readDeckForCheck(drive, 'deck123456', DOMAIN)
    ).resolves.toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline')))
    );
    await expect(
      readDeckForCheck(drive, 'deck123456', DOMAIN)
    ).resolves.toBeNull();
  });

  it('reads a deck Drive refuses as unknown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json(404, {})))
    );
    const drive = new DeckDrive('tok', () => Promise.resolve(null));
    await expect(
      readDeckForCheck(drive, 'deck123456', DOMAIN)
    ).resolves.toEqual({
      sharing: 'unknown',
      modifiedAt: null,
    });
  });
});

describe('deckErrorFor', () => {
  beforeEach(() => setDriveAuthErrorHandler(null));

  it('treats a missing Drive scope as a sign-in error', () => {
    expect(
      deckErrorFor(
        403,
        JSON.stringify({
          error: { errors: [{ reason: 'insufficientPermissions' }] },
        })
      )
    ).toBeInstanceOf(DriveAuthError);
    expect(
      deckErrorFor(
        403,
        JSON.stringify({
          error: {
            status: 'PERMISSION_DENIED',
            details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
          },
        })
      )
    ).toBeInstanceOf(DriveAuthError);
  });

  it('names a sharing policy refusal and a missing file', () => {
    const policy = deckErrorFor(
      403,
      JSON.stringify({
        error: { errors: [{ reason: 'publishOutNotPermitted' }] },
      })
    );
    expect(policy).toBeInstanceOf(DeckAccessError);
    expect((policy as DeckAccessError).reason).toBe('policy');
    expect((deckErrorFor(404, '') as DeckAccessError).reason).toBe('not-found');
    expect((deckErrorFor(403, 'not json') as DeckAccessError).reason).toBe(
      'no-access'
    );
  });

  it('treats a Drive rate limit as a passing failure, not a refusal or sign-in error', () => {
    const err = deckErrorFor(
      403,
      JSON.stringify({
        error: { code: 403, errors: [{ reason: 'userRateLimitExceeded' }] },
      })
    );
    expect(err).not.toBeInstanceOf(DeckAccessError);
    expect(err).not.toBeInstanceOf(DriveAuthError);
  });
});
