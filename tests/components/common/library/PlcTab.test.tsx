import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PlcContribution } from '@/types';

// Mock usePlcContributions before importing PlcTab so the component reads
// the test's controlled contribution list rather than spinning up an
// onSnapshot listener against a real Firestore.
const mockContributions = vi.fn<() => PlcContribution[]>(() => []);
vi.mock('@/hooks/usePlcContributions', () => ({
  usePlcContributions: () => ({
    contributions: mockContributions(),
    loading: false,
    error: null,
  }),
}));

import { PlcTab } from '@/components/common/library/PlcTab';

function makeContribution(args: {
  teacherUid: string;
  teacherName: string;
  quizId?: string;
  syncGroupId?: string | null;
  questions: { id: string; text: string; points?: number }[];
  responses: {
    score: number | null;
    pointsPerQuestion: Record<string, number>;
    status?: 'completed' | 'in-progress';
  }[];
}): PlcContribution {
  return {
    id: `${args.quizId ?? 'quiz-X'}_${args.teacherUid}`,
    schemaVersion: 1,
    quizId: args.quizId ?? 'quiz-X',
    syncGroupId: args.syncGroupId ?? null,
    teacherUid: args.teacherUid,
    teacherName: args.teacherName,
    questionsSnapshot: args.questions.map((q) => ({
      id: q.id,
      text: q.text,
      points: q.points ?? 1,
    })),
    responses: args.responses.map((r, i) => ({
      studentDisplayName: `Student ${args.teacherUid}-${i}`,
      pin: String(i + 1).padStart(4, '0'),
      classPeriod: 'Period 1',
      status: r.status ?? 'completed',
      scorePercent: r.score,
      pointsEarned: Object.values(r.pointsPerQuestion).reduce(
        (a, b) => a + b,
        0
      ),
      maxPoints: args.questions.reduce((sum, q) => sum + (q.points ?? 1), 0),
      tabSwitchWarnings: 0,
      submittedAt: 1000 + i,
      pointsByQuestionId: r.pointsPerQuestion,
    })),
    updatedAt: 1,
  };
}

describe('PlcTab', () => {
  it('renders the waiting state when there are no contributions', () => {
    mockContributions.mockReturnValue([]);
    render(<PlcTab plcId="plc-1" />);
    expect(screen.getByText(/waiting for plc results/i)).toBeInTheDocument();
  });

  it('renders the in-progress state when contributions exist but every response is in-progress', () => {
    mockContributions.mockReturnValue([
      makeContribution({
        teacherUid: 'jen',
        teacherName: 'Jen Ivers',
        questions: [{ id: 'q1', text: 'Q1' }],
        responses: [
          { score: null, pointsPerQuestion: {}, status: 'in-progress' },
          { score: null, pointsPerQuestion: {}, status: 'in-progress' },
        ],
      }),
    ]);
    render(<PlcTab plcId="plc-1" />);
    // Distinct copy from "waiting" — the user can tell the difference
    // between "nobody published yet" and "data is in flight."
    expect(screen.getByText(/sessions still in progress/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/waiting for plc results/i)
    ).not.toBeInTheDocument();
  });

  it('renders a unified aggregate when all contributions share the same question schema', () => {
    mockContributions.mockReturnValue([
      makeContribution({
        teacherUid: 'jen',
        teacherName: 'Jen Ivers',
        questions: [
          { id: 'q1', text: 'Q1 text' },
          { id: 'q2', text: 'Q2 text' },
        ],
        responses: [
          { score: 100, pointsPerQuestion: { q1: 1, q2: 1 } },
          { score: 50, pointsPerQuestion: { q1: 1, q2: 0 } },
        ],
      }),
      makeContribution({
        teacherUid: 'tatum',
        teacherName: 'Tatum Erickson',
        questions: [
          { id: 'q1', text: 'Q1 text' },
          { id: 'q2', text: 'Q2 text' },
        ],
        responses: [
          { score: 100, pointsPerQuestion: { q1: 1, q2: 1 } },
          { score: 100, pointsPerQuestion: { q1: 1, q2: 1 } },
        ],
      }),
    ]);

    render(<PlcTab plcId="plc-1" />);

    // 4 completed responses, 2 teachers
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Teachers')).toBeInTheDocument();
    // Average: (100 + 50 + 100 + 100) / 4 = 87.5 → 88%
    expect(screen.getByText('88%')).toBeInTheDocument();
    // Single-group => no drift banner
    expect(
      screen.queryByText(/members are on different versions/i)
    ).not.toBeInTheDocument();
    // Per-question section labels show through verbatim
    expect(screen.getByText('Q1 text')).toBeInTheDocument();
    expect(screen.getByText('Q2 text')).toBeInTheDocument();
  });

  it('shows the schema-drift banner and one aggregate section per version when contributions disagree on questions', () => {
    mockContributions.mockReturnValue([
      // Group A: q1 + q2 (Jen, on the original schema)
      makeContribution({
        teacherUid: 'jen',
        teacherName: 'Jen Ivers',
        questions: [
          { id: 'q1', text: 'Q1 text' },
          { id: 'q2', text: 'Q2 text' },
        ],
        responses: [{ score: 100, pointsPerQuestion: { q1: 1, q2: 1 } }],
      }),
      // Group B: q1 + q2 + q3 (Sarah, on a newer schema with an added Q)
      makeContribution({
        teacherUid: 'sarah',
        teacherName: 'Sarah Cole',
        questions: [
          { id: 'q1', text: 'Q1 text' },
          { id: 'q2', text: 'Q2 text' },
          { id: 'q3-extra', text: 'Q3 text (added)' },
        ],
        responses: [
          { score: 67, pointsPerQuestion: { q1: 1, q2: 1, 'q3-extra': 0 } },
        ],
      }),
    ]);

    render(<PlcTab plcId="plc-1" />);

    expect(
      screen.getByText(/members are on different versions/i)
    ).toBeInTheDocument();
    // Version-1 header carries the contributing teacher's name
    expect(screen.getByText(/Jen Ivers/)).toBeInTheDocument();
    expect(screen.getByText(/Sarah Cole/)).toBeInTheDocument();
    // The added question only renders inside the second group
    expect(screen.getByText('Q3 text (added)')).toBeInTheDocument();
  });
});
