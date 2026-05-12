/**
 * PlcSharedBoardsBody — Phase 6 body for PLC-scoped shared dashboards.
 *
 * Lists every `/shared_boards/{shareId}` doc whose `plcId` matches the
 * current PLC. Each row surfaces "Open share" (deep-link into the
 * existing `/share/:id` import flow — the recipient lands on the
 * standard share-mode picker the host configured at create time).
 *
 * Out of scope here (deliberate):
 *
 *   - In-place edit. PLC-shared boards are a forwarding surface, not a
 *     library editor. Teammates open the share, pick Synced / View-only
 *     / Copy via the standard flow, and edit through their own dashboard
 *     once imported.
 *   - Unshare from the PLC tab. The roadmap (Phase 6 "Open question"
 *     resolved as read-only/copy for simplicity) treats teammates as
 *     consumers; only the originalAuthor can stop sharing — via the
 *     existing "Stop sharing" affordance in the Sidebar where they
 *     created the share.
 *
 * Read security: `/shared_boards` rule allows reads from any authed
 * user, so the PLC filter is a client-side pivot, not a permissions
 * boundary. A hostile client could list arbitrary shares by removing
 * the `where plcId == ...` clause; nothing in this body assumes
 * otherwise.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Cloud,
  Copy,
  ExternalLink,
  Eye,
  LayoutDashboard,
  Loader2,
  Users2,
} from 'lucide-react';
import type { Plc } from '@/types';
import {
  PlcSharedBoardEntry,
  usePlcSharedBoards,
} from '@/hooks/usePlcSharedBoards';

interface PlcSharedBoardsBodyProps {
  plc: Plc;
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

const ModePill: React.FC<{ mode: PlcSharedBoardEntry['intendedMode'] }> = ({
  mode,
}) => {
  const { t } = useTranslation();
  if (mode === 'synced') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
        <Cloud className="w-3 h-3" aria-hidden="true" />
        {t('plcDashboard.sharedBoards.modeSynced', { defaultValue: 'Synced' })}
      </span>
    );
  }
  if (mode === 'view-only') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
        <Eye className="w-3 h-3" aria-hidden="true" />
        {t('plcDashboard.sharedBoards.modeViewOnly', {
          defaultValue: 'View only',
        })}
      </span>
    );
  }
  if (mode === 'copy') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue-lighter px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-blue-primary">
        <Copy className="w-3 h-3" aria-hidden="true" />
        {t('plcDashboard.sharedBoards.modeCopy', { defaultValue: 'Copy' })}
      </span>
    );
  }
  return null;
};

export const PlcSharedBoardsBody: React.FC<PlcSharedBoardsBodyProps> = ({
  plc,
}) => {
  const { t } = useTranslation();
  const { boards, loading } = usePlcSharedBoards(plc.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (boards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
          <LayoutDashboard
            className="w-7 h-7 text-slate-400"
            aria-hidden="true"
          />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-2">
          {t('plcDashboard.sharedBoards.emptyTitle', {
            defaultValue: 'No shared boards yet',
          })}
        </h3>
        <p className="text-sm text-slate-500 max-w-md leading-relaxed">
          {t('plcDashboard.sharedBoards.emptySubtitle', {
            defaultValue:
              'When you or a teammate shares a dashboard with this PLC, it shows up here. Use the Share button on a dashboard and pick this PLC as the audience.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('plcDashboard.sharedBoards.heading', {
            defaultValue: 'Shared Dashboards',
          })}
        </h3>
        <span className="text-xxs text-slate-400">
          {t('plcDashboard.sharedBoards.count', {
            count: boards.length,
            defaultValue: '{{count}} board',
            defaultValue_other: '{{count}} boards',
          })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {boards.map((board) => {
          const ownerLabel =
            board.originalAuthorName?.trim() ||
            t('plcDashboard.sharedBoards.unknownSharer', {
              defaultValue: 'a teammate',
            });
          const displayName =
            board.name?.trim() ||
            t('plcDashboard.sharedBoards.untitled', {
              defaultValue: 'Untitled dashboard',
            });
          return (
            <div
              key={board.id}
              className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-brand-blue-light rounded-xl transition-colors"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                <LayoutDashboard
                  className="w-4 h-4 text-brand-blue-primary"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {displayName}
                  </div>
                  <ModePill mode={board.intendedMode} />
                </div>
                <div className="text-xxs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="truncate flex items-center gap-1">
                    <Users2 className="w-3 h-3" aria-hidden="true" />
                    {t('plcDashboard.sharedBoards.bySharer', {
                      name: ownerLabel,
                      defaultValue: 'shared by {{name}}',
                    })}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>
                    {t('plcDashboard.sharedBoards.widgetCount', {
                      count: board.widgetCount,
                      defaultValue: '{{count}} widget',
                      defaultValue_other: '{{count}} widgets',
                    })}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>{formatDate(board.updatedAt)}</span>
                </div>
              </div>
              <a
                href={`/share/${encodeURIComponent(board.id)}`}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors"
                title={t('plcDashboard.sharedBoards.openShareTooltip', {
                  defaultValue:
                    "Open this share — you'll get the standard sync / view-only / copy picker.",
                })}
              >
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {t('plcDashboard.sharedBoards.openShare', {
                    defaultValue: 'Open share',
                  })}
                </span>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
};
