// What a student sees once the teacher returns their writing (D12-D14): the score, the comment and the highlights.
import React, { useMemo, useState } from 'react';
import type { WritingGrading } from '@/types';
import { AnnotatedResponseView } from '@/components/widgets/QuizWidget/components/AnnotatedResponseView';
import { useWritingReturnedDrafts } from '@/hooks/useWritingReturnedDrafts';
import type { WritingDraftWithId } from '@/hooks/useWritingResults';
import {
  formatWritingScore,
  sortDraftsNewestFirst,
  writingMaxPoints,
} from '@/utils/writingGrading';

export const WritingReturnedFeedbackView: React.FC<{
  drafts: WritingDraftWithId[];
  grading: WritingGrading;
}> = ({ drafts, grading }) => {
  const ordered = useMemo(() => sortDraftsNewestFirst(drafts), [drafts]);
  const [picked, setPicked] = useState<string | null>(null);
  const draft = ordered.find((d) => d.id === picked) ?? ordered[0];
  if (!draft) return null;
  const max = writingMaxPoints(grading);
  const rubric = grading.mode === 'rubric' ? grading.rubricSnapshot : null;
  const score = formatWritingScore(draft.grade, max);
  const comment = draft.feedback?.overallComment?.trim();
  const annotations = draft.feedback?.annotations ?? [];
  return (
    <section
      aria-label="Feedback"
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-base font-bold text-slate-900">Feedback</h2>
        {ordered.length > 1 ? (
          // no-tour-anchor: student page
          <select
            aria-label="Draft"
            value={draft.id}
            onChange={(e) => setPicked(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-800"
          >
            {ordered.map((d) => (
              <option key={d.id} value={d.id}>
                {`Draft ${d.number}`}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-semibold text-slate-600">
            {`Draft ${draft.number}`}
          </span>
        )}
        {score && (
          <span className="ml-auto text-lg font-bold tabular-nums text-teal-800">
            {score}
          </span>
        )}
      </div>
      {rubric && (draft.grade?.rubricScores?.length ?? 0) > 0 && (
        <ul className="divide-y divide-slate-200 border-y border-slate-200 text-sm">
          {rubric.criteria.map((c) => {
            const scored = draft.grade?.rubricScores?.find(
              (r) => r.criterionId === c.id
            );
            const level = c.levels.find((l) => l.id === scored?.levelId);
            return (
              <li key={c.id} className="flex items-baseline gap-3 py-1.5">
                <span className="min-w-0 flex-1 font-semibold text-slate-800">
                  {c.name}
                </span>
                <span className="text-slate-600">{level?.label ?? ''}</span>
                <span className="w-12 text-right tabular-nums text-slate-700">
                  {scored ? scored.points : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {comment && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {comment}
        </p>
      )}
      {annotations.length > 0 && (
        <AnnotatedResponseView
          key={draft.id}
          mode="read"
          light
          snapshot={draft.html}
          annotations={annotations}
        />
      )}
    </section>
  );
};

/** Live returned copies for the signed-in student; renders nothing until one is returned. */
export const WritingReturnedFeedback: React.FC<{
  sessionId: string;
  studentUid: string | null;
  grading: WritingGrading;
  draftSeq: number | undefined;
  returnedAt: number | undefined;
}> = ({ sessionId, studentUid, grading, draftSeq, returnedAt }) => {
  const drafts = useWritingReturnedDrafts(
    sessionId,
    studentUid,
    draftSeq ?? 0,
    returnedAt
  );
  return <WritingReturnedFeedbackView drafts={drafts} grading={grading} />;
};
