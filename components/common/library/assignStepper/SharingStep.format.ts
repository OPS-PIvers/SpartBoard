import type { Plc } from '@/types';

export interface SharingStepValue {
  plcMode: boolean;
  /** Chosen PLC id; '' means none picked yet. */
  plcId: string;
}

export interface SharingStepContext {
  plcs: readonly Plc[];
}

/** D10: shown only for teachers in a PLC when the assignment collects work. */
export const isSharingStepAvailable = (
  plcs: readonly Plc[],
  kind: 'work' | 'resource'
): boolean => plcs.length > 0 && kind === 'work';

/** Explicit choice wins, a sole PLC auto-selects, a stale id resolves to none. */
export const resolveSharingPlc = (
  value: SharingStepValue,
  plcs: readonly Plc[]
): Plc | null =>
  plcs.find((p) => p.id === value.plcId) ??
  (plcs.length === 1 ? plcs[0] : null);

export const formatSharingValue = (
  value: SharingStepValue,
  { plcs }: SharingStepContext
): string => {
  const plc = value.plcMode ? resolveSharingPlc(value, plcs) : null;
  return plc ? `Shared with ${plc.name}` : 'Not shared';
};
