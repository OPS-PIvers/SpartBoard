/**
 * SubSharesPanel — what the teacher currently has out with a substitute, and
 * the four things they do with it: copy the link, push the current boards,
 * add a week, or end it now (docs/plans/shipped/SUB_SHARE_COLLECTIONS.md §3.7).
 *
 * Renders nothing when nothing is shared, so it stays out of the way.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Folder,
  LayoutDashboard,
  Link2,
  RefreshCw,
  Clock,
  X,
} from 'lucide-react';
import type { SharedCollection } from '@/types';

interface SubSharesPanelProps {
  shares: SharedCollection[];
  busyShareId: string | null;
  onCopyLink: (share: SharedCollection) => void;
  onUpdateNow: (share: SharedCollection) => void;
  onExtend: (share: SharedCollection) => void;
  onEnd: (share: SharedCollection) => void;
}

const endsAtLabel = (expiresAt: number | undefined): string =>
  expiresAt
    ? new Date(expiresAt).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

export const SubSharesPanel: React.FC<SubSharesPanelProps> = ({
  shares,
  busyShareId,
  onCopyLink,
  onUpdateNow,
  onExtend,
  onEnd,
}) => {
  const { t } = useTranslation();
  if (shares.length === 0) return null;

  return (
    <section className="shrink-0 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
        {t('subShare.panel.title', { defaultValue: 'Shared with subs' })}
      </h3>
      <ul className="mt-2 space-y-1.5">
        {shares.map((share) => {
          const busy = busyShareId === share.shareId;
          const boardCount = share.boardIds.length;
          const subCount = share.subEmails?.length ?? 0;
          return (
            <li
              key={share.shareId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              {share.kind === 'board' ? (
                <LayoutDashboard
                  className="w-4 h-4 text-slate-400 shrink-0"
                  aria-hidden
                />
              ) : (
                <Folder
                  className="w-4 h-4 text-slate-400 shrink-0"
                  aria-hidden
                />
              )}
              <span className="text-sm font-bold text-slate-800 truncate max-w-[14rem]">
                {share.collection.name}
              </span>
              <span className="text-xs text-slate-500">
                {t('subShare.panel.summary', {
                  boards: boardCount,
                  subs: subCount,
                  date: endsAtLabel(share.expiresAt),
                  defaultValue:
                    '{{boards}} boards · {{subs}} named subs · until {{date}}',
                })}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onCopyLink(share)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  <Link2 className="w-3.5 h-3.5" aria-hidden />
                  {t('subShare.panel.copyLink', { defaultValue: 'Copy link' })}
                </button>
                {/* Pre-v2 shares have no source, so there is nothing to re-push from. */}
                {share.sourceId && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onUpdateNow(share)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                    {busy
                      ? t('subShare.panel.updating', {
                          defaultValue: 'Updating…',
                        })
                      : t('subShare.panel.updateNow', {
                          defaultValue: 'Push my changes',
                        })}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onExtend(share)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  <Clock className="w-3.5 h-3.5" aria-hidden />
                  {t('subShare.panel.extend', { defaultValue: 'Add a week' })}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onEnd(share)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-brand-red-primary hover:bg-brand-red-primary/10 disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                  {t('subShare.panel.end', { defaultValue: 'End now' })}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
