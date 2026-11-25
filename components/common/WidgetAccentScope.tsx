import React from 'react';
import { useWidgetAccent, widgetAccentVars } from './widgetAccentContext';

// Wraps a portaled popup so it takes its widget's accent like a Modal does; renders nothing extra outside a widget.
export const WidgetAccentScope: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const accent = useWidgetAccent();
  if (!accent) return <>{children}</>;
  return (
    <div className="contents" style={widgetAccentVars(accent)}>
      {children}
    </div>
  );
};
