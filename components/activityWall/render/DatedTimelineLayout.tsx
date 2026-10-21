import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FileText, LinkIcon, Pin, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { ActivityWallSubmission } from '@/types';
import { AddSpot } from './AddSpot';
import { showsAddSpots } from './addSpots';
import { SubmissionCard } from './SubmissionCard';
import { useWallCardStyle } from './imageSize';
import { visibleSubmissions } from './scale';
import { isSafeHttpUrl, useMediaUrl } from './useMediaUrl';
import { dateSortKey, parseWallDate, wallDateSpan } from './timelineDates';
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
const timelineMetrics = (width: number, height: number, areaHeight: number) => {
  const cardW = clamp(Math.min(width * 0.24, height * 0.5), 112, 360);
  const font = {
    meta: clamp(cardW * 0.058, 10, 20),
    title: clamp(cardW * 0.075, 12, 27),
    body: clamp(cardW * 0.064, 11, 22),
  };
  const pad = clamp(cardW * 0.05, 6, 18);
  const gap = clamp(cardW * 0.05, 6, 18);
  const toolbar = font.meta * 2 + pad * 2;
  const axisGap = font.meta * 2.2 + gap;
  const area = Math.max(areaHeight || height - toolbar, 100);
  const perSide = (area - pad * 2) / 2 - axisGap;
  const target = cardW * 0.72;
  const lanes = clamp(Math.floor((perSide + gap) / (target + gap)), 1, 3);
  const cardH = clamp((perSide - (lanes - 1) * gap) / lanes, 44, target);
  return { cardW, cardH, font, pad, gap, toolbar, axisGap, area, lanes };
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
}> = ({ submission, metrics, mode, showNames }) => {
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
        className="flex shrink-0 items-center justify-between gap-1 font-semibold"
        style={{ fontSize: font.meta }}
      >
        <span className="truncate">{submission.label ?? 'No date'}</span>
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

/** Timeline on a dated axis: markers sit at each post's date, cards alternate above and below. */
export const DatedTimelineLayout: React.FC<WallRenderProps> = ({
  submissions,
  mode,
  showNames,
  onAddAt,
  onMove: _onMove,
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

  const items = useMemo(() => {
    const visible = visibleSubmissions(submissions, mode).map((submission) => {
      const date = parseWallDate(submission.label);
      return { submission, date, key: date ? dateSortKey(date) : null };
    });
    return visible.sort((a, b) => {
      if (a.key !== null && b.key !== null && a.key !== b.key)
        return a.key - b.key;
      if ((a.key === null) !== (b.key === null)) return a.key === null ? 1 : -1;
      return a.submission.submittedAt - b.submission.submittedAt;
    });
  }, [submissions, mode]);

  const metrics = useMemo(
    () => timelineMetrics(width || 600, height || 360, areaHeight),
    [width, height, areaHeight]
  );
  const inputs = useMemo(
    () => items.map((item) => ({ id: item.submission.id, key: item.key })),
    [items]
  );
  const trueScale = fitPxPerYear(
    inputs,
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
          lanesPerSide: metrics.lanes,
        },
        width || 600,
        trueScale,
        MIN_ZOOM,
        MAX_ZOOM
      ),
    [inputs, metrics, width, trueScale]
  );
  const zoom = zoomChoice ?? fitZoom;
  const pxPerYear = trueScale * 2 ** zoom;
  const geometry = useMemo(
    () =>
      layoutTimeline({
        items: inputs,
        pxPerYear,
        cardWidth: metrics.cardW,
        gap: metrics.gap,
        pad: metrics.pad,
        lanesPerSide: metrics.lanes,
      }),
    [inputs, pxPerYear, metrics]
  );
  const ticks = useMemo(
    () =>
      timelineTicks(geometry, pxPerYear, metrics.font.meta * 6, metrics.cardW),
    [geometry, pxPerYear, metrics]
  );
  const byId = useMemo(
    () => new Map(items.map((item) => [item.submission.id, item.submission])),
    [items]
  );
  const dateById = useMemo(
    () => new Map(items.map((item) => [item.submission.id, item.date])),
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
  const axisY = area / 2;
  const cardTop = (p: TimelinePlacement) =>
    p.side === 'above'
      ? axisY - axisGap - (p.lane + 1) * cardH - p.lane * gap
      : axisY + axisGap + p.lane * (cardH + gap);
  const dot = clamp(cardW * 0.03, 4, 8);
  const axisStart = geometry.originX - cardW / 2;
  const axisEnd =
    geometry.undatedStart === null
      ? geometry.width - pad
      : geometry.datedEnd + cardW / 2;
  const hasDated = geometry.placements.some((p) => p.dated);
  // The solid axis runs between breaks; each break draws its own zigzag.
  const axisRuns: [number, number][] = [];
  let runStart = axisStart;
  for (const b of geometry.breaks) {
    axisRuns.push([runStart, b.fromX]);
    runStart = b.toX;
  }
  axisRuns.push([runStart, axisEnd]);

  const toolButton =
    'flex items-center justify-center rounded-md p-1 text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-30';

  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full flex-col"
      data-testid="aw-layout-timeline"
    >
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
        onWheel={(event) => {
          if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
            return;
          event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
        <div
          className="relative"
          style={{ width: geometry.width, height: area }}
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 text-white"
            width={geometry.width}
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
            {geometry.breaks.map((b) => {
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
            {geometry.undatedStart !== null && (
              <line
                x1={geometry.undatedStart}
                x2={geometry.width - pad}
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
            {geometry.placements.map((p) => {
              const top = cardTop(p);
              const edgeY = p.side === 'above' ? top + cardH : top;
              const anchorX = clamp(
                p.dotX,
                p.cardX + pad,
                p.cardX + cardW - pad
              );
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
            {geometry.placements.map((p) => {
              const date = dateById.get(p.id);
              const span = date ? wallDateSpan(date) : null;
              if (!span) return null;
              const from = geometry.keyToX(span[0]);
              const to = geometry.keyToX(span[1]);
              return (
                <rect
                  key={`span-${p.id}`}
                  x={from}
                  y={axisY - dot}
                  width={Math.max(to - from, dot * 2)}
                  height={dot * 2}
                  rx={dot}
                  fill="currentColor"
                  fillOpacity={0.3}
                />
              );
            })}
            {geometry.placements.map((p) => {
              const about = dateById.get(p.id)?.precision === 'about';
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

          {ticks.map((tick) => (
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
          {geometry.breaks.map((b) => (
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
          {geometry.undatedStart !== null && (
            <span
              className="pointer-events-none absolute whitespace-nowrap font-semibold text-white/70"
              style={{
                left: geometry.undatedStart,
                top: axisY + dot + 4,
                fontSize: font.meta,
              }}
            >
              No date
            </span>
          )}

          <ol aria-label="Posts in date order" className="contents">
            {geometry.placements.map((p, index) => {
              const submission = byId.get(p.id);
              if (!submission) return null;
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
                      const cards =
                        scrollRef.current?.querySelectorAll<HTMLElement>(
                          '[data-timeline-card]'
                        );
                      const next = cards?.[index + step];
                      if (!step || !next) return;
                      event.preventDefault();
                      next.focus();
                    }}
                    aria-label={`Open post: ${submission.label ?? 'No date'}${submission.title ? `, ${submission.title}` : ''}`}
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
                    />
                  </button>
                </li>
              );
            })}
          </ol>
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
            aria-label={open.label ?? 'Post'}
            className="relative max-h-full w-full overflow-y-auto"
            style={{ maxWidth: Math.max(cardW * 2, 320) }}
            onClick={(event) => event.stopPropagation()}
          >
            <SubmissionCard
              submission={open}
              mode={mode}
              showNames={showNames}
              footnote={open.label}
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
