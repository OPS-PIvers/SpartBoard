// The student Writing page frame (PR B1 placeholder): heading, prompt and status; B2 adds the writing box.
import React from 'react';
import { CalendarClock, NotebookPen } from 'lucide-react';
import { PromptText } from '@/components/common/PromptText';
import type { WritingAssignmentSession, WritingResponseStatus } from '@/types';
import { StudentPageShell } from '../StudentPageShell';

export type WritingShellSession = Pick<
  WritingAssignmentSession,
  'title' | 'prompt' | 'minWords' | 'maxWords' | 'dueAt' | 'timeLimitMinutes'
>;

const STATUS_LABEL: Record<WritingResponseStatus | 'none', string> = {
  none: 'Not started',
  draft: 'In progress',
  'turned-in': 'Turned in',
  returned: 'Returned',
  revising: 'Returned for revision',
};

const STATUS_TONE: Record<WritingResponseStatus | 'none', string> = {
  none: 'bg-slate-100 text-slate-700',
  draft: 'bg-amber-50 text-amber-800',
  'turned-in': 'bg-emerald-50 text-emerald-800',
  returned: 'bg-blue-50 text-brand-blue-dark',
  revising: 'bg-rose-50 text-rose-800',
};

const DUE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const wordLimitLabel = (min?: number, max?: number): string | null => {
  if (min && max) return `${min} to ${max} words`;
  if (min) return `At least ${min} words`;
  if (max) return `Up to ${max} words`;
  return null;
};

export const WritingStudentShell: React.FC<{
  session: WritingShellSession;
  status: WritingResponseStatus | null;
  onDone: () => void;
}> = ({ session, status, onDone }) => {
  const key = status ?? 'none';
  const limit = wordLimitLabel(session.minWords, session.maxWords);
  return (
    <StudentPageShell onDone={onDone} doneAction="back">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {session.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-600">
              {typeof session.dueAt === 'number' && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  Due {DUE_FORMAT.format(session.dueAt)}
                </span>
              )}
              {limit && <span>{limit}</span>}
              {session.timeLimitMinutes ? (
                <span>{session.timeLimitMinutes} minutes</span>
              ) : null}
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[key]}`}
            data-testid="writing-status"
          >
            {STATUS_LABEL[key]}
          </span>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-800">
          <PromptText text={session.prompt} />
        </section>
        <section className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-slate-600">
          <NotebookPen className="h-6 w-6 text-teal-700" aria-hidden="true" />
          <p className="text-sm font-semibold">Writing opens here soon.</p>
        </section>
      </div>
    </StudentPageShell>
  );
};
