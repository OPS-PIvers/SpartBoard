/**
 * MediaResponseGrader — question-major grading queue for recorded answers.
 *
 * Deliberately NOT the shipped `WrittenResponseGrader`: that one is
 * student-major (one student, all their essays) and stays that way for pure
 * free-response work. A recording criterion is easier to hold across thirty
 * students than across five questions, so this queue loops question-outer,
 * student-inner, and only over questions carrying a `recording` block.
 *
 * Grades are per SLOT, written through `gradingKey` — an unsuffixed key is
 * still the primary slot, so nothing already in `grading` changes meaning.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Mic,
  Pin,
  Undo2,
} from 'lucide-react';
import type {
  ArtifactSlot,
  QuizData,
  QuizResponse,
  WrittenAnswerAnnotation,
  WrittenAnswerGrade,
} from '@/types';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import {
  collectMediaSlots,
  formatTimecode,
  isSlotExcused,
  resolveSlotState,
  selectGradedTake,
  takeUnplayableReason,
  type MediaGradingSlot,
} from '@/utils/mediaGrading';
import type { TakeUrlResolver } from '@/utils/quizMediaPlayback';
import { AudioAnnotatedResponseView } from './AudioAnnotatedResponseView';

type Adjudication = 'none' | 'excuse' | 'blank' | 'substitute';

export interface MediaResponseGraderProps {
  quiz: QuizData;
  responses: QuizResponse[];
  displayNameByResponseKey?: Map<string, string>;
  teacherUid: string;
  /** Resolves an archived take's Drive file id to a playable object URL. */
  resolveTakeUrl: TakeUrlResolver;
  /** Persists one slot's grade; `key` is already composite. */
  onSaveGrade: (
    responseKey: string,
    key: string,
    grade: WrittenAnswerGrade
  ) => Promise<void>;
  /** Removes one slot's grade entirely; backs the "Undo excuse" control. */
  onClearGrade?: (responseKey: string, key: string) => Promise<void>;
  onClose: () => void;
}

const clampPoints = (points: number, maxPoints: number): number =>
  Math.max(0, Math.min(points, maxPoints));

/** One vocabulary for a slot's state — the header badge and the rail agree. */
const slotVocabulary = (
  slot: MediaGradingSlot | undefined
): { key: string; chip: string } => {
  if (slot && isSlotExcused(slot)) {
    return {
      key: 'quizMediaResponse.grading.state.excused',
      chip: 'bg-slate-200 text-slate-700',
    };
  }
  const state = slot ? resolveSlotState(slot) : 'not-attempted';
  return {
    key: `quizMediaResponse.grading.state.${state}`,
    chip:
      state === 'scored'
        ? 'bg-emerald-100 text-emerald-700'
        : state === 'awaiting-grade'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-200 text-slate-600',
  };
};

const annotationsEqual = (
  a: WrittenAnswerAnnotation[],
  b: WrittenAnswerAnnotation[] | undefined
): boolean => {
  const right = b ?? [];
  if (a.length !== right.length) return false;
  const byId = new Map(right.map((x) => [x.id, x]));
  return a.every((x) => {
    const y = byId.get(x.id);
    return (
      !!y &&
      x.from === y.from &&
      x.to === y.to &&
      (x.comment ?? '') === (y.comment ?? '')
    );
  });
};

