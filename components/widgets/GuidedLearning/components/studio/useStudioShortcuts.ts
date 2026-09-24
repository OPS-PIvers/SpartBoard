import { useEffect, useEffectEvent } from 'react';

/** One Studio shortcut. `mod` means Ctrl on Windows/ChromeOS and ⌘ on macOS. */
export interface StudioShortcut {
  id: string;
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Also fire while inline text editing is active (P1-6 rows only). */
  whileEditing?: boolean;
  /** Row applies only when this passes; otherwise the key keeps its normal meaning. */
  when?: (event: KeyboardEvent) => boolean;
  run: (event: KeyboardEvent) => void;
}

export interface StudioShortcutOptions {
  /** Inline callout editing is active; only `whileEditing` rows fire. */
  editing?: boolean;
  enabled?: boolean;
}

const TYPING_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING_SELECTOR) !== null;
}

export function matchesShortcut(
  event: KeyboardEvent,
  row: StudioShortcut
): boolean {
  const mod = event.ctrlKey || event.metaKey;
  return (
    event.key.toLowerCase() === row.key.toLowerCase() &&
    mod === Boolean(row.mod) &&
    event.shiftKey === Boolean(row.shift) &&
    event.altKey === Boolean(row.alt)
  );
}

/** A mod shortcut as the author's keyboard labels it: ⌘D on Apple devices, Ctrl+D elsewhere. */
export function modShortcutLabel(key: string): string {
  const apple =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.userAgent);
  return apple ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}

/** True while the page has a text selection, so Ctrl/⌘+C keeps its native meaning. */
export function hasTextSelection(): boolean {
  return (window.getSelection?.()?.toString() ?? '') !== '';
}

/** The one Studio keymap listener; handled keys stop propagating so dashboard shortcuts never fire. */
export function useStudioShortcuts(
  keymap: readonly StudioShortcut[],
  { editing = false, enabled = true }: StudioShortcutOptions = {}
): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    const typing = isTypingTarget(event.target);
    const row = keymap.find(
      (r) => matchesShortcut(event, r) && (!r.when || r.when(event))
    );
    if (!row) return;
    if (editing ? !row.whileEditing : typing) return;
    event.preventDefault();
    event.stopPropagation();
    row.run(event);
  });

  useEffect(() => {
    if (!enabled) return;
    // Capture phase so the Studio wins over dashboard-level listeners.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
