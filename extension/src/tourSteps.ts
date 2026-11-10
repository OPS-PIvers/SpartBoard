// A published web tour read as steps for the side panel (docs/plans/shipped/TOURS_10X.md S4).
import type { TourMarkupShape, WebTourLocator } from '@/types';
import { stagePlacement } from '@/components/tours/web/pictureTarget';
import {
  hasCondition,
  type StepPictures,
  type StepsViewStep,
} from '@/components/tours/steps/stepsModel';
import type { ApiFailure } from './spartboardApi';

export interface PanelTourSteps {
  title: string;
  host: string;
  steps: StepsViewStep[];
  /** Each picture as a data URL, by step id. */
  pictures: StepPictures;
}

export type TourStepsReply =
  { ok: true; tour: PanelTourSteps } | { ok: false; why: ApiFailure };

const MAX_STEPS = 200;

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

const markupOf = (v: unknown): TourMarkupShape[] =>
  Array.isArray(v)
    ? (v.filter(
        (m) => isObj(m) && ['arrow', 'box', 'number'].includes(str(m.kind))
      ) as TourMarkupShape[])
    : [];

const MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const hostOf = (urlPattern: string): string => {
  try {
    return new URL(urlPattern.replace(/\*/g, 'x')).host.toLowerCase();
  } catch {
    return '';
  }
};

/** What `webTourLoadV1` returned, as steps the Steps view draws; null when it isn't a tour. */
export function panelStepsOf(raw: unknown): PanelTourSteps | null {
  if (!isObj(raw) || !Array.isArray(raw.steps)) return null;
  const pictures: Record<string, StepPictures[string]> = {};
  const steps: StepsViewStep[] = [];
  const loaded = isObj(raw.pictures) ? raw.pictures : {};
  const conditions: Record<string, { showWhen?: unknown } | undefined> = isObj(
    raw.conditions
  )
    ? (raw.conditions as Record<string, { showWhen?: unknown }>)
    : {};
  for (const s of raw.steps.slice(0, MAX_STEPS)) {
    if (!isObj(s) || typeof s.id !== 'string' || !isObj(s.web)) continue;
    const raw = loaded[s.id];
    const pic = isObj(raw) ? raw : null;
    const w = num(pic?.w);
    const h = num(pic?.h);
    const mime = str(pic?.mime);
    const data = str(pic?.data);
    const usable = !!pic && w > 0 && h > 0 && MIMES.has(mime) && !!data;
    const locator = isObj(s.web.locator)
      ? (s.web.locator as WebTourLocator)
      : undefined;
    const rawTarget = pic?.target;
    const target = isObj(rawTarget) ? rawTarget : null;
    const placed = usable
      ? stagePlacement(
          {
            w,
            h,
            cssW: num(pic?.cssW) || undefined,
            target: target
              ? {
                  x: num(target.x),
                  y: num(target.y),
                  w: num(target.w),
                  h: num(target.h),
                }
              : undefined,
          },
          locator
        )
      : null;
    const marked = markupOf(pic?.markup);
    steps.push({
      id: s.id,
      title: str(s.label),
      text: str(s.text),
      onlyIfAppears: hasCondition(conditions[s.id]?.showWhen),
      observe: s.web.action === 'observe',
      picture: placed
        ? {
            w,
            h,
            cssW: placed.cssW,
            target: placed.rect,
            ...(marked.length > 0 ? { markup: marked } : {}),
          }
        : null,
    });
    if (placed)
      pictures[s.id] = { status: 'ready', src: `data:${mime};base64,${data}` };
  }
  if (steps.length === 0) return null;
  return {
    title: str(raw.title),
    host: hostOf(
      str((raw.steps[0] as { web?: { urlPattern?: unknown } })?.web?.urlPattern)
    ),
    steps,
    pictures,
  };
}
