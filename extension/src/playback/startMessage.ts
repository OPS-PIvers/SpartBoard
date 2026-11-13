import {
  isStartMessageStep,
  MAX_PICTURE_TOTAL_CHARS,
  type WebTourCheckStartMessage,
  type WebTourPictureBytes,
  type WebTourStartMessage,
} from '@/components/tours/web/extensionProtocol';
import type { PlaybackStep, PlaybackTour } from './progress';

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
  const steps = msg.tour.steps.map((s): PlaybackStep => {
    // A Message step is never sought: no address, clues, picture or conditions (X7).
    if (isStartMessageStep(s))
      return {
        id: s.id,
        title: s.label ?? '',
        text: s.text ?? '',
        urlPattern: '',
        frames: [],
        clues: {},
        action: 'observe',
        hasPicture: false,
        message: true,
      };
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
      ...(msg.tour.conditions?.[s.id]
        ? { conditions: msg.tour.conditions[s.id] }
        : {}),
      ...(hasPicture && msg.tour.markup?.[s.id]?.length
        ? { markup: msg.tour.markup[s.id] }
        : {}),
      ...(hasPicture && msg.tour.targets?.[s.id]
        ? { target: msg.tour.targets[s.id] }
        : {}),
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
