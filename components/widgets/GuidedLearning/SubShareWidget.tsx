/**
 * The Guided Learning widget a substitute sees.
 *
 * The teacher's library is metadata in their own `users/` tree with the set
 * itself in their Drive, and the widget's folders, assignments and live
 * sessions are all theirs, so a sub reads none of it. What they get is the set
 * the widget had open in its player, bundled at share time into the share's
 * `keys/` collection, which only the subs the share names may read (plan §3.1
 * A2). It renders in the same player the teacher previews with, so the sub can
 * step through the activity and see the answers; nothing is recorded, because
 * no `onAnswer` or `onStepEvent` is passed. A sub can also start it for one of
 * the shared classes, which runs in the teacher's own account (plan §3.6, D8).
 *
 * A building set is the exception the plan calls a reference: it lives in a
 * top-level collection any signed-in user can read, so it is never bundled and
 * the sub reads it themselves, exactly as they do today.
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Compass, Loader2, Lock } from 'lucide-react';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { SubLaunchPanel } from '@/components/subs/SubLaunchPanel';
import { useShareKey } from '@/hooks/useShareContent';
import { useAuth } from '@/context/useAuth';
import { normalizeGuidedLearningSet } from './utils/setMigration';
import type {
  GuidedLearningConfig,
  GuidedLearningSet,
  SubShareGuidedLearningPayload,
  WidgetData,
} from '@/types';

const LazySpinner: React.FC = () => (
  <div className="h-full flex items-center justify-center">
    <Loader2
      className="text-indigo-400 animate-spin"
      style={{ width: 'min(32px, 8cqmin)', height: 'min(32px, 8cqmin)' }}
    />
  </div>
);

const GuidedLearningPlayer = lazy(() =>
  import('./components/GuidedLearningPlayer').then((m) => ({
    default: m.GuidedLearningPlayer,
  }))
);

/** The building set this widget points at, read straight from Firestore. */
function useBuildingSet(setId: string | null | undefined, when: boolean) {
  const wanted = when && setId ? setId : null;
  const [state, setState] = useState<{
    id: string | null;
    set: GuidedLearningSet | null;
    loading: boolean;
  }>({ id: null, set: null, loading: false });

  // Reset while rendering rather than in an effect, so the widget never paints
  // one frame of the previous set's answer under the new set's id.
  if (state.id !== wanted) {
    setState({ id: wanted, set: null, loading: wanted !== null });
  }

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    getDoc(doc(db, 'building_guided_learning', wanted))
      .then((snap) => {
        if (!live) return;
        setState({
          id: wanted,
          set: snap.exists()
            ? normalizeGuidedLearningSet(snap.data() as GuidedLearningSet)
            : null,
          loading: false,
        });
      })
      .catch((err: unknown) => {
        logError('SubShareGuidedLearningWidget.buildingSet', err, {
          setId: wanted,
        });
        if (live) setState({ id: wanted, set: null, loading: false });
      });
    return () => {
      live = false;
    };
  }, [wanted]);

  return state.id === wanted
    ? { set: state.set, loading: state.loading }
    : { set: null, loading: wanted !== null };
}

export const SubShareGuidedLearningWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as GuidedLearningConfig;
  const { canAccessFeature } = useAuth();
  const { status, payload } = useShareKey<SubShareGuidedLearningPayload>(
    'guidedLearning',
    config.playerSetId
  );
  // No key of our own is the building-set case: either the share carried none
  // (`missing`) or it does not name this reader (`denied`), and a building set
  // is readable by any signed-in user either way.
  const building = useBuildingSet(
    config.playerSetId,
    status === 'missing' || status === 'denied'
  );

  const set = payload?.set ?? building.set;
  if (set) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <Suspense fallback={<LazySpinner />}>
            <GuidedLearningPlayer
              set={set as GuidedLearningSet}
              teacherMode
              playerV2={canAccessFeature('gl-player-v2')}
            />
          </Suspense>
        </div>
        {/* A building set is never bundled, so there is no key to start it
            from and no Launch to offer. */}
        {payload?.set && (
          <SubLaunchPanel
            kind="guidedLearning"
            widgetId={widget.id}
            itemId={config.playerSetId ?? null}
            label="guided activity"
          />
        )}
      </div>
    );
  }
  if (building.loading) {
    return (
      <ScaledEmptyState
        icon={Compass}
        title="Loading the guided activity"
        subtitle="Reading the copy your teacher shared."
      />
    );
  }
  if (status === 'denied') {
    return (
      <ScaledEmptyState
        icon={Lock}
        title="Not shared with you"
        subtitle="This guided activity is only for the substitutes your teacher named on the share."
      />
    );
  }
  if (status === 'loading') {
    return (
      <ScaledEmptyState
        icon={Compass}
        title="Loading the guided activity"
        subtitle="Reading the copy your teacher shared."
      />
    );
  }
  return (
    <ScaledEmptyState
      icon={Compass}
      title="No guided activity"
      subtitle="Your teacher did not leave one open on this widget."
    />
  );
};
