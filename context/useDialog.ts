import { useContext } from 'react';
import { DialogContext, DialogContextValue } from './DialogContext';

export const useDialog = (): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return ctx;
};
