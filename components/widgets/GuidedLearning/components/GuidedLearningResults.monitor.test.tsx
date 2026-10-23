/* eslint-disable @typescript-eslint/require-await -- mocked getDoc matches the Promise contract. */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast: vi.fn(),
    rosters: [
      { id: 'r-a', name: 'Period 1', classlinkClassId: 'class-a' },
      { id: 'r-b', name: 'Period 2', classlinkClassId: 'class-b' },
    ],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    orgId: 'org-1',
    canAccessFeature: (id: string) => id === 'monitor-parity',
  }),
}));

interface ResponseFixture {
  sessionId: string;
  studentAnonymousId: string;
  answers: { stepId: string; answer: string; isCorrect: null }[];
  completedAt: number | null;
  startedAt: number;
  score: number | null;
}
let mockResponses: ResponseFixture[] = [];
vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionTeacher: () => ({
    responses: mockResponses,
    responsesLoading: false,
    subscribeToResponses: () => () => undefined,
    exportResponsesAsCSV: vi.fn(),
  }),
  isAnswerCorrect: () => false,
}));

const NAMES: Record<string, { givenName: string; familyName: string }> = {
  u1: { givenName: 'Ava', familyName: 'Martinez' },
  u2: { givenName: 'Ben', familyName: 'Okafor' },
  u3: { givenName: 'Cara', familyName: 'Nguyen' },
};
const CLASS_OF: Record<string, string> = {
  u1: 'class-a',
  u2: 'class-a',
  u3: 'class-b',
};
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: (
    _id: string,
    classIds: readonly string[] | null | undefined
  ) => ({
    byStudentUid: new Map(
      Object.entries(NAMES).filter(([uid]) =>
        (classIds ?? []).includes(CLASS_OF[uid])
      )
    ),
    byAssignmentPseudonym: new Map(),
  }),
  formatStudentName: (n?: { givenName: string; familyName: string }) =>
    n ? `${n.givenName} ${n.familyName}` : '',
}));

let sessionData: Record<string, unknown> = {};
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: async () => ({ exists: () => true, data: () => sessionData }),
  onSnapshot: () => () => undefined,
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

import { GuidedLearningResults } from './GuidedLearningResults';

const SET = {
  id: 'set-1',
  title: 'The water cycle',
  steps: [],
  createdAt: 0,
  updatedAt: 0,
} as unknown as GuidedLearningSet;

const response = (uid: string, done: boolean): ResponseFixture => ({
  sessionId: 's1',
  studentAnonymousId: uid,
  answers: [],
  completedAt: done ? 1 : null,
  startedAt: 1,
  score: null,
});

const bucket = (label: string) =>
  screen.getByRole('button', { name: new RegExp(label) }).textContent;

beforeEach(() => {
  mockResponses = [response('u1', true), response('u2', false)];
  sessionData = { classIds: ['class-a', 'class-b'] };
});

describe('GuidedLearningResults monitor (monitor-parity)', () => {
  it('opens on the first class and counts its roster', async () => {
    render(
      <GuidedLearningResults set={SET} sessionId="s1" onClose={vi.fn()} />
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Class' })).toBeTruthy()
    );
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: 'Class' }).value
    ).toBe('class-a');
    expect(bucket('Not started')).toBe('0Not started');
    expect(bucket('In progress')).toBe('1In progress');
    expect(bucket('Done')).toBe('1Done');

    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: '' },
    });
    expect(bucket('Not started')).toBe('1Not started');
    fireEvent.click(screen.getByRole('button', { name: /Not started/ }));
    expect(screen.getByText('Cara Nguyen')).toBeTruthy();
  });

  it('skips roster students on a per-student assignment', async () => {
    sessionData = { classIds: ['class-a'], individualTargeting: true };
    mockResponses = [response('u1', true)];
    render(
      <GuidedLearningResults set={SET} sessionId="s1" onClose={vi.fn()} />
    );
    await waitFor(() => expect(bucket('Done')).toBe('1Done'));
    expect(bucket('Not started')).toBe('0Not started');
  });

  it('shows Ended for an archived assignment', async () => {
    render(
      <GuidedLearningResults set={SET} sessionId="s1" onClose={vi.fn()} ended />
    );
    await waitFor(() => expect(screen.getByText('Ended')).toBeTruthy());
  });

  it('keeps Start for a lone per-period class waiting to open', async () => {
    sessionData = {
      classIds: ['class-a'],
      teacherUid: 't1',
      periodAccess: {
        'class-a': {
          label: 'Period 1',
          state: 'closed',
          openAt: null,
          closeAt: null,
          verified: true,
        },
      },
    };
    render(
      <GuidedLearningResults set={SET} sessionId="s1" onClose={vi.fn()} />
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
    );
    expect(screen.getAllByText('Not started').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ended')).toBeNull();
  });
});
