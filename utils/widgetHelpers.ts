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
  FeaturePermission,
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

export const getTitle = (
  widget: WidgetData,
  permission?: FeaturePermission | null
): string => {
  if (widget.customTitle) return widget.customTitle;
  if (permission?.displayName) return permission.displayName;

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

export interface PinchScaleResult {
  newScaleMultiplier: number;
  relativeScale: number;
}

/**
 * Calculates the new content scale multiplier based on a pinch gesture.
 */
export function calculatePinchScale(
  startScale: number,
  gestureScale: number
): PinchScaleResult | null {
  if (!Number.isFinite(startScale) || startScale <= 0) {
    return null;
  }
  if (!Number.isFinite(gestureScale)) {
    return null;
  }

  let newScaleMultiplier = startScale * gestureScale;
  // Clamp it to reasonable bounds (0.5x to 3x)
  newScaleMultiplier = Math.max(0.5, Math.min(newScaleMultiplier, 3));

  const relativeScale = newScaleMultiplier / startScale;
  if (!Number.isFinite(relativeScale)) {
    return null;
  }

  return { newScaleMultiplier, relativeScale };
}

/**
 * Calculates the midpoint of two touch points relative to an element.
 * Used for zoom-at-point origin.
 */
export function calculatePinchOrigin(
  touches: { clientX: number; clientY: number }[],
  elementRect: DOMRect
): { x: number; y: number } {
  if (touches.length < 2) return { x: 50, y: 50 }; // Default to center

  const midX = (touches[0].clientX + touches[1].clientX) / 2;
  const midY = (touches[0].clientY + touches[1].clientY) / 2;

  // Convert to percentage relative to element
  const x = ((midX - elementRect.left) / elementRect.width) * 100;
  const y = ((midY - elementRect.top) / elementRect.height) * 100;

  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  };
}

/**
 * Get the default configuration for a widget type.
 * Returns an empty object for widgets that don't require configuration.
 */
export const getDefaultWidgetConfig = (type: WidgetType): WidgetConfig => {
  const config = WIDGET_DEFAULTS[type].config ?? {};
  return structuredClone(config);
};
