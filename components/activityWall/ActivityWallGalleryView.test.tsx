import '@testing-library/jest-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityWallGalleryView } from './ActivityWallGalleryView';
import type { SharedActivityWall } from '@/types';

type SnapshotDoc = { id: string; data: () => Record<string, unknown> };
type SnapshotHandler = (snap: { docs: SnapshotDoc[] }) => void;
type DocSnapshotHandler = (snap: {
  exists: () => boolean;
  data: () => Record<string, unknown>;
}) => void;
type MockRef = { __path: string };

const noop = (): void => undefined;

const {
  mockGetDoc,
  mockOnSnapshot,
  mockSignInAnonymously,
  mockOnAuthStateChanged,
  mockCollection,
  mockDoc,
  mockAuth,
} = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockSignInAnonymously: vi.fn(),
  mockOnAuthStateChanged: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockAuth: {
    currentUser: { uid: 'viewer-1', isAnonymous: false } as {
      uid: string;
      isAnonymous: boolean;
    } | null,
  },
}));

vi.mock('@/config/firebase', () => ({
  auth: mockAuth,
  db: {},
  storage: {},
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: mockSignInAnonymously,
  onAuthStateChanged: mockOnAuthStateChanged,
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  deleteDoc: vi.fn(),
  getDoc: mockGetDoc,
  onSnapshot: mockOnSnapshot,
  query: vi.fn((value: unknown) => value),
  setDoc: vi.fn(),
  where: vi.fn(),
}));

