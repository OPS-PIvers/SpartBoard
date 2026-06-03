import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach, type Mock } from 'vitest';

import { LtiTeacherGrader } from './LtiTeacherGrader';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizSessionTeacher } from '@/hooks/useQuizSession';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { getDocs } from 'firebase/firestore';

// The grader runs inside Schoology's cross-origin LTI iframe. The sign-in gate
// only depends on the auth hook + the Drive token; everything else is mocked to
// a benign default so the gate can be exercised in isolation.
vi.mock('@/context/useAuth');
vi.mock('@/hooks/useQuiz');
vi.mock('@/hooks/useAssignmentPseudonyms');
vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSessionTeacher: vi.fn(),
  getResponseDocKey: (r: { id?: string }) => r.id ?? 'k',
  QUIZ_SESSIONS_COLLECTION: 'quiz_sessions',
}));
vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

/** A real, interactive Google teacher sign-in: google.com provider + Drive token. */
const GOOGLE_USER = {
  uid: 'teacher-uid',
  providerData: [{ providerId: 'google.com' }],
};

/**
 * The bug: a leftover custom-token `studentRole` session restored from the
 * iframe's partitioned storage — a uid (so `!!user` is true) but empty
 * `providerData` and no Drive token.
 */
const STUDENT_ROLE_USER = {
  uid: 'student-pseudonym-uid',
  providerData: [] as { providerId: string }[],
};

type AuthShape = {
  user: typeof GOOGLE_USER | typeof STUDENT_ROLE_USER | null;
  googleAccessToken: string | null;
};

function setAuth({ user, googleAccessToken }: AuthShape): void {
  (useAuth as Mock).mockReturnValue({
    user,
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    googleAccessToken,
    orgId: 'org-1',
  });
}

function renderGrader() {
  return render(
    <LtiTeacherGrader
      quizCode="ABC123"
      resourceLinkId="resource-link-1"
      pushAuth="push-auth-token"
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (useQuiz as Mock).mockReturnValue({
    quizzes: [],
    loadQuizData: vi.fn(),
    loading: false,
  });
  (useQuizSessionTeacher as Mock).mockReturnValue({
    session: null,
    responses: [],
    loading: false,
  });
  (useAssignmentPseudonymsMulti as Mock).mockReturnValue({
    byStudentUid: new Map(),
  });
  // The mount effect resolves the session id from the join code. Default to a
  // resolved-but-empty query so the effect settles deterministically.
  (getDocs as Mock).mockResolvedValue({ empty: true, docs: [] });
});

describe('LtiTeacherGrader — Google-session gate', () => {
  const signInButton = () =>
    screen.queryByRole('button', { name: /sign in to spartboard/i });

  it('shows the sign-in card (not the grader) for a stale studentRole session', async () => {
    setAuth({ user: STUDENT_ROLE_USER, googleAccessToken: null });
    renderGrader();

    await waitFor(() => expect(signInButton()).toBeInTheDocument());
    expect(
      screen.getByText(/sign in with your teacher google account/i)
    ).toBeInTheDocument();
    // The grader body must NOT render under the wrong (student) uid.
    expect(
      screen.queryByText(/push grades to schoology/i)
    ).not.toBeInTheDocument();
    // ...and the library listener is deferred — no Firestore subscription under
    // the stale (student) uid (#1837 reviewer concern).
    expect(useQuiz).toHaveBeenCalledWith(undefined);
    // ...and the join-code resolution effect is suppressed too: it now gates on
    // `teacherReady`, so a stale session triggers zero Firestore reads.
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('shows the sign-in card with the school-account copy for an anonymous (null) session', async () => {
    setAuth({ user: null, googleAccessToken: null });
    renderGrader();

    await waitFor(() => expect(signInButton()).toBeInTheDocument());
    expect(
      screen.getByText(/sign in with your school google account/i)
    ).toBeInTheDocument();
  });

  it('renders the grader for a real Google teacher with a Drive token (no regression)', async () => {
    setAuth({ user: GOOGLE_USER, googleAccessToken: 'drive-token' });
    renderGrader();

    // With no matching session the grader settles on its not-found state — the
    // point is it reaches the grader body rather than the sign-in card.
    expect(
      await screen.findByText(/session is no longer available/i)
    ).toBeInTheDocument();
    expect(signInButton()).not.toBeInTheDocument();
    // ...and the library subscribes under the teacher's own uid.
    expect(useQuiz).toHaveBeenCalledWith(GOOGLE_USER.uid);
  });

  it('shows the sign-in card for a Google session whose Drive token is missing/expired', async () => {
    setAuth({ user: GOOGLE_USER, googleAccessToken: null });
    renderGrader();

    await waitFor(() => expect(signInButton()).toBeInTheDocument());
    expect(
      screen.getByText(/sign in with your teacher google account/i)
    ).toBeInTheDocument();
    // A Google session without a Drive token is not `teacherReady`, so the
    // library listener stays deferred (undefined) — a tokenless session must not
    // open a Firestore listener under the teacher's library.
    expect(useQuiz).toHaveBeenCalledWith(undefined);
  });
});
