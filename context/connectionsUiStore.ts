// Connect mode and step-editor UI state, kept outside DashboardContext so the canvas only re-renders on its own changes.
import { useSyncExternalStore } from 'react';
import type { WidgetConnection } from '@/types';

export interface ConnectModeState {
  boardId: string;
  /** Widget ids in click order; one id may repeat. */
  picks: string[];
  /** Set when adding widgets to an open editor draft. */
  draft?: EditorDraft;
}

export interface EditorDraft {
  boardId: string;
  /** Connections being edited or created; saved together. */
  connections: WidgetConnection[];
  /** Ids of existing Connections this draft replaces. */
  replaces: string[];
}

export interface ConnectionsUiState {
  connectMode: ConnectModeState | null;
  editor: EditorDraft | null;
  /** Connection whose lines are drawn while its badge is hovered. */
  highlightedId: string | null;
}

let state: ConnectionsUiState = {
  connectMode: null,
  editor: null,
  highlightedId: null,
};
const listeners = new Set<() => void>();

export const connectionsUi = {
  get: (): ConnectionsUiState => state,
  set: (patch: Partial<ConnectionsUiState>): void => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useConnectionsUi<T>(selector: (s: ConnectionsUiState) => T): T {
  return useSyncExternalStore(
    connectionsUi.subscribe,
    () => selector(state),
    () => selector(state)
  );
}

export const startConnectMode = (
  boardId: string,
  firstWidgetId: string | null,
  draft?: EditorDraft
): void =>
  connectionsUi.set({
    connectMode: {
      boardId,
      picks: firstWidgetId ? [firstWidgetId] : [],
      ...(draft && { draft }),
    },
    editor: null,
  });

export const pickInConnectMode = (widgetId: string): void => {
  const mode = state.connectMode;
  if (!mode) return;
  const last = mode.picks[mode.picks.length - 1];
  if (last === widgetId) {
    connectionsUi.set({
      connectMode: { ...mode, picks: mode.picks.slice(0, -1) },
    });
    return;
  }
  connectionsUi.set({
    connectMode: { ...mode, picks: [...mode.picks, widgetId] },
  });
};

export const cancelConnectMode = (): void => {
  const draft = state.connectMode?.draft;
  connectionsUi.set({ connectMode: null, editor: draft ?? null });
};
