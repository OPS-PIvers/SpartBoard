import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResultsTabWarningModal } from '@/components/quiz/ResultsTabWarningModal';

describe('ResultsTabWarningModal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <ResultsTabWarningModal
        open={false}
        warningCount={1}
        threshold={3}
        onDismiss={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "Warning N of M" with remaining-warnings copy when below threshold', () => {
    render(
      <ResultsTabWarningModal
        open
        warningCount={1}
        threshold={3}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/Warning 1 of 3/)).toBeInTheDocument();
    expect(screen.getByText(/2 more will lock you out/)).toBeInTheDocument();
  });

  it('renders final-warning copy on the last warning', () => {
    render(
      <ResultsTabWarningModal
        open
        warningCount={3}
        threshold={3}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/Warning 3 of 3/)).toBeInTheDocument();
    expect(
      screen.getByText(/next time you leave, you will be locked out/)
    ).toBeInTheDocument();
  });

  it('calls onDismiss when the button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <ResultsTabWarningModal
        open
        warningCount={1}
        threshold={3}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /I understand/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses dialog semantics for accessibility', () => {
    render(
      <ResultsTabWarningModal
        open
        warningCount={1}
        threshold={3}
        onDismiss={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute(
      'aria-labelledby',
      'results-tab-warning-title'
    );
  });
});
