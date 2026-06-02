import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SidebarClasses } from '@/components/layout/sidebar/SidebarClasses';

// GIS OAuth popup is stubbed so the modal goes straight to the course fetch.
const { ensureGis, requestAccessToken } = vi.hoisted(() => ({
  ensureGis: vi.fn(() => Promise.resolve()),
  requestAccessToken: vi.fn(() => Promise.resolve('test-token')),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    rosters: [{ id: 'r1', name: 'Period 1', students: [] }],
    activeRosterId: null,
    addRoster: vi.fn(),
    updateRoster: vi.fn(),
    deleteRoster: vi.fn(),
    setActiveRoster: vi.fn(),
    addToast: vi.fn(),
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'teacher@example.edu' },
    selectedBuildings: [],
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
// Surface the "Link to Google Classroom" button regardless of permission state.
vi.mock('@/hooks/useClassLinkEnabled', () => ({
  useClassLinkEnabled: () => true,
}));
vi.mock('@/components/classroomAddon/gisOAuth', () => ({
  ensureGis,
  requestAccessToken,
}));
vi.mock('@/config/firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
  functions: {},
}));
// Child modals are irrelevant here; stub them so their dependency trees don't
// need wiring.
vi.mock('@/components/classes/RosterEditorModal', () => ({
  RosterEditorModal: () => null,
}));
vi.mock('@/components/classes/ClassLinkImportDialog', () => ({
  ClassLinkImportDialog: () => null,
}));

const openLinkModal = () => {
  render(<SidebarClasses isVisible />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Link to Google Classroom' })
  );
};

describe('SidebarClasses — Link to Google Classroom course list', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('paginates through every active course (not just the first page)', async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn((url: string) => {
      urls.push(url);
      // The token-bearing page is the last — no nextPageToken.
      if (url.includes('pageToken=PAGE2')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ courses: [{ id: 'c3', name: 'Chemistry' }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            courses: [
              { id: 'c1', name: 'Algebra' },
              { id: 'c2', name: 'Biology' },
            ],
            nextPageToken: 'PAGE2',
          }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    openLinkModal();

    // A second-page course rendering proves nextPageToken was followed.
    expect(await screen.findByText('Chemistry')).toBeInTheDocument();
    expect(screen.getByText('Algebra')).toBeInTheDocument();
    expect(screen.getByText('Biology')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urls[0]).toContain('pageSize=100');
    expect(urls[0]).toContain('teacherId=me');
    expect(urls[0]).toContain('courseStates=ACTIVE');
    expect(urls[1]).toContain('pageToken=PAGE2');
  });

  it('surfaces a retryable error when the Classroom call times out', async () => {
    const fetchMock = vi.fn(() => {
      // Mirror what AbortSignal.timeout(...) makes fetch reject with.
      const err = new Error('The operation timed out.');
      err.name = 'TimeoutError';
      return Promise.reject(err);
    });
    vi.stubGlobal('fetch', fetchMock);

    openLinkModal();

    expect(
      await screen.findByText('Could not load courses')
    ).toBeInTheDocument();
    expect(screen.getByText(/Timed out/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try Again' })
    ).toBeInTheDocument();
  });
});
