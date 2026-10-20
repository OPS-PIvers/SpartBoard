// Microphone checks for Speak (F12, F29): what blocks the mic, and whether the browser will ask first.
import type { TakeMicState } from '@/types';

export type SpeakBlockReason =
  | 'no-mic'
  | 'mic-blocked'
  | 'framed'
  | 'download-failed'
  | 'integrity'
  | 'too-slow'
  | 'no-wasm'
  | 'no-worker'
  | 'no-capture';

export type MicPermission = 'granted' | 'denied' | 'prompt';

interface PolicyLike {
  allowsFeature?: (feature: string) => boolean;
}

/** False when this frame's permissions policy forbids the mic; true when it allows it or can't say. */
export function frameAllowsMic(doc: Document = document): boolean {
  const withPolicy = doc as Document & {
    permissionsPolicy?: PolicyLike;
    featurePolicy?: PolicyLike;
  };
  const policy = withPolicy.permissionsPolicy ?? withPolicy.featurePolicy;
  if (typeof policy?.allowsFeature !== 'function') return true;
  try {
    return policy.allowsFeature('microphone');
  } catch {
    return true;
  }
}

export const canCapture = (): boolean =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function' &&
  typeof MediaRecorder !== 'undefined';

/** The browser's remembered mic answer; `prompt` when it can't tell, so the pre-prompt shows (F29). */
export async function micPermission(): Promise<MicPermission> {
  try {
    const status = await navigator.permissions.query({
      name: 'microphone',
    });
    return status.state;
  } catch {
    return 'prompt';
  }
}

/** A failed capture as an F12 reason; a framed page that fails is the frame's doing. */
export const reasonFromMicState = (
  micState: TakeMicState | null,
  framed: boolean
): SpeakBlockReason =>
  framed ? 'framed' : micState === 'denied' ? 'mic-blocked' : 'no-mic';

/** True inside any frame; a cross-origin parent throws, which is still a frame. */
export function isFramedWindow(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export const isChromeOs = (): boolean =>
  typeof navigator !== 'undefined' && /\bCrOS\b/.test(navigator.userAgent);
