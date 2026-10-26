import React, { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DetailRow } from './details';
import { LINE_EM, fitDetails } from './fitDetails';

const WIDE_RATIO = 1.5;
const STACKED_MAX_SHARE = 0.55;
const WIDE_SHARE = 0.54;

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
  const [size, setSize] = useState({ width: 0, height: 0 });

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
  const padY = Math.min(10, 0.025 * Math.min(width, height));
  const padX = Math.min(14, 0.035 * Math.min(width, height));
  const labels = rows.map((row) => t(`widgets.weather.details.${row.field}`));
  const boxWidth = (wide ? width * WIDE_SHARE : width) - padX * 2;
  const boxHeight = (wide ? height : height * STACKED_MAX_SHARE) - padY * 2;
  const { cols, lines, fontPx } = fitDetails(
    rows,
    labels,
    Math.max(boxWidth, 0),
    Math.max(boxHeight, 0)
  );
  const detailsStyle: React.CSSProperties = wide
    ? { width: `${WIDE_SHARE * 100}%`, padding: `${padY}px ${padX}px` }
    : {
        height: `${lines * LINE_EM * fontPx + padY * 2}px`,
        padding: `${padY}px ${padX}px`,
      };

  return (
    <div
      ref={ref}
      data-testid="weather-details"
      className={`flex h-full w-full ${wide ? 'flex-row' : 'flex-col'} ${className}`}
    >
      <div className="flex-1 min-h-0 min-w-0 [container-type:size]">
        {children}
      </div>
      {width > 0 && (
        <div
          className={`shrink-0 min-h-0 min-w-0 border-slate-200/70 ${
            wide ? 'border-l' : 'border-t'
          }`}
          style={detailsStyle}
        >
          <dl
            className="grid h-full content-center leading-tight"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              columnGap: `${cols > 1 ? 0.06 * boxWidth : 0}px`,
              fontSize: `${fontPx}px`,
              color,
            }}
          >
            {rows.map((row, i) => (
              <div
                key={row.field}
                className={`flex items-baseline justify-between whitespace-nowrap ${
                  i >= cols ? 'border-t border-slate-200/70' : ''
                }`}
                style={{ gap: '0.6em', paddingBlock: '0.42em' }}
              >
                <dt
                  style={{
                    color: labelColor ?? color,
                    opacity: labelColor ? 1 : 0.75,
                  }}
                >
                  {labels[i]}
                </dt>
                <dd className="font-bold tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
};
