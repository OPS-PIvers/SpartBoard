/**
 * Standalone unit tests for MatchingResponseInput. The component is a pure
 * UI shell over a stable wire format — no Firebase, no router. Tests cover
 * the tap-to-place flow, hydration from saved answers, distractor presence
 * in the bank, reset, and the all-options-placed terminal state.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MatchingResponseInput } from '@/components/quiz/MatchingResponseInput';
import type { QuizPublicQuestion } from '@/types';

function makeQuestion(
  matchingLeft: string[],
  matchingRight: string[]
): QuizPublicQuestion {
  return {
    id: 'q1',
    type: 'Matching',
    text: 'Match the items',
    timeLimit: 0,
    matchingLeft,
    matchingRight,
  };
}

describe('MatchingResponseInput', () => {
  it('renders all definitions from matchingRight as selectable bank chips', () => {
    const onChange = vi.fn();
    render(
      <MatchingResponseInput
        question={makeQuestion(
          ['France', 'Germany'],
          ['Paris', 'Berlin', 'quack', 'oink']
        )}
        savedAnswer={null}
        onChange={onChange}
      />
    );
    // All four options appear as buttons (the merged shuffled bank
    // includes real definitions + distractors with no visual distinction).
    expect(screen.getByRole('button', { name: /Paris/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Berlin/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quack/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /oink/ })).toBeInTheDocument();
  });

  it('serializes term:def pairs in matchingLeft order on tap-to-place', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MatchingResponseInput
        question={makeQuestion(['France', 'Germany'], ['Paris', 'Berlin'])}
        savedAnswer={null}
        onChange={onChange}
      />
    );
    // Tap chip → tap empty zone (works without dragging on touch devices).
    await user.click(
      screen.getByRole('button', { name: /Paris, in word bank/ })
    );
    await user.click(
      screen.getByRole('button', { name: /Drop zone for France/ })
    );
    expect(onChange).toHaveBeenLastCalledWith('France:Paris|Germany:');

    await user.click(
      screen.getByRole('button', { name: /Berlin, in word bank/ })
    );
    await user.click(
      screen.getByRole('button', { name: /Drop zone for Germany/ })
    );
    expect(onChange).toHaveBeenLastCalledWith('France:Paris|Germany:Berlin');
  });

  it('hydrates from a saved answer so placed chips render in their zones', () => {
    const onChange = vi.fn();
    render(
      <MatchingResponseInput
        question={makeQuestion(['France', 'Germany'], ['Paris', 'Berlin'])}
        savedAnswer="France:Paris|Germany:Berlin"
        onChange={onChange}
      />
    );
    // Both placed chips advertise their pairing through aria-label so the
    // round-trip from savedAnswer → render is visible to screen readers.
    expect(
      screen.getByRole('button', { name: /Paris, matched to France/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Berlin, matched to Germany/ })
    ).toBeInTheDocument();
  });

  it('reset returns every placed chip to the bank and emits empty pairs', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MatchingResponseInput
        question={makeQuestion(['France', 'Germany'], ['Paris', 'Berlin'])}
        savedAnswer="France:Paris|Germany:Berlin"
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole('button', { name: /Reset/ }));
    expect(onChange).toHaveBeenLastCalledWith('France:|Germany:');
    // Both chips back in the bank → empty drop zones rendered for both terms.
    expect(
      screen.getByRole('button', { name: /Drop zone for France/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Drop zone for Germany/ })
    ).toBeInTheDocument();
  });

  it('preserves a colon inside a definition through the place + serialize round-trip', async () => {
    // Regression for the toPublicQuestion fix: the student-side wire format
    // must not split on inner colons either. "9:00 AM" stays intact.
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MatchingResponseInput
        question={makeQuestion(['breakfast'], ['9:00 AM'])}
        savedAnswer={null}
        onChange={onChange}
      />
    );
    await user.click(
      screen.getByRole('button', { name: /9:00 AM, in word bank/ })
    );
    await user.click(
      screen.getByRole('button', { name: /Drop zone for breakfast/ })
    );
    expect(onChange).toHaveBeenLastCalledWith('breakfast:9:00 AM');
  });
});
