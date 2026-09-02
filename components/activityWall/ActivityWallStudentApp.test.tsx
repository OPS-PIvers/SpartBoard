import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityWallSession } from '@/types';
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
  query: (base: unknown) => ({ kind: 'query', base }),
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

const SESSION_ID = 'teacher-1_activity-1';

/** jsdom does not submit forms from a button click; dispatch the event directly. */
const submitForm = () => {
  fireEvent.submit(
    screen
      .getByRole('button', { name: /^post$/i })
      .closest('form') as HTMLFormElement
  );
};

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

/** Wires onSnapshot: first call is the session doc, second the student's posts. */
const wireSnapshots = (
  session: Partial<ActivityWallSession> | null,
  posts: { id: string; data: Record<string, unknown> }[] = []
) => {
  mockOnSnapshot.mockImplementation(
    (
      target: { kind: string },
      onNext: (snap: unknown) => void,
      _onError?: unknown
    ) => {
      if (target.kind === 'doc') {
        onNext({
          id: SESSION_ID,
          exists: () => session !== null,
          data: () => session,
        });
      } else {
        onNext({
          docs: posts.map((post) => ({
            id: post.id,
            data: () => post.data,
          })),
        });
      }
      return () => undefined;
    }
  );
};

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

describe('ActivityWallStudentApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', `/activity-wall/${SESSION_ID}`);
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
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

  it('lets an SSO student post without signing in anonymously', async () => {
    const user = userEvent.setup();
    signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
    wireSnapshots(buildSession());

    render(<ActivityWallStudentApp />);

    await screen.findByLabelText(/your response/i);
    expect(mockSignInAnonymously).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/your response/i), 'Ready to learn');
    submitForm();
    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'sso-1__AAAAAAAAAA',
          type: 'text',
          content: 'Ready to learn',
          authorUid: 'sso-1',
          isGuest: false,
          status: 'approved',
        })
      );
    });
  });

  it('generates uncapped ids matching the Storage rule ownership prefix (never bare digits)', async () => {
    const user = userEvent.setup();
    signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
    // Byte 52 maps to alphabet index 52 ('0'), so an unguarded fill would
    // produce an all-digit suffix — exercises the anti-collision guard.
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(
      (arr: ArrayBufferView) => {
        new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).fill(52);
        return arr;
      }
    );
    wireSnapshots(buildSession());

    render(<ActivityWallStudentApp />);

    await user.type(
      await screen.findByLabelText(/your response/i),
      'Another idea'
    );
    submitForm();

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
    const [, payload] = mockSetDoc.mock.calls[0] as [unknown, { id: string }];
    expect(payload.id).toMatch(/^sso-1__[A-Za-z0-9]{8,}$/);
    expect(payload.id.split('__')[1]).not.toMatch(/^[0-9]+$/);
  });

  it('signs a fresh visitor in anonymously and then shows the form', async () => {
    let emit: ((next: unknown) => void) | null = null;
    mockOnAuthStateChanged.mockImplementation(
      (_auth: unknown, cb: (next: unknown) => void) => {
        emit = cb;
        cb(null);
        return () => undefined;
      }
    );
    mockSignInAnonymously.mockImplementation(() => {
      emit?.({
        uid: 'anon-1',
        isAnonymous: true,
        displayName: null,
        getIdTokenResult: () => Promise.resolve({ claims: {} }),
      });
      return Promise.resolve({ user: { uid: 'anon-1' } });
    });
    wireSnapshots(buildSession({ allowGuests: true }));

    render(<ActivityWallStudentApp />);

    await waitFor(() => {
      expect(mockSignInAnonymously).toHaveBeenCalled();
    });
    expect(await screen.findByLabelText(/your response/i)).toBeInTheDocument();
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

  it('redirects a signed-in non-student when guests are not allowed', async () => {
    const replace = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { pathname: `/activity-wall/${SESSION_ID}`, replace },
      writable: true,
    });
    signIn({ uid: 'teacher-9', isAnonymous: false, studentRole: false });
    wireSnapshots(buildSession({ allowGuests: false }));

    render(<ActivityWallStudentApp />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        `/student/login?next=${encodeURIComponent(`/activity-wall/${SESSION_ID}`)}`
      );
    });
  });

  it('lets a signed-in non-student post on a guest wall as a named participant', async () => {
    const user = userEvent.setup();
    signIn({
      uid: 'teacher-9',
      isAnonymous: false,
      studentRole: false,
      displayName: 'Dana Ruiz',
    });
    wireSnapshots(buildSession({ allowGuests: true }));

    render(<ActivityWallStudentApp />);

    await user.type(
      await screen.findByLabelText(/your response/i),
      'Visiting idea'
    );
    submitForm();

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          authorUid: 'teacher-9',
          isGuest: false,
          participantLabel: 'Dana',
        })
      );
    });
  });

  it('shows the closed screen when the wall stops accepting responses', async () => {
    signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
    wireSnapshots(buildSession({ acceptingResponses: false }));

    render(<ActivityWallStudentApp />);

    expect(await screen.findByText(/this wall is closed/i)).toBeInTheDocument();
  });

  it('blocks posting once the per-student cap is used up', async () => {
    signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
    wireSnapshots(buildSession({ maxPostsPerStudent: 2 }), [
      { id: 'sso-1__0', data: { authorUid: 'sso-1', content: 'a' } },
      { id: 'sso-1__1', data: { authorUid: 'sso-1', content: 'b' } },
    ]);

    render(<ActivityWallStudentApp />);

    expect(
      await screen.findByText(/you have used all 2 of your posts/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^post$/i })
    ).not.toBeInTheDocument();
  });

  it('treats the cap as used up when own posts use non-slot ids', async () => {
    signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
    wireSnapshots(buildSession({ maxPostsPerStudent: 2 }), [
      { id: 'sso-1__AbCdEfGhIj', data: { authorUid: 'sso-1', content: 'a' } },
      { id: 'sso-1__KlMnOpQrSt', data: { authorUid: 'sso-1', content: 'b' } },
    ]);

    render(<ActivityWallStudentApp />);

    expect(
      await screen.findByText(/you have used all 2 of your posts/i)
    ).toBeInTheDocument();
  });

  it('uploads a photo to activity_wall_media and records archive metadata', async () => {
    const user = userEvent.setup();
    signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
    wireSnapshots(
      buildSession({
        allowedTypes: { photo: true, link: false, file: false, video: false },
      })
    );
    mockUploadBytesResumable.mockImplementation(() => ({
      snapshot: { ref: { fullPath: 'x' } },
      on: (
        _event: string,
        _next: unknown,
        _error: unknown,
        complete: () => void
      ) => complete(),
    }));

    render(<ActivityWallStudentApp />);

    await user.click(await screen.findByRole('button', { name: /photo/i }));
    const photo = new File(['data'], 'my photo.png', { type: 'image/png' });
    await user.upload(
      screen.getByLabelText(/choose a photo to upload/i),
      photo
    );
    submitForm();

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'photo',
          content: `activity_wall_media/${SESSION_ID}/sso-1__AAAAAAAAAA/my_photo.png`,
          storagePath: `activity_wall_media/${SESSION_ID}/sso-1__AAAAAAAAAA/my_photo.png`,
          archiveStatus: 'firebase',
          fileName: 'my_photo.png',
          mimeType: 'image/png',
        })
      );
    });
  });
  it('deletes the uploaded file when the submission write fails', async () => {
    const user = userEvent.setup();
    signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
    wireSnapshots(
      buildSession({
        allowedTypes: { photo: true, link: false, file: false, video: false },
      })
    );
    mockUploadBytesResumable.mockImplementation(() => ({
      snapshot: { ref: { fullPath: 'x' } },
      on: (
        _event: string,
        _next: unknown,
        _error: unknown,
        complete: () => void
      ) => complete(),
    }));
    mockSetDoc.mockRejectedValueOnce(new Error('permission-denied'));

    render(<ActivityWallStudentApp />);

    await user.click(await screen.findByRole('button', { name: /photo/i }));
    await user.upload(
      screen.getByLabelText(/choose a photo to upload/i),
      new File(['data'], 'my photo.png', { type: 'image/png' })
    );
    submitForm();

    await waitFor(() => {
      expect(mockDeleteObject).toHaveBeenCalled();
    });
    expect(await screen.findByText(/could not post/i)).toBeInTheDocument();
  });

  it('edits a table post by seeding row/col from cellKey and writes the new cellKey', async () => {
    const user = userEvent.setup();
    signIn({ uid: 'sso-1', isAnonymous: false, studentRole: true });
    wireSnapshots(
      buildSession({
        layout: 'table',
        allowStudentEdit: true,
        tableRows: [
          { id: 'row-1', label: 'Row 1' },
          { id: 'row-2', label: 'Row 2' },
        ],
        tableCols: [
          { id: 'col-1', label: 'Col 1' },
          { id: 'col-2', label: 'Col 2' },
        ],
      }),
      [
        {
          id: 'sso-1__AAAAAAAAAA',
          data: {
            authorUid: 'sso-1',
            content: 'Original',
            cellKey: 'row-1|col-1',
          },
        },
      ]
    );

    render(<ActivityWallStudentApp />);

    await user.click(await screen.findByRole('button', { name: /^edit/i }));

    expect(screen.getByLabelText(/^row$/i)).toHaveValue('row-1');
    expect(screen.getByLabelText(/^column$/i)).toHaveValue('col-1');

    await user.selectOptions(screen.getByLabelText(/^column$/i), 'col-2');
    fireEvent.submit(
      screen
        .getByRole('button', { name: /save changes/i })
        .closest('form') as HTMLFormElement
    );

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ cellKey: 'row-1|col-2' })
      );
    });
  });
});
