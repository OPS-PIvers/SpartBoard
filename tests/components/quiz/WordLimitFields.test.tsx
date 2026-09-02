import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WordLimitFields } from '@/components/widgets/QuizWidget/components/WordLimitFields';
import type { QuizQuestion } from '@/types';

const question = (extra: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q1',
  timeLimit: 0,
  text: 'Explain',
  type: 'essay',
  correctAnswer: '',
  incorrectAnswers: [],
  ...extra,
});

const minInput = () => screen.getByLabelText('Minimum words');
const maxInput = () => screen.getByLabelText('Maximum words');

describe('WordLimitFields', () => {
  it('writes a valid bound through immediately', () => {
    const onChange = vi.fn();
    render(<WordLimitFields question={question()} onChange={onChange} />);
    fireEvent.change(maxInput(), { target: { value: '200' } });
    expect(onChange).toHaveBeenCalledWith({
      minWords: undefined,
      maxWords: 200,
      enforceWordLimit: undefined,
    });
  });

  it('shows an inline error and does NOT write when min exceeds max', () => {
    const onChange = vi.fn();
    render(
      <WordLimitFields
        question={question({ maxWords: 100 })}
        onChange={onChange}
      />
    );
    fireEvent.change(minInput(), { target: { value: '200' } });
    expect(
      screen.getByText(/minimum can't be greater than maximum/i)
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears the error and writes once the range becomes valid again', () => {
    const onChange = vi.fn();
    render(
      <WordLimitFields
        question={question({ maxWords: 100 })}
        onChange={onChange}
      />
    );
    fireEvent.change(minInput(), { target: { value: '200' } });
    fireEvent.change(minInput(), { target: { value: '50' } });
    expect(
      screen.queryByText(/minimum can't be greater than maximum/i)
    ).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      minWords: 50,
      maxWords: 100,
      enforceWordLimit: undefined,
    });
  });

  it('hides the enforce switch until a bound is set', () => {
    render(<WordLimitFields question={question()} onChange={vi.fn()} />);
    expect(screen.queryByText('Enforce limit')).not.toBeInTheDocument();
  });

  it('shows the enforce switch once a bound exists and toggles it', () => {
    const onChange = vi.fn();
    render(
      <WordLimitFields
        question={question({ minWords: 50 })}
        onChange={onChange}
      />
    );
    expect(
      screen.getByText(/students can't submit outside this range/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Enforce limit' }));
    expect(onChange).toHaveBeenCalledWith({ enforceWordLimit: true });
  });

  it('clears enforceWordLimit when the last bound is removed', () => {
    const onChange = vi.fn();
    render(
      <WordLimitFields
        question={question({ maxWords: 200, enforceWordLimit: true })}
        onChange={onChange}
      />
    );
    fireEvent.change(maxInput(), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({
      minWords: undefined,
      maxWords: undefined,
      enforceWordLimit: undefined,
    });
  });

  it('caps a bound at 5000', () => {
    const onChange = vi.fn();
    render(<WordLimitFields question={question()} onChange={onChange} />);
    fireEvent.change(maxInput(), { target: { value: '99999' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxWords: 5000 })
    );
  });
});
