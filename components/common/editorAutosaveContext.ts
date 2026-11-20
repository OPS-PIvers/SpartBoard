import { createContext, useContext } from 'react';
import type { AutosaveStatus } from '@/hooks/useAutosave';

/** The open editor's autosave state, for dialogs opened from inside it. */
export interface EditorAutosaveState {
  status: AutosaveStatus;
  flush: () => Promise<unknown> | void;
}

export const EditorAutosaveContext = createContext<EditorAutosaveState | null>(
  null
);

export const useEditorAutosave = (): EditorAutosaveState | null =>
  useContext(EditorAutosaveContext);
