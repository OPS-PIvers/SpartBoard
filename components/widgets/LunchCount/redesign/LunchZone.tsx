import React from 'react';
import type { LunchMenuItem } from '@/types';
import { DragChip } from '../components/DragChip';
import type { LunchStudent, LunchZoneId } from './useLunchCountModel';
import { COUNT_COLOR } from './lunchCountFormat';
import type { MenuLine } from './lunchCountFormat';

type ChipHandlers = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'className' | 'style'
>;

interface ChipGridProps {
  students: LunchStudent[];
  draggingIds: Set<string>;
  handlers: ChipHandlers;
}

export const CHIP_CLASS =
  'flex items-center rounded-lg border border-slate-300 bg-white text-slate-800 font-semibold leading-tight [overflow-wrap:anywhere] transition-colors hover:border-slate-500 active:bg-slate-100 active:border-brand-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary [-webkit-tap-highlight-color:transparent]';

export const ChipGrid: React.FC<ChipGridProps> = ({
  students,
  draggingIds,
  handlers,
}) => {
  if (students.length === 0) return null;
  return (
    <div
      className="grid w-full"
      style={{
        fontSize: 'clamp(13px, 4cqmin, 28px)',
        gap: 'min(8px, 1.5cqmin)',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 8.5em), 1fr))',
      }}
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
            minHeight: 'max(32px, min(48px, 12cqmin))',
            padding: 'min(6px, 1.2cqmin) min(12px, 2.4cqmin)',
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
  const menuText =
    menu.kind === 'item'
      ? menu.text
      : menu.kind === 'loading'
        ? loadingText
        : menu.kind === 'unavailable'
          ? unavailableText
          : null;
  const imageUrl = menu.kind === 'item' ? menuItem?.imageUrl : undefined;

  return (
    <section
      data-drop-zone={zone}
      data-testid={testId}
      aria-label={label}
      className={`flex flex-col min-h-0 min-w-0 flex-1 transition-colors ${
        isOver
          ? 'outline outline-2 -outline-offset-2 outline-brand-blue-primary bg-brand-blue-lighter/30'
          : ''
      }`}
    >
      <div
        className="flex items-baseline shrink-0"
        style={{
          gap: 'min(12px, 2.5cqmin)',
          padding: 'min(12px, 2.5cqmin) min(12px, 2.5cqmin) 0',
        }}
      >
        <span
          data-lunch-count={zone}
          className={`font-black tabular-nums leading-none ${COUNT_COLOR[zone]}`}
          style={{ fontSize: 'clamp(28px, 13cqmin, 120px)' }}
        >
          {count}
        </span>
        <span
          className="font-bold text-slate-800 leading-tight min-w-0 [overflow-wrap:anywhere]"
          style={{ fontSize: 'clamp(13px, 4cqmin, 26px)' }}
        >
          {label}
        </span>
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col"
        style={{
          gap: 'min(10px, 2cqmin)',
          padding: 'min(8px, 1.5cqmin) min(12px, 2.5cqmin) min(14px, 3cqmin)',
        }}
      >
        {menuText !== null || subLabel ? (
          <div
            className="flex items-start"
            style={{ gap: 'min(10px, 2cqmin)' }}
          >
            {imageUrl && menuItem ? (
              <button
                type="button"
                onClick={() => onPeekItem(menuItem)}
                className="relative touch-target-expand shrink-0 rounded-md overflow-hidden border border-slate-200 bg-white active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                style={{
                  width: 'clamp(28px, 11.5cqmin, 96px)',
                  height: 'clamp(28px, 11.5cqmin, 96px)',
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
            <div className="flex-1 min-w-0 [overflow-wrap:anywhere]">
              {menuText !== null ? (
                <div
                  className={`font-semibold leading-snug ${
                    menu.kind === 'item' ? 'text-slate-800' : 'text-slate-600'
                  }`}
                  style={{ fontSize: 'clamp(12px, 3.6cqmin, 26px)' }}
                >
                  {menuText}
                </div>
              ) : null}
              {sides.length > 0 && menu.kind === 'item' ? (
                <div
                  className="text-slate-600 leading-snug"
                  style={{
                    fontSize: 'clamp(12px, 3.5cqmin, 20px)',
                    marginTop: 'min(4px, 0.8cqmin)',
                  }}
                >
                  {sides.map((s, i) => (
                    <React.Fragment key={`${s.name}-${i}`}>
                      {i > 0 ? (
                        <span aria-hidden="true" style={{ margin: '0 0.4em' }}>
                          ·
                        </span>
                      ) : null}
                      {s.imageUrl ? (
                        <button
                          type="button"
                          onClick={() => onPeekItem(s)}
                          className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
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
              {subLabel ? (
                <div
                  className="text-slate-600 leading-snug"
                  style={{ fontSize: 'clamp(12px, 3.5cqmin, 22px)' }}
                >
                  {subLabel}
                </div>
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
