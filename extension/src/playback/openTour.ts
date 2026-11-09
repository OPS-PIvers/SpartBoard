// `web-tour/open` (WEB_TOURS_HELP_PANEL.md H4): the tour webTourLoadV1 returns, checked like a page's handoff.
import {
  parseMarkupShapes,
  parseWebTourCondition,
  parseWebTourStartTour,
  type WebTourPictureBytes,
} from '@/components/tours/web/extensionProtocol';
import {
  buildStartTour,
  startUrlOf,
  type HandoffStep,
} from '@/components/tours/web/handoff';
import type { WebTourLocator } from '@/types';
import { toPlayback, type ParsedStart } from './startMessage';

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const PICTURE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

function pictureOf(v: unknown): WebTourPictureBytes | null {
  if (!isObj(v)) return null;
  const mime = PICTURE_MIMES.find((m) => m === v.mime);
  const { data, w, h } = v;
  if (!mime || typeof data !== 'string') return null;
  if (typeof w !== 'number' || typeof h !== 'number') return null;
  return { mime, data, w, h };
}

/** The step with the conditions the server sent beside it (E6); anything malformed is left off. */
function withConditions(step: HandoffStep, raw: unknown): HandoffStep {
  if (!isObj(raw)) return step;
  const showWhen = parseWebTourCondition(raw.showWhen);
  const doneWhen = parseWebTourCondition(raw.doneWhen);
  if (!showWhen && !doneWhen) return step;
  return {
    ...step,
    web: {
      ...step.web,
      ...(showWhen ? { showWhen } : {}),
      ...(doneWhen ? { doneWhen } : {}),
    },
  };
}

/** The step with the picture markup the server sent beside it; malformed markup is left off. */
function withMarkup(step: HandoffStep, raw: unknown): HandoffStep {
  const markup = raw === undefined ? null : parseMarkupShapes(raw);
  return markup?.length
    ? { ...step, web: { ...step.web, picture: { markup } } }
    : step;
}

/** Each step's own clues by id, so a run's suggested fixes keep only the site's clues (C15). */
export type StepLocators = Record<string, WebTourLocator>;

/** The tour to play from step 1, or null when the reply isn't a tour the extension would accept from a page. */
export function openedTour(
  setId: string,
  raw: unknown
): { start: ParsedStart; locators: StepLocators } | null {
  if (!isObj(raw) || !Array.isArray(raw.steps)) return null;
  const conditions = isObj(raw.conditions) ? raw.conditions : {};
  const markup = isObj(raw.markup) ? raw.markup : {};
  const steps = raw.steps
    .filter(
      (s): s is HandoffStep =>
        isObj(s) &&
        typeof s.id === 'string' &&
        isObj(s.web) &&
        typeof s.web.urlPattern === 'string' &&
        typeof s.web.action === 'string' &&
        isObj(s.web.locator)
    )
    .map((s) => withMarkup(withConditions(s, conditions[s.id]), markup[s.id]));
  const pictures = new Map<string, WebTourPictureBytes>();
  if (isObj(raw.pictures)) {
    for (const [id, v] of Object.entries(raw.pictures)) {
      const pic = pictureOf(v);
      if (pic) pictures.set(id, pic);
    }
  }
  const startUrl = startUrlOf(steps);
  const version = raw.version;
  if (!startUrl || !Number.isInteger(version)) return null;
  let tour;
  try {
    tour = parseWebTourStartTour(
      buildStartTour(
        setId,
        version as number,
        typeof raw.title === 'string' ? raw.title : '',
        steps,
        pictures,
        true,
        true
      )
    );
  } catch {
    return null;
  }
  if (!tour || tour.steps.length === 0) return null;
  const locators: StepLocators = {};
  for (const s of tour.steps) locators[s.id] = s.web.locator;
  return {
    start: toPlayback({ type: 'web-tour/start', startUrl, stepIndex: 0, tour }),
    locators,
  };
}
