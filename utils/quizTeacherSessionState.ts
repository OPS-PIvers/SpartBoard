// What the teacher's quiz session listeners have delivered, as one reducer in place of separate loading flags.

import type { QuizResponse, QuizSession } from '@/types';
import type { QuizSessionContent } from '@/utils/quizSessionContent';

export type Loadable<T> = { kind: 'loading' } | { kind: 'loaded'; value: T };

export interface QuizTeacherSessionState {
  sessionId: string | null | undefined;
  session: Loadable<QuizSession | null>;
  content: Loadable<QuizSessionContent | null>;
  responses: QuizResponse[];
}

export type QuizTeacherSessionAction =
  | { type: 'select'; sessionId: string | null | undefined }
  | { type: 'sessionSnapshot'; session: QuizSession | null }
  | { type: 'sessionError' }
  | { type: 'contentSnapshot'; content: QuizSessionContent | null }
  | { type: 'contentError' }
  | { type: 'responses'; responses: QuizResponse[] };

export function initialQuizTeacherSessionState(
  sessionId: string | null | undefined
): QuizTeacherSessionState {
  return {
    sessionId,
    session: sessionId ? { kind: 'loading' } : { kind: 'loaded', value: null },
    content: { kind: 'loading' },
    responses: [],
  };
}

// A listener error ends the wait but keeps whatever was already delivered.
function settle<T>(current: Loadable<T | null>): Loadable<T | null> {
  return current.kind === 'loading' ? { kind: 'loaded', value: null } : current;
}

export function quizTeacherSessionReducer(
  state: QuizTeacherSessionState,
  action: QuizTeacherSessionAction
): QuizTeacherSessionState {
  switch (action.type) {
    case 'select':
      return action.sessionId === state.sessionId
        ? state
        : initialQuizTeacherSessionState(action.sessionId);
    case 'sessionSnapshot':
      return { ...state, session: { kind: 'loaded', value: action.session } };
    case 'sessionError':
      return { ...state, session: settle(state.session) };
    case 'contentSnapshot':
      return { ...state, content: { kind: 'loaded', value: action.content } };
    case 'contentError':
      return { ...state, content: settle(state.content) };
    case 'responses':
      return { ...state, responses: action.responses };
  }
}

export function loadedValue<T>(loadable: Loadable<T | null>): T | null {
  return loadable.kind === 'loaded' ? loadable.value : null;
}
