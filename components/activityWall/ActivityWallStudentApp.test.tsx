import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityWallSession } from '@/types';
import type { WallRenderProps } from '@/components/activityWall/render';
import { ActivityWallStudentApp } from './ActivityWallStudentApp';

const {
  mockAuth,
  mockOnAuthStateChanged,
  mockSignInAnonymously,
  mockOnSnapshot,
  mockSetDoc,
  mockDeleteDoc,
  mockUpdateDoc,
  mockUploadBytesResumable,
  mockDeleteObject,
  mockHttpsCallable,
  mockCallable,
  mockShowConfirm,
  recordLayoutProps,
} = vi.hoisted(() => ({
  mockAuth: {},
  mockOnAuthStateChanged: vi.fn(),
  mockSignInAnonymously: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockSetDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockUploadBytesResumable: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockHttpsCallable: vi.fn(),
  mockCallable: vi.fn(),
  mockShowConfirm: vi.fn(),
  recordLayoutProps: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  auth: mockAuth,
  db: {},
  storage: {},
  functions: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
  signInAnonymously: mockSignInAnonymously,
}));

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => ({ kind: 'collection', args }),
  doc: (...args: unknown[]) => ({ kind: 'doc', args }),
  query: (base: unknown, ...clauses: unknown[]) => ({
    kind: 'query',
    base,
    clauses,
  }),
  where: (...args: unknown[]) => ({ kind: 'where', args }),
  onSnapshot: mockOnSnapshot,
  setDoc: mockSetDoc,
  deleteDoc: mockDeleteDoc,
  updateDoc: mockUpdateDoc,
}));

vi.mock('firebase/storage', () => ({
  ref: (...args: unknown[]) => ({ kind: 'storageRef', args }),
  uploadBytesResumable: mockUploadBytesResumable,
  deleteObject: mockDeleteObject,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: mockHttpsCallable,
}));

vi.mock('./engagement', () => ({
  useWallEngagement: () => ({
    likeIndex: new Map(),
    commentsBySubmission: new Map(),
    toggleLike: vi.fn(),
    postComment: vi.fn(),
  }),
  makeEngagementFooter: () => undefined,
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: mockShowConfirm }),
}));

vi.mock('@/components/activityWall/render', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/activityWall/render')>();
  const LayoutRouter = (props: WallRenderProps) => {
    recordLayoutProps(props);
    return (
      <div data-testid="layout-stub" data-mode={props.mode}>
        {props.submissions.map((post) => (
          <div key={post.id} data-testid={`post-${post.id}`}>
            {post.content} [{post.status}]
          </div>
        ))}
      </div>
    );
  };
  return { ...actual, LayoutRouter };
});

const SESSION_ID = 'teacher-1_activity-1';

const latestLayoutProps = (): WallRenderProps | undefined =>
  recordLayoutProps.mock.calls.at(-1)?.[0] as WallRenderProps | undefined;

type WhereClause = { kind: 'where'; args: unknown[] };
type QueryTarget = { kind: 'query'; clauses: WhereClause[] };
type SnapshotTarget = { kind: 'doc' } | QueryTarget;

const whereField = (target: SnapshotTarget): string | null =>
  target.kind === 'query' ? (target.clauses[0]?.args[0] as string) : null;

const buildSession = (
  overrides: Partial<ActivityWallSession> = {}
): Partial<ActivityWallSession> => ({
  activityId: 'activity-1',
  teacherUid: 'teacher-1',
  title: 'Warm Up',
  prompt: 'Share one idea',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  updatedAt: 1,
  layout: 'wall',
  allowedTypes: { photo: false, link: false, file: false, video: false },
  allowGuests: false,
  showNames: false,
  maxPostsPerStudent: 0,
  allowStudentEdit: false,
  allowStudentDelete: false,
  acceptingResponses: true,
  ...overrides,
});

interface FakePost {
  id: string;
  data: Record<string, unknown>;
}

/** Wires onSnapshot: the session doc, then the `authorUid` and `status` queries. */
const wireSnapshots = (
  session: Partial<ActivityWallSession> | null,
  own: FakePost[] = [],
  approved: FakePost[] = []
) => {
  mockOnSnapshot.mockImplementation(
    (target: SnapshotTarget, onNext: (snap: unknown) => void) => {
      if (target.kind === 'doc') {
        onNext({
          id: SESSION_ID,
          exists: () => session !== null,
          data: () => session,
        });
      } else {
        const posts = whereField(target) === 'status' ? approved : own;
        onNext({
          docs: posts.map((post) => ({ id: post.id, data: () => post.data })),
        });
      }
      return () => undefined;
    }
  );
};

