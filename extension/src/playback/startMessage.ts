import type {
  WebTourPictureBytes,
  WebTourStartMessage,
} from '@/components/tours/web/extensionProtocol';
import type { PlaybackTour } from './progress';

export interface ParsedStart {
  tour: PlaybackTour;
  stepIndex: number;
  version: number;
  pictures: Record<string, WebTourPictureBytes>;
}

/** Room left in the 10 MB session store for pictures, in base64 characters. */
const MAX_PICTURE_TOTAL = 8 * 1024 * 1024;

/** Turns a checked `web-tour/start` message into what playback keeps. */
export function toPlayback(msg: WebTourStartMessage): ParsedStart {
  const pictures: Record<string, WebTourPictureBytes> = {};
  let pictureChars = 0;
  const steps = msg.tour.steps.map((s) => {
    const { frames = [], ...clues } = s.web.locator;
    let hasPicture = false;
    // Past the store's room a step simply has no picture fallback.
    if (s.picture && pictureChars + s.picture.data.length <= MAX_PICTURE_TOTAL) {
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
  };
}
