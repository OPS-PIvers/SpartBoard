import React, { useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GuidedLearningPublicStep } from '@/types';
import type { PxRect } from '../../types/stage';
import {
  CALLOUT_PADDING,
  placePopover,
  type Point,
} from '../../utils/calloutPlacement';
import { renderStepText } from '../../utils/richText';
import {
  CALLOUT_TONE_STYLES,
  calloutScaleOf,
  calloutToneOf,
  calloutWidthPctOf,
} from '../../utils/calloutStyle';

interface Props {
  step: GuidedLearningPublicStep;
  onClose: () => void;
  /** Target to keep clear, in container px; absent = always centred. */
  target?: PxRect;
  /** Pinned card centre in container px. */
  pinned?: Point;
  containerWidth?: number;
  containerHeight?: number;
  /** Studio inline editor shown in place of the label and text. */
  editor?: React.ReactNode;
}

export const TextPopoverInteraction: React.FC<Props> = ({
  step,
  onClose,
  target,
  pinned,
  containerWidth = 0,
  containerHeight = 0,
  editor,
}) => {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.offsetWidth, h: el.offsetHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const container = { w: containerWidth, h: containerHeight };
  const canPlace =
    (target !== undefined || pinned !== undefined) &&
    box.w > 0 &&
    container.w > 0 &&
    container.h > 0;
  const clamp = (n: number, lo: number, hi: number) =>
    hi < lo ? lo : Math.min(Math.max(n, lo), hi);
  const placed = !canPlace
    ? null
    : pinned
      ? {
          left: clamp(
            pinned.x - box.w / 2,
            CALLOUT_PADDING,
            container.w - CALLOUT_PADDING - box.w
          ),
          top: clamp(
            pinned.y - box.h / 2,
            CALLOUT_PADDING,
            container.h - CALLOUT_PADDING - box.h
          ),
        }
      : placePopover(box, target as PxRect, container);

  const tone = CALLOUT_TONE_STYLES[calloutToneOf(step)];
  const widthPct = calloutWidthPctOf(step);
  const authoredWidth =
    widthPct === undefined
      ? undefined
      : container.w > 0
        ? Math.min(
            (widthPct / 100) * container.w,
            container.w - 2 * CALLOUT_PADDING
          )
        : `${widthPct}cqw`;

  return (
    <div
      className={
        placed
          ? 'relative w-full h-full'
          : 'w-full h-full flex items-center justify-center'
      }
      style={placed ? undefined : { padding: 'min(16px, 4cqmin)' }}
    >
      <div
        ref={cardRef}
        data-gl-callout={step.id}
        className={`${tone.popoverCard} rounded-2xl shadow-2xl ${
          placed ? 'absolute' : 'relative w-full'
        }`}
        style={
          {
            '--gl-callout-scale': calloutScaleOf(step),
            maxWidth:
              authoredWidth ??
              'calc(var(--gl-popover-max-w, min(380px, 90cqw)) * var(--gl-callout-scale))',
            padding: 'calc(min(20px, 5cqmin) * var(--gl-callout-scale))',
            ...(authoredWidth !== undefined ? { width: authoredWidth } : {}),
            ...(placed
              ? {
                  left: placed.left,
                  top: placed.top,
                  width: authoredWidth ?? box.w,
                }
              : {}),
          } as React.CSSProperties
        }
      >
        <button
          onClick={onClose}
          className={`absolute ${tone.closeButton} transition-colors`}
          style={{
            top: 'min(12px, 3cqmin)',
            right: 'min(12px, 3cqmin)',
          }}
          aria-label={t('glPlayer.close')}
        >
          <X
            style={{
              width: 'min(16px, 4cqmin)',
              height: 'min(16px, 4cqmin)',
            }}
          />
        </button>
        {editor ?? (
          <>
            {step.label && (
              <h3
                className={`${tone.title} font-bold mb-2 pr-6 leading-tight`}
                style={{
                  fontSize:
                    'calc(var(--gl-text-title, min(16px, 4.5cqmin)) * var(--gl-callout-scale))',
                }}
              >
                {renderStepText(step.label)}
              </h3>
            )}
            <p
              className={`${tone.body} leading-relaxed whitespace-pre-wrap`}
              style={{
                fontSize:
                  'calc(var(--gl-text-body, min(14px, 3.5cqmin)) * var(--gl-callout-scale))',
              }}
            >
              {renderStepText(step.text ?? '')}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
