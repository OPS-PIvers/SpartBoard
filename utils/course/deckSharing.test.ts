import { describe, expect, it, vi } from 'vitest';
import {
  DeckStillPublicError,
  deckSharingOf,
  emailDomain,
  readDeckState,
  setDeckSharing,
  type DeckSharingDrive,
} from './deckSharing';
import { GoogleDriveService } from '@/utils/googleDriveService';
import type { DrivePermission } from '@/utils/googleDriveService';

const DOMAIN = 'orono.k12.mn.us';

function fakeDrive(initial: DrivePermission[]) {
  let n = 0;
  let perms = [...initial];
  const add = vi.fn(
    (
      _id: string,
      t: { type: 'domain'; domain: string } | { type: 'anyone' }
    ) => {
      perms.push({ id: `new${++n}`, role: 'reader', ...t });
      return Promise.resolve();
    }
  );
  const del = vi.fn((_id: string, permId: string) => {
    perms = perms.filter((p) => p.id !== permId);
    return Promise.resolve();
  });
  const drive: DeckSharingDrive = {
    listFilePermissions: vi.fn(() => Promise.resolve([...perms])),
    addLinkReaderPermission: add,
    deletePermission: del,
    getFileModifiedTime: vi.fn(() => Promise.resolve(1234)),
  };
  return { drive, add, del, perms: () => perms };
}

const owner: DrivePermission = { id: 'o', type: 'user', role: 'owner' };

describe('deckSharingOf', () => {
  it('reads anyone over domain over private, and only the teacher’s domain', () => {
    expect(deckSharingOf([owner], DOMAIN)).toBe('private');
    expect(
      deckSharingOf(
        [owner, { id: 'd', type: 'domain', domain: 'other.org' }],
        DOMAIN
      )
    ).toBe('private');
    expect(
      deckSharingOf(
        [owner, { id: 'd', type: 'domain', domain: 'Orono.K12.MN.US' }],
        DOMAIN
      )
    ).toBe('domain');
    expect(deckSharingOf([owner, { id: 'a', type: 'anyone' }], DOMAIN)).toBe(
      'anyone'
    );
  });

  it('finds the domain of an address', () => {
    expect(emailDomain('T@Orono.k12.mn.us')).toBe(DOMAIN);
    expect(emailDomain('nobody')).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });
});

describe('setDeckSharing', () => {
  it('shares a private deck with Orono only', async () => {
    const { drive, add, perms } = fakeDrive([owner]);
    await setDeckSharing(drive, 'f', 'domain', DOMAIN);
    expect(deckSharingOf(perms(), DOMAIN)).toBe('domain');
    expect(add).toHaveBeenCalledWith('f', {
      type: 'domain',
      domain: DOMAIN,
    });
  });

  it('makes a deck public for the family link and keeps the Orono permission', async () => {
    const { drive, perms } = fakeDrive([owner]);
    await setDeckSharing(drive, 'f', 'anyone', DOMAIN);
    expect(perms().map((p) => p.type)).toEqual(['user', 'domain', 'anyone']);
  });

  it('sets a public deck back to Orono only (D23)', async () => {
    const { drive, perms } = fakeDrive([owner, { id: 'a', type: 'anyone' }]);
    await setDeckSharing(drive, 'f', 'domain', DOMAIN);
    expect(perms().map((p) => p.type)).toEqual(['user', 'domain']);
    expect(deckSharingOf(perms(), DOMAIN)).toBe('domain');
  });

  it('changes nothing when the deck is already shared as asked', async () => {
    const { drive, add, del } = fakeDrive([
      owner,
      { id: 'd', type: 'domain', domain: DOMAIN },
    ]);
    await setDeckSharing(drive, 'f', 'domain', DOMAIN);
    expect(add).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});

describe('setDeckSharing failures', () => {
  it('removes public access before adding Orono, so a failed add never leaves the deck public', async () => {
    const { drive, perms } = fakeDrive([owner, { id: 'a', type: 'anyone' }]);
    drive.addLinkReaderPermission = vi.fn(() =>
      Promise.reject(new Error('domain sharing blocked'))
    );
    await expect(setDeckSharing(drive, 'f', 'domain', DOMAIN)).rejects.toThrow(
      'blocked'
    );
    expect(perms().some((p) => p.type === 'anyone')).toBe(false);
  });

  it('says so when a public permission could not be removed', async () => {
    const { drive } = fakeDrive([owner, { id: 'a', type: 'anyone' }]);
    drive.deletePermission = vi.fn(() => Promise.resolve());
    await expect(
      setDeckSharing(drive, 'f', 'domain', DOMAIN)
    ).rejects.toBeInstanceOf(DeckStillPublicError);
  });
});

describe('readDeckState', () => {
  it('reports sharing and last-modified time', async () => {
    const { drive } = fakeDrive([
      owner,
      { id: 'd', type: 'domain', domain: DOMAIN },
    ]);
    expect(await readDeckState(drive, 'f', DOMAIN)).toEqual({
      sharing: 'domain',
      modifiedAt: 1234,
    });
  });

  it('reads a refused part as unknown', async () => {
    const { drive } = fakeDrive([]);
    drive.listFilePermissions = vi.fn(() => Promise.reject(new Error('403')));
    drive.getFileModifiedTime = vi.fn(() => Promise.reject(new Error('404')));
    expect(await readDeckState(drive, 'f', DOMAIN)).toEqual({
      sharing: 'unknown',
      modifiedAt: null,
    });
  });
});

describe('GoogleDriveService deck calls (mocked fetch)', () => {
  it('lists the domain field, adds a link permission without discovery, and reads modifiedTime', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      const href = typeof url === 'string' ? url : (url as URL).toString();
      calls.push({
        url: href,
        body: typeof init?.body === 'string' ? init.body : '',
      });
      const body = href.includes('modifiedTime')
        ? { modifiedTime: '2026-11-16T10:00:00.000Z' }
        : { permissions: [{ id: 'd', type: 'domain', domain: DOMAIN }] };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(''),
      } as Response);
    });
    const drive = new GoogleDriveService('token');
    expect(await drive.listFilePermissions('f')).toEqual([
      { id: 'd', type: 'domain', domain: DOMAIN },
    ]);
    expect(calls[0].url).toContain('domain');
    await drive.addLinkReaderPermission('f', { type: 'anyone' });
    expect(JSON.parse(calls[1].body)).toEqual({
      role: 'reader',
      allowFileDiscovery: false,
      type: 'anyone',
    });
    expect(await drive.getFileModifiedTime('f')).toBe(
      Date.parse('2026-11-16T10:00:00.000Z')
    );
    vi.restoreAllMocks();
  });

  it('reads every page of permissions', async () => {
    const pages = [
      { nextPageToken: 'p2', permissions: [{ id: 'u1', type: 'user' }] },
      { permissions: [{ id: 'a', type: 'anyone' }] },
    ];
    const urls: string[] = [];
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = typeof url === 'string' ? url : (url as URL).toString();
      urls.push(href);
      const body = pages[urls.length - 1];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(''),
      } as Response);
    });
    const perms = await new GoogleDriveService('token').listFilePermissions(
      'f'
    );
    expect(perms.map((p) => p.id)).toEqual(['u1', 'a']);
    expect(urls[1]).toContain('pageToken=p2');
    expect(urls[0]).toContain('supportsAllDrives=true');
    vi.restoreAllMocks();
  });
});
