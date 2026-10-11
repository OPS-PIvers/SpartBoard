// DEV-only: the v2 Mini App results view over the widget, for /assign-stepper-dev mockups.
import React from 'react';
import {
  MiniAppResultsView,
  type MiniAppAttemptView,
  type MiniAppResultRow,
} from '@/components/widgets/MiniApp/components/MiniAppResultsView';
import type { MiniAppManifestQuestion } from '@/types';

const QUESTIONS: MiniAppManifestQuestion[] = [
  { id: 'q1', type: 'mc', prompt: 'Which fraction is larger?' },
  { id: 'q2', type: 'numeric', prompt: '3/4 of 20' },
  { id: 'q3', type: 'tf', prompt: '2/4 equals 1/2' },
  { id: 'q4', type: 'short', prompt: 'Name the top number' },
  { id: 'q5', type: 'other', prompt: 'Build a pizza with 3/8 pepperoni' },
];

const T = Date.UTC(2026, 9, 12, 14, 5);
const marks = (correct: boolean[], appLast = false) =>
  correct.map((c, i) => ({
    id: `q${i + 1}`,
    correct: c,
    by: appLast && i === 4 ? ('app' as const) : ('server' as const),
  }));

const ROWS: MiniAppResultRow[] = [
  {
    id: 'a',
    name: 'Ava Martinez',
    attemptCount: 2,
    best: {
      score: 5,
      maxScore: 5,
      attemptNo: 2,
      gradedBy: 'app',
      items: marks([true, true, true, true, true], true),
    },
    lastSubmittedAt: T,
    doneOnly: false,
  },
  {
    id: 'b',
    name: 'Benjamin Okonkwo-Larsen',
    attemptCount: 1,
    best: {
      score: 3,
      maxScore: 5,
      attemptNo: 1,
      gradedBy: 'app',
      items: marks([true, false, true, false, true], true),
    },
    lastSubmittedAt: T - 3_600_000,
    doneOnly: false,
  },
  {
    id: 'c',
    name: 'Chloe Nguyen',
    attemptCount: 3,
    best: {
      score: 4,
      maxScore: 4,
      attemptNo: 3,
      gradedBy: 'server',
      items: marks([true, true, true, true]),
    },
    lastSubmittedAt: T - 7_200_000,
    doneOnly: false,
  },
  {
    id: 'd',
    name: 'Diego Ramos',
    attemptCount: 0,
    best: null,
    lastSubmittedAt: T - 9_000_000,
    doneOnly: true,
  },
];

const ANSWERS = ['3/4', '15', 'True', 'Numerator', '3 of 8 slices'];
const WRONG = ['2/3', '12', 'False', 'Denominator', '2 of 8 slices'];

const attemptsFor = (rowId: string): MiniAppAttemptView[] => {
  const row = ROWS.find((r) => r.id === rowId);
  if (!row?.best) return [];
  const best = row.best;
  return Array.from({ length: row.attemptCount }, (_, i) => {
    const attemptNo = i + 1;
    const isBest = attemptNo === best.attemptNo;
    const score = isBest ? best.score : Math.max(0, best.score - 2 + i);
    return {
      attemptNo,
      submittedAt: T - (row.attemptCount - attemptNo) * 900_000,
      score,
      maxScore: best.maxScore,
      gradedBy: best.gradedBy,
      ...(isBest
        ? {
            items: (best.items ?? []).map((m, q) => ({
              id: m.id,
              answer: m.correct ? ANSWERS[q] : WRONG[q],
              correct: m.correct,
              earned: m.correct ? 1 : 0,
              points: 1,
            })),
          }
        : {}),
    };
  });
};

const Preview: React.FC = () => (
  <div
    className="relative h-[620px] w-[760px] overflow-hidden rounded-2xl bg-white shadow-xl"
    style={{ containerType: 'size' }}
  >
    <MiniAppResultsView
      title="Fractions check, period 3"
      rows={ROWS}
      questions={QUESTIONS}
      attemptLimit={3}
      loadAttempts={(id) => Promise.resolve(attemptsFor(id))}
      onBack={() => undefined}
      onExport={() => Promise.resolve('https://docs.google.com')}
    />
  </div>
);

const MiniAppResultsDev = {
  title: 'Mini App results',
  render: Preview,
};

export default MiniAppResultsDev;
