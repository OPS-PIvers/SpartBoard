import { describe, expect, it } from 'vitest';
import {
  initialQuizTeacherSessionState,
  loadedValue,
  quizTeacherSessionReducer,
  type QuizTeacherSessionAction,
  type QuizTeacherSessionState,
} from '@/utils/quizTeacherSessionState';
import type { QuizResponse, QuizSession } from '@/types';
import type { QuizSessionContent } from '@/utils/quizSessionContent';

const SESSION = { id: 's1', status: 'active' } as unknown as QuizSession;
const CONTENT = { publicQuestions: [] } as unknown as QuizSessionContent;
const RESPONSES = [{ studentUid: 'a' }] as unknown as QuizResponse[];

const run = (
  state: QuizTeacherSessionState,
  ...actions: QuizTeacherSessionAction[]
) => actions.reduce(quizTeacherSessionReducer, state);

describe('quizTeacherSessionReducer', () => {
  it('starts loading with a session id and settled without one', () => {
    expect(initialQuizTeacherSessionState('s1').session).toEqual({
      kind: 'loading',
    });
    expect(initialQuizTeacherSessionState(null).session).toEqual({
      kind: 'loaded',
      value: null,
    });
  });

  it('records each listener delivery', () => {
    const state = run(
      initialQuizTeacherSessionState('s1'),
      { type: 'sessionSnapshot', session: SESSION },
      { type: 'contentSnapshot', content: CONTENT },
      { type: 'responses', responses: RESPONSES }
    );
    expect(loadedValue(state.session)).toBe(SESSION);
    expect(loadedValue(state.content)).toBe(CONTENT);
    expect(state.responses).toBe(RESPONSES);
  });

  it('a missing session doc settles as loaded with no session', () => {
    const state = run(initialQuizTeacherSessionState('s1'), {
      type: 'sessionSnapshot',
      session: null,
    });
    expect(state.session).toEqual({ kind: 'loaded', value: null });
  });

  it('a listener error ends the wait but keeps what already arrived', () => {
    const fresh = run(
      initialQuizTeacherSessionState('s1'),
      { type: 'sessionError' },
      { type: 'contentError' }
    );
    expect(fresh.session).toEqual({ kind: 'loaded', value: null });
    expect(fresh.content).toEqual({ kind: 'loaded', value: null });

    const loaded = run(
      initialQuizTeacherSessionState('s1'),
      { type: 'sessionSnapshot', session: SESSION },
      { type: 'contentSnapshot', content: CONTENT },
      { type: 'sessionError' },
      { type: 'contentError' }
    );
    expect(loadedValue(loaded.session)).toBe(SESSION);
    expect(loadedValue(loaded.content)).toBe(CONTENT);
  });

  it('selecting another session clears the previous one', () => {
    const before = run(
      initialQuizTeacherSessionState('s1'),
      { type: 'sessionSnapshot', session: SESSION },
      { type: 'responses', responses: RESPONSES }
    );
    expect(run(before, { type: 'select', sessionId: 's2' })).toEqual(
      initialQuizTeacherSessionState('s2')
    );
    expect(run(before, { type: 'select', sessionId: null })).toEqual(
      initialQuizTeacherSessionState(null)
    );
  });

  it('selecting the same session changes nothing', () => {
    const before = run(initialQuizTeacherSessionState('s1'), {
      type: 'sessionSnapshot',
      session: SESSION,
    });
    expect(run(before, { type: 'select', sessionId: 's1' })).toBe(before);
  });
});
