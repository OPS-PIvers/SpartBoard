import { createContext, useContext } from 'react';

// Width (px) of LibraryShell's content column, so cards can drop labels on narrow rows; null outside a shell.
export const LibraryRowWidthContext = createContext<number | null>(null);

export const ROW_COMPACT_BELOW_PX = 360;
export const ROW_TIGHT_BELOW_PX = 300;

/** True for list rows too narrow to keep the drag-grip slot; folder rows and item rows share it so icons line up. */
export const useCompactListRow = (isList: boolean): boolean => {
  const rowWidth = useContext(LibraryRowWidthContext);
  return isList && rowWidth != null && rowWidth < ROW_COMPACT_BELOW_PX;
};
