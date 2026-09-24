import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { StudioPlayMode } from './StudioPlayMode';
import { DEVICE_PRESETS } from './devicePresets';
import type { GuidedLearningPlayer as PlayerType } from '../GuidedLearningPlayer';

const player = vi.hoisted(() => ({
  props: [] as Parameters<typeof PlayerType>[0][],
}));
vi.mock('../GuidedLearningPlayer', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../GuidedLearningPlayer')>();
  const Spy: typeof actual.GuidedLearningPlayer = (props) => {
    player.props.push(props);
    return <actual.GuidedLearningPlayer {...props} />;
  };
  return { GuidedLearningPlayer: Spy };
});

function buildSet(): GuidedLearningSet {
  return {
    id: 'set-1',
    schemaVersion: 3,
    title: 'Parts of a cell',
    imageUrls: ['https://example.com/slide-1.png'],
    steps: [
      {
        id: 'step-q',
        xPct: 40,
        yPct: 30,
        imageIndex: 0,
        interactionType: 'question',
        question: {
          type: 'multiple-choice',
          text: 'Which part holds the DNA?',
          choices: ['Nucleus', 'Membrane'],
          correctAnswer: 'Nucleus',
        },
        tour: { anchor: 'toolbar-add', action: 'click' },
      },
    ],
    mode: 'structured',
    createdAt: 1,
    updatedAt: 1,
  };
}

const lastProps = () => player.props[player.props.length - 1];

let layout: ReturnType<typeof mockStageLayout>;
beforeEach(() => {
  player.props = [];
  layout = mockStageLayout({
    container: { w: 800, h: 600 },
    image: { w: 800, h: 600 },
  });
});
afterEach(() => {
  cleanup();
  layout.restore();
});

const renderPreview = () =>
  render(
    <StudioPlayMode
      set={buildSet()}
      preset={DEVICE_PRESETS[0]}
      startStepId="step-q"
      playerV2={false}
      onStepShown={vi.fn()}
      onExit={vi.fn()}
    />
  );

const answerWrong = () => {
  fireEvent.click(screen.getByText('Membrane'));
  fireEvent.click(screen.getByText('Submit Answer'));
};

describe('StudioPlayMode preview', () => {
  it('plays the student copy of each step, without teacher mode', () => {
    renderPreview();
    const props = lastProps();
    expect(props.teacherMode).toBe(false);
    const step = props.set.steps[0] as unknown as Record<string, unknown>;
    expect(step).not.toHaveProperty('tour');
    expect(step.question).not.toHaveProperty('correctAnswer');
    expect(step.question).toMatchObject({
      text: 'Which part holds the DNA?',
    });
  });

  it('shows no answer key until the toggle is on', () => {
    renderPreview();
    const toggle = screen.getByRole('switch', { name: 'Show answer key' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    answerWrong();
    expect(screen.getByText('Answer recorded')).toBeInTheDocument();
    expect(screen.queryByText(/Correct answer/)).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    const props = lastProps();
    expect(props.teacherMode).toBe(true);
    expect(props.startStepId).toBe('step-q');
    expect(props.set.steps[0].question?.correctAnswer).toBe('Nucleus');
    answerWrong();
    expect(screen.getByText('Not quite')).toBeInTheDocument();
    expect(screen.getByText(/Correct answer/)).toBeInTheDocument();
  });
});
