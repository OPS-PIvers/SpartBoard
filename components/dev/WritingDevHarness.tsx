// `/writing-dev`: the student Writing page on a fake session, with the response status picked from a bar.
import React, { useState } from 'react';
import type { WritingResponseStatus } from '@/types';
import { WritingStudentShell } from '@/components/student/writing/WritingStudentShell';

const SESSION = {
  title: 'Personal narrative: a moment that changed you',
  prompt:
    'Write about a time something **changed how you see the world**.\n• Set the scene\n• Show what happened\n• Explain why it still matters',
  minWords: 250,
  maxWords: 600,
  dueAt: Date.UTC(2026, 10, 20, 15, 0),
  timeLimitMinutes: 45,
};

const STATUSES: (WritingResponseStatus | null)[] = [
  null,
  'draft',
  'turned-in',
  'returned',
  'revising',
];

export const WritingDevHarness: React.FC = () => {
  const [status, setStatus] = useState<WritingResponseStatus | null>(null);
  return (
    <div className="relative">
      <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-xl bg-slate-900/90 p-1 text-xs font-semibold text-white shadow-lg">
        {STATUSES.map((s) => (
          // no-tour-anchor: dev-only harness
          <button
            key={s ?? 'none'}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-lg px-3 py-1.5 ${s === status ? 'bg-white text-slate-900' : 'hover:bg-white/10'}`}
          >
            {s ?? 'none'}
          </button>
        ))}
      </div>
      <WritingStudentShell
        session={SESSION}
        status={status}
        onDone={() => undefined}
      />
    </div>
  );
};
