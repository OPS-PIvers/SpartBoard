import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { QuizBehaviorSettings } from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';

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

  it('renders the Block Copy & Paste toggle under Tab Switch Detection', () => {
    render(
      <QuizBehaviorSettingsPanel value={defaultValue} onChange={vi.fn()} />
    );
    expect(screen.getByText('Block Copy & Paste')).toBeInTheDocument();
  });

  it('gives each toggle-row switch an accessible name (a11y)', () => {
    render(
      <QuizBehaviorSettingsPanel value={defaultValue} onChange={vi.fn()} />
    );
    // ToggleRow forwards its visible label to the switch's aria-label, so the
    // switch is discoverable by name instead of being announced as just
    // "switch, off". Regression guard for the missing accessible name.
    expect(
      screen.getByRole('switch', { name: /Block Copy & Paste/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: /Tab Switch Detection/i })
    ).toBeInTheDocument();
  });

  it('forwards disabled to the switch so disabled rows are truly disabled (a11y)', () => {
    // sessionMode 'teacher' (the default) makes "Shuffle Questions" unavailable,
    // so ToggleRow renders it disabled. The switch must expose a real disabled
    // state — not just a pointer-events-none wrapper — so keyboard and AT users
    // cannot focus or activate it.
    render(
      <QuizBehaviorSettingsPanel value={defaultValue} onChange={vi.fn()} />
    );
    // Expand the "Question Randomization" disclosure to reveal its rows.
    fireEvent.click(
      screen.getByRole('button', { name: /Question Randomization/i })
    );
    expect(
      screen.getByRole('switch', { name: /Shuffle Questions/i })
    ).toBeDisabled();
  });

  it('reflects an existing blockCopyPaste: true value as a checked switch', () => {
    const value: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      sessionOptions: {
        ...DEFAULT_QUIZ_BEHAVIOR.sessionOptions,
        blockCopyPaste: true,
      },
      attemptLimit: null,
    };
    render(<QuizBehaviorSettingsPanel value={value} onChange={vi.fn()} />);

    const row = screen.getByText('Block Copy & Paste').closest('div');
    const switchEl = row?.querySelector('[role="switch"]');
    expect(switchEl).not.toBeNull();
    // Not a dead control — the front-face reflects the stored value.
    expect(switchEl).toHaveAttribute('aria-checked', 'true');
  });

  it('toggling Block Copy & Paste calls onChange with blockCopyPaste: true', () => {
    const onChange = vi.fn();
    render(
      <QuizBehaviorSettingsPanel value={defaultValue} onChange={onChange} />
    );

    const label = screen.getByText('Block Copy & Paste');
    const row = label.closest('div');
    const switchEl = row?.querySelector('[role="switch"]');
    expect(switchEl).not.toBeNull();
    fireEvent.click(switchEl as HTMLElement);

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toMatchObject({
      sessionOptions: expect.objectContaining({ blockCopyPaste: true }),
    });
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
    fireEvent.click(screen.getByRole('button', { name: /self-paced/i }));
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
    const teacherBtn = screen.getByRole('button', { name: /teacher-paced/i });
    const autoBtn = screen.getByRole('button', { name: /auto-progress/i });
    const selfBtn = screen.getByRole('button', { name: /self-paced/i });
    expect(teacherBtn).toBeDisabled();
    expect(autoBtn).toBeDisabled();
    expect(selfBtn).toBeDisabled();
  });
});
