// Regression: RowMenu/CellPopover/LocalModal Escape handlers must stopPropagation() so it doesn't leak to DashboardView's global handler.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  RowMenu,
  CellPopover,
  LocalModal,
} from '@/components/admin/Organization/components/primitives';

afterEach(cleanup);

function withWindowKeydownSpy(run: () => void) {
  const spy = vi.fn();
  window.addEventListener('keydown', spy);
  try {
    run();
    return spy;
  } finally {
    window.removeEventListener('keydown', spy);
  }
}

describe('Organization primitives — Escape does not leak to window-level handlers', () => {
  it('RowMenu closes on Escape and stops propagation', () => {
    render(<RowMenu items={[{ label: 'Delete', onClick: vi.fn() }]} />);
    fireEvent.click(screen.getByRole('button', { name: /row actions/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    const spy = withWindowKeydownSpy(() => {
      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('CellPopover closes on Escape and stops propagation', () => {
    const onClose = vi.fn();
    const AnchorHarness: React.FC = () => {
      const anchorRef = React.useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={anchorRef}>anchor</button>
          <CellPopover open onClose={onClose} anchorRef={anchorRef}>
            <div>popover content</div>
          </CellPopover>
        </>
      );
    };
    render(<AnchorHarness />);
    expect(screen.getByText('popover content')).toBeInTheDocument();

    const spy = withWindowKeydownSpy(() => {
      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
    });

    expect(onClose).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('LocalModal closes on Escape and stops propagation', () => {
    const onClose = vi.fn();
    render(
      <LocalModal isOpen onClose={onClose} title="Test modal">
        <div>modal content</div>
      </LocalModal>
    );
    expect(
      screen.getByRole('dialog', { name: /test modal/i })
    ).toBeInTheDocument();

    const spy = withWindowKeydownSpy(() => {
      fireEvent.keyDown(document, { key: 'Escape', bubbles: true });
    });

    expect(onClose).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });
});
