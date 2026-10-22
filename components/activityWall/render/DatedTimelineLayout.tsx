import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Eye,
  EyeOff,
  FileText,
  LinkIcon,
  Pin,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import type { ActivityWallSubmission } from '@/types';
import { AddSpot } from './AddSpot';
import { showsAddSpots } from './addSpots';
import { SubmissionCard } from './SubmissionCard';
import { useWallCardStyle } from './imageSize';
import { visibleSubmissions } from './scale';
import { isSafeHttpUrl, useMediaUrl } from './useMediaUrl';
import {
  dateEndKey,
  dateSortKey,
  dateStartKey,
  parseWallDate,
  parseWallSpan,
  wallSpanRange,
} from './timelineDates';
import {
  breakLabel,
  fitPxPerYear,
  fitZoomLevel,
  layoutTimeline,
  timelineTicks,
  type TimelinePlacement,
} from './timelineGeometry';
import type { WallRenderMode, WallRenderProps } from './types';

const MIN_ZOOM = -8;
const MAX_ZOOM = 12;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Pixel sizes for one container size; every length follows the card width so the timeline scales as a whole. */
const timelineMetrics = (
  width: number,
  height: number,
  areaHeight: number,
  periodRows: number,
  bandCount = 1,
  labelled = false
) => {
  const cardW = clamp(
    Math.min(width * 0.24, (height / bandCount) * 0.5),
    112,
    360
  );
  const font = {
    meta: clamp(cardW * 0.058, 10, 20),
    title: clamp(cardW * 0.075, 12, 27),
    body: clamp(cardW * 0.064, 11, 22),
  };
  const pad = clamp(cardW * 0.05, 6, 18);
  const gap = clamp(cardW * 0.05, 6, 18);
  const toolbar = font.meta * 2 + pad * 2;
  const axisGap = font.meta * 2.2 + gap;
  // Period names get their own strip above the cards.
  const periodRow = font.meta * 2;
  const periodStrip = periodRows * periodRow;
  // A group's name sits above its band's top cards.
  const bandLabel = labelled ? font.meta * 1.8 : 0;
  // Group bands never shrink below one card per side; the wall scrolls instead.
  const minArea = labelled ? bandLabel + pad * 2 + (axisGap + 44) * 2 : 100;
  const area = Math.max(
    ((areaHeight || height - toolbar) - periodStrip) / bandCount,
    minArea
  );
  const perSide = (area - bandLabel - pad * 2) / 2 - axisGap;
  const target = cardW * 0.72;
  const lanes = clamp(Math.floor((perSide + gap) / (target + gap)), 1, 3);
  const cardH = clamp((perSide - (lanes - 1) * gap) / lanes, 44, target);
  return {
    cardW,
    cardH,
    font,
    pad,
    gap,
    toolbar,
    axisGap,
    area,
    lanes,
    periodStrip,
    periodRow,
    bandLabel,
  };
};

type Metrics = ReturnType<typeof timelineMetrics>;

const useContainerSize = (ref: React.RefObject<HTMLElement | null>) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
};

