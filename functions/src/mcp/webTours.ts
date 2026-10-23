// Web tours (docs/plans/CHROME_EXTENSION.md T13) play through the Chrome extension; only webTourTools.ts reads or edits them.
export const WEB_TOUR_REFUSAL =
  'That set is a web tour, which plays on other websites. The live tour tools only work on SpartBoard tours; use get_web_tour and update_web_tour_text for its words.';

export const isWebTour = (set: unknown): boolean =>
  !!set &&
  typeof set === 'object' &&
  (set as { surface?: unknown }).surface === 'web';

/** A published snapshot is a web tour by its top-level surface or its set's. */
export const isWebTourSnapshot = (data: unknown): boolean =>
  isWebTour(data) || isWebTour((data as { set?: unknown } | undefined)?.set);
