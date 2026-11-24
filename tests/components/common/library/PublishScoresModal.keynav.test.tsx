// Regression test: the score-visibility radiogroup must support roving-tabindex arrow-key nav.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublishScoresModal } from '@/components/common/library/PublishScoresModal';

describe('PublishScoresModal — score visibility radiogroup keyboard nav', () => {
  function renderModal() {
    render(
      <PublishScoresModal
        assignmentTitle="Test Quiz"
        currentVisibility={undefined}
        onClose={() => undefined}
        onConfirm={vi.fn()}
      />
    );
  }

  it('only the checked radio is tab-stoppable (roving tabindex)', () => {
    renderModal();
    const radios = screen.getAllByRole('radio');
    const checked = radios.find(
      (r) => r.getAttribute('aria-checked') === 'true'
    );
    const unchecked = radios.filter((r) => r !== checked);

    expect(checked).toHaveAttribute('tabIndex', '0');
    unchecked.forEach((r) => expect(r).toHaveAttribute('tabIndex', '-1'));
  });

  it('ArrowRight moves focus and selection to the next radio', () => {
    renderModal();
    const radios = screen.getAllByRole('radio');
    radios[0].focus();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });

    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAttribute('aria-checked', 'false');
  });

  // Regression: this group renders as a vertical stack (space-y-2), so Down
  // is the key a user actually reaches for — not just Right.
  it('ArrowDown moves focus and selection to the next radio', () => {
    renderModal();
    const radios = screen.getAllByRole('radio');
    radios[0].focus();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowDown' });

    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAttribute('aria-checked', 'false');
  });

  it('ArrowLeft wraps focus and selection to the last radio from the first', () => {
    renderModal();
    const radios = screen.getAllByRole('radio');
    radios[0].focus();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });

    expect(radios[radios.length - 1]).toHaveFocus();
    expect(radios[radios.length - 1]).toHaveAttribute('aria-checked', 'true');
  });

  it('ArrowUp wraps focus and selection to the last radio from the first', () => {
    renderModal();
    const radios = screen.getAllByRole('radio');
    radios[0].focus();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowUp' });

    expect(radios[radios.length - 1]).toHaveFocus();
    expect(radios[radios.length - 1]).toHaveAttribute('aria-checked', 'true');
  });

  it('Home moves focus and selection to the first radio', () => {
    renderModal();
    const radios = screen.getAllByRole('radio');
    radios[radios.length - 1].focus();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'Home' });

    expect(radios[0]).toHaveFocus();
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('End moves focus and selection to the last radio', () => {
    renderModal();
    const radios = screen.getAllByRole('radio');
    radios[0].focus();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'End' });

    expect(radios[radios.length - 1]).toHaveFocus();
    expect(radios[radios.length - 1]).toHaveAttribute('aria-checked', 'true');
  });

  // Regression: arrow keys must not change selection while a publish is in
  // flight — the same guard the `disabled` attribute gives the click path.
  it('does nothing while submitting', () => {
    render(
      <PublishScoresModal
        assignmentTitle="Test Quiz"
        currentVisibility={undefined}
        onClose={() => undefined}
        onConfirm={() => new Promise(() => undefined)}
      />
    );
    const radios = screen.getAllByRole('radio');
    radios[0].focus();
    fireEvent.click(screen.getByRole('button', { name: /publish/i }));

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });

    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');
  });
});
