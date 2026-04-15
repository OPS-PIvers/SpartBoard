/**
 * QuizEditorModal — full-screen modal editor for quiz questions.
 * Launched from the QuizManager library view. Wraps the shared
 * EditorModalShell so it stays visually aligned with other content
 * editors (Video Activity, Guided Learning, MiniApp).
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { QuizData, QuizQuestion, QuizQuestionType } from '@/types';
import { EditorModalShell } from '@/components/common/EditorModalShell';

interface QuizEditorModalProps {
  isOpen: boolean;
  quiz: QuizData | null;
  onClose: () => void;
  onSave: (updatedQuiz: QuizData) => Promise<void>;
}

const QUESTION_TYPES: {
  value: QuizQuestionType;
  label: string;
  hint: string;
}[] = [
  {
    value: 'MC',
    label: 'Multiple Choice',
    hint: 'One correct answer and up to 4 incorrect options.',
  },
  {
    value: 'FIB',
    label: 'Fill in the Blank',
    hint: 'Student types the exact correct word/phrase.',
  },
  {
    value: 'Matching',
    label: 'Matching',
    hint: 'Format: term1:definition1|term2:definition2',
  },
  {
    value: 'Ordering',
    label: 'Ordering',
    hint: 'Format: item1|item2|item3 in the correct sequence.',
  },
];

const blankQuestion = (): QuizQuestion => ({
  id: crypto.randomUUID(),
  timeLimit: 0,
  text: '',
  type: 'MC',
  correctAnswer: '',
  incorrectAnswers: ['', ''],
});

const questionsEqual = (a: QuizQuestion[], b: QuizQuestion[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const qa = a[i];
    const qb = b[i];
    if (
      qa.id !== qb.id ||
      qa.text !== qb.text ||
      qa.type !== qb.type ||
      qa.correctAnswer !== qb.correctAnswer ||
      qa.timeLimit !== qb.timeLimit ||
      (qa.points ?? 1) !== (qb.points ?? 1) ||
      qa.incorrectAnswers.length !== qb.incorrectAnswers.length
    ) {
      return false;
    }
    for (let j = 0; j < qa.incorrectAnswers.length; j++) {
      if (qa.incorrectAnswers[j] !== qb.incorrectAnswers[j]) return false;
    }
  }
  return true;
};

export const QuizEditorModal: React.FC<QuizEditorModalProps> = ({
  isOpen,
  quiz,
  onClose,
  onSave,
}) => {
  // Snapshot the quiz when the modal opens so `isDirty` compares against the
  // original. Reset via `key` prop on the parent when switching quizzes.
  const originalQuestions = useMemo(
    () => (quiz ? quiz.questions.map((q) => ({ ...q })) : []),
    [quiz]
  );
  const originalTitle = quiz?.title ?? '';
  const [title, setTitle] = useState<string>(originalTitle);
  const [questions, setQuestions] = useState<QuizQuestion[]>(originalQuestions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(
    originalQuestions[0]?.id ?? null
  );

  // Reset local state when the `quiz` prop identity changes (new quiz loaded).
  const [prevQuiz, setPrevQuiz] = useState<QuizData | null>(quiz);
  if (quiz !== prevQuiz) {
    setPrevQuiz(quiz);
    setTitle(originalTitle);
    setQuestions(originalQuestions);
    setError(null);
    setSaving(false);
    setExpandedId(originalQuestions[0]?.id ?? null);
  }

  const isDirty = useMemo(
    () =>
      title !== originalTitle || !questionsEqual(questions, originalQuestions),
    [title, originalTitle, questions, originalQuestions]
  );

  const updateQuestion = (id: string, updates: Partial<QuizQuestion>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  };

  const updateIncorrect = (id: string, index: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const incorrect = [...q.incorrectAnswers];
        incorrect[index] = value;
        return { ...q, incorrectAnswers: incorrect };
      })
    );
  };

  const addIncorrect = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id && q.incorrectAnswers.length < 4
          ? { ...q, incorrectAnswers: [...q.incorrectAnswers, ''] }
          : q
      )
    );
  };

  const removeIncorrect = (id: string, index: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const incorrect = q.incorrectAnswers.filter((_, i) => i !== index);
        return { ...q, incorrectAnswers: incorrect };
      })
    );
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newQ = [...questions];
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= newQ.length) return;
    [newQ[index], newQ[swap]] = [newQ[swap], newQ[index]];
    setQuestions(newQ);
  };

  const deleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const addQuestion = () => {
    const q = blankQuestion();
    setQuestions((prev) => [...prev, q]);
    setExpandedId(q.id);
  };

  const handleSave = async () => {
    if (!quiz) return;
    const errors: string[] = [];
    if (!title.trim()) errors.push('Quiz title is required');
    if (questions.length === 0) errors.push('Add at least one question');
    questions.forEach((q, i) => {
      if (!q.text.trim()) errors.push(`Question ${i + 1}: text is required`);
      if (!q.correctAnswer.trim())
        errors.push(`Question ${i + 1}: correct answer is required`);
    });
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...quiz,
        title: title.trim(),
        questions,
        updatedAt: Date.now(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!quiz) return null;

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={title.trim() || (originalTitle ? 'Edit Quiz' : 'New Quiz')}
      subtitle={
        <span>
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}
        </span>
      }
      isDirty={isDirty}
      isSaving={saving}
      onSave={handleSave}
      onClose={onClose}
      saveLabel="Save Quiz"
      bodyClassName="px-6 py-5 bg-slate-50/50"
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block font-bold text-brand-blue-dark mb-1 text-xs">
            Quiz Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Science Unit 4 Review"
            className="w-full px-3 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-bold focus:outline-none focus:border-brand-blue-primary shadow-sm text-sm"
          />
        </div>

        {error && (
          <div className="p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl flex items-center gap-2 text-sm text-brand-red-dark font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {questions.map((q, i) => (
          <div
            key={q.id}
            className={`bg-white border rounded-2xl overflow-hidden transition-all shadow-sm ${
              expandedId === q.id
                ? 'border-brand-blue-primary/30 ring-2 ring-brand-blue-primary/5 shadow-md'
                : 'border-brand-blue-primary/10 hover:border-brand-blue-primary/20'
            }`}
          >
            <div
              className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
              onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
            >
              <GripVertical className="w-4 h-4 text-brand-blue-primary/20 shrink-0" />
              <span className="font-black text-brand-blue-primary/40 w-5 shrink-0 text-xs">
                {i + 1}.
              </span>
              <span className="flex-1 font-bold text-brand-blue-dark truncate text-sm">
                {q.text || (
                  <span className="italic opacity-40">Untitled question</span>
                )}
              </span>

              <span
                className={`font-black rounded-md px-1.5 py-0.5 shrink-0 uppercase tracking-wider text-xxs ${
                  q.type === 'MC'
                    ? 'bg-blue-100 text-blue-700'
                    : q.type === 'FIB'
                      ? 'bg-amber-100 text-amber-700'
                      : q.type === 'Matching'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-teal-100 text-teal-700'
                }`}
              >
                {q.type}
              </span>

              <div className="flex items-center gap-1 ml-1 border-l border-brand-blue-primary/5 pl-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    moveQuestion(i, 'up');
                  }}
                  disabled={i === 0}
                  className="p-1 text-brand-blue-primary hover:bg-brand-blue-lighter rounded transition-colors disabled:opacity-20"
                  aria-label="Move up"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    moveQuestion(i, 'down');
                  }}
                  disabled={i === questions.length - 1}
                  className="p-1 text-brand-blue-primary hover:bg-brand-blue-lighter rounded transition-colors disabled:opacity-20"
                  aria-label="Move down"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteQuestion(q.id);
                  }}
                  className="p-1 text-brand-red-primary hover:bg-brand-red-lighter rounded transition-colors"
                  aria-label="Delete question"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {expandedId === q.id && (
              <div className="px-4 pb-4 space-y-4 border-t border-brand-blue-primary/5 pt-4 bg-brand-blue-lighter/10">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-brand-blue-dark mb-1 text-xs">
                      Question Type
                    </label>
                    <select
                      value={q.type}
                      onChange={(e) =>
                        updateQuestion(q.id, {
                          type: e.target.value as QuizQuestionType,
                          incorrectAnswers:
                            e.target.value === 'MC' ? ['', ''] : [],
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-bold focus:outline-none focus:border-brand-blue-primary shadow-sm text-sm"
                    >
                      {QUESTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-brand-blue-dark mb-1 text-xs">
                      Time Limit (Seconds)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={q.timeLimit}
                        onChange={(e) =>
                          updateQuestion(q.id, {
                            timeLimit: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-full pl-3 pr-8 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-bold focus:outline-none focus:border-brand-blue-primary shadow-sm text-sm"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-light font-bold text-xxs">
                        SEC
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-brand-blue-dark mb-1 text-xs">
                      Points
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={q.points ?? 1}
                        onChange={(e) =>
                          updateQuestion(q.id, {
                            points: Math.min(
                              100,
                              Math.max(1, parseInt(e.target.value, 10) || 1)
                            ),
                          })
                        }
                        className="w-full pl-3 pr-8 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-bold focus:outline-none focus:border-brand-blue-primary shadow-sm text-sm"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-light font-bold text-xxs">
                        PT
                      </span>
                    </div>
                  </div>
                </div>

                {(q.type === 'Matching' || q.type === 'Ordering') && (
                  <div className="flex gap-2 p-2.5 bg-brand-blue-primary text-white rounded-xl shadow-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <p className="font-medium text-xs">
                      {QUESTION_TYPES.find((t) => t.value === q.type)?.hint}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-brand-blue-dark mb-1 text-xs">
                    Question Prompt
                  </label>
                  <textarea
                    value={q.text}
                    onChange={(e) =>
                      updateQuestion(q.id, { text: e.target.value })
                    }
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-medium resize-none focus:outline-none focus:border-brand-blue-primary shadow-sm text-sm"
                    placeholder="e.g. What is the capital of France?"
                  />
                </div>

                <div>
                  <label className="block font-bold text-emerald-700 mb-1 text-xs">
                    Correct Answer
                  </label>
                  <input
                    type="text"
                    value={q.correctAnswer}
                    onChange={(e) =>
                      updateQuestion(q.id, { correctAnswer: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border-2 border-emerald-500/20 rounded-xl text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 shadow-sm text-sm"
                    placeholder={
                      q.type === 'Matching'
                        ? 'term1:def1|term2:def2'
                        : q.type === 'Ordering'
                          ? 'item1|item2|item3'
                          : 'Enter the definitive answer'
                    }
                  />
                </div>

                {q.type === 'MC' && (
                  <div className="space-y-2">
                    <label className="block font-bold text-brand-red-primary mb-1 text-xs">
                      Distractors (Incorrect Options)
                    </label>
                    <div className="grid gap-2">
                      {q.incorrectAnswers.map((ans, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            value={ans}
                            onChange={(e) =>
                              updateIncorrect(q.id, idx, e.target.value)
                            }
                            placeholder={`Distractor ${idx + 1}`}
                            className="flex-1 px-3 py-1.5 bg-white border border-brand-red-primary/10 rounded-xl text-brand-blue-dark font-medium focus:outline-none focus:border-brand-red-primary shadow-sm text-sm"
                          />
                          {q.incorrectAnswers.length > 1 && (
                            <button
                              onClick={() => removeIncorrect(q.id, idx)}
                              className="p-2 text-brand-red-primary hover:bg-brand-red-lighter rounded-xl transition-colors"
                              aria-label={`Remove distractor ${idx + 1}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      {q.incorrectAnswers.length < 4 && (
                        <button
                          onClick={() => addIncorrect(q.id)}
                          className="flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-brand-blue-primary/10 hover:border-brand-blue-primary/30 rounded-xl text-brand-blue-primary font-bold transition-all text-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Choice
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <button
          onClick={addQuestion}
          className="w-full py-4 border-2 border-dashed border-brand-blue-primary/20 hover:border-brand-blue-primary/40 hover:bg-brand-blue-lighter/30 rounded-2xl text-brand-blue-primary font-black flex flex-col items-center justify-center gap-1 transition-all active:scale-95"
        >
          <div className="bg-brand-blue-primary text-white rounded-full p-1 shadow-sm">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-sm">ADD NEW QUESTION</span>
        </button>
      </div>
    </EditorModalShell>
  );
};
