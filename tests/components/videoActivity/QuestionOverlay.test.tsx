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
  question: VideoActivityPublicQuestion = mc
) => {
  const onAnswer = vi.fn();
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
});
