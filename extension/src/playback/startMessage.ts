import {
  MAX_PICTURE_TOTAL_CHARS,
  type WebTourCheckStartMessage,
  type WebTourPictureBytes,
  type WebTourStartMessage,
} from '@/components/tours/web/extensionProtocol';
import type { PlaybackTour } from './progress';

export interface ParsedStart {
  tour: PlaybackTour;
  stepIndex: number;
  version: number;
  pictures: Record<string, WebTourPictureBytes>;
  /** Check mode (C12): results go to the page, Next moves on from any step, and nothing counts as a run. */
  check?: boolean;
  /** Check mode: the page's id for this run, echoed in every result. */
  runId?: string;
}

/** Turns a checked `web-tour/start` message into what playback keeps. */
export function toPlayback(
  msg: WebTourStartMessage | WebTourCheckStartMessage
): ParsedStart {
  const pictures: Record<string, WebTourPictureBytes> = {};
  let pictureChars = 0;
  const steps = msg.tour.steps.map((s) => {
    const { frames = [], ...clues } = s.web.locator;
    let hasPicture = false;
    // Past the store's room a step simply has no picture fallback.
    if (
      s.picture &&
      pictureChars + s.picture.data.length <= MAX_PICTURE_TOTAL_CHARS
    ) {
      pictures[s.id] = s.picture;
      pictureChars += s.picture.data.length;
      hasPicture = true;
    }
    return {
      id: s.id,
      title: s.label ?? '',
      text: s.text ?? '',
      urlPattern: s.web.urlPattern,
      frames,
      clues,
      action: s.web.action,
      hasPicture,
    };
  });
  return {
    tour: {
      id: msg.tour.setId,
      title: msg.tour.title,
      startUrl: msg.startUrl,
      steps,
    },
    stepIndex: Math.min(msg.stepIndex, steps.length - 1),
    version: msg.tour.version,
    pictures,
    ...(msg.type === 'web-tour/check' ? { check: true, runId: msg.runId } : {}),
  };
}
