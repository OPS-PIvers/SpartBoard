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

  it('writes the default block and zeroes the speed-bonus clock on enable', () => {
    const onChange = vi.fn();
    render(
      <RecordingConfigSection question={question()} onChange={onChange} />
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
