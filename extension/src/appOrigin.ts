// The SpartBoard site this listing talks to, for links the side panel opens or copies.
declare const __SPART_ORIGINS__: readonly string[] | undefined;

export const appOrigin = (): string =>
  (typeof __SPART_ORIGINS__ !== 'undefined' && __SPART_ORIGINS__[0]) ||
  'https://spartboard.web.app';

/** A public tour page, as the app's own `publicTourUrl` builds it. */
export const publicTourLink = (token: string): string =>
  `${appOrigin()}/tour-steps/${token}`;

/** The Web tours page, with `setId` open in its editor when given (`EDIT_WEB_TOUR_PARAM`). */
export const webToursUrl = (setId?: string, origin = appOrigin()): string => {
  const url = new URL('/web-tours', origin);
  if (setId) url.searchParams.set('edit-web-tour', setId);
  return url.toString();
};
