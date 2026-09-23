import {
  TOUR_ANCHORS,
  isTourAnchorId,
  parseTourAnchorRef,
} from '@/config/tourAnchors';
import {
  draftGuidedLearningStepText,
  type StepTextDraftInput,
} from '@/utils/ai';
import type { RecordedPlacement, Size } from './resolveAnchor';
import type { TourRecording } from './useTourCapture';

const CONTEXT = 0.2;
const MAX_SIDE = 800;
const BATCH = 20;

export interface CropBox {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dw: number;
  dh: number;
}

/** The step's region plus 20% context on each side, in frame px, scaled to at most 800px. */
export function cropBox(placement: RecordedPlacement, frame: Size): CropBox {
  const w = (placement.region.wPct / 100) * frame.w;
  const h = (placement.region.hPct / 100) * frame.h;
  const cx = (placement.xPct / 100) * frame.w;
  const cy = (placement.yPct / 100) * frame.h;
  const sw = Math.min(frame.w, w * (1 + CONTEXT * 2));
  const sh = Math.min(frame.h, h * (1 + CONTEXT * 2));
  const sx = Math.min(Math.max(cx - sw / 2, 0), frame.w - sw);
  const sy = Math.min(Math.max(cy - sh / 2, 0), frame.h - sh);
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.round(sw),
    sh: Math.round(sh),
    dw: Math.max(1, Math.round(sw * k)),
    dh: Math.max(1, Math.round(sh * k)),
  };
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(
        typeof reader.result === 'string'
          ? reader.result.replace(/^data:[^,]*,/, '')
          : ''
      );
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });

async function cropFrame(frame: Blob, placement: RecordedPlacement) {
  const bitmap = await createImageBitmap(frame);
  const box = cropBox(placement, { w: bitmap.width, h: bitmap.height });
  const canvas = document.createElement('canvas');
  canvas.width = box.dw;
  canvas.height = box.dh;
  canvas
    .getContext('2d')
    ?.drawImage(bitmap, box.sx, box.sy, box.sw, box.sh, 0, 0, box.dw, box.dh);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  );
  if (!blob) throw new Error('Could not crop the recorded frame.');
  return toBase64(blob);
}

/** The registry's description of a recorded anchor, for the model's context. */
export const anchorLabelOf = (ref: string): string => {
  const { id } = parseTourAnchorRef(ref);
  return isTourAnchorId(id) ? TOUR_ANCHORS[id].label : '';
};

/** Drafts label and text for every recorded step, 20 at a time. */
export async function draftRecordedStepText(
  recording: TourRecording,
  goal?: string
): Promise<{ label: string; text: string }[]> {
  const inputs: StepTextDraftInput[] = [];
  for (const step of recording.steps) {
    inputs.push({
      imageBase64: await cropFrame(recording.frames[step.frameIndex], step),
      mimeType: 'image/jpeg',
      anchorLabel: anchorLabelOf(step.tour.anchor),
      accessibleName: step.tour.fallback?.name ?? '',
      action: step.tour.action,
    });
  }
  const drafts: { label: string; text: string }[] = [];
  for (let i = 0; i < inputs.length; i += BATCH) {
    drafts.push(
      ...(await draftGuidedLearningStepText(inputs.slice(i, i + BATCH), goal))
    );
  }
  return drafts;
}
