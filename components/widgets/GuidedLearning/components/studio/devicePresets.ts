import type { DevicePreset } from '../../types/stage';

export const DEVICE_PRESETS: readonly DevicePreset[] = [
  { id: 'board', w: 720, h: 520 },
  { id: 'help', w: 1024, h: 576 },
  { id: 'chromebook', w: 1366, h: 657 },
  { id: 'projector', w: 1920, h: 1080 },
];

export const DEFAULT_CUSTOM_SIZE = { w: 1280, h: 720 };
export const CUSTOM_SIZE_LIMITS = { min: 240, max: 3840 };

const STORAGE_KEY = 'gl-studio-device-preset';

export function clampCustomSize(n: number): number {
  if (!Number.isFinite(n)) return CUSTOM_SIZE_LIMITS.min;
  return Math.round(
    Math.min(CUSTOM_SIZE_LIMITS.max, Math.max(CUSTOM_SIZE_LIMITS.min, n))
  );
}

export function customPreset(w: number, h: number): DevicePreset {
  return {
    id: 'custom',
    w: clampCustomSize(w),
    h: clampCustomSize(h),
  };
}

export function presetById(id: DevicePreset['id']): DevicePreset {
  return (
    DEVICE_PRESETS.find((p) => p.id === id) ??
    customPreset(DEFAULT_CUSTOM_SIZE.w, DEFAULT_CUSTOM_SIZE.h)
  );
}

/** The last preset chosen in the Studio, or the widget default. */
export function loadDevicePreset(): DevicePreset {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEVICE_PRESETS[0];
    const parsed = JSON.parse(raw) as Partial<DevicePreset>;
    if (parsed.id === 'custom') {
      return customPreset(Number(parsed.w), Number(parsed.h));
    }
    return DEVICE_PRESETS.find((p) => p.id === parsed.id) ?? DEVICE_PRESETS[0];
  } catch {
    return DEVICE_PRESETS[0];
  }
}

export function saveDevicePreset(preset: DevicePreset): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preset));
  } catch {
    // Private windows and blocked storage just don't remember the choice.
  }
}
