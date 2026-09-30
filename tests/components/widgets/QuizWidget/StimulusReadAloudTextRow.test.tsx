/**
 * D12 read-aloud text row in the stimulus manager: extract, edit flips the
 * source to `edited`, clear removes both fields, and gating hides the row.
 */
import React, { useEffect, useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { QuizQuestion, QuizStimulus } from '@/types';
import type { QuizEditorController } from '@/components/widgets/QuizWidget/components/useQuizEditorState';

const { extractMock } = vi.hoisted(() => ({ extractMock: vi.fn() }));

vi.mock('@/utils/quizReadAloudApi', () => ({
  extractStimulusReadAloudText: extractMock,
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null, userDomain: null }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn() }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn(), showAlert: vi.fn() }),
}));

import { StimulusManagerPanel } from '@/components/widgets/QuizWidget/components/StimulusManagerPanel';

const question: QuizQuestion = {
  id: 'q1',
  timeLimit: 0,
  text: 'Q',
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
  stimulusIds: ['s1'],
};

let latest: QuizStimulus[] = [];

const Harness: React.FC<{
  initial: QuizStimulus[];
  readAloudAvailable?: boolean;
}> = ({ initial, readAloudAvailable = true }) => {
  const [stimuli, setStimuli] = useState(initial);
  useEffect(() => {
    latest = stimuli;
  }, [stimuli]);
  const state = {
    questions: [question],
    bankSlots: [],
    toggleStimulusOnSlot: vi.fn(),
    stimuli,
    addStimulus: (s: QuizStimulus) => setStimuli((p) => [...p, s]),
    updateStimulus: (id: string, updates: Partial<QuizStimulus>) =>
      setStimuli((p) => p.map((s) => (s.id === id ? { ...s, ...updates } : s))),
    deleteStimulus: vi.fn(),
    toggleStimulusOnQuestion: vi.fn(),
    setStimulusOnAllQuestions: vi.fn(),
  } as unknown as QuizEditorController;
  return (
    <StimulusManagerPanel
      state={state}
      readAloudAvailable={readAloudAvailable}
    />
  );
};

const pdf: QuizStimulus = {
  id: 's1',
  type: 'pdf',
  url: 'https://drive.google.com/file/d/abcdefghij123/view',
  driveFileId: 'abcdefghij123',
  label: 'Passage.pdf',
};

async function openRow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Expand stimulus' }));
  await user.click(screen.getByRole('button', { name: /Read-aloud text/ }));
}

beforeEach(() => {
  extractMock.mockReset();
});

describe('StimulusManagerPanel — read-aloud text row', () => {
  it('is hidden without the feature flag and for audio stimuli', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Harness initial={[pdf]} readAloudAvailable={false} />
    );
    await user.click(screen.getByRole('button', { name: 'Expand stimulus' }));
    expect(screen.queryByText('Read-aloud text')).toBeNull();
    unmount();
    render(
      <Harness
        initial={[{ ...pdf, type: 'audio', url: 'https://x.test/a.mp3' }]}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Expand stimulus' }));
    expect(screen.queryByText('Read-aloud text')).toBeNull();
  });

  it('extracts text from the Drive file and shows the PDF text badge', async () => {
    extractMock.mockResolvedValue({
      text: 'Once upon a time.',
      source: 'pdf-text',
    });
    const user = userEvent.setup();
    render(<Harness initial={[pdf]} />);
    await openRow(user);
    expect(screen.getByTestId('read-aloud-source-badge')).toHaveTextContent(
      'None'
    );
    await user.click(screen.getByRole('button', { name: 'Extract text' }));
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Read-aloud text' })
      ).toHaveValue('Once upon a time.')
    );
    expect(extractMock).toHaveBeenCalledWith({
      stimulusId: 's1',
      type: 'pdf',
      driveFileId: 'abcdefghij123',
    });
    expect(screen.getByTestId('read-aloud-source-badge')).toHaveTextContent(
      'PDF text'
    );
    expect(latest[0]).toMatchObject({
      readAloudText: 'Once upon a time.',
      readAloudSource: 'pdf-text',
    });
  });

  it('asks for manual entry when the server returns needs-manual', async () => {
    extractMock.mockResolvedValue({ text: '', source: 'needs-manual' });
    const user = userEvent.setup();
    render(<Harness initial={[pdf]} />);
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Extract text' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Couldn't extract text automatically/
    );
    expect(latest[0].readAloudText).toBeUndefined();
  });

  it('flips the source to Edited when the teacher types, and Clear removes both fields', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[{ ...pdf, readAloudText: 'Scanned', readAloudSource: 'ocr' }]}
      />
    );
    await openRow(user);
    expect(screen.getByTestId('read-aloud-source-badge')).toHaveTextContent(
      'OCR'
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Read-aloud text' }),
      ' words'
    );
    expect(latest[0]).toMatchObject({
      readAloudText: 'Scanned words',
      readAloudSource: 'edited',
    });
    expect(screen.getByTestId('read-aloud-source-badge')).toHaveTextContent(
      'Edited'
    );
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(latest[0].readAloudText).toBeUndefined();
    expect(latest[0].readAloudSource).toBeUndefined();
    expect(screen.getByTestId('read-aloud-source-badge')).toHaveTextContent(
      'None'
    );
    expect(
      screen.getByText('Leave empty on reading assessments.')
    ).toBeInTheDocument();
  });

  it('sends the url for pasted (non-Drive) images', async () => {
    extractMock.mockResolvedValue({ text: 'Sign text', source: 'ocr' });
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          {
            id: 's1',
            type: 'image',
            url: 'https://example.com/sign.png',
            label: 'sign',
          },
        ]}
      />
    );
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Extract text' }));
    await waitFor(() =>
      expect(extractMock).toHaveBeenCalledWith({
        stimulusId: 's1',
        type: 'image',
        url: 'https://example.com/sign.png',
      })
    );
  });
});
