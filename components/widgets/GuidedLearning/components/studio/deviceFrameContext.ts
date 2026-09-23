import { createContext, useContext } from 'react';
import type { DeviceFrameContextValue } from '../../types/stage';

export const DeviceFrameContext = createContext<DeviceFrameContextValue | null>(
  null
);

/** Preset and visual scale of the enclosing DeviceFrame; null outside one. */
export function useDeviceFrame(): DeviceFrameContextValue | null {
  return useContext(DeviceFrameContext);
}

/** Largest scale that fits a w×h box inside the available space, never above 1. */
export function fitScale(
  box: { w: number; h: number },
  available: { w: number; h: number }
): number {
  if (box.w <= 0 || box.h <= 0 || available.w <= 0 || available.h <= 0) {
    return 1;
  }
  return Math.min(1, available.w / box.w, available.h / box.h);
}
