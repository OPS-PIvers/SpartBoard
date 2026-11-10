// The SpartBoard site this listing talks to, for links the side panel opens or copies.
declare const __SPART_ORIGINS__: readonly string[] | undefined;

export const appOrigin = (): string =>
  (typeof __SPART_ORIGINS__ !== 'undefined' && __SPART_ORIGINS__[0]) ||
  'https://spartboard.web.app';

/** A public tour page, as the app's own `publicTourUrl` builds it. */
export const publicTourLink = (token: string): string =>
  `${appOrigin()}/tour-steps/${token}`;

/** The board with a web tour open in its editor (`WebTourEditorHost`). */
export const editTourLink = (setId: string): string => {
  const url = new URL(appOrigin());
  url.searchParams.set('edit-web-tour', setId);
  return url.toString();
};
