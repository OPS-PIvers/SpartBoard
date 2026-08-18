// Escape on a portalled RowMenu/CellPopover/LocalModal must not also close the whole Admin Settings panel underneath it.
import React, { useRef } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  RowMenu,
  CellPopover,
  LocalModal,
} from '@/components/admin/Organization/components/primitives';

afterEach(cleanup);

// Mirrors AdminSettings.tsx's own Escape handler: a plain bubble-phase
// `document` listener, registered before the panel under test ever opens
// its popover/menu/modal — exactly like AdminSettings mounts before the
// user can click into an Organization view.
function installParentEscapeHandler() {
  const onParentClose = vi.fn();
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onParentClose();
  };
  document.addEventListener('keydown', handler);
  return {
    onParentClose,
    uninstall: () => document.removeEventListener('keydown', handler),
  };
}

function pressEscape() {
  fireEvent.keyDown(document, { key: 'Escape' });
}

describe('Organization primitives — Escape does not leak to an outer document-level handler', () => {
  it('RowMenu: closes itself without triggering the outer panel-close handler', () => {
    const { onParentClose, uninstall } = installParentEscapeHandler();
    try {
      render(<RowMenu items={[{ label: 'Edit', onClick: vi.fn() }]} />);
      fireEvent.click(screen.getByRole('button', { name: /row actions/i }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      pressEscape();

      expect(onParentClose).not.toHaveBeenCalled();
      // RowMenu has no onClose callback (it closes via internal setOpen
      // state), so the DOM is the only observable proof the capture handler
      // actually closed it rather than just swallowing the keydown.
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    } finally {
      uninstall();
    }
  });

  it('CellPopover: closes itself without triggering the outer panel-close handler', () => {
    const { onParentClose, uninstall } = installParentEscapeHandler();
    try {
      const onClose = vi.fn();
      const Harness: React.FC = () => {
        const anchorRef = useRef<HTMLButtonElement>(null);
        return (
          <>
            <button ref={anchorRef}>anchor</button>
            <CellPopover open onClose={onClose} anchorRef={anchorRef}>
              <div>popover content</div>
            </CellPopover>
          </>
        );
      };
      render(<Harness />);
      expect(screen.getByText('popover content')).toBeInTheDocument();

      pressEscape();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onParentClose).not.toHaveBeenCalled();
    } finally {
      uninstall();
    }
  });

  it('LocalModal: closes itself without triggering the outer panel-close handler', () => {
    const { onParentClose, uninstall } = installParentEscapeHandler();
    try {
      const onClose = vi.fn();
      render(
        <LocalModal isOpen onClose={onClose} title="New building">
          <div>modal content</div>
        </LocalModal>
      );
      expect(screen.getByText('modal content')).toBeInTheDocument();

      pressEscape();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onParentClose).not.toHaveBeenCalled();
    } finally {
      uninstall();
    }
  });
});
