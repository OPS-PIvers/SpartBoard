/**
 * QuizEditor — inline editor for quiz questions.
 * Teachers can add, edit, reorder, and delete questions.
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Loader2,
  AlertCircle,
  GripVertical,
  Edit,
} from 'lucide-react';
import { QuizData, QuizQuestion, QuizQuestionType } from '@/types';

interface QuizEditorProps {
  quiz: QuizData;
  onBack: () => void;
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

export const QuizEditor: React.FC<QuizEditorProps> = ({
  quiz,
  onBack,
  onSave,
}) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>(() =>
    quiz.questions.map((q) => ({ ...q }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(
    quiz.questions.length === 0 ? null : (quiz.questions[0]?.id ?? null)
  );

  // Auto-expand newly added questions
  useEffect(() => {
    if (questions.length > quiz.questions.length) {
      setExpandedId(questions[questions.length - 1].id);
    }
  }, [questions, quiz.questions.length]);

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

  const handleSave = async () => {
    const errors: string[] = [];
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
      await onSave({ ...quiz, questions, updatedAt: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-brand-blue-primary/10 bg-brand-blue-lighter/30"
        style={{ padding: 'min(12px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-brand-blue-primary/10 rounded-lg transition-colors text-brand-blue-primary"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Edit className="w-3.5 h-3.5 text-brand-blue-primary" />
            <span
              className="font-bold text-brand-blue-dark truncate"
              style={{ fontSize: 'min(14px, 4.5cqmin)' }}
            >
              {quiz.title}
            </span>
          </div>
          <p
            className="text-brand-blue-primary/60 font-bold"
            style={{ fontSize: 'min(11px, 3.5cqmin)' }}
          >
            {questions.length} Questions
          </p>
        </div>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark disabled:bg-brand-gray-lighter text-white font-black rounded-xl transition-all shadow-md active:scale-95"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(8px, 2cqmin) min(14px, 3.5cqmin)',
            fontSize: 'min(12px, 3.5cqmin)',
          }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          SAVE
        </button>
      </div>

      {error && (
        <div
          className="mx-4 mt-3 p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl flex items-center gap-2 text-brand-red-dark font-bold"
          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Question list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {questions.map((q, i) => (
          <div
            key={q.id}
            className={`bg-white border rounded-2xl overflow-hidden transition-all shadow-sm ${expandedId === q.id ? 'border-brand-blue-primary/30 ring-2 ring-brand-blue-primary/5 shadow-md' : 'border-brand-blue-primary/10 hover:border-brand-blue-primary/20'}`}
          >
            {/* Question header (collapsed) */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
              onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
            >
              <GripVertical className="w-4 h-4 text-brand-blue-primary/20 shrink-0" />
              <span
                className="font-black text-brand-blue-primary/40 w-5 shrink-0"
                style={{ fontSize: 'min(11px, 3.5cqmin)' }}
              >
                {i + 1}.
              </span>
              <span
                className="flex-1 font-bold text-brand-blue-dark truncate"
                style={{ fontSize: 'min(13px, 4cqmin)' }}
              >
                {q.text || (
                  <span className="italic opacity-40">Untitled question</span>
                )}
              </span>

              <span
                className={`font-black rounded-md px-1.5 py-0.5 shrink-0 uppercase tracking-wider ${
                  q.type === 'MC'
                    ? 'bg-blue-100 text-blue-700'
                    : q.type === 'FIB'
                      ? 'bg-amber-100 text-amber-700'
                      : q.type === 'Matching'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-teal-100 text-teal-700'
                }`}
                style={{ fontSize: 'min(9px, 2.5cqmin)' }}
              >
                {q.type}
              </span>

              {/* Action row buttons */}
              <div className="flex items-center gap-1 ml-1 border-l border-brand-blue-primary/5 pl-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    moveQuestion(i, 'up');
                  }}
                  disabled={i === 0}
                  className="p-1 text-brand-blue-primary hover:bg-brand-blue-lighter rounded transition-colors disabled:opacity-20"
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
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteQuestion(q.id);
                  }}
                  className="p-1 text-brand-red-primary hover:bg-brand-red-lighter rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Expanded form */}
            {expandedId === q.id && (
              <div className="px-4 pb-4 space-y-4 border-t border-brand-blue-primary/5 pt-4 bg-brand-blue-lighter/10">
                {/* Type + time limit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="block font-bold text-brand-blue-dark mb-1"
                      style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                    >
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
                      className="w-full px-3 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-bold focus:outline-none focus:border-brand-blue-primary shadow-sm"
                      style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                    >
                      {QUESTION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      className="block font-bold text-brand-blue-dark mb-1"
                      style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                    >
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
                        className="w-full pl-3 pr-8 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-bold focus:outline-none focus:border-brand-blue-primary shadow-sm"
                        style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                      />
                      <span
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-light font-bold"
                        style={{ fontSize: 'min(10px, 3cqmin)' }}
                      >
                        SEC
                      </span>
                    </div>
                  </div>
                </div>

                {/* Hint for special formats */}
                {(q.type === 'Matching' || q.type === 'Ordering') && (
                  <div className="flex gap-2 p-2.5 bg-brand-blue-primary text-white rounded-xl shadow-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <p
                      className="font-medium"
                      style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                    >
                      {QUESTION_TYPES.find((t) => t.value === q.type)?.hint}
                    </p>
                  </div>
                )}

                {/* Question text */}
                <div>
                  <label
                    className="block font-bold text-brand-blue-dark mb-1"
                    style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                  >
                    Question Prompt
                  </label>
                  <textarea
                    value={q.text}
                    onChange={(e) =>
                      updateQuestion(q.id, { text: e.target.value })
                    }
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-medium resize-none focus:outline-none focus:border-brand-blue-primary shadow-sm"
                    style={{ fontSize: 'min(13px, 4cqmin)' }}
                    placeholder="e.g. What is the capital of France?"
                  />
                </div>

                {/* Correct answer */}
                <div>
                  <label
                    className="block font-bold text-emerald-700 mb-1"
                    style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                  >
                    Correct Answer
                  </label>
                  <input
                    type="text"
                    value={q.correctAnswer}
                    onChange={(e) =>
                      updateQuestion(q.id, { correctAnswer: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border-2 border-emerald-500/20 rounded-xl text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 shadow-sm"
                    style={{ fontSize: 'min(13px, 4cqmin)' }}
                    placeholder={
                      q.type === 'Matching'
                        ? 'term1:def1|term2:def2'
                        : q.type === 'Ordering'
                          ? 'item1|item2|item3'
                          : 'Enter the definitive answer'
                    }
                  />
                </div>

                {/* Incorrect answers (MC only) */}
                {q.type === 'MC' && (
                  <div className="space-y-2">
                    <label
                      className="block font-bold text-brand-red-primary mb-1"
                      style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                    >
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
                            className="flex-1 px-3 py-1.5 bg-white border border-brand-red-primary/10 rounded-xl text-brand-blue-dark font-medium focus:outline-none focus:border-brand-red-primary shadow-sm"
                            style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                          />
                          {q.incorrectAnswers.length > 1 && (
                            <button
                              onClick={() => removeIncorrect(q.id, idx)}
                              className="p-2 text-brand-red-primary hover:bg-brand-red-lighter rounded-xl transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      {q.incorrectAnswers.length < 4 && (
                        <button
                          onClick={() => addIncorrect(q.id)}
                          className="flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-brand-blue-primary/10 hover:border-brand-blue-primary/30 rounded-xl text-brand-blue-primary font-bold transition-all"
                          style={{ fontSize: 'min(11px, 3.5cqmin)' }}
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

        {/* Add question button */}
        <button
          onClick={() => setQuestions((prev) => [...prev, blankQuestion()])}
          className="w-full py-4 border-2 border-dashed border-brand-blue-primary/20 hover:border-brand-blue-primary/40 hover:bg-brand-blue-lighter/30 rounded-2xl text-brand-blue-primary font-black flex flex-col items-center justify-center gap-1 transition-all active:scale-95"
        >
          <div className="bg-brand-blue-primary text-white rounded-full p-1 shadow-sm">
            <Plus className="w-5 h-5" />
          </div>
          <span style={{ fontSize: 'min(14px, 4.5cqmin)' }}>
            ADD NEW QUESTION
          </span>
        </button>
      </div>
    </div>
  );
};
