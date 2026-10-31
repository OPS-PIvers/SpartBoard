// Video Activity editor panes on the Quiz editor layout (docs/plans/VA_QUIZ_ALIGNMENT.md slice 2, flag va-quiz-alignment).
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Copy,
  MousePointerClick,
  PlayCircle,
  Plus,
  Tag,
  Trash2,
  Wand2,
} from 'lucide-react';
import type {
  QuizQuestion,
  QuizQuestionType,
  VideoActivityQuestion,
} from '@/types';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { extractYouTubeId } from '@/utils/youtube';
import { questionNeedsKey } from '@/utils/quizNeedsKey';
import {
  VA_EDITOR_TYPES,
  quizUpdatesToVa,
  vaToQuizQuestion,
} from '@/utils/vaQuestionAdapter';
import { TargetChips } from '@/components/quiz/targets/TargetChips';
import { TargetPicker } from '@/components/quiz/targets/TargetPicker';
import { useStandardsFromPrompt } from '@/components/quiz/targets/useStandardsFromPrompt';
import { ChoiceOptionsEditor } from '@/components/widgets/QuizWidget/components/ChoiceOptionsEditor';
import { DraftNumberInput } from '@/components/widgets/QuizWidget/components/DraftNumberInput';
import {
  FibAnswerField,
  NeedsAnswerNotice,
  QuestionPromptField,
  QuestionTargetsField,
  QuestionTypeSelect,
} from '@/components/widgets/QuizWidget/components/QuestionFields';
import {
  QUESTION_TYPES,
  questionTypeChangeUpdates,
} from '@/components/widgets/QuizWidget/components/questionFieldUpdates';
import {
  inputClass,
  labelClass,
} from '@/components/widgets/QuizWidget/components/quizEditorFieldStyles';
import { VideoActivityClipFields } from './VideoActivityClipFields';
import { VideoActivityNotesEditor } from './VideoActivityNotesEditor';
import { Timeline, type TimelineHandle } from './Timeline';
import {
  mmSsToSeconds,
  secondsToMmSs,
  type VideoActivityEditorController,
} from './useVideoActivityEditorState';

interface PaneProps {
  state: VideoActivityEditorController;
  timelineRef: React.RefObject<TimelineHandle | null>;
}

interface ContextPaneProps extends PaneProps {
  aiEnabled: boolean;
}

// Same badge colors as the Quiz editor's question rows.
const TYPE_BADGE: Record<VideoActivityQuestion['type'], string> = {
  MC: 'bg-blue-100 text-blue-700',
  FIB: 'bg-amber-100 text-amber-800',
  MA: 'bg-emerald-100 text-emerald-700',
};

// ─── Context pane ────────────────────────────────────────────────────────────

const contextPanePropsEqual = (
  prev: ContextPaneProps,
  next: ContextPaneProps
): boolean =>
  prev.aiEnabled === next.aiEnabled &&
  prev.timelineRef === next.timelineRef &&
  prev.state.youtubeUrl === next.state.youtubeUrl &&
  prev.state.clip === next.state.clip &&
  prev.state.notes === next.state.notes &&
  prev.state.questions === next.state.questions &&
  prev.state.selectedId === next.state.selectedId &&
  prev.state.checkedIds === next.state.checkedIds &&
  prev.state.error === next.state.error &&
  prev.state.deleteChecked === next.state.deleteChecked;

