import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WeatherDetailField } from '@/types';
import { hexToRgba } from '@/utils/styles';
import { sunTimes, type DetailRow } from './details';

const WIDE_RATIO = 1.3;
const WIDE_HERO_SHARE = 0.36;
const STACKED_HERO_SHARE = 0.42;
const MAX_BASE_PX = 34;
const GAP_EM = 0.3;
const SUB_EM = 0.72;
const LINE_HEIGHT = 1.25;

type Group = 'sun' | 'wind' | 'wet' | 'air' | 'moon';

// Each instrument lists its headline reading first, then the readings shown as lines under it.
const GROUPS: {
  id: Group;
  headline?: WeatherDetailField;
  lines: WeatherDetailField[];
}[] = [
  { id: 'sun', lines: ['sunrise', 'sunset', 'uvIndex'] },
  { id: 'wind', headline: 'windAvg', lines: ['windGust'] },
  {
    id: 'wet',
    headline: 'humidity',
    lines: ['dewPoint', 'rainDaily', 'rainMonthly'],
  },
  { id: 'air', headline: 'pressure', lines: ['highLow', 'feelsLike'] },
  { id: 'moon', headline: 'moon', lines: [] },
];

// Drawing heights in base-size units.
const DRAWING_EM: Partial<Record<Group, number>> = {
  sun: 2.2,
  wind: 2.6,
  moon: 2.6,
};
const HEADLINE_EM: Record<Group, number> = {
  sun: 0,
  wind: 1,
  wet: 1.5,
  air: 1.2,
  moon: 0.8,
};

const NO_SPACE_UNITS = new Set(['%', '"']);
const displayValue = (row: DetailRow) =>
  row.unit
    ? `${row.value}${NO_SPACE_UNITS.has(row.unit) ? '' : ' '}${row.unit}`
    : row.value;

const SunPath: React.FC<{ progress: number; size: number; rule: string }> = ({
  progress,
  size,
  rule,
}) => {
  const angle = Math.PI * (1 - progress);
  const x = 50 + 40 * Math.cos(angle);
  const y = 46 - 40 * Math.sin(angle);
  return (
    <svg width={size * 2} height={size} viewBox="0 0 100 50" aria-hidden="true">
      <line x1="4" y1="46" x2="96" y2="46" stroke={rule} strokeWidth="1.2" />
      <path
        d="M10 46 A40 40 0 0 1 90 46"
        fill="none"
        strokeWidth="1.2"
        strokeDasharray="2.5 2.5"
        className="stroke-slate-400"
      />
      {progress > 0 && (
        <path
          d={`M10 46 A40 40 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`}
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          className="stroke-amber-400"
        />
      )}
      <circle cx={x} cy={y} r="5" className="fill-amber-400" />
    </svg>
  );
};

const Compass: React.FC<{
  direction?: number;
  size: number;
  color: string;
  rule: string;
}> = ({ direction, size, color, rule }) => (
  <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
    <circle r="10.5" fill="none" stroke={rule} strokeWidth="1.4" />
    {[0, 90, 180, 270].map((a) => (
      <line
        key={a}
        x1="0"
        y1="-10.5"
        x2="0"
        y2="-8.6"
        strokeWidth="1.2"
        transform={`rotate(${a})`}
        className="stroke-slate-400"
      />
    ))}
    <text
      x="0"
      y="-5.2"
      fontSize="3.6"
      fontWeight="700"
      textAnchor="middle"
      className="fill-slate-500"
    >
      N
    </text>
    {/* The arrow points the way the wind is blowing, opposite where it comes from. */}
    {direction !== undefined && (
      <g transform={`rotate(${direction + 180})`}>
        <path d="M0 -7.5 L2.6 1.5 L0 0 L-2.6 1.5 Z" fill={color} />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="7"
          stroke={color}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    )}
  </svg>
);

/** The moon as it looks tonight: lit side on the right while waxing. */
const MoonGlyph: React.FC<{ phase: number; size: number }> = ({
  phase,
  size,
}) => {
  const r = 10;
  const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;
  const rx = r * Math.abs(1 - 2 * lit);
  const outer = waxing ? 1 : 0;
  const inner = lit < 0.5 === waxing ? 0 : 1;
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
      <circle r={r} className="fill-slate-300" />
      <path
        d={`M0 ${-r} A${r} ${r} 0 0 ${outer} 0 ${r} A${rx} ${r} 0 0 ${inner} 0 ${-r}Z`}
        className="fill-amber-100"
      />
      <circle
        r={r}
        fill="none"
        strokeWidth="1.2"
        className="stroke-slate-400"
      />
    </svg>
  );
};

