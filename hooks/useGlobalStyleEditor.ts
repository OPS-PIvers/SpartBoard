/**
 * useGlobalStyleEditor — shared editing logic for a board's GlobalStyle.
 *
 * Extracted from the former in-sidebar StylePanel so the Settings modal's
 * Appearance and Dock sections can share one editing surface: a single
 * read-only toast latch, one pair of debounced transparency handlers, and one
 * "adjust state while rendering" reset for the in-flight slider values.
 *
 * Instantiate ONCE (in SettingsModal) and pass the returned API to both
 * sections — calling the hook per-section would duplicate the latch (double
 * toast) and the debounce timers.
 *
 * Scope note: GlobalStyle is per-board (writes to the active dashboard via
 * setGlobalStyle), so every control driven by this hook only affects the
 * current board.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalStyle, DEFAULT_GLOBAL_STYLE } from '@/types';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useDashboard } from '@/context/useDashboard';

export interface TransparencyControl {
  /** Value to render — prefers the in-flight drag value over the committed one. */
  value: number;
  /** Feed slider onChange here; updates the thumb immediately and commits debounced. */
  onChange: (value: number) => void;
}

export interface GlobalStyleEditor {
  currentStyle: GlobalStyle;
  isReadOnly: boolean;
  /** Commit a single field immediately (font, corners, colors, toggles). */
  setField: <K extends keyof GlobalStyle>(
    field: K,
    value: GlobalStyle[K]
  ) => void;
  /** Commit an arbitrary partial immediately (e.g. "reset all colors"). */
  commit: (next: Partial<GlobalStyle>) => void;
  windowTransparency: TransparencyControl;
  dockTransparency: TransparencyControl;
}

export function useGlobalStyleEditor(): GlobalStyleEditor {
  const { t } = useTranslation();
  const { activeDashboard, setGlobalStyle, isActiveBoardReadOnly, addToast } =
    useDashboard();

  const currentStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;

  // One-time read-only notice per board. Reset the latch when the active board
  // changes so a different read-only board re-notifies. Adjusting state during
  // render avoids the extra round-trip an effect would cost.
  const [readOnlyToastShown, setReadOnlyToastShown] = useState(false);
  const [prevBoardId, setPrevBoardId] = useState(activeDashboard?.id);
  if (activeDashboard?.id !== prevBoardId) {
    setPrevBoardId(activeDashboard?.id);
    setReadOnlyToastShown(false);
  }

  const commit = useCallback(
    (next: Partial<GlobalStyle>) => {
      if (isActiveBoardReadOnly) {
        if (!readOnlyToastShown) {
          addToast(
            t('style.readOnlyNotice', {
              defaultValue:
                'This board is read-only. Style changes are not saved.',
            }),
            'info'
          );
          setReadOnlyToastShown(true);
        }
        return;
      }
      setGlobalStyle(next);
    },
    [setGlobalStyle, isActiveBoardReadOnly, readOnlyToastShown, addToast, t]
  );

  const setField = useCallback(
    <K extends keyof GlobalStyle>(field: K, value: GlobalStyle[K]) =>
      commit({ [field]: value } as Partial<GlobalStyle>),
    [commit]
  );

  // Each slider gets its own debounced commit so rapid cross-slider drags don't
  // share a timer and overwrite each other's pending values.
  const commitWindowTransparency = useDebouncedCallback(
    (value: number) => commit({ windowTransparency: value }),
    200
  );
  const commitDockTransparency = useDebouncedCallback(
    (value: number) => commit({ dockTransparency: value }),
    200
  );

  // In-flight values so the thumb follows the cursor before the debounce fires.
  const [pendingWindow, setPendingWindow] = useState<number | null>(null);
  const [pendingDock, setPendingDock] = useState<number | null>(null);

  // Clear each pending value once the committed state catches up.
  const [prevCommittedWindow, setPrevCommittedWindow] = useState(
    currentStyle.windowTransparency
  );
  if (prevCommittedWindow !== currentStyle.windowTransparency) {
    setPrevCommittedWindow(currentStyle.windowTransparency);
    if (pendingWindow === currentStyle.windowTransparency) {
      setPendingWindow(null);
    }
  }

  const [prevCommittedDock, setPrevCommittedDock] = useState(
    currentStyle.dockTransparency
  );
  if (prevCommittedDock !== currentStyle.dockTransparency) {
    setPrevCommittedDock(currentStyle.dockTransparency);
    if (pendingDock === currentStyle.dockTransparency) {
      setPendingDock(null);
    }
  }

  return {
    currentStyle,
    isReadOnly: isActiveBoardReadOnly,
    setField,
    commit,
    windowTransparency: {
      value: pendingWindow ?? currentStyle.windowTransparency,
      onChange: (value: number) => {
        setPendingWindow(value);
        commitWindowTransparency(value);
      },
    },
    dockTransparency: {
      value: pendingDock ?? currentStyle.dockTransparency,
      onChange: (value: number) => {
        setPendingDock(value);
        commitDockTransparency(value);
      },
    },
  };
}
