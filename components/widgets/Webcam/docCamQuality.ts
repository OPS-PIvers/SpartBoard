export type DocCamResolution = 'auto' | '720p' | '1080p' | 'max';

export const RESOLUTION_OPTIONS: { id: DocCamResolution; label: string }[] = [
  { id: 'auto', label: 'Automatic' },
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p' },
  { id: 'max', label: 'Best available' },
];

const SIZES: Record<Exclude<DocCamResolution, 'auto'>, [number, number]> = {
  '720p': [1280, 720],
  '1080p': [1920, 1080],
  max: [4096, 2160],
};

export const normalizeResolution = (r: unknown): DocCamResolution =>
  r === '720p' || r === '1080p' || r === 'max' ? r : 'auto';

/** Extra getUserMedia video constraints for a resolution choice; empty for Automatic. */
export const resolutionConstraints = (
  r: DocCamResolution
): MediaTrackConstraints => {
  if (r === 'auto') return {};
  const [width, height] = SIZES[r];
  return { width: { ideal: width }, height: { ideal: height } };
};

// Focus and exposure aren't in TypeScript's DOM lib yet; Chrome reports them on camera tracks.
interface CameraCapabilities {
  focusMode?: string[];
  exposureMode?: string[];
}
interface CameraSettings {
  focusMode?: string;
  exposureMode?: string;
}

export interface CameraControls {
  focus: boolean;
  exposure: boolean;
  focusAuto: boolean;
  exposureAuto: boolean;
}

export const NO_CAMERA_CONTROLS: CameraControls = {
  focus: false,
  exposure: false,
  focusAuto: true,
  exposureAuto: true,
};

const canToggle = (modes: string[] | undefined) =>
  !!modes?.includes('continuous') &&
  (modes.includes('manual') || modes.includes('single-shot'));

const isAuto = (mode: string | undefined) =>
  mode !== 'manual' && mode !== 'single-shot';

/** Which auto modes this camera lets us switch off, and their current state. */
export function readCameraControls(
  track: MediaStreamTrack | undefined
): CameraControls {
  const caps = (track?.getCapabilities?.() ?? {}) as CameraCapabilities;
  const settings = (track?.getSettings?.() ?? {}) as CameraSettings;
  return {
    focus: canToggle(caps.focusMode),
    exposure: canToggle(caps.exposureMode),
    focusAuto: isAuto(settings.focusMode),
    exposureAuto: isAuto(settings.exposureMode),
  };
}

/** Switches continuous focus or exposure on or off; resolves false when the camera refuses. */
export async function setAutoMode(
  track: MediaStreamTrack,
  kind: 'focusMode' | 'exposureMode',
  auto: boolean
): Promise<boolean> {
  const caps = (track.getCapabilities?.() ?? {}) as CameraCapabilities;
  const modes = kind === 'focusMode' ? caps.focusMode : caps.exposureMode;
  const off = modes?.includes('manual') ? 'manual' : 'single-shot';
  try {
    await track.applyConstraints({
      advanced: [{ [kind]: auto ? 'continuous' : off }],
    });
    return true;
  } catch {
    return false;
  }
}
