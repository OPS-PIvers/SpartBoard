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
  flowIntoParent?: boolean;
  draggingIds: Set<string>;
  handlers: ChipHandlers;
}

export const CHIP_CLASS =
  'flex items-center max-w-full rounded-lg border border-slate-300 bg-white text-slate-800 font-semibold leading-tight [overflow-wrap:anywhere] transition-colors hover:border-slate-500 active:bg-slate-100 active:border-brand-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary [-webkit-tap-highlight-color:transparent]';

export const ChipGrid: React.FC<ChipGridProps> = ({
  students,
  flowIntoParent = false,
  draggingIds,
  handlers,
}) => {
  if (students.length === 0) return null;
  return (
    <div
      className={`flex flex-wrap w-full ${flowIntoParent ? '[@container_(max-width:1199px)_or_(max-height:699px)]:contents' : ''} [@container_(min-width:1200px)_and_(min-height:700px)]:grid [@container_(min-width:1200px)_and_(min-height:700px)]:grid-cols-[repeat(auto-fill,minmax(min(100%,8.5em),1fr))]`}
      style={{
        fontSize: 'clamp(13px, calc(6cqmin - 12px), 28px)',
        gap: 'min(8px, 1.5cqmin)',
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
            minHeight: 'max(32px, min(48px, 14cqmin - 24px))',
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
      className={`flex flex-col min-h-0 min-w-0 flex-1 [@container(max-aspect-ratio:0.7)]:flex-[1_1_auto] transition-colors ${
        isOver
          ? 'outline outline-2 -outline-offset-2 outline-brand-blue-primary bg-brand-blue-lighter/30'
          : ''
      }`}
    >
      <div
        className="flex items-baseline shrink-0"
        style={{
          gap: 'min(12px, 2.5cqmin)',
          padding: 'clamp(4px, 2.5cqmin - 6px, 12px) min(12px, 2.5cqmin) 0',
        }}
      >
        <span
          data-lunch-count={zone}
          className={`font-black tabular-nums leading-none ${COUNT_COLOR[zone]}`}
          style={{
            fontSize: 'clamp(28px, min(13cqmin, 30cqmin - 120px), 120px)',
          }}
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
          gap: 'clamp(4px, 2cqmin - 4px, 10px)',
          padding:
            'clamp(2px, 2cqmin - 6px, 8px) min(12px, 2.5cqmin) min(14px, 2cqmin)',
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
                  className={`font-semibold leading-snug [@container_(max-width:1199px)_or_(max-height:699px)]:inline ${
                    menu.kind === 'item' ? 'text-slate-800' : 'text-slate-600'
                  }`}
                  style={{
                    fontSize: 'clamp(12px, calc(4.5cqmin - 6px), 26px)',
                  }}
                >
                  {menuText}
                </div>
              ) : null}
              {sides.length > 0 && menu.kind === 'item' ? (
                <div
                  className="text-slate-600 leading-snug [@container_(max-width:1199px)_or_(max-height:699px)]:inline"
                  style={{
                    fontSize: 'clamp(12px, calc(3.5cqmin - 4px), 20px)',
                    marginTop: 'min(4px, 0.8cqmin)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="hidden [@container_(max-width:1199px)_or_(max-height:699px)]:inline"
                    style={{ margin: '0 0.4em' }}
                  >
                    ·
                  </span>
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
