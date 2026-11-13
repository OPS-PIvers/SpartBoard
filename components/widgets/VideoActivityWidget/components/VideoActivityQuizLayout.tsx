// Video Activity editor panes on the Quiz editor layout (docs/plans/shipped/VA_QUIZ_ALIGNMENT.md slice 2).
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  MousePointerClick,
  PlayCircle,
  Plus,
  Tag,
  Trash2,
  Wand2,
} from 'lucide-react';
import type { QuizQuestion, QuizQuestionType } from '@/types';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { extractYouTubeId } from '@/utils/youtube';
import { questionNeedsKey } from '@/utils/quizNeedsKey';
import {
  VA_EDITOR_TYPES,
  quizUpdatesToVa,
  vaToQuizQuestion,
} from '@/utils/vaQuestionAdapter';
import { useAuth } from '@/context/useAuth';
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
import { VideoActivityPictureField } from './VideoActivityPictureField';
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

const VA_TYPE_LABELS: Partial<Record<QuizQuestionType, string>> = {
  'free-response': 'Short Answer',
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
  prev.state.error === next.state.error;

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
      applyTargets,
      setShowAiPrompt,
      setTimestampInput,
      error,
    } = state;
    const [tagAllOpen, setTagAllOpen] = useState(false);

    const videoId = youtubeUrl.trim()
      ? extractYouTubeId(youtubeUrl.trim())
      : null;
    const hasUrl = youtubeUrl.trim().length > 0;

    const questionsRef = useRef(questions);
    useLayoutEffect(() => {
      questionsRef.current = questions;
    });
    // A marker opens its question and moves the video there.
    const handleSelect = useCallback(
      (id: string) => {
        setSelectedId(id);
        const q = questionsRef.current.find((x) => x.id === id);
        if (q) timelineRef.current?.seekTo(q.timestamp);
      },
      [setSelectedId, timelineRef]
    );
    const handleAdd = () =>
      addQuestionAtTime(timelineRef.current?.getCurrentTime() ?? 0);
    const needsAnswerIds = useMemo(
      () =>
        new Set(
          questions
            .filter((q) => questionNeedsKey(vaToQuizQuestion(q)))
            .map((q) => q.id)
        ),
      [questions]
    );

    const actions = (
      <>
        {questions.length > 1 && (
          <button
            type="button"
            onClick={() => setTagAllOpen(true)}
            {...tourAttr('video-activity.editor-bulk-tag')}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
          >
            <Tag className="w-3.5 h-3.5 text-slate-500" />
            Tag all
          </button>
        )}
        {aiEnabled && (
          <button
            type="button"
            onClick={() => setShowAiPrompt(true)}
            disabled={!hasUrl}
            {...tourAttr('video-activity.editor-draft-ai')}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      </>
    );

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

        <div className="flex-1 min-h-0 px-5 pt-4 pb-4 bg-slate-50">
          {videoId ? (
            <Timeline
              videoId={videoId}
              questions={questions}
              onAddAtTime={addQuestionAtTime}
              onSelectQuestion={handleSelect}
              onMarkerDrag={(id, seconds) => {
                setTimestampInput(id, secondsToMmSs(seconds));
                updateQuestion(id, { timestamp: seconds });
              }}
              activeQuestionId={selectedId ?? undefined}
              onDurationChange={setVideoDurationSeconds}
              handleRef={timelineRef}
              needsAnswerIds={needsAnswerIds}
              actions={actions}
            />
          ) : (
            <div className="flex h-full flex-col gap-2">
              <div className="flex-1 min-h-0 w-full rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-center text-slate-500 px-4">
                <PlayCircle className="w-8 h-8 text-red-400 mb-2" />
                <p className="text-sm font-bold text-slate-700">
                  Paste a YouTube URL above
                </p>
                <p className="text-xs">
                  The player and timeline will appear here.
                </p>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                {actions}
                <button
                  type="button"
                  onClick={handleAdd}
                  {...tourAttr('video-activity.editor-add-question')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-lg text-xs font-bold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
            </div>
          )}
        </div>

        {tagAllOpen && (
          <TargetPicker
            open
            initial={[]}
            allowReplace
            title={`Tag all ${questions.length} questions`}
            onApply={(tags, mode) => {
              applyTargets(
                questions.map((q) => q.id),
                tags,
                mode
              );
              setTagAllOpen(false);
            }}
            onClose={() => setTagAllOpen(false)}
          />
        )}
      </div>
    );
  },
  contextPanePropsEqual
);

