import React from 'react';
import {
  WidgetData,
  WidgetType,
  WidgetConfig,
  CatalystInstructionConfig,
  CatalystVisualConfig,
  QuizConfig,
  WidgetOutput,
  WidgetLayout,
} from '../types';
import { WIDGET_DEFAULTS } from '../config/widgetDefaults';

export const isWidgetLayout = (
  output: WidgetOutput
): output is WidgetLayout => {
  return (
    typeof output === 'object' &&
    output !== null &&
    'content' in output &&
    !React.isValidElement(output)
  );
};

export const getTitle = (widget: WidgetData): string => {
  if (widget.customTitle) return widget.customTitle;
  if (widget.type === 'sound') return 'Noise Meter';
  if (widget.type === 'checklist') return 'Task List';
  if (widget.type === 'random') return 'Selector';
  if (widget.type === 'expectations') return 'Expectations';
  if (widget.type === 'calendar') return 'Class Events';
  if (widget.type === 'lunchCount') return 'Lunch Orders';
  if (widget.type === 'classes') return 'Class Roster';
  if (widget.type === 'time-tool') return 'Timer';
  if (widget.type === 'miniApp') return 'App Manager';
  if (widget.type === 'sticker') return 'Sticker';
  if (widget.type === 'seating-chart') return 'Seating Chart';
  if (widget.type === 'talking-tool') return 'Talking Tool';
  if (widget.type === 'smartNotebook') return 'Notebook Viewer';
  if (widget.type === 'catalyst-instruction') {
    const cfg = widget.config as CatalystInstructionConfig;
    return `Guide: ${cfg.title ?? 'Instruction Guide'}`;
  }
  if (widget.type === 'catalyst-visual') {
    const cfg = widget.config as CatalystVisualConfig;
    return cfg.title ?? 'Visual Anchor';
  }
  if (widget.type === 'quiz') {
    const cfg = widget.config as QuizConfig;
    return cfg.selectedQuizTitle ? `Quiz: ${cfg.selectedQuizTitle}` : 'Quiz';
  }
  return widget.type.charAt(0).toUpperCase() + widget.type.slice(1);
};

/**
 * Get the default configuration for a widget type.
 * Returns an empty object for widgets that don't require configuration.
 */
export const getDefaultWidgetConfig = (type: WidgetType): WidgetConfig => {
  const config = WIDGET_DEFAULTS[type].config ?? {};
  return structuredClone(config);
};
