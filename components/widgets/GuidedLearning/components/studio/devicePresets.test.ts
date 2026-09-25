import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CUSTOM_SIZE_LIMITS,
  DEVICE_PRESETS,
  clampCustomSize,
  customPreset,
  loadDevicePreset,
  saveDevicePreset,
} from './devicePresets';
import { fitScale } from './deviceFrameContext';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('device presets', () => {
  it('matches the real surfaces in true pixels', () => {
    expect(DEVICE_PRESETS.map((p) => [p.id, p.w, p.h])).toEqual([
      ['board', 720, 520],
      ['help', 1024, 576],
      ['chromebook', 1366, 657],
      ['projector', 1920, 1080],
    ]);
  });

  it('clamps custom sizes to whole pixels within limits', () => {
    expect(clampCustomSize(10)).toBe(CUSTOM_SIZE_LIMITS.min);
    expect(clampCustomSize(9999)).toBe(CUSTOM_SIZE_LIMITS.max);
    expect(clampCustomSize(800.6)).toBe(801);
    expect(clampCustomSize(Number.NaN)).toBe(CUSTOM_SIZE_LIMITS.min);
  });

  it('remembers the last preset, custom sizes included', () => {
    expect(loadDevicePreset().id).toBe('board');
    saveDevicePreset(DEVICE_PRESETS[3]);
    expect(loadDevicePreset().id).toBe('projector');
    saveDevicePreset(customPreset(800, 600));
    expect(loadDevicePreset()).toEqual(customPreset(800, 600));
  });

  it('falls back to the widget size when storage is unreadable', () => {
    localStorage.setItem('gl-studio-device-preset', '{not json');
    expect(loadDevicePreset().id).toBe('board');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadDevicePreset().id).toBe('board');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveDevicePreset(DEVICE_PRESETS[1])).not.toThrow();
  });
});

describe('fitScale', () => {
  it('shrinks to the tighter axis and never enlarges', () => {
    expect(fitScale({ w: 1920, h: 1080 }, { w: 960, h: 900 })).toBe(0.5);
    expect(fitScale({ w: 1000, h: 1000 }, { w: 2000, h: 500 })).toBe(0.5);
    expect(fitScale({ w: 720, h: 520 }, { w: 2000, h: 2000 })).toBe(1);
  });

  it('stays at 1 before the space is measured', () => {
    expect(fitScale({ w: 720, h: 520 }, { w: 0, h: 0 })).toBe(1);
  });
});
