import React, { useLayoutEffect, useRef, useState } from 'react';
import { useGlobalStyle } from '@/context/dashboardCanvasStore';
import { findFittingFontSize } from './randomFlashFit';

/**
 * Placeholder text shown when no winner has been picked yet. Exported so the
 * sizing formula in RandomWidget can match its width to this exact string —
 * keep the two in sync if this is ever translated or replaced.
 */
export const RANDOM_FLASH_PLACEHOLDER = 'Ready?';

interface RandomFlashProps {
  displayResult: string | string[] | string[][] | null;
  isSpinning: boolean;
  fontSize?: number | string;
}

const TEXT_CLASS = 'leading-tight uppercase';
const TEXT_STYLE = {
  display: 'inline-block',
  maxWidth: '100%',
  textAlign: 'center',
  wordBreak: 'normal',
  overflowWrap: 'normal',
} as const;
const MEASURER_STYLE = {
  position: 'absolute',
  left: '0',
  top: '0',
  visibility: 'hidden',
  pointerEvents: 'none',
} as const;

export const RandomFlash: React.FC<RandomFlashProps> = ({
  displayResult,
  isSpinning,
  fontSize,
}) => {
  const globalStyle = useGlobalStyle();
  const boxRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ label: string; px: number } | null>(null);

  const fontStyle = typeof fontSize === 'number' ? `${fontSize}px` : fontSize;

  // Defensive: this component only renders strings. If stale state ever hands
  // us an array (e.g., RandomGroup[] from a prior 'groups' run), fall back to
  // the idle label rather than crashing React with "Objects are not valid as
  // a React child".
  const label =
    typeof displayResult === 'string' && displayResult.length > 0
      ? displayResult
      : RANDOM_FLASH_PLACEHOLDER;

  // Settled names are measured to fill the box; spinning keeps the stable roster-wide size.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (isSpinning || !box) return;
    const measure = () => {
      const cs = getComputedStyle(box);
      const w =
        box.clientWidth -
        parseFloat(cs.paddingLeft || '0') -
        parseFloat(cs.paddingRight || '0');
      const h =
        box.clientHeight -
        parseFloat(cs.paddingTop || '0') -
        parseFloat(cs.paddingBottom || '0');
      // A throwaway copy so the measuring text never sits in the DOM between fits.
      const measurer = document.createElement('span');
      measurer.className = TEXT_CLASS;
      Object.assign(measurer.style, TEXT_STYLE, MEASURER_STYLE);
      measurer.textContent = label;
      box.appendChild(measurer);
      const px = findFittingFontSize(measurer, w, h);
      measurer.remove();
      setFit(px === null ? null : { label, px });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [label, isSpinning, globalStyle.fontFamily]);

  // Cap by line count so wrapped names fit the flash area's height.
  const words = label.trim().split(/[ \t\n\r\f\v]+/);
  // While spinning keep the roster-wide size so the font doesn't jump each tick.
  const lines = isSpinning ? 1 : words.length;
  const fitted =
    lines > 1
      ? `max(min(${fontStyle}, ${Math.floor(75 / lines)}cqh), min(${Math.max(4, Math.round(75 / label.length))}cqw, 60cqh))`
      : fontStyle;
  const measured = !isSpinning && fit?.label === label ? fit.px : null;

  return (
    <div
      ref={boxRef}
      className={`relative text-center font-black transition-all duration-300 w-full flex items-center justify-center font-${globalStyle.fontFamily} ${
        isSpinning
          ? 'scale-90 opacity-30 grayscale'
          : 'scale-100 text-brand-blue-primary drop-shadow-xl'
      }`}
      style={{
        // Only multi-word names measure against this box; single words keep the widget's units.
        containerType: lines > 1 ? 'size' : undefined,
        height: '100%',
        padding: 'min(12px, 2.5cqmin)',
      }}
    >
      <span
        className={`${TEXT_CLASS} transition-[font-size] duration-300`}
        style={{
          ...TEXT_STYLE,
          fontSize:
            measured !== null ? `${measured}px` : `min(300px, ${fitted})`,
        }}
      >
        {label}
      </span>
    </div>
  );
};
