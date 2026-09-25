import React, { useLayoutEffect, useRef, useState } from 'react';
import { GuidedLearningPublicStep } from '@/types';
import type { PxRect, Side } from '../../types/stage';
import {
  CALLOUT_PADDING,
  placeCallout,
  type Point,
} from '../../utils/calloutPlacement';
import {
  CALLOUT_TONE_STYLES,
  calloutScaleOf,
  calloutToneOf,
  calloutWidthPctOf,
} from '../../utils/calloutStyle';
import { pinSizePx } from '../../utils/regionGeometry';
import { renderStepText } from '../../utils/richText';
import { CalloutArrow } from './CalloutArrow';

interface Props {
  step: GuidedLearningPublicStep;
  containerWidth: number;
  containerHeight: number;
  /** Keep-out rect in container px (region, spotlight or pin); defaults to the pin footprint. */
  target?: PxRect;
  /** Pinned callout centre in container px; absent = auto placement. */
  pinned?: Point;
  /** Draw the anchor dot on the pin (steps without a drawn region). */
  showAnchor?: boolean;
  /** Studio inline editor shown in place of the label and text. */
  editor?: React.ReactNode;
}

const PREFER: Record<string, Side | undefined> = {
  above: 'top',
  below: 'bottom',
  left: 'left',
  right: 'right',
};

/** Glass tooltip card placed off its target, with an arrow to it */
export const TooltipInteraction: React.FC<Props> = ({
  step,
  containerWidth,
  containerHeight,
  target,
  pinned,
  showAnchor = true,
  editor,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState({ w: 0, h: 0 });
  // Width the card is squeezed to; natural size is only measured while unsqueezed.
  const squeezedRef = useRef(false);

  // Card size drives placement; ResizeObserver keeps it current as text wraps.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const read = () => {
      if (squeezedRef.current) return;
      setMeasured({ w: el.offsetWidth, h: el.offsetHeight });
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const x = (step.xPct / 100) * containerWidth;
  const y = (step.yPct / 100) * containerHeight;
  const widthPct = calloutWidthPctOf(step);
  const fitWidth = Math.max(0, containerWidth - 2 * CALLOUT_PADDING);
  const authoredWidth =
    widthPct !== undefined && containerWidth > 0
      ? Math.min((widthPct / 100) * containerWidth, fitWidth)
      : undefined;
  const cardW =
    measured.w > 0
      ? measured.w
      : (authoredWidth ?? Math.min(340, containerWidth * 0.5));
  const cardH = measured.h || Math.max(76, containerHeight * 0.16);
  const pin = pinSizePx({ w: containerWidth, h: containerHeight });
  const keepOut: PxRect = target ?? {
    x: x - pin / 2,
    y: y - pin / 2,
    w: pin,
    h: pin,
  };

  const placement = placeCallout({
    box: { w: cardW, h: cardH },
    target: keepOut,
    container: { w: containerWidth, h: containerHeight },
    prefer: PREFER[step.tooltipPosition ?? 'auto'],
    pinned,
    offset: Math.max(0, step.tooltipOffset ?? 16),
  });
  const squeezed = placement.width < cardW - 0.5;
  // eslint-disable-next-line react-hooks/refs
  squeezedRef.current = squeezed;

  const tone = CALLOUT_TONE_STYLES[calloutToneOf(step)];
  const cardWidth = squeezed
    ? placement.width
    : (authoredWidth ?? 'max-content');
  const cardMaxWidth =
    squeezed || authoredWidth !== undefined
      ? cardWidth
      : 'calc(var(--gl-callout-max-w, min(340px, 50cqw)) * var(--gl-callout-scale, 1))';

  return (
    <div
      data-gl-overlay={step.id}
      className="absolute inset-0 pointer-events-none z-20"
    >
      <CalloutArrow
        from={placement.arrow.from}
        to={placement.arrow.to}
        normal={placement.arrow.normal}
        color={tone.line}
        halo={tone.halo}
      />
      {/* Anchor dot on the pin — ringed so it reads on light screenshots too. */}
      {showAnchor && (
        <span
          aria-hidden="true"
          className="absolute rounded-full bg-white border-2 border-slate-900/80 shadow-md"
          style={{
            left: x,
            top: y,
            width: 'clamp(8px, 2.5cqmin, 12px)',
            height: 'clamp(8px, 2.5cqmin, 12px)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
      <div
        ref={cardRef}
        role="note"
        data-testid="gl-tooltip-card"
        data-gl-callout={step.id}
        data-side={placement.side}
        className={`absolute flex flex-col ${
          placement.side === 'left'
            ? 'items-end text-right'
            : 'items-start text-left'
        } ${tone.tooltipCard} rounded-2xl leading-relaxed shadow-2xl animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none`}
        style={
          {
            '--gl-callout-scale': calloutScaleOf(step),
            left: placement.left,
            top: placement.top,
            maxWidth: cardMaxWidth,
            width: cardWidth,
            padding:
              'calc(min(12px, 2.8cqmin) * var(--gl-callout-scale)) calc(min(16px, 3.6cqmin) * var(--gl-callout-scale))',
            fontSize:
              'calc(var(--gl-text-body, min(16px, 4cqmin)) * var(--gl-callout-scale))',
          } as React.CSSProperties
        }
      >
        {editor ?? (
          <>
            {step.label && (
              <div
                className={`font-bold ${tone.title} mb-1 tracking-tight`}
                style={{
                  fontSize:
                    'calc(var(--gl-text-title, min(18px, 4.2cqmin)) * var(--gl-callout-scale))',
                }}
              >
                {renderStepText(step.label)}
              </div>
            )}
            <div className={`${tone.body} whitespace-pre-wrap`}>
              {renderStepText(step.text)}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
