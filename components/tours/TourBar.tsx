import React, { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, GripVertical, Volume2, VolumeX, X } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { useDraggablePosition } from './useDraggablePosition';
import { chromeSurface, focusRing } from '@/components/common/lightChrome';
import { iconBtn, primaryBtn, secondaryBtn } from './tourButtons';
import { TourWaitingChip, type TourWaiting } from './TourWaitingChip';

// Up to this many steps get a dot each; longer tours share the width.
const FIXED_DOTS = 24;

/** One dot per step: filled when passed, hollow when catch-up skipped it, a longer pill for the current one (TOURS_10X.md P3). */
const StepDots: React.FC<{
  current: number;
  total: number;
  skipped: readonly number[];
}> = ({ current, total, skipped }) => {
  const skip = new Set(skipped);
  const fixed = total <= FIXED_DOTS;
  return (
    <span
      aria-hidden="true"
      data-testid="tour-bar-dots"
      className="flex h-2 items-center gap-[3px]"
    >
      {Array.from({ length: total }, (_, i) => {
        const now = i === current - 1;
        const tone = now
          ? 'bg-brand-blue-primary'
          : skip.has(i)
            ? 'bg-transparent ring-1 ring-inset ring-brand-blue-primary'
            : i < current - 1
              ? 'bg-brand-blue-primary/70'
              : 'bg-slate-300';
        const size = fixed
          ? now
            ? 'h-1.5 w-3.5'
            : 'h-1.5 w-1.5'
          : `h-1.5 min-w-[3px] ${now ? 'flex-[3]' : 'flex-1'}`;
        return (
          <span
            key={i}
            data-skipped={skip.has(i) ? '' : undefined}
            className={`shrink-0 rounded-full transition-colors motion-reduce:transition-none ${size} ${tone}`}
          />
        );
      })}
    </span>
  );
};

export const TOUR_BAR_POS_KEY = 'spart_tour_bar_pos';

interface TourBarProps {
  current: number;
  total: number;
  onBack?: () => void;
  onNext: () => void;
  /** Shown while the step's target can't be found. */
  onRetry?: () => void;
  /** Left out where Autopilot never runs (web tours, D3). */
  autopilot?: { on: boolean; onChange: (on: boolean) => void };
  readAloud?: { on: boolean; onToggle: () => void };
  onExit: () => void;
  /** Called after the bar moves, so the tip can re-place around it. */
  onPlace?: () => void;
  /** Where the dragged position is remembered; null keeps it for this tour only. */
  positionKey?: string | null;
  /** Tour pacing: one dot per step, with the steps catch-up passed over (0-based) drawn hollow. */
  skipped?: readonly number[];
  /** Tour pacing: the tip folded into a chip under the bar while the step waits for its control. */
  waiting?: TourWaiting;
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
  positionKey = TOUR_BAR_POS_KEY,
  skipped,
  waiting,
}) => {
  const { t } = useTranslation();
  const { ref, pos, gripProps } =
    useDraggablePosition<HTMLDivElement>(positionKey);
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
      data-tour-bar=""
      data-testid="tour-bar"
      className={`fixed flex items-center gap-1 rounded-2xl py-1.5 pl-1 pr-1.5 ${chromeSurface} ${
        pos ? '' : 'left-1/2 -translate-x-1/2'
      }`}
      style={{
        zIndex: Z_INDEX.tourCallout,
        ...(pos
          ? { left: pos.x, top: pos.y }
          : { top: 'calc(12px + env(safe-area-inset-top, 0px))' }),
      }}
    >
      <button
        type="button"
        data-testid="tour-bar-grip"
        className={`flex cursor-grab touch-none items-center self-stretch rounded-lg px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing ${focusRing}`}
        aria-label={t('tours.move')}
        title={t('tours.moveHint')}
        {...gripProps}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex min-w-28 flex-col gap-1 px-1.5">
        <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-slate-600">
          {t('tours.progress', { current, total })}
        </span>
        {skipped && skipped.length > 0 && (
          <span className="sr-only">
            {t('tours.skippedCount', { count: skipped.length })}
          </span>
        )}
        {skipped ? (
          <StepDots current={current} total={total} skipped={skipped} />
        ) : (
          <span
            aria-hidden="true"
            className="h-1 overflow-hidden rounded-full bg-slate-200"
          >
            <span
              data-testid="tour-bar-track"
              className="block h-full rounded-full bg-brand-blue-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${(current / Math.max(total, 1)) * 100}%` }}
            />
          </span>
        )}
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
      {autopilot && (
        <button
          type="button"
          role="switch"
          aria-checked={autopilot.on}
          onClick={() => autopilot.onChange(!autopilot.on)}
          className={`ml-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 ${focusRing}`}
        >
          {/* With step dots the bar runs out of room on a phone; the switch keeps its name for screen readers. */}
          <span className={skipped ? 'max-[440px]:sr-only' : undefined}>
            {t('tours.autopilot')}
          </span>
          <span
            aria-hidden="true"
            className={`relative h-4 w-7 rounded-full transition-colors motion-reduce:transition-none ${
              autopilot.on ? 'bg-brand-blue-primary' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-xs transition-transform motion-reduce:transition-none ${
                autopilot.on ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      )}
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
      {waiting && <TourWaitingChip key={waiting.step} {...waiting} />}
    </div>
  );
};
