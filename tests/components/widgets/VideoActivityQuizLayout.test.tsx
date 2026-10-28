import React, { useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { VideoActivityEditorModal } from '@/components/widgets/VideoActivityWidget/components/VideoActivityEditorModal';
import type { TimelineProps } from '@/components/widgets/VideoActivityWidget/components/Timeline';
import type { VideoActivityData, VideoActivityQuestion } from '@/types';

const flags = vi.hoisted(() => ({ quizLayout: true }));
const seekTo = vi.hoisted(() => vi.fn());

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'uid-test' },
    canAccessFeature: (id: string) =>
      id === 'va-quiz-alignment' ? flags.quizLayout : false,
  }),
}));

vi.mock('@/components/common/EditorWorkspace', () => ({
  EditorWorkspace: ({
    contextPane,
    detailPane,
    onSave,
  }: {
    contextPane: React.ReactNode;
    detailPane: React.ReactNode;
    onSave: () => void;
  }) => (
    <div>
      <div data-testid="context-pane">{contextPane}</div>
      <div data-testid="detail-pane">{detailPane}</div>
      <button onClick={onSave}>Save Activity</button>
    </div>
  ),
}));

// The YouTube player can't load in jsdom; the stub reports the playhead at 0:42.
vi.mock('@/components/widgets/VideoActivityWidget/components/Timeline', () => ({
  Timeline: ({ handleRef }: TimelineProps) => {
    useImperativeHandle(handleRef, () => ({
      seekTo,
      getCurrentTime: () => 42,
    }));
    return <div data-testid="timeline" />;
  },
}));

const mc = (
  over: Partial<VideoActivityQuestion> = {}
): VideoActivityQuestion => ({
  id: 'q1',
  text: 'What is mitosis?',
  type: 'MC',
  correctAnswer: 'Cell division',
  incorrectAnswers: ['Photosynthesis', 'Respiration'],
  timeLimit: 30,
  timestamp: 10,
  ...over,
});

const activity = (questions: VideoActivityQuestion[]): VideoActivityData => ({
  id: 'va-1',
  title: 'Cells',
  youtubeUrl: 'https://youtube.com/watch?v=abcdefghijk',
  questions,
  createdAt: 1,
  updatedAt: 2,
});

const renderEditor = (questions: VideoActivityQuestion[]) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <VideoActivityEditorModal
      isOpen
      activity={activity(questions)}
      onClose={vi.fn()}
      onSave={onSave}
      autosave={false}
    />
  );
  return onSave;
};

