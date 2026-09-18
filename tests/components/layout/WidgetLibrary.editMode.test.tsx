/**
 * Regression tests for two Widget Library edit-mode problems:
 *
 * 1. Cards were drag-to-reorder at all times, so a touch drag meant to scroll
 *    the library grid started a sort instead. Reorder is now an edit-mode
 *    gesture; outside edit mode the cards carry no drag listeners.
 * 2. Once edit mode was on there was no way out that kept the library open —
 *    the only exits closed it. A "Done" button now leaves edit mode in place.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/context/useToolVisibility', () => ({
  useToolVisibility: () => ({
    resetDockToDefaults: vi.fn(),
    hiddenTools: [],
    toggleToolHidden: vi.fn(),
  }),
}));

import { WidgetLibrary } from '@/components/layout/dock/WidgetLibrary';
import { DEFAULT_GLOBAL_STYLE } from '@/types';

function renderLibrary(
  props: Partial<React.ComponentProps<typeof WidgetLibrary>> = {}
) {
  return render(
    <WidgetLibrary
      onToggle={vi.fn()}
      visibleTools={[]}
      canAccess={() => true}
      onClose={vi.fn()}
      globalStyle={DEFAULT_GLOBAL_STYLE}
      libraryOrder={[]}
      onReorderLibrary={vi.fn()}
      {...props}
    />
  );
}

/** dnd-kit only tags an element as sortable when its drag listeners are live. */
function sortableCardCount() {
  return document.querySelectorAll('[aria-roledescription="sortable"]').length;
}

afterEach(cleanup);

describe('WidgetLibrary — drag to reorder is edit-mode only', () => {
  it('attaches no drag listeners to cards outside edit mode', () => {
    renderLibrary({ isEditMode: false });

    expect(sortableCardCount()).toBe(0);
  });

  it('attaches drag listeners to cards in edit mode', () => {
    renderLibrary({ isEditMode: true });

    expect(sortableCardCount()).toBeGreaterThan(0);
  });

  it('still blocks dragging in edit mode while a search filters the grid', () => {
    renderLibrary({ isEditMode: true });

    fireEvent.change(screen.getByLabelText('Search widgets'), {
      target: { value: 'timer' },
    });

    expect(sortableCardCount()).toBe(0);
  });

  it('tells the user reordering lives behind Edit when browsing', () => {
    renderLibrary({ isEditMode: false, onEnterEditMode: vi.fn() });

    expect(
      screen.getByText('Tap to add to board • Edit to reorder')
    ).toBeInTheDocument();
  });
});

describe('WidgetLibrary — Done exits edit mode without closing', () => {
  it('shows no Done button outside edit mode', () => {
    renderLibrary({ isEditMode: false, onExitEditMode: vi.fn() });

    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('calls onExitEditMode, not onClose, when Done is pressed', () => {
    const onExitEditMode = vi.fn();
    const onClose = vi.fn();
    renderLibrary({ isEditMode: true, onExitEditMode, onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onExitEditMode).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
