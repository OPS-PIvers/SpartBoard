/**
 * RR-10 sub-decision 7: every authored control must be shown to reach a
 * runtime code path that reads it. Each case authors through the real
 * section, projects the question the way the session does, and drives the
 * real student-side reader — closing the editor→runtime loop that the Video
 * Activity `shuffleAnswerOptions` toggle never closed.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import '@/i18n';
import { RecordingConfigSection } from './RecordingConfigSection';
import { toPublicQuestion } from '@/hooks/useQuizSession';
import {
  useAudioRecording,
  type AudioRecordingDeps,
} from '@/hooks/useAudioRecording';
import { takesRemaining } from '@/config/quizRecordingDefaults';
import type { QuizQuestion, RecordingConfig } from '@/types';

const baseQuestion = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'q1',
  timeLimit: 45,
  text: 'Explain your reasoning.',
  type: 'free-response',
  correctAnswer: '',
  incorrectAnswers: [],
  ...over,
});

/**
 * Mirrors `useQuizEditorState.updateQuestion`: merge the partial, and let an
 * explicit `undefined` delete the key.
 */
function applyUpdates(
  question: QuizQuestion,
  updates: Partial<QuizQuestion>
): QuizQuestion {
  const next = { ...question, ...updates } as Record<string, unknown>;
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) delete next[key];
  }
  return next as unknown as QuizQuestion;
}

/** Renders the real section and returns the question the teacher authored. */
function author(
  seed: QuizQuestion,
  interact: () => void
): { question: QuizQuestion; config: RecordingConfig } {
  let question = seed;
  let rerender: ((ui: React.ReactElement) => void) | null = null;
  const view = (q: QuizQuestion) => (
    <RecordingConfigSection
      question={q}
      onChange={(updates) => {
        question = applyUpdates(question, updates);
        rerender?.(view(question));
      }}
    />
  );
  rerender = render(view(question)).rerender;
  interact();
  const projected = toPublicQuestion(question);
  return { question, config: projected.recording as RecordingConfig };
}

class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['a'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

let clock = 1_000_000;

function makeDeps(): AudioRecordingDeps {
  const track = { readyState: 'live', stop: vi.fn() };
  return {
    getStream: vi.fn(() =>
      Promise.resolve({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      } as unknown as MediaStream)
    ),
    createRecorder: vi.fn(() => new FakeRecorder() as unknown as MediaRecorder),
    isTypeSupported: () => true,
    now: () => clock,
  };
}

async function advanceAsync(ms: number) {
  await act(async () => {
    clock += ms;
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  clock = 1_000_000;
  vi.useFakeTimers();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:take');
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('authored recording controls reach a runtime reader', () => {
  it('projects the authored block onto the session question', () => {
    const { config } = author(baseQuestion(), () => {
      fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    });
    expect(config).toEqual({
      prepSeconds: 30,
      limitSeconds: 60,
      prepExpiry: 'armed',
      takeLimit: null,
    });
  });

  it('writes nothing onto a question with the block turned off', () => {
    const seed = baseQuestion();
    const { question } = author(seed, () => {
      fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
      fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    });
    expect('recording' in question).toBe(false);
    expect(question).toEqual(seed);
    expect(toPublicQuestion(question).recording).toBeUndefined();
  });

  it('keeps the authoring-only stash off the student payload', () => {
    const { question, config } = author(baseQuestion(), () => {
      fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
    });
    expect(question.recording?.priorTimeLimit).toBe(45);
    expect('priorTimeLimit' in config).toBe(false);
  });

  it('prepSeconds drives the student prep countdown', () => {
    const { config } = author(baseQuestion(), () => {
      fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
      fireEvent.change(screen.getByLabelText('Thinking time'), {
        target: { value: '8' },
      });
    });
    const { result } = renderHook(() =>
      useAudioRecording({ config, enabled: true, deps: makeDeps() })
    );
    expect(result.current.phase).toBe('prep');
    expect(result.current.prepSecondsLeft).toBe(8);
  });

  it('prepExpiry auto-start arms the recorder when prep runs out', async () => {
    const { config } = author(baseQuestion(), () => {
      fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
      fireEvent.change(screen.getByLabelText('Thinking time'), {
        target: { value: '3' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Start recording/ }));
    });
    expect(config.prepExpiry).toBe('auto-start');
    const { result } = renderHook(() =>
      useAudioRecording({ config, enabled: true, deps: makeDeps() })
    );
    await advanceAsync(3000);
    expect(result.current.phase).toBe('recording');
  });

  it('limitSeconds hard-stops the take at the authored value', async () => {
    const { config } = author(baseQuestion(), () => {
      fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
      fireEvent.change(screen.getByLabelText('Thinking time'), {
        target: { value: '0' },
      });
      fireEvent.change(screen.getByLabelText('Recording limit'), {
        target: { value: '10' },
      });
    });
    expect(config.limitSeconds).toBe(10);
    const { result } = renderHook(() =>
      useAudioRecording({ config, enabled: true, deps: makeDeps() })
    );
    await act(async () => {
      await result.current.start();
    });
    await advanceAsync(9000);
    expect(result.current.phase).toBe('recording');
    await advanceAsync(2000);
    expect(result.current.phase).toBe('reviewing');
  });

  it('takeLimit is what the student-side counter reads', () => {
    const { config } = author(baseQuestion(), () => {
      fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
      fireEvent.click(screen.getByRole('button', { name: '2' }));
    });
    expect(config.takeLimit).toBe(2);
    expect(takesRemaining(config, 0)).toBe(2);
    expect(takesRemaining(config, 2)).toBe(0);
  });

  it('an unlimited take limit leaves the counter unbounded', () => {
    const { config } = author(baseQuestion(), () => {
      fireEvent.click(screen.getByLabelText('Ask for a spoken answer'));
      fireEvent.click(screen.getByRole('button', { name: '2' }));
      fireEvent.click(screen.getByRole('button', { name: 'Unlimited' }));
    });
    expect(config.takeLimit).toBeNull();
    expect(takesRemaining(config, 99)).toBeNull();
  });
});
