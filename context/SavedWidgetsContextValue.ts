import { createContext } from 'react';
import { SavedWidget } from '../types';

export interface SavedWidgetsContextValue {
  /** All of the signed-in user's saved widgets */
  savedWidgets: SavedWidget[];
  /** Whether the initial load is still in flight */
  loading: boolean;
  /** Create or update a saved widget */
  saveSavedWidget: (
    widget: Omit<SavedWidget, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ) => Promise<string>;
  /** Toggle whether a saved widget is pinned to the dock */
  setPinnedToDock: (id: string, pinned: boolean) => Promise<void>;
  /** Permanently delete a saved widget */
  deleteSavedWidget: (id: string) => Promise<void>;
}

export const SavedWidgetsContext =
  createContext<SavedWidgetsContextValue | null>(null);
