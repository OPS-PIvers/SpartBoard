import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { VideoActivityBehaviorSettings } from '@/types';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';

import { VideoActivityBehaviorSettingsPanel } from '@/components/common/library/VideoActivityBehaviorSettingsPanel';

const defaultValue: VideoActivityBehaviorSettings = {
  ...DEFAULT_VA_BEHAVIOR,
  attemptLimit: null,
};

describe('VideoActivityBehaviorSettingsPanel', () => {
  it('renders all three mode option cards', () => {
    render(
      <VideoActivityBehaviorSettingsPanel
        value={defaultValue}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Teacher-paced')).toBeInTheDocument();
    expect(screen.getByText('Auto-progress')).toBeInTheDocument();
    expect(screen.getByText('Self-paced')).toBeInTheDocument();
  });

  it('renders the toggle group (Tab Switch Detection is visible)', () => {
    render(
      <VideoActivityBehaviorSettingsPanel
        value={defaultValue}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Tab Switch Detection')).toBeInTheDocument();
  });

  it('does NOT render the Block Copy & Paste toggle (Quiz-only feature)', () => {
    render(
      <VideoActivityBehaviorSettingsPanel
        value={defaultValue}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText('Block Copy & Paste')).not.toBeInTheDocument();
  });

  it('renders the VA-specific Scoring section', () => {
    render(
      <VideoActivityBehaviorSettingsPanel
        value={defaultValue}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Scoring')).toBeInTheDocument();
  });

  it('clicking "Self-paced" calls onChange with sessionMode: student', () => {
    const onChange = vi.fn();
    render(
      <VideoActivityBehaviorSettingsPanel
        value={defaultValue}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /self-paced/i }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toMatchObject({ sessionMode: 'student' });
  });

  it('toggling a sessionOption calls onChange with the updated sessionOptions', () => {
    const onChange = vi.fn();
    const value: VideoActivityBehaviorSettings = {
      sessionMode: 'teacher',
      sessionOptions: {
        tabWarningsEnabled: true,
        showResultToStudent: false,
        showCorrectAnswerToStudent: false,
        showCorrectOnBoard: false,
        shuffleQuestions: false,
        shuffleAnswerOptions: true,
        rewindOnIncorrectSeconds: 0,
        pointPenaltyOnIncorrect: 0,
        scoreVisibility: 'score-only',
      },
      attemptLimit: null,
    };
    render(
      <VideoActivityBehaviorSettingsPanel value={value} onChange={onChange} />
    );

    // Tab Switch Detection toggle is on — toggle it off.
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
      <VideoActivityBehaviorSettingsPanel
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
