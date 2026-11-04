import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { hexToRgba } from '@/utils/styles';
import {
  GEAR_LINE_HEIGHT,
  estimateTextWidth,
  layoutRecessGear,
  type MeasureText,
} from './recessGearLayout';

interface Props {
  temperature: React.ReactNode;
  message: React.ReactNode;
  // The message as plain text, for fitting its size.
  messageText: string;
  imageUrl?: string;
  imageAlt: string;
  emoji: string;
  fontColor: string;
  cardColor: string;
  cardOpacity: number;
  textScale: number;
  fallbackWidth: number;
  fallbackHeight: number;
  className: string;
}

const canvasMeasure = (fontFamily: string): MeasureText | null => {
  if (typeof document === 'undefined') return null;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx.measureText !== 'function') return null;
  ctx.font = `700 100px ${fontFamily}`;
  const cache = new Map<string, number>();
  const c = ctx;
  return (text) => {
    let w = cache.get(text);
    if (w === undefined) {
      w = c.measureText(text).width / 100;
      cache.set(text, w);
    }
    return w;
  };
};

export const RecessGearFace: React.FC<Props> = ({
  temperature,
  message,
  messageText,
  imageUrl,
  imageAlt,
  emoji,
  fontColor,
  cardColor,
  cardOpacity,
  textScale,
  fallbackWidth,
  fallbackHeight,
  className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: fallbackWidth,
    height: fallbackHeight,
  });
  const [fontFamily, setFontFamily] = useState('');
  const [fontsReady, setFontsReady] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setSize((prev) =>
          prev.width === width && prev.height === height
            ? prev
            : { width, height }
        );
      }
      const family = getComputedStyle(el).fontFamily;
      setFontFamily((prev) => (prev === family ? prev : family));
    };
    read();
    const ro =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    ro?.observe(el);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setFontsReady((n) => n + 1);
    });
    return () => {
      live = false;
      ro?.disconnect();
    };
  }, [className]);

  // fontsReady rebuilds the measurer once web fonts finish loading.
  const measure = useMemo<MeasureText>(
    () =>
      fontFamily && fontsReady >= 0
        ? (canvasMeasure(fontFamily) ?? estimateTextWidth)
        : estimateTextWidth,
    [fontFamily, fontsReady]
  );

  const layout = layoutRecessGear({
    width: size.width,
    height: size.height,
    text: messageText,
    measure,
    textScale,
  });
  const side = layout.arrangement === 'side';

  return (
    <div
      ref={ref}
      className={`flex h-full w-full items-center justify-center ${className}`}
      style={{
        flexDirection: layout.orientation === 'row' ? 'row' : 'column',
        padding: layout.pad,
        gap: layout.pad,
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center"
        style={{
          width: layout.tempWidth,
          height: layout.tempHeight,
          containerType: 'size',
        }}
      >
        {temperature}
      </div>
      <div
        data-testid="weather-clothing-card"
        className="flex shrink-0 items-center justify-center overflow-hidden border border-slate-200/60"
        style={{
          width: layout.panelWidth,
          height: layout.panelHeight,
          padding: layout.panelPad,
          gap: layout.panelPad * 0.85,
          borderRadius: layout.radius,
          flexDirection: side ? 'row' : 'column',
          backgroundColor: hexToRgba(cardColor, cardOpacity),
        }}
      >
        {layout.image > 0 && (
          <div
            className="flex shrink-0 items-center justify-center"
            style={{ width: layout.image, height: layout.image }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={imageAlt}
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{ fontSize: layout.image * 0.82, lineHeight: 1 }}
              >
                {emoji}
              </span>
            )}
          </div>
        )}
        <div
          className="flex min-w-0 items-center font-bold"
          style={{
            maxWidth: layout.textWidth,
            maxHeight: layout.textHeight,
            fontSize: layout.fontSize,
            lineHeight: GEAR_LINE_HEIGHT,
            color: fontColor,
            textAlign: side ? 'left' : 'center',
            justifyContent: side ? 'flex-start' : 'center',
            textWrap: 'balance',
          }}
        >
          <div className="w-full">{message}</div>
        </div>
      </div>
    </div>
  );
};
