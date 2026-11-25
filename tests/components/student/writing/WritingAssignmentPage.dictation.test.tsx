import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { StudentAssignmentPointer, StudentOverride } from '@/types';
import type { EditorDictation } from '@/utils/speechToText/types';

const state = vi.hoisted(() => ({
  pinLogin: false,
  pointer: null as StudentAssignmentPointer | null,
  dictation: undefined as EditorDictation | undefined,
  shellRendered: false,
  onDictationInsert: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: (_ref: unknown, next: (snap: unknown) => void) => {
    next({
      exists: () => true,
      id: 'ws-1',
      data: () => ({ teacherUid: 'teacher-1', status: 'active' }),
    });
    return () => undefined;
  },
}));
vi.mock('@/context/useStudentAuth', () => ({
  useStudentAuth: () => ({
    pseudonymUid: 'student-1',
    pinLogin: state.pinLogin,
  }),
}));
vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => state.pointer,
}));
vi.mock('@/hooks/useTabAwayTracker', () => ({
  useTabAwayTracker: () => ({ release: () => undefined }),
}));
vi.mock('@/utils/serverTime', () => ({ syncServerTime: vi.fn() }));
vi.mock('@/hooks/useWritingPiece', () => ({
  useWritingPiece: () => ({
    response: undefined,
    seed: { key: 0, html: '' },
    html: '',
    flushBeforeLeave: () => Promise.resolve(),
    recordAway: vi.fn(),
    onDictationInsert: state.onDictationInsert,
  }),
}));
vi.mock('@/components/student/writing/WritingStudentShell', () => ({
  WritingStudentShell: (props: { piece: { dictation?: EditorDictation } }) => {
    state.shellRendered = true;
    state.dictation = props.piece.dictation;
    return null;
  },
}));
vi.mock('@/components/common/PageProtectionGuards', () => ({
  PageProtectionGuards: () => null,
}));

import { WritingAssignmentPage } from '@/components/student/writing/WritingAssignmentPage';

const withOverride = (override: StudentOverride) => {
  state.pointer = {
    kind: 'writing',
    sessionId: 'ws-1',
    teacherUid: 'teacher-1',
    classId: 'class-1',
    override,
    createdAt: 1,
    updatedAt: 1,
  };
};

async function renderPage(): Promise<EditorDictation | undefined> {
  render(<WritingAssignmentPage />);
  await waitFor(() => expect(state.shellRendered).toBe(true));
  return state.dictation;
}

beforeEach(() => {
  state.pinLogin = false;
  state.pointer = null;
  state.dictation = undefined;
  state.shellRendered = false;
  window.history.replaceState({}, '', '/writing/ws-1');
});

describe('WritingAssignmentPage: paid Speech to text', () => {
  it('passes paid, keyed by the session id, for a signed-in student', async () => {
    withOverride({ speechToText: true, language: 'es' });
    const dictation = await renderPage();
    expect(dictation?.languages).toEqual(['en', 'es']);
    expect(dictation?.onInsert).toBe(state.onDictationInsert);
    expect(dictation?.paid).toEqual({ assignmentId: 'ws-1' });
  });

  it('keeps a PIN joiner on the free engine', async () => {
    state.pinLogin = true;
    withOverride({ speechToText: true });
    const dictation = await renderPage();
    expect(dictation).toBeDefined();
    expect(dictation?.paid).toBeUndefined();
  });

  it('offers no dictation without the accommodation', async () => {
    withOverride({ timeMultiplier: 1.5 });
    expect(await renderPage()).toBeUndefined();
  });
});
