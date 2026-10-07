import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  ArtsLettersAgendaConfig,
  ArtsLettersAgendaPartId,
  DEFAULT_GLOBAL_STYLE,
  WidgetData,
} from '@/types';
import { resolveTextPresetMultiplier } from '@/config/widgetAppearance';
import { tourAttr } from '@/config/tourAnchors';
import { WidgetLayout } from '../WidgetLayout';
import { AgendaRow } from './components/AgendaRow';
import { AGENDA_PARTS } from './constants';

export const ArtsLettersAgendaWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as ArtsLettersAgendaConfig;
  const {
    descriptions = {},
    completed = {},
    fontFamily = 'global',
    fontColor = '#1e293b',
    cardColor = '#ffffff',
    cardOpacity = 0.85,
    textSizePreset,
  } = config;

  const latest = useRef(config);
  useLayoutEffect(() => {
    latest.current = config;
  }, [config]);

  const toggle = useCallback(
    (id: ArtsLettersAgendaPartId) => {
      const current = latest.current;
      const done = current.completed ?? {};
      updateWidget(widget.id, {
        config: { ...current, completed: { ...done, [id]: !done[id] } },
      });
    },
    [updateWidget, widget.id]
  );

  const commitDescription = useCallback(
    (id: ArtsLettersAgendaPartId, text: string) => {
      const current = latest.current;
      updateWidget(widget.id, {
        config: {
          ...current,
          descriptions: { ...(current.descriptions ?? {}), [id]: text },
        },
      });
    },
    [updateWidget, widget.id]
  );

  const resetChecks = useCallback(() => {
    updateWidget(widget.id, {
      config: { ...latest.current, completed: {} },
    });
  }, [updateWidget, widget.id]);

  const anyDone = AGENDA_PARTS.some((p) => completed[p.id]);
  const sm = resolveTextPresetMultiplier(textSizePreset, 1);
  const fontClass =
    fontFamily === 'global'
      ? `font-${globalStyle.fontFamily}`
      : fontFamily.startsWith('font-')
        ? fontFamily
        : `font-${fontFamily}`;

  // Rows are size containers, so heights scale the text relative to row height (cqh).
  const titleSize = `clamp(14px, min(${(34 * sm).toFixed(1)}cqh, 9cqw), ${Math.round(64 * sm)}px)`;
  const descSize = `clamp(10px, min(${(18 * sm).toFixed(1)}cqh, 5cqw), ${Math.round(30 * sm)}px)`;
  const boxSize = `clamp(22px, min(46cqh, 14cqw), 64px)`;

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full bg-transparent flex flex-col overflow-hidden ${fontClass}`}
        >
          <h2
            className="hidden [@container(min-height:220px)]:block text-center font-bold leading-tight truncate"
            style={{
              color: fontColor,
              fontSize: `clamp(14px, ${(7 * sm).toFixed(1)}cqmin, ${Math.round(44 * sm)}px)`,
              padding: 'min(10px, 2.2cqmin) 18px 0',
            }}
          >
            Arts &amp; Letters Agenda
          </h2>
          <div
            role="list"
            className="flex-1 min-h-0 flex flex-col"
            style={{
              padding: 'min(10px, 2.2cqmin) max(18px, 2.5cqmin) 0',
              gap: 'min(8px, 2cqmin)',
            }}
          >
            {AGENDA_PARTS.map((part) => (
              <div
                key={part.id}
                role="listitem"
                style={{ flex: 1, minHeight: 0, containerType: 'size' }}
              >
                <AgendaRow
                  id={part.id}
                  label={part.label}
                  description={descriptions[part.id] ?? ''}
                  isDone={!!completed[part.id]}
                  onToggle={toggle}
                  onDescriptionCommit={commitDescription}
                  titleSize={titleSize}
                  descSize={descSize}
                  boxSize={boxSize}
                  cardColor={cardColor}
                  cardOpacity={cardOpacity}
                  fontColor={fontColor}
                />
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: 'min(6px, 1.5cqmin) min(12px, 2.5cqmin) 18px',
            }}
          >
            <button
              {...tourAttr(
                'arts-letters-agenda.reset-checks',
                widget.id,
                widget.type
              )}
              type="button"
              onClick={resetChecks}
              disabled={!anyDone}
              title="Reset checks"
              className="flex items-center justify-center bg-white border border-slate-200 shadow-sm rounded-xl font-black text-indigo-600 uppercase tracking-wider hover:bg-indigo-50 transition-all active:scale-95 disabled:opacity-40"
              style={{
                padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
                fontSize: 'clamp(9px, 2.8cqmin, 11px)',
                minHeight: 20,
              }}
            >
              reset checks
            </button>
          </div>
        </div>
      }
    />
  );
};
