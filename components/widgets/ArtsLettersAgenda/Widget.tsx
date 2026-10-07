import React, { useCallback } from 'react';
import {
  useDashboardActions,
  useGlobalStyle,
} from '@/context/dashboardCanvasStore';
import { Button } from '@/components/common/Button';
import {
  ArtsLettersAgendaConfig,
  ArtsLettersAgendaPartId,
  WidgetData,
} from '@/types';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { resolveTextPresetMultiplier } from '@/config/widgetAppearance';
import { tourAttr } from '@/config/tourAnchors';
import { WidgetLayout } from '../WidgetLayout';
import { AgendaRow } from './components/AgendaRow';
import { AGENDA_PARTS } from './constants';

const DEFAULTS = WIDGET_DEFAULTS['arts-letters-agenda']
  .config as Required<ArtsLettersAgendaConfig>;

export const ArtsLettersAgendaWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboardActions();
  const globalStyle = useGlobalStyle();
  const config = widget.config as ArtsLettersAgendaConfig;
  const {
    descriptions = {},
    completed = {},
    fontFamily = DEFAULTS.fontFamily,
    fontColor = DEFAULTS.fontColor,
    cardColor = DEFAULTS.cardColor,
    cardOpacity = DEFAULTS.cardOpacity,
    textSizePreset,
  } = config;

  const toggle = useCallback(
    (id: ArtsLettersAgendaPartId) => {
      updateWidget(widget.id, {
        config: {
          ...config,
          completed: { ...completed, [id]: !completed[id] },
        },
      });
    },
    [updateWidget, widget.id, config, completed]
  );

  const commitDescription = useCallback(
    (id: ArtsLettersAgendaPartId, text: string) => {
      updateWidget(widget.id, {
        config: { ...config, descriptions: { ...descriptions, [id]: text } },
      });
    },
    [updateWidget, widget.id, config, descriptions]
  );

  const resetChecks = useCallback(() => {
    updateWidget(widget.id, { config: { ...config, completed: {} } });
  }, [updateWidget, widget.id, config]);

  const anyDone = AGENDA_PARTS.some((p) => completed[p.id]);
  const sm = resolveTextPresetMultiplier(textSizePreset, 1);
  const fontClass =
    fontFamily === 'global'
      ? `font-${globalStyle.fontFamily}`
      : fontFamily.startsWith('font-')
        ? fontFamily
        : `font-${fontFamily}`;

  // Rows are size containers, so heights scale the text relative to row height (cqh).
  const titleSize = `clamp(14px, min(${(34 * sm).toFixed(1)}cqh, 9cqw), ${Math.round(112 * sm)}px)`;
  const descSize = `clamp(10px, min(${(18 * sm).toFixed(1)}cqh, 5cqw), ${Math.round(52 * sm)}px)`;
  const boxSize = 'clamp(16px, min(46cqh, 14cqw), 104px)';

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
              fontSize: `clamp(14px, ${(7 * sm).toFixed(1)}cqmin, ${Math.round(72 * sm)}px)`,
              padding: 'min(10px, 2.2cqmin) 18px 0',
            }}
          >
            Arts &amp; Letters Agenda
          </h2>
          <div
            role="list"
            className="flex-1 overflow-hidden flex flex-col [@container(min-aspect-ratio:2.4)]:flex-row"
            style={{
              padding: 'min(10px, 2.2cqmin) max(18px, 2.5cqmin) 0',
              gap: 'min(8px, 2cqmin)',
            }}
          >
            {AGENDA_PARTS.map((part) => (
              <div
                key={part.id}
                role="listitem"
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  containerType: 'size',
                }}
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
            className="flex justify-center"
            style={{
              padding: 'min(6px, 1.5cqmin) min(12px, 2.5cqmin) 18px',
            }}
          >
            <Button
              {...tourAttr(
                'arts-letters-agenda.reset-checks',
                widget.id,
                widget.type
              )}
              variant="secondary"
              shape="pill"
              size="sm"
              onClick={resetChecks}
              disabled={!anyDone}
              title="Reset checks"
              className="relative touch-target-expand [@container(max-height:149px)]:hidden"
              style={{
                fontSize: 'clamp(14px, 3.2cqmin, 18px)',
                minHeight: 'max(24px, min(44px, 12cqmin))',
              }}
            >
              reset checks
            </Button>
          </div>
        </div>
      }
    />
  );
};
