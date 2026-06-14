import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Play } from 'lucide-react';
import { ActionButton } from '@/components/common/sessionViews/ActionButton';

describe('ActionButton', () => {
  it('renders label + primary styling and fires onClick', () => {
    const onClick = vi.fn();
    render(
      <ActionButton
        variant="primary"
        label="Export"
        icon={Play}
        onClick={onClick}
      />
    );
    const btn = screen.getByRole('button', { name: 'Export' });
    expect(btn).toHaveTextContent('Export');
    expect(btn.className).toContain('bg-brand-blue-primary');
    // Non-toggle buttons must not expose aria-pressed.
    expect(btn).not.toHaveAttribute('aria-pressed');
    // Keyboard focus ring present (WCAG AA).
    expect(btn.className).toContain('focus-visible:ring-brand-blue-primary');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it('uses danger styling for the danger variant', () => {
    render(<ActionButton variant="danger" label="End" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'End' }).className).toContain(
      'bg-brand-red-primary'
    );
  });

  it('hides the label text but keeps the accessible name when labelHidden', () => {
    render(
      <ActionButton
        variant="secondary"
        label="Scoreboard"
        icon={Play}
        onClick={vi.fn()}
        labelHidden
      />
    );
    expect(screen.queryByText('Scoreboard')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Scoreboard' })
    ).toBeInTheDocument();
  });

  it('shows a spinner in place of the icon when loading', () => {
    const { container } = render(
      <ActionButton
        variant="danger"
        label="End"
        icon={Play}
        onClick={vi.fn()}
        loading
      />
    );
    // Spinner present, accessible name preserved, and disabled so it can't double-fire.
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End' })).toBeDisabled();
  });

  it('applies the amber on-state treatment when active', () => {
    render(
      <ActionButton
        variant="secondary"
        label="Scoreboard"
        icon={Play}
        onClick={vi.fn()}
        active
      />
    );
    const btn = screen.getByRole('button', { name: 'Scoreboard' });
    expect(btn.className).toContain('ring-amber-400');
    expect(btn.className).toContain('bg-amber-100');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });
});
