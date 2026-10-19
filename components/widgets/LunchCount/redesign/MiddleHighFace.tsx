import React from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { DEFAULT_GLOBAL_STYLE } from '@/types';
import type { WidgetData } from '@/types';
import { IconButton } from '@/components/common/IconButton';
import { tourAttr } from '@/config/tourAnchors';
import { hexToRgba } from '@/utils/styles';
import { WidgetLayout } from '../../WidgetLayout';
import type { LunchCountModel } from './useLunchCountModel';
import { menuLine } from './lunchCountFormat';

interface MiddleHighFaceProps {
  widget: WidgetData;
  model: LunchCountModel;
}

// Longer entrees step down so they wrap inside the card; anything left over scrolls.
const heroSize = (length: number): string =>
  length > 120
    ? 'clamp(12px, 5cqmin, 56px)'
    : length > 60
      ? 'clamp(12px, 7cqmin, 80px)'
      : length > 20
        ? 'clamp(14px, 11cqmin, 110px)'
        : 'clamp(16px, 15cqmin, 140px)';

export const MiddleHighFace: React.FC<MiddleHighFaceProps> = ({
  widget,
  model,
}) => {
  const { t, i18n } = useTranslation();
  const { config, cachedMenu, isSyncing, fetchNutrislice, activeDashboard } =
    model;

  const noHotLunch = t('widgets.lunchCount.noHotLunch');
  const line = config.isManualMode
    ? { kind: 'item' as const, text: config.manualHotLunch || noHotLunch }
    : menuLine(cachedMenu?.hotLunch?.name, {
        hasCache: !!cachedMenu,
        isSyncing,
        syncError: config.syncError,
        isManualMode: false,
        noItemText: noHotLunch,
      });
  const hotLunchItem =
    line.kind === 'item'
      ? line.text
      : line.kind === 'unavailable'
        ? t('widgets.lunchCount.menuUnavailable')
        : t('common.loading');

  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const fontClass =
    globalStyle.fontFamily === 'sans'
      ? 'font-sans'
      : `font-${globalStyle.fontFamily}`;
  const cardColor = config.cardColor ?? '#f8fafc';
  const cardOpacity = config.cardOpacity ?? 0.3;

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="flex flex-col items-center justify-center h-full w-full relative group overflow-hidden">
          <div
            className="absolute inset-0 -z-10"
            style={{ backgroundColor: hexToRgba(cardColor, cardOpacity) }}
          />

          <div
            className="absolute z-10"
            style={{ top: 'min(10px, 2cqmin)', right: 'min(10px, 2cqmin)' }}
          >
            <IconButton
              {...tourAttr('lunch-count.refresh-menu', widget.id, widget.type)}
              onClick={() => void fetchNutrislice()}
              disabled={isSyncing}
              label={t('widgets.lunchCount.refreshMenu')}
              variant="glass"
              shape="square"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100 active:bg-slate-800/15"
              style={{ padding: 'min(8px, 1.6cqmin)' }}
              icon={
                <RefreshCw
                  aria-hidden="true"
                  className={
                    isSyncing ? 'animate-spin motion-reduce:animate-none' : ''
                  }
                  style={{
                    width: 'clamp(16px, 4.5cqmin, 28px)',
                    height: 'clamp(16px, 4.5cqmin, 28px)',
                  }}
                />
              }
            />
          </div>

          <div
            className={`flex flex-col w-full h-full overflow-y-auto custom-scrollbar text-center ${fontClass}`}
            style={{ padding: '4cqmin 6cqmin' }}
          >
            <div
              className="my-auto flex flex-col items-center"
              style={{ gap: 'min(10px, 2cqmin)' }}
            >
              <span
                className="font-bold uppercase tracking-[0.2em] text-slate-700"
                style={{ fontSize: 'clamp(11px, 5cqmin, 28px)' }}
              >
                {t('widgets.lunchCount.hotLunch')}
              </span>

              <div
                className="font-black leading-[1.1] tracking-tight [overflow-wrap:anywhere]"
                style={{
                  fontSize: heroSize(hotLunchItem.length),
                  color: 'var(--spart-primary, #2d3f89)',
                }}
              >
                {hotLunchItem}
              </div>

              <div
                className="uppercase tracking-[0.2em] text-slate-600 font-bold"
                style={{ fontSize: 'clamp(10px, 3.5cqmin, 22px)' }}
              >
                {new Date().toLocaleDateString(i18n.language, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
};
