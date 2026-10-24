import type { GuidedLearningStep } from '@/types';
import type { WebTourStep } from '@/components/widgets/GuidedLearning/utils/liveTour';
import { logError } from '@/utils/logError';
import {
  isWebTourPicturePath,
  loadWebTourPicture,
} from '@/components/tours/webTours';
import type { WebTourMatch } from '@/components/tours/tourRuns';
import type {
  WebTourPictureBytes,
  WebTourStartTour,
} from './extensionProtocol';
import type { WebTourPortEvent } from './extensionClient';
import { buildStartTour } from './handoff';

export { isHandoffPattern, pageUrlOf, startUrlOf } from './handoff';

export type HubStep = WebTourStep;

export const hubStepsOf = (steps: readonly GuidedLearningStep[]): HubStep[] =>
  steps.filter((s): s is HubStep => !!s.web);

/** Ignores extension events that name a step this tour doesn't have. */
export function eventFitsTour(
  event: WebTourPortEvent,
  steps: readonly HubStep[]
): boolean {
  if (event.type === 'web-tour/done') return true;
  if (event.stepIndex >= steps.length) return false;
  return (
    (event.type !== 'web-tour/step' && event.type !== 'web-tour/suggest') ||
    steps[event.stepIndex]?.id === event.stepId
  );
}

export interface LoadedPicture {
  mime: WebTourPictureBytes['mime'];
  bytes: Uint8Array;
  w: number;
  h: number;
}

const sniffMime = (b: Uint8Array): LoadedPicture['mime'] | null => {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return 'image/png';
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
};

/** Each step's picture, read through the SDK; a picture outside this tour's folder is skipped. */
export async function loadPictures(
  setId: string,
  steps: readonly HubStep[],
  read: (path: string) => Promise<ArrayBuffer> = loadWebTourPicture
): Promise<Map<string, LoadedPicture>> {
  const out = new Map<string, LoadedPicture>();
  await Promise.all(
    steps.map(async (step) => {
      const pic = step.web.picture;
      if (!pic || !isWebTourPicturePath(setId, pic.path)) return;
      try {
        const bytes = new Uint8Array(await read(pic.path));
        const mime = sniffMime(bytes);
        if (mime) {
          out.set(step.id, { mime, bytes, w: pic.w, h: pic.h });
        }
      } catch (err) {
        logError('webTourHub.picture', err, { setId, stepId: step.id });
      }
    })
  );
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** The tour as the extension takes it, with pictures until the per-picture and total caps. */
export function buildHandoff(
  setId: string,
  version: number,
  title: string,
  steps: readonly HubStep[],
  pictures: ReadonlyMap<string, LoadedPicture>,
  scored = false
): WebTourStartTour {
  const encoded = new Map<string, WebTourPictureBytes>();
  pictures.forEach((pic, id) => {
    if (pic.w > 0 && pic.h > 0)
      encoded.set(id, {
        mime: pic.mime,
        data: toBase64(pic.bytes),
        w: pic.w,
        h: pic.h,
      });
  });
  return buildStartTour(setId, version, title, steps, encoded, scored);
}

export type HubPlay =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | {
      kind: 'playing';
      index: number;
      furthest: number;
      matches: Record<string, WebTourMatch>;
    }
  | {
      kind: 'closed';
      index: number;
      furthest: number;
      matches: Record<string, WebTourMatch>;
    }
  | {
      kind: 'exited';
      index: number;
      furthest: number;
      matches: Record<string, WebTourMatch>;
    }
  | { kind: 'done'; furthest: number; matches: Record<string, WebTourMatch> }
  | { kind: 'failed'; error: string };

const progressOf = (play: HubPlay) =>
  'matches' in play
    ? {
        furthest: play.furthest,
        matches: play.matches,
        index: 'index' in play ? play.index : play.furthest,
      }
    : { furthest: 0, matches: {}, index: 0 };

/** The hub's view of a run after one extension event. */
export function reducePlay(play: HubPlay, event: WebTourPortEvent): HubPlay {
  const p = progressOf(play);
  switch (event.type) {
    case 'web-tour/step':
      return {
        kind: 'playing',
        index: event.stepIndex,
        furthest: Math.max(p.furthest, event.stepIndex),
        // The extension re-posts a step when a clue finds it after the picture showed.
        matches: { ...p.matches, [event.stepId]: event.match },
      };
    case 'web-tour/done':
      return { kind: 'done', furthest: p.furthest, matches: p.matches };
    case 'web-tour/exit':
      return {
        kind: 'exited',
        index: event.stepIndex,
        furthest: p.furthest,
        matches: p.matches,
      };
    case 'web-tour/closed':
      return {
        kind: 'closed',
        index: event.stepIndex,
        furthest: p.furthest,
        matches: p.matches,
      };
    case 'web-tour/suggest':
      return play;
  }
}
