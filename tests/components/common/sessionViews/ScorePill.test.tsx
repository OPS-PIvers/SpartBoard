import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScorePill } from '@/components/common/sessionViews/ScorePill';

describe('ScorePill', () => {
  it('renders rounded percent with the tone color', () => {
    render(<ScorePill score={90} display="percent" />);
    const pill = screen.getByTestId('score-pill');
    expect(pill).toHaveTextContent('90%');
    expect(pill.className).toContain('text-emerald-600');
  });

  it('renders count form as answered/total', () => {
    render(<ScorePill score={0} display="count" count={3} total={5} />);
    expect(screen.getByTestId('score-pill')).toHaveTextContent('3/5');
  });

  it('renders nothing when hidden', () => {
    const { container } = render(<ScorePill score={90} display="hidden" />);
    expect(container.querySelector('[data-testid="score-pill"]')).toBeNull();
  });

  it('shows points in brand-blue when gamified', () => {
    render(<ScorePill score={42} display="percent" gamified points={1200} />);
    const pill = screen.getByTestId('score-pill');
    expect(pill).toHaveTextContent('1200');
    expect(pill.className).toContain('text-brand-blue-dark');
  });
});
