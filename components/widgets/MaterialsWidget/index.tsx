import React from 'react';
import {
  MaterialsConfig,
  DEFAULT_GLOBAL_STYLE,
  WidgetComponentProps,
} from '../../../types';
import { useDashboard } from '../../../context/useDashboard';
import { Package } from 'lucide-react';
import { MATERIAL_ITEMS } from './constants';
import { MaterialsSettings } from './Settings';
import { ScaledEmptyState } from '../../common/ScaledEmptyState';

export { MaterialsSettings };

import { WidgetLayout } from '../WidgetLayout';

export const MaterialsWidget: React.FC<WidgetComponentProps> = ({ widget }) => {
  const { updateWidget, activeDashboard, selectedWidgetId } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as MaterialsConfig;
  const isFocused = selectedWidgetId === widget.id;

  const {
    selectedItems = [],
    activeItems = [],
    title = 'What you need',
    titleFont = 'global',
    titleColor = '#2d3f89', // brand-blue
  } = config;

  const selectedSet = React.useMemo(
    () => new Set(selectedItems),
    [selectedItems]
  );
  const activeSet = React.useMemo(() => new Set(activeItems), [activeItems]);

  const toggleActive = (id: string) => {
    const newActive = new Set(activeSet);
    if (newActive.has(id)) {
      newActive.delete(id);
    } else {
      newActive.add(id);
    }
    updateWidget(widget.id, {
      config: {
        ...config,
        activeItems: Array.from(newActive),
      },
    });
  };

  // gridItems: Items to display in the main grid (only active items)
  const gridItems = React.useMemo(
    () => MATERIAL_ITEMS.filter((item) => activeSet.has(item.id)),
    [activeSet]
  );

  // selectionItems: All available items from settings (shown at bottom when focused)
  const selectionItems = React.useMemo(
    () => MATERIAL_ITEMS.filter((item) => selectedSet.has(item.id)),
    [selectedSet]
  );

  const numItems = gridItems.length;

  const { cols, rows } = React.useMemo(() => {
    if (numItems === 0) return { cols: 1, rows: 1 };
    let bestCols = 1;
    let bestRows = numItems;
    let maxCellSize = 0;
    const w = widget.w;
    const h = widget.h;
    for (let c = 1; c <= numItems; c++) {
      const r = Math.ceil(numItems / c);
      const cellSize = Math.min(w / c, h / r);
      if (cellSize > maxCellSize) {
        maxCellSize = cellSize;
        bestCols = c;
        bestRows = r;
      }
    }
    return { cols: bestCols, rows: bestRows };
  }, [numItems, widget.w, widget.h]);

  const getTitleFontClass = () => {
    if (titleFont === 'global') return `font-${globalStyle.fontFamily}`;
    if (titleFont.startsWith('font-')) return titleFont;
    return `font-${titleFont}`;
  };

  if (!isFocused && activeItems.length === 0) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Package}
            title="No materials active"
            subtitle="Focus widget to select materials"
            className="opacity-40"
          />
        }
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full overflow-hidden select-none flex flex-col font-${globalStyle.fontFamily}`}
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          {/* Title */}
          <div
            className={`w-full text-center font-bold truncate mb-2 ${getTitleFontClass()}`}
            style={{
              fontSize: 'min(24px, max(14px, 7cqmin))',
              color: titleColor,
              opacity: gridItems.length === 0 ? 0.3 : 1,
            }}
          >
            {title}
          </div>

          {/* Main Grid Area */}
          <div className="flex-1 min-h-0 relative mb-2">
            {gridItems.length > 0 ? (
              <div
                className="grid h-full w-full"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                  gap: 'min(12px, 2.5cqmin)',
                }}
              >
                {gridItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      containerType: 'size',
                      gap: 'min(8px, 4cqmin)',
                      padding: 'min(12px, 5cqmin)',
                    }}
                    className={`flex flex-col items-center justify-center rounded-2xl border-2 transition-all duration-300 ${
                      item.color
                    } ${
                      item.textColor ?? 'text-white'
                    } border-transparent shadow-lg scale-[1.02] z-10`}
                  >
                    <item.icon
                      className="scale-110"
                      style={{
                        width: 'min(80px, 45cqmin)',
                        height: 'min(80px, 45cqmin)',
                      }}
                      strokeWidth={2.5}
                    />
                    <span
                      className="uppercase tracking-wide text-center font-black leading-tight truncate w-full"
                      style={{ fontSize: 'min(18px, 14cqmin)' }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Package
                  style={{
                    width: 'min(48px, 12cqmin)',
                    height: 'min(48px, 12cqmin)',
                  }}
                  className="mb-2 opacity-20"
                />
                <span style={{ fontSize: 'min(14px, 4cqmin)' }}>
                  {isFocused ? 'Select items below' : 'Nothing needed yet'}
                </span>
              </div>
            )}
          </div>

          {/* Selection Bar (only when focused) */}
          {isFocused && selectionItems.length > 0 && (
            <div
              className="w-full flex-shrink-0 bg-slate-100/80 rounded-2xl p-1.5 flex gap-2 overflow-x-auto custom-scrollbar no-scrollbar"
              style={{ minHeight: 'max(64px, min(80px, 20cqmin))' }}
            >
              {selectionItems.map((item) => {
                const isActive = activeSet.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleActive(item.id)}
                    className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl border-2 transition-all relative ${
                      isActive
                        ? 'bg-white border-blue-500 shadow-sm'
                        : 'bg-white/40 border-transparent text-slate-400'
                    }`}
                    style={{
                      width: 'max(54px, min(70px, 18cqmin))',
                      height: 'max(54px, min(70px, 18cqmin))',
                      gap: '2px',
                    }}
                  >
                    <item.icon
                      style={{
                        width: 'max(20px, min(28px, 8cqmin))',
                        height: 'max(20px, min(28px, 8cqmin))',
                      }}
                      className={isActive ? 'text-blue-600' : 'opacity-40'}
                    />
                    <span
                      className="text-xxxs font-bold uppercase truncate w-full px-1 text-center"
                      style={{ fontSize: 'max(8px, min(10px, 3cqmin))' }}
                    >
                      {item.label}
                    </span>
                    {isActive && (
                      <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-blue-500 rounded-full border border-white shadow-sm" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      }
    />
  );
};
