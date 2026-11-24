import { render, screen, fireEvent } from '@testing-library/react';
import { Toast } from './Toast';
import { describe, it, expect, vi } from 'vitest';

describe('Toast Component', () => {
  it('renders message correctly', () => {
    render(<Toast message="Hello World" />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders success style', () => {
    render(<Toast message="Success" type="success" />);
    const toast = screen.getByRole('status');
    expect(toast).toHaveClass('bg-green-500');
  });

  it('renders error style', () => {
    render(<Toast message="Error" type="error" />);
    const toast = screen.getByRole('alert');
    expect(toast).toHaveClass('bg-brand-red-primary');
  });

  it('renders warning style', () => {
    render(<Toast message="Warning" type="warning" />);
    const toast = screen.getByRole('alert');
    expect(toast).toHaveClass('bg-yellow-500');
  });

  it('renders with standardized positioning classes', () => {
    render(<Toast message="Position Check" />);
    const toast = screen.getByRole('status');
    expect(toast).toHaveClass('fixed');
    expect(toast).toHaveClass('bottom-4');
    expect(toast).toHaveClass('right-4');
    expect(toast).toHaveClass('z-toast');
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<Toast message="Close me" onClose={handleClose} />);

    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders loading spinner for loading type', () => {
    const { container } = render(<Toast message="Loading..." type="loading" />);
    // Check for animate-spin class which implies a spinner
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });
});
