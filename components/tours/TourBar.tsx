import React, { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, GripVertical, Volume2, VolumeX, X } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { useDraggablePosition } from './useDraggablePosition';
import { iconBtn, primaryBtn, secondaryBtn } from './tourButtons';

export const TOUR_BAR_POS_KEY = 'spart_tour_bar_pos';

interface TourBarProps {
  current: number;
  total: number;
  onBack?: () => void;
  onNext: () => void;
  /** Shown while the step's target can't be found. */
  onRetry?: () => void;
  autopilot: { on: boolean; onChange: (on: boolean) => void };
  readAloud?: { on: boolean; onToggle: () => void };
  onExit: () => void;
  /** Called after the bar moves, so the tip can re-place around it. */
  onPlace?: () => void;
}

/** The tour's controls, in a slim bar at the top that the teacher can drag aside. */
export const TourBar: React.FC<TourBarProps> = ({
  current,
  total,
  onBack,
  onNext,
  onRetry,
  autopilot,
  readAloud,
  onExit,
  onPlace,
}) => {
  const { t } = useTranslation();
  const { ref, pos, gripProps } =
    useDraggablePosition<HTMLDivElement>(TOUR_BAR_POS_KEY);
  const last = current === total;
  const placeKey = pos ? `${pos.x},${pos.y}` : '';
  useLayoutEffect(() => {
    onPlace?.();
  }, [placeKey, onPlace]);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t('tours.controls')}
      data-tour-ignore=""
      data-tour-obstacle=""
      data-testid="tour-bar"
      className={`fixed flex items-center gap-1 rounded-2xl border border-white/20 bg-slate-900/90 py-1.5 pl-1 pr-1.5 text-white shadow-2xl ring-1 ring-black/40 backdrop-blur-xl ${
        pos ? '' : 'left-1/2 -translate-x-1/2'
      }`}
      style={{
        zIndex: Z_INDEX.tourCallout,
        ...(pos
          ? { left: pos.x, top: pos.y }
          : { top: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }),
      }}
    >
      <button
        type="button"
        data-testid="tour-bar-grip"
        className="flex cursor-grab touch-none items-center self-stretch rounded-lg px-1 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:cursor-grabbing"
        aria-label={t('tours.move')}
        title={t('tours.moveHint')}
        {...gripProps}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex min-w-28 flex-col gap-1 px-1.5">
        <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-slate-200">
          {t('tours.progress', { current, total })}
        </span>
        <span
          aria-hidden="true"
          className="h-1 overflow-hidden rounded-full bg-white/15"
        >
          <span
            data-testid="tour-bar-track"
            className="block h-full rounded-full bg-white transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${(current / Math.max(total, 1)) * 100}%` }}
          />
        </span>
      </div>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className={`${secondaryBtn} flex items-center gap-1 pl-2`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {t('tours.back')}
        </button>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry} className={secondaryBtn}>
          {t('tours.retry')}
        </button>
      )}
      <button type="button" onClick={onNext} className={primaryBtn}>
        {last ? t('tours.done') : t('tours.next')}
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={autopilot.on}
        onClick={() => autopilot.onChange(!autopilot.on)}
        className="ml-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        {t('tours.autopilot')}
        <span
          aria-hidden="true"
          className={`relative h-4 w-7 rounded-full transition-colors motion-reduce:transition-none ${
            autopilot.on ? 'bg-white' : 'bg-white/25'
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 h-3 w-3 rounded-full transition-transform motion-reduce:transition-none ${
              autopilot.on
                ? 'translate-x-3.5 bg-slate-900'
                : 'translate-x-0.5 bg-white'
            }`}
          />
        </span>
      </button>
      {readAloud && (
        <button
          type="button"
          aria-pressed={readAloud.on}
          onClick={readAloud.onToggle}
          aria-label={t('glPlayer.readAloud')}
          title={t('glPlayer.readAloud')}
          className={iconBtn}
        >
          {readAloud.on ? (
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <VolumeX className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onExit}
        aria-label={t('tours.exit')}
        title={t('tours.exit')}
        className={iconBtn}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};
