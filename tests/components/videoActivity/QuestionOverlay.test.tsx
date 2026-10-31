import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QuestionOverlay } from '@/components/videoActivity/QuestionOverlay';
import type {
  VideoActivityCheckResult,
  VideoActivityPublicQuestion,
} from '@/types';

const mc: VideoActivityPublicQuestion = {
  id: 'q1',
  timestamp: 12,
  text: 'Capital of France?',
  type: 'MC',
  options: ['Rome', 'Paris', 'Oslo'],
};

const renderOverlay = (
  checkAnswer: (answer: string) => Promise<VideoActivityCheckResult>,
  question: VideoActivityPublicQuestion = mc,
  onAnswer = vi.fn()
) => {
  render(
    <QuestionOverlay
      question={question}
      checkAnswer={checkAnswer}
      onAnswer={onAnswer}
      questionIndex={1}
      totalQuestions={1}
      requireCorrectAnswer
    />
  );
  return onAnswer;
};

describe('QuestionOverlay server grading', () => {
  it('renders the public options and reports the server verdict', async () => {
    vi.useFakeTimers();
    const checkAnswer = vi
      .fn()
      .mockResolvedValue({ isCorrect: false, correctAnswer: 'Paris' });
    const onAnswer = renderOverlay(checkAnswer);
    expect(screen.getByText('Oslo')).toBeTruthy();

    fireEvent.click(screen.getByText('Rome'));
    await act(async () => {
      fireEvent.click(screen.getByText('Submit Answer'));
      await Promise.resolve();
    });
    expect(checkAnswer).toHaveBeenCalledWith('Rome');
    expect(screen.getByText(/Incorrect\. Rewinding/)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(onAnswer).toHaveBeenCalledWith('Rome', false, true);
    vi.useRealTimers();
  });

  it('says only that a short answer was saved, never right or wrong', async () => {
    const checkAnswer = vi
      .fn()
      .mockResolvedValue({ isCorrect: null, correctAnswer: '' });
    renderOverlay(checkAnswer, {
      id: 'sa1',
      timestamp: 5,
      text: 'Why?',
      type: 'SA',
    });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Because' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Submit Answer'));
      await Promise.resolve();
    });
    expect(screen.getByText(/Answer saved/)).toBeTruthy();
    expect(screen.queryByText(/Correct!/)).toBeNull();
  });

  it('shows the returned FIB key after a wrong answer', async () => {
    const checkAnswer = vi
      .fn()
      .mockResolvedValue({ isCorrect: false, correctAnswer: 'mitochondria' });
    renderOverlay(checkAnswer, {
      id: 'q2',
      timestamp: 1,
      text: 'Powerhouse?',
      type: 'FIB',
    });
    fireEvent.change(screen.getByPlaceholderText('Type your answer…'), {
      target: { value: 'nucleus' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Submit Answer'));
      await Promise.resolve();
    });
    expect(screen.getByText('mitochondria')).toBeTruthy();
  });

  it('keeps the answer and moves on when the grader is unreachable', async () => {
    vi.useFakeTimers();
    const onAnswer = renderOverlay(
      vi.fn().mockRejectedValue(new Error('offline'))
    );
    fireEvent.click(screen.getByText('Paris'));
    await act(async () => {
      fireEvent.click(screen.getByText('Submit Answer'));
      await Promise.resolve();
    });
    expect(screen.getByText('Answer saved. Resuming video…')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(onAnswer).toHaveBeenCalledWith('Paris', true, false);
    vi.useRealTimers();
  });

  it('reopens the question when the answer fails to save', async () => {
    vi.useFakeTimers();
    const checkAnswer = vi
      .fn()
      .mockResolvedValue({ isCorrect: true, correctAnswer: 'Paris' });
    const onAnswer = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    renderOverlay(checkAnswer, mc, onAnswer);

    fireEvent.click(screen.getByText('Paris'));
    await act(async () => {
      fireEvent.click(screen.getByText('Submit Answer'));
      await Promise.resolve();
    });
    expect(screen.getByText(/Correct! Resuming/)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toMatch(
      /Couldn.t send your answer/
    );
    const submit = screen.getByText('Submit Answer');
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fireEvent.click(submit);
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });
    expect(onAnswer).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('QuestionOverlay answer rules', () => {
  const submit = async (pick: string) => {
    fireEvent.click(screen.getByText(pick));
    await act(async () => {
      fireEvent.click(screen.getByText('Submit Answer'));
      await Promise.resolve();
    });
  };
  const rowFor = (text: string) => screen.getByText(text).closest('button');

  it('says only that the answer was saved when right and wrong is off', async () => {
    vi.useFakeTimers();
    const onAnswer = vi.fn();
    render(
      <QuestionOverlay
        question={mc}
        checkAnswer={vi
          .fn()
          .mockResolvedValue({ isCorrect: false, correctAnswer: '' })}
        onAnswer={onAnswer}
        questionIndex={1}
        totalQuestions={1}
        requireCorrectAnswer={false}
        showResult={false}
        revealAnswer={false}
      />
    );
    await submit('Rome');
    expect(screen.getByText('Answer saved. Resuming video…')).toBeTruthy();
    expect(rowFor('Rome')?.className).not.toContain('red');
    expect(rowFor('Paris')?.className).not.toContain('emerald');
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(onAnswer).toHaveBeenCalledWith('Rome', false, true);
    vi.useRealTimers();
  });

  it('marks a wrong pick without the correct option when reveal is off', async () => {
    render(
      <QuestionOverlay
        question={mc}
        checkAnswer={vi
          .fn()
          .mockResolvedValue({ isCorrect: false, correctAnswer: '' })}
        onAnswer={vi.fn()}
        questionIndex={1}
        totalQuestions={1}
        requireCorrectAnswer={false}
        revealAnswer={false}
      />
    );
    await submit('Rome');
    expect(screen.getByText(/Incorrect\. Resuming video/)).toBeTruthy();
    expect(rowFor('Rome')?.className).toContain('red');
    expect(rowFor('Paris')?.className).not.toContain('emerald');
  });

  it('marks a right pick green when reveal is off', async () => {
    render(
      <QuestionOverlay
        question={mc}
        checkAnswer={vi
          .fn()
          .mockResolvedValue({ isCorrect: true, correctAnswer: '' })}
        onAnswer={vi.fn()}
        questionIndex={1}
        totalQuestions={1}
        requireCorrectAnswer={false}
        revealAnswer={false}
      />
    );
    await submit('Paris');
    expect(rowFor('Paris')?.className).toContain('emerald');
  });

  it('hides the FIB key when reveal is off', async () => {
    render(
      <QuestionOverlay
        question={{ id: 'q2', timestamp: 1, text: 'Powerhouse?', type: 'FIB' }}
        checkAnswer={vi
          .fn()
          .mockResolvedValue({ isCorrect: false, correctAnswer: '' })}
        onAnswer={vi.fn()}
        questionIndex={1}
        totalQuestions={1}
        requireCorrectAnswer={false}
        revealAnswer={false}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Type your answer…'), {
      target: { value: 'nucleus' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Submit Answer'));
      await Promise.resolve();
    });
    expect(screen.queryByText(/Correct answer:/)).toBeNull();
    expect(screen.getByText(/Incorrect\. Resuming video/)).toBeTruthy();
  });
});
