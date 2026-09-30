import React, { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useGradebookRoster } from '@/hooks/useGradebookRoster';
import { useGradebookSource } from '@/hooks/useGradebookSource';
import { useGradebookSettings } from '@/hooks/useGradebookSettings';
import { resolveScale } from '@/utils/gradebook/gradebookCore';
import { isGradebookRoster } from '@/utils/gradebookRoster';
import { spaNavigate, spaReplace } from '@/utils/plcPath';
import {
  buildGradebookPath,
  type ParsedGradebookPath,
} from '@/utils/gradebookPath';
import { GradebookProvider } from './GradebookProvider';
import { GradebookEmpty, GradebookPage, GradebookShell } from './GradebookPage';

const LAST_ROSTER_KEY = 'gradebook-last-roster';

function readLastRoster(): string | null {
  try {
    return window.localStorage.getItem(LAST_ROSTER_KEY);
  } catch {
    return null;
  }
}

/** `/gradebook...` entry point, mounted over the board inside the teacher shell (D4, D5, D8). */
export const GradebookRouteHost: React.FC<{ parsed: ParsedGradebookPath }> = ({
  parsed,
}) => {
  const { user, orgId, selectedBuildings, canAccessFeature } = useAuth();
  const { rosters: allRosters, addToast } = useDashboard();
  const enabled = canAccessFeature('gradebook');
  const rosters = useMemo(
    () =>
      allRosters
        .filter(isGradebookRoster)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allRosters]
  );
  const roster = rosters.find((r) => r.id === parsed.rosterId) ?? null;

  // Normalise a bare or stale URL onto a real class (history is the external system).
  const fallbackId =
    rosters.find((r) => r.id === readLastRoster())?.id ??
    rosters[0]?.id ??
    null;
  const needsRedirect = enabled && !roster && fallbackId !== null;
  useEffect(() => {
    if (needsRedirect && fallbackId) spaReplace(buildGradebookPath(fallbackId));
  }, [needsRedirect, fallbackId]);
  useEffect(() => {
    if (!roster) return;
    try {
      window.localStorage.setItem(LAST_ROSTER_KEY, roster.id);
    } catch {
      // Storage can be blocked; the class just isn't remembered.
    }
  }, [roster]);

  const join = useGradebookRoster(roster, enabled);
  // One resolver for the grid and the settings modal (D16 fallback order).
  const gbSettings = useGradebookSettings(enabled);
  const body = gbSettings.configForClass(roster?.id ?? '').body;
  const plcScale =
    body.scale.source === 'plc'
      ? (gbSettings.scaleOptions.find(
          (o) =>
            body.scale.source === 'plc' && o.value === `plc:${body.scale.plcId}`
        )?.scale ?? null)
      : null;
  const source = useGradebookSource(
    enabled && user ? user.uid : null,
    roster?.id ?? null,
    orgId,
    selectedBuildings,
    {
      settings: body,
      scale:
        plcScale ?? resolveScale(body.scale, gbSettings.districtScale, null),
      loading: gbSettings.loading,
    }
  );
  const toast = useCallback(
    (message: string, undo?: () => void) =>
      addToast(
        message,
        'info',
        undo ? { label: 'Undo', onClick: undo } : undefined
      ),
    [addToast]
  );
  const close = useCallback(() => spaNavigate('/'), []);

  if (!enabled || !user) {
    return (
      <GradebookShell tab="grid" rosterId={null} onClose={close}>
        <GradebookEmpty title="Gradebook is not available" />
      </GradebookShell>
    );
  }
  if (!roster) {
    return (
      <GradebookShell tab="grid" rosterId={null} onClose={close}>
        {rosters.length === 0 && (
          <GradebookEmpty
            title="No ClassLink classes"
            body="Import a class from ClassLink in My Classes."
          />
        )}
      </GradebookShell>
    );
  }

  return (
    <GradebookProvider
      key={roster.id}
      uid={user.uid}
      source={
        join.status === 'loading' && source.status === 'ready'
          ? { ...source, status: 'loading' }
          : source
      }
      roster={roster}
      rosters={rosters}
      studentByUid={join.studentByUid}
      toast={toast}
    >
      <GradebookPage parsed={parsed} onClose={close} />
    </GradebookProvider>
  );
};
