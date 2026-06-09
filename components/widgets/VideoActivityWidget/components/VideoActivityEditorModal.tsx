/**
 * VideoActivityEditorModal — full-screen editor for a Video Activity.
 *
 * Wraps the two-pane EditorWorkspace: left context pane has the title +
 * YouTube URL + Timeline + sortable question list; right detail pane has
 * the editor for the currently-selected question (timestamp / type /
 * prompt / answers).
 */

import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  LibraryFolder,
  VideoActivityBehaviorSettings,
  VideoActivityData,
  VideoActivityQuestion,
} from '@/types';
import { EditorWorkspace } from '@/components/common/EditorWorkspace';
import { useAuth } from '@/context/useAuth';
import { VideoActivityBehaviorSettingsPanel } from '@/components/common/library/VideoActivityBehaviorSettingsPanel';
import {
  VideoActivityAiOverlay,
  VideoActivityEditorContextPane,
  VideoActivityEditorDetailPane,
} from './VideoActivityEditor';
import { useVideoActivityEditorState } from './useVideoActivityEditorState';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';

interface VideoActivityEditorModalProps {
  isOpen: boolean;
  activity: VideoActivityData | null;
  onClose: () => void;
  onSave: (
    updated: VideoActivityData,
    behavior: VideoActivityBehaviorSettings
  ) => Promise<void>;
  /** Video Activity widget-level AI toggle (from VideoActivityGlobalConfig.aiEnabled). */
  aiEnabled?: boolean;
  /** Admin override — admins can use AI even when the widget-level toggle is off. */
  isAdmin?: boolean;
  /** Optional folder picker. When `folders` and `onFolderChange` are both provided, a folder-select field is shown. */
  folders?: LibraryFolder[];
  folderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
  /**
   * Seed behavior for the Settings tab. For an existing activity, pass
   * `getVideoActivityBehavior(meta)`; for a new activity, omit (defaults to
   * `DEFAULT_VA_BEHAVIOR`).
   */
  behavior?: VideoActivityBehaviorSettings;
}

const arrEq = (a?: string[], b?: string[]): boolean => {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
};

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
      qa.type !== qb.type ||
      (qa.points ?? 1) !== (qb.points ?? 1) ||
      (qa.allowPartialCredit ?? false) !== (qb.allowPartialCredit ?? false) ||
      !arrEq(qa.incorrectAnswers, qb.incorrectAnswers) ||
      !arrEq(qa.acceptableVariants, qb.acceptableVariants)
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Shallow-equal over the union of both objects' keys. Sufficient for
 * session-options objects, whose values are all primitives. Matches the
 * previous `JSON.stringify(a) !== JSON.stringify(b)` dirty-check semantics
 * (explicit `undefined` == absent) without serializing on every keystroke.
 */
const shallowRecordEqual = <T extends object>(a: T, b: T): boolean => {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof T)[]);
  for (const key of keys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
};

/** Field-by-field VideoActivityBehaviorSettings compare for the isDirty check. */
const videoActivityBehaviorSettingsEqual = (
  a: VideoActivityBehaviorSettings,
  b: VideoActivityBehaviorSettings
): boolean =>
  a === b ||
  (a.sessionMode === b.sessionMode &&
    a.attemptLimit === b.attemptLimit &&
    shallowRecordEqual(a.sessionOptions, b.sessionOptions));

export const VideoActivityEditorModal: React.FC<
  VideoActivityEditorModalProps
