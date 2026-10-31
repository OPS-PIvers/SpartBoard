/**
 * VideoActivityEditorModal — full-screen editor for a Video Activity.
 *
 * Wraps the two-pane EditorWorkspace: left context pane has the
 * YouTube URL + Timeline + sortable question list; right detail pane has
 * the editor for the currently-selected question (timestamp / type /
 * prompt / answers).
 */

import { tourAttr, tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Wand2 } from 'lucide-react';
import {
  LibraryFolder,
  VideoActivityBehaviorSettings,
  VideoActivityData,
  VideoActivityQuestion,
} from '@/types';
import { EditorWorkspace } from '@/components/common/EditorWorkspace';
import { FolderSelectField } from '@/components/common/library/FolderSelectField';
import { videoActivityIncompleteReason } from '@/utils/activityCompleteness';
import { useAuth } from '@/context/useAuth';
import { VideoActivityBehaviorSettingsPanel } from '@/components/common/library/VideoActivityBehaviorSettingsPanel';
import {
  VideoActivityAiOverlay,
  VideoActivityEditorContextPane,
  VideoActivityEditorDetailPane,
} from './VideoActivityEditor';
import { useVideoActivityEditorState } from './useVideoActivityEditorState';
import {
  VideoActivityQuizContextPane,
  VideoActivityQuizDetailPane,
} from './VideoActivityQuizLayout';
import type { TimelineHandle } from './Timeline';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';
import { notesEqual } from '@/utils/videoActivityClip';
import { ImportAttributionLine } from '@/components/import/ImportAttributionLine';

