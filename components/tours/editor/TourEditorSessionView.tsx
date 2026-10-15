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
  newPlayLog,
  notePlayback,
  resultsFor,
} from './playtest';
import { saveTourPlaytest, useTourReview } from '@/components/tours/tourReview';
import { logError } from '@/utils/logError';
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
  const connector = canAccessFeature('claude-connector');
  const canCopyForClaude =
    connector && canAccessFeature('claude-connector-guided-learning');
  useEditorThumbnails(session);
  // Each step's latest result while the admin plays, saved as the tour's playtest for Claude (C9).
  const playLog = useRef(newPlayLog());
  const atEnd = useRef(false);
  const review = useTourReview(connector ? (target?.set.id ?? '') : '');
  // What the last save wrote, so closing right after reaching the end doesn't save it again.
  const lastSaved = useRef('');
  const savePlaytest = (set: NonNullable<typeof target>['set']) => {
    const results = resultsFor(playLog.current, set.steps);
    const written = JSON.stringify([playLog.current.key, ...results]);
    if (written === lastSaved.current) return;
    lastSaved.current = written;
    void saveTourPlaytest(set.id, buildPlaytest(set, results, email)).catch(
      (err: unknown) =>
        logError('TourEditorSessionView.playtest', err, { setId: set.id })
    );
  };
  const notePlay = useEffectEvent(() => {
    const cur = getTourEdit();
    if (!cur || !email || !connector) return;
    const pb = getTourEditPlayback();
    const key = playLog.current.key;
    const results = resultsFor(playLog.current, cur.set.steps);
    // An edit to the steps starts the record over.
    if (playLog.current.key !== key) atEnd.current = false;
    notePlayback(results, cur.set.steps, pb);
    const last = cur.set.steps.length - 1;
    if (pb.index < last) atEnd.current = false;
    else if (
      !atEnd.current &&
      !pb.jumping &&
      (pb.anchor === 'found' || pb.anchor === 'missing')
    ) {
      atEnd.current = true;
      savePlaytest(cur.set);
    }
  });
  useEffect(() => subscribeTourEditPlayback(notePlay), []);
  // Pick, Add step and Record leave the board's open menu open.
  useEffect(() => shieldTourUi(), []);
  if (!session || !target) return null;
  // A first failed save keeps the editor open with its alert; Close again while it shows closes anyway.
  const close = async () => {
    const cur = getTourEdit();
    const results = cur ? resultsFor(playLog.current, cur.set.steps) : null;
    if (
      cur &&
      results &&
      email &&
      connector &&
      results.size > 0 &&
      !keepsEarlier(cur.set, review?.playtest, results)
    )
      savePlaytest(cur.set);
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
