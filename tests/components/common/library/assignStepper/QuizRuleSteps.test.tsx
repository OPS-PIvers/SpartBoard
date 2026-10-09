import React from 'react';
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { QuizBehaviorSettings, QuizSessionOptions } from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { QuizAttemptsStep } from '@/components/common/library/assignStepper/QuizAttemptsStep';
import { QuizIntegrityStep } from '@/components/common/library/assignStepper/QuizIntegrityStep';
import { QuizFeedbackStep } from '@/components/common/library/assignStepper/QuizFeedbackStep';

const make = (
  options: Partial<QuizSessionOptions> = {}
): QuizBehaviorSettings => ({
  ...DEFAULT_QUIZ_BEHAVIOR,
  sessionOptions: { ...DEFAULT_QUIZ_BEHAVIOR.sessionOptions, ...options },
});

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

type OnChange = (next: QuizBehaviorSettings) => void;
const changeSpy = () => vi.fn<OnChange>();
const lastOptions = (fn: Mock<OnChange>) =>
  fn.mock.lastCall?.[0].sessionOptions;

const ALL_FLAGS = ['quiz-time-limit', 'tab-away-timer', 'quiz-score-on-submit'];

describe('QuizAttemptsStep', () => {
  it('sets attempts and shuffles', () => {
    const onChange = changeSpy();
    render(<QuizAttemptsStep value={make()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlimited' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ attemptLimit: null })
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Shuffle questions' }));
    expect(lastOptions(onChange)?.shuffleQuestions).toBe(true);
  });

  it('hides the time limit without its flag', () => {
    render(<QuizAttemptsStep value={make()} onChange={vi.fn()} />);
    expect(screen.queryByText('Time limit')).not.toBeInTheDocument();
  });

  it('shows a minutes field left of the time limit toggle when on', () => {
    const onChange = changeSpy();
    render(
      withFlags(
        ALL_FLAGS,
        <QuizAttemptsStep
          value={make({ timeLimitMinutes: 20 })}
          onChange={onChange}
        />
      )
    );
    const field = screen.getByRole('spinbutton', { name: 'Minutes' });
    fireEvent.change(field, { target: { value: '500' } });
    fireEvent.blur(field);
    expect(lastOptions(onChange)?.timeLimitMinutes).toBe(240);
    fireEvent.click(screen.getByRole('switch', { name: 'Time limit' }));
    expect(lastOptions(onChange)?.timeLimitMinutes).toBe(null);
  });
});

describe('QuizIntegrityStep', () => {
  it('hides the focus sub-settings when focus mode is off', () => {
    render(
      withFlags(
        ALL_FLAGS,
        <QuizIntegrityStep
          value={make({ tabWarningsEnabled: false })}
          onChange={vi.fn()}
        />
      )
    );
    expect(
      screen.queryByText('Auto-submit if away too long')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Block copy and paste')).toBeInTheDocument();
  });

  it('gates the away row on tab-away-timer', () => {
    render(<QuizIntegrityStep value={make()} onChange={vi.fn()} />);
    expect(
      screen.queryByText('Auto-submit if away too long')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Auto-submit after repeated tab switches')
    ).toBeInTheDocument();
  });

  it('turns on away auto-submit at 30 seconds and clamps the field to 5-300', () => {
    const onChange = changeSpy();
    const { rerender } = render(
      withFlags(
        ALL_FLAGS,
        <QuizIntegrityStep value={make()} onChange={onChange} />
      )
    );
    expect(
      screen.queryByRole('spinbutton', {
        name: 'Seconds away before auto-submit',
      })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('switch', { name: 'Auto-submit if away too long' })
    );
    const next = onChange.mock.lastCall?.[0] as QuizBehaviorSettings;
    expect(next.sessionOptions).toMatchObject({
      tabAwayAutoSubmit: true,
      tabAwayLimitSeconds: 30,
    });
    rerender(
      withFlags(
        ALL_FLAGS,
        <QuizIntegrityStep value={next} onChange={onChange} />
      )
    );
    const field = screen.getByRole('spinbutton', {
      name: 'Seconds away before auto-submit',
    });
    expect(field).toHaveValue(30);
    fireEvent.change(field, { target: { value: '2' } });
    fireEvent.blur(field);
    expect(lastOptions(onChange)?.tabAwayLimitSeconds).toBe(5);
  });

  it('switches repeated tab-switch auto-submit off and on', () => {
    const onChange = changeSpy();
    render(<QuizIntegrityStep value={make()} onChange={onChange} />);
    expect(
      screen.getByRole('spinbutton', { name: 'Warnings before auto-submit' })
    ).toHaveValue(3);
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Auto-submit after repeated tab switches',
      })
    );
    expect(lastOptions(onChange)?.tabWarningThreshold).toBe('off');
  });
});

describe('QuizFeedbackStep', () => {
  it('gates score on submit and disables it for teacher-graded questions', () => {
    const { rerender } = render(
      <QuizFeedbackStep value={make()} onChange={vi.fn()} />
    );
    expect(screen.queryByText('Show score on submit')).not.toBeInTheDocument();
    rerender(
      withFlags(
        ALL_FLAGS,
        <QuizFeedbackStep value={make()} onChange={vi.fn()} hasManualGrading />
      )
    );
    expect(
      screen.getByRole('switch', { name: 'Show score on submit' })
    ).toBeDisabled();
  });

  it('disables the correct-answer reveal until right and wrong is on', () => {
    render(<QuizFeedbackStep value={make()} onChange={vi.fn()} />);
    expect(
      screen.getByRole('switch', { name: 'Reveal correct answer to students' })
    ).toBeDisabled();
  });

  it('shows raise a hand and read aloud only when the host allows them', () => {
    const { rerender } = render(
      <QuizFeedbackStep
        value={make()}
        onChange={vi.fn()}
        handRaiseMode="force-off"
      />
    );
    expect(
      screen.queryByText('Allow students to raise a hand')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Read aloud')).not.toBeInTheDocument();
    const onChange = changeSpy();
    rerender(
      <QuizFeedbackStep
        value={make()}
        onChange={onChange}
        handRaiseMode="teacher-choice"
        readAloudAvailable
      />
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'Allow students to raise a hand' })
    );
    expect(lastOptions(onChange)?.handRaiseEnabled).toBe(true);
    expect(screen.getByText('Read aloud')).toBeInTheDocument();
  });
});
