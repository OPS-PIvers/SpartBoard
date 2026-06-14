import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionViewHeader } from '@/components/common/sessionViews/SessionViewHeader';

describe('SessionViewHeader', () => {
  it('renders title/subtitle and fires onBack', () => {
    const onBack = vi.fn();
    render(
      <SessionViewHeader onBack={onBack} title="My Quiz" subtitle="Period 3" />
    );
    expect(screen.getByText('My Quiz')).toBeInTheDocument();
    expect(screen.getByText('Period 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows a live status pill', () => {
    render(<SessionViewHeader onBack={vi.fn()} status="live" title="Q" />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders the actions slot', () => {
    render(
      <SessionViewHeader
        onBack={vi.fn()}
        title="Q"
        actions={<button type="button">End</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
  });
});
