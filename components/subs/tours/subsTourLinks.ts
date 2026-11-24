// Links from the teacher app into the /subs portal's tour editor and recorder.
export const SUBS_EDIT_TOUR_PARAM = 'edit-tour';
export const SUBS_RECORD_TOUR_PARAM = 'record-tour';

/** /subs with the editor opening on this tour. */
export const subsEditTourUrl = (setId: string): string =>
  `/subs?${SUBS_EDIT_TOUR_PARAM}=${encodeURIComponent(setId)}`;

/** /subs with a new recording starting. */
export const subsRecordTourUrl = (): string =>
  `/subs?${SUBS_RECORD_TOUR_PARAM}=1`;

export type SubsTourIntent =
  { kind: 'edit'; setId: string } | { kind: 'record' } | null;

/** What a /subs address asks the tour layer to open. */
export function parseSubsTourIntent(search: string): SubsTourIntent {
  const params = new URLSearchParams(search);
  const setId = params.get(SUBS_EDIT_TOUR_PARAM);
  if (setId) return { kind: 'edit', setId };
  if (params.get(SUBS_RECORD_TOUR_PARAM)) return { kind: 'record' };
  return null;
}

/** The same address without the tour parameters, so a refresh doesn't reopen them. */
export function stripSubsTourParams(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(SUBS_EDIT_TOUR_PARAM);
  url.searchParams.delete(SUBS_RECORD_TOUR_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
