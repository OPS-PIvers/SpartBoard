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

interface ChipGridProps {
  students: LunchStudent[];
  flowIntoParent?: boolean;
  draggingIds: Set<string>;
  handlers: ChipHandlers;
}

// One text size for labels, entree and chips keeps the board calm.
export const ZONE_TEXT = 'clamp(12px, calc(3.4cqmin - 0.5px), 30px)';
export const CHIP_HEIGHT = 'max(36px, min(64px, 2.4em))';

export const CHIP_CLASS =
  'flex items-center max-w-full rounded-xl bg-white text-slate-800 font-bold leading-tight shadow-sm [overflow-wrap:anywhere] transition-colors hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary [-webkit-tap-highlight-color:transparent]';

export const ChipGrid: React.FC<ChipGridProps> = ({
  students,
  flowIntoParent = false,
  draggingIds,
  handlers,
}) => {
  if (students.length === 0) return null;
  return (
    <div
      className={`flex flex-wrap w-full ${flowIntoParent ? '[@container_(max-width:1199px)_or_(max-height:699px)]:contents' : ''}`}
      style={{ gap: 'clamp(6px, 1.8cqmin, 14px)' }}
    >
      {students.map((student) => (
        <DragChip
          key={student.id}
          name={student.name}
          isDragging={draggingIds.has(student.id)}
          data-student-id={student.id}
          data-student-name={student.name}
          {...handlers}
          className={CHIP_CLASS}
          style={{
            fontSize: ZONE_TEXT,
            minHeight: CHIP_HEIGHT,
            padding: '0.35em 0.6em',
          }}
        />
      ))}
    </div>
  );
};

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
  const fullLine =
    line !== null && menu.kind === 'item' && sides.length > 0
      ? [line, ...sides.map((s) => s.name)].join(' · ')
      : (line ?? undefined);

  return (
    <section
      data-drop-zone={zone}
      data-testid={testId}
      aria-label={label}
      className={`flex flex-col min-h-0 min-w-0 flex-1 [@container(max-aspect-ratio:0.7)]:flex-[1_1_auto] ${zone === 'hot' ? '[@container_(max-width:1199px)_and_(min-aspect-ratio:0.71)]:flex-[1.8_1_0%]' : ''} rounded-2xl transition-colors ${
        isOver ? tone.over : tone.fill
      }`}
    >
      <div
        className="flex items-center shrink-0"
        style={{
          gap: 'clamp(8px, 2.5cqmin, 20px)',
          padding:
            'clamp(6px, calc(4cqmin - 8px), 18px) clamp(8px, calc(4cqmin - 8px), 24px) 0',
        }}
      >
        <span
          data-lunch-count={zone}
          className={`font-black tabular-nums leading-none ${COUNT_COLOR[zone]}`}
          style={{ fontSize: 'clamp(32px, calc(20cqmin - 40px), 120px)' }}
        >
          {count}
        </span>
        <span
          className={`font-black leading-tight min-w-0 [overflow-wrap:anywhere] ${tone.label}`}
          style={{ fontSize: ZONE_TEXT }}
        >
          {label}
        </span>
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col"
        style={{
          gap: 'clamp(6px, calc(3cqmin - 6px), 18px)',
          padding:
            'clamp(4px, calc(3cqmin - 8px), 14px) clamp(8px, calc(4cqmin - 8px), 24px) clamp(8px, calc(4cqmin - 8px), 24px)',
        }}
      >
        {line !== null ? (
          <div
            className="flex items-center"
            style={{ gap: 'clamp(8px, 2cqmin, 14px)' }}
          >
            {imageUrl && menuItem ? (
              <button
                type="button"
                onClick={() => onPeekItem(menuItem)}
                className="relative touch-target-expand shrink-0 rounded-lg overflow-hidden bg-white active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                style={{
                  width: 'clamp(32px, 11cqmin, 96px)',
                  height: 'clamp(32px, 11cqmin, 96px)',
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
              title={fullLine}
              className={`flex-1 min-w-0 font-semibold leading-snug line-clamp-2 [overflow-wrap:anywhere] ${tone.text}`}
              style={{ fontSize: ZONE_TEXT }}
            >
              {line}
              {sides.length > 0 && menu.kind === 'item' ? (
                <span className="hidden [@container_(min-width:1200px)_and_(min-height:700px)]:inline font-normal opacity-80">
                  {sides.map((s, i) => (
                    <React.Fragment key={`${s.name}-${i}`}>
                      <span aria-hidden="true" style={{ margin: '0 0.4em' }}>
                        ·
                      </span>
                      {s.imageUrl ? (
                        <button
                          type="button"
                          onClick={() => onPeekItem(s)}
                          className="underline decoration-slate-400 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                          aria-label={`Show photo of ${s.name}`}
                        >
                          {s.name}
                        </button>
                      ) : (
                        <span>{s.name}</span>
                      )}
                    </React.Fragment>
                  ))}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        <ChipGrid
          students={students}
          draggingIds={draggingIds}
          handlers={handlers}
        />
      </div>
    </section>
  );
};
