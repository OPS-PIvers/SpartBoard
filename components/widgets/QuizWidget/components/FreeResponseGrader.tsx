/**
 * FreeResponseGrader — one grading queue for every Free Response answer,
 * typed or spoken, walked either question-by-question or student-by-student.
 *
 * Grades save themselves: a complete grade is written the moment it is
 * complete, a partial one is banked when the teacher moves on, and a quick
 * fill on the Next button shows the grader is about to advance. Grades key
 * per slot through `gradingKey`; an unsuffixed key is the typed answer or the
 * primary recording slot, so nothing already in `grading` changes meaning.
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
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
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
import {
  hasSubmittedContent,
  isWrittenAnswerAwaitingGrade,
} from '@/hooks/useQuizSession';
import {
  buildGradeFromDraft,
  clampPoints,
  isGradeComplete,
  parsePoints,
  type Adjudication,
  type GradeDraft,
  type GradeDraftContext,
} from '@/utils/gradeDraft';
import {
  buildTraversal,
  collectStudents,
  findPosition,
  nextUngraded,
  type GraderMode,
  type TraversalQuestion,
  type TraversalTarget,
} from '@/utils/gradeTraversal';
import { useGradeWriteQueue } from '@/hooks/useGradeWriteQueue';
import { AnnotatedResponseView } from './AnnotatedResponseView';
import { AudioAnnotatedResponseView } from './AudioAnnotatedResponseView';
import { RubricScoringPanel } from './RubricScoringPanel';

export const ADVANCE_DELAY_MS = 900;
export const POINTS_IDLE_MS = 1500;
export const REEDIT_DEBOUNCE_MS = 800;
const ALL_GRADED_PILL_MS = 2000;

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

/** Which control last touched the draft; decides when the write happens. */
type EditSource =
  | 'none'
  | 'rubric'
  | 'points'
  | 'comment'
  | 'annotations'
  | 'pin'
  | 'adjudication';

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
  /** Grading order to open in; the header toggle changes it and reports back. */
  graderMode?: GraderMode;
  onGraderModeChange?: (mode: GraderMode) => void;
  /** Whether a finished grade moves the grader on by itself. */
  autoAdvance?: boolean;
  onAutoAdvanceChange?: (enabled: boolean) => void;
  onClose: () => void;
}

const responseKeyOf = (r: QuizResponse) => r._responseKey ?? r.studentUid;

const targetSlot = (target: GradeTarget): ArtifactSlot =>
  target.kind === 'media' ? target.slot.slot : 'primary';

const targetGrade = (target: GradeTarget): WrittenAnswerGrade | undefined =>
  target.kind === 'media' ? target.slot.grade : target.grade;

/** Graded means a grade exists and no rubric criterion is still open. */
const targetIsGraded = (question: QuizQuestion, target: GradeTarget) => {
  const grade = targetGrade(target);
  if (!grade) return false;
  return !isWrittenAnswerAwaitingGrade(question, '', grade);
};

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

