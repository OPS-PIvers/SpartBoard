import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type {
  VideoActivityPublicQuestion,
  VideoActivityQuestion,
} from '@/types';
import { VideoActivityLiveAggregate } from './VideoActivityLiveAggregate';

const key = (over: Partial<VideoActivityQuestion>): VideoActivityQuestion => ({
  id: 'q',
  timestamp: 0,
  text: 'Q',
  type: 'MC',
  correctAnswer: '',
  incorrectAnswers: [],
  timeLimit: 0,
  ...over,
});

const pub = (
  over: Partial<VideoActivityPublicQuestion>
): VideoActivityPublicQuestion => ({
  id: 'q',
  timestamp: 0,
  text: 'Q',
  type: 'MC',
  ...over,
});

const rows = () =>
  screen.getAllByTestId('answer-distribution-row').map((row) => ({
    text: row.textContent ?? '',
    count: row.querySelector('[data-testid="answer-distribution-count"]')
      ?.textContent,
  }));

describe('VideoActivityLiveAggregate', () => {
  const mc = pub({ options: ['Blue', 'Red', 'Green'] });
  const mcKey = key({
    correctAnswer: 'Red',
    incorrectAnswers: ['Blue', 'Green'],
  });

  it('draws an MC distribution in board order with no names', () => {
    render(
      <VideoActivityLiveAggregate
        question={mc}
        keyQuestion={mcKey}
        answers={['Red', 'Blue', 'Red']}
        answerRevealed={false}
      />
    );
    expect(rows()).toEqual([
      { text: 'Blue1', count: '1' },
      { text: 'Red2', count: '2' },
      { text: 'Green0', count: '0' },
    ]);
    expect(screen.queryByText('Correct')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Correct answer')).not.toBeInTheDocument();
  });

  it('marks the correct MC option with a text label only after reveal', () => {
    render(
      <VideoActivityLiveAggregate
        question={mc}
        keyQuestion={mcKey}
        answers={['Red', 'Blue']}
        answerRevealed
      />
    );
    const correct = screen.getByText('Correct');
    expect(
      correct.closest('[data-testid="answer-distribution-row"]')
    ).toHaveTextContent('Red');
  });

  it('counts each choose-all pick under its option, in board order', () => {
    render(
      <VideoActivityLiveAggregate
        question={pub({ type: 'MA', options: ['Z', 'X', 'Y'] })}
        keyQuestion={key({
          type: 'MA',
          correctAnswer: 'X|Y',
          incorrectAnswers: ['Z'],
        })}
        answers={['X|Y', 'X|Z', 'Y']}
        answerRevealed
      />
    );
    expect(rows().map((r) => r.count)).toEqual(['1', '2', '2']);
    expect(rows()[0].text).toContain('Z');
    expect(screen.getAllByText('Correct')).toHaveLength(2);
  });

  it('groups fill-in answers with an Other bucket and hides the key until reveal', () => {
    const fib = pub({ type: 'FIB' });
    const fibKey = key({
      type: 'FIB',
      correctAnswer: 'Mitosis',
      acceptableVariants: ['cell division'],
    });
    const answers = [
      'mitosis',
      ' Mitosis ',
      'cell division',
      'meiosis',
      'meiosis',
      'a',
      'b',
      'c',
      'd',
    ];
    const { rerender } = render(
      <VideoActivityLiveAggregate
        question={fib}
        keyQuestion={fibKey}
        answers={answers}
        answerRevealed={false}
      />
    );
    const before = rows();
    expect(before.map((r) => r.count)).toEqual(['2', '2', '1', '1', '1', '2']);
    expect(before.at(-1)?.text).toContain('Other');
    expect(screen.queryByText('Correct')).not.toBeInTheDocument();

    rerender(
      <VideoActivityLiveAggregate
        question={fib}
        keyQuestion={fibKey}
        answers={answers}
        answerRevealed
      />
    );
    const after = rows();
    expect(after[0]).toEqual({ text: 'MitosisCorrect3', count: '3' });
    expect(after.at(-1)?.text).toContain('Other');
  });

  it('says so when nobody has answered a fill-in', () => {
    render(
      <VideoActivityLiveAggregate
        question={pub({ type: 'FIB' })}
        keyQuestion={undefined}
        answers={[]}
        answerRevealed={false}
      />
    );
    expect(screen.getByText('No answers yet')).toBeInTheDocument();
  });
});
