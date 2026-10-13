import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/useAuth';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import {
  buildClaudePrompt,
  isDevProject,
} from '@/components/widgets/GuidedLearning/utils/claudePrompt';
import { shieldTourUi } from '@/components/tours/popups';
import {
  clearTourEdit,
  getTourEdit,
  setTourEdit,
  useTourEditPlayback,
  useTourEditTarget,
} from './tourEditStore';
import { useTourEditorSession } from './useTourEditorSession';
import { TourEditorPanel } from './TourEditorPanel';
import { TourEditorSettings } from './TourEditorSettings';
import { useEditorThumbnails } from './useEditorThumbnails';

/** The open editor: its session, wired to the docked panel. */
const TourEditorSessionView: React.FC = () => {
  const session = useTourEditorSession();
  const playback = useTourEditPlayback();
  const target = useTourEditTarget();
  const { t } = useTranslation();
  const { canAccessFeature } = useAuth();
  const { addToast } = useDashboardActions();
  const canCopyForClaude =
    canAccessFeature('claude-connector') &&
    canAccessFeature('claude-connector-guided-learning');
  useEditorThumbnails(session);
  // Pick, Add step and Record leave the board's open menu open.
  useEffect(() => shieldTourUi(), []);
  if (!session || !target) return null;
  // A first failed save keeps the editor open with its alert; Close again while it shows closes anyway.
  const close = async () => {
    const alerted = session.saveState === 'error';
    const saved = await session.flush();
    if (saved || alerted || session.isConflicted()) clearTourEdit();
  };
  // Saves first so Claude reads exactly what the admin sees.
  const copyForClaude = async (stepId?: string) => {
    if (!(await session.flush())) {
      addToast(t('glStudio.copyForClaudeFailed'), 'error');
      return;
    }
    const set = getTourEdit()?.set ?? session.set;
    try {
      await navigator.clipboard.writeText(
        buildClaudePrompt(
          set,
          stepId ? { kind: 'step', stepId } : { kind: 'activity' },
          { dev: isDevProject() }
        )
      );
      addToast(t('glStudio.copiedForClaude'), 'success');
    } catch {
      addToast(t('glStudio.clipboardFailed'), 'error');
    }
  };
  return (
    <TourEditorPanel
      session={session}
      playback={playback}
      readAloud={{
        on: target.readAloud,
        onToggle: () => {
          const cur = getTourEdit();
          if (cur) setTourEdit({ ...cur, readAloud: !cur.readAloud });
        },
      }}
      onClose={() => void close()}
      settings={<TourEditorSettings session={session} />}
      onCopyForClaude={
        canCopyForClaude ? (stepId) => void copyForClaude(stepId) : undefined
      }
    />
  );
};

export default TourEditorSessionView;
