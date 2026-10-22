import type { RedactRect } from '@/components/widgets/GuidedLearning/utils/redactImage';
import { isObj, isStr } from '@/components/tours/web/recorderProtocol';
import type { RawCapture } from '../recorder/messages';
import { blobToDataUrl } from './pictures';

/** A captured click in the panel: its cropped picture, blur boxes and tip, until it is sent. */
export interface PanelStep {
  capture: Omit<RawCapture, 'screenshot'>;
  picture: Blob | null;
  blur: RedactRect[];
  tip: string;
  pending: boolean;
}

export interface Unsent {
  steps: PanelStep[];
  fix: PanelStep | null;
}

export const UNSENT_KEY = 'recorder.unsent';

interface StoredStep {
  capture: Omit<RawCapture, 'screenshot'>;
  picture: string | null;
  blur: RedactRect[];
  tip: string;
}

const toStored = async (s: PanelStep): Promise<StoredStep> => ({
  capture: s.capture,
  picture: s.picture ? await blobToDataUrl(s.picture) : null,
  blur: s.blur,
  tip: s.tip,
});

const fromStored = async (v: unknown): Promise<PanelStep | null> => {
  if (!isObj(v) || !isObj(v.capture) || !isStr(v.capture.id)) return null;
  const picture =
    isStr(v.picture, Infinity) && v.picture.startsWith('data:image/')
      ? await (await fetch(v.picture)).blob()
      : null;
  return {
    capture: v.capture as unknown as PanelStep['capture'],
    picture,
    blur: Array.isArray(v.blur) ? (v.blur as RedactRect[]) : [],
    tip: isStr(v.tip) ? v.tip : '',
    pending: false,
  };
};

/** The steps left unsent when the panel last closed; empty when there are none or they can't be read. */
export async function loadUnsent(): Promise<Unsent> {
  try {
    const got = (await chrome.storage.local.get(UNSENT_KEY))[UNSENT_KEY];
    if (!isObj(got)) return { steps: [], fix: null };
    const steps = Array.isArray(got.steps)
      ? (await Promise.all(got.steps.map(fromStored))).filter(
          (s): s is PanelStep => s !== null
        )
      : [];
    return { steps, fix: await fromStored(got.fix) };
  } catch {
    return { steps: [], fix: null };
  }
}

// Saves run one at a time, so an older save never lands after a newer one.
let saving: Promise<void> = Promise.resolve();

/** Saves the unsent steps; a step whose picture is still decoding waits for the next save. */
export function saveUnsent(unsent: Unsent): Promise<void> {
  saving = saving.then(() => write(unsent));
  return saving;
}

async function write({ steps, fix }: Unsent): Promise<void> {
  try {
    const ready = steps.filter((s) => !s.pending);
    if (ready.length === 0 && (!fix || fix.pending)) {
      await chrome.storage.local.remove(UNSENT_KEY);
      return;
    }
    await chrome.storage.local.set({
      [UNSENT_KEY]: {
        steps: await Promise.all(ready.map(toStored)),
        fix: fix && !fix.pending ? await toStored(fix) : null,
      },
    });
  } catch {
    // Full or unavailable storage: the steps stay in the open panel.
  }
}
