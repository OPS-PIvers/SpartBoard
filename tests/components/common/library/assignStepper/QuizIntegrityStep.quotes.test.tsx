import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { QuizBehaviorSettings } from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { QuizIntegrityStep } from '@/components/common/library/assignStepper/QuizIntegrityStep';

const withFlags = (flags: string[], ui: React.ReactElement) => (
  <AuthContext.Provider
    value={
      {
        canAccessFeature: (id: string) => flags.includes(id),
      } as unknown as AuthContextType
    }
  >
    {ui}
  </AuthContext.Provider>
);

const LABEL = 'Let students quote from passages';

describe('QuizIntegrityStep passage quotes', () => {
  it('hides the quote toggle without the flag', () => {
    render(
      <QuizIntegrityStep value={DEFAULT_QUIZ_BEHAVIOR} onChange={vi.fn()} />
    );
    expect(screen.queryByRole('switch', { name: LABEL })).toBeNull();
  });

  it('defaults quoting on with the flag and saves turning it off', () => {
    const onChange = vi.fn<(next: QuizBehaviorSettings) => void>();
    render(
      withFlags(
        ['quiz-stimulus-quotes'],
        <QuizIntegrityStep value={DEFAULT_QUIZ_BEHAVIOR} onChange={onChange} />
      )
    );
    const toggle = screen.getByRole('switch', { name: LABEL });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(onChange.mock.lastCall?.[0].sessionOptions.allowStimulusQuotes).toBe(
      false
    );
  });
});