// Builds a stable "path" marker for a mocked ref so onSnapshot can route
// callbacks by which subscription they belong to, mirroring the real SDK's
// distinct refs for submissions/session/likes/comments.
const pathOf = (arg: unknown): string =>
  typeof arg === 'object' && arg !== null && '__path' in arg
    ? (arg as MockRef).__path
    : String(arg);

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
  let sessionHandler: DocSnapshotHandler | null;

  beforeEach(() => {
    vi.clearAllMocks();
    submissionsHandler = null;
    sessionHandler = null;
    mockAuth.currentUser = { uid: 'viewer-1', isAnonymous: false };

    window.history.pushState({}, '', '/activity-wall/gallery/share-1');

    mockSignInAnonymously.mockResolvedValue({ user: { uid: 'anon-1' } });

    // Default: auth resolves immediately with the existing viewer, mirroring
    // a signed-in teacher opening the gallery in the same tab.
    mockOnAuthStateChanged.mockImplementation(
      (_auth: unknown, cb: (u: unknown) => void) => {
        cb(mockAuth.currentUser);
        return noop;
      }
    );

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => buildShare(),
    });

    // Builds a "collection" ref marker: path segments after the first arg
    // (db, or a parent doc ref), joined so each subscription gets a
    // distinguishable path.
    mockCollection.mockImplementation(
      (first: unknown, ...rest: string[]): MockRef => ({
        __path: [pathOf(first), ...rest].filter(Boolean).join('/'),
      })
    );
    mockDoc.mockImplementation(
      (first: unknown, ...rest: string[]): MockRef => ({
        __path: [pathOf(first), ...rest].filter(Boolean).join('/'),
      })
    );

    // Routes each onSnapshot registration by which ref it was called with,
    // rather than assuming registration order — the component subscribes to
    // submissions, the session doc, likes, and comments independently.
    mockOnSnapshot.mockImplementation((ref: MockRef, next: unknown) => {
      const path = ref.__path;
      if (path.includes('submissions')) {
        submissionsHandler = next as SnapshotHandler;
      } else if (path.includes('activity_wall_sessions')) {
        sessionHandler = next as DocSnapshotHandler;
      }
      return noop;
    });
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders approved submissions oldest-first (LayoutRouter wall order) and drops pending ones', async () => {
    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(sessionHandler).not.toBeNull());
    // Session normalizes a blank `mode: 'text'` doc to the wordcloud layout
    // by default; force the plain "wall" layout so submission bodies render
    // as full text rather than word-cloud chips.
    act(() => {
      sessionHandler?.({
        exists: () => true,
        data: () => ({ layout: 'wall' }),
      });
    });

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

    // LayoutRouter's default wall layout sorts pinned-first, then oldest-first.
    const main = screen.getByRole('main');
    const rendered = within(main)
      .getAllByText(/^content-/)
      .map((node) => node.textContent);
    expect(rendered).toEqual([
      'content-older',
      'content-middle',
      'content-newest',
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

  it('does not sign in anonymously when a user already exists at first emission', async () => {
    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(mockGetDoc).toHaveBeenCalled());
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in anonymously when the first emission is null', async () => {
    mockOnAuthStateChanged.mockImplementation(
      (_auth: unknown, cb: (u: unknown) => void) => {
        cb(null);
        return noop;
      }
    );

    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(mockSignInAnonymously).toHaveBeenCalled());
  });

  it('applies a color-kind session appearance to the LayoutRouter surface', async () => {
    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(sessionHandler).not.toBeNull());

    act(() => {
      sessionHandler?.({
        exists: () => true,
        data: () => ({
          appearance: { kind: 'color', value: 'bg-emerald-600' },
        }),
      });
    });

    act(() => {
      submissionsHandler?.({ docs: [submissionDoc('a', 1000)] });
    });

    const layoutRoot = await waitFor(() => {
      const el = document.querySelector('[data-testid="aw-layout-router"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(layoutRoot.className).toContain('bg-emerald-600');
    expect(layoutRoot.style.backgroundImage).toBe('');
  });

  it('applies an image-kind session appearance to the LayoutRouter surface', async () => {
    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(sessionHandler).not.toBeNull());

    act(() => {
      sessionHandler?.({
        exists: () => true,
        data: () => ({
          appearance: { kind: 'image', value: 'https://example.com/bg.jpg' },
        }),
      });
    });

    act(() => {
      submissionsHandler?.({ docs: [submissionDoc('a', 1000)] });
    });

    const layoutRoot = await waitFor(() => {
      const el = document.querySelector('[data-testid="aw-layout-router"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(layoutRoot.style.backgroundImage).toBe(
      'url("https://example.com/bg.jpg")'
    );
  });

  it('hides the author label when showNames is off (default)', async () => {
    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(sessionHandler).not.toBeNull());
    act(() => {
      sessionHandler?.({
        exists: () => true,
        data: () => ({ layout: 'wall' }),
      });
    });

    await waitFor(() => expect(submissionsHandler).not.toBeNull());

    act(() => {
      submissionsHandler?.({
        docs: [submissionDoc('a', 1000, { participantLabel: 'Ada Lovelace' })],
      });
    });

    await waitFor(() =>
      expect(screen.getByText('content-a')).toBeInTheDocument()
    );
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('shows the author label when the session enables showNames', async () => {
    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(sessionHandler).not.toBeNull());
    act(() => {
      sessionHandler?.({
        exists: () => true,
        data: () => ({ showNames: true, layout: 'wall' }),
      });
    });

    await waitFor(() => expect(submissionsHandler).not.toBeNull());
    act(() => {
      submissionsHandler?.({
        docs: [submissionDoc('a', 1000, { participantLabel: 'Ada Lovelace' })],
      });
    });

    await waitFor(() =>
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    );
  });

  it('shows comment counts but no composer inside the card for an anonymous viewer', async () => {
    mockAuth.currentUser = { uid: 'anon-viewer', isAnonymous: true };
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => buildShare({ allowLikes: true, allowComments: true }),
    });

    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(sessionHandler).not.toBeNull());
    act(() => {
      sessionHandler?.({
        exists: () => true,
        data: () => ({ layout: 'wall' }),
      });
    });
    act(() => {
      submissionsHandler?.({ docs: [submissionDoc('a', 1000)] });
    });

    const card = await waitFor(() => {
      const el = document.querySelector('[data-testid="aw-card-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(within(card).getByText(/no comments yet/i)).toBeInTheDocument();
    expect(
      within(card).queryByPlaceholderText('Leave a comment…')
    ).not.toBeInTheDocument();
    // The count stays visible; the button itself is inert for anonymous viewers.
    expect(within(card).getByLabelText('Like')).toBeDisabled();
  });

  it('renders the like button and comment composer inside each card for a signed-in viewer', async () => {
    mockAuth.currentUser = { uid: 'sso-viewer', isAnonymous: false };
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => buildShare({ allowLikes: true, allowComments: true }),
    });

    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(sessionHandler).not.toBeNull());
    act(() => {
      sessionHandler?.({
        exists: () => true,
        data: () => ({ layout: 'wall' }),
      });
    });
    act(() => {
      submissionsHandler?.({ docs: [submissionDoc('a', 1000)] });
    });

    const card = await waitFor(() => {
      const el = document.querySelector('[data-testid="aw-card-a"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(
      within(card).getByPlaceholderText('Leave a comment…')
    ).toBeInTheDocument();
    expect(within(card).getByLabelText('Like')).toBeInTheDocument();
    // The old free-floating list below the wall is gone.
    expect(screen.queryByText(/reactions & comments/i)).not.toBeInTheDocument();
  });

  it('renders a legacy no-type photo post as a photo when the session snapshot arrives late', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => buildShare({ mode: 'photo' }),
    });

    render(<ActivityWallGalleryView />);

    await waitFor(() => expect(submissionsHandler).not.toBeNull());
    act(() => {
      submissionsHandler?.({
        docs: [
          {
            id: 'legacy',
            data: () => ({
              id: 'legacy',
              content: 'https://example.com/photo.jpg',
              submittedAt: 1000,
              status: 'approved',
            }),
          },
        ],
      });
    });

    act(() => {
      sessionHandler?.({
        exists: () => true,
        data: () => ({ mode: 'photo', layout: 'wall' }),
      });
    });

    const image = await waitFor(() =>
      screen.getByAltText<HTMLImageElement>('Student photo')
    );
    expect(image.src).toBe('https://example.com/photo.jpg');
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
