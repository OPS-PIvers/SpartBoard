// Grades one frozen copy at a time (WRITING_ASSIGNMENT.md D12-D14): highlights, comment, points or rubric, excused, then Return.
import React, { useMemo, useState } from 'react';
import { AlertCircle, Ban, CheckCircle2, Loader2 } from 'lucide-react';
import type {
  WrittenAnswerAnnotation,
  WrittenAnswerRubricScore,
  WritingAssignmentSession,
} from '@/types';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { AnnotatedResponseView } from '@/components/widgets/QuizWidget/components/AnnotatedResponseView';
import { RubricScoringPanel } from '@/components/widgets/QuizWidget/components/RubricScoringPanel';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { highlightClass, htmlToPlainText } from '@/utils/writtenAnnotations';
import { writingEventAllowed } from '@/utils/writingResponseState';
import {
  buildWritingFeedback,
  feedbackForm,
  feedbackFormDirty,
  formatWritingScore,
  sortDraftsNewestFirst,
  writingCallReason,
  writingMaxPoints,
  WRITING_ROW_LABELS,
  type WritingFeedbackForm,
  type WritingResultRow,
} from '@/utils/writingGrading';
import type {
  SaveWritingFeedbackInput,
  WritingDraftWithId,
} from '@/hooks/useWritingResults';

const ACCENT = LIBRARY_HEADER_ACCENTS.writing ?? '#0f766e';

