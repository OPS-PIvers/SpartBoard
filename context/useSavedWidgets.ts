import { useContext } from 'react';
import { SavedWidgetsContext } from './SavedWidgetsContextValue';

export function useSavedWidgets() {
  const ctx = useContext(SavedWidgetsContext);
  if (!ctx) {
    throw new Error('useSavedWidgets must be used inside SavedWidgetsProvider');
  }
  return ctx;
}
