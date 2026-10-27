// Set in a document's content-script world once the overlay script runs there, so it is never run twice.
export const OVERLAY_LOADED = Symbol.for('spartboard.overlay.loaded');

export const overlayLoaded = () =>
  !!(globalThis as typeof globalThis & { [OVERLAY_LOADED]?: true })[
    OVERLAY_LOADED
  ];
