/**
 * FreeResponseGrader — one question-major grading queue for every Free
 * Response answer, typed or spoken.
 *
 * Replaces the student-major WrittenResponseGrader and the spoken-only
 * MediaResponseGrader: the student queue sits on the left, the response in
 * the middle, and score / rubric / comments on the right, whichever format
 * the student answered in. Grades key per slot through `gradingKey`; an
 * unsuffixed key is the typed answer or the primary recording slot, so
 * nothing already in `grading` changes meaning.
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
  Clock,
  Mic,
  Pencil,
  Pin,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import {
  type ArtifactSlot,
  type QuizData,
  type QuizQuestion,
  type QuizResponse,
  type QuizResponseAnswer,
  type StudentOverride,
  type WrittenAnswerAnnotation,
  type WrittenAnswerGrade,
  type WrittenAnswerRubricScore,
  isFreeResponseType,
} from '@/types';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import { sanitizeQuizResponse } from '@/utils/security';
import { countWords } from '@/utils/wordCount';
import { wordCounterLabel, wordLimitStatus } from '@/utils/wordLimit';
import { highlightClass, htmlToPlainText } from '@/utils/writtenAnnotations';
import { sumRubricScorePoints } from '@/utils/rubricPoints';
import { resolveRubricForResponse } from '@/utils/rubricOverrideResolution';
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
import { resolveStimuli } from '@/utils/quizStimuli';
import { CollapsibleStimuli } from '@/components/quiz/QuizStimulusView';
import { hasSubmittedContent } from '@/hooks/useQuizSession';
import { AnnotatedResponseView } from './AnnotatedResponseView';
import { AudioAnnotatedResponseView } from './AudioAnnotatedResponseView';
import { RubricScoringPanel } from './RubricScoringPanel';

type Adjudication = 'none' | 'excuse' | 'blank' | 'substitute';

/** One gradeable thing for one student on the active question. */
type GradeTarget =
  | {
      kind: 'text';
      key: string;
      entry: QuizResponseAnswer;
      grade?: WrittenAnswerGrade;
    }
  | { kind: 'media'; key: string; slot: MediaGradingSlot };

interface QueueRow {
  response: QuizResponse;
  responseKey: string | undefined;
  targets: GradeTarget[];
}

export interface FreeResponseGraderProps {
  quiz: QuizData;
  responses: QuizResponse[];
  displayNameByResponseKey?: Map<string, string>;
  teacherUid: string;
  /** Plays archived takes; when omitted, spoken questions stay out of the queue. */
  resolveTakeUrl?: TakeUrlResolver;
  /** Persists one slot's grade; `key` is already composite. */
  onSaveGrade: (
    responseKey: string,
    key: string,
    grade: WrittenAnswerGrade
  ) => Promise<void>;
  /** Removes one slot's grade entirely; backs the "Undo excuse" control. */
  onClearGrade?: (responseKey: string, key: string) => Promise<void>;
  /** Per-student overrides keyed by namespaced `StudentTargetRef` (M17 §5 C4). */
  overridesBySourcedId?: Record<string, StudentOverride> | null;
  /** `studentUid` -> namespaced `StudentTargetRef` key, from `useAssignmentPseudonyms`. */
  targetRefKeyByStudentUid?: Map<string, string>;
  onClose: () => void;
}

const clampPoints = (points: number, maxPoints: number): number =>
  Math.max(0, Math.min(points, maxPoints));

const responseKeyOf = (r: QuizResponse) => r._responseKey ?? r.studentUid;

/** One vocabulary for a target's state — the header badge and the rail agree. */
const targetVocabulary = (
  target: GradeTarget | undefined
): { key: string; chip: string } => {
  if (target?.kind === 'media' && isSlotExcused(target.slot)) {
    return {
      key: 'quizMediaResponse.grading.state.excused',
      chip: 'bg-slate-200 text-slate-700',
    };
  }
  const state = !target
    ? 'not-attempted'
    : target.kind === 'media'
      ? resolveSlotState(target.slot)
      : target.grade
        ? 'scored'
        : 'awaiting-grade';
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

const annotationListsEqual = (
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
      (x.highlightColor ?? 'yellow') === (y.highlightColor ?? 'yellow') &&
      (x.comment ?? '') === (y.comment ?? '') &&
      x.authorUid === y.authorUid
    );
  });
};

