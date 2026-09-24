import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import { StudioTourControls } from './StudioTourControls';

const baseStep: GuidedLearningStep = {
  id: 'step-1',
  xPct: 10,
  yPct: 10,
  imageIndex: 0,
  interactionType: 'tooltip',
};

function renderControls(initial: GuidedLearningStep = baseStep) {
  const seen = vi.fn();
  const Harness = () => {
    const [step, setStep] = useState(initial);
    return (
      <StudioTourControls
        step={step}
        onChange={(next) => {
          seen(next);
          setStep(next);
        }}
      />
    );
  };
  render(<Harness />);
  const last = () => seen.mock.lastCall?.[0] as GuidedLearningStep;
  return { last };
}

const anchorSelect = () => screen.getByLabelText('Button on the board');

describe('StudioTourControls', () => {
  it('links a step to a registered button and waits for the click', () => {
    const { last } = renderControls();
    expect(anchorSelect()).toHaveValue('');
    fireEvent.change(anchorSelect(), { target: { value: 'sidebar.boards' } });
    expect(last().tour).toEqual({ anchor: 'sidebar.boards', action: 'click' });
    fireEvent.click(screen.getByRole('button', { name: 'Show it, then Next' }));
    expect(last().tour).toEqual({
      anchor: 'sidebar.boards',
      action: 'observe',
    });
  });

  it('asks which widget for a per-type button and stores it in the ref', () => {
    const { last } = renderControls();
    expect(screen.queryByLabelText('Which widget')).toBeNull();
    fireEvent.change(anchorSelect(), { target: { value: 'dock.item' } });
    fireEvent.change(screen.getByLabelText('Which widget'), {
      target: { value: 'time-tool' },
    });
    expect(last().tour?.anchor).toBe('dock.item:time-tool');
  });

  it('unlinks the step', () => {
    const { last } = renderControls({
      ...baseStep,
      tour: { anchor: 'sidebar.boards', action: 'click' },
    });
    fireEvent.change(anchorSelect(), { target: { value: '' } });
    expect(last()).not.toHaveProperty('tour');
  });

  it('keeps a recorded name-only link until another button is picked', () => {
    const { last } = renderControls({
      ...baseStep,
      tour: {
        anchor: '',
        fallback: { role: 'button', name: 'Save' },
        action: 'click',
      },
    });
    expect(anchorSelect()).toHaveValue('__untagged');
    fireEvent.change(anchorSelect(), { target: { value: 'widget.close' } });
    expect(last().tour).toEqual({ anchor: 'widget.close', action: 'click' });
  });

  it('defaults "Teacher must click this" on for destructive buttons and lets it be edited', () => {
    const { last } = renderControls();
    const mustClick = () =>
      screen.queryByRole('checkbox', { name: /Teacher must click this/ });
    fireEvent.change(anchorSelect(), { target: { value: 'sidebar.boards' } });
    expect(mustClick()).not.toBeChecked();
    fireEvent.change(anchorSelect(), { target: { value: 'widget.close' } });
    expect(mustClick()).toBeChecked();
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Teacher must click this/ })
    );
    expect(last().tour).toEqual({
      anchor: 'widget.close',
      action: 'click',
      teacherMustClick: false,
    });
    expect(mustClick()).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Show it, then Next' }));
    expect(mustClick()).toBeNull();
  });
});
