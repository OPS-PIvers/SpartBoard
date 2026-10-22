// Web tours (docs/plans/CHROME_EXTENSION.md T13) play through the Chrome extension; these tools don't handle them yet.
export const WEB_TOUR_REFUSAL =
  'That set is a web tour, which plays on other websites. The live tour tools only work on SpartBoard tours.';

export const isWebTour = (set: unknown): boolean =>
  !!set &&
  typeof set === 'object' &&
  (set as { surface?: unknown }).surface === 'web';

/** A published snapshot is a web tour by its top-level surface or its set's. */
export const isWebTourSnapshot = (data: unknown): boolean =>
  isWebTour(data) || isWebTour((data as { set?: unknown } | undefined)?.set);