const when = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export interface WritingGraderProps {
  session: Pick<
    WritingAssignmentSession,
    'id' | 'title' | 'grading' | 'studentCanViewRecord'
  >;
  /** Students with at least one turned-in copy. */
  rows: WritingResultRow[];
  selectedUid: string | null;
  onSelect: (studentUid: string) => void;
  /** The selected student's copies. */
  drafts: WritingDraftWithId[];
  draftsLoading: boolean;
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

type Busy = null | 'save' | 'return' | 'revision';

export const WritingGrader: React.FC<WritingGraderProps> = ({
  session,
  rows,
  selectedUid,
  onSelect,
  drafts,
  draftsLoading,
  teacherUid,
  onSaveFeedback,
  onReturn,
  onClose,
}) => {
  const grading = session.grading;
  const max = writingMaxPoints(grading);
  const rubric = grading.mode === 'rubric' ? grading.rubricSnapshot : null;
  const row = rows.find((r) => r.studentUid === selectedUid) ?? null;
  const ordered = useMemo(() => sortDraftsNewestFirst(drafts), [drafts]);
  const [pickedDraft, setPickedDraft] = useState<Record<string, string>>({});
  const draft =
    ordered.find((d) => d.id === pickedDraft[selectedUid ?? '']) ??
    ordered[0] ??
    null;
  const isLatest = draft !== null && draft.id === ordered[0]?.id;
  const formKey = draft && selectedUid ? `${selectedUid}/${draft.id}` : '';

  const [forms, setForms] = useState<Record<string, WritingFeedbackForm>>({});
  const form: WritingFeedbackForm = draft
    ? (forms[formKey] ?? feedbackForm(draft.feedback))
    : feedbackForm(undefined);
  const setForm = (patch: Partial<WritingFeedbackForm>): void => {
    if (!formKey) return;
    setForms((all) => ({ ...all, [formKey]: { ...form, ...patch } }));
  };
  const dirty = draft ? feedbackFormDirty(form, draft.feedback) : false;
  const built = buildWritingFeedback(form, grading);

  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{
    key: string;
    tone: 'error' | 'saved';
    text: string;
  } | null>(null);
  // A take-back drops the open copy, so its message is keyed to the student, not the copy.
  const shownMessage =
    message?.key === formKey || message?.key === `student:${selectedUid}`
      ? message
      : null;
  const [studentView, setStudentView] = useState(session.studentCanViewRecord);

  const status = row?.response?.status ?? null;
  const canReturn =
    status !== null && writingEventAllowed(status, { type: 'return' });
  const canRevise =
    status !== null &&
    writingEventAllowed(status, { type: 'return-for-revision' });

  const fail = (err: unknown, fallback: string): void => {
    const reason = writingCallReason(err);
    setMessage({
      key: reason === 'taken-back' ? `student:${selectedUid}` : formKey,
      tone: 'error',
      text:
        reason === 'taken-back'
          ? `${row?.name ?? 'The student'} took this work back.`
          : fallback,
    });
  };

  /** Saves the open copy's form; false when it could not be saved. */
  const save = async (): Promise<boolean> => {
    if (!draft || !selectedUid || !dirty) return true;
    if (!built.ok) {
      setMessage({
        key: formKey,
        tone: 'error',
        text: `Enter a score from 0 to ${max ?? 0}.`,
      });
      return false;
    }
    try {
      await onSaveFeedback({
        sessionId: session.id,
        studentUid: selectedUid,
        draftId: draft.id,
        turnedInAt: draft.turnedInAt,
        feedback: built.feedback,
      });
      return true;
    } catch (err) {
      fail(err, "Couldn't save. Try again.");
      return false;
    }
  };

  const handleSave = async (): Promise<void> => {
    setBusy('save');
    const ok = await save();
    setBusy(null);
    if (ok) setMessage({ key: formKey, tone: 'saved', text: 'Saved' });
  };

  const handleReturn = async (revise: boolean): Promise<void> => {
    if (!selectedUid) return;
    setBusy(revise ? 'revision' : 'return');
    try {
      if (!(await save())) return;
      await onReturn(selectedUid, revise, studentView);
      setMessage({
        key: formKey,
        tone: 'saved',
        text: revise ? 'Returned for revision' : 'Returned',
      });
    } catch (err) {
      fail(err, "Couldn't return this. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const switchTo = async (next: () => void): Promise<void> => {
    if (dirty) {
      setBusy('save');
      const ok = await save();
      setBusy(null);
      if (!ok) return;
    }
    setActiveAnnotation(null);
    next();
  };

  const handleRubric = (
    scores: WrittenAnswerRubricScore[],
    derived: number
  ): void =>
    setForm({
      rubricScores: scores,
      pointsInput: scores.length > 0 ? String(derived) : '',
    });

  const plain = useMemo(
    () => (draft ? htmlToPlainText(draft.html) : ''),
    [draft]
  );

  const footerEnd = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {shownMessage && (
        <span
          role={shownMessage.tone === 'error' ? 'alert' : 'status'}
          className={`inline-flex items-center gap-1 text-xs font-bold ${
            shownMessage.tone === 'error'
              ? 'text-brand-red-dark'
              : 'text-teal-700'
          }`}
        >
          {shownMessage.tone === 'error' ? (
            <AlertCircle aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
          )}
          {shownMessage.text}
        </span>
      )}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={!draft || !dirty || busy !== null}
        {...tourTypeAttr('writing-grading.save', 'writing')}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === 'save' && (
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        )}
        Save
      </button>
      <button
        type="button"
        onClick={() => void handleReturn(true)}
        disabled={!isLatest || !canRevise || busy !== null}
        {...tourTypeAttr('writing-grading.return-revision', 'writing')}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-teal-700 bg-white px-3 text-sm font-bold text-teal-800 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === 'revision' && (
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        )}
        Return for revision
      </button>
      <button
        type="button"
        onClick={() => void handleReturn(false)}
        disabled={!isLatest || !canReturn || busy !== null}
        {...tourTypeAttr('writing-grading.return', 'writing')}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === 'return' && (
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        )}
        Return
      </button>
    </div>
  );

  const footerExtras = (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
      <input
        type="checkbox"
        checked={studentView}
        onChange={(e) => setStudentView(e.target.checked)}
        {...tourTypeAttr('writing-grading.student-record', 'writing')}
        className="h-4 w-4 accent-teal-700"
      />
      Students can replay their own writing
    </label>
  );

  return (
    <EditorModalShell
      isOpen
      title={session.title || 'Untitled writing assignment'}
      isDirty={false}
      hideSaveButton
      headerAccent={ACCENT}
      footerExtras={footerExtras}
      footerEnd={footerEnd}
      onSave={() => undefined}
      onClose={() => void switchTo(onClose)}
      bodyClassName="p-0! overflow-hidden!"
      saveErrorMessage={false}
      tourScope="writing"
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(160px,1fr)_minmax(0,2.4fr)_minmax(240px,1.2fr)]">
        <nav
          aria-label="Students"
          className="overflow-y-auto border-r border-slate-200 bg-slate-50 pb-4"
        >
          {rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              Nothing turned in yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {rows.map((r, i) => {
                const selected = r.studentUid === selectedUid;
                const score = formatWritingScore(r.response?.grade, max);
                return (
                  <li key={r.studentUid}>
                    <button
                      type="button"
                      onClick={() =>
                        void switchTo(() => onSelect(r.studentUid))
                      }
                      {...tourFieldAttr(
                        'writing-grading.student-select',
                        'writing',
                        `row-${i + 1}`
                      )}
                      aria-current={selected ? 'true' : undefined}
                      className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                        selected
                          ? 'bg-teal-700 font-bold text-white'
                          : 'text-slate-700 hover:bg-slate-200/60'
                      }`}
                    >
                      <span className="min-w-0 flex-1 break-words">
                        {r.name}
                      </span>
                      <span
                        className={`shrink-0 text-xs ${selected ? 'text-teal-50' : 'text-slate-500'}`}
                      >
                        {score ?? WRITING_ROW_LABELS[r.state]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-slate-100 p-5 pb-8">
          {draftsLoading ? (
            <div className="flex flex-1 items-center justify-center text-teal-700">
              <Loader2 aria-label="Loading" className="h-6 w-6 animate-spin" />
            </div>
          ) : !draft ? (
            <p className="text-sm text-slate-500">
              {row ? 'Nothing turned in yet.' : 'Select a student.'}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {ordered.length > 1 ? (
                  <select
                    aria-label="Draft"
                    value={draft.id}
                    onChange={(e) => {
                      const id = e.target.value;
                      void switchTo(() =>
                        setPickedDraft((p) => ({
                          ...p,
                          [selectedUid ?? '']: id,
                        }))
                      );
                    }}
                    {...tourTypeAttr('writing-grading.draft-select', 'writing')}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-slate-800"
                  >
                    {ordered.map((d) => (
                      <option key={d.id} value={d.id}>
                        {`Draft ${d.number}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm font-bold text-slate-800">
                    {`Draft ${draft.number}`}
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {`Turned in ${when(draft.turnedInAt)}`}
                  {draft.turnedInBy === 'timer' ? ' when time ran out' : ''}
                  {` · ${draft.summary.wordCount} words`}
                  {typeof draft.returnedAt === 'number'
                    ? ` · Returned ${when(draft.returnedAt)}`
                    : ''}
                </span>
              </div>
              <div data-pii>
                <AnnotatedResponseView
                  key={formKey}
                  mode="edit"
                  snapshot={draft.html}
                  annotations={form.annotations}
                  authorUid={teacherUid}
                  onChange={(annotations: WrittenAnswerAnnotation[]) =>
                    setForm({ annotations })
                  }
                  activeId={activeAnnotation}
                  onActiveIdChange={setActiveAnnotation}
                  rubric={rubric ?? undefined}
                  autoTagSingleStrand
                />
              </div>
            </>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-l border-slate-200 bg-white p-5 pb-8">
          {draft && max !== null && !form.excused && (
            <div>
              <div className="flex items-center gap-3">
                <label
                  htmlFor="writing-grade-points"
                  className="text-sm font-bold uppercase tracking-wider text-slate-500"
                >
                  Score
                </label>
                <input
                  id="writing-grade-points"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={0}
                  max={max}
                  value={form.pointsInput}
                  onChange={(e) => setForm({ pointsInput: e.target.value })}
                  {...tourTypeAttr('writing-grading.points', 'writing')}
                  aria-invalid={!built.ok || undefined}
                  placeholder="0"
                  className="w-24 rounded-lg border-2 border-teal-600/30 bg-white px-3 py-2 text-lg font-bold text-teal-900 focus:border-teal-600 focus:outline-hidden aria-[invalid]:border-brand-red-primary/60"
                />
                <span className="whitespace-nowrap font-mono text-base text-slate-500">
                  / {max}
                </span>
              </div>
              {!built.ok && (
                <p className="mt-1.5 text-xs font-bold text-brand-red-dark">
                  {`Enter a score from 0 to ${max}.`}
                </p>
              )}
              {rubric && (
                <div className="mt-4">
                  <RubricScoringPanel
                    key={formKey}
                    rubric={rubric}
                    maxPoints={max}
                    initialScores={form.rubricScores}
                    onChange={handleRubric}
                  />
                </div>
              )}
            </div>
          )}

          {draft && max !== null && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.excused}
                onChange={(e) => setForm({ excused: e.target.checked })}
                {...tourTypeAttr('writing-grading.excused', 'writing')}
                className="h-4 w-4 accent-teal-700"
              />
              <Ban aria-hidden className="h-4 w-4 text-slate-500" />
              Excused
            </label>
          )}

          {draft && (
            <div>
              <label
                htmlFor="writing-grade-comment"
                className="mb-2 block text-sm font-bold uppercase tracking-wider text-slate-500"
              >
                Overall comment (optional)
              </label>
              <textarea
                id="writing-grade-comment"
                value={form.comment}
                onChange={(e) => setForm({ comment: e.target.value })}
                rows={5}
                placeholder="Feedback for this student…"
                {...tourTypeAttr('writing-grading.comment', 'writing')}
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-hidden focus:ring-2 focus:ring-teal-600/30"
              />
            </div>
          )}

          {draft && (
            <div className="border-t border-slate-200 pt-3">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                {`Highlights & comments (${form.annotations.length})`}
              </h4>
              {form.annotations.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Select text to highlight it.
                </p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {form.annotations.map((a, i) => {
                    const snippet = plain.slice(a.from, a.to);
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setActiveAnnotation(a.id)}
                          {...tourFieldAttr(
                            'writing-grading.highlight-select',
                            'writing',
                            `row-${i + 1}`
                          )}
                          className={`w-full py-2 text-left text-xs leading-relaxed ${
                            a.id === activeAnnotation
                              ? 'font-semibold text-teal-900'
                              : 'text-slate-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none rounded-sm px-1 ${highlightClass(a.highlightColor)}`}
                          >
                            {snippet.length > 60
                              ? `${snippet.slice(0, 60)}…`
                              : snippet || 'highlight'}
                          </span>
                          {a.comment && (
                            <span className="mt-1 block">{a.comment}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </aside>
      </div>
    </EditorModalShell>
  );
};
