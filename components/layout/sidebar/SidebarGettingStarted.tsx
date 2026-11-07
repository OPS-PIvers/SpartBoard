import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Footprints } from 'lucide-react';
import { GETTING_STARTED_PATH } from '@/config/gettingStarted';
import { tourAttr } from '@/config/tourAnchors';
import { useGettingStarted } from '@/hooks/useGettingStarted';
import { spaNavigate } from '@/utils/plcPath';

/** The menu item below What's New; mounted only while the menu is open, so its listeners are too (D5, D16). */
export const SidebarGettingStarted: React.FC<{ onOpen: () => void }> = ({
  onOpen,
}) => {
  const { t } = useTranslation();
  const { loading, showInSidebar, essentials, essentialsDone } =
    useGettingStarted();
  if (loading || !showInSidebar) return null;

  const total = essentials.length;
  const unfinished = essentialsDone < total;

  return (
    <button
      {...tourAttr('sidebar.getting-started')}
      onClick={() => {
        spaNavigate(GETTING_STARTED_PATH);
        onOpen();
      }}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-brand-blue-lighter/40 transition-colors text-left"
    >
      <div className="relative w-8 h-8 rounded-lg bg-brand-blue-lighter group-hover:bg-brand-blue-lighter flex items-center justify-center transition-colors shrink-0">
        <Footprints className="w-4 h-4 text-brand-blue-light group-hover:text-brand-blue-primary transition-colors" />
        {unfinished && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-red-primary border-2 border-white"
            aria-hidden="true"
          />
        )}
      </div>
      <span className="grow text-[13px]">
        {t('sidebar.nav.gettingStarted', { defaultValue: 'Getting Started' })}
      </span>
      {unfinished && (
        <span className="text-xxs bg-brand-blue-lighter text-brand-blue-primary px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
          {t('sidebar.nav.gettingStartedProgress', {
            defaultValue: '{{done}} of {{total}}',
            done: essentialsDone,
            total,
          })}
        </span>
      )}
      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-blue-primary transition-colors" />
    </button>
  );
};
