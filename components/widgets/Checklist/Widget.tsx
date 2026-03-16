import React, { useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { ChecklistConfig, WidgetData, DEFAULT_GLOBAL_STYLE } from '@/types';
import { ListPlus, Users, RefreshCw, Trash2 } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { WidgetLayout } from '../WidgetLayout';
import { ChecklistCard } from './components/ChecklistCard';

export const ChecklistWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, rosters, activeRosterId, activeDashboard } =
    useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as ChecklistConfig;
  const {
    items = [],
    mode = 'manual',
    rosterMode = 'class',
    firstNames = '',
    lastNames = '',
    completedNames = [],
    scaleMultiplier = 1,
    fontFamily = 'global',
    cardColor = '#ffffff',
    cardOpacity = 1,
    fontColor = '#334155',
  } = config;

  const getFontClass = () => {
    if (fontFamily === 'global') return `font-${globalStyle.fontFamily}`;
    if (fontFamily.startsWith('font-')) return fontFamily;
    return `font-${fontFamily}`;
  };

  const activeRoster = useMemo(
    () => rosters.find((r) => r.id === activeRosterId),
    [rosters, activeRosterId]
  );

  const students = useMemo((): { id: string; label: string }[] => {
    if (mode !== 'roster') return [];

    if (rosterMode === 'class' && activeRoster) {
      return activeRoster.students.map((s) => ({
        id: s.id,
        label: `${s.firstName} ${s.lastName}`.trim(),
      }));
    }

    const firsts = firstNames
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n);
    const lasts = lastNames
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n);
    const count = Math.max(firsts.length, lasts.length);
    const combined: { id: string; label: string }[] = [];
    for (let i = 0; i < count; i++) {
      const name = `${firsts[i] || ''} ${lasts[i] || ''}`.trim();
      if (name) combined.push({ id: name, label: name });
    }
    return combined;
  }, [firstNames, lastNames, mode, rosterMode, activeRoster]);

  const latestState = useRef({
    items,
    completedNames,
    config,
    widgetId: widget.id,
    mode,
  });

  // Update ref synchronously during useLayoutEffect to avoid stale state issues in callbacks
  useLayoutEffect(() => {
    latestState.current = {
      items,
      completedNames,
      config,
      widgetId: widget.id,
      mode,
    };
  }, [items, completedNames, config, widget.id, mode]);

  const toggleItem = useCallback(
    (idOrName: string) => {
      const { items, completedNames, config, widgetId, mode } =
        latestState.current;
      if (mode === 'manual') {
        const newItems = items.map((item) =>
          item.id === idOrName ? { ...item, completed: !item.completed } : item
        );
        updateWidget(widgetId, {
          config: { ...config, items: newItems } as ChecklistConfig,
        });
      } else {
        const isCompleted = completedNames.includes(idOrName);
        const nextCompleted = isCompleted
          ? completedNames.filter((n) => n !== idOrName)
          : [...completedNames, idOrName];
        updateWidget(widgetId, {
          config: {
            ...config,
            completedNames: nextCompleted,
          } as ChecklistConfig,
        });
      }
    },
    [updateWidget]
  );

  // ⚡ Bolt: Memoize button handlers to prevent them from being recreated on every render.
  const resetToday = useCallback(() => {
    const { mode, items, config, widgetId } = latestState.current;
    if (mode === 'manual') {
      const reset = items.map((i) => ({ ...i, completed: false }));
      updateWidget(widgetId, { config: { ...config, items: reset } });
    } else {
      updateWidget(widgetId, { config: { ...config, completedNames: [] } });
    }
  }, [updateWidget]);

  const removeCompleted = useCallback(() => {
    const { mode, items, config, widgetId } = latestState.current;
    if (mode === 'manual') {
      const remaining = items.filter((i) => !i.completed);
      updateWidget(widgetId, { config: { ...config, items: remaining } });
    }
  }, [updateWidget]);

  const hasContent = mode === 'manual' ? items.length > 0 : students.length > 0;

  // All items always visible — JS pixel math based on widget dims (reliable, no CQ unit issues)
  const itemCount = mode === 'manual' ? items.length : students.length;
  const sm = scaleMultiplier;

  const TITLE_BAR_H = 40;
  const FOOTER_H = 44;
  const LIST_PAD_V = 20;
  const widgetH = Math.max(widget.h, 120);
  const widgetW = Math.max(widget.w, 100);
  const availH = widgetH - TITLE_BAR_H - FOOTER_H - LIST_PAD_V;
  const gapPx = Math.max(
    2,
    Math.min(6 * sm, (4 * sm) / Math.max(itemCount / 4, 1))
  );
  const perCardH = Math.max(
    16,
    (availH - Math.max(0, itemCount - 1) * gapPx) / Math.max(itemCount, 1)
  );

  const fontSizePx = Math.max(8, Math.min(16 * sm, perCardH * 0.38));
  const iconSizePx = Math.max(10, Math.min(22 * sm, perCardH * 0.55));
  const cardPadVPx = Math.max(2, Math.min(8 * sm, perCardH * 0.12));
  const cardPadHPx = Math.max(8, Math.min(14 * sm, widgetW * 0.05));
  const cardGapPx = Math.max(6, Math.min(10 * sm, widgetW * 0.03));

  const textSize = `${fontSizePx.toFixed(1)}px`;
  const iconSize = `${iconSizePx.toFixed(1)}px`;
  const cardPadding = `${cardPadVPx.toFixed(1)}px ${cardPadHPx.toFixed(1)}px`;
  const listGap = `${gapPx.toFixed(1)}px`;
  const cardGap = `${cardGapPx.toFixed(1)}px`;

  if (!hasContent) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={mode === 'manual' ? ListPlus : Users}
            title={mode === 'manual' ? 'No Tasks' : 'Roster Empty'}
            subtitle={
              mode === 'manual'
                ? 'Flip to add your class tasks.'
                : 'Flip to enter your student names.'
            }
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
          className={`h-full w-full relative overflow-hidden flex flex-col group font-${globalStyle.fontFamily}`}
        >
          <div
            role="list"
            className={`flex-1 min-h-0 overflow-hidden flex flex-col ${getFontClass()}`}
            style={{
              padding: 'min(10px, 2.2cqmin) min(12px, 2.5cqmin)',
              gap: listGap,
            }}
          >
            {mode === 'manual'
              ? items.map((item) => (
                  <div
                    key={item.id}
                    role="listitem"
                    style={{
                      flex: '1 1 0',
                      minHeight: 0,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <ChecklistCard
                      id={item.id}
                      label={item.text}
                      isCompleted={item.completed}
                      onToggle={toggleItem}
                      textSize={textSize}
                      iconSize={iconSize}
                      cardPadding={cardPadding}
                      cardGap={cardGap}
                      cardColor={cardColor}
                      cardOpacity={cardOpacity}
                      fontColor={fontColor}
                    />
                  </div>
                ))
              : students.map((student) => (
                  <div
                    key={student.id}
                    role="listitem"
                    style={{
                      flex: '1 1 0',
                      minHeight: 0,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <ChecklistCard
                      id={student.id}
                      label={student.label}
                      isCompleted={completedNames.includes(student.id)}
                      onToggle={toggleItem}
                      textSize={textSize}
                      iconSize={iconSize}
                      cardPadding={cardPadding}
                      cardGap={cardGap}
                      cardColor={cardColor}
                      cardOpacity={cardOpacity}
                      fontColor={fontColor}
                    />
                  </div>
                ))}
          </div>

          {/* Action buttons — fixed footer outside scroll area, always visible */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 'min(8px, 1.8cqmin)',
              padding: 'min(6px, 1.5cqmin) min(12px, 2.5cqmin)',
            }}
          >
            <button
              onClick={resetToday}
              title="Reset Checks"
              className="flex items-center justify-center bg-white border border-slate-200 shadow-sm rounded-xl font-black text-indigo-600 uppercase tracking-wider hover:bg-indigo-50 transition-all active:scale-95 shadow-indigo-500/5"
              style={{
                width: 'min(36px, 10cqmin)',
                height: 'min(36px, 10cqmin)',
                minWidth: '24px',
                minHeight: '24px',
              }}
            >
              <RefreshCw
                style={{
                  width: 'max(14px, min(18px, 5cqmin))',
                  height: 'max(14px, min(18px, 5cqmin))',
                }}
                strokeWidth={2.5}
              />
            </button>
            {mode === 'manual' && (
              <button
                onClick={removeCompleted}
                title="Remove Completed"
                className="flex items-center justify-center bg-white border border-slate-200 shadow-sm rounded-xl font-black text-rose-500 uppercase tracking-wider hover:bg-rose-50 transition-all active:scale-95"
                style={{
                  width: 'min(36px, 10cqmin)',
                  height: 'min(36px, 10cqmin)',
                  minWidth: '24px',
                  minHeight: '24px',
                }}
              >
                <Trash2
                  style={{
                    width: 'max(14px, min(18px, 5cqmin))',
                    height: 'max(14px, min(18px, 5cqmin))',
                  }}
                  strokeWidth={2.5}
                />
              </button>
            )}
          </div>
        </div>
      }
    />
  );
};