const rubricScoreListsEqual = (
  a: WrittenAnswerRubricScore[],
  b: WrittenAnswerRubricScore[] | undefined
): boolean => {
  const right = b ?? [];
  if (a.length !== right.length) return false;
  const byCriterion = new Map(right.map((x) => [x.criterionId, x]));
  return a.every((x) => {
    const y = byCriterion.get(x.criterionId);
    return (
      !!y &&
      x.levelId === y.levelId &&
      x.points === y.points &&
      (x.note ?? '') === (y.note ?? '')
    );
  });
};

const adjudicationOf = (grade: WrittenAnswerGrade | undefined): Adjudication =>
  !grade
    ? 'none'
    : grade.excused
      ? 'excuse'
      : grade.overallComment?.trim()
        ? 'substitute'
        : 'blank';

/** Every student with something to grade on this question. */
function buildQueue(
  question: QuizQuestion | undefined,
  responses: QuizResponse[]
): QueueRow[] {
  if (!question) return [];
  const rows: QueueRow[] = [];
  for (const response of responses) {
    let targets: GradeTarget[];
    if (question.recording) {
      targets = collectMediaSlots(question, response).map((slot) => ({
        kind: 'media',
        key: slot.key,
        slot,
      }));
    } else {
      const entry = response.answers.find(
        (a) => a.questionId === question.id && !a.unresponded
      );
      const grade = response.grading?.[question.id];
      const answered = !!entry && hasSubmittedContent(entry.answer ?? '');
      targets =
        answered || grade
          ? [
              {
                kind: 'text',
                key: question.id,
                entry: entry ?? {
                  questionId: question.id,
                  answer: '',
                  answeredAt: 0,
                },
                grade,
              },
            ]
          : [];
    }
    if (targets.length > 0) {
      rows.push({ response, responseKey: responseKeyOf(response), targets });
    }
  }
  return rows;
}

