import { createContext } from 'react';

// DOM node beside LibraryShell's scroller that LibraryPreviewPane portals into; null outside a shell.
export const LibraryPreviewSlotContext = createContext<HTMLElement | null>(
  null
);
