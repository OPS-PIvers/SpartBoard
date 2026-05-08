import { useCallback, useMemo, useState } from 'react';
import { QuizData, QuizQuestion, QuizQuestionType } from '@/types';
import {
  GeneratedQuestion,
  buildPromptWithFileContext,
  generateQuiz,
} from '@/utils/ai';

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
  const originalTitle = quiz?.title ?? '';

  const [title, setTitle] = useState<string>(originalTitle);
  const [questions, setQuestions] = useState<QuizQuestion[]>(originalQuestions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    originalQuestions[0]?.id ?? null
  );

  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
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

  const deleteQuestion = useCallback(
    (id: string) => {
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId]
  );

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

  const runAiGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiError(null);
    const fullPrompt = buildPromptWithFileContext(
      aiPrompt,
      aiFileContext,
      aiFileName
    );
    let result: Awaited<ReturnType<typeof generateQuiz>>;
    try {
      result = await generateQuiz(fullPrompt);
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
            incorrectAnswers: q.incorrectAnswers ?? [],
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
  }, [aiPrompt, aiFileContext, aiFileName, title]);

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
