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
  const { updateWidget, activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as MaterialsConfig;
  const selectedItems = React.useMemo(
    () => new Set(config.selectedItems ?? []),
    [config.selectedItems]
  );
  const activeItems = React.useMemo(
    () => new Set(config.activeItems ?? []),
    [config.activeItems]
  );

  const toggleActive = (id: string) => {
    const newActive = new Set(activeItems);
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

  // Filter available items to only those selected in settings
  const displayItems = React.useMemo(
    () => MATERIAL_ITEMS.filter((item) => selectedItems.has(item.id)),
    [selectedItems]
  );

  const numItems = displayItems.length;

  // Optimal grid calculation: Find cols/rows that maximize cell size
  // and maintain as close to a square aspect ratio as possible for the cells.
  const { cols, rows } = React.useMemo(() => {
    if (numItems === 0) return { cols: 1, rows: 1 };

    let bestCols = 1;
    let bestRows = numItems;
    let maxCellSize = 0;

    // We use widget.w and widget.h (grid units) as a proxy for physical aspect ratio
    const w = widget.w;
    const h = widget.h;

    for (let c = 1; c <= numItems; c++) {
      const r = Math.ceil(numItems / c);
      // The largest square that can fit in a (w/c) by (h/r) cell
      const cellSize = Math.min(w / c, h / r);

      if (cellSize > maxCellSize) {
        maxCellSize = cellSize;
        bestCols = c;
        bestRows = r;
      }
    }

    return { cols: bestCols, rows: bestRows };
  }, [numItems, widget.w, widget.h]);

  if (displayItems.length === 0) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Package}
            title="No materials selected"
            subtitle="Open settings to choose class materials"
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
          className={`h-full w-full overflow-hidden select-none font-${globalStyle.fontFamily}`}
          style={{ padding: 'min(16px, 3.5cqmin)' }}
        >
          <div
            className="grid h-full w-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              gap: 'min(12px, 2.5cqmin)',
            }}
          >
            {displayItems.map((item) => {
              const isActive = activeItems.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggleActive(item.id)}
                  style={{
                    containerType: 'size',
                    gap: 'min(8px, 4cqmin)',
                    padding: 'min(12px, 5cqmin)',
                  }}
                  className={`flex flex-col items-center justify-center rounded-2xl border-2 transition-all duration-300 ${
                    isActive
                      ? `${item.color} ${
                          item.textColor ?? 'text-white'
                        } border-transparent shadow-lg scale-[1.02] z-10`
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <item.icon
                    className={`transition-transform duration-300 ${
                      isActive ? 'scale-110' : 'scale-100'
                    }`}
                    style={{
                      width: 'min(80px, 45cqmin)',
                      height: 'min(80px, 45cqmin)',
                    }}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  <span
                    className="uppercase tracking-wide text-center font-black leading-tight truncate w-full"
                    style={{ fontSize: 'min(18px, 14cqmin)' }}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      }
    />
  );
};