export const VideoActivityQuizContextPane = React.memo(
  function VideoActivityQuizContextPane({
    state,
    timelineRef,
    aiEnabled,
  }: ContextPaneProps) {
    const {
      youtubeUrl,
      setYoutubeUrl,
      clip,
      setClip,
      notes,
      setNotes,
      questions,
      selectedId,
      setSelectedId,
      addQuestionAtTime,
      updateQuestion,
      setVideoDurationSeconds,
      deleteQuestion,
      duplicateQuestion,
      checkedIds,
      toggleChecked,
      setAllChecked,
      deleteChecked,
      applyTargets,
      setShowAiPrompt,
      setTimestampInput,
      error,
    } = state;
    const [bulkPickerOpen, setBulkPickerOpen] = useState(false);

    const videoId = youtubeUrl.trim()
      ? extractYouTubeId(youtubeUrl.trim())
      : null;
    const hasUrl = youtubeUrl.trim().length > 0;

    // Rows keep stable callbacks; the latest questions are read at click time.
    const questionsRef = useRef(questions);
    const deleteRef = useRef(deleteQuestion);
    useLayoutEffect(() => {
      questionsRef.current = questions;
      deleteRef.current = deleteQuestion;
    });
    const handleSelect = useCallback(
      (id: string) => {
        setSelectedId(id);
        const q = questionsRef.current.find((x) => x.id === id);
        if (q) timelineRef.current?.seekTo(q.timestamp);
      },
      [setSelectedId, timelineRef]
    );
    const handleDelete = useCallback((id: string) => deleteRef.current(id), []);
    const handleAdd = () =>
      addQuestionAtTime(timelineRef.current?.getCurrentTime() ?? 0);

    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-4 border-b border-slate-200 space-y-3 bg-white shrink-0">
          <div className="relative">
            <PlayCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
            <input
              {...tourAttr('video-activity.editor-youtube-url')}
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              aria-label="YouTube URL"
              className={`${inputClass} pl-9`}
            />
          </div>
          <VideoActivityClipFields clip={clip} onChange={setClip} />
          <VideoActivityNotesEditor
            notes={notes}
            onChange={setNotes}
            getCurrentTime={() => timelineRef.current?.getCurrentTime() ?? null}
          />
          {error && (
            <div className="p-2.5 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-lg flex items-center gap-2 text-xs text-brand-red-dark font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="h-[45%] min-h-44 shrink-0 px-5 pt-4 pb-3 border-b border-slate-200 bg-slate-50">
          {videoId ? (
            <Timeline
              videoId={videoId}
              questions={questions}
              onAddAtTime={addQuestionAtTime}
              onSelectQuestion={setSelectedId}
              onMarkerDrag={(id, seconds) => {
                setTimestampInput(id, secondsToMmSs(seconds));
                updateQuestion(id, { timestamp: seconds });
              }}
              activeQuestionId={selectedId ?? undefined}
              onDurationChange={setVideoDurationSeconds}
              handleRef={timelineRef}
            />
          ) : (
            <div className="h-full w-full rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-center text-slate-500 px-4">
              <PlayCircle className="w-8 h-8 text-red-400 mb-2" />
              <p className="text-sm font-bold text-slate-700">
                Paste a YouTube URL above
              </p>
              <p className="text-xs">
                The player and timeline will appear here.
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-50 px-5 pb-5 pt-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Questions ({questions.length})
            </h4>
            <div className="flex items-center gap-2">
              {checkedIds.size > 0 && (
                <>
                  <span className="text-xs font-semibold text-slate-600">
                    {checkedIds.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setBulkPickerOpen(true)}
                    {...tourAttr('video-activity.editor-bulk-tag')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    Tag
                  </button>
                  <button
                    type="button"
                    onClick={deleteChecked}
                    {...tourAttr('video-activity.editor-bulk-delete')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-red-50 border border-slate-300 text-red-600 rounded-lg text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllChecked(false)}
                    {...tourAttr('video-activity.editor-bulk-clear')}
                    className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Clear
                  </button>
                </>
              )}
              {aiEnabled && (
                <button
                  type="button"
                  onClick={() => setShowAiPrompt(true)}
                  disabled={!hasUrl}
                  {...tourAttr('video-activity.editor-draft-ai')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    hasUrl
                      ? 'Generate questions with AI'
                      : 'Paste a YouTube URL first'
                  }
                >
                  <Wand2 className="w-3.5 h-3.5 text-slate-500" />
                  Draft with AI
                </button>
              )}
              <button
                type="button"
                onClick={handleAdd}
                {...tourAttr('video-activity.editor-add-question')}
                className="flex items-center gap-1 px-2.5 py-1 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-lg text-xs font-bold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </div>

          {questions.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-8 border-2 border-dashed border-slate-300 rounded-lg bg-white">
              No questions yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {questions.map((q, index) => (
                <VaQuestionRow
                  key={q.id}
                  question={q}
                  index={index}
                  isSelected={q.id === selectedId}
                  isChecked={checkedIds.has(q.id)}
                  onSelect={handleSelect}
                  onToggleChecked={toggleChecked}
                  onDelete={handleDelete}
                  onDuplicate={duplicateQuestion}
                />
              ))}
            </div>
          )}
        </div>

        {bulkPickerOpen && (
          <TargetPicker
            open
            initial={[]}
            allowReplace
            title={`Tag ${checkedIds.size} question${checkedIds.size === 1 ? '' : 's'}`}
            onApply={(tags, mode) => {
              applyTargets([...checkedIds], tags, mode);
              setBulkPickerOpen(false);
            }}
            onClose={() => setBulkPickerOpen(false)}
          />
        )}
      </div>
    );
  },
  contextPanePropsEqual
);

// ─── Question row ────────────────────────────────────────────────────────────

interface VaQuestionRowProps {
  question: VideoActivityQuestion;
  index: number;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: (id: string) => void;
  onToggleChecked: (id: string, range?: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

// Quiz's row with the question's time in the video where Quiz has its drag handle.
const VaQuestionRow = React.memo(function VaQuestionRow({
  question,
  index,
  isSelected,
  isChecked,
  onSelect,
  onToggleChecked,
  onDelete,
  onDuplicate,
}: VaQuestionRowProps) {
  const needsKey = questionNeedsKey(vaToQuizQuestion(question));
  return (
    <div
      onClick={() => onSelect(question.id)}
      {...tourFieldAttr(
        'video-activity.editor-question-pill',
        'video-activity',
        question.id
      )}
      aria-current={isSelected ? 'true' : undefined}
      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-white cursor-pointer transition-all ${
        isSelected
          ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/15'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <span className="shrink-0 font-mono text-xs font-bold text-slate-500 tabular-nums">
        {secondsToMmSs(question.timestamp)}
      </span>
      <input
        type="checkbox"
        checked={isChecked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          onToggleChecked(
            question.id,
            (e.nativeEvent as MouseEvent).shiftKey === true
          )
        }
        aria-label={`Select question ${index + 1}`}
        {...tourFieldAttr(
          'video-activity.editor-question-select',
          'video-activity',
          String(index + 1)
        )}
        className={`shrink-0 accent-brand-blue-primary transition-opacity ${
          isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      />
      <span className="text-slate-400 font-mono font-bold text-xs w-5 shrink-0 text-center">
        {index + 1}
      </span>
      <span
        className={`shrink-0 px-1.5 py-0.5 rounded-sm text-xxs font-bold uppercase tracking-wider ${TYPE_BADGE[question.type ?? 'MC']}`}
      >
        {question.type ?? 'MC'}
      </span>
      {needsKey && (
        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xxs font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
          <AlertCircle className="w-2.5 h-2.5" aria-hidden />
          Needs answer
        </span>
      )}
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm text-slate-700 truncate">
          {question.text || (
            <span className="italic text-slate-400">Untitled question</span>
          )}
        </span>
        {question.targets && question.targets.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            <TargetChips targets={question.targets} compact max={3} />
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate(question.id);
        }}
        aria-label="Duplicate question"
        title="Duplicate question"
        {...tourFieldAttr(
          'video-activity.editor-question-duplicate',
          'video-activity',
          String(index + 1)
        )}
        className="text-slate-300 hover:text-brand-blue-primary hover:bg-slate-100 rounded-sm p-1 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(question.id);
        }}
        aria-label="Delete question"
        title="Delete question"
        {...tourFieldAttr(
          'video-activity.editor-question-delete',
          'video-activity',
          question.id
        )}
        className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-sm p-1 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

// ─── Detail pane ─────────────────────────────────────────────────────────────

const detailPanePropsEqual = (prev: PaneProps, next: PaneProps): boolean =>
  prev.timelineRef === next.timelineRef &&
  prev.state.questions === next.state.questions &&
  prev.state.selectedQuestion === next.state.selectedQuestion &&
  prev.state.selectedIndex === next.state.selectedIndex &&
  prev.state.timestampInputs === next.state.timestampInputs;

export const VideoActivityQuizDetailPane = React.memo(
  function VideoActivityQuizDetailPane({ state, timelineRef }: PaneProps) {
    const {
      selectedQuestion,
      selectedIndex,
      questions,
      updateQuestion,
      timestampInputs,
      setTimestampInput,
    } = state;
    const [pickerOpen, setPickerOpen] = useState(false);
    const promptRef = useRef<HTMLTextAreaElement>(null);
    const readPrompt = useCallback(() => promptRef.current?.value, []);
    const targetsRef = useRef(selectedQuestion?.targets);
    useLayoutEffect(() => {
      targetsRef.current = selectedQuestion?.targets;
    });
    const readTargets = useCallback(() => targetsRef.current, []);
    const promptStandards = useStandardsFromPrompt(
      updateQuestion,
      readPrompt,
      readTargets
    );

    const q = useMemo(
      () => (selectedQuestion ? vaToQuizQuestion(selectedQuestion) : null),
      [selectedQuestion]
    );

    if (!selectedQuestion || !q) {
      return (
        <div className="flex flex-col h-full items-center justify-center text-center px-8 py-12 text-slate-500">
          <MousePointerClick className="w-10 h-10 mb-3 text-slate-400" />
          <h4 className="text-base font-bold text-slate-700 mb-1">
            {questions.length === 0 ? 'No questions yet' : 'Pick a question'}
          </h4>
          {questions.length === 0 && (
            <p className="text-sm max-w-xs">
              Add a question or draft with AI to start editing.
            </p>
          )}
        </div>
      );
    }

    const id = selectedQuestion.id;
    const apply = (updates: Partial<QuizQuestion>) => {
      const va = quizUpdatesToVa(updates);
      if (va) updateQuestion(id, va);
    };
    // Skips seconds other questions already use, as Add does.
    const setTime = (seconds: number) => {
      const used = new Set(
        questions.filter((x) => x.id !== id).map((x) => x.timestamp)
      );
      let ts = Math.max(0, seconds);
      while (used.has(ts)) ts += 1;
      setTimestampInput(id, secondsToMmSs(ts));
      updateQuestion(id, { timestamp: ts });
    };
    const typeMeta = QUESTION_TYPES.find((t) => t.value === q.type);
    const timeValue =
      timestampInputs[id] ?? secondsToMmSs(selectedQuestion.timestamp);

    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">
            Question {selectedIndex + 1} of {questions.length}
            <span className="mx-1.5">·</span>
            {typeMeta?.label ?? q.type}
          </div>
          <h4 className="text-base font-bold text-slate-900 truncate mt-0.5">
            {q.text.trim() || `Question ${selectedIndex + 1}`}
          </h4>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
          <QuestionPromptField
            question={q}
            onChange={apply}
            onBlur={() =>
              void promptStandards.onPromptBlur(id, q.text, q.targets)
            }
            textareaRef={promptRef}
            allowBlanks={false}
            anchor={tourAttr('video-activity.editor-question-text')}
          />

          <QuestionTargetsField
            question={q}
            onChange={(targets) => updateQuestion(id, { targets })}
            promptStandards={promptStandards}
            pickerOpen={pickerOpen}
            onPickerOpenChange={setPickerOpen}
            editAnchor={tourAttr('video-activity.editor-targets-edit')}
          />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Type</label>
              <QuestionTypeSelect
                question={q}
                types={VA_EDITOR_TYPES}
                onSelect={(nextType: QuizQuestionType) => {
                  const updates = questionTypeChangeUpdates(q, nextType, {
                    mediaResponseAllowed: false,
                  });
                  if (updates) apply(updates);
                }}
                anchor={tourAttr('video-activity.editor-type-select')}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="va-question-time">
                Time in video
              </label>
              <input
                id="va-question-time"
                type="text"
                value={timeValue}
                onChange={(e) => {
                  const raw = e.target.value;
                  setTimestampInput(id, raw);
                  const secs = mmSsToSeconds(raw);
                  if (!isNaN(secs)) updateQuestion(id, { timestamp: secs });
                }}
                onBlur={() =>
                  setTimestampInput(
                    id,
                    secondsToMmSs(selectedQuestion.timestamp)
                  )
                }
                placeholder="01:30"
                className={`${inputClass} font-mono`}
                {...tourAttr('video-activity.editor-question-timestamp')}
              />
              <button
                type="button"
                onClick={() => {
                  const now = timelineRef.current?.getCurrentTime();
                  if (now != null) setTime(now);
                }}
                className="mt-1 text-xs font-semibold text-brand-blue-primary hover:underline"
                {...tourAttr('video-activity.editor-question-use-current-time')}
              >
                Use current time
              </button>
            </div>
            <div>
              <label className={labelClass}>Points</label>
              <DraftNumberInput
                integer
                min={1}
                value={q.points ?? 1}
                aria-label="Points"
                onCommit={(points) => updateQuestion(id, { points })}
                anchor={tourAttr('video-activity.editor-question-points')}
              />
            </div>
          </div>

          {q.type === 'MC' || q.type === 'MA' ? (
            <div className="space-y-1">
              <ChoiceOptionsEditor key={id} question={q} onChange={apply} />
              <NeedsAnswerNotice
                question={q}
                className="flex items-center gap-1 text-xxs font-bold text-amber-700"
              />
            </div>
          ) : (
            <FibAnswerField
              question={q}
              onChange={apply}
              answerAnchor={tourAttr('video-activity.editor-fib-answer')}
            />
          )}
        </div>
      </div>
    );
  },
  detailPanePropsEqual
);