interface VideoActivityEditorModalProps {
  isOpen: boolean;
  activity: VideoActivityData | null;
  onClose: () => void;
  onSave: (
    updated: VideoActivityData,
    behavior: VideoActivityBehaviorSettings
  ) => Promise<void>;
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
  /**
   * Off for flows whose save publishes rather than persists — PLC authoring
   * moves on to assignment config, and a PLC edit syncs to teammates.
   */
  autosave?: boolean;
  /** A YouTube import for a teacher with `video-import-ai`: open the AI prompt straight away (D35). */
  startWithAi?: boolean;
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
      qa.imageDriveFileId !== qb.imageDriveFileId ||
      (qa.points ?? 1) !== (qb.points ?? 1) ||
      (qa.allowPartialCredit ?? false) !== (qb.allowPartialCredit ?? false) ||
      !arrEq(qa.incorrectAnswers, qb.incorrectAnswers) ||
      !arrEq(qa.acceptableVariants, qb.acceptableVariants) ||
      (qa.optionOrder ?? []).join() !== (qb.optionOrder ?? []).join() ||
      !arrEq(
        qa.targets?.map((t) => t.id),
        qb.targets?.map((t) => t.id)
      )
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
 * Tolerates a missing object on either side (legacy Firestore docs may lack
 * sessionOptions despite the type) — the old stringify compare did too.
 */
const shallowRecordEqual = <T extends object>(
  a: T | undefined,
  b: T | undefined
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
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
  autosave = true,
  folders,
  folderId,
  onFolderChange,
  behavior: behaviorSeed,
  startWithAi = false,
}) => {
  const { canAccessFeature } = useAuth();
  const canUseAi =
    canAccessFeature('gemini-functions') &&
    canAccessFeature('video-activity-ai');
  const quizLayout = canAccessFeature('va-quiz-alignment');
  const stopsEnabled = canAccessFeature('video-activity-stops');
  const timelineRef = useRef<TimelineHandle>(null);

  const editorState = useVideoActivityEditorState({
    activity,
    startWithAi: startWithAi && canUseAi,
  });

  const {
    title,
    setTitle,
    youtubeUrl,
    questions,
    totalPoints,
    saving,
    setSaving,
    setError,
    originalTitle,
    originalYoutubeUrl,
    originalQuestions,
    clip,
    originalClip,
    notes,
    originalNotes,
  } = editorState;

  // ─── Behavior settings state ─────────────────────────────────────────────
  const [pickedTab, setEditorTab] = useState<'questions' | 'settings'>(
    'questions'
  );
  // Flag on: the rules moved to the assignment, so there is no Settings tab.
  const editorTab = quizLayout ? 'questions' : pickedTab;
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
      clip?.start !== originalClip?.start ||
      clip?.end !== originalClip?.end ||
      !notesEqual(notes, originalNotes) ||
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
      clip,
      originalClip,
      notes,
      originalNotes,
      questions,
      originalQuestions,
      behavior,
      originalBehavior,
    ]
  );

  // What still has to be filled in before the activity can be assigned. It no
  // longer gates the save: autosave persists whatever is on screen.
  const incompleteNotice = useMemo(
    () =>
      videoActivityIncompleteReason({
        title,
        youtubeUrl,
        questions,
        ...(stopsEnabled ? { clip, notes } : {}),
      }),
    [title, youtubeUrl, questions, clip, notes, stopsEnabled]
  );

  // New identity on every draft edit — the autosave quiet period restarts on it.
  const draftToken = useMemo(
    () => [title, youtubeUrl, clip, notes, questions, behavior],
    [title, youtubeUrl, clip, notes, questions, behavior]
  );

  // Persist only — the shell owns closing.
  const persistDraft = useCallback(async () => {
    if (!activity) return;
    // Without autosave, Save is a submit: it still refuses an incomplete
    // activity and closes on success, because no later write will fix either.
    if (!autosave && incompleteNotice) {
      setError(incompleteNotice);
      return;
    }
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
    setSaving(true);
    setError(null);
    try {
      await onSave(
        {
          ...activity,
          title: title.trim(),
          youtubeUrl: youtubeUrl.trim(),
          clip,
          notes: notes.length > 0 ? notes : undefined,
          questions: finalQuestions,
          updatedAt: Date.now(),
        },
        behavior
      );
      if (!autosave) onClose();
    } finally {
      setSaving(false);
    }
  }, [
    activity,
    autosave,
    incompleteNotice,
    onClose,
    questions,
    title,
    youtubeUrl,
    clip,
    notes,
    behavior,
    onSave,
    setSaving,
    setError,
  ]);

  // Stable chrome elements so the shell's memoized header/footer don't
  // re-render on question-content keystrokes.
  const importedFrom = activity?.importedFrom;
  const subtitle = useMemo(
    () => (
      <>
        <span>
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}{' '}
          • {totalPoints} {totalPoints === 1 ? 'point' : 'points'}
        </span>
        {importedFrom && <ImportAttributionLine attribution={importedFrom} />}
      </>
    ),
    [questions.length, totalPoints, importedFrom]
  );
  const headerExtras = useMemo(
    () =>
      folders && onFolderChange ? (
        <FolderSelectField
          variant="header"
          folders={folders}
          value={folderId ?? null}
          onChange={onFolderChange}
          anchor={tourAttr('video-activity.editor-folder')}
        />
      ) : null,
    [folders, folderId, onFolderChange]
  );
  const { setShowAiPrompt } = editorState;
  const hasYoutubeUrl = Boolean(youtubeUrl.trim());
  const footerExtras = useMemo(
    () =>
      canUseAi && !quizLayout ? (
        <button
          {...tourAttr('video-activity.editor-draft-ai')}
          onClick={() => setShowAiPrompt(true)}
          disabled={!hasYoutubeUrl}
          className="h-[36px] px-3 bg-white border border-slate-200 hover:border-brand-blue-light text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            hasYoutubeUrl
              ? 'Generate questions with AI'
              : 'Paste a YouTube URL first'
          }
        >
          <Wand2 className="w-4 h-4" />
          Draft with AI
        </button>
      ) : null,
    [canUseAi, quizLayout, hasYoutubeUrl, setShowAiPrompt]
  );

  if (!activity) return null;

  return (
    <EditorWorkspace
      tourScope="video-activity"
      saveAnchor={tourTypeAttr('editor.save', 'video-activity')}
      key={activity.id}
      isOpen={isOpen}
      title={title}
      onTitleChange={setTitle}
      titlePlaceholder="Activity title"
      headerExtras={headerExtras}
      subtitle={subtitle}
      isDirty={isDirty}
      isSaving={saving}
      onSave={persistDraft}
      autosave={autosave ? { draftToken, resetKey: activity?.id } : undefined}
      incompleteNotice={incompleteNotice}
      onClose={onClose}
      saveLabel="Save Activity"
      footerExtras={footerExtras}
      contextRatio={56}
      contextPaneClassName="bg-slate-50 border-r border-slate-200 overflow-hidden!"
      contextPane={
        <div className="flex flex-col h-full">
          {/* Questions / Settings segmented tab toggle */}
          {!quizLayout && (
            <div className="px-4 pt-3 pb-0 border-b border-slate-200 bg-white shrink-0 flex gap-1">
              {(['questions', 'settings'] as const).map((tab) => (
                <button
                  {...tourFieldAttr(
                    'video-activity.editor-tab',
                    'video-activity',
                    tab
                  )}
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
          )}

          {editorTab === 'questions' ? (
            quizLayout ? (
              <VideoActivityQuizContextPane
                state={editorState}
                timelineRef={timelineRef}
                aiEnabled={canUseAi}
              />
            ) : (
              <VideoActivityEditorContextPane state={editorState} />
            )
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
          quizLayout ? (
            <VideoActivityQuizDetailPane
              state={editorState}
              timelineRef={timelineRef}
            />
          ) : (
            <VideoActivityEditorDetailPane state={editorState} />
          )
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm px-8 text-center">
            <p>Defaults for new assignments.</p>
          </div>
        )
      }
      overlay={<VideoActivityAiOverlay state={editorState} />}
    />
  );
};
