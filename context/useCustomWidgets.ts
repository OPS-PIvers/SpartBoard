import { useContext } from 'react';
import { CustomWidgetsContext } from './CustomWidgetsContextValue';

export function useCustomWidgets() {
  const ctx = useContext(CustomWidgetsContext);
  if (!ctx) {
    throw new Error(
      'useCustomWidgets must be used inside CustomWidgetsProvider'
    );
  }
  return ctx;
}
