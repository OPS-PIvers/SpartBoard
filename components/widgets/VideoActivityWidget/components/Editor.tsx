/**
 * Editor — inline editor for video activity questions.
 * Adapted from QuizEditor with timestamp (MM:SS) inputs added.
 * V1 supports MC question type only.
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { VideoActivityData, VideoActivityQuestion } from '@/types';

interface EditorProps {
  activity: VideoActivityData;
  onBack: () => void;
  onSave: (updated: VideoActivityData) => Promise<void>;
}

/** Convert total seconds to MM:SS string */
function secondsToMmSs(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Convert MM:SS or M:SS string to total seconds. Returns NaN if invalid. */
function mmSsToSeconds(value: string): number {
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
});

export const Editor: React.FC<EditorProps> = ({ activity, onBack, onSave }) => {
  const [questions, setQuestions] = useState<VideoActivityQuestion[]>(() =>
    activity.questions.map((q) => ({ ...q }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(
    activity.questions[0]?.id ?? null
  );
  const [timestampInputs, setTimestampInputs] = useState<
    Record<string, string>
  >(() => {
    const init: Record<string, string> = {};
    activity.questions.forEach((q) => {
      init[q.id] = secondsToMmSs(q.timestamp);
    });
    return init;
  });

  const updateQuestion = (
    id: string,
    updates: Partial<VideoActivityQuestion>
  ) => {
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

  const addQuestion = () => {
    const q = blankQuestion();
    setQuestions((prev) => [...prev, q]);
    setTimestampInputs((prev) => ({ ...prev, [q.id]: '00:00' }));
    setExpandedId(q.id);
  };

  const deleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setTimestampInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExpandedId((prev) => (prev === id ? null : prev));
  };

  const moveQuestion = (id: string, dir: -1 | 1) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const handleSave = async () => {
    // Validate timestamps are in ascending order
    const sorted = [...questions].sort((a, b) => a.timestamp - b.timestamp);
    const isOrdered = questions.every(
      (q, i) => q.timestamp === sorted[i]?.timestamp
    );

    if (!isOrdered) {
      setError(
        'Questions must be in ascending timestamp order. Re-order them or adjust timestamps.'
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({ ...activity, questions });
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
        className="flex items-center justify-between border-b border-brand-blue-primary/10 bg-brand-blue-lighter/30"
        style={{ padding: 'min(10px, 2.5cqmin) min(16px, 4cqmin)' }}
      >
        <div className="flex items-center" style={{ gap: 'min(8px, 2cqmin)' }}>
          <button
            onClick={onBack}
            className="text-brand-blue-primary hover:text-brand-blue-dark transition-colors"
          >
            <ArrowLeft
              style={{
                width: 'min(18px, 4.5cqmin)',
                height: 'min(18px, 4.5cqmin)',
              }}
            />
          </button>
          <div className="min-w-0">
            <p
              className="font-bold text-brand-blue-dark truncate"
              style={{ fontSize: 'min(13px, 4cqmin)' }}
            >
              {activity.title}
            </p>
            <p
              className="text-brand-blue-primary/60"
              style={{ fontSize: 'min(10px, 3cqmin)' }}
            >
              {questions.length} question{questions.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(6px, 1.5cqmin) min(14px, 3.5cqmin)',
            fontSize: 'min(12px, 3.5cqmin)',
          }}
        >
          {saving ? (
            <Loader2
              className="animate-spin"
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
          ) : (
            <Save
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
          )}
          Save
        </button>
      </div>

      {error && (
        <div
          className="flex items-center bg-brand-red-lighter/40 border border-brand-red-primary/30 text-brand-red-dark"
          style={{
            padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
            gap: 'min(8px, 2cqmin)',
            fontSize: 'min(11px, 3.5cqmin)',
          }}
        >
          <AlertCircle
            className="shrink-0"
            style={{
              width: 'min(14px, 4cqmin)',
              height: 'min(14px, 4cqmin)',
            }}
          />
          {error}
        </div>
      )}

      {/* Questions */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar space-y-2"
        style={{ padding: 'min(12px, 3cqmin)' }}
      >
        {questions.map((q, idx) => {
          const isExpanded = expandedId === q.id;
          const tsValue = timestampInputs[q.id] ?? secondsToMmSs(q.timestamp);

          return (
            <div
              key={q.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
            >
              {/* Question header row */}
              <div
                className="flex items-center cursor-pointer hover:bg-slate-50 transition-colors"
                style={{
                  padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
                  gap: 'min(8px, 2cqmin)',
                }}
                onClick={() =>
                  setExpandedId((prev) => (prev === q.id ? null : q.id))
                }
              >
                {/* Timestamp badge */}
                <div
                  className="flex items-center bg-brand-blue-lighter text-brand-blue-primary font-black rounded-md shrink-0"
                  style={{
                    gap: 'min(3px, 0.8cqmin)',
                    padding: 'min(2px, 0.5cqmin) min(7px, 1.8cqmin)',
                    fontSize: 'min(10px, 3cqmin)',
                  }}
                >
                  <Clock
                    style={{
                      width: 'min(10px, 2.5cqmin)',
                      height: 'min(10px, 2.5cqmin)',
                    }}
                  />
                  {secondsToMmSs(q.timestamp)}
                </div>

                <p
                  className="flex-1 min-w-0 truncate text-slate-700 font-medium"
                  style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                >
                  {idx + 1}. {q.text || 'Untitled question'}
                </p>

                {/* Move / delete controls */}
                <div
                  className="flex items-center shrink-0"
                  style={{ gap: 'min(2px, 0.5cqmin)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => moveQuestion(q.id, -1)}
                    disabled={idx === 0}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors"
                  >
                    <ChevronUp
                      style={{
                        width: 'min(16px, 4cqmin)',
                        height: 'min(16px, 4cqmin)',
                      }}
                    />
                  </button>
                  <button
                    onClick={() => moveQuestion(q.id, 1)}
                    disabled={idx === questions.length - 1}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown
                      style={{
                        width: 'min(16px, 4cqmin)',
                        height: 'min(16px, 4cqmin)',
                      }}
                    />
                  </button>
                  <button
                    onClick={() => deleteQuestion(q.id)}
                    className="text-brand-red-primary hover:text-brand-red-dark transition-colors"
                    style={{ marginLeft: 'min(4px, 1cqmin)' }}
                  >
                    <Trash2
                      style={{
                        width: 'min(14px, 3.5cqmin)',
                        height: 'min(14px, 3.5cqmin)',
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Expanded editor */}
              {isExpanded && (
                <div
                  className="border-t border-slate-100 space-y-3"
                  style={{ padding: 'min(12px, 3cqmin)' }}
                >
                  {/* Timestamp input */}
                  <div
                    className="flex items-center"
                    style={{ gap: 'min(12px, 3cqmin)' }}
                  >
                    <div className="flex-1">
                      <label
                        className="block text-slate-500 font-semibold mb-1"
                        style={{ fontSize: 'min(10px, 3cqmin)' }}
                      >
                        TRIGGER TIMESTAMP (MM:SS)
                      </label>
                      <input
                        type="text"
                        value={tsValue}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setTimestampInputs((prev) => ({
                            ...prev,
                            [q.id]: raw,
                          }));
                          const secs = mmSsToSeconds(raw);
                          if (!isNaN(secs)) {
                            updateQuestion(q.id, { timestamp: secs });
                          }
                        }}
                        placeholder="01:30"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                        style={{
                          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                          fontSize: 'min(13px, 4cqmin)',
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <label
                        className="block text-slate-500 font-semibold mb-1"
                        style={{ fontSize: 'min(10px, 3cqmin)' }}
                      >
                        TIME LIMIT (SECONDS)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={120}
                        value={q.timeLimit}
                        onChange={(e) =>
                          updateQuestion(q.id, {
                            timeLimit: parseInt(e.target.value) || 30,
                          })
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                        style={{
                          padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                          fontSize: 'min(13px, 4cqmin)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Question text */}
                  <div>
                    <label
                      className="block text-slate-500 font-semibold mb-1"
                      style={{ fontSize: 'min(10px, 3cqmin)' }}
                    >
                      QUESTION
                    </label>
                    <textarea
                      value={q.text}
                      onChange={(e) =>
                        updateQuestion(q.id, { text: e.target.value })
                      }
                      rows={2}
                      placeholder="Enter your question here…"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                      style={{
                        padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
                        fontSize: 'min(13px, 4cqmin)',
                      }}
                    />
                  </div>

                  {/* Correct answer */}
                  <div>
                    <label
                      className="block text-emerald-600 font-semibold mb-1"
                      style={{ fontSize: 'min(10px, 3cqmin)' }}
                    >
                      CORRECT ANSWER
                    </label>
                    <input
                      type="text"
                      value={q.correctAnswer}
                      onChange={(e) =>
                        updateQuestion(q.id, { correctAnswer: e.target.value })
                      }
                      placeholder="Correct answer"
                      className="w-full bg-emerald-50 border border-emerald-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                      style={{
                        padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                        fontSize: 'min(13px, 4cqmin)',
                      }}
                    />
                  </div>

                  {/* Incorrect answers */}
                  <div>
                    <label
                      className="block text-brand-red-primary font-semibold mb-1"
                      style={{ fontSize: 'min(10px, 3cqmin)' }}
                    >
                      INCORRECT ANSWERS
                    </label>
                    <div className="space-y-1">
                      {(q.incorrectAnswers.length === 0
                        ? ['', '', '']
                        : q.incorrectAnswers
                      ).map((ans, ansIdx) => (
                        <input
                          key={ansIdx}
                          type="text"
                          value={ans}
                          onChange={(e) =>
                            updateIncorrect(q.id, ansIdx, e.target.value)
                          }
                          placeholder={`Incorrect answer ${ansIdx + 1}`}
                          className="w-full bg-brand-red-lighter/30 border border-brand-red-primary/20 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-red-primary/30"
                          style={{
                            padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                            fontSize: 'min(13px, 4cqmin)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add question button */}
        <button
          onClick={addQuestion}
          className="w-full flex items-center justify-center font-bold text-brand-blue-primary border-2 border-dashed border-brand-blue-primary/30 rounded-xl hover:border-brand-blue-primary hover:bg-brand-blue-lighter/30 transition-all"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(10px, 2.5cqmin)',
            fontSize: 'min(13px, 4cqmin)',
          }}
        >
          <Plus
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
          Add Question
        </button>
      </div>
    </div>
  );
};