> = ({
  isOpen,
  activity,
  onClose,
  onSave,
  aiEnabled = true,
  isAdmin = false,
  folders,
  folderId,
  onFolderChange,
  behavior: behaviorSeed,
}) => {
  const { canAccessFeature } = useAuth();
  const canUseAi =
    canAccessFeature('gemini-functions') && (aiEnabled || isAdmin);

  const editorState = useVideoActivityEditorState({ activity });

  const {
    title,
    youtubeUrl,
    questions,
    totalPoints,
    saving,
    setSaving,
    setError,
    originalTitle,
    originalYoutubeUrl,
    originalQuestions,
  } = editorState;

  // ─── Behavior settings state ─────────────────────────────────────────────
  const [editorTab, setEditorTab] = useState<'questions' | 'settings'>(
    'questions'
  );
  const [behavior, setBehavior] = useState<VideoActivityBehaviorSettings>(
    () => behaviorSeed ?? DEFAULT_VA_BEHAVIOR
  );
  const [originalBehavior, setOriginalBehavior] =
    useState<VideoActivityBehaviorSettings>(
      () => behaviorSeed ?? DEFAULT_VA_BEHAVIOR
    );

  // Re-seed behavior when the activity being edited changes (e.g. user closes
  // editor and opens a different activity without unmounting the modal). Adjust
  // state while rendering (see CLAUDE.md), keyed on activity?.id only so a fresh
  // behaviorSeed object from a parent re-render doesn't clobber in-progress
  // edits.
  const [seededActivityId, setSeededActivityId] = useState(activity?.id);
  if (seededActivityId !== activity?.id) {
    setSeededActivityId(activity?.id);
    const seed = behaviorSeed ?? DEFAULT_VA_BEHAVIOR;
    setBehavior(seed);
    setOriginalBehavior(seed);
  }

  // Reference equality first — setState produces a new questions array on
  // every edit, so the deep walk only runs as a fallback.
  const isDirty = useMemo(
    () =>
      title !== originalTitle ||
      youtubeUrl !== originalYoutubeUrl ||
      !(
        questions === originalQuestions ||
        questionsEqual(questions, originalQuestions)
      ) ||
      !videoActivityBehaviorSettingsEqual(behavior, originalBehavior),
    [
      title,
      originalTitle,
      youtubeUrl,
      originalYoutubeUrl,
      questions,
      originalQuestions,
      behavior,
      originalBehavior,
    ]
  );

  const handleSave = async () => {
    if (!activity) return;
    const errors: string[] = [];
    if (!title.trim()) errors.push('Activity title is required');
    if (!youtubeUrl.trim()) errors.push('YouTube URL is required');
    if (questions.length === 0) errors.push('Add at least one question');
    questions.forEach((q, i) => {
      if (!q.text.trim()) errors.push(`Question ${i + 1}: text is required`);
      const type = q.type ?? 'MC';
      if (type === 'MA') {
        const correctCount = q.correctAnswer
          .split('|')
          .map((s) => s.trim())
          .filter((s) => s.length > 0).length;
        const incorrectCount = (q.incorrectAnswers ?? []).filter(
          (s) => s.trim().length > 0
        ).length;
        if (correctCount + incorrectCount === 0) {
          errors.push(`Question ${i + 1}: add at least one option`);
        } else if (correctCount === 0) {
          errors.push(`Question ${i + 1}: select at least one correct option`);
        }
        const hasPipe = [
          ...q.correctAnswer.split('|'),
          ...(q.incorrectAnswers ?? []),
        ].some((s) => s.includes('|'));
        if (hasPipe) {
          errors.push(
            `Question ${i + 1}: option text cannot contain the | character`
          );
        }
      } else if (!q.correctAnswer.trim()) {
        errors.push(`Question ${i + 1}: correct answer is required`);
      }
    });

    // No strict-monotonic check — questions are auto-sorted by timestamp on
    // every edit, so they're always in a valid order at save time. The only
    // remaining risk is duplicate timestamps, which we resolve by nudging.
    const seen = new Set<number>();
    const finalQuestions = questions.map((q) => {
      let ts = q.timestamp;
      while (seen.has(ts)) ts += 1;
      seen.add(ts);
      return ts === q.timestamp ? q : { ...q, timestamp: ts };
    });

    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(
        {
          ...activity,
          title: title.trim(),
          youtubeUrl: youtubeUrl.trim(),
          questions: finalQuestions,
          updatedAt: Date.now(),
        },
        behavior
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Stable chrome elements so the shell's memoized header/footer don't
  // re-render on question-content keystrokes.
  const subtitle = useMemo(
    () => (
      <span>
        {questions.length} {questions.length === 1 ? 'question' : 'questions'} •{' '}
        {totalPoints} {totalPoints === 1 ? 'point' : 'points'}
      </span>
    ),
    [questions.length, totalPoints]
  );
  const { setShowAiPrompt } = editorState;
  const hasYoutubeUrl = Boolean(youtubeUrl.trim());
  const footerExtras = useMemo(
    () =>
      canUseAi ? (
        <button
          onClick={() => setShowAiPrompt(true)}
          disabled={!hasYoutubeUrl}
          className="h-[36px] px-3 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-2 active:scale-95"
          title={
            hasYoutubeUrl
              ? 'Generate questions with AI'
              : 'Paste a YouTube URL first'
          }
        >
          <Sparkles className="w-4 h-4" />
          Draft with AI
        </button>
      ) : null,
    [canUseAi, hasYoutubeUrl, setShowAiPrompt]
  );

  if (!activity) return null;

  return (
    <EditorWorkspace
      key={activity.id}
      isOpen={isOpen}
      title={title.trim() || (originalTitle ? 'Edit Activity' : 'New Activity')}
      subtitle={subtitle}
      isDirty={isDirty}
      isSaving={saving}
      onSave={handleSave}
      onClose={onClose}
      saveLabel="Save Activity"
      footerExtras={footerExtras}
      contextRatio={56}
      contextPaneClassName="bg-slate-50 border-r border-slate-200 !overflow-hidden"
      contextPane={
        <div className="flex flex-col h-full">
          {/* Questions / Settings segmented tab toggle */}
          <div className="px-4 pt-3 pb-0 border-b border-slate-200 bg-white shrink-0 flex gap-1">
            {(['questions', 'settings'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setEditorTab(tab)}
                className={`px-3 py-2 rounded-t-lg text-xs font-black uppercase tracking-wider transition-colors ${
                  editorTab === tab
                    ? 'bg-brand-blue-primary text-white'
                    : 'text-slate-500 hover:text-brand-blue-primary hover:bg-brand-blue-lighter/30'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {editorTab === 'questions' ? (
            <VideoActivityEditorContextPane
              state={editorState}
              folders={folders}
              folderId={folderId}
              onFolderChange={onFolderChange}
            />
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 px-5 py-5 space-y-5">
              <VideoActivityBehaviorSettingsPanel
                value={behavior}
                onChange={setBehavior}
              />
            </div>
          )}
        </div>
      }
      detailPane={
        editorTab === 'questions' ? (
          <VideoActivityEditorDetailPane state={editorState} />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm px-8 text-center">
            <p>
              Settings saved with the activity. They become the default when you
              assign it.
            </p>
          </div>
        )
      }
      overlay={<VideoActivityAiOverlay state={editorState} />}
    />
  );
};