export const FreeResponseGrader: React.FC<FreeResponseGraderProps> = ({
  quiz,
  responses,
  displayNameByResponseKey,
  teacherUid,
  resolveTakeUrl,
  onSaveGrade,
  onClearGrade,
  overridesBySourcedId,
  targetRefKeyByStudentUid,
  onClose,
}) => {
  const { t } = useTranslation();
  const tg = useCallback(
    (key: string, params?: Record<string, unknown>) =>
      t(`quizMediaResponse.grading.${key}`, params),
    [t]
  );

  const mediaEnabled = !!resolveTakeUrl;
  const questions = useMemo(
    () =>
      quiz.questions.filter(
        (q) => isFreeResponseType(q.type) && (mediaEnabled || !q.recording)
      ),
    [quiz.questions, mediaEnabled]
  );

  const [questionIdx, setQuestionIdx] = useState(0);
  const [studentIdx, setStudentIdx] = useState(0);
  const [slotName, setSlotName] = useState<ArtifactSlot>('primary');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (questionIdx >= questions.length && questions.length > 0) {
    setQuestionIdx(0);
  }
  const question = questions[questionIdx];

  const queue = useMemo(
    () => buildQueue(question, responses),
    [question, responses]
  );
  if (studentIdx >= queue.length && queue.length > 0) setStudentIdx(0);
  // An unanswered question must not trap the teacher in the modal-level empty state.
  const hasAnyQueue = useMemo(
    () => questions.some((q) => buildQueue(q, responses).length > 0),
    [questions, responses]
  );

  const row = queue[studentIdx];
  const response = row?.response;
  const responseKey = row?.responseKey;
  const targets = row?.targets ?? [];
  const target: GradeTarget | undefined =
    targets.find((x) => x.kind === 'media' && x.slot.slot === slotName) ??
    targets[0];
  const slot = target?.kind === 'media' ? target.slot : undefined;
  const textEntry = target?.kind === 'text' ? target.entry : undefined;
  const savedGrade =
    target?.kind === 'media' ? target.slot.grade : target?.grade;

  const nameFor = useCallback(
    (r: QuizResponse) => {
      const key = responseKeyOf(r);
      const fromMap = key ? displayNameByResponseKey?.get(key) : undefined;
      if (fromMap) return fromMap;
      if (r.pin) return `PIN ${r.pin}`;
      return r.studentUid?.slice(0, 8) ?? tg('student');
    },
    [displayNameByResponseKey, tg]
  );
  const studentLabel = response ? nameFor(response) : '';

  const maxPoints = question?.points ?? 1;

  const resolvedRubric = useMemo(
    () =>
      question
        ? resolveRubricForResponse(
            question,
            response?.studentUid,
            overridesBySourcedId,
            targetRefKeyByStudentUid
          )
        : { rubric: undefined, isOverridden: false, overrideMode: null },
    [
      question,
      response?.studentUid,
      overridesBySourcedId,
      targetRefKeyByStudentUid,
    ]
  );
  const effectiveRubric = resolvedRubric.rubric;
  const rubricCriteriaCount = effectiveRubric?.criteria.length ?? 0;

  const [pointsInput, setPointsInput] = useState('');
  const [comment, setComment] = useState('');
  const [draftAnnotations, setDraftAnnotations] = useState<
    WrittenAnswerAnnotation[]
  >([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(
    null
  );
  const [draftRubricScores, setDraftRubricScores] = useState<
    WrittenAnswerRubricScore[]
  >([]);
  const [pinnedTakeIndex, setPinnedTakeIndex] = useState<number | null>(null);
  const [adjudication, setAdjudication] = useState<Adjudication>('none');
  const [hydrationKey, setHydrationKey] = useState('');
  // The last rubric total we auto-filled, so a manual override is recognizable.
  const lastAutoFilledPointsRef = useRef('');
  const pointsInputRef = useRef('');
  pointsInputRef.current = pointsInput;

  const targetKey = `${responseKey ?? ''}::${target?.key ?? ''}`;
  if (targetKey !== hydrationKey) {
    setHydrationKey(targetKey);
    setPointsInput(savedGrade ? String(savedGrade.pointsAwarded) : '');
    setComment(savedGrade?.overallComment ?? '');
    setDraftAnnotations(savedGrade?.annotations ?? []);
    setDraftRubricScores(savedGrade?.rubricScores ?? []);
    setActiveAnnotationId(null);
    setPinnedTakeIndex(savedGrade?.gradedTakeIndex ?? null);
    setAdjudication(adjudicationOf(savedGrade));
    setSaveError(null);
    lastAutoFilledPointsRef.current =
      rubricCriteriaCount > 0 &&
      savedGrade?.rubricScores?.length === rubricCriteriaCount
        ? String(
            clampPoints(
              sumRubricScorePoints(savedGrade.rubricScores),
              maxPoints
            )
          )
        : '';
  }

  const handleRubricScoresChange = useCallback(
    (scores: WrittenAnswerRubricScore[], derivedPoints: number) => {
      setDraftRubricScores(scores);
      if (rubricCriteriaCount === 0 || scores.length !== rubricCriteriaCount)
        return;
      const next = String(clampPoints(derivedPoints, maxPoints));
      const lastAutoFilled = lastAutoFilledPointsRef.current;
      if (next === lastAutoFilled) return;
      const current = pointsInputRef.current;
      if (current !== '' && current !== lastAutoFilled) return;
      lastAutoFilledPointsRef.current = next;
      setPointsInput(next);
    },
    [rubricCriteriaCount, maxPoints]
  );

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
    const resolver = resolverRef.current;
    if (!driveFileId || !resolver) {
      setTakeUrl(null);
      setTakeError(null);
      setLoadingTake(false);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    setLoadingTake(true);
    setTakeError(null);
    resolver(driveFileId)
      .then((url) => {
        created = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setTakeUrl(url);
      })
      .catch(() => {
        if (!cancelled) setTakeError(tg('player.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingTake(false);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      setTakeUrl(null);
    };
  }, [driveFileId, reloadNonce, tg]);

  const savedPointsStr = savedGrade ? String(savedGrade.pointsAwarded) : '';
  const savedComment = savedGrade?.overallComment ?? '';
  const isDirty = isUnavailable
    ? adjudication !== adjudicationOf(savedGrade) ||
      comment !== savedComment ||
      pointsInput !== savedPointsStr
    : pointsInput !== savedPointsStr ||
      comment !== savedComment ||
      (pinnedTakeIndex ?? null) !== (savedGrade?.gradedTakeIndex ?? null) ||
      !annotationListsEqual(draftAnnotations, savedGrade?.annotations) ||
      !rubricScoreListsEqual(draftRubricScores, savedGrade?.rubricScores);

  const substituteNoteMissing =
    isUnavailable && adjudication === 'substitute' && !comment.trim();
  const saveDisabled =
    saving ||
    !target ||
    (isUnavailable && adjudication === 'none') ||
    substituteNoteMissing;

  // Navigation re-hydrates the form, so unsaved edits need the same guard as close.
  const go = useCallback(
    (fn: () => void) => {
      if (saving) return;
      if (isDirty && !window.confirm(tg('discardMessage'))) return;
      fn();
    },
    [saving, isDirty, tg]
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
          Math.min(Math.max(0, questions.length - 1), i + 1)
        );
        setStudentIdx(0);
      }),
    [go, questions.length]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.isContentEditable
      )
        return;
      if (e.key === 'ArrowLeft' || e.key === 'k') {
        e.preventDefault();
        goPrevStudent();
      } else if (e.key === 'ArrowRight' || e.key === 'j') {
        e.preventDefault();
        goNextStudent();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrevStudent, goNextStudent]);

  const handleSave = useCallback(async () => {
    if (!response || !question || !target) return;
    if (!responseKey) {
      setSaveError(tg('errors.noIdentifier'));
      return;
    }
    let grade: WrittenAnswerGrade;
    if (target.kind === 'media' && isUnavailable) {
      if (adjudication === 'none') {
        setSaveError(tg('errors.chooseOutcome'));
        return;
      }
      if (adjudication === 'substitute' && !comment.trim()) {
        setSaveError(tg('errors.noteRequired'));
        return;
      }
      const parsed =
        adjudication === 'substitute' ? Number(pointsInput.trim() || '0') : 0;
      if (!Number.isFinite(parsed)) {
        setSaveError(tg('errors.numericScore'));
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
      // A partial rubric banks its running sum, no typed total needed.
      const isPartialRubric =
        rubricCriteriaCount > 0 &&
        draftRubricScores.length > 0 &&
        draftRubricScores.length < rubricCriteriaCount;
      let parsed: number;
      if (trimmed === '') {
        if (!isPartialRubric) {
          setSaveError(tg('errors.numericScore'));
          return;
        }
        parsed = clampPoints(
          sumRubricScorePoints(draftRubricScores),
          maxPoints
        );
      } else {
        parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) {
          setSaveError(tg('errors.numericScore'));
          return;
        }
        if (parsed < 0 || parsed > maxPoints) {
          setSaveError(tg('errors.range', { max: maxPoints }));
          return;
        }
      }
      const rubricScores =
        draftRubricScores.length > 0 ? draftRubricScores : undefined;
      if (target.kind === 'media') {
        const cleaned = draftAnnotations.filter((a) =>
          (a.comment ?? '').trim()
        );
        grade = {
          pointsAwarded: parsed,
          overallComment: comment.trim() || undefined,
          annotations: cleaned.length > 0 ? cleaned : undefined,
          // Timeline comments are milliseconds, not character offsets.
          ...(cleaned.length > 0 ? { annotationUnit: 'ms' as const } : {}),
          rubricScores,
          gradedTakeIndex: activeTake?.takeIndex,
          gradedBy: teacherUid,
          gradedAt: Date.now(),
        };
      } else {
        // The snapshot freezes on the first annotated save so offsets stay anchored.
        const hasAnnotations = draftAnnotations.length > 0;
        const existingSnapshot = savedGrade?.gradingSnapshot;
        const answerText = target.entry.answer ?? '';
        if (hasAnnotations && !existingSnapshot && !answerText.trim()) {
          setSaveError(tg('errors.emptyAnnotations'));
          return;
        }
        grade = {
          pointsAwarded: parsed,
          overallComment: comment.trim() || undefined,
          annotations: hasAnnotations ? draftAnnotations : undefined,
          gradingSnapshot: hasAnnotations
            ? (existingSnapshot ?? sanitizeQuizResponse(answerText))
            : existingSnapshot,
          rubricScores,
          gradedBy: teacherUid,
          gradedAt: Date.now(),
        };
      }
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveGrade(responseKey, target.key, grade);
      if (studentIdx < queue.length - 1) setStudentIdx(studentIdx + 1);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : tg('errors.saveFailed')
      );
    } finally {
      setSaving(false);
    }
  }, [
    response,
    question,
    target,
    responseKey,
    isUnavailable,
    adjudication,
    comment,
    pointsInput,
    maxPoints,
    rubricCriteriaCount,
    draftRubricScores,
    draftAnnotations,
    activeTake,
    savedGrade,
    teacherUid,
    onSaveGrade,
    studentIdx,
    queue.length,
    tg,
  ]);

  const handleUndoExcuse = useCallback(async () => {
    if (!onClearGrade || !target || !responseKey) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onClearGrade(responseKey, target.key);
      setHydrationKey('');
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : tg('errors.undoFailed')
      );
    } finally {
      setSaving(false);
    }
  }, [onClearGrade, target, responseKey, tg]);

  if (questions.length === 0 || !hasAnyQueue || !question) {
    const noQuestions = questions.length === 0;
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tg('title')}
        className="fixed inset-0 z-overlay flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
      >
        <div
          aria-hidden
          className="absolute inset-0 cursor-default"
          onClick={onClose}
        />
        <div className="relative w-full max-w-lg rounded-2xl bg-white p-10 text-center text-slate-600 shadow-2xl">
          <Pencil aria-hidden className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="text-lg font-bold">
            {tg(noQuestions ? 'emptyQuestions.title' : 'empty.title')}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {tg(noQuestions ? 'emptyQuestions.body' : 'empty.body')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100"
          >
            {tg('close')}
          </button>
        </div>
      </div>
    );
  }

  const isMedia = target?.kind === 'media';
  const slotExcused = !!slot && isSlotExcused(slot);
  const headerVocabulary = targetVocabulary(target);
  const unplayable =
    isMedia && !isUnavailable ? takeUnplayableReason(activeTake) : null;
  const studentAnswer = textEntry?.answer ?? '';
  const answerWordCount = countWords(studentAnswer);
  const outsideWordRange =
    !isMedia && wordLimitStatus(answerWordCount, question).tone !== 'ok';
  const tabSwitches = response?.tabSwitchWarnings ?? 0;
  const snapshotForList =
    savedGrade?.gradingSnapshot ??
    (studentAnswer ? sanitizeQuizResponse(studentAnswer) : '');
  const showPoints = !isUnavailable || adjudication === 'substitute';
  const mediaTargets = targets.filter((x) => x.kind === 'media');

  const subtitle = (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        {tg('questionOf', { index: questionIdx + 1, total: questions.length })}
      </span>
      {target && (
        <>
          <span className="text-slate-300">·</span>
          <span>
            {tg('studentOf', { index: studentIdx + 1, total: queue.length })}
          </span>
          <span className="font-semibold text-slate-700">{studentLabel}</span>
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xxs uppercase tracking-wider ${headerVocabulary.chip}`}
          >
            {headerVocabulary.key.endsWith('.scored') && !slotExcused && (
              <CheckCircle2 aria-hidden className="h-3 w-3" />
            )}
            {t(headerVocabulary.key)}
          </span>
        </>
      )}
      {tabSwitches > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xxs uppercase tracking-wider text-amber-700"
          title={tg('tabSwitchesTitle', { count: tabSwitches })}
        >
          <ShieldAlert aria-hidden className="h-3 w-3" />
          {tg('tabSwitches', { count: tabSwitches })}
        </span>
      )}
    </span>
  );

  const headerExtras = (
    <>
      <button
        type="button"
        onClick={goPrevQuestion}
        disabled={questionIdx === 0 || saving}
        aria-label={tg('prevQuestion')}
        title={tg('prevQuestion')}
        className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft aria-hidden className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={goNextQuestion}
        disabled={questionIdx >= questions.length - 1 || saving}
        aria-label={tg('nextQuestion')}
        title={tg('nextQuestion')}
        className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight aria-hidden className="h-5 w-5" />
      </button>
    </>
  );

  return (
    <EditorModalShell
      isOpen
      title={tg('title')}
      subtitle={subtitle}
      headerExtras={headerExtras}
      isDirty={isDirty}
      isSaving={saving}
      saveDisabled={saveDisabled}
      saveLabel={
        studentIdx >= queue.length - 1 ? tg('save') : tg('saveAndNext')
      }
      onSave={handleSave}
      onClose={onClose}
      confirmDiscardTitle={tg('discardTitle')}
      confirmDiscardMessage={tg('discardMessage')}
      bodyClassName="!p-0 !overflow-hidden"
      saveErrorMessage={false}
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(180px,1fr)_2.4fr_1.2fr]">
        {/* Left rail — the student queue for THIS question. */}
        <nav
          aria-label={tg('queueLabel')}
          className="overflow-y-auto border-r border-slate-200 bg-slate-50"
        >
          <p className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 backdrop-blur">
            {tg('queueLabel')}
          </p>
          <ul>
            {queue.map((entry, idx) => {
              const entryTarget =
                entry.targets.find(
                  (x) => x.kind === 'media' && x.slot.slot === slotName
                ) ?? entry.targets[0];
              const vocabulary = targetVocabulary(entryTarget);
              return (
                <li key={entry.responseKey ?? idx}>
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
                      {nameFor(entry.response)}
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

        {/* Center — the response itself. */}
        <section className="overflow-y-auto bg-slate-50">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-6 py-3 backdrop-blur">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {tg('questionLabel')}
              <span className="text-slate-300">·</span>
              {question.recording ? (
                <Mic aria-hidden className="h-3 w-3" />
              ) : (
                <Pencil aria-hidden className="h-3 w-3" />
              )}
              <span>
                {tg(question.recording ? 'format.spoken' : 'format.typed')}
              </span>
            </p>
            <p className="text-sm font-semibold leading-snug text-slate-900">
              {question.text}
            </p>
            <CollapsibleStimuli
              stimuli={resolveStimuli(question.stimulusIds, quiz.stimuli)}
            />
          </div>

          <div className="flex flex-col gap-4 p-6">
            {!target && (
              <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm italic text-slate-500">
                {tg('noAnswersOnQuestion')}
              </div>
            )}

            {mediaTargets.length > 1 && slot && (
              <div
                role="group"
                aria-label={tg('slotLabel')}
                className="flex items-center gap-1 rounded-xl bg-slate-200/70 p-1"
              >
                {mediaTargets.map((x) =>
                  x.kind === 'media' ? (
                    <button
                      key={x.slot.slot}
                      type="button"
                      onClick={() => go(() => setSlotName(x.slot.slot))}
                      aria-pressed={x.slot.slot === slot.slot}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        x.slot.slot === slot.slot
                          ? 'bg-white text-brand-blue-dark shadow-sm'
                          : 'text-slate-600 hover:bg-white/60'
                      }`}
                    >
                      {tg(`slot.${x.slot.slot}`)}
                    </button>
                  ) : null
                )}
              </div>
            )}

            {target && !isMedia && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    {tg('responseLabel')}
                  </h3>
                  <span
                    className={`font-mono text-xs ${outsideWordRange ? 'text-amber-700' : 'text-slate-500'}`}
                  >
                    {wordCounterLabel(answerWordCount, question)}
                  </span>
                  {textEntry?.timedOutUnderMinimum && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xxs uppercase tracking-wider text-amber-700">
                      <Clock aria-hidden className="h-3 w-3" />
                      {tg('timedOutUnderMinimum')}
                    </span>
                  )}
                </div>
                {studentAnswer ? (
                  <AnnotatedResponseView
                    mode="edit"
                    snapshot={snapshotForList}
                    annotations={draftAnnotations}
                    authorUid={teacherUid}
                    onChange={setDraftAnnotations}
                    activeId={activeAnnotationId}
                    onActiveIdChange={setActiveAnnotationId}
                  />
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm italic text-slate-500">
                    {tg('noTextAnswer')}
                  </div>
                )}
              </>
            )}

            {isMedia && isUnavailable && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold text-slate-900">
                  {tg('unavailable.title')}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {tg('unavailable.body')}
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
                          {tg(`unavailable.${choice}`)}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                          {tg(`unavailable.${choice}Help`)}
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
                    {tg('errors.noteRequired')}
                  </p>
                )}
              </div>
            )}

            {isMedia && !isUnavailable && (
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

        {/* Right rail — rubric, score, comment, takes or highlights. */}
        <aside className="flex flex-col gap-5 overflow-y-auto border-l border-slate-200 bg-white p-5">
          {target &&
            showPoints &&
            effectiveRubric &&
            slot?.slot !== 'addendum' && (
              <RubricScoringPanel
                key={targetKey}
                rubric={effectiveRubric}
                maxPoints={maxPoints}
                initialScores={savedGrade?.rubricScores}
                onChange={handleRubricScoresChange}
                overrideNote={
                  resolvedRubric.overrideMode === 'rubric'
                    ? tg('rubricOverrideNote')
                    : undefined
                }
              />
            )}
          {target && showPoints && resolvedRubric.overrideMode === 'points' && (
            <p className="-mb-2 text-xs italic text-slate-500">
              {tg('pointsOverrideNote')}
            </p>
          )}

          {target && showPoints && (
            <div>
              <label
                htmlFor="grade-points"
                className="mb-2 block text-sm font-bold uppercase tracking-wider text-slate-500"
              >
                {tg('points')}
              </label>
              <div className="flex items-baseline gap-2">
                <input
                  id="grade-points"
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

          {target && (
            <div>
              <label
                htmlFor="grade-comment"
                className="mb-2 block text-sm font-bold uppercase tracking-wider text-slate-500"
              >
                {isUnavailable && adjudication === 'substitute'
                  ? tg('substituteNote')
                  : tg('comment')}
              </label>
              <textarea
                id="grade-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={5}
                aria-required={adjudication === 'substitute'}
                placeholder={tg('commentPlaceholder')}
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              />
            </div>
          )}

          {target && !isMedia && (
            <div className="border-t border-slate-200 pt-3">
              <h4 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                {tg('highlights', { count: draftAnnotations.length })}
              </h4>
              <AnnotationsList
                annotations={draftAnnotations}
                snapshot={snapshotForList}
                activeId={activeAnnotationId}
                onSelect={setActiveAnnotationId}
                emptyHint={tg('highlightsEmpty')}
                noCommentHint={tg('highlightNoComment')}
              />
            </div>
          )}

          {isMedia && !isUnavailable && (
            <div className="border-t border-slate-200 pt-3">
              <h4 className="mb-1 text-sm font-bold uppercase tracking-wider text-slate-500">
                {tg('takes.title')}
              </h4>
              <p className="mb-2 text-xs text-slate-500">
                {tg('takes.count', { count: takes.length })}
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
                          {tg('takes.take', { n: take.displayIndex })}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {formatTimecode(take.artifact.durationMs ?? 0)}
                        </span>
                        {reason && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xxs uppercase tracking-wider text-amber-700">
                            {tg(`takes.status.${reason}`)}
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
                {tg('takes.pinNote')}
              </p>
            </div>
          )}

          {savedGrade?.excused && (
            <div className="rounded-lg bg-slate-100 px-3 py-2">
              <p className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <Ban aria-hidden className="h-3.5 w-3.5" />
                {tg('excusedNote')}
              </p>
              {onClearGrade && (
                <button
                  type="button"
                  onClick={handleUndoExcuse}
                  disabled={saving}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Undo2 aria-hidden className="h-3.5 w-3.5" />
                  {tg('undoExcuse')}
                </button>
              )}
            </div>
          )}

          <div className="mt-auto flex items-center gap-1">
            <button
              type="button"
              onClick={goPrevStudent}
              disabled={studentIdx === 0 || saving}
              aria-label={tg('prevStudent')}
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNextStudent}
              disabled={studentIdx >= queue.length - 1 || saving}
              aria-label={tg('nextStudent')}
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
            <p className="text-xs leading-relaxed text-slate-500">
              {tg(isMedia ? 'keyboardHint' : 'keyboardHintText')}
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

/** Scannable list of every highlight on the active typed answer. */
const AnnotationsList: React.FC<{
  annotations: WrittenAnswerAnnotation[];
  snapshot: string;
  activeId: string | null;
  onSelect: (id: string) => void;
  emptyHint: string;
  noCommentHint: string;
}> = ({
  annotations,
  snapshot,
  activeId,
  onSelect,
  emptyHint,
  noCommentHint,
}) => {
  // Offsets index `htmlToPlainText`'s projection, not `textContent`.
  const plaintext = useMemo(() => htmlToPlainText(snapshot), [snapshot]);
  if (annotations.length === 0) {
    return (
      <p className="text-xs italic leading-relaxed text-slate-500">
        {emptyHint}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {annotations.map((a) => {
        const snippet = plaintext.slice(a.from, a.to);
        const truncated =
          snippet.length > 60 ? `${snippet.slice(0, 60)}…` : snippet;
        const isActive = a.id === activeId;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            className={`rounded-lg border p-2 text-left text-xs leading-relaxed transition-colors ${
              isActive
                ? 'border-violet-400 bg-violet-50'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <span
              className={`inline-block rounded px-1.5 ${highlightClass(a.highlightColor)} pointer-events-none`}
            >
              {truncated || 'highlight'}
            </span>
            {a.comment ? (
              <span className="mt-1 block text-slate-700">{a.comment}</span>
            ) : (
              <span className="mt-1 block italic text-slate-400">
                {noCommentHint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default FreeResponseGrader;
