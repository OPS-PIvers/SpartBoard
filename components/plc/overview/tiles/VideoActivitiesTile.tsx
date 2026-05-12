/**
 * VideoActivitiesTile — Phase 4 bento tile for the PLC Video Activity
 * Library. Mirrors `QuizLibraryTile` rhythm: small heading + count
 * badge, scrollable preview list (4 most recent), "Open library" footer.
 *
 * The "Coming soon" placeholder previously occupying this slot is now
 * routed away in `tileRegistry.tsx`.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Film, Loader2 } from 'lucide-react';
import { Plc } from '@/types';
import { usePlcVideoActivities } from '@/hooks/usePlcVideoActivities';
import type { PlcDashboardTabId } from '../../PlcDashboard';

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
  const { videoActivities, loading } = usePlcVideoActivities(plc.id);
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
            {preview.map((activity) => (
              <li
                key={activity.id}
                className="px-2 py-2 rounded-lg hover:bg-brand-blue-lighter/40 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {activity.title}
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
                  {t('plcDashboard.overview.tiles.videoActivities.bySharer', {
                    name:
                      activity.sharedByName || activity.sharedByEmail || '—',
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
