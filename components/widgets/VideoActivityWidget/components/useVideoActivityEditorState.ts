import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type VideoActivityClip,
  type VideoActivityNote,
  QuestionTargetTag,
  VideoActivityData,
  VideoActivityQuestion,
} from '@/types';
import {
  generateVideoActivity,
  type VideoQuestionGenType,
  type VideoTypeCounts,
} from '@/utils/ai';
import { dedupeQuestionsById } from '@/utils/videoActivityGrading';

/** Defaults to a familiar "5 MC" experience for first-time opens of the overlay. */
const DEFAULT_AI_TYPE_COUNTS: Record<VideoQuestionGenType, number> = {
  MC: 5,
  FIB: 0,
  MA: 0,
};

/** Convert total seconds to MM:SS string. */
export function secondsToMmSs(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Convert MM:SS or M:SS string to total seconds. Returns NaN if invalid. */
export function mmSsToSeconds(value: string): number {
  const match = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(value);
  if (!match) return NaN;
  const m = Number(match[1]);
  const s = Number(match[2]);
  if (s >= 60) return NaN;
  return m * 60 + s;
}

const blankQuestion = (): VideoActivityQuestion => ({
  id: crypto.randomUUID(),
  timeLimit: 30,
  text: '',
  type: 'MC',
  correctAnswer: '',
  incorrectAnswers: ['', '', ''],
  timestamp: 0,
  points: 1,
});

interface UseVideoActivityEditorStateProps {
  activity: VideoActivityData | null;
  /** Opens the AI prompt as soon as this activity loads (a YouTube import, D35). */
  startWithAi?: boolean;
}

export interface VideoActivityEditorController {
  // Form fields
  title: string;
  setTitle: (next: string) => void;
  youtubeUrl: string;
  setYoutubeUrl: (next: string) => void;
  clip: VideoActivityClip | undefined;
  setClip: (next: VideoActivityClip | undefined) => void;
  notes: VideoActivityNote[];
  setNotes: (next: VideoActivityNote[]) => void;
  // Questions
  questions: VideoActivityQuestion[];
  totalPoints: number;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedQuestion: VideoActivityQuestion | null;
  selectedIndex: number;
  // Timestamp inputs (raw text per question, decoupled from numeric timestamp)
  timestampInputs: Record<string, string>;
  setTimestampInput: (id: string, raw: string) => void;
  // Per-question handlers
  updateQuestion: (id: string, updates: Partial<VideoActivityQuestion>) => void;
  updateIncorrect: (id: string, index: number, value: string) => void;
  addQuestion: () => void;
  addQuestionAtTime: (seconds: number) => void;
  deleteQuestion: (id: string) => void;
  duplicateQuestion: (id: string) => void;
  applyTargets: (
    ids: readonly string[],
    targets: QuestionTargetTag[],
    mode: 'add' | 'replace'
  ) => void;
  // AI generation
  showAiPrompt: boolean;
  setShowAiPrompt: (next: boolean) => void;
  /** Per-type AI question budget (MC / FIB / MA). Sum drives "total to generate". */
  aiTypeCounts: Record<VideoQuestionGenType, number>;
  setAiTypeCount: (type: VideoQuestionGenType, count: number) => void;
  aiTotalCount: number;
  /** Video duration (seconds) lifted from the YouTube player. 0 until known. */
  videoDurationSeconds: number;
  setVideoDurationSeconds: (seconds: number) => void;
  aiGenerating: boolean;
  aiError: string | null;
  runAiGenerate: () => Promise<void>;
  // Validation / save
  error: string | null;
  setError: (e: string | null) => void;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  // Snapshot for dirty check
  originalTitle: string;
  originalYoutubeUrl: string;
  originalClip: VideoActivityClip | undefined;
  originalNotes: VideoActivityNote[];
  originalQuestions: VideoActivityQuestion[];
}

/**
 * Sort questions by timestamp, ascending. Returns the same reference if
 * already sorted so callers can short-circuit on identity.
 */
function sortByTimestamp(
  questions: VideoActivityQuestion[]
): VideoActivityQuestion[] {
  let inOrder = true;
  for (let i = 1; i < questions.length; i++) {
    if (questions[i].timestamp < questions[i - 1].timestamp) {
      inOrder = false;
      break;
    }
  }
  if (inOrder) return questions;
  return [...questions].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Owns all state for the Video Activity editor. Returned as a controller
 * object the modal hands to the context + detail pane components.
 *
 * Timestamp handling: questions are kept sorted by timestamp on every
 * mutation.
 */
export function useVideoActivityEditorState({
  activity,
  startWithAi = false,
}: UseVideoActivityEditorStateProps): VideoActivityEditorController {
  // Dedupe by id: a Drive-sync/arrayUnion race can write a question twice (same guard as grading/session-creation).
  const originalQuestions = useMemo(
    () =>
      activity
        ? dedupeQuestionsById(activity.questions).map((q) => ({ ...q }))
        : [],
    [activity]
  );
  const originalTitle = activity?.title ?? '';
  const originalYoutubeUrl = activity?.youtubeUrl ?? '';
  const originalClip = activity?.clip;
  const originalNotes = useMemo(() => activity?.notes ?? [], [activity]);

  const [title, setTitle] = useState<string>(originalTitle);
  const [youtubeUrl, setYoutubeUrl] = useState<string>(originalYoutubeUrl);
  const [clip, setClip] = useState<VideoActivityClip | undefined>(originalClip);
  const [notes, setNotes] = useState<VideoActivityNote[]>(originalNotes);
  const [questions, setQuestions] =
    useState<VideoActivityQuestion[]>(originalQuestions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    originalQuestions[0]?.id ?? null
  );
  const [timestampInputs, setTimestampInputs] = useState<
    Record<string, string>
  >(() => {
    const init: Record<string, string> = {};
    originalQuestions.forEach((q) => {
      init[q.id] = secondsToMmSs(q.timestamp);
    });
    return init;
  });

  // AI generation state
  const [showAiPrompt, setShowAiPrompt] = useState(startWithAi);
  const [aiTypeCounts, setAiTypeCounts] = useState<
    Record<VideoQuestionGenType, number>
  >(DEFAULT_AI_TYPE_COUNTS);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(0);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Reset draft state when the editor is pointed at a different activity. Keyed
  // on id, not object identity: a save that came back as a fresh object would
  // otherwise wipe keystrokes mid-edit.
  const [prevActivityId, setPrevActivityId] = useState<string | null>(
    activity?.id ?? null
  );
  if ((activity?.id ?? null) !== prevActivityId) {
    setPrevActivityId(activity?.id ?? null);
    setTitle(originalTitle);
    setYoutubeUrl(originalYoutubeUrl);
    setClip(originalClip);
    setNotes(originalNotes);
    setQuestions(originalQuestions);
    setError(null);
    setSaving(false);
    setSelectedId(originalQuestions[0]?.id ?? null);
    const init: Record<string, string> = {};
    originalQuestions.forEach((q) => {
      init[q.id] = secondsToMmSs(q.timestamp);
    });
    setTimestampInputs(init);
    setShowAiPrompt(startWithAi);
    setAiTypeCounts(DEFAULT_AI_TYPE_COUNTS);
    setVideoDurationSeconds(0);
    setAiGenerating(false);
    setAiError(null);
  }

  const totalPoints = useMemo(
    () => questions.reduce((sum, q) => sum + (q.points ?? 1), 0),
    [questions]
  );

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === selectedId) ?? null,
    [questions, selectedId]
  );

  const selectedIndex = useMemo(
    () => (selectedId ? questions.findIndex((q) => q.id === selectedId) : -1),
    [questions, selectedId]
  );
  // There is no question list, so one question is always open while any exist.
  if (!selectedQuestion && questions.length > 0) {
    setSelectedId(questions[0].id);
  }

  const updateQuestion = useCallback(
    (id: string, updates: Partial<VideoActivityQuestion>) => {
      setQuestions((prev) => {
        const next = prev.map((q) => (q.id === id ? { ...q, ...updates } : q));
        return Object.prototype.hasOwnProperty.call(updates, 'timestamp')
          ? sortByTimestamp(next)
          : next;
      });
    },
    []
  );

  const updateIncorrect = useCallback(
    (id: string, index: number, value: string) => {
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          const incorrect = [...q.incorrectAnswers];
          incorrect[index] = value;
          return { ...q, incorrectAnswers: incorrect };
        })
      );
    },
    []
  );

  const addQuestion = useCallback(() => {
    const q = blankQuestion();
    setQuestions((prev) => [...prev, q]);
    setTimestampInputs((prev) => ({ ...prev, [q.id]: secondsToMmSs(0) }));
    setSelectedId(q.id);
  }, []);

  const addQuestionAtTime = useCallback((seconds: number) => {
    setQuestions((prev) => {
      const used = new Set(prev.map((q) => q.timestamp));
      let target = Math.max(0, Math.floor(seconds));
      while (used.has(target)) target += 1;
      const fresh: VideoActivityQuestion = {
        ...blankQuestion(),
        timestamp: target,
      };
      setTimestampInputs((tsPrev) => ({
        ...tsPrev,
        [fresh.id]: secondsToMmSs(target),
      }));
      setSelectedId(fresh.id);
      return sortByTimestamp([...prev, fresh]);
    });
  }, []);

  const deleteQuestion = useCallback(
    (id: string) => {
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setTimestampInputs((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId]
  );

  const questionsRef = useRef(questions);
  useLayoutEffect(() => {
    questionsRef.current = questions;
  });

  // The copy goes at the next free second after the original.
  const duplicateQuestion = useCallback((id: string) => {
    const source = questionsRef.current.find((q) => q.id === id);
    if (!source) return;
    const used = new Set(questionsRef.current.map((q) => q.timestamp));
    let timestamp = source.timestamp + 1;
    while (used.has(timestamp)) timestamp += 1;
    const copy: VideoActivityQuestion = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      timestamp,
    };
    setQuestions((prev) => sortByTimestamp([...prev, copy]));
    setTimestampInputs((prev) => ({
      ...prev,
      [copy.id]: secondsToMmSs(copy.timestamp),
    }));
    setSelectedId(copy.id);
  }, []);

  const applyTargets = useCallback(
    (
      ids: readonly string[],
      targets: QuestionTargetTag[],
      mode: 'add' | 'replace'
    ) => {
      const idSet = new Set(ids);
      setQuestions((prev) =>
        prev.map((q) => {
          if (!idSet.has(q.id)) return q;
          const merged = mode === 'replace' ? [] : [...(q.targets ?? [])];
          for (const t of targets) {
            if (!merged.some((m) => m.id === t.id)) merged.push({ ...t });
          }
          if (merged.length === 0) {
            const { targets: _cleared, ...rest } = q;
            return rest;
          }
          return { ...q, targets: merged };
        })
      );
    },
    []
  );

  const setTimestampInput = useCallback((id: string, raw: string) => {
    setTimestampInputs((prev) => ({ ...prev, [id]: raw }));
  }, []);

  const aiTotalCount = useMemo(
    () => aiTypeCounts.MC + aiTypeCounts.FIB + aiTypeCounts.MA,
    [aiTypeCounts]
  );

  const setAiTypeCount = useCallback(
    (type: VideoQuestionGenType, count: number) => {
      const clean = Math.max(
        0,
        Math.min(15, Number.isFinite(count) ? Math.floor(count) : 0)
      );
      setAiTypeCounts((prev) => ({ ...prev, [type]: clean }));
    },
    []
  );

  const runAiGenerate = useCallback(async () => {
    if (!youtubeUrl.trim()) {
      setAiError('A YouTube URL is required to generate questions.');
      return;
    }
    if (aiTotalCount <= 0) {
      setAiError('Pick at least one question to generate.');
      return;
    }
    setAiGenerating(true);
    setAiError(null);
    const typeCounts: VideoTypeCounts = {
      MC: aiTypeCounts.MC,
      FIB: aiTypeCounts.FIB,
      MA: aiTypeCounts.MA,
    };
    let result: Awaited<ReturnType<typeof generateVideoActivity>>;
    try {
      result = await generateVideoActivity(
        youtubeUrl.trim(),
        typeCounts,
        videoDurationSeconds > 0 ? videoDurationSeconds : undefined
      );
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Generation failed');
      setAiGenerating(false);
      return;
    }
    try {
      if (!result || !Array.isArray(result.questions)) {
        throw new Error('AI returned an unexpected response shape.');
      }
      if (!title.trim() && result.title) setTitle(result.title);
      const generated: VideoActivityQuestion[] = result.questions.map((q) => {
        const type: VideoQuestionGenType =
          q.type === 'FIB' || q.type === 'MA' || q.type === 'MC'
            ? q.type
            : 'MC';
        const variants =
          type === 'FIB' && Array.isArray(q.acceptableVariants)
            ? q.acceptableVariants.filter(
                (v): v is string => typeof v === 'string' && v.trim().length > 0
              )
            : undefined;
        return {
          id: crypto.randomUUID(),
          timestamp: q.timestamp,
          text: q.text,
          type,
          correctAnswer: q.correctAnswer ?? '',
          incorrectAnswers: type === 'FIB' ? [] : (q.incorrectAnswers ?? []),
          timeLimit: q.timeLimit ?? 30,
          ...(variants && variants.length > 0
            ? { acceptableVariants: variants }
            : {}),
        };
      });
      setQuestions((prev) => sortByTimestamp([...prev, ...generated]));
      setTimestampInputs((prev) => {
        const next = { ...prev };
        generated.forEach((q) => {
          next[q.id] = secondsToMmSs(q.timestamp);
        });
        return next;
      });
      if (generated[0]) setSelectedId(generated[0].id);
      setShowAiPrompt(false);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? `Could not parse AI response: ${err.message}`
          : 'Could not parse AI response.'
      );
    } finally {
      setAiGenerating(false);
    }
  }, [youtubeUrl, aiTypeCounts, aiTotalCount, videoDurationSeconds, title]);

  return {
    title,
    setTitle,
    youtubeUrl,
    setYoutubeUrl,
    clip,
    setClip,
    notes,
    setNotes,
    questions,
    totalPoints,
    selectedId,
    setSelectedId,
    selectedQuestion,
    selectedIndex,
    timestampInputs,
    setTimestampInput,
    updateQuestion,
    updateIncorrect,
    addQuestion,
    addQuestionAtTime,
    deleteQuestion,
    duplicateQuestion,
    applyTargets,
    showAiPrompt,
    setShowAiPrompt,
    aiTypeCounts,
    setAiTypeCount,
    aiTotalCount,
    videoDurationSeconds,
    setVideoDurationSeconds,
    aiGenerating,
    aiError,
    runAiGenerate,
    error,
    setError,
    saving,
    setSaving,
    originalTitle,
    originalYoutubeUrl,
    originalClip,
    originalNotes,
    originalQuestions,
  };
}
