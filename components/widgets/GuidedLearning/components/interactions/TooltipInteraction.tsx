import React, { useLayoutEffect, useRef, useState } from 'react';
import { GuidedLearningPublicStep } from '@/types';

interface Props {
  step: GuidedLearningPublicStep;
  containerWidth: number;
  containerHeight: number;
  // Radius (px) the card must stay outside of, e.g. an active spotlight.
  keepOutRadius?: number;
}

type ResolvedPosition = 'above' | 'below' | 'left' | 'right';

const EDGE_PADDING = 12;
const KEEP_OUT_GAP = 12;

/** Glass tooltip card anchored to the hotspot with a connector line */
export const TooltipInteraction: React.FC<Props> = ({
  step,
  containerWidth,
  containerHeight,
  keepOutRadius = 0,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState({ w: 0, h: 0 });

  // Card size drives clamping; ResizeObserver keeps it current as text wraps.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const read = () => setMeasured({ w: el.offsetWidth, h: el.offsetHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const x = (step.xPct / 100) * containerWidth;
  const y = (step.yPct / 100) * containerHeight;
  const cardW = measured.w || Math.min(340, containerWidth * 0.5);
  const cardH = measured.h || Math.max(76, containerHeight * 0.16);
  const baseOffset = Math.max(0, step.tooltipOffset ?? 16);
  const offset =
    keepOutRadius > 0
      ? Math.max(baseOffset, keepOutRadius + KEEP_OUT_GAP)
      : baseOffset;
  const desired = step.tooltipPosition ?? 'auto';

  let position: ResolvedPosition;
  if (desired === 'auto') {
    const room: Record<ResolvedPosition, number> = {
      below: containerHeight - y,
      above: y,
      right: containerWidth - x,
      left: x,
    };
    const needV = cardH + offset + EDGE_PADDING;
    const needH = cardW + offset + EDGE_PADDING;
    if (room.below >= needV) position = 'below';
    else if (room.above >= needV) position = 'above';
    else if (room.right >= needH) position = 'right';
    else if (room.left >= needH) position = 'left';
    else
      position = (Object.keys(room) as ResolvedPosition[]).reduce((a, b) =>
        room[b] > room[a] ? b : a
      );
  } else {
    position = desired;
  }

  let cardLeft: number;
  let cardTop: number;
  switch (position) {
    case 'above':
      cardLeft = x - cardW / 2;
      cardTop = y - offset - cardH;
      break;
    case 'below':
      cardLeft = x - cardW / 2;
      cardTop = y + offset;
      break;
    case 'left':
      cardLeft = x - offset - cardW;
      cardTop = y - cardH / 2;
      break;
    default:
      cardLeft = x + offset;
      cardTop = y - cardH / 2;
  }
  // Clamp inside the container so the card is never clipped by overflow.
  const maxLeft = Math.max(EDGE_PADDING, containerWidth - cardW - EDGE_PADDING);
  const maxTop = Math.max(EDGE_PADDING, containerHeight - cardH - EDGE_PADDING);
  cardLeft = Math.min(Math.max(cardLeft, EDGE_PADDING), maxLeft);
  cardTop = Math.min(Math.max(cardTop, EDGE_PADDING), maxTop);

  // Connector runs from the pin to the nearest card edge along the placement axis.
  const vertical = position === 'above' || position === 'below';
  const edge = vertical
    ? position === 'below'
      ? cardTop
      : cardTop + cardH
    : position === 'right'
      ? cardLeft
      : cardLeft + cardW;
  const gap = vertical ? Math.abs(edge - y) : Math.abs(edge - x);
  const showConnector = gap > 2;
  const connectorStyle: React.CSSProperties = vertical
    ? { left: x - 1, top: Math.min(y, edge), width: 2, height: gap }
    : { top: y - 1, left: Math.min(x, edge), height: 2, width: gap };

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {showConnector && (
        <span
          aria-hidden="true"
          className="absolute bg-white/70"
          style={connectorStyle}
        />
      )}
      {/* Anchor dot on the pin — ringed so it reads on light screenshots too. */}
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
      <div
        ref={cardRef}
        data-testid="gl-tooltip-card"
        className={`absolute flex flex-col ${
          position === 'left' ? 'items-end text-right' : 'items-start text-left'
        } bg-slate-900/90 backdrop-blur-xl text-white rounded-2xl leading-relaxed shadow-2xl border border-white/20 ring-1 ring-black/40 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none`}
        style={{
          left: cardLeft,
          top: cardTop,
          maxWidth: 'min(340px, 50cqw)',
          width: 'max-content',
          padding: 'min(12px, 2.8cqmin) min(16px, 3.6cqmin)',
          fontSize: 'min(16px, 4cqmin)',
        }}
      >
        {step.label && (
          <div
            className="font-bold text-white mb-1 tracking-tight"
            style={{ fontSize: 'min(18px, 4.2cqmin)' }}
          >
            {step.label}
          </div>
        )}
        <div className="text-slate-100">{step.text}</div>
      </div>
    </div>
  );
};
