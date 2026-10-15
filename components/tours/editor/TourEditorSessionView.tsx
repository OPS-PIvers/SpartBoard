import React, { useEffect, useEffectEvent, useRef } from 'react';
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
  getTourEditPlayback,
  setTourEdit,
  subscribeTourEditPlayback,
  useTourEditPlayback,
  useTourEditTarget,
} from './tourEditStore';
import {
  buildPlaytest,
  keepsEarlier,
  notePlayback,
  type PlayedResult,
} from './playtest';
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
  const { canAccessFeature, user } = useAuth();
  const email = user?.email ?? '';
  const { addToast } = useDashboardActions();
  const canCopyForClaude =
    canAccessFeature('claude-connector') &&
    canAccessFeature('claude-connector-guided-learning');
  useEditorThumbnails(session);
  // Each step's latest result while the admin plays, saved as the tour's playtest (C9).
  const results = useRef(new Map<string, PlayedResult>());
  const atEnd = useRef(false);
  const notePlay = useEffectEvent(() => {
    const cur = getTourEdit();
    if (!cur || !session || !email) return;
    const pb = getTourEditPlayback();
    notePlayback(results.current, cur.set.steps, pb);
    const last = cur.set.steps.length - 1;
    if (pb.index < last) atEnd.current = false;
    else if (
      !atEnd.current &&
      !pb.jumping &&
      (pb.anchor === 'found' || pb.anchor === 'missing')
    ) {
      atEnd.current = true;
      session.setPlaytest(buildPlaytest(cur.set, results.current, email));
    }
  });
  useEffect(() => subscribeTourEditPlayback(notePlay), []);
  // Pick, Add step and Record leave the board's open menu open.
  useEffect(() => shieldTourUi(), []);
  if (!session || !target) return null;
  // A first failed save keeps the editor open with its alert; Close again while it shows closes anyway.
  const close = async () => {
    const cur = getTourEdit();
    if (
      cur &&
      email &&
      results.current.size > 0 &&
      !keepsEarlier(cur.set, results.current)
    )
      session.setPlaytest(buildPlaytest(cur.set, results.current, email));
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
