/**
 * VideoActivityEditorModal — full-screen modal editor for video activity
 * questions. Launched from the video activity Manager library view. Wraps
 * the shared EditorModalShell so it stays visually aligned with other
 * content editors (Quiz, Guided Learning, MiniApp).
 *
 * Adapted from QuizEditorModal with timestamp (MM:SS) inputs and a
 * required YouTube URL field. V1 supports MC question type only.
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
  Youtube,
} from 'lucide-react';
import { VideoActivityData, VideoActivityQuestion } from '@/types';
import { EditorModalShell } from '@/components/common/EditorModalShell';
import { useAuth } from '@/context/useAuth';
import { generateVideoActivity } from '@/utils/ai';

interface VideoActivityEditorModalProps {
  isOpen: boolean;
  activity: VideoActivityData | null;
  onClose: () => void;
  onSave: (updated: VideoActivityData) => Promise<void>;
  /** Video Activity widget-level AI toggle (from VideoActivityGlobalConfig.aiEnabled). */
  aiEnabled?: boolean;
  /** Admin override — admins can use AI even when the widget-level toggle is off. */
  isAdmin?: boolean;
}

/** Convert total seconds to MM:SS string. */
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

const questionsEqual = (
  a: VideoActivityQuestion[],
  b: VideoActivityQuestion[]
): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const qa = a[i];
    const qb = b[i];
    if (
      qa.id !== qb.id ||
      qa.text !== qb.text ||
      qa.correctAnswer !== qb.correctAnswer ||
      qa.timeLimit !== qb.timeLimit ||
      qa.timestamp !== qb.timestamp ||
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

export const VideoActivityEditorModal: React.FC<
  VideoActivityEditorModalProps
> = ({
  isOpen,
  activity,
  onClose,
  onSave,
  aiEnabled = true,
  isAdmin = false,
}) => {
  const { canAccessFeature } = useAuth();
  // Snapshot the activity when the modal opens so `isDirty` compares against
  // the original. When the `activity` prop identity changes, local state is
  // reset via the "adjusting state while rendering" block below.
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
  const [expandedId, setExpandedId] = useState<string | null>(
    originalQuestions[0]?.id ?? null
  );
  // Track raw MM:SS input text per question so users can type freely
  // (e.g. clearing the field) without bouncing through invalid intermediate
  // states. The timestamp in `questions` is only updated when parse succeeds.
  const [timestampInputs, setTimestampInputs] = useState<
    Record<string, string>
  >(() => {
    const init: Record<string, string> = {};
    originalQuestions.forEach((q) => {
      init[q.id] = secondsToMmSs(q.timestamp);
    });
    return init;
  });

  // AI generation state.
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiQuestionCount, setAiQuestionCount] = useState(5);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const canUseAi =
    canAccessFeature('gemini-functions') && (aiEnabled || isAdmin);

  // Reset local state when the `activity` prop identity changes.
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
    setExpandedId(originalQuestions[0]?.id ?? null);
    const init: Record<string, string> = {};
    originalQuestions.forEach((q) => {
      init[q.id] = secondsToMmSs(q.timestamp);
    });
    setTimestampInputs(init);
    setShowAiPrompt(false);
    setAiQuestionCount(5);
    setAiGenerating(false);
    setAiError(null);
  }

  const isDirty = useMemo(
    () =>
      title !== originalTitle ||
      youtubeUrl !== originalYoutubeUrl ||
      !questionsEqual(questions, originalQuestions),
    [
      title,
      originalTitle,
      youtubeUrl,
      originalYoutubeUrl,
      questions,
      originalQuestions,
    ]
  );

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

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newQ = [...questions];
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= newQ.length) return;
    [newQ[index], newQ[swap]] = [newQ[swap], newQ[index]];
    setQuestions(newQ);
  };

  const deleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setTimestampInputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (expandedId === id) setExpandedId(null);
  };

  const addQuestion = () => {
    const q = blankQuestion();
    setQuestions((prev) => [...prev, q]);
    setTimestampInputs((prev) => ({ ...prev, [q.id]: secondsToMmSs(0) }));
    setExpandedId(q.id);
  };

  const handleAiGenerate = async () => {
    if (!youtubeUrl.trim()) {
      setAiError('A YouTube URL is required to generate questions.');
      return;
    }
    setAiGenerating(true);
    setAiError(null);
    try {
      const result = await generateVideoActivity(
        youtubeUrl.trim(),
        aiQuestionCount
      );
      if (!title.trim() && result.title) setTitle(result.title);
      const generated: VideoActivityQuestion[] = result.questions.map((q) => ({
        id: crypto.randomUUID(),
        timestamp: q.timestamp,
        text: q.text,
        type: 'MC',
        correctAnswer: q.correctAnswer ?? '',
        incorrectAnswers: q.incorrectAnswers ?? [],
        timeLimit: q.timeLimit ?? 30,
      }));
      // Merge with existing, then sort by timestamp so strictly-increasing
      // validation passes in handleSave.
      const merged = [...questions, ...generated].sort(
        (a, b) => a.timestamp - b.timestamp
      );
      setQuestions(merged);
      setTimestampInputs((prev) => {
        const next = { ...prev };
        generated.forEach((q) => {
          next[q.id] = secondsToMmSs(q.timestamp);
        });
        return next;
      });
      if (generated[0]) setExpandedId(generated[0].id);
      setShowAiPrompt(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!activity) return;
    const errors: string[] = [];
    if (!title.trim()) errors.push('Activity title is required');
    if (!youtubeUrl.trim()) errors.push('YouTube URL is required');
    if (questions.length === 0) errors.push('Add at least one question');
    questions.forEach((q, i) => {
      if (!q.text.trim()) errors.push(`Question ${i + 1}: text is required`);
      if (!q.correctAnswer.trim())
        errors.push(`Question ${i + 1}: correct answer is required`);
    });

    // Timestamps must be strictly increasing to keep cue-point playback
    // deterministic. Duplicates would cause two prompts at the same moment.
    const hasStrictlyIncreasingTimestamps = questions.every(
      (q, index, arr) =>
        index === 0 || q.timestamp > (arr[index - 1]?.timestamp ?? -1)
    );
    if (questions.length > 0 && !hasStrictlyIncreasingTimestamps) {
      errors.push(
        'Questions must have unique, strictly increasing timestamps. Re-order them or adjust timestamps.'
      );
    }

    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...activity,
        title: title.trim(),
        youtubeUrl: youtubeUrl.trim(),
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

  if (!activity) return null;

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={title.trim() || (originalTitle ? 'Edit Activity' : 'New Activity')}
      subtitle={
        <span>
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}
        </span>
      }
      isDirty={isDirty}
      isSaving={saving}
      onSave={handleSave}
      onClose={onClose}
      saveLabel="Save Activity"
      bodyClassName="px-6 py-5 bg-slate-50/50 relative"
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block font-bold text-brand-blue-dark mb-1 text-xs">
              Activity Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduction to Photosynthesis"
              className="w-full px-3 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-bold focus:outline-none focus:border-brand-blue-primary shadow-sm text-sm"
            />
          </div>
          {canUseAi && (
            <button
              onClick={() => setShowAiPrompt(true)}
              disabled={!youtubeUrl.trim()}
              className="h-[38px] px-4 bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all flex items-center gap-2 active:scale-95"
              title={
                youtubeUrl.trim()
                  ? 'Generate questions with AI'
                  : 'Enter a YouTube URL to enable AI generation'
              }
            >
              <Wand2 className="w-4 h-4" />
              Magic
            </button>
          )}
        </div>

        <div>
          <label className="block font-bold text-brand-blue-dark mb-1 text-xs">
            YouTube URL
          </label>
          <div className="relative">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-medium focus:outline-none focus:border-brand-blue-primary shadow-sm text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl flex items-center gap-2 text-sm text-brand-red-dark font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {questions.map((q, i) => {
          const tsValue = timestampInputs[q.id] ?? secondsToMmSs(q.timestamp);
          return (
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
                <span className="flex items-center gap-1 bg-brand-blue-lighter text-brand-blue-primary font-black rounded-md shrink-0 px-1.5 py-0.5 text-xxs uppercase tracking-wider">
                  <Clock className="w-3 h-3" />
                  {secondsToMmSs(q.timestamp)}
                </span>
                <span className="flex-1 font-bold text-brand-blue-dark truncate text-sm">
                  {q.text || (
                    <span className="italic opacity-40">Untitled question</span>
                  )}
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-brand-blue-dark mb-1 text-xs">
                        Trigger Timestamp (MM:SS)
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
                        className="w-full px-3 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-bold focus:outline-none focus:border-brand-blue-primary shadow-sm text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-brand-blue-dark mb-1 text-xs">
                        Time Limit (Seconds)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={10}
                          max={300}
                          value={q.timeLimit}
                          onChange={(e) =>
                            updateQuestion(q.id, {
                              timeLimit: parseInt(e.target.value, 10) || 30,
                            })
                          }
                          className="w-full pl-3 pr-8 py-2 bg-white border border-brand-blue-primary/20 rounded-xl text-brand-blue-dark font-bold focus:outline-none focus:border-brand-blue-primary shadow-sm text-sm"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray-light font-bold text-xxs">
                          SEC
                        </span>
                      </div>
                    </div>
                  </div>

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
                      placeholder="Enter your question here…"
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
                      placeholder="Enter the correct answer"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-brand-red-primary mb-1 text-xs">
                      Distractors (Incorrect Options)
                    </label>
                    <div className="grid gap-2">
                      {(q.incorrectAnswers.length === 0
                        ? ['', '', '']
                        : q.incorrectAnswers
                      ).map((ans, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={ans}
                          onChange={(e) =>
                            updateIncorrect(q.id, idx, e.target.value)
                          }
                          placeholder={`Distractor ${idx + 1}`}
                          className="flex-1 px-3 py-1.5 bg-white border border-brand-red-primary/10 rounded-xl text-brand-blue-dark font-medium focus:outline-none focus:border-brand-red-primary shadow-sm text-sm"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

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

      {showAiPrompt && canUseAi && (
        <div
          className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200 outline-none"
          onKeyDown={(e) => {
            if (e.code === 'Escape') setShowAiPrompt(false);
          }}
          tabIndex={-1}
        >
          <div className="w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-indigo-600 flex items-center gap-2 uppercase tracking-tight">
                <Sparkles className="w-5 h-5" /> Magic Question Generator
              </h4>
              <button
                onClick={() => setShowAiPrompt(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                aria-label="Close Magic Generator"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest opacity-60">
              Gemini will watch the video and generate questions. They will be
              appended to the current list.
            </p>
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-indigo-700/70 uppercase">
                <span>Question Count</span>
                <span>{aiQuestionCount}</span>
              </div>
              <input
                type="range"
                min={3}
                max={15}
                value={aiQuestionCount}
                onChange={(e) => setAiQuestionCount(parseInt(e.target.value))}
                className="w-full accent-indigo-600"
                aria-label="Target question count"
              />
            </div>
            {aiError && (
              <div className="p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl flex items-center gap-2 text-sm text-brand-red-dark font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {aiError}
              </div>
            )}
            <button
              onClick={() => void handleAiGenerate()}
              disabled={aiGenerating || !youtubeUrl.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
            >
              {aiGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" /> Generate Questions
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </EditorModalShell>
  );
};
