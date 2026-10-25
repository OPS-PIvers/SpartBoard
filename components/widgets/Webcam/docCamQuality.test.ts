import { describe, it, expect } from 'vitest';
import { readCameraControls, resolutionConstraints } from './docCamQuality';

const track = (caps: object, settings: object) =>
  ({
    getCapabilities: () => caps,
    getSettings: () => settings,
  }) as unknown as MediaStreamTrack;

describe('readCameraControls', () => {
  it('reads single-shot as switched off', () => {
    const c = readCameraControls(
      track(
        { focusMode: ['continuous', 'single-shot'] },
        { focusMode: 'single-shot' }
      )
    );
    expect(c).toMatchObject({ focus: true, focusAuto: false });
  });

  it('offers no switch when the camera has only one mode', () => {
    const c = readCameraControls(
      track({ exposureMode: ['continuous'] }, { exposureMode: 'continuous' })
    );
    expect(c).toMatchObject({ exposure: false, exposureAuto: true });
  });
});

describe('resolutionConstraints', () => {
  it('adds nothing for Automatic', () => {
    expect(resolutionConstraints('auto')).toEqual({});
  });
});
