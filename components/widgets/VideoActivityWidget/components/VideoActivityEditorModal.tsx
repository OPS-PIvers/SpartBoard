/**
 * VideoActivityEditorModal — full-screen editor for a Video Activity.
 *
 * Wraps the two-pane EditorWorkspace on the Quiz editor layout: left context
 * pane has the YouTube URL + Timeline + question list; right detail pane has
 * the editor for the currently-selected question.
 */

import { tourAttr, tourTypeAttr } from '@/config/tourAnchors';
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { VideoActivityAiOverlay } from './VideoActivityEditor';
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
  /** The activity's saved behavior, passed back unchanged on save; omit for `DEFAULT_VA_BEHAVIOR`. */
  behavior?: VideoActivityBehaviorSettings;
  /**
   * Off for flows whose save publishes rather than persists — PLC authoring
   * moves on to assignment config, and a PLC edit syncs to teammates.
   */
  autosave?: boolean;
  /** A YouTube import for a teacher with `video-import-ai`: open the AI prompt straight away (D35). */
  startWithAi?: boolean;
  /** What an import couldn't bring over, said once under the attribution line. */
  importLeftOut?: string | null;
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
  importLeftOut = null,
}) => {
  const { canAccessFeature } = useAuth();
  const canUseAi =
    canAccessFeature('gemini-functions') &&
    canAccessFeature('video-activity-ai');
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

  // Rules live on each assignment; the seed is saved back untouched, re-seeded per activity.
  const [behavior, setBehavior] = useState<VideoActivityBehaviorSettings>(
    () => behaviorSeed ?? DEFAULT_VA_BEHAVIOR
  );
  const [seededActivityId, setSeededActivityId] = useState(activity?.id);
  if (seededActivityId !== activity?.id) {
    setSeededActivityId(activity?.id);
    setBehavior(behaviorSeed ?? DEFAULT_VA_BEHAVIOR);
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
      ),
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
        {importLeftOut && (
          <span className="text-amber-700">{importLeftOut}</span>
        )}
      </>
    ),
    [questions.length, totalPoints, importedFrom, importLeftOut]
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
      contextRatio={56}
      contextPaneClassName="bg-slate-50 border-r border-slate-200 overflow-hidden!"
      contextPane={
        <div className="flex flex-col h-full">
          <VideoActivityQuizContextPane
            state={editorState}
            timelineRef={timelineRef}
            aiEnabled={canUseAi}
          />
        </div>
      }
      detailPane={
        <VideoActivityQuizDetailPane
          state={editorState}
          timelineRef={timelineRef}
        />
      }
      overlay={<VideoActivityAiOverlay state={editorState} />}
    />
  );
};
