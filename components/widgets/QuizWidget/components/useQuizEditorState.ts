import { useCallback, useMemo, useRef, useState } from 'react';
import {
  QuizBankSlot,
  QuizData,
  QuizOrderEntry,
  QuestionTargetTag,
  QuizQuestion,
  QuizQuestionType,
  QuizStimulus,
} from '@/types';
import {
  GeneratedQuestion,
  buildPromptWithFileContext,
  generateQuiz,
  type QuizGenType,
  type QuizTypeCounts,
} from '@/utils/ai';
import {
  mergeTargets,
  quizOrder,
  randomBankSlots,
} from '@/utils/questionBanks';

/** Rows of `order` minus the given ids, for deletes. */
const dropFromOrder = (
  order: QuizOrderEntry[],
  ids: ReadonlySet<string>
): QuizOrderEntry[] => order.filter((e) => !ids.has(e.id));

/** Id of the row to select after removing `id` from `order` (same index, or the new tail). */
const nextSelectionAfterRemove = (
  order: QuizOrderEntry[],
  id: string
): string | null => {
  const idx = order.findIndex((e) => e.id === id);
  const next = order.filter((e) => e.id !== id);
  if (next.length === 0) return null;
  return next[Math.min(Math.max(idx, 0), next.length - 1)]?.id ?? null;
};

const DEFAULT_AI_TYPE_COUNTS: Record<QuizGenType, number> = {
  MC: 5,
  FIB: 0,
  Matching: 0,
  Ordering: 0,
};

const blankQuestion = (): QuizQuestion => ({
  id: crypto.randomUUID(),
  timeLimit: 0,
  text: '',
  type: 'MC',
  correctAnswer: '',
  incorrectAnswers: ['', ''],
});

interface UseQuizEditorStateProps {
  quiz: QuizData | null;
  /** Bank-level tags stamped onto AI-drafted questions (bank editor only). */
  inheritedTargets?: QuestionTargetTag[];
}

