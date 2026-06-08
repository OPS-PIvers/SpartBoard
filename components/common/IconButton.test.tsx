import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IconButton } from './IconButton';
import React from 'react';

describe('IconButton', () => {
  it('renders with icon and aria-label', () => {
    render(<IconButton icon={<span>Icon</span>} label="Test Button" />);
    const button = screen.getByRole('button', { name: /test button/i });
    expect(button).toBeInTheDocument();
    expect(within(button).getByText('Icon')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(
      <IconButton
        icon={<span>Icon</span>}
        label="Test Button"
        onClick={handleClick}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant classes', () => {
    render(
      <IconButton
        icon={<span>Icon</span>}
        label="Test Button"
        variant="danger"
      />
    );
    const button = screen.getByRole('button');
    expect(button.className).toContain('text-red-500');
  });

  it('applies active classes', () => {
    render(
      <IconButton
        icon={<span>Icon</span>}
        label="Test Button"
        variant="ghost"
        active
      />
    );
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-slate-100');
  });

  it('exposes a high-contrast focus-visible ring for keyboard users', () => {
    // WCAG 2.4.7: the focus indicator must stay visible (>=3:1) on white, dark,
    // and image backgrounds. The dark brand-blue ring reads on light surfaces;
    // the white offset keeps it visible on dark dock/widget surfaces.
    render(<IconButton icon={<span>Icon</span>} label="Focus Button" />);
    const button = screen.getByRole('button', { name: /focus button/i });
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.className).toContain('focus-visible:ring-brand-blue-primary');
    expect(button.className).toContain('focus-visible:ring-offset-2');
    expect(button.className).toContain('focus-visible:ring-offset-white');
  });

  it('handles disabled state', () => {
    render(
      <IconButton icon={<span>Icon</span>} label="Test Button" disabled />
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button.className).toContain('disabled:opacity-50');
  });
});
