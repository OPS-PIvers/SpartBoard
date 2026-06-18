import React from 'react';
import { useGlobalStyle } from '@/context/dashboardCanvasStore';

/**
 * Custom Label Component for consistent readability
 * Adjusts text color based on background brightness or global settings.
 */
export const DockLabel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const globalStyle = useGlobalStyle();

  return (
    <span
      className={`text-xxs font-black uppercase tracking-tighter whitespace-nowrap transition-colors duration-300 select-none font-${globalStyle.fontFamily} ${className ?? ''}`}
      style={{
        color: globalStyle.dockTextColor,
        textShadow: globalStyle.dockTextShadow
          ? '0 1px 3px rgba(0,0,0,0.9)'
          : 'none',
      }}
    >
      {children}
    </span>
  );
};
