import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { getDoc } from 'firebase/firestore';
import { AssignmentListItem } from '@/components/student/AssignmentListItem';
import {
  applyResultsOverride,
  type AssignmentSummary,
} from '@/hooks/useStudentAssignments';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

const quiz = (gradingState: 'graded' | 'not-graded'): AssignmentSummary => ({
  compositeId: 'quiz:s-1',
  kind: 'quiz',
  sessionId: 's-1',
  title: 'Unit 3 quiz',
  openHref: '/quiz?code=ABC',
  channel: 'ended',
  classIds: [],
  gradingState,
});

const responseDoc = (data: Record<string, unknown>) => ({
  exists: () => true,
  data: () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyResultsOverride', () => {
  const NOW = 1000;
  it('keeps the class state with no active override', () => {
    expect(applyResultsOverride('graded', undefined, NOW)).toBe('graded');
    expect(
      applyResultsOverride(
        'not-graded',
        {
          mode: 'shown',
          visibility: 'score-only',
          publishedAt: 1,
          expiresAt: NOW,
        },
        NOW
      )
    ).toBe('not-graded');
  });
  it('Shown grades and Hidden suppresses the class state', () => {
    expect(
      applyResultsOverride(
        'not-graded',
        { mode: 'shown', visibility: 'score-only', publishedAt: 1 },
        NOW
      )
    ).toBe('graded');
    expect(
      applyResultsOverride('graded', { mode: 'hidden', publishedAt: 1 }, NOW)
    ).toBe('not-graded');
  });
});

describe('AssignmentListItem — per-student results', () => {
  it('shows View results to a Shown student when the class is unpublished', async () => {
    (getDoc as Mock).mockResolvedValue(
      responseDoc({
        status: 'completed',
        resultsOverride: {
          mode: 'shown',
          visibility: 'score-only',
          publishedAt: 1,
        },
      })
    );
    render(
      <AssignmentListItem assignment={quiz('not-graded')} pseudonymUid="u1" />
    );
    expect(await screen.findByText('View results')).toBeInTheDocument();
  });

  it('shows Not graded to a Hidden student when the class is published', async () => {
    (getDoc as Mock).mockResolvedValue(
      responseDoc({
        status: 'completed',
        resultsOverride: { mode: 'hidden', publishedAt: 1 },
      })
    );
    render(
      <AssignmentListItem assignment={quiz('graded')} pseudonymUid="u1" />
    );
    expect(await screen.findByText('Not graded')).toBeInTheDocument();
  });

  it('follows the class once the override has expired', async () => {
    (getDoc as Mock).mockResolvedValue(
      responseDoc({
        status: 'completed',
        resultsOverride: {
          mode: 'hidden',
          publishedAt: 1,
          expiresAt: 2,
        },
      })
    );
    render(
      <AssignmentListItem assignment={quiz('graded')} pseudonymUid="u1" />
    );
    expect(await screen.findByText('View results')).toBeInTheDocument();
  });
});
