import { useContext } from 'react';
import { ToolVisibilityContext } from './ToolVisibilityContextValue';

export const useToolVisibility = () => {
  const context = useContext(ToolVisibilityContext);
  if (!context)
    throw new Error('useToolVisibility must be used within DashboardProvider');
  return context;
};
