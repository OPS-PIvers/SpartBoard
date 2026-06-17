import { useContext } from 'react';
import { ToolVisibilityContext } from './ToolVisibilityContextValue';

export const useToolVisibility = () => {
  const context = useContext(ToolVisibilityContext);
  if (!context)
    throw new Error(
      'useToolVisibility must be used within DashboardProvider, which provides ToolVisibilityContext (bare hosts like SubsDashboardProvider and student apps do not mount it)'
    );
  return context;
};
