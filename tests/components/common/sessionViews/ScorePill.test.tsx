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
    expect(screen.getByTestId('score-pill').className).toContain(
      'text-slate-600'
    );
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

  it('appends the suffix to the value (e.g. gamified points)', () => {
    render(
      <ScorePill
        score={0}
        display="percent"
        gamified
        points={247}
        suffix=" pts"
      />
    );
    expect(screen.getByTestId('score-pill')).toHaveTextContent('247 pts');
  });

  it('renders 0% instead of NaN% when the score is not finite', () => {
    render(<ScorePill score={NaN} display="percent" />);
    expect(screen.getByTestId('score-pill')).toHaveTextContent('0%');
  });
});
