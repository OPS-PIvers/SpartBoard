// Teacher marking for one Video Activity short-answer question: each student's text and a points box.
import React, { useState } from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { VideoActivityQuestion, VideoActivityResponse } from '@/types';
import { logError } from '@/utils/logError';
import {
  parseMarkPoints,
  saveShortAnswerMark,
} from '@/utils/videoActivityShortAnswerMark';

interface MarkRowProps {
  sessionId: string;
  response: VideoActivityResponse;
  question: VideoActivityQuestion;
  answer: string;
  name: string;
  graderUid: string | undefined;
  disabled: boolean;
  onError: (message: string) => void;
}

const MarkRow: React.FC<MarkRowProps> = ({
  sessionId,
  response,
  question,
  answer,
  name,
  graderUid,
  disabled,
  onError,
}) => {
  const max = question.points ?? 1;
  const saved = response.grading?.[question.id]?.pointsAwarded;
  const savedText = saved === undefined ? '' : String(saved);
  // The draft follows the saved mark until the teacher types.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? savedText;
  const responseKey = response._responseKey;

  const commit = () => {
    if (draft === null) return;
    const points = parseMarkPoints(draft, max);
    if (points === null || points === saved || !responseKey || !graderUid) {
      setDraft(null);
      return;
    }
    setSaving(true);
    void saveShortAnswerMark(sessionId, responseKey, question.id, {
      pointsAwarded: points,
      gradedBy: graderUid,
      gradedAt: Date.now(),
    })
      .then(() => setDraft(null))
      .catch((err: unknown) => {
        logError('VaShortAnswerMarking.save', err, {
          sessionId,
          questionId: question.id,
        });
        onError("Couldn't save that mark. Try again.");
      })
      .finally(() => setSaving(false));
  };

  const inputId = `va-mark-${question.id}-${responseKey ?? response.studentUid}`;
  return (
    <li
      className="flex items-start border-b border-slate-100 last:border-b-0"
      style={{
        gap: 'min(10px, 2.5cqmin)',
        padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
      }}
    >
      <div className="flex-1 min-w-0">
        <label
          htmlFor={inputId}
          className="block font-bold text-slate-700 truncate"
          style={{ fontSize: 'min(12px, 3.5cqmin)' }}
        >
          {name}
        </label>
        <p
          className="text-slate-800 whitespace-pre-wrap break-words"
          style={{ fontSize: 'min(13px, 4cqmin)' }}
        >
          {answer}
        </p>
      </div>
      <div
        className="flex items-center shrink-0 text-slate-500"
        style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(12px, 3.5cqmin)' }}
      >
        <input
          {...tourFieldAttr(
            'video-activity.results-mark-points',
            'video-activity',
            `${question.id}:${responseKey ?? response.studentUid}`
          )}
          id={inputId}
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step="any"
          value={value}
          disabled={disabled || saving || !responseKey}
          placeholder="–"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          aria-label={`Points for ${name}`}
          className="rounded-lg border border-slate-300 bg-white text-slate-900 text-right tabular-nums focus:outline-hidden focus:ring-2 focus:ring-brand-blue-light disabled:bg-slate-50"
          style={{
            width: 'min(64px, 16cqmin)',
            padding: 'min(4px, 1cqmin) min(6px, 1.5cqmin)',
            fontSize: 'min(13px, 4cqmin)',
          }}
        />
        <span className="tabular-nums">/ {max}</span>
      </div>
    </li>
  );
};

interface VaShortAnswerMarkingProps {
  sessionId: string;
  question: VideoActivityQuestion;
  responses: VideoActivityResponse[];
  nameFor: (r: VideoActivityResponse) => string;
  graderUid: string | undefined;
  disabled: boolean;
  onError: (message: string) => void;
}

export const VaShortAnswerMarking: React.FC<VaShortAnswerMarkingProps> = ({
  sessionId,
  question,
  responses,
  nameFor,
  graderUid,
  disabled,
  onError,
}) => {
  const rows = responses
    .map((r) => ({
      r,
      answer: r.answers.find((a) => a.questionId === question.id)?.answer ?? '',
      name: nameFor(r),
    }))
    .filter((x) => x.answer.trim().length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (rows.length === 0) {
    return (
      <p
        className="text-slate-500"
        style={{
          fontSize: 'min(12px, 3.5cqmin)',
          padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
        }}
      >
        No answers yet
      </p>
    );
  }

  return (
    <ul className="bg-slate-50/70 border-t border-slate-100">
      {rows.map(({ r, answer, name }) => (
        <MarkRow
          key={r._responseKey ?? r.studentUid}
          sessionId={sessionId}
          response={r}
          question={question}
          answer={answer}
          name={name}
          graderUid={graderUid}
          disabled={disabled}
          onError={onError}
        />
      ))}
    </ul>
  );
};
