import React, { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DetailRow } from './details';
import { fitDetails } from './fitDetails';

const WIDE_RATIO = 1.5;
const STACKED_SHARES = [0.34, 0.4, 0.46, 0.52, 0.58, 0.64, 0.7];
// The temperature fills about this much height per unit of width; more would only be blank.
const HERO_HEIGHT_PER_WIDTH = 0.68;
const WIDE_SHARES = [0.45, 0.5, 0.55, 0.6, 0.65];

const NO_SPACE_UNITS = new Set(['%', '"']);

const displayValue = (row: DetailRow) =>
  row.unit
    ? `${row.value}${NO_SPACE_UNITS.has(row.unit) ? '' : ' '}${row.unit}`
    : row.value;

/** Puts the readings beside the weather face on wide widgets and under it otherwise. */
export const WeatherDetailsLayout: React.FC<{
  rows: DetailRow[];
  color: string;
  labelColor?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ rows, color, labelColor, className = '', children }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDListElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fit, setFit] = useState({ key: '', scale: 1 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;
  const wide = height > 0 && width / height >= WIDE_RATIO;
  const pad = Math.min(16, 0.04 * Math.min(width, height));
  const lines = rows.map((row) => ({
    field: row.field,
    label: t(`widgets.weather.details.${row.field}`),
    value: displayValue(row),
  }));
  // Readings take only the share they can use, so the temperature keeps the rest.
  const heroShare = height > 0 ? (HERO_HEIGHT_PER_WIDTH * width) / height : 1;
  const stackedShares = STACKED_SHARES.filter(
    (share, i) => i < 5 || share <= 1 - heroShare
  );
  const shares = wide ? WIDE_SHARES : stackedShares;
  const fitAt = (share: number) => {
    const boxWidth = Math.max((wide ? share * width : width) - pad * 2, 0);
    const boxHeight = Math.max((wide ? height : share * height) - pad * 2, 0);
    return {
      share,
      boxWidth,
      boxHeight,
      ...fitDetails(lines, boxWidth, boxHeight),
    };
  };
  const roomiest = fitAt(shares[shares.length - 1]);
  const {
    share,
    boxWidth,
    boxHeight,
    rows: rowCount,
    fontPx,
  } = shares.map(fitAt).find((f) => f.fontPx >= roomiest.fontPx * 0.95) ??
  roomiest;
  const fitKey = `${width}x${height}|${lines
    .map((line) => `${line.label}=${line.value}`)
    .join(',')}`;
  const scale = fit.key === fitKey ? fit.scale : 1;

  // The width estimate is close but not exact; shrink once more if the real list overflows.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || width === 0) return;
    const ratio = Math.min(
      1,
      boxHeight / list.offsetHeight,
      boxWidth / list.scrollWidth
    );
    if (ratio < 0.995 || fit.key !== fitKey) {
      setFit({ key: fitKey, scale: scale * Math.min(1, ratio * 0.99) });
    }
  }, [fitKey, scale, fit.key, boxHeight, boxWidth, width]);

  return (
    <div
      ref={ref}
      data-testid="weather-details"
      className={`flex h-full w-full ${wide ? 'flex-row' : 'flex-col justify-center'} ${className}`}
    >
      {/* Stacked: the face is only as tall as the temperature needs, and the pair is centered. */}
      <div
        className={`min-h-0 min-w-0 [container-type:size] ${wide ? 'flex-1' : 'shrink'}`}
        style={
          wide
            ? undefined
            : {
                height: Math.min(
                  HERO_HEIGHT_PER_WIDTH * width,
                  (1 - share) * height
                ),
              }
        }
      >
        {children}
      </div>
      {width > 0 && (
        <div
          className={`shrink-0 min-h-0 min-w-0 flex items-center ${wide ? '' : 'justify-center'}`}
          style={{
            ...(wide ? { width: `${share * 100}%` } : {}),
            padding: pad,
          }}
        >
          <dl
            ref={listRef}
            className="grid grid-flow-col leading-none"
            style={{
              gridTemplateRows: `repeat(${rowCount}, auto)`,
              columnGap: '1.6em',
              rowGap: '0.75em',
              fontSize: `${fontPx * scale}px`,
              color,
            }}
          >
            {lines.map((line) => (
              <div
                key={line.field}
                className="flex items-baseline whitespace-nowrap"
              >
                <dt
                  className="font-medium"
                  style={{
                    color: labelColor ?? color,
                    opacity: labelColor ? 1 : 0.75,
                  }}
                >
                  {line.label}
                </dt>
                <dd
                  className="font-bold tabular-nums"
                  style={{ marginLeft: '0.4em' }}
                >
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
};
