import React from 'react';
import type { QuizLiveLogEntry } from '@/types';
import { NUDGE_NOTE_TEXT } from '@/utils/quizNudgeNotes';

const when = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const describe = (entry: QuizLiveLogEntry): string => {
  if (entry.kind === 'screenshot') return 'Screenshot';
  if (entry.kind === 'banner') return 'Told the student';
  return entry.noteId ? `Nudge: ${NUDGE_NOTE_TEXT[entry.noteId]}` : 'Nudge';
};

/** What the teacher did in Live view for one student. Teacher-only; students never see it. */
export const LiveLogList: React.FC<{ entries: QuizLiveLogEntry[] }> = ({
  entries,
}) => (
  <ul className="space-y-1 text-xs text-slate-700">
    {entries.map((entry) => (
      <li key={entry.id} className="flex items-baseline gap-2">
        <span className="shrink-0 tabular-nums text-slate-500">
          {when(entry.at)}
        </span>
        <span className="min-w-0 flex-1">
          {describe(entry)}
          {entry.questionNumber != null && `, Q${entry.questionNumber}`}
        </span>
        {entry.kind === 'screenshot' && entry.driveFileId && (
          // no-tour-anchor: one link per log row, opens the teacher's own Drive file
          <a
            href={`https://drive.google.com/file/d/${entry.driveFileId}/view`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 font-semibold text-brand-blue-primary hover:underline"
          >
            Open
          </a>
        )}
      </li>
    ))}
  </ul>
);
