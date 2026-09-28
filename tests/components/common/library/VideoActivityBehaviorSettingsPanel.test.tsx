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
  it('does not render a session mode picker', () => {
    render(
      <VideoActivityBehaviorSettingsPanel
        value={defaultValue}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText('Session Mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Teacher-paced')).not.toBeInTheDocument();
    expect(screen.queryByText('Auto-progress')).not.toBeInTheDocument();
  });

  it('hides Shuffle Questions', () => {
    render(
      <VideoActivityBehaviorSettingsPanel
        value={defaultValue}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Question Randomization'));
    expect(screen.queryByText('Shuffle Questions')).not.toBeInTheDocument();
    expect(screen.getByText('Shuffle Answer Options')).toBeInTheDocument();
  });

  it('renders the toggle group (Focus mode is visible)', () => {
    render(
      <VideoActivityBehaviorSettingsPanel
        value={defaultValue}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Focus mode')).toBeInTheDocument();
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

    // Focus mode toggle is on — toggle it off.
    const tabSwitchLabel = screen.getByText('Focus mode');
    const row = tabSwitchLabel.closest('div');
    const switchEl = row?.querySelector('[role="switch"]');
    expect(switchEl).not.toBeNull();
    fireEvent.click(switchEl as HTMLElement);

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toMatchObject({
      sessionOptions: expect.objectContaining({ tabWarningsEnabled: false }),
    });
  });
});