// ─── Detail pane ─────────────────────────────────────────────────────────────

const detailPanePropsEqual = (prev: PaneProps, next: PaneProps): boolean =>
  prev.timelineRef === next.timelineRef &&
  prev.state.selectedId === next.state.selectedId &&
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
      setSelectedId,
      deleteQuestion,
      duplicateQuestion,
    } = state;
    const { canAccessFeature } = useAuth();
    const promptFormatOn = canAccessFeature('quiz-prompt-formatting');
    const [pickerOpen, setPickerOpen] = useState(false);
    const promptRef = useRef<HTMLTextAreaElement>(null);
    const promptTextRef = useRef(selectedQuestion?.text);
    // The formatted prompt box has no textarea, so fall back to the saved text.
    const readPrompt = useCallback(
      () => promptRef.current?.value ?? promptTextRef.current,
      []
    );
    const targetsRef = useRef(selectedQuestion?.targets);
    useLayoutEffect(() => {
      targetsRef.current = selectedQuestion?.targets;
      promptTextRef.current = selectedQuestion?.text;
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

    const goTo = (qid: string) => {
      setSelectedId(qid);
      const target = questions.find((x) => x.id === qid);
      if (target) timelineRef.current?.seekTo(target.timestamp);
    };

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
    const isShortAnswer = selectedQuestion.type === 'SA';
    const timeValue =
      timestampInputs[id] ?? secondsToMmSs(selectedQuestion.timestamp);

    return (
      <div className="flex flex-col h-full">
        <div className="px-5 py-3 border-b border-slate-200 bg-white sticky top-0 z-10 space-y-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 font-bold truncate">
              Question {selectedIndex + 1} of {questions.length}
              <span className="mx-1.5">·</span>
              {VA_TYPE_LABELS[q.type] ?? typeMeta?.label ?? q.type}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedIndex <= 0}
              onClick={() => goTo(questions[selectedIndex - 1].id)}
              aria-label="Previous question"
              title="Previous question"
              {...tourAttr('video-activity.editor-question-prev')}
              className="shrink-0 touch-target-expand relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <select
              value={id}
              onChange={(e) => goTo(e.target.value)}
              aria-label="Jump to question"
              {...tourAttr('video-activity.editor-question-jump')}
              className={`${inputClass} min-w-0 flex-1 truncate font-semibold`}
            >
              {questions.map((x, i) => (
                <option key={x.id} value={x.id}>
                  {`${i + 1}. ${secondsToMmSs(x.timestamp)}  ${x.text.trim() || 'Untitled question'}${questionNeedsKey(vaToQuizQuestion(x)) ? ' (needs answer)' : ''}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={selectedIndex >= questions.length - 1}
              onClick={() => goTo(questions[selectedIndex + 1].id)}
              aria-label="Next question"
              title="Next question"
              {...tourAttr('video-activity.editor-question-next')}
              className="shrink-0 touch-target-expand relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="flex shrink-0 items-center gap-2 border-l border-slate-200 pl-2">
              <button
                type="button"
                onClick={() => duplicateQuestion(id)}
                aria-label="Duplicate question"
                title="Duplicate question"
                {...tourFieldAttr(
                  'video-activity.editor-question-duplicate',
                  'video-activity',
                  String(selectedIndex + 1)
                )}
                className="touch-target-expand relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-blue-primary transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next =
                    questions[selectedIndex + 1] ??
                    questions[selectedIndex - 1];
                  deleteQuestion(id);
                  if (next) goTo(next.id);
                }}
                aria-label="Delete question"
                title="Delete question"
                {...tourFieldAttr(
                  'video-activity.editor-question-delete',
                  'video-activity',
                  id
                )}
                className="touch-target-expand relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
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
            promptFormat={promptFormatOn}
          />

          <VideoActivityPictureField
            fileId={selectedQuestion?.imageDriveFileId}
            onRemove={() => updateQuestion(id, { imageDriveFileId: undefined })}
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
                labels={VA_TYPE_LABELS}
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

          {isShortAnswer ? null : q.type === 'MC' || q.type === 'MA' ? (
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
