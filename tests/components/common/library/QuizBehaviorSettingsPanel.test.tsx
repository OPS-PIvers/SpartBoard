import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { QuizBehaviorSettings } from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';

// The component file doesn't exist yet — this import will fail until Step 3.
import { QuizBehaviorSettingsPanel } from '@/components/common/library/QuizBehaviorSettingsPanel';

const defaultValue: QuizBehaviorSettings = {
  ...DEFAULT_QUIZ_BEHAVIOR,
  attemptLimit: null,
};

describe('QuizBehaviorSettingsPanel', () => {
  it('renders all three mode option cards', () => {
    render(
      <QuizBehaviorSettingsPanel value={defaultValue} onChange={vi.fn()} />
    );
    expect(screen.getByText('Teacher-paced')).toBeInTheDocument();
    expect(screen.getByText('Auto-progress')).toBeInTheDocument();
    expect(screen.getByText('Self-paced')).toBeInTheDocument();
  });

  it('renders the toggle group (Tab Switch Detection is visible)', () => {
    render(
      <QuizBehaviorSettingsPanel value={defaultValue} onChange={vi.fn()} />
    );
    expect(screen.getByText('Tab Switch Detection')).toBeInTheDocument();
  });

  it('renders the gamification section', () => {
    render(
      <QuizBehaviorSettingsPanel value={defaultValue} onChange={vi.fn()} />
    );
    expect(screen.getByText('Gamification')).toBeInTheDocument();
  });

  it('clicking "Self-paced" calls onChange with sessionMode: student', () => {
    const onChange = vi.fn();
    render(
      <QuizBehaviorSettingsPanel value={defaultValue} onChange={onChange} />
    );
    fireEvent.click(screen.getByText('Self-paced'));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toMatchObject({ sessionMode: 'student' });
  });

  it('toggling a sessionOption calls onChange with the updated sessionOptions', () => {
    const onChange = vi.fn();
    const value: QuizBehaviorSettings = {
      sessionMode: 'teacher',
      sessionOptions: {
        tabWarningsEnabled: true,
        showResultToStudent: false,
        showCorrectAnswerToStudent: false,
        showCorrectOnBoard: false,
        shuffleQuestions: false,
        shuffleAnswerOptions: true,
        speedBonusEnabled: false,
        streakBonusEnabled: false,
        showPodiumBetweenQuestions: false,
        soundEffectsEnabled: false,
      },
      attemptLimit: null,
    };
    render(<QuizBehaviorSettingsPanel value={value} onChange={onChange} />);

    // Tab Switch Detection toggle is on — toggle it off.
    // The toggle renders as role="switch"
    const tabSwitchLabel = screen.getByText('Tab Switch Detection');
    const row = tabSwitchLabel.closest('div');
    const switchEl = row?.querySelector('[role="switch"]');
    expect(switchEl).not.toBeNull();
    fireEvent.click(switchEl as HTMLElement);

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toMatchObject({
      sessionOptions: expect.objectContaining({ tabWarningsEnabled: false }),
    });
  });

  it('when modeLocked, all mode buttons are disabled', () => {
    render(
      <QuizBehaviorSettingsPanel
        value={defaultValue}
        onChange={vi.fn()}
        modeLocked
      />
    );
    const teacherBtn = screen.getByText('Teacher-paced').closest('button');
    const autoBtn = screen.getByText('Auto-progress').closest('button');
    const selfBtn = screen.getByText('Self-paced').closest('button');
    expect(teacherBtn).toBeDisabled();
    expect(autoBtn).toBeDisabled();
    expect(selfBtn).toBeDisabled();
  });
});
