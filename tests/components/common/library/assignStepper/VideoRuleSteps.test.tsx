import React from 'react';
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import {
  VideoAttemptsStep,
  VideoFeedbackStep,
  VideoIntegrityStep,
  VideoPlaybackStep,
} from '@/components/common/library/assignStepper/VideoRuleSteps';
import { videoRuleStepDefs } from '@/components/common/library/assignStepper/videoRuleStepDefs';
import {
  videoRulesFromBehavior,
  type VideoAssignRules,
} from '@/components/common/library/assignStepper/VideoRuleStepValues';

const make = (): VideoAssignRules =>
  videoRulesFromBehavior(structuredClone(DEFAULT_VA_BEHAVIOR));

type OnChange = (next: VideoAssignRules) => void;
const changeSpy = () => vi.fn<OnChange>();
const last = (fn: Mock<OnChange>) => fn.mock.lastCall?.[0];

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

describe('VideoAttemptsStep', () => {
  it('sets attempts and hides shuffle without answerRows', () => {
    const onChange = changeSpy();
    render(
      <VideoAttemptsStep
        value={make()}
        onChange={onChange}
        answerRows={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unlimited' }));
    expect(last(onChange)?.behavior.attemptLimit).toBeNull();
    expect(
      screen.queryByRole('switch', { name: 'Shuffle answer options' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Time limit')).not.toBeInTheDocument();
    expect(screen.queryByText('Shuffle questions')).not.toBeInTheDocument();
    expect(screen.queryByText('Final score')).not.toBeInTheDocument();
  });

  it('shows shuffle answer options with answerRows', () => {
    const onChange = changeSpy();
    render(<VideoAttemptsStep value={make()} onChange={onChange} answerRows />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Shuffle answer options' })
    );
    expect(last(onChange)?.behavior.sessionOptions.shuffleAnswerOptions).toBe(
      false
    );
  });
});

describe('VideoPlaybackStep', () => {
  it('toggles each player rule on the player value only', () => {
    const onChange = changeSpy();
    const value = make();
    render(<VideoPlaybackStep value={value} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Allow skipping ahead' })
    );
    expect(last(onChange)?.player.allowSkipping).toBe(true);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Rewind on a wrong answer' })
    );
    expect(last(onChange)?.player.requireCorrectAnswer).toBe(false);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Autoplay after a question' })
    );
    expect(last(onChange)?.player.autoPlay).toBe(true);
    expect(last(onChange)?.behavior).toBe(value.behavior);
  });
});

describe('VideoIntegrityStep', () => {
  it('shows focus mode rows and no copy and paste or passage quotes', () => {
    const onChange = changeSpy();
    render(
      withFlags(
        ['tab-away-timer', 'quiz-stimulus-quotes'],
        <VideoIntegrityStep value={make()} onChange={onChange} />
      )
    );
    expect(
      screen.getByRole('switch', {
        name: 'Auto-submit after repeated tab switches',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Auto-submit if away too long' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Block copy and paste')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Let students quote from passages')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Focus mode' }));
    expect(last(onChange)?.behavior.sessionOptions.tabWarningsEnabled).toBe(
      false
    );
  });

  it('hides the away row without its flag', () => {
    render(<VideoIntegrityStep value={make()} onChange={vi.fn()} />);
    expect(
      screen.queryByText('Auto-submit if away too long')
    ).not.toBeInTheDocument();
  });
});

describe('VideoFeedbackStep', () => {
  it('renders nothing without answerRows', () => {
    const { container } = render(
      <VideoFeedbackStep value={make()} onChange={vi.fn()} answerRows={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('locks reveal while right and wrong is off', () => {
    const onChange = changeSpy();
    const { rerender } = render(
      <VideoFeedbackStep value={make()} onChange={onChange} answerRows />
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'Show right and wrong to students' })
    );
    const off = last(onChange);
    expect(off?.behavior.sessionOptions.showResultToStudent).toBe(false);
    if (!off) throw new Error('no change');
    rerender(<VideoFeedbackStep value={off} onChange={onChange} answerRows />);
    const reveal = screen.getByRole('switch', {
      name: 'Reveal correct answer to students',
    });
    expect(reveal).toBeDisabled();
    expect(reveal).toHaveAttribute('aria-checked', 'false');
  });
});

describe('videoRuleStepDefs', () => {
  it('matches the getAssignSteps order and titles', () => {
    const defs = videoRuleStepDefs({
      value: make(),
      onChange: vi.fn(),
      answerRows: false,
    });
    expect(defs.map((d) => [d.id, d.title, d.value])).toEqual([
      ['attempts', 'Attempts and order', '1 attempt'],
      ['video', 'Video', 'Rewind on wrong answer'],
      ['integrity', 'Integrity', 'Focus mode'],
    ]);
    expect(
      videoRuleStepDefs({ value: make(), onChange: vi.fn() }).at(-1)?.id
    ).toBe('feedback');
  });
});
