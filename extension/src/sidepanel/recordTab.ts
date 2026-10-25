import type { TourListReply } from '../tourList';

/** Record hides on a list that says not admin or a server no-access answer; a failed or pending list keeps it. */
export const isDefiniteNonAdmin = (r: TourListReply | null) =>
  r?.ok === true ? !r.list.admin : r?.why === 'no-access';
