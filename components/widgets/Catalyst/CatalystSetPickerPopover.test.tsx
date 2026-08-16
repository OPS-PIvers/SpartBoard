import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CatalystSetPickerPopover } from './CatalystSetPickerPopover';
import { useCatalystSets } from '@/hooks/useCatalystSets';
import { DEFAULT_GLOBAL_STYLE } from '@/types';

vi.mock('@/hooks/useCatalystSets', () => ({
  useCatalystSets: vi.fn(),
}));

afterEach(cleanup);

const anchorRect = {
  left: 10,
  right: 50,
  top: 10,
  bottom: 40,
  width: 40,
  height: 30,
} as DOMRect;

describe('CatalystSetPickerPopover — Escape does not leak to window-level handlers', () => {
  it('closes on Escape and stops propagation before it reaches window listeners', () => {
    (useCatalystSets as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      sets: [],
      loading: false,
    });
    const onClose = vi.fn();
    render(
      <CatalystSetPickerPopover
        anchorRect={anchorRect}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        onSelectRoutine={vi.fn()}
        onClose={onClose}
      />
    );

    expect(screen.getByText('No sets configured.')).toBeInTheDocument();

    const windowKeydownSpy = vi.fn();
    window.addEventListener('keydown', windowKeydownSpy);

    try {
      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
      expect(onClose).toHaveBeenCalled();
      // Without stopPropagation this would reach DashboardView's global window-level handler.
      expect(windowKeydownSpy).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeydownSpy);
    }
  });
});
