import { describe, it, expect } from 'vitest';
import { HELP_SHORTCUTS, HELP_GESTURES } from './helpShortcuts';

describe('helpShortcuts data', () => {
  it('has unique shortcut ids', () => {
    const ids = HELP_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique gesture ids', () => {
    const ids = HELP_GESTURES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every shortcut labelKey starts with helpCenter.', () => {
    for (const s of HELP_SHORTCUTS) {
      expect(s.labelKey.startsWith('helpCenter.')).toBe(true);
    }
  });

  it('every gesture labelKey and descriptionKey starts with helpCenter.', () => {
    for (const g of HELP_GESTURES) {
      expect(g.labelKey.startsWith('helpCenter.')).toBe(true);
      expect(g.descriptionKey.startsWith('helpCenter.')).toBe(true);
    }
  });

  it('includes the Ctrl/⌘+/ open-help binding at DashboardView.tsx:1068', () => {
    const openHelp = HELP_SHORTCUTS.find((s) => s.id === 'open-help');
    expect(openHelp?.keys).toEqual(['Ctrl/⌘', '/']);
  });

  it('includes all four Alt chords documented in DraggableWindow', () => {
    const altChords = ['widget-settings', 'annotate', 'maximize', 'pin-widget'];
    for (const id of altChords) {
      const shortcut = HELP_SHORTCUTS.find((s) => s.id === id);
      expect(shortcut?.keys[0]).toBe('Alt');
    }
  });

  it('clear-board includes both Delete and Backspace', () => {
    const clearBoard = HELP_SHORTCUTS.find((s) => s.id === 'clear-board');
    expect(clearBoard?.keys).toEqual(['Shift/Alt', 'Delete/Backspace']);
  });

  it('includes the annotation delete-selected and nudge shortcuts', () => {
    const del = HELP_SHORTCUTS.find(
      (s) => s.id === 'annotation-delete-selected'
    );
    expect(del?.keys).toEqual(['Delete/Backspace']);
    const nudge = HELP_SHORTCUTS.find((s) => s.id === 'annotation-nudge');
    expect(nudge?.keys).toEqual(['Arrow keys']);
  });

  it('does not document background two-finger swipe-down (SWIPE_MINIMIZE_ENABLED is false)', () => {
    const bg = HELP_GESTURES.find((g) => g.id === 'two-finger-swipe-down');
    expect(bg).toBeUndefined();
  });

  it('documents widget two-finger swipe-down as restore-only', () => {
    const restore = HELP_GESTURES.find(
      (g) => g.id === 'widget-two-finger-swipe-down-restore'
    );
    expect(restore).toBeDefined();
  });
});
