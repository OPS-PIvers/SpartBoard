import React from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, Footprints } from 'lucide-react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import type { HelpResourceItem } from '@/types/helpCenter';

interface SubsHelpMenuProps {
  id: string;
  tours: readonly HelpResourceItem[];
  canRecord: boolean;
  onPlay: (item: HelpResourceItem) => void;
  onRecord: () => void;
}

const ROW_CLASS =
  'w-full flex items-center gap-3 px-4 py-2.5 min-h-11 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:bg-slate-50';

/** The Help menu on /subs: this portal's live tours, and Record a tour for admins. */
export const SubsHelpMenu: React.FC<SubsHelpMenuProps> = ({
  id,
  tours,
  canRecord,
  onPlay,
  onRecord,
}) => {
  const { t } = useTranslation();
  return (
    <div
      id={id}
      role="menu"
      aria-label={t('subsTours.menuLabel', { defaultValue: 'Help' })}
      className="fixed inset-x-4 top-20 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 max-h-[60vh] overflow-y-auto pb-1 rounded-2xl bg-white border border-slate-200 shadow-2xl shadow-slate-900/15 z-50"
    >
      {tours.length > 0 && (
        <div className="pt-1">
          {tours.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => onPlay(item)}
              className={ROW_CLASS}
              {...tourFieldAttr('subs.help-tour', 'subs-help', `row-${i + 1}`)}
            >
              <Footprints
                className="w-4 h-4 shrink-0 text-brand-blue-primary"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 leading-snug">{item.title}</span>
            </button>
          ))}
        </div>
      )}
      {canRecord && (
        <div
          className={
            tours.length > 0 ? 'mt-1 border-t border-slate-100 pt-1' : 'pt-1'
          }
        >
          <button
            type="button"
            role="menuitem"
            onClick={onRecord}
            className={ROW_CLASS}
            {...tourAttr('subs.help-record')}
          >
            <Circle
              className="w-4 h-4 shrink-0 fill-brand-red-primary text-brand-red-primary"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              {t('subsTours.record', { defaultValue: 'Record a tour' })}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
