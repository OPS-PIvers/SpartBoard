import React from 'react';
import { WidgetLayout as WidgetLayoutProps } from '@/types';

/**
 * Standardized layout component for all widgets.
 * Implements the flexbox structure defined in the implementation plan.
 */
export const WidgetLayout: React.FC<WidgetLayoutProps> = ({
  header,
  content,
  footer,
  contentClassName,
  padding = 'p-2',
}) => {
  const hasPadding = padding !== 'p-0';

  return (
    <div className={`h-full w-full flex flex-col ${padding}`}>
      {/* Header - fixed size */}
      {header && (
        <div className={`shrink-0 ${hasPadding ? 'mb-2' : ''}`}>{header}</div>
      )}

      {/* Content - grows to fill space */}
      <div
        className={
          contentClassName ?? 'flex-1 min-h-0 flex items-center justify-center'
        }
      >
        {content}
      </div>

      {/* Footer - fixed size */}
      {footer && (
        <div className={`shrink-0 ${hasPadding ? 'mt-2' : ''}`}>{footer}</div>
      )}
    </div>
  );
};
