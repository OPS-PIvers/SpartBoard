import type { TourListReply } from '../tourList';

/** Record hides only on an answered list that says not admin; a failed or pending list keeps it. */
export const isDefiniteNonAdmin = (r: TourListReply | null) =>
  r?.ok === true && !r.list.admin;
