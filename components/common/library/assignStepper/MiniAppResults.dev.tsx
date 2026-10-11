// DEV-only: the v2 Mini App results table in the Submissions dialog, for /assign-stepper-dev mockups.
import React from 'react';
import { Inbox, X } from 'lucide-react';
import {
  MiniAppResultsTable,
  type MiniAppAttemptView,
  type MiniAppResultRow,
} from '@/components/widgets/MiniApp/components/MiniAppResultsTable';
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

const ATTEMPTS: MiniAppAttemptView[] = [
  {
    attemptNo: 1,
    submittedAt: T - 900_000,
    score: 3,
    maxScore: 5,
    gradedBy: 'app',
  },
  { attemptNo: 2, submittedAt: T, score: 5, maxScore: 5, gradedBy: 'app' },
];

const Preview: React.FC = () => (
  <div className="relative h-[620px] w-[760px] overflow-hidden rounded-2xl bg-slate-800">
    <div className="absolute inset-0 z-overlay bg-brand-blue-dark/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-indigo-600 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white min-w-0">
            <Inbox className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-black uppercase tracking-tight">Submissions</p>
              <p className="text-white/80 text-xs truncate">Fraction Pizza</p>
            </div>
          </div>
          <X className="w-5 h-5 text-white/60" />
        </div>
        <div className="p-5 overflow-y-auto">
          <MiniAppResultsTable
            rows={ROWS}
            questions={QUESTIONS}
            attemptLimit={3}
            loadAttempts={() => Promise.resolve(ATTEMPTS)}
            onExport={() => undefined}
          />
        </div>
      </div>
    </div>
  </div>
);

const MiniAppResultsDev = {
  title: 'Mini App results table',
  render: Preview,
};

export default MiniAppResultsDev;
