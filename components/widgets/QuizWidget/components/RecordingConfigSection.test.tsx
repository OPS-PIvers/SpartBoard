import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import { RecordingConfigSection } from './RecordingConfigSection';
import { DEFAULT_RECORDING_CONFIG } from '@/config/quizRecordingDefaults';
import type { QuizQuestion } from '@/types';

const question = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q1',
  timeLimit: 45,
  text: 'Explain your reasoning.',
  type: 'short',
  correctAnswer: '',
  incorrectAnswers: [],
  ...over,
});

const withRecording = (over = {}) =>
  question({ recording: { ...DEFAULT_RECORDING_CONFIG, ...over } });

describe('RecordingConfigSection', () => {
  it('shows only the enable toggle until the block exists', () => {
    render(<RecordingConfigSection question={question()} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Ask for a spoken answer')).toBeTruthy();
    expect(screen.queryByLabelText('Thinking time')).toBeNull();
    expect(screen.queryByLabelText('Takes allowed')).toBeNull();
  });

  it('reports the enable switch state to assistive tech', () => {
    const { unmount } = render(
      <RecordingConfigSection question={question()} onChange={vi.fn()} />
    );
    expect(
      screen
        .getByLabelText('Ask for a spoken answer')
        .getAttribute('aria-checked')
    ).toBe('false');
    unmount();
    render(
      <RecordingConfigSection question={withRecording()} onChange={vi.fn()} />
    );
    expect(
      screen
        .getByLabelText('Ask for a spoken answer')
        .getAttribute('aria-checked')
    ).toBe('true');
  });

  it('writes the default block and zeroes the speed-bonus clock on enable', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection question={question()} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    expect(onChange).toHaveBeenCalledWith({
      recording: { ...DEFAULT_RECORDING_CONFIG, priorTimeLimit: 45 },
      timeLimit: 0,
    });
  });

  it('stashes nothing when there was no clock to replace', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection
        question={question({ timeLimit: 0 })}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    expect(onChange).toHaveBeenCalledWith({
      recording: { ...DEFAULT_RECORDING_CONFIG },
      timeLimit: 0,
    });
  });

  it('removes the block entirely on disable', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection question={withRecording()} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    expect(onChange).toHaveBeenCalledWith({ recording: undefined });
  });

  it('restores the stashed time limit on disable', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection
        question={question({
          timeLimit: 0,
          recording: { ...DEFAULT_RECORDING_CONFIG, priorTimeLimit: 45 },
        })}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    expect(onChange).toHaveBeenCalledWith({
      recording: undefined,
      timeLimit: 45,
    });
  });

  it('restores a customized block authored earlier in the session on re-enable', () => {
    let current = question();
    const apply = (updates: Partial<QuizQuestion>) => {
      const next = { ...current, ...updates } as Record<string, unknown>;
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) delete next[key];
      }
      current = next as unknown as QuizQuestion;
    };
    const view = () => (
      <RecordingConfigSection question={current} onChange={apply} />
    );
    const { rerender } = render(view());

    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    rerender(view());
    fireEvent.change(screen.getByLabelText('Recording limit'), {
      target: { value: '180' },
    });
    rerender(view());
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    rerender(view());
    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    rerender(view());
    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    rerender(view());

    expect(current.recording?.limitSeconds).toBe(180);
    expect(current.recording?.takeLimit).toBe(2);
  });

  it('starts from defaults again on a fresh mount', () => {
    let current = question();
    const apply = (updates: Partial<QuizQuestion>) => {
      const next = { ...current, ...updates } as Record<string, unknown>;
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) delete next[key];
      }
      current = next as unknown as QuizQuestion;
    };
    const view = () => (
      <RecordingConfigSection question={current} onChange={apply} />
    );
    const { rerender, unmount } = render(view());

    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    rerender(view());
    fireEvent.change(screen.getByLabelText('Recording limit'), {
      target: { value: '180' },
    });
    rerender(view());
    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    rerender(view());
    unmount();

    render(<RecordingConfigSection question={current} onChange={apply} />);
    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    expect(current.recording).toEqual({
      ...DEFAULT_RECORDING_CONFIG,
      priorTimeLimit: 45,
    });
  });

  it('leaves the question deep-equal to its original across a round trip', () => {
    const original = question();
    let current = original;
    const apply = (updates: Partial<QuizQuestion>) => {
      const next = { ...current, ...updates } as Record<string, unknown>;
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) delete next[key];
      }
      current = next as unknown as QuizQuestion;
    };
    const view = () => (
      <RecordingConfigSection question={current} onChange={apply} />
    );
    const { rerender } = render(view());
    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    rerender(view());
    fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    expect(current).toEqual(original);
  });

  it('writes prep seconds through the caller', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection question={withRecording()} onChange={onChange} />
    );
    fireEvent.change(screen.getByLabelText('Thinking time'), {
      target: { value: '15' },
    });
    expect(onChange).toHaveBeenCalledWith({
      recording: { ...DEFAULT_RECORDING_CONFIG, prepSeconds: 15 },
    });
  });

  it('writes the recording limit and holds it under the ceiling', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection question={withRecording()} onChange={onChange} />
    );
    const limit = screen.getByLabelText('Recording limit');
    fireEvent.change(limit, { target: { value: '120' } });
    expect(onChange).toHaveBeenLastCalledWith({
      recording: { ...DEFAULT_RECORDING_CONFIG, limitSeconds: 120 },
    });
    fireEvent.change(limit, { target: { value: '9000' } });
    expect(onChange).toHaveBeenLastCalledWith({
      recording: { ...DEFAULT_RECORDING_CONFIG, limitSeconds: 300 },
    });
  });

  it('writes each prep-expiry branch', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection question={withRecording()} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Start recording/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      recording: { ...DEFAULT_RECORDING_CONFIG, prepExpiry: 'auto-start' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Mark unanswered/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      recording: { ...DEFAULT_RECORDING_CONFIG, prepExpiry: 'unanswered' },
    });
  });

  it('writes a numeric take limit and back to unlimited', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection
        question={withRecording({ takeLimit: 2 })}
        onChange={onChange}
      />
    );
    expect(screen.getByRole('group', { name: 'Takes allowed' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unlimited' }));
    expect(onChange).toHaveBeenLastCalledWith({
      recording: { ...DEFAULT_RECORDING_CONFIG, takeLimit: null },
    });
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onChange).toHaveBeenLastCalledWith({
      recording: { ...DEFAULT_RECORDING_CONFIG, takeLimit: 3 },
    });
  });

  it('points both duration fields at their hint text', () => {
    render(
      <RecordingConfigSection question={withRecording()} onChange={vi.fn()} />
    );
    const hintFor = (label: string) => {
      const id =
        screen.getByLabelText(label).getAttribute('aria-describedby') ?? '';
      return document.getElementById(id)?.textContent ?? '';
    };
    expect(hintFor('Thinking time')).toMatch(
      /Seconds before the recorder arms/
    );
    expect(hintFor('Recording limit')).toMatch(/Hard stop for one take/);
  });

  it('marks the active take limit as pressed', () => {
    render(
      <RecordingConfigSection
        question={withRecording({ takeLimit: 2 })}
        onChange={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: '2' }).getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('shows the ceiling and names the mode instead of clamping silently', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection
        question={withRecording({ limitSeconds: 420 })}
        onChange={onChange}
      />
    );
    const limit = screen.getByLabelText<HTMLInputElement>('Recording limit');
    expect(limit.value).toBe('300');
    expect(limit.readOnly).toBe(true);
    expect(screen.getByText(/Capped at 300s — audio's limit/)).toBeTruthy();
    // Nothing was written until the teacher accepted the new ceiling.
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Set to 300s' }));
    expect(onChange).toHaveBeenCalledWith({
      recording: { ...DEFAULT_RECORDING_CONFIG, limitSeconds: 300 },
    });
  });
});

describe('RecordingConfigSection — question types', () => {
  it.each(['short', 'essay'] as const)(
    'offers the controls on a %s question',
    (type) => {
      render(
        <RecordingConfigSection
          question={question({ type })}
          onChange={vi.fn()}
        />
      );
      expect(screen.getByLabelText('Ask for a spoken answer')).toBeTruthy();
      expect(
        screen.queryByText(/short-answer and essay questions/i)
      ).toBeNull();
    }
  );

  it.each(['MC', 'FIB', 'Matching', 'Ordering'] as const)(
    'advises instead of offering the controls on a %s question',
    (type) => {
      render(
        <RecordingConfigSection
          question={question({ type })}
          onChange={vi.fn()}
        />
      );
      expect(screen.queryByLabelText('Ask for a spoken answer')).toBeNull();
      expect(
        screen.getByText(/short-answer and essay questions/i)
      ).toBeTruthy();
    }
  );

  it('lets the teacher clear a block left behind by a type change', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection
        question={{ ...withRecording(), type: 'MC' }}
        onChange={onChange}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Turn off the spoken answer here/i })
    );
    expect(onChange).toHaveBeenCalledWith({ recording: undefined });
  });
});
