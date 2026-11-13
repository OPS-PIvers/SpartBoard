import React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, LunchCountConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { Button } from '@/components/common/Button';
import { hexToRgba } from '@/utils/styles';
import { tourAttr } from '@/config/tourAnchors';
import { WidgetLayout } from '../WidgetLayout';
import { useNutrislice } from './useNutrislice';

// Middle and high school boards show today's hot lunch only; there is no count to send.
export const MiddleHighLunchCount: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t, i18n } = useTranslation();
  const { updateWidget, addToast, activeDashboard } = useDashboard();
  const config = widget.config as LunchCountConfig;
  const cachedMenu = config.cachedMenu ?? null;

  const { isSyncing, fetchNutrislice } = useNutrislice({
    widgetId: widget.id,
    config,
    updateWidget,
    addToast,
  });

  const hotLunchItem = config.isManualMode
    ? config.manualHotLunch || t('widgets.lunchCount.noHotLunch')
    : (cachedMenu?.hotLunch?.name ?? t('common.loading'));

  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const fontClass =
    globalStyle.fontFamily === 'sans'
      ? 'font-sans'
      : `font-${globalStyle.fontFamily}`;
  const mhsCardColor = config.cardColor ?? '#f8fafc';
  const mhsCardOpacity = config.cardOpacity ?? 0.3;

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="flex flex-col items-center justify-center h-full w-full relative group transition-colors duration-500 overflow-hidden">
          {/* Subtle background — respects cardColor/cardOpacity settings */}
          <div
            className="absolute inset-0 -z-10"
            style={{
              backgroundColor: hexToRgba(mhsCardColor, mhsCardOpacity),
            }}
          />

          {/* Subtle Refresh Button - only visible on hover */}
          <Button
            {...tourAttr('lunch-count.refresh-menu', widget.id, widget.type)}
            onClick={() => void fetchNutrislice()}
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 rounded-xl bg-white/40 hover:bg-white border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              width: 'min(32px, 8cqmin)',
              height: 'min(32px, 8cqmin)',
              padding: 0,
            }}
            disabled={isSyncing}
            aria-label="Refresh menu"
          >
            <RefreshCw
              style={{
                width: 'min(16px, 4.5cqmin)',
                height: 'min(16px, 4.5cqmin)',
              }}
              className={isSyncing ? 'animate-spin' : ''}
            />
          </Button>

          <div
            className={`flex flex-col items-center justify-center w-full h-full gap-[0.5cqh] px-[4cqw] ${fontClass}`}
          >
            <span
              className="font-black uppercase text-brand-red-primary tracking-[0.2em] opacity-60"
              style={{ fontSize: 'min(14cqh, 4cqw)' }}
            >
              {t('widgets.lunchCount.hotLunch')}
            </span>

            <div
              className="font-black text-slate-900 leading-[1.1] tracking-tighter text-center line-clamp-3"
              style={{
                fontSize:
                  hotLunchItem.length > 20
                    ? 'min(45cqh, 10cqw)'
                    : 'min(55cqh, 12cqw)',
                color: 'var(--spart-primary, #2d3f89)', // Brand Blue Primary
              }}
            >
              {hotLunchItem}
            </div>

            <div
              className="opacity-40 uppercase tracking-[0.2em] text-slate-900 font-black mt-[1.5cqh]"
              style={{ fontSize: 'min(10cqh, 3.5cqw)' }}
            >
              {new Date().toLocaleDateString(i18n.language, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>
      }
    />
  );
};
