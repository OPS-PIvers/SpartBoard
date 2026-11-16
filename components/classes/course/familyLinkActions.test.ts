import { describe, expect, it, vi } from 'vitest';
import type { Course } from '@/utils/course/contract';
import type { DrivePermission } from '@/utils/googleDriveService';
import type { DeckSharingDrive } from '@/utils/course/deckSharing';
import { turnFamilyLinkOff, turnFamilyLinkOn } from './familyLinkActions';

const DOMAIN = 'orono.k12.mn.us';
const FILE = '1AbCdEfGhIjKlMn';

const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  name: 'English 9',
  teacherName: 'T',
  rosterIds: ['r1'],
  agenda: { fileId: FILE, title: 'Agenda' },
  pinnedLinks: [],
  familyLink: null,
  linkId: 'l1',
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 1,
  updatedAt: 42,
  ...over,
});

type LinkTarget = { type: 'domain'; domain: string } | { type: 'anyone' };

/** A fake Drive holding one deck's permissions. */
function fakeDrive(
  start: DrivePermission[],
  opts: { refuseAnyone?: boolean; ignoreDeletes?: boolean } = {}
) {
  let perms = [...start];
  let n = 0;
  const deletePermission = vi.fn((_f: string, id: string) => {
    if (!opts.ignoreDeletes) perms = perms.filter((p) => p.id !== id);
    return Promise.resolve();
  });
  const drive: DeckSharingDrive = {
    listFilePermissions: () => Promise.resolve([...perms]),
    addLinkReaderPermission: (_f: string, target: LinkTarget) => {
      if (target.type === 'anyone' && opts.refuseAnyone)
        return Promise.reject(new Error('403 policy'));
      perms.push({
        id: `p${++n}`,
        role: 'reader',
        ...target,
      });
      return Promise.resolve();
    },
    deletePermission,
    getFileModifiedTime: () => Promise.resolve(null),
  };
  return { drive, perms: () => perms, deletePermission };
}

const domainPerm = {
  id: 'd',
  type: 'domain',
  role: 'reader',
  domain: DOMAIN,
} as DrivePermission;

describe('turnFamilyLinkOn', () => {
  it('makes the deck public, then saves only the switch with the open Course time', async () => {
    const { drive, perms } = fakeDrive([domainPerm]);
    const saveCourse = vi.fn(() =>
      Promise.resolve({
        courseId: 'c1',
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      })
    );
    expect(
      await turnFamilyLinkOn(course(), { drive, domain: DOMAIN, saveCourse })
    ).toBeNull();
    expect(perms().some((p) => p.type === 'anyone')).toBe(true);
    expect(saveCourse).toHaveBeenCalledWith({
      action: 'save',
      course: { id: 'c1', familyLinkOn: true, expectedUpdatedAt: 42 },
    });
  });

  it('does not switch on when Google refuses public sharing', async () => {
    const { drive } = fakeDrive([domainPerm], { refuseAnyone: true });
    const saveCourse = vi.fn();
    expect(
      await turnFamilyLinkOn(course(), { drive, domain: DOMAIN, saveCourse })
    ).toBe('shareFailed');
    expect(saveCourse).not.toHaveBeenCalled();
  });

  it('needs Drive only when there is a deck', async () => {
    const saveCourse = vi.fn(() =>
      Promise.resolve({
        courseId: 'c1',
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      })
    );
    expect(
      await turnFamilyLinkOn(course(), {
        drive: null,
        domain: DOMAIN,
        saveCourse,
      })
    ).toBe('noDrive');
    expect(saveCourse).not.toHaveBeenCalled();
    expect(
      await turnFamilyLinkOn(course({ agenda: null }), {
        drive: null,
        domain: null,
        saveCourse,
      })
    ).toBeNull();
  });

  it('puts a deck it made public back to Orono only when the save fails', async () => {
    const { drive, perms } = fakeDrive([domainPerm]);
    const saveCourse = vi.fn(() =>
      Promise.reject(
        Object.assign(new Error('x'), { code: 'functions/failed-precondition' })
      )
    );
    expect(
      await turnFamilyLinkOn(course(), { drive, domain: DOMAIN, saveCourse })
    ).toBe('stale');
    expect(perms().some((p) => p.type === 'anyone')).toBe(false);
  });

  it('leaves a deck that was already public alone when the save fails', async () => {
    const anyone = {
      id: 'a',
      type: 'anyone',
      role: 'reader',
    } as DrivePermission;
    const { drive, perms } = fakeDrive([domainPerm, anyone]);
    const saveCourse = vi.fn(() => Promise.reject(new Error('down')));
    expect(
      await turnFamilyLinkOn(course(), { drive, domain: DOMAIN, saveCourse })
    ).toBe('saveFailed');
    expect(perms().some((p) => p.type === 'anyone')).toBe(true);
  });
});

describe('turnFamilyLinkOff', () => {
  const anyone = { id: 'a', type: 'anyone', role: 'reader' } as DrivePermission;
  const ok = () =>
    vi.fn(() =>
      Promise.resolve({
        courseId: 'c1',
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      })
    );

  it('saves the link off, then sets the deck back to Orono only (D23)', async () => {
    const { drive, perms } = fakeDrive([domainPerm, anyone]);
    const saveCourse = ok();
    expect(
      await turnFamilyLinkOff(course(), true, {
        drive,
        domain: DOMAIN,
        saveCourse,
      })
    ).toBeNull();
    expect(saveCourse).toHaveBeenCalledWith({
      action: 'save',
      course: { id: 'c1', familyLinkOn: false, expectedUpdatedAt: 42 },
    });
    expect(perms().map((p) => p.type)).toEqual(['domain']);
  });

  it('keeps the deck public when the teacher unticks the offer', async () => {
    const { drive, perms } = fakeDrive([domainPerm, anyone]);
    expect(
      await turnFamilyLinkOff(course(), false, {
        drive,
        domain: DOMAIN,
        saveCourse: ok(),
      })
    ).toBeNull();
    expect(perms().some((p) => p.type === 'anyone')).toBe(true);
  });

  it('never touches the deck when the save fails', async () => {
    const { drive, deletePermission } = fakeDrive([domainPerm, anyone]);
    const saveCourse = vi.fn(() => Promise.reject(new Error('down')));
    expect(
      await turnFamilyLinkOff(course(), true, {
        drive,
        domain: DOMAIN,
        saveCourse,
      })
    ).toBe('saveFailed');
    expect(deletePermission).not.toHaveBeenCalled();
  });

  it('says so when the deck is still public afterwards', async () => {
    const { drive } = fakeDrive([domainPerm, anyone], { ignoreDeletes: true });
    expect(
      await turnFamilyLinkOff(course(), true, {
        drive,
        domain: DOMAIN,
        saveCourse: ok(),
      })
    ).toBe('stillPublic');
  });

  it('reports a deck it could not reach once the link is off', async () => {
    expect(
      await turnFamilyLinkOff(course(), true, {
        drive: null,
        domain: DOMAIN,
        saveCourse: ok(),
      })
    ).toBe('unshareFailed');
  });
});
