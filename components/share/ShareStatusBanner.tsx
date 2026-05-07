/**
 * ShareStatusBanner — compact share-status chip with a click-to-expand
 * popover. Replaces the original wide top-center pill so the dashboard
 * canvas keeps its real estate during live sessions (especially important
 * on a projector).
 *
 * The chip is a small circular icon button anchored top-right. Color codes
 * the role:
 *
 *  - owner       : brand-blue ring + Radio icon (you're sharing)
 *  - collaborator: brand-blue ring + Cloud icon (Synced participant)
 *  - viewer      : amber ring + Eye icon (View-Only participant)
 *  - ended       : slate ring + Unlink icon (host revoked the share)
 *
 * Clicking the chip opens a glassmorphic popover with the host name, a
 * detail line, and the action button (Stop sharing / Leave / Detach).
 *
 * The sidebar's per-board ShareBadge already carries descriptive copy in
 * the dashboard list, so this chip stays minimal — its job is one-click
 * access to the live action.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Cloud, Eye, Radio, Unlink, X } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { Z_INDEX } from '@/config/zIndex';

export const ShareStatusBanner: React.FC = () => {
  const { activeDashboard, stopSharingDashboard } = useDashboard();
  const { showConfirm } = useDialog();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside / Escape handling for the popover.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!activeDashboard?.linkedShareId) return null;

  const role = activeDashboard.linkedShareRole;
  const ended = activeDashboard.linkedShareEnded;
  const hostName = activeDashboard.linkedShareHostName;

  let Icon = Cloud;
  let label = 'Shared';
  let detail = '';
  // The chip is a colored ring around a neutral background — keeps it tiny
  // and projector-readable without a heavy filled pill.
  let ringClass = 'ring-brand-blue-primary text-brand-blue-primary';
  let actionLabel = 'Stop sharing';
  let actionVariant: 'warning' | 'info' = 'info';

  if (ended) {
    Icon = Unlink;
    label = 'Share ended';
    detail = 'The host stopped sharing — this board is no longer in sync.';
    ringClass = 'ring-slate-500 text-slate-500';
    actionLabel = 'Detach';
  } else if (role === 'owner') {
    Icon = Radio;
    label = 'Sharing live';
    detail = 'Anyone with the link can view or join your board.';
    ringClass = 'ring-brand-blue-primary text-brand-blue-primary';
    actionLabel = 'Stop sharing';
    actionVariant = 'warning';
  } else if (role === 'collaborator') {
    Icon = Cloud;
    label = 'Synced';
    detail = hostName
      ? `Edits sync both ways with ${hostName}.`
      : 'Edits sync both ways with the host.';
    ringClass = 'ring-brand-blue-primary text-brand-blue-primary';
    actionLabel = 'Leave';
  } else if (role === 'viewer') {
    Icon = Eye;
    label = 'View-only';
    detail = hostName
      ? `${hostName} is sharing — you can't edit this board.`
      : "The host is sharing — you can't edit this board.";
    ringClass = 'ring-amber-500 text-amber-500';
    actionLabel = 'Leave';
  } else {
    return null;
  }

  const onStop = async () => {
    setOpen(false);
    const confirmMessage = ended
      ? 'Detach this board from the ended share? Your local copy keeps its current contents.'
      : role === 'owner'
        ? 'Stop sharing this board? Anyone using your link will be disconnected from your live updates.'
        : role === 'viewer'
          ? 'Leave this view-only board? It will be removed from your account.'
          : 'Leave this shared board? Your local copy will keep its current contents but won’t receive further updates.';
    const confirmed = await showConfirm(confirmMessage, {
      title: actionLabel,
      confirmLabel: actionLabel,
      cancelLabel: 'Cancel',
      variant: actionVariant,
    });
    if (!confirmed) return;
    await stopSharingDashboard(activeDashboard.id);
  };

  const accessibleLabel = `${label}${detail ? ` — ${detail}` : ''}`;

  return (
    <div
      ref={containerRef}
      className="fixed top-3 right-3 flex flex-col items-end"
      style={{ zIndex: Z_INDEX.popover }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={accessibleLabel}
        aria-expanded={open}
        title={accessibleLabel}
        className={`group relative w-9 h-9 rounded-full bg-white/85 backdrop-blur-md ring-2 shadow-md transition-all hover:scale-105 hover:bg-white focus:outline-none focus:ring-offset-2 cursor-pointer ${ringClass}`}
      >
        <Icon className="w-4 h-4 mx-auto" />
        <span
          className={`absolute -bottom-0.5 -right-0.5 block w-2 h-2 rounded-full ring-2 ring-white ${
            ended
              ? 'bg-slate-400'
              : role === 'viewer'
                ? 'bg-amber-500'
                : 'bg-emerald-500 animate-pulse'
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={accessibleLabel}
          className="mt-2 w-64 rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-lg overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 shrink-0 ${ringClass}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {label}
                </span>
              </div>
              {detail && (
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {detail}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={() => void onStop()}
              className={`w-full inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                actionVariant === 'warning'
                  ? 'bg-brand-red-primary hover:bg-brand-red-dark text-white'
                  : 'bg-slate-800 hover:bg-slate-900 text-white'
              }`}
            >
              {actionLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
