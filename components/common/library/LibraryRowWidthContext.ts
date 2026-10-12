import { createContext } from 'react';

// Width (px) of LibraryShell's content column, so cards can drop labels on narrow rows; null outside a shell.
export const LibraryRowWidthContext = createContext<number | null>(null);

export const ROW_COMPACT_BELOW_PX = 360;
export const ROW_TIGHT_BELOW_PX = 300;
