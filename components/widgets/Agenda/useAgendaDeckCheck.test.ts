import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course } from '@/utils/course/contract';
import { useAgendaDeckCheck } from './useAgendaDeckCheck';

const h = vi.hoisted(() => ({
  drive: {},
  readDeckState: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'teacher@orono.k12.mn.us' } }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: h.drive }),
}));
vi.mock('@/config/firebase', () => ({ isAuthBypass: false }));
vi.mock('@/utils/viewAsTab', () => ({
  viewAsSuppressesBackgroundWrites: () => false,
}));
vi.mock('@/utils/course/deckSharing', () => ({
  emailDomain: (e: string) => e.split('@')[1],
  readDeckState: h.readDeckState,
}));

const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  name: 'English 9',
  teacherName: 'T',
  rosterIds: ['r1'],
  agenda: { fileId: '1AbCdEfGhIjKlMnOp', title: 'Daily' },
  pinnedLinks: [],
  familyLink: null,
  linkId: 'l1',
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.drive = {};
  h.readDeckState.mockResolvedValue({ sharing: 'domain', modifiedAt: 42 });
});

describe('useAgendaDeckCheck', () => {
  it('reads the deck with the teacher domain and records it on the Course', async () => {
    const save = vi.fn().mockResolvedValue(null);
    renderHook(() => useAgendaDeckCheck(course(), save));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        action: 'recordDeckCheck',
        courseId: 'c1',
        modifiedAt: 42,
        sharing: 'domain',
      })
    );
    expect(h.readDeckState).toHaveBeenCalledWith(
      h.drive,
      '1AbCdEfGhIjKlMnOp',
      'orono.k12.mn.us'
    );
  });

  it('skips a deck checked moments ago', () => {
    const save = vi.fn();
    renderHook(() =>
      useAgendaDeckCheck(
        course({
          deckCheck: {
            checkedAt: Date.now(),
            modifiedAt: 1,
            sharing: 'domain',
          },
        }),
        save
      )
    );
    expect(h.readDeckState).not.toHaveBeenCalled();
  });

  it('runs one check when two widgets show the same Course', async () => {
    const save = vi.fn().mockResolvedValue(null);
    renderHook(() => useAgendaDeckCheck(course(), save));
    renderHook(() => useAgendaDeckCheck(course(), save));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(h.readDeckState).toHaveBeenCalledTimes(1);
  });

  it('does nothing without Drive or an Agenda', () => {
    h.drive = null;
    renderHook(() => useAgendaDeckCheck(course(), vi.fn()));
    h.drive = {};
    renderHook(() => useAgendaDeckCheck(course({ agenda: null }), vi.fn()));
    renderHook(() => useAgendaDeckCheck(null, vi.fn()));
    expect(h.readDeckState).not.toHaveBeenCalled();
  });

  it('does not record an old deck result after the deck changed', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    h.readDeckState.mockReturnValue(new Promise((r) => (resolve = r)));
    const save = vi.fn().mockResolvedValue(null);
    const { rerender } = renderHook(
      ({ c }: { c: Course }) => useAgendaDeckCheck(c, save),
      { initialProps: { c: course() } }
    );
    h.readDeckState.mockResolvedValue({ sharing: 'anyone', modifiedAt: 7 });
    rerender({
      c: course({ agenda: { fileId: '1ZyXwVuTsRqPoNm', title: 'New' } }),
    });
    resolve({ sharing: 'private', modifiedAt: 1 });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ sharing: 'anyone', modifiedAt: 7 })
    );
  });
});