const subscribedFields = (): (string | null)[] =>
  mockOnSnapshot.mock.calls.map((call) =>
    whereField(call[0] as SnapshotTarget)
  );

const signIn = (user: {
  uid: string;
  isAnonymous: boolean;
  studentRole?: boolean;
  displayName?: string | null;
}) => {
  mockOnAuthStateChanged.mockImplementation(
    (_auth: unknown, cb: (next: unknown) => void) => {
      cb({
        uid: user.uid,
        isAnonymous: user.isAnonymous,
        displayName: user.displayName ?? null,
        getIdTokenResult: () =>
          Promise.resolve({ claims: { studentRole: user.studentRole } }),
      });
      return () => undefined;
    }
  );
};

const openSheetViaButton = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole('button', { name: /add post/i }));

const submitSheet = () => {
  fireEvent.submit(
    screen
      .getByRole('button', { name: /^post$|save changes/i })
      .closest('form') as HTMLFormElement
  );
};

describe('ActivityWallStudentApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.pushState({}, '', `/activity-wall/${SESSION_ID}`);
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
    mockShowConfirm.mockResolvedValue(true);
    mockSignInAnonymously.mockResolvedValue({ user: { uid: 'anon' } });
    mockHttpsCallable.mockReturnValue(mockCallable);
    mockCallable.mockResolvedValue({ data: { domain: 'example.com' } });
    mockDeleteObject.mockResolvedValue(undefined);
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(
      // Deterministic 10-byte fill so the uncapped id suffix is always "AAAAAAAAAA".
      (arr: ArrayBufferView) => {
        new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).fill(0);
        return arr;
      }
    );
  });

  describe('arrival', () => {
    it('lands an anonymous wall straight on the wall in student mode', async () => {
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(buildSession());

      render(<ActivityWallStudentApp />);

      expect(await screen.findByTestId('layout-stub')).toHaveAttribute(
        'data-mode',
        'student'
      );
      expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
      expect(document.body.dataset.chromeFree).toBe('true');
      expect(latestLayoutProps()?.viewerUid).toBe('sso-1');
      expect(mockSignInAnonymously).not.toHaveBeenCalled();
    });

    it.each([
      ['name', true, false],
      ['pin', false, true],
      ['name-pin', true, true],
    ] as const)(
      'asks a guest for identification in %s mode',
      async (mode, asksName, asksPin) => {
        signIn({ uid: 'anon-1', isAnonymous: true });
        wireSnapshots(
          buildSession({ identificationMode: mode, allowGuests: true })
        );

        render(<ActivityWallStudentApp />);

        expect(await screen.findByText(/before you post/i)).toBeInTheDocument();
        expect(!!screen.queryByLabelText(/your name/i)).toBe(asksName);
        expect(!!screen.queryByLabelText(/your pin/i)).toBe(asksPin);
        expect(screen.queryByTestId('layout-stub')).not.toBeInTheDocument();
      }
    );

    it('remembers the identity and stamps it on new posts', async () => {
      const user = userEvent.setup();
      signIn({ uid: 'anon-1', isAnonymous: true });
      wireSnapshots(
        buildSession({ identificationMode: 'name-pin', allowGuests: true })
      );

      render(<ActivityWallStudentApp />);

      await user.type(await screen.findByLabelText(/your name/i), 'Sam');
      await user.type(screen.getByLabelText(/your pin/i), '42');
      fireEvent.submit(
        screen
          .getByRole('button', { name: /continue/i })
          .closest('form') as HTMLFormElement
      );

      expect(await screen.findByTestId('layout-stub')).toBeInTheDocument();
      expect(
        JSON.parse(
          localStorage.getItem(`activity_wall_identity:${SESSION_ID}`) ?? ''
        )
      ).toEqual({ name: 'Sam', pin: '42' });

      await openSheetViaButton(user);
      await user.type(screen.getByLabelText(/your response/i), 'Hi');
      submitSheet();

      await waitFor(() => {
        expect(mockSetDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            participantLabel: 'Sam (42)',
            authorUid: 'anon-1',
            isGuest: true,
          })
        );
      });
    });

    it('skips identification for a stored identity and for SSO students', async () => {
      localStorage.setItem(
        `activity_wall_identity:${SESSION_ID}`,
        JSON.stringify({ name: 'Kai', pin: '' })
      );
      signIn({ uid: 'anon-1', isAnonymous: true });
      wireSnapshots(
        buildSession({ identificationMode: 'name', allowGuests: true })
      );
      const { unmount } = render(<ActivityWallStudentApp />);
      expect(await screen.findByTestId('layout-stub')).toBeInTheDocument();
      unmount();

      localStorage.clear();
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(buildSession({ identificationMode: 'name' }));
      render(<ActivityWallStudentApp />);
      expect(await screen.findByTestId('layout-stub')).toBeInTheDocument();
      expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
    });

    it('redirects a persisted anonymous visitor when guests are not allowed', async () => {
      const replace = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { pathname: `/activity-wall/${SESSION_ID}`, replace },
        writable: true,
      });
      signIn({ uid: 'anon-1', isAnonymous: true });
      wireSnapshots(buildSession({ allowGuests: false }));

      render(<ActivityWallStudentApp />);

      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith(
          `/student/login?next=${encodeURIComponent(`/activity-wall/${SESSION_ID}`)}`
        );
      });
      expect(mockSignInAnonymously).not.toHaveBeenCalled();
    });
  });

  describe('wall visibility and state', () => {
    it('merges approved posts with own posts, own pending copy included', async () => {
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(
        buildSession({ moderationEnabled: true }),
        [
          {
            id: 'sso-1__0',
            data: { authorUid: 'sso-1', content: 'mine', status: 'pending' },
          },
        ],
        [
          {
            id: 'other__0',
            data: { authorUid: 'other', content: 'theirs', status: 'approved' },
          },
        ]
      );

      render(<ActivityWallStudentApp />);

      expect(await screen.findByTestId('post-sso-1__0')).toHaveTextContent(
        'mine [pending]'
      );
      expect(screen.getByTestId('post-other__0')).toHaveTextContent(
        'theirs [approved]'
      );
      expect(latestLayoutProps()?.showNames).toBe(false);
      expect(subscribedFields()).toContain('status');
    });

    it('shows only own posts plus the reveal note when the wall is hidden, without subscribing to approved posts', async () => {
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(
        buildSession({ studentsCanSeePosts: false }),
        [{ id: 'sso-1__0', data: { authorUid: 'sso-1', content: 'mine' } }],
        [{ id: 'other__0', data: { authorUid: 'other', content: 'theirs' } }]
      );

      render(<ActivityWallStudentApp />);

      expect(await screen.findByTestId('post-sso-1__0')).toBeInTheDocument();
      expect(screen.queryByTestId('post-other__0')).not.toBeInTheDocument();
      expect(
        screen.getByText(/your teacher will reveal the wall/i)
      ).toBeInTheDocument();
      expect(subscribedFields()).not.toContain('status');
      expect(
        screen.getByRole('button', { name: /add post/i })
      ).toBeInTheDocument();
    });

    it('keeps rendering a closed wall but hides the add button and passes no onAddAt', async () => {
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(
        buildSession({ acceptingResponses: false }),
        [],
        [{ id: 'other__0', data: { authorUid: 'other', content: 'theirs' } }]
      );

      render(<ActivityWallStudentApp />);

      expect(await screen.findByTestId('post-other__0')).toBeInTheDocument();
      expect(screen.getByText('Closed')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /add post/i })
      ).not.toBeInTheDocument();
      expect(latestLayoutProps()?.onAddAt).toBeUndefined();
    });

    it('hides the add button once the per-student cap is used up', async () => {
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(buildSession({ maxPostsPerStudent: 2 }), [
        { id: 'sso-1__0', data: { authorUid: 'sso-1', content: 'a' } },
        { id: 'sso-1__1', data: { authorUid: 'sso-1', content: 'b' } },
      ]);

      render(<ActivityWallStudentApp />);

      expect(await screen.findByTestId('layout-stub')).toBeInTheDocument();
      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /add post/i })
      ).not.toBeInTheDocument();
      expect(latestLayoutProps()?.onAddAt).toBeUndefined();
    });

    it('treats non-slot own ids as using up the cap', async () => {
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(buildSession({ maxPostsPerStudent: 2 }), [
        { id: 'sso-1__AbCdEfGhIj', data: { authorUid: 'sso-1', content: 'a' } },
        { id: 'sso-1__KlMnOpQrSt', data: { authorUid: 'sso-1', content: 'b' } },
      ]);

      render(<ActivityWallStudentApp />);

      expect(await screen.findByTestId('layout-stub')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /add post/i })
      ).not.toBeInTheDocument();
    });

    it('cycles the image size and persists it', async () => {
      const user = userEvent.setup();
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(buildSession());

      render(<ActivityWallStudentApp />);

      await user.click(
        await screen.findByRole('button', { name: /image size: medium/i })
      );
      expect(latestLayoutProps()?.imageSize).toBe('large');
      expect(localStorage.getItem('activity_wall_student_image_size')).toBe(
        'large'
      );
    });
  });

  describe('composer', () => {
    it('posts a text response from the floating button', async () => {
      const user = userEvent.setup();
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(buildSession());

      render(<ActivityWallStudentApp />);

      await openSheetViaButton(user);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.type(
        screen.getByLabelText(/your response/i),
        'Ready to learn'
      );
      submitSheet();

      await waitFor(() => {
        expect(mockSetDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            id: 'sso-1__AAAAAAAAAA',
            type: 'text',
            content: 'Ready to learn',
            authorUid: 'sso-1',
            isGuest: false,
            participantLabel: 'Student',
            status: 'approved',
          })
        );
      });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Posted!')).toBeInTheDocument();
    });

    it('prefills the sheet from an onAddAt placement and hides the column picker', async () => {
      const user = userEvent.setup();
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(
        buildSession({
          layout: 'columns',
          sections: [
            { id: 'sec-a', label: 'A' },
            { id: 'sec-b', label: 'B' },
          ],
        })
      );

      render(<ActivityWallStudentApp />);
      await screen.findByTestId('layout-stub');

      const onAddAt = latestLayoutProps()?.onAddAt;
      expect(onAddAt).toBeDefined();
      act(() => onAddAt?.({ sectionId: 'sec-b' }));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.queryByLabelText(/^column$/i)).not.toBeInTheDocument();
      await user.type(screen.getByLabelText(/your response/i), 'In B');
      submitSheet();

      await waitFor(() => {
        expect(mockSetDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ sectionId: 'sec-b', content: 'In B' })
        );
      });
    });

    it('shows the column picker when opened from the floating button', async () => {
      const user = userEvent.setup();
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(
        buildSession({
          layout: 'columns',
          sections: [
            { id: 'sec-a', label: 'A' },
            { id: 'sec-b', label: 'B' },
          ],
        })
      );

      render(<ActivityWallStudentApp />);

      await openSheetViaButton(user);
      expect(screen.getByLabelText(/^column$/i)).toHaveValue('sec-a');
    });

    it('shows only the word field on a word-cloud wall', async () => {
      const user = userEvent.setup();
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(buildSession({ layout: 'wordcloud' }));

      render(<ActivityWallStudentApp />);

      await user.click(
        await screen.findByRole('button', { name: /add word/i })
      );
      expect(screen.getByLabelText(/your word or phrase/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/your response/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument();
      await user.type(screen.getByLabelText(/your word or phrase/i), 'spark');
      submitSheet();
      await waitFor(() => {
        expect(mockSetDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ type: 'word', content: 'spark' })
        );
      });
    });

    it('closes on Escape and on backdrop click', async () => {
      const user = userEvent.setup();
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(buildSession());

      render(<ActivityWallStudentApp />);

      await openSheetViaButton(user);
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      await openSheetViaButton(user);
      await user.click(screen.getByRole('button', { name: /^close$/i }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('uploads a photo and cleans up the file when the write fails', async () => {
      const user = userEvent.setup();
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(
        buildSession({
          allowedTypes: { photo: true, link: false, file: false, video: false },
        })
      );
      mockUploadBytesResumable.mockImplementation(() => ({
        on: (
          _event: string,
          _next: unknown,
          _error: unknown,
          complete: () => void
        ) => complete(),
      }));
      mockSetDoc.mockRejectedValueOnce(new Error('permission-denied'));

      render(<ActivityWallStudentApp />);

      await openSheetViaButton(user);
      await user.click(screen.getByRole('button', { name: /photo/i }));
      await user.upload(
        screen.getByLabelText(/choose a photo to upload/i),
        new File(['data'], 'my photo.png', { type: 'image/png' })
      );
      submitSheet();

      await waitFor(() => {
        expect(mockDeleteObject).toHaveBeenCalled();
      });
      expect(await screen.findByText(/could not post/i)).toBeInTheDocument();
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storagePath: `activity_wall_media/${SESSION_ID}/sso-1__AAAAAAAAAA/my_photo.png`,
          archiveStatus: 'firebase',
        })
      );
    });
  });

  describe('own-post edit and delete', () => {
    const ownTablePost = {
      id: 'sso-1__AAAAAAAAAA',
      data: {
        authorUid: 'sso-1',
        content: 'Original',
        cellKey: 'row-1|col-1',
      },
    };
    const tableSession = (overrides: Partial<ActivityWallSession> = {}) =>
      buildSession({
        layout: 'table',
        tableRows: [
          { id: 'row-1', label: 'Row 1' },
          { id: 'row-2', label: 'Row 2' },
        ],
        tableCols: [
          { id: 'col-1', label: 'Col 1' },
          { id: 'col-2', label: 'Col 2' },
        ],
        ...overrides,
      });

    it('passes onEdit/onDelete only when the wall allows them', async () => {
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(tableSession(), [ownTablePost]);
      const { unmount } = render(<ActivityWallStudentApp />);
      await screen.findByTestId('layout-stub');
      expect(latestLayoutProps()?.onEdit).toBeUndefined();
      expect(latestLayoutProps()?.onDelete).toBeUndefined();
      unmount();

      wireSnapshots(
        tableSession({ allowStudentEdit: true, allowStudentDelete: true }),
        [ownTablePost]
      );
      render(<ActivityWallStudentApp />);
      await screen.findByTestId('layout-stub');
      expect(latestLayoutProps()?.onEdit).toBeDefined();
      expect(latestLayoutProps()?.onDelete).toBeDefined();
    });

    it('opens the sheet with the post loaded and writes the new cellKey', async () => {
      const user = userEvent.setup();
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(tableSession({ allowStudentEdit: true }), [ownTablePost]);

      render(<ActivityWallStudentApp />);
      await screen.findByTestId('layout-stub');
      act(() => latestLayoutProps()?.onEdit?.('sso-1__AAAAAAAAAA'));

      expect(await screen.findByRole('dialog')).toHaveTextContent(
        /edit your post/i
      );
      expect(screen.getByLabelText(/your response/i)).toHaveValue('Original');
      expect(screen.getByLabelText(/^row$/i)).toHaveValue('row-1');
      expect(screen.getByLabelText(/^column$/i)).toHaveValue('col-1');
      expect(
        screen.queryByRole('group', { name: /post type/i })
      ).not.toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText(/^column$/i), 'col-2');
      submitSheet();

      await waitFor(() => {
        expect(mockUpdateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            cellKey: 'row-1|col-2',
            content: 'Original',
          })
        );
      });
    });

    it('confirms before deleting and skips the delete when cancelled', async () => {
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(tableSession({ allowStudentDelete: true }), [ownTablePost]);

      render(<ActivityWallStudentApp />);
      await screen.findByTestId('layout-stub');
      mockShowConfirm.mockResolvedValueOnce(false);
      latestLayoutProps()?.onDelete?.('sso-1__AAAAAAAAAA');
      await waitFor(() => {
        expect(mockShowConfirm).toHaveBeenCalledWith(
          'Delete your post?',
          expect.objectContaining({ title: 'Delete post', variant: 'danger' })
        );
      });
      expect(mockDeleteDoc).not.toHaveBeenCalled();

      latestLayoutProps()?.onDelete?.('sso-1__AAAAAAAAAA');
      await waitFor(() => {
        expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
      });
    });

    it('ignores delete requests for posts the viewer does not own', async () => {
      signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
      wireSnapshots(
        tableSession({ allowStudentDelete: true }),
        [],
        [{ id: 'other__0', data: { authorUid: 'other', content: 'theirs' } }]
      );

      render(<ActivityWallStudentApp />);
      await screen.findByTestId('layout-stub');
      act(() => latestLayoutProps()?.onDelete?.('other__0'));

      await waitFor(() => {
        expect(screen.getByTestId('post-other__0')).toBeInTheDocument();
      });
      expect(mockShowConfirm).not.toHaveBeenCalled();
      expect(mockDeleteDoc).not.toHaveBeenCalled();
    });
  });
});
