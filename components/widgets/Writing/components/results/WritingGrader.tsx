// Writing grades in Quiz's own grader (each draft is a step), with Return and Return for revision in its footer (D11-D14).
import React, { useMemo, useState } from 'react';
import type { WritingAssignmentSession, WrittenAnswerGrade } from '@/types';
import {
  FreeResponseGrader,
  type GraderFooterContext,
} from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import { tourTypeAttr } from '@/config/tourAnchors';
import { writingEventAllowed } from '@/utils/writingResponseState';
import {
  writingCallReason,
  type WritingResultRow,
} from '@/utils/writingGrading';
import {
  draftAtStep,
  draftQuestionId,
  writingFeedbackFromGrade,
  writingGraderQuiz,
  writingGraderResponses,
} from '@/utils/writingGraderShape';
import type {
  SaveWritingFeedbackInput,
  WritingDraftWithId,
} from '@/hooks/useWritingResults';

export interface WritingGraderProps {
  session: Pick<
    WritingAssignmentSession,
    'id' | 'title' | 'prompt' | 'grading' | 'studentCanViewRecord'
  >;
  /** Students with at least one turned-in copy. */
  rows: WritingResultRow[];
  /** Opens on this student's latest copy. */
  initialUid: string | null;
  draftsByStudent: ReadonlyMap<string, WritingDraftWithId[]>;
  teacherUid: string;
  onSaveFeedback: (
    input: SaveWritingFeedbackInput
  ) => Promise<{ counts: boolean }>;
  onReturn: (
    studentUid: string,
    revise: boolean,
    studentCanViewRecord: boolean
  ) => Promise<void>;
  onClose: () => void;
}

const latestNumber = (drafts: readonly WritingDraftWithId[]): number =>
  drafts.reduce((top, d) => Math.max(top, d.number), 0);

export const WritingGrader: React.FC<WritingGraderProps> = ({
  session,
  rows,
  initialUid,
  draftsByStudent,
  teacherUid,
  onSaveFeedback,
  onReturn,
  onClose,
}) => {
  const ungraded = session.grading.mode === 'ungraded';
  const quiz = useMemo(
    () => writingGraderQuiz(session, draftsByStudent),
    [session, draftsByStudent]
  );
  const responses = useMemo(
    () => writingGraderResponses(rows, draftsByStudent),
    [rows, draftsByStudent]
  );
  const names = useMemo(
    () => new Map(rows.map((r) => [r.studentUid, r.name])),
    [rows]
  );
  const [initialTarget] = useState(() => {
    const drafts = initialUid ? draftsByStudent.get(initialUid) : undefined;
    return initialUid && drafts?.length
      ? {
          responseKey: initialUid,
          questionId: draftQuestionId(0),
        }
      : undefined;
  });
  const [studentView, setStudentView] = useState(session.studentCanViewRecord);
  const [busy, setBusy] = useState<null | 'return' | 'revision'>(null);
  const [message, setMessage] = useState<{
    uid: string;
    tone: 'error' | 'done';
    text: string;
  } | null>(null);

  const draftFor = (uid: string, questionId: string | undefined) =>
    draftAtStep(draftsByStudent.get(uid), questionId);
  // Step 1 is each student's latest copy, so the step shows that student's own draft number.
  const labels = {
    questionLabel: 'Draft',
    modeQuestion: 'Draft',
    questionStep: (index: number, _total: number, uid?: string) => {
      const drafts = uid ? draftsByStudent.get(uid) : undefined;
      const n = drafts?.length ?? 0;
      return index <= n ? `Draft ${n - index + 1} of ${n}` : `Draft ${index}`;
    },
  };

  const failText = (uid: string, err: unknown, fallback: string): string =>
    writingCallReason(err) === 'taken-back'
      ? `${names.get(uid) ?? 'The student'} took this work back.`
      : fallback;

  const save = async (
    uid: string,
    key: string,
    grade: WrittenAnswerGrade | null
  ) => {
    const draft = draftFor(uid, key);
    if (!draft) throw new Error('This draft is gone.');
    try {
      await onSaveFeedback({
        sessionId: session.id,
        studentUid: uid,
        draftId: draft.id,
        turnedInAt: draft.turnedInAt,
        feedback: writingFeedbackFromGrade(grade, ungraded),
      });
    } catch (err) {
      setMessage({
        uid,
        tone: 'error',
        text: failText(uid, err, "Couldn't save. Try again."),
      });
      throw err;
    }
  };

  const renderFooterActions = (ctx: GraderFooterContext) => {
    const uid = ctx.responseKey;
    if (!uid) return null;
    const row = rows.find((r) => r.studentUid === uid);
    const drafts = draftsByStudent.get(uid) ?? [];
    const draft = draftFor(uid, ctx.questionId);
    const isLatest = !!draft && draft.number === latestNumber(drafts);
    const status = row?.response?.status ?? null;
    const canReturn =
      isLatest &&
      status !== null &&
      writingEventAllowed(status, { type: 'return' });
    const canRevise =
      isLatest &&
      status !== null &&
      writingEventAllowed(status, { type: 'return-for-revision' });
    const shown = message?.uid === uid ? message : null;

    const doReturn = async (revise: boolean) => {
      setBusy(revise ? 'revision' : 'return');
      setMessage(null);
      try {
        if (!(await ctx.flush())) {
          setMessage({ uid, tone: 'error', text: "Couldn't save. Try again." });
          return;
        }
        await onReturn(uid, revise, studentView);
        setMessage({
          uid,
          tone: 'done',
          text: revise ? 'Returned for revision' : 'Returned',
        });
      } catch (err) {
        setMessage({
          uid,
          tone: 'error',
          text: failText(uid, err, "Couldn't return this. Try again."),
        });
      } finally {
        setBusy(null);
      }
    };

    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <input
            type="checkbox"
            checked={studentView}
            onChange={(e) => setStudentView(e.target.checked)}
            {...tourTypeAttr('writing-grading.student-record', 'writing')}
            className="h-4 w-4 accent-brand-blue-primary"
          />
          Students can replay their own writing
        </label>
        <button
          type="button"
          onClick={() => void doReturn(true)}
          disabled={!canRevise || busy !== null}
          {...tourTypeAttr('writing-grading.return-revision', 'writing')}
          className="rounded-lg border border-brand-blue-primary bg-white px-3 py-1.5 text-xs font-bold text-brand-blue-primary transition-colors hover:bg-brand-blue-lighter disabled:cursor-not-allowed disabled:opacity-50"
        >
          Return for revision
        </button>
        <button
          type="button"
          onClick={() => void doReturn(false)}
          disabled={!canReturn || busy !== null}
          {...tourTypeAttr('writing-grading.return', 'writing')}
          className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Return
        </button>
        {shown && (
          <span
            role={shown.tone === 'error' ? 'alert' : 'status'}
            className={`text-xs font-bold ${shown.tone === 'error' ? 'text-brand-red-dark' : 'text-emerald-700'}`}
          >
            {shown.text}
          </span>
        )}
      </div>
    );
  };

  return (
    <FreeResponseGrader
      quiz={quiz}
      responses={responses}
      displayNameByResponseKey={names}
      teacherUid={teacherUid}
      onSaveGrade={(uid, key, grade) => save(uid, key, grade)}
      onClearGrade={(uid, key) => save(uid, key, null)}
      graderMode="student"
      initialTarget={initialTarget}
      title={session.title}
      labels={labels}
      scoreless={ungraded}
      allowExcuse={!ungraded}
      renderFooterActions={renderFooterActions}
      onClose={onClose}
    />
  );
};
