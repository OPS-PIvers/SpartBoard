import { useCallback, useMemo, useRef, useState } from 'react';
import { QuizData, QuizQuestion, QuizQuestionType } from '@/types';
import {
  GeneratedQuestion,
  buildPromptWithFileContext,
  generateQuiz,
  type QuizGenType,
  type QuizTypeCounts,
} from '@/utils/ai';

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
}

export function useQuizEditorState({
  quiz,
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

  const [title, setTitle] = useState<string>(originalTitle);
  const [questions, setQuestions] = useState<QuizQuestion[]>(originalQuestions);
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
    setQuestions(originalQuestions);
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

  const updateQuestion = useCallback(
    (id: string, updates: Partial<QuizQuestion>) => {
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
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
    setSelectedId(q.id);
  }, []);

  // Render-synced mirror of the selection so `deleteQuestion` can stay
  // referentially stable (it's passed into memoized question rows) while
  // still reading the selection at event time.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const deleteQuestion = useCallback((id: string) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      const next = prev.filter((q) => q.id !== id);
      // If the user just deleted the selected question, advance the
      // selection to the next item (or the new last item, if we deleted
      // the tail). This avoids the right-pane going blank and forcing
      // the user to click another question to continue editing.
      if (selectedIdRef.current === id) {
        if (next.length === 0) {
          setSelectedId(null);
        } else {
          const targetIdx = Math.min(idx, next.length - 1);
          setSelectedId(next[targetIdx]?.id ?? null);
        }
      }
      return next;
    });
  }, []);

  const reorderQuestions = useCallback((next: QuizQuestion[]) => {
    setQuestions(next);
  }, []);

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
          return {
            id: crypto.randomUUID(),
            text: q.text,
            timeLimit: q.timeLimit ?? 30,
            type,
            correctAnswer: q.correctAnswer ?? '',
            incorrectAnswers: type === 'MC' ? (q.incorrectAnswers ?? []) : [],
          };
        }
      );
      if (!title.trim() && result.title) setTitle(result.title);
      setQuestions((prev) => [...prev, ...generated]);
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
  }, [aiPrompt, aiFileContext, aiFileName, aiTypeCounts, aiTotalCount, title]);

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
  };
}
