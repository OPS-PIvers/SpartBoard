import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
