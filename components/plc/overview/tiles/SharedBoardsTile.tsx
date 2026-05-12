/**
 * SharedBoardsTile — Phase 6 bento tile for PLC-scoped shared dashboards.
 * Replaces the `ComingSoonTile` placeholder in `tileRegistry.tsx`.
 *
 * Compact preview list — 4 most recent shares — with an "Open boards"
 * footer that drops into the full tab.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, LayoutDashboard, Loader2 } from 'lucide-react';
import { Plc } from '@/types';
import { usePlcSharedBoards } from '@/hooks/usePlcSharedBoards';
import type { PlcDashboardTabId } from '../../PlcDashboard';

interface SharedBoardsTileProps {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

const PREVIEW_LIMIT = 4;

export const SharedBoardsTile: React.FC<SharedBoardsTileProps> = ({
  plc,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const { boards, loading } = usePlcSharedBoards(plc.id);
  const preview = boards.slice(0, PREVIEW_LIMIT);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-7 h-7 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
          <LayoutDashboard className="w-3.5 h-3.5 text-brand-blue-primary" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.sharedBoards.heading', {
            defaultValue: 'Shared Boards',
          })}
        </h4>
        {boards.length > 0 && (
          <span className="ml-auto text-xs font-bold text-slate-700">
            {boards.length}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-2">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-xs text-slate-500 py-2">
            <LayoutDashboard className="w-6 h-6 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              {t('plcDashboard.overview.tiles.sharedBoards.empty', {
                defaultValue: 'No shared boards',
              })}
            </p>
            <p className="text-xxs text-slate-400 mt-1">
              {t('plcDashboard.overview.tiles.sharedBoards.emptySubtitle', {
                defaultValue: 'Share a dashboard with this PLC to add it here.',
              })}
            </p>
          </div>
        ) : (
          <ul className="space-y-2 py-1">
            {preview.map((board) => (
              <li
                key={board.id}
                className="px-2 py-2 rounded-lg hover:bg-brand-blue-lighter/40 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {board.name ||
                      t('plcDashboard.overview.tiles.sharedBoards.untitled', {
                        defaultValue: 'Untitled dashboard',
                      })}
                  </div>
                  <span className="shrink-0 text-xxs text-slate-400">
                    {t('plcDashboard.overview.tiles.sharedBoards.widgetCount', {
                      count: board.widgetCount,
                      defaultValue: '{{count}} w',
                    })}
                  </span>
                </div>
                <p className="text-xxs text-slate-500 truncate mt-0.5">
                  {t('plcDashboard.overview.tiles.sharedBoards.bySharer', {
                    name: board.originalAuthorName || '—',
                    defaultValue: 'shared by {{name}}',
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => onNavigateTab('sharedBoards')}
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-slate-100 text-xxs font-bold uppercase tracking-wider text-brand-blue-primary hover:bg-brand-blue-lighter/40 transition-colors"
      >
        {t('plcDashboard.overview.tiles.sharedBoards.openAll', {
          defaultValue: 'Open boards',
        })}
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
};
