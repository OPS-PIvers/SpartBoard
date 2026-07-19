import '@testing-library/jest-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityWallGalleryView } from './ActivityWallGalleryView';
import type { SharedActivityWall } from '@/types';

type SnapshotDoc = { id: string; data: () => Record<string, unknown> };
type SnapshotHandler = (snap: { docs: SnapshotDoc[] }) => void;

const noop = (): void => undefined;

const {
  mockGetDoc,
  mockOnSnapshot,
  mockSignInAnonymously,
  mockCollection,
  mockDoc,
  mockAuth,
} = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockSignInAnonymously: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockAuth: {
    currentUser: { uid: 'viewer-1' } as { uid: string } | null,
    onAuthStateChanged: vi.fn<(cb: unknown) => () => void>(),
  },
}));

vi.mock('@/config/firebase', () => ({
  auth: mockAuth,
  db: {},
  storage: {},
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: mockSignInAnonymously,
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  deleteDoc: vi.fn(),
  getDoc: mockGetDoc,
  onSnapshot: mockOnSnapshot,
  query: vi.fn((value: unknown) => value),
  setDoc: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
}));

const buildShare = (
  overrides: Partial<SharedActivityWall> = {}
): SharedActivityWall => ({
  id: 'share-1',
  sessionId: 'teacher-1_activity-1',
  originalAuthor: 'teacher-1',
  title: 'Gallery Title',
  prompt: 'Share one idea',
  mode: 'text',
  identificationMode: 'anonymous',
  allowComments: false,
  allowCommentResponses: false,
  allowLikes: false,
  expiresAt: null,
  createdAt: 1,
  ...overrides,
});

const submissionDoc = (
  id: string,
  submittedAt: number,
  overrides: Record<string, unknown> = {}
): SnapshotDoc => ({
  id,
  data: () => ({
    id,
    content: `content-${id}`,
    submittedAt,
    status: 'approved',
    ...overrides,
  }),
});

describe('ActivityWallGalleryView', () => {
  let submissionsHandler: SnapshotHandler | null;

  beforeEach(() => {
    vi.clearAllMocks();
    submissionsHandler = null;
    mockAuth.currentUser = { uid: 'viewer-1' };

    window.history.pushState({}, '', '/activity-wall/gallery/share-1');

    mockAuth.onAuthStateChanged.mockImplementation(() => noop);

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => buildShare(),
    });

    // First onSnapshot registration is the submissions subscription;
    // the likes/comments subscriptions follow and are no-ops here.
    mockOnSnapshot.mockImplementation(
      (_ref: unknown, next: SnapshotHandler) => {
        submissionsHandler ??= next;
        return noop;
      }
    );
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders approved submissions newest-first and drops pending ones', async () => {
    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(submissionsHandler).not.toBeNull());

    // Deliberately out of order, with one pending submission mixed in.
    act(() => {
      submissionsHandler?.({
        docs: [
          submissionDoc('older', 1000),
          submissionDoc('newest', 3000),
          submissionDoc('pending', 5000, { status: 'pending' }),
          submissionDoc('middle', 2000),
        ],
      });
    });

    await waitFor(() =>
      expect(screen.getByText('content-newest')).toBeInTheDocument()
    );

    // Pending submission is filtered out entirely.
    expect(screen.queryByText('content-pending')).not.toBeInTheDocument();

    // The remaining approved submissions render newest-first.
    const main = screen.getByRole('main');
    const rendered = within(main)
      .getAllByText(/^content-/)
      .map((node) => node.textContent);
    expect(rendered).toEqual([
      'content-newest',
      'content-middle',
      'content-older',
    ]);
  });

  it('shows the "no longer available" state when the share read is permission-denied', async () => {
    // A revoked/expired share is now rejected by the Firestore rules, so the
    // client sees `permission-denied` instead of a readable doc. Verify we
    // surface the turned-off/expired copy rather than the generic
    // malformed-link message.
    mockGetDoc.mockRejectedValueOnce(
      Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      })
    );

    render(<ActivityWallGalleryView />);

    await waitFor(() =>
      expect(
        screen.getByText(/this gallery is no longer available/i)
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText(/the link may be incorrect or has been removed/i)
    ).not.toBeInTheDocument();
  });

  it('shows the generic not-found state for a non-permission read error', async () => {
    mockGetDoc.mockRejectedValueOnce(
      Object.assign(new Error('network'), { code: 'unavailable' })
    );

    render(<ActivityWallGalleryView />);

    await waitFor(() =>
      expect(
        screen.getByText(/the link may be incorrect or has been removed/i)
      ).toBeInTheDocument()
    );
  });

  it('shows the empty state when every submission is pending', async () => {
    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(submissionsHandler).not.toBeNull());

    act(() => {
      submissionsHandler?.({
        docs: [submissionDoc('pending-only', 1000, { status: 'pending' })],
      });
    });

    await waitFor(() =>
      expect(
        screen.getByText(/no submissions yet — check back soon/i)
      ).toBeInTheDocument()
    );
  });
});
