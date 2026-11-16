import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { Course } from '@/utils/course/contract';
import type { DrivePermission } from '@/utils/googleDriveService';

const showConfirm = vi.fn();
const openPicker = vi.fn();

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'teacher@orono.k12.mn.us' },
    googleAccessToken: 'tok',
    refreshGoogleToken: refreshToken,
  }),
}));
vi.mock('@/context/useDialog', () => ({ useDialog: () => ({ showConfirm }) }));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker }),
}));

const refreshToken = vi.fn(() => Promise.resolve(null));

import { AgendaSetup } from './AgendaSetup';
import { clearAgendaStatuses } from './agenda/agendaStatus';

const DOMAIN = 'orono.k12.mn.us';

function makeCourse(over: Partial<Course> = {}): Course {
  return {
    id: 'c1',
    name: 'English 9',
    teacherName: 'T',
    rosterIds: ['p2'],
    agenda: null,
    pinnedLinks: [],
    familyLink: null,
    linkId: 'link1',
    formerLinkIds: [],
    formerShareIds: [],
    rosterClassIds: {},
    deckCheck: null,
    createdAt: 0,
    updatedAt: 7,
    ...over,
  };
}

/** A tiny Drive: permissions per file; a file missing from `perms` answers 403. */
function fakeDrive(
  perms: Record<string, DrivePermission[]>,
  refuseWrites = false
) {
  let n = 0;
  const calls: string[] = [];
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = new URL(url);
    const m = /files\/([^/]+)(\/permissions)?(?:\/([^/]+))?$/.exec(u.pathname);
    const file = decodeURIComponent(m?.[1] ?? '');
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${file}${m?.[2] ? ' perms' : ''}`);
    if (!m?.[2])
      return Promise.resolve(
        new Response(JSON.stringify({ modifiedTime: '2026-11-16T10:00:00Z' }))
      );
    const list = perms[file];
    if (!list)
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 403,
              message:
                'The user does not have sufficient permissions for this file.',
              errors: [{ reason: 'insufficientFilePermissions' }],
            },
          }),
          { status: 403 }
        )
      );
    if (refuseWrites && method !== 'GET')
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 403,
              message:
                'The user does not have sufficient permissions for this file.',
              errors: [{ reason: 'insufficientFilePermissions' }],
            },
          }),
          { status: 403 }
        )
      );
    if (method === 'GET')
      return Promise.resolve(
        new Response(JSON.stringify({ permissions: list }))
      );
    if (method === 'DELETE') {
      perms[file] = list.filter((p) => p.id !== m[3]);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    const body = JSON.parse(init?.body as string) as DrivePermission;
    list.push({ ...body, id: `new${++n}` });
    return Promise.resolve(new Response(JSON.stringify({ id: `new${n}` })));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, perms };
}

describe('AgendaSetup', () => {
  beforeEach(() => {
    clearAgendaStatuses();
    showConfirm.mockReset();
    openPicker.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('makes a Course for a class with none, saves the picked deck and offers to share it with Orono', async () => {
    const drive = fakeDrive({
      newDeck1234: [{ id: 'o', type: 'user', role: 'owner' }],
    });
    const saveCourse = vi.fn(() =>
      Promise.resolve({
        courseId: 'c9',
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      })
    );
    openPicker.mockResolvedValue({
      id: 'newDeck1234',
      name: 'Speech daily',
      mimeType: '',
    });
    showConfirm.mockResolvedValue(true);
    render(
      <AgendaSetup
        group={{ course: null, rosters: [{ id: 'p3', name: 'Speech P3' }] }}
        saveCourse={saveCourse}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add agenda/i }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Select a Google Slides deck' })
    );
    await waitFor(() => expect(showConfirm).toHaveBeenCalledTimes(1));
    expect(saveCourse).toHaveBeenCalledWith({
      action: 'save',
      course: {
        name: 'Speech P3',
        rosterIds: ['p3'],
        agenda: { fileId: 'newDeck1234', title: 'Speech daily' },
      },
    });
    expect(showConfirm.mock.calls[0][1]).toMatchObject({
      title: 'Share with Orono?',
    });
    await waitFor(() =>
      expect(drive.perms.newDeck1234).toContainEqual(
        expect.objectContaining({
          type: 'domain',
          domain: DOMAIN,
          role: 'reader',
        })
      )
    );
  });

  it('changes nothing in Drive when the teacher says no', async () => {
    const drive = fakeDrive({
      newDeck1234: [{ id: 'o', type: 'user', role: 'owner' }],
    });
    openPicker.mockResolvedValue({
      id: 'newDeck1234',
      name: 'Daily',
      mimeType: '',
    });
    showConfirm.mockResolvedValue(false);
    const saveCourse = vi.fn(() =>
      Promise.resolve({
        courseId: 'c1',
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      })
    );
    render(
      <AgendaSetup
        group={{ course: makeCourse(), rosters: [{ id: 'p2', name: 'P2' }] }}
        saveCourse={saveCourse}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add agenda/i }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Select a Google Slides deck' })
    );
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(saveCourse.mock.calls[0]).toEqual([
      {
        action: 'save',
        course: {
          id: 'c1',
          expectedUpdatedAt: 7,
          agenda: { fileId: 'newDeck1234', title: 'Daily' },
        },
      },
    ]);
    expect(drive.calls.filter((c) => !c.startsWith('GET'))).toEqual([]);
  });

  it('offers to take a replaced public deck back to Orono only', async () => {
    const drive = fakeDrive({
      oldDeck12345: [
        { id: 'anyoneWithLink', type: 'anyone', role: 'reader' },
        { id: 'd', type: 'domain', domain: DOMAIN, role: 'reader' },
      ],
      newDeck1234: [
        { id: 'd2', type: 'domain', domain: DOMAIN, role: 'reader' },
      ],
    });
    openPicker.mockResolvedValue({
      id: 'newDeck1234',
      name: 'New',
      mimeType: '',
    });
    showConfirm.mockResolvedValue(true);
    const saveCourse = vi.fn(() =>
      Promise.resolve({
        courseId: 'c1',
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      })
    );
    render(
      <AgendaSetup
        group={{
          course: makeCourse({
            agenda: { fileId: 'oldDeck12345', title: 'Old deck' },
          }),
          rosters: [{ id: 'p2', name: 'P2' }],
        }}
        saveCourse={saveCourse}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /old deck/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(drive.perms.oldDeck12345).toHaveLength(1));
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(showConfirm.mock.calls[0][1]).toMatchObject({
      confirmLabel: 'Stop sharing',
      cancelLabel: 'Keep sharing',
    });
    expect(drive.perms.oldDeck12345[0].type).toBe('domain');
  });

  it('shows a deck students cannot open with a fix, and records the check', async () => {
    fakeDrive({ deck12345678: [{ id: 'o', type: 'user', role: 'owner' }] });
    const saveCourse = vi.fn(() =>
      Promise.resolve({
        courseId: 'c1',
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      })
    );
    render(
      <AgendaSetup
        group={{
          course: makeCourse({
            agenda: { fileId: 'deck12345678', title: 'Daily' },
          }),
          rosters: [{ id: 'p2', name: 'P2' }],
        }}
        saveCourse={saveCourse}
      />
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: "Students can't open the agenda",
      })
    );
    expect(
      screen.getByText("Students can't open this deck.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Share with Orono' })
    ).toBeInTheDocument();
    expect(saveCourse).toHaveBeenCalledWith({
      action: 'recordDeckCheck',
      courseId: 'c1',
      sharing: 'private',
      modifiedAt: Date.parse('2026-11-16T10:00:00Z'),
    });
  });

  it('does not write a check that matches a recent one', async () => {
    fakeDrive({ deck12345678: [{ id: 'd', type: 'domain', domain: DOMAIN }] });
    const saveCourse = vi.fn();
    render(
      <AgendaSetup
        group={{
          course: makeCourse({
            agenda: { fileId: 'deck12345678', title: 'Daily' },
            deckCheck: {
              checkedAt: Date.now(),
              sharing: 'domain',
              modifiedAt: Date.parse('2026-11-16T10:00:00Z'),
            },
          }),
          rosters: [{ id: 'p2', name: 'P2' }],
        }}
        saveCourse={saveCourse}
      />
    );
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    await act(() => Promise.resolve());
    expect(saveCourse).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('adds a pinned link as a patch of the whole list', async () => {
    fakeDrive({});
    const saveCourse = vi.fn(() =>
      Promise.resolve({
        courseId: 'c1',
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      })
    );
    render(
      <AgendaSetup
        group={{
          course: makeCourse({
            pinnedLinks: [{ title: 'Syllabus', url: 'https://example.com/s' }],
            rosterClassIds: { p2: 'cl1' },
          }),
          rosters: [{ id: 'p2', name: 'P2' }],
        }}
        saveCourse={saveCourse}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add agenda/i }));
    expect(
      screen.getByRole('button', { name: 'Copy link' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Grades' },
    });
    fireEvent.change(screen.getByLabelText('Web address'), {
      target: { value: 'example.com/grades' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(saveCourse).toHaveBeenCalled());
    expect(saveCourse).toHaveBeenCalledWith({
      action: 'save',
      course: {
        id: 'c1',
        expectedUpdatedAt: 7,
        pinnedLinks: [
          { title: 'Syllabus', url: 'https://example.com/s' },
          { title: 'Grades', url: 'https://example.com/grades' },
        ],
      },
    });
  });

  it('shares a swapped-in deck with anyone, after the confirm, while the family link is on', async () => {
    const drive = fakeDrive({
      newDeck1234: [
        { id: 'd', type: 'domain', domain: DOMAIN, role: 'reader' },
      ],
    });
    openPicker.mockResolvedValue({
      id: 'newDeck1234',
      name: 'New',
      mimeType: '',
    });
    showConfirm.mockResolvedValue(true);
    const saveCourse = vi.fn(() =>
      Promise.resolve({
        courseId: 'c1',
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      })
    );
    render(
      <AgendaSetup
        group={{
          course: makeCourse({ familyLink: { shareId: 's1', on: true } }),
          rosters: [{ id: 'p2', name: 'P2' }],
        }}
        saveCourse={saveCourse}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add agenda/i }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Select a Google Slides deck' })
    );
    await waitFor(() =>
      expect(drive.perms.newDeck1234).toContainEqual(
        expect.objectContaining({ type: 'anyone' })
      )
    );
    expect(showConfirm.mock.calls[0][1]).toMatchObject({
      title: 'Share with anyone?',
    });
  });

  it('says only the owner can change sharing on a deck Drive refuses, with no silent failure', async () => {
    fakeDrive(
      { theirDeck123: [{ id: 'o', type: 'user', role: 'owner' }] },
      true
    );
    showConfirm.mockResolvedValue(true);
    render(
      <AgendaSetup
        group={{
          course: makeCourse({
            agenda: { fileId: 'theirDeck123', title: 'Shared deck' },
            deckCheck: {
              checkedAt: Date.now(),
              modifiedAt: null,
              sharing: 'private',
            },
          }),
          rosters: [{ id: 'p2', name: 'P2' }],
        }}
        saveCourse={vi.fn(() =>
          Promise.resolve({
            courseId: 'c1',
            rostersWithoutClassPage: [],
            classLinkUnavailable: false,
          })
        )}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: "Students can't open the agenda" })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share with Orono' }));
    expect(
      await screen.findByText("Only the deck's owner can change its sharing.")
    ).toBeInTheDocument();
  });

  it('keeps its open panel and messages when a class gets its first Course', () => {
    fakeDrive({});
    const saveCourse = vi.fn(() =>
      Promise.resolve({
        courseId: 'c1',
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      })
    );
    const roster = { id: 'p3', name: 'Speech P3' };
    const { unmount } = render(
      <AgendaSetup
        group={{ course: null, rosters: [roster] }}
        saveCourse={saveCourse}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add agenda/i }));
    unmount();
    render(
      <AgendaSetup
        group={{ course: makeCourse({ rosterIds: ['p3'] }), rosters: [roster] }}
        saveCourse={saveCourse}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Select a Google Slides deck' })
    ).toBeInTheDocument();
  });
});