export interface QuizEditorController {
  // Form fields
  title: string;
  setTitle: (next: string) => void;
  // Questions
  questions: QuizQuestion[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedQuestion: QuizQuestion | null;
  selectedIndex: number;
  // Per-question handlers
  updateQuestion: (id: string, updates: Partial<QuizQuestion>) => void;
  updateIncorrect: (id: string, index: number, value: string) => void;
  addIncorrect: (id: string) => void;
  removeIncorrect: (id: string, index: number) => void;
  addQuestion: () => void;
  deleteQuestion: (id: string) => void;
  reorderQuestions: (next: QuizQuestion[]) => void;
  // Bank slots + interleaved row order
  bankSlots: QuizBankSlot[];
  /** Rows of the question list: fixed questions and random bank slots, interleaved. */
  order: QuizOrderEntry[];
  /** `selectedId` may point at a slot row instead of a question. */
  selectedSlot: QuizBankSlot | null;
  addBankSlot: (slot: QuizBankSlot) => void;
  updateBankSlot: (id: string, patch: Partial<QuizBankSlot>) => void;
  removeBankSlot: (id: string) => void;
  /** Reorder all rows (questions and slots) from the sortable list. */
  reorderEntries: (next: QuizOrderEntry[]) => void;
  /** Append copies from the bank picker; stimuli merge by id. */
  insertQuestions: (questions: QuizQuestion[], stimuli: QuizStimulus[]) => void;
  // Multi-select (checkbox mode) for bulk actions
  checkedIds: ReadonlySet<string>;
  /** Toggle one row; with `range` (shift-click) selects from the last toggled row. */
  toggleChecked: (id: string, range?: boolean) => void;
  setAllChecked: (checked: boolean) => void;
  deleteChecked: () => void;
  /** Add tags to (or replace tags on) a set of questions. Dedupes by tag id. */
  applyTargets: (
    ids: readonly string[],
    targets: QuestionTargetTag[],
    mode: 'add' | 'replace'
  ) => void;
  // Read-aloud language (BCP-47); '' = unset
  language: string;
  setLanguage: (next: string) => void;
  // Stimuli
  stimuli: QuizStimulus[];
  addStimulus: (stimulus: QuizStimulus) => void;
  updateStimulus: (id: string, updates: Partial<QuizStimulus>) => void;
  /** Removes the entry AND strips its id from every question. */
  deleteStimulus: (id: string) => void;
  /** Attach/detach one stimulus on one question. */
  toggleStimulusOnQuestion: (stimulusId: string, questionId: string) => void;
  /** Attach the stimulus to every question (or detach from all). */
  setStimulusOnAllQuestions: (stimulusId: string, attached: boolean) => void;
  // AI generation
  showAiPrompt: boolean;
  setShowAiPrompt: (next: boolean) => void;
  aiPrompt: string;
  setAiPrompt: (next: string) => void;
  /** Per-type AI question budget (MC / FIB / Matching / Ordering). */
  aiTypeCounts: Record<QuizGenType, number>;
  setAiTypeCount: (type: QuizGenType, count: number) => void;
  aiTotalCount: number;
  aiGenerating: boolean;
  aiError: string | null;
  aiFileContext: string | null;
  aiFileName: string | null;
  setAiFile: (content: string | null, name: string | null) => void;
  aiFileExtracting: boolean;
  setAiFileExtracting: (next: boolean) => void;
  runAiGenerate: () => Promise<void>;
  // Validation / save
  error: string | null;
  setError: (e: string | null) => void;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  // Snapshot for dirty check
  originalTitle: string;
  originalQuestions: QuizQuestion[];
  originalStimuli: QuizStimulus[];
  originalLanguage: string;
  originalBankSlots: QuizBankSlot[];
  originalOrder: QuizOrderEntry[];
}

export function useQuizEditorState({
  quiz,
  inheritedTargets,
}: UseQuizEditorStateProps): QuizEditorController {
  const originalQuestions = useMemo(
    () => (quiz ? quiz.questions.map((q) => ({ ...q })) : []),
    [quiz]
  );
  // Memoize alongside `originalQuestions` so a parent re-render that hands
  // back an equivalent-but-not-referentially-stable value can't churn the
  // dirty-check `useMemo` in the consumer (`QuizEditorModal`). The only
  // legitimate source of change is a new `quiz` identity.
  const originalTitle = useMemo(() => quiz?.title ?? '', [quiz]);
  const originalStimuli = useMemo(
    () => (quiz?.stimuli ?? []).map((s) => ({ ...s })),
    [quiz]
  );

  const originalLanguage = quiz?.language ?? '';
  const originalBankSlots = useMemo(
    () => (quiz ? randomBankSlots(quiz).map((s) => ({ ...s })) : []),
    [quiz]
  );
  const originalOrder = useMemo(() => (quiz ? quizOrder(quiz) : []), [quiz]);

  const [title, setTitle] = useState<string>(originalTitle);
  const [language, setLanguage] = useState<string>(originalLanguage);
  const [questions, setQuestions] = useState<QuizQuestion[]>(originalQuestions);
  const [stimuli, setStimuli] = useState<QuizStimulus[]>(originalStimuli);
  const [bankSlots, setBankSlots] = useState<QuizBankSlot[]>(originalBankSlots);
  const [order, setOrder] = useState<QuizOrderEntry[]>(originalOrder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    originalQuestions[0]?.id ?? null
  );

  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTypeCounts, setAiTypeCounts] = useState<Record<QuizGenType, number>>(
    DEFAULT_AI_TYPE_COUNTS
  );
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFileContext, setAiFileContext] = useState<string | null>(null);
  const [aiFileName, setAiFileName] = useState<string | null>(null);
  const [aiFileExtracting, setAiFileExtracting] = useState(false);

  // Reset draft state when quiz prop identity changes.
  const [prevQuiz, setPrevQuiz] = useState<QuizData | null>(quiz);
  if (quiz !== prevQuiz) {
    setPrevQuiz(quiz);
    setTitle(originalTitle);
    setLanguage(originalLanguage);
    setQuestions(originalQuestions);
    setStimuli(originalStimuli);
    setBankSlots(originalBankSlots);
    setOrder(originalOrder);
    setError(null);
    setSaving(false);
    setSelectedId(originalQuestions[0]?.id ?? null);
    setShowAiPrompt(false);
    setAiPrompt('');
    setAiTypeCounts(DEFAULT_AI_TYPE_COUNTS);
    setAiGenerating(false);
    setAiError(null);
    setAiFileContext(null);
    setAiFileName(null);
    setAiFileExtracting(false);
  }

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === selectedId) ?? null,
    [questions, selectedId]
  );

  const selectedIndex = useMemo(
    () => (selectedId ? questions.findIndex((q) => q.id === selectedId) : -1),
    [questions, selectedId]
  );

  const selectedSlot = useMemo(
    () => bankSlots.find((s) => s.id === selectedId) ?? null,
    [bankSlots, selectedId]
  );

  // An explicit `undefined` deletes the key rather than persisting it as a
  // present-but-undefined field, so a question with no recording block saves
  // exactly as it does today.
  const updateQuestion = useCallback(
    (id: string, updates: Partial<QuizQuestion>) => {
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          const next = { ...q, ...updates } as Record<string, unknown>;
          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined) delete next[key];
          }
          return next as unknown as QuizQuestion;
        })
      );
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

  const addIncorrect = useCallback((id: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id && q.incorrectAnswers.length < 4
          ? { ...q, incorrectAnswers: [...q.incorrectAnswers, ''] }
          : q
      )
    );
  }, []);

  const removeIncorrect = useCallback((id: string, index: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const incorrect = q.incorrectAnswers.filter((_, i) => i !== index);
        return { ...q, incorrectAnswers: incorrect };
      })
    );
  }, []);

  const addQuestion = useCallback(() => {
    const q = blankQuestion();
    setQuestions((prev) => [...prev, q]);
    setOrder((prev) => [...prev, { kind: 'question', id: q.id }]);
    setSelectedId(q.id);
  }, []);

  // Render-synced mirror of the selection so `deleteQuestion` can stay
  // referentially stable (it's passed into memoized question rows) while
  // still reading the selection at event time.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const lastToggledRef = useRef<string | null>(null);
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const orderRef = useRef(order);
  orderRef.current = order;

  // Shift-range follows the visible row order; slot rows are never checkable.
  const toggleChecked = useCallback((id: string, range?: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      const rows = orderRef.current
        .filter((e) => e.kind === 'question')
        .map((e) => e.id);
      const anchor = lastToggledRef.current;
      if (range && anchor && rows.includes(anchor)) {
        const [from, to] = [rows.indexOf(anchor), rows.indexOf(id)].sort(
          (x, y) => x - y
        );
        for (const qid of rows.slice(from, to + 1)) next.add(qid);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      lastToggledRef.current = id;
      return next;
    });
  }, []);

  const setAllChecked = useCallback((checked: boolean) => {
    setCheckedIds(
      checked ? new Set(questionsRef.current.map((q) => q.id)) : new Set()
    );
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

  const deleteChecked = useCallback(() => {
    setQuestions((prev) => prev.filter((q) => !checkedIds.has(q.id)));
    const nextOrder = dropFromOrder(orderRef.current, checkedIds);
    setOrder(nextOrder);
    if (selectedIdRef.current && checkedIds.has(selectedIdRef.current)) {
      setSelectedId(nextOrder[0]?.id ?? null);
    }
    setCheckedIds(new Set());
  }, [checkedIds]);

  const deleteQuestion = useCallback((id: string) => {
    setCheckedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    // Advance the selection to the neighbouring row so the detail pane never goes blank.
    if (selectedIdRef.current === id) {
      setSelectedId(nextSelectionAfterRemove(orderRef.current, id));
    }
    setOrder((prev) => dropFromOrder(prev, new Set([id])));
  }, []);

  // Questions move among themselves; slot rows keep their positions.
  const reorderQuestions = useCallback((next: QuizQuestion[]) => {
    setQuestions(next);
    setOrder((prev) => {
      let i = 0;
      return prev.map((e) =>
        e.kind === 'question'
          ? { kind: 'question' as const, id: next[i++].id }
          : e
      );
    });
  }, []);

  // `questions` follows the row order so consumers that ignore `order` still see it.
  const reorderEntries = useCallback((next: QuizOrderEntry[]) => {
    setOrder(next);
    setQuestions((prev) => {
      const byId = new Map(prev.map((q) => [q.id, q]));
      const sorted: QuizQuestion[] = [];
      for (const e of next) {
        const q = e.kind === 'question' ? byId.get(e.id) : undefined;
        if (q) sorted.push(q);
      }
      return sorted.length === prev.length ? sorted : prev;
    });
  }, []);

  const insertQuestions = useCallback(
    (inserted: QuizQuestion[], insertedStimuli: QuizStimulus[]) => {
      if (inserted.length === 0) return;
      setQuestions((prev) => [...prev, ...inserted]);
      setOrder((prev) => [
        ...prev,
        ...inserted.map((q) => ({ kind: 'question' as const, id: q.id })),
      ]);
      if (insertedStimuli.length > 0) {
        setStimuli((prev) => {
          const have = new Set(prev.map((s) => s.id));
          const fresh = insertedStimuli.filter((s) => !have.has(s.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
      setSelectedId(inserted[0].id);
    },
    []
  );

  const addBankSlot = useCallback((slot: QuizBankSlot) => {
    setBankSlots((prev) => [...prev, slot]);
    setOrder((prev) => [...prev, { kind: 'slot', id: slot.id }]);
    setSelectedId(slot.id);
  }, []);

  const updateBankSlot = useCallback(
    (id: string, patch: Partial<QuizBankSlot>) => {
      setBankSlots((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const next = { ...s, ...patch } as Record<string, unknown>;
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) delete next[key];
          }
          return next as unknown as QuizBankSlot;
        })
      );
    },
    []
  );

  const removeBankSlot = useCallback((id: string) => {
    setBankSlots((prev) => prev.filter((s) => s.id !== id));
    if (selectedIdRef.current === id) {
      setSelectedId(nextSelectionAfterRemove(orderRef.current, id));
    }
    setOrder((prev) => dropFromOrder(prev, new Set([id])));
  }, []);

  // ─── Stimuli ───────────────────────────────────────────────────────────────

  const addStimulus = useCallback((stimulus: QuizStimulus) => {
    setStimuli((prev) => [...prev, stimulus]);
  }, []);

  const updateStimulus = useCallback(
    (id: string, updates: Partial<QuizStimulus>) => {
      setStimuli((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    []
  );

  const deleteStimulus = useCallback((id: string) => {
    setStimuli((prev) => prev.filter((s) => s.id !== id));
    // Strip dangling pointers in the same gesture so no question ever
    // references a deleted entry.
    setQuestions((qs) =>
      qs.map((q) => {
        if (!q.stimulusIds?.includes(id)) return q;
        const kept = q.stimulusIds.filter((sid) => sid !== id);
        return { ...q, stimulusIds: kept.length > 0 ? kept : undefined };
      })
    );
  }, []);

  const toggleStimulusOnQuestion = useCallback(
    (stimulusId: string, questionId: string) => {
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id !== questionId) return q;
          const current = q.stimulusIds ?? [];
          const attached = current.includes(stimulusId);
          const nextIds = attached
            ? current.filter((sid) => sid !== stimulusId)
            : [...current, stimulusId];
          return {
            ...q,
            stimulusIds: nextIds.length > 0 ? nextIds : undefined,
          };
        })
      );
    },
    []
  );

  const setStimulusOnAllQuestions = useCallback(
    (stimulusId: string, attached: boolean) => {
      setQuestions((prev) =>
        prev.map((q) => {
          const current = q.stimulusIds ?? [];
          const has = current.includes(stimulusId);
          if (attached === has) return q;
          const nextIds = attached
            ? [...current, stimulusId]
            : current.filter((sid) => sid !== stimulusId);
          return {
            ...q,
            stimulusIds: nextIds.length > 0 ? nextIds : undefined,
          };
        })
      );
    },
    []
  );

  const setAiFile = useCallback(
    (content: string | null, name: string | null) => {
      setAiFileContext(content);
      setAiFileName(name);
    },
    []
  );

  const aiTotalCount = useMemo(
    () =>
      aiTypeCounts.MC +
      aiTypeCounts.FIB +
      aiTypeCounts.Matching +
      aiTypeCounts.Ordering,
    [aiTypeCounts]
  );

  const setAiTypeCount = useCallback((type: QuizGenType, count: number) => {
    const clean = Math.max(
      0,
      Math.min(15, Number.isFinite(count) ? Math.floor(count) : 0)
    );
    setAiTypeCounts((prev) => ({ ...prev, [type]: clean }));
  }, []);

  const runAiGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    if (aiTotalCount <= 0) {
      setAiError('Pick at least one question to generate.');
      return;
    }
    setAiGenerating(true);
    setAiError(null);
    const fullPrompt = buildPromptWithFileContext(
      aiPrompt,
      aiFileContext,
      aiFileName
    );
    const typeCounts: QuizTypeCounts = {
      MC: aiTypeCounts.MC,
      FIB: aiTypeCounts.FIB,
      Matching: aiTypeCounts.Matching,
      Ordering: aiTypeCounts.Ordering,
    };
    let result: Awaited<ReturnType<typeof generateQuiz>>;
    try {
      result = await generateQuiz(fullPrompt, typeCounts);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'Failed to generate quiz. Please try again.'
      );
      setAiGenerating(false);
      return;
    }
    try {
      if (!result || !Array.isArray(result.questions)) {
        throw new Error('AI returned an unexpected response shape.');
      }
      const validTypes: QuizQuestionType[] = [
        'MC',
        'FIB',
        'Matching',
        'Ordering',
      ];
      const generated: QuizQuestion[] = result.questions.map(
        (q: GeneratedQuestion) => {
          const type = validTypes.includes((q.type ?? 'MC') as QuizQuestionType)
            ? ((q.type as QuizQuestionType) ?? 'MC')
            : 'MC';
          const targets = mergeTargets(undefined, inheritedTargets);
          return {
            id: crypto.randomUUID(),
            text: q.text,
            timeLimit: q.timeLimit ?? 30,
            type,
            correctAnswer: q.correctAnswer ?? '',
            incorrectAnswers: type === 'MC' ? (q.incorrectAnswers ?? []) : [],
            ...(targets ? { targets } : {}),
          };
        }
      );
      if (!title.trim() && result.title) setTitle(result.title);
      setQuestions((prev) => [...prev, ...generated]);
      setOrder((prev) => [
        ...prev,
        ...generated.map((q) => ({ kind: 'question' as const, id: q.id })),
      ]);
      if (generated[0]) setSelectedId(generated[0].id);
      setShowAiPrompt(false);
      setAiPrompt('');
      setAiFileContext(null);
      setAiFileName(null);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? `Could not parse AI response: ${err.message}`
          : 'Could not parse AI response.'
      );
    } finally {
      setAiGenerating(false);
    }
  }, [
    aiPrompt,
    aiFileContext,
    aiFileName,
    aiTypeCounts,
    aiTotalCount,
    title,
    inheritedTargets,
  ]);

  return {
    title,
    setTitle,
    questions,
    selectedId,
    setSelectedId,
    selectedQuestion,
    selectedIndex,
    updateQuestion,
    updateIncorrect,
    addIncorrect,
    removeIncorrect,
    addQuestion,
    deleteQuestion,
    reorderQuestions,
    bankSlots,
    order,
    selectedSlot,
    addBankSlot,
    updateBankSlot,
    removeBankSlot,
    reorderEntries,
    insertQuestions,
    checkedIds,
    toggleChecked,
    setAllChecked,
    deleteChecked,
    applyTargets,
    language,
    setLanguage,
    stimuli,
    addStimulus,
    updateStimulus,
    deleteStimulus,
    toggleStimulusOnQuestion,
    setStimulusOnAllQuestions,
    showAiPrompt,
    setShowAiPrompt,
    aiPrompt,
    setAiPrompt,
    aiTypeCounts,
    setAiTypeCount,
    aiTotalCount,
    aiGenerating,
    aiError,
    aiFileContext,
    aiFileName,
    setAiFile,
    aiFileExtracting,
    setAiFileExtracting,
    runAiGenerate,
    error,
    setError,
    saving,
    setSaving,
    originalTitle,
    originalQuestions,
    originalStimuli,
    originalLanguage,
    originalBankSlots,
    originalOrder,
  };
}
