import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniAppStudentApp } from '@/components/miniApp/MiniAppStudentApp';

const {
  mockGetIdTokenResult,
  mockGetDoc,
  mockOnSnapshot,
  mockDoc,
  mockAuth,
  mockDb,
} = vi.hoisted(() => ({
  mockGetIdTokenResult: vi.fn(),
  mockGetDoc: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockDoc: vi.fn((..._args: unknown[]) => ({ _path: _args })),
  mockAuth: {
    currentUser: {
      uid: 'student-auth-uid',
      getIdTokenResult: () => mockGetIdTokenResult() as Promise<unknown>,
    } as { uid: string; getIdTokenResult: () => Promise<unknown> } | null,
    authStateReady: () => Promise.resolve(),
  },
  mockDb: {},
}));

vi.mock('@/config/firebase', () => ({
  auth: mockAuth,
  db: mockDb,
  functions: {},
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn(),
  onAuthStateChanged: (
    _auth: unknown,
    cb: (user: { uid: string } | null) => void
  ) => {
    cb(mockAuth.currentUser);
    return () => undefined;
  },
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: mockDoc,
  getDoc: mockGetDoc,
  onSnapshot: mockOnSnapshot,
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

describe('MiniAppStudentApp timeMultiplier handshake (M17 C3)', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/miniapp/session-1');
    mockOnSnapshot.mockImplementation(
      (_ref: unknown, onNext: (snap: unknown) => void) => {
        onNext({
          exists: () => true,
          data: () => ({
            id: 'session-1',
            appId: 'app-1',
            appTitle: 'Test App',
            appHtml: '<html></html>',
            teacherUid: 'teacher-1',
            assignmentName: 'Assignment',
            status: 'active',
            createdAt: 0,
            submissionsEnabled: true,
          }),
        });
        return () => undefined;
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('posts the pointer doc timeMultiplier into SPART_MINIAPP_INIT for studentRole users', async () => {
    mockGetIdTokenResult.mockResolvedValue({ claims: { studentRole: true } });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        kind: 'mini-app',
        sessionId: 'session-1',
        teacherUid: 'teacher-1',
        classId: 'class-1',
        override: { timeMultiplier: 2 },
        createdAt: 0,
        updatedAt: 0,
      }),
    });

    const { container } = render(<MiniAppStudentApp />);

    const iframe = await waitFor(() => {
      const el = container.querySelector('iframe');
      expect(el).toBeTruthy();
      return el as HTMLIFrameElement;
    });

    const postMessage = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage },
      configurable: true,
    });

    await waitFor(() => expect(mockGetDoc).toHaveBeenCalled());

    iframe.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SPART_MINIAPP_INIT',
          payload: expect.objectContaining({ timeMultiplier: 2 }),
        }),
        '*'
      );
    });
  });

  it('reads the pointer doc at session.assignmentId, not session.id, when they differ (M17 E2 F1)', async () => {
    mockOnSnapshot.mockImplementation(
      (_ref: unknown, onNext: (snap: unknown) => void) => {
        onNext({
          exists: () => true,
          data: () => ({
            id: 'session-1',
            appId: 'app-1',
            appTitle: 'Test App',
            appHtml: '<html></html>',
            teacherUid: 'teacher-1',
            assignmentName: 'Assignment',
            status: 'active',
            createdAt: 0,
            submissionsEnabled: true,
            // Mini-app's archive-row assignment id is a distinct UUID from
            // the session id — the pointer doc must be keyed by this field.
            assignmentId: 'archive-assignment-1',
          }),
        });
        return () => undefined;
      }
    );
    mockGetIdTokenResult.mockResolvedValue({ claims: { studentRole: true } });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        kind: 'mini-app',
        sessionId: 'session-1',
        teacherUid: 'teacher-1',
        classId: 'class-1',
        override: { timeMultiplier: 1.5 },
        createdAt: 0,
        updatedAt: 0,
      }),
    });

    render(<MiniAppStudentApp />);

    await waitFor(() => expect(mockGetDoc).toHaveBeenCalled());

    const pointerCall = mockDoc.mock.calls.find(
      (call) => call[1] === 'student_assignments'
    );
    expect(pointerCall).toBeDefined();
    // (db, 'student_assignments', uid, 'items', pointerId)
    expect(pointerCall?.[4]).toBe('archive-assignment-1');
  });

  it('falls back to session.id for legacy sessions with no assignmentId (M17 E2 F1)', async () => {
    mockGetIdTokenResult.mockResolvedValue({ claims: { studentRole: true } });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        kind: 'mini-app',
        sessionId: 'session-1',
        teacherUid: 'teacher-1',
        classId: 'class-1',
        override: { timeMultiplier: 1.5 },
        createdAt: 0,
        updatedAt: 0,
      }),
    });

    render(<MiniAppStudentApp />);

    await waitFor(() => expect(mockGetDoc).toHaveBeenCalled());

    const pointerCall = mockDoc.mock.calls.find(
      (call) => call[1] === 'student_assignments'
    );
    expect(pointerCall).toBeDefined();
    expect(pointerCall?.[4]).toBe('session-1');
  });

  it('does not fetch the pointer doc for non-studentRole (anonymous) launches', async () => {
    mockGetIdTokenResult.mockResolvedValue({ claims: {} });

    render(<MiniAppStudentApp />);

    await waitFor(() => expect(mockGetIdTokenResult).toHaveBeenCalled());
    const pointerDocCalls = mockGetDoc.mock.calls.filter((call) => {
      const ref = call[0] as { _path?: unknown[] } | undefined;
      return (ref?._path ?? []).includes('student_assignments');
    });
    expect(pointerDocCalls).toHaveLength(0);
  });
});
