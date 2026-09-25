import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, CircleHelp, Footprints } from 'lucide-react';
import type { WidgetData } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';
import { IconButton } from '@/components/common/IconButton';
import { tourAttr } from '@/config/tourAnchors';
import { requestOpenHelp } from './helpCenterState';
import { requestStartTour } from '@/components/tours/tourState';
import { useLiveTourSet } from '@/components/tours/useTourOffers';

interface WidgetHelpButtonProps {
  widget: Pick<WidgetData, 'id' | 'type'>;
  helpItems: readonly HelpResourceItem[];
  onClose: () => void;
  className?: string;
}

const menuItemClass =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none';

/** The settings header's `?`: opens guides, or offers a live tour first when the widget has one. */
export const WidgetHelpButton: React.FC<WidgetHelpButtonProps> = ({
  widget,
  helpItems,
  onClose,
  className,
}) => {
  const { t } = useTranslation();
  const liveSetId = useLiveTourSet(helpItems);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const openGuides = () => {
    requestOpenHelp({ tab: 'guides', widgetType: widget.type });
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <IconButton
        onClick={() => (liveSetId ? setOpen((v) => !v) : openGuides())}
        icon={<CircleHelp className="w-4 h-4" />}
        label={t('helpCenter.widgetHelp')}
        {...tourAttr('settings.help', widget.id, widget.type)}
        title={t('helpCenter.widgetHelp')}
        aria-haspopup={liveSetId ? 'menu' : undefined}
        aria-expanded={liveSetId ? open : undefined}
        variant="ghost"
        size="sm"
        shape="square"
        className={className}
      />
      {open && liveSetId && (
        <div
          role="menu"
          aria-label={t('helpCenter.widgetHelp')}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setOpen(false);
          }}
          className="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              setOpen(false);
              requestStartTour({ setId: liveSetId });
              onClose();
            }}
          >
            <Footprints className="w-4 h-4 text-slate-500" aria-hidden="true" />
            {t('tours.showMeLive')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={openGuides}
          >
            <BookOpen className="w-4 h-4 text-slate-500" aria-hidden="true" />
            {t('tours.openGuides')}
          </button>
        </div>
      )}
    </div>
  );
};