const CardPreview: React.FC<{
  submission: ActivityWallSubmission;
  metrics: Metrics;
  mode: WallRenderMode;
  showNames: boolean;
  hideDate?: boolean;
}> = ({ submission, metrics, mode, showNames, hideDate }) => {
  const { url } = useMediaUrl(submission);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { height: bodyHeight } = useContainerSize(bodyRef);
  const type = submission.type ?? 'text';
  const { font } = metrics;
  const isPending = submission.status === 'pending';
  const name =
    submission.authorRole === 'teacher'
      ? 'Teacher'
      : showNames
        ? submission.participantLabel
        : undefined;

  const body = (() => {
    if (type === 'photo' && url && submission.drivePermission !== 'private') {
      return (
        <img
          src={url}
          alt={submission.title ?? 'Student photo'}
          className="min-h-0 w-full flex-1 rounded object-cover"
        />
      );
    }
    if (type === 'link' && isSafeHttpUrl(submission.content)) {
      return (
        <span
          className="flex min-w-0 items-center gap-1 opacity-80"
          style={{ fontSize: font.meta }}
        >
          <LinkIcon aria-hidden="true" className="shrink-0" size={font.meta} />
          <span className="truncate">
            {submission.linkPreview?.title ??
              new URL(submission.content).hostname}
          </span>
        </span>
      );
    }
    if (type === 'file' || type === 'video' || type === 'photo') {
      return (
        <span
          className="flex min-w-0 items-center gap-1 opacity-80"
          style={{ fontSize: font.meta }}
        >
          <FileText aria-hidden="true" className="shrink-0" size={font.meta} />
          <span className="truncate">
            {submission.fileName ?? submission.title ?? type}
          </span>
        </span>
      );
    }
    const lines = Math.floor(bodyHeight / (font.body * 1.3));
    return (
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-hidden">
        <p
          className="whitespace-pre-wrap break-words"
          style={{
            fontSize: font.body,
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: Math.max(1, lines),
            overflow: 'hidden',
            visibility: lines > 0 ? 'visible' : 'hidden',
          }}
        >
          {submission.content}
        </p>
      </div>
    );
  })();

  return (
    <>
      <span
        className="flex shrink-0 items-start justify-between gap-1 font-semibold"
        style={{ fontSize: font.meta }}
      >
        <span
          className={`${metrics.cardH < 60 ? 'line-clamp-1' : 'line-clamp-2'} break-words`}
        >
          {hideDate ? '' : (submission.label ?? 'No date')}
        </span>
        {submission.pinned && (
          <Pin aria-label="Pinned" className="shrink-0" size={font.meta} />
        )}
        {isPending && (mode === 'teacher' || mode === 'student') && (
          <span className="shrink-0 rounded-full bg-amber-400 px-1.5 font-bold uppercase text-slate-900">
            {mode === 'teacher' ? 'Pending' : 'Awaiting approval'}
          </span>
        )}
      </span>
      {submission.title && type !== 'word' && (
        <span
          className={`${metrics.cardH < 96 ? 'line-clamp-1' : 'line-clamp-2'} shrink-0 font-bold leading-tight`}
          style={{ fontSize: font.title }}
        >
          {submission.title}
        </span>
      )}
      {body}
      {name && (
        <span
          className="mt-auto shrink-0 truncate opacity-70"
          style={{ fontSize: font.meta }}
        >
          {name}
        </span>
      )}
    </>
  );
};

