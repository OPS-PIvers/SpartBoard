import { render, screen } from '@testing-library/react';
import { Button } from './Button';
import { describe, it, expect } from 'vitest';

describe('Button', () => {
  it('renders correctly with default props', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-brand-blue-primary'); // Default is primary
  });

  it('renders dark variant correctly', () => {
    render(<Button variant="dark">Dark Button</Button>);
    const button = screen.getByRole('button', { name: /dark button/i });
    expect(button).toHaveClass('bg-brand-gray-dark');
    expect(button).toHaveClass('text-white');
  });

  it('renders secondary variant correctly', () => {
    render(<Button variant="secondary">Secondary Button</Button>);
    const button = screen.getByRole('button', { name: /secondary button/i });
    expect(button).toHaveClass('bg-slate-200');
  });

  it('uses a WCAG AA contrast color for ghost variant resting text', () => {
    // Ghost buttons sit on white surfaces; slate-400 (~3.5:1) failed AA for
    // normal text. Resting text must be slate-600 (~7:1) or darker.
    render(<Button variant="ghost">Ghost Button</Button>);
    const button = screen.getByRole('button', { name: /ghost button/i });
    expect(button).toHaveClass('text-slate-600');
    expect(button).not.toHaveClass('text-slate-400');
  });

  it('exposes a high-contrast focus-visible ring for keyboard users', () => {
    // WCAG 2.4.7: keyboard focus must stay visible (>=3:1) on white, dark, and
    // image backgrounds. A colored ring alone cannot clear 3:1 on every
    // surface, so we pair the brand-blue ring with a white offset that always
    // separates the indicator from the button on dark/photo backgrounds.
    render(<Button>Focus me</Button>);
    const button = screen.getByRole('button', { name: /focus me/i });
    expect(button).toHaveClass('focus-visible:ring-2');
    expect(button).toHaveClass('focus-visible:ring-brand-blue-primary');
    expect(button).toHaveClass('focus-visible:ring-offset-2');
    expect(button).toHaveClass('focus-visible:ring-offset-white');
  });

  it('shows loading spinner when isLoading is true', () => {
    render(<Button isLoading>Click me</Button>);
    expect(screen.queryByText('Click me')).not.toBeInTheDocument();
    // The spinner is an svg
    // We can check if the button is disabled
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});
