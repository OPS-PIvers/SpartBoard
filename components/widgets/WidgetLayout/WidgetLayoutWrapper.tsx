import React, { Suspense } from 'react';
import { WidgetData, WidgetComponentProps } from '@/types';
import { WIDGET_COMPONENTS } from '@/components/widgets/WidgetRegistry';

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full w-full">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

interface WidgetLayoutWrapperProps {
  widget: WidgetData;
  w: number;
  h: number;
  scale?: number;
  isStudentView?: boolean;
  studentPin?: string | null;
  isSpotlighted?: boolean;
}

/**
 * Standardized wrapper for all widgets.
 * Handles lazy loading and provides props to widget components.
 */
export const WidgetLayoutWrapper: React.FC<WidgetLayoutWrapperProps> = ({
  widget,
  w,
  h,
  scale,
  isStudentView = false,
  studentPin,
  isSpotlighted,
}) => {
  const WidgetComponent = WIDGET_COMPONENTS[widget.type];

  if (!WidgetComponent) {
    return (
      <div className="p-4 text-center text-slate-400 text-sm">
        Widget under construction
      </div>
    );
  }

  const componentProps: WidgetComponentProps = {
    widget: { ...widget, w, h },
    scale,
    isStudentView,
    studentPin,
    isSpotlighted,
  };

  return (
    <Suspense fallback={<LoadingFallback />}>
      <WidgetComponent {...componentProps} />
    </Suspense>
  );
};