/** How far the fullest instrument cell must shrink to show everything; 1 when it all fits. */
const fitRatio = (grid: HTMLElement) =>
  Array.from(grid.querySelectorAll<HTMLElement>('[data-cell]')).reduce(
    (ratio, cell) =>
      Math.min(
        ratio,
        cell.clientHeight / cell.scrollHeight,
        cell.clientWidth / cell.scrollWidth
      ),
    1
  );

/** Puts drawn readings beside the weather face on wide widgets and under it otherwise. */
export const WeatherDetailsLayout: React.FC<{
  rows: DetailRow[];
  lat: number;
  lon: number;
  color: string;
  labelColor?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ rows, lat, lon, color, labelColor, className = '', children }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fit, setFit] = useState({ key: '', scale: 1 });
  const [now, setNow] = useState(() => Date.now());

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

  // The sun moves along its path through the day.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const byField = new Map(rows.map((row) => [row.field, row]));
  const label = (field: WeatherDetailField) =>
    t(`widgets.weather.details.${field}`);
  const groups = GROUPS.filter(
    (g) =>
      (g.headline !== undefined && byField.has(g.headline)) ||
      g.lines.some((f) => byField.has(f))
  ).map((g) => ({
    ...g,
    headlineRow: g.headline ? byField.get(g.headline) : undefined,
    lineRows: g.lines.flatMap((f) => byField.get(f) ?? []),
  }));

  const { width, height } = size;
  const wide = height > 0 && width / height >= WIDE_RATIO;
  const areaW = wide ? width * (1 - WIDE_HERO_SHARE) : width;
  const areaH = wide ? height : height * (1 - STACKED_HERO_SHARE);
  const count = groups.length;
  const cols = wide
    ? count <= 3
      ? count
      : Math.ceil(count / 2)
    : Math.min(count, 2);
  const rowsOfGroups = Array.from({ length: Math.ceil(count / cols) }, (_, i) =>
    groups.slice(i * cols, i * cols + cols)
  );
  const cellH = areaH / rowsOfGroups.length;

  const heightEm = (g: (typeof groups)[number]) => {
    const items = [
      DRAWING_EM[g.id] ?? 0,
      g.headlineRow ? HEADLINE_EM[g.id] : 0,
      g.headlineRow && (g.id === 'wet' || g.id === 'air')
        ? SUB_EM * LINE_HEIGHT
        : 0,
      ...g.lineRows.map(() => SUB_EM * LINE_HEIGHT),
    ].filter((h) => h > 0);
    return items.reduce((a, b) => a + b, 0) + GAP_EM * (items.length - 1) + 0.6;
  };
  const widestEm = (g: (typeof groups)[number]) =>
    Math.max(
      2.6,
      ...g.lineRows.map(
        (r) =>
          (label(r.field).length + 1 + displayValue(r).length) * 0.6 * SUB_EM
      ),
      g.headlineRow
        ? displayValue(g.headlineRow).length *
            0.62 *
            (HEADLINE_EM[g.id] > 0 ? HEADLINE_EM[g.id] : 1)
        : 0
    ) + 0.8;
  const base = Math.min(
    MAX_BASE_PX,
    ...groups.map((g) => (cellH * 0.9) / heightEm(g)),
    ...rowsOfGroups.flatMap((row) =>
      row.map((g) => areaW / row.length / widestEm(g))
    )
  );

  const fitKey = `${width}x${height}|${rows.map((r) => `${r.field}=${displayValue(r)}`).join(',')}`;
  const scale = fit.key === fitKey ? fit.scale : 1;

  // The size estimate is close but not exact; shrink once more if any instrument overflows.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || width === 0) return;
    const ratio = fitRatio(grid);
    if (ratio < 0.995 || fit.key !== fitKey) {
      setFit({ key: fitKey, scale: scale * Math.min(1, ratio * 0.98) });
    }
  }, [fitKey, scale, fit.key, width]);

  const b = base * scale;
  const rule = hexToRgba(color, 0.16);
  const muted = { color: labelColor ?? color, opacity: labelColor ? 1 : 0.7 };

  const sun = sunTimes(new Date(now), lat, lon);
  const rise = byField.get('sunrise')?.time ?? sun?.sunrise;
  const set = byField.get('sunset')?.time ?? sun?.sunset;
  const progress =
    rise !== undefined && set !== undefined && set > rise
      ? Math.min(1, Math.max(0, (now - rise) / (set - rise)))
      : 0;

  const line = (row: DetailRow) => (
    <div
      key={row.field}
      className="whitespace-nowrap"
      style={{ fontSize: b * SUB_EM, lineHeight: LINE_HEIGHT }}
    >
      <span className="font-medium" style={muted}>
        {label(row.field)}
      </span>{' '}
      <span className="font-bold tabular-nums">{displayValue(row)}</span>
    </div>
  );
  const headline = (row: DetailRow, em: number) => (
    <div
      className="font-black tabular-nums leading-none whitespace-nowrap"
      style={{ fontSize: b * em }}
    >
      {row.value}
      {row.unit && (
        <span
          className="font-bold"
          style={{
            fontSize: NO_SPACE_UNITS.has(row.unit) ? '1em' : '0.55em',
            marginLeft: NO_SPACE_UNITS.has(row.unit) ? 0 : '0.15em',
          }}
        >
          {row.unit}
        </span>
      )}
    </div>
  );
  const caption = (field: WeatherDetailField) => (
    <div
      className="font-medium whitespace-nowrap"
      style={{ ...muted, fontSize: b * SUB_EM, lineHeight: LINE_HEIGHT }}
    >
      {label(field)}
    </div>
  );

  const instrument = (g: (typeof groups)[number]) => {
    const h = g.headlineRow;
    switch (g.id) {
      case 'sun':
        return <SunPath progress={progress} size={b * 2.2} rule={rule} />;
      case 'wind':
        return (
          <>
            <Compass
              direction={h?.direction}
              size={b * 2.6}
              color={color}
              rule={rule}
            />
            {h && headline(h, HEADLINE_EM.wind)}
          </>
        );
      case 'wet':
      case 'air':
        return h ? (
          <>
            {headline(h, HEADLINE_EM[g.id])}
            {caption(h.field)}
          </>
        ) : null;
      case 'moon':
        return (
          <>
            <MoonGlyph phase={h?.phase ?? 0} size={b * 2.6} />
            {h && (
              <div
                className="font-bold whitespace-nowrap"
                style={{ fontSize: b * HEADLINE_EM.moon }}
              >
                {h.value}
              </div>
            )}
          </>
        );
    }
  };

  return (
    <div
      ref={ref}
      data-testid="weather-details"
      className={`flex h-full w-full ${wide ? 'flex-row' : 'flex-col'} ${className}`}
    >
      <div
        className="shrink-0 min-h-0 min-w-0 [container-type:size]"
        style={
          wide
            ? { width: `${WIDE_HERO_SHARE * 100}%` }
            : { height: `${STACKED_HERO_SHARE * 100}%` }
        }
      >
        {children}
      </div>
      {width > 0 && (
        <div
          ref={gridRef}
          className="flex-1 min-h-0 min-w-0 grid"
          style={{
            gridTemplateRows: `repeat(${rowsOfGroups.length}, minmax(0, 1fr))`,
            [wide ? 'borderLeft' : 'borderTop']: `1px solid ${rule}`,
            color,
          }}
        >
          {rowsOfGroups.map((row, r) => (
            <div
              key={row.map((g) => g.id).join('-')}
              className="grid min-h-0 min-w-0"
              style={{
                gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
                borderTop: r ? `1px solid ${rule}` : undefined,
              }}
            >
              {row.map((g, i) => (
                <div
                  key={g.id}
                  data-cell
                  data-testid={`weather-instrument-${g.id}`}
                  className="flex flex-col items-center justify-center text-center min-h-0 min-w-0 overflow-hidden"
                  style={{
                    gap: `${GAP_EM * b}px`,
                    padding: `0 ${0.3 * b}px`,
                    borderLeft: i ? `1px solid ${rule}` : undefined,
                  }}
                >
                  {instrument(g)}
                  {g.lineRows.map(line)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
