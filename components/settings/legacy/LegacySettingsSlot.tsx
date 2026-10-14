import React, { Suspense } from 'react';
import type { WidgetData } from '@/types';
import {
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_APPEARANCE_COMPONENTS,
} from '@/components/widgets/WidgetRegistry';

export type LegacySlotKind = 'settings' | 'appearance';

// Spinner while the lazy legacy panel loads.
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full w-full">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

export interface LegacySettingsSlotProps {
  widget: WidgetData;
  slot?: LegacySlotKind;
}

/** Renders an unmigrated widget's legacy panel inside the drawer body. */
export const LegacySettingsSlot: React.FC<LegacySettingsSlotProps> = ({
  widget,
  slot = 'settings',
}) => {
  const Component =
    slot === 'appearance'
      ? WIDGET_APPEARANCE_COMPONENTS[widget.type]
      : WIDGET_SETTINGS_COMPONENTS[widget.type];
  if (!Component) return null;
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Component widget={widget} />
    </Suspense>
  );
};