const draftFromGrade = (grade: WrittenAnswerGrade | undefined): GradeDraft => ({
  pointsInput: grade ? String(grade.pointsAwarded) : '',
  comment: grade?.overallComment ?? '',
  annotations: grade?.annotations ?? [],
  rubricScores: grade?.rubricScores ?? [],
  pinnedTakeIndex: grade?.gradedTakeIndex ?? null,
  adjudication: adjudicationOf(grade),
});

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
  graderMode = 'question',
  onGraderModeChange,
  autoAdvance = true,
  onAutoAdvanceChange,
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

  const [mode, setMode] = useState<GraderMode>(graderMode);
  const [autoAdvanceOn, setAutoAdvanceOn] = useState(autoAdvance);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [studentIdx, setStudentIdx] = useState(0);
  const [slotName, setSlotName] = useState<ArtifactSlot>('primary');
  const [clearing, setClearing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [advanceArmed, setAdvanceArmed] = useState(false);
  const [allGradedUntil, setAllGradedUntil] = useState(0);

  if (questionIdx >= questions.length && questions.length > 0) {
    setQuestionIdx(0);
  }
  const question = questions[questionIdx];

  const queuesByQuestion = useMemo(
    () => questions.map((q) => buildQueue(q, responses)),
    [questions, responses]
  );
  const queue = queuesByQuestion[questionIdx] ?? [];
  // An unanswered question must not trap the teacher in the modal-level empty state.
  const hasAnyQueue = queuesByQuestion.some((rows) => rows.length > 0);

  const traversalQuestions = useMemo<TraversalQuestion[]>(
    () =>
      queuesByQuestion.map((rows, qi) => ({
        questionId: questions[qi].id,
        rows: rows.map((row) => ({
          studentKey: row.responseKey ?? '',
          slots: row.targets.map((x) => ({
            slot: targetSlot(x),
            isGraded: targetIsGraded(questions[qi], x),
          })),
        })),
      })),
    [queuesByQuestion, questions]
  );
  const traversal = useMemo(
    () => buildTraversal(mode, traversalQuestions),
    [mode, traversalQuestions]
  );
  // Every student with anything to grade, in first-seen order.
  const allStudents = useMemo(() => {
    const byKey = new Map<string, QueueRow>();
    for (const rows of queuesByQuestion) {
      for (const row of rows) {
        const key = row.responseKey ?? '';
        if (!byKey.has(key)) byKey.set(key, row);
      }
    }
    return collectStudents(traversalQuestions)
      .map((key) => byKey.get(key))
      .filter((row): row is QueueRow => !!row)
      .map((row) => ({ response: row.response, responseKey: row.responseKey }));
  }, [queuesByQuestion, traversalQuestions]);

  // The left rail lists this question's students, or every student.
  const students: {
    response: QuizResponse;
    responseKey: string | undefined;
  }[] = mode === 'question' ? queue : allStudents;
  if (studentIdx >= students.length && students.length > 0) setStudentIdx(0);
  const student = students[studentIdx];
  const row: QueueRow | undefined =
    mode === 'question'
      ? queue[studentIdx]
      : queue.find((r) => r.responseKey === student?.responseKey);
  const response = row?.response ?? student?.response;
  const responseKey = row?.responseKey ?? student?.responseKey;
  const targets = row?.targets ?? [];
  const target: GradeTarget | undefined =
    targets.find((x) => x.kind === 'media' && x.slot.slot === slotName) ??
    targets[0];
  const slot = target?.kind === 'media' ? target.slot : undefined;
  const textEntry = target?.kind === 'text' ? target.entry : undefined;
  const savedGrade = target ? targetGrade(target) : undefined;
  const position = findPosition(
    traversal,
    questionIdx,
    responseKey,
    target ? targetSlot(target) : slotName
  );

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
  const editSourceRef = useRef<EditSource>('none');
  // Auto-advance arms once per visit, and never for a grade that arrived complete.
  const wasCompleteOnEnterRef = useRef(false);
  const completeSeenRef = useRef(false);
  const lastWrittenRef = useRef(new Map<string, string>());

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

  const draftCtx: GradeDraftContext | null = target
    ? {
        kind: target.kind,
        captureUnavailable: isUnavailable,
        maxPoints,
        rubricCriteriaCount,
        teacherUid,
        answerText: textEntry?.answer ?? '',
        existingSnapshot: savedGrade?.gradingSnapshot,
        gradedTakeIndex: activeTake?.takeIndex,
      }
    : null;

  const targetKey = `${responseKey ?? ''}::${target?.key ?? ''}`;
  if (targetKey !== hydrationKey) {
    setHydrationKey(targetKey);
    const hydrated = draftFromGrade(savedGrade);
    setPointsInput(hydrated.pointsInput);
    setComment(hydrated.comment);
    setDraftAnnotations(hydrated.annotations);
    setDraftRubricScores(hydrated.rubricScores);
    setActiveAnnotationId(null);
    setPinnedTakeIndex(hydrated.pinnedTakeIndex);
    setAdjudication(hydrated.adjudication);
    setSaveError(null);
    setAdvanceArmed(false);
    editSourceRef.current = 'none';
    completeSeenRef.current = false;
    wasCompleteOnEnterRef.current = draftCtx
      ? isGradeComplete(hydrated, draftCtx)
      : false;
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
      editSourceRef.current = 'rubric';
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
  const handleAnnotationsChange = useCallback(
    (next: WrittenAnswerAnnotation[]) => {
      editSourceRef.current = 'annotations';
      setDraftAnnotations(next);
    },
    []
  );

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

  const draft: GradeDraft = {
    pointsInput,
    comment,
    annotations: draftAnnotations,
    rubricScores: draftRubricScores,
    pinnedTakeIndex,
    adjudication,
  };
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
  const complete = draftCtx ? isGradeComplete(draft, draftCtx) : false;
  const pointsOutOfRange =
    pointsInput.trim() !== '' && parsePoints(pointsInput, maxPoints) === null;
  const substituteNoteMissing =
    isUnavailable && adjudication === 'substitute' && !comment.trim();

  // Latest-value mirrors so flushes triggered by navigation see the current draft.
  const writeInfoRef = useRef({
    draft,
    ctx: draftCtx,
    targetKey,
    responseKey,
    key: target?.key,
    studentLabel,
    isDirty,
  });
  writeInfoRef.current = {
    draft,
    ctx: draftCtx,
    targetKey,
    responseKey,
    key: target?.key,
    studentLabel,
    isDirty,
  };

  const writeQueue = useGradeWriteQueue(onSaveGrade);
  const { enqueue, flushAll, failed: failedWrites } = writeQueue;

  const commitDraft = useCallback(
    (silent: boolean): boolean => {
      const info = writeInfoRef.current;
      if (!info.ctx || !info.key) return false;
      if (!info.responseKey) {
        if (!silent) setSaveError(tg('errors.noIdentifier'));
        return false;
      }
      const built = buildGradeFromDraft(info.draft, info.ctx);
      if (!built.ok) {
        if (!silent) setSaveError(tg(`errors.${built.error}`));
        return false;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { gradedAt, ...stable } = built.grade;
      const signature = JSON.stringify(stable);
      if (lastWrittenRef.current.get(info.targetKey) === signature)
        return false;
      lastWrittenRef.current.set(info.targetKey, signature);
      setSaveError(null);
      enqueue(info.responseKey, info.key, built.grade, info.studentLabel);
      return true;
    },
    [enqueue, tg]
  );

  const pendingWriteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingWrite = useCallback(() => {
    if (pendingWriteRef.current) {
      clearTimeout(pendingWriteRef.current);
      pendingWriteRef.current = null;
    }
  }, []);

  const arm = useCallback(() => {
    if (!autoAdvanceOn) return;
    setAdvanceArmed(true);
  }, [autoAdvanceOn]);

  // Complete grades save themselves; the source of the edit sets the pace.
  useEffect(() => {
    cancelPendingWrite();
    if (!draftCtx || !isDirty || !complete) return;
    const source = editSourceRef.current;
    if (source === 'none') return;
    const firstCompletion = !completeSeenRef.current;
    completeSeenRef.current = true;
    const mayArm = !wasCompleteOnEnterRef.current;
    const rubricActive = rubricCriteriaCount > 0 && !isUnavailable;

    if (source === 'rubric' && firstCompletion) {
      commitDraft(false);
      if (mayArm) arm();
      return;
    }
    if (
      source === 'adjudication' &&
      (adjudication === 'excuse' || adjudication === 'blank')
    ) {
      commitDraft(false);
      if (mayArm) arm();
      return;
    }
    if (source === 'points' && !rubricActive) {
      pendingWriteRef.current = setTimeout(() => {
        pendingWriteRef.current = null;
        commitDraft(false);
        if (mayArm) arm();
      }, POINTS_IDLE_MS);
      return;
    }
    pendingWriteRef.current = setTimeout(() => {
      pendingWriteRef.current = null;
      commitDraft(false);
    }, REEDIT_DEBOUNCE_MS);
    return cancelPendingWrite;
    // The draft fields are the trigger; everything else is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pointsInput,
    comment,
    draftAnnotations,
    draftRubricScores,
    pinnedTakeIndex,
    adjudication,
  ]);

  // Banks whatever is on the form before the target changes.
  const leaveTarget = useCallback(() => {
    cancelPendingWrite();
    setAdvanceArmed(false);
    if (writeInfoRef.current.isDirty) commitDraft(true);
  }, [cancelPendingWrite, commitDraft]);

  const jumpTo = useCallback(
    (next: TraversalTarget) => {
      leaveTarget();
      setQuestionIdx(next.questionIdx);
      const list =
        mode === 'question' ? queuesByQuestion[next.questionIdx] : allStudents;
      const idx = list.findIndex((s) => s.responseKey === next.studentKey);
      setStudentIdx(Math.max(0, idx));
      setSlotName(next.slot);
    },
    [leaveTarget, mode, queuesByQuestion, allStudents]
  );

  // Moves to the next (or previous) target still owed a grade, wrapping.
  const advance = useCallback(
    (dir: 1 | -1) => {
      const next = nextUngraded(traversal, position, dir);
      if (next === null) {
        leaveTarget();
        setAllGradedUntil(Date.now() + ALL_GRADED_PILL_MS);
        return;
      }
      jumpTo(traversal[next]);
    },
    [traversal, position, leaveTarget, jumpTo]
  );

  useEffect(() => {
    if (!advanceArmed) return;
    const timer = setTimeout(() => advance(1), ADVANCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [advanceArmed, advance]);

  useEffect(() => {
    if (allGradedUntil === 0) return;
    const timer = setTimeout(
      () => setAllGradedUntil(0),
      Math.max(0, allGradedUntil - Date.now())
    );
    return () => clearTimeout(timer);
  }, [allGradedUntil]);

  // Any further touch on the right rail means the teacher is not done here.
  const railRef = useRef<HTMLElement | null>(null);
  const advanceArmedRef = useRef(false);
  advanceArmedRef.current = advanceArmed;
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onTouch = () => {
      if (advanceArmedRef.current) setAdvanceArmed(false);
    };
    rail.addEventListener('pointerdown', onTouch, true);
    rail.addEventListener('keydown', onTouch, true);
    return () => {
      rail.removeEventListener('pointerdown', onTouch, true);
      rail.removeEventListener('keydown', onTouch, true);
    };
  });

  const goPrevStudent = useCallback(() => {
    leaveTarget();
    setStudentIdx((i) => Math.max(0, i - 1));
  }, [leaveTarget]);
  const goNextStudent = useCallback(() => {
    leaveTarget();
    setStudentIdx((i) => Math.min(Math.max(0, students.length - 1), i + 1));
  }, [leaveTarget, students.length]);
  const goPrevQuestion = useCallback(() => {
    leaveTarget();
    setQuestionIdx((i) => Math.max(0, i - 1));
    if (mode === 'question') setStudentIdx(0);
  }, [leaveTarget, mode]);
  const goNextQuestion = useCallback(() => {
    leaveTarget();
    setQuestionIdx((i) => Math.min(Math.max(0, questions.length - 1), i + 1));
    if (mode === 'question') setStudentIdx(0);
  }, [leaveTarget, mode, questions.length]);
  const selectStudent = useCallback(
    (idx: number) => {
      leaveTarget();
      setStudentIdx(idx);
    },
    [leaveTarget]
  );
  const selectSlot = useCallback(
    (next: ArtifactSlot) => {
      leaveTarget();
      setSlotName(next);
    },
    [leaveTarget]
  );

  const changeMode = useCallback(
    (next: GraderMode) => {
      if (next === mode) return;
      leaveTarget();
      // Keep the same student in view across the switch.
      const key = writeInfoRef.current.responseKey;
      const list =
        next === 'question' ? queuesByQuestion[questionIdx] : allStudents;
      const idx = list.findIndex((s) => s.responseKey === key);
      setStudentIdx(Math.max(0, idx));
      setMode(next);
      onGraderModeChange?.(next);
    },
    [
      mode,
      leaveTarget,
      queuesByQuestion,
      questionIdx,
      allStudents,
      onGraderModeChange,
    ]
  );
  const toggleAutoAdvance = useCallback(() => {
    const next = !autoAdvanceOn;
    setAutoAdvanceOn(next);
    if (!next) setAdvanceArmed(false);
    onAutoAdvanceChange?.(next);
  }, [autoAdvanceOn, onAutoAdvanceChange]);

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
        advance(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'j') {
        e.preventDefault();
        advance(1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance]);

  const handlePointsKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      cancelPendingWrite();
      if (!complete) {
        commitDraft(false);
        return;
      }
      completeSeenRef.current = true;
      commitDraft(false);
      arm();
    },
    [cancelPendingWrite, complete, commitDraft, arm]
  );

  const handleUndoExcuse = useCallback(async () => {
    if (!onClearGrade || !target || !responseKey) return;
    setClearing(true);
    setSaveError(null);
    setAdvanceArmed(false);
    try {
      await onClearGrade(responseKey, target.key);
      lastWrittenRef.current.delete(targetKey);
      setHydrationKey('');
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : tg('errors.undoFailed')
      );
    } finally {
      setClearing(false);
    }
  }, [onClearGrade, target, responseKey, targetKey, tg]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const handleClose = useCallback(() => {
    leaveTarget();
    void flushAll().then((failures) => {
      if (failures.length > 0) {
        const names = failures.map((f) => f.studentName).join(', ');
        if (!window.confirm(tg('closeWithFailures', { names }))) return;
      }
      onCloseRef.current();
    });
  }, [leaveTarget, flushAll, tg]);

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
  const showAllGraded = allGradedUntil > 0;

  const subtitle = (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        {tg('questionOf', { index: questionIdx + 1, total: questions.length })}
      </span>
      {student && (
        <>
          <span className="text-slate-300">·</span>
          <span>
            {tg('studentOf', {
              index: studentIdx + 1,
              total: students.length,
            })}
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

  const status = writeQueue.status;
  const statusChip =
    status === 'saving' ? (
      <span
        role="status"
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"
      >
        <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
        {tg('status.saving')}
      </span>
    ) : status === 'saved' ? (
      <span
        role="status"
        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"
      >
        <Check aria-hidden className="h-3.5 w-3.5" />
        {tg('status.saved')}
      </span>
    ) : status === 'error' ? (
      <span role="status">
        <button
          type="button"
          onClick={writeQueue.retryAll}
          title={failedWrites.map((f) => f.studentName).join(', ')}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-red-lighter/50 px-2 py-1 text-xs font-bold text-brand-red-dark transition-colors hover:bg-brand-red-lighter"
        >
          <AlertCircle aria-hidden className="h-3.5 w-3.5" />
          {tg('status.failed')}
          <span aria-hidden className="text-brand-red-primary/60">
            ·
          </span>
          {tg('status.retry')}
        </button>
      </span>
    ) : null;

  const headerExtras = (
    <>
      {statusChip}
      <div
        role="group"
        aria-label={tg('mode.label')}
        className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs font-bold"
      >
        {(['question', 'student'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => changeMode(m)}
            aria-pressed={mode === m}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              mode === m
                ? 'bg-white text-brand-blue-dark shadow-sm'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            {tg(`mode.${m}`)}
          </button>
        ))}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={autoAdvanceOn}
        onClick={toggleAutoAdvance}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
      >
        <span
          aria-hidden
          className={`relative inline-block h-4 w-7 rounded-full transition-colors ${
            autoAdvanceOn ? 'bg-brand-blue-primary' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
              autoAdvanceOn ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
          />
        </span>
        {tg('autoAdvance')}
      </button>
      <button
        type="button"
        onClick={mode === 'question' ? goPrevQuestion : goPrevStudent}
        disabled={mode === 'question' ? questionIdx === 0 : studentIdx === 0}
        aria-label={tg(mode === 'question' ? 'prevQuestion' : 'prevStudent')}
        title={tg(mode === 'question' ? 'prevQuestion' : 'prevStudent')}
        className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft aria-hidden className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={mode === 'question' ? goNextQuestion : goNextStudent}
        disabled={
          mode === 'question'
            ? questionIdx >= questions.length - 1
            : studentIdx >= students.length - 1
        }
        aria-label={tg(mode === 'question' ? 'nextQuestion' : 'nextStudent')}
        title={tg(mode === 'question' ? 'nextQuestion' : 'nextStudent')}
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
      isDirty={false}
      hideSaveButton
      onSave={() => undefined}
      onClose={handleClose}
      bodyClassName="!p-0 !overflow-hidden"
      saveErrorMessage={false}
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(180px,1fr)_2.4fr_1.2fr]">
        {/* Left rail — the student queue. */}
        <nav
          aria-label={tg('queueLabel')}
          className="overflow-y-auto border-r border-slate-200 bg-slate-50"
        >
          <p className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 backdrop-blur">
            {tg('queueLabel')}
          </p>
          <ul>
            {students.map((entry, idx) => {
              const entryRow =
                mode === 'question'
                  ? queue[idx]
                  : queue.find((r) => r.responseKey === entry.responseKey);
              const entryTarget =
                entryRow?.targets.find(
                  (x) => x.kind === 'media' && x.slot.slot === slotName
                ) ?? entryRow?.targets[0];
              const vocabulary = targetVocabulary(entryTarget);
              return (
                <li key={entry.responseKey ?? idx}>
                  <button
                    type="button"
                    onClick={() => selectStudent(idx)}
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
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
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
              {mode === 'student' && (
                <span
                  role="group"
                  aria-label={tg('questionLabel')}
                  className="ml-auto inline-flex items-center gap-0.5 normal-case tracking-normal"
                >
                  <button
                    type="button"
                    onClick={goPrevQuestion}
                    disabled={questionIdx === 0}
                    aria-label={tg('prevQuestion')}
                    className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft aria-hidden className="h-4 w-4" />
                  </button>
                  <span className="min-w-[4.5rem] text-center text-xs font-bold text-slate-700">
                    {tg('questionStep', {
                      index: questionIdx + 1,
                      total: questions.length,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={goNextQuestion}
                    disabled={questionIdx >= questions.length - 1}
                    aria-label={tg('nextQuestion')}
                    className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronRight aria-hidden className="h-4 w-4" />
                  </button>
                </span>
              )}
            </div>
            <p className="text-sm font-semibold leading-snug text-slate-900">
              {question.text}
            </p>
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
                      onClick={() => selectSlot(x.slot.slot)}
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
                    onChange={handleAnnotationsChange}
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
                        onClick={() => {
                          editSourceRef.current = 'adjudication';
                          setAdjudication(choice);
                        }}
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
                onChange={handleAnnotationsChange}
                authorUid={teacherUid}
                activeId={activeAnnotationId}
                onActiveIdChange={setActiveAnnotationId}
                disabled={false}
              />
            )}
          </div>
        </section>

        {/* Right rail — rubric, score, comment, takes or highlights. */}
        <aside
          ref={railRef}
          className="flex flex-col gap-5 overflow-y-auto border-l border-slate-200 bg-white p-5"
        >
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
                  onChange={(e) => {
                    editSourceRef.current = 'points';
                    setPointsInput(e.target.value);
                  }}
                  onKeyDown={handlePointsKeyDown}
                  aria-invalid={pointsOutOfRange || undefined}
                  className="w-28 rounded-lg border-2 border-emerald-500/30 bg-white px-3 py-2 text-lg font-bold text-emerald-800 focus:border-emerald-500 focus:outline-none aria-[invalid]:border-brand-red-primary/60"
                  placeholder="0"
                />
                <span className="font-mono text-base text-slate-500">
                  / {maxPoints}
                </span>
              </div>
              {pointsOutOfRange && (
                <p className="mt-1.5 text-xs font-bold text-brand-red-dark">
                  {tg('errors.range', { max: maxPoints })}
                </p>
              )}
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
                onChange={(e) => {
                  editSourceRef.current = 'comment';
                  setComment(e.target.value);
                }}
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
                        onClick={() => {
                          editSourceRef.current = 'pin';
                          setPinnedTakeIndex(take.takeIndex);
                        }}
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
                  disabled={clearing}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Undo2 aria-hidden className="h-3.5 w-3.5" />
                  {tg('undoExcuse')}
                </button>
              )}
            </div>
          )}

          <div className="mt-auto flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => advance(-1)}
                aria-label={tg('prev')}
                className="shrink-0 rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => advance(1)}
                aria-label={tg('next')}
                data-advance-armed={advanceArmed || undefined}
                className="relative inline-flex shrink-0 items-center gap-1 overflow-hidden rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
              >
                <span
                  aria-hidden
                  data-testid="advance-fill"
                  className={`absolute inset-0 origin-left bg-brand-blue-primary/20 transition-transform ease-linear [transition-duration:900ms] motion-reduce:transition-none ${
                    advanceArmed ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
                <span className="relative">{tg('next')}</span>
                <ChevronRight aria-hidden className="relative h-4 w-4" />
              </button>
              {advanceArmed && (
                <span role="status" className="sr-only">
                  {tg('advancing')}
                </span>
              )}
              {showAllGraded && (
                <span
                  role="status"
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xxs font-bold uppercase tracking-wider text-emerald-700"
                >
                  <CheckCircle2 aria-hidden className="h-3 w-3" />
                  {tg('allGraded')}
                </span>
              )}
            </div>
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
