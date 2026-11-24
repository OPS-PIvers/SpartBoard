import { describe, it, expect, vi } from 'vitest';
import type * as admin from './firebaseAdmin';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));

import {
  handleLoadSubShareFiles,
  type SubShareFilesDeps,
} from './subShareFiles';
import type { SubShareCaller } from './subShareAccess';

const NOW = 1_700_000_000_000;
const SUB = 'sesub@orono.k12.mn.us';
const ROSTER_FILE = 'roster-file-0001';
const NAMES_FILE = 'names-file-00001';

const caller = (over: Partial<SubShareCaller> = {}): SubShareCaller => ({
  uid: 'sub-uid',
  email: SUB,
  emailVerified: true,
  anonymous: false,
  studentRole: false,
  ...over,
});

const shareDoc = (over: Record<string, unknown> = {}) => ({
  intendedMode: 'substitute',
  expiresAt: NOW + 60_000,
  hostUid: 'teacher-uid',
  subEmails: [SUB],
  sharedRosters: [{ id: 'r1', name: 'Homeroom', driveFileId: ROSTER_FILE }],
  namesFileId: NAMES_FILE,
  ...over,
});

const dbWith = (
  share: Record<string, unknown> | null,
  subSwitch: Record<string, unknown> | null = null
) =>
  ({
    doc: (path: string) => {
      const data =
        path === 'global_permissions/substitute-sharing' ? subSwitch : share;
      return {
        get: () =>
          Promise.resolve({
            exists: data !== null,
            data: () => data ?? undefined,
          }),
      };
    },
  }) as unknown as admin.firestore.Firestore;

const deps = (over: Partial<SubShareFilesDeps> = {}): SubShareFilesDeps => ({
  now: () => NOW,
  isStaff: () => Promise.resolve(true),
  getHostToken: () => Promise.resolve('host-token'),
  download: (_token, fileId) =>
    Promise.resolve(
      fileId === NAMES_FILE ? { version: 1, boards: {} } : [{ id: 's1' }]
    ),
  cache: new Map(),
  ...over,
});

const load = (
  share: Record<string, unknown> | null,
  d = deps(),
  who: SubShareCaller | null = caller(),
  subSwitch: Record<string, unknown> | null = null
) =>
  handleLoadSubShareFiles(
    dbWith(share, subSwitch),
    who,
    { shareId: 'share-1' },
    d
  );

describe('handleLoadSubShareFiles', () => {
  it("returns the class lists and names read with the teacher's token", async () => {
    const download = vi.fn(deps().download);
    const result = await load(shareDoc(), deps({ download }));
    expect(result).toEqual({
      status: 'ok',
      rosters: [{ id: 'r1', body: [{ id: 's1' }] }],
      names: { version: 1, boards: {} },
      missing: 0,
    });
    expect(download).toHaveBeenCalledWith('host-token', ROSTER_FILE);
    expect(download).toHaveBeenCalledWith('host-token', NAMES_FILE);
  });

  it('refuses a sub the share does not name, before any Drive call', async () => {
    const getHostToken = vi.fn(() => Promise.resolve('host-token'));
    await expect(
      load(
        shareDoc({ subEmails: ['other@orono.k12.mn.us'] }),
        deps({ getHostToken })
      )
    ).rejects.toThrow('does not name you');
    expect(getHostToken).not.toHaveBeenCalled();
  });

  it('refuses every sub while the substitute-sharing switch is off', async () => {
    const getHostToken = vi.fn(() => Promise.resolve('host-token'));
    await expect(
      load(shareDoc(), deps({ getHostToken }), caller(), { enabled: false })
    ).rejects.toThrow('turned off');
    expect(getHostToken).not.toHaveBeenCalled();
    await expect(
      load(shareDoc(), deps(), caller(), { enabled: true })
    ).resolves.toMatchObject({ status: 'ok', missing: 0 });
  });

  it('serves a repeat read from the brief cache, and re-reads once it lapses', async () => {
    let now = NOW;
    const download = vi.fn(deps().download);
    const d = deps({ download, now: () => now });
    const share = shareDoc({ expiresAt: NOW + 3_600_000 });
    await load(share, d);
    await load(share, d);
    expect(download).toHaveBeenCalledTimes(2);
    now += 60_000;
    await load(share, d);
    expect(download).toHaveBeenCalledTimes(4);
  });

  it('still checks access before serving a cached read', async () => {
    const d = deps();
    await load(shareDoc(), d);
    await expect(
      load(shareDoc({ subEmails: ['other@orono.k12.mn.us'] }), d)
    ).rejects.toThrow('does not name you');
    await expect(
      load(shareDoc(), d, caller(), { enabled: false })
    ).rejects.toThrow('turned off');
  });

  it('does not cache a read with a missing file', async () => {
    const download = vi.fn((_t: string, fileId: string) =>
      Promise.resolve(fileId === NAMES_FILE ? null : [{ id: 's1' }])
    );
    const d = deps({ download });
    await load(shareDoc(), d);
    await load(shareDoc(), d);
    expect(download).toHaveBeenCalledTimes(4);
  });

  it('refuses an expired share', async () => {
    await expect(load(shareDoc({ expiresAt: NOW - 1 }))).rejects.toThrow(
      'expired'
    );
  });

  it('refuses a student, an unverified address and a non-staff account', async () => {
    await expect(
      load(shareDoc(), deps(), caller({ studentRole: true }))
    ).rejects.toThrow('staff accounts');
    await expect(
      load(shareDoc(), deps(), caller({ emailVerified: false }))
    ).rejects.toThrow('verified district account');
    await expect(
      load(shareDoc(), deps({ isStaff: () => Promise.resolve(false) }))
    ).rejects.toThrow('staff accounts');
  });

  it('says the teacher must reconnect when no Drive grant is stored', async () => {
    const result = await load(
      shareDoc(),
      deps({ getHostToken: () => Promise.resolve(null) })
    );
    expect(result).toEqual({ status: 'needs-host' });
  });

  it('counts a file that could not be read as missing', async () => {
    const result = await load(
      shareDoc(),
      deps({
        download: (_t, fileId) =>
          Promise.resolve(fileId === NAMES_FILE ? null : [{ id: 's1' }]),
      })
    );
    expect(result).toMatchObject({ status: 'ok', names: null, missing: 1 });
  });

  it('reads only the files the share lists, skipping a malformed id', async () => {
    const download = vi.fn(deps().download);
    await load(
      shareDoc({
        sharedRosters: [{ id: 'r1', driveFileId: '../etc' }],
        namesFileId: undefined,
      }),
      deps({ download })
    );
    expect(download).not.toHaveBeenCalled();
  });
});
