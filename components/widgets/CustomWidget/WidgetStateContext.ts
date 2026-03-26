import React, { createContext, useContext } from 'react';
import { CustomGridDefinition } from '@/types';
import { WidgetBlockState, WidgetAction } from './types';

export interface WidgetStateContextValue {
  state: WidgetBlockState;
  dispatch: React.Dispatch<WidgetAction>;
  gridDefinition: CustomGridDefinition | undefined;
  adminSettings: Record<string, string | number | boolean> | undefined;
}

export const WidgetStateContext = createContext<WidgetStateContextValue>({
  state: {},
  dispatch: () => undefined,
  gridDefinition: undefined,
  adminSettings: undefined,
});

export function useWidgetState(): WidgetStateContextValue {
  return useContext(WidgetStateContext);
}
