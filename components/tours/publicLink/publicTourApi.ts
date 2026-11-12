import type { TourMarkupShape } from '@/types';
import type {
  StepPictures,
  StepsViewStep,
} from '@/components/tours/steps/stepsModel';
import { PUBLIC_TOUR_API, type PublicTourKind } from './publicLinkModel';

/** A public tour as the page draws it. */
export interface PublicTourView {
  kind: PublicTourKind;
  title: string;
  steps: StepsViewStep[];
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null;
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const unitRect = (v: unknown) => {
  const r = rec(v);
  const [x, y, w, h] = [num(r?.x), num(r?.y), num(r?.w), num(r?.h)];
  return x !== null && y !== null && w !== null && h !== null
    ? { x, y, w, h }
    : null;
};

const markupOf = (v: unknown): TourMarkupShape[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const shapes = v.flatMap((raw): TourMarkupShape[] => {
    const s = rec(raw);
    if (!s || typeof s.id !== 'string') return [];
    const n = (k: string) => num(s[k]) ?? 0;
    if (s.kind === 'arrow')
      return [
        {
          id: s.id,
          kind: 'arrow',
          x1: n('x1'),
          y1: n('y1'),
          x2: n('x2'),
          y2: n('y2'),
        },
      ];
    if (s.kind === 'box')
      return [
        { id: s.id, kind: 'box', x: n('x'), y: n('y'), w: n('w'), h: n('h') },
      ];
    if (s.kind === 'number')
      return [{ id: s.id, kind: 'number', x: n('x'), y: n('y'), n: n('n') }];
    return [];
  });
  return shapes.length ? shapes : undefined;
};

/** The function's answer as Steps view steps; null when it isn't one. */
export function parsePublicTour(body: unknown): PublicTourView | null {
  const r = rec(body);
  if (!r || (r.kind !== 'web' && r.kind !== 'live') || !Array.isArray(r.steps))
    return null;
  const steps = r.steps.flatMap((raw): StepsViewStep[] => {
    const s = rec(raw);
    if (!s || typeof s.id !== 'string') return [];
    const p = rec(s.picture);
    const markup = markupOf(p?.markup);
    return [
      {
        id: s.id,
        title: typeof s.title === 'string' ? s.title : '',
        text: typeof s.text === 'string' ? s.text : '',
        onlyIfAppears: s.onlyIfAppears === true,
        observe: s.observe === true,
        ...(s.message === true ? { message: true as const } : {}),
        ...(typeof s.continueOn === 'string' && s.continueOn
          ? { continueOn: s.continueOn }
          : {}),
        picture: p
          ? {
              w: num(p.w) ?? 0,
              h: num(p.h) ?? 0,
              cssW: num(p.cssW) ?? 0,
              target: unitRect(p.target),
              ...(markup ? { markup } : {}),
            }
          : null,
      },
    ];
  });
  return {
    kind: r.kind,
    title: typeof r.title === 'string' ? r.title : '',
    steps,
  };
}

/** Each picture is read straight from the function, so it is never a lasting address. */
export const publicPictureSrc = (token: string, stepId: string): string =>
  `${PUBLIC_TOUR_API}?t=${token}&p=${encodeURIComponent(stepId)}`;

export const publicPictures = (
  token: string,
  steps: readonly StepsViewStep[]
): StepPictures =>
  Object.fromEntries(
    steps.flatMap((s) =>
      s.picture
        ? [
            [
              s.id,
              { status: 'ready' as const, src: publicPictureSrc(token, s.id) },
            ],
          ]
        : []
    )
  );

/** The public tour behind a token, or null for any refusal. */
export async function fetchPublicTour(
  token: string,
  signal?: AbortSignal
): Promise<PublicTourView | null> {
  const res = await fetch(`${PUBLIC_TOUR_API}?t=${token}`, {
    signal,
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (
    !res.ok ||
    !(res.headers.get('content-type') ?? '').includes('application/json')
  )
    return null;
  return parsePublicTour(await res.json());
}
