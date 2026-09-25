import React, { useLayoutEffect, useRef, useState } from 'react';
import { GuidedLearningPublicStep } from '@/types';
import type { PxRect, Side } from '../../types/stage';
import {
  CALLOUT_PADDING,
  connectorFor,
  placeCallout,
  type Point,
} from '../../utils/calloutPlacement';
import {
  CALLOUT_TITLE_RATIO,
  CALLOUT_TONE_STYLES,
  calloutScaleOf,
  calloutToneOf,
  calloutWidthPctOf,
} from '../../utils/calloutStyle';
import { pinSizePx } from '../../utils/regionGeometry';
import { renderStepText } from '../../utils/richText';
import { CalloutArrow } from './CalloutArrow';
import { FIT_BODY_VAR, useFitCalloutText } from './useFitCalloutText';

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
  /** Explicit box in container px; overrides pin, width, scale and position, and fits the text. */
  box?: PxRect;
  /** Studio only: outline the box when its text overflows at the floor size. */
  showFit?: boolean;
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
  box,
  showFit = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const fit = useFitCalloutText(
    cardRef,
    box,
    `${step.label ?? ''}\u0000${step.text ?? ''}`,
    editor !== undefined
  );
  const [measured, setMeasured] = useState({ w: 0, h: 0 });
  // Width the card is squeezed to; natural size is only measured while unsqueezed.
  const squeezedRef = useRef(false);
  // Always-current rendered size, read even while squeezed, so the connector routes from the real rect.
  const [rendered, setRendered] = useState({ w: 0, h: 0 });

  // Card size drives placement; ResizeObserver keeps it current as text wraps.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const read = () => {
      // A Studio resize preview sizes the card itself; placement waits for the release.
      if (el.hasAttribute('data-gl-previewing')) return;
      const size = { w: el.offsetWidth, h: el.offsetHeight };
      setRendered((prev) =>
        prev.w === size.w && prev.h === size.h ? prev : size
      );
      if (squeezedRef.current) return;
      setMeasured(size);
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

  const auto = placeCallout({
    box: { w: cardW, h: cardH },
    target: keepOut,
    container: { w: containerWidth, h: containerHeight },
    prefer: PREFER[step.tooltipPosition ?? 'auto'],
    pinned,
    offset: Math.max(0, step.tooltipOffset ?? 16),
  });
  // An explicit box keeps its stored size and position; only a text overflow grows it downward.
  const boxHeight = box ? Math.max(box.h, fit?.heightPx ?? 0) : 0;
  const boxRect: PxRect | null = box
    ? {
        x: box.x,
        y: Math.max(0, Math.min(box.y, containerHeight - boxHeight)),
        w: box.w,
        h: boxHeight,
      }
    : null;
  const placement = boxRect
    ? {
        left: boxRect.x,
        top: boxRect.y,
        width: boxRect.w,
        side: undefined,
      }
    : auto;
  const squeezed = !boxRect && placement.width < cardW - 0.5;
  // eslint-disable-next-line react-hooks/refs
  squeezedRef.current = squeezed;
  const arrowRect: PxRect = boxRect ?? {
    x: placement.left,
    y: placement.top,
    w: squeezed ? placement.width : rendered.w || placement.width,
    h: rendered.h || cardH,
  };
  const arrow = connectorFor(arrowRect, keepOut);
  const keepOutCentre = {
    x: keepOut.x + keepOut.w / 2,
    y: keepOut.y + keepOut.h / 2,
  };

  const tone = CALLOUT_TONE_STYLES[calloutToneOf(step)];
  const overflowing = showFit && fit?.overflow === true;
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
      {arrow ? (
        <CalloutArrow
          stepId={step.id}
          from={arrow.from}
          to={arrow.to}
          normal={arrow.normal}
          color={tone.line}
          halo={tone.halo}
        />
      ) : (
        showFit && (
          <CalloutArrow
            stepId={step.id}
            from={keepOutCentre}
            to={keepOutCentre}
            color={tone.line}
            halo={tone.halo}
            hidden
          />
        )
      )}
      {/* Anchor dot on the pin — ringed so it reads on light screenshots too. */}
      {showAnchor && (
        <span
          aria-hidden="true"
          data-gl-anchor={step.id}
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
        data-gl-callout-overflow={overflowing || undefined}
        data-side={placement.side}
        className={`absolute flex flex-col ${
          placement.side === 'left'
            ? 'items-end text-right'
            : 'items-start text-left'
        } ${tone.tooltipCard} rounded-2xl leading-relaxed shadow-2xl animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none${
          overflowing
            ? ' outline outline-2 outline-offset-2 outline-amber-400'
            : ''
        }`}
        style={
          boxRect
            ? ({
                [FIT_BODY_VAR]: fit ? `${fit.bodyPx}px` : undefined,
                fontSize: `var(${FIT_BODY_VAR}, 16px)`,
                left: boxRect.x,
                top: boxRect.y,
                width: boxRect.w,
                minHeight: boxRect.h,
                padding: '0.75em 1em',
                overflowWrap: 'anywhere',
              } as React.CSSProperties)
            : ({
                '--gl-callout-scale': calloutScaleOf(step),
                left: placement.left,
                top: placement.top,
                maxWidth: cardMaxWidth,
                width: cardWidth,
                padding:
                  'calc(min(12px, 2.8cqmin) * var(--gl-callout-scale)) calc(min(16px, 3.6cqmin) * var(--gl-callout-scale))',
                fontSize:
                  'calc(var(--gl-text-body, min(16px, 4cqmin)) * var(--gl-callout-scale))',
              } as React.CSSProperties)
        }
      >
        {editor ?? (
          <>
            {step.label && (
              <div
                className={`font-bold ${tone.title} mb-1 tracking-tight`}
                style={{
                  fontSize: boxRect
                    ? `${CALLOUT_TITLE_RATIO}em`
                    : 'calc(var(--gl-text-title, min(18px, 4.2cqmin)) * var(--gl-callout-scale))',
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
