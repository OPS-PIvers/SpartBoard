import React, { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownUp,
  CloudRain,
  Droplet,
  Droplets,
  Gauge,
  ArrowUp,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { WeatherDetailField } from '@/types';
import { hexToRgba } from '@/utils/styles';
import type { DetailRow } from './details';
import { fitDetails, type DetailsStyle } from './fitDetails';

const WIDE_RATIO = 1.5;
const STACKED_MAX_SHARE = 0.58;
const WIDE_SHARE = 0.58;

const ICONS: Record<
  Exclude<WeatherDetailField, 'moon'>,
  { icon: LucideIcon; className: string }
> = {
  feelsLike: { icon: Thermometer, className: 'text-slate-500' },
  highLow: { icon: ArrowDownUp, className: 'text-slate-500' },
  dewPoint: { icon: Droplet, className: 'text-blue-400' },
  humidity: { icon: Droplets, className: 'text-blue-400' },
  pressure: { icon: Gauge, className: 'text-slate-500' },
  rainDaily: { icon: CloudRain, className: 'text-blue-400' },
  rainMonthly: { icon: Umbrella, className: 'text-blue-400' },
  windAvg: { icon: ArrowUp, className: 'text-slate-500' },
  windGust: { icon: Wind, className: 'text-slate-500' },
  sunrise: { icon: Sunrise, className: 'text-amber-400' },
  sunset: { icon: Sunset, className: 'text-amber-400' },
  uvIndex: { icon: Sun, className: 'text-amber-400' },
};

/** The moon as it looks tonight: lit side on the right while waxing. */
const MoonGlyph: React.FC<{ phase: number }> = ({ phase }) => {
  const r = 10;
  const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;
  const rx = r * Math.abs(1 - 2 * lit);
  const outer = waxing ? 1 : 0;
  const inner = lit < 0.5 === waxing ? 0 : 1;
  return (
    <svg viewBox="-12 -12 24 24" width="1em" height="1em" aria-hidden="true">
      <circle r={r} className="fill-slate-300" />
      <path
        d={`M0 ${-r} A${r} ${r} 0 0 ${outer} 0 ${r} A${rx} ${r} 0 0 ${inner} 0 ${-r}Z`}
        className="fill-amber-100"
      />
      <circle
        r={r}
        fill="none"
        strokeWidth="1.5"
        className="stroke-slate-400"
      />
    </svg>
  );
};

const DetailIcon: React.FC<{ row: DetailRow }> = ({ row }) => {
  if (row.field === 'moon') return <MoonGlyph phase={row.phase ?? 0} />;
  const { icon: Icon, className } = ICONS[row.field];
  return (
    <Icon
      size="1em"
      strokeWidth={2.25}
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      // Wind arrow points the way the wind is blowing.
      style={
        row.direction === undefined
          ? undefined
          : { transform: `rotate(${row.direction + 180}deg)` }
      }
    />
  );
};

const Value: React.FC<{ row: DetailRow }> = ({ row }) => (
  <span className="font-black tabular-nums leading-none whitespace-nowrap">
    {row.value}
    {row.unit && (
      <span
        className="font-bold"
        style={{ fontSize: '0.5em', marginLeft: '0.2em' }}
      >
        {row.unit}
      </span>
    )}
  </span>
);

/** Puts the readings beside the weather face on wide widgets and under it otherwise. */
export const WeatherDetailsLayout: React.FC<{
  rows: DetailRow[];
  color: string;
  labelColor?: string;
  detailsStyle?: DetailsStyle;
  className?: string;
  children: React.ReactNode;
}> = ({
  rows,
  color,
  labelColor,
  detailsStyle = 'grid',
  className = '',
  children,
}) => {
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
  const pad = Math.min(12, 0.03 * Math.min(width, height));
  const labels = rows.map((row) => t(`widgets.weather.details.${row.field}`));
  const boxWidth = Math.max((wide ? width * WIDE_SHARE : width) - pad * 2, 0);
  const boxHeight = Math.max(
    (wide ? height : height * STACKED_MAX_SHARE) - pad * 2,
    0
  );
  const { cols, fontPx } = fitDetails(
    rows,
    labels,
    boxWidth,
    boxHeight,
    detailsStyle
  );
  const fitKey = `${width}x${height}|${detailsStyle}|${rows
    .map((row, i) => `${labels[i]}=${row.value}${row.unit ?? ''}`)
    .join(',')}`;
  const scale = fit.key === fitKey ? fit.scale : 1;

  // The font estimate is close but not exact; shrink once more if the real list overflows.
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
  const rule = hexToRgba(color, 0.14);
  const band = detailsStyle === 'band';

  return (
    <div
      ref={ref}
      data-testid="weather-details"
      className={`flex h-full w-full ${wide ? 'flex-row' : 'flex-col'} ${className}`}
    >
      {/* Stacked: the face sits on the readings so its spare height goes above it, not between. */}
      <div
        className={`flex-1 min-h-0 min-w-0 [container-type:size] ${wide ? '' : '[&>div]:justify-end'}`}
      >
        {children}
      </div>
      {width > 0 && (
        <div
          className="shrink-0 min-h-0 min-w-0 flex items-center"
          style={{
            ...(wide ? { width: `${WIDE_SHARE * 100}%` } : {}),
            padding: pad,
          }}
        >
          <dl
            ref={listRef}
            className="grid w-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              fontSize: `${fontPx * scale}px`,
              color,
            }}
          >
            {rows.map((row, i) => (
              <div
                key={row.field}
                className={`flex min-w-0 ${
                  band
                    ? 'flex-col items-center justify-center text-center'
                    : 'items-center'
                }`}
                style={{
                  gap: band ? '0.22em' : '0.42em',
                  padding: band ? '0.45em 0.45em' : '0.45em 0.55em',
                  borderLeft: i % cols ? `1px solid ${rule}` : undefined,
                  borderTop:
                    !band && i >= cols ? `1px solid ${rule}` : undefined,
                }}
              >
                <span
                  className="flex shrink-0"
                  style={{ fontSize: band ? '1.05em' : '1.25em' }}
                >
                  <DetailIcon row={row} />
                </span>
                <div
                  className={`flex min-w-0 ${band ? 'flex-col-reverse items-center' : 'flex-col'}`}
                  style={{ gap: band ? '0.22em' : '0.2em' }}
                >
                  <dt
                    className="font-black uppercase tracking-wider leading-none whitespace-nowrap"
                    style={{
                      fontSize: '0.5em',
                      color: labelColor ?? color,
                      opacity: labelColor ? 1 : 0.7,
                    }}
                  >
                    {labels[i]}
                  </dt>
                  <dd>
                    <Value row={row} />
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
};
