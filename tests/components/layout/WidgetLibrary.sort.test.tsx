import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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
import { TOOLS } from '@/config/tools';

const CUSTOM_ORDER = ['traffic', 'time-tool', 'clock'] as const;

function renderLibrary() {
  return render(
    <WidgetLibrary
      onToggle={vi.fn()}
      visibleTools={[]}
      canAccess={(type) => (CUSTOM_ORDER as readonly string[]).includes(type)}
      onClose={vi.fn()}
      globalStyle={DEFAULT_GLOBAL_STYLE}
      libraryOrder={[...CUSTOM_ORDER]}
      onReorderLibrary={vi.fn()}
    />
  );
}

function cardLabels() {
  return Array.from(
    document.querySelectorAll('[data-tour="library.item"] span')
  ).map((el) => el.textContent ?? '');
}

const labelOf = (type: string) => TOOLS.find((t) => t.type === type)?.label;

beforeEach(() => localStorage.removeItem('spartboard_library_sort'));
afterEach(cleanup);

describe('WidgetLibrary sort', () => {
  it('lists widgets A–Z by default', () => {
    renderLibrary();

    const labels = cardLabels();
    expect(labels).toHaveLength(3);
    expect(labels).toEqual(
      [...labels].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      )
    );
  });

  it('shows the saved custom order under My order and remembers it', () => {
    renderLibrary();

    fireEvent.change(screen.getByLabelText('Sort widgets'), {
      target: { value: 'custom' },
    });

    expect(cardLabels()).toEqual(CUSTOM_ORDER.map(labelOf));
    expect(localStorage.getItem('spartboard_library_sort')).toBe('custom');

    cleanup();
    renderLibrary();
    expect(cardLabels()).toEqual(CUSTOM_ORDER.map(labelOf));
  });
});
