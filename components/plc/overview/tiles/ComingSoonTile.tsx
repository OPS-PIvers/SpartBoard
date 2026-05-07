import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  ClipboardList,
  Film,
  SquareSquare,
  type LucideIcon,
} from 'lucide-react';
import type { PlcBentoTileKind } from '@/types';

type ComingSoonKind = Extract<
  PlcBentoTileKind,
  'quizLibrary' | 'activeAssignments' | 'videoActivities' | 'sharedBoards'
>;

interface ComingSoonTileProps {
  kind: ComingSoonKind;
  /** Roadmap phase number — surfaces as a small "Phase N" badge. */
  phase: number;
  onNavigateTab: () => void;
}

// `titleKey` and `teaserKey` are sibling leaves in the locale tree
// (e.g. `quizLibrary.title` + `quizLibrary.teaser`). They must be tracked
// as separate strings — `${titleKey}.teaser` would yield `…title.teaser`,
// which doesn't exist in the locale JSON and would only render the
// defaultValue.
const META: Record<
  ComingSoonKind,
  {
    icon: LucideIcon;
    titleKey: string;
    titleDefault: string;
    teaserKey: string;
    teaserDefault: string;
  }
> = {
  quizLibrary: {
    icon: BookOpen,
    titleKey: 'plcDashboard.overview.tiles.quizLibrary.title',
    titleDefault: 'Quiz library',
    teaserKey: 'plcDashboard.overview.tiles.quizLibrary.teaser',
    teaserDefault: 'Share quizzes with your PLC.',
  },
  activeAssignments: {
    icon: ClipboardList,
    titleKey: 'plcDashboard.overview.tiles.activeAssignments.title',
    titleDefault: 'Active assignments',
    teaserKey: 'plcDashboard.overview.tiles.activeAssignments.teaser',
    teaserDefault: 'PLC-authored assignments awaiting pickup.',
  },
  videoActivities: {
    icon: Film,
    titleKey: 'plcDashboard.overview.tiles.videoActivities.title',
    titleDefault: 'Video activities',
    teaserKey: 'plcDashboard.overview.tiles.videoActivities.teaser',
    teaserDefault: 'Share video activities with the PLC.',
  },
  sharedBoards: {
    icon: SquareSquare,
    titleKey: 'plcDashboard.overview.tiles.sharedBoards.title',
    titleDefault: 'Shared boards',
    teaserKey: 'plcDashboard.overview.tiles.sharedBoards.teaser',
    teaserDefault: 'Boards shared with this PLC.',
  },
};

export const ComingSoonTile: React.FC<ComingSoonTileProps> = ({
  kind,
  phase,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const meta = META[kind];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onNavigateTab}
      className="h-full w-full p-4 flex flex-col items-start text-left hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t(meta.titleKey, { defaultValue: meta.titleDefault })}
        </h4>
      </div>
      <p className="text-xxs text-slate-500 leading-snug flex-1">
        {t(meta.teaserKey, { defaultValue: meta.teaserDefault })}
      </p>
      <span className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-xxs font-bold uppercase tracking-widest text-slate-400">
        {t('plcDashboard.overview.tiles.comingSoon', {
          defaultValue: 'Phase {{phase}} · soon',
          phase,
        })}
      </span>
    </button>
  );
};
