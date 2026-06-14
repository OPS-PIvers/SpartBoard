import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionBadge } from '@/components/common/sessionViews/SessionBadge';

describe('SessionBadge', () => {
  it('renders the label with success tone classes', () => {
    render(<SessionBadge tone="success" label="Done" />);
    const badge = screen.getByTestId('session-badge');
    expect(badge).toHaveTextContent('Done');
    expect(badge.className).toContain('bg-emerald-100');
    expect(badge.className).toContain('text-emerald-700');
  });

  it('renders a pulsing dot for success tone when dot is set', () => {
    const { container } = render(
      <SessionBadge tone="success" label="Live" dot />
    );
    const dot = container.querySelector('.animate-pulse');
    expect(dot).not.toBeNull();
  });

  it('uses neutral classes for neutral tone', () => {
    render(<SessionBadge tone="neutral" label="Ended" />);
    expect(screen.getByTestId('session-badge').className).toContain(
      'bg-slate-200'
    );
  });
});
