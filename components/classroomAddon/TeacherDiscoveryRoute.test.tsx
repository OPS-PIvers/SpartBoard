import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, vi, expect, beforeEach, type Mock } from 'vitest';

import { ClassroomAddonTeacherSpike } from './TeacherDiscoveryRoute';
import { useAuth } from '@/context/useAuth';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import { usePlcs } from '@/hooks/usePlcs';

// The route lives inside the Google Classroom add-on iframe. It only needs the
// hooks' return values — the real Firebase wiring is irrelevant to the sign-in
// gate, so each is mocked to a benign default below.
vi.mock('@/context/useAuth');
vi.mock('@/hooks/useQuiz');
vi.mock('@/hooks/useQuizAssignments');
vi.mock('@/hooks/useVideoActivity');
vi.mock('@/hooks/useVideoActivityAssignments');
vi.mock('@/hooks/usePlcs');
vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./gisOAuth', () => ({
  ensureGis: vi.fn(),
  requestAccessToken: vi.fn(),
}));

/** A real, interactive Google teacher sign-in: google.com provider + Drive token. */
const GOOGLE_USER = {
  uid: 'teacher-uid',
  providerData: [{ providerId: 'google.com' }],
  displayName: 'Ms Teacher',
  email: 'teacher@school.org',
};

/**
 * The bug: a leftover custom-token `studentRole` session restored from the
 * iframe's partitioned storage. It has a uid (so `!!user` is true) but an empty
 * `providerData` and no Drive token.
 */
const STUDENT_ROLE_USER = {
  uid: 'student-pseudonym-uid',
  providerData: [] as { providerId: string }[],
  displayName: null,
  email: null,
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
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (useQuiz as Mock).mockReturnValue({
    quizzes: [],
    loadQuizData: vi.fn(),
    loading: false,
  });
  (useQuizAssignments as Mock).mockReturnValue({ createAssignment: vi.fn() });
  (useVideoActivity as Mock).mockReturnValue({
    activities: [],
    loadActivityData: vi.fn(),
    loading: false,
  });
  (useVideoActivityAssignments as Mock).mockReturnValue({
    createAssignment: vi.fn(),
  });
  (usePlcs as Mock).mockReturnValue({ plcs: [] });
});

describe('ClassroomAddonTeacherSpike (Classroom add-on discovery) — Google-session gate', () => {
  const signInButton = () =>
    screen.queryByRole('button', { name: /sign in to spartboard/i });
  const libraryPicker = () =>
    screen.queryByRole('tablist', { name: /activity type/i });

  it('shows the sign-in card (not the library) for a stale studentRole session', () => {
    setAuth({ user: STUDENT_ROLE_USER, googleAccessToken: null });
    render(<ClassroomAddonTeacherSpike />);

    // The reported bug was the opposite: a stale session was treated as
    // "signed in", showing the empty library and never the sign-in card.
    expect(signInButton()).toBeInTheDocument();
    expect(libraryPicker()).not.toBeInTheDocument();
    expect(
      screen.getByText(/sign in with your teacher google account/i)
    ).toBeInTheDocument();
    // ...and the library listeners are deferred — no Firestore subscription is
    // opened under the stale (student) uid (#1837 reviewer concern).
    expect(useQuiz).toHaveBeenCalledWith(undefined);
    expect(useQuizAssignments).toHaveBeenCalledWith(undefined);
  });

  it('shows the sign-in card with the school-account copy for an anonymous (null) session', () => {
    setAuth({ user: null, googleAccessToken: null });
    render(<ClassroomAddonTeacherSpike />);

    expect(signInButton()).toBeInTheDocument();
    expect(libraryPicker()).not.toBeInTheDocument();
    expect(
      screen.getByText(/sign in with your school google account/i)
    ).toBeInTheDocument();
  });

  it('shows the library for a real Google teacher with a Drive token (no regression)', () => {
    setAuth({ user: GOOGLE_USER, googleAccessToken: 'drive-token' });
    render(<ClassroomAddonTeacherSpike />);

    // The working Classroom attach flow must still reach the picker.
    expect(libraryPicker()).toBeInTheDocument();
    expect(signInButton()).not.toBeInTheDocument();
    // ...and the library subscribes under the teacher's own uid.
    expect(useQuiz).toHaveBeenCalledWith(GOOGLE_USER.uid);
    expect(useQuizAssignments).toHaveBeenCalledWith(GOOGLE_USER.uid);
  });

  it('shows the sign-in card for a Google session whose Drive token is missing/expired', () => {
    setAuth({ user: GOOGLE_USER, googleAccessToken: null });
    render(<ClassroomAddonTeacherSpike />);

    // The library genuinely needs the Drive token to load, so an expired token
    // re-prompts rather than showing an unusable empty picker.
    expect(signInButton()).toBeInTheDocument();
    expect(libraryPicker()).not.toBeInTheDocument();
    expect(
      screen.getByText(/sign in with your teacher google account/i)
    ).toBeInTheDocument();
  });
});
