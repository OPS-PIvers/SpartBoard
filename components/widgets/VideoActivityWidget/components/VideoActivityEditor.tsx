/**
 * VideoActivityEditor — context + detail pane components plus the type-
 * specific sub-forms (MC / FIB / MA). Mounted inside an `EditorWorkspace`
 * by `VideoActivityEditorModal`.
 *
 * State is owned by `useVideoActivityEditorState`; both panes read and
 * write through the controller object the modal hands them.
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  Clock,
  MousePointerClick,
  X,
  Youtube,
} from 'lucide-react';
import { LibraryFolder, VideoActivityQuestion } from '@/types';
import { FolderSelectField } from '@/components/common/library/FolderSelectField';
import { SortableList } from '@/components/common/SortableList';
import { AIGeneratorOverlay } from '@/components/common/AIGeneratorOverlay';
import { extractYouTubeId } from '@/utils/youtube';
import { Timeline } from './Timeline';
import {
  mmSsToSeconds,
  secondsToMmSs,
  type VideoActivityEditorController,
} from './useVideoActivityEditorState';

type QuestionType = NonNullable<VideoActivityQuestion['type']>;

const TYPE_BADGE: Record<QuestionType, { label: string; className: string }> = {
  MC: { label: 'MC', className: 'bg-blue-100 text-blue-700' },
  FIB: { label: 'FIB', className: 'bg-amber-100 text-amber-800' },
  MA: { label: 'MA', className: 'bg-emerald-100 text-emerald-700' },
};

interface PaneProps {
  state: VideoActivityEditorController;
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
}

// ─── Context pane ────────────────────────────────────────────────────────────

export const VideoActivityEditorContextPane: React.FC<PaneProps> = ({
  state,
  folders,
  folderId,
  onFolderChange,
}) => {
  const {
    title,
    setTitle,
    youtubeUrl,
    setYoutubeUrl,
    questions,
    selectedId,
    setSelectedId,
    addQuestionAtTime,
    updateQuestion,
    error,
  } = state;

  // Memo via inline parse — Timeline only rebuilds when the resolved id changes.
  const videoIdForTimeline = youtubeUrl.trim()
    ? extractYouTubeId(youtubeUrl.trim())
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Settings strip */}
      <div className="px-5 py-4 border-b border-slate-200 space-y-3 bg-white shrink-0">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Activity title (e.g. Photosynthesis)"
          className="w-full bg-transparent border-0 text-slate-900 placeholder:text-slate-400 focus:outline-none text-lg font-bold p-0"
        />
        <div className="relative">
          <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
          <input
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary text-sm"
          />
        </div>
        {folders && onFolderChange && (
          <FolderSelectField
            folders={folders}
            value={folderId ?? null}
            onChange={onFolderChange}
          />
        )}
        {error && (
          <div className="p-2.5 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-lg flex items-center gap-2 text-xs text-brand-red-dark font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Timeline — fills remaining space, never scrolls */}
      <div className="flex-1 min-h-0 px-5 py-4 bg-slate-50">
        {videoIdForTimeline ? (
          <Timeline
            videoId={videoIdForTimeline}
            questions={questions}
            onAddAtTime={addQuestionAtTime}
            onSelectQuestion={setSelectedId}
            onMarkerDrag={(id, seconds) =>
              updateQuestion(id, { timestamp: seconds })
            }
            activeQuestionId={selectedId ?? undefined}
          />
        ) : (
          <div className="aspect-video w-full rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-center text-slate-500 px-4">
            <Youtube className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-sm font-bold text-slate-700">
              Paste a YouTube URL above
            </p>
            <p className="text-xs">The player and timeline will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Question navigator (sortable pill strip) ────────────────────────────────

interface QuestionNavigatorProps {
  questions: VideoActivityQuestion[];
  selectedId: string | null;
  reorderHintFor: string | null;
  onSelect: (id: string) => void;
  onReorder: (next: VideoActivityQuestion[]) => void;
  onDelete: (id: string) => void;
}

const QuestionNavigator: React.FC<QuestionNavigatorProps> = ({
  questions,
  selectedId,
  reorderHintFor,
  onSelect,
  onReorder,
  onDelete,
}) => {
  return (
    <div className="px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xxs font-bold uppercase tracking-wider text-slate-500">
          Questions ({questions.length})
        </span>
        <span className="text-xxs text-slate-400">
          Drag to reorder · click to edit
        </span>
      </div>
      <div className="max-h-[7.5rem] overflow-y-auto custom-scrollbar -mx-1 px-1">
        <SortableList
          items={questions}
          getId={(q) => q.id}
          onReorder={onReorder}
          layout="grid"
          renderItem={(q, handle) => {
            const idx = questions.findIndex((x) => x.id === q.id);
            const isSelected = q.id === selectedId;
            const showReorderHint = q.id === reorderHintFor;
            const type = (q.type ?? 'MC') as QuestionType;
            const badge = TYPE_BADGE[type];
            return (
              <div
                className={`group inline-flex shrink-0 items-stretch rounded-md border transition-colors ${
                  isSelected
                    ? 'bg-brand-blue-primary border-brand-blue-primary'
                    : 'bg-white border-slate-300 hover:border-slate-400'
                }`}
              >
                <button
                  type="button"
                  {...handle.attributes}
                  onPointerDown={
                    handle.listeners?.onPointerDown as
                      | React.PointerEventHandler<HTMLButtonElement>
                      | undefined
                  }
                  onClick={() => onSelect(q.id)}
                  aria-current={isSelected ? 'true' : undefined}
                  aria-label={`Question ${idx + 1} at ${secondsToMmSs(q.timestamp)}${q.text ? `: ${q.text}` : ''}`}
                  title={q.text?.trim() ? q.text : `Question ${idx + 1}`}
                  className={`cursor-grab active:cursor-grabbing touch-none flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-l-md text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand-blue-primary ${
                    isSelected ? 'text-white' : 'text-slate-700'
                  }`}
                >
                  <span className="font-mono min-w-[1.25ch] text-center">
                    {idx + 1}
                  </span>
                  <span
                    className={`flex items-center gap-0.5 font-mono rounded px-1 py-0.5 text-xxs ${
                      isSelected
                        ? 'bg-brand-blue-dark text-white/90'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {secondsToMmSs(q.timestamp)}
                  </span>
                  <span
                    className={`px-1 py-0.5 rounded text-xxs uppercase tracking-wider ${
                      isSelected
                        ? 'bg-brand-blue-dark text-white/90'
                        : badge.className
                    }`}
                  >
                    {badge.label}
                  </span>
                  {showReorderHint && (
                    <span
                      className={`text-xxs font-bold rounded px-1 py-0.5 animate-in fade-in duration-200 ${
                        isSelected
                          ? 'bg-amber-300 text-amber-900'
                          : 'bg-amber-50 border border-amber-200 text-amber-700'
                      }`}
                    >
                      Reordered
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(q.id)}
                  aria-label={`Delete question ${idx + 1}`}
                  className={`flex items-center rounded-r-md pl-1 pr-1.5 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand-red-primary ${
                    isSelected
                      ? 'text-white/70 hover:text-white hover:bg-white/15'
                      : 'text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          }}
          className="flex flex-wrap gap-1.5"
        />
      </div>
    </div>
  );
};

// ─── Detail pane ─────────────────────────────────────────────────────────────

const labelClass =
  'block text-slate-600 font-bold uppercase tracking-wider mb-1 text-xs';
const inputClass =
  'w-full bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm';

export const VideoActivityEditorDetailPane: React.FC<PaneProps> = ({
  state,
}) => {
  const {
    selectedQuestion,
    selectedIndex,
    questions,
    selectedId,
    setSelectedId,
    reorderQuestions,
    reorderHintFor,
    deleteQuestion,
    timestampInputs,
    setTimestampInput,
    updateQuestion,
    updateIncorrect,
  } = state;

  const navigator =
    questions.length > 0 ? (
      <QuestionNavigator
        questions={questions}
        selectedId={selectedId}
        reorderHintFor={reorderHintFor}
        onSelect={setSelectedId}
        onReorder={reorderQuestions}
        onDelete={deleteQuestion}
      />
    ) : null;

  if (!selectedQuestion) {
    return (
      <div className="flex flex-col h-full">
        {navigator}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12 text-slate-500">
          <MousePointerClick className="w-10 h-10 mb-3 text-slate-400" />
          <h4 className="text-base font-bold text-slate-700 mb-1">
            {questions.length === 0 ? 'No questions yet' : 'Pick a question'}
          </h4>
          <p className="text-sm max-w-xs">
            {questions.length === 0
              ? 'Click "Add at MM:SS" under the timeline to drop a question at the current playhead — or use Draft with AI in the footer to generate a set.'
              : 'Click a pill above (or a green marker on the timeline) to edit it here.'}
          </p>
        </div>
      </div>
    );
  }

  const q = selectedQuestion;
  const tsValue = timestampInputs[q.id] ?? secondsToMmSs(q.timestamp);
  const type = q.type ?? 'MC';

  return (
    <div className="flex flex-col h-full">
      {navigator}
      <div className="px-5 py-4 border-b border-slate-200 bg-white shrink-0">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">
          Question {selectedIndex + 1} of {questions.length}
          <span className="mx-1.5">·</span>
          {type === 'MC'
            ? 'Multiple choice'
            : type === 'FIB'
              ? 'Fill in the blank'
              : 'Multi-answer'}
        </div>
        <h4 className="text-base font-bold text-slate-900 truncate mt-0.5">
          {q.text.trim() || `Question at ${secondsToMmSs(q.timestamp)}`}
        </h4>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
        {/* Question prompt */}
        <div>
          <label className={labelClass}>Question prompt</label>
          <textarea
            value={q.text}
            onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
            rows={3}
            placeholder="Enter your question…"
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Type picker */}
        <div>
          <label className={labelClass}>Question Type</label>
          <div className="inline-flex rounded-xl border border-slate-300 bg-white overflow-hidden">
            {(
              [
                { value: 'MC', label: 'Multiple Choice' },
                { value: 'FIB', label: 'Fill in the Blank' },
                { value: 'MA', label: 'Multi-Answer' },
              ] as const
            ).map((opt) => {
              const active = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (opt.value === q.type) return;
                    const preservedDistractors = (
                      q.incorrectAnswers ?? []
                    ).filter((s) => s.trim().length > 0);
                    const padTo = (arr: string[], n: number) => {
                      const out = [...arr];
                      while (out.length < n) out.push('');
                      return out;
                    };
                    updateQuestion(q.id, {
                      type: opt.value,
                      correctAnswer: '',
                      incorrectAnswers:
                        opt.value === 'FIB'
                          ? []
                          : padTo(preservedDistractors, 3),
                      acceptableVariants: undefined,
                      allowPartialCredit: false,
                    });
                  }}
                  className={
                    'px-3 py-1.5 text-xs font-bold transition border-r border-slate-300 last:border-r-0 ' +
                    (active
                      ? 'bg-brand-blue-primary text-white'
                      : 'text-slate-700 hover:bg-slate-100')
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Timing + points row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Timestamp (MM:SS)</label>
            <input
              type="text"
              value={tsValue}
              onChange={(e) => {
                const raw = e.target.value;
                setTimestampInput(q.id, raw);
                const secs = mmSsToSeconds(raw);
                if (!isNaN(secs)) {
                  updateQuestion(q.id, { timestamp: secs });
                }
              }}
              placeholder="01:30"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className={labelClass}>Time Limit</label>
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
                className={`${inputClass} pr-12`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xxs uppercase tracking-wider">
                Sec
              </span>
            </div>
          </div>
          <div>
            <label className={labelClass}>Points</label>
            <input
              type="number"
              min={1}
              step={1}
              value={q.points ?? 1}
              onChange={(e) => {
                const next = Math.floor(Number(e.target.value));
                const safe = Number.isFinite(next) && next >= 1 ? next : 1;
                updateQuestion(q.id, { points: safe });
              }}
              className={inputClass}
            />
          </div>
        </div>

        {/* Type-specific sub-form */}
        {type === 'MC' && (
          <McSubForm
            question={q}
            onChangeCorrect={(v) => updateQuestion(q.id, { correctAnswer: v })}
            onChangeIncorrect={(idx, v) => updateIncorrect(q.id, idx, v)}
          />
        )}
        {type === 'FIB' && (
          <FibSubForm
            question={q}
            onChangeCorrect={(v) => updateQuestion(q.id, { correctAnswer: v })}
            onChangeVariants={(variants) =>
              updateQuestion(q.id, { acceptableVariants: variants })
            }
          />
        )}
        {type === 'MA' && (
          <MaSubForm
            question={q}
            onUpdate={(patch) => updateQuestion(q.id, patch)}
          />
        )}
      </div>
    </div>
  );
};

// ─── AI overlay ──────────────────────────────────────────────────────────────

interface AiOverlayProps {
  state: VideoActivityEditorController;
}

export const VideoActivityAiOverlay: React.FC<AiOverlayProps> = ({ state }) => {
  const {
    showAiPrompt,
    setShowAiPrompt,
    aiQuestionCount,
    setAiQuestionCount,
    aiGenerating,
    aiError,
    runAiGenerate,
    youtubeUrl,
  } = state;

  return (
    <AIGeneratorOverlay
      open={showAiPrompt}
      onClose={() => setShowAiPrompt(false)}
      title="Draft with AI"
      description="Gemini will watch the video and append questions to the current list."
      generating={aiGenerating}
      canGenerate={!!youtubeUrl.trim()}
      onGenerate={() => void runAiGenerate()}
      error={aiError}
      generateLabel="Generate Questions"
    >
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
    </AIGeneratorOverlay>
  );
};

// ─── Type-specific sub-forms ─────────────────────────────────────────────────

interface McSubFormProps {
  question: VideoActivityQuestion;
  onChangeCorrect: (v: string) => void;
  onChangeIncorrect: (idx: number, v: string) => void;
}

const McSubForm: React.FC<McSubFormProps> = ({
  question,
  onChangeCorrect,
  onChangeIncorrect,
}) => (
  <div className="space-y-3">
    <div>
      <label className="block font-bold text-emerald-700 mb-1 text-xs uppercase tracking-wider">
        Correct Answer
      </label>
      <input
        type="text"
        value={question.correctAnswer}
        onChange={(e) => onChangeCorrect(e.target.value)}
        className="w-full px-3 py-2 bg-white border-2 border-emerald-500/30 rounded-lg text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 text-sm"
        placeholder="Enter the correct answer"
      />
    </div>
    <div className="space-y-2">
      <label className="block font-bold text-slate-600 mb-1 text-xs uppercase tracking-wider">
        Distractors (Incorrect Options)
      </label>
      <div className="grid gap-2">
        {(question.incorrectAnswers.length === 0
          ? ['', '', '']
          : question.incorrectAnswers
        ).map((ans, idx) => (
          <input
            key={idx}
            type="text"
            value={ans}
            onChange={(e) => onChangeIncorrect(idx, e.target.value)}
            placeholder={`Distractor ${idx + 1}`}
            className={inputClass}
          />
        ))}
      </div>
    </div>
  </div>
);

interface FibSubFormProps {
  question: VideoActivityQuestion;
  onChangeCorrect: (v: string) => void;
  onChangeVariants: (variants: string[] | undefined) => void;
}

const FibSubForm: React.FC<FibSubFormProps> = ({
  question,
  onChangeCorrect,
  onChangeVariants,
}) => {
  const variantsText = (question.acceptableVariants ?? []).join('\n');
  return (
    <div className="space-y-3">
      <div>
        <label className="block font-bold text-emerald-700 mb-1 text-xs uppercase tracking-wider">
          Canonical Answer
        </label>
        <input
          type="text"
          value={question.correctAnswer}
          onChange={(e) => onChangeCorrect(e.target.value)}
          className="w-full px-3 py-2 bg-white border-2 border-emerald-500/30 rounded-lg text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 text-sm"
          placeholder="The expected answer"
        />
      </div>
      <div>
        <label className={labelClass}>
          Acceptable Variants{' '}
          <span className="font-normal normal-case text-slate-400">
            (one per line, optional)
          </span>
        </label>
        <textarea
          value={variantsText}
          onChange={(e) => {
            const lines = e.target.value
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            onChangeVariants(lines.length > 0 ? lines : undefined);
          }}
          rows={3}
          placeholder={'color\ncolour'}
          className={`${inputClass} resize-none`}
        />
        <p className="text-xxs text-slate-500 mt-1">
          Whitespace + case are ignored. Add variants for spellings, synonyms,
          or alternate phrasings.
        </p>
      </div>
    </div>
  );
};

interface MaSubFormProps {
  question: VideoActivityQuestion;
  onUpdate: (patch: Partial<VideoActivityQuestion>) => void;
}

interface MaRow {
  text: string;
  isCorrect: boolean;
}

function rowsFromQuestion(question: VideoActivityQuestion): MaRow[] {
  const correct = (question.correctAnswer ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const incorrect = (question.incorrectAnswers ?? []).filter(
    (s) => s.trim().length > 0
  );
  const rows: MaRow[] = [
    ...correct.map((text) => ({ text, isCorrect: true })),
    ...incorrect.map((text) => ({ text, isCorrect: false })),
  ];
  while (rows.length < 4) rows.push({ text: '', isCorrect: false });
  return rows;
}

const MaSubForm: React.FC<MaSubFormProps> = ({ question, onUpdate }) => {
  const [rows, setRows] = useState<MaRow[]>(() => rowsFromQuestion(question));

  const [prevQuestionId, setPrevQuestionId] = useState(question.id);
  if (prevQuestionId !== question.id) {
    setPrevQuestionId(question.id);
    setRows(rowsFromQuestion(question));
  }

  const persist = (next: MaRow[]): void => {
    const correct: string[] = [];
    const incorrect: string[] = [];
    next.forEach((r) => {
      const trimmed = r.text.trim();
      if (trimmed.length === 0) return;
      if (r.isCorrect) correct.push(trimmed);
      else incorrect.push(trimmed);
    });
    onUpdate({
      correctAnswer: correct.join('|'),
      incorrectAnswers: incorrect,
    });
  };

  const setRowsAndPersist = (next: MaRow[]) => {
    setRows(next);
    persist(next);
  };

  const setOptionAt = (idx: number, value: string) => {
    setRowsAndPersist(
      rows.map((r, i) => (i === idx ? { ...r, text: value } : r))
    );
  };

  const isCheckedAt = (idx: number): boolean => rows[idx]?.isCorrect ?? false;

  const toggleAt = (idx: number) => {
    setRowsAndPersist(
      rows.map((r, i) => (i === idx ? { ...r, isCorrect: !r.isCorrect } : r))
    );
  };

  const hasPipeInOption = rows.some((r) => r.text.includes('|'));

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className={labelClass}>
          Options{' '}
          <span className="font-normal normal-case text-slate-400">
            (check each correct selection)
          </span>
        </label>
        <div className="grid gap-2">
          {rows.map((row, idx) => {
            const checked = isCheckedAt(idx);
            return (
              <div key={idx} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleAt(idx)}
                  aria-pressed={checked}
                  aria-label={`Mark option ${idx + 1} ${checked ? 'incorrect' : 'correct'}`}
                  className={`shrink-0 w-7 h-7 rounded-md border-2 flex items-center justify-center transition-colors ${
                    checked
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-slate-300 bg-white text-slate-400 hover:border-emerald-400'
                  }`}
                >
                  {checked ? '✓' : ''}
                </button>
                <input
                  type="text"
                  value={row.text}
                  onChange={(e) => setOptionAt(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  className={`flex-1 px-3 py-1.5 bg-white border rounded-lg text-sm focus:outline-none ${
                    checked
                      ? 'border-emerald-500/40 text-emerald-800 focus:border-emerald-500'
                      : 'border-slate-300 text-slate-700 focus:border-brand-blue-primary'
                  }`}
                />
              </div>
            );
          })}
        </div>
        {hasPipeInOption && (
          <p className="text-xxs text-amber-600 font-medium pl-9">
            Option text contains a pipe (<code>|</code>) character, which is
            reserved as the wire format separator. Replace it before saving.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={question.allowPartialCredit ?? false}
          onChange={(e) => onUpdate({ allowPartialCredit: e.target.checked })}
          className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary w-4 h-4"
        />
        <span className="text-sm font-bold text-slate-700">
          Allow partial credit
        </span>
        <span className="text-xxs text-slate-500">
          (proportional to correct ∩ given)
        </span>
      </label>
    </div>
  );
};
