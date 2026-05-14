import { useCallback, useMemo, useState } from 'react';
import { VideoActivityData, VideoActivityQuestion } from '@/types';
import {
  generateVideoActivity,
  type VideoQuestionGenType,
  type VideoTypeCounts,
} from '@/utils/ai';

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
  const parts = value.split(':');
  if (parts.length !== 2) return NaN;
  const m = parseInt(parts[0] ?? '0');
  const s = parseInt(parts[1] ?? '0');
  if (isNaN(m) || isNaN(s) || s >= 60) return NaN;
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
}

export interface VideoActivityEditorController {
  // Form fields
  title: string;
  setTitle: (next: string) => void;
  youtubeUrl: string;
  setYoutubeUrl: (next: string) => void;
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
  reorderQuestions: (next: VideoActivityQuestion[], movedId?: string) => void;
  /** Recently-reordered question id (for a transient inline hint). null when no hint shown. */
  reorderHintFor: string | null;
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
 * mutation. When a timestamp edit causes a position change, the moved
 * question's id is written to `reorderHintFor` so the UI can show a brief
 * "Reordered by timestamp" hint. The hint clears after ~2.5s.
 */
export function useVideoActivityEditorState({
  activity,
}: UseVideoActivityEditorStateProps): VideoActivityEditorController {
  const originalQuestions = useMemo(
    () => (activity ? activity.questions.map((q) => ({ ...q })) : []),
    [activity]
  );
  const originalTitle = activity?.title ?? '';
  const originalYoutubeUrl = activity?.youtubeUrl ?? '';

  const [title, setTitle] = useState<string>(originalTitle);
  const [youtubeUrl, setYoutubeUrl] = useState<string>(originalYoutubeUrl);
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
  const [reorderHintFor, setReorderHintFor] = useState<string | null>(null);

  // AI generation state
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiTypeCounts, setAiTypeCounts] = useState<
    Record<VideoQuestionGenType, number>
  >(DEFAULT_AI_TYPE_COUNTS);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(0);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Reset all draft state when the activity prop identity changes.
  const [prevActivity, setPrevActivity] = useState<VideoActivityData | null>(
    activity
  );
  if (activity !== prevActivity) {
    setPrevActivity(activity);
    setTitle(originalTitle);
    setYoutubeUrl(originalYoutubeUrl);
    setQuestions(originalQuestions);
    setError(null);
    setSaving(false);
    setSelectedId(originalQuestions[0]?.id ?? null);
    const init: Record<string, string> = {};
    originalQuestions.forEach((q) => {
      init[q.id] = secondsToMmSs(q.timestamp);
    });
    setTimestampInputs(init);
    setReorderHintFor(null);
    setShowAiPrompt(false);
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

  const flashReorderHint = useCallback((id: string) => {
    setReorderHintFor(id);
    window.setTimeout(() => {
      setReorderHintFor((prev) => (prev === id ? null : prev));
    }, 2500);
  }, []);

  const updateQuestion = useCallback(
    (id: string, updates: Partial<VideoActivityQuestion>) => {
      setQuestions((prev) => {
        const next = prev.map((q) => (q.id === id ? { ...q, ...updates } : q));
        // If timestamp changed, sort and detect reorder for the hint.
        if (Object.prototype.hasOwnProperty.call(updates, 'timestamp')) {
          const before = prev.findIndex((q) => q.id === id);
          const sorted = sortByTimestamp(next);
          const after = sorted.findIndex((q) => q.id === id);
          if (before !== after) flashReorderHint(id);
          return sorted;
        }
        return next;
      });
    },
    [flashReorderHint]
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

  /**
   * Apply a SortableList reorder by recomputing each question's timestamp
   * to the midpoint of its new neighbors. Falls back to a +1s nudge if
   * neighbors are equal or missing. The list itself stays in the dropped
   * order so the visual position matches what the user moved. After the
   * midpoint pass we run a final monotonic sweep so adjacent items can
   * never collide on the same second (e.g. when neighbours are 5s and 6s,
   * the midpoint floors to 5 and would otherwise duplicate the previous
   * timestamp). When `movedId` is supplied (from SortableList) we flash the
   * hint on that exact row instead of guessing the last item.
   */
  const reorderQuestions = useCallback(
    (next: VideoActivityQuestion[], movedId?: string) => {
      // When the caller (SortableList) hands us the dragged id, use it
      // verbatim — that's the authoritative source. Otherwise (any future
      // caller that bypasses the SortableList API), recover the moved
      // question by largest absolute index delta. Tiebreakers (e.g. a
      // swap-of-two) resolve to the item whose new index moved later in
      // the list, which matches typical drag intent.
      //
      // Compute this BEFORE `setQuestions` so the value is available
      // synchronously for the `flashReorderHint` call below. Mutating it
      // inside the functional updater would be racy: the updater runs
      // when React flushes the state update, but the line that consumes
      // the value (`hintId = resolvedMovedId || …`) executes immediately
      // after `setQuestions` returns. Reading `questions` from the
      // outer-render closure is fine — it's the same `prev` the updater
      // would receive in the no-pending-update case, and any pending
      // update that beats us to the queue is irrelevant for "which item
      // did the user just drop".
      let resolvedMovedId = movedId ?? '';
      if (!resolvedMovedId) {
        let maxDelta = -1;
        for (let i = 0; i < next.length; i++) {
          const oldIndex = questions.findIndex((q) => q.id === next[i].id);
          if (oldIndex < 0) continue;
          const delta = Math.abs(oldIndex - i);
          if (delta > maxDelta) {
            maxDelta = delta;
            resolvedMovedId = next[i].id;
          }
        }
      }
      setQuestions(() => {
        const adjusted: VideoActivityQuestion[] = [];
        for (let i = 0; i < next.length; i++) {
          const q = next[i];
          const prevTs = i === 0 ? 0 : adjusted[i - 1].timestamp;
          const followingTs =
            i === next.length - 1 ? prevTs + 2 : next[i + 1].timestamp;
          // Original timestamp wins when it already fits between neighbors.
          let ts = q.timestamp;
          if (ts <= prevTs || ts >= followingTs) {
            // Compute midpoint, snapped to whole seconds.
            const midpoint = Math.floor((prevTs + followingTs) / 2);
            ts =
              midpoint > prevTs && midpoint < followingTs
                ? midpoint
                : prevTs + 1;
          }
          adjusted.push({ ...q, timestamp: ts });
        }
        // Final monotonicity pass: when neighbors leave no integer room
        // (e.g. prev=5, following=6) the +1 fallback above can equal
        // followingTs, producing a duplicate. Bump any non-strictly-
        // increasing timestamp by 1 — the cascade always resolves because
        // the array's last item has no hard upper bound.
        for (let i = 1; i < adjusted.length; i++) {
          if (adjusted[i].timestamp <= adjusted[i - 1].timestamp) {
            adjusted[i] = {
              ...adjusted[i],
              timestamp: adjusted[i - 1].timestamp + 1,
            };
          }
        }
        // Sync the visible MM:SS inputs.
        setTimestampInputs((tsPrev) => {
          const out = { ...tsPrev };
          adjusted.forEach((q) => {
            out[q.id] = secondsToMmSs(q.timestamp);
          });
          return out;
        });
        return adjusted;
      });
      const hintId = resolvedMovedId || next[next.length - 1]?.id;
      if (hintId) flashReorderHint(hintId);
    },
    [flashReorderHint, questions]
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
    reorderQuestions,
    reorderHintFor,
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
    originalQuestions,
  };
}
