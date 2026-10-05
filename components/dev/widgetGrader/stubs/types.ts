import type React from 'react';

export interface WidgetStub {
  // Runs once at page load, before any widget mounts.
  install?: () => void;
  // Wraps the board in a provider the widget needs.
  Wrapper?: React.FC<{ children: React.ReactNode }>;
}
