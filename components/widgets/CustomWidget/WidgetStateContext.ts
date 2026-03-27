import React, { createContext, useContext } from 'react';
import { CustomGridDefinition } from '@/types';
import { WidgetBlockState, WidgetAction } from './types';

export interface WidgetStateContextValue {
  state: WidgetBlockState;
  dispatch: React.Dispatch<WidgetAction>;
  gridDefinition: CustomGridDefinition | undefined;
  adminSettings: Record<string, string | number | boolean> | undefined;
}

export const WidgetStateContext = createContext<WidgetStateContextValue | null>(
  null
);

export function useWidgetState(): WidgetStateContextValue {
  const ctx = useContext(WidgetStateContext);
  if (!ctx)
    throw new Error('useWidgetState must be used inside CustomWidgetWidget');
  return ctx;
}