/** Timeline on a dated axis: markers sit at each post's date, cards alternate above and below; groups get a band each. */
export const DatedTimelineLayout: React.FC<WallRenderProps> = ({
  session,
  submissions,
  mode,
  showNames,
  onAddAt,
  onMove: _onMove,
  onToggleTimelineDates,
  tourWidgetId,
  ...actions
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(rootRef);
  const { height: areaHeight } = useContainerSize(scrollRef);
  const cardStyle = useWallCardStyle();
  const [zoomChoice, setZoom] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const pendingCenter = useRef<number | null>(null);
  const addSpots = showsAddSpots(mode, onAddAt);
  const datesHidden = session.timelineDatesHidden === true;

  const items = useMemo(() => {
    const visible = visibleSubmissions(submissions, mode).map((submission) => {
      const span = parseWallSpan(submission.label);
      return {
        submission,
        span,
        range: span ? wallSpanRange(span) : null,
        key: span ? dateSortKey(span.start) : null,
      };
    });
    return visible.sort((a, b) => {
      if (a.key !== null && b.key !== null && a.key !== b.key)
        return a.key - b.key;
      if ((a.key === null) !== (b.key === null)) return a.key === null ? 1 : -1;
      return a.submission.submittedAt - b.submission.submittedAt;
    });
  }, [submissions, mode]);

  // One band per teacher group, plus one for posts in no group; a wall without groups has a single band.
  const bands = useMemo(() => {
    const groups = (session.timelineGroups ?? []).filter((g) => g.label.trim());
    if (groups.length === 0) return [{ id: 'all', label: '', items }];
    const known = new Set(groups.map((g) => g.id));
    const grouped = groups.map((group) => ({
      id: group.id,
      label: group.label.trim(),
      items: items.filter((item) => item.submission.sectionId === group.id),
    }));
    const rest = items.filter(
      (item) => !known.has(item.submission.sectionId ?? '')
    );
    return rest.length > 0
      ? [...grouped, { id: 'none', label: 'No group', items: rest }]
      : grouped;
  }, [session.timelineGroups, items]);

  const periods = useMemo(() => {
    const valid = (session.timePeriods ?? []).flatMap((period) => {
      const from = parseWallDate(period.from);
      const to = parseWallDate(period.to);
      if (!period.label.trim() || !from || !to) return [];
      const start = dateStartKey(from);
      const end = dateEndKey(to);
      return end > start
        ? [{ id: period.id, label: period.label.trim(), start, end }]
        : [];
    });
    // Overlapping periods put their names on separate rows of the strip.
    const rowEnds: number[] = [];
    return [...valid]
      .sort((a, b) => a.start - b.start)
      .map((period) => {
        let row = rowEnds.findIndex((end) => end <= period.start);
        if (row === -1) row = rowEnds.length;
        rowEnds[row] = period.end;
        return { ...period, row };
      });
  }, [session.timePeriods]);
  const periodRows = periods.reduce((rows, p) => Math.max(rows, p.row + 1), 0);
  const grouped = bands.length > 1 || bands[0].id !== 'all';
  const metrics = useMemo(
    () =>
      timelineMetrics(
        width || 600,
        height || 360,
        areaHeight,
        periodRows,
        bands.length,
        grouped
      ),
    [width, height, areaHeight, periodRows, bands.length, grouped]
  );
  const inputs = useMemo(
    () => items.map((item) => ({ id: item.submission.id, key: item.key })),
    [items]
  );
  // Posts with an end date and time period edges stay to scale and inside the axis.
  const anchors = useMemo(
    () => [
      ...items.flatMap((item) =>
        item.span?.end && item.range ? item.range : []
      ),
      ...periods.flatMap((period) => [period.start, period.end]),
    ],
    [items, periods]
  );
  // Every band shares every date as a knot, so all bands line up on one scale.
  const sharedAnchors = useMemo(
    () => [
      ...anchors,
      ...inputs.flatMap((input) => (input.key === null ? [] : [input.key])),
    ],
    [anchors, inputs]
  );
  const trueScale = fitPxPerYear(
    [...inputs, ...anchors.map((key, i) => ({ id: `anchor-${i}`, key }))],
    width || 600,
    metrics.cardW,
    metrics.pad
  );
  // Every level is true scale; long empty gaps become marked breaks. Opens on the level that fits.
  const fitZoom = useMemo(
    () =>
      fitZoomLevel(
        {
          items: inputs,
          cardWidth: metrics.cardW,
          gap: metrics.gap,
          pad: metrics.pad,
          lanesPerSide: metrics.lanes * bands.length,
          anchors,
        },
        width || 600,
        trueScale,
        MIN_ZOOM,
        MAX_ZOOM
      ),
    [inputs, anchors, metrics, bands.length, width, trueScale]
  );
  const zoom = zoomChoice ?? fitZoom;
  const pxPerYear = trueScale * 2 ** zoom;
  const layouts = useMemo(
    () =>
      bands.map((band) => {
        const geometry = layoutTimeline({
          items: band.items.map((item) => ({
            id: item.submission.id,
            key: item.key,
          })),
          pxPerYear,
          cardWidth: metrics.cardW,
          gap: metrics.gap,
          pad: metrics.pad,
          lanesPerSide: metrics.lanes,
          anchors: sharedAnchors,
        });
        return { band, geometry };
      }),
    [bands, pxPerYear, metrics, sharedAnchors]
  );
  const geometry = layouts[0].geometry;
  const contentWidth = Math.max(...layouts.map((l) => l.geometry.width));
  const ticks = useMemo(
    () =>
      timelineTicks(geometry, pxPerYear, metrics.font.meta * 6, metrics.cardW),
    [geometry, pxPerYear, metrics]
  );
  const byId = useMemo(
    () => new Map(items.map((item) => [item.submission.id, item.submission])),
    [items]
  );
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.submission.id, item])),
    [items]
  );
  const open = openId ? byId.get(openId) : undefined;

  // Zooming keeps the date at the middle of the view in place.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || pendingCenter.current === null) return;
    node.scrollLeft =
      geometry.keyToX(pendingCenter.current) - node.clientWidth / 2;
    pendingCenter.current = null;
  }, [geometry, pxPerYear]);

  const changeZoom = (next: number) => {
    const node = scrollRef.current;
    if (node) {
      const middle = node.scrollLeft + node.clientWidth / 2;
      pendingCenter.current = geometry.xToKey(middle);
    }
    const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
    if (clamped === zoom) pendingCenter.current = null;
    setZoom(clamped);
  };

  const { cardW, cardH, gap, axisGap, area, pad, font, toolbar } = metrics;
  const { bandLabel } = metrics;
  const axisY = (area + bandLabel) / 2;
  const cardTop = (p: TimelinePlacement) =>
    p.side === 'above'
      ? axisY - axisGap - (p.lane + 1) * cardH - p.lane * gap
      : axisY + axisGap + p.lane * (cardH + gap);
  const dot = clamp(cardW * 0.03, 4, 8);
  const hasDated = geometry.knots.length > 0;

  const toolButton =
    'flex items-center justify-center rounded-md p-1 text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-30';

  const renderBand = (
    band: (typeof bands)[number],
    bandGeometry: typeof geometry
  ) => {
    const axisStart = bandGeometry.originX - cardW / 2;
    const axisEnd =
      bandGeometry.undatedStart === null
        ? contentWidth - pad
        : bandGeometry.datedEnd + cardW / 2;
    // The solid axis runs between breaks; each break draws its own zigzag.
    const axisRuns: [number, number][] = [];
    let runStart = axisStart;
    for (const b of bandGeometry.breaks) {
      axisRuns.push([runStart, b.fromX]);
      runStart = b.toX;
    }
    axisRuns.push([runStart, axisEnd]);
    return (
      <>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 text-white"
          width={contentWidth}
          height={area}
        >
          {hasDated &&
            axisRuns.map(([from, to]) => (
              <line
                key={from}
                x1={from}
                x2={to}
                y1={axisY}
                y2={axisY}
                stroke="currentColor"
                strokeOpacity={0.7}
                strokeWidth={2}
              />
            ))}
          {bandGeometry.breaks.map((b) => {
            const h = dot * 1.6;
            const mid = (b.fromX + b.toX) / 2;
            const zig = [
              [mid - h * 1.5, 0],
              [mid - h * 0.75, -h],
              [mid, h],
              [mid + h * 0.75, -h],
              [mid + h * 1.5, 0],
            ]
              .map(([x, dy]) => `${x},${axisY + dy}`)
              .join(' ');
            return (
              <polyline
                key={b.fromX}
                points={`${b.fromX},${axisY} ${zig} ${b.toX},${axisY}`}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.7}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            );
          })}
          {bandGeometry.undatedStart !== null && (
            <line
              x1={bandGeometry.undatedStart}
              x2={contentWidth - pad}
              y1={axisY}
              y2={axisY}
              stroke="currentColor"
              strokeOpacity={0.5}
              strokeWidth={2}
              strokeDasharray="6 6"
            />
          )}
          {ticks.map((tick) => (
            <line
              key={tick.x}
              x1={tick.x}
              x2={tick.x}
              y1={axisY - 4}
              y2={axisY + 4}
              stroke="currentColor"
              strokeOpacity={0.7}
            />
          ))}
          {bandGeometry.placements.map((p) => {
            const top = cardTop(p);
            const edgeY = p.side === 'above' ? top + cardH : top;
            const anchorX = clamp(p.dotX, p.cardX + pad, p.cardX + cardW - pad);
            const elbowY =
              p.side === 'above' ? axisY - axisGap / 2 : axisY + axisGap / 2;
            return (
              <path
                key={p.id}
                d={`M ${p.dotX} ${axisY} V ${elbowY} H ${anchorX} V ${edgeY}`}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.45}
              />
            );
          })}
          {bandGeometry.placements.map((p) => {
            const item = itemById.get(p.id);
            if (!item?.range) return null;
            const from = bandGeometry.keyToX(item.range[0]);
            const to = bandGeometry.keyToX(item.range[1]);
            return (
              <g key={`span-${p.id}`}>
                <rect
                  x={from}
                  y={axisY - dot}
                  width={Math.max(to - from, dot * 2)}
                  height={dot * 2}
                  rx={dot}
                  fill="currentColor"
                  fillOpacity={0.3}
                />
                {item.span?.end && (
                  <line
                    x1={to}
                    x2={to}
                    y1={axisY - dot * 1.6}
                    y2={axisY + dot * 1.6}
                    stroke="currentColor"
                    strokeWidth={2}
                  />
                )}
              </g>
            );
          })}
          {bandGeometry.placements.map((p) => {
            const about = itemById.get(p.id)?.span?.start.precision === 'about';
            return (
              <circle
                key={p.id}
                cx={p.dotX}
                cy={axisY}
                r={dot}
                fill={p.dated && !about ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray={
                  about ? `${dot * 0.8} ${dot * 0.6}` : undefined
                }
              />
            );
          })}
        </svg>

        {!datesHidden &&
          ticks.map((tick) => (
            <span
              key={tick.x}
              aria-hidden="true"
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap font-semibold text-white/80"
              style={{
                left: tick.x,
                top: axisY + dot + 4,
                fontSize: font.meta,
              }}
            >
              {tick.label}
            </span>
          ))}
        {!datesHidden &&
          bandGeometry.breaks.map((b) => (
            <span
              key={b.fromX}
              className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap font-semibold italic text-white/70"
              style={{
                left: (b.fromX + b.toX) / 2,
                top: axisY + dot + 4,
                fontSize: font.meta,
              }}
            >
              {breakLabel(b.years)}
            </span>
          ))}
        {bandGeometry.undatedStart !== null && (
          <span
            className="pointer-events-none absolute whitespace-nowrap font-semibold text-white/70"
            style={{
              left: bandGeometry.undatedStart,
              top: axisY + dot + 4,
              fontSize: font.meta,
            }}
          >
            No date
          </span>
        )}

        <ol
          aria-label={
            datesHidden
              ? grouped
                ? `${band.label}: posts`
                : 'Posts'
              : grouped
                ? `${band.label}: posts in date order`
                : 'Posts in date order'
          }
          className="contents"
        >
          {bandGeometry.placements.map((p, index) => {
            const submission = byId.get(p.id);
            if (!submission) return null;
            const dateText = datesHidden ? '' : (submission.label ?? 'No date');
            return (
              <li key={p.id} className="contents">
                <button
                  type="button"
                  // no-tour-anchor: one per student post; tours point at the wall, not a post
                  onClick={() => setOpenId(p.id)}
                  onKeyDown={(event) => {
                    const step =
                      event.key === 'ArrowRight'
                        ? 1
                        : event.key === 'ArrowLeft'
                          ? -1
                          : 0;
                    const cards = event.currentTarget
                      .closest('[data-timeline-band]')
                      ?.querySelectorAll<HTMLElement>('[data-timeline-card]');
                    const next = cards?.[index + step];
                    if (!step || !next) return;
                    event.preventDefault();
                    next.focus();
                  }}
                  aria-label={`Open post: ${[dateText, submission.title].filter(Boolean).join(', ') || 'Post'}`}
                  data-testid={`aw-timeline-card-${p.id}`}
                  data-timeline-card
                  className="absolute flex flex-col overflow-hidden rounded-lg border border-white/15 bg-slate-900/80 text-left text-white shadow-lg transition hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  style={{
                    left: p.cardX,
                    top: cardTop(p),
                    width: cardW,
                    height: cardH,
                    padding: pad,
                    gap: pad / 2,
                    ...cardStyle,
                  }}
                >
                  <CardPreview
                    submission={submission}
                    metrics={metrics}
                    mode={mode}
                    showNames={showNames}
                    hideDate={datesHidden}
                  />
                </button>
              </li>
            );
          })}
        </ol>
      </>
    );
  };

  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full flex-col"
      data-testid="aw-layout-timeline"
    >
      <div
        ref={scrollRef}
        className={`relative min-h-0 flex-1 overflow-x-auto ${grouped ? 'overflow-y-auto' : 'overflow-y-hidden'}`}
        onWheel={(event) => {
          const node = event.currentTarget;
          // A wall taller than its window keeps the wheel for scrolling down.
          if (
            event.ctrlKey ||
            Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
            node.scrollHeight > node.clientHeight
          )
            return;
          node.scrollLeft += event.deltaY;
        }}
      >
        <div
          className="relative"
          style={{
            width: contentWidth,
            height: area * bands.length + metrics.periodStrip,
          }}
        >
          {periods.map((period, index) => {
            const from = geometry.keyToX(period.start);
            const to = geometry.keyToX(period.end);
            return (
              <div
                key={period.id}
                className="pointer-events-none absolute inset-y-0 border-x border-white/20"
                style={{
                  left: from,
                  width: Math.max(to - from, 1),
                  background:
                    index % 2 === 0
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(255,255,255,0.1)',
                }}
              >
                <span
                  className="block truncate font-semibold text-white/80"
                  style={{
                    fontSize: font.meta,
                    lineHeight: `${metrics.periodRow}px`,
                    marginTop: period.row * metrics.periodRow,
                    paddingInline: pad / 2,
                  }}
                >
                  {period.label}
                </span>
              </div>
            );
          })}
          {layouts.map(({ band, geometry: bandGeometry }, index) => (
            <div
              key={band.id}
              data-timeline-band
              className={`absolute left-0 ${index > 0 ? 'border-t border-white/15' : ''}`}
              style={{
                top: metrics.periodStrip + index * area,
                width: contentWidth,
                height: area,
              }}
            >
              {grouped && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none sticky z-10 inline-block truncate font-bold text-white"
                  style={{
                    left: pad,
                    marginLeft: pad,
                    marginTop: pad / 2,
                    maxWidth: '40%',
                    fontSize: font.meta,
                    lineHeight: `${bandLabel}px`,
                    textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                  }}
                >
                  {band.label}
                </span>
              )}
              {renderBand(band, bandGeometry)}
            </div>
          ))}
        </div>
      </div>

      <div
        className="flex shrink-0 items-center justify-between border-t border-white/15"
        style={{ height: toolbar, paddingInline: pad }}
      >
        <div className="flex items-center" style={{ gap: pad / 2 }}>
          <button
            type="button"
            // no-tour-anchor: view-only zoom inside the wall, no tour walks to it
            className={toolButton}
            onClick={() => changeZoom(zoom - 1)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut size={font.meta * 1.6} />
          </button>
          <button
            type="button"
            // no-tour-anchor: view-only zoom inside the wall, no tour walks to it
            className={toolButton}
            onClick={() => changeZoom(zoom + 1)}
            disabled={zoom === MAX_ZOOM || !hasDated}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn size={font.meta * 1.6} />
          </button>
          {onToggleTimelineDates && mode === 'widget' && (
            <button
              type="button"
              {...tourAttr(
                'activity-wall.timeline-dates',
                tourWidgetId,
                'activity-wall'
              )}
              className={toolButton}
              onClick={() => onToggleTimelineDates(!datesHidden)}
              aria-label={datesHidden ? 'Show dates' : 'Hide dates'}
              title={datesHidden ? 'Show dates' : 'Hide dates'}
            >
              {datesHidden ? (
                <Eye size={font.meta * 1.6} />
              ) : (
                <EyeOff size={font.meta * 1.6} />
              )}
            </button>
          )}
        </div>
        {addSpots && (
          <AddSpot
            mode={mode}
            placement={{}}
            onAddAt={onAddAt}
            alwaysVisible
            style={{ padding: pad / 3 }}
          />
        )}
      </div>

      {open && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/60"
          style={{ padding: pad * 2 }}
          onClick={() => setOpenId(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpenId(null);
          }}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={(datesHidden ? open.title : open.label) ?? 'Post'}
            className="relative max-h-full w-full overflow-y-auto"
            style={{ maxWidth: Math.max(cardW * 2, 320) }}
            onClick={(event) => event.stopPropagation()}
          >
            <SubmissionCard
              submission={open}
              mode={mode}
              showNames={showNames}
              footnote={datesHidden ? undefined : open.label}
              {...actions}
            />
            <button
              type="button"
              // no-tour-anchor: closes a single opened post
              autoFocus
              onClick={() => setOpenId(null)}
              aria-label="Close post"
              className="absolute right-1 top-1 rounded-full p-1 text-current opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatedTimelineLayout;
