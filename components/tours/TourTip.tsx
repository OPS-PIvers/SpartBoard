import React from 'react';
import { useTranslation } from 'react-i18next';
import { MousePointerClick, Play } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { CALLOUT_IN_MS } from '@/components/widgets/GuidedLearning/utils/motion';
import type { TetherArrow } from '@/components/widgets/GuidedLearning/utils/calloutPlacement';
import { chromeMuted, chromeSurface } from '@/components/common/lightChrome';
import { primaryBtn, secondaryBtn } from './tourButtons';

export interface TourTipStatus {
  text: string;
  /** `turn` waits on the teacher; `playing` is Autopilot at work. */
  kind: 'turn' | 'playing';
  testId: string;
}

interface TourTipProps {
  boxRef: React.Ref<HTMLDivElement>;
  headingRef: React.Ref<HTMLDivElement>;
  left: number;
  top: number;
  width: number;
  /** Arrow toward the target; null for a centred tip. */
  tether: TetherArrow | null;
  plain: boolean;
  animate: boolean;
  title: string;
  /** Step text, slide preview or the missing-anchor line. */
  children?: React.ReactNode;
  looking: boolean;
  status: TourTipStatus | null;
  onShowMe?: () => void;
  /** Shown on steps Autopilot can perform. */
  autopilotStep?: { onRun: () => void };
  /** Asks before Autopilot performs a step that outlives the tour. */
  confirm?: { onYes: () => void; onNo: () => void };
  /** Shown on steps that don't move on by themselves. */
  next?: { onNext: () => void; last: boolean };
}

const ARROW_W = 18;
const ARROW_H = 9;

const arrowStyle = ({ edge, offset }: TetherArrow): React.CSSProperties => {
  // Drawn pointing up, then turned to face its edge; overlaps the border by 1px.
  const half = ARROW_W / 2;
  const rotate = { top: 0, right: 90, bottom: 180, left: 270 }[edge];
  const base: React.CSSProperties = {
    position: 'absolute',
    width: ARROW_W,
    height: ARROW_H,
    transform: `rotate(${rotate}deg)`,
  };
  if (edge === 'top')
    return { ...base, top: -ARROW_H + 1, left: offset - half };
  if (edge === 'bottom')
    return { ...base, bottom: -ARROW_H + 1, left: offset - half };
  // Side arrows rotate about their centre, so shift by half the length difference.
  const shift = (ARROW_W - ARROW_H) / 2;
  return edge === 'left'
    ? { ...base, left: -ARROW_H + 1 - shift, top: offset - ARROW_H / 2 }
    : { ...base, right: -ARROW_H + 1 - shift, top: offset - ARROW_H / 2 };
};

/** The step's instruction, tethered to its target by an arrow. */
export const TourTip: React.FC<TourTipProps> = ({
  boxRef,
  headingRef,
  left,
  top,
  width,
  tether,
  plain,
  animate,
  title,
  children,
  looking,
  status,
  onShowMe,
  autopilotStep,
  confirm,
  next,
}) => {
  const { t } = useTranslation();
  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-step-title"
      tabIndex={-1}
      data-tour-ignore=""
      data-testid="tour-callout"
      data-plain={plain ? '' : undefined}
      data-tether={tether?.edge}
      className={`fixed flex flex-col gap-2 rounded-2xl px-4 py-3 leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50 ${chromeSurface}`}
      style={{
        zIndex: Z_INDEX.tourCallout,
        left,
        top,
        width,
        animation: animate
          ? `gl-callout-in ${CALLOUT_IN_MS}ms ease-out both`
          : undefined,
      }}
    >
      {tether && (
        <svg
          aria-hidden="true"
          data-testid="tour-tip-arrow"
          viewBox={`0 0 ${ARROW_W} ${ARROW_H}`}
          className="overflow-visible fill-white stroke-slate-900/[0.08]"
          style={arrowStyle(tether)}
        >
          <path d={`M0 ${ARROW_H} L${ARROW_W / 2} 0 L${ARROW_W} ${ARROW_H}`} />
        </svg>
      )}
      <div
        id="tour-step-title"
        ref={headingRef}
        tabIndex={-1}
        data-testid="tour-step-title"
        className="rounded font-bold tracking-tight text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50"
      >
        {title}
      </div>
      {children}
      {looking && (
        <p role="status" className={`text-xs ${chromeMuted}`}>
          {t('tours.looking')}
        </p>
      )}
      {status && (
        <p
          role="status"
          data-testid={status.testId}
          className={`flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold ${
            status.kind === 'turn'
              ? 'bg-brand-blue-primary text-white'
              : 'bg-brand-blue-lighter text-brand-blue-dark'
          }`}
        >
          {status.kind === 'turn' ? (
            <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {status.text}
        </p>
      )}
      {confirm && (
        <div data-testid="tour-auto-confirm" className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-900">
            {t('tours.autoConfirm')}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm.onYes}
              className={primaryBtn}
            >
              {t('tours.autoConfirmYes')}
            </button>
            <button
              type="button"
              onClick={confirm.onNo}
              className={secondaryBtn}
            >
              {t('tours.autoConfirmNo')}
            </button>
          </div>
        </div>
      )}
      {(!!onShowMe || !!autopilotStep || !!next) && (
        <div className="-mx-2 flex flex-wrap items-center gap-1">
          {onShowMe && (
            <button
              type="button"
              onClick={onShowMe}
              className={`${secondaryBtn} flex items-center gap-1.5 px-2`}
            >
              <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
              {t('tours.showMe')}
            </button>
          )}
          {autopilotStep && (
            <button
              type="button"
              onClick={autopilotStep.onRun}
              className={`${secondaryBtn} flex items-center gap-1.5 px-2`}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {t('tours.autopilotStep')}
            </button>
          )}
          {next && (
            <button
              type="button"
              data-testid="tour-tip-next"
              onClick={next.onNext}
              className={`${primaryBtn} ml-auto mr-2`}
            >
              {next.last ? t('tours.done') : t('tours.next')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
