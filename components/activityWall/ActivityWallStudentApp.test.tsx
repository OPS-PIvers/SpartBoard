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
  mockUploadBytesResumable,
  mockGetDownloadURL,
  mockHttpsCallable,
  mockCallable,
} = vi.hoisted(() => ({
  mockAuth: {},
  mockOnAuthStateChanged: vi.fn(),
  mockSignInAnonymously: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockSetDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockUploadBytesResumable: vi.fn(),
  mockGetDownloadURL: vi.fn(),
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
  updateDoc: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  ref: (...args: unknown[]) => ({ kind: 'storageRef', args }),
  uploadBytesResumable: mockUploadBytesResumable,
  getDownloadURL: mockGetDownloadURL,
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
}) => {
  mockOnAuthStateChanged.mockImplementation(
    (_auth: unknown, cb: (next: unknown) => void) => {
      cb({
        uid: user.uid,
        isAnonymous: user.isAnonymous,
        getIdTokenResult: () =>
          Promise.resolve({ claims: { studentRole: user.studentRole } }),
      });
      return () => undefined;
    }
  );
};

const signedOut = () => {
  mockOnAuthStateChanged.mockImplementation(
    (_auth: unknown, cb: (next: unknown) => void) => {
      cb(null);
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
    mockSignInAnonymously.mockResolvedValue({ user: { uid: 'anon' } });
    mockHttpsCallable.mockReturnValue(mockCallable);
    mockCallable.mockResolvedValue({ data: { domain: 'example.com' } });
    mockGetDownloadURL.mockResolvedValue('https://cdn.example/file.png');
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '11111111-1111-1111-1111-111111111111'
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
          type: 'text',
          content: 'Ready to learn',
          authorUid: 'sso-1',
          isGuest: false,
          status: 'approved',
        })
      );
    });
  });

  it('signs a visitor in anonymously when the wall allows guests', async () => {
    signedOut();
    wireSnapshots(buildSession({ allowGuests: true }));

    render(<ActivityWallStudentApp />);

    await waitFor(() => {
      expect(mockSignInAnonymously).toHaveBeenCalled();
    });
  });

  it('redirects to student login when guests are not allowed', async () => {
    const replace = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { pathname: `/activity-wall/${SESSION_ID}`, replace },
      writable: true,
    });
    signedOut();
    wireSnapshots(buildSession({ allowGuests: false }));

    render(<ActivityWallStudentApp />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        `/student/login?next=${encodeURIComponent(`/activity-wall/${SESSION_ID}`)}`
      );
    });
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
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

    await user.click(await screen.findByRole('radio', { name: /photo/i }));
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
          storagePath: `activity_wall_media/${SESSION_ID}/11111111-1111-1111-1111-111111111111/my_photo.png`,
          archiveStatus: 'firebase',
          fileName: 'my_photo.png',
          mimeType: 'image/png',
        })
      );
    });
  });
});
