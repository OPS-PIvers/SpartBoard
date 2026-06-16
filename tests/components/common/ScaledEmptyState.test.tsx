import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Camera, Clock } from 'lucide-react';
import React from 'react';

describe('ScaledEmptyState', () => {
  it('renders icon, title, and subtitle', () => {
    render(
      <ScaledEmptyState
        icon={Clock}
        title="No Schedule"
        subtitle="Flip to add items."
      />
    );
    expect(screen.getByText('No Schedule')).toBeInTheDocument();
    expect(screen.getByText('Flip to add items.')).toBeInTheDocument();
  });

  it('renders without subtitle when not provided', () => {
    render(<ScaledEmptyState icon={Clock} title="Empty" />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
    // Only the title paragraph should exist in the text container
    const title = screen.getByText('Empty');
    expect(title.parentElement?.children).toHaveLength(1);
  });

  it('renders action node when provided', () => {
    render(
      <ScaledEmptyState
        icon={Camera}
        title="Camera Error"
        action={<button>Retry</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('applies custom className to outer container', () => {
    const { container } = render(
      <ScaledEmptyState icon={Clock} title="Test" className="text-white/50" />
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer).toHaveClass('text-white/50');
    // Should still have the base layout classes
    expect(outer).toHaveClass('flex', 'flex-col', 'items-center');
  });

  it('uses contrast-safe default color classes when no overrides provided', () => {
    // Defaults must clear WCAG AA on the dark dashboard surface (slate-900):
    // slate-200 (~14.5:1) for the title, slate-300 (~12:1) for the subtitle.
    render(<ScaledEmptyState icon={Clock} title="Title" subtitle="Subtitle" />);
    const title = screen.getByText('Title');
    expect(title).toHaveClass('text-slate-200');

    const subtitle = screen.getByText('Subtitle');
    expect(subtitle).toHaveClass('text-slate-300');
  });

  it('applies custom iconClassName', () => {
    const { container } = render(
      <ScaledEmptyState
        icon={Clock}
        title="Test"
        iconClassName="text-red-500"
      />
    );
    // The icon wrapper is the first child of the outer div
    const iconWrapper = container.firstChild?.firstChild as HTMLElement;
    expect(iconWrapper).toHaveClass('text-red-500');
    expect(iconWrapper).not.toHaveClass('text-slate-300');
  });

  it('applies custom titleClassName', () => {
    render(
      <ScaledEmptyState
        icon={Clock}
        title="Custom Title"
        titleClassName="text-white"
      />
    );
    const title = screen.getByText('Custom Title');
    expect(title).toHaveClass('text-white');
    expect(title).not.toHaveClass('text-slate-500');
  });

  it('applies custom subtitleClassName', () => {
    render(
      <ScaledEmptyState
        icon={Clock}
        title="Title"
        subtitle="Custom Sub"
        subtitleClassName="text-white/70"
      />
    );
    const subtitle = screen.getByText('Custom Sub');
    expect(subtitle).toHaveClass('text-white/70');
    expect(subtitle).not.toHaveClass('text-slate-400');
  });
});
