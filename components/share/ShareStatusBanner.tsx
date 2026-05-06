/**
 * ShareStatusBanner — small persistent banner anchored to the top-center of
 * the dashboard, surfaced for any board that's part of a live share. Variants:
 *
 *  - owner     : "Sharing live" (host) with a Stop sharing action.
 *  - collaborator (synced) : "Synced with [host]" with a Leave action.
 *  - viewer (view-only)    : "View-only" indicator + Leave.
 *  - ended     : surfaced when the host revokes the share. The local copy
 *    becomes editable again (read-only mode is intentionally lifted once the
 *    upstream link is gone — the user "inherits" the last synced state and
 *    can detach to clear the banner permanently).
 *
 * Glassmorphic style matches the rest of the dashboard chrome — sits over
 * the canvas at low z, dismissable interactions go through DashboardContext.
 */

import React from 'react';
import { Cloud, Eye, Radio, Unlink, X } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';

export const ShareStatusBanner: React.FC = () => {
  const { activeDashboard, stopSharingDashboard } = useDashboard();
  const { showConfirm } = useDialog();

  if (!activeDashboard?.linkedShareId) return null;

  const role = activeDashboard.linkedShareRole;
  const ended = activeDashboard.linkedShareEnded;
  const hostName = activeDashboard.linkedShareHostName;

  let Icon = Cloud;
  let label = 'Shared';
  let detail = '';
  let tone = 'bg-brand-blue-primary/90 text-white border-brand-blue-light/40';
  let actionLabel = 'Stop sharing';

  if (ended) {
    Icon = Unlink;
    label = 'Share ended';
    detail = 'The host stopped sharing — this board is no longer in sync.';
    tone = 'bg-slate-800/90 text-slate-100 border-slate-600/40';
    actionLabel = 'Detach';
  } else if (role === 'owner') {
    Icon = Radio;
    label = 'Sharing live';
    detail = 'Anyone with the link can view or join your board.';
    actionLabel = 'Stop sharing';
  } else if (role === 'collaborator') {
    Icon = Cloud;
    label = 'Synced';
    detail = hostName
      ? `Edits sync both ways with ${hostName}.`
      : 'Edits sync both ways with the host.';
    actionLabel = 'Leave';
  } else if (role === 'viewer') {
    Icon = Eye;
    label = 'View-only';
    detail = hostName
      ? `${hostName} is sharing — you can't edit this board.`
      : 'The host is sharing — you can’t edit this board.';
    tone = 'bg-amber-500/95 text-white border-amber-300/50';
    actionLabel = 'Leave';
  } else {
    return null;
  }

  const onStop = async () => {
    const confirmed = await showConfirm(
      ended
        ? 'Detach this board from the ended share? Your local copy keeps its current contents.'
        : role === 'owner'
          ? 'Stop sharing this board? Anyone using your link will be disconnected from your live updates.'
          : 'Leave this shared board? Your local copy will keep its current contents but won’t receive further updates.',
      {
        title: actionLabel,
        confirmLabel: actionLabel,
        cancelLabel: 'Cancel',
        variant: role === 'owner' && !ended ? 'warning' : 'info',
      }
    );
    if (!confirmed) return;
    await stopSharingDashboard(activeDashboard.id);
  };

  return (
    <div
      className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex justify-center"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2 shadow-lg backdrop-blur-md ${tone}`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider">
            {label}
          </span>
          {detail && (
            <span className="text-xs opacity-90 truncate max-w-[28rem]">
              {detail}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void onStop()}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-black/15 hover:bg-black/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors"
        >
          <X className="w-3 h-3" />
          {actionLabel}
        </button>
      </div>
    </div>
  );
};
