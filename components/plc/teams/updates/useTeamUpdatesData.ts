// Data for the Updates page, the latest-updates card and the update hero.

import { useCallback, useMemo } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useGooglePicker } from '@/hooks/useGooglePicker';
import {
  useMyUpdateAcks,
  usePlcUpdates,
  useUpdateAcksFor,
  type PlcUpdateDraft,
} from '@/hooks/usePlcUpdates';
import type { Plc, PlcUpdate } from '@/types';
import { logError } from '@/utils/logError';
import {
  ATTACHMENT_NAME_MAX,
  ackWatchIds,
  buildAckRoster,
  type AckRoster,
} from '@/utils/teamUpdates';

export interface TeamUpdatesDataOptions {
  /** Lead or co-lead: listen to every ack for the who-has view. */
  withRosters?: boolean;
  /** How many of the newest updates the view shows; acks are watched only there. */
  visible?: number;
}

export function useTeamUpdatesData(
  plc: Plc,
  isLead: boolean,
  { withRosters = true, visible }: TeamUpdatesDataOptions = {}
) {
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const { openPicker } = useGooglePicker();
  const api = usePlcUpdates(plc.id);
  const { updates } = api;

  const ackIds = useMemo(
    () => ackWatchIds(updates, visible),
    [updates, visible]
  );
  // isLead covers lead and co-lead: managers read all acks, members only their own.
  const myAcks = useMyUpdateAcks(isLead ? null : plc.id, ackIds);
  const allAcks = useUpdateAcksFor(plc.id, ackIds, isLead && withRosters);
  const rosters = useMemo(() => {
    const out: Record<string, AckRoster> = {};
    if (!isLead || !withRosters) return out;
    for (const u of updates) {
      if (u.requiresAck)
        out[u.id] = buildAckRoster(plc, u, allAcks[u.id] ?? []);
    }
    return out;
  }, [isLead, withRosters, updates, plc, allAcks]);

  const fail = useCallback(
    (where: string, err: unknown) => {
      logError(`teamUpdates.${where}`, err, { plcId: plc.id });
      addToast('Something went wrong. Try again.', 'error');
    },
    [addToast, plc.id]
  );

  const run =
    <A extends unknown[]>(where: string, fn: (...a: A) => Promise<void>) =>
    async (...a: A) => {
      try {
        await fn(...a);
      } catch (err) {
        fail(where, err);
      }
    };

  // Post and edit rethrow after the toast so the composer keeps the draft.
  const runOrThrow =
    <A extends unknown[]>(where: string, fn: (...a: A) => Promise<void>) =>
    async (...a: A) => {
      try {
        await fn(...a);
      } catch (err) {
        fail(where, err);
        throw err;
      }
    };

  const onDelete = async (update: PlcUpdate) => {
    const ok = await showConfirm(`Delete "${update.title}"?`, {
      title: 'Delete update',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (ok) await run('delete', api.removeUpdate)(update.id);
  };

  const onAttach = async () => {
    try {
      const file = await openPicker({ mode: 'documents' });
      return file
        ? {
            name: file.name.slice(0, ATTACHMENT_NAME_MAX),
            url: `https://drive.google.com/file/d/${file.id}/view`,
          }
        : null;
    } catch (err) {
      fail('attach', err);
      return null;
    }
  };

  return {
    updates,
    loading: api.loading,
    myUid: user?.uid ?? '',
    myAcks,
    rosters,
    onPost: runOrThrow('post', (d: PlcUpdateDraft) => api.postUpdate(d)),
    onEdit: runOrThrow('edit', (id: string, d: PlcUpdateDraft) =>
      api.editUpdate(id, d)
    ),
    onDelete: (u: PlcUpdate) => void onDelete(u),
    onPin: (id: string, pinned: boolean) =>
      void run('pin', api.setPinned)(id, pinned),
    onReact: (id: string, reacted: boolean) =>
      void run('react', api.setReacted)(id, reacted),
    onAck: (id: string) => void run('ack', api.acknowledge)(id),
    onAttach,
  };
}
