import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from '@testing-library/react';
import { Modal } from '@/components/common/Modal';

describe('Modal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Modal',
    children: <div>Modal Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Run RTL cleanup first so unmounting the Modal component decrements
    // openModalCount. Then restore body overflow. This ordering ensures the
    // singleton counter and scroll-lock are both back at baseline before the
    // next test runs.
    cleanup();
    document.body.style.overflow = '';
  });

  it('renders correctly when isOpen is true', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(<Modal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<Modal {...defaultProps} />);
    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking the backdrop', () => {
    render(<Modal {...defaultProps} />);
    // The backdrop is the outer div with role="dialog"
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside the modal content', () => {
    render(<Modal {...defaultProps} />);
    const content = screen.getByText('Modal Content');
    fireEvent.click(content);
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<Modal {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when other key is pressed', () => {
    render(<Modal {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('stops immediate propagation when captureEscape is true and Escape is pressed', () => {
    const stopImmediatePropagationMock = vi.fn();
    render(<Modal {...defaultProps} captureEscape={true} />);

    // We dispatch a custom KeyboardEvent to mock stopImmediatePropagation
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    event.stopImmediatePropagation = stopImmediatePropagationMock;

    window.dispatchEvent(event);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(stopImmediatePropagationMock).toHaveBeenCalledTimes(1);
  });

  it('renders customHeader if provided', () => {
    render(
      <Modal
        {...defaultProps}
        customHeader={<div data-testid="custom-header">Custom Header</div>}
      />
    );
    expect(screen.getByTestId('custom-header')).toBeInTheDocument();
    // Default header title should not be rendered
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
  });

  it('renders footer if provided', () => {
    render(<Modal {...defaultProps} footer={<button>Footer Button</button>} />);
    expect(screen.getByText('Footer Button')).toBeInTheDocument();
  });

  it('renders bare variant correctly', () => {
    render(<Modal {...defaultProps} variant="bare" />);
    // In bare variant, the default header (with title and close button) is not rendered
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
    // But children are still rendered
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });

  it('handles nested modals and document body overflow', () => {
    const { unmount: unmount1 } = render(
      <Modal {...defaultProps} title="Modal 1" />
    );
    expect(document.body.style.overflow).toBe('hidden');

    const { unmount: unmount2 } = render(
      <Modal {...defaultProps} title="Modal 2" />
    );
    expect(document.body.style.overflow).toBe('hidden');

    unmount2();
    // Still one modal open
    expect(document.body.style.overflow).toBe('hidden');

    unmount1();
    // No modals open
    expect(document.body.style.overflow).toBe('unset');
  });

  it('uses ariaLabelledby if provided', () => {
    render(<Modal {...defaultProps} ariaLabelledby="custom-id" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'custom-id');
  });

  it('uses ariaLabel if provided', () => {
    render(<Modal {...defaultProps} ariaLabel="Custom Label" />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Custom Label');
  });

  it('falls back to title for aria-label if ariaLabelledby is not provided', () => {
    render(
      <Modal
        {...defaultProps}
        ariaLabel={undefined}
        ariaLabelledby={undefined}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Test Modal');
  });

  // Regression: onClose in the useEffect deps array causes the effect to re-run
  // on every parent render that creates a new inline onClose reference. Each
  // re-run triggers decrementOpenModalCount() (cleanup) + incrementOpenModalCount()
  // (setup), which briefly drops the count to 0 and sets body overflow to 'unset',
  // breaking the scroll-lock while the modal is still open.
  //
  // Root cause: useEffect(() => { ... }, [isOpen, onClose, captureEscape]) —
  // onClose in deps means every new function reference triggers cleanup + re-run.
  //
  // Fix: move onClose into a ref (same pattern as SettingsPanel.tsx) and remove
  // it from the deps array. Only isOpen and captureEscape need to be deps.
  //
  // How we detect this in JSDOM: because act() runs effects synchronously,
  // the intermediate count-0 state is invisible after act() completes. Instead
  // we intercept every write to document.body.style.overflow and record the
  // values. With the bug: each of 3 re-renders produces 'unset' + 'hidden'
  // (cleanup releases lock, setup re-acquires it) → 6 entries total. With the
  // fix: no intermediate writes → 0 entries.
  it('does not re-run scroll-lock logic when parent re-renders with a new onClose reference', () => {
    // Intercept document.body.style.overflow assignments.
    const overflowWrites: string[] = [];
    let currentOverflow = '';
    Object.defineProperty(document.body.style, 'overflow', {
      get: () => currentOverflow,
      set: (v: string) => {
        currentOverflow = v;
        overflowWrites.push(v);
      },
      configurable: true,
    });

    // Parent component: new inline onClose reference on every render.
    const ParentWithInlineOnClose = () => {
      const [_counter, setCounter] = useState(0);
      const onClose = () => setCounter(0); // new fn reference each render
      return (
        <div>
          <button
            data-testid="trigger-rerender"
            onClick={() => setCounter((c) => c + 1)}
          >
            re-render
          </button>
          <Modal isOpen={true} onClose={onClose} title="Scroll Lock Test">
            Content
          </Modal>
        </div>
      );
    };

    const { unmount } = render(<ParentWithInlineOnClose />);
    // After mount the effect should have set overflow once ('hidden').
    expect(overflowWrites).toEqual(['hidden']);
    // Clear so only re-render-caused writes are captured.
    overflowWrites.length = 0;

    // Trigger 3 parent re-renders, each producing a new onClose reference.
    act(() => {
      fireEvent.click(screen.getByTestId('trigger-rerender'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('trigger-rerender'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('trigger-rerender'));
    });

    // With the bug: each re-render fires cleanup (sets 'unset') then re-runs
    // setup (sets 'hidden'). Three re-renders → ['unset','hidden', ...] (6).
    // With the fix: no overflow changes during re-renders → [].
    const midRenderWrites = overflowWrites.slice();

    // Restore so afterEach cleanup doesn't use the intercepted property.
    Object.defineProperty(document.body.style, 'overflow', {
      get: () => currentOverflow,
      set: (v: string) => {
        currentOverflow = v;
      },
      configurable: true,
    });

    // Final cleanup.
    unmount();

    // KEY ASSERTION: No overflow mutations should happen between initial mount
    // and final unmount. Any entry here means the effect re-ran on a re-render.
    expect(midRenderWrites).toHaveLength(0);
  });
});
