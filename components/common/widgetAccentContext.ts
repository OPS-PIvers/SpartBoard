import { createContext, useContext, type CSSProperties } from 'react';
import type { GlobalFeature, WidgetType } from '@/types';
import { LIBRARY_HEADER_ACCENTS } from './library/libraryAccents';

// The accent of the widget a dialog was opened from; undefined keeps brand blue.
export const WidgetAccentContext = createContext<string | undefined>(undefined);

export const useWidgetAccent = (): string | undefined =>
  useContext(WidgetAccentContext);

// Re-points the brand blue shades at the accent, so every brand-blue class inside follows it.
export const widgetAccentVars = (accent: string): CSSProperties =>
  ({
    '--brand-blue-primary': accent,
    '--brand-blue-dark': `color-mix(in oklab, ${accent} 78%, black)`,
    '--brand-blue-light': `color-mix(in oklab, ${accent} 90%, black)`,
    '--brand-blue-lighter': `color-mix(in oklab, ${accent} 9%, white)`,
  }) as CSSProperties;

// The accent a widget's dialogs take, behind the widget-colored-dialogs preview.
export const widgetDialogAccent = (
  type: WidgetType,
  canAccessFeature: (id: GlobalFeature) => boolean
): string | undefined =>
  LIBRARY_HEADER_ACCENTS[type] && canAccessFeature('widget-colored-dialogs')
    ? LIBRARY_HEADER_ACCENTS[type]
    : undefined;
