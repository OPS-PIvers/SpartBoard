import type { TourRecording } from './useTourCapture';

export interface UploadedFrame {
  url: string;
  storagePath?: string;
  thumbnailUrl?: string;
}

/** The recording with only the frames at `kept` (original indexes, in order); their steps follow. */
export function keepFrames(
  recording: TourRecording,
  kept: readonly number[]
): TourRecording {
  const position = new Map(kept.map((orig, i) => [orig, i]));
  return {
    frames: kept.map((i) => recording.frames[i]),
    redactions: kept.map((i) => recording.redactions[i] ?? []),
    steps: recording.steps.flatMap((s) => {
      const at = position.get(s.frameIndex);
      return at === undefined ? [] : [{ ...s, frameIndex: at }];
    }),
  };
}

/** Uploads each frame at most once per session: frames already in `done` are skipped on retry. */
export async function uploadFramesOnce(
  frames: readonly Blob[],
  done: Map<Blob, UploadedFrame>,
  uploadOne: (frame: Blob, index: number) => Promise<UploadedFrame>,
  onProgress?: (current: number, total: number) => void
): Promise<UploadedFrame[]> {
  const out: UploadedFrame[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    let result = done.get(frame);
    if (!result) {
      onProgress?.(i + 1, frames.length);
      result = await uploadOne(frame, i);
      done.set(frame, result);
    }
    out.push(result);
  }
  return out;
}
