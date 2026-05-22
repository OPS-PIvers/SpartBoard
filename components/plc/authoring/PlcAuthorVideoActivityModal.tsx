/**
 * PlcAuthorVideoActivityModal — Stream B.
 *
 * Mounts VideoActivityEditorModal so a teacher can author a brand-new video
 * activity from scratch entirely inside the PLC. On save, calls saveActivity
 * to persist to Drive + Firestore, then opens PlcAssignmentConfigModal for
 * in-PLC assignment configuration.
 *
 * Flow: VideoActivityEditorModal.onSave → saveActivity → build AssignmentActivityRef
 *       → open PlcAssignmentConfigModal(kind='video-activity').
 */

import React, { useCallback, useState } from 'react';
import { VideoActivityEditorModal } from '@/components/widgets/VideoActivityWidget/components/VideoActivityEditorModal';
import { useAuth } from '@/context/useAuth';
import { useVideoActivity } from '@/hooks/useVideoActivity';
import type {
  Plc,
  VideoActivityBehaviorSettings,
  VideoActivityData,
} from '@/types';
import type { AssignmentActivityRef } from '@/hooks/useVideoActivityAssignments';
import { PlcAssignmentConfigModal } from '../assignments/PlcAssignmentConfigModal';

interface PlcAuthorVideoActivityModalProps {
  plc: Plc;
  isOpen: boolean;
  onClose: () => void;
}

export const PlcAuthorVideoActivityModal: React.FC<
  PlcAuthorVideoActivityModalProps
> = ({ plc, isOpen, onClose }) => {
  const { user } = useAuth();
  const { saveActivity } = useVideoActivity(user?.uid);

  const [activityRef, setActivityRef] = useState<AssignmentActivityRef | null>(
    null
  );
  const [savedBehavior, setSavedBehavior] =
    useState<VideoActivityBehaviorSettings | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  // Seed the new activity once on mount via lazy initializer so Date.now() and
  // crypto.randomUUID() are not called on every render.
  const [newActivity] = useState<VideoActivityData>(() => ({
    id: crypto.randomUUID(),
    title: '',
    youtubeUrl: '',
    questions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));

  const handleSave = useCallback(
    async (
      activity: VideoActivityData,
      behavior: VideoActivityBehaviorSettings
    ) => {
      const metadata = await saveActivity(activity, undefined, behavior);
      const ref: AssignmentActivityRef = {
        id: metadata.id,
        title: metadata.title,
        driveFileId: metadata.driveFileId,
        youtubeUrl: metadata.youtubeUrl,
        questions: activity.questions,
      };
      setActivityRef(ref);
      // Thread behavior down to the config modal so it can show the read-only
      // summary (VA Task 10 parity with PlcAuthorQuizModal's quizBehavior).
      setSavedBehavior(behavior);
      setConfigOpen(true);
    },
    [saveActivity]
  );

  const handleConfigClose = useCallback(() => {
    setConfigOpen(false);
    setActivityRef(null);
    setSavedBehavior(null);
    onClose();
  }, [onClose]);

  if (configOpen && activityRef) {
    return (
      <PlcAssignmentConfigModal
        plc={plc}
        kind="video-activity"
        activityRef={activityRef}
        vaBehavior={savedBehavior ?? undefined}
        isOpen
        onClose={handleConfigClose}
      />
    );
  }

  return (
    <VideoActivityEditorModal
      isOpen={isOpen}
      activity={newActivity}
      onClose={onClose}
      onSave={handleSave}
    />
  );
};
