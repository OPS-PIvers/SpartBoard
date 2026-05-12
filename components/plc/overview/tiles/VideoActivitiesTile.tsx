/**
 * VideoActivitiesTile — Phase 4 bento tile for the PLC Video Activity
 * Library. Mirrors `QuizLibraryTile` rhythm: small heading + count
 * badge, scrollable preview list (4 most recent), "Open library" footer.
 *
 * Each row exposes an inline kebab popover (`TileRowKebab`) with quick
 * actions — "Open in tab" and "Unshare from PLC" — so the tile is not
 * limited to a single navigate-on-click affordance. Heavier actions
 * (import + edit) stay in the tab body where the personal-library
 * subscription (`useVideoActivity`) already lives.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  ExternalLink,
  Film,
  Loader2,
  Trash2,
} from 'lucide-react';
import { Plc } from '@/types';
import { usePlcVideoActivities } from '@/hooks/usePlcVideoActivities';
import { usePlcLibraryActions } from '@/hooks/usePlcLibraryActions';
import type { PlcDashboardTabId } from '../../PlcDashboard';
import { TileRowKebab, type TileRowKebabAction } from './TileRowKebab';

interface VideoActivitiesTileProps {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

const PREVIEW_LIMIT = 4;

export const VideoActivitiesTile: React.FC<VideoActivitiesTileProps> = ({
  plc,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const { videoActivities, loading, unshareVideoActivityFromPlc } =
    usePlcVideoActivities(plc.id);
  const { unshare, busyId } = usePlcLibraryActions({
    plcId: plc.id,
    kind: 'videoActivity',
    unshareFn: unshareVideoActivityFromPlc,
  });
  const preview = videoActivities.slice(0, PREVIEW_LIMIT);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="w-7 h-7 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
          <Film className="w-3.5 h-3.5 text-brand-blue-primary" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.videoActivities.heading', {
            defaultValue: 'Video Activities',
          })}
        </h4>
        {videoActivities.length > 0 && (
          <span className="ml-auto text-xs font-bold text-slate-700">
            {videoActivities.length}
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
            <Film className="w-6 h-6 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              {t('plcDashboard.overview.tiles.videoActivities.empty', {
                defaultValue: 'No shared activities',
              })}
            </p>
            <p className="text-xxs text-slate-400 mt-1">
              {t('plcDashboard.overview.tiles.videoActivities.emptySubtitle', {
                defaultValue:
                  'Share an activity from the kebab on its library card.',
              })}
            </p>
          </div>
        ) : (
          <ul className="space-y-2 py-1">
            {preview.map((activity) => {
              const rowBusy = busyId === activity.id;
              const kebabActions: TileRowKebabAction[] = [
                {
                  id: 'open',
                  label: t(
                    'plcDashboard.overview.tiles.videoActivities.openInTab',
                    { defaultValue: 'Open in tab' }
                  ),
                  Icon: ExternalLink,
                  onClick: () => onNavigateTab('videoActivities'),
                },
                {
                  id: 'unshare',
                  label: t(
                    'plcDashboard.overview.tiles.videoActivities.unshare',
                    { defaultValue: 'Unshare from PLC' }
                  ),
                  Icon: Trash2,
                  destructive: true,
                  disabled: rowBusy,
                  onClick: () => void unshare(activity.id, activity.title),
                },
              ];
              return (
                <li key={activity.id} className="relative">
                  <div className="flex items-stretch gap-1 group">
                    <button
                      type="button"
                      onClick={() => onNavigateTab('videoActivities')}
                      className="flex-1 min-w-0 text-left px-2 py-2 rounded-lg hover:bg-brand-blue-lighter/40 focus-visible:bg-brand-blue-lighter/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 transition-colors"
                      title={t(
                        'plcDashboard.overview.tiles.videoActivities.rowTooltip',
                        {
                          defaultValue: 'Open in PLC Video Activities tab',
                        }
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                          {rowBusy && (
                            <Loader2
                              className="w-3 h-3 animate-spin text-slate-400 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate">{activity.title}</span>
                        </div>
                        <span className="shrink-0 text-xxs text-slate-400">
                          {t(
                            'plcDashboard.overview.tiles.videoActivities.questionCount',
                            {
                              count: activity.questionCount,
                              defaultValue: '{{count}} q',
                            }
                          )}
                        </span>
                      </div>
                      <p className="text-xxs text-slate-500 truncate mt-0.5">
                        {t(
                          'plcDashboard.overview.tiles.videoActivities.bySharer',
                          {
                            name:
                              activity.sharedByName ||
                              activity.sharedByEmail ||
                              '—',
                            defaultValue: 'shared by {{name}}',
                          }
                        )}
                      </p>
                    </button>
                    <div className="self-center pr-1">
                      <TileRowKebab
                        ariaLabel={t(
                          'plcDashboard.overview.tiles.videoActivities.kebabAriaLabel',
                          {
                            title: activity.title,
                            defaultValue: 'Actions for {{title}}',
                          }
                        )}
                        actions={kebabActions}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => onNavigateTab('videoActivities')}
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-slate-100 text-xxs font-bold uppercase tracking-wider text-brand-blue-primary hover:bg-brand-blue-lighter/40 transition-colors"
      >
        {t('plcDashboard.overview.tiles.videoActivities.openAll', {
          defaultValue: 'Open library',
        })}
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
};
