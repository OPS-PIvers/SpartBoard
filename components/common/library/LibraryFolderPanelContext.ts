/**
 * LibraryFolderPanelContext — read-only handle for the folder-panel's effective
 * display mode, resolved by `LibraryShell` from widget width + user override.
 *
 * 'full' → labels + counts + new-folder button
 * 'rail' → icons only with tooltips
 * 'hidden' → panel is not rendered (caller surfaces a picker elsewhere)
 *
 * Consumers (e.g. `FolderSidebar`) subscribe to pick rail vs full rendering.
 */

import { createContext, useContext } from 'react';

export type FolderPanelMode = 'full' | 'rail' | 'hidden';

export interface LibraryFolderPanelContextValue {
  mode: FolderPanelMode;
}

export const LibraryFolderPanelContext =
  createContext<LibraryFolderPanelContextValue>({ mode: 'full' });

export const useFolderPanelMode = (): FolderPanelMode =>
  useContext(LibraryFolderPanelContext).mode;