const saved = async (
  onSave: ReturnType<typeof vi.fn>
): Promise<VideoActivityQuestion[]> => {
  fireEvent.click(screen.getByRole('button', { name: 'Save Activity' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return (onSave.mock.calls[0][0] as VideoActivityData).questions;
};

describe('Video Activity editor on the Quiz layout', () => {
  beforeEach(() => {
    flags.quizLayout = true;
    seekTo.mockClear();
  });

  it('keeps the old editor when the flag is off', () => {
    flags.quizLayout = false;
    renderEditor([mc()]);
    expect(screen.getByText('Drag to reorder · click to edit')).toBeTruthy();
    expect(screen.queryByText('Time in video')).toBeNull();
  });

  it('drops the Settings tab with the flag on and keeps the saved behavior', async () => {
    const behavior = {
      sessionMode: 'student' as const,
      sessionOptions: { tabWarningsEnabled: false },
      attemptLimit: 3,
    };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VideoActivityEditorModal
        isOpen
        activity={activity([mc()])}
        behavior={behavior}
        onClose={vi.fn()}
        onSave={onSave}
        autosave={false}
      />
    );
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save Activity' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1]).toEqual(behavior);
  });

  it('keeps the Settings tab with the flag off', () => {
    flags.quizLayout = false;
    renderEditor([mc()]);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('lists questions with their time and shows the Quiz fields without Time Limit', () => {
    renderEditor([mc()]);
    expect(screen.getByText('00:10')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeTruthy();
    expect(screen.getByLabelText('Time in video')).toBeTruthy();
    expect(screen.queryByText(/Time Limit/i)).toBeNull();
    const types = [
      ...screen
        .getByRole('combobox', { name: 'Type' })
        .querySelectorAll('option'),
    ].map((o) => o.textContent);
    expect(types).toEqual(['Multiple Choice', 'Fill in the Blank']);
  });

  it('selecting a row seeks the video to the question', () => {
    renderEditor([mc(), mc({ id: 'q2', timestamp: 30, text: 'Second' })]);
    fireEvent.click(screen.getByText('Second'));
    expect(seekTo).toHaveBeenCalledWith(30);
  });

  it('saves prompt and option edits in the Video Activity shape', async () => {
    const onSave = renderEditor([mc()]);
    fireEvent.change(screen.getByPlaceholderText(/capital of France/), {
      target: { value: 'Edited prompt' },
    });
    fireEvent.change(screen.getByLabelText('Option B'), {
      target: { value: 'Light' },
    });
    const [q] = await saved(onSave);
    expect(q.text).toBe('Edited prompt');
    expect(q.correctAnswer).toBe('Cell division');
    expect(q.incorrectAnswers).toEqual(['Light', 'Respiration']);
    expect(q.timestamp).toBe(10);
  });

  it('turns on several correct answers as a Multi-Answer question', async () => {
    const onSave = renderEditor([mc()]);
    fireEvent.click(screen.getByLabelText('Multiple correct answers'));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Option B is correct' })
    );
    const [q] = await saved(onSave);
    expect(q.type).toBe('MA');
    expect(q.correctAnswer).toBe('Cell division|Photosynthesis');
    expect(q.incorrectAnswers).toEqual(['Respiration']);
  });

  it('switches to Fill in the Blank and stores other answers as acceptable variants', async () => {
    const onSave = renderEditor([mc()]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'FIB' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Enter the definitive answer'),
      {
        target: { value: 'mitosis' },
      }
    );
    fireEvent.click(screen.getByText(/^Add /));
    fireEvent.change(screen.getAllByRole('textbox').at(-1) as HTMLElement, {
      target: { value: 'cell division' },
    });
    const [q] = await saved(onSave);
    expect(q.type).toBe('FIB');
    expect(q.correctAnswer).toBe('mitosis');
    expect(q.incorrectAnswers).toEqual([]);
    expect(q.acceptableVariants).toEqual(['cell division']);
    expect(q).not.toHaveProperty('alternateAnswers');
  });

  it('Use current time moves the question to the playhead', async () => {
    const onSave = renderEditor([mc()]);
    fireEvent.click(screen.getByText('Use current time'));
    expect(screen.getByLabelText<HTMLInputElement>('Time in video').value).toBe(
      '00:42'
    );
    const [q] = await saved(onSave);
    expect(q.timestamp).toBe(42);
  });

  it('Use current time skips a second another question already uses', () => {
    renderEditor([mc(), mc({ id: 'q2', timestamp: 42, text: 'At 42' })]);
    fireEvent.click(screen.getByText('Use current time'));
    expect(screen.getByLabelText<HTMLInputElement>('Time in video').value).toBe(
      '00:43'
    );
  });

  it('Add puts a new question at the playhead', () => {
    renderEditor([mc()]);
    fireEvent.click(
      document.querySelector(
        '[data-tour="video-activity.editor-add-question"]'
      ) as HTMLElement
    );
    expect(screen.getByText('00:42')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Time in video').value).toBe(
      '00:42'
    );
  });

  it('Duplicate copies a question one second later', async () => {
    const onSave = renderEditor([
      mc({ targets: [{ id: 't1', kind: 'standard', label: 'S1' } as never] }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate question' }));
    const qs = await saved(onSave);
    expect(qs).toHaveLength(2);
    expect(qs[1]).toMatchObject({ text: 'What is mitosis?', timestamp: 11 });
    expect(qs[1].id).not.toBe(qs[0].id);
  });

  it('deletes checked questions in bulk', async () => {
    const onSave = renderEditor([
      mc(),
      mc({ id: 'q2', timestamp: 20 }),
      mc({ id: 'q3', timestamp: 30, text: 'Keep me' }),
    ]);
    fireEvent.click(screen.getByLabelText('Select question 1'));
    fireEvent.click(screen.getByLabelText('Select question 2'));
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const qs = await saved(onSave);
    expect(qs.map((q) => q.id)).toEqual(['q3']);
  });
});