export const MediaResponseGrader: React.FC<MediaResponseGraderProps> = ({
  quiz,
  responses,
  displayNameByResponseKey,
  teacherUid,
  resolveTakeUrl,
  onSaveGrade,
  onClearGrade,
  onClose,
}) => {
  const { t } = useTranslation();

  const mediaQuestions = useMemo(
    () => quiz.questions.filter((q) => !!q.recording),
    [quiz.questions]
  );

  const [questionIdx, setQuestionIdx] = useState(0);
  const [studentIdx, setStudentIdx] = useState(0);
  const [slotName, setSlotName] = useState<ArtifactSlot>('primary');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (questionIdx >= mediaQuestions.length && mediaQuestions.length > 0) {
    setQuestionIdx(0);
  }
  const question = mediaQuestions[questionIdx];

  // Every response with something to say about this question — a take, a
  // capture-unavailable marker, or an existing grade to revise.
  const queue = useMemo(() => {
    if (!question) return [];
    return responses
      .map((r) => ({ response: r, slots: collectMediaSlots(question, r) }))
      .filter((row) => row.slots.length > 0);
  }, [responses, question]);

  if (studentIdx >= queue.length && queue.length > 0) setStudentIdx(0);

  const row = queue[studentIdx];
  const response = row?.response;
  const responseKey = response?._responseKey ?? response?.studentUid;
  const availableSlots = row?.slots ?? [];
  const slot: MediaGradingSlot | undefined =
    availableSlots.find((s) => s.slot === slotName) ?? availableSlots[0];

  const studentLabel = useMemo(() => {
    if (!response) return '';
    const fromMap = responseKey
      ? displayNameByResponseKey?.get(responseKey)
      : undefined;
    if (fromMap) return fromMap;
    if (response.pin) return `PIN ${response.pin}`;
    return (
      response.studentUid?.slice(0, 8) ?? t('quizMediaResponse.grading.student')
    );
  }, [response, responseKey, displayNameByResponseKey, t]);

  const maxPoints = question?.points ?? 1;
  const savedGrade = slot?.grade;

  const [pointsInput, setPointsInput] = useState('');
  const [comment, setComment] = useState('');
  const [draftAnnotations, setDraftAnnotations] = useState<
    WrittenAnswerAnnotation[]
  >([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(
    null
  );
  const [pinnedTakeIndex, setPinnedTakeIndex] = useState<number | null>(null);
  const [adjudication, setAdjudication] = useState<Adjudication>('none');
  const [hydrationKey, setHydrationKey] = useState('');

  const targetKey = `${responseKey ?? ''}::${slot?.key ?? ''}`;
  if (targetKey !== hydrationKey) {
    setHydrationKey(targetKey);
    setPointsInput(savedGrade ? String(savedGrade.pointsAwarded) : '');
    setComment(savedGrade?.overallComment ?? '');
    setDraftAnnotations(savedGrade?.annotations ?? []);
    setActiveAnnotationId(null);
    setPinnedTakeIndex(savedGrade?.gradedTakeIndex ?? null);
    setSaveError(null);
    setAdjudication(
      !savedGrade
        ? 'none'
        : savedGrade.excused
          ? 'excuse'
          : savedGrade.overallComment?.trim()
            ? 'substitute'
            : 'blank'
    );
  }

  const isUnavailable = !!slot?.captureUnavailable;
  const takes = slot?.takes ?? [];
  const activeTake = useMemo(() => {
    if (!slot) return undefined;
    if (pinnedTakeIndex != null) {
      const hit = slot.takes.find((x) => x.takeIndex === pinnedTakeIndex);
      if (hit) return hit;
    }
    return selectGradedTake(slot);
  }, [slot, pinnedTakeIndex]);

  // Playback: resolve the archived take's bytes from the teacher's own Drive.
  const [takeUrl, setTakeUrl] = useState<string | null>(null);
  const [loadingTake, setLoadingTake] = useState(false);
  const [takeError, setTakeError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const driveFileId = activeTake?.playable
    ? activeTake.archive?.driveFileId
    : undefined;
  const resolverRef = useRef(resolveTakeUrl);
  resolverRef.current = resolveTakeUrl;

  useEffect(() => {
    if (!driveFileId) {
      setTakeUrl(null);
      setTakeError(null);
      setLoadingTake(false);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    setLoadingTake(true);
    setTakeError(null);
    resolverRef
      .current(driveFileId)
      .then((url) => {
        created = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setTakeUrl(url);
      })
      .catch(() => {
        if (!cancelled)
          setTakeError(t('quizMediaResponse.grading.player.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingTake(false);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      setTakeUrl(null);
    };
  }, [driveFileId, reloadNonce, t]);

  const savedPointsStr = savedGrade ? String(savedGrade.pointsAwarded) : '';
  const savedAdjudication: Adjudication = !savedGrade
    ? 'none'
    : savedGrade.excused
      ? 'excuse'
      : savedGrade.overallComment?.trim()
        ? 'substitute'
        : 'blank';
  const isDirty = isUnavailable
    ? adjudication !== savedAdjudication ||
      comment !== (savedGrade?.overallComment ?? '') ||
      pointsInput !== savedPointsStr
    : pointsInput !== savedPointsStr ||
      comment !== (savedGrade?.overallComment ?? '') ||
      (pinnedTakeIndex ?? null) !== (savedGrade?.gradedTakeIndex ?? null) ||
      !annotationsEqual(draftAnnotations, savedGrade?.annotations);

  const substituteNoteMissing =
    isUnavailable && adjudication === 'substitute' && !comment.trim();
  const saveDisabled =
    saving ||
    (isUnavailable && adjudication === 'none') ||
    substituteNoteMissing;

  const go = useCallback(
    (fn: () => void) => {
      if (saving) return;
      fn();
    },
    [saving]
  );
  const goPrevStudent = useCallback(
    () => go(() => setStudentIdx((i) => Math.max(0, i - 1))),
    [go]
  );
  const goNextStudent = useCallback(
    () =>
      go(() =>
        setStudentIdx((i) => Math.min(Math.max(0, queue.length - 1), i + 1))
      ),
    [go, queue.length]
  );
  const goPrevQuestion = useCallback(
    () =>
      go(() => {
        setQuestionIdx((i) => Math.max(0, i - 1));
        setStudentIdx(0);
      }),
    [go]
  );
  const goNextQuestion = useCallback(
    () =>
      go(() => {
        setQuestionIdx((i) =>
          Math.min(Math.max(0, mediaQuestions.length - 1), i + 1)
        );
        setStudentIdx(0);
      }),
    [go, mediaQuestions.length]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      )
        return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrevStudent();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNextStudent();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrevStudent, goNextStudent]);

  const handleSave = useCallback(async () => {
    if (!response || !question || !slot) return;
    if (!responseKey) {
      setSaveError(t('quizMediaResponse.grading.errors.noIdentifier'));
      return;
    }
    let grade: WrittenAnswerGrade;
    if (isUnavailable) {
      if (adjudication === 'none') {
        setSaveError(t('quizMediaResponse.grading.errors.chooseOutcome'));
        return;
      }
      if (adjudication === 'substitute' && !comment.trim()) {
        setSaveError(t('quizMediaResponse.grading.errors.noteRequired'));
        return;
      }
      const parsed =
        adjudication === 'substitute' ? Number(pointsInput.trim() || '0') : 0;
      if (!Number.isFinite(parsed)) {
        setSaveError(t('quizMediaResponse.grading.errors.numericScore'));
        return;
      }
      grade = {
        pointsAwarded: clampPoints(parsed, maxPoints),
        ...(adjudication === 'excuse' ? { excused: true } : {}),
        ...(adjudication === 'substitute'
          ? { overallComment: comment.trim() }
          : {}),
        gradedBy: teacherUid,
        gradedAt: Date.now(),
      };
    } else {
      const trimmed = pointsInput.trim();
      const parsed = Number(trimmed);
      if (trimmed === '' || !Number.isFinite(parsed)) {
        setSaveError(t('quizMediaResponse.grading.errors.numericScore'));
        return;
      }
      if (parsed < 0 || parsed > maxPoints) {
        setSaveError(
          t('quizMediaResponse.grading.errors.range', { max: maxPoints })
        );
        return;
      }
      const cleaned = draftAnnotations.filter((a) => (a.comment ?? '').trim());
      grade = {
        pointsAwarded: parsed,
        overallComment: comment.trim() || undefined,
        annotations: cleaned.length > 0 ? cleaned : undefined,
        // Timeline comments are milliseconds, not character offsets; the text
        // reviewer reads the same field and must know to skip them.
        ...(cleaned.length > 0 ? { annotationUnit: 'ms' as const } : {}),
        gradedTakeIndex: activeTake?.takeIndex,
        gradedBy: teacherUid,
        gradedAt: Date.now(),
      };
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveGrade(responseKey, slot.key, grade);
      if (studentIdx < queue.length - 1) setStudentIdx(studentIdx + 1);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : t('quizMediaResponse.grading.errors.saveFailed')
      );
    } finally {
      setSaving(false);
    }
  }, [
    response,
    question,
    slot,
    responseKey,
    isUnavailable,
    adjudication,
    comment,
    pointsInput,
    maxPoints,
    draftAnnotations,
    activeTake,
    teacherUid,
    onSaveGrade,
    studentIdx,
    queue.length,
    t,
  ]);

  const handleUndoExcuse = useCallback(async () => {
    if (!onClearGrade || !slot || !responseKey) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onClearGrade(responseKey, slot.key);
      setHydrationKey('');
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : t('quizMediaResponse.grading.errors.undoFailed')
      );
    } finally {
      setSaving(false);
    }
  }, [onClearGrade, slot, responseKey, t]);

  if (mediaQuestions.length === 0 || queue.length === 0 || !question || !slot) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('quizMediaResponse.grading.title')}
        className="fixed inset-0 z-overlay flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
      >
        <div
          aria-hidden
          className="absolute inset-0 cursor-default"
          onClick={onClose}
        />
        <div className="relative w-full max-w-lg rounded-2xl bg-white p-10 text-center text-slate-600 shadow-2xl">
          <Mic aria-hidden className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="text-lg font-bold">
            {t('quizMediaResponse.grading.empty.title')}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {t('quizMediaResponse.grading.empty.body')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100"
          >
            {t('quizMediaResponse.grading.close')}
          </button>
        </div>
      </div>
    );
  }

  const slotState = resolveSlotState(slot);
  const slotExcused = isSlotExcused(slot);
  const headerVocabulary = slotVocabulary(slot);
  const unplayable = isUnavailable ? null : takeUnplayableReason(activeTake);

  const subtitle = (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        {t('quizMediaResponse.grading.questionOf', {
          index: questionIdx + 1,
          total: mediaQuestions.length,
        })}
      </span>
      <span className="text-slate-300">·</span>
      <span>
        {t('quizMediaResponse.grading.studentOf', {
          index: studentIdx + 1,
          total: queue.length,
        })}
      </span>
      <span className="font-semibold text-slate-700">{studentLabel}</span>
      <span
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xxs uppercase tracking-wider ${headerVocabulary.chip}`}
      >
        {slotState === 'scored' && !slotExcused && (
          <CheckCircle2 aria-hidden className="h-3 w-3" />
        )}
        {t(headerVocabulary.key)}
      </span>
    </span>
  );

  const headerExtras = (
    <>
      <button
        type="button"
        onClick={goPrevQuestion}
        disabled={questionIdx === 0 || saving}
        aria-label={t('quizMediaResponse.grading.prevQuestion')}
        title={t('quizMediaResponse.grading.prevQuestion')}
        className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft aria-hidden className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={goNextQuestion}
        disabled={questionIdx >= mediaQuestions.length - 1 || saving}
        aria-label={t('quizMediaResponse.grading.nextQuestion')}
        title={t('quizMediaResponse.grading.nextQuestion')}
        className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight aria-hidden className="h-5 w-5" />
      </button>
    </>
  );

  return (
    <EditorModalShell
      isOpen
      title={t('quizMediaResponse.grading.title')}
      subtitle={subtitle}
      headerExtras={headerExtras}
      isDirty={isDirty}
      isSaving={saving}
      saveDisabled={saveDisabled}
      saveLabel={
        studentIdx >= queue.length - 1
          ? t('quizMediaResponse.grading.save')
          : t('quizMediaResponse.grading.saveAndNext')
      }
      onSave={handleSave}
      onClose={onClose}
      confirmDiscardTitle={t('quizMediaResponse.grading.discardTitle')}
      confirmDiscardMessage={t('quizMediaResponse.grading.discardMessage')}
      bodyClassName="!p-0 !overflow-hidden"
      saveErrorMessage={false}
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(180px,1fr)_2.4fr_1.2fr]">
        {/* Left rail — the student queue for THIS question. */}
        <nav
          aria-label={t('quizMediaResponse.grading.queueLabel')}
          className="overflow-y-auto border-r border-slate-200 bg-slate-50"
        >
          <p className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 backdrop-blur">
            {t('quizMediaResponse.grading.queueLabel')}
          </p>
          <ul>
            {queue.map((entry, idx) => {
              const key =
                entry.response._responseKey ?? entry.response.studentUid;
              const entrySlot =
                entry.slots.find((s) => s.slot === slotName) ?? entry.slots[0];
              const vocabulary = slotVocabulary(entrySlot);
              return (
                <li key={key ?? idx}>
                  <button
                    type="button"
                    onClick={() => go(() => setStudentIdx(idx))}
                    aria-current={idx === studentIdx ? 'true' : undefined}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                      idx === studentIdx
                        ? 'bg-white font-bold text-brand-blue-dark'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {(key && displayNameByResponseKey?.get(key)) ??
                        (entry.response.pin
                          ? `PIN ${entry.response.pin}`
                          : (entry.response.studentUid?.slice(0, 8) ??
                            t('quizMediaResponse.grading.student')))}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xxs uppercase tracking-wider ${vocabulary.chip}`}
                    >
                      {t(vocabulary.key)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Center — the take itself. */}
        <section className="overflow-y-auto bg-slate-50">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-6 py-3 backdrop-blur">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {t('quizMediaResponse.grading.questionLabel')}
            </p>
            <p className="text-sm font-semibold leading-snug text-slate-900">
              {question.text}
            </p>
          </div>

          <div className="flex flex-col gap-4 p-6">
            {availableSlots.length > 1 && (
              <div
                role="group"
                aria-label={t('quizMediaResponse.grading.slotLabel')}
                className="flex items-center gap-1 rounded-xl bg-slate-200/70 p-1"
              >
                {availableSlots.map((s) => (
                  <button
                    key={s.slot}
                    type="button"
                    onClick={() => go(() => setSlotName(s.slot))}
                    aria-pressed={s.slot === slot.slot}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      s.slot === slot.slot
                        ? 'bg-white text-brand-blue-dark shadow-sm'
                        : 'text-slate-600 hover:bg-white/60'
                    }`}
                  >
                    {t(`quizMediaResponse.grading.slot.${s.slot}`)}
                  </button>
                ))}
              </div>
            )}

            {isUnavailable ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold text-slate-900">
                  {t('quizMediaResponse.grading.unavailable.title')}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {t('quizMediaResponse.grading.unavailable.body')}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {(['excuse', 'blank', 'substitute'] as const).map(
                    (choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => setAdjudication(choice)}
                        aria-pressed={adjudication === choice}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                          adjudication === choice
                            ? 'border-brand-blue-primary bg-brand-blue-primary/5 ring-1 ring-brand-blue-primary'
                            : 'border-slate-300 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className="block text-sm font-bold text-slate-900">
                          {t(`quizMediaResponse.grading.unavailable.${choice}`)}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                          {t(
                            `quizMediaResponse.grading.unavailable.${choice}Help`
                          )}
                        </span>
                      </button>
                    )
                  )}
                </div>
                {substituteNoteMissing && (
                  <p
                    role="alert"
                    className="mt-3 rounded-lg bg-brand-red-lighter/40 px-3 py-2 text-xs font-bold text-brand-red-dark"
                  >
                    {t('quizMediaResponse.grading.errors.noteRequired')}
                  </p>
                )}
              </div>
            ) : (
              <AudioAnnotatedResponseView
                key={`${targetKey}::${activeTake?.takeIndex ?? 0}`}
                src={takeUrl}
                durationMs={activeTake?.artifact.durationMs ?? 0}
                loading={loadingTake}
                error={takeError}
                unplayableReason={unplayable}
                onRetryLoad={
                  driveFileId ? () => setReloadNonce((n) => n + 1) : undefined
                }
                annotations={draftAnnotations}
                onChange={setDraftAnnotations}
                authorUid={teacherUid}
                activeId={activeAnnotationId}
                onActiveIdChange={setActiveAnnotationId}
                disabled={saving}
              />
            )}
          </div>
        </section>

        {/* Right rail — score, note, takes. */}
        <aside className="flex flex-col gap-5 overflow-y-auto border-l border-slate-200 bg-white p-5">
          {(!isUnavailable || adjudication === 'substitute') && (
            <div>
              <label
                htmlFor="media-grade-points"
                className="mb-2 block text-sm font-bold uppercase tracking-wider text-slate-500"
              >
                {t('quizMediaResponse.grading.points')}
              </label>
              <div className="flex items-baseline gap-2">
                <input
                  id="media-grade-points"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={0}
                  max={maxPoints}
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                  className="w-28 rounded-lg border-2 border-emerald-500/30 bg-white px-3 py-2 text-lg font-bold text-emerald-800 focus:border-emerald-500 focus:outline-none"
                  placeholder="0"
                />
                <span className="font-mono text-base text-slate-500">
                  / {maxPoints}
                </span>
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="media-grade-comment"
              className="mb-2 block text-sm font-bold uppercase tracking-wider text-slate-500"
            >
              {isUnavailable && adjudication === 'substitute'
                ? t('quizMediaResponse.grading.substituteNote')
                : t('quizMediaResponse.grading.comment')}
            </label>
            <textarea
              id="media-grade-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={5}
              aria-required={adjudication === 'substitute'}
              placeholder={t('quizMediaResponse.grading.commentPlaceholder')}
              className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
            />
          </div>

          {!isUnavailable && (
            <div className="border-t border-slate-200 pt-3">
              <h4 className="mb-1 text-sm font-bold uppercase tracking-wider text-slate-500">
                {t('quizMediaResponse.grading.takes.title')}
              </h4>
              <p className="mb-2 text-xs text-slate-500">
                {t('quizMediaResponse.grading.takes.count', {
                  count: takes.length,
                })}
              </p>
              <ul className="flex flex-col gap-1.5">
                {takes.map((take) => {
                  const isActive = take.takeIndex === activeTake?.takeIndex;
                  const reason = takeUnplayableReason(take);
                  return (
                    <li key={take.artifact.id}>
                      <button
                        type="button"
                        onClick={() => setPinnedTakeIndex(take.takeIndex)}
                        aria-pressed={isActive}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                          isActive
                            ? 'border-brand-blue-primary bg-brand-blue-primary/5'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-bold text-slate-800">
                          {t('quizMediaResponse.grading.takes.take', {
                            n: take.displayIndex,
                          })}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {formatTimecode(take.artifact.durationMs ?? 0)}
                        </span>
                        {reason && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xxs uppercase tracking-wider text-amber-700">
                            {t(
                              `quizMediaResponse.grading.takes.status.${reason}`
                            )}
                          </span>
                        )}
                        {isActive && (
                          <Pin
                            aria-hidden
                            className="ml-auto h-3.5 w-3.5 text-brand-blue-primary"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {t('quizMediaResponse.grading.takes.pinNote')}
              </p>
            </div>
          )}

          {savedGrade?.excused && (
            <div className="rounded-lg bg-slate-100 px-3 py-2">
              <p className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <Ban aria-hidden className="h-3.5 w-3.5" />
                {t('quizMediaResponse.grading.excusedNote')}
              </p>
              {onClearGrade && (
                <button
                  type="button"
                  onClick={handleUndoExcuse}
                  disabled={saving}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Undo2 aria-hidden className="h-3.5 w-3.5" />
                  {t('quizMediaResponse.grading.undoExcuse')}
                </button>
              )}
            </div>
          )}

          <div className="mt-auto flex items-center gap-1">
            <button
              type="button"
              onClick={goPrevStudent}
              disabled={studentIdx === 0 || saving}
              aria-label={t('quizMediaResponse.grading.prevStudent')}
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNextStudent}
              disabled={studentIdx >= queue.length - 1 || saving}
              aria-label={t('quizMediaResponse.grading.nextStudent')}
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
            <p className="text-xs leading-relaxed text-slate-500">
              {t('quizMediaResponse.grading.keyboardHint')}
            </p>
          </div>

          {saveError && (
            <div
              role="alert"
              className="rounded-lg border border-brand-red-primary/20 bg-brand-red-lighter/40 p-2.5 text-xs font-bold text-brand-red-dark"
            >
              {saveError}
            </div>
          )}
        </aside>
      </div>
    </EditorModalShell>
  );
};

export default MediaResponseGrader;
