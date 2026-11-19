import React from 'react';
import type { LunchMenuItem } from '@/types';
import { DragChip } from '../components/DragChip';
import type { LunchStudent, LunchZoneId } from './useLunchCountModel';
import { COUNT_COLOR, ZONE_TONE } from './lunchCountFormat';
import type { MenuLine } from './lunchCountFormat';

type ChipHandlers = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'className' | 'style'
>;

// Zone labels and menu names; `--lc-base` is the widget's text-size setting.
export const ZONE_TEXT =
  'calc(clamp(12px, calc(3.4cqmin - 0.5px), 30px) * var(--lc-base, 1))';
// Every name chip and the Unassigned label; useBoardFit lowers `--lc-fit` until every chip is on screen.
export const CHIP_TEXT =
  'calc(clamp(12px, calc(3.4cqmin - 0.5px), 30px) * var(--lc-base, 1) * var(--lc-fit, 1))';
export const CHIP_GAP = 'calc(clamp(6px, 1.6cqmin, 14px) * var(--lc-fit, 1))';

export const CHIP_CLASS =
  'flex items-center max-w-full rounded-xl bg-white text-slate-800 font-medium leading-tight shadow-sm wrap-anywhere transition-colors hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary [-webkit-tap-highlight-color:transparent]';

interface ChipListProps {
  students: LunchStudent[];
  draggingIds: Set<string>;
  handlers: ChipHandlers;
}

export const ChipList: React.FC<ChipListProps> = ({
  students,
  draggingIds,
  handlers,
}) => (
  <>
    {students.map((student) => (
      <DragChip
        key={student.id}
        name={student.name}
        isDragging={draggingIds.has(student.id)}
        data-student-id={student.id}
        data-student-name={student.name}
        {...handlers}
        className={CHIP_CLASS}
        style={{ fontSize: CHIP_TEXT, padding: '0.45em 0.7em' }}
      />
    ))}
  </>
);

interface LunchZoneProps {
  zone: LunchZoneId;
  testId: string;
  label: string;
  count: number;
  isOver: boolean;
  menu: MenuLine;
  menuItem?: LunchMenuItem | null;
  sides?: LunchMenuItem[];
  subLabel?: string;
  loadingText: string;
  unavailableText: string;
  onPeekItem: (item: LunchMenuItem) => void;
  students: LunchStudent[];
  draggingIds: Set<string>;
  handlers: ChipHandlers;
}

const PAD = 'clamp(6px, 2.4cqmin, 20px)';

export const LunchZone: React.FC<LunchZoneProps> = ({
  zone,
  testId,
  label,
  count,
  isOver,
  menu,
  menuItem,
  sides = [],
  subLabel,
  loadingText,
  unavailableText,
  onPeekItem,
  students,
  draggingIds,
  handlers,
}) => {
  const tone = ZONE_TONE[zone];
  const menuText =
    menu.kind === 'item'
      ? menu.text
      : menu.kind === 'loading'
        ? loadingText
        : menu.kind === 'unavailable'
          ? unavailableText
          : null;
  const line = menuText ?? subLabel ?? null;
  const imageUrl = menu.kind === 'item' ? menuItem?.imageUrl : undefined;
  const showSides = menu.kind === 'item' && sides.length > 0;

  return (
    <section
      data-drop-zone={zone}
      data-testid={testId}
      aria-label={label}
      className={`flex flex-col min-w-0 rounded-2xl transition-colors ${
        isOver ? tone.over : tone.fill
      }`}
      style={{ padding: PAD, gap: 'clamp(4px, 1.4cqmin, 12px)' }}
    >
      <div className="flex items-start justify-between min-w-0 gap-2">
        <span
          className={`min-w-0 font-semibold leading-tight wrap-break-word ${tone.label}`}
          style={{ fontSize: ZONE_TEXT }}
        >
          {label}
        </span>
        <span
          data-lunch-count={zone}
          className={`shrink-0 font-bold tabular-nums leading-none ${COUNT_COLOR[zone]}`}
          style={{
            fontSize: 'calc(clamp(20px, 7cqmin, 96px) * var(--lc-base, 1))',
          }}
        >
          {count}
        </span>
      </div>
      {line !== null ? (
        <div
          className="flex items-center min-w-0"
          style={{ gap: 'clamp(6px, 1.6cqmin, 14px)' }}
        >
          {imageUrl && menuItem ? (
            // no-tour-anchor: a photo of today's menu item, different every day
            <button
              type="button"
              onClick={() => onPeekItem(menuItem)}
              className="relative touch-target-expand shrink-0 rounded-lg overflow-hidden bg-white active:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary [@container(max-height:299px)]:hidden [@container(max-width:639px)]:hidden"
              style={{
                width: 'clamp(28px, 11cqmin, 96px)',
                height: 'clamp(28px, 11cqmin, 96px)',
              }}
              aria-label={`Show photo of ${menuItem.name}`}
            >
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ) : null}
          <div
            className="flex-1 min-w-0 flex flex-col"
            style={{ gap: 'clamp(2px, 0.8cqmin, 8px)' }}
          >
            <div
              title={line}
              className={`font-semibold leading-snug line-clamp-3 wrap-anywhere ${tone.text}`}
              style={{ fontSize: `calc(${ZONE_TEXT} * 1.08)` }}
            >
              {line}
            </div>
            {showSides ? (
              <div
                title={sides.map((s) => s.name).join(' · ')}
                className={`rounded bg-white/60 leading-snug line-clamp-2 wrap-anywhere opacity-80 ${tone.text} [@container(max-height:379px)]:hidden [@container(max-width:559px)]:hidden`}
                style={{
                  fontSize: `max(10px, calc(${ZONE_TEXT} * 0.55))`,
                  padding: '0.15em 0.4em',
                }}
              >
                {sides.map((s, i) => (
                  <React.Fragment key={`${s.name}-${i}`}>
                    {i > 0 ? (
                      <span aria-hidden="true" style={{ margin: '0 0.35em' }}>
                        ·
                      </span>
                    ) : null}
                    {s.imageUrl ? (
                      // no-tour-anchor: a photo of today's side dish, different every day
                      <button
                        type="button"
                        onClick={() => onPeekItem(s)}
                        className="underline decoration-slate-400 underline-offset-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                        aria-label={`Show photo of ${s.name}`}
                      >
                        {s.name}
                      </button>
                    ) : (
                      <span>{s.name}</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {students.length > 0 ? (
        <div
          className="flex flex-wrap content-start min-w-0"
          style={{ gap: CHIP_GAP, paddingTop: 'clamp(2px, 0.8cqmin, 8px)' }}
        >
          <ChipList
            students={students}
            draggingIds={draggingIds}
            handlers={handlers}
          />
        </div>
      ) : null}
    </section>
  );
};
